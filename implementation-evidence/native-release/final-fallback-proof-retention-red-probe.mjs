#!/usr/bin/env node
// Source-only RED probe for the NATIVE-06 fallback evidence publication boundary.
//
// The probe imports the current fallback writer and recorder through temporary
// export-only seams.  It never starts OMP/SDK, claims Native evidence, changes
// the source checkout, or mutates a captured fixture.  The operational proof
// expectations follow lifecycle.mjs's canonical full-graph serializer: generic
// redaction remains active, but valid operational collections are not treated
// as display previews and the published JSON has one physical byte bound.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_FALLBACK_SOURCE = path.join(SOURCE_DIR, "fallback.mjs");
const DEFAULT_ROOT = path.join(os.tmpdir(), "usefulskills-final-fallback-proof-retention-red");
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const PEER_WIRE_FIXTURE_CACHE = new Map();

function cachedPeerWireFixture(apis, root) {
  const cacheKey = `${root}\u0000${apis.fallbackSha256}`;
  const cached = PEER_WIRE_FIXTURE_CACHE.get(cacheKey);
  if (cached) return cached;
  const fixture = makePeerWireFixture(apis, root);
  PEER_WIRE_FIXTURE_CACHE.set(cacheKey, fixture);
  return fixture;
}


const OPERATIONAL_RECORD_COUNT = 128;
const SOURCE_CONTROL_COUNT = 128;
const LATE_READ_CALL_ID = "root-read|late-authority";
const LATE_TASK_CALL_ID = "root-task|late-authority";
const PREFLIGHT_CALL_ID = "root-task|disabled-preflight";
const LATE_TERMINAL_ID = "FallbackReviewLateAuthority";
const PROMPT_RESULT_ID = "5f5f9b7e-58f1-4c39-9d0a-6bc5a8f01511";
const SECRET_VALUES = Object.freeze([
  "raw-capture-secret-final-fallback-3e8c",
  "prompt-diagnostic-secret-final-fallback-4a91",
  "task-diagnostic-secret-final-fallback-5b02",
  "model-diagnostic-secret-final-fallback-6c13",
  "message-diagnostic-secret-final-fallback-7d24",
  "cot-diagnostic-secret-final-fallback-9f46",
  "auth-diagnostic-secret-final-fallback-af57",
  "raw-helper-diagnostic-secret-final-fallback-b068",
]);

class ProbeSetupError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProbeSetupError";
    this.code = "PROBE_SETUP";
    this.details = details;
  }
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value ?? ""), "utf8"));
}

function parseArgs(argv) {
  let source = DEFAULT_FALLBACK_SOURCE;
  let root = DEFAULT_ROOT;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--source") source = argv[++index];
    else if (token === "--root") root = argv[++index];
    else throw new ProbeSetupError(`unsupported argument ${token}`);
    if (!source || !root || String(source).startsWith("--") || String(root).startsWith("--")) {
      throw new ProbeSetupError("--source and --root require non-empty values");
    }
  }
  return { source: path.resolve(source), root: path.resolve(root) };
}

function assertRegularFile(file, label) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    throw new ProbeSetupError(`${label} is not readable`, { file, error: { name: error?.name, message: String(error?.message ?? error) } });
  }
  if (!stat.isFile()) throw new ProbeSetupError(`${label} is not a regular file`, { file });
}

function writeFresh(file, content, label) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) throw new ProbeSetupError(`${label} unexpectedly exists`, { file });
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function safeError(error) {
  return {
    name: error?.name ?? typeof error,
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };
}

function makeFallbackExportOnlySeam(source, root) {
  const seamDir = path.join(root, "source-overlay", "implementation-evidence", "native-release");
  fs.mkdirSync(seamDir, { recursive: true });
  const sourceBytes = fs.readFileSync(source);
  const seam = path.join(seamDir, "fallback.seam.mjs");
  writeFresh(
    seam,
    `${sourceBytes.toString("utf8")}\n\n// TEMP export-only seam; never part of the product.\nexport { RpcSession, sanitizeValue, writeEvidence, peerWireHelperSource };\n`,
    "fallback export-only seam",
  );
  return { seam, sourceBytes, sourceSha256: sha256Bytes(sourceBytes) };
}

function makeCanonicalSerializerSeam(root) {
  const seamDir = path.join(root, "source-overlay", "implementation-evidence", "native-release");
  const protocolDir = path.join(root, "source-overlay", "deep-review", "lib");
  fs.mkdirSync(seamDir, { recursive: true });
  fs.mkdirSync(protocolDir, { recursive: true });
  const lifecycleSource = path.join(SOURCE_DIR, "lifecycle.mjs");
  const lifecycleBytes = fs.readFileSync(lifecycleSource);
  const lifecycleSeam = path.join(seamDir, "lifecycle.seam.mjs");
  writeFresh(
    lifecycleSeam,
    `${lifecycleBytes.toString("utf8")}\n\n// TEMP export-only seam; never part of the product.\nexport { serializeOperationalEvidence };\n`,
    "lifecycle serializer export-only seam",
  );
  fs.copyFileSync(path.join(SOURCE_DIR, "technical-retry-scenario.mjs"), path.join(seamDir, "technical-retry-scenario.mjs"));
  fs.copyFileSync(path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs"), path.join(protocolDir, "protocol.mjs"));
  return { lifecycleSeam, lifecycleSha256: sha256Bytes(lifecycleBytes) };
}

async function loadApis(options) {
  const fallbackSeam = makeFallbackExportOnlySeam(options.source, options.root);
  const canonicalSeam = makeCanonicalSerializerSeam(options.root);
  const fallback = await import(`${pathToFileURL(fallbackSeam.seam).href}?fallback_source=${fallbackSeam.sourceSha256}`);
  const canonical = await import(`${pathToFileURL(canonicalSeam.lifecycleSeam).href}?lifecycle_source=${canonicalSeam.lifecycleSha256}`);
  for (const name of ["RpcSession", "sanitizeValue", "writeEvidence", "peerWireHelperSource"]) {
    if (typeof fallback[name] !== "function") throw new ProbeSetupError(`fallback seam did not expose ${name}`);
  }
  if (typeof canonical.serializeOperationalEvidence !== "function") {
    throw new ProbeSetupError("lifecycle seam did not expose serializeOperationalEvidence");
  }
  return { fallback, canonical, fallbackSha256: fallbackSeam.sourceSha256, lifecycleSha256: canonicalSeam.lifecycleSha256 };
}

function sourceControlEntries(sourceBytes) {
  return Array.from({ length: SOURCE_CONTROL_COUNT }, (_, index) => {
    const late = index === SOURCE_CONTROL_COUNT - 1;
    return {
      path: late ? "implementation-evidence/native-release/fallback.mjs#late-source-control" : `implementation-evidence/native-release/source-control-${String(index).padStart(3, "0")}.mjs`,
      bytes: late ? sourceBytes.byteLength : 100 + index,
      sha256: late ? sha256Bytes(sourceBytes) : sha256Text(`source-control-${index}`),
    };
  });
}

function makeTaskStart(callId, name, agent, index) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId: callId,
    args: {
      tasks: [{
        name,
        agent,
        task: `Source-only operational retention assignment ${index}.`,
        solutionSpace: "Read-only serializer regression witness.",
      }],
    },
  };
}

