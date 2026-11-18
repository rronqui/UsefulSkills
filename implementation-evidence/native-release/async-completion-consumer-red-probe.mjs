#!/usr/bin/env node
// Disposable source-only RED probe for T-011 / AC-016.
//
// The historical 43-case probe is intentionally preserved outside the checkout
// at native-async-completion-red-20261115/async-completion-red-probe.mjs.  This
// probe reuses its source/coverage contract and adds only the uncovered consumer
// regressions from the async wire triage.  It never starts OMP/SDK, a shell,
// network, Git, or a product command.  A temporary export-only seam is made
// from the current checkout lifecycle source and all fixtures stay below --root.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_SOURCE = path.join(SOURCE_DIR, "lifecycle.mjs");
const DEFAULT_BASELINE = "C:/Users/Ricar/AppData/Local/Temp/usefulskills-audit-CdmZsI/native-async-completion-red-20261115/async-completion-red-probe.mjs";
const DEFAULT_RETRY_SOURCE = path.join(SOURCE_DIR, "technical-retry-scenario.mjs");
const DEFAULT_ROOT = "C:/Users/Ricar/AppData/Local/Temp/usefulskills-audit-CdmZsI/native-async-consumer-regression-red-20261117";
const EXPECTED_SOURCE_SHA256 = "5b8810ba14dc505f4a41414eb3c91e688bd8d2a58fefa8656f9df7f031dc2a79";
const SHA256 = /^[a-f0-9]{64}$/i;
const RUN_ID = "async-consumer-regression-red";
const ROOT_SESSION_ID = "root-session-async-consumer-red";
const ROOT_PROMPT_ID = "root-prompt-async-consumer-red";
const ROOT_CALL_A = "flat-root-call-a";
const ROOT_CALL_B = "flat-root-call-b";
const ROOT_CALL_SINGLE = "single-root-call";
const ROOT_CALL_WAIT = "wait-root-call";
const ROOT_CALL_FOREIGN = "foreign-root-call";
const WAIT_CALL = "root-wait-call";
const WAIT_CALL_SECOND = "root-wait-call-second";
const WAIT_CALL_THIRD = "root-wait-call-third";
const ALLOCATED_A = "allocated-flat-agent-a";
const ALLOCATED_B = "allocated-flat-agent-b";
const ALLOCATED_SINGLE = "allocated-single-agent";
const ALLOCATED_WAIT = "allocated-wait-peer";
const ALLOCATED_FOREIGN = "allocated-foreign-peer";
const SDK_JOB_A = "sdk-flat-job-a";
const SDK_JOB_B = "sdk-flat-job-b";
const SDK_JOB_SINGLE = "sdk-single-job";
const SDK_JOB_WAIT = "sdk-wait-job";
const SDK_JOB_FOREIGN = "sdk-foreign-job";
const ROOT_CALL_EARLY = "early-nested-root-call";
const ALLOCATED_EARLY = "allocated-early-nested-agent";
const SDK_JOB_EARLY = "sdk-early-root-job";
const SDK_JOB_EARLY_MISMATCH = "sdk-early-mismatching-job";
const SDK_JOB_EARLY_ALIAS = "sdk-early-alias-job";
const NATIVE3_SHARED_JOB_ID = "NativeWireNegativePeer";
const RAW_RESULT_BYTES_PER_JOB = 9 * 1024 * 1024;
const FOREIGN_NESTED_ID = "allocated-foreign-nested-agent";
const FOREIGN_NESTED_JOB = "sdk-foreign-nested-job";
const WAIT_REVISION = "revision-wait-terminal-red";
const RETRY_COMMAND = "node app/.omp/state/native-tooling/retry-check.mjs";
const TRIAGE_CAPTURE = "C:/Users/Ricar/AppData/Local/Temp/usefulskills-audit-CdmZsI/native-uri-extra-prepared-cuD7sd/ship-native-lifecycle-a6f0b202-d8ee-4abe-bb55-355a6134df9f/evidence.json";
const OMIT = Symbol("omitted");
const NATIVE09_REPAIR_LABEL = "native09-technical-retry-repair";
const NATIVE09_REPAIR_UNSCOPED_LABEL = "native09-technical-retry-repair-unscoped";
const NATIVE09_REPAIR_ASSIGNMENT = "Native09TechnicalRetryBackendDeveloper";
const NATIVE09_REPAIR_ROOT_CALL = "native09-backend-repair-root-call";
const NATIVE09_REPAIR_ALLOCATED_ID = "opaque-native09-backend-allocated";
const NATIVE09_REPAIR_SDK_JOB_ID = "opaque-native09-backend-sdk-job";
const NATIVE09_REPAIR_WRITE_CALL = "write|native09-backend-repair";
const NATIVE09_REPAIR_PATH = "app/bin/quality.mjs";
const NATIVE09_REPAIR_PROOF_KIND = "native09-backend-repair-write";
const NATIVE09_REPAIR_REVISION = "native09-technical-retry-repair-revision";
const NATIVE09_REPAIR_NONCE = "native09-technical-retry-repair-nonce";
const NATIVE09_REPAIR_FIRST_COMMAND = "native09-backend-solution-failure";
const NATIVE09_REPAIR_SECOND_COMMAND = "native09-backend-solution-pass";


function native09BackendRepairAssignment() {
  return assignment(
    NATIVE09_REPAIR_ASSIGNMENT,
    "backend-developer",
    "Repair the private CLI subject and return no structured payload.",
  );
}

function validate64hex(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${name} must be a 64-character hexadecimal SHA-256`);
  }
  return value.toLowerCase();
}

function parseArgs(argv) {
  const allowed = new Set(["source", "retry-source", "baseline", "root", "expected-source-sha", "expected-retry-sha"]);
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
  const expectedRetrySha = values.get("expected-retry-sha");
  if (expectedRetrySha === undefined) throw new Error("missing value for --expected-retry-sha");
  return {
    source: path.resolve(values.get("source") ?? DEFAULT_SOURCE),
    retrySource: path.resolve(values.get("retry-source") ?? DEFAULT_RETRY_SOURCE),
    baseline: path.resolve(values.get("baseline") ?? DEFAULT_BASELINE),
    root: path.resolve(values.get("root") ?? DEFAULT_ROOT),
    expectedSourceSha: validate64hex(values.get("expected-source-sha") ?? EXPECTED_SOURCE_SHA256, "--expected-source-sha"),
    expectedRetrySha: validate64hex(expectedRetrySha, "--expected-retry-sha"),
  };
}

function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}


function assignment(name, agent, task) {
  return {
    name,
    agent,
    task,
    solutionSpace: "Read-only source-derived async consumer regression probe.",
  };
}

function hostStateResponse() {
  return {
    type: "response",
    command: "get_state",
    id: "state-request-async-consumer-red",
    success: true,
    data: { sessionId: ROOT_SESSION_ID },
  };
}

function rootStart(toolCallId, assignments) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId,
    args: { tasks: assignments },
  };
}

function progressRow(item, id, index = 0) {
  return {
    id,
    index,
    agent: item.agent,
    agentSource: "project",
    task: `Rendered prompt for ${item.name}.`,
    assignment: item.task,
  };
}

function rootEnd(toolCallId, jobId, progress, { includeAsync = true } = {}) {
  const details = {
    results: [],
    progress,
  };
  if (includeAsync) details.async = { state: "running", jobId, type: "task" };
  return {
    type: "tool_execution_end",
    toolName: "task",
    toolCallId,
    isError: false,
    result: { details },
  };
}

function rootUpdate(toolCallId, item, id, { progress = true, async = true } = {}) {
  const details = { results: [] };
  if (progress) details.progress = [progressRow(item, id)];
  if (async) details.async = { state: "running", jobId: SDK_JOB_SINGLE, type: "task" };
  return {
    type: "tool_execution_update",
    toolName: "task",
    toolCallId,
    args: { tasks: [item] },
    partialResult: { details },
  };
}

function lifecycleFrame({ id, index = 0, agent, parentToolCallId, status = "started" }) {
  return {
    type: "subagent_lifecycle",
    payload: {
      id,
      index,
      agent,
      agentSource: "project",
      parentToolCallId,
      status,
    },
  };
}

function asyncJob(jobId, agentId, protocol = "ASYNC_CONSUMER_RED") {
  return {
    jobId,
    type: "task",
    status: "completed",
    agentId,
    durationMs: 13,
    schema: {
      source: "agent",
      mode: "strict",
      status: "valid",
      data: { protocol, status: "PASS" },
    },
  };
}

function asyncMessage(jobs) {
  return {
    type: "message_end",
    message: {
      role: "custom",
      customType: "async-result",
      details: { jobs: Array.isArray(jobs) ? jobs : [jobs] },
    },
  };
}
function reviewerStructured(revision = WAIT_REVISION, status = "APROVADO") {
  return {
    agent: "peer-reviewer",
    protocol_mode: "TDD_PEER_REVIEW",
    status,
    reviewed_revision: revision,
    explanation: "The wait terminal is bound to the observed peer-review consumer.",
    confidence: 0.99,
    overall_correctness: "correct",
    findings: [],
  };
}
function waitStructured(revision = WAIT_REVISION, status = "valid", data = reviewerStructured(revision)) {
  return {
    source: "agent",
    mode: "strict",
    status,
    data,
  };
}

function waitJob({
  id = SDK_JOB_WAIT,
  agentUrlId = ALLOCATED_WAIT,
  status = "completed",
  structured = waitStructured(),
  label = "WaitPeerReviewer",
  durationMs = 17,
  settledAtMs = 1700000000017,
  agentOutputPublished = true,
  exitCode = OMIT,
  resultText = OMIT,
  errorText = OMIT,
  meta = OMIT,
} = {}) {
  const job = {
    id,
    type: "task",
    status,
    label,
    durationMs,
    settledAtMs,
    agentUrlId,
    agentOutputPublished,
  };
  if (structured !== OMIT) job.structured = structured;
  if (exitCode !== OMIT) job.exitCode = exitCode;
  if (resultText !== OMIT) job.resultText = resultText;
  if (errorText !== OMIT) job.errorText = errorText;
  if (meta !== OMIT) job.meta = meta;
  return job;
}
function runningWaitSnapshot({ id = SDK_JOB_WAIT, agentUrlId = ALLOCATED_WAIT } = {}) {
  return {
    id,
    type: "task",
    status: "running",
    agentUrlId,
  };
}


function deterministicRawResult(marker) {
  const prefix = `native-raw-${marker}-`;
  return prefix + marker.repeat(RAW_RESULT_BYTES_PER_JOB - prefix.length);
}

function waitStart(toolCallId = WAIT_CALL) {
  return {
    type: "tool_execution_start",
    toolName: "wait",
    toolCallId,
    args: {},
  };
}
function waitProgressUpdate(type, toolCallId, child, {
  resultKey = "partialResult",
  status = "running",
  id = ALLOCATED_WAIT,
} = {}) {
  return {
    type,
    toolName: "wait",
    toolCallId,
    [resultKey]: {
      details: {
        op: "wait",
        jobs: [waitJob({ status, label: child.name, agentUrlId: id })],
      },
    },
  };
}


function waitEnd(toolCallId, job, { isError = false, details = OMIT } = {}) {
  const frame = {
    type: "tool_execution_end",
    toolName: "wait",
    toolCallId,
    result: {
      details: details === OMIT ? { op: "wait", jobs: [job] } : details,
    },
  };
  if (isError !== OMIT) frame.isError = isError;
  return frame;
}

function subagentEvent({ allocatedId, agent, nestedEvent }) {
  return {
    type: "subagent_event",
    payload: {
      id: allocatedId,
      agent,
      agentSource: "project",
      event: nestedEvent,
    },
  };
}

function nestedWriteEvent({ phase, callId, pathValue = NATIVE09_REPAIR_PATH, content = "private native09 backend repair", isError = false, rawFields = null }) {
  const event = {
    type: `tool_execution_${phase}`,
    toolName: "write",
    toolCallId: callId,
    args: { path: pathValue },
  };
  if (phase === "start") event.args.content = content;
  if (phase === "end") {
    event.isError = isError;
    event.result = { details: { resolvedPath: pathValue } };
  }
  if (rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)) Object.assign(event, rawFields);
  return event;
}
function nestedRetryCommandEvent({
  phase,
  callId,
  command = RETRY_COMMAND,
  assignmentId = NATIVE09_REPAIR_ASSIGNMENT,
  runId = RUN_ID,
  revision = NATIVE09_REPAIR_REVISION,
  isError = false,
  exitCode = OMIT,
  report = null,
  reportText = OMIT,
  nestedId = OMIT,
  nestedJobId = OMIT,
  nestedInstanceId = OMIT,
  taskId = OMIT,
  parentToolCallId = OMIT,
} = {}) {
  const event = {
    type: `tool_execution_${phase}`,
    toolName: "bash",
    toolCallId: callId,
    args: { command },
    assignment_id: assignmentId,
    run_id: runId,
    revision,
  };
  if (nestedId !== OMIT) {
    event.id = nestedId;
    event.agentId = nestedId;
  }
  if (nestedJobId !== OMIT) event.jobId = nestedJobId;
  if (nestedInstanceId !== OMIT) event.instanceId = nestedInstanceId;
  if (taskId !== OMIT) event.taskId = taskId;
  if (parentToolCallId !== OMIT) event.parentToolCallId = parentToolCallId;
  if (phase === "end") {
    if (isError !== OMIT) event.isError = isError;
    if (exitCode !== OMIT) {
      event.exitCode = exitCode;
      event.result = { details: { exitCode } };
    } else {
      event.result = { details: {} };
    }
    if (reportText !== OMIT) {
      event.result.content = [{ type: "text", text: reportText }];
    } else if (report !== null) {
      event.result.content = [{ type: "text", text: JSON.stringify(report) }];
    }
  }
  return event;
}



function native09BackendContradictoryRawWriteMetadataMustBlock(apis, root) {
  const rawVariants = [
    ["agent", "raw-validator-agent"],
    ["name", "RawForeignBackendAssignment"],
    ["agentSource", "user"],
  ];
  for (const [field, value] of rawVariants) {
    for (const phase of ["start", "end"]) {
      const suffix = `${field}-${phase}`;
      const fixture = makeNative09BackendRepairFixture(apis, root, {
        rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-raw-${suffix}`,
        writeCount: 0,
        completeLifecycle: false,
      });
      const callId = `${NATIVE09_REPAIR_WRITE_CALL}-raw-${suffix}`;
      if (phase === "end") {
        fixture.session.consumeLogical(subagentEvent({
          allocatedId: fixture.allocatedId,
          agent: fixture.child.agent,
          nestedEvent: nestedWriteEvent({ phase: "start", callId }),
        }));
      }
      const frame = subagentEvent({
        allocatedId: fixture.allocatedId,
        agent: fixture.child.agent,
        nestedEvent: nestedWriteEvent({ phase, callId, rawFields: { [field]: value } }),
      });
      const rawFrameBefore = structuredClone(frame);
      let error = null;
      try {
        fixture.session.consumeLogical(frame);
      } catch (caught) {
        error = caught;
      }
      assert.ok(error, `${suffix} contradictory raw ${field} metadata must not be admitted`);
      assert.equal(error.kind, "BLOCKED", `${suffix} contradictory raw ${field} metadata must fail closed as BLOCKED`);
      assert.deepEqual(frame, rawFrameBefore, `${suffix} must not rewrite the raw nested ${field} metadata before rejection`);
      assert.equal(frame.payload.id, fixture.allocatedId, `${suffix} must retain the correct opaque child identity`);
      assert.equal(frame.payload.agent, fixture.child.agent, `${suffix} must retain the approved outer Root-bound agent`);
      assert.equal(frame.payload.agentSource, "project", `${suffix} must retain the approved outer Root-bound agentSource`);
      assert.equal(frame.payload.event[field], value, `${suffix} must retain the contradictory raw nested ${field} value`);
    }
  }
}

function native09BackendAbsentRawFieldsRemainAccepted(apis, root) {
  for (const channel of ["custom", "wait"]) {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-raw-absent-${channel}`,
    });
    assert.doesNotThrow(
      () => recordNative09BackendRepairTerminal(fixture, channel),
      `${channel} truly absent raw agent/name/agentSource fields must remain accepted`,
    );
    const [record] = fixture.session.evidence.task_records;
    assert.equal(apis.taskRecordSucceeded(record), true, `${channel} absent raw metadata must retain the accepted backend completion`);
  }
}


function native09BackendProofBridgeMetadataMustGateSharedConsumer(apis, root) {
  const variants = [
    ["missing role_source", (write) => { delete write.role_source; }],
    ["forged role_source", (write) => { write.role_source = "backend-developer"; }],
    ["missing observed_binding", (write) => { delete write.identity.observed_binding; }],
    ["mismatched observed_binding", (write, fixture) => { write.identity.observed_binding.allocated_id = `${fixture.allocatedId}:foreign`; }],
  ];
  for (const channel of ["custom", "wait"]) {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-bridge-${channel}`,
    });
    recordNative09BackendRepairTerminal(fixture, channel);
    const [record] = fixture.session.evidence.task_records;
    assert.ok(record?.independent_evidence?.write, `${channel} bridge fixture must retain the proof write`);
    for (const [name, mutate] of variants) {
      const candidate = structuredClone(record);
      const proofWrite = candidate.independent_evidence.write;
      assert.equal(proofWrite.role, "backend-developer", `${channel} ${name} control must retain the backend role label`);
      assert.ok(proofWrite.identity?.observed_binding, `${channel} ${name} control must start with an observed Root binding`);
      mutate(proofWrite, fixture);
      assert.equal(
        apis.taskRecordSucceeded(candidate),
        false,
        `${channel} ${name} must deny backend repair even when the role label remains backend-developer`,
      );
    }
  }
}

function recordNative09BackendRepairWrite(session, allocatedId, child, {
  callId = NATIVE09_REPAIR_WRITE_CALL,
  pathValue = NATIVE09_REPAIR_PATH,
  isError = false,
} = {}) {
  session.consumeLogical(subagentEvent({
    allocatedId,
    agent: child.agent,
    nestedEvent: nestedWriteEvent({ phase: "start", callId, pathValue }),
  }));
  session.consumeLogical(subagentEvent({
    allocatedId,
    agent: child.agent,
    nestedEvent: nestedWriteEvent({ phase: "end", callId, pathValue, isError }),
  }));
}

function expectedBlocked(operation, name) {
  assert.throws(operation, (error) => error?.kind === "BLOCKED", `${name} must fail closed as BLOCKED`);
}

