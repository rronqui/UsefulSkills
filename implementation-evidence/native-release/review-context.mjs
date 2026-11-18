#!/usr/bin/env node
// Disposable T009C / AC-014 probe for NATIVE-07 and NATIVE-08.
//
// This artifact is intentionally outside the repository.  It never creates a
// project branch, commit, PR, merge, or push.  Main supplies an already-created
// fixture descriptor under --lab; the descriptor names the exact base/head
// files and their expected hashes.  The driver reads those bytes and invokes
// the actual deep-review/state consumers from --source.  It does not accept a
// table of expected review results as native evidence.
//
// Native mode is opt-in with --native and uses the installed OMP executable
// through its RPC transport, inheriting normal authentication.  The driver
// sends no profile, model, settings, alias, auth, or global-override flags.
// A native PASS requires observed read/tool/task/terminal evidence and hashes
// computed from the fixture bytes; a fixture-only result is never relabeled as
// native.

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const DEFAULT_TIMEOUT_MS = 900_000;
const MAX_PHYSICAL_FRAME_BYTES = 1024 * 1024;
const MAX_REASSEMBLED_FRAME_BYTES = 64 * 1024 * 1024;
const MAX_BOUND_FILE_BYTES = 8 * 1024 * 1024;
const MAX_BOUND_DIFF_BYTES = 32 * 1024 * 1024;
const MAX_NATIVE_CAPTURE_BYTES = 16 * 1024 * 1024;
const TERMINAL_TASK_STATUSES = new Set(["completed", "complete", "success", "succeeded", "failed", "error", "aborted", "canceled", "cancelled"]);
const SUCCESS_TASK_STATUSES = new Set(["completed", "complete", "success", "succeeded"]);
const DEEP_REVIEW_FIELDS = new Set(["agent", "protocol_mode", "status", "reviewed_revision", "overall_correctness", "explanation", "confidence", "findings"]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA1 = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const REVIEW_DOCUMENTATION_PATHS = Object.freeze([
  "specs/specs005-omp-compatible-release/spec.md",
  "specs/specs005-omp-compatible-release/plan.md",
  "specs/specs005-omp-compatible-release/tasks.md",
  "specs/specs005-omp-compatible-release/contracts/interface-contract.md",
  "deep-review/SKILL.md",
  "ship/references/integrated-delivery.md",
  "tdd-orchestrator/references/handoff.md",
  "tdd-orchestrator/references/execution-and-resume.md",
]);
const NATIVE_PROBE_REFS = Object.freeze([
  "native.Fase0.documentation-before-task",
  "native.source-receipt-diff-file-reads",
  "native.task-wire-no-overrides",
  "native.terminal-revision-bound",
]);
const DECODER = new TextDecoder("utf-8", { fatal: true });
const RPC_EVENTS = Object.freeze([
  "message_end",
  "tool_execution_start",
  "tool_execution_end",
  "agent_end",
  "subagent_lifecycle",
  "subagent_progress",
  "subagent_event",
]);
const FORBIDDEN_TOOL = /(?:bash|shell|powershell|cmd(?:\.exe)?|ssh|host|write|edit|apply[_-]?patch|install|publish|deploy|service|git|curl|fetch|http|network|web|browser|get[_-]?subagents|workpool|settings|config|login|auth)/i;
const ALLOWED_TOOL = /^(?:read|grep|glob|wait|tasks?|todo)(?:$|[_.:])/i;
const TASK_FORBIDDEN_KEYS = new Set([
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

class ProbeError extends Error {
  constructor(code, message, details = {}, expectedRed = false) {
    super(message);
    this.name = "ProbeError";
    this.code = code;
    this.details = details;
    this.expectedRed = expectedRed;
  }
}

function fail(code, message, details = {}, expectedRed = false) {
  throw new ProbeError(code, message, details, expectedRed);
}


function blocked(message, details = {}) {
  fail("BLOCKED", message, details, false);
}

function now() {
  return new Date().toISOString();
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}


function scrubText(value, limit = 512) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/(?:Bearer\s+|token[=:]\s*|password[=:]\s*|secret[=:]\s*)\S+/gi, "[REDACTED]")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|(?:gh[pousr]_|github_pat_|npm_)[A-Za-z0-9_]{12,})\b/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function sensitiveKey(key) {
  return /(?:auth|token|secret|password|credential|api[_-]?key|cookie|private[_-]?key|system[_-]?prompt|chain[_-]?of[_-]?thought|cot|thinking|reasoning|provider[_-]?error|raw[_-]?error|^prompt$|^messages?$)/i.test(String(key));
}

function safeValue(value, depth = 0, key = "") {
  if (sensitiveKey(key)) return "[REDACTED]";
  if (depth > 32) blocked("safe evidence exceeded its structural depth bound");
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > 32_768) blocked("safe evidence exceeded its public string bound");
    return scrubText(value, 32_768);
  }
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) {
    if (value.length > 8192) blocked("safe evidence exceeded its array bound");
    return value.map((item) => safeValue(item, depth + 1, key));
  }
  if (typeof value === "object") {
    const output = {};
    const entries = Object.entries(value);
    if (entries.length > 1024) blocked("safe evidence exceeded its object bound");
    for (const [childKey, childValue] of entries) {
      output[childKey] = safeValue(childValue, depth + 1, childKey);
    }
    return output;
  }
  return typeof value;
}

function safeError(error) {
  return {
    code: error?.code ?? "BLOCKED",
    detail: scrubText(error?.message ?? error),
    expectedRed: error?.expectedRed === true,
    details: safeValue(error?.details ?? {}),
  };
}

function comparePath(value) {
  const normalized = resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(left, right) {
  return comparePath(left) === comparePath(right);
}

function isInside(root, child) {
  const base = comparePath(root);
  const target = comparePath(child);
  if (base === target) return true;
  const rel = relative(base, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel);
}

function existingDirectory(label, value) {
  if (typeof value !== "string" || value.trim() === "") fail("USAGE", `${label} must be a non-empty path`);
  const path = resolve(value);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    fail("BLOCKED", `${label} does not exist`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("BLOCKED", `${label} must be a real directory`);
  return path;
}

function existingRegularFile(label, value) {
  if (typeof value !== "string" || value.trim() === "") fail("USAGE", `${label} must be a non-empty path`);
  const path = resolve(value);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    fail("BLOCKED", `${label} does not exist`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail("BLOCKED", `${label} must be a regular file`);
  return path;
}

function assertNoSymlink(root, path, label) {
  const rootPath = resolve(root);
  const target = resolve(path);
  if (!isInside(rootPath, target)) blocked(`${label} escaped its allowed root`);
  const rel = relative(rootPath, target);
  let current = rootPath;
  for (const segment of rel.split(/[\\/]+/).filter(Boolean)) {
    current = join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      blocked(`${label} path component is missing`);
    }
    if (stat.isSymbolicLink()) blocked(`${label} may not traverse a symbolic link`);
  }
}

function labPath(lab, value, label) {
  if (typeof value !== "string" || value.trim() === "" || isAbsolute(value)) blocked(`${label} must be a relative path under --lab`);
  const candidate = resolve(lab, value);
  if (!isInside(lab, candidate) || samePath(candidate, lab)) blocked(`${label} escaped --lab`);
  assertNoSymlink(lab, candidate, label);
  return candidate;
}

function readJsonFile(path, label) {
  const bytes = readFileSync(path);
  if (bytes.byteLength > MAX_BOUND_DIFF_BYTES) blocked(`${label} is too large`);
  try {
    return { value: JSON.parse(DECODER.decode(bytes)), bytes, sha256: sha256Bytes(bytes) };
  } catch (error) {
    blocked(`${label} is not valid JSON`, { parse: scrubText(error?.message) });
  }
}
function readBoundJson(root, descriptor, label) {
  assertKeys(descriptor, ["path", "sha256", "bytes"], label);
  const path = labPath(root, descriptor.path, `${label}.path`);
  const expectedHash = requireSha256(descriptor.sha256, `${label}.sha256`);
  const expectedBytes = requireInteger(descriptor.bytes, `${label}.bytes`);
  const bytes = readFileSync(path);
  if (bytes.byteLength > MAX_BOUND_DIFF_BYTES) blocked(`${label} exceeds the bounded receipt limit`);
  const actualHash = sha256Bytes(bytes);
  if (bytes.byteLength !== expectedBytes || actualHash !== expectedHash) {
    blocked(`${label} bytes/hash do not match the supplied API receipt`, {
      expectedBytes,
      actualBytes: bytes.byteLength,
      expectedSha256: expectedHash,
      actualSha256: actualHash,
    });
  }
  let value;
  try {
    value = JSON.parse(DECODER.decode(bytes));
  } catch (error) {
    blocked(`${label} is not strict UTF-8 JSON`, { detail: scrubText(error?.message) });
  }
  assertOwnObject(value, label);
  return { path: descriptor.path, absolutePath: path, bytes: bytes.byteLength, sha256: actualHash, value };
}


function assertOwnObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) blocked(`${label} must be an object`);
}

function assertKeys(value, allowed, label) {
  assertOwnObject(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) blocked(`${label}.${key} is not allowed`);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function requireString(value, label) {
  if (!nonEmpty(value)) blocked(`${label} must be a non-empty string`);
  return value;
}

function requireSha1(value, label) {
  requireString(value, label);
  if (!SHA1.test(value)) blocked(`${label} must be a full 40-hex revision`);
  return value.toLowerCase();
}

function requireSha256(value, label) {
  requireString(value, label);
  if (!SHA256.test(value)) blocked(`${label} must be a 64-hex SHA-256`);
  return value.toLowerCase();
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) blocked(`${label} must be an integer >= ${minimum}`);
  return value;
}

function readBoundFile(root, descriptor, expectedRevision, label, maxBytes = MAX_BOUND_FILE_BYTES) {
  assertKeys(descriptor, ["path", "revision", "sha256", "bytes", "role"], label);
  const path = labPath(root, descriptor.path, `${label}.path`);
  const revision = requireSha1(descriptor.revision, `${label}.revision`);
  if (revision !== expectedRevision.toLowerCase()) blocked(`${label}.revision is stale or bound to another revision`);
  const expectedHash = requireSha256(descriptor.sha256, `${label}.sha256`);
  const expectedBytes = requireInteger(descriptor.bytes, `${label}.bytes`);
  const bytes = readFileSync(path);
  if (bytes.byteLength > maxBytes) blocked(`${label} exceeds the bounded read limit`);
  const actualHash = sha256Bytes(bytes);
  if (bytes.byteLength !== expectedBytes || actualHash !== expectedHash) {
    blocked(`${label} bytes/hash do not match the supplied revision-bound descriptor`, {
      expectedBytes,
      actualBytes: bytes.byteLength,
      expectedSha256: expectedHash,
      actualSha256: actualHash,
    });
  }
  return {
    path: descriptor.path,
    absolutePath: path,
    role: descriptor.role ?? null,
    revision,
    bytes: bytes.byteLength,
    sha256: actualHash,
  };
}

function readBoundDiff(root, descriptor, expectedRevision, label) {
  assertKeys(descriptor, ["path", "revision", "sha256", "bytes"], label);
  const result = readBoundFile(root, { ...descriptor, role: "diff" }, expectedRevision, label, MAX_BOUND_DIFF_BYTES);
  const content = readFileSync(result.absolutePath).toString("utf8");
  if (content.trim() === "") blocked(`${label} must contain a non-empty actual diff`);
  return { ...result, content };
}

