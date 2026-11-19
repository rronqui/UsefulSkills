#!/usr/bin/env node
/**
 * Source-only RED probe for T-011 / AC-016 round2 lifecycle boundaries.
 *
 * The lifecycle cases import the real NativeRpcSession through a disposable
 * export-only seam and drive its normal execute() finalization with controlled
 * RPC frames.  The validator cases copy the real private validator into an
 * owned project and execute it as a child only against files generated below
 * the probe's temporary root.  No OMP, SDK, model, network, Git, publication,
 * or foreign executable is started.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_LIFECYCLE_SOURCE = path.join(SOURCE_DIR, "lifecycle.mjs");
const DEFAULT_VALIDATOR_SOURCE = path.join(SOURCE_DIR, "lifecycle-validator.mjs");
const SHIP_CLI = ".omp/skills/ship/bin/ship.mjs";
const ROOT_SESSION_ID = "round2-lifecycle-root-session";
const ROOT_CALL = "round2-lifecycle-root-task";
const ROOT_JOB = "round2-lifecycle-sdk-job";
const ALLOCATED_ID = "round2-lifecycle-allocated-child";
const WAIT_CALL = "round2-lifecycle-wait-complete";
const OPEN_WAIT_CALL = "round2-lifecycle-wait-open";
const ASSIGNMENT_NAME = "Round2LifecyclePeer";
const RUN_ID = "round2-lifecycle-boundary-red";

function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function inside(root, child) {
  const relative = path.relative(path.resolve(root), path.resolve(child));
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!["root", "source"].includes(key)) {
      throw new Error(`unknown option --${key}`);
    }
    if (values.has(key)) throw new Error(`duplicate option: --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    values.set(key, value);
    index += 1;
  }
  return {
    root: values.has("root") ? path.resolve(values.get("root")) : null,
    source: path.resolve(values.get("source") ?? DEFAULT_LIFECYCLE_SOURCE),
    validatorSource: DEFAULT_VALIDATOR_SOURCE,
  };
}

function ownedRoot(requested) {
  const tempRoot = path.resolve(os.tmpdir());
  const root = requested ?? fs.mkdtempSync(path.join(tempRoot, "round2-lifecycle-boundary-red-"));
  if (!inside(tempRoot, root)) throw new Error(`probe root must be below the OS temporary directory: ${root}`);
  if (requested) {
    if (fs.existsSync(root)) throw new Error(`probe root must be new: ${root}`);
    fs.mkdirSync(root, { recursive: false });
  }
  return root;
}

function assignment() {
  return {
    name: ASSIGNMENT_NAME,
    agent: "peer-reviewer",
    task: "Return the bounded round2 lifecycle boundary result.",
    solutionSpace: "Read-only round2 lifecycle boundary probe.",
  };
}


function rootStart(toolCallId, item) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId,
    args: { tasks: [item] },
  };
}

function progressRow(item) {
  return {
    id: ALLOCATED_ID,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    task: `Rendered prompt for ${item.name}.`,
    assignment: item.task,
  };
}

function rootEnd(toolCallId, jobId, item) {
  return {
    type: "tool_execution_end",
    toolName: "task",
    toolCallId,
    isError: false,
    result: {
      details: {
        results: [],
        progress: [progressRow(item)],
        async: { state: "running", jobId, type: "task" },
      },
    },
  };
}

function lifecycleFrame(status = "started") {
  return {
    type: "subagent_lifecycle",
    payload: {
      id: ALLOCATED_ID,
      index: 0,
      agent: "peer-reviewer",
      agentSource: "project",
      parentToolCallId: ROOT_CALL,
      status,
    },
  };
}

function asyncMessage() {
  return {
    type: "message_end",
    message: {
      role: "custom",
      customType: "async-result",
      details: {
        jobs: [{
          jobId: ROOT_JOB,
          type: "task",
          status: "completed",
          agentId: ALLOCATED_ID,
          durationMs: 11,
          schema: {
            source: "agent",
            mode: "strict",
            status: "valid",
            data: { protocol: "ROUND2_LIFECYCLE_BOUNDARY", status: "PASS" },
          },
        }],
      },
    },
  };
}

function waitJob() {
  return {
    id: ROOT_JOB,
    type: "task",
    status: "completed",
    label: ASSIGNMENT_NAME,
    durationMs: 17,
    settledAtMs: 1700000000017,
    agentUrlId: ALLOCATED_ID,
    agentOutputPublished: true,
    structured: {
      source: "agent",
      mode: "strict",
      status: "valid",
      data: {
        agent: "peer-reviewer",
        protocol_mode: "TDD_PEER_REVIEW",
        status: "APROVADO",
        reviewed_revision: "round2-lifecycle-boundary",
        explanation: "The completed wait is bound to the observed Root allocation.",
        confidence: 0.99,
        overall_correctness: "correct",
        findings: [],
      },
    },
  };
}

function waitStart(toolCallId) {
  return {
    type: "tool_execution_start",
    toolName: "wait",
    toolCallId,
    args: {},
  };
}

function waitEnd(toolCallId) {
  return {
    type: "tool_execution_end",
    toolName: "wait",
    toolCallId,
    isError: false,
    result: { details: { op: "wait", jobs: [waitJob()] } },
  };
}

function safeError(error) {
  return {
    name: error?.name ?? "Error",
    code: error?.code ?? null,
    kind: error?.kind ?? null,
    message: String(error?.message ?? error),
  };
}

function makeLifecycleSeam(root, source) {
  const seamDir = path.join(root, "source-overlay", "implementation-evidence", "native-release");
  const protocolDir = path.join(root, "source-overlay", "deep-review", "lib");
  fs.mkdirSync(seamDir, { recursive: true });
  fs.mkdirSync(protocolDir, { recursive: true });
  const actualSha = sha256File(source);
  const seam = path.join(seamDir, "lifecycle.seam.mjs");
  fs.writeFileSync(
    seam,
    `${fs.readFileSync(source, "utf8")}\n\n// TEMP export-only seam; never part of the product.\nexport { NativeRpcSession, taskRecordSucceeded };\n`,
    "utf8",
  );
  fs.copyFileSync(path.join(SOURCE_DIR, "technical-retry-scenario.mjs"), path.join(seamDir, "technical-retry-scenario.mjs"));
  fs.copyFileSync(path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs"), path.join(protocolDir, "protocol.mjs"));
  return { seam, actualSha };
}

async function loadLifecycleApi(root, options) {
  const { seam, actualSha } = makeLifecycleSeam(root, options.source);
  const api = await import(`${pathToFileURL(seam).href}?round2_lifecycle=${actualSha}`);
  assert.equal(typeof api.NativeRpcSession, "function", "the seam must expose the real NativeRpcSession class");
  assert.equal(typeof api.taskRecordSucceeded, "function", "the seam must expose the shared task success predicate");
  return api;
}

function installExecuteStub(session, item, { terminal = "custom", leaveOpenWait = false } = {}) {
  session.start = async () => {};
  session.configure = async () => {};
  session.close = async () => {};
  session.response = async (command) => {
    if (command.type === "get_state") {
      return {
        type: "response",
        command: "get_state",
        success: true,
        id: command.id,
        data: { sessionId: ROOT_SESSION_ID },
      };
    }
    if (command.type !== "prompt") throw new Error(`unexpected execute response command ${command.type}`);

    session.recordTool(rootStart(ROOT_CALL, item));
    session.consumeLogical(lifecycleFrame("started"));
    session.recordTool(rootEnd(ROOT_CALL, ROOT_JOB, item));
    session.consumeLogical(lifecycleFrame("completed"));
    if (terminal === "custom") session.consumeLogical(asyncMessage());
    else {
      session.recordTool(waitStart(WAIT_CALL));
      session.recordTool(waitEnd(WAIT_CALL));
    }
    if (leaveOpenWait) session.recordTool(waitStart(OPEN_WAIT_CALL));
    session.consumeLogical({ type: "prompt_result", id: command.id, status: "completed", agentInvoked: true, sessionSettled: false });
    session.consumeLogical({ type: "session_settled" });
    session.consumeLogical({ type: "agent_end", isTerminal: true, awaitingAsyncWork: false });
    return { type: "response", command: "prompt", success: true, id: command.id };
  };
}

async function lifecycleOpenRootWaitMustBlock(api, root) {
  const item = assignment();
  const session = new api.NativeRpcSession({
    omp: "offline-round2-lifecycle-probe",
    cwd: root,
    timeoutMs: 1_000,
    assignments: [item],
    logicalRunId: RUN_ID,
    label: "round2-lifecycle-open-root-wait",
  });
  installExecuteStub(session, item, { terminal: "custom", leaveOpenWait: true });

  let caught = null;
  let evidence = null;
  try {
    evidence = await session.execute("Complete the Root turn with one valid custom async terminal and one unmatched wait START.");
  } catch (error) {
    caught = error;
  }
  assert.ok(session.evidence.task_records.some((record) => record?.source_kind === "task_async_result"), "the valid observed custom async terminal must reach lifecycle settlement");
  const customRecord = session.evidence.task_records.find((record) => record?.source_kind === "task_async_result");
  assert.equal(customRecord?.status, "completed", "the custom terminal must remain completed");
  assert.equal(api.taskRecordSucceeded(customRecord), true, "the observed custom terminal must satisfy the shared success predicate before settlement");
  assert.equal(session.evidence.terminal?.prompt_result?.status, "completed", "the completed prompt_result must be observed");
  assert.equal(session.evidence.terminal?.session_settled, true, "the completed session_settled frame must be observed");
  assert.equal(session.waitCalls.size, 1, "the additional Root wait START must remain unmatched at settlement");
  assert.ok(caught, "settlement with an unmatched additional Root wait START must block");
  assert.equal(caught?.kind, "BLOCKED", "an open Root wait must fail closed with BLOCKED");
  assert.equal(evidence, null, "blocked settlement must not return accepted lifecycle evidence");
}

async function lifecycleCompletedWaitRemainsPositive(api, root) {
  const item = assignment();
  const session = new api.NativeRpcSession({
    omp: "offline-round2-lifecycle-probe",
    cwd: root,
    timeoutMs: 1_000,
    assignments: [item],
    logicalRunId: RUN_ID,
    label: "round2-lifecycle-completed-wait-positive",
  });
  installExecuteStub(session, item, { terminal: "wait", leaveOpenWait: false });

  const evidence = await session.execute("Complete the Root turn with one correlated completed wait terminal.");
  assert.ok(evidence, "a completed Root wait must still return lifecycle evidence");
  assert.equal(session.waitCalls.size, 0, "a completed Root wait must remove its matching wait START");
  const records = session.evidence.task_records.filter((record) => record?.source_kind === "task_wait_result");
  assert.equal(records.length, 1, "the completed wait must publish one authoritative wait record");
  assert.equal(records[0].status, "completed", "the wait record must preserve observed completed status");
  assert.equal(records[0].wait_result?.job?.id, ROOT_JOB, "the wait record must preserve the observed SDK job identity");
  assert.equal(api.taskRecordSucceeded(records[0]), true, "the completed wait must remain successful through the shared predicate");
  assert.equal(evidence.terminal?.prompt_result?.status, "completed", "the positive prompt_result must remain completed");
  assert.equal(evidence.terminal?.session_settled, true, "the positive session settlement must remain observed");
}

function readonlyShipPlanReceipt() {
  return {
    schema_version: 1,
    mode: "external",
    dry_run: true,
    status: "PLANNED",
    merge_target: "main",
    quality: { status: "PASS", legacy: false },
    steps: ["issue", "branch", "commit", "push", "pull_request", "ci", "release"].map((step) => ({
      step,
      status: "NOT_EXECUTED",
    })),
  };
}

function makeValidatorFixture(root, variant, validatorSource) {
  const fixtureRoot = path.join(root, `validator-${variant}`);
  const project = path.join(fixtureRoot, "private-project");
  const outside = path.join(fixtureRoot, "outside-project");
  const marker = path.join(outside, "ship-executed.marker");
  const source = path.join(project, "src", "tiny.mjs");
  const test = path.join(project, "tests", "tiny.test.mjs");
  const state = path.join(project, ".omp", "state");
  const validatorFile = path.join(state, "native-tooling", "lifecycle-validator.mjs");
  const shipFile = path.join(project, SHIP_CLI);
  const controlledShip = path.join(outside, "controlled-ship.mjs");

  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(path.dirname(test), { recursive: true });
  fs.mkdirSync(path.dirname(validatorFile), { recursive: true });
  fs.mkdirSync(path.dirname(shipFile), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(source, "export function answer() { return 2; }\n", "utf8");
  fs.writeFileSync(test, "process.exitCode = 0;\n", "utf8");
  fs.copyFileSync(validatorSource, validatorFile);

  const receipt = readonlyShipPlanReceipt();
  const shipScript = [
    'import { writeFileSync } from "node:fs";',
    `writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify("executed\n")}, "utf8");`,
    `process.stdout.write(${JSON.stringify(JSON.stringify(receipt))});`,
    "",
  ].join("\n");
  fs.writeFileSync(controlledShip, shipScript, "utf8");
  if (variant === "hard-link") fs.linkSync(controlledShip, shipFile);
  else fs.copyFileSync(controlledShip, shipFile);

  const sourceRevision = sha256File(source);
  fs.writeFileSync(
    path.join(state, "native10-workload.json"),
    `${JSON.stringify({ binding: {
      nonce: `round2-validator-${variant}`,
      run_id: `round2-validator-run-${variant}`,
      assignment_id: "Native10Validator",
      source: "src/tiny.mjs",
      test: "tests/tiny.test.mjs",
      revision: sourceRevision,
    } }, null, 2)}\n`,
    "utf8",
  );

  const sourceStat = fs.lstatSync(source);
  const testStat = fs.lstatSync(test);
  const validatorStat = fs.lstatSync(validatorFile);
  const shipStat = fs.lstatSync(shipFile);
  const controlledStat = fs.statSync(controlledShip);
  assert.equal(sourceStat.isFile(), true, `${variant}: workload source must be regular`);
  assert.equal(testStat.isFile(), true, `${variant}: workload test must be regular`);
  assert.equal(validatorStat.isFile(), true, `${variant}: validator must be regular`);
  assert.equal(shipStat.isFile(), true, `${variant}: Ship input must be regular`);
  assert.equal(shipStat.isSymbolicLink(), false, `${variant}: Ship input must not be a symlink`);
  assert.equal(controlledStat.isFile(), true, `${variant}: controlled Ship source must be regular`);
  if (variant === "hard-link") {
    if (shipStat.nlink < 2) throw new Error(`${variant}: filesystem did not create the required actual hard link`);
    assert.equal(inside(project, controlledShip), false, `${variant}: hard-link source must be outside the private project`);
    assert.equal(shipStat.dev, controlledStat.dev, `${variant}: hard-link target and source must share a filesystem`);
    assert.equal(shipStat.ino, controlledStat.ino, `${variant}: Ship target must share the controlled source inode`);
  } else {
    assert.equal(shipStat.nlink, 1, `${variant}: copied Ship input must be independently single-link`);
  }
  return { project, outside, marker, source, test, validatorFile, shipFile, controlledShip };
}

function runValidator(fixture) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec,
    HOME: fixture.project,
    USERPROFILE: fixture.project,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: "file",
  };
  const child = spawnSync(process.execPath, [fixture.validatorFile], {
    cwd: fixture.project,
    env,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  let report = null;
  try {
    report = JSON.parse(String(child.stdout ?? "").trim());
  } catch {
    // Assertions below report a malformed validator response as a setup/behavior failure.
  }
  return {
    status: child.status,
    signal: child.signal,
    error: child.error ? { code: child.error.code ?? null, message: String(child.error.message ?? child.error) } : null,
    stdout: String(child.stdout ?? ""),
    stderr: String(child.stderr ?? ""),
    report,
  };
}

function validatorHardLinkMustBlockBeforeShipSideEffect(root, validatorSource) {
  const fixture = makeValidatorFixture(root, "hard-link", validatorSource);
  const run = runValidator(fixture);
  assert.equal(fs.existsSync(fixture.marker), false, "a hard-linked Ship input must be rejected before the controlled Ship side effect executes");
  assert.notEqual(run.status, 0, "the validator must return nonzero for a hard-linked Ship input");
  assert.equal(run.report?.status, "FAIL", "the hard-linked Ship input must produce the validator's bounded FAIL envelope");
  assert.ok(run.report?.code || run.report?.failure_origin, "the hard-link rejection must identify a validation failure");
}

function validatorCopiedRegularFileRemainsAdmissible(root, validatorSource) {
  const fixture = makeValidatorFixture(root, "copied", validatorSource);
  const run = runValidator(fixture);
  assert.equal(run.status, 0, `an independently copied regular Ship input must remain admissible: ${run.stderr || run.stdout}`);
  assert.equal(run.signal, null, "the copied-file validator must not time out or receive a signal");
  assert.equal(run.error, null, "the copied-file validator must start as a real Node child");
  assert.equal(run.report?.status, "PASSOU", "the copied regular Ship input must preserve the valid validator result");
  assert.equal(run.report?.actual, 2, "the copied-file validator must preserve the controlled workload answer");
  assert.equal(run.report?.expected, 2, "the copied-file validator must preserve the expected workload answer");
  assert.equal(fs.existsSync(fixture.marker), true, "the admissible copied Ship input must execute the controlled Ship plan");
  assert.equal(inside(fixture.project, fixture.marker), false, "the controlled marker must remain outside the private project while staying inside the owned fixture root");
}

async function runCase(name, classification, fn) {
  try {
    await fn();
    return { name, status: "PASS", classification };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      classification,
      failure_reason_expected: error?.code === "ERR_ASSERTION" || error?.name === "AssertionError",
      error: safeError(error),
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = ownedRoot(options.root);
  const cases = [];
  let unexpected = [];
  try {
    const lifecycleApi = await loadLifecycleApi(root, options);
    cases.push(await runCase(
      "lifecycle settlement rejects a valid custom terminal followed by an unmatched additional Root wait START",
      "VALID_FINDING:lifecycle.mjs:4581-4585",
      () => lifecycleOpenRootWaitMustBlock(lifecycleApi, root),
    ));
    cases.push(await runCase(
      "completed Root wait remains admissible and authoritative at lifecycle settlement",
      "POSITIVE_CONTROL:lifecycle.mjs:wait-settlement",
      () => lifecycleCompletedWaitRemainsPositive(lifecycleApi, root),
    ));
    cases.push(await runCase(
      "validator rejects a hard-linked Ship file before the controlled executable side effect",
      "VALID_FINDING:lifecycle-validator.mjs:44-45",
      () => validatorHardLinkMustBlockBeforeShipSideEffect(root, options.validatorSource),
    ));
    cases.push(await runCase(
      "validator admits an independently copied regular Ship file",
      "POSITIVE_CONTROL:lifecycle-validator.mjs:single-link",
      () => validatorCopiedRegularFileRemainsAdmissible(root, options.validatorSource),
    ));
    unexpected = cases.filter((item) => item.status === "FAIL" && item.failure_reason_expected !== true);
    const output = {
      status: cases.some((item) => item.status === "FAIL") ? "FAIL" : "PASS",
      phase: "RED",
      task: "T-011",
      acceptance_criteria: ["AC-016"],
      contract: "0.7.0",
      probe: "round2-lifecycle-boundary-red",
      source: {
        lifecycle: { path: options.source, sha256: sha256File(options.source) },
        validator: { path: options.validatorSource, sha256: sha256File(options.validatorSource) },
      },
      scope: {
        root,
        native: false,
        sdk: false,
        model_calls: false,
        network: false,
        git: false,
        publication: false,
        foreign_code: false,
        controlled_child_code_only: true,
      },
      cases,
      traceability: {
        "AC-016": cases.map((item) => `implementation-evidence/native-release/round2-lifecycle-boundary-red-probe.mjs::${item.name}`),
      },
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (unexpected.length) {
      const error = new Error("round2 lifecycle boundary probe encountered a setup or unexpected failure");
      error.code = "ERR_PROBE_UNEXPECTED_FAILURE";
      error.name = "ProbeHarnessError";
      error.probe = output;
      throw error;
    }
    if (cases.some((item) => item.status === "FAIL")) {
      const error = new Error("round2 lifecycle boundary RED assertions failed as expected");
      error.code = "ERR_ASSERTION";
      error.name = "AssertionError";
      error.probe = output;
      throw error;
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const probe = error?.probe ?? {
    status: "BLOCKED",
    phase: "RED",
    task: "T-011",
    acceptance_criteria: ["AC-016"],
    probe: "round2-lifecycle-boundary-red",
  };
  process.stderr.write(`${JSON.stringify({ ...probe, error: safeError(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
