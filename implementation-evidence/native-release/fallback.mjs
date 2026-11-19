#!/usr/bin/env node
// Disposable NATIVE-06 fallback probe for the approved 0.5.0 contract.
//
// This artifact is intentionally outside the repository.  It creates one fresh,
// private project workspace under --lab from the immutable fixture bytes and the
// current twelve project profiles, then runs exactly one bounded OMP RPC session.
// It never creates a branch, invokes Git, changes the source checkout, changes
// the immutable fixture, installs into HOME, changes global settings, selects a
// model, or writes a provider/SDK/service configuration.
//
// The native route is deliberately capability-narrowed, not provider fallback:
// project-only .omp/config.yml disables deep-reviewer, the real OMP preflight is
// observed, and the root then explicitly dispatches named peer-reviewer tasks in
// DEEP_REVIEW_FALLBACK with the same independently bound assignment/revision.

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const CONTRACT_VERSION = "0.5.0";
const TASK_ID = "NATIVE-06.fallback";
const EXPECTED_BINARY_SHA256 = "dfb15c27cb2ea192a94761c26aa5cd4eed54b1e0a5a85c02938ab07d769bc8f7";
const EXPECTED_FIXTURE_REVISION = "2f28c09811568ce46fee8b69a4a5b1ba23d18e96";
const EXPECTED_FIXTURE_BASE_REVISION = "781a63a61717c03febe399a494f98f914226734a";
const EXPECTED_FIXTURE_DIFF_SHA256 = "8ca5f8635fc12a740304a2948b3367cc963f05bfc22eb3c6de6d30e3474795ed";
const EXPECTED_FIXTURE_SUFFIX = "ship-native-profile-5e25dd6a-c4bd-4dbe-8dcb-b8637e57b65d/review-fixture/worktrees/review";
const DEFAULT_TIMEOUT_MS = 900_000;
const MAX_PHYSICAL_FRAME_BYTES = 1024 * 1024;
const MAX_REASSEMBLED_FRAME_BYTES = 64 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const OPERATIONAL_PROMPT_FIELDS = Object.freeze({ type: "string", id: "string", status: "string", agentInvoked: "boolean", sessionSettled: "boolean" });
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const DECODER = new TextDecoder("utf-8", { fatal: true });
const TERMINAL_STATUSES = new Set(["completed", "complete", "success", "succeeded", "failed", "error", "aborted", "canceled", "cancelled"]);
const SUCCESS_STATUSES = new Set(["completed", "complete", "success", "succeeded"]);
const RPC_EVENTS = Object.freeze([
  "message_end",
  "tool_execution_start",
  "tool_execution_end",
  "agent_end",
  "subagent_lifecycle",
  "subagent_progress",
  "subagent_event",
]);
const ALLOWED_ROOT_TOOL = /^(?:read|grep|glob|wait|todo|task|tasks)(?:$|[_.:])/i;
const PEER_WIRE_ROOT_TOOL = /^(?:read|grep|glob|wait)(?:$|[_.:])/i;
const FORBIDDEN_TOOL = /(?:bash|shell|powershell|cmd(?:\.exe)?|ssh|host|write|edit|apply[_-]?patch|install|publish|deploy|service|git|curl|fetch|http|network|web|browser|get[_-]?subagents|workpool|settings|config|login|auth)/i;
const PEER_WIRE_PROBE = "peer-wire-malformed";
const PEER_WIRE_PROBE_SCHEMA = "native05-peer-wire-probe-v1";
const MAX_PROBE_OUTPUT_BYTES = 64 * 1024;
const TASK_FORBIDDEN_KEYS = new Set([
  "model", "modeloverride", "model_override", "thinkinglevel", "thinking_level", "effort",
  "structured", "task.structured", "task_structured", "outputschema", "output_schema",
  "schemamode", "schema_mode", "isolated", "tools", "settings", "globalsettings",
  "global_settings", "provider", "alias", "config", "modelroute", "model_route", "aliases",
]);
const PUBLIC_REVIEW_FIELDS = new Set([
  "agent", "protocol_mode", "status", "reviewed_revision", "overall_correctness", "explanation", "confidence", "findings",
]);
const FINDING_FIELDS = new Set(["title", "body", "priority", "confidence", "file_path", "line_start", "line_end"]);
const DOC_URLS = Object.freeze([
  "https://raw.githubusercontent.com/can1357/oh-my-pi/9058ab9d229663e229e2867824ba6df6f21e9e59/docs/task-agent-discovery.md",
  "https://raw.githubusercontent.com/can1357/oh-my-pi/9058ab9d229663e229e2867824ba6df6f21e9e59/docs/tools/task.md",
  "https://raw.githubusercontent.com/can1357/oh-my-pi/9058ab9d229663e229e2867824ba6df6f21e9e59/docs/rpc.md",
]);
const INSTALLER_SKILLS = Object.freeze([
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
]);
const INSTALLER_AGENTS = Object.freeze([
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
const FALLBACK_ASSIGNMENTS = Object.freeze([
  Object.freeze({
    id: "FallbackReviewGood",
    agent: "peer-reviewer",
    protocol_mode: "DEEP_REVIEW_FALLBACK",
    files: Object.freeze(["src/checkout-good.mjs", "test/checkout-good.test.mjs"]),
  }),
  Object.freeze({
    id: "FallbackReviewBad",
    agent: "peer-reviewer",
    protocol_mode: "DEEP_REVIEW_FALLBACK",
    files: Object.freeze(["src/checkout-bad.mjs", "test/discount.test.mjs"]),
  }),
]);

class DriverError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "DriverError";
    this.kind = kind;
    Object.assign(this, details);
  }
}

function blocked(message, details = {}) {
  throw new DriverError("BLOCKED", message, details);
}

function assertion(message, details = {}) {
  throw new DriverError("ASSERTION", message, details);
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

function scrubText(value, limit = 2048) {
  return String(value ?? "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "<redacted-thinking>")
    .replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, "<redacted-analysis>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential|account[_-]?id|user[_-]?id))\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>")
    .replace(/((?:authorization|cookie))\s*:[^\r\n]+/gi, "$1: <redacted>")
    .slice(0, limit);
}

function sensitiveKey(key) {
  return /(?:auth|token|secret|password|credential|account(?:[_-]?id)?|api[_-]?key|cookie|private[_-]?key|system[_-]?prompt|chain[_-]?of[_-]?thought|cot|reasoning|thinking|provider[_-]?error|raw[_-]?error|message|prompt|content)/i.test(String(key));
}

function sanitizeValue(value, depth = 0, key = "") {
  if (sensitiveKey(key)) return "<redacted>";
  if (depth > 12) return "<depth-limited>";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.slice(0, 64).map((item) => sanitizeValue(item, depth + 1, key));
  if (typeof value === "object") {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = sensitiveKey(childKey) ? "<redacted>" : sanitizeValue(childValue, depth + 1, childKey);
    }
    return result;
  }
  return String(value);
}

function serializeOperationalEvidence(value) {
  // Diagnostic previews must not discard operational authority or settlement.
  const text = JSON.stringify(value, (key, item) => {
    if (key === "prompt_result") {
      if (item === null) return null;
      if (!item || typeof item !== "object" || Array.isArray(item)) return "<redacted>";
      const terminal = {};
      for (const [field, type] of Object.entries(OPERATIONAL_PROMPT_FIELDS)) {
        if (Object.hasOwn(item, field) && typeof item[field] === type) terminal[field] = item[field];
      }
      return terminal;
    }
    // This exact SDK field is observed effort metadata, not hidden reasoning.
    if (key !== "resolvedThinkingLevel" && sensitiveKey(key)) return "<redacted>";
    if (typeof item === "string") return scrubText(item, MAX_CAPTURE_BYTES + 1);
    if (item === null || ["object", "boolean", "number"].includes(typeof item)) return item;
    return String(item);
  }, 2) + "\n";
  if (Buffer.byteLength(text, "utf8") > MAX_CAPTURE_BYTES) {
    throw new DriverError("BLOCKED", "operational evidence exceeded physical limit");
  }
  return text;
}

function opaque(value) {
  let raw;
  try {
    raw = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  raw = String(raw ?? "");
  const result = { sha256: sha256Text(raw), bytes: Buffer.byteLength(raw, "utf8") };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["code", "type", "status", "success"]) {
      if (typeof value[key] === "string" || typeof value[key] === "boolean") result[key] = value[key];
    }
  }
  return result;
}

function safeError(value) {
  const result = opaque(value);
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  for (const key of ["name", "code", "status", "type"]) if (typeof source[key] === "string") result[key] = source[key].slice(0, 128);
  const text = typeof source.message === "string" ? source.message : typeof value === "string" ? value : "";
  if (text) {
    result.message_sha256 = sha256Text(text);
    result.message_bytes = Buffer.byteLength(text, "utf8");
    const classes = ["schema", "yield", "disabled", "preflight", "fixture", "driver"].filter((label) => new RegExp(label, "i").test(text));
    if (classes.length > 0) result.classification = classes;
  }
  return result;
}

function comparePath(value) {
  const normalized = resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(left, right) {
  return comparePath(left) === comparePath(right);
}

function isInside(root, child) {
  const parent = comparePath(root);
  const target = comparePath(child);
  if (parent === target) return true;
  const rest = relative(parent, target);
  return rest !== "" && rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest);
}

function requireDirectory(label, value) {
  if (!value || !isAbsolute(value) || value.includes("\0")) blocked(`${label} must be an absolute path`);
  let info;
  try {
    info = lstatSync(value);
  } catch (error) {
    blocked(`${label} is not readable`, { error: safeError(error) });
  }
  if (info.isSymbolicLink() || !info.isDirectory()) blocked(`${label} must be a real directory`);
  return resolve(value);
}

function requireFile(label, value) {
  if (!value || !isAbsolute(value) || value.includes("\0")) blocked(`${label} must be an absolute path`);
  let info;
  try {
    info = lstatSync(value);
  } catch (error) {
    blocked(`${label} is not readable`, { error: safeError(error) });
  }
  if (info.isSymbolicLink() || !info.isFile() || (typeof info.nlink === "number" && info.nlink > 1)) blocked(`${label} must be a regular single-link file`);
  return resolve(value);
}

function ensureRegular(path, label) {
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    blocked(`${label} is not readable`, { error: safeError(error) });
  }
  if (info.isSymbolicLink() || !info.isFile() || (typeof info.nlink === "number" && info.nlink > 1)) blocked(`${label} must be a regular single-link file`);
}


