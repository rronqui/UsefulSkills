#!/usr/bin/env node
//
// Development-only NATIVE-09 technical-retry evidence module.
//
// This module prepares a private application from the immutable ORIGINAL191
// audit snapshot.  It never launches OMP.  NativeLifecycleCompletion owns the
// RPC/session/guard/capture path and consumes the concrete definition returned
// here.  The offline entry point runs only the copied application and the
// trusted validator so that its result remains explicitly non-native.
//

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT_VERSION = "0.6.0";
const ORIGINAL_AUDIT_DIGEST = "3f5d0ad989f1eaf2367e7f543d411b907bda83c572e8cd6b6c6b185dd460c990";
const ORIGINAL_FILE_COUNT = 191;
const ORIGINAL_SUBJECTS = Object.freeze({
  cli: {
    source: "tdd-orchestrator/bin/quality.mjs",
    target: "bin/quality.mjs",
    project_target: "app/bin/quality.mjs",
    size: 1680,
    sha256: "ebbbfefe1151ead535d483e5dfc89d71dcec1d2856e48bd31ae5b15d825b5825",
  },
  dependency: {
    source: "tdd-orchestrator/lib/quality.mjs",
    target: "lib/quality.mjs",
    project_target: "app/lib/quality.mjs",
    size: 34169,
    sha256: "0ee69f1d09bb1690ac549e99e7cd0fe7dd79f8690711d1baa4566423340e824e",
  },
});
const SCENARIO_ID = "NATIVE09-TECHNICAL-RETRY-QUALITY-CLI";
const DEFAULT_ASSIGNMENT_ID = "NATIVE09-technical-retry";
const VALIDATOR_RELATIVE = "app/.omp/state/native-tooling/retry-check.mjs";
const INTERFACE_CONTRACT_RELATIVE = "app/.omp/state/native-tooling/interface-contract.json";
const COMMAND = `node ${VALIDATOR_RELATIVE}`;
const FAILURE_EXIT_CODE = 17;
const MAX_CHILD_OUTPUT = 1024 * 1024;
const EMPTY_INVENTORY_DIGEST = "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";
const SHA256 = /^[a-f0-9]{64}$/i;
const FAILURE_STATUSES = new Set(["FAIL", "FAILED", "FALHOU", "ERROR", "ERRO"]);
const SUCCESS_STATUSES = new Set(["PASS", "PASSOU"]);
const INLINE_SUCCESS_STATUSES = new Set(["completed", "complete", "success", "succeeded"]);
const ELIGIBLE_FAILURE_ORIGINS = new Set(["SOLUTION", "BEHAVIOR"]);
const CAUSAL_PROVENANCE = "lifecycle-host-adapter-v1";
const CAUSAL_PHASES = Object.freeze(["first_terminal_accepted", "repair_accepted", "second_dispatch", "second_terminal_accepted", "execution_consumed"]);
const FORBIDDEN_WRITE_SEGMENTS = new Set(["..", ".", ""]);

class ScenarioError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "TechnicalRetryScenarioError";
    this.kind = kind;
    Object.assign(this, details);
  }
}

function blocked(message, details = {}) {
  throw new ScenarioError("BLOCKED", message, details);
}


function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value ?? ""), "utf8"));
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function digest(value) {
  return sha256Text(canonical(value));
}

function scrub(value, limit = 512) {
  return String(value ?? "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "<redacted-thinking>")
    .replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, "<redacted-analysis>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential|authorization|cookie))\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>")
    .slice(0, limit);
}

function safeError(error) {
  const raw = typeof error === "string" ? error : error?.message ?? error;
  return {
    type: typeof error,
    message_sha256: sha256Text(raw),
    message_bytes: Buffer.byteLength(String(raw ?? ""), "utf8"),
    kind: typeof error?.kind === "string" ? error.kind : null,
  };
}

function safeValue(value, depth = 0, key = "") {
  if (/auth|token|secret|password|credential|private[_-]?key|system[_-]?prompt|reasoning|chain[_-]?of[_-]?thought/i.test(key)) return "<redacted>";
  if (depth > 8) return "<depth-limited>";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return scrub(value, 2048);
  if (Array.isArray(value)) return value.slice(0, 64).map((item) => safeValue(item, depth + 1, key));
  if (value && typeof value === "object") {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 96)) output[childKey] = safeValue(childValue, depth + 1, childKey);
    return output;
  }
  return String(value);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") blocked(`${label} must be a non-empty string`);
  return value.trim();
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) blocked(`${label} must be a SHA-256 hex string`);
  return value.toLowerCase();
}

function canonicalRetryTask(definition, roleKey, taskText, solutionSpace) {
  const role = definition.roles?.[roleKey];
  if (!role || typeof role !== "object") blocked(`technical retry role ${roleKey} is missing`);
  const name = requireNonEmptyString(role.name, `technical retry role ${roleKey}.name`);
  const agent = requireNonEmptyString(role.role, `technical retry role ${roleKey}.role`);
  return Object.freeze({ name, agent, task: requireNonEmptyString(taskText, `${roleKey} task`), solutionSpace: requireNonEmptyString(solutionSpace, `${roleKey} solutionSpace`) });
}

function renderRetryRootPrompt(context, task) {
  return `${context}\n\n${JSON.stringify({ context, tasks: [task] }, null, 2)}`;
}

function normalizeRelative(value, label) {
  const raw = requireNonEmptyString(value, label).replaceAll("\\", "/");
  if (raw.startsWith("/") || /^[A-Za-z]:\//.test(raw)) blocked(`${label} must be relative`, { value: raw });
  const parts = raw.split("/");
  if (parts.some((part) => FORBIDDEN_WRITE_SEGMENTS.has(part))) blocked(`${label} contains traversal`, { value: raw });
  return parts.join("/");
}

function slash(value) {
  return String(value).replaceAll("\\", "/");
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function inside(root, child) {
  const parent = path.resolve(root).toLowerCase();
  const candidate = path.resolve(child).toLowerCase();
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function assertDirectory(file, label) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    blocked(`${label} is not readable`, { error: safeError(error), path: file });
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) blocked(`${label} must be a regular directory`, { path: file });
  return path.resolve(file);
}

function assertRegularFile(file, label) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    blocked(`${label} is not readable`, { error: safeError(error), path: file });
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) blocked(`${label} must be a private regular file`, { path: file, nlink: stat.nlink });
  return path.resolve(file);
}

function assertNoSymlinkPath(root, target, label, { allowMissingLeaf = false } = {}) {
  const resolvedRoot = assertDirectory(root, `${label} root`);
  const resolvedTarget = path.resolve(target);
  if (!inside(resolvedRoot, resolvedTarget)) blocked(`${label} escaped its root`, { root: resolvedRoot, path: resolvedTarget });
  const relative = path.relative(resolvedRoot, resolvedTarget);
  let current = resolvedRoot;
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (allowMissingLeaf && current === resolvedTarget && error?.code === "ENOENT") return resolvedTarget;
      blocked(`${label} path is missing`, { path: current, error: safeError(error) });
    }
    if (stat.isSymbolicLink()) blocked(`${label} path contains a symlink`, { path: current });
  }
  return resolvedTarget;
}

function ensureFreshDirectory(root, relative, label) {
  const normalized = normalizeRelative(relative, label);
  const segments = normalized.split("/");
  let current = assertDirectory(root, `${label} parent`);
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) blocked(`${label} ancestor is not a regular directory`, { path: current });
    } catch (error) {
      if (error?.code !== "ENOENT") blocked(`${label} ancestor could not be inspected`, { path: current, error: safeError(error) });
      fs.mkdirSync(current);
    }
  }
  return current;
}

function writeNewFile(file, bytes, label) {
  const target = path.resolve(file);
  try {
    const fd = fs.openSync(target, "wx", 0o600);
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    blocked(`${label} could not be created without replacement`, { path: target, error: safeError(error) });
  }
  return assertRegularFile(target, label);
}

function readJsonFile(file, label) {
  const target = assertRegularFile(file, label);
  try {
    return { value: JSON.parse(fs.readFileSync(target, "utf8")), path: target };
  } catch (error) {
    blocked(`${label} is not valid JSON`, { path: target, error: safeError(error) });
  }
}

function manifestInput(value) {
  if (typeof value === "string") return readJsonFile(value, "original audit manifest");
  if (!value || typeof value !== "object" || Array.isArray(value)) blocked("originalAuditManifest must be a path or manifest object");
  if (value.manifest && typeof value.manifest === "object" && !Array.isArray(value.manifest)) {
    return { value: structuredClone(value.manifest), path: typeof value.path === "string" ? path.resolve(value.path) : null };
  }
  return { value: structuredClone(value), path: null };
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) blocked("original audit manifest root must be an object");
  if (manifest.digest !== ORIGINAL_AUDIT_DIGEST) blocked("original audit manifest digest does not match ORIGINAL191", { observed: manifest.digest ?? null, expected: ORIGINAL_AUDIT_DIGEST });
  if (!Array.isArray(manifest.files) || manifest.files.length !== ORIGINAL_FILE_COUNT) blocked("original audit manifest must contain exactly 191 files", { observed: manifest.files?.length ?? null });
  const entries = new Map();
  for (const raw of manifest.files) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) blocked("original audit manifest contains a malformed file entry");
    const relativePath = normalizeRelative(raw.path, "original audit manifest file path");
    if (entries.has(relativePath)) blocked("original audit manifest contains a duplicate path", { path: relativePath });
    const size = Number(raw.size);
    if (!Number.isSafeInteger(size) || size < 0) blocked("original audit manifest file size is invalid", { path: relativePath });
    const sha256 = requireSha256(raw.sha256, `original audit manifest hash for ${relativePath}`);
    if (raw.nlink !== undefined && raw.nlink !== 1) blocked("original audit manifest file nlink is not one", { path: relativePath, nlink: raw.nlink });
    entries.set(relativePath, { path: relativePath, size, lines: raw.lines ?? null, sha256 });
  }
  return entries;
}

function verifyOriginalSource(snapshotRoot, manifestEntries, verifiedPaths = Object.values(ORIGINAL_SUBJECTS).map((subject) => subject.source)) {
  const root = assertDirectory(snapshotRoot, "original snapshot root");
  const bindings = [];
  for (const rawPath of verifiedPaths) {
    const relativePath = normalizeRelative(rawPath, "verified original source path");
    const expected = manifestEntries.get(relativePath);
    if (!expected) blocked("verified original source path is absent from the audit manifest", { path: relativePath });
    const absolute = path.join(root, ...relativePath.split("/"));
    assertNoSymlinkPath(root, absolute, `original ${relativePath}`);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) blocked("original snapshot manifest entry is not a private regular file", { path: relativePath, nlink: stat.nlink });
    const bytes = fs.readFileSync(absolute);
    const observed = { bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
    if (observed.bytes !== expected.size || observed.sha256 !== expected.sha256) blocked("original snapshot file hash does not match audit manifest", { path: relativePath, observed, expected: { bytes: expected.size, sha256: expected.sha256 } });
    bindings.push({ path: relativePath, bytes: observed.bytes, sha256: observed.sha256 });
  }
  return {
    root,
    file_count: manifestEntries.size,
    manifest_digest: ORIGINAL_AUDIT_DIGEST,
    verified_paths: bindings.map((item) => item.path),
    files: bindings.sort((left, right) => left.path.localeCompare(right.path)),
    scope: "copied subject files only; unmanifested snapshot entries and unrelated post-audit drift are never copied",
  };
}

function expectedSubjectBindings(manifestEntries) {
  return Object.fromEntries(Object.entries(ORIGINAL_SUBJECTS).map(([key, subject]) => {
    const entry = manifestEntries.get(subject.source);
    if (!entry) blocked(`ORIGINAL191 manifest is missing ${subject.source}`);
    if (entry.size !== subject.size || entry.sha256 !== subject.sha256) blocked(`${subject.source} does not match the pinned audit binding`, { observed: entry, expected: subject });
    return [key, { ...subject, manifest_sha256: entry.sha256 }];
  }));
}

