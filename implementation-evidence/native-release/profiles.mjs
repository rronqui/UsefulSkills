#!/usr/bin/env node
// Disposable native OMP probe for T009A/T009B (AC-012/AC-013).
//
// This driver is intentionally an ephemeral local artifact.  It copies the
// installer-mapped ten skills and twelve agent profiles into a disposable
// project overlay, then asks the real OMP RPC root session to dispatch native
// task calls.  It never edits the checkout, installs into HOME, changes global
// settings, supplies a model per call, publishes, or performs host operations.
//
// OMP source/schema used by the prompt (pinned, read-only references):
// https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/task-agent-discovery.md
// https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/tools/task.md
// https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/rpc.md

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  openSync, closeSync, fstatSync, readSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const MAX_PHYSICAL_FRAME_BYTES = 1024 * 1024;
const MAX_REASSEMBLED_FRAME_BYTES = 64 * 1024 * 1024;
const DEFAULT_SESSION_TIMEOUT_MS = 900_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const decoder = new TextDecoder("utf-8", { fatal: true });
const TASK_WIRE_FORBIDDEN_KEYS = new Set([
  "model",
  "modelOverride",
  "model_override",
  "thinkingLevel",
  "thinking_level",
  "structured",
  "task.structured",
  "task_structured",
  "outputSchema",
  "output_schema",
  "schemaMode",
  "schema_mode",
  "isolated",
  "effort",
  "tools",
  "settings",
  "globalSettings",
  "global_settings",
  "model_route",
  "alias",
  "config",
  "provider",
  "modelRoute",
  "aliases",
]);
const RPC_EVENT_FILTER = Object.freeze([
  "message_end",
  "tool_execution_start",
  "tool_execution_end",
  "agent_end",
  "subagent_lifecycle",
  "subagent_progress",
  "subagent_event",
]);
const FORBIDDEN_NATIVE_TOOL_NAME = /(?:bash|shell|powershell|cmd(?:\.exe)?|ssh|host|write|edit|apply[_-]?patch|install|publish|deploy|service|git|curl|fetch|http|network|web|browser|get[_-]?subagents|workpool|settings|config|login|auth)/i;
const PROFILE_NAMES = Object.freeze([
  ["requirements-reader", "ProfileRequirementsReader"],
  ["architect", "ProfileArchitect"],
  ["host-operator", "ProfileHostOperator"],
  ["deep-reviewer", "ProfileDeepReviewer"],
  ["spec-kit-author", "ProfileSpecKitAuthor"],
  ["test-author", "ProfileTestAuthor"],
  ["backend-developer", "ProfileBackendDeveloper"],
  ["frontend-developer", "ProfileFrontendDeveloper"],
  ["refactorer", "ProfileRefactorer"],
  ["peer-reviewer", "ProfilePeerReviewer"],
  ["validator", "ProfileValidator"],
  ["integrator", "ProfileIntegrator"],
]);
const STRUCTURED_PROFILES = new Set([
  "requirements-reader",
  "architect",
  "host-operator",
  "deep-reviewer",
  "peer-reviewer",
]);
const REVIEW_ASSIGNMENTS = Object.freeze({
  deepOne: {
    id: "DeepReviewOne",
    agent: "deep-reviewer",
    files: ["src/checkout-good.mjs", "test/checkout-good.test.mjs"],
  },
  deepTwo: {
    id: "DeepReviewTwo",
    agent: "deep-reviewer",
    files: ["src/checkout-bad.mjs", "test/discount.test.mjs"],
  },
  peerPositive: {
    id: "PeerPositive",
    agent: "peer-reviewer",
    files: ["specs/specs005-omp-compatible-release/spec.md", "specs/specs005-omp-compatible-release/plan.md", "specs/specs005-omp-compatible-release/tasks.md", "specs/specs005-omp-compatible-release/contracts/interface-contract.md", "src/discount.mjs", "src/checkout-good.mjs", "test/checkout-good.test.mjs", "evidence/positive-test-evidence.json"],
  },
  peerNegative: {
    id: "PeerNegative",
    agent: "peer-reviewer",
    files: ["specs/specs005-omp-compatible-release/spec.md", "specs/specs005-omp-compatible-release/plan.md", "specs/specs005-omp-compatible-release/tasks.md", "specs/specs005-omp-compatible-release/contracts/interface-contract.md", "src/discount.mjs", "src/checkout-bad.mjs", "test/discount.test.mjs", "evidence/negative-test-evidence.json"],
  },
  peerMalformed: {
    id: "PeerMalformed",
    agent: "peer-reviewer",
    files: ["specs/specs005-omp-compatible-release/spec.md", "specs/specs005-omp-compatible-release/plan.md", "specs/specs005-omp-compatible-release/tasks.md", "specs/specs005-omp-compatible-release/contracts/interface-contract.md", "src/checkout-good.mjs", "test/checkout-good.test.mjs"],
  },
});

class DriverError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "DriverError";
    this.kind = kind;
    Object.assign(this, details);
  }
}

function assertion(message, details = {}) {
  throw new DriverError("ASSERTION", message, details);
}

function blocked(message, details = {}) {
  throw new DriverError("BLOCKED", message, details);
}

function now() {
  return new Date().toISOString();
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text ?? ""), "utf8"));
}

function scrubText(value, limit = 16_384) {
  return String(value ?? "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "<redacted-thinking>")
    .replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, "<redacted-analysis>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential|account[_-]?id|user[_-]?id))\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>")
    .replace(/((?:authorization|cookie))\s*:\s*[^\r\n]+/gi, "$1: <redacted>")
    .slice(0, limit);
}

function sensitiveKey(key) {
  return /(?:auth|token|secret|password|credential|account(?:[_-]?id)?|api[_-]?key|cookie|system[_-]?prompt|private[_-]?key|chain[_-]?of[_-]?thought|cot|reasoning|provider[_-]?error|raw[_-]?error)/i.test(String(key));
}

function sanitizeValue(value, depth = 0, key = "") {
  if (sensitiveKey(key)) return "<redacted>";
  if (depth > 16) return "<depth-limited>";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.slice(0, 96).map((item) => sanitizeValue(item, depth + 1, key));
  if (typeof value === "object") {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = sensitiveKey(childKey) ? "<redacted>" : sanitizeValue(childValue, depth + 1, childKey);
    }
    return result;
  }
  return String(value);
}

function safeTerminalText(value) {
  const raw = String(value ?? "");
  return {
    text: scrubText(raw),
    sha256: sha256Text(raw),
    bytes: Buffer.byteLength(raw, "utf8"),
  };
}

function opaqueError(value) {
  let raw;
  try {
    raw = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  raw = String(raw ?? "");
  const summary = { sha256: sha256Text(raw), bytes: Buffer.byteLength(raw, "utf8") };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["code", "type", "status"]) {
      if (typeof value[key] === "string") summary[key] = value[key].slice(0, 128);
    }
  } else {
    summary.type = typeof value;
  }
  return summary;
}
function safeRetry(value) {
  const summary = opaqueError(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["attempts", "attempt", "maxAttempts", "jobId", "id", "agent"]) {
      if (typeof value[key] === "number" || typeof value[key] === "string") summary[key] = sanitizeValue(value[key]);
    }
  }
  return summary;
}
function nativeFailureText(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return nativeFailureText(parsed);
    } catch {
      // Preserve only bounded text for classification; raw error payloads remain hashed.
    }
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  for (const key of ["message", "errorMessage", "finalError", "error", "stderr"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = nativeFailureText(candidate);
      if (nested) return nested;
    }
  }
  return "";
}

function nativeFailureClassification(value) {
  const explicit = value && typeof value === "object" && typeof value.classification === "string" ? value.classification.trim().toLowerCase() : "";
  if (["schema", "yield", "auth", "transport", "harness", "unknown"].includes(explicit)) return { classification: explicit, source: "producer" };
  let source = value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) source = parsed;
    } catch {
      // The original string remains available for bounded classification.
    }
  }
  const text = [
    nativeFailureText(value),
    source && typeof source === "object" ? source.name : "",
    source && typeof source === "object" ? source.code : "",
    source && typeof source === "object" ? source.type : "",
    source && typeof source === "object" ? source.status : "",
  ].filter((part) => typeof part === "string").join(" ").toLowerCase();
  if (/(?:schema|structured|validation|invalid\s+(?:output|payload)|output\s+schema)/i.test(text)) return { classification: "schema", source: "message-pattern" };
  if (/(?:yield|missing\s+yield|terminal\s+payload)/i.test(text)) return { classification: "yield", source: "message-pattern" };
  if (/(?:auth|credential|login|unauthori[sz]ed|forbidden|token|provider|http\s*[45]\d\d|rate.?limit)/i.test(text)) return { classification: "auth", source: "message-pattern" };
  if (/(?:rpc|protocol|chunk|transport|jsonl|json\s+parse)/i.test(text)) return { classification: "transport", source: "message-pattern" };
  if (/(?:harness|driver|observer|fixture|controlled|native\s+(?:task|peer|profile))/i.test(text)) return { classification: "harness", source: "message-pattern" };
  return { classification: "unknown", source: "unverified" };
}

function safeNativeFailure(value) {
  const summary = opaqueError(value);
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  for (const key of ["name", "code", "status", "type"]) {
    if (typeof source[key] === "string") summary[key] = source[key].slice(0, 128);
  }
  const classification = nativeFailureClassification(value);
  summary.classification = classification.classification;
  summary.classification_source = classification.source;
  const message = nativeFailureText(value);
  if (message && ["schema", "yield", "harness"].includes(classification.classification)) {
    summary.message = scrubText(message, 2048);
  }
  if (message) {
    summary.message_sha256 = sha256Text(message);
    summary.message_bytes = Buffer.byteLength(message, "utf8");
  }
  return summary;
}
function safePublicTerminalText(value) {
  const raw = String(value ?? "");
  const terminal = safeTerminalText(raw);
  if (nativeFailureClassification(raw).classification === "auth") terminal.text = "<redacted-provider-error>";
  return terminal;
}

function textFromContent(value) {
  if (!Array.isArray(value)) return "";
  return value
    .filter((block) => block && typeof block === "object" && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function safeToolResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output = {};
  for (const key of ["status", "success", "aborted", "toolCallId", "toolName"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) output[key] = sanitizeValue(value[key]);
  }
  for (const key of ["error", "errorMessage", "finalError"]) {
    if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined && value[key] !== null) {
      output.error = safeNativeFailure(value[key]);
      break;
    }
  }
  if (value.structuredOutput) output.structuredOutput = safeStructuredOutput(value.structuredOutput);
  const text = textFromContent(value.content);
  if (text) {
    const terminal = safePublicTerminalText(text);
    output.output_text = terminal.text;
    output.output_sha256 = terminal.sha256;
    output.output_bytes = terminal.bytes;
  }
  if (typeof value.output === "string") {
    const terminal = safePublicTerminalText(value.output);
    const failed = (typeof value.exitCode === "number" && value.exitCode !== 0) || ["failed", "error", "aborted", "canceled", "cancelled"].includes(String(value.status ?? "").toLowerCase());
    if (failed) output.output_error = safeNativeFailure(value.output);
    else output.output_text = terminal.text;
    output.output_sha256 = terminal.sha256;
    output.output_bytes = terminal.bytes;
  }
  if (value.details && typeof value.details === "object" && !Array.isArray(value.details)) {
    if (value.details.structuredOutput) output.structuredOutput = safeStructuredOutput(value.details.structuredOutput);
    if (Array.isArray(value.details.yield)) output.yield = value.details.yield.slice(0, 32).map((item) => sanitizeValue(item));
  }
  return Object.keys(output).length > 0 ? output : null;
}

function safeSubagentEvent(event, subagentId) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const output = { subagent_id: subagentId ?? null, event_type: typeof event.type === "string" ? event.type : null };
  for (const key of ["toolCallId", "toolName", "messageId", "status", "yielded", "isTerminal", "awaitingAsyncWork", "success", "aborted"]) {
    if (Object.prototype.hasOwnProperty.call(event, key)) output[key] = sanitizeValue(event[key]);
  }
  for (const key of ["error", "errorMessage", "finalError"]) {
    if (Object.prototype.hasOwnProperty.call(event, key) && event[key] !== undefined && event[key] !== null) {
      output.error = safeNativeFailure(event[key]);
      break;
    }
  }
  if (event.result !== undefined) {
    const result = safeToolResult(event.result);
    if (result) output.result = result;
  }
  const messages = Array.isArray(event.messages) ? event.messages : event.message ? [event.message] : [];
  const assistant = [];
  for (const message of messages) {
    const safeMessage = safeAssistantTranscript(message, subagentId);
    if (safeMessage) assistant.push(safeMessage);
  }
  if (assistant.length > 0) output.assistant = assistant;
  const terminal = event.type === "agent_end" || event.type === "tool_execution_end" || event.type === "message_end" || output.error || output.result || assistant.length > 0;
  return terminal ? output : null;
}

function safeSubagentPayload(frameType, payload, subagentId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const output = {
    frame_type: frameType,
    subagent_id: subagentId ?? null,
  };
  for (const key of ["id", "index", "agent", "agentSource", "status", "isError", "aborted", "sessionFile", "parentToolCallId"]) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) output[key] = typeof payload[key] === "string" ? scrubText(payload[key]) : sanitizeValue(payload[key]);
  }
  for (const key of ["task", "assignment", "description"]) {
    if (typeof payload[key] === "string") output[`${key}_sha256`] = sha256Text(payload[key]);
  }
  for (const key of ["error", "errorMessage", "finalError"]) {
    if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined && payload[key] !== null) {
      output.error = safeNativeFailure(payload[key]);
      break;
    }
  }
  if (payload.progress && typeof payload.progress === "object") output.progress = safeSubagentProgress(payload.progress);
  if (payload.event && typeof payload.event === "object") {
    const event = safeSubagentEvent(payload.event, subagentId);
    if (event) output.event = event;
  }
  if (payload.structuredOutput) output.structuredOutput = safeStructuredOutput(payload.structuredOutput);
  if (String(payload.status ?? "").toLowerCase() === "failed" && !output.error && !output.event?.error && !output.progress?.failure) {
    output.failure = { classification: "unknown", classification_source: "status-only", status: "failed" };
  }
  const progressStatus = payload.progress && typeof payload.progress.status === "string" ? payload.progress.status : "";
  const terminal = ["completed", "failed", "aborted"].includes(String(payload.status ?? "").toLowerCase())
    || ["completed", "failed", "aborted"].includes(progressStatus.toLowerCase())
    || payload.progress?.retryFailure !== undefined
    || payload.progress?.retryState !== undefined
    || output.error
    || output.event?.error
    || output.event?.result
    || output.event?.assistant
    || output.structuredOutput;
  return terminal ? output : null;
}
function nativeProgressTerminalRecord(payloadEvidence) {
  if (!payloadEvidence || payloadEvidence.frame_type !== "subagent_progress" || !payloadEvidence.progress) return null;
  const progress = payloadEvidence.progress;
  const status = String(progress.status ?? payloadEvidence.status ?? "").toLowerCase();
  if (!["completed", "complete", "success", "succeeded", "failed", "error", "aborted", "canceled", "cancelled"].includes(status)) return null;
  const id = [payloadEvidence.id, payloadEvidence.subagent_id, progress.id].find((value) => typeof value === "string" && value !== "") ?? null;
  if (!id) return null;
  const output = {
    source_kind: "native_subagent_progress",
    frame_type: payloadEvidence.frame_type,
    id,
    agent: progress.agent ?? payloadEvidence.agent ?? null,
    agentSource: progress.agentSource ?? payloadEvidence.agentSource ?? null,
    status: progress.status ?? payloadEvidence.status ?? null,
    exitCode: Number.isFinite(progress.exitCode) && Number.isInteger(progress.exitCode) ? progress.exitCode : null,
    exit_code_invalid: progress.exit_code_invalid === true,
    parentToolCallId: progress.parentToolCallId ?? payloadEvidence.parentToolCallId ?? null,
    isError: progress.isError === true || payloadEvidence.isError === true ? true : progress.isError === false || payloadEvidence.isError === false ? false : null,
    aborted: progress.aborted === true || payloadEvidence.aborted === true ? true : progress.aborted === false || payloadEvidence.aborted === false ? false : null,
    progress,
  };
  for (const key of ["resolvedModel", "resolvedModelIdentity", "resolvedThinkingLevel", "resolvedModelIsFallback", "taskFile", "taskFileSha256", "structuredOutput", "yield", "yield_source", "failure", "error", "retryFailure", "retryState"]) {
    if (Object.prototype.hasOwnProperty.call(progress, key)) output[key] = progress[key];
  }
  return output;
}
function safeKeyTree(value, depth = 0) {
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (value === null || typeof value !== "object" || depth > 2) return { kind };
  if (Array.isArray(value)) {
    return {
      kind,
      length: value.length,
      item: value.length > 0 ? safeKeyTree(value[0], depth + 1) : null,
    };
  }
  const keys = Object.keys(value).filter((key) => !sensitiveKey(key)).sort();
  return {
    kind,
    keys: keys.slice(0, 128).map((key) => (
      depth === 2
        ? { key, kind: value[key] === null ? "null" : Array.isArray(value[key]) ? "array" : typeof value[key] }
        : { key, child: safeKeyTree(value[key], depth + 1) }
    )),
    truncated: keys.length > 128,
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new DriverError("USAGE", `unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!new Set(["omp", "source", "lab", "phase", "timeout-ms", "replay-peer-evidence", "replay-fixture", "replay-batch-evidence"]).has(name)) {
      throw new DriverError("USAGE", `unsupported option: --${name}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new DriverError("USAGE", `missing value for --${name}`);
    values[name] = value;
    index += 1;
  }
  for (const required of ["omp", "source", "lab", "phase"]) {
    if (!values[required]) throw new DriverError("USAGE", `required option missing: --${required}`);
  }
  if (!["red", "green"].includes(values.phase)) throw new DriverError("USAGE", "--phase must be red or green");
  const timeoutMs = values["timeout-ms"] === undefined ? DEFAULT_SESSION_TIMEOUT_MS : Number(values["timeout-ms"]);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 900_000) {
    throw new DriverError("USAGE", "--timeout-ms must be an integer from 30000 through 900000");
  }
  return {
    omp: values.omp,
    source: values.source,
    lab: values.lab,
    phase: values.phase,
    timeoutMs,
    replayPeerEvidence: values["replay-peer-evidence"] ?? null,
    replayFixture: values["replay-fixture"] ?? null,
    replayBatchEvidence: values["replay-batch-evidence"] ?? null,
  };
}

function comparePath(value) {
  const normalized = resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(left, right) {
  return comparePath(left) === comparePath(right);
}

function isSameOrDescendant(parent, child) {
  const parentValue = comparePath(parent);
  const childValue = comparePath(child);
  if (parentValue === childValue) return true;
  const rest = relative(parentValue, childValue);
  return rest !== "" && !rest.startsWith(`..${sep}`) && rest !== ".." && !isAbsolute(rest);
}

function existingDirectory(label, value) {
  if (!isAbsolute(value) || value.includes("\0")) blocked(`${label} must be an absolute path`);
  let real;
  try {
    real = realpathSync(value);
  } catch (error) {
    blocked(`${label} is not resolvable`, { error: opaqueError(error?.message ?? error) });
  }
  const info = lstatSync(real);
  if (!info.isDirectory() || info.isSymbolicLink()) blocked(`${label} must be a real directory`);
  return real;
}

function existingFile(label, value) {
  if (!isAbsolute(value) || value.includes("\0")) blocked(`${label} must be an absolute path`);
  let real;
  try {
    real = realpathSync(value);
  } catch (error) {
    blocked(`${label} is not resolvable`, { error: opaqueError(error?.message ?? error) });
  }
  const info = lstatSync(real);
  if (!info.isFile() || info.isSymbolicLink()) blocked(`${label} must be a real file`);
  return real;
}

function assertNewDirectory(path, label) {
  if (existsSync(path)) blocked(`${label} already exists; refusing to reuse a prior native run`);
  mkdirSync(path, { recursive: false });
}

function assertInside(root, child, label) {
  if (!isSameOrDescendant(root, child)) blocked(`${label} escaped the lab boundary`);
}

function ensureRegularFile(path, label) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (typeof info.nlink === "number" && info.nlink > 1)) {
    blocked(`${label} is not a regular single-link file`);
  }
}

function copyExact(source, destination, label) {
  ensureRegularFile(source, label);
  mkdirSync(dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    const info = lstatSync(destination);
    if (info.isSymbolicLink() || !info.isFile()) blocked(`${label} destination is unsafe`);
  }
  const bytes = readFileSync(source);
  writeFileSync(destination, bytes);
  ensureRegularFile(destination, label);
  const destinationBytes = readFileSync(destination);
  if (!bytes.equals(destinationBytes)) blocked(`${label} copy changed bytes`);
  return {
    source,
    destination,
    sourceSha256: sha256Bytes(bytes),
    copySha256: sha256Bytes(destinationBytes),
    bytes: bytes.byteLength,
  };
}

const INSTALLER_SKILLS = [
  "alignment",
  "bug-diagnosis",
  "conflict-resolution",
  "deep-review",
  "release-bootstrap",
  "ship",
  "tdd-orchestrator",
  "architecture",
  "secure-linux-web-hosting",
  "retro",
];
const INSTALLER_AGENTS = [
  ["tdd-orchestrator", "agents", "backend-developer.md"],
  ["tdd-orchestrator", "agents", "frontend-developer.md"],
  ["tdd-orchestrator", "agents", "integrator.md"],
  ["tdd-orchestrator", "agents", "peer-reviewer.md"],
  ["tdd-orchestrator", "agents", "refactorer.md"],
  ["tdd-orchestrator", "agents", "spec-kit-author.md"],
  ["tdd-orchestrator", "agents", "test-author.md"],
  ["tdd-orchestrator", "agents", "validator.md"],
  ["deep-review", "agents", "deep-reviewer.md"],
  ["alignment", "agents", "requirements-reader.md"],
  ["architecture", "agents", "architect.md"],
  ["secure-linux-web-hosting", "agents", "host-operator.md"],
];
function nativeReplayDependencies() {
  return new Set([
    ...INSTALLER_AGENTS.map(([skill, subdir, file]) => `${skill}/${subdir}/${file}`),
    "deep-review/lib/protocol.mjs",
  ]);
}