function ensureDistinctCrossFile(files, label) {
  const paths = new Set(files.map((entry) => entry.path.toLowerCase()));
  if (paths.size < 2) blocked(`${label} requires changed and consumer files on distinct paths`);
}

function ensureDiffMentionsChanged(diff, files, label) {
  for (const file of files.filter((entry) => entry.role === "changed")) {
    const path = file.path.replaceAll("\\", "/");
    if (!diff.content.includes(path) && !diff.content.includes(`a/${path}`) && !diff.content.includes(`b/${path}`)) {
      blocked(`${label} does not contain the changed path ${path}`);
    }
  }
}
function validateGitReceipt(receipt, baseRef, headRef, baseRevision, headRevision, files, deletions, diff) {
  assertKeys(receipt, ["schema", "base_ref", "head_ref", "base_revision", "head_revision", "diff_sha256", "files", "consumer_paths", "deletions"], "branch Git receipt");
  if (receipt.schema !== "git-fixture-receipt-v1") blocked("branch Git receipt schema is not recognized");
  if (receipt.base_ref !== baseRef || receipt.head_ref !== headRef) blocked("branch Git receipt refs do not match the explicit base/head refs");
  if (String(receipt.base_revision).toLowerCase() !== baseRevision || String(receipt.head_revision).toLowerCase() !== headRevision) blocked("branch Git receipt revisions do not match the bound context");
  if (String(receipt.diff_sha256).toLowerCase() !== diff.sha256) blocked("branch Git receipt diff hash does not match the bound diff bytes");
  if (!Array.isArray(receipt.files) || !Array.isArray(receipt.consumer_paths) || !Array.isArray(receipt.deletions)) blocked("branch Git receipt must enumerate changed, consumer, and deleted paths");
  const listedFiles = new Set(receipt.files.filter(nonEmpty).map((path) => String(path).replaceAll("\\", "/")));
  const listedConsumers = new Set(receipt.consumer_paths.filter(nonEmpty).map((path) => String(path).replaceAll("\\", "/")));
  const listedDeletions = new Set(receipt.deletions.filter(nonEmpty).map((path) => String(path).replaceAll("\\", "/")));
  for (const file of files) {
    const normalized = file.path.replaceAll("\\", "/");
    if (file.role === "changed" && !listedFiles.has(normalized)) blocked(`branch Git receipt omitted changed path ${normalized}`);
    if (file.role === "consumer" && !listedFiles.has(normalized) && !listedConsumers.has(normalized)) blocked(`branch Git receipt omitted pertinent consumer path ${normalized}`);
  }
  for (const deletion of deletions) {
    const normalized = deletion.path.replaceAll("\\", "/");
    if (!listedDeletions.has(normalized)) blocked(`branch Git receipt omitted deleted path ${normalized}`);
  }
}

function validateApiReceipt(receipt, raw, repository, pullRequest, expectedState, headRevision, baseRevision, files, deletions) {
  assertKeys(receipt, ["schema", "repository", "pull_request", "state", "head_sha", "base_sha", "patch_sha256", "files", "consumer_paths", "deletions"], "PR API receipt");
  if (receipt.schema !== "github-api-pr-receipt-v1") blocked("PR API receipt schema is not recognized");
  if (receipt.repository !== repository || receipt.pull_request !== pullRequest) blocked("PR API receipt identity does not match the PR descriptor");
  if (receipt.state !== undefined && receipt.state !== null && !["open", "closed"].includes(receipt.state)) blocked("PR API receipt state is invalid");
  if (expectedState && receipt.state !== expectedState) blocked("PR API receipt state does not match the pinned PR URI");
  if (String(receipt.head_sha).toLowerCase() !== headRevision || String(receipt.base_sha).toLowerCase() !== baseRevision) blocked("PR API receipt SHAs do not match the pinned descriptor");
  if (String(receipt.patch_sha256).toLowerCase() !== raw.patch.sha256.toLowerCase()) blocked("PR API receipt patch hash does not match the bound patch bytes");
  if (!Array.isArray(receipt.files) || !Array.isArray(receipt.consumer_paths) || !Array.isArray(receipt.deletions)) blocked("PR API receipt must enumerate changed, consumer, and deleted paths");
  const listedFiles = new Set(receipt.files.map((entry) => typeof entry === "string" ? entry : entry?.path).filter(nonEmpty).map((path) => String(path).replaceAll("\\", "/")));
  const listedConsumers = new Set(receipt.consumer_paths.filter(nonEmpty).map((path) => String(path).replaceAll("\\", "/")));
  const listedDeletions = new Set(receipt.deletions.map((entry) => typeof entry === "string" ? entry : entry?.path).filter(nonEmpty).map((path) => String(path).replaceAll("\\", "/")));
  for (const file of files) {
    const normalized = file.path.replaceAll("\\", "/");
    if (file.role === "changed" && !listedFiles.has(normalized)) blocked(`PR API receipt omitted changed path ${normalized}`);
    if (file.role === "consumer" && !listedFiles.has(normalized) && !listedConsumers.has(normalized)) blocked(`PR API receipt omitted pertinent consumer path ${normalized}`);
  }
  for (const deletion of deletions) {
    const normalized = deletion.path.replaceAll("\\", "/");
    if (!listedDeletions.has(normalized)) blocked(`PR API receipt omitted base content for deleted path ${normalized}`);
  }
}

function summarizeBound(bound) {
  return {
    kind: bound.kind,
    mode: bound.mode,
    descriptor: bound.descriptorPath,
    descriptor_sha256: bound.descriptorSha256,
    revision: bound.revision,
    base_revision: bound.baseRevision,
    head_revision: bound.headRevision,
    base_ref: bound.baseRef ?? null,
    head_ref: bound.headRef ?? null,
    repository: bound.repository ?? null,
    pull_request: bound.pullRequest ?? null,
    uri: bound.uri ?? null,
    diff: { path: bound.diff.path, bytes: bound.diff.bytes, sha256: bound.diff.sha256, revision: bound.diff.revision },
    files: bound.files.map(({ path, role, revision, bytes, sha256 }) => ({ path, role, revision, bytes, sha256 })),
    deletions: bound.deletions.map(({ path, role, revision, bytes, sha256 }) => ({ path, role, revision, bytes, sha256 })),
    consumer_paths: bound.consumerPaths,
    source_receipt: bound.receipt ? { path: bound.receipt.path, bytes: bound.receipt.bytes, sha256: bound.receipt.sha256 } : null,
    evidence_level: bound.receipt ? (bound.kind === "pr-uri" ? "remote-api-receipt" : "local-git-receipt") : "fixture-consumer",
  };
}

function bindBranchDescriptor(raw, descriptorPath, descriptorSha256, lab, sourceRoot) {
  assertKeys(raw, [
    "kind", "mode", "root", "base_root", "base_ref", "head_ref", "base_revision", "head_revision", "revision",
    "diff", "files", "deletions", "provenance",
  ], "branch context");
  if (raw.kind !== "branch-base" || raw.mode !== "BRANCH_BASE") blocked("branch context kind/mode must identify BRANCH_BASE");
  const root = labPath(lab, raw.root, "branch context.root");
  const baseRoot = labPath(lab, raw.base_root, "branch context.base_root");
  if (samePath(root, baseRoot)) blocked("branch context head and base roots must remain separate");
  if (samePath(root, sourceRoot) || samePath(baseRoot, sourceRoot) || isInside(sourceRoot, root) || isInside(sourceRoot, baseRoot)) {
    blocked("branch context may not substitute the live workspace for the lab fixture");
  }
  const baseRevision = requireSha1(raw.base_revision, "branch context.base_revision");
  const headRevision = requireSha1(raw.head_revision, "branch context.head_revision");
  const revision = requireSha1(raw.revision, "branch context.revision");
  if (revision !== headRevision) blocked("local_revision_context.revision must equal head_revision");
  const baseRef = requireString(raw.base_ref, "branch context.base_ref");
  const headRef = requireString(raw.head_ref, "branch context.head_ref");
  const provenance = raw.provenance;
  assertKeys(provenance, ["provider", "receipt"], "branch context.provenance");
  if (provenance.provider !== "git-fixture") blocked("branch context provenance must be an independently captured Git fixture receipt");
  if (!Array.isArray(raw.files) || raw.files.length === 0) blocked("branch context.files must be non-empty");
  if (!Array.isArray(raw.deletions)) blocked("branch context.deletions must be an array");
  const diff = readBoundDiff(root, raw.diff, headRevision, "branch context.diff");
  const files = raw.files.map((entry, index) => readBoundFile(root, entry, headRevision, `branch context.files[${index}]`));
  const deletions = raw.deletions.map((entry, index) => readBoundFile(baseRoot, entry, baseRevision, `branch context.deletions[${index}]`));
  if (!files.some((entry) => entry.role === "changed")) blocked("branch context must bind at least one changed file");
  if (!files.some((entry) => entry.role === "consumer")) blocked("branch context must bind at least one pertinent consumer file");
  ensureDistinctCrossFile(files, "branch context");
  ensureDiffMentionsChanged(diff, files, "branch context.diff");
  const gitReceipt = readBoundJson(root, provenance.receipt, "branch context.provenance.receipt");
  validateGitReceipt(gitReceipt.value, baseRef, headRef, baseRevision, headRevision, files, deletions, diff);
  return {
    kind: "branch-base",
    mode: "BRANCH_BASE",
    descriptorPath,
    descriptorSha256,
    root,
    baseRoot,
    baseRef,
    headRef,
    baseRevision,
    headRevision,
    revision,
    diff,
    files,
    deletions,
    receipt: gitReceipt,
    consumerPaths: files.filter((entry) => entry.role === "consumer").map((entry) => entry.path),
    request: {
      mode: "BRANCH_BASE",
      protocol_mode: "DEEP_REVIEW",
      local_revision_context: {
        mode: "BRANCH_BASE",
        revision,
        base_ref: baseRef,
        head_ref: headRef,
        base_revision: baseRevision,
        head_revision: headRevision,
        diff: diff.content,
      },
    },
  };
}

function parsePrUri(uri) {
  if (!nonEmpty(uri)) blocked("PR context.uri must be a non-empty pr:// URI");
  const match = /^pr:\/\/([^/]+\/[^/]+)\/([1-9]\d*)\/diff\/(?:all|files)(?:\?state=(open|closed))?$/.exec(uri);
  if (!match) blocked("PR context.uri must identify the supplied repository/PR diff and optional state");
  return { repository: match[1], pullRequest: Number(match[2]), state: match[3] ?? null };
}