function fileFingerprint(file, label) {
  const target = assertRegularFile(file, label);
  const bytes = fs.readFileSync(target);
  return { path: target, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}

function copyOriginalSubjects(applicationRoot, snapshotRoot, subjects) {
  const copied = {};
  for (const [key, subject] of Object.entries(subjects)) {
    const source = assertNoSymlinkPath(snapshotRoot, path.join(snapshotRoot, subject.source), `original ${subject.source}`);
    const target = path.join(applicationRoot, subject.target);
    const parentRelative = slash(path.dirname(subject.target));
    ensureFreshDirectory(applicationRoot, parentRelative, `private ${parentRelative}`);
    const bytes = fs.readFileSync(source);
    if (bytes.byteLength !== subject.size || sha256Bytes(bytes) !== subject.sha256) blocked(`original ${subject.source} changed during copy preparation`);
    writeNewFile(target, bytes, `private ${subject.target}`);
    copied[key] = { source: subject.source, target: subject.target, before: fileFingerprint(target, `private ${subject.target}`), immutable_source: { bytes: subject.size, sha256: subject.sha256 } };
  }
  return copied;
}

function validatorSource(binding) {
  const encoded = JSON.stringify(binding);
  return `#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BINDING = ${encoded};
const FAILURE_EXIT_CODE = ${FAILURE_EXIT_CODE};
const MAX_OUTPUT = ${MAX_CHILD_OUTPUT};
const EMPTY_INVENTORY_DIGEST = "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const subjectPath = path.join(appRoot, "bin", "quality.mjs");
const command = "node app/.omp/state/native-tooling/retry-check.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safeError = (error) => ({ type: typeof error, message_sha256: hash(Buffer.from(String(error?.message ?? error ?? ""), "utf8")), code: typeof error?.code === "string" ? error.code : null });
const parseJson = (text) => { try { const parsed = JSON.parse(String(text ?? "").trim()); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null; } catch { return null; } };
let validationRoot = null;
let probeRoot = null;
const output = (record, code) => {
  for (const root of [validationRoot, probeRoot]) {
    if (root) {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    }
  }
  validationRoot = null;
  probeRoot = null;
  process.stdout.write(JSON.stringify(record, null, 2) + "\\n");
  process.exitCode = code;
};
const reportBase = { schema_version: 1, nonce: BINDING.nonce, assignment_id: BINDING.assignment_id, revision: BINDING.revision, run_id: BINDING.run_id, workload: { run_id: BINDING.run_id, source: BINDING.workload.source, revision: BINDING.revision, test: BINDING.workload.test } };
const bounded = (run, subjectHash) => ({ exit_code: Number.isInteger(run.child.status) ? run.child.status : null, signal: run.child.signal ?? null, stdout_bytes: Buffer.byteLength(String(run.child.stdout ?? ""), "utf8"), stderr_bytes: Buffer.byteLength(String(run.child.stderr ?? ""), "utf8"), output_kind: run.payload?.files && typeof run.payload.digest === "string" ? "inventory" : run.payload?.ok === false ? "usage-error" : "unknown", payload: run.payload, subject_sha256: subjectHash });
const runCapture = (root, ...extra) => {
  const child = spawnSync(process.execPath, [subjectPath, "capture", root, ...extra], { cwd: appRoot, shell: false, windowsHide: true, encoding: "utf8", maxBuffer: MAX_OUTPUT, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !["NODE_OPTIONS", "BASH_ENV", "ENV"].includes(key))) });
  return { child, payload: parseJson(child.stdout) ?? parseJson(child.stderr) };
};
const isExactInventory = (run, expectedFiles, expectedDigest) => {
  const payload = run.payload;
  return run.child.error === undefined && run.child.signal === null && run.child.status === 0 &&
    payload && Object.keys(payload).sort().join(",") === "digest,files" &&
    payload.files && typeof payload.files === "object" && !Array.isArray(payload.files) &&
    JSON.stringify(payload.files) === JSON.stringify(expectedFiles) && payload.digest === expectedDigest;
};
const isStructuredUsageRejection = (run) => {
  const payload = run.payload;
  return run.child.error === undefined && run.child.signal === null && Number.isInteger(run.child.status) && run.child.status !== 0 &&
    payload && payload.ok === false && Array.isArray(payload.errors) && payload.errors.length > 0 &&
    payload.errors.every((error) => typeof error === "string" && error.length > 0);
};
try {
  if (!fs.existsSync(subjectPath)) throw new Error("subject file missing");
  const subjectBytes = fs.readFileSync(subjectPath);
  const subjectHash = hash(subjectBytes);
  validationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "native09-technical-retry-"));
  probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "native09-technical-retry-probe-"));
  const probeBytes = Buffer.from("native09-real-probe-" + randomUUID(), "utf8");
  fs.writeFileSync(path.join(probeRoot, "probe.txt"), probeBytes, { flag: "wx", mode: 0o600 });
  const expectedProbeFiles = { "probe.txt": hash(probeBytes) };
  const expectedProbeDigest = hash(Buffer.from(JSON.stringify(expectedProbeFiles), "utf8"));
  const valid = runCapture(validationRoot);
  const validProbe = runCapture(probeRoot);
  const emptyExtra = runCapture(validationRoot, "");
  const nonemptyExtra = runCapture(validationRoot, "unexpected-extra");
  const initialSubject = subjectHash === BINDING.subject.sha256;
  const actual = {
    valid_empty_root: bounded(valid, subjectHash),
    valid_nonempty_root: bounded(validProbe, subjectHash),
    invalid_extra_empty: bounded(emptyExtra, subjectHash),
    invalid_extra_nonempty: bounded(nonemptyExtra, subjectHash),
  };
  const expected = {
    valid_empty_root: { exit_code: 0, exact_inventory: { files: {}, digest: EMPTY_INVENTORY_DIGEST } },
    valid_nonempty_root: { exit_code: 0, exact_inventory: { files: expectedProbeFiles, digest: expectedProbeDigest } },
    invalid_extra_empty: { nonzero_exit: true, error_envelope: "{ok:false,errors:[...]}" },
    invalid_extra_nonempty: { nonzero_exit: true, error_envelope: "{ok:false,errors:[...]}" },
  };
  if (initialSubject) {
    if (!isExactInventory(valid, {}, EMPTY_INVENTORY_DIGEST) || !isExactInventory(validProbe, expectedProbeFiles, expectedProbeDigest)) {
      output({ ...reportBase, status: "BLOCKED", code: "ORIGINAL_DEFECT_NOT_REPRODUCED", failure_origin: "TOOLING", actual, expected, error: { valid_inventory: false } }, 2);
    } else {
      try {
        assert.equal(isExactInventory(valid, {}, EMPTY_INVENTORY_DIGEST), true, "capture of an empty private root must produce the exact empty inventory");
        assert.equal(isExactInventory(validProbe, expectedProbeFiles, expectedProbeDigest), true, "capture of a nonempty private root must hash the real probe bytes");
        assert.notEqual(emptyExtra.child.status, 0, "capture must reject an empty extra positional argument");
        assert.equal(isStructuredUsageRejection(emptyExtra), true, "empty extra positional argument must produce structured usage rejection");
        assert.notEqual(nonemptyExtra.child.status, 0, "capture must reject a nonempty extra positional argument");
        assert.equal(isStructuredUsageRejection(nonemptyExtra), true, "nonempty extra positional argument must produce structured usage rejection");
        output({ ...reportBase, status: "BLOCKED", code: "ASSERTION_DID_NOT_RUN", failure_origin: "TOOLING", actual, expected }, 2);
      } catch (error) {
        output({ ...reportBase, status: "FAIL", code: "ASSERTION_EXPECTED_REJECTION", failure_origin: "SOLUTION", origin: "SOLUTION", actual, expected, assertion: "capture preserves exact empty and dynamic nonempty inventories while both extra arguments reject with structured usage errors", subject: { path: BINDING.workload.source, sha256: subjectHash, original_sha256: BINDING.subject.sha256, changed: false }, error: { name: error?.name ?? "AssertionError", message_sha256: hash(Buffer.from(String(error?.message ?? ""), "utf8")) } }, FAILURE_EXIT_CODE);
      }
    }
  } else {
    try {
      assert.equal(isExactInventory(valid, {}, EMPTY_INVENTORY_DIGEST), true, "repaired capture must preserve the valid empty-root inventory contract");
      assert.equal(isExactInventory(validProbe, expectedProbeFiles, expectedProbeDigest), true, "repaired capture must hash the real nonempty probe bytes");
      assert.notEqual(emptyExtra.child.status, 0, "repaired capture must reject an empty extra positional argument");
      assert.equal(isStructuredUsageRejection(emptyExtra), true, "repaired empty extra positional argument must produce structured usage rejection");
      assert.notEqual(nonemptyExtra.child.status, 0, "repaired capture must reject a nonempty extra positional argument");
      assert.equal(isStructuredUsageRejection(nonemptyExtra), true, "repaired nonempty extra positional argument must produce structured usage rejection");
      output({ ...reportBase, status: "PASSOU", code: "ASSERTION_EXPECTED_REJECTION_OBSERVED", actual, expected, assertion: "capture preserves exact empty and dynamic nonempty inventories while both extra arguments reject", subject: { path: BINDING.workload.source, sha256: subjectHash, original_sha256: BINDING.subject.sha256, changed: true } }, 0);
    } catch (error) {
      output({ ...reportBase, status: "FAIL", code: "ASSERTION_REPAIR_NOT_OBSERVED", failure_origin: "SOLUTION", origin: "SOLUTION", actual, expected, assertion: "capture preserves exact empty and dynamic nonempty inventories while both extra arguments reject", subject: { path: BINDING.workload.source, sha256: subjectHash, original_sha256: BINDING.subject.sha256, changed: true }, error: { name: error?.name ?? "AssertionError", message_sha256: hash(Buffer.from(String(error?.message ?? ""), "utf8")) } }, FAILURE_EXIT_CODE);
    }
  }
} catch (error) {
  output({ ...reportBase, status: "BLOCKED", code: "VALIDATOR_SETUP_FAILURE", failure_origin: "TOOLING", expected: { valid_empty_root: true, valid_nonempty_root: true, invalid_extra_empty: true, invalid_extra_nonempty: true }, error: safeError(error) }, 2);
}
`;
}

function buildPrompts(definition) {
  const paths = definition.paths;
  const binding = definition.workload;
  const common = [
    `NATIVE-09 technical retry scenario ${definition.scenario_id}; logical run ${definition.run_id}; assignment ${definition.assignment_id}; immutable workload revision ${definition.revision}.`,
    `Interface contract: ${paths.interface_contract} (relative path ${paths.interface_contract_relative}; version ${definition.contract}).`,
    "Phase: GREEN. No Git, network, host, package, settings, profile or installed-package operation is authorized.",
  ].join(" ");
  const make = (roleKey, sections, solutionSpace) => {
    const taskText = [...sections, common, `logical_assignment_id: ${definition.assignment_id}; revision: ${definition.revision}; role: ${definition.roles[roleKey].role}; name: ${definition.roles[roleKey].name}; allowed_write_globs: ${JSON.stringify(definition.roles[roleKey].allowed_write_globs)}; source: ${definition.workload.source}.`].join("\n\n");
    const task = canonicalRetryTask(definition, roleKey, taskText, solutionSpace);
    return { task, prompt: renderRetryRootPrompt(common, task) };
  };
  const first = make("first_validator", [
    "Perform the first bounded validator dispatch for the independent NATIVE-09 technical retry scenario.",
    `Read the interface contract at ${paths.interface_contract} (version ${definition.contract}), then read ${paths.validator}, ${paths.subject} and ${paths.dependency} from the private application, and execute exactly ${definition.command} from ${paths.cwd}. Do not prescribe or self-declare a verdict; preserve the actual command terminal, explicit isError, observed exit code and public report.`,
    `The validator's real assertion is ${binding.test}. The host supplies the resulting observation as shared context; only a real nonzero solution/behavior terminal may be classified as eligible retry evidence, while setup/auth/network/quota/configuration failures remain ineligible.`,
  ], "Observe and report only; do not write.");
  const repair = make("backend_repair", [
    "After and only after the host shared context supplies an eligible first-validator solution/behavior FAIL, repair the private application subject in phase GREEN.",
    `Read the interface contract at ${paths.interface_contract} (version ${definition.contract}) and inspect ${paths.subject} with the read tool. Reconfirm the original RED by running exactly ${definition.command} once before the write, then use exactly ONE write tool call to ${paths.subject}, then run that same exact ${definition.command} once after the write to confirm GREEN. These are the only two command calls authorized.`,
    "Do not use any other shell, command, test, formatter, lint, edit, nested task, network, global, contract, validator or dependency write operation. Do not write any path other than the exact allowed subject. Implement the smallest real fix for the audited strict-arity defect: capture with any extra positional argument, including an empty string, must reject. Do not add a fail-first switch, mock, no-op, status override or validator-specific branch.",
  ], "Repair only the private copied CLI subject.");
  const second = make("second_validator", [
    "Perform the distinct second validator dispatch for the same NATIVE-09 assignment after the private subject repair.",
    `Read the interface contract at ${paths.interface_contract} (version ${definition.contract}), then read ${paths.validator}, ${paths.subject} and ${paths.dependency}; execute exactly ${definition.command} from ${paths.cwd}. The workload/test revision and assignment must remain unchanged, but this must be a new real public dispatch/job/instance at attempt 2 (cap 3). Do not prescribe or self-declare a verdict; preserve the actual command terminal and report.`,
    "The host consumes the observed terminal as the second validator result. Do not infer success from an ACK, task ID, prompt text or a self-declared phase.",
  ], "Observe the repaired private application only; do not write.");
  return {
    first_validator: first.prompt,
    backend_repair: repair.prompt,
    second_validator: second.prompt,
    tasks: Object.freeze({ first_validator: first.task, backend_repair: repair.task, second_validator: second.task }),
  };
}

function buildPeerTask(definition, subjectSha256) {
  const subjectHash = requireSha256(subjectSha256, "repaired subject SHA-256");
  const common = [
    `NATIVE-09 technical retry scenario ${definition.scenario_id}; logical run ${definition.run_id}; assignment ${definition.assignment_id}; immutable workload revision ${definition.revision}.`,
    `Interface contract: ${definition.paths.interface_contract} (relative path ${definition.paths.interface_contract_relative}; version ${definition.contract}).`,
    "Phase: GREEN. No Git, network, host, package, settings, profile or installed-package operation is authorized.",
  ].join(" ");
  const taskText = [
    `Perform the independent read-only peer review after the accepted repair. Read ${definition.paths.interface_contract} (version ${definition.contract}) and ${definition.paths.subject}; review logical revision ${definition.revision}.`,
    `Host-observed repaired subject SHA-256: ${subjectHash}.`,
    "Return only the existing TDD_PEER_REVIEW schema with protocol_mode TDD_PEER_REVIEW, agent peer-reviewer, status APROVADO or BLOQUEADO, reviewed_revision, overall_correctness, explanation, confidence and findings. Root must await this independent reviewer; do not add lifecycle, subject hash, assignment or model fields.",
    common,
    `logical_assignment_id: ${definition.assignment_id}; revision: ${definition.revision}; role: ${definition.roles.peer_review.role}; name: ${definition.roles.peer_review.name}; allowed_write_globs: ${JSON.stringify(definition.roles.peer_review.allowed_write_globs)}; source: ${definition.workload.source}.`,
  ].join("\n\n");
  const task = canonicalRetryTask(definition, "peer_review", taskText, "Read-only review of the repaired private subject; do not write.");
  return Object.freeze({ task, prompt: renderRetryRootPrompt(common, task) });
}

function buildInterfaceContract(definition, copied, validatorFingerprint) {
  const forbiddenWrites = [...definition.write_policy.forbidden];
  return {
    contract: definition.contract,
    run_id: definition.run_id,
    assignment_id: definition.assignment_id,
    revision: definition.revision,
    path: definition.paths.interface_contract,
    relative_path: definition.paths.interface_contract_relative,
    read_only: true,
    read_policy: {
      roles: ["validator", "backend-developer", "peer-reviewer"],
      mode: "read-only",
    },
    cli: {
      source: definition.paths.subject_relative,
      argv: {
        valid_empty_root: ["capture", "<empty-private-root>"],
        valid_nonempty_root: ["capture", "<nonempty-private-root>"],
        invalid_extra_empty: ["capture", "<empty-private-root>", ""],
        invalid_extra_nonempty: ["capture", "<empty-private-root>", "unexpected-extra"],
      },
      expectations: {
        valid_empty_root: {
          exit_code: 0,
          output: { type: "exact_inventory", files: {}, digest: EMPTY_INVENTORY_DIGEST },
        },
        valid_nonempty_root: {
          exit_code: 0,
          output: { type: "exact_inventory", files: "actual-file-hash-map", digest: "sha256-json-files" },
        },
        invalid_extra_empty: {
          exit_code: "nonzero",
          output: { type: "structured_usage_rejection", ok: false, errors: "nonempty-string-array" },
        },
        invalid_extra_nonempty: {
          exit_code: "nonzero",
          output: { type: "structured_usage_rejection", ok: false, errors: "nonempty-string-array" },
        },
      },
    },
    write_policy: {
      allowed_write_globs: [...definition.write_policy.allowed_write_globs],
      forbidden: forbiddenWrites,
    },
    fingerprints: {
      subject: copied.cli.before,
      dependency: copied.dependency.before,
      validator: validatorFingerprint,
    },
  };
}


function validateContext(context) {

  if (!context || typeof context !== "object" || Array.isArray(context)) blocked("technical retry context must be an object");
  const runId = requireNonEmptyString(context.runId, "context.runId");
  const assignmentId = requireNonEmptyString(context.assignmentId, "context.assignmentId");
  const revision = requireNonEmptyString(context.revision, "context.revision");
  const nonce = requireNonEmptyString(context.nonce, "context.nonce");
  const projectRoot = assertDirectory(context.projectRoot, "context.projectRoot");
  const snapshotRoot = assertDirectory(context.originalSnapshotRoot, "context.originalSnapshotRoot");
  const manifest = manifestInput(context.originalAuditManifest);
  const manifestEntries = validateManifest(manifest.value);
  if (samePath(projectRoot, snapshotRoot) || inside(projectRoot, snapshotRoot) || inside(snapshotRoot, projectRoot)) blocked("private project and immutable original snapshot must be disjoint");
  return { runId, assignmentId, revision, nonce, projectRoot, snapshotRoot, manifest, manifestEntries };
}

function prepareTechnicalRetryScenario(context) {
  const input = validateContext(context);
  const source = verifyOriginalSource(input.snapshotRoot, input.manifestEntries);
  const subjects = expectedSubjectBindings(input.manifestEntries);
  const applicationRoot = path.join(input.projectRoot, "app");
  assertNoSymlinkPath(input.projectRoot, applicationRoot, "private application", { allowMissingLeaf: true });
  if (fs.existsSync(applicationRoot)) blocked("private application path already exists; preparation refuses replacement", { path: applicationRoot });
  fs.mkdirSync(applicationRoot);
  const copied = copyOriginalSubjects(applicationRoot, input.snapshotRoot, subjects);
  const validatorDir = ensureFreshDirectory(applicationRoot, ".omp/state/native-tooling", "private validator directory");
  const workload = {
    run_id: input.runId,
    assignment_id: input.assignmentId,
    revision: input.revision,
    nonce: input.nonce,
    source: ORIGINAL_SUBJECTS.cli.project_target,
    test: "capture <empty-private-root> and dynamic <nonempty-private-root> return exact inventories; both empty and nonempty extra arguments reject with {ok:false,errors:[...]}",
  };
  const validatorBinding = {
    run_id: input.runId,
    assignment_id: input.assignmentId,
    revision: input.revision,
    nonce: input.nonce,
    workload: { source: workload.source, test: workload.test },
    subject: { path: ORIGINAL_SUBJECTS.cli.project_target, sha256: subjects.cli.sha256, bytes: subjects.cli.size },
  };
  const validatorPath = path.join(validatorDir, "retry-check.mjs");
  writeNewFile(validatorPath, Buffer.from(validatorSource(validatorBinding), "utf8"), "private retry validator");
  const validatorFingerprint = fileFingerprint(validatorPath, "private retry validator");
  const definition = {
    contract: CONTRACT_VERSION,
    scenario_id: SCENARIO_ID,
    evidence_level: "offline-preparation-only",
    native: false,
    run_id: input.runId,
    assignment_id: input.assignmentId,
    revision: input.revision,
    nonce: input.nonce,
    project_root: input.projectRoot,
    application_root: applicationRoot,
    cwd: input.projectRoot,
    command: COMMAND,
    command_argv: ["node", VALIDATOR_RELATIVE],
    role_allowlist: ["validator", "backend-developer", "peer-reviewer"],
    roles: {
      first_validator: { role: "validator", name: "Native09TechnicalRetryValidatorFirst", assignment_id: input.assignmentId, revision: input.revision, attempt: 1, allowed_write_globs: [] },
      backend_repair: { role: "backend-developer", name: "Native09TechnicalRetryBackendDeveloper", assignment_id: input.assignmentId, revision: input.revision, allowed_write_globs: ["app/bin/quality.mjs"] },
      peer_review: { role: "peer-reviewer", name: "Native09TechnicalRetryPeerReviewer", assignment_id: input.assignmentId, revision: input.revision, allowed_write_globs: [] },
      second_validator: { role: "validator", name: "Native09TechnicalRetryValidatorSecond", assignment_id: input.assignmentId, revision: input.revision, attempt: 2, allowed_write_globs: [] },
    },
    paths: {
      cwd: input.projectRoot,
      application_root: applicationRoot,
      validator: validatorPath,
      validator_relative: VALIDATOR_RELATIVE,
      interface_contract: path.join(input.projectRoot, INTERFACE_CONTRACT_RELATIVE),
      interface_contract_relative: INTERFACE_CONTRACT_RELATIVE,
      subject: path.join(input.projectRoot, ORIGINAL_SUBJECTS.cli.project_target),
      dependency: path.join(input.projectRoot, ORIGINAL_SUBJECTS.dependency.project_target),
      subject_relative: ORIGINAL_SUBJECTS.cli.project_target,
      dependency_relative: ORIGINAL_SUBJECTS.dependency.project_target,
    },
    workload,
    write_policy: {
      backend_role: null,
      allowed_write_globs: ["app/bin/quality.mjs"],
      forbidden: [
        VALIDATOR_RELATIVE,
        INTERFACE_CONTRACT_RELATIVE,
        ORIGINAL_SUBJECTS.dependency.project_target,
        "tests/**",
        "installed-package/**",
        "original-snapshot/**",
        "global/**",
        "contract/**",
      ],
    },
    immutable_original: {
      manifest_path: input.manifest.path,
      manifest_digest: source.manifest_digest,
      file_count: source.file_count,
      verified_before_copy: true,
      subjects: {
        cli: { source: ORIGINAL_SUBJECTS.cli.source, bytes: subjects.cli.size, sha256: subjects.cli.sha256 },
        dependency: { source: ORIGINAL_SUBJECTS.dependency.source, bytes: subjects.dependency.size, sha256: subjects.dependency.sha256 },
      },
    },
    immutable_installed_package: {
      root: typeof context.installedPackageRoot === "string" ? path.resolve(context.installedPackageRoot) : null,
      before: null,
      after: null,
      observed: false,
      requirement: "NativeLifecycleCompletion must supply actual current-installed-package before/after fingerprints; this private mutable application is separate.",
    },
    mutable_application: {
      root: applicationRoot,
      files: {
        subject: copied.cli,
        dependency: copied.dependency,
        validator: { target: VALIDATOR_RELATIVE, before: validatorFingerprint },
      },
      before_hashes: { subject: copied.cli.before, dependency: copied.dependency.before, validator: validatorFingerprint },
      after_hashes: null,
    },
    execution_consumer: {
      module: "tdd-orchestrator/lib/execution.mjs",
      requirement: "actual evaluateExecution consumes first FAIL history then second PASS history and reports completion/resume",
      derived_id_label: "adapter-derived-execution-id; never an opaque OMP task_id",
    },
  };
  const interfaceContract = buildInterfaceContract(definition, copied, validatorFingerprint);
  writeNewFile(
    definition.paths.interface_contract,
    Buffer.from(`${JSON.stringify(interfaceContract, null, 2)}
`, "utf8"),
    "private interface contract",
  );
  definition.interface_contract = {
    path: definition.paths.interface_contract,
    relative_path: definition.paths.interface_contract_relative,
    read_only: true,
    fingerprint: fileFingerprint(definition.paths.interface_contract, "private interface contract"),
  };
  definition.write_policy.backend_role = definition.roles.backend_repair.name;
  const promptBundle = buildPrompts(definition);
  definition.prompts = {
    first_validator: promptBundle.first_validator,
    backend_repair: promptBundle.backend_repair,
    second_validator: promptBundle.second_validator,
  };
  definition.tasks = promptBundle.tasks;
  definition.validator = {
    path: validatorPath,
    command: COMMAND,
    source_sha256: validatorFingerprint.sha256,
    binding_sha256: digest(validatorBinding),
    assertion: "capture preserves exact empty and dynamic nonempty inventories while empty and nonempty extra positional arguments reject with structured error envelopes and nonzero exits",
    initial_behavior: "original preserves both valid inventories, accepts the empty extra argument, and rejects the nonempty extra argument; validator assertion therefore emits bounded FAIL/nonzero",
    repaired_behavior: "copied subject must preserve both exact inventories and reject both extra-argument forms; same validator then emits PASSOU only for actual structured usage rejections",
  };
  return definition;
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) ?? null;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim() !== "")?.trim() ?? null;
}

function firstObservedString(...values) {
  const strings = values.filter((value) => typeof value === "string" && value.length > 0);
  return strings.length > 0 && strings.every((value) => value === strings[0]) ? strings[0] : null;
}

function firstInteger(...values) {
  return values.find((value) => Number.isSafeInteger(value)) ?? null;
}

function firstBoolean(...values) {
  return values.find((value) => typeof value === "boolean") ?? null;
}

const ASYNC_JOB_FIELDS = new Set([
  "jobId", "type", "status", "agentId", "label", "durationMs", "meta", "schema",
]);
const WAIT_JOB_FIELDS = new Set([
  "id", "type", "status", "label", "durationMs", "intent", "settledAtMs", "exitCode", "resolvedModel", "resolvedModelIdentity", "resolvedThinkingLevel", "advisor", "completionPercent", "stage", "requests", "cost", "contextTokens", "contextWindow", "widget", "resultText", "errorText", "meta", "structured", "agentUrlId", "agentOutputPublished",
]);

const NATIVE09_BACKEND_PROOF_KIND = "native09-backend-repair-write";
const NATIVE09_BACKEND_ASSIGNMENT = "Native09TechnicalRetryBackendDeveloper";
function hasNative09WriteAuthority(write, expected) {
  const binding = write?.identity?.observed_binding;
  if (write?.role !== "backend-developer" || write?.role_source !== "observed-root-dispatch-lifecycle"
    || write?.identity?.matches?.observed_binding !== true
    || binding?.source !== "observed-root-dispatch-lifecycle"
    || expected.agent !== "backend-developer" || expected.agentSource !== "project"
    || expected.assignment_id !== NATIVE09_BACKEND_ASSIGNMENT) return false;
  return ["root_session_id", "parent_tool_call_id", "allocated_id", "index", "agent", "agentSource", "assignment_id", "job_id", "instance_id"]
    .every((key) => key === "index"
      ? Number.isSafeInteger(expected[key]) && expected[key] >= 0 && binding[key] === expected[key]
      : typeof expected[key] === "string" && expected[key].length > 0 && binding[key] === expected[key]);
}

