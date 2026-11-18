#!/usr/bin/env node
// RED probe for the private peer-wire child execution witness.
//
// This probe imports the current fallback consumer through a temporary
// export-only seam, generates the real helper from fallback.mjs, executes that
// helper with Node in a bounded disposable project, and then drives the real
// RpcSession/validatePeerWireProbe consumer with recorded SDK-shaped frames.
// It never starts OMP, calls the SDK, uses a model, accesses the network, or
// mutates repository/source fixtures.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const REPO_ROOT = path.resolve(SOURCE_DIR, "../..");
const FALLBACK_SOURCE = path.join(SOURCE_DIR, "fallback.mjs");
const PROTOCOL_SOURCE = path.join(REPO_ROOT, "deep-review", "lib", "protocol.mjs");
const TEST_FILE = "implementation-evidence/native-release/peer-wire-child-exit-red-probe.mjs";
const PROBE_SCHEMA = "native05-peer-wire-probe-v1";
const REVISION = "a".repeat(40);

class ProbeSetupError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProbeSetupError";
    this.code = "PROBE_SETUP";
    this.details = details;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value) {
  return sha256(Buffer.from(JSON.stringify(value), "utf8"));
}

function samePath(left, right) {
  return path.resolve(String(left)).toLowerCase() === path.resolve(String(right)).toLowerCase();
}

function safeError(error) {
  return {
    name: error?.name ?? typeof error,
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };
}

