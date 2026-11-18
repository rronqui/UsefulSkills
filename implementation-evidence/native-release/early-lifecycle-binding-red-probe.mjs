#!/usr/bin/env node
// Permanent source-only RED probe for T-011 / AC-016.
//
// This probe exercises the actual NativeRpcSession class through the same
// export-only seam used by the retained consumer probes. It never starts OMP,
// an SDK, a model call, a shell, a network operation, Git, or a product
// command. Created fixtures stay below --root; historical replay inputs are
// explicitly supplied, read-only artifacts, never personal-machine defaults.
//
// The primary speculative-launch contract permits a child lifecycle START to
// arrive before the Root task tool_execution_start. Such a frame is pending
// metadata, not a dispatch, assignment, permission, terminal, or success.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_SOURCE = path.join(SOURCE_DIR, "lifecycle.mjs");
const DEFAULT_ROUTE_SOURCE = path.join(SOURCE_DIR, "route-matrix.mjs");
const SHA256 = /^[a-f0-9]{64}$/i;
const AUTHENTIC_ROUTE_EVIDENCE_LEVEL = "native-omp-rpc-route-and-artifact-evaluation";
const REPO_ROOT = path.resolve(SOURCE_DIR, "../..");
const CURRENT_ALIGNMENT_SOURCE_FILES = Object.freeze([
  Object.freeze({ source: "alignment/SKILL.md", overlay: ".omp/skills/alignment/SKILL.md" }),
  Object.freeze({ source: "alignment/agents/requirements-reader.md", overlay: ".omp/agents/requirements-reader.md" }),
  Object.freeze({ source: "alignment/references/comprehension-review.md", overlay: ".omp/skills/alignment/references/comprehension-review.md" }),
  Object.freeze({ source: "alignment/references/domain-modeling.md", overlay: ".omp/skills/alignment/references/domain-modeling.md" }),
  Object.freeze({ source: "alignment/references/routing-and-persistence.md", overlay: ".omp/skills/alignment/references/routing-and-persistence.md" }),
  Object.freeze({ source: "alignment/references/writing-for-agents.md", overlay: ".omp/skills/alignment/references/writing-for-agents.md" }),
]);
const DEFAULT_ROUTE_EXTRA_READS = Object.freeze([
  ".omp/skills/alignment/agents/requirements-reader.md",
  ".omp/skills/tdd-orchestrator/references/model-policy.md",
]);
const DEFAULT_ROUTE_ROOT_PROFILE_READ = ".omp/agents/requirements-reader.md";
const ROOT_SESSION_ID = "root-session-early-lifecycle-red";
const ROOT_PROMPT_ID = "root-prompt-early-lifecycle-red";
const RUN_ID = "early-lifecycle-binding-red";
const FULL_ROOT_CALL = "root-dispatch|full-call-early";
const WRONG_ROOT_CALL = "root-dispatch|full-call-wrong";
const FULL_ROOT_JOB = "sdk-root-job|full-job-early";
const CANDIDATE_ID = "speculative-candidate|allocated-early";
const DUPLICATE_ID = "speculative-candidate|allocated-duplicate";
const ACTUAL_ID = "actual-root|allocated-authoritative";
const EARLY_AGENT = "validator";
const EARLY_TASK = "Canonical early lifecycle task.";
const READABLE_RELATIVE = "early-readable.txt";
const TOOLING_COMMAND = "node .omp/state/native-tooling/lifecycle-check.mjs";
const DOC_HANDOFF_RELATIVE = ".omp/state/native-observation/native10-doc-handoff.md";
const FAILED_ID = "speculative-candidate|failed";
const ORPHAN_ID = "speculative-candidate|orphan";
const CAPACITY_ID = "speculative-candidate|capacity";
const SECOND_ROOT_CALL = "root-dispatch|second-call";
const SECOND_ROOT_JOB = "sdk-root-job|second-job";
const PENDING_OBSERVATION_LIMIT = 256;
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const TOOLCALL_DELTA_COUNT = 36_000;
// Pinned SDK projection: AssistantMessageEvent includes toolcall_delta with
// contentIndex/delta/partial at types.ts lines 1741-1762.
const SDK_ASSISTANT_EVENT_TYPES = new Set([
  "start",
  "text_start",
  "text_delta",
  "text_end",
  "thinking_start",
  "thinking_delta",
  "thinking_end",
  "image_end",
  "toolcall_start",
  "toolcall_delta",
  "toolcall_end",
  "done",
  "error",
]);
const TIMEOUT_DIAGNOSTIC_BUDGET_MS = 2_000;
const TIMEOUT_STUB_ROOT_SESSION_ID = "root-session-timeout-diagnostic";
const TIMEOUT_DIAGNOSTIC_CANARY = "timeout-diagnostic-forbidden-body-canary";
const TIMEOUT_DIAGNOSTIC_KEYS = Object.freeze([
  "budget_ms",
  "command",
  "elapsed_ms",
  "kind",
  "original_terminal_presence",
  "reason_code",
  "request_id",
  "response_id",
  "root_session_id",
  "root_session_id_source",
  "state",
  "status",
  "success",
]);
const timeoutRpcStubs = new Map();





function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (values.has(key)) throw new Error(`duplicate argument: --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    values.set(key, value);
    index += 1;
  }
  const expectedSourceSha = values.get("expected-source-sha");
  const root = values.get("root");
  if (!expectedSourceSha || !SHA256.test(expectedSourceSha)) throw new Error("--expected-source-sha must be a SHA-256");
  if (!root) throw new Error("--root is required; all fixtures must remain below it");
  const routeInspectionInput = values.get("route-inspection-input");
  const routeTaskDescriptor = values.get("route-task-descriptor");
  const actualNativeInspectionInput = values.get("actual-native-inspection-input");
  const actualNativeTaskDescriptor = values.get("actual-native-task-descriptor");
  if (!routeInspectionInput || !routeTaskDescriptor) throw new Error("--route-inspection-input and --route-task-descriptor are required immutable replay inputs");
  if (!actualNativeInspectionInput || !actualNativeTaskDescriptor) throw new Error("--actual-native-inspection-input and --actual-native-task-descriptor are required immutable current Native route inputs");
  return {
    source: path.resolve(values.get("source") ?? DEFAULT_SOURCE),
    expectedSourceSha: expectedSourceSha.toLowerCase(),
    root: path.resolve(root),
    routeSource: path.resolve(values.get("route-source") ?? DEFAULT_ROUTE_SOURCE),
    routeInspectionInput: path.resolve(routeInspectionInput),
    routeTaskDescriptor: path.resolve(routeTaskDescriptor),
    actualNativeInspectionInput: path.resolve(actualNativeInspectionInput),
    actualNativeTaskDescriptor: path.resolve(actualNativeTaskDescriptor),
  };

}

function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sourceGuards(source, expectedSourceSha) {
  const bytes = fs.readFileSync(source);
  const text = bytes.toString("utf8");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSourceSha, "probe must bind to the supplied current lifecycle source bytes");
  for (const required of [
    "class NativeRpcSession",
    "consumeLogical(frame)",
    "recordTool(frame)",
    "recordSubagent(frame)",
    "recordAsyncResultMessage(frame, workflowOrdinal)",
    "frame.type === \"session_settled\"",
  ]) {
    assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `current source must contain the NativeRpcSession guard: ${required}`);
  }
  return { bytes: bytes.byteLength, sha256: expectedSourceSha };
}

function makeExportOnlySeam(options) {
  const seamRoot = path.join(options.root, "source-overlay");
  const seamDir = path.join(seamRoot, "implementation-evidence", "native-release");
  const protocolDir = path.join(seamRoot, "deep-review", "lib");
  fs.mkdirSync(seamDir, { recursive: true });
  fs.mkdirSync(protocolDir, { recursive: true });
  sourceGuards(options.source, options.expectedSourceSha);
  const sourceText = fs.readFileSync(options.source, "utf8");
  const seam = path.join(seamDir, "lifecycle.seam.mjs");
  fs.writeFileSync(
    seam,
    `${sourceText}\n\n// TEMP export-only seam; never part of the product.\nfunction __resetNativeCaptureForTest() { nativeCaptureHalt = null; }\nexport { NativeRpcSession, executeNativeCapture, failedNativeObservation, evaluateLifecycle, __resetNativeCaptureForTest };\n`,
    "utf8",
  );
  fs.copyFileSync(path.join(SOURCE_DIR, "technical-retry-scenario.mjs"), path.join(seamDir, "technical-retry-scenario.mjs"));
  fs.copyFileSync(path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs"), path.join(protocolDir, "protocol.mjs"));
  return seam;
}

function makeRouteExportOnlySeam(options) {
  const seamDir = path.join(options.root, "source-overlay", "implementation-evidence", "native-release");
  fs.mkdirSync(seamDir, { recursive: true });
  const routeSeam = path.join(seamDir, "route-matrix.seam.mjs");
  fs.copyFileSync(options.routeSource, routeSeam);
  return routeSeam;
}

async function loadApis(options) {
  const seam = makeExportOnlySeam(options);
  const routeSeam = makeRouteExportOnlySeam(options);
  const module = await import(`${pathToFileURL(seam).href}?source_sha=${options.expectedSourceSha}`);
  const route = await import(`${pathToFileURL(routeSeam).href}?route_source_sha=${sha256File(options.routeSource)}`);
  assert.equal(typeof module.NativeRpcSession, "function", "seam must expose the actual NativeRpcSession class");
  for (const method of ["bindSourceHost", "consumeLogical", "recordTool", "recordSubagent"]) {
    assert.equal(typeof module.NativeRpcSession.prototype[method], "function", `NativeRpcSession must expose ${method}`);
  }
  assert.equal(typeof module.executeNativeCapture, "function", "seam must expose the actual executeNativeCapture factory");
  assert.equal(typeof module.failedNativeObservation, "function", "seam must expose the bounded failedNativeObservation projection");
  for (const method of ["buildRouteCases", "buildRouteTaskDescriptor", "inspectRouteCase"]) {
    assert.equal(typeof route[method], "function", `route-matrix must expose ${method}`);
  }
  assert.equal(typeof module.evaluateLifecycle, "function", "seam must expose the actual final lifecycle evaluator");
  return { ...module, route };

}

function assignment(name = "EarlyValidator", agent = EARLY_AGENT, task = EARLY_TASK) {
  return {
    name,
    agent,
    task,
    solutionSpace: "Read-only source-derived early lifecycle binding probe.",
  };
}

function hostStateResponse() {
  return {
    type: "response",
    command: "get_state",
    id: "state-request-early-lifecycle-red",
    success: true,
    data: { sessionId: ROOT_SESSION_ID },
  };
}

function rootStart(toolCallId, assignments) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId,
    args: {
      context: "Bounded source-derived early lifecycle binding probe.",
      tasks: assignments,
    },
  };
}

function progressRow(item, id, index = 0, agentSource = "project") {
  return {
    id,
    index,
    agent: item.agent,
    agentSource,
    task: `Rendered prompt for ${item.name}.`,
    assignment: item.task,
  };
}

function rootEnd(toolCallId, jobId, progress, { isError = false, state = "running" } = {}) {
  return {
    type: "tool_execution_end",
    toolName: "task",
    toolCallId,
    isError,
    result: {
      details: {
        results: [],
        progress,
        async: { state, jobId, type: "task" },
      },
    },
  };
}
function rootEndWithResults(toolCallId, jobId, progress, results, options = {}) {
  const frame = rootEnd(toolCallId, jobId, progress, options);
  frame.result.details.results = results;
  return frame;
}
function rootProgressUpdate(toolCallId, progress) {
  return {
    type: "tool_execution_update",
    toolName: "task",
    toolCallId,
    partialResult: { details: { progress } },
  };
}


function lifecycleFrame({
  id,
  index = 0,
  agent = EARLY_AGENT,
  agentSource = "project",
  parentToolCallId = FULL_ROOT_CALL,
  status = "started",
}) {
  return {
    type: "subagent_lifecycle",
    payload: {
      id,
      index,
      agent,
      agentSource,
      parentToolCallId,
      status,
    },
  };
}
function subagentProgressFrame({
  id,
  index = 0,
  agent = EARLY_AGENT,
  agentSource = "project",
  parentToolCallId = FULL_ROOT_CALL,
  status = "running",
  assignmentText,
  toolCallId = null,
  omitOuterIdentity = false,
  terminal = {},
}) {
  return {
    type: "subagent_progress",
    payload: {
      id,
      index,
      ...(omitOuterIdentity ? {} : { agent, agentSource }),
      parentToolCallId,
      ...(toolCallId === null ? {} : { toolCallId }),
      progress: {
        id,
        index,
        agent,
        agentSource,
        parentToolCallId,
        ...(toolCallId === null ? {} : { toolCallId }),
        status,
        ...(assignmentText === undefined ? {} : { assignment: assignmentText }),
        ...terminal,
      },
    },
  };
}



function asyncJob(jobId, agentId) {
  return {
    jobId,
    type: "task",
    status: "completed",
    agentId,
    durationMs: 7,
    schema: {
      source: "agent",
      mode: "strict",
      status: "valid",
      data: { protocol: "EARLY_LIFECYCLE_BINDING_RED", status: "PASS" },
    },
  };
}

function asyncMessage(job) {
  return {
    type: "message_end",
    message: {
      role: "custom",
      customType: "async-result",
      details: { jobs: [job] },
    },
  };
}

function subagentEvent(allocatedId, agent, event, agentSource = "project") {
  return {
    type: "subagent_event",
    payload: {
      id: allocatedId,
      agent,
      agentSource,
      event,
    },
  };
}
function subagentAssistantMessageFrame({
  allocatedId,
  agent = EARLY_AGENT,
  agentSource = "project",
  assistantType = "text_delta",
  eventType = "message_update",
  delta = "token",
  messageId,
  isError,
  result,
}) {
  const event = {
    type: eventType,
    message: { role: "assistant" },
    messageId,
  };
  if (eventType === "message_update") {
    event.assistantMessageEvent = {
      type: assistantType,
      contentIndex: 0,
      delta,
      partial: { role: "assistant", content: [] },
    };
  }
  if (isError !== undefined) event.isError = isError;
  if (result !== undefined) event.result = result;
  return subagentEvent(allocatedId, agent, event, agentSource);
}
function sdkAssistantMessageFrame({
  allocatedId,
  agent = EARLY_AGENT,
  agentSource = "project",
  eventType = "message_update",
  assistantEventType,
  contentIndex = 0,
  delta = "opaque-sdk-delta",
  partialContent = [],
  messageId,
  isError,
  error,
  result,
}) {
  const event = {
    type: eventType,
    message: { role: "assistant" },
    messageId,
  };
  if (eventType === "message_update" && assistantEventType !== undefined && assistantEventType !== null) {
    event.assistantMessageEvent = {
      type: assistantEventType,
      contentIndex,
      delta,
      partial: { role: "assistant", content: partialContent },
    };
  }
  if (isError !== undefined) event.isError = isError;
  if (error !== undefined) event.error = error;
  if (result !== undefined) event.result = result;
  return subagentEvent(allocatedId, agent, event, agentSource);
}

function sdkToolcallMessageFrame({
  allocatedId,
  agent = EARLY_AGENT,
  agentSource = "project",
  assistantEventType = "toolcall_delta",
  contentIndex = 0,
  messageId = "assistant-message|toolcall-delta",
  pathValue = "toolcall-delta-readable.txt",
  toolCallId = "sdk-toolcall|read",
  toolName = "read",
  delta = "{}",
  eventType = "message_update",
  isError,
  error,
  result,
}) {
  const partialContent = pathValue === null ? [] : [{
    type: "toolCall",
    id: toolCallId,
    name: toolName,
    arguments: { path: pathValue },
  }];
  return sdkAssistantMessageFrame({
    allocatedId,
    agent,
    agentSource,
    eventType,
    assistantEventType,
    contentIndex,
    delta,
    partialContent,
    messageId,
    isError,
    error,
    result,
  });
}





function nestedReadFrames(relativePath = READABLE_RELATIVE, callId = "nested-read|full-call") {
  return [
    {
      type: "tool_execution_start",
      toolName: "read",
      toolCallId: callId,
      args: { path: relativePath },
    },
    {
      type: "tool_execution_end",
      toolName: "read",
      toolCallId: callId,
      isError: false,
      result: { content: [{ type: "text", text: "bounded early read\n" }] },
    },
  ];
}
function nestedReadStartFrame(relativePath = READABLE_RELATIVE, callId = "nested-read|full-call") {
  return nestedReadFrames(relativePath, callId)[0];
}

function rootResult(allocatedId, overrides = {}) {
  return {
    id: allocatedId,
    status: "completed",
    exitCode: 0,
    isError: false,
    output: "legitimate blocking result\n",
    ...overrides,
  };
}


function nestedWriteStart(pathValue = "outside-write.txt") {
  return {
    type: "tool_execution_start",
    toolName: "write",
    toolCallId: "nested-write|unauthorized",
    args: { path: pathValue, content: "must not be written" },
  };
}

function nestedBashStart() {
  return {
    type: "tool_execution_start",
    toolName: "bash",
    toolCallId: "nested-bash|unauthorized",
    args: { command: "echo unauthorized" },
  };
}
function nestedValidatorFrames(item, callId = "nested-validator|tooling-check") {
  const report = {
    status: "PASSOU",
    actual: 2,
    expected: 2,
    nonce: "bounded-validator-nonce",
    assignment_id: item.name,
    revision: "offline-early-lifecycle-revision",
    workload: {
      run_id: RUN_ID,
      source: "src/tiny.mjs",
      revision: "offline-early-lifecycle-revision",
    },
  };
  return [
    {
      type: "tool_execution_start",
      toolName: "bash",
      toolCallId: callId,
      args: { command: TOOLING_COMMAND },
    },
    {
      type: "tool_execution_end",
      toolName: "bash",
      toolCallId: callId,
      isError: false,
      exitCode: 0,
      result: {
        content: [{ type: "text", text: JSON.stringify(report) }],
        details: { exitCode: 0 },
      },
    },
  ];
}

function nestedSpecKitWriteFrames(root, callId = "nested-speckit|doc-handoff") {
  const pathValue = DOC_HANDOFF_RELATIVE;
  const absolutePath = path.resolve(root, pathValue);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, "AC-016\nNOT_EXECUTED\n", "utf8");
  return {
    pathValue,
    absolutePath,
    events: [
      {
        type: "tool_execution_start",
        toolName: "write",
        toolCallId: callId,
        args: { path: pathValue, content: "AC-016\nNOT_EXECUTED\n" },
      },
      {
        type: "tool_execution_update",
        toolName: "write",
        toolCallId: callId,
        args: { path: pathValue },
        partialResult: { details: { resolvedPath: absolutePath } },
      },
      {
        type: "tool_execution_end",
        toolName: "write",
        toolCallId: callId,
        isError: false,
        result: { details: { resolvedPath: absolutePath } },
      },
    ],
  };
}


function createSession(NativeRpcSession, root, assignments, label = "native-early-lifecycle-binding") {
  const session = new NativeRpcSession({
    omp: "offline-probe",
    cwd: root,
    timeoutMs: 1_000,
    assignments,
    logicalRunId: RUN_ID,
    label,
  });
  session.bindSourceHost(hostStateResponse(), "state-request-early-lifecycle-red", ROOT_PROMPT_ID);
  return session;
}

function captureError(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return error;
  }
}
function assertAssistantEventDiagnostics(frames, label) {
  const updates = frames.filter((frame) => frame.type === "message_update");
  assert.ok(updates.length > 0, `${label} must retain at least one SDK message_update`);
  for (const frame of updates) {
    const diagnostic = frame.assistant_event;
    assert.deepEqual(
      Object.keys(diagnostic ?? {}).sort(),
      ["content_index", "present", "type"],
      `${label} message_update must retain only a bounded assistant-event discriminator`,
    );
    assert.equal(typeof diagnostic.present, "boolean", `${label} assistant-event presence must be explicit`);
    assert.equal(typeof diagnostic.type, "string", `${label} assistant-event type classification must be explicit`);
    assert.ok(
      SDK_ASSISTANT_EVENT_TYPES.has(diagnostic.type)
        || diagnostic.type === "missing"
        || diagnostic.type === "unknown",
      `${label} assistant-event type must be a pinned SDK kind or missing/unknown`,
    );
    assert.ok(
      diagnostic.content_index === null
        || (Number.isSafeInteger(diagnostic.content_index) && diagnostic.content_index >= 0),
      `${label} assistant-event content_index must be null or a safe non-negative integer`,
    );
    assert.equal(
      diagnostic.present,
      diagnostic.type !== "missing",
      `${label} missing assistant events must be represented as missing, not an arbitrary type`,
    );
    for (const rawKey of ["assistantMessageEvent", "delta", "partial", "error", "result"]) {
      assert.equal(Object.hasOwn(frame, rawKey), false, `${label} must not retain raw SDK ${rawKey} payload`);
    }
  }
}

function consumeDiagnosticFrame(session, frame, label) {
  const error = captureError(() => session.consumeLogical(frame));
  assert.equal(error, null, `${label} must remain admissible through recordSubagentFrame`);
  return session.subagentSequence;
}


function assertBlocked(operation, name) {
  const error = captureError(operation);
  assert.ok(error, `${name} must fail closed instead of being accepted`);
  assert.equal(error?.kind, "BLOCKED", `${name} must preserve the BLOCKED root guard semantic`);
  return error;
}

function asyncRecords(session) {
  return session.evidence.task_records.filter((record) => record?.source_kind === "task_async_result");
}

function assertNoAcceptedAssignment(session, allocatedId, name) {
  assert.equal(session.lifecycleByAllocated?.has(`id:${allocatedId}`), false, `${name} must not create an accepted lifecycle binding`);
  assert.equal(
    session.evidence.task_records.some((record) => record?.allocated_id === allocatedId),
    false,
    `${name} must not create a terminal task record`,
  );
}

function consumePending(session, frame, name) {
  const error = captureError(() => session.consumeLogical(frame));
  assert.equal(error, null, `${name} must remain bounded pending metadata until Root dispatch confirmation`);
  assert.equal(session.evidence.task_records.length, 0, `${name} must not acquire terminal ownership while pending`);
  assert.equal(session.evidence.command_results.length, 0, `${name} must not grant shell permission while pending`);
  assert.equal(session.evidence.subagent_writes.length, 0, `${name} must not grant write permission while pending`);
  assert.equal(session.evidence.subagent_reads.length, 0, `${name} must not grant read permission while pending`);
}

function assertAcceptedRecord(session, expected) {
  const records = asyncRecords(session);
  assert.equal(records.length, 1, "exactly one authoritative async task record must be accepted");
  const [record] = records;
  assert.deepEqual(
    {
      allocated_id: record.allocated_id,
      parent_tool_call_id: record.parent_tool_call_id,
      index: record.index,
      agent: record.agent,
      agentSource: record.agentSource,
      assignment_id: record.assignment_id,
    },
    expected,
    "accepted task ownership must use the actual Root allocation tuple",
  );
  assert.equal(record.status, "completed", "accepted task record must preserve the actual completed status");
  assert.equal(record.is_error_observed, false, "async DTO absence must not fabricate an isError observation");
  assert.equal(record.exit_code_observed, false, "async DTO absence must not fabricate an exitCode observation");
  assert.equal(record.async_result?.job?.agentId, expected.allocated_id, "SDK agentId must match the actual allocated ID");
}

function defaultOrderingRemainsValid(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: item.agent }));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, ACTUAL_ID)]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: item.agent, status: "completed" }));
  session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, ACTUAL_ID)));
  assertAcceptedRecord(session, {
    allocated_id: ACTUAL_ID,
    parent_tool_call_id: FULL_ROOT_CALL,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
}

function rejectedMatchedAsyncResultRetainsBoundedDiagnostic(apis, root) {
  const authoritativeCompletionError = "async-result did not expose an authoritative successful task completion";
  const bodyMarker = "ASYNC_REJECTION_LARGE_BODY_MARKER_8f6f";
  const metaMarker = "ASYNC_REJECTION_META_MARKER_3a4c";
  const schemaDataMarker = "ASYNC_REJECTION_SCHEMA_DATA_MARKER_1c7e";
  const schemaErrorMarker = "ASYNC_REJECTION_SCHEMA_ERROR_MARKER_9d2b";
  const largeBody = `${bodyMarker}${"B".repeat(512 * 1024)}`;

  const runRejectedCase = (caseName, status, schema) => {
    const item = assignment(`RejectedAsync${caseName}`, EARLY_AGENT, `Reject ${caseName} without accepting an async completion.`);
    const session = createSession(apis.NativeRpcSession, root, [item], `native-async-rejection-${caseName.toLowerCase()}`);
    session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
    session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL }));
    session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, ACTUAL_ID)]));
    session.consumeLogical(lifecycleFrame({
      id: ACTUAL_ID,
      agent: item.agent,
      parentToolCallId: FULL_ROOT_CALL,
      status: "completed",
    }));

    const job = asyncJob(FULL_ROOT_JOB, ACTUAL_ID);
    job.status = status;
    job.meta = { body: largeBody, marker: metaMarker };
    if (schema === null) delete job.schema;
    else job.schema = schema;

    const captureBytesBeforeRejection = session.evidence.capture.bytes;
    const error = assertBlocked(
      () => session.consumeLogical(asyncMessage(job)),
      `${caseName} matched async-result`,
    );
    assert.equal(error.message, authoritativeCompletionError, `${caseName} must preserve the authoritative-completion rejection`);
    assert.equal(session.evidence.task_records.length, 0, `${caseName} must not accept a task record`);
    assert.equal(session.evidence.async_results.length, 0, `${caseName} must not accept an async result`);

    const observation = apis.failedNativeObservation(session, error);
    assert.ok(observation && typeof observation === "object", `${caseName} must project through failedNativeObservation`);
    assert.equal(observation.task_records.length, 0, `${caseName} failed observation must retain no accepted task record`);
    assert.deepEqual(
      observation.async_completion_rejections,
      session.evidence.async_completion_rejections,
      `${caseName} rejection diagnostic must survive failedNativeObservation`,
    );

    const diagnostics = session.evidence.async_completion_rejections;
    assert.ok(Array.isArray(diagnostics), `${caseName} must retain bounded async rejection diagnostics`);
    assert.equal(diagnostics.length, 1, `${caseName} must retain exactly one rejected async-result diagnostic`);
    const diagnostic = diagnostics[0];
    const lifecycleBinding = session.lifecycleByAllocated.get(`id:${ACTUAL_ID}`);
    assert.ok(lifecycleBinding?.accepted, `${caseName} must have a known accepted Root/lifecycle binding before rejection`);
    const hostBinding = {
      source: "observed-root-dispatch-lifecycle",
      root_session_id: ROOT_SESSION_ID,
      parent_tool_call_id: FULL_ROOT_CALL,
      allocated_id: ACTUAL_ID,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      assignment: item.name,
      assignment_id: item.name,
      job_id: lifecycleBinding.job_id,
      instance_id: lifecycleBinding.instance_id,
      root_task_end_is_error: false,
    };
    const expectedDiagnostic = {
      source: "message_end.custom.async-result.rejected",
      host_workflow_ordinal: session.evidence.host_workflow_ordinal,
      root_session_id: ROOT_SESSION_ID,
      binding: hostBinding,
      job_status: status,
      schema_present: Object.hasOwn(job, "schema"),
      schema_summary: schema === null ? null : {
        source: schema.source,
        mode: schema.mode,
        status: schema.status,
        data_present: Object.hasOwn(schema, "data"),
        error_present: Object.hasOwn(schema, "error"),
      },
      structured_output_status: schema?.status ?? null,
      independent_evidence_observed: false,
      independent_evidence_kind: null,
      pending_writes: 0,
      pending_root_writes: 0,
    };
    assert.deepEqual(
      Object.keys(diagnostic).sort(),
      Object.keys(expectedDiagnostic).sort(),
      `${caseName} diagnostic must retain exactly the bounded rejection fields`,
    );
    assert.deepEqual(
      Object.keys(diagnostic.binding ?? {}).sort(),
      Object.keys(hostBinding).sort(),
      `${caseName} diagnostic binding must retain exactly the expected host tuple fields`,
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(diagnostic)),
      JSON.parse(JSON.stringify(expectedDiagnostic)),
      `${caseName} diagnostic must retain only the bounded rejection summary`,
    );
    assert.ok(
      Number.isSafeInteger(diagnostic.host_workflow_ordinal) && diagnostic.host_workflow_ordinal > 0,
      `${caseName} diagnostic must retain the observed workflow ordinal`,
    );
    assert.equal(Object.hasOwn(diagnostic, "framework_completion"), false, `${caseName} diagnostic must not become framework completion`);
    const diagnosticText = JSON.stringify(diagnostic);
    for (const marker of [bodyMarker, metaMarker, schemaDataMarker, schemaErrorMarker]) {
      assert.equal(diagnosticText.includes(marker), false, `${caseName} diagnostic must not retain SDK payload marker ${marker}`);
    }

    const diagnosticBytes = Buffer.byteLength(JSON.stringify(diagnostic), "utf8");
    const captureBytesAfterRejection = session.evidence.capture.bytes;
    assert.equal(session.evidence.capture.max_bytes, MAX_CAPTURE_BYTES, `${caseName} capture must retain the existing 16 MiB physical budget`);
    assert.ok(
      Number.isSafeInteger(captureBytesBeforeRejection) && Number.isSafeInteger(captureBytesAfterRejection),
      `${caseName} physical capture budget counters must remain safe integers`,
    );
    assert.ok(
      captureBytesAfterRejection > captureBytesBeforeRejection,
      `${caseName} retained rejection diagnostic must charge physical capture bytes`,
    );
    assert.ok(
      captureBytesAfterRejection - captureBytesBeforeRejection >= diagnosticBytes,
      `${caseName} physical capture charge must cover the retained diagnostic bytes`,
    );
    assert.ok(
      captureBytesAfterRejection <= MAX_CAPTURE_BYTES,
      `${caseName} retained rejection diagnostic must remain within the existing 16 MiB budget`,
    );
  };

  runRejectedCase("FailedWithoutSchema", "failed", null);
  runRejectedCase("CancelledWithSchemaError", "cancelled", {
    source: "agent",
    mode: "strict",
    status: "valid",
    data: { marker: schemaDataMarker },
    error: schemaErrorMarker,
  });
}