function isNative09BackendRepairProof(record) {
  if (record?.agent !== "backend-developer" || record?.agentSource !== "project" || record?.assignment_id !== NATIVE09_BACKEND_ASSIGNMENT) return false;
  const proof = record.independent_evidence;
  if (!proof || proof.observed !== true || proof.kind !== NATIVE09_BACKEND_PROOF_KIND || proof.count !== 1) return false;
  const isWait = record.source_kind === "task_wait_result";
  const job = isWait ? record.wait_result?.job
    : record.source_kind === "task_async_result" ? record.async_result?.job : null;
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  const schemaKey = isWait ? "structured" : "schema";
  const schema = job[schemaKey];
  if (Object.hasOwn(job, schemaKey)) {
    if (!schema || schema.status !== "unavailable" || Object.hasOwn(schema, "data")
      || record.structured_output_status !== "unavailable") return false;
  } else if (record.structured_output_status !== null) return false;
  if (record.structured_data !== null) return false;
  const expectedJobId = record.source_kind === "task_wait_result"
    ? record.wait_result?.host_binding?.job_id
    : record.jobId;
  if (typeof expectedJobId !== "string" || expectedJobId.trim() === "") return false;
  const tuple = [
    ["root_session_id", record.root_session_id],
    ["parent_tool_call_id", record.parent_tool_call_id],
    ["allocated_id", record.allocated_id],
    ["index", record.index],
    ["agent", record.agent],
    ["agentSource", record.agentSource],
    ["assignment_id", record.assignment_id],
    ["job_id", expectedJobId],
    ["instance_id", record.instanceId],
  ];
  if (tuple.some(([key, value]) => proof[key] !== value)) return false;
  const write = proof.write;
  if (!write || typeof write !== "object" || Array.isArray(write)) return false;
  if (!hasNative09WriteAuthority(write, Object.fromEntries(tuple))) return false;
  if (write.phase !== "end"
    || write.terminal_event !== true
    || write.terminal_error_observed !== true
    || write.terminal_error !== false
    || !Array.isArray(write.paths)
    || write.paths.length !== 1
    || write.paths[0] !== "app/bin/quality.mjs"
    || write.guard?.reason_code !== null
    || write.guard?.paths_in_allowlist !== true
    || write.correlation?.status !== "matched"
    || write.correlation?.identity_match !== true
    || write.correlation?.task_match !== true
    || write.correlation?.public_identity !== proof.allocated_id
    || write.root_session_id !== proof.root_session_id
    || write.parent_tool_call_id !== proof.parent_tool_call_id
    || write.allocated_id !== proof.allocated_id
    || write.index !== proof.index
    || write.job_id !== proof.job_id
    || write.instance_id !== proof.instance_id) return false;
  return true;
}

function independentStructuredlessSuccess(record, schemaStatus) {
  const outputStatus = record.structured_output_status ?? null;
  const expectedStatus = schemaStatus === "unavailable" ? "unavailable" : null;
  if (record.agent === "backend-developer") {
    return (schemaStatus === undefined || schemaStatus === "unavailable")
      && outputStatus === expectedStatus && isNative09BackendRepairProof(record);
  }
  return ["validator", "spec-kit-author"].includes(record.agent)
    && record.independent_evidence?.observed === true
    && record.structured_data === null
    && outputStatus === expectedStatus;
}
function isAuthoritativeTaskRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  if (!firstString(record.id) || record.allocated_id !== record.id || !firstString(record.parent_tool_call_id)
      || !Number.isSafeInteger(record.index) || record.index < 0 || !firstString(record.agent) || !firstString(record.agentSource)) return false;
  if (record.source_kind === "task_tool_details") {
    return record.exit_code_observed === true && Number.isInteger(record.exitCode)
      && typeof record.isError === "boolean"
      && (record.is_error_observed === true || record.is_error_source === "host-derived SingleResult.exitCode/error/aborted");
  }
  if (record.source_kind === "task_wait_result" && (record.agentSource !== "project" || firstString(record.assignment_id) === null)) return false;
  if (record.source_kind === "task_wait_result") {
    const delivery = firstObject(record.wait_result);
    const job = firstObject(delivery?.job);
    const binding = firstObject(delivery?.host_binding);
    if (!job || Object.keys(job).some((field) => !WAIT_JOB_FIELDS.has(field))) return false;
    if (Object.hasOwn(job, "exitCode") && !Number.isSafeInteger(job.exitCode)) return false;
    if (Object.hasOwn(job, "agentOutputPublished") && typeof job.agentOutputPublished !== "boolean") return false;
    if (!firstString(job.id) || job.id !== record.jobId || job.type !== "task"
        || !["completed", "failed", "cancelled"].includes(job.status) || record.status !== job.status) return false;
    if (Object.hasOwn(job, "agentUrlId") && typeof job.agentUrlId !== "string") return false;
    const schema = job.structured;
    if (schema !== undefined && (!schema || typeof schema !== "object" || Array.isArray(schema)
      || !["caller", "agent", "session", "none"].includes(schema.source)
      || !["permissive", "strict"].includes(schema.mode)
      || !["valid", "invalid", "unavailable"].includes(schema.status))) return false;
    if (schema?.status === "valid" && (schema.source === "none" || !Object.hasOwn(schema, "data"))) return false;
    if (schema && schema.status !== "valid" && Object.hasOwn(schema, "data")) return false;
    if (schema?.status === "unavailable" && schema.source !== "none") return false;
    if (record.structured_output_status !== (schema?.status ?? null)) return false;
    if (schema?.status === "valid" && (record.structured_data === undefined || digest(record.structured_data) !== digest(schema.data))) return false;
    if (schema?.status !== "valid" && record.structured_data !== null) return false;
    if (record.agent === "backend-developer" && (schema === undefined || schema.status === "unavailable") && !isNative09BackendRepairProof(record)) return false;
    const exposedExit = Number.isSafeInteger(job.exitCode);
    if (record.exit_code_observed !== exposedExit || record.exitCode !== (exposedExit ? job.exitCode : null)) return false;
    for (const [field, observed] of [["isError", "is_error_observed"], ["error", "error_observed"], ["aborted", "aborted_observed"]]) {
      if (record[field] !== null || record[observed] !== false) return false;
    }
    return delivery.source === "tool_execution_end.result.details.jobs"
      && delivery.tool === "wait"
      && firstString(delivery.tool_call_id) !== null
      && delivery.is_error === false
      && delivery.is_error_observed === true
      && Number.isSafeInteger(delivery.host_workflow_ordinal) && delivery.host_workflow_ordinal > 0
      && record.host_workflow_ordinal === delivery.host_workflow_ordinal
      && binding?.source === "observed-root-dispatch-lifecycle"
      && firstString(record.root_session_id) !== null && binding.root_session_id === record.root_session_id
      && binding.parent_tool_call_id === record.parent_tool_call_id && binding.allocated_id === record.allocated_id
      && binding.index === record.index && binding.agent === record.agent && binding.agentSource === record.agentSource
      && binding.assignment === record.assignment_id
      && (binding.assignment_id === undefined || binding.assignment_id === record.assignment_id)
      && firstString(binding.job_id) !== null && firstString(binding.instance_id) !== null
      && binding.instance_id === record.instanceId
      && binding.root_task_end_is_error === false;
  }
  if (record.source_kind !== "task_async_result" || record.agentSource !== "project" || !firstString(record.jobId) || !firstString(record.instanceId)) return false;
  for (const [field, observed] of [["exitCode", "exit_code_observed"], ["isError", "is_error_observed"], ["error", "error_observed"], ["aborted", "aborted_observed"]]) {
    if (record[field] !== null || record[observed] !== false) return false;
  }
  const delivery = firstObject(record.async_result);
  const job = firstObject(delivery?.job);
  const binding = firstObject(delivery?.host_binding);
  if (!job || Object.keys(job).some((field) => !ASYNC_JOB_FIELDS.has(field))) return false;
  if (record.agent === "backend-developer" && (job.schema === undefined || job.schema?.status === "unavailable") && !isNative09BackendRepairProof(record)) return false;
  return delivery?.source === "message_end.custom.async-result"
    && firstString(job?.jobId) !== null && job?.type === "task" && job?.agentId === record.allocated_id
    && ["completed", "failed", "cancelled"].includes(job?.status) && record.status === job.status
    && Number.isSafeInteger(delivery.host_workflow_ordinal) && delivery.host_workflow_ordinal > 0
    && record.host_workflow_ordinal === delivery.host_workflow_ordinal
    && binding?.source === "observed-root-dispatch-lifecycle"
    && firstString(record.root_session_id) !== null && binding.root_session_id === record.root_session_id
    && binding.parent_tool_call_id === record.parent_tool_call_id && binding.allocated_id === record.allocated_id
    && binding.index === record.index
    && binding.agent === record.agent && binding.agentSource === record.agentSource
    && binding.assignment === record.assignment_id
    && binding.job_id === record.jobId && binding.instance_id === record.instanceId
    && binding.root_task_end_is_error === false;
}

function taskRecordSucceeded(record) {
  if (!isAuthoritativeTaskRecord(record)) return false;
  if (record.source_kind === "task_tool_details") {
    return INLINE_SUCCESS_STATUSES.has(String(record.status ?? "").toLowerCase())
      && record.exitCode === 0 && record.isError === false
      && !(record.error_observed === true && record.error !== null)
      && !(record.aborted_observed === true && record.aborted === true)
      && (record.structured_output_status === null || record.structured_output_status === "valid");
  }
  if (record.source_kind === "task_wait_result") {
    if (record.status !== "completed" || (record.exit_code_observed === true && record.exitCode !== 0)) return false;
    const schema = record.wait_result.job.structured;
    if (schema === undefined) return independentStructuredlessSuccess(record, undefined);
    if (schema.status === "unavailable") return independentStructuredlessSuccess(record, "unavailable");
    if (schema.status !== "valid" || schema.source === "none" || !Object.hasOwn(schema, "data")) return false;
    return record.structured_output_status === "valid"
      && record.structured_data !== undefined
      && digest(record.structured_data) === digest(schema.data);
  }
  if (record.async_result.job.status !== "completed") return false;
  const schema = record.async_result.job.schema;
  if (schema === undefined) return independentStructuredlessSuccess(record, undefined);
  if (!schema || typeof schema !== "object" || Array.isArray(schema)
      || !["caller", "agent", "session", "none"].includes(schema.source)
      || !["permissive", "strict"].includes(schema.mode)
      || (record.structured_output_status !== undefined && record.structured_output_status !== schema.status)) return false;
  if (schema.status === "unavailable") return schema.source === "none" && !Object.hasOwn(schema, "data") && independentStructuredlessSuccess(record, "unavailable");
  return schema.status === "valid" && schema.source !== "none" && Object.hasOwn(schema, "data")
    && schema.data !== undefined && record.structured_data !== undefined
    && digest(record.structured_data) === digest(schema.data);
}

function taskCompletionBinding(observation, definition, label) {
  const expectedName = expectedDispatchName(definition, label === "first" ? "FAIL" : "PASS");
  const records = Array.isArray(observation?.task_records)
    ? observation.task_records.filter((item) => item?.assignment_id === expectedName && item?.run_id === definition.run_id)
    : [];
  const failures = [];
  if (records.length !== 1) failures.push(`${label}_task_record_cardinality_invalid`);
  else if (!isAuthoritativeTaskRecord(records[0])) failures.push(`${label}_task_record_authority_invalid`);
  else if (!taskRecordSucceeded(records[0])) failures.push(`${label}_task_record_not_successful`);
  const dispatch = firstObject(observation?.host?.dispatch);
  if (records.length === 1) {
    const record = records[0];
    const role = label === "first" ? definition.roles?.first_validator : definition.roles?.second_validator;
    if (record.agent !== role?.role || record.agentSource !== "project") failures.push(`${label}_task_record_role_source_mismatch`);
    const hostJobId = record.source_kind === "task_wait_result" ? firstString(record.wait_result?.host_binding?.job_id) : firstString(record.jobId);
    const hostInstanceId = record.source_kind === "task_wait_result" ? firstString(record.wait_result?.host_binding?.instance_id) : firstString(record.instanceId);
    if (!dispatch || hostJobId !== dispatch.job_id || hostInstanceId !== dispatch.instance_id) failures.push(`${label}_task_record_domain_dispatch_mismatch`);
  }
  return { ok: failures.length === 0, failures };
}

function normalizeTerminal(observation) {
  const record = firstObject(observation?.record);
  const terminal = firstObject(observation?.terminal_end, observation?.end, observation?.terminal, record, observation);
  const raw = terminal;
  const details = firstObject(raw?.details);
  const command = firstObject(raw?.command);
  const report = firstObject(raw?.report);
  const eventType = firstString(raw?.nested_event_type, raw?.event_type, raw?.type);
  const terminalEventPresent = eventType === "tool_execution_end";
  const isErrorValues = [raw?.isError, raw?.is_error].filter((value) => typeof value === "boolean");
  const isError = isErrorValues[0] ?? null;
  const isErrorObserved = isErrorValues.length > 0;
  const isErrorContradictory = isErrorValues.length > 1 && isErrorValues.some((value) => value !== isError);
  const isErrorSource = firstString(raw?.is_error_source, raw?.isErrorSource);
  const rawError = firstBoolean(raw?.error, raw?.tool_error, raw?.toolError, details?.error, details?.tool_error);
  const rawErrorObserved = rawError !== null;
  const aborted = firstBoolean(raw?.aborted, raw?.is_aborted, raw?.isAborted, details?.aborted, details?.is_aborted, details?.isAborted);
  const abortedObserved = aborted !== null;
  const exitCode = firstInteger(raw?.exit_code, raw?.exitCode, details?.exit_code, details?.exitCode);
  const exitCodeObserved = firstBoolean(raw?.exit_code_observed, raw?.exitCodeObserved, details?.exit_code_observed, details?.exitCodeObserved) ?? Number.isSafeInteger(exitCode);
  const assignmentId = firstObservedString(raw?.assignment_id, raw?.assignmentId);
  const dispatchName = firstObservedString(raw?.dispatch_assignment_name, raw?.dispatchAssignmentName, raw?.dispatch_name, raw?.dispatchName, raw?.assignment_name, raw?.assignmentName, raw?.dispatch?.name);
  const runId = firstObservedString(raw?.run_id, raw?.runId);
  const revision = firstObservedString(raw?.revision, raw?.source_revision);
  const jobId = firstObservedString(raw?.job_id, raw?.jobId, details?.job_id, details?.jobId);
  const instanceId = firstObservedString(raw?.instance_id, raw?.instanceId, raw?.public_instance_id, details?.instance_id, details?.instanceId);
  const publicId = firstObservedString(raw?.id, raw?.public_id, raw?.allocated_id, raw?.allocatedId, details?.id, details?.public_id);
  const taskIdInjected = [raw?.task_id, raw?.taskId, details?.task_id, details?.taskId].some((value) => value !== undefined && value !== null);
  const taskId = null;
  const dispatchId = firstObservedString(raw?.dispatch_id, raw?.dispatchId, details?.dispatch_id, details?.dispatchId);
  const streamStartSequence = firstInteger(raw?.start_sequence, raw?.startSequence, details?.start_sequence, details?.startSequence);
  const streamEndSequence = firstInteger(raw?.sequence, raw?.end_sequence, raw?.endSequence, details?.sequence, details?.end_sequence, details?.endSequence);
  const rootSessionId = firstObservedString(raw?.root_session_id, raw?.rootSessionId, details?.root_session_id, details?.rootSessionId);
  const sessionId = firstObservedString(raw?.session_id, raw?.sessionId, details?.session_id, details?.sessionId);
  const toolCallId = firstObservedString(raw?.tool_call_id, raw?.toolCallId, details?.tool_call_id, details?.toolCallId);
  const parentToolCallId = firstObservedString(raw?.parent_tool_call_id, raw?.parentToolCallId, details?.parent_tool_call_id, details?.parentToolCallId);
  const agentId = firstObservedString(raw?.agent_id, raw?.agentId, details?.agent_id, details?.agentId);
  const payloadId = firstObservedString(raw?.payload?.id, details?.payload?.id);
  const resultIds = Array.isArray(raw?.results) ? raw.results.map((item) => firstObservedString(item?.id)).filter(Boolean) : [];
  const attempt = firstInteger(raw?.attempt, report?.attempt);
  const hostWorkflowOrdinal = firstInteger(raw?.host_workflow_ordinal, raw?.hostWorkflowOrdinal, raw?.host_observation?.host_workflow_ordinal);
  const correlation = firstObject(raw?.correlation);
  const observed = firstObject(raw?.observed);
  return {
    raw,
    command,
    report,
    event_type: eventType,
    terminal_event_present: terminalEventPresent,
    is_error: isError,
    is_error_observed: isErrorObserved,
    is_error_source: isErrorSource,
    is_error_contradictory: isErrorContradictory,
    error: rawError,
    error_observed: rawErrorObserved,
    aborted,
    aborted_observed: abortedObserved,
    exit_code: exitCode,
    exit_code_observed: exitCodeObserved,
    assignment_id: assignmentId,
    dispatch_name: dispatchName,
    run_id: runId,
    revision,
    job_id: jobId,
    instance_id: instanceId,
    public_id: publicId,
    dispatch_id: dispatchId,
    task_id: taskId,
    task_id_injected: taskIdInjected,
    root_session_id: rootSessionId,
    stream_start_sequence: streamStartSequence,
    stream_end_sequence: streamEndSequence,
    session_id: sessionId,
    tool_call_id: toolCallId,
    parent_tool_call_id: parentToolCallId,
    agent_id: agentId,
    payload_id: payloadId,
    result_ids: resultIds,
    task_id_exposed: taskId !== null,
    attempt,
    host_workflow_ordinal: hostWorkflowOrdinal,
    correlation,
    observed,
  };
}


function terminalCount(observation) {
  for (const key of ["terminals", "terminal_events", "ends"]) if (Array.isArray(observation?.[key])) return observation[key].length;
  return normalizeTerminal(observation).terminal_event_present ? 1 : 0;
}

function reportStatus(report) {
  return typeof report?.status === "string" ? report.status.toUpperCase() : null;
}

function reportOrigin(report) {
  const value = firstString(report?.failure_origin, report?.origin, report?.failureClass, report?.failure_class);
  return value ? value.toUpperCase() : null;
}

function commandMatches(terminal, definition) {
  const command = firstString(terminal.command?.command, terminal.command?.invocation, terminal.command?.label, terminal.command?.command_label, terminal.raw?.command, terminal.raw?.command_label);
  if (!command) return false;
  return command === definition.command || command.endsWith(definition.command) || command.replaceAll("\\", "/") === definition.command;
}

function expectedDispatchName(definition, expectedStatus) {
  const role = expectedStatus === "FAIL" ? definition.roles?.first_validator : definition.roles?.second_validator;
  return firstString(role?.name);
}

function nativeTerminalBinding(terminal, definition, expectedStatus, expectedAttempt, native = false) {
  const failures = [];
  if (!terminal.raw) failures.push("terminal_missing");
  if (terminal.event_type !== "tool_execution_end") failures.push("terminal_event_not_end");
  if (terminal.is_error !== (expectedStatus === "FAIL")) failures.push(expectedStatus === "FAIL" ? "first_end_isError_not_true" : "second_end_isError_not_false");
  if (!terminal.is_error_observed || terminal.is_error_source !== "tool_execution_end") failures.push("terminal_end_isError_not_explicit");
  if (terminal.is_error_contradictory) failures.push("terminal_end_isError_contradictory");
  if (terminal.aborted_observed && terminal.aborted === true) failures.push("terminal_aborted");
  const expectedWorkload = firstObject(definition.workload) ?? {};
  if (terminal.report?.nonce !== definition.nonce) failures.push("report_nonce_mismatch");
  if (terminal.report?.assignment_id !== definition.assignment_id) failures.push("report_assignment_identity_mismatch");
  if (terminal.report?.revision !== definition.revision) failures.push("report_revision_mismatch");
  if (terminal.report?.run_id !== definition.run_id) failures.push("report_run_identity_mismatch");
  if (terminal.report?.workload?.run_id !== definition.run_id) failures.push("report_workload_run_identity_mismatch");
  if (terminal.report?.workload?.source !== expectedWorkload.source) failures.push("report_workload_source_mismatch");
  if (terminal.report?.workload?.revision !== definition.revision) failures.push("report_workload_revision_mismatch");
  if (terminal.report?.workload?.test !== expectedWorkload.test) failures.push("report_workload_test_mismatch");
  if (expectedStatus === "FAIL") {
    if (!terminal.exit_code_observed || !Number.isSafeInteger(terminal.exit_code) || terminal.exit_code === 0) failures.push("first_nonzero_exit_not_observed");
    if (terminal.exit_code !== FAILURE_EXIT_CODE) failures.push("first_assertion_exit_mismatch");
    if (!FAILURE_STATUSES.has(reportStatus(terminal.report))) failures.push("first_report_not_semantic_failure");
    const origin = reportOrigin(terminal.report);
    if (!ELIGIBLE_FAILURE_ORIGINS.has(origin)) failures.push("first_failure_origin_not_eligible");
    const actual = terminal.report?.actual;
    const expected = terminal.report?.expected;
    if (actual === undefined || expected === undefined) failures.push("first_report_missing_actual_expected");
  } else {
    if (!SUCCESS_STATUSES.has(reportStatus(terminal.report))) failures.push("second_report_not_passou");
    if (terminal.exit_code_observed && terminal.exit_code !== 0) failures.push("second_success_exit_contradictory");
    if (!terminal.exit_code_observed && terminal.exit_code !== null) failures.push("second_unexposed_exit_not_null");
  }
  if (terminal.assignment_id !== definition.assignment_id) failures.push("assignment_identity_mismatch");
  if (terminal.run_id !== definition.run_id) failures.push("run_identity_mismatch");
  if (terminal.revision !== definition.revision) failures.push("revision_identity_mismatch");
  if (terminal.attempt !== expectedAttempt) failures.push("attempt_mismatch");
  if (terminal.task_id_injected) failures.push("task_id_injected_into_end");
  if (!terminal.job_id) failures.push("public_job_id_missing");
  if (!terminal.instance_id) failures.push("public_instance_identity_missing");
  if (!commandMatches(terminal, definition)) failures.push("validator_command_not_observed");
  if (!terminal.correlation || terminal.correlation.status !== "matched") failures.push("terminal_correlation_not_matched");
  if (!terminal.observed || terminal.observed.present !== true) failures.push("terminal_observation_not_present");
  if (native) {
    const expectedName = expectedDispatchName(definition, expectedStatus);
    if (!expectedName || terminal.dispatch_name !== expectedName) failures.push("dispatch_name_not_observed");
    if (!terminal.parent_tool_call_id) failures.push("parent_dispatch_tool_call_missing");
    if (!Number.isSafeInteger(terminal.host_workflow_ordinal) || terminal.host_workflow_ordinal <= 0) failures.push("terminal_host_workflow_ordinal_missing");
  }
  return { ok: failures.length === 0, failures, status: reportStatus(terminal.report), origin: reportOrigin(terminal.report) };
}