function writeFreshFile(path, bytes, label) {
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (info.isSymbolicLink() || !info.isFile()) blocked(`${label} destination is unsafe`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  ensureRegular(path, label);
  const actual = readFileSync(path);
  if (!actual.equals(bytes)) blocked(`${label} changed bytes while copying`);
}

function copyExact(source, destination, label) {
  ensureRegular(source, label);
  const bytes = readFileSync(source);
  writeFreshFile(destination, bytes, label);
  return { source, destination, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}

function walkRegularFiles(root, label, { skipGit = false } = {}) {
  const realRoot = requireDirectory(`${label} root`, root);
  const output = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      if (skipGit && name === ".git") continue;
      const path = join(directory, name);
      const info = lstatSync(path);
      if (info.isSymbolicLink()) blocked(`${label} contains a symbolic link`, { path });
      if (info.isDirectory()) visit(path);
      else if (info.isFile()) {
        if (typeof info.nlink === "number" && info.nlink > 1) blocked(`${label} contains a hardlink`, { path });
        const relativePath = relative(realRoot, path).replaceAll("\\", "/");
        if (relativePath.startsWith("../") || isAbsolute(relativePath)) blocked(`${label} escaped its root`, { path });
        const bytes = readFileSync(path);
        output.push({ path, relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
      } else blocked(`${label} contains a special file`, { path });
    }
  };
  visit(realRoot);
  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function fingerprintTree(root, label) {
  return walkRegularFiles(root, label, { skipGit: true }).map(({ relativePath, bytes, sha256 }) => ({ path: relativePath, bytes, sha256 }));
}


function sourceManifest(sourceRoot) {
  const entries = [];
  const destinations = new Set();
  const add = (kind, sourceRelativePath, destinationRelative, sourcePath) => {
    if (destinations.has(destinationRelative)) blocked(`duplicate source destination ${destinationRelative}`);
    destinations.add(destinationRelative);
    ensureRegular(sourcePath, `source ${sourceRelativePath}`);
    const bytes = readFileSync(sourcePath);
    entries.push({ kind, sourceRelativePath, destinationRelative, sourcePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
  };
  for (const skill of INSTALLER_SKILLS) {
    const skillRoot = join(sourceRoot, skill);
    for (const file of walkRegularFiles(skillRoot, `source skill ${skill}`)) {
      add("skill", `${skill}/${file.relativePath}`, `skills/${skill}/${file.relativePath}`, file.path);
    }
  }
  for (const [skill, subdir, file] of INSTALLER_AGENTS) {
    add("agent", `${skill}/${subdir}/${file}`, `agents/${file}`, join(sourceRoot, skill, subdir, file));
  }
  const profileCount = entries.filter((entry) => entry.kind === "agent").length;
  if (profileCount !== 12) blocked("source manifest did not contain exactly twelve installer-mapped profiles", { profileCount });
  const protocol = entries.find((entry) => entry.sourceRelativePath === "deep-review/lib/protocol.mjs");
  if (!protocol) blocked("source manifest did not contain deep-review/lib/protocol.mjs");
  return { entries, protocol };
}

function sourceFingerprint(sourceEntries) {
  return sourceEntries.map(({ sourceRelativePath, bytes, sha256 }) => ({ path: sourceRelativePath, bytes, sha256 }));
}

function fixtureDescriptor(fixtureRoot) {
  const normalized = comparePath(fixtureRoot).replaceAll("\\", "/");
  if (!normalized.endsWith(`/${EXPECTED_FIXTURE_SUFFIX}`.toLowerCase())) blocked("--fixture is not the approved immutable NATIVE-06 fixture path");
  const receiptPath = join(fixtureRoot, ".omp/state/t009c/git-source-receipt.json");
  const diffPath = join(fixtureRoot, ".omp/state/t009c/actual-diff.patch");
  ensureRegular(receiptPath, "immutable fixture receipt");
  ensureRegular(diffPath, "immutable fixture diff");
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch (error) {
    blocked("immutable fixture receipt is not valid JSON", { error: safeError(error) });
  }
  if (!receipt || receipt.schema !== "git-fixture-receipt-v1") blocked("immutable fixture receipt schema is not git-fixture-receipt-v1");
  if (receipt.base_revision !== EXPECTED_FIXTURE_BASE_REVISION || receipt.head_revision !== EXPECTED_FIXTURE_REVISION || receipt.head_ref !== "HEAD") blocked("immutable fixture receipt revision binding is not the approved revision");
  const diffBytes = readFileSync(diffPath);
  const diffSha = sha256Bytes(diffBytes);
  if (diffSha !== EXPECTED_FIXTURE_DIFF_SHA256 || receipt.diff_sha256 !== diffSha) blocked("immutable fixture diff hash does not match the approved receipt");
  if (!Array.isArray(receipt.files) || receipt.files.length === 0 || !Array.isArray(receipt.consumer_paths) || receipt.consumer_paths.length !== 1 || receipt.consumer_paths[0] !== "src/checkout-good.mjs") blocked("immutable fixture receipt did not enumerate the approved changed/consumer files");
  const files = [];
  for (const relativePath of receipt.files) {
    if (typeof relativePath !== "string" || relativePath === "" || isAbsolute(relativePath) || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) blocked("immutable fixture receipt contains an unsafe file path", { path: relativePath });
    const path = join(fixtureRoot, relativePath);
    ensureRegular(path, `immutable fixture file ${relativePath}`);
    const bytes = readFileSync(path);
    files.push({ path, relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
  }
  return {
    root: fixtureRoot,
    receiptPath,
    diffPath,
    receiptSha256: sha256Bytes(readFileSync(receiptPath)),
    baseRevision: receipt.base_revision,
    revision: receipt.head_revision,
    diff: { path: diffPath, bytes: diffBytes.byteLength, sha256: diffSha },
    files,
    consumerPaths: [...receipt.consumer_paths],
  };
}

function copyFixtureToProject(descriptor, projectRoot) {
  const copied = [];
  for (const entry of descriptor.files) copied.push(copyExact(entry.path, join(projectRoot, entry.relativePath), `copy fixture ${entry.relativePath}`));
  copied.push(copyExact(descriptor.receiptPath, join(projectRoot, ".omp/state/t009c/git-source-receipt.json"), "copy fixture receipt"));
  copied.push(copyExact(descriptor.diffPath, join(projectRoot, ".omp/state/t009c/actual-diff.patch"), "copy fixture diff"));
  return copied;
}

function installSourceOverlay(manifest, projectRoot) {
  const copies = [];
  for (const entry of manifest.entries) {
    const destination = join(projectRoot, ".omp", entry.destinationRelative);
    const copy = copyExact(entry.sourcePath, destination, `copy source ${entry.sourceRelativePath}`);
    if (copy.sha256 !== entry.sha256 || copy.bytes !== entry.bytes) blocked(`source overlay hash mismatch for ${entry.sourceRelativePath}`);
    copies.push({ ...copy, entry });
  }
  return copies;
}

function createProjectConfig(projectRoot) {
  const configPath = join(projectRoot, ".omp/config.yml");
  const config = "task:\n  disabledAgents:\n    - deep-reviewer\n";
  writeFreshFile(configPath, Buffer.from(config, "utf8"), "project-only disabledAgents config");
  return { path: configPath, bytes: Buffer.byteLength(config, "utf8"), sha256: sha256Text(config), content: config };
}

function createOmpEnvironment() {
  const env = { ...process.env };
  for (const key of ["NODE_OPTIONS", "BASH_ENV", "ENV"]) delete env[key];
  for (const key of ["PI_CODING_AGENT_DIR", "PI_BLOCKED_AGENT", "OMP_CONFIG", "OMP_CONFIG_PATH", "PI_CONFIG"]) {
    if (env[key] !== undefined && env[key] !== "") blocked(`ambient global/agent override ${key} is present; refusing to reinterpret the native session`);
  }
  return env;
}

function normalizeModel(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const provider = typeof value.provider === "string" ? value.provider : null;
  const id = typeof value.id === "string" ? value.id : typeof value.modelId === "string" ? value.modelId : null;
  return provider && id ? { provider, id } : null;
}

function publicFinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const key of FINDING_FIELDS) if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = typeof value[key] === "string" ? scrubText(value[key], 4096) : sanitizeValue(value[key]);
  return result;
}

function publicReviewData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return typeof value === "string" ? scrubText(value) : value;
  const result = {};
  for (const key of PUBLIC_REVIEW_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (key === "findings") result.findings = Array.isArray(value.findings) ? value.findings.map(publicFinding) : sanitizeValue(value.findings);
    else result[key] = typeof value[key] === "string" ? scrubText(value[key], 4096) : sanitizeValue(value[key]);
  }
  return result;
}


function publicAggregateData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = {};
  for (const key of ["status", "protocol_mode", "reviewed_revision", "fallback_agent"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = typeof value[key] === "string" ? scrubText(value[key], 4096) : sanitizeValue(value[key]);
  }
  if (Array.isArray(value.reviewers)) result.reviewers = value.reviewers.map((item) => scrubText(item, 256));
  if (Array.isArray(value.reviewer_instances)) result.reviewer_instances = value.reviewer_instances.map((item) => ({
    id: typeof item?.id === "string" ? scrubText(item.id, 256) : null,
    agent: typeof item?.agent === "string" ? scrubText(item.agent, 256) : null,
  }));
  if (value.counts && typeof value.counts === "object" && !Array.isArray(value.counts)) result.counts = sanitizeValue(value.counts);
  if (Array.isArray(value.findings)) result.findings = value.findings.map(publicFinding);
  if (Array.isArray(value.blockers)) result.blockers = value.blockers.map(publicFinding).filter(Boolean);
  return result;
}

function safeYieldEntries(value) {
  if (!Array.isArray(value)) return null;
  return value.slice(0, 96).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { malformed: true };
    const result = {};
    result.observed_keys = Object.keys(item).filter((key) => !sensitiveKey(key)).sort();
    for (const key of ["id", "taskId", "task_id", "jobId", "job_id", "subagentId", "subagent_id", "status", "type", "complete", "useLastTurn", "schemaOverridden"]) if (Object.prototype.hasOwnProperty.call(item, key)) result[key] = sanitizeValue(item[key]);
    if (Object.prototype.hasOwnProperty.call(item, "data")) {
      const labels = Array.isArray(item.type) ? item.type.filter((label) => typeof label === "string" && label.trim() !== "") : [];
      if (labels.includes("findings")) {
        result.data = Array.isArray(item.data)
          ? item.data.map(publicFinding)
          : publicFinding(item.data);
      } else if (labels.length === 0 || labels.every((label) => PUBLIC_REVIEW_FIELDS.has(label))) {
        result.data = publicReviewData(item.data);
      } else {
        result.data_omitted = "non-public yield label";
      }
    }
    if (Object.prototype.hasOwnProperty.call(item, "error")) result.error = safeError(item.error);
    return result;
  });
}

function safeProgress(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return null;
  const result = {};
  result.observed_keys = Object.keys(progress).filter((key) => !sensitiveKey(key)).sort();
  for (const key of [
    "index", "id", "agent", "agentSource", "status", "exitCode", "durationMs", "toolCount", "requests", "tokens",
    "contextTokens", "contextWindow", "resolvedThinkingLevel", "resolvedModelIsFallback", "assignment_sha256", "task_sha256",
  ]) if (Object.prototype.hasOwnProperty.call(progress, key)) result[key] = typeof progress[key] === "string" ? scrubText(progress[key], 256) : sanitizeValue(progress[key]);
  const exitKey = ["exitCode", "exit_code"].find((candidate) => Object.prototype.hasOwnProperty.call(progress, candidate));
  result.exit_code_observed = Boolean(exitKey && Number.isInteger(progress[exitKey]));
  if (exitKey) result.exitCode = Number.isInteger(progress[exitKey]) ? progress[exitKey] : null;
  for (const [target, candidates] of [
    ["resolvedModel", ["resolvedModel", "resolved_model"]],
    ["resolvedModelIdentity", ["resolvedModelIdentity", "resolved_model_identity"]],
  ]) {
    const key = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(progress, candidate));
    if (key) result[target] = normalizeModel(progress[key]);
  }
  for (const [target, candidates] of [
    ["assignment_sha256", ["assignment_sha256", "assignmentSha256"]],
    ["task_sha256", ["task_sha256", "taskSha256"]],
  ]) {
    const key = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(progress, candidate));
    if (key) result[target] = typeof progress[key] === "string" ? scrubText(progress[key], 256) : sanitizeValue(progress[key]);
  }
  const directYield = safeYieldEntries(progress.yield);
  if (directYield !== null) {
    result.yield = directYield;
    result.yield_source = "progress.yield";
  } else if (progress.extractedToolData && typeof progress.extractedToolData === "object") {
    const extracted = safeYieldEntries(progress.extractedToolData.yield);
    if (extracted !== null) {
      result.yield = extracted;
      result.yield_source = "progress.extractedToolData.yield";
    }
  }
  if (progress.structuredOutput && typeof progress.structuredOutput === "object") {
    result.structuredOutput = {};
    for (const key of ["schema", "schemaSource", "status", "valid", "validation"]) if (Object.prototype.hasOwnProperty.call(progress.structuredOutput, key)) result.structuredOutput[key] = sanitizeValue(progress.structuredOutput[key]);
  }
  if (progress.status && !SUCCESS_STATUSES.has(String(progress.status).toLowerCase()) && TERMINAL_STATUSES.has(String(progress.status).toLowerCase())) result.failure = safeError(progress.error ?? progress.status);
  return result;
}

function extractToolName(frame) {
  const candidates = [
    frame?.toolName, frame?.tool_name, frame?.tool, frame?.name, frame?.tool?.name,
    frame?.event?.toolName, frame?.event?.tool_name, frame?.event?.tool, frame?.event?.name,
    frame?.event?.tool?.name, frame?.payload?.toolName, frame?.payload?.tool_name,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim() !== "")?.trim() ?? null;
}

function extractToolCallId(frame) {
  const candidates = [
    frame?.toolCallId, frame?.tool_call_id, frame?.toolExecutionId, frame?.tool_execution_id,
    frame?.callID, frame?.callId, frame?.call_id, frame?.event?.toolCallId, frame?.payload?.toolCallId,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim() !== "") ?? null;
}

function findObjectField(value, keys, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return undefined;
  const wanted = new Set([...keys].map((key) => String(key).toLowerCase()));
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObjectField(item, wanted, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    if (wanted.has(key.toLowerCase()) && child && typeof child === "object" && !Array.isArray(child)) return child;
  }
  for (const child of Object.values(value)) {
    const found = findObjectField(child, wanted, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function collectReadStrings(value, keys, output = [], depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 128)) collectReadStrings(item, keys, output, depth + 1);
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key.toLowerCase()) && typeof child === "string") output.push(child);
    else if (child && typeof child === "object") collectReadStrings(child, keys, output, depth + 1);
  }
  return output;
}

const READ_ARGUMENT_KEYS = new Set(["path", "paths", "file", "files", "filename", "filepath", "file_path", "target", "url"]);

function extractToolArgs(frame) {
  const candidates = [
    frame?.arguments, frame?.args, frame?.input, frame?.toolCall?.arguments, frame?.tool_call?.arguments,
    frame?.tool?.arguments, frame?.payload?.arguments, findObjectField(frame, new Set(["arguments", "args", "input"])),
  ];
  return candidates.find((value) => value && typeof value === "object" && !Array.isArray(value))
    ?? (frame && typeof frame === "object" && !Array.isArray(frame) ? frame : null);
}

function taskCallShape(frame) {
  const args = extractToolArgs(frame);
  if (!args) return null;
  const forbidden = (key) => TASK_FORBIDDEN_KEYS.has(String(key).toLowerCase());
  const items = Array.isArray(args.tasks) ? args.tasks : [args];
  const shaped = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { malformed: true };
    const keys = Object.keys(item).sort();
    return {
      name: typeof item.name === "string" ? item.name : null,
      agent: typeof item.agent === "string" ? item.agent : null,
      taskSha256: typeof item.task === "string" ? sha256Text(item.task) : null,
      hasSolutionSpace: typeof item.solutionSpace === "string" && item.solutionSpace.trim() !== "",
      hasForbiddenField: keys.some(forbidden),
      keys,
    };
  });
  return {
    tool: extractToolName(frame),
    call_id: extractToolCallId(frame),
    keys: Object.keys(args).sort(),
    hasModelField: Object.keys(args).some(forbidden),
    items: shaped,
  };
}