function earlyLifecycleIsPendingThenAuthoritativelyAccepted(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(
    session,
    lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL }),
    "SDK lifecycle START before Root task START",
  );
  assert.equal(session.rootTaskCalls.size, 0, "an early SDK lifecycle must not fabricate a Root dispatch");

  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  assert.equal(session.rootTaskCalls.size, 1, "the Root dispatch must come from an observed task_execution_start");
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, CANDIDATE_ID)]));
  assert.equal(asyncRecords(session).length, 0, "Root END with isError:false is not a child completion by itself");
  session.consumeLogical(lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, status: "completed" }));
  session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, CANDIDATE_ID)));

  assertAcceptedRecord(session, {
    allocated_id: CANDIDATE_ID,
    parent_tool_call_id: FULL_ROOT_CALL,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
  const binding = session.lifecycleByAllocated.get(`id:${CANDIDATE_ID}`);
  assert.deepEqual(
    {
      allocated_id: binding?.allocated_id,
      parent_tool_call_id: binding?.parent_tool_call_id,
      index: binding?.index,
      agent: binding?.agent,
      agentSource: binding?.agentSource,
    },
    {
      allocated_id: CANDIDATE_ID,
      parent_tool_call_id: FULL_ROOT_CALL,
      index: 0,
      agent: item.agent,
      agentSource: "project",
    },
    "late adoption must preserve the exact actual Root dispatch tuple",
  );

  const earlyFrame = session.evidence.subagent_frames.find((frame) => frame.id === CANDIDATE_ID && frame.status === "started");
  const rootCall = session.evidence.task_calls.find((call) => call.tool_call_id === FULL_ROOT_CALL);
  assert.ok(earlyFrame, "the accepted evidence must retain the early lifecycle observation");
  assert.ok(Number.isSafeInteger(earlyFrame.host_arrival_ordinal), "early lifecycle evidence must retain its actual arrival ordinal");
  assert.ok(Number.isSafeInteger(rootCall?.host_arrival_ordinal), "Root dispatch evidence must retain its actual arrival ordinal");
  assert.ok(earlyFrame.host_arrival_ordinal < rootCall.host_arrival_ordinal, "early lifecycle evidence must not be replayed as if it arrived after Root dispatch");
}
function pendingNonterminalProgressCoalescesAndAdoptsProofs(apis, root) {
  const item = assignment("PendingProgressValidator", EARLY_AGENT, "Retain replaceable pending progress without losing required proofs.");
  const allocatedId = "speculative-candidate|progress-retention";
  const rootToolCallId = "root-dispatch|progress-retention";
  const rootJobId = "sdk-root-job|progress-retention";
  const session = createSession(apis.NativeRpcSession, root, [item], "native-early-progress-retention");
  consumePending(
    session,
    lifecycleFrame({ id: allocatedId, parentToolCallId: rootToolCallId, agent: item.agent }),
    "pending progress retention lifecycle START",
  );

  const totalSnapshots = PENDING_OBSERVATION_LIMIT + 64;
  let firstProgressOrdinal = null;
  let firstProgressWorkflowOrdinal = null;
  let firstProgressTimestamp = null;
  let lastProgressOrdinal = null;
  let lastProgressWorkflowOrdinal = null;
  for (let index = 0; index < totalSnapshots; index += 1) {
    const before = session.hostArrivalSequence;
    const status = index === totalSnapshots - 1 ? "progress" : "running";
    assert.doesNotThrow(
      () => session.consumeLogical(subagentProgressFrame({
        id: allocatedId,
        index: 0,
        agent: item.agent,
        agentSource: "project",
        parentToolCallId: rootToolCallId,
        status,
        assignmentText: item.task,
      })),
      `replaceable pending progress snapshot ${index} must remain admissible below the fixed retention budget`,
    );
    const ordinal = before + 1;
    const pendingFrame = session.pendingLifecycleByAllocated.get(`id:${allocatedId}`)?.pending_observations?.subagent_frames?.find(
      (frame) => frame.type === "subagent_progress",
    );
    if (firstProgressOrdinal === null) {
      firstProgressOrdinal = ordinal;
      firstProgressWorkflowOrdinal = pendingFrame?.host_workflow_ordinal ?? session.currentHostWorkflowOrdinal;
      firstProgressTimestamp = pendingFrame?.host_arrival_timestamp ?? null;
    }
    lastProgressOrdinal = ordinal;
    lastProgressWorkflowOrdinal = session.currentHostWorkflowOrdinal;
  }

  const readFixtures = [
    ["proof-a.txt", "pending-read|progress-a"],
    ["proof-b.txt", "pending-read|progress-b"],
  ];
  for (const [relativePath, callId] of readFixtures) {
    fs.writeFileSync(path.join(root, relativePath), `distinct proof ${relativePath}\n`, "utf8");
    for (const event of nestedReadFrames(relativePath, callId)) {
      assert.doesNotThrow(
        () => session.consumeLogical(subagentEvent(allocatedId, item.agent, event)),
        `distinct correlated pending read ${relativePath} must remain admissible`,
      );
    }
  }

  assert.equal(session.lifecycleByAllocated.has(`id:${allocatedId}`), false, "pending progress must not create accepted ownership before Root confirmation");
  assert.equal(session.pendingLifecycleByAllocated.get(`id:${allocatedId}`)?.accepted, false, "pending progress must remain non-authoritative");
  assert.equal(session.evidence.task_records.length, 0, "pending progress must not create a task terminal record");
  assert.equal(session.evidence.subagent_reads.length, 0, "pending reads must not grant read permission before Root confirmation");
  assert.equal(session.evidence.subagent_writes.length, 0, "pending progress must not grant write permission");
  assert.equal(session.evidence.command_results.length, 0, "pending progress must not grant role command credit");
  assert.ok(session.pendingObservationCount < PENDING_OBSERVATION_LIMIT, "replaceable progress must leave the fixed count budget for irreducible proofs");
  assert.ok(session.pendingObservationBytes < MAX_CAPTURE_BYTES, "replaceable progress must leave the fixed byte budget for irreducible proofs");

  session.recordTool(rootStart(rootToolCallId, [item]));
  assert.equal(session.lifecycleByAllocated.has(`id:${allocatedId}`), false, "Root START alone must not adopt pending progress");
  assert.equal(session.evidence.task_records.length, 0, "Root START alone must not create a terminal task record");
  session.recordTool(rootProgressUpdate(rootToolCallId, [progressRow(item, allocatedId)]));

  const binding = session.lifecycleByAllocated.get(`id:${allocatedId}`);
  assert.ok(binding?.accepted, "matching Root allocation progress must adopt the pending child");
  assert.equal(session.pendingLifecycleByAllocated.has(`id:${allocatedId}`), false, "adoption must remove only the matching pending child");
  const progressFrames = session.evidence.subagent_frames.filter(
    (frame) => frame.type === "subagent_progress" && frame.allocated_id === allocatedId,
  );
  assert.equal(progressFrames.length, 1, "replaceable nonterminal progress must coalesce to one bounded latest snapshot");
  const compactedProgress = progressFrames[0];
  assert.equal(compactedProgress.status, "progress", "coalescing must retain the latest progress status");
  assert.equal(compactedProgress.host_arrival_ordinal, lastProgressOrdinal, "retained latest progress must preserve its original host arrival ordinal");
  assert.equal(compactedProgress.host_workflow_ordinal, lastProgressWorkflowOrdinal, "retained latest progress must preserve its original workflow ordinal");
  assert.deepEqual(
    { ...compactedProgress.coalesced_nonterminal_progress },
    {
      count: totalSnapshots,
      first_host_arrival_ordinal: firstProgressOrdinal,
      first_host_workflow_ordinal: firstProgressWorkflowOrdinal,
      first_host_arrival_timestamp: firstProgressTimestamp,
      first_status: "running",
    },
    "coalescing must preserve first provenance while retaining the latest original frame fields",
  );
  assert.equal(
    compactedProgress.allocated_id === allocatedId
      && compactedProgress.parent_tool_call_id === rootToolCallId
      && compactedProgress.index === 0
      && compactedProgress.agent === item.agent
      && compactedProgress.agentSource === "project",
    true,
    "coalesced progress must preserve the complete allocated child tuple",
  );

  const reads = session.evidence.subagent_reads.filter((record) => record.allocated_id === allocatedId);
  assert.equal(reads.length, readFixtures.length * 1, "every distinct correlated read proof must survive pending adoption exactly once");
  assert.deepEqual(
    reads.map((record) => record.source_files?.[0]?.path).sort(),
    readFixtures.map(([relativePath]) => relativePath).sort(),
    "coalescing replaceable progress must not drop distinct read source provenance",
  );
  assert.equal(
    reads.every((record) =>
      record.parent_tool_call_id === rootToolCallId
      && record.index === 0
      && record.agent === item.agent
      && record.agentSource === "project"
      && record.allocated_id === allocatedId
    ),
    true,
    "adopted read proofs must retain the complete authoritative child tuple",
  );

  session.recordTool(rootEnd(rootToolCallId, rootJobId, [progressRow(item, allocatedId)]));
  session.consumeLogical(lifecycleFrame({
    id: allocatedId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    parentToolCallId: rootToolCallId,
    status: "completed",
  }));
  session.consumeLogical(asyncMessage(asyncJob(rootJobId, allocatedId)));
  assertAcceptedRecord(session, {
    allocated_id: allocatedId,
    parent_tool_call_id: rootToolCallId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
}




function pendingTerminalOverflowRollsBackAllCollections(apis, root) {
  const item = assignment("PendingTerminalOverflow", EARLY_AGENT, "Rollback every pending terminal collection atomically at the fixed observation boundary.");
  const allocatedId = "speculative-candidate|terminal-overflow";
  const rootToolCallId = "root-dispatch|terminal-overflow";
  const session = createSession(apis.NativeRpcSession, root, [item], "native-early-terminal-overflow");
  consumePending(
    session,
    lifecycleFrame({ id: allocatedId, parentToolCallId: rootToolCallId, agent: item.agent }),
    "pending terminal overflow lifecycle START",
  );

  const targetCount = PENDING_OBSERVATION_LIMIT - 2;
  let fillIndex = 0;
  while (session.pendingObservationCount < targetCount) {
    assert.doesNotThrow(
      () => session.consumeLogical(subagentProgressFrame({
        id: allocatedId,
        index: 0,
        agent: item.agent,
        agentSource: "project",
        parentToolCallId: rootToolCallId,
        status: "running",
        assignmentText: item.task,
        toolCallId: `irreducible-terminal-fill|${fillIndex}`,
      })),
      `irreducible pending fill ${fillIndex} must remain admissible below the terminal transaction boundary`,
    );
    fillIndex += 1;
  }
  assert.equal(session.pendingObservationCount, targetCount, "terminal overflow fixture must stop exactly two observations below the fixed count bound");

  const before = session.pendingLifecycleByAllocated.get(`id:${allocatedId}`);
  assert.ok(before, "terminal overflow fixture must retain its pending binding");
  const beforeObservations = cloneValue(before.pending_observations);
  const beforeCount = session.pendingObservationCount;
  const beforeBytes = session.pendingObservationBytes;
  const beforeBindingCount = before.pending_observation_count;
  const beforeBindingBytes = before.pending_observation_bytes;
  const beforeProgressStatus = before.progress_status;
  const beforeProgressTerminal = before.progress_terminal == null ? null : cloneValue(before.progress_terminal);

  const overflowError = captureError(() => session.consumeLogical(subagentProgressFrame({
    id: allocatedId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    parentToolCallId: rootToolCallId,
    status: "aborted",
    assignmentText: item.task,
    toolCallId: "irreducible-terminal-fill|overflow",
    terminal: { aborted: true, isError: true, error: "bounded terminal overflow" },
  })));
  assert.ok(overflowError, "terminal progress must reject when its final terminal collection would exceed the fixed bound");
  assert.equal(overflowError.kind, "BLOCKED", "terminal progress overflow must fail closed with a BLOCKED guard");

  const after = session.pendingLifecycleByAllocated.get(`id:${allocatedId}`);
  assert.ok(after, "terminal overflow rejection must retain the pending binding");
  assert.deepEqual(cloneValue(after.pending_observations), beforeObservations, "terminal overflow rejection must restore every pending collection contents");
  assert.equal(session.pendingObservationCount, beforeCount, "terminal overflow rejection must restore the pending observation count");
  assert.equal(session.pendingObservationBytes, beforeBytes, "terminal overflow rejection must restore the pending observation bytes");
  assert.equal(after.pending_observation_count, beforeBindingCount, "terminal overflow rejection must restore the binding observation count");
  assert.equal(after.pending_observation_bytes, beforeBindingBytes, "terminal overflow rejection must restore the binding observation bytes");
  assert.equal(after.progress_status, beforeProgressStatus, "terminal overflow rejection must restore progress state");
  assert.deepEqual(after.progress_terminal == null ? null : cloneValue(after.progress_terminal), beforeProgressTerminal, "terminal overflow rejection must not latch terminal progress state");
  assert.equal(session.lifecycleByAllocated.size, 0, "terminal overflow rejection must not create accepted ownership");
  assert.equal(session.evidence.native_progress_terminal.length, 0, "terminal overflow rejection must not publish terminal progress credit");
  assert.equal(session.evidence.task_records.length, 0, "terminal overflow rejection must not publish a task terminal record");
  assert.equal(session.evidence.root_task_ends.length, 0, "terminal overflow rejection must not fabricate Root terminal credit");

  const retention = session.evidence.lifecycle_diagnostic_budget?.pending_retention;
  assert.ok(retention, "terminal overflow rejection must retain one bounded pending-retention diagnostic");
  assert.ok(Number.isSafeInteger(retention.count) && retention.count <= PENDING_OBSERVATION_LIMIT, "terminal overflow diagnostic count must remain bounded");
  assert.ok(Number.isSafeInteger(retention.bytes) && retention.bytes <= MAX_CAPTURE_BYTES, "terminal overflow diagnostic bytes must remain bounded");
  assert.ok(Buffer.byteLength(JSON.stringify(retention), "utf8") <= MAX_CAPTURE_BYTES, "terminal overflow diagnostic serialization must remain bounded");
}

function pendingProgressMissingOuterAliasesRetainsDerivedIdentity(apis, root) {
  const item = assignment("PendingProgressAliasFallback", EARLY_AGENT, "Retain derived progress identity while preserving missing outer aliases.");
  const allocatedId = "speculative-candidate|progress-alias-fallback";
  const rootToolCallId = "root-dispatch|progress-alias-fallback";
  const rootJobId = "sdk-root-job|progress-alias-fallback";
  const session = createSession(apis.NativeRpcSession, root, [item], "native-early-progress-alias-fallback");
  consumePending(
    session,
    lifecycleFrame({ id: allocatedId, parentToolCallId: rootToolCallId, agent: item.agent }),
    "pending alias fallback lifecycle START",
  );

  const totalSnapshots = 8;
  for (let index = 0; index < totalSnapshots; index += 1) {
    assert.doesNotThrow(
      () => session.consumeLogical(subagentProgressFrame({
        id: allocatedId,
        index: 0,
        agent: item.agent,
        agentSource: "project",
        parentToolCallId: rootToolCallId,
        status: index === totalSnapshots - 1 ? "progress" : "running",
        assignmentText: item.task,
        omitOuterIdentity: index === totalSnapshots - 1,
      })),
      `plain pending progress snapshot ${index} must remain admissible with valid nested identity`,
    );
  }

  const proofPath = "alias-fallback-proof.txt";
  fs.writeFileSync(path.join(root, proofPath), "distinct alias fallback proof\n", "utf8");
  for (const event of nestedReadFrames(proofPath, "pending-read|alias-fallback")) {
    assert.doesNotThrow(
      () => session.consumeLogical(subagentEvent(allocatedId, item.agent, event)),
      "distinct correlated proof must remain admissible beside alias-fallback progress",
    );
  }

  assert.equal(session.lifecycleByAllocated.has(`id:${allocatedId}`), false, "alias-fallback progress must not create ownership before Root confirmation");
  assert.equal(session.pendingLifecycleByAllocated.get(`id:${allocatedId}`)?.accepted, false, "alias-fallback progress must remain non-authoritative before Root confirmation");
  assert.equal(session.evidence.subagent_reads.length, 0, "alias-fallback pending proof must not grant read permission early");
  assert.equal(session.evidence.task_records.length, 0, "alias-fallback pending progress must not grant terminal credit early");

  session.recordTool(rootStart(rootToolCallId, [item]));
  assert.equal(session.lifecycleByAllocated.has(`id:${allocatedId}`), false, "Root START alone must not adopt alias-fallback progress");
  session.recordTool(rootProgressUpdate(rootToolCallId, [progressRow(item, allocatedId)]));

  const binding = session.lifecycleByAllocated.get(`id:${allocatedId}`);
  assert.ok(binding?.accepted, "matching Root allocation progress must adopt alias-fallback progress");
  const progressFrames = session.evidence.subagent_frames.filter(
    (frame) => frame.type === "subagent_progress" && frame.allocated_id === allocatedId,
  );
  assert.equal(progressFrames.length, 1, "repeated plain progress must remain one bounded latest snapshot");
  const latest = progressFrames[0];
  assert.equal(latest.status, "progress", "latest progress status must survive alias fallback");
  assert.equal(latest.allocated_id, allocatedId, "latest progress must retain the derived allocated ID");
  assert.equal(latest.parent_tool_call_id, rootToolCallId, "latest progress must retain the derived full parent tuple");
  assert.equal(latest.index, 0, "latest progress must retain the derived index");
  assert.equal(latest.agent, item.agent, "latest progress must retain the derived agent despite missing outer alias");
  assert.equal(latest.agentSource, "project", "latest progress must retain the derived agentSource despite missing outer alias");
  assert.equal(latest.raw_progress_identity?.agent, null, "latest progress must retain the missing raw outer agent alias separately");
  assert.equal(latest.raw_progress_identity?.agentSource, null, "latest progress must retain the missing raw outer agentSource alias separately");

  const reads = session.evidence.subagent_reads.filter((record) => record.allocated_id === allocatedId);
  assert.equal(reads.length, 1, "distinct correlated proof must survive alias-fallback adoption");
  assert.equal(reads[0].source_files?.[0]?.path, proofPath, "alias-fallback adoption must preserve distinct proof provenance");
  assert.equal(reads[0].parent_tool_call_id, rootToolCallId, "alias-fallback proof must retain the complete parent tuple");
  assert.equal(reads[0].agent, item.agent, "alias-fallback proof must retain the canonical agent");
  assert.equal(reads[0].agentSource, "project", "alias-fallback proof must retain the canonical agentSource");

  session.recordTool(rootEnd(rootToolCallId, rootJobId, [progressRow(item, allocatedId)]));
  session.consumeLogical(lifecycleFrame({
    id: allocatedId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    parentToolCallId: rootToolCallId,
    status: "completed",
  }));
  session.consumeLogical(asyncMessage(asyncJob(rootJobId, allocatedId)));
  assertAcceptedRecord(session, {
    allocated_id: allocatedId,
    parent_tool_call_id: rootToolCallId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
}

function malformedProgressIdentityRollsBackWithoutOrphaning(apis, root) {
  const item = assignment("MalformedProgressCleanup", EARLY_AGENT, "Reject malformed progress identities without orphaning pending state.");
  const rootToolCallId = "root-dispatch|malformed-progress-cleanup";
  const rootJobId = "sdk-root-job|malformed-progress-cleanup";
  const actualId = "speculative-candidate|malformed-progress-cleanup";
  const session = createSession(apis.NativeRpcSession, root, [item], "native-early-malformed-progress-cleanup");
  const malformedIds = [
    { candidate: "malformed-progress|one" },
    { candidate: "malformed-progress|two" },
  ];
  const malformedFrame = (malformedId) => ({
    type: "subagent_progress",
    payload: {
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      progress: {
        id: malformedId,
        index: 0,
        agent: item.agent,
        agentSource: "project",
        parentToolCallId: rootToolCallId,
        status: "running",
        assignment: item.task,
      },
    },
  });

  const errors = malformedIds.map((malformedId) =>
    captureError(() => session.consumeLogical(malformedFrame(malformedId))));
  assert.equal(errors.length, malformedIds.length, "each distinct malformed progress identity must be exercised");
  assert.equal(
    errors.every((error) => error?.kind === "BLOCKED"),
    true,
    "each malformed progress identity must be rejected by the BLOCKED guard",
  );

  const orphanSnapshot = {
    pendingBindings: session.pendingLifecycleByAllocated.size,
    pendingIndexBindings: session.pendingLifecycleByIndex.size,
    pendingObservationCount: session.pendingObservationCount,
    pendingObservationBytes: session.pendingObservationBytes,
    pendingFrameRecords: [...session.pendingLifecycleByAllocated.values()].reduce(
      (total, binding) => total + (binding.pending_observations?.subagent_frames?.length ?? 0),
      0,
    ),
    acceptedBindings: session.lifecycleByAllocated.size,
    capturedFrameRecords: session.evidence.subagent_frames.length,
    taskRecords: session.evidence.task_records.length,
  };

  const rootError = captureError(() => {
    session.recordTool(rootStart(rootToolCallId, [item]));
    session.consumeLogical(lifecycleFrame({
      id: actualId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    }));
    session.recordTool(rootEnd(rootToolCallId, rootJobId, [progressRow(item, actualId)]));
    session.consumeLogical(lifecycleFrame({
      id: actualId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "completed",
    }));
    session.consumeLogical(asyncMessage(asyncJob(rootJobId, actualId)));
  });
  assert.equal(rootError, null, "malformed progress orphans must not block authoritative Root settlement");
  assertAcceptedRecord(session, {
    allocated_id: actualId,
    parent_tool_call_id: rootToolCallId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });

  assert.equal(orphanSnapshot.pendingBindings, 0, "malformed progress must not leave pending lifecycle bindings");
  assert.equal(orphanSnapshot.pendingIndexBindings, 0, "malformed progress must not leave pending index candidates");
  assert.equal(orphanSnapshot.pendingObservationCount, 0, "malformed progress must not desynchronize the pending observation count");
  assert.equal(orphanSnapshot.pendingObservationBytes, 0, "malformed progress must not desynchronize the pending observation bytes");
  assert.equal(orphanSnapshot.pendingFrameRecords, 0, "malformed progress must not leave buffered frame records");
  assert.equal(orphanSnapshot.acceptedBindings, 0, "malformed progress must not create accepted ownership");
  assert.equal(orphanSnapshot.capturedFrameRecords, 0, "malformed progress must not publish frame records");
  assert.equal(orphanSnapshot.taskRecords, 0, "malformed progress must not publish terminal credit");
}

function noRootDispatchNeverPasses(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(
    session,
    lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL }),
    "speculative lifecycle without a Root dispatch",
  );
  assertBlocked(
    () => session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, CANDIDATE_ID))),
    "async result without Root dispatch",
  );
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "speculative lifecycle without Root dispatch");
  assert.equal(session.rootTaskCalls.size, 0, "no Root task call may be synthesized from pending metadata");
  assert.equal(session.evidence.task_calls.length, 0, "no Root task evidence may be fabricated");
}

function rootTerminalCannotSettleUnresolvedPendingOwnership(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(
    session,
    lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL }),
    "pending lifecycle before unresolved Root terminal",
  );
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  assertBlocked(
    () => session.consumeLogical({ type: "session_settled" }),
    "Root session terminal with unresolved pending ownership",
  );
  assert.notEqual(session.evidence.terminal?.session_settled, true, "unresolved pending ownership must not settle the Root session");
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "unresolved pending ownership");
}

function wrongTupleCannotAcquire(apis, root, variant) {
  const candidate = variant.candidate ?? assignment("CandidateValidator", EARLY_AGENT, "Candidate tuple must not be rebound.");
  const rootAssignments = variant.rootAssignments;
  const assignmentsByName = new Map([candidate, ...rootAssignments].map((item) => [item.name, item]));
  const session = createSession(apis.NativeRpcSession, root, [...assignmentsByName.values()]);
  const candidateFrame = lifecycleFrame({
    id: CANDIDATE_ID,
    index: variant.candidateIndex ?? 0,
    agent: variant.candidateAgent ?? candidate.agent,
    agentSource: variant.candidateSource ?? "project",
    parentToolCallId: variant.candidateParent ?? FULL_ROOT_CALL,
  });
  consumePending(session, candidateFrame, `${variant.name} candidate lifecycle`);

  session.recordTool(rootStart(variant.rootCall ?? FULL_ROOT_CALL, rootAssignments));
  const actual = variant.actual;
  const rebound = lifecycleFrame({
    id: CANDIDATE_ID,
    index: actual.index,
    agent: actual.agent,
    agentSource: actual.agentSource,
    parentToolCallId: variant.rootCall ?? FULL_ROOT_CALL,
    status: "started",
  });
  assertBlocked(() => session.consumeLogical(rebound), `${variant.name} rebound lifecycle`);
  assertNoAcceptedAssignment(session, CANDIDATE_ID, `${variant.name} rebound lifecycle`);
  assert.equal(session.lifecycleByIndex?.has(`${variant.rootCall ?? FULL_ROOT_CALL}\u001f${actual.index}`), false, `${variant.name} must not acquire a logical index`);
}

function wrongParentIdCannotAcquire(apis, root) {
  const item = assignment("WrongParentCandidate", EARLY_AGENT, "Wrong parent candidate.");
  wrongTupleCannotAcquire(apis, root, {
    name: "wrong full parentToolCallId",
    candidate: item,
    candidateParent: WRONG_ROOT_CALL,
    rootAssignments: [item],
    actual: { index: 0, agent: item.agent, agentSource: "project" },
  });
}