function walkRegularFiles(root, label) {
  const rootReal = existingDirectory(`${label} root`, root);
  const files = [];
  const visit = (directory) => {
    const names = readdirSync(directory).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    for (const name of names) {
      const path = join(directory, name);
      const info = lstatSync(path);
      if (info.isSymbolicLink()) blocked(`${label} contains a symbolic link: ${path}`);
      if (info.isDirectory()) {
        visit(path);
      } else if (info.isFile()) {
        if (typeof info.nlink === "number" && info.nlink > 1) blocked(`${label} contains a hardlink: ${path}`);
        const relativePath = relative(rootReal, path).replaceAll("\\", "/");
        if (relativePath.startsWith("../") || isAbsolute(relativePath)) blocked(`${label} escaped its root`);
        files.push({ path, relativePath });
      } else {
        blocked(`${label} contains a special file: ${path}`);
      }
    }
  };
  visit(rootReal);
  if (files.length === 0) blocked(`${label} contains no regular files`);
  return files;
}

function sourceManifest(sourceRoot) {
  const entries = [];
  const destinations = new Set();
  const addEntry = ({ kind, sourceRelativePath, destinationRelative, source }) => {
    const destinationKey = destinationRelative.replaceAll("\\", "/");
    if (destinations.has(destinationKey)) blocked(`duplicate frozen-package destination: ${destinationKey}`);
    destinations.add(destinationKey);
    ensureRegularFile(source, `source ${sourceRelativePath}`);
    const bytes = readFileSync(source);
    entries.push({
      kind,
      sourceRelativePath,
      destinationRelative: destinationKey,
      source,
      sourceSha256: sha256Bytes(bytes),
      bytes: bytes.byteLength,
    });
  };
  for (const skill of INSTALLER_SKILLS) {
    const skillRoot = join(sourceRoot, skill);
    for (const file of walkRegularFiles(skillRoot, `skill ${skill}`)) {
      addEntry({
        kind: "skill",
        sourceRelativePath: `${skill}/${file.relativePath}`,
        destinationRelative: `skills/${skill}/${file.relativePath}`,
        source: file.path,
      });
    }
  }
  for (const [skill, subdir, file] of INSTALLER_AGENTS) {
    addEntry({
      kind: "agent",
      sourceRelativePath: `${skill}/${subdir}/${file}`,
      destinationRelative: `agents/${file}`,
      source: join(sourceRoot, skill, subdir, file),
    });
  }
  return entries;
}

function manifestDigest(entries) {
  const rows = entries
    .map((entry) => `${entry.kind}\0${entry.sourceRelativePath}\0${entry.destinationRelative}\0${entry.sourceSha256}\0${entry.bytes}`)
    .sort();
  return sha256Text(rows.join("\n"));
}

function freezePackage(runRoot, entries) {
  const packageRoot = join(runRoot, "frozen-package");
  mkdirSync(packageRoot, { recursive: false });
  const frozen = entries.map((entry) => {
    const packagePath = join(packageRoot, entry.destinationRelative);
    const copy = copyExact(entry.source, packagePath, `freeze ${entry.sourceRelativePath}`);
    if (copy.sourceSha256 !== entry.sourceSha256 || copy.copySha256 !== entry.sourceSha256) {
      blocked(`frozen package hash mismatch for ${entry.sourceRelativePath}`);
    }
    return { ...entry, packagePath, packageSha256: copy.copySha256 };
  });
  const manifest = frozen.map((entry) => ({
    kind: entry.kind,
    source: entry.sourceRelativePath,
    destination: entry.destinationRelative,
    sha256: entry.sourceSha256,
    bytes: entry.bytes,
  }));
  const manifestPath = join(packageRoot, "MANIFEST.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    root: packageRoot,
    manifestPath,
    manifestSha256: sha256Bytes(readFileSync(manifestPath)),
    manifestDigest: manifestDigest(frozen),
    entries: frozen,
  };
}

function assertFrozenPackageUnchanged(packageInfo, label) {
  for (const entry of packageInfo.entries) {
    ensureRegularFile(entry.packagePath, `${label} frozen package`);
    const bytes = readFileSync(entry.packagePath);
    if (sha256Bytes(bytes) !== entry.sourceSha256 || bytes.byteLength !== entry.bytes) {
      assertion(`${label} changed the frozen package`, { expectedRed: false, path: entry.destinationRelative });
    }
  }
  const manifestBytes = readFileSync(packageInfo.manifestPath);
  if (sha256Bytes(manifestBytes) !== packageInfo.manifestSha256) {
    assertion(`${label} changed the frozen package manifest`, { expectedRed: false });
  }
}

function captureSourceHashes(sourceRoot, entries, label) {
  return entries.map((entry) => {
    const source = join(sourceRoot, entry.sourceRelativePath);
    ensureRegularFile(source, `${label} ${entry.sourceRelativePath}`);
    const bytes = readFileSync(source);
    return {
      path: entry.sourceRelativePath,
      destination: entry.destinationRelative,
      sha256: sha256Bytes(bytes),
      bytes: bytes.byteLength,
    };
  });
}

function installOverlay(packageEntries, worktree, label) {
  const destinationRoot = join(worktree, ".omp");
  assertInside(worktree, destinationRoot, `${label} overlay`);
  const copies = packageEntries.map((entry) => {
    const destination = join(destinationRoot, entry.destinationRelative);
    const copy = copyExact(entry.packagePath, destination, `${label} ${entry.destinationRelative}`);
    if (copy.sourceSha256 !== entry.sourceSha256 || copy.copySha256 !== entry.sourceSha256) {
      blocked(`${label} source/copy hash mismatch for ${entry.destinationRelative}`);
    }
    return { ...copy, packagePath: entry.packagePath };
  });
  return { destinationRoot, copies };
}

function createOmpEnvironment() {
  const env = { ...process.env };
  // Keep normal HOME/USERPROFILE and all existing OMP authentication/cache
  // state.  Only ambient command-injection variables are removed.
  for (const key of ["NODE_OPTIONS", "BASH_ENV", "ENV"]) delete env[key];
  return env;
}

function createGitEnvironment(runRoot) {
  const globalConfig = join(runRoot, "git-global-empty.conf");
  const templateDir = join(runRoot, "git-template-empty");
  const hooksDir = join(runRoot, "git-hooks-empty");
  writeFileSync(globalConfig, "");
  mkdirSync(templateDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });
  const env = { ...process.env };
  const removed = new Set([
    "SSH_AUTH_SOCK",
    "GIT_ASKPASS",
    "GIT_SSH",
    "GIT_SSH_COMMAND",
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_SYSTEM",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
  ]);
  for (const key of Object.keys(env)) {
    if (removed.has(key) || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key)) delete env[key];
  }
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = globalConfig;
  env.GIT_TEMPLATE_DIR = templateDir;
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_ALLOW_PROTOCOL = "file";
  return { env, globalConfig, templateDir, hooksDir };
}