function makeProgress(id, index, late = false) {
  return {
    type: "subagent_progress",
    payload: {
      progress: {
        id,
        agent: "peer-reviewer",
        agentSource: "project",
        status: "completed",
        index,
        assignment_sha256: sha256Text(`assignment-${index}`),
        task_sha256: sha256Text(`task-${index}`),
        durationMs: late ? 99_999 : index,
        resolvedThinkingLevel: "hidden-thinking-diagnostic",
      },
    },
  };
}

function makeReadStart(callId, index) {
  return {
    type: "tool_execution_start",
    toolName: "read",
    toolCallId: callId,
    args: { path: `.omp/state/native-proof/read-${String(index).padStart(3, "0")}.md` },
  };
}

function makeReadEnd(callId, index) {
  return {
    type: "tool_execution_end",
    toolName: "read",
    toolCallId: callId,
    isError: false,
    result: {
      status: "completed",
      success: true,
      isError: false,
      secret_token: `read-secret-${index}`,
      text: `bounded operational read ${index}`,
    },
  };
}


function makeSessionEvidence() {
  return {
    rpc: { protocol: { version: 2, negotiated: true } },
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
  };
}

function makeRecordedEvidence(apis, root, sourceBytes) {
  const recording = makeSessionEvidence();
  const session = new apis.fallback.RpcSession({ omp: "source-only-no-process", cwd: root, env: {}, timeoutMs: 1_000, evidence: recording });

  session.consumeLogical(makeTaskStart(PREFLIGHT_CALL_ID, "DeepDisabledPreflight", "deep-reviewer", -1));
  for (let index = 0; index < OPERATIONAL_RECORD_COUNT; index += 1) {
    const late = index === OPERATIONAL_RECORD_COUNT - 1;
    session.consumeLogical(makeTaskStart(
      late ? LATE_TASK_CALL_ID : `root-task|fallback-${String(index).padStart(3, "0")}`,
      late ? "FallbackReviewLateAuthority" : `FallbackReview${String(index).padStart(3, "0")}`,
      "peer-reviewer",
      index,
    ));
  }
  session.consumeLogical({
    type: "tool_execution_end",
    toolName: "task",
    toolCallId: PREFLIGHT_CALL_ID,
    result: {
      status: "error",
      success: false,
      error: "deep-reviewer disabled by project preflight",
      secret_token: "preflight-secret-final-fallback",
      progress: [],
    },
  });

  for (let index = 0; index < OPERATIONAL_RECORD_COUNT; index += 1) {
    const late = index === OPERATIONAL_RECORD_COUNT - 1;
    session.consumeLogical(makeProgress(late ? LATE_TERMINAL_ID : `fallback-terminal-${String(index).padStart(3, "0")}`, index, late));
  }

  for (let index = 0; index < OPERATIONAL_RECORD_COUNT; index += 1) {
    const late = index === OPERATIONAL_RECORD_COUNT - 1;
    const callId = late ? LATE_READ_CALL_ID : `root-read|${String(index).padStart(3, "0")}`;
    session.consumeLogical(makeReadStart(callId, index));
    session.consumeLogical(makeReadEnd(callId, index));
  }

  session.consumeLogical({
    type: "prompt_result",
    id: PROMPT_RESULT_ID,
    status: "completed",
    agentInvoked: true,
    sessionSettled: true,
  });
  session.consumeLogical({ type: "session_settled" });

  const lateRead = recording.read_events.at(-1);
  const preflightEnd = recording.tool_events.find((event) => event.event === "tool_execution_end" && event.toolCallId === PREFLIGHT_CALL_ID);
  const lateTerminal = recording.native_progress_terminal.find((record) => record.id === LATE_TERMINAL_ID);
  const rawCapture = {
    capture_id: "raw-capture|late-authority",
    frame_type: "tool_execution_end",
    tool_call_id: LATE_READ_CALL_ID,
    sequence: recording.tool_events.at(-1)?.sequence ?? null,
    source: "observed-rpc",
    preview: "Bearer preview-bearer-secret-final-fallback-8e35",
    payload: { status: "completed", accepted: true, raw_marker: "raw-operational-marker-final-fallback" },
    secret_token: "raw-capture-secret-final-fallback-3e8c",
  };
  const promptResult = {
    type: "prompt_result",
    ...recording.prompt_result,
    prompt: "prompt-diagnostic-secret-final-fallback-4a91",
    task: "task-diagnostic-secret-final-fallback-5b02",
    model: "model-diagnostic-secret-final-fallback-6c13",
    message: "message-diagnostic-secret-final-fallback-7d24",
    secret_token: "prompt-diagnostic-secret-final-fallback-4a91",
  };
  const controls = sourceControlEntries(sourceBytes);
  const native = {
    evidence_level: "SOURCE_ONLY_OPERATIONAL",
    rpc: recording.rpc,
    root_reads: {
      status: "OBSERVED",
      evidence_level: "SOURCE_ONLY_OPERATIONAL",
      expected: OPERATIONAL_RECORD_COUNT,
      observed: OPERATIONAL_RECORD_COUNT,
      first_task_sequence: recording.task_calls[0]?.sequence ?? null,
      late_root_read: lateRead,
    },
    disabled_preflight: {
      status: "OBSERVED",
      evidence_level: "SOURCE_ONLY_OPERATIONAL",
      assignment: { id: "DeepDisabledPreflight", agent: "deep-reviewer", task_sha256: recording.task_calls[0]?.items?.[0]?.taskSha256 ?? null },
      tool_call_id: PREFLIGHT_CALL_ID,
      sequence: preflightEnd?.sequence ?? null,
      result: preflightEnd?.result ?? null,
    },
    fallback: null,
    derived_consumer_controls: [],
    native_progress_terminal: recording.native_progress_terminal,
    subagent_frames: recording.subagent_frames,
    task_calls: recording.task_calls,
    task_details: recording.task_details,
    tool_events: recording.tool_events,
    read_events: recording.read_events,
    raw_capture: rawCapture,
    limitations: [],
    prompt_result: promptResult,
    session_settled: recording.session_settled,
  };
  return {
    task: "NATIVE-06.fallback",
    contract: "0.5.0",
    run_id: "source-only-fallback-retention-red",
    phase: "source-only",
    source_only: true,
    native_claim: false,
    native,
    source: {
      package_entries: controls,
      profile_count: 12,
      immutable_scope: controls.map((entry) => ({ ...entry })),
      overlay_copy_count: SOURCE_CONTROL_COUNT,
      protocol_consumer: { source_relative_path: "deep-review/lib/protocol.mjs", sha256: sha256Text("protocol-consumer-source-only") },
    },
    preservation: {
      source: { label: "source", changed: [], unchanged: true },
      fixture: { label: "immutable fixture", changed: [], unchanged: true },
      binary: { before: null, after: null, unchanged: true },
    },
    failure: null,
    status: "PASS",
  };
}

