#!/usr/bin/env node
//
// Source-only RED probe for T-011 / AC-016.
//
// This probe imports the real technical-retry inspection consumer and the real
// lifecycle first-receipt writer through disposable export-only seams.  The
// observations below are synthetic Source fixtures: no OMP/SDK process, model,
// network, shell, Native receipt, or production write is used.  The `native:
// true` input only selects the host-authority branch under test; the output is
// explicitly fixture-only and never claims a Native observation.
//
// The canonical host observer fixture is intentionally kept as a positive
// control.  Negative cases remove or invalidate only the authoritative host
// receipt while retaining semantic terminal and task-record evidence.  They
// assert the consumer-visible eligibility and, for the first attempt, the
// actual pre-receipt write gate used by lifecycle.mjs.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_RETRY_SOURCE = path.join(SOURCE_DIR, "technical-retry-scenario.mjs");
const DEFAULT_LIFECYCLE_SOURCE = path.join(SOURCE_DIR, "lifecycle.mjs");
const DEFAULT_ROOT = path.resolve(SOURCE_DIR, "../../.test-temp/round2-retry-host-authority-red");
const TEST_FILE = "implementation-evidence/native-release/round2-retry-host-authority-red-probe.mjs";
const CLASSIFICATION = "VALID_FINDING:AC-016:technical-retry-host-authority-consumer";
const CONTRACT_VERSION = "0.6.0";
const COMMAND = "node app/.omp/state/native-tooling/retry-check.mjs";
const RUN_ID = "round2-retry-host-authority-source-run";
const ASSIGNMENT_ID = "round2-retry-host-authority-source-assignment";
const REVISION = "round2-retry-host-authority-source-revision";
const NONCE = "round2-retry-host-authority-source-nonce";
const FIRST_ASSIGNMENT = "Native09TechnicalRetryValidatorFirst";
const SECOND_ASSIGNMENT = "Native09TechnicalRetryValidatorSecond";
const ROOT_SESSION = "source-fixture-root-session";
const ROOT_PROMPT = "source-fixture-root-prompt";
const A_SHA = "a".repeat(64);
const B_SHA = "b".repeat(64);
const C_SHA = "c".repeat(64);
const D_SHA = "d".repeat(64);