function makeExportOnlySeam(options) {
  const seamRoot = path.join(options.root, "source-overlay");
  const seamDir = path.join(seamRoot, "implementation-evidence", "native-release");
  const protocolDir = path.join(seamRoot, "deep-review", "lib");
  fs.mkdirSync(seamDir, { recursive: true });
  fs.mkdirSync(protocolDir, { recursive: true });
  const sourceHash = sha256File(options.source);
  assert.equal(sourceHash, options.expectedSourceSha, "probe must bind to the current checkout lifecycle bytes");
  const retrySource = options.retrySource;
  assert.equal(sha256File(retrySource), options.expectedRetrySha, "probe must bind to the current retry consumer bytes");
  const seam = path.join(seamDir, "lifecycle.seam.mjs");
  const sourceText = fs.readFileSync(options.source, "utf8");
  fs.writeFileSync(
    seam,
    `${sourceText}\n\n// TEMP export-only seam; never part of the product.\nexport { NativeRpcSession, operationalRecord, taskDetailsEnvelopes, terminalRecords, technicalRetryTerminalObservation, isAuthoritativeTaskRecord, taskRecordSucceeded, validateReviewerResult };\n`,
    "utf8",
  );
  fs.copyFileSync(retrySource, path.join(seamDir, "technical-retry-scenario.mjs"));
  fs.copyFileSync(path.join(SOURCE_DIR, "route-matrix.mjs"), path.join(seamDir, "route-matrix.mjs"));
  fs.copyFileSync(path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs"), path.join(protocolDir, "protocol.mjs"));
  return seam;
}

async function loadApis(options) {
  const seam = makeExportOnlySeam(options);
  const module = await import(`${pathToFileURL(seam).href}?source_sha=${options.expectedSourceSha}`);
  for (const name of ["NativeRpcSession", "operationalRecord", "taskDetailsEnvelopes", "terminalRecords", "technicalRetryTerminalObservation", "isAuthoritativeTaskRecord", "taskRecordSucceeded", "validateReviewerResult"]) {
    assert.equal(typeof module[name], "function", `temporary seam must expose ${name}`);
  }
  return module;
}

function createSession(NativeRpcSession, root, assignments, label = "native09-technical-retry-first") {
  const session = new NativeRpcSession({
    omp: "offline-probe",
    cwd: root,
    timeoutMs: 1_000,
    assignments,
    logicalRunId: RUN_ID,
    label,
  });
  session.bindSourceHost(hostStateResponse(), "state-request-async-consumer-red", ROOT_PROMPT_ID);
  return session;
}
function makeManagedSkillFixture(root) {
  const fixtureRoot = fs.mkdtempSync(path.join(root, "managed-skill-"));
  const skillDir = path.join(fixtureRoot, ".omp", "skills", "alignment");
  const skillPath = path.join(skillDir, "SKILL.md");
  const referencePath = path.join(skillDir, "references", "routing-and-persistence.md");
  fs.mkdirSync(path.dirname(referencePath), { recursive: true });
  fs.copyFileSync(path.resolve(SOURCE_DIR, "../../alignment/SKILL.md"), skillPath);
  fs.copyFileSync(path.resolve(SOURCE_DIR, "../../alignment/references/routing-and-persistence.md"), referencePath);
  for (const [file, label] of [[skillPath, "private alignment SKILL.md"], [referencePath, "private managed reference"]]) {
    const stat = fs.lstatSync(file);
    assert.equal(stat.isFile(), true, `${label} must be a regular file`);
    assert.equal(stat.isSymbolicLink(), false, `${label} must not be a symlink`);
  }
  return { root: fixtureRoot, skillPath: path.resolve(skillPath), referencePath: path.resolve(referencePath) };
}

function createManagedSkillSession(apis, root, label) {
  const fixture = makeManagedSkillFixture(root);
  return { fixture, session: createSession(apis.NativeRpcSession, fixture.root, [], label) };
}

function managedSkillReadPathPositive(apis, root) {
  const { fixture, session } = createManagedSkillSession(apis, root, "native-managed-skill-read");
  let skillPath;
  assert.doesNotThrow(() => {
    skillPath = session.resolveReadPath("skill://alignment");
  }, "Root managed skill URI must resolve instead of being rejected as a generic URI");
  assert.equal(skillPath, fixture.skillPath, "skill://alignment must resolve to the private regular SKILL.md");
  let referencePath;
  assert.doesNotThrow(() => {
    referencePath = session.resolveReadPath("skill://alignment/references/routing-and-persistence.md");
  }, "nested managed skill reference URI must resolve safely");
  assert.equal(referencePath, fixture.referencePath, "nested managed reference must stay inside the private skill directory");
}

function unknownManagedSkillMustBlock(apis, root) {
  const { session } = createManagedSkillSession(apis, root, "native-managed-skill-unknown");
  expectedBlocked(() => session.resolveReadPath("skill://unknown-skill"), "unknown managed skill URI");
}

function encodedTraversalAndOutsideUrisMustBlock(apis, root) {
  const { session } = createManagedSkillSession(apis, root, "native-managed-skill-boundary");
  expectedBlocked(() => session.resolveReadPath("skill://alignment/references/%2e%2e/%2e%2e/outside.txt"), "encoded traversal in managed skill URI");
  expectedBlocked(() => session.resolveReadPath("http://example.invalid/outside"), "http outside URI");
  expectedBlocked(() => session.resolveReadPath("xd://outside/private"), "xd outside URI");
}

function rootTransportUrisMustRemainBlocked(apis, root) {
  const { session } = createManagedSkillSession(apis, root, "native-root-transport-guards");
  expectedBlocked(() => session.resolveReadPath("agent://allocated-agent"), "Root agent URI");
  expectedBlocked(() => session.resolveReadPath("proc://bound-job"), "Root proc URI");
  expectedBlocked(() => session.resolveReadPath("history://allocated-agent"), "Root history URI");
}


function asyncRecords(session) {
  return session.evidence.task_records.filter((record) => record?.source_kind === "task_async_result");
}
function waitRecords(session) {
  return session.evidence.task_records.filter((record) => record?.source_kind === "task_wait_result");
}
function asyncAuthorityState(session) {
  return {
    taskRecords: structuredClone(session.evidence.task_records),
    asyncResults: structuredClone(session.evidence.async_results),
    waitResults: structuredClone(session.evidence.wait_results),
    toolEvents: structuredClone(session.evidence.tool_events),
    capture: {
      bytes: session.evidence.capture.bytes,
      complete: session.evidence.capture.complete,
    },
    asyncRecordsByIdentity: [...session.asyncRecordsByIdentity.entries()].map(([key, value]) => [key, structuredClone(value)]),
    waitRecordsByIdentity: [...session.waitRecordsByIdentity.entries()].map(([key, value]) => [key, structuredClone(value)]),
    waitCalls: [...session.waitCalls.entries()].map(([key, value]) => [key, structuredClone(value)]),
    asyncJobIdsByAllocated: [...session.asyncJobIdsByAllocated.entries()],
    transportJobIds: [...session.transportJobIds],
    terminal: structuredClone(session.evidence.terminal),
  };
}

function sameBatchSecondaryAllocatedSdkIdentityPositive(apis, root) {
  const first = assignment("SameBatchAllocatedIdPeerA", "peer-reviewer", "First job in one observed Root batch.");
  const second = assignment("SameBatchAllocatedIdPeerB", "validator", "Second job in one observed Root batch.");
  const rootCall = "same-batch-allocated-id-root-call";
  const firstAllocated = "same-batch-allocated-id-child-a";
  const secondAllocated = "same-batch-allocated-id-child-b";
  const firstJobId = "same-batch-allocated-id-sdk-job-a";
  const session = createSession(apis.NativeRpcSession, root, [first, second], "native-same-batch-secondary-allocated-id-red");
  recordObservedBatchRoot(session, rootCall, [first, second], [firstAllocated, secondAllocated], firstJobId);

  const firstRawJob = waitJob({ id: firstJobId, agentUrlId: firstAllocated, label: first.name });
  const secondRawJob = waitJob({ id: secondAllocated, agentUrlId: secondAllocated, label: second.name });
  assert.doesNotThrow(
    () => session.recordTool(waitStart(WAIT_CALL)),
    "same-Root batch wait START for the primary observed job must remain admissible",
  );
  assert.doesNotThrow(
    () => session.recordTool(waitEnd(WAIT_CALL, firstRawJob)),
    "same-Root batch wait END for the primary observed job must remain admissible",
  );
  assert.doesNotThrow(
    () => session.recordTool(waitStart(WAIT_CALL_SECOND)),
    "same-Root batch wait START for the secondary observed job must remain admissible",
  );
  assert.doesNotThrow(
    () => session.recordTool(waitEnd(WAIT_CALL_SECOND, secondRawJob)),
    "a secondary SDK job whose id and agentUrlId equal its allocated child must remain admissible",
  );

  const records = waitRecords(session);
  assert.equal(records.length, 2, "the same-Root batch must publish two authoritative wait records");
  assert.deepEqual(
    records
      .map((record) => ({
        id: record.id,
        allocated_id: record.allocated_id,
        parent_tool_call_id: record.parent_tool_call_id,
        index: record.index,
        assignment_id: record.assignment_id,
        agent: record.agent,
        agentSource: record.agentSource,
        jobId: record.jobId,
        status: record.status,
      }))
      .sort((left, right) => left.index - right.index),
    [
      {
        id: firstAllocated,
        allocated_id: firstAllocated,
        parent_tool_call_id: rootCall,
        index: 0,
        assignment_id: first.name,
        agent: first.agent,
        agentSource: "project",
        jobId: firstJobId,
        status: "completed",
      },
      {
        id: secondAllocated,
        allocated_id: secondAllocated,
        parent_tool_call_id: rootCall,
        index: 1,
        assignment_id: second.name,
        agent: second.agent,
        agentSource: "project",
        jobId: secondAllocated,
        status: "completed",
      },
    ],
    "both wait authorities must retain their unique observed Root, lifecycle, index, assignment, and actual SDK identities",
  );
  assert.deepEqual(
    records.map((record) => record.wait_result.job),
    [firstRawJob, secondRawJob],
    "each authority must retain its exact raw SDK snapshot, including the secondary allocated-ID job",
  );
  for (const record of records) {
    assert.equal(apis.isAuthoritativeTaskRecord(record), true, "each same-Root batch wait record must satisfy the shared authority predicate");
    assert.equal(apis.taskRecordSucceeded(record), true, "each same-Root batch wait record must satisfy the shared success predicate");
  }
}

function customThenWaitNonzeroExitCodeContradictionMustBlockAndRetainPrior(apis, root) {
  const { child, session } = makeWaitFixture(apis, root, { label: "native-custom-then-wait-nonzero-exit-red" });
  const customTerminal = asyncJob(SDK_JOB_WAIT, ALLOCATED_WAIT, "CUSTOM_FIRST_TERMINAL");
  assert.doesNotThrow(
    () => session.consumeLogical(asyncMessage(customTerminal)),
    "the first custom terminal for the observed SDK job must be admitted",
  );
  const firstRecord = asyncRecords(session)[0];
  assert.ok(firstRecord, "the first custom terminal must publish one task record");
  assert.equal(apis.isAuthoritativeTaskRecord(firstRecord), true, "the first custom terminal must be authoritative");
  assert.equal(apis.taskRecordSucceeded(firstRecord), true, "the first custom terminal must be successful");

  assert.doesNotThrow(
    () => session.recordTool(waitStart(WAIT_CALL_SECOND)),
    "the later wait START for the same observed Root job must remain admissible",
  );
  const before = asyncAuthorityState(session);
  // Do not infer child failure from agentOutputPublished; the explicit numeric exitCode is the contradiction.
  const contradictoryWait = waitJob({
    id: SDK_JOB_WAIT,
    agentUrlId: ALLOCATED_WAIT,
    label: child.name,
    structured: structuredClone(customTerminal.schema),
    exitCode: 1,
  });
  expectedBlocked(
    () => session.recordTool(waitEnd(WAIT_CALL_SECOND, contradictoryWait)),
    "a same-job wait terminal with an actually exposed nonzero exitCode must BLOCK as a cross-channel contradiction",
  );
  assert.deepEqual(
    asyncAuthorityState(session),
    before,
    "the blocked cross-channel contradiction must preserve the prior terminal, source facts, maps, and counters",
  );
  assert.equal(asyncRecords(session).length, 1, "the blocked wait contradiction must not append a second authority");
  assert.deepEqual(asyncRecords(session)[0], firstRecord, "the prior custom terminal must remain the retained authority");
  assert.equal(session.asyncJobIdsByAllocated.get(ALLOCATED_WAIT), SDK_JOB_WAIT, "the prior SDK ownership map must remain unchanged");
}

function customSecondaryThenWaitDifferentSdkJobMustBlockAndRetainPrior(apis, root) {
  const first = assignment("CustomSecondaryPrimary", "peer-reviewer", "Primary job in the observed Root batch.");
  const second = assignment("CustomSecondaryTarget", "validator", "Secondary job whose custom and wait channels must agree on SDK identity.");
  const rootCall = "custom-secondary-cross-channel-root";
  const firstAllocated = "custom-secondary-allocated-a";
  const secondAllocated = "custom-secondary-allocated-b";
  const firstJobId = "custom-secondary-root-sdk-job-a";
  const secondaryJobA = "custom-secondary-sdk-job-a";
  const secondaryJobB = "custom-secondary-sdk-job-b";
  const session = createSession(apis.NativeRpcSession, root, [first, second], "native-custom-secondary-cross-channel-red");
  recordObservedBatchRoot(session, rootCall, [first, second], [firstAllocated, secondAllocated], firstJobId);

  const customTerminal = asyncJob(secondaryJobA, secondAllocated, "CUSTOM_SECONDARY_TERMINAL");
  assert.doesNotThrow(
    () => session.consumeLogical(asyncMessage(customTerminal)),
    "the secondary non-primary custom terminal must be admitted through its observed batch identity",
  );
  const firstRecord = asyncRecords(session)[0];
  assert.ok(firstRecord, "the secondary custom terminal must publish one task record");
  assert.equal(firstRecord.allocated_id, secondAllocated, "the custom terminal must retain the secondary allocated ownership");
  assert.equal(firstRecord.parent_tool_call_id, rootCall, "the custom terminal must retain the shared Root parent");
  assert.equal(firstRecord.index, 1, "the custom terminal must retain the observed non-primary assignment index");
  assert.equal(firstRecord.assignment_id, second.name, "the custom terminal must retain the secondary assignment");
  assert.equal(firstRecord.async_result.job.jobId, secondaryJobA, "the first terminal must retain the observed SDK job A");
  assert.equal(apis.taskRecordSucceeded(firstRecord), true, "the first secondary custom terminal must be successful");

  assert.doesNotThrow(
    () => session.recordTool(waitStart(WAIT_CALL_SECOND)),
    "the later wait START for the secondary observed ownership must remain admissible",
  );
  const before = asyncAuthorityState(session);
  const contradictoryWait = waitJob({
    id: secondaryJobB,
    agentUrlId: secondAllocated,
    label: second.name,
    structured: structuredClone(customTerminal.schema),
  });
  expectedBlocked(
    () => session.recordTool(waitEnd(WAIT_CALL_SECOND, contradictoryWait)),
    "a wait terminal for the same allocated child with a different SDK job must BLOCK before replacement",
  );
  assert.deepEqual(
    asyncAuthorityState(session),
    before,
    "the blocked secondary cross-channel identity drift must preserve the prior SDK map, source facts, records, authority, and counters",
  );
  assert.equal(session.asyncJobIdsByAllocated.get(secondAllocated), secondaryJobA, "the allocated-to-SDK map must retain SDK job A");
  assert.equal(waitRecords(session).length, 0, "the blocked SDK job B must not publish a wait authority");
  const retained = asyncRecords(session)[0];
  assert.equal(retained.async_result.job.jobId, secondaryJobA, "the retained raw source must remain SDK job A");
  assert.equal(retained.async_result.host_binding.allocated_id, secondAllocated, "the retained source binding must remain on the secondary allocated child");
  assert.equal(retained.async_result.host_binding.index, 1, "the retained source binding must preserve the non-primary index");
}


function makeWaitFixture(apis, root, {
  child = assignment("WaitPeerReviewer", "peer-reviewer", "Read the exact wait terminal and return the current TDD peer schema."),
  rootCallId = ROOT_CALL_WAIT,
  allocatedId = ALLOCATED_WAIT,
  rootJobId = SDK_JOB_WAIT,
  label = "native-wait-terminal-red",
} = {}) {
  const session = createSession(apis.NativeRpcSession, root, [child], label);
  session.recordTool(rootStart(rootCallId, [child]));
  session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId }));
  session.recordTool(rootEnd(rootCallId, rootJobId, [progressRow(child, allocatedId)]));
  session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId, status: "completed" }));
  return { child, session };
}

function nestedBashEvent({ phase, callId, nestedId, nestedJobId, nestedJobIdAlias, includeNestedIdentity = false, includeNestedJobIdentity = false, includeCommand = false }) {
  const event = {
    type: `tool_execution_${phase}`,
    toolName: "bash",
    toolCallId: callId,
  };
  // The pinned wire carries the public allocated identity on the outer
  // subagent payload; nested tool frames do not carry TaskID/task_id.  The
  // optional fields below are deliberately reserved for the cross-job
  // counterexample.
  if (includeNestedIdentity) {
    event.id = nestedId;
    event.agentId = nestedId;
    event.jobId = nestedJobId;
    event.instanceId = nestedJobId;
  }
  if (includeNestedJobIdentity) {
    event.jobId = nestedJobId;
    if (nestedJobIdAlias !== undefined) event.job_id = nestedJobIdAlias;
  }
  if (includeCommand) event.args = { command: RETRY_COMMAND };
  if (phase === "end") {
    event.isError = false;
    event.result = { exitCode: 0 };
  }
  return event;
}

function native09BackendUnavailableSchema() {
  return { source: "none", mode: "strict", status: "unavailable" };
}

function native09BackendCustomJob({
  jobId = NATIVE09_REPAIR_SDK_JOB_ID,
  agentId = NATIVE09_REPAIR_ALLOCATED_ID,
  status = "completed",
  schema = native09BackendUnavailableSchema(),
} = {}) {
  const job = asyncJob(jobId, agentId, "NATIVE09_BACKEND_REPAIR");
  job.status = status;
  if (schema === OMIT) delete job.schema;
  else job.schema = schema;
  return job;
}

function native09BackendWaitJob({
  id = NATIVE09_REPAIR_SDK_JOB_ID,
  agentUrlId = NATIVE09_REPAIR_ALLOCATED_ID,
  status = "completed",
  structured = native09BackendUnavailableSchema(),
  label = NATIVE09_REPAIR_ASSIGNMENT,
} = {}) {
  return waitJob({ id, agentUrlId, status, structured, label });
}

function makeNative09BackendRepairFixture(apis, root, {
  label = NATIVE09_REPAIR_LABEL,
  child = native09BackendRepairAssignment(),
  rootCallId = NATIVE09_REPAIR_ROOT_CALL,
  allocatedId = NATIVE09_REPAIR_ALLOCATED_ID,
  rootJobId = NATIVE09_REPAIR_SDK_JOB_ID,
  writeCount = 1,
  writePath = NATIVE09_REPAIR_PATH,
  writeError = false,
  completeLifecycle = true,
} = {}) {
  const session = createSession(apis.NativeRpcSession, root, [child], label);
  session.recordTool(rootStart(rootCallId, [child]));
  session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId }));
  session.recordTool(rootEnd(rootCallId, rootJobId, [progressRow(child, allocatedId)]));
  for (let index = 0; index < writeCount; index += 1) {
    recordNative09BackendRepairWrite(session, allocatedId, child, {
      callId: `${NATIVE09_REPAIR_WRITE_CALL}-${index + 1}`,
      pathValue: writePath,
      isError: writeError,
    });
  }
  if (completeLifecycle) session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId, status: "completed" }));
  return { child, session, rootCallId, allocatedId, rootJobId };
}

function recordNative09BackendRepairTerminal(fixture, channel, {
  status = "completed",
  schema = native09BackendUnavailableSchema(),
  agentId = fixture.allocatedId,
  jobId = fixture.rootJobId,
  waitCallId = `${fixture.rootCallId}-wait`,
} = {}) {
  if (channel === "custom") {
    fixture.session.consumeLogical(asyncMessage(native09BackendCustomJob({ jobId, agentId, status, schema })));
    return;
  }
  if (channel !== "wait") throw new Error(`unsupported Native09 backend terminal channel: ${channel}`);
  fixture.session.recordTool(waitStart(waitCallId));
  fixture.session.recordTool(waitEnd(
    waitCallId,
    native09BackendWaitJob({ id: jobId, agentUrlId: agentId, status, structured: schema, label: fixture.child.name }),
  ));
}

function assertNative09BackendRepairProof(apis, fixture, channel, expectedSchemaStatus = "unavailable") {
  const records = fixture.session.evidence.task_records.filter((record) => record?.assignment_id === fixture.child.name);
  assert.equal(records.length, 1, `${channel} Native09 backend repair completion must publish one task record`);
  const [record] = records;
  const rawJob = channel === "custom" ? record.async_result?.job : record.wait_result?.job;
  const rawSchema = channel === "custom" ? rawJob?.schema : rawJob?.structured;
  const schemaKey = channel === "custom" ? "schema" : "structured";
  assert.equal(record.source_kind, channel === "custom" ? "task_async_result" : "task_wait_result", `${channel} completion must retain its actual private source kind`);
  assert.equal(record.id, fixture.allocatedId, `${channel} completion must use the opaque allocated child identity`);
  assert.notEqual(record.id, fixture.child.name, `${channel} completion must not substitute the assignment name for the opaque child identity`);
  assert.notEqual(rawJob?.jobId ?? rawJob?.id, fixture.child.name, `${channel} completion must retain an opaque SDK job identity distinct from the assignment name`);
  assert.equal(typeof record.jobId, "string", `${channel} completion must retain the host-derived job identity`);
  assert.equal(typeof record.instanceId, "string", `${channel} completion must retain the host-derived instance identity`);
  assert.notEqual(record.jobId, fixture.child.name, `${channel} completion must not use the assignment name as host job identity`);
  assert.notEqual(record.instanceId, fixture.child.name, `${channel} completion must not use the assignment name as host instance identity`);
  assert.equal(record.parent_tool_call_id, fixture.rootCallId, `${channel} completion must retain the actual Root parent call`);
  assert.equal(record.index, 0, `${channel} completion must retain the observed Root index`);
  assert.equal(record.agent, "backend-developer", `${channel} completion must retain the configured backend role`);
  assert.equal(record.agentSource, "project", `${channel} completion must retain the observed project source`);
  assert.equal(record.assignment_id, fixture.child.name, `${channel} completion must retain the exact backend assignment`);
  assert.equal(record.root_session_id, ROOT_SESSION_ID, `${channel} completion must retain the actual Root session`);
  assert.equal(rawJob?.status, "completed", `${channel} completion must require the manager's observed completed status`);
  if (expectedSchemaStatus === null) {
    assert.equal(Object.hasOwn(rawJob ?? {}, schemaKey), false, `${channel} absent upstream schema must remain absent in the raw SDK job`);
    assert.equal(rawSchema, undefined, `${channel} absent upstream schema must not be rewritten into a local schema object`);
  } else {
    assert.equal(rawSchema?.status, expectedSchemaStatus, `${channel} completion must preserve the explicit backend schema status`);
    assert.equal(Object.hasOwn(rawSchema ?? {}, "data"), false, `${channel} non-valid schema must not fabricate payload data`);
  }
  for (const field of ["exitCode", "isError", "error", "aborted"]) {
    assert.equal(Object.hasOwn(rawJob ?? {}, field), false, `${channel} raw SDK job must not invent its absent ${field} flag`);
  }
  assert.equal(record.structured_data, null, `${channel} backend payload must remain null when no structured data was exposed`);
  assert.equal(record.structured_output_status, expectedSchemaStatus, `${channel} completion must normalize absent schema status to null`);
  assert.equal(record.exitCode, null, `${channel} completion must not infer a child exit code`);
  assert.equal(record.exit_code_observed, false, `${channel} completion must mark child exit code as unobserved`);
  assert.equal(record.isError, null, `${channel} completion must not infer child isError from manager success`);
  assert.equal(record.is_error_observed, false, `${channel} completion must mark child isError as unobserved`);
  assert.equal(record.error, null, `${channel} completion must not infer a child error`);
  assert.equal(record.error_observed, false, `${channel} completion must mark child error as unobserved`);
  assert.equal(record.aborted, null, `${channel} completion must not infer child aborted`);
  assert.equal(record.aborted_observed, false, `${channel} completion must mark child aborted as unobserved`);

  const successfulWrites = fixture.session.evidence.subagent_writes.filter((write) =>
    write?.phase === "end"
    && write.terminal_event === true
    && write.terminal_error_observed === true
    && write.terminal_error === false
    && write.correlation?.status === "matched"
    && write.correlation?.identity_match === true
    && write.guard?.reason_code === null
    && write.guard?.paths_in_allowlist === true
  );
  assert.equal(successfulWrites.length, 1, `${channel} completion must be backed by exactly one successful allowlisted backend write END`);
  const [write] = successfulWrites;
  assert.equal(write.paths.length, 1, `${channel} completion must retain exactly one private CLI path`);
  assert.equal(path.relative(fixture.session.cwd, path.resolve(fixture.session.cwd, write.paths[0])).replaceAll("\\", "/"), NATIVE09_REPAIR_PATH, `${channel} observed write must resolve to the exact private CLI`);
  assert.equal(write.correlation.status, "matched", `${channel} completion write must retain matched START/END ownership`);
  assert.equal(write.correlation.identity_match, true, `${channel} completion write must retain matched opaque child ownership`);
  assert.equal(write.guard.paths_in_allowlist, true, `${channel} completion write must retain the exact private allowlist decision`);
  assert.equal(write.terminal_error_observed, true, `${channel} completion write END must expose explicit isError`);
  assert.equal(write.terminal_error, false, `${channel} completion write END must expose isError:false`);

  const expectedProofJobId = channel === "custom" ? record.jobId : record.wait_result?.host_binding?.job_id;
  assert.equal(typeof expectedProofJobId, "string", `${channel} completion proof must have a host-derived job identity`);
  const proof = record.independent_evidence;
  assert.equal(proof?.observed, true, `${channel} backend completion must carry framework-observed independent evidence`);
  assert.equal(proof?.kind, NATIVE09_REPAIR_PROOF_KIND, `${channel} backend completion must carry the private Native09 repair-write proof kind`);
  assert.equal(proof?.count, 1, `${channel} backend completion proof must count exactly one successful write`);
  for (const key of ["root_session_id", "parent_tool_call_id", "allocated_id", "index", "agent", "agentSource", "assignment_id", "job_id", "instance_id"]) {
    assert.equal(proof?.[key], key === "assignment_id" ? fixture.child.name : key === "agent" ? fixture.child.agent : key === "agentSource" ? "project" : key === "parent_tool_call_id" ? fixture.rootCallId : key === "allocated_id" ? fixture.allocatedId : key === "root_session_id" ? ROOT_SESSION_ID : key === "job_id" ? expectedProofJobId : key === "instance_id" ? record.instanceId : 0, `${channel} completion proof must retain its full observed Root/lifecycle tuple (${key})`);
  }
  assert.equal(proof?.write?.phase, "end", `${channel} completion proof must retain the successful write END`);
  assert.deepEqual(proof?.write?.paths, [NATIVE09_REPAIR_PATH], `${channel} completion proof must retain the exact allowlisted write path`);
  assert.equal(proof?.write?.correlation?.status, "matched", `${channel} completion proof must retain matched write correlation`);
  assert.equal(proof?.write?.correlation?.identity_match, true, `${channel} completion proof must retain matched write owner`);
  assert.equal(proof?.write?.guard?.paths_in_allowlist, true, `${channel} completion proof must retain the allowlist guard`);
  assert.equal(proof?.write?.terminal_error_observed, true, `${channel} completion proof must retain explicit write isError observation`);
  assert.equal(proof?.write?.terminal_error, false, `${channel} completion proof must retain write isError:false`);
  assert.equal(proof?.write?.role, "backend-developer", `${channel} completion proof must retain the observed backend role label`);
  assert.equal(proof?.write?.role_source, "observed-root-dispatch-lifecycle", `${channel} completion proof must retain the Root-derived role source`);
  const observedBinding = proof?.write?.identity?.observed_binding;
  assert.ok(observedBinding && typeof observedBinding === "object", `${channel} completion proof must retain the observed Root binding bridge`);
  for (const [key, expected] of [
    ["root_session_id", ROOT_SESSION_ID],
    ["parent_tool_call_id", fixture.rootCallId],
    ["allocated_id", fixture.allocatedId],
    ["index", 0],
    ["agent", fixture.child.agent],
    ["agentSource", "project"],
    ["assignment_id", fixture.child.name],
  ]) {
    assert.equal(observedBinding[key], expected, `${channel} completion proof must retain the Root binding tuple field ${key}`);
  }

  assert.equal(apis.isAuthoritativeTaskRecord(record), true, `${channel} Native09 backend repair record must satisfy the shared authority predicate`);
  assert.equal(apis.taskRecordSucceeded(record), true, `${channel} Native09 backend repair record must satisfy the shared success predicate`);
  const review = apis.validateReviewerResult(record.structured_data, {
    agent: "peer-reviewer",
    protocol_mode: "TDD_PEER_REVIEW",
    reviewed_revision: WAIT_REVISION,
  });
  assert.equal(review.ok, false, `${channel} backend payload must not become peer-review approval`);
}