function shellCommandArgument(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:\\-]+$/.test(text)) return text.replaceAll("\\", "/");
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function makePeerWireFixture(apis, root) {
  const fixtureRoot = path.join(root, "peer-wire-fixture");
  fs.mkdirSync(fixtureRoot);
  const revision = "source-only-peer-wire-fixture-v1";
  const protocolPath = path.join(fixtureRoot, "protocol.mjs");
  const helperPath = path.join(fixtureRoot, "peer-wire-malformed-helper.mjs");
  const validPath = path.join(fixtureRoot, "valid.json");
  const malformedPath = path.join(fixtureRoot, "malformed-missing-explanation.json");
  const receiptPath = path.join(fixtureRoot, "git-source-receipt.json");
  const protocolSourcePath = path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs");
  assertRegularFile(protocolSourcePath, "peer-wire protocol source fixture");
  const protocolText = fs.readFileSync(protocolSourcePath, "utf8");
  if (typeof apis.fallback.peerWireHelperSource !== "function") {
    throw new ProbeSetupError("fallback seam did not expose the canonical peer-wire helper source");
  }
  const canonicalHelper = apis.fallback.peerWireHelperSource();
  if (typeof canonicalHelper !== "string" || !canonicalHelper.includes("native05-peer-wire-probe-v1")) {
    throw new ProbeSetupError("canonical peer-wire helper source was not bounded");
  }
  const helperText = `#!/usr/bin/env node
${canonicalHelper.replace(/^#![^\n]*\n/, "")}`;
  const valid = {
    agent: "peer-reviewer",
    protocol_mode: "TDD_PEER_REVIEW",
    status: "APROVADO",
    reviewed_revision: revision,
    overall_correctness: "correct",
    explanation: "Owned valid TDD peer-review fixture.",
    confidence: 1,
    findings: [],
  };
  const malformed = { ...valid };
  delete malformed.explanation;
  const validText = `${JSON.stringify(valid)}\n`;
  const malformedText = `${JSON.stringify(malformed)}\n`;
  const receiptText = `${JSON.stringify({ schema: "git-fixture-receipt-v1", head_revision: revision })}\n`;
  writeFresh(protocolPath, protocolText, "peer-wire protocol fixture");
  writeFresh(helperPath, helperText, "peer-wire helper fixture");
  writeFresh(validPath, validText, "peer-wire valid fixture");
  writeFresh(malformedPath, malformedText, "peer-wire malformed fixture");
  writeFresh(receiptPath, receiptText, "peer-wire receipt fixture");
  const record = (file, text) => ({
    path: file,
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: sha256Text(text),
  });
  const childArgv = [
    helperPath,
    "--worker",
    "--protocol", protocolPath,
    "--valid", validPath,
    "--malformed", malformedPath,
    "--receipt", receiptPath,
    "--revision", revision,
  ];
  const child = spawnSync(process.execPath, childArgv, {
    cwd: fixtureRoot,
    shell: false,
    timeout: 300_000,
    maxBuffer: 65_536,
    encoding: "utf8",
    windowsHide: true,
  });
  const spawnError = child.error
    ? {
      name: typeof child.error.name === "string" ? child.error.name.slice(0, 128) : null,
      code: typeof child.error.code === "string" ? child.error.code.slice(0, 128) : null,
    }
    : null;
  if (spawnError || child.status !== 0 || typeof child.stdout !== "string") {
    throw new ProbeSetupError("peer-wire helper worker did not complete successfully", {
      status: child.status ?? null,
      signal: child.signal ?? null,
      spawn_error: spawnError,
    });
  }
  let helperOutput;
  try {
    helperOutput = JSON.parse(child.stdout.trim());
  } catch (error) {
    throw new ProbeSetupError("peer-wire helper worker did not emit bounded JSON", { error: safeError(error) });
  }
  const helperFile = record(helperPath, helperText);
  const probeFiles = [
    helperFile,
    record(validPath, validText),
    record(malformedPath, malformedText),
    record(protocolPath, protocolText),
    record(receiptPath, receiptText),
  ];
  const childExecution = {
    origin: "observed-node-child",
    executable: process.execPath,
    script_path: helperPath,
    script_sha256: helperFile.sha256,
    argv_sha256: sha256Text(JSON.stringify(childArgv)),
    exit_code: Number.isInteger(child.status) ? child.status : null,
    exit_code_observed: Number.isInteger(child.status),
    signal: child.signal ?? null,
    signal_observed: Object.hasOwn(child, "signal") && (child.signal === null || typeof child.signal === "string"),
    spawn_error: spawnError,
  };
  if (childExecution.exit_code !== 0 || childExecution.exit_code_observed !== true || childExecution.signal !== null || childExecution.signal_observed !== true || childExecution.spawn_error !== null) {
    throw new ProbeSetupError("peer-wire helper child execution was not observed as a clean bounded child", { child_execution: childExecution });
  }
  const output = { ...helperOutput, child_execution: childExecution };
  const validOutcome = helperOutput.outcomes?.valid;
  const malformedOutcome = helperOutput.outcomes?.malformed;
  const expectedMalformedErrors = [
    "reviewer result.explanation must be an own enumerable property",
    "explanation must be a non-empty string",
  ];
  if (
    validOutcome?.ok !== true
    || validOutcome?.status !== "APROVADO"
    || malformedOutcome?.ok !== false
    || malformedOutcome?.status !== "BLOCKED"
    || JSON.stringify(malformedOutcome.errors) !== JSON.stringify(expectedMalformedErrors)
  ) {
    throw new ProbeSetupError("canonical peer-wire helper outcomes changed unexpectedly", {
      valid: validOutcome,
      malformed: malformedOutcome,
    });
  }
  const normalizedOutput = {
    ...helperOutput,
    outcomes: {
      valid: { ok: true, errors: [], status: validOutcome.status },
      malformed: { ok: false, errors: expectedMalformedErrors, status: malformedOutcome.status },
    },
  };
  const normalizedOutputWithChild = { ...normalizedOutput, child_execution: childExecution };
  const command = [
    process.execPath,
    ...childArgv,
  ].map(shellCommandArgument).join(" ");
  const probe = {
    command,
    cwd: fixtureRoot,
    executable: process.execPath,
    child_argv: childArgv,
    child_argv_sha256: childExecution.argv_sha256,
    helper_path: helperPath,
    helper_sha256: helperFile.sha256,
    files: probeFiles,
  };
  return {
    root: fixtureRoot,
    revision,
    protocolPath,
    helperPath,
    validPath,
    malformedPath,
    receiptPath,
    command,
    output,
    normalizedOutput,
    normalizedOutputWithChild,
    childExecution,
    probe,
    source_only: true,
    native: false,
  };
}

function makePeerWireSession(apis, root, label) {
  const caseRoot = path.join(root, `peer-wire-${label}`);
  fs.mkdirSync(caseRoot);
  // The helper worker is the one real process-outcome witness. Keep its
  // immutable files, script path, and argv binding shared; isolate only the
  // recorder evidence and the probe object consumed by each case.
  const fixture = cachedPeerWireFixture(apis, root);
  const evidence = makeSessionEvidence();
  const probe = cloneJson(fixture.probe);
  const session = new apis.fallback.RpcSession({
    omp: "source-only-no-process",
    cwd: fixture.root,
    env: {},
    timeoutMs: 1_000,
    evidence,
    probe,
  });
  return { caseRoot, fixture, evidence, probe, session };
}