function bindPrDescriptor(raw, descriptorPath, descriptorSha256, lab, sourceRoot) {
  assertKeys(raw, [
    "kind", "mode", "repository", "pull_request", "state", "uri", "root", "base_root", "head_sha", "base_sha",
    "head_ref", "base_ref", "patch", "files", "deletions", "retrieval",
  ], "PR context");
  if (raw.kind !== "pr-uri" || raw.mode !== "PR") blocked("PR context kind/mode must identify PR");
  const repository = requireString(raw.repository, "PR context.repository");
  const pullRequest = requireInteger(raw.pull_request, "PR context.pull_request", 1);
  const uri = requireString(raw.uri, "PR context.uri");
  const parsedUri = parsePrUri(uri);
  if (parsedUri.repository !== repository || parsedUri.pullRequest !== pullRequest) blocked("PR URI must match repository and pull_request");
  if (raw.state !== undefined && raw.state !== null && !["open", "closed"].includes(raw.state)) blocked("PR context.state must be open or closed");
  if (raw.state && parsedUri.state && raw.state !== parsedUri.state) blocked("PR context.state must match the pinned URI state");
  if (!Array.isArray(raw.files) || raw.files.length === 0) blocked("PR context.files must be non-empty");
  if (!Array.isArray(raw.deletions)) blocked("PR context.deletions must be an array");
  const root = labPath(lab, raw.root, "PR context.root");
  const baseRoot = labPath(lab, raw.base_root, "PR context.base_root");
  if (samePath(root, baseRoot)) blocked("PR context head and base roots must remain separate");
  if (samePath(root, sourceRoot) || samePath(baseRoot, sourceRoot) || isInside(sourceRoot, root) || isInside(sourceRoot, baseRoot)) {
    blocked("PR context may not substitute the live workspace for remote content");
  }
  const headRevision = requireSha1(raw.head_sha, "PR context.head_sha");
  const baseRevision = requireSha1(raw.base_sha, "PR context.base_sha");
  const retrieval = raw.retrieval;
  assertKeys(retrieval, ["provider", "patch_revision", "head_revision", "base_revision", "same_head_sha", "files_complete", "base_for_deletions", "receipt"], "PR context.retrieval");
  if (retrieval.provider !== "github-api") blocked("PR context.retrieval.provider must be github-api");
  if (String(retrieval.patch_revision).toLowerCase() !== headRevision || String(retrieval.head_revision).toLowerCase() !== headRevision) blocked("PR patch retrieval is not pinned to the actual remote head SHA");
  if (String(retrieval.base_revision).toLowerCase() !== baseRevision) blocked("PR base retrieval is not pinned to the actual base SHA");
  if (retrieval.same_head_sha !== true || retrieval.files_complete !== true) blocked("PR retrieval must attest same-SHA patch and complete file collection");
  if (raw.deletions.length > 0 && retrieval.base_for_deletions !== true) blocked("PR deletion content must be collected from the base SHA");
  const diff = readBoundDiff(root, raw.patch, headRevision, "PR context.patch");
  const files = raw.files.map((entry, index) => readBoundFile(root, entry, headRevision, `PR context.files[${index}]`));
  const deletions = raw.deletions.map((entry, index) => readBoundFile(baseRoot, entry, baseRevision, `PR context.deletions[${index}]`));
  const receipt = readBoundJson(root, retrieval.receipt, "PR context.retrieval.receipt");
  validateApiReceipt(receipt.value, raw, repository, pullRequest, raw.state ?? parsedUri.state, headRevision, baseRevision, files, deletions);
  if (!files.some((entry) => entry.role === "changed")) blocked("PR context must bind at least one changed file");
  if (!files.some((entry) => entry.role === "consumer")) blocked("PR context must bind at least one pertinent consumer file");
  ensureDistinctCrossFile(files, "PR context");
  ensureDiffMentionsChanged(diff, files, "PR context.patch");
  const consumerPaths = files.map((entry) => entry.path).concat(deletions.map((entry) => entry.path));
  return {
    kind: "pr-uri",
    mode: "PR",
    descriptorPath,
    descriptorSha256,
    root,
    baseRoot,
    repository,
    pullRequest,
    state: raw.state ?? parsedUri.state,
    uri,
    baseRevision,
    headRevision,
    baseRef: raw.base_ref ?? null,
    headRef: raw.head_ref ?? null,
    revision: headRevision,
    diff,
    files,
    deletions,
    receipt,
    consumerPaths,
    request: {
      mode: "PR",
      protocol_mode: "DEEP_REVIEW",
      repository,
      pull_request: pullRequest,
      patch_source: { kind: "pr-uri", uri, sha: headRevision, content: diff.content },
      consumer_context: { revision: headRevision, files: consumerPaths },
    },
  };
}