function reboundIndexCannotAcquire(apis, root) {
  const candidate = assignment("IndexCandidate", EARLY_AGENT, "Index candidate.");
  const actual = assignment("IndexActual", EARLY_AGENT, "Index actual.");
  wrongTupleCannotAcquire(apis, root, {
    name: "rebound index",
    candidate,
    rootAssignments: [assignment("Decoy", "architect", "Decoy assignment."), actual],
    actual: { index: 1, agent: actual.agent, agentSource: "project" },
  });
}

function reboundAgentCannotAcquire(apis, root) {
  const candidate = assignment("AgentCandidate", EARLY_AGENT, "Agent candidate.");
  const actual = assignment("AgentActual", "backend-developer", "Agent actual.");
  wrongTupleCannotAcquire(apis, root, {
    name: "rebound agent",
    candidate,
    rootAssignments: [actual],
    actual: { index: 0, agent: actual.agent, agentSource: "project" },
  });
}

function reboundAgentSourceCannotAcquire(apis, root) {
  const item = assignment("SourceCandidate", EARLY_AGENT, "Source candidate.");
  wrongTupleCannotAcquire(apis, root, {
    name: "rebound agentSource",
    candidate: item,
    rootAssignments: [item],
    actual: { index: 0, agent: item.agent, agentSource: "user" },
  });
}

function duplicateAllocationDoesNotAcquireLogicalAssignment(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent }), "first speculative allocation");
  consumePending(session, lifecycleFrame({ id: DUPLICATE_ID, agent: item.agent }), "duplicate speculative allocation");
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, CANDIDATE_ID)]));
  session.consumeLogical(lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, status: "completed" }));
  session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, CANDIDATE_ID)));
  assertAcceptedRecord(session, {
    allocated_id: CANDIDATE_ID,
    parent_tool_call_id: FULL_ROOT_CALL,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
  assertNoAcceptedAssignment(session, DUPLICATE_ID, "duplicate allocation not selected by Root progress");
  const duplicateError = captureError(() => session.consumeLogical(lifecycleFrame({ id: DUPLICATE_ID, agent: item.agent, status: "completed" })));
  if (duplicateError) assert.equal(duplicateError.kind, "BLOCKED", "duplicate allocation rejection must remain a BLOCKED guard");
  assert.equal(session.lifecycleByIndex?.size, 1, "duplicate allocation must not create a second logical index binding");
}

function earlyNestedReadIsDeferredAndUnauthorizedToolsStayBlocked(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  const readable = path.join(root, READABLE_RELATIVE);
  fs.writeFileSync(readable, "bounded early read\n", "utf8");
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent }), "early child lifecycle");

  const [readStart, readEnd] = nestedReadFrames();
  consumePending(session, subagentEvent(CANDIDATE_ID, item.agent, readStart), "early nested read START");
  consumePending(session, subagentEvent(CANDIDATE_ID, item.agent, readEnd), "early nested read END");
  assert.equal(session.evidence.subagent_reads.length, 0, "early nested read must not gain permission before parent confirmation");

  assertBlocked(
    () => session.consumeLogical(subagentEvent(CANDIDATE_ID, item.agent, nestedWriteStart())),
    "unauthorized early nested write",
  );
  assertBlocked(
    () => session.consumeLogical(subagentEvent(CANDIDATE_ID, item.agent, nestedBashStart())),
    "unauthorized early nested Bash",
  );
  assert.equal(session.evidence.subagent_writes.length, 0, "unauthorized early write must not be retained as an admitted write");
  assert.equal(session.evidence.command_results.length, 0, "unauthorized early Bash must not be retained as an admitted command");

  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, CANDIDATE_ID)]));
  session.consumeLogical(lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, status: "completed" }));
  const readsBeforeAsync = session.evidence.subagent_reads.filter((record) => record.allocated_id === CANDIDATE_ID);
  assert.equal(readsBeforeAsync.length, 1, "deferred nested read must be correlated only after actual parent confirmation");
  assert.equal(readsBeforeAsync[0].parent_tool_call_id, FULL_ROOT_CALL, "deferred read must retain the actual Root parent");
  assert.equal(readsBeforeAsync[0].allocated_id, CANDIDATE_ID, "deferred read must retain the actual allocated ID");
  session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, CANDIDATE_ID)));
  assertAcceptedRecord(session, {
    allocated_id: CANDIDATE_ID,
    parent_tool_call_id: FULL_ROOT_CALL,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
}
function earlyValidatorToolingCommandIsDeferredThenAdmitted(apis, root) {
  const item = assignment("Native10Validator", "validator", "Exact tooling command must remain pending until Root allocation.");
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent }), "early validator lifecycle");

  for (const [index, event] of nestedValidatorFrames(item).entries()) {
    consumePending(
      session,
      subagentEvent(CANDIDATE_ID, item.agent, event),
      `early validator TOOLING_COMMAND frame ${index}`,
    );
  }
  assert.equal(session.evidence.command_results.length, 0, "early validator command must not grant permission before Root confirmation");

  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  assert.equal(session.evidence.command_results.length, 0, "Root START alone must not replay an early command before allocation is complete");
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, CANDIDATE_ID)]));
  session.consumeLogical(lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, status: "completed" }));

  const results = session.evidence.command_results.filter((record) => record.allocated_id === CANDIDATE_ID);
  assert.equal(results.length, 2, "the confirmed validator command must retain START and END evidence");
  assert.deepEqual(results.map((record) => record.phase), ["start", "end"], "validator command phases must remain ordered");
  assert.equal(results.every((record) => record.parent_tool_call_id === FULL_ROOT_CALL), true, "validator command must use the actual Root parent");
  assert.equal(results.every((record) => record.allocated_id === CANDIDATE_ID), true, "validator command must use the actual allocated ID");
  assert.equal(results[0].command_label, TOOLING_COMMAND, "validator command must match the exact existing TOOLING_COMMAND");
  assert.equal(results[1].guard?.reason_code, null, "valid validator command must pass the existing guard");
  assert.equal(results[1].correlation?.status, "matched", "validator END must correlate with its START");
  assert.equal(results[1].observed?.present, true, "validator END must retain an observed result");
  assert.equal(results[1].is_error, false, "validator END must retain the top-level non-error observation");
  assert.equal(results[1].is_error_observed, true, "validator END must retain the explicit top-level isError observation");
  assert.equal(results[1].report?.status, "PASSOU", "validator report must use the valid producer result shape");

  const rootCall = session.evidence.task_calls.find((call) => call.tool_call_id === FULL_ROOT_CALL);
  assert.ok(Number.isSafeInteger(rootCall?.host_arrival_ordinal), "Root dispatch must retain its arrival ordinal");
  assert.equal(
    results.every((record) => Number.isSafeInteger(record.host_arrival_ordinal) && record.host_arrival_ordinal < rootCall.host_arrival_ordinal),
    true,
    "deferred validator command evidence must retain its pre-Root arrival ordinals",
  );

  session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, CANDIDATE_ID)));
  assertAcceptedRecord(session, {
    allocated_id: CANDIDATE_ID,
    parent_tool_call_id: FULL_ROOT_CALL,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
}

function earlySpecKitAuthorDocHandoffIsDeferredThenAdmitted(apis, root) {
  const item = assignment("Native10SpecKitAuthor", "spec-kit-author", "Exact metadata handoff must remain pending until Root allocation.");
  const session = createSession(apis.NativeRpcSession, root, [item]);
  const handoff = nestedSpecKitWriteFrames(root);
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent }), "early spec-kit-author lifecycle");

  for (const [index, event] of handoff.events.entries()) {
    consumePending(
      session,
      subagentEvent(CANDIDATE_ID, item.agent, event),
      `early spec-kit-author DOC handoff frame ${index}`,
    );
  }
  assert.equal(session.evidence.subagent_writes.length, 0, "early metadata handoff must not grant write permission before Root confirmation");

  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  assert.equal(session.evidence.subagent_writes.length, 0, "Root START alone must not replay an early metadata handoff");
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, CANDIDATE_ID)]));
  session.consumeLogical(lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, status: "completed" }));

  const writes = session.evidence.subagent_writes.filter((record) => record.allocated_id === CANDIDATE_ID);
  assert.equal(writes.length, 3, "the confirmed metadata handoff must retain START, UPDATE, and END evidence");
  assert.deepEqual(writes.map((record) => record.phase), ["start", "update", "end"], "metadata handoff phases must remain ordered");
  assert.equal(writes.every((record) => record.parent_tool_call_id === FULL_ROOT_CALL), true, "metadata handoff must use the actual Root parent");
  assert.equal(writes.every((record) => record.allocated_id === CANDIDATE_ID), true, "metadata handoff must use the actual allocated ID");
  assert.equal(
    writes.every((record) => record.paths?.some((value) => path.resolve(root, value) === handoff.absolutePath)),
    true,
    "metadata handoff must stay within the exact controlled private artifact path",
  );
  assert.equal(writes.every((record) => record.guard?.reason_code === null), true, "valid metadata handoff frames must pass the existing write guard");
  assert.equal(writes[2].correlation?.status, "matched", "metadata handoff END must correlate with its START");
  assert.equal(writes[2].observed?.is_error, false, "metadata handoff END must retain the non-error observation");

  const rootCall = session.evidence.task_calls.find((call) => call.tool_call_id === FULL_ROOT_CALL);
  assert.ok(Number.isSafeInteger(rootCall?.host_arrival_ordinal), "Root dispatch must retain its arrival ordinal");
  assert.equal(
    writes.every((record) => Number.isSafeInteger(record.host_arrival_ordinal) && record.host_arrival_ordinal < rootCall.host_arrival_ordinal),
    true,
    "deferred metadata handoff evidence must retain its pre-Root arrival ordinals",
  );

  session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, CANDIDATE_ID)));
  assertAcceptedRecord(session, {
    allocated_id: CANDIDATE_ID,
    parent_tool_call_id: FULL_ROOT_CALL,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
}

function fastCompletedLifecycleBeforeRootIsAdoptedOnlyBySameAllocation(apis, root) {
  const item = assignment("FastValidator", "validator", "Fast SDK completion must await authoritative Root allocation.");
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent }), "fast SDK lifecycle START before Root");
  consumePending(
    session,
    lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, status: "completed" }),
    "fast SDK lifecycle COMPLETED before Root",
  );
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "fast completed lifecycle before Root allocation");

  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "fast completed lifecycle after Root START without allocation");
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, CANDIDATE_ID)]));
  session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, CANDIDATE_ID)));
  assertAcceptedRecord(session, {
    allocated_id: CANDIDATE_ID,
    parent_tool_call_id: FULL_ROOT_CALL,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });

  const earlyFrames = session.evidence.subagent_frames.filter(
    (frame) => frame.id === CANDIDATE_ID && (frame.status === "started" || frame.status === "completed"),
  );
  const rootCall = session.evidence.task_calls.find((call) => call.tool_call_id === FULL_ROOT_CALL);
  assert.equal(earlyFrames.length, 2, "fast SDK START and COMPLETED frames must both be retained");
  assert.ok(Number.isSafeInteger(rootCall?.host_arrival_ordinal), "Root dispatch must retain its arrival ordinal");
  assert.equal(
    earlyFrames.every((frame) => Number.isSafeInteger(frame.host_arrival_ordinal) && frame.host_arrival_ordinal < rootCall.host_arrival_ordinal),
    true,
    "fast SDK completion evidence must retain its pre-Root arrival ordinals",
  );
}
function unapprovedRootAssignmentCannotBind(apis, root) {
  const allowed = assignment("AllowedReader", "requirements-reader", "Constructor-authorized reader.");
  const unapproved = assignment("Native10Validator", "validator", "Root-requested but constructor-unapproved validator.");
  const session = createSession(apis.NativeRpcSession, root, [allowed]);

  assertBlocked(
    () => session.recordTool(rootStart(FULL_ROOT_CALL, [unapproved])),
    "constructor-unapproved Root assignment dispatch",
  );
  assertBlocked(
    () => session.consumeLogical(lifecycleFrame({ id: CANDIDATE_ID, agent: unapproved.agent })),
    "validator lifecycle for a Root assignment absent from constructor authorization",
  );
  assertBlocked(
    () => session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(unapproved, CANDIDATE_ID)])),
    "constructor-unapproved Root assignment END",
  );
  assertBlocked(
    () => session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, CANDIDATE_ID))),
    "constructor-unapproved child terminal",
  );
  assert.equal(session.rootTaskCalls.size, 0, "constructor-unapproved Root dispatch must not enter Root authority");
  assert.equal(session.evidence.task_calls.length, 0, "constructor-unapproved Root dispatch must not be retained as a task call");
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "constructor-unapproved Root assignment");
  assert.equal(session.evidence.command_results.length, 0, "constructor-unapproved validator must not gain command permission");
  assert.equal(session.evidence.subagent_writes.length, 0, "constructor-unapproved validator must not gain write permission");
  assert.equal(session.evidence.subagent_reads.length, 0, "constructor-unapproved validator must not gain read permission");
}

function earlyConstructorAbsentRoleCannotBufferDomainPermissions(apis, root) {
  const allowed = assignment("AllowedReader", "requirements-reader", "Constructor-authorized reader.");
  const session = createSession(apis.NativeRpcSession, root, [allowed]);
  const absentRole = "validator";

  assertBlocked(
    () => session.consumeLogical(lifecycleFrame({ id: CANDIDATE_ID, agent: absentRole })),
    "early lifecycle role absent from constructor authorization",
  );
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "early constructor-absent role");

  for (const [name, frame] of [
    ["early read", nestedReadFrames()[0]],
    ["early write", nestedWriteStart()],
    ["early Bash", nestedBashStart()],
  ]) {
    assertBlocked(
      () => session.consumeLogical(subagentEvent(CANDIDATE_ID, absentRole, frame)),
      `${name} for a constructor-absent role`,
    );
  }
  assert.equal(session.evidence.subagent_frames.length, 0, "constructor-absent role must not buffer nested frames");
  assert.equal(session.evidence.subagent_reads.length, 0, "constructor-absent role must not buffer read permission");
  assert.equal(session.evidence.subagent_writes.length, 0, "constructor-absent role must not buffer write permission");
  assert.equal(session.evidence.command_results.length, 0, "constructor-absent role must not buffer Bash permission");
}

function permittedReaderCannotAdoptUnconfiguredAssignmentName(apis, root) {
  const allowed = assignment("AllowedReader", "requirements-reader", "Constructor-authorized reader.");
  const unconfigured = assignment("UnconfiguredReader", "requirements-reader", "Same role, absent constructor assignment name.");
  const session = createSession(apis.NativeRpcSession, root, [allowed]);

  consumePending(
    session,
    lifecycleFrame({ id: CANDIDATE_ID, agent: allowed.agent }),
    "constructor-authorized reader candidate before Root allocation",
  );
  assertBlocked(
    () => session.recordTool(rootStart(FULL_ROOT_CALL, [unconfigured])),
    "Root START with an unconfigured assignment name",
  );
  assertBlocked(
    () => session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(unconfigured, CANDIDATE_ID)])),
    "Root END after an unconfigured assignment START",
  );
  assertBlocked(
    () => session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, CANDIDATE_ID))),
    "async child result after an unconfigured assignment START",
  );
  assert.equal(session.rootTaskCalls.size, 0, "unconfigured assignment START must not enter Root authority");
  assert.equal(session.evidence.task_calls.length, 0, "unconfigured assignment START must not be retained as a task call");
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "unconfigured assignment name");
  assert.equal(session.evidence.command_results.length, 0, "unconfigured assignment name must not gain command permission");
  assert.equal(session.evidence.subagent_writes.length, 0, "unconfigured assignment name must not gain write permission");
  assert.equal(session.evidence.subagent_reads.length, 0, "unconfigured assignment name must not gain read permission");
}



function abortedSpeculativeCandidateIsNeverAdopted(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent }), "aborted speculative candidate START");
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, status: "aborted" }), "aborted speculative candidate terminal");
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "aborted speculative candidate");

  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: item.agent }));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, ACTUAL_ID)]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: item.agent, status: "completed" }));
  session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, ACTUAL_ID)));
  assertAcceptedRecord(session, {
    allocated_id: ACTUAL_ID,
    parent_tool_call_id: FULL_ROOT_CALL,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "aborted candidate must not be replaced by agent-name matching");
}

function completedSpeculativeCandidateIsNotAdoptedByTupleHeuristic(apis, root) {
  const candidate = assignment("CompletedCandidate", EARLY_AGENT, "Completed speculative candidate.");
  const actual = assignment("ActualRootValidator", EARLY_AGENT, "Authoritative Root allocation.");
  const session = createSession(apis.NativeRpcSession, root, [candidate, actual]);
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: candidate.agent }), "completed speculative candidate START");
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: candidate.agent, status: "completed" }), "completed speculative candidate terminal");
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "completed speculative candidate before Root allocation");

  session.recordTool(rootStart(FULL_ROOT_CALL, [actual]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: actual.agent }));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(actual, ACTUAL_ID)]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: actual.agent, status: "completed" }));
  session.consumeLogical(asyncMessage(asyncJob(FULL_ROOT_JOB, ACTUAL_ID)));
  assertAcceptedRecord(session, {
    allocated_id: ACTUAL_ID,
    parent_tool_call_id: FULL_ROOT_CALL,
    index: 0,
    agent: actual.agent,
    agentSource: "project",
    assignment_id: actual.name,
  });
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "completed candidate must not be adopted by matching agent/index");
}

function rejectedLifecycleDiagnosticPreservesBoundedTuple(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  const rejected = lifecycleFrame({
    id: CANDIDATE_ID,
    index: 0,
    agent: item.agent,
    agentSource: "user",
    parentToolCallId: `${WRONG_ROOT_CALL}|rejected-full-parent`,
    status: "started",
  });
  const error = assertBlocked(() => session.consumeLogical(rejected), "lifecycle rejected before observed Root dispatch");
  assert.equal(error?.kind, "BLOCKED", "rejected lifecycle must preserve the Root guard error semantic");

  const diagnostics = session.evidence.subagent_lifecycle_diagnostics;
  assert.ok(Array.isArray(diagnostics), "rejected lifecycle must retain a bounded diagnostic collection");
  assert.equal(diagnostics.length, 1, "one rejected lifecycle must yield one bounded diagnostic");
  const diagnostic = diagnostics[0];
  assert.deepEqual(
    {
      id: diagnostic.id,
      parent_tool_call_id: diagnostic.parent_tool_call_id,
      index: diagnostic.index,
      agent: diagnostic.agent,
      agentSource: diagnostic.agentSource,
      status: diagnostic.status,
    },
    {
      id: CANDIDATE_ID,
      parent_tool_call_id: `${WRONG_ROOT_CALL}|rejected-full-parent`,
      index: 0,
      agent: item.agent,
      agentSource: "user",
      status: "started",
    },
    "rejected diagnostic must preserve the typed lifecycle tuple exactly",
  );
  assert.ok(Number.isSafeInteger(diagnostic.host_arrival_ordinal), "rejected diagnostic must retain its actual host arrival ordinal");
  assert.ok(diagnostic.host_arrival_ordinal > 0, "rejected diagnostic host arrival ordinal must be positive");
  assert.ok(Number.isSafeInteger(diagnostic.host_workflow_ordinal), "rejected diagnostic must retain its host workflow ordinal");
  for (const forbidden of ["payload", "event", "task", "assignment", "prompt", "secret", "raw"]) {
    assert.equal(Object.hasOwn(diagnostic, forbidden), false, `rejected diagnostic must not retain ${forbidden} payload data`);
  }
  assert.equal(session.rootTaskCalls.size, 0, "rejected lifecycle must not fabricate a Root dispatch");
  assert.equal(session.evidence.task_calls.length, 0, "rejected lifecycle must not emit fabricated Root task evidence");
  assert.equal(session.lifecycleByAllocated.size, 0, "rejected lifecycle must remain unaccepted");
  assert.equal(asyncRecords(session).length, 0, "rejected lifecycle must not pass as a task completion");
}

function containsNestedValue(value, expected) {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsNestedValue(item, expected));
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((item) => containsNestedValue(item, expected));
}

function rootResultTupleMismatchCannotOverwrite(apis, root, variant) {
  const item = assignment(variant.assignmentName ?? "TupleMismatchValidator", EARLY_AGENT, "Root result tuple must remain authoritative.");
  const session = createSession(apis.NativeRpcSession, root, [item]);
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL }));
  const beforeRecords = session.evidence.task_records.length;
  assertBlocked(
    () => session.recordTool(rootEndWithResults(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, ACTUAL_ID)], [rootResult(ACTUAL_ID, variant.result)])),
    variant.name,
  );
  assert.equal(session.evidence.task_records.length, beforeRecords, `${variant.name} must block before accepting a terminal task record`);
  const binding = session.lifecycleByAllocated.get(`id:${ACTUAL_ID}`);
  assert.deepEqual(
    {
      parent_tool_call_id: binding?.parent_tool_call_id,
      index: binding?.index,
      agent: binding?.agent,
      agentSource: binding?.agentSource,
    },
    {
      parent_tool_call_id: FULL_ROOT_CALL,
      index: 0,
      agent: item.agent,
      agentSource: "project",
    },
    `${variant.name} must leave the authoritative binding unchanged`,
  );
}

function abortedLifecycleSameIdIsRejectedAfterRootProgress(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent }), "aborted SAME-ID lifecycle START");
  consumePending(
    session,
    lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, status: "aborted" }),
    "aborted SAME-ID lifecycle terminal",
  );
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, CANDIDATE_ID)]));
  assert.equal(
    session.pendingLifecycleByAllocated.has(`id:${CANDIDATE_ID}`),
    false,
    "aborted allocation must be removed from pending ownership before any later Root adoption",
  );
  assertBlocked(
    () => session.consumeLogical(lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL })),
    "aborted lifecycle reused with the same allocated ID",
  );
  assertNoAcceptedAssignment(session, CANDIDATE_ID, "aborted SAME-ID lifecycle");
}

function failedLifecycleSameIdIsRejectedAfterRootProgress(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(session, lifecycleFrame({ id: FAILED_ID, agent: item.agent }), "failed SAME-ID lifecycle START");
  consumePending(
    session,
    lifecycleFrame({ id: FAILED_ID, agent: item.agent, status: "failed" }),
    "failed SAME-ID lifecycle terminal",
  );
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, FAILED_ID)]));
  assert.equal(
    session.pendingLifecycleByAllocated.has(`id:${FAILED_ID}`),
    false,
    "failed allocation must be removed from pending ownership before any later Root adoption",
  );
  assertBlocked(
    () => session.consumeLogical(lifecycleFrame({ id: FAILED_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL })),
    "failed lifecycle reused with the same allocated ID",
  );
  assertNoAcceptedAssignment(session, FAILED_ID, "failed SAME-ID lifecycle");
}
function acceptedFailureBinding(apis, root, lifecycleStatus) {
  const item = assignment(
    lifecycleStatus === "aborted" ? "AcceptedAbortedValidator" : "AcceptedFailedValidator",
    EARLY_AGENT,
    `Root-owned lifecycle ${lifecycleStatus} must not commit an inline completed result.`,
  );
  const session = createSession(apis.NativeRpcSession, root, [item]);
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  assert.equal(session.rootTaskCalls.size, 1, "a valid Root START must create one observed dispatch");

  session.consumeLogical(lifecycleFrame({
    id: CANDIDATE_ID,
    agent: item.agent,
    parentToolCallId: FULL_ROOT_CALL,
    status: "started",
  }));
  const binding = session.lifecycleByAllocated.get(`id:${CANDIDATE_ID}`);
  assert.equal(binding?.accepted, true, "the SDK lifecycle START must be accepted by the valid Root dispatch");
  assert.equal(session.pendingLifecycleByAllocated.has(`id:${CANDIDATE_ID}`), false, "an accepted SDK lifecycle START must not remain pending");

  session.consumeLogical(lifecycleFrame({
    id: CANDIDATE_ID,
    agent: item.agent,
    parentToolCallId: FULL_ROOT_CALL,
    status: lifecycleStatus,
  }));
  assert.equal(binding?.lifecycle_status, lifecycleStatus, `the accepted lifecycle must retain its ${lifecycleStatus} terminal status`);
  assert.equal(session.evidence.task_records.length, 0, "an accepted lifecycle failure must not create a task record before Root terminal evidence");
  return { item, session };
}

function acceptedFailedLifecycleCannotCommitInlineRootSuccess(apis, root) {
  const { item, session } = acceptedFailureBinding(apis, root, "failed");
  assertBlocked(
    () => session.recordTool(rootEndWithResults(
      FULL_ROOT_CALL,
      FULL_ROOT_JOB,
      [progressRow(item, CANDIDATE_ID)],
      [rootResult(CANDIDATE_ID)],
    )),
    "Root END progress plus inline completed result after accepted failed lifecycle",
  );
  assert.equal(session.evidence.task_records.length, 0, "Root progress or terminal guard must block before committing task_records success");
  assert.equal(
    session.evidence.task_records.some((record) => record?.allocated_id === CANDIDATE_ID && record?.status === "completed"),
    false,
    "an accepted failed lifecycle must never be committed as inline completed success",
  );
}

function acceptedAbortedLifecycleCannotCommitInlineRootSuccess(apis, root) {
  const { item, session } = acceptedFailureBinding(apis, root, "aborted");
  const rootEndFrame = rootEndWithResults(
    FULL_ROOT_CALL,
    FULL_ROOT_JOB,
    [],
    [rootResult(CANDIDATE_ID)],
  );
  delete rootEndFrame.result.details.progress;
  delete rootEndFrame.result.details.async;
  assertBlocked(
    () => session.recordTool(rootEndFrame),
    "Root END inline completed result after accepted aborted lifecycle",
  );
  assert.equal(session.evidence.task_records.length, 0, "the terminal guard must block before committing task_records success without Root progress");
  assert.equal(
    session.evidence.task_records.some((record) => record?.allocated_id === CANDIDATE_ID && record?.status === "completed"),
    false,
    "an accepted aborted lifecycle must never be committed as inline completed success",
  );
}


function rootResultWrongParentTupleIsBlocked(apis, root) {
  rootResultTupleMismatchCannotOverwrite(apis, root, {
    name: "Root result with a wrong parent tuple",
    result: { parentToolCallId: WRONG_ROOT_CALL },
  });
}

function rootResultWrongIndexTupleIsBlocked(apis, root) {
  rootResultTupleMismatchCannotOverwrite(apis, root, {
    name: "Root result with a wrong index tuple",
    result: { index: 1 },
  });
}

function rootResultWrongAgentTupleIsBlocked(apis, root) {
  rootResultTupleMismatchCannotOverwrite(apis, root, {
    name: "Root result with a wrong agent tuple",
    result: { agent: "architect" },
  });
}

function rootResultWrongAgentSourceTupleIsBlocked(apis, root) {
  rootResultTupleMismatchCannotOverwrite(apis, root, {
    name: "Root result with a wrong agentSource tuple",
    result: { agentSource: "user" },
  });
}

function rootResultOwnedByDifferentCurrentRootIsBlocked(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL }));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, ACTUAL_ID)]));
  session.recordTool(rootStart(SECOND_ROOT_CALL, [item]));
  const beforeRecords = session.evidence.task_records.length;
  assertBlocked(
    () => session.recordTool(rootEndWithResults(SECOND_ROOT_CALL, SECOND_ROOT_JOB, [progressRow(item, ACTUAL_ID)], [rootResult(ACTUAL_ID, { parentToolCallId: SECOND_ROOT_CALL })])),
    "Root result whose allocation binding belongs to a different current Root",
  );
  assert.equal(
    session.evidence.task_records.length,
    beforeRecords,
    "a result from a different current Root must block before terminal acceptance",
  );
}

function rootResultAbsentOptionalMetadataPreservesLegitimateBlockingResult(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL }));
  const error = captureError(() => session.recordTool(rootEndWithResults(
    FULL_ROOT_CALL,
    FULL_ROOT_JOB,
    [progressRow(item, ACTUAL_ID)],
    [rootResult(ACTUAL_ID)],
  )));
  assert.equal(error, null, "an SDK Root result may omit optional tuple metadata without becoming contradictory");
  const records = session.evidence.task_records.filter((record) => record.source_kind === "task_tool_details");
  assert.equal(records.length, 1, "the legitimate blocking Root result must remain recorded");
  assert.deepEqual(
    {
      allocated_id: records[0].allocated_id,
      parent_tool_call_id: records[0].parent_tool_call_id,
      index: records[0].index,
      agent: records[0].agent,
      agentSource: records[0].agentSource,
      exitCode: records[0].exitCode,
      isError: records[0].isError,
    },
    {
      allocated_id: ACTUAL_ID,
      parent_tool_call_id: FULL_ROOT_CALL,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      exitCode: 0,
      isError: false,
    },
    "missing optional Root result metadata must be filled only from the authoritative current binding",
  );
}