function stringsForRead(value, output = [], depth = 0) {
  return collectReadStrings(value, READ_ARGUMENT_KEYS, output, depth);
}
function explicitExitCode(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return undefined;
  for (const key of ["exitCode", "exit_code"]) if (Number.isInteger(value[key])) return value[key];
  for (const key of ["result", "details", "event", "payload", "data"]) {
    const found = explicitExitCode(value[key], depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function probeTextCandidates(value, output = [], depth = 0) {
  if (depth > 6 || value === null || value === undefined || output.length >= 48) return output;
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") <= MAX_PROBE_OUTPUT_BYTES) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 32)) probeTextCandidates(item, output, depth + 1);
    return output;
  }
  if (typeof value !== "object") return output;
  for (const key of ["content", "text", "stdout", "output", "result", "data", "details"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) probeTextCandidates(value[key], output, depth + 1);
  }
  return output;
}

function publicProbeOutcome(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const outcome = {
    ok: value.ok === true,
    errors: Array.isArray(value.errors) ? value.errors.filter((item) => typeof item === "string").slice(0, 8).map((item) => scrubText(item, 512)) : [],
    status: typeof value.status === "string" ? scrubText(value.status, 64) : null,
  };
  const actual = value.value && typeof value.value === "object" && !Array.isArray(value.value) ? value.value : null;
  if (actual) outcome.actual = publicReviewData(actual);
  return outcome;
}

function publicChildExecution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const spawnError = value.spawn_error;
  return {
    origin: value.origin === "observed-node-child" ? value.origin : null,
    executable: typeof value.executable === "string" ? scrubText(value.executable, 1024) : null,
    script_path: typeof value.script_path === "string" ? scrubText(value.script_path, 1024) : null,
    script_sha256: SHA256.test(String(value.script_sha256 ?? "")) ? String(value.script_sha256).toLowerCase() : null,
    argv_sha256: SHA256.test(String(value.argv_sha256 ?? "")) ? String(value.argv_sha256).toLowerCase() : null,
    exit_code: Number.isInteger(value.exit_code) ? value.exit_code : null,
    exit_code_observed: value.exit_code_observed === true,
    signal: value.signal === null || typeof value.signal === "string" ? value.signal : null,
    signal_observed: value.signal_observed === true && Object.hasOwn(value, "signal") && (value.signal === null || typeof value.signal === "string"),
    spawn_error: spawnError === null
      ? null
      : {
        name: typeof spawnError?.name === "string" ? scrubText(spawnError.name, 128) : null,
        code: typeof spawnError?.code === "string" ? scrubText(spawnError.code, 128) : null,
      },
  };
}

function validateObservedChildExecution(output, probe) {
  const child = output?.child_execution;
  const helper = probe.files.find((entry) => samePath(entry.path, probe.helperPath));
  if (!child || child.origin !== "observed-node-child"
    || child.exit_code_observed !== true || child.exit_code !== 0
    || child.signal_observed !== true || child.signal !== null || child.spawn_error !== null
    || typeof child.executable !== "string" || typeof probe.executable !== "string"
    || typeof child.script_path !== "string" || !samePath(child.executable, probe.executable)
    || !samePath(child.script_path, probe.helperPath)
    || !helper || child.script_sha256 !== helper.sha256
    || child.argv_sha256 !== probe.child_argv_sha256
    || !Array.isArray(probe.child_argv)
    || probe.child_argv_sha256 !== sha256Text(JSON.stringify(probe.child_argv))) {
    blocked("Native05 helper did not expose an independently bound successful child execution");
  }
  return child;
}

function publicProbePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schema !== PEER_WIRE_PROBE_SCHEMA) return null;
  const output = { schema: PEER_WIRE_PROBE_SCHEMA };
  if (value.source && typeof value.source === "object") {
    output.source = {
      path: typeof value.source.path === "string" ? scrubText(value.source.path, 1024) : null,
      bytes: Number.isSafeInteger(value.source.bytes) ? value.source.bytes : null,
      sha256: SHA256.test(String(value.source.sha256 ?? "")) ? String(value.source.sha256).toLowerCase() : null,
    };
  }
  if (value.inputs && typeof value.inputs === "object") {
    output.inputs = {};
    for (const key of ["valid", "malformed"]) {
      const item = value.inputs[key];
      if (!item || typeof item !== "object") continue;
      output.inputs[key] = {
        path: typeof item.path === "string" ? scrubText(item.path, 1024) : null,
        bytes: Number.isSafeInteger(item.bytes) ? item.bytes : null,
        sha256: SHA256.test(String(item.sha256 ?? "")) ? String(item.sha256).toLowerCase() : null,
        payload_sha256: SHA256.test(String(item.payload_sha256 ?? "")) ? String(item.payload_sha256).toLowerCase() : null,
      };
    }
  }
  if (value.expected && typeof value.expected === "object") {
    output.expected = {
      agent: typeof value.expected.agent === "string" ? scrubText(value.expected.agent, 64) : null,
      protocol_mode: typeof value.expected.protocol_mode === "string" ? scrubText(value.expected.protocol_mode, 64) : null,
      reviewed_revision: typeof value.expected.reviewed_revision === "string" ? scrubText(value.expected.reviewed_revision, 128) : null,
      receipt_sha256: SHA256.test(String(value.expected.receipt_sha256 ?? "")) ? String(value.expected.receipt_sha256).toLowerCase() : null,
    };
  }
  if (value.outcomes && typeof value.outcomes === "object") {
    output.outcomes = {
      valid: publicProbeOutcome(value.outcomes.valid),
      malformed: publicProbeOutcome(value.outcomes.malformed),
    };
  }
  output.controlled_corruption = value.controlled_corruption && typeof value.controlled_corruption === "object"
    ? {
      kind: typeof value.controlled_corruption.kind === "string" ? scrubText(value.controlled_corruption.kind, 96) : null,
      field: typeof value.controlled_corruption.field === "string" ? scrubText(value.controlled_corruption.field, 96) : null,
    }
    : null;
  output.producer_malformed = value.producer_malformed === false ? false : null;
  output.owned_input_origin = value.owned_input_origin === "controlled-local-fixture" ? value.owned_input_origin : null;
  if (Object.hasOwn(value, "child_execution")) output.child_execution = publicChildExecution(value.child_execution);
  return output;
}

function parseProbePayload(value) {
  const direct = publicProbePayload(value);
  if (direct) return direct;
  for (const text of probeTextCandidates(value)) {
    try {
      const body = text.trim().replace(/\r?\n(?:\r?\n)+Wall time: \d+\.\d{2} seconds$/u, "");
      const parsed = JSON.parse(body);
      const output = publicProbePayload(parsed);
      if (output) return output;
    } catch {
      // Only bounded JSON plus the pinned SDK timing notice is transport; arbitrary prose is not evidence.
    }
  }
  return null;
}

function probeFileRecord(file, label) {
  ensureRegular(file, label);
  const bytes = readFileSync(file);
  return { path: file, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}

function shellCommandArgument(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:\\-]+$/.test(text)) return text.replaceAll("\\", "/");
  return "'" + text.replaceAll("'", "'\\''") + "'";
}

function safeToolResult(value) {
  if (!value || typeof value !== "object") return { kind: typeof value, raw: opaque(value) };
  const result = {};
  for (const key of ["status", "success", "isError", "failed", "aborted", "code", "exitCode", "exit_code", "toolName"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = sanitizeValue(value[key]);
  }
  const raw = opaque(value);
  result.result_sha256 = raw.sha256;
  result.result_bytes = raw.bytes;
  const textCandidates = [];
  const collectText = (node, depth = 0) => {
    if (depth > 5 || node === null || node === undefined) return;
    if (typeof node === "string") {
      textCandidates.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node.slice(0, 32)) collectText(child, depth + 1);
      return;
    }
    if (typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        if (/^(?:prompt|messages|reasoning|thinking)$/i.test(key)) continue;
        if (/^(?:text|message|error|output|stderr|finalError|errorMessage|code|name|status|isError|success|content|result|data)$/i.test(key)) collectText(child, depth + 1);
      }
    }
  };
  collectText(value);
  const text = textCandidates.find((item) => item.trim() !== "") ?? "";
  if (text) {
    result.text_sha256 = sha256Text(text);
    result.text_bytes = Buffer.byteLength(text, "utf8");
  }
  const probe = parseProbePayload(value);
  if (probe) result.probe_output = probe;
  result.disabled_agent = textCandidates.some((item) => /(?:agent|task|deep[-_ ]?reviewer).{0,80}(?:disabled|not available)|(?:disabled|not available).{0,80}(?:agent|task|deep[-_ ]?reviewer)|(?:e[_-]?)?agent[_-]?disabled|disabled[_-]?agent/i.test(item));
  result.preflight_error = textCandidates.some((item) => /(?:preflight|cannot spawn|not available|unknown agent|disabled[_-]?(?:agent|task))/i.test(item));
  return result;
}
function trustedBooleanState(nodes, keys) {
  const values = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    for (const key of keys) if (typeof node[key] === "boolean") values.push(node[key]);
  }
  return {
    present: values.length > 0,
    positive: values.includes(true),
    negative: values.includes(false),
    contradictory: values.includes(true) && values.includes(false),
  };
}

function successfulReadEnd(frame) {
  if (frame?.type !== "tool_execution_end" || !/^read(?:$|[_.:])/i.test(String(extractToolName(frame) ?? ""))) return false;
  const result = frame.result ?? frame.output ?? frame.error;
  const success = trustedBooleanState([frame, result], ["success"]);
  const failure = trustedBooleanState([frame, result], ["isError", "is_error", "failed"]);
  const content = typeof result === "string" ? result : result?.content;
  const observedContent = typeof content === "string" ? content.length > 0
    : Array.isArray(content) && content.some((item) => item?.type === "text" && typeof item.text === "string" && item.text.length > 0);
  return observedContent && frame.error === undefined && frame.aborted !== true && result?.aborted !== true
    && frame.isError === false
    && !success.contradictory
    && !success.negative
    && !failure.positive
    && !failure.contradictory;
}