function makeToolStartFrame(toolName, toolCallId, args = {}) {
  return { type: "tool_execution_start", toolName, toolCallId, args };
}

function makeToolEndFrame(toolName, toolCallId, extra = {}) {
  return {
    type: "tool_execution_end",
    toolName,
    toolCallId,
    isError: false,
    result: {
      status: "completed",
      success: true,
      isError: false,
      ...extra,
    },
  };
}

function makeTaskArgs(name) {
  return {
    tasks: [{
      name,
      agent: "peer-reviewer",
      task: `Source-only peer-wire fixture assignment for ${name}.`,
      solutionSpace: "Read-only fixture validation.",
    }],
  };
}

function consumeToolPair(session, toolName, toolCallId, args, extra = {}) {
  session.consumeLogical(makeToolStartFrame(toolName, toolCallId, args));
  session.consumeLogical(makeToolEndFrame(toolName, toolCallId, extra));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeProbeBashEndFrame(toolCallId, result, rawIsError) {
  const frame = {
    type: "tool_execution_end",
    toolName: "bash",
    toolCallId,
    result,
  };
  if (rawIsError !== undefined) frame.isError = rawIsError;
  return frame;
}

function opaqueDigest(value) {
  const raw = JSON.stringify(value);
  return { sha256: sha256Text(raw), bytes: Buffer.byteLength(raw, "utf8") };
}

function assertRetainedRejectedBashEnd({
  evidence,
  bytes,
  value,
  frame,
  expected,
  label,
}) {
  const serialized = bytes.toString("utf8");
  const inMemoryEnd = evidence.probe_bash_end;
  assert.ok(inMemoryEnd, `${label} must retain its matching Bash END before publication`);
  assert.deepEqual(
    selected(inMemoryEnd, ["sequence", "tool_call_id", "is_error", "is_error_observed", "exit_code", "exit_code_observed"]),
    expected,
    `${label} must retain terminal correlation and observed/unknown SDK metadata`,
  );
  assert.deepEqual(inMemoryEnd.output, frame.expectedOutput, `${label} must retain the safe parsed bounded helper payload`);
  const endEvents = evidence.tool_events.filter((event) => event.event === "tool_execution_end" && event.toolName === "bash");
  assert.equal(endEvents.length, 1, `${label} must retain exactly one matching Bash END in memory`);
  assert.equal(endEvents[0].sequence, expected.sequence, `${label} must retain the matching END sequence`);
  assert.equal(endEvents[0].toolCallId, expected.tool_call_id, `${label} must retain the matching END call id`);
  const expectedInMemoryResultHash = opaqueDigest(frame.result);
  const expectedInMemoryTextHash = {
    sha256: sha256Text(frame.result.status),
    bytes: Buffer.byteLength(frame.result.status, "utf8"),
  };
  const inMemoryResult = endEvents[0].result;
  assert.equal(inMemoryResult?.result_sha256, expectedInMemoryResultHash.sha256, `${label} must retain the opaque raw-result hash before writeEvidence`);
  assert.equal(inMemoryResult?.result_bytes, expectedInMemoryResultHash.bytes, `${label} must retain raw-result byte accounting before writeEvidence`);
  assert.equal(inMemoryResult?.text_sha256, expectedInMemoryTextHash.sha256, `${label} must retain the bounded text hash before writeEvidence`);
  assert.equal(inMemoryResult?.text_bytes, expectedInMemoryTextHash.bytes, `${label} must retain bounded text byte accounting before writeEvidence`);

  const publishedEnd = value.probe_bash_end;
  assert.ok(publishedEnd, `${label} must retain its matching Bash END in official evidence`);
  assert.deepEqual(
    selected(publishedEnd, ["sequence", "tool_call_id", "is_error", "is_error_observed", "exit_code", "exit_code_observed"]),
    expected,
    `${label} must retain terminal metadata in serialized official evidence`,
  );
  assert.deepEqual(publishedEnd.output, frame.expectedOutput, `${label} must retain the parsed helper payload after writeEvidence`);
  const publishedEnds = value.tool_events.filter((event) => event.event === "tool_execution_end" && event.toolName === "bash");
  assert.equal(publishedEnds.length, 1, `${label} must not duplicate the rejected Bash END in serialized evidence`);
  assert.equal(publishedEnds[0].sequence, expected.sequence, `${label} serialized END sequence must remain correlated`);
  assert.equal(publishedEnds[0].toolCallId, expected.tool_call_id, `${label} serialized END call id must remain correlated`);

  const expectedResultHash = opaqueDigest(frame.result);
  const expectedTextHash = {
    sha256: sha256Text(frame.result.status),
    bytes: Buffer.byteLength(frame.result.status, "utf8"),
  };
  const result = publishedEnds[0].result;
  assert.equal(result?.result_sha256, expectedResultHash.sha256, `${label} must retain an opaque hash of the bounded raw helper result`);
  assert.equal(result?.result_bytes, expectedResultHash.bytes, `${label} must retain bounded raw helper result byte accounting`);
  assert.equal(result?.text_sha256, expectedTextHash.sha256, `${label} must retain the bounded text hash`);
  assert.equal(result?.text_bytes, expectedTextHash.bytes, `${label} must retain bounded text byte accounting`);
  for (const hash of [expectedResultHash.sha256, expectedTextHash.sha256]) {
    assert.equal(serialized.includes(hash), true, `${label} serialized official evidence must contain opaque result hashes`);
  }
  assertNoSecretValues(serialized, label);
  assert.equal(serialized.includes("chain-of-thought"), false, `${label} must not serialize COT diagnostics`);
  assert.equal(serialized.includes("prompt-diagnostic"), false, `${label} must not serialize prompt diagnostics`);
  assert.equal(serialized.includes("auth-diagnostic"), false, `${label} must not serialize auth diagnostics`);
}

function consumeRejectedProbeBashEnd(apis, root, label, {
  payload,
  rawIsError,
  exitCode,
  includeNestedIsError = true,
}) {
  const { fixture, probe, evidence, session } = makePeerWireSession(apis, root, label);
  const bashCallId = `peer-bash|failed-${label}`;
  session.consumeLogical(makeToolStartFrame("bash", bashCallId, { command: probe.command, cwd: probe.cwd }));
  const result = {
    status: "completed",
    success: true,
    stdout: JSON.stringify(typeof payload === "function" ? payload(fixture) : payload),
    output: "chain-of-thought cot-diagnostic-secret-final-fallback-9f46 prompt prompt-diagnostic-secret-final-fallback-4a91 auth auth-diagnostic-secret-final-fallback-af57 raw-helper-diagnostic-secret-final-fallback-b068",
  };
  if (includeNestedIsError) result.isError = rawIsError;
  if (exitCode !== undefined) result.exitCode = exitCode;
  const frame = makeProbeBashEndFrame(bashCallId, result, rawIsError);
  let thrown = null;
  try {
    session.consumeLogical(frame);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `${label} must be rejected by the configured Bash END guard`);
  assert.equal(thrown?.kind, "BLOCKED", `${label} must fail closed with a bounded BLOCKED driver error`);
  return { fixture, probe, evidence, session, frame, thrown };
}

function writeRejectedProbeEvidence(apis, root, run) {
  run.frame.expectedOutput = run.expectedOutput;
  const published = writeAndRead(apis, path.join(root, `failed-${run.probe.child_argv_sha256}`), run.evidence);
  return { ...published, serialized: published.bytes.toString("utf8") };
}

function assertBlocked(run, label) {
  let thrown = null;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `${label} must be rejected by the recorder guard`);
  assert.equal(thrown?.kind, "BLOCKED", `${label} must fail closed with a BLOCKED driver error`);
}