function orphanEarlyReadRetainsDiagnosticArrivalAndHash(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  const readable = path.join(root, READABLE_RELATIVE);
  const readText = "bounded early read\n";
  fs.writeFileSync(readable, readText, "utf8");
  consumePending(session, lifecycleFrame({ id: ORPHAN_ID, agent: item.agent }), "orphan lifecycle START");
  const orphanLifecycleArrival = session.hostArrivalSequence;
  const [readStart, readEnd] = nestedReadFrames();
  consumePending(session, subagentEvent(ORPHAN_ID, item.agent, readStart), "orphan early read START");
  consumePending(session, subagentEvent(ORPHAN_ID, item.agent, readEnd), "orphan early read END");
  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.consumeLogical(lifecycleFrame({ id: ACTUAL_ID, agent: item.agent, parentToolCallId: FULL_ROOT_CALL }));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, ACTUAL_ID)]));

  const readHash = createHash("sha256").update(readText, "utf8").digest("hex");
  const diagnostic = session.evidence.subagent_lifecycle_diagnostics.find((itemValue) => itemValue?.id === ORPHAN_ID);
  assert.ok(diagnostic, "discarded orphan ownership must retain one bounded diagnostic");
  assert.equal(diagnostic.host_arrival_ordinal, orphanLifecycleArrival, "orphan diagnostic must retain the original lifecycle arrival ordinal");
  assert.equal(diagnostic.agentSource, "project", "orphan diagnostic must retain source provenance");
  assert.ok(containsNestedValue(diagnostic, readHash), "orphan diagnostic must retain the early read's observed source hash");
  assert.equal(JSON.stringify(diagnostic).includes(readText), false, "orphan diagnostic must redact the early read body");
  assert.equal(
    session.evidence.subagent_reads.some((record) => record.allocated_id === ORPHAN_ID),
    false,
    "an orphan read must not become accepted read permission",
  );
  assert.equal(
    session.evidence.task_records.some((record) => record.allocated_id === ORPHAN_ID),
    false,
    "an orphan observation must not become a task terminal record",
  );
  assert.equal(session.lifecycleByAllocated.has(`id:${ORPHAN_ID}`), false, "an orphan observation must not become ownership");
}

function lifecycleDiagnosticsRemainBounded(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  const total = PENDING_OBSERVATION_LIMIT + 64;
  for (let index = 0; index < total; index += 1) {
    assertBlocked(
      () => session.consumeLogical(lifecycleFrame({
        id: `${CANDIDATE_ID}|diagnostic-${index}`,
        agent: item.agent,
        agentSource: "user",
        parentToolCallId: `${WRONG_ROOT_CALL}|diagnostic-${index}`,
      })),
      `bounded rejected lifecycle diagnostic ${index}`,
    );
  }
  const diagnostics = session.evidence.subagent_lifecycle_diagnostics;
  assert.ok(diagnostics.length > 0, "rejected lifecycle diagnostics must remain observable");
  assert.ok(diagnostics.length <= PENDING_OBSERVATION_LIMIT, "rejected lifecycle diagnostics must have a bounded count");
  assert.ok(
    Buffer.byteLength(JSON.stringify(diagnostics), "utf8") <= MAX_CAPTURE_BYTES,
    "rejected lifecycle diagnostics must have a bounded byte size",
  );
  assert.equal(session.pendingLifecycleByAllocated.size, 0, "rejected lifecycle diagnostics must not create pending ownership");
  assert.equal(session.lifecycleByAllocated.size, 0, "rejected lifecycle diagnostics must not create accepted ownership");
}

function pendingObservationCapacityRollsBackPartialAllocation(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent }), "capacity fixture lifecycle");
  let capacityError = null;
  for (let index = 0; index < PENDING_OBSERVATION_LIMIT + 64 && !capacityError; index += 1) {
    const error = captureError(() => session.consumeLogical(subagentEvent(
      CANDIDATE_ID,
      item.agent,
      nestedReadStartFrame(READABLE_RELATIVE, `capacity-read|${index}`),
    )));
    if (error) {
      assert.equal(error.kind, "BLOCKED", "pending observation overflow must fail closed with a BLOCKED guard");
      capacityError = error;
    }
  }
  assert.ok(capacityError, "the bounded pending observation queue must reject an overflow");
  const retainedCount = session.pendingObservationCount;
  assert.ok(retainedCount <= PENDING_OBSERVATION_LIMIT, "pending observations must remain count-bounded after overflow");
  assert.ok(session.pendingObservationBytes <= MAX_CAPTURE_BYTES, "pending observations must remain byte-bounded after overflow");

  const overflowError = captureError(() => session.consumeLogical(lifecycleFrame({ id: CAPACITY_ID, agent: item.agent })));
  assert.ok(overflowError, "pending observation overflow for a newly inserted candidate must reject the observation");
  assert.equal(overflowError?.kind, "BLOCKED", "new-candidate observation overflow must fail closed with a BLOCKED guard");
  assert.equal(
    session.pendingLifecycleByAllocated.has(`id:${CAPACITY_ID}`),
    false,
    "capacity rejection must roll back the newly inserted pending allocation",
  );
  const indexCandidates = session.pendingLifecycleByIndex.get(`${FULL_ROOT_CALL}\u001f0`);
  assert.equal(indexCandidates?.has(CAPACITY_ID) ?? false, false, "capacity rejection must roll back the pending index candidate");
  assert.equal(session.pendingObservationCount, retainedCount, "capacity rejection must not partially increment the retained observation count");
  assert.ok(session.pendingLifecycleByAllocated.size <= 1, "bounded pending ownership must not grow after capacity rejection");
}

function pendingIrreducibleOverflowRetainsBoundedDiagnostic(apis, root) {
  const item = assignment("PendingProgressOverflow", EARLY_AGENT, "Irreducible pending progress must fail closed with bounded diagnostics.");
  const allocatedId = "speculative-candidate|progress-overflow";
  const rootToolCallId = "root-dispatch|progress-overflow";
  const session = createSession(apis.NativeRpcSession, root, [item], "native-early-progress-overflow");
  consumePending(
    session,
    lifecycleFrame({ id: allocatedId, parentToolCallId: rootToolCallId, agent: item.agent }),
    "irreducible pending progress lifecycle START",
  );
  let capacityError = null;
  for (let index = 0; index < PENDING_OBSERVATION_LIMIT + 64 && !capacityError; index += 1) {
    const error = captureError(() => session.consumeLogical(subagentProgressFrame({
      id: allocatedId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "running",
      assignmentText: item.task,
      toolCallId: `irreducible-progress|${index}`,
    })));
    if (error) {
      assert.equal(error.kind, "BLOCKED", "irreducible pending observation overflow must fail closed with a BLOCKED guard");
      capacityError = error;
    }
  }
  assert.ok(capacityError, "irreducible pending observations must still reject an overflow at the fixed count bound");
  assert.ok(session.pendingObservationCount <= PENDING_OBSERVATION_LIMIT, "irreducible pending observations must remain count-bounded after overflow");
  assert.ok(session.pendingObservationBytes <= MAX_CAPTURE_BYTES, "irreducible pending observations must remain byte-bounded after overflow");

  const retention = session.evidence.lifecycle_diagnostic_budget?.pending_retention;
  assert.ok(retention, "pending retention overflow must retain a bounded diagnostic budget entry");
  assert.ok(Number.isSafeInteger(retention.count) && retention.count <= PENDING_OBSERVATION_LIMIT, "pending retention diagnostics must retain a bounded count");
  assert.ok(Number.isSafeInteger(retention.bytes) && retention.bytes <= MAX_CAPTURE_BYTES, "pending retention diagnostics must retain a bounded byte size");
  assert.equal(retention.max_count, PENDING_OBSERVATION_LIMIT, "pending retention diagnostics must expose the unchanged count bound");
  assert.equal(retention.max_bytes, MAX_CAPTURE_BYTES, "pending retention diagnostics must expose the unchanged byte bound");
  assert.equal(retention.collection, "subagent_frames", "pending retention diagnostics must identify the irreducible collection");
  assert.ok(Number.isSafeInteger(retention.attempted_bytes) && retention.attempted_bytes >= retention.bytes, "pending retention diagnostics must retain attempted byte accounting");
  assert.ok(retention.coalescing, "pending retention diagnostics must retain the coalescing decision");
  assert.equal(retention.trigger?.status, "running", "pending retention diagnostics must retain the triggering progress status");
  assert.equal(retention.trigger?.frame_type, "subagent_progress", "pending retention diagnostics must retain the triggering frame type");
  assert.equal(retention.trigger?.type, "subagent_progress", "pending retention diagnostics must retain the triggering record type");
  assert.equal(Object.hasOwn(retention.trigger ?? {}, "payload"), false, "pending retention trigger must not retain raw payload");
  assert.ok(Array.isArray(retention.bindings) && retention.bindings.length <= PENDING_OBSERVATION_LIMIT, "pending retention diagnostics must retain only bounded binding summaries");
  const binding = retention.bindings.find((candidate) =>
    candidate?.allocated_id === allocatedId
      && candidate?.parent_tool_call_id === rootToolCallId
      && candidate?.index === 0
      && candidate?.agent === item.agent
      && candidate?.agentSource === "project",
  );
  assert.ok(binding, "pending retention diagnostics must preserve the complete bounded child tuple");
  assert.ok(binding.collection_counts && typeof binding.collection_counts === "object", "pending retention diagnostics must retain per-collection counts");
  assert.ok(Number.isSafeInteger(binding.first_host_arrival_ordinal), "pending retention diagnostics must retain first arrival provenance");
  assert.ok(Number.isSafeInteger(binding.last_host_arrival_ordinal), "pending retention diagnostics must retain latest arrival provenance");
  assert.ok(
    Buffer.byteLength(JSON.stringify(retention), "utf8") <= MAX_CAPTURE_BYTES,
    "pending retention diagnostics must remain byte-bounded",
  );
}

function earlyLifecycleHostTimestampSurvivesAdoption(apis, root) {
  const item = assignment();
  const session = createSession(apis.NativeRpcSession, root, [item]);
  const before = Date.now();
  consumePending(session, lifecycleFrame({ id: CANDIDATE_ID, agent: item.agent }), "timestamped early lifecycle");
  const after = Date.now();
  const pending = session.pendingLifecycleByAllocated.get(`id:${CANDIDATE_ID}`);
  const hostTimestamp = pending?.host_arrival_timestamp;
  const timestampMs = typeof hostTimestamp === "number" ? hostTimestamp : Date.parse(hostTimestamp);
  assert.ok(Number.isFinite(timestampMs), "early lifecycle must retain a real host arrival timestamp");
  assert.ok(timestampMs >= before - 1000 && timestampMs <= after + 1000, "host arrival timestamp must reflect observation time");
  assert.equal(Object.hasOwn(pending, "sdk_timestamp"), false, "missing SDK timestamp must remain explicitly absent");
  assert.equal(Object.hasOwn(pending, "timestamp"), false, "host timestamp must not be mislabeled as an SDK timestamp");

  session.recordTool(rootStart(FULL_ROOT_CALL, [item]));
  session.recordTool(rootEnd(FULL_ROOT_CALL, FULL_ROOT_JOB, [progressRow(item, CANDIDATE_ID)]));
  const earlyFrame = session.evidence.subagent_frames.find((frame) => frame.id === CANDIDATE_ID && frame.status === "started");
  assert.equal(earlyFrame?.host_arrival_timestamp, hostTimestamp, "adoption flush must preserve the original host arrival timestamp");
  assert.equal(Object.hasOwn(earlyFrame ?? {}, "sdk_timestamp"), false, "adoption must not synthesize an SDK timestamp");
  assert.equal(Object.hasOwn(earlyFrame ?? {}, "timestamp"), false, "adoption must not relabel the host timestamp as an SDK timestamp");
}


