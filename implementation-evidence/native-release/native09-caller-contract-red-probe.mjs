#!/usr/bin/env node
//
// Behavioral RED probe for AC-013 / NATIVE-09 caller preparation.
//
// The probe imports the real prepareTechnicalRetryScenario consumer through a
// disposable export-only source seam. It prepares a fresh private project from
// the supplied ORIGINAL191 snapshot, parses the generated private JSON contract,
// and uses that parsed contract to invoke the copied quality CLI. No OMP/SDK,
// model, network, Git, installed package, or repository source is touched.
//
// The backend task's exact task wording and no-other-command/write sequence are
// intentionally not asserted here: those are lifecycle observations, not
// behavior that can be tested without a source-string tautology. The companion
// backend command probe owns those observed command/write invariants.

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_RETRY_SOURCE = path.join(SOURCE_DIR, "technical-retry-scenario.mjs");
const DEFAULT_ROOT = path.resolve(SOURCE_DIR, "../../.test-temp/native09-caller-contract-red");
const DEFAULT_SNAPSHOT = "C:/Users/Ricar/AppData/Local/Temp/usefulskills-audit-CdmZsI/original191-hash-recovered-oXEAkR";
const DEFAULT_MANIFEST = "C:/Users/Ricar/.omp/agent/sessions/--D--Projects-UsefulSkills--/2026-11-10T11-16-20-010Z_01a1c52c-57aa-7533-ba19-90c694eb489f/local/audit-manifest.json";
const EXPECTED_RETRY_SOURCE_SHA256 = "9d3bd7c5b324cbccddf6a33fec4c223b71238386d85346b1276436a4cb89b8a2";
const CONTRACT_VERSION = "0.6.0";
const TEST_FILE = "implementation-evidence/native-release/native09-caller-contract-red-probe.mjs";
const EXPECTED_CLASSIFICATION = "VALID_FINDING:AC-013:native09-caller-interface-contract-consumer";
const ALLOWED_WRITE_GLOBS = Object.freeze(["app/bin/quality.mjs"]);
const EMPTY_INVENTORY_DIGEST = "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";
const CONTRACT_CASES = Object.freeze([
  "valid_empty_root",
  "valid_nonempty_root",
  "invalid_extra_empty",
  "invalid_extra_nonempty",
]);
const SHA256 = /^[a-f0-9]{64}$/i;