function nativeHostObservationBinding(observation, terminal, definition, label) {
  const failures = [];
  const host = firstObject(observation?.host);
  const origin = firstObject(observation?.origin, host?.origin);
  if (origin?.kind !== "host-observed-native-rpc" || origin?.process_observed !== true || origin?.native_rpc !== true || origin?.process_count !== 1) failures.push(`${label}_host_observed_origin_missing`);
  if (host?.provenance !== CAUSAL_PROVENANCE) failures.push(`${label}_host_provenance_invalid`);
  const expectedName = expectedDispatchName(definition, label === "first" ? "FAIL" : "PASS");
  const records = Array.isArray(observation?.task_records)
    ? observation.task_records.filter((item) => (item?.assignment_id === expectedName || item?.dispatch_assignment_name === expectedName || item?.name === expectedName) && item?.run_id === definition.run_id)
    : [];
  const commandResults = Array.isArray(observation?.command_results) ? observation.command_results : [];
  const starts = commandResults.filter((item) => item?.command_label === definition.command && item?.phase === "start" && item?.nested_event_type === "tool_execution_start");
  const ends = commandResults.filter((item) => item?.command_label === definition.command && item?.phase === "end" && item?.nested_event_type === "tool_execution_end");
  if (!expectedName) failures.push(`${label}_dispatch_name_missing`);
  if (records.length !== 1) failures.push(`${label}_task_record_cardinality_invalid`);
  if (starts.length !== 1) failures.push(`${label}_tool_start_cardinality_invalid`);
  if (ends.length !== 1) failures.push(`${label}_tool_end_cardinality_invalid`);
  const record = records.length === 1 ? records[0] : null;
  const commandStart = starts.length === 1 ? starts[0] : null;
  const commandEnd = ends.length === 1 ? ends[0] : null;
  const dispatch = firstObject(host?.dispatch);
  const dispatchEvent = firstObject(host?.dispatch_event, host?.dispatchEvent);
  const tool = firstObject(host?.tool);
  const root = firstString(host?.actualRoot, host?.actual_root, host?.root_session);
  const dispatchId = firstString(dispatch?.dispatch_id, dispatch?.dispatchId);
  const allocatedId = firstString(dispatch?.allocated_id, dispatch?.allocatedId);
  const jobId = firstString(dispatch?.job_id, dispatch?.jobId);
  const instanceId = firstString(dispatch?.instance_id, dispatch?.instanceId);
  const attempt = firstInteger(dispatch?.attempt);
  const toolStartSequence = firstInteger(tool?.start_sequence, tool?.startSequence);
  const toolEndSequence = firstInteger(tool?.end_sequence, tool?.endSequence);
  const toolStartOrdinal = firstInteger(tool?.start_workflow_ordinal, tool?.startWorkflowOrdinal, tool?.start_host_workflow_ordinal);
  const toolEndOrdinal = firstInteger(tool?.end_workflow_ordinal, tool?.endWorkflowOrdinal, tool?.end_host_workflow_ordinal);
  const dispatchOrdinal = firstInteger(dispatchEvent?.host_workflow_ordinal, dispatchEvent?.hostWorkflowOrdinal);
  if (!dispatchId || !allocatedId || !jobId || !instanceId || !Number.isSafeInteger(attempt) || attempt < 1) failures.push(`${label}_host_dispatch_tuple_missing`);
  if (!tool?.tool_call_id || !tool?.parent_tool_call_id || !Number.isSafeInteger(toolStartSequence) || !Number.isSafeInteger(toolEndSequence) || toolEndSequence < toolStartSequence) failures.push(`${label}_host_tool_tuple_missing`);
  if (!Number.isSafeInteger(toolStartOrdinal) || toolStartOrdinal <= 0 || !Number.isSafeInteger(toolEndOrdinal) || toolEndOrdinal <= toolStartOrdinal || !Number.isSafeInteger(dispatchOrdinal) || dispatchOrdinal <= 0) failures.push(`${label}_host_workflow_ordinal_missing`);
  if (observation?.transport_match !== true) failures.push(`${label}_transport_match_not_observed`);
  if (!terminal.root_session_id || !root || terminal.root_session_id !== root) failures.push(`${label}_host_root_binding_mismatch`);
  if (!host?.root_prompt) failures.push(`${label}_host_prompt_binding_missing`);
  if (observation?.host_observation && host?.host_observation && digest(observation.host_observation) !== digest(host.host_observation)) failures.push(`${label}_original_host_observation_mismatch`);
  if (dispatchId !== terminal.parent_tool_call_id || allocatedId !== terminal.public_id || jobId !== terminal.job_id || instanceId !== terminal.instance_id || attempt !== terminal.attempt) failures.push(`${label}_host_dispatch_terminal_identity_mismatch`);
  if (tool?.tool_call_id !== terminal.tool_call_id || tool?.parent_tool_call_id !== terminal.parent_tool_call_id) failures.push(`${label}_host_tool_terminal_identity_mismatch`);
  if (terminal.stream_start_sequence !== toolStartSequence || terminal.stream_end_sequence !== toolEndSequence) failures.push(`${label}_host_tool_sequence_mismatch`);
  if (terminal.host_workflow_ordinal !== toolEndOrdinal) failures.push(`${label}_host_terminal_ordinal_mismatch`);
  if (commandStart && commandEnd && commandStart.correlation?.tool_call_id !== commandEnd.correlation?.tool_call_id) failures.push(`${label}_host_command_correlation_mismatch`);
  if (record && (record.assignment_id !== expectedName || record.allocated_id !== allocatedId || record.parent_tool_call_id !== dispatchId)) failures.push(`${label}_host_record_dispatch_mismatch`);
  if (commandEnd && (commandEnd.allocated_id && commandEnd.allocated_id !== allocatedId || commandEnd.job_id && commandEnd.job_id !== jobId || commandEnd.instance_id && commandEnd.instance_id !== instanceId)) failures.push(`${label}_host_command_tuple_mismatch`);
  return { ok: failures.length === 0, failures, origin, host };
}


function subjectEvidence(observations, definition) {
  const repair = firstObject(observations?.repair);
  const before = firstObject(repair?.before_hashes);
  const after = firstObject(repair?.after_hashes);
  const subjectBefore = firstString(before?.subject?.sha256);
  const subjectAfter = firstString(after?.subject?.sha256);
  const dependencyBefore = firstString(before?.dependency?.sha256);
  const dependencyAfter = firstString(after?.dependency?.sha256);
  const validatorBefore = firstString(before?.validator?.sha256);
  const validatorAfter = firstString(after?.validator?.sha256);
  const writes = Array.isArray(repair?.writes) ? repair.writes : [];
  const normalizedWrites = writes.map((item) => {
    let writePath = null;
    try {
      writePath = normalizeRelative(item?.path ?? "", "observed repair write path");
    } catch {}
    return {
      path: writePath,
      role: firstString(item?.role),
      role_source: firstString(item?.role_source),
      identity: firstObject(item?.identity),
      index: firstInteger(item?.index),
      phase: firstString(item?.phase),
      event_phase: firstString(item?.event_phase, item?.eventPhase),
      terminal_event: item?.terminal_event === true,
      terminal_error: firstBoolean(item?.terminal_error, item?.terminalError),
      terminal_error_observed: item?.terminal_error_observed === true,
      public_identity: firstString(item?.public_identity, item?.public_id, item?.correlation?.public_identity),
      allocated_id: firstString(item?.allocated_id, item?.allocatedId, item?.correlation?.allocated_id),
      job_id: firstString(item?.job_id, item?.jobId, item?.correlation?.job_id),
      instance_id: firstString(item?.instance_id, item?.instanceId, item?.correlation?.instance_id),
      attempt: firstInteger(item?.attempt, item?.correlation?.attempt),
      session_id: firstString(item?.session_id, item?.sessionId),
      root_session_id: firstString(item?.root_session_id, item?.rootSessionId, item?.actualRoot, item?.actual_root),
      tool_call_id: firstString(item?.tool_call_id, item?.toolCallId, item?.correlation?.tool_call_id),
      parent_tool_call_id: firstString(item?.parent_tool_call_id, item?.parentToolCallId, item?.correlation?.parent_tool_call_id),
      start_sequence: firstInteger(item?.start_sequence, item?.startSequence),
      end_sequence: firstInteger(item?.end_sequence, item?.endSequence, item?.sequence),
      host_workflow_ordinal: firstInteger(item?.host_workflow_ordinal, item?.hostWorkflowOrdinal),
      correlation: firstObject(item?.correlation),
      guard: firstObject(item?.guard),
      before_sha256: firstString(item?.before_sha256),
      after_sha256: firstString(item?.after_sha256),
      observed: item?.observed ?? null,
    };
  });
  const allowed = new Set((definition.write_policy?.allowed_write_globs ?? []).map((item) => normalizeRelative(item, "write allowlist")));
  const outside = normalizedWrites.filter((item) => !item.path || !allowed.has(item.path));
  const exactlySubject = normalizedWrites.length > 0 && normalizedWrites.every((item) => item.path === "app/bin/quality.mjs");
  const strict = strictCausalInput(observations);
  const causalRepair = firstObject(observations?.causal?.repair);
  const causalPhase = firstObject(observations?.causal?.phases?.repair_accepted);
  const writeEnd = firstObject(causalRepair?.write_end);
  const writeBindingValid = !strict || Boolean(writeEnd && causalPhase && normalizedWrites.length > 0 && normalizedWrites.every((item) => {
    const endRoot = firstString(writeEnd.root_session_id, writeEnd.rootSessionId, writeEnd.actualRoot, writeEnd.actual_root);
    const endDispatch = firstObject(writeEnd.domain_ids, writeEnd.domainIds);
    const endAllocated = firstString(endDispatch?.allocated_id, endDispatch?.allocatedId, writeEnd.allocated_id, writeEnd.allocatedId);
    const endJob = firstString(endDispatch?.job_id, endDispatch?.jobId, writeEnd.job_id, writeEnd.jobId);
    const endInstance = firstString(endDispatch?.instance_id, endDispatch?.instanceId, writeEnd.instance_id, writeEnd.instanceId);
    const endAttempt = firstInteger(endDispatch?.attempt, writeEnd.attempt);
    const endTool = firstString(writeEnd.tool_call_id, writeEnd.toolCallId);
    const endParent = firstString(writeEnd.parent_tool_call_id, writeEnd.parentToolCallId);
    const endStart = firstInteger(writeEnd.start_sequence, writeEnd.startSequence);
    const endEnd = firstInteger(writeEnd.end_sequence, writeEnd.endSequence, writeEnd.sequence);
    const endOrdinal = firstInteger(writeEnd.host_workflow_ordinal, writeEnd.hostWorkflowOrdinal);
    return item.root_session_id === firstString(causalPhase.root_session_id, causalPhase.rootSessionId, endRoot)
      && item.root_session_id === endRoot
      && item.public_identity === endAllocated
      && item.allocated_id === endAllocated
      && item.job_id === endJob
      && item.instance_id === endInstance
      && item.attempt === endAttempt
      && item.tool_call_id === endTool
      && item.parent_tool_call_id === endParent
      && item.start_sequence === endStart
      && item.end_sequence === endEnd
      && item.host_workflow_ordinal === endOrdinal;
  }));
  const writeReceiptsObserved = normalizedWrites.length > 0 && normalizedWrites.every((item) => {
    const receiptSucceeded = item.terminal_error_observed === true && item.terminal_error === false;
    const correlationValid = item.correlation?.status === "matched" && item.correlation?.identity_match === true;
    const identityValid = Boolean(item.public_identity && item.allocated_id && item.root_session_id) && item.session_id === null && item.public_identity === item.allocated_id;
    const hashBinding = item.before_sha256 === subjectBefore && item.after_sha256 === subjectAfter;
    const authorityValid = hasNative09WriteAuthority(item, {
      root_session_id: item.root_session_id, parent_tool_call_id: item.parent_tool_call_id,
      allocated_id: item.allocated_id, index: item.index, job_id: item.job_id, instance_id: item.instance_id,
      agent: "backend-developer", agentSource: "project", assignment_id: definition.roles?.backend_repair?.name,
    });
    return authorityValid &&
      item.phase === "backend_repair" &&
      item.event_phase === "end" &&
      item.terminal_event === true &&
      receiptSucceeded &&
      correlationValid &&
      item.guard?.paths_in_allowlist === true &&
      identityValid &&
      hashBinding &&
      writeBindingValid;
  });
  const hashes = [subjectBefore, subjectAfter, dependencyBefore, dependencyAfter, validatorBefore, validatorAfter];
  const preparedBefore = firstObject(definition.mutable_application?.before_hashes);
  const dependencyBeforeMatchesPrepared = dependencyBefore === preparedBefore?.dependency?.sha256;
  const validatorBeforeMatchesPrepared = validatorBefore === preparedBefore?.validator?.sha256;
  const hashesValid = hashes.length === 6 && hashes.every((value) => SHA256.test(value));
  const beforeMatchesOriginal = subjectBefore === definition.immutable_original?.subjects?.cli?.sha256;
  const changed = Boolean(subjectBefore && subjectAfter && subjectBefore !== subjectAfter);
  return {
    before_sha256: subjectBefore,
    after_sha256: subjectAfter,
    dependency_before_sha256: dependencyBefore,
    dependency_after_sha256: dependencyAfter,
    validator_before_sha256: validatorBefore,
    validator_after_sha256: validatorAfter,
    writes: normalizedWrites,
    writes_observed: writeReceiptsObserved,
    writes_within_allowlist: outside.length === 0 && exactlySubject && writeReceiptsObserved,
    write_binding_valid: writeBindingValid,
    outside_writes: outside,
    before_matches_original: beforeMatchesOriginal,
    dependency_before_matches_prepared: dependencyBeforeMatchesPrepared,
    validator_before_matches_prepared: validatorBeforeMatchesPrepared,
    subject_changed: changed,
    immutable_validator_unchanged: Boolean(validatorBefore && validatorAfter && validatorBefore === validatorAfter),
    dependency_unchanged: Boolean(dependencyBefore && dependencyAfter && dependencyBefore === dependencyAfter),
    hashes_valid: hashesValid,
  };
}



function immutableEvidence(observations) {
  const raw = firstObject(observations?.immutable_package);
  const changedPaths = Array.isArray(raw?.changed_paths) ? raw.changed_paths.map((item) => slash(String(item))) : null;
  const manifestVerified = raw?.manifest_verified === true;
  const sourceBefore = firstString(raw?.before_sha256);
  const sourceAfter = firstString(raw?.after_sha256);
  const sourceHashesValid = Boolean(sourceBefore && sourceAfter && SHA256.test(sourceBefore) && SHA256.test(sourceAfter));
  const noChangedPaths = changedPaths === null || changedPaths.length === 0;
  const unchanged = sourceHashesValid && sourceBefore === sourceAfter && noChangedPaths;
  return { manifest_verified: manifestVerified, changed_paths: changedPaths, before_sha256: sourceBefore, after_sha256: sourceAfter, unchanged: Boolean(unchanged), evidence: raw ?? null };
}