function pendingSdkMessageDeltaRetentionAdoptsOnlyAfterRootConfirmation(apis, root) {
  const item = assignment(
    "PendingAssistantDeltaValidator",
    EARLY_AGENT,
    "Retain SDK assistant message deltas until the authoritative Root allocation is observed.",
  );
  const allocatedId = "speculative-candidate|assistant-delta-pending";
  const rootToolCallId = "root-dispatch|assistant-delta-pending";
  const rootJobId = "sdk-root-job|assistant-delta-pending";
  const session = createSession(apis.NativeRpcSession, root, [item], "native-early-assistant-delta-pending");
  consumePending(
    session,
    lifecycleFrame({ id: allocatedId, parentToolCallId: rootToolCallId, agent: item.agent }),
    "pending assistant message lifecycle START",
  );
  consumePending(
    session,
    subagentAssistantMessageFrame({
      allocatedId,
      agent: item.agent,
      messageId: "assistant-message|pending-delta",
      eventType: "message_start",
    }),
    "pending assistant message START",
  );

  const totalTextDeltas = PENDING_OBSERVATION_LIMIT + 16;
  let deltaError = null;
  for (let index = 0; index < totalTextDeltas; index += 1) {
    const error = captureError(() => session.consumeLogical(subagentAssistantMessageFrame({
      allocatedId,
      agent: item.agent,
      messageId: "assistant-message|pending-delta",
      assistantType: "text_delta",
      delta: `pending-token-${index}`,
    })));
    if (error) {
      deltaError = error;
      break;
    }
  }
  assert.equal(
    deltaError,
    null,
    "consecutive SDK text_delta frames must coalesce while the child remains pending, without changing the 256-count bound",
  );
  assert.doesNotThrow(
    () => session.consumeLogical(subagentAssistantMessageFrame({
      allocatedId,
      agent: item.agent,
      messageId: "assistant-message|pending-delta",
      eventType: "message_end",
    })),
    "SDK assistant message END must remain a retained non-coalesced boundary",
  );
  assert.equal(
    session.pendingLifecycleByAllocated.get(`id:${allocatedId}`)?.accepted,
    false,
    "coalesced assistant deltas must remain non-authoritative before Root confirmation",
  );
  assert.ok(
    session.pendingObservationCount <= 4,
    "coalesced pending assistant deltas must leave the fixed count budget for lifecycle boundaries",
  );
  assert.ok(
    session.pendingObservationBytes < MAX_CAPTURE_BYTES,
    "coalesced pending assistant deltas must leave the unchanged byte budget",
  );

  session.recordTool(rootStart(rootToolCallId, [item]));
  session.recordTool(rootProgressUpdate(rootToolCallId, [progressRow(item, allocatedId)]));
  const binding = session.lifecycleByAllocated.get(`id:${allocatedId}`);
  assert.ok(binding?.accepted, "Root progress must adopt the pending assistant-delta binding");
  assert.equal(session.pendingLifecycleByAllocated.has(`id:${allocatedId}`), false, "Root adoption must remove the pending assistant-delta binding");

  const frames = session.evidence.subagent_frames.filter((frame) => frame.allocated_id === allocatedId);
  const deltaFrames = frames.filter((frame) => frame.nonterminal_delta_kind === "text_delta");
  assert.equal(deltaFrames.length, 1, "pending assistant text deltas must flush as one coalesced record");
  const [deltaFrame] = deltaFrames;
  const aggregate = deltaFrame.coalesced_nonterminal_progress;
  assert.equal(aggregate?.count, totalTextDeltas, "pending assistant delta coalescing must preserve the complete count");
  assert.equal(aggregate?.first_status, deltaFrame.status, "pending assistant delta coalescing must preserve the first status");
  assert.ok(
    Number.isSafeInteger(aggregate?.first_host_arrival_ordinal)
      && Number.isSafeInteger(deltaFrame.host_arrival_ordinal)
      && aggregate.first_host_arrival_ordinal < deltaFrame.host_arrival_ordinal,
    "pending assistant delta coalescing must preserve first and latest arrival ordinals",
  );
  assert.ok(
    Number.isSafeInteger(aggregate?.first_host_workflow_ordinal)
      && Number.isSafeInteger(deltaFrame.host_workflow_ordinal)
      && aggregate.first_host_workflow_ordinal < deltaFrame.host_workflow_ordinal,
    "pending assistant delta coalescing must preserve first and latest workflow ordinals",
  );
  const firstTimestamp = typeof aggregate?.first_host_arrival_timestamp === "number"
    ? aggregate.first_host_arrival_timestamp
    : Date.parse(aggregate?.first_host_arrival_timestamp);
  const latestTimestamp = typeof deltaFrame.host_arrival_timestamp === "number"
    ? deltaFrame.host_arrival_timestamp
    : Date.parse(deltaFrame.host_arrival_timestamp);
  assert.ok(Number.isFinite(firstTimestamp) && Number.isFinite(latestTimestamp) && firstTimestamp <= latestTimestamp, "pending assistant delta coalescing must retain first/latest host timestamps");
  assert.deepEqual(
    {
      allocated_id: deltaFrame.allocated_id,
      parent_tool_call_id: deltaFrame.parent_tool_call_id,
      index: deltaFrame.index,
      agent: deltaFrame.agent,
      agentSource: deltaFrame.agentSource,
      job_id: deltaFrame.job_id,
      instance_id: deltaFrame.instance_id,
    },
    {
      allocated_id: binding.allocated_id,
      parent_tool_call_id: binding.parent_tool_call_id,
      index: binding.index,
      agent: binding.agent,
      agentSource: binding.agentSource,
      job_id: binding.job_id,
      instance_id: binding.instance_id,
    },
    "adopted assistant delta must preserve the complete Root-derived child tuple",
  );
  assert.equal(frames.filter((frame) => frame.type === "message_start").length, 1, "assistant message START must remain present");
  assert.equal(frames.filter((frame) => frame.type === "message_end").length, 1, "assistant message END must remain present");

  session.recordTool(rootEnd(rootToolCallId, rootJobId, [progressRow(item, allocatedId)]));
  session.consumeLogical(lifecycleFrame({
    id: allocatedId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    parentToolCallId: rootToolCallId,
    status: "completed",
  }));
  session.consumeLogical(asyncMessage(asyncJob(rootJobId, allocatedId)));
  assertAcceptedRecord(session, {
    allocated_id: allocatedId,
    parent_tool_call_id: rootToolCallId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
}


async function acceptedSdkMessageDeltasStayWithinWriterBudget(apis, root) {
  const item = assignment(
    "AcceptedAssistantDeltaValidator",
    EARLY_AGENT,
    "Retain accepted SDK assistant text and thinking deltas without exceeding the physical evidence bound.",
  );
  const allocatedId = "actual-child|assistant-delta-budget";
  const rootToolCallId = "root-dispatch|assistant-delta-budget";
  const rootJobId = "sdk-root-job|assistant-delta-budget";
  const totalTextDeltas = 36_000;
  const totalThinkingDeltas = 3;
  const capture = await apis.executeNativeCapture(
    {
      native: false,
      captureProvider: async ({ fixture }) => {
        const session = createSession(
          apis.NativeRpcSession,
          fixture.project,
          [item],
          "native-accepted-assistant-delta-budget",
        );
        const blockedCapture = (error) => ({
          status: "BLOCKED",
          failure: safeError(error),
          observed_capture: {
            bytes: session.evidence.capture.bytes,
            max_bytes: MAX_CAPTURE_BYTES,
            retained_subagent_frames: session.evidence.subagent_frames.length,
          },
        });
        try {
          session.recordTool(rootStart(rootToolCallId, [item]));
          session.consumeLogical(lifecycleFrame({
            id: allocatedId,
            index: 0,
            agent: item.agent,
            agentSource: "project",
            parentToolCallId: rootToolCallId,
            status: "started",
          }));
          session.consumeLogical(subagentAssistantMessageFrame({
            allocatedId,
            agent: item.agent,
            messageId: "assistant-message|accepted-delta-budget",
            eventType: "message_start",
          }));
          for (let index = 0; index < totalTextDeltas; index += 1) {
            session.consumeLogical(subagentAssistantMessageFrame({
              allocatedId,
              agent: item.agent,
              messageId: "assistant-message|accepted-delta-budget",
              assistantType: "text_delta",
              delta: "t",
            }));
          }
          for (let index = 0; index < totalThinkingDeltas; index += 1) {
            session.consumeLogical(subagentAssistantMessageFrame({
              allocatedId,
              agent: item.agent,
              messageId: "assistant-message|accepted-delta-budget",
              assistantType: "thinking_delta",
              delta: "h",
            }));
          }
          session.consumeLogical(subagentAssistantMessageFrame({
            allocatedId,
            agent: item.agent,
            messageId: "assistant-message|accepted-delta-budget",
            eventType: "message_end",
          }));
          session.recordTool(rootEnd(rootToolCallId, rootJobId, [progressRow(item, allocatedId)]));
          session.consumeLogical(lifecycleFrame({
            id: allocatedId,
            index: 0,
            agent: item.agent,
            agentSource: "project",
            parentToolCallId: rootToolCallId,
            status: "completed",
          }));
          session.consumeLogical(asyncMessage(asyncJob(rootJobId, allocatedId)));
        } catch (error) {
          return blockedCapture(error);
        }
        return { ...session.evidence, status: "PASS" };
      },
    },
    { project: root, logicalRunId: RUN_ID },
    [item],
    "accepted-assistant-delta-budget",
    "controlled accepted SDK assistant delta retention fixture",
  );

  assert.equal(capture.status, "PASS", "accepted SDK message deltas must produce a successful bounded consumer capture");
  const receipt = capture.capture_receipt;
  assert.ok(receipt?.path && Number.isSafeInteger(receipt.bytes) && typeof receipt.sha256 === "string", "accepted SDK delta capture must expose a writer receipt");
  assert.ok(receipt.bytes <= MAX_CAPTURE_BYTES, "coalesced SDK delta capture must remain below the unchanged physical 16 MiB bound");
  const receiptBytes = fs.readFileSync(path.resolve(root, receipt.path));
  assert.equal(receiptBytes.byteLength, receipt.bytes, "SDK delta writer receipt bytes must match the persisted aggregate");
  assert.ok(receiptBytes.byteLength <= MAX_CAPTURE_BYTES, "persisted SDK delta aggregate must remain below the unchanged physical 16 MiB bound");
  const persisted = JSON.parse(receiptBytes.toString("utf8"));
  assert.equal(persisted.status, "PASS", "persisted SDK delta aggregate must retain the successful capture status");

  const frames = persisted.subagent_frames.filter((frame) => frame.allocated_id === allocatedId);
  const textFrames = frames.filter((frame) => frame.nonterminal_delta_kind === "text_delta");
  const thinkingFrames = frames.filter((frame) => frame.nonterminal_delta_kind === "thinking_delta");
  assert.equal(textFrames.length, 1, "all accepted text_delta records must coalesce by full child tuple and kind");
  assert.equal(thinkingFrames.length, 1, "all accepted thinking_delta records must coalesce by full child tuple and kind");
  const timestampValue = (value) => typeof value === "number" ? value : Date.parse(value);
  for (const [row, expectedCount, expectedKind] of [
    [textFrames[0], totalTextDeltas, "text_delta"],
    [thinkingFrames[0], totalThinkingDeltas, "thinking_delta"],
  ]) {
    const aggregate = row.coalesced_nonterminal_progress;
    assert.equal(aggregate?.count, expectedCount, `${expectedKind} coalescing must preserve its exact count`);
    assert.equal(aggregate?.first_status, row.status, `${expectedKind} coalescing must preserve its first/latest status`);
    assert.equal(
      row.host_arrival_ordinal - aggregate.first_host_arrival_ordinal + 1,
      expectedCount,
      `${expectedKind} coalescing must retain the latest original arrival ordinal`,
    );
    assert.equal(
      row.host_workflow_ordinal - aggregate.first_host_workflow_ordinal + 1,
      expectedCount,
      `${expectedKind} coalescing must retain the latest original workflow ordinal`,
    );
    assert.ok(
      timestampValue(aggregate.first_host_arrival_timestamp) <= timestampValue(row.host_arrival_timestamp),
      `${expectedKind} coalescing must retain first and latest original timestamps`,
    );
    assert.equal(Object.hasOwn(row, "assistantMessageEvent"), false, `${expectedKind} retention must not spread raw SDK message payload`);
    assert.equal(Object.hasOwn(row, "delta"), false, `${expectedKind} retention must retain only the trusted computed marker`);
  }
  assert.ok(textFrames[0].sequence < thinkingFrames[0].sequence, "global subagentSequence order must remain monotonic across coalesced kinds");
  assert.equal(frames.filter((frame) => frame.type === "message_start").length, 1, "late SDK message START must remain present");
  assert.equal(frames.filter((frame) => frame.type === "message_end").length, 1, "late SDK message END must remain present");
  assert.deepEqual(
    frames.filter((frame) => frame.frame_type === "subagent_lifecycle").map((frame) => frame.status),
    ["started", "completed"],
    "late lifecycle START and END must remain present around the retained delta summaries",
  );
  assert.equal(persisted.root_task_ends.length, 1, "Root END must remain present after delta retention");
  assert.equal(
    persisted.task_records.filter((record) => record.source_kind === "task_async_result").length,
    1,
    "the authoritative terminal async result must remain present after delta retention",
  );
}


function interleavedSdkDeltaTuplesAndGuardsRemainObservable(apis, root) {
  const first = assignment(
    "InterleavedAssistantDeltaValidator",
    EARLY_AGENT,
    "Reject forged assistant delta rebinding while retaining non-delta tool and message boundaries.",
  );
  const second = assignment(
    "InterleavedAssistantDeltaBackend",
    "backend-developer",
    "Independent assistant delta tuple used to prevent cross-child coalescing.",
  );
  const rootToolCallId = "root-dispatch|assistant-delta-interleaved";
  const firstId = "actual-child|assistant-delta-interleaved-a";
  const secondId = "actual-child|assistant-delta-interleaved-b";
  const session = createSession(
    apis.NativeRpcSession,
    root,
    [first, second],
    "native-accepted-assistant-delta-interleaved",
  );
  session.recordTool(rootStart(rootToolCallId, [first, second]));
  session.consumeLogical(lifecycleFrame({
    id: firstId,
    index: 0,
    agent: first.agent,
    agentSource: "project",
    parentToolCallId: rootToolCallId,
    status: "started",
  }));
  session.consumeLogical(lifecycleFrame({
    id: secondId,
    index: 1,
    agent: second.agent,
    agentSource: "project",
    parentToolCallId: rootToolCallId,
    status: "started",
  }));
  const feed = (frame, name) => {
    const error = captureError(() => session.consumeLogical(frame));
    assert.equal(error, null, `${name} must be retained without changing its non-delta guard semantics`);
  };
  feed(
    subagentAssistantMessageFrame({
      allocatedId: firstId,
      agent: first.agent,
      messageId: "assistant-message|interleaved-a",
      eventType: "message_start",
    }),
    "message_start boundary",
  );
  feed(
    subagentAssistantMessageFrame({
      allocatedId: firstId,
      agent: first.agent,
      messageId: "assistant-message|interleaved-a",
      assistantType: "text_delta",
      delta: "first-a",
    }),
    "first child text_delta",
  );
  feed(
    subagentAssistantMessageFrame({
      allocatedId: secondId,
      agent: second.agent,
      messageId: "assistant-message|interleaved-b",
      assistantType: "thinking_delta",
      delta: "first-b",
    }),
    "second child thinking_delta",
  );
  feed(
    subagentAssistantMessageFrame({
      allocatedId: firstId,
      agent: first.agent,
      messageId: "assistant-message|interleaved-a",
      assistantType: "text_delta",
      delta: "second-a",
    }),
    "interleaved first child text_delta",
  );

  const readPath = "assistant-delta-guard.txt";
  fs.writeFileSync(path.join(root, readPath), "bounded early read\n", "utf8");
  for (const [index, event] of nestedReadFrames(readPath, "nested-read|assistant-delta-guard").entries()) {
    feed(
      subagentEvent(firstId, first.agent, event),
      `intervening read ${index === 0 ? "START" : "END"}`,
    );
  }
  for (const [index, event] of nestedValidatorFrames(first, "nested-validator|assistant-delta-guard").entries()) {
    feed(subagentEvent(firstId, first.agent, event), `intervening validator command ${index === 0 ? "START" : "END"}`);
  }
  const yieldCallId = "nested-yield|assistant-delta-guard";
  feed(
    subagentEvent(firstId, first.agent, {
      type: "tool_execution_start",
      toolName: "yield",
      toolCallId: yieldCallId,
    }),
    "intervening yield START",
  );
  feed(
    subagentEvent(firstId, first.agent, {
      type: "tool_execution_end",
      toolName: "yield",
      toolCallId: yieldCallId,
      isError: false,
      result: { details: { retained: true } },
    }),
    "intervening yield END",
  );
  feed(
    subagentAssistantMessageFrame({
      allocatedId: firstId,
      agent: first.agent,
      messageId: "assistant-message|interleaved-a",
      assistantType: "text_delta",
      delta: "error-flagged",
      isError: false,
      result: { details: { retained: true } },
    }),
    "error-flagged text_delta",
  );
  feed(
    subagentAssistantMessageFrame({
      allocatedId: firstId,
      messageId: "assistant-message|interleaved-a",
      agent: first.agent,
      eventType: "message_end",
    }),
    "message_end boundary",
  );

  const beforeRejectedFrames = JSON.stringify(session.evidence.subagent_frames);
  const beforeRejectedBytes = session.evidence.capture.bytes;
  const beforeRejectedSequence = session.subagentSequence;
  const rejected = captureError(() => session.consumeLogical(subagentAssistantMessageFrame({
    allocatedId: firstId,
    messageId: "assistant-message|interleaved-a",
    agent: first.agent,
    agentSource: "user",
    assistantType: "text_delta",
    delta: "forged-rebind",
  })));
  assert.equal(rejected?.kind, "BLOCKED", "a forged assistant delta tuple must be rejected before capture mutation");
  assert.equal(JSON.stringify(session.evidence.subagent_frames), beforeRejectedFrames, "rejected assistant delta must not erase or append retained frames");
  assert.equal(session.evidence.capture.bytes, beforeRejectedBytes, "rejected assistant delta must not change byte accounting");
  assert.equal(session.subagentSequence, beforeRejectedSequence + 1, "rejected assistant delta must preserve the global sequence gap");

  const frames = session.evidence.subagent_frames.filter((frame) => [firstId, secondId].includes(frame.allocated_id));
  const firstText = frames.filter((frame) => frame.allocated_id === firstId && frame.nonterminal_delta_kind === "text_delta");
  const secondThinking = frames.filter((frame) => frame.allocated_id === secondId && frame.nonterminal_delta_kind === "thinking_delta");
  assert.equal(firstText.length, 1, "non-adjacent first-child text deltas must coalesce by their full tuple and kind");
  assert.equal(firstText[0].coalesced_nonterminal_progress?.count, 2, "first-child text coalescing must preserve both non-adjacent deltas");
  assert.equal(secondThinking.length, 1, "a different child tuple must retain an independent thinking delta summary");
  assert.ok(firstText[0].sequence > secondThinking[0].sequence, "latest coalesced first-child sequence must remain after the interleaved second-child observation");

  const firstBinding = session.lifecycleByAllocated.get(`id:${firstId}`);
  assert.deepEqual(
    {
      allocated_id: firstText[0].allocated_id,
      parent_tool_call_id: firstText[0].parent_tool_call_id,
      index: firstText[0].index,
      agent: firstText[0].agent,
      agentSource: firstText[0].agentSource,
      job_id: firstText[0].job_id,
      instance_id: firstText[0].instance_id,
    },
    {
      allocated_id: firstBinding.allocated_id,
      parent_tool_call_id: firstBinding.parent_tool_call_id,
      index: firstBinding.index,
      agent: firstBinding.agent,
      agentSource: firstBinding.agentSource,
      job_id: firstBinding.job_id,
      instance_id: firstBinding.instance_id,
    },
    "coalesced first-child delta must preserve every Root-derived tuple field",
  );
  assert.equal(frames.filter((frame) => frame.type === "message_start").length, 1, "message_start must never coalesce");
  assert.equal(frames.filter((frame) => frame.type === "message_end").length, 1, "message_end must never coalesce");
  assert.equal(frames.filter((frame) => frame.tool_call_id === "nested-read|assistant-delta-guard").length, 2, "read START/END must never coalesce");
  assert.equal(frames.filter((frame) => frame.tool_call_id === "nested-validator|assistant-delta-guard").length, 2, "command START/END must never coalesce");
  assert.equal(frames.filter((frame) => frame.tool_call_id === yieldCallId).length, 2, "yield START/END must never coalesce");
  const errorFlagged = frames.filter((frame) => frame.type === "message_update" && frame.is_error === false);
  assert.equal(errorFlagged.length, 1, "an explicit false error flag must remain as its own message-update record");
  assert.equal(Object.hasOwn(errorFlagged[0], "nonterminal_delta_kind"), false, "an explicit false error flag must disqualify delta coalescing");
}


function pendingSdkToolcallDeltaDiagnosticsAdoptOnlyAfterRootConfirmation(apis, root) {
  const item = assignment(
    "PendingToolcallDeltaValidator",
    EARLY_AGENT,
    "Retain SDK-shaped toolcall delta diagnostics until the authoritative Root allocation is observed.",
  );
  const allocatedId = "speculative-candidate|toolcall-delta-pending";
  const rootToolCallId = "root-dispatch|toolcall-delta-pending";
  const rootJobId = "sdk-root-job|toolcall-delta-pending";
  const pathValue = "toolcall-delta-pending-readable.txt";
  const readCallId = "nested-read|toolcall-delta-pending";
  const session = createSession(
    apis.NativeRpcSession,
    root,
    [item],
    "native-pending-toolcall-delta-diagnostics",
  );
  fs.writeFileSync(path.join(root, pathValue), "toolcall delta pending read\n", "utf8");
  consumePending(
    session,
    lifecycleFrame({ id: allocatedId, parentToolCallId: rootToolCallId, agent: item.agent }),
    "pending toolcall delta lifecycle START",
  );

  const sequences = {};
  const emit = (frame, label) => {
    sequences[label] = consumeDiagnosticFrame(session, frame, `pending ${label}`);
  };
  emit(
    sdkAssistantMessageFrame({
      allocatedId,
      assistantEventType: null,
      eventType: "message_start",
      messageId: "assistant-message|toolcall-delta-pending",
    }),
    "message_start",
  );
  emit(
    sdkToolcallMessageFrame({
      allocatedId,
      assistantEventType: "toolcall_start",
      contentIndex: 0,
      messageId: "assistant-message|toolcall-delta-pending",
      pathValue,
      toolCallId: "sdk-toolcall|pending-read",
    }),
    "toolcall_start",
  );

  for (const event of nestedReadFrames(pathValue, readCallId).slice(0, 1)) {
    emit(subagentEvent(allocatedId, item.agent, event), `read-${event.type}`);
  }
  for (const [index, event] of nestedValidatorFrames(item, "nested-validator|toolcall-delta-pending").entries()) {
    emit(subagentEvent(allocatedId, item.agent, event), `command-${index}`);
  }
  const yieldCallId = "nested-yield|toolcall-delta-pending";
  for (const event of [
    {
      type: "tool_execution_start",
      toolName: "yield",
      toolCallId: yieldCallId,
    },
    {
      type: "tool_execution_end",
      toolName: "yield",
      toolCallId: yieldCallId,
      isError: false,
      result: { details: { retained: true } },
    },
  ]) {
    emit(subagentEvent(allocatedId, item.agent, event), `yield-${event.type}`);
  }

  let deltaError = null;
  for (let index = 0; index < TOOLCALL_DELTA_COUNT; index += 1) {
    const error = captureError(() => session.consumeLogical(sdkToolcallMessageFrame({
      allocatedId,
      contentIndex: index % 2,
      messageId: "assistant-message|toolcall-delta-pending",
      pathValue,
      toolCallId: "sdk-toolcall|pending-read",
      delta: `{"fragment":"${index % 7}"}`,
    })));
    if (error) {
      deltaError = error;
      break;
    }
  }
  assert.equal(
    deltaError,
    null,
    "36,000 SDK-shaped toolcall_delta diagnostics must coalesce through recordSubagentFrame while pending",
  );
  assert.ok(
    session.pendingObservationCount <= PENDING_OBSERVATION_LIMIT,
    "toolcall_delta pending retention must preserve the unchanged 256-observation bound",
  );
  assert.ok(
    session.pendingObservationBytes <= MAX_CAPTURE_BYTES,
    "toolcall_delta pending retention must preserve the unchanged 16 MiB byte bound",
  );

  emit(
    sdkToolcallMessageFrame({
      allocatedId,
      assistantEventType: "toolcall_delta",
      contentIndex: 0,
      messageId: "assistant-message|toolcall-delta-pending",
      pathValue,
      toolCallId: "sdk-toolcall|pending-read",
      error: { reason: "diagnostic-only error guard" },
    }),
    "error-guard",
  );
  emit(
    sdkToolcallMessageFrame({
      allocatedId,
      assistantEventType: "toolcall_delta",
      contentIndex: 0,
      messageId: "assistant-message|toolcall-delta-pending",
      pathValue,
      toolCallId: "sdk-toolcall|pending-read",
      result: { details: { diagnostic: true } },
    }),
    "result-guard",
  );
  emit(
    sdkToolcallMessageFrame({
      allocatedId,
      assistantEventType: "toolcall_delta",
      contentIndex: 0,
      messageId: "assistant-message|toolcall-delta-pending",
      pathValue,
      toolCallId: "sdk-toolcall|pending-read",
      isError: false,
    }),
    "isError-false-guard",
  );
  emit(
    sdkToolcallMessageFrame({
      allocatedId,
      assistantEventType: "future_delta",
      contentIndex: 0,
      messageId: "assistant-message|toolcall-delta-pending",
      pathValue,
      toolCallId: "sdk-toolcall|pending-read",
    }),
    "unknown-assistant-event",
  );
  emit(
    sdkAssistantMessageFrame({
      allocatedId,
      assistantEventType: null,
      eventType: "message_update",
      messageId: "assistant-message|toolcall-delta-pending",
    }),
    "missing-assistant-event",
  );
  emit(
    sdkToolcallMessageFrame({
      allocatedId,
      assistantEventType: "toolcall_end",
      contentIndex: 0,
      messageId: "assistant-message|toolcall-delta-pending",
      pathValue,
      toolCallId: "sdk-toolcall|pending-read",
    }),
    "toolcall_end",
  );
  for (const event of nestedReadFrames(pathValue, readCallId).slice(1)) {
    emit(subagentEvent(allocatedId, item.agent, event), "read-end");
  }
  emit(
    sdkAssistantMessageFrame({
      allocatedId,
      assistantEventType: null,
      eventType: "message_end",
      messageId: "assistant-message|toolcall-delta-pending",
    }),
    "message_end",
  );

  assert.equal(
    session.pendingLifecycleByAllocated.get(`id:${allocatedId}`)?.accepted,
    false,
    "toolcall_delta diagnostics must remain non-authoritative before Root confirmation",
  );
  session.recordTool(rootStart(rootToolCallId, [item]));
  assert.equal(
    session.lifecycleByAllocated.has(`id:${allocatedId}`),
    false,
    "Root START alone must not adopt pending toolcall_delta diagnostics",
  );
  session.recordTool(rootProgressUpdate(rootToolCallId, [progressRow(item, allocatedId)]));
  const binding = session.lifecycleByAllocated.get(`id:${allocatedId}`);
  assert.ok(binding?.accepted, "matching Root progress must adopt pending toolcall_delta diagnostics");
  assert.equal(session.pendingLifecycleByAllocated.has(`id:${allocatedId}`), false, "Root adoption must release pending toolcall_delta state");
  assert.equal(session.pendingObservationCount, 0, "Root adoption must release the pending observation count");
  assert.equal(session.pendingObservationBytes, 0, "Root adoption must release the pending observation bytes");

  const frames = session.evidence.subagent_frames.filter((frame) => frame.allocated_id === allocatedId);
  assertAssistantEventDiagnostics(frames, "pending toolcall delta");
  const rowAt = (sequence) => frames.find((frame) => frame.sequence === sequence);
  assert.equal(rowAt(sequences.message_start)?.type, "message_start", "message_start must remain a distinct retained boundary");
  assert.equal(rowAt(sequences.toolcall_start)?.assistant_event?.type, "toolcall_start", "toolcall_start must remain a distinct retained boundary");
  assert.equal(rowAt(sequences.toolcall_end)?.assistant_event?.type, "toolcall_end", "toolcall_end must remain a distinct retained boundary");
  assert.equal(rowAt(sequences.message_end)?.type, "message_end", "message_end must remain a distinct retained boundary");
  assert.equal(rowAt(sequences["isError-false-guard"])?.is_error, false, "explicit isError:false must remain observable after pending adoption");
  for (const label of ["error-guard", "result-guard", "isError-false-guard"]) {
    assert.equal(
      Object.hasOwn(rowAt(sequences[label]) ?? {}, "coalesced_nonterminal_progress"),
      false,
      `${label} must remain a non-coalesced guard boundary`,
    );
  }
  assert.deepEqual(
    { ...rowAt(sequences["unknown-assistant-event"])?.assistant_event },
    { present: true, type: "unknown", content_index: 0 },
    "unknown SDK assistant-event kinds must be bounded as unknown",
  );
  assert.deepEqual(
    { ...rowAt(sequences["missing-assistant-event"])?.assistant_event },
    { present: false, type: "missing", content_index: null },
    "missing SDK assistant events must remain explicitly missing",
  );
  const deltaRows = frames.filter(
    (frame) => frame.assistant_event?.type === "toolcall_delta" && frame.coalesced_nonterminal_progress,
  );
  assert.equal(deltaRows.length, 2, "pending toolcall_delta streams must remain separate by contentIndex");
  assert.deepEqual(
    deltaRows.map((frame) => frame.assistant_event.content_index).sort((left, right) => left - right),
    [0, 1],
    "pending toolcall_delta diagnostics must retain safe contentIndex values",
  );
  assert.deepEqual(
    deltaRows.map((frame) => frame.coalesced_nonterminal_progress.count).sort((left, right) => left - right),
    [TOOLCALL_DELTA_COUNT / 2, TOOLCALL_DELTA_COUNT / 2],
    "pending toolcall_delta coalescing must preserve every diagnostic count",
  );
  assert.equal(session.evidence.subagent_reads.length, 1, "pending read START/END must survive toolcall delta retention");
  assert.equal(session.evidence.command_results.length, 2, "pending command START/END must survive toolcall delta retention");
  assert.equal(session.evidence.root_task_ends.length, 0, "Root adoption alone must not manufacture a task END");

  session.recordTool(rootEnd(rootToolCallId, rootJobId, [progressRow(item, allocatedId)]));
  assert.equal(session.evidence.root_task_ends.length, 1, "the observed Root task END must remain present");
  session.consumeLogical(lifecycleFrame({
    id: allocatedId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    parentToolCallId: rootToolCallId,
    status: "completed",
  }));
  session.consumeLogical(asyncMessage(asyncJob(rootJobId, allocatedId)));
  assertAcceptedRecord(session, {
    allocated_id: allocatedId,
    parent_tool_call_id: rootToolCallId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    assignment_id: item.name,
  });
}

async function acceptedSdkToolcallDeltaDiagnosticsStayWithinWriterBudget(apis, root) {
  const primary = assignment(
    "AcceptedToolcallDeltaValidator",
    EARLY_AGENT,
    "Retain accepted SDK-shaped toolcall delta diagnostics without exceeding the physical evidence bound.",
  );
  const writer = assignment(
    "AcceptedToolcallDeltaSpecKitAuthor",
    "spec-kit-author",
    "Retain the accepted private write guard around toolcall delta diagnostics.",
  );
  const other = assignment(
    "AcceptedToolcallDeltaBackend",
    "backend-developer",
    "Keep a second child tuple independent from the toolcall delta stream.",
  );
  const allocatedId = "actual-child|toolcall-delta-budget";
  const writerId = "actual-child|toolcall-delta-writer";
  const otherId = "actual-child|toolcall-delta-other";
  const rootToolCallId = "root-dispatch|toolcall-delta-budget";
  const rootJobId = "sdk-root-job|toolcall-delta-budget";
  const pathValue = "toolcall-delta-accepted-readable.txt";
  const readCallId = "nested-read|toolcall-delta-accepted";
  const capture = await apis.executeNativeCapture(
    {
      native: false,
      captureProvider: async ({ fixture }) => {
        const session = createSession(
          apis.NativeRpcSession,
          fixture.project,
          [primary, writer, other],
          "native-accepted-toolcall-delta-diagnostics",
        );
        const blockedCapture = (error) => ({
          status: "BLOCKED",
          failure: safeError(error),
          observed_capture: {
            bytes: session.evidence.capture.bytes,
            max_bytes: MAX_CAPTURE_BYTES,
            retained_subagent_frames: session.evidence.subagent_frames.length,
          },
        });
        try {
          fs.writeFileSync(path.join(fixture.project, pathValue), "toolcall delta accepted read\n", "utf8");
          session.recordTool(rootStart(rootToolCallId, [primary, writer, other]));
          for (const [id, item, index] of [[allocatedId, primary, 0], [writerId, writer, 1], [otherId, other, 2]]) {
            session.consumeLogical(lifecycleFrame({
              id,
              index,
              agent: item.agent,
              agentSource: "project",
              parentToolCallId: rootToolCallId,
              status: "started",
            }));
          }
          session.recordTool(rootProgressUpdate(rootToolCallId, [
            progressRow(primary, allocatedId, 0),
            progressRow(writer, writerId, 1),
            progressRow(other, otherId, 2),
          ]));

          const sequences = {};
          const emit = (frame, label) => {
            sequences[label] = consumeDiagnosticFrame(session, frame, `accepted ${label}`);
          };
          emit(
            sdkAssistantMessageFrame({
              allocatedId,
              assistantEventType: null,
              eventType: "message_start",
              messageId: "assistant-message|toolcall-delta-accepted",
            }),
            "message_start",
          );
          emit(
            sdkToolcallMessageFrame({
              allocatedId,
              assistantEventType: "toolcall_start",
              contentIndex: 0,
              messageId: "assistant-message|toolcall-delta-accepted",
              pathValue,
              toolCallId: "sdk-toolcall|accepted-read",
            }),
            "toolcall_start",
          );
          for (const event of nestedReadFrames(pathValue, readCallId).slice(0, 1)) {
            emit(subagentEvent(allocatedId, primary.agent, event), "read-start");
          }
          for (const [index, event] of nestedValidatorFrames(primary, "nested-validator|toolcall-delta-accepted").entries()) {
            emit(subagentEvent(allocatedId, primary.agent, event), `command-${index}`);
          }
          const yieldCallId = "nested-yield|toolcall-delta-accepted";
          for (const event of [
            {
              type: "tool_execution_start",
              toolName: "yield",
              toolCallId: yieldCallId,
            },
            {
              type: "tool_execution_end",
              toolName: "yield",
              toolCallId: yieldCallId,
              isError: false,
              result: { details: { retained: true } },
            },
          ]) {
            emit(subagentEvent(allocatedId, primary.agent, event), `yield-${event.type}`);
          }

          const handoff = nestedSpecKitWriteFrames(fixture.project);
          for (const [index, event] of handoff.events.entries()) {
            emit(subagentEvent(writerId, writer.agent, event), `write-${index}`);
          }

          for (let index = 0; index < TOOLCALL_DELTA_COUNT; index += 1) {
            session.consumeLogical(sdkToolcallMessageFrame({
              allocatedId,
              contentIndex: index % 2,
              messageId: "assistant-message|toolcall-delta-accepted",
              pathValue,
              toolCallId: "sdk-toolcall|accepted-read",
              delta: `{"fragment":"${index % 7}"}`,
            }));
          }
          session.consumeLogical(sdkToolcallMessageFrame({
            allocatedId: otherId,
            agent: other.agent,
            contentIndex: 0,
            messageId: "assistant-message|toolcall-delta-other",
            pathValue,
            toolCallId: "sdk-toolcall|other-read",
            delta: "{\"fragment\":\"other\"}",
          }));
          emit(
            sdkToolcallMessageFrame({
              allocatedId,
              assistantEventType: "toolcall_delta",
              contentIndex: 0,
              messageId: "assistant-message|toolcall-delta-accepted",
              pathValue,
              toolCallId: "sdk-toolcall|accepted-read",
              error: { reason: "diagnostic-only error guard" },
            }),
            "error-guard",
          );
          emit(
            sdkToolcallMessageFrame({
              allocatedId,
              assistantEventType: "toolcall_delta",
              contentIndex: 0,
              messageId: "assistant-message|toolcall-delta-accepted",
              pathValue,
              toolCallId: "sdk-toolcall|accepted-read",
              result: { details: { diagnostic: true } },
            }),
            "result-guard",
          );
          emit(
            sdkToolcallMessageFrame({
              allocatedId,
              assistantEventType: "toolcall_delta",
              contentIndex: 0,
              messageId: "assistant-message|toolcall-delta-accepted",
              pathValue,
              toolCallId: "sdk-toolcall|accepted-read",
              isError: false,
            }),
            "isError-false-guard",
          );
          emit(
            sdkToolcallMessageFrame({
              allocatedId,
              assistantEventType: "future_delta",
              contentIndex: 0,
              messageId: "assistant-message|toolcall-delta-accepted",
              pathValue,
              toolCallId: "sdk-toolcall|accepted-read",
            }),
            "unknown-assistant-event",
          );
          emit(
            sdkAssistantMessageFrame({
              allocatedId,
              assistantEventType: null,
              eventType: "message_update",
              messageId: "assistant-message|toolcall-delta-accepted",
            }),
            "missing-assistant-event",
          );
          emit(
            sdkToolcallMessageFrame({
              allocatedId,
              assistantEventType: "toolcall_end",
              contentIndex: 0,
              messageId: "assistant-message|toolcall-delta-accepted",
              pathValue,
              toolCallId: "sdk-toolcall|accepted-read",
            }),
            "toolcall_end",
          );
          for (const event of nestedReadFrames(pathValue, readCallId).slice(1)) {
            emit(subagentEvent(allocatedId, primary.agent, event), "read-end");
          }
          emit(
            sdkAssistantMessageFrame({
              allocatedId,
              assistantEventType: null,
              eventType: "message_end",
              messageId: "assistant-message|toolcall-delta-accepted",
            }),
            "message_end",
          );

          session.recordTool(rootEnd(rootToolCallId, rootJobId, [
            progressRow(primary, allocatedId, 0),
            progressRow(writer, writerId, 1),
            progressRow(other, otherId, 2),
          ]));
          for (const [id, item, index] of [[allocatedId, primary, 0], [writerId, writer, 1], [otherId, other, 2]]) {
            session.consumeLogical(lifecycleFrame({
              id,
              index,
              agent: item.agent,
              agentSource: "project",
              parentToolCallId: rootToolCallId,
              status: "completed",
            }));
          }
          session.consumeLogical(asyncMessage(asyncJob(rootJobId, allocatedId)));
        } catch (error) {
          return blockedCapture(error);
        }
        return { ...session.evidence, status: "PASS" };
      },
    },
    { project: root, logicalRunId: RUN_ID },
    [primary, writer, other],
    "accepted-toolcall-delta-budget",
    "controlled accepted SDK-shaped toolcall delta retention fixture",
  );

  assert.equal(
    capture.status,
    "PASS",
    `accepted SDK-shaped toolcall_delta diagnostics must pass through the real writer (${capture.failure?.message ?? "capture blocked"})`,
  );
  const receipt = capture.capture_receipt;
  assert.ok(
    receipt?.path && Number.isSafeInteger(receipt.bytes) && typeof receipt.sha256 === "string",
    "accepted toolcall_delta capture must expose a writer receipt",
  );
  assert.ok(receipt.bytes <= MAX_CAPTURE_BYTES, "accepted toolcall_delta receipt must remain below the unchanged 16 MiB bound");
  const receiptBytes = fs.readFileSync(path.resolve(root, receipt.path));
  assert.equal(receiptBytes.byteLength, receipt.bytes, "accepted toolcall_delta writer receipt bytes must match the persisted aggregate");
  assert.ok(receiptBytes.byteLength <= MAX_CAPTURE_BYTES, "persisted toolcall_delta aggregate must remain below the unchanged 16 MiB bound");
  const persisted = JSON.parse(receiptBytes.toString("utf8"));
  assert.equal(persisted.status, "PASS", "persisted toolcall_delta aggregate must retain successful capture status");
  assertAssistantEventDiagnostics(persisted.subagent_frames, "accepted toolcall delta");

  const primaryFrames = persisted.subagent_frames.filter((frame) => frame.allocated_id === allocatedId);
  const otherFrames = persisted.subagent_frames.filter((frame) => frame.allocated_id === otherId);
  const primaryDeltaRows = primaryFrames.filter(
    (frame) => frame.assistant_event?.type === "toolcall_delta" && frame.coalesced_nonterminal_progress,
  );
  assert.equal(primaryDeltaRows.length, 2, "accepted toolcall_delta streams must remain separate by contentIndex");
  assert.deepEqual(
    primaryDeltaRows.map((frame) => frame.assistant_event.content_index).sort((left, right) => left - right),
    [0, 1],
    "accepted toolcall_delta diagnostics must retain safe contentIndex values",
  );
  assert.deepEqual(
    primaryDeltaRows.map((frame) => frame.coalesced_nonterminal_progress.count).sort((left, right) => left - right),
    [TOOLCALL_DELTA_COUNT / 2, TOOLCALL_DELTA_COUNT / 2],
    "accepted toolcall_delta coalescing must preserve every diagnostic count",
  );
  const otherDeltaRows = otherFrames.filter((frame) => frame.assistant_event?.type === "toolcall_delta");
  assert.equal(otherDeltaRows.length, 1, "a distinct child tuple must retain an independent toolcall_delta diagnostic");
  assert.equal(
    Object.hasOwn(otherDeltaRows[0], "coalesced_nonterminal_progress"),
    false,
    "a single distinct-child toolcall_delta diagnostic must not borrow the primary stream aggregate",
  );

  const primaryRowAt = (sequence) => primaryFrames.find((frame) => frame.sequence === sequence);
  const primaryMessageUpdates = primaryFrames.filter((frame) => frame.type === "message_update");
  assert.equal(
    primaryMessageUpdates.every((frame) => frame.assistant_event?.present === true || frame.assistant_event?.type === "missing"),
    true,
    "every accepted message_update must retain an explicit assistant-event presence discriminator",
  );
  for (const frame of primaryMessageUpdates.filter((frame) => frame.assistant_event?.type !== "toolcall_delta")) {
    assert.equal(
      Object.hasOwn(frame, "coalesced_nonterminal_progress"),
      false,
      "toolcall boundaries and unknown/missing assistant events must never coalesce",
    );
  }
  assert.ok(primaryFrames.some((frame) => frame.type === "message_start"), "accepted message_start must remain retained");
  assert.ok(primaryFrames.some((frame) => frame.type === "message_end"), "accepted message_end must remain retained");
  assert.equal(
    primaryFrames.filter((frame) => frame.assistant_event?.type === "toolcall_start").length,
    1,
    "accepted toolcall_start must remain retained",
  );
  assert.equal(
    primaryFrames.filter((frame) => frame.assistant_event?.type === "toolcall_end").length,
    1,
    "accepted toolcall_end must remain retained",
  );
  const explicitFalseRows = primaryMessageUpdates.filter((frame) => frame.is_error === false);
  assert.equal(explicitFalseRows.length, 1, "accepted isError:false guard must remain exactly one message-update record");
  assert.equal(explicitFalseRows[0].is_error, false, "isError:false must remain observable");
  assert.equal(persisted.subagent_reads.filter((record) => record.allocated_id === allocatedId).length, 1, "read START/END must remain retained");
  assert.equal(persisted.subagent_writes.filter((record) => record.allocated_id === writerId).length, 3, "write START/UPDATE/END must remain retained");
  assert.equal(persisted.command_results.filter((record) => record.allocated_id === allocatedId).length, 2, "command START/END must remain retained");
  assert.equal(
    persisted.subagent_frames.filter((frame) => frame.allocated_id === allocatedId && frame.control?.kind === "yield").length,
    2,
    "yield START/END must remain retained",
  );
  assert.equal(persisted.root_task_ends.length, 1, "Root terminal END must remain retained");
  assert.equal(
    persisted.task_records.filter((record) => record.source_kind === "task_async_result").length,
    1,
    "the authoritative async terminal result must remain retained",
  );
}

function timeoutStubForbiddenState(config) {
  return {
    queuedMessages: [config.canary],
    todo: config.canary,
    model: config.canary,
    sessionFile: config.canary,
    rawBody: config.canary,
    auth: config.canary,
    HOME: config.canary,
  };
}

function emitTimeoutFrame(child, frame) {
  if (child.killed) return;
  child.stdout.emit("data", Buffer.from(`${JSON.stringify(frame)}\n`, "utf8"));
}

class TimeoutRpcChild extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.killed = false;
    this.closed = false;
    this.stateReads = 0;
    this.promptId = null;
    this.keepAlive = setInterval(() => {}, 1_000);
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = {
      write: (value) => {
        const lines = String(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try { this.receive(JSON.parse(line)); } catch {}
        }
        return true;
      },
      end: () => this.close(0, null),
    };
    queueMicrotask(() => emitTimeoutFrame(this, { type: "ready" }));
  }

  close(code = 0, signal = null) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.keepAlive);
    this.emit("close", code, signal);
  }

  kill() {
    this.killed = true;
    this.close(0, null);
    return true;
  }

  sendResponse(command, fields = {}) {
    emitTimeoutFrame(this, { type: "response", id: command.id, command: command.type, ...fields });
  }

  receive(command) {
    if (this.killed || this.closed) return;
    if (command.type === "negotiate_protocol" || command.type === "set_event_filter" || command.type === "set_subagent_subscription") {
      this.sendResponse(command, { success: true });
      return;
    }
    if (command.type === "get_state") {
      this.stateReads += 1;
      if (this.stateReads === 1) {
        this.sendResponse(command, { command: "get_state", success: true, data: { sessionId: this.config.rootSessionId } });
        return;
      }
      fs.writeFileSync(this.config.queryMarker, JSON.stringify({
        query_count: this.stateReads - 1,
        command: command.type ?? null,
        keys: Object.keys(command).sort(),
      }), "utf8");
      if (this.config.variant === "failure") {
        this.sendResponse(command, {
          command: "get_state",
          success: false,
          data: { sessionId: this.config.rootSessionId },
          error: { code: "DIAGNOSTIC_RPC_FAILED", detail: this.config.canary },
        });
        return;
      }
      if (this.config.variant === "foreign") {
        this.sendResponse(command, {
          command: "not_get_state",
          success: true,
          data: {
            sessionId: "foreign-root-session",
            isStreaming: true,
            isCompacting: true,
            hasPendingAsyncWork: true,
            isSettled: true,
            queuedMessageCount: 999,
            ...timeoutStubForbiddenState(this.config),
          },
        });
        return;
      }
      const data = { sessionId: this.config.rootSessionId, ...timeoutStubForbiddenState(this.config) };
      if (this.config.variant === "safe" || this.config.variant === "safe-late-events") {
        Object.assign(data, {
          isStreaming: false,
          isCompacting: false,
          hasPendingAsyncWork: false,
          isSettled: true,
          queuedMessageCount: 0,
        });
      }
      this.sendResponse(command, { command: "get_state", success: true, data });
      if (this.config.variant === "safe-late-events") {
        emitTimeoutFrame(this, { type: "prompt_result", id: this.promptId, status: "completed", agentInvoked: true, sessionSettled: true });
        emitTimeoutFrame(this, { type: "agent_end", isTerminal: true, awaitingAsyncWork: false });
        emitTimeoutFrame(this, { type: "session_settled" });
      }
      return;
    }
    if (command.type === "prompt") {
      this.promptId = command.id;
      this.sendResponse(command, { command: "prompt", success: true });
      return;
    }
    if (command.type === "abort") {
      fs.writeFileSync(this.config.abortMarker, JSON.stringify({ aborted: true, state_reads: this.stateReads, prompt_id: this.promptId }), "utf8");
    }
  }
}

