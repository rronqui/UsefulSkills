#!/usr/bin/env node
// Source-only RED consumer regression for T-011 / AC-016.
//
// The probe loads the current lifecycle source through an owned temporary
// export-only seam and calls inspectNative directly. It never starts OMP/SDK,
// invokes a model, uses a network or Git command, changes runtime settings, or
// edits the checkout. Every synthetic event is a bounded host-shaped fixture;
// the assertions consume inspectNative().root_reads rather than source text or
// implementation wiring.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_SOURCE = path.join(SOURCE_DIR, "lifecycle.mjs");
const SHA256 = /^[a-f0-9]{64}$/i;
const REVISION = "1".repeat(64);
const ACTUAL_RECEIPT_PATHS = Object.freeze([
  ".omp/state/secrets-receipt.json",
  ".omp/state/dependencies-receipt.json",
]);
const OBSOLETE_RECEIPT_PATHS = Object.freeze([
  ".omp/state/native10-secrets-receipt.json",
  ".omp/state/native10-dependencies-receipt.json",
]);
const MISSING_RECEIPT_PATH = ".omp/state/native10-review-receipt.json";
const EXPECTED_CLASSIFICATION = "VALID_FINDING:AC-016:native10-root-receipt-read-consumer";
const TEST_FILE = "implementation-evidence/native-release/native10-root-receipt-read-red-probe.mjs";