function caseDefaultFallbackToolAllowlist(apis, root) {
  const evidence = makeSessionEvidence();
  const session = new apis.fallback.RpcSession({
    omp: "source-only-no-process",
    cwd: root,
    env: {},
    timeoutMs: 1_000,
    evidence,
  });
  const calls = [
    ["read", "fallback-read", { path: "source-only/valid.json" }, { text: "bounded read" }],
    ["grep", "fallback-grep", { pattern: "explanation", path: "source-only/valid.json" }],
    ["glob", "fallback-glob", { pattern: "*.json", path: "source-only" }],
    ["wait", "fallback-wait", { ids: [] }, { details: { op: "wait", jobs: [] } }],
    ["todo", "fallback-todo", { items: [{ title: "bounded source-only plan" }] }],
    ["task", "fallback-task", makeTaskArgs("DefaultFallbackTask"), { details: { results: [{ id: "fallback-task", agent: "peer-reviewer", status: "completed" }] } }],
    ["tasks", "fallback-tasks", makeTaskArgs("DefaultFallbackTasks"), { details: { results: [{ id: "fallback-tasks", agent: "peer-reviewer", status: "completed" }] } }],
  ];
  for (const [toolName, callId, args, extra] of calls) consumeToolPair(session, toolName, callId, args, extra);
  assert.deepEqual(
    evidence.tool_events.map(({ event, toolName, toolCallId }) => [event, toolName, toolCallId]),
    calls.flatMap(([toolName, callId]) => [
      ["tool_execution_start", toolName, callId],
      ["tool_execution_end", toolName, callId],
    ]),
    "the unconfigured fallback recorder must retain its existing root tool allowlist and event order",
  );
  assert.equal(evidence.read_events[0]?.success, true, "the default fallback read control must process its successful END");
  assert.deepEqual(
    evidence.task_calls.map((call) => call.items[0]?.name),
    ["DefaultFallbackTask", "DefaultFallbackTasks"],
    "the default fallback task controls must retain their observed assignment identities",
  );
}

function casePeerWirePrecommandAndApprovedBash(apis, root) {
  const { fixture, probe, evidence, session } = makePeerWireSession(apis, root, "precommand-approved-bash");
  const precommands = [
    ["read", "peer-read", { path: fixture.validPath }, { text: "bounded valid fixture read" }],
    ["grep", "peer-grep", { pattern: "explanation", path: fixture.validPath }],
    ["glob", "peer-glob", { pattern: "*.json", path: fixture.root }],
    ["wait", "peer-wait", { ids: [] }, { details: { op: "wait", jobs: [] } }],
  ];
  for (const [toolName, callId, args, extra] of precommands) consumeToolPair(session, toolName, callId, args, extra);
  const bashCallId = "peer-bash|approved";
  session.consumeLogical(makeToolStartFrame("bash", bashCallId, { command: probe.command, cwd: probe.cwd }));
  session.consumeLogical(makeToolEndFrame("bash", bashCallId, { exitCode: 0, stdout: JSON.stringify(fixture.normalizedOutput) }));
  assert.deepEqual(
    evidence.tool_events.map(({ event, toolName, toolCallId }) => [event, toolName, toolCallId]),
    [
      ...precommands.flatMap(([toolName, callId]) => [
        ["tool_execution_start", toolName, callId],
        ["tool_execution_end", toolName, callId],
      ]),
      ["tool_execution_start", "bash", bashCallId],
      ["tool_execution_end", "bash", bashCallId],
    ],
    "peer-wire precommand tools and the one configured Bash call must be processed in arrival order",
  );
  assert.equal(evidence.probe_bash_start?.command, probe.command, "the configured Bash START must retain the exact approved command");
  assert.equal(evidence.probe_bash_end?.is_error, false, "the matching approved Bash END must retain observed isError:false");
  assert.equal(evidence.probe_bash_end?.exit_code, 0, "the matching approved Bash END must retain its observed zero exit code");
  assert.deepEqual(evidence.probe_bash_end?.output, fixture.normalizedOutput, "the recorder must process the actual bounded peer-wire helper output shape");
  assert.equal(evidence.probe_bash_end?.exit_code_observed, true, "the explicit outer SDK exit zero must remain marked observed");
  assert.equal(fixture.source_only, true, "peer-wire child fixture metadata must remain source-only");
  assert.equal(fixture.native, false, "peer-wire child fixture metadata must never claim Native evidence");
  assert.equal(fixture.childExecution.origin, "observed-node-child", "owned positive fixture must carry observed child provenance");
  assert.equal(fixture.childExecution.executable, process.execPath, "owned positive fixture must carry the requested Node executable");
  assert.equal(fixture.childExecution.exit_code, 0, "owned positive fixture must carry the real child zero status");
  assert.equal(fixture.childExecution.exit_code_observed, true, "owned positive fixture must carry observed child status");
  assert.equal(fixture.childExecution.signal, null, "owned positive fixture must carry the observed null signal");
  assert.equal(fixture.childExecution.signal_observed, true, "owned positive fixture must mark the observed null signal");
  assert.equal(fixture.childExecution.spawn_error, null, "owned positive fixture must carry null spawn error");
  assert.equal(fixture.probe.executable, process.execPath, "trusted probe metadata must expose the requested executable");
  assert.deepEqual(fixture.probe.child_argv, [fixture.helperPath, "--worker", "--protocol", fixture.protocolPath, "--valid", fixture.validPath, "--malformed", fixture.malformedPath, "--receipt", fixture.receiptPath, "--revision", fixture.revision], "trusted probe metadata must expose the exact worker argv");
  assert.equal(fixture.probe.child_argv_sha256, sha256Text(JSON.stringify(fixture.probe.child_argv)), "trusted probe metadata must hash the exact worker argv");
  const helperRecord = fixture.probe.files.find((entry) => path.resolve(entry.path).toLowerCase() === path.resolve(fixture.helperPath).toLowerCase());
  assert.equal(helperRecord?.sha256, fixture.childExecution.script_sha256, "the child script hash must come from the immutable probe.files record");
}

function casePeerWireForbiddenTool(apis, root, toolName) {
  const { session } = makePeerWireSession(apis, root, `forbidden-${toolName}`);
  const args = toolName === "todo"
    ? { items: [{ title: "peer-wire todo must not run" }] }
    : makeTaskArgs(`PeerWire${toolName}MustNotRun`);
  assertBlocked(
    () => session.consumeLogical(makeToolStartFrame(toolName, `peer-${toolName}|forbidden`, args)),
    `configured peer-wire ${toolName} START`,
  );
  assert.deepEqual(session.evidence.tool_events, [], `rejected peer-wire ${toolName} must not be recorded as an accepted tool event`);
}