function native09BackendRepairCustomCompletionPositive(apis, root) {
  const fixture = makeNative09BackendRepairFixture(apis, root, { writePath: path.resolve(root, NATIVE09_REPAIR_PATH) });
  assert.doesNotThrow(
    () => recordNative09BackendRepairTerminal(fixture, "custom"),
    "a completed Native09 backend custom job with an unavailable schema and an observed repair write must be admitted",
  );
  assertNative09BackendRepairProof(apis, fixture, "custom");
}

function native09BackendRepairWaitCompletionPositive(apis, root) {
  const fixture = makeNative09BackendRepairFixture(apis, root, { rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-wait`, writePath: path.resolve(root, NATIVE09_REPAIR_PATH) });
  recordNative09BackendRepairTerminal(fixture, "wait");
  assertNative09BackendRepairProof(apis, fixture, "wait");
}

function native09BackendRepairCustomCompletionAbsentSchema(apis, root) {
  const fixture = makeNative09BackendRepairFixture(apis, root, {
    rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-absent-schema-custom`,
    writePath: path.resolve(root, NATIVE09_REPAIR_PATH),
  });
  assert.doesNotThrow(
    () => recordNative09BackendRepairTerminal(fixture, "custom", { schema: OMIT }),
    "a completed Native09 backend custom job with no upstream schema and an observed repair write must be admitted",
  );
  assertNative09BackendRepairProof(apis, fixture, "custom", null);
}

function native09BackendRepairWaitCompletionAbsentStructured(apis, root) {
  const fixture = makeNative09BackendRepairFixture(apis, root, {
    rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-absent-structured-wait`,
    writePath: path.resolve(root, NATIVE09_REPAIR_PATH),
  });
  assert.doesNotThrow(
    () => recordNative09BackendRepairTerminal(fixture, "wait", { schema: OMIT }),
    "a completed Native09 backend wait job with no upstream structured field and an observed repair write must be admitted",
  );
  assertNative09BackendRepairProof(apis, fixture, "wait", null);
}
function native09BackendRetryCommandPositive(apis, root) {
  const fixture = makeNative09BackendRepairFixture(apis, root, {
    rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-command-seam`,
    writeCount: 0,
    completeLifecycle: false,
  });
  const firstReport = {
    status: "FAIL",
    code: "ASSERTION_EXPECTED_REJECTION",
    failure_origin: "SOLUTION",
    origin: "SOLUTION",
    actual: { subject: "known-defect", value: 1 },
    expected: { subject: "known-defect", value: 2 },
    assignment_id: fixture.child.name,
    run_id: RUN_ID,
    revision: NATIVE09_REPAIR_REVISION,
    workload: { run_id: RUN_ID, source: NATIVE09_REPAIR_PATH, revision: NATIVE09_REPAIR_REVISION, test: "technical-retry" },
  };
  const secondReport = {
    status: "PASSOU",
    code: "ASSERTION_EXPECTED_REJECTION_OBSERVED",
    actual: { subject: "known-defect", value: 2 },
    expected: { subject: "known-defect", value: 2 },
    assignment_id: fixture.child.name,
    run_id: RUN_ID,
    revision: NATIVE09_REPAIR_REVISION,
    workload: { run_id: RUN_ID, source: NATIVE09_REPAIR_PATH, revision: NATIVE09_REPAIR_REVISION, test: "technical-retry" },
  };
  const emit = (nestedEvent) => fixture.session.consumeLogical(subagentEvent({
    allocatedId: fixture.allocatedId,
    agent: fixture.child.agent,
    nestedEvent,
  }));

  assert.doesNotThrow(() => {
    emit(nestedRetryCommandEvent({ phase: "start", callId: NATIVE09_REPAIR_FIRST_COMMAND }));
    emit(nestedRetryCommandEvent({
      phase: "end",
      callId: NATIVE09_REPAIR_FIRST_COMMAND,
      isError: true,
      exitCode: 17,
      report: firstReport,
    }));
    recordNative09BackendRepairWrite(fixture.session, fixture.allocatedId, fixture.child);
    emit(nestedRetryCommandEvent({ phase: "start", callId: NATIVE09_REPAIR_SECOND_COMMAND }));
    emit(nestedRetryCommandEvent({
      phase: "end",
      callId: NATIVE09_REPAIR_SECOND_COMMAND,
      isError: false,
      exitCode: 0,
      report: secondReport,
    }));
    fixture.session.consumeLogical(lifecycleFrame({
      id: fixture.allocatedId,
      agent: fixture.child.agent,
      parentToolCallId: fixture.rootCallId,
      status: "completed",
    }));
  }, "exact Native09 backend retry scope must admit its observed pre-write FAIL and post-write PASSOU commands");

  const commandResults = fixture.session.evidence.command_results;
  assert.equal(commandResults.length, 4, "the backend retry command seam must retain both START/END pairs");
  assert.deepEqual(
    commandResults.map((record) => [record.phase, record.correlation?.tool_call_id]),
    [
      ["start", NATIVE09_REPAIR_FIRST_COMMAND],
      ["end", NATIVE09_REPAIR_FIRST_COMMAND],
      ["start", NATIVE09_REPAIR_SECOND_COMMAND],
      ["end", NATIVE09_REPAIR_SECOND_COMMAND],
    ],
    "the two observed retry commands must retain distinct command IDs and exact START/END correlation",
  );
  const [firstStart, firstEnd, secondStart, secondEnd] = commandResults;
  assert.notEqual(firstEnd.correlation.tool_call_id, secondEnd.correlation.tool_call_id, "pre/post retry commands must use distinct command IDs");
  for (const [label, record, callId] of [
    ["first", firstEnd, NATIVE09_REPAIR_FIRST_COMMAND],
    ["second", secondEnd, NATIVE09_REPAIR_SECOND_COMMAND],
  ]) {
    assert.equal(record.command_label, RETRY_COMMAND, `${label} command must retain the exact approved RETRY_COMMAND`);
    assert.equal(record.root_session_id, ROOT_SESSION_ID, `${label} command must retain the observed Root session identity`);
    assert.equal(record.parent_tool_call_id, fixture.rootCallId, `${label} command must retain the observed Root parent call identity`);
    assert.equal(record.allocated_id, fixture.allocatedId, `${label} command must retain the observed opaque allocated child identity`);
    assert.equal(record.assignment_id, fixture.child.name, `${label} command must retain the observed backend assignment identity`);
    assert.equal(record.run_id, RUN_ID, `${label} command must retain the actual logical run identity`);
    assert.equal(record.revision, NATIVE09_REPAIR_REVISION, `${label} command must retain the actual retry revision`);
    assert.equal(record.correlation.status, "matched", `${label} command END must correlate to its own START`);
    assert.equal(record.correlation.tool_call_id, callId, `${label} command END must retain its own tool call identity`);
    assert.equal(record.correlation.identity_match, true, `${label} command END must retain the allocated-child identity match`);
    assert.equal(record.correlation.task_match, true, `${label} command END must retain the task correlation result`);
    assert.equal(record.identity.matches.observed_binding, true, `${label} command must retain the Root-derived observed binding`);
    assert.equal(record.observed.present, true, `${label} command must retain an actual terminal observation`);
    assert.equal(record.observed.source, "terminal_event", `${label} command must retain terminal-event command provenance`);
    assert.equal(record.observed.invocation.sha256, record.command_sha256, `${label} command must retain the recorded invocation hash`);
    assert.ok(Number.isSafeInteger(record.start_sequence), `${label} command must retain its observed START sequence`);
    assert.ok(Number.isSafeInteger(record.sequence), `${label} command must retain its observed END sequence`);
    assert.ok(record.sequence > record.start_sequence, `${label} command END must follow its correlated START`);
    assert.ok(record.end_workflow_ordinal > record.start_workflow_ordinal, `${label} command END must follow its correlated START workflow ordinal`);
  }
  assert.equal(firstStart.root_session_id, ROOT_SESSION_ID, "the pre-write command START must retain the observed Root session identity");
  assert.equal(firstStart.parent_tool_call_id, fixture.rootCallId, "the pre-write command START must retain the observed Root parent identity");
  assert.equal(firstStart.allocated_id, fixture.allocatedId, "the pre-write command START must retain the observed allocated identity");
  assert.equal(firstEnd.report.status, "FAIL", "the pre-write command must retain the observed solution FAIL report");
  assert.equal(firstEnd.report.failure_origin, "SOLUTION", "the pre-write command must retain the observed solution failure origin");
  assert.equal(firstEnd.exit_code, 17, "the pre-write command must retain its observed nonzero exit code");
  assert.equal(firstEnd.is_error, true, "the pre-write command must retain explicit isError:true");
  assert.equal(secondStart.root_session_id, ROOT_SESSION_ID, "the post-write command START must retain the observed Root session identity");
  assert.equal(secondStart.parent_tool_call_id, fixture.rootCallId, "the post-write command START must retain the observed Root parent identity");
  assert.equal(secondStart.allocated_id, fixture.allocatedId, "the post-write command START must retain the observed allocated identity");
  assert.equal(secondEnd.report.status, "PASSOU", "the post-write command must retain the observed PASSOU report");
  assert.equal(secondEnd.exit_code, 0, "the post-write command must retain its observed zero exit code");
  assert.equal(secondEnd.is_error, false, "the post-write command must retain explicit isError:false");
  const [writeEnd] = fixture.session.evidence.subagent_writes.filter((record) => record.phase === "end");
  assert.ok(writeEnd, "the command seam must retain the successful backend write END between the two commands");
  assert.ok(writeEnd.sequence > firstEnd.sequence && writeEnd.sequence < secondEnd.sequence, "the backend write must be observed between the FAIL and PASSOU command terminals");
}

function native09BackendRetryCommandActualFailureFooter(apis, root) {
  const fixture = makeNative09BackendRepairFixture(apis, root, {
    rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-actual-failure-footer`,
    writeCount: 0,
    completeLifecycle: false,
  });
  const firstReport = {
    schema_version: 1,
    nonce: NATIVE09_REPAIR_NONCE,
    status: "FAIL",
    code: "ASSERTION_EXPECTED_REJECTION",
    failure_origin: "SOLUTION",
    origin: "SOLUTION",
    actual: { subject: "known-defect", value: 1 },
    expected: { subject: "known-defect", value: 2 },
    assignment_id: fixture.child.name,
    run_id: RUN_ID,
    revision: NATIVE09_REPAIR_REVISION,
    workload: { run_id: RUN_ID, source: NATIVE09_REPAIR_PATH, revision: NATIVE09_REPAIR_REVISION, test: "technical-retry" },
  };
  const secondReport = {
    schema_version: 1,
    nonce: NATIVE09_REPAIR_NONCE,
    status: "PASSOU",
    code: "ASSERTION_EXPECTED_REJECTION_OBSERVED",
    actual: { subject: "known-defect", value: 2 },
    expected: { subject: "known-defect", value: 2 },
    assignment_id: fixture.child.name,
    run_id: RUN_ID,
    revision: NATIVE09_REPAIR_REVISION,
    workload: { run_id: RUN_ID, source: NATIVE09_REPAIR_PATH, revision: NATIVE09_REPAIR_REVISION, test: "technical-retry" },
  };
  const emit = (nestedEvent) => fixture.session.consumeLogical(subagentEvent({
    allocatedId: fixture.allocatedId,
    agent: fixture.child.agent,
    nestedEvent,
  }));
  const actualFailureText = `${JSON.stringify(firstReport, null, 2)}\n\n\nWall time: 1.15 seconds\nTimeout clamped to 3600s (requested 120000s; allowed range 1-3600s).\n\nCommand exited with code 17`;

  assert.doesNotThrow(() => {
    emit(nestedRetryCommandEvent({ phase: "start", callId: NATIVE09_REPAIR_FIRST_COMMAND }));
    emit(nestedRetryCommandEvent({
      phase: "end",
      callId: NATIVE09_REPAIR_FIRST_COMMAND,
      isError: true,
      exitCode: 17,
      reportText: actualFailureText,
    }));
    recordNative09BackendRepairWrite(fixture.session, fixture.allocatedId, fixture.child);
    emit(nestedRetryCommandEvent({ phase: "start", callId: NATIVE09_REPAIR_SECOND_COMMAND }));
    emit(nestedRetryCommandEvent({
      phase: "end",
      callId: NATIVE09_REPAIR_SECOND_COMMAND,
      isError: false,
      exitCode: 0,
      report: secondReport,
    }));
    fixture.session.consumeLogical(lifecycleFrame({
      id: fixture.allocatedId,
      agent: fixture.child.agent,
      parentToolCallId: fixture.rootCallId,
      status: "completed",
    }));
  }, "the actual backend failure footer must remain consumable without changing retry ordering or ownership");

  const commandResults = fixture.session.evidence.command_results;
  assert.equal(commandResults.length, 4, "the actual footer retry fixture must retain both START/END command pairs");
  const [firstStart, firstEnd, secondStart, secondEnd] = commandResults;
  assert.deepEqual(
    commandResults.map((record) => [record.phase, record.correlation?.tool_call_id]),
    [
      ["start", NATIVE09_REPAIR_FIRST_COMMAND],
      ["end", NATIVE09_REPAIR_FIRST_COMMAND],
      ["start", NATIVE09_REPAIR_SECOND_COMMAND],
      ["end", NATIVE09_REPAIR_SECOND_COMMAND],
    ],
    "the actual footer must not alter START/END pairing or command identity",
  );
  assert.equal(firstStart.correlation.tool_call_id, firstEnd.correlation.tool_call_id, "the first actual footer END must retain its correlated START identity");
  assert.equal(secondStart.correlation.tool_call_id, secondEnd.correlation.tool_call_id, "the second command END must retain its correlated START identity");
  assert.equal(firstEnd.report?.status, "FAIL", "the actual footer must retain the semantic FAIL report");
  assert.equal(firstEnd.report?.nonce, NATIVE09_REPAIR_NONCE, "the actual footer must retain the report nonce");
  assert.equal(firstEnd.report?.run_id, RUN_ID, "the actual footer must retain the report run identity");
  assert.equal(firstEnd.report?.revision, NATIVE09_REPAIR_REVISION, "the actual footer must retain the report revision");
  assert.equal(firstEnd.report?.assignment_id, fixture.child.name, "the actual footer must retain the report assignment identity");
  assert.deepEqual(JSON.parse(JSON.stringify(firstEnd.report?.actual)), firstReport.actual, "the actual footer must retain the observed FAIL actual value");
  assert.deepEqual(JSON.parse(JSON.stringify(firstEnd.report?.expected)), firstReport.expected, "the actual footer must retain the observed FAIL expected value");
  assert.deepEqual(JSON.parse(JSON.stringify(firstEnd.report?.workload)), firstReport.workload, "the actual footer must retain the bound workload tuple");
  assert.equal(firstEnd.exit_code, 17, "the actual footer must retain the observed nonzero exit code");
  assert.equal(firstEnd.exit_code_observed, true, "the actual footer must retain observed exit-code provenance");
  assert.equal(firstEnd.is_error, true, "the actual footer must retain explicit isError:true");
  assert.equal(firstEnd.is_error_observed, true, "the actual footer must retain observed isError provenance");
  assert.equal(secondEnd.report?.status, "PASSOU", "the post-write command must retain the observed PASSOU report");
  assert.equal(secondEnd.exit_code, 0, "the post-write command must retain its observed zero exit code");
  assert.equal(secondEnd.is_error, false, "the post-write command must retain explicit isError:false");
  for (const record of [firstEnd, secondEnd]) {
    assert.equal(record.command_label, RETRY_COMMAND, "each command must retain the exact approved retry command");
    assert.equal(record.command_sha256, sha256Text(RETRY_COMMAND), "each command must retain the approved retry command hash");
    assert.equal(record.root_session_id, ROOT_SESSION_ID, "each command must retain the observed Root session identity");
    assert.equal(record.parent_tool_call_id, fixture.rootCallId, "each command must retain the observed Root parent identity");
    assert.equal(record.allocated_id, fixture.allocatedId, "each command must retain the observed allocated child identity");
    assert.equal(record.revision, NATIVE09_REPAIR_REVISION, "each command must retain the observed retry revision");
  }
  const [writeEnd] = fixture.session.evidence.subagent_writes.filter((record) => record.phase === "end");
  assert.ok(writeEnd, "the actual footer retry fixture must retain the successful backend write END");
  assert.ok(writeEnd.sequence > firstEnd.sequence && writeEnd.sequence < secondEnd.sequence, "the backend write must remain ordered between the FAIL and PASSOU terminals");

  const malformedFixture = makeNative09BackendRepairFixture(apis, root, {
    rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-malformed-failure-footer`,
    writeCount: 0,
    completeLifecycle: false,
  });
  const malformedEmit = (nestedEvent) => malformedFixture.session.consumeLogical(subagentEvent({
    allocatedId: malformedFixture.allocatedId,
    agent: malformedFixture.child.agent,
    nestedEvent,
  }));
  const malformedFooterText = `${JSON.stringify(firstReport, null, 2)}\n\n\nWall time: 1.15 seconds\nUnexpected warning\n\nCommand exited with code 17`;
  malformedEmit(nestedRetryCommandEvent({ phase: "start", callId: NATIVE09_REPAIR_FIRST_COMMAND }));
  malformedEmit(nestedRetryCommandEvent({
    phase: "end",
    callId: NATIVE09_REPAIR_FIRST_COMMAND,
    isError: true,
    exitCode: 17,
    reportText: malformedFooterText,
  }));
  const malformedEnd = malformedFixture.session.evidence.command_results.at(-1);
  assert.equal(malformedEnd.report, null, "an unknown warning suffix must not be accepted as a valid FAIL report");
  assert.equal(malformedEnd.exit_code, 17, "a malformed report suffix must not erase the observed exit code");
  assert.equal(malformedEnd.is_error, true, "a malformed report suffix must not erase explicit isError:true");
}

function native09BackendRetryCommandGuardsMustBlock(apis, root) {
  const variants = [
    ["unscoped Native09 label", {
      label: NATIVE09_REPAIR_UNSCOPED_LABEL,
      agent: "backend-developer",
      command: RETRY_COMMAND,
    }],
    ["non-backend role", {
      label: NATIVE09_REPAIR_LABEL,
      agent: "peer-reviewer",
      command: RETRY_COMMAND,
    }],
    ["wrong command", {
      label: NATIVE09_REPAIR_LABEL,
      agent: "backend-developer",
      command: "node app/.omp/state/native-tooling/not-retry-check.mjs",
    }],
  ];
  for (const [name, options] of variants) {
    const child = assignment(`Native09CommandGuard${name.replaceAll(/[^a-z0-9]+/gi, "")}`, options.agent, `Command guard case: ${name}.`);
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      label: options.label,
      child,
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-command-guard-${name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      writeCount: 0,
      completeLifecycle: false,
    });
    expectedBlocked(
      () => fixture.session.consumeLogical(subagentEvent({
        allocatedId: fixture.allocatedId,
        agent: fixture.child.agent,
        nestedEvent: nestedRetryCommandEvent({
          phase: "start",
          callId: `${fixture.rootCallId}-command`,
          command: options.command,
        }),
      })),
      `${name} must not gain Native09 backend retry command authority`,
    );
    const [record] = fixture.session.evidence.command_results;
    assert.ok(record, `${name} must retain the observed refused command guard record`);
    assert.equal(record.root_session_id, ROOT_SESSION_ID, `${name} guard record must retain the observed Root session identity`);
    assert.equal(record.parent_tool_call_id, fixture.rootCallId, `${name} guard record must retain the observed Root parent identity`);
    assert.equal(record.allocated_id, fixture.allocatedId, `${name} guard record must retain the observed allocated identity`);
    assert.ok(record.guard?.reason_code, `${name} guard record must expose a concrete refusal reason`);
  }

  {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-command-guard-foreign-child`,
      writeCount: 0,
      completeLifecycle: false,
    });
    expectedBlocked(
      () => fixture.session.consumeLogical(subagentEvent({
        allocatedId: `${fixture.allocatedId}-foreign`,
        agent: fixture.child.agent,
        nestedEvent: nestedRetryCommandEvent({
          phase: "start",
          callId: `${fixture.rootCallId}-foreign-child`,
          nestedId: `${fixture.allocatedId}-foreign`,
          nestedJobId: `${fixture.rootJobId}-foreign`,
          nestedInstanceId: `${fixture.rootJobId}-foreign-instance`,
        }),
      })),
      "a retry command from a foreign allocated child must remain refused",
    );
    assert.equal(fixture.session.evidence.command_results.length, 0, "a foreign allocated child must not create a command result");
  }

  {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-command-guard-unknown-end`,
      writeCount: 0,
      completeLifecycle: false,
    });
    expectedBlocked(
      () => fixture.session.consumeLogical(subagentEvent({
        allocatedId: fixture.allocatedId,
        agent: fixture.child.agent,
        nestedEvent: nestedRetryCommandEvent({
          phase: "end",
          callId: `${fixture.rootCallId}-never-started`,
          isError: true,
          exitCode: 17,
          report: { status: "FAIL", failure_origin: "SOLUTION", actual: 1, expected: 2 },
        }),
      })),
      "a retry command END without its matching START must remain refused",
    );
  }

  {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-command-guard-task-drift`,
      writeCount: 0,
      completeLifecycle: false,
    });
    const callId = `${fixture.rootCallId}-task-drift`;
    expectedBlocked(
      () => {
        fixture.session.consumeLogical(subagentEvent({
          allocatedId: fixture.allocatedId,
          agent: fixture.child.agent,
          nestedEvent: nestedRetryCommandEvent({ phase: "start", callId, taskId: "task-before" }),
        }));
        fixture.session.consumeLogical(subagentEvent({
          allocatedId: fixture.allocatedId,
          agent: fixture.child.agent,
          nestedEvent: nestedRetryCommandEvent({
            phase: "end",
            callId,
            taskId: "task-after",
            isError: true,
            exitCode: 17,
            report: { status: "FAIL", failure_origin: "SOLUTION", actual: 1, expected: 2 },
          }),
        }));
      },
      "a retry command END with a foreign task correlation ID must remain refused",
    );
  }
}


function native09BackendBareEvidenceMustNotGrantAuthority(apis, root) {
  const fixture = makeNative09BackendRepairFixture(apis, root, {
    rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-bare`,
    writeCount: 0,
  });
  recordNative09BackendRepairTerminal(fixture, "wait", { waitCallId: `${fixture.rootCallId}-wait` });
  const [record] = fixture.session.evidence.task_records;
  assert.ok(record, "the unavailable-schema wait fixture must retain its observed terminal record for the bare-proof check");
  assert.equal(fixture.session.evidence.subagent_writes.length, 0, "the bare-proof fixture must have no observed backend write");
  const forged = structuredClone(record);
  forged.independent_evidence = { observed: true, kind: NATIVE09_REPAIR_PROOF_KIND, count: 1 };
  assert.equal(apis.taskRecordSucceeded(forged), false, "bare observed/kind/count evidence must not grant backend completion authority");
}