function runGit(cwd, args, env, label, input) {
  const result = spawnSync("git", args, {
    cwd,
    env,
    input,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new DriverError("BLOCKED", `${label} failed`, {
      gitStatus: result.status,
      gitError: opaqueError(result.error?.message),
      gitStderr: opaqueError(result.stderr ?? ""),
    });
  }
  return String(result.stdout ?? "").trim();
}
function runFixtureTest(repo, relativeTest, env, label) {
  const result = spawnSync(process.execPath, ["--test", relativeTest], {
    cwd: repo,
    env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new DriverError("BLOCKED", `${label} fixture test failed`, {
      exitCode: result.status,
      output: opaqueError(`${result.stdout ?? ""}\n${result.stderr ?? ""}`),
      error: opaqueError(result.error?.message),
    });
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    command: `${process.execPath} --test ${relativeTest}`,
    status: "PASS",
    exitCode: result.status,
    output_sha256: sha256Text(output),
    output_bytes: Buffer.byteLength(output, "utf8"),
  };
}


function createReviewFixture(fixtureRoot, sourceEntries, runRoot) {
  assertInside(runRoot, fixtureRoot, "review fixture");
  mkdirSync(fixtureRoot, { recursive: true });
  const gitEnv = createGitEnvironment(fixtureRoot);
  const repo = join(fixtureRoot, "repository");
  const worktreeRoot = join(fixtureRoot, "worktrees");
  mkdirSync(repo);
  mkdirSync(worktreeRoot);
  runGit(repo, ["init", "--quiet", "--initial-branch=main"], gitEnv.env, "git init");
  runGit(repo, ["config", "--local", "user.name", "Native Profile Fixture"], gitEnv.env, "git user.name");
  runGit(repo, ["config", "--local", "user.email", "native-profile@example.invalid"], gitEnv.env, "git user.email");
  runGit(repo, ["config", "--local", "commit.gpgsign", "false"], gitEnv.env, "git commit.gpgsign");
  runGit(repo, ["config", "--local", "core.hooksPath", gitEnv.hooksDir], gitEnv.env, "git core.hooksPath");
  runGit(repo, ["config", "--local", "init.templateDir", gitEnv.templateDir], gitEnv.env, "git init.templateDir");
  writeFileSync(join(repo, "README.md"), "# Native profile fixture baseline\n", "utf8");
  runGit(repo, ["add", "--", "README.md"], gitEnv.env, "git add fixture baseline");
  runGit(repo, ["commit", "--quiet", "-m", "fixture baseline"], gitEnv.env, "git fixture baseline commit");
  const baselineRevision = runGit(repo, ["rev-parse", "HEAD"], gitEnv.env, "git fixture baseline revision");
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "test"), { recursive: true });
  mkdirSync(join(repo, "evidence"), { recursive: true });
  mkdirSync(join(repo, "specs/specs005-omp-compatible-release/contracts"), { recursive: true });
  mkdirSync(join(repo, "docs"), { recursive: true });

  writeFileSync(join(repo, "spec.md"), [
    "# Discount fixture contract",
    "",
    "- AC-FIX-001: checkout must apply the requested percentage discount.",
    "- AC-FIX-002: checkout delegates to the discount helper and returns its value.",
    "- The review must inspect the consumer, not only the helper or a passing helper test.",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(repo, "specs/specs005-omp-compatible-release/spec.md"), [
    "# Native profile review fixture",
    "",
    "Feature: consumer-visible discount handoff",
    "Contract version: 0.2",
    "",
    "## Acceptance criteria",
    "",
    "- AC-FIX-001: checkout must apply the requested percentage discount.",
    "- AC-FIX-002: checkout must delegate to the discount helper and return its value.",
    "",
    "The review must inspect the consumer implementation, the exact diff, and the real test evidence; helper-only evidence cannot approve the consumer.",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(repo, "specs/specs005-omp-compatible-release/plan.md"), [
    "# Native profile review fixture plan",
    "",
    "Task: T009-FIX consumer review handoff",
    "Implemented by: fixture-author",
    "Reviewed by: peer-reviewer",
    "The dispatcher supplies the exact local revision, baseline revision, and full diff in the assignment context.",
    "All work is read-only for the reviewer; no host or repository mutation is authorized.",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(repo, "specs/specs005-omp-compatible-release/tasks.md"), [
    "# Native profile review fixture tasks",
    "",
    "## T009-FIX — review the consumer handoff",
    "",
    "implemented_by: fixture-author",
    "reviewed_by: peer-reviewer",
    "allowed_write_globs: []",
    "local_revision_context: exact fixture HEAD is supplied by the dispatcher",
    "",
    "### Criteria and real test evidence",
    "",
    "AC-FIX-001:",
    "  - test/checkout-good.test.mjs::checkout applies the contract discount",
    "AC-FIX-002:",
    "  - test/checkout-good.test.mjs::checkout applies the contract discount",
    "Supporting helper-only evidence (not consumer approval): evidence/negative-test-evidence.json",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(repo, "specs/specs005-omp-compatible-release/contracts/interface-contract.md"), [
    "# Native profile review fixture interface contract",
    "",
    "Version: 0.2",
    "",
    "## Consumer interface",
    "",
    "`checkout(total, percent)` MUST delegate to `discount(total, percent)` and return the helper result.",
    "For finite inputs, the helper applies `Math.round(total * (1 - percent / 100) * 100) / 100`.",
    "The consumer-visible test evidence is `test/checkout-good.test.mjs::checkout applies the contract discount`.",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(repo, "src/discount.mjs"), [
    "export function discount(total, percent) {",
    "  if (!Number.isFinite(total) || !Number.isFinite(percent)) throw new TypeError('finite numbers required');",
    "  return Math.round(total * (1 - percent / 100) * 100) / 100;",
    "}",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(repo, "src/checkout-good.mjs"), [
    "import { discount } from './discount.mjs';",
    "",
    "export function checkout(total, percent) {",
    "  return discount(total, percent);",
    "}",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(repo, "src/checkout-bad.mjs"), [
    "import { discount } from './discount.mjs';",
    "",
    "export function checkout(total, percent) {",
    "  return total;",
    "}",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(repo, "test/checkout-good.test.mjs"), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { checkout } from '../src/checkout-good.mjs';",
    "",
    "test('checkout applies the contract discount', () => {",
    "  assert.equal(checkout(100, 15), 85);",
    "});",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(repo, "test/discount.test.mjs"), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { discount } from '../src/discount.mjs';",
    "",
    "test('discount helper returns the expected value', () => {",
    "  assert.equal(discount(100, 15), 85);",
    "});",
    "",
  ].join("\n"), "utf8");
  const positiveEvidence = runFixtureTest(repo, "test/checkout-good.test.mjs", gitEnv.env, "positive");
  positiveEvidence.scope = "fixture-only explicit evidence supplied to the reviewer";
  writeFileSync(join(repo, "evidence/positive-test-evidence.json"), `${JSON.stringify(positiveEvidence, null, 2)}\n`, "utf8");
  const negativeEvidence = runFixtureTest(repo, "test/discount.test.mjs", gitEnv.env, "helper-only");
  negativeEvidence.scope = "helper-only evidence; consumer coverage is intentionally absent";
  writeFileSync(join(repo, "evidence/negative-test-evidence.json"), `${JSON.stringify(negativeEvidence, null, 2)}\n`, "utf8");
  runGit(repo, ["add", "--", "spec.md", "specs", "src", "test", "evidence"], gitEnv.env, "git add review fixture");
  runGit(repo, ["commit", "--quiet", "-m", "native profile review fixture"], gitEnv.env, "git fixture commit");
  const revision = runGit(repo, ["rev-parse", "HEAD"], gitEnv.env, "git fixture revision");
  const parentRevision = runGit(repo, ["rev-parse", `${revision}^`], gitEnv.env, "git fixture parent revision");
  if (parentRevision !== baselineRevision) blocked("fixture review revision is not directly based on the recorded baseline revision");
  const fullDiff = runGit(repo, ["diff", "--no-ext-diff", "--binary", baselineRevision, revision], gitEnv.env, "git fixture full diff");
  if (!fullDiff.includes("diff --git")) blocked("fixture full diff was empty; positive/negative review handoff lacks a real revision delta");
  const diffEvidence = {
    baseline_revision: baselineRevision,
    revision,
    sha256: sha256Text(fullDiff),
    bytes: Buffer.byteLength(fullDiff, "utf8"),
    content: fullDiff,
  };
  const worktree = join(worktreeRoot, "review");
  runGit(repo, ["worktree", "add", "--quiet", "--detach", worktree, revision], gitEnv.env, "git review worktree");
  const overlay = installOverlay(sourceEntries, worktree, "review fixture");
  if (runGit(worktree, ["remote"], gitEnv.env, "git review remote") !== "") blocked("review fixture unexpectedly has a Git remote");
  return { fixtureRoot, repo, worktreeRoot, worktree, baselineRevision, revision, diffEvidence, overlay, env: gitEnv.env };
}
function loadExistingReviewFixture(worktreePath, packageInfo, runRoot) {
  const worktree = existingDirectory("--replay-fixture", worktreePath);
  const gitEnv = createGitEnvironment(runRoot);
  const topLevel = runGit(worktree, ["rev-parse", "--show-toplevel"], gitEnv.env, "replay fixture top-level");
  if (!samePath(topLevel, worktree)) blocked("replay fixture path did not resolve to its Git top-level");
  const revision = runGit(worktree, ["rev-parse", "HEAD"], gitEnv.env, "replay fixture revision");
  const baselineRevision = runGit(worktree, ["rev-parse", `${revision}^`], gitEnv.env, "replay fixture baseline revision");
  if (!/^[0-9a-f]{40}$/i.test(revision) || !/^[0-9a-f]{40}$/i.test(baselineRevision)) blocked("replay fixture did not expose full Git revisions");
  const fullDiff = runGit(worktree, ["diff", "--no-ext-diff", "--binary", baselineRevision, revision], gitEnv.env, "replay fixture full diff");
  if (!fullDiff.includes("diff --git")) blocked("replay fixture full diff was empty");
  if (runGit(worktree, ["remote"], gitEnv.env, "replay fixture remote") !== "") blocked("replay fixture unexpectedly has a Git remote");
  const destinationRoot = join(worktree, ".omp");
  existingDirectory("replay fixture overlay", destinationRoot);
  const nativeDependencies = nativeReplayDependencies();
  const packageMismatches = [];
  const copies = packageInfo.entries.map((entry) => {
    const destination = join(destinationRoot, entry.destinationRelative);
    ensureRegularFile(destination, `replay fixture ${entry.destinationRelative}`);
    const packageBytes = readFileSync(entry.packagePath);
    const destinationBytes = readFileSync(destination);
    const packageSha256 = sha256Bytes(packageBytes);
    const overlaySha256 = sha256Bytes(destinationBytes);
    const mismatch = packageSha256 !== overlaySha256;
    if (mismatch) {
      packageMismatches.push({
        source_relative_path: entry.sourceRelativePath,
        destination_relative_path: entry.destinationRelative,
        current_package_sha256: packageSha256,
        replay_overlay_sha256: overlaySha256,
        current_package_bytes: packageBytes.byteLength,
        replay_overlay_bytes: destinationBytes.byteLength,
        dependency_scope: nativeDependencies.has(entry.sourceRelativePath) ? "native-read-dependency" : "disjoint-from-native-read-dependencies",
      });
    }
    return {
      ...entry,
      destination,
      replayBaselineSha256: mismatch ? overlaySha256 : null,
      replayBaselineBytes: mismatch ? destinationBytes.byteLength : null,
    };
  });
  const dependencyMismatches = packageMismatches.filter((entry) => entry.dependency_scope === "native-read-dependency");
  if (dependencyMismatches.length > 0) {
    blocked("replay fixture overlay differs from current frozen bytes on a native-read dependency", {
      mismatches: dependencyMismatches,
      native_read_dependencies: [...nativeDependencies].sort(),
    });
  }
  const overlayManifest = copies
    .map((entry) => ({ path: entry.sourceRelativePath, sha256: entry.replayBaselineSha256 ?? entry.packageSha256, bytes: entry.replayBaselineBytes ?? entry.bytes }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    fixtureRoot: dirname(worktree),
    repo: null,
    worktreeRoot: dirname(worktree),
    worktree,
    baselineRevision,
    revision,
    diffEvidence: {
      baseline_revision: baselineRevision,
      revision,
      sha256: sha256Text(fullDiff),
      bytes: Buffer.byteLength(fullDiff, "utf8"),
      content: fullDiff,
    },
    overlay: { destinationRoot, copies },
    replayPackage: {
      source_kind: "existing_frozen_overlay",
      current_package_manifest_sha256: packageInfo.manifestSha256,
      current_package_manifest_digest: packageInfo.manifestDigest,
      replay_overlay_manifest_sha256: sha256Text(JSON.stringify(overlayManifest)),
      native_read_dependencies: [...nativeDependencies].sort(),
      current_package_mismatches: packageMismatches,
      dependency_mismatch_count: dependencyMismatches.length,
      disjoint_mismatch_count: packageMismatches.filter((entry) => entry.dependency_scope === "disjoint-from-native-read-dependencies").length,
      comparison: dependencyMismatches.length === 0 ? "native-read-dependencies-match; disjoint source drift explicitly recorded" : "blocked",
    },
    env: gitEnv.env,
    replayed: true,
  };
}

function extractOfflinePeerFrame(parsed, fixture) {
  if (parsed.frame_type === "subagent_progress") {
    return {
      frame: parsed,
      sourceKind: "offline_captured_native_subagent_progress",
      capturedRunId: parsed.run_id,
      callerTaskSha256: null,
    };
  }
  const evidenceFixture = parsed.fixture;
  if (!evidenceFixture || typeof evidenceFixture !== "object" || typeof evidenceFixture.root !== "string") blocked("offline peer evidence was neither a captured progress frame nor a full native evidence document with fixture metadata");
  if (parsed.phase !== "green") blocked("offline full peer evidence was not captured by a GREEN native run");
  if (!samePath(evidenceFixture.root, fixture.worktree)) blocked("offline peer evidence fixture root did not match the supplied replay fixture", { evidence_fixture_root: scrubText(evidenceFixture.root), replay_fixture_root: scrubText(fixture.worktree) });
  if (evidenceFixture.revision !== fixture.revision || evidenceFixture.baseline_revision !== fixture.baselineRevision) blocked("offline peer evidence fixture revisions did not match the supplied replay fixture", {
    evidence_revision: evidenceFixture.revision,
    evidence_baseline_revision: evidenceFixture.baseline_revision,
    fixture_revision: fixture.revision,
    fixture_baseline_revision: fixture.baselineRevision,
  });
  if (evidenceFixture.diff?.sha256 !== fixture.diffEvidence.sha256 || evidenceFixture.diff?.bytes !== fixture.diffEvidence.bytes) blocked("offline peer evidence full diff did not match the supplied replay fixture");
  const native = parsed.native;
  const callerTaskItems = [];
  for (const call of Array.isArray(native?.task_calls) ? native.task_calls : []) {
    if (!call || call.tool !== "task" || !Array.isArray(call.items)) continue;
    for (const item of call.items) {
      if (item?.name === REVIEW_ASSIGNMENTS.peerPositive.id && item.agent === "peer-reviewer") callerTaskItems.push(item);
    }
  }
  if (callerTaskItems.length !== 1) blocked("offline full evidence did not contain exactly one trusted PeerPositive task caller record", { count: callerTaskItems.length });
  const callerTask = callerTaskItems[0];
  if (callerTask.hasSolutionSpace !== true || callerTask.hasForbiddenField === true || !/^[a-f0-9]{64}$/i.test(String(callerTask.taskSha256 ?? ""))) {
    blocked("offline full evidence PeerPositive caller record did not prove the required solutionSpace and task hash policy");
  }
  const callerTaskSha256 = callerTask.taskSha256;
  const terminals = Array.isArray(native?.native_progress_terminal)
    ? native.native_progress_terminal.filter((record) => record && record.id === REVIEW_ASSIGNMENTS.peerPositive.id)
    : [];
  if (terminals.length !== 1) blocked("offline peer evidence did not contain exactly one captured PeerPositive native progress terminal", { count: terminals.length });
  const terminal = terminals[0];
  if (terminal.source_kind !== "native_subagent_progress" || terminal.frame_type !== "subagent_progress" || terminal.status !== "completed") {
    blocked("offline full evidence PeerPositive terminal was not a completed native progress record");
  }
  observedSuccessfulTerminal(terminal, REVIEW_ASSIGNMENTS.peerPositive.id, "native_subagent_progress", true);
  assertTerminalDispatch({ nativeEvidence: native }, REVIEW_ASSIGNMENTS.peerPositive.id, terminal);
  const peerCases = Array.isArray(native?.peer_cases)
    ? native.peer_cases.filter((entry) => entry && entry.id === REVIEW_ASSIGNMENTS.peerPositive.id)
    : [];
  if (peerCases.length !== 1) blocked("offline full evidence did not contain exactly one PeerPositive consumer case", { count: peerCases.length });
  const peerCase = peerCases[0];
  if (
    peerCase.expected !== "APROVADO"
    || peerCase.status !== "APROVADO"
    || peerCase.actual?.source_kind !== "native_subagent_progress"
    || peerCase.actual?.status !== "completed"
    || peerCase.actual?.exitCode !== terminal.exitCode
    || peerCase.consumer_validation?.accepted !== true
    || peerCase.consumer_validation?.status !== "APROVADO"
  ) {
    blocked("offline full evidence PeerPositive was not accepted by the real native peer consumer");
  }
  if (!terminal.progress || typeof terminal.progress !== "object" || Array.isArray(terminal.progress)) blocked("offline full evidence PeerPositive terminal did not carry the captured progress object");
  return {
    frame: {
      frame_type: terminal.frame_type,
      id: terminal.id,
      subagent_id: terminal.id,
      agent: terminal.agent,
      agentSource: terminal.agentSource,
      parentToolCallId: terminal.parentToolCallId,
      exitCode: terminal.exitCode,
      isError: terminal.isError,
      aborted: terminal.aborted,
      status: terminal.status,
      progress: terminal.progress,
    },
    sourceKind: "offline_captured_native_evidence_record",
    capturedRunId: parsed.run_id,
    callerTaskSha256,
  };
}

function loadOfflinePeerProgress(evidencePath, fixture) {
  const fd = openSync(evidencePath, "r");
  let bytes;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_REASSEMBLED_FRAME_BYTES) blocked("offline peer evidence exceeds the bounded regular-file limit");
    const buffer = Buffer.alloc(stat.size + 1);
    let total = 0;
    while (total < buffer.length) {
      const count = readSync(fd, buffer, total, buffer.length - total, null);
      if (count === 0) break;
      total += count;
    }
    if (total > stat.size) blocked("offline peer evidence changed beyond its bounded size");
    bytes = buffer.subarray(0, total);
  } finally { closeSync(fd); }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    blocked("offline peer evidence was not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) blocked("offline peer evidence JSON root was not an object");
  const extracted = extractOfflinePeerFrame(parsed, fixture);
  const frame = extracted.frame;
  if (!frame || typeof frame !== "object" || frame.frame_type !== "subagent_progress" || frame.id !== REVIEW_ASSIGNMENTS.peerPositive.id) {
    blocked("offline peer evidence was not the captured PeerPositive subagent_progress frame");
  }
  if (frame.agent !== "peer-reviewer" || frame.agentSource !== "project") blocked("offline peer evidence did not identify the project peer-reviewer source");
  if (!UUID_V4.test(String(extracted.capturedRunId ?? ""))) blocked("offline peer evidence did not carry a UUID-v4 run_id");
  const progress = safeSubagentProgress(frame.progress);
  if (!progress) blocked("offline peer evidence did not contain a valid progress object");
  if (progress.id !== REVIEW_ASSIGNMENTS.peerPositive.id || progress.agent !== "peer-reviewer" || progress.agentSource !== "project") blocked("offline peer evidence progress identity/source did not match PeerPositive project profile");
  for (const key of ["task_sha256", "assignment_sha256", "taskFileSha256"]) {
    if (typeof frame.progress?.[key] === "string") progress[key] = frame.progress[key].slice(0, 128);
  }
  if (typeof extracted.callerTaskSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(extracted.callerTaskSha256)) blocked("offline peer evidence lacked a trusted native task caller hash");
  if (typeof progress.assignment_sha256 !== "string" || progress.assignment_sha256 !== extracted.callerTaskSha256) blocked("offline peer evidence assignment_sha256 did not match the trusted native task caller", {
    progress_assignment_sha256: progress.assignment_sha256 ?? null,
    caller_task_sha256: extracted.callerTaskSha256,
  });
  if (progress.task_sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(String(progress.task_sha256))) blocked("offline peer evidence task_sha256 was not a valid opaque runtime hash");
  const payload = {
    frame_type: "subagent_progress",
    id: frame.id,
    subagent_id: frame.id,
    agent: frame.agent,
    agentSource: frame.agentSource,
    status: frame.progress?.status ?? frame.status,
    progress,
  };
  const record = nativeProgressTerminalRecord(payload);
  if (!record) blocked("offline peer evidence did not contain a completed native progress terminal");
  observedSuccessfulTerminal(record, REVIEW_ASSIGNMENTS.peerPositive.id, "offline_peer_progress", true);
  const data = assembleNativeYield(record);
  if (!data || typeof data !== "object" || Array.isArray(data) || data.protocol_mode !== "TDD_PEER_REVIEW" || data.agent !== "peer-reviewer" || data.status !== "APROVADO") {
    blocked("offline peer evidence did not contain the documented native APROVADO JTD");
  }
  if (data.reviewed_revision !== fixture.revision) blocked("offline peer evidence is stale for the supplied replay fixture revision", { evidence_revision: data.reviewed_revision, fixture_revision: fixture.revision });
  return {
    ...record,
    source_kind: extracted.sourceKind,
    captured_run_id: extracted.capturedRunId,
    caller_task_sha256: extracted.callerTaskSha256,
    evidence_path: scrubText(evidencePath),
    evidence_sha256: sha256Bytes(bytes),
    evidence_bytes: bytes.byteLength,
  };
}

function loadOfflineBatchEvidence(evidencePath, fixture, packageInfo, positiveRecord) {
  const bytes = readFileSync(evidencePath);
  if (bytes.byteLength > 8 * 1024 * 1024) blocked("offline batch evidence exceeded the bounded replay size");
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    blocked("offline batch evidence was not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) blocked("offline batch evidence JSON root was not an object");
  if (parsed.phase !== "green" || !UUID_V4.test(String(parsed.run_id ?? ""))) blocked("offline batch evidence did not carry a GREEN UUID-v4 run");
  const evidenceFixture = parsed.fixture;
  if (!evidenceFixture || typeof evidenceFixture !== "object" || typeof evidenceFixture.root !== "string") blocked("offline batch evidence lacked fixture metadata");
  if (!samePath(evidenceFixture.root, fixture.worktree)) blocked("offline batch evidence fixture root did not match the supplied replay fixture");
  if (evidenceFixture.revision !== fixture.revision || evidenceFixture.baseline_revision !== fixture.baselineRevision) blocked("offline batch evidence fixture revisions did not match the supplied replay fixture");
  if (evidenceFixture.diff?.sha256 !== fixture.diffEvidence.sha256 || evidenceFixture.diff?.bytes !== fixture.diffEvidence.bytes) blocked("offline batch evidence full diff did not match the supplied replay fixture");
  const native = parsed.native;
  if (!native || typeof native !== "object" || Array.isArray(native)) blocked("offline batch evidence lacked native evidence metadata");
  const dependencies = nativeReplayDependencies();
  const currentByPath = new Map(packageInfo.entries.filter((entry) => dependencies.has(entry.sourceRelativePath)).map((entry) => [entry.sourceRelativePath, entry]));
  if (currentByPath.size !== dependencies.size) blocked("current frozen package did not expose the exact native replay dependency scope");
  const capturedScopes = {};
  for (const scopeName of ["source_before", "source_after"]) {
    const rows = native[scopeName];
    if (!Array.isArray(rows) || rows.length !== dependencies.size) blocked(`offline batch evidence ${scopeName} did not contain exactly thirteen source records`);
    const captured = new Map();
    for (const row of rows) {
      if (!row || typeof row.path !== "string" || captured.has(row.path) || !dependencies.has(row.path) || !/^[a-f0-9]{64}$/i.test(String(row.sha256 ?? "")) || !Number.isSafeInteger(row.bytes) || row.bytes < 0) {
        blocked(`offline batch evidence ${scopeName} contained an invalid native source record`);
      }
      captured.set(row.path, { sha256: row.sha256, bytes: row.bytes });
    }
    if (captured.size !== dependencies.size) blocked(`offline batch evidence ${scopeName} did not cover all native source dependencies`);
    for (const path of dependencies) {
      const expected = currentByPath.get(path);
      const actual = captured.get(path);
      if (actual.sha256 !== expected.sourceSha256 || actual.bytes !== expected.bytes) blocked(`offline batch evidence ${scopeName} did not match current frozen bytes`, { path });
      capturedScopes[scopeName] = capturedScopes[scopeName] ?? {};
      capturedScopes[scopeName][path] = actual;
    }
  }
  for (const path of dependencies) {
    const before = capturedScopes.source_before[path];
    const after = capturedScopes.source_after[path];
    if (before.sha256 !== after.sha256 || before.bytes !== after.bytes) blocked("offline batch evidence native source bytes changed between before and after captures", { path });
  }
  const protocolConsumer = native.protocol_consumer;
  const protocolEntry = currentByPath.get("deep-review/lib/protocol.mjs");
  if (
    !protocolConsumer
    || protocolConsumer.source_relative_path !== "deep-review/lib/protocol.mjs"
    || protocolConsumer.sha256 !== protocolEntry.sourceSha256
  ) {
    blocked("offline batch evidence protocol consumer did not match the frozen deep-review source");
  }
  const captureBinary = (value, label) => {
    if (value === null || value === undefined) return null;
    if (!value || typeof value !== "object" || !/^[a-f0-9]{64}$/i.test(String(value.sha256 ?? "")) || !Number.isSafeInteger(value.bytes) || value.bytes < 0) blocked(`offline batch evidence ${label} binary capture was malformed`);
    return { sha256: value.sha256, bytes: value.bytes };
  };
  const capturedBinary = {
    before: captureBinary(native.binary_before, "before"),
    after: captureBinary(native.binary_after, "after"),
  };
  capturedBinary.complete = Boolean(capturedBinary.before && capturedBinary.after);
  if (capturedBinary.complete && (capturedBinary.before.sha256 !== capturedBinary.after.sha256 || capturedBinary.before.bytes !== capturedBinary.after.bytes)) blocked("offline batch evidence captured an OMP binary change between before and after");
  const expectedCompleted = new Map(PROFILE_NAMES.filter(([, name]) => name !== "ProfilePeerReviewer").map(([agent, name]) => [name, agent]));
  expectedCompleted.set("DeepReviewOne", "deep-reviewer");
  expectedCompleted.set("DeepReviewTwo", "deep-reviewer");
  expectedCompleted.set("PeerNegative", "peer-reviewer");
  expectedCompleted.set("PeerMalformed", "peer-reviewer");
  const expectedWithAborted = new Map(expectedCompleted);
  expectedWithAborted.set("ProfilePeerReviewer", "peer-reviewer");
  const allowedIds = new Set([...expectedWithAborted.keys(), "PeerPositive"]);
  const callerById = new Map();
  const taskCalls = Array.isArray(native.task_calls) ? native.task_calls : [];
  if (taskCalls.length === 0) blocked("offline batch evidence lacked the captured root task caller wire");
  for (const call of taskCalls) {
    if (!call || call.tool !== "task" || call.hasModelField === true || !Array.isArray(call.items)) blocked("offline batch evidence contained an invalid root task caller record");
    for (const item of call.items) {
      if (!item || typeof item.name !== "string" || !allowedIds.has(item.name) || callerById.has(item.name) || item.agent !== expectedWithAborted.get(item.name) || item.hasSolutionSpace !== true || item.hasForbiddenField === true || !/^[a-f0-9]{64}$/i.test(String(item.taskSha256 ?? ""))) {
        blocked("offline batch evidence contained an invalid or duplicate task assignment caller record");
      }
      callerById.set(item.name, item);
    }
  }
  if (callerById.size !== expectedWithAborted.size) blocked("offline batch evidence caller wire did not cover every batch assignment", { expected: expectedWithAborted.size, observed: callerById.size });
  const allRecords = Array.isArray(native.native_progress_terminal) ? native.native_progress_terminal : [];
  if (allRecords.length > allowedIds.size) blocked("offline batch evidence exceeded the bounded native terminal set");
  const recordsById = new Map();
  for (const record of allRecords) {
    if (!record || typeof record.id !== "string" || !allowedIds.has(record.id) || recordsById.has(record.id) || record.frame_type !== "subagent_progress" || typeof record.agent !== "string" || typeof record.agentSource !== "string") {
      blocked("offline batch evidence contained an unknown or duplicate native progress terminal");
    }
    recordsById.set(record.id, record);
  }
  const aborted = recordsById.get("ProfilePeerReviewer");
  if (!aborted || aborted.agent !== "peer-reviewer" || aborted.agentSource !== "project" || aborted.status !== "aborted" || aborted.exitCode !== 1) blocked("offline batch evidence did not preserve the aborted ProfilePeerReviewer attempt");
  const abortedError = Array.isArray(aborted.progress?.yield) ? aborted.progress.yield.find((entry) => entry?.error)?.error : null;
  if (!abortedError || abortedError.classification !== "schema") blocked("offline batch evidence ProfilePeerReviewer abort was not classified as schema");
  if (aborted.progress?.assignment_sha256 !== callerById.get("ProfilePeerReviewer")?.taskSha256) blocked("offline batch evidence aborted ProfilePeerReviewer was not bound to its actual caller hash");
  if (aborted.progress?.task_sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(String(aborted.progress.task_sha256))) blocked("offline batch evidence aborted ProfilePeerReviewer task hash was not a valid opaque runtime hash");
  const abortedAttempt = {
    source_kind: aborted.source_kind ?? "native_subagent_progress",
    id: aborted.id,
    agent: aborted.agent,
    agentSource: aborted.agentSource,
    status: aborted.status,
    exitCode: aborted.exitCode,
    resolvedModel: aborted.progress?.resolvedModel ?? null,
    resolvedModelIdentity: aborted.progress?.resolvedModelIdentity ?? null,
    resolvedThinkingLevel: aborted.progress?.resolvedThinkingLevel ?? null,
    resolvedModelIsFallback: aborted.progress?.resolvedModelIsFallback ?? null,
    task_sha256: aborted.progress?.task_sha256 ?? null,
    assignment_sha256: aborted.progress?.assignment_sha256 ?? null,
    error: {
      type: typeof abortedError.type === "string" ? abortedError.type : null,
      classification: abortedError.classification,
      classification_source: abortedError.classification_source ?? null,
      sha256: abortedError.sha256 ?? null,
      bytes: abortedError.bytes ?? null,
    },
  };
  for (const [id, agent] of expectedCompleted) {
    const record = recordsById.get(id);
    if (!record || record.agent !== agent || record.agentSource !== "project" || record.status !== "completed" || record.exitCode !== 0) blocked(`offline batch evidence lacked a completed native terminal for ${id}`);
    const caller = callerById.get(id);
    if (record.progress?.assignment_sha256 !== caller?.taskSha256) blocked(`offline batch evidence ${id} assignment hash did not match the actual root caller`);
    if (record.progress?.task_sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(String(record.progress.task_sha256))) blocked(`offline batch evidence ${id} task hash was not a valid opaque runtime hash`);
    if (id.startsWith("DeepReview") || id.startsWith("Peer")) {
      const data = assembleNativeYield(record);
      if (!data || typeof data !== "object" || Array.isArray(data) || data.reviewed_revision !== fixture.revision) blocked(`offline batch evidence ${id} did not carry the independent expected fixture revision`);
    }
  }
  const positiveCopies = allRecords.filter((record) => record?.id === "PeerPositive");
  if (positiveCopies.length !== 1 || !positiveRecord || positiveCopies[0].source_kind !== "offline_captured_native_evidence_record" || positiveCopies[0].agent !== "peer-reviewer" || positiveCopies[0].agentSource !== "project" || positiveCopies[0].status !== "completed" || positiveCopies[0].exitCode !== 0 || positiveCopies[0].captured_run_id !== positiveRecord.captured_run_id || positiveCopies[0].evidence_sha256 !== positiveRecord.evidence_sha256 || positiveCopies[0].progress?.assignment_sha256 !== positiveRecord.progress?.assignment_sha256) blocked("offline batch evidence PeerPositive copy did not match the separately validated genuine positive capture");
  const positiveData = assembleNativeYield(positiveCopies[0]);
  if (!positiveData || positiveData.reviewed_revision !== fixture.revision || positiveData.status !== "APROVADO") blocked("offline batch evidence PeerPositive copy was stale or not APROVADO");
  return {
    source_kind: "offline_captured_native_batch_evidence",
    replay_label: "NativeReplay-exact",
    captured_run_id: parsed.run_id,
    evidence_path: scrubText(evidencePath),
    evidence_sha256: sha256Bytes(bytes),
    evidence_bytes: bytes.byteLength,
    source_scope: { paths: [...dependencies].sort(), before_after_equal: true, protocol_sha256: protocolEntry.sourceSha256 },
    task_calls: taskCalls,
    caller_task_hashes: Object.fromEntries([...callerById.entries()].map(([id, item]) => [id, item.taskSha256]).sort(([left], [right]) => left.localeCompare(right))),
    records: [...expectedCompleted.keys()].map((id) => recordsById.get(id)),
    aborted_attempt: abortedAttempt,
    captured_binary: capturedBinary,
  };
}

function assertOverlayUnchanged(copies, label, destinationRoot) {
  for (const copy of copies) {
    ensureRegularFile(copy.packagePath, `${label} frozen package`);
    ensureRegularFile(copy.destination, `${label} copied overlay`);
    const packageBytes = readFileSync(copy.packagePath);
    const destinationBytes = readFileSync(copy.destination);
    if (copy.replayBaselineSha256) {
      if (sha256Bytes(destinationBytes) !== copy.replayBaselineSha256 || destinationBytes.byteLength !== copy.replayBaselineBytes) {
        assertion(`${label} changed replay overlay bytes outside native-read dependency scope`, { expectedRed: false, path: copy.destination });
      }
    } else if (!packageBytes.equals(destinationBytes)) {
      assertion(`${label} changed copied package bytes`, { expectedRed: false, path: copy.destination });
    }
  }
  const expected = new Set(copies.map((copy) => comparePath(copy.destination)));
  for (const subtree of ["skills", "agents"]) {
    const root = join(destinationRoot, subtree);
    if (!existsSync(root)) continue;
    const info = lstatSync(root);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      assertion(`${label} replaced copied overlay root`, { expectedRed: false, path: root });
    }
    for (const file of walkRegularFiles(root, `${label} overlay ${subtree}`)) {
      if (!expected.has(comparePath(file.path))) {
        assertion(`${label} created an unexpected overlay file`, { expectedRed: false, path: file.path });
      }
    }
  }
}

function parseGitStatus(output) {
  return String(output)
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ status: entry.slice(0, 2), path: entry.slice(3) }));
}

function assertWorktreeReadOnly(worktree, env, label, allowedCopies = []) {
  const allowedPaths = new Set(allowedCopies.map((copy) => relative(worktree, copy.destination).replaceAll("\\", "/")));
  const status = parseGitStatus(runGit(worktree, ["status", "--porcelain=v1", "--untracked-files=all", "-z"], env, `${label} git status`));
  const unexpected = status.filter(({ path }) => !allowedPaths.has(path.replaceAll("\\", "/")));
  if (unexpected.length > 0) {
    assertion(`${label} changed files outside the exact frozen-package overlay`, {
      expectedRed: false,
      unexpectedPaths: unexpected.map(({ path }) => scrubText(path)),
    });
  }
  if (runGit(worktree, ["remote"], env, `${label} git remote`) !== "") {
    assertion(`${label} added a Git remote`, { expectedRed: false });
  }
}

function eventToolName(event) {
  for (const key of ["toolName", "tool_name", "name"]) {
    if (typeof event?.[key] === "string") return event[key];
  }
  if (typeof event?.tool === "string") return event.tool;
  for (const value of [event?.toolCall, event?.tool_call, event?.tool, event?.toolExecution, event?.tool_execution]) {
    if (value && typeof value === "object") {
      for (const key of ["toolName", "tool_name", "name"]) {
        if (typeof value[key] === "string") return value[key];
      }
    }
  }
  return null;
}

function eventCorrelationId(event) {
  for (const key of ["toolCallId", "tool_call_id", "toolExecutionId", "tool_execution_id", "callId", "call_id", "id"]) {
    if (typeof event?.[key] === "string" && event[key] !== "") return event[key];
  }
  for (const value of [event?.toolCall, event?.tool_call, event?.toolExecution, event?.tool_execution]) {
    if (value && typeof value === "object") {
      for (const key of ["toolCallId", "tool_call_id", "toolExecutionId", "tool_execution_id", "callId", "call_id", "id"]) {
        if (typeof value[key] === "string" && value[key] !== "") return value[key];
      }
    }
  }
  return null;
}

function findRawField(value, names, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return undefined;
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, child] of Object.entries(value)) {
    if (wanted.has(key.toLowerCase()) && (typeof child === "string" || typeof child === "boolean" || typeof child === "number")) return child;
  }
  for (const child of Object.values(value)) {
    const found = findRawField(child, names, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function normalizeModelIdentity(value) {
  if (typeof value === "string") {
    const slash = value.indexOf("/");
    if (slash > 0 && slash < value.length - 1) return { provider: value.slice(0, slash), id: value.slice(slash + 1).split("@")[0].split(":")[0] };
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const provider = typeof value.provider === "string" ? value.provider : typeof value.providerId === "string" ? value.providerId : null;
  const id = typeof value.id === "string" ? value.id : typeof value.modelId === "string" ? value.modelId : typeof value.model === "string" ? value.model : null;
  return provider && id ? { provider, id } : null;
}
function nativeUsageModelEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usage = value.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const model = normalizeModelIdentity(usage.model) ?? (typeof usage.provider === "string" && typeof usage.model === "string" ? { provider: usage.provider, id: usage.model } : null);
  if (!model) return null;
  const id = typeof value.agentId === "string" ? value.agentId : typeof value.agent_id === "string" ? value.agent_id : typeof value.taskId === "string" ? value.taskId : typeof value.task_id === "string" ? value.task_id : null;
  const messageId = typeof value.messageId === "string" ? value.messageId : typeof value.message_id === "string" ? value.message_id : null;
  return { model, task_id: id, message_id: messageId };
}

function addServingModelEvidence(evidence, value, origin, fallbackTaskId = null) {
  const observed = nativeUsageModelEvidence(value);
  if (!observed) return;
  if (!observed.task_id && typeof fallbackTaskId === "string") observed.task_id = fallbackTaskId;
  const item = { origin, ...observed };
  const digest = sha256Text(JSON.stringify(item));
  if (!evidence.serving_models.some((entry) => entry.digest === digest)) evidence.serving_models.push({ digest, ...item });
}

function safeStructuredOutput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output = {};
  for (const key of ["schema", "schemaSource", "mode", "status", "valid", "validation"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) output[key] = sanitizeValue(value[key]);
  }
  if (Object.prototype.hasOwnProperty.call(value, "data")) output.data = sanitizeValue(value.data);
  if (Object.prototype.hasOwnProperty.call(value, "error")) output.error = safeNativeFailure(value.error);
  return output;
}

function safeTaskRecord(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return { malformed: true, value: opaqueError(item) };
  const output = {};
  for (const key of ["index", "id", "agent", "agentSource", "exitCode", "status", "isError", "aborted", "parentToolCallId", "truncated", "durationMs", "tokens", "requests", "contextTokens", "contextWindow"]) {
    if (Object.prototype.hasOwnProperty.call(item, key)) output[key] = sanitizeValue(item[key]);
  }
  for (const [target, candidates] of [
    ["sourceFile", ["sourceFile", "sourcefile", "sourcePath", "source_path", "filePath", "file_path"]],
    ["sourceSha256", ["sourceSha256", "sourceFileSha256", "source_file_sha256", "sourceHash", "source_hash"]],
    ["taskFile", ["taskFile", "taskfile"]],
    ["taskFileSha256", ["taskFileSha256", "taskfileSha256"]],
  ]) {
    const field = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(item, candidate));
    if (field) output[target] = typeof item[field] === "string" ? scrubText(item[field]) : sanitizeValue(item[field]);
  }
  for (const [target, candidates] of [
    ["resolvedModel", ["resolvedModel", "resolved_model"]],
    ["resolvedModelIdentity", ["resolvedModelIdentity", "resolved_model_identity"]],
  ]) {
    const field = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(item, candidate));
    if (field) output[target] = normalizeModelIdentity(item[field]);
  }
  for (const [target, candidates] of [
    ["resolvedThinkingLevel", ["resolvedThinkingLevel", "resolved_thinking_level"]],
    ["resolvedModelIsFallback", ["resolvedModelIsFallback", "resolved_model_is_fallback"]],
  ]) {
    const field = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(item, candidate));
    if (field) output[target] = sanitizeValue(item[field]);
  }
  if (Object.prototype.hasOwnProperty.call(item, "structuredOutput")) output.structuredOutput = safeStructuredOutput(item.structuredOutput);
  if (Object.prototype.hasOwnProperty.call(item, "output")) {
    const terminal = safePublicTerminalText(item.output);
    const failed = (typeof item.exitCode === "number" && item.exitCode !== 0) || ["failed", "error", "aborted", "canceled", "cancelled"].includes(String(item.status ?? "").toLowerCase());
    if (failed) output.output_error = safeNativeFailure(item.output);
    else output.output_text = terminal.text;
    output.output_sha256 = terminal.sha256;
    output.output_bytes = terminal.bytes;
  }
  for (const key of ["assignment", "task", "description"]) {
    if (typeof item[key] === "string") output[`${key}_sha256`] = sha256Text(item[key]);
  }
  for (const key of ["error", "stderr", "retryFailure", "retry_failure"]) {
    if (Object.prototype.hasOwnProperty.call(item, key) && item[key] !== undefined && item[key] !== null) output[key] = safeNativeFailure(item[key]);
  }
  return output;
}
function safeYieldEntries(value) {
  if (!Array.isArray(value)) return null;
  return value.slice(0, 96).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return sanitizeValue(item);
    const output = {};
    for (const key of ["status", "type", "useLastTurn", "complete", "schemaOverridden"]) {
      if (Object.prototype.hasOwnProperty.call(item, key)) output[key] = sanitizeValue(item[key]);
    }
    if (Object.prototype.hasOwnProperty.call(item, "data")) output.data = sanitizeValue(item.data);
    if (Object.prototype.hasOwnProperty.call(item, "error")) output.error = safeNativeFailure(item.error);
    return output;
  });
}
function safeSubagentProgress(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return null;
  const output = {};
  for (const key of ["index", "id", "agent", "agentSource", "status", "isError", "aborted", "parentToolCallId", "durationMs", "toolCount", "requests", "tokens", "contextTokens", "contextWindow", "resolvedThinkingLevel", "resolvedModelIsFallback"]) {
    if (Object.prototype.hasOwnProperty.call(progress, key)) output[key] = sanitizeValue(progress[key]);
  }
  if (Object.prototype.hasOwnProperty.call(progress, "exitCode")) {
    output.exitCode = Number.isFinite(progress.exitCode) && Number.isInteger(progress.exitCode) ? progress.exitCode : null;
    output.exit_code_invalid = output.exitCode === null;
  }
  for (const [target, candidates] of [
    ["resolvedModel", ["resolvedModel", "resolved_model"]],
    ["resolvedModelIdentity", ["resolvedModelIdentity", "resolved_model_identity"]],
    ["taskFile", ["taskFile", "taskfile"]],
    ["taskFileSha256", ["taskFileSha256", "taskfileSha256"]],
  ]) {
    const field = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(progress, candidate));
    if (field) output[target] = target.startsWith("resolvedModel") ? normalizeModelIdentity(progress[field]) : typeof progress[field] === "string" ? scrubText(progress[field]) : sanitizeValue(progress[field]);
  }
  for (const key of ["task", "assignment"]) {
    if (typeof progress[key] === "string") output[`${key}_sha256`] = sha256Text(progress[key]);
  }
  if (Object.prototype.hasOwnProperty.call(progress, "structuredOutput")) output.structuredOutput = safeStructuredOutput(progress.structuredOutput);
  const directYield = safeYieldEntries(progress.yield);
  if (directYield !== null) {
    output.yield = directYield;
    output.yield_source = "progress.yield";
  } else if (progress.extractedToolData && typeof progress.extractedToolData === "object" && Array.isArray(progress.extractedToolData.yield)) {
    output.yield = safeYieldEntries(progress.extractedToolData.yield);
    output.yield_source = "progress.extractedToolData.yield";
  }
  if (String(progress.status ?? "").toLowerCase() === "failed") {
    const failureText = JSON.stringify(output.yield ?? null);
    const classification = nativeFailureClassification(failureText);
    output.failure = {
      classification: classification.classification,
      classification_source: classification.source === "unverified" ? "unverified" : "payload",
      status: "failed",
      sha256: sha256Text(failureText),
      bytes: Buffer.byteLength(failureText, "utf8"),
    };
  }
  if (progress.error !== undefined && progress.error !== null) output.error = safeNativeFailure(progress.error);
  if (progress.retryFailure) output.retryFailure = safeNativeFailure(progress.retryFailure);
  if (progress.retryState) output.retryState = safeNativeFailure(progress.retryState);
  return output;
}

function safeSubagentSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const output = {};
  for (const key of ["id", "index", "agent", "agentSource", "status", "lastUpdate", "parentToolCallId", "sessionFile"]) {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) output[key] = typeof snapshot[key] === "string" ? scrubText(snapshot[key]) : sanitizeValue(snapshot[key]);
  }
  if (snapshot.progress) output.progress = safeSubagentProgress(snapshot.progress);
  return output;
}

function safeAssistantTranscript(message, subagentId) {
  if (!message || typeof message !== "object" || Array.isArray(message) || message.role !== "assistant") return null;
  const text = Array.isArray(message.content)
    ? message.content.filter((block) => block && typeof block === "object" && block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n")
    : "";
  if (!text) return null;
  const terminal = safePublicTerminalText(text);
  return {
    subagent_id: subagentId,
    message_id: typeof message.id === "string" ? message.id : typeof message.messageId === "string" ? message.messageId : null,
    role: "assistant",
    text: terminal.text,
    sha256: terminal.sha256,
    bytes: terminal.bytes,
  };
}

function looksLikeTaskDetails(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && (Array.isArray(value.results) || Array.isArray(value.progress) || Object.prototype.hasOwnProperty.call(value, "totalDurationMs"));
}

function collectTaskDetails(value, output = [], depth = 0) {
  if (depth > 7 || value === null || typeof value !== "object") return output;
  if (looksLikeTaskDetails(value)) output.push(value);
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 96)) collectTaskDetails(item, output, depth + 1);
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/(?:thinking|reasoning|prompt|message|content|messages)/i.test(key)) continue;
    collectTaskDetails(child, output, depth + 1);
  }
  return output;
}

function taskDetailsSnapshot(details) {
  if (!looksLikeTaskDetails(details)) return null;
  const snapshot = {};
  if (Array.isArray(details.results)) snapshot.results = details.results.map(safeTaskRecord);
  if (Array.isArray(details.progress)) snapshot.progress = details.progress.map(safeTaskRecord);
  for (const key of ["totalDurationMs", "async", "projectAgentsDir"]) {
    if (Object.prototype.hasOwnProperty.call(details, key)) snapshot[key] = sanitizeValue(details[key]);
  }
  return snapshot;
}

function addTaskDetails(evidence, value, origin, parentToolCallId = null) {
  for (const details of collectTaskDetails(value)) {
    const snapshot = taskDetailsSnapshot(details);
    if (!snapshot) continue;
    if (origin === "tool_execution_end" && parentToolCallId && [...(snapshot.results ?? []), ...(snapshot.progress ?? [])].some((record) => record.parentToolCallId && record.parentToolCallId !== parentToolCallId)) blocked("task result contradicts its owning Root dispatch");
    const digest = sha256Text(JSON.stringify(snapshot));
    const existing = evidence.task_details.find((entry) => entry.digest === digest);
    if (existing) {
      // Nested telemetry can precede the owning Root END for the same snapshot.
      if (origin === "tool_execution_end" && parentToolCallId) {
        if (existing.parentToolCallId && existing.parentToolCallId !== parentToolCallId) blocked("task snapshot appeared under conflicting Root dispatches");
        existing.origin = origin;
        existing.parentToolCallId = parentToolCallId;
      }
      continue;
    }
    evidence.task_details.push({ origin, digest, parentToolCallId, details: snapshot });
  }
}

function taskCallShape(frame) {
  const raw = frame?.arguments ?? frame?.args ?? frame?.input ?? frame?.toolCall?.arguments ?? frame?.tool_call?.arguments ?? frame?.tool?.arguments ?? findRawField(frame, ["arguments", "args"]);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const isForbidden = (key) => TASK_WIRE_FORBIDDEN_KEYS.has(key) || TASK_WIRE_FORBIDDEN_KEYS.has(key.toLowerCase());
  const shape = {
    tool: eventToolName(frame),
    toolCallId: eventCorrelationId(frame),
    keys: Object.keys(raw).sort(),
    hasModelField: Object.keys(raw).some(isForbidden),
    items: [],
  };
  const items = Array.isArray(raw.tasks) ? raw.tasks : [raw];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      shape.items.push({ malformed: true });
      continue;
    }
    const keys = Object.keys(item).sort();
    shape.items.push({
      keys,
      name: typeof item.name === "string" ? item.name : null,
      agent: typeof item.agent === "string" ? item.agent : null,
      hasSolutionSpace: typeof item.solutionSpace === "string" && item.solutionSpace.trim() !== "",
      hasForbiddenField: keys.some(isForbidden),
      taskSha256: typeof item.task === "string" ? sha256Text(item.task) : null,
    });
  }
  return shape;
}

function summarizeToolEvent(frame) {
  const completed = findRawField(frame, ["completed"]);
  const result = {
    type: frame.type,
    toolCallId: eventCorrelationId(frame),
    toolName: eventToolName(frame),
    completed: completed === undefined && frame.type === "tool_execution_end" ? true : completed,
  };
  if (frame.type === "tool_execution_start" && /^tasks?(?:$|[_:.])/i.test(String(result.toolName ?? ""))) {
    const shape = taskCallShape(frame);
    if (shape) result.taskCall = shape;
  }
  if (frame.type === "tool_execution_end") {
    const resultValue = frame.result ?? frame.output ?? frame.error;
    if (resultValue !== undefined) result.resultHash = opaqueError(resultValue).sha256;
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined && value !== null));
}

function makeDeferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DriverError("BLOCKED", `${label} timed out`)), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class RpcSession {
  constructor({ omp, cwd, env, label, requestId, runId, timeoutMs }) {
    this.omp = omp;
    this.cwd = cwd;
    this.env = env;
    this.label = label;
    this.requestId = requestId;
    this.runId = runId;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.rawBuffer = Buffer.alloc(0);
    this.chunk = null;
    this.protocolVersion = 1;
    this.fatal = null;
    this.ready = makeDeferred();
    this.closeDeferred = makeDeferred();
    this.pendingResponses = new Map();
    this.promptResults = new Map();
    this.settled = false;
    this.settledWaiters = [];
    this.evidence = {
      label,
      request_id: requestId,
      run_id: runId,
      rpc: {
        argv: ["--mode", "rpc", "--no-ui", "--no-session", "--no-extensions", "--no-context-files", "--no-lsp", "--no-title"],
        protocol: null,
        event_filter: RPC_EVENT_FILTER,
        subagent_subscription: null,
      },
      calls: [],
      results: [],
      tool_events: [],
      subagent_frames: [],
      subagent_terminal: [],
      native_progress_terminal: [],
      subagent_registry: [],
      subagent_messages: [],
      subagent_registry_shape: null,
      task_details: [],
      task_calls: [],
      terminal: null,
      usage: [],
      serving_models: [],
    };
  }

  start() {
    this.child = spawn(this.omp, ["--mode", "rpc", "--no-ui", "--no-session", "--no-extensions", "--no-context-files", "--no-lsp", "--no-title"], {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.stdout.on("data", (data) => this.onStdout(Buffer.from(data)));
    this.child.stdout.on("error", (error) => this.fail(new DriverError("BLOCKED", `OMP stdout error: ${scrubText(error.message)}`)));
    this.child.stderr.on("data", (data) => {
      this.evidence.stderr_bytes = (this.evidence.stderr_bytes ?? 0) + Buffer.byteLength(data);
    });
    this.child.stderr.on("error", (error) => this.fail(new DriverError("BLOCKED", `OMP stderr error: ${scrubText(error.message)}`)));
    this.child.stdin.on("error", (error) => this.fail(new DriverError("BLOCKED", `OMP stdin error: ${scrubText(error.message)}`)));
    this.child.on("error", (error) => this.fail(new DriverError("BLOCKED", `OMP process error: ${scrubText(error.message)}`)));
    this.child.on("close", (code, signal) => {
      this.evidence.process = { exit_code: code, signal: signal ?? null };
      if (this.rawBuffer.length > 0) this.fail(new DriverError("BLOCKED", "OMP closed with a partial RPC frame"));
      if (this.chunk) this.fail(new DriverError("BLOCKED", "OMP closed during rpc_chunk reassembly"));
      this.closeDeferred.resolve({ code, signal });
      if (!this.readyResolved) this.ready.reject(new DriverError("BLOCKED", "OMP closed before ready"));
      for (const waiter of this.pendingResponses.values()) waiter.reject(new DriverError("BLOCKED", "OMP closed before response"));
      this.pendingResponses.clear();
      for (const waiter of this.promptResults.values()) waiter.reject(new DriverError("BLOCKED", "OMP closed before prompt_result"));
      this.promptResults.clear();
    });
    return withTimeout(this.ready.promise, this.timeoutMs, `${this.label} ready`);
  }

  fail(error) {
    if (!this.fatal) this.fatal = error;
    this.ready.reject(this.fatal);
    for (const waiter of this.pendingResponses.values()) waiter.reject(this.fatal);
    this.pendingResponses.clear();
    for (const waiter of this.promptResults.values()) waiter.reject(this.fatal);
    this.promptResults.clear();
    for (const waiter of this.settledWaiters) waiter.reject(this.fatal);
    this.settledWaiters = [];
    if (this.child && !this.child.killed) this.child.kill();
  }

  onStdout(data) {
    if (this.fatal) return;
    this.rawBuffer = Buffer.concat([this.rawBuffer, data]);
    while (true) {
      const newline = this.rawBuffer.indexOf(0x0a);
      if (newline < 0) {
        if (this.rawBuffer.byteLength > MAX_PHYSICAL_FRAME_BYTES) this.fail(new DriverError("BLOCKED", "RPC physical frame exceeded 1 MiB without newline"));
        return;
      }
      const line = this.rawBuffer.subarray(0, newline);
      this.rawBuffer = this.rawBuffer.subarray(newline + 1);
      if (line.byteLength + 1 > MAX_PHYSICAL_FRAME_BYTES) {
        this.fail(new DriverError("BLOCKED", "RPC physical frame exceeded 1 MiB"));
        return;
      }
      const withoutCr = line.at(-1) === 0x0d ? line.subarray(0, line.length - 1) : line;
      if (withoutCr.length === 0) continue;
      let frame;
      try {
        frame = JSON.parse(decoder.decode(withoutCr));
      } catch (error) {
        this.fail(new DriverError("BLOCKED", `invalid UTF-8/JSON RPC frame: ${scrubText(error.message)}`));
        return;
      }
      try {
        this.consumePhysical(frame);
      } catch (error) {
        this.fail(error instanceof DriverError ? error : new DriverError("BLOCKED", scrubText(error.message)));
        return;
      }
      if (this.fatal) return;
    }
  }

  consumePhysical(frame) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new DriverError("BLOCKED", "RPC frame is not a JSON object");
    if (frame.type === "rpc_chunk") {
      if (this.protocolVersion !== 2) throw new DriverError("BLOCKED", "received rpc_chunk before protocol v2 was negotiated");
      const { chunkId, index, count, byteLength, data } = frame;
      if (typeof chunkId !== "string" || chunkId === "" || !Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(count) || count < 1 || index >= count || !Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_REASSEMBLED_FRAME_BYTES || typeof data !== "string") throw new DriverError("BLOCKED", "invalid rpc_chunk metadata");
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new DriverError("BLOCKED", "invalid rpc_chunk base64");
      const decoded = Buffer.from(data, "base64");
      if (decoded.toString("base64") !== data) throw new DriverError("BLOCKED", "non-canonical rpc_chunk base64");
      if (!this.chunk) {
        if (index !== 0) throw new DriverError("BLOCKED", "rpc_chunk sequence did not start at index zero");
        this.chunk = { chunkId, count, byteLength, nextIndex: 0, bytes: [], total: 0 };
      }
      if (this.chunk.chunkId !== chunkId || this.chunk.count !== count || this.chunk.byteLength !== byteLength || index !== this.chunk.nextIndex) throw new DriverError("BLOCKED", "interleaved or out-of-order rpc_chunk sequence");
      this.chunk.bytes.push(decoded);
      this.chunk.total += decoded.byteLength;
      this.chunk.nextIndex += 1;
      if (this.chunk.total > MAX_REASSEMBLED_FRAME_BYTES || this.chunk.total > byteLength) throw new DriverError("BLOCKED", "rpc_chunk reassembly exceeded declared size");
      if (this.chunk.nextIndex === this.chunk.count) {
        if (this.chunk.total !== this.chunk.byteLength) throw new DriverError("BLOCKED", "rpc_chunk reassembly length mismatch");
        const bytes = Buffer.concat(this.chunk.bytes, this.chunk.total);
        this.chunk = null;
        let text;
        try {
          text = decoder.decode(bytes);
        } catch (error) {
          throw new DriverError("BLOCKED", `rpc_chunk payload is not strict UTF-8: ${scrubText(error.message)}`);
        }
        let logical;
        try {
          logical = JSON.parse(text);
        } catch (error) {
          throw new DriverError("BLOCKED", `rpc_chunk payload is not JSON: ${scrubText(error.message)}`);
        }
        this.consumeLogical(logical);
      }
      return;
    }
    if (this.chunk) throw new DriverError("BLOCKED", "rpc_chunk sequence was interrupted");
    this.consumeLogical(frame);
  }

  consumeLogical(frame) {
    if (frame.type === "ready") {
      this.readyResolved = true;
      this.evidence.rpc.ready = {
        protocolVersion: frame.protocolVersion,
        supportedProtocolVersions: Array.isArray(frame.supportedProtocolVersions) ? frame.supportedProtocolVersions.filter((item) => Number.isInteger(item)) : [],
        maxFrameBytes: frame.maxFrameBytes,
        maxReassembledFrameBytes: frame.maxReassembledFrameBytes,
      };
      this.ready.resolve(frame);
      return;
    }
    if (frame.type === "response") {
      const response = {
        id: typeof frame.id === "string" && UUID_V4.test(frame.id) ? frame.id : undefined,
        command: typeof frame.command === "string" ? frame.command : undefined,
        success: frame.success === true,
        code: typeof frame.code === "string" ? frame.code : undefined,
        error: frame.success === false && frame.error !== undefined ? safeNativeFailure(frame.error) : undefined,
        dataKeys: frame.data && typeof frame.data === "object" ? Object.keys(frame.data).filter((key) => !sensitiveKey(key)).sort() : [],
      };
      this.evidence.results.push(Object.fromEntries(Object.entries(response).filter(([, value]) => value !== undefined)));
      addTaskDetails(this.evidence, frame.data, "response");
      const waiter = typeof frame.id === "string" ? this.pendingResponses.get(frame.id) : null;
      if (waiter) {
        this.pendingResponses.delete(frame.id);
        waiter.resolve(frame);
      }
      return;
    }
    if (frame.type === "prompt_result") {
      const summary = {
        type: frame.type,
        id: typeof frame.id === "string" && UUID_V4.test(frame.id) ? frame.id : undefined,
        agentInvoked: frame.agentInvoked === true,
        status: typeof frame.status === "string" ? frame.status : undefined,
        sessionSettled: frame.sessionSettled === true,
        error: frame.error ? safeNativeFailure(frame.error) : undefined,
      };
      this.evidence.terminal = { ...(this.evidence.terminal ?? {}), prompt_result: Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined)) };
      const waiter = typeof frame.id === "string" ? this.promptResults.get(frame.id) : null;
      if (waiter) {
        this.promptResults.delete(frame.id);
        waiter.resolve(frame);
      }
      return;
    }
    if (frame.type === "session_settled") {
      this.settled = true;
      this.evidence.terminal = { ...(this.evidence.terminal ?? {}), session_settled: true };
      for (const terminal of this.settledWaiters) terminal.resolve(frame);
      this.settledWaiters = [];
      return;
    }
    if (frame.type === "tool_execution_start" || frame.type === "tool_execution_end") {
      const summary = summarizeToolEvent(frame);
      const knownToolName = typeof summary.toolName === "string" && summary.toolName !== "" ? scrubText(summary.toolName, 128) : "<unknown>";
      const safeToolObservation = {
        name: knownToolName,
        event: frame.type,
        callID: eventCorrelationId(frame),
      };
      const forbiddenTool = FORBIDDEN_NATIVE_TOOL_NAME.test(knownToolName);
      const allowedTool = /^(?:tasks?|read|glob|grep|wait|todo)(?:$|[_:.])/i.test(knownToolName);
      if (forbiddenTool || !allowedTool) {
        this.evidence.tool_events.push({ ...summary, observed_before_guard: safeToolObservation });
        if (forbiddenTool) throw new DriverError("BLOCKED", `OMP root requested a forbidden mutation, shell, host, or network tool (${knownToolName})`, { knownToolName, toolEvent: safeToolObservation });
        throw new DriverError("BLOCKED", `OMP root used a non-read/wait/task tool (${knownToolName}); native profile probe permits only read-only research and real task dispatch`, { knownToolName, toolEvent: safeToolObservation });
      }
      this.evidence.tool_events.push(summary);
      if (summary.taskCall) this.evidence.task_calls.push(summary.taskCall);
      if (frame.type === "tool_execution_end" && /^tasks?(?:$|[_:.])/i.test(knownToolName)) {
        if (frame.isError !== false || frame.error !== undefined || [frame, frame.result ?? frame.output].some(value => value && (value.isError === true || value.aborted === true || value.failed === true || value.success === false || value.error !== undefined))) blocked("Root TASK END did not succeed");
        addTaskDetails(this.evidence, frame.result ?? frame.output, "tool_execution_end", eventCorrelationId(frame));
      }
      return;
    }
    if (frame.type === "subagent_lifecycle" || frame.type === "subagent_progress" || frame.type === "subagent_event") {
      const nested = frame.payload ?? frame.event ?? frame.data ?? frame;
      const nestedEvent = frame.type === "subagent_event" && nested?.event && typeof nested.event === "object" ? nested.event : null;
      const progress = nested?.progress && typeof nested.progress === "object" ? nested.progress : null;
      const taskId = [nested?.id, progress?.id, frame.agentId, frame.agent_id, frame.taskId, frame.task_id, frame.id].find((value) => typeof value === "string" && value !== "") ?? null;
      const summary = {
        type: frame.type,
        parentToolCallId: nested?.parentToolCallId ?? progress?.parentToolCallId ?? null,
        id: taskId,
        agent: typeof nested?.agent === "string" ? nested.agent : typeof progress?.agent === "string" ? progress.agent : typeof frame.agent === "string" ? frame.agent : null,
        agentSource: typeof nested?.agentSource === "string" ? nested.agentSource : typeof progress?.agentSource === "string" ? progress.agentSource : typeof frame.agentSource === "string" ? frame.agentSource : null,
        status: typeof nested?.status === "string" ? nested.status : typeof progress?.status === "string" ? progress.status : typeof frame.status === "string" ? frame.status : null,
        toolName: eventToolName(nestedEvent ?? nested),
        resultHash: (nestedEvent ?? nested)?.result !== undefined ? opaqueError((nestedEvent ?? nested).result).sha256 : undefined,
      };
      if (FORBIDDEN_NATIVE_TOOL_NAME.test(String(summary.toolName ?? "")) || /^tasks?(?:$|[_:.])/i.test(String(summary.toolName ?? ""))) {
        throw new DriverError("BLOCKED", "OMP subagent requested a forbidden tool or nested task dispatch");
      }
      addServingModelEvidence(this.evidence, nestedEvent ?? nested, frame.type, taskId);
      if ((nestedEvent ?? nested)?.message && typeof (nestedEvent ?? nested).message === "object") addServingModelEvidence(this.evidence, (nestedEvent ?? nested).message, `${frame.type}:message`, taskId);
      this.evidence.subagent_frames.push(Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined && value !== null)));
      addTaskDetails(this.evidence, nested, frame.type);
      if (nestedEvent) addTaskDetails(this.evidence, nestedEvent, `${frame.type}:event`);
      if (progress) {
        addTaskDetails(this.evidence, progress, `${frame.type}:progress`);
        for (const key of ["extractedToolData", "inflightTaskDetails"]) addTaskDetails(this.evidence, progress[key], `${frame.type}:progress:${key}`);
      }
      if (nestedEvent?.message && typeof nestedEvent.message === "object") addTaskDetails(this.evidence, nestedEvent.message.details ?? nestedEvent.message, `${frame.type}:message`);
      const payloadEvidence = safeSubagentPayload(frame.type, nested, taskId);
      if (payloadEvidence) {
        const digest = sha256Text(JSON.stringify(payloadEvidence));
        if (!this.evidence.subagent_terminal.some((entry) => entry.digest === digest)) this.evidence.subagent_terminal.push({ digest, ...payloadEvidence });
        const progressTerminal = nativeProgressTerminalRecord(payloadEvidence);
        if (progressTerminal) {
          const progressDigest = sha256Text(JSON.stringify(progressTerminal));
          if (!this.evidence.native_progress_terminal.some((entry) => entry.digest === progressDigest)) {
            this.evidence.native_progress_terminal.push({ digest: progressDigest, ...progressTerminal });
          }
        }
      }
      return;
    }
    if (frame.type === "message_end") {
      const message = frame.message && typeof frame.message === "object" ? frame.message : {};
      const usage = message.usage;
      if (usage && typeof usage === "object") {
        const safeUsage = {};
        for (const [key, value] of Object.entries(usage)) {
          if (!sensitiveKey(key) && typeof value === "number") safeUsage[key] = value;
        }
        this.evidence.usage.push(safeUsage);
      }
      addServingModelEvidence(this.evidence, message, "message_end");
      addTaskDetails(this.evidence, message.details ?? message, "message_end");
      return;
    }
    if (frame.type === "agent_end") {
      this.evidence.terminal = {
        ...(this.evidence.terminal ?? {}),
        agent_end: {
          yielded: frame.yielded === true,
          isTerminal: frame.isTerminal === true,
          awaitingAsyncWork: frame.awaitingAsyncWork === true,
          messageCount: Array.isArray(frame.messages) ? frame.messages.length : undefined,
        },
      };
      addTaskDetails(this.evidence, frame.messages, "agent_end");
      return;
    }
    if (frame.type === "extension_ui_request" || frame.type === "host_uri_request" || frame.type === "host_tool_call" || /login|auth/i.test(String(frame.type ?? ""))) {
      throw new DriverError("BLOCKED", "OMP requested UI, host access, or authentication; no fallback is allowed");
    }
  }

  send(command) {
    if (!this.child || this.child.killed || this.stdinEnded) throw new DriverError("BLOCKED", "cannot send RPC command after process termination");
    const id = typeof command.id === "string" ? command.id : undefined;
    const call = { id, type: command.type };
    if (command.type === "prompt") {
      call.request_id = this.requestId;
      call.run_id = this.runId;
      call.message_sha256 = sha256Text(command.message);
      call.message_bytes = Buffer.byteLength(command.message, "utf8");
    } else if (command.type === "set_event_filter") {
      call.events = command.events;
      call.messageUpdates = command.messageUpdates;
    } else if (command.type === "set_subagent_subscription") {
      call.level = command.level;
    } else if (command.type === "negotiate_protocol") {
      call.protocolVersion = command.protocolVersion;
    }
    this.evidence.calls.push(call);
    try {
      this.child.stdin.write(`${JSON.stringify(command)}\n`);
    } catch (error) {
      this.fail(new DriverError("BLOCKED", `OMP stdin write failed: ${scrubText(error.message)}`));
      throw this.fatal;
    }
  }

  requestResponse(command, label) {
    const response = this.awaitResponse(command.id, label);
    try {
      this.send(command);
    } catch (error) {
      this.pendingResponses.delete(command.id);
      throw error;
    }
    return response;
  }

  awaitResponse(id, label) {
    const waiter = makeDeferred();
    this.pendingResponses.set(id, waiter);
    return withTimeout(waiter.promise, this.timeoutMs, `${this.label} ${label}`);
  }

  awaitPromptResult(id) {
    const waiter = makeDeferred();
    this.promptResults.set(id, waiter);
    return withTimeout(waiter.promise, this.timeoutMs, `${this.label} prompt_result`);
  }

  awaitSettled() {
    if (this.settled) return Promise.resolve();
    const waiter = makeDeferred();
    this.settledWaiters.push(waiter);
    return withTimeout(waiter.promise, this.timeoutMs, `${this.label} session_settled`);
  }

  async captureSubagentRegistry() {
    const registry = await this.requestResponse({ id: randomUUID(), type: "get_subagents" }, "subagent registry");
    if (registry.success !== true) {
      this.evidence.subagent_registry_error = safeNativeFailure(registry.error);
      return;
    }
    this.evidence.subagent_registry_shape = safeKeyTree(registry.data);
    const snapshots = registry.data?.subagents;
    if (!Array.isArray(snapshots)) {
      this.evidence.subagent_registry_error = safeNativeFailure({ name: "InvalidSubagentRegistry", code: "missing_subagents" });
      return;
    }
    for (const snapshot of snapshots) {
      const safeSnapshot = safeSubagentSnapshot(snapshot);
      if (safeSnapshot) this.evidence.subagent_registry.push(safeSnapshot);
      addTaskDetails(this.evidence, snapshot?.progress, "get_subagents");
      for (const key of ["extractedToolData", "inflightTaskDetails"]) addTaskDetails(this.evidence, snapshot?.progress?.[key], `get_subagents:${key}`);
      const subagentId = typeof snapshot?.id === "string" && snapshot.id !== "" ? snapshot.id : null;
      if (!subagentId) continue;
      const messages = await this.requestResponse({ id: randomUUID(), type: "get_subagent_messages", subagentId }, "subagent messages");
      if (messages.success !== true) {
        this.evidence.subagent_messages.push({ subagent_id: subagentId, error: safeNativeFailure(messages.error) });
        continue;
      }
      const data = messages.data && typeof messages.data === "object" ? messages.data : {};
      const record = {
        subagent_id: subagentId,
        session_file: typeof data.sessionFile === "string" ? scrubText(data.sessionFile) : null,
        from_byte: typeof data.fromByte === "number" ? data.fromByte : null,
        next_byte: typeof data.nextByte === "number" ? data.nextByte : null,
        reset: data.reset === true,
        assistant: [],
      };
      const entries = Array.isArray(data.messages) ? data.messages : Array.isArray(data.entries) ? data.entries : [];
      for (const message of entries) {
        const nestedMessage = message?.message && typeof message.message === "object" ? message.message : message;
        addServingModelEvidence(this.evidence, message, "get_subagent_messages", subagentId);
        if (nestedMessage !== message) addServingModelEvidence(this.evidence, nestedMessage, "get_subagent_messages:message", subagentId);
        addTaskDetails(this.evidence, message?.details ?? nestedMessage?.details ?? nestedMessage, "get_subagent_messages");
        const safeMessage = safeAssistantTranscript(nestedMessage, subagentId);
        if (safeMessage) record.assistant.push(safeMessage);
      }
      this.evidence.subagent_messages.push(record);
    }
  }

  async configure() {
    const negotiationId = randomUUID();
    const negotiation = await this.requestResponse({ id: negotiationId, type: "negotiate_protocol", protocolVersion: 2 }, "protocol negotiation");
    if (negotiation.success === true) {
      this.protocolVersion = 2;
      this.evidence.rpc.protocol = { version: 2, negotiated: true };
    } else {
      const supported = this.evidence.rpc.ready?.supportedProtocolVersions ?? [];
      if (supported.includes(2)) throw new DriverError("BLOCKED", `${this.label} protocol v2 negotiation failed despite advertisement`);
      this.protocolVersion = 1;
      this.evidence.rpc.protocol = { version: 1, negotiated: false, fallbackError: opaqueError(negotiation.error) };
    }
    const filterId = randomUUID();
    const filter = await this.requestResponse({
      id: filterId,
      type: "set_event_filter",
      events: RPC_EVENT_FILTER,
      messageUpdates: "full",
    }, "event filter");
    if (filter.success !== true) throw new DriverError("BLOCKED", `${this.label} event filter was rejected`);
    const events = filter.data?.events;
    if (!Array.isArray(events) || events.join("\0") !== RPC_EVENT_FILTER.join("\0")) throw new DriverError("BLOCKED", `${this.label} event filter response did not confirm requested events`);
    this.evidence.rpc.event_filter_confirmed = events;

    const subscriptionId = randomUUID();
    const subscription = await this.requestResponse({ id: subscriptionId, type: "set_subagent_subscription", level: "events" }, "subagent subscription");
    if (subscription.success !== true) throw new DriverError("BLOCKED", `${this.label} subagent event subscription was rejected`);
    this.evidence.rpc.subagent_subscription = { level: "events", response_keys: subscription.data && typeof subscription.data === "object" ? Object.keys(subscription.data).sort() : [] };
  }

  async execute(message) {
    await this.start();
    await this.configure();
    const promptId = randomUUID();
    const acknowledgementPromise = this.awaitResponse(promptId, "prompt acknowledgement");
    const resultPromise = this.awaitPromptResult(promptId);
    try {
      this.send({ id: promptId, type: "prompt", message });
    } catch (error) {
      this.pendingResponses.delete(promptId);
      this.promptResults.delete(promptId);
      throw error;
    }
    const acknowledgement = await acknowledgementPromise;
    if (acknowledgement.success !== true) throw new DriverError("BLOCKED", `${this.label} prompt was not admitted`);
    if (acknowledgement.data?.agentInvoked === false) assertion(`${this.label} prompt completed locally without invoking the root model`, { expectedRed: false });
    const result = await resultPromise;
    if (result.status !== "completed" || result.agentInvoked !== true) throw new DriverError("BLOCKED", `${this.label} prompt ended without a completed root-model turn`);
    if (result.sessionSettled !== true) await this.awaitSettled();
    await this.captureSubagentRegistry();
    this.evidence.terminal = { ...(this.evidence.terminal ?? {}), status: result.status, sessionSettled: result.sessionSettled === true || this.settled };
    return this.evidence;
  }

  async close() {
    if (!this.child || this.stdinEnded) return;
    this.stdinEnded = true;
    this.child.stdin.end();
    const closed = await withTimeout(this.closeDeferred.promise, 30_000, `${this.label} process drain`);
    if (this.fatal) throw this.fatal;
    if (closed.code !== 0) throw new DriverError("BLOCKED", `${this.label} OMP exited unsuccessfully`);
  }

  async abort() {
    if (!this.child || this.child.killed) return;
    try {
      if (!this.stdinEnded) {
        const id = randomUUID();
        this.send({ id, type: "abort" });
      }
    } catch {
      // The process may already be in an unrecoverable protocol state.
    }
    if (!this.stdinEnded) {
      this.stdinEnded = true;
      this.child.stdin.end();
    }
    await new Promise((resolveValue) => setTimeout(resolveValue, 250));
    if (!this.child.killed) this.child.kill();
  }
}

function profileSourceEvidence(context, profile) {
  const sourceEntry = context.packageInfo.entries.find((entry) => entry.kind === "agent" && entry.sourceRelativePath.endsWith(`/${profile}.md`));
  if (!sourceEntry) blocked(`frozen package has no source entry for ${profile}`);
  return {
    path: sourceEntry.sourceRelativePath,
    sha256: sourceEntry.sourceSha256,
    bytes: sourceEntry.bytes,
    destination: sourceEntry.destinationRelative,
  };
}
function immutableProbeSourceEntries(sourceEntries) {
  const profilePaths = new Set(INSTALLER_AGENTS.map(([skill, subdir, file]) => `${skill}/${subdir}/${file}`));
  const selected = sourceEntries.filter((entry) => (entry.kind === "agent" && profilePaths.has(entry.sourceRelativePath)) || (entry.kind === "skill" && entry.sourceRelativePath === "deep-review/lib/protocol.mjs"));
  if (selected.length !== profilePaths.size + 1) blocked("immutable T009A/B source scope did not contain exactly twelve profile files plus deep-review/lib/protocol.mjs", { observed: selected.map((entry) => entry.sourceRelativePath).sort() });
  return selected;
}