function loadContext(path, kind, options) {
  const descriptorPath = existingRegularFile(`${kind} context`, path);
  if (!isInside(options.lab, descriptorPath)) blocked(`${kind} context must be under --lab`);
  assertNoSymlink(options.lab, descriptorPath, `${kind} context`);
  const parsed = readJsonFile(descriptorPath, `${kind} context`);
  const raw = parsed.value;
  const bound = kind === "branch"
    ? bindBranchDescriptor(raw, descriptorPath, parsed.sha256, options.lab, options.source)
    : bindPrDescriptor(raw, descriptorPath, parsed.sha256, options.lab, options.source);
  bound.raw = raw;
  return bound;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function resultSummary(result) {
  if (!result || typeof result !== "object") return { type: typeof result };
  return {
    ok: result.ok === true,
    status: typeof result.status === "string" ? result.status : null,
    errors: Array.isArray(result.errors) ? result.errors.slice(0, 8).map((item) => scrubText(item)) : [],
    reviewed_revision: result.reviewed_revision ?? result.value?.reviewed_revision ?? null,
  };
}

function expectAccepted(label, result, details = {}) {
  const accepted = result && result.ok === true && (result.status === undefined || result.status === "VALID");
  if (!accepted) {
    return { label, status: "FAIL", expected: "accepted", observed: resultSummary(result), details };
  }
  return { label, status: "PASS", expected: "accepted", observed: resultSummary(result), details };
}

function expectRefused(label, thunk, details = {}) {
  try {
    const result = thunk();
    if (result && typeof result === "object" && result.ok === false) {
      return { label, status: "PASS", expected: "refused", observed: resultSummary(result), details };
    }
    return { label, status: "FAIL", expected: "refused", observed: resultSummary(result), details };
  } catch (error) {
    if (error instanceof ProbeError && ["BLOCKED", "E_SOURCE_CONTEXT"].includes(error.code)) {
      return { label, status: "PASS", expected: "refused", observed: { code: error.code, detail: scrubText(error.message) }, details };
    }
    return { label, status: "FAIL", expected: "refused", observed: safeError(error), details };
  }
}

function protocolCases(protocol, bound) {
  const cases = [];
  const positive = protocol.validateRequest(bound.request);
  const expectedRevision = bound.kind === "branch-base" ? bound.headRevision : bound.headRevision;
  cases.push(expectAccepted(`${bound.kind}.protocol-positive`, positive, {
    revision: expectedRevision,
    actual_consumer: "deep-review/lib/protocol.mjs::validateRequest",
  }));
  if (positive?.value?.reviewed_revision !== expectedRevision) {
    cases.at(-1).status = "FAIL";
    cases.at(-1).details.revision_mismatch = true;
  }

  if (bound.kind === "branch-base") {
    const stale = cloneJson(bound.request);
    stale.local_revision_context.revision = bound.baseRevision;
    cases.push(expectRefused("branch-base.stale-local-revision", () => protocol.validateRequest(stale), {
      control: "revision != head_revision",
      expected_error_family: "source-context-stale",
    }));
    const mismatchedHead = cloneJson(bound.request);
    mismatchedHead.local_revision_context.head_revision = bound.baseRevision;
    cases.push(expectRefused("branch-base.mismatched-head-revision", () => protocol.validateRequest(mismatchedHead), {
      control: "revision != head_revision",
      expected_error_family: "source-context-mismatch",
    }));
    const noBase = cloneJson(bound.request);
    delete noBase.local_revision_context.base_revision;
    cases.push(expectRefused("branch-base.missing-explicit-base", () => protocol.validateRequest(noBase), {
      control: "base_revision is required",
      expected_error_family: "schema",
    }));
  } else {
    const staleConsumer = cloneJson(bound.request);
    staleConsumer.consumer_context.revision = bound.baseRevision;
    cases.push(expectRefused("pr.stale-consumer-revision", () => protocol.validateRequest(staleConsumer), {
      control: "consumer_context.revision != patch_source.sha",
      expected_error_family: "source-context-stale",
    }));
    const conflictingAlias = cloneJson(bound.request);
    conflictingAlias.patch_source.head_sha = bound.baseRevision;
    cases.push(expectRefused("pr.conflicting-head-alias", () => protocol.validateRequest(conflictingAlias), {
      control: "one actual remote head SHA only",
      expected_error_family: "sha-mismatch",
    }));
    const localSubstitution = cloneJson(bound.request);
    localSubstitution.local_revision_context = {
      mode: "BRANCH_BASE",
      revision: bound.headRevision,
      base_ref: "main",
      head_ref: "local",
      base_revision: bound.baseRevision,
      head_revision: bound.headRevision,
      diff: "unbound local workspace patch",
    };
    cases.push(expectRefused("pr.local-workspace-substitution", () => protocol.validateRequest(localSubstitution), {
      control: "PR mode forbids local_revision_context",
      expected_error_family: "unbound-workspace",
    }));
  }
  return cases;
}

function sourceBindingCases(bound, options) {
  const cases = [];
  const raw = bound.raw;
  if (bound.kind === "branch-base") {
    const stale = cloneJson(raw);
    stale.revision = bound.baseRevision;
    cases.push(expectRefused("branch-base.source-binding-stale-revision", () => bindBranchDescriptor(stale, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "descriptor revision must equal head_revision",
      expected_error_family: "E_SOURCE_CONTEXT",
    }));
    const gitReceiptHashMismatch = cloneJson(raw);
    gitReceiptHashMismatch.provenance.receipt.sha256 = "0".repeat(64);
    cases.push(expectRefused("branch-base.source-binding-git-receipt-hash", () => bindBranchDescriptor(gitReceiptHashMismatch, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "Git branch/base provenance must be independently hash-bound",
      expected_error_family: "E_SOURCE_CONTEXT",
    }));
    const staleFile = cloneJson(raw);
    staleFile.files[0].sha256 = "0".repeat(64);
    cases.push(expectRefused("branch-base.source-binding-file-hash", () => bindBranchDescriptor(staleFile, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "complete pertinent file content is hash-bound",
      expected_error_family: "E_SOURCE_CONTEXT",
    }));
    const missingConsumer = cloneJson(raw);
    missingConsumer.files = missingConsumer.files.filter((entry) => entry.role !== "consumer");
    cases.push(expectRefused("branch-base.source-binding-cross-file-consumer", () => bindBranchDescriptor(missingConsumer, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "cross-file consumer must be explicitly bound",
      expected_error_family: "E_SOURCE_CONTEXT",
    }));
    const workspaceFallback = cloneJson(raw);
    workspaceFallback.root = options.source;
    cases.push(expectRefused("branch-base.source-binding-workspace-fallback", () => bindBranchDescriptor(workspaceFallback, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "live workspace is not a source-context substitute",
      expected_error_family: "E_RESOURCE",
    }));
    const staleDiff = cloneJson(raw);
    staleDiff.diff.sha256 = "f".repeat(64);
    cases.push(expectRefused("branch-base.source-binding-diff-hash", () => bindBranchDescriptor(staleDiff, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "actual diff bytes are hash-bound",
      expected_error_family: "E_SOURCE_CONTEXT",
    }));
  } else {
    const stalePatch = cloneJson(raw);
    stalePatch.retrieval.patch_revision = bound.baseRevision;
    cases.push(expectRefused("pr.source-binding-patch-head", () => bindPrDescriptor(stalePatch, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "patch retrieval must use the actual remote head SHA",
      expected_error_family: "E_SOURCE_CONTEXT",
    }));
    const receiptHashMismatch = cloneJson(raw);
    receiptHashMismatch.retrieval.receipt.sha256 = "0".repeat(64);
    cases.push(expectRefused("pr.source-binding-api-receipt-hash", () => bindPrDescriptor(receiptHashMismatch, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "remote API receipt must be independently hash-bound",
      expected_error_family: "E_SOURCE_CONTEXT",
    }));
    const staleFile = cloneJson(raw);
    staleFile.files[0].revision = bound.baseRevision;
    cases.push(expectRefused("pr.source-binding-file-revision", () => bindPrDescriptor(staleFile, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "full file content must use the same head SHA",
      expected_error_family: "E_SOURCE_CONTEXT",
    }));
    const missingBase = cloneJson(raw);
    if (missingBase.deletions?.length > 0) {
      missingBase.retrieval.base_for_deletions = false;
      cases.push(expectRefused("pr.source-binding-deletion-base", () => bindPrDescriptor(missingBase, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
        control: "deleted paths require base content at base SHA",
        expected_error_family: "E_SOURCE_CONTEXT",
      }));
    } else {
      cases.push({ label: "pr.source-binding-deletion-base", status: "PASS", expected: "not-applicable", observed: { reason: "actual PR API file list contains no deletions" }, details: { evidence_level: "remote-api-receipt", not_applicable: true } });
    }
    const workspaceFallback = cloneJson(raw);
    workspaceFallback.root = options.source;
    cases.push(expectRefused("pr.source-binding-workspace-fallback", () => bindPrDescriptor(workspaceFallback, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "unbound local workspace may not replace remote content",
      expected_error_family: "E_RESOURCE",
    }));
    const mismatchedUri = cloneJson(raw);
    mismatchedUri.uri = `pr://other/repository/${bound.pullRequest}/diff/all`;
    cases.push(expectRefused("pr.source-binding-uri-mismatch", () => bindPrDescriptor(mismatchedUri, bound.descriptorPath, bound.descriptorSha256, options.lab, options.source), {
      control: "remote URI must match repository and pull_request",
      expected_error_family: "E_SOURCE_CONTEXT",
    }));
  }
  return cases;
}

function makeStateFixture(stateApi, criterionStatus, phase) {
  const fullHead = "a".repeat(40);
  const gates = Object.fromEntries(stateApi.GATES.map((gate) => [gate, "PASS"]));
  const gateOrigins = Object.fromEntries(stateApi.GATES.map((gate) => [gate, ""]));
  const gateEvidence = Object.fromEntries(stateApi.GATES.map((gate) => [gate, gate === "spec_kit" ? "fixture spec.md plan.md tasks.md interface-contract.md" : `fixture gate evidence ${gate}`]));
  const task = {
    id: "T009C",
    title: "T009C review context fixture",
    phase,
    attempt: 0,
    allowed_write_globs: ["ephemeral/**"],
    acceptance_criteria: ["AC-014"],
    implemented_by: "existing-code",
    reviewed_by: "peer-reviewer",
    review: { status: "APPROVED", agent: "peer-reviewer", independent: true, revision: fullHead, evidence: "fixture independent review" },
    red: {
      status: "PASS",
      failing_tests: [],
      failure_reason_expected: false,
      criteria_to_tests: { "AC-014": ["ephemeral/ship-native-review-context-regression.mjs::source binding controls"] },
      revision_delta: { ac: "", test: "", evidence: "" },
      revision_baseline_tests: {},
    },
    green: { status: "SKIPPED", reason_if_skipped: "existing source behavior probe", changed_files: [], tooling_evidence: "", tooling_suite_evidence: "" },
    refactor: { status: "SKIPPED", reason_if_skipped: "no source change in ephemeral probe" },
    doc_impact: "none",
    gates,
    gate_origins: gateOrigins,
    gate_evidence: gateEvidence,
    blockers: [],
    evidence: "fixture consumer evidence",
  };
  return {
    schema_version: "2.3",
    run_id: "fixture-t009c",
    task_source: "ephemeral native review-context probe",
    updated_at: "2026-11-11T00:00:00Z",
    repo: {
      branch_start: "main",
      branch_work: "fixture",
      merge_target: "main",
      delivery: "internal",
      merge_status: "",
      pr_url: "",
      head_start: fullHead,
      head_current: fullHead,
      dirty_at_start: false,
    },
    baseline: { status: "PASS", tests: "PASS", tests_evidence: "fixture tests", build: "PASS", build_evidence: "fixture build", override_approved: false, known_failures: [] },
    spec_kit: {
      spec: "./specs/specs005-omp-compatible-release/spec.md",
      plan: "./specs/specs005-omp-compatible-release/plan.md",
      tasks: "./specs/specs005-omp-compatible-release/tasks.md",
      status: "WRITTEN",
      written_at: "2026-11-11T00:00:00Z",
      mode: "created",
    },
    contract: { file: "./specs/specs005-omp-compatible-release/contracts/interface-contract.md", version: "0.5.0", status: "APPROVED", na_reason: "" },
    acceptance_criteria: [{ id: "AC-014", type: "behavioral", desc: "review context and DONE proof", source: "./specs/specs005-omp-compatible-release/spec.md#AC-014", tasks: ["T009C"], status: criterionStatus }],
    waves: [{ wave: 1, status: "in_progress", integration: { status: "pending", attempt: 0, evidence: "" }, tasks: [task] }],
  };
}

function promotionWave(stateApi, progress) {
  const wave = cloneJson(progress.waves[0]);
  wave.status = "integrating";
  wave.integration = { status: "PASS", attempt: 1, evidence: "fixture integration evidence" };
  wave.review = {
    status: "APPROVED",
    agent: "peer-reviewer",
    independent: true,
    revision: "a".repeat(40),
    evidence: "fixture independent post-integration review",
    aggregate: { status: "APPROVED", findings: [], blockers: [], counts: { P0: 0, P1: 0, P2: 0, P3: 0 } },
  };
  wave.validation = {
    status: "PASS",
    agent: "validator",
    suite: { command: "fixture-only-not-a-suite", output: "fixture PASS" },
    evidence: "fixture validator evidence",
    gates: Object.fromEntries(stateApi.GATES.map((gate) => [gate, { status: "PASS", command: `fixture ${gate}`, output: gate === "spec_kit" ? "fixture PASS spec.md plan.md tasks.md interface-contract.md" : "fixture PASS" }])),
  };
  return wave;
}

function stateCases(stateApi) {
  const cases = [];
  for (const status of ["IMPLEMENTED", "VALIDATED"]) {
    const doc = makeStateFixture(stateApi, status, "DOC");
    const docResult = stateApi.validateProgress(doc);
    cases.push(expectAccepted(`state.DOC.${status}`, docResult, { consumer: "tdd-orchestrator/lib/state.mjs::validateProgress" }));
    const done = makeStateFixture(stateApi, status, "DONE");
    const doneResult = stateApi.validateProgress(done);
    cases.push(expectAccepted(`state.DONE.${status}`, doneResult, { consumer: "tdd-orchestrator/lib/state.mjs::validateProgress" }));
    const waveResult = stateApi.canPromoteWave(promotionWave(stateApi, done), { acceptanceCriteria: done.acceptance_criteria });
    cases.push(expectAccepted(`state.promotion.${status}`, waveResult, { consumer: "tdd-orchestrator/lib/state.mjs::canPromoteWave" }));
  }
  const coveredDoc = makeStateFixture(stateApi, "COVERED", "DOC");
  cases.push(expectAccepted("state.DOC.COVERED.ongoing", stateApi.validateProgress(coveredDoc), {
    control: "COVERED remains legal while documentation is ongoing",
    consumer: "tdd-orchestrator/lib/state.mjs::validateProgress",
  }));
  cases.push(expectRefused("state.promotion.COVERED.DOC", () => stateApi.canPromoteWave(promotionWave(stateApi, coveredDoc), { acceptanceCriteria: coveredDoc.acceptance_criteria }), {
    control: "DOC task cannot promote before DONE",
    expected_error_family: "E_PROGRESS",
  }));
  const coveredDone = makeStateFixture(stateApi, "COVERED", "DONE");
  cases.push(expectRefused("state.DONE.COVERED", () => stateApi.validateProgress(coveredDone), {
    control: "COVERED is not sufficient for DONE",
    expected_error_family: "E_PROGRESS",
  }));
  const coveredDoneWave = promotionWave(stateApi, coveredDone);
  cases.push(expectRefused("state.promotion.COVERED.DONE", () => stateApi.canPromoteWave(coveredDoneWave, { acceptanceCriteria: coveredDone.acceptance_criteria }), {
    control: "wave promotion requires IMPLEMENTED or VALIDATED",
    expected_error_family: "E_PROGRESS",
  }));
  const noFase0 = makeStateFixture(stateApi, "IMPLEMENTED", "DOC");
  noFase0.spec_kit.status = "PENDING";
  cases.push(expectRefused("state.Fase0.missing-documentation-proof", () => stateApi.validateProgress(noFase0), {
    control: "Fase 0 documentation must precede DOC",
    expected_error_family: "E_PROGRESS",
  }));
  const noReview = makeStateFixture(stateApi, "VALIDATED", "DONE");
  noReview.waves[0].tasks[0].review = { status: "PENDING", agent: "", independent: false, revision: "", evidence: "" };
  cases.push(expectRefused("state.promotion.missing-review", () => stateApi.canPromoteWave(promotionWave(stateApi, noReview), { acceptanceCriteria: noReview.acceptance_criteria }), {
    control: "current independent review is required",
    expected_error_family: "E_HISTORY",
  }));
  const noValidation = makeStateFixture(stateApi, "VALIDATED", "DONE");
  const noValidationWave = promotionWave(stateApi, noValidation);
  delete noValidationWave.validation;
  cases.push(expectRefused("state.promotion.missing-validator", () => stateApi.canPromoteWave(noValidationWave, { acceptanceCriteria: noValidation.acceptance_criteria }), {
    control: "current validator/gates are required",
    expected_error_family: "E_HISTORY",
  }));
  return cases;
}

function collectStringsByKey(value, keys, output = [], depth = 0) {
  if (depth > 7 || value === null || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 128)) collectStringsByKey(item, keys, output, depth + 1);
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && typeof child === "string") output.push(child);
    else if (typeof child === "object") collectStringsByKey(child, keys, output, depth + 1);
  }
  return output;
}