function native09BackendInvalidCompletionInputsMustReject(apis, root) {
  for (const [name, options] of [
    ["missing successful write", { writeCount: 0 }],
    ["failed write", { writeError: true }],
    ["duplicate successful writes", { writeCount: 2 }],
  ]) {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-${name.replaceAll(/[^a-z0-9]+/gi, "-")}`,
      ...options,
    });
    fixture.session.recordTool(waitStart(`${fixture.rootCallId}-wait`));
    waitMustNotSucceed(
      apis,
      fixture.session,
      waitEnd(
        `${fixture.rootCallId}-wait`,
        native09BackendWaitJob({ id: fixture.rootJobId, agentUrlId: fixture.allocatedId, label: fixture.child.name }),
      ),
      name,
    );
  }

  expectedBlocked(
    () => makeNative09BackendRepairFixture(apis, root, {
      label: NATIVE09_REPAIR_UNSCOPED_LABEL,
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-unscoped`,
    }),
    "the same backend role without the exact Native09 repair scope label",
  );
  expectedBlocked(
    () => makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-outside`,
      writePath: "app/bin/not-the-private-cli.mjs",
    }),
    "a backend write outside the exact private CLI allowlist",
  );

  {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-unknown-write`,
      writeCount: 0,
    });
    expectedBlocked(
      () => fixture.session.consumeLogical(subagentEvent({
        allocatedId: fixture.allocatedId,
        agent: fixture.child.agent,
        nestedEvent: nestedWriteEvent({ phase: "end", callId: `${fixture.rootCallId}-unknown-end` }),
      })),
      "a write END without a matching START",
    );
  }
  {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-foreign-write`,
      writeCount: 0,
    });
    expectedBlocked(
      () => fixture.session.consumeLogical(subagentEvent({
        allocatedId: "opaque-native09-foreign-allocated",
        agent: fixture.child.agent,
        nestedEvent: nestedWriteEvent({ phase: "start", callId: `${fixture.rootCallId}-foreign-write` }),
      })),
      "a backend write from a foreign allocated child",
    );
  }
  {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-foreign-job`,
    });
    expectedBlocked(
      () => recordNative09BackendRepairTerminal(fixture, "custom", { agentId: "opaque-native09-foreign-allocated" }),
      "a completed backend job owned by a foreign child",
    );
  }
  {
    const fixture = makeNative09BackendRepairFixture(apis, root, {
      rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-unknown-job`,
    });
    expectedBlocked(
      () => recordNative09BackendRepairTerminal(fixture, "custom", { jobId: "opaque-native09-unknown-sdk-job" }),
      "a completed backend job with an unknown SDK job identity",
    );
  }
  {
    const child = native09BackendRepairAssignment();
    const session = createSession(apis.NativeRpcSession, root, [child], `${NATIVE09_REPAIR_LABEL}-missing-root`);
    expectedBlocked(
      () => session.consumeLogical(asyncMessage(native09BackendCustomJob({ agentId: NATIVE09_REPAIR_ALLOCATED_ID }))),
      "a backend completion without an observed Root dispatch",
    );
  }
}

function native09BackendManagerStatusesMustReject(apis, root) {
  for (const status of ["failed", "cancelled"]) {
    for (const channel of ["custom", "wait"]) {
      const fixture = makeNative09BackendRepairFixture(apis, root, {
        rootCallId: `${NATIVE09_REPAIR_ROOT_CALL}-${status}-${channel}`,
      });
      if (channel === "custom") {
        expectedBlocked(
          () => recordNative09BackendRepairTerminal(fixture, channel, { status }),
          `${channel} backend manager ${status} status`,
        );
      } else {
        recordNative09BackendRepairTerminal(fixture, channel, { status });
        assert.equal(
          fixture.session.evidence.task_records.some((record) => apis.taskRecordSucceeded(record)),
          false,
          `${channel} backend manager ${status} status must never satisfy the shared success predicate`,
        );
      }
    }
  }
}

function native09BackendAmbiguousOwnerMustReject(apis, root) {
  const first = native09BackendRepairAssignment();
  const second = assignment(
    "Native09TechnicalRetryBackendDeveloperSecond",
    "backend-developer",
    "Second backend assignment intentionally creates an ambiguous Root owner.",
  );
  const sharedJobId = "opaque-native09-ambiguous-sdk-job";
  const session = createSession(apis.NativeRpcSession, root, [first, second], NATIVE09_REPAIR_LABEL);
  for (const [index, child] of [first, second].entries()) {
    const rootCallId = `${NATIVE09_REPAIR_ROOT_CALL}-ambiguous-${index}`;
    const allocatedId = `opaque-native09-ambiguous-allocated-${index}`;
    session.recordTool(rootStart(rootCallId, [child]));
    session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId }));
    session.recordTool(rootEnd(rootCallId, sharedJobId, [progressRow(child, allocatedId)]));
    session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId, status: "completed" }));
  }
  const job = native09BackendWaitJob({ id: sharedJobId, label: first.name });
  delete job.agentUrlId;
  session.recordTool(waitStart(`${NATIVE09_REPAIR_ROOT_CALL}-ambiguous-wait`));
  expectedBlocked(
    () => session.recordTool(waitEnd(`${NATIVE09_REPAIR_ROOT_CALL}-ambiguous-wait`, job)),
    "a wait terminal with two equally valid Root/lifecycle owners",
  );
}

function recordObservedWaitRoot(session, rootCallId, child, allocatedId, rootJobId) {
  session.recordTool(rootStart(rootCallId, [child]));
  session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId }));
  session.recordTool(rootEnd(rootCallId, rootJobId, [progressRow(child, allocatedId)]));
  session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId, status: "completed" }));
}

function recordObservedBatchRoot(session, rootCallId, children, allocatedIds, firstJobId) {
  session.recordTool(rootStart(rootCallId, children));
  for (const [index, child] of children.entries()) {
    session.consumeLogical(lifecycleFrame({ id: allocatedIds[index], index, agent: child.agent, parentToolCallId: rootCallId }));
  }
  session.recordTool(rootEnd(
    rootCallId,
    firstJobId,
    children.map((child, index) => progressRow(child, allocatedIds[index], index)),
  ));
  for (const [index, child] of children.entries()) {
    session.consumeLogical(lifecycleFrame({ id: allocatedIds[index], index, agent: child.agent, parentToolCallId: rootCallId, status: "completed" }));
  }
}

function waitMustNotSucceed(apis, session, frame, name) {
  let caught = null;
  try {
    session.recordTool(frame);
  } catch (error) {
    caught = error;
  }
  if (caught) {
    assert.equal(caught.kind, "BLOCKED", `${name} must fail closed as BLOCKED`);
    return;
  }
  const records = waitRecords(session);
  assert.equal(records.some((record) => apis.taskRecordSucceeded(record)), false, `${name} must never be an authoritative success`);
}
function waitMustBlock(operation, name) {
  let caught = null;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${name} must not return normally`);
  assert.equal(caught.kind, "BLOCKED", `${name} must fail closed as BLOCKED`);
}

function preserveHistoricalProbe(options) {
  assert.ok(fs.existsSync(options.baseline), `historical 43-case probe must remain available: ${options.baseline}`);
  const source = fs.readFileSync(options.baseline, "utf8");
  assert.match(source, /execute waits for settled session after early awaitingAsyncWork/, "historical probe must retain its execute/settlement coverage");
  assert.match(source, /execute blocks settled Root with missing second child completion/, "historical probe must retain its missing-child settlement coverage");
  return {
    status: "PRESERVED_NOT_EXECUTED",
    path: options.baseline,
    reason: "parent runs the RED command once; historical probe bytes remain untouched",
  };
}

function flatTwoCallPositive(apis, root) {
  const first = assignment("FlatValidator", "validator", "Flat call A canonical task.");
  const second = assignment("FlatBackend", "backend-developer", "Flat call B canonical task.");
  const session = createSession(apis.NativeRpcSession, root, [first, second]);

  session.recordTool(rootStart(ROOT_CALL_A, [first]));
  session.consumeLogical(lifecycleFrame({ id: ALLOCATED_A, agent: first.agent, parentToolCallId: ROOT_CALL_A }));
  session.recordTool(rootEnd(ROOT_CALL_A, SDK_JOB_A, [progressRow(first, ALLOCATED_A)]));

  session.recordTool(rootStart(ROOT_CALL_B, [second]));
  session.consumeLogical(lifecycleFrame({ id: ALLOCATED_B, agent: second.agent, parentToolCallId: ROOT_CALL_B }));
  session.recordTool(rootEnd(ROOT_CALL_B, SDK_JOB_B, [progressRow(second, ALLOCATED_B)]));

  session.consumeLogical(lifecycleFrame({ id: ALLOCATED_A, agent: first.agent, parentToolCallId: ROOT_CALL_A, status: "completed" }));
  session.consumeLogical(lifecycleFrame({ id: ALLOCATED_B, agent: second.agent, parentToolCallId: ROOT_CALL_B, status: "completed" }));

  assert.doesNotThrow(() => session.consumeLogical(asyncMessage(asyncJob(SDK_JOB_A, ALLOCATED_A, "FLAT_A"))), "one valid flat async call must remain admissible when another flat Root call exists");
  assert.doesNotThrow(() => session.consumeLogical(asyncMessage(asyncJob(SDK_JOB_B, ALLOCATED_B, "FLAT_B"))), "the second valid flat async call must remain independently admissible");
  const records = asyncRecords(session);
  assert.equal(records.length, 2, "two independent flat calls must yield two authoritative async records");
  assert.deepEqual(records.map((record) => record.parent_tool_call_id).sort(), [ROOT_CALL_A, ROOT_CALL_B].sort(), "each async record must retain its owning Root call");
}

function nestedIdentityPositive(apis, root) {
  const child = assignment("NestedValidator", "validator", "Nested validator canonical task.");
  const session = createSession(apis.NativeRpcSession, root, [child], "native09-technical-retry-first");
  session.recordTool(rootStart(ROOT_CALL_SINGLE, [child]));
  session.consumeLogical(lifecycleFrame({ id: ALLOCATED_SINGLE, agent: child.agent, parentToolCallId: ROOT_CALL_SINGLE }));
  session.recordTool(rootEnd(ROOT_CALL_SINGLE, SDK_JOB_SINGLE, [progressRow(child, ALLOCATED_SINGLE)]));

  const nestedCall = "nested-bash-valid";
  session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_SINGLE,
    agent: child.agent,
    nestedEvent: nestedBashEvent({ phase: "start", callId: nestedCall, includeCommand: true }),
  }));
  assert.doesNotThrow(() => session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_SINGLE,
    agent: child.agent,
    nestedEvent: nestedBashEvent({ phase: "end", callId: nestedCall }),
  })), "nested terminal with the allocated identity must remain admissible");
  const [record] = session.evidence.command_results;
  assert.equal(record?.allocated_id, ALLOCATED_SINGLE, "valid nested command remains bound to its allocated child");
  assert.equal(record?.parent_tool_call_id, ROOT_CALL_SINGLE, "valid nested command retains its Root parent");
}

function nestedIdentityConflictMustBlock(apis, root) {
  const child = assignment("NestedValidator", "validator", "Nested validator canonical task.");
  const session = createSession(apis.NativeRpcSession, root, [child], "native09-technical-retry-first");
  session.recordTool(rootStart(ROOT_CALL_SINGLE, [child]));
  session.consumeLogical(lifecycleFrame({ id: ALLOCATED_SINGLE, agent: child.agent, parentToolCallId: ROOT_CALL_SINGLE }));
  session.recordTool(rootEnd(ROOT_CALL_SINGLE, SDK_JOB_SINGLE, [progressRow(child, ALLOCATED_SINGLE)]));

  const nestedCall = "nested-bash-conflicting-identity";
  session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_SINGLE,
    agent: child.agent,
    nestedEvent: nestedBashEvent({ phase: "start", callId: nestedCall, includeCommand: true }),
  }));
  expectedBlocked(() => session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_SINGLE,
    agent: child.agent,
    nestedEvent: nestedBashEvent({ phase: "end", callId: nestedCall, nestedId: FOREIGN_NESTED_ID, nestedJobId: FOREIGN_NESTED_JOB, includeNestedIdentity: true }),
  })), "nested terminal whose agentId/jobId/instanceId conflicts with the allocated outer identity");
}
function earlyNestedFixture(apis, root) {
  const child = assignment("EarlyNestedValidator", "validator", "Early nested SDK identity canonical task.");
  const session = createSession(apis.NativeRpcSession, root, [child], "native09-technical-retry-first");
  session.recordTool(rootStart(ROOT_CALL_EARLY, [child]));
  session.consumeLogical(lifecycleFrame({ id: ALLOCATED_EARLY, agent: child.agent, parentToolCallId: ROOT_CALL_EARLY }));
  session.recordTool(rootEnd(ROOT_CALL_EARLY, SDK_JOB_EARLY, [progressRow(child, ALLOCATED_EARLY)]));
  assert.equal(asyncRecords(session).length, 0, "early nested identity cases must observe the child tool before custom async-result delivery");
  return { child, session };
}

function earlyNestedSdkJobMismatchMustBlock(apis, root) {
  const { child, session } = earlyNestedFixture(apis, root);
  const nestedCall = "nested-bash-early-sdk-mismatch";
  session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_EARLY,
    agent: child.agent,
    nestedEvent: nestedBashEvent({ phase: "start", callId: nestedCall, includeCommand: true }),
  }));
  expectedBlocked(() => session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_EARLY,
    agent: child.agent,
    nestedEvent: nestedBashEvent({ phase: "end", callId: nestedCall, nestedJobId: SDK_JOB_EARLY_MISMATCH, includeNestedJobIdentity: true }),
  })), "early nested terminal with an SDK job ID different from its owning Root END must be BLOCKED");
}

function earlyNestedSdkAliasContradictionMustBlock(apis, root) {
  const { child, session } = earlyNestedFixture(apis, root);
  const nestedCall = "nested-bash-early-sdk-alias-contradiction";
  session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_EARLY,
    agent: child.agent,
    nestedEvent: nestedBashEvent({ phase: "start", callId: nestedCall, includeCommand: true }),
  }));
  expectedBlocked(() => session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_EARLY,
    agent: child.agent,
    nestedEvent: nestedBashEvent({
      phase: "end",
      callId: nestedCall,
      nestedJobId: SDK_JOB_EARLY,
      nestedJobIdAlias: SDK_JOB_EARLY_ALIAS,
      includeNestedJobIdentity: true,
    }),
  })), "one nested event exposing contradictory jobId/job_id aliases must be BLOCKED");
}

function earlyNestedOwningSdkJobPositive(apis, root) {
  const { child, session } = earlyNestedFixture(apis, root);
  const nestedCall = "nested-bash-early-sdk-owner";
  session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_EARLY,
    agent: child.agent,
    nestedEvent: nestedBashEvent({ phase: "start", callId: nestedCall, includeCommand: true }),
  }));
  assert.doesNotThrow(() => session.consumeLogical(subagentEvent({
    allocatedId: ALLOCATED_EARLY,
    agent: child.agent,
    nestedEvent: nestedBashEvent({ phase: "end", callId: nestedCall, nestedJobId: SDK_JOB_EARLY, includeNestedJobIdentity: true }),
  })), "early nested terminal with the owning Root SDK job ID must remain admissible");
  assert.equal(session.evidence.command_results.length, 2, "the accepted early nested command must retain its start and terminal observations");
  const record = session.evidence.command_results.at(-1);
  assert.equal(record?.allocated_id, ALLOCATED_EARLY, "accepted early nested SDK identity remains bound to its allocated child");
  assert.equal(record?.parent_tool_call_id, ROOT_CALL_EARLY, "accepted early nested SDK identity retains its Root parent");
  assert.notEqual(record?.job_id, SDK_JOB_EARLY, "host-derived binding.job_id must remain distinct from the SDK jobId");
}

function postEndActualWireShapeIsAccepted(apis, root) {
  const child = assignment("AsyncContinuation", "validator", "Async continuation canonical task.");
  const session = createSession(apis.NativeRpcSession, root, [child]);
  session.recordTool(rootStart(ROOT_CALL_SINGLE, [child]));
  session.consumeLogical(lifecycleFrame({ id: ALLOCATED_SINGLE, agent: child.agent, parentToolCallId: ROOT_CALL_SINGLE }));
  session.recordTool(rootEnd(ROOT_CALL_SINGLE, SDK_JOB_SINGLE, [progressRow(child, ALLOCATED_SINGLE)]));

  assert.doesNotThrow(() => session.recordTool(rootUpdate(ROOT_CALL_SINGLE, child, ALLOCATED_SINGLE, { progress: true, async: true })), "same-fullcall post-END UPDATE with correlated async progress must remain admissible");
  assert.equal(session.rootTaskCalls.get(`${ROOT_CALL_SINGLE}\u001ftask`)?.ended, true, "post-END progress must not reopen the Root call");
  assert.equal(session.evidence.root_task_ends.length, 1, "post-END progress must not create a second Root END");
}

function postEndProgressOnlyCounterexampleIsRejected(apis, root) {
  const child = assignment("AsyncContinuation", "validator", "Async continuation canonical task.");
  const session = createSession(apis.NativeRpcSession, root, [child]);
  session.recordTool(rootStart(ROOT_CALL_SINGLE, [child]));
  session.consumeLogical(lifecycleFrame({ id: ALLOCATED_SINGLE, agent: child.agent, parentToolCallId: ROOT_CALL_SINGLE }));
  session.recordTool(rootEnd(ROOT_CALL_SINGLE, SDK_JOB_SINGLE, [progressRow(child, ALLOCATED_SINGLE)]));

  expectedBlocked(() => session.recordTool(rootUpdate(ROOT_CALL_SINGLE, child, ALLOCATED_SINGLE, { progress: true, async: false })), "post-END progress-only update without the observed async binding");
}