function parseArgs(argv) {
  const allowed = new Set(["retry-source", "root", "snapshot", "manifest", "expected-retry-sha"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`unknown option --${key}`);
    if (values.has(key)) throw new Error(`duplicate option --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    values.set(key, value);
    index += 1;
  }
  return {
    retrySource: path.resolve(values.get("retry-source") ?? DEFAULT_RETRY_SOURCE),
    root: path.resolve(values.get("root") ?? DEFAULT_ROOT),
    snapshot: path.resolve(values.get("snapshot") ?? DEFAULT_SNAPSHOT),
    manifest: path.resolve(values.get("manifest") ?? DEFAULT_MANIFEST),
    expectedRetrySha: values.get("expected-retry-sha") ?? EXPECTED_RETRY_SOURCE_SHA256,
  };
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value), "utf8"));
}

function safeError(error) {
  return {
    name: error?.name ?? "Error",
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };
}

function isAssertionFailure(error) {
  return error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
}

function makeExportOnlySeam(options) {
  fs.mkdirSync(options.root, { recursive: true });
  const sourceHash = sha256File(options.retrySource);
  assert.equal(sourceHash, options.expectedRetrySha, "technical-retry source must match the explicit RED probe pin");
  const seamDir = path.join(options.root, "source-overlay", "implementation-evidence", "native-release");
  fs.mkdirSync(seamDir, { recursive: true });
  const sourceText = fs.readFileSync(options.retrySource, "utf8");
  const seamPath = path.join(seamDir, "technical-retry-scenario.mjs");
  const hasExport = /export\s*\{[^}]*\bprepareTechnicalRetryScenario\b[^}]*\}/s.test(sourceText);
  const seamText = hasExport
    ? sourceText
    : `${sourceText}\n\n// TEMP export-only seam; never part of the product.\nexport { prepareTechnicalRetryScenario };\n`;
  fs.writeFileSync(seamPath, seamText, "utf8");
  return { seamPath, sourceHash };
}

async function loadScenarioBuilder(options) {
  const seam = makeExportOnlySeam(options);
  const module = await import(`${pathToFileURL(seam.seamPath).href}?probe=native09-caller-contract-red`);
  assert.equal(typeof module.prepareTechnicalRetryScenario, "function", "export-only seam must expose prepareTechnicalRetryScenario");
  return { ...seam, prepareTechnicalRetryScenario: module.prepareTechnicalRetryScenario };
}

function prepareScenario(builder, options) {
  assert.ok(fs.statSync(options.snapshot).isDirectory(), "ORIGINAL191 snapshot must be a directory");
  assert.ok(fs.statSync(options.manifest).isFile(), "ORIGINAL191 audit manifest must be a regular file");
  const caseRoot = fs.mkdtempSync(path.join(options.root, "case-"));
  const projectRoot = path.join(caseRoot, "private-project");
  fs.mkdirSync(projectRoot);
  const context = {
    runId: "native09-caller-contract-red-run",
    assignmentId: "native09-caller-contract-red-assignment",
    revision: "native09-caller-contract-red-revision",
    nonce: "native09-caller-contract-red-nonce",
    projectRoot,
    originalSnapshotRoot: options.snapshot,
    originalAuditManifest: options.manifest,
  };
  const manifestBefore = sha256File(options.manifest);
  const definition = builder.prepareTechnicalRetryScenario(context);
  assert.equal(sha256File(options.manifest), manifestBefore, "preparation must not mutate the ORIGINAL191 manifest");
  assert.equal(
    sha256File(definition.paths.subject),
    definition.mutable_application.before_hashes.subject.sha256,
    "preparation must preserve the original audited subject bytes before any backend repair",
  );
  assert.equal(definition.contract, CONTRACT_VERSION, "technical retry definition must retain contract 0.6.0");
  assert.equal(definition.run_id, context.runId, "definition must retain the requested run identity");
  assert.equal(definition.assignment_id, context.assignmentId, "definition must retain the requested assignment identity");
  assert.equal(definition.revision, context.revision, "definition must retain the requested revision");
  return { caseRoot, projectRoot, context, definition };
}

function interfaceContractPath(definition) {
  const raw = definition.paths?.interface_contract;
  assert.equal(typeof raw, "string", "prepareTechnicalRetryScenario must expose definition.paths.interface_contract");
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(definition.cwd, raw);
}

function parseInterfaceContract(definition) {
  const contractPath = interfaceContractPath(definition);
  assert.equal(fs.existsSync(contractPath), true, "prepareTechnicalRetryScenario must generate its private JSON interface contract");
  const stat = fs.lstatSync(contractPath);
  assert.equal(stat.isFile(), true, "generated interface contract must be a regular file");
  assert.equal(stat.isSymbolicLink(), false, "generated interface contract must not be a symlink");
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  } catch (error) {
    assert.fail(`generated interface contract must be readable JSON: ${error?.message ?? error}`);
  }
  assert.ok(contract && typeof contract === "object" && !Array.isArray(contract), "parsed interface contract must be an object");
  return { contractPath, contract };
}

function assertContractMetadata(definition, parsed) {
  const { contract } = parsed;
  assert.equal(contract.contract, definition.contract, "private interface contract version must match definition.contract");
  assert.equal(contract.contract, CONTRACT_VERSION, "private interface contract must use contract 0.6.0");
  assert.equal(contract.run_id, definition.run_id, "private interface contract must bind the exact run");
  assert.equal(contract.assignment_id, definition.assignment_id, "private interface contract must bind the exact assignment");
  assert.equal(contract.revision, definition.revision, "private interface contract must bind the exact revision");
  assert.equal(typeof contract.cli?.source, "string", "private interface contract must expose the CLI source");
  const resolvedSource = path.resolve(definition.cwd, contract.cli.source);
  assert.equal(resolvedSource, path.resolve(definition.paths.subject), "contract CLI source must resolve to the prepared subject");
  assert.deepEqual(contract.write_policy?.allowed_write_globs, ALLOWED_WRITE_GLOBS, "private interface contract must expose exactly app/bin/quality.mjs as the write allowlist");

  const argv = contract.cli?.argv;
  assert.ok(argv && typeof argv === "object" && !Array.isArray(argv), "private interface contract must expose per-case CLI argv");
  assert.deepEqual(Object.keys(argv).sort(), [...CONTRACT_CASES].sort(), "contract CLI argv must cover exactly the four retry cases");
  for (const name of CONTRACT_CASES) {
    assert.ok(Array.isArray(argv[name]), `${name} CLI argv must be an array`);
    assert.equal(argv[name].every((item) => typeof item === "string"), true, `${name} CLI argv must contain strings only`);
  }
  assert.deepEqual(argv.valid_empty_root, ["capture", "<empty-private-root>"], "empty inventory argv must name capture and the empty private root");
  assert.deepEqual(argv.valid_nonempty_root, ["capture", "<nonempty-private-root>"], "nonempty inventory argv must name capture and the nonempty private root");
  assert.deepEqual(argv.invalid_extra_empty, ["capture", "<empty-private-root>", ""], "empty extra argv must preserve an actually empty extra argument");
  assert.deepEqual(argv.invalid_extra_nonempty, ["capture", "<empty-private-root>", "unexpected-extra"], "nonempty extra argv must preserve a distinct extra argument");

  const expectations = contract.cli?.expectations;
  assert.ok(expectations && typeof expectations === "object" && !Array.isArray(expectations), "private interface contract must expose CLI outcome expectations");
  assert.deepEqual(Object.keys(expectations).sort(), [...CONTRACT_CASES].sort(), "contract CLI expectations must cover exactly the four retry cases");
  assert.deepEqual(expectations.valid_empty_root, {
    exit_code: 0,
    output: { type: "exact_inventory", files: {}, digest: EMPTY_INVENTORY_DIGEST },
  }, "empty-root contract must require an exact empty inventory");
  assert.deepEqual(expectations.valid_nonempty_root, {
    exit_code: 0,
    output: { type: "exact_inventory", files: "actual-file-hash-map", digest: "sha256-json-files" },
  }, "nonempty-root contract must require the exact dynamic file inventory and digest");
  assert.deepEqual(expectations.invalid_extra_empty, {
    exit_code: "nonzero",
    output: { type: "structured_usage_rejection", ok: false, errors: "nonempty-string-array" },
  }, "empty extra-argument contract must require a structured usage rejection");
  assert.deepEqual(expectations.invalid_extra_nonempty, {
    exit_code: "nonzero",
    output: { type: "structured_usage_rejection", ok: false, errors: "nonempty-string-array" },
  }, "nonempty extra-argument contract must require a structured usage rejection");
}

function resolveContractArg(value, roots) {
  if (value === "<empty-private-root>") return roots.empty;
  if (value === "<nonempty-private-root>") return roots.nonempty;
  return value;
}

function invokeContractCli(definition, contract, name, roots) {
  const source = path.resolve(definition.cwd, contract.cli.source);
  const argv = contract.cli.argv[name].map((value) => resolveContractArg(value, roots));
  const child = spawnSync(process.execPath, [source, ...argv], {
    cwd: definition.cwd,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !["NODE_OPTIONS", "BASH_ENV", "ENV"].includes(key))),
  });
  const parse = (text) => {
    try {
      const value = JSON.parse(String(text ?? "").trim());
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  };
  return { argv, child, payload: parse(child.stdout) ?? parse(child.stderr) };
}