function buildPrompt({ fixture, profiles }) {
  const profileAssignments = profiles.map(([agent, name]) => ({
    name,
    agent,
    task: profileTask(agent, fixture),
    solutionSpace: "The contract and read-only assignment are fixed; report only observed facts and limitations, with no implementation or host action.",
  }));
  const deepAssignments = [
    {
      name: REVIEW_ASSIGNMENTS.deepOne.id,
      agent: REVIEW_ASSIGNMENTS.deepOne.agent,
      task: deepTask(REVIEW_ASSIGNMENTS.deepOne, fixture, "DEEP_REVIEW"),
      solutionSpace: "The files and revision are fixed; findings are open only within the assigned consumer/test slice.",
    },
    {
      name: REVIEW_ASSIGNMENTS.deepTwo.id,
      agent: REVIEW_ASSIGNMENTS.deepTwo.agent,
      task: deepTask(REVIEW_ASSIGNMENTS.deepTwo, fixture, "DEEP_REVIEW"),
      solutionSpace: "The files and revision are fixed; findings are open only within the assigned consumer/test slice.",
    },
  ];
  const peerAssignments = [
    {
      name: REVIEW_ASSIGNMENTS.peerNegative.id,
      agent: REVIEW_ASSIGNMENTS.peerNegative.agent,
      task: peerTask(REVIEW_ASSIGNMENTS.peerNegative, fixture, "negative", "BLOQUEADO"),
      solutionSpace: "The fixed fixture contains a consumer-visible defect; identify only concrete blocking evidence in the assigned files.",
    },
    {
      name: REVIEW_ASSIGNMENTS.peerMalformed.id,
      agent: REVIEW_ASSIGNMENTS.peerMalformed.agent,
      task: peerTask(REVIEW_ASSIGNMENTS.peerMalformed, fixture, "malformed", "MALFORMED"),
      solutionSpace: "The output probe is intentionally malformed; do not repair it or turn it into a valid review verdict.",
    },
  ];
  return [
    "Run one real native profile/dispatch/review probe in this disposable project.",
    `PROJECT_OVERLAY_ROOT=${fixture.overlay.destinationRoot}`,
    `FIXTURE_ROOT=${fixture.worktree}`,
    `FIXTURE_REVISION=${fixture.revision}`,
    "The project .omp overlay in the current worktree is the only profile source; normal inherited HOME/USERPROFILE authentication is intentional.",
    "Pinned OMP references: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/task-agent-discovery.md ; https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/tools/task.md ; https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/rpc.md. Read these exact v18.18.6 sources; do not infer a wire.",
    "Root research tools are limited to read on the copied fixture, project .omp profiles, pinned primary docs, or agent://terminal; wait for real asynchronous jobs and todo for runtime-only session planning/checkpoints are permitted; no other root tool is authorized.",
    "Read the pinned OMP task/discovery/RPC documentation and the copied local profiles before dispatch. Do not invent task fields, model routes, settings, aliases, telemetry, jobs, or outputs.",
    "Use the task tool only through its dynamically exposed schema. If batch is exposed, dispatch each listed array as one {context,tasks[]} call with an explicit non-empty solutionSpace per item; if batch is not exposed, dispatch equivalent flat calls one item at a time. Correlate only real result ids and terminal records.",
    "Do not send model, thinkingLevel, task.structured, outputSchema, schemaMode, isolated, tools, or global-setting fields. Do not call get_subagents as a profile-definition oracle; it is only a runtime-instance surface.",
    "All profile diagnostics are read-only. Do not write/edit files, run bash, run Git mutations, use SSH/host tools, commit, publish, install, change HOME, change OMP settings, or make external requests. The host-operator task is planning-only and explicitly has no authorized host operation.",
    "First dispatch exactly these twelve named profile assignments:",
    JSON.stringify({ context: `${reviewInputContext(fixture)}\nProfile diagnostics are read-only; report observed discovery/model/effort facts and limitations only.`, tasks: profileAssignments }, null, 2),
    "Then dispatch DeepReviewOne and DeepReviewTwo as independent deep-reviewer assignments. Use protocol_mode DEEP_REVIEW, preserve incremental yield fields and final structured output, and wait for both terminal results before aggregation. Their file sets are disjoint; use the actual result ids, never synthetic records.",
    JSON.stringify({ context: `${reviewInputContext(fixture)}\nReview fixture at exact revision ${fixture.revision}; preserve the two real assignments.`, tasks: deepAssignments }, null, 2),
    "Then dispatch the two remaining independent peer-reviewer assignments in protocol_mode TDD_PEER_REVIEW under the approved native structured wire. PeerNegative must return a frontmatter-shaped object with status BLOQUEADO and name the wrong consumer; PeerMalformed is deliberately asked to return a malformed terminal payload and must be rejected by the real consumer. Preserve the raw terminal returned wire and actual structured validation; never convert TDD status to deep-review VALID.",
    JSON.stringify({ context: `${reviewInputContext(fixture)}\nTDD peer review of fixture revision ${fixture.revision}; read the exact assignment files and evidence.`, tasks: peerAssignments }, null, 2),
    "If a task runs asynchronously, wait for its real terminal result. Report only observed TaskToolDetails results/progress fields (id, agent, agentSource, exitCode, source file/hash when exposed, resolved model provider/id only, resolved thinking level, fallback boolean, structured validation/data, retry metadata, and safe terminal output). Do not report provider diagnostics, credentials, hidden reasoning, or COT.",
    "Finish only after all profile, deep-review, and peer-review calls have terminal results. Do not claim PASS from configuration prose or from your final narrative; the driver reads the native transport evidence.",
  ].join("\n\n");
}
function buildPeerPositivePrompt({ fixture }) {
  const assignment = {
    name: REVIEW_ASSIGNMENTS.peerPositive.id,
    agent: REVIEW_ASSIGNMENTS.peerPositive.agent,
    task: peerTask(REVIEW_ASSIGNMENTS.peerPositive, fixture, "positive", "APROVADO"),
    solutionSpace: "The fixed fixture is correct; decide only whether the supplied implementation satisfies the contract.",
  };
  return [
    "Run one real native peer-positive wire probe before the broader profile/review batch.",
    `PROJECT_OVERLAY_ROOT=${fixture.overlay.destinationRoot}`,
    `FIXTURE_ROOT=${fixture.worktree}`,
    `FIXTURE_REVISION=${fixture.revision}`,
    "The project .omp overlay in the current worktree is the only profile source; normal inherited HOME/USERPROFILE authentication is intentional.",
    "Pinned OMP references: https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/task-agent-discovery.md ; https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/tools/task.md ; https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/rpc.md. Read these exact v18.18.6 sources; do not infer a wire.",
    "Root research tools are limited to read on the copied fixture, project .omp profiles, pinned primary docs, or agent://terminal; wait for real asynchronous jobs and todo for runtime-only session planning/checkpoints are permitted; no other root tool is authorized.",
    "Use the task tool only through its dynamically exposed schema. If batch is exposed, dispatch exactly this one-item {context,tasks[]} call with an explicit non-empty solutionSpace; if batch is not exposed, dispatch the equivalent flat call. Do not invent fields or send model, thinkingLevel, task.structured, outputSchema, schemaMode, isolated, tools, or global-setting fields.",
    "The assignment is read-only. Do not write/edit files, run bash, run Git mutations, use SSH/host tools, commit, publish, install, change HOME, change OMP settings, or make external requests.",
    "PeerPositive must return a frontmatter-shaped native TDD_PEER_REVIEW object with status APROVADO; preserve the raw terminal returned wire and validate it through the real consumer without converting it to deep-review VALID or accepting legacy text.",
    JSON.stringify({ context: `${reviewInputContext(fixture)}\nTDD peer review of fixture revision ${fixture.revision}; read the exact assignment files and evidence.`, tasks: [assignment] }, null, 2),
    "Wait for the real terminal result and report only safe TaskToolDetails fields. Do not report credentials, provider diagnostics, hidden reasoning, or COT.",
  ].join("\n\n");
}
function reviewInputContext(fixture) {
  const diff = fixture.diffEvidence;
  return [
    "Spec Kit review inputs are present in the fixture and are mandatory reading:",
    `spec: ${join(fixture.worktree, "specs/specs005-omp-compatible-release/spec.md")}`,
    `plan: ${join(fixture.worktree, "specs/specs005-omp-compatible-release/plan.md")}`,
    `tasks: ${join(fixture.worktree, "specs/specs005-omp-compatible-release/tasks.md")}`,
    `interface_contract: ${join(fixture.worktree, "specs/specs005-omp-compatible-release/contracts/interface-contract.md")} (version 0.2)`,
    "implemented_by: fixture-author",
    "reviewed_by: peer-reviewer",
    `local_revision: ${fixture.revision}`,
    `baseline_revision: ${fixture.baselineRevision}`,
    `full_diff_sha256: ${diff.sha256}`,
    `full_diff_bytes: ${diff.bytes}`,
    "criteria_to_tests: AC-FIX-001 -> test/checkout-good.test.mjs::checkout applies the contract discount; AC-FIX-002 -> test/checkout-good.test.mjs::checkout applies the contract discount",
    "real_test_evidence: evidence/positive-test-evidence.json; helper-only limitation: evidence/negative-test-evidence.json",
    "FULL_DIFF_BEGIN",
    diff.content,
    "FULL_DIFF_END",
  ].join("\n");
}


function profileTask(agent, fixture) {
  const paths = [
    join(fixture.worktree, "specs/specs005-omp-compatible-release/spec.md"),
    join(fixture.worktree, "specs/specs005-omp-compatible-release/plan.md"),
    join(fixture.worktree, "specs/specs005-omp-compatible-release/tasks.md"),
    join(fixture.worktree, "specs/specs005-omp-compatible-release/contracts/interface-contract.md"),
    join(fixture.worktree, "src/checkout-good.mjs"),
    join(fixture.worktree, "src/checkout-bad.mjs"),
    join(fixture.worktree, "test/checkout-good.test.mjs"),
    join(fixture.worktree, "test/discount.test.mjs"),
    join(fixture.worktree, "evidence/positive-test-evidence.json"),
    join(fixture.worktree, "evidence/negative-test-evidence.json"),
  ];
  const common = `Read only these fixture paths: ${paths.join(", ")}. Exact local revision is ${fixture.revision}; baseline is ${fixture.baselineRevision}; full diff ${fixture.diffEvidence.sha256} (${fixture.diffEvidence.bytes} bytes) is supplied in the dispatch context. Do not modify any file or execute a host/network operation.`;
  const body = {
    "requirements-reader": "Extract the fixture contract and list concrete acceptance obligations and limitations; do not write.",
    architect: "Analyze the helper-to-consumer boundary and identify the smallest observable contract; do not write.",
    "host-operator": "Prepare a read-only hypothetical safety plan for this fixture, but explicitly perform no host, SSH, shell, service, or filesystem operation beyond reads.",
    "deep-reviewer": "Perform a read-only diagnostic review of the assigned fixture slice; report evidence and limitations, not a patch.",
    "spec-kit-author": "Assess whether the fixture spec and evidence are sufficient for the requested review; propose no edits.",
    "test-author": "Analyze the supplied test evidence and whether it covers the consumer-visible contract before a fix; do not create or edit tests.",
    "backend-developer": "Analyze the supplied failing consumer scenario before any fix and describe expected behavior; do not implement.",
    "frontend-developer": "Inspect the non-UI fixture and explain why no UI implementation is authorized; do not write.",
    refactorer: "Identify only behavior-preserving refactor risks in the fixture; do not change files.",
    "peer-reviewer": "Read-only diagnostic of the supplied fixture contract; this profile assignment is not one of the separately named TDD peer verdict probes, but the peer-reviewer public contract still applies: emit one native structured TDD_PEER_REVIEW yield object with agent peer-reviewer, status APROVADO or BLOQUEADO, the exact reviewed_revision, overall_correctness, a concise explanation, confidence, and optional findings; do not emit legacy text or deep-review VALID.",
    validator: "Check the supplied contract/evidence/revision for traceability gaps; do not execute or write.",
    integrator: "Assess mechanical integration barriers for the fixture and report no-op/read-only findings; do not merge or commit.",
  }[agent];
  return `${common}\nAssignment: ${body}`;
}

function deepTask(assignment, fixture, protocolMode) {
  return [
    `protocol_mode: ${protocolMode}`,
    `reviewed_revision: ${fixture.revision}`,
    `assignment_id: ${assignment.id}`,
    `assigned_files (and only these changed-file owners): ${assignment.files.join(", ")}`,
    `Read the Spec Kit spec at ${join(fixture.worktree, "specs/specs005-omp-compatible-release/spec.md")}, plan at ${join(fixture.worktree, "specs/specs005-omp-compatible-release/plan.md")}, tasks at ${join(fixture.worktree, "specs/specs005-omp-compatible-release/tasks.md")}, and interface contract at ${join(fixture.worktree, "specs/specs005-omp-compatible-release/contracts/interface-contract.md")}; local revision ${fixture.revision}, baseline ${fixture.baselineRevision}, and full diff ${fixture.diffEvidence.sha256} (${fixture.diffEvidence.bytes} bytes) are supplied in the dispatch context. Read the assigned files at that exact revision. The two assignments are independent and disjoint.`,
    reviewInputContext(fixture),
    "Use the real deep-reviewer incremental yield protocol: emit findings incrementally, then separate scalar fields agent, protocol_mode, status, reviewed_revision, overall_correctness, explanation, and confidence. Do not emit an APROVADO/BLOQUEADO TDD verdict.",
    assignment.id === REVIEW_ASSIGNMENTS.deepTwo.id
      ? "The assigned consumer is intentionally wrong. Report one concrete P1 finding for src/checkout-bad.mjs with the consumer-visible undiscounted-total defect and an exact line range."
      : "The assigned consumer and explicit test are correct. Report no findings and preserve the evidence-backed correct result.",
  ].join("\n");
}

function peerTask(assignment, fixture, kind, expected) {
  const malformed = kind === "malformed";
  return [
    "protocol_mode: TDD_PEER_REVIEW",
    `reviewed_revision: ${fixture.revision}`,
    `assignment_id: ${assignment.id}`,
    `case: ${kind}`,
    `assigned_files: ${assignment.files.join(", ")}`,
    `Read the Spec Kit spec at ${join(fixture.worktree, "specs/specs005-omp-compatible-release/spec.md")}, plan at ${join(fixture.worktree, "specs/specs005-omp-compatible-release/plan.md")}, tasks at ${join(fixture.worktree, "specs/specs005-omp-compatible-release/tasks.md")}, and interface contract at ${join(fixture.worktree, "specs/specs005-omp-compatible-release/contracts/interface-contract.md")}; local revision ${fixture.revision}, baseline ${fixture.baselineRevision}, and full diff ${fixture.diffEvidence.sha256} (${fixture.diffEvidence.bytes} bytes) are supplied in the dispatch context. Read the assigned files and real test evidence at that exact revision.`,
    reviewInputContext(fixture),
    malformed
      ? "This is a malformed-output rejection probe. After reading, emit a terminal payload that is neither a valid native structured APROVADO/BLOQUEADO peer object nor a valid normalized deep-review object. Emit the literal marker MALFORMED only; do not repair, explain, or wrap it."
      : `Native structured TDD peer output must have status exactly ${expected}; ${kind === "negative" ? "the consumer intentionally returns the undiscounted total; report a concrete blocking defect with file and line." : "the consumer delegates correctly and the explicit test evidence covers the contract; do not invent findings."}`,
    "Do not edit, run commands, use host/network operations, or alter the fixture. Preserve only fields permitted by the native structured schema; do not emit a legacy text verdict or deep-review VALID object.",
  ].join("\n");
}

function flattenTaskRecords(context) {
  const records = [];
  for (const event of context.nativeEvidence.task_details) {
    for (const record of event.details.results ?? []) records.push({ ...record, origin: event.origin, parentToolCallId: event.parentToolCallId ?? record.parentToolCallId, details_digest: event.digest });
    for (const record of event.details.progress ?? []) records.push({ ...record, origin: event.origin, parentToolCallId: event.parentToolCallId ?? record.parentToolCallId, details_digest: event.digest, progress: true });
  }
  return records;
}

function terminalRecords(context) {
  const byId = new Map();
  for (const record of flattenTaskRecords(context)) {
    if (typeof record.id !== "string" || record.id === "") continue;
    const prior = byId.get(record.id.toLowerCase());
    const status = String(record.status ?? "").toLowerCase();
    const terminalStatus = ["completed", "complete", "success", "succeeded", "failed", "error", "aborted", "canceled", "cancelled", "blocked"].includes(status);
    const isTerminal = record.exitCode !== undefined || record.output_text !== undefined || record.output_error !== undefined || record.structuredOutput !== undefined || terminalStatus;
    if (isTerminal) byId.set(record.id.toLowerCase(), record);
  }
  return [...byId.values()];
}
function hasTaskTerminalPayload(record) {
  return record && (record.exitCode !== undefined || record.output_text !== undefined || record.output_error !== undefined || record.structuredOutput !== undefined);
}
function nativeProgressRecords(context, id) {
  const expected = typeof id === "string" ? id.toLowerCase() : null;
  return context.nativeEvidence.native_progress_terminal.filter((record) => {
    if (!expected) return true;
    return typeof record.id === "string" && record.id.toLowerCase() === expected;
  });
}

function nativeYieldLabels(type) {
  if (typeof type === "string") return type.trim() ? [type.trim()] : [];
  if (!Array.isArray(type)) return [];
  return type.filter((label) => typeof label === "string" && label.trim() !== "").map((label) => label.trim());
}

function assembleNativeYield(record, shapes = null) {
  const items = Array.isArray(record?.yield) ? record.yield : [];
  if (items.length === 0) return undefined;
  let terminal = null;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.status === "aborted" || (Array.isArray(item.type) && nativeYieldLabels(item.type).length > 0)) continue;
    terminal = item;
    break;
  }
  const sections = {};
  const counts = new Map();
  for (const item of items) {
    if (!item || item.status === "aborted" || !Array.isArray(item.type)) continue;
    const labels = nativeYieldLabels(item.type);
    if (labels.length === 0 || !Object.prototype.hasOwnProperty.call(item, "data")) continue;
    for (const label of labels) {
      const shape = shapes?.[label];
      const count = counts.get(label) ?? 0;
      if (shape === "scalar") sections[label] = item.data;
      else if (count === 0) sections[label] = shape === "array" ? [item.data] : item.data;
      else if (Array.isArray(sections[label])) sections[label].push(item.data);
      else sections[label] = [sections[label], item.data];
      counts.set(label, count + 1);
    }
  }
  if (terminal && Object.prototype.hasOwnProperty.call(terminal, "data")) return terminal.data;
  return Object.keys(sections).length > 0 ? sections : undefined;
}

const DEEP_REVIEW_YIELD_SHAPES = Object.freeze({
  findings: "array",
  agent: "scalar",
  protocol_mode: "scalar",
  status: "scalar",
  reviewed_revision: "scalar",
  overall_correctness: "scalar",
  explanation: "scalar",
  confidence: "scalar",
});

function nativeProtocolFailure(entry) {
  if (!entry || typeof entry !== "object") return null;
  const candidates = [
    entry.error,
    entry.failure,
    entry.progress?.failure,
    entry.progress?.error,
    entry.event?.error,
    entry.event?.result?.output_error,
    entry.event?.result?.structuredOutput?.error,
    entry.structuredOutput?.error,
  ];
  for (const candidate of candidates) {
    if (candidate && (candidate.classification === "schema" || candidate.classification === "yield")) return candidate;
  }
  const structured = entry.structuredOutput ?? entry.event?.result?.structuredOutput;
  if (structured && ["invalid", "unavailable", "failed", "error"].includes(String(structured.status ?? "").toLowerCase())) {
    return {
      classification: "schema",
      classification_source: "structuredOutput.status",
      status: structured.status,
    };
  }
  return null;
}

function requireTerminalRecord(context, id) {
  const matches = terminalRecords(context).filter((record) => record.id.toLowerCase() === id.toLowerCase());
  if (matches.length !== 1) {
    const relatedTerminal = context.nativeEvidence.subagent_terminal.filter((entry) => {
      const ids = [entry.subagent_id, entry.id].filter((value) => typeof value === "string").map((value) => value.toLowerCase());
      return ids.includes(id.toLowerCase()) || ["failed", "aborted"].includes(String(entry.status ?? "").toLowerCase()) || entry.error !== undefined;
    }).slice(0, 16);
    blocked(`native task did not expose exactly one terminal result for ${id}`, {
      observed: matches.map((record) => ({ id: record.id, exitCode: record.exitCode, progress: record.progress === true })),
      native_terminal: relatedTerminal,
    });
  }
  const record = matches[0];
  if (!hasTaskTerminalPayload(record)) blocked(`native task ${id} did not expose a usable terminal payload`, { exitCode: record.exitCode ?? null, status: record.status ?? null });
  return observedSuccessfulTerminal(record, id, "task_tool_details");
}
function observedSuccessfulTerminal(record, id, sourceKind, requiresStatus = false) {
  const status = String(record?.status ?? "").toLowerCase();
  const failureStatuses = new Set(["failed", "error", "aborted", "canceled", "cancelled"]);
  const successStatuses = new Set(["completed", "complete", "success", "succeeded"]);
  // OMP v18.18.6 AgentProgress has status, not exitCode. task/index.ts
  // #registerSpawnJob derives completed only after checking the real SingleResult
  // exit/error/abort fields. Keep the absent numeric field unknown; inline
  // SingleResult still requires its observed numeric zero.
  const progressChannel = ["native_subagent_progress", "offline_peer_progress"].includes(sourceKind);
  const observedExit = Number.isFinite(record?.exitCode) && Number.isInteger(record.exitCode);
  if (record.exit_code_invalid === true || (!progressChannel && !observedExit)) {
    blocked(`native task ${id} did not expose an observed terminal exitCode`, { source_kind: sourceKind, exitCode: record?.exitCode ?? null, status: record?.status ?? null });
  }
  if (observedExit && record.exitCode !== 0) {
    blocked(`native task ${id} failed before a usable terminal result`, { source_kind: sourceKind, exitCode: record.exitCode, status: record?.status ?? null, error: record?.error ?? null });
  }
  if (record.isError === true || record.aborted === true || failureStatuses.has(status)) {
    blocked(`native task ${id} did not complete successfully`, { source_kind: sourceKind, status: record?.status ?? null, exitCode: record.exitCode });
  }
  if ((progressChannel && status !== "completed") || ((requiresStatus || status !== "") && !successStatuses.has(status))) {
    blocked(`native task ${id} exposed an unknown or contradictory terminal status`, { source_kind: sourceKind, status: record?.status ?? null, exitCode: record.exitCode });
  }
  if (record.output_error !== undefined || record.error !== undefined || record.failure !== undefined) {
    blocked(`native task ${id} exposed an error terminal payload`, { source_kind: sourceKind, error: record.output_error ?? record.error ?? record.failure });
  }
  return record;
}
function requireObservedTerminalRecord(context, id) {
  const taskMatches = terminalRecords(context).filter((record) => record.id.toLowerCase() === id.toLowerCase() && hasTaskTerminalPayload(record));
  if (taskMatches.length === 1) return { record: observedSuccessfulTerminal(taskMatches[0], id, "task_tool_details"), source_kind: "task_tool_details" };
  const progressMatches = nativeProgressRecords(context, id);
  if (progressMatches.length > 1) {
    blocked(`native task ${id} exposed duplicate native progress terminal records`, {
      source_kind: "native_subagent_progress",
      ids: progressMatches.map((record) => record.id),
      digests: progressMatches.map((record) => record.digest),
    });
  }
  if (progressMatches.length === 1) {
    const record = progressMatches[0];
    return { record: observedSuccessfulTerminal(record, id, record.source_kind, true), source_kind: record.source_kind };
  }
  return { record: requireTerminalRecord(context, id), source_kind: "task_tool_details" };
}

function assertTerminalDispatch(context, id, record) {
  if (record.source_kind !== "native_subagent_progress" && record.origin !== "tool_execution_end") blocked(`native task ${id} terminal did not originate in its Root task channel`);
  const calls = (context.nativeEvidence.task_calls ?? []).filter((call) => call.items?.some((item) => item.name === id));
  if (calls.length !== 1 || !calls[0].toolCallId) blocked(`native task ${id} lacks a unique Root dispatch`);
  const call = calls[0];
  const assignments = call.items.filter((item) => item.name === id);
  if (assignments.length !== 1 || assignments[0].agent !== record.agent || record.agentSource !== "project") blocked(`native task ${id} role/source does not match its Root dispatch`);
  const parents = new Set([record.parentToolCallId, ...(context.nativeEvidence.subagent_frames ?? []).filter((frame) => frame.id === record.id).map((frame) => frame.parentToolCallId)].filter((value) => typeof value === "string" && value !== ""));
  if (parents.size !== 1 || !parents.has(call.toolCallId)) blocked(`native task ${id} terminal is not bound to its exact Root dispatch`);
  if (record.source_kind === "native_subagent_progress" && !(context.nativeEvidence.task_details ?? []).some((entry) => entry.origin === "tool_execution_end" && entry.parentToolCallId === call.toolCallId)) blocked(`native task ${id} progress lacks its successful owning Root TASK END`);
  return record;
}

function assertTaskWire(context) {
  if (context.nativeEvidence.task_calls.length === 0) {
    context.nativeEvidence.limitations.push("task tool call arguments were not exposed in tool_execution_start; required solutionSpace and forbidden-field assertions are unverified");
    blocked("native task invocation arguments were not exposed; cannot verify the actual required solutionSpace wire");
  }
  for (const call of context.nativeEvidence.task_calls) {
    if (call.hasModelField) assertion("native task call emitted a forbidden per-call/global model or structured field", { expectedRed: true, call });
    for (const item of call.items) {
      if (item.malformed || item.hasForbiddenField) assertion("native task item emitted a forbidden or malformed field", { expectedRed: true, item });
      if (!item.hasSolutionSpace) assertion("native task item omitted required solutionSpace", { expectedRed: true, item });
    }
  }
}