function waitTerminalPositive(apis, root) {
  const { session } = makeWaitFixture(apis, root);
  const rawJob = waitJob();
  session.recordTool(waitStart(WAIT_CALL));
  session.recordTool(waitEnd(WAIT_CALL, rawJob));

  const records = waitRecords(session);
  assert.equal(records.length, 1, "one valid Root wait terminal must yield exactly one task_wait_result record");
  const [record] = records;
  assert.equal(record.source_kind, "task_wait_result", "wait terminal must use the private task_wait_result source kind");
  assert.equal(record.id, ALLOCATED_WAIT, "normalized record id must remain the allocated child identity");
  assert.equal(record.allocated_id, ALLOCATED_WAIT, "normalized allocated_id must remain the Root-bound child identity");
  assert.equal(record.jobId, SDK_JOB_WAIT, "normalized jobId must preserve the actual SDK wait job id");
  assert.notEqual(record.jobId, record.id, "SDK wait job id must remain distinct from the allocated child id");
  assert.equal(record.parent_tool_call_id, ROOT_CALL_WAIT, "normalized record must preserve the owning Root task call");
  assert.equal(record.index, 0, "normalized record must preserve the observed assignment index");
  assert.equal(record.assignment_id, "WaitPeerReviewer", "normalized record must preserve the exact configured assignment");
  assert.equal(record.run_id, RUN_ID, "normalized record must preserve the logical run identity");
  assert.equal(record.root_session_id, ROOT_SESSION_ID, "normalized record must preserve the observed Root session identity");
  assert.equal(record.agent, "peer-reviewer", "normalized record must preserve the observed assignment role");
  assert.equal(record.agentSource, "project", "normalized record must preserve the observed project source");
  assert.equal(record.status, "completed", "normalized record must preserve manager terminal status");
  assert.equal(record.exitCode, null, "unexposed child exitCode must remain null");
  assert.equal(record.exit_code_observed, false, "unexposed child exitCode must remain unobserved");
  assert.equal(record.isError, null, "unexposed child isError must remain null");
  assert.equal(record.is_error_observed, false, "unexposed child isError must remain unobserved");
  assert.equal(record.error, null, "unexposed child error must remain null");
  assert.equal(record.error_observed, false, "unexposed child error must remain unobserved");
  assert.equal(record.aborted, null, "unexposed child aborted must remain null");
  assert.equal(record.aborted_observed, false, "unexposed child aborted must remain unobserved");
  assert.equal(record.structured_output_status, "valid", "structured status must come from the actual wait payload");
  assert.deepEqual(record.structured_data, rawJob.structured.data, "structured data must be retained exactly for the real consumer");
  assert.equal(record.wait_result.source, "tool_execution_end.result.details.jobs", "wait provenance must identify the actual wait END jobs collection");
  assert.equal(record.wait_result.tool, "wait", "wait provenance must retain the actual tool name");
  assert.equal(record.wait_result.tool_call_id, WAIT_CALL, "wait provenance must retain the wait call id, not the parent task call id");
  assert.equal(record.wait_result.is_error, false, "wait transport success must be explicit");
  assert.equal(record.wait_result.is_error_observed, true, "wait transport error state must be observed");
  assert.equal(record.wait_result.host_workflow_ordinal, record.host_workflow_ordinal, "wait provenance and normalized record must share the observed workflow ordinal");
  assert.deepEqual(record.wait_result.job, rawJob, "wait_result.job must preserve the raw SDK snapshot without converting it to a custom message DTO");
  assert.equal(record.wait_result.host_binding.source, "observed-root-dispatch-lifecycle", "wait host binding must use the existing Root dispatch/lifecycle binding");
  assert.equal(record.wait_result.host_binding.root_session_id, ROOT_SESSION_ID, "wait host binding must retain the observed Root session");
  assert.equal(record.wait_result.host_binding.parent_tool_call_id, ROOT_CALL_WAIT, "wait host binding must retain the parent task call");
  assert.equal(record.wait_result.host_binding.allocated_id, ALLOCATED_WAIT, "wait host binding must retain the allocated child");
  assert.equal(record.wait_result.host_binding.index, 0, "wait host binding must retain the assignment index");
  assert.equal(record.wait_result.host_binding.root_task_end_is_error, false, "wait host binding must retain successful Root TASK END");
  assert.equal(apis.isAuthoritativeTaskRecord(record), true, "shared authority predicate must recognize the real wait record");
  assert.equal(apis.taskRecordSucceeded(record), true, "shared success predicate must recognize the real wait record without a test bypass");
  const reviewer = apis.validateReviewerResult(record.structured_data, {
    agent: "peer-reviewer",
    protocol_mode: "TDD_PEER_REVIEW",
    reviewed_revision: WAIT_REVISION,
  });
  assert.equal(reviewer.ok, true, "the actual structured peer consumer must accept the required revision/protocol payload");
  assert.deepEqual(reviewer.value, rawJob.structured.data, "the peer consumer must observe the same structured object retained from wait");
  assert.equal(apis.terminalRecords(session.evidence).length, 1, "terminalRecords must expose the wait record as authoritative");
  assert.equal(asyncRecords(session).length, 0, "a wait-consumed job must not require a custom async-result message");
  assert.equal(session.evidence.async_results.length, 0, "the wait positive must not fabricate or require custom async delivery");
  const rootEnd = session.evidence.root_task_ends.find((item) => item.tool_call_id === ROOT_CALL_WAIT);
  assert.equal(rootEnd?.isError, false, "the owning Root TASK END must be explicitly successful");
  assert.equal(rootEnd?.async?.state, "running", "the owning Root TASK END must remain an early pending acknowledgement");
  assert.equal(rootEnd?.async?.jobId, SDK_JOB_WAIT, "the owning Root TASK END must retain the primary SDK job id");
}
function rootWaitCorrelatedUpdatesThenActualEndPositive(apis, root) {
  for (const type of ["tool_execution_update", "tool_stream_update"]) {
    const { child, session } = makeWaitFixture(apis, root, {
      label: `native-wait-${type}-unknown-before-start-red`,
    });
    waitMustBlock(
      () => session.recordTool(waitProgressUpdate(type, `unknown-${type}-before-start`, child)),
      `${type} with an unmatched Root wait call before START`,
    );
    assert.equal(waitRecords(session).length, 0, `${type} before START must not publish a task_wait_result`);
    assert.equal(session.evidence.task_records.length, 0, `${type} before START must not publish a child terminal`);
    assert.equal(session.waitCalls.size, 0, `${type} before START must not create a wait binding`);
  }

  const variants = [
    { type: "tool_execution_update", resultKey: "partialResult", status: "running" },
    { type: "tool_stream_update", resultKey: "result", status: "completed" },
  ];
  for (const { type, resultKey, status } of variants) {
    const { child, session } = makeWaitFixture(apis, root, {
      label: `native-wait-${type}-${status}-snapshot-red`,
    });
    session.recordTool(waitStart(WAIT_CALL));
    const rootKey = `${ROOT_CALL_WAIT}\u001ftask`;
    const waitKey = `${WAIT_CALL}\u001fwait`;
    const rootBinding = session.rootTaskCalls.get(rootKey);
    const lifecycleBinding = session.lifecycleByAllocated.get(`id:${ALLOCATED_WAIT}`);
    const waitBinding = session.waitCalls.get(waitKey);
    assert.ok(rootBinding, `${type} positive must retain the observed Root TASK binding`);
    assert.ok(lifecycleBinding, `${type} positive must retain the observed child lifecycle binding`);
    assert.ok(waitBinding, `${type} positive must retain the matching Root wait START binding`);

    const update = waitProgressUpdate(type, WAIT_CALL, child, { resultKey, status });
    const details = update[resultKey].details;
    assert.equal(details.op, "wait", `${type} update must carry the documented wait operation`);
    assert.equal(details.progress, undefined, `${type} update must exercise jobs snapshots rather than progress rows`);
    assert.equal(details.jobs.length, 1, `${type} update must carry one fresh wait snapshot`);
    assert.equal(details.jobs[0].status, status, `${type} update must retain its ${status} snapshot status`);
    assert.doesNotThrow(
      () => session.recordTool(update),
      `${type} with a matching Root wait START and ${status} snapshot must remain admissible`,
    );
    assert.equal(waitRecords(session).length, 0, `${type} progress must not publish task_wait_result before END`);
    assert.equal(asyncRecords(session).length, 0, `${type} progress must not publish a custom async child result`);
    assert.equal(session.evidence.task_records.length, 0, `${type} progress must not publish any child success`);
    assert.equal(session.evidence.native_progress_terminal.length, 0, `${type} progress must not publish a child terminal`);
    assert.equal(session.yieldCalls.size, 0, `${type} progress must not grant child permissions`);
    assert.equal(session.waitCalls.get(waitKey), waitBinding, `${type} progress must not replace the matching Root wait binding`);
    assert.equal(session.rootTaskCalls.get(rootKey), rootBinding, `${type} progress must not replace the Root TASK binding`);
    assert.equal(session.lifecycleByAllocated.get(`id:${ALLOCATED_WAIT}`), lifecycleBinding, `${type} progress must not replace the child binding`);

    if (type === "tool_stream_update") {
      const wrongToolCallId = waitProgressUpdate("tool_stream_update", WAIT_CALL_SECOND, child, {
        resultKey: "result",
        status: "completed",
      });
      waitMustBlock(
        () => session.recordTool(wrongToolCallId),
        "a correlated-looking Root wait update with the wrong toolCallId",
      );
      assert.equal(waitRecords(session).length, 0, "a wrong-toolCallId update must not publish task_wait_result");
      assert.equal(session.evidence.task_records.length, 0, "a wrong-toolCallId update must not publish child success");
      assert.equal(session.waitCalls.get(waitKey), waitBinding, "a wrong-toolCallId update must not replace the matching wait binding");
      assert.equal(session.lifecycleByAllocated.get(`id:${ALLOCATED_WAIT}`), lifecycleBinding, "a wrong-toolCallId update must not replace the child binding");
      assert.equal(session.yieldCalls.size, 0, "a wrong-toolCallId update must not grant child permissions");
      assert.equal(session.evidence.native_progress_terminal.length, 0, "a wrong-toolCallId update must not publish a child terminal");
    }

    const rawJob = waitJob();
    const actualEnd = waitEnd(WAIT_CALL, rawJob);
    assert.equal(actualEnd.isError, false, "the actual correlated Root wait END must explicitly report isError:false");
    assert.doesNotThrow(
      () => session.recordTool(actualEnd),
      `the actual correlated ${type} Root wait END must remain admissible`,
    );
    const records = session.evidence.task_records;
    assert.equal(records.length, 1, "the actual Root wait END must publish exactly one terminal record");
    assert.equal(waitRecords(session).length, 1, "the actual Root wait END must publish exactly one task_wait_result");
    assert.equal(asyncRecords(session).length, 0, "the actual Root wait END must not add a custom async record");
    assert.equal(apis.terminalRecords(session.evidence).length, 1, "the actual Root wait END must be the sole authoritative terminal");
    assert.equal(apis.isAuthoritativeTaskRecord(records[0]), true, "the actual Root wait END record must be authoritative");
    assert.equal(apis.taskRecordSucceeded(records[0]), true, "the actual Root wait END record must be a successful completion");
    assert.equal(records[0].status, "completed", "the authoritative record must retain the valid completed snapshot status");
    assert.equal(records[0].jobId, SDK_JOB_WAIT, "the final authoritative record must preserve the actual SDK job id");
    assert.equal(records[0].parent_tool_call_id, ROOT_CALL_WAIT, "the final authoritative record must preserve its Root TASK parent");
    assert.equal(records[0].wait_result.tool_call_id, WAIT_CALL, "the final authoritative record must preserve the Root wait toolCallId");
    assert.equal(session.rootTaskCalls.get(rootKey), rootBinding, "the actual wait END must not replace the Root TASK binding");
  }
}
function waitRunningEndThenCompletedWaitPublishesOneValidatedAuthority(apis, root) {
  const { child, session } = makeWaitFixture(apis, root, {
    label: "native-wait-running-end-then-completed",
  });
  const runningJob = runningWaitSnapshot();
  assert.deepEqual(
    Object.keys(runningJob).sort(),
    ["agentUrlId", "id", "status", "type"],
    "the running snapshot must retain only the exact keys observed by the Native wait diagnostic",
  );

  session.recordTool(waitStart(WAIT_CALL));
  const runningUpdate = waitProgressUpdate("tool_execution_update", WAIT_CALL, child);
  runningUpdate.partialResult.details.jobs = [runningJob];
  assert.equal(runningUpdate.partialResult.details.jobs[0].status, "running", "the correlated wait UPDATE must carry the running SDK snapshot");
  assert.doesNotThrow(
    () => session.recordTool(runningUpdate),
    "a correlated running wait UPDATE must remain admissible as progress",
  );
  assert.equal(apis.terminalRecords(session.evidence).length, 0, "the running wait UPDATE must not publish terminal task authority");

  const runningEnd = waitEnd(WAIT_CALL, runningJob);
  assert.equal(runningEnd.isError, false, "the running wait END must report successful wait transport");
  assert.doesNotThrow(
    () => session.recordTool(runningEnd),
    "a correlated running wait END must remain transport-admissible without becoming child completion",
  );
  const intermediate = waitRecords(session).filter((record) => record.jobId === runningJob.id);
  assert.equal(
    intermediate.some((record) => apis.isAuthoritativeTaskRecord(record)),
    false,
    "a running wait snapshot must not become an authoritative terminal task record",
  );
  assert.equal(
    intermediate.some((record) => apis.taskRecordSucceeded(record)),
    false,
    "a running wait snapshot must not pass the shared task success predicate",
  );
  assert.equal(
    intermediate.some((record) => record.structured_output_status === "valid" || record.structured_data !== null),
    false,
    "a running wait snapshot must not authorize structured consumer approval",
  );
  assert.equal(
    apis.terminalRecords(session.evidence).length,
    0,
    "a running wait snapshot must leave terminal task authority empty",
  );

  const completedJob = waitJob({
    id: runningJob.id,
    agentUrlId: runningJob.agentUrlId,
    label: child.name,
  });
  session.recordTool(waitStart(WAIT_CALL_SECOND));
  const completedEnd = waitEnd(WAIT_CALL_SECOND, completedJob);
  assert.equal(completedEnd.isError, false, "the subsequent completed wait END must report successful wait transport");
  assert.doesNotThrow(
    () => session.recordTool(completedEnd),
    "a subsequent correlated completed wait END must be admitted",
  );

  const terminals = apis.terminalRecords(session.evidence);
  assert.equal(terminals.length, 1, "the subsequent completed snapshot must yield one valid terminal task record");
  const [record] = terminals;
  assert.equal(record.jobId, completedJob.id, "the terminal record must retain the completed SDK job identity");
  assert.equal(record.status, "completed", "the terminal record must retain the completed SDK status");
  const lifecycleBinding = [...session.lifecycleByAllocated.values()].find((binding) => binding.allocated_id === record.allocated_id);
  assert.ok(lifecycleBinding, "the completed wait record must have a matching observed child lifecycle binding");
  assert.equal(record.parent_tool_call_id, lifecycleBinding.parent_tool_call_id, "the terminal record must retain the full Root TASK parent binding");
  assert.equal(record.index, lifecycleBinding.index, "the terminal record must retain the observed child index");
  assert.equal(record.assignment_id, lifecycleBinding.assignment_name, "the terminal record must retain the exact configured assignment");
  assert.equal(record.agent, lifecycleBinding.agent, "the terminal record must retain the observed child role");
  assert.equal(record.agentSource, lifecycleBinding.agentSource, "the terminal record must retain the observed child source");
  assert.equal(record.root_session_id, session.evidence.root_session.session_id, "the terminal record must retain the observed Root session binding");
  assert.deepEqual(record.wait_result.job, completedJob, "the terminal record must preserve the actual completed wait snapshot");
  assert.deepEqual(record.structured_data, completedJob.structured.data, "the terminal record must preserve the actual completed schema.data");
  assert.equal(record.wait_result.tool_call_id, WAIT_CALL_SECOND, "the terminal record must retain the subsequent wait tool call");
  assert.equal(record.wait_result.is_error, false, "the terminal record must retain explicit successful wait transport");
  assert.equal(apis.isAuthoritativeTaskRecord(record), true, "the completed wait record must satisfy the shared authority predicate");
  assert.equal(apis.taskRecordSucceeded(record), true, "the completed wait record must satisfy the shared success predicate");
  const reviewer = apis.validateReviewerResult(record.structured_data, {
    agent: child.agent,
    protocol_mode: "TDD_PEER_REVIEW",
    reviewed_revision: WAIT_REVISION,
  });
  assert.equal(reviewer.ok, true, "only the subsequent completed schema.data may pass the real structured consumer");
  assert.deepEqual(reviewer.value, completedJob.structured.data, "the structured consumer must receive the retained completed schema.data");
}

function waitMixedRunningCompletedBatchKeepsOnlyCompletedAuthority(apis, root) {
  const first = assignment("MixedRunningPeer", "peer-reviewer", "Observe the first running member of a mixed Root wait batch.");
  const second = assignment("MixedCompletedPeer", "validator", "Observe the second completed member of a mixed Root wait batch.");
  const rootCall = "mixed-running-completed-root-call";
  const firstAllocated = "mixed-running-completed-allocated-a";
  const secondAllocated = "mixed-running-completed-allocated-b";
  const firstJobId = "mixed-running-completed-sdk-job-a";
  const secondJobId = "mixed-running-completed-sdk-job-b";
  const session = createSession(apis.NativeRpcSession, root, [first, second], "native-wait-mixed-running-completed");
  recordObservedBatchRoot(session, rootCall, [first, second], [firstAllocated, secondAllocated], firstJobId);

  const runningJob = runningWaitSnapshot({ id: firstJobId, agentUrlId: firstAllocated });
  const completedJob = waitJob({ id: secondJobId, agentUrlId: secondAllocated, label: second.name });
  session.recordTool(waitStart(WAIT_CALL_THIRD));
  const mixedEnd = waitEnd(WAIT_CALL_THIRD, null, {
    details: { op: "wait", jobs: [runningJob, completedJob] },
  });
  assert.equal(mixedEnd.isError, false, "a mixed wait END must report successful wait transport");
  assert.doesNotThrow(
    () => session.recordTool(mixedEnd),
    "a documented mixed running/completed wait batch must remain transport-admissible",
  );

  const runningRecords = waitRecords(session).filter((record) => record.jobId === runningJob.id);
  assert.equal(
    runningRecords.some((record) => apis.isAuthoritativeTaskRecord(record) || apis.taskRecordSucceeded(record)),
    false,
    "the running member of a mixed wait batch must not become terminal authority",
  );
  assert.equal(
    runningRecords.some((record) => record.structured_output_status === "valid" || record.structured_data !== null),
    false,
    "the running member of a mixed wait batch must not authorize structured approval",
  );
  assert.equal(
    apis.terminalRecords(session.evidence).some((record) => record.jobId === runningJob.id),
    false,
    "the running member of a mixed wait batch must not appear in terminal records",
  );

  const completedRecords = apis.terminalRecords(session.evidence).filter((record) => record.jobId === completedJob.id);
  assert.equal(completedRecords.length, 1, "the completed member of a mixed wait batch must yield one terminal record");
  const [record] = completedRecords;
  assert.equal(record.parent_tool_call_id, rootCall, "the completed member must retain the shared Root TASK parent binding");
  assert.equal(record.index, 1, "the completed member must retain its observed batch index");
  assert.equal(record.assignment_id, second.name, "the completed member must retain its exact assignment");
  assert.deepEqual(record.wait_result.job, completedJob, "the completed member must preserve its raw wait snapshot");
  assert.deepEqual(record.structured_data, completedJob.structured.data, "the completed member must preserve its real schema.data");
  assert.equal(apis.isAuthoritativeTaskRecord(record), true, "the completed member must satisfy the shared authority predicate");
  assert.equal(apis.taskRecordSucceeded(record), true, "the completed member must satisfy the shared success predicate");
}



function native3SharedJobAllocatedIdentityPositive(apis, root) {
  const { child, session } = makeWaitFixture(apis, root, {
    allocatedId: NATIVE3_SHARED_JOB_ID,
    rootJobId: NATIVE3_SHARED_JOB_ID,
    label: "native3-shared-job-allocated-id",
  });
  const rawJob = waitJob({
    id: NATIVE3_SHARED_JOB_ID,
    agentUrlId: NATIVE3_SHARED_JOB_ID,
    label: child.name,
  });
  session.recordTool(waitStart(WAIT_CALL));
  assert.doesNotThrow(
    () => session.recordTool(waitEnd(WAIT_CALL, rawJob)),
    "a valid Native3 wait terminal must admit equal SDK job and allocated child IDs",
  );

  const records = waitRecords(session);
  assert.equal(records.length, 1, "the shared-ID Native3 terminal must yield one authoritative record");
  const [record] = records;
  assert.deepEqual(
    {
      id: record.id,
      allocated_id: record.allocated_id,
      jobId: record.jobId,
      raw_job_id: record.wait_result.job.id,
    },
    {
      id: NATIVE3_SHARED_JOB_ID,
      allocated_id: NATIVE3_SHARED_JOB_ID,
      jobId: NATIVE3_SHARED_JOB_ID,
      raw_job_id: NATIVE3_SHARED_JOB_ID,
    },
    "the record must preserve each exact observed ID even when the SDK and allocated namespaces reuse one string",
  );
  assert.deepEqual(record.structured_data, rawJob.structured.data, "the authoritative shared-ID record must retain the real structured peer payload");
  assert.equal(apis.isAuthoritativeTaskRecord(record), true, "the shared-ID wait record must satisfy the real authority predicate");
  assert.equal(apis.taskRecordSucceeded(record), true, "the shared-ID wait record must satisfy the real success predicate");

  const binding = record.wait_result.host_binding;
  assert.deepEqual(
    {
      source: binding.source,
      root_session_id: binding.root_session_id,
      parent_tool_call_id: binding.parent_tool_call_id,
      allocated_id: binding.allocated_id,
      index: binding.index,
      agent: binding.agent,
      agentSource: binding.agentSource,
      assignment: binding.assignment,
      assignment_id: binding.assignment_id,
      root_task_end_is_error: binding.root_task_end_is_error,
    },
    {
      source: "observed-root-dispatch-lifecycle",
      root_session_id: ROOT_SESSION_ID,
      parent_tool_call_id: ROOT_CALL_WAIT,
      allocated_id: NATIVE3_SHARED_JOB_ID,
      index: 0,
      agent: child.agent,
      agentSource: "project",
      assignment: child.name,
      assignment_id: child.name,
      root_task_end_is_error: false,
    },
    "ownership must come from the independent observed Root assignment tuple",
  );
  assert.equal(typeof binding.job_id, "string", "the independent host-derived job identity must be retained");
  assert.equal(typeof binding.instance_id, "string", "the independent host-derived instance identity must be retained");
  assert.equal(binding.job_id, session.lifecycleByAllocated.get(`id:${NATIVE3_SHARED_JOB_ID}`)?.job_id, "the host-derived binding job identity must be retained independently of the SDK job string");
  assert.equal(binding.instance_id, session.lifecycleByAllocated.get(`id:${NATIVE3_SHARED_JOB_ID}`)?.instance_id, "the host-derived binding instance identity must be retained independently of the SDK job string");
  assert.equal(record.instanceId, binding.instance_id, "the record must retain the host-derived instance identity");
  assert.deepEqual(record.wait_result.job, rawJob, "the valid Root wait snapshot must remain the actual raw SDK snapshot");
}