function executionEvidence(observations, definition, firstTerminal = null, secondTerminal = null) {
  const raw = firstObject(observations?.execution);
  const projection = firstObject(raw?.projection, raw?.result?.projection);
  const value = firstObject(raw?.value, raw?.result?.value, projection?.value, raw?.result, raw?.projection);
  const resultRunId = firstString(value?.run_id, value?.runId);
  const resultRevision = firstString(value?.revision, value?.source_revision);
  const envelopeOk = raw?.ok === true && Array.isArray(raw.errors) && raw.errors.length === 0;
  const resultBindingsMatch = resultRunId === definition.run_id && resultRevision === definition.revision;
  const complete = value?.complete === true;
  const consumer = firstString(raw?.consumer, raw?.module, value?.consumer, value?.module);
  const status = firstString(raw?.status, value?.status);
  const resumeEvidence = firstObject(raw?.resume_evidence, value?.resume_evidence, projection?.resume_evidence, raw?.result?.resume_evidence);
  const resumeConsumer = firstString(resumeEvidence?.consumer);
  const resumeComplete = resumeEvidence?.complete === true;
  const resumeHistory = Array.isArray(resumeEvidence?.history) ? resumeEvidence.history : null;
  const resumeJobs = Array.isArray(resumeEvidence?.jobs) ? resumeEvidence.jobs : null;
  const resumeSecond = firstObject(resumeEvidence?.second_return, resumeEvidence?.secondReturn);
  const projectionSecond = firstObject(projection?.resume_evidence?.second_return, projection?.resume_evidence?.secondReturn, projection?.second_return, projection?.secondReturn);
  const projectionHistory = Array.isArray(projection?.input?.context?.history) ? projection.input.context.history : [];
  const recordRunId = (item) => firstString(item?.runId, item?.run_id);
  const recordRevision = (item) => firstString(item?.revision, item?.source_revision);
  const recordAssignmentId = (item) => {
    const taskId = firstString(item?.taskId, item?.task_id);
    const assignmentId = firstString(item?.assignment_id, item?.assignmentId);
    if (taskId && assignmentId && taskId !== assignmentId) return null;
    return assignmentId ?? taskId;
  };
  const domainMatches = (item) => recordRunId(item) === definition.run_id && recordRevision(item) === definition.revision;
  const expectedAssignment = (terminal) => firstString(terminal?.assignment_id, definition.assignment_id);
  const assignmentMatches = (item, terminal = null) => domainMatches(item) && recordAssignmentId(item) === expectedAssignment(terminal);
  const tupleMatchesTerminal = (item, terminal, expectedAttempt) => Boolean(
    terminal
      && firstString(terminal.run_id)
      && firstString(terminal.revision)
      && expectedAssignment(terminal)
      && firstString(terminal.job_id)
      && firstString(terminal.instance_id)
      && recordRunId(item) === terminal.run_id
      && recordRevision(item) === terminal.revision
      && recordAssignmentId(item) === expectedAssignment(terminal)
      && firstString(item?.jobId, item?.job_id) === terminal.job_id
      && firstString(item?.instanceId, item?.instance_id) === terminal.instance_id
      && firstInteger(item?.attempt) === expectedAttempt
  );
  const secondIdentityMatchesRecord = (item) => firstInteger(item?.attempt) === 2
    && firstString(item?.jobId, item?.job_id) === secondTerminal?.job_id
    && firstString(item?.instanceId, item?.instance_id) === secondTerminal?.instance_id;
  const firstHistoryTargets = resumeHistory?.filter((item) => tupleMatchesTerminal(item, firstTerminal, 1)) ?? [];
  const historyFirstValid = firstHistoryTargets.length === 1
    && String(firstHistoryTargets[0]?.status ?? "").toUpperCase() === "FAIL";
  const targetHistory = resumeHistory?.filter((item) => assignmentMatches(item, secondTerminal)) ?? [];
  const historySecondCandidates = targetHistory.filter(secondIdentityMatchesRecord);
  const historyIdentityRows = resumeHistory?.filter((item) => domainMatches(item) && secondIdentityMatchesRecord(item)) ?? [];
  const historyIdentityUnique = historyIdentityRows.length === 1 && assignmentMatches(historyIdentityRows[0], secondTerminal);
  const historyBindings = Boolean(resumeHistory && resumeHistory.length >= 2 &&
    historyFirstValid &&
    historyIdentityUnique &&
    historySecondCandidates.length === 1 &&
    String(historySecondCandidates[0]?.status ?? "").toUpperCase() === "PASS");
  const historySecond = historyBindings ? historySecondCandidates[0] : null;
  const actualDigestValues = [
    firstString(projectionSecond?.return_digest, projectionSecond?.returnDigest),
    firstString(resumeSecond?.return_digest, resumeSecond?.returnDigest),
  ];
  const projectedHistoryCandidates = projectionHistory.filter((item) => tupleMatchesTerminal(item, secondTerminal, 2));
  const projectedHistorySecond = projectedHistoryCandidates.length === 1 ? projectedHistoryCandidates[0] : null;
  if (projectedHistorySecond) actualDigestValues.splice(1, 0, firstString(projectedHistorySecond?.returnDigest, projectedHistorySecond?.return_digest));
  const actualDigestValuesPresent = actualDigestValues.filter(Boolean);
  const actualReturnDigest = actualDigestValuesPresent[0] ?? null;
  const actualDigestConsistent = actualDigestValuesPresent.length > 0 && actualDigestValuesPresent.every((item) => item === actualReturnDigest && SHA256.test(item));
  const returnDigest = actualReturnDigest ?? firstString(value?.return_digest, value?.returnDigest, raw?.return_digest, raw?.returnDigest);
  const strict = strictCausalInput(observations);
  const historySecondMatches = Boolean(historySecond &&
    firstString(historySecond?.jobId, historySecond?.job_id) === secondTerminal?.job_id &&
    firstString(historySecond?.instanceId, historySecond?.instance_id) === secondTerminal?.instance_id &&
    firstString(historySecond?.returnDigest, historySecond?.return_digest) === actualReturnDigest);
  const projectedHistoryMatches = projectionHistory.length === 0 || Boolean(
    projectedHistorySecond
      && String(projectedHistorySecond?.status ?? "").toUpperCase() === "PASS"
      && firstString(projectedHistorySecond?.returnDigest, projectedHistorySecond?.return_digest) === actualReturnDigest
  );
  const jobIdentityRows = resumeJobs?.filter((item) => domainMatches(item) && secondIdentityMatchesRecord(item)) ?? [];
  const jobBindings = Boolean(resumeJobs &&
    jobIdentityRows.length === 1 &&
    assignmentMatches(jobIdentityRows[0], secondTerminal) &&
    String(jobIdentityRows[0]?.state ?? "").toUpperCase() === "TERMINAL" &&
    String(jobIdentityRows[0]?.terminalStatus ?? jobIdentityRows[0]?.terminal_status ?? "").toUpperCase() === "PASS");
  const secondIdentityMatches = Boolean(secondTerminal &&
    firstString(resumeSecond?.job_id, resumeSecond?.jobId) === secondTerminal.job_id &&
    firstString(resumeSecond?.instance_id, resumeSecond?.instanceId) === secondTerminal.instance_id &&
    firstInteger(resumeSecond?.attempt) === secondTerminal.attempt);
  const secondReturnBindings = Boolean(resumeSecond &&
    recordRunId(resumeSecond) === definition.run_id &&
    recordRevision(resumeSecond) === definition.revision &&
    recordAssignmentId(resumeSecond) === expectedAssignment(secondTerminal) &&
    secondIdentityMatches &&
    actualDigestConsistent &&
    firstString(resumeSecond.return_digest, resumeSecond.returnDigest) === actualReturnDigest &&
    (!strict || (projection && historySecondMatches)) &&
    projectedHistoryMatches);
  const resumed = Boolean(resumeEvidence && resumeConsumer === "tdd-orchestrator/lib/execution.mjs" && resumeComplete && resumeComplete === complete && historyBindings && jobBindings && secondReturnBindings);
  const acceptedComplete = Boolean(complete && resumed);
  return {
    status,
    complete: acceptedComplete,
    resumed,
    consumer,
    result_run_id: resultRunId,
    result_revision: resultRevision,
    return_digest: returnDigest,
    actual_return_digest: actualReturnDigest,
    envelope_ok: envelopeOk,
    result_bindings_match: resultBindingsMatch,
    resume_evidence: resumeEvidence ?? null,
    resume_consumer: resumeConsumer,
    resume_history_valid: historyBindings && (!strict || historySecondMatches) && projectedHistoryMatches,
    resume_jobs_valid: jobBindings,
    resume_second_return_valid: secondReturnBindings,
    raw: raw ?? null,
    result_observed: Boolean(value),
    valid_consumer: consumer === "tdd-orchestrator/lib/execution.mjs",
  };
}




const CAUSAL_PHASE_REQUIREMENTS = Object.freeze({
  first_terminal_accepted: Object.freeze({ root: true, dispatch: true, tool: true, sequence: true }),
  repair_accepted: Object.freeze({ root: true, dispatch: true, tool: false, sequence: true }),
  second_dispatch: Object.freeze({ root: true, dispatch: true, tool: false, sequence: true, dispatch_receipt: true, host_arrival: true }),
  second_terminal_accepted: Object.freeze({ root: true, dispatch: true, tool: true, sequence: true, bash_ordinals: true }),
  execution_consumed: Object.freeze({ root: false, dispatch: false, tool: false, sequence: false, operation: true }),
});

function causalPhaseLabel(name) {
  return new Set([name, name.replace("_accepted", ""), name.replace("_consumed", "")]);
}

function causalPhase(raw, name, expectedOrdinal, definition, failures, strict = false) {
  const phase = firstObject(raw?.phases?.[name]);
  const requirements = CAUSAL_PHASE_REQUIREMENTS[name];
  if (!phase) {
    failures.push(`causal_${name}_missing`);
    return null;
  }
  const ordinal = firstInteger(phase.ordinal);
  const label = firstString(phase.label, phase.phase);
  const logicalRunId = firstString(phase.logical_run_id, phase.logicalRunId);
  const assignmentId = firstString(phase.assignment_id, phase.assignmentId);
  const revision = firstString(phase.revision, phase.source_revision);
  const phaseRoot = firstString(phase.root_session_id, phase.rootSessionId);
  const rootPrompt = firstString(phase.root_prompt, phase.rootPrompt, phase.root_prompt_sha256, phase.root_prompt_hash);
  const sessionId = firstString(phase.session_id, phase.sessionId);
  const dispatch = firstObject(phase.dispatch);
  const dispatchId = firstString(dispatch?.dispatch_id, dispatch?.dispatchId);
  const allocatedId = firstString(dispatch?.allocated_id, dispatch?.allocatedId, dispatch?.agent_id, dispatch?.agentId);
  const jobId = firstString(dispatch?.job_id, dispatch?.jobId);
  const instanceId = firstString(dispatch?.instance_id, dispatch?.instanceId);
  const attempt = firstInteger(dispatch?.attempt, phase.attempt);
  const tool = firstObject(phase.tool, phase.tool_event);
  const toolCallId = firstString(tool?.tool_call_id, tool?.toolCallId);
  const parentToolCallId = firstString(tool?.parent_tool_call_id, tool?.parentToolCallId);
  const sequence = firstObject(phase.sequence, phase.host_sequence);
  const startSequence = firstInteger(sequence?.start, sequence?.start_sequence, phase.start_sequence);
  const endSequence = firstInteger(sequence?.end, sequence?.end_sequence, phase.end_sequence);
  const toolStartSequence = firstInteger(tool?.start_sequence, tool?.startSequence);
  const toolEndSequence = firstInteger(tool?.end_sequence, tool?.endSequence);
  const dispatchReceipt = firstObject(phase.dispatch_receipt, phase.dispatchReceipt);
  const dispatchReceiptId = firstString(dispatchReceipt?.receipt_id, dispatchReceipt?.receiptId, dispatchReceipt?.id);
  const dispatchReceiptAccepted = dispatchReceipt?.accepted === true || ["ACCEPTED", "STARTED", "DISPATCHED"].includes(String(dispatchReceipt?.status ?? "").toUpperCase());
  const hostWorkflowOrdinal = firstInteger(phase.host_workflow_ordinal, phase.hostWorkflowOrdinal);
  const hostArrivalOrdinal = firstInteger(phase.host_arrival_ordinal, phase.hostArrivalOrdinal);
  const hostBashStartOrdinal = firstInteger(phase.host_bash_start_ordinal, phase.hostBashStartOrdinal);
  const hostBashEndOrdinal = firstInteger(phase.host_bash_end_ordinal, phase.hostBashEndOrdinal);
  const operation = firstString(phase.operation);
  if (ordinal !== expectedOrdinal) failures.push(`causal_${name}_ordinal_invalid`);
  if (!causalPhaseLabel(name).has(label)) failures.push(`causal_${name}_label_invalid`);
  if (logicalRunId !== definition.run_id) failures.push(`causal_${name}_run_binding_mismatch`);
  if (assignmentId !== definition.assignment_id) failures.push(`causal_${name}_assignment_binding_mismatch`);
  if (revision !== definition.revision) failures.push(`causal_${name}_revision_binding_mismatch`);
  if (requirements.root && !phaseRoot) failures.push(`causal_${name}_root_session_missing`);
  if (requirements.root && !rootPrompt) failures.push(`causal_${name}_root_prompt_missing`);
  if (sessionId !== null) failures.push(`causal_${name}_unexposed_child_session_claimed`);
  if (requirements.dispatch) {
    if (strict && (!dispatchId || !allocatedId || !jobId || !instanceId || !Number.isSafeInteger(attempt) || attempt < 1)) failures.push(`causal_${name}_dispatch_tuple_incomplete`);
    else if (!dispatchId && !allocatedId) failures.push(`causal_${name}_dispatch_identity_missing`);
    if (!jobId || !instanceId) failures.push(`causal_${name}_dispatch_public_identity_missing`);
  }
  if (requirements.tool && (!toolCallId || !parentToolCallId)) failures.push(`causal_${name}_tool_parent_missing`);
  if (requirements.tool && !toolCallId) failures.push(`causal_${name}_tool_call_id_missing`);
  if (requirements.sequence && (!Number.isSafeInteger(startSequence) || !Number.isSafeInteger(endSequence) || startSequence < 0 || endSequence < startSequence)) failures.push(`causal_${name}_host_sequence_invalid`);
  if (requirements.tool && (!Number.isSafeInteger(toolStartSequence) || !Number.isSafeInteger(toolEndSequence) || toolStartSequence < 0 || toolEndSequence < toolStartSequence)) failures.push(`causal_${name}_tool_sequence_invalid`);
  if (requirements.dispatch_receipt && !dispatchReceiptAccepted) failures.push(`causal_${name}_dispatch_receipt_missing_or_unaccepted`);
  if (requirements.dispatch_receipt && !dispatchReceiptId) failures.push(`causal_${name}_dispatch_receipt_id_missing`);
  if (requirements.host_arrival && (!Number.isSafeInteger(hostArrivalOrdinal) || hostArrivalOrdinal < 0)) failures.push(`causal_${name}_host_arrival_ordinal_invalid`);
  if (requirements.bash_ordinals && (!Number.isSafeInteger(hostBashStartOrdinal) || !Number.isSafeInteger(hostBashEndOrdinal) || hostBashStartOrdinal < 0 || hostBashEndOrdinal <= hostBashStartOrdinal)) failures.push(`causal_${name}_host_bash_ordinal_invalid`);
  if (requirements.bash_ordinals && dispatchReceiptAccepted && Number.isSafeInteger(hostArrivalOrdinal) && Number.isSafeInteger(hostBashStartOrdinal) && hostArrivalOrdinal >= hostBashStartOrdinal) failures.push(`causal_${name}_dispatch_not_before_bash_start`);
  if (name === "second_dispatch" && toolCallId) failures.push(`causal_${name}_tool_tuple_forbidden`);
  if (strict && (!Number.isSafeInteger(hostWorkflowOrdinal) || hostWorkflowOrdinal <= 0)) failures.push(`causal_${name}_host_workflow_ordinal_invalid`);
  if (requirements.operation && !operation) failures.push(`causal_${name}_operation_missing`);
  return { phase, ordinal, label, logical_run_id: logicalRunId, assignment_id: assignmentId, revision, root_session_id: phaseRoot, root_prompt: rootPrompt, session_id: sessionId, dispatch, dispatch_id: dispatchId, allocated_id: allocatedId, job_id: jobId, instance_id: instanceId, attempt, tool, tool_call_id: toolCallId, parent_tool_call_id: parentToolCallId, sequence_start: startSequence, sequence_end: endSequence, tool_start_sequence: toolStartSequence, tool_end_sequence: toolEndSequence, dispatch_receipt: dispatchReceipt, dispatch_receipt_id: dispatchReceiptId, dispatch_receipt_accepted: dispatchReceiptAccepted, host_workflow_ordinal: hostWorkflowOrdinal, host_arrival_ordinal: hostArrivalOrdinal, host_bash_start_ordinal: hostBashStartOrdinal, host_bash_end_ordinal: hostBashEndOrdinal, operation };
}


function causalCapture(raw, name, phase, definition, failures, strict = false) {
  const capture = firstObject(raw?.[name]);
  if (!capture) {
    failures.push(`causal_${name}_capture_missing`);
    return null;
  }
  const label = firstString(capture.label, capture.phase);
  const logicalRunId = firstString(capture.logical_run_id, capture.logicalRunId);
  const assignmentId = firstString(capture.assignment_id, capture.assignmentId);
  const revision = firstString(capture.revision, capture.source_revision);
  const captureRoot = firstString(capture.root_session_id, capture.rootSessionId);
  const rootPrompt = firstString(capture.root_prompt, capture.rootPrompt, capture.root_prompt_sha256, capture.root_prompt_hash);
  const sessionId = firstString(capture.session_id, capture.sessionId);
  const dispatch = firstObject(capture.dispatch);
  const dispatchId = firstString(dispatch?.dispatch_id, dispatch?.dispatchId);
  const allocatedId = firstString(dispatch?.allocated_id, dispatch?.allocatedId, dispatch?.agent_id, dispatch?.agentId);
  const jobId = firstString(dispatch?.job_id, dispatch?.jobId);
  const instanceId = firstString(dispatch?.instance_id, dispatch?.instanceId);
  const attempt = firstInteger(dispatch?.attempt, capture.attempt);
  const tool = firstObject(capture.tool, capture.tool_event);
  const toolCallId = firstString(tool?.tool_call_id, tool?.toolCallId);
  const parentToolCallId = firstString(tool?.parent_tool_call_id, tool?.parentToolCallId);
  const sequence = firstObject(capture.sequence, capture.host_sequence);
  const startSequence = firstInteger(sequence?.start, sequence?.start_sequence, capture.start_sequence);
  const endSequence = firstInteger(sequence?.end, sequence?.end_sequence, capture.end_sequence);
  const dispatchReceipt = firstObject(capture.dispatch_receipt, capture.dispatchReceipt);
  const dispatchReceiptId = firstString(dispatchReceipt?.receipt_id, dispatchReceipt?.receiptId, dispatchReceipt?.id);
  const dispatchReceiptAccepted = dispatchReceipt?.accepted === true || ["ACCEPTED", "STARTED", "DISPATCHED"].includes(String(dispatchReceipt?.status ?? "").toUpperCase());
  const hostWorkflowOrdinal = firstInteger(capture.host_workflow_ordinal, capture.hostWorkflowOrdinal);
  const hostArrivalOrdinal = firstInteger(capture.host_arrival_ordinal, capture.hostArrivalOrdinal);
  const hostBashStartOrdinal = firstInteger(capture.host_bash_start_ordinal, capture.hostBashStartOrdinal);
  const hostBashEndOrdinal = firstInteger(capture.host_bash_end_ordinal, capture.hostBashEndOrdinal);
  const operation = firstString(capture.operation);
  const expectedName = name === "first_terminal" ? "first_terminal_accepted" : name === "repair" ? "repair_accepted" : name === "second_dispatch" ? "second_dispatch" : name === "second_terminal" ? "second_terminal_accepted" : "execution_consumed";
  const requirements = CAUSAL_PHASE_REQUIREMENTS[expectedName];
  if (!causalPhaseLabel(expectedName).has(label)) failures.push(`causal_${name}_capture_label_invalid`);
  if (logicalRunId !== definition.run_id) failures.push(`causal_${name}_capture_run_binding_mismatch`);
  if (assignmentId !== phase?.assignment_id) failures.push(`causal_${name}_capture_assignment_binding_mismatch`);
  if (revision !== phase?.revision) failures.push(`causal_${name}_capture_revision_binding_mismatch`);
  if (requirements.root && captureRoot !== phase?.root_session_id) failures.push(`causal_${name}_capture_root_binding_mismatch`);
  if (requirements.root && rootPrompt !== phase?.root_prompt) failures.push(`causal_${name}_capture_prompt_binding_mismatch`);
  if (sessionId !== null) failures.push(`causal_${name}_capture_unexposed_child_session_claimed`);
  if (requirements.dispatch) {
    if (strict && (!dispatchId || !allocatedId || !jobId || !instanceId || !Number.isSafeInteger(attempt) || attempt < 1)) failures.push(`causal_${name}_capture_dispatch_tuple_incomplete`);
    else if (!dispatchId && !allocatedId) failures.push(`causal_${name}_capture_dispatch_identity_missing`);
    if (phase?.dispatch_id && dispatchId !== phase.dispatch_id) failures.push(`causal_${name}_capture_dispatch_identity_mismatch`);
    if (phase?.allocated_id && allocatedId !== phase.allocated_id) failures.push(`causal_${name}_capture_allocated_identity_mismatch`);
    if (phase?.job_id && jobId !== phase.job_id) failures.push(`causal_${name}_capture_job_identity_mismatch`);
    if (phase?.instance_id && instanceId !== phase.instance_id) failures.push(`causal_${name}_capture_instance_identity_mismatch`);
    if (strict && attempt !== phase?.attempt) failures.push(`causal_${name}_capture_attempt_identity_mismatch`);
  }
  if (requirements.tool) {
    if (!toolCallId || !parentToolCallId) failures.push(`causal_${name}_capture_tool_parent_missing`);
    if (toolCallId !== phase?.tool_call_id) failures.push(`causal_${name}_capture_tool_identity_mismatch`);
    if (phase?.parent_tool_call_id && parentToolCallId !== phase.parent_tool_call_id) failures.push(`causal_${name}_capture_parent_tool_identity_mismatch`);
  }
  if (requirements.sequence && (startSequence !== phase?.sequence_start || endSequence !== phase?.sequence_end)) failures.push(`causal_${name}_capture_sequence_mismatch`);
  if (strict && (!Number.isSafeInteger(hostWorkflowOrdinal) || hostWorkflowOrdinal <= 0 || hostWorkflowOrdinal !== phase?.host_workflow_ordinal)) failures.push(`causal_${name}_capture_host_workflow_ordinal_mismatch`);
  if (requirements.dispatch_receipt && !dispatchReceiptAccepted) failures.push(`causal_${name}_capture_dispatch_receipt_missing_or_unaccepted`);
  if (requirements.dispatch_receipt && (!dispatchReceiptId || dispatchReceiptId !== phase?.dispatch_receipt_id)) failures.push(`causal_${name}_capture_dispatch_receipt_id_mismatch`);
  if (requirements.host_arrival && (hostArrivalOrdinal !== phase?.host_arrival_ordinal || !Number.isSafeInteger(hostArrivalOrdinal) || hostArrivalOrdinal < 0)) failures.push(`causal_${name}_capture_host_arrival_ordinal_mismatch`);
  if (requirements.bash_ordinals && (hostBashStartOrdinal !== phase?.host_bash_start_ordinal || hostBashEndOrdinal !== phase?.host_bash_end_ordinal || !Number.isSafeInteger(hostBashStartOrdinal) || !Number.isSafeInteger(hostBashEndOrdinal) || hostBashEndOrdinal <= hostBashStartOrdinal)) failures.push(`causal_${name}_capture_host_bash_ordinal_mismatch`);
  if (requirements.dispatch_receipt && dispatchReceiptAccepted && phase?.dispatch_receipt_accepted !== true) failures.push(`causal_${name}_phase_dispatch_receipt_not_accepted`);
  if (name === "second_dispatch" && toolCallId) failures.push(`causal_${name}_capture_tool_tuple_forbidden`);
  if (requirements.operation && operation !== phase?.operation) failures.push(`causal_${name}_capture_operation_mismatch`);
  return { capture, logical_run_id: logicalRunId, assignment_id: assignmentId, revision, root_session_id: captureRoot, root_prompt: rootPrompt, session_id: sessionId, dispatch, dispatch_id: dispatchId, allocated_id: allocatedId, job_id: jobId, instance_id: instanceId, attempt, tool, tool_call_id: toolCallId, parent_tool_call_id: parentToolCallId, sequence_start: startSequence, sequence_end: endSequence, host_workflow_ordinal: hostWorkflowOrdinal, dispatch_receipt: dispatchReceipt, dispatch_receipt_id: dispatchReceiptId, dispatch_receipt_accepted: dispatchReceiptAccepted, host_arrival_ordinal: hostArrivalOrdinal, host_bash_start_ordinal: hostBashStartOrdinal, host_bash_end_ordinal: hostBashEndOrdinal, operation };
}