function observedServingModel(context, record) {
  const matches = context.nativeEvidence.serving_models.filter((entry) => typeof entry.task_id === "string" && entry.task_id.toLowerCase() === record.id.toLowerCase());
  const identities = new Map(matches.map((entry) => [`${entry.model.provider}/${entry.model.id}`, entry.model]));
  return identities.size === 1 ? [...identities.values()][0] : null;
}

function assertProfileRecords(context, fixture) {
  const records = [];
  const seenIds = new Set();
  let missingAgentSource = false;
  for (const [agent, name] of PROFILE_NAMES) {
    const observedTerminal = context.replayBatch && name === "ProfilePeerReviewer"
      ? {
        record: context.replayPeerPositiveRecord,
        source_kind: context.replayPeerPositiveRecord?.source_kind ?? "offline_captured_native_evidence_record",
        coverage_source: {
          role: "peer-reviewer",
          assignment: "PeerPositive",
          reason: "same configured project profile path; the separate genuine TDD peer probe supplies native role coverage",
        },
      }
      : requireObservedTerminalRecord(context, name);
    const record = observedTerminal.record;
    if (!observedTerminal.coverage_source) assertTerminalDispatch(context, name, record);
    if (seenIds.has(record.id.toLowerCase())) assertion("native profile dispatch reused a task id", { expectedRed: true, id: record.id });
    seenIds.add(record.id.toLowerCase());
    if (record.agent !== agent) assertion(`native task ${name} resolved a different agent type`, { expectedRed: true, expected: agent, actual: record.agent });
    if (record.agentSource === undefined || record.agentSource === null) {
      missingAgentSource = true;
      context.nativeEvidence.limitations.push(`${agent}: ${observedTerminal.source_kind} did not expose agentSource`);
    } else if (record.agentSource !== "project") {
      assertion(`${agent} was not discovered from the project overlay`, { expectedRed: true, agentSource: record.agentSource });
    }
    const servingModel = observedServingModel(context, record);
    const profile = {
      requested: { name: agent, model: null, effort: null },
      resolved: {
        agentSource: record.agentSource ?? null,
        model: record.resolvedModel ?? record.resolvedModelIdentity ?? null,
        effort: record.resolvedThinkingLevel ?? null,
      },
      observed: {
        terminal: record.exitCode === 0 ? "completed" : record.status ?? null,
        actual: servingModel,
        observation: servingModel ? "observed-serving-message-usage" : "unverified",
      },
      source: profileSourceEvidence(context, agent),
      terminal_source: observedTerminal.source_kind,
      task_result: record,
    };
    if (observedTerminal.coverage_source) {
      profile.coverage_source = observedTerminal.coverage_source;
      profile.assignment = observedTerminal.coverage_source.assignment;
    }
    const nativeStructured = observedTerminal.source_kind === "native_subagent_progress" || observedTerminal.coverage_source?.assignment === "PeerPositive"
      ? assembleNativeYield(record)
      : null;
    if (nativeStructured !== undefined && nativeStructured !== null) profile.native_yield = { source_kind: observedTerminal.source_kind, data: nativeStructured };
    const nativeStructuredProfile = observedTerminal.source_kind === "native_subagent_progress" || observedTerminal.coverage_source?.assignment === "PeerPositive";
    if (record.resolvedModel && (!record.resolvedModel.provider || !record.resolvedModel.id)) assertion(`${agent} exposed a resolved model without provider/id identity`, { expectedRed: true });
    if (record.resolvedModelIdentity && (!record.resolvedModelIdentity.provider || !record.resolvedModelIdentity.id)) assertion(`${agent} exposed an invalid resolved model identity`, { expectedRed: true });
    if (STRUCTURED_PROFILES.has(agent)) {
      if (nativeStructuredProfile) {
        const successfulYield = Array.isArray(record.yield) && record.yield.some((item) => item && item.status === "success");
        if (!successfulYield || !nativeStructured || typeof nativeStructured !== "object" || Array.isArray(nativeStructured)) {
          assertion(`${agent} structured:true profile did not expose a successful native progress yield object`, { expectedRed: true, source_kind: observedTerminal.source_kind });
        }
      } else if (!record.structuredOutput) assertion(`${agent} structured:true profile did not expose structuredOutput`, { expectedRed: true });
      else {
        const structured = record.structuredOutput;
        const validation = structured.validation ?? structured.status ?? structured.valid;
        const invalid = validation === false || validation === "invalid" || validation === "failed" || validation === "error";
        if (invalid) assertion(`${agent} structured output was rejected by native validation`, { expectedRed: true, validation });
      }
    }
    records.push(profile);
  }
  context.nativeEvidence.profiles = records;
  if (missingAgentSource) blocked("native terminal evidence did not expose agentSource for every profile; local discovery remains unverified", { limitation: "agentSource absent is not promoted to project by inference" });
  if (new Set(records.map((profile) => profile.requested.name)).size !== 12) assertion("native profile evidence did not contain exactly twelve distinct requested profiles", { expectedRed: true });
  if (fixture.revision.length !== 40) blocked("fixture revision is not a full Git revision");
}

function structuredData(record) {
  const data = record.structuredOutput?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? data : null;
}

function reviewText(record) {
  return typeof record.output_text === "string" ? record.output_text.trim() : "";
}

function consumeNativePeerResult(protocol, fixture, assignment, value) {
  if (typeof protocol?.validateReviewerResult !== "function") blocked("native peer structured policy requires the real validateReviewerResult consumer");
  const expected = {
    agent: assignment.agent,
    protocol_mode: "TDD_PEER_REVIEW",
    reviewed_revision: fixture.revision,
  };
  let checked;
  try {
    checked = protocol.validateReviewerResult(value, expected);
  } catch (error) {
    blocked("native peer structured consumer threw while validating the terminal wire", { error: safeNativeFailure(error?.message ?? error) });
  }
  return {
    checked,
    accepted: checked?.ok === true && ["APROVADO", "BLOQUEADO"].includes(checked.status) && checked.status !== "VALID",
    status: checked?.status ?? null,
    errors: Array.isArray(checked?.errors) ? checked.errors : [],
  };
}
function derivePeerConsumerFaultInjection(protocol, fixture, assignment, expectedStatus, data, record) {
  if (!data || typeof data !== "object" || Array.isArray(data)) blocked("consumer fault injection requires the actual structured PeerMalformed result");
  if (!Object.prototype.hasOwnProperty.call(data, "explanation")) blocked("consumer fault injection source did not expose the required explanation field");
  const originalWire = JSON.stringify(data);
  const mutated = { ...data };
  delete mutated.explanation;
  const mutatedWire = JSON.stringify(mutated);
  const consumer = consumeNativePeerResult(protocol, fixture, assignment, mutated);
  const expected = {
    agent: assignment.agent,
    protocol_mode: "TDD_PEER_REVIEW",
    reviewed_revision: fixture.revision,
  };
  if (consumer.accepted) assertion("real peer consumer accepted the derived dropped-required-field fault", {
    expectedRed: true,
    mutation: "drop-required-field",
    field: "explanation",
    expected,
  });
  return {
    source_kind: "derived-consumer-fault-injection",
    operation: "drop-required-field",
    field: "explanation",
    assignment_probe_label: expectedStatus,
    original_source: {
      payload_kind: "native_subagent_progress.yield-terminal-data",
      record_id: record.id,
      record_digest: record.digest ?? null,
      wire_sha256: sha256Text(originalWire),
      wire_bytes: Buffer.byteLength(originalWire, "utf8"),
    },
    mutated_wire: {
      sha256: sha256Text(mutatedWire),
      bytes: Buffer.byteLength(mutatedWire, "utf8"),
    },
    expected,
    consumer_validation: {
      kind: "real-validateReviewerResult-derived-fault",
      accepted: consumer.accepted,
      status: consumer.status,
      errors: consumer.errors,
    },
  };
}


function assertPeerCase(context, protocol, fixture, assignment, expectedStatus) {
  const taskTerminal = terminalRecords(context).filter((record) => record.id.toLowerCase() === assignment.id.toLowerCase() && hasTaskTerminalPayload(record));
  const nativeProgress = nativeProgressRecords(context, assignment.id);
  if (taskTerminal.length === 0 && nativeProgress.length > 0) {
    if (nativeProgress.length !== 1) blocked(`native task ${assignment.id} exposed duplicate native progress terminals`, {
      source_kind: "native_subagent_progress",
      ids: nativeProgress.map((record) => record.id),
      digests: nativeProgress.map((record) => record.digest),
    });
    const record = nativeProgress[0];
    assertTerminalDispatch(context, assignment.id, record);
    const nativeFailure = nativeProtocolFailure(record);
    if (nativeFailure) {
      const rejected = {
        id: assignment.id,
        expected: expectedStatus,
        mode: "native-terminal-protocol-failure",
        actual: {
          source_kind: record.source_kind,
          status: record.status,
          native_yield: record.yield ?? null,
          failure: nativeFailure,
        },
        consumer_validation: {
          kind: "native-subagent-progress-yield-validation",
          accepted: false,
          classification: nativeFailure.classification,
          classification_source: nativeFailure.classification_source,
        },
      };
      if (assignment.id === REVIEW_ASSIGNMENTS.peerMalformed.id && ["schema", "yield"].includes(nativeFailure.classification)) {
        rejected.consumer_validation.reason = "The native structured/yield consumer refused the intentionally malformed peer terminal.";
        context.nativeEvidence.peer_cases.push(rejected);
        return;
      }
      context.nativeEvidence.peer_cases.push(rejected);
      assertion(`${assignment.id} native TDD peer output failed in structured/yield mode before the required ${expectedStatus} verdict`, {
        expectedRed: true,
        native_failure: nativeFailure,
      });
    }
    observedSuccessfulTerminal(record, assignment.id, record.source_kind, true);
    const assembled = assembleNativeYield(record);
    const data = assembled && typeof assembled === "object" && !Array.isArray(assembled) ? assembled : null;
    const text = typeof assembled === "string" ? assembled.trim() : "";
    const consumer = consumeNativePeerResult(protocol, fixture, assignment, assembled);
    const caseEvidence = {
      id: assignment.id,
      expected: expectedStatus,
      actual: {
        source_kind: record.source_kind,
        status: record.status,
        exitCode: record.exitCode,
        native_yield: record.yield ?? null,
        assembled_yield_data: assembled ?? null,
      },
      consumer_validation: {
        kind: "real-validateReviewerResult-native-peer",
        accepted: assignment.id === REVIEW_ASSIGNMENTS.peerMalformed.id
          ? consumer.accepted
          : consumer.accepted && consumer.status === expectedStatus,
        status: consumer.status,
        expected_status: assignment.id === REVIEW_ASSIGNMENTS.peerMalformed.id ? null : expectedStatus,
        errors: consumer.errors,
        output_mode: data ? "structured" : text ? "legacy-text" : "unknown",
        textual_compatibility: data ? "not_proven_by_structured_mode" : "rejected_by_native_structured_policy",
      },
    };
    if (assignment.id === REVIEW_ASSIGNMENTS.peerMalformed.id) {
      if (consumer.accepted) {
        caseEvidence.mode = "producer-healed-valid-control";
        caseEvidence.status = consumer.status;
        caseEvidence.producer_outcome = {
          classification: "healed-valid-control",
          native_output_was_valid: true,
          note: "The native producer returned a valid TDD_PEER_REVIEW object; this is not a malformed-wire rejection.",
        };
        caseEvidence.consumer_fault_injection = derivePeerConsumerFaultInjection(protocol, fixture, assignment, expectedStatus, data, record);
      } else {
        caseEvidence.mode = data ? "native-structured-rejected-malformed-control" : "native-wire-rejected";
        caseEvidence.status = consumer.status;
        caseEvidence.producer_outcome = {
          classification: "malformed-output-rejected",
          native_output_was_valid: false,
        };
      }
      context.nativeEvidence.peer_cases.push(caseEvidence);
      return;
    }
    if (!consumer.accepted || consumer.status !== expectedStatus) {
      context.nativeEvidence.peer_cases.push(caseEvidence);
      assertion(`${assignment.id} native peer output was rejected by the real native structured consumer`, {
        expectedRed: true,
        expected_status: expectedStatus,
        observed_status: consumer.status,
        errors: consumer.errors,
        output_mode: caseEvidence.consumer_validation.output_mode,
      });
    }
    caseEvidence.mode = data ? "native-structured-TDD_PEER_REVIEW" : "native-wire-rejected";
    caseEvidence.status = consumer.status;
    context.nativeEvidence.peer_cases.push(caseEvidence);
    return;
  }
  if (taskTerminal.length !== 1) {
    const nativeTerminal = context.nativeEvidence.subagent_terminal.filter((entry) => {
      const ids = [entry.subagent_id, entry.id].filter((value) => typeof value === "string").map((value) => value.toLowerCase());
      return ids.includes(assignment.id.toLowerCase());
    });
    const nativeFailure = nativeTerminal.map(nativeProtocolFailure).find(Boolean);
    if (nativeFailure && assignment.id !== REVIEW_ASSIGNMENTS.peerMalformed.id) {
      context.nativeEvidence.peer_cases.push({
        id: assignment.id,
        expected: expectedStatus,
        mode: "native-terminal-protocol-failure",
        actual: { native_terminal: nativeTerminal },
        consumer_validation: {
          kind: "native-structured-yield-terminal",
          accepted: false,
          classification: nativeFailure.classification,
          classification_source: nativeFailure.classification_source,
          reason: "The native peer task exposed a real structured/yield terminal failure before a textual TDD verdict could be consumed.",
        },
      });
      assertion(`${assignment.id} native peer output failed in structured/yield mode before the required native ${expectedStatus} verdict`, {
        expectedRed: true,
        native_failure: nativeFailure,
      });
    }
  }
  const record = requireTerminalRecord(context, assignment.id);
  assertTerminalDispatch(context, assignment.id, record);
  const text = reviewText(record);
  const structured = structuredData(record);
  const caseEvidence = {
    id: assignment.id,
    expected: expectedStatus,
    actual: {
      text_prefix: text.slice(0, 80),
      output_sha256: record.output_sha256 ?? null,
      structured: record.structuredOutput ?? null,
      exitCode: record.exitCode ?? null,
    },
    consumer_validation: null,
  };
  const candidate = structured ?? (text !== "" ? text : null);
  if (assignment.id === REVIEW_ASSIGNMENTS.peerMalformed.id) {
    if (candidate === null) blocked("native peer malformed probe did not expose a terminal payload", { observedPrefix: text.slice(0, 80) });
    const consumer = consumeNativePeerResult(protocol, fixture, assignment, candidate);
    caseEvidence.mode = structured ? "malformed-structured" : "malformed-legacy-wire";
    caseEvidence.consumer_validation = {
      kind: "real-validateReviewerResult-native-peer",
      accepted: consumer.accepted,
      status: consumer.status,
      errors: consumer.errors,
      output_mode: structured ? "structured" : "legacy-text",
      textual_compatibility: "rejected_by_native_structured_policy",
    };
    if (consumer.accepted) assertion("malformed native peer output was accepted by the real native structured consumer", { expectedRed: true, id: assignment.id });
    context.nativeEvidence.peer_cases.push(caseEvidence);
    return;
  }
  if (candidate === null) {
    caseEvidence.mode = "missing-output";
    context.nativeEvidence.peer_cases.push(caseEvidence);
    assertion(`${assignment.id} did not return a native TDD_PEER_REVIEW verdict`, { expectedRed: true, observedPrefix: text.slice(0, 80) });
  }
  const consumer = consumeNativePeerResult(protocol, fixture, assignment, candidate);
  caseEvidence.mode = structured ? "structured-output" : "legacy-wire-rejected";
  caseEvidence.status = consumer.status;
  caseEvidence.consumer_validation = {
    kind: "real-validateReviewerResult-native-peer",
    accepted: consumer.accepted && consumer.status === expectedStatus,
    status: consumer.status,
    errors: consumer.errors,
    output_mode: structured ? "structured" : "legacy-text",
    textual_compatibility: structured ? "not_proven_by_structured_mode" : "rejected_by_native_structured_policy",
    reason: structured
      ? "The explicit native structured peer policy accepts the frontmatter-shaped APROVADO/BLOQUEADO object without converting it to VALID."
      : "Legacy textual output is rejected after the explicit native structured clean cutover.",
  };
  context.nativeEvidence.peer_cases.push(caseEvidence);
  if (!caseEvidence.consumer_validation.accepted) {
    assertion(`${assignment.id} native peer result did not satisfy the real native structured ${expectedStatus} consumer`, {
      expectedRed: true,
      observed_status: consumer.status,
      errors: consumer.errors,
      output_mode: caseEvidence.consumer_validation.output_mode,
    });
  }
}
function assertDeepCases(context, protocol, fixture) {
  const results = [];
  for (const assignment of [REVIEW_ASSIGNMENTS.deepOne, REVIEW_ASSIGNMENTS.deepTwo]) {
    const observedTerminal = requireObservedTerminalRecord(context, assignment.id);
    assertTerminalDispatch(context, assignment.id, observedTerminal.record);
    const record = observedTerminal.record;
    const data = observedTerminal.source_kind === "native_subagent_progress"
      ? assembleNativeYield(record, DEEP_REVIEW_YIELD_SHAPES)
      : structuredData(record);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      blocked(`${assignment.id} did not expose a structured terminal result`, {
        source_kind: observedTerminal.source_kind,
        output_sha256: record.output_sha256 ?? null,
        native_yield: record.yield ?? null,
      });
    }
    const checked = protocol.validateReviewerResult(data, {
      agent: "deep-reviewer",
      protocol_mode: "DEEP_REVIEW",
      reviewed_revision: fixture.revision,
    });
    const evidence = {
      id: assignment.id,
      source_kind: observedTerminal.source_kind,
      reviewed_revision: fixture.revision,
      result: data,
      native_yield: observedTerminal.source_kind === "native_subagent_progress" ? record.yield ?? null : undefined,
      validation: checked.ok ? { ok: true } : { ok: false, errors: sanitizeValue(checked.errors) },
      output_sha256: record.output_sha256 ?? null,
    };
    context.nativeEvidence.deep_cases.push(evidence);
    if (!checked.ok) assertion(`${assignment.id} structured deep-review result was rejected by the actual protocol consumer`, { expectedRed: true, errors: sanitizeValue(checked.errors) });
    results.push({ id: record.id, result: checked.value });
  }
  const assignments = [REVIEW_ASSIGNMENTS.deepOne, REVIEW_ASSIGNMENTS.deepTwo].map(({ id, agent, files }) => ({ id, agent, files }));
  const aggregate = protocol.aggregateReviewInstances(results, fixture.revision, assignments);
  context.nativeEvidence.deep_aggregate = aggregate.ok
    ? { ok: true, value: aggregate.value }
    : { ok: false, errors: sanitizeValue(aggregate.errors) };
  if (!aggregate.ok) assertion("native deep-review instance results did not aggregate from real IDs and disjoint assignments", { expectedRed: true, errors: sanitizeValue(aggregate.errors) });
  if (aggregate.value.status !== "BLOCKED") assertion("native deep-review aggregate failed to retain the genuinely wrong consumer as BLOCKED", { expectedRed: true, status: aggregate.value.status, findings: aggregate.value.findings });
  context.nativeEvidence.pending_requirements.push({
    id: "NATIVE-06.fallback",
    status: "PENDING",
    reason: "This complete probe exercises native deep-review instances but does not authorize or infer a peer-reviewer fallback round.",
  });
}

function assertRetryAndFallbackEvidence(context) {
  const records = [...terminalRecords(context), ...context.nativeEvidence.native_progress_terminal];
  const retryRecords = records.filter((record) => record.retryFailure !== undefined || record.retry_failure !== undefined);
  const fallbackFieldRecords = records.filter((record) => record.resolvedModelIsFallback !== undefined);
  const fallbackRecords = fallbackFieldRecords.filter((record) => record.resolvedModelIsFallback === true);
  context.nativeEvidence.retry = {
    observed: retryRecords.length > 0,
    records: retryRecords.map((record) => ({ id: record.id, retryFailure: record.retryFailure ?? record.retry_failure ?? null })),
    limitation: retryRecords.length === 0 ? "No retryFailure field was exposed by terminal evidence; no retry behavior was inferred." : null,
  };
  context.nativeEvidence.fallback = {
    observed: fallbackRecords.length > 0,
    field_exposed: fallbackFieldRecords.length > 0,
    records: fallbackFieldRecords.map((record) => ({ id: record.id, resolvedModelIsFallback: record.resolvedModelIsFallback, resolvedModel: record.resolvedModel ?? null })),
    limitation: fallbackFieldRecords.length === 0 ? "No resolvedModelIsFallback field was exposed; native fallback was not inferred." : null,
  };
  for (const record of retryRecords) {
    if (record.retryFailure && typeof record.retryFailure === "object" && record.retryFailure.attempts !== undefined && record.retryFailure.attempts > 3) {
      assertion("native task retry exceeded the cap of three attempts", { expectedRed: true, id: record.id });
    }
  }
  if (retryRecords.length === 0) {
    context.nativeEvidence.pending_requirements.push({
      id: "NATIVE-09.retry",
      status: "PENDING",
      reason: "No native retry terminal was observed; authentication/setup failures are not retried or promoted to technical retry.",
    });
  }
  if (fallbackRecords.length === 0) {
    context.nativeEvidence.pending_requirements.push({
      id: "NATIVE-09.fallback",
      status: "PENDING",
      reason: "No native model-fallback terminal was observed in this complete profile/review probe.",
    });
  }
}