function assertExactInventory(run, expectation, expectedFiles, label) {
  assert.equal(run.child.error, undefined, `${label} CLI must start without a process error`);
  assert.equal(run.child.signal, null, `${label} CLI must not be terminated by a signal`);
  assert.equal(run.child.status, expectation.exit_code, `${label} CLI must return the contract exit code`);
  assert.equal(expectation.output.type, "exact_inventory", `${label} contract must describe exact inventory semantics`);
  assert.deepEqual(run.payload && Object.keys(run.payload).sort(), ["digest", "files"], `${label} CLI must return only the inventory envelope`);
  assert.deepEqual(run.payload.files, expectedFiles, `${label} CLI must preserve the exact observed file inventory`);
  assert.equal(run.payload.digest, sha256Text(JSON.stringify(expectedFiles)), `${label} CLI must hash the exact observed file inventory`);
}

function assertOriginalEmptyExtraContractViolation(run, expectation, label) {
  assert.equal(run.child.error, undefined, `${label} CLI must start without a process error`);
  assert.equal(run.child.signal, null, `${label} CLI must not be terminated by a signal`);
  assert.equal(expectation.exit_code, "nonzero", `${label} contract must require a nonzero exit`);
  assert.equal(expectation.output.type, "structured_usage_rejection", `${label} contract must require structured usage rejection`);
  assert.equal(run.child.status, 0, `${label} original audited CLI must expose the known eligible contract violation before backend repair`);
  assert.deepEqual(run.payload && Object.keys(run.payload).sort(), ["digest", "files"], `${label} original violation must be an accepted inventory, not a setup error`);
  assert.deepEqual(run.payload.files, {}, `${label} original violation must preserve the exact empty inventory`);
  assert.equal(run.payload.digest, EMPTY_INVENTORY_DIGEST, `${label} original violation must preserve the empty inventory digest`);
  return {
    contract_expectation: expectation,
    observed_original_behavior: {
      exit_code: run.child.status,
      payload: run.payload,
      violation: "empty extra positional argument was accepted by ORIGINAL191",
    },
  };
}