function findFirst(value, keys, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirst(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && (typeof child === "string" || typeof child === "number")) return child;
    if (child && typeof child === "object") {
      const found = findFirst(child, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function findObjectField(value, keys, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return undefined;
  const wanted = new Set([...keys].map((key) => key.toLowerCase()));
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

function hasForbiddenKey(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = hasForbiddenKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (TASK_FORBIDDEN_KEYS.has(key)) return key;
    const found = hasForbiddenKey(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function isOperationalObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function yieldItems(record) {
  if (Array.isArray(record?.yield)) return { source: "progress.yield", items: record.yield };
  if (Array.isArray(record?.extractedToolData?.yield)) return { source: "progress.extractedToolData.yield", items: record.extractedToolData.yield };
  return { source: null, items: [] };
}

// Same typed-yield semantics as the already exercised native profile driver.
// Identity and revision come from actual data, never a task acknowledgement.
function assembleNativeReview(items) {
  let terminal;
  const sections = {};
  for (const item of items) {
    if (!isOperationalObject(item) || item.status === "aborted") continue;
    const labels = Array.isArray(item.type) ? item.type.filter(nonEmpty) : [];
    if (!Object.prototype.hasOwnProperty.call(item, "data")) continue;
    if (labels.length === 0) {
      terminal = item.data;
      continue;
    }
    for (const label of labels) {
      if (label === "findings") {
        if (!Array.isArray(sections.findings)) sections.findings = [];
        if (Array.isArray(item.data)) sections.findings.push(...item.data);
        else sections.findings.push(item.data);
      } else {
        sections[label] = item.data;
      }
    }
  }
  return terminal !== undefined ? terminal : Object.keys(sections).length > 0 ? sections : undefined;
}

function publicReviewData(value) {
  if (!isOperationalObject(value)) return { kind: Array.isArray(value) ? "array" : typeof value };
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (DEEP_REVIEW_FIELDS.has(key)) output[key] = safeValue(item);
    else if (typeof value.ok === "boolean" && key === "value") output.value = publicReviewData(item);
    else if (typeof value.ok === "boolean" && ["ok", "errors"].includes(key)) output[key] = safeValue(item);
    else output[key] = "[NON_PUBLIC_FIELD]";
  }
  return output;
}

function safeYieldItems(items) {
  return items.map((item) => {
    if (!isOperationalObject(item)) return { malformed: true };
    const output = {};
    for (const key of ["status", "type", "complete", "useLastTurn", "schemaOverridden"]) {
      if (Object.prototype.hasOwnProperty.call(item, key)) output[key] = safeValue(item[key]);
    }
    if (Object.prototype.hasOwnProperty.call(item, "data")) {
      const labels = Array.isArray(item.type) ? item.type.filter(nonEmpty) : [];
      if (labels.length === 0) output.data = publicReviewData(item.data);
      else if (labels.every((label) => DEEP_REVIEW_FIELDS.has(label))) output.data = safeValue(item.data);
      else output.data_omitted = "non-public yield label";
    }
    return output;
  });
}

function safeOperationalRecord(record) {
  if (!isOperationalObject(record)) return null;
  const output = { observed_keys: Object.keys(record) };
  for (const key of ["id", "index", "agent", "agentSource", "status", "exitCode", "aborted", "truncated", "durationMs", "parentToolCallId", "taskFile", "taskFileSha256", "sourceFile", "sourceSha256"]) {
    if (Object.prototype.hasOwnProperty.call(record, key)) output[key] = safeValue(record[key]);
  }
  const yielded = yieldItems(record);
  if (yielded.source) {
    output.yield_source = yielded.source;
    output.yield = safeYieldItems(yielded.items);
  }
  if (isOperationalObject(record.structuredOutput)) {
    output.structuredOutput = {};
    for (const key of ["schema", "schemaSource", "mode", "status", "valid", "validation"]) {
      if (Object.prototype.hasOwnProperty.call(record.structuredOutput, key)) output.structuredOutput[key] = safeValue(record.structuredOutput[key]);
    }
    if (Object.prototype.hasOwnProperty.call(record.structuredOutput, "data")) output.structuredOutput.data = publicReviewData(record.structuredOutput.data);
  }
  return output;
}

function subagentObservation(frame) {
  const payload = isOperationalObject(frame.payload) ? frame.payload : isOperationalObject(frame.event) ? frame.event : isOperationalObject(frame.data) ? frame.data : frame;
  const payloadPath = payload === frame ? "frame" : payload === frame.payload ? "frame.payload" : payload === frame.event ? "frame.event" : "frame.data";
  const progress = isOperationalObject(payload.progress) ? payload.progress
    : frame.type === "subagent_progress" && isOperationalObject(payload) ? payload : null;
  const identity = [payload.id, progress?.id, frame.agentId, frame.agent_id, frame.taskId, frame.task_id, frame.id].find(nonEmpty) ?? null;
  const agent = progress?.agent ?? payload.agent ?? frame.agent ?? null;
  const agentSource = progress?.agentSource ?? payload.agentSource ?? frame.agentSource ?? null;
  const status = progress?.status ?? payload.status ?? null;
  const capture = {
    frame_type: frame.type,
    frame_keys: Object.keys(frame),
    payload_path: payloadPath,
    payload_keys: Object.keys(payload),
    id: identity,
    agent,
    agentSource,
    status,
    progress_sha256: progress ? sha256Bytes(Buffer.from(JSON.stringify(progress), "utf8")) : null,
    progress: progress ? safeOperationalRecord(progress) : null,
  };
  const event = isOperationalObject(payload.event) ? payload.event : null;
  if (event) {
    capture.event = { observed_keys: Object.keys(event) };
    for (const key of ["type", "toolName", "tool_name", "toolCallId", "tool_call_id"]) {
      if (Object.prototype.hasOwnProperty.call(event, key)) capture.event[key] = safeValue(event[key]);
    }
  }
  return { payload, progress, identity, agent, agentSource, status, capture };
}

function taskDetailsEnvelopes(value, output = [], depth = 0) {
  if (depth > 6 || !isOperationalObject(value)) return output;
  if (Array.isArray(value.results) || Array.isArray(value.progress)) output.push(value);
  for (const key of ["details", "result", "output", "data"]) {
    if (isOperationalObject(value[key])) taskDetailsEnvelopes(value[key], output, depth + 1);
  }
  return output;
}

function rawStructuredReview(record) {
  const yielded = yieldItems(record);
  if (yielded.items.length > 0) return { data: assembleNativeReview(yielded.items), source: yielded.source };
  if (isOperationalObject(record?.structuredOutput) && Object.prototype.hasOwnProperty.call(record.structuredOutput, "data")) {
    return { data: record.structuredOutput.data, source: "structuredOutput.data" };
  }
  return { data: undefined, source: null };
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
  const timeout = new Promise((_, rejectPromise) => {
    timer = setTimeout(() => rejectPromise(new ProbeError("BLOCKED", `${label} timed out`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function toolCallCorrelationId(frame) {
  const candidates = [
    frame?.toolCallId,
    frame?.tool_call_id,
    frame?.toolExecutionId,
    frame?.tool_execution_id,
    frame?.callId,
    frame?.call_id,
    frame?.toolCall?.toolCallId,
    frame?.toolCall?.tool_call_id,
    frame?.tool_call?.toolCallId,
    frame?.tool_call?.tool_call_id,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim() !== "") ?? null;
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

function successfulReadEnd(event) {
  if (event?.type !== "tool_execution_end") return false;
  if (event.isError !== false || event.completed === false || event.failed === true || event.success === false) return false;
  return true;
}

function firstPathSequence(toolEvents, expectedPath, sourceRoot, executionRoot = sourceRoot, completion = false) {
  const expected = comparePath(expectedPath);
  let first = null;
  const starts = toolEvents.filter((event) =>
    event.type === "tool_execution_start"
    && /^read(?:$|[_.:])/i.test(event.tool ?? event.toolName ?? "")
    && typeof (event.toolCallId ?? event.tool_call_id) === "string",
  );
  for (const start of starts) {
    const callId = start.toolCallId ?? start.tool_call_id;
    const end = toolEvents.find((candidate) =>
      successfulReadEnd(candidate)
      && (candidate.toolCallId ?? candidate.tool_call_id) === callId
      && Number.isSafeInteger(candidate.sequence)
      && Number.isSafeInteger(start.sequence)
      && candidate.sequence > start.sequence
      && /^read(?:$|[_.:])/i.test(candidate.tool ?? candidate.toolName ?? ""),
    );
    if (!end) continue;
    for (const raw of [...(start.paths ?? []), ...(end.paths ?? [])]) {
      if (typeof raw !== "string" || raw === "") continue;
      const candidate = isAbsolute(raw) ? resolve(raw) : resolve(executionRoot, raw);
      if (comparePath(candidate) === expected) {
        const sequence = completion ? end.sequence : start.sequence;
        first = first === null ? sequence : Math.min(first, sequence);
        break;
      }
    }
  }
  return first;
}
class NativeRpcSession {
  constructor({ omp, cwd, timeoutMs, contexts, protocolConsumer }) {
    this.omp = omp;
    this.cwd = cwd;
    this.timeoutMs = timeoutMs;
    this.protocolConsumer = protocolConsumer;
    this.assignments = new Map(contexts.map((context, index) => [`T009C-${context.kind}-${index + 1}`, {
      agent: "deep-reviewer",
      protocol_mode: "DEEP_REVIEW",
      reviewed_revision: context.headRevision,
    }]));
    this.child = null;
    this.rawBuffer = Buffer.alloc(0);
    this.chunk = null;
    this.protocolVersion = 1;
    this.fatal = null;
    this.ready = makeDeferred();
    this.closed = makeDeferred();
    this.settled = makeDeferred();
    this.responses = new Map();
    this.promptResults = new Map();
    this.evidence = {
      argv: ["--mode", "rpc", "--no-ui", "--no-session", "--no-extensions", "--no-context-files", "--no-lsp", "--no-title"],
      tool_events: [],
      task_calls: [],
      task_records: [],
      expected_assignments: [...this.assignments].map(([id, expected]) => ({ id, ...expected })),
      subagent_frames: [],
      task_details: [],
      capture: { schema: "operational-envelope-v1", redact_before_store: true, complete: true, captured_bytes: 0, max_bytes: MAX_NATIVE_CAPTURE_BYTES },
      terminal: null,
      protocol: null,
      process: null,
    };
    this.eventSequence = 0;
  }

  start() {
    this.child = spawn(this.omp, this.evidence.argv, {
      cwd: this.cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.stdout.on("data", (data) => this.consumeBytes(Buffer.from(data)));
    this.child.stderr.on("data", () => {});
    this.child.on("error", (error) => this.abortWith(new ProbeError("BLOCKED", `OMP process error: ${scrubText(error.message)}`)));
    this.child.on("close", (code, signal) => {
      this.evidence.process = { exit_code: code, signal: signal ?? null };
      this.closed.resolve({ code, signal });
      if (!this.readyResolved) this.ready.reject(new ProbeError("BLOCKED", "OMP closed before ready"));
      for (const waiter of this.responses.values()) waiter.reject(new ProbeError("BLOCKED", "OMP closed before response"));
      for (const waiter of this.promptResults.values()) waiter.reject(new ProbeError("BLOCKED", "OMP closed before prompt result"));
      this.responses.clear();
      this.promptResults.clear();
    });
    return withTimeout(this.ready.promise, this.timeoutMs, "OMP ready");
  }

  abortWith(error) {
    if (!this.fatal) this.fatal = error;
    this.ready.reject(this.fatal);
    for (const waiter of this.responses.values()) waiter.reject(this.fatal);
    for (const waiter of this.promptResults.values()) waiter.reject(this.fatal);
    this.responses.clear();
    this.promptResults.clear();
    if (this.child && !this.child.killed) this.child.kill();
  }

  consumeBytes(data) {
    if (this.fatal) return;
    this.rawBuffer = Buffer.concat([this.rawBuffer, data]);
    while (true) {
      const newline = this.rawBuffer.indexOf(0x0a);
      if (newline < 0) {
        if (this.rawBuffer.byteLength > MAX_PHYSICAL_FRAME_BYTES) this.abortWith(new ProbeError("BLOCKED", "RPC frame exceeded physical limit"));
        return;
      }
      const line = this.rawBuffer.subarray(0, newline);
      this.rawBuffer = this.rawBuffer.subarray(newline + 1);
      if (line.byteLength + 1 > MAX_PHYSICAL_FRAME_BYTES) {
        this.abortWith(new ProbeError("BLOCKED", "RPC frame exceeded physical limit"));
        return;
      }
      const withoutCr = line.at(-1) === 0x0d ? line.subarray(0, line.length - 1) : line;
      if (withoutCr.length === 0) continue;
      let frame;
      try {
        frame = JSON.parse(DECODER.decode(withoutCr));
      } catch {
        this.abortWith(new ProbeError("BLOCKED", "RPC frame was not strict UTF-8 JSON"));
        return;
      }
      try {
        this.consumeFrame(frame);
      } catch (error) {
        this.abortWith(error instanceof ProbeError ? error : new ProbeError("BLOCKED", scrubText(error?.message)));
        return;
      }
      if (this.fatal) return;
    }
  }

  consumeFrame(frame) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) blocked("RPC frame must be an object");
    if (frame.type === "rpc_chunk") {
      if (this.protocolVersion !== 2) blocked("rpc_chunk received before protocol v2");
      const { chunkId, index, count, byteLength, data } = frame;
      if (typeof chunkId !== "string" || !Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(count) || count < 1 || index >= count || !Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_REASSEMBLED_FRAME_BYTES || typeof data !== "string") blocked("invalid rpc_chunk metadata");
      const decoded = Buffer.from(data, "base64");
      if (decoded.toString("base64") !== data) blocked("non-canonical rpc_chunk base64");
      if (!this.chunk) {
        if (index !== 0) blocked("rpc_chunk did not start at index zero");
        this.chunk = { chunkId, count, byteLength, next: 0, bytes: [], total: 0 };
      }
      if (this.chunk.chunkId !== chunkId || this.chunk.count !== count || this.chunk.byteLength !== byteLength || this.chunk.next !== index) blocked("rpc_chunk sequence was not ordered");
      this.chunk.bytes.push(decoded);
      this.chunk.total += decoded.byteLength;
      this.chunk.next += 1;
      if (this.chunk.total > MAX_REASSEMBLED_FRAME_BYTES || this.chunk.total > byteLength) blocked("rpc_chunk exceeded declared size");
      if (this.chunk.next === this.chunk.count) {
        if (this.chunk.total !== this.chunk.byteLength) blocked("rpc_chunk length mismatch");
        const bytes = Buffer.concat(this.chunk.bytes, this.chunk.total);
        this.chunk = null;
        const logical = JSON.parse(DECODER.decode(bytes));
        this.consumeLogical(logical);
      }
      return;
    }
    if (this.chunk) blocked("rpc_chunk was interrupted");
    this.consumeLogical(frame);
  }

  consumeLogical(frame) {
    if (frame.type === "ready") {
      this.readyResolved = true;
      this.ready.resolve(frame);
      return;
    }
    if (frame.type === "response") {
      const waiter = typeof frame.id === "string" ? this.responses.get(frame.id) : null;
      if (waiter) {
        this.responses.delete(frame.id);
        waiter.resolve(frame);
      }
      return;
    }
    if (frame.type === "prompt_result") {
      this.evidence.terminal = {
        ...(this.evidence.terminal ?? {}),
        prompt_result: {
          status: typeof frame.status === "string" ? frame.status : null,
          agentInvoked: frame.agentInvoked === true,
          sessionSettled: frame.sessionSettled === true,
        },
      };
      const waiter = typeof frame.id === "string" ? this.promptResults.get(frame.id) : null;
      if (waiter) {
        this.promptResults.delete(frame.id);
        waiter.resolve(frame);
      }
      return;
    }
    if (frame.type === "session_settled") {
      this.evidence.terminal = { ...(this.evidence.terminal ?? {}), session_settled: true };
      this.settled.resolve(frame);
      return;
    }
    if (frame.type === "tool_execution_start" || frame.type === "tool_execution_end") {
      this.recordTool(frame);
      return;
    }
    if (["subagent_lifecycle", "subagent_progress", "subagent_event"].includes(frame.type)) {
      this.recordSubagent(frame);
      return;
    }
    if (frame.type === "message_end" || frame.type === "agent_end") return;
    if (/login|auth|host|ui/i.test(String(frame.type ?? ""))) blocked("OMP requested an unauthorized boundary");
  }


  recordTool(frame) {
    const sequence = ++this.eventSequence;
    const directName = [frame.toolName, frame.tool_name, frame.tool, frame.name].find((value) => typeof value === "string" && value.trim() !== "");
    const name = directName ?? findFirst(frame, new Set(["toolName", "tool_name", "tool", "name"]));
    if (typeof name !== "string" || name.trim() === "") blocked("native tool event did not expose a tool name");
    const rawArgs = frame.arguments ?? frame.args ?? frame.input ?? frame.toolCall?.arguments ?? frame.tool_call?.arguments ?? frame.tool?.arguments ?? findObjectField(frame, new Set(["arguments", "args", "input"]));
    const observed = rawArgs && typeof rawArgs === "object" ? rawArgs : frame;
    const paths = collectStringsByKey(observed, new Set(["path", "file", "filename", "filePath", "file_path", "target"])).filter((value) => value.length < 2048);
    const toolCallId = toolCallCorrelationId(frame);
    const summary = {
      sequence,
      type: frame.type,
      tool: scrubText(name, 96),
      toolCallId,
      paths: [...new Set(paths.map((item) => scrubText(item, 1024)))].slice(0, 64),
    };
    if (frame.type === "tool_execution_end") {
      const resultValue = frame.result ?? frame.output ?? frame.error;
      const completed = trustedBooleanState([frame, resultValue], ["completed"]);
      const failed = trustedBooleanState([frame, resultValue], ["failed", "isError", "is_error"]);
      const success = trustedBooleanState([frame, resultValue], ["success"]);
      if (completed.present) summary.completed = completed.positive && !completed.negative && !completed.contradictory;
      if (failed.present) summary.failed = failed.positive || failed.contradictory;
      if (typeof frame.isError === "boolean") summary.isError = frame.isError;
      if (failed.positive || failed.contradictory) summary.isError = true;
      if (success.present) summary.success = success.positive && !success.negative && !success.contradictory;
      if (frame.error !== undefined) summary.failed = true;
    }
    this.evidence.tool_events.push(summary);
    if (FORBIDDEN_TOOL.test(name) || !ALLOWED_TOOL.test(name)) blocked("native caller used a forbidden or unapproved tool", { tool: scrubText(name) });
    if (/^tasks?(?:$|[_.:])/i.test(name) && frame.type === "tool_execution_start") {
      const forbiddenKey = hasForbiddenKey(observed);
      const items = Array.isArray(observed.tasks) ? observed.tasks : Array.isArray(observed.items) ? observed.items
        : nonEmpty(observed.agent) && nonEmpty(observed.task) ? [observed] : [];
      const call = {
        sequence,
        type: frame.type,
        kind: items.length > 0 ? "dispatch" : "control",
        item_count: items.length,
        has_forbidden_field: forbiddenKey !== null,
        forbidden_field: forbiddenKey,
        has_solution_space: items.length > 0 && items.every((item) => nonEmpty(item?.solutionSpace)),
        assignments: items.map((item) => ({
          id: item?.name ?? null,
          agent: item?.agent ?? null,
          assignment_sha256: typeof item?.task === "string" ? sha256Bytes(Buffer.from(item.task, "utf8")) : null,
          expected_revision_input: this.assignments.get(item?.name)?.reviewed_revision ?? null,
        })),
      };
      this.evidence.task_calls.push(call);
      if (call.kind === "dispatch" && forbiddenKey) blocked("native task wire contained a forbidden field", { key: forbiddenKey });
    }
    if (/^tasks?(?:$|[_.:])/i.test(name) && frame.type === "tool_execution_end") {
      for (const details of taskDetailsEnvelopes(frame.result ?? frame.output)) {
        this.captureOperational("task_details", {
          sequence,
          source_kind: "task_tool_details",
          results: Array.isArray(details.results) ? details.results.map(safeOperationalRecord) : [],
          progress: Array.isArray(details.progress) ? details.progress.map(safeOperationalRecord) : [],
          async: details.async === true,
        });
        for (const result of details.results ?? []) {
          if (isOperationalObject(result)) this.recordTerminal(result, result, "task_tool_details", frame.type);
        }
      }
    }
  }

  recordSubagent(frame) {
    const observed = subagentObservation(frame);
    this.captureOperational("subagent_frames", observed.capture);
    if (frame.type !== "subagent_progress" || !observed.progress) return;
    this.recordTerminal(observed.progress, {
      id: observed.identity,
      agent: observed.agent,
      agentSource: observed.agentSource,
      status: observed.status,
      exitCode: observed.progress.exitCode,
    }, "native_subagent_progress", frame.type);
  }

  captureOperational(collection, value) {
    const captured = safeValue(value);
    const bytes = Buffer.byteLength(JSON.stringify(captured), "utf8");
    if (this.evidence.capture.captured_bytes + bytes > MAX_NATIVE_CAPTURE_BYTES) {
      this.evidence.capture.complete = false;
      blocked("native operational capture exceeded its bounded retention limit");
    }
    this.evidence.capture.captured_bytes += bytes;
    this.evidence[collection].push(captured);
  }

  recordTerminal(raw, metadata, sourceKind, frameType) {
    const status = typeof metadata.status === "string" ? metadata.status.toLowerCase() : "";
    const hasObservedExitCode = Number.isInteger(metadata.exitCode);
    if (!TERMINAL_TASK_STATUSES.has(status) && !hasObservedExitCode) return;
    const expected = this.assignments.get(metadata.id);
    const structured = rawStructuredReview(raw);
    const data = structured.data;
    let normalizedData = data;
    let validation = null;
    if (expected && data !== undefined) {
      const checked = this.protocolConsumer.validateReviewerResult(data, expected);
      validation = { ok: checked.ok === true, errors: checked.errors ?? [] };
      if (checked.ok === true) normalizedData = checked.value;
    }
    const record = {
      id: metadata.id ?? null,
      source_kind: sourceKind,
      frame_type: frameType,
      agent: metadata.agent ?? null,
      agentSource: metadata.agentSource ?? null,
      status: metadata.status ?? null,
      exitCode: hasObservedExitCode ? metadata.exitCode : null,
      exit_code_observed: hasObservedExitCode,
      reviewedRevision: isOperationalObject(normalizedData) ? normalizedData.reviewed_revision ?? null : null,
      protocolMode: isOperationalObject(normalizedData) ? normalizedData.protocol_mode ?? null : null,
      structured: data !== undefined,
      structured_source: structured.source,
      data_sha256: data !== undefined ? sha256Bytes(Buffer.from(JSON.stringify(data), "utf8")) : null,
      data: normalizedData !== undefined ? publicReviewData(normalizedData) : null,
      consumer_validation: validation,
    };
    const identity = JSON.stringify(record);
    if (!this.evidence.task_records.some((item) => JSON.stringify(item) === identity)) this.evidence.task_records.push(record);
  }

  send(command) {
    if (!this.child || this.child.killed) blocked("cannot write RPC after process termination");
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  request(command, label) {
    const waiter = makeDeferred();
    this.responses.set(command.id, waiter);
    this.send(command);
    return withTimeout(waiter.promise, this.timeoutMs, label);
  }

  async configure() {
    const negotiation = await this.request({ id: randomUUID(), type: "negotiate_protocol", protocolVersion: 2 }, "protocol negotiation");
    if (negotiation.success === true) {
      this.protocolVersion = 2;
      this.evidence.protocol = { version: 2, negotiated: true };
    } else {
      this.protocolVersion = 1;
      this.evidence.protocol = { version: 1, negotiated: false };
    }
    const filter = await this.request({ id: randomUUID(), type: "set_event_filter", events: RPC_EVENTS, messageUpdates: "full" }, "event filter");
    if (filter.success !== true) blocked("native event filter was rejected");
    const subscription = await this.request({ id: randomUUID(), type: "set_subagent_subscription", level: "events" }, "subagent subscription");
    if (subscription.success !== true) blocked("native subagent event subscription was rejected");
  }

  async execute(prompt) {
    await this.start();
    await this.configure();
    const id = randomUUID();
    const resultPromise = (() => {
      const waiter = makeDeferred();
      this.promptResults.set(id, waiter);
      return withTimeout(waiter.promise, this.timeoutMs, "prompt result");
    })();
    const acknowledgement = this.request({
      id,
      type: "prompt",
      request_id: randomUUID(),
      run_id: randomUUID(),
      message: prompt,
    }, "prompt acknowledgement");
    const acknowledged = await acknowledgement;
    if (acknowledged.success !== true) blocked("native prompt was not admitted");
    const result = await resultPromise;
    if (result.status !== "completed" || result.agentInvoked !== true) blocked("native prompt did not complete a root-model turn");
    await withTimeout(this.settled.promise, this.timeoutMs, "session settled");
    await this.close();
    return this.evidence;
  }

  async close() {
    if (!this.child || this.stdinEnded) return;
    this.stdinEnded = true;
    this.child.stdin.end();
    const closed = await withTimeout(this.closed.promise, 30_000, "OMP process drain");
    if (closed.code !== 0) blocked("OMP exited unsuccessfully", { code: closed.code });
  }

  async abort() {
    if (!this.child || this.child.killed) return;
    try {
      if (!this.stdinEnded) this.send({ id: randomUUID(), type: "abort" });
    } catch {
      // Process may already be unrecoverable; the bounded kill below is final.
    }
    if (!this.stdinEnded) {
      this.stdinEnded = true;
      this.child.stdin.end();
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    if (!this.child.killed) this.child.kill();
  }
}

function nativePrompt(contexts, sourceRoot) {
  const tasks = contexts.map((context, index) => ({
    name: `T009C-${context.kind}-${index + 1}`,
    agent: "deep-reviewer",
    task: [
      "Read-only native caller probe for AC-014; do not invent a patch, workspace, SHA, or review result.",
      `Before dispatching this assignment, read the current Fase-0 documentation sources from ${sourceRoot}: ${REVIEW_DOCUMENTATION_PATHS.join(", ")}. Documentation analysis must precede any implementation/review task.`,
      `The ROOT session (not a delegated task) MUST read every bound source byte before any task fanout: ${[context.diff.absolutePath, ...context.files.map((file) => file.absolutePath), ...context.deletions.map((file) => file.absolutePath)].join(", ")}. Do not dispatch until each changed, pertinent consumer, diff, and deletion-base path has an observed root read.`,
      `Read the exact context descriptor at ${context.descriptorPath}.`,
      ...(context.receipt ? [`Read the actual source provenance receipt at ${context.receipt.absolutePath} before trusting revision metadata.`] : []),
      "Use only read, grep, glob, wait, todo (runtime planning), and the dynamically exposed task tool. Do not run bash, Git, network, host, write, edit, settings, auth, or nested task operations.",
      `protocol_mode: DEEP_REVIEW\nreviewed_revision: ${context.headRevision}\nReturn the real deep-reviewer incremental yields, then a terminal public result with agent, protocol_mode, status VALID, reviewed_revision, overall_correctness, explanation, confidence, and findings based only on observed bytes. Do not dispatch nested tasks and do not expose prompts, credentials, or hidden reasoning.`,
      context.kind === "pr-uri"
        ? "PR source is remote content pinned to one actual head SHA; do not substitute the current workspace and do not use a different revision for a deletion's base content."
        : "Branch/base source has explicit base/head refs and revisions; local_revision_context.revision must equal head_revision and cross-file consumers must be read from the bound fixture.",
    ].join("\n"),
    solutionSpace: "Read-only review; no file, Git, network, host, authentication, or settings mutation is authorized.",
  }));
  return [
    "Execute one authentic native OMP caller probe for the supplied review contexts.",
    `Read the current Fase-0 documentation sources before any task dispatch: ${REVIEW_DOCUMENTATION_PATHS.map((relativePath) => resolve(sourceRoot, relativePath)).join(", ")}`,
    `The ROOT session MUST read every descriptor, provenance receipt, diff, changed file, pertinent consumer, and deletion-base file before fanout; observed root-read paths: ${contexts.flatMap((context) => [context.descriptorPath, ...(context.receipt ? [context.receipt.absolutePath] : []), context.diff.absolutePath, ...context.files.map((file) => file.absolutePath), ...context.deletions.map((file) => file.absolutePath)]).join(", ")}`,
    "The JSON descriptors and source bytes are the only evidence inputs. Their hashes are independently computed by the caller outside the model; do not copy expected terminal records or table-top outputs.",
    "If the task tool exposes batch, dispatch exactly one {context,tasks[]} call containing all listed assignments. If it exposes only flat task calls, dispatch one equivalent call per assignment. Do not add model, thinkingLevel, structured, outputSchema, schemaMode, isolated, tools, settings, provider, alias, or global fields.",
    "Use the actual named assignments below. A background task acknowledgement or root task_end is not a terminal review. Wait for both named tasks to complete and preserve their native progress typed yields and terminal structured payloads.",
    JSON.stringify({ context: "AC-014 source-context probe; inspect the exact descriptor paths above; wait for all real terminal results.", tasks }, null, 2),
  ].join("\n\n");
}

function absoluteObservedPaths(boundContexts, sourceRoot) {
  const output = REVIEW_DOCUMENTATION_PATHS.map((relativePath) => resolve(sourceRoot, relativePath));
  for (const context of boundContexts) {
    output.push(context.descriptorPath, context.diff.absolutePath);
    if (context.receipt) output.push(context.receipt.absolutePath);
    for (const file of [...context.files, ...context.deletions]) output.push(file.absolutePath);
  }
  return new Set(output.map((path) => comparePath(path)));
}



function inspectNativeEvidence(evidence, contexts, sourceRoot, executionRoot) {
  const failures = [];
  if (!evidence || !Array.isArray(evidence.tool_events) || evidence.tool_events.length === 0) return ["no native tool events observed"];
  if (evidence.capture?.complete !== true) failures.push("native operational envelope retention was incomplete");
  const dispatches = (evidence.task_calls ?? []).filter((call) => call.kind === "dispatch" && call.type === "tool_execution_start");
  const firstTaskSequence = dispatches.map((call) => call.sequence).filter(Number.isSafeInteger).sort((left, right) => left - right)[0] ?? null;
  if (firstTaskSequence === null) failures.push("native task dispatch was not observed");
  for (const expectedPath of absoluteObservedPaths(contexts, sourceRoot)) {
    const sequence = firstPathSequence(evidence.tool_events, expectedPath, sourceRoot, executionRoot, true);
    if (sequence === null) failures.push(`native root read evidence missing ${expectedPath}`);
    else if (firstTaskSequence !== null && sequence >= firstTaskSequence) failures.push(`native root source read occurred after task dispatch: ${expectedPath}`);
  }
  for (const call of dispatches) {
    if (call.has_forbidden_field) failures.push("native task dispatch contained forbidden per-call/global fields");
    if (!call.has_solution_space) failures.push("native task dispatch omitted required solutionSpace");
  }
  const records = evidence.task_records ?? [];
  for (const [index, context] of contexts.entries()) {
    const id = `T009C-${context.kind}-${index + 1}`;
    if (!context.receipt) failures.push(`${context.kind} native context lacks an independently hashed source receipt`);
    const dispatched = dispatches.flatMap((call) => call.assignments ?? []).filter((item) => item.id === id);
    if (dispatched.length !== 1 || dispatched[0].agent !== "deep-reviewer" || !SHA256.test(dispatched[0].assignment_sha256 ?? "")) {
      failures.push(`${id} has no unique actual task-call assignment binding`);
    }
    const matching = records.filter((record) => record.id === id && ["native_subagent_progress", "task_tool_details"].includes(record.source_kind));
    const nativeProgress = matching.filter((record) => record.source_kind === "native_subagent_progress");
    const terminals = nativeProgress.length > 0 ? nativeProgress : matching;
    if (terminals.length !== 1) {
      failures.push(`${context.kind} has no unique genuine terminal review envelope (${terminals.length} observed)`);
      continue;
    }
    const record = terminals[0];
    if (record.agent !== "deep-reviewer" || record.agentSource !== "project") failures.push(`${id} terminal profile identity/source was not proven`);
    if (record.exit_code_observed ? record.exitCode !== 0 : !SUCCESS_TASK_STATUSES.has(String(record.status).toLowerCase())) failures.push(`${id} terminal did not complete successfully`);
    if (!record.structured || record.reviewedRevision !== context.headRevision || record.protocolMode !== "DEEP_REVIEW") failures.push(`${id} terminal was not structured DEEP_REVIEW at the independently pinned revision`);
    if (record.consumer_validation?.ok !== true) failures.push(`${id} terminal was rejected or unavailable to the actual validateReviewerResult consumer`);
  }
  if (!evidence.terminal?.prompt_result || evidence.terminal.prompt_result.status !== "completed") failures.push("native prompt terminal was not observed");
  if (evidence.terminal?.prompt_result?.agentInvoked !== true) failures.push("native root agent invocation was not observed");
  if (evidence.terminal?.session_settled !== true) failures.push("native session settlement was not observed");
  return failures;
}

function remoteCommands(prRef) {
  if (!prRef) {
    return [
      "gh api repos/<owner>/<repo>/pulls/<number> --jq '{number,state,head_sha:.head.sha,base_sha:.base.sha,head_ref:.head.ref,base_ref:.base.ref}'",
      "gh api \"repos/<owner>/<repo>/compare/<base_sha>...<head_sha>\" --jq '{status,base_commit:.base_commit.sha,merge_base_commit:.merge_base_commit.sha,files:[.files[]|{filename,status,patch,sha}]}'",
      "gh api \"repos/<owner>/<repo>/contents/<path>?ref=<head_sha>\" --jq '{path,sha,encoding,content}'",
      "gh api \"repos/<owner>/<repo>/contents/<deleted_path>?ref=<base_sha>\" --jq '{path,sha,encoding,content}'",
    ];
  }
  const match = /^([^/]+\/[^#]+)#([1-9]\d*)$/.exec(prRef);
  if (!match) return ["Provide --pr-ref as owner/repo#number; no remote command was run."];
  const repo = match[1];
  const number = match[2];
  return [
    `gh api repos/${repo}/pulls/${number} --jq '{number,state,head_sha:.head.sha,base_sha:.base.sha,head_ref:.head.ref,base_ref:.base.ref}'`,
    `gh api "repos/${repo}/compare/<base_sha>...<head_sha>" --jq '{status,base_commit:.base_commit.sha,merge_base_commit:.merge_base_commit.sha,files:[.files[]|{filename,status,patch,sha}]}'`,
    `gh api "repos/${repo}/contents/<path>?ref=<head_sha>" --jq '{path,sha,encoding,content}'`,
    `gh api "repos/${repo}/contents/<deleted_path>?ref=<base_sha>" --jq '{path,sha,encoding,content}'`,
    `read pr://${repo}/${number}/diff/all?state=closed only if an existing public closed PR is the approved source; no new PR state is created`,
  ];
}

function captureFingerprint(sourceRoot, binaryPath = null) {
  const source = [];
  for (const relativePath of [...REVIEW_DOCUMENTATION_PATHS, "tdd-orchestrator/references/model-policy.md", "deep-review/lib/protocol.mjs", "tdd-orchestrator/lib/state.mjs"]) {
    const path = resolve(sourceRoot, relativePath);
    assertNoSymlink(sourceRoot, path, `source ${relativePath}`);
    const bytes = readFileSync(path);
    source.push({ path: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
  }
  let binary = null;
  if (binaryPath) {
    const path = existingRegularFile("--omp", binaryPath);
    const bytes = readFileSync(path);
    binary = { path, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
  }
  return { source, binary };
}

function compareFingerprint(before, after) {
  const changed = [];
  for (const entry of before.source) {
    const current = after.source.find((item) => item.path === entry.path);
    if (!current || current.bytes !== entry.bytes || current.sha256 !== entry.sha256) changed.push(entry.path);
  }
  const binaryChanged = before.binary && after.binary
    && (before.binary.bytes !== after.binary.bytes || before.binary.sha256 !== after.binary.sha256);
  return { sourceChanged: changed, binaryChanged: binaryChanged === true };
}

function parsePrRef(value) {
  if (value === null || value === undefined) return null;
  if (!/^([^/]+\/[^#]+)#([1-9]\d*)$/.test(value)) fail("USAGE", "--pr-ref must use owner/repo#number");
  return value;
}

function parseArgs(argv) {
  const values = {};
  let native = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail("USAGE", `unexpected argument: ${token}`);
    const name = token.slice(2);
    if (name === "native") {
      native = true;
      continue;
    }
    const allowed = new Set(["omp", "source", "lab", "phase", "timeout-ms", "branch-context", "pr-context", "pr-ref"]);
    if (!allowed.has(name)) fail("USAGE", `unsupported option: --${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("USAGE", `missing value for --${name}`);
    values[name] = value;
    index += 1;
  }
  for (const required of ["source", "lab", "phase"]) if (!values[required]) fail("USAGE", `required option missing: --${required}`);
  if (!["red", "green"].includes(values.phase)) fail("USAGE", "--phase must be red or green");
  const timeoutMs = values["timeout-ms"] === undefined ? DEFAULT_TIMEOUT_MS : Number(values["timeout-ms"]);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > DEFAULT_TIMEOUT_MS) fail("USAGE", "--timeout-ms must be an integer from 30000 through 900000");
  if (native && !values.omp) fail("USAGE", "--native requires --omp");
  return {
    source: values.source,
    lab: values.lab,
    phase: values.phase,
    timeoutMs,
    omp: values.omp ?? null,
    native,
    branchContext: values["branch-context"] ?? null,
    prContext: values["pr-context"] ?? null,
    prRef: parsePrRef(values["pr-ref"] ?? null),
  };
}

async function loadApi(sourceRoot, relativePath, label) {
  const path = existingRegularFile(label, resolve(sourceRoot, relativePath));
  try {
    return await import(`${pathToFileURL(path).href}?t009c=${randomUUID()}`);
  } catch (error) {
    blocked(`${label} could not be loaded`, { detail: scrubText(error?.message) });
  }
}

function prerequisiteCase(label, reason, commands = []) {
  return {
    label,
    status: "BLOCKED",
    expected: "real prerequisite",
    observed: { reason },
    details: { evidence_level: "not-run", commands_not_run: commands },
  };
}

async function runNative(options, contexts, protocolConsumer) {
  if (contexts.length === 0) return { status: "BLOCKED", evidence_level: "not-run", probe_refs: NATIVE_PROBE_REFS, limitations: ["no revision-bound context was available; native dispatch was not attempted"] };
  const executionContext = contexts.find((context) => context.kind === "branch-base");
  if (!executionContext) return { status: "BLOCKED", evidence_level: "not-run", probe_refs: NATIVE_PROBE_REFS, limitations: ["no existing branch fixture workspace with project .omp overlay was supplied; PR-only native dispatch was not attempted"] };
  const session = new NativeRpcSession({ omp: existingRegularFile("--omp", options.omp), cwd: executionContext.root, timeoutMs: options.timeoutMs, contexts, protocolConsumer });
  try {
    const evidence = await session.execute(nativePrompt(contexts, options.source));
    const failures = inspectNativeEvidence(evidence, contexts, options.source, executionContext.root);
    return {
      status: failures.length === 0 ? "PASS" : "BLOCKED",
      evidence_level: "native",
      execution_cwd: executionContext.root,
      probe_refs: NATIVE_PROBE_REFS,
      failures,
      observed: evidence,
    };
  } catch (error) {
    await session.abort();
    return { status: "BLOCKED", evidence_level: "native", execution_cwd: executionContext.root, probe_refs: NATIVE_PROBE_REFS, failure: safeError(error), observed: session.evidence };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = existingDirectory("--source", options.source);
  const lab = existingDirectory("--lab", options.lab);
  if (samePath(source, lab) || isInside(source, lab) || isInside(lab, source)) blocked("--lab and --source must be disjoint");
  const runId = randomUUID();
  if (!UUID_V4.test(runId)) blocked("driver run_id is not UUID-v4");
  const runRoot = join(lab, `ship-native-review-context-${runId}`);
  if (existsSync(runRoot)) blocked("run root unexpectedly exists");
  mkdirSync(runRoot);
  const before = captureFingerprint(source, options.native ? options.omp : null);
  const protocol = await loadApi(source, "deep-review/lib/protocol.mjs", "deep-review protocol consumer");
  const state = await loadApi(source, "tdd-orchestrator/lib/state.mjs", "TDD state consumer");
  const evidence = {
    task: "T009C",
    acceptance_criteria: ["AC-014"],
    contract: "0.5.0",
    phase: options.phase,
    run_id: runId,
    started_at: now(),
    source_root: source,
    source_before: before,
    source_after: null,
    binary_before: before.binary,
    binary_after: null,
    branch_context: null,
    pr_context: null,
    consumer_cases: [],
    state_cases: [],
    native: null,
    prerequisites: [],
    commands_not_run: remoteCommands(options.prRef),
    failure: null,
  };
  let finalStatus = "BLOCKED";
  let contextResults = [];
  try {
    if (options.branchContext) {
      try {
        const branch = loadContext(options.branchContext, "branch", { lab, source });
        evidence.branch_context = summarizeBound(branch);
        contextResults.push(branch);
        evidence.consumer_cases.push(...protocolCases(protocol, branch), ...sourceBindingCases(branch, { lab, source }));
      } catch (error) {
        evidence.branch_context = { status: "BLOCKED", failure: safeError(error) };
        evidence.prerequisites.push(prerequisiteCase("branch-context-invalid", `Supplied branch descriptor was rejected: ${scrubText(error?.message)}`, []));
      }
    } else {
      evidence.prerequisites.push(prerequisiteCase("branch-context-missing", "Main must provide an existing lab fixture descriptor with base/head refs, actual diff bytes, complete changed/consumer file hashes, and an independently hashed Git provenance receipt; this driver will not create branches or synthesize a workspace.", []));
    }
    if (options.prContext) {
      try {
        const pr = loadContext(options.prContext, "pr", { lab, source });
        if (options.prRef && `${pr.repository}#${pr.pullRequest}` !== options.prRef) blocked("--pr-ref does not match the supplied PR descriptor");
        evidence.pr_context = summarizeBound(pr);
        contextResults.push(pr);
        evidence.consumer_cases.push(...protocolCases(protocol, pr), ...sourceBindingCases(pr, { lab, source }));
      } catch (error) {
        evidence.pr_context = { status: "BLOCKED", failure: safeError(error) };
        evidence.prerequisites.push(prerequisiteCase("remote-pr-context-invalid", `Supplied PR descriptor was rejected: ${scrubText(error?.message)}`, []));
      }
    } else {
      evidence.prerequisites.push(prerequisiteCase("remote-pr-context-missing", "No actual remote PR head metadata, same-SHA patch, complete head files, base content for deletions, or independently hashed GitHub API receipt was supplied; no PR payload was invented and no network request was made.", remoteCommands(options.prRef)));
    }
    evidence.state_cases = stateCases(state);
    if (options.native) {
      evidence.native = await runNative(options, contextResults, protocol);
    } else {
      evidence.native = {
        status: "BLOCKED",
        evidence_level: "not-run",
        limitations: ["--native was not supplied; fixture/tabletop evidence cannot close NATIVE-07/08"],
      };
    }
    const allCases = [...evidence.consumer_cases, ...evidence.state_cases];
    const unexpected = allCases.filter((item) => item.status === "FAIL");
    const missingProofCases = allCases.filter((item) => item.status === "BLOCKED");
    const missingPrereq = evidence.prerequisites.length > 0 || missingProofCases.length > 0 || evidence.native.status !== "PASS";
    if (unexpected.length > 0) {
      finalStatus = options.phase === "red" && unexpected.every((item) => item.details?.expected_error_family || item.expected === "refused") ? "RED_VALID" : "FAIL";
    } else if (missingPrereq) {
      finalStatus = "BLOCKED";
    } else {
      finalStatus = options.phase === "red" ? "FALHOU_NO_RED" : "PASS";
    }
    evidence.assertions = {
      ac_014: {
        branch_base: evidence.branch_context?.evidence_level === "local-git-receipt" && evidence.consumer_cases.some((item) => item.label === "branch-base.protocol-positive" && item.status === "PASS"),
        remote_pr: evidence.pr_context?.evidence_level === "remote-api-receipt" && evidence.consumer_cases.some((item) => item.label === "pr-uri.protocol-positive" && item.status === "PASS"),
        phase_lifecycle: evidence.state_cases.every((item) => item.status === "PASS"),
        native_terminal: evidence.native.status === "PASS",
      },
      evidence_levels: {
        fixture_consumer: "actual imported protocol/state consumers over lab-bound bytes and refusal controls; never Native PASS",
        local_git_receipt: "fixture Git refs/diff/files plus independently hashed local receipt",
        remote_api_receipt: "remote API metadata/patch/files plus independently hashed receipt; still requires native OMP for NATIVE PASS",
        native: evidence.native.status === "PASS" ? "actual OMP RPC tool/task/terminal observations plus independently computed hashes" : "not proven",
        tabletop: "never accepted as PASS",
      },
      no_source_wording_match_oracle: true,
      no_background_ack_terminal_claim: true,
    };
  } catch (error) {
    evidence.failure = safeError(error);
    finalStatus = error instanceof ProbeError && error.code === "ASSERTION" && options.phase === "red" && error.expectedRed ? "RED_VALID" : "BLOCKED";
  } finally {
    try {
      const after = captureFingerprint(source, options.native ? options.omp : null);
      evidence.source_after = after.source;
      evidence.binary_after = after.binary;
      const preservation = compareFingerprint(before, after);
      evidence.preservation = preservation;
      if (preservation.sourceChanged.length > 0 || preservation.binaryChanged) {
        evidence.failure = { code: "E_PRESERVATION", detail: "source or OMP binary changed during bounded probe", preservation };
        finalStatus = "BLOCKED";
      }
    } catch (error) {
      evidence.failure = { code: "E_PRESERVATION", detail: scrubText(error?.message ?? error) };
      finalStatus = "BLOCKED";
    }
    evidence.finished_at = now();
  }
  evidence.status = finalStatus;
  const evidencePath = join(runRoot, "evidence.json");
  const temporary = join(runRoot, `.evidence-${runId}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(safeValue(evidence), null, 2)}\n`, "utf8");
  renameSync(temporary, evidencePath);
  process.stdout.write(`${JSON.stringify({ status: finalStatus, phase: options.phase, run_id: runId, evidence: evidencePath, commands_not_run: evidence.commands_not_run })}\n`);
  process.exitCode = finalStatus === "PASS" ? 0 : finalStatus === "PENDING_NATIVE" ? 2 : 1;
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  await main().catch((error) => {
    const result = { status: error?.code === "USAGE" ? "USAGE" : "BLOCKED", detail: scrubText(error?.message ?? error), error: safeError(error) };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = error?.code === "USAGE" ? 64 : 2;
  });
}

export {
  bindBranchDescriptor,
  bindPrDescriptor,
  makeStateFixture,
  protocolCases,
  sourceBindingCases,
  stateCases,
  assembleNativeReview,
  rawStructuredReview,
  subagentObservation,
  inspectNativeEvidence,
};