function cumulativeRawWaitRetentionBoundMustBlockAtomically(apis, root) {
  const first = assignment("CumulativeRawPeerA", "peer-reviewer", "First independent Root wait job with bounded raw output.");
  const second = assignment("CumulativeRawPeerB", "peer-reviewer", "Second independent Root wait job with bounded raw output.");
  const firstRootCall = "cumulative-raw-root-call-a";
  const secondRootCall = "cumulative-raw-root-call-b";
  const firstAllocated = "cumulative-raw-allocated-a";
  const secondAllocated = "cumulative-raw-allocated-b";
  const firstJobId = "cumulative-raw-sdk-job-a";
  const secondJobId = "cumulative-raw-sdk-job-b";
  const firstWaitCall = "cumulative-raw-wait-call-a";
  const secondWaitCall = "cumulative-raw-wait-call-b";
  const session = createSession(apis.NativeRpcSession, root, [first, second], "native-wait-cumulative-raw-bound-red");

  recordObservedWaitRoot(session, firstRootCall, first, firstAllocated, firstJobId);
  recordObservedWaitRoot(session, secondRootCall, second, secondAllocated, secondJobId);

  const firstRaw = deterministicRawResult("A");
  const secondRaw = deterministicRawResult("B");
  const firstJob = waitJob({ id: firstJobId, agentUrlId: firstAllocated, label: first.name, resultText: firstRaw });
  const secondJob = waitJob({ id: secondJobId, agentUrlId: secondAllocated, label: second.name, resultText: secondRaw });
  session.recordTool(waitStart(firstWaitCall));
  session.recordTool(waitEnd(firstWaitCall, firstJob));

  const [firstRecord] = waitRecords(session);
  assert.ok(firstRecord, "the first independent Root wait job must be admitted");
  assert.equal(Buffer.byteLength(firstRecord.wait_result.job.resultText, "utf8"), RAW_RESULT_BYTES_PER_JOB, "the first raw resultText must remain exactly 9 MiB");
  assert.equal(sha256Text(firstRecord.wait_result.job.resultText), sha256Text(firstRaw), "the first admitted record must retain the exact raw resultText bytes");
  assert.deepEqual(firstRecord.structured_data, firstJob.structured.data, "the first admitted record must retain its valid small peer payload");
  assert.equal(firstRecord.parent_tool_call_id, firstRootCall, "the first record must retain its owning Root call");
  assert.equal(firstRecord.allocated_id, firstAllocated, "the first record must retain its allocated child ownership");
  assert.equal(firstRecord.jobId, firstJobId, "the first record must retain its actual SDK job ID");
  assert.equal(apis.taskRecordSucceeded(firstRecord), true, "the first record must be an authoritative successful completion");

  const beforeSecondEnd = {
    taskRecords: session.evidence.task_records.length,
    waitResults: session.evidence.wait_results.length,
    toolEvents: session.evidence.tool_events.length,
    captureBytes: session.evidence.capture.bytes,
    captureComplete: session.evidence.capture.complete,
    waitIdentity: [...session.waitRecordsByIdentity.entries()].map(([key, value]) => [key, value.snapshot]),
    asyncJobIds: [...session.asyncJobIdsByAllocated.entries()],
    transportJobIds: [...session.transportJobIds],
  };
  session.recordTool(waitStart(secondWaitCall));
  const toolEventsAfterStart = session.evidence.tool_events.length;
  waitMustBlock(
    () => session.recordTool(waitEnd(secondWaitCall, secondJob)),
    "the second independent 9 MiB raw wait job must exceed the cumulative 16 MiB retention budget before publication",
  );

  assert.equal(session.evidence.task_records.length, beforeSecondEnd.taskRecords, "the blocked second terminal must not publish a task record");
  assert.equal(session.evidence.wait_results.length, beforeSecondEnd.waitResults, "the blocked second terminal must not publish raw wait metadata");
  assert.equal(session.evidence.tool_events.length, toolEventsAfterStart, "the blocked second terminal must not append an END metadata event");
  assert.equal(session.evidence.capture.bytes, beforeSecondEnd.captureBytes, "the blocked second terminal must not change the capture byte counter");
  assert.equal(session.evidence.capture.complete, beforeSecondEnd.captureComplete, "the blocked second terminal must preserve capture budget state");
  assert.deepEqual(
    [...session.waitRecordsByIdentity.entries()].map(([key, value]) => [key, value.snapshot]),
    beforeSecondEnd.waitIdentity,
    "the blocked second terminal must preserve the wait identity map",
  );
  assert.deepEqual([...session.asyncJobIdsByAllocated.entries()], beforeSecondEnd.asyncJobIds, "the blocked second terminal must preserve allocated-to-SDK ownership mappings");
  assert.deepEqual([...session.transportJobIds], beforeSecondEnd.transportJobIds, "the blocked second terminal must preserve transport job counters/identity");

  const retained = waitRecords(session)[0];
  assert.equal(retained.wait_result.job.id, firstJobId, "only the first raw SDK job may remain published");
  assert.equal(sha256Text(retained.wait_result.job.resultText), sha256Text(firstRaw), "the first raw resultText must survive the blocked second admission byte-exactly");
  assert.equal(retained.parent_tool_call_id, firstRootCall, "the first Root ownership must survive the blocked second admission");
  assert.equal(retained.allocated_id, firstAllocated, "the first allocated ownership must survive the blocked second admission");
  assert.equal(session.waitRecordsByIdentity.has(secondJobId), false, "the blocked second SDK job must not enter the wait identity map");
  assert.equal(session.asyncJobIdsByAllocated.has(secondAllocated), false, "the blocked second allocation must not enter the ownership map");
  assert.equal(session.evidence.task_records.some((record) => record?.jobId === secondJobId), false, "the blocked second SDK job must not publish a task record");
}

function rootWaitToolCallIdRequiredMustBlock(apis, root) {
  {
    const { session } = makeWaitFixture(apis, root, { label: "native-wait-missing-start-tool-call-id-red" });
    const start = waitStart(WAIT_CALL);
    delete start.toolCallId;
    waitMustBlock(() => session.recordTool(start), "Root wait START without toolCallId");
    assert.equal(waitRecords(session).length, 0, "a Root wait START without toolCallId must not publish a wait record");
  }
  {
    const { session } = makeWaitFixture(apis, root, { label: "native-wait-missing-end-tool-call-id-red" });
    session.recordTool(waitStart(WAIT_CALL));
    const end = waitEnd(WAIT_CALL, waitJob());
    delete end.toolCallId;
    waitMustBlock(() => session.recordTool(end), "Root wait END without toolCallId");
    assert.equal(waitRecords(session).length, 0, "a Root wait END without toolCallId must not publish a wait record");
  }
}

function sameBatchSecondSdkJobPositive(apis, root) {
  const first = assignment("SameBatchPeerA", "peer-reviewer", "First job in one observed Root batch.");
  const second = assignment("SameBatchPeerB", "peer-reviewer", "Second job in one observed Root batch.");
  const rootCall = "same-batch-root-call";
  const firstAllocated = "same-batch-allocated-a";
  const secondAllocated = "same-batch-allocated-b";
  const firstJobId = "same-batch-sdk-job-a";
  const secondJobId = "same-batch-sdk-job-b";
  const session = createSession(apis.NativeRpcSession, root, [first, second], "native-same-batch-second-job-red");
  recordObservedBatchRoot(session, rootCall, [first, second], [firstAllocated, secondAllocated], firstJobId);

  const firstRawJob = waitJob({ id: firstJobId, agentUrlId: firstAllocated, label: first.name });
  const secondRawJob = waitJob({ id: secondJobId, agentUrlId: secondAllocated, label: second.name });
  assert.doesNotThrow(
    () => session.recordTool(waitStart(WAIT_CALL)),
    "a same-batch SDK wait START for the first observed job must not throw",
  );
  assert.doesNotThrow(
    () => session.recordTool(waitEnd(WAIT_CALL, firstRawJob)),
    "a same-batch SDK wait END for the first observed job must not throw",
  );
  assert.doesNotThrow(
    () => session.recordTool(waitStart(WAIT_CALL_SECOND)),
    "a same-batch SDK wait START for the second observed job must not throw",
  );
  assert.doesNotThrow(
    () => session.recordTool(waitEnd(WAIT_CALL_SECOND, secondRawJob)),
    "a same-batch SDK wait END for the second observed job must not throw",
  );

  const records = waitRecords(session);
  assert.equal(records.length, 2, "the same-batch terminal must publish two authoritative wait records");
  assert.equal(asyncRecords(session).length, 0, "the same-batch wait terminals must not publish custom async records");
  assert.deepEqual(
    records.map((record) => record.wait_result.job),
    [firstRawJob, secondRawJob],
    "each wait record must preserve its exact raw SDK payload",
  );
  assert.deepEqual(
    records.map((record) => record.structured_data),
    [firstRawJob.structured.data, secondRawJob.structured.data],
    "each wait record must retain the structured payload from its raw SDK snapshot",
  );
  for (const record of records) {
    assert.equal(apis.taskRecordSucceeded(record), true, "each same-batch wait record must satisfy the shared success predicate");
  }
  const secondRecord = records.find((record) => record.jobId === secondJobId);
  assert.ok(secondRecord, "the second same-batch SDK job must produce a wait record");
  assert.equal(secondRecord.allocated_id, secondAllocated, "the second wait record must retain its own lifecycle allocation");
  assert.equal(secondRecord.parent_tool_call_id, rootCall, "the second wait record must retain the shared Root call");
  assert.equal(secondRecord.index, 1, "the second wait record must retain its observed assignment index");
  assert.equal(secondRecord.wait_result.host_binding.allocated_id, secondAllocated, "the second wait binding must retain its own observed child");
  assert.equal(secondRecord.wait_result.host_binding.index, 1, "the second wait binding must retain its observed assignment index");
}

function waitAgentUrlJobIdFallbackPositive(apis, root) {
  const child = assignment("WaitNavigationFallbackPeer", "peer-reviewer", "Use strong Root/lifecycle mapping when agentUrlId falls back to the SDK job ID.");
  const allocatedId = "allocated-navigation-fallback";
  const jobId = "sdk-navigation-fallback";
  const { session } = makeWaitFixture(apis, root, {
    child,
    allocatedId,
    rootJobId: jobId,
    label: "native-wait-agent-url-job-fallback-red",
  });
  const rawJob = waitJob({ id: jobId, agentUrlId: jobId, label: child.name });
  session.recordTool(waitStart(WAIT_CALL));
  assert.doesNotThrow(
    () => session.recordTool(waitEnd(WAIT_CALL, rawJob)),
    "agentUrlId equal to job.id must remain a navigation hint when the independent Root mapping is strong",
  );
  const [record] = waitRecords(session);
  assert.equal(record.jobId, jobId, "the wait record must preserve the actual SDK job ID");
  assert.equal(record.id, allocatedId, "the wait record must derive child ownership from lifecycle, not agentUrlId equality");
  assert.equal(record.wait_result.job.agentUrlId, jobId, "the raw navigation hint must remain job.id");
  assert.equal(record.wait_result.host_binding.allocated_id, allocatedId, "the host binding must retain the independently observed child allocation");
  assert.equal(record.wait_result.host_binding.parent_tool_call_id, ROOT_CALL_WAIT, "the host binding must retain the observed Root parent");
  assert.deepEqual(record.structured_data, rawJob.structured.data, "the fallback record must retain real structured peer data");
  assert.equal(apis.taskRecordSucceeded(record), true, "the fallback record must be an authoritative successful completion");
}

function waitCanonicalAllocatedOwnersInBatch(apis, root) {
  const children = Array.from({ length: 6 }, (_, index) => assignment(
    `WaitCanonicalPeer${index}`, "peer-reviewer", "Review the exact assigned private wait evidence.",
  ));
  const foreign = assignment("WaitCanonicalForeignPeer", "peer-reviewer", "Review separate Root evidence.");
  const allocated = children.map((_, index) => `allocated-canonical-peer-${index}`);
  const rootCall = `${ROOT_CALL_WAIT}-canonical`;
  const session = createSession(apis.NativeRpcSession, root, [...children, foreign], "native-wait-canonical-batch");
  recordObservedBatchRoot(session, rootCall, children, allocated, allocated[0]);
  const observedRoot = [...session.rootTaskCalls.values()].find((item) => item.tool_call_id === rootCall);
  assert.ok(observedRoot, "the six-role Root dispatch must be independently observed");
  const rawJobs = children.map((child, index) => waitJob({
    id: allocated[index], agentUrlId: allocated[index], label: child.name,
  }));
  for (const [index, rawJob] of rawJobs.entries()) {
    const callId = `${WAIT_CALL}-canonical-${index}`;
    session.recordTool(waitStart(callId));
    assert.doesNotThrow(
      () => session.recordTool(waitEnd(callId, rawJob)),
      "an exact allocated SDK job identity must not become a navigation match for its siblings",
    );
  }
  const records = waitRecords(session);
  assert.deepEqual(records.map((record) => record.allocated_id), allocated, "each completed job must retain its own child");
  assert.deepEqual(records.map((record) => record.structured_data), rawJobs.map((job) => job.structured.data),
    "the six exact structured results must survive real wait consumption");
  for (const record of records) assert.equal(apis.taskRecordSucceeded(record), true);
  waitMustBlock(
    () => session.waitBindingForJob(waitJob({ id: "unknown-navigation", agentUrlId: "unknown-navigation" }), observedRoot),
    "an unknown navigation-only job remains ambiguous across five secondary owners",
  );
  recordObservedWaitRoot(session, `${rootCall}-foreign`, foreign, "allocated-canonical-foreign", "sdk-canonical-foreign");
  assert.deepEqual(
    session.waitBindingCandidates(waitJob({ id: "allocated-canonical-foreign", agentUrlId: "allocated-canonical-foreign" }), observedRoot),
    [], "an allocation owned by another Root must not become navigation for this Root",
  );
  session.lifecycleByAllocated.get(`id:${allocated[1]}`).lifecycle_status = "started";
  assert.deepEqual(session.waitBindingCandidates(rawJobs[1], observedRoot), [],
    "a completed snapshot without its completed lifecycle must not borrow a sibling owner");
}

function customAsyncBatchCountBoundMustBlockAtomically(apis, root) {
  const count = 257;
  const children = Array.from({ length: count }, (_, index) => assignment(
    `CustomOvercountPeer${index}`,
    "peer-reviewer",
    `Read the bounded custom batch member ${index} and return its peer schema.`,
  ));
  const allocatedIds = children.map((_, index) => `custom-overcount-allocated-${index}`);
  const jobIds = children.map((_, index) => `custom-overcount-sdk-job-${index}`);
  const session = createSession(apis.NativeRpcSession, root, children, "native-custom-batch-count-bound-red");
  recordObservedBatchRoot(session, "custom-overcount-root-call", children, allocatedIds, jobIds[0]);
  const before = {
    taskRecords: session.evidence.task_records.length,
    asyncResults: session.evidence.async_results.length,
    captureBytes: session.evidence.capture.bytes,
    captureComplete: session.evidence.capture.complete,
    asyncIdentities: [...session.asyncRecordsByIdentity.keys()],
    asyncJobIds: [...session.asyncJobIdsByAllocated.entries()],
    transportJobIds: [...session.transportJobIds],
  };
  const jobs = children.map((_, index) => asyncJob(jobIds[index], allocatedIds[index], `CUSTOM_OVERCOUNT_${index}`));
  waitMustBlock(
    () => session.consumeLogical(asyncMessage(jobs)),
    "a custom async batch over 256 jobs must BLOCK before any record/map/capture admission",
  );
  assert.equal(session.evidence.task_records.length, before.taskRecords, "an over-count custom batch must not publish any task record");
  assert.equal(session.evidence.async_results.length, before.asyncResults, "an over-count custom batch must not publish any raw custom result");
  assert.equal(session.evidence.capture.bytes, before.captureBytes, "an over-count custom batch must not change capture bytes");
  assert.equal(session.evidence.capture.complete, before.captureComplete, "an over-count custom batch must preserve capture completeness");
  assert.deepEqual([...session.asyncRecordsByIdentity.keys()], before.asyncIdentities, "an over-count custom batch must not populate async identity maps");
  assert.deepEqual([...session.asyncJobIdsByAllocated.entries()], before.asyncJobIds, "an over-count custom batch must not populate allocation maps");
  assert.deepEqual([...session.transportJobIds], before.transportJobIds, "an over-count custom batch must not mutate transport identities");
}

function customAsyncBatchCaptureFaultRollsBack(apis, root) {
  const first = assignment("CustomCaptureFaultPeerA", "peer-reviewer", "First row for a deterministic second-row capture fault.");
  const second = assignment("CustomCaptureFaultPeerB", "peer-reviewer", "Second row for a deterministic second-row capture fault.");
  const rootCall = "custom-capture-fault-root-call";
  const firstAllocated = "custom-capture-fault-allocated-a";
  const secondAllocated = "custom-capture-fault-allocated-b";
  const firstJobId = "custom-capture-fault-sdk-job-a";
  const secondJobId = "custom-capture-fault-sdk-job-b";
  const session = createSession(apis.NativeRpcSession, root, [first, second], "native-custom-batch-capture-fault-red");
  recordObservedBatchRoot(session, rootCall, [first, second], [firstAllocated, secondAllocated], firstJobId);
  const before = {
    taskRecords: session.evidence.task_records.length,
    asyncResults: session.evidence.async_results.length,
    captureBytes: session.evidence.capture.bytes,
    captureComplete: session.evidence.capture.complete,
    asyncIdentities: [...session.asyncRecordsByIdentity.entries()].map(([key, value]) => [key, value.snapshot]),
    asyncJobIds: [...session.asyncJobIdsByAllocated.entries()],
    transportJobIds: [...session.transportJobIds],
  };
  const originalCapture = session.capture;
  let asyncCaptureRows = 0;
  session.capture = function captureWithSecondRowFault(collection, value) {
    if (collection === "async_results") {
      asyncCaptureRows += 1;
      if (asyncCaptureRows === 2) {
        const error = new Error("deterministic second-row async capture fault");
        error.kind = "BLOCKED";
        throw error;
      }
    }
    return originalCapture.call(this, collection, value);
  };
  try {
    waitMustBlock(
      () => session.consumeLogical(asyncMessage([
        asyncJob(firstJobId, firstAllocated, "CUSTOM_CAPTURE_FAULT_A"),
        asyncJob(secondJobId, secondAllocated, "CUSTOM_CAPTURE_FAULT_B"),
      ])),
      "a second-row custom capture fault must roll back every first-row mutation",
    );
  } finally {
    session.capture = originalCapture;
  }
  assert.equal(asyncCaptureRows, 2, "the deterministic fault must occur on the second custom capture row");
  assert.equal(session.evidence.task_records.length, before.taskRecords, "capture-fault rollback must remove the first-row task record");
  assert.equal(session.evidence.async_results.length, before.asyncResults, "capture-fault rollback must remove the first-row raw custom result");
  assert.equal(session.evidence.capture.bytes, before.captureBytes, "capture-fault rollback must restore the capture byte counter");
  assert.equal(session.evidence.capture.complete, before.captureComplete, "capture-fault rollback must restore capture completeness");
  assert.deepEqual(
    [...session.asyncRecordsByIdentity.entries()].map(([key, value]) => [key, value.snapshot]),
    before.asyncIdentities,
    "capture-fault rollback must restore async identity maps",
  );
  assert.deepEqual([...session.asyncJobIdsByAllocated.entries()], before.asyncJobIds, "capture-fault rollback must restore allocation maps");
  assert.deepEqual([...session.transportJobIds], before.transportJobIds, "capture-fault rollback must restore transport identities");
}

function customSchemaDataRetainedByteExact(apis, root) {
  const child = assignment("CustomRawSchemaPeer", "peer-reviewer", "Return a structured custom payload whose data exceeds the safe-value preview limit.");
  const allocatedId = "custom-raw-schema-allocated";
  const jobId = "custom-raw-schema-sdk-job";
  const { session } = makeWaitFixture(apis, root, {
    child,
    allocatedId,
    rootJobId: jobId,
    label: "native-custom-schema-raw-red",
  });
  const rawPayload = `custom-schema-raw-${"R".repeat(8192)}`;
  const rawJob = asyncJob(jobId, allocatedId, "CUSTOM_RAW_SCHEMA");
  rawJob.schema.data = rawPayload;
  assert.doesNotThrow(
    () => session.consumeLogical(asyncMessage(rawJob)),
    "the actual custom consumer must admit a valid schema.data string beyond the safe-value preview limit",
  );
  const [record] = asyncRecords(session);
  const retainedSchemaData = record.async_result.job.schema.data;
  assert.equal(Buffer.byteLength(retainedSchemaData, "utf8"), Buffer.byteLength(rawPayload, "utf8"), "custom raw schema.data byte length must remain exact");
  assert.equal(sha256Text(retainedSchemaData), sha256Text(rawPayload), "custom raw schema.data bytes must remain exact through async_result retention");
  assert.equal(Buffer.byteLength(record.structured_data, "utf8"), Buffer.byteLength(rawPayload, "utf8"), "structured_data must retain the raw schema.data byte length");
  assert.equal(sha256Text(record.structured_data), sha256Text(rawPayload), "structured_data must retain the raw schema.data bytes");
  assert.equal(apis.taskRecordSucceeded(record), true, "the byte-exact custom schema record must remain authoritative and successful");
}

async function waitTerminalExecuteSettlesAfterTerminal(apis, root) {
  const child = assignment("WaitExecutePeerReviewer", "peer-reviewer", "Execute the Root session and consume the terminal wait job.");
  const session = new apis.NativeRpcSession({
    omp: "offline-wait-execute-probe",
    cwd: root,
    timeoutMs: 1_000,
    assignments: [child],
    logicalRunId: RUN_ID,
    label: "native-wait-terminal-execute-red",
  });
  session.start = () => Promise.resolve();
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
    if (command.type === "prompt") {
      session.recordTool(rootStart(ROOT_CALL_WAIT, [child]));
      session.consumeLogical(lifecycleFrame({ id: ALLOCATED_WAIT, agent: child.agent, parentToolCallId: ROOT_CALL_WAIT }));
      session.recordTool(rootEnd(ROOT_CALL_WAIT, SDK_JOB_WAIT, [progressRow(child, ALLOCATED_WAIT)]));
      session.consumeLogical(lifecycleFrame({ id: ALLOCATED_WAIT, agent: child.agent, parentToolCallId: ROOT_CALL_WAIT, status: "completed" }));
      session.recordTool(waitStart(WAIT_CALL));
      session.recordTool(waitEnd(WAIT_CALL, waitJob()));
      session.consumeLogical({ type: "prompt_result", id: command.id, status: "completed", agentInvoked: true, sessionSettled: false });
      session.consumeLogical({ type: "session_settled" });
      session.consumeLogical({ type: "agent_end", isTerminal: true, awaitingAsyncWork: false });
      return { type: "response", command: "prompt", success: true, id: command.id };
    }
    throw new Error(`unexpected execute response command ${command.type}`);
  };

  let evidence = null;
  let caught = null;
  try {
    evidence = await session.execute("Execute a Root completion that waits for the manager terminal.");
  } catch (error) {
    caught = error;
  }
  assert.equal(caught, null, "execute must settle successfully only after the terminal Root wait result");
  assert.ok(evidence, "execute must return evidence after settling successfully");
  assert.equal(evidence.terminal?.session_settled, true, "execute must settle only after the wait terminal was consumed");
  assert.equal(evidence.terminal?.agent_end?.isTerminal, true, "execute must retain the final Root agent_end");
  const records = waitRecords(session);
  assert.equal(records.length, 1, "execute must return one authoritative wait record");
  assert.equal(apis.taskRecordSucceeded(records[0]), true, "execute finalization must use the shared wait success predicate");
}
async function executeNative09SettlementCase(apis, root, {
  channel,
  pendingChildWrite = false,
  rootWrite = "none",
  label,
}) {
  const child = native09BackendRepairAssignment();
  const rootCallId = `${NATIVE09_REPAIR_ROOT_CALL}-execute-${label}`;
  const allocatedId = `${NATIVE09_REPAIR_ALLOCATED_ID}-execute-${label}`;
  const rootJobId = `${NATIVE09_REPAIR_SDK_JOB_ID}-execute-${label}`;
  const closedWriteCallId = `${NATIVE09_REPAIR_WRITE_CALL}-execute-${label}-closed`;
  const pendingWriteCallId = `${NATIVE09_REPAIR_WRITE_CALL}-execute-${label}-pending`;
  const rootWriteCallId = `${rootCallId}-root-write`;
  const rootWritePath = path.resolve(root, NATIVE09_REPAIR_PATH);
  const session = new apis.NativeRpcSession({
    omp: "offline-native09-settlement-probe",
    cwd: root,
    timeoutMs: 1_000,
    assignments: [child],
    logicalRunId: RUN_ID,
    label: NATIVE09_REPAIR_LABEL,
    rootWritePolicy: { tool: "write", path: rootWritePath },
  });
  session.start = () => Promise.resolve();
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

    session.recordTool(rootStart(rootCallId, [child]));
    session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId }));
    session.recordTool(rootEnd(rootCallId, rootJobId, [progressRow(child, allocatedId)]));
    recordNative09BackendRepairWrite(session, allocatedId, child, { callId: closedWriteCallId });
    if (pendingChildWrite) {
      session.consumeLogical(subagentEvent({
        allocatedId,
        agent: child.agent,
        nestedEvent: nestedWriteEvent({ phase: "start", callId: pendingWriteCallId }),
      }));
    }
    if (rootWrite !== "none") {
      session.recordTool({
        type: "tool_execution_start",
        toolName: "write",
        toolCallId: rootWriteCallId,
        args: { path: rootWritePath, content: "closed or pending Root correlation" },
      });
      if (rootWrite === "closed") {
        session.recordTool({
          type: "tool_execution_end",
          toolName: "write",
          toolCallId: rootWriteCallId,
          isError: false,
          result: { details: { resolvedPath: rootWritePath } },
        });
      }
    }
    session.consumeLogical(lifecycleFrame({ id: allocatedId, agent: child.agent, parentToolCallId: rootCallId, status: "completed" }));
    if (channel === "custom") {
      session.consumeLogical(asyncMessage(native09BackendCustomJob({ jobId: rootJobId, agentId: allocatedId })));
    } else if (channel === "wait") {
      const waitCallId = `${rootCallId}-wait`;
      session.recordTool(waitStart(waitCallId));
      session.recordTool(waitEnd(
        waitCallId,
        native09BackendWaitJob({ id: rootJobId, agentUrlId: allocatedId, label: child.name }),
      ));
    } else {
      throw new Error(`unsupported Native09 execute settlement channel: ${channel}`);
    }
    session.consumeLogical({ type: "prompt_result", id: command.id, status: "completed", agentInvoked: true, sessionSettled: false });
    session.consumeLogical({ type: "session_settled" });
    session.consumeLogical({ type: "agent_end", isTerminal: true, awaitingAsyncWork: false });
    return { type: "response", command: "prompt", success: true, id: command.id };
  };

  let evidence = null;
  let caught = null;
  try {
    evidence = await session.execute(`Execute Native09 settlement case ${label}.`);
  } catch (error) {
    caught = error;
  }
  return { evidence, caught, session };
}