function parseArgs(argv) {
  const allowed = new Set(["source", "root", "expected-source-sha"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`unknown option --${key}`);
    if (values.has(key)) throw new Error(`duplicate option: --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    values.set(key, value);
    index += 1;
  }
  const expectedSourceSha = values.get("expected-source-sha");
  const root = values.get("root");
  if (!expectedSourceSha || !SHA256.test(expectedSourceSha)) throw new Error("--expected-source-sha must be a SHA-256");
  if (!root) throw new Error("--root is required; all fixtures must remain below it");
  return {
    source: path.resolve(values.get("source") ?? DEFAULT_SOURCE),
    root: path.resolve(root),
    expectedSourceSha: expectedSourceSha.toLowerCase(),
  };
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}


function sourceGuard(options) {
  const bytes = fs.readFileSync(options.source);
  const observed = sha256Bytes(bytes);
  assert.equal(observed, options.expectedSourceSha, "probe must bind to the supplied current lifecycle source bytes");
  return { path: options.source, bytes: bytes.byteLength, sha256: observed };
}

function makeExportOnlySeam(options) {
  const seamDir = path.join(options.root, "source-overlay", "implementation-evidence", "native-release");
  const protocolDir = path.join(options.root, "source-overlay", "deep-review", "lib");
  fs.mkdirSync(seamDir, { recursive: true });
  fs.mkdirSync(protocolDir, { recursive: true });
  sourceGuard(options);
  const seam = path.join(seamDir, "lifecycle.seam.mjs");
  fs.writeFileSync(
    seam,
    `${fs.readFileSync(options.source, "utf8")}\n\n// TEMP export-only seam; never part of the product.\nexport { inspectNative };\n`,
    "utf8",
  );
  fs.copyFileSync(path.join(SOURCE_DIR, "technical-retry-scenario.mjs"), path.join(seamDir, "technical-retry-scenario.mjs"));
  fs.copyFileSync(path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs"), path.join(protocolDir, "protocol.mjs"));
  return seam;
}

async function loadApis(options) {
  const seam = makeExportOnlySeam(options);
  const module = await import(`${pathToFileURL(seam).href}?source_sha=${options.expectedSourceSha}`);
  assert.equal(typeof module.inspectNative, "function", "the export-only seam must expose the actual inspectNative consumer");
  return module;
}

function fixture(fixturesRoot, label) {
  const project = path.join(fixturesRoot, label);
  const receiptDirectory = path.join(project, ".omp", "state");
  fs.mkdirSync(receiptDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(receiptDirectory, "secrets-receipt.json"),
    Buffer.from('{"receipt":"secrets","version":1}\n', "utf8"),
  );
  fs.writeFileSync(
    path.join(receiptDirectory, "dependencies-receipt.json"),
    Buffer.from('{"receipt":"dependencies","version":1}\n', "utf8"),
  );
  return {
    project,
    logicalRunId: `native10-root-receipt-${label}`,
  };
}

function sourceFile(project, relativePath) {
  const bytes = fs.readFileSync(path.join(project, relativePath));
  return { path: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}

function rootTaskStart(sequence = 100) {
  return {
    type: "tool_execution_start",
    tool: "task",
    tool_call_id: "root-task-dispatch",
    sequence,
  };
}

function matchedReadCorrelation(toolCallId, relativePath) {
  return {
    status: "matched",
    tool_call_id: toolCallId,
    scope: "Root",
    requested_paths: [relativePath],
    path_resolution: "host-confined-project-filesystem-or-managed-skill-uri",
  };
}

function readStart(toolCallId, relativePath, sequence) {
  return {
    type: "tool_execution_start",
    tool: "read",
    tool_call_id: toolCallId,
    paths: [relativePath],
    requested_paths: [relativePath],
    sequence,
  };
}

function readEnd(toolCallId, relativePath, sequence, options = {}) {
  const end = {
    type: "tool_execution_end",
    tool: "read",
    tool_call_id: toolCallId,
    paths: [relativePath],
    requested_paths: [relativePath],
    path_resolution: "host-confined-project-filesystem-or-managed-skill-uri",
    sequence,
    is_error: options.isError ?? false,
    result: { content: [] },
  };
  if (options.correlation !== false) end.read_correlation = matchedReadCorrelation(toolCallId, relativePath);
  if (options.sourceFiles !== undefined) end.source_files = options.sourceFiles;
  return end;
}

function successfulRead(project, relativePath, toolCallId, startSequence, endSequence) {
  return [
    readStart(toolCallId, relativePath, startSequence),
    readEnd(toolCallId, relativePath, endSequence, { sourceFiles: [sourceFile(project, relativePath)] }),
  ];
}

function successfulSearch(tool, toolCallId, relativePath, startSequence, endSequence) {
  return [
    {
      type: "tool_execution_start",
      tool,
      tool_call_id: toolCallId,
      paths: [relativePath],
      sequence: startSequence,
    },
    {
      type: "tool_execution_end",
      tool,
      tool_call_id: toolCallId,
      paths: [relativePath],
      sequence: endSequence,
      is_error: false,
      result: { content: [] },
    },
  ];
}

function inspectionEvidence(toolEvents) {
  return {
    task_calls: [],
    tool_events: toolEvents,
    task_records: [],
    capture: { complete: true },
    terminal: null,
    command_results: [],
    subagent_reads: [],
    subagent_writes: [],
    root_writes: [],
  };
}

function inspect(apis, fixtureInfo, toolEvents) {
  return apis.inspectNative(inspectionEvidence(toolEvents), fixtureInfo, REVISION, null);
}

function rowFor(result, relativePath) {
  assert.ok(Array.isArray(result?.root_reads), "inspectNative must return root_reads");
  return result.root_reads.find((row) => row?.path === relativePath) ?? null;
}

function assertReceiptPathSet(result) {
  const actual = result.root_reads
    .filter((row) => ACTUAL_RECEIPT_PATHS.includes(row?.path))
    .map((row) => row.path)
    .sort();
  assert.deepEqual(actual, [...ACTUAL_RECEIPT_PATHS].sort(), "root_reads must consume the two actual receipt paths");
  assert.equal(
    result.root_reads.some((row) => OBSOLETE_RECEIPT_PATHS.includes(row?.path)),
    false,
    "root_reads must not retain the absent native10-prefixed receipt names",
  );
}

function assertObserved(result, relativePath, startSequence) {
  const row = rowFor(result, relativePath);
  assert.ok(row, `root_reads must retain a row for ${relativePath}`);
  assert.equal(row.sequence, startSequence, `successful ${relativePath} inspection must expose its pre-fanout START sequence`);
}

function assertUnknown(result, relativePath, reason) {
  const row = rowFor(result, relativePath);
  assert.ok(row, `root_reads must retain an unknown row for ${relativePath}`);
  assert.equal(row.sequence, null, `${reason}: ${relativePath} must remain unknown rather than accepting a START attempt`);
}

function assertMissingUnknown(result) {
  const row = rowFor(result, MISSING_RECEIPT_PATH);
  assert.ok(row, "minimal fixture must preserve an actually missing required path as an unknown row");
  assert.equal(row.sequence, null, "an absent unrelated required path must remain unknown");
}

function actualReceiptReadsAcceptMatchedSuccessfulReadEnds(apis, fixturesRoot) {
  const fixtureInfo = fixture(fixturesRoot, "read-success");
  const secrets = successfulRead(fixtureInfo.project, ACTUAL_RECEIPT_PATHS[0], "read-secrets-success", 1, 2);
  const dependencies = successfulRead(fixtureInfo.project, ACTUAL_RECEIPT_PATHS[1], "read-dependencies-success", 3, 4);

  // The source_files rows are the valid read-time receipt metadata. A later
  // fixture mutation must not make an already captured read END unknown.
  fs.writeFileSync(path.join(fixtureInfo.project, ACTUAL_RECEIPT_PATHS[0]), Buffer.from("mutated-after-read\n", "utf8"));
  const result = inspect(apis, fixtureInfo, [...secrets, ...dependencies, rootTaskStart(20)]);
  assertReceiptPathSet(result);
  assertObserved(result, ACTUAL_RECEIPT_PATHS[0], 1);
  assertObserved(result, ACTUAL_RECEIPT_PATHS[1], 3);
  assertMissingUnknown(result);
}

function grepAndGlobOnlyDoNotQualify(apis, fixturesRoot) {
  const fixtureInfo = fixture(fixturesRoot, "search-only");
  const grep = successfulSearch("grep", "grep-secrets-only", ACTUAL_RECEIPT_PATHS[0], 1, 2);
  const glob = successfulSearch("glob", "glob-dependencies-only", ACTUAL_RECEIPT_PATHS[1], 3, 4);
  const result = inspect(apis, fixtureInfo, [...grep, ...glob, rootTaskStart(20)]);

  // grep/glob remain permitted Root tools, but a search-only END is not a
  // content-read proof for the mandatory receipt paths.
  assertReceiptPathSet(result);
  assertUnknown(result, ACTUAL_RECEIPT_PATHS[0], "grep-only inspection");
  assertUnknown(result, ACTUAL_RECEIPT_PATHS[1], "glob-only inspection");
}

function startOnlyAndFailedEndsRemainUnknown(apis, fixturesRoot) {
  const fixtureInfo = fixture(fixturesRoot, "start-or-failed");
  const startOnly = [readStart("read-secrets-start-only", ACTUAL_RECEIPT_PATHS[0], 1)];
  const failed = [
    readStart("read-dependencies-failed", ACTUAL_RECEIPT_PATHS[1], 3),
    readEnd("read-dependencies-failed", ACTUAL_RECEIPT_PATHS[1], 4, {
      isError: true,
      sourceFiles: [],
    }),
  ];
  const result = inspect(apis, fixtureInfo, [...startOnly, ...failed, rootTaskStart(20)]);

  assertReceiptPathSet(result);
  assertUnknown(result, ACTUAL_RECEIPT_PATHS[0], "START-only read");
  assertUnknown(result, ACTUAL_RECEIPT_PATHS[1], "failed read END");
}

function foreignAndLateEndsDoNotQualify(apis, fixturesRoot) {
  const fixtureInfo = fixture(fixturesRoot, "foreign-or-late");
  const nameMismatch = readEnd("read-secrets-owned", ACTUAL_RECEIPT_PATHS[0], 3, {
    sourceFiles: [sourceFile(fixtureInfo.project, ACTUAL_RECEIPT_PATHS[0])],
  });
  nameMismatch.tool = "grep";
  const foreign = [
    readStart("read-secrets-owned", ACTUAL_RECEIPT_PATHS[0], 1),
    readEnd("read-secrets-foreign", ACTUAL_RECEIPT_PATHS[0], 2, {
      sourceFiles: [sourceFile(fixtureInfo.project, ACTUAL_RECEIPT_PATHS[0])],
    }),
    nameMismatch,
  ];
  const late = [
    readStart("read-dependencies-owned", ACTUAL_RECEIPT_PATHS[1], 4),
    rootTaskStart(10),
    readEnd("read-dependencies-owned", ACTUAL_RECEIPT_PATHS[1], 11, {
      sourceFiles: [sourceFile(fixtureInfo.project, ACTUAL_RECEIPT_PATHS[1])],
    }),
  ];
  const result = inspect(apis, fixtureInfo, [...foreign, ...late]);

  assertReceiptPathSet(result);
  assertUnknown(result, ACTUAL_RECEIPT_PATHS[0], "foreign tool-call END");
  assertUnknown(result, ACTUAL_RECEIPT_PATHS[1], "successful END after first Task START");
}

function readEndsRequireMatchedCorrelationAndValidSourceMetadata(apis, fixturesRoot) {
  const fixtureInfo = fixture(fixturesRoot, "read-validation");
  const missingCorrelation = [
    readStart("read-secrets-no-correlation", ACTUAL_RECEIPT_PATHS[0], 1),
    readEnd("read-secrets-no-correlation", ACTUAL_RECEIPT_PATHS[0], 2, {
      correlation: false,
      sourceFiles: [sourceFile(fixtureInfo.project, ACTUAL_RECEIPT_PATHS[0])],
    }),
  ];
  const bytes = sourceFile(fixtureInfo.project, ACTUAL_RECEIPT_PATHS[1]);
  const invalidMetadata = [
    readStart("read-dependencies-invalid-source", ACTUAL_RECEIPT_PATHS[1], 3),
    readEnd("read-dependencies-invalid-source", ACTUAL_RECEIPT_PATHS[1], 4, {
      sourceFiles: [{ ...bytes, bytes: -1, sha256: "invalid-sha256" }],
    }),
  ];
  const result = inspect(apis, fixtureInfo, [...missingCorrelation, ...invalidMetadata, rootTaskStart(20)]);

  assertReceiptPathSet(result);
  assertUnknown(result, ACTUAL_RECEIPT_PATHS[0], "read END without matched Root read_correlation");
  assertUnknown(result, ACTUAL_RECEIPT_PATHS[1], "read END with invalid source-file hash/size");
}

function packageRoleEligibilityUsesCallerNames(apis, fixturesRoot, includeNonApplicable) {
  const fixtureInfo = fixture(fixturesRoot, includeNonApplicable ? "non-applicable-callers" : "applicable-callers");
  const roles = [
    ["requirements-reader", "Native10RequirementsReader"], ["architect", "Native10Architect"],
    ["spec-kit-author", "Native10SpecKitAuthor"], ["deep-reviewer", "Native10DeepReviewer"],
    ["peer-reviewer", "Native10PeerReviewer"], ["validator", "Native10Validator"],
  ];
  const excluded = [
    ["host-operator", "Native10HostOperator"], ["test-author", "Native10TestAuthor"],
    ["backend-developer", "Native10BackendDeveloper"], ["frontend-developer", "Native10FrontendDeveloper"],
    ["refactorer", "Native10Refactorer"], ["integrator", "Native10Integrator"], ["validator", "Native10ValidatorFault"],
  ];
  const evidence = inspectionEvidence([]);
  evidence.task_calls = [{ kind: "dispatch", tool_call_id: "root-eligibility-dispatch",
    assignments: [...roles, ...(includeNonApplicable ? excluded : [])].map(([agent, name]) => ({ agent, name, task_sha256: REVISION })) }];
  const result = apis.inspectNative(evidence, fixtureInfo, REVISION, null);
  // The legacy consumer exposes this category in failures, not a typed code.
  // Check the accepted/rejected caller identities, not overall PASS: this
  // isolated fixture intentionally supplies no role terminals or approvals.
  const eligibilityFailures = result.failures.filter((reason) => /non-applicable/i.test(reason));
  if (includeNonApplicable) {
    for (const [, name] of excluded) assert.ok(eligibilityFailures.some((reason) => reason.includes(name)), `excluded package caller ${name} must remain rejected`);
  } else {
    assert.deepEqual(eligibilityFailures, [], "the six canonical Native10 callers must not be rejected as non-applicable package roles");
  }
}

function isAssertionFailure(error) {
  return error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
}

function safeError(error) {
  return {
    name: error?.name ?? "Error",
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };
}

function executeCase(results, failures, name, run) {
  try {
    run();
    results.push({ name, classification: EXPECTED_CLASSIFICATION, status: "PASS" });
  } catch (error) {
    const failure = {
      name,
      classification: EXPECTED_CLASSIFICATION,
      status: "FAIL",
      failure_reason_expected: isAssertionFailure(error),
      error: safeError(error),
    };
    failures.push(failure);
    results.push(failure);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.root, { recursive: true });
  const source = sourceGuard(options);
  const apis = await loadApis(options);
  const root = path.join(options.root, "cases");
  fs.mkdirSync(root, { recursive: true });
  const results = [];
  const failures = [];

  executeCase(results, failures, "actual receipt paths accept matched successful read ENDs before first Task START", () => actualReceiptReadsAcceptMatchedSuccessfulReadEnds(apis, root));
  executeCase(results, failures, "grep/glob-only inspection remains unknown without a successful read END", () => grepAndGlobOnlyDoNotQualify(apis, root));
  executeCase(results, failures, "START-only and failed read ENDs remain unknown", () => startOnlyAndFailedEndsRemainUnknown(apis, root));
  executeCase(results, failures, "foreign/name-mismatched ENDs and successful ENDs after first Task START remain unknown", () => foreignAndLateEndsDoNotQualify(apis, root));
  executeCase(results, failures, "read ENDs require matched Root correlation and valid source-file hash/size", () => readEndsRequireMatchedCorrelationAndValidSourceMetadata(apis, root));
  executeCase(results, failures, "canonical six-role callers are not falsely classified as non-applicable package roles", () => packageRoleEligibilityUsesCallerNames(apis, root, false));
  executeCase(results, failures, "non-applicable package callers remain rejected", () => packageRoleEligibilityUsesCallerNames(apis, root, true));

  const expectedFailures = failures.filter((failure) => failure.failure_reason_expected === true);
  const unexpectedFailures = failures.filter((failure) => failure.failure_reason_expected !== true);
  const output = {
    status: unexpectedFailures.length || expectedFailures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "native10-root-receipt-read-red",
    source,
    fixtures_root: root,
    criteria_to_tests: {
      "AC-016": results.map((item) => `${TEST_FILE}::${item.name}`),
    },
    cases: results.length,
    cases_run: results,
    harness: {
      expected_red_classification: EXPECTED_CLASSIFICATION,
      expected_failures: expectedFailures.map((failure) => failure.name),
      unexpected_failures: unexpectedFailures.map((failure) => failure.name),
      failure_reason_expected: unexpectedFailures.length === 0 && expectedFailures.length > 0,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (unexpectedFailures.length) {
    const error = new Error("source-only Native10 receipt-read RED harness found unexpected failures");
    error.name = "ProbeHarnessError";
    error.code = "ERR_PROBE_UNEXPECTED_FAILURE";
    error.probe = output;
    throw error;
  }
  if (expectedFailures.length) {
    const error = new Error("source-only Native10 receipt-read RED assertions failed as expected");
    error.name = "AssertionError";
    error.code = "ERR_ASSERTION";
    error.probe = output;
    throw error;
  }
}

main().catch((error) => {
  const probe = error?.probe ?? {
    status: "FAIL",
    phase: "RED",
    probe: "native10-root-receipt-read-red",
    failure_reason_expected: isAssertionFailure(error),
  };
  process.stderr.write(`${JSON.stringify({ ...probe, error: safeError(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