function casePeerWireRejectsAfterBashStart(apis, root, toolName) {
  const { fixture, probe, evidence, session } = makePeerWireSession(apis, root, `after-start-${toolName}`);
  const bashCallId = `peer-bash|before-${toolName}`;
  session.consumeLogical(makeToolStartFrame("bash", bashCallId, { command: probe.command, cwd: probe.cwd }));
  assert.equal(evidence.probe_bash_start?.tool_call_id, bashCallId, "the configured Bash START must be correlated before phase rejection");
  const args = toolName === "read" ? { path: fixture.validPath } : { ids: [] };
  assertBlocked(
    () => session.consumeLogical(makeToolStartFrame(toolName, `peer-${toolName}|after-bash-start`, args)),
    `peer-wire ${toolName} START after the approved Bash START`,
  );
}

function casePeerWireRejectsAfterBashEnd(apis, root, toolName) {
  const { fixture, probe, evidence, session } = makePeerWireSession(apis, root, `after-end-${toolName}`);
  const bashCallId = `peer-bash|before-end-${toolName}`;
  session.consumeLogical(makeToolStartFrame("bash", bashCallId, { command: probe.command, cwd: probe.cwd }));
  session.consumeLogical(makeToolEndFrame("bash", bashCallId, { exitCode: 0, stdout: JSON.stringify(fixture.normalizedOutput) }));
  assert.deepEqual(evidence.probe_bash_end?.output, fixture.normalizedOutput, "the matching approved Bash END must remain allowed before the phase lock");
  const args = toolName === "read" ? { path: fixture.validPath } : { ids: [] };
  assertBlocked(
    () => session.consumeLogical(makeToolStartFrame(toolName, `peer-${toolName}|after-bash-end`, args)),
    `peer-wire ${toolName} START after the approved Bash END`,
  );
}

function caseFailedBashEndUnknownSdkExitAndMissingChild(apis, root) {
  const { fixture, probe, evidence, frame } = consumeRejectedProbeBashEnd(
    apis,
    root,
    "unknown-sdk-exit-missing-child",
    {
      payload: (fixture) => {
        const invalid = cloneJson(fixture.output);
        delete invalid.child_execution;
        invalid.diagnostics = {
          cot: "cot-diagnostic-secret-final-fallback-9f46",
          prompt: "prompt-diagnostic-secret-final-fallback-4a91",
          auth: "auth-diagnostic-secret-final-fallback-af57",
        };
        return invalid;
      },
      rawIsError: false,
      includeNestedIsError: true,
    },
  );
  const expectedOutput = cloneJson(fixture.normalizedOutput);
  const published = writeRejectedProbeEvidence(apis, root, {
    fixture,
    probe,
    evidence,
    frame,
    expectedOutput,
  });
  assertRetainedRejectedBashEnd({
    evidence,
    bytes: published.bytes,
    value: published.value,
    frame,
    expected: {
      sequence: 2,
      tool_call_id: frame.toolCallId,
      is_error: false,
      is_error_observed: true,
      exit_code: null,
      exit_code_observed: false,
    },
    label: "unknown SDK exit with raw isError:false and missing child_execution",
  });
}

function caseFailedBashEndRawErrorAndNonzeroExit(apis, root) {
  const { fixture, probe, evidence, frame } = consumeRejectedProbeBashEnd(
    apis,
    root,
    "raw-error-nonzero-exit",
    {
      payload: (fixture) => cloneJson(fixture.output),
      rawIsError: true,
      exitCode: 17,
      includeNestedIsError: true,
    },
  );
  const expectedOutput = cloneJson(fixture.normalizedOutputWithChild);
  const published = writeRejectedProbeEvidence(apis, root, {
    fixture,
    probe,
    evidence,
    frame,
    expectedOutput,
  });
  assertRetainedRejectedBashEnd({
    evidence,
    bytes: published.bytes,
    value: published.value,
    frame,
    expected: {
      sequence: 2,
      tool_call_id: frame.toolCallId,
      is_error: true,
      is_error_observed: true,
      exit_code: 17,
      exit_code_observed: true,
    },
    label: "raw isError:true with explicit nonzero SDK exit",
  });
}

function caseFailedBashEndUnknownRawFlag(apis, root) {
  const { fixture, probe, evidence, frame } = consumeRejectedProbeBashEnd(
    apis,
    root,
    "unknown-raw-flag",
    {
      payload: (fixture) => cloneJson(fixture.output),
      rawIsError: undefined,
      exitCode: 0,
      includeNestedIsError: false,
    },
  );
  const expectedOutput = cloneJson(fixture.normalizedOutputWithChild);
  const published = writeRejectedProbeEvidence(apis, root, {
    fixture,
    probe,
    evidence,
    frame,
    expectedOutput,
  });
  assertRetainedRejectedBashEnd({
    evidence,
    bytes: published.bytes,
    value: published.value,
    frame,
    expected: {
      sequence: 2,
      tool_call_id: frame.toolCallId,
      is_error: null,
      is_error_observed: false,
      exit_code: 0,
      exit_code_observed: true,
    },
    label: "unknown raw isError flag with explicit SDK exit zero",
  });
}


function parsePublished(target) {
  const bytes = fs.readFileSync(target);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function canonicalPublished(canonical, evidence) {
  return JSON.parse(canonical.serializeOperationalEvidence(evidence));
}

function selected(value, keys) {
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(value ?? {}, key)).map((key) => [key, value[key]]));
}

function writeAndRead(apis, runRoot, evidence) {
  fs.mkdirSync(runRoot, { recursive: true });
  const target = apis.fallback.writeEvidence(runRoot, evidence);
  assert.equal(target, path.join(runRoot, "evidence.json"), "the actual fallback writer must publish its official evidence target");
  return { target, ...parsePublished(target) };
}

function assertNoSecretValues(serializedText, label) {
  for (const secret of SECRET_VALUES) assert.equal(serializedText.includes(secret), false, `${label} must not publish ${secret}`);
  assert.equal(serializedText.includes("preflight-secret-final-fallback"), false, `${label} must not publish disabled-preflight secret material`);
}

function assertPromptDiagnosticRedaction(promptResult, serializedText) {
  assert.ok(promptResult && typeof promptResult === "object" && !Array.isArray(promptResult), "prompt_result must remain an operational object, not a redacted preview scalar");
  for (const [key, value] of Object.entries({
    prompt: "prompt-diagnostic-secret-final-fallback-4a91",
    task: "task-diagnostic-secret-final-fallback-5b02",
    model: "model-diagnostic-secret-final-fallback-6c13",
    message: "message-diagnostic-secret-final-fallback-7d24",
  })) {
    assert.ok(!Object.hasOwn(promptResult, key) || promptResult[key] === "<redacted>", `prompt_result.${key} must be absent or generically redacted`);
    assert.equal(serializedText.includes(value), false, `prompt_result.${key} diagnostic must not be published`);
  }
}