function causalEvidence(observations, definition, first, second, repair, execution) {
  const raw = firstObject(observations?.causal);
  const failures = [];
  if (!raw) return { ok: false, failures: ["causal_envelope_missing"], provenance: null, phase_ordinals: null };
  if (raw.provenance !== CAUSAL_PROVENANCE) failures.push("causal_provenance_invalid");
  const strict = strictCausalInput(observations);
  const hostWorkflowId = firstString(raw.host_workflow_id, raw.hostWorkflowId);
  if (strict && hostWorkflowId !== `${definition.run_id}:${definition.assignment_id}`) failures.push("causal_host_workflow_id_mismatch");
  if (!strict && raw.host_workflow_id !== undefined && !hostWorkflowId) failures.push("causal_host_workflow_invalid");
  const phases = {};
  for (let index = 0; index < CAUSAL_PHASES.length; index += 1) phases[CAUSAL_PHASES[index]] = causalPhase(raw, CAUSAL_PHASES[index], index + 1, definition, failures, strict);
  const ordinals = CAUSAL_PHASES.map((name) => phases[name]?.ordinal ?? null);
  if (ordinals.some((value, index) => value !== index + 1)) failures.push("causal_phase_order_invalid");
  for (let index = 1; index < CAUSAL_PHASES.length; index += 1) {
    const previous = phases[CAUSAL_PHASES[index - 1]];
    const current = phases[CAUSAL_PHASES[index]];
    if (previous?.root_session_id && current?.root_session_id && previous.root_session_id === current.root_session_id && Number.isSafeInteger(previous.sequence_end) && Number.isSafeInteger(current.sequence_start) && current.sequence_start <= previous.sequence_end) failures.push("causal_same_root_session_sequence_reordered");
  }
  const firstCapture = causalCapture(raw, "first_terminal", phases.first_terminal_accepted, definition, failures, strict);
  const repairCapture = causalCapture(raw, "repair", phases.repair_accepted, definition, failures, strict);
  const secondDispatchCapture = causalCapture(raw, "second_dispatch", phases.second_dispatch, definition, failures, strict);
  const secondCapture = causalCapture(raw, "second_terminal", phases.second_terminal_accepted, definition, failures, strict);
  const executionCapture = causalCapture(raw, "execution", phases.execution_consumed, definition, failures, strict);
  for (const [label, capture, terminal, phase] of [["first_terminal", firstCapture, first, phases.first_terminal_accepted], ["second_terminal", secondCapture, second, phases.second_terminal_accepted]]) {
    if (!capture || !terminal) continue;
    if (terminal.session_id !== null || capture.session_id !== null) failures.push(`causal_${label}_unexposed_child_session_claimed`);
    if (!terminal.root_session_id || terminal.root_session_id !== capture.root_session_id) failures.push(`causal_${label}_terminal_root_mismatch`);
    if (terminal.assignment_id !== definition.assignment_id || capture.assignment_id !== phase?.assignment_id) failures.push(`causal_${label}_terminal_assignment_mismatch`);
    if (terminal.run_id !== definition.run_id || capture.logical_run_id !== phase?.logical_run_id) failures.push(`causal_${label}_terminal_run_mismatch`);
    if (terminal.revision !== definition.revision || capture.revision !== phase?.revision) failures.push(`causal_${label}_terminal_revision_mismatch`);
    if (!Number.isSafeInteger(terminal.attempt) || terminal.attempt !== phase?.attempt || capture.attempt !== phase?.attempt) failures.push(`causal_${label}_terminal_attempt_mismatch`);
    if (!terminal.job_id || !terminal.instance_id || capture.job_id !== terminal.job_id || capture.instance_id !== terminal.instance_id) failures.push(`causal_${label}_terminal_identity_mismatch`);
    if (!terminal.tool_call_id || capture.tool_call_id !== terminal.tool_call_id) failures.push(`causal_${label}_terminal_tool_identity_mismatch`);
    if (phase?.parent_tool_call_id && (!terminal.parent_tool_call_id || capture.parent_tool_call_id !== terminal.parent_tool_call_id || terminal.parent_tool_call_id !== phase.parent_tool_call_id)) failures.push(`causal_${label}_terminal_parent_tool_identity_mismatch`);
    if (!Number.isSafeInteger(terminal.stream_start_sequence) || !Number.isSafeInteger(terminal.stream_end_sequence) || terminal.stream_start_sequence !== phase?.sequence_start || terminal.stream_end_sequence !== phase?.sequence_end) failures.push(`causal_${label}_terminal_stream_sequence_mismatch`);
    if (phase?.root_session_id && terminal.root_session_id !== phase.root_session_id) failures.push(`causal_${label}_phase_root_mismatch`);
    if (strict && terminal.dispatch_id && terminal.dispatch_id !== phase?.dispatch_id) failures.push(`causal_${label}_terminal_dispatch_identity_mismatch`);
    if (strict && terminal.public_id !== phase?.allocated_id) failures.push(`causal_${label}_terminal_allocated_identity_mismatch`);
    if (strict && (!Number.isSafeInteger(terminal.host_workflow_ordinal) || terminal.host_workflow_ordinal !== phase?.host_workflow_ordinal || terminal.host_workflow_ordinal !== capture?.host_workflow_ordinal)) failures.push(`causal_${label}_terminal_host_workflow_ordinal_mismatch`);
  }
  const secondDispatch = phases.second_dispatch;
  const secondTerminalPhase = phases.second_terminal_accepted;
  if (!secondDispatch || !secondDispatchCapture) failures.push("causal_second_dispatch_receipt_missing");
  if (secondDispatch && secondTerminalPhase) {
    if (secondDispatch.root_session_id !== secondTerminalPhase.root_session_id || secondDispatch.session_id !== secondTerminalPhase.session_id) failures.push("causal_second_dispatch_root_binding_mismatch");
    for (const field of ["dispatch_id", "allocated_id", "job_id", "instance_id", "attempt"]) {
      if (secondDispatch[field] !== secondTerminalPhase[field]) failures.push(`causal_second_dispatch_${field}_mismatch`);
    }
    if (Number.isSafeInteger(secondDispatch.host_arrival_ordinal) && Number.isSafeInteger(secondTerminalPhase.host_bash_start_ordinal) && secondDispatch.host_arrival_ordinal >= secondTerminalPhase.host_bash_start_ordinal) failures.push("causal_second_dispatch_not_before_bash_start");
    if (Number.isSafeInteger(secondTerminalPhase.host_bash_start_ordinal) && Number.isSafeInteger(secondTerminalPhase.host_bash_end_ordinal) && secondTerminalPhase.host_bash_start_ordinal >= secondTerminalPhase.host_bash_end_ordinal) failures.push("causal_second_bash_start_not_before_end");
  }
  const causalRepair = firstObject(raw.repair);
  const writeEnd = firstObject(causalRepair?.write_end);
  if (!writeEnd) failures.push("causal_repair_write_end_missing");
  else {
    const writeSuccess = writeEnd.success === true || writeEnd.ok === true || ["PASS", "SUCCESS", "SUCCEEDED", "COMPLETED"].includes(String(writeEnd.status ?? "").toUpperCase());
    const domainIds = firstObject(writeEnd.domain_ids, writeEnd.domainIds);
    if (writeEnd.path !== "app/bin/quality.mjs") failures.push("causal_repair_write_path_invalid");
    if (!writeSuccess) failures.push("causal_repair_write_not_successful");
    if (writeEnd.session_id !== phases.repair_accepted?.session_id) failures.push("causal_repair_write_session_mismatch");
    if (firstString(writeEnd.root_session_id, writeEnd.rootSessionId, writeEnd.actualRoot, writeEnd.actual_root) !== phases.repair_accepted?.root_session_id) failures.push("causal_repair_write_root_mismatch");
    if (!domainIds) failures.push("causal_repair_write_domain_ids_missing");
    else {
      for (const field of ["dispatch_id", "allocated_id", "job_id", "instance_id", "attempt"]) {
        if (phases.repair_accepted?.[field] !== undefined && phases.repair_accepted?.[field] !== null && domainIds[field] !== phases.repair_accepted[field]) failures.push(`causal_repair_write_domain_${field}_mismatch`);
      }
      if (!domainIds.job_id || !domainIds.instance_id || !Number.isSafeInteger(firstInteger(domainIds.attempt))) failures.push("causal_repair_write_domain_public_identity_missing");
    }
    if (strict) {
      const writeRoot = firstString(writeEnd.root_session_id, writeEnd.rootSessionId, writeEnd.actualRoot, writeEnd.actual_root);
      const writeTool = firstString(writeEnd.tool_call_id, writeEnd.toolCallId);
      const writeParent = firstString(writeEnd.parent_tool_call_id, writeEnd.parentToolCallId);
      const writeStart = firstInteger(writeEnd.start_sequence, writeEnd.startSequence);
      const writeEndSequence = firstInteger(writeEnd.end_sequence, writeEnd.endSequence, writeEnd.sequence);
      const writeOrdinal = firstInteger(writeEnd.host_workflow_ordinal, writeEnd.hostWorkflowOrdinal);
      if (writeRoot !== phases.repair_accepted?.root_session_id) failures.push("causal_repair_write_actual_root_mismatch");
      if (!writeTool || !writeParent || writeParent !== phases.repair_accepted?.dispatch_id) failures.push("causal_repair_write_tool_parent_mismatch");
      if (!Number.isSafeInteger(writeStart) || !Number.isSafeInteger(writeEndSequence) || writeEndSequence < writeStart) failures.push("causal_repair_write_sequence_missing");
      if (!Number.isSafeInteger(writeOrdinal) || writeOrdinal <= 0) failures.push("causal_repair_write_workflow_ordinal_missing");
    }
  }
  const causalBefore = firstObject(causalRepair?.before_hashes);
  const causalAfter = firstObject(causalRepair?.after_hashes);
  if (causalBefore?.subject?.sha256 !== repair.before_sha256 || causalAfter?.subject?.sha256 !== repair.after_sha256) failures.push("causal_repair_subject_hash_binding_mismatch");
  if (causalBefore?.dependency?.sha256 !== repair.dependency_before_sha256 || causalAfter?.dependency?.sha256 !== repair.dependency_after_sha256) failures.push("causal_repair_dependency_hash_binding_mismatch");
  if (causalBefore?.validator?.sha256 !== repair.validator_before_sha256 || causalAfter?.validator?.sha256 !== repair.validator_after_sha256) failures.push("causal_repair_validator_hash_binding_mismatch");
  const consumed = firstObject(raw.execution?.consumed_second);
  const consumedDigest = firstString(consumed?.return_digest, consumed?.returnDigest);
  if (!consumed) failures.push("causal_execution_consumed_second_missing");
  else {
    if (consumed.run_id !== definition.run_id || consumed.assignment_id !== definition.assignment_id || consumed.revision !== definition.revision) failures.push("causal_execution_binding_mismatch");
    if (consumed.job_id !== second.job_id || consumed.instance_id !== second.instance_id || consumed.attempt !== second.attempt) failures.push("causal_execution_second_identity_mismatch");
    if (!SHA256.test(consumedDigest ?? "")) failures.push("causal_execution_return_digest_invalid");
    if (strict && (!execution.actual_return_digest || consumedDigest !== execution.actual_return_digest)) failures.push("causal_execution_return_digest_not_actual");
    if (execution.actual_return_digest && consumedDigest !== execution.actual_return_digest) failures.push("causal_execution_return_digest_mismatch");
  }
  if (strict) {
    const workflowOrdinals = [
      first?.host_workflow_ordinal,
      firstObject(causalRepair?.write_end)?.host_workflow_ordinal,
      phases.second_dispatch?.host_workflow_ordinal,
      second?.host_workflow_ordinal,
      phases.execution_consumed?.host_workflow_ordinal,
    ];
    if (workflowOrdinals.some((value) => !Number.isSafeInteger(value) || value <= 0) || workflowOrdinals.some((value, index) => index > 0 && value <= workflowOrdinals[index - 1])) failures.push("causal_host_workflow_chronology_invalid");
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)], provenance: raw.provenance, host_workflow_id: hostWorkflowId, phase_ordinals: ordinals, phase_attempts: Object.fromEntries(CAUSAL_PHASES.map((name) => [name, phases[name]?.attempt ?? null])), capture_attempts: { first_terminal: firstCapture?.attempt ?? null, repair: repairCapture?.attempt ?? null, second_dispatch: secondDispatchCapture?.attempt ?? null, second_terminal: secondCapture?.attempt ?? null }, phase_roots: Object.fromEntries(CAUSAL_PHASES.map((name) => [name, phases[name]?.root_session_id ?? null])), first_terminal: firstCapture, repair: repairCapture, second_dispatch: secondDispatchCapture, second_terminal: secondCapture, execution: executionCapture };
}



function strictCausalInput(observations) {
  if (observations?.native === true) return true;
  if (observations?.native !== false) return false;
  const first = firstObject(observations.first, observations.failure, observations.first_attempt);
  const causalFirst = firstObject(observations?.causal?.phases?.first_terminal_accepted);
  return first?.source_derived === true
    || first?.origin?.kind === "source-derived-host-observer"
    || first?.origin?.source_binding === true
    || first?.evidence_level === "SOURCE_DERIVED_HOST_ADAPTER"
    || first?.host?.provenance === CAUSAL_PROVENANCE
    || Number.isSafeInteger(causalFirst?.host_workflow_ordinal);
}