function installTimeoutRpcSpawnStub() {
  if (childProcess.__timeoutRpcSpawnInstalled) return;
  const originalSpawn = childProcess.spawn;
  const spawnStub = (command, ...args) => {
    const config = timeoutRpcStubs.get(path.resolve(String(command)));
    return config ? new TimeoutRpcChild(config) : originalSpawn(command, ...args);
  };
  childProcess.spawn = spawnStub;
  childProcess.__timeoutRpcSpawnInstalled = true;
  syncBuiltinESMExports();
}

function writeTimeoutRpcStub(root, variant) {
  const stubRoot = path.join(root, "timeout-rpc-stub");
  fs.mkdirSync(stubRoot, { recursive: true });
  const launcher = path.join(stubRoot, "omp-timeout-stub");
  const queryMarker = path.join(stubRoot, "query.json");
  const abortMarker = path.join(stubRoot, "abort.json");
  const config = {
    variant,
    rootSessionId: TIMEOUT_STUB_ROOT_SESSION_ID,
    canary: TIMEOUT_DIAGNOSTIC_CANARY,
    queryMarker,
    abortMarker,
  };
  timeoutRpcStubs.set(path.resolve(launcher), config);
  return { launcher, queryMarker, abortMarker };
}

async function runTimeoutCapture(apis, root, variant, label) {
  apis.__resetNativeCaptureForTest?.();
  // The controlled child needs an allowlisted authenticated-environment marker;
  // the diagnostic itself must never retain or query HOME.
  if (!process.env.HOME) process.env.HOME = root;
  if (!process.env.USERPROFILE) process.env.USERPROFILE = root;
  const stub = writeTimeoutRpcStub(root, variant);
  const capture = await apis.executeNativeCapture(
    {
      native: true,
      omp: stub.launcher,
      // Test-only bounded timeout; production DEFAULT_TIMEOUT_MS remains 300000.
      timeoutMs: 120,
    },
    { project: root, logicalRunId: `${RUN_ID}|${label}` },
    [],
    label,
    "Controlled Root prompt timeout diagnostic probe.",
  );
  return { capture, stub };
}

function readTimeoutMarker(file, label) {
  assert.ok(fs.existsSync(file), `${label} must leave its host marker`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assertFailedTimeoutCapture(capture, root, label) {
  assert.equal(capture.status, "PENDING", `${label} must retain the original PENDING capture status`);
  assert.equal(capture.failure?.kind, "BLOCKED", `${label} must retain the original blocked failure kind`);
  assert.equal(capture.failure?.reason_code, "HARNESS_TIMEOUT", `${label} must retain the original HARNESS_TIMEOUT reason`);
  assert.match(capture.failure?.message ?? "", /prompt result timed out/i, `${label} must retain the original prompt timeout message`);
  assert.equal(Object.hasOwn(capture, "native"), false, `${label} must not promote a failed capture to native:true`);
  assert.equal(Object.hasOwn(capture, "origin"), false, `${label} must not add a native origin to a failed capture`);
  assert.equal(capture.evidence_level, "native-omp-rpc", `${label} must retain the original failed-capture evidence level`);
  assert.ok(capture.capture_receipt?.path, `${label} must still publish the bounded failed-capture receipt`);
  assert.ok(capture.capture_receipt.bytes <= MAX_CAPTURE_BYTES, `${label} failed-capture receipt must remain under the unchanged 16 MiB bound`);
  const persisted = JSON.parse(fs.readFileSync(path.resolve(root, capture.capture_receipt.path), "utf8"));
  assert.equal(persisted.status, "PENDING", `${label} persisted receipt must retain PENDING`);
  assert.equal(persisted.failure?.reason_code, "HARNESS_TIMEOUT", `${label} persisted receipt must retain HARNESS_TIMEOUT`);
  assert.equal(Object.hasOwn(persisted, "native"), false, `${label} persisted receipt must not promote native:true`);
  assert.equal(Object.hasOwn(persisted, "origin"), false, `${label} persisted receipt must not add origin`);
  assert.equal(JSON.stringify(persisted).includes(TIMEOUT_DIAGNOSTIC_CANARY), false, `${label} must not persist the forbidden state body`);
  return persisted;
}

function assertTimeoutQueryWasOneReadonlyGetState(stub, label) {
  const query = readTimeoutMarker(stub.queryMarker, label);
  assert.equal(query.query_count, 1, `${label} must issue exactly one bounded diagnostic query`);
  assert.equal(query.command, "get_state", `${label} diagnostic must use the readonly get_state RPC`);
  assert.deepEqual(query.keys, ["id", "type"], `${label} diagnostic command must use only the pinned get_state request fields`);
  return query;
}

function assertAbortWasSent(stub, label) {
  const marker = readTimeoutMarker(stub.abortMarker, label);
  assert.equal(marker.aborted, true, `${label} must abort after the bounded diagnostic attempt`);
  assert.equal(marker.state_reads, 2, `${label} abort must follow the initial state read and one diagnostic state read`);
}

function assertTimeoutDiagnosticEnvelope(diagnostic, label, expected) {
  assert.deepEqual(Object.keys(diagnostic ?? {}).sort(), [...TIMEOUT_DIAGNOSTIC_KEYS].sort(), `${label} diagnostic must retain only the stable bounded fields`);
  assert.equal(diagnostic.kind, "root_state", `${label} diagnostic kind must identify the Root state observation`);
  assert.equal(diagnostic.status, expected.status, `${label} diagnostic status must be stable`);
  assert.equal(diagnostic.reason_code, expected.reason_code, `${label} diagnostic reason must be bounded and typed`);
  assert.equal(diagnostic.command, "get_state", `${label} diagnostic command must remain get_state`);
  assert.equal(typeof diagnostic.request_id, "string", `${label} diagnostic must retain its safe outgoing request ID`);
  assert.deepEqual({ ...diagnostic.original_terminal_presence }, { prompt_result: false, session_settled: false }, `${label} must snapshot terminal presence before querying`);
  assert.ok(Number.isFinite(diagnostic.elapsed_ms) && diagnostic.elapsed_ms >= 0 && diagnostic.elapsed_ms <= TIMEOUT_DIAGNOSTIC_BUDGET_MS, `${label} diagnostic elapsed time must be bounded`);
  assert.ok(Number.isSafeInteger(diagnostic.budget_ms) && diagnostic.budget_ms > 0 && diagnostic.budget_ms <= TIMEOUT_DIAGNOSTIC_BUDGET_MS, `${label} diagnostic budget must be bounded to 2000ms`);
  assert.deepEqual(Object.keys(diagnostic.state ?? {}).sort(), ["hasPendingAsyncWork", "isCompacting", "isSettled", "isStreaming", "queuedMessageCount"].sort(), `${label} must expose only the safe Root state projection`);
  assert.equal(Object.hasOwn(diagnostic, "queuedMessages"), false, `${label} must not expose queuedMessages`);
  assert.equal(Object.hasOwn(diagnostic, "todo"), false, `${label} must not expose todo`);
  assert.equal(Object.hasOwn(diagnostic, "model"), false, `${label} must not expose model`);
  assert.equal(Object.hasOwn(diagnostic, "sessionFile"), false, `${label} must not expose sessionFile`);
  assert.equal(Object.hasOwn(diagnostic, "rawBody"), false, `${label} must not expose raw response body`);
  assert.equal(Object.hasOwn(diagnostic, "auth"), false, `${label} must not expose auth`);
  assert.equal(Object.hasOwn(diagnostic, "HOME"), false, `${label} must not expose HOME`);
  if (expected.validCorrelation) {
    assert.equal(diagnostic.response_id, diagnostic.request_id, `${label} valid correlation must bind response.id to the outgoing request`);
    assert.equal(diagnostic.root_session_id, TIMEOUT_STUB_ROOT_SESSION_ID, `${label} valid correlation must retain the exact observed Root session`);
    assert.equal(diagnostic.root_session_id_source, "get_state.data.sessionId", `${label} valid Root session provenance must be explicit`);
    assert.equal(diagnostic.success, expected.success, `${label} must retain the observed get_state success flag`);
  } else {
    assert.equal(diagnostic.response_id, null, `${label} invalid response correlation must not retain a foreign response ID`);
    assert.equal(diagnostic.root_session_id, null, `${label} invalid response correlation must not retain a foreign Root session`);
    assert.equal(diagnostic.root_session_id_source, null, `${label} invalid Root session provenance must be null`);
    assert.equal(diagnostic.success, expected.success, `${label} must not infer success for an invalid response`);
  }
  assert.deepEqual({ ...diagnostic.state }, expected.state, `${label} must preserve absent/invalid state fields as null, never false`);
}
function assertTimeoutDiagnosticsCharged(capture, label) {
  const diagnostics = capture.failure_diagnostics;
  const bytes = Buffer.byteLength(JSON.stringify(diagnostics), "utf8");
  const chargedBytes = diagnostics.reduce((total, record) => total + Buffer.byteLength(JSON.stringify(record), "utf8"), 0);
  assert.ok(diagnostics.length <= PENDING_OBSERVATION_LIMIT, `${label} diagnostic count must remain within 256 observations`);
  assert.ok(bytes <= MAX_CAPTURE_BYTES, `${label} diagnostic serialization must remain within 16 MiB`);
  assert.ok(Number.isSafeInteger(capture.raw_observation?.capture?.bytes) && capture.raw_observation.capture.bytes >= chargedBytes, `${label} diagnostic records must be charged through the observed capture budget`);
}

async function safeSettledTimeoutStateCannotRescueFailedCapture(apis, root) {
  const { capture, stub } = await runTimeoutCapture(apis, root, "safe-late-events", "timeout-safe-settled");
  assertFailedTimeoutCapture(capture, root, "safe settled timeout");
  assert.ok(Array.isArray(capture.failure_diagnostics), "safe settled timeout must expose a failure_diagnostics array");
  assertTimeoutQueryWasOneReadonlyGetState(stub, "safe settled timeout");
  assertAbortWasSent(stub, "safe settled timeout");
  assert.equal(capture.failure_diagnostics.length, 1, "safe settled timeout must retain one diagnostic");
  assertTimeoutDiagnosticsCharged(capture, "safe settled timeout");
  assertTimeoutDiagnosticEnvelope(capture.failure_diagnostics[0], "safe settled timeout", {
    status: "observed",
    reason_code: null,
    success: true,
    validCorrelation: true,
    state: { isStreaming: false, isCompacting: false, hasPendingAsyncWork: false, isSettled: true, queuedMessageCount: 0 },
  });
  assert.equal(capture.terminal?.prompt_result?.status, "completed", "late actual prompt_result must remain observable without rescuing the failed capture");
  assert.equal(capture.terminal?.session_settled, true, "late actual session_settled must remain observable without rescuing the failed capture");
  assert.equal(Object.hasOwn(capture, "native"), false, "late actual events must not add native:true");
  assert.equal(Object.hasOwn(capture, "origin"), false, "late actual events must not add origin");
}

async function absentTimeoutStateCannotFabricateFlags(apis, root) {
  const { capture, stub } = await runTimeoutCapture(apis, root, "absent", "timeout-absent-state");
  assertFailedTimeoutCapture(capture, root, "absent timeout state");
  assert.ok(Array.isArray(capture.failure_diagnostics), "absent timeout state must expose a failure_diagnostics array");
  assertTimeoutQueryWasOneReadonlyGetState(stub, "absent timeout state");
  assertAbortWasSent(stub, "absent timeout state");
  assert.equal(capture.failure_diagnostics.length, 1, "absent timeout state must retain one diagnostic");
  assertTimeoutDiagnosticsCharged(capture, "absent timeout state");
  assertTimeoutDiagnosticEnvelope(capture.failure_diagnostics[0], "absent timeout state", {
    status: "observed",
    reason_code: null,
    success: true,
    validCorrelation: true,
    state: { isStreaming: null, isCompacting: null, hasPendingAsyncWork: null, isSettled: null, queuedMessageCount: null },
  });
}

async function foreignTimeoutStateCannotFabricateFlags(apis, root) {
  const { capture, stub } = await runTimeoutCapture(apis, root, "foreign", "timeout-foreign-state");
  assertFailedTimeoutCapture(capture, root, "foreign timeout state");
  assert.ok(Array.isArray(capture.failure_diagnostics), "foreign timeout state must expose a failure_diagnostics array");
  assertTimeoutQueryWasOneReadonlyGetState(stub, "foreign timeout state");
  assertAbortWasSent(stub, "foreign timeout state");
  assert.equal(capture.failure_diagnostics.length, 1, "foreign timeout state must retain one diagnostic");
  assertTimeoutDiagnosticsCharged(capture, "foreign timeout state");
  assertTimeoutDiagnosticEnvelope(capture.failure_diagnostics[0], "foreign timeout state", {
    status: "refused",
    reason_code: "ROOT_STATE_CORRELATION_MISMATCH",
    success: null,
    validCorrelation: false,
    state: { isStreaming: null, isCompacting: null, hasPendingAsyncWork: null, isSettled: null, queuedMessageCount: null },
  });
  assert.equal(JSON.stringify(capture).includes("foreign-root-session"), false, "foreign Root state must not leak its session identity");
  assert.equal(JSON.stringify(capture).includes(TIMEOUT_DIAGNOSTIC_CANARY), false, "foreign Root state must not leak its response body");
}

async function timeoutStateQueryFailurePreservesOriginalErrorAndAbort(apis, root) {
  const { capture, stub } = await runTimeoutCapture(apis, root, "failure", "timeout-state-query-failure");
  assertFailedTimeoutCapture(capture, root, "failed timeout state query");
  assert.ok(Array.isArray(capture.failure_diagnostics), "failed timeout state query must expose a failure_diagnostics array");
  assertTimeoutQueryWasOneReadonlyGetState(stub, "failed timeout state query");
  assertAbortWasSent(stub, "failed timeout state query");
  assert.equal(capture.failure_diagnostics.length, 1, "failed timeout state query must retain one unavailable diagnostic");
  assertTimeoutDiagnosticsCharged(capture, "failed timeout state query");
  assertTimeoutDiagnosticEnvelope(capture.failure_diagnostics[0], "failed timeout state query", {
    status: "unavailable",
    reason_code: "ROOT_STATE_UNAVAILABLE",
    success: false,
    validCorrelation: true,
    state: { isStreaming: null, isCompacting: null, hasPendingAsyncWork: null, isSettled: null, queuedMessageCount: null },
  });
  assert.equal(capture.failure.reason_code, "HARNESS_TIMEOUT", "diagnostic RPC failure must not replace the original HARNESS_TIMEOUT");
  assert.match(capture.failure.message ?? "", /prompt result timed out/i, "diagnostic RPC failure must preserve the original timeout message");
  assert.equal(JSON.stringify(capture).includes(TIMEOUT_DIAGNOSTIC_CANARY), false, "diagnostic RPC failure must not retain its raw error body");
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readRouteFixture(options) {
  const inspection = readJsonFile(options.routeInspectionInput);
  const descriptor = readJsonFile(options.routeTaskDescriptor);
  const projectRoot = path.resolve(inspection.projectRoot);
  const sourceDescriptor = inspection.artifacts?.sourceFingerprints?.path;
  assert.ok(sourceDescriptor, "host route fixture must name the source fingerprint artifact");
  const sourceFingerprints = readJsonFile(path.resolve(projectRoot, sourceDescriptor));
  const native = inspection.native?.steps?.initial;
  assert.ok(native, "host route fixture must expose the initial native step");
  const rootEvent = (native.tool_events ?? []).find((event) => event.root_session_id || event.host_observation?.root_session_id);
  const rootSession = rootEvent?.root_session_id ?? rootEvent?.host_observation?.root_session_id;
  const rootPrompt = rootEvent?.host_observation?.root_prompt?.request_id;
  const lifecycle = (native.subagent_frames ?? []).find((frame) => frame.frame_type === "subagent_lifecycle" && frame.status === "started");
  const taskRecord = (native.task_records ?? []).find((record) => record.assignment_id === inspection.definition?.assignment?.initial);
  assert.ok(rootSession, "host route fixture must expose the host-observed Root session");
  assert.ok(rootPrompt, "host route fixture must expose the host-observed Root prompt request");
  assert.ok(lifecycle, "host route fixture must expose the started project lifecycle frame");
  assert.ok(taskRecord, "host route fixture must expose the requirements-reader terminal record");
  return {
    inspection,
    descriptor,
    projectRoot,
    sourceFingerprints,
    native,
    rootSession,
    rootPrompt,
    lifecycle,
    taskRecord,
    reads: Array.isArray(native.subagent_reads) ? native.subagent_reads : [],
  };
}
function currentRouteControlDefinition(apis, observedDefinition) {
  const binding = observedDefinition.binding;
  const definitions = apis.route.buildRouteCases({
    runId: binding.run_id,
    revision: binding.revision,
    nonce: binding.nonce,
  });
  const current = definitions.find((definition) => definition.id === observedDefinition.id);
  assert.ok(current, "current route builder must expose the observed Native14 case identity");
  assert.deepEqual(
    {
      id: current.id,
      run_id: current.binding.run_id,
      revision: current.binding.revision,
      nonce: current.binding.nonce,
    },
    {
      id: observedDefinition.id,
      run_id: binding.run_id,
      revision: binding.revision,
      nonce: binding.nonce,
    },
    "current control definition must preserve the host fixture case identity and binding",
  );
  return current;
}


function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}
function freezeDeep(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeDeep(child, seen);
  return Object.freeze(value);
}

function relocateFixturePaths(value, originalRoot, ownedRoot) {
  const original = path.resolve(originalRoot);
  const owned = path.resolve(ownedRoot);
  const originalSlash = original.replaceAll("\\", "/");
  const ownedSlash = owned.replaceAll("\\", "/");
  if (typeof value === "string") {
    return value
      .split(original).join(owned)
      .split(originalSlash).join(ownedSlash);
  }
  if (Array.isArray(value)) {
    return value.map((item) => relocateFixturePaths(item, originalRoot, ownedRoot));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      relocateFixturePaths(child, originalRoot, ownedRoot),
    ]));
  }
  return value;
}