async function native09ExecuteSettlementBlocksPendingWriteCorrelations(apis, root) {
  const pendingChild = await executeNative09SettlementCase(apis, root, {
    channel: "custom",
    pendingChildWrite: true,
    label: "pending-child-write",
  });
  assert.ok(pendingChild.caught, "a valid closed write plus a pending allowlisted child write START must block execute settlement");
  assert.equal(pendingChild.caught.kind, "BLOCKED", "pending child write settlement failure must be BLOCKED");
  assert.equal(pendingChild.session.writeCalls.size, 1, "pending child write correlation must remain observable after settlement is blocked");

  const pendingRoot = await executeNative09SettlementCase(apis, root, {
    channel: "wait",
    rootWrite: "pending",
    label: "pending-root-write",
  });
  assert.ok(pendingRoot.caught, "a pending allowlisted Root write START must block execute settlement");
  assert.equal(pendingRoot.caught.kind, "BLOCKED", "pending Root write settlement failure must be BLOCKED");
  assert.equal(pendingRoot.session.rootWriteCalls.size, 1, "pending Root write correlation must remain observable after settlement is blocked");

  for (const channel of ["custom", "wait"]) {
    const closed = await executeNative09SettlementCase(apis, root, {
      channel,
      rootWrite: "closed",
      label: `closed-correlations-${channel}`,
    });
    assert.equal(closed.caught, null, `${channel} fully closed child and Root write correlations must remain accepted`);
    assert.ok(closed.evidence, `${channel} fully closed correlations must return settled evidence`);
    assert.equal(closed.session.writeCalls.size, 0, `${channel} closed child write correlation must be removed before settlement`);
    assert.equal(closed.session.rootWriteCalls.size, 0, `${channel} closed Root write correlation must be removed before settlement`);
  }
}

function waitExposedNumericExitCodePositive(apis, root) {
  const { session } = makeWaitFixture(apis, root, { label: "native-wait-terminal-exit-observed-red" });
  const rawJob = waitJob({ exitCode: 0 });
  session.recordTool(waitStart(WAIT_CALL));
  session.recordTool(waitEnd(WAIT_CALL, rawJob));
  const [record] = waitRecords(session);
  assert.equal(waitRecords(session).length, 1, "an actually exposed numeric child exitCode must retain one wait record");
  assert.equal(record.exitCode, 0, "an actually exposed numeric child exitCode must be preserved");
  assert.equal(record.exit_code_observed, true, "an actually exposed numeric child exitCode must be marked observed");
  assert.equal(record.wait_result.job.exitCode, 0, "the raw wait snapshot must retain its numeric exitCode");
  assert.equal(apis.taskRecordSucceeded(record), true, "exitCode zero is successful only when the SDK actually exposed it");
}

function waitOwnershipAndTransportGuardsMustBlock(apis, root) {
  {
    const { session } = makeWaitFixture(apis, root, { label: "native-wait-missing-start-red" });
    waitMustBlock(() => session.recordTool(waitEnd(WAIT_CALL, waitJob())), "wait END without its matching START");
  }

  for (const [name, endOptions] of [
    ["wait transport isError:true", { isError: true }],
    ["wait transport missing explicit isError", { isError: OMIT }],
  ]) {
    const { session } = makeWaitFixture(apis, root, { label: `native-${name.replaceAll(/[^a-z0-9]+/gi, "-")}` });
    session.recordTool(waitStart(WAIT_CALL));
    waitMustBlock(() => session.recordTool(waitEnd(WAIT_CALL, waitJob(), endOptions)), name);
  }

  for (const [name, job] of [
    ["unknown SDK wait job", waitJob({ id: "sdk-unknown-wait-job" })],
    ["wrong wait agentUrlId", waitJob({ agentUrlId: "allocated-wait-not-owned" })],
  ]) {
    const { session } = makeWaitFixture(apis, root, { label: `native-${name.replaceAll(/[^a-z0-9]+/gi, "-")}` });
    session.recordTool(waitStart(WAIT_CALL));
    waitMustBlock(() => session.recordTool(waitEnd(WAIT_CALL, job)), name);
  }

  {
    const first = assignment("WaitPeerReviewer", "peer-reviewer", "Primary Root owns the first independent wait job.");
    const second = assignment("SecondWaitPeerReviewer", "peer-reviewer", "A second Root owns a distinct independent wait job.");
    const session = createSession(apis.NativeRpcSession, root, [first, second], "native-wait-second-parent-positive");
    session.recordTool(rootStart(ROOT_CALL_WAIT, [first]));
    session.consumeLogical(lifecycleFrame({ id: ALLOCATED_WAIT, agent: first.agent, parentToolCallId: ROOT_CALL_WAIT }));
    session.recordTool(rootEnd(ROOT_CALL_WAIT, SDK_JOB_WAIT, [progressRow(first, ALLOCATED_WAIT)]));
    session.consumeLogical(lifecycleFrame({ id: ALLOCATED_WAIT, agent: first.agent, parentToolCallId: ROOT_CALL_WAIT, status: "completed" }));
    session.recordTool(rootStart(ROOT_CALL_FOREIGN, [second]));
    session.consumeLogical(lifecycleFrame({ id: ALLOCATED_FOREIGN, agent: second.agent, parentToolCallId: ROOT_CALL_FOREIGN }));
    session.recordTool(rootEnd(ROOT_CALL_FOREIGN, SDK_JOB_FOREIGN, [progressRow(second, ALLOCATED_FOREIGN)]));
    session.consumeLogical(lifecycleFrame({ id: ALLOCATED_FOREIGN, agent: second.agent, parentToolCallId: ROOT_CALL_FOREIGN, status: "completed" }));
    session.recordTool(waitStart(WAIT_CALL));
    assert.doesNotThrow(
      () => session.recordTool(waitEnd(WAIT_CALL, waitJob({ id: SDK_JOB_FOREIGN, agentUrlId: ALLOCATED_FOREIGN, label: second.name }))),
      "Root wait must accept the second SDK job through its own observed Root dispatch",
    );
    const records = waitRecords(session);
    assert.equal(records.length, 1, "the second SDK job must yield exactly one actual wait record");
    const [record] = records;
    assert.equal(record.jobId, SDK_JOB_FOREIGN, "the second wait record must retain the actual second SDK job");
    assert.equal(record.allocated_id, ALLOCATED_FOREIGN, "the second wait record must retain its allocated child");
    assert.equal(record.parent_tool_call_id, ROOT_CALL_FOREIGN, "the second wait record must retain its second Root parent");
    assert.equal(apis.taskRecordSucceeded(record), true, "the shared success predicate must accept the second Root wait record");
  }

  {
    const first = assignment("WaitPeerReviewer", "peer-reviewer", "Primary Root owns the first independent wait job.");
    const second = assignment("SecondWaitPeerReviewer", "peer-reviewer", "A second Root owns a distinct independent wait job.");
    const session = createSession(apis.NativeRpcSession, root, [first, second], "native-wait-first-parent-positive");
    session.recordTool(rootStart(ROOT_CALL_WAIT, [first]));
    session.consumeLogical(lifecycleFrame({ id: ALLOCATED_WAIT, agent: first.agent, parentToolCallId: ROOT_CALL_WAIT }));
    session.recordTool(rootEnd(ROOT_CALL_WAIT, SDK_JOB_WAIT, [progressRow(first, ALLOCATED_WAIT)]));
    session.consumeLogical(lifecycleFrame({ id: ALLOCATED_WAIT, agent: first.agent, parentToolCallId: ROOT_CALL_WAIT, status: "completed" }));
    session.recordTool(rootStart(ROOT_CALL_FOREIGN, [second]));
    session.consumeLogical(lifecycleFrame({ id: ALLOCATED_FOREIGN, agent: second.agent, parentToolCallId: ROOT_CALL_FOREIGN }));
    session.recordTool(rootEnd(ROOT_CALL_FOREIGN, SDK_JOB_FOREIGN, [progressRow(second, ALLOCATED_FOREIGN)]));
    session.consumeLogical(lifecycleFrame({ id: ALLOCATED_FOREIGN, agent: second.agent, parentToolCallId: ROOT_CALL_FOREIGN, status: "completed" }));
    session.recordTool(waitStart(WAIT_CALL));
    assert.doesNotThrow(
      () => session.recordTool(waitEnd(WAIT_CALL, waitJob({ id: SDK_JOB_WAIT, agentUrlId: ALLOCATED_WAIT, label: first.name }))),
      "Root wait must accept the first SDK job through its own observed Root dispatch",
    );
    const records = waitRecords(session);
    assert.equal(records.length, 1, "the first SDK job must yield exactly one actual wait record");
    const [record] = records;
    assert.equal(record.jobId, SDK_JOB_WAIT, "the first wait record must retain the actual first SDK job");
    assert.equal(record.allocated_id, ALLOCATED_WAIT, "the first wait record must retain its allocated child");
    assert.equal(record.parent_tool_call_id, ROOT_CALL_WAIT, "the first wait record must retain its first Root parent");
    assert.equal(apis.taskRecordSucceeded(record), true, "the shared success predicate must accept the first Root wait record");
  }

  {
    const child = assignment("WaitProjectSource", "peer-reviewer", "Project source is required for the observed child binding.");
    const session = createSession(apis.NativeRpcSession, root, [child], "native-wait-project-source-red");
    session.recordTool(rootStart(ROOT_CALL_WAIT, [child]));
    session.consumeLogical(lifecycleFrame({ id: ALLOCATED_WAIT, agent: child.agent, parentToolCallId: ROOT_CALL_WAIT }));
    const wrongSourceProgress = { ...progressRow(child, ALLOCATED_WAIT), agentSource: "user" };
    waitMustBlock(() => session.recordTool(rootEnd(ROOT_CALL_WAIT, SDK_JOB_WAIT, [wrongSourceProgress])), "Root wait owner with non-project agentSource");
  }
}

function waitNonTerminalAndSchemaBoundariesCannotSucceed(apis, root) {
  const variants = [
    ["running wait job", waitJob({ status: "running", structured: OMIT })],
    ["failed wait job", waitJob({ status: "failed", structured: OMIT })],
    ["cancelled wait job", waitJob({ status: "cancelled", structured: OMIT })],
    ["invalid structured schema", waitJob({ structured: { source: "agent", mode: "strict", status: "invalid" } })],
    ["structured data without schema assembly", waitJob({ structured: { data: reviewerStructured() } })],
    ["human resultText is not structured data", waitJob({ structured: OMIT, resultText: JSON.stringify(reviewerStructured()) })],
    ["unknown SingleResult output field", { ...waitJob(), output: reviewerStructured() }],
    ["nonzero exposed exitCode", waitJob({ exitCode: 7 })],
  ];
  const missingStatus = waitJob();
  delete missingStatus.status;
  variants.push(["missing manager status", missingStatus]);

  for (const [name, job] of variants) {
    const { session } = makeWaitFixture(apis, root, { label: `native-${name.replaceAll(/[^a-z0-9]+/gi, "-")}` });
    session.recordTool(waitStart(WAIT_CALL));
    waitMustNotSucceed(apis, session, waitEnd(WAIT_CALL, job), name);
  }

  {
    const { session } = makeWaitFixture(apis, root, { label: "native-wait-root-prose-settled-red" });
    session.consumeLogical({ type: "agent_end", isTerminal: true, awaitingAsyncWork: false });
    session.consumeLogical({ type: "session_settled" });
    session.recordTool(waitStart(WAIT_CALL));
    waitMustNotSucceed(
      apis,
      session,
      waitEnd(WAIT_CALL, null, { details: { op: "wait", content: [{ type: "text", text: "completed" }] } }),
      "Root prose plus settled/lifecycle completion without a terminal wait job",
    );
  }
  {
    const { child, session } = makeWaitFixture(apis, root, { label: "native-wait-progress-only-red" });
    session.recordTool(waitStart(WAIT_CALL));
    waitMustNotSucceed(
      apis,
      session,
      waitEnd(WAIT_CALL, null, { details: { op: "wait", progress: [progressRow(child, ALLOCATED_WAIT)] } }),
      "wait progress-only details without a terminal jobs snapshot",
    );
  }
}
function waitDuplicateTerminalCommitsOnce(apis, root) {
  const { session } = makeWaitFixture(apis, root, { label: "native-wait-duplicate-terminal-red" });
  const rawJob = waitJob();
  session.recordTool(waitStart(WAIT_CALL));
  session.recordTool(waitEnd(WAIT_CALL, rawJob));
  session.recordTool(waitStart(WAIT_CALL_SECOND));
  session.recordTool(waitEnd(WAIT_CALL_SECOND, waitJob()));
  assert.equal(waitRecords(session).length, 1, "identical wait snapshots for one SDK job must commit one authoritative record");

  const duplicateCustom = asyncJob(SDK_JOB_WAIT, ALLOCATED_WAIT, "WAIT_EQUIVALENT");
  duplicateCustom.schema = {
    source: "agent",
    mode: "strict",
    status: "valid",
    data: rawJob.structured.data,
  };
  session.consumeLogical(asyncMessage(duplicateCustom));
  assert.equal(session.evidence.task_records.length, 1, "equivalent wait and custom terminal deliveries must commit exactly once");
  assert.equal(waitRecords(session).length, 1, "equivalent custom delivery must not replace the authoritative wait record");
  assert.equal(asyncRecords(session).length, 0, "equivalent custom delivery must not create a second task_async_result record");
  assert.equal(apis.taskRecordSucceeded(waitRecords(session)[0]), true, "the retained equivalent terminal must remain successful");
}

function waitContradictoryTerminalsMustBlockAndRetainPrior(apis, root) {
  const { session } = makeWaitFixture(apis, root, { label: "native-wait-contradictory-terminal-red" });
  const rawJob = waitJob();
  session.recordTool(waitStart(WAIT_CALL));
  session.recordTool(waitEnd(WAIT_CALL, rawJob));
  const original = waitRecords(session)[0];

  session.recordTool(waitStart(WAIT_CALL_SECOND));
  waitMustBlock(
    () => session.recordTool(waitEnd(WAIT_CALL_SECOND, waitJob({ structured: { ...reviewerStructured(), explanation: "contradictory payload" } }))),
    "contradictory wait payload for one SDK job",
  );
  session.recordTool(waitStart(WAIT_CALL_THIRD));
  waitMustBlock(
    () => session.recordTool(waitEnd(WAIT_CALL_THIRD, waitJob({ status: "failed", structured: OMIT }))),
    "contradictory wait status for one SDK job",
  );
  session.recordTool(waitStart("root-wait-call-ownership-contradiction"));
  waitMustBlock(
    () => session.recordTool(waitEnd("root-wait-call-ownership-contradiction", waitJob({ agentUrlId: "allocated-wait-foreign-after-terminal" }))),
    "contradictory wait ownership for one SDK job",
  );
  assert.equal(waitRecords(session).length, 1, "contradictory terminals must not append a new authoritative record");
  assert.deepEqual(waitRecords(session)[0], original, "contradictory terminals must retain the prior valid record unchanged");
  assert.equal(apis.taskRecordSucceeded(waitRecords(session)[0]), true, "prior valid wait authority must remain successful after contradictory deliveries");
}

function waitUnavailableSnapshotCannotReplacePrior(apis, root) {
  const { session } = makeWaitFixture(apis, root, { label: "native-wait-unavailable-snapshot-red" });
  const rawJob = waitJob();
  session.recordTool(waitStart(WAIT_CALL));
  session.recordTool(waitEnd(WAIT_CALL, rawJob));
  const before = waitRecords(session)[0];
  session.recordTool(waitStart(WAIT_CALL_SECOND));
  let unavailableError = null;
  try {
    session.recordTool(waitEnd(WAIT_CALL_SECOND, waitJob({ structured: OMIT, agentOutputPublished: false })));
  } catch (error) {
    unavailableError = error;
  }
  if (unavailableError) assert.equal(unavailableError.kind, "BLOCKED", "an unavailable consumed wait snapshot may only fail closed");
  assert.equal(waitRecords(session).length, 1, "an unavailable consumed snapshot must not append a replacement record");
  assert.deepEqual(waitRecords(session)[0], before, "an unavailable consumed snapshot must not replace the prior valid payload");
  assert.deepEqual(waitRecords(session)[0].structured_data, rawJob.structured.data, "unavailable snapshot handling must not invent structured data");
}

function waitCaptureBoundMustBlock(apis, root) {
  const { session } = makeWaitFixture(apis, root, { label: "native-wait-capture-bound-red" });
  session.recordTool(waitStart(WAIT_CALL));
  const oversized = waitJob({ resultText: "x".repeat(16 * 1024 * 1024) });
  waitMustBlock(() => session.recordTool(waitEnd(WAIT_CALL, oversized)), "oversized raw wait metadata");
  assert.equal(waitRecords(session).length, 0, "oversized raw wait metadata must not publish a task record before the bound check");
}
function waitJobCountBoundMustBlock(apis, root) {
  const assignments = Array.from({ length: 257 }, (_, index) => assignment(
    `WaitBoundPeerReviewer${index}`,
    "peer-reviewer",
    `Read bounded wait job ${index} and return the current TDD peer schema.`,
  ));
  const session = createSession(apis.NativeRpcSession, root, assignments, "native-wait-count-bound-red");
  session.recordTool(rootStart(ROOT_CALL_WAIT, assignments));
  for (const [index, child] of assignments.entries()) {
    session.consumeLogical(lifecycleFrame({ id: `allocated-wait-overcount-${index}`, index, agent: child.agent, parentToolCallId: ROOT_CALL_WAIT }));
  }
  session.recordTool(rootEnd(
    ROOT_CALL_WAIT,
    SDK_JOB_WAIT,
    assignments.map((child, index) => progressRow(child, `allocated-wait-overcount-${index}`, index)),
  ));
  for (const [index, child] of assignments.entries()) {
    session.consumeLogical(lifecycleFrame({ id: `allocated-wait-overcount-${index}`, index, agent: child.agent, parentToolCallId: ROOT_CALL_WAIT, status: "completed" }));
  }
  session.recordTool(waitStart(WAIT_CALL));
  const jobs = assignments.map((_, index) => waitJob({
    id: index === 0 ? SDK_JOB_WAIT : `sdk-wait-overcount-${index}`,
    agentUrlId: `allocated-wait-overcount-${index}`,
  }));
  waitMustBlock(
    () => session.recordTool(waitEnd(WAIT_CALL, null, { details: { op: "wait", jobs } })),
    "wait jobs count above the bounded admission limit",
  );
  assert.equal(waitRecords(session).length, 0, "an over-count wait payload must not publish a task record before the bound check");
}
function safeError(error) {
  return {
    name: error?.name ?? "Error",
    kind: error?.kind ?? null,
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };
}

const EXPECTED_RED_CLASSIFICATIONS = new Set([
  "SECURITY_CONTROL:AC-016:P1a-raw-write-authority",
  "SECURITY_CONTROL:AC-016:P1b-backend-bridge-metadata",
  "SECURITY_CONTROL:AC-016:P1c-write-settlement",
  "SECURITY_CONTROL:AC-016:P1d-backend-retry-command-authority",
  "VALID_FINDING:AC-016:native09-backend-absent-schema-proof",
  "VALID_FINDING:AC-016:native09-backend-retry-actual-failure-footer",
]);

function isAssertionFailure(error) {
  return error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
}

function isExpectedRedFailure(classification, error) {
  return EXPECTED_RED_CLASSIFICATIONS.has(classification) && isAssertionFailure(error);
}

function executeCase(results, failures, name, classification, run) {
  try {
    run();
    results.push({ name, status: "PASS", classification });
  } catch (error) {
    const failure = { name, classification, failure_reason_expected: isExpectedRedFailure(classification, error), error: safeError(error) };
    failures.push(failure);
    results.push({ name, status: "FAIL", classification, failure_reason_expected: failure.failure_reason_expected, error: failure.error });
  }
}