function assertStructuredUsageRejection(run, expectation, label) {
  assert.equal(run.child.error, undefined, `${label} CLI must start without a process error`);
  assert.equal(run.child.signal, null, `${label} CLI must not be terminated by a signal`);
  assert.equal(Number.isInteger(run.child.status), true, `${label} CLI must expose an integer exit status`);
  assert.notEqual(run.child.status, 0, `${label} CLI must reject the extra positional argument`);
  assert.equal(expectation.exit_code, "nonzero", `${label} contract must require a nonzero exit`);
  assert.equal(expectation.output.type, "structured_usage_rejection", `${label} contract must describe structured usage rejection semantics`);
  assert.equal(run.payload?.ok, expectation.output.ok, `${label} CLI must return the structured rejection flag`);
  assert.equal(Array.isArray(run.payload?.errors), true, `${label} CLI must return an errors array`);
  assert.equal(run.payload.errors.length > 0, true, `${label} CLI must return at least one usage error`);
  assert.equal(run.payload.errors.every((item) => typeof item === "string" && item.length > 0), true, `${label} CLI errors must be non-empty strings`);
}

function consumeParsedContract(definition, parsed, caseRoot) {
  const { contract } = parsed;
  const emptyRoot = path.join(caseRoot, "empty-private-root");
  const nonemptyRoot = path.join(caseRoot, "nonempty-private-root");
  fs.mkdirSync(emptyRoot);
  fs.mkdirSync(nonemptyRoot);
  const probeBytes = Buffer.from("native09-contract-probe-file\n", "utf8");
  fs.writeFileSync(path.join(nonemptyRoot, "probe.txt"), probeBytes, { flag: "wx", mode: 0o600 });
  const expectedFiles = { "probe.txt": sha256Bytes(probeBytes) };
  const roots = { empty: emptyRoot, nonempty: nonemptyRoot };
  const expectations = contract.cli.expectations;
  const runs = Object.fromEntries(CONTRACT_CASES.map((name) => [name, invokeContractCli(definition, contract, name, roots)]));

  assertExactInventory(runs.valid_empty_root, expectations.valid_empty_root, {}, "valid empty-root capture");
  assertExactInventory(runs.valid_nonempty_root, expectations.valid_nonempty_root, expectedFiles, "valid nonempty-root capture");
  const emptyExtraViolation = assertOriginalEmptyExtraContractViolation(
    runs.invalid_extra_empty,
    expectations.invalid_extra_empty,
    "empty extra-argument capture",
  );
  assertStructuredUsageRejection(runs.invalid_extra_nonempty, expectations.invalid_extra_nonempty, "nonempty extra-argument capture");
  assert.equal(runs.invalid_extra_empty.argv.at(-1), "", "the empty extra case must really pass an empty argument");
  assert.equal(runs.invalid_extra_nonempty.argv.at(-1), "unexpected-extra", "the nonempty extra case must really pass a nonempty argument");
  return {
    runs,
    expectedFiles,
    subject_sha256_before: definition.mutable_application.before_hashes.subject.sha256,
    subject_sha256_after_prepare: sha256File(definition.paths.subject),
    empty_extra_contract_violation: emptyExtraViolation,
  };
}