function writeBytes(file, bytes) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return { path: file, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function writeText(file, text) {
  return writeBytes(file, Buffer.from(text, "utf8"));
}

function makeFallbackSeam(root) {
  const seamDirectory = path.join(root, "source-overlay", "implementation-evidence", "native-release");
  mkdirSync(seamDirectory, { recursive: true });
  const sourceBytes = readFileSync(FALLBACK_SOURCE);
  const seam = path.join(seamDirectory, "fallback.seam.mjs");
  writeText(
    seam,
    `${sourceBytes.toString("utf8")}\n\n// Temporary export-only seam; never part of the product.\nexport { RpcSession, createPeerWireProbeArtifacts, expectedReadSet, validatePeerWireProbe };\n`,
  );
  return { seam, sourceSha256: sha256(sourceBytes) };
}

async function loadConsumer(root) {
  const seam = makeFallbackSeam(root);
  const fallback = await import(`${pathToFileURL(seam.seam).href}?child_exit_red=${seam.sourceSha256}`);
  for (const name of ["RpcSession", "createPeerWireProbeArtifacts", "expectedReadSet", "validatePeerWireProbe"]) {
    assert.equal(typeof fallback[name], "function", `fallback seam must expose the real ${name} consumer`);
  }
  return { fallback, sourceSha256: seam.sourceSha256 };
}

function makeOwnedFixture(root, apis) {
  const projectRoot = path.join(root, "private-project");
  mkdirSync(path.join(projectRoot, ".omp", "state"), { recursive: true });
  mkdirSync(path.join(projectRoot, ".omp", "skills", "deep-review", "lib"), { recursive: true });
  mkdirSync(path.join(projectRoot, "src"), { recursive: true });

  const protocolPath = path.join(projectRoot, ".omp", "skills", "deep-review", "lib", "protocol.mjs");
  const protocolBytes = readFileSync(PROTOCOL_SOURCE);
  writeBytes(protocolPath, protocolBytes);
  writeText(path.join(projectRoot, ".omp", "config.yml"), "task:\n  disabledAgents:\n    - deep-reviewer\n");
  writeText(path.join(projectRoot, "src", "checkout-good.mjs"), "export const checkoutGood = true;\n");

  const diffPath = path.join(projectRoot, ".omp", "state", "t009c", "actual-diff.patch");
  const diff = writeText(diffPath, "diff --git a/src/checkout-good.mjs b/src/checkout-good.mjs\n");
  const receiptPath = path.join(projectRoot, ".omp", "state", "t009c", "git-source-receipt.json");
  const receipt = {
    schema: "git-fixture-receipt-v1",
    base_revision: "b".repeat(40),
    head_revision: REVISION,
    head_ref: "HEAD",
    diff_sha256: diff.sha256,
    files: ["src/checkout-good.mjs"],
    consumer_paths: ["src/checkout-good.mjs"],
  };
  writeText(receiptPath, `${JSON.stringify(receipt)}\n`);

  const fixture = {
    root: projectRoot,
    revision: REVISION,
    files: [],
  };
  const manifest = [];
  const probe = apis.fallback.createPeerWireProbeArtifacts(projectRoot, fixture);
  const canonicalArgs = [
    "--protocol", probe.protocolPath,
    "--valid", probe.validPath,
    "--malformed", probe.malformedPath,
    "--receipt", probe.receiptPath,
    "--revision", fixture.revision,
  ];
  const plannedChildArgv = [probe.helperPath, "--worker", ...canonicalArgs];
  const helperRecord = probe.files.find((entry) => samePath(entry.path, probe.helperPath));
  const protocolRecord = probe.files.find((entry) => samePath(entry.path, probe.protocolPath));
  assert.ok(helperRecord, "generated helper must have a bound probe.files record");
  assert.ok(protocolRecord, "canonical protocol consumer must have a bound probe.files record");
  return {
    projectRoot,
    fixture,
    manifest,
    probe,
    canonicalArgs,
    plannedChildArgv,
    helperRecord,
    protocolRecord,
    sourceFixture: {
      protocol: protocolPath,
      receipt: receiptPath,
      diff: diffPath,
      source_sha256: sha256(protocolBytes),
    },
  };
}

function runGeneratedHelper(control) {
  const run = spawnSync(process.execPath, [control.probe.helperPath, ...control.canonicalArgs], {
    cwd: control.projectRoot,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 65_536,
  });
  if (run.error) throw new ProbeSetupError("generated helper could not start", { error: safeError(run.error) });
  if (run.signal) throw new ProbeSetupError("generated helper was terminated by signal", { signal: run.signal });
  if (!Number.isInteger(run.status)) throw new ProbeSetupError("generated helper did not expose a bounded exit status", { status: run.status });
  let output;
  try {
    output = JSON.parse(String(run.stdout ?? "").trim());
  } catch (error) {
    throw new ProbeSetupError("generated helper did not emit JSON", {
      error: safeError(error),
      stdout_bytes: Buffer.byteLength(String(run.stdout ?? ""), "utf8"),
      stderr_bytes: Buffer.byteLength(String(run.stderr ?? ""), "utf8"),
    });
  }
  return { run, output };
}

function assertBaseHelperOutput(control, output) {
  assert.ok(output && typeof output === "object" && !Array.isArray(output), "generated helper output must be an object");
  assert.equal(output.schema, PROBE_SCHEMA, "generated helper must retain the private v1 schema");
  assert.equal(output.producer_malformed, false, "generated helper must retain producer_malformed:false");
  assert.equal(output.owned_input_origin, "controlled-local-fixture", "generated helper must retain owned fixture provenance");
  assert.equal(output.source?.sha256, control.protocolRecord.sha256, "generated helper must hash the copied canonical protocol consumer");
  assert.equal(output.expected?.reviewed_revision, control.fixture.revision, "generated helper must retain the receipt-bound revision");
  assert.equal(output.outcomes?.valid?.ok, true, "actual canonical consumer must accept the valid payload");
  assert.equal(output.outcomes?.malformed?.ok, false, "actual canonical consumer must reject the malformed payload");
  assert.equal(output.inputs?.valid?.sha256, control.probe.files.find((entry) => samePath(entry.path, control.probe.validPath))?.sha256, "valid input bytes/hash must survive helper execution");
  assert.equal(output.inputs?.malformed?.sha256, control.probe.files.find((entry) => samePath(entry.path, control.probe.malformedPath))?.sha256, "malformed input bytes/hash must survive helper execution");
}

function assertPlannedChildBinding(control) {
  assert.equal(control.probe.executable, process.execPath, "createPeerWireProbeArtifacts must expose the requested Node executable");
  assert.deepEqual(control.probe.child_argv, control.plannedChildArgv, "createPeerWireProbeArtifacts must expose the exact worker argv including --worker");
  assert.equal(control.probe.child_argv_sha256, sha256Json(control.plannedChildArgv), "createPeerWireProbeArtifacts must expose the exact worker argv hash");
}

function observedChildWitness(control, actualRun) {
  // The current RED source has no --worker branch yet.  The status/signal/error
  // below are from a real bounded Node execution of the owned generated helper;
  // the planned --worker argv/hash is retained as an explicitly labelled
  // counterfactual binding until the wrapper exists.
  const child = {
    origin: "observed-node-child",
    executable: process.execPath,
    script_path: control.probe.helperPath,
    script_sha256: control.helperRecord.sha256,
    argv_sha256: sha256Json(control.plannedChildArgv),
    exit_code: actualRun.status,
    exit_code_observed: Number.isInteger(actualRun.status),
    signal: actualRun.signal ?? null,
    signal_observed: actualRun.signal === null || typeof actualRun.signal === "string",
    spawn_error: actualRun.error ? {
      name: actualRun.error.name ?? null,
      code: actualRun.error.code ?? null,
    } : null,
  };
  return {
    label: "bounded-counterfactual-owned-node-child",
    actual_process: {
      executable: process.execPath,
      script_path: control.probe.helperPath,
      argv: [control.probe.helperPath, ...control.canonicalArgs],
      status: actualRun.status,
      signal: actualRun.signal ?? null,
      error: actualRun.error ? safeError(actualRun.error) : null,
    },
    child,
  };
}

function baseEvidence() {
  return {
    rpc: {},
    responses: [],
    calls: [],
    tool_events: [],
    task_calls: [],
    task_details: [],
    read_events: [],
    subagent_frames: [],
    native_progress_terminal: [],
    prompt_result: null,
    session_settled: false,
    probe_bash_start: null,
    probe_bash_end: null,
  };
}

function readStart(callId, rawPath) {
  return {
    type: "tool_execution_start",
    toolName: "read",
    toolCallId: callId,
    args: { path: rawPath },
  };
}

function readEnd(callId) {
  return {
    type: "tool_execution_end",
    toolName: "read",
    toolCallId: callId,
    isError: false,
    result: {
      content: [{ type: "text", text: "bounded owned fixture read\n" }],
    },
  };
}

function bashStart(callId, control) {
  return {
    type: "tool_execution_start",
    toolName: "bash",
    toolCallId: callId,
    args: {
      command: control.probe.command,
      cwd: control.probe.cwd,
    },
  };
}

function bashEnd(callId, output, outerExitCode) {
  const result = {
    content: [{ type: "text", text: JSON.stringify(output) }],
  };
  if (outerExitCode !== null) result.exitCode = outerExitCode;
  return {
    type: "tool_execution_end",
    toolName: "bash",
    toolCallId: callId,
    isError: false,
    result,
  };
}

function recordProbe(apis, control, output, outerExitCode) {
  const evidence = baseEvidence();
  const session = new apis.fallback.RpcSession({
    omp: "offline-child-exit-observability",
    cwd: control.projectRoot,
    env: {},
    timeoutMs: 1_000,
    evidence,
    probe: { command: control.probe.command, cwd: control.probe.cwd },
  });
  const expected = [...apis.fallback.expectedReadSet(
    control.projectRoot,
    control.fixture,
    control.manifest,
    control.probe.readPaths,
  )];
  for (const [index, expectedPath] of expected.entries()) {
    const callId = `child-exit-read-${index}`;
    session.consumeLogical(readStart(callId, expectedPath));
    session.consumeLogical(readEnd(callId));
  }
  const bashCallId = "child-exit-bash";
  session.consumeLogical(bashStart(bashCallId, control));
  session.consumeLogical(bashEnd(bashCallId, output, outerExitCode));
  session.consumeLogical({
    type: "prompt_result",
    id: "11111111-1111-4111-8111-111111111111",
    status: "completed",
    agentInvoked: true,
    sessionSettled: true,
  });
  session.consumeLogical({ type: "session_settled" });
  return { evidence, expected, bashCallId };
}

function expectBlocked(thunk, label) {
  let caught = null;
  try {
    thunk();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label} must reject the child witness`);
  assert.equal(caught.kind, "BLOCKED", `${label} must reject with the consumer BLOCKED contract`);
  return caught;
}

function validateRecorded(apis, control, recorded) {
  return apis.fallback.validatePeerWireProbe(
    recorded.evidence,
    control.projectRoot,
    control.fixture,
    control.manifest,
    control.probe,
  );
}

function assertChildWitnessShape(control, child) {
  assert.ok(child && typeof child === "object" && !Array.isArray(child), "child_execution must be an object");
  assert.equal(child.origin, "observed-node-child", "child_execution must identify observed Node-child provenance");
  assert.equal(child.executable, process.execPath, "child_execution must bind the requested Node executable");
  assert.ok(samePath(child.script_path, control.probe.helperPath), "child_execution must bind the owned generated helper path");
  assert.equal(child.script_sha256, control.helperRecord.sha256, "child_execution must bind the actual generated helper bytes");
  assert.equal(child.argv_sha256, sha256Json(control.plannedChildArgv), "child_execution must bind the planned worker argv hash");
  assert.equal(child.exit_code, 0, "successful child_execution must expose observed zero status");
  assert.equal(child.exit_code_observed, true, "successful child_execution must expose observed status");
  assert.equal(child.signal, null, "successful child_execution must expose null signal");
  assert.equal(child.signal_observed, true, "successful child_execution must expose observed null signal");
  assert.equal(child.spawn_error, null, "successful child_execution must expose null spawn error");
}

function assertGeneratedHelperEmitsWitness(control, generated) {
  assertBaseHelperOutput(control, generated.output);
  assert.ok(generated.output.child_execution, "generated helper must emit mandatory child_execution from its owned Node child");
  assertChildWitnessShape(control, generated.output.child_execution);
}

function assertArtifactProducerExposesBinding(control) {
  // This assertion is intentionally separate from the helper output assertion
  // so a missing producer witness is still an assertion RED, never setup.
  assertPlannedChildBinding(control);
  assert.equal(control.probe.files.find((entry) => samePath(entry.path, control.probe.helperPath))?.sha256, control.helperRecord.sha256, "probe.files must remain the source of the helper hash binding");
}

function assertMissingOuterExitAcceptsActualChild(apis, control, output, childFixture) {
  assertChildWitnessShape(control, childFixture.child);
  let result;
  assert.doesNotThrow(() => {
    const recorded = recordProbe(apis, control, { ...output, child_execution: childFixture.child }, null);
    result = validateRecorded(apis, control, recorded);
  }, "raw SDK isError:false without outer exit metadata must admit a valid independent child witness");
  assert.equal(result.bash_end.exit_code, null, "missing SDK outer exit must be recorded as null");
  assert.equal(result.bash_end.exit_code_observed, false, "missing SDK outer exit must be recorded as unobserved");
  assert.equal(result.bash_end.is_error, false, "raw SDK isError:false must remain observed");
  assert.equal(result.bash_end.is_error_observed, true, "raw SDK isError:false observation must remain explicit");
  assertChildWitnessShape(control, result.output.child_execution);
  assert.equal(result.output.outcomes.valid.ok, true, "valid canonical outcome must survive SDK END normalization");
  assert.equal(result.output.outcomes.malformed.ok, false, "malformed canonical outcome must survive SDK END normalization");
}

function invalidChildVariants(control, childFixture) {
  const child = childFixture.child;
  return [
    ["missing child_execution", (output) => {
      const next = { ...output };
      delete next.child_execution;
      return next;
    }],
    ["unobserved child status", (output) => ({
      ...output,
      child_execution: { ...child, exit_code: null, exit_code_observed: false },
    })],
    ["nonzero child status", (output) => ({
      ...output,
      child_execution: { ...child, exit_code: 7, exit_code_observed: true },
    })],
    ["signalled child", (output) => ({
      ...output,
      child_execution: { ...child, exit_code: null, exit_code_observed: false, signal: "SIGTERM", signal_observed: true },
    })],
    ["wrong child script binding", (output) => ({
      ...output,
      child_execution: { ...child, script_path: control.probe.protocolPath },
    })],
    ["wrong child argv binding", (output) => ({
      ...output,
      child_execution: { ...child, argv_sha256: "f".repeat(64) },
    })],
  ];
}


function assertOuterNonzeroNeverAccepted(apis, control, output, childFixture) {
  const recorded = (() => {
    try {
      return recordProbe(apis, control, { ...output, child_execution: childFixture.child }, 9);
    } catch (error) {
      // The old consumer may reject at RpcSession ingestion.  That remains a
      // valid fail-closed result; the implementation must never admit it.
      assert.equal(error.kind, "BLOCKED", "explicit SDK nonzero must fail closed with BLOCKED");
      return null;
    }
  })();
  if (recorded) {
    expectBlocked(
      () => validateRecorded(apis, control, recorded),
      "explicit SDK nonzero must never be accepted even with an observed child zero",
    );
  }
}

function runCase(results, name, polarity, run) {
  try {
    run();
    results.push({ name, case_ref: name, polarity, status: "PASS", failure_kind: null });
  } catch (error) {
    const assertionFailure = error?.name === "AssertionError" || error?.code === "ERR_ASSERTION";
    results.push({
      name,
      case_ref: name,
      polarity,
      status: "FAIL",
      failure_kind: assertionFailure ? "ASSERTION" : "UNEXPECTED",
      failure_reason_expected: assertionFailure,
      error: safeError(error),
    });
  }
}

async function main() {
  if (!existsSync(FALLBACK_SOURCE)) throw new ProbeSetupError("current fallback source is missing", { file: FALLBACK_SOURCE });
  if (!existsSync(PROTOCOL_SOURCE)) throw new ProbeSetupError("canonical protocol source fixture is missing", { file: PROTOCOL_SOURCE });
  const root = mkdtempSync(path.join(os.tmpdir(), "peer-wire-child-exit-red-"));
  const apis = await loadConsumer(root);
  const control = makeOwnedFixture(root, apis);
  const generated = runGeneratedHelper(control);
  const childFixture = observedChildWitness(control, generated.run);
  const results = [];

  runCase(results, "CASE-1 actual generated helper emits bound child_execution and preserves valid/malformed outcomes", "positive", () => {
    assertGeneratedHelperEmitsWitness(control, generated);
  });
  runCase(results, "CASE-1 producer exposes executable/worker argv/hash binding", "positive", () => {
    assertArtifactProducerExposesBinding(control);
  });
  runCase(results, "CASE-2 raw SDK isError:false with no outer exit metadata admits independent child witness and records null/unobserved outer exit", "positive", () => {
    assertMissingOuterExitAcceptsActualChild(apis, control, generated.output, childFixture);
  });
  for (const [label, mutate] of invalidChildVariants(control, childFixture)) {
    runCase(results, `CASE-3 ${label} child witness is fail-closed despite raw SDK isError:false and explicit outer exitCode:0`, "negative", () => {
      const recorded = recordProbe(apis, control, mutate(generated.output), 0);
      expectBlocked(
        () => validateRecorded(apis, control, recorded),
        `${label} must be rejected despite raw SDK isError:false and explicit outer exitCode:0`,
      );
    });
  }
  runCase(results, "CASE-4 explicit SDK nonzero is never accepted despite observed child zero", "negative", () => {
    assertOuterNonzeroNeverAccepted(apis, control, generated.output, childFixture);
  });

  const failures = results.filter((result) => result.status === "FAIL");
  const unexpected = failures.filter((result) => result.failure_kind === "UNEXPECTED");
  const positiveAssertions = results.filter((result) => result.polarity === "positive").length;
  const negativeAssertions = results.filter((result) => result.polarity === "negative").length;
  const summary = {
    status: failures.length === 0 ? "PASS" : "FAIL",
    phase: "RED",
    task: "T-011",
    test_file: TEST_FILE,
    acceptance_criteria: ["AC-016"],
    criteria_to_tests: {
      "AC-016": results.map((result) => `${TEST_FILE}::${result.name}`),
    },
    case_refs: results.map((result) => result.case_ref),
    positive_assertion_count: positiveAssertions,
    negative_assertion_count: negativeAssertions,
    assertion_failure_count: failures.filter((result) => result.failure_kind === "ASSERTION").length,
    unexpected_failure_count: unexpected.length,
    unexpected_zero: unexpected.length === 0,
    source_bindings: {
      fallback: { path: FALLBACK_SOURCE, sha256: apis.sourceSha256 },
      canonical_protocol: { path: PROTOCOL_SOURCE, sha256: control.sourceFixture.source_sha256 },
      helper: control.helperRecord,
      planned_executable: control.probe.executable ?? null,
      planned_child_argv: control.probe.child_argv ?? null,
      planned_child_argv_sha256: control.probe.child_argv_sha256 ?? null,
    },
    child_fixture: childFixture,
    backend_recipe: {
      seam: "temporary export-only seam from implementation-evidence/native-release/fallback.mjs",
      producer: "createPeerWireProbeArtifacts(projectRoot, fixtureInfo)",
      generated_helper_execution: "spawnSync(process.execPath, [helperPath, ...canonicalArgs], { shell:false, timeout:300000, maxBuffer:65536 })",
      required_wrapper_execution: "spawnSync(process.execPath, [sameHelperPath, '--worker', ...canonicalArgs], { shell:false, timeout:300000, maxBuffer:65536 })",
      session: "new RpcSession({ omp, cwd, env, timeoutMs, evidence, probe }).consumeLogical(Bash START/END)",
      validator: "validatePeerWireProbe(evidence, projectRoot, fixture, manifest, probe)",
      positive_observation: "raw SDK isError:false + missing outer exitCode must preserve child_execution and record outer exit_code:null/exit_code_observed:false",
      negative_observations: ["missing child_execution", "exit_code_observed:false", "nonzero child", "signal", "wrong script path/hash", "wrong argv hash"],
      explicit_outer_nonzero: "always reject before admission, even with observed child exit_code:0",
      no_sdk_repeat: true,
      no_public_qa: true,
    },
    cases: results,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length === 0) return;
  if (unexpected.length > 0) {
    throw new ProbeSetupError("child-exit RED probe had unexpected failures", { failures: unexpected });
  }
  const error = new Error("child-exit observability RED assertions failed as expected");
  error.name = "AssertionError";
  error.code = "ERR_ASSERTION";
  error.probe = summary;
  throw error;
}

main().catch((error) => {
  if (error?.probe) process.stderr.write(`${JSON.stringify({ ...error.probe, error: safeError(error) }, null, 2)}\n`);
  else process.stderr.write(`${JSON.stringify({ status: "BLOCKED", phase: "RED", task: "T-011", test_file: TEST_FILE, failure_reason_expected: false, error: safeError(error) }, null, 2)}\n`);
  process.exitCode = error?.name === "AssertionError" ? 1 : 2;
});