async function executeAsyncCase(results, failures, name, classification, run) {
  try {
    await run();
    results.push({ name, status: "PASS", classification });
  } catch (error) {
    const failure = { name, classification, failure_reason_expected: isExpectedRedFailure(classification, error), error: safeError(error) };
    failures.push(failure);
    results.push({ name, status: "FAIL", classification, failure_reason_expected: failure.failure_reason_expected, error: failure.error });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.root, { recursive: true });
  const actualSourceSha = sha256File(options.source);
  assert.equal(actualSourceSha, options.expectedSourceSha, "current checkout lifecycle source hash must match the pinned probe input");
  const apis = await loadApis(options);
  const root = fs.mkdtempSync(path.join(options.root, "cases-"));
  const results = [];
  const failures = [];
  let baseline = null;

  executeCase(results, failures, "historical expanded 43-case probe is preserved without execution", "historical-baseline-preserved", () => {
    baseline = preserveHistoricalProbe(options);
  });
  executeCase(results, failures, "two legitimate flat async calls bind independently", "VALID_FINDING:lifecycle-1923-24", () => flatTwoCallPositive(apis, root));
  executeCase(results, failures, "valid nested terminal keeps its allocated outer identity", "positive-control:nested-identity", () => nestedIdentityPositive(apis, root));
  executeCase(results, failures, "valid Root wait terminal normalizes one authoritative record with raw structured peer data", "VALID_FINDING:AC-013/AC-016:task_wait_result", () => waitTerminalPositive(apis, root));
  executeCase(results, failures, "Root wait START accepts correlated tool_execution_update/tool_stream_update progress and one actual END authority", "VALID_FINDING:AC-016:wait-update-correlation", () => rootWaitCorrelatedUpdatesThenActualEndPositive(apis, root));
  executeCase(results, failures, "correlated Root wait running END remains non-terminal and a later completed wait yields one validated authority", "VALID_FINDING:AC-016:wait-running-end-then-completed", () => waitRunningEndThenCompletedWaitPublishesOneValidatedAuthority(apis, root));
  executeCase(results, failures, "mixed Root wait jobs keep the running member non-authoritative while the completed member remains valid", "VALID_FINDING:AC-016:wait-mixed-running-completed-batch", () => waitMixedRunningCompletedBatchKeepsOnlyCompletedAuthority(apis, root));
  executeCase(results, failures, "Native3 wait job and allocated child may share an opaque ID without losing Root ownership", "VALID_FINDING:AC-013/AC-016:Native3-shared-job-allocated-id", () => native3SharedJobAllocatedIdentityPositive(apis, root));
  executeCase(results, failures, "cumulative raw wait retention blocks a second 9 MiB job atomically", "SECURITY_CONTROL:AC-013/AC-016:wait-cumulative-raw-retention", () => cumulativeRawWaitRetentionBoundMustBlockAtomically(apis, root));
  executeCase(results, failures, "actual Root wait START/END without toolCallId are BLOCKED", "SECURITY_CONTROL:AC-013/AC-016:wait-tool-call-id-required", () => rootWaitToolCallIdRequiredMustBlock(apis, root));
  executeCase(results, failures, "legitimate same-batch second SDK job uses its own observed identity", "VALID_FINDING:AC-013/AC-016:same-batch-second-job", () => sameBatchSecondSdkJobPositive(apis, root));
  executeCase(results, failures, "same-Root batch secondary wait job may use its allocated ID as SDK job and agentUrlId", "VALID_FINDING:AC-016:same-batch-secondary-allocated-id", () => sameBatchSecondaryAllocatedSdkIdentityPositive(apis, root));
  executeCase(results, failures, "custom success followed by nonzero wait exitCode blocks cross-channel contradiction and preserves authority", "VALID_FINDING:AC-016:custom-wait-exitCode-contradiction", () => customThenWaitNonzeroExitCodeContradictionMustBlockAndRetainPrior(apis, root));
  executeCase(results, failures, "secondary custom success followed by a different wait SDK job blocks without overwriting authority", "VALID_FINDING:AC-016:custom-wait-sdk-drift", () => customSecondaryThenWaitDifferentSdkJobMustBlockAndRetainPrior(apis, root));
  executeCase(results, failures, "agentUrlId equal to job.id remains a navigation fallback under strong Root ownership", "VALID_FINDING:AC-013/AC-016:wait-agent-url-job-fallback", () => waitAgentUrlJobIdFallbackPositive(apis, root));
  executeCase(results, failures, "known allocated SDK job IDs select exact owner in six-role batch", "VALID_FINDING:AC-013/AC-016:wait-canonical-batch-owner", () => waitCanonicalAllocatedOwnersInBatch(apis, root));
  executeCase(results, failures, "custom async batch over 256 jobs BLOCKS before any admission mutation", "SECURITY_CONTROL:AC-013/AC-016:custom-batch-count-bound", () => customAsyncBatchCountBoundMustBlockAtomically(apis, root));
  executeCase(results, failures, "custom async second-row capture fault rolls back the entire batch", "SECURITY_CONTROL:AC-013/AC-016:custom-batch-capture-rollback", () => customAsyncBatchCaptureFaultRollsBack(apis, root));
  executeCase(results, failures, "custom schema.data strings remain byte-exact beyond safe-value truncation", "VALID_FINDING:AC-013/AC-016:custom-schema-raw-retention", () => customSchemaDataRetainedByteExact(apis, root));
  executeCase(results, failures, "Native09 backend custom completion admits unavailable schema only with the actual repair-write proof", "VALID_FINDING:AC-013/AC-016:native09-backend-repair-write-custom", () => native09BackendRepairCustomCompletionPositive(apis, root));
  executeCase(results, failures, "Native09 backend custom completion admits an absent upstream schema only with the exact repair-write proof", "VALID_FINDING:AC-016:native09-backend-absent-schema-proof", () => native09BackendRepairCustomCompletionAbsentSchema(apis, root));
  executeCase(results, failures, "Native09 backend wait completion admits an absent upstream structured field only with the exact repair-write proof", "VALID_FINDING:AC-016:native09-backend-absent-schema-proof", () => native09BackendRepairWaitCompletionAbsentStructured(apis, root));
  executeCase(results, failures, "Native09 backend contradictory raw agent/name/agentSource metadata blocks at write START and END without erasing the Root-bound opaque tuple", "SECURITY_CONTROL:AC-016:P1a-raw-write-authority", () => native09BackendContradictoryRawWriteMetadataMustBlock(apis, root));
  executeCase(results, failures, "Native09 backend truly absent raw agent/name/agentSource metadata remains accepted across CUSTOM and WAIT", "VALID_FINDING:AC-016:P1a-absent-raw-write-authority", () => native09BackendAbsentRawFieldsRemainAccepted(apis, root));
  executeCase(results, failures, "Native09 backend exact repair scope admits correlated FAIL-before-write and PASSOU-after-write command terminals", "SECURITY_CONTROL:AC-016:P1d-backend-retry-command-authority", () => native09BackendRetryCommandPositive(apis, root));
  executeCase(results, failures, "Native09 backend actual failure footer preserves the FAIL report and retry ownership", "VALID_FINDING:AC-016:native09-backend-retry-actual-failure-footer", () => native09BackendRetryCommandActualFailureFooter(apis, root));


  executeCase(results, failures, "Native09 backend repair requires Root-derived role_source and observed_binding beyond the backend-developer role label", "SECURITY_CONTROL:AC-016:P1b-backend-bridge-metadata", () => native09BackendProofBridgeMetadataMustGateSharedConsumer(apis, root));

  await executeAsyncCase(results, failures, "execute blocks pending child and Root write correlations while accepting fully closed CUSTOM and WAIT correlations", "SECURITY_CONTROL:AC-016:P1c-write-settlement", () => native09ExecuteSettlementBlocksPendingWriteCorrelations(apis, root));

  executeCase(results, failures, "bare Native09 backend observed/kind/count evidence cannot grant shared authority", "SECURITY_CONTROL:AC-013/AC-016:native09-backend-bare-proof", () => native09BackendBareEvidenceMustNotGrantAuthority(apis, root));
  executeCase(results, failures, "Native09 backend repair rejects unscoped, missing/foreign/unknown/failed/outside/duplicate writes and missing Root", "SECURITY_CONTROL:AC-013/AC-016:native09-backend-write-guards", () => native09BackendInvalidCompletionInputsMustReject(apis, root));
  executeCase(results, failures, "Native09 backend failed/cancelled manager terminals never satisfy shared success", "SECURITY_CONTROL:AC-013/AC-016:native09-backend-manager-status", () => native09BackendManagerStatusesMustReject(apis, root));
  executeCase(results, failures, "Native09 backend wait ownership ambiguity fails closed", "SECURITY_CONTROL:AC-013/AC-016:native09-backend-ambiguous-owner", () => native09BackendAmbiguousOwnerMustReject(apis, root));
  executeCase(results, failures, "actually exposed numeric wait exitCode is preserved without inferring child fields", "VALID_FINDING:AC-013/AC-016:wait-exitCode", () => waitExposedNumericExitCodePositive(apis, root));
  await executeAsyncCase(results, failures, "execute settles successfully only after the terminal Root wait result", "VALID_FINDING:AC-016:wait-settlement", () => waitTerminalExecuteSettlesAfterTerminal(apis, root));
  executeCase(results, failures, "wait START/END ownership, transport, parent, and project-source guards fail closed", "VALID_FINDING:AC-013/AC-016:wait-binding-guards", () => waitOwnershipAndTransportGuardsMustBlock(apis, root));
  executeCase(results, failures, "running/prose/failed/cancelled/schema-invalid wait payloads never authorize success", "VALID_FINDING:AC-013/AC-016:wait-terminality-and-schema", () => waitNonTerminalAndSchemaBoundariesCannotSucceed(apis, root));
  executeCase(results, failures, "duplicate wait and equivalent custom terminal deliveries commit exactly once", "VALID_FINDING:AC-013/AC-016:wait-dedup", () => waitDuplicateTerminalCommitsOnce(apis, root));
  executeCase(results, failures, "contradictory wait payload/status/ownership deliveries are BLOCKED without replacing prior authority", "VALID_FINDING:AC-013/AC-016:wait-contradiction", () => waitContradictoryTerminalsMustBlockAndRetainPrior(apis, root));
  executeCase(results, failures, "an unavailable consumed wait snapshot cannot invent or replace structured data", "VALID_FINDING:AC-013/AC-016:wait-unavailable-snapshot", () => waitUnavailableSnapshotCannotReplacePrior(apis, root));
  executeCase(results, failures, "oversized raw wait metadata is rejected before task-record publication", "SECURITY_CONTROL:AC-013/AC-016:wait-capture-bound", () => waitCaptureBoundMustBlock(apis, root));
  executeCase(results, failures, "wait jobs count is bounded before task-record mutation", "SECURITY_CONTROL:AC-013/AC-016:wait-count-bound", () => waitJobCountBoundMustBlock(apis, root));
  executeCase(results, failures, "conflicting nested IDs are rejected instead of silently reassigned", "VALID_FINDING:lifecycle-1463-73/2440/2526", () => nestedIdentityConflictMustBlock(apis, root));
  executeCase(results, failures, "actual post-END same-fullcall async progress is accepted", "FALSE_POSITIVE_CONTROL:lifecycle-2277-82", () => postEndActualWireShapeIsAccepted(apis, root));
  executeCase(results, failures, "progress-only post-END update is a malformed counterexample", "FALSE_POSITIVE:lifecycle-2277-82", () => postEndProgressOnlyCounterexampleIsRejected(apis, root));
  executeCase(results, failures, "early nested SDK job mismatch against the owning Root is BLOCKED", "VALID_FINDING:lifecycle-1921-26:early-root-sdk-job", () => earlyNestedSdkJobMismatchMustBlock(apis, root));
  executeCase(results, failures, "same-event nested jobId and job_id contradiction is BLOCKED", "VALID_FINDING:lifecycle-1921-26:same-event-alias-contradiction", () => earlyNestedSdkAliasContradictionMustBlock(apis, root));
  executeCase(results, failures, "early nested SDK job matching the owning Root is a legitimate positive", "positive-control:lifecycle-1921-26:root-sdk-job", () => earlyNestedOwningSdkJobPositive(apis, root));
  executeCase(results, failures, "managed skill URIs resolve to the private regular skill files", "VALID_FINDING:lifecycle-2191-before-2193-managed-skill-uri", () => managedSkillReadPathPositive(apis, root));
  executeCase(results, failures, "unknown managed skill URI is BLOCKED", "SECURITY_CONTROL:managed-skill-unknown-uri", () => unknownManagedSkillMustBlock(apis, root));
  executeCase(results, failures, "encoded traversal and outside resource URIs are BLOCKED", "SECURITY_CONTROL:managed-skill-uri-boundary", () => encodedTraversalAndOutsideUrisMustBlock(apis, root));
  executeCase(results, failures, "Root agent/proc/history transport URIs remain BLOCKED", "SECURITY_CONTROL:root-transport-uri-prohibitions", () => rootTransportUrisMustRemainBlocked(apis, root));

  const output = {
    status: failures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "native-async-completion-consumer-red",
    source: { path: options.source, sha256: actualSourceSha, expected_sha256: options.expectedSourceSha, retry_source_path: options.retrySource, retry_source_sha256: options.expectedRetrySha },
    baseline,
    cases: results.length,
    cases_run: results,
    triage: {
      "lifecycle-1923-24-flat-dispatch": {
        status: "VALID_FINDING",
        evidence: "Current consumer requires exactly one ended Root dispatch; the fixture supplies two independent flat task START/END calls and a valid async result for each owner.",
      },
      "lifecycle-1463-73-2440-2526-nested-identity": {
        status: "VALID_FINDING",
        evidence: "The positive control keeps identity on the outer allocated lifecycle payload and omits nested TaskID/task_id; the counterexample adds only foreign nested agentId/jobId/instanceId fields while preserving the allocated outer id and call correlation.",
      },
      "lifecycle-1921-26-early-nested-sdk-job": {
        status: "VALID_FINDING",
        evidence: "Each new case observes one owning Root START/END with its actual first SDK async jobId, binds the allocated child lifecycle, and sends the nested terminal before custom async-result delivery. A mismatching SDK jobId and contradictory same-event jobId/job_id aliases must block; the matching SDK jobId remains a positive while the host-derived binding.job_id is asserted distinct.",
      },
      "lifecycle-2277-82-post-end-progress-only": {
        status: "FALSE_POSITIVE_FOR_NATIVE_ASYNC",
        evidence_path: TRIAGE_CAPTURE,
        actual_run: "a6f0b202-d8ee-4abe-bb55-355a6134df9f",
        producer_consumer_evidence: "The retained capture records Root START sequence 13, Root END sequence 16, and same-fullcall UPDATE sequence 17; the actual async continuation carries the correlated async binding. This probe accepts progress plus that binding and rejects progress-only as a malformed counterexample.",
      },
      "lifecycle-2191-93-managed-skill-read": {
        status: "VALID_FINDING",
        actual_native_rejected_uri: "UNOBSERVED",
        evidence: "A disposable private fixture supplies regular .omp/skills/alignment/SKILL.md and references/routing-and-persistence.md files. The consumer assertion proves the managed skill branch must resolve those paths; it does not infer which URI an actual Native run rejected.",
      },
      "lifecycle-wait-terminal-consumer": {
        status: "VALID_FINDING",
        evidence: "The approved wait alternative uses Root wait START/END details.op=wait and raw jobs snapshots. Source-only UPDATE variants use only SDK-documented running/completed snapshot shapes, remain non-authoritative, and make no Native observation claim; failed raw statuses are not retained. New cases require exact Root/lifecycle ownership, explicit wait transport isError:false, status completed plus valid structured peer data, null/unobserved child fields when absent, distinct SDK job and allocated child IDs, one-time deduplication, contradiction blocking, unavailable-snapshot preservation, and bounded raw capture.",
      },
      "lifecycle-wait-running-end-then-completed": {
        status: "VALID_FINDING",
        source_primary_reference: "PinnedSdkTerminalWireScout: packages/coding-agent/src/async/job-control.ts:171-248 and packages/tui/src/tools/wait.ts:44-105 at can1357/oh-my-pi@9058ab9d229663e229e2867824ba6df6f21e9e59",
        evidence: "Native9 retained a successful wait transport with one sparse running task snapshot (id, type, status, agentUrlId). The source-only regression requires that correlated UPDATE/END remain transport-admissible without terminal or structured approval, then requires a new correlated completed snapshot with actual structured.data and the full observed Root/lifecycle binding to yield exactly one valid terminal authority.",
        limits: "Native9 did not retain structured, exit, or error fields for the running row; this test uses the exact sparse observed shape and does not infer the missing status cause or claim Native completion.",
      },
      "lifecycle-wait-mixed-running-completed-batch": {
        status: "VALID_FINDING",
        source_primary_reference: "PinnedSdkTerminalWireScout: packages/coding-agent/src/async/job-control.ts:171-248 and packages/tui/src/tools/wait.ts:44-105 at can1357/oh-my-pi@9058ab9d229663e229e2867824ba6df6f21e9e59",
        evidence: "The documented wait jobs collection permits per-job running/completed statuses. The regression keeps the sparse running member non-authoritative and requires only the independently bound completed member to pass shared authority/success predicates with raw snapshot and structured.data retained.",
        limits: "Native9 observed one running job, not a mixed batch; this is a bounded contract-shaped batch edge, not a claim that Native9 emitted mixed statuses.",
      },
      "lifecycle-native3-shared-job-allocated-id": {
        status: "VALID_FINDING",
        native_run: "71b9e688",
        evidence: "A valid Root TASK/lifecycle/async-job/wait mapping may expose job.id and allocated child id as NativeWireNegativePeer; ownership is established by the independent Root assignment tuple, not string inequality.",
      },
      "lifecycle-wait-cumulative-raw-retention": {
        status: "VALID_FINDING",
        evidence: "Two independent Root wait jobs retain deterministic 9 MiB resultText values; the first is admitted and the second must BLOCK before publication, raw metadata, ownership-map, or capture-budget mutation.",
      },
      "lifecycle-wait-tool-call-id-required": {
        status: "VALID_FINDING",
        evidence: "A Root wait transport without its own exact toolCallId is rejected at START/END; parent TASK identity is never substituted.",
      },
      "lifecycle-custom-same-batch-second-job": {
        status: "VALID_FINDING",
        evidence: "A second SDK job in one Root batch is admitted only through its own observed lifecycle/index mapping and actual job identity, not the first Root END async job ID.",
      },
      "lifecycle-wait-same-batch-secondary-allocated-id": {
        status: "VALID_FINDING",
        evidence: "A same-Root two-job batch preserves the independent lifecycle/index/assignment tuple when the secondary raw SDK job exposes both id and agentUrlId as that allocated child ID; both records must remain authoritative and successful.",
      },
      "lifecycle-custom-wait-exit-contradiction": {
        status: "VALID_FINDING",
        evidence: "A successful custom terminal followed by the same Root/allocated/SDK/schema wait snapshot with an actually exposed exitCode 1 must BLOCK before replacing the prior authority or its maps/counters.",
      },
      "lifecycle-custom-wait-sdk-drift": {
        status: "VALID_FINDING",
        evidence: "A secondary non-primary custom terminal for SDK job A followed by a same-ownership wait snapshot for SDK job B must BLOCK before overwriting the allocated-to-SDK map, source facts, records, or authority.",
      },
      "lifecycle-wait-agent-url-job-fallback": {
        status: "VALID_FINDING",
        evidence: "When SDK navigation exposes agentUrlId equal to job.id, strong Root TASK/lifecycle ownership still binds the allocated child independently of that hint.",
      },
      "lifecycle-custom-batch-count-bound": {
        status: "VALID_FINDING",
        evidence: "A deterministic 257-row custom async batch must BLOCK before records, async identity maps, ownership maps, transport identities, capture bytes, or capture completeness change.",
      },
      "lifecycle-custom-batch-capture-rollback": {
        status: "VALID_FINDING",
        evidence: "A deterministic second-row capture fault must roll back first-row custom record, raw capture, identity-map, ownership-map, transport, and budget mutations.",
      },
      "lifecycle-native09-backend-repair-write-completion": {
        status: "VALID_FINDING",
        evidence: "The new source-only seam uses the actual NativeRpcSession Root task START/END, lifecycle tuple, custom async-result and Root wait terminal with opaque allocated/job identities. A completed backend-developer job with structured.status unavailable is accepted only after one exact app/bin/quality.mjs write START/END with matched ownership, allowlist guard and explicit isError:false; the private proof retains the Root/lifecycle tuple and kind native09-backend-repair-write. Child exitCode/isError/error/aborted remain null/unobserved, unavailable payload is not reviewer approval, and bare observed/kind/count cannot forge authority.",
        negative_controls: ["unscoped backend role", "missing write", "foreign write/owner", "unknown SDK job", "failed write", "outside allowlist", "duplicate write", "failed manager", "cancelled manager", "missing Root", "ambiguous Root owner"],
        final_acceptance_boundary: "Outer changed subject, protected package, dependency/validator hash preservation, independent peer approval and second validator PASS remain required by the source-derived whole workflow; this consumer probe does not promote Native09.",
      },
      "lifecycle-native09-backend-retry-command-authority": {
        status: "VALID_FINDING",
        evidence: "The exact native09-technical-retry-repair scope must admit a backend-developer's observed node app/.omp/state/native-tooling/retry-check.mjs FAIL/nonzero/isError:true command before the allowlisted write and PASSOU/zero/isError:false command after it. Both command START/END pairs retain distinct tool call IDs plus the observed Root session, parent call, opaque allocated child, run, revision, command hash, and matched correlation; other labels, roles, commands, foreign identities, and uncorrelated terminals remain refused.",
        negative_controls: ["unscoped label", "non-backend role", "wrong command", "foreign allocated child", "END without START", "task correlation drift"],
      },
      "lifecycle-native09-backend-absent-schema-proof": {
        status: "VALID_FINDING",
        evidence: "The backend custom job omits its own schema and the wait job omits its own structured field, while both preserve completed manager status, null normalized structured output, absent child flags, and exactly one Root-bound allowlisted write proof. Explicit unavailable-schema positives remain separate unchanged controls.",
      },
      "lifecycle-native09-backend-retry-actual-failure-footer": {
        status: "VALID_FINDING",
        evidence: "The source-only NativeRpcSession seam carries the observed FAIL JSON report through the real Bash footer shape with Wall time, the SDK timeout-clamped warning, and Command exited with code 17, preserving Root/START-END/correlation/hash/write ordering; an unknown warning suffix remains unparsed.",
      },

      "lifecycle-custom-schema-raw-retention": {
        status: "VALID_FINDING",
        evidence: "An 8 KiB-plus custom schema.data string is checked by exact byte count and SHA-256 through both structured_data and raw async_result retention, without printing payload bytes.",
      },
    },
  };

  const expectedFailures = failures.filter((failure) => failure.failure_reason_expected === true);
  const unexpectedFailures = failures.filter((failure) => failure.failure_reason_expected !== true);
  output.harness = {
    expected_red_classifications: [...EXPECTED_RED_CLASSIFICATIONS],
    expected_failures: expectedFailures.map((failure) => failure.name),
    unexpected_failures: unexpectedFailures.map((failure) => failure.name),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (unexpectedFailures.length) {
    const error = new Error("source-only async RED harness found unexpected failures");
    error.name = "ProbeHarnessError";
    error.code = "ERR_PROBE_UNEXPECTED_FAILURE";
    error.probe = output;
    throw error;
  }
  if (expectedFailures.length) {
    const error = new Error("source-only async RED assertions failed as expected");
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
    probe: "native-async-completion-consumer-red",
    failure_reason_expected: error?.code === "ERR_ASSERTION" || error?.name === "AssertionError",
  };
  process.stderr.write(`${JSON.stringify({ ...probe, error: safeError(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