function caseLateOperationalCollections(apis, root, sourceBytes) {
  const evidence = makeRecordedEvidence(apis, root, sourceBytes);
  const rawBefore = JSON.stringify(evidence.native.raw_capture);
  const { bytes, value } = writeAndRead(apis, path.join(root, "late-operational-collections"), evidence);
  const expected = canonicalPublished(apis.canonical, evidence);
  assert.ok(bytes.byteLength <= MAX_CAPTURE_BYTES, "the complete official operational proof must remain under the existing 16 MiB physical bound");
  assert.equal(value.source_only, true, "the regression witness must remain source-only");
  assert.equal(value.native_claim, false, "the regression witness must never claim Native proof");

  for (const [collection, label] of [
    ["read_events", "late Root read events"],
    ["task_calls", "late task calls"],
    ["tool_events", "late tool events"],
    ["native_progress_terminal", "late terminal correlations"],
    ["subagent_frames", "original raw subagent captures"],
  ]) {
    assert.deepEqual(value.native[collection], expected.native[collection], `${label} must match the canonical operational serialization without preview truncation`);
  }
  assert.deepEqual(value.source.immutable_scope, expected.source.immutable_scope, "source control records must survive official serialization in full");
  assert.deepEqual(value.source.package_entries, expected.source.package_entries, "source package controls must survive official serialization in full");
  assert.equal(value.native.read_events.length, OPERATIONAL_RECORD_COUNT, "all Root read events must survive beyond the current generic array preview bound");
  assert.equal(value.native.task_calls.length, OPERATIONAL_RECORD_COUNT + 1, "all task calls must survive beyond the current generic array preview bound");
  assert.equal(value.native.native_progress_terminal.length, OPERATIONAL_RECORD_COUNT, "all terminal correlations must survive beyond the current generic array preview bound");
  assert.equal(value.native.subagent_frames.length, OPERATIONAL_RECORD_COUNT, "all raw subagent captures must survive beyond the current generic array preview bound");
  assert.equal(value.source.immutable_scope.length, SOURCE_CONTROL_COUNT, "all source controls must survive beyond the current generic array preview bound");
  assert.equal(value.source.package_entries.length, SOURCE_CONTROL_COUNT, "all source package controls must survive beyond the current generic array preview bound");
  assert.deepEqual(value.preservation, expected.preservation, "existing source/fixture/binary preservation controls must survive official serialization");

  const lateRead = value.native.read_events.find((entry) => entry.call_id === LATE_READ_CALL_ID);
  assert.deepEqual(selected(lateRead, ["sequence", "call_id", "paths", "success", "end_sequence"]), selected(expected.native.read_events.find((entry) => entry.call_id === LATE_READ_CALL_ID), ["sequence", "call_id", "paths", "success", "end_sequence"]), "the late correlated successful Root read must survive");
  assert.equal(lateRead?.success, true, "the late Root read must retain its observed success");
  assert.ok(Number.isSafeInteger(lateRead?.end_sequence), "the late Root read must retain its terminal END sequence");
  assert.equal(value.native.task_calls.at(-1)?.call_id, LATE_TASK_CALL_ID, "the late correlated task call must survive after the existing generic preview bound");
  assert.equal(value.native.task_calls.at(-1)?.items?.[0]?.name, "FallbackReviewLateAuthority", "the late task assignment identity must survive");

  const preflightEnd = value.native.tool_events.find((event) => event.event === "tool_execution_end" && event.toolCallId === PREFLIGHT_CALL_ID);
  assert.ok(preflightEnd, "the disabled preflight END must survive official serialization");
  assert.equal(preflightEnd.result?.disabled_agent, true, "the disabled preflight END must retain its observed disabled-agent classification");
  assert.equal(preflightEnd.result?.preflight_error, true, "the disabled preflight END must retain its observed preflight-error classification");
  assert.equal(preflightEnd.result?.success, false, "the disabled preflight END must retain its observed failure");
  assert.equal(value.native.root_reads.late_root_read?.call_id, LATE_READ_CALL_ID, "the official root-read summary must retain the late read correlation");
  assert.equal(value.native.disabled_preflight.tool_call_id, PREFLIGHT_CALL_ID, "the official disabled-preflight summary must retain the exact task-call correlation");

  const lateTerminal = value.native.native_progress_terminal.find((record) => record.id === LATE_TERMINAL_ID);
  assert.ok(lateTerminal, "the late terminal record must survive official serialization");
  assert.equal(lateTerminal.agent, "peer-reviewer", "the late terminal must retain its correlated agent");
  assert.equal(lateTerminal.agentSource, "project", "the late terminal must retain its correlated agentSource");
  assert.equal(lateTerminal.status, "completed", "the late terminal must retain its observed success status");
  assert.equal(lateTerminal.progress?.durationMs, 99_999, "the late terminal correlation marker must survive");
  assert.equal(lateTerminal.exit_code_observed, false, "the late terminal must preserve the absence of a child exit-code observation");

  assert.equal(value.source.immutable_scope.at(-1)?.path, "implementation-evidence/native-release/fallback.mjs#late-source-control", "the final source control record must survive");
  assert.equal(value.native.subagent_frames.at(-1)?.id, LATE_TERMINAL_ID, "the final raw subagent capture must survive");
  assert.equal(value.native.raw_capture.capture_id, "raw-capture|late-authority", "the original raw capture identity must survive");
  assert.equal(value.native.raw_capture.payload.raw_marker, "raw-operational-marker-final-fallback", "the original raw capture payload must survive");
  assert.equal(JSON.stringify(evidence.native.raw_capture), rawBefore, "official serialization must not mutate the original raw capture in memory");
  assertNoSecretValues(bytes.toString("utf8"), "official fallback evidence");
  assert.equal(value.native.raw_capture.secret_token, "<redacted>", "generic secret-key redaction must remain active");
  assert.equal(value.native.raw_capture.preview, "Bearer <redacted>", "generic preview redaction must remain active");
}

function casePromptTerminalAndDiagnostics(apis, root, sourceBytes) {
  const evidence = makeRecordedEvidence(apis, root, sourceBytes);
  const { bytes, value } = writeAndRead(apis, path.join(root, "prompt-terminal"), evidence);
  const promptResult = value.native.prompt_result;
  assert.ok(promptResult && typeof promptResult === "object" && !Array.isArray(promptResult), "prompt_result must remain an operational object, not a redacted preview scalar");
  assert.equal(promptResult.type, "prompt_result", "prompt_result type must remain available as operational metadata");
  assert.equal(promptResult.id, PROMPT_RESULT_ID, "prompt_result id must remain available as operational metadata");
  assert.equal(promptResult.status, "completed", "prompt_result status must remain available as operational metadata");
  assert.equal(promptResult.agentInvoked, true, "prompt_result agentInvoked must remain available as operational metadata");
  assert.equal(promptResult.sessionSettled, true, "prompt_result sessionSettled must remain available as operational metadata");
  assertPromptDiagnosticRedaction(promptResult, bytes.toString("utf8"));
  assertNoSecretValues(bytes.toString("utf8"), "prompt terminal evidence");
  assert.equal(value.native.raw_capture.preview, "Bearer <redacted>", "generic preview redaction must remain active while prompt metadata is retained");
}