function parseArgs(argv) {
  const values = new Map();
  const allowed = new Set(["retry-source", "lifecycle-source", "root"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`unknown argument: --${key}`);
    if (values.has(key)) throw new Error(`duplicate argument: --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    values.set(key, value);
    index += 1;
  }
  return {
    retrySource: path.resolve(values.get("retry-source") ?? DEFAULT_RETRY_SOURCE),
    lifecycleSource: path.resolve(values.get("lifecycle-source") ?? DEFAULT_LIFECYCLE_SOURCE),
    root: path.resolve(values.get("root") ?? DEFAULT_ROOT),
  };
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

function assertRegular(file, label) {
  const stat = fs.lstatSync(file);
  assert.equal(stat.isSymbolicLink(), false, `${label} must not be a symbolic link`);
  assert.equal(stat.isFile(), true, `${label} must be a regular file`);
}

function appendMissingExports(sourceText, names) {
  const exports = new Set();
  for (const match of sourceText.matchAll(/\bexport\s*\{([\s\S]*?)\}/g)) {
    for (const name of match[1].split(",")) {
      const exported = name.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(exported)) exports.add(exported);
    }
  }
  for (const match of sourceText.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) exports.add(match[1]);
  const missing = names.filter((name) => !exports.has(name));
  return missing.length
    ? `${sourceText}\n\n// Temporary export-only seam; never part of the product.\nexport { ${missing.join(", ")} };\n`
    : sourceText;
}

function makeSeams(options) {
  assertRegular(options.retrySource, "technical-retry source");
  assertRegular(options.lifecycleSource, "lifecycle source");
  const seamRoot = path.join(options.root, "source-overlay");
  const seamDir = path.join(seamRoot, "implementation-evidence", "native-release");
  const deepReviewDir = path.join(seamRoot, "deep-review", "lib");
  fs.mkdirSync(seamDir, { recursive: true });
  fs.mkdirSync(deepReviewDir, { recursive: true });

  const retrySeam = path.join(seamDir, "technical-retry-scenario.mjs");
  const lifecycleSeam = path.join(seamDir, "lifecycle.mjs");
  const protocolSource = path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs");
  assertRegular(protocolSource, "deep-review protocol source");
  const protocolSeam = path.join(deepReviewDir, "protocol.mjs");

  fs.writeFileSync(retrySeam, fs.readFileSync(options.retrySource, "utf8"), "utf8");
  fs.writeFileSync(
    lifecycleSeam,
    appendMissingExports(fs.readFileSync(options.lifecycleSource, "utf8"), ["writeTechnicalRetryFirstReceipt"]),
    "utf8",
  );
  fs.writeFileSync(protocolSeam, fs.readFileSync(protocolSource, "utf8"), "utf8");
  return { retrySeam, lifecycleSeam };
}

async function loadConsumers(options) {
  const seams = makeSeams(options);
  const suffix = `?round2_retry_host_authority_red=${Date.now()}`;
  const [retry, lifecycle] = await Promise.all([
    import(`${pathToFileURL(seams.retrySeam).href}${suffix}`),
    import(`${pathToFileURL(seams.lifecycleSeam).href}${suffix}`),
  ]);
  assert.equal(typeof retry.inspectTechnicalRetryScenario, "function", "retry seam must expose inspectTechnicalRetryScenario");
  assert.equal(typeof lifecycle.writeTechnicalRetryFirstReceipt, "function", "lifecycle seam must expose the real first-receipt writer");
  return { retry, lifecycle };
}

function retryDefinition(cwd) {
  return {
    contract: CONTRACT_VERSION,
    scenario_id: "NATIVE09-TECHNICAL-RETRY-QUALITY-CLI",
    evidence_level: "SOURCE_DERIVED_OFFLINE_CONSUMER_ONLY",
    native: false,
    run_id: RUN_ID,
    assignment_id: ASSIGNMENT_ID,
    revision: REVISION,
    nonce: NONCE,
    cwd,
    command: COMMAND,
    workload: {
      run_id: RUN_ID,
      assignment_id: ASSIGNMENT_ID,
      revision: REVISION,
      source: "app/bin/quality.mjs",
      test: "synthetic source-only host authority fixture",
    },
    roles: {
      first_validator: { name: FIRST_ASSIGNMENT, role: "validator" },
      second_validator: { name: SECOND_ASSIGNMENT, role: "validator" },
      backend_repair: { name: "Native09TechnicalRetryBackendDeveloper" },
    },
    immutable_original: { subjects: { cli: { sha256: A_SHA } } },
    mutable_application: {
      before_hashes: {
        subject: { sha256: A_SHA },
        dependency: { sha256: B_SHA },
        validator: { sha256: C_SHA },
      },
    },
    write_policy: { allowed_write_globs: ["app/bin/quality.mjs"] },
    paths: { interface_contract: path.join(cwd, "private-interface-contract.json") },
  };
}

function reportFor(definition, label, first) {
  return first
    ? {
      status: "FAIL",
      failure_origin: "SOLUTION",
      nonce: definition.nonce,
      assignment_id: definition.assignment_id,
      revision: definition.revision,
      run_id: definition.run_id,
      workload: definition.workload,
      actual: { observed: "source fixture failure" },
      expected: { observed: "source fixture repair" },
      label,
    }
    : {
      status: "PASS",
      nonce: definition.nonce,
      assignment_id: definition.assignment_id,
      revision: definition.revision,
      run_id: definition.run_id,
      workload: definition.workload,
      label,
    };
}

function waitRecord({ definition, label, first, rootSession, dispatchId, allocatedId, jobId, instanceId, hostOrdinal }) {
  const assignment = first ? FIRST_ASSIGNMENT : SECOND_ASSIGNMENT;
  const structuredData = {
    protocol_mode: "SOURCE_FIXTURE_TERMINAL",
    status: first ? "FAIL" : "PASS",
    assignment,
    revision: definition.revision,
  };
  return {
    source_kind: "task_wait_result",
    id: allocatedId,
    allocated_id: allocatedId,
    parent_tool_call_id: dispatchId,
    index: 0,
    root_session_id: rootSession,
    agent: "validator",
    agentSource: "project",
    assignment_id: assignment,
    run_id: definition.run_id,
    jobId,
    instanceId,
    status: "completed",
    isError: null,
    is_error_observed: false,
    is_error_source: null,
    exitCode: null,
    exit_code_observed: false,
    error: null,
    error_observed: false,
    aborted: null,
    aborted_observed: false,
    structured_data: structuredData,
    structured_output_status: "valid",
    host_workflow_ordinal: hostOrdinal,
    wait_result: {
      source: "tool_execution_end.result.details.jobs",
      tool: "wait",
      tool_call_id: `${label}-wait-tool-call`,
      host_workflow_ordinal: hostOrdinal,
      is_error: false,
      is_error_observed: true,
      job: {
        id: jobId,
        type: "task",
        status: "completed",
        structured: { source: "agent", mode: "strict", status: "valid", data: structuredData },
      },
      host_binding: {
        source: "observed-root-dispatch-lifecycle",
        root_session_id: rootSession,
        parent_tool_call_id: dispatchId,
        allocated_id: allocatedId,
        index: 0,
        agent: "validator",
        agentSource: "project",
        assignment,
        assignment_id: assignment,
        job_id: jobId,
        instance_id: instanceId,
        root_task_end_is_error: false,
      },
    },
  };
}

function terminalFor({ definition, first, rootSession, dispatchId, allocatedId, jobId, instanceId, toolCallId, startSequence, endSequence, hostOrdinal }) {
  const assignment = first ? FIRST_ASSIGNMENT : SECOND_ASSIGNMENT;
  const report = reportFor(definition, first ? "first-source-failure" : "second-source-pass", first);
  return {
    nested_event_type: "tool_execution_end",
    isError: first,
    is_error_source: "tool_execution_end",
    ...(first ? { exit_code: 17, exit_code_observed: true } : { exit_code_observed: false }),
    report,
    assignment_id: definition.assignment_id,
    dispatch_assignment_name: assignment,
    run_id: definition.run_id,
    revision: definition.revision,
    attempt: first ? 1 : 2,
    job_id: jobId,
    instance_id: instanceId,
    public_id: allocatedId,
    dispatch_id: dispatchId,
    root_session_id: rootSession,
    tool_call_id: toolCallId,
    parent_tool_call_id: dispatchId,
    start_sequence: startSequence,
    sequence: endSequence,
    host_workflow_ordinal: hostOrdinal,
    command: { command_label: COMMAND },
    correlation: { status: "matched", tool_call_id: toolCallId },
    observed: { present: true, source: "source-fixture-terminal" },
  };
}

function canonicalObservation(definition, first) {
  const label = first ? "first" : "second";
  const rootSession = `${ROOT_SESSION}-${label}`;
  const dispatchId = `source-${label}-dispatch`;
  const allocatedId = `source-${label}-allocated`;
  const jobId = `source-${label}-job`;
  const instanceId = `source-${label}-instance`;
  const toolCallId = `source-${label}-tool`;
  const startSequence = first ? 10 : 40;
  const endSequence = startSequence + 2;
  const hostOrdinal = endSequence;
  const dispatchOrdinal = startSequence - 1;
  const waitOrdinal = endSequence + 1;
  const terminal = terminalFor({
    definition,
    first,
    rootSession,
    dispatchId,
    allocatedId,
    jobId,
    instanceId,
    toolCallId,
    startSequence,
    endSequence,
    hostOrdinal,
  });
  const dispatch = {
    dispatch_id: dispatchId,
    allocated_id: allocatedId,
    job_id: jobId,
    instance_id: instanceId,
    attempt: first ? 1 : 2,
  };
  const tool = {
    tool_call_id: toolCallId,
    parent_tool_call_id: dispatchId,
    start_sequence: startSequence,
    end_sequence: endSequence,
    start_workflow_ordinal: startSequence,
    end_workflow_ordinal: endSequence,
  };
  return {
    native: true,
    native_process_count: 1,
    fixture_provenance: "SOURCE_SYNTHETIC_ONLY",
    origin: {
      kind: "host-observed-native-rpc",
      source: "source-synthetic-host-observer",
      process_observed: true,
      native_rpc: true,
      source_binding: true,
      process_count: 1,
    },
    transport_match: true,
    terminal_end: terminal,
    task_records: [waitRecord({ definition, label, first, rootSession, dispatchId, allocatedId, jobId, instanceId, hostOrdinal: waitOrdinal })],
    host: {
      provenance: "lifecycle-host-adapter-v1",
      actualRoot: rootSession,
      root_session: rootSession,
      root_prompt: `${ROOT_PROMPT}-${label}`,
      dispatch,
      dispatch_event: { host_workflow_ordinal: dispatchOrdinal },
      tool,
      host_observation: { source: "source-synthetic-host-observer", root_session: rootSession, label },
    },
    command_results: [
      {
        command_label: COMMAND,
        phase: "start",
        nested_event_type: "tool_execution_start",
        correlation: { tool_call_id: toolCallId },
      },
      {
        command_label: COMMAND,
        phase: "end",
        nested_event_type: "tool_execution_end",
        correlation: { tool_call_id: toolCallId },
        allocated_id: allocatedId,
        job_id: jobId,
        instance_id: instanceId,
      },
    ],
  };
}

function pairedObservation(definition, { firstHost = "valid", secondHost = "valid" } = {}) {
  const first = canonicalObservation(definition, true);
  const second = canonicalObservation(definition, false);
  const alterHost = (observation, mode) => {
    if (mode === "invalid") {
      observation.host.provenance = "forged-source-host-receipt";
      return;
    }
    if (mode === "missing") {
      // Keep only the dispatch IDs needed by taskCompletionBinding.  The
      // authoritative host receipt itself (origin/provenance/tool/ordinals/
      // root/prompt) is absent, so semantic/task evidence remains otherwise
      // valid while nativeHostObservationBinding must reject it.
      observation.host = { dispatch: { ...observation.host.dispatch } };
    }
  };
  alterHost(first, firstHost);
  alterHost(second, secondHost);
  return { native: true, definition, first, second };
}

function receiptPath(definition) {
  return path.join(definition.cwd, ".omp", "state", "native09-technical-retry", "first-terminal-receipt.json");
}

function writerContract() {
  return {
    relative_path: "private-interface-contract.json",
    version: CONTRACT_VERSION,
    sha256: D_SHA,
    bytes: 1,
  };
}

function assertHostDiagnostic(result, label, prefix) {
  assert.equal(result.failures.some((item) => item.startsWith(prefix)), true, `${label} must retain the host-authority failure diagnostic`);
  assert.equal(result.failures.length > 0, true, `${label} must retain an overall failure diagnostic`);
}

function assertSemanticAndTaskEvidenceRemainValid(result, label, side) {
  assert.equal(result[side].check.ok, true, `${label} must retain a semantically valid ${side} terminal`);
  assert.equal(result.failures.some((item) => item.startsWith(`${side}_task_`)), false, `${label} must retain an authoritative ${side} task record`);
}

function assertFirstReceiptBlocked(consumers, definition, observation, projection, label) {
  const target = receiptPath(definition);
  assert.equal(fs.existsSync(target), false, `${label} must start without a first-terminal receipt`);
  assert.throws(
    () => consumers.lifecycle.writeTechnicalRetryFirstReceipt(
      definition,
      { fixture_provenance: "SOURCE_SYNTHETIC_ONLY" },
      observation,
      writerContract(),
      projection,
      true,
    ),
    (error) => error?.kind === "BLOCKED",
    `${label} must block the lifecycle pre-receipt write gate when host authority is invalid or missing`,
  );
  assert.equal(fs.existsSync(target), false, `${label} must not write an authorized first-terminal receipt`);
}

async function executeCase(results, name, run) {
  try {
    const evidence = await run();
    results.push({ name, classification: CLASSIFICATION, status: "PASS", evidence });
  } catch (error) {
    results.push({
      name,
      classification: CLASSIFICATION,
      status: "FAIL",
      failure_reason_expected: isAssertionFailure(error),
      error: safeError(error),
    });
  }
}

async function withCaseRoot(options, run) {
  const caseRoot = fs.mkdtempSync(path.join(options.root, "case-"));
  try {
    return await run(caseRoot);
  } finally {
    fs.rmSync(caseRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.root, { recursive: true });
  const consumers = await loadConsumers(options);
  fs.rmSync(path.join(options.root, "source-overlay"), { recursive: true, force: true });
  const results = [];

  await executeCase(results, "canonical Source fixture keeps valid first and second host observer eligibility", () => withCaseRoot(options, (caseRoot) => {
    const definition = retryDefinition(caseRoot);
    const result = consumers.retry.inspectTechnicalRetryScenario(pairedObservation(definition));
    assertSemanticAndTaskEvidenceRemainValid(result, "canonical host observer", "first");
    assertSemanticAndTaskEvidenceRemainValid(result, "canonical host observer", "second");
    assert.equal(result.first.eligible, true, "a canonical authoritative first host receipt must remain eligible");
    assert.equal(result.second.eligible, true, "a canonical authoritative second host receipt must remain eligible");
    assert.equal(result.failures.some((item) => item.startsWith("first_host_")), false, "canonical first host evidence must not produce a host failure");
    assert.equal(result.failures.some((item) => item.startsWith("second_host_")), false, "canonical second host evidence must not produce a host failure");
    return { first_eligible: result.first.eligible, second_eligible: result.second.eligible, overall_failures: result.failures };
  }));

  await executeCase(results, "invalid first host receipt makes first eligibility false before receipt write", () => withCaseRoot(options, (caseRoot) => {
    const definition = retryDefinition(caseRoot);
    const observation = pairedObservation(definition, { firstHost: "invalid" });
    const result = consumers.retry.inspectTechnicalRetryScenario(observation);
    assertSemanticAndTaskEvidenceRemainValid(result, "invalid first host receipt", "first");
    assert.equal(result.first.eligible, false, "invalid authoritative first host receipt must not authorize first eligibility");
    assertHostDiagnostic(result, "invalid first host receipt", "first_host_");
    assertFirstReceiptBlocked(consumers, definition, observation.first, result, "invalid first host receipt");
    return { first_eligible: result.first.eligible, write_blocked: true, failures: result.failures };
  }));

  await executeCase(results, "missing first host receipt makes first eligibility false before receipt write", () => withCaseRoot(options, (caseRoot) => {
    const definition = retryDefinition(caseRoot);
    const observation = pairedObservation(definition, { firstHost: "missing" });
    const result = consumers.retry.inspectTechnicalRetryScenario(observation);
    assertSemanticAndTaskEvidenceRemainValid(result, "missing first host receipt", "first");
    assert.equal(result.first.eligible, false, "missing authoritative first host receipt must not authorize first eligibility");
    assertHostDiagnostic(result, "missing first host receipt", "first_host_");
    assertFirstReceiptBlocked(consumers, definition, observation.first, result, "missing first host receipt");
    return { first_eligible: result.first.eligible, write_blocked: true, failures: result.failures };
  }));

  await executeCase(results, "invalid second host receipt makes second eligibility false and retains diagnostic", () => withCaseRoot(options, (caseRoot) => {
    const definition = retryDefinition(caseRoot);
    const result = consumers.retry.inspectTechnicalRetryScenario(pairedObservation(definition, { secondHost: "invalid" }));
    assertSemanticAndTaskEvidenceRemainValid(result, "invalid second host receipt", "second");
    assert.equal(result.second.eligible, false, "invalid authoritative second host receipt must not authorize second eligibility");
    assertHostDiagnostic(result, "invalid second host receipt", "second_host_");
    return { second_eligible: result.second.eligible, retry_authorized: false, failures: result.failures };
  }));

  await executeCase(results, "missing second host receipt makes second eligibility false and retains diagnostic", () => withCaseRoot(options, (caseRoot) => {
    const definition = retryDefinition(caseRoot);
    const result = consumers.retry.inspectTechnicalRetryScenario(pairedObservation(definition, { secondHost: "missing" }));
    assertSemanticAndTaskEvidenceRemainValid(result, "missing second host receipt", "second");
    assert.equal(result.second.eligible, false, "missing authoritative second host receipt must not authorize second eligibility");
    assertHostDiagnostic(result, "missing second host receipt", "second_host_");
    return { second_eligible: result.second.eligible, retry_authorized: false, failures: result.failures };
  }));

  const expectedFailures = results.filter((item) => item.status === "FAIL" && item.failure_reason_expected === true);
  const unexpectedFailures = results.filter((item) => item.status === "FAIL" && item.failure_reason_expected !== true);
  const output = {
    status: unexpectedFailures.length || expectedFailures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "round2-retry-host-authority-red",
    task: "T-011",
    acceptance_criteria: ["AC-016"],
    evidence_level: "SOURCE_DERIVED_OFFLINE_CONSUMER_ONLY",
    native_claim: false,
    source_fixture_only: true,
    source: {
      retry_path: options.retrySource,
      lifecycle_path: options.lifecycleSource,
    },
    criteria_to_tests: {
      "AC-016": results.map((item) => `${TEST_FILE}::${item.name}`),
    },
    cases: results.length,
    cases_run: results,
    harness: {
      expected_red_classification: CLASSIFICATION,
      expected_failures: expectedFailures.map((item) => item.name),
      unexpected_failures: unexpectedFailures.map((item) => item.name),
      failure_reason_expected: unexpectedFailures.length === 0 && expectedFailures.length > 0,
      command: "node implementation-evidence/native-release/round2-retry-host-authority-red-probe.mjs",
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (unexpectedFailures.length) {
    const error = new Error("retry host-authority RED probe encountered an unexpected setup/runtime failure");
    error.name = "ProbeHarnessError";
    error.code = "ERR_PROBE_UNEXPECTED_FAILURE";
    error.probe = output;
    throw error;
  }
  if (expectedFailures.length) {
    const error = new Error("retry host-authority assertions failed as expected");
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