async function loadProtocol(packageInfo) {
  const entry = packageInfo.entries.find((candidate) => candidate.kind === "skill" && candidate.sourceRelativePath === "deep-review/lib/protocol.mjs");
  if (!entry) blocked("frozen package did not contain the actual deep-review/lib/protocol.mjs consumer");
  const modulePath = entry.packagePath;
  ensureRegularFile(modulePath, "frozen deep-review protocol consumer");
  const api = await import(pathToFileURL(modulePath).href);
  const signatures = {
    validateReviewerResult: typeof api.validateReviewerResult === "function" ? api.validateReviewerResult.length : null,
    aggregateReviewInstances: typeof api.aggregateReviewInstances === "function" ? api.aggregateReviewInstances.length : null,
  };
  if (signatures.validateReviewerResult !== 2 || signatures.aggregateReviewInstances !== 3) {
    blocked("frozen deep-review protocol public signatures did not match the actual deep-review/lib/protocol.mjs consumer", { signatures });
  }
  return {
    api,
    evidence: {
      source_relative_path: entry.sourceRelativePath,
      frozen_path: entry.destinationRelative,
      sha256: entry.packageSha256,
      signatures,
    },
  };
}

function recordPreservation(context, sourceEntries, beforeSource, binaryBefore) {
  const result = { sourceChanged: false, binaryChanged: false };
  try {
    const sourceAfter = captureSourceHashes(context.source, sourceEntries, "source after");
    context.nativeEvidence.source_after = sourceAfter;
    context.nativeEvidence.source_after_scope = "exactly twelve installer-mapped agent profile files plus deep-review/lib/protocol.mjs; not a whole-repository immutability claim; other live skill files may have independent writers";
    result.sourceChanged = sourceAfter.some((entry, index) => entry.sha256 !== beforeSource[index].sha256 || entry.bytes !== beforeSource[index].bytes);
  } catch (error) {
    context.nativeEvidence.source_after_error = opaqueError(error?.message ?? error);
  }
  try {
    const binaryAfterBytes = readFileSync(context.omp);
    const binaryAfter = { sha256: sha256Bytes(binaryAfterBytes), bytes: binaryAfterBytes.byteLength };
    context.nativeEvidence.binary_after = binaryAfter;
    result.binaryChanged = binaryAfter.sha256 !== binaryBefore.sha256 || binaryAfter.bytes !== binaryBefore.bytes;
  } catch (error) {
    context.nativeEvidence.binary_after_error = opaqueError(error?.message ?? error);
  }
  return result;
}

function mergeSessionEvidence(context, evidence) {
  const native = context.nativeEvidence;
  native.session = evidence;
  native.session_runs.push(evidence);
  const appendUnique = (target, entries, key) => {
    for (const entry of entries) {
      if (!target.some((existing) => existing[key] === entry[key])) target.push(entry);
    }
  };
  appendUnique(native.task_details, evidence.task_details, "digest");
  native.task_calls.push(...evidence.task_calls);
  native.subagent_frames.push(...evidence.subagent_frames);
  appendUnique(native.subagent_terminal, evidence.subagent_terminal, "digest");
  appendUnique(native.native_progress_terminal, evidence.native_progress_terminal, "digest");
  if (evidence.subagent_registry_shape) native.subagent_registry_shape = evidence.subagent_registry_shape;
  if (evidence.subagent_registry_error) native.subagent_registry_error = evidence.subagent_registry_error;
  appendUnique(native.serving_models, evidence.serving_models, "digest");
  appendUnique(native.subagent_registry, evidence.subagent_registry, "id");
  for (const entry of evidence.subagent_messages) {
    const key = `${entry.subagent_id ?? ""}:${entry.session_file ?? ""}:${entry.from_byte ?? ""}:${entry.next_byte ?? ""}`;
    if (!native.subagent_messages.some((existing) => `${existing.subagent_id ?? ""}:${existing.session_file ?? ""}:${existing.from_byte ?? ""}:${existing.next_byte ?? ""}` === key)) native.subagent_messages.push(entry);
  }
}

async function runNativePrompt(context, fixture, label, prompt) {
  const requestId = randomUUID();
  const runId = randomUUID();
  if (!UUID_V4.test(requestId) || !UUID_V4.test(runId)) blocked("driver generated a non-v4 correlation identity");
  const session = new RpcSession({
    omp: context.omp,
    cwd: fixture.worktree,
    env: context.ompEnv,
    label,
    requestId,
    runId,
    timeoutMs: context.timeoutMs,
  });
  let pendingError = null;
  try {
    await session.execute(prompt);
    await session.close();
  } catch (error) {
    try {
      await session.abort();
    } catch (abortError) {
      session.evidence.abort_error = opaqueError(abortError?.message ?? abortError);
    }
    pendingError = error;
  }
  mergeSessionEvidence(context, session.evidence);
  if (pendingError) throw pendingError;
  return { requestId, runId };
}

async function runRed(context, sourceEntries, protocol) {
  if (context.phase === "green" && Boolean(context.replayFixture) !== Boolean(context.replayPeerEvidence)) {
    blocked("GREEN replay requires both the matching existing fixture and captured PeerPositive evidence");
  }
  if (context.phase === "green" && context.replayBatchEvidence && (!context.replayFixture || !context.replayPeerEvidence)) {
    blocked("GREEN batch replay requires the matching fixture and separately captured PeerPositive evidence");
  }
  const phaseLabel = context.phase.toUpperCase();
  const fixture = context.replayFixture
    ? loadExistingReviewFixture(context.replayFixture, context.packageInfo, context.runRoot)
    : createReviewFixture(join(context.runRoot, "review-fixture"), sourceEntries, context.runRoot);
  context.fixture = fixture;
  context.nativeEvidence.fixture_input = {
    spec: "specs/specs005-omp-compatible-release/spec.md",
    plan: "specs/specs005-omp-compatible-release/plan.md",
    tasks: "specs/specs005-omp-compatible-release/tasks.md",
    interface_contract: "specs/specs005-omp-compatible-release/contracts/interface-contract.md",
    implemented_by: "fixture-author",
    reviewed_by: "peer-reviewer",
    local_revision: fixture.revision,
    baseline_revision: fixture.baselineRevision,
    full_diff_sha256: fixture.diffEvidence.sha256,
    full_diff_bytes: fixture.diffEvidence.bytes,
    full_diff: fixture.diffEvidence.content,
    criteria_to_tests: {
      "AC-FIX-001": ["test/checkout-good.test.mjs::checkout applies the contract discount"],
      "AC-FIX-002": ["test/checkout-good.test.mjs::checkout applies the contract discount"],
    },
    replayed_fixture: fixture.replayed === true,
    replay_package: fixture.replayPackage ?? null,
  };
  const overlay = fixture.overlay;
  const preservedSourceEntries = immutableProbeSourceEntries(sourceEntries);
  const beforeSource = captureSourceHashes(context.source, preservedSourceEntries, "source before immutable T009A/B scope");
  const binaryBeforeBytes = readFileSync(context.omp);
  const binaryBefore = { sha256: sha256Bytes(binaryBeforeBytes), bytes: binaryBeforeBytes.byteLength };
  context.nativeEvidence.binary_before = binaryBefore;
  context.nativeEvidence.source_before = beforeSource;
  context.nativeEvidence.source_before_scope = "exactly twelve installer-mapped agent profile files plus deep-review/lib/protocol.mjs; all other live skill files are outside the preservation comparison";
  const replayRecord = context.replayPeerEvidence ? loadOfflinePeerProgress(context.replayPeerEvidence, fixture) : null;
  const replayBatch = context.replayBatchEvidence
    ? loadOfflineBatchEvidence(context.replayBatchEvidence, fixture, context.packageInfo, replayRecord)
    : null;
  context.replayPeerPositiveRecord = replayRecord;
  context.replayBatch = replayBatch;
  if (replayRecord) {
    const digest = sha256Text(JSON.stringify(replayRecord));
    context.nativeEvidence.native_progress_terminal.push({ digest, ...replayRecord });
    context.nativeEvidence.offline_replay = {
      source_kind: replayRecord.source_kind,
      evidence_path: replayRecord.evidence_path,
      evidence_sha256: replayRecord.evidence_sha256,
      evidence_bytes: replayRecord.evidence_bytes,
      captured_run_id: replayRecord.captured_run_id,
      fixture_revision: fixture.revision,
      assignment_sha256: replayRecord.progress?.assignment_sha256 ?? null,
      caller_task_sha256: replayRecord.caller_task_sha256 ?? null,
      task_sha256: replayRecord.progress?.task_sha256 ?? null,
    };
  }
  if (replayBatch) {
    context.nativeEvidence.task_calls = replayBatch.task_calls;
    for (const record of replayBatch.records) context.nativeEvidence.native_progress_terminal.push(record);
    context.nativeEvidence.offline_batch_replay = {
      source_kind: replayBatch.source_kind,
      replay_label: replayBatch.replay_label,
      evaluation_only: true,
      captured_run_id: replayBatch.captured_run_id,
      evidence_path: replayBatch.evidence_path,
      evidence_sha256: replayBatch.evidence_sha256,
      evidence_bytes: replayBatch.evidence_bytes,
      source_scope: replayBatch.source_scope,
      caller_task_hashes: replayBatch.caller_task_hashes,
      aborted_attempt: replayBatch.aborted_attempt,
      captured_binary: replayBatch.captured_binary,
    };
  }
  const runIdentities = [];
  let pendingError = null;
  try {
    if (replayRecord) {
      runIdentities.push({ requestId: null, runId: replayRecord.captured_run_id, replayed: true });
      assertPeerCase(context, protocol, fixture, REVIEW_ASSIGNMENTS.peerPositive, "APROVADO");
    } else {
      runIdentities.push(await runNativePrompt(context, fixture, `${phaseLabel}-profile-peer-positive`, buildPeerPositivePrompt({ fixture })));
      assertTaskWire(context);
      assertPeerCase(context, protocol, fixture, REVIEW_ASSIGNMENTS.peerPositive, "APROVADO");
    }
    if (replayBatch) {
      runIdentities.push({ requestId: null, runId: replayBatch.captured_run_id, replayed: true, source_kind: replayBatch.source_kind });
      assertTaskWire(context);
    } else {
      runIdentities.push(await runNativePrompt(context, fixture, `${phaseLabel}-profile-batch`, buildPrompt({ fixture, profiles: PROFILE_NAMES })));
      assertTaskWire(context);
    }
    assertProfileRecords(context, fixture);
    assertDeepCases(context, protocol, fixture);
    assertPeerCase(context, protocol, fixture, REVIEW_ASSIGNMENTS.peerNegative, "BLOQUEADO");
    assertPeerCase(context, protocol, fixture, REVIEW_ASSIGNMENTS.peerMalformed, "MALFORMED");
    assertRetryAndFallbackEvidence(context);
  } catch (error) {
    pendingError = error;
  }
  const preservation = recordPreservation(context, preservedSourceEntries, beforeSource, binaryBefore);
  if (context.nativeEvidence.source_after_error) blocked("T009A/B immutable source preservation could not be captured after native probe", { error: context.nativeEvidence.source_after_error });
  if (context.nativeEvidence.binary_after_error) blocked("OMP binary preservation could not be captured after native probe", { error: context.nativeEvidence.binary_after_error });
  assertOverlayUnchanged(overlay.copies, `${phaseLabel}-profile`, overlay.destinationRoot);
  assertWorktreeReadOnly(fixture.worktree, fixture.env, `${phaseLabel}-profile`, overlay.copies);
  if (pendingError) throw pendingError;
  if (preservation.sourceChanged) assertion("T009A/B immutable source-scope bytes changed during native profile probe", { expectedRed: false });
  if (preservation.binaryChanged) assertion("OMP binary changed during native profile probe", { expectedRed: false });
  context.nativeEvidence.assertions.push({ id: "AC-012.profile-discovery", status: "OBSERVED", detail: context.replayBatch
    ? "Offline NativeReplay reused eleven completed generic profile terminals and the separate genuine PeerPositive native role assignment for the configured peer-reviewer path; the original ProfilePeerReviewer attempt remains explicitly preserved as aborted/schema."
    : "Twelve named profile tasks returned terminal evidence from TaskToolDetails or linked native_subagent_progress; project source and resolved metadata are recorded separately from actual serving identity, which remains null/unverified unless native assistant usage.model is exposed." });
  context.nativeEvidence.assertions.push({ id: "AC-013.review-wire", status: "OBSERVED", detail: "Peer/deep-review raw terminal modes, actual consumer validation, and real instance IDs are recorded; native progress yields remain explicitly source-tagged and are never relabeled as TaskToolDetails." });
  return { status: "PASS", pending_requirements: context.nativeEvidence.pending_requirements, request_ids: runIdentities.map(({ requestId }) => requestId), run_ids: runIdentities.map(({ runId }) => runId), revision: fixture.revision };
}

function writeEvidence(context) {
  const target = join(context.runRoot, "evidence.json");
  const temporary = join(context.runRoot, `.evidence-${randomUUID()}.tmp`);
  const output = {
    phase: context.phase,
    run_id: context.runId,
    started_at: context.startedAt,
    finished_at: now(),
    source_root: context.evidence.sourceRoot,
    source_capture: context.evidence.source_capture,
    source: context.evidence.source,
    fixture: context.fixture ? {
      root: context.fixture.worktree,
      baseline_revision: context.fixture.baselineRevision,
      revision: context.fixture.revision,
      diff: context.fixture.diffEvidence,
      replay_package: context.fixture.replayPackage ?? null,
      overlay_root: context.fixture.overlay.destinationRoot,
    } : null,
    native: context.nativeEvidence,
    failure: context.evidence.failure,
  };
  writeFileSync(temporary, `${JSON.stringify(sanitizeValue(output), null, 2)}\n`, { encoding: "utf8" });
  renameSync(temporary, target);
  return target;
}

function validateInputs(options) {
  const source = existingDirectory("--source", options.source);
  const omp = existingFile("--omp", options.omp);
  const lab = existingDirectory("--lab", options.lab);
  const replayPeerEvidence = options.replayPeerEvidence ? existingFile("--replay-peer-evidence", options.replayPeerEvidence) : null;
  const replayFixture = options.replayFixture ? existingDirectory("--replay-fixture", options.replayFixture) : null;
  const replayBatchEvidence = options.replayBatchEvidence ? existingFile("--replay-batch-evidence", options.replayBatchEvidence) : null;
  const homeCandidate = process.env.USERPROFILE || process.env.HOME;
  if (!homeCandidate) blocked("normal HOME/USERPROFILE is required for existing OMP authentication");
  const home = existingDirectory("normal HOME", homeCandidate);
  if (samePath(lab, source) || isSameOrDescendant(lab, source) || isSameOrDescendant(source, lab)) blocked("--lab may not equal, contain, or be contained by --source");
  if (samePath(lab, home) || isSameOrDescendant(lab, home)) blocked("--lab may not equal or contain the real HOME");
  if (replayFixture && !isSameOrDescendant(lab, replayFixture) && !replayBatchEvidence) blocked("--replay-fixture must be inside --lab unless this is the strict offline batch replay");
  if (replayFixture && (samePath(replayFixture, source) || isSameOrDescendant(source, replayFixture) || isSameOrDescendant(replayFixture, source))) blocked("--replay-fixture may not overlap the live source");
  if (replayPeerEvidence && (samePath(replayPeerEvidence, source) || isSameOrDescendant(replayPeerEvidence, source))) blocked("--replay-peer-evidence may not point into source");
  if (replayBatchEvidence && (samePath(replayBatchEvidence, source) || isSameOrDescendant(replayBatchEvidence, source))) blocked("--replay-batch-evidence may not point into source");
  if (replayBatchEvidence && replayPeerEvidence && samePath(replayBatchEvidence, replayPeerEvidence)) blocked("--replay-batch-evidence and --replay-peer-evidence must be distinct immutable captures");
  if (replayPeerEvidence && !replayFixture) blocked("--replay-peer-evidence requires --replay-fixture so revision and overlay bytes can be revalidated");
  if (replayBatchEvidence && (!replayFixture || !replayPeerEvidence)) blocked("--replay-batch-evidence requires both --replay-fixture and --replay-peer-evidence");
  if (replayBatchEvidence && options.phase !== "green") blocked("--replay-batch-evidence is an offline GREEN evaluation artifact");
  return { source, omp, lab, home, replayPeerEvidence, replayFixture, replayBatchEvidence };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const paths = validateInputs(options);
  const runId = randomUUID();
  if (!UUID_V4.test(runId)) blocked("driver run_id is not UUID-v4");
  const runRoot = join(paths.lab, `ship-native-profile-${runId}`);
  assertInside(paths.lab, runRoot, "run root");
  assertNewDirectory(runRoot, "run root");
  const sourceEntries = sourceManifest(paths.source);
  const packageInfo = freezePackage(runRoot, sourceEntries);
  const agentEntries = packageInfo.entries.filter((entry) => entry.kind === "agent");
  const observedSkillNames = new Set(packageInfo.entries.filter((entry) => entry.kind === "skill").map((entry) => entry.sourceRelativePath.split("/")[0]));
  const observedAgentPaths = new Set(agentEntries.map((entry) => entry.sourceRelativePath));
  const expectedAgentPaths = new Set(INSTALLER_AGENTS.map(([skill, subdir, file]) => `${skill}/${subdir}/${file}`));
  if (observedSkillNames.size !== INSTALLER_SKILLS.length || INSTALLER_SKILLS.some((skill) => !observedSkillNames.has(skill)) || agentEntries.length !== expectedAgentPaths.size || [...expectedAgentPaths].some((path) => !observedAgentPaths.has(path))) {
    blocked("frozen package inventory did not match the installer-mapped ten skills and twelve agent paths", { skills: [...observedSkillNames].sort(), agents: [...observedAgentPaths].sort() });
  }
  const context = {
    ...options,
    ...paths,
    runRoot,
    runId,
    phase: options.phase,
    startedAt: now(),
    ompEnv: createOmpEnvironment(),
    packageInfo,
    nativeEvidence: {
      omp: {
        source_tag: "https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6",
        expected_version: "18.18.6",
        binary_path: paths.omp,
        version_observation: "pinned executable supplied by the authorized procedure; binary hash is observed before/after",
      },
      source_before: null,
      source_before_scope: null,
      source_after: null,
      source_after_scope: null,
      binary_before: null,
      binary_after: null,
      session: null,
      session_runs: [],
      protocol_consumer: null,
      task_details: [],
      task_calls: [],
      subagent_frames: [],
      subagent_terminal: [],
      native_progress_terminal: [],
      offline_replay: null,
      offline_batch_replay: null,
      subagent_registry: [],
      subagent_registry_shape: null,
      subagent_registry_error: null,
      subagent_messages: [],
      serving_models: [],
      profiles: [],
      deep_cases: [],
      deep_aggregate: null,
      peer_cases: [],
      tdd_peer_consumer: {
        source: "local://ship-peer-wire-approval.json",
        mode: "TDD_PEER_REVIEW",
        contract: "native structured object status APROVADO or BLOQUEADO; VALID is reserved for deep-review modes",
        consumer: "deep-review/lib/protocol.mjs::validateReviewerResult",
        legacy_text: "rejected",
        normalized_deep_validator_used_for_tdd: false,
      },
      retry: null,
      fallback: null,
      limitations: [],
      pending_requirements: [],
      assertions: [],
    },
    evidence: {
      sourceRoot: paths.source,
      source_capture: {
        skills: INSTALLER_SKILLS,
        agent_profiles: INSTALLER_AGENTS.map(([skill, subdir, file]) => `${skill}/${subdir}/${file}`),
        files: packageInfo.entries.length,
        manifest_sha256: packageInfo.manifestSha256,
        manifest_digest: packageInfo.manifestDigest,
        package_root: packageInfo.root,
        atomic: false,
        note: "Per-file installer-mapped bytes were captured into one frozen lab package; this is not a global source revision claim.",
        live_preservation_scope: "Only twelve installer-mapped agent profile files plus deep-review/lib/protocol.mjs are compared before/after; other live skill files may have independent writers.",
      },
      source: packageInfo.entries.map((entry) => ({
        kind: entry.kind,
        path: entry.sourceRelativePath,
        destination: entry.destinationRelative,
        sha256: entry.sourceSha256,
        package_sha256: entry.packageSha256,
        bytes: entry.bytes,
      })),
      failure: null,
    },
  };
  try {
    const protocolConsumer = await loadProtocol(packageInfo);
    context.nativeEvidence.protocol_consumer = protocolConsumer.evidence;
    const outcome = await runRed(context, packageInfo.entries, protocolConsumer.api);
    assertFrozenPackageUnchanged(packageInfo, "native profile probe");
    const evidencePath = writeEvidence(context);
    const status = context.phase === "red" && outcome.status === "PASS" ? "FALHOU_NO_RED" : outcome.status;
    process.stdout.write(`${JSON.stringify({ status, phase: options.phase, run_id: runId, evidence: evidencePath, outcome })}\n`);
    process.exitCode = context.phase === "red" ? 1 : 0;
  } catch (error) {
    context.evidence.failure = {
      kind: error.kind ?? "BLOCKED",
      detail: error.kind === "ASSERTION" || error.kind === "USAGE" ? scrubText(error.message) : safeNativeFailure(error?.message ?? error),
      expectedRed: error.expectedRed === true,
      error: safeNativeFailure(error?.message ?? error),
    };
    try { assertFrozenPackageUnchanged(packageInfo, "native profile probe after failure"); } catch (preservationError) {
      context.evidence.failure.preservation = { kind: preservationError.kind ?? "BLOCKED", detail: scrubText(preservationError.message) };
    }
    const evidencePath = writeEvidence(context);
    let status = "BLOCKED";
    let exitCode = 2;
    if (error.kind === "ASSERTION") {
      status = context.phase === "red" && error.expectedRed === true ? "RED_VALID" : "FAIL";
      exitCode = 1;
    } else if (error.kind === "USAGE") {
      status = "USAGE";
      exitCode = 64;
    }
    process.stdout.write(`${JSON.stringify({ status, phase: options.phase, run_id: runId, evidence: evidencePath, detail: context.evidence.failure.detail })}\n`);
    process.exitCode = exitCode;
  }
}

await main().catch((error) => {
  const kind = error?.kind ?? "BLOCKED";
  const status = kind === "USAGE" ? "USAGE" : "BLOCKED";
  process.stdout.write(`${JSON.stringify({ status, detail: kind === "USAGE" ? scrubText(error.message) : opaqueError(error?.message ?? error) })}\n`);
  process.exitCode = kind === "USAGE" ? 64 : 2;
});