function makeOversizedEvidence(apis, root, sourceBytes) {
  const evidence = makeRecordedEvidence(apis, root, sourceBytes);
  const overflow = Object.create(null);
  const rowCount = 40_000;
  const chunkBytes = 512;
  for (let index = 0; index < rowCount; index += 1) {
    const prefix = `overflow-row-${String(index).padStart(5, "0")}:`;
    overflow[`operational-entry-${String(index).padStart(5, "0")}`] = `${prefix}${"O".repeat(chunkBytes - prefix.length)}`;
  }
  evidence.native.operational_overflow = overflow;
  return evidence;
}

function caseOversizedFailsClosed(apis, root, sourceBytes) {
  const runRoot = path.join(root, "oversized-proof");
  const baseline = makeRecordedEvidence(apis, root, sourceBytes);
  const published = writeAndRead(apis, runRoot, baseline);
  const beforeBytes = Buffer.from(published.bytes);
  const beforeSha256 = sha256Bytes(beforeBytes);
  assert.ok(beforeBytes.byteLength <= MAX_CAPTURE_BYTES, "the baseline official proof must be physically bounded");

  const oversized = makeOversizedEvidence(apis, root, sourceBytes);
  const oversizedInputBytes = Buffer.byteLength(JSON.stringify(oversized), "utf8");

  assert.ok(oversizedInputBytes > MAX_CAPTURE_BYTES, "the oversized witness must exceed the existing 16 MiB physical bound before publication");
  let thrown = null;
  try {
    apis.fallback.writeEvidence(runRoot, oversized);
  } catch (error) {
    thrown = error;
  }
  const afterBytes = fs.readFileSync(published.target);
  assert.equal(Buffer.compare(afterBytes, beforeBytes), 0, "a failed oversized publication must preserve the previously published target bytes");
  assert.deepEqual(afterBytes, beforeBytes, "a failed oversized publication must not corrupt the previously published target");
  assert.equal(sha256Bytes(afterBytes), beforeSha256, "a failed oversized publication must preserve the published target digest");
  const after = JSON.parse(afterBytes.toString("utf8"));
  assert.equal(after.native.operational_overflow, undefined, "the published target must not contain a silently truncated oversized proof");
  assert.equal(after.native.native_progress_terminal.find((record) => record.id === LATE_TERMINAL_ID)?.status, "completed", "the preserved target must retain its late terminal authority");
  assert.ok(thrown, "an oversized operational proof must fail closed instead of silently publishing a preview-truncated target");
}
function executeCase(results, failures, name, run) {
  try {
    run();
    results.push({ name, status: "PASS", classification: "AC-016:fallback-proof-retention" });
  } catch (error) {
    const failureReasonExpected = error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
    const failure = { name, status: "FAIL", classification: "AC-016:fallback-proof-retention", failure_reason_expected: failureReasonExpected, error: safeError(error) };
    failures.push(failure);
    results.push(failure);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertRegularFile(options.source, "current fallback source");
  fs.mkdirSync(options.root, { recursive: true });
  const privateRoot = fs.mkdtempSync(path.join(options.root, "case-"));
  const apis = await loadApis({ ...options, root: privateRoot });
  const sourceBytes = fs.readFileSync(options.source);
  const results = [];
  const failures = [];
  executeCase(results, failures, "late correlated Root read/task/preflight END/terminal records survive official fallback serialization", () => caseLateOperationalCollections(apis, privateRoot, sourceBytes));
  executeCase(results, failures, "prompt terminal operational fields survive while prompt/task/model diagnostics remain redacted", () => casePromptTerminalAndDiagnostics(apis, privateRoot, sourceBytes));
  executeCase(results, failures, "oversized fallback proof fails closed without corrupting the previously published target", () => caseOversizedFailsClosed(apis, privateRoot, sourceBytes));
  executeCase(results, failures, "default fallback root tools remain allowed and retain observed event order", () => caseDefaultFallbackToolAllowlist(apis, privateRoot));
  executeCase(results, failures, "peer-wire allows read/grep/glob/wait before one exact approved Bash and processes helper output", () => casePeerWirePrecommandAndApprovedBash(apis, privateRoot));
  executeCase(results, failures, "peer-wire rejects todo before the approved Bash", () => casePeerWireForbiddenTool(apis, privateRoot, "todo"));
  executeCase(results, failures, "peer-wire rejects task before the approved Bash", () => casePeerWireForbiddenTool(apis, privateRoot, "task"));
  executeCase(results, failures, "peer-wire rejects tasks before the approved Bash", () => casePeerWireForbiddenTool(apis, privateRoot, "tasks"));
  executeCase(results, failures, "peer-wire rejects a read START after the approved Bash START", () => casePeerWireRejectsAfterBashStart(apis, privateRoot, "read"));
  executeCase(results, failures, "peer-wire rejects a wait START after the approved Bash START", () => casePeerWireRejectsAfterBashStart(apis, privateRoot, "wait"));
  executeCase(results, failures, "peer-wire rejects a read START after the matching approved Bash END", () => casePeerWireRejectsAfterBashEnd(apis, privateRoot, "read"));
  executeCase(results, failures, "peer-wire rejects a wait START after the matching approved Bash END", () => casePeerWireRejectsAfterBashEnd(apis, privateRoot, "wait"));
  executeCase(results, failures, "failed peer-wire Bash END with unknown SDK exit retains raw isError:false and missing-child bounded payload", () => caseFailedBashEndUnknownSdkExitAndMissingChild(apis, privateRoot));
  executeCase(results, failures, "failed peer-wire Bash END with raw isError:true and explicit nonzero exit retains bounded evidence", () => caseFailedBashEndRawErrorAndNonzeroExit(apis, privateRoot));
  executeCase(results, failures, "failed peer-wire Bash END with unknown raw isError flag retains observed child payload without fabricating SDK status", () => caseFailedBashEndUnknownRawFlag(apis, privateRoot));

  const output = {
    status: failures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "native-final-fallback-proof-retention-red",
    acceptance_criteria: ["AC-016"],
    source: { fallback: options.source, fallback_sha256: apis.fallbackSha256, fallback_bytes: sourceBytes.byteLength, canonical_serializer_sha256: apis.lifecycleSha256 },
    private_fixture: privateRoot,
    max_physical_bytes: MAX_CAPTURE_BYTES,
    operational_record_count: OPERATIONAL_RECORD_COUNT,
    source_control_count: SOURCE_CONTROL_COUNT,
    cases: results.length,
    cases_run: results,
    failures,
    source_only: true,
    native: false,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failures.length === 0) return;
  if (failures.some((failure) => !failure.failure_reason_expected)) {
    throw new ProbeSetupError("one or more fallback retention failures were not assertion failures", { failures });
  }
  const error = new Error("source-only fallback proof retention RED assertions failed as expected");
  error.name = "AssertionError";
  error.code = "ERR_ASSERTION";
  error.probe = output;
  throw error;
}

main().catch((error) => {
  if (error?.probe) process.stderr.write(`${JSON.stringify({ ...error.probe, error: safeError(error) }, null, 2)}\n`);
  else process.stderr.write(`${JSON.stringify({ status: "BLOCKED", phase: "RED", probe: "native-final-fallback-proof-retention-red", failure_reason_expected: false, error: safeError(error) }, null, 2)}\n`);
  process.exitCode = error?.name === "AssertionError" ? 1 : 2;
});
