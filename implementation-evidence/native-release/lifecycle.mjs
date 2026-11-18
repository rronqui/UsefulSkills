#!/usr/bin/env node
// Bounded NATIVE-10 lifecycle probe for specs005 / contract 0.6.0.
//
// Development-only evidence driver, not installed skill runtime. It creates
// disposable local and private-Git route projects below --lab, copies the
// exact installer catalog (ten skills and twelve profiles) into each .omp
// overlay, and starts the pinned OMP executable through its real RPC
// transport only when --native is supplied. The root prompt and every
// profile are confined to read-only inspection except for explicit bounded
// writes in disposable projects. No source/Spec Kit change, HOME installation,
// global settings/model override, credential copy, SDK patch, host service,
// GitHub publication, remote Git, release or deploy is performed. Native mode
// uses only the approved existing SDK auth/HOME and provider-transport TCB.
//
// The library/fixture section imports the actual UsefulSkills consumers from
// --source (quality, state, execution, ship and retro) and records their
// returned envelopes. It never turns a fixture result or narrative into a
// native result. Native results are accepted only from observed task/tool
// terminal envelopes and the exact typed-yield decoder used by the current
// native probes.

import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";
import { validateReviewerResult } from "../../deep-review/lib/protocol.mjs";
import { buildPeerTask, isAuthoritativeTaskRecord, taskRecordSucceeded } from "./technical-retry-scenario.mjs";

const MAX_PHYSICAL_FRAME_BYTES = 1024 * 1024;
const MAX_REASSEMBLED_FRAME_BYTES = 64 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const MAX_CAPTURE_SAFE_STRING_BYTES = 4096;
const MAX_PENDING_OBSERVATIONS = 256;
const DEFAULT_TIMEOUT_MS = 300_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const SHA40 = /^[a-f0-9]{40}$/i;
const decoder = new TextDecoder("utf-8", { fatal: true });
const TERMINAL_STATUSES = new Set(["completed", "complete", "success", "succeeded", "failed", "error", "aborted", "canceled", "cancelled", "blocked"]);
const LIFECYCLE_STATUSES = new Set(["started", "completed", "failed", "aborted"]);
const FAILURE_STATUSES = new Set(["failed", "error", "aborted", "cancelled", "canceled", "blocked", "fail"]);
const RPC_EVENTS = Object.freeze(["message_end", "tool_execution_start", "tool_execution_update", "tool_stream_update", "tool_execution_end", "agent_end", "subagent_lifecycle", "subagent_progress", "subagent_event"]);
const WAIT_JOB_FIELDS = new Set(["id", "type", "status", "label", "durationMs", "intent", "settledAtMs", "exitCode", "resolvedModel", "resolvedModelIdentity", "resolvedThinkingLevel", "advisor", "completionPercent", "stage", "requests", "cost", "contextTokens", "contextWindow", "widget", "resultText", "errorText", "meta", "structured", "agentUrlId", "agentOutputPublished"]);
const WAIT_TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const WAIT_UPDATE_STATUSES = new Set(["running", "completed"]);
const WAIT_END_STATUSES = new Set(["running", "completed", "failed", "cancelled"]);
const FORBIDDEN_TASK_KEYS = new Set([
  "model", "modelOverride", "model_override", "thinkingLevel", "thinking_level", "structured", "task.structured", "task_structured",
  "outputSchema", "output_schema", "schemaMode", "schema_mode", "isolated", "effort", "tools", "settings", "globalSettings",
  "global_settings", "model_route", "alias", "config", "provider", "modelRoute", "aliases",
]);
const FORBIDDEN_TOOL = /(?:powershell|cmd(?:\.exe)?|ssh|host|write|edit|apply[_-]?patch|install|publish|deploy|service|git|curl|fetch|http|network|web|browser|get[_-]?subagents|settings|config|login|auth)/i;
const ROOT_ALLOWED_TOOL = /^(?:read|grep|glob|wait|todo|task)(?:$|[_.:])/i;
const SUBAGENT_READ_TOOL = /^(?:read|grep|glob|wait|todo|lsp|ast[_-]?grep)(?:$|[_.:])/i;
const READ_PATH_SELECTOR = /:(?:raw|img|conflicts|L?-?\d+(?:(?:[-+]|\.\.)L?\d*)?)(?:(?::|,:?)[ \t]*(?:raw|img|conflicts|L?-?\d+(?:(?:[-+]|\.\.)L?\d*)?))*$/i;
const TOOLING_COMMAND = "node .omp/state/native-tooling/lifecycle-check.mjs";
const RETRY_COMMAND = "node app/.omp/state/native-tooling/retry-check.mjs";
const NATIVE_RETRO_ARTIFACT = ".omp/state/native-observation/retro-decision.json";
const NATIVE10_DOC_HANDOFF = ".omp/state/native-observation/native10-doc-handoff.md";
const NATIVE_RETRO_ARTIFACT_SCHEMA = 1;
const TECHNICAL_RETRY_ASSIGNMENT_ID = "NATIVE09-technical-retry";
const EXTERNAL_PLAN_TIMEOUT_MS = 30_000;
const EXTERNAL_PLAN_REPORT = ".omp/state/quality.json";
const EXTERNAL_PLAN_CONTEXT = ".omp/state/quality-context.json";
const EXTERNAL_PLAN_STEPS = Object.freeze(["issue", "branch", "commit", "push", "pull_request", "ci", "release"]);
const NATIVE10_ASSIGNMENTS = Object.freeze([
  ["requirements-reader", "Native10RequirementsReader"],
  ["architect", "Native10Architect"],
  ["spec-kit-author", "Native10SpecKitAuthor"],
  ["deep-reviewer", "Native10DeepReviewer"],
  ["peer-reviewer", "Native10PeerReviewer"],
  ["validator", "Native10Validator"],
]);
const native10AssignmentCache = new WeakMap();

const PROFILE_NAMES = Object.freeze([
  ["requirements-reader", "Native10RequirementsReader"],
  ["architect", "Native10Architect"],
  ["host-operator", "Native10HostOperator"],
  ["deep-reviewer", "Native10DeepReviewer"],
  ["spec-kit-author", "Native10SpecKitAuthor"],
  ["test-author", "Native10TestAuthor"],
  ["backend-developer", "Native10BackendDeveloper"],
  ["frontend-developer", "Native10FrontendDeveloper"],
  ["refactorer", "Native10Refactorer"],
  ["peer-reviewer", "Native10PeerReviewer"],
  ["validator", "Native10ValidatorFault"],
  ["integrator", "Native10Integrator"],
]);
const SKILLS = Object.freeze([
  "alignment", "bug-diagnosis", "conflict-resolution", "deep-review", "release-bootstrap",
  "ship", "tdd-orchestrator", "architecture", "secure-linux-web-hosting", "retro",
]);
const AGENTS = Object.freeze([
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
]);
const CONSUMER_PATHS = Object.freeze([
  "tdd-orchestrator/lib/quality.mjs",
  "tdd-orchestrator/lib/state.mjs",
  "tdd-orchestrator/lib/execution.mjs",
  "ship/bin/lib.mjs",
  "retro/lib/control.mjs",
  "deep-review/lib/protocol.mjs",
  "tdd-orchestrator/references/quality-policy.md",
  "tdd-orchestrator/references/execution-and-resume.md",
  "ship/references/integrated-delivery.md",
  "retro/references/protocol.md",
  "docs/capability-matrix.md",
  "docs/functional.md",
  "docs/omp-compatibility.md",
  "specs/specs005-omp-compatible-release/spec.md",
  "specs/specs005-omp-compatible-release/plan.md",
  "specs/specs005-omp-compatible-release/tasks.md",
  "specs/specs005-omp-compatible-release/contracts/interface-contract.md",
]);
const ALIGNMENT_RETAINED_RUN_ID = "720cf604-e199-4f49-a432-9fac3b480198";
const ALIGNMENT_RETAINED_PATHS = Object.freeze([
  "alignment/SKILL.md",
  "alignment/agents/requirements-reader.md",
  "alignment/references/comprehension-review.md",
  "alignment/references/domain-modeling.md",
  "alignment/references/routing-and-persistence.md",
  "alignment/references/writing-for-agents.md",
]);
const ALIGNMENT_RETAINED_SOURCE = Object.freeze([
  { path: "alignment/SKILL.md", bytes: 14090, sha256: "bf2b2dd4d10d8635b4ad746ffc462b6bbe7962fe90d5294e3dabc0249b820f18" },
  { path: "alignment/agents/requirements-reader.md", bytes: 3156, sha256: "4c59206dcdb8d4043d26621de713bb440e87221b1c6a5b3ad833c0831b3a6a82" },
  { path: "alignment/references/comprehension-review.md", bytes: 1810, sha256: "ef9d9eaae580db6242ab4b4ed27facadb270689c7487c284343499264805b4e2" },
  { path: "alignment/references/domain-modeling.md", bytes: 1880, sha256: "9c893bf140912cd4c8bcad0873ca4d59f9dfabda74c896fc3eb9328dfd08c39b" },
  { path: "alignment/references/routing-and-persistence.md", bytes: 7079, sha256: "46a9121501f1b00f6f08e0aa722f783789a9d3fcc5b572ee66cb8428943dabf5" },
  { path: "alignment/references/writing-for-agents.md", bytes: 2168, sha256: "1241ce58bd8d6b63015ec16855ae40e77384b4428232853882ace54b00c82b24" },
]);

let nextHostWorkflowOrdinal = 0;
const observedFrameOrdinals = new WeakMap();

function allocateHostWorkflowOrdinal() {
  if (nextHostWorkflowOrdinal >= Number.MAX_SAFE_INTEGER) throw new ProbeError("BLOCKED", "host workflow ordinal exhausted");
  nextHostWorkflowOrdinal += 1;
  return nextHostWorkflowOrdinal;
}

function observedHostWorkflowOrdinal(frame) {
  return observedFrameOrdinals.get(frame) ?? null;
}

function normalizeHostWorkflowOrdinal(value, fallback = null) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

class ProbeError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "ProbeError";
    this.kind = kind;
    Object.assign(this, details);
  }
}
function blocked(message, details = {}) { throw new ProbeError("BLOCKED", message, details); }
function assertion(message, details = {}) { throw new ProbeError("ASSERTION", message, details); }
function now() { return new Date().toISOString(); }
function sha256Bytes(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function sha256Text(text) { return sha256Bytes(Buffer.from(String(text ?? ""), "utf8")); }
function truncateUtf8(value, limit = MAX_CAPTURE_SAFE_STRING_BYTES) {
  const maxBytes = Math.max(0, Math.min(MAX_CAPTURE_SAFE_STRING_BYTES, Number.isSafeInteger(limit) ? limit : MAX_CAPTURE_SAFE_STRING_BYTES));
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let output = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) break;
    output += character;
    bytes += characterBytes;
  }
  return output;
}
function scrub(value, limit = MAX_CAPTURE_SAFE_STRING_BYTES) {
  return truncateUtf8(String(value ?? "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "<redacted-thinking>")
    .replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, "<redacted-analysis>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential|authorization|cookie))\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>"), limit);
}
function captureSafeIdentifier(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value || !value.trim() || value.trim() !== value) {
    blocked(`${label} was not an exact opaque identity string`);
  }
  if (Buffer.byteLength(value, "utf8") > MAX_CAPTURE_SAFE_STRING_BYTES || scrub(value, MAX_CAPTURE_SAFE_STRING_BYTES) !== value) {
    blocked(`${label} was not capture-safe for exact identity retention`);
  }
  return value;
}
function preserveIdentifier(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
function validateIdentifierAliases(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const values = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const candidate = value[key];
    if (candidate === undefined || candidate === null) continue;
    const exact = typeof candidate === "object" && !Array.isArray(candidate)
      ? captureSafeIdentifier(canonical(candidate), `${label}.${key}`)
      : captureSafeIdentifier(candidate, `${label}.${key}`);
    values.push(exact);
  }
  if (values.length > 1 && values.some((candidate) => candidate !== values[0])) blocked(`${label} exposed contradictory identity aliases`);
  return values[0] ?? null;
}
const KNOWN_IDENTITY_ALIAS_FAMILIES = Object.freeze([
  ["allocated_id", "allocatedId"],
  ["instanceId", "instance_id"],
  ["jobId", "job_id"],
  ["assignment_id", "assignmentId"],
  ["run_id", "runId"],
  ["sessionId", "session_id"],
  ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"],
  ["parentToolCallId", "parent_tool_call_id", "parentCallId", "parent_call_id"],
  ["agentId", "agent_id"],
  ["taskId", "task_id"],
  ["messageId", "message_id"],
  ["eventId", "event_id"],
  ["agentSource", "agent_source"],
]);
function validateKnownIdentityMetadata(value, label, includeGenericId = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const keys of KNOWN_IDENTITY_ALIAS_FAMILIES) {
    validateIdentifierAliases(value, keys, `${label}.${keys.join("/")}`);
  }
  validateIdentifierAliases(value, ["agent"], `${label}.agent`);
  if (includeGenericId) validateIdentifierAliases(value, ["id"], `${label}.id`);
}
function validateKnownFrameIdentity(frame) {
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) return;
  const type = String(frame.type ?? "").toLowerCase();
  if (type === "rpc_chunk") validateIdentifierAliases(frame, ["chunkId"], "rpc_chunk");
  if (type === "response" || type === "prompt_result") validateIdentifierAliases(frame, ["id"], type);
  const includeGenericId = ["tool_execution_start", "tool_execution_update", "tool_stream_update", "tool_execution_end", "subagent_lifecycle", "subagent_progress", "subagent_event"].includes(type);
  const visit = (value, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    validateKnownIdentityMetadata(value, label, includeGenericId);
    for (const key of ["event", "payload", "progress", "details", "message", "toolCall", "tool_call"]) {
      if (value[key] && typeof value[key] === "object" && !Array.isArray(value[key])) visit(value[key], `${label}.${key}`);
    }
  };
  if (includeGenericId || type === "message_end") visit(frame, "frame");
  if (includeGenericId) {
    fullToolCallId(frame, ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"]);
    fullToolCallId(frame, ["parentToolCallId", "parent_tool_call_id", "parentCallId", "parent_call_id"]);
  }
  if (type === "message_end") {
    validateIdentifierAliases(frame, ["messageId", "message_id"], "message_end");
  }
}
function sensitiveKey(key) {
  return /(?:auth|token|secret|password|credential|api[_-]?key|cookie|private[_-]?key|system[_-]?prompt|chain[_-]?of[_-]?thought|cot|reasoning|provider[_-]?error|raw[_-]?error)/i.test(String(key));
}
const MAX_OPERATIONAL_GUARD_IDENTIFIER_BYTES = 256;
const KNOWN_NON_PROJECT_READ_URI_SCHEMES = new Set(["artifact", "file", "http", "https", "xd"]);
function boundedOperationalGuardIdentifier(value, label) {
  const identifier = preserveIdentifier(value);
  if (!identifier) return null;
  if (
    Buffer.byteLength(identifier, "utf8") > MAX_OPERATIONAL_GUARD_IDENTIFIER_BYTES
    || /[\u0000-\u001f\u007f]/.test(identifier)
    || /[{}\[\]"']/.test(identifier)
    || /^[A-Za-z]:[\\/]/.test(identifier)
    || /[\\/]/.test(identifier)
    || /(?:^|[?&#\s])(?:token|secret|password|credential|authorization|cookie|api[_-]?key)\s*[=:]/i.test(identifier)
    || identifier.includes("://")
  ) return `<redacted-${label}>`;
  return identifier;
}
function unsupportedReadUriGuard(value, scheme, scope, toolCallId, hostArrivalOrdinal, hostWorkflowOrdinal) {
  const rawScheme = /^[a-z][a-z0-9+.-]*$/i.test(scheme) ? scheme.toLowerCase() : "";
  const normalizedScheme = rawScheme.length <= 32 ? rawScheme || "unknown" : "unknown";
  return {
    reason_code: "READ_NON_PROJECT_RESOURCE_URI",
    tool: "read",
    tool_call_id: boundedOperationalGuardIdentifier(toolCallId, "tool-call-id"),
    scope: boundedOperationalGuardIdentifier(scope, "scope"),
    scheme: normalizedScheme,
    scheme_class: KNOWN_NON_PROJECT_READ_URI_SCHEMES.has(normalizedScheme) ? "known-unsupported-resource" : "unrecognized-resource",
    host_arrival_ordinal: normalizeHostWorkflowOrdinal(hostArrivalOrdinal),
    host_workflow_ordinal: normalizeHostWorkflowOrdinal(hostWorkflowOrdinal),
    rejected_uri_sha256: sha256Bytes(Buffer.from(value, "utf8")),
    rejected_uri_bytes: Buffer.byteLength(value, "utf8"),
  };
}
function safeValue(value, depth = 0, key = "") {
  if (sensitiveKey(key)) return "<redacted>";
  if (depth > 12) return "<depth-limited>";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.slice(0, 96).map((item) => safeValue(item, depth + 1, key));
  if (value && typeof value === "object") {
    const out = Object.create(null);
    for (const [childKey, childValue] of Object.entries(value).slice(0, 128)) out[childKey] = safeValue(childValue, depth + 1, childKey);
    return out;
  }
  return String(value);
}
function serializeOperationalEvidence(value) {
  // Preview truncation can discard late START/END correlations from valid proofs.
  const text = JSON.stringify(value, (key, item) => {
    if (sensitiveKey(key)) return "<redacted>";
    if (typeof item === "string") return scrub(item);
    if (item === null || ["object", "boolean", "number"].includes(typeof item)) return item;
    return String(item);
  }, 2) + "\n";
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_CAPTURE_BYTES) throw new ProbeError("BLOCKED", "operational evidence exceeded physical limit", { bytes, max_bytes: MAX_CAPTURE_BYTES });
  return text;
}
const SDK_ASSISTANT_EVENT_TYPES = new Set([
  "start", "text_start", "text_delta", "text_end", "thinking_start", "thinking_delta", "thinking_end",
  "image_end", "toolcall_start", "toolcall_delta", "toolcall_end", "done", "error",
]);
function sdkDeltaRecord(record) {
  return record?.frame_type === "subagent_event" && record.type === "message_update"
    && ["text_delta", "thinking_delta", "toolcall_delta"].includes(record.nonterminal_delta_kind)
    && record.assistant_event?.present === true && record.assistant_event.type === record.nonterminal_delta_kind
    && Number.isSafeInteger(record.assistant_event.content_index) && record.assistant_event.content_index >= 0
    && !record.tool && !record.tool_call_id && !Object.hasOwn(record, "is_error");
}
function sameSdkDeltaTuple(left, right) {
  return sdkDeltaRecord(left) && sdkDeltaRecord(right)
    && left.nonterminal_delta_kind === right.nonterminal_delta_kind
    && left.assistant_event.content_index === right.assistant_event.content_index
    && (left.paths?.length ?? 0) === (right.paths?.length ?? 0)
    && !left.paths?.some((value, index) => value !== right.paths[index])
    && left.allocated_id === right.allocated_id && left.parent_tool_call_id === right.parent_tool_call_id
    && left.index === right.index && left.agent === right.agent && left.agentSource === right.agentSource
    && left.job_id === right.job_id && left.instance_id === right.instance_id;
}
function nonterminalProgressSummary(previous, next) {
  const first = previous.coalesced_nonterminal_progress;
  return {
    count: Math.min(Number.MAX_SAFE_INTEGER, (first?.count ?? 1) + (next.coalesced_nonterminal_progress?.count ?? 1)),
    first_host_arrival_ordinal: first?.first_host_arrival_ordinal ?? previous.host_arrival_ordinal,
    first_host_workflow_ordinal: first?.first_host_workflow_ordinal ?? previous.host_workflow_ordinal,
    first_host_arrival_timestamp: first?.first_host_arrival_timestamp ?? previous.host_arrival_timestamp,
    first_status: first?.first_status ?? previous.status,
  };
}

function safeError(error) {
  const raw = typeof error === "string" ? error : error?.message ?? error;
  return { type: typeof error, message_sha256: sha256Text(raw), message_bytes: Buffer.byteLength(String(raw ?? ""), "utf8"), code: typeof error?.code === "string" ? error.code : null };
}
function probeReasonCode(error) {
  if (!(error instanceof ProbeError)) return "UNCLASSIFIED_ERROR";
  const message = String(error.message ?? "");
  if (/timed out/i.test(message)) return "HARNESS_TIMEOUT";
  if (/rpc frame|rpc_chunk|strict UTF-8 JSON|protocol/i.test(message)) return "RPC_PROTOCOL_GUARD";
  if (/OMP process error|OMP closed|process termination|exited unsuccessfully/i.test(message)) return "OMP_PROCESS_GUARD";
  if (/forbidden|outside the explicit|escaped the managed|non-read tool|non-read/i.test(message)) return "OBSERVATION_GUARD";
  if (/capture|retention exceeded|physical limit|reassembled frame/i.test(message)) return "CAPTURE_BOUND";
  if (/prompt was not admitted|prompt did not complete|session settled/i.test(message)) return "NATIVE_TERMINAL_GUARD";
  return "HARNESS_BLOCKED";
}
function controlledError(error) {
  const result = safeError(error);
  if (error instanceof ProbeError) {
    result.kind = error.kind;
    result.reason_code = probeReasonCode(error);
    result.message = scrub(error.message, 256);
    if (error.operational_guard && typeof error.operational_guard === "object") result.operational_guard = safeValue(error.operational_guard);
  }
  return result;
}
function clone(value) { return structuredClone(value); }
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function digest(value) { return sha256Text(canonical(value)); }
function correlationKey(...parts) {
  const values = parts.map((value) => String(value ?? ""));
  return values.some((value) => value.includes("\u001f")) ? JSON.stringify(values) : values.join("\u001f");
}
function normalizePublicAssignment(value) {
  return typeof value === "string" ? value.trim().replaceAll("\r\n", "\n").replaceAll("\r", "\n") : null;
}
function samePath(left, right) { return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase(); }
function inside(root, child) {
  const r = path.resolve(root).toLowerCase();
  const c = path.resolve(child).toLowerCase();
  return c === r || c.startsWith(`${r}${path.sep}`);
}
function regular(file, label) {
  const stat = fs.lstatSync(file, { bigint: false });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) blocked(`${label} is not a private regular file`, { path: file });
  return file;
}
function directory(dir, label) {
  const stat = fs.lstatSync(dir, { bigint: false });
  if (!stat.isDirectory() || stat.isSymbolicLink()) blocked(`${label} is not a private directory`, { path: dir });
  return dir;
}
function noSymlinkPath(root, file, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(file);
  if (!inside(resolvedRoot, resolved)) blocked(`${label} escaped its root`, { path: file });
  let current = resolvedRoot;
  const rel = path.relative(resolvedRoot, resolved);
  for (const segment of rel ? rel.split(path.sep) : []) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) blocked(`${label} crossed a symlink`, { path: current });
  }
  return resolved;
}
function copyExact(source, destination, label) {
  regular(source, `${label} source`);
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  if (fs.existsSync(destination)) blocked(`${label} destination already exists`, { path: destination });
  const bytes = fs.readFileSync(source);
  fs.writeFileSync(destination, bytes, { flag: "wx" });
  const copied = fs.readFileSync(destination);
  if (sha256Bytes(bytes) !== sha256Bytes(copied)) blocked(`${label} copy hash mismatch`, { path: destination });
  return { bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}
function writePrivate(file, value, root, label = "private write") {
  noSymlinkPath(root, file, label);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) blocked(`${label} would replace existing private bytes`, { path: file });
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  fs.writeFileSync(file, bytes, { flag: "wx" });
  return { path: file, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}
function atomicWrite(file, value, root, label = "atomic private write") {
  noSymlinkPath(root, file, label);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  fs.writeFileSync(temp, bytes, { flag: "wx" });
  fs.renameSync(temp, file);
  return { path: file, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}
function exactKeys(value, expected) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}
function validateExternalPlanReceipt(value) {
  const errors = [];
  if (!exactKeys(value, ["schema_version", "mode", "dry_run", "status", "merge_target", "quality", "steps"])) errors.push("root_keys");
  if (value?.schema_version !== 1) errors.push("schema_version");
  if (value?.mode !== "external") errors.push("mode");
  if (value?.dry_run !== true) errors.push("dry_run");
  if (value?.status !== "PLANNED") errors.push("status");
  if (value?.merge_target !== "main") errors.push("merge_target");
  if (!exactKeys(value?.quality, ["status", "legacy"]) || value.quality.status !== "PASS" || value.quality.legacy !== false) errors.push("quality");
  if (!Array.isArray(value?.steps) || value.steps.length !== EXTERNAL_PLAN_STEPS.length) errors.push("steps_shape");
  else {
    for (let index = 0; index < EXTERNAL_PLAN_STEPS.length; index += 1) {
      const step = value.steps[index];
      if (!exactKeys(step, ["step", "status"]) || step.step !== EXTERNAL_PLAN_STEPS[index] || step.status !== "NOT_EXECUTED") errors.push(`step_${index}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
function fileRecord(file, label) {
  regular(file, label);
  const bytes = fs.readFileSync(file);
  return { path: file, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}
function recordsUnchanged(before, after) {
  return before.length === after.length && before.every((item, index) => item.path === after[index]?.path && item.bytes === after[index]?.bytes && item.sha256 === after[index]?.sha256);
}
const NATIVE_ENV_ALLOWLIST = [
  "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
  "PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "TEMP", "TMP", "TMPDIR", "TERM", "CI", "NO_COLOR",
];
const NATIVE_ENV_OVERRIDE_KEYS = ["PI_CODING_AGENT_DIR", "PI_BLOCKED_AGENT", "OMP_CONFIG", "OMP_CONFIG_PATH", "PI_CONFIG"];
function createNativeEnvironment() {
  const env = {};
  const inherited = process.env;
  for (const key of NATIVE_ENV_OVERRIDE_KEYS) {
    if (inherited[key] !== undefined && inherited[key] !== "") throw new ProbeError("BLOCKED", `ambient global/agent override ${key} is present; refusing to reinterpret the native session`);
  }
  for (const key of NATIVE_ENV_ALLOWLIST) if (inherited[key] !== undefined) env[key] = inherited[key];
  const missing = ["HOME", "USERPROFILE"].filter((key) => !env[key]);
  if (missing.length) throw new ProbeError("BLOCKED", `native authenticated environment is missing ${missing.join(", ")}`);
  return {
    env,
    policy: {
      mode: "minimal-ambient-allowlist",
      auth_tcb: "existing HOME/USERPROFILE SDK configuration only; no auth files/tokens copied",
      removed_ambient_keys: Object.keys(inherited).filter((key) => !Object.prototype.hasOwnProperty.call(env, key)),
      model_path_guard: "prompt/observer policy only; no OS sandbox claim",
    },
  };
}

function minimalValidatorEnv(project) {
  const env = {};
  const pathValue = process.env.PATH ?? process.env.Path;
  if (pathValue) { env.PATH = pathValue; env.Path = pathValue; }
  for (const key of ["SystemRoot", "WINDIR", "ComSpec", "COMSPEC", "PATHEXT", "LANG", "LC_ALL"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const privateState = path.join(project, ".omp", "state");
  env.HOME = project;
  env.USERPROFILE = project;
  env.APPDATA = privateState;
  env.LOCALAPPDATA = privateState;
  env.XDG_CONFIG_HOME = privateState;
  env.TEMP = privateState;
  env.TMP = privateState;
  return env;
}
function externalPlanSourceBinding(source, project) {
  const pairs = [
    ["ship_cli", path.join(source, "ship", "bin", "ship.mjs"), path.join(project, ".omp", "skills", "ship", "bin", "ship.mjs")],
    ["ship_quality_lib", path.join(source, "ship", "bin", "lib.mjs"), path.join(project, ".omp", "skills", "ship", "bin", "lib.mjs")],
    ["quality_consumer", path.join(source, "tdd-orchestrator", "lib", "quality.mjs"), path.join(project, ".omp", "skills", "tdd-orchestrator", "lib", "quality.mjs")],
  ];
  const sourceRecords = pairs.map(([role, original, overlay]) => ({ role, source: fileRecord(original, `${role} source`), overlay: fileRecord(overlay, `${role} overlay`) }));
  return { status: sourceRecords.every((item) => item.source.bytes === item.overlay.bytes && item.source.sha256 === item.overlay.sha256) ? "PASS" : "BLOCKED", files: sourceRecords };
}
function runExternalPlanCli(project, source, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const cli = path.join(project, ".omp", "skills", "ship", "bin", "ship.mjs");
  const reportPath = path.join(project, EXTERNAL_PLAN_REPORT);
  const contextPath = path.join(project, EXTERNAL_PLAN_CONTEXT);
  const args = [cli, "plan", "--root", project, "--target", "main", "--report", EXTERNAL_PLAN_REPORT, "--context", EXTERNAL_PLAN_CONTEXT];
  const base = { status: "BLOCKED", evidence_level: "LOCAL_PROGRAM_ONLY", attempted: true, command: { executable: process.execPath, args, cwd: project, shell: false, timeout_ms: Math.min(timeoutMs, EXTERNAL_PLAN_TIMEOUT_MS) } };
  try {
    const sourceBefore = externalPlanSourceBinding(source, project);
    const qualityBefore = [fileRecord(reportPath, "quality report input"), fileRecord(contextPath, "quality context input")];
    const child = spawnSync(process.execPath, args, {
      cwd: project,
      env: minimalValidatorEnv(project),
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      timeout: Math.min(timeoutMs, EXTERNAL_PLAN_TIMEOUT_MS),
      maxBuffer: MAX_CAPTURE_BYTES,
    });
    const stdout = typeof child.stdout === "string" ? child.stdout : "";
    const stderr = typeof child.stderr === "string" ? child.stderr : "";
    let output = null;
    let parseError = null;
    try {
      if (!stdout.trim()) throw new Error("CLI stdout was empty");
      output = JSON.parse(stdout.trim());
    } catch (error) { parseError = scrub(error?.message ?? error); }
    const sourceAfter = externalPlanSourceBinding(source, project);
    const qualityAfter = [fileRecord(reportPath, "quality report input after CLI"), fileRecord(contextPath, "quality context input after CLI")];
    const receipt = validateExternalPlanReceipt(output);
    const sourceBound = sourceBefore.status === "PASS" && sourceAfter.status === "PASS" && sourceBefore.files.every((item, index) => item.source.sha256 === sourceAfter.files[index]?.source.sha256 && item.overlay.sha256 === sourceAfter.files[index]?.overlay.sha256 && item.source.sha256 === item.overlay.sha256);
    const qualityUnchanged = recordsUnchanged(qualityBefore, qualityAfter);
    const checks = {
      exit_code_zero: child.status === 0 && child.signal === null && !child.error,
      stdout_json: parseError === null,
      exact_ac021_receipt: receipt.ok,
      source_bound: sourceBound,
      quality_inputs_unchanged: qualityUnchanged,
    };
    return {
      ...base,
      status: Object.values(checks).every(Boolean) ? "PASS" : "BLOCKED",
      child: { exit_code: child.status, signal: child.signal ?? null, timed_out: child.error?.code === "ETIMEDOUT", error: child.error ? safeError(child.error) : null, stdout_sha256: sha256Text(stdout), stderr_sha256: sha256Text(stderr), stderr: scrub(stderr, 2048) },
      receipt: output ? safeValue(output) : null,
      source_binding: { before: sourceBefore, after: sourceAfter, unchanged: sourceBound },
      quality_inputs: { report: { before: qualityBefore[0], after: qualityAfter[0], unchanged: qualityBefore[0].bytes === qualityAfter[0].bytes && qualityBefore[0].sha256 === qualityAfter[0].sha256 }, context: { before: qualityBefore[1], after: qualityAfter[1], unchanged: qualityBefore[1].bytes === qualityAfter[1].bytes && qualityBefore[1].sha256 === qualityAfter[1].sha256 }, unchanged: qualityUnchanged },
      checks,
      parse_error: parseError,
      reason: Object.values(checks).every(Boolean) ? null : "actual overlay Ship plan CLI did not satisfy AC021 or immutable input/source binding",
    };
  } catch (error) {
    return { ...base, status: "BLOCKED", child: null, receipt: null, source_binding: null, quality_inputs: null, checks: {}, reason: scrub(error?.message ?? error), error: safeError(error) };
  }
}
function parseArgs(argv) {
  const values = {};
  let native = false;
  let offlineProbe = false;
  const allowed = new Set(["source", "lab", "omp", "phase", "timeout-ms", "alignment-capture", "route-capture", "original-snapshot", "original-manifest", "installed-package-root"]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--native") { native = true; continue; }
    if (token === "--offline-probe") { offlineProbe = true; continue; }
    if (!token.startsWith("--") || !allowed.has(token.slice(2))) throw new ProbeError("USAGE", `unsupported argument ${token}`);
    const key = token.slice(2); const value = argv[++i];
    if (!value || value.startsWith("--")) throw new ProbeError("USAGE", `missing value for --${key}`);
    values[key] = value;
  }
  if (offlineProbe) return { offlineProbe: true, native: false };
  for (const key of ["source", "lab", "omp", "phase"]) if (!values[key]) throw new ProbeError("USAGE", `required option missing: --${key}`);
  if (values.phase !== "green") throw new ProbeError("USAGE", "--phase must be green; RED/alignment probes are separate artifacts");
  const timeoutMs = values["timeout-ms"] === undefined ? DEFAULT_TIMEOUT_MS : Number(values["timeout-ms"]);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > DEFAULT_TIMEOUT_MS) throw new ProbeError("USAGE", "--timeout-ms must be an integer from 30000 through 300000");
  return {
    source: path.resolve(values.source),
    lab: path.resolve(values.lab),
    omp: path.resolve(values.omp),
    alignmentCapture: values["alignment-capture"] ? path.resolve(values["alignment-capture"]) : null,
    routeCapture: values["route-capture"] ? path.resolve(values["route-capture"]) : null,
    originalSnapshot: values["original-snapshot"] ? path.resolve(values["original-snapshot"]) : null,
    originalManifest: values["original-manifest"] ? path.resolve(values["original-manifest"]) : null,
    installedPackageRoot: values["installed-package-root"] ? path.resolve(values["installed-package-root"]) : null,
    phase: values.phase,
    timeoutMs,
    native,
    offlineProbe: false,
  };
}
function bindRetainedRoutes(sourceRoot, capturePath, routeApi, binaryBefore) {
  const pending = (reason) => ({ status: "PENDING", reason, sdk_sessions_reexecuted: false });
  if (!capturePath) return { status: "NOT_SUPPLIED", sdk_sessions_reexecuted: false };
  try {
    const captureFile = regular(capturePath, "retained Native27 route evidence");
    const bytes = fs.readFileSync(captureFile);
    const captureSha = sha256Bytes(bytes);
    if (captureSha !== "1a3e8eedb5289f3b6fb2af387fddc9cd9060646bca962515a978a8160fc885b0") return pending("retained route evidence bytes changed");
    const evidence = JSON.parse(bytes.toString("utf8"));
    if (evidence.run_id !== "f56da48f-48d4-4785-8319-aeb5bee0313f"
      || evidence.preservation?.source_changed?.length !== 0 || evidence.preservation.binary_changed !== false
      || evidence.preservation.workload_receipt_stable !== true) return pending("retained source/binary preservation is not bound");
    if (binaryBefore?.sha256 !== "dfb15c27cb2ea192a94761c26aa5cd4eed54b1e0a5a85c02938ab07d769bc8f7"
      || binaryBefore.bytes !== 249985024 || evidence.omp_binary_before.sha256 !== binaryBefore.sha256
      || evidence.omp_binary_after.sha256 !== binaryBefore.sha256) return pending("current binary differs from retained Native27");
    const consumer = fileRecord(path.join(sourceRoot, "implementation-evidence/native-release/route-matrix.mjs"), "current retained route consumer");
    if (consumer.sha256 !== "65d9fbec24e1ec5cda1f7346f60e7a247f1c5ca40fed40aec59bbdae737ddeb9") return pending("route consumer changed");
    const expected = evidence.source_before;
    if (!Array.isArray(expected) || expected.length !== 131 || canonical(expected) !== canonical(evidence.source_after)) return pending("retained source inventory is incomplete");
    const paths = [...new Set([...sourceManifest(sourceRoot).map((item) => item.sourceRelativePath), ...CONSUMER_PATHS])];
    const current = fingerprint(sourceRoot, paths);
    const pins = new Map(expected.map((item) => [item.path, item]));
    if (current.length !== pins.size || current.some((item) => item.sha256 !== pins.get(item.path)?.sha256 || item.bytes !== pins.get(item.path)?.bytes)) return pending("current product/consumer/document source differs from retained Native27");
    const matrix = evidence.route_matrix;
    const ids = ["SHORT_LOCAL", "FULL_LOCAL", "SHORT_GIT", "FULL_GIT"];
    if (matrix?.cases?.length !== 4 || matrix.fixtures?.length !== 4
      || matrix.cases.some((item, index) => item.case !== ids[index] || item.status !== "PASS" || item.native !== true)) return pending("retained evidence does not contain four authenticated PASS routes");
    const cases = [];
    for (const id of ids) {
      const fixture = matrix.fixtures.find((item) => item.id === id);
      if (!fixture || !inside(evidence.lab_root, fixture.project)) return pending("retained route project escaped its original lab");
      const witness = fixture.host_artifacts?.inspectionInputWitness;
      if (witness?.path !== ".omp/state/native-route/inspection-input.json") return pending("retained route input witness is missing");
      const inputPath = path.join(fixture.project, witness.path);
      noSymlinkPath(evidence.lab_root, inputPath, "retained route inspection input");
      const inputBytes = fs.readFileSync(regular(inputPath, "retained route inspection input"));
      if (sha256Bytes(inputBytes) !== witness.sha256) return pending("retained route inspection input bytes changed");
      const input = JSON.parse(inputBytes.toString("utf8"));
      const original = matrix.cases.find((item) => item.case === id);
      if (!samePath(input.projectRoot, fixture.project) || input.definition?.id !== id
        || canonical(input.definition.binding) !== canonical(original.binding)) return pending("retained route input identity changed");
      const result = routeApi.inspectRouteCase(input);
      if (result.status !== "PASS" || result.native !== true || result.missing?.length || result.failures?.length) return pending("current route consumer refused retained evidence: " + id);
      cases.push(result);
    }
    const capture = { path: captureFile, bytes: bytes.byteLength, sha256: captureSha, run_id: evidence.run_id };
    return { status: "PASS", sdk_sessions_reexecuted: false, capture, source_scope: "131 unchanged product/consumer/normative files and exact route consumer; private Native10 collector changes are not whole-source equivalence", route_matrix: { ...matrix, cases, retained_capture: capture, sdk_sessions_reexecuted: false } };
  } catch (error) {
    return pending("retained route revalidation failed: " + scrub(error?.message ?? error, 512));
  }
}

function walkRegularFiles(root, label, excludeRootControlState = false) {
  directory(root, label);
  const output = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) blocked(`${label} contains symlink`, { path: file });
      if (stat.isDirectory()) {
        if (!(excludeRootControlState && dir === root && entry.name === "state")) visit(file);
      }
      else if (stat.isFile() && stat.nlink <= 1) output.push(file);
      else blocked(`${label} contains hardlink or special file`, { path: file });
    }
  };
  visit(root);
  if (!output.length) blocked(`${label} contains no regular files`);
  return output;
}
function fingerprintPrivateRoot(root, label = "private root", excludeRootControlState = false) {
  if (!root) return null;
  const files = walkRegularFiles(root, label, excludeRootControlState).map((file) => {
    const bytes = fs.readFileSync(file);
    return { path: path.relative(root, file).replaceAll("\\", "/"), bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
  });
  return { root, files, sha256: sha256Text(JSON.stringify(files)) };
}
function fingerprintInstalledPackage(root, label, ownedRuntimeState = false) {
  if (!root) return null;
  if (ownedRuntimeState && (path.basename(path.resolve(root)) !== ".omp" || !packageManifestVerified(root))) blocked("owned installed package requires its verified managed manifest");
  return { ...fingerprintPrivateRoot(root, label, ownedRuntimeState),
    scope: ownedRuntimeState ? "installed package; excludes only owned root state/** control data" : "entire explicitly supplied immutable root",
    excluded_runtime_paths: ownedRuntimeState ? ["state/**"] : [] };
}
function retryFileFingerprint(file, label = "retry file") {
  if (typeof file !== "string" || !file) return null;
  const bytes = fs.readFileSync(regular(file, label));
  return { bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}
function relativeRetryPath(root, value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return path.isAbsolute(value) ? path.relative(root, value).replaceAll("\\", "/") : value.replaceAll("\\", "/").replace(/^\.\//, "");
}
function packageManifestVerified(root) {
  if (!root) return false;
  for (const relative of ["MANIFEST.json", "package-manifest.json", "package.json"]) {
    const file = path.join(root, relative);
    try {
      const value = JSON.parse(fs.readFileSync(regular(file, `installed package ${relative}`), "utf8"));
      const rows = Array.isArray(value) ? value : Array.isArray(value?.files) ? value.files : Array.isArray(value?.entries) ? value.entries : null;
      if (!rows?.length) continue;
      const verified = rows.every((entry) => {
        const relativePath = entry?.destination ?? entry?.path ?? entry?.file ?? entry?.source;
        const expectedHash = entry?.sha256 ?? entry?.hash;
        if (typeof relativePath !== "string" || !SHA256.test(String(expectedHash ?? ""))) return false;
        const resolved = path.resolve(root, relativePath);
        if (!inside(root, resolved)) return false;
        try {
          const stat = fs.lstatSync(resolved);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return false;
          const bytes = fs.readFileSync(resolved);
          return sha256Bytes(bytes) === expectedHash && (entry.bytes === undefined || entry.bytes === bytes.byteLength);
        } catch {
          return false;
        }
      });
      if (verified) return true;
    } catch {}
  }
  return false;
}
function sourceManifest(source) {
  const entries = [];
  const destinations = new Set();
  const add = (kind, sourceRelativePath, destinationRelative, file) => {
    regular(file, `source ${sourceRelativePath}`);
    if (destinations.has(destinationRelative)) blocked(`duplicate overlay destination ${destinationRelative}`);
    destinations.add(destinationRelative);
    const bytes = fs.readFileSync(file);
    entries.push({ kind, sourceRelativePath, destinationRelative, source: file, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
  };
  for (const skill of SKILLS) {
    const skillRoot = path.join(source, skill);
    for (const file of walkRegularFiles(skillRoot, `skill ${skill}`)) {
      const rel = path.relative(source, file).replaceAll("\\", "/");
      add("skill", rel, `skills/${rel}`, file);
    }
  }
  for (const [skill, subdir, fileName] of AGENTS) {
    const rel = `${skill}/${subdir}/${fileName}`;
    add("agent", rel, `agents/${fileName}`, path.join(source, skill, subdir, fileName));
  }
  return entries;
}
function freezePackage(runRoot, entries) {
  const packageRoot = path.join(runRoot, "frozen-package");
  fs.mkdirSync(packageRoot, { recursive: false });
  const frozen = entries.map((entry) => {
    const target = path.join(packageRoot, entry.destinationRelative);
    const copy = copyExact(entry.source, target, `freeze ${entry.sourceRelativePath}`);
    if (copy.sha256 !== entry.sha256 || copy.bytes !== entry.bytes) blocked(`frozen package changed ${entry.sourceRelativePath}`);
    return { ...entry, packagePath: target };
  });
  const manifest = frozen.map(({ kind, sourceRelativePath, destinationRelative, bytes, sha256 }) => ({ kind, source: sourceRelativePath, destination: destinationRelative, bytes, sha256 }));
  const manifestFile = path.join(packageRoot, "MANIFEST.json");
  const manifestInfo = atomicWrite(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, runRoot, "frozen manifest");
  return { root: packageRoot, manifestFile, manifestSha256: manifestInfo.sha256, entries: frozen, manifestDigest: sha256Text(JSON.stringify(manifest)) };
}
function installOverlay(packageInfo, projectRoot) {
  const overlay = path.join(projectRoot, ".omp");
  fs.mkdirSync(overlay, { recursive: true });
  const copies = packageInfo.entries.map((entry) => {
    const destination = path.join(overlay, entry.destinationRelative);
    const copy = copyExact(entry.packagePath, destination, `overlay ${entry.destinationRelative}`);
    if (copy.sha256 !== entry.sha256 || copy.bytes !== entry.bytes) blocked(`overlay hash mismatch ${entry.destinationRelative}`);
    return { path: destination, relative: entry.destinationRelative, bytes: copy.bytes, sha256: copy.sha256 };
  });
  return { root: overlay, copies };
}
function fingerprint(source, relativePaths) {
  return relativePaths.map((relativePath) => {
    const file = noSymlinkPath(source, path.join(source, relativePath), `fingerprint ${relativePath}`);
    const bytes = fs.readFileSync(regular(file, `fingerprint ${relativePath}`));
    return { path: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
  });
}
function compareFingerprints(before, after) {
  const changed = [];
  for (const item of before) {
    const current = after.find((entry) => entry.path === item.path);
    if (!current || current.bytes !== item.bytes || current.sha256 !== item.sha256) changed.push(item.path);
  }
  return changed;
}
function fingerprintDiffPaths(before, after) {
  const prior = new Map((before?.files ?? []).map((item) => [item.path, item]));
  const current = new Map((after?.files ?? []).map((item) => [item.path, item]));
  return [...new Set([...prior.keys(), ...current.keys()].filter((file) => {
    const left = prior.get(file);
    const right = current.get(file);
    return !left || !right || left.bytes !== right.bytes || left.sha256 !== right.sha256;
  }))].sort();
}
function bindRetainedAlignment(source, capturePath) {
  const pending = (reason, mismatches = [], details = {}) => ({
    status: "PENDING",
    evidence_level: "retained-native-alignment-capture",
    proof_level: "historical retained alignment only; not current full-package or external proof",
    reason,
    mismatches,
    ...details,
  });
  if (!capturePath) return pending("retained alignment capture was not explicitly supplied");
  try {
    const captureFile = regular(capturePath, "retained alignment capture");
    const captureBytes = fs.readFileSync(captureFile);
    const captureDigest = sha256Bytes(captureBytes);
    if (captureDigest !== "dc27b25c1c45a447f36be9007825afa295f71527a22768172d5b4e0a2a139e93") return pending("retained alignment capture bytes changed", ["capture.sha256"], { capture: { path: scrub(captureFile, 1024), bytes: captureBytes.byteLength, sha256: captureDigest } });
    const capture = JSON.parse(captureBytes.toString("utf8"));
    const mismatches = [];
    if (capture.run_id !== ALIGNMENT_RETAINED_RUN_ID) mismatches.push("run_id");
    if (typeof capture.source_root !== "string" || !path.isAbsolute(capture.source_root)) mismatches.push("source_root");
    if (capture.source_after_scope !== "alignment-six-targets-only") mismatches.push("source_after_scope");
    const sourceAfter = Array.isArray(capture.source_after) ? capture.source_after : [];
    if (sourceAfter.length !== ALIGNMENT_RETAINED_SOURCE.length) mismatches.push("source_after.count");
    const sourceByPath = new Map(sourceAfter.map((entry) => [entry?.path, entry]));
    const current = fingerprint(source, ALIGNMENT_RETAINED_PATHS);
    const sourceMismatches = [];
    for (const expected of ALIGNMENT_RETAINED_SOURCE) {
      const retained = sourceByPath.get(expected.path);
      const observed = current.find((entry) => entry.path === expected.path);
      if (!retained || retained.bytes !== expected.bytes || retained.sha256 !== expected.sha256) sourceMismatches.push(`${expected.path}:retained`);
      if (!observed || observed.bytes !== expected.bytes || observed.sha256 !== expected.sha256) sourceMismatches.push(`${expected.path}:current`);
      if (retained && observed && (retained.bytes !== observed.bytes || retained.sha256 !== observed.sha256)) sourceMismatches.push(`${expected.path}:drift`);
    }
    if (sourceMismatches.length) mismatches.push(...sourceMismatches);
    const expectedProfiles = AGENTS.map(([skill, subdir, file]) => `${skill}/${subdir}/${file}`);
    if (JSON.stringify(capture.source_capture?.skills) !== JSON.stringify(SKILLS)) mismatches.push("source_capture.skills");
    if (JSON.stringify(capture.source_capture?.agent_profiles) !== JSON.stringify(expectedProfiles)) mismatches.push("source_capture.agent_profiles");
    if (capture.source_capture?.files !== 136) mismatches.push("source_capture.files");
    if (capture.source_capture?.manifest_sha256 !== "0d40b8a19c35681a7f05c17d76f022e95249624a86d3d55a5371cf27157fb3c9") mismatches.push("source_capture.manifest_sha256");
    const assertions = Array.isArray(capture.assertions) ? capture.assertions : [];
    const resumeAssertion = assertions.find((item) => item?.id === "AC-009.green-resume-collision");
    const controlsAssertion = assertions.find((item) => item?.id === "AC-009.green-controls");
    const preservationAssertion = assertions.find((item) => item?.id === "preservation.source");
    if (resumeAssertion?.status !== "PASS") mismatches.push("assertions.AC-009.green-resume-collision");
    if (controlsAssertion?.status !== "PASS") mismatches.push("assertions.AC-009.green-controls");
    if (preservationAssertion?.status !== "PASS") mismatches.push("assertions.preservation.source");
    const requiredScenarios = ["GREEN-local", "GREEN-short", "GREEN-full", "GREEN-blocked", "GREEN-resume-A-initial", "GREEN-resume-B-initial", "GREEN-resume-A", "GREEN-resume-B", "GREEN-collision"];
    const scenarios = Array.isArray(capture.scenarios) ? capture.scenarios : [];
    if (scenarios.length !== requiredScenarios.length) mismatches.push("scenarios.count");
    for (const label of requiredScenarios) {
      const matches = scenarios.filter((item) => item?.label === label);
      const observed = matches[0];
      const observedTerminal = observed?.session?.terminal;
      if (matches.length !== 1
        || !UUID_V4.test(observed?.request_id ?? "")
        || !UUID_V4.test(observed?.run_id ?? "")
        || observedTerminal?.prompt_result?.status !== "completed"
        || observedTerminal.prompt_result.agentInvoked !== true
        || observedTerminal.session_settled !== true
        || observedTerminal.status !== "completed"
        || observedTerminal.agent_end?.isTerminal !== true
        || observedTerminal.agent_end.awaitingAsyncWork !== false
        || observed?.session?.process?.exit_code !== 0) mismatches.push(`scenario.${label}.native_terminal`);
    }
    const scenario = scenarios.find((item) => item?.label === "GREEN-collision");
    const terminal = scenario?.session?.terminal;
    const lastSignals = terminal?.last_message?.signals;
    const terminalReady = Boolean(
      scenario
      && scenario.mode === "git"
      && scenario.route === "full"
      && UUID_V4.test(scenario.request_id ?? "")
      && UUID_V4.test(scenario.run_id ?? "")
      && terminal?.prompt_result?.status === "completed"
      && terminal.prompt_result.agentInvoked === true
      && terminal.session_settled === true
      && terminal.status === "completed"
      && terminal.agent_end?.isTerminal === true
      && scenario.session?.process?.exit_code === 0
      && lastSignals?.alignment === true
      && lastSignals?.checkpoint === true
      && lastSignals?.blocked === true,
    );
    if (!terminalReady) mismatches.push("scenario.native_terminal");
    const requiredBindings = ["resume_a_parent", "resume_a_successor", "resume_b_parent", "resume_b_successor"];
    const checkpointLabels = { resume_a_parent: "GREEN-resume-A-initial", resume_a_successor: "GREEN-resume-A", resume_b_parent: "GREEN-resume-B-initial", resume_b_successor: "GREEN-resume-B" };
    const checkpointRows = Array.isArray(capture.checkpoints) ? capture.checkpoints : [];
    const checkpoints = {};
    for (const key of requiredBindings) {
      const matches = checkpointRows.filter((item) => item?.label === checkpointLabels[key]);
      const binding = matches[0];
      const checkpointScenario = scenarios.find((item) => item?.label === checkpointLabels[key]);
      if (matches.length !== 1 || !binding || typeof binding.path !== "string" || !SHA256.test(binding.sha256) || !Number.isSafeInteger(binding.bytes)
        || binding.bytes < 0
        || binding.provided_request_id !== checkpointScenario?.request_id
        || binding.observed_request_id !== checkpointScenario?.request_id
        || binding.provided_run_id !== checkpointScenario?.run_id
        || binding.observed_run_id !== checkpointScenario?.run_id) {
        mismatches.push(`checkpoint.${key}.metadata`);
        continue;
      }
      try {
        const file = regular(binding.path, `retained alignment checkpoint ${key}`);
        const bytes = fs.readFileSync(file);
        if (bytes.byteLength !== binding.bytes || sha256Bytes(bytes) !== binding.sha256) mismatches.push(`checkpoint.${key}.hash`);
        checkpoints[key] = { label: binding.label, path: scrub(binding.path, 1024), bytes: bytes.byteLength, sha256: sha256Bytes(bytes), request_id: binding.observed_request_id, run_id: binding.observed_run_id };
      } catch {
        mismatches.push(`checkpoint.${key}.unreadable`);
      }
    }
    if (mismatches.length) return pending("retained alignment capture or its exact six-target source scope did not validate", [...new Set(mismatches)], { capture: { path: scrub(captureFile, 1024), bytes: captureBytes.byteLength, sha256: captureDigest, run_id: capture.run_id ?? null }, current_source: current });
    return {
      status: "PASS",
      evidence_level: "retained-native-alignment-capture",
      proof_level: "native nine-session alignment capture; scoped six-target source binding only",
      capture: { path: scrub(captureFile, 1024), bytes: captureBytes.byteLength, sha256: captureDigest, run_id: capture.run_id, phase: capture.phase, stage: capture.stage },
      scope: { source_root: scrub(source, 1024), retained_source_root: scrub(capture.source_root, 1024), source_root_equivalence: "exact-six-target-bytes", source_after_scope: capture.source_after_scope, source_after: ALIGNMENT_RETAINED_SOURCE, current_source: current },
      source_capture: { skills: SKILLS, agent_profiles: expectedProfiles, files: capture.source_capture.files, manifest_sha256: capture.source_capture.manifest_sha256 },
      scenarios: scenarios.map((item) => ({ label: item.label, mode: item.mode, route: item.route, request_id: item.request_id, run_id: item.run_id, session: { terminal: item.session.terminal, process: item.session.process } })),
      checkpoints,
      assertions: { "AC-009.green-resume-collision": resumeAssertion.status, "AC-009.green-controls": controlsAssertion.status, "preservation.source": preservationAssertion.status },
      consumer_scope: "alignment native checkpoint/resume owner; not current NATIVE-10 DOC/REVIEW/VALIDATE/RETRO or EXTERNAL proof",
    };
  } catch (error) {
    return pending("retained alignment capture could not be read or parsed", [error?.code ?? "capture_read_or_parse"], { capture: { path: scrub(capturePath, 1024) } });
  }
}
function safeSourcePath(source, relativePath) {
  const file = noSymlinkPath(source, path.join(source, relativePath), `source ${relativePath}`);
  return regular(file, `source ${relativePath}`);
}
function sourceLinks(matrixText, heading) {
  const lines = matrixText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) blocked(`catalog heading missing: ${heading}`);
  const rows = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    if (!/^\|/.test(lines[i]) || /^\|\s*[-: ]+\|/.test(lines[i])) continue;
    const columns = lines[i].split("|").slice(1, -1).map((value) => value.trim());
    if (!columns.length || columns[0].toLowerCase() === "fonte") continue;
    const link = columns.flatMap((column) => [...column.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]))[0];
    rows.push({ id: columns[0], link: link?.replace(/^<|>$/g, "") ?? null });
  }
  return rows;
}
function bindCatalog(source) {
  const matrixRelative = "docs/capability-matrix.md";
  const matrixFile = safeSourcePath(source, matrixRelative);
  const matrixText = fs.readFileSync(matrixFile, "utf8");
  const capRows = matrixText.split(/\r?\n/)
    .filter((line) => /^\|\s*CAP-\d{3}(?:\s|\/)/.test(line))
    .map((line) => {
      const columns = line.split("|").slice(1, -1).map((value) => value.trim());
      const id = columns[0].match(/CAP-\d{3}/)?.[0];
      const link = columns[2]?.match(/\[[^\]]+\]\(([^)]+)\)/)?.[1] ?? null;
      return { id, link: link?.replace(/^<|>$/g, "") ?? null };
    });
  const caps = [];
  const capIds = new Set();
  for (const row of capRows) {
    if (!row.id || capIds.has(row.id)) blocked(`capability catalog duplicate/malformed row ${row.id}`);
    capIds.add(row.id);
    if (!row.link || /^https?:/i.test(row.link)) blocked(`capability ${row.id} has no local source link`);
    const relativePath = path.posix.normalize(path.posix.join("docs", row.link.replaceAll("\\", "/"))).replace(/^\.\//, "");
    const file = safeSourcePath(source, relativePath);
    const bytes = fs.readFileSync(file);
    caps.push({ id: row.id, source: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
  }
  const sources = [];
  const sourceRows = sourceLinks(matrixText, "## 18 fontes e proveniência");
  const sourceIds = new Set();
  for (const row of sourceRows) {
    if (!row.id || sourceIds.has(row.id)) blocked(`source catalog duplicate/malformed row ${row.id}`);
    sourceIds.add(row.id);
    if (!row.link || /^https?:/i.test(row.link)) blocked(`source ${row.id} has no local source link`);
    const relativePath = path.posix.normalize(path.posix.join("docs", row.link.replaceAll("\\", "/"))).replace(/^\.\//, "");
    const file = safeSourcePath(source, relativePath);
    const bytes = fs.readFileSync(file);
    sources.push({ id: row.id, source: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
  }
  return {
    status: caps.length === 42 && sources.length === 18 ? "PASS" : "BLOCKED",
    matrix: { path: matrixRelative, bytes: fs.statSync(matrixFile).size, sha256: sha256Bytes(fs.readFileSync(matrixFile)) },
    capabilities: { count: caps.length, ids: caps.map((item) => item.id).sort(), bindings: caps },
    sources: { count: sources.length, ids: sources.map((item) => item.id).sort(), bindings: sources },
    evidence_level: "static-source-binding",
    note: "Every catalog row is bound to a real local linked file and hash; this is not a word-count oracle and does not by itself prove native execution.",
  };
}
const NATIVE_ROUTE_ARTIFACT_ROOT = ".omp/state/native-route";
const NATIVE_ROUTE_SOURCE_SCOPE = "current-six-alignment-sources";
function routeManifestDigest(entries) {
  return sha256Text(entries.map((entry) => `${entry.kind}\u0000${entry.source}\u0000${entry.destination}\u0000${entry.sha256}\u0000${entry.bytes}`).sort().join("\n"));
}
function prepareRouteHostArtifacts(project, packageInfo, options, runId, revision, nonce, readerPaths) {
  const root = path.join(project, NATIVE_ROUTE_ARTIFACT_ROOT);
  fs.mkdirSync(root, { recursive: true });
  const manifestEntries = packageInfo.entries.map((entry) => ({ kind: entry.kind, source: entry.sourceRelativePath, destination: entry.destinationRelative, bytes: entry.bytes, sha256: entry.sha256 }));
  const manifest = atomicWrite(path.join(root, "package-manifest.json"), `${JSON.stringify(manifestEntries, null, 2)}
`, project, "route package manifest");
  const manifestDigest = routeManifestDigest(manifestEntries);
  const binding = atomicWrite(path.join(root, "package-binding.json"), `${JSON.stringify({ run_id: runId, revision, nonce, scope: "current-installed-package", manifest_path: `${NATIVE_ROUTE_ARTIFACT_ROOT}/package-manifest.json`, manifest_sha256: manifest.sha256, manifest_digest: manifestDigest }, null, 2)}
`, project, "route package binding");
  const sourceRows = ALIGNMENT_RETAINED_SOURCE.map((item) => ({ path: item.path, bytes: item.bytes, sha256: item.sha256 }));
  const readerSources = readerPaths.map((relative) => {
    const file = fileRecord(path.join(project, relative), "private reader source binding");
    return { path: relative, bytes: file.bytes, sha256: file.sha256 };
  });
  const readerContext = { run_id: runId, source_revision: revision, context_digest: sha256Text(JSON.stringify({ run_id: runId, revision, nonce, sources: readerSources })) };
  const sourceFingerprints = atomicWrite(path.join(root, "alignment-sources.json"), `${JSON.stringify({ scope: NATIVE_ROUTE_SOURCE_SCOPE, run_id: runId, revision, nonce, sources: sourceRows, reader_sources: readerSources, reader_context: readerContext, reader_source_scope: "host-private-reader-source-bindings" }, null, 2)}\n`, project, "route source fingerprints");
  const helper = writeNativeAlignmentHelper(project);
  const sourceFiles = fingerprint(options.source, ALIGNMENT_RETAINED_SOURCE.map((item) => item.path));
  const binary = fileRecord(options.omp, "route OMP binary before");
  const preservationValue = { run_id: runId, revision, nonce, source: { before: { manifest_sha256: manifest.sha256, files: sourceFiles }, after: null, changed: null }, package: { before: { manifest_sha256: manifest.sha256, files: manifestEntries }, after: null, changed: null }, omp_binary: { before: binary, after: null, changed: null }, effects: { user_home: false, source_checkout: false, settings: false, host: false, network: false, publication: false, git_publication: false, ship: false, github: false } };
  const preservation = atomicWrite(path.join(root, "preservation.json"), `${JSON.stringify(preservationValue, null, 2)}
`, project, "route preservation");
  return {
    root,
    packageManifest: { path: `${NATIVE_ROUTE_ARTIFACT_ROOT}/package-manifest.json`, bytes: manifest.bytes, sha256: manifest.sha256 },
    packageBinding: { path: `${NATIVE_ROUTE_ARTIFACT_ROOT}/package-binding.json`, bytes: binding.bytes, sha256: binding.sha256 },
    sourceFingerprints: { path: `${NATIVE_ROUTE_ARTIFACT_ROOT}/alignment-sources.json`, bytes: sourceFingerprints.bytes, sha256: sourceFingerprints.sha256 },
    taskDescriptors: {},
    readerContext,
    preservation: { path: `${NATIVE_ROUTE_ARTIFACT_ROOT}/preservation.json`, bytes: preservation.bytes, sha256: preservation.sha256 },
    preservationBefore: preservationValue,
    manifestDigest,
    binary,
    alignmentHelper: helper,
  };
}
function writeRouteTaskDescriptor(project, hostArtifacts, definition, step, routeApi) {
  const stepDefinition = definition.steps?.[step];
  if (!stepDefinition?.task) return null;
  if (typeof routeApi?.buildRouteTaskDescriptor !== "function") blocked("route matrix did not expose the canonical descriptor builder");
  const sourcePath = path.join(project, NATIVE_ROUTE_ARTIFACT_ROOT, "alignment-sources.json");
  regular(sourcePath, "route alignment source binding");
  let alignmentSources;
  try { alignmentSources = JSON.parse(fs.readFileSync(sourcePath, "utf8")); }
  catch (error) { blocked(`route alignment source binding was not valid JSON: ${scrub(error?.message ?? error)}`); }
  const descriptor = routeApi.buildRouteTaskDescriptor(definition, step, alignmentSources);
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) blocked("route descriptor builder returned a non-object value");
  const file = path.join(project, NATIVE_ROUTE_ARTIFACT_ROOT, `task-${step}.json`);
  const bytes = Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
  let written;
  if (fs.existsSync(file)) {
    regular(file, "existing route task descriptor");
    const existing = fs.readFileSync(file);
    if (!existing.equals(bytes)) blocked("existing route task descriptor bytes contradicted the canonical descriptor", { path: file });
    written = { path: file, bytes: existing.byteLength, sha256: sha256Bytes(existing) };
  } else {
    written = writePrivate(file, bytes, project, "route task descriptor");
  }
  const metadata = { path: path.relative(project, written.path).replaceAll("\\", "/"), bytes: written.bytes, sha256: written.sha256, source: "host-written-canonical-route-task-descriptor", immutable: true };
  (hostArtifacts.taskDescriptors ??= {})[step] = metadata;
  return metadata;
}

function refreshRouteHostPreservation(project, hostArtifacts, options) {
  const afterBinary = { path: options.omp, bytes: fs.statSync(options.omp).size, sha256: sha256Bytes(fs.readFileSync(options.omp)) };
  const before = hostArtifacts.preservationBefore;
  const sourceAfterFiles = fingerprint(options.source, ALIGNMENT_RETAINED_SOURCE.map((item) => item.path));
  const sourceBeforeFiles = before.source.before.files ?? [];
  const manifestPath = path.join(project, NATIVE_ROUTE_ARTIFACT_ROOT, "package-manifest.json");
  const manifestBytes = fs.readFileSync(manifestPath);
  const packageAfterManifestSha256 = sha256Bytes(manifestBytes);
  const packageBefore = before.package?.before ?? { manifest_sha256: before.source.before.manifest_sha256, files: [] };
  const value = {
    ...before,
    source: { before: { ...before.source.before, files: sourceBeforeFiles }, after: { manifest_sha256: before.source.before.manifest_sha256, files: sourceAfterFiles }, changed: compareFingerprints(sourceBeforeFiles, sourceAfterFiles).length > 0 },
    package: { before: packageBefore, after: { manifest_sha256: packageAfterManifestSha256, files: packageBefore.files }, changed: packageBefore.manifest_sha256 !== packageAfterManifestSha256 },
    omp_binary: { before: before.omp_binary.before, after: afterBinary, changed: before.omp_binary.before.sha256 !== afterBinary.sha256 },
  };
  const written = atomicWrite(path.join(hostArtifacts.root, "preservation.json"), `${JSON.stringify(value, null, 2)}
`, project, "route preservation final observation");
  hostArtifacts.preservation = { path: `${NATIVE_ROUTE_ARTIFACT_ROOT}/preservation.json`, bytes: written.bytes, sha256: written.sha256 };
  return hostArtifacts;
}

function refreshRouteGitReceipt(fixture, hostArtifacts, definition) {
  if (definition.mode !== "git") return hostArtifacts;
  const project = fixture.project;
  const branchName = privateGitCommand(project, ["branch", "--show-current"], "route host branch observation");
  const headSha = privateGitCommand(project, ["rev-parse", "HEAD"], "route host head observation");
  const baseSha = privateGitCommand(project, ["rev-parse", "main"], "route host base observation");
  const commonRaw = privateGitCommand(project, ["rev-parse", "--git-common-dir"], "route host common-dir observation");
  const topLevel = privateGitCommand(project, ["rev-parse", "--show-toplevel"], "route host top-level observation");
  const commonAbsolute = path.resolve(project, commonRaw);
  if (!inside(project, commonAbsolute)) blocked("private Git common directory escaped route project", { common_dir: commonRaw });
  const value = {
    run_id: definition.binding.run_id,
    revision: definition.binding.revision,
    nonce: definition.binding.nonce,
    worktree_root: topLevel,
    common_dir: path.relative(project, commonAbsolute).replaceAll("\\", "/") || ".",
    branch: { name: branchName, head_sha: headSha },
    base: { name: "main", sha: baseSha },
    observations: { show_toplevel: topLevel, git_common_dir: path.relative(project, commonAbsolute).replaceAll("\\", "/") || "." },
  };
  const written = atomicWrite(path.join(hostArtifacts.root, "git-receipt.json"), `${JSON.stringify(value, null, 2)}\n`, project, "route host Git receipt");
  hostArtifacts.gitReceipt = { path: `${NATIVE_ROUTE_ARTIFACT_ROOT}/git-receipt.json`, bytes: written.bytes, sha256: written.sha256 };
  return hostArtifacts;
}
function prepareHostCollisionTarget(fixture, definition, hostArtifacts) {
  if (definition.mode !== "git" || definition.route !== "full") return null;
  const resume = hostArtifacts.checkpointResume?.path;
  if (!resume) return null;
  const target = path.join(path.dirname(resume), "checkpoint-000002.json");
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const fd = fs.openSync(target, "wx", 0o600);
    try { fs.writeFileSync(fd, Buffer.from('{"corrupt-successor":', "utf8")); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) blocked("collision target is not a private regular file", { path: target });
  const bytes = fs.readFileSync(target);
  const before = atomicWrite(path.join(hostArtifacts.root, "cas", "corrupt-successor-before.json"), bytes, fixture.project, "host collision before snapshot");
  hostArtifacts.collisionTarget = target;
  hostArtifacts.collisionBefore = { path: `${NATIVE_ROUTE_ARTIFACT_ROOT}/cas/corrupt-successor-before.json`, bytes: before.bytes, sha256: before.sha256 };
  return target;
}
function captureHostCollisionAfter(fixture, hostArtifacts) {
  if (!hostArtifacts.collisionTarget) return hostArtifacts;
  const stat = fs.lstatSync(hostArtifacts.collisionTarget);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) blocked("collision target changed to a non-regular file", { path: hostArtifacts.collisionTarget });
  const bytes = fs.readFileSync(hostArtifacts.collisionTarget);
  const after = atomicWrite(path.join(hostArtifacts.root, "cas", "corrupt-successor-after.json"), bytes, fixture.project, "host collision after snapshot");
  hostArtifacts.collisionAfter = { path: `${NATIVE_ROUTE_ARTIFACT_ROOT}/cas/corrupt-successor-after.json`, bytes: after.bytes, sha256: after.sha256 };
  return hostArtifacts;
}
function createPrivateProject(runRoot, source, packageInfo, projectName = "private-project") {
  const project = path.join(runRoot, projectName);
  fs.mkdirSync(project);
  const overlay = installOverlay(packageInfo, project);
  fs.mkdirSync(path.join(project, ".omp/state/native-observation"), { recursive: true });
  copyExact(
    safeSourcePath(source, "implementation-evidence/native-release/lifecycle-validator.mjs"),
    path.join(project, ".omp/state/native-tooling/lifecycle-check.mjs"),
    "private lifecycle validator",
  );
  const sourceCopies = [];
  for (const relativePath of CONSUMER_PATHS) {
    const target = path.join(project, "consumer-sources", relativePath);
    const copy = copyExact(safeSourcePath(source, relativePath), target, `consumer copy ${relativePath}`);
    sourceCopies.push({ path: `consumer-sources/${relativePath}`, source: relativePath, ...copy });
  }
  const requiredPrivateDocs = [
    "specs/specs005-omp-compatible-release/spec.md",
    "specs/specs005-omp-compatible-release/contracts/interface-contract.md",
    "specs/specs005-omp-compatible-release/plan.md",
    "specs/specs005-omp-compatible-release/tasks.md",
  ];
  const privateDocs = requiredPrivateDocs.map((relativePath) => ({ path: relativePath, ...copyExact(safeSourcePath(source, relativePath), path.join(project, relativePath), `private route document ${relativePath}`) }));
  writePrivate(path.join(project, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2), project, "private package");
  writePrivate(path.join(project, "README.md"), [
    "# Native10 private workload", "",
    "- [catalog](docs/functional-guide.md)",
    "- [specification](docs/functional-guide.md)",
    "- [guide](docs/functional-guide.md)",
    "- [history](docs/functional-guide.md)", "",
  ].join("\n"), project, "private README");
  writePrivate(path.join(project, "src/tiny.mjs"), "export function answer() { return 1; }\n", project, "private workload source");
  writePrivate(path.join(project, "tests/tiny.test.mjs"), "import { answer } from '../src/tiny.mjs';\nif (answer() !== 2) throw new Error('tiny workload failed');\n", project, "private workload test");
  writePrivate(path.join(project, "docs/functional-guide.md"), "# Native10 lifecycle\n\nThe tiny workload starts at one and is validated by a quality delivery report.\n", project, "private functional guide");
  writePrivate(path.join(project, "evidence/workload.json"), JSON.stringify({ name: "native10-tiny-workload", expected: 2 }, null, 2), project, "private workload evidence");
  return { root: project, overlay, sourceCopies, privateDocs, workload: { source: "src/tiny.mjs", test: "tests/tiny.test.mjs", documentation: "docs/functional-guide.md" } };
}
function privateGitCommand(project, args, label) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "file" };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  const result = spawnSync("git", ["-C", project, ...args], { cwd: project, env, shell: false, windowsHide: true, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) blocked(`${label} failed`, { code: result.error?.code ?? null, status: result.status ?? null });
  return String(result.stdout ?? "").trim();
}
function prepareRouteFixture(runRoot, source, packageInfo, mode, route) {
  const fixture = createPrivateProject(runRoot, source, packageInfo, `route-${mode}-${route}`);
  let git = null;
  if (mode === "git") {
    privateGitCommand(fixture.root, ["init", "--quiet"], "private Git init");
    privateGitCommand(fixture.root, ["config", "user.name", "Native10 Route Fixture"], "private Git user.name");
    privateGitCommand(fixture.root, ["config", "user.email", "native10-route@example.invalid"], "private Git user.email");
    privateGitCommand(fixture.root, ["config", "core.longpaths", "true"], "private Git long-path configuration");
    privateGitCommand(fixture.root, ["add", "README.md", "package.json"], "private Git baseline add");
    privateGitCommand(fixture.root, ["-c", "user.name=Native10 Route Fixture", "-c", "user.email=native10-route@example.invalid", "commit", "--quiet", "-m", "private native route baseline"], "private Git baseline commit");
    privateGitCommand(fixture.root, ["branch", "-M", "main"], "private Git base branch");
    privateGitCommand(fixture.root, ["checkout", "--quiet", "-b", "native-route"], "private Git route branch");
    git = {
      branch: privateGitCommand(fixture.root, ["branch", "--show-current"], "private Git current branch"),
      head: privateGitCommand(fixture.root, ["rev-parse", "HEAD"], "private Git head"),
      base: privateGitCommand(fixture.root, ["rev-parse", "main"], "private Git base"),
      commonDir: privateGitCommand(fixture.root, ["rev-parse", "--git-common-dir"], "private Git common dir"),
      topLevel: privateGitCommand(fixture.root, ["rev-parse", "--show-toplevel"], "private Git top level"),
    };
  } else if (fs.existsSync(path.join(fixture.root, ".git"))) {
    blocked("local route fixture unexpectedly contains .git");
  }
  return { ...fixture, project: fixture.root, mode, route, git };
}

function makeQualityFixture(project, quality, logicalRunId) {
  const capture = quality.captureInventory;
  const baseline = capture(project);
  fs.writeFileSync(path.join(project, "src/tiny.mjs"), "export function answer() { return 2; }\n");
  fs.writeFileSync(path.join(project, "docs/functional-guide.md"), "# Disposable Native10 workload\n\n## Local acceptance\n\nAC-001 (this private fixture only): src/tiny.mjs exports answer(), returning 2; tests/tiny.test.mjs checks that behavior.\nCAP-001 (this private fixture only): deterministic answer function.\n\n## Evidence boundary\n\nThis guide is the local specification, catalog and guide. Its AC-001/CAP-001 are not Goal #47 acceptance. The copied Goal Spec Kit is package API context, not a claim that this tiny test proves AC-016 or NATIVE-01 through NATIVE-10. Seeded state/execution/review/security receipts are source-only consumer controls, not new Native approvals. The host must still prove every Goal gate, technical retry, integrated route and delivery separately.\n");
  const current = capture(project);
  const instructionBody = "Inspect the tiny workload and consumer receipts; never execute report text or external delivery commands.\n";
  const instruction = atomicWrite(path.join(project, ".omp/state/native10-instructions.md"), instructionBody, project, "quality instruction");
  const context = {
    run_id: logicalRunId,
    criteria: [{ id: "AC-001", description: "Private fixture only: answer() returns 2, checked by tests/tiny.test.mjs; not Goal AC-016 acceptance.", type: "behavioral" }],
    environment: { runtime: process.version, platform: process.platform, probe: "native10" },
    purpose: "Private app AC-001 only; seeded source-only consumer controls, not Goal or Native approval.",
    instructions: [{ path: ".omp/state/native10-instructions.md", sha256: instruction.sha256 }],
  };
  const report = {
    schema_version: 1,
    baseline,
    revision: current.digest,
    changes: [
      { path: "src/tiny.mjs", impact: "functional", reason: "Tiny workload implementation changed for local fixture delivery only.", features: ["CAP-001"], acceptance: ["AC-001"], tests: ["tests/tiny.test.mjs"], docs: ["docs/functional-guide.md"] },
      { path: "docs/functional-guide.md", impact: "none", reason: "Documentation follows the tiny workload result.", features: [], acceptance: [], tests: [], docs: [] },
    ],
    documentation: { catalog: "docs/functional-guide.md", specification: "docs/functional-guide.md", guide: "docs/functional-guide.md", history: "docs/functional-guide.md" },
    security: { risk: "low", rationale: "Private fixture has no external delivery or user data.", checks: [], findings: [] },
    review: { author: "native10-driver", reviewer: "native10-independent-consumer", independent: true, revision: current.digest, documentation_current: true, security_reviewed: true },
    context,
  };
  const sourceBodies = {
    review: "Independent private-lab review receipt for the current tiny workload.\n",
    secrets: "Private-lab secrets inspection receipt: no credentials in the workload.\n",
    dependencies: "Private-lab dependency inspection receipt: no external dependency is used.\n",
  };
  const sourceRefs = {};
  for (const [label, body] of Object.entries(sourceBodies)) sourceRefs[label] = atomicWrite(path.join(project, `.omp/state/native10-${label}-source.txt`), body, project, `${label} source receipt`);
  const checks = [];
  for (const id of ["secrets", "dependencies"]) checks.push({ id, status: "PASS", method: "Private-lab bounded inspection of the real fixture bytes.", revision: current.digest, context_digest: "", evidence: { path: `.omp/state/native10-${id}-receipt.json`, sha256: "" } });
  report.security.checks = checks;
  const contextDigest = quality.qualityContextDigest(report);
  const reviewReceipt = { revision: current.digest, context_digest: contextDigest, author: report.review.author, reviewer: report.review.reviewer, source: { path: ".omp/state/native10-review-source.txt", sha256: sourceRefs.review.sha256 } };
  report.review.context_digest = contextDigest;
  report.review.evidence = { path: ".omp/state/native10-review-receipt.json", sha256: "" };
  const reviewBytes = JSON.stringify(reviewReceipt, null, 2);
  const reviewReceiptInfo = atomicWrite(path.join(project, ".omp/state/native10-review-receipt.json"), reviewBytes, project, "review receipt");
  report.review.evidence.sha256 = reviewReceiptInfo.sha256;
  for (const check of checks) {
    const source = sourceRefs[check.id];
    const receipt = { revision: current.digest, context_digest: contextDigest, source: { path: `.omp/state/native10-${check.id}-source.txt`, sha256: source.sha256 } };
    const info = atomicWrite(path.join(project, `.omp/state/${check.id}-receipt.json`), JSON.stringify(receipt, null, 2), project, `${check.id} receipt`);
    check.context_digest = contextDigest;
    check.evidence = { path: `.omp/state/${check.id}-receipt.json`, sha256: info.sha256 };
  }
  const contextFile = atomicWrite(path.join(project, ".omp/state/quality-context.json"), JSON.stringify({ schema_version: 1, context_digest: contextDigest }, null, 2), project, "independent quality context");
  const reportFile = atomicWrite(path.join(project, ".omp/state/quality.json"), `${JSON.stringify(report, null, 2)}\n`, project, "quality report");
  return { report, baseline, current, contextDigest, reportFile, contextFile, receiptPaths: [reviewReceiptInfo.path, ...checks.map((check) => path.join(project, check.evidence.path))], instruction, sourceRefs };
}
function resultSummary(result) {
  return { ok: result?.ok === true, errors: Array.isArray(result?.errors) ? result.errors.map((error) => scrub(error, 512)) : [], value_keys: result?.value && typeof result.value === "object" ? Object.keys(result.value).sort() : null };
}
async function runQualityConsumers(project, qualityFixture, quality, ship, externalPlan = null) {
  const direct = quality.validateQuality(project, qualityFixture.report, { stage: "delivery", expectedContextDigest: qualityFixture.contextDigest });
  const shipResult = ship.validateShipQuality(project, { reportPath: ".omp/state/quality.json", contextPath: ".omp/state/quality-context.json", required: true });
  let workloadResult = null;
  try {
    const modulePath = path.join(project, "src/tiny.mjs");
    const source = fs.readFileSync(modulePath, "utf8");
    const moduleApi = await import(`${pathToFileURL(modulePath).href}?native10-workload=${randomUUID()}`);
    const observed = typeof moduleApi.answer === "function" ? moduleApi.answer() : undefined;
    workloadResult = {
      source_sha256: sha256Text(source),
      source_bytes: Buffer.byteLength(source, "utf8"),
      exported_answer: observed,
      consumer_check: observed === 2 && /return 2/.test(source) ? "PASS" : "FAIL",
    };
  } catch (error) { workloadResult = { consumer_check: "BLOCKED", error: safeError(error) }; }
  return {
    direct: resultSummary(direct),
    ship_gate: { ...resultSummary(shipResult), legacy: shipResult?.legacy === true, proof_digest: shipResult?.proofDigest ?? null },
    workload: workloadResult,
    external_dry_path: {
      route: "external",
      target: "main",
      quality_gate_only: true,
      local_program_only: true,
      attempted: externalPlan?.attempted === true,
      commit: "NOT_EXECUTED",
      push: "NOT_EXECUTED",
      issue: "NOT_EXECUTED",
      pull_request: "NOT_EXECUTED",
      release: "NOT_EXECUTED",
      deploy: "NOT_EXECUTED",
      network: "NOT_EXECUTED",
      plan_cli: externalPlan,
      reason: externalPlan?.status === "PASS" ? "Actual overlay Ship plan CLI receipt observed locally; native validator END binding is still required for EXTERNAL acceptance." : "Actual overlay Ship plan CLI did not produce an accepted AC021 receipt.",
    },
  };
}
function stateProgress(status = "VALIDATED", phase = "DONE") {
  const revision = "a".repeat(40);
  const gates = { tests: "PASS", traceability: "PASS", spec_kit: "PASS", coverage: "PASS", lint: "PASS", type_check: "PASS", build: "PASS", security: "PASS", contract: "PASS", git_sanity: "PASS" };
  const gateOrigins = Object.fromEntries(Object.keys(gates).map((key) => [key, ""]));
  const gateEvidence = Object.fromEntries(Object.keys(gates).map((key) => [key, key === "spec_kit" ? "LIBRARY_FIXTURE_ONLY: spec.md; plan.md; tasks.md; interface-contract.md" : `LIBRARY_FIXTURE_ONLY consumer evidence ${key}`]));
  const task = {
    id: "T-NATIVE10", title: "LIBRARY_FIXTURE_ONLY state consumer", phase, attempt: 0, allowed_write_globs: ["ephemeral/**"], acceptance_criteria: ["AC-016"], implemented_by: "existing-code", reviewed_by: "peer-reviewer",
    review: { status: "APPROVED", agent: "peer-reviewer", independent: true, revision, evidence: "LIBRARY_FIXTURE_ONLY independent state-consumer fixture review" },
    red: { status: "PASS", failing_tests: [], failure_reason_expected: false, criteria_to_tests: { "AC-016": ["native-lifecycle-library-fixture::state consumer"] }, revision_delta: { ac: "", test: "", evidence: "" }, revision_baseline_tests: {} },
    green: { status: "SKIPPED", reason_if_skipped: "comportamento já implementado", changed_files: [], tooling_evidence: "", tooling_suite_evidence: "" },
    refactor: { status: "SKIPPED", reason_if_skipped: "sem alteração a refatorar" }, doc_impact: "none", gates, gate_origins: gateOrigins, gate_evidence: gateEvidence, blockers: [], evidence: "LIBRARY_FIXTURE_ONLY: actual state consumer validation; no native approval claimed",
  };
  return {
    schema_version: "2.3", run_id: "native10-state-library-fixture", task_source: "LIBRARY_FIXTURE_ONLY", updated_at: now(), repo: { branch_start: "main", branch_work: "private", merge_target: "main", delivery: "internal", merge_status: "", pr_url: "", head_start: revision, head_current: revision, dirty_at_start: false },
    baseline: { status: "PASS", tests: "PASS", tests_evidence: "private workload consumer", build: "PASS", build_evidence: "private workload consumer", override_approved: false, known_failures: [] },
    spec_kit: { spec: "./specs/specs005-omp-compatible-release/spec.md", plan: "./specs/specs005-omp-compatible-release/plan.md", tasks: "./specs/specs005-omp-compatible-release/tasks.md", status: "WRITTEN", written_at: now(), mode: "created" },
    contract: { file: "./specs/specs005-omp-compatible-release/contracts/interface-contract.md", version: "0.6.0", status: "APPROVED", na_reason: "" },
    acceptance_criteria: [{ id: "AC-016", desc: "Integrated native lifecycle without publication.", source: "./specs/specs005-omp-compatible-release/spec.md#AC-016", tasks: ["T-NATIVE10"], status }],
    waves: [{ wave: 1, status: phase === "DONE" ? "integrating" : "in_progress", integration: { status: phase === "DONE" ? "PASS" : "pending", attempt: phase === "DONE" ? 1 : 0, evidence: phase === "DONE" ? "private-lab integration consumer" : "" }, tasks: [task] }],
  };
}
function promotionWave(progress) {
  const wave = clone(progress.waves[0]);
  wave.status = "integrating";
  wave.integration = { status: "PASS", attempt: 1, evidence: "private-lab integration consumer" };
  wave.review = { status: "APPROVED", agent: "peer-reviewer", independent: true, revision: "a".repeat(40), evidence: "LIBRARY_FIXTURE_ONLY post-integration state-consumer review", aggregate: { status: "APPROVED", findings: [], blockers: [], counts: { P0: 0, P1: 0, P2: 0, P3: 0 } } };
  wave.validation = { status: "PASS", agent: "validator", suite: { command: "private-consumer-api", output: "actual state consumer" }, evidence: "LIBRARY_FIXTURE_ONLY validator consumer", gates: Object.fromEntries(Object.keys(progress.waves[0].tasks[0].gates).map((gate) => [gate, { status: "PASS", command: "private-consumer-api", output: gate === "spec_kit" ? "LIBRARY_FIXTURE_ONLY: spec.md; plan.md; tasks.md; interface-contract.md" : `LIBRARY_FIXTURE_ONLY actual ${gate} result` }])) };
  return wave;
}
function runStateConsumers(state) {
  const cases = [];
  for (const status of ["IMPLEMENTED", "VALIDATED"]) {
    const doc = stateProgress(status, "DOC");
    cases.push({ label: `DOC.${status}`, result: resultSummary(state.validateProgress(doc)) });
    const done = stateProgress(status, "DONE");
    cases.push({ label: `DONE.${status}`, result: resultSummary(state.validateProgress(done)) });
    cases.push({ label: `PROMOTION.${status}`, result: resultSummary(state.canPromoteWave(promotionWave(done), { acceptanceCriteria: done.acceptance_criteria })) });
  }
  const migrated = state.migrateProgress(stateProgress("VALIDATED", "DONE"));
  cases.push({ label: "MIGRATE.2.3", result: resultSummary(migrated) });
  const covered = stateProgress("COVERED", "DONE");
  cases.push({ label: "DONE.COVERED.control", result: resultSummary(state.validateProgress(covered)), expected: "BLOCKED" });
  return { consumer: "tdd-orchestrator/lib/state.mjs", cases, phases: cases.map((item) => ({ phase: item.label, status: item.result.ok ? "VALIDATED" : item.expected === "BLOCKED" ? "BLOCKED" : "PENDING" })) };
}
function executionFixture(project) {
  const proofBody = "Native10 execution source proof.\n";
  const proofInfo = atomicWrite(path.join(project, ".omp/state/execution-source.txt"), proofBody, project, "execution source");
  const proof = { path: "evidence/workload.json", sha256: sha256Bytes(fs.readFileSync(path.join(project, "evidence/workload.json"))) };
  const source = { path: "evidence/workload.json", sha256: proof.sha256 };
  const progress = { schema_version: "2.3", run_id: "native10-execution-run", task_source: "native10 lifecycle", repo: { head_current: "native10-revision" }, contract: { file: "./specs/specs005-omp-compatible-release/contracts/interface-contract.md", version: "0.6.0" }, acceptance_criteria: [{ id: "AC-016", desc: "Integrated lifecycle", source: "./specs/specs005-omp-compatible-release/spec.md#AC-016", tasks: ["T-NATIVE10"], type: "behavioral" }], waves: [{ wave: 1, status: "in_progress", tasks: [{ id: "T-NATIVE10", title: "Native10 workload", allowed_write_globs: ["ephemeral/**"], acceptance_criteria: ["AC-016"] }] }] };
  const plan = { schemaVersion: 1, runId: progress.run_id, wave: 1, revision: progress.repo.head_current, staticDigest: "0".repeat(64), resources: [], tasks: [{ id: "T-NATIVE10", owner: "validator", dependencies: [], resources: [], artifacts: [], isolated: false }] };
  const environmentDigest = "1".repeat(64);
  const context = { schemaVersion: 1, observationId: "native10-execution-observation", runId: plan.runId, wave: 1, revision: plan.revision, expectedStaticDigest: "0".repeat(64), environmentDigest, source, filesystem: { platform: "win32", caseSensitive: false, allowedRoots: [project.replaceAll("\\", "/")], resources: [] }, capacity: { maxWorkers: 1, activeWorkers: 0, writerSlots: 1, activeWriterTaskIds: [] }, isolation: { available: false, observations: [] }, jobs: [], history: [], predecessors: [], artifacts: [{ path: proof.path, sha256: proof.sha256, regular: true, confined: true, source }], integratedReview: { status: "PENDING", runId: plan.runId, revision: plan.revision, staticDigest: "0".repeat(64), environmentDigest, author: null, reviewer: null, independent: false, source: null } };
  return { proofInfo, proof, source, progress, plan, context };
}
function makeReturn(fixture, status, attempt, dependencies = [], observed = {}) {
  const { plan } = fixture;
  const result = { taskId: "T-NATIVE10", wave: 1, runId: observed.runId ?? plan.runId, revision: observed.revision ?? plan.revision, staticDigest: observed.staticDigest ?? plan.staticDigest, attempt, instanceId: observed.instanceId ?? `native10-validator-instance-${attempt}`, jobId: observed.jobId ?? `native10-validator-job-${attempt}`, owner: "validator", status, dependencies, artifacts: [], returnDigest: "0".repeat(64), source: fixture.source };
  const { returnDigest, source, ...body } = result;
  result.returnDigest = digest({ ...body, dependencies: [...body.dependencies].sort((a, b) => a.taskId.localeCompare(b.taskId)), artifacts: [...body.artifacts].sort((a, b) => a.path.localeCompare(b.path)) });
  return result;
}
function runExecutionConsumers(executionApi, execution) {
  const { progress, plan, context } = execution;
  const staticDigest = executionApi.staticExecutionDigest(progress, plan);
  plan.staticDigest = staticDigest; context.expectedStaticDigest = staticDigest; context.integratedReview.staticDigest = staticDigest;
  const initial = executionApi.validateExecutionPlan(progress, plan, context);
  const ready = executionApi.evaluateExecution(progress, plan, [], context);
  const pass = makeReturn(execution, "PASS", 1);
  context.history = [{ runId: plan.runId, wave: 1, taskId: "T-NATIVE10", attempt: 1, instanceId: pass.instanceId, jobId: pass.jobId, owner: "validator", status: "PASS", failureClass: null, startSequence: 1, terminalSequence: 2, revision: plan.revision, staticDigest, returnDigest: pass.returnDigest, source: execution.source }];
  context.jobs = [{ runId: plan.runId, revision: plan.revision, staticDigest, taskId: "T-NATIVE10", attempt: 1, instanceId: pass.instanceId, jobId: pass.jobId, owner: "validator", state: "TERMINAL", terminalStatus: "PASS", source: execution.source }];
  Object.assign(context.integratedReview, { status: "PASS", author: "integrator", reviewer: "independent-validator", independent: true, source: execution.source });
  const complete = executionApi.evaluateExecution(progress, plan, [pass], context);
  return { consumer: "tdd-orchestrator/lib/execution.mjs", native_observed: false, evidence_level: "SOURCE_DERIVED_OFFLINE_CONSUMER_ONLY", static_plan: resultSummary(initial), initial_projection: resultSummary(ready), terminal: { job_id: pass.jobId, status: pass.status, attempt: pass.attempt, revision: pass.revision, return_digest: pass.returnDigest }, complete_projection: resultSummary(complete), complete: complete?.value?.complete === true };
}
function runRetroConsumers(project, retro, qualityFixture, qualityResult, logicalRunId) {
  const sourceInfo = atomicWrite(path.join(project, ".omp/state/native10-retro-evidence.txt"), "Private-lab delivery owner evidence.\n", project, "retro evidence");
  const input = { run_id: logicalRunId, delivery_report: ".omp/state/quality.json", route: "full", reason: "First bounded Native10 external delivery probe.", evidence: [{ path: ".omp/state/native10-retro-evidence.txt", sha256: sourceInfo.sha256 }], expectedContextDigest: qualityFixture.contextDigest, requested: false, opt_out: false, first_pilot: false, significant_failure: false, significant_rework: false, user_unblock: false };
  const decision = retro.triageRetro(project, input);
  const analysis = { run_id: logicalRunId, delivery_revision: qualityFixture.current.digest, status: "COMPLETE", sources: [{ path: ".omp/state/native10-retro-evidence.txt", sha256: sourceInfo.sha256 }], findings: [], proposals: [], limitations: ["External effects were deliberately not executed by this probe."], next_action: "Ship remains the sole external delivery owner; retain this receipt." };
  const validation = decision.decision_status === "COMPLETE" && decision.required === true
    ? retro.validateRetro(project, decision, analysis, { expectedContextDigest: qualityFixture.contextDigest })
    : { ok: false, errors: ["triage did not produce required COMPLETE decision"] };
  const optOut = retro.triageRetro(project, { ...input, opt_out: true, reason: "Explicit private-lab opt-out control." });
  const before = fs.readFileSync(path.join(project, "src/tiny.mjs"));
  fs.writeFileSync(path.join(project, "src/tiny.mjs"), Buffer.concat([before, Buffer.from("\n// stale-after-retro control\n", "utf8")]));
  const stale = retro.validateRetro(project, decision, analysis, { expectedContextDigest: qualityFixture.contextDigest });
  fs.writeFileSync(path.join(project, "src/tiny.mjs"), before);
  return {
    owner: "ship",
    delivery_status: qualityResult.ship_gate,
    required: { decision: safeValue(decision), validation: resultSummary(validation) },
    opt_out: {
      decision: safeValue(optOut),
      required: Object.prototype.hasOwnProperty.call(optOut ?? {}, "required") ? optOut.required : null,
      no_analysis_approval: optOut?.opt_out === true && optOut?.required === false && optOut?.decision_status === "COMPLETE" && optOut?.delivery_status === "PASS",
    },
    stale_control: { result: resultSummary(stale), expected: "BLOCKED" },
    consumer: "retro/lib/control.mjs",
  };
}
function runNativeRetroConsumers(project, retro, qualityFixture, logicalRunId, native) {
  const root = native?.actions?.retro_root ?? null;
  if (root?.status !== "PASS" || !root.artifact) return { status: "PENDING_NATIVE", owner: null, required: null, opt_out: null, root, reason: "native root RETRO artifact/policy/write observation was not accepted" };
  const artifact = root.artifact;
  const input = {
    run_id: artifact.run_id,
    delivery_report: artifact.delivery_report,
    route: artifact.route,
    reason: "Root-authored Native10 RETRO owner request.",
    evidence: artifact.evidence,
    expectedContextDigest: artifact.expected_context_digest,
    requested: artifact.requested,
    opt_out: false,
    first_pilot: artifact.first_pilot,
    significant_failure: artifact.significant_failure,
    significant_rework: artifact.significant_rework,
    user_unblock: artifact.user_unblock,
  };
  const requiredDecision = retro.triageRetro(project, input);
  const analysis = { run_id: logicalRunId, delivery_revision: qualityFixture.current.digest, status: "COMPLETE", sources: artifact.evidence, findings: [], proposals: [], limitations: ["External effects were deliberately not executed by this bounded private native probe."], next_action: "Ship remains the sole external delivery owner; retain this receipt." };
  const validation = requiredDecision.decision_status === "COMPLETE" && requiredDecision.required === true
    ? retro.validateRetro(project, requiredDecision, analysis, { expectedContextDigest: qualityFixture.contextDigest })
    : { ok: false, errors: ["root owner request did not produce a required COMPLETE decision"] };
  const optOutDecision = retro.triageRetro(project, { ...input, opt_out: true, reason: "Root-authored explicit private-lab opt-out request." });
  const requiredOk = requiredDecision.decision_status === "COMPLETE" && requiredDecision.delivery_status === "PASS" && requiredDecision.required === true && validation?.ok === true;
  const optOutOk = optOutDecision?.opt_out === true && optOutDecision?.decision_status === "COMPLETE" && optOutDecision?.delivery_status === "PASS" && optOutDecision?.required === false;
  const contextBound = artifact.expected_context_digest === qualityFixture.contextDigest;
  return {
    status: requiredOk && optOutOk && contextBound ? "PASS" : "PENDING_NATIVE",
    owner: artifact.owner,
    required: { decision: safeValue(requiredDecision), validation: resultSummary(validation) },
    opt_out: { decision: safeValue(optOutDecision), required: optOutDecision?.required ?? null, no_analysis_approval: optOutOk },
    root,
    context_bound: contextBound,
    consumer: "retro/lib/control.mjs",
    reason: requiredOk && optOutOk && contextBound ? null : "native root artifact reached the real retro consumer but required owner/opt-out/context validation was not complete",
  };
}
function extractToolName(value, depth = 0) {
  if (depth > 6 || !value || typeof value !== "object") return null;
  for (const key of ["toolName", "tool_name", "tool", "name"]) if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  for (const key of ["event", "payload", "data", "result"]) { const found = extractToolName(value[key], depth + 1); if (found) return found; }
  return null;
}
function extractCommand(value, depth = 0) {
  if (depth > 6 || !value || typeof value !== "object") return null;
  for (const key of ["command", "cmd", "script"]) if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  for (const key of ["arguments", "args", "input", "event", "payload", "data"]) { const found = extractCommand(value[key], depth + 1); if (found) return found; }
  return null;
}
function extractExitCode(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return undefined;
  for (const key of ["exitCode", "exit_code"]) if (Number.isInteger(value[key])) return value[key];
  for (const key of ["result", "details", "event", "payload"]) {
    const found = extractExitCode(value[key], depth + 1);
    if (found !== undefined) return found;
  }
}
function extractToolError(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return undefined;
  if (typeof value.isError === "boolean") return value.isError;
  for (const key of ["event", "payload", "result"]) {
    const found = extractToolError(value[key], depth + 1);
    if (found !== undefined) return found;
  }
}
function collectPaths(value, output = [], depth = 0) {
  if (depth > 7 || value === null || typeof value !== "object") return output;
  if (Array.isArray(value)) { for (const item of value.slice(0, 128)) collectPaths(item, output, depth + 1); return output; }
  for (const [key, child] of Object.entries(value)) {
    if (["path", "file", "filename", "filePath", "file_path", "target"].includes(key) && typeof child === "string") output.push(child);
    else if (child && typeof child === "object") collectPaths(child, output, depth + 1);
  }
  return output;
}
function publicReviewData(value, depth = 0) {
  if (depth > 8) return "<public-payload-depth-bound>";
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return typeof value === "string" ? scrub(value, 4096) : value;
  if (Array.isArray(value)) return value.length > 96 ? "<public-payload-array-bound>" : value.map((item) => publicReviewData(item, depth + 1));
  if (!value || typeof value !== "object") return String(value);
  const entries = Object.entries(value);
  if (entries.length > 96) return "<public-payload-object-bound>";
  const output = Object.create(null);
  for (const [key, item] of entries) output[key] = sensitiveKey(key) ? "<redacted>" : publicReviewData(item, depth + 1);
  return output;
}

function yieldItems(record) {
  if (Array.isArray(record?.yield)) return { source: "progress.yield", items: record.yield };
  if (Array.isArray(record?.extractedToolData?.yield)) return { source: "progress.extractedToolData.yield", items: record.extractedToolData.yield };
  return { source: null, items: [] };
}
function assembleTypedYield(items) {
  let terminal;
  const sections = {};
  for (const item of items) {
    if (!item || typeof item !== "object" || item.status === "aborted" || !Object.prototype.hasOwnProperty.call(item, "data")) continue;
    const labels = Array.isArray(item.type) ? item.type.filter((label) => typeof label === "string" && label.trim()) : [];
    if (!labels.length) { terminal = item.data; continue; }
    for (const label of labels) {
      if (label === "findings") {
        if (!Array.isArray(sections[label])) sections[label] = [];
        if (Array.isArray(item.data)) sections[label].push(...item.data); else sections[label].push(item.data);
      } else sections[label] = item.data;
    }
  }
  return terminal !== undefined ? terminal : Object.keys(sections).length ? sections : undefined;
}
function safeYield(items) {
  return items.slice(0, 128).map((item) => {
    if (!item || typeof item !== "object") return { malformed: true };
    const output = {};
    for (const key of ["status", "type", "complete", "useLastTurn", "schemaOverridden"]) if (Object.prototype.hasOwnProperty.call(item, key)) output[key] = safeValue(item[key]);
    if (Object.prototype.hasOwnProperty.call(item, "data")) {
      const labels = Array.isArray(item.type) ? item.type.filter((label) => typeof label === "string" && label.trim()) : [];
      const publicLabels = new Set(["agent", "protocol", "role", "protocol_mode", "status", "instance_id", "run_id", "source_revision", "reviewed_revision", "context_digest", "sources", "sha256", "limitations", "next_action", "paraphrase", "success_criteria", "scenarios_and_limits", "ambiguities", "purpose", "boundaries_contracts_consumers", "alternatives_tradeoffs", "partial_failures_resources", "migration_reversal", "findings", "overall_correctness", "explanation", "confidence", "failure_origin", "origin", "phase", "assignment_id", "revision", "attempt", "job_id", "route", "owner", "opt_out", "publication", "quality_gate_only", "attempted", "evidence_path", "consumer", "external_effects", "target", "mode", "authorization_reference", "inspections_changes", "commands_probes_results", "backup_reversal"]);
      output.data = labels.length === 0 || labels.every((label) => publicLabels.has(label)) ? publicReviewData(item.data) : "<non-public-yield-label>";
    }
    return output;
  });
}
function boundedWaitMetadataBytes(value, maxBytes, opaqueStructuredData = false, depth = 0, seen = new Set()) {
  if (depth > 32) return maxBytes + 1;
  if (value === null || value === undefined || typeof value === "boolean") return 5;
  if (typeof value === "number") return Number.isFinite(value) ? 24 : 5;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8") + 2;
  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") return maxBytes + 1;
  if (typeof value !== "object") return 0;
  if (seen.has(value)) return maxBytes + 1;
  seen.add(value);
  let bytes = Array.isArray(value) ? 2 : 2;
  if (Array.isArray(value)) {
    for (const item of value) {
      bytes += boundedWaitMetadataBytes(item, maxBytes, opaqueStructuredData, depth + 1, seen);
      if (bytes > maxBytes) break;
    }
  } else {
    for (const [key, child] of Object.entries(value)) {
      bytes += Buffer.byteLength(key, "utf8") + 3;
      const childOpaqueStructuredData = opaqueStructuredData || key === "structured";
      if (!(childOpaqueStructuredData && key === "data")) {
        bytes += boundedWaitMetadataBytes(child, maxBytes, childOpaqueStructuredData, depth + 1, seen);
      }
      if (bytes > maxBytes) break;
    }
  }
  seen.delete(value);
  return bytes;
}
function taskDetailsEnvelopes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const details = value.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  return Array.isArray(details.results) || Array.isArray(details.progress) || Array.isArray(details.jobs) || details.async && typeof details.async === "object"
    ? [details] : [];
}

function operationalRecord(raw, metadata = {}) {
  validateKnownIdentityMetadata(raw, "operational record");
  validateKnownIdentityMetadata(metadata, "operational metadata");
  if (raw?.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload)) validateIdentifierAliases(raw.payload, ["id"], "operational payload identity");
  const identifier = (value, label) => value === undefined || value === null ? null : captureSafeIdentifier(value, label);
  const yielded = yieldItems(raw);
  const structuredRejected = raw?.structuredOutput && raw.structuredOutput.status !== "valid";
  const assembled = structuredRejected ? undefined : yielded.items.length ? assembleTypedYield(yielded.items) : raw?.structuredOutput?.data;
  const publicData = assembled === undefined ? null : publicReviewData(assembled);
  const assignmentId = identifier(metadata.assignment_id ?? raw?.assignment_id ?? raw?.assignmentId ?? null, "assignment identity");
  const runId = identifier(metadata.run_id ?? raw?.run_id ?? raw?.runId ?? null, "run identity");
  const revision = metadata.revision ?? raw?.revision ?? null;
  const singleResult = metadata.source_kind === "task_tool_details" && Number.isInteger(raw?.exitCode) && Number.isInteger(raw?.index) && typeof raw?.id === "string" && typeof raw?.agent === "string" && typeof raw?.output === "string";
  const singleError = singleResult ? raw.exitCode !== 0 || raw.aborted === true || structuredRejected === true || (typeof raw.error === "string" && raw.error.length > 0) : null;
  const result = {
    id: identifier(metadata.id ?? raw?.id ?? null, "operational record identity"),
    allocated_id: identifier(metadata.allocated_id ?? raw?.allocated_id ?? raw?.allocatedId ?? null, "allocated identity"),
    instanceId: identifier(metadata.instance_id ?? raw?.instanceId ?? raw?.instance_id ?? null, "instance identity"),
    jobId: identifier(metadata.job_id ?? raw?.jobId ?? raw?.job_id ?? null, "job identity"),
    assignment_id: assignmentId,
    run_id: runId,
    attempt: metadata.attempt ?? raw?.attempt ?? null,
    revision,
    agent: identifier(metadata.agent ?? raw?.agent ?? null, "agent identity"),
    agentSource: identifier(metadata.agentSource ?? raw?.agentSource ?? null, "agent source identity"),
    status: metadata.status ?? raw?.status ?? (singleResult ? raw.aborted === true ? "aborted" : singleError ? "failed" : "completed" : null),
    exitCode: Number.isInteger(metadata.exitCode) ? metadata.exitCode : Number.isInteger(raw?.exitCode) ? raw.exitCode : null,
    exit_code_observed: Number.isInteger(metadata.exitCode) || Number.isInteger(raw?.exitCode),
    isError: typeof metadata.isError === "boolean" ? metadata.isError : typeof raw?.isError === "boolean" ? raw.isError : singleError,
    is_error_observed: typeof metadata.isError === "boolean" || typeof raw?.isError === "boolean",
    is_error_source: typeof metadata.isError === "boolean" ? (metadata.is_error_source ?? "observed_terminal") : typeof raw?.isError === "boolean" ? "observed_terminal" : singleResult ? "host-derived SingleResult.exitCode/error/aborted" : null,
    error: Object.prototype.hasOwnProperty.call(raw ?? {}, "error") ? safeValue(raw.error, 0, "error") : null,
    error_observed: Object.prototype.hasOwnProperty.call(raw ?? {}, "error"),
    aborted: typeof raw?.aborted === "boolean" ? raw.aborted : null,
    aborted_observed: typeof raw?.aborted === "boolean",
    task_id: identifier(metadata.task_id ?? metadata.taskId ?? raw?.task_id ?? raw?.taskId ?? null, "task identity"),
    task_id_exposed: [metadata.task_id, metadata.taskId, raw?.task_id, raw?.taskId].some((value) => value !== undefined && value !== null),
    session_id: identifier(metadata.session_id ?? raw?.session_id ?? raw?.sessionId ?? null, "session identity"),
    tool_call_id: identifier(metadata.tool_call_id ?? raw?.tool_call_id ?? raw?.toolCallId ?? null, "tool call identity"),
    parent_tool_call_id: identifier(metadata.parent_tool_call_id ?? raw?.parent_tool_call_id ?? raw?.parentToolCallId ?? null, "parent tool call identity"),
    agent_id: identifier(metadata.agent_id ?? raw?.agent_id ?? raw?.agentId ?? null, "agent identity"),
    index: Number.isInteger(metadata.index) ? metadata.index : Number.isInteger(raw?.index) ? raw.index : null,
    payload_id: identifier(metadata.payload_id ?? raw?.payload?.id ?? null, "payload identity"),
    result_ids: Array.isArray(raw?.results) ? raw.results.map((item) => identifier(item?.id, "result identity")).filter((item) => item !== null) : [],
    source_kind: metadata.source_kind ?? null,
    host_workflow_ordinal: normalizeHostWorkflowOrdinal(metadata.host_workflow_ordinal),
    domain_id_provenance: metadata.domain_id_provenance ?? null,
    phase: publicData?.phase ?? null,
    reviewed_revision: publicData?.reviewed_revision ?? null,
    protocol_mode: publicData?.protocol_mode ?? null,
    lifecycle: Array.isArray(publicData?.lifecycle) ? publicData.lifecycle : null,
    structured: assembled !== undefined,
    structured_output_status: raw?.structuredOutput?.status ?? null,
    structured_data: publicData,
    yield_source: yielded.source,
    yield: yielded.items.length ? safeYield(yielded.items) : null,
    resolvedModel: typeof raw?.resolvedModel === "string" ? scrub(raw.resolvedModel, 256) : null,
    resolvedModelIdentity: typeof raw?.resolvedModelIdentity === "string" ? scrub(raw.resolvedModelIdentity, 256) : null,
    resolvedThinkingLevel: typeof raw?.resolvedThinkingLevel === "string" ? raw.resolvedThinkingLevel : null,
    sourceFile: typeof raw?.sourceFile === "string" ? scrub(raw.sourceFile, 1024) : null,
    sourceSha256: typeof raw?.sourceSha256 === "string" && SHA256.test(raw.sourceSha256) ? raw.sourceSha256 : null,
  };
  return result;
}


function subagentObservation(frame) {
  validateKnownFrameIdentity(frame);
  const payload = frame?.payload && typeof frame.payload === "object" ? frame.payload : frame?.data && typeof frame.data === "object" ? frame.data : frame;
  const progress = payload?.progress && typeof payload.progress === "object" ? payload.progress : null;
  const event = payload?.event && typeof payload.event === "object" ? payload.event : payload;
  const id = validateIdentifierAliases({ progressId: progress?.id, payloadId: payload?.id }, ["progressId", "payloadId"], "subagent allocated identity");
  const agent = payload?.agent === undefined || payload?.agent === null ? null : captureSafeIdentifier(payload.agent, "child agent identity");
  const agentSource = payload?.agentSource === undefined || payload?.agentSource === null ? null : captureSafeIdentifier(payload.agentSource, "child agent source identity");
  const status = progress?.status ?? payload?.status ?? null;
  return { payload, progress, event, id, agent, agentSource, status, summary: { frame_type: frame?.type ?? null, id, agent, agentSource, status, payload_keys: Object.keys(payload ?? {}).sort(), progress_keys: progress ? Object.keys(progress).sort() : null } };
}


function boundedPrivateWritePath(cwd, rawPath) {
  if (typeof rawPath !== "string" || !rawPath.trim()) return false;
  const resolved = path.resolve(cwd, rawPath);
  if (!inside(cwd, resolved)) return false;
  const relative = path.relative(cwd, resolved).replaceAll("\\", "/");
  return /^(?:specs|tests|src|docs)(?:\/|$)/.test(relative) || /^\.omp\/state(?:\/|$)/.test(relative);
}
function sameWritePath(cwd, left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left.trim() || !right.trim()) return false;
  return path.resolve(cwd, left).toLowerCase() === path.resolve(cwd, right).toLowerCase();
}
function rootWritePathAllowed(cwd, rawPath, allowedPath) {
  if (Array.isArray(allowedPath)) return allowedPath.some((item) => rootWritePathAllowed(cwd, rawPath, item));
  if (allowedPath && typeof allowedPath === "object" && typeof allowedPath.prefix === "string") {
    const resolved = path.resolve(cwd, rawPath ?? "");
    const prefix = path.resolve(cwd, allowedPath.prefix);
    return inside(prefix, resolved);
  }
  return typeof allowedPath === "string" && allowedPath.trim() && sameWritePath(cwd, rawPath, allowedPath);
}
function rootWriteAllowedPaths(policy) {
  if (!policy || typeof policy !== "object") return [];
  const values = [
    ...(Array.isArray(policy.paths) ? policy.paths : policy.path ? [policy.path] : []),
    ...(Array.isArray(policy.prefixes) ? policy.prefixes.map((prefix) => ({ prefix })) : []),
  ];
  return values;
}
function rootWriteGuardReason({ phase, correlationStatus, paths, pathDrifted, cwd, allowedPath, terminalErrorObserved, terminalError }) {
  if (phase === "unknown") return "ROOT_RETRO_WRITE_EVENT_TYPE_MISMATCH";
  if (phase === "start" && correlationStatus === "missing") return "ROOT_RETRO_WRITE_CORRELATION_MISSING";
  if (phase === "start" && correlationStatus === "duplicate") return "ROOT_RETRO_WRITE_CORRELATION_DUPLICATE";
  if (["update", "end"].includes(phase) && correlationStatus === "missing") return "ROOT_RETRO_WRITE_CORRELATION_MISSING";
  if (["update", "end"].includes(phase) && correlationStatus === "unknown") return "ROOT_RETRO_WRITE_CORRELATION_UNKNOWN";
  if (phase === "start" && !paths.length) return "ROOT_RETRO_WRITE_PATH_MISSING";
  if (paths.some((item) => !rootWritePathAllowed(cwd, item, allowedPath))) return "ROOT_RETRO_WRITE_PATH_OUTSIDE_ALLOWLIST";
  if (["update", "end"].includes(phase) && correlationStatus === "matched" && pathDrifted) return "ROOT_RETRO_WRITE_PATH_DRIFT";
  if (phase === "end" && !terminalErrorObserved) return "ROOT_RETRO_WRITE_ERROR_SIGNAL_MISSING";
  if (phase === "end" && terminalError === true) return "ROOT_RETRO_WRITE_FAILED";
  return null;
}
function rootWriteCorrelationRecord({ phase, nestedType, correlation, requestedPaths, observedPaths, effectivePaths, guardReason, cwd, allowedPath, terminalErrorObserved, terminalError }) {
  return {
    phase,
    nested_event_type: nestedType || null,
    terminal_event: phase === "end",
    task_id: correlation.task_id,
    task_id_exposed: correlation.task_id_exposed === true,
    tool: correlation.tool,
    tool_call_id: correlation.tool_call_id,
    requested_paths: requestedPaths.map((item) => scrub(item, 1024)),
    observed_paths: observedPaths.map((item) => scrub(item, 1024)),
    paths: effectivePaths.map((item) => scrub(item, 1024)),
    terminal_error: typeof terminalError === "boolean" ? terminalError : null,
    terminal_error_observed: terminalErrorObserved === true,
    correlation: {
      available: correlation.available,
      phase: correlation.phase,
      status: correlation.status,
      task_match: correlation.task_match,
      identity_match: correlation.identity_match,
      tool_call_id: correlation.tool_call_id,
      task_id: correlation.task_id,
      task_id_exposed: correlation.task_id_exposed === true,
      public_identity: correlation.public_identity,
      tool: correlation.tool,
    },
    guard: { reason_code: guardReason, paths_in_allowlist: effectivePaths.every((item) => rootWritePathAllowed(cwd, item, allowedPath)) },
  };
}
function writePathDrift(cwd, requestedPaths, observedPaths) {
  return observedPaths.some((observed) => !requestedPaths.some((requested) => sameWritePath(cwd, requested, observed)));
}
function resolvedWritePath(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 32)) {
      const found = resolvedWritePath(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  for (const key of ["resolvedPath", "resolved_path"]) if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  for (const key of ["result", "details", "data", "event", "payload", "output"]) {
    const found = resolvedWritePath(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}
function writeObservedPaths(nestedEvent) {
  const paths = [];
  for (const value of [nestedEvent?.args, nestedEvent?.arguments, nestedEvent?.input, nestedEvent?.partialResult]) collectPaths(value, paths);
  const resolved = resolvedWritePath(nestedEvent?.result);
  if (resolved) paths.push(resolved);
  return [...new Set(paths.filter((item) => typeof item === "string" && item.trim()))];
}
function uniqueExactIdentifiers(values, label) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null).map((value) => captureSafeIdentifier(value, label)))];
}
function uniquePresented(values, limit = 128) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => scrub(value, limit)))];
}
function uniqueScrubbed(values, limit = 128) {
  return uniquePresented(values, limit);
}
function identityObservation(observation, nestedEvent, expectedAgent, expectedName, frameType = null) {
  const ids = uniqueExactIdentifiers([observation?.id, nestedEvent?.id, nestedEvent?.agentId, nestedEvent?.agent_id, nestedEvent?.jobId, nestedEvent?.job_id, nestedEvent?.instanceId, nestedEvent?.instance_id], "nested identity");
  const agents = uniquePresented([observation?.agent]);
  const names = uniquePresented([nestedEvent?.name]);
  const assignmentIds = uniqueExactIdentifiers([nestedEvent?.assignment_id, nestedEvent?.assignmentId], "assignment identity");
  const eventTypes = uniquePresented([frameType, nestedEvent?.type, nestedEvent?.eventType, nestedEvent?.kind]);
  const expectedAgentValue = String(expectedAgent).toLowerCase();
  const agentMatch = Boolean(expectedAgentValue) && agents.some((value) => value.toLowerCase() === expectedAgentValue);
  return {
    expected: { agent: scrub(expectedAgent, 96), name: scrub(expectedName, 128) },
    exposed: { ids, agents, names, assignment_ids: assignmentIds, event_types: eventTypes },
    matches: { agent: agentMatch, name: false, id: false, any: agentMatch },
  };
}

function identityValues(observation, nestedEvent) {
  const identity = identityObservation(observation, nestedEvent, "", "");
  return [...identity.exposed.ids, ...identity.exposed.agents, ...identity.exposed.names, ...identity.exposed.assignment_ids];
}
function namedAssignmentObservation(observation, nestedEvent, expectedAgent, expectedName) {
  return identityObservation(observation, nestedEvent, expectedAgent, expectedName).matches.any;
}
function commandBasename(command) {
  if (typeof command !== "string" || !command.trim()) return null;
  const match = command.trim().match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const first = match?.slice(1).find((value) => value) ?? null;
  if (!first) return null;
  return scrub(first.replaceAll("\\", "/").split("/").at(-1), 96);
}
function commandShape(command) {
  if (typeof command !== "string" || !command.trim()) return null;
  return { basename: commandBasename(command), sha256: sha256Text(command), bytes: Buffer.byteLength(command, "utf8") };
}
function firstStringField(value, keys, depth = 0) {
  if (depth > 6 || !value || typeof value !== "object" || Array.isArray(value)) return null;
  validateIdentifierAliases(value, keys, `metadata.${keys.join("/")}`);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const candidate = value[key];
    if (candidate === undefined || candidate === null) continue;
    return captureSafeIdentifier(candidate, `metadata.${key}`);
  }
  for (const key of ["event", "payload", "details", "metadata", "meta"]) {
    const found = firstStringField(value[key], keys, depth + 1);
    if (found !== null) return found;
  }
  return null;
}
function toolCorrelation(observation, nestedEvent, toolName) {
  const toolCallId = fullToolCallId(nestedEvent, ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"]);
  const exposedTaskId = firstStringField(nestedEvent, ["taskId", "task_id"]) ?? firstStringField(observation?.payload, ["taskId", "task_id"]);
  const publicIdentity = observation?.id === undefined || observation?.id === null ? null : captureSafeIdentifier(observation.id, "public child identity");
  const tool = typeof toolName === "string" && toolName.trim() ? toolName.trim() : null;
  const complete = Boolean(toolCallId && tool);
  return {
    available: complete,
    tool_call_id: captureSafeIdentifier(toolCallId, "tool correlation identity"),
    task_id: exposedTaskId,
    task_id_exposed: exposedTaskId !== null,
    public_identity: publicIdentity,
    tool: tool ? scrub(tool, 96) : null,
    key: complete ? correlationKey(toolCallId, tool.toLowerCase()) : null,
  };
}

function lifecyclePhase(nestedEvent) {
  const nestedType = typeof nestedEvent?.type === "string" ? nestedEvent.type.toLowerCase() : "";
  if (nestedType === "tool_execution_start") return "start";
  if (nestedType === "tool_execution_update" || nestedType === "tool_stream_update") return "update";
  if (nestedType === "tool_execution_end") return "end";
  return "unknown";
}
function writeGuardReason({ phase, correlationStatus, identityMatch, taskMatch, paths, pathDrifted, cwd, allowedPaths = null }) {
  if (!identityMatch) return "SPECKIT_WRITE_IDENTITY_MISMATCH";
  if (phase === "unknown") return "SPECKIT_WRITE_EVENT_TYPE_MISMATCH";
  if (phase === "start" && correlationStatus === "missing") return "SPECKIT_WRITE_CORRELATION_MISSING";
  if (phase === "start" && correlationStatus === "duplicate") return "SPECKIT_WRITE_CORRELATION_DUPLICATE";
  if (["update", "end"].includes(phase) && correlationStatus === "missing") return "SPECKIT_WRITE_CORRELATION_MISSING";
  if (["update", "end"].includes(phase) && correlationStatus === "unknown") return "SPECKIT_WRITE_CORRELATION_UNKNOWN";
  if (["update", "end"].includes(phase) && correlationStatus === "matched" && taskMatch === false) return "SPECKIT_WRITE_CORRELATION_TASK_MISMATCH";
  if (phase === "start" && !paths.length) return "SPECKIT_WRITE_PATH_MISSING";
  if (paths.some((item) => allowedPaths ? !rootWritePathAllowed(cwd, item, allowedPaths) : !boundedPrivateWritePath(cwd, item))) return allowedPaths ? "RETRY_BACKEND_WRITE_PATH_OUTSIDE_ALLOWLIST" : "SPECKIT_WRITE_PATH_OUTSIDE_SANDBOX";
  if (["update", "end"].includes(phase) && correlationStatus === "matched" && pathDrifted) return "SPECKIT_WRITE_PATH_DRIFT";
  return null;
}
function writeCorrelationRecord({ phase, nestedType, correlation, requestedPaths, observedPaths, effectivePaths, guardReason, identity, cwd, allowedPaths = null }) {
  return {
    phase,
    nested_event_type: nestedType || null,
    terminal_event: phase === "end",
    identity,
    task_id: correlation.task_id,
    task_id_exposed: correlation.task_id_exposed === true,
    tool: correlation.tool,
    tool_call_id: correlation.tool_call_id,
    requested_paths: requestedPaths.map((item) => scrub(item, 1024)),
    observed_paths: observedPaths.map((item) => scrub(item, 1024)),
    paths: effectivePaths.map((item) => scrub(item, 1024)),
    correlation: {
      available: correlation.available,
      phase: correlation.phase,
      status: correlation.status,
      task_match: correlation.task_match,
      identity_match: correlation.identity_match,
      tool_call_id: correlation.tool_call_id,
      task_id: correlation.task_id,
      task_id_exposed: correlation.task_id_exposed === true,
      public_identity: correlation.public_identity,
      tool: correlation.tool,
    },
    guard: {
      reason_code: guardReason,
      identity_match: identity.matches.any,
      paths_in_bounds: effectivePaths.every((item) => boundedPrivateWritePath(cwd, item)),
      paths_in_allowlist: effectivePaths.every((item) => allowedPaths ? rootWritePathAllowed(cwd, item, allowedPaths) : boundedPrivateWritePath(cwd, item)),
    },
  };
}
function validatorGuardReason(shape, phase, correlationStatus, taskMatch = true, identityMatch = true) {
  if (!shape.identityMatch && !shape.commandMatch) return "VALIDATOR_IDENTITY_AND_COMMAND_MISMATCH";
  if (!shape.identityMatch) return "VALIDATOR_IDENTITY_MISMATCH";
  if (phase !== "start" && identityMatch === false) return "VALIDATOR_COMMAND_CORRELATION_IDENTITY_MISMATCH";
  if (["end", "update"].includes(phase) && correlationStatus === "missing") return "VALIDATOR_COMMAND_CORRELATION_MISSING";
  if (["end", "update"].includes(phase) && correlationStatus === "unknown") return "VALIDATOR_COMMAND_CORRELATION_UNKNOWN";
  if (phase === "start" && correlationStatus === "missing") return "VALIDATOR_COMMAND_CORRELATION_MISSING";
  if (phase === "start" && correlationStatus === "duplicate") return "VALIDATOR_COMMAND_CORRELATION_DUPLICATE";
  if (["end", "update"].includes(phase) && correlationStatus === "matched" && taskMatch === false) return "VALIDATOR_COMMAND_CORRELATION_TASK_MISMATCH";
  if (!shape.commandMatch) return "VALIDATOR_COMMAND_MISMATCH";
  return null;
}
function validatorProbeShape({ observation, nestedEvent, frameType, expectedAgent, expectedName, expectedCommand, correlation = null }) {
  const identity = identityObservation(observation, nestedEvent, expectedAgent, expectedName, frameType);
  const requested = commandShape(expectedCommand);
  const command = extractCommand(nestedEvent);
  const directInvocation = commandShape(command);
  const invocation = directInvocation ?? correlation?.invocation ?? null;
  const candidateExitCode = extractExitCode(nestedEvent);
  const candidateReport = commandReport(nestedEvent);
  const candidateError = extractToolError(nestedEvent);
  const nestedType = typeof nestedEvent?.type === "string" ? nestedEvent.type.toLowerCase() : "";
  const terminalEvent = frameType === "tool_execution_end" || nestedType === "tool_execution_end";
  const completedEvent = terminalEvent || Number.isInteger(candidateExitCode) || candidateReport !== null;
  const observed = completedEvent && invocation ? { present: true, invocation: { ...invocation }, ...invocation, source: directInvocation ? "terminal_event" : "correlated_start", correlation: correlation ? { available: correlation.available, status: correlation.status ?? null, task_match: correlation.task_match ?? true, identity_match: correlation.identity_match ?? true, tool_call_id: correlation.tool_call_id, task_id: correlation.task_id, task_id_exposed: correlation.task_id_exposed === true, public_identity: correlation.public_identity, tool: correlation.tool } : null } : null;
  const identityMatch = identity.matches.any;
  const commandMatch = command !== null ? command === expectedCommand : correlation?.command_match === true;
  const baseReason = !identityMatch && !commandMatch
    ? "VALIDATOR_IDENTITY_AND_COMMAND_MISMATCH"
    : !identityMatch
      ? "VALIDATOR_IDENTITY_MISMATCH"
      : !commandMatch
        ? "VALIDATOR_COMMAND_MISMATCH"
        : null;
  const exitCode = observed ? candidateExitCode : undefined;
  const publicEvent = observed ? publicReviewData(nestedEvent) : null;
  const report = observed ? candidateReport : null;
  const shape = { identity, requested, invocation, observed, identityMatch, commandMatch, reason_code: baseReason, exitCode, toolError: candidateError, publicEvent, report, correlation };
  shape.reason_code = correlation?.guard_reason ?? baseReason;
  return shape;
}

function parseBashReportText(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  let body = text.trimEnd();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of [
      /\n\nWall time: \d+\.\d{2} seconds$/,
      /\n\nCommand exited with code -?\d+$/,
      /\nTimeout clamped to \d+s \(requested \d+s; allowed range \d+-\d+s\)\.$/,
    ]) {
      if (suffix.test(body)) {
        body = body.replace(suffix, "").trimEnd();
        changed = true;
        break;
      }
    }
  }
  if (!body.startsWith("{") || !body.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function boundedReportResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return publicReviewData(value);
  if (!value.external || typeof value.external !== "object" || Array.isArray(value.external)) return publicReviewData(value);
  const external = value.external;
  return {
    external: {
      schema_version: external.schema_version ?? null,
      mode: external.mode ?? null,
      dry_run: external.dry_run ?? null,
      status: external.status ?? null,
      merge_target: external.merge_target ?? null,
      quality: external.quality && typeof external.quality === "object" ? { status: external.quality.status ?? null, legacy: external.quality.legacy ?? null } : null,
      steps: Array.isArray(external.steps) ? external.steps.slice(0, 16).map((item) => ({ step: item?.step ?? null, status: item?.status ?? null })) : null,
    },
  };
}
function boundedReportObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = {};
  for (const key of ["status", "code", "transaction", "path", "sha256", "record", "failure_origin", "origin", "actual", "expected"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      if (["actual", "expected", "record"].includes(key)) report[key] = safeValue(value[key], 0, key);
      else if (typeof value[key] === "string") report[key] = scrub(value[key], 1024);
      else report[key] = publicReviewData(value[key]);
    }
  }
  for (const key of ["nonce", "assignment_id", "revision", "run_id"]) {
    if (typeof value[key] === "string" && value[key].trim()) report[key] = scrub(value[key], 256);
  }
  if (value.workload && typeof value.workload === "object" && !Array.isArray(value.workload)) {
    report.workload = {};
    for (const key of ["run_id", "source", "revision", "test"]) {
      if (typeof value.workload[key] === "string" && value.workload[key].trim()) report.workload[key] = scrub(value.workload[key], 512);
    }
  }
  if (value.result && typeof value.result === "object" && !Array.isArray(value.result)) report.result = boundedReportResult(value.result);
  return Object.keys(report).length >= 2 && ("status" in report || "code" in report) ? report : null;
}

function commandReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (String(value.type ?? "").toLowerCase() !== "tool_execution_end") return null;
  const content = Array.isArray(value.result?.content) ? value.result.content : null;
  if (!content) return null;
  for (const item of content.slice(0, 32)) {
    if (!item || typeof item !== "object" || item.type !== "text" || typeof item.text !== "string") continue;
    const parsed = parseBashReportText(item.text);
    const report = parsed ? boundedReportObject(parsed) : null;
    if (report) return report;
  }
  return null;
}

 
class NativeRpcSession {
  constructor({ omp, cwd, timeoutMs, assignments, logicalRunId, label, rootWritePolicy = null, rootPreparationPaths = [], readRoot = null }) {
    this.omp = omp; this.cwd = cwd; this.timeoutMs = timeoutMs; this.assignments = new Map(assignments.map((item) => [item.name, item])); this.logicalRunId = logicalRunId; this.label = label;
    // A nested application cwd can read its owning project's frozen assets;
    // command execution and every write guard still use cwd, never readRoot.
    this.readRoot = path.resolve(readRoot ?? cwd);
    if (!samePath(this.readRoot, cwd) && !inside(this.readRoot, path.resolve(cwd))) blocked("native command cwd is outside its approved project read root");
    this.rootPreparationPaths = rootPreparationPaths;
    this.rootPreparationActive = false;
    this.rootTurnSessionId = null;
    const configuredRootPolicy = rootWritePolicy && typeof rootWritePolicy === "object" ? rootWritePolicy : null;
    this.rootWritePolicy = configuredRootPolicy ? { tool: "write", paths: rootWriteAllowedPaths(configuredRootPolicy) } : null;
    this.rootCommandPolicy = this.prepareRootCommandPolicy(configuredRootPolicy?.rootCommandPolicy ?? null);
    if (this.rootCommandPolicy && (!this.rootWritePolicy || this.rootWritePolicy.paths.length !== 1 || !samePath(this.rootWritePolicy.paths[0], this.rootCommandPolicy.intent.path))) throw new ProbeError("BLOCKED", "root command policy requires the fixed intent path as the sole root write target");
    this.rootWriteCalls = new Map();
    this.rootCommandCalls = new Map();
    if (this.rootCommandPolicy && !Array.isArray(configuredRootPolicy?.paths)) throw new ProbeError("BLOCKED", "alignment helper root policy requires an explicit paths array");
    this.rootTaskCalls = new Map();
    this.lifecycleByAllocated = new Map();
    this.lifecycleByIndex = new Map();
    this.pendingLifecycleByAllocated = new Map();
    this.pendingLifecycleByIndex = new Map();
    this.rejectedLifecycleByAllocated = new Map();
    this.childDispatches = new Map();
    this.asyncRecordsByIdentity = new Map();
    this.waitRecordsByIdentity = new Map();
    this.asyncJobIdsByAllocated = new Map();
    this.inlineRecordsByIdentity = new Map();
    this.transportJobIds = new Set();
    this.waitCalls = new Map();
    this.yieldCalls = new Map();
    this.yieldCallBytes = 0;
    this.childProgressByAllocated = new Map();
    this.childContinuationFailures = [];
    this.pendingObservationBytes = 0;
    this.pendingObservationCount = 0;
    this.lifecycleDiagnosticBytes = 0;
    this.lifecycleDiagnosticOverflow = 0;
    this.child = null; this.rawBuffer = Buffer.alloc(0); this.chunk = null; this.protocolVersion = 1; this.fatal = null; this.readyResolved = false; this.stdinEnded = false; this.settled = false; this.sequence = 0; this.subagentSequence = 0;
    this.ready = this.deferred(); this.closed = this.deferred(); this.promptResults = new Map(); this.responses = new Map(); this.settledWaiters = []; this.validatorCalls = new Map(); this.writeCalls = new Map();
    this.hostArrivalSequence = 0;
    this.evidence = { label, logical_run_id: logicalRunId, host_workflow_ordinal: null, rpc: { argv: ["--mode", "rpc", "--no-ui", "--no-session", "--no-extensions", "--no-context-files", "--no-lsp", "--no-title"], protocol: null, event_filter: RPC_EVENTS }, calls: [], tool_events: [], root_writes: [], root_command_results: [], root_task_ends: [], task_calls: [], task_details: [], task_records: [], subagent_frames: [], subagent_lifecycle_diagnostics: [], native_progress_terminal: [], command_results: [], assistant_public: [], async_results: [], agent_ends: [], continuation_failures: [], host_observation: null, terminal: null, capture: { complete: true, bytes: 0, max_bytes: MAX_CAPTURE_BYTES }, lifecycle_diagnostic_budget: { count: 0, bytes: 0, max_count: MAX_PENDING_OBSERVATIONS, max_bytes: MAX_CAPTURE_BYTES, overflow: 0 } };
    this.evidence.failure_diagnostics = [];
    this.evidence.async_completion_rejections = [];
    this.evidence.rpc.project_read_root = { path: this.readRoot, source: "host-constructor-approved-private-project", command_cwd: this.cwd, widens_writes: false };
    this.evidence.rpc.preparation_prompts = [];
    this.evidence.subagent_reads = []; this.evidence.subagent_writes = [];
    this.evidence.wait_results = [];
    this.evidence.root_write_policy = this.rootCommandPolicy ? {
      source: "host-constructor-control",
      paths: this.rootWritePolicy.paths.filter((item) => typeof item === "string").map((item) => path.resolve(item)),
      rootCommandPolicy: {
        kind: this.rootCommandPolicy.kind,
        command: this.rootCommandPolicy.command,
        cwd: this.rootCommandPolicy.cwd,
        executable: { path: this.rootCommandPolicy.executable.path, sha256: this.rootCommandPolicy.executable.sha256 },
        script: { path: this.rootCommandPolicy.script.path, sha256: this.rootCommandPolicy.script.sha256 },
        intent: { path: this.rootCommandPolicy.intent.path, max_bytes: this.rootCommandPolicy.intent.max_bytes },
      },
    } : null;
  }
  prepareRootCommandPolicy(policy) {
    if (policy === null) return null;
    if (!policy || typeof policy !== "object" || Array.isArray(policy) || policy.kind !== "alignment-lab-checkpoint-helper-v1") throw new ProbeError("BLOCKED", "root command policy is not the approved alignment helper shape");
    const executable = policy.executable && typeof policy.executable === "object" ? policy.executable : null;
    const script = policy.script && typeof policy.script === "object" ? policy.script : null;
    const intent = policy.intent && typeof policy.intent === "object" ? policy.intent : null;
    const command = typeof policy.command === "string" ? policy.command : "";
    const executablePath = typeof executable?.path === "string" ? path.resolve(executable.path) : "";
    const scriptPath = typeof script?.path === "string" ? path.resolve(script.path) : "";
    const cwd = typeof policy.cwd === "string" ? path.resolve(policy.cwd) : "";
    const executableSha256 = typeof executable?.sha256 === "string" ? executable.sha256.toLowerCase() : "";
    const scriptSha256 = typeof script?.sha256 === "string" ? script.sha256.toLowerCase() : "";
    const intentPath = typeof intent?.path === "string" ? path.resolve(intent.path) : "";
    const maxBytes = intent?.max_bytes;
    if (!path.isAbsolute(executablePath) || !path.isAbsolute(scriptPath) || !path.isAbsolute(cwd) || !path.isAbsolute(intentPath) || !SHA256.test(executableSha256) || !SHA256.test(scriptSha256) || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 32768) throw new ProbeError("BLOCKED", "root command policy has invalid executable/script/intent identity");
    const commandSha256 = sha256Text(command);
    if (!samePath(cwd, this.cwd) || !/^"[^"]+" "[^"]+"$/.test(command)) throw new ProbeError("BLOCKED", "root command policy is not an exact quoted executable/script command");
    const match = command.match(/^"([^"]+)" "([^"]+)"$/);
    if (!match || path.resolve(match[1]) !== executablePath || path.resolve(match[2]) !== scriptPath || /[\r\n;&|<>`$]/.test(command)) throw new ProbeError("BLOCKED", "root command policy contains an unapproved shell or path");
    const inspect = (file, label, expectedHash) => {
      let stat;
      let real;
      try { stat = fs.lstatSync(file); real = fs.realpathSync.native(file); } catch { throw new ProbeError("BLOCKED", `${label} is not readable`); }
      if (!stat.isFile() || stat.nlink !== 1 || !samePath(real, file)) throw new ProbeError("BLOCKED", `${label} is not a regular single-link realpath`);
      const sha256 = sha256Bytes(fs.readFileSync(file));
      if (sha256 !== expectedHash) throw new ProbeError("BLOCKED", `${label} hash changed`);
      return { path: path.resolve(file), realpath: path.resolve(real), bytes: fs.statSync(file).size, sha256 };
    };
    const executableIdentity = inspect(executablePath, "root Node executable", executableSha256);
    const scriptIdentity = inspect(scriptPath, "root helper script", scriptSha256);
    let realCwd;
    try { realCwd = fs.realpathSync.native(cwd); } catch { throw new ProbeError("BLOCKED", "root command cwd is not readable"); }
    if (!samePath(realCwd, cwd) || !inside(cwd, intentPath)) throw new ProbeError("BLOCKED", "root command cwd or intent path is not approved");
    return Object.freeze({ kind: policy.kind, tool: "bash", command, command_sha256: commandSha256, cwd, executable: executableIdentity, script: scriptIdentity, intent: Object.freeze({ path: intentPath, max_bytes: maxBytes }), cwdRealpath: path.resolve(realCwd) });
  }
  validateRootCommandPolicy() {
    const policy = this.rootCommandPolicy;
    if (!policy) return;
    const inspect = (file, expected, label, requireSingleLink) => {
      let stat;
      let real;
      try { stat = fs.lstatSync(file); real = fs.realpathSync.native(file); } catch { throw new ProbeError("BLOCKED", `${label} disappeared or is unreadable`); }
      if (!stat.isFile() || (requireSingleLink && stat.nlink !== 1) || !samePath(real, expected.realpath)) throw new ProbeError("BLOCKED", `${label} identity changed`);
      const sha256 = sha256Bytes(fs.readFileSync(file));
      if (sha256 !== expected.sha256) throw new ProbeError("BLOCKED", `${label} bytes changed`);
    };
    inspect(policy.executable.path, policy.executable, "root Node executable", true);
    inspect(policy.script.path, policy.script, "root helper script", true);
    let realCwd;
    try { realCwd = fs.realpathSync.native(policy.cwd); } catch { throw new ProbeError("BLOCKED", "root command cwd disappeared"); }
    if (!samePath(realCwd, policy.cwdRealpath)) throw new ProbeError("BLOCKED", "root command cwd identity changed");
  }
  deferred() { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
  timeout(promise, label, timeoutMs = this.timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new ProbeError("BLOCKED", `${this.label} ${label} timed out`)), timeoutMs); timer.unref?.(); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
  start() {
    const nativeEnvironment = createNativeEnvironment();
    this.evidence.rpc.environment = nativeEnvironment.policy;
    this.child = spawn(this.omp, this.evidence.rpc.argv, { cwd: this.cwd, env: nativeEnvironment.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child.stdout.on("data", (data) => this.consumeBytes(Buffer.from(data)));
    this.child.stderr.on("data", () => {});
    this.child.on("error", (error) => this.fail(new ProbeError("BLOCKED", `OMP process error: ${scrub(error.message)}`)));
    this.child.on("close", (code, signal) => {
      this.evidence.process = { exit_code: code, signal: signal ?? null };
      if (this.rawBuffer.length || this.chunk) this.fail(new ProbeError("BLOCKED", "OMP closed with an incomplete RPC frame"));
      this.closed.resolve({ code, signal });
      if (!this.readyResolved) this.ready.reject(new ProbeError("BLOCKED", "OMP closed before ready"));
      for (const waiter of this.responses.values()) waiter.reject(new ProbeError("BLOCKED", "OMP closed before response"));
      for (const waiter of this.promptResults.values()) waiter.reject(new ProbeError("BLOCKED", "OMP closed before prompt result"));
    });
    return this.timeout(this.ready.promise, "ready");
  }
  fail(error) {
    if (!this.fatal) this.fatal = error;
    this.ready.reject(this.fatal);
    for (const waiter of this.responses.values()) waiter.reject(this.fatal);
    for (const waiter of this.promptResults.values()) waiter.reject(this.fatal);
    for (const waiter of this.settledWaiters) waiter.reject(this.fatal);
    this.responses.clear(); this.promptResults.clear(); this.settledWaiters = [];
    if (this.child && !this.child.killed) this.child.kill();
  }
  capture(collection, value, options = {}) {
    const safe = safeValue(value);
    const records = collection === "preparation_prompts" ? this.evidence.rpc.preparation_prompts : this.evidence[collection];
    const replacement = collection === "subagent_frames" && sdkDeltaRecord(safe)
      ? records.findIndex((record) => sameSdkDeltaTuple(record, safe)) : -1;
    const previous = replacement < 0 ? null : records[replacement];
    if (previous) safe.coalesced_nonterminal_progress = nonterminalProgressSummary(previous, safe);
    const chargeValue = Object.prototype.hasOwnProperty.call(options, "chargeValue") ? options.chargeValue : safe;
    const previousBytes = previous ? Buffer.byteLength(JSON.stringify(previous), "utf8") : 0;
    const bytes = Buffer.byteLength(JSON.stringify(chargeValue), "utf8");
    const attemptedBytes = this.evidence.capture.bytes - previousBytes + bytes;
    if (attemptedBytes > MAX_CAPTURE_BYTES) { this.evidence.capture.complete = false; throw new ProbeError("BLOCKED", "native operational retention exceeded bound"); }
    this.evidence.capture.bytes = attemptedBytes;
    if (previous) records.splice(replacement, 1);
    records.push(safe);
  }
  consumeBytes(data) {
    if (this.fatal) return;
    this.rawBuffer = Buffer.concat([this.rawBuffer, data]);
    while (true) {
      const newline = this.rawBuffer.indexOf(0x0a);
      if (newline < 0) { if (this.rawBuffer.byteLength > MAX_PHYSICAL_FRAME_BYTES) this.fail(new ProbeError("BLOCKED", "RPC frame exceeded physical limit")); return; }
      const line = this.rawBuffer.subarray(0, newline); this.rawBuffer = this.rawBuffer.subarray(newline + 1);
      if (line.byteLength + 1 > MAX_PHYSICAL_FRAME_BYTES) { this.fail(new ProbeError("BLOCKED", "RPC frame exceeded physical limit")); return; }
      const bytes = line.at(-1) === 0x0d ? line.subarray(0, line.length - 1) : line;
      if (!bytes.length) continue;
      let frame;
      try { frame = JSON.parse(decoder.decode(bytes)); } catch { this.fail(new ProbeError("BLOCKED", "RPC frame was not strict UTF-8 JSON")); return; }
      try { this.consumePhysical(frame); } catch (error) { this.fail(error instanceof ProbeError ? error : new ProbeError("BLOCKED", scrub(error?.message))); return; }
    }
  }
  consumePhysical(frame) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new ProbeError("BLOCKED", "RPC frame must be an object");
    if (frame.type === "rpc_chunk") {
      if (this.protocolVersion !== 2) throw new ProbeError("BLOCKED", "rpc_chunk before protocol v2");
      const chunkId = captureSafeIdentifier(frame.chunkId, "rpc chunk identity");
      const { index, count, byteLength, data } = frame;
      if (!Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(count) || count < 1 || index >= count || !Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_REASSEMBLED_FRAME_BYTES || typeof data !== "string") throw new ProbeError("BLOCKED", "invalid rpc_chunk metadata");
      const decoded = Buffer.from(data, "base64");
      if (decoded.toString("base64") !== data) throw new ProbeError("BLOCKED", "non-canonical rpc_chunk base64");
      if (!this.chunk) { if (index !== 0) throw new ProbeError("BLOCKED", "rpc_chunk did not start at zero"); this.chunk = { chunkId, count, byteLength, next: 0, bytes: [], total: 0 }; }
      if (this.chunk.chunkId !== chunkId || this.chunk.count !== count || this.chunk.byteLength !== byteLength || this.chunk.next !== index) throw new ProbeError("BLOCKED", "rpc_chunk sequence invalid");
      this.chunk.bytes.push(decoded); this.chunk.total += decoded.byteLength; this.chunk.next += 1;
      if (this.chunk.total > MAX_REASSEMBLED_FRAME_BYTES || this.chunk.total > byteLength) throw new ProbeError("BLOCKED", "rpc_chunk exceeded declared size");
      if (this.chunk.next === this.chunk.count) { if (this.chunk.total !== this.chunk.byteLength) throw new ProbeError("BLOCKED", "rpc_chunk length mismatch"); const logical = JSON.parse(decoder.decode(Buffer.concat(this.chunk.bytes, this.chunk.total))); this.chunk = null; this.consumeLogical(logical); }
      return;
    }
    if (this.chunk) throw new ProbeError("BLOCKED", "rpc_chunk interrupted");
    this.consumeLogical(frame);
  }
  taskDetailsFromFrame(frame) {
    const candidates = [frame?.result, frame?.partialResult, frame?.partial_result, frame?.details];
    return candidates.flatMap((value) => taskDetailsEnvelopes(value));
  }
  rootTaskKey(frame) {
    const id = fullToolCallId(frame, ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"]);
    const name = extractToolName(frame);
    return id && name ? correlationKey(id, name.toLowerCase()) : null;
  }
  recordPublicAssignment(binding, value, source) {
    if (value === undefined) return;
    const assignment = normalizePublicAssignment(value);
    if (typeof value !== "string" || assignment === null) blocked("SDK public assignment was malformed");
    const hash = sha256Text(assignment);
    if (binding.assignment_sha256 && binding.assignment_sha256 !== hash) blocked("SDK public assignment changed for one allocated child");
    binding.assignment_sha256 = hash;
    for (const call of this.rootTaskCalls.values()) {
      if (call.tool_call_id !== binding.parent_tool_call_id) continue;
      const item = call.assignments[binding.index];
      if (!item || item.name !== binding.assignment_name || item.agent !== binding.agent) blocked("public assignment lacked its observed Root dispatch");
      item.public_assignment = assignment;
      item.assignment_sha256 = hash;
      item.assignment_source = source;
      return;
    }
    blocked("public assignment lacked its observed Root task");
  }
  lifecycleStatusAllowed(status, frameType = "subagent_lifecycle") {
    const value = typeof status === "string" ? status.trim().toLowerCase() : "";
    if (!value) return false;
    if (frameType === "subagent_progress") return value === "started" || value === "running" || value === "progress" || TERMINAL_STATUSES.has(value);
    return LIFECYCLE_STATUSES.has(value);
  }
  lifecycleTuple(observation, frame) {
    const payload = observation?.payload && typeof observation.payload === "object" ? observation.payload : {};
    const progress = observation?.progress && typeof observation.progress === "object" ? observation.progress : {};
    const index = Number.isSafeInteger(payload.index) ? payload.index : Number.isSafeInteger(progress.index) ? progress.index : null;
    const parentToolCallId = fullToolCallId(payload, ["parentToolCallId", "parent_tool_call_id"]) ?? fullToolCallId(progress, ["parentToolCallId", "parent_tool_call_id"]);
    const agent = typeof observation?.agent === "string" && observation.agent ? observation.agent : typeof progress.agent === "string" && progress.agent ? progress.agent : null;
    const agentSource = typeof observation?.agentSource === "string" && observation.agentSource ? observation.agentSource : typeof progress.agentSource === "string" && progress.agentSource ? progress.agentSource : null;
    const status = typeof observation?.status === "string" && observation.status.trim() ? observation.status.trim().toLowerCase() : typeof progress.status === "string" && progress.status.trim() ? progress.status.trim().toLowerCase() : null;
    return { allocated_id: preserveIdentifier(observation?.id), parent_tool_call_id: parentToolCallId, index, agent, agentSource, status, frame_type: frame?.type ?? null };
  }
  rememberRejectedLifecycle(pending, reason = "terminal lifecycle rejected") {
    const id = preserveIdentifier(pending?.allocated_id);
    if (!id) return;
    if (!this.rejectedLifecycleByAllocated.has(`id:${id}`) && this.rejectedLifecycleByAllocated.size >= MAX_PENDING_OBSERVATIONS) {
      blocked("terminal-rejected lifecycle identity retention exceeded bound");
    }
    this.rejectedLifecycleByAllocated.set(`id:${id}`, { status: pending.lifecycle_status ?? null, reason: scrub(reason, 128) });
  }
  recordLifecycleDiagnostic(tuple, hostArrivalOrdinal, hostWorkflowOrdinal, reason = null, pending = null, hostArrivalTimestamp = null) {
    const diagnostic = {
      id: tuple.allocated_id,
      parent_tool_call_id: tuple.parent_tool_call_id,
      index: tuple.index,
      agent: tuple.agent,
      agentSource: tuple.agentSource,
      status: tuple.status,
      host_arrival_ordinal: hostArrivalOrdinal,
      host_workflow_ordinal: hostWorkflowOrdinal,
    };
    const timestamp = pending?.host_arrival_timestamp ?? hostArrivalTimestamp;
    if (timestamp !== null && timestamp !== undefined) diagnostic.host_arrival_timestamp = timestamp;
    if (typeof reason === "string" && reason) diagnostic.reason_code = scrub(reason, 128);
    const reads = pending?.pending_observations?.subagent_reads;
    if (Array.isArray(reads) && reads.length) {
      diagnostic.read_provenance = reads.slice(0, 64).map((read) => ({
        host_arrival_ordinal: normalizeHostWorkflowOrdinal(read?.host_arrival_ordinal),
        host_workflow_ordinal: normalizeHostWorkflowOrdinal(read?.host_workflow_ordinal),
        source_files: Array.isArray(read?.source_files) ? read.source_files.slice(0, 16).map((file) => ({
          path: typeof file?.path === "string" ? scrub(file.path, 1024) : null,
          bytes: Number.isSafeInteger(file?.bytes) ? file.bytes : null,
          sha256: typeof file?.sha256 === "string" && SHA256.test(file.sha256) ? file.sha256 : null,
        })) : [],
      }));
    }
    const bytes = Buffer.byteLength(JSON.stringify(diagnostic), "utf8");
    if (this.evidence.subagent_lifecycle_diagnostics.length + Number(Boolean(this.evidence.lifecycle_diagnostic_budget.pending_retention)) >= MAX_PENDING_OBSERVATIONS || this.lifecycleDiagnosticBytes + bytes > MAX_CAPTURE_BYTES) {
      this.lifecycleDiagnosticOverflow = Math.min(Number.MAX_SAFE_INTEGER, this.lifecycleDiagnosticOverflow + 1);
      this.evidence.lifecycle_diagnostic_budget.overflow = this.lifecycleDiagnosticOverflow;
      return;
    }
    this.lifecycleDiagnosticBytes += bytes;
    this.evidence.subagent_lifecycle_diagnostics.push(diagnostic);
    this.evidence.lifecycle_diagnostic_budget.count = this.evidence.subagent_lifecycle_diagnostics.length + Number(Boolean(this.evidence.lifecycle_diagnostic_budget.pending_retention));
    this.evidence.lifecycle_diagnostic_budget.bytes = this.lifecycleDiagnosticBytes;
  }
  pendingRetentionFailure(binding, collection, attemptedBytes, coalescing, triggerRecord = null) {
    const budget = this.evidence.lifecycle_diagnostic_budget;
    if (!budget.pending_retention) {
      const bindings = [];
      for (const pending of this.pendingLifecycleByAllocated.values()) {
        if (bindings.length === 8) break;
        const collectionCounts = {};
        let lastArrival = pending.host_arrival_ordinal;
        for (const [name, records] of Object.entries(pending.pending_observations ?? {})) {
          collectionCounts[name] = records.length;
          for (const record of records) if (Number.isSafeInteger(record.host_arrival_ordinal)) lastArrival = Math.max(lastArrival, record.host_arrival_ordinal);
        }
        bindings.push({ allocated_id: pending.allocated_id, parent_tool_call_id: pending.parent_tool_call_id, index: pending.index, agent: pending.agent, agentSource: pending.agentSource, collection_counts: collectionCounts, first_host_arrival_ordinal: pending.host_arrival_ordinal, last_host_arrival_ordinal: lastArrival });
      }
      const diagnostic = {
        count: this.pendingObservationCount, bytes: this.pendingObservationBytes,
        max_count: MAX_PENDING_OBSERVATIONS, max_bytes: MAX_CAPTURE_BYTES,
        collection, attempted_bytes: attemptedBytes, coalescing,
        root_dispatch_observed: [...this.rootTaskCalls.values()].some((call) => call.kind === "dispatch" && call.tool_call_id === binding.parent_tool_call_id),
        bindings_total: this.pendingLifecycleByAllocated.size, bindings,
        trigger: { allocated_id: binding.allocated_id, parent_tool_call_id: binding.parent_tool_call_id, index: binding.index, agent: binding.agent, agentSource: binding.agentSource, status: triggerRecord?.status ?? null, frame_type: triggerRecord?.frame_type ?? triggerRecord?.source_kind ?? null, type: triggerRecord?.type ?? triggerRecord?.nested_event_type ?? null, host_arrival_ordinal: this.hostArrivalSequence, host_workflow_ordinal: this.currentHostWorkflowOrdinal },
      };
      const bytes = Buffer.byteLength(JSON.stringify(diagnostic), "utf8");
      if (budget.count < MAX_PENDING_OBSERVATIONS && this.lifecycleDiagnosticBytes + bytes <= MAX_CAPTURE_BYTES) {
        budget.pending_retention = diagnostic;
        this.lifecycleDiagnosticBytes += bytes;
        budget.bytes = this.lifecycleDiagnosticBytes;
        budget.count += 1;
      } else budget.overflow = this.lifecycleDiagnosticOverflow = Math.min(Number.MAX_SAFE_INTEGER, this.lifecycleDiagnosticOverflow + 1);
    }
    if (binding.accepted !== true && (binding.pending_observation_count ?? 0) === 0) this.rollbackPendingAllocation(binding);
    blocked("pending lifecycle observation retention exceeded bound");
  }
  bufferPendingObservation(binding, collection, value) {
    binding.pending_observations ??= { subagent_frames: [], subagent_reads: [], subagent_writes: [], command_results: [], native_progress_terminal: [], terminal_records: [] };
    const safe = safeValue(value);
    if (collection === "subagent_frames" && safe.frame_type === "subagent_progress") {
      safe.raw_progress_identity = { agent: safe.agent ?? null, agentSource: safe.agentSource ?? null };
      safe.agent ??= binding.agent;
      safe.agentSource ??= binding.agentSource;
      safe.identity_source = "observed-lifecycle-tuple; Root confirmation remains required";
    }
    const replaceableProgress = (item) => item?.frame_type === "subagent_progress"
      && !item.tool && !item.tool_call_id && !Object.hasOwn(item, "is_error")
      && ["started", "running", "progress"].includes(item.status)
      && Array.isArray(item.progress_keys)
      && ![...item.progress_keys, ...(item.payload_keys ?? [])].some((key) => ["exitCode", "exit_code", "isError", "is_error", "aborted", "error", "result", "results"].includes(key));
    const records = binding.pending_observations[collection];
    const eligible = collection === "subagent_frames" && (replaceableProgress(safe) || sdkDeltaRecord(safe));
    const replacement = eligible ? records.findIndex((item) => sdkDeltaRecord(safe)
      ? sameSdkDeltaTuple(item, safe)
      : replaceableProgress(item) && item.allocated_id === safe.allocated_id && item.parent_tool_call_id === safe.parent_tool_call_id && item.index === safe.index) : -1;
    const previous = replacement < 0 ? null : records[replacement];
    if (previous) safe.coalesced_nonterminal_progress = nonterminalProgressSummary(previous, safe);
    const previousBytes = previous ? Buffer.byteLength(JSON.stringify(previous), "utf8") : 0;
    const bytes = Buffer.byteLength(JSON.stringify(safe), "utf8");
    const attemptedBytes = this.pendingObservationBytes - previousBytes + bytes;
    if ((!previous && this.pendingObservationCount >= MAX_PENDING_OBSERVATIONS) || attemptedBytes > MAX_CAPTURE_BYTES) {
      this.pendingRetentionFailure(binding, collection, attemptedBytes, { eligible, replacement: previous !== null }, safe);
    }
    const added = previous ? 0 : 1;
    this.pendingObservationCount += added;
    this.pendingObservationBytes = attemptedBytes;
    binding.pending_observation_count = (binding.pending_observation_count ?? 0) + added;
    binding.pending_observation_bytes = (binding.pending_observation_bytes ?? 0) - previousBytes + bytes;
    if (previous) records[replacement] = safe;
    else records.push(safe);
  }
  rollbackPendingAllocation(binding) {
    const id = preserveIdentifier(binding?.allocated_id);
    if (!id) return;
    this.releaseYieldCallsForBinding(binding);
    this.releasePendingObservations(binding);
    this.pendingLifecycleByAllocated.delete(`id:${id}`);
    const key = correlationKey(binding.parent_tool_call_id, binding.index);
    const ids = this.pendingLifecycleByIndex.get(key);
    ids?.delete(id);
    if (ids?.size === 0) this.pendingLifecycleByIndex.delete(key);
  }
  releasePendingObservations(binding) {
    const count = Number.isSafeInteger(binding?.pending_observation_count) ? binding.pending_observation_count : 0;
    const bytes = Number.isSafeInteger(binding?.pending_observation_bytes) ? binding.pending_observation_bytes : 0;
    this.pendingObservationCount = Math.max(0, this.pendingObservationCount - count);
    this.pendingObservationBytes = Math.max(0, this.pendingObservationBytes - bytes);
    if (binding) {
      binding.pending_observation_count = 0;
      binding.pending_observation_bytes = 0;
    }
  }
  flushPendingBinding(binding) {
    const pending = binding.pending_observations;
    if (!pending) return;
    const replaceBinding = (value) => ({
      ...value,
      allocated_id: binding.allocated_id,
      parent_tool_call_id: binding.parent_tool_call_id,
      index: binding.index,
      job_id: binding.job_id,
      instance_id: binding.instance_id,
      domain_id_provenance: binding.domain_id_provenance,
      assignment_id: value.assignment_id ?? binding.assignment_name,
      agent: value.agent ?? binding.agent,
      agentSource: value.agentSource ?? binding.agentSource,
    });
    const planned = [
      ...pending.subagent_frames.map((item) => ["subagent_frames", replaceBinding(item)]),
      ...pending.subagent_reads.map((item) => ["subagent_reads", replaceBinding({ ...item, root_session_id: this.evidence.root_session?.session_id ?? null, binding_source: "observed-root-dispatch-lifecycle" })]),
      ...pending.subagent_writes.map((item) => ["subagent_writes", replaceBinding(item)]),
      ...pending.command_results.map((item) => ["command_results", replaceBinding(item)]),
      ...pending.native_progress_terminal.map((item) => ["native_progress_terminal", replaceBinding(item)]),
    ];
    const bytes = planned.reduce((total, [, value]) => total + Buffer.byteLength(JSON.stringify(safeValue(value)), "utf8"), 0);
    if (this.evidence.capture.bytes + bytes > MAX_CAPTURE_BYTES) throw new ProbeError("BLOCKED", "native operational retention exceeded bound");
    for (const [collection, item] of planned) this.capture(collection, item);
    for (const item of pending.terminal_records) this.commitTerminalRecord(replaceBinding(item));
    this.releasePendingObservations(binding);
    binding.pending_observations = null;
  }
  commitTerminalRecord(record) {
    const allocatedId = record.allocated_id ?? record.id;
    if (allocatedId && this.rejectedLifecycleByAllocated.has(`id:${allocatedId}`)) blocked("terminal record reused a permanently rejected lifecycle identity");
    const key = correlationKey(record.source_kind, record.allocated_id ?? record.id ?? "", record.parent_tool_call_id ?? "", record.index ?? "", record.assignment_id ?? "");
    const snapshot = canonical(record);
    const prior = this.inlineRecordsByIdentity.get(key);
    if (prior) {
      if (prior !== snapshot) blocked("contradictory terminal snapshot for one allocated task identity");
      return;
    }
    record.digest = sha256Text(JSON.stringify(record));
    this.inlineRecordsByIdentity.set(key, snapshot);
    this.evidence.task_records.push(record);
  }
  discardPendingForIndex(parentToolCallId, index, selectedId) {
    const key = correlationKey(parentToolCallId, index);
    const ids = this.pendingLifecycleByIndex.get(key);
    if (!ids) return;
    for (const id of [...ids]) {
      if (id === selectedId) continue;
      const pending = this.pendingLifecycleByAllocated.get(`id:${id}`);
      if (pending) {
        this.recordLifecycleDiagnostic(
          this.lifecycleTuple({ id: pending.allocated_id, agent: pending.agent, agentSource: pending.agentSource, status: pending.lifecycle_status, payload: { index: pending.index, parentToolCallId: pending.parent_tool_call_id } }, null),
          pending.host_arrival_ordinal,
          pending.host_workflow_ordinal,
          "pending lifecycle was not selected by authoritative Root allocation",
          pending,
        );
        this.releaseYieldCallsForBinding(pending);
        this.releasePendingObservations(pending);
        this.pendingLifecycleByAllocated.delete(`id:${id}`);
      }
      ids.delete(id);
    }
    if (!selectedId || ids.size === 0) this.pendingLifecycleByIndex.delete(key);
  }
  snapshotLifecycleMap(map) {
    const entries = [...map.entries()];
    return { map, entries, states: entries.map(([, value]) => value && typeof value === "object" ? structuredClone(value) : value) };
  }
  restoreLifecycleMap(snapshot) {
    snapshot.map.clear();
    for (let index = 0; index < snapshot.entries.length; index += 1) {
      const [key, value] = snapshot.entries[index];
      const state = snapshot.states[index];
      if (value instanceof Set) {
        value.clear();
        for (const item of state) value.add(item);
      } else if (value && typeof value === "object" && state && typeof state === "object" && !Array.isArray(value)) {
        for (const key of Object.keys(value)) delete value[key];
        Object.assign(value, structuredClone(state));
      }
      snapshot.map.set(key, value);
    }
  }
  beginAllocationTransaction(call) {
    const evidenceArrays = ["subagent_frames", "subagent_reads", "subagent_writes", "command_results", "native_progress_terminal", "task_records", "subagent_lifecycle_diagnostics"];
    const maps = [
      this.lifecycleByAllocated,
      this.lifecycleByIndex,
      this.pendingLifecycleByAllocated,
      this.pendingLifecycleByIndex,
      this.rejectedLifecycleByAllocated,
      this.yieldCalls,
      this.validatorCalls,
      this.writeCalls,
      this.inlineRecordsByIdentity,
    ].map((map) => this.snapshotLifecycleMap(map));
    const assignmentItems = Array.isArray(call?.assignments)
      ? call.assignments.map((item) => ({ item, state: item && typeof item === "object" ? structuredClone(item) : item }))
      : [];
    return {
      call,
      assignmentItems,
      yieldCallBytes: this.yieldCallBytes,
      hadProgressMap: call.progress_by_index instanceof Map,
      progress: call.progress_by_index instanceof Map ? this.snapshotLifecycleMap(call.progress_by_index) : null,
      maps,
      pendingObservationCount: this.pendingObservationCount,
      pendingObservationBytes: this.pendingObservationBytes,
      lifecycleDiagnosticBytes: this.lifecycleDiagnosticBytes,
      lifecycleDiagnosticOverflow: this.lifecycleDiagnosticOverflow,
      diagnosticBudget: structuredClone(this.evidence.lifecycle_diagnostic_budget),
      captureBytes: this.evidence.capture.bytes,
      captureComplete: this.evidence.capture.complete,
      evidenceLengths: Object.fromEntries(evidenceArrays.map((name) => [name, this.evidence[name].length])),
    };
  }
  rollbackAllocationTransaction(transaction) {
    for (const snapshot of transaction.maps) this.restoreLifecycleMap(snapshot);
    if (transaction.hadProgressMap) this.restoreLifecycleMap(transaction.progress);
    else delete transaction.call.progress_by_index;
    for (const { item, state } of transaction.assignmentItems) {
      if (!item || typeof item !== "object" || !state || typeof state !== "object") continue;
      for (const key of Object.keys(item)) delete item[key];
      Object.assign(item, structuredClone(state));
    }
    this.yieldCallBytes = transaction.yieldCallBytes;
    this.pendingObservationCount = transaction.pendingObservationCount;
    this.pendingObservationBytes = transaction.pendingObservationBytes;
    this.lifecycleDiagnosticBytes = transaction.lifecycleDiagnosticBytes;
    this.lifecycleDiagnosticOverflow = transaction.lifecycleDiagnosticOverflow;
    Object.assign(this.evidence.lifecycle_diagnostic_budget, structuredClone(transaction.diagnosticBudget));
    this.evidence.capture.bytes = transaction.captureBytes;
    this.evidence.capture.complete = transaction.captureComplete;
    for (const [name, length] of Object.entries(transaction.evidenceLengths)) this.evidence[name].length = length;
  }
  adoptPendingAllocation(parentToolCallId, index, allocatedId, agent, agentSource) {
    const rootCall = [...this.rootTaskCalls.values()].find((call) => call.kind === "dispatch" && call.tool_call_id === parentToolCallId);
    if (!rootCall?.progress_by_index?.has(index)) return null;
    const progress = rootCall.progress_by_index.get(index);
    if (progress.id !== allocatedId || progress.agent !== agent || progress.agentSource !== agentSource) blocked("Root progress disagreed with an observed lifecycle allocation");
    const dispatched = rootCall.assignments[index];
    const assignment = dispatched ? this.assignments.get(dispatched.name) : null;
    if (!assignment || dispatched.agent !== agent || assignment.agent !== agent) blocked("Root allocation was not authorized by the configured assignment policy");
    const pending = this.pendingLifecycleByAllocated.get(`id:${allocatedId}`);
    if (pending && (pending.parent_tool_call_id !== parentToolCallId || pending.index !== index || pending.agent !== agent || pending.agentSource !== agentSource)) blocked("observed lifecycle allocation rebound before Root confirmation");
    if (!pending) {
      this.discardPendingForIndex(parentToolCallId, index, allocatedId);
      return null;
    }
    if (pending.lifecycle_status === "aborted" || FAILURE_STATUSES.has(pending.lifecycle_status) || FAILURE_STATUSES.has(String(pending.progress_status ?? "").toLowerCase())) {
      this.rememberRejectedLifecycle(pending);
      this.recordLifecycleDiagnostic(
        this.lifecycleTuple({ id: pending.allocated_id, agent: pending.agent, agentSource: pending.agentSource, status: pending.lifecycle_status, payload: { index: pending.index, parentToolCallId: pending.parent_tool_call_id } }, null),
        pending.host_arrival_ordinal,
        pending.host_workflow_ordinal,
        "terminal lifecycle was rejected before Root adoption",
        pending,
      );
      this.releaseYieldCallsForBinding(pending);
      this.releasePendingObservations(pending);
      this.pendingLifecycleByAllocated.delete(`id:${allocatedId}`);
      this.pendingLifecycleByIndex.get(correlationKey(pending.parent_tool_call_id, pending.index))?.delete(allocatedId);
      this.discardPendingForIndex(parentToolCallId, index, null);
      return null;
    }
    this.pendingLifecycleByAllocated.delete(`id:${allocatedId}`);
    this.pendingLifecycleByIndex.get(correlationKey(pending.parent_tool_call_id, pending.index))?.delete(allocatedId);
    for (const call of this.yieldCalls.values()) if (call.allocated_id === allocatedId) call.accepted = true;
    const domain = hostDerivedDomainIds(this.evidence.root_session?.session_id, parentToolCallId, allocatedId, index);
    const binding = { ...pending, accepted: true, assignment_name: assignment.name, job_id: domain.job_id, instance_id: domain.instance_id, domain_id_provenance: domain.provenance };
    this.lifecycleByAllocated.set(`id:${allocatedId}`, binding);
    this.lifecycleByIndex.set(correlationKey(parentToolCallId, index), binding);
    this.discardPendingForIndex(parentToolCallId, index, allocatedId);
    this.flushPendingBinding(binding);
    this.pendingLifecycleByIndex.delete(correlationKey(parentToolCallId, index));
    return binding;
  }
  recordRootTaskProgress(call, rows) {
    if (!Array.isArray(rows)) blocked("Root task progress was not an array");
    const transaction = this.beginAllocationTransaction(call);
    const ids = new Set();
    const indices = new Set();
    try {
      call.progress_by_index ??= new Map();
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)
            || !Number.isSafeInteger(row.index) || row.index < 0 || row.index >= call.assignments.length) blocked("Root task progress omitted its allocated identity/index");
        const rowId = captureSafeIdentifier(row.id, "Root allocated child identity");
        const expected = call.assignments[row.index];
        if (row.agent !== expected.agent || row.agentSource !== "project") blocked("Root task progress disagreed with its dispatched role/source");
        if (ids.has(rowId) || indices.has(row.index)) blocked("Root task progress contained duplicate identities or indices");
        ids.add(rowId);
        indices.add(row.index);
        const previous = call.progress_by_index.get(row.index);
        if (previous && (previous.id !== rowId || previous.agent !== row.agent || previous.agentSource !== row.agentSource)) blocked("Root task progress rebound an allocated identity");
        const existingAllocated = this.lifecycleByAllocated.get(`id:${rowId}`);
        if (existingAllocated && this.rejectedLifecycleByAllocated.has(`id:${rowId}`)) blocked("Root task progress reused a permanently rejected accepted lifecycle identity");
        if (existingAllocated && (existingAllocated.parent_tool_call_id !== call.tool_call_id || existingAllocated.index !== row.index || existingAllocated.agent !== row.agent || existingAllocated.agentSource !== row.agentSource)) blocked("Root task progress rebound an accepted lifecycle to a different current Root");
        const existingAtIndex = this.lifecycleByIndex.get(correlationKey(call.tool_call_id, row.index));
        if (existingAtIndex && (existingAtIndex.allocated_id !== rowId || existingAtIndex.agent !== row.agent || existingAtIndex.agentSource !== row.agentSource)) blocked("Root task progress disagreed with its observed child lifecycle");
        const assignment = row.assignment === undefined ? previous?.assignment : row.assignment;
        if (assignment !== undefined && (typeof assignment !== "string" || normalizePublicAssignment(assignment) === null)) blocked("Root task progress public assignment was malformed");
        if (previous?.assignment !== undefined && assignment !== undefined && normalizePublicAssignment(previous.assignment) !== normalizePublicAssignment(assignment)) blocked("Root task progress changed its public assignment");
        call.progress_by_index.set(row.index, { id: rowId, index: row.index, agent: row.agent, agentSource: row.agentSource, assignment });
        const adopted = this.adoptPendingAllocation(call.tool_call_id, row.index, rowId, row.agent, row.agentSource);
        if (adopted) this.recordPublicAssignment(adopted, assignment, "Root.task.details.progress.assignment");
        else if (existingAtIndex) this.recordPublicAssignment(existingAtIndex, assignment, "Root.task.details.progress.assignment");
      }
    } catch (error) {
      this.rollbackAllocationTransaction(transaction);
      throw error;
    }
  }
  validateRootResultTuple(raw, binding, rootCall) {
    validateKnownIdentityMetadata(raw, "Root task result", true);
    validateIdentifierAliases(raw, ["agent"], "Root task result.agent");
    validateIdentifierAliases(raw, ["agentSource", "agent_source"], "Root task result.agentSource");
    if (!binding || !rootCall || binding.parent_tool_call_id !== rootCall.tool_call_id) blocked("Root task result binding belonged to a different current Root");
    const expected = rootCall.assignments?.[binding.index];
    const assignment = expected ? this.assignments.get(expected.name) : null;
    if (!expected || !assignment || expected.agent !== binding.agent || assignment.agent !== binding.agent || binding.agentSource !== "project") blocked("Root task result binding lacked its configured assignment");
    const values = (keys) => keys.filter((key) => Object.prototype.hasOwnProperty.call(raw ?? {}, key) && raw[key] !== undefined && raw[key] !== null).map((key) => raw[key]);
    if (values(["parentToolCallId", "parent_tool_call_id"]).some((value) => value !== binding.parent_tool_call_id)
      || values(["index"]).some((value) => value !== binding.index)
      || values(["agent"]).some((value) => value !== binding.agent)
      || values(["agentSource", "agent_source"]).some((value) => value !== binding.agentSource)
      || values(["id", "allocated_id", "allocatedId"]).some((value) => value !== binding.allocated_id)) blocked("Root task result contradicted its authoritative allocation tuple");
  }
  asyncJobIdentity(job) {
    return captureSafeIdentifier(job?.jobId, "async job identity");
  }
  rootDispatchForBinding(binding) {
    const matches = [...this.rootTaskCalls.values()].filter((call) => call.kind === "dispatch" && call.tool_call_id === binding.parent_tool_call_id);
    if (matches.length !== 1 || matches[0].ended !== true) blocked("async-result was not bound to one ended Root task dispatch");
    const rootCall = matches[0];
    const rootEnd = this.evidence.root_task_ends.filter((item) => item.tool_call_id === rootCall.tool_call_id);
    if (rootEnd.length !== 1 || rootEnd[0].isError !== false) blocked("async-result lacked a successful Root task END");
    return rootCall;
  }
  validateNestedIdentity(binding, nestedEvent) {
    if (!nestedEvent || typeof nestedEvent !== "object" || Array.isArray(nestedEvent)) return;
    validateKnownIdentityMetadata(nestedEvent, "nested terminal", true);
    for (const [field, expected] of [["agent", binding.agent], ["name", binding.assignment_name], ["agentSource", binding.agentSource]]) {
      const raw = nestedEvent[field];
      if (raw !== undefined && raw !== null && captureSafeIdentifier(raw, `nested ${field} identity`) !== expected) {
        blocked(`nested terminal contradicted its allocated lifecycle ${field} identity`);
      }
    }
    const agentIds = [nestedEvent.agentId, nestedEvent.agent_id].filter((value) => value !== undefined && value !== null).map((value) => captureSafeIdentifier(value, "nested agent identity"));
    if (agentIds.some((value) => value !== binding.allocated_id)) blocked("nested terminal contradicted its allocated lifecycle agent identity");
    const instanceIds = [nestedEvent.instanceId, nestedEvent.instance_id].filter((value) => value !== undefined && value !== null).map((value) => captureSafeIdentifier(value, "nested instance identity"));
    if (instanceIds.some((value) => binding.instance_id && value !== binding.instance_id)) blocked("nested terminal contradicted its allocated lifecycle instance identity");
    const sdkJobIds = [nestedEvent.jobId, nestedEvent.job_id].filter((value) => value !== undefined && value !== null).map((value) => captureSafeIdentifier(value, "nested SDK job identity"));
    if (sdkJobIds.length) {
      if (sdkJobIds.some((value) => value !== sdkJobIds[0])) blocked("nested terminal exposed contradictory SDK job aliases");
      let knownSdkJobId = this.asyncJobIdsByAllocated.get(binding.allocated_id);
      for (const rootCall of this.rootTaskCalls.values()) {
        if (rootCall.tool_call_id !== binding.parent_tool_call_id || !rootCall.ended || rootCall.async?.type !== "task") continue;
        const blockingIndices = new Set(this.evidence.task_records
          .filter((record) => record.source_kind === "task_tool_details" && record.parent_tool_call_id === rootCall.tool_call_id)
          .map((record) => record.index));
        const firstAsyncIndex = rootCall.assignments.findIndex((_, index) => !blockingIndices.has(index));
        if (binding.index === firstAsyncIndex) {
          if (knownSdkJobId && knownSdkJobId !== rootCall.async.jobId) blocked("nested terminal SDK job binding contradicted its owning Root");
          knownSdkJobId = rootCall.async.jobId;
        }
        break;
      }
      if (knownSdkJobId && sdkJobIds.some((value) => value !== knownSdkJobId)) blocked("nested terminal contradicted its allocated SDK job identity");
      const foreignKnownJob = [...this.asyncJobIdsByAllocated.entries()].some(([allocated, jobId]) => allocated !== binding.allocated_id && sdkJobIds.includes(jobId));
      if (foreignKnownJob) blocked("nested terminal exposed another allocated SDK job identity");
    }
  }
  validateAsyncSchema(job) {
    if (!Object.prototype.hasOwnProperty.call(job, "schema")) return null;
    const schema = job.schema;
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) blocked("async-result job schema was malformed");
    if (!["caller", "agent", "session", "none"].includes(schema.source) || !["permissive", "strict"].includes(schema.mode)) blocked("async-result job schema provenance was invalid");
    if (!["valid", "invalid", "unavailable"].includes(schema.status)) blocked("async-result job schema status was invalid");
    if (schema.status !== "valid" && Object.prototype.hasOwnProperty.call(schema, "data")) blocked("async-result job exposed data with an invalid/unavailable schema");
    if (schema.status === "unavailable" && schema.source !== "none") blocked("unavailable async-result schema had a non-none source");
    if (schema.status === "valid" && (schema.source === "none" || !Object.prototype.hasOwnProperty.call(schema, "data"))) blocked("valid async-result schema omitted source data");
    return schema;
  }
  recordAsyncResultMessage(frame, workflowOrdinal) {
    const message = frame?.message;
    if (!message || message.role !== "custom" || message.customType !== "async-result") return false;
    validateKnownIdentityMetadata(frame, "async-result frame");
    const messageId = captureSafeIdentifier(frame.messageId ?? frame.message_id, "async message identity");
    const details = message.details;
    if (!details || typeof details !== "object" || Array.isArray(details) || !Array.isArray(details.jobs) || details.jobs.length === 0) blocked("async-result message omitted a jobs array");
    if (details.jobs.length > MAX_PENDING_OBSERVATIONS) blocked("async-result jobs exceeded the bounded admission count");
    const seen = new Set();
    const seenAllocated = new Set();
    const jobs = details.jobs.map((job) => {
      if (!job || typeof job !== "object" || Array.isArray(job)) blocked("async-result job identity was malformed");
      const jobId = captureSafeIdentifier(job.jobId, "async job identity");
      const agentId = captureSafeIdentifier(job.agentId, "async allocated child identity");
      if (job.type !== "task" || !["completed", "failed", "cancelled"].includes(job.status)) blocked("async-result job type/status was unsupported");
      let rawJob;
      try { rawJob = structuredClone(job); } catch { blocked("async-result job could not be captured atomically"); }
      const identity = this.asyncJobIdentity(rawJob);
      if (seen.has(identity) || seenAllocated.has(agentId)) blocked("async-result payload contained duplicate jobs or allocated agents");
      seen.add(identity);
      seenAllocated.add(agentId);
      return { rawJob, jobId, agentId };
    });
    const rootSessionId = captureSafeIdentifier(this.evidence.root_session?.session_id, "Root session identity");
    if (!rootSessionId) blocked("async-result lacked the observed Root session binding");
    const prepared = [];
    for (const { rawJob, jobId, agentId } of jobs) {
      const binding = this.lifecycleByAllocated.get(`id:${agentId}`);
      if (!binding || binding.lifecycle_status !== "completed" || binding.agentSource !== "project") blocked("async-result job was not bound to a completed allocated child lifecycle");
      const rootCall = this.rootDispatchForBinding(binding);
      const expectedAsync = rootCall.async && typeof rootCall.async === "object" ? rootCall.async : null;
      if (!expectedAsync?.jobId || expectedAsync.type !== "task") blocked("async-result lacked the first actual Root async job binding");
      const progress = rootCall.progress_by_index?.get(binding.index);
      if (!progress || progress.id !== binding.allocated_id || progress.agent !== binding.agent || progress.agentSource !== binding.agentSource) blocked("async-result lacked its matching Root task progress allocation");
      const assignment = this.assignments.get(binding.assignment_name);
      if (!assignment || assignment.agent !== binding.agent || rootCall.assignments[binding.index]?.name !== binding.assignment_name) blocked("async-result job was not bound to the Root assignment");
      const assignmentText = progress.assignment;
      if (assignmentText !== undefined && normalizePublicAssignment(assignmentText) === null) blocked("async-result Root public assignment was malformed");
      const assignmentHash = assignmentText === undefined ? null : sha256Text(normalizePublicAssignment(assignmentText));
      if (binding.assignment_sha256 && assignmentHash && binding.assignment_sha256 !== assignmentHash) blocked("async-result public assignment contradicted its observed Root assignment");
      const blockingIndices = new Set(this.evidence.task_records
        .filter((record) => record.source_kind === "task_tool_details" && record.parent_tool_call_id === rootCall.tool_call_id)
        .map((record) => record.index));
      const firstAsyncIndex = rootCall.assignments.findIndex((_, index) => !blockingIndices.has(index));
      if (firstAsyncIndex < 0) blocked("Root async job had no non-blocking assignment");
      if ((binding.index === firstAsyncIndex) !== (jobId === expectedAsync.jobId)) blocked("async-result contradicted the first registered Root async job binding");
      const previousJobId = this.asyncJobIdsByAllocated.get(binding.allocated_id);
      if (previousJobId !== undefined && previousJobId !== jobId) blocked("one allocated child was delivered under contradictory SDK job ids");
      const schema = this.validateAsyncSchema(rawJob);
      const hostBinding = {
        source: "observed-root-dispatch-lifecycle",
        root_session_id: rootSessionId,
        parent_tool_call_id: binding.parent_tool_call_id,
        allocated_id: binding.allocated_id,
        index: binding.index,
        agent: binding.agent,
        agentSource: binding.agentSource,
        assignment: binding.assignment_name,
        assignment_id: binding.assignment_name,
        job_id: binding.job_id,
        instance_id: binding.instance_id,
        root_task_end_is_error: false,
      };
      const independent = schema?.status === "valid" ? null : this.waitIndependentEvidence(binding);
      const record = {
        source_kind: "task_async_result",
        id: binding.allocated_id,
        allocated_id: binding.allocated_id,
        parent_tool_call_id: binding.parent_tool_call_id,
        index: binding.index,
        root_session_id: rootSessionId,
        agent: binding.agent,
        agentSource: binding.agentSource,
        assignment_id: binding.assignment_name,
        assignment_sha256: binding.assignment_sha256 ?? assignmentHash,
        run_id: this.logicalRunId,
        jobId: binding.job_id,
        instanceId: binding.instance_id,
        status: rawJob.status,
        isError: null,
        is_error_observed: false,
        is_error_source: null,
        exitCode: null,
        exit_code_observed: false,
        error: null,
        error_observed: false,
        aborted: null,
        aborted_observed: false,
        structured_data: schema?.status === "valid" ? structuredClone(schema.data) : null,
        structured_output_status: schema?.status ?? null,
        ...(independent?.observed === true ? { independent_evidence: independent } : {}),
        host_workflow_ordinal: workflowOrdinal,
        async_result: {
          source: "message_end.custom.async-result",
          job: rawJob,
          message_id: messageId,
          host_workflow_ordinal: workflowOrdinal,
          host_binding: hostBinding,
        },
      };
      const key = this.asyncJobIdentity(rawJob);
      const snapshot = digest({ job: rawJob, binding: hostBinding, root_session_id: rootSessionId });
      const prior = this.asyncRecordsByIdentity.get(key);
      if (prior) {
        if (prior.snapshot !== snapshot) blocked("contradictory async-result snapshot for one job identity");
        prepared.push({ duplicate: true, key, record, binding, assignmentText });
        continue;
      }
      const priorWait = this.evidence.task_records.find((candidate) =>
        candidate?.source_kind === "task_wait_result" && candidate.jobId === jobId
      );
      if (priorWait) {
        if (!this.waitRecordsEquivalent(priorWait, record)) blocked("contradictory custom/wait terminal payload, status, or ownership");
        prepared.push({ duplicate: true, key, record, binding, assignmentText });
        continue;
      }
      if (!taskRecordSucceeded(record)) {
        this.capture("async_completion_rejections", {
          source: "message_end.custom.async-result.rejected",
          host_workflow_ordinal: workflowOrdinal,
          root_session_id: rootSessionId,
          binding: hostBinding,
          job_status: rawJob.status,
          schema_present: Object.hasOwn(rawJob, "schema"),
          schema_summary: schema ? {
            source: schema.source,
            mode: schema.mode,
            status: schema.status,
            data_present: Object.hasOwn(schema, "data"),
            error_present: Object.hasOwn(schema, "error"),
          } : null,
          structured_output_status: record.structured_output_status,
          independent_evidence_observed: independent?.observed === true,
          independent_evidence_kind: independent?.kind ?? null,
          pending_writes: this.writeCalls.size,
          pending_root_writes: this.rootWriteCalls.size,
        });
        blocked("async-result did not expose an authoritative successful task completion");
      }
      const inlineKey = correlationKey("task_tool_details", binding.allocated_id, binding.parent_tool_call_id, binding.index, binding.assignment_name);
      if (this.inlineRecordsByIdentity.has(inlineKey)) blocked("one child appeared in both inline and asynchronous task terminals");
      record.digest = sha256Text(JSON.stringify(record));
      prepared.push({ duplicate: false, key, record, binding, assignmentText });
    }
    const additions = prepared.filter((item) => !item.duplicate);
    const rawBytes = additions.reduce((total, item) => total + Buffer.byteLength(JSON.stringify(item.record), "utf8"), 0);
    if (this.evidence.capture.bytes + rawBytes > MAX_CAPTURE_BYTES) blocked("native operational retention exceeded bound");
    const previous = {
      asyncResults: this.evidence.async_results.length,
      taskRecords: this.evidence.task_records.length,
      captureBytes: this.evidence.capture.bytes,
      captureComplete: this.evidence.capture.complete,
      asyncRecords: new Map(this.asyncRecordsByIdentity),
      asyncJobIds: new Map(this.asyncJobIdsByAllocated),
      transportJobs: new Set(this.transportJobIds),
      assignmentStates: [...this.rootTaskCalls.values()].flatMap((call) => call.assignments.map((item) => ({ item, state: structuredClone(item) }))),
      bindingHashes: [...this.lifecycleByAllocated.values()].map((binding) => ({ binding, assignment_sha256: binding.assignment_sha256 })),
    };
    try {
      for (const item of additions) {
        if (item.assignmentText !== undefined) this.recordPublicAssignment(item.binding, item.assignmentText, "Root.task.details.progress.assignment");
        const captureRow = { source: item.record.async_result.source, host_workflow_ordinal: workflowOrdinal, job: safeValue(item.record.async_result.job, 0, "async-result-job"), binding: safeValue(item.record.async_result.host_binding) };
        this.capture("async_results", captureRow, { chargeValue: item.record });
        this.asyncRecordsByIdentity.set(item.key, { snapshot: digest({ job: item.record.async_result.job, binding: item.record.async_result.host_binding, root_session_id: rootSessionId }), record: item.record });
        this.asyncJobIdsByAllocated.set(item.binding.allocated_id, item.record.async_result.job.jobId);
        this.transportJobIds.add(item.record.async_result.job.jobId);
        this.evidence.task_records.push(item.record);
      }
    } catch (error) {
      this.evidence.async_results.length = previous.asyncResults;
      this.evidence.task_records.length = previous.taskRecords;
      this.evidence.capture.bytes = previous.captureBytes;
      this.evidence.capture.complete = previous.captureComplete;
      this.asyncRecordsByIdentity.clear();
      for (const [key, value] of previous.asyncRecords) this.asyncRecordsByIdentity.set(key, value);
      this.asyncJobIdsByAllocated.clear();
      for (const [key, value] of previous.asyncJobIds) this.asyncJobIdsByAllocated.set(key, value);
      this.transportJobIds.clear();
      for (const value of previous.transportJobs) this.transportJobIds.add(value);
      for (const { item, state } of previous.assignmentStates) {
        for (const key of Object.keys(item)) delete item[key];
        Object.assign(item, structuredClone(state));
      }
      for (const { binding, assignment_sha256 } of previous.bindingHashes) {
        if (assignment_sha256 === undefined) delete binding.assignment_sha256;
        else binding.assignment_sha256 = assignment_sha256;
      }
      throw error;
    }
    this.evidence.terminal = { ...(this.evidence.terminal ?? {}), last_async_result_host_workflow_ordinal: workflowOrdinal };
    return true;
  }
  consumeLogical(frame) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new ProbeError("BLOCKED", "RPC frame must be an object");
    validateKnownFrameIdentity(frame);
    const workflowOrdinal = allocateHostWorkflowOrdinal();
    observedFrameOrdinals.set(frame, workflowOrdinal);
    this.currentHostWorkflowOrdinal = workflowOrdinal;
    this.evidence.host_workflow_ordinal = workflowOrdinal;
    if (frame.type === "ready") { this.readyResolved = true; this.ready.resolve(frame); return; }
    if (frame.type === "response") {
      const responseId = captureSafeIdentifier(frame.id, "RPC response identity");
      const waiter = this.responses.get(responseId);
      if (!waiter) throw new ProbeError("BLOCKED", "response carried an unknown or missing RPC command id");
      this.responses.delete(responseId);
      waiter.resolve(frame);
      return;
    }
    if (frame.type === "prompt_result") {
      const promptRequestId = captureSafeIdentifier(frame.id, "prompt result identity");
      const errorObserved = Object.prototype.hasOwnProperty.call(frame, "error");
      const promptResult = {
        status: frame.status ?? null,
        agentInvoked: frame.agentInvoked === true,
        sessionSettled: typeof frame.sessionSettled === "boolean" ? frame.sessionSettled : null,
        id: promptRequestId,
        request_id: promptRequestId,
        host_workflow_ordinal: workflowOrdinal,
        error: errorObserved ? safeValue(frame.error, 0, "error") : null,
        error_observed: errorObserved,
        error_source: errorObserved ? "prompt_result.error" : null,
      };
      const waiter = promptRequestId ? this.promptResults.get(promptRequestId) : this.promptResults.size === 1 ? this.promptResults.values().next().value : null;
      if (promptRequestId && !waiter) throw new ProbeError("BLOCKED", "prompt_result carried an unknown RPC command id");
      if (!promptRequestId && this.promptResults.size !== 1) throw new ProbeError("BLOCKED", "prompt_result omitted id without one unique outstanding waiter");
      this.evidence.terminal = { ...(this.evidence.terminal ?? {}), prompt_result: promptResult };
      if (waiter) {
        const pendingId = [...this.promptResults.entries()].find(([, candidate]) => candidate === waiter)?.[0];
        if (pendingId) this.promptResults.delete(pendingId);
        waiter.resolve(frame);
      }
      return;
    }
    if (frame.type === "session_settled") {
      if (this.pendingLifecycleByAllocated.size) throw new ProbeError("BLOCKED", "Root session settled with unresolved pending lifecycle ownership");
      this.settled = true;
      this.evidence.terminal = { ...(this.evidence.terminal ?? {}), session_settled: true, session_settled_host_workflow_ordinal: workflowOrdinal };
      for (const waiter of this.settledWaiters) waiter.resolve(frame); this.settledWaiters = []; return;
    }
    if (["tool_execution_start", "tool_execution_update", "tool_stream_update", "tool_execution_end"].includes(frame.type)) { this.recordTool(frame); return; }
    if (["subagent_lifecycle", "subagent_progress", "subagent_event"].includes(frame.type)) { this.recordSubagent(frame); return; }
    if (frame.type === "message_end") {
      const usage = frame.message?.usage;
      if (usage && typeof usage === "object") this.evidence.usage = Object.fromEntries(Object.entries(usage).filter(([key, value]) => !sensitiveKey(key) && typeof value === "number"));
      const message = frame.message && typeof frame.message === "object" ? frame.message : null;
      if (message && message.role === "custom" && message.customType === "async-result") {
        this.recordAsyncResultMessage(frame, workflowOrdinal);
        return;
      }
      if (message && message.role === "assistant") {
        if (message.stopReason === "error" || message.stopReason === "aborted") {
          const errorMessageObserved = Object.hasOwn(message, "errorMessage");
          this.evidence.continuation_failures.push({
            source: "message_end.assistant",
            host_workflow_ordinal: workflowOrdinal,
            stopReason: message.stopReason,
            errorMessage: errorMessageObserved ? safeValue(message.errorMessage, 0, "error") : null,
            error_message_observed: errorMessageObserved,
          });
        }
        const bounded = boundedPublicAssistant({ content: message.content, text: message.text });
        this.evidence.assistant_public.push({ source: "message_end", host_arrival_ordinal: ++this.hostArrivalSequence, host_workflow_ordinal: workflowOrdinal, message: bounded });
        this.evidence.terminal = { ...(this.evidence.terminal ?? {}), last_message: bounded, last_message_host_workflow_ordinal: workflowOrdinal };
      }
      return;
    }
    if (frame.type === "agent_end") {
      const agentEnd = { yielded: frame.yielded === true, isTerminal: frame.isTerminal === true, host_workflow_ordinal: workflowOrdinal };
      if (frame.awaitingAsyncWork === true) agentEnd.awaitingAsyncWork = true;
      this.evidence.agent_ends.push(agentEnd);
      this.evidence.terminal = { ...(this.evidence.terminal ?? {}), agent_end: agentEnd };
      return;
    }
    if (/login|auth|host_uri|host_tool|extension_ui/i.test(String(frame.type ?? ""))) throw new ProbeError("BLOCKED", "OMP requested unauthorized host/auth/UI boundary");
  }
  recordRootCommand(frame, name, args, event, eventToolCallId) {
    const policy = this.rootCommandPolicy;
    if (!policy || name !== policy.tool) throw new ProbeError("BLOCKED", "root command was not admitted by the exact helper policy");
    this.validateRootCommandPolicy();
    const observedArgs = frame.arguments ?? frame.args ?? frame.input ?? frame.toolCall?.arguments ?? frame.tool_call?.arguments ?? null;
    const argsObject = observedArgs && typeof observedArgs === "object" && !Array.isArray(observedArgs) ? observedArgs : null;
    const command = typeof argsObject?.command === "string" ? argsObject.command : null;
    const extraKeys = argsObject ? Object.keys(argsObject).filter((key) => key !== "command") : [];
    if (extraKeys.length > 0) {
      const keys = extraKeys.slice(0, 32).map((key, index) => ({
        source: key,
        retained: /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) && !sensitiveKey(key) && !/^(?:sk-|ghp_|github_pat_|AKIA)/i.test(key) ? key : `redacted-key-${index}`,
      }));
      const argumentTypes = Object.create(null);
      for (const key of keys) {
        const value = argsObject[key.source];
        argumentTypes[key.retained] = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
      }
      throw new ProbeError("BLOCKED", "root helper command supplied unapproved arguments", {
        operational_guard: {
          reason_code: "ROOT_HELPER_ARGUMENTS_NOT_APPROVED",
          tool: name,
          tool_call_id: preserveIdentifier(eventToolCallId),
          host_arrival_ordinal: event.host_arrival_ordinal,
          host_workflow_ordinal: event.host_workflow_ordinal,
          command_match: command === policy.command,
          extra_argument_keys: keys.map((key) => key.retained),
          extra_argument_key_count: extraKeys.length,
          extra_argument_keys_truncated: extraKeys.length > keys.length,
          extra_argument_values_omitted: true,
          argument_types: argumentTypes,
        },
      });
    }
    const phase = frame.type === "tool_execution_start" ? "start" : frame.type === "tool_execution_update" || frame.type === "tool_stream_update" ? "update" : frame.type === "tool_execution_end" ? "end" : null;
    if (!phase) throw new ProbeError("BLOCKED", "root helper command had an unsupported lifecycle phase");
    if ((phase === "start" && command !== policy.command) || (command !== null && command !== policy.command)) {
      throw new ProbeError("BLOCKED", phase === "start" ? "root helper command START was not the exact approved command" : "root helper command changed after START", {
        operational_guard: {
          reason_code: "ROOT_HELPER_COMMAND_NOT_APPROVED", tool: name, phase,
          tool_call_id: preserveIdentifier(eventToolCallId),
          host_arrival_ordinal: event.host_arrival_ordinal, host_workflow_ordinal: event.host_workflow_ordinal,
          observed_command_sha256: command === null ? null : sha256Text(command),
          observed_command_bytes: command === null ? null : Buffer.byteLength(command, "utf8"),
          expected_command_sha256: sha256Text(policy.command),
          expected_command_bytes: Buffer.byteLength(policy.command, "utf8"),
          matches_after_trim_only: command !== null && command.trim() === policy.command,
          matches_after_slash_change_only: command !== null && command.replaceAll("\\", "/") === policy.command.replaceAll("\\", "/"),
          has_expected_command_prefix: command !== null && command.startsWith(`${policy.command} `),
          selected_argument_type: observedArgs === null ? "null" : Array.isArray(observedArgs) ? "array" : typeof observedArgs,
          command_field_type: argsObject && Object.hasOwn(argsObject, "command") ? typeof argsObject.command : "absent",
          caller_argument_type: args === null ? "null" : Array.isArray(args) ? "array" : typeof args,
          caller_command_sha256: typeof args?.command === "string" ? sha256Text(args.command) : null,
          argument_values_omitted: true,
        },
      });
    }
    if (!eventToolCallId) throw new ProbeError("BLOCKED", "root helper command omitted its full tool call id");
    const binding = { kind: policy.kind, admitted: true, cwd: policy.cwd, intent_path: policy.intent.path, helper_path: policy.script.path, helper_realpath: policy.script.realpath, script_sha256: policy.script.sha256, executable_path: policy.executable.path, executable_realpath: policy.executable.realpath, executable_sha256: policy.executable.sha256, command_sha256: policy.command_sha256 };
    event.command_sha256 = policy.command_sha256;
    event.host_policy_binding = binding;
    const key = correlationKey(eventToolCallId, name.toLowerCase());
    const prior = this.rootCommandCalls.get(key);
    if (phase === "start") {
      if (prior) throw new ProbeError("BLOCKED", "duplicate root helper command START");
      const start = { phase, tool: name, tool_call_id: preserveIdentifier(eventToolCallId), command, host_policy_binding: binding, sequence: event.sequence, host_arrival_ordinal: event.host_arrival_ordinal, host_workflow_ordinal: event.host_workflow_ordinal };
      this.rootCommandCalls.set(key, start);
      this.evidence.root_command_results.push(start);
      return;
    }
    if (!prior) throw new ProbeError("BLOCKED", "root helper command UPDATE/END was not correlated to START");
    if (command !== null && prior.command !== command) throw new ProbeError("BLOCKED", "root helper command changed after START");
    if (phase === "update") {
      const update = { phase, tool: name, tool_call_id: preserveIdentifier(eventToolCallId), command: prior.command, host_policy_binding: binding, sequence: event.sequence, host_arrival_ordinal: event.host_arrival_ordinal, host_workflow_ordinal: event.host_workflow_ordinal };
      this.evidence.root_command_results.push(update);
      return;
    }
    if (typeof frame.isError !== "boolean") throw new ProbeError("BLOCKED", "root helper command END omitted explicit isError");
    const report = commandReport(frame);
    const reportObject = report && typeof report === "object" && !Array.isArray(report) ? report : null;
    const status = typeof reportObject?.status === "string" ? reportObject.status.toUpperCase() : "";
    if (!["CLOSED", "BLOCKED"].includes(status)) throw new ProbeError("BLOCKED", "root helper command result omitted CLOSED/BLOCKED status");
    const exitCode = extractExitCode(frame);
    const end = { phase, tool: name, tool_call_id: preserveIdentifier(eventToolCallId), command: prior.command, host_policy_binding: binding, is_error: frame.isError, is_error_observed: true, is_error_source: "tool_execution_end", exit_code: Number.isInteger(exitCode) ? exitCode : null, result: report, status, sequence: event.sequence, host_arrival_ordinal: event.host_arrival_ordinal, host_workflow_ordinal: event.host_workflow_ordinal };
    this.evidence.root_command_results.push(end);
    this.rootCommandCalls.delete(key);
    this.validateRootCommandPolicy();
  }
  resolveReadPath(requested, scope = "Root", context = {}) {
    if (typeof requested !== "string" || !requested) blocked("read omitted its requested path");
    let value = requested.replace(READ_PATH_SELECTOR, "");
    // SDK comma lists can carry raw/range modifiers on either side and repeat
    // the colon after a comma. Existing literal files still win, as in read.
    if (value !== requested && !/^[a-z][a-z0-9+.-]*:\/\//i.test(requested)) {
      const literal = path.resolve(this.cwd, requested);
      if (inside(this.readRoot, literal) && fs.existsSync(noSymlinkPath(this.readRoot, literal, "private literal read source"))) value = requested;
    }
    const transport = /^(agent|proc|history):\/\/([^/?#]+)$/i.exec(value);
    if (transport) {
      const kind = transport[1].toLowerCase();
      const id = transport[2];
      if (scope === "Root") blocked("Root read used an SDK transport URI");
      if ((kind === "agent" || kind === "history") && (scope !== id || !this.lifecycleByAllocated.has(`id:${id}`))) blocked("read used an unowned SDK agent/history URI");
      if (kind === "proc" && !this.transportJobIds.has(id)) blocked("read used an unbound SDK proc URI");
      return value;
    }
    let resolved;
    if (value.startsWith("skill://")) {
      const match = /^skill:\/\/([^/?#]+)(?:\/([^?#]*))?(?:[?#].*)?$/.exec(value);
      if (!match || !SKILLS.includes(match[1])) blocked("read used an unknown or non-project managed skill URI");
      let relative;
      try { relative = decodeURIComponent(match[2] ?? "") || "SKILL.md"; }
      catch { blocked("read skill URI contained invalid URL encoding"); }
      if (relative.includes("\0") || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || /^[a-z]:/i.test(relative) || relative.split(/[\\/]/).includes("..")) blocked("read skill URI escaped its managed skill directory");
      const base = path.join(this.readRoot, ".omp", "skills", match[1]);
      resolved = path.resolve(base, relative);
      if (!inside(base, resolved)) blocked("read skill URI escaped its managed skill directory");
    } else {
      const resource = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value);
      if (resource) blocked("read used a non-project resource URI", {
        operational_guard: unsupportedReadUriGuard(
          value,
          resource[1],
          scope,
          context.tool_call_id,
          context.host_arrival_ordinal,
          context.host_workflow_ordinal,
        ),
      });
      const physicalPath = value.replace(/(\.(?:json|jsonl|ndjson))\?q=[\s\S]*$/i, "$1");
      resolved = path.resolve(this.cwd, physicalPath);
    }
    try { return noSymlinkPath(this.readRoot, resolved, "private read source"); }
    catch (error) {
      if (!inside(this.readRoot, resolved)) error.operational_guard = {
        reason_code: "READ_PATH_OUTSIDE_PROJECT",
        tool: "read",
        requested_sha256: sha256Bytes(Buffer.from(requested, "utf8")),
        requested_bytes: Buffer.byteLength(requested, "utf8"),
        resolved_sha256: sha256Bytes(Buffer.from(resolved, "utf8")),
        requested_kind: path.posix.isAbsolute(value) ? "POSIX_ABSOLUTE" : path.win32.isAbsolute(value) ? "WINDOWS_ABSOLUTE" : "RELATIVE",
        scope: boundedOperationalGuardIdentifier(scope, "scope"),
        tool_call_id: boundedOperationalGuardIdentifier(context.tool_call_id, "tool-call-id"),
        host_arrival_ordinal: normalizeHostWorkflowOrdinal(context.host_arrival_ordinal),
        host_workflow_ordinal: normalizeHostWorkflowOrdinal(context.host_workflow_ordinal),
      };
      throw error;
    }
  }
  correlateReadFrame(frame, name, observedPaths, scope, hostArrivalOrdinal = null) {
    this.readCalls ??= new Map();
    const id = fullToolCallId(frame, ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"]);
    if (!id) blocked("read event omitted its actual tool call identifier");
    const key = correlationKey(scope, id);
    const phase = frame.type === "tool_execution_start" ? "start" : frame.type === "tool_execution_end" ? "end" : "update";
    const context = {
      tool_call_id: id,
      host_arrival_ordinal: hostArrivalOrdinal,
      host_workflow_ordinal: this.currentHostWorkflowOrdinal,
    };
    const resolvedPaths = observedPaths.map((value) => this.resolveReadPath(value, scope, context));
    if (phase === "start") {
      if (this.readCalls.has(key) || resolvedPaths.length === 0) blocked("read START is duplicate or omitted its path");
      const argumentEnvelopes = [frame.arguments, frame.args, frame.input, frame.toolCall?.arguments, frame.tool_call?.arguments, frame].filter((value) => value !== undefined && value !== null);
      const sliced = argumentEnvelopes.some((args) => typeof args !== "object" || Array.isArray(args)
        || ["offset", "limit", "range", "startLine", "endLine", "start_line", "end_line"].some((field) => Object.hasOwn(args, field)));
      const read = { full_content_requested: !sliced && observedPaths.every((value) => !READ_PATH_SELECTOR.test(value) && !/\.(?:json|jsonl|ndjson)\?q=/i.test(value)) };
      this.readCalls.set(key, { paths: resolvedPaths, requested_paths: observedPaths, name, read });
      return { phase, paths: resolvedPaths, requested_paths: observedPaths, success: false, read };
    }
    const prior = this.readCalls.get(key);
    if (!prior || prior.name !== name) blocked("read event has no matching START");
    if (resolvedPaths.length && (resolvedPaths.length !== prior.paths.length || resolvedPaths.some((value, index) => value !== prior.paths[index] && !(typeof value === "string" && typeof prior.paths[index] === "string" && !value.includes("://") && !prior.paths[index].includes("://") && samePath(value, prior.paths[index]))))) blocked("read path drifted from its correlated START");
    if (phase !== "end") return { phase, paths: prior.paths, requested_paths: prior.requested_paths, success: false };
    this.readCalls.delete(key);
    if (typeof frame.isError !== "boolean") blocked("read END omitted its actual error signal");
    const success = frame.isError === false && Array.isArray(frame.result?.content);
    const sourceFiles = success ? prior.paths.flatMap((value) => {
      if (value.includes("://")) return [];
      const resolved = noSymlinkPath(this.readRoot, value, "successful private read source");
      if (fs.lstatSync(resolved).isDirectory()) return [];
      const file = fileRecord(resolved, "successful private read source");
      return [{ path: path.relative(this.cwd, file.path).replaceAll("\\", "/"), bytes: file.bytes, sha256: file.sha256 }];
    }) : [];
    return { phase, paths: prior.paths, requested_paths: prior.requested_paths, success, read: prior.read, source_files: sourceFiles, correlation: { status: "matched", tool_call_id: id, scope, requested_paths: observedPaths, path_resolution: prior.paths.some((value) => value.includes("://")) ? "bound-sdk-transport-uri" : "host-confined-project-filesystem-or-managed-skill-uri" } };
  }
  validateWaitJob(job, label, statuses) {
    if (!job || typeof job !== "object" || Array.isArray(job)) blocked(`${label} contained a malformed SDK snapshot`);
    const unknown = Object.keys(job).filter((key) => !WAIT_JOB_FIELDS.has(key));
    if (unknown.length) blocked(`${label} exposed an unapproved field`);
    const id = captureSafeIdentifier(job.id, `${label} SDK job identity`);
    if (job.type !== "task" || !statuses.has(job.status)) blocked(`${label} was not an admitted task job status`);
    for (const key of ["label", "resultText", "errorText"]) {
      if (Object.prototype.hasOwnProperty.call(job, key) && typeof job[key] !== "string") blocked(`${label} exposed an invalid ${key} type`);
    }
    for (const key of ["durationMs", "settledAtMs", "completionPercent", "requests", "cost", "contextTokens", "contextWindow"]) {
      if (Object.prototype.hasOwnProperty.call(job, key) && (typeof job[key] !== "number" || !Number.isFinite(job[key]))) blocked(`${label} exposed an invalid ${key} type`);
    }
    if (Object.prototype.hasOwnProperty.call(job, "meta")
      && (!job.meta || typeof job.meta !== "object" || Array.isArray(job.meta))) blocked(`${label} exposed an invalid meta type`);
    if (Object.prototype.hasOwnProperty.call(job, "exitCode") && !Number.isSafeInteger(job.exitCode)) blocked(`${label} exposed an invalid exitCode type`);
    if (Object.prototype.hasOwnProperty.call(job, "agentOutputPublished") && typeof job.agentOutputPublished !== "boolean") blocked(`${label} exposed an invalid agentOutputPublished type`);
    if (Object.prototype.hasOwnProperty.call(job, "agentUrlId")) {
      captureSafeIdentifier(job.agentUrlId, `${label} SDK agent URL identity`);
      if (typeof job.agentUrlId !== "string" || !job.agentUrlId.trim()) blocked(`${label} SDK agent URL identity was malformed`);
    }
    if (Object.prototype.hasOwnProperty.call(job, "structured")) {
      const schema = job.structured;
      if (!schema || typeof schema !== "object" || Array.isArray(schema)
        || !["caller", "agent", "session", "none"].includes(schema.source)
        || !["permissive", "strict"].includes(schema.mode)
        || !["valid", "invalid", "unavailable"].includes(schema.status)) blocked(`${label} structured profile was malformed`);
      if (schema.status === "valid" && (schema.source === "none" || !Object.prototype.hasOwnProperty.call(schema, "data"))) blocked(`${label} valid structured profile omitted source data`);
      if (schema.status !== "valid" && Object.prototype.hasOwnProperty.call(schema, "data")) blocked(`${label} non-valid structured profile exposed data`);
      if (schema.status === "unavailable" && schema.source !== "none") blocked(`${label} unavailable structured profile had a non-none source`);
    }
    return id;
  }
  waitSnapshot(job) {
    const id = this.validateWaitJob(job, "wait END", WAIT_END_STATUSES);
    let snapshot;
    try { snapshot = structuredClone(job); } catch { blocked("wait SDK snapshot could not be captured atomically"); }
    let bytes;
    try { bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8"); } catch { blocked("wait SDK snapshot could not be bounded"); }
    if (bytes > MAX_CAPTURE_BYTES) blocked("wait SDK snapshot exceeded the capture bound");
    return { id, snapshot, bytes };
  }
  waitUpdateSnapshot(job) {
    const id = this.validateWaitJob(job, "Root wait UPDATE", WAIT_UPDATE_STATUSES);
    const bytes = boundedWaitMetadataBytes(job, MAX_CAPTURE_BYTES);
    if (bytes > MAX_CAPTURE_BYTES) blocked("Root wait UPDATE snapshot exceeded the capture bound");
    return { id, bytes };
  }
  waitBindingCandidates(job, root) {
    const jobId = captureSafeIdentifier(job?.id, "wait SDK job identity");
    const progressRows = root.progress_by_index instanceof Map ? root.progress_by_index : new Map();
    const blockingIndices = new Set(this.evidence.task_records
      .filter((record) => record.source_kind === "task_tool_details" && record.parent_tool_call_id === root.tool_call_id)
      .map((record) => record.index));
    const firstAsyncIndex = root.assignments.findIndex((_, index) => !blockingIndices.has(index));
    const requestedId = Object.prototype.hasOwnProperty.call(job, "agentUrlId")
      ? captureSafeIdentifier(job.agentUrlId, "wait SDK agent URL identity")
      : null;
    const requestedAllocationKnown = requestedId !== null && this.lifecycleByAllocated.has(`id:${requestedId}`);
    const candidates = [];
    const running = job.status === "running";
    for (const binding of this.lifecycleByAllocated.values()) {
      const lifecycleStatus = String(binding.lifecycle_status ?? "").toLowerCase();
      const lifecycleAdmitted = running
        ? ["started", "running", "progress", "completed"].includes(lifecycleStatus)
        : lifecycleStatus === "completed";
      if (binding.parent_tool_call_id !== root.tool_call_id
        || !lifecycleAdmitted
        || binding.agentSource !== "project") continue;
      const progress = progressRows.get(binding.index);
      const assignment = this.assignments.get(binding.assignment_name);
      if (!progress || progress.id !== binding.allocated_id || progress.agent !== binding.agent || progress.agentSource !== binding.agentSource
        || !assignment || assignment.agent !== binding.agent || root.assignments[binding.index]?.name !== binding.assignment_name) continue;
      const allocatedHint = requestedId !== null && requestedId === binding.allocated_id;
      const navigationFallback = requestedId !== null && !requestedAllocationKnown && requestedId === jobId;
      const firstJobMatch = jobId === root.async.jobId
        && binding.index === firstAsyncIndex
        && (requestedId === null || requestedId === jobId || allocatedHint);
      const secondaryAllocatedMatch = jobId !== root.async.jobId
        && binding.index !== firstAsyncIndex
        && allocatedHint;
      const navigationMatch = jobId !== root.async.jobId
        && binding.index !== firstAsyncIndex
        && navigationFallback;
      if (firstJobMatch || secondaryAllocatedMatch || navigationMatch) candidates.push({ binding, assignment, firstAsyncIndex });
    }
    return candidates;
  }
  waitRootForJob(job) {
    const roots = [...this.rootTaskCalls.values()]
      .filter((call) => call.kind === "dispatch" && call.ended === true && call.async?.type === "task");
    const candidates = roots.filter((root) => this.waitBindingCandidates(job, root).length > 0);
    if (candidates.length === 0) blocked("wait SDK job did not match an observed completed Root TASK async/lifecycle binding");
    if (candidates.length !== 1) blocked("wait SDK job matched multiple observed Root TASK async/lifecycle bindings");
    const root = candidates[0];
    const end = this.evidence.root_task_ends.filter((item) => item.tool_call_id === root.tool_call_id);
    if (end.length !== 1 || end[0].isError !== false) blocked("wait terminal lacked one successful Root TASK END");
    return root;
  }
  waitBindingForJob(job, root) {
    const candidates = this.waitBindingCandidates(job, root);
    if (candidates.length !== 1) blocked("wait SDK job lacked a unique observed Root dispatch/lifecycle owner");
    const [{ binding, assignment, firstAsyncIndex }] = candidates;
    if (binding.index === firstAsyncIndex && job.id !== root.async.jobId) blocked("Root first async assignment was not bound to its actual SDK job id");
    this.rootDispatchForBinding(binding);
    return { binding, root, assignment, firstAsyncIndex };
  }
  waitIndependentEvidence(binding) {
    const rows = this.evidence.command_results.filter((item) =>
      item?.allocated_id === binding.allocated_id
      && item?.parent_tool_call_id === binding.parent_tool_call_id
      && item?.phase === "end"
      && item?.nested_event_type === "tool_execution_end"
      && item?.observed?.present === true
      && item?.is_error_observed === true
      && (item?.is_error === false || (item?.is_error === true
        && item?.exit_code_observed === true && Number.isSafeInteger(item?.exit_code) && item.exit_code !== 0
        && item?.guard?.reason_code === null && item?.correlation?.status === "matched"
        && ["FAIL", "FALHOU"].includes(item?.report?.status)))
    );
    const reads = this.evidence.subagent_reads.filter((item) =>
      item?.allocated_id === binding.allocated_id && item?.parent_tool_call_id === binding.parent_tool_call_id && Array.isArray(item.source_files) && item.source_files.length > 0
    );
    const writes = this.evidence.subagent_writes.filter((item) =>
      item?.allocated_id === binding.allocated_id
      && item?.parent_tool_call_id === binding.parent_tool_call_id
      && item?.phase === "end"
      && item?.terminal_event === true
    );
    if (binding.agent === "backend-developer") {
      const observedBinding = writes[0]?.identity?.observed_binding;
      const expectedBinding = {
        root_session_id: this.evidence.root_session?.session_id,
        parent_tool_call_id: binding.parent_tool_call_id, allocated_id: binding.allocated_id,
        index: binding.index, agent: binding.agent, agentSource: binding.agentSource,
        assignment_id: binding.assignment_name, job_id: binding.job_id, instance_id: binding.instance_id,
      };
      const authorityMatches = writes[0]?.role === "backend-developer"
        && writes[0]?.role_source === "observed-root-dispatch-lifecycle"
        && writes[0]?.identity?.matches?.observed_binding === true
        && observedBinding?.source === "observed-root-dispatch-lifecycle"
        && Object.entries(expectedBinding).every(([key, value]) => observedBinding?.[key] === value);
      const successful = authorityMatches && this.writeCalls.size === 0 && this.rootWriteCalls.size === 0 && writes.length === 1
        && writes[0]?.terminal_error_observed === true
        && writes[0]?.terminal_error === false
        && writes[0]?.correlation?.status === "matched"
        && writes[0]?.correlation?.identity_match === true
        && writes[0]?.correlation?.task_match === true
        && writes[0]?.correlation?.public_identity === binding.allocated_id
        && writes[0]?.guard?.reason_code === null
        && writes[0]?.guard?.paths_in_allowlist === true
        && Array.isArray(writes[0]?.paths)
        && writes[0].paths.length === 1
        && sameWritePath(this.cwd, writes[0].paths[0], "app/bin/quality.mjs")
        && writes[0]?.root_session_id === this.evidence.root_session?.session_id
        && writes[0]?.parent_tool_call_id === binding.parent_tool_call_id
        && writes[0]?.allocated_id === binding.allocated_id
        && writes[0]?.index === binding.index
        && writes[0]?.job_id === binding.job_id
        && writes[0]?.instance_id === binding.instance_id;
      if (!successful) return { observed: false, kind: null, count: 0 };
      const write = structuredClone(writes[0]);
      write.paths = ["app/bin/quality.mjs"];
      const proof = {
        observed: true,
        kind: "native09-backend-repair-write",
        count: 1,
        root_session_id: this.evidence.root_session?.session_id ?? null,
        parent_tool_call_id: binding.parent_tool_call_id,
        allocated_id: binding.allocated_id,
        index: binding.index,
        agent: binding.agent,
        agentSource: binding.agentSource,
        assignment_id: binding.assignment_name,
        job_id: binding.job_id,
        instance_id: binding.instance_id,
        write,
      };
      return proof;
    }
    const successfulWrites = writes.filter((item) =>
      item?.terminal_error_observed === true
      && item?.terminal_error === false
      && item?.correlation?.status === "matched"
      && item?.correlation?.identity_match === true
      && item?.guard?.reason_code === null
    );
    if (binding.agent === "validator" && rows.length > 0) return { observed: true, kind: "validator-bash", count: rows.length };
    if (binding.agent === "spec-kit-author" && (reads.length > 0 || successfulWrites.length > 0)) return { observed: true, kind: "spec-kit-file", count: reads.length + successfulWrites.length };
    return { observed: false, kind: null, count: 0 };
  }
  waitRecordsEquivalent(prior, candidate) {
    const actualJobId = (record) => record?.source_kind === "task_wait_result"
      ? record.wait_result?.job?.id
      : record?.async_result?.job?.jobId;
    const priorJobId = actualJobId(prior);
    const candidateJobId = actualJobId(candidate);
    if (!priorJobId || priorJobId !== candidateJobId) return false;
    const fields = ["id", "allocated_id", "parent_tool_call_id", "index", "root_session_id", "agent", "agentSource", "assignment_id", "status"];
    if (fields.some((field) => prior[field] !== candidate[field])) return false;
    const priorSchema = prior.source_kind === "task_wait_result" ? prior.wait_result?.job?.structured : prior.async_result?.job?.schema;
    const candidateSchema = candidate.source_kind === "task_wait_result" ? candidate.wait_result?.job?.structured : candidate.async_result?.job?.schema;
    if (canonical(priorSchema ?? null) !== canonical(candidateSchema ?? null)
      || canonical(prior.structured_data ?? null) !== canonical(candidate.structured_data ?? null)) return false;
    const priorExitObserved = prior.source_kind === "task_wait_result" && prior.exit_code_observed === true;
    const candidateExitObserved = candidate.source_kind === "task_wait_result" && candidate.exit_code_observed === true;
    if (priorExitObserved && prior.exitCode !== 0 && candidate.source_kind !== "task_wait_result") return false;
    if (candidateExitObserved && candidate.exitCode !== 0 && prior.source_kind !== "task_wait_result") return false;
    if (prior.source_kind === "task_wait_result" && candidate.source_kind === "task_wait_result"
      && canonical(prior.wait_result?.job ?? null) !== canonical(candidate.wait_result?.job ?? null)) return false;
    return true;
  }
  recordWaitTool(frame, event, eventToolCallId) {
    const toolCallId = captureSafeIdentifier(eventToolCallId, "Root wait tool call identity");
    if (!toolCallId) blocked("Root wait START/END omitted its own exact tool call id");
    const key = correlationKey(toolCallId, "wait");
    const pending = this.waitCalls.get(key);
    if (frame.type !== "tool_execution_start" && !pending) blocked("Root wait lifecycle phase was not correlated to its START");
    if (frame.type === "tool_execution_start" && pending) blocked("duplicate Root wait START");
    if (frame.type === "tool_execution_start") {
      this.waitCalls.set(key, { tool_call_id: toolCallId, sequence: event.sequence, host_arrival_ordinal: event.host_arrival_ordinal, host_workflow_ordinal: event.host_workflow_ordinal });
      this.evidence.tool_events.push(event);
      return;
    }
    if (frame.type === "tool_execution_update" || frame.type === "tool_stream_update") {
      const details = this.taskDetailsFromFrame(frame);
      let progressCount = 0;
      let jobCount = 0;
      let jobBytes = 0;
      for (const detail of details) {
        if (detail.results !== undefined || detail.async !== undefined) blocked("Root wait UPDATE exposed a terminal payload before END");
        if (detail.jobs !== undefined) {
          if (!Array.isArray(detail.jobs) || detail.jobs.length > MAX_PENDING_OBSERVATIONS) blocked("Root wait UPDATE jobs exceeded the bounded admission count");
          jobCount += detail.jobs.length;
          if (jobCount > MAX_PENDING_OBSERVATIONS) blocked("Root wait UPDATE jobs exceeded the bounded admission count");
          for (const job of detail.jobs) {
            jobBytes += this.waitUpdateSnapshot(job).bytes;
            if (jobBytes > MAX_CAPTURE_BYTES) blocked("Root wait UPDATE snapshots exceeded the capture bound");
          }
        }
        if (detail.progress === undefined) continue;
        if (!Array.isArray(detail.progress) || detail.progress.length > MAX_PENDING_OBSERVATIONS) blocked("Root wait UPDATE progress exceeded the bounded admission count");
        progressCount += detail.progress.length;
        if (progressCount > MAX_PENDING_OBSERVATIONS) blocked("Root wait UPDATE progress exceeded the bounded admission count");
        for (const row of detail.progress) validateKnownIdentityMetadata(row, "Root wait progress identity", true);
      }
      this.evidence.tool_events.push(event);
      return;
    }
    if (frame.type !== "tool_execution_end") blocked("Root wait emitted an unsupported lifecycle phase");
    if (typeof frame.isError !== "boolean" || frame.isError !== false) blocked("Root wait END must explicitly report isError:false");
    const details = frame.result?.details;
    if (!details || typeof details !== "object" || Array.isArray(details) || details.op !== "wait" || !Array.isArray(details.jobs)) blocked("Root wait END omitted its actual jobs snapshot");
    if (details.jobs.length < 1 || details.jobs.length > MAX_PENDING_OBSERVATIONS) blocked("Root wait jobs exceeded the bounded admission count");
    const snapshots = details.jobs.map((job) => this.waitSnapshot(job));
    const snapshotBytes = snapshots.reduce((total, item) => total + item.bytes, 0);
    if (snapshotBytes > MAX_CAPTURE_BYTES) blocked("Root wait END snapshots exceeded the capture bound");
    const jobIds = new Set();
    const allocatedIds = new Set();
    for (const item of snapshots) {
      if (jobIds.has(item.id)) blocked("Root wait END contained duplicate SDK job identities");
      jobIds.add(item.id);
    }
    const resolved = snapshots.map((item) => {
      const owner = this.waitBindingForJob(item.snapshot, this.waitRootForJob(item.snapshot));
      if (toolCallId === owner.binding.parent_tool_call_id) blocked("Root wait tool call id must remain distinct from its parent TASK call id");
      if (allocatedIds.has(owner.binding.allocated_id)) blocked("Root wait END contained duplicate allocated child identities");
      allocatedIds.add(owner.binding.allocated_id);
      return { ...item, ...owner };
    });
    const hostWorkflowOrdinal = normalizeHostWorkflowOrdinal(event.host_workflow_ordinal);
    if (!hostWorkflowOrdinal) blocked("Root wait END omitted its host workflow ordinal");
    const rootSessionId = captureSafeIdentifier(this.evidence.root_session?.session_id, "Root session identity");
    if (!rootSessionId) blocked("Root wait END lacked the observed Root session binding");
    const records = resolved.filter(({ snapshot }) => snapshot.status !== "running").map(({ snapshot, id, binding, assignment }) => {
      const schema = snapshot.structured;
      const independent = this.waitIndependentEvidence(binding);
      const hostBinding = {
        source: "observed-root-dispatch-lifecycle",
        root_session_id: rootSessionId,
        parent_tool_call_id: binding.parent_tool_call_id,
        allocated_id: binding.allocated_id,
        index: binding.index,
        agent: binding.agent,
        agentSource: binding.agentSource,
        assignment: binding.assignment_name,
        assignment_id: binding.assignment_name,
        job_id: binding.job_id,
        instance_id: binding.instance_id,
        root_task_end_is_error: false,
      };
      const record = {
        source_kind: "task_wait_result",
        id: binding.allocated_id,
        allocated_id: binding.allocated_id,
        parent_tool_call_id: binding.parent_tool_call_id,
        index: binding.index,
        root_session_id: rootSessionId,
        agent: binding.agent,
        agentSource: binding.agentSource,
        assignment_id: assignment.name,
        assignment_sha256: binding.assignment_sha256 ?? null,
        run_id: this.logicalRunId,
        jobId: id,
        instanceId: binding.instance_id,
        status: snapshot.status,
        isError: null,
        is_error_observed: false,
        is_error_source: null,
        exitCode: Number.isSafeInteger(snapshot.exitCode) ? snapshot.exitCode : null,
        exit_code_observed: Number.isSafeInteger(snapshot.exitCode),
        error: null,
        error_observed: false,
        aborted: null,
        aborted_observed: false,
        structured_data: schema?.status === "valid" ? structuredClone(schema.data) : null,
        structured_output_status: schema?.status ?? null,
        independent_evidence: independent,
        host_workflow_ordinal: hostWorkflowOrdinal,
        wait_result: {
          source: "tool_execution_end.result.details.jobs",
          tool: "wait",
          tool_call_id: toolCallId,
          host_workflow_ordinal: hostWorkflowOrdinal,
          is_error: false,
          is_error_observed: true,
          job: snapshot,
          host_binding: hostBinding,
        },
      };
      record.digest = sha256Text(JSON.stringify(record));
      return { record, hostBinding };
    });
    const actualSdkJobId = (candidate) => candidate?.source_kind === "task_wait_result"
      ? candidate.wait_result?.job?.id
      : candidate?.async_result?.job?.jobId;
    const existing = records.map(({ record }) => {
      const ownerRecords = this.evidence.task_records.filter((candidate) =>
        (candidate?.source_kind === "task_async_result" || candidate?.source_kind === "task_wait_result")
        && candidate.allocated_id === record.allocated_id
        && candidate.parent_tool_call_id === record.parent_tool_call_id
        && candidate.index === record.index
        && actualSdkJobId(candidate),
      );
      if (ownerRecords.some((candidate) => actualSdkJobId(candidate) !== record.jobId)) blocked("wait SDK job contradicted an existing allocated child authority");
      const mappedJobId = this.asyncJobIdsByAllocated.get(record.allocated_id);
      if (mappedJobId !== undefined && mappedJobId !== record.jobId) blocked("wait SDK job contradicted the existing allocated-to-SDK mapping");
      const matches = this.evidence.task_records.filter((candidate) => actualSdkJobId(candidate) === record.jobId);
      if (matches.length > 1) blocked("one SDK job had multiple existing terminal authorities");
      return { record, prior: matches[0] ?? null };
    });
    for (const { record, prior } of existing) if (prior && !this.waitRecordsEquivalent(prior, record)) blocked("contradictory wait/custom terminal payload, status, or ownership");
    const additions = existing.filter(({ prior }) => !prior);
    const bytes = additions.reduce((total, { record }) => total + Buffer.byteLength(JSON.stringify(record), "utf8"), 0);
    if (this.evidence.capture.bytes + bytes > MAX_CAPTURE_BYTES) blocked("wait terminal retention exceeded the capture bound");
    const previousToolEvents = this.evidence.tool_events.length;
    const previousWaitResults = this.evidence.wait_results.length;
    const previousRecords = this.evidence.task_records.length;
    const previousCaptureBytes = this.evidence.capture.bytes;
    const previousCaptureComplete = this.evidence.capture.complete;
    const previousWaitIdentity = new Map(this.waitRecordsByIdentity);
    const previousAsyncJobIds = new Map(this.asyncJobIdsByAllocated);
    const previousTransportJobIds = new Set(this.transportJobIds);
    try {
      this.evidence.tool_events.push(event);
      for (const { record } of additions) {
        const row = { ...record.wait_result, job: record.wait_result.job, binding: record.wait_result.host_binding };
        this.capture("wait_results", row, { chargeValue: record });
        this.waitRecordsByIdentity.set(record.jobId, { snapshot: digest(row), record });
        this.asyncJobIdsByAllocated.set(record.allocated_id, record.jobId);
        this.transportJobIds.add(record.jobId);
        this.evidence.task_records.push(record);
      }
      this.waitCalls.delete(key);
    } catch (error) {
      this.evidence.tool_events.length = previousToolEvents;
      this.evidence.wait_results.length = previousWaitResults;
      this.evidence.task_records.length = previousRecords;
      this.waitRecordsByIdentity.clear();
      for (const [jobId, value] of previousWaitIdentity) this.waitRecordsByIdentity.set(jobId, value);
      this.asyncJobIdsByAllocated.clear();
      for (const [allocatedId, jobId] of previousAsyncJobIds) this.asyncJobIdsByAllocated.set(allocatedId, jobId);
      this.transportJobIds.clear();
      for (const jobId of previousTransportJobIds) this.transportJobIds.add(jobId);
      this.evidence.capture.bytes = previousCaptureBytes;
      this.evidence.capture.complete = previousCaptureComplete;
      throw error;
    }
  }
  recordTool(frame) {
    validateKnownFrameIdentity(frame);
    const earlyName = extractToolName(frame);
    if (this.rootPreparationActive && !/^(?:read|grep|glob|todo)(?:$|[_.:])/i.test(earlyName ?? "")) blocked("readonly Root preparation refused an execution tool");
    if (/^wait$/i.test(earlyName ?? "")) {
      const eventToolCallId = fullToolCallId(frame, ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"]);
      if (!eventToolCallId) blocked("Root wait START/END omitted its own exact tool call id");
      captureSafeIdentifier(eventToolCallId, "Root wait tool call identity");
      const waitKey = correlationKey(eventToolCallId, "wait");
      if (frame.type !== "tool_execution_start" && !this.waitCalls.has(waitKey)) blocked("Root wait lifecycle phase was not correlated to its START");
      if (frame.type === "tool_execution_start" && this.waitCalls.has(waitKey)) blocked("duplicate Root wait START");
      const hostWorkflowOrdinal = observedFrameOrdinals.has(frame)
        ? normalizeHostWorkflowOrdinal(this.currentHostWorkflowOrdinal, allocateHostWorkflowOrdinal())
        : allocateHostWorkflowOrdinal();
      this.currentHostWorkflowOrdinal = hostWorkflowOrdinal;
      this.evidence.host_workflow_ordinal = hostWorkflowOrdinal;
      const event = { sequence: ++this.sequence, host_arrival_ordinal: ++this.hostArrivalSequence, host_workflow_ordinal: hostWorkflowOrdinal, type: frame.type, tool: "wait" };
      if (eventToolCallId) event.tool_call_id = eventToolCallId;
      if (typeof frame.isError === "boolean") event.is_error = frame.isError;
      return this.recordWaitTool(frame, event, eventToolCallId);
    }
    for (const detail of this.taskDetailsFromFrame(frame)) {
      for (const record of [...(Array.isArray(detail.results) ? detail.results : []), ...(Array.isArray(detail.progress) ? detail.progress : []), ...(Array.isArray(detail.jobs) ? detail.jobs : [])]) validateKnownIdentityMetadata(record, "Root task detail identity", true);
      if (detail.async && typeof detail.async === "object" && !Array.isArray(detail.async)) validateKnownIdentityMetadata(detail.async, "Root async identity");
    }
    const name = extractToolName(frame);
    if (!name) throw new ProbeError("BLOCKED", "native tool event omitted tool name");
    const isRootHelper = this.rootCommandPolicy?.tool === name;
    const isRootWrite = /^write$/i.test(name);
    if (!isRootHelper && !isRootWrite && !ROOT_ALLOWED_TOOL.test(name)) throw new ProbeError("BLOCKED", `root used forbidden/non-allowlisted tool ${scrub(name)}`);
    const args = frame.arguments ?? frame.args ?? frame.input ?? frame.toolCall?.arguments ?? frame.tool_call?.arguments ?? frame;
    let paths = isRootHelper ? [] : isRootWrite ? [] : [...new Set(collectPaths(args).slice(0, 64))];
    const eventToolCallId = fullToolCallId(frame, ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"]);
    if (eventToolCallId) captureSafeIdentifier(eventToolCallId, "Root tool call identity");
    const parentToolCallId = fullToolCallId(frame, ["parentToolCallId", "parent_tool_call_id", "parentCallId", "parent_call_id"]);
    if (parentToolCallId) captureSafeIdentifier(parentToolCallId, "Root parent tool call identity");
    const nextHostArrivalOrdinal = this.hostArrivalSequence + 1;
    const readObservation = /^read(?:$|[_.:])/i.test(name) ? this.correlateReadFrame(frame, name, paths, "Root", nextHostArrivalOrdinal) : null;
    if (readObservation) paths = readObservation.paths;
    const command = extractCommand(args);
    const event = { sequence: ++this.sequence, host_arrival_ordinal: ++this.hostArrivalSequence, host_workflow_ordinal: this.currentHostWorkflowOrdinal, type: frame.type, tool: scrub(name, 96), paths: paths.map((item) => scrub(item, 1024)) };
    if (readObservation) {
      event.requested_paths = readObservation.requested_paths;
      event.path_resolution = "host-confined-project-filesystem-or-managed-skill-uri";
    }
    if (readObservation?.phase === "end") {
      event.source_files = readObservation.source_files;
      event.read_correlation = readObservation.correlation;
    }
    if (eventToolCallId) event.tool_call_id = preserveIdentifier(eventToolCallId);
    if (parentToolCallId) event.parent_tool_call_id = preserveIdentifier(parentToolCallId);
    const sessionId = firstStringField(frame, ["sessionId", "session_id"]);
    if (sessionId) event.session_id = preserveIdentifier(sessionId);
    const eventId = firstStringField(frame, ["id", "eventId", "event_id"]);
    if (eventId) event.public_id = preserveIdentifier(eventId);
    if (Number.isInteger(frame.index)) event.index = frame.index;
    if (typeof frame.isError === "boolean") event.is_error = frame.isError;
    if (Number.isInteger(extractExitCode(frame))) event.exit_code = extractExitCode(frame);
    if (this.evidence.host_observation) event.host_observation = this.evidence.host_observation;
    this.evidence.tool_events.push(event);
    if (isRootHelper) {
      this.recordRootCommand(frame, name, args, event, eventToolCallId);
      return;
    }
    if (/^write$/i.test(name)) {
      if (!this.rootWritePolicy) throw new ProbeError("BLOCKED", "root write lacked the host-constructor intent policy");
      this.recordRootWrite(frame, name, event.sequence);
      const write = this.evidence.root_writes.at(-1);
      if (write?.host_policy_binding) {
        event.host_policy_binding = write.host_policy_binding;
        event.paths = write.paths;
      }
      return;
    }
    const isTaskTool = /^tasks?(?:$|[_.:])/i.test(name);
    const taskKey = event.tool_call_id ? correlationKey(event.tool_call_id, name.toLowerCase()) : null;
    if (isTaskTool && frame.type === "tool_execution_start") {
      const observed = args && typeof args === "object" ? args : {};
      const items = Array.isArray(observed.tasks) ? observed.tasks : Array.isArray(observed.items) ? observed.items : typeof observed.agent === "string" && typeof observed.task === "string" ? [observed] : [];
      const forbidden = findForbiddenKey(observed);
      if (items.length) {
        const seenNames = new Set();
        for (const item of items) {
          if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.name !== "string" || seenNames.has(item.name)) throw new ProbeError("BLOCKED", "Root task START contained an unknown or duplicate assignment");
          seenNames.add(item.name);
          const approved = this.assignments.get(item.name);
          if (!approved
            || item.agent !== approved.agent
            || item.task !== approved.task
            || item.solutionSpace !== approved.solutionSpace) {
            throw new ProbeError("BLOCKED", "Root task START did not literally match the constructor-approved assignment");
          }
        }
      }
      const call = { sequence: event.sequence, host_arrival_ordinal: event.host_arrival_ordinal, host_workflow_ordinal: event.host_workflow_ordinal, tool_call_id: event.tool_call_id ?? null, kind: items.length ? "dispatch" : "control", item_count: items.length, has_forbidden_field: forbidden !== null, forbidden_field: forbidden, has_solution_space: items.length > 0 && items.every((item) => typeof item.solutionSpace === "string" && item.solutionSpace.trim()), assignments: items.map((item) => ({ name: item.name ?? null, agent: item.agent ?? null, raw_task_sha256: typeof item.task === "string" ? sha256Text(item.task) : null, task_sha256: typeof item.task === "string" ? sha256Text(item.task) : null, solution_space_sha256: typeof item.solutionSpace === "string" ? sha256Text(item.solutionSpace) : null, assignment_sha256: null })) };
      if (call.kind === "dispatch" && !taskKey) throw new ProbeError("BLOCKED", "dispatched root task omitted a tool call id");
      if (taskKey && this.rootTaskCalls.has(taskKey)) throw new ProbeError("BLOCKED", "duplicate root task START");
      if (taskKey) this.rootTaskCalls.set(taskKey, { ...call, ended: false });
      this.evidence.task_calls.push(call);
      if (call.has_forbidden_field) throw new ProbeError("BLOCKED", "native task wire contained forbidden field", { key: forbidden });
    }
    if (isTaskTool && (frame.type === "tool_execution_update" || frame.type === "tool_stream_update")) {
      const pending = taskKey ? this.rootTaskCalls.get(taskKey) : null;
      if (!pending) throw new ProbeError("BLOCKED", "root task UPDATE was not correlated to a dispatched START");
      const observed = args && typeof args === "object" ? args : {};
      const items = Array.isArray(observed.tasks) ? observed.tasks : Array.isArray(observed.items) ? observed.items : [];
      if (items.length && items.some((item, index) => {
        const expected = pending.assignments[index];
        return !expected || item.name !== expected.name || item.agent !== expected.agent || (typeof item.task === "string" && sha256Text(item.task) !== expected.task_sha256);
      })) throw new ProbeError("BLOCKED", "root task UPDATE drifted from its dispatched START");
      const details = this.taskDetailsFromFrame(frame);
      for (const detail of details) if (detail.progress !== undefined) this.recordRootTaskProgress(pending, detail.progress);
      const detail = details.at(-1);
      const records = detail && Array.isArray(detail.results) ? detail.results : [];
      const asyncDetails = detail?.async && typeof detail.async === "object" && !Array.isArray(detail.async) ? detail.async : null;
      if (pending.ended) {
        if (!asyncDetails && records.length === 0) throw new ProbeError("BLOCKED", "root task UPDATE after END lacked correlated async progress or repeated results");
        if (asyncDetails) {
          if (asyncDetails.type !== "task" || asyncDetails.jobId !== pending.async?.jobId) throw new ProbeError("BLOCKED", "post-END Root async progress drifted from the first actual job binding");
          pending.async_progress_count = (pending.async_progress_count ?? 0) + 1;
        }
        if (records.length && canonical(records) !== pending.blocking_snapshot) throw new ProbeError("BLOCKED", "post-END Root blocking result snapshot contradicted the admitted END");
      } else {
        pending.update_count = (pending.update_count ?? 0) + 1;
      }
    }
    if (isTaskTool && frame.type === "tool_execution_end") {
      const pending = taskKey ? this.rootTaskCalls.get(taskKey) : null;
      if (!pending) throw new ProbeError("BLOCKED", "root task END was not correlated to a dispatched START");
      if (pending.ended) throw new ProbeError("BLOCKED", "duplicate root task END");
      if (typeof frame.isError !== "boolean") throw new ProbeError("BLOCKED", "root task END omitted explicit isError");
      const details = this.taskDetailsFromFrame(frame);
      for (const detail of details) {
        for (const record of [...(Array.isArray(detail.results) ? detail.results : []), ...(Array.isArray(detail.progress) ? detail.progress : []), ...(Array.isArray(detail.jobs) ? detail.jobs : [])]) validateKnownIdentityMetadata(record, "Root task detail identity", true);
        if (detail.async && typeof detail.async === "object" && !Array.isArray(detail.async)) validateKnownIdentityMetadata(detail.async, "Root async identity");
      }
      const records = details.flatMap((detail) => Array.isArray(detail.results) ? detail.results : []);
      const recordKeys = new Set();
      for (const record of records) {
        validateKnownIdentityMetadata(record, "Root task result", true);
        const id = captureSafeIdentifier(record?.id ?? record?.allocated_id ?? record?.allocatedId, "Root task result identity");
        const key = id ? correlationKey(id, record?.index ?? "") : canonical(record);
        if (recordKeys.has(key)) throw new ProbeError("BLOCKED", "root task END contained duplicate result identities");
        recordKeys.add(key);
      }
      const asyncDetails = details.map((item) => item.async).find((item) => item && typeof item === "object" && !Array.isArray(item)) ?? null;
      if (asyncDetails && (asyncDetails.type !== "task" || typeof asyncDetails.jobId !== "string" || !asyncDetails.jobId.trim() || !["running", "completed", "failed", "cancelled", "canceled"].includes(asyncDetails.state))) throw new ProbeError("BLOCKED", "Root async END details were malformed");
      if (asyncDetails?.jobId) captureSafeIdentifier(asyncDetails.jobId, "Root async job identity");
      const progressRows = [];
      for (const detail of details) {
        if (detail.progress === undefined) continue;
        if (!Array.isArray(detail.progress)) blocked("Root task END progress was malformed");
        progressRows.push(...detail.progress);
      }
      if (progressRows.length) this.recordRootTaskProgress(pending, progressRows);
      if (asyncDetails && progressRows.length !== pending.assignments.length) blocked("Root async END omitted progress for its dispatched assignments");
      pending.async = asyncDetails;
      if (asyncDetails?.jobId) this.transportJobIds.add(asyncDetails.jobId);
      pending.blocking_snapshot = canonical(records);
      pending.ended = true;
      const rootTaskEnd = { kind: pending.kind, isError: frame.isError, is_error_source: "tool_execution_end", tool_call_id: event.tool_call_id ?? null, parent_tool_call_id: event.parent_tool_call_id ?? null, sequence: event.sequence, host_arrival_ordinal: event.host_arrival_ordinal, host_workflow_ordinal: event.host_workflow_ordinal, dispatched_assignments: pending.assignments, async: asyncDetails ? safeValue(asyncDetails) : null };
      this.evidence.root_task_ends.push(rootTaskEnd);
      this.evidence.terminal = { ...(this.evidence.terminal ?? {}), root_task_end: rootTaskEnd };
      for (const details of this.taskDetailsFromFrame(frame)) {
        const detailRecords = Array.isArray(details.results) ? details.results : [];
        this.capture("task_details", { sequence: event.sequence, host_workflow_ordinal: event.host_workflow_ordinal, results: detailRecords.map((record) => operationalRecord(record, { source_kind: "task_tool_details" })), progress: Array.isArray(details.progress) ? details.progress.map((record) => operationalRecord(record, { source_kind: "task_tool_progress" })) : [], jobs: Array.isArray(details.jobs) ? details.jobs.map((record) => operationalRecord(record, { source_kind: "task_tool_job" })) : [], async: details.async && typeof details.async === "object" ? safeValue(details.async) : details.async === true ? true : null });
        for (const record of detailRecords) {
          const allocated = captureSafeIdentifier(record?.id ?? record?.allocated_id ?? record?.allocatedId, "Root result allocated identity");
          let binding = allocated ? this.lifecycleByAllocated.get(`id:${allocated}`) : null;
          if (!binding && allocated && Number.isSafeInteger(record?.index) && typeof record?.agent === "string" && record?.agentSource === "project") {
            this.recordRootTaskProgress(pending, [{ id: allocated, index: record.index, agent: record.agent, agentSource: record.agentSource, assignment: record.assignment }]);
            binding = this.lifecycleByAllocated.get(`id:${allocated}`) ?? null;
          }
          if (binding) this.validateRootResultTuple(record, binding, pending);
          const metadata = binding ? { allocated_id: binding.allocated_id, parent_tool_call_id: binding.parent_tool_call_id, index: binding.index, job_id: binding.job_id, instance_id: binding.instance_id, domain_id_provenance: binding.domain_id_provenance, assignment_id: binding.assignment_name, run_id: record?.run_id ?? this.logicalRunId, agent: binding.agent, agentSource: binding.agentSource, host_workflow_ordinal: event.host_workflow_ordinal } : { host_workflow_ordinal: event.host_workflow_ordinal };
          this.recordTerminal(record, { ...record, ...metadata, source_kind: "task_tool_details" }, "task_tool_details");
        }
      }
    }
    if (command) event.command_sha256 = sha256Text(command);
    if (FORBIDDEN_TOOL.test(name) || !ROOT_ALLOWED_TOOL.test(name)) throw new ProbeError("BLOCKED", `root used forbidden/non-allowlisted tool ${scrub(name)}`);
  }
  recordRootWrite(frame, toolName, sequence) {
    const phase = lifecyclePhase(frame);
    const correlationBase = toolCorrelation({ id: "ROOT" }, frame, toolName);
    let correlationStatus = "missing";
    let pending = null;
    if (phase === "start") {
      correlationStatus = !correlationBase.available ? "missing" : this.rootWriteCalls.has(correlationBase.key) ? "duplicate" : "start";
    } else if (phase === "update" || phase === "end") {
      correlationStatus = !correlationBase.available ? "missing" : this.rootWriteCalls.has(correlationBase.key) ? "matched" : "unknown";
      pending = correlationStatus === "matched" ? this.rootWriteCalls.get(correlationBase.key) : null;
    }
    const observedPaths = writeObservedPaths(frame);
    if (this.rootCommandPolicy && phase === "start") {
      const writeArgs = frame.arguments ?? frame.args ?? frame.input ?? frame.toolCall?.arguments ?? frame.tool_call?.arguments ?? {};
      const content = writeArgs && typeof writeArgs === "object" ? (writeArgs.content ?? writeArgs.text ?? writeArgs.data) : null;
      const contentBytes = typeof content === "string" ? Buffer.byteLength(content, "utf8") : content === undefined ? 0 : Buffer.byteLength(JSON.stringify(content), "utf8");
      if (contentBytes > this.rootCommandPolicy.intent.max_bytes) throw new ProbeError("BLOCKED", "root intent write exceeded its bounded payload size");
    }
    const requestedPaths = pending?.paths ?? (phase === "start" ? observedPaths : []);
    const effectivePaths = phase === "end" && pending ? pending.paths : observedPaths.length ? observedPaths : pending?.paths ?? [];
    const pathDrifted = Boolean(pending && observedPaths.length && writePathDrift(this.cwd, pending.paths, observedPaths));
    const terminalErrorObserved = typeof frame.isError === "boolean";
    const terminalError = terminalErrorObserved ? frame.isError : null;
    const correlation = { ...correlationBase, phase, status: correlationStatus, task_match: true, identity_match: true };
    const allowedPaths = this.rootWritePolicy?.paths ?? [];
    const guardReason = rootWriteGuardReason({ phase, correlationStatus, paths: effectivePaths, pathDrifted, cwd: this.cwd, allowedPath: allowedPaths, terminalErrorObserved, terminalError });
    const record = rootWriteCorrelationRecord({ phase, nestedType: frame.type, correlation, requestedPaths, observedPaths, effectivePaths, guardReason, cwd: this.cwd, allowedPath: allowedPaths, terminalErrorObserved, terminalError });
    record.sequence = sequence;
    record.host_workflow_ordinal = this.currentHostWorkflowOrdinal;
    if (this.rootCommandPolicy && effectivePaths.every((item) => samePath(item, this.rootCommandPolicy.intent.path))) record.host_policy_binding = { kind: this.rootCommandPolicy.kind, admitted: true, cwd: this.rootCommandPolicy.cwd, intent_path: this.rootCommandPolicy.intent.path, helper_path: this.rootCommandPolicy.script.path, helper_realpath: this.rootCommandPolicy.script.realpath, script_sha256: this.rootCommandPolicy.script.sha256, executable_path: this.rootCommandPolicy.executable.path, executable_realpath: this.rootCommandPolicy.executable.realpath, executable_sha256: this.rootCommandPolicy.executable.sha256, command_sha256: this.rootCommandPolicy.command_sha256 };
    this.capture("root_writes", record);
    if (guardReason) throw new ProbeError("BLOCKED", "root retro artifact write failed the exact path/correlation policy", { operational_guard: record });
    if (phase === "start") this.rootWriteCalls.set(correlation.key, { paths: observedPaths, tool_call_id: correlation.tool_call_id, task_id: correlation.task_id, task_id_exposed: correlation.task_id_exposed === true, public_identity: correlation.public_identity, tool: correlation.tool });
    else if (phase === "end") this.rootWriteCalls.delete(correlation.key);
  }
  isValidatorObservation(observation, nestedEvent) {
    const expectedNames = Array.from(this.assignments.values()).filter((item) => item?.agent === "validator" && typeof item.name === "string").map((item) => item.name);
    return expectedNames.some((expectedName) => namedAssignmentObservation(observation, nestedEvent, "validator", expectedName));
  }
  isSpecKitObservation(observation, nestedEvent) {
    return namedAssignmentObservation(observation, nestedEvent, "spec-kit-author", "Native10SpecKitAuthor");
  }
  withObservedAssignmentIdentity(identity, binding, publicIdentity) {
    const rootSessionId = this.evidence.root_session?.session_id;
    const approved = this.assignments.get(identity.expected.name);
    if (binding?.accepted !== true || typeof rootSessionId !== "string" || !rootSessionId
      || publicIdentity !== binding.allocated_id
      || this.lifecycleByAllocated.get(`id:${binding.allocated_id}`) !== binding
      || this.lifecycleByIndex.get(correlationKey(binding.parent_tool_call_id, binding.index)) !== binding
      || binding.agentSource !== "project" || binding.agent !== identity.expected.agent
      || binding.assignment_name !== identity.expected.name || approved?.agent !== binding.agent) return identity;
    identity.observed_binding = {
      source: "observed-root-dispatch-lifecycle", root_session_id: rootSessionId,
      parent_tool_call_id: binding.parent_tool_call_id, allocated_id: binding.allocated_id,
      index: binding.index, agent: binding.agent, agentSource: binding.agentSource,
      assignment_id: binding.assignment_name,
      job_id: binding.job_id, instance_id: binding.instance_id,
    };
    identity.matches.observed_binding = true;
    identity.matches.any = true;
    return identity;
  }
  childBindingIsLive(binding) {
    if (!binding || binding.accepted !== true) return false;
    const lifecycleStatus = String(binding.lifecycle_status ?? "").toLowerCase();
    if (!["started", "running", "progress"].includes(lifecycleStatus)) return false;
    const progressStatus = String(binding.progress_status ?? "").toLowerCase();
    if (binding.progress_terminal) return false;
    return !progressStatus || ["started", "running", "progress"].includes(progressStatus);
  }
  beginYieldTransaction(binding) {
    const pending = binding?.pending_observations ?? null;
    return {
      yieldCalls: new Map(this.yieldCalls),
      yieldCallBytes: this.yieldCallBytes,
      captureBytes: this.evidence.capture.bytes,
      captureComplete: this.evidence.capture.complete,
      frameCount: this.evidence.subagent_frames.length,
      pendingObservationCount: this.pendingObservationCount,
      pendingObservationBytes: this.pendingObservationBytes,
      pendingBinding: binding?.accepted === true ? null : binding,
      pendingBindingPresent: Boolean(binding && this.pendingLifecycleByAllocated.has(`id:${binding.allocated_id}`)),
      pendingObservations: pending,
      pendingObservationEntries: pending ? Object.fromEntries(Object.entries(pending).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.slice()])) : null,
      pendingBindingCount: Number.isSafeInteger(binding?.pending_observation_count) ? binding.pending_observation_count : 0,
      pendingBindingBytes: Number.isSafeInteger(binding?.pending_observation_bytes) ? binding.pending_observation_bytes : 0,
      binding,
      bindingProgressStatus: binding?.progress_status,
      bindingProgressTerminal: binding?.progress_terminal,
      childProgress: new Map(this.childProgressByAllocated),
    };
  }
  rollbackYieldTransaction(transaction) {
    const pendingWasRolledBack = transaction.pendingBindingPresent
      && transaction.pendingBinding
      && transaction.pendingBindingCount === 0
      && !this.pendingLifecycleByAllocated.has(`id:${transaction.pendingBinding.allocated_id}`);
    if (!pendingWasRolledBack) {
      this.yieldCalls = new Map(transaction.yieldCalls);
      this.yieldCallBytes = transaction.yieldCallBytes;
    }
    this.evidence.subagent_frames.length = transaction.frameCount;
    this.evidence.capture.bytes = transaction.captureBytes;
    this.evidence.capture.complete = transaction.captureComplete;
    this.pendingObservationCount = transaction.pendingObservationCount;
    this.pendingObservationBytes = transaction.pendingObservationBytes;
    this.childProgressByAllocated.clear();
    for (const [key, value] of transaction.childProgress) this.childProgressByAllocated.set(key, value);
    if (transaction.binding) {
      if (transaction.bindingProgressStatus === undefined) delete transaction.binding.progress_status;
      else transaction.binding.progress_status = transaction.bindingProgressStatus;
      if (transaction.bindingProgressTerminal === undefined) delete transaction.binding.progress_terminal;
      else transaction.binding.progress_terminal = transaction.bindingProgressTerminal;
    }
    if (transaction.pendingBinding) {
      transaction.pendingBinding.pending_observation_count = transaction.pendingBindingCount;
      transaction.pendingBinding.pending_observation_bytes = transaction.pendingBindingBytes;
      if (!transaction.pendingObservations) transaction.pendingBinding.pending_observations = null;
      else {
        transaction.pendingBinding.pending_observations = transaction.pendingObservations;
        for (const [key, entries] of Object.entries(transaction.pendingObservationEntries ?? {})) {
          const records = transaction.pendingBinding.pending_observations[key];
          records.splice(0, records.length, ...entries);
        }
      }
    }
  }
  captureSafeYieldIdentity(binding, toolCallId) {
    captureSafeIdentifier(binding?.allocated_id, "allocated child identity");
    captureSafeIdentifier(binding?.parent_tool_call_id, "Root parent tool call identity");
    captureSafeIdentifier(binding?.agent, "child agent identity");
    captureSafeIdentifier(binding?.agentSource, "child agent source identity");
    return captureSafeIdentifier(toolCallId, "yield tool call identity");
  }
  yieldMetadataBytes(binding, toolCallId) {
    return [binding?.allocated_id, binding?.parent_tool_call_id, toolCallId, binding?.agent, binding?.agentSource]
      .filter((value) => typeof value === "string")
      .reduce((total, value) => total + Buffer.byteLength(value, "utf8"), 0);
  }
  releaseYieldCall(key) {
    const prior = this.yieldCalls.get(key);
    if (!prior) return false;
    this.yieldCalls.delete(key);
    this.yieldCallBytes = Math.max(0, this.yieldCallBytes - (prior.retained_bytes ?? 0));
    return true;
  }
  releaseYieldCallsForBinding(binding) {
    const allocatedId = preserveIdentifier(binding?.allocated_id);
    if (!allocatedId) return;
    for (const [key, call] of this.yieldCalls) {
      if (call.allocated_id === allocatedId) this.releaseYieldCall(key);
    }
  }
  yieldBindingIsLive(binding) {
    if (binding?.accepted === true) return this.childBindingIsLive(binding);
    const lifecycleStatus = String(binding?.lifecycle_status ?? "").toLowerCase();
    const progressStatus = String(binding?.progress_status ?? "").toLowerCase();
    return binding?.lifecycle_frame_type === "subagent_lifecycle"
      && binding.progress_terminal == null
      && lifecycleStatus === "started"
      && (!progressStatus || ["started", "running", "progress"].includes(progressStatus));
  }
  recordYieldControl(binding, nestedEvent, hostArrivalOrdinal = null, hostWorkflowOrdinal = null) {
    this.validateYieldTuple(binding, nestedEvent);
    const toolCallId = fullToolCallId(nestedEvent, ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"]);
    if (!toolCallId) throw new ProbeError("BLOCKED", "yield event omitted its actual tool call identifier");
    this.captureSafeYieldIdentity(binding, toolCallId);
    const phase = lifecyclePhase(nestedEvent);
    if (!this.yieldBindingIsLive(binding)) throw new ProbeError("BLOCKED", "yield event lacked an authoritative live child allocation");
    if (phase === "start") {
      const retainedBytes = this.yieldMetadataBytes(binding, toolCallId);
      if (retainedBytes > MAX_CAPTURE_BYTES) throw new ProbeError("BLOCKED", "yield correlation identity exceeded bound");
      if (this.yieldCalls.size >= MAX_PENDING_OBSERVATIONS || this.yieldCallBytes + retainedBytes > MAX_CAPTURE_BYTES) throw new ProbeError("BLOCKED", "pending yield correlation retention exceeded bound");
      const key = correlationKey(binding.allocated_id, toolCallId);
      if (this.yieldCalls.has(key)) throw new ProbeError("BLOCKED", "duplicate child yield START");
      this.yieldCalls.set(key, {
        allocated_id: binding.allocated_id,
        parent_tool_call_id: binding.parent_tool_call_id,
        index: binding.index,
        agent: binding.agent,
        agentSource: binding.agentSource,
        tool_call_id: toolCallId,
        host_arrival_ordinal: normalizeHostWorkflowOrdinal(hostArrivalOrdinal),
        host_workflow_ordinal: normalizeHostWorkflowOrdinal(hostWorkflowOrdinal),
        retained_bytes: retainedBytes,
        accepted: binding.accepted === true,
      });
      this.yieldCallBytes += retainedBytes;
    } else {
      const key = correlationKey(binding.allocated_id, toolCallId);
      const prior = this.yieldCalls.get(key);
      if (phase === "update") {
        if (!prior) throw new ProbeError("BLOCKED", "child yield UPDATE was not correlated to a START");
      } else if (phase === "end") {
        if (!prior) throw new ProbeError("BLOCKED", "child yield END was not correlated to a START");
        if (typeof nestedEvent.isError !== "boolean") throw new ProbeError("BLOCKED", "child yield END omitted its actual error signal");
        this.releaseYieldCall(key);
      } else {
        throw new ProbeError("BLOCKED", "child yield used an unsupported lifecycle phase");
      }
    }
    const control = { phase, tool_call_id: toolCallId, correlation: "matched", host_arrival_ordinal: normalizeHostWorkflowOrdinal(hostArrivalOrdinal), host_workflow_ordinal: normalizeHostWorkflowOrdinal(hostWorkflowOrdinal) };
    return control;
  }
  validateYieldTuple(binding, nestedEvent) {
    const parentToolCallId = fullToolCallId(nestedEvent, ["parentToolCallId", "parent_tool_call_id"]);
    if (parentToolCallId && parentToolCallId !== binding.parent_tool_call_id) throw new ProbeError("BLOCKED", "yield event contradicted its allocated parent tool call");
    const index = Number.isSafeInteger(nestedEvent?.index) ? nestedEvent.index : null;
    if (index !== null && index !== binding.index) throw new ProbeError("BLOCKED", "yield event contradicted its allocated child index");
    const agent = typeof nestedEvent?.agent === "string" && nestedEvent.agent ? captureSafeIdentifier(nestedEvent.agent, "yield child agent identity") : null;
    if (agent && agent !== binding.agent) throw new ProbeError("BLOCKED", "yield event contradicted its allocated child agent");
    const agentSource = typeof nestedEvent?.agentSource === "string" && nestedEvent.agentSource ? captureSafeIdentifier(nestedEvent.agentSource, "yield child agent source identity") : null;
    if (agentSource && agentSource !== binding.agentSource) throw new ProbeError("BLOCKED", "yield event contradicted its allocated child agent source");
  }
  observedChildBinding(observation, frame, hostArrivalOrdinal = null, hostArrivalTimestamp = null, hostWorkflowOrdinal = null) {
    const tuple = this.lifecycleTuple(observation, frame);
    const allocatedId = tuple.allocated_id;
    if (!allocatedId) throw new ProbeError("BLOCKED", "subagent frame omitted its allocated id");
    if (this.rejectedLifecycleByAllocated.has(`id:${allocatedId}`)) throw new ProbeError("BLOCKED", "allocated lifecycle identity was previously terminal-rejected");
    const existing = this.lifecycleByAllocated.get(`id:${allocatedId}`) ?? this.pendingLifecycleByAllocated.get(`id:${allocatedId}`) ?? null;
    if (frame.type !== "subagent_lifecycle" && frame.type !== "subagent_progress") {
      if (!existing) throw new ProbeError("BLOCKED", "subagent frame carried an unknown allocated id");
      if (observation.agentSource && observation.agentSource !== existing.agentSource) throw new ProbeError("BLOCKED", "subagent frame rebound its allocated agent source");
      return existing;
    }
    if (frame.type === "subagent_progress" && existing) {
      tuple.parent_tool_call_id ??= existing.parent_tool_call_id;
      tuple.index ??= existing.index;
      tuple.agent ??= existing.agent;
      tuple.agentSource ??= existing.agentSource;
      tuple.status ??= existing.progress_status ?? existing.lifecycle_status;
    }
    if (tuple.index === null || !tuple.parent_tool_call_id || !tuple.agent || tuple.agentSource !== "project" || !this.lifecycleStatusAllowed(tuple.status, frame.type)) throw new ProbeError("BLOCKED", "subagent lifecycle omitted or exposed an invalid dispatch identity/status");
    captureSafeIdentifier(allocatedId, "allocated child identity");
    captureSafeIdentifier(tuple.parent_tool_call_id, "Root parent tool call identity");
    captureSafeIdentifier(tuple.agent, "child agent identity");
    captureSafeIdentifier(tuple.agentSource, "child agent source identity");
    let configuredRole = false;
    for (const assignment of this.assignments.values()) {
      if (assignment.agent === tuple.agent) {
        configuredRole = true;
        break;
      }
    }
    if (!configuredRole) throw new ProbeError("BLOCKED", "subagent role was not authorized by the configured assignment policy");
    if (existing) {
      if (frame.type === "subagent_progress") {
        const latchedStatus = existing.progress_terminal?.status
          ?? [existing.progress_status, existing.lifecycle_status].map((status) => String(status ?? "").toLowerCase()).find((status) => TERMINAL_STATUSES.has(status));
        if (latchedStatus) throw new ProbeError("BLOCKED", "subagent progress contradicted a latched terminal lifecycle");
      }
      if (existing.parent_tool_call_id !== tuple.parent_tool_call_id || existing.index !== tuple.index || existing.agent !== tuple.agent || existing.agentSource !== tuple.agentSource) throw new ProbeError("BLOCKED", "subagent lifecycle rebound an allocated identity");
      if (frame.type === "subagent_lifecycle") {
        if (tuple.status === "started" && existing.accepted !== true && ["running", "progress"].includes(existing.lifecycle_status)) {
          existing.lifecycle_status = "started";
          return existing;
        }
        if (existing.lifecycle_status !== "started" || tuple.status === "started") throw new ProbeError("BLOCKED", "duplicate or reordered subagent lifecycle transition");
        existing.lifecycle_status = tuple.status;
        if (FAILURE_STATUSES.has(tuple.status)) this.rememberRejectedLifecycle(existing, "pending lifecycle reported failure or abort");
      } else if (tuple.status && tuple.status !== "started") {
        existing.progress_status = tuple.status;
      }
      return existing;
    }
    const rootCall = [...this.rootTaskCalls.values()].find((call) => call.kind === "dispatch" && call.tool_call_id === tuple.parent_tool_call_id);
    const dispatched = rootCall?.assignments?.[tuple.index] ?? null;
    if (rootCall && !dispatched) throw new ProbeError("BLOCKED", "subagent lifecycle index was outside its observed Root dispatch");
    const assignment = dispatched ? this.assignments.get(dispatched.name) : null;
    if (dispatched && (!assignment || dispatched.agent !== tuple.agent || assignment.agent !== tuple.agent)) throw new ProbeError("BLOCKED", "subagent lifecycle was not authorized by its observed Root dispatch and configured assignment policy");
    const progress = rootCall?.progress_by_index?.get(tuple.index) ?? null;
    if (progress && (progress.id !== allocatedId || progress.agent !== tuple.agent || progress.agentSource !== tuple.agentSource)) throw new ProbeError("BLOCKED", "subagent lifecycle disagreed with authoritative Root progress");
    if (tuple.status !== "started" && frame.type === "subagent_lifecycle" && !progress) throw new ProbeError("BLOCKED", "subagent lifecycle terminal preceded its authoritative allocation");
    if (progress || (rootCall && frame.type === "subagent_lifecycle" && tuple.status === "started")) {
      const domain = hostDerivedDomainIds(this.evidence.root_session?.session_id, tuple.parent_tool_call_id, allocatedId, tuple.index);
      const binding = { accepted: true, allocated_id: allocatedId, parent_tool_call_id: tuple.parent_tool_call_id, index: tuple.index, agent: tuple.agent, agentSource: tuple.agentSource, assignment_name: assignment.name, lifecycle_status: tuple.status, job_id: domain.job_id, instance_id: domain.instance_id, domain_id_provenance: domain.provenance, host_arrival_ordinal: hostArrivalOrdinal, host_workflow_ordinal: hostWorkflowOrdinal, host_arrival_timestamp: hostArrivalTimestamp };
      this.lifecycleByAllocated.set(`id:${allocatedId}`, binding);
      if (this.lifecycleByIndex.has(correlationKey(tuple.parent_tool_call_id, tuple.index))) throw new ProbeError("BLOCKED", "duplicate subagent allocation within its Root dispatch index");
      this.lifecycleByIndex.set(correlationKey(tuple.parent_tool_call_id, tuple.index), binding);
      return binding;
    }
    if (this.pendingObservationCount >= MAX_PENDING_OBSERVATIONS || this.pendingObservationBytes >= MAX_CAPTURE_BYTES) this.pendingRetentionFailure({ ...tuple, accepted: false }, "lifecycle-allocation", this.pendingObservationBytes, { eligible: false, replacement: false }, { frame_type: frame.type, type: frame.type, status: tuple.status });
    const pending = { accepted: false, allocated_id: allocatedId, parent_tool_call_id: tuple.parent_tool_call_id, index: tuple.index, agent: tuple.agent, agentSource: tuple.agentSource, assignment_name: null, lifecycle_status: tuple.status, lifecycle_frame_type: frame.type, job_id: null, instance_id: null, domain_id_provenance: null, host_arrival_ordinal: hostArrivalOrdinal, host_workflow_ordinal: hostWorkflowOrdinal, host_arrival_timestamp: hostArrivalTimestamp };
    const pendingKey = `id:${allocatedId}`;
    if (this.pendingLifecycleByAllocated.has(pendingKey)) throw new ProbeError("BLOCKED", "duplicate pending subagent allocation");
    this.pendingLifecycleByAllocated.set(pendingKey, pending);
    const indexKey = correlationKey(tuple.parent_tool_call_id, tuple.index);
    const candidates = this.pendingLifecycleByIndex.get(indexKey) ?? new Set();
    candidates.add(allocatedId);
    this.pendingLifecycleByIndex.set(indexKey, candidates);
    return pending;
  }
  recordSubagent(frame) {
    const sequence = ++this.subagentSequence;
    const hostArrivalOrdinal = ++this.hostArrivalSequence;
    const hostArrivalTimestamp = Date.now();
    const observation = subagentObservation(frame);
    const observedId = preserveIdentifier(observation.id);
    const binding = observedId ? this.lifecycleByAllocated.get(`id:${observedId}`) ?? this.pendingLifecycleByAllocated.get(`id:${observedId}`) : null;
    if (frame.type !== "subagent_progress" || binding?.accepted === true || extractToolName(observation.event ?? observation.payload)) {
      return this.recordSubagentFrame(frame, observation, sequence, hostArrivalOrdinal, hostArrivalTimestamp);
    }
    const transaction = this.beginYieldTransaction(binding);
    try {
      return this.recordSubagentFrame(frame, observation, sequence, hostArrivalOrdinal, hostArrivalTimestamp);
    } catch (error) {
      const created = !binding && observedId ? this.pendingLifecycleByAllocated.get(`id:${observedId}`) : null;
      if (created) this.rollbackPendingAllocation(created);
      this.rollbackYieldTransaction(transaction);
      throw error;
    }
  }
  recordSubagentFrame(frame, observation, sequence, hostArrivalOrdinal, hostArrivalTimestamp) {
    const observedProgress = observation.progress;
    const observedProgressId = preserveIdentifier(observedProgress?.id ?? observation.id);
    const existingProgressBinding = observedProgressId
      ? this.lifecycleByAllocated.get(`id:${observedProgressId}`) ?? this.pendingLifecycleByAllocated.get(`id:${observedProgressId}`)
      : null;
    if (observedProgress && existingProgressBinding) {
      const progressParent = fullToolCallId(observedProgress, ["parentToolCallId", "parent_tool_call_id"]);
      const payloadParent = fullToolCallId(observation.payload, ["parentToolCallId", "parent_tool_call_id"]);
      const progressIndex = Number.isSafeInteger(observedProgress.index) ? observedProgress.index : null;
      const progressAgent = typeof observedProgress.agent === "string" && observedProgress.agent ? observedProgress.agent : null;
      const progressSource = typeof observedProgress.agentSource === "string" && observedProgress.agentSource ? observedProgress.agentSource : null;
      if ((progressParent && progressParent !== existingProgressBinding.parent_tool_call_id)
        || (payloadParent && payloadParent !== existingProgressBinding.parent_tool_call_id)
        || (progressIndex !== null && progressIndex !== existingProgressBinding.index)
        || (progressAgent && progressAgent !== existingProgressBinding.agent)
        || (progressSource && progressSource !== existingProgressBinding.agentSource)) {
        throw new ProbeError("BLOCKED", "subagent progress drifted from its allocated lifecycle identity");
      }
    }
    let binding;
    try {
      binding = this.observedChildBinding(observation, frame, hostArrivalOrdinal, hostArrivalTimestamp, this.currentHostWorkflowOrdinal);
    } catch (error) {
      if (frame.type === "subagent_lifecycle") this.recordLifecycleDiagnostic(this.lifecycleTuple(observation, frame), hostArrivalOrdinal, this.currentHostWorkflowOrdinal, error?.message, null, hostArrivalTimestamp);
      throw error;
    }
    const deferred = binding.accepted !== true;
    const nested = observation.payload;
    const nestedEvent = observation.event ?? nested;
    const nestedPhase = lifecyclePhase(nestedEvent);
    if (frame.type === "subagent_event" && nestedPhase === "start" && binding.accepted === true && !this.childBindingIsLive(binding)) {
      throw new ProbeError("BLOCKED", "fresh child tool START was not admitted after terminal lifecycle");
    }
    if (frame.type === "subagent_event") this.validateNestedIdentity(binding, nestedEvent);
    const toolName = extractToolName(nestedEvent);
    if (/^yield(?:[_.:])/i.test(toolName ?? "")) throw new ProbeError("BLOCKED", `subagent used forbidden/non-read tool ${scrub(toolName)}`);
    if (/^wait$/i.test(toolName ?? "")) throw new ProbeError("BLOCKED", "wait is only admissible as a Root tool terminal");
    const yieldControl = toolName === "yield";
    const nestedToolCallId = fullToolCallId(nestedEvent, ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"]);
    const nestedParentToolCallId = fullToolCallId(nestedEvent, ["parentToolCallId", "parent_tool_call_id"]);
    captureSafeIdentifier(nestedToolCallId, "nested tool call identity");
    captureSafeIdentifier(nestedParentToolCallId, "nested parent tool call identity");
    const nestedType = typeof nestedEvent?.type === "string" ? nestedEvent.type.toLowerCase() : "";
    const publicIdentity = observation.id ?? null;
    let paths = yieldControl ? [] : [...new Set(collectPaths(nestedEvent).slice(0, 64))];
    const readObservation = /^read(?:$|[_.:])/i.test(toolName ?? "") ? this.correlateReadFrame(nestedEvent, toolName, paths, binding.allocated_id, hostArrivalOrdinal) : null;
    if (readObservation) paths = readObservation.paths;
    let yieldControlObservation = null;
    let yieldTransaction = null;
    if (yieldControl) {
      yieldTransaction = this.beginYieldTransaction(binding);
      try {
        yieldControlObservation = this.recordYieldControl(binding, nestedEvent, hostArrivalOrdinal, this.currentHostWorkflowOrdinal);
      } catch (error) {
        this.rollbackYieldTransaction(yieldTransaction);
        throw error;
      }
    }
    const retryBackendWrite = this.label === "native09-technical-retry-repair";
    const expectedWriteAgent = retryBackendWrite ? "backend-developer" : "spec-kit-author";
    const expectedWriteName = Array.from(this.assignments.values()).find((item) => item?.agent === expectedWriteAgent)?.name ?? null;
    if (toolName) {
      const shell = /^(?:bash|sh|shell|command|exec)$/i.test(toolName);
      const writeTool = /^write$/i.test(toolName);
      if (yieldControl) {
        // Yield is an SDK control boundary; recordYieldControl owns its correlation.
      } else if (writeTool) {
        const nestedType = typeof nestedEvent?.type === "string" ? nestedEvent.type.toLowerCase() : "";
        const phase = lifecyclePhase(nestedEvent);
        const correlationBase = toolCorrelation(observation, nestedEvent, toolName);
        let correlationStatus = "missing";
        let pending = null;
        if (phase === "start") {
          correlationStatus = !correlationBase.available ? "missing" : this.writeCalls.has(correlationBase.key) ? "duplicate" : "start";
        } else if (phase === "update" || phase === "end") {
          correlationStatus = !correlationBase.available ? "missing" : this.writeCalls.has(correlationBase.key) ? "matched" : "unknown";
          pending = correlationStatus === "matched" ? this.writeCalls.get(correlationBase.key) : null;
        } else {
          correlationStatus = "unknown";
        }
        const identity = this.withObservedAssignmentIdentity(identityObservation(observation, nestedEvent, expectedWriteAgent, expectedWriteName, frame.type), binding, publicIdentity);
        const identityMatch = identity.matches.any && (!pending || correlationBase.public_identity === pending.public_identity);
        const taskMatch = !(correlationBase.task_id_exposed && pending?.task_id_exposed) || correlationBase.task_id === pending.task_id;
        const observedPaths = writeObservedPaths(nestedEvent);
        const requestedPaths = pending?.paths ?? (phase === "start" ? observedPaths : []);
        const effectivePaths = phase === "end" && pending ? pending.paths : observedPaths.length ? observedPaths : pending?.paths ?? [];
        const pathDrifted = Boolean(pending && observedPaths.length && writePathDrift(this.cwd, pending.paths, observedPaths));
        const correlation = {
          ...correlationBase,
          phase,
          status: correlationStatus,
          task_match: taskMatch,
          identity_match: identityMatch,
        };
        const allowedPaths = [path.join(this.cwd, retryBackendWrite ? "app/bin/quality.mjs" : NATIVE10_DOC_HANDOFF)];
        const reasonCode = writeGuardReason({ phase, correlationStatus, identityMatch, taskMatch, paths: effectivePaths, pathDrifted, cwd: this.cwd, allowedPaths });
        const writeRecord = writeCorrelationRecord({ phase, nestedType, correlation, requestedPaths, observedPaths, effectivePaths, guardReason: reasonCode, identity, cwd: this.cwd, allowedPaths });
        writeRecord.sequence = sequence;
        writeRecord.host_arrival_ordinal = hostArrivalOrdinal;
        writeRecord.host_arrival_timestamp = hostArrivalTimestamp;
        writeRecord.host_workflow_ordinal = this.currentHostWorkflowOrdinal;
        writeRecord.start_sequence = pending?.sequence ?? null;
        writeRecord.start_host_workflow_ordinal = pending?.host_workflow_ordinal ?? null;
        writeRecord.start_workflow_ordinal = pending?.host_workflow_ordinal ?? null;
        writeRecord.end_workflow_ordinal = phase === "end" ? this.currentHostWorkflowOrdinal : null;
        writeRecord.parent_tool_call_id = binding.parent_tool_call_id;
        writeRecord.allocated_id = binding.allocated_id;
        writeRecord.index = binding.index;
        writeRecord.job_id = binding.job_id;
        writeRecord.instance_id = binding.instance_id;
        writeRecord.domain_id_provenance = binding.domain_id_provenance;
        writeRecord.root_session_id = this.evidence.root_session?.session_id ?? null;
        writeRecord.role = binding.accepted === true ? binding.agent : null;
        writeRecord.role_source = binding.accepted === true ? "observed-root-dispatch-lifecycle" : null;
        if (typeof nestedEvent?.isError === "boolean") { writeRecord.terminal_error = nestedEvent.isError; writeRecord.terminal_error_observed = true; }
        if (phase === "end" && typeof nestedEvent?.isError === "boolean") writeRecord.observed = { success: nestedEvent.isError === false, is_error: nestedEvent.isError, source: "tool_execution_end" };
        if (deferred) this.bufferPendingObservation(binding, "subagent_writes", writeRecord);
        else this.capture("subagent_writes", writeRecord);
        if (reasonCode) {
          throw new ProbeError("BLOCKED", retryBackendWrite ? "backend developer write was outside the exact private technical-retry allowlist" : "spec-kit-author write was outside the explicit private documentation behavior probe", {
            operational_guard: {
              reason_code: reasonCode,
              task_id: correlation.task_id,
              tool: scrub(toolName, 96),
              event_type: scrub(frame.type, 96),
              event_types: identity.exposed.event_types,
              identity,
              correlation: writeRecord.correlation,
              requested_paths: writeRecord.requested_paths,
              observed_paths: writeRecord.observed_paths,
              paths: writeRecord.paths,
            },
          });
        }
        if (phase === "start") {
          this.writeCalls.set(correlation.key, {
            sequence,
            host_workflow_ordinal: this.currentHostWorkflowOrdinal,
            paths: observedPaths,
            tool_call_id: correlation.tool_call_id,
            task_id: correlation.task_id,
            task_id_exposed: correlation.task_id_exposed === true,
            public_identity: correlation.public_identity,
            tool: correlation.tool,
          });
        } else if (phase === "end") {
          this.writeCalls.delete(correlation.key);
        }
      } else if (shell) {
        const retryBackendRepair = this.label === "native09-technical-retry-repair";
        const expectedCommand = this.label.startsWith("native09-") ? RETRY_COMMAND : TOOLING_COMMAND;
        const expectedAgent = retryBackendRepair ? "backend-developer" : "validator";
        const expectedName = Array.from(this.assignments.values()).find((item) => item?.agent === expectedAgent && typeof item.name === "string")?.name ?? null;
        const phase = nestedType === "tool_execution_start" ? "start"
          : nestedType === "tool_execution_update" || nestedType === "tool_stream_update" ? "update"
            : nestedType === "tool_execution_end" ? "end" : "unknown";
        const correlationBase = toolCorrelation(observation, nestedEvent, toolName);
        let correlationStatus = "missing";
        let pending = null;
        if (phase === "start") {
          correlationStatus = !correlationBase.available ? "missing" : this.validatorCalls.has(correlationBase.key) ? "duplicate" : "start";
        } else if (phase === "update") {
          correlationStatus = !correlationBase.available ? "missing" : this.validatorCalls.has(correlationBase.key) ? "matched" : "unknown";
          pending = correlationStatus === "matched" ? this.validatorCalls.get(correlationBase.key) : null;
        } else if (phase === "end") {
          correlationStatus = !correlationBase.available ? "missing" : this.validatorCalls.has(correlationBase.key) ? "matched" : "unknown";
          pending = correlationStatus === "matched" ? this.validatorCalls.get(correlationBase.key) : null;
        } else {
          correlationStatus = "unknown";
        }
        const directCommand = extractCommand(nestedEvent);
        const taskMatch = !(correlationBase.task_id_exposed && pending?.task_id_exposed) || correlationBase.task_id === pending.task_id;
        const identityMatch = pending ? correlationBase.public_identity === pending.public_identity : true;
        const correlation = {
          ...correlationBase,
          phase,
          status: correlationStatus,
          task_match: taskMatch,
          identity_match: identityMatch,
          invocation: pending?.invocation ?? null,
          command_match: directCommand !== null ? directCommand === expectedCommand : pending?.command_match === true,
        };
        const shape = validatorProbeShape({ observation, nestedEvent, frameType: frame.type, expectedAgent, expectedName, expectedCommand, correlation });
        this.withObservedAssignmentIdentity(shape.identity, binding, publicIdentity);
        shape.identityMatch = shape.identity.matches.any;
        shape.reason_code = phase === "unknown" ? "VALIDATOR_COMMAND_EVENT_TYPE_MISMATCH" : validatorGuardReason(shape, phase, correlationStatus, taskMatch, identityMatch);
        const commandResult = {
          sequence,
          host_arrival_ordinal: hostArrivalOrdinal,
          host_arrival_timestamp: hostArrivalTimestamp,
          host_workflow_ordinal: this.currentHostWorkflowOrdinal,
          start_sequence: pending?.sequence ?? null,
          start_workflow_ordinal: pending?.host_workflow_ordinal ?? null,
          end_workflow_ordinal: phase === "end" ? this.currentHostWorkflowOrdinal : null,
          phase,
          nested_event_type: nestedType || null,
          terminal_event: phase === "end",
          allocated_id: binding.allocated_id,
          parent_tool_call_id: binding.parent_tool_call_id,
          index: binding.index,
          job_id: binding.job_id,
          instance_id: binding.instance_id,
          domain_id_provenance: binding.domain_id_provenance,
          root_session_id: this.evidence.root_session?.session_id ?? null,
          task_id: correlation.task_id,
          assignment_id: shape.observed ? shape.publicEvent?.assignment_id ?? binding.assignment_name ?? null : binding.assignment_name ?? null,
          run_id: shape.observed ? shape.publicEvent?.run_id ?? this.logicalRunId : this.logicalRunId,
          revision: shape.observed ? shape.publicEvent?.revision ?? null : null,
          report: shape.report,
          tool: scrub(toolName, 96),
          requested: shape.requested,
          observed: shape.observed,
          command_sha256: shape.observed?.sha256 ?? null,
          command_bytes: shape.observed?.bytes ?? null,
          command_basename: shape.observed?.basename ?? null,
          command_label: expectedCommand,
          exit_code: Number.isInteger(shape.exitCode) ? shape.exitCode : null,
          exit_code_observed: Number.isInteger(shape.exitCode),
          is_error: typeof nestedEvent?.isError === "boolean" ? nestedEvent.isError : null,
          is_error_observed: typeof nestedEvent?.isError === "boolean",
          is_error_source: typeof nestedEvent?.isError === "boolean" ? "tool_execution_end" : null,
          tool_error: typeof shape.toolError === "boolean" ? shape.toolError : null,
          tool_error_observed: typeof shape.toolError === "boolean",
          event_types: shape.identity.exposed.event_types,
          identity: shape.identity,
          correlation: {
            available: correlation.available,
            phase: correlation.phase,
            status: correlation.status,
            task_match: correlation.task_match,
            identity_match: correlation.identity_match,
            tool_call_id: correlation.tool_call_id,
            task_id: correlation.task_id,
            task_id_exposed: correlation.task_id_exposed === true,
            public_identity: correlation.public_identity,
            tool: correlation.tool,
          },
          guard: { reason_code: shape.reason_code, identity_match: shape.identityMatch, command_match: shape.commandMatch, tool_error: typeof shape.toolError === "boolean" ? shape.toolError : null },
        };
        if (deferred) this.bufferPendingObservation(binding, "command_results", commandResult);
        else this.capture("command_results", commandResult);
        if (shape.reason_code) {
          throw new ProbeError("BLOCKED", "subagent shell command was outside the explicit private validator behavior probe", {
            operational_guard: {
              reason_code: shape.reason_code,
              task_id: correlation.task_id,
              tool: scrub(toolName, 96),
              event_type: scrub(frame.type, 96),
              event_types: shape.identity.exposed.event_types,
              identity: shape.identity,
              correlation: commandResult.correlation,
              requested: shape.requested,
              invocation: shape.invocation,
              observed: shape.observed,
            },
          });
        }
        if (phase === "start") {
          this.validatorCalls.set(correlation.key, {
            sequence,
            host_workflow_ordinal: this.currentHostWorkflowOrdinal,
            invocation: shape.invocation,
            command_match: shape.commandMatch,
            tool_call_id: correlation.tool_call_id,
            task_id: correlation.task_id,
            task_id_exposed: correlation.task_id_exposed === true,
            public_identity: correlation.public_identity,
            tool: correlation.tool,
          });
        } else if (phase === "end") {
          this.validatorCalls.delete(correlation.key);
        }
      } else if (FORBIDDEN_TOOL.test(toolName) || !SUBAGENT_READ_TOOL.test(toolName)) {
        throw new ProbeError("BLOCKED", `subagent used forbidden/non-read tool ${scrub(toolName)}`);
      } else if (readObservation?.phase === "end" && readObservation.success) {
        const readRecord = {
          type: nestedType, phase: "end", is_error: false,
          tool_call_id: readObservation.correlation.tool_call_id, correlation: readObservation.correlation,
          requested_paths: readObservation.requested_paths, path_resolution: "host-confined-project-filesystem-or-managed-skill-uri",
          identity: publicIdentity, allocated_id: binding.allocated_id, parent_tool_call_id: binding.parent_tool_call_id,
          index: binding.index, agent: binding.agent, agentSource: binding.agentSource,
          assignment_id: binding.assignment_name, job_id: binding.job_id, instance_id: binding.instance_id,
          domain_id_provenance: binding.domain_id_provenance,
          root_session_id: this.evidence.root_session?.session_id ?? null,
          binding_source: binding.accepted === true ? "observed-root-dispatch-lifecycle" : null,
          task_id: null, task_id_exposed: false,
          host_arrival_ordinal: hostArrivalOrdinal, host_arrival_timestamp: hostArrivalTimestamp,
          host_workflow_ordinal: this.currentHostWorkflowOrdinal, host_observation: this.evidence.host_observation,
          tool: scrub(toolName, 96), source_files: readObservation.source_files, paths: paths.map((item) => scrub(item, 1024)),
          full_content_requested: readObservation.read.full_content_requested,
        };
        if (deferred) this.bufferPendingObservation(binding, "subagent_reads", readRecord);
        else this.capture("subagent_reads", readRecord);
      }
    }
    const frameRecord = { sequence, host_arrival_ordinal: hostArrivalOrdinal, host_arrival_timestamp: hostArrivalTimestamp, host_workflow_ordinal: this.currentHostWorkflowOrdinal, ...observation.summary, type: nestedType || frame.type, tool_call_id: fullToolCallId(nestedEvent, ["toolCallId", "tool_call_id", "toolCallID", "callId", "call_id"]), ...(typeof nestedEvent?.isError === "boolean" ? { is_error: nestedEvent.isError } : {}), ...(readObservation ? { requested_paths: readObservation.requested_paths, path_resolution: "host-confined-project-filesystem-or-managed-skill-uri" } : {}), identity: publicIdentity, allocated_id: binding.allocated_id, parent_tool_call_id: binding.parent_tool_call_id, index: binding.index, job_id: binding.job_id, instance_id: binding.instance_id, domain_id_provenance: binding.domain_id_provenance, task_id: null, task_id_exposed: false, tool: toolName ? scrub(toolName, 96) : null, paths: paths.map((item) => scrub(item, 1024)) };
    if (yieldControlObservation) frameRecord.control = { kind: "yield", phase: yieldControlObservation.phase, correlation: yieldControlObservation.correlation };
    // Token deltas are diagnostic summaries, never completion or tool authority.
    const assistantDelta = nestedEvent?.assistantMessageEvent;
    if (frame.type === "subagent_event" && nestedType === "message_update") {
      const present = Object.hasOwn(nestedEvent, "assistantMessageEvent");
      frameRecord.assistant_event = {
        present,
        type: !present ? "missing" : SDK_ASSISTANT_EVENT_TYPES.has(assistantDelta?.type) ? assistantDelta.type : "unknown",
        content_index: Number.isSafeInteger(assistantDelta?.contentIndex) && assistantDelta.contentIndex >= 0 ? assistantDelta.contentIndex : null,
      };
    }
    if (frame.type === "subagent_event" && nestedType === "message_update"
      && ["text_delta", "thinking_delta", "toolcall_delta"].includes(assistantDelta?.type)
      && frameRecord.assistant_event?.content_index !== null
      && !toolName && !nestedToolCallId
      && (deferred ? ["started", "running", "progress"].includes(binding.lifecycle_status) : this.childBindingIsLive(binding))
      && !["exitCode", "exit_code", "isError", "is_error", "aborted", "error", "result", "results"]
        .some((key) => Object.hasOwn(nestedEvent, key) || Object.hasOwn(assistantDelta, key))) {
      frameRecord.nonterminal_delta_kind = assistantDelta.type;
    }
    try {
      const captureResult = deferred ? this.bufferPendingObservation(binding, "subagent_frames", frameRecord) : this.capture("subagent_frames", frameRecord);
      if (captureResult === false || this.evidence.capture.complete === false) throw new ProbeError("BLOCKED", "yield frame capture did not complete within the retention budget");
    } catch (error) {
      if (yieldTransaction) this.rollbackYieldTransaction(yieldTransaction);
      throw error;
    }
    if (observation.progress) {
      try {
        const progress = observation.progress;
        const progressStatus = String(observation.status ?? progress.status ?? "").toLowerCase();
        const progressId = preserveIdentifier(progress.id ?? observation.id);
        const progressParent = fullToolCallId(progress, ["parentToolCallId", "parent_tool_call_id"]) ?? fullToolCallId(observation.payload, ["parentToolCallId", "parent_tool_call_id"]);
        const progressIndex = Number.isSafeInteger(progress.index) ? progress.index : binding.index;
        const progressAgent = typeof progress.agent === "string" ? progress.agent : observation.agent;
        const progressSource = typeof progress.agentSource === "string" ? progress.agentSource : observation.agentSource;
        if (progressId !== binding.allocated_id || (progressParent && progressParent !== binding.parent_tool_call_id) || progressIndex !== binding.index || progressAgent !== binding.agent || (progressSource && progressSource !== binding.agentSource)) throw new ProbeError("BLOCKED", "subagent progress drifted from its allocated lifecycle identity");
        if (!deferred) this.recordPublicAssignment(binding, progress.assignment, "subagent_progress.assignment");
        if (!deferred) this.childProgressByAllocated.set(binding.allocated_id, { status: progressStatus, host_workflow_ordinal: this.currentHostWorkflowOrdinal });
        const progressExitCode = Number.isInteger(progress.exitCode) ? progress.exitCode : null;
        const explicitTerminal = progressExitCode !== null || typeof progress.isError === "boolean" || typeof progress.aborted === "boolean" || Object.prototype.hasOwnProperty.call(progress, "error") || progress.result !== undefined || Array.isArray(progress.results);
        if (explicitTerminal && (TERMINAL_STATUSES.has(progressStatus) || progressExitCode !== null || typeof progress.isError === "boolean")) {
          const terminalMetadata = { id: observation.id, allocated_id: binding.allocated_id, parent_tool_call_id: binding.parent_tool_call_id, index: binding.index, job_id: binding.job_id, instance_id: binding.instance_id, domain_id_provenance: binding.domain_id_provenance, assignment_id: binding.assignment_name, run_id: this.logicalRunId, agent: observation.agent, agentSource: observation.agentSource, status: observation.status, exitCode: progressExitCode, host_arrival_timestamp: hostArrivalTimestamp, host_workflow_ordinal: this.currentHostWorkflowOrdinal, source_kind: "native_subagent_progress" };
          const terminalRecord = operationalRecord(progress, terminalMetadata);
          if (deferred) this.bufferPendingObservation(binding, "native_progress_terminal", terminalRecord);
          if (deferred) this.bufferPendingObservation(binding, "terminal_records", terminalRecord);
          else { this.capture("native_progress_terminal", terminalRecord); this.commitTerminalRecord(terminalRecord); }
        }
        binding.progress_status = progressStatus || binding.progress_status || null;
        if (explicitTerminal && !binding.progress_terminal) binding.progress_terminal = { status: progressStatus, source: "subagent_progress", host_arrival_ordinal: hostArrivalOrdinal, host_arrival_timestamp: hostArrivalTimestamp, host_workflow_ordinal: this.currentHostWorkflowOrdinal };
      } catch (error) {
        if (yieldTransaction) this.rollbackYieldTransaction(yieldTransaction);
        throw error;
      }
    }
  }
  recordTerminal(raw, metadata, sourceKind) {
    validateKnownIdentityMetadata(raw, "terminal record", true);
    validateKnownIdentityMetadata(metadata, "terminal metadata");
    const status = String(metadata.status ?? raw?.status ?? "").toLowerCase();
    const exitCode = Number.isInteger(metadata.exitCode) ? metadata.exitCode : Number.isInteger(raw?.exitCode) ? raw.exitCode : null;
    const explicitTerminal = exitCode !== null || typeof metadata.isError === "boolean" || typeof raw?.isError === "boolean" || typeof raw?.aborted === "boolean" || Object.prototype.hasOwnProperty.call(raw ?? {}, "error") || raw?.result !== undefined || Array.isArray(raw?.results);
    if (!explicitTerminal || (!TERMINAL_STATUSES.has(status) && exitCode === null && typeof raw?.isError !== "boolean")) return;
    const binding = sourceKind === "task_tool_details" ? this.lifecycleByAllocated.get(`id:${metadata.allocated_id ?? raw?.id ?? ""}`) : null;
    if (sourceKind === "task_tool_details" && !binding) throw new ProbeError("BLOCKED", "Root task result lacked an authoritative allocated lifecycle binding");
    const record = operationalRecord(raw, { ...metadata, host_workflow_ordinal: metadata.host_workflow_ordinal ?? this.currentHostWorkflowOrdinal, source_kind: sourceKind, exitCode });
    const latchedFailure = FAILURE_STATUSES.has(String(binding?.progress_status ?? "").toLowerCase()) || FAILURE_STATUSES.has(String(binding?.progress_terminal?.status ?? "").toLowerCase());
    const successfulInline = sourceKind === "task_tool_details"
      && record.exitCode === 0
      && record.isError === false
      && record.aborted !== true
      && !(record.error_observed === true && record.error !== null)
      && !FAILURE_STATUSES.has(String(record.status ?? "").toLowerCase());
    if (latchedFailure && successfulInline) throw new ProbeError("BLOCKED", "failed or aborted child progress cannot commit a successful Root task result");
    if (binding) this.recordPublicAssignment(binding, raw?.assignment, "Root.task.details.results.assignment");
    record.assignment_sha256 = binding?.assignment_sha256 ?? null;
    this.commitTerminalRecord(record);
  }
  send(command) {
    captureSafeIdentifier(command?.id, "outgoing RPC command identity");
    if (!this.child || this.child.killed || this.stdinEnded) throw new ProbeError("BLOCKED", "cannot send RPC after process termination");
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }
  response(command, label, timeoutMs = this.timeoutMs) {
    const id = captureSafeIdentifier(command?.id, "outgoing RPC command identity");
    const waiter = this.deferred();
    this.responses.set(id, waiter);
    try { this.send(command); } catch (error) { this.responses.delete(id); throw error; }
    return this.timeout(waiter.promise, label, timeoutMs);
  }
  async captureTimeoutState(error) {
    if (!/ prompt result timed out$/.test(error?.message ?? "") || this.evidence.failure_diagnostics.length) return;
    const started = performance.now();
    const requestId = randomUUID();
    const budgetMs = Math.min(2000, this.timeoutMs);
    const expectedRoot = this.evidence.root_session?.session_id;
    const diagnostic = {
      kind: "root_state", status: "unavailable", reason_code: "ROOT_STATE_UNAVAILABLE",
      request_id: requestId, response_id: null, command: "get_state", success: null,
      root_session_id: null, root_session_id_source: null,
      original_terminal_presence: {
        prompt_result: Boolean(this.evidence.terminal?.prompt_result),
        session_settled: this.evidence.terminal?.session_settled === true,
      },
      state: { isStreaming: null, isCompacting: null, hasPendingAsyncWork: null, isSettled: null, queuedMessageCount: null },
      budget_ms: budgetMs, elapsed_ms: 0,
    };
    try {
      const response = await this.response({ id: requestId, type: "get_state" }, "timeout diagnostic state", budgetMs);
      const data = response?.data;
      const rpcMatches = response?.type === "response" && response.command === "get_state" && response.id === requestId && typeof response.success === "boolean";
      const rootMatches = typeof expectedRoot === "string" && expectedRoot.length > 0 && data?.sessionId === expectedRoot;
      if (!rpcMatches || (response.success === true && !rootMatches)) {
        diagnostic.status = "refused";
        diagnostic.reason_code = "ROOT_STATE_CORRELATION_MISMATCH";
      } else {
        diagnostic.response_id = requestId;
        diagnostic.success = response.success;
        if (rootMatches) {
          diagnostic.root_session_id = expectedRoot;
          diagnostic.root_session_id_source = "get_state.data.sessionId";
        }
        if (response.success) {
          diagnostic.status = "observed";
          diagnostic.reason_code = null;
          for (const key of ["isStreaming", "isCompacting", "hasPendingAsyncWork", "isSettled"]) {
            if (typeof data[key] === "boolean") diagnostic.state[key] = data[key];
          }
          if (Number.isSafeInteger(data.queuedMessageCount) && data.queuedMessageCount >= 0) diagnostic.state.queuedMessageCount = data.queuedMessageCount;
        }
      }
    } catch {
      // Diagnostics never replace the original prompt timeout or establish completion.
    }
    diagnostic.elapsed_ms = Math.max(0, performance.now() - started);
    this.capture("failure_diagnostics", diagnostic);
  }
  async configure() {
    const negotiation = await this.response({ id: randomUUID(), type: "negotiate_protocol", protocolVersion: 2 }, "protocol negotiation");
    this.protocolVersion = negotiation.success === true ? 2 : 1; this.evidence.rpc.protocol = { version: this.protocolVersion, negotiated: this.protocolVersion === 2 };
    const filter = await this.response({ id: randomUUID(), type: "set_event_filter", events: RPC_EVENTS, messageUpdates: "full" }, "event filter");
    if (filter.success !== true) throw new ProbeError("BLOCKED", "native event filter rejected");
    const subscription = await this.response({ id: randomUUID(), type: "set_subagent_subscription", level: "events" }, "subagent subscription");
    if (subscription.success !== true) throw new ProbeError("BLOCKED", "native subagent subscription rejected");
  }
  bindSourceHost(stateResponse, stateRequestId, promptRequestId) {
    const expectedStateRequestId = captureSafeIdentifier(stateRequestId, "source state request identity");
    const responseId = captureSafeIdentifier(stateResponse?.id, "source state response identity");
    const sessionId = captureSafeIdentifier(stateResponse?.data?.sessionId, "Root session identity");
    const requestId = captureSafeIdentifier(promptRequestId, "source prompt request identity");
    if (!expectedStateRequestId || !responseId || !sessionId || !requestId
      || stateResponse?.type !== "response" || stateResponse?.command !== "get_state" || responseId !== expectedStateRequestId || stateResponse?.success !== true || !stateResponse?.data || typeof stateResponse.data !== "object") throw new ProbeError("BLOCKED", "source-derived get_state response was not a correlated successful data response");
    this.evidence.root_session = { session_id: sessionId, host_workflow_ordinal: observedHostWorkflowOrdinal(stateResponse), observed: true, source: "get_state.data.sessionId", state_request_id: expectedStateRequestId, response_id: responseId };
    this.evidence.root_prompt = { request_id: requestId, source: "host RPC prompt request" };
    this.evidence.host_observation = { source: "host-rpc-stream", root_session_id: sessionId, root_workflow_ordinal: observedHostWorkflowOrdinal(stateResponse), root_prompt: { request_id: requestId, source: "host-rpc" }, waiter: { request_id: requestId, unique: true, correlation: "outstanding-prompt-waiter" } };
    this.promptResults.set(requestId, this.deferred());
  }
  validateRootTurnReceipt(receipt) {
    if (!receipt || receipt.prompt_result_status !== "completed" || receipt.agent_invoked !== true
      || receipt.session_settled !== true || receipt.agent_end_terminal !== true || receipt.awaiting_async !== false
      || !captureSafeIdentifier(receipt.root_session_id, "Root turn session identity")
      || !captureSafeIdentifier(receipt.prompt_request_id, "Root turn prompt identity")) blocked("Root turn omitted a completed, invoked, settled host receipt");
    const expectedSession = this.rootTurnSessionId ?? this.evidence.root_session?.session_id ?? null;
    if (expectedSession !== null && receipt.root_session_id !== expectedSession) blocked("Root session changed between preparation and execution turns");
    this.rootTurnSessionId = receipt.root_session_id;
    return receipt;
  }
  async prepareRootReads() {
    if (!Array.isArray(this.rootPreparationPaths) || this.rootPreparationPaths.length > 256) blocked("Root preparation paths must be a bounded host-supplied array");
    const paths = [...new Set(this.rootPreparationPaths)];
    const snapshot = paths.map((value) => {
      if (typeof value !== "string" || !value) blocked("Root preparation path is missing");
      const file = noSymlinkPath(this.readRoot, path.resolve(this.cwd, value), "Root preparation source");
      if (fs.lstatSync(file).nlink !== 1) blocked("Root preparation source is not a private single-link file");
      return fileRecord(file, "Root preparation source");
    });
    const verify = (expected) => {
      const current = fileRecord(noSymlinkPath(this.readRoot, expected.path, "Root preparation source"), "Root preparation source");
      if (fs.lstatSync(expected.path).nlink !== 1 || current.bytes !== expected.bytes || current.sha256 !== expected.sha256) blocked("Root preparation source bytes or identity changed");
      const startSequence = observedNative10ReadSequence(this.evidence.tool_events, expected.path, this.cwd, null);
      const start = this.evidence.tool_events.find((event) => event.sequence === startSequence);
      const end = start && this.evidence.tool_events.find((event) => event.type === "tool_execution_end"
        && event.tool_call_id === start.tool_call_id && event.read_correlation?.scope === "Root"
        && event.read_correlation?.status === "matched" && event.is_error === false && event.sequence > start.sequence);
      const readFile = end?.source_files?.find((file) => typeof file.path === "string" && samePath(path.resolve(this.cwd, file.path), expected.path));
      if (!readFile || readFile.bytes !== expected.bytes || readFile.sha256 !== expected.sha256) blocked("Root preparation omitted a matched successful Root read of the unchanged source");
    };
    if (!paths.length) return;
    this.rootPreparationActive = true;
    try {
      for (let offset = 0; offset < paths.length; offset += 6) {
        const requiredPaths = paths.slice(offset, offset + 6);
        const message = `Readonly preparation of the existing Root session, not execution or approval. Read exactly these regular project files, batching independent read calls: ${JSON.stringify(requiredPaths)}. Read their contents as input; do not start the workflows or dispatch roles described in them. Do not recurse into additional discovery, use task/wait/write/Bash, execute commands, or change files. After the actual reads, end this preparation turn with one brief factual line; no reports, hashes, transcript or approval. The host will supply the final execution prompt separately in this same session.`;
        const receipt = this.validateRootTurnReceipt(await this.runRootTurn(message, { scope: "preparation", requiredPaths }));
        for (const expected of snapshot.slice(offset, offset + 6)) verify(expected);
        if (this.readCalls?.size) blocked("Root preparation retained read START without a correlated END");
        this.capture("preparation_prompts", { scope: "preparation", required_paths: requiredPaths, receipt });
      }
      // Recheck earlier chunks too: a later read must not hide intervening drift.
      for (const expected of snapshot) verify(expected);
    } finally {
      this.rootPreparationActive = false;
    }
  }
  async runRootTurn(message, { scope = "execution", requiredPaths = [] } = {}) {
    if (!["preparation", "execution"].includes(scope) || (scope === "preparation") !== this.rootPreparationActive) blocked("Root turn scope disagrees with its host preparation phase");
    // Settlement has no request ID in the pinned SDK. Never reuse an earlier
    // turn's sticky flag or terminal; require a new event after this result.
    this.settled = false;
    this.evidence.terminal = null;
    const stateRequestId = randomUUID();
    const stateResponse = await this.response({ id: stateRequestId, type: "get_state" }, "root state");
    const responseId = captureSafeIdentifier(stateResponse.id, "Root state response identity");
    const stateSessionId = captureSafeIdentifier(stateResponse?.data?.sessionId, "Root session identity");
    if (stateResponse?.type !== "response" || stateResponse?.command !== "get_state" || responseId !== stateRequestId || stateResponse?.success !== true || !stateResponse?.data || typeof stateResponse.data !== "object") throw new ProbeError("BLOCKED", "get_state did not return a correlated successful data response");
    if (!stateSessionId) throw new ProbeError("BLOCKED", "get_state omitted the actual Root session identity");
    if (this.rootTurnSessionId !== null && stateSessionId !== this.rootTurnSessionId) blocked("get_state observed a changed Root session between turns");
    this.rootTurnSessionId = stateSessionId;
    this.evidence.root_session = { session_id: stateSessionId, host_workflow_ordinal: observedHostWorkflowOrdinal(stateResponse), observed: true, source: "get_state.data.sessionId", state_request_id: stateRequestId, response_id: responseId };
    const id = captureSafeIdentifier(randomUUID(), "Root prompt request identity"); const promptWaiter = this.deferred(); this.promptResults.set(id, promptWaiter); this.evidence.root_prompt = { request_id: id, source: "host RPC prompt request" };
    this.evidence.host_observation = { source: "host-rpc-stream", root_session_id: stateSessionId, root_workflow_ordinal: observedHostWorkflowOrdinal(stateResponse), root_prompt: { request_id: id, source: "host-rpc" }, waiter: { request_id: id, unique: true, correlation: "outstanding-prompt-waiter" } };
    const boundMessage = scope === "preparation"
      ? `${message}\nHost-observed Root session ${JSON.stringify(stateSessionId)}, prompt ${JSON.stringify(id)}. This turn is readonly preparation of ${JSON.stringify(requiredPaths)}; only confined read, grep, glob and todo are allowed. Even a configured execution write/helper policy is inactive during preparation. Do not read agent://, proc://, history://, xd://, HOME or tool catalogs. Do not dispatch, wait, write, execute or approve.`
      : `${message}\n\nHost-observed Root RPC context, not alignment checkpoint IDs or opaque child identifiers: ${JSON.stringify({ root_session: stateSessionId, prompt_request_id: id, root_session_observation: this.evidence.root_session })}. Use these exact observed values for bounded Root provenance and pass root_session and its host get_state observation unchanged in the shared task context when the descriptor's reading-tag rule requires it. The child need not invoke get_state itself: the host verifies its tag against the actual Root session observation. Keep each canonical child task item verbatim; never append this context to its task text.\nRoot execution boundary: the only generally allowed Root tools are read, grep, glob, task, wait, and todo, within the approved project and dispatch policy. Root write requires an explicit host-constructor Root write policy; Root Bash requires the exact approved helper command described below. Never call eval or any other non-allowlisted tool, including to inspect files, persist checkpoints, or execute a helper. Read only approved regular files inside the private project ${JSON.stringify(this.readRoot)}. Command cwd is ${JSON.stringify(this.cwd)}; that cwd and the exact write allowlists remain the write/command boundary even when immutable project reads use a parent directory. Do not read agent://, proc://, history://, xd://, user HOME, or tool/resource catalogs. Accept child completion through any valid supported channel: inline SingleResult in task END.details.results, delivered task_async_result, or the actual SDK wait tool. An inline terminal already supplied by task needs no additional wait. If task returns async running and no independent Root work remains, prefer a brief operational yield instead of holding the initial turn in repeated wait calls: results auto-deliver and resume this same Root. That yield is not task completion, alignment closure, or approval; perform the remaining checks and approved helper actions only after the actual terminal result arrives. Wait remains available when genuinely blocked; never poll. Preserve each channel's raw fields; absent SDK observations remain unknown. Never inspect SDK transport URIs or poll with Bash. Dispatch only the exact canonical task objects supplied above. Root Bash is forbidden unless an exact approved Root helper command is supplied; then pass only its command key, without timeout, cwd, or other optional arguments. These instructions narrow the existing guards; they do not authorize any new tool or path.`;
    const workflowBoundary = scope === "preparation" ? "" : this.label.startsWith("native-route-")
      ? "\nBounded route-phase workflow: this Root executes only the supplied route phase, not the entire Goal or a new TDD workflow. After dispatch returns async running without an inline terminal, no independent route work remains: yield this initial turn briefly and immediately so the actual result can resume this Root. Do not hold the initial turn open with repeated waits, re-read already inspected documents, or invent extra discovery as independent work. A yield is not completion or approval. After an actual supported terminal result arrives, perform all remaining required checks and exact protected helper actions. Then close the Root turn with at most six short factual lines naming the actual checkpoint/path/status and any unknowns. Do not reproduce the child JSON, task transcript, documents, or source hashes already retained and verified by the host. The host records future prompt_result, agent_end and session_settled; do not wait to observe your own future terminal or certify PASS from prose. All mandatory reads, canonical child objects, role checks, permissions and actual SDK terminal requirements remain unchanged."
      : this.label === "native10-integrated"
        ? "\nBounded Native10 asynchronous workflow: all mandatory Root reads have already been observed and hash-verified in this same Root session's preparation turns. Use that retained context rather than repeating those reads; the host still enforces every required read before TASK. Once the exact six-role TASK returns async running, all mandatory Root pre-dispatch work is finished. Immediately end this initial Root turn with a brief factual operational yield; do not hold it open in wait. Actual SDK async delivery resumes this same Root. On continuations, retain the real terminal results and yield again while children remain pending and no independent work exists. Only after all six actual terminals perform the one required retro write, then immediately give at most six factual lines without rereading or echoing reports. Operational yield is never completion or approval: all actual Root prompt_result/session_settled, child successes, mandatory reads and retro guards remain required."
        : "";
    const acknowledgement = this.response({ id, type: "prompt", message: boundMessage + workflowBoundary }, "prompt acknowledgement");
    const ack = await acknowledgement; if (ack.success !== true) throw new ProbeError("BLOCKED", "native prompt was not admitted");
    const result = await this.timeout(promptWaiter.promise, "prompt result");
    if (this.evidence.terminal?.prompt_result?.error_observed === true && this.evidence.terminal.prompt_result.error !== null) throw new ProbeError("BLOCKED", "native root prompt returned an error", { prompt_error: this.evidence.terminal.prompt_result.error });
    if (result.status !== "completed" || result.agentInvoked !== true) throw new ProbeError("BLOCKED", "native root prompt did not complete with an invoked agent");
    const freshSettlement = () => this.settled === true
      && Number.isSafeInteger(this.evidence.terminal?.prompt_result?.host_workflow_ordinal)
      && Number.isSafeInteger(this.evidence.terminal?.session_settled_host_workflow_ordinal)
      && this.evidence.terminal.session_settled_host_workflow_ordinal > this.evidence.terminal.prompt_result.host_workflow_ordinal;
    if (!freshSettlement()) { this.settled = false; const waiter = this.deferred(); this.settledWaiters.push(waiter); await this.timeout(waiter.promise, "session settled"); }
    if (!freshSettlement()) blocked("Root settlement did not follow the current correlated prompt result");
    if (this.evidence.continuation_failures.length) throw new ProbeError("BLOCKED", "Root continuation reported an error or abort after the initial prompt result");
    const lastAgentEnd = this.evidence.terminal?.agent_end;
    if (!lastAgentEnd || lastAgentEnd.isTerminal !== true || lastAgentEnd.awaitingAsyncWork === true) throw new ProbeError("BLOCKED", "Root session settlement did not expose a terminal non-awaiting agent_end");
    return { root_session_id: stateSessionId, prompt_request_id: id, prompt_result_status: result.status, agent_invoked: result.agentInvoked,
      session_settled: true, agent_end_terminal: true, awaiting_async: false,
      awaiting_async_source: "derived from the actual fresh session_settled predicate, not a default for an absent SDK field" };
  }
  async execute(message) {
    await this.start(); await this.configure();
    await this.prepareRootReads();
    // Preparation is evidence of reads only, never the final execution verdict.
    this.settled = false; this.evidence.terminal = null; this.evidence.root_prompt = null;
    const receipt = this.validateRootTurnReceipt(await this.runRootTurn(message, { scope: "execution" }));
    if (![...this.rootTaskCalls.values()].filter((item) => item.kind === "dispatch").every((item) => item.ended === true)) throw new ProbeError("BLOCKED", "a dispatched root task had no unique correlated END");
    for (const call of this.rootTaskCalls.values()) {
      if (call.kind !== "dispatch") continue;
      const bindings = [...this.lifecycleByAllocated.values()].filter((binding) => binding.parent_tool_call_id === call.tool_call_id);
      if (bindings.length !== call.assignments.length) throw new ProbeError("BLOCKED", "Root settled before every dispatched assignment had an observed allocation");
      for (let index = 0; index < call.assignments.length; index += 1) {
        const allocated = bindings.filter((binding) => binding.index === index);
        const records = allocated.length === 1 ? this.evidence.task_records.filter((record) => record.allocated_id === allocated[0].allocated_id && record.parent_tool_call_id === call.tool_call_id && record.index === index) : [];
        if (records.length !== 1 || !taskRecordSucceeded(records[0])) throw new ProbeError("BLOCKED", "Root settled without one authoritative successful completion for every dispatched assignment");
      }
    }
    const hostObservation = this.evidence.host_observation;
    for (const event of this.evidence.tool_events) {
      if (!event.root_session_id && event.tool && !/^tasks?(?:$|[_.:])/i.test(event.tool)) {
        event.root_session_id = event.host_observation?.root_session_id ?? receipt.root_session_id;
        event.root_session_source = "host_get_state.data.sessionId";
        // Preserve the actual preparation prompt's provenance on its reads.
        event.host_observation ??= hostObservation;
      }
    }
    this.evidence.terminal = { ...(this.evidence.terminal ?? {}), status: receipt.prompt_result_status, session_settled: receipt.session_settled, root_binding: { root_session: receipt.root_session_id, root_session_source: this.evidence.root_session.source, prompt_request_id: receipt.prompt_request_id, prompt_result_id: this.evidence.terminal?.prompt_result?.id ?? null, prompt_result_id_source: this.evidence.terminal?.prompt_result?.id ? "prompt_result.id/RPC request correlation" : "outstanding-prompt-waiter" } };
    if (this.readCalls?.size) blocked("settled Root retained read START without a correlated END");
    if (this.yieldCalls?.size) blocked("settled Root retained child yield lifecycle without a correlated END");
    if (this.writeCalls?.size) blocked("settled Root retained child write START without a correlated END");
    if (this.rootWriteCalls?.size) blocked("settled Root retained Root write START without a correlated END");
    await this.close(); return this.evidence;
  }
  async close() {
    if (!this.child || this.stdinEnded) return; this.stdinEnded = true; this.child.stdin.end(); const closed = await this.timeout(this.closed.promise, "process drain", 30_000); if (this.fatal) throw this.fatal; if (closed.code !== 0) throw new ProbeError("BLOCKED", "OMP exited unsuccessfully", { code: closed.code });
  }
  async abort() {
    if (!this.child || this.child.killed) return; try { if (!this.stdinEnded) this.send({ id: randomUUID(), type: "abort" }); } catch {} if (!this.stdinEnded) { this.stdinEnded = true; this.child.stdin.end(); } await new Promise((resolve) => setTimeout(resolve, 250)); if (!this.child.killed) this.child.kill();
  }
}



function findForbiddenKey(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findForbiddenKey(item, depth + 1); if (found) return found; } return null; }
  for (const [key, child] of Object.entries(value)) { if (FORBIDDEN_TASK_KEYS.has(key)) return key; const found = findForbiddenKey(child, depth + 1); if (found) return found; }
  return null;
}
function native10ReadingContext(fixture, revision, nonce, qualityFixture) {
  const record = (relative) => {
    const actual = fileRecord(noSymlinkPath(fixture.project, path.join(fixture.project, relative), "native10 caller source"), "native10 caller source");
    return { path: relative, bytes: actual.bytes, sha256: actual.sha256 };
  };
  const reader_sources = [
    "docs/functional-guide.md", ".omp/state/native10-instructions.md",
    ".omp/state/quality-context.json", ".omp/state/quality.json",
    "consumer-sources/tdd-orchestrator/references/quality-policy.md",
    "consumer-sources/ship/references/integrated-delivery.md",
    "consumer-sources/specs/specs005-omp-compatible-release/contracts/interface-contract.md",
  ].map(record);
  const consumer_references = [
    "consumer-sources/tdd-orchestrator/lib/quality.mjs",
    "consumer-sources/tdd-orchestrator/lib/state.mjs",
    "consumer-sources/tdd-orchestrator/lib/execution.mjs",
    "consumer-sources/ship/bin/lib.mjs",
  ].map(record);
  const profile_manifest = NATIVE10_ASSIGNMENTS.map(([agent, name]) => ({
    agent, instance_id: name, ...record(`.omp/agents/${agent}.md`),
    provenance: "host-observed installed project profile bytes; not runtime model selection",
  }));
  const installedSources = [".omp/skills", ".omp/agents"].flatMap((base) =>
    fingerprintPrivateRoot(path.join(fixture.project, base), "native10 installed sources").files
      .map((file) => ({ ...file, path: `${base}/${file.path}` })));
  const hash_catalog = [...new Map([
    ...installedSources, ...CONSUMER_PATHS.map((file) => record(`consumer-sources/${file}`)),
    ...reader_sources, ...NATIVE10_ASSIGNMENTS.map(([, name]) => record(`.omp/state/native10-tasks/${name}.json`)),
  ].map((file) => [file.path, file])).values()];
  const context_digest = sha256Text(JSON.stringify({ run_id: fixture.logicalRunId, revision, nonce, reader_sources, consumer_references, profile_manifest, hash_catalog }));
  const reader_context = { run_id: fixture.logicalRunId, source_revision: revision, context_digest };
  const role_contexts = Object.fromEntries(profile_manifest.map((profile) => [profile.instance_id, {
    ...reader_context, instance_id: profile.instance_id, requested_profile: profile,
    effective_model: { actual: null, observation: "unverified" },
  }]));
  return {
    reader_sources, consumer_references, profile_manifest, reader_context, role_contexts, hash_catalog,
    context_provenance: "Caller prepared from actual private file bytes before SDK dispatch; fixture input, not Goal approval.",
    quality_context_digest: qualityFixture.contextDigest,
    quality_inventory_revision: qualityFixture.current.digest,
    revision_domains: "source_revision is src/tiny.mjs SHA-256; quality inventory revision and caller context digest are distinct domains.",
  };
}

function profileTask(agent, name, fixture, revision) {
  const role = {
    "requirements-reader": "Read the exact acceptance/contract and emit the profile's REQUIREMENTS_READING_V1 schema with actual sources, run_id and source_revision; do not approve code.",
    architect: "Read the consumer boundary and emit the profile's ARCHITECTURE_ANALYSIS_V1 schema with actual sources, run_id and source_revision; do not change files or approve code.",
    "spec-kit-author": `Read the copied Spec Kit; write only ${NATIVE10_DOC_HANDOFF}, a bounded handoff containing AC-016 as pending outer Goal context, AC-001 as the local fixture criterion, the workload revision, all four copied Spec Kit paths and NOT_EXECUTED for external publication. Never claim Goal acceptance. No source, test, copied Spec Kit or protected .omp skills/agents edits.`,
    "deep-reviewer": "Read the actual consumer copies, workload and documentation handoff when available, then emit the native DEEP_REVIEW schema with the exact reviewed_revision; do not emit a TDD verdict or add lifecycle fields.",
    "peer-reviewer": "Read the actual private workload and documentation handoff when available, then emit the native TDD_PEER_REVIEW schema with protocol_mode TDD_PEER_REVIEW, agent peer-reviewer, status APROVADO or BLOQUEADO and the exact reviewed_revision; do not emit VALID or add lifecycle fields.",
    validator: `Read the real receipts and execute exactly ${TOOLING_COMMAND} from the private project. Preserve the command's actual public report and terminal IDs/status/exit code; do not manufacture phase, route, owner, failure_origin or lifecycle fields.`,
  }[agent];
  if (!role) blocked(`native task ${name} is not an applicable NATIVE-10 role`);
  const skill = agent === "requirements-reader" ? "alignment" : agent === "peer-reviewer" || agent === "deep-reviewer" ? "deep-review" : agent === "architect" ? "architecture" : "tdd-orchestrator";
  const protocolInstruction = ["requirements-reader", "architect", "deep-reviewer", "peer-reviewer"].includes(agent)
    ? "Output only the installed profile's declared structured protocol and required fields; no extra lifecycle/schema/type/phase/route/owner fields."
    : "Use normal profile output; preserve only its supported fields and actually observed status/actions.";
  return [
    `Run ${fixture.logicalRunId}; workload SHA-256 ${revision}; role ${agent}; instance ${name}; private cwd ${fixture.project}.`,
    `First read .omp/agents/${agent}.md and .omp/skills/${skill}/SKILL.md; before other fixture paths. These installed project files are the matching profile/skill for this task. Use only filesystem paths under the descriptor's exact private cwd, including for their references; never use skill:// aliases, collision-namespaced copies such as agent/*, or other resource catalogs: they can resolve different global bytes outside the approved project. Then read .omp/state/native10-workload.json and docs/functional-guide.md. Use mandatory reader_sources and the role-relevant consumer references from the workload; batch independent reads after profile/skill instructions, rather than recursively auditing the copied Goal.`,
    `Use workload.role_contexts[${JSON.stringify(name)}] for your caller-bound run/source_revision/context_digest and requested profile bytes/hash; do not substitute the validator binding or quality inventory revision. Runtime model selection is unknown unless actually observed: actual:null, observation:unverified, as the installed profile permits.`,
    "Use workload.hash_catalog for exact hashes/bytes of files actually read, including the installed skill/reference/profile and this task descriptor. The catalog is available provenance, not a requirement to read every listed file.",
    "The disposable application's local acceptance is defined by docs/functional-guide.md. Copied package Spec Kit and seeded library controls are API context, not proof that the tiny test satisfies Goal AC-016. Review subject: src/tiny.mjs, tests/tiny.test.mjs, the local guide and the bounded handoff when available; inspect relevant consumer boundaries without turning this into whole-Goal approval. Report any genuine in-scope findings honestly; no verdict is prescribed. All outer Goal Native/gates remain mandatory and independent.",
    `Role action: ${role}`,
    protocolInstruction,
    "Only the role's reads/reports and exact bounded documentation write or validator command above are authorized. No source checkout/global profile/settings/auth/protected-overlay changes, nested tasks, network, Git or host/service actions. Never expose credentials, provider diagnostics, prompts, hidden reasoning or COT.",
  ].join("\n");
}
function native10TaskDescriptors(fixture, revision) {
  const cached = native10AssignmentCache.get(fixture);
  if (cached) {
    if (cached.revision !== revision || cached.project !== fixture.project || cached.runId !== fixture.logicalRunId) blocked("Native10 instruction snapshot changed after construction");
    return cached.descriptors;
  }
  const descriptors = Object.freeze(NATIVE10_ASSIGNMENTS.map(([agent, name]) => {
    const body = profileTask(agent, name, fixture, revision);
    const content = `${JSON.stringify({ schema_version: 1, kind: "NATIVE10_ROLE_TASK", name, agent, run_id: fixture.logicalRunId, source_revision: revision, task_lines: body.split("\n") }, null, 2)}\n`;
    return Object.freeze({ name, agent, path: `.omp/state/native10-tasks/${name}.json`, body, content, bytes: Buffer.byteLength(content, "utf8"), sha256: sha256Text(content) });
  }));
  native10AssignmentCache.set(fixture, { revision, project: fixture.project, runId: fixture.logicalRunId, descriptors });
  return descriptors;
}
function prepareNative10TaskDescriptors(fixture, revision) {
  return native10TaskDescriptors(fixture, revision).map((descriptor) => {
    const file = path.join(fixture.project, descriptor.path);
    noSymlinkPath(fixture.project, file, "Native10 task descriptor");
    if (fs.existsSync(file)) {
      regular(file, "existing Native10 task descriptor");
      if (fs.lstatSync(file).nlink !== 1) blocked("existing Native10 task descriptor is not single-linked");
      const existing = fs.readFileSync(file);
      if (!existing.equals(Buffer.from(descriptor.content, "utf8"))) blocked("existing Native10 task descriptor bytes contradicted the canonical task");
    } else writePrivate(file, descriptor.content, fixture.project, "Native10 task descriptor");
    return { path: descriptor.path, bytes: descriptor.bytes, sha256: descriptor.sha256 };
  });
}
function buildNativeAssignments(fixture, revision) {
  const descriptors = native10TaskDescriptors(fixture, revision);
  const cached = native10AssignmentCache.get(fixture);
  if (!cached.assignments) cached.assignments = Object.freeze(descriptors.map((descriptor) => {
    const { name, agent } = descriptor;
    return Object.freeze({
      name, agent,
      task: `Load ${descriptor.path} entirely without ranges/offset/limit. Execute its task_lines, including the profile/skill reads; use its private cwd for relative paths. Descriptor is read-only.`,
      solutionSpace: "Fixed role contract in descriptor.",
    });
  }));
  return cached.assignments;
}
function native10RequiredReadPaths(fixture) {
  return [
    ...SKILLS.map((skill) => path.join(fixture.project, ".omp/skills", skill, "SKILL.md")),
    ...AGENTS.map(([, , file]) => path.join(fixture.project, ".omp/agents", file)),
    ...CONSUMER_PATHS.map((relativePath) => path.join(fixture.project, "consumer-sources", relativePath)),
    path.join(fixture.project, ".omp/state/native10-workload.json"),
    path.join(fixture.project, ".omp/state/quality.json"),
    path.join(fixture.project, ".omp/state/quality-context.json"),
    path.join(fixture.project, ".omp/state/native10-review-receipt.json"),
    path.join(fixture.project, ".omp/state/secrets-receipt.json"),
    path.join(fixture.project, ".omp/state/dependencies-receipt.json"),
    path.join(fixture.project, ".omp/state/native10-retro-evidence.txt"),
    path.join(fixture.project, ".omp/state/execution-source.txt"),
    path.join(fixture.project, ".omp/state/native-tooling/lifecycle-check.mjs"),
    path.join(fixture.project, "src/tiny.mjs"),
    path.join(fixture.project, "tests/tiny.test.mjs"),
    path.join(fixture.project, "docs/functional-guide.md"),
    ...NATIVE10_ASSIGNMENTS.map(([, name]) => path.join(fixture.project, `.omp/state/native10-tasks/${name}.json`)),
  ];
}

function buildNativePrompt(fixture, revision, retroBinding, assignments = buildNativeAssignments(fixture, revision)) {
  const tasks = assignments;
  if (!retroBinding || typeof retroBinding !== "object" || !SHA256.test(String(retroBinding.evidenceSha256 ?? "")) || !SHA256.test(String(retroBinding.contextDigest ?? ""))) throw new ProbeError("BLOCKED", "native RETRO root binding requires an actual evidence hash and quality context digest");
  const retroArtifactPath = path.join(fixture.project, NATIVE_RETRO_ARTIFACT);
  const mustRead = native10RequiredReadPaths(fixture);
  return [
    "Perform one bounded authentic NATIVE-10 observation in the disposable private project.",
    `Logical run id: ${fixture.logicalRunId}; workload revision: ${revision}.`,
    `Before task fanout, ROOT must complete a successful read of every installed skill/profile and every pertinent consumer/workload file listed here: ${mustRead.join(", ")}. Each read END must precede fanout; failed reads, grep/glob discovery and delegated reads do not substitute for Root content observation.`,
    "Root scheduling: all listed read-only file inspections are independent. Issue multiple read calls in the same assistant turn, in batches; do not spend one model turn per file. Finish every required successful read before task fanout. Each file needs one successful observation, not repeated reads.",
    "This is one fixed private-fixture observation, not execution of the whole Goal or every workflow described by the inspected skills. Read required policy references when needed for the specified role/retro action, but do not open interviews, new TDD/Ship plans, recursive catalog tours or unrelated work.",
    "After all six actual child terminals and the required retro write END, immediately emit a concise factual handoff. The host validates the actual retro bytes and observes future Root prompt_result/session_settled. Do not reread your handoff/retro artifact, repair missing evidence outside this fixed scope, wait for your own future terminal or echo child reports. Report honest INCOMPLETE results as such; prose/yield/quiet never substitutes for observed completion.",
    "Use dynamically exposed read, grep, glob, wait, todo and task tools at ROOT; write is allowed only for the exact required retro-request artifact described below, after its stated prerequisites. Dispatch exactly the applicable roles listed below once; do not dispatch host/frontend/test/backend/refactorer merely to satisfy package counts. If task exposes batch, dispatch one {context,tasks[]} call; otherwise equivalent flat calls. Every item has a unique name, exact agent and non-empty solutionSpace. Do not send model, effort, thinkingLevel, structured, isolated, tools, settings, provider, alias, outputSchema, schemaMode or global overrides.",
    "Copy the following context/tasks into the task call verbatim. Do not expand descriptor contents into arguments, rewrite task strings, add fields or append commentary to the tool call.",
    JSON.stringify({ context: `NATIVE10 private workload; logical run ${fixture.logicalRunId}; private cwd ${fixture.project}; external effects are forbidden.`, tasks }, null, 2),
    "Retain every actual terminal task result through the supported SDK channels; after async running with no independent work, end the initial turn and let real async delivery resume this Root rather than holding that turn in wait. A launch/ACK/agent_end/operational yield is not a terminal job result. Preserve actual IDs, statuses, agentSource, profile structured output, command reports, revisions and exit codes. Never infer missing fields or synthesize lifecycle yields; the final retro action remains after all six actual terminals.",
    `After all required reads and task terminals, and only after reading the installed retro owner/opt-out policy, ROOT must make exactly one write to ${retroArtifactPath}. Write a bounded JSON request (not a prebuilt decision) with schema_version ${NATIVE_RETRO_ARTIFACT_SCHEMA}, run_id ${fixture.logicalRunId}, owner "ship", route "full", delivery_report ".omp/state/quality.json", evidence path ".omp/state/native10-retro-evidence.txt" and actual SHA-256 ${retroBinding.evidenceSha256}, expected_context_digest ${retroBinding.contextDigest}, requested false, opt_out true, first_pilot/significant_failure/significant_rework/user_unblock false, and analysis_dispatch "none". Do not write any other path or dispatch any analyzer/retro task; the integration will run the real retro consumer after observing this root artifact.`,
    "Root owns the package handoff and independently retains real quality/state/execution/Ship/retro consumer envelopes as library controls. External Ship remains quality-gate-only with no publication. Native acceptance is based on observed actions, artifacts, profile schemas and terminal envelopes, not a phase spreadsheet or prompt prose.",
  ].join("\n\n");
}
function firstTaskSequence(events) { return events.filter((event) => event.type === "tool_execution_start" && /^tasks?(?:$|[_.:])/i.test(event.tool)).map((event) => event.sequence).sort((a, b) => a - b)[0] ?? null; }
function observedPathSequence(events, expected, cwd) {
  const target = path.resolve(expected).toLowerCase(); let first = null;
  for (const event of events) {
    if (event.type !== "tool_execution_start" || !/^(?:read|grep|glob)(?:$|[_.:])/i.test(event.tool)) continue;
    for (const raw of event.paths ?? []) {
      const actual = path.resolve(cwd, raw).toLowerCase();
      if (actual === target) first = first === null ? event.sequence : Math.min(first, event.sequence);
    }
  }
  return first;
}
function observedNative10ReadSequence(events, expected, cwd, before) {
  const matchesPath = (value) => typeof value === "string" && samePath(path.resolve(cwd, value), expected);
  const starts = new Map();
  let first = null;
  for (const event of events) {
    if (!/^read(?:$|[_.:])/i.test(event.tool ?? "") || typeof event.tool_call_id !== "string" || !event.tool_call_id
      || !Number.isSafeInteger(event.sequence) || event.sequence < 1) continue;
    const id = event.tool_call_id;
    if (event.type === "tool_execution_start") {
      starts.set(id, starts.has(id) ? null : event);
      continue;
    }
    if (event.type !== "tool_execution_end") continue;
    const start = starts.get(id);
    starts.delete(id);
    if (!start || start.tool !== event.tool || start.sequence >= event.sequence
      || (before !== null && event.sequence >= before) || event.is_error !== false
      || event.read_correlation?.status !== "matched" || event.read_correlation.scope !== "Root"
      || event.read_correlation.tool_call_id !== id
      || !Array.isArray(start.paths) || !start.paths.some(matchesPath)
      || !Array.isArray(event.paths) || event.paths.length !== start.paths.length
      || event.paths.some((value, index) => typeof value !== "string" || !samePath(path.resolve(cwd, value), path.resolve(cwd, start.paths[index])))
      || !Array.isArray(event.source_files) || !event.source_files.some((file) => matchesPath(file?.path)
        && Number.isSafeInteger(file.bytes) && file.bytes >= 0
        && typeof file.sha256 === "string" && SHA256.test(file.sha256))) continue;
    // Hashes identify the file at read time; quality receipts may change later.
    first = first === null ? start.sequence : Math.min(first, start.sequence);
  }
  return first;
}

function terminalRecords(evidence) {
  return (evidence?.task_records ?? []).filter((record) =>
    (record?.source_kind === "task_tool_details" || record?.source_kind === "task_async_result" || record?.source_kind === "task_wait_result")
    && isAuthoritativeTaskRecord(record));
}
function terminalForAssignment(records, name) {
  const expected = String(name).toLowerCase();
  return records.filter((record) => typeof record?.assignment_id === "string" && record.assignment_id.toLowerCase() === expected);
}
function profileSchemaObservation(agent, terminal, revision) {
  const data = terminal?.structured_data ?? {};
  if (!terminal) return { status: "PENDING", reason: "terminal result absent" };
  if (agent === "requirements-reader") return {
    status: data.protocol === "REQUIREMENTS_READING_V1" && data.role === agent && ["COMPLETE", "INCOMPLETE"].includes(data.status) && data.run_id && data.source_revision === revision ? "PASS" : "PENDING",
    protocol: data.protocol ?? null, role: data.role ?? null, profile_status: data.status ?? null, run_id: data.run_id ?? null, source_revision: data.source_revision ?? null,
  };
  if (agent === "architect") return {
    status: data.protocol === "ARCHITECTURE_ANALYSIS_V1" && data.role === agent && ["COMPLETE", "INCOMPLETE"].includes(data.status) && data.run_id && data.source_revision === revision ? "PASS" : "PENDING",
    protocol: data.protocol ?? null, role: data.role ?? null, profile_status: data.status ?? null, run_id: data.run_id ?? null, source_revision: data.source_revision ?? null,
  };
  if (agent === "deep-reviewer") return {
    status: data.agent === "deep-reviewer" && data.protocol_mode === "DEEP_REVIEW" && data.status === "VALID" && data.reviewed_revision === revision ? "PASS" : "PENDING",
    agent: data.agent ?? null, protocol_mode: data.protocol_mode ?? null, profile_status: data.status ?? null, reviewed_revision: data.reviewed_revision ?? null,
  };
  if (agent === "peer-reviewer") return {
    status: data.agent === "peer-reviewer" && data.protocol_mode === "TDD_PEER_REVIEW" && ["APROVADO", "BLOQUEADO"].includes(data.status) && data.reviewed_revision === revision ? "PASS" : "PENDING",
    agent: data.agent ?? null, protocol_mode: data.protocol_mode ?? null, profile_status: data.status ?? null, reviewed_revision: data.reviewed_revision ?? null,
  };
  return { status: "PASS", protocol: null, profile_status: null };
}
function inspectRootRetroArtifact(evidence, fixture) {
  const artifactPath = path.join(fixture.project, NATIVE_RETRO_ARTIFACT);
  const policyPath = path.join(fixture.project, "consumer-sources/retro/references/protocol.md");
  const writes = Array.isArray(evidence?.root_writes) ? evidence.root_writes : [];
  const starts = writes.filter((item) => item.phase === "start");
  const ends = writes.filter((item) => item.phase === "end");
  const end = ends.length === 1 ? ends[0] : null;
  const writeSequence = end?.sequence ?? null;
  const policySequence = observedPathSequence(evidence?.tool_events ?? [], policyPath, fixture.project);
  const analyzerDispatches = (evidence?.task_calls ?? []).flatMap((call) => call.assignments ?? []).filter((item) => /analysis|retro/i.test(`${item?.name ?? ""} ${item?.agent ?? ""}`));
  const failures = [];
  if (starts.length !== 1 || !end || writes.some((item) => item.guard?.reason_code)) failures.push("root retro write did not expose exactly one admitted start/end with a clean guard");
  if (end && (end.terminal_error_observed !== true || end.terminal_error !== false)) failures.push("root retro write END did not expose explicit isError:false");
  if (policySequence === null || writeSequence === null || policySequence >= writeSequence) failures.push("root did not read the installed retro policy before the actual decision artifact write");
  if (analyzerDispatches.length) failures.push("native root dispatched an analyzer/retro task");
  let parsed = null;
  let artifactSha256 = null;
  try {
    const stat = fs.statSync(artifactPath);
    if (!stat.isFile() || stat.size > 8192) throw new Error("artifact is not a bounded regular file");
    const bytes = fs.readFileSync(artifactPath);
    artifactSha256 = sha256Bytes(bytes);
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    failures.push(`root retro artifact unavailable or invalid: ${scrub(error?.message ?? error)}`);
  }
  const expectedKeys = ["analysis_dispatch", "delivery_report", "evidence", "expected_context_digest", "first_pilot", "opt_out", "owner", "requested", "route", "run_id", "schema_version", "significant_failure", "significant_rework", "user_unblock"];
  const keysExact = parsed && !Array.isArray(parsed) && Object.keys(parsed).sort().join("\0") === expectedKeys.slice().sort().join("\0");
  const evidenceItem = parsed?.evidence?.length === 1 ? parsed.evidence[0] : null;
  const artifactValid = Boolean(
    keysExact
    && parsed.schema_version === NATIVE_RETRO_ARTIFACT_SCHEMA
    && parsed.run_id === fixture.logicalRunId
    && parsed.owner === "ship"
    && parsed.route === "full"
    && parsed.delivery_report === ".omp/state/quality.json"
    && parsed.expected_context_digest && SHA256.test(parsed.expected_context_digest)
    && evidenceItem?.path === ".omp/state/native10-retro-evidence.txt"
    && SHA256.test(String(evidenceItem?.sha256 ?? ""))
    && parsed.requested === false
    && parsed.opt_out === true
    && parsed.first_pilot === false
    && parsed.significant_failure === false
    && parsed.significant_rework === false
    && parsed.user_unblock === false
    && parsed.analysis_dispatch === "none"
  );
  const artifactChecks = {
    keys_exact: keysExact,
    schema: parsed?.schema_version === NATIVE_RETRO_ARTIFACT_SCHEMA,
    run_id: parsed?.run_id === fixture.logicalRunId,
    owner: parsed?.owner === "ship",
    route: parsed?.route === "full",
    delivery_report: parsed?.delivery_report === ".omp/state/quality.json",
    context_digest: Boolean(parsed?.expected_context_digest && SHA256.test(parsed.expected_context_digest)),
    evidence: evidenceItem?.path === ".omp/state/native10-retro-evidence.txt" && SHA256.test(String(evidenceItem?.sha256 ?? "")),
    requested: parsed?.requested === false,
    opt_out: parsed?.opt_out === true,
    controls: parsed?.first_pilot === false && parsed?.significant_failure === false && parsed?.significant_rework === false && parsed?.user_unblock === false,
    analysis_dispatch: parsed?.analysis_dispatch === "none",
  };
  if (!artifactValid) failures.push("root retro artifact schema/owner/opt-out binding is invalid");
  return {
    status: failures.length ? "PENDING" : "PASS",
    artifact: parsed ? safeValue(parsed) : null,
    artifact_path: NATIVE_RETRO_ARTIFACT,
    artifact_sha256: artifactSha256,
    root_writes: writes,
    policy_read_sequence: policySequence,
    write_sequence: writeSequence,
    analyzer_dispatches: analyzerDispatches,
    failures,
    artifact_checks: artifactChecks,
    evidence_level: "native-root-write-and-policy-read",
  };
}
function native10DescriptorRead(evidence, fixture, revision, name, terminal) {
  const descriptor = native10TaskDescriptors(fixture, revision).find((item) => item.name === name);
  const unknown = { status: "PENDING", path: descriptor.path, sha256: null, bytes: null, binding: null, full_content_requested: null };
  if (!terminal || typeof terminal.allocated_id !== "string" || !Number.isSafeInteger(terminal.index)) return unknown;
  const binding = { allocated_id: terminal.allocated_id, parent_tool_call_id: terminal.parent_tool_call_id, index: terminal.index, agent: terminal.agent, agentSource: terminal.agentSource };
  const target = path.resolve(fixture.project, descriptor.path);
  const actions = [...(evidence.subagent_writes ?? []), ...(evidence.command_results ?? [])].filter((item) => item.phase === "start" && item.allocated_id === binding.allocated_id && item.parent_tool_call_id === binding.parent_tool_call_id);
  for (const read of evidence.subagent_reads ?? []) {
    if (read.type !== "tool_execution_end" || read.phase !== "end" || read.is_error !== false
      || read.allocated_id !== binding.allocated_id || read.parent_tool_call_id !== binding.parent_tool_call_id
      || read.index !== binding.index || read.agent !== descriptor.agent || read.agent !== binding.agent
      || read.agentSource !== "project" || binding.agentSource !== "project"
      || read.correlation?.status !== "matched" || read.correlation.scope !== binding.allocated_id
      || typeof read.tool_call_id !== "string" || read.correlation.tool_call_id !== read.tool_call_id
      || read.full_content_requested !== true
      || !Number.isSafeInteger(read.host_arrival_ordinal)
      || !Array.isArray(read.requested_paths) || !read.requested_paths.some((value) => typeof value === "string" && samePath(path.resolve(fixture.project, value), target))
      || actions.some((action) => !Number.isSafeInteger(action.host_arrival_ordinal) || action.host_arrival_ordinal <= read.host_arrival_ordinal)) continue;
    const file = Array.isArray(read.source_files) ? read.source_files.find((item) => typeof item?.path === "string" && samePath(path.resolve(fixture.project, item.path), target)) : null;
    if (file?.sha256 !== descriptor.sha256 || file?.bytes !== descriptor.bytes) continue;
    return { status: "PASS", path: descriptor.path, sha256: file.sha256, bytes: file.bytes, binding, full_content_requested: true };
  }
  return unknown;
}

function inspectNative(evidence, fixture, revision, alignmentBinding = null) {
  const failures = [];
  const dispatches = (evidence.task_calls ?? []).filter((call) => call.kind === "dispatch");
  if (!dispatches.length) failures.push("no native task dispatch observed");
  const dispatchedAssignments = dispatches.flatMap((call) => Array.isArray(call.assignments) ? call.assignments : []);
  const counts = new Map();
  const firstByName = new Map();
  for (const item of dispatchedAssignments) {
    if (typeof item?.name !== "string" || !item.name.trim()) continue;
    const key = item.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!firstByName.has(key)) firstByName.set(key, item);
  }
  const expectedAssignmentNames = new Set(NATIVE10_ASSIGNMENTS.map(([, name]) => name));
  for (const [agent, name] of NATIVE10_ASSIGNMENTS) {
    const key = name.toLowerCase();
    const item = firstByName.get(key);
    if (!item || counts.get(key) !== 1 || item.agent !== agent || !item.task_sha256) failures.push(`missing/duplicate/invalid applicable task caller ${name}`);
  }
  const nonApplicable = dispatchedAssignments.map((item) => item?.name).filter((name) => typeof name === "string" && PROFILE_NAMES.some(([, expected]) => expected.toLowerCase() === name.toLowerCase()) && !expectedAssignmentNames.has(name));
  if (nonApplicable.length) failures.push(`native caller dispatched non-applicable package roles: ${nonApplicable.join(", ")}`);
  const expectedCount = NATIVE10_ASSIGNMENTS.reduce((sum, [, name]) => sum + (counts.get(name.toLowerCase()) ?? 0), 0);
  if (expectedCount !== NATIVE10_ASSIGNMENTS.length || dispatchedAssignments.some((item) => typeof item?.name === "string" && counts.get(item.name.toLowerCase()) > 1)) failures.push("native caller did not dispatch exactly one instance of each applicable NATIVE-10 role");
  const first = firstTaskSequence(evidence.tool_events);
  const requiredReads = native10RequiredReadPaths(fixture);
  const reads = requiredReads.map((file) => ({ path: path.relative(fixture.project, file).replaceAll("\\", "/"), sequence: observedNative10ReadSequence(evidence.tool_events, file, fixture.project, first) }));
  for (const read of reads) if (read.sequence === null || (first !== null && read.sequence >= first)) failures.push(`root did not read ${read.path} before fanout`);
  if (evidence.capture?.complete !== true) failures.push("native operational capture incomplete");
  if (evidence.terminal?.prompt_result?.status !== "completed" || evidence.terminal?.prompt_result?.agentInvoked !== true || evidence.terminal?.session_settled !== true) failures.push("native root/session terminal settlement incomplete");
  if (evidence.terminal?.agent_end?.awaitingAsyncWork === true) failures.push("native root agent_end still awaited asynchronous work");
  const rootDispatchCount = dispatches.reduce((sum, call) => sum + (call.kind === "dispatch" ? 1 : 0), 0);
  const rootEnds = (Array.isArray(evidence.root_task_ends) ? evidence.root_task_ends : []).filter((item) => item?.kind === "dispatch");
  if (rootDispatchCount !== rootEnds.length || rootEnds.some((item) => item?.isError !== false || typeof item?.tool_call_id !== "string")) failures.push("each dispatched root task requires exactly one correlated END.isError:false");
  const hostObservation = evidence.host_observation;
  if (evidence.terminal?.agent_end?.isError !== undefined || evidence.terminal?.agent_end?.isTerminal !== true || evidence.terminal?.agent_end?.awaitingAsyncWork === true) failures.push("root agent_end terminal settlement was not observed");
  const rootCommandResults = Array.isArray(evidence.root_command_results) ? evidence.root_command_results : [];
  if (rootCommandResults.length > 0) {
    const commandStarts = rootCommandResults.filter((item) => item?.phase === "start");
    const commandEnds = rootCommandResults.filter((item) => item?.phase === "end");
    if (commandStarts.length !== 1 || commandEnds.length !== 1 || commandStarts[0]?.host_policy_binding?.admitted !== true || commandEnds[0]?.host_policy_binding?.admitted !== true || commandEnds[0]?.is_error_observed !== true || commandEnds[0]?.status === undefined || !["CLOSED", "BLOCKED"].includes(String(commandEnds[0].status).toUpperCase())) failures.push("root helper command requires exactly one START and terminal CLOSED/BLOCKED END");
  }
  const records = terminalRecords(evidence);
  const profiles = NATIVE10_ASSIGNMENTS.map(([agent, name]) => {
    const matching = terminalForAssignment(records, name);
    const terminal = matching.length === 1 ? matching[0] : null;
    const explicitSuccess = taskRecordSucceeded(terminal);
    const contradictoryFailure = terminal?.aborted_observed === true && terminal.aborted === true
      || terminal?.error_observed === true && terminal.error !== null;
    const transportValid = Boolean(terminal && terminal.agent === agent && terminal.agentSource === "project" && explicitSuccess && !contradictoryFailure);
    const schema = profileSchemaObservation(agent, terminal, revision);
    const reviewerProtocol = ["peer-reviewer", "deep-reviewer"].includes(agent) && terminal?.structured_data
      ? validateReviewerResult(terminal.structured_data, { agent, protocol_mode: agent === "peer-reviewer" ? "TDD_PEER_REVIEW" : "DEEP_REVIEW", reviewed_revision: revision })
      : null;
    const reviewerValid = ["peer-reviewer", "deep-reviewer"].includes(agent) ? reviewerProtocol?.ok === true : true;
    const descriptorRead = native10DescriptorRead(evidence, fixture, revision, name, terminal);
    const valid = transportValid && reviewerValid && descriptorRead.status === "PASS" && (agent === "spec-kit-author" || agent === "validator" || schema.status === "PASS");
    return { name, agent, descriptor_read: descriptorRead, terminal_count: matching.length, terminal: terminal ? { id: terminal.id, instance_id: terminal.instanceId, job_id: terminal.jobId ?? null, assignment_id: terminal.assignment_id, run_id: terminal.run_id, status: terminal.status, exit_code: terminal.exitCode, exit_code_observed: terminal.exit_code_observed, is_error: terminal.isError, is_error_observed: terminal.is_error_observed, error: terminal.error, error_observed: terminal.error_observed, aborted: terminal.aborted, aborted_observed: terminal.aborted_observed, agentSource: terminal.agentSource, revision: terminal.reviewed_revision ?? terminal.revision, protocol_mode: terminal.protocol_mode, source_kind: terminal.source_kind, structured: terminal.structured, structured_data: terminal.structured_data } : null, schema, status: valid ? "PASS" : "PENDING", limitation: valid ? null : "terminal, full canonical descriptor read or installed profile schema was not observed in the real native envelope" };
  });
  const docPath = path.join(fixture.project, NATIVE10_DOC_HANDOFF);
  const docExists = fs.existsSync(docPath) && fs.statSync(docPath).isFile();
  const docBytes = docExists ? fs.readFileSync(docPath) : null;
  const docText = docBytes ? scrub(docBytes.toString("utf8"), 8192) : "";
  const specWriter = terminalForAssignment(records, "Native10SpecKitAuthor");
  const specWrites = Array.isArray(evidence.subagent_writes) ? evidence.subagent_writes : [];
  const docEnds = specWrites.filter((item) => item.phase === "end");
  const docWriteBound = specWriter.length === 1 && docEnds.length === 1 && docEnds[0].terminal_error_observed === true && docEnds[0].terminal_error === false && docEnds[0].correlation?.status === "matched" && docEnds[0].allocated_id === specWriter[0].allocated_id && docEnds[0].parent_tool_call_id === specWriter[0].parent_tool_call_id && specWrites.every((item) => item.paths?.length === 1 && samePath(path.resolve(fixture.project, item.paths[0]), docPath));
  const doc = { path: NATIVE10_DOC_HANDOFF, exists: docExists, bytes: docBytes?.byteLength ?? 0, sha256: docBytes ? sha256Bytes(docBytes) : null, managed_write_observed: docWriteBound, content_bound: docText.includes("AC-016") && docText.includes(revision) && docText.includes("NOT_EXECUTED") };
  if (!doc.exists || !doc.managed_write_observed || !doc.content_bound) failures.push("spec-kit-author did not produce a bounded current-revision DOC artifact");
  const command = commandObservation(evidence, TOOLING_COMMAND);
  const commandPass = Boolean(command?.observed?.present === true && validSuccessfulToolResult(command) && ["PASS", "PASSOU"].includes(String(command.report?.status ?? "").toUpperCase()) && validBoundValidatorReport(command, fixture, revision));
  if (!commandPass) failures.push("validator did not expose the exact real workload command with explicit isError:false, a bounded current-workload PASS report, and a non-contradictory optional exit code");
  const reviewProfiles = profiles.filter((profile) => ["deep-reviewer", "peer-reviewer"].includes(profile.agent));
  const external = { status: "PENDING", route: "external", quality_gate_only: true, publication: "NOT_EXECUTED", attempted: false, reason: "No publication or external dry command is authorized." };
  const alignmentAction = alignmentBinding?.status === "PASS"
    ? { status: "PASS", short: alignmentBinding, full: alignmentBinding, local: alignmentBinding, evidence_level: "retained-native-alignment-capture" }
    : { status: "PENDING", short: alignmentBinding?.reason ?? "retained alignment short proof is not bound", full: alignmentBinding?.reason ?? "retained alignment full proof is not bound", local: alignmentBinding?.reason ?? "retained alignment local proof is not bound", prerequisite: "Supply an exact retained alignment capture and validate its six-target source scope before integrated promotion.", binding: alignmentBinding };
  if (alignmentBinding?.status !== "PASS") failures.push(`existing alignment SHORT/FULL/LOCAL evidence is not accepted: ${alignmentBinding?.reason ?? "retained capture unbound"}`);
  const rootRetro = inspectRootRetroArtifact(evidence, fixture);
  const actions = { alignment: alignmentAction, doc, review: reviewProfiles, validate: { command, status: commandPass ? "PASS" : "PENDING" }, external, retro_root: rootRetro };
  return { status: failures.length === 0 && profiles.every((profile) => profile.status === "PASS") ? "PASS" : "PENDING", failures, first_task_sequence: first, root_reads: reads, dispatches, profiles, actions, lifecycle: [], lifecycle_failures: ["No synthetic typed lifecycle yield is accepted; phase/artifact coverage is action-bound."], task_records: records, command_results: evidence.command_results ?? [], subagent_reads: evidence.subagent_reads ?? [], subagent_writes: evidence.subagent_writes ?? [], root_writes: evidence.root_writes ?? [], tool_events: evidence.tool_events ?? [], terminal: evidence.terminal, raw_observation: { rpc: evidence.rpc, process: evidence.process, capture: evidence.capture }, revision, evidence_level: "native-omp-rpc-actions-and-profile-schemas" };
}


function isCorrelatedTerminalCommand(item) {
  return item?.phase === "end"
    && item?.nested_event_type === "tool_execution_end"
    && item?.correlation?.status === "matched"
    && item?.correlation?.identity_match !== false
    && item?.observed?.present === true
    && item?.tool_error_observed === true
    && item?.report && typeof item.report === "object"
    && item?.is_error_observed === true
    && item?.is_error === false;
}

function commandObservation(nativeResult, commandLabel) {
  const matches = (nativeResult?.command_results ?? []).filter((item) => item?.command_label === commandLabel);
  const terminals = matches.filter(isCorrelatedTerminalCommand);
  if (terminals.length === 1) return terminals[0];
  if (terminals.length > 1) {
    const latestTerminal = terminals.at(-1);
    return { ...latestTerminal, observed: null, report: null, assignment_id: null, run_id: null, revision: null, command_sha256: null, command_bytes: null, command_basename: null, exit_code: null, exit_code_observed: false, selection_error: "VALIDATOR_COMMAND_END_DUPLICATE" };
  }
  const latest = matches.at(-1);
  if (!latest) return null;
  return { ...latest, observed: null, report: null, assignment_id: null, run_id: null, revision: null, command_sha256: null, command_bytes: null, command_basename: null, exit_code: null, exit_code_observed: false, selection_error: "VALIDATOR_COMMAND_END_MISSING_OR_UNCORRELATED" };
}
function validSuccessfulToolResult(command) {
  return command?.tool_error_observed === true
    && command.tool_error === false
    && (!command.exit_code_observed || command.exit_code === 0);
}
function validFailedToolResult(command) {
  return command?.tool_error_observed === true
    && command.tool_error === true
    && command.exit_code_observed === true
    && command.exit_code !== 0;
}
function expectedWorkloadBinding(fixture) {
  const file = path.join(fixture.project, ".omp/state/native10-workload.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed?.binding && typeof parsed.binding === "object" ? parsed.binding : null;
  } catch {
    return null;
  }
}
function validBoundValidatorReport(command, fixture, revision, assignment = "Native10Validator") {
  const binding = expectedWorkloadBinding(fixture);
  const report = command?.report;
  return Boolean(
    report
    && typeof report.nonce === "string"
    && report.nonce === binding?.nonce
    && report.assignment_id === assignment
    && report.revision === revision
    && report.workload?.run_id === binding?.run_id
    && report.workload?.source === binding?.source
    && report.workload?.revision === revision
  );
}
function makeRetryExecution(executionApi, definition, firstObservation, secondObservation, repair = null, causal = null) {
  const first = firstObservation?.terminal_end ?? null;
  const second = secondObservation?.terminal_end ?? null;
  const phaseOrdinals = causal?.phases ? Object.fromEntries(Object.entries(causal.phases).map(([key, value]) => [key, value?.ordinal ?? null])) : null;
  const causalOrder = phaseOrdinals
    && Number.isSafeInteger(phaseOrdinals.first_terminal_accepted)
    && Number.isSafeInteger(phaseOrdinals.repair_accepted)
    && Number.isSafeInteger(phaseOrdinals.second_dispatch)
    && Number.isSafeInteger(phaseOrdinals.second_terminal_accepted)
    && Number.isSafeInteger(phaseOrdinals.execution_consumed)
    && phaseOrdinals.first_terminal_accepted < phaseOrdinals.repair_accepted
    && phaseOrdinals.repair_accepted < phaseOrdinals.second_dispatch
    && phaseOrdinals.second_dispatch < phaseOrdinals.second_terminal_accepted
    && phaseOrdinals.second_terminal_accepted < phaseOrdinals.execution_consumed;
  const observed = {
    same_logical_assignment: first?.assignment_id === definition?.assignment_id && second?.assignment_id === definition?.assignment_id,
    same_run: first?.run_id === definition?.run_id && second?.run_id === definition?.run_id,
    same_assignment: first?.assignment_id === second?.assignment_id && first?.assignment_id === definition?.assignment_id,
    new_job: Boolean(first?.job_id && second?.job_id && first.job_id !== second.job_id),
    new_instance: Boolean(first?.instance_id && second?.instance_id && first.instance_id !== second.instance_id),
    cap3_respected: first?.attempt === 1 && second?.attempt === 2 && second.attempt <= 3,
    static_revision_same: Boolean(first?.revision && first?.revision === second?.revision && first.revision === definition?.revision),
    causal_order: causalOrder === true,
    first: first ? { run_id: first.run_id ?? null, assignment_id: first.assignment_id ?? null, job_id: first.job_id ?? null, instance_id: first.instance_id ?? null, attempt: first.attempt ?? null } : null,
    second: second ? { run_id: second.run_id ?? null, assignment_id: second.assignment_id ?? null, job_id: second.job_id ?? null, instance_id: second.instance_id ?? null, attempt: second.attempt ?? null } : null,
  };
  const base = { status: "PENDING", consumer: "tdd-orchestrator/lib/execution.mjs", observed, repair_observed: Boolean(repair), causal };
  if (!first || !second) return { ...base, reason: "actual first and second terminal envelopes are required before constructing execution input" };
  if (!causalOrder) return { ...base, status: "BLOCKED", reason: "host causal envelope is missing, foreign, or out of order" };
  const required = [
    ["run_id", first.run_id], ["run_id", second.run_id], ["assignment_id", first.assignment_id], ["assignment_id", second.assignment_id],
    ["revision", first.revision], ["revision", second.revision], ["job_id", first.job_id], ["job_id", second.job_id],
    ["instance_id", first.instance_id], ["instance_id", second.instance_id], ["attempt", first.attempt], ["attempt", second.attempt],
    ["first terminal event", first.event_type], ["second terminal event", second.event_type], ["first sequence", first.sequence], ["second sequence", second.sequence],
    ["first start sequence", first.start_sequence], ["second start sequence", second.start_sequence], ["first exit", first.exit_code_observed && Number.isSafeInteger(first.exit_code) ? first.exit_code : null],
    ["second report", second.report], ["first report", first.report],
  ];
  const absent = required.filter(([, value]) => value === null || value === undefined || value === "").map(([label]) => label);
  if (absent.length) return { ...base, reason: "actual terminal fields needed by execution consumer were not exposed", absent };
  if (!definition?.cwd || !definition?.paths?.validator || !definition?.paths?.subject) return { ...base, reason: "technical retry definition lacks actual private paths" };
  if (first.event_type !== "tool_execution_end" || second.event_type !== "tool_execution_end") return { ...base, status: "BLOCKED", reason: "execution input requires actual tool_execution_end terminal events" };
  if (first.isError !== true || second.isError !== false) return { ...base, status: "BLOCKED", reason: "execution input rejected contradictory terminal isError values" };
  if (!observed.same_logical_assignment || !observed.same_run || !observed.static_revision_same || !observed.new_job || !observed.new_instance || !observed.cap3_respected) return { ...base, status: "BLOCKED", reason: "execution input does not preserve same assignment/run/revision with distinct job/instance and ordered cap3 attempts" };
  const root = path.resolve(definition.cwd);
  const fileRows = [];
  for (const [key, file] of [["validator", definition.paths.validator], ["subject", definition.paths.subject]]) {
    try {
      const resolved = path.resolve(file);
      if (!inside(root, resolved)) return { ...base, reason: `execution ${key} path is outside the private retry project` };
      const stat = fs.lstatSync(resolved);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return { ...base, reason: `execution ${key} path is not a private regular file` };
      const relativePath = path.relative(root, resolved).replaceAll("\\", "/");
      fileRows.push({ key, path: relativePath, absolute: resolved, bytes: fs.readFileSync(resolved), stat });
    } catch (error) {
      return { ...base, reason: `execution ${key} path could not be observed`, error: safeError(error) };
    }
  }
  const artifacts = fileRows.map((row) => ({ path: row.path, sha256: sha256Bytes(row.bytes), regular: true, confined: true, source: { path: row.path, sha256: sha256Bytes(row.bytes) } }));
  const reviewMeta = repair?.independent_review ?? null;
  let reviewArtifact = null;
  if (reviewMeta?.path) {
    const reviewPath = path.resolve(root, reviewMeta.path);
    if (!inside(root, reviewPath)) return { ...base, reason: "independent review receipt escaped the private retry project" };
    try {
      const reviewStat = fs.lstatSync(reviewPath);
      if (!reviewStat.isFile() || reviewStat.isSymbolicLink() || reviewStat.nlink !== 1) return { ...base, reason: "independent review receipt is not a private regular file" };
      const reviewBytes = fs.readFileSync(reviewPath);
      const reviewHash = sha256Bytes(reviewBytes);
      if (reviewMeta.sha256 && reviewMeta.sha256 !== reviewHash) return { ...base, reason: "independent review receipt hash did not match host observation" };
      reviewArtifact = { path: path.relative(root, reviewPath).replaceAll("\\", "/"), sha256: reviewHash, regular: true, confined: true, source: { path: path.relative(root, reviewPath).replaceAll("\\", "/"), sha256: reviewHash } };
      artifacts.push(reviewArtifact);
    } catch (error) {
      return { ...base, reason: "independent review receipt could not be observed", error: safeError(error) };
    }
  }
  const source = artifacts[0].source;
  const resourceRows = fileRows.map((row) => ({
    id: `native09-${row.key}-resource`,
    path: row.absolute.replaceAll("\\", "/"),
    kind: "file",
  }));
  const taskId = definition.assignment_id;
  const progress = {
    schema_version: "2.3",
    run_id: definition.run_id,
    task_source: definition.scenario_id,
    repo: { head_current: definition.revision },
    contract: { file: "specs/specs005-omp-compatible-release/contracts/interface-contract.md", version: definition.contract ?? CONTRACT_VERSION },
    acceptance_criteria: [{ id: "AC-NATIVE09", desc: "Private technical retry reaches a real validator terminal after eligible solution repair.", source: "implementation-evidence/native-release/technical-retry-scenario.mjs", tasks: [taskId], type: "behavioral" }],
    waves: [{ wave: 1, status: "in_progress", tasks: [{ id: taskId, title: "NATIVE-09 technical retry validator", allowed_write_globs: definition.write_policy?.allowed_write_globs ?? [], acceptance_criteria: ["AC-NATIVE09"] }] }],
  };
  const plan = {
    schemaVersion: 1,
    runId: definition.run_id,
    wave: 1,
    revision: definition.revision,
    staticDigest: "0".repeat(64),
    resources: resourceRows,
    tasks: [{ id: taskId, owner: "validator", dependencies: [], resources: resourceRows.map((row) => ({ id: row.id, access: "read" })), artifacts: fileRows.map((row) => row.path), isolated: false }],
  };
  let staticDigest;
  try {
    staticDigest = executionApi.staticExecutionDigest(progress, plan);
  } catch (error) {
    return { ...base, reason: "execution static digest rejected actual retry definition", error: safeError(error) };
  }
  plan.staticDigest = staticDigest;
  const environmentDigest = sha256Text(JSON.stringify({ platform: process.platform, node: process.version, project_root: root }));
  const filesystemResources = fileRows.map((row, index) => {
    const absolute = row.absolute.replaceAll("\\", "/");
    const parent = path.dirname(row.absolute).replaceAll("\\", "/");
    const sourceProof = artifacts[index].source;
    return { resourceId: resourceRows[index].id, taskId, realPath: absolute, parentRealPath: parent, exists: true, directory: false, symlink: false, device: String(row.stat.dev), inode: String(row.stat.ino), linkCount: row.stat.nlink, source: sourceProof };
  });
  const reviewAccepted = Boolean(
    reviewMeta
    && reviewArtifact
    && reviewMeta.run_id === definition.run_id
    && reviewMeta.revision === definition.revision
    && reviewMeta.independent === true
    && typeof reviewMeta.author === "string"
    && typeof reviewMeta.reviewer === "string"
    && reviewMeta.author !== reviewMeta.reviewer,
  );
  const integratedReview = {
    status: reviewAccepted ? "PASS" : "PENDING",
    runId: definition.run_id,
    revision: definition.revision,
    staticDigest,
    environmentDigest,
    author: reviewAccepted ? reviewMeta.author : null,
    reviewer: reviewAccepted ? reviewMeta.reviewer : null,
    independent: reviewAccepted,
    source: reviewAccepted ? reviewArtifact.source : null,
  };
  const context = {
    schemaVersion: 1,
    observationId: `native09-execution-${definition.run_id}`,
    runId: definition.run_id,
    wave: 1,
    revision: definition.revision,
    expectedStaticDigest: staticDigest,
    environmentDigest,
    source,
    filesystem: { platform: process.platform === "win32" ? "win32" : "posix", caseSensitive: process.platform !== "win32", allowedRoots: [root.replaceAll("\\", "/")], resources: filesystemResources },
    capacity: { maxWorkers: 1, activeWorkers: 0, writerSlots: 1, activeWriterTaskIds: [] },
    isolation: { available: false, observations: [] },
    jobs: [],
    history: [],
    predecessors: [],
    artifacts,
    integratedReview,
  };
  const statusFor = terminal => String(terminal.report?.status ?? "").toUpperCase() === "PASSOU" ? "PASS" : String(terminal.report?.status ?? "").toUpperCase() === "PASS" ? "PASS" : "FAIL";
  const returnFor = (terminal, attempt, status) => {
    const value = {
      taskId,
      wave: 1,
      runId: definition.run_id,
      revision: definition.revision,
      staticDigest,
      attempt,
      instanceId: terminal.instance_id,
      jobId: terminal.job_id,
      owner: "validator",
      status,
      dependencies: [],
      artifacts: fileRows.map((row, index) => ({ path: row.path, sha256: artifacts[index].sha256 })),
      source,
    };
    const { source: ignoredSource, ...digestBody } = value;
    return { ...value, returnDigest: sha256Text(canonical({ ...digestBody, dependencies: [], artifacts: [...digestBody.artifacts].sort((a, b) => a.path.localeCompare(b.path)) })) };
  };
  const firstStatus = statusFor(first);
  const secondStatus = statusFor(second);
  if (firstStatus !== "FAIL" || secondStatus !== "PASS") return { ...base, status: "BLOCKED", reason: "actual terminal report statuses cannot produce FAIL then PASS execution history", statuses: { first: firstStatus, second: secondStatus } };
  const firstReturn = returnFor(first, 1, "FAIL");
  const secondReturn = returnFor(second, 2, "PASS");
  const executionSequences = {
    first: { start: 0, terminal: 1, source: "host_causal_first_terminal_accepted" },
    second: { start: first.sequence + second.start_sequence, terminal: first.sequence + second.sequence, source: "host_causal_order_after_first_terminal" },
  };
  const firstHistory = {
    runId: definition.run_id, wave: 1, taskId, attempt: 1, instanceId: first.instance_id, jobId: first.job_id, owner: "validator", status: "FAIL", failureClass: ["SOLUTION", "BEHAVIOR"].includes(String(first.report?.failure_origin ?? first.report?.origin ?? "").toUpperCase()) ? "solution" : null, startSequence: executionSequences.first.start, terminalSequence: executionSequences.first.terminal, revision: definition.revision, staticDigest, returnDigest: firstReturn.returnDigest, source,
  };
  const secondHistory = {
    runId: definition.run_id, wave: 1, taskId, attempt: 2, instanceId: second.instance_id, jobId: second.job_id, owner: "validator", status: "PASS", failureClass: null, startSequence: executionSequences.second.start, terminalSequence: executionSequences.second.terminal, revision: definition.revision, staticDigest, returnDigest: secondReturn.returnDigest, source,
  };
  if (!firstHistory.failureClass) return { ...base, status: "BLOCKED", reason: "first terminal did not expose eligible SOLUTION/BEHAVIOR origin" };
  context.history = [firstHistory, secondHistory];
  context.jobs = [{ runId: definition.run_id, revision: definition.revision, staticDigest, taskId, attempt: 2, instanceId: second.instance_id, jobId: second.job_id, owner: "validator", state: "TERMINAL", terminalStatus: "PASS", source }];
  let projection;
  try {
    projection = executionApi.evaluateExecution(progress, plan, [secondReturn], context);
  } catch (error) {
    return { ...base, reason: "execution consumer threw while evaluating actual retry observations", error: safeError(error), input: { progress, plan, context } };
  }
  const executionHostWorkflowOrdinal = allocateHostWorkflowOrdinal();
  const value = projection?.value ?? null;
  const complete = value?.complete === true;
  const consumedSecond = {
    run_id: secondReturn.runId,
    assignment_id: second.assignment_id,
    revision: secondReturn.revision,
    job_id: secondReturn.jobId,
    instance_id: secondReturn.instanceId,
    attempt: secondReturn.attempt,
    return_digest: secondReturn.returnDigest,
  };
  const causalWithConsumption = causal ? { ...causal, phases: { ...(causal.phases ?? {}), execution_consumed: { ...(causal.phases?.execution_consumed ?? {}), host_workflow_ordinal: executionHostWorkflowOrdinal } }, execution: { ...(causal.execution ?? {}), host_workflow_ordinal: executionHostWorkflowOrdinal, consumed_second: consumedSecond } } : null;
  const resumeEvidence = { complete, history: context.history, jobs: context.jobs, second_return: consumedSecond, consumer: "tdd-orchestrator/lib/execution.mjs" };
  return {
    ...base,
    causal: causalWithConsumption,
    ok: projection?.ok === true,
    errors: Array.isArray(projection?.errors) ? projection.errors : null,
    status: complete ? "PASS" : "PENDING",
    value,
    return_digest: secondReturn.returnDigest,
    execution_host_workflow_ordinal: executionHostWorkflowOrdinal,
    resume_evidence: resumeEvidence,
    projection,
    input: { progress, plan, context },
    adapter_derived: { return_digests: true, environment_digest: true, execution_sequences: executionSequences, note: "Execution IDs/statuses originate from actual terminal fields; stream-local sequence values are retained in terminal observations while execution history uses host-causal monotonic sequence mapping; adapter hashes only the observed return envelope and private regular-file bytes." },
  };
}

async function importApi(source, relativePath, label) {
  const file = safeSourcePath(source, relativePath);
  try { return await import(`${pathToFileURL(file).href}?native10=${randomUUID()}`); } catch (error) { blocked(`${label} import failed`, { error: safeError(error) }); }
}
async function importEvidenceApi(source, relativePath, label) {
  const file = safeSourcePath(source, relativePath);
  try { return await import(`${pathToFileURL(file).href}?native10-evidence=${randomUUID()}`); } catch (error) { blocked(`${label} import failed`, { error: safeError(error) }); }
}
function failedNativeObservation(session, error) {
  const observed = session.evidence;
  return {
    status: "PENDING",
    evidence_level: "native-omp-rpc",
    failure: controlledError(error),
    failure_diagnostics: observed.failure_diagnostics,
    calls: observed.calls,
    root_session: observed.root_session,
    root_prompt: observed.root_prompt,
    root_task_ends: observed.root_task_ends,
    task_calls: observed.task_calls,
    tool_events: observed.tool_events,
    root_writes: observed.root_writes,
    root_write_policy: observed.root_write_policy,
    root_command_results: observed.root_command_results,
    subagent_frames: observed.subagent_frames,
    subagent_lifecycle_diagnostics: observed.subagent_lifecycle_diagnostics,
    lifecycle_diagnostic_budget: observed.lifecycle_diagnostic_budget,
    subagent_writes: observed.subagent_writes,
    native_progress_terminal: observed.native_progress_terminal,
    async_completion_rejections: observed.async_completion_rejections,
    task_records: terminalRecords(observed),
    command_results: observed.command_results,
    assistant_public: observed.assistant_public,
    host_observation: observed.host_observation,
    terminal: observed.terminal,
    raw_observation: { rpc: observed.rpc, process: observed.process, capture: observed.capture },
  };
}

async function runNative(options, fixture, revision, assignments, label, prompt, alignmentBinding = null, rootWritePolicy = null) {
  if (!options.native) return { status: "PENDING", evidence_level: "not-run", reason: "--native was not supplied" };
  if (nativeCaptureHalt) return haltedNativeCapture(label);
  let session = null;
  try {
    session = new NativeRpcSession({ omp: options.omp, cwd: fixture.project, readRoot: fixture.readRoot ?? fixture.project, timeoutMs: options.timeoutMs, assignments, logicalRunId: fixture.logicalRunId, label, rootWritePolicy, rootPreparationPaths: label === "native10-integrated" ? native10RequiredReadPaths(fixture) : [] });
    const observed = await session.execute(prompt);
    const witness = atomicWrite(path.join(fixture.project, ".omp/state/native-observation", `${label}.json`), serializeOperationalEvidence(observed), fixture.project, "Native10 observed RPC witness");
    return {
      ...inspectNative(observed, fixture, revision, alignmentBinding),
      native_process_count: 1,
      origin: { kind: "host-observed-native-rpc", source: "host-rpc-process", process_observed: true, native_rpc: true, source_binding: true, process_count: 1 },
      logical_run_id: fixture.logicalRunId,
      root_session: observed.root_session,
      root_prompt: observed.root_prompt,
      root_task_ends: observed.root_task_ends,
      capture_receipt: { path: path.relative(fixture.project, witness.path).replaceAll("\\", "/"), sha256: witness.sha256, bytes: witness.bytes },
    };
  } catch (error) {
    await session?.captureTimeoutState(error).catch(() => {});
    await session?.abort().catch(() => {});
    haltNativeCapture(error);
    return session ? failedNativeObservation(session, error) : { ...haltedNativeCapture(label), failure: controlledError(error) };
  }
}


async function executeNativeCapture(options, fixture, assignments, label, prompt, rootWritePolicy = null) {
  const finish = (capture) => {
    const file = path.join(fixture.project, ".omp/state/native-observation", label + ".json");
    const written = atomicWrite(file, serializeOperationalEvidence(capture), fixture.project, "sanitized host capture " + label);
    return { ...capture, capture_receipt: { path: path.relative(fixture.project, written.path).replaceAll("\\", "/"), sha256: written.sha256, bytes: written.bytes } };
  };
  if (!options.native) {
    if (typeof options.captureProvider === "function") return finish(await options.captureProvider({ fixture, assignments, label, prompt, rootWritePolicy }));
    return finish({ status: "PENDING", evidence_level: "not-run", native_process_count: 0, reason: "--native was not supplied" });
  }
  if (nativeCaptureHalt) return finish(haltedNativeCapture(label));
  let session = null;
  try {
    session = new NativeRpcSession({ omp: options.omp, cwd: fixture.project, readRoot: fixture.readRoot ?? fixture.project, timeoutMs: options.timeoutMs, assignments, logicalRunId: fixture.logicalRunId, label, rootWritePolicy, rootPreparationPaths: label === "native10-integrated" ? native10RequiredReadPaths(fixture) : [] });
    const observed = await session.execute(prompt);
    return finish({ ...observed, native: true, evidence_level: "native-omp-rpc-actions-and-profile-schemas", native_process_count: 1, origin: { kind: "host-observed-native-rpc", source: "host-rpc-process", process_observed: true, native_rpc: true, source_binding: true, process_count: 1 } });
  } catch (error) {
    await session?.captureTimeoutState(error).catch(() => {});
    await session?.abort().catch(() => {});
    haltNativeCapture(error);
    return finish(session ? failedNativeObservation(session, error) : { ...haltedNativeCapture(label), failure: controlledError(error) });
  }
}



function routeTerminalBinding(observation) {
  const terminal = observation?.terminal && typeof observation.terminal === "object" ? { ...observation.terminal } : null;
  const rootSession = preserveIdentifier(observation?.root_session?.session_id);
  const prompt = terminal?.prompt_result && typeof terminal.prompt_result === "object" ? { ...terminal.prompt_result } : null;
  if (terminal && prompt) {
    terminal.prompt_result = {
      ...prompt,
      request_id: preserveIdentifier(prompt.request_id ?? prompt.id),
      id: preserveIdentifier(prompt.id),
      root_session: rootSession,
      root_session_source: rootSession ? "get_state.data.sessionId" : null,
    };
    terminal.root_session = rootSession;
    terminal.root_session_source = rootSession ? "get_state.data.sessionId" : null;
    terminal.host_observation = observation?.host_observation ?? null;
    terminal.host_workflow_ordinal = observation?.host_workflow_ordinal ?? terminal.prompt_result?.host_workflow_ordinal ?? terminal.agent_end?.host_workflow_ordinal ?? null;
    terminal.prompt_request_id = preserveIdentifier(observation?.root_prompt?.request_id);
    terminal.prompt_request_id_source = terminal.prompt_request_id ? "host RPC prompt request" : null;
    terminal.prompt_result_id = preserveIdentifier(prompt.id);
    terminal.prompt_result_id_source = terminal.prompt_result_id ? "producer prompt_result.id" : null;
  }
  return terminal ? { ...observation, terminal } : observation;
}


function discoverPrivateFiles(root, names, limit = 4096) {
  const wanted = new Set(names);
  const found = [];
  const visit = (directory) => {
    if (found.length >= limit) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length >= limit) return;
      const file = path.join(directory, entry.name);
      let stat;
      try { stat = fs.lstatSync(file); } catch { continue; }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile() && wanted.has(entry.name)) found.push(file);
    }
  };
  visit(root);
  return found;
}
function routeArtifactDescriptors(project, hostArtifacts, definition) {
  const names = definition.route === "short" ? ["checkpoint-000000.json"] : ["checkpoint-000000.json", "checkpoint-000001.json", ...(definition.mode === "git" ? ["checkpoint-000002.json"] : [])];
  const files = discoverPrivateFiles(project, names);
  const byName = new Map();
  for (const file of files) if (!byName.has(path.basename(file).toLowerCase())) byName.set(path.basename(file).toLowerCase(), file);
  const taskDescriptors = hostArtifacts.taskDescriptors ?? {};
  const artifacts = {
    packageManifest: hostArtifacts.packageManifest,
    packageBinding: hostArtifacts.packageBinding,
    sourceFingerprints: hostArtifacts.sourceFingerprints,
    taskInitial: taskDescriptors.initial ?? null,
    taskResume: taskDescriptors.resume ?? null,
    taskCollision: taskDescriptors.collision ?? null,
    preservation: hostArtifacts.preservation,
    checkpointInitial: hostArtifacts.checkpointInitial ?? byName.get("checkpoint-000000.json"),
    casReceipt: hostArtifacts.casReceipt ?? null,
    corruptSuccessorBefore: hostArtifacts.collisionBefore ?? null,
    corruptSuccessorAfter: hostArtifacts.collisionAfter ?? null,
  };
  if (definition.mode === "git") artifacts.gitReceipt = hostArtifacts.gitReceipt ?? path.join(NATIVE_ROUTE_ARTIFACT_ROOT, "git-receipt.json");
  if (definition.route === "full") artifacts.checkpointResume = hostArtifacts.checkpointResume ?? byName.get("checkpoint-000001.json");
  if (definition.mode === "git" && definition.route === "full") artifacts.checkpointCollision = hostArtifacts.collisionTarget ?? byName.get("checkpoint-000002.json");
  return artifacts;
}
async function runNativeRouteCase(options, fixture, definition, routeApi, hostArtifacts) {
  const steps = {};
  const helper = hostArtifacts.alignmentHelper;
  const persisted = hostArtifacts.persistence ?? { requestId: null, runId: definition.binding.run_id };
  hostArtifacts.persistence = persisted;
  const beforeCheckpoint = (checkpoint, label) => {
    if (definition.mode !== "git" || definition.route !== "full") return;
    if (!checkpoint?.path) return;
    regular(checkpoint.path, "CAS checkpoint before a subsequent Root phase");
    const bytes = fs.readFileSync(checkpoint.path);
    const written = atomicWrite(path.join(hostArtifacts.root, "cas", `${label}-before.json`), bytes, fixture.project, `${label} pre-phase snapshot`);
    (hostArtifacts.casBeforeSnapshots ??= {})[label] = { checkpoint_path: checkpoint.path, path: path.relative(fixture.project, written.path).replaceAll("\\", "/"), sha256: written.sha256 };
  };
  const checkpointDescriptor = (file) => {
    if (!file) return null;
    try {
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      return { path: file, record, sha256: sha256Bytes(fs.readFileSync(file)) };
    } catch {
      return { path: file };
    }
  };
  const latestCheckpoint = (name, excluded = new Set()) => {
    const candidates = discoverPrivateFiles(fixture.project, [name]).filter((file) => !excluded.has(file));
    return candidates.length ? checkpointDescriptor(candidates[candidates.length - 1]) : null;
  };
  const runStep = async (step) => {
    const stepDefinition = definition.steps?.[step];
    if (!stepDefinition) return;
    if (nativeCaptureHalt || (step === "resume" && !hostArtifacts.checkpointInitial?.path) || (step === "collision" && !hostArtifacts.checkpointResume?.path)) return;
    writeRouteTaskDescriptor(fixture.project, hostArtifacts, definition, step, routeApi);
    const parent = step === "resume" ? hostArtifacts.checkpointInitial : null;
    const policy = step === "collision" ? null : alignmentRootCommandPolicy(fixture.project, fixture, definition, step, "A", parent, helper);
    let rootPrompt = policy
      ? `${stepDefinition.prompt}\nRoot MUST write exactly ${policy.intentPath} with this approved intent JSON: ${JSON.stringify(policy.intentPayload)}, then invoke Bash with exactly this argument object: ${JSON.stringify({ command: policy.rootCommandPolicy.command })}. The only approved Bash argument key is command; omit timeout, cwd, and every other optional key. Additional keys are rejected before execution. Do not compute IDs or hashes in the model.`
      : stepDefinition.prompt;
    let offlineCheckpoint = null;
    if (!options.native && policy) {
      offlineCheckpoint = executeAlignmentHelper(fixture.project, policy);
      if (step === "initial") {
        hostArtifacts.checkpointInitial = offlineCheckpoint;
        persisted.requestId = offlineCheckpoint.record.request_id;
        persisted.runId = offlineCheckpoint.record.run_id;
      } else {
        hostArtifacts.checkpointResume = offlineCheckpoint;
      }
    } else if (step === "collision") {
      prepareHostCollisionTarget(fixture, definition, hostArtifacts);
      rootPrompt += `\nThis collision is Root-only before any child dispatch. Read exact target ${hostArtifacts.collisionTarget} and sealed parent ${hostArtifacts.checkpointResume?.path}. Preserve every byte. Return only JSON with verdict=BLOCKED, request_id=${persisted.requestId}, run_id=${persisted.runId}, step=collision, target_path=${JSON.stringify(path.relative(fixture.project, hostArtifacts.collisionTarget).replaceAll("\\", "/"))}, root_session from the host-observed RPC context, and signals.alignment/signals.checkpoint=true. No helper command, intent write or child task is authorized for this collision.`;
    }
    if (step !== "collision") rootPrompt += `\nRoot MUST dispatch this exact canonical task item unchanged and verbatim: ${JSON.stringify(stepDefinition.task)}`;
    hostArtifacts.lastRootPolicy = policy;
    hostArtifacts.lastHelperResult = offlineCheckpoint;
    const capture = await executeNativeCapture(
      options,
      { ...fixture, routeDefinition: definition, routeStep: step, routeHostArtifacts: hostArtifacts },
      [stepDefinition.task],
      `native-route-${definition.id}-${step}`,
      rootPrompt,
      policy ?? { paths: [] },
    );
    if (options.native && step !== "collision") {
      const observed = latestCheckpoint(step === "initial" ? "checkpoint-000000.json" : "checkpoint-000001.json");
      if (step === "initial" && observed) {
        hostArtifacts.checkpointInitial = observed;
        persisted.requestId = observed.record?.request_id ?? persisted.requestId;
        persisted.runId = observed.record?.run_id ?? persisted.runId;
      }
      if (step === "resume" && observed) hostArtifacts.checkpointResume = observed;
    }
    if (step === "initial") beforeCheckpoint(hostArtifacts.checkpointInitial, "a-initial");
    if (step === "resume") beforeCheckpoint(hostArtifacts.checkpointResume, "a-resume");
    const bound = routeTerminalBinding(capture);
    if (bound && (capture?.native_process_count === 1 || capture?.origin?.kind === "source-derived-host-observer")) {
      bound.origin = capture.origin;
      bound.route_binding = {
        source: "host-capture",
        request_id: persisted.requestId,
        run_id: persisted.runId,
        revision: definition.binding.revision,
        namespace: "A",
        step,
        root_session: capture.root_session?.session_id ?? null,
        prompt_request_id: capture.root_prompt?.request_id ?? null,
      };
      if (policy) {
        bound.host_policy_binding = {
          kind: policy.rootCommandPolicy.kind,
          cwd: policy.rootCommandPolicy.cwd,
          intent_path: policy.rootCommandPolicy.intent.path,
          helper_path: policy.rootCommandPolicy.script.path,
          script_sha256: policy.rootCommandPolicy.script.sha256,
          executable_path: policy.rootCommandPolicy.executable.path,
          executable_sha256: policy.rootCommandPolicy.executable.sha256,
          command_sha256: sha256Text(policy.rootCommandPolicy.command),
          admitted: true,
        };
        bound.root_command_policy = policy.rootCommandPolicy;
      }
    }
    if (step === "collision") hostArtifacts.collisionCapture = bound;
    steps[step] = bound;
    if (step === "collision") captureHostCollisionAfter(fixture, hostArtifacts);
    refreshRouteGitReceipt(fixture, hostArtifacts, definition);
  };
  await runStep("initial");
  await runStep("resume");
  let bInitial = null;
  let bResume = null;
  if (definition.mode === "git" && definition.route === "full") {
    const runNamespace = async (namespace) => {
      let parent = null;
      const captures = [];
      const excluded = new Set([hostArtifacts.checkpointInitial?.path, hostArtifacts.checkpointResume?.path].filter(Boolean));
      for (const step of ["initial", "resume"]) {
        const stepDefinition = definition.steps[step];
        writeRouteTaskDescriptor(fixture.project, hostArtifacts, definition, step, routeApi);
        const policy = alignmentRootCommandPolicy(fixture.project, fixture, definition, step, namespace, parent, helper);
        const rootPrompt = `${stepDefinition.prompt}\nThis is CAS namespace ${namespace}. Root MUST dispatch this exact canonical task item unchanged and verbatim: ${JSON.stringify(stepDefinition.task)}\nRoot MUST write exactly ${policy.intentPath} with this approved intent JSON: ${JSON.stringify(policy.intentPayload)}, then invoke Bash with exactly this argument object: ${JSON.stringify({ command: policy.rootCommandPolicy.command })}. The only approved Bash argument key is command; omit timeout, cwd, and every other optional key. Additional keys are rejected before execution. Do not compute IDs or hashes in the model.`;
        let checkpoint = null;
        if (!options.native) checkpoint = executeAlignmentHelper(fixture.project, policy);
        hostArtifacts.lastRootPolicy = policy;
        hostArtifacts.lastHelperResult = checkpoint;
        const capture = await executeNativeCapture(
          options,
          { ...fixture, routeDefinition: definition, routeStep: step, routeNamespace: namespace, routeHostArtifacts: hostArtifacts },
          [stepDefinition.task],
          `native-route-${definition.id}-${namespace}-${step}`,
          rootPrompt,
          policy,
        );
        if (options.native) {
          const candidates = discoverPrivateFiles(fixture.project, [step === "initial" ? "checkpoint-000000.json" : "checkpoint-000001.json"]).filter((file) => !excluded.has(file));
          checkpoint = candidates.length ? checkpointDescriptor(candidates[candidates.length - 1]) : null;
        }
        if (!checkpoint) return null;
        const observed = routeTerminalBinding(capture);
        if (observed) observed.route_binding = { source: "host-capture", request_id: checkpoint.record?.request_id, run_id: checkpoint.record?.run_id, revision: definition.binding.revision, step, namespace, root_session: capture.root_session?.session_id ?? null, prompt_request_id: capture.root_prompt?.request_id ?? null };
        const commandEnds = observed?.root_command_results?.filter((item) => item.phase === "end") ?? [];
        const childRecords = terminalRecords(observed);
        if (observed?.capture?.complete !== true || observed?.terminal?.prompt_result?.status !== "completed" || observed?.terminal?.session_settled !== true || commandEnds.length !== 1 || commandEnds[0].is_error !== false || commandEnds[0].status !== (step === "initial" ? "BLOCKED" : "CLOSED") || !childRecords.some((item) => item.agent === "requirements-reader" && taskRecordSucceeded(item)) || childRecords.some((item) => !taskRecordSucceeded(item))) return null;
        captures.push(observed);
        beforeCheckpoint(checkpoint, `${namespace.toLowerCase()}-${step}`);
        excluded.add(checkpoint.path);
        if (step === "initial") parent = checkpoint;
        else return { initial: parent, resume: checkpoint, captures };
      }
      return null;
    };
    const b = await runNamespace("B");
    hostArtifacts.namespaceBCaptures = b?.captures ?? [];
    if (b?.captures?.[0]) steps["namespace-b-initial"] = b.captures[0];
    if (b?.captures?.[1]) steps["namespace-b-resume"] = b.captures[1];
    bInitial = b?.initial ?? null;
    bResume = b?.resume ?? null;
  }
  await runStep("collision");
  if (hostArtifacts.checkpointInitial?.path && hostArtifacts.checkpointResume?.path && bInitial?.path && bResume?.path) writeRouteCasReceipt(fixture.project, hostArtifacts, definition, hostArtifacts.checkpointInitial, hostArtifacts.checkpointResume, bInitial, bResume);
  refreshRouteHostPreservation(fixture.project, hostArtifacts, options);
  const artifacts = routeArtifactDescriptors(fixture.project, hostArtifacts, definition);
  const inspectionInput = { definition, projectRoot: fixture.project, native: { steps }, artifacts };
  const inspectionWitnessPath = path.join(fixture.project, ".omp", "state", "native-route", "inspection-input.json");
  const inspectionWitness = atomicWrite(inspectionWitnessPath, serializeOperationalEvidence(inspectionInput), fixture.project, "native route inspection input witness");
  hostArtifacts.inspectionInputWitness = {
    path: path.relative(fixture.project, inspectionWitness.path).replaceAll("\\", "/"),
    sha256: inspectionWitness.sha256,
    source: "exact-curated-route-inspection-input",
  };
  return routeApi.inspectRouteCase(inspectionInput);
}


function technicalRetryTerminalObservation(capture, definition, assignmentName) {
  const records = terminalRecords(capture).filter((item) => item.assignment_id === assignmentName && item.run_id === definition.run_id);
  const record = records.length === 1 ? records[0] : null;
  const results = capture?.command_results ?? [];
  const commands = results.filter((item) => item.command_label === RETRY_COMMAND && item.phase === "end" && item.nested_event_type === "tool_execution_end");
  const starts = results.filter((item) => item.command_label === RETRY_COMMAND && item.phase === "start" && item.nested_event_type === "tool_execution_start");
  const command = commands.length === 1 ? commands[0] : null;
  const commandStart = starts.length === 1 ? starts[0] : null;
  const calls = (capture?.task_calls ?? []).filter((call) => call.kind === "dispatch" && (call.assignments ?? []).some((item) => item.name === assignmentName));
  const call = calls.length === 1 ? calls[0] : null;
  const dispatch = call?.assignments.find((item) => item.name === assignmentName) ?? null;
  const taskEvents = (capture?.tool_events ?? []).filter((event) => event.type === "tool_execution_start" && event.tool === "task" && event.tool_call_id === call?.tool_call_id);
  const taskEvent = taskEvents.length === 1 ? taskEvents[0] : null;
  const rootSession = preserveIdentifier(capture?.root_session?.session_id);
  const rootPrompt = preserveIdentifier(capture?.root_prompt?.request_id);
  const domain = hostDerivedDomainIds(rootSession, record?.parent_tool_call_id, record?.allocated_id, record?.index);
  const report = command?.report;
  const attempt = String(capture?.label ?? "").endsWith("-second") ? 2 : 1;
  const transportMatch = Boolean(record && command && commandStart && taskEvent && dispatch && rootSession && rootPrompt
    && capture?.capture?.complete === true && capture?.terminal?.prompt_result?.status === "completed" && capture?.terminal?.agent_end?.isTerminal === true && capture?.terminal?.agent_end?.awaitingAsyncWork !== true && capture?.terminal?.session_settled === true
    && record.agent === "validator" && record.agentSource === "project" && taskRecordSucceeded(record)
    && record.parent_tool_call_id === taskEvent.tool_call_id && record.allocated_id === command.allocated_id && record.index === command.index
    && domain.job_id && domain.instance_id && command.job_id === domain.job_id && command.instance_id === domain.instance_id
    && command.correlation?.tool_call_id === commandStart.correlation?.tool_call_id && command.correlation?.status === "matched" && command.correlation?.identity_match === true
    && command.is_error_observed === true && typeof command.is_error === "boolean"
    && report?.assignment_id === definition.assignment_id && report?.run_id === definition.run_id && report?.revision === definition.revision);
  const host = {
    provenance: "lifecycle-host-adapter-v1", phase: capture?.label ?? null, logical_run_id: capture?.logical_run_id ?? null,
    root_session: rootSession, root_prompt: rootPrompt, host_observation: capture?.host_observation ?? null, origin: capture?.origin ?? null,
    dispatch: dispatch ? { name: dispatch.name, agent: dispatch.agent, task_sha256: dispatch.task_sha256, dispatch_id: taskEvent?.tool_call_id ?? null, allocated_id: record?.allocated_id ?? null, job_id: domain.job_id, instance_id: domain.instance_id, attempt, host_workflow_ordinal: record?.host_workflow_ordinal ?? null } : null,
    dispatch_event: taskEvent ? { sequence: taskEvent.sequence, host_arrival_ordinal: taskEvent.host_arrival_ordinal, host_workflow_ordinal: taskEvent.host_workflow_ordinal ?? null, tool_call_id: taskEvent.tool_call_id, observed: true, source: "HOST_DERIVED_TASK_START" } : null,
    tool: command ? { tool_call_id: command.correlation?.tool_call_id ?? null, parent_tool_call_id: record?.parent_tool_call_id ?? null, start_sequence: commandStart?.sequence ?? null, end_sequence: command.sequence, start_host_arrival_ordinal: commandStart?.host_arrival_ordinal ?? null, end_host_arrival_ordinal: command.host_arrival_ordinal, start_workflow_ordinal: commandStart?.host_workflow_ordinal ?? null, end_workflow_ordinal: command.host_workflow_ordinal ?? null } : null,
  };
  const terminal = transportMatch ? {
    id: record.id, allocated_id: record.allocated_id, index: record.index, agent: record.agent, agentSource: record.agentSource,
    assignment_id: definition.assignment_id, dispatch_assignment_name: record.assignment_id, run_id: record.run_id, revision: report.revision, attempt,
    event_type: command.nested_event_type, nested_event_type: command.nested_event_type,
    job_id: domain.job_id, instance_id: domain.instance_id, domain_id_provenance: domain.provenance,
    public_id: record.allocated_id, root_session_id: rootSession, root_session_source: "get_state.data.sessionId",
    session_id: null, session_id_source: null, task_id: null, task_id_exposed: false,
    tool_call_id: command.correlation.tool_call_id, parent_tool_call_id: record.parent_tool_call_id,
    sequence: command.sequence, start_sequence: command.start_sequence ?? commandStart.sequence,
    host_workflow_ordinal: command.host_workflow_ordinal ?? null, start_host_workflow_ordinal: command.start_workflow_ordinal ?? commandStart.host_workflow_ordinal ?? null,
    host_arrival_ordinal: command.host_arrival_ordinal, start_host_arrival_ordinal: commandStart.host_arrival_ordinal,
    isError: command.is_error, is_error_observed: true, is_error_source: command.is_error_source,
    exit_code: Number.isInteger(command.exit_code) ? command.exit_code : null, exit_code_observed: command.exit_code_observed === true,
    single_result_exit_code: record.exitCode, error: record.error, error_observed: record.error_observed, aborted: record.aborted, aborted_observed: record.aborted_observed,
    report, command: { command: command.command_label, invocation: command.invocation }, correlation: command.correlation, observed: command.observed,
  } : null;
  return { native: capture?.origin?.native_rpc === true && capture?.native_process_count === 1, native_process_count: capture?.native_process_count ?? 0, origin: capture?.origin ?? null, terminal_end: terminal, terminals: terminal ? [terminal] : [], command_results: results, task_records: capture?.task_records ?? [], terminal: capture?.terminal ?? null, definition, host, transport_match: transportMatch };
}

function readTechnicalRetryContract(definition) {
  const root = path.resolve(definition?.cwd ?? "");
  const rawPath = definition?.paths?.interface_contract;
  if (!root || typeof rawPath !== "string" || !rawPath.trim()) return { ok: false, reason: "technical retry interface contract path is missing" };
  const contractPath = path.resolve(root, rawPath);
  if (!inside(root, contractPath)) return { ok: false, reason: "technical retry interface contract escaped the private project" };
  try {
    const fingerprint = retryFileFingerprint(contractPath, "technical retry interface contract");
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    if (!contract || typeof contract !== "object" || Array.isArray(contract)) return { ok: false, reason: "technical retry interface contract is not an object" };
    if (contract.contract !== definition.contract) return { ok: false, reason: "technical retry interface contract version differs from the prepared private definition" };
    for (const [key, expected] of [["run_id", definition.run_id], ["assignment_id", definition.assignment_id], ["revision", definition.revision]]) {
      if (contract[key] !== expected) return { ok: false, reason: `technical retry interface contract ${key} binding differs from the prepared private definition` };
    }
    return {
      ok: true,
      path: contractPath,
      relative_path: relativeRetryPath(root, contractPath),
      version: definition.contract,
      sha256: fingerprint.sha256,
      bytes: fingerprint.bytes,
    };
  } catch (error) {
    return { ok: false, reason: `technical retry interface contract could not be observed: ${scrub(error?.message ?? error)}` };
  }
}

function sourceDerivedFirstReceiptValid(capture, observation, firstProjection) {
  const origin = capture?.origin;
  const observedOrigin = observation?.origin;
  const terminal = observation?.terminal_end;
  const sourceOrigin = origin?.kind === "source-derived-host-observer"
    && origin?.source === "source-faithful-wire"
    && origin?.process_observed === false
    && origin?.native_rpc === false
    && origin?.source_binding === true
    && origin?.process_count === 0;
  const observedSourceOrigin = observedOrigin?.kind === origin?.kind
    && observedOrigin?.source === origin?.source
    && observedOrigin?.process_observed === false
    && observedOrigin?.native_rpc === false
    && observedOrigin?.source_binding === true
    && observedOrigin?.process_count === 0;
  const report = terminal?.report;
  const reportStatus = String(report?.status ?? "").toUpperCase();
  const reportOrigin = String(report?.failure_origin ?? report?.origin ?? "").toUpperCase();
  return capture?.source_derived === true
    && capture?.native === false
    && capture?.evidence_level === "SOURCE_DERIVED_HOST_ADAPTER"
    && capture?.native_process_count === 0
    && sourceOrigin
    && observation?.native === false
    && observation?.native_process_count === 0
    && observedSourceOrigin
    && firstProjection?.first?.eligible === true
    && firstProjection?.first?.check?.ok === true
    && terminal?.event_type === "tool_execution_end"
    && terminal?.isError === true
    && terminal?.is_error_observed === true
    && terminal?.exit_code_observed === true
    && Number.isSafeInteger(terminal?.exit_code)
    && terminal.exit_code !== 0
    && terminal?.correlation?.status === "matched"
    && terminal?.observed?.present === true
    && ["FAIL", "FAILED", "FALHOU", "ERROR", "ERRO"].includes(reportStatus)
    && ["SOLUTION", "BEHAVIOR"].includes(reportOrigin);
}

function writeTechnicalRetryFirstReceipt(definition, capture, observation, contract, firstProjection, nativeExpected) {
  const controlRoot = path.join(definition.cwd, ".omp", "state", "native09-technical-retry");
  const receiptPath = path.join(controlRoot, "first-terminal-receipt.json");
  if (fs.existsSync(receiptPath)) throw new ProbeError("BLOCKED", "technical retry first-terminal receipt already exists");
  const terminal = observation?.terminal_end;
  if (nativeExpected === true) {
    if (!terminal || observation.native !== true || observation.origin?.native_rpc !== true || observation.native_process_count !== 1 || firstProjection?.first?.eligible !== true) throw new ProbeError("BLOCKED", "technical retry first-terminal receipt requires an actual Native observation");
  } else if (nativeExpected === false) {
    if (!sourceDerivedFirstReceiptValid(capture, observation, firstProjection)) throw new ProbeError("BLOCKED", "technical retry source-derived first-terminal receipt requires correlated SOURCE_DERIVED_HOST_ADAPTER evidence");
  } else {
    throw new ProbeError("BLOCKED", "technical retry first-terminal receipt requires an explicit Native/source mode");
  }
  const sourceDerived = nativeExpected === false;
  const body = {
    source_kind: sourceDerived ? "SOURCEDERIVED/NON_NATIVE" : "native09-first-validator-terminal",
    ...(sourceDerived ? { evidence_level: "SOURCE_DERIVED_HOST_ADAPTER" } : {}),
    phase: "GREEN",
    run_id: definition.run_id,
    assignment_id: definition.assignment_id,
    revision: definition.revision,
    attempt: terminal.attempt ?? null,
    ...(sourceDerived ? {} : {
      root_session_id: terminal.root_session_id ?? observation.host?.root_session ?? null,
      root_prompt_id: observation.host?.root_prompt ?? null,
    }),
    terminal: safeValue(terminal),
    host: safeValue(observation.host),
    capture_receipt: capture?.capture_receipt ?? null,
    contract: { path: contract.relative_path, version: contract.version, sha256: contract.sha256, bytes: contract.bytes },
  };
  const written = atomicWrite(receiptPath, `${JSON.stringify(body, null, 2)}
`, definition.cwd, "technical retry first terminal receipt");
  return { path: path.relative(definition.cwd, written.path).replaceAll("\\", "/"), sha256: written.sha256, bytes: written.bytes, phase: "GREEN", contract };
}

function technicalRetryRepairCommandEvidence(capture, definition, writeEvents) {
  const results = Array.isArray(capture?.command_results) ? capture.command_results : [];
  const starts = results.filter((item) => item?.command_label === RETRY_COMMAND && item.phase === "start" && item.nested_event_type === "tool_execution_start");
  const ends = results.filter((item) => item?.command_label === RETRY_COMMAND && item.phase === "end" && item.nested_event_type === "tool_execution_end");
  const ordered = (items) => items.slice().sort((a, b) => (a.host_workflow_ordinal ?? a.sequence ?? 0) - (b.host_workflow_ordinal ?? b.sequence ?? 0));
  const firstWriteStart = (writeEvents ?? []).filter((item) => item?.phase === "start" && item?.tool === "write").sort((a, b) => (a.host_workflow_ordinal ?? a.sequence ?? 0) - (b.host_workflow_ordinal ?? b.sequence ?? 0))[0] ?? null;
  const writeEnds = (writeEvents ?? []).filter((item) => item?.phase === "end" && item?.tool === "write" && item?.terminal_error_observed === true && item?.terminal_error === false);
  const first = ordered(ends)[0] ?? null;
  const second = ordered(ends)[1] ?? null;
  const firstStart = starts.find((item) => item?.correlation?.tool_call_id === first?.correlation?.tool_call_id) ?? null;
  const secondStart = starts.find((item) => item?.correlation?.tool_call_id === second?.correlation?.tool_call_id) ?? null;
  const reportStatus = (item) => String(item?.report?.status ?? "").toUpperCase();
  const reportOrigin = (item) => String(item?.report?.failure_origin ?? item?.report?.origin ?? "").toUpperCase();
  const commandShapeValid = (item, start) => Boolean(
    item && start
      && item.command_label === RETRY_COMMAND
      && item.command_sha256 === sha256Text(RETRY_COMMAND)
      && item.command_bytes === Buffer.byteLength(RETRY_COMMAND, "utf8")
      && item.observed?.present === true
      && ["terminal_event", "correlated_start"].includes(item.observed?.source)
      && item.observed?.invocation?.sha256 === sha256Text(RETRY_COMMAND)
      && item.correlation?.status === "matched"
      && item.correlation?.identity_match === true
      && item.correlation?.task_match === true
      && item.correlation?.tool_call_id === start.correlation?.tool_call_id
      && item.identity?.matches?.observed_binding === true
      && Number.isSafeInteger(item.start_sequence)
      && Number.isSafeInteger(item.sequence)
      && item.sequence > item.start_sequence
      && Number.isSafeInteger(item.start_workflow_ordinal)
      && Number.isSafeInteger(item.end_workflow_ordinal)
      && item.end_workflow_ordinal > item.start_workflow_ordinal
      && item.run_id === definition.run_id
      && item.report?.revision === definition.revision
      && item.report?.run_id === definition.run_id
      && item.report?.assignment_id === definition.assignment_id
      && (item.revision === null || item.revision === undefined || item.revision === definition.revision)
  );
  const firstValid = commandShapeValid(first, firstStart)
    && ["FAIL", "FAILED", "FALHOU", "ERROR", "ERRO"].includes(reportStatus(first))
    && ["SOLUTION", "BEHAVIOR"].includes(reportOrigin(first))
    && first.is_error_observed === true && first.is_error === true
    && first.exit_code_observed === true && Number.isSafeInteger(first.exit_code) && first.exit_code !== 0;
  const secondValid = commandShapeValid(second, secondStart)
    && ["PASS", "PASSOU"].includes(reportStatus(second))
    && second.is_error_observed === true && second.is_error === false
    && (!second.exit_code_observed || second.exit_code === 0);
  const sameIdentity = firstValid && secondValid && ["root_session_id", "parent_tool_call_id", "allocated_id", "job_id", "instance_id", "run_id"].every((key) => first[key] !== null && first[key] !== undefined && first[key] === second[key]);
  const distinctCommands = Boolean(first?.correlation?.tool_call_id && second?.correlation?.tool_call_id && first.correlation.tool_call_id !== second.correlation.tool_call_id);
  const writeEnd = writeEnds.length === 1 ? writeEnds[0] : null;
  const orderValid = Boolean(firstValid && secondValid && firstWriteStart && writeEnd
    && first.end_workflow_ordinal < firstWriteStart.host_workflow_ordinal
    && second.start_workflow_ordinal > writeEnd.host_workflow_ordinal);
  return {
    ok: starts.length === 2 && ends.length === 2 && writeEnds.length === 1 && firstValid && secondValid && sameIdentity && distinctCommands && orderValid,
    starts, ends, first, second, first_start: firstStart, second_start: secondStart, write_start: firstWriteStart, write_end: writeEnd,
    same_identity: sameIdentity, distinct_commands: distinctCommands, order_valid: orderValid,
  };
}




function prepareTechnicalRetryDefinition(retryApi, options, fixture, revision, nonce) {
  if (!options.originalSnapshot || !options.originalManifest) return { status: "PENDING_NATIVE", reason: "ORIGINAL191 snapshot/manifest paths were not supplied", definition: null };
  const projectRoot = path.join(fixture.project, ".omp/state/native09-technical-retry");
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    const definition = retryApi.prepareTechnicalRetryScenario({
      runId: fixture.logicalRunId,
      assignmentId: TECHNICAL_RETRY_ASSIGNMENT_ID,
      revision,
      nonce,
      projectRoot,
      originalSnapshotRoot: options.originalSnapshot,
      originalAuditManifest: options.originalManifest,
      installedPackageRoot: options.installedPackageRoot,
    });
    return { status: "PREPARED", definition };
  } catch (error) {
    return { status: "PENDING_NATIVE", reason: scrub(error?.message ?? error), error: safeError(error), definition: null };
  }
}
function retryCausalPhase(observation, definition, label, ordinal, { operation = null, dispatchOverride = null, toolRequired = true } = {}) {
  const terminal = observation?.terminal_end ?? {};
  const host = observation?.host ?? {};
  const tool = host.tool ?? {};
  const dispatch = dispatchOverride ?? {
    dispatch_id: terminal.dispatch_id ?? host.dispatch_event?.tool_call_id ?? host.dispatch?.dispatch_id ?? null,
    allocated_id: terminal.public_id ?? host.dispatch?.allocated_id ?? null,
    job_id: terminal.job_id ?? host.dispatch?.job_id ?? null,
    instance_id: terminal.instance_id ?? host.dispatch?.instance_id ?? null,
    attempt: terminal.attempt ?? host.dispatch?.attempt ?? null,
    host_workflow_ordinal: normalizeHostWorkflowOrdinal(host.dispatch_event?.host_workflow_ordinal),
  };
  const hostArrivalOrdinal = Number.isSafeInteger(terminal.host_arrival_ordinal)
    ? terminal.host_arrival_ordinal
    : tool.end_host_arrival_ordinal ?? null;
  const hostWorkflowOrdinal = normalizeHostWorkflowOrdinal(terminal.host_workflow_ordinal, tool.end_workflow_ordinal);
  const hostBashStartOrdinal = Number.isSafeInteger(terminal.start_host_arrival_ordinal)
    ? terminal.start_host_arrival_ordinal
    : tool.start_host_arrival_ordinal ?? null;
  const hostBashEndOrdinal = Number.isSafeInteger(terminal.host_arrival_ordinal)
    ? terminal.host_arrival_ordinal
    : tool.end_host_arrival_ordinal ?? null;
  const hostBashStartWorkflowOrdinal = normalizeHostWorkflowOrdinal(terminal.start_host_workflow_ordinal, tool.start_workflow_ordinal);
  const hostBashEndWorkflowOrdinal = normalizeHostWorkflowOrdinal(terminal.host_workflow_ordinal, tool.end_workflow_ordinal);
  return {
    label,
    ordinal,
    logical_run_id: definition.run_id,
    assignment_id: terminal.assignment_id ?? definition.assignment_id,
    revision: terminal.revision ?? definition.revision,
    attempt: terminal.attempt ?? null,
    root_session_id: preserveIdentifier(host.root_session),
    root_prompt: preserveIdentifier(host.root_prompt),
    host_observation: host.host_observation ?? null,
    session_id: preserveIdentifier(terminal.session_id),
    dispatch,
    tool: toolRequired ? {
      tool_call_id: preserveIdentifier(terminal.tool_call_id ?? tool.tool_call_id),
      parent_tool_call_id: preserveIdentifier(terminal.parent_tool_call_id),
      start_sequence: tool.start_sequence ?? terminal.start_sequence ?? null,
      end_sequence: tool.end_sequence ?? terminal.sequence ?? null,
      start_workflow_ordinal: hostBashStartWorkflowOrdinal,
      end_workflow_ordinal: hostBashEndWorkflowOrdinal,
    } : null,
    sequence: {
      start: terminal.start_sequence ?? tool.start_sequence ?? null,
      end: terminal.sequence ?? tool.end_sequence ?? null,
    },
    raw_sequence: {
      start: terminal.start_sequence ?? tool.start_sequence ?? null,
      end: terminal.sequence ?? tool.end_sequence ?? null,
    },
    dispatch_receipt: dispatchOverride?.dispatch_receipt ?? null,
    dispatch_receipt_accepted: dispatchOverride?.dispatch_receipt_accepted === true,
    host_arrival_ordinal: hostArrivalOrdinal,
    host_workflow_ordinal: hostWorkflowOrdinal,
    host_bash_start_ordinal: hostBashStartOrdinal,
    host_bash_end_ordinal: hostBashEndOrdinal,
    host_bash_start_workflow_ordinal: hostBashStartWorkflowOrdinal,
    host_bash_end_workflow_ordinal: hostBashEndWorkflowOrdinal,
    operation,
  };
}


async function runNativeTechnicalRetry(options, fixture, retryApi, prepared, executionApi) {
  if (!prepared?.definition) return { status: "PENDING_NATIVE", failure_eligible: false, reason: prepared?.reason ?? "technical retry definition unavailable", prepared };
  const definition = prepared.definition;
  const contractBefore = readTechnicalRetryContract(definition);
  if (!contractBefore.ok) return { status: "BLOCKED", failure_eligible: false, definition, reason: contractBefore.reason, contract: contractBefore };
  const retryFixture = { ...fixture, project: definition.cwd, readRoot: fixture.readRoot ?? fixture.project, sharedRoot: fixture.readRoot ?? fixture.project, logicalRunId: definition.run_id, retryDefinition: definition };
  const captureOptions = options;
  const privateReadBoundary = `\nPhase GREEN. Command/application cwd ${JSON.stringify(definition.cwd)} is nested under the approved private project sharedRoot ${JSON.stringify(retryFixture.sharedRoot)}. The actual private interface contract is ${JSON.stringify(contractBefore.path)} (version ${JSON.stringify(contractBefore.version)}, SHA-256 ${JSON.stringify(contractBefore.sha256)}). Pass this actual sharedRoot, contract path/version/hash, and any host-written proof/read location through task context only; never add invented SDK fields or change canonical task text. That project already contains the frozen .omp/agents and .omp/skills; the SDK profile bootstrap can address them with parent-relative filesystem paths. Use only these project filesystem assets, not global skills, collision aliases or resource catalogs. Commands and role write allowlists remain confined to the scenario cwd.`;
  const installedBefore = fingerprintInstalledPackage(options.installedPackageRoot, "installed package before retry", options.installedPackageRuntimeState === true);
  const firstCapture = await executeNativeCapture(captureOptions, retryFixture, [definition.tasks.first_validator], "native09-technical-retry-first", definition.prompts.first_validator + privateReadBoundary);
  const firstObservation = technicalRetryTerminalObservation(firstCapture, definition, definition.roles.first_validator.name);
  const firstProjection = retryApi.inspectTechnicalRetryScenario({ native: options.native === true, definition, first: firstObservation, second: { terminals: [] }, repair: null, immutable_package: null, execution: null });
  if (!(firstProjection.first?.eligible === true)) return { status: firstProjection.status === "BLOCKED" ? "BLOCKED" : "PENDING_NATIVE", failure_eligible: false, definition, first: firstProjection, reason: "first terminal was not an eligible SOLUTION/BEHAVIOR failure", capture: firstCapture, contract: contractBefore };
  let firstReceipt;
  try {
    firstReceipt = writeTechnicalRetryFirstReceipt(definition, firstCapture, firstObservation, contractBefore, firstProjection, options.native);
  } catch (error) {
    return { status: "BLOCKED", failure_eligible: options.native === true && firstObservation.native === true, definition, first: firstObservation, first_projection: firstProjection, capture: firstCapture, contract: contractBefore, reason: scrub(error?.message ?? error), error: safeError(error) };
  }
  const repairContext = `${privateReadBoundary}\nHost shared task context: the actual eligible first-validator terminal receipt was written at ${JSON.stringify(path.resolve(definition.cwd, firstReceipt.path))} with SHA-256 ${JSON.stringify(firstReceipt.sha256)}. Read that host receipt from the approved sharedRoot before the backend repair; its phase is GREEN and it is evidence only, not a manager-completed or prose verdict.`;
  const repairCapture = await executeNativeCapture(captureOptions, retryFixture, [definition.tasks.backend_repair], "native09-technical-retry-repair", definition.prompts.backend_repair + repairContext);
  const repairAttempt = (repairCapture.task_calls ?? []).filter((call) => call.kind === "dispatch" && call.assignments?.some((item) => item.name === definition.roles.backend_repair.name)).length;
  const beforeHashes = definition.mutable_application.before_hashes;
  const afterHashes = { subject: retryFileFingerprint(definition.paths.subject, "retry subject after repair"), dependency: retryFileFingerprint(definition.paths.dependency, "retry dependency after repair"), validator: retryFileFingerprint(definition.paths.validator, "retry validator after repair") };
  const contractAfterRepair = readTechnicalRetryContract(definition);
  if (!contractAfterRepair.ok || contractAfterRepair.sha256 !== contractBefore.sha256) return { status: "BLOCKED", failure_eligible: options.native === true && firstObservation.native === true, definition, first: firstObservation, first_projection: firstProjection, repair_capture: repairCapture, contract: { before: contractBefore, after: contractAfterRepair }, reason: contractAfterRepair.ok ? "technical retry interface contract changed during repair" : contractAfterRepair.reason };
  const expectedSubjectPath = path.resolve(definition.paths.subject);
  const repairTaskRecords = terminalRecords(repairCapture).filter((item) => item?.assignment_id === definition.roles.backend_repair.name && item?.run_id === definition.run_id);
  const repairTaskRecord = repairTaskRecords.length === 1 ? repairTaskRecords[0] : null;
  const writeEvents = (repairCapture.subagent_writes ?? []).map((item) => {
    const rawPath = Array.isArray(item.paths) && item.paths.length === 1 ? item.paths[0] : null;
    const observedBinding = item.identity?.observed_binding;
    const expectedBinding = {
      root_session_id: repairCapture?.root_session?.session_id,
      parent_tool_call_id: repairTaskRecord?.parent_tool_call_id, allocated_id: repairTaskRecord?.allocated_id,
      index: repairTaskRecord?.index, agent: "backend-developer", agentSource: "project",
      assignment_id: definition.roles.backend_repair.name,
      job_id: repairTaskRecord?.source_kind === "task_wait_result" ? repairTaskRecord?.wait_result?.host_binding?.job_id : repairTaskRecord?.jobId,
      instance_id: repairTaskRecord?.instanceId,
    };
    const authoritativeRole = item.role_source === "observed-root-dispatch-lifecycle"
      && item.identity?.matches?.observed_binding === true
      && observedBinding?.source === "observed-root-dispatch-lifecycle"
      && Object.entries(expectedBinding).every(([key, value]) => value !== undefined && value !== null && observedBinding?.[key] === value);
    return { ...item, path: rawPath ? relativeRetryPath(definition.cwd, rawPath) : null, role: authoritativeRole ? observedBinding.agent : null, public_identity: preserveIdentifier(item.correlation?.public_identity ?? item.identity?.exposed?.ids?.[0]), allocated_id: preserveIdentifier(item.correlation?.allocated_id ?? item.allocated_id), job_id: preserveIdentifier(item.job_id ?? item.jobId), instance_id: preserveIdentifier(item.instance_id ?? item.instanceId), session_id: null, root_session_id: preserveIdentifier(repairCapture?.root_session?.session_id), root_prompt: preserveIdentifier(repairCapture?.root_prompt?.request_id) };
  });
  const writes = writeEvents.filter((item) => {
    const absolute = item.path ? path.resolve(definition.cwd, item.path) : null;
    return item.phase === "end" && item.terminal_event === true && item.role === "backend-developer" && item.terminal_error_observed === true && item.terminal_error === false && item.correlation?.status === "matched" && item.correlation?.identity_match === true && item.guard?.reason_code === null && item.guard?.paths_in_allowlist === true && absolute === expectedSubjectPath && beforeHashes?.subject?.sha256 && afterHashes?.subject?.sha256 && beforeHashes.subject.sha256 !== afterHashes.subject.sha256;
  }).map((item) => ({ ...item, phase: "backend_repair", event_phase: item.phase, attempt: repairAttempt, before_sha256: beforeHashes.subject.sha256, after_sha256: afterHashes.subject.sha256 }));
  const repairCommandEvidence = technicalRetryRepairCommandEvidence(repairCapture, definition, writeEvents);
  const repair = {
    before_hashes: beforeHashes,
    after_hashes: afterHashes,
    contract_before: contractBefore,
    contract_after: contractAfterRepair,
    first_terminal_receipt: firstReceipt,
    command_evidence: repairCommandEvidence,
    before_sha256: beforeHashes.subject?.sha256 ?? null,
    after_sha256: afterHashes.subject?.sha256 ?? null,
    dependency_before_sha256: beforeHashes.dependency?.sha256 ?? null,
    dependency_after_sha256: afterHashes.dependency?.sha256 ?? null,
    validator_before_sha256: beforeHashes.validator?.sha256 ?? null,
    validator_after_sha256: afterHashes.validator?.sha256 ?? null,
    write_events: writeEvents,
    writes,
  };
  const installedAfter = fingerprintInstalledPackage(options.installedPackageRoot, "installed package after repair", options.installedPackageRuntimeState === true);
  const immutablePackage = installedBefore && installedAfter ? { root: options.installedPackageRoot, scope: installedBefore.scope, excluded_runtime_paths: installedBefore.excluded_runtime_paths, manifest_verified: packageManifestVerified(options.installedPackageRoot), changed_paths: fingerprintDiffPaths(installedBefore, installedAfter), before_sha256: installedBefore.sha256, after_sha256: installedAfter.sha256, files_before: installedBefore.files, files_after: installedAfter.files } : null;
  const repairWrite = writes.length === 1 ? { ...writes[0], job_id: writes[0].job_id ?? repairTaskRecord?.jobId ?? null, instance_id: writes[0].instance_id ?? repairTaskRecord?.instanceId ?? null, attempt: 1, session_id: null, success: writes[0].terminal_error === false } : null;
  const repairEvidenceReady = repairCommandEvidence.ok === true && writes.length === 1 && beforeHashes?.subject?.sha256 === definition.immutable_original?.subjects?.cli?.sha256 && afterHashes?.subject?.sha256 && afterHashes.subject.sha256 !== beforeHashes.subject.sha256 && beforeHashes?.dependency?.sha256 === afterHashes?.dependency?.sha256 && beforeHashes?.validator?.sha256 === afterHashes?.validator?.sha256 && contractAfterRepair.sha256 === contractBefore.sha256 && immutablePackage?.manifest_verified === true && Array.isArray(immutablePackage.changed_paths) && immutablePackage.changed_paths.length === 0;
  const repairEnds = (repairCapture?.root_task_ends ?? []).filter((item) => item.kind === "dispatch");
  const repairTransportReady = repairTaskRecord && repairTaskRecord.agent === "backend-developer" && repairTaskRecord.agentSource === "project" && taskRecordSucceeded(repairTaskRecord) && repairCapture?.capture?.complete === true && repairCapture?.terminal?.prompt_result?.status === "completed" && repairCapture?.terminal?.agent_end?.isTerminal === true && repairCapture?.terminal?.agent_end?.awaitingAsyncWork !== true && repairCapture?.terminal?.session_settled === true && repairEnds.length === 1 && repairEnds[0].isError === false && repairEnds[0].tool_call_id === repairTaskRecord.parent_tool_call_id && repairWrite?.allocated_id === repairTaskRecord.allocated_id;
  if (!repairEvidenceReady || !repairTransportReady) return { status: "PENDING_NATIVE", failure_eligible: options.native === true && firstObservation.native === true, definition, first: firstObservation, repair, immutable_package: immutablePackage, captures: { first: firstCapture, repair: repairCapture }, contract: { before: contractBefore, after: contractAfterRepair }, reason: "authoritative unique completed backend repair requires one exact write plus two correlated backend command terminals and immutable source proofs before peer/second dispatch" };
  const peerTaskBundle = buildPeerTask(definition, afterHashes.subject.sha256);
  const peerTask = peerTaskBundle.task;
  const peerCapture = await executeNativeCapture(captureOptions, { ...retryFixture, retryPhase: "peer" }, [peerTask], "native09-technical-retry-peer-review", peerTaskBundle.prompt + privateReadBoundary);
  const peerName = definition.roles.peer_review.name;
  const peerRecords = terminalRecords(peerCapture).filter((item) => item?.assignment_id === peerName && item?.run_id === definition.run_id);
  const peerRecord = peerRecords.length === 1 ? peerRecords[0] : null;
  // Native task_details normalizes the public SingleResult.structuredOutput
  // into structured_data; the source-derived seam carries the same public
  // result explicitly without adding fields to SingleResult.
  const peerReview = peerCapture?.source_peer_review ?? peerRecord?.structured_data ?? null;
  const peerReadObserved = (peerCapture?.subagent_reads ?? []).some((item) => (item?.paths ?? []).some((value) => path.resolve(definition.cwd, value) === path.resolve(definition.paths.subject)));
  const peerBinding = peerCapture?.source_peer_subject_binding ?? (peerReadObserved ? { source: "HOST_OBSERVED_PRIVATE_BYTE_BINDING", path: definition.paths.subject_relative, sha256: sha256Bytes(fs.readFileSync(definition.paths.subject)), revision: definition.revision, independent: true } : null);
  const protocolApi = await importApi(options.source, "deep-review/lib/protocol.mjs", "managed peer review consumer");
  const peerValidation = protocolApi.validateReviewerResult(peerReview, { agent: "peer-reviewer", protocol_mode: "TDD_PEER_REVIEW", reviewed_revision: definition.revision });
  const peerEnds = (peerCapture?.root_task_ends ?? []).filter((item) => item.kind === "dispatch");
  const peerTransportReady = peerRecord && peerRecord.agent === "peer-reviewer" && taskRecordSucceeded(peerRecord) && peerRecord.agentSource === "project" && peerCapture?.capture?.complete === true && peerCapture?.terminal?.prompt_result?.status === "completed" && peerCapture?.terminal?.agent_end?.isTerminal === true && peerCapture?.terminal?.agent_end?.awaitingAsyncWork !== true && peerCapture?.terminal?.session_settled === true && peerEnds.length === 1 && peerEnds[0].isError === false && peerEnds[0].tool_call_id === peerRecord.parent_tool_call_id && peerRecord.instanceId !== repairTaskRecord.instanceId && peerRecord.instanceId !== firstObservation.terminal_end.instance_id;
  if (!peerTransportReady || !peerValidation.ok || peerValidation.value.status !== "APROVADO" || peerValidation.value.overall_correctness !== "correct" || peerValidation.value.findings.some((item) => Number.isInteger(item.priority) ? item.priority <= 1 : item.priority === "P0" || item.priority === "P1") || peerBinding?.sha256 !== afterHashes.subject.sha256 || peerBinding?.revision !== definition.revision || peerBinding?.independent !== true || !peerReadObserved) return { status: "BLOCKED", failure_eligible: true, definition, first: firstObservation, repair, peer: peerCapture, peer_validation: peerValidation, immutable_package: immutablePackage, reason: "managed peer-reviewer did not return an accepted private subject-bound TDD_PEER_REVIEW" };
  const reviewPath = path.join(definition.cwd, ".omp/state/native09-independent-review.json");
  const reviewInfo = atomicWrite(reviewPath, `${JSON.stringify(peerReview)}
`, definition.cwd, "native09 independent peer review receipt");
  repair.independent_review = { path: path.relative(definition.cwd, reviewPath).replaceAll("\\", "/"), sha256: reviewInfo.sha256, run_id: definition.run_id, revision: definition.revision, author: "backend-developer", reviewer: "peer-reviewer", independent: true, subject_sha256: peerBinding.sha256 };
  const secondCapture = await executeNativeCapture(captureOptions, retryFixture, [definition.tasks.second_validator], "native09-technical-retry-second", definition.prompts.second_validator + privateReadBoundary);
  const secondObservation = technicalRetryTerminalObservation(secondCapture, definition, definition.roles.second_validator.name);
  const repairDispatchCall = (repairCapture?.task_calls ?? []).find((call) => call.kind === "dispatch" && call.tool_call_id === repairTaskRecord.parent_tool_call_id);
  const repairDispatchRecord = repairDispatchCall ? { dispatch_id: repairDispatchCall.tool_call_id, allocated_id: repairTaskRecord.allocated_id, job_id: repairTaskRecord.source_kind === "task_wait_result" ? repairTaskRecord.wait_result?.host_binding?.job_id : repairTaskRecord.jobId, instance_id: repairTaskRecord.instanceId, attempt: 1, host_workflow_ordinal: repairDispatchCall.host_workflow_ordinal ?? null } : null;
  const repairTool = repairWrite ? { tool_call_id: preserveIdentifier(repairWrite.correlation?.tool_call_id), parent_tool_call_id: repairWrite.parent_tool_call_id, public_identity: preserveIdentifier(repairWrite.correlation?.public_identity), command_label: "write", start_sequence: repairWrite.start_sequence ?? null, end_sequence: repairWrite.sequence ?? null, start_workflow_ordinal: repairWrite.start_host_workflow_ordinal ?? null, end_workflow_ordinal: repairWrite.host_workflow_ordinal ?? null } : null;
  const firstPhase = retryCausalPhase(firstObservation, definition, "first_terminal_accepted", 1);
  const secondPhase = retryCausalPhase(secondObservation, definition, "second_terminal_accepted", 4);
  const secondDispatchHost = secondObservation.host?.dispatch ?? {};
  const secondDispatchEvent = secondObservation.host?.dispatch_event ?? {};
  const secondDispatchPhase = { label: "second_dispatch", ordinal: 3, logical_run_id: definition.run_id, assignment_id: definition.assignment_id, revision: definition.revision, attempt: secondObservation.terminal_end?.attempt ?? null, root_session_id: preserveIdentifier(secondObservation.host?.root_session), root_prompt: preserveIdentifier(secondObservation.host?.root_prompt), session_id: preserveIdentifier(secondObservation.terminal_end?.session_id), dispatch: { dispatch_id: preserveIdentifier(secondDispatchEvent.tool_call_id ?? secondDispatchHost.dispatch_id), allocated_id: preserveIdentifier(secondDispatchHost.allocated_id ?? secondObservation.terminal_end?.public_id), job_id: preserveIdentifier(secondObservation.terminal_end?.job_id ?? secondDispatchHost.job_id), instance_id: preserveIdentifier(secondObservation.terminal_end?.instance_id ?? secondDispatchHost.instance_id), attempt: secondObservation.terminal_end?.attempt ?? secondDispatchHost.attempt ?? null }, tool: null, sequence: { start: 0, end: 0 }, raw_sequence: { start: Number.isSafeInteger(secondDispatchEvent.sequence) ? secondDispatchEvent.sequence : null, end: Number.isSafeInteger(secondDispatchEvent.sequence) ? secondDispatchEvent.sequence : null }, dispatch_receipt: { receipt_id: preserveIdentifier(secondDispatchEvent.tool_call_id ?? secondDispatchHost.dispatch_id), accepted: secondDispatchEvent.observed === true, host_arrival_ordinal: secondDispatchEvent.host_arrival_ordinal ?? null, host_workflow_ordinal: secondDispatchEvent.host_workflow_ordinal ?? null }, dispatch_receipt_accepted: secondDispatchEvent.observed === true, host_arrival_ordinal: secondDispatchEvent.host_arrival_ordinal ?? null, host_workflow_ordinal: secondDispatchEvent.host_workflow_ordinal ?? null, host_dispatch: { source: "HOST_DERIVED_TASK_START", observed: secondDispatchEvent.observed === true, tool_call_id: secondDispatchEvent.tool_call_id ?? null } };
  const repairPhase = { label: "repair_accepted", ordinal: 2, logical_run_id: definition.run_id, assignment_id: definition.assignment_id, revision: definition.revision, attempt: repairWrite?.attempt ?? null, root_session_id: repairWrite?.root_session_id ?? preserveIdentifier(repairCapture?.root_session?.session_id), root_prompt: repairWrite?.root_prompt ?? preserveIdentifier(repairCapture?.root_prompt?.request_id), session_id: repairWrite?.session_id ?? null, host_workflow_ordinal: repairWrite?.host_workflow_ordinal ?? null, dispatch: { dispatch_id: repairDispatchRecord?.dispatch_id ?? repairDispatchRecord?.dispatchId ?? repairWrite?.correlation?.tool_call_id ?? null, allocated_id: repairDispatchRecord?.allocated_id ?? repairDispatchRecord?.allocatedId ?? repairWrite?.correlation?.public_identity ?? null, job_id: repairDispatchRecord?.job_id ?? repairDispatchRecord?.jobId ?? repairWrite?.job_id ?? null, instance_id: repairDispatchRecord?.instance_id ?? repairDispatchRecord?.instanceId ?? repairWrite?.instance_id ?? null, attempt: repairDispatchRecord?.attempt ?? repairWrite?.attempt ?? null }, tool: repairTool, sequence: { start: repairWrite?.start_sequence ?? null, end: repairWrite?.sequence ?? null } };
  const executionPhase = { label: "execution_consumed", ordinal: 5, logical_run_id: definition.run_id, assignment_id: definition.assignment_id, revision: definition.revision, host_workflow_ordinal: null, operation: "tdd-orchestrator/lib/execution.mjs.evaluateExecution" };
  repair.causal = { provenance: "lifecycle-host-adapter-v1", host_workflow_id: `${definition.run_id}:${definition.assignment_id}`, phases: { first_terminal_accepted: firstPhase, repair_accepted: repairPhase, second_dispatch: secondDispatchPhase, second_terminal_accepted: secondPhase, execution_consumed: executionPhase }, first_terminal: { ...firstPhase, terminal: firstObservation.terminal_end }, repair: { ...repairPhase, write_end: { ...repairWrite, domain_ids: { ...repairPhase.dispatch } }, before_hashes: repair.before_hashes, after_hashes: repair.after_hashes }, second_dispatch: { ...secondDispatchPhase, dispatch_receipt: { receipt_id: secondDispatchPhase.dispatch_receipt?.receipt_id ?? preserveIdentifier(secondDispatchPhase.dispatch?.dispatch_id), accepted: secondDispatchPhase.dispatch_receipt_accepted === true, host_arrival_ordinal: secondDispatchPhase.host_arrival_ordinal } }, second_terminal: { ...secondPhase, terminal: secondObservation.terminal_end }, execution: { ...executionPhase, consumed_second: null } };
  const executionProjection = makeRetryExecution(executionApi, definition, firstObservation, secondObservation, repair, repair.causal);
  const projectedCausal = executionProjection?.causal ?? repair.causal;
  const execution = { ok: executionProjection?.ok === true, errors: Array.isArray(executionProjection?.errors) ? executionProjection.errors : null, consumer: "tdd-orchestrator/lib/execution.mjs", status: executionProjection?.status ?? null, value: executionProjection?.value ?? null, resume_evidence: executionProjection?.resume_evidence ?? null, causal: projectedCausal, projection: executionProjection };
  const installedFinal = fingerprintInstalledPackage(options.installedPackageRoot, "installed package after second validator", options.installedPackageRuntimeState === true);
  const contractFinal = readTechnicalRetryContract(definition);
  const finalApplication = { subject: retryFileFingerprint(definition.paths.subject), dependency: retryFileFingerprint(definition.paths.dependency), validator: retryFileFingerprint(definition.paths.validator) };
  if (!contractFinal.ok || contractFinal.sha256 !== contractBefore.sha256) return { status: "BLOCKED", failure_eligible: true, definition, first: firstObservation, second: secondObservation, repair, immutable_package: immutablePackage, contract: { before: contractBefore, after_repair: contractAfterRepair, final: contractFinal }, reason: contractFinal.ok ? "technical retry interface contract changed during final validation" : contractFinal.reason, captures: { first: firstCapture, repair: repairCapture, peer: peerCapture, second: secondCapture } };
  if (Object.keys(finalApplication).some((key) => finalApplication[key]?.sha256 !== afterHashes[key]?.sha256 || finalApplication[key]?.bytes !== afterHashes[key]?.bytes)) return { status: "BLOCKED", failure_eligible: true, reason: "reviewed application bytes changed during final validation", captures: { first: firstCapture, repair: repairCapture, peer: peerCapture, second: secondCapture } };
  Object.assign(immutablePackage, { manifest_verified: packageManifestVerified(options.installedPackageRoot), changed_paths: fingerprintDiffPaths(installedBefore, installedFinal), after_sha256: installedFinal.sha256, files_after: installedFinal.files });
  const result = retryApi.inspectTechnicalRetryScenario({ native: options.native === true, definition, first: firstObservation, second: secondObservation, repair, immutable_package: immutablePackage, execution, causal: projectedCausal });
  const nativeFailureObserved = options.native === true && firstObservation?.native === true && firstObservation?.origin?.native_rpc === true && firstObservation?.native_process_count === 1 && result.first?.eligible === true;
  return { status: result.status, failure_eligible: nativeFailureObserved, definition, first: firstObservation, second: secondObservation, repair, peer: peerCapture, immutable_package: immutablePackage, contract: { before: contractBefore, after_repair: contractAfterRepair, final: contractFinal }, execution, execution_projection: executionProjection, result, captures: { first: firstCapture, repair: repairCapture, peer: peerCapture, second: secondCapture } };
}



function nativeExternalReceipt(nativeResult) {
  const commandResults = Array.isArray(nativeResult?.command_results) ? nativeResult.command_results : [];
  const matches = commandResults.filter((item) => {
    const receipt = item?.report?.result?.external;
    return isCorrelatedTerminalCommand(item)
      && item?.command_label === TOOLING_COMMAND
      && validSuccessfulToolResult(item)
      && item?.report?.status === "PASSOU"
      && validateExternalPlanReceipt(receipt).ok;
  });
  if (matches.length !== 1) {
    return {
      status: "PENDING_NATIVE",
      receipt: null,
      reason: matches.length === 0 ? "validator tool_execution_end did not expose a correlated PASSOU report containing a validated AC021 Ship plan receipt" : "duplicate correlated PASSOU Ship plan terminals were observed",
      terminal_count: matches.length,
    };
  }
  const candidate = matches[0];
  return { status: "PASS", receipt: candidate.report.result.external, command_result: { event_type: candidate.event_type, command_label: candidate.command_label, exit_code: candidate.exit_code, correlation: candidate.correlation, observed: candidate.observed, report: candidate.report } };
}
function evaluateLifecycle(native, qualityResult, stateResult, executionResult, retroResult, nativeFailure, retry, retryExecution, alignmentBinding = null, nativeRetro = null, routeResults = []) {
  const actions = native?.actions ?? {};
  const externalReceipt = nativeExternalReceipt(native);
  const alignmentEvidence = actions.alignment ?? (alignmentBinding ? { status: alignmentBinding.status, short: alignmentBinding, full: alignmentBinding, local: alignmentBinding, binding: alignmentBinding } : null);
  const stateCase = (label) => stateResult?.cases?.find((item) => item.label === label)?.result?.ok === true;
  const applicableProfiles = native?.profiles ?? [];
  const reviewProfiles = applicableProfiles.filter((profile) => ["deep-reviewer", "peer-reviewer"].includes(profile.agent));
  const reviewReady = reviewProfiles.length === 2 && new Set(reviewProfiles.map((profile) => profile.agent)).size === 2 && reviewProfiles.every((profile) => profile.status === "PASS");
  const docReady = actions.doc?.exists === true && actions.doc?.managed_write_observed === true && actions.doc?.content_bound === true && applicableProfiles.find((profile) => profile.agent === "spec-kit-author")?.status === "PASS" && stateCase("DOC.VALIDATED");
  const validateReady = actions.validate?.status === "PASS" && qualityResult?.ship_gate?.ok === true && executionResult?.native_observed === true && executionResult?.complete === true;
  const retroReady = nativeRetro?.status === "PASS" && nativeRetro.owner === "ship" && nativeRetro.required?.validation?.ok === true;
  const optOutReady = nativeRetro?.status === "PASS" && nativeRetro.opt_out?.required === false && nativeRetro.opt_out?.no_analysis_approval === true;
  const routeById = id => routeResults.find((item) => item?.case === id) ?? null;
  const routePass = id => routeById(id)?.status === "PASS" && routeById(id)?.native === true;
  const shortRoute = routeById("SHORT_LOCAL");
  const fullRoute = routeById("FULL_LOCAL");
  const localRouteReady = routePass("SHORT_LOCAL") && routePass("FULL_LOCAL");
  const routeReason = ids => ids.filter((id) => !routePass(id)).map((id) => routeById(id)?.reason ?? `${id} route is not a native PASS`).join("; ");
  const alignmentReason = alignmentBinding?.reason ?? "retained alignment capture is historical and does not promote current route phases";
  const alignmentReady = alignmentBinding?.status === "PASS";
  const phase = {
    SHORT: { status: routePass("SHORT_LOCAL") ? "PASS" : "PENDING_NATIVE", evidence: shortRoute, historical_alignment_binding: alignmentReady ? alignmentEvidence?.short ?? null : alignmentBinding, reason: routePass("SHORT_LOCAL") ? null : routeReason(["SHORT_LOCAL"]) || alignmentReason },
    FULL: { status: routePass("FULL_LOCAL") ? "PASS" : "PENDING_NATIVE", evidence: fullRoute, historical_alignment_binding: alignmentReady ? alignmentEvidence?.full ?? null : alignmentBinding, reason: routePass("FULL_LOCAL") ? null : routeReason(["FULL_LOCAL"]) || alignmentReason },
    LOCAL: { status: localRouteReady ? "PASS" : "PENDING_NATIVE", evidence: { short: shortRoute, full: fullRoute }, historical_alignment_binding: alignmentReady ? alignmentEvidence?.local ?? null : alignmentBinding, consumer: qualityResult?.ship_gate ?? null, reason: localRouteReady ? null : routeReason(["SHORT_LOCAL", "FULL_LOCAL"]) || alignmentReason },
    EXTERNAL: { status: externalReceipt.status === "PASS" ? "PASS" : "PENDING_NATIVE", native: { action: actions.external ?? null, validator: externalReceipt }, consumer: qualityResult?.external_dry_path ?? null, reason: externalReceipt.status === "PASS" ? null : externalReceipt.reason },
    DOC: { status: docReady ? "PASS" : "PENDING_NATIVE", native: actions.doc ?? null, consumer: stateResult?.cases?.find((item) => item.label === "DOC.VALIDATED")?.result ?? null },
    REVIEW: { status: reviewReady ? "PASS" : "PENDING_NATIVE", native: applicableProfiles.filter((profile) => ["deep-reviewer", "peer-reviewer"].includes(profile.agent)), consumer: qualityResult?.direct ?? null },
    VALIDATE: { status: validateReady ? "PASS" : "PENDING_NATIVE", native: actions.validate ?? null, consumers: { ship: qualityResult?.ship_gate ?? null, execution: executionResult ?? null } },
    RETRO_OWNER: { status: retroReady ? "PASS" : "PENDING_NATIVE", native: nativeRetro?.root ?? null, consumer: nativeRetro?.required ?? null, evidence_level: "native-root-artifact-plus-retro-consumer" },
    RETRO_OPT_OUT: { status: optOutReady ? "PASS" : "PENDING_NATIVE", native: nativeRetro?.root ?? null, consumer: nativeRetro?.opt_out ?? null, evidence_level: "native-root-artifact-plus-retro-consumer" },
    FAILURE: { status: nativeFailure?.eligible ? "PASS" : "PENDING_NATIVE", native: nativeFailure, reason: nativeFailure?.reason },
    RESUME: { status: retry?.status === "PASS" && retryExecution?.status === "PASS" ? "PASS" : "PENDING_NATIVE", native: retry, consumer: retryExecution },
  };
  const uncovered = Object.entries(phase).filter(([, value]) => value.status !== "PASS").map(([name, value]) => ({ phase: name, status: value.status, reason: value.reason ?? "required native action/artifact/consumer observation was not accepted" }));
  return { status: uncovered.length === 0 ? "PASS" : "PENDING_NATIVE", phases: phase, uncovered, alignment_binding: alignmentBinding, evidence_level: "native observed actions/artifacts and installed profile schemas plus real root library consumers; no synthetic lifecycle yields" };
}
function offlineGuardShapeProbe() {
  const expectedCommand = TOOLING_COMMAND;
  const passReport = { status: "PASSOU", actual: 2, expected: 2, nonce: "offline-nonce", assignment_id: "Native10Validator", revision: "offline-revision", workload: { run_id: "offline-run", source: "src/tiny.mjs", revision: "offline-revision" } };
  const makeEvent = ({ command, exitCode, report, resultShape, partialResult, isError = false, nestedType = null, toolCallId = null, toolName = "bash", nestedFields = {} }) => {
    const nestedEvent = { type: nestedType, toolCallId, toolName, ...nestedFields };
    if (command !== undefined) nestedEvent.args = { command };
    if (partialResult !== undefined) nestedEvent.partialResult = partialResult;
    if (resultShape !== undefined) nestedEvent.result = resultShape;
    else if (report) {
      const footer = Number.isInteger(exitCode) && exitCode !== 0 ? `\n\nCommand exited with code ${exitCode}` : "\n\nWall time: 1.25 seconds";
      nestedEvent.result = { content: [{ type: "text", text: `${JSON.stringify(report)}${footer}` }], details: Number.isInteger(exitCode) && exitCode !== 0 ? { exitCode } : { wallTimeNoticeEmitted: true, timeoutDisabled: true, wallTimeMs: 1250 } };
    }
    if (nestedType === "tool_execution_end" && typeof isError === "boolean") nestedEvent.isError = isError;
    return nestedEvent;
  };
  const summarize = (record) => ({
    reason_code: record?.guard?.reason_code ?? null,
    identity_match: record?.guard?.identity_match ?? null,
    command_match: record?.guard?.command_match ?? null,
    identity: record?.identity ?? null,
    requested: record?.requested ?? null,
    invocation: record?.invocation ?? null,
    observed: record?.observed ?? null,
    exit_code_observed: record?.exit_code_observed === true,
    exit_code: record?.exit_code ?? null,
    tool_error: record?.tool_error ?? null,
    tool_error_observed: record?.tool_error_observed === true,
    report_status: record?.report?.status ?? null,
  });
  const setupSourceSession = (label, role) => {
    const name = role === "validator" ? "Native10Validator" : "Native10SpecKitAuthor";
    const sessionId = `offline-source-session-${label}`;
    const rootToolCallId = `root-${label}|fc-root-${label}`;
    const allocatedId = `allocated-${label}|fc-child-${label}`;
    const assignment = { name, agent: role, task: `Source-faithful pinned assignment ${label}`, files: [], solutionSpace: "Bounded offline observer shape probe." };
    const session = new NativeRpcSession({ omp: "offline-probe", cwd: process.cwd(), timeoutMs: 30_000, assignments: [assignment], logicalRunId: "offline-probe", label });
    session.bindSourceHost({ type: "response", command: "get_state", success: true, id: `state-${label}`, data: { sessionId } }, `state-${label}`, `prompt-${label}`);
    session.recordTool({ type: "tool_execution_start", toolName: "task", toolCallId: rootToolCallId, args: { context: "Bounded source-derived observer guard.", tasks: [{ name: assignment.name, agent: assignment.agent, task: assignment.task, solutionSpace: assignment.solutionSpace }] } });
    session.consumeLogical({ type: "subagent_lifecycle", payload: { id: allocatedId, index: 0, agent: role, agentSource: "project", parentToolCallId: rootToolCallId, status: "started" } });
    return { session, name, role, rootToolCallId, allocatedId, promptId: `prompt-${label}` };
  };
  const frame = (nestedEvent, allocatedId) => ({ type: "subagent_event", payload: { id: allocatedId, event: nestedEvent } });
  const runCorrelation = (label, ...events) => {
    const mismatchRole = label === "identity_mismatch" || label === "identity_and_command_mismatch" ? "spec-kit-author" : "validator";
    const setup = setupSourceSession(label, mismatchRole);
    const { session } = setup;
    let error = null;
    try {
      for (const event of events.flat()) if (event) session.recordSubagent(frame(event.nested ?? event, event.id ?? setup.allocatedId));
      session.recordTool({ type: "tool_execution_end", toolName: "task", toolCallId: setup.rootToolCallId, isError: false, result: { content: [], details: { results: [] } } });
      session.consumeLogical({ type: "prompt_result", id: setup.promptId, status: "completed", agentInvoked: true, sessionSettled: true });
      session.consumeLogical({ type: "session_settled" });
      session.consumeLogical({ type: "agent_end", isTerminal: true });
    } catch (caught) {
      error = controlledError(caught);
    }
    return {
      label,
      error,
      root_session: session.evidence.root_session,
      root_task_ends: session.evidence.root_task_ends,
      lifecycle_bindings: [...session.lifecycleByAllocated.values()],
      command_results: session.evidence.command_results,
      pending_call_count: session.validatorCalls.size,
    };
  };
  const runWriteCorrelation = (label, ...events) => {
    const setup = setupSourceSession(label, "spec-kit-author");
    const { session } = setup;
    let error = null;
    try {
      for (const event of events.flat()) if (event) session.recordSubagent(frame(event.nested ?? event, event.id ?? setup.allocatedId));
      session.recordTool({ type: "tool_execution_end", toolName: "task", toolCallId: setup.rootToolCallId, isError: false, result: { content: [], details: { results: [] } } });
      session.consumeLogical({ type: "prompt_result", id: setup.promptId, status: "completed", agentInvoked: true, sessionSettled: true });
      session.consumeLogical({ type: "session_settled" });
      session.consumeLogical({ type: "agent_end", isTerminal: true });
    } catch (caught) {
      error = controlledError(caught);
    }
    return {
      label,
      error,
      root_session: session.evidence.root_session,
      root_task_ends: session.evidence.root_task_ends,
      lifecycle_bindings: [...session.lifecycleByAllocated.values()],
      write_records: session.evidence.subagent_writes,
      pending_write_count: session.writeCalls.size,
    };
  };
  const validStartA = makeEvent({ command: expectedCommand, nestedType: "tool_execution_start", toolCallId: "call_offline_start|fc_offline_start" });
  const validStartB = makeEvent({ command: expectedCommand, nestedType: "tool_execution_start", toolCallId: "call_offline_interleave|fc_offline_interleave" });
  const validUpdateA = makeEvent({ nestedType: "tool_execution_update", toolCallId: "call_offline_start|fc_offline_start", partialResult: { status: "PARTIAL", chunk: 1 } });
  const validUpdateB = makeEvent({ nestedType: "tool_execution_update", toolCallId: "call_offline_interleave|fc_offline_interleave", partialResult: { status: "PARTIAL", chunk: 2 } });
  const validEndA = makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_start|fc_offline_start", report: passReport });
  const validEndB = makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_interleave|fc_offline_interleave", report: passReport });
  const writePath = NATIVE10_DOC_HANDOFF;
  const writeStart = makeEvent({ nestedType: "tool_execution_start", toolName: "write", toolCallId: "call_offline_write|fc_offline_write", nestedFields: { args: { path: writePath, content: "AC-016 private documentation handoff\n" } } });
  const writeUpdate = makeEvent({ nestedType: "tool_execution_update", toolName: "write", toolCallId: "call_offline_write|fc_offline_write", nestedFields: { args: { path: writePath }, partialResult: { content: [{ type: "text", text: `Writing 36 bytes to ${writePath}` }], details: { resolvedPath: path.resolve(process.cwd(), writePath) } } } });
  const writeEnd = makeEvent({ nestedType: "tool_execution_end", toolName: "write", toolCallId: "call_offline_write|fc_offline_write", nestedFields: { result: { content: [{ type: "text", text: `Wrote 36 bytes to ${writePath}` }], details: { resolvedPath: path.resolve(process.cwd(), writePath) } } } });
  const writeEndSameArgs = makeEvent({ nestedType: "tool_execution_end", toolName: "write", toolCallId: "call_offline_write_same_args|fc_offline_write_same_args", nestedFields: { args: { path: writePath, content: "AC-016 private documentation handoff\n" }, result: { ok: true } } });
  const writePathDriftEvent = makeEvent({ nestedType: "tool_execution_update", toolName: "write", toolCallId: "call_offline_write_drift|fc_offline_write_drift", nestedFields: { args: { path: "docs/other.md", content: "drift" }, partialResult: { content: [{ type: "text", text: "Writing 5 bytes to docs/other.md" }] } } });
  const writeCases = [
    runWriteCorrelation("write_start_update_end_path_bound", writeStart, writeUpdate, writeEnd),
    runWriteCorrelation("write_end_same_args_path_bound", makeEvent({ nestedType: "tool_execution_start", toolName: "write", toolCallId: "call_offline_write_same_args|fc_offline_write_same_args", nestedFields: { args: { path: writePath, content: "AC-016 private documentation handoff\n" } } }), writeEndSameArgs),
    runWriteCorrelation("write_unknown_end", makeEvent({ nestedType: "tool_execution_end", toolName: "write", toolCallId: "call_offline_write_stale|fc_offline_write_stale", nestedFields: { result: { ok: true } } })),
    runWriteCorrelation("write_missing_correlation", writeStart, makeEvent({ nestedType: "tool_execution_end", toolName: "write", nestedFields: { result: { ok: true } } })),
    runWriteCorrelation("write_duplicate_start", writeStart, writeStart),
    runWriteCorrelation("write_outside_path", makeEvent({ nestedType: "tool_execution_start", toolName: "write", toolCallId: "call_offline_write_outside|fc_offline_write_outside", nestedFields: { args: { path: "../outside.txt", content: "no" } } })),
    runWriteCorrelation("write_path_drift", makeEvent({ nestedType: "tool_execution_start", toolName: "write", toolCallId: "call_offline_write_drift|fc_offline_write_drift", nestedFields: { args: { path: writePath, content: "AC-016 private documentation handoff\n" } } }), writePathDriftEvent),
    runWriteCorrelation("write_identity_drift", { nested: writeStart, id: "allocated-foreign|fc-write-identity" }, { nested: writeEnd, id: "allocated-foreign|fc-write-identity" }),
  ];
  const cases = [
    ["identity_mismatch", runCorrelation("identity_mismatch", makeEvent({ command: expectedCommand, nestedType: "tool_execution_start", toolCallId: "call_offline_identity|fc_offline_identity" }))],
    ["command_mismatch", runCorrelation("command_mismatch", makeEvent({ command: `${expectedCommand} --unexpected`, nestedType: "tool_execution_start", toolCallId: "call_offline_command|fc_offline_command" }))],
    ["identity_and_command_mismatch", runCorrelation("identity_and_command_mismatch", makeEvent({ command: "node wrong-command.mjs", nestedType: "tool_execution_start", toolCallId: "call_offline_both|fc_offline_both" }))],
    ["accepted_terminal_shape", runCorrelation("accepted_terminal_shape", makeEvent({ command: expectedCommand, nestedType: "tool_execution_start", toolCallId: "call_offline_accepted|fc_offline_accepted" }), makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_accepted|fc_offline_accepted", report: passReport }))],
  ].map(([label, result]) => ({ label, ...summarize(result.command_results.at(-1)) }));
  const missingSuccessSignal = summarize(runCorrelation("missing_success_signal", makeEvent({ command: expectedCommand, nestedType: "tool_execution_start", toolCallId: "call_offline_missing_signal|fc_offline_missing_signal" }), makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_missing_signal|fc_offline_missing_signal", report: passReport, isError: null })).command_results.at(-1));
  const falseReport = summarize(runCorrelation("false_report", makeEvent({ command: expectedCommand, nestedType: "tool_execution_start", toolCallId: "call_offline_false_report|fc_offline_false_report" }), makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_false_report|fc_offline_false_report", report: { ...passReport, status: "FALHOU" }, isError: false })).command_results.at(-1));
  const nonzeroSuccess = summarize(runCorrelation("nonzero_success", makeEvent({ command: expectedCommand, nestedType: "tool_execution_start", toolCallId: "call_offline_nonzero_success|fc_offline_nonzero_success" }), makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_nonzero_success|fc_offline_nonzero_success", exitCode: 17, report: passReport, isError: false })).command_results.at(-1));
  const zeroError = summarize(runCorrelation("zero_error", makeEvent({ command: expectedCommand, nestedType: "tool_execution_start", toolCallId: "call_offline_zero_error|fc_offline_zero_error" }), makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_zero_error|fc_offline_zero_error", resultShape: { content: [{ type: "text", text: `${JSON.stringify(passReport)}\n\nWall time: 1.25 seconds` }], details: { exitCode: 0 } }, isError: true })).command_results.at(-1));
  const validStart = validStartA;
  const validEnd = validEndA;
  const correlationCases = [
    runCorrelation("admitted_start_updates_interleaved_end", [validStartA, validStartB, validUpdateA, validUpdateB, validEndB, validEndA]),
    runCorrelation("unknown_end", null, makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_stale|fc_offline_stale", exitCode: 0, report: { status: "PASSOU", actual: 2, expected: 2 } })),
    runCorrelation("unknown_update", makeEvent({ nestedType: "tool_execution_update", toolCallId: "call_offline_update_stale|fc_offline_update_stale", partialResult: { status: "PARTIAL" } })),
    runCorrelation("mismatched_call_id", validStart, makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_other|fc_offline_other", exitCode: 0, report: { status: "PASSOU", actual: 2, expected: 2 } })),
    runCorrelation("missing_correlation", validStart, makeEvent({ nestedType: "tool_execution_end", exitCode: 0, report: { status: "PASSOU", actual: 2, expected: 2 } })),
    runCorrelation("command_drift", validStart, makeEvent({ command: `${expectedCommand} --unexpected`, nestedType: "tool_execution_end", toolCallId: "call_offline_start|fc_offline_start", exitCode: 0, report: { status: "PASSOU", actual: 2, expected: 2 } })),
    runCorrelation("update_command_drift", validStart, makeEvent({ command: `${expectedCommand} --unexpected`, nestedType: "tool_execution_update", toolCallId: "call_offline_start|fc_offline_start", partialResult: { status: "PARTIAL" } })),
    runCorrelation("identity_drift", validStart, { nested: makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_start|fc_offline_start", exitCode: 0, report: { status: "PASSOU", actual: 2, expected: 2 }, nestedFields: { assignment_id: "Native10Validator" } }), id: "allocated-foreign|fc-correlation-identity" }),
    runCorrelation("duplicate_start", validStart, validStart),
  ];
  const requestedOnly = commandObservation({ command_results: [{ command_label: expectedCommand, requested: commandShape(expectedCommand), invocation: commandShape(expectedCommand), observed: null, command_sha256: null, exit_code_observed: false }] }, expectedCommand);
  const captureSession = new NativeRpcSession({ omp: "offline-probe", cwd: process.cwd(), timeoutMs: 30_000, assignments: [], logicalRunId: "offline-probe", label: "offline-probe" });
  let captureError = null;
  try {
    const boundedPayload = Array.from({ length: 43 }, () => Array.from({ length: 128 }, () => "x".repeat(4096)));
    captureSession.capture("tool_events", boundedPayload);
  } catch (error) {
    captureError = controlledError(error);
  }
  const admitted = correlationCases[0];
  const unknown = correlationCases[1];
  const unknownUpdate = correlationCases[2];
  const mismatchedCall = correlationCases[3];
  const missing = correlationCases[4];
  const drift = correlationCases[5];
  const updateDrift = correlationCases[6];
  const identityDrift = correlationCases[7];
  const duplicate = correlationCases[8];
  const writeAdmitted = writeCases[0];
  const writeSameArgs = writeCases[1];
  const writeUnknown = writeCases[2];
  const writeMissing = writeCases[3];
  const writeDuplicate = writeCases[4];
  const writeOutside = writeCases[5];
  const writeDrift = writeCases[6];
  const writeIdentity = writeCases[7];
  const admittedResult = admitted.command_results.at(-1);
  const singleTerminal = runCorrelation("single_terminal_selection", validStart, validUpdateA, validEndA);
  const terminalConsumer = commandObservation(singleTerminal, expectedCommand);
  const duplicateConsumer = commandObservation({ command_results: [...singleTerminal.command_results, singleTerminal.command_results.at(-1)] }, expectedCommand);
  const externalReceipt = { schema_version: 1, mode: "external", dry_run: true, status: "PLANNED", merge_target: "main", quality: { status: "PASS", legacy: false }, steps: EXTERNAL_PLAN_STEPS.map((step) => ({ step, status: "NOT_EXECUTED" })) };
  const externalReport = { ...passReport, result: { external: externalReceipt } };
  const externalStart = makeEvent({ command: expectedCommand, nestedType: "tool_execution_start", toolCallId: "call_offline_external|fc_offline_external" });
  const externalEnd = makeEvent({ nestedType: "tool_execution_end", toolCallId: "call_offline_external|fc_offline_external", report: externalReport });
  const externalNative = runCorrelation("external_receipt_terminal", externalStart, externalEnd);
  const externalAccepted = nativeExternalReceipt(externalNative);
  const externalStartOnly = nativeExternalReceipt({ command_results: [externalNative.command_results.at(-1)].map((item) => ({ ...item, phase: "update", nested_event_type: "tool_execution_update" })) });
  const rootRetroCases = (() => {
    const rootFixture = fs.mkdtempSync(path.join(os.tmpdir(), "native10-retro-offline-"));
    try {
      const protocolPath = path.join(rootFixture, "consumer-sources/retro/references/protocol.md");
      const artifactPath = path.join(rootFixture, NATIVE_RETRO_ARTIFACT);
      fs.mkdirSync(path.dirname(protocolPath), { recursive: true });
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
      fs.writeFileSync(protocolPath, "retro protocol\n");
      const evidenceBytes = Buffer.from("retro evidence\n", "utf8");
      const request = {
        schema_version: NATIVE_RETRO_ARTIFACT_SCHEMA,
        run_id: "offline-probe",
        owner: "ship",
        route: "full",
        delivery_report: ".omp/state/quality.json",
        evidence: [{ path: ".omp/state/native10-retro-evidence.txt", sha256: sha256Bytes(evidenceBytes) }],
        expected_context_digest: "b".repeat(64),
        requested: false,
        opt_out: true,
        first_pilot: false,
        significant_failure: false,
        significant_rework: false,
        user_unblock: false,
        analysis_dispatch: "none",
      };
      fs.writeFileSync(artifactPath, `${JSON.stringify(request)}\n`);
      const frame = (type, toolCallId, fields = {}) => ({ type, toolName: "write", toolCallId, ...fields });
      const session = new NativeRpcSession({ omp: "offline-probe", cwd: rootFixture, timeoutMs: 30_000, assignments: [], logicalRunId: "offline-probe", label: "native-retro-offline", rootWritePolicy: { tool: "write", path: artifactPath } });
      session.recordTool({ type: "tool_execution_start", toolName: "read", toolCallId: "read|fc_retro_policy", args: { path: protocolPath } });
      session.recordTool(frame("tool_execution_start", "write|fc_retro", { args: { path: artifactPath, content: JSON.stringify(request) } }));
      session.recordTool(frame("tool_execution_update", "write|fc_retro", { args: { path: artifactPath }, partialResult: { details: { resolvedPath: artifactPath } } }));
      session.recordTool(frame("tool_execution_end", "write|fc_retro", { result: { details: { resolvedPath: artifactPath } }, isError: false }));
      const accepted = inspectRootRetroArtifact(session.evidence, { project: rootFixture, logicalRunId: "offline-probe" });
      const summarize = (item) => ({ status: item?.status ?? null, failures: item?.failures ?? [], artifact_checks: item?.artifact_checks ?? null, artifact_sha256: item?.artifact_sha256 ?? null, policy_read_sequence: item?.policy_read_sequence ?? null, write_sequence: item?.write_sequence ?? null, write_phases: item?.root_writes?.map((entry) => entry.phase) ?? [] });
      const missingSignalSession = new NativeRpcSession({ omp: "offline-probe", cwd: rootFixture, timeoutMs: 30_000, assignments: [], logicalRunId: "offline-probe", label: "native-retro-offline-missing-signal", rootWritePolicy: { tool: "write", path: artifactPath } });
      let missingSignalError = null;
      try {
        missingSignalSession.recordTool(frame("tool_execution_start", "write|fc_missing", { args: { path: artifactPath, content: JSON.stringify(request) } }));
        missingSignalSession.recordTool(frame("tool_execution_end", "write|fc_missing", { result: { details: { resolvedPath: artifactPath } } }));
      } catch (error) {
        missingSignalError = controlledError(error);
      }
      const analyzer = inspectRootRetroArtifact({ ...session.evidence, task_calls: [{ assignments: [{ name: "RetroAnalyzer", agent: "retro" }] }] }, { project: rootFixture, logicalRunId: "offline-probe" });
      return { accepted: summarize(accepted), missing_signal_error: missingSignalError, analyzer_rejected: summarize(analyzer) };
    } finally {
      fs.rmSync(rootFixture, { recursive: true, force: true });
    }
  })();
  const guardReason = (item) => item?.error?.operational_guard?.reason_code ?? item?.command_results.at(-1)?.guard?.reason_code ?? null;
  const writeReason = (item) => item?.error?.operational_guard?.reason_code ?? item?.write_records?.at(-1)?.guard?.reason_code ?? null;
  const checks = {
    identity_mismatch: cases[0].reason_code === "VALIDATOR_IDENTITY_MISMATCH" && cases[0].identity_match === false && cases[0].command_match === true,
    command_mismatch: cases[1].reason_code === "VALIDATOR_COMMAND_MISMATCH" && cases[1].identity_match === true && cases[1].command_match === false,
    identity_and_command_mismatch: cases[2].reason_code === "VALIDATOR_IDENTITY_AND_COMMAND_MISMATCH" && cases[2].identity_match === false && cases[2].command_match === false,
    accepted_terminal_shape: cases[3].reason_code === null && cases[3].observed?.present === true && cases[3].exit_code_observed === false && cases[3].exit_code === null && cases[3].tool_error === false && cases[3].report_status === "PASSOU",
    missing_success_signal_rejected: missingSuccessSignal.tool_error_observed === false && missingSuccessSignal.tool_error === null,
    false_report_rejected: falseReport.tool_error === false && falseReport.report_status === "FALHOU",
    nonzero_success_rejected: nonzeroSuccess.tool_error === false && nonzeroSuccess.exit_code_observed === true && nonzeroSuccess.exit_code === 17,
    zero_error_rejected: zeroError.tool_error === true && zeroError.exit_code_observed === true && zeroError.exit_code === 0,
    write_admitted_correlated: writeAdmitted.error === null && writeAdmitted.pending_write_count === 0 && writeAdmitted.write_records.map((item) => item.phase).join(",") === "start,update,end" && writeAdmitted.write_records.at(-1)?.guard?.reason_code === null && writeAdmitted.write_records.at(-1)?.paths.includes(writePath) && writeAdmitted.write_records.at(-1)?.correlation?.tool_call_id.includes("|fc_"),
    write_same_args_allowed: writeSameArgs.error === null && writeSameArgs.pending_write_count === 0 && writeSameArgs.write_records.at(-1)?.guard?.reason_code === null,
    write_unknown_rejected: writeReason(writeUnknown) === "SPECKIT_WRITE_CORRELATION_UNKNOWN",
    write_missing_rejected: writeReason(writeMissing) === "SPECKIT_WRITE_CORRELATION_MISSING",
    write_duplicate_rejected: writeReason(writeDuplicate) === "SPECKIT_WRITE_CORRELATION_DUPLICATE",
    write_outside_rejected: writeOutside.error?.kind === "BLOCKED" && writeOutside.pending_write_count === 0 && writeOutside.write_records.length === 1 && writeOutside.write_records[0]?.phase === "start" && writeOutside.write_records[0]?.correlation?.status === "start" && writeOutside.write_records[0]?.requested_paths?.includes("../outside.txt") && writeOutside.write_records[0]?.observed_paths?.includes("../outside.txt") && writeOutside.write_records[0]?.guard?.paths_in_bounds === false && writeOutside.write_records[0]?.guard?.paths_in_allowlist === false && writeOutside.write_records[0]?.guard?.reason_code != null,
    write_path_drift_rejected: writeDrift.error?.kind === "BLOCKED" && writeDrift.pending_write_count === 1 && writeDrift.write_records.length === 2 && writeDrift.write_records[0]?.phase === "start" && writeDrift.write_records[1]?.phase === "update" && writeDrift.write_records[1]?.correlation?.status === "matched" && writeDrift.write_records[1]?.requested_paths?.includes(writePath) && writeDrift.write_records[1]?.observed_paths?.includes("docs/other.md") && writeDrift.write_records[1]?.paths?.includes("docs/other.md") && writeDrift.write_records[1]?.guard?.paths_in_allowlist === false && writeDrift.write_records[1]?.guard?.reason_code != null && !writeDrift.write_records.some((item) => item.phase === "end"),
    write_identity_rejected: writeReason(writeIdentity) === "SPECKIT_WRITE_IDENTITY_MISMATCH" || /unknown allocated id/i.test(writeIdentity.error?.message ?? ""),
    correlation_admitted_start_updates_end: admitted.error === null && admitted.command_results.length === 6 && admitted.command_results.map((item) => item.phase).join(",") === "start,start,update,update,end,end" && admitted.command_results[0].correlation.status === "start" && admitted.command_results[2].correlation.status === "matched" && admitted.command_results[2].observed === null && admitted.command_results[2].report === null && admitted.command_results[2].exit_code_observed === false && admittedResult?.correlation.status === "matched" && admittedResult.correlation.task_id === null && admittedResult.correlation.task_id_exposed === false && admittedResult.observed?.present === true && admittedResult.observed.source === "correlated_start" && admittedResult.exit_code === null && admittedResult.exit_code_observed === false && admittedResult.tool_error === false && admittedResult.report?.status === "PASSOU" && admitted.pending_call_count === 0,
    correlation_unknown_rejected: guardReason(unknown) === "VALIDATOR_COMMAND_CORRELATION_UNKNOWN",
    correlation_unknown_update_rejected: guardReason(unknownUpdate) === "VALIDATOR_COMMAND_CORRELATION_UNKNOWN",
    correlation_mismatched_call_id_rejected: guardReason(mismatchedCall) === "VALIDATOR_COMMAND_CORRELATION_UNKNOWN",
    correlation_missing_rejected: guardReason(missing) === "VALIDATOR_COMMAND_CORRELATION_MISSING",
    correlation_command_drift_rejected: guardReason(drift) === "VALIDATOR_COMMAND_MISMATCH",
    correlation_update_command_drift_rejected: guardReason(updateDrift) === "VALIDATOR_COMMAND_MISMATCH",
    correlation_identity_drift_rejected: guardReason(identityDrift) === "VALIDATOR_COMMAND_CORRELATION_IDENTITY_MISMATCH" || /unknown allocated id/i.test(identityDrift.error?.message ?? ""),
    correlation_duplicate_rejected: guardReason(duplicate) === "VALIDATOR_COMMAND_CORRELATION_DUPLICATE",
    consumer_terminal_selection: terminalConsumer?.phase === "end" && terminalConsumer?.nested_event_type === "tool_execution_end" && terminalConsumer?.exit_code === null && terminalConsumer?.exit_code_observed === false && terminalConsumer?.tool_error === false && terminalConsumer?.report?.status === "PASSOU" && !terminalConsumer?.selection_error && duplicateConsumer?.selection_error === "VALIDATOR_COMMAND_END_DUPLICATE" && duplicateConsumer?.observed === null,
    external_receipt_requires_correlated_end: externalAccepted.status === "PASS" && externalStartOnly.status === "PENDING_NATIVE",
    requested_is_not_observed: requestedOnly?.observed === null && requestedOnly?.command_sha256 === null && requestedOnly?.exit_code_observed === false && requestedOnly?.requested?.sha256 === commandShape(expectedCommand).sha256,
    root_retro_admitted_correlated: rootRetroCases.accepted.status === "PASS" && rootRetroCases.accepted.write_phases.join(",") === "start,update,end" && SHA256.test(rootRetroCases.accepted.artifact_sha256 ?? ""),
    root_retro_missing_error_signal_rejected: rootRetroCases.missing_signal_error?.operational_guard?.guard?.reason_code === "ROOT_RETRO_WRITE_ERROR_SIGNAL_MISSING",
    root_retro_analyzer_dispatch_rejected: rootRetroCases.analyzer_rejected.status === "PENDING" && rootRetroCases.analyzer_rejected.failures.some((item) => item.includes("analyzer/retro")),
    capture_bound: captureError?.reason_code === "CAPTURE_BOUND" && captureSession.evidence.capture.complete === false,
  };
  return { status: Object.values(checks).every(Boolean) ? "PASS" : "BLOCKED", native: false, evidence_level: "offline-harness-guard-shapes-only", cases, correlation_cases: correlationCases, write_cases: writeCases, root_retro_cases: rootRetroCases, consumer_selection: { single_terminal: terminalConsumer, duplicate_terminal: duplicateConsumer }, external_receipt_guard: { accepted: externalAccepted, nonterminal_rejected: externalStartOnly }, requested_only: requestedOnly ? { requested: requestedOnly.requested, invocation: requestedOnly.invocation, observed: requestedOnly.observed, command_sha256: requestedOnly.command_sha256, exit_code_observed: requestedOnly.exit_code_observed } : null, capture_bound: { error: captureError, complete: captureSession.evidence.capture.complete, bytes: captureSession.evidence.capture.bytes }, checks };
}







function fullToolCallId(value, keys, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidates = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const candidate = value[key];
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate !== "string") blocked(`tool call identity alias ${key} was not an exact string`);
    candidates.push(captureSafeIdentifier(candidate, `tool call identity.${key}`));
  }
  // Tool-call identity is SDK metadata only. Application payloads and tool
  // arguments/results are deliberately not searched for authority-bearing IDs.
  for (const key of ["event", "payload"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = fullToolCallId(value[key], keys, depth + 1);
    if (found !== null) candidates.push(found);
  }
  if (candidates.length > 1 && candidates.some((candidate) => candidate !== candidates[0])) blocked("tool call identity aliases contradicted one another");
  return candidates[0] ?? null;
}

function hostDerivedDomainIds(rootSession, parentToolCallId, allocatedId, index) {
  if (!rootSession || !parentToolCallId || !allocatedId || !Number.isSafeInteger(index)) return { job_id: null, instance_id: null, provenance: null };
  const seed = `${rootSession}\u001f${parentToolCallId}\u001f${allocatedId}\u001f${index}`;
  const digestValue = sha256Text(seed).slice(0, 32);
  return {
    job_id: `host-derived:job:${digestValue}`,
    instance_id: `host-derived:instance:${digestValue}`,
    provenance: "host-derived-root-session-parent-tool-call-allocated-index",
  };
}

function boundedPublicAssistant(value, depth = 0) {
  if (depth > 4) return "<depth-limited>";
  if (typeof value === "string") return scrub(value, 8192);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => boundedPublicAssistant(item, depth + 1));
  if (!value || typeof value !== "object") return null;
  const allowed = new Set(["request_id", "requestId", "run_id", "runId", "step", "verdict", "status", "outcome", "signals", "alignment", "checkpoint", "target_path", "targetPath", "root_session", "route", "mode", "content", "text", "type"]);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveKey(key) || !allowed.has(key)) continue;
    result[key] = boundedPublicAssistant(item, depth + 1);
  }
  return result;
}

function observeSourceDerivedCapture({ fixture, assignments, label, frames = [], stateResponse, stateRequestId = "source-derived-get-state", promptRequestId, timeoutMs = 30_000, rootWritePolicy = null }) {
  const session = new NativeRpcSession({ omp: process.execPath, cwd: fixture.project, timeoutMs, assignments, logicalRunId: fixture.logicalRunId, label, rootWritePolicy });
  try {
    session.bindSourceHost(stateResponse, stateRequestId, promptRequestId);
    for (const frame of frames) {
      if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new ProbeError("BLOCKED", "source-derived frame must be an object");
      session.consumeLogical(frame);
    }
    if (!session.evidence.terminal?.prompt_result) throw new ProbeError("BLOCKED", "source-derived capture omitted prompt_result");
    if (!session.evidence.terminal?.agent_end) throw new ProbeError("BLOCKED", "source-derived capture omitted agent_end");
    if (session.evidence.terminal?.session_settled !== true) throw new ProbeError("BLOCKED", "source-derived capture omitted session_settled");
    if (![...session.rootTaskCalls.values()].filter((item) => item.kind === "dispatch").every((item) => item.ended === true)) throw new ProbeError("BLOCKED", "source-derived dispatched root task had no correlated END");
    return { ...session.evidence, source_derived: true, native: false, evidence_level: "SOURCE_DERIVED_HOST_ADAPTER", native_process_count: 0, origin: { kind: "source-derived-host-observer", source: "source-faithful-wire", process_observed: false, native_rpc: false, source_binding: true, process_count: 0 } };
  } catch (error) {
    return { ...failedNativeObservation(session, error), source_derived: true, native: false, evidence_level: "SOURCE_DERIVED_HOST_ADAPTER", native_process_count: 0, origin: { kind: "source-derived-host-observer", source: "source-faithful-wire", process_observed: false, native_rpc: false, source_binding: true, process_count: 0 } };
  }
}

function alignmentRootCommandPolicy(project, fixture, definition, step, namespace, parent, helper) {
  const root = alignmentRootPath(project, fixture, definition);
  const intentPath = path.join(project, ".omp/state/native-tooling", `alignment-intent-${namespace}-${step}.json`);
  const intent = alignmentIntent(project, fixture, definition, step, parent);
  const command = `"${process.execPath}" "${helper.path}"`;
  const rootCommandPolicy = {
    kind: "alignment-lab-checkpoint-helper-v1",
    command,
    cwd: project,
    executable: { path: process.execPath, sha256: sha256Bytes(fs.readFileSync(process.execPath)) },
    script: { path: helper.path, sha256: helper.sha256 },
    intent: { path: intentPath, max_bytes: 16 * 1024 },
  };
  return {
    source: "host-constructor-control",
    paths: [intentPath],
    rootCommandPolicy,
    intentPath,
    intentPayload: intent,
  };
}

function executeAlignmentHelper(project, policy) {
  const intentBytes = Buffer.from(`${JSON.stringify(policy.intentPayload)}
`, "utf8");
  writePrivate(policy.intentPath, intentBytes, project, "Root alignment intent");
  const child = spawnSync(policy.rootCommandPolicy.executable.path, [policy.rootCommandPolicy.script.path], { cwd: policy.rootCommandPolicy.cwd, shell: false, windowsHide: true, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 });
  const rawStdout = String(child.stdout ?? "");
  let result = null;
  try { result = JSON.parse(rawStdout.trim()); } catch {}
  if (child.error || child.status !== 0 || result?.code !== "ALIGNMENT_CHECKPOINT_PUBLISHED" || !result?.record || !["CLOSED", "BLOCKED"].includes(result.status) || result.status !== result.record.status || result.transaction !== true || !result.path) throw new ProbeError("BLOCKED", "protected alignment helper did not publish an accepted checkpoint", { status: child.status, result, raw_stdout: rawStdout, stderr: String(child.stderr ?? "") });
  return { path: result.path, sha256: result.sha256, record: result.record, result, raw_stdout: rawStdout };
}



function sourceDerivedCaptureProvider({ fixture, assignments, label, rootWritePolicy }) {
  const routeDefinition = fixture?.routeDefinition;
  if (routeDefinition) {
    const step = fixture.routeStep;
    const input = sourceDerivedRouteCaptureInput(routeDefinition, fixture.project, fixture.routeHostArtifacts?.collisionTarget ?? null, step, fixture.routeHostArtifacts);
    if (!input) throw new ProbeError("BLOCKED", `source-derived route capture input missing for ${label}`);
    return observeSourceDerivedCapture({ fixture, assignments, label, frames: input.frames, stateResponse: input.stateResponse, promptRequestId: input.promptRequestId, rootWritePolicy });
  }
  const retryDefinition = fixture?.retryDefinition;
  if (retryDefinition) return sourceDerivedRetryCaptureInput({ fixture, assignments, label, definition: retryDefinition });
  throw new ProbeError("BLOCKED", `source-derived capture context missing for ${label}`);
}

function alignmentRootPath(project, fixture, definition) {
  if (definition.mode === "git") return path.resolve(project, fixture.git?.commonDir ?? ".git", "alignment");
  return path.join(project, ".omp/state/alignment");
}

function alignmentIntent(project, fixture, definition, step, parent) {
  const root = alignmentRootPath(project, fixture, definition);
  const response = step === "resume" ? { round: 1, question_id: "q-material-frontier", question: "Which bounded route response is resolved?", answer: "The private source and package bindings remain unchanged." } : null;
  return {
    schema: "alignment-checkpoint-intent/v1",
    checkpoint: "alignment",
    root,
    mode: definition.mode,
    route: definition.route,
    step,
    parent: parent ? { path: path.relative(project, parent.path).replaceAll("\\", "/"), sha256: parent.sha256 ?? sha256Bytes(fs.readFileSync(parent.path)) } : null,
    response,
  };
}

function writeNativeAlignmentHelper(project) {
  const helperPath = path.join(project, ".omp/state/native-tooling/alignment-checkpoint.mjs");
  const transactionPath = path.join(project, ".omp/skills/tdd-orchestrator/lib/fs-transaction/index.mjs");
  regular(transactionPath, "private fs transaction source");
  const transactionSha256 = sha256Bytes(fs.readFileSync(transactionPath));
  const transactionImport = JSON.stringify(pathToFileURL(transactionPath).href);
  const helper = [
    "#!/usr/bin/env node",
    "import fs from \"node:fs\";",
    "import path from \"node:path\";",
    "import { createHash, randomUUID } from \"node:crypto\";",
    `const TRANSACTION_SHA256 = ${JSON.stringify(transactionSha256)};`,
    `const TRANSACTION_URL = ${transactionImport};`,
    "const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;",
    "const SHA256 = /^[a-f0-9]{64}$/i;",
    "const canonical = (value) => value === null || typeof value !== \"object\" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(\",\")}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(\",\")}}`;",
    "const digest = (value) => createHash(\"sha256\").update(canonical(value)).digest(\"hex\");",
    "const fail = (reason) => { process.stdout.write(JSON.stringify({ status: \"BLOCKED\", code: \"ALIGNMENT_CHECKPOINT_BLOCKED\", failure_origin: \"alignment-helper\", reason }, null, 2) + \"\\n\"); process.exitCode = 2; };",
    "try {",
    "  const project = path.resolve(process.cwd());",
    "  const intentDir = path.join(project, \".omp/state/native-tooling\");",
    "  const candidates = fs.readdirSync(intentDir).filter((name) => /^alignment-intent-[^/]+\\.json$/u.test(name) && !fs.existsSync(path.join(intentDir, `${name}.consumed`))).map((name) => { const stat = fs.lstatSync(path.join(intentDir, name)); return { name, stat, mtime: stat.mtimeNs }; }).filter((item) => item.stat.isFile() && !item.stat.isSymbolicLink() && item.stat.nlink === 1 && item.stat.size <= 16384).sort((left, right) => (right.mtime > left.mtime ? 1 : right.mtime < left.mtime ? -1 : 0));",
    "  if (candidates.length !== 1) throw new Error(\"exactly one pending regular alignment intent is required\");",
    "  const intentPath = path.join(intentDir, candidates[0].name);",
    "  const intentStat = fs.lstatSync(intentPath);",
    "  if (!intentStat.isFile() || intentStat.isSymbolicLink() || intentStat.nlink !== 1 || intentStat.size > 16384) throw new Error(\"alignment intent identity is unsafe\");",
    "  const intentBytes = fs.readFileSync(intentPath);",
    "  const intentHash = createHash(\"sha256\").update(intentBytes).digest(\"hex\");",
    "  const intent = JSON.parse(intentBytes.toString(\"utf8\"));",
    "  const expectedKeys = [\"schema\", \"checkpoint\", \"root\", \"mode\", \"route\", \"step\", \"parent\", \"response\"];",
    "  if (!intent || JSON.stringify(Object.keys(intent).sort()) !== JSON.stringify(expectedKeys.sort()) || intent.schema !== \"alignment-checkpoint-intent/v1\" || intent.checkpoint !== \"alignment\" || !path.isAbsolute(intent.root) || ![\"git\", \"local\"].includes(intent.mode) || ![\"short\", \"full\"].includes(intent.route) || ![\"initial\", \"resume\"].includes(intent.step)) throw new Error(\"intent schema mismatch\");",
    "  const rootPath = path.resolve(intent.root);",
    "  if (!(rootPath === project || rootPath.startsWith(`${project}${path.sep}`))) throw new Error(\"alignment root escaped private project\");",
    "  const transactionBytes = fs.readFileSync(new URL(TRANSACTION_URL));",
    "  if (!SHA256.test(TRANSACTION_SHA256) || createHash(\"sha256\").update(transactionBytes).digest(\"hex\") !== TRANSACTION_SHA256) throw new Error(\"transaction source binding unavailable\");",
    "  const { transact } = await import(TRANSACTION_URL);",
    "  const { mode, route, step } = intent;",
    "  const parent = intent.parent;",
    "  let requestId = randomUUID();",
    "  let runId = randomUUID();",
    "  let parentPath = null;",
    "  let parentSha256 = null;",
    "  if (step === \"resume\") {",
    "    if (!parent || typeof parent.path !== \"string\" || !SHA256.test(String(parent.sha256 ?? \"\"))) throw new Error(\"resume parent descriptor missing\");",
    "    parentPath = path.resolve(project, parent.path);",
    "    const parentStat = fs.lstatSync(parentPath);",
    "    if (!parentStat.isFile() || parentStat.isSymbolicLink() || parentStat.nlink !== 1) throw new Error(\"resume parent is not private regular\");",
    "    const parentBytes = fs.readFileSync(parentPath);",
    "    parentSha256 = createHash(\"sha256\").update(parentBytes).digest(\"hex\");",
    "    if (parentSha256 !== parent.sha256) throw new Error(\"resume parent hash changed\");",
    "    const parentRecord = JSON.parse(parentBytes.toString(\"utf8\"));",
    "    if (path.basename(parentPath) !== \"checkpoint-000000.json\" || parentRecord.checkpoint !== \"alignment\" || parentRecord.mode !== mode || parentRecord.route !== route || parentRecord.status !== \"BLOCKED\" || !UUID_V4.test(parentRecord.request_id) || !UUID_V4.test(parentRecord.run_id) || parentRecord.request_digest !== `sha256:${digest(JSON.parse(parentRecord.request_canonical))}`) throw new Error(\"resume parent chain invalid\");",
    "    requestId = parentRecord.request_id;",
    "    runId = parentRecord.run_id;",
    "  } else if (parent !== null) throw new Error(\"initial checkpoint cannot declare parent\");",
    "  const response = step === \"resume\" ? intent.response : null;",
    "  if (step === \"resume\" && (!response || typeof response !== \"object\")) throw new Error(\"resume response missing\");",
    "  const frontier = step === \"initial\" && route === \"full\" ? [\"decision:pending\"] : [];",
    "  const request = { checkpoint: \"alignment\", mode, route, request_id: requestId, run_id: runId, step, frontier, response: response?.answer ?? null };",
    "  const requestCanonical = canonical(request);",
    "  const record = { checkpoint: \"alignment\", request_id: requestId, run_id: runId, request_canonical: requestCanonical, request_digest: `sha256:${digest(request)}`, frontier, responses: response ? [response] : [], history: response ? [response] : [], closure: route === \"short\" ? \"fully-specified-fast-close\" : step === \"initial\" ? \"material-frontier-preserved\" : \"fully-specified\", closureRecorded: route === \"short\" || step === \"resume\", reason: \"Root-authorized protected alignment checkpoint\", status: step === \"initial\" && route === \"full\" ? \"BLOCKED\" : \"CLOSED\", mode, requested_mode: mode, resolved_mode: mode, route };",
    "  if (parentPath) { record.parent_path = parentPath; record.parent_sha256 = parentSha256; }",
    "  const namespace = path.join(rootPath, requestId, runId);",
    "  const file = path.join(namespace, step === \"initial\" ? \"checkpoint-000000.json\" : \"checkpoint-000001.json\");",
    "  const operations = [];",
    "  for (const directory of [rootPath, path.join(rootPath, requestId), namespace]) if (!fs.existsSync(directory)) operations.push({ target: directory, directory: true, expectedTarget: { exists: false } });",
    "  operations.push({ target: file, content: Buffer.from(`${JSON.stringify(record, null, 2)}\\n`, \"utf8\"), expectedTarget: { exists: false }, retainBackup: false });",
    "  const result = transact(operations, { home: project });",
    "  const bytes = fs.readFileSync(file);",
    "  const currentIntentStat = fs.lstatSync(intentPath);",
    "  const currentIntentHash = createHash(\"sha256\").update(fs.readFileSync(intentPath)).digest(\"hex\");",
    "  if (!currentIntentStat.isFile() || currentIntentStat.isSymbolicLink() || currentIntentStat.nlink !== 1 || currentIntentStat.dev !== intentStat.dev || currentIntentStat.ino !== intentStat.ino || currentIntentStat.size > 16384 || currentIntentHash !== intentHash) throw new Error(\"alignment intent changed during helper execution\");",
    "  const markerPath = `${intentPath}.consumed`;",
    "  const marker = transact([{ target: markerPath, content: Buffer.from(JSON.stringify({ intent_path: intentPath, intent_sha256: intentHash, checkpoint_path: file, checkpoint_sha256: createHash(\"sha256\").update(bytes).digest(\"hex\") }) + \"\\n\", \"utf8\"), expectedTarget: { exists: false }, retainBackup: false }], { home: project });",
    "  if (marker?.ok !== true) throw new Error(\"checkpoint consumption marker was not durably admitted\");",
    "  process.stdout.write(JSON.stringify({ status: record.status, code: \"ALIGNMENT_CHECKPOINT_PUBLISHED\", path: file, record, sha256: createHash(\"sha256\").update(bytes).digest(\"hex\"), transaction: result?.ok === true }, null, 2) + \"\\n\");",
    "} catch (error) { fail(error?.message ?? \"protected checkpoint helper failed\"); }",
  ].join("\n") + "\n";
  const written = atomicWrite(helperPath, helper, project, "protected alignment helper");
  return { path: written.path, sha256: written.sha256, transactionPath, transactionSha256 };
}


function sourceDerivedRouteCaptureInput(definition, project, collisionTarget, step, routeHostArtifacts) {
  const stepDefinition = definition.steps?.[step];
  if (!stepDefinition) return null;
  const rootSession = "source-derived-route:" + randomUUID();
  const promptRequestId = randomUUID();
  const stateRequestId = "source-derived-get-state";
  const frames = [];
  const resolveRead = (value) => {
    const relative = String(value).replaceAll("\\", "/");
    if (relative.startsWith("alignment/agents/")) return path.join(project, ".omp/agents", relative.slice("alignment/agents/".length));
    if (relative.startsWith("alignment/") || relative.startsWith("deep-review/")) return path.join(project, ".omp/skills", relative);
    return path.resolve(project, relative);
  };
  const read = (value, allocatedId = null) => {
    const file = resolveRead(value);
    regular(file, "source-derived route read");
    const bytes = fs.readFileSync(file);
    const toolCallId = "source-derived-read:" + randomUUID();
    const emit = (event) => frames.push(allocatedId === null ? event : { type: "subagent_event", payload: { id: allocatedId, event } });
    emit({ type: "tool_execution_start", toolName: "read", toolCallId, args: { path: file } });
    emit({ type: "tool_execution_end", toolName: "read", toolCallId, isError: false, result: { content: [{ type: "text", text: bytes.toString("utf8") }] } });
    return { path: value, sha256: sha256Bytes(bytes) };
  };
  for (const file of definition.requiredReads.root) read(file);
  const taskDescriptorPath = path.join(project, NATIVE_ROUTE_ARTIFACT_ROOT, `task-${step}.json`);
  regular(taskDescriptorPath, "source-derived route task descriptor");
  const taskDescriptorRelative = path.relative(project, taskDescriptorPath).replaceAll("\\", "/");
  if (!definition.requiredReads.root.includes(taskDescriptorRelative)) read(taskDescriptorRelative);
  if (step === "collision") {
    const target = collisionTarget ?? routeHostArtifacts?.collisionTarget;
    if (!target) throw new ProbeError("BLOCKED", "source-derived collision target is absent");
    read(target);
    let corrupt = false;
    try { JSON.parse(fs.readFileSync(target, "utf8")); } catch (error) { if (error instanceof SyntaxError) corrupt = true; else throw error; }
    if (!corrupt) throw new ProbeError("BLOCKED", "source-derived collision target is not malformed JSON");
    const parent = routeHostArtifacts.checkpointResume?.record;
    const document = { verdict: "BLOCKED", request_id: parent?.request_id ?? null, run_id: parent?.run_id ?? null, step, root_session: rootSession, target_path: path.relative(project, target).replaceAll("\\", "/"), signals: { alignment: true, checkpoint: true } };
    frames.push({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify(document) }], stopReason: "stop" } });
  } else {
    const dispatchId = "source-derived-dispatch:" + randomUUID();
    const allocatedId = "source-derived-child:" + randomUUID();
    const task = stepDefinition.task;
    frames.push({ type: "tool_execution_start", toolName: "task", toolCallId: dispatchId, args: { context: "Bounded source-derived private route observation.", tasks: [{ name: task.name, agent: task.agent, task: task.task, solutionSpace: task.solutionSpace }] } });
    frames.push({ type: "subagent_lifecycle", payload: { id: allocatedId, index: 0, agent: "requirements-reader", agentSource: "project", parentToolCallId: dispatchId, status: "started" } });
    const started = performance.now();
    read(taskDescriptorRelative, allocatedId);
    const sources = definition.requiredReads.requirements_reader.map((file) => read(file, allocatedId));
    const data = { protocol: "REQUIREMENTS_READING_V1", role: "requirements-reader", instance_id: rootSession + ":" + task.name, run_id: definition.binding.run_id, source_revision: definition.binding.revision, context_digest: routeHostArtifacts.readerContext.context_digest, sources, status: "COMPLETE", limitations: ["Source-derived private I/O; no SDK or model invocation."], next_action: "Use the protected checkpoint helper.", paraphrase: "Read the current private installed alignment sources.", success_criteria: [], scenarios_and_limits: [], ambiguities: [] };
    const result = { id: allocatedId, index: 0, agent: "requirements-reader", agentSource: "project", task: `Complete assignment thoroughly:\n\n${task.task}`, assignment: task.task.trim(), exitCode: 0, output: JSON.stringify(data), stderr: "", truncated: false, durationMs: performance.now() - started, tokens: 0, requests: 0 };
    result.structuredOutput = { source: "agent", mode: "permissive", status: "valid", data };
    frames.push({ type: "subagent_lifecycle", payload: { id: allocatedId, index: 0, agent: "requirements-reader", agentSource: "project", parentToolCallId: dispatchId, status: "completed" } });
    frames.push({ type: "tool_execution_end", toolName: "task", toolCallId: dispatchId, isError: false, result: { content: [{ type: "text", text: result.output }], details: { results: [result] } } });
    const policy = routeHostArtifacts?.lastRootPolicy;
    const helper = routeHostArtifacts?.lastHelperResult;
    if (!policy || !helper?.raw_stdout) throw new ProbeError("BLOCKED", "source-derived protected helper result is absent");
    const writeCallId = "source-derived-intent:" + randomUUID();
    frames.push({ type: "tool_execution_start", toolName: "write", toolCallId: writeCallId, args: { path: policy.intentPath, content: JSON.stringify(policy.intentPayload) } });
    frames.push({ type: "tool_execution_end", toolName: "write", toolCallId: writeCallId, isError: false, result: { content: [{ type: "text", text: "Intent retained." }], details: { resolvedPath: policy.intentPath } } });
    const commandCallId = "source-derived-helper:" + randomUUID();
    frames.push({ type: "tool_execution_start", toolName: "bash", toolCallId: commandCallId, args: { command: policy.rootCommandPolicy.command } });
    frames.push({ type: "tool_execution_end", toolName: "bash", toolCallId: commandCallId, isError: false, result: { content: [{ type: "text", text: helper.raw_stdout }] } });
  }
  frames.push({ type: "agent_end", isTerminal: true, yielded: false });
  frames.push({ type: "prompt_result", id: promptRequestId, status: "completed", agentInvoked: true });
  frames.push({ type: "session_settled" });
  return { frames, stateResponse: { id: stateRequestId, type: "response", command: "get_state", success: true, data: { sessionId: rootSession } }, promptRequestId };
}



function writeRouteCasReceipt(project, host, definition, checkpointAInitial, checkpointAResume, checkpointBInitial, checkpointBResume) {
  if (!checkpointAInitial?.path || !checkpointAResume?.path || !checkpointBInitial?.path || !checkpointBResume?.path || !host.collisionTarget || !host.collisionBefore?.path || !host.collisionAfter?.path) return host;
  const checkpointRecord = (checkpoint) => checkpoint.record ?? JSON.parse(fs.readFileSync(checkpoint.path, "utf8"));
  const snapshot = (checkpoint, label) => {
    const before = host.casBeforeSnapshots?.[label];
    if (!before || !samePath(before.checkpoint_path, checkpoint.path)) throw new ProbeError("BLOCKED", "CAS receipt lacks its real pre-phase snapshot", { label });
    regular(checkpoint.path, "CAS checkpoint after subsequent Root phases");
    const bytes = fs.readFileSync(checkpoint.path);
    const after = atomicWrite(path.join(host.root, "cas", label + "-after.json"), bytes, project, label + " post-phase snapshot");
    return { path: checkpoint.path, before_path: before.path, after_path: path.relative(project, after.path).replaceAll("\\", "/"), sha256_before: before.sha256, sha256_after: after.sha256 };
  };
  const namespace = (label, initial, resume) => {
    const checkpoints = [snapshot(initial, label.toLowerCase() + "-initial"), snapshot(resume, label.toLowerCase() + "-resume")];
    return { label, request_id: checkpointRecord(initial).request_id, run_id: checkpointRecord(initial).run_id, parent_unchanged: checkpoints.every((item) => item.sha256_before === item.sha256_after), checkpoints };
  };
  const namespaces = [namespace("A", checkpointAInitial, checkpointAResume), namespace("B", checkpointBInitial, checkpointBResume)];
  const preserved = namespaces.every((item) => item.parent_unchanged);
  const gitReceipt = JSON.parse(fs.readFileSync(path.join(project, NATIVE_ROUTE_ARTIFACT_ROOT, "git-receipt.json"), "utf8"));
  const capture = host.collisionCapture;
  const message = capture?.terminal?.last_message;
  const content = message?.content;
  const texts = typeof content === "string" ? [content] : Array.isArray(content) ? content.filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => item.text) : typeof message?.text === "string" ? [message.text] : [];
  let document = null;
  for (const text of texts) {
    try { const value = JSON.parse(text); if (value && typeof value === "object" && !Array.isArray(value)) { document = value; break; } } catch {}
  }
  const target = host.collisionTarget;
  const observedReadPaths = (capture?.tool_events ?? []).filter((event) => event.type === "tool_execution_start" && /^(read|grep|glob)$/i.test(event.tool)).flatMap((event) => event.paths ?? []).filter((file) => samePath(path.resolve(project, file), target));
  const value = {
    run_id: definition.binding.run_id,
    revision: definition.binding.revision,
    nonce: definition.binding.nonce,
    common_dir: gitReceipt.common_dir,
    namespaces,
    cross_resume_preserved: preserved,
    collision: { target_path: path.relative(project, target).replaceAll("\\", "/"), before_path: host.collisionBefore.path, after_path: host.collisionAfter.path, terminal_status: typeof (document?.verdict ?? document?.status) === "string" ? (document.verdict ?? document.status).toUpperCase() : null, observed_read_paths: observedReadPaths, existing_records_unchanged: preserved },
  };
  const written = atomicWrite(path.join(host.root, "cas-receipt.json"), JSON.stringify(value, null, 2) + "\n", project, "route CAS receipt");
  host.casReceipt = { path: path.relative(project, written.path).replaceAll("\\", "/"), bytes: written.bytes, sha256: written.sha256 };
  return host;
}


function parseRetryValidatorRun(definition) {
  const startedAt = Date.now();
  const child = spawnSync(process.execPath, [definition.paths.validator], { cwd: definition.cwd, shell: false, windowsHide: true, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 });
  const stdout = String(child.stdout ?? "");
  const stderr = String(child.stderr ?? "");
  let report = null;
  try {
    const value = JSON.parse(stdout.trim());
    if (value && typeof value === "object" && !Array.isArray(value)) report = value;
  } catch {}
  return { child, report, stdout, stderr, durationMs: Date.now() - startedAt };
}


function sourceDerivedRetryCaptureInput({ fixture, assignments, label, definition }) {
  const state = fixture.retryCaptureState ?? (fixture.retryCaptureState = { repairApplied: false, review: null });
  const assignment = assignments[0] ?? {};
  const peer = label === "native09-technical-retry-peer-review";
  const attempt = label.endsWith("-second") ? 2 : 1;
  const rootSession = `source-derived-host:${randomUUID()}`;
  const stateRequestId = `source-derived-state:${randomUUID()}`;
  const promptRequestId = `source-derived-prompt:${randomUUID()}`;
  const rootToolCallId = `fullcall_root_${randomUUID()}|fc_root_${randomUUID()}`;
  const allocatedId = `allocated_child_${randomUUID()}|fc_child_${randomUUID()}`;
  const validatorToolCallId = `fullcall_validator_${randomUUID()}|fc_validator_${randomUUID()}`;
  const repairBeforeValidatorToolCallId = `fullcall_validator_before_${randomUUID()}|fc_validator_before_${randomUUID()}`;
  const repairAfterValidatorToolCallId = `fullcall_validator_after_${randomUUID()}|fc_validator_after_${randomUUID()}`;
  let report = null;
  let run = null;
  let repairRuns = null;
  let exitCode = null;
  let isError = false;
  let role = assignment.agent ?? "validator";
  let readPath = null;
  let peerSubjectBinding = null;
  let subjectHashBefore = null;
  let subjectHashAfter = null;
  if (label.endsWith("-first") || label.endsWith("-second")) {
    run = parseRetryValidatorRun(definition);
    report = run.report;
    exitCode = Number.isInteger(run.child.status) ? run.child.status : null;
    isError = run.child.error ? true : exitCode !== 0;
    subjectHashAfter = sha256Bytes(fs.readFileSync(definition.paths.subject));
  } else if (label.endsWith("-repair")) {
    const original = fs.readFileSync(definition.paths.subject, "utf8");
    const defect = "|| (command === 'capture' && (reportPath || contextPath))";
    const repair = "|| (command === 'capture' && (reportPath !== undefined || contextPath !== undefined))";
    if (!original.includes(defect) || original.split(defect).length - 1 !== 1) throw new ProbeError("BLOCKED", "source-derived repair requires the exact original CLI arity defect");
    role = assignment.agent ?? "backend-developer";
    readPath = definition.paths.subject_relative;
    subjectHashBefore = sha256Bytes(Buffer.from(original, "utf8"));
    const beforeRun = parseRetryValidatorRun(definition);
    fs.writeFileSync(definition.paths.subject, original.replace(defect, repair), { flag: "w" });
    state.repairApplied = true;
    subjectHashAfter = sha256Bytes(fs.readFileSync(definition.paths.subject));
    state.repair = { before: subjectHashBefore, after: subjectHashAfter };
    const afterRun = parseRetryValidatorRun(definition);
    repairRuns = { before: beforeRun, after: afterRun };
    run = afterRun;
    report = afterRun.report;
    exitCode = Number.isInteger(afterRun.child.status) ? afterRun.child.status : null;
    isError = afterRun.child.error ? true : exitCode !== 0;
  } else if (peer) {
    const subjectHash = sha256Bytes(fs.readFileSync(definition.paths.subject));
    const review = {
      protocol_mode: "TDD_PEER_REVIEW",
      agent: "peer-reviewer",
      status: "APROVADO",
      reviewed_revision: definition.revision,
      explanation: "Private subject was read after the allowlisted repair and matches the current revision.",
      confidence: 0.99,
      overall_correctness: "correct",
      findings: [],
    };
    state.review = review;
    state.peerSubjectSha256 = subjectHash;
    peerSubjectBinding = {
      source: "SOURCE_DERIVED_HOST_BYTE_BINDING",
      path: definition.paths.subject_relative,
      sha256: subjectHash,
      revision: definition.revision,
      independent: true,
    };
    role = "peer-reviewer";
    readPath = definition.paths.subject_relative;
    report = review;
  }
  const taskDurationMs = repairRuns
    ? repairRuns.before.durationMs + repairRuns.after.durationMs
    : run?.durationMs ?? 0;
  const taskProgress = {
    index: 0, id: allocatedId, agent: role, agentSource: "project",
    status: "running", task: assignment.task, assignment: assignment.name,
    recentTools: [], recentOutput: [], toolCount: 0, requests: 0,
    tokens: 0, cost: 0, durationMs: taskDurationMs,
  };
  const asyncJobId = `source-derived-sdk-job:${randomUUID()}`;
  const asyncJob = {
    jobId: asyncJobId, type: "task", status: "completed",
    agentId: allocatedId, durationMs: taskDurationMs,
    schema: peer
      ? { source: "agent", mode: "strict", status: "valid", data: report }
      : { source: "none", mode: "permissive", status: "unavailable" },
  };
  const frames = [
    { type: "tool_execution_start", toolName: "task", toolCallId: rootToolCallId, args: { context: "Bounded source-derived private technical retry observation.", tasks: [assignment] } },
    { type: "subagent_lifecycle", payload: { id: allocatedId, index: 0, agent: role, agentSource: "project", parentToolCallId: rootToolCallId, status: "started" } },
  ];
  if (readPath) {
    const readFile = path.isAbsolute(readPath) ? readPath : path.resolve(definition.cwd, readPath);
    regular(readFile, "source-derived technical-retry read");
    const readBytes = fs.readFileSync(readFile);
    const readCallId = `fullcall_read_${randomUUID()}|fc_read_${randomUUID()}`;
    frames.push({ type: "subagent_event", payload: { id: allocatedId, event: { type: "tool_execution_start", toolName: "read", toolCallId: readCallId, args: { path: readPath } } } });
    frames.push({ type: "subagent_event", payload: { id: allocatedId, event: { type: "tool_execution_end", toolName: "read", toolCallId: readCallId, isError: false, result: { content: [{ type: "text", text: readBytes.toString("utf8") }], details: { resolvedPath: readPath } } } } });
  }
  const appendValidatorCommand = (observedRun, toolCallId) => {
    const observedExitCode = Number.isInteger(observedRun?.child?.status) ? observedRun.child.status : null;
    const observedIsError = observedRun?.child?.error ? true : observedExitCode !== 0;
    const output = observedRun?.stdout ?? "";
    const footer = Number.isInteger(observedExitCode) && observedExitCode !== 0
      ? `\n\nCommand exited with code ${observedExitCode}`
      : "\n\nWall time: 0.00 seconds";
    const nestedEnd = {
      type: "tool_execution_end",
      toolName: "bash",
      toolCallId,
      isError: observedIsError,
      result: {
        content: [{ type: "text", text: `${output}${footer}` }],
        ...(Number.isInteger(observedExitCode) ? { details: { exitCode: observedExitCode } } : {}),
      },
    };
    frames.push({ type: "subagent_event", payload: { id: allocatedId, event: { type: "tool_execution_start", toolName: "bash", toolCallId, args: { command: RETRY_COMMAND } } } });
    frames.push({ type: "subagent_event", payload: { id: allocatedId, event: { type: "tool_execution_update", toolName: "bash", toolCallId, partialResult: { status: "PARTIAL" } } } });
    frames.push({ type: "subagent_event", payload: { id: allocatedId, event: nestedEnd } });
  };
  if (label.endsWith("-first") || label.endsWith("-second")) {
    appendValidatorCommand(run, validatorToolCallId);
  } else if (label.endsWith("-repair")) {
    appendValidatorCommand(repairRuns.before, repairBeforeValidatorToolCallId);
    const writePath = definition.paths.subject_relative;
    const writeCallId = `fullcall_write_${randomUUID()}|fc_write_${randomUUID()}`;
    const content = fs.readFileSync(definition.paths.subject, "utf8");
    frames.push({ type: "subagent_event", payload: { id: allocatedId, event: { type: "tool_execution_start", toolName: "write", toolCallId: writeCallId, args: { path: writePath, content } } } });
    frames.push({ type: "subagent_event", payload: { id: allocatedId, event: { type: "tool_execution_update", toolName: "write", toolCallId: writeCallId, args: { path: writePath }, partialResult: { details: { resolvedPath: writePath } } } } });
    frames.push({ type: "subagent_event", payload: { id: allocatedId, event: { type: "tool_execution_end", toolName: "write", toolCallId: writeCallId, isError: false, result: { details: { resolvedPath: writePath } } } } });
    appendValidatorCommand(repairRuns.after, repairAfterValidatorToolCallId);
  }
  frames.push({ type: "tool_execution_end", toolName: "task", toolCallId: rootToolCallId, isError: false, result: { details: { results: [], progress: [taskProgress], async: { state: "running", jobId: asyncJobId, type: "task" } } } });
  frames.push({ type: "tool_execution_update", toolName: "task", toolCallId: rootToolCallId, partialResult: { details: { results: [], progress: [taskProgress], async: { state: "running", jobId: asyncJobId, type: "task" } } } });
  frames.push({ type: "prompt_result", id: promptRequestId, status: "completed", agentInvoked: true, sessionSettled: false });
  frames.push({ type: "agent_end", isTerminal: false, awaitingAsyncWork: true, yielded: true });
  frames.push({ type: "subagent_lifecycle", payload: { id: allocatedId, index: 0, agent: role, agentSource: "project", parentToolCallId: rootToolCallId, status: "completed" } });
  frames.push({ type: "message_end", message: { role: "custom", customType: "async-result", details: { jobs: [asyncJob] } } });
  frames.push({ type: "session_settled" });
  frames.push({ type: "agent_end", isTerminal: true, awaitingAsyncWork: false });
  const observed = observeSourceDerivedCapture({
    fixture,
    assignments,
    label,
    frames,
    stateResponse: { type: "response", command: "get_state", success: true, id: stateRequestId, data: { sessionId: rootSession } },
    stateRequestId,
    promptRequestId,
  });
  const sourceProgramRecord = (observedRun, subjectSha256) => {
    const observedExitCode = Number.isInteger(observedRun?.child?.status) ? observedRun.child.status : null;
    return {
      stdout: observedRun?.stdout ?? "",
      stderr: observedRun?.stderr ?? "",
      status: observedExitCode,
      exit_code: observedExitCode,
      is_error: observedRun?.child?.error ? true : observedExitCode !== 0,
      report: observedRun?.report ?? null,
      subject_sha256: subjectSha256,
      details: Number.isInteger(observedExitCode) && observedExitCode !== 0 ? { exitCode: observedExitCode } : {},
    };
  };
  return {
    ...observed,
    source_attempt: attempt,
    source_program: repairRuns
      ? { before: sourceProgramRecord(repairRuns.before, subjectHashBefore), after: sourceProgramRecord(repairRuns.after, subjectHashAfter) }
      : run ? sourceProgramRecord(run, subjectHashAfter) : null,
    ...(peer ? { source_peer_review: report, source_peer_subject_binding: peerSubjectBinding } : {}),
  };
}



let nativeCaptureHalt = null;

function nativeCaptureFatalReason(error) {
  const message = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  const reasonCode = error instanceof ProbeError ? probeReasonCode(error) : "";
  if (
    error instanceof ProbeError
    || /auth(?:entication|orization)?|quota|transport|policy|observer|capture|protocol|session|rpc/i.test(message)
    || /AUTH|QUOTA|TRANSPORT|POLICY|RPC|PROTOCOL/i.test(code)
  ) {
    return reasonCode || code || "NATIVE_CAPTURE_FATAL";
  }
  return null;
}

function haltNativeCapture(error) {
  const reason = nativeCaptureFatalReason(error);
  if (!reason || nativeCaptureHalt) return nativeCaptureHalt;
  nativeCaptureHalt = { reason, error: controlledError(error) };
  return nativeCaptureHalt;
}

function haltedNativeCapture(label) {
  return {
    status: "PENDING",
    evidence_level: "native-capture-halted",
    native_process_count: 0,
    halted: true,
    label,
    reason: "new native RPC sessions were stopped after a fatal capture failure",
    halt: nativeCaptureHalt,
  };
}

function observedExecutionArtifacts(root, source, observed) {
  const rows = new Map();
  const files = [source, ...observed.flatMap((item) => item.source_binding.files)];
  for (const expected of files) {
    const resolved = path.resolve(root, expected.path);
    if (!inside(root, resolved)) blocked("execution artifact escaped the private project");
    const actual = fileRecord(resolved, "observed execution artifact");
    const relative = path.relative(root, resolved).replaceAll("\\", "/");
    if (!relative || relative.split("/").includes(".git") || actual.sha256 !== expected.sha256 || (expected.bytes !== undefined && actual.bytes !== expected.bytes)) blocked("execution artifact bytes differ from the actual observed source");
    const stat = fs.lstatSync(resolved);
    const row = { path: relative, sha256: actual.sha256, regular: stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, confined: inside(root, resolved), source };
    const key = process.platform === "win32" ? relative.toLowerCase() : relative;
    const prior = rows.get(key);
    if (prior && prior.sha256 !== row.sha256) blocked("execution artifact aliases expose contradictory hashes");
    rows.set(key, row);
  }
  return [...rows.values()];
}

function nativeExecutionConsumer(executionApi, execution, native, revision) {
  const pending = (reason, details = {}) => ({
    consumer: "tdd-orchestrator/lib/execution.mjs",
    native_observed: false,
    evidence_level: "NATIVE_CAPTURE_REQUIRED",
    complete: false,
    reason,
    ...details,
  });
  if (!native || native.source_derived === true || native.native_process_count !== 1 || native.origin?.native_rpc !== true) {
    return pending("execution consumer requires an authentic host-observed Native10 capture");
  }
  if (native.status !== "PASS" || native.revision !== revision) return pending("Native10 action-bound core and current workload revision must be accepted before execution projection");
  const rootSession = preserveIdentifier(native.root_session?.session_id);
  const dispatches = (native.dispatches ?? []).filter((item) => item?.kind === "dispatch");
  const rootEnds = Array.isArray(native.root_task_ends) ? native.root_task_ends : [];
  if (!rootSession || !dispatches.length || rootEnds.length !== dispatches.length) {
    return pending("validated Native10 Root dispatch and terminal bindings are incomplete", {
      root: { session_id: rootSession, dispatch_count: dispatches.length, terminal_count: rootEnds.length },
    });
  }
  const assignments = dispatches.flatMap((item) => Array.isArray(item.assignments) ? item.assignments : []);
  const expectedNames = new Set(NATIVE10_ASSIGNMENTS.map(([, name]) => name));
  const assigned = assignments.filter((item) => expectedNames.has(item?.name));
  const assignmentCounts = new Map();
  for (const item of assigned) assignmentCounts.set(item.name, (assignmentCounts.get(item.name) ?? 0) + 1);
  const rootBinding = rootEnds.map((end) => ({
    tool_call_id: preserveIdentifier(end.tool_call_id),
    is_error_observed: end.isError === false || end.is_error === false,
    is_error: typeof end.isError === "boolean" ? end.isError : typeof end.is_error === "boolean" ? end.is_error : null,
    sequence: end.sequence ?? null,
    host_arrival_ordinal: end.host_arrival_ordinal ?? null,
    host_workflow_ordinal: end.host_workflow_ordinal ?? null,
  }));
  const dispatchToolIds = new Set(dispatches.map((item) => preserveIdentifier(item.tool_call_id)).filter(Boolean));
  if (
    assigned.length !== NATIVE10_ASSIGNMENTS.length
    || [...expectedNames].some((name) => assignmentCounts.get(name) !== 1)
    || rootBinding.some((end) => !end.tool_call_id || !dispatchToolIds.has(end.tool_call_id) || end.is_error_observed !== true || end.is_error !== false)
  ) {
    return pending("Native10 Root dispatch set or Root task END did not bind exactly once with explicit isError:false", {
      root: { session_id: rootSession, dispatches: dispatches.length, assignments: assigned, terminals: rootBinding },
    });
  }
  const records = Array.isArray(native.task_records) ? native.task_records : [];
  const sourceReads = Array.isArray(native.subagent_reads) ? native.subagent_reads : [];
  const root = execution.context.filesystem.allowedRoots[0];
  const observed = [];
  for (const [agent, name] of NATIVE10_ASSIGNMENTS) {
    const matching = records.filter((record) => record?.assignment_id === name && isAuthoritativeTaskRecord(record));
    if (matching.length !== 1) return pending(`Native10 child terminal count for ${name} was not exactly one`, { assignment: name, terminal_count: matching.length });
    const record = matching[0];
    const explicitSuccess = taskRecordSucceeded(record);
    const structured = record.structured_data && typeof record.structured_data === "object" ? record.structured_data : {};
    const structuredRevision = structured.reviewed_revision ?? structured.source_revision ?? structured.revision ?? record.revision ?? null;
    const readReceipts = sourceReads
      .filter((item) => item?.allocated_id === record.allocated_id && item?.parent_tool_call_id === record.parent_tool_call_id && item?.index === record.index)
      .flatMap((item) => Array.isArray(item.source_files) ? item.source_files : []);
    const sourceBinding = readReceipts.length > 0 && readReceipts.every((item) => {
      if (typeof item.path !== "string" || !SHA256.test(String(item.sha256 ?? ""))) return false;
      try {
        const resolved = path.resolve(root, item.path);
        if (!inside(root, resolved)) return false;
        const stat = fs.lstatSync(resolved);
        return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size === item.bytes && sha256Bytes(fs.readFileSync(resolved)) === item.sha256;
      } catch { return false; }
    });
    const observedRevision = structuredRevision ?? (sourceBinding ? native.revision : null);
    const attempt = assignmentCounts.get(name);
    const parentToolCallId = preserveIdentifier(record.parent_tool_call_id);
    const allocatedId = preserveIdentifier(record.allocated_id);
    const index = record.index;
    const domain = hostDerivedDomainIds(rootSession, parentToolCallId, allocatedId, index);
    if (
      record.agent !== agent
      || record.agentSource !== "project"
      || record.run_id !== native.logical_run_id
      || (structuredRevision !== null && structuredRevision !== revision)
      || !sourceBinding
      || observedRevision !== revision
      || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 3
      || !explicitSuccess
      || !domain.job_id || !domain.instance_id
    ) {
      return pending(`Native10 child terminal binding for ${name} was not validated from observed lifecycle fields`, {
        assignment: name,
        observed: {
          agent: record.agent ?? null,
          run_id: record.run_id ?? null,
          revision: observedRevision,
          attempt,
          is_error: record.isError ?? null,
          exit_code: record.exitCode ?? null,
          allocated_id: allocatedId,
          index,
          parent_tool_call_id: parentToolCallId,
          domain_id_provenance: domain.provenance,
        },
      });
    }
    observed.push({ agent, assignment_id: name, record, domain, structured, attempt, source_binding: { revision: observedRevision, files: readReceipts } });
  }
  const receipt = native.capture_receipt;
  if (!receipt?.path || !SHA256.test(String(receipt.sha256 ?? ""))) return pending("Native10 observed RPC witness is absent");
  const observedSource = fileRecord(path.resolve(root, receipt.path), "Native10 observed RPC execution source");
  if (observedSource.sha256 !== receipt.sha256) return pending("Native10 observed RPC witness bytes changed");
  const source = { path: receipt.path, sha256: receipt.sha256 };
  const progress = {
    schema_version: "2.3",
    run_id: native.logical_run_id,
    task_source: "native10 observed workload",
    repo: { head_current: revision },
    contract: { file: "./specs/specs005-omp-compatible-release/contracts/interface-contract.md", version: "0.6.0" },
    acceptance_criteria: [{ id: "AC-016", desc: "Integrated lifecycle", source: "./specs/specs005-omp-compatible-release/spec.md#AC-016", tasks: [...expectedNames], type: "behavioral" }],
    waves: [{ wave: 1, status: "in_progress", tasks: observed.map(({ assignment_id, agent }) => ({ id: assignment_id, title: `Observed Native10 ${assignment_id}`, allowed_write_globs: ["native10/**"], acceptance_criteria: ["AC-016"], owner: agent })) }],
  };
  const plan = {
    schemaVersion: 1,
    runId: native.logical_run_id,
    wave: 1,
    revision,
    staticDigest: "0".repeat(64),
    resources: [],
    tasks: observed.map(({ assignment_id, agent }) => ({ id: assignment_id, owner: agent, dependencies: [], resources: [], artifacts: [], isolated: false })),
  };
  let staticDigest;
  try {
    staticDigest = executionApi.staticExecutionDigest(progress, plan);
  } catch (error) {
    return pending("execution API rejected the observed Native10 plan", { error: safeError(error), native_observed: true });
  }
  plan.staticDigest = staticDigest;
  const review = observed.filter(({ assignment_id }) => assignment_id === "Native10DeepReviewer" || assignment_id === "Native10PeerReviewer");
  const deep = review.find(({ assignment_id }) => assignment_id === "Native10DeepReviewer");
  const peer = review.find(({ assignment_id }) => assignment_id === "Native10PeerReviewer");
  const deepValidation = deep?.structured ? validateReviewerResult(deep.structured, { agent: "deep-reviewer", protocol_mode: "DEEP_REVIEW", reviewed_revision: revision }) : null;
  const peerValidation = peer?.structured ? validateReviewerResult(peer.structured, { agent: "peer-reviewer", protocol_mode: "TDD_PEER_REVIEW", reviewed_revision: revision }) : null;
  const reviewReady = deepValidation?.ok === true
    && deep?.structured?.status === "VALID"
    && peerValidation?.ok === true
    && peer?.structured?.status === "APROVADO";
  const integratedReview = {
    status: reviewReady ? "PASS" : "PENDING",
    runId: native.logical_run_id,
    revision,
    staticDigest,
    environmentDigest: execution.context.environmentDigest,
    author: reviewReady ? deep.assignment_id : null,
    reviewer: reviewReady ? peer.assignment_id : null,
    independent: reviewReady,
    source: reviewReady ? source : null,
  };
  const context = {
    schemaVersion: 1,
    observationId: `native10-execution-${native.logical_run_id}`,
    runId: native.logical_run_id,
    wave: 1,
    revision,
    expectedStaticDigest: staticDigest,
    environmentDigest: execution.context.environmentDigest,
    source,
    filesystem: { platform: execution.context.filesystem.platform, caseSensitive: execution.context.filesystem.caseSensitive, allowedRoots: [root], resources: [] },
    capacity: { maxWorkers: observed.length, activeWorkers: 0, writerSlots: 1, activeWriterTaskIds: [] },
    isolation: { available: false, observations: [] },
    jobs: [],
    history: [],
    predecessors: [],
    artifacts: observedExecutionArtifacts(root, source, observed),
    integratedReview,
  };
  const returns = [];
  for (const { assignment_id, agent, record, domain, attempt } of observed) {
    const value = {
      taskId: assignment_id,
      wave: 1,
      runId: native.logical_run_id,
      revision,
      staticDigest,
      attempt,
      instanceId: domain.instance_id,
      jobId: domain.job_id,
      owner: agent,
      status: "PASS",
      dependencies: [],
      artifacts: [],
      source,
    };
    const digestBody = { ...value };
    delete digestBody.source;
    const returnDigest = digest({ ...digestBody, dependencies: [], artifacts: [] });
    returns.push({ ...value, returnDigest });
    context.history.push({
      runId: native.logical_run_id,
      wave: 1,
      taskId: assignment_id,
      attempt,
      instanceId: domain.instance_id,
      jobId: domain.job_id,
      owner: agent,
      status: "PASS",
      failureClass: null,
      startSequence: Number.isSafeInteger(record.start_sequence) ? record.start_sequence : 0,
      terminalSequence: Number.isSafeInteger(record.sequence) ? record.sequence : 1,
      revision,
      staticDigest,
      returnDigest,
      source,
    });
    context.jobs.push({
      runId: native.logical_run_id,
      revision,
      staticDigest,
      taskId: assignment_id,
      attempt,
      instanceId: domain.instance_id,
      jobId: domain.job_id,
      owner: agent,
      state: "TERMINAL",
      terminalStatus: "PASS",
      source,
    });
  }
  let initial;
  let complete;
  try {
    initial = executionApi.validateExecutionPlan(progress, plan, context);
    complete = executionApi.evaluateExecution(progress, plan, returns, context);
  } catch (error) {
    return pending("execution API threw while consuming observed Native10 terminals", { native_observed: true, error: safeError(error), root: rootBinding });
  }
  return {
    consumer: "tdd-orchestrator/lib/execution.mjs",
    native_observed: true,
    evidence_level: "NATIVE_HOST_CAPTURE_EXECUTION_CONSUMER",
    root: { session_id: rootSession, dispatches, terminals: rootBinding },
    children: observed.map(({ assignment_id, agent, record, domain, attempt }) => ({ assignment_id, agent, run_id: record.run_id, revision, revision_source: "accepted action-bound workload revision", attempt, attempt_source: "host count of uniquely observed named Root dispatches, not a SingleResult field", allocated_id: record.allocated_id, index: record.index, parent_tool_call_id: record.parent_tool_call_id, job_id: domain.job_id, instance_id: domain.instance_id, domain_id_provenance: domain.provenance })),
    static_plan: resultSummary(initial),
    complete_projection: resultSummary(complete),
    complete: complete?.value?.complete === true,
    input: { progress, plan, context, returns },
  };
}


async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evaluationStartedAt = now();
  if (options.offlineProbe) {
    const result = offlineGuardShapeProbe();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "PASS" ? 0 : 2;
    return;
  }
  directory(options.source, "--source"); directory(options.lab, "--lab"); regular(options.omp, "--omp");
  if (samePath(options.source, options.lab) || inside(options.source, options.lab) || inside(options.lab, options.source)) blocked("--source and --lab must be disjoint");
  const normalHome = process.env.USERPROFILE || process.env.HOME;
  if (!normalHome) blocked("native auth requires inherited HOME/USERPROFILE; no profileRoot override is allowed");
  if (samePath(options.lab, normalHome) || inside(options.lab, normalHome)) blocked("--lab may not equal or contain normal HOME/USERPROFILE; a lab below UserTemp is not itself a real HOME overlap");
  const runId = randomUUID(); if (!UUID_V4.test(runId)) blocked("run id was not UUID-v4");
  const runRoot = path.join(options.lab, `ship-native-lifecycle-${runId}`); fs.mkdirSync(runRoot, { recursive: false });
  const sourceEntries = sourceManifest(options.source); const packageInfo = freezePackage(runRoot, sourceEntries);
  const skillsObserved = new Set(packageInfo.entries.filter((entry) => entry.kind === "skill").map((entry) => entry.sourceRelativePath.split("/")[0]));
  const profilesObserved = packageInfo.entries.filter((entry) => entry.kind === "agent");
  if (skillsObserved.size !== 10 || SKILLS.some((skill) => !skillsObserved.has(skill)) || profilesObserved.length !== 12) blocked("private overlay did not contain exact ten skills and twelve installer profiles", { skills: [...skillsObserved].sort(), profiles: profilesObserved.map((entry) => entry.sourceRelativePath).sort() });
  const fixtureBase = createPrivateProject(runRoot, options.source, packageInfo);
  const fixture = { project: fixtureBase.root, logicalRunId: `native10-${runId}`, ...fixtureBase };
  const fingerprintPaths = [...new Set([...sourceEntries.map((entry) => entry.sourceRelativePath), ...CONSUMER_PATHS])];
  const sourceBefore = fingerprint(options.source, fingerprintPaths);
  const alignmentBinding = bindRetainedAlignment(options.source, options.alignmentCapture);
  const binaryBefore = { path: options.omp, bytes: fs.statSync(options.omp).size, sha256: sha256Bytes(fs.readFileSync(options.omp)) };
  const [quality, state, execution, ship, retro, routeApi, retryApi] = await Promise.all([
    importApi(options.source, "tdd-orchestrator/lib/quality.mjs", "quality consumer"),
    importApi(options.source, "tdd-orchestrator/lib/state.mjs", "state consumer"),
    importApi(options.source, "tdd-orchestrator/lib/execution.mjs", "execution consumer"),
    importApi(options.source, "ship/bin/lib.mjs", "Ship quality consumer"),
    importApi(options.source, "retro/lib/control.mjs", "retro consumer"),
    importEvidenceApi(options.source, "implementation-evidence/native-release/route-matrix.mjs", "native route matrix"),
    importEvidenceApi(options.source, "implementation-evidence/native-release/technical-retry-scenario.mjs", "native technical retry"),
  ]);
  const qualityFixture = makeQualityFixture(fixture.project, quality, fixture.logicalRunId);
  const externalPlan = runExternalPlanCli(fixture.project, options.source, options.timeoutMs);
  const qualityResult = await runQualityConsumers(fixture.project, qualityFixture, quality, ship, externalPlan);
  const stateResult = runStateConsumers(state);
  const executionFixtureValue = executionFixture(fixture.project);
  const libraryExecutionResult = runExecutionConsumers(execution, executionFixtureValue);
  const retroResult = runRetroConsumers(fixture.project, retro, qualityFixture, qualityResult, fixture.logicalRunId);
  const retroEvidence = retroResult.required?.decision?.evidence?.find((item) => item?.path === ".omp/state/native10-retro-evidence.txt");
  const retroRootBinding = { evidenceSha256: retroEvidence?.sha256 ?? null, contextDigest: qualityFixture.contextDigest };
  const revision = sha256Text(fs.readFileSync(path.join(fixture.project, "src/tiny.mjs")));
  const captureOptions = options.native ? options : { ...options, captureProvider: sourceDerivedCaptureProvider };
  const retainedRoutes = options.routeCapture ? bindRetainedRoutes(options.source, options.routeCapture, routeApi, binaryBefore) : null;
  if (retainedRoutes && (retainedRoutes.status !== "PASS" || retainedRoutes.route_matrix.revision !== revision)) blocked("explicit retained routes are not compatible with the current workload", { reason: retainedRoutes.reason ?? "workload revision differs" });
  const routeDefinitions = retainedRoutes ? [] : routeApi.buildRouteCases({ runId: randomUUID(), revision, nonce: randomUUID() });
  const routeRunId = retainedRoutes?.route_matrix.run_id ?? routeDefinitions[0]?.binding.run_id ?? null;
  const routeNonce = retainedRoutes?.route_matrix.nonce ?? routeDefinitions[0]?.binding.nonce ?? null;
  const routeResults = retainedRoutes?.route_matrix.cases ?? [];
  const routeFixtures = retainedRoutes?.route_matrix.fixtures ?? [];
  for (const definition of routeDefinitions) {
    const routeFixture = prepareRouteFixture(runRoot, options.source, packageInfo, definition.mode, definition.route);
    const hostArtifacts = prepareRouteHostArtifacts(routeFixture.project, packageInfo, options, definition.binding.run_id, definition.binding.revision, definition.binding.nonce, definition.requiredReads.requirements_reader);
    routeFixtures.push({ id: definition.id, mode: definition.mode, route: definition.route, project: routeFixture.project, git: routeFixture.git, host_artifacts: hostArtifacts });
    routeResults.push(await runNativeRouteCase(captureOptions, { ...routeFixture, logicalRunId: definition.binding.run_id }, definition, routeApi, hostArtifacts));
    if (nativeCaptureHalt) break;
  }
  const catalogResult = bindCatalog(options.source);
  const phases = [
    { phase: "DOC", evidence: stateResult.cases.find((item) => item.label === "DOC.VALIDATED")?.result ?? null },
    { phase: "DONE", evidence: stateResult.cases.find((item) => item.label === "DONE.VALIDATED")?.result ?? null },
    { phase: "VALIDATE", evidence: qualityResult.ship_gate },
    { phase: "DELIVERY_EXTERNAL", evidence: qualityResult.external_dry_path },
    { phase: "RETRO", evidence: retroResult.required.validation },
    { phase: "RETRO_OPT_OUT_CONTROL", evidence: retroResult.opt_out },
  ];
  const workloadReceiptPath = path.join(fixture.project, ".omp/state/native10-workload.json");
  const workloadBinding = { nonce: randomUUID(), run_id: fixture.logicalRunId, assignment_id: "Native10Validator", revision, source: "src/tiny.mjs", test: "tests/tiny.test.mjs" };
  prepareNative10TaskDescriptors(fixture, revision);
  const readingContext = native10ReadingContext(fixture, revision, workloadBinding.nonce, qualityFixture);
  const workloadReceiptInfo = atomicWrite(workloadReceiptPath, JSON.stringify({ run_id: fixture.logicalRunId, revision, binding: workloadBinding, ...readingContext, quality: qualityResult, state: stateResult, execution: libraryExecutionResult, ship: qualityResult.external_dry_path, retro: retroResult, catalog: { capabilities: catalogResult.capabilities.count, sources: catalogResult.sources.count }, phases }, null, 2), fixture.project, "native10 workload receipt");
  const native10Assignments = buildNativeAssignments(fixture, revision);
  const native10Prompt = buildNativePrompt(fixture, revision, retroRootBinding, native10Assignments);
  const native = await runNative(options, fixture, revision, native10Assignments, "native10-integrated", native10Prompt, alignmentBinding, { tool: "write", path: path.join(fixture.project, NATIVE_RETRO_ARTIFACT) });
  const executionResult = nativeExecutionConsumer(execution, executionFixtureValue, native, revision);
  const nativeRetro = runNativeRetroConsumers(fixture.project, retro, qualityFixture, fixture.logicalRunId, native);
  const retryOptions = options.native ? { ...options } : { ...options, captureProvider: sourceDerivedCaptureProvider };
  if (!retryOptions.installedPackageRoot) {
    retryOptions.installedPackageRoot = fixture.overlay.root;
    retryOptions.installedPackageRuntimeState = true;
    const installedManifest = packageInfo.entries.map((entry) => ({ destination: entry.destinationRelative, bytes: entry.bytes, sha256: entry.sha256 }));
    atomicWrite(path.join(retryOptions.installedPackageRoot, "package-manifest.json"), `${JSON.stringify(installedManifest, null, 2)}
`, fixture.project, "private installed package manifest");
  }
  const technicalRetryPrepared = prepareTechnicalRetryDefinition(retryApi, retryOptions, fixture, revision, workloadBinding.nonce);
  const technicalRetry = nativeCaptureHalt
    ? { status: "PENDING_NATIVE", failure_eligible: false, reason: "technical retry was not started after a fatal native capture failure", prepared: technicalRetryPrepared }
    : await runNativeTechnicalRetry(retryOptions, fixture, retryApi, technicalRetryPrepared, execution);
  const native09ProbeAllowed = options.native === true && technicalRetryPrepared.status === "PREPARED" && !nativeCaptureHalt;
  const native09FailureObservation = technicalRetry.first ?? null;
  const nativeFailureEligible = options.native === true
    && technicalRetry.failure_eligible === true
    && native09FailureObservation?.native === true
    && native09FailureObservation?.origin?.native_rpc === true
    && native09FailureObservation?.native_process_count === 1;
  const nativeFailure = {
    eligible: nativeFailureEligible,
    observed_origin: technicalRetry.result?.first?.origin ?? null,
    assignment_id: technicalRetry.definition?.assignment_id ?? TECHNICAL_RETRY_ASSIGNMENT_ID,
    run_id: technicalRetry.definition?.run_id ?? fixture.logicalRunId,
    reason: technicalRetry.reason ?? (nativeFailureEligible ? "eligible native solution/behavior failure observed" : "no eligible native solution/behavior failure observed"),
    technical_retry: technicalRetry.result ?? null,
  };
  const retryExecution = technicalRetry.execution ?? null;
  const retryPass = technicalRetry.result?.status === "PASS" && retryExecution?.status === "PASS";
  const retry = {
    status: retryPass ? "PASS" : technicalRetry.status === "BLOCKED" ? "BLOCKED" : "PENDING",
    evidence_level: technicalRetry.result?.evidence_level ?? technicalRetry.evidence_level ?? "offline-preparation-only",
    reason: retryPass ? null : technicalRetry.reason ?? technicalRetry.result?.failures?.join("; ") ?? "technical retry remains pending",
    technical: technicalRetry.result ?? null,
  };
  const retryNative = technicalRetry.captures ?? technicalRetry;
  const retrySuccess = technicalRetry.result ?? null;
  const retryControl = {
    status: nativeFailure.eligible ? "ELIGIBLE_FAILURE_OBSERVED" : technicalRetryPrepared.status === "PREPARED" ? "NOT_ELIGIBLE" : "NOT_PREPARED",
    assignment_id: technicalRetry.definition?.assignment_id ?? TECHNICAL_RETRY_ASSIGNMENT_ID,
    command: technicalRetry.definition?.command ?? null,
    immutable_workload_revision: revision,
    definition: technicalRetry.definition ?? null,
    failure_observation: native09FailureObservation,
    result: technicalRetry.result ?? null,
  };
  const workloadReceiptAfter = { path: path.relative(fixture.project, workloadReceiptPath).replaceAll("\\", "/"), bytes: fs.statSync(workloadReceiptPath).size, sha256: sha256Bytes(fs.readFileSync(workloadReceiptPath)) };
  const workloadReceiptStable = workloadReceiptInfo.bytes === workloadReceiptAfter.bytes && workloadReceiptInfo.sha256 === workloadReceiptAfter.sha256;
  const lifecycleResult = evaluateLifecycle(native, qualityResult, stateResult, executionResult, retroResult, nativeFailure, retry, retryExecution, alignmentBinding, nativeRetro, routeResults);
  const sourceAfter = fingerprint(options.source, fingerprintPaths);
  const binaryAfter = { path: options.omp, bytes: fs.statSync(options.omp).size, sha256: sha256Bytes(fs.readFileSync(options.omp)) };
  const sourceChanged = compareFingerprints(sourceBefore, sourceAfter);
  const binaryChanged = binaryBefore.bytes !== binaryAfter.bytes || binaryBefore.sha256 !== binaryAfter.sha256;
  const stateRequiredLabels = new Set(["DOC.VALIDATED", "DONE.VALIDATED", "PROMOTION.VALIDATED", "MIGRATE.2.3"]);
  const stateReady = [...stateRequiredLabels].every((label) => stateResult.cases.find((item) => item.label === label)?.result?.ok === true);
  const workloadReady = qualityResult.workload?.consumer_check === "PASS";
  const nativeCoreReady = native.status === "PASS";
  const nativeCore = {
    status: nativeCoreReady ? "PASS" : "PENDING_NATIVE",
    native_status: native.status,
    profiles: native.profiles ?? [],
    alignment_binding: alignmentBinding,
    note: "Native core is reported separately from integrated lifecycle; EXTERNAL and any missing native fields remain unresolved.",
  };
  const routeReady = routeResults.length === 4 && routeResults.every((item) => item?.status === "PASS" && item?.native === true);
  const native10Ready = nativeCoreReady && routeReady && lifecycleResult.status === "PASS" && workloadReady && stateReady && workloadReceiptStable && qualityResult.direct.ok && qualityResult.ship_gate.ok && executionResult.native_observed === true && executionResult.complete && retroResult.required.validation.ok && catalogResult.status === "PASS" && sourceChanged.length === 0 && !binaryChanged;
  const overall = native10Ready && retry.status === "PASS" ? "PASS" : native10Ready ? "PENDING_NATIVE09" : "PENDING_NATIVE";
  const unresolvedExternal = lifecycleResult.uncovered.filter((item) => item.phase === "EXTERNAL");
  const evidence = {
    status: overall, task: "T-011", acceptance_criteria: ["AC-016"], contract: "0.6.0", phase: options.phase, run_id: runId, logical_run_id: fixture.logicalRunId, started_at: evaluationStartedAt, finished_at: null,
    source_root: options.source, lab_root: options.lab, private_project: fixture.project, home_observer: { normal_home: normalHome, guard: "equal-or-contains-only; lab below UserTemp is not treated as a real HOME overlap" }, source_before: sourceBefore, source_after: sourceAfter, omp_binary_before: binaryBefore, omp_binary_after: binaryAfter, preservation: { source_changed: sourceChanged, binary_changed: binaryChanged, workload_receipt_stable: workloadReceiptStable }, receipts: { workload: { before: workloadReceiptInfo, after: workloadReceiptAfter } },
    catalog: catalogResult, alignment_binding: alignmentBinding, route_matrix: retainedRoutes?.route_matrix ?? { run_id: routeRunId, revision, nonce: routeNonce, fixtures: routeFixtures, cases: routeResults }, technical_retry_preparation: technicalRetryPrepared, library_controls: { quality: qualityResult, state: stateResult, execution: libraryExecutionResult, native_execution: executionResult, ship: qualityResult.external_dry_path, retro: retroResult, phases },
    lifecycle: lifecycleResult, native_core: nativeCore, native_retro: nativeRetro, unresolved_external: unresolvedExternal, native10: native, native09_probe_allowed: native09ProbeAllowed, native09_failure_observation: native09FailureObservation, native09_failure: nativeFailure, native09_retry: retry, native09_execution_consumer: retryExecution, retry_native_observation: retryNative, retry_control: retryControl,
    commands_not_run: ["git publication/remote operations", "gh", "npm", "ship.mjs ship/deploy commands", "node --test", "vitest", "npm test", "build", "lint", "format", "commit outside disposable route fixtures", "push", "issue", "pull request", "release", "deploy", "domain/publication network operations; native SDK provider transport is outside this list", "alignment short/full/local/Git 20-minute probes"],
    evidence_levels: { library_controls: "actual imported source consumers over private fixture bytes; not native proof", catalog: "static-source-binding", alignment: alignmentBinding.status === "PASS" ? "historical retained native capture with exact six-target source binding" : "PENDING_NATIVE", native_core: nativeCore.status === "PASS" ? "authentic OMP RPC task/tool/terminal records and installed profile schemas, excluding unresolved lifecycle gates" : "PENDING_NATIVE", native10: native.status === "PASS" && lifecycleResult.status === "PASS" ? "authentic OMP RPC task/tool/terminal records, bounded artifacts and installed profile schemas" : "PENDING_NATIVE", native09: retry.status === "PASS" && retryExecution?.status === "PASS" ? "authentic native solution retry plus execution consumer" : "PENDING_NATIVE" },
    limitations: ["The driver is not an OS sandbox; the private lab boundary and tool guard are bounded process controls.", "Missing native fields remain PENDING; no model/serving/agentSource field is inferred.", "Native core is reported separately; unresolved EXTERNAL and any missing lifecycle gate prevent overall PASS.", "External publication remains unexecuted; the local plan receipt is LOCAL_PROGRAM_ONLY and native EXTERNAL requires a correlated validator tool_execution_end receipt.", "Tooling/auth/network/quota/configuration failures are never promoted to technical retry."],
  };
  evidence.finished_at = now();
  const evidencePath = path.join(runRoot, "evidence.json"); atomicWrite(evidencePath, serializeOperationalEvidence(evidence), runRoot, "native10 evidence");
  process.stdout.write(`${JSON.stringify({ status: overall, native_core: nativeCore.status, unresolved_external: unresolvedExternal, alignment_binding: alignmentBinding.status, native10: native.status, native10_lifecycle: lifecycleResult.status, native09_failure: nativeFailure.eligible ? "ELIGIBLE_SOLUTION_FAILURE" : "NOT_ELIGIBLE", native09_retry: retry.status, native09_execution: retryExecution?.status ?? "PENDING", run_id: runId, logical_run_id: fixture.logicalRunId, native10_ids: native.profiles?.map((item) => ({ name: item.name, id: item.terminal?.id ?? null, instance_id: item.terminal?.instance_id ?? null, job_id: item.terminal?.job_id ?? null })) ?? [], native09_failure_ids: native09FailureObservation?.profiles?.map((item) => ({ name: item.name, id: item.terminal?.id ?? null, instance_id: item.terminal?.instance_id ?? null, job_id: item.terminal?.job_id ?? null })) ?? [], native09_retry_ids: retryNative?.profiles?.map((item) => ({ name: item.name, id: item.terminal?.id ?? null, instance_id: item.terminal?.instance_id ?? null, job_id: item.terminal?.job_id ?? null })) ?? [], evidence: evidencePath })}\n`); 
  process.exitCode = overall === "PASS" ? 0 : 2;
}




if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main().catch((error) => {
    process.stdout.write(`${JSON.stringify({ status: error?.kind === "USAGE" ? "USAGE" : "BLOCKED", detail: scrub(error?.message ?? error), error: safeError(error) })}\n`);
    process.exitCode = error?.kind === "USAGE" ? 64 : 2;
  });
}