function findNested(value, predicate, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return null;
  if (predicate(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 48)) {
      const found = findNested(item, predicate, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value)) {
      const found = findNested(child, predicate, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function safeTaskDetails(value) {
  const details = findNested(value, (node) => node && typeof node === "object" && !Array.isArray(node) && (Array.isArray(node.results) || Array.isArray(node.progress)));
  if (!details) return null;
  const output = {};
  for (const key of ["totalDurationMs", "async", "projectAgentsDir"]) if (Object.prototype.hasOwnProperty.call(details, key)) output[key] = sanitizeValue(details[key]);
  for (const field of ["results", "progress"]) {
    if (!Array.isArray(details[field])) continue;
    output[field] = details[field].slice(0, 32).map((item) => {
      if (!item || typeof item !== "object") return { malformed: true };
      const result = {};
      for (const key of ["id", "agent", "agentSource", "status", "exitCode", "aborted", "durationMs", "resolvedThinkingLevel", "resolvedModelIsFallback"]) if (Object.prototype.hasOwnProperty.call(item, key)) result[key] = sanitizeValue(item[key]);
      if (item.resolvedModel) result.resolvedModel = normalizeModel(item.resolvedModel);
      if (item.resolvedModelIdentity) result.resolvedModelIdentity = normalizeModel(item.resolvedModelIdentity);
      if (item.structuredOutput && typeof item.structuredOutput === "object") result.structuredOutput = { status: sanitizeValue(item.structuredOutput.status), valid: sanitizeValue(item.structuredOutput.valid) };
      if (item.error !== undefined) result.error = safeError(item.error);
      return result;
    });
  }
  return output;
}

function makeDeferred() {
  let resolveValue;
  let rejectValue;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolveValue = resolvePromise;
    rejectValue = rejectPromise;
  });
  return { promise, resolve: resolveValue, reject: rejectValue };
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DriverError("BLOCKED", `${label} timed out`)), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function validateProbeInvocation(args, probe, cwd) {
  if (!args || typeof args !== "object" || Array.isArray(args)) blocked("configured probe Bash call omitted an object argument envelope");
  const keys = Object.keys(args);
  if (keys.some((key) => !["command", "cwd"].includes(key))) blocked("configured probe Bash call contained an unapproved argument override");
  if (args.command !== probe.command) blocked("configured probe Bash command was not the exact approved absolute command");
  if (args.cwd !== undefined && (!samePath(args.cwd, cwd) || !samePath(args.cwd, probe.cwd))) blocked("configured probe Bash cwd did not match the private project");
  return { command: probe.command, cwd: probe.cwd, cwd_observed: args.cwd ?? cwd };
}

class RpcSession {
  constructor({ omp, cwd, env, timeoutMs, evidence, probe = null }) {
    this.omp = omp;
    this.cwd = cwd;
    this.env = env;
    this.timeoutMs = timeoutMs;
    this.evidence = evidence;
    this.probe = probe;
    this.child = null;
    this.buffer = Buffer.alloc(0);
    this.chunk = null;
    this.protocolVersion = 1;
    this.readyResolved = false;
    this.fatal = null;
    this.ready = makeDeferred();
    this.closeDeferred = makeDeferred();
    this.pendingResponses = new Map();
    this.promptResults = new Map();
    this.settledWaiters = [];
    this.settled = false;
    this.sequence = 0;
    this.openTools = new Map();
  }

  start() {
    const argv = ["--mode", "rpc", "--no-ui", "--no-session", "--no-extensions", "--no-context-files", "--no-lsp", "--no-title"];
    this.evidence.rpc.argv = argv;
    this.child = spawn(this.omp, argv, { cwd: this.cwd, env: this.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child.stdout.on("data", (data) => this.onStdout(Buffer.from(data)));
    this.child.stdout.on("error", (error) => this.fail(new DriverError("BLOCKED", "OMP stdout failed", { error: safeError(error) })));
    this.child.stderr.on("data", (data) => { this.evidence.rpc.stderr_bytes = (this.evidence.rpc.stderr_bytes ?? 0) + data.byteLength; });
    this.child.stderr.on("error", (error) => this.fail(new DriverError("BLOCKED", "OMP stderr failed", { error: safeError(error) })));
    this.child.stdin.on("error", (error) => this.fail(new DriverError("BLOCKED", "OMP stdin failed", { error: safeError(error) })));
    this.child.on("error", (error) => this.fail(new DriverError("BLOCKED", "OMP process failed", { error: safeError(error) })));
    this.child.on("close", (code, signal) => {
      this.evidence.rpc.process = { exit_code: code, signal: signal ?? null };
      if (this.buffer.length > 0) this.fail(new DriverError("BLOCKED", "OMP closed with a partial RPC frame"));
      if (this.chunk) this.fail(new DriverError("BLOCKED", "OMP closed during rpc_chunk reassembly"));
      this.closeDeferred.resolve({ code, signal });
      if (!this.readyResolved) this.ready.reject(new DriverError("BLOCKED", "OMP closed before ready"));
      for (const waiter of this.pendingResponses.values()) waiter.reject(new DriverError("BLOCKED", "OMP closed before response"));
      this.pendingResponses.clear();
      for (const waiter of this.promptResults.values()) waiter.reject(new DriverError("BLOCKED", "OMP closed before prompt_result"));
      this.promptResults.clear();
    });
    return withTimeout(this.ready.promise, this.timeoutMs, "OMP ready");
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
    this.buffer = Buffer.concat([this.buffer, data]);
    while (true) {
      const newline = this.buffer.indexOf(0x0a);
      if (newline < 0) {
        if (this.buffer.byteLength > MAX_PHYSICAL_FRAME_BYTES) this.fail(new DriverError("BLOCKED", "RPC physical frame exceeded 1 MiB without newline"));
        return;
      }
      const line = this.buffer.subarray(0, newline);
      this.buffer = this.buffer.subarray(newline + 1);
      if (line.byteLength + 1 > MAX_PHYSICAL_FRAME_BYTES) {
        this.fail(new DriverError("BLOCKED", "RPC physical frame exceeded 1 MiB"));
        return;
      }
      const withoutCr = line.at(-1) === 0x0d ? line.subarray(0, line.length - 1) : line;
      if (withoutCr.length === 0) continue;
      let frame;
      try {
        frame = JSON.parse(DECODER.decode(withoutCr));
      } catch (error) {
        this.fail(new DriverError("BLOCKED", "invalid RPC frame", { error: safeError(error) }));
        return;
      }
      try {
        this.consumePhysical(frame);
      } catch (error) {
        this.fail(error instanceof DriverError ? error : new DriverError("BLOCKED", "RPC frame consumer failed", { error: safeError(error) }));
        return;
      }
      if (this.fatal) return;
    }
  }

  consumePhysical(frame) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new DriverError("BLOCKED", "RPC frame is not an object");
    if (frame.type === "rpc_chunk") {
      if (this.protocolVersion !== 2) throw new DriverError("BLOCKED", "rpc_chunk arrived before protocol v2");
      const { chunkId, index, count, byteLength, data } = frame;
      if (typeof chunkId !== "string" || !Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(count) || count < 1 || index >= count || !Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_REASSEMBLED_FRAME_BYTES || typeof data !== "string") throw new DriverError("BLOCKED", "invalid rpc_chunk metadata");
      const decoded = Buffer.from(data, "base64");
      if (decoded.toString("base64") !== data) throw new DriverError("BLOCKED", "non-canonical rpc_chunk base64");
      if (!this.chunk) {
        if (index !== 0) throw new DriverError("BLOCKED", "rpc_chunk did not start at index zero");
        this.chunk = { chunkId, index: 0, count, byteLength, chunks: [], total: 0 };
      }
      if (this.chunk.chunkId !== chunkId || this.chunk.count !== count || this.chunk.byteLength !== byteLength || this.chunk.index !== index) throw new DriverError("BLOCKED", "interleaved rpc_chunk sequence");
      this.chunk.chunks.push(decoded);
      this.chunk.total += decoded.byteLength;
      this.chunk.index += 1;
      if (this.chunk.total > MAX_REASSEMBLED_FRAME_BYTES || this.chunk.total > byteLength) throw new DriverError("BLOCKED", "rpc_chunk exceeded declared size");
      if (this.chunk.index === this.chunk.count) {
        if (this.chunk.total !== byteLength) throw new DriverError("BLOCKED", "rpc_chunk length mismatch");
        const bytes = Buffer.concat(this.chunk.chunks, this.chunk.total);
        this.chunk = null;
        this.consumeLogical(JSON.parse(DECODER.decode(bytes)));
      }
      return;
    }
    if (this.chunk) throw new DriverError("BLOCKED", "rpc_chunk sequence interrupted");
    this.consumeLogical(frame);
  }

  consumeLogical(frame) {
    const sequence = ++this.sequence;
    if (frame.type === "ready") {
      this.readyResolved = true;
      this.evidence.rpc.ready = {
        protocolVersion: frame.protocolVersion,
        supportedProtocolVersions: Array.isArray(frame.supportedProtocolVersions) ? frame.supportedProtocolVersions.filter(Number.isInteger) : [],
        maxFrameBytes: frame.maxFrameBytes,
        maxReassembledFrameBytes: frame.maxReassembledFrameBytes,
      };
      this.ready.resolve(frame);
      return;
    }
    if (frame.type === "response") {
      const safe = {
        sequence,
        id: typeof frame.id === "string" && UUID_V4.test(frame.id) ? frame.id : null,
        command: typeof frame.command === "string" ? frame.command : null,
        success: frame.success === true,
        code: typeof frame.code === "string" ? frame.code : null,
        error: frame.success === false ? safeError(frame.error) : null,
        data_keys: frame.data && typeof frame.data === "object" ? Object.keys(frame.data).filter((key) => !sensitiveKey(key)).sort() : [],
      };
      this.evidence.responses.push(safe);
      const details = safeTaskDetails(frame.data);
      if (details) this.evidence.task_details.push({ sequence, origin: "response", details });
      const waiter = typeof frame.id === "string" ? this.pendingResponses.get(frame.id) : null;
      if (waiter) {
        this.pendingResponses.delete(frame.id);
        waiter.resolve(frame);
      }
      return;
    }
    if (frame.type === "prompt_result") {
      this.evidence.prompt_result = {
        sequence,
        id: typeof frame.id === "string" && UUID_V4.test(frame.id) ? frame.id : null,
        status: typeof frame.status === "string" ? frame.status : null,
        agentInvoked: frame.agentInvoked === true,
        sessionSettled: frame.sessionSettled === true,
        error: frame.error ? safeError(frame.error) : null,
      };
      const waiter = typeof frame.id === "string" ? this.promptResults.get(frame.id) : null;
      if (waiter) {
        this.promptResults.delete(frame.id);
        waiter.resolve(frame);
      }
      return;
    }
    if (frame.type === "session_settled") {
      this.settled = true;
      this.evidence.session_settled = true;
      for (const waiter of this.settledWaiters) waiter.resolve(frame);
      this.settledWaiters = [];
      return;
    }
    if (frame.type === "tool_execution_start" || frame.type === "tool_execution_end") {
      const toolName = extractToolName(frame);
      const isProbeBash = /^bash(?:$|[_.:])/i.test(String(toolName ?? ""));
      if (!toolName || (!isProbeBash && (FORBIDDEN_TOOL.test(toolName) || !ALLOWED_ROOT_TOOL.test(toolName))) || (isProbeBash && !this.probe)) {
        throw new DriverError("BLOCKED", `forbidden or unknown native root tool ${toolName ?? "<unknown>"}`);
      }
      if (this.probe && !isProbeBash && !PEER_WIRE_ROOT_TOOL.test(toolName)) {
        throw new DriverError("BLOCKED", `tool is outside the peer-wire allowlist: ${toolName}`);
      }
      if (this.probe && frame.type === "tool_execution_start" && this.evidence.probe_bash_start) {
        throw new DriverError("BLOCKED", "peer-wire Root started another operation after the approved Bash START");
      }
      const callId = extractToolCallId(frame);
      const item = { sequence, event: frame.type, toolName, toolCallId: callId };
      if (frame.type === "tool_execution_start") {
        const args = extractToolArgs(frame);
        if (isProbeBash) {
          if (this.evidence.probe_bash_start) throw new DriverError("BLOCKED", "configured probe Bash was invoked more than once");
          item.probe = validateProbeInvocation(args, this.probe, this.cwd);
          this.evidence.probe_bash_start = {
            sequence,
            tool_call_id: callId,
            command: this.probe.command,
            cwd: this.probe.cwd,
          };
        }
        const task = /^tasks?(?:$|[_:.])/i.test(toolName) ? taskCallShape(frame) : null;
        if (task) {
          item.taskCall = { ...task, sequence };
          this.evidence.task_calls.push(item.taskCall);
        }
        if (/^read(?:$|[_:.])/i.test(toolName)) {
          const paths = stringsForRead(args ?? {});
          item.readPaths = paths.map((value) => scrubText(value));
          this.evidence.read_events.push({ sequence, call_id: callId, paths: item.readPaths, success: null, end_sequence: null });
        }
        this.openTools.set(callId ?? `sequence:${sequence}`, item);
        this.evidence.tool_events.push(item);
        const details = safeTaskDetails(frame.result ?? frame.output ?? frame.error);
        if (details) this.evidence.task_details.push({ sequence, origin: "tool_execution", details });
      } else {
        const start = this.openTools.get(callId ?? "");
        if (/^read(?:$|[_:.])/i.test(toolName) && (!callId || !start?.readPaths || start.toolName !== toolName)) blocked("Root READ END was not correlated to its START");
        if (isProbeBash && (!start?.probe || !this.evidence.probe_bash_start || this.evidence.probe_bash_start.tool_call_id !== callId)) {
          throw new DriverError("BLOCKED", "configured probe Bash END was not correlated to its START");
        }
        const exitCode = explicitExitCode(frame);
        const rawIsError = typeof frame.isError === "boolean" ? frame.isError : null;
        const result = frame.result ?? frame.output ?? frame.error;
        const safe = safeToolResult(result);
        if (isProbeBash) {
          item.probe_end = {
            sequence,
            tool_call_id: callId,
            is_error: rawIsError,
            is_error_observed: rawIsError !== null,
            exit_code: Number.isInteger(exitCode) ? exitCode : null,
            exit_code_observed: Number.isInteger(exitCode),
            output: safe.probe_output ?? null,
          };
          this.evidence.probe_bash_end = item.probe_end;
        }
        item.result = safe;
        if (start?.readPaths) {
          for (const event of this.evidence.read_events.filter((entry) => entry.call_id === (callId ?? null) && entry.success === null)) {
            event.success = successfulReadEnd(frame);
            event.end_sequence = sequence;
          }
        }
        if (start?.taskCall && item.result) start.taskResult = item.result;
        this.openTools.delete(callId ?? "");
        this.evidence.tool_events.push(item);
        const details = safeTaskDetails(frame.result ?? frame.output ?? frame.error);
        if (details) this.evidence.task_details.push({ sequence, origin: "tool_execution", details });
        if (isProbeBash) {
          if (rawIsError !== false) throw new DriverError("BLOCKED", "configured probe Bash END did not expose raw isError:false");
          if (Number.isInteger(exitCode) && exitCode !== 0) throw new DriverError("BLOCKED", "configured probe helper exited nonzero");
          if (!safe.probe_output) throw new DriverError("BLOCKED", "configured probe Bash stdout did not contain the bounded helper JSON");
          if (!Number.isInteger(exitCode) && !safe.probe_output.child_execution) throw new DriverError("BLOCKED", "configured probe Bash END omitted both SDK exitCode and observed child execution");
        }
        return;
      }
    }
    if (frame.type === "subagent_lifecycle" || frame.type === "subagent_progress" || frame.type === "subagent_event") {
      const payload = frame.payload && typeof frame.payload === "object" ? frame.payload : frame.event && typeof frame.event === "object" ? frame.event : frame.data && typeof frame.data === "object" ? frame.data : frame;
      const nestedEvent = frame.type === "subagent_event" && payload.event && typeof payload.event === "object" ? payload.event : null;
      const progress = payload.progress && typeof payload.progress === "object" ? payload.progress : frame.type === "subagent_progress" ? payload : null;
      const id = [payload.id, progress?.id, frame.agentId, frame.agent_id, frame.taskId, frame.task_id, frame.id].find((value) => typeof value === "string" && value.trim() !== "") ?? null;
      const agent = progress?.agent ?? payload.agent ?? frame.agent ?? null;
      const agentSource = progress?.agentSource ?? progress?.agent_source ?? payload.agentSource ?? payload.agent_source ?? frame.agentSource ?? frame.agent_source ?? null;
      const status = progress?.status ?? payload.status ?? frame.status ?? null;
      const toolName = nestedEvent ? extractToolName(nestedEvent) : null;
      if (toolName && (FORBIDDEN_TOOL.test(toolName) || /^tasks?(?:$|[_:.])/i.test(toolName))) throw new DriverError("BLOCKED", "native fallback subagent attempted a forbidden/nested tool");
      const safeFrame = { sequence, frame_type: frame.type, id, agent, agentSource, status, payload_keys: Object.keys(payload).filter((key) => !sensitiveKey(key)).sort() };
      if (progress) {
        const safe = safeProgress(progress);
        safeFrame.progress = safe;
        if (safe?.yield) safeFrame.public_yield = safe.yield;
        const statusLower = String(status ?? "").toLowerCase();
        if (TERMINAL_STATUSES.has(statusLower) && id) {
          const terminal = {
            source_kind: "native_subagent_progress",
            frame_type: frame.type,
            sequence,
            id,
            agent: safe?.agent ?? agent ?? null,
            agentSource: safe?.agentSource ?? agentSource ?? null,
            status: safe?.status ?? status ?? null,
            exitCode: Number.isInteger(safe?.exitCode) ? safe.exitCode : null,
            exit_code_observed: safe?.exit_code_observed === true,
            progress: safe,
            yield: safe?.yield ?? null,
            resolvedModel: safe?.resolvedModel ?? null,
            resolvedModelIdentity: safe?.resolvedModelIdentity ?? null,
            resolvedThinkingLevel: safe?.resolvedThinkingLevel ?? null,
            resolvedModelIsFallback: safe?.resolvedModelIsFallback ?? null,
            assignment_sha256: safe?.assignment_sha256 ?? null,
            task_sha256: safe?.task_sha256 ?? null,
          };
          terminal.digest = sha256Text(JSON.stringify(terminal));
          const existing = this.evidence.native_progress_terminal.filter((entry) => entry.id === id);
          if (!existing.some((entry) => entry.digest === terminal.digest)) this.evidence.native_progress_terminal.push(terminal);
        }
      }
      this.evidence.subagent_frames.push(safeFrame);
      return;
    }
    if (frame.type === "message_end" || frame.type === "agent_end") return;
    if (/^(?:extension_ui_request|host_uri_request|host_tool_call|host_uri_cancel|host_tool_cancel)$/i.test(String(frame.type ?? "")) || /login|auth/i.test(String(frame.type ?? ""))) throw new DriverError("BLOCKED", "native session requested host/UI/auth access");
  }

  send(command) {
    if (!this.child || this.child.killed || this.stdinEnded) throw new DriverError("BLOCKED", "cannot send RPC command after termination");
    this.evidence.calls.push({ id: typeof command.id === "string" ? command.id : null, type: command.type, fields: Object.keys(command).filter((key) => !sensitiveKey(key)).sort() });
    try {
      this.child.stdin.write(`${JSON.stringify(command)}\n`);
    } catch (error) {
      this.fail(new DriverError("BLOCKED", "failed to write RPC command", { error: safeError(error) }));
      throw this.fatal;
    }
  }

  request(command, label) {
    const waiter = makeDeferred();
    this.pendingResponses.set(command.id, waiter);
    try {
      this.send(command);
    } catch (error) {
      this.pendingResponses.delete(command.id);
      throw error;
    }
    return withTimeout(waiter.promise, this.timeoutMs, label);
  }

  async configure() {
    const negotiation = await this.request({ id: randomUUID(), type: "negotiate_protocol", protocolVersion: 2 }, "protocol negotiation");
    if (negotiation.success === true) {
      this.protocolVersion = 2;
      this.evidence.rpc.protocol = { version: 2, negotiated: true };
    } else {
      this.protocolVersion = 1;
      this.evidence.rpc.protocol = { version: 1, negotiated: false, error: safeError(negotiation.error) };
    }
    const filter = await this.request({ id: randomUUID(), type: "set_event_filter", events: RPC_EVENTS, messageUpdates: "full" }, "event filter");
    if (filter.success !== true) throw new DriverError("BLOCKED", "OMP rejected event filter");
    this.evidence.rpc.event_filter = Array.isArray(filter.data?.events) ? filter.data.events : null;
    const subscription = await this.request({ id: randomUUID(), type: "set_subagent_subscription", level: "events" }, "subagent subscription");
    if (subscription.success !== true) throw new DriverError("BLOCKED", "OMP rejected subagent event subscription");
    this.evidence.rpc.subagent_subscription = "events";
  }

  async execute(prompt) {
    await this.start();
    await this.configure();
    const promptId = randomUUID();
    this.evidence.prompt = { sha256: sha256Text(prompt), bytes: Buffer.byteLength(prompt, "utf8") };
    const acknowledgement = makeDeferred();
    const result = makeDeferred();
    this.pendingResponses.set(promptId, acknowledgement);
    this.promptResults.set(promptId, result);
    this.send({ id: promptId, type: "prompt", message: prompt });
    const ack = await withTimeout(acknowledgement.promise, this.timeoutMs, "prompt acknowledgement");
    this.pendingResponses.delete(promptId);
    if (ack.success !== true || ack.data?.agentInvoked === false) throw new DriverError("BLOCKED", "native prompt was not admitted to the root model");
    const promptResult = await withTimeout(result.promise, this.timeoutMs, "prompt_result");
    if (promptResult.status !== "completed" || promptResult.agentInvoked !== true) throw new DriverError("BLOCKED", "native prompt did not complete a root-model turn");
    if (promptResult.sessionSettled !== true) {
      const settled = makeDeferred();
      this.settledWaiters.push(settled);
      await withTimeout(settled.promise, this.timeoutMs, "session_settled");
    }
  }

  async close() {
    if (!this.child || this.stdinEnded) return;
    this.stdinEnded = true;
    this.child.stdin.end();
    const closed = await withTimeout(this.closeDeferred.promise, 30_000, "OMP process drain");
    if (this.fatal) throw this.fatal;
    if (closed.code !== 0) throw new DriverError("BLOCKED", "OMP exited unsuccessfully", { code: closed.code, signal: closed.signal });
  }

  async abort() {
    if (!this.child || this.child.killed) return;
    try {
      if (!this.stdinEnded) this.send({ id: randomUUID(), type: "abort" });
    } catch {
      // The process may already be in a fatal RPC state.
    }
    if (!this.stdinEnded) {
      this.stdinEnded = true;
      this.child.stdin.end();
    }
    await new Promise((resolveValue) => setTimeout(resolveValue, 250));
    if (!this.child.killed) this.child.kill();
  }
}

function normalizeReadTarget(projectRoot, raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (isAbsolute(value)) return comparePath(value);
  return comparePath(resolve(projectRoot, value));
}

function expectedReadSet(projectRoot, fixture, manifest, extraPaths = []) {
  const expected = new Set(DOC_URLS);
  expected.add(comparePath(join(projectRoot, ".omp/config.yml")));
  expected.add(comparePath(join(projectRoot, ".omp/skills/deep-review/lib/protocol.mjs")));
  for (const [, , file] of INSTALLER_AGENTS) expected.add(comparePath(join(projectRoot, ".omp/agents", file)));
  expected.add(comparePath(join(projectRoot, ".omp/state/t009c/git-source-receipt.json")));
  expected.add(comparePath(join(projectRoot, ".omp/state/t009c/actual-diff.patch")));
  for (const entry of fixture.files) expected.add(comparePath(join(projectRoot, entry.relativePath)));
  for (const extra of extraPaths) expected.add(/^https?:\/\//i.test(extra) ? extra : comparePath(extra));
  return expected;
}

function reviewInput(projectRoot, fixture) {
  const filePaths = fixture.files.map((entry) => join(projectRoot, entry.relativePath));
  return [
    `NATIVE-06 source fixture is immutable and already collected at revision ${fixture.revision}; do not create, mutate, checkout, branch, commit, or invoke Git.`,
    `The copied fixture receipt is ${join(projectRoot, ".omp/state/t009c/git-source-receipt.json")}; the copied exact diff is ${join(projectRoot, ".omp/state/t009c/actual-diff.patch")}; diff_sha256=${fixture.diff.sha256}; diff_bytes=${fixture.diff.bytes}.`,
    `The receipt enumerates these exact changed/consumer files; read each before dispatch: ${filePaths.join(", ")}.`,
    `The only project settings change is ${join(projectRoot, ".omp/config.yml")} with task.disabledAgents: [deep-reviewer]. This is a project capability narrowing, not provider/model fallback and not TDD technical retry.`,
    `The exact local revision for every review is ${fixture.revision}; the base revision is ${fixture.baseRevision}. Preserve that revision from the assignment, never from a task acknowledgement or narrative.`,
  ].join("\n");
}

function buildPrompt(projectRoot, fixture, manifest, config) {
  const assignments = FALLBACK_ASSIGNMENTS.map((assignment) => ({
    name: assignment.id,
    agent: assignment.agent,
    task: [
      "The project preflight has explicitly disabled deep-reviewer. This named peer task is the capability-narrowed DEEP_REVIEW_FALLBACK route only; it is not provider fallback, model fallback, or a TDD technical retry.",
      `protocol_mode: DEEP_REVIEW_FALLBACK\nreviewed_revision: ${fixture.revision}`,
      `assignment_id: ${assignment.id}`,
      `assigned_files (findings may name only these files): ${assignment.files.join(", ")}`,
      reviewInput(projectRoot, fixture),
      `Read the exact assigned files at ${projectRoot}; read the copied protocol consumer, receipt, and exact diff before deciding. Do not read a different workspace or revision.`,
      "Use only read, grep, glob, and wait. Do not write, edit, run shell/Git/network/host operations, or dispatch nested tasks.",
      "Emit the native incremental yield protocol for DEEP_REVIEW_FALLBACK: separate scalar sections agent=peer-reviewer, protocol_mode=DEEP_REVIEW_FALLBACK, status=VALID, reviewed_revision, overall_correctness, explanation, and confidence; emit findings incrementally only when supported by the assigned bytes. Do not emit TDD_PEER_REVIEW or APROVADO/BLOQUEADO.",
      "Do not include an ID in the yield object. The root binds the real task name/ID outside the scalar result.",
    ].join("\n"),
    solutionSpace: "The assignment and revision are fixed; concrete review findings, correctness, and edge cases remain open only within the assigned file slice.",
  }));
  const profilePaths = INSTALLER_AGENTS.map(([, , file]) => join(projectRoot, ".omp/agents", file));
  const rootReads = [
    ...DOC_URLS,
    config.path,
    join(projectRoot, ".omp/skills/deep-review/lib/protocol.mjs"),
    ...profilePaths,
    join(projectRoot, ".omp/state/t009c/git-source-receipt.json"),
    join(projectRoot, ".omp/state/t009c/actual-diff.patch"),
    ...fixture.files.map((entry) => join(projectRoot, entry.relativePath)),
  ];
  const disabled = {
    name: "DeepDisabledPreflight",
    agent: "deep-reviewer",
    task: [
      "This is an observation-only preflight control. Attempt exactly this named deep-reviewer dispatch once so the real OMP project task.disabledAgents policy is observed before any peer fallback dispatch.",
      "Do not reinterpret the failure, do not synthesize a deep result, and do not try another deep-reviewer name.",
      `protocol_mode: DEEP_REVIEW\nreviewed_revision: ${fixture.revision}`,
      `Read only the exact fixture and consumer paths supplied in the shared context; assignment files are ${FALLBACK_ASSIGNMENTS[0].files.join(", ")}.`,
    ].join("\n"),
    solutionSpace: "The named deep-reviewer capability is intentionally disabled by project policy; observe only the native preflight outcome.",
  };
  return [
    "Run one bounded, authentic native NATIVE-06 fallback probe in this fresh private project workspace.",
    `Project workspace: ${projectRoot}`,
    `Project-only settings: ${config.path}; no global, per-call, model, effort, alias, provider, or SDK overrides are authorized.`,
    `Pinned OMP primary docs (read these exact URLs before dispatch): ${DOC_URLS.join(" ; ")}`,
    `The ROOT session MUST read every item below before the first task call; delegated reads do not substitute for root reads: ${rootReads.join(", ")}`,
    `The source manifest has exactly twelve project profiles plus the deep-review protocol consumer; the project overlay bytes are independently hash-bound by the driver. Do not infer any source hash from profile prose.`,
    "Root research tools are limited to read, grep, glob, wait, todo (runtime planning only), and the dynamically exposed task tool. No shell, Git, host, network, write, edit, settings, auth, service, publication, or nested task operation is authorized.",
    "First perform exactly one task call containing only the named DeepDisabledPreflight assignment. If the dynamic schema exposes batch, use {context,tasks:[item]}; otherwise use the equivalent flat call. Wait for its real tool result. The expected outcome is a native disabled-agent preflight error; do not fabricate a result or continue if the error is not observable as disabled capability.",
    JSON.stringify({ context: `${reviewInput(projectRoot, fixture)}\nRoot discovery must read the pinned OMP docs and all bound paths before task fanout.`, tasks: [disabled] }, null, 2),
    "Only after the disabled preflight result is observed, dispatch exactly the two named peer-reviewer fallback assignments below. Use one batch call when batch is exposed, or equivalent flat calls when it is not. Keep their assignments disjoint and preserve the exact revision. Do not dispatch deep-reviewer again.",
    JSON.stringify({ context: `${reviewInput(projectRoot, fixture)}\nNamed fallback round: DEEP_REVIEW_FALLBACK; same independently bound revision and files.`, tasks: assignments }, null, 2),
    "After dispatching both peers, yield the current Root turn promptly when native async work is pending and no independent Root work remains; let native async delivery resume the Root. Never wait for your own future prompt_result or session_settled event.",
    "Once both real peer terminal progress records are available, finish the Root turn immediately. The host driver alone checks final Root prompt/session settlement. A background acknowledgement, lifecycle event, or narrative is not a reviewer result; never synthesize a missing return.",
    "Report only operational metadata and the public typed yield fields. Do not expose prompts, task text, provider diagnostics, credentials, hidden reasoning, or COT.",
  ].join("\n\n");
}

// Encode template-only spaces to keep emitted helper bytes identical to retained Native captures.
function peerWireHelperSource() {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

const SCHEMA = "native05-peer-wire-probe-v1";
const MAX_BYTES = 64 * 1024;
const allowed = new Set(["protocol", "valid", "malformed", "receipt", "revision"]);
const invocation = process.argv.slice(2);
const worker = invocation[0] === "--worker";
const requestedArgs = worker ? invocation.slice(1) : invocation;
const canonicalArgs = requestedArgs.map((value, index) => index % 2 === 1 && requestedArgs[index - 1] !== "--revision" ? resolve(value) : value);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const args = {};
if (!worker) {
  const scriptPath = fileURLToPath(import.meta.url);
  const childArgv = [scriptPath, "--worker", ...canonicalArgs];
  const child = spawnSync(process.execPath, childArgv, {
    shell: false,
    timeout: 300000,
    maxBuffer: MAX_BYTES,
    windowsHide: true,
    encoding: "utf8",
  });
  const childExecution = {
    origin: "observed-node-child",
    executable: process.execPath,
    script_path: scriptPath,
    script_sha256: digest(readFileSync(scriptPath)),
    argv_sha256: digest(JSON.stringify(childArgv)),
    exit_code: Number.isInteger(child.status) ? child.status : null,
    exit_code_observed: Number.isInteger(child.status),
    signal: Object.hasOwn(child, "signal") && (child.signal === null || typeof child.signal === "string") ? child.signal : null,
    signal_observed: Object.hasOwn(child, "signal") && (child.signal === null || typeof child.signal === "string"),
    spawn_error: child.error
      ? {
        name: typeof child.error.name === "string" ? child.error.name.slice(0, 128) : null,
        code: typeof child.error.code === "string" ? child.error.code.slice(0, 128) : null,
      }
      : null,
  };
  let childOutput = null;
  try {
    const stdout = String(child.stdout ?? "");
    if (Buffer.byteLength(stdout, "utf8") <= MAX_BYTES && stdout.trim() !== "") {
      const parsed = JSON.parse(stdout.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) childOutput = parsed;
    }
  } catch {
    childOutput = null;
  }
  const published = childOutput ?? {
    schema: SCHEMA,
    producer_malformed: false,
    owned_input_origin: "controlled-local-fixture",
    failure: { kind: "worker-json-unavailable" },
  };
  published.child_execution = childExecution;
  process.stdout.write(JSON.stringify(published, null, 2) + "\\n");
  process.exitCode = Number.isInteger(child.status) ? child.status : 1;
} else {
\x20
\x20
for (let index = 0; index < canonicalArgs.length; index += 2) {
  const token = canonicalArgs[index];
  const key = token?.startsWith("--") ? token.slice(2) : "";
  const value = canonicalArgs[index + 1];
  if (!allowed.has(key) || !value || value.startsWith("--") || Object.hasOwn(args, key)) process.exitCode = 64;
  else args[key] = value;
}
if (process.exitCode || [...allowed].some((key) => !args[key])) process.exit(64);
const bytes = (file) => {
  const value = readFileSync(file);
  if (value.byteLength > MAX_BYTES) process.exit(65);
  return value;
};
\x20
const protocolBytes = bytes(args.protocol);
const receiptBytes = bytes(args.receipt);
const receipt = JSON.parse(receiptBytes.toString("utf8"));
const validBytes = bytes(args.valid);
const malformedBytes = bytes(args.malformed);
const valid = JSON.parse(validBytes.toString("utf8"));
const malformed = JSON.parse(malformedBytes.toString("utf8"));
if (receipt?.schema !== "git-fixture-receipt-v1" || receipt.head_revision !== args.revision || !valid.explanation || Object.hasOwn(malformed, "explanation")) process.exit(66);
const expected = { agent: "peer-reviewer", protocol_mode: "TDD_PEER_REVIEW", reviewed_revision: receipt.head_revision };
const protocol = await import(pathToFileURL(args.protocol).href + "?native05=" + digest(protocolBytes));
if (typeof protocol.validateReviewerResult !== "function") process.exit(67);
const validResult = protocol.validateReviewerResult(valid, expected);
const malformedResult = protocol.validateReviewerResult(malformed, expected);
const outcome = (result) => ({
  ok: result?.ok === true,
  errors: Array.isArray(result?.errors) ? result.errors.filter((item) => typeof item === "string").slice(0, 8) : [],
  status: typeof result?.status === "string" ? result.status : typeof result?.value?.status === "string" ? result.value.status : null,
  actual: result?.value && typeof result.value === "object" && !Array.isArray(result.value) ? result.value : null,
});
const output = {
  schema: SCHEMA,
  source: { path: args.protocol, bytes: protocolBytes.byteLength, sha256: digest(protocolBytes) },
  inputs: {
    valid: { path: args.valid, bytes: validBytes.byteLength, sha256: digest(validBytes), payload_sha256: digest(Buffer.from(JSON.stringify(valid))) },
    malformed: { path: args.malformed, bytes: malformedBytes.byteLength, sha256: digest(malformedBytes), payload_sha256: digest(Buffer.from(JSON.stringify(malformed))) },
  },
  expected: { ...expected, receipt_sha256: digest(receiptBytes) },
  outcomes: { valid: outcome(validResult), malformed: outcome(malformedResult) },
  controlled_corruption: { kind: "missing-required-field", field: "explanation" },
  producer_malformed: false,
  owned_input_origin: "controlled-local-fixture",
};
const serialized = JSON.stringify(output);
if (Buffer.byteLength(serialized, "utf8") > MAX_BYTES) process.exit(69);
if (worker) {
  process.stdout.write(serialized);
  if (!(output.outcomes.valid.ok === true && output.outcomes.malformed.ok === false)) process.exitCode = 68;
}
}
`;
}

function createPeerWireProbeArtifacts(projectRoot, fixtureInfo) {
  const root = join(projectRoot, ".omp/state/native05-peer-wire");
  mkdirSync(root, { recursive: false });
  const helperPath = join(root, "peer-wire-malformed-helper.mjs");
  const validPath = join(root, "valid.json");
  const malformedPath = join(root, "malformed-missing-explanation.json");
  const protocolPath = join(projectRoot, ".omp/skills/deep-review/lib/protocol.mjs");
  const receiptPath = join(projectRoot, ".omp/state/t009c/git-source-receipt.json");
  const valid = {
    agent: "peer-reviewer",
    protocol_mode: "TDD_PEER_REVIEW",
    status: "APROVADO",
    reviewed_revision: fixtureInfo.revision,
    overall_correctness: "correct",
    explanation: "Owned valid TDD peer-review fixture.",
    confidence: 1,
    findings: [],
  };
  const malformed = { ...valid };
  delete malformed.explanation;
  const helper = peerWireHelperSource();
  writeFreshFile(helperPath, Buffer.from(helper, "utf8"), "Native05 immutable helper");
  writeFreshFile(validPath, Buffer.from(`${JSON.stringify(valid)}\n`, "utf8"), "Native05 valid fixture");
  writeFreshFile(malformedPath, Buffer.from(`${JSON.stringify(malformed)}\n`, "utf8"), "Native05 malformed fixture");
  const files = [
    probeFileRecord(helperPath, "Native05 helper"),
    probeFileRecord(validPath, "Native05 valid input"),
    probeFileRecord(malformedPath, "Native05 malformed input"),
    probeFileRecord(protocolPath, "Native05 copied protocol consumer"),
    probeFileRecord(receiptPath, "Native05 copied fixture receipt"),
  ];
  const canonicalArgs = [
    "--protocol", protocolPath,
    "--valid", validPath,
    "--malformed", malformedPath,
    "--receipt", receiptPath,
    "--revision", fixtureInfo.revision,
  ];
  const childArgv = [helperPath, "--worker", ...canonicalArgs];
  const command = [process.execPath, helperPath, ...canonicalArgs].map(shellCommandArgument).join(" ");
  return {
    root,
    helperPath,
    validPath,
    malformedPath,
    protocolPath,
    receiptPath,
    command,
    cwd: projectRoot,
    executable: process.execPath,
    child_argv: childArgv,
    child_argv_sha256: sha256Text(JSON.stringify(childArgv)),
    readPaths: files.map((entry) => entry.path),
    files,
    source_sha256: files.find((entry) => samePath(entry.path, protocolPath))?.sha256 ?? null,
    input_origin: "controlled-local-fixture",
    corruption: { kind: "missing-required-field", field: "explanation" },
  };
}

function buildPeerWireProbePrompt(projectRoot, fixture, manifest, config, probe) {
  const rootReads = [
    ...DOC_URLS,
    config.path,
    probe.protocolPath,
    ...INSTALLER_AGENTS.map(([, , file]) => join(projectRoot, ".omp/agents", file)),
    join(projectRoot, ".omp/state/t009c/git-source-receipt.json"),
    join(projectRoot, ".omp/state/t009c/actual-diff.patch"),
    ...fixture.files.map((entry) => join(projectRoot, entry.relativePath)),
    probe.helperPath,
    probe.validPath,
    probe.malformedPath,
  ];
  return [
    "Run exactly one bounded private Native05 malformed-wire control in this fresh project workspace.",
    `Project workspace: ${projectRoot}`,
    `Project-only settings: ${config.path}; do not change settings, models, profiles, environment, or SDK arguments.`,
    `Read every pinned item with the Root before Bash: ${rootReads.join(", ")}`,
    "Use only read, grep, glob, and wait before the one configured Bash call. Do not use tasks, nested calls, write, edit, Git, network, host, auth, or any other shell.",
    `After all reads, invoke exactly this Bash command with cwd ${projectRoot}: ${probe.command}`,
    "Do not add env, cwd overrides, timeout overrides, or any other argument. Observe the matching Bash START and END and require raw isError:false. The SDK outer exitCode may be absent: record exit_code:null and exit_code_observed:false, never infer zero. Require the helper's child_execution to bind the real observed child status, signal, spawn error, executable, script hash, and worker argv hash.",
    "The helper stdout is bounded JSON from the copied protocol consumer plus the private child_execution witness. Do not accept prose or synthesize results. After the correlated Bash END, finish the Root turn immediately; do not await a future continuation or its own session_settled event. The host alone verifies session settlement.",
  ].join("\n\n");
}

function validatePeerWireProbe(sessionEvidence, projectRoot, fixture, manifest, probe) {
  const readEvidence = validateReadOrder(sessionEvidence, projectRoot, fixture, manifest, probe.readPaths, false);
  const start = sessionEvidence.tool_events.find((event) => event.event === "tool_execution_start" && /^bash$/i.test(event.toolName));
  const end = sessionEvidence.tool_events.find((event) => event.event === "tool_execution_end" && /^bash$/i.test(event.toolName) && event.toolCallId === start?.toolCallId && event.sequence > (start?.sequence ?? 0));
  if (!start || !end || !sessionEvidence.probe_bash_start || !sessionEvidence.probe_bash_end) blocked("Native05 probe did not expose one correlated Bash START/END");
  if (sessionEvidence.read_events.some((event) =>
    event.success !== true
    || !Number.isSafeInteger(event.sequence)
    || !Number.isSafeInteger(event.end_sequence)
    || event.end_sequence <= event.sequence
    || event.end_sequence >= start.sequence
  )) blocked("Native05 Root READ ENDs did not all precede the approved Bash START");
  if (sessionEvidence.tool_events.some((event) =>
    (!/^bash$/i.test(event.toolName) && !PEER_WIRE_ROOT_TOOL.test(event.toolName))
    || (event.event === "tool_execution_start" && event.sequence > start.sequence)
  )) blocked("Native05 peer-wire proof contains an extra or out-of-phase Root operation");
  const output = sessionEvidence.probe_bash_end.output;
  const terminal = sessionEvidence.probe_bash_end;
  if (terminal.is_error !== false || terminal.is_error_observed !== true) blocked("Native05 probe Bash terminal metadata was not an observed raw isError:false execution");
  if (typeof terminal.exit_code_observed !== "boolean" || (terminal.exit_code_observed ? terminal.exit_code !== 0 : terminal.exit_code !== null)) blocked("Native05 probe Bash terminal did not preserve observed SDK exit metadata");
  validateObservedChildExecution(output, probe);
  if (!output || output.schema !== PEER_WIRE_PROBE_SCHEMA || output.producer_malformed !== false || output.owned_input_origin !== "controlled-local-fixture") blocked("Native05 helper output did not expose the bounded controlled-fixture provenance");
  if (output.expected?.agent !== "peer-reviewer" || output.expected?.protocol_mode !== "TDD_PEER_REVIEW" || output.expected?.reviewed_revision !== fixture.revision) blocked("Native05 helper expected tuple was not independently bound to the fixture receipt/revision");
  if (output.source?.sha256 !== probe.source_sha256) blocked("Native05 helper did not hash the copied canonical protocol consumer");
  const receipt = probe.files.find((entry) => samePath(entry.path, probe.receiptPath));
  if (!receipt || output.expected.receipt_sha256 !== receipt.sha256) blocked("Native05 helper did not preserve the independent fixture receipt hash");
  for (const key of ["valid", "malformed"]) {
    const expected = probe.files.find((entry) => samePath(entry.path, probe[`${key}Path`]));
    const actual = output.inputs?.[key];
    if (!expected || !actual || actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes || !SHA256.test(String(actual.payload_sha256 ?? ""))) blocked(`Native05 ${key} input hash was not preserved`);
  }
  if (output.outcomes?.valid?.ok !== true || output.outcomes?.malformed?.ok !== false) blocked("Native05 actual protocol consumer did not accept valid and reject malformed counterfactuals");
  if (output.controlled_corruption?.kind !== probe.corruption.kind || output.controlled_corruption?.field !== probe.corruption.field) blocked("Native05 malformed input was not the explicit owned corruption");
  if (sessionEvidence.prompt_result?.status !== "completed" || sessionEvidence.prompt_result?.agentInvoked !== true || sessionEvidence.session_settled !== true) blocked("Native05 Root prompt did not complete and settle after the correlated helper END");
  return { read: readEvidence, bash_start: sessionEvidence.probe_bash_start, bash_end: sessionEvidence.probe_bash_end, output, producer_malformed: false, owned_input_origin: "controlled-local-fixture", authentic_native_caller_execution_origin: "root-bash-correlated-start-end" };
}
function assembleFallback(record) {
  const items = Array.isArray(record?.yield) ? record.yield : [];
  if (items.length === 0) return undefined;
  const result = {};
  const scalarLabels = new Set(["agent", "protocol_mode", "status", "reviewed_revision", "overall_correctness", "explanation", "confidence"]);
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object" || item.status === "aborted") continue;
    const labels = Array.isArray(item.type) ? item.type.filter((label) => typeof label === "string" && label.trim() !== "") : [];
    if (!Object.prototype.hasOwnProperty.call(item, "data")) continue;
    if (labels.length === 0) {
      if (result.__terminal !== undefined) return undefined;
      result.__terminal = publicReviewData(item.data);
      continue;
    }
    for (const label of labels) {
      if (!PUBLIC_REVIEW_FIELDS.has(label)) continue;
      if (scalarLabels.has(label)) {
        if (seen.has(label)) return undefined;
        result[label] = item.data;
        seen.add(label);
      } else if (label === "findings") {
        if (!Array.isArray(result.findings)) result.findings = [];
        if (Array.isArray(item.data)) result.findings.push(...item.data.map(publicFinding));
        else {
          const finding = publicFinding(item.data);
          result.findings.push(finding);
        }
      }
    }
  }
  const requiredTypedFields = ["agent", "protocol_mode", "status", "reviewed_revision", "overall_correctness", "explanation", "confidence"];
  if (!requiredTypedFields.every((label) => seen.has(label))) return undefined;
  if (result.__terminal !== undefined) {
    if (result.findings?.some((finding) => finding === null)) return undefined;
    const terminal = result.__terminal;
    if (!terminal || typeof terminal !== "object" || Array.isArray(terminal)) return undefined;
    for (const label of requiredTypedFields) if (!Object.prototype.hasOwnProperty.call(terminal, label)) terminal[label] = result[label];
    if (!Object.prototype.hasOwnProperty.call(terminal, "findings")) terminal.findings = result.findings ?? [];
    return terminal;
  }
  delete result.__terminal;
  if (!Object.prototype.hasOwnProperty.call(result, "findings")) result.findings = [];
  return result;
}

function terminalForId(evidence, id) {
  return evidence.native_progress_terminal.filter((record) => record.id === id);
}

function matchReadTarget(projectRoot, expected, raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return expected.has(value) ? value : null;
  const normalized = normalizeReadTarget(projectRoot, value);
  if (normalized && expected.has(normalized)) return normalized;
  const rawComparable = value.replaceAll("\\", "/").toLowerCase();
  for (const target of expected) {
    if (/^https?:\/\//i.test(target)) continue;
    const targetComparable = target.replaceAll("\\", "/").toLowerCase();
    if (rawComparable === targetComparable || rawComparable.startsWith(`${targetComparable}:`)) return target;
    if (!isAbsolute(value)) {
      const withoutSelector = value.split(":")[0];
      if (comparePath(resolve(projectRoot, withoutSelector)) === target) return target;
    }
  }
  return null;
}

function validateReadOrder(sessionEvidence, projectRoot, fixture, manifest, extraPaths = [], requireTask = true) {
  const expected = expectedReadSet(projectRoot, fixture, manifest, extraPaths);
  const taskStarts = sessionEvidence.tool_events.filter((event) => event.event === "tool_execution_start" && /^tasks?(?:$|[_:.])/i.test(event.toolName));
  if (requireTask && taskStarts.length === 0) blocked("native task dispatch was not observed");
  const firstTask = requireTask ? Math.min(...taskStarts.map((event) => event.sequence)) : null;
  const seen = new Map();
  for (const event of sessionEvidence.read_events) {
    if (event.success !== true || !Number.isSafeInteger(event.end_sequence)) continue;
    for (const raw of event.paths ?? []) {
      const normalized = matchReadTarget(projectRoot, expected, raw);
      if (normalized === null) continue;
      const current = seen.get(normalized);
      if (!current || event.end_sequence < current.end_sequence) {
        seen.set(normalized, { sequence: event.sequence, end_sequence: event.end_sequence, success: true });
      }
    }
  }
  const missing = [];
  const late = [];
  for (const path of expected) {
    const event = seen.get(path);
    if (!event) missing.push(path);
    else if (requireTask && event.end_sequence >= firstTask) late.push(path);
  }
  if (missing.length > 0 || late.length > 0) blocked("root did not read every pinned source/fixture/document before task fanout", { missing: missing.slice(0, 32), late: late.slice(0, 32) });
  return { expected: expected.size, observed: seen.size, first_task_sequence: firstTask };
}

function validateTaskCalls(sessionEvidence) {
  const taskCalls = sessionEvidence.task_calls;
  if (taskCalls.length < 2) blocked("native evidence did not expose the separate disabled preflight and fallback task calls");
  const items = taskCalls.flatMap((call) => (call.items ?? []).map((item) => ({ ...item, call }))).filter((item) => item && !item.malformed);
  const disabled = items.filter((item) => item.name === "DeepDisabledPreflight" && item.agent === "deep-reviewer");
  if (disabled.length !== 1) blocked("native caller did not expose exactly one named deep-reviewer disabled preflight assignment", { observed: disabled.map(({ call, ...item }) => item) });
  if (disabled[0].call.hasModelField || disabled[0].call.items.some((item) => item.hasForbiddenField) || !disabled[0].hasSolutionSpace) blocked("disabled preflight task wire contained forbidden fields or omitted solutionSpace");
  const disabledCall = disabled[0].call;
  const disabledCallId = disabledCall.call_id;
  if (typeof disabledCallId !== "string" || disabledCallId.trim() === "") blocked("disabled preflight task call did not expose an exact correlation ID");
  const disabledEnd = sessionEvidence.tool_events.find((event) =>
    event.event === "tool_execution_end"
    && event.toolCallId === disabledCallId
    && Number.isSafeInteger(event.sequence)
    && event.sequence > disabledCall.sequence
    && /^tasks?(?:$|[_:.])/i.test(event.toolName),
  );
  if (!disabledEnd) blocked("disabled preflight terminal END was not observed with its exact task-call identity");
  const fallbackById = new Map();
  for (const assignment of FALLBACK_ASSIGNMENTS) {
    const matches = items.filter((item) => item.name === assignment.id && item.agent === "peer-reviewer");
    if (matches.length !== 1) blocked(`native caller did not expose exactly one named fallback assignment for ${assignment.id}`, { count: matches.length });
    if (matches[0].call.hasModelField || matches[0].hasForbiddenField || !matches[0].hasSolutionSpace) blocked(`fallback task ${assignment.id} contained forbidden fields or omitted solutionSpace`);
    if (matches[0].call.sequence <= disabledEnd.sequence) blocked(`fallback dispatch ${assignment.id} preceded the disabled preflight END`);
    fallbackById.set(assignment.id, matches[0]);
  }
  const unknown = items.filter((item) => !["DeepDisabledPreflight", ...FALLBACK_ASSIGNMENTS.map((assignment) => assignment.id)].includes(item.name));
  if (unknown.length > 0) blocked("native root dispatched an unexpected task assignment", { assignments: unknown.map(({ call, ...item }) => item) });
  return { disabled: disabled[0], fallback: fallbackById };
}

function disabledPreflightObservation(sessionEvidence, disabledItem) {
  const callId = disabledItem.call.call_id;
  if (typeof callId !== "string" || callId.trim() === "") blocked("disabled preflight did not expose an exact task-call identity");
  const exactEnds = sessionEvidence.tool_events.filter((event) =>
    event.event === "tool_execution_end"
    && event.toolCallId === callId
    && Number.isSafeInteger(event.sequence)
    && event.sequence > disabledItem.call.sequence
    && /^tasks?(?:$|[_:.])/i.test(event.toolName),
  );
  const disabled = exactEnds.find((event) => event.result?.disabled_agent === true && (event.result.success === false || event.result.isError === true || event.result.preflight_error === true || /^(?:error|failed|blocked)$/i.test(String(event.result.status ?? ""))));
  if (!disabled) blocked("no safe native disabled-agent preflight result was observed before peer fallback", { matching_end_count: exactEnds.length });
  return {
    status: "OBSERVED",
    evidence_level: "NATIVE",
    assignment: { id: disabledItem.name, agent: disabledItem.agent, task_sha256: disabledItem.taskSha256 },
    tool_call_id: callId,
    sequence: disabled.sequence,
    result: disabled.result,
    note: "Project task.disabledAgents narrowed capability; this is not provider/model fallback and not a TDD technical retry.",
  };
}

function consumerFallback(protocol, fixture, assignments, sessionEvidence, callerById) {
  const normalized = [];
  const cases = [];
  for (const assignment of assignments) {
    const terminals = terminalForId(sessionEvidence, assignment.id);
    if (terminals.length !== 1) blocked(`native fallback ${assignment.id} did not expose exactly one terminal progress record`, { count: terminals.length });
    const record = terminals[0];
    if (record.agent !== "peer-reviewer" || record.agentSource !== "project" || !SUCCESS_STATUSES.has(String(record.status).toLowerCase()) || (record.exitCode !== null && record.exitCode !== undefined && record.exitCode !== 0)) blocked(`native fallback ${assignment.id} did not complete as project peer-reviewer`, { record });
    const caller = callerById.get(assignment.id);
    if (!caller || !SHA256.test(String(caller.taskSha256 ?? ""))) blocked(`native fallback ${assignment.id} had no independently hashed caller assignment`);
    const progressAssignmentObserved = SHA256.test(String(record.assignment_sha256 ?? ""));
    if (progressAssignmentObserved && record.assignment_sha256 !== caller.taskSha256) blocked(`native fallback ${assignment.id} terminal assignment hash did not match its actual caller task`, { caller_task_sha256: caller.taskSha256, progress_assignment_sha256: record.assignment_sha256 });
    const data = assembleFallback(record);
    if (!data || typeof data !== "object" || Array.isArray(data)) blocked(`native fallback ${assignment.id} did not expose the typed public yield object`);
    const expected = { agent: "peer-reviewer", protocol_mode: "DEEP_REVIEW_FALLBACK", reviewed_revision: fixture.revision };
    let checked;
    try {
      checked = protocol.validateReviewerResult(data, expected);
    } catch (error) {
      blocked(`actual validateReviewerResult threw for native fallback ${assignment.id}`, { error: safeError(error) });
    }
    const caseEvidence = {
      id: assignment.id,
      source_kind: record.source_kind,
      native_identity: { agent: record.agent, agentSource: record.agentSource },
      native_completion: { status: record.status, exitCode: record.exitCode, exit_code_observed: record.exit_code_observed === true },
      model_metadata: {
        requested: null,
        resolved: record.resolvedModel ?? record.resolvedModelIdentity ?? null,
        resolved_thinking_level: record.resolvedThinkingLevel ?? null,
        resolved_model_is_fallback: record.resolvedModelIsFallback ?? null,
        observation: record.resolvedModel || record.resolvedModelIdentity ? "observed-native-metadata" : "unverified",
      },
      assignment_binding: {
        id: assignment.id,
        agent: assignment.agent,
        protocol_mode: assignment.protocol_mode,
        reviewed_revision: fixture.revision,
        files: [...assignment.files],
        caller_task_sha256: caller.taskSha256,
        progress_assignment_sha256: record.assignment_sha256,
        progress_assignment_observed: progressAssignmentObserved,
        binding: progressAssignmentObserved ? "native-progress-and-caller" : "caller-task-wire-only",
      },
      public_yield: record.yield,
      raw_public_result: publicReviewData(data),
      expected,
      consumer_validation: checked.ok ? { ok: true, status: checked.value.status } : { ok: false, errors: checked.errors },
    };
    if (!checked.ok || checked.value.status !== "VALID" || checked.value.agent !== "peer-reviewer" || checked.value.protocol_mode !== "DEEP_REVIEW_FALLBACK" || checked.value.reviewed_revision !== fixture.revision) {
      cases.push(caseEvidence);
      assertion(`actual validateReviewerResult rejected native DEEP_REVIEW_FALLBACK ${assignment.id}`, { expectedRed: false, errors: checked.errors ?? [] });
    }
    cases.push(caseEvidence);
    normalized.push({ id: assignment.id, result: checked.value });
  }
  const assignmentInputs = assignments.map(({ id, agent, files }) => ({ id, agent, files: [...files] }));
  const aggregate = protocol.aggregateReviewInstances(normalized, fixture.revision, assignmentInputs);
  if (!aggregate.ok) assertion("actual aggregateReviewInstances rejected the complete named fallback result set", { expectedRed: false, errors: aggregate.errors });
  const aggregateEvidence = { ok: true, value: publicAggregateData(aggregate.value) };
  const controls = derivedConsumerControls(protocol, normalized, fixture.revision, assignmentInputs);
  return { cases, normalized, assignments: assignmentInputs, aggregate: aggregateEvidence, controls };
}

function derivedConsumerControls(protocol, normalized, revision, assignments) {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const cases = [
    { name: "missing", results: normalized.slice(0, -1) },
    { name: "duplicate", results: [...normalized, clone(normalized[0])] },
    { name: "stale", results: normalized.map((entry, index) => index === 0 ? { ...entry, result: { ...entry.result, reviewed_revision: "stale-derived-consumer" } } : clone(entry)) },
    { name: "wrongmode", results: normalized.map((entry, index) => index === 0 ? { ...entry, result: { ...entry.result, protocol_mode: "TDD_PEER_REVIEW" } } : clone(entry)) },
  ];
  return cases.map(({ name, results }) => {
    const outcome = protocol.aggregateReviewInstances(results, revision, assignments);
    const evidence = {
      name,
      label: "DERIVED_CONSUMER",
      evidence_level: "DERIVED_CONSUMER",
      source: "actual-native-fallback-result-cloned-in-memory",
      expected: "BLOCKED",
      observed: outcome.ok ? "accepted" : "blocked",
      errors: outcome.ok ? [] : outcome.errors,
    };
    if (outcome.ok) assertion(`derived consumer control ${name} was accepted`, { expectedRed: false, evidence });
    return evidence;
  });
}

function verifyNoNativeDeep(sessionEvidence) {
  const unexpected = sessionEvidence.native_progress_terminal.filter((record) => {
    const status = String(record.status ?? "").toLowerCase();
    const success = SUCCESS_STATUSES.has(status) || record.exitCode === 0;
    const yieldedResult = Array.isArray(record.progress?.yield)
      && record.progress.yield.some((item) => item?.data?.protocol_mode === "DEEP_REVIEW" || item?.data?.protocol_mode === "DEEP_REVIEW_FALLBACK" && item?.data?.agent === "deep-reviewer");
    return record.agent === "deep-reviewer" && (success || yieldedResult);
  });
  if (unexpected.length > 0) blocked("disabled deep-reviewer unexpectedly produced a successful native terminal; no unavailable deep result is synthesized", { records: unexpected });
}

function loadProtocolCopy(sourceManifestInfo, runRoot) {
  const destination = join(runRoot, "protocol-consumer.mjs");
  const copy = copyExact(sourceManifestInfo.protocol.sourcePath, destination, "frozen protocol consumer");
  if (copy.sha256 !== sourceManifestInfo.protocol.sha256) blocked("frozen protocol consumer hash mismatch");
  return import(`${pathToFileURL(destination).href}?nativeFallback=${randomUUID()}`).then((api) => {
    const signatures = {
      validateReviewerResult: typeof api.validateReviewerResult === "function" ? api.validateReviewerResult.length : null,
      aggregateReviewInstances: typeof api.aggregateReviewInstances === "function" ? api.aggregateReviewInstances.length : null,
    };
    if (signatures.validateReviewerResult !== 2 || signatures.aggregateReviewInstances !== 3) blocked("actual protocol consumer signatures did not match contract 0.5.0", { signatures });
    return { api, evidence: { source_relative_path: sourceManifestInfo.protocol.sourceRelativePath, sha256: copy.sha256, bytes: copy.bytes, signatures } };
  });
}

function parseArgs(argv) {
  const values = {};
  const allowed = new Set(["source", "lab", "fixture", "omp", "timeout-ms", "probe"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--") || !allowed.has(token.slice(2))) throw new DriverError("USAGE", `unsupported argument ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new DriverError("USAGE", `missing value for --${key}`);
    values[key] = value;
    index += 1;
  }
  for (const required of ["source", "lab", "fixture", "omp"]) if (!values[required]) throw new DriverError("USAGE", `required option missing: --${required}`);
  if (values.probe !== undefined && values.probe !== PEER_WIRE_PROBE) throw new DriverError("USAGE", `unsupported probe ${values.probe}`);
  const timeoutMs = values["timeout-ms"] === undefined ? DEFAULT_TIMEOUT_MS : Number(values["timeout-ms"]);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > DEFAULT_TIMEOUT_MS) throw new DriverError("USAGE", "--timeout-ms must be an integer from 30000 through 900000");
  return { source: values.source, lab: values.lab, fixture: values.fixture, omp: values.omp, timeoutMs, probe: values.probe ?? null };
}

function preservation(before, after, label) {
  const changed = [];
  const actual = new Map(after.map((entry) => [entry.path, entry]));
  for (const entry of before) {
    const current = actual.get(entry.path);
    if (!current || current.bytes !== entry.bytes || current.sha256 !== entry.sha256) changed.push(entry.path);
  }
  for (const entry of after) if (!before.some((candidate) => candidate.path === entry.path)) changed.push(`+${entry.path}`);
  return { label, changed, unchanged: changed.length === 0 };
}

function writeEvidence(runRoot, evidence) {
  const target = join(runRoot, "evidence.json");
  const temporary = join(runRoot, `.evidence-${randomUUID()}.tmp`);
  writeFileSync(temporary, serializeOperationalEvidence(evidence), "utf8");
  renameSync(temporary, target);
  return target;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = requireDirectory("--source", options.source);
  const lab = requireDirectory("--lab", options.lab);
  const fixture = requireDirectory("--fixture", options.fixture);
  const omp = requireFile("--omp", options.omp);
  if (samePath(source, lab) || isInside(source, lab) || isInside(lab, source)) blocked("--source and --lab must be disjoint");
  if (!isInside(lab, fixture) || isInside(fixture, lab) && samePath(fixture, lab)) blocked("--fixture must be an existing immutable child of --lab and not the lab root");
  const env = createOmpEnvironment();
  const runId = randomUUID();
  if (!UUID_V4.test(runId)) blocked("driver run id is not UUID-v4");
  const runRoot = join(lab, `ship-native-fallback-${runId}`);
  if (existsSync(runRoot)) blocked("native fallback run root unexpectedly exists");
  mkdirSync(runRoot, { recursive: false });
  const evidence = {
    task: TASK_ID,
    contract: CONTRACT_VERSION,
    run_id: runId,
    phase: "native",
    started_at: now(),
    source_root: source,
    fixture_root: fixture,
    run_root: runRoot,
    native: {
      evidence_level: "NATIVE",
      mode: options.probe ?? "fallback",
      rpc: null,
      root_reads: null,
      disabled_preflight: null,
      probe: null,
      fallback: null,
      derived_consumer_controls: [],
      native_progress_terminal: [],
      subagent_frames: [],
      task_calls: [],
      task_details: [],
      tool_events: [],
      read_events: [],
      limitations: [],
      provider_model_fallback: { status: "PENDING", reason: "not exercised by NATIVE-06 capability fallback" },
      tdd_technical_retry: { status: "PENDING", reason: "not exercised by NATIVE-06 capability fallback" },
    },
    preservation: null,
    failure: null,
  };
  let session = null;
  let sessionEvidence = null;
  let finalStatus = "BLOCKED";
  let sourceManifestInfo;
  let fixtureInfo;
  let sourceBefore;
  let fixtureBefore;
  let binaryBefore;
  let projectBefore = null;
  let probeBinding = null;
  try {
    sourceManifestInfo = sourceManifest(source);
    fixtureInfo = fixtureDescriptor(fixture);
    sourceBefore = sourceFingerprint(sourceManifestInfo.entries);
    fixtureBefore = fingerprintTree(fixture, "immutable fixture before");
    const binaryBytes = readFileSync(omp);
    binaryBefore = { path: omp, bytes: binaryBytes.byteLength, sha256: sha256Bytes(binaryBytes) };
    if (binaryBefore.sha256 !== EXPECTED_BINARY_SHA256) blocked("--omp is not the pinned private 18.18.6 binary", { observed: binaryBefore.sha256, expected: EXPECTED_BINARY_SHA256 });
    const projectRoot = join(runRoot, "private-project");
    mkdirSync(projectRoot, { recursive: false });
    const copiedFixture = copyFixtureToProject(fixtureInfo, projectRoot);
    const overlayCopies = installSourceOverlay(sourceManifestInfo, projectRoot);
    const config = createProjectConfig(projectRoot);
    const protocol = await loadProtocolCopy(sourceManifestInfo, runRoot);
    if (options.probe === PEER_WIRE_PROBE) probeBinding = createPeerWireProbeArtifacts(projectRoot, fixtureInfo);
    projectBefore = fingerprintTree(projectRoot, "private project before native session");
    evidence.fixture = {
      source_root: fixtureInfo.root,
      copied_root: projectRoot,
      revision: fixtureInfo.revision,
      base_revision: fixtureInfo.baseRevision,
      diff: fixtureInfo.diff,
      receipt_sha256: fixtureInfo.receiptSha256,
      files: fixtureInfo.files.map(({ relativePath, bytes, sha256 }) => ({ path: relativePath, bytes, sha256 })),
      consumer_paths: fixtureInfo.consumerPaths,
      copy_count: copiedFixture.length,
    };
    evidence.source = {
      package_entries: sourceManifestInfo.entries.map(({ kind, sourceRelativePath, destinationRelative, bytes, sha256 }) => ({ kind, path: sourceRelativePath, destination: destinationRelative, bytes, sha256 })),
      profile_count: sourceManifestInfo.entries.filter((entry) => entry.kind === "agent").length,
      immutable_scope: sourceBefore,
      overlay_copy_count: overlayCopies.length,
      protocol_consumer: protocol.evidence,
    };
    evidence.project = {
      root: projectRoot,
      config: { path: config.path, bytes: config.bytes, sha256: config.sha256, scope: "project-only", disabledAgents: ["deep-reviewer"] },
      before_files: projectBefore.length,
    };
    if (probeBinding) {
      evidence.native.probe = {
        name: PEER_WIRE_PROBE,
        helper: probeFileRecord(probeBinding.helperPath, "Native05 helper"),
        inputs: {
          valid: probeFileRecord(probeBinding.validPath, "Native05 valid input"),
          malformed: probeFileRecord(probeBinding.malformedPath, "Native05 malformed input"),
        },
        consumer: probeFileRecord(probeBinding.protocolPath, "Native05 copied protocol consumer"),
        command: { executable: process.execPath, command: probeBinding.command, cwd: probeBinding.cwd },
        input_origin: probeBinding.input_origin,
        corruption: probeBinding.corruption,
        producer_malformed: false,
        authentic_native_caller_execution_origin: "root-bash-correlated-start-end",
      };
    }
    evidence.binary = { before: binaryBefore, expected_sha256: EXPECTED_BINARY_SHA256 };
    sessionEvidence = {
      rpc: { argv: null, protocol: null, event_filter: null, subagent_subscription: null },
      responses: [],
      calls: [],
      tool_events: [],
      task_calls: [],
      task_details: [],
      read_events: [],
      subagent_frames: [],
      native_progress_terminal: [],
      prompt: null,
      probe_bash_start: null,
      probe_bash_end: null,
      session_settled: false,
    };
    session = new RpcSession({ omp, cwd: projectRoot, env, timeoutMs: options.timeoutMs, evidence: sessionEvidence, probe: probeBinding ? { command: probeBinding.command, cwd: probeBinding.cwd } : null });
    evidence.native.rpc = sessionEvidence.rpc;
    const prompt = probeBinding
      ? buildPeerWireProbePrompt(projectRoot, fixtureInfo, sourceManifestInfo, config, probeBinding)
      : buildPrompt(projectRoot, fixtureInfo, sourceManifestInfo, config);
    try {
      await session.execute(prompt);
      await session.close();
    } catch (error) {
      try { await session.abort(); } catch (abortError) { sessionEvidence.abort_error = safeError(abortError); }
      throw error;
    }
    evidence.native.task_calls = sessionEvidence.task_calls;
    evidence.native.task_details = sessionEvidence.task_details;
    evidence.native.tool_events = sessionEvidence.tool_events;
    evidence.native.read_events = sessionEvidence.read_events;
    evidence.native.subagent_frames = sessionEvidence.subagent_frames;
    evidence.native.native_progress_terminal = sessionEvidence.native_progress_terminal;
    evidence.native.prompt_result = sessionEvidence.prompt_result;
    evidence.native.session_settled = sessionEvidence.session_settled;
    evidence.native.probe_bash_start = sessionEvidence.probe_bash_start;
    evidence.native.probe_bash_end = sessionEvidence.probe_bash_end;
    if (probeBinding) {
      evidence.native.probe.observation = validatePeerWireProbe(sessionEvidence, projectRoot, fixtureInfo, sourceManifestInfo, probeBinding);
      evidence.native.root_reads = evidence.native.probe.observation.read;
      finalStatus = "PASS";
    } else {
      const readEvidence = validateReadOrder(sessionEvidence, projectRoot, fixtureInfo, sourceManifestInfo);
      evidence.native.root_reads = readEvidence;
      const calls = validateTaskCalls(sessionEvidence);
      const disabledEvidence = disabledPreflightObservation(sessionEvidence, calls.disabled);
      evidence.native.disabled_preflight = disabledEvidence;
      verifyNoNativeDeep(sessionEvidence);
      const callerById = calls.fallback;
      const fallback = consumerFallback(protocol.api, fixtureInfo, FALLBACK_ASSIGNMENTS, sessionEvidence, callerById);
      evidence.native.fallback = {
        native_instances: fallback.cases,
        assignments: fallback.assignments,
        aggregate: fallback.aggregate,
        derived_consumer_controls: fallback.controls,
      };
      evidence.native.derived_consumer_controls = fallback.controls;
      finalStatus = "PASS";
    }
  } catch (error) {
    if (sessionEvidence) {
      evidence.native.task_calls = sessionEvidence.task_calls;
      evidence.native.task_details = sessionEvidence.task_details;
      evidence.native.tool_events = sessionEvidence.tool_events;
      evidence.native.read_events = sessionEvidence.read_events;
      evidence.native.subagent_frames = sessionEvidence.subagent_frames;
      evidence.native.native_progress_terminal = sessionEvidence.native_progress_terminal;
      evidence.native.prompt_result = sessionEvidence.prompt_result;
      evidence.native.session_settled = sessionEvidence.session_settled;
      evidence.native.probe_bash_start = sessionEvidence.probe_bash_start;
      evidence.native.probe_bash_end = sessionEvidence.probe_bash_end;
    }
    evidence.failure = {
      kind: error?.kind ?? "BLOCKED",
      detail: safeError(error?.message ?? error),
      expectedRed: false,
    };
    finalStatus = error?.kind === "ASSERTION" ? "FAIL" : "BLOCKED";
  } finally {
    try {
      const sourceAfter = sourceManifest(source).entries;
      const sourceAfterFingerprint = sourceFingerprint(sourceAfter);
      const fixtureAfter = fingerprintTree(fixture, "immutable fixture after");
      const binaryAfterBytes = readFileSync(omp);
      const binaryAfter = { path: omp, bytes: binaryAfterBytes.byteLength, sha256: sha256Bytes(binaryAfterBytes) };
      evidence.preservation = {
        source: preservation(sourceBefore ?? [], sourceAfterFingerprint, "source"),
        fixture: preservation(fixtureBefore ?? [], fixtureAfter, "immutable fixture"),
        binary: { before: binaryBefore, after: binaryAfter, unchanged: Boolean(binaryBefore && binaryBefore.sha256 === binaryAfter.sha256 && binaryBefore.bytes === binaryAfter.bytes) },
      };
      if (!evidence.preservation.source.unchanged || !evidence.preservation.fixture.unchanged || !evidence.preservation.binary.unchanged) finalStatus = "BLOCKED";
      if (probeBinding && evidence.native.probe) {
        const probeAfter = probeBinding.files.map((entry) => probeFileRecord(entry.path, "Native05 bound artifact after"));
        evidence.native.probe.preservation = preservation(probeBinding.files, probeAfter, "Native05 helper/input/consumer files");
        if (!evidence.native.probe.preservation.unchanged) finalStatus = "BLOCKED";
      }
      if (projectBefore && evidence.project) {
        const projectAfter = fingerprintTree(evidence.project.root, "private project after native session");
        evidence.preservation.project = preservation(projectBefore, projectAfter, "private project");
        if (!evidence.preservation.project.unchanged) finalStatus = "BLOCKED";
      }
    } catch (error) {
      evidence.preservation = { error: safeError(error) };
      finalStatus = "BLOCKED";
    }
    evidence.finished_at = now();
    evidence.status = finalStatus;
  }
  const evidencePath = writeEvidence(runRoot, evidence);
  process.stdout.write(`${JSON.stringify({ status: finalStatus, task: TASK_ID, run_id: runId, evidence: evidencePath })}\n`);
  process.exitCode = finalStatus === "PASS" ? 0 : 2;
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  await main().catch((error) => {
    const status = error?.kind === "USAGE" ? "USAGE" : "BLOCKED";
    process.stdout.write(`${JSON.stringify({ status, task: TASK_ID, detail: safeError(error?.message ?? error) })}\n`);
    process.exitCode = status === "USAGE" ? 64 : 2;
  });
}