function refreshRelocatedHelperCommandHashes(native) {
  const policy = native?.steps?.initial?.root_write_policy?.rootCommandPolicy;
  if (!policy || typeof policy.command !== "string") return;
  const commandSha = createHash("sha256").update(policy.command).digest("hex");
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (value.host_policy_binding?.kind === "alignment-lab-checkpoint-helper-v1") {
      value.host_policy_binding.command_sha256 = commandSha;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(native);
}

function copyCurrentAlignmentSources(ownedProjectRoot) {
  return CURRENT_ALIGNMENT_SOURCE_FILES.map(({ source, overlay }) => {
    const sourceFile = path.join(REPO_ROOT, source);
    const overlayFile = path.join(ownedProjectRoot, overlay);
    fs.mkdirSync(path.dirname(overlayFile), { recursive: true });
    fs.copyFileSync(sourceFile, overlayFile);
    const bytes = fs.readFileSync(overlayFile);
    return {
      path: source,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
}

function prepareSourceControlledRouteFixture(apis, actualFixture, root) {
  const ownedProjectRoot = fs.mkdtempSync(path.join(root, "source-controlled-route-"));
  fs.cpSync(actualFixture.projectRoot, ownedProjectRoot, { recursive: true });
  const inspection = cloneValue(actualFixture.inspection);
  const originalRoot = actualFixture.projectRoot;
  const nativeEnvelope = relocateFixturePaths(inspection.native, originalRoot, ownedProjectRoot);
  refreshRelocatedHelperCommandHashes(nativeEnvelope);
  inspection.native = nativeEnvelope;
  const native = nativeEnvelope.steps?.initial ?? nativeEnvelope;
  inspection.projectRoot = ownedProjectRoot;
  const replaceExactValue = (value, before, after) => {
    if (Array.isArray(value)) {
      for (const child of value) replaceExactValue(child, before, after);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (child === before) value[key] = after;
      else replaceExactValue(child, before, after);
    }
  };
  for (const key of ["checkpointInitial", "checkpointResume"]) {
    const checkpointDescriptor = inspection.artifacts[key];
    if (!checkpointDescriptor) continue;
    const checkpointRecord = checkpointDescriptor.record;
    assert.ok(
      checkpointDescriptor.path && checkpointRecord?.request_id && checkpointRecord?.run_id,
      `source-controlled ${inspection.definition.id} fixture must expose its protected ${key} checkpoint`,
    );
    const originalCheckpoint = path.resolve(originalRoot, checkpointDescriptor.path);
    const checkpointRelative = path.join(
      ".omp",
      "state",
      "alignment",
      checkpointRecord.request_id,
      checkpointRecord.run_id,
      path.basename(checkpointDescriptor.path),
    );
    const ownedCheckpoint = path.join(ownedProjectRoot, checkpointRelative);
    fs.mkdirSync(path.dirname(ownedCheckpoint), { recursive: true });
    const originalBytes = fs.readFileSync(originalCheckpoint);
    const relocatedRecord = relocateFixturePaths(JSON.parse(originalBytes.toString("utf8")), originalRoot, ownedProjectRoot);
    const relocatedBytes = Buffer.from(`${JSON.stringify(relocatedRecord, null, 2)}\n`, "utf8");
    const originalSha = createHash("sha256").update(originalBytes).digest("hex");
    const relocatedSha = createHash("sha256").update(relocatedBytes).digest("hex");
    fs.writeFileSync(ownedCheckpoint, relocatedBytes);
    checkpointDescriptor.record = relocatedRecord;
    checkpointDescriptor.sha256 = relocatedSha;
    if (Object.hasOwn(checkpointDescriptor, "bytes")) checkpointDescriptor.bytes = relocatedBytes.byteLength;
    if (originalSha !== relocatedSha) replaceExactValue(nativeEnvelope, originalSha, relocatedSha);
    checkpointDescriptor.path = checkpointRelative.replaceAll("\\", "/");
  }
  const sourceArtifactPath = path.join(ownedProjectRoot, ".omp/state/native-route/alignment-sources.json");
  const sourceArtifact = readJsonFile(sourceArtifactPath);
  sourceArtifact.sources = copyCurrentAlignmentSources(ownedProjectRoot);
  fs.writeFileSync(sourceArtifactPath, `${JSON.stringify(sourceArtifact, null, 2)}\n`, "utf8");
  const sourceArtifactBytes = fs.readFileSync(sourceArtifactPath);
  inspection.artifacts.sourceFingerprints = {
    path: ".omp/state/native-route/alignment-sources.json",
    bytes: sourceArtifactBytes.byteLength,
    sha256: createHash("sha256").update(sourceArtifactBytes).digest("hex"),
  };

  const binding = inspection.definition.binding;
  const canonicalDefinition = apis.route.buildRouteCases({
    runId: binding.run_id,
    revision: binding.revision,
    nonce: binding.nonce,
  }).find((definition) => definition.id === inspection.definition.id);
  assert.ok(canonicalDefinition, "Native19 SHORT_LOCAL fixture must map to a current route definition");
  inspection.definition = canonicalDefinition;
  native.source_controlled_fixture = true;
  inspection.source_controlled_fixture = true;
  fs.writeFileSync(
    path.join(ownedProjectRoot, ".omp/state/native-route/inspection-input.json"),
    `${JSON.stringify(inspection, null, 2)}\n`,
    "utf8",
  );

  const rootEvent = (native.tool_events ?? []).find((event) => event.root_session_id || event.host_observation?.root_session_id);
  const lifecycle = (native.subagent_frames ?? []).find((frame) => frame.frame_type === "subagent_lifecycle" && frame.status === "started");
  const taskRecord = (native.task_records ?? []).find((record) => record.assignment_id === inspection.definition.assignment.initial);
  return {
    ...actualFixture,
    inspection,
    descriptor: readJsonFile(path.join(ownedProjectRoot, ".omp/state/native-route/task-initial.json")),
    projectRoot: ownedProjectRoot,
    sourceFingerprints: sourceArtifact,
    native,
    rootSession: rootEvent?.root_session_id ?? rootEvent?.host_observation?.root_session_id,
    rootPrompt: rootEvent?.host_observation?.root_prompt?.request_id,
    lifecycle,
    taskRecord,
    reads: Array.isArray(native.subagent_reads) ? native.subagent_reads : [],
    source_only: true,
    native_execution: false,
    source_controlled_fixture: {
      source_only: true,
      native_execution: false,
      acceptance_scope: "fixture-only",
      source_scope: "current-six-alignment-sources",
    },
  };
}

function fullSiblingRouteFixture(actualFixture) {
  const fullProjectRoot = path.join(path.dirname(actualFixture.projectRoot), "route-local-full");
  const routeInspectionInput = path.join(fullProjectRoot, ".omp", "state", "native-route", "inspection-input.json");
  const routeTaskDescriptor = path.join(fullProjectRoot, ".omp", "state", "native-route", "task-initial.json");
  assert.ok(fs.existsSync(routeInspectionInput), "the supplied immutable positive route fixture must have a sibling FULL_LOCAL inspection input");
  assert.ok(fs.existsSync(routeTaskDescriptor), "the supplied immutable positive FULL_LOCAL fixture must have its task descriptor");
  return readRouteFixture({ routeInspectionInput, routeTaskDescriptor });
}
function routeResult(apis, fixture, native = fixture.inspection.native ?? fixture.native) {
  return apis.route.inspectRouteCase({
    definition: fixture.inspection.definition,
    projectRoot: fixture.projectRoot,
    native,
    artifacts: fixture.inspection.artifacts,
  });
}
function routeResultWithInitialStep(apis, fixture, initial) {
  const nativeEnvelope = cloneValue(fixture.inspection.native);
  assert.ok(nativeEnvelope?.steps?.initial, "current source-controlled fixture must expose its initial native step");
  nativeEnvelope.steps.initial = initial;
  return routeResult(apis, fixture, nativeEnvelope);
}

function routeCheck(result, id) {
  return result.checks.find((check) => check.id === id);
}

function routeCheckProblems(check) {
  if (Array.isArray(check?.problems)) return check.problems;
  if (Array.isArray(check?.details?.problems)) return check.details.problems;
  return [];
}

async function actualNativeCaptureAddsTrustedOriginBeforeRouteConsumer(apis, fixture, root, fullFixture) {
  assert.equal(fixture.source_only, true, "the positive route fixture must remain explicitly source-only");
  assert.equal(fixture.native_execution, false, "the positive route fixture must not claim a Native execution");
  assert.equal(fixture.native.source_controlled_fixture, true, "the controlled capture must retain its source-only marker");
  const controlledCapture = cloneValue(fixture.native);
  delete controlledCapture.native;
  delete controlledCapture.evidence_level;
  delete controlledCapture.origin;
  const witnessedCapture = freezeDeep(controlledCapture);
  assert.equal(Object.hasOwn(witnessedCapture, "native"), false, "the controlled execute result must not pre-supply Native authority");
  assert.equal(Object.hasOwn(witnessedCapture, "evidence_level"), false, "the producer must supply the evidence level");
  assert.equal(Object.hasOwn(witnessedCapture, "origin"), false, "the producer must supply the trusted origin");
  const originalExecute = apis.NativeRpcSession.prototype.execute;
  let executeCalls = 0;
  apis.NativeRpcSession.prototype.execute = async function controlledSourceRouteExecute() {
    executeCalls += 1;
    return witnessedCapture;
  };
  try {
    const actualCapture = await apis.executeNativeCapture(
      {
        native: true,
        omp: path.join(root, "must-not-start-native.exe"),
        timeoutMs: 1_000,
      },
      {
        project: root,
        logicalRunId: fixture.native.logical_run_id ?? fixture.inspection.definition.binding.run_id,
      },
      [],
      "source-controlled-native-origin",
      "controlled source-only host-origin route witness",
    );
    assert.equal(executeCalls, 1, "the successful source-controlled capture must use the controlled real NativeRpcSession.execute seam exactly once");
    assert.equal(actualCapture.source_controlled_fixture, true, "source-controlled test metadata must remain explicit and separate from SDK provenance");
    assert.equal(actualCapture.native, true, "a successful actual capture must explicitly carry native:true before route inspection");
    assert.equal(actualCapture.evidence_level, "native-omp-rpc-actions-and-profile-schemas", "the actual capture must retain the authenticated Native evidence level");
    assert.equal(actualCapture.origin?.kind, "host-observed-native-rpc", "the actual capture must retain its host-observed origin");
    assert.equal(actualCapture.origin?.native_rpc, true, "the actual capture must retain the Native RPC origin marker");
    assert.equal(actualCapture.origin?.source_binding, true, "the actual capture must retain source binding");
    assert.equal(actualCapture.origin?.process_count, 1, "the actual capture must retain the observed Native process count");

    const bridgedRouteNative = cloneValue(fixture.native);
    Object.assign(bridgedRouteNative, {
      native: actualCapture.native,
      evidence_level: actualCapture.evidence_level,
      native_process_count: actualCapture.native_process_count ?? actualCapture.origin?.process_count,
      origin: cloneValue(actualCapture.origin),
      source_controlled_fixture: actualCapture.source_controlled_fixture,
    });
    const routed = routeResultWithInitialStep(apis, fixture, bridgedRouteNative);
    assert.equal(routed.status, "PASS", `the current complete source-controlled route must pass every consumer check: missing=${JSON.stringify(routed.missing)} failures=${JSON.stringify(routed.failures)}`);
    assert.equal(routed.native, true, "the current complete source-controlled route must be accepted as Native under this fixture-only seam");
    assert.equal(routed.evidence_level, AUTHENTIC_ROUTE_EVIDENCE_LEVEL, "the positive route must expose the authentic route evidence level");
    assert.equal(routed.case, "SHORT_LOCAL", "the route producer must expose its canonical case identity");
    assert.equal(Object.hasOwn(routed, "id"), false, "the route producer must not expose the obsolete id identity");
    assert.equal(routed.missing.length, 0, "the positive route must have no missing consumer evidence");
    assert.equal(routed.failures.length, 0, "the positive route must have no consumer failures");
    assert.ok(routed.checks.length > 0 && routed.checks.every((check) => check.status === "PASS"), "the positive route must report PASS for every real consumer check");

    const fullRouted = routeResult(apis, fullFixture);
    assert.equal(fullRouted.status, "PASS", `the current complete source-controlled FULL_LOCAL route must pass every consumer check: missing=${JSON.stringify(fullRouted.missing)} failures=${JSON.stringify(fullRouted.failures)}`);
    assert.equal(fullRouted.native, true, "the current complete source-controlled FULL_LOCAL route must be accepted as Native under this fixture-only seam");
    assert.equal(fullRouted.case, "FULL_LOCAL", "the FULL_LOCAL producer must expose its canonical case identity");
    assert.equal(fullRouted.evidence_level, AUTHENTIC_ROUTE_EVIDENCE_LEVEL, "the FULL_LOCAL route must expose the authentic route evidence level");
    assert.equal(Object.hasOwn(fullRouted, "id"), false, "the FULL_LOCAL route producer must not expose the obsolete id identity");
    assert.equal(fullRouted.missing.length, 0, "the FULL_LOCAL route must have no missing consumer evidence");
    assert.equal(fullRouted.failures.length, 0, "the FULL_LOCAL route must have no consumer failures");

    const canonicalRoutes = [routed, fullRouted];
    const evaluate = (routes) => apis.evaluateLifecycle(
      {},
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      routes,
    );
    const lifecycle = evaluate(canonicalRoutes);
    assert.equal(lifecycle.phases.SHORT.status, "PASS", "the final lifecycle evaluator must bind SHORT_LOCAL by the canonical route case");
    assert.equal(lifecycle.phases.FULL.status, "PASS", "the final lifecycle evaluator must bind FULL_LOCAL by the canonical route case");
    assert.equal(lifecycle.phases.LOCAL.status, "PASS", "the final lifecycle evaluator must mark LOCAL PASS only after both canonical local route cases pass");
    assert.equal(lifecycle.status, "PENDING_NATIVE", "partial source-controlled route evidence must not promote the overall lifecycle");
    for (const phase of ["EXTERNAL", "DOC", "REVIEW", "VALIDATE", "RETRO_OWNER", "RETRO_OPT_OUT", "FAILURE", "RESUME"]) {
      assert.equal(lifecycle.phases[phase].status, "PENDING_NATIVE", `unprovided ${phase} evidence must remain pending`);
    }

    const invalidRouteVariants = [
      ["native:false", (candidate) => { candidate.native = false; }],
      ["missing native flag", (candidate) => { delete candidate.native; }],
      ["non-PASS status", (candidate) => { candidate.status = "PENDING"; }],
      ["failure status", (candidate) => { candidate.status = "FAIL"; candidate.failures = [{ id: "synthetic.failure" }]; }],
      ["foreign case", (candidate) => { candidate.case = "SHORT_GIT"; }],
      ["missing canonical case", (candidate) => { delete candidate.case; }],
      ["duplicate legacy identity without canonical case", (candidate) => { delete candidate.case; candidate.id = "SHORT_LOCAL"; }],
    ];
    for (const [label, mutate] of invalidRouteVariants) {
      const candidates = canonicalRoutes.map((route) => cloneValue(route));
      mutate(candidates[0]);
      const invalidLifecycle = evaluate(candidates);
      assert.notEqual(invalidLifecycle.phases.SHORT.status, "PASS", `${label} must not promote SHORT`);
      assert.notEqual(invalidLifecycle.phases.LOCAL.status, "PASS", `${label} must not promote LOCAL`);
      assert.equal(invalidLifecycle.phases.FULL.status, "PASS", `${label} must not corrupt the independent FULL route`);
      assert.equal(invalidLifecycle.status, "PENDING_NATIVE", `${label} must leave the overall lifecycle pending`);
    }
  } finally {
    apis.NativeRpcSession.prototype.execute = originalExecute;
  }
}

function assertSourceControlledNativeFlagRejectsPromotion(apis, fixture, mutate, label) {
  const candidate = cloneValue(fixture.native);
  mutate(candidate);
  assert.equal(candidate.source_controlled_fixture, true, `${label} must preserve the source-only fixture marker`);
  const routed = routeResultWithInitialStep(apis, fixture, candidate);
  assert.equal(routed.status, "PASS", `${label} must remain otherwise valid for the real route consumer: missing=${JSON.stringify(routed.missing)} failures=${JSON.stringify(routed.failures)}`);
  assert.equal(routed.native, false, `${label} must not promote the route to Native`);
  assert.equal(routed.evidence_level, "SOURCE_DERIVED_OFFLINE_CONSUMER_ONLY", `${label} must remain fixture-only evidence`);
  assert.equal(routed.missing.length, 0, `${label} must not introduce missing consumer evidence`);
  assert.equal(routed.failures.length, 0, `${label} must not introduce consumer failures`);
  assert.ok(routed.checks.length > 0 && routed.checks.every((check) => check.status === "PASS"), `${label} must preserve every non-origin route check`);
}

function sourceControlledMissingNativeFlagStaysNonNative(apis, fixture) {
  assertSourceControlledNativeFlagRejectsPromotion(
    apis,
    fixture,
    (candidate) => {
      assert.equal(Object.hasOwn(candidate, "native"), true, "the current positive fixture must expose its native flag before the missing-flag mutation");
      delete candidate.native;
    },
    "a missing native flag",
  );
}

function sourceControlledExplicitNonNativeFlagStaysNonNative(apis, fixture) {
  assertSourceControlledNativeFlagRejectsPromotion(
    apis,
    fixture,
    (candidate) => {
      candidate.native = false;
    },
    "an explicit native:false flag",
  );
}

async function nativeCaptureReceiptPreservesFullOperationalCollections(apis, root) {
  const recordCount = PENDING_OBSERVATION_LIMIT / 2;
  assert.ok(recordCount > 96, "the serializer regression must exercise more than the generic display-array limit");
  const expectedToolEvents = Array.from({ length: recordCount }, (_, index) => ({
    type: "tool_execution_end",
    tool: "read",
    tool_call_id: `serializer-tool-read|${index}`,
    status: "completed",
    isError: false,
    success: true,
    terminal: false,
    host_arrival_ordinal: 1_000 + index,
    host_workflow_ordinal: 2_000 + index,
    metadata: {
      source: "host-rpc",
      retained: true,
      ordinal: index,
    },
    secret_token: `tool-secret-${index}`,
  }));
  expectedToolEvents[recordCount - 1] = {
    ...expectedToolEvents[recordCount - 1],
    late_critical: true,
    proof: { kind: "late-critical-tool", accepted: true },
  };
  const expectedReads = Array.from({ length: recordCount }, (_, index) => ({
    type: "subagent_read",
    tool: "read",
    tool_call_id: `serializer-subagent-read|${index}`,
    agent: "requirements-reader",
    agentSource: "project",
    allocated_id: "serializer-allocated|full",
    parent_tool_call_id: "serializer-parent|full",
    index,
    status: "completed",
    isError: false,
    success: true,
    host_arrival_ordinal: 3_000 + index,
    host_workflow_ordinal: 4_000 + index,
    source_files: [{
      path: `.omp/state/native-serializer/read-${index}.md`,
      bytes: 100 + index,
      sha256: "a".repeat(64),
    }],
    metadata: {
      source: "host-rpc",
      retained: true,
      ordinal: index,
    },
    secret_token: `read-secret-${index}`,
  }));
  expectedReads[recordCount - 1] = {
    ...expectedReads[recordCount - 1],
    late_critical: true,
    proof: { kind: "late-critical-read", accepted: true },
  };

  const logicalRunId = `source-serializer-${path.basename(root)}`;
  const witnessedCapture = freezeDeep({
    status: "PASS",
    logical_run_id: logicalRunId,
    root_session: { session_id: "serializer-root-session" },
    root_prompt: { request_id: "serializer-root-prompt" },
    tool_events: expectedToolEvents,
    subagent_reads: expectedReads,
    sensitive_token: "serializer-top-level-secret",
    terminal: { completed: false, isError: false, exitCode: null },
  });
  const originalExecute = apis.NativeRpcSession.prototype.execute;
  let executeCalls = 0;
  apis.NativeRpcSession.prototype.execute = async function controlledSerializerExecute() {
    executeCalls += 1;
    return witnessedCapture;
  };
  try {
    const actualCapture = await apis.executeNativeCapture(
      {
        native: true,
        omp: path.join(root, "must-not-start-native.exe"),
        timeoutMs: 1_000,
      },
      { project: root, logicalRunId },
      [],
      "capture-serializer-full",
      "controlled source-only serializer witness",
    );
    assert.equal(executeCalls, 1, "the serializer regression must use the controlled real NativeRpcSession.execute seam exactly once");
    const receipt = actualCapture.capture_receipt;
    assert.ok(receipt?.path && Number.isSafeInteger(receipt.bytes) && typeof receipt.sha256 === "string", "the successful capture must expose its serialized capture receipt");
    assert.ok(receipt.bytes <= MAX_CAPTURE_BYTES, "the full operational receipt must remain below the unchanged physical capture bound");
    const receiptPath = path.resolve(root, receipt.path);
    const receiptBytes = fs.readFileSync(receiptPath);
    assert.equal(receiptBytes.byteLength, receipt.bytes, "the capture receipt byte descriptor must match the persisted JSON");
    assert.equal(createHash("sha256").update(receiptBytes).digest("hex"), receipt.sha256, "the capture receipt hash must match the persisted JSON");
    const persisted = JSON.parse(receiptBytes.toString("utf8"));

    assert.equal(persisted.tool_events.length, recordCount, "the capture receipt must retain every operational tool event beyond the generic 96-item display limit");
    assert.deepEqual(
      persisted.tool_events.map((event) => ({
        tool_call_id: event.tool_call_id,
        status: event.status,
        isError: event.isError,
        success: event.success,
        terminal: event.terminal,
        host_arrival_ordinal: event.host_arrival_ordinal,
        host_workflow_ordinal: event.host_workflow_ordinal,
        metadata: event.metadata,
      })),
      expectedToolEvents.map((event) => ({
        tool_call_id: event.tool_call_id,
        status: event.status,
        isError: event.isError,
        success: event.success,
        terminal: event.terminal,
        host_arrival_ordinal: event.host_arrival_ordinal,
        host_workflow_ordinal: event.host_workflow_ordinal,
        metadata: event.metadata,
      })),
      "every operational tool event must retain its metadata, booleans, and host provenance in order",
    );
    assert.equal(persisted.tool_events.every((event) => event.secret_token === "<redacted>"), true, "sensitive tool-event fields must remain redacted while operational metadata is retained");
    assert.equal(persisted.tool_events.at(-1)?.late_critical, true, "the late critical tool event must survive receipt serialization");
    assert.deepEqual(persisted.tool_events.at(-1)?.proof, { kind: "late-critical-tool", accepted: true }, "the late critical tool proof must survive receipt serialization");

    assert.equal(persisted.subagent_reads.length, recordCount, "the capture receipt must retain every operational read record beyond the generic 96-item display limit");
    assert.deepEqual(
      persisted.subagent_reads.map((record) => ({
        tool_call_id: record.tool_call_id,
        agent: record.agent,
        agentSource: record.agentSource,
        allocated_id: record.allocated_id,
        parent_tool_call_id: record.parent_tool_call_id,
        index: record.index,
        status: record.status,
        isError: record.isError,
        success: record.success,
        host_arrival_ordinal: record.host_arrival_ordinal,
        host_workflow_ordinal: record.host_workflow_ordinal,
        source_files: record.source_files,
        metadata: record.metadata,
      })),
      expectedReads.map((record) => ({
        tool_call_id: record.tool_call_id,
        agent: record.agent,
        agentSource: record.agentSource,
        allocated_id: record.allocated_id,
        parent_tool_call_id: record.parent_tool_call_id,
        index: record.index,
        status: record.status,
        isError: record.isError,
        success: record.success,
        host_arrival_ordinal: record.host_arrival_ordinal,
        host_workflow_ordinal: record.host_workflow_ordinal,
        source_files: record.source_files,
        metadata: record.metadata,
      })),
      "every operational read record must retain its full lifecycle tuple, source hashes, booleans, metadata, and host provenance in order",
    );
    assert.equal(persisted.subagent_reads.every((record) => record.secret_token === "<redacted>"), true, "sensitive read fields must remain redacted while read provenance is retained");
    assert.equal(persisted.subagent_reads.at(-1)?.late_critical, true, "the late critical read record must survive receipt serialization");
    assert.deepEqual(persisted.subagent_reads.at(-1)?.proof, { kind: "late-critical-read", accepted: true }, "the late critical read proof must survive receipt serialization");
    assert.equal(persisted.sensitive_token, "<redacted>", "top-level sensitive capture fields must remain redacted");
    assert.equal(persisted.terminal.completed, false, "terminal booleans must remain explicit in the serialized capture");
    assert.equal(persisted.terminal.isError, false, "terminal error booleans must remain explicit in the serialized capture");
    assert.equal(persisted.terminal.exitCode, null, "terminal exit metadata must remain explicit in the serialized capture");
  } finally {
    apis.NativeRpcSession.prototype.execute = originalExecute;
  }
}

async function oversizedNativeCaptureFailsClosedBeforePublication(apis, root) {
  const recordCount = 5_000;
  const operationalText = "O".repeat(4_000);
  const oversizedToolEvents = Array.from({ length: recordCount }, (_, index) => ({
    type: "tool_execution_end",
    tool: "read",
    tool_call_id: `serializer-oversize|${index}`,
    status: "completed",
    isError: false,
    success: true,
    host_arrival_ordinal: 10_000 + index,
    host_workflow_ordinal: 20_000 + index,
    metadata: { operational_text: operationalText, ordinal: index },
    secret_token: "oversized-secret",
  }));
  const logicalRunId = `source-serializer-oversize-${path.basename(root)}`;
  const witnessedCapture = freezeDeep({
    status: "PASS",
    logical_run_id: logicalRunId,
    tool_events: oversizedToolEvents,
    sensitive_token: "oversized-top-level-secret",
  });
  const originalExecute = apis.NativeRpcSession.prototype.execute;
  let executeCalls = 0;
  apis.NativeRpcSession.prototype.execute = async function controlledOversizedSerializerExecute() {
    executeCalls += 1;
    return witnessedCapture;
  };
  try {
    const actualCapture = await apis.executeNativeCapture(
      {
        native: true,
        omp: path.join(root, "must-not-start-native.exe"),
        timeoutMs: 1_000,
      },
      { project: root, logicalRunId },
      [],
      "capture-serializer-oversize",
      "controlled source-only oversized serializer witness",
    );
    assert.equal(executeCalls, 1, "the oversized serializer regression must use the controlled real NativeRpcSession.execute seam exactly once");
    assert.notEqual(actualCapture.status, "PASS", "an oversized operational capture must not publish a successful status");
    assert.notEqual(actualCapture.native, true, "an oversized operational capture must not be classified as Native");
    assert.equal(actualCapture.failure?.kind, "BLOCKED", "an oversized operational capture must fail closed with the bounded BLOCKED guard");
    assert.equal(actualCapture.failure?.reason_code, "CAPTURE_BOUND", "an oversized operational capture must report the capture-bound reason");

    const receipt = actualCapture.capture_receipt;
    if (receipt) {
      assert.ok(receipt.path && Number.isSafeInteger(receipt.bytes) && typeof receipt.sha256 === "string", "any oversized diagnostic receipt must remain structurally bounded");
      assert.ok(receipt.bytes <= MAX_CAPTURE_BYTES, "any oversized diagnostic receipt must remain below the unchanged 16 MiB physical bound");
      const receiptBytes = fs.readFileSync(path.resolve(root, receipt.path));
      assert.ok(receiptBytes.byteLength <= MAX_CAPTURE_BYTES, "any oversized diagnostic receipt bytes must remain below the unchanged 16 MiB physical bound");
      const persisted = JSON.parse(receiptBytes.toString("utf8"));
      assert.notEqual(persisted.native, true, "an oversized diagnostic receipt must not carry a Native success claim");
      assert.ok(!Array.isArray(persisted.tool_events) || persisted.tool_events.length < recordCount, "an oversized diagnostic receipt must not publish the full oversized operational collection");
    }
  } finally {
    apis.NativeRpcSession.prototype.execute = originalExecute;
  }
}


function readSourcePath(receipt) {
  return receipt?.source_files?.[0]?.path ?? null;
}

function assertHostObservedPrivateSource(projectRoot, row) {
  assert.ok(row?.path, "host source binding must expose a project-relative path");
  const bytes = fs.readFileSync(path.resolve(projectRoot, row.path));
  assert.equal(bytes.byteLength, row.bytes, `host source binding byte count must match ${row.path}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), String(row.sha256).toLowerCase(), `host source binding SHA-256 must match ${row.path}`);
}
function sourceOnlyReaderPaths(fixture) {
  return [
    fixture.inspection.artifacts.taskInitial.path,
    ...fixture.inspection.definition.requiredReads.requirements_reader,
  ];
}

function currentReaderSourceControl(fixture) {
  const reader_sources = fixture.inspection.definition.requiredReads.requirements_reader.map((relativePath) => {
    const bytes = fs.readFileSync(path.resolve(fixture.projectRoot, relativePath));
    return {
      path: relativePath,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  const control = cloneValue(fixture.sourceFingerprints);
  control.reader_sources = reader_sources;
  control.reader_context = {
    run_id: control.run_id,
    source_revision: control.revision,
    context_digest: createHash("sha256")
      .update(JSON.stringify({ run_id: control.run_id, revision: control.revision, nonce: control.nonce, sources: reader_sources }))
      .digest("hex"),
  };
  return control;
}


function hostDescriptorUsesEveryReaderSource(apis, fixture) {
  const sourceControl = currentReaderSourceControl(fixture);
  for (const row of sourceControl.reader_sources) assertHostObservedPrivateSource(fixture.projectRoot, row);
  const built = apis.route.buildRouteTaskDescriptor(fixture.inspection.definition, "initial", sourceControl);
  assert.equal(fixture.descriptor.assignment_id, fixture.inspection.definition.assignment.initial, "host task-initial descriptor must retain the observed assignment identity");
  assert.deepEqual(
    built.required_reads,
    fixture.inspection.definition.requiredReads.requirements_reader,
    "current descriptor construction must preserve the current required reader path list",
  );
  assert.deepEqual(
    built.source_fingerprints,
    sourceControl.reader_sources,
    "route descriptor construction must carry host-observed hashes for every required reader file",
  );
  assert.equal(built.source_fingerprints.length, fixture.inspection.definition.requiredReads.requirements_reader.length, "descriptor reader fingerprints must cover the complete current required-read list");
  assert.equal(sourceControl.sources.length, 6, "the six alignment source scope must remain separate from current reader sources");
}

function canonicalReadingTagIsCallerDerived(apis, fixture) {
  const assignment = fixture.taskRecord.assignment_id;
  const canonicalTag = `${fixture.rootSession}:${assignment}`;
  const accepted = routeCheck(routeResult(apis, fixture), "initial.requirements-reader.instance");
  assert.equal(accepted?.status, "PASS", "caller-derived Root-session:assignment tag must pass the route consumer instance check");
  for (const [label, tag] of [
    ["slash-delimited", `${fixture.rootSession}/${assignment}`],
    ["opaque-child-id", fixture.taskRecord.id],
  ]) {
    const native = cloneValue(fixture.native);
    const record = native.task_records.find((item) => item.assignment_id === assignment);
    assert.ok(record, `${label} tag regression must retain the actual host terminal record`);
    record.structured_data = { ...cloneValue(record.structured_data ?? {}), instance_id: tag };
    const check = routeCheck(routeResult(apis, fixture, native), "initial.requirements-reader.instance");
    assert.notEqual(check?.status, "PASS", `${label} reading tag must be rejected by the route consumer`);
  }
  assert.equal(fixture.taskRecord.structured_data?.instance_id, canonicalTag, "the host fixture must provide the caller-derived canonical tag");
}

function actualReadReceiptsAccountForProfileAndModelPolicy(apis, fixture) {
  const sourceControl = currentReaderSourceControl(fixture);
  for (const row of sourceControl.reader_sources) assertHostObservedPrivateSource(fixture.projectRoot, row);
  assert.deepEqual(sourceControl.sources, fixture.sourceFingerprints.sources, "alignment source scope must remain separate while reader sources are rebuilt from host bytes");
  const rootProfileEvent = fixture.native.tool_events.find((event) => event.source_files?.some((row) => row.path === DEFAULT_ROUTE_ROOT_PROFILE_READ));
  assert.ok(rootProfileEvent, `Root required reads must include the explicit profile path: ${DEFAULT_ROUTE_ROOT_PROFILE_READ}`);
  assertHostObservedPrivateSource(
    fixture.projectRoot,
    rootProfileEvent.source_files.find((row) => row.path === DEFAULT_ROUTE_ROOT_PROFILE_READ),
  );
  const observed = new Set(fixture.reads.flatMap((receipt) => receipt.source_files?.map((row) => row.path) ?? []));
  for (const extra of DEFAULT_ROUTE_EXTRA_READS) {
    assert.ok(observed.has(extra), `legitimate required read must be accounted for explicitly: ${extra}`);
    const receipt = fixture.reads.find((item) => item.source_files?.some((row) => row.path === extra));
    const source = receipt?.source_files?.find((row) => row.path === extra);
    assertHostObservedPrivateSource(fixture.projectRoot, source);
  }
  const session = recordSourceOnlyRequiredReadEnds(apis, fixture);
  const result = routeResult(apis, fixture, routeNativeWithReads(fixture, session.evidence.subagent_reads));
  const check = routeCheck(result, "initial.requirements-reader.read-source-files");
  assert.ok(check, "route consumer must evaluate actual read END source files");
  assert.equal(check.status, "PASS", "complete legitimate profile/model-policy reads must pass the route consumer read-source-files check");
  const problems = routeCheckProblems(check);
  for (const extra of DEFAULT_ROUTE_EXTRA_READS) {
    assert.equal(
      problems.some((problem) => problem.path === extra && problem.reason === "read END source_files contains a foreign path"),
      false,
      `legitimate profile/model-policy read must not be rejected as a foreign path: ${extra}`,
    );
  }
}

function hostTuple(fixture) {
  return {
    root_session_id: fixture.rootSession,
    agent: fixture.lifecycle.agent,
    agentSource: fixture.lifecycle.agentSource,
    job_id: fixture.lifecycle.job_id,
    instance_id: fixture.lifecycle.instance_id,
    allocated_id: fixture.lifecycle.allocated_id,
    parent_tool_call_id: fixture.lifecycle.parent_tool_call_id,
    index: fixture.lifecycle.index,
  };
}

function hostStateResponseForRoute(fixture) {
  return {
    type: "response",
    command: "get_state",
    id: fixture.rootPrompt,
    success: true,
    data: { sessionId: fixture.rootSession },
  };
}

function createHostRouteSession(apis, fixture) {
  const assignmentItem = fixture.inspection.definition.steps.initial.task;
  const session = new apis.NativeRpcSession({
    omp: "offline-probe",
    cwd: fixture.projectRoot,
    timeoutMs: 1_000,
    assignments: [assignmentItem],
    logicalRunId: fixture.inspection.definition.binding.run_id,
    label: "native-host-route-reader-boundary",
  });
  session.bindSourceHost(hostStateResponseForRoute(fixture), fixture.rootPrompt, fixture.rootPrompt);
  const rootCall = fixture.lifecycle.parent_tool_call_id;
  const rootJob = fixture.native.root_task_ends?.[0]?.async?.jobId ?? fixture.taskRecord.jobId;
  session.recordTool(rootStart(rootCall, [assignmentItem]));
  session.recordTool(rootEnd(rootCall, rootJob, [progressRow(assignmentItem, fixture.lifecycle.id)]));
  session.consumeLogical(lifecycleFrame({
    id: fixture.lifecycle.id,
    index: fixture.lifecycle.index,
    agent: fixture.lifecycle.agent,
    agentSource: fixture.lifecycle.agentSource,
    parentToolCallId: fixture.lifecycle.parent_tool_call_id,
    status: "started",
  }));
  return session;
}

function recordActualHostReadEnds(apis, fixture) {
  const session = createHostRouteSession(apis, fixture);
  for (const [index, receipt] of fixture.reads.entries()) {
    const relativePath = readSourcePath(receipt);
    assert.ok(relativePath, `host read receipt ${index} must expose its actual source path`);
    assert.ok(receipt.tool_call_id, `host read receipt ${index} must expose its actual tool call ID`);
    for (const event of nestedReadFrames(relativePath, receipt.tool_call_id)) {
      session.consumeLogical(subagentEvent(fixture.lifecycle.id, fixture.lifecycle.agent, event, fixture.lifecycle.agentSource));
    }
  }
  return session;
}
function recordSourceOnlyRequiredReadEnds(apis, fixture) {
  const session = createHostRouteSession(apis, fixture);
  for (const [index, relativePath] of sourceOnlyReaderPaths(fixture).entries()) {
    const callId = `source-derived-reader-read|${index}`;
    for (const event of nestedReadFrames(relativePath, callId)) {
      session.consumeLogical(subagentEvent(fixture.lifecycle.id, fixture.lifecycle.agent, event, fixture.lifecycle.agentSource));
    }
  }
  return session;
}


function rootReadEndPreservesFullHostTupleAndUsesNoSdkFields(apis, fixture) {
  const session = recordActualHostReadEnds(apis, fixture);
  const expected = hostTuple(fixture);
  assert.ok(session.evidence.subagent_reads.length >= fixture.reads.length, "Root recordSubagent must retain every host read END");
  for (const record of session.evidence.subagent_reads) {
    assert.deepEqual(
      {
        root_session_id: record.root_session_id,
        agent: record.agent,
        agentSource: record.agentSource,
        job_id: record.job_id,
        instance_id: record.instance_id,
        allocated_id: record.allocated_id,
        parent_tool_call_id: record.parent_tool_call_id,
        index: record.index,
      },
      expected,
      "real Root recordSubagent read END must preserve the complete approved host/lifecycle tuple",
    );
    assert.equal(Object.hasOwn(record, "jobId"), false, "read provenance must not infer an SDK jobId field");
    assert.equal(Object.hasOwn(record, "instanceId"), false, "read provenance must not infer an SDK instanceId field");
  }
}

function routeNativeWithReads(fixture, reads) {
  return {
    ...fixture.native,
    subagent_reads: reads,
  };
}
function completeActualReadRecordsReachRouteConsumer(apis, fixture) {
  const session = recordActualHostReadEnds(apis, fixture);
  const result = routeResult(apis, fixture, routeNativeWithReads(fixture, session.evidence.subagent_reads));
  const check = routeCheck(result, "initial.requirements-reader.read-binding");
  assert.equal(check?.status, "PASS", "route consumer must accept the complete host/lifecycle tuple emitted by real Root recordSubagent");
}

function assertTupleRejectedByRouteConsumer(apis, fixture, reads, expectedReason) {
  const result = routeResult(apis, fixture, routeNativeWithReads(fixture, reads));
  const check = routeCheck(result, "initial.requirements-reader.read-binding");
  assert.ok(check, `${expectedReason} must be evaluated by the route consumer`);
  assert.notEqual(check.status, "PASS", `${expectedReason} tuple corruption must not pass the route consumer`);
}

function missingReadTupleCannotPassRouteConsumer(apis, fixture) {
  const session = recordActualHostReadEnds(apis, fixture);
  const reads = cloneValue(session.evidence.subagent_reads);
  delete reads[0].instance_id;
  assertTupleRejectedByRouteConsumer(apis, fixture, reads, "missing host instance tuple");
}

function foreignReadTupleCannotPassRouteConsumer(apis, fixture) {
  const session = recordActualHostReadEnds(apis, fixture);
  const reads = cloneValue(session.evidence.subagent_reads);
  reads[0].parent_tool_call_id = "foreign-root|not-the-observed-dispatch";
  assertTupleRejectedByRouteConsumer(apis, fixture, reads, "foreign lifecycle parent tuple");
}

function staleReadTupleCannotPassRouteConsumer(apis, fixture) {
  const session = recordActualHostReadEnds(apis, fixture);
  const reads = cloneValue(session.evidence.subagent_reads);
  reads[0].job_id = "host-derived:job:stale";
  reads[0].instance_id = "host-derived:instance:stale";
  assertTupleRejectedByRouteConsumer(apis, fixture, reads, "stale host job/instance tuple");
}

function foreignReadPathCannotPassRouteConsumer(apis, fixture) {
  const session = recordActualHostReadEnds(apis, fixture);
  const reads = cloneValue(session.evidence.subagent_reads);
  const source = reads[0].source_files?.[0];
  assert.ok(source, "foreign-path regression needs an actual host source row to corrupt");
  source.path = ".omp/skills/not-approved-foreign.md";
  const result = routeResult(apis, fixture, routeNativeWithReads(fixture, reads));
  const check = routeCheck(result, "initial.requirements-reader.read-source-files");
  assert.ok(check, "foreign source path must be evaluated by the route consumer");
  assert.notEqual(check.status, "PASS", "an unapproved foreign read path must not pass the route consumer");
  assert.ok(
    routeCheckProblems(check).some((problem) => /foreign path/i.test(String(problem.reason ?? ""))),
    "route consumer must reject the unapproved read path as foreign",
  );
}

function incompleteHostResultNeverRoutesComplete(apis, fixture) {
  assert.equal(fixture.taskRecord.structured_data?.status, "INCOMPLETE", "the actual proof fixture must retain its observed INCOMPLETE status");
  const result = routeResult(apis, fixture);
  assert.notEqual(result.status, "PASS", "INCOMPLETE host result must never be accepted as COMPLETE");
  const check = routeCheck(result, "initial.requirements-reader.schema");
  assert.equal(check?.status, "FAIL", "route consumer must fail closed on the observed INCOMPLETE result");
}

function safeError(error) {
  return {
    name: error?.name ?? "Error",
    kind: error?.kind ?? null,
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };
}

function executeCase(results, failures, name, classification, run) {
  try {
    run();
    results.push({ name, status: "PASS", classification });
  } catch (error) {
    const failureReasonExpected = error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
    const failure = { name, classification, failure_reason_expected: failureReasonExpected, error: safeError(error) };
    failures.push(failure);
    results.push({ name, status: "FAIL", classification, failure_reason_expected: failureReasonExpected, error: failure.error });
  }
}
async function executeAsyncCase(results, failures, name, classification, run) {
  try {
    await run();
    results.push({ name, status: "PASS", classification });
  } catch (error) {
    const failureReasonExpected = error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
    const failure = { name, classification, failure_reason_expected: failureReasonExpected, error: safeError(error) };
    failures.push(failure);
    results.push({ name, status: "FAIL", classification, failure_reason_expected: failureReasonExpected, error: failure.error });
  }
}


async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.root, { recursive: true });
  installTimeoutRpcSpawnStub();
  const apis = await loadApis(options);
  const routeFixture = readRouteFixture(options);
  const actualNativeFixture = readRouteFixture({
    routeInspectionInput: options.actualNativeInspectionInput,
    routeTaskDescriptor: options.actualNativeTaskDescriptor,
  });
  const actualFullNativeFixture = fullSiblingRouteFixture(actualNativeFixture);
  routeFixture.inspection.definition = currentRouteControlDefinition(apis, routeFixture.inspection.definition);
  actualNativeFixture.inspection.definition = currentRouteControlDefinition(apis, actualNativeFixture.inspection.definition);
  actualFullNativeFixture.inspection.definition = currentRouteControlDefinition(apis, actualFullNativeFixture.inspection.definition);
  const sourceControlledRouteFixture = prepareSourceControlledRouteFixture(apis, actualNativeFixture, options.root);
  const sourceControlledFullRouteFixture = prepareSourceControlledRouteFixture(apis, actualFullNativeFixture, options.root);
  const results = [];
  const failures = [];
  const caseRoot = (name) => fs.mkdtempSync(path.join(options.root, `${name}-`));

  executeCase(results, failures, "default ordering remains valid", "positive-control:actual-root-ordering", () => defaultOrderingRemainsValid(apis, caseRoot("default-ordering")));
  executeCase(results, failures, "rejected matched async-result retains bounded diagnostic through failedNativeObservation", "VALID_FINDING:async-completion-rejection-diagnostic", () => rejectedMatchedAsyncResultRetainsBoundedDiagnostic(apis, caseRoot("async-rejection-diagnostic")));
  executeCase(results, failures, "SDK lifecycle before Root START remains pending then binds by full tuple", "VALID_FINDING:early-sdk-before-root-start", () => earlyLifecycleIsPendingThenAuthoritativelyAccepted(apis, caseRoot("early-root")));
  executeCase(results, failures, "pending nonterminal progress coalesces and adopts correlated proofs", "VALID_FINDING:pending-progress-coalescing", () => pendingNonterminalProgressCoalescesAndAdoptsProofs(apis, caseRoot("pending-progress-coalescing")));
  executeCase(results, failures, "no Root dispatch never passes", "VALID_FINDING:no-root-dispatch", () => noRootDispatchNeverPasses(apis, caseRoot("no-root")));
  executeCase(results, failures, "pending terminal progress overflow rolls back all pending collections", "VALID_FINDING:pending-terminal-overflow-rollback", () => pendingTerminalOverflowRollsBackAllCollections(apis, caseRoot("pending-terminal-overflow")));
  executeCase(results, failures, "pending progress missing outer aliases retains derived identity and proofs", "VALID_FINDING:pending-progress-alias-fallback", () => pendingProgressMissingOuterAliasesRetainsDerivedIdentity(apis, caseRoot("pending-progress-alias-fallback")));
  executeCase(results, failures, "malformed progress identities roll back without orphaning pending state", "VALID_FINDING:malformed-progress-rollback", () => malformedProgressIdentityRollsBackWithoutOrphaning(apis, caseRoot("malformed-progress-rollback")));
  executeCase(results, failures, "Root terminal cannot settle unresolved pending ownership", "VALID_FINDING:unresolved-pending-terminal", () => rootTerminalCannotSettleUnresolvedPendingOwnership(apis, caseRoot("unresolved-terminal")));
  executeCase(results, failures, "wrong full parentToolCallId cannot acquire assignment", "VALID_FINDING:wrong-full-parent", () => wrongParentIdCannotAcquire(apis, caseRoot("wrong-parent")));
  executeCase(results, failures, "rebound index cannot acquire assignment", "VALID_FINDING:rebound-index", () => reboundIndexCannotAcquire(apis, caseRoot("wrong-index")));
  executeCase(results, failures, "rebound agent cannot acquire assignment", "VALID_FINDING:rebound-agent", () => reboundAgentCannotAcquire(apis, caseRoot("wrong-agent")));
  executeCase(results, failures, "rebound agentSource cannot acquire assignment", "VALID_FINDING:rebound-agent-source", () => reboundAgentSourceCannotAcquire(apis, caseRoot("wrong-source")));
  executeCase(results, failures, "duplicate allocation does not acquire a logical assignment", "VALID_FINDING:duplicate-allocation", () => duplicateAllocationDoesNotAcquireLogicalAssignment(apis, caseRoot("duplicate")));
  executeCase(results, failures, "early nested read is deferred and unauthorized tools stay blocked", "VALID_FINDING:early-nested-domain-guard", () => earlyNestedReadIsDeferredAndUnauthorizedToolsStayBlocked(apis, caseRoot("early-nested")));
  executeCase(results, failures, "constructor-unapproved Root assignment cannot bind", "VALID_FINDING:constructor-root-assignment-authz", () => unapprovedRootAssignmentCannotBind(apis, caseRoot("constructor-root-authz")));
  executeCase(results, failures, "constructor-absent early role cannot buffer read write or Bash permissions", "VALID_FINDING:constructor-early-role-authz", () => earlyConstructorAbsentRoleCannotBufferDomainPermissions(apis, caseRoot("constructor-early-authz")));
  executeCase(results, failures, "permitted reader cannot adopt an unconfigured assignment name", "VALID_FINDING:constructor-assignment-name-authz", () => permittedReaderCannotAdoptUnconfiguredAssignmentName(apis, caseRoot("constructor-name-authz")));
  executeCase(results, failures, "early validator exact TOOLING_COMMAND is deferred then admitted", "VALID_FINDING:early-validator-role-guard", () => earlyValidatorToolingCommandIsDeferredThenAdmitted(apis, caseRoot("early-validator")));
  executeCase(results, failures, "early spec-kit-author metadata DOC handoff is deferred then admitted", "VALID_FINDING:early-speckit-role-guard", () => earlySpecKitAuthorDocHandoffIsDeferredThenAdmitted(apis, caseRoot("early-speckit")));
  executeCase(results, failures, "fast SDK completion before Root is adopted only by the same allocation", "VALID_FINDING:fast-completed-same-allocation", () => fastCompletedLifecycleBeforeRootIsAdoptedOnlyBySameAllocation(apis, caseRoot("fast-completed")));
  executeCase(results, failures, "SDK aborted speculative candidate is never adopted", "VALID_FINDING:aborted-speculative-candidate", () => abortedSpeculativeCandidateIsNeverAdopted(apis, caseRoot("aborted")));
  executeCase(results, failures, "completed speculative candidate is not adopted by agent/index heuristic", "VALID_FINDING:completed-candidate-not-adopted", () => completedSpeculativeCandidateIsNotAdoptedByTupleHeuristic(apis, caseRoot("completed-candidate")));
  executeCase(results, failures, "rejected lifecycle preserves bounded typed diagnostic without Root fabrication", "VALID_FINDING:rejected-lifecycle-diagnostic", () => rejectedLifecycleDiagnosticPreservesBoundedTuple(apis, caseRoot("rejected-diagnostic")));
  executeCase(results, failures, "aborted lifecycle SAME-ID is rejected after authoritative Root progress", "VALID_FINDING:lifecycle-1991-95/2585-91:same-id-aborted", () => abortedLifecycleSameIdIsRejectedAfterRootProgress(apis, caseRoot("aborted-same-id")));
  executeCase(results, failures, "failed lifecycle SAME-ID is rejected after authoritative Root progress", "VALID_FINDING:lifecycle-1991-95/2585-91:same-id-failed", () => failedLifecycleSameIdIsRejectedAfterRootProgress(apis, caseRoot("failed-same-id")));
  executeCase(results, failures, "accepted failed lifecycle cannot commit Root inline completed success", "VALID_FINDING:lifecycle-2672/2104-13/2974-79:accepted-failed-inline", () => acceptedFailedLifecycleCannotCommitInlineRootSuccess(apis, caseRoot("accepted-failed-inline")));
  executeCase(results, failures, "accepted aborted lifecycle cannot commit Root inline completed success", "VALID_FINDING:lifecycle-2672/2104-13/2974-79:accepted-aborted-inline", () => acceptedAbortedLifecycleCannotCommitInlineRootSuccess(apis, caseRoot("accepted-aborted-inline")));
  executeCase(results, failures, "Root result wrong parent tuple is blocked before terminal acceptance", "VALID_FINDING:lifecycle-2481-88:wrong-parent", () => rootResultWrongParentTupleIsBlocked(apis, caseRoot("result-wrong-parent")));
  executeCase(results, failures, "Root result wrong index tuple is blocked before terminal acceptance", "VALID_FINDING:lifecycle-2481-88:wrong-index", () => rootResultWrongIndexTupleIsBlocked(apis, caseRoot("result-wrong-index")));
  executeCase(results, failures, "Root result wrong agent tuple is blocked before terminal acceptance", "VALID_FINDING:lifecycle-2481-88:wrong-agent", () => rootResultWrongAgentTupleIsBlocked(apis, caseRoot("result-wrong-agent")));
  executeCase(results, failures, "Root result wrong agentSource tuple is blocked before terminal acceptance", "VALID_FINDING:lifecycle-2481-88:wrong-source", () => rootResultWrongAgentSourceTupleIsBlocked(apis, caseRoot("result-wrong-source")));
  executeCase(results, failures, "Root result owned by a different current Root is blocked", "VALID_FINDING:lifecycle-2481-88:foreign-current-root", () => rootResultOwnedByDifferentCurrentRootIsBlocked(apis, caseRoot("result-foreign-root")));
  executeCase(results, failures, "Root result with absent optional metadata preserves the legitimate blocking result", "POSITIVE_CONTROL:lifecycle-2481-88:optional-metadata-absent", () => rootResultAbsentOptionalMetadataPreservesLegitimateBlockingResult(apis, caseRoot("result-optional-absent")));
  executeCase(results, failures, "orphan early read keeps diagnostic arrival and hash without read ownership", "VALID_FINDING:lifecycle-1966-75:orphan-read-provenance", () => orphanEarlyReadRetainsDiagnosticArrivalAndHash(apis, caseRoot("orphan-read")));
  executeCase(results, failures, "lifecycle diagnostics remain bounded by count and bytes", "VALID_FINDING:lifecycle-1908-20:diagnostic-bound", () => lifecycleDiagnosticsRemainBounded(apis, caseRoot("diagnostic-bound")));
  executeCase(results, failures, "pending observation capacity rejection rolls back a partial pending allocation", "VALID_FINDING:lifecycle-1922-29/2594-600:atomic-capacity", () => pendingObservationCapacityRollsBackPartialAllocation(apis, caseRoot("capacity-atomic")));
  executeCase(results, failures, "irreducible pending progress overflow retains a bounded diagnostic", "VALID_FINDING:pending-retention-diagnostic-bound", () => pendingIrreducibleOverflowRetainsBoundedDiagnostic(apis, caseRoot("pending-retention-diagnostic")));
  executeCase(results, failures, "host route descriptor construction binds every reader source hash", "VALID_FINDING:native14-reader-boundary:reader-sources", () => hostDescriptorUsesEveryReaderSource(apis, routeFixture));
  executeCase(results, failures, "canonical reading tag is exact Root-session colon assignment and not child opaque ID", "VALID_FINDING:native14-reader-boundary:reading-tag", () => canonicalReadingTagIsCallerDerived(apis, routeFixture));
  executeCase(results, failures, "legitimate profile and model-policy reads are explicit route inputs, not blanket foreign paths", "VALID_FINDING:native14-reader-boundary:legitimate-extra-reads", () => actualReadReceiptsAccountForProfileAndModelPolicy(apis, routeFixture));
  executeCase(results, failures, "real Root recordSubagent read END preserves full host/lifecycle tuple without SDK inference", "VALID_FINDING:native14-reader-boundary:record-subagent-read-end", () => rootReadEndPreservesFullHostTupleAndUsesNoSdkFields(apis, routeFixture));
  executeCase(results, failures, "real Root read END metadata reaches the route consumer as an accepted tuple", "VALID_FINDING:native14-reader-boundary:route-consumer-positive", () => completeActualReadRecordsReachRouteConsumer(apis, routeFixture));
  await executeAsyncCase(results, failures, "successful current source-controlled capture carries trusted origin into the real route consumer", "VALID_FINDING:native-capture-origin-flag", () => actualNativeCaptureAddsTrustedOriginBeforeRouteConsumer(apis, sourceControlledRouteFixture, caseRoot("actual-native-route"), sourceControlledFullRouteFixture));
  executeCase(results, failures, "missing native flag on an otherwise valid source-controlled route stays non-Native", "VALID_FINDING:native-capture-missing-flag", () => sourceControlledMissingNativeFlagStaysNonNative(apis, sourceControlledRouteFixture));
  executeCase(results, failures, "explicit native:false on an otherwise valid source-controlled route stays non-Native", "VALID_FINDING:native-capture-explicit-non-native", () => sourceControlledExplicitNonNativeFlagStaysNonNative(apis, sourceControlledRouteFixture));
  await executeAsyncCase(results, failures, "capture receipt retains every operational tool and read record beyond the display limit", "VALID_FINDING:native-capture-serialization-full-retention", () => nativeCaptureReceiptPreservesFullOperationalCollections(apis, caseRoot("capture-serializer-full")));
  executeCase(results, failures, "missing read tuple cannot pass the real route consumer", "VALID_FINDING:native14-reader-boundary:missing-tuple", () => missingReadTupleCannotPassRouteConsumer(apis, routeFixture));
  executeCase(results, failures, "foreign lifecycle parent tuple cannot pass the real route consumer", "VALID_FINDING:native14-reader-boundary:foreign-tuple", () => foreignReadTupleCannotPassRouteConsumer(apis, routeFixture));
  executeCase(results, failures, "stale host job and instance tuple cannot pass the real route consumer", "VALID_FINDING:native14-reader-boundary:stale-tuple", () => staleReadTupleCannotPassRouteConsumer(apis, routeFixture));
  executeCase(results, failures, "unapproved foreign read path cannot pass the real route consumer", "VALID_FINDING:native14-reader-boundary:foreign-path", () => foreignReadPathCannotPassRouteConsumer(apis, routeFixture));
  executeCase(results, failures, "observed INCOMPLETE result never routes as COMPLETE", "VALID_FINDING:native14-reader-boundary:incomplete-terminal", () => incompleteHostResultNeverRoutesComplete(apis, routeFixture));
  executeCase(results, failures, "early lifecycle host timestamp survives adoption and omits SDK timestamp", "VALID_FINDING:spec675/contract916:host-timestamp", () => earlyLifecycleHostTimestampSurvivesAdoption(apis, caseRoot("host-timestamp")));
  executeCase(results, failures, "pending SDK assistant message deltas remain pending and coalesce only after Root confirmation", "VALID_FINDING:lifecycle-assistant-delta-retention:pending", () => pendingSdkMessageDeltaRetentionAdoptsOnlyAfterRootConfirmation(apis, caseRoot("assistant-delta-pending")));
  await executeAsyncCase(results, failures, "accepted SDK assistant message deltas stay within the physical writer budget", "VALID_FINDING:lifecycle-assistant-delta-retention:accepted-budget", () => acceptedSdkMessageDeltasStayWithinWriterBudget(apis, caseRoot("assistant-delta-budget")));
  executeCase(results, failures, "interleaved SDK delta tuples and non-delta guards remain observable", "VALID_FINDING:lifecycle-assistant-delta-retention:interleaved-guards", () => interleavedSdkDeltaTuplesAndGuardsRemainObservable(apis, caseRoot("assistant-delta-interleaved")));
  executeCase(results, failures, "pending SDK-shaped toolcall_delta diagnostics remain bounded and adopt only after Root confirmation", "VALID_FINDING:lifecycle-toolcall-delta-retention:pending-root-adoption", () => pendingSdkToolcallDeltaDiagnosticsAdoptOnlyAfterRootConfirmation(apis, caseRoot("toolcall-delta-pending")));
  await executeAsyncCase(results, failures, "accepted SDK-shaped toolcall_delta diagnostics remain bounded through the writer", "VALID_FINDING:lifecycle-toolcall-delta-retention:accepted-writer", () => acceptedSdkToolcallDeltaDiagnosticsStayWithinWriterBudget(apis, caseRoot("toolcall-delta-accepted")));
  await executeAsyncCase(results, failures, "safe observed settled state cannot rescue a timed-out capture", "VALID_FINDING:timeout-state-diagnostics:safe-settled-no-rescue", () => safeSettledTimeoutStateCannotRescueFailedCapture(apis, caseRoot("timeout-safe-settled")));
  await executeAsyncCase(results, failures, "absent timeout state fields remain null rather than fabricated flags", "VALID_FINDING:timeout-state-diagnostics:absent-fields", () => absentTimeoutStateCannotFabricateFlags(apis, caseRoot("timeout-absent-state")));
  await executeAsyncCase(results, failures, "foreign timeout state tuple is refused without foreign body", "VALID_FINDING:timeout-state-diagnostics:foreign-tuple", () => foreignTimeoutStateCannotFabricateFlags(apis, caseRoot("timeout-foreign-state")));
  await executeAsyncCase(results, failures, "timeout state query failure preserves the original error and abort", "VALID_FINDING:timeout-state-diagnostics:query-failure", () => timeoutStateQueryFailurePreservesOriginalErrorAndAbort(apis, caseRoot("timeout-state-query-failure")));
  apis.__resetNativeCaptureForTest?.();
  await executeAsyncCase(results, failures, "oversized operational capture fails closed at the unchanged physical byte bound", "VALID_FINDING:native-capture-serialization-byte-bound", () => oversizedNativeCaptureFailsClosedBeforePublication(apis, caseRoot("capture-serializer-oversize")));


  const output = {
    status: failures.length ? "FAIL" : "PASS",
    phase: "RED_REVISION",
    probe: "native-early-lifecycle-binding-red",
    source: { path: options.source, sha256: sha256File(options.source), expected_sha256: options.expectedSourceSha },
    scope: {
      root: options.root,
      native: false,
      sdk: false,
      omp: false,
      network: false,
      model_calls: false,
      production_changes: false,
      source_only: true,
      synthetic_controlled_producer: true,
      native_consumer_acceptance_fixture_only: true,
    },
    source_controlled_fixture: {
      status: "SOURCE_ONLY",
      producer: "synthetic-controlled NativeRpcSession.execute seam",
      native_execution: false,
      consumer_native_true_scope: "fixture-only",
    },
    cases: results.length,
    cases_run: results,
    failures,
    traceability: {
      "AC-016": results.map((item) => `implementation-evidence/native-release/early-lifecycle-binding-red-probe.mjs::${item.name}`),
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  assert.equal(failures.length, 0, "early lifecycle RED_REVISION cases must fail only through behavioral assertions");
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "FAIL",
    phase: "RED_REVISION",
    probe: "native-early-lifecycle-binding-red",
    failure_reason_expected: error?.code === "ERR_ASSERTION" || error?.name === "AssertionError",
    error: safeError(error),
  }, null, 2)}\n`);
  process.exitCode = 1;
});