async function executeCase(results, name, run) {
  try {
    const value = await run();
    results.push({ name, classification: EXPECTED_CLASSIFICATION, status: "PASS", ...(value && typeof value === "object" ? { evidence: value } : {}) });
  } catch (error) {
    results.push({
      name,
      classification: EXPECTED_CLASSIFICATION,
      status: "FAIL",
      failure_reason_expected: isAssertionFailure(error),
      error: safeError(error),
    });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const builder = await loadScenarioBuilder(options);
  const prepared = prepareScenario(builder, options);
  const results = [];
  await executeCase(results, "generated private contract is parsed, identity-bound, CLI-bound, and allowlist-exact", () => {
    const parsed = parseInterfaceContract(prepared.definition);
    assertContractMetadata(prepared.definition, parsed);
    return { contract_path: parsed.contractPath, contract: parsed.contract };
  });
  await executeCase(results, "parsed contract preserves the original empty-extra violation while requiring post-repair structured rejection", () => {
    const parsed = parseInterfaceContract(prepared.definition);
    assertContractMetadata(prepared.definition, parsed);
    return consumeParsedContract(prepared.definition, parsed, prepared.caseRoot);
  });

  const expectedFailures = results.filter((item) => item.status === "FAIL" && item.failure_reason_expected === true);
  const unexpectedFailures = results.filter((item) => item.status === "FAIL" && item.failure_reason_expected !== true);
  const output = {
    status: unexpectedFailures.length || expectedFailures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "native09-caller-contract-red",
    source: { path: options.retrySource, sha256: builder.sourceHash },
    fixtures_root: prepared.caseRoot,
    criteria_to_tests: {
      "AC-013": results.map((item) => `${TEST_FILE}::${item.name}`),
    },
    cases: results.length,
    cases_run: results,
    task_scope_limit: "Backend task wording/wiring for exact pre-write/post-fix command sequence and no-other-write/command policy is not behaviorally testable here without source-string assertions; lifecycle command evidence remains a separate probe.",
    harness: {
      expected_red_classification: EXPECTED_CLASSIFICATION,
      expected_failures: expectedFailures.map((item) => item.name),
      unexpected_failures: unexpectedFailures.map((item) => item.name),
      failure_reason_expected: unexpectedFailures.length === 0 && expectedFailures.length > 0,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (unexpectedFailures.length) {
    const error = new Error("native09 caller contract RED harness found an unexpected setup/runtime failure");
    error.name = "ProbeHarnessError";
    error.code = "ERR_PROBE_UNEXPECTED_FAILURE";
    error.probe = output;
    throw error;
  }
  if (expectedFailures.length) {
    const error = new Error("native09 caller contract assertions failed as expected");
    error.name = "AssertionError";
    error.code = "ERR_ASSERTION";
    error.probe = output;
    throw error;
  }
}

main().catch((error) => {
  const probe = error?.probe;
  process.stderr.write(`${JSON.stringify({ ...(probe ?? {}), error: safeError(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