function offlineCausalSmoke(definition) {
  const phase = (label, ordinal, rootSessionId, rootPrompt, dispatch, tool, sequence, operation, extra = {}) => {
    const value = { native: false, label, ordinal, logical_run_id: definition.run_id, assignment_id: definition.assignment_id, revision: definition.revision, ...extra };
    if (rootSessionId) value.root_session_id = rootSessionId;
    if (rootPrompt) value.root_prompt = rootPrompt;
    value.session_id = null;
    if (dispatch) value.dispatch = dispatch;
    if (tool) value.tool = tool;
    if (sequence) value.sequence = sequence;
    if (operation) value.operation = operation;
    return value;
  };
  const capture = (label, phaseValue, observed = null) => {
    const value = { native: false, label, logical_run_id: definition.run_id, assignment_id: definition.assignment_id, revision: definition.revision };
    const observedSource = firstObject(observed?.raw, observed);
    const observedHost = firstObject(observedSource?.host);
    const observedDispatch = firstObject(observedHost?.dispatch, observedSource?.dispatch);
    const observedDispatchEvent = firstObject(observedHost?.dispatch_event, observedHost?.dispatchEvent, observedSource?.dispatch_event, observedSource?.dispatchEvent);
    const observedTool = firstObject(observedHost?.tool, observedSource?.tool);
    const observedWorkflowOrdinal = firstInteger(observedSource?.host_workflow_ordinal, observedHost?.host_workflow_ordinal);
    if (phaseValue.root_session_id) {
      value.root_session_id = phaseValue.root_session_id;
      value.root_prompt = phaseValue.root_prompt;
    }
    value.session_id = null;
    if (Number.isSafeInteger(observedWorkflowOrdinal)) value.host_workflow_ordinal = observedWorkflowOrdinal;
    else if (Number.isSafeInteger(phaseValue.host_workflow_ordinal)) value.host_workflow_ordinal = phaseValue.host_workflow_ordinal;
    if (phaseValue.dispatch) value.dispatch = { ...phaseValue.dispatch, ...(observedDispatch ?? {}) };
    if (phaseValue.dispatch_event) value.dispatch_event = { ...phaseValue.dispatch_event, ...(observedDispatchEvent ?? {}) };
    if (phaseValue.tool) {
      value.tool = {
        ...phaseValue.tool,
        ...(observedTool ?? {}),
        tool_call_id: phaseValue.tool.tool_call_id,
        parent_tool_call_id: phaseValue.tool.parent_tool_call_id,
      };
    }
    if (phaseValue.sequence) value.sequence = { ...phaseValue.sequence };
    if (phaseValue.dispatch_receipt) value.dispatch_receipt = { ...phaseValue.dispatch_receipt };
    if (Number.isSafeInteger(phaseValue.host_arrival_ordinal)) value.host_arrival_ordinal = phaseValue.host_arrival_ordinal;
    if (Number.isSafeInteger(phaseValue.host_bash_start_ordinal)) value.host_bash_start_ordinal = phaseValue.host_bash_start_ordinal;
    if (Number.isSafeInteger(phaseValue.host_bash_end_ordinal)) value.host_bash_end_ordinal = phaseValue.host_bash_end_ordinal;
    if (phaseValue.operation) value.operation = phaseValue.operation;
    return value;
  };
  const report = (status) => ({
    native: false,
    nonce: definition.nonce,
    assignment_id: definition.assignment_id,
    revision: definition.revision,
    run_id: definition.run_id,
    workload: { run_id: definition.run_id, source: definition.workload.source, revision: definition.revision, test: definition.workload.test },
    status,
    failure_origin: status === "FAIL" ? "SOLUTION" : undefined,
    actual: status === "FAIL" ? {} : undefined,
    expected: status === "FAIL" ? {} : undefined,
  });
  const terminal = (status, attempt, rootSessionId, jobId, instanceId, toolCallId, startSequence, hostWorkflowOrdinal, dispatchEventOrdinal, dispatchId, allocatedId, dispatchName) => {
    const parentToolCallId = dispatchId;
    const endSequence = Number.isSafeInteger(startSequence) ? startSequence + 2 : null;
    const dispatch = { dispatch_id: dispatchId, allocated_id: allocatedId, job_id: jobId, instance_id: instanceId, attempt };
    const tool = {
      tool_call_id: toolCallId,
      parent_tool_call_id: parentToolCallId,
      start_sequence: startSequence,
      end_sequence: endSequence,
      start_workflow_ordinal: hostWorkflowOrdinal - 1,
      end_workflow_ordinal: hostWorkflowOrdinal,
    };
    const raw = {
      native: false,
      event_type: "tool_execution_end",
      isError: status === "FAIL",
      is_error_source: "tool_execution_end",
      exit_code: status === "FAIL" ? FAILURE_EXIT_CODE : null,
      exit_code_observed: status === "FAIL",
      assignment_id: definition.assignment_id,
      dispatch_assignment_name: dispatchName,
      dispatch_id: dispatchId,
      allocated_id: allocatedId,
      public_id: allocatedId,
      run_id: definition.run_id,
      revision: definition.revision,
      root_session_id: rootSessionId,
      root_prompt: `${rootSessionId.replace(/-root$/, "")}-prompt`,
      session_id: null,
      job_id: jobId,
      instance_id: instanceId,
      tool_call_id: toolCallId,
      attempt,
      parent_tool_call_id: parentToolCallId,
      start_sequence: startSequence,
      sequence: endSequence,
      host_workflow_ordinal: hostWorkflowOrdinal,
      transport_match: true,
      host: {
        native: false,
        provenance: CAUSAL_PROVENANCE,
        root_session: rootSessionId,
        root_prompt: `${rootSessionId.replace(/-root$/, "")}-prompt`,
        dispatch,
        dispatch_event: { host_workflow_ordinal: dispatchEventOrdinal },
        tool,
      },
      command: { command: definition.command },
      correlation: { status: "matched" },
      observed: { present: true },
      report: report(status),
    };
    const normalized = normalizeTerminal(raw);
    normalized.native = false;
    normalized.dispatch_id = dispatchId;
    normalized.allocated_id = allocatedId;
    normalized.host_workflow_ordinal = hostWorkflowOrdinal;
    return normalized;
  };
  const first = terminal("FAIL", 1, "offline-first-root", "offline-first-job", "offline-first-instance", "offline-first-tool", 10, 3, 1, "offline-first-dispatch", "offline-first-dispatch-allocated", definition.roles.first_validator.name);
  const second = terminal("PASS", 2, "offline-second-root", "offline-second-job", "offline-second-instance", "offline-second-tool", 40, 8, 6, "offline-second-dispatch", "offline-second-dispatch-allocated", definition.roles.second_validator.name);
  const before = definition.mutable_application.before_hashes;
  const after = { subject: { sha256: "a".repeat(64) }, dependency: { sha256: before.dependency.sha256 }, validator: { sha256: before.validator.sha256 } };
  const repairObservation = {
    repair: {
      native: false,
      before_hashes: before,
      after_hashes: after,
      writes: [{
        path: "app/bin/quality.mjs",
        role: "backend-developer",
        phase: "backend_repair",
        event_phase: "end",
        terminal_event: true,
        terminal_error: false,
        terminal_error_observed: true,
        public_identity: "offline-repair-dispatch-allocated",
        allocated_id: "offline-repair-dispatch-allocated",
        dispatch_id: "offline-repair-dispatch",
        job_id: "offline-repair-job",
        instance_id: "offline-repair-instance",
        attempt: 1,
        tool_call_id: "offline-repair-tool",
        parent_tool_call_id: "offline-repair-dispatch",
        start_sequence: 20,
        end_sequence: 22,
        start_workflow_ordinal: 4,
        end_workflow_ordinal: 5,
        host_workflow_ordinal: 5,
        host: {
          native: false,
          provenance: CAUSAL_PROVENANCE,
          root_session: "offline-repair-root",
          dispatch: { dispatch_id: "offline-repair-dispatch", allocated_id: "offline-repair-dispatch-allocated", job_id: "offline-repair-job", instance_id: "offline-repair-instance", attempt: 1 },
          dispatch_event: { host_workflow_ordinal: 4 },
          tool: { tool_call_id: "offline-repair-tool", parent_tool_call_id: "offline-repair-dispatch", start_sequence: 20, end_sequence: 22, start_workflow_ordinal: 4, end_workflow_ordinal: 5 },
        },
        session_id: null,
        root_session_id: "offline-repair-root",
        correlation: { status: "matched", identity_match: true },
        guard: { paths_in_allowlist: true },
        before_sha256: before.subject.sha256,
        after_sha256: after.subject.sha256,
      }],
    },
  };
  const repair = subjectEvidence(repairObservation, definition);
  const repairWrite = repairObservation.repair.writes[0];
  repair.native = false;
  const firstReturnDigest = sha256Text("offline-causal-first-return");
  const returnDigest = sha256Text("offline-causal-second-return");
  const resumeEvidence = {
    native: false,
    complete: true,
    history: [
      { runId: definition.run_id, revision: definition.revision, attempt: 1, status: "FAIL", job_id: first.job_id, instance_id: first.instance_id, return_digest: firstReturnDigest },
      { runId: definition.run_id, revision: definition.revision, attempt: 2, status: "PASS", job_id: second.job_id, instance_id: second.instance_id, return_digest: returnDigest },
    ],
    jobs: [{ runId: definition.run_id, revision: definition.revision, attempt: 2, job_id: second.job_id, instance_id: second.instance_id, state: "TERMINAL", terminalStatus: "PASS", return_digest: returnDigest }],
    second_return: { run_id: definition.run_id, assignment_id: definition.assignment_id, revision: definition.revision, job_id: second.job_id, instance_id: second.instance_id, attempt: second.attempt, return_digest: returnDigest, host_workflow_ordinal: 9 },
    consumer: "tdd-orchestrator/lib/execution.mjs",
  };
  const executionObservation = {
    execution: {
      native: false,
      ok: true,
      errors: [],
      consumer: "tdd-orchestrator/lib/execution.mjs",
      host_workflow_ordinal: 9,
      value: { run_id: definition.run_id, runId: definition.run_id, revision: definition.revision, complete: true, return_digest: returnDigest, host_workflow_ordinal: 9 },
      projection: { status: "PASS", consumer: "tdd-orchestrator/lib/execution.mjs", value: { run_id: definition.run_id, runId: definition.run_id, revision: definition.revision, complete: true, return_digest: returnDigest, host_workflow_ordinal: 9 }, resume_evidence: resumeEvidence, host_workflow_ordinal: 9 },
      resume_evidence: resumeEvidence,
    },
  };
  const execution = executionEvidence(executionObservation, definition, first, second);
  execution.native = false;
  const dispatch = (dispatchId, jobId, instanceId, attempt) => ({ dispatch_id: dispatchId, allocated_id: `${dispatchId}-allocated`, job_id: jobId, instance_id: instanceId, attempt });
  const tool = (toolCallId, start, startWorkflowOrdinal, endWorkflowOrdinal, parentToolCallId) => ({ tool_call_id: toolCallId, parent_tool_call_id: parentToolCallId, start_sequence: start, end_sequence: start + 2, start_workflow_ordinal: startWorkflowOrdinal, end_workflow_ordinal: endWorkflowOrdinal });
  const sequence = (start) => ({ start, end: start + 2 });
  const phases = {
    first_terminal_accepted: phase(
      "first_terminal",
      1,
      "offline-first-root",
      "offline-first-prompt",
      dispatch("offline-first-dispatch", first.job_id, first.instance_id, first.attempt),
      tool(first.tool_call_id, 10, 2, 3, "offline-first-dispatch"),
      sequence(10),
      null,
      { host_workflow_ordinal: 3, dispatch_event: { host_workflow_ordinal: 1, dispatch_id: "offline-first-dispatch", allocated_id: "offline-first-dispatch-allocated", job_id: first.job_id, instance_id: first.instance_id, attempt: first.attempt } },
    ),
    repair_accepted: phase(
      "repair",
      2,
      "offline-repair-root",
      "offline-repair-prompt",
      dispatch("offline-repair-dispatch", "offline-repair-job", "offline-repair-instance", 1),
      tool("offline-repair-tool", 20, 4, 5, "offline-repair-dispatch"),
      sequence(20),
      null,
      { host_workflow_ordinal: 5, dispatch_event: { host_workflow_ordinal: 4, dispatch_id: "offline-repair-dispatch", allocated_id: "offline-repair-dispatch-allocated", job_id: "offline-repair-job", instance_id: "offline-repair-instance", attempt: 1 } },
    ),
    second_dispatch: phase(
      "second_dispatch",
      3,
      "offline-second-root",
      "offline-second-prompt",
      dispatch("offline-second-dispatch", second.job_id, second.instance_id, second.attempt),
      null,
      sequence(30),
      null,
      { host_workflow_ordinal: 6, dispatch_event: { host_workflow_ordinal: 6, dispatch_id: "offline-second-dispatch", allocated_id: "offline-second-dispatch-allocated", job_id: second.job_id, instance_id: second.instance_id, attempt: second.attempt }, dispatch_receipt: { accepted: true, receipt_id: "offline-second-dispatch-receipt", host_workflow_ordinal: 6 }, host_arrival_ordinal: 30 },
    ),
    second_terminal_accepted: phase(
      "second_terminal",
      4,
      "offline-second-root",
      "offline-second-prompt",
      dispatch("offline-second-dispatch", second.job_id, second.instance_id, second.attempt),
      tool(second.tool_call_id, 40, 7, 8, "offline-second-dispatch"),
      sequence(40),
      null,
      { host_workflow_ordinal: 8, dispatch_event: { host_workflow_ordinal: 6, dispatch_id: "offline-second-dispatch", allocated_id: "offline-second-dispatch-allocated", job_id: second.job_id, instance_id: second.instance_id, attempt: second.attempt }, host_bash_start_ordinal: 40, host_bash_end_ordinal: 41 },
    ),
    execution_consumed: phase("execution", 5, null, null, null, null, null, "tdd-orchestrator/lib/execution.mjs.evaluateExecution", { host_workflow_ordinal: 9 }),
  };
  const secondDispatchObservation = {
    native: false,
    root_session_id: phases.second_dispatch.root_session_id,
    root_prompt: phases.second_dispatch.root_prompt,
    session_id: null,
    dispatch: { ...phases.second_dispatch.dispatch },
    host_workflow_ordinal: 6,
    transport_match: true,
    host: {
      native: false,
      provenance: CAUSAL_PROVENANCE,
      root_session: phases.second_dispatch.root_session_id,
      root_prompt: phases.second_dispatch.root_prompt,
      dispatch: { ...phases.second_dispatch.dispatch },
      dispatch_event: { host_workflow_ordinal: 6 },
    },
  };
  phases.first_terminal_accepted.host_workflow_ordinal = first.raw.host_workflow_ordinal;
  phases.first_terminal_accepted.dispatch_event.host_workflow_ordinal = first.raw.host.dispatch_event.host_workflow_ordinal;
  phases.first_terminal_accepted.tool.start_workflow_ordinal = first.raw.host.tool.start_workflow_ordinal;
  phases.first_terminal_accepted.tool.end_workflow_ordinal = first.raw.host.tool.end_workflow_ordinal;
  phases.repair_accepted.host_workflow_ordinal = repairWrite.host_workflow_ordinal;
  phases.repair_accepted.dispatch_event.host_workflow_ordinal = repairWrite.host.dispatch_event.host_workflow_ordinal;
  phases.repair_accepted.tool.start_workflow_ordinal = repairWrite.host.tool.start_workflow_ordinal;
  phases.repair_accepted.tool.end_workflow_ordinal = repairWrite.host.tool.end_workflow_ordinal;
  phases.second_dispatch.host_workflow_ordinal = secondDispatchObservation.host_workflow_ordinal;
  phases.second_dispatch.dispatch_event.host_workflow_ordinal = secondDispatchObservation.host.dispatch_event.host_workflow_ordinal;
  phases.second_terminal_accepted.host_workflow_ordinal = second.raw.host_workflow_ordinal;
  phases.second_terminal_accepted.dispatch_event.host_workflow_ordinal = second.raw.host.dispatch_event.host_workflow_ordinal;
  phases.second_terminal_accepted.tool.start_workflow_ordinal = second.raw.host.tool.start_workflow_ordinal;
  phases.second_terminal_accepted.tool.end_workflow_ordinal = second.raw.host.tool.end_workflow_ordinal;
  phases.execution_consumed.host_workflow_ordinal = executionObservation.execution.host_workflow_ordinal;
  const causal = {
    native: false,
    provenance: CAUSAL_PROVENANCE,
    host_workflow_id: `${definition.run_id}:${definition.assignment_id}`,
    phases,
    first_terminal: capture("first_terminal", phases.first_terminal_accepted, first.raw),
    repair: {
      ...capture("repair", phases.repair_accepted, repairObservation.repair.writes[0]),
      before_hashes: before,
      after_hashes: after,
      write_end: {
        path: repairWrite.path,
        success: true,
        session_id: repairWrite.session_id,
        root_session_id: repairWrite.root_session_id,
        dispatch_id: repairWrite.dispatch_id,
        allocated_id: repairWrite.allocated_id,
        public_identity: repairWrite.public_identity,
        job_id: repairWrite.job_id,
        instance_id: repairWrite.instance_id,
        attempt: repairWrite.attempt,
        tool_call_id: repairWrite.tool_call_id,
        parent_tool_call_id: repairWrite.parent_tool_call_id,
        start_sequence: repairWrite.start_sequence,
        end_sequence: repairWrite.end_sequence,
        host_workflow_ordinal: repairWrite.host_workflow_ordinal,
        host_tool: { start_workflow_ordinal: repairWrite.start_workflow_ordinal, end_workflow_ordinal: repairWrite.end_workflow_ordinal },
        host: {
          ...repairWrite.host,
          dispatch: { ...repairWrite.host.dispatch },
          dispatch_event: { ...repairWrite.host.dispatch_event },
          tool: { ...repairWrite.host.tool },
        },
        domain_ids: {
          dispatch_id: repairWrite.dispatch_id,
          allocated_id: repairWrite.allocated_id,
          job_id: repairWrite.job_id,
          instance_id: repairWrite.instance_id,
          attempt: repairWrite.attempt,
        },
      },
    },
    second_dispatch: capture("second_dispatch", phases.second_dispatch, secondDispatchObservation),
    second_terminal: capture("second_terminal", phases.second_terminal_accepted, second.raw),
    execution: {
      ...capture("execution", phases.execution_consumed, executionObservation.execution),
      native: false,
      host_workflow_ordinal: 9,
      actual_result: { ...executionObservation.execution.value, consumer: "tdd-orchestrator/lib/execution.mjs", host_workflow_ordinal: 9 },
      actual_projection: executionObservation.execution.projection,
      consumed_second: { run_id: definition.run_id, assignment_id: definition.assignment_id, revision: definition.revision, job_id: second.job_id, instance_id: second.instance_id, attempt: second.attempt, return_digest: returnDigest, host_workflow_ordinal: 9 },
    },
  };
  const strictRepairObservation = {
    repair: {
      native: false,
      before_hashes: before,
      after_hashes: after,
      writes: [{
        path: "app/bin/quality.mjs",
        role: "backend-developer",
        phase: "backend_repair",
        event_phase: "end",
        terminal_event: true,
        terminal_error: false,
        terminal_error_observed: true,
        public_identity: phases.repair_accepted.dispatch.allocated_id,
        allocated_id: phases.repair_accepted.dispatch.allocated_id,
        dispatch_id: phases.repair_accepted.dispatch.dispatch_id,
        job_id: phases.repair_accepted.dispatch.job_id,
        instance_id: phases.repair_accepted.dispatch.instance_id,
        attempt: phases.repair_accepted.dispatch.attempt,
        tool_call_id: phases.repair_accepted.tool.tool_call_id,
        parent_tool_call_id: phases.repair_accepted.tool.parent_tool_call_id,
        start_sequence: phases.repair_accepted.tool.start_sequence,
        end_sequence: phases.repair_accepted.tool.end_sequence,
        start_workflow_ordinal: 4,
        end_workflow_ordinal: 5,
        host_workflow_ordinal: phases.repair_accepted.host_workflow_ordinal,
        host: {
          native: false,
          provenance: CAUSAL_PROVENANCE,
          root_session: phases.repair_accepted.root_session_id,
          dispatch: { ...phases.repair_accepted.dispatch },
          dispatch_event: { host_workflow_ordinal: 4 },
          tool: { ...phases.repair_accepted.tool, start_workflow_ordinal: 4, end_workflow_ordinal: 5 },
        },
        session_id: phases.repair_accepted.session_id,
        root_session_id: phases.repair_accepted.root_session_id,
        correlation: { status: "matched", identity_match: true },
        guard: { paths_in_allowlist: true },
        before_sha256: before.subject.sha256,
        after_sha256: after.subject.sha256,
      }],
    },
  };
  const fullInspection = inspectTechnicalRetryScenario({
    native: false,
    definition,
    first: first.raw,
    second: second.raw,
    repair: strictRepairObservation.repair,
    immutable_package: { manifest_verified: true, changed_paths: [] },
    execution: executionObservation.execution,
    causal,
  });
  const fullInspectionSummary = {
    native: false,
    status: fullInspection.status,
    first_eligible: fullInspection.first?.eligible === true,
    second_valid: fullInspection.second?.eligible === true && fullInspection.second?.check?.ok === true,
    repair_valid: repair.writes_observed === true && repair.writes_within_allowlist === true && repair.hashes_valid === true,
    normal_failures: fullInspection.failures,
    causal_failures: fullInspection.causal?.failures ?? [],
    resume_valid: fullInspection.execution?.resumed === true,
    shape_valid: fullInspection.first?.eligible === true &&
      fullInspection.second?.eligible === true &&
      fullInspection.second?.check?.ok === true &&
      fullInspection.failures.length === 0 &&
      fullInspection.causal?.ok === true &&
      fullInspection.execution?.resumed === true,
  };
  const inspectOffline = (causalInput, executionInput = executionObservation.execution, repairInput = strictRepairObservation.repair) => inspectTechnicalRetryScenario({
    native: false,
    definition,
    first: first.raw,
    second: second.raw,
    repair: repairInput,
    immutable_package: { manifest_verified: true, changed_paths: [] },
    execution: executionInput,
    causal: causalInput,
  });
  const positive = fullInspection.causal;
  const reorderedInput = structuredClone(causal);
  reorderedInput.phases.first_terminal_accepted.ordinal = 2;
  reorderedInput.phases.repair_accepted.ordinal = 1;
  const reordered = inspectOffline(reorderedInput).causal;
  const staleInput = structuredClone(causal);
  staleInput.execution.consumed_second.revision = "stale-causal-revision";
  const stale = inspectOffline(staleInput).causal;
  const cloneOnlyInput = structuredClone(causal);
  delete cloneOnlyInput.second_dispatch;
  const cloneOnly = inspectOffline(cloneOnlyInput).causal;
  const reusedRootInput = structuredClone(causal);
  reusedRootInput.phases.repair_accepted.root_session_id = reusedRootInput.phases.first_terminal_accepted.root_session_id;
  const reusedRoot = inspectOffline(reusedRootInput).causal;
  const missingWorkflowInput = structuredClone(causal);
  missingWorkflowInput.host_workflow_id = null;
  const missingWorkflow = inspectOffline(missingWorkflowInput).causal;
  const foreignWorkflowInput = structuredClone(causal);
  foreignWorkflowInput.host_workflow_id = "foreign-workflow";
  const foreignWorkflow = inspectOffline(foreignWorkflowInput).causal;
  const foreignRepairRootInput = structuredClone(causal);
  foreignRepairRootInput.repair.write_end.root_session_id = "foreign-repair-root";
  const foreignRepairRootRepair = structuredClone(strictRepairObservation.repair);
  foreignRepairRootRepair.writes[0].root_session_id = "foreign-repair-root";
  const foreignRepairRoot = inspectOffline(foreignRepairRootInput, executionObservation.execution, foreignRepairRootRepair).causal;
  const foreignRepairToolCallInput = structuredClone(causal);
  foreignRepairToolCallInput.repair.write_end.tool_call_id = "foreign-repair-end-toolcall";
  foreignRepairToolCallInput.repair.write_end.parent_tool_call_id = "foreign-repair-parent-toolcall";
  const foreignRepairToolCallRepair = structuredClone(strictRepairObservation.repair);
  foreignRepairToolCallRepair.writes[0].tool_call_id = "foreign-repair-end-toolcall";
  foreignRepairToolCallRepair.writes[0].parent_tool_call_id = "foreign-repair-parent-toolcall";
  const foreignRepairToolCall = inspectOffline(foreignRepairToolCallInput, executionObservation.execution, foreignRepairToolCallRepair).causal;
  const foreignRepairAllocatedInput = structuredClone(causal);
  foreignRepairAllocatedInput.repair.write_end.allocated_id = "foreign-repair-allocated";
  foreignRepairAllocatedInput.repair.write_end.public_identity = "foreign-repair-allocated";
  foreignRepairAllocatedInput.repair.write_end.domain_ids.allocated_id = "foreign-repair-allocated";
  const foreignRepairAllocatedRepair = structuredClone(strictRepairObservation.repair);
  foreignRepairAllocatedRepair.writes[0].allocated_id = "foreign-repair-allocated";
  foreignRepairAllocatedRepair.writes[0].public_identity = "foreign-repair-allocated";
  const foreignRepairAllocated = inspectOffline(foreignRepairAllocatedInput, executionObservation.execution, foreignRepairAllocatedRepair).causal;
  const missingDispatchInput = structuredClone(causal);
  delete missingDispatchInput.phases.second_dispatch.dispatch.instance_id;
  const missingDispatch = inspectOffline(missingDispatchInput).causal;
  const foreignDispatchInput = structuredClone(causal);
  foreignDispatchInput.phases.second_dispatch.dispatch.job_id = "foreign-second-job";
  foreignDispatchInput.phases.second_dispatch.dispatch_event.job_id = "foreign-second-job";
  const foreignDispatch = inspectOffline(foreignDispatchInput).causal;
  const reorderedCrossRootInput = structuredClone(causal);
  reorderedCrossRootInput.phases.second_dispatch.host_workflow_ordinal = 1;
  reorderedCrossRootInput.phases.second_dispatch.dispatch_event.host_workflow_ordinal = 1;
  reorderedCrossRootInput.second_dispatch.host_workflow_ordinal = 1;
  reorderedCrossRootInput.second_dispatch.dispatch_event.host_workflow_ordinal = 1;
  reorderedCrossRootInput.phases.second_dispatch.dispatch_receipt.host_workflow_ordinal = 1;
  reorderedCrossRootInput.second_dispatch.dispatch_receipt.host_workflow_ordinal = 1;
  const reorderedCrossRoot = inspectOffline(reorderedCrossRootInput).causal;
  const secondReturnControl = (field, value) => {
    const causalInput = structuredClone(causal);
    const executionInput = structuredClone(executionObservation.execution);
    executionInput.projection.resume_evidence = structuredClone(resumeEvidence);
    causalInput.execution.consumed_second[field] = value;
    executionInput.resume_evidence.second_return[field] = value;
    return inspectOffline(causalInput, executionInput);
  };
  const foreignSecondReturnJob = secondReturnControl("job_id", "foreign-second-job");
  const foreignSecondReturnInstance = secondReturnControl("instance_id", "foreign-second-instance");
  const foreignSecondReturnAttempt = secondReturnControl("attempt", 99);
  const foreignSecondReturnDigest = secondReturnControl("return_digest", sha256Text("foreign-second-return"));
  const workflowOrdinals = [
    first.host_workflow_ordinal,
    repairWrite.host_workflow_ordinal,
    secondDispatchObservation.host_workflow_ordinal,
    second.host_workflow_ordinal,
    executionObservation.execution.host_workflow_ordinal,
  ];
  const workflowOrdinalsStrictlyIncreasing = workflowOrdinals.every((value, index) => Number.isSafeInteger(value) && value > 0 && (index === 0 || value > workflowOrdinals[index - 1]));
  return {
    native: false,
    evidence_level: "offline-causal-shape-only",
    host_workflow_id: causal.host_workflow_id,
    workflow_ordinals: workflowOrdinals,
    workflow_ordinals_strictly_increasing: workflowOrdinalsStrictlyIncreasing,
    positive: positive.ok,
    reordered_rejected: !reordered.ok,
    clone_only_rejected: !cloneOnly.ok,
    reused_root_rejected: !reusedRoot.ok,
    stale_rejected: !stale.ok,
    missing_workflow_id_rejected: !missingWorkflow.ok,
    foreign_workflow_id_rejected: !foreignWorkflow.ok,
    foreign_repair_root_rejected: !foreignRepairRoot.ok,
    foreign_repair_end_toolcall_rejected: !foreignRepairToolCall.ok,
    foreign_repair_allocated_id_rejected: !foreignRepairAllocated.ok,
    missing_dispatch_tuple_rejected: !missingDispatch.ok,
    foreign_dispatch_tuple_rejected: !foreignDispatch.ok,
    reordered_cross_root_workflow_ordinals_rejected: !reorderedCrossRoot.ok,
    foreign_second_return_job_rejected: foreignSecondReturnJob.causal?.ok === false && foreignSecondReturnJob.execution?.resumed !== true,
    foreign_second_return_instance_rejected: foreignSecondReturnInstance.causal?.ok === false && foreignSecondReturnInstance.execution?.resumed !== true,
    foreign_second_return_attempt_rejected: foreignSecondReturnAttempt.causal?.ok === false && foreignSecondReturnAttempt.execution?.resumed !== true,
    foreign_second_return_digest_rejected: foreignSecondReturnDigest.causal?.ok === false && foreignSecondReturnDigest.execution?.resumed !== true,
    all_negative_controls_rejected: [
      !missingWorkflow.ok,
      !foreignWorkflow.ok,
      !foreignRepairRoot.ok,
      !foreignRepairToolCall.ok,
      !foreignRepairAllocated.ok,
      !missingDispatch.ok,
      !foreignDispatch.ok,
      !reorderedCrossRoot.ok,
      foreignSecondReturnJob.causal?.ok === false && foreignSecondReturnJob.execution?.resumed !== true,
      foreignSecondReturnInstance.causal?.ok === false && foreignSecondReturnInstance.execution?.resumed !== true,
      foreignSecondReturnAttempt.causal?.ok === false && foreignSecondReturnAttempt.execution?.resumed !== true,
      foreignSecondReturnDigest.causal?.ok === false && foreignSecondReturnDigest.execution?.resumed !== true,
    ].every(Boolean),
    offline_helper_inspection: fullInspectionSummary,
    phase_attempts: positive.phase_attempts,
    capture_attempts: positive.capture_attempts,
    reordered_failures: reordered.failures,
    stale_failures: stale.failures,
    control_failures: {
      missing_workflow_id: missingWorkflow.failures,
      foreign_workflow_id: foreignWorkflow.failures,
      foreign_repair_root: foreignRepairRoot.failures,
      foreign_repair_end_toolcall: foreignRepairToolCall.failures,
      foreign_repair_allocated_id: foreignRepairAllocated.failures,
      missing_dispatch_tuple: missingDispatch.failures,
      foreign_dispatch_tuple: foreignDispatch.failures,
      reordered_cross_root_workflow_ordinals: reorderedCrossRoot.failures,
      foreign_second_return_job: foreignSecondReturnJob.causal?.failures ?? [],
      foreign_second_return_instance: foreignSecondReturnInstance.causal?.failures ?? [],
      foreign_second_return_attempt: foreignSecondReturnAttempt.causal?.failures ?? [],
      foreign_second_return_digest: foreignSecondReturnDigest.causal?.failures ?? [],
    },
    root_sessions: [phases.first_terminal_accepted.root_session_id, phases.repair_accepted.root_session_id, phases.second_terminal_accepted.root_session_id],
  };
}


function adapterDerivedId(definition, terminal) {
  const observedIdentity = [
    terminal.job_id,
    terminal.instance_id,
    terminal.session_id,
    terminal.tool_call_id,
    terminal.parent_tool_call_id,
    terminal.agent_id,
    terminal.payload_id,
    ...(terminal.result_ids ?? []),
  ].filter(Boolean);
  if (observedIdentity.length === 0) return null;
  const material = [definition.run_id, definition.assignment_id, ...observedIdentity, terminal.attempt].map((item) => String(item)).join("\u001f");
  return `adapter-derived:${sha256Text(material).slice(0, 32)}`;
}

function inspectTechnicalRetryScenario(observations) {
  if (!observations || typeof observations !== "object" || Array.isArray(observations)) return { status: "BLOCKED", evidence_level: "invalid-observation", failures: ["observations must be an object"] };
  const definition = firstObject(observations.definition, observations.prepared, observations.scenario);
  if (!definition) return { status: "BLOCKED", evidence_level: "invalid-observation", failures: ["prepared scenario definition is required"] };
  const native = observations.native === true;
  const strict = strictCausalInput(observations);
  const firstObservation = firstObject(observations.first, observations.failure, observations.first_attempt);
  const secondObservation = firstObject(observations.second, observations.retry, observations.second_attempt);
  const first = normalizeTerminal(firstObservation);
  const second = normalizeTerminal(secondObservation);
  const firstCount = terminalCount(firstObservation);
  const secondCount = terminalCount(secondObservation);
  const firstTask = strict ? taskCompletionBinding(firstObservation, definition, "first") : { ok: true, failures: [] };
  const secondTask = strict ? taskCompletionBinding(secondObservation, definition, "second") : { ok: true, failures: [] };
  const firstCheck = nativeTerminalBinding(first, definition, "FAIL", 1, strict);
  const secondCheck = nativeTerminalBinding(second, definition, "PASS", 2, strict);
  const firstHost = native ? nativeHostObservationBinding(firstObservation, first, definition, "first") : { ok: true, failures: [], origin: null, host: null };
  const secondHost = native ? nativeHostObservationBinding(secondObservation, second, definition, "second") : { ok: true, failures: [], origin: null, host: null };
  const repair = subjectEvidence(observations, definition);
  const immutable = immutableEvidence(observations, definition);
  const execution = executionEvidence(observations, definition, first, second);
  const causal = causalEvidence(observations, definition, first, second, repair, execution);
  const failures = [];
  if (firstCount !== 1) failures.push("first_terminal_count_not_exactly_one");
  if (secondCount !== 1) failures.push("second_terminal_count_not_exactly_one");
  failures.push(...firstCheck.failures.map((item) => `first_${item}`));
  failures.push(...secondCheck.failures.map((item) => `second_${item}`));
  failures.push(...firstTask.failures, ...secondTask.failures);
  if (native) {
    failures.push(...firstHost.failures);
    failures.push(...secondHost.failures);
  }
  if (strict) failures.push(...causal.failures);
  if (!repair.writes_observed) failures.push("native_backend_repair_write_missing");
  if (!repair.writes_within_allowlist) failures.push("native_backend_repair_write_outside_allowlist");
  if (!repair.hashes_valid) failures.push("mutable_subject_hashes_missing_or_invalid");
  if (!repair.before_matches_original) failures.push("mutable_subject_before_hash_not_original_audit_hash");
  if (!repair.dependency_before_matches_prepared) failures.push("dependency_before_hash_not_prepared_copy");
  if (!repair.validator_before_matches_prepared) failures.push("validator_before_hash_not_prepared_copy");
  if (!repair.subject_changed) failures.push("mutable_subject_hash_did_not_change");
  if (!repair.immutable_validator_unchanged) failures.push("validator_hash_changed_during_repair");
  if (!repair.dependency_unchanged) failures.push("copied_quality_dependency_changed_during_repair");
  if (!immutable.manifest_verified) failures.push("immutable_original_manifest_not_verified");
  if (!immutable.unchanged) failures.push("immutable_installed_package_preservation_not_observed");
  if (!execution.result_observed) failures.push("execution_api_result_missing");
  if (!execution.envelope_ok) failures.push("execution_api_envelope_invalid");
  if (!execution.result_bindings_match) failures.push("execution_result_binding_mismatch");
  if (!execution.valid_consumer) failures.push("execution_consumer_not_identified_as_tdd_execution");
  if (!execution.complete) failures.push("execution_consumer_completion_missing");
  if (!execution.resumed) failures.push("execution_consumer_resume_missing");
  if (native && first.task_id === null && second.task_id === null && (first.task_id_exposed || second.task_id_exposed)) failures.push("task_id_exposure_contradictory");
  const firstEligible = firstCheck.ok && firstCount === 1 && firstTask.ok && firstHost.ok;
  const secondEligible = secondCheck.ok && secondCount === 1 && secondTask.ok && secondHost.ok;
  const identity = {
    first: { task_id: first.task_id, task_id_exposed: first.task_id_exposed, job_id: first.job_id, instance_id: first.instance_id, session_id: first.session_id, tool_call_id: first.tool_call_id, parent_tool_call_id: first.parent_tool_call_id, agent_id: first.agent_id, payload_id: first.payload_id, result_ids: first.result_ids, adapter_derived_execution_id: adapterDerivedId(definition, first) },
    second: { task_id: second.task_id, task_id_exposed: second.task_id_exposed, job_id: second.job_id, instance_id: second.instance_id, session_id: second.session_id, tool_call_id: second.tool_call_id, parent_tool_call_id: second.parent_tool_call_id, agent_id: second.agent_id, payload_id: second.payload_id, result_ids: second.result_ids, adapter_derived_execution_id: adapterDerivedId(definition, second) },
    task_id_claim: "Pinned 18.18.6 tool_execution_end exposes no task_id; injected task IDs are rejected, and adapter-derived IDs are labeled and never substituted.",
  };
  if (first.job_id && second.job_id && first.job_id === second.job_id) failures.push("retry_job_identity_not_distinct");
  if (first.instance_id && second.instance_id && first.instance_id === second.instance_id) failures.push("retry_instance_identity_not_distinct");
  const firstInstance = first.instance_id;
  const secondInstance = second.instance_id;
  if (!firstInstance || !secondInstance) failures.push("retry_instance_identity_missing");
  const technicalPass = native && firstEligible && secondEligible && failures.length === 0;
  const contradiction = failures.some((item) => item.includes("outside_allowlist") || item.includes("contradictory") || item.includes("terminal_count"));
  return {
    status: technicalPass ? "PASS" : native ? (contradiction ? "BLOCKED" : "PENDING") : "PENDING_NATIVE",
    native,
    evidence_level: native ? "native-omp-rpc" : "offline-preparation-only",
    scenario_id: definition.scenario_id ?? SCENARIO_ID,
    run_id: definition.run_id ?? null,
    assignment_id: definition.assignment_id ?? null,
    revision: definition.revision ?? null,
    first_host_origin: firstHost.origin,
    second_host_origin: secondHost.origin,
    first: { ...first, eligible: firstEligible, check: firstCheck },
    second: { ...second, eligible: secondEligible, check: secondCheck },
    repair,
    immutable_original: definition.immutable_original ?? null,
    immutable_package: immutable,
    execution,
    causal,
    identities: identity,
    same_assignment: first.assignment_id === definition.assignment_id && second.assignment_id === definition.assignment_id,
    same_run: first.run_id === definition.run_id && second.run_id === definition.run_id,
    same_revision: first.revision === definition.revision && second.revision === definition.revision,
    distinct_public_jobs: Boolean(first.job_id && second.job_id && first.job_id !== second.job_id),
    distinct_public_instances: Boolean(firstInstance && secondInstance && firstInstance !== secondInstance),
    cap3_respected: first.attempt === 1 && second.attempt === 2 && second.attempt <= 3,
    failures: [...new Set(failures)],
    limitation: native ? null : "Preparation/validator evidence is intentionally not native and cannot promote NATIVE-09.",
  };
}



function parseOptions(argv) {
  const allowed = new Set(["offline-probe", "snapshot", "manifest", "lab", "run-id", "assignment-id", "revision", "nonce"]);
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--offline-probe") { values.offlineProbe = true; continue; }
    if (!token.startsWith("--")) blocked(`unexpected argument ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) blocked(`unknown option --${key}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) blocked(`option --${key} requires a value`);
    values[key] = next;
    index += 1;
  }
  if (!values.offlineProbe) blocked("only --offline-probe is available; native launch belongs to NativeLifecycleCompletion");
  for (const key of ["snapshot", "manifest", "lab"]) if (!values[key]) blocked(`--${key} is required for offline preparation`);
  return values;
}

function runOfflineProbe(options) {
  const lab = assertDirectory(options.lab, "offline lab");
  const snapshot = assertDirectory(options.snapshot, "offline original snapshot");
  const manifest = assertRegularFile(options.manifest, "offline original audit manifest");
  if (inside(snapshot, lab) || inside(lab, snapshot)) blocked("offline lab and original snapshot must be disjoint");
  const normalHome = process.env.USERPROFILE || process.env.HOME;
  if (normalHome && (samePath(lab, normalHome) || inside(lab, normalHome))) blocked("offline lab may not be the real HOME");
  const root = path.join(lab, `technical-retry-${randomUUID()}`);
  fs.mkdirSync(root);
  const context = {
    runId: options["run-id"] ?? randomUUID(),
    assignmentId: options["assignment-id"] ?? DEFAULT_ASSIGNMENT_ID,
    revision: options.revision ?? `offline-${sha256Text(`${ORIGINAL_SUBJECTS.cli.sha256}:${ORIGINAL_SUBJECTS.dependency.sha256}`).slice(0, 32)}`,
    nonce: options.nonce ?? randomUUID(),
    projectRoot: root,
    originalAuditManifest: manifest,
    originalSnapshotRoot: snapshot,
  };
  const definition = prepareTechnicalRetryScenario(context);
  const child = spawnSync(process.execPath, [definition.paths.validator], { cwd: definition.cwd, shell: false, windowsHide: true, encoding: "utf8", maxBuffer: MAX_CHILD_OUTPUT });
  const stdout = String(child.stdout ?? "");
  const stderr = String(child.stderr ?? "");
  let report = null;
  try { report = JSON.parse(stdout.trim()); } catch { try { report = JSON.parse(stderr.trim()); } catch { report = null; } }
  const offlineManifest = validateManifest(manifestInput(manifest).value);
  const sourceAfter = verifyOriginalSource(context.originalSnapshotRoot, offlineManifest);
  const causalSmoke = offlineCausalSmoke(definition);
  const validRun = report?.actual?.valid_empty_root;
  const validProbeRun = report?.actual?.valid_nonempty_root;
  const emptyExtraRun = report?.actual?.invalid_extra_empty;
  const nonemptyExtraRun = report?.actual?.invalid_extra_nonempty;
  const expectedProbe = report?.expected?.valid_nonempty_root?.exact_inventory;
  const probePayload = validProbeRun?.payload;
  const dynamicProbeValid = validProbeRun?.exit_code === 0 &&
    probePayload?.digest === expectedProbe?.digest &&
    probePayload?.files && typeof probePayload.files === "object" &&
    Object.keys(probePayload.files).length === 1 &&
    SHA256.test(probePayload.files["probe.txt"] ?? "") &&
    SHA256.test(probePayload.digest ?? "");
  const expectedRed = child.status === FAILURE_EXIT_CODE &&
    report?.status === "FAIL" &&
    report?.code === "ASSERTION_EXPECTED_REJECTION" &&
    report?.failure_origin === "SOLUTION" &&
    validRun?.exit_code === 0 &&
    validRun?.payload?.digest === EMPTY_INVENTORY_DIGEST &&
    validRun?.payload?.files &&
    typeof validRun.payload.files === "object" &&
    Object.keys(validRun.payload.files).length === 0 &&
    dynamicProbeValid &&
    emptyExtraRun?.exit_code === 0 &&
    Number.isInteger(nonemptyExtraRun?.exit_code) &&
    nonemptyExtraRun.exit_code !== 0;
  const result = {
    status: expectedRed ? "PASS" : "BLOCKED",
    native: false,
    evidence_level: "offline-original-defect-assertion",
    scenario_id: definition.scenario_id,
    contract: CONTRACT_VERSION,
    run_id: definition.run_id,
    assignment_id: definition.assignment_id,
    revision: definition.revision,
    nonce: definition.nonce,
    private_project_root: definition.project_root,
    private_application_root: definition.application_root,
    command: definition.command,
    validator: { path: definition.paths.validator, exit_code: child.status, signal: child.signal ?? null, report: report ? safeValue(report) : null, stdout_bytes: Buffer.byteLength(stdout, "utf8"), stderr_bytes: Buffer.byteLength(stderr, "utf8") },
    assertion_failure_from_real_application: expectedRed,
    original_source: definition.immutable_original,
    offline_helper_inspection: causalSmoke.offline_helper_inspection,
    causal_smoke: causalSmoke,
    mutable_application_before: definition.mutable_application.before_hashes,
    no_native_launch: true,
    no_root_source_change: true,
    limitation: "This proves only the copied ORIGINAL191 application defect and validator shape; it is not native OMP evidence.",
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = expectedRed ? 0 : 2;
}

export { buildPeerTask, prepareTechnicalRetryScenario, inspectTechnicalRetryScenario, isAuthoritativeTaskRecord, taskRecordSucceeded };

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const options = parseOptions(process.argv.slice(2));
    runOfflineProbe(options);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: error?.kind === "USAGE" ? "USAGE" : "BLOCKED", native: false, error: safeError(error), detail: scrub(error?.message ?? error) })}\n`);
    process.exitCode = error?.kind === "USAGE" ? 64 : 2;
  }
}
