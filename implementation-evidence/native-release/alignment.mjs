#!/usr/bin/env node
// Disposable native OMP probe for T008/AC-009 (W-01/W-02).
//
// This file is deliberately outside the repository.  It launches the installed
// OMP executable through its real RPC transport, creates all fixtures below the
// caller-provided lab, and observes the checkpoint on disk.  It does not mock
// OMP, Git, checkpoint JSON, model output, or a network response.  It never edits
// the source checkout or installs anything into a user profile.
//
// Primary protocol source:
// https://raw.githubusercontent.com/can1357/oh-my-pi/v18.18.6/docs/rpc.md

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

const MAX_PHYSICAL_FRAME_BYTES = 1024 * 1024;
const MAX_REASSEMBLED_FRAME_BYTES = 64 * 1024 * 1024;
const DEFAULT_SESSION_TIMEOUT_MS = 900_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const decoder = new TextDecoder("utf-8", { fatal: true });
const COLLISION_FIXTURE_BYTES = Buffer.from('{"checkpoint":"alignment","status":"BLOCKED"', "utf8");

class DriverError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "DriverError";
    this.kind = kind;
    Object.assign(this, details);
    this.controlled = details.controlled !== false;
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
  return sha256Bytes(Buffer.from(text, "utf8"));
}

function scrubText(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential|account[_-]?id|user[_-]?id))\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>")
    .replace(/((?:authorization|cookie))\s*:\s*[^\r\n]+/gi, "$1: <redacted>")
    .slice(0, 4096);
}

function sensitiveKey(key) {
  return /(?:auth|token|secret|password|credential|account(?:[_-]?id)?|api[_-]?key|cookie|system[_-]?prompt|private[_-]?key)/i.test(
    String(key),
  );
}

function sanitizeValue(value, depth = 0, key = "") {
  if (sensitiveKey(key)) return "<redacted>";
  if (depth > 6) return "<depth-limited>";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.slice(0, 64).map((item) => sanitizeValue(item, depth + 1, key));
  if (typeof value === "object") {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (sensitiveKey(childKey)) {
        result[childKey] = "<redacted>";
      } else {
        result[childKey] = sanitizeValue(childValue, depth + 1, childKey);
      }
    }
    return result;
  }
  return String(value);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new DriverError("USAGE", `unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!new Set(["omp", "source", "lab", "phase", "timeout-ms", "resume-capture", "resume-b-capture", "collision-capture", "collision-only", "replay-only", "omp-sha256"]).has(name)) {
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
  if (!new Set(["red", "green"]).has(values.phase)) {
    throw new DriverError("USAGE", "--phase must be red or green");
  }
  for (const name of ["collision-only", "replay-only"]) {
    if (values[name] !== undefined && values[name] !== "true") {
      throw new DriverError("USAGE", `--${name} only accepts true`);
    }
  }
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
    resumeCapture: values["resume-capture"] ?? null,
    resumeBCapture: values["resume-b-capture"] ?? null,
    collisionCapture: values["collision-capture"] ?? null,
    replayOnly: values["replay-only"] === "true",
    collisionOnly: values["collision-only"] === "true",
    ompSha256: values["omp-sha256"] ?? null,
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
  let inputInfo;
  try {
    inputInfo = lstatSync(value);
  } catch (error) {
    blocked(`${label} is not resolvable`, { controlled: false, code: "PATH_RESOLVE_ERROR", phase: "input_validation", opaque: opaqueError(error?.message ?? error) });
  }
  if (inputInfo.isSymbolicLink()) blocked(`${label} must not be a symbolic link`);
  let real;
  try {
    real = realpathSync(value);
  } catch (error) {
    blocked(`${label} is not resolvable`, { controlled: false, code: "PATH_RESOLVE_ERROR", phase: "input_validation", opaque: opaqueError(error?.message ?? error) });
  }
  const info = lstatSync(real);
  if (!info.isDirectory() || info.isSymbolicLink()) blocked(`${label} must be a real directory`);
  return real;
}

function existingFile(label, value) {
  if (!isAbsolute(value) || value.includes("\0")) blocked(`${label} must be an absolute path`);
  let inputInfo;
  try {
    inputInfo = lstatSync(value);
  } catch (error) {
    blocked(`${label} is not resolvable`, { controlled: false, code: "PATH_RESOLVE_ERROR", phase: "input_validation", opaque: opaqueError(error?.message ?? error) });
  }
  if (inputInfo.isSymbolicLink()) blocked(`${label} must not be a symbolic link`);
  let real;
  try {
    real = realpathSync(value);
  } catch (error) {
    blocked(`${label} is not resolvable`, { controlled: false, code: "PATH_RESOLVE_ERROR", phase: "input_validation", opaque: opaqueError(error?.message ?? error) });
  }
  const info = lstatSync(real);
  if (!info.isFile() || info.isSymbolicLink()) blocked(`${label} must be a real file`);
  return real;
}


function assertNewDirectory(path, label) {
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink()) blocked(`${label} already exists and is not a real directory`);
    return;
  }
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
  writeFileSync(destination, readFileSync(source));
  ensureRegularFile(destination, label);
  const sourceBytes = readFileSync(source);
  const destinationBytes = readFileSync(destination);
  if (!sourceBytes.equals(destinationBytes)) blocked(`${label} copy changed bytes`);
  return {
    source,
    destination,
    sourceSha256: sha256Bytes(sourceBytes),
    copySha256: sha256Bytes(destinationBytes),
    bytes: sourceBytes.byteLength,
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
const ALIGNMENT_PRESERVATION_PATHS = new Set([
  "alignment/SKILL.md",
  "alignment/references/routing-and-persistence.md",
  "alignment/references/comprehension-review.md",
  "alignment/references/domain-modeling.md",
  "alignment/references/writing-for-agents.md",
  "alignment/agents/requirements-reader.md",
]);

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
  const alignmentEntries = frozen.filter((entry) => entry.kind === "skill" && ALIGNMENT_PRESERVATION_PATHS.has(entry.sourceRelativePath));
  if (alignmentEntries.length !== ALIGNMENT_PRESERVATION_PATHS.size) {
    blocked("frozen package is missing an alignment preservation target");
  }
  return {
    root: packageRoot,
    manifestPath,
    manifestSha256: sha256Bytes(readFileSync(manifestPath)),
    manifestDigest: manifestDigest(frozen),
    entries: frozen,
    alignmentEntries,
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
function loadExistingFrozenPackage(capture, sourceEntries, lab, label) {
  const packageRootValue = capture?.source_capture?.package_root;
  const declaredManifestSha = capture?.source_capture?.manifest_sha256;
  if (typeof packageRootValue !== "string" || !isAbsolute(packageRootValue) || typeof declaredManifestSha !== "string") {
    blocked(`${label} capture has no bound frozen package manifest`);
  }
  const packageRoot = existingDirectory(`${label} frozen package`, packageRootValue);
  if (!isSameOrDescendant(lab, packageRoot)) blocked(`${label} frozen package escaped the lab`);
  const manifestPath = join(packageRoot, "MANIFEST.json");
  const manifestFile = readJsonFile(manifestPath, `${label} frozen manifest`);
  const manifestSha256 = sha256Bytes(manifestFile.bytes);
  if (manifestSha256 !== declaredManifestSha) {
    blocked(`${label} frozen manifest digest mismatch`, { code: "RESUME_MANIFEST_MISMATCH", phase: "manifest" });
  }
  if (!Array.isArray(manifestFile.value)) {
    blocked(`${label} frozen manifest is not an array`, { code: "RESUME_MANIFEST_ENTRIES", phase: "manifest" });
  }
  const declaredFileCount = capture?.source_capture?.files;
  if (!Number.isSafeInteger(declaredFileCount) || manifestFile.value.length !== declaredFileCount) {
    blocked(`${label} frozen manifest entry count differs from its captured package`, { code: "RESUME_MANIFEST_ENTRIES", phase: "manifest" });
  }
  const rows = new Map();
  const destinations = new Set();
  for (const row of manifestFile.value) {
    if (
      !row
      || (row.kind !== "skill" && row.kind !== "agent")
      || typeof row.source !== "string"
      || typeof row.destination !== "string"
      || !Number.isSafeInteger(row.bytes)
      || row.bytes < 0
      || typeof row.sha256 !== "string"
      || !/^[0-9a-f]{64}$/i.test(row.sha256)
      || isAbsolute(row.source)
      || row.source.split("/").includes("..")
      || row.source.split("\\").includes("..")
      || isAbsolute(row.destination)
      || row.destination.split("/").includes("..")
      || row.destination.split("\\").includes("..")
      || rows.has(`${row.source}\0${row.destination}`)
      || destinations.has(row.destination)
    ) {
      blocked(`${label} frozen manifest contains an unsafe or duplicate row`, { code: "RESUME_MANIFEST_INVALID", phase: "manifest" });
    }
    rows.set(`${row.source}\0${row.destination}`, row);
    destinations.add(row.destination);
  }
  const currentByKey = new Map(
    sourceEntries.map((entry) => [`${entry.kind}\0${entry.sourceRelativePath}\0${entry.destinationRelative}`, entry]),
  );
  const entries = manifestFile.value.map((row) => {
    const current = currentByKey.get(`${row.kind}\0${row.source}\0${row.destination}`);
    const packagePath = join(packageRoot, row.destination);
    assertInside(packageRoot, packagePath, `${label} frozen package`);
    ensureRegularFile(packagePath, `${label} frozen package ${row.destination}`);
    const bytes = readFileSync(packagePath);
    if (bytes.byteLength !== row.bytes || sha256Bytes(bytes).toLowerCase() !== row.sha256.toLowerCase()) {
      blocked(`${label} frozen package bytes changed`, { code: "RESUME_PACKAGE_BYTES", phase: "manifest" });
    }
    return {
      kind: row.kind,
      sourceRelativePath: row.source,
      destinationRelative: row.destination,
      source: current?.source ?? null,
      sourceSha256: row.sha256,
      bytes: row.bytes,
      packagePath,
      packageSha256: sha256Bytes(bytes),
    };
  });
  const alignmentEntries = entries.filter((entry) => entry.kind === "skill" && ALIGNMENT_PRESERVATION_PATHS.has(entry.sourceRelativePath));
  if (alignmentEntries.length !== ALIGNMENT_PRESERVATION_PATHS.size) {
    blocked(`${label} frozen package is missing alignment preservation targets`, { code: "RESUME_ALIGNMENT_SOURCES", phase: "manifest" });
  }
  return {
    root: packageRoot,
    manifestPath,
    manifestSha256,
    manifestDigest: manifestDigest(entries),
    entries,
    alignmentEntries,
  };
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

function assertResumeSourceBinding(capture, sourceRoot, alignmentEntries, label) {
  if (typeof capture?.source_root !== "string" || !samePath(capture.source_root, sourceRoot)) {
    blocked(`${label} source root differs from or is absent in the capture`, { code: "RESUME_SOURCE_ROOT", phase: "source_binding" });
  }
  if (capture?.source_after_scope !== "alignment-six-targets-only" || !Array.isArray(capture?.source_after) || capture.source_after.length !== ALIGNMENT_PRESERVATION_PATHS.size) {
    blocked(`${label} capture lacks the exact six-target source-after binding`, { code: "RESUME_SOURCE_AFTER_SCOPE", phase: "source_binding" });
  }
  const declared = new Map();
  for (const item of capture.source_after) {
    if (!item || typeof item.path !== "string" || typeof item.sha256 !== "string" || !Number.isSafeInteger(item.bytes)) {
      blocked(`${label} source-after binding is malformed`, { code: "RESUME_SOURCE_AFTER_INVALID", phase: "source_binding" });
    }
    declared.set(item.path, item);
  }
  if (declared.size !== ALIGNMENT_PRESERVATION_PATHS.size || [...ALIGNMENT_PRESERVATION_PATHS].some((path) => !declared.has(path))) {
    blocked(`${label} source-after binding does not cover exactly six alignment files`, { code: "RESUME_SOURCE_AFTER_TARGETS", phase: "source_binding" });
  }
  const packageByPath = new Map(alignmentEntries.map((entry) => [entry.sourceRelativePath, entry]));
  const current = captureSourceHashes(sourceRoot, alignmentEntries, `${label} current source`);
  for (const item of current) {
    const expected = declared.get(item.path);
    const packageEntry = packageByPath.get(item.path);
    if (
      !expected
      || !packageEntry
      || packageEntry.sourceSha256.toLowerCase() !== expected.sha256.toLowerCase()
      || packageEntry.bytes !== expected.bytes
      || expected.sha256.toLowerCase() !== item.sha256.toLowerCase()
      || expected.bytes !== item.bytes
    ) {
      blocked(`${label} source bytes differ from the genuine capture or frozen package`, { code: "RESUME_SOURCE_BYTES", phase: "source_binding", path: item.path });
    }
  }
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
  for (const key of ["NODE_OPTIONS", "BASH_ENV", "ENV"]) delete env[key];
  return env;
}

function configureGitEnvironment(runRoot) {
  const globalConfig = join(runRoot, "git-global-empty.conf");
  const templateDir = join(runRoot, "git-template-empty");
  const hooksDir = join(runRoot, "git-hooks-empty");
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

function createGitEnvironment(runRoot) {
  const paths = configureGitEnvironment(runRoot);
  writeFileSync(paths.globalConfig, "");
  mkdirSync(paths.templateDir, { recursive: true });
  mkdirSync(paths.hooksDir, { recursive: true });
  return paths;
}

function existingGitEnvironment(runRoot) {
  const paths = configureGitEnvironment(runRoot);
  existingFile("offline Git global config", paths.globalConfig);
  existingDirectory("offline Git template", paths.templateDir);
  existingDirectory("offline Git hooks", paths.hooksDir);
  return paths;
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
      code: "GIT_COMMAND_FAILED",
      phase: "git",
      gitStatus: result.status,
      gitError: result.error ? opaqueError(result.error.message) : null,
      gitStderrSha256: sha256Text(result.stderr ?? ""),
    });
  }
  return String(result.stdout ?? "").trim();
}

function createGitFixture(fixtureRoot, sourceEntries, labels, runRoot) {
  assertInside(runRoot, fixtureRoot, "Git fixture");
  mkdirSync(fixtureRoot, { recursive: true });
  const gitEnv = createGitEnvironment(fixtureRoot);
  const repo = join(fixtureRoot, "repository");
  const worktreeRoot = join(fixtureRoot, "worktrees");
  mkdirSync(repo);
  mkdirSync(worktreeRoot);
  runGit(repo, ["init", "--quiet", "--initial-branch=main"], gitEnv.env, "git init");
  runGit(repo, ["config", "--local", "user.name", "Native Alignment Fixture"], gitEnv.env, "git user.name");
  runGit(repo, ["config", "--local", "user.email", "native-alignment@example.invalid"], gitEnv.env, "git user.email");
  runGit(repo, ["config", "--local", "commit.gpgsign", "false"], gitEnv.env, "git commit.gpgsign");
  runGit(repo, ["config", "--local", "core.hooksPath", gitEnv.hooksDir], gitEnv.env, "git core.hooksPath");
  runGit(repo, ["config", "--local", "init.templateDir", gitEnv.templateDir], gitEnv.env, "git init.templateDir");
  writeFileSync(join(repo, "scope-a.txt"), "scope A: read-only checkpoint acceptance\n");
  writeFileSync(join(repo, "scope-b.txt"), "scope B: independent read-only checkpoint acceptance\n");
  writeFileSync(join(repo, "scope-short.txt"), "scope short: localized reversible change\n");
  writeFileSync(join(repo, "scope-full.txt"), "scope full: dependency and trust-boundary review\n");
  writeFileSync(join(repo, "scope-blocked.txt"), "scope blocked: unresolved material decision\n");
  runGit(repo, ["add", "--", "scope-a.txt", "scope-b.txt", "scope-short.txt", "scope-full.txt", "scope-blocked.txt"], gitEnv.env, "git add fixture scopes");
  runGit(repo, ["commit", "--quiet", "-m", "native alignment fixture"], gitEnv.env, "git initial commit");
  const worktrees = {};
  for (const label of labels) {
    const worktree = join(worktreeRoot, label);
    runGit(repo, ["worktree", "add", "--quiet", "--detach", worktree, "HEAD"], gitEnv.env, `git worktree ${label}`);
    const overlay = installOverlay(sourceEntries, worktree, `${fixtureRoot} ${label}`);
    worktrees[label] = { label, worktree, overlay };
  }
  const remotes = runGit(repo, ["remote"], gitEnv.env, "git remote");
  if (remotes !== "") blocked("fixture unexpectedly has a Git remote");
  return { fixtureRoot, repo, worktreeRoot, env: gitEnv.env, hooksDir: gitEnv.hooksDir, worktrees };
}

function gitCommonDir(worktree, env) {
  const commonRaw = runGit(worktree, ["rev-parse", "--git-common-dir"], env, "git rev-parse --git-common-dir");
  const common = resolve(worktree, commonRaw);
  return { common: existingDirectory("Git common directory", common) };
}

function parseGitStatus(output) {
  return String(output)
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ status: entry.slice(0, 2), path: entry.slice(3) }));
}

function assertWorktreeReadOnly(worktree, env, label, allowedCopies = []) {
  const allowedPaths = new Set(
    allowedCopies.map((copy) => relative(worktree, copy.destination).replaceAll("\\", "/")),
  );
  const status = parseGitStatus(runGit(worktree, ["status", "--porcelain=v1", "--untracked-files=all", "-z"], env, `${label} git status`));
  const unexpected = status.filter(({ path }) => !allowedPaths.has(path.replaceAll("\\", "/")));
  if (unexpected.length > 0) {
    assertion(`${label} changed files outside the exact frozen-package overlay`, {
      expectedRed: false,
      unexpectedPaths: unexpected.map(({ path }) => scrubText(path)),
    });
  }
  const remotes = runGit(worktree, ["remote"], env, `${label} git remote`);
  if (remotes !== "") assertion(`${label} added a Git remote`, { expectedRed: false });
}

function assertOverlayUnchanged(copies, label, destinationRoot) {
  for (const copy of copies) {
    ensureRegularFile(copy.source, `${label} source`);
    ensureRegularFile(copy.destination, `${label} copied source`);
    const sourceBytes = readFileSync(copy.source);
    const destinationBytes = readFileSync(copy.destination);
    if (!sourceBytes.equals(destinationBytes)) {
      assertion(`${label} changed copied package bytes`, { expectedRed: false, path: copy.destination });
    }
  }
  if (!destinationRoot) return;
  const expected = new Set(copies.map((copy) => comparePath(copy.destination)));
  for (const subtree of ["skills", "agents"]) {
    const root = join(destinationRoot, subtree);
    if (!existsSync(root)) continue;
    const info = lstatSync(root);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      assertion(`${label} replaced the copied overlay root`, { expectedRed: false, path: root });
    }
    for (const file of walkRegularFiles(root, `${label} overlay ${subtree}`)) {
      if (!expected.has(comparePath(file.path))) {
        assertion(`${label} created an unexpected copied-overlay file`, { expectedRed: false, path: file.path });
      }
    }
  }
}
function bindExistingOverlay(packageInfo, worktree, label) {
  const destinationRoot = join(worktree, ".omp");
  assertInside(worktree, destinationRoot, `${label} overlay`);
  const copies = packageInfo.entries.map((entry) => {
    const destination = join(destinationRoot, entry.destinationRelative);
    assertInside(destinationRoot, destination, `${label} overlay file`);
    return {
      source: entry.packagePath,
      packagePath: entry.packagePath,
      destination,
      sourceSha256: entry.sourceSha256,
      copySha256: entry.packageSha256,
      bytes: entry.bytes,
    };
  });
  assertOverlayUnchanged(copies, label, destinationRoot);
  return { destinationRoot, copies };
}

function readJsonFile(path, label) {
  ensureRegularFile(path, label);
  const bytes = readFileSync(path);
  let value;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch (error) {
    assertion(`${label} is not valid JSON`, { expectedRed: false, parseError: opaqueError(error?.message ?? error) });
  }
  return { path, bytes, value };
}

function scanJsonFiles(root, label) {
  const rootReal = existingDirectory(`${label} root`, root);
  const found = [];
  const visit = (directory, depth) => {
    if (depth > 32) blocked(`${label} checkpoint tree is too deep`);
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      blocked(`cannot inspect ${label} checkpoint tree`, { controlled: false, code: "CHECKPOINT_SCAN_ERROR", phase: "checkpoint_scan", opaque: opaqueError(error?.message ?? error) });
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) blocked(`${label} checkpoint tree contains a symlink: ${path}`);
      if (entry.isDirectory()) {
        visit(path, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        if (found.length >= 4096) blocked(`${label} checkpoint tree exceeded the controlled file limit`);
        const relativePath = relative(rootReal, path);
        if (relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) blocked(`${label} checkpoint escaped its root`);
        found.push(readJsonFile(path, `${label} ${relativePath}`));
      }
    }
  };
  visit(rootReal, 0);
  return found;
}

function rootAlignmentRecord(checkpoint) {
  const value = checkpoint.value;
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  if (value.checkpoint !== "alignment") return null;
  return value;
}

function rootField(record, key, expected) {
  return record && typeof record === "object" && !Array.isArray(record) && record[key] === expected;
}

function captureCheckpoint(root, options) {
  const {
    requestId,
    runId,
    before,
    label,
    requireIdentity = false,
  } = options;
  const files = scanJsonFiles(root, label);
  const checkpoints = files
    .map((checkpoint) => ({ checkpoint, record: rootAlignmentRecord(checkpoint) }))
    .filter(({ record }) => record !== null);
  const exact = checkpoints.filter(({ record }) => {
    if (record.request_id !== requestId) return false;
    return !requireIdentity || record.run_id === runId;
  });
  if (exact.length === 1) {
    const { checkpoint, record } = exact[0];
    return {
      checkpoint,
      record,
      observedRequestId: typeof record.request_id === "string" ? record.request_id : null,
      observedRunId: typeof record.run_id === "string" ? record.run_id : null,
      match: "exact",
    };
  }
  if (exact.length > 1) {
    assertion(`${label} produced duplicate root alignment checkpoints for one request`, {
      expectedRed: false,
      request_id: requestId,
      run_id: runId,
      paths: exact.map(({ checkpoint }) => checkpoint.path),
    });
  }
  const beforeByPath = new Map((before ?? []).map((checkpoint) => [checkpoint.path, checkpoint]));
  const fresh = checkpoints.filter(({ checkpoint }) => !beforeByPath.has(checkpoint.path));
  if (fresh.length === 1 && !requireIdentity) {
    const { checkpoint, record } = fresh[0];
    return {
      checkpoint,
      record,
      observedRequestId: typeof record.request_id === "string" ? record.request_id : null,
      observedRunId: typeof record.run_id === "string" ? record.run_id : null,
      match: "fresh-observed",
    };
  }
  if (!requireIdentity && fresh.length === 0) {
    const rewritten = checkpoints.filter(({ checkpoint }) => {
      const prior = beforeByPath.get(checkpoint.path);
      return prior && !prior.bytes.equals(checkpoint.bytes);
    });
    if (rewritten.length === 1) {
      const { checkpoint, record } = rewritten[0];
      return {
        checkpoint,
        record,
        observedRequestId: typeof record.request_id === "string" ? record.request_id : null,
        observedRunId: typeof record.run_id === "string" ? record.run_id : null,
        match: "rewritten-observed",
      };
    }
  }
  assertion(`${label} did not produce one identifiable root alignment checkpoint`, {
    expectedRed: false,
    provided_request_id: requestId,
    provided_run_id: runId,
    root_alignment_paths: checkpoints.map(({ checkpoint }) => checkpoint.path),
    fresh_paths: fresh.map(({ checkpoint }) => checkpoint.path),
    require_identity: requireIdentity,
  });
}

function findRootAlignmentCheckpoints(root, label) {
  return scanJsonFiles(root, label)
    .map((checkpoint) => ({ checkpoint, record: rootAlignmentRecord(checkpoint) }))
    .filter(({ record }) => record !== null);
}

function summarizeUsage(message) {
  const usage = message?.usage;
  if (!usage || typeof usage !== "object") return null;
  const result = {};
  for (const [key, value] of Object.entries(usage)) {
    if (sensitiveKey(key)) continue;
    if (typeof value === "number" || typeof value === "string") result[key] = value;
  }
  return result;
}

function opaqueError(value) {
  let raw;
  try {
    raw = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  raw = String(raw ?? "");
  const summary = {
    sha256: sha256Text(raw),
    bytes: Buffer.byteLength(raw, "utf8"),
  };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["code", "type", "status"]) {
      if (typeof value[key] === "string") summary[key] = value[key].slice(0, 128);
    }
  } else {
    summary.type = typeof value;
  }
  return summary;
}
function preRpcReferenceError(error, context) {
  if (context?.evidence?.scenarios?.length > 0) return null;
  if (error?.name !== "ReferenceError") return null;
  const message = typeof error?.message === "string" ? error.message : "";
  if (!/^[A-Za-z_$][\w$]* is not defined$/.test(message)) return null;
  const pointers = safeErrorMetadata(error).driver_stack;
  const stage = typeof context?.stage === "string" ? context.stage : "unknown";
  return scrubText(`ReferenceError: ${message}; stage=${stage}; source=${pointers.length > 0 ? pointers.join(",") : "unknown"}`);
}

function safeFailureDetail(error, context = null) {
  const operational = preRpcReferenceError(error, context);
  if (operational) return operational;
  if (error?.controlled !== false && (error?.kind === "ASSERTION" || error?.kind === "USAGE" || error?.kind === "BLOCKED")) return scrubText(error.message);
  if (error?.opaque) return error.opaque;
  return opaqueError(error?.message ?? error);
}
function safeErrorMetadata(error) {
  const stack = typeof error?.stack === "string" ? error.stack : "";
  const driverStack = [];
  for (const line of stack.split(/\r?\n/)) {
    if (/\bat new DriverError\b/.test(line)) continue;
    const match = line.match(/\bat\s+(?:async\s+)?(?:.*\()?(.+?):(\d+):(\d+)\)?\s*$/);
    if (!match) continue;
    const file = match[1].replaceAll("\\", "/").split("/").at(-1);
    if (file === "ship-native-alignment-regression.mjs") driverStack.push(`${file}:${match[2]}:${match[3]}`);
  }
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    code: typeof error?.code === "string" ? error.code : null,
    controlled: error?.controlled === true,
    driver_stack: driverStack,
  };
}

function findRawField(value, names, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return undefined;
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, child] of Object.entries(value)) {
    if (wanted.has(key.toLowerCase()) && (typeof child === "string" || typeof child === "boolean")) return child;
  }
  for (const child of Object.values(value)) {
    const found = findRawField(child, names, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}
function operationalResult(value) {
  const summary = opaqueError(value);
  for (const [target, names] of [
    ["code", ["code", "errorCode", "error_code"]],
    ["type", ["type", "errorType", "error_type"]],
    ["status", ["status", "state"]],
  ]) {
    const found = findRawField(value, names);
    if (typeof found === "string") summary[target] = found.slice(0, 128);
  }
  const failed = findRawField(value, ["failed", "isError", "is_error"]);
  const success = findRawField(value, ["success"]);
  if (typeof failed === "boolean") summary.failed = failed;
  if (typeof success === "boolean") summary.success = success;
  return summary;
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


function summarizeToolEvent(frame) {
  const result = {
    type: frame.type,
    toolCallId: eventCorrelationId(frame),
    toolName: eventToolName(frame),
    path: findRawField(frame, ["path"]),
    resolvedPath: findRawField(frame, ["resolvedPath", "resolved_path"]),
  };
  if (frame.type === "tool_execution_end") {
    const resultValue = frame.result ?? frame.output ?? frame.error;
    const completed = trustedBooleanState([frame, resultValue], ["completed"]);
    const failed = trustedBooleanState([frame, resultValue], ["failed", "isError", "is_error"]);
    const success = trustedBooleanState([frame, resultValue], ["success"]);
    if (resultValue !== undefined) {
      result.resultHash = opaqueError(resultValue).sha256;
      result.resultMeta = operationalResult(resultValue);
    }
    if (typeof frame.code === "string") result.code = frame.code.slice(0, 128);
    if (completed.present) result.completed = completed.positive && !completed.negative && !completed.contradictory;
    if (failed.present) result.failed = failed.positive || failed.contradictory;
    if (typeof frame.isError === "boolean") result.isError = frame.isError;
    if (failed.positive || failed.contradictory) result.isError = true;
    if (success.present) result.success = success.positive && !success.negative && !success.contradictory;
    if (frame.error !== undefined) result.failed = true;
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined && value !== null));
}

function summarizeMessageEnd(frame) {
  const message = frame.message && typeof frame.message === "object" ? frame.message : {};
  const blocks = Array.isArray(message.content) ? message.content : [];
  const textParts = [];
  const contentKinds = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (typeof block.type === "string") contentKinds.push(block.type);
    if (block.type === "text" && typeof block.text === "string") textParts.push(block.text);
  }
  if (typeof message.content === "string") textParts.push(message.content);
  const text = textParts.join("");
  const lower = text.toLowerCase();
  return {
    messageId: typeof frame.messageId === "string" ? frame.messageId : undefined,
    role: typeof message.role === "string" ? message.role : undefined,
    toolCallId: eventCorrelationId(message) ?? undefined,
    stopReason: typeof message.stopReason === "string" ? message.stopReason : undefined,
    contentKinds: [...new Set(contentKinds)].sort(),
    textSha256: sha256Text(text),
    textBytes: Buffer.byteLength(text, "utf8"),
    signals: {
      alignment: lower.includes("alignment"),
      checkpoint: lower.includes("checkpoint"),
      closed: /\bclosed\b/.test(lower),
      blocked: /\bblocked\b/.test(lower),
      error: /\berror\b|\bfailed\b|\bnot allowed\b/.test(lower),
      task: /\btask\b|\brequirements-reader\b/.test(lower),
    },
  };
}

function summarizeResponse(frame) {
  const data = frame.data;
  const summary = {
    id: typeof frame.id === "string" && UUID_V4.test(frame.id) ? frame.id : undefined,
    command: typeof frame.command === "string" ? frame.command : undefined,
    success: frame.success === true,
    code: typeof frame.code === "string" ? frame.code : undefined,
    error: frame.success === false && frame.error !== undefined ? opaqueError(frame.error) : undefined,
    dataKeys: data && typeof data === "object" ? Object.keys(data).filter((key) => !sensitiveKey(key)).sort() : [],
  };
  if (data && typeof data === "object") {
    if (typeof data.agentInvoked === "boolean") summary.agentInvoked = data.agentInvoked;
    if (Array.isArray(data.events)) summary.events = data.events.filter((item) => typeof item === "string");
    if (typeof data.protocolVersion === "number") summary.protocolVersion = data.protocolVersion;
    if (typeof data.messageUpdates === "string") summary.messageUpdates = data.messageUpdates;
  }
  return Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined));
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
    timer = setTimeout(() => reject(new DriverError("BLOCKED", `${label} timed out`, {
      code: "RPC_TIMEOUT",
      phase: label,
      timeout_ms: timeoutMs,
    })), timeoutMs);
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
    this.stdinEnded = false;
    this.fatal = null;
    this.lastFailure = null;
    this.phase = "spawn";
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
        event_filter: ["message_end", "tool_execution_start", "tool_execution_end", "agent_end"],
      },
      calls: [],
      results: [],
      tool_events: [],
      terminal: null,
      usage: [],
      lifecycle: { phase: this.phase },
      process: { exit_code: null, signal: null, closed: false },
      failure_meta: null,
    };
  }
  setPhase(phase) {
    this.phase = phase;
    this.evidence.lifecycle = { phase };
  }

  recordFailure(error) {
    this.lastFailure = error;
    const process = this.evidence.process ?? {};
    this.evidence.failure_meta = {
      code: typeof error?.code === "string" ? error.code : "RPC_FAILURE",
      phase: typeof error?.phase === "string" ? error.phase : this.phase,
      fatal_type: this.fatal?.kind ?? error?.kind ?? null,
      process_exit: Number.isInteger(process.exit_code) ? process.exit_code : null,
      process_signal: typeof process.signal === "string" ? process.signal : null,
      process_closed: process.closed === true,
    };
  }
  nativeError(code, phase, message, error) {
    return new DriverError("BLOCKED", message, {
      controlled: false,
      code,
      phase,
      opaque: opaqueError(error?.message ?? error),
    });
  }

  start() {
    this.setPhase("spawn");
    this.child = spawn(
      this.omp,
      ["--mode", "rpc", "--no-ui", "--no-session", "--no-extensions", "--no-context-files", "--no-lsp", "--no-title"],
      { cwd: this.cwd, env: this.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    this.setPhase(`${this.label}:ready`);
    this.child.stdout.on("data", (data) => this.onStdout(Buffer.from(data)));
    this.child.stdout.on("error", (error) => this.fail(this.nativeError("OMP_STDOUT_ERROR", "process_io", "OMP stdout error", error)));
    this.child.stderr.on("data", (data) => {
      // Do not persist or print stderr: provider/auth diagnostics may contain secrets.
      this.evidence.stderr_bytes = (this.evidence.stderr_bytes ?? 0) + Buffer.byteLength(data);
    });
    this.child.stderr.on("error", (error) => this.fail(this.nativeError("OMP_STDERR_ERROR", "process_io", "OMP stderr error", error)));
    this.child.stdin.on("error", (error) => this.fail(this.nativeError("OMP_STDIN_ERROR", "process_io", "OMP stdin error", error)));
    this.child.on("error", (error) => this.fail(this.nativeError("OMP_PROCESS_ERROR", "process", "OMP process error", error)));
    this.child.on("close", (code, signal) => {
      this.evidence.process = { exit_code: code, signal: signal ?? null, closed: true };
      if (this.rawBuffer.length > 0) this.fail(new DriverError("BLOCKED", "OMP closed with a partial RPC frame", { code: "RPC_PARTIAL_FRAME", phase: "transport_close" }));
      if (this.chunk) this.fail(new DriverError("BLOCKED", "OMP closed during rpc_chunk reassembly", { code: "RPC_CHUNK_INTERRUPTED", phase: "transport_close" }));
      this.closeDeferred.resolve({ code, signal });
      if (!this.readyResolved) this.ready.reject(new DriverError("BLOCKED", "OMP closed before ready", { code: "RPC_CLOSED_BEFORE_READY", phase: "transport_close" }));
      for (const waiter of this.pendingResponses.values()) waiter.reject(new DriverError("BLOCKED", "OMP closed before response", { code: "RPC_CLOSED_BEFORE_RESPONSE", phase: "transport_close" }));
      this.pendingResponses.clear();
      for (const waiter of this.promptResults.values()) waiter.reject(new DriverError("BLOCKED", "OMP closed before prompt_result", { code: "RPC_CLOSED_BEFORE_PROMPT_RESULT", phase: "transport_close" }));
      this.promptResults.clear();
      if (this.evidence.failure_meta && this.lastFailure) this.recordFailure(this.lastFailure);
    });
    return withTimeout(this.ready.promise, this.timeoutMs, `${this.label} ready`);
  }

  fail(error) {
    if (!this.fatal) this.fatal = error;
    this.recordFailure(this.fatal);
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
        if (this.rawBuffer.byteLength > MAX_PHYSICAL_FRAME_BYTES) {
          this.fail(new DriverError("BLOCKED", "RPC physical frame exceeded 1 MiB without newline"));
        }
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
        this.fail(new DriverError("BLOCKED", "invalid UTF-8/JSON RPC frame", {
          controlled: false,
          code: "RPC_FRAME_PARSE",
          phase: "transport_decode",
          opaque: opaqueError(error?.message ?? error),
        }));
        return;
      }
      try {
        this.consumePhysical(frame);
      } catch (error) {
        this.fail(error instanceof DriverError ? error : new DriverError("BLOCKED", "RPC consume failure", {
          controlled: false,
          code: "RPC_CONSUME_ERROR",
          phase: "transport_decode",
          opaque: opaqueError(error?.message ?? error),
        }));
        return;
      }
      if (this.fatal) return;
    }
  }

  consumePhysical(frame) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
      throw new DriverError("BLOCKED", "RPC frame is not a JSON object");
    }
    if (frame.type === "rpc_chunk") {
      if (this.protocolVersion !== 2) throw new DriverError("BLOCKED", "received rpc_chunk before protocol v2 was negotiated");
      const { chunkId, index, count, byteLength, data } = frame;
      if (typeof chunkId !== "string" || chunkId === "" || !Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(count) || count < 1 || index >= count || !Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_REASSEMBLED_FRAME_BYTES || typeof data !== "string") {
        throw new DriverError("BLOCKED", "invalid rpc_chunk metadata");
      }
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
        throw new DriverError("BLOCKED", "invalid rpc_chunk base64");
      }
      const decoded = Buffer.from(data, "base64");
      if (decoded.toString("base64") !== data) throw new DriverError("BLOCKED", "non-canonical rpc_chunk base64");
      if (!this.chunk) {
        if (index !== 0) throw new DriverError("BLOCKED", "rpc_chunk sequence did not start at index zero");
        this.chunk = { chunkId, count, byteLength, nextIndex: 0, bytes: [] , total: 0 };
      }
      if (this.chunk.chunkId !== chunkId || this.chunk.count !== count || this.chunk.byteLength !== byteLength || index !== this.chunk.nextIndex) {
        throw new DriverError("BLOCKED", "interleaved or out-of-order rpc_chunk sequence");
      }
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
          throw new DriverError("BLOCKED", "rpc_chunk payload is not strict UTF-8", {
            controlled: false,
            code: "RPC_CHUNK_UTF8",
            phase: "transport_decode",
            opaque: opaqueError(error?.message ?? error),
          });
        }
        let logical;
        try {
          logical = JSON.parse(text);
        } catch (error) {
          throw new DriverError("BLOCKED", "rpc_chunk payload is not JSON", {
            controlled: false,
            code: "RPC_CHUNK_JSON",
            phase: "transport_decode",
            opaque: opaqueError(error?.message ?? error),
          });
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
      const response = summarizeResponse(frame);
      this.evidence.results.push(response);
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
        error: frame.error ? opaqueError(frame.error) : undefined,
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
      const event = summarizeToolEvent(frame);
      event.sequence = this.evidence.tool_events.length + 1;
      this.evidence.tool_events.push(event);
      return;
    }
    if (frame.type === "message_end") {
      const message = frame.message && typeof frame.message === "object" ? frame.message : {};
      const usage = summarizeUsage(message);
      if (usage) this.evidence.usage.push(usage);
      const summary = summarizeMessageEnd(frame);
      this.evidence.messages = [...(this.evidence.messages ?? []), summary];
      this.evidence.terminal = { ...(this.evidence.terminal ?? {}), last_message: summary };
      this.evidence.message_end_count = (this.evidence.message_end_count ?? 0) + 1;
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
      return;
    }
    if (
      frame.type === "extension_ui_request" ||
      frame.type === "host_uri_request" ||
      frame.type === "host_tool_call" ||
      /login|auth/i.test(String(frame.type ?? ""))
    ) {
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
    } else if (command.type === "negotiate_protocol") {
      call.protocolVersion = command.protocolVersion;
    }
    this.evidence.calls.push(call);
    try {
      this.child.stdin.write(`${JSON.stringify(command)}\n`);
    } catch (error) {
      this.fail(this.nativeError("OMP_STDIN_WRITE_ERROR", "process_io", "OMP stdin write failed", error));
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

  async configure() {
    this.setPhase(`${this.label}:protocol`);
    const negotiationId = randomUUID();
    const negotiation = await this.requestResponse(
      { id: negotiationId, type: "negotiate_protocol", protocolVersion: 2 },
      "protocol negotiation",
    );
    if (negotiation.success === true) {
      this.protocolVersion = 2;
      this.evidence.rpc.protocol = { version: 2, negotiated: true };
    } else {
      const supported = this.evidence.rpc.ready?.supportedProtocolVersions ?? [];
      if (supported.includes(2)) throw new DriverError("BLOCKED", `${this.label} protocol v2 negotiation failed despite advertisement`);
      this.protocolVersion = 1;
      this.evidence.rpc.protocol = { version: 1, negotiated: false, fallbackError: opaqueError(negotiation.error) };
    }
    this.setPhase(`${this.label}:event_filter`);
    const filterId = randomUUID();
    const filter = await this.requestResponse(
      {
        id: filterId,
        type: "set_event_filter",
        events: ["message_end", "tool_execution_start", "tool_execution_end", "agent_end"],
        messageUpdates: "full",
      },
      "event filter",
    );
    if (filter.success !== true) throw new DriverError("BLOCKED", `${this.label} event filter was rejected`);
    const events = filter.data?.events;
    if (!Array.isArray(events) || events.join("\0") !== ["message_end", "tool_execution_start", "tool_execution_end", "agent_end"].join("\0")) {
      throw new DriverError("BLOCKED", `${this.label} event filter response did not confirm the requested events`);
    }
    this.evidence.rpc.event_filter_confirmed = events;
  }

  async execute(message) {
    await this.start();
    await this.configure();
    this.setPhase(`${this.label}:prompt`);
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
    this.setPhase(`${this.label}:prompt_acknowledgement`);
    const acknowledgement = await acknowledgementPromise;
    if (acknowledgement.success !== true) throw new DriverError("BLOCKED", `${this.label} prompt was not admitted`, { code: "PROMPT_NOT_ADMITTED", phase: "prompt_acknowledgement" });
    if (acknowledgement.data?.agentInvoked === false) {
      assertion(`${this.label} prompt completed locally without invoking the root model`, { expectedRed: false });
    }
    this.setPhase(`${this.label}:prompt_result`);
    const result = await resultPromise;
    if (result.status !== "completed" || result.agentInvoked !== true) {
      throw new DriverError("BLOCKED", `${this.label} prompt ended without a completed root-model turn`, { code: "PROMPT_NOT_COMPLETED", phase: "prompt_result" });
    }
    if (result.sessionSettled !== true) {
      this.setPhase(`${this.label}:session_settled`);
      await this.awaitSettled();
    }
    this.evidence.terminal = {
      ...(this.evidence.terminal ?? {}),
      status: result.status,
      sessionSettled: result.sessionSettled === true || this.settled,
    };
    return this.evidence;
  }

  async close() {
    if (!this.child || this.stdinEnded) return;
    this.setPhase(`${this.label}:process_drain`);
    this.stdinEnded = true;
    this.child.stdin.end();
    try {
      const closed = await withTimeout(this.closeDeferred.promise, 30_000, `${this.label} process drain`);
      if (this.fatal) {
        this.recordFailure(this.fatal);
        throw this.fatal;
      }
      if (closed.code !== 0) {
        const error = new DriverError("BLOCKED", `${this.label} OMP exited unsuccessfully`, { code: "OMP_EXIT_NONZERO", phase: "process_drain" });
        this.recordFailure(error);
        throw error;
      }
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  async abort() {
    if (!this.child) return;
    try {
      if (!this.stdinEnded && !this.child.killed) {
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
    try {
      await withTimeout(this.closeDeferred.promise, 2_000, `${this.label} abort drain`);
    } catch {
      // Preserve the original failure; process metadata remains explicitly incomplete.
    }
  }
}

function buildPrompt({ requestId, runId, mode, reason, scope, sourceRoot, expectBlocked = false }) {
  const blockedInstruction = expectBlocked
    ? "This request intentionally leaves one material decision unanswered. Do not infer it or interview again: persist a fail-closed BLOCKED handoff with the real frontier and stop."
    : "This request is fully specified. Use fast-close without asking a new interview question and persist the durable CLOSED handoff before reporting.";
  return [
    "Perform exactly one real alignment checkpoint for the current worktree using the locally discovered alignment skill and routing/persistence reference.",
    `request_id=${requestId}`,
    `run_id=${runId}`,
    `mode=${mode}`,
    `objective_risk=${reason}`,
    `independent_scope=${scope}`,
    `source_hint=${join(sourceRoot, "alignment", "SKILL.md")}`,
    `route_reference_hint=${join(sourceRoot, "alignment", "references", "routing-and-persistence.md")}`,
    blockedInstruction,
    "Read the source and persistence route with your normal read tool before acting; the driver will verify those reads from correlated RPC tool events.",
    "Resolve the actual current Git common directory yourself when mode=git; do not accept or invent a checkpoint pathname from this request.",
    "The only permitted disk mutation is the product's normal durable alignment checkpoint/handoff. Do not implement code, edit source or copied skill text, create commits, initialize Git for local mode, add remotes, publish, invoke Ship, access a host, or make external requests.",
    "Do not fabricate checkpoint JSON or use the assistant response as proof. Read back the durable checkpoint and report the observed terminal status only after that read-back.",
  ].join("\n");
}
function buildResumePrompt({ requestId, runId, mode, route, reason, scope, sourceRoot, answer, collision = false }) {
  const collisionInstruction = collision
    ? "A real filesystem successor-slot collision may be present. Inspect the existing sealed or partial successor and follow the alignment contract: if reservation or parent validation fails, return BLOCKED without replacing, truncating, unlinking, repairing, or renaming any existing record."
    : "Resume only from the exact sealed handoff and publish one exclusive append-only successor after validating the parent and full history.";
  return [
    "Resume the exact durable alignment handoff for this same request and run; do not start a new namespace or a new interview.",
    `request_id=${requestId}`,
    `run_id=${runId}`,
    `mode=${mode}`,
    `route=${route}`,
    `objective_risk=${reason}`,
    `independent_scope=${scope}`,
    `resume_answer=${answer}`,
    `source_hint=${join(sourceRoot, "alignment", "SKILL.md")}`,
    `route_reference_hint=${join(sourceRoot, "alignment", "references", "routing-and-persistence.md")}`,
    "Read the source and persistence route with your normal read tool before acting; resolve the actual Git common directory yourself.",
    "Read the exact persisted namespace, sequence, identities, parent bytes and history before resuming. Append the supplied response to the persisted response history; never replace it or infer an answer.",
    collisionInstruction,
    "The only permitted disk mutation is the product's normal durable alignment checkpoint/handoff. Do not edit source or copied skill text, create commits, add remotes, publish, invoke Ship, access a host, or make external requests.",
    "Do not fabricate checkpoint JSON or use the assistant response as proof. Read back the durable result and report its observed terminal status only after that read-back.",
  ].join("\n");
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

function collectPathValues(value, keyHint = "", output = [], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return output;
  if (typeof value === "string") {
    if (/(?:path|file|uri|argument|args|input|command)/i.test(keyHint)) {
      output.push(value);
      if (/^(?:\{|\[)/.test(value.trim())) {
        try {
          collectPathValues(JSON.parse(value), "parsed_args", output, depth + 1);
        } catch {
          // A non-JSON argument string carries no structured path evidence.
        }
      }
    }
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathValues(item, keyHint, output, depth + 1);
    return output;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collectPathValues(child, key, output, depth + 1);
  }
  return output;
}

function normalizeObservedPath(value) {
  return String(value).replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase();
}

function normalizeReadToolPath(value) {
  // Whole-file :raw is a read selector, not part of the filesystem pathname.
  // Do not accept line ranges, basename matches, or unrelated suffixes.
  return normalizeObservedPath(String(value).replace(/:raw$/i, ""));
}

function pathMatchesSource(pathValue, sourceRoot, relativePath, trustedOverlayRoot = null) {
  if (typeof pathValue !== "string" || pathValue.trim() === "") return false;
  const raw = pathValue.trim();
  const observed = normalizeReadToolPath(raw);
  const expectedAbsolute = normalizeObservedPath(join(sourceRoot, "alignment", relativePath));
  const expectedCopied = normalizeObservedPath(`/.omp/skills/alignment/${relativePath}`);
  const trustedOverlay = trustedOverlayRoot
    ? normalizeObservedPath(join(trustedOverlayRoot, "skills", "alignment", relativePath))
    : null;
  if (observed === expectedAbsolute || observed === expectedCopied || observed === expectedCopied.slice(1) || observed === trustedOverlay) return true;
  const pathWithoutSelector = raw.replace(/:raw$/i, "");
  const absoluteInput = isAbsolute(pathWithoutSelector) || /^[a-z]:[\\/]/i.test(pathWithoutSelector) || /^\\\\/.test(pathWithoutSelector);
  if (absoluteInput) return false;
  const sourceRelative = normalizeObservedPath(resolve(sourceRoot, pathWithoutSelector));
  if (sourceRelative === expectedAbsolute) return true;
  const relativeOverlay = observed.replace(/^\.\/+/, "");
  return relativeOverlay === expectedCopied.slice(1);
}

function assertToolReadEvidence(sessionEvidence, label, sourceRoot, trustedOverlayRoot = null) {
  const toolEvents = sessionEvidence.tool_events ?? [];
  const starts = toolEvents.filter((event) => event.type === "tool_execution_start");
  const ends = toolEvents.filter((event) => event.type === "tool_execution_end");
  const observed = { source: false, route: false, pairs: 0 };
  for (const start of starts) {
    const startName = eventToolName(start);
    if (!startName || !/(?:^|[.:/_-])read$/i.test(startName)) continue;
    const id = eventCorrelationId(start);
    if (!id) continue;
    const end = ends.find((candidate) =>
      eventCorrelationId(candidate) === id
      && Number.isSafeInteger(candidate.sequence)
      && Number.isSafeInteger(start.sequence)
      && candidate.sequence > start.sequence
    );
    if (!end) continue;
    const endName = eventToolName(end);
    if (endName && !/(?:^|[.:/_-])read$/i.test(endName)) continue;
    if (end.isError !== false || end.completed === false || end.failed === true || end.success === false) continue;
    const paths = [
      ...collectPathValues(start),
      ...collectPathValues(end),
    ];
    if (paths.some((value) => pathMatchesSource(value, sourceRoot, "SKILL.md", trustedOverlayRoot))) observed.source = true;
    if (paths.some((value) => pathMatchesSource(value, sourceRoot, "references/routing-and-persistence.md", trustedOverlayRoot))) observed.route = true;
  }
  if (!observed.source || !observed.route) {
    assertion(`${label} lacks correlated read-tool evidence for the alignment source and route`, {
      expectedRed: false,
      observed,
    });
  }
}
function assertToolReadPaths(sessionEvidence, label, expectedPaths) {
  const toolEvents = sessionEvidence.tool_events ?? [];
  const starts = toolEvents.filter((event) => event.type === "tool_execution_start");
  const ends = toolEvents.filter((event) => event.type === "tool_execution_end");
  const expected = expectedPaths.map((value) => normalizeObservedPath(value));
  const observed = new Set();
  for (const start of starts) {
    const startName = eventToolName(start);
    if (!startName || !/(?:^|[.:/_-])read$/i.test(startName)) continue;
    const id = eventCorrelationId(start);
    if (!id) continue;
    const end = ends.find((candidate) =>
      eventCorrelationId(candidate) === id
      && Number.isSafeInteger(candidate.sequence)
      && Number.isSafeInteger(start.sequence)
      && candidate.sequence > start.sequence
    );
    if (!end || end.isError !== false || end.completed === false || end.failed === true || end.success === false) continue;
    const endName = eventToolName(end);
    if (endName && !/(?:^|[.:/_-])read$/i.test(endName)) continue;
    for (const value of [...collectPathValues(start), ...collectPathValues(end)]) {
      const normalized = normalizeReadToolPath(value);
      if (expected.includes(normalized)) observed.add(normalized);
    }
  }
  const missing = expected.filter((value) => !observed.has(value));
  if (missing.length > 0) {
    assertion(`${label} lacks correlated completed reads for required durable paths`, {
      expectedRed: false,
      missing,
      observed: [...observed],
    });
  }
}
function assertTerminalSignal(sessionEvidence, label, signal) {
  const message = sessionEvidence?.terminal?.last_message;
  if (message?.role !== "assistant" || message?.signals?.[signal] !== true) {
    assertion(`${label} did not report the required terminal assistant ${signal} outcome`, { expectedRed: false });
  }
}


async function executeCase({ context, fixture, overlay, label, worktree, mode, route, reason, scope, requestId, runId, expectBlocked = false, promptMessage = null }) {
  const caseEvidence = {
    label,
    mode,
    route,
    request_id: requestId,
    run_id: runId,
    worktree,
    started_at: now(),
    overlay: overlay
      ? {
          destinationRoot: overlay.destinationRoot,
          copies: overlay.copies.map((copy) => ({
            destination: copy.destination,
            sourceSha256: copy.sourceSha256,
            copySha256: copy.copySha256,
            bytes: copy.bytes,
          })),
        }
      : null,
  };
  const session = new RpcSession({
    omp: context.omp,
    cwd: worktree,
    env: context.ompEnv,
    label,
    requestId,
    runId,
    timeoutMs: context.timeoutMs,
  });
  try {
    await session.execute(promptMessage ?? buildPrompt({ requestId, runId, mode, reason, scope, sourceRoot: context.source, expectBlocked }));
    if (expectBlocked) assertTerminalSignal(session.evidence, label, "blocked");
    assertToolReadEvidence(session.evidence, label, context.source, join(worktree, ".omp"));
    await session.close();
    caseEvidence.session = session.evidence;
  } catch (error) {
    session.recordFailure(error);
    error.session_failure = session.evidence.failure_meta;
    caseEvidence.session = session.evidence;
    context.evidence.scenarios.push(caseEvidence);
    await session.abort();
    error.session_failure = session.evidence.failure_meta;
    throw error;
  }
  caseEvidence.finished_at = now();
  context.evidence.scenarios.push(caseEvidence);
  return caseEvidence;
}

function checkpointEvidence(context, label, checkpoint, record, correlation = {}) {
  const item = {
    label,
    path: checkpoint.path,
    bytes: checkpoint.bytes.byteLength,
    sha256: sha256Bytes(checkpoint.bytes),
    record: sanitizeValue(record),
    provided_request_id: correlation.requestId ?? null,
    observed_request_id: correlation.observedRequestId ?? null,
    provided_run_id: correlation.runId ?? null,
    observed_run_id: correlation.observedRunId ?? null,
    correlation_match: correlation.match ?? null,
  };
  context.evidence.checkpoints.push(item);
}

function assertObservedRunId(captured, runId, label, expectedRed = false) {
  if (captured.observedRunId !== null && captured.observedRunId !== runId) {
    assertion(`${label} persisted a different run_id`, {
      expectedRed,
      provided_run_id: runId,
      observed_run_id: captured.observedRunId,
    });
  }
}
function assertFastClose(record, label, allowResponses = false) {
  if (!record || Array.isArray(record) || typeof record !== "object") {
    assertion(`${label} did not persist an alignment record`, { expectedRed: false });
  }
  if (
    record.checkpoint !== "alignment"
    || typeof record.request_id !== "string"
    || !UUID_V4.test(record.request_id)
    || typeof record.run_id !== "string"
    || !UUID_V4.test(record.run_id)
    || typeof record.request_canonical !== "string"
    || record.request_canonical.length === 0
    || typeof record.request_digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/i.test(record.request_digest)
    || !Array.isArray(record.frontier)
    || record.frontier.length !== 0
    || !Array.isArray(record.responses)
    || (!allowResponses && record.responses.length !== 0)
    || typeof record.closure !== "string"
    || record.closure.trim() === ""
    || record.closureRecorded !== true
    || record.status !== "CLOSED"
  ) {
    assertion(`${label} did not persist a valid fully-specified fast-close`, { expectedRed: false });
  }
}
function assertClosedResume(record, label) {
  if (
    !record
    || Array.isArray(record)
    || typeof record !== "object"
    || record.checkpoint !== "alignment"
    || typeof record.request_id !== "string"
    || !UUID_V4.test(record.request_id)
    || typeof record.run_id !== "string"
    || !UUID_V4.test(record.run_id)
    || typeof record.request_canonical !== "string"
    || record.request_canonical.length === 0
    || typeof record.request_digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/i.test(record.request_digest)
    || !Array.isArray(record.frontier)
    || record.frontier.length !== 0
    || !Array.isArray(record.responses)
    || typeof record.closure !== "string"
    || record.closure.trim() === ""
    || record.closureRecorded !== true
    || record.status !== "CLOSED"
  ) {
    assertion(`${label} did not persist a valid resolved-decision close`, { expectedRed: false });
  }
}

function assertBlockedHandoff(record, label) {
  if (
    !record
    || Array.isArray(record)
    || typeof record !== "object"
    || record.checkpoint !== "alignment"
    || typeof record.request_id !== "string"
    || !UUID_V4.test(record.request_id)
    || typeof record.run_id !== "string"
    || !UUID_V4.test(record.run_id)
    || typeof record.request_canonical !== "string"
    || record.request_canonical.length === 0
    || typeof record.request_digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/i.test(record.request_digest)
    || !Array.isArray(record.frontier)
    || record.frontier.length === 0
    || !Array.isArray(record.responses)
    || typeof record.closure !== "string"
    || record.closure.length === 0
    || typeof record.closureRecorded !== "boolean"
    || record.status !== "BLOCKED"
  ) {
    assertion(`${label} did not persist a valid fail-closed handoff`, { expectedRed: false });
  }
}

async function runRed(context, sourceEntries) {
  const fixture = createGitFixture(join(context.runRoot, "red-git"), sourceEntries, ["worktree-a", "worktree-b"], context.runRoot);
  const a = { requestId: randomUUID(), runId: randomUUID() };
  const b = { requestId: randomUUID(), runId: randomUUID() };
  if (!UUID_V4.test(a.requestId) || !UUID_V4.test(a.runId) || !UUID_V4.test(b.requestId) || !UUID_V4.test(b.runId)) blocked("driver generated a non-v4 correlation identity");
  const worktreeA = fixture.worktrees["worktree-a"];
  const worktreeB = fixture.worktrees["worktree-b"];
  const resolvedA = gitCommonDir(worktreeA.worktree, fixture.env);
  const beforeA = scanJsonFiles(resolvedA.common, "RED-A before");
  await executeCase({
    context,
    fixture,
    overlay: worktreeA.overlay,
    label: "RED-A",
    worktree: worktreeA.worktree,
    mode: "git",
    route: "short",
    reason: "one localized reversible low-risk read-only checkpoint",
    scope: "A",
    requestId: a.requestId,
    runId: a.runId,
  });
  assertOverlayUnchanged(worktreeA.overlay.copies, "RED-A", worktreeA.overlay.destinationRoot);
  assertWorktreeReadOnly(worktreeA.worktree, fixture.env, "RED-A", worktreeA.overlay.copies);
  const capturedA = captureCheckpoint(resolvedA.common, {
    requestId: a.requestId,
    runId: a.runId,
    before: beforeA,
    label: "RED-A after",
  });
  assertObservedRunId(capturedA, a.runId, "RED-A");
  assertFastClose(capturedA.record, "RED-A");
  checkpointEvidence(context, "RED-A", capturedA.checkpoint, capturedA.record, {
    requestId: a.requestId,
    observedRequestId: capturedA.observedRequestId,
    runId: a.runId,
    observedRunId: capturedA.observedRunId,
    match: capturedA.match,
  });
  const aPath = capturedA.checkpoint.path;
  const aBytes = Buffer.from(capturedA.checkpoint.bytes);
  const beforeB = scanJsonFiles(resolvedA.common, "RED-B before");
  const resolvedB = gitCommonDir(worktreeB.worktree, fixture.env);
  if (!samePath(resolvedA.common, resolvedB.common)) {
    assertion("RED-A and RED-B did not resolve the same real Git common directory", { expectedRed: false });
  }

  // Deliberately wait for A's terminal RPC result and disk read-back before B.
  await executeCase({
    context,
    fixture,
    overlay: worktreeB.overlay,
    label: "RED-B",
    worktree: worktreeB.worktree,
    mode: "git",
    route: "short",
    reason: "a separate localized reversible low-risk read-only checkpoint",
    scope: "B",
    requestId: b.requestId,
    runId: b.runId,
  });
  assertOverlayUnchanged(worktreeB.overlay.copies, "RED-B", worktreeB.overlay.destinationRoot);
  assertWorktreeReadOnly(worktreeB.worktree, fixture.env, "RED-B", worktreeB.overlay.copies);
  const capturedB = captureCheckpoint(resolvedB.common, {
    requestId: b.requestId,
    runId: b.runId,
    before: beforeB,
    label: "RED-B after",
  });
  assertObservedRunId(capturedB, b.runId, "RED-B");
  assertFastClose(capturedB.record, "RED-B");
  checkpointEvidence(context, "RED-B", capturedB.checkpoint, capturedB.record, {
    requestId: b.requestId,
    observedRequestId: capturedB.observedRequestId,
    runId: b.runId,
    observedRunId: capturedB.observedRunId,
    match: capturedB.match,
  });
  if (a.requestId === b.requestId || a.runId === b.runId) assertion("RED driver identities are not distinct", { expectedRed: false });

  const afterB = scanJsonFiles(resolvedB.common, "RED-A after B");
  const aAfterB = afterB.find((checkpoint) => samePath(checkpoint.path, aPath));
  const aRecordAfterB = aAfterB ? rootAlignmentRecord(aAfterB) : null;
  const bDistinctPath = !samePath(capturedB.checkpoint.path, aPath);
  const aIdentityEvidence = capturedA.observedRequestId !== null || capturedA.observedRunId !== null;
  const aIdentitySurvived = aAfterB
    && aAfterB.bytes.equals(aBytes)
    && aRecordAfterB
    && aRecordAfterB.request_id === capturedA.observedRequestId
    && (aIdentityEvidence || bDistinctPath);
  if (!aIdentitySurvived) {
    assertion("RED regression: B deleted, rewrote, or lost A's Git checkpoint identity", {
      expectedRed: true,
      a_path: aPath,
      a_before_sha256: sha256Bytes(aBytes),
      a_after_sha256: aAfterB ? sha256Bytes(aAfterB.bytes) : null,
      observed_a_request_id: aRecordAfterB?.request_id ?? null,
      expected_a_request_id: capturedA.observedRequestId,
      b_path: capturedB.checkpoint.path,
      b_distinct_path: bDistinctPath,
      a_identity_evidence: aIdentityEvidence,
    });
  }
  context.evidence.assertions.push({
    id: "AC-009.namespace-cas",
    status: "PASS",
    detail: "A and B retained distinct Git checkpoint files and A raw bytes survived B",
    paths: [aPath, capturedB.checkpoint.path],
  });
  return { status: "PASS", request_ids: [a.requestId, b.requestId], run_ids: [a.runId, b.runId] };
}

function localCheckpointFor(localRoot, requestId, runId, label) {
  const roots = findRootAlignmentCheckpoints(localRoot, label);
  const matches = roots.filter(({ record }) => record.request_id === requestId && record.run_id === runId);
  if (matches.length !== 1) {
    assertion(`${label} local mode did not persist exactly one root request/run handoff`, {
      expectedRed: false,
      observedMatches: matches.length,
      paths: roots.map(({ checkpoint }) => checkpoint.path),
    });
  }
  return matches[0];
}
function captureNamespaceSequence(root, { requestId, runId, expectedCount, label }) {
  const matches = scanJsonFiles(root, label)
    .map((checkpoint) => ({ checkpoint, record: rootAlignmentRecord(checkpoint) }))
    .filter(({ record }) => record !== null && record.request_id === requestId && record.run_id === runId)
    .sort((left, right) => left.checkpoint.path.localeCompare(right.checkpoint.path));
  if (matches.length !== expectedCount) {
    assertion(`${label} did not expose the expected append-only namespace sequence`, {
      expectedRed: false,
      expectedCount,
      observedCount: matches.length,
      paths: matches.map(({ checkpoint }) => checkpoint.path),
    });
  }
  const namespace = resolve(dirname(matches[0].checkpoint.path));
  const segments = namespace.replaceAll("\\", "/").split("/").map((segment) => segment.toLowerCase());
  if (!segments.includes(requestId.toLowerCase()) || !segments.includes(runId.toLowerCase())) {
    assertion(`${label} namespace path does not contain both request_id and run_id`, { expectedRed: false });
  }
  for (const [index, item] of matches.entries()) {
    const fileName = item.checkpoint.path.replaceAll("\\", "/").split("/").at(-1);
    const expectedName = `checkpoint-${String(index).padStart(6, "0")}.json`;
    if (fileName !== expectedName) {
      assertion(`${label} sequence did not use the expected sealed successor name`, {
        expectedRed: false,
        expectedName,
        observedName: fileName,
      });
    }
  }
  return { namespace, records: matches };
}

function listCheckpointBytes(namespace, label) {
  const root = existingDirectory(`${label} namespace`, namespace);
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink() || entry.isDirectory() || !entry.isFile()) blocked(`${label} namespace contains an unexpected non-file entry`);
    ensureRegularFile(path, `${label} namespace entry`);
    result.push({ path, bytes: readFileSync(path) });
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

function assertCheckpointBytesUnchanged(before, after, label) {
  if (before.length !== after.length) {
    assertion(`${label} changed checkpoint slot count`, { expectedRed: false, before: before.length, after: after.length });
  }
  for (let index = 0; index < before.length; index += 1) {
    if (!samePath(before[index].path, after[index].path) || !before[index].bytes.equals(after[index].bytes)) {
      assertion(`${label} changed an existing checkpoint slot`, { expectedRed: false, path: before[index].path });
    }
  }
}

function nextCheckpointPath(namespace, index, label) {
  const path = join(namespace, `checkpoint-${String(index).padStart(6, "0")}.json`);
  try {
    lstatSync(path);
    assertion(`${label} collision slot already existed before fixture creation`, { expectedRed: false });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return path;
}
function collectStringValues(value, output = [], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return output;
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, output, depth + 1);
    return output;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value)) collectStringValues(child, output, depth + 1);
  }
  return output;
}

function assertResumedCheckpoint(previous, resumed, parentPath, parentBytes, label) {
  assertClosedResume(resumed, label);
  if (!rootField(resumed, "mode", "git") || !rootField(resumed, "route", "full") || typeof resumed.reason !== "string" || resumed.reason.trim() === "") {
    assertion(`${label} did not preserve the resolved Git full route and reason`, { expectedRed: false });
  }
  if (!Array.isArray(previous.responses) || !Array.isArray(resumed.responses) || resumed.responses.length <= previous.responses.length) {
    assertion(`${label} did not append a resumed response history`, { expectedRed: false });
  }
  const appended = resumed.responses.slice(previous.responses.length);
  if (appended.length !== 1) {
    assertion(`${label} did not append exactly one new response`, { expectedRed: false, appended: appended.length });
  }
  const response = appended[0];
  const priorRounds = previous.responses.map((item) => item?.round).filter((round) => Number.isInteger(round));
  const priorQuestionIds = new Set(previous.responses.map((item) => item?.question_id).filter((questionId) => typeof questionId === "string"));
  if (
    !response
    || typeof response !== "object"
    || !Number.isInteger(response.round)
    || response.round < 1
    || (priorRounds.length > 0 && response.round <= Math.max(...priorRounds))
    || typeof response.question_id !== "string"
    || response.question_id.trim() === ""
    || priorQuestionIds.has(response.question_id)
    || typeof response.question !== "string"
    || response.question.trim() === ""
    || typeof response.answer !== "string"
    || response.answer.trim() === ""
  ) {
    assertion(`${label} appended an invalid or non-forward response record`, { expectedRed: false });
  }
  if (!Array.isArray(previous.history) || !Array.isArray(resumed.history) || resumed.history.length <= previous.history.length) {
    assertion(`${label} did not append persisted response history`, { expectedRed: false });
  }
  const appendedHistory = resumed.history.slice(previous.history.length);
  if (appendedHistory.length !== 1) {
    assertion(`${label} did not append exactly one persisted history item`, { expectedRed: false, appended: appendedHistory.length });
  }
  const historyItem = appendedHistory[0];
  if (
    !historyItem
    || typeof historyItem !== "object"
    || historyItem.question_id !== response.question_id
    || historyItem.question !== response.question
    || historyItem.answer !== response.answer
  ) {
    assertion(`${label} did not bind the appended answer to persisted history`, { expectedRed: false });
  }
  for (let index = 0; index < previous.history.length; index += 1) {
    if (JSON.stringify(previous.history[index]) !== JSON.stringify(resumed.history[index])) {
      assertion(`${label} replaced persisted history`, { expectedRed: false });
    }
  }
  if (typeof previous.request_canonical === "string" && previous.request_canonical === resumed.request_canonical) {
    assertion(`${label} did not recalculate request canonicalization after the resumed response`, { expectedRed: false });
  }
  if (typeof previous.request_digest === "string" && previous.request_digest.toLowerCase() === String(resumed.request_digest).toLowerCase()) {
    assertion(`${label} did not recalculate request digest after the resumed response`, { expectedRed: false });
  }
  for (let index = 0; index < previous.responses.length; index += 1) {
    if (JSON.stringify(previous.responses[index]) !== JSON.stringify(resumed.responses[index])) {
      assertion(`${label} replaced persisted response history`, { expectedRed: false });
    }
  }
  const strings = collectStringValues(resumed);
  const parentName = parentPath.replaceAll("\\", "/").split("/").at(-1).toLowerCase();
  const parentHash = sha256Bytes(parentBytes);
  const parentPathObserved = strings.some((value) => {
    const normalized = normalizeObservedPath(value);
    return normalized === parentName || normalized.endsWith(`/${parentName}`);
  });
  const normalizedStrings = strings.map((value) => value.toLowerCase());
  const parentHashObserved = normalizedStrings.includes(parentHash) || normalizedStrings.includes(`sha256:${parentHash}`);
  if (!parentPathObserved || !parentHashObserved) {
    assertion(`${label} did not reference the sealed parent path and hash`, {
      expectedRed: false,
      parent_path_observed: parentPathObserved,
      parent_hash_observed: parentHashObserved,
    });
  }
}
async function runGreenResumeAndCollisionControls(context, sourceEntries) {
  const fixture = createGitFixture(
    join(context.runRoot, "green-resume-git"),
    sourceEntries,
    ["resume-a", "resume-b"],
    context.runRoot,
  );
  const a = { requestId: randomUUID(), runId: randomUUID() };
  const b = { requestId: randomUUID(), runId: randomUUID() };
  if (!UUID_V4.test(a.requestId) || !UUID_V4.test(a.runId) || !UUID_V4.test(b.requestId) || !UUID_V4.test(b.runId)) {
    blocked("green resume controls generated a non-v4 identity");
  }
  const worktreeA = fixture.worktrees["resume-a"];
  const worktreeB = fixture.worktrees["resume-b"];
  const gitA = gitCommonDir(worktreeA.worktree, fixture.env);
  const gitB = gitCommonDir(worktreeB.worktree, fixture.env);
  if (!samePath(gitA.common, gitB.common)) assertion("GREEN resume controls did not share the Git common directory", { expectedRed: false });

  await executeCase({
    context,
    fixture,
    overlay: worktreeA.overlay,
    label: "GREEN-resume-A-initial",
    worktree: worktreeA.worktree,
    mode: "git",
    route: "full",
    reason: "a material decision remains open and must fail closed before resume",
    scope: "resume-a",
    requestId: a.requestId,
    runId: a.runId,
    expectBlocked: true,
  });
  assertOverlayUnchanged(worktreeA.overlay.copies, "GREEN-resume-A-initial", worktreeA.overlay.destinationRoot);
  assertWorktreeReadOnly(worktreeA.worktree, fixture.env, "GREEN-resume-A-initial", worktreeA.overlay.copies);
  const initialA = captureNamespaceSequence(gitA.common, {
    requestId: a.requestId,
    runId: a.runId,
    expectedCount: 1,
    label: "GREEN-resume-A-initial after",
  });
  const initialARecord = initialA.records[0];
  assertBlockedHandoff(initialARecord.record, "GREEN-resume-A-initial");
  if (!rootField(initialARecord.record, "mode", "git") || !rootField(initialARecord.record, "route", "full") || typeof initialARecord.record.reason !== "string" || initialARecord.record.reason.trim() === "") {
    assertion("GREEN-resume-A-initial did not persist its Git fail-closed route", { expectedRed: false });
  }
  checkpointEvidence(context, "GREEN-resume-A-initial", initialARecord.checkpoint, initialARecord.record, {
    requestId: a.requestId,
    observedRequestId: initialARecord.record.request_id,
    runId: a.runId,
    observedRunId: initialARecord.record.run_id,
  });

  await executeCase({
    context,
    fixture,
    overlay: worktreeB.overlay,
    label: "GREEN-resume-B-initial",
    worktree: worktreeB.worktree,
    mode: "git",
    route: "full",
    reason: "a separate material decision remains open and must fail closed before resume",
    scope: "resume-b",
    requestId: b.requestId,
    runId: b.runId,
    expectBlocked: true,
  });
  assertOverlayUnchanged(worktreeB.overlay.copies, "GREEN-resume-B-initial", worktreeB.overlay.destinationRoot);
  assertWorktreeReadOnly(worktreeB.worktree, fixture.env, "GREEN-resume-B-initial", worktreeB.overlay.copies);
  const initialB = captureNamespaceSequence(gitB.common, {
    requestId: b.requestId,
    runId: b.runId,
    expectedCount: 1,
    label: "GREEN-resume-B-initial after",
  });
  const initialBRecord = initialB.records[0];
  assertBlockedHandoff(initialBRecord.record, "GREEN-resume-B-initial");
  checkpointEvidence(context, "GREEN-resume-B-initial", initialBRecord.checkpoint, initialBRecord.record, {
    requestId: b.requestId,
    observedRequestId: initialBRecord.record.request_id,
    runId: b.runId,
    observedRunId: initialBRecord.record.run_id,
  });
  const bBeforeResumeBytes = listCheckpointBytes(initialB.namespace, "GREEN-resume-B before A resume");

  const resumeAPrompt = buildResumePrompt({
    requestId: a.requestId,
    runId: a.runId,
    mode: "git",
    route: "full",
    reason: "the previously open decision is now answered and must resume the exact handoff",
    scope: "resume-a",
    sourceRoot: context.source,
    answer: "The durable checkpoint must remain append-only and the existing request/run identity must be preserved.",
  });
  const resumeACase = await executeCase({
    context,
    fixture,
    overlay: worktreeA.overlay,
    label: "GREEN-resume-A",
    worktree: worktreeA.worktree,
    mode: "git",
    route: "full",
    reason: "resume the exact persisted handoff without a new namespace",
    scope: "resume-a",
    requestId: a.requestId,
    runId: a.runId,
    promptMessage: resumeAPrompt,
  });
  assertOverlayUnchanged(worktreeA.overlay.copies, "GREEN-resume-A", worktreeA.overlay.destinationRoot);
  assertWorktreeReadOnly(worktreeA.worktree, fixture.env, "GREEN-resume-A", worktreeA.overlay.copies);
  assertToolReadPaths(resumeACase.session, "GREEN-resume-A", [initialARecord.checkpoint.path]);
  const gitAResume = gitCommonDir(worktreeA.worktree, fixture.env);
  if (!samePath(gitA.common, gitAResume.common)) assertion("GREEN-resume-A changed its Git common directory", { expectedRed: false });
  const resumedA = captureNamespaceSequence(gitAResume.common, {
    requestId: a.requestId,
    runId: a.runId,
    expectedCount: 2,
    label: "GREEN-resume-A after",
  });
  assertResumedCheckpoint(initialARecord.record, resumedA.records[1].record, initialARecord.checkpoint.path, initialARecord.checkpoint.bytes, "GREEN-resume-A");
  if (!initialARecord.checkpoint.bytes.equals(resumedA.records[0].checkpoint.bytes)) {
    assertion("GREEN-resume-A changed its sealed parent bytes", { expectedRed: false });
  }
  checkpointEvidence(context, "GREEN-resume-A", resumedA.records[1].checkpoint, resumedA.records[1].record, {
    requestId: a.requestId,
    observedRequestId: resumedA.records[1].record.request_id,
    runId: a.runId,
    observedRunId: resumedA.records[1].record.run_id,
  });
  assertCheckpointBytesUnchanged(bBeforeResumeBytes, listCheckpointBytes(initialB.namespace, "GREEN-resume-B after A resume"), "GREEN-resume-B during A resume");

  const resumeBPrompt = buildResumePrompt({
    requestId: b.requestId,
    runId: b.runId,
    mode: "git",
    route: "full",
    reason: "the second material decision is now answered and must resume its exact handoff",
    scope: "resume-b",
    sourceRoot: context.source,
    answer: "The second durable namespace must retain its own parent and never share A's request/run identity.",
  });
  const resumeBCase = await executeCase({
    context,
    fixture,
    overlay: worktreeB.overlay,
    label: "GREEN-resume-B",
    worktree: worktreeB.worktree,
    mode: "git",
    route: "full",
    reason: "resume the second exact persisted handoff without a new namespace",
    scope: "resume-b",
    requestId: b.requestId,
    runId: b.runId,
    promptMessage: resumeBPrompt,
  });
  assertOverlayUnchanged(worktreeB.overlay.copies, "GREEN-resume-B", worktreeB.overlay.destinationRoot);
  assertWorktreeReadOnly(worktreeB.worktree, fixture.env, "GREEN-resume-B", worktreeB.overlay.copies);
  assertToolReadPaths(resumeBCase.session, "GREEN-resume-B", [initialBRecord.checkpoint.path]);
  const gitBResume = gitCommonDir(worktreeB.worktree, fixture.env);
  if (!samePath(gitB.common, gitBResume.common)) assertion("GREEN-resume-B changed its Git common directory", { expectedRed: false });
  const resumedB = captureNamespaceSequence(gitBResume.common, {
    requestId: b.requestId,
    runId: b.runId,
    expectedCount: 2,
    label: "GREEN-resume-B after",
  });
  assertResumedCheckpoint(initialBRecord.record, resumedB.records[1].record, initialBRecord.checkpoint.path, initialBRecord.checkpoint.bytes, "GREEN-resume-B");
  if (!initialBRecord.checkpoint.bytes.equals(resumedB.records[0].checkpoint.bytes)) {
    assertion("GREEN-resume-B changed its sealed parent bytes", { expectedRed: false });
  }
  checkpointEvidence(context, "GREEN-resume-B", resumedB.records[1].checkpoint, resumedB.records[1].record, {
    requestId: b.requestId,
    observedRequestId: resumedB.records[1].record.request_id,
    runId: b.runId,
    observedRunId: resumedB.records[1].record.run_id,
  });
  assertCheckpointBytesUnchanged(resumedA.records.map(({ checkpoint }) => ({ path: checkpoint.path, bytes: checkpoint.bytes })), listCheckpointBytes(resumedA.namespace, "GREEN-resume-A after B resume"), "GREEN-resume-A during B resume");
  const bAfterResumeBytes = listCheckpointBytes(resumedB.namespace, "GREEN-resume-B before collision");

  const gitACollision = gitCommonDir(worktreeA.worktree, fixture.env);
  if (!samePath(gitA.common, gitACollision.common)) assertion("GREEN-collision changed its Git common directory", { expectedRed: false });
  const collisionPath = nextCheckpointPath(resumedA.namespace, 2, "GREEN-collision");
  writeFileSync(collisionPath, COLLISION_FIXTURE_BYTES, { flag: "wx" });
  ensureRegularFile(collisionPath, "GREEN-collision fixture");
  const collisionBefore = listCheckpointBytes(resumedA.namespace, "GREEN-collision before");
  const collisionPrompt = buildResumePrompt({
    requestId: a.requestId,
    runId: a.runId,
    mode: "git",
    route: "full",
    reason: "resume the exact handoff while the filesystem successor slot may be corrupt",
    scope: "resume-a",
    sourceRoot: context.source,
    answer: "Return BLOCKED, preserve the already sealed history, and refuse to mutate any successor slot that is not exclusively writable.",
    collision: true,
  });
  const collisionCase = await executeCase({
    context,
    fixture,
    overlay: worktreeA.overlay,
    label: "GREEN-collision",
    worktree: worktreeA.worktree,
    mode: "git",
    route: "full",
    reason: "fail closed on a real corrupt successor collision",
    scope: "resume-a",
    requestId: a.requestId,
    runId: a.runId,
    promptMessage: collisionPrompt,
    expectBlocked: true,
  });
  assertOverlayUnchanged(worktreeA.overlay.copies, "GREEN-collision", worktreeA.overlay.destinationRoot);
  assertWorktreeReadOnly(worktreeA.worktree, fixture.env, "GREEN-collision", worktreeA.overlay.copies);
  assertToolReadPaths(collisionCase.session, "GREEN-collision", [resumedA.records[1].checkpoint.path, collisionPath]);
  assertCheckpointBytesUnchanged(collisionBefore, listCheckpointBytes(resumedA.namespace, "GREEN-collision after"), "GREEN-collision");
  assertCheckpointBytesUnchanged(bAfterResumeBytes, listCheckpointBytes(resumedB.namespace, "GREEN-resume-B after A collision"), "GREEN-resume-B during A collision");
  const latestAfterCollision = readJsonFile(resumedA.records[1].checkpoint.path, "GREEN-collision sealed parent");
  assertClosedResume(latestAfterCollision.value, "GREEN-collision sealed parent");
  context.evidence.assertions.push({
    id: "AC-009.green-resume-collision",
    status: "PASS",
    detail: "Interleaved Git namespaces resumed by exact request/run identity and a real corrupt successor collision remained fail-closed without clobber.",
    paths: [initialARecord.checkpoint.path, resumedA.records[1].checkpoint.path, collisionPath, initialBRecord.checkpoint.path, resumedB.records[1].checkpoint.path],
  });
  return { resume: "PASS", collision: "PASS" };
}

function captureScenario(capture, label) {
  const scenario = Array.isArray(capture?.scenarios) ? capture.scenarios.find((item) => item?.label === label) : null;
  if (!scenario || typeof scenario.worktree !== "string" || !isAbsolute(scenario.worktree) || scenario.worktree.includes("\0")) {
    blocked(`resume capture is missing a safe scenario ${label}`, { code: "RESUME_SCENARIO_MISSING", phase: "capture_binding" });
  }
  return scenario;
}

function captureCheckpointEvidence(capture, label) {
  const checkpoint = Array.isArray(capture?.checkpoints) ? capture.checkpoints.find((item) => item?.label === label) : null;
  if (!checkpoint || typeof checkpoint.path !== "string" || checkpoint.path.includes("\0") || !isAbsolute(checkpoint.path) || typeof checkpoint.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(checkpoint.sha256) || !Number.isSafeInteger(checkpoint.bytes)) {
    blocked(`resume capture is missing checkpoint evidence ${label}`, { code: "RESUME_CHECKPOINT_MISSING", phase: "capture_binding" });
  }
  return checkpoint;
}

function assertCapturedCheckpointBytes(captured, checkpoint, label) {
  if (!samePath(captured.path, checkpoint.path) || captured.bytes.byteLength !== checkpoint.bytes || sha256Bytes(captured.bytes).toLowerCase() !== checkpoint.sha256.toLowerCase()) {
    blocked(`${label} checkpoint bytes differ from captured evidence`, { code: "RESUME_CHECKPOINT_BYTES", phase: "capture_binding" });
  }
}

function assertCapturedScenarioSettled(scenario, label) {
  const terminal = scenario?.session?.terminal;
  if (terminal?.status !== "completed" || terminal?.sessionSettled !== true || terminal?.prompt_result?.status !== "completed" || terminal?.prompt_result?.agentInvoked !== true) {
    blocked(`${label} did not have a completed settled native session in the capture`, { code: "RESUME_SESSION_NOT_SETTLED", phase: "capture_binding" });
  }
}
function bindSecondaryResumeEvidence(context, primaryCapture, secondaryPath, worktree, initialB, resumedB) {
  const secondaryFile = readJsonFile(secondaryPath, "secondary B resume capture");
  const secondary = secondaryFile.value;
  if (
    !secondary
    || secondary.phase !== "green"
    || !UUID_V4.test(secondary.run_id ?? "")
    || secondary.failure?.kind !== "ASSERTION"
    || typeof secondary.failure.detail !== "string"
    || secondary.failure.detail.trim() === ""
  ) {
    blocked("secondary B resume capture is not the preserved completed green harness capture", { code: "RESUME_B_CAPTURE_INVALID", phase: "capture_binding" });
  }
  if (
    secondary.source_capture?.package_root !== primaryCapture.source_capture?.package_root
    || secondary.source_capture?.manifest_sha256 !== primaryCapture.source_capture?.manifest_sha256
  ) {
    blocked("secondary B resume capture is not bound to the primary frozen package", { code: "RESUME_B_PACKAGE_BINDING", phase: "capture_binding" });
  }
  assertResumeSourceBinding(secondary, context.source, context.alignmentEntries, "secondary B resume");
  if (secondary.binary?.sha256?.toLowerCase() !== context.evidence.binary?.sha256?.toLowerCase()) {
    blocked("secondary B resume capture used a different OMP binary", { code: "RESUME_B_BINARY", phase: "capture_binding" });
  }
  const scenario = captureScenario(secondary, "GREEN-resume-capture-B");
  assertCapturedScenarioSettled(scenario, "secondary B resume");
  assertToolReadEvidence(scenario.session, "secondary B resume", secondary.source_root, join(worktree, ".omp"));
  if (
    scenario.request_id !== initialB.record.request_id
    || scenario.run_id !== initialB.record.run_id
    || !samePath(scenario.worktree, worktree)
    || scenario.mode !== "git"
    || scenario.route !== "full"
  ) {
    blocked("secondary B resume capture does not bind the existing B identity/worktree/route", { code: "RESUME_B_IDENTITY", phase: "capture_binding" });
  }
  assertResumedCheckpoint(initialB.record, resumedB.record, initialB.checkpoint.path, initialB.checkpoint.bytes, "secondary B resume");
  return {
    path: secondaryPath,
    sha256: sha256Bytes(secondaryFile.bytes),
    capture_run_id: secondary.run_id,
    scenario_label: scenario.label,
    binary_sha256: secondary.binary.sha256,
    source_after_scope: secondary.source_after_scope,
    source_after: sanitizeValue(secondary.source_after),
    harness_failure: {
      kind: secondary.failure.kind,
      code: secondary.failure.code ?? null,
      detail: scrubText(secondary.failure.detail),
      error: sanitizeValue(secondary.failure.error ?? null),
    },
  };
}
function assertCapturedControl(capture, lab, label, expected) {
  const scenario = captureScenario(capture, label);
  assertCapturedScenarioSettled(scenario, `${label} historical replay`);
  const worktree = existingDirectory(`${label} historical worktree`, scenario.worktree);
  assertInside(lab, worktree, `${label} historical worktree`);
  assertToolReadEvidence(scenario.session, `${label} historical replay`, capture.source_root, join(worktree, ".omp"));
  const captured = captureCheckpointEvidence(capture, label);
  assertInside(lab, captured.path, `${label} historical checkpoint`);
  const checkpoint = readJsonFile(captured.path, `${label} historical checkpoint`);
  assertCapturedCheckpointBytes(checkpoint, captured, `${label} historical checkpoint`);
  const record = rootAlignmentRecord(checkpoint);
  if (!record || record.request_id !== scenario.request_id || record.run_id !== scenario.run_id) {
    blocked(`${label} historical checkpoint identity does not match its native session`, { code: "REPLAY_IDENTITY", phase: "capture_binding" });
  }
  if (expected.status === "CLOSED") assertFastClose(record, `${label} historical checkpoint`);
  else assertBlockedHandoff(record, `${label} historical checkpoint`);
  if (!rootField(record, "mode", expected.mode) || !rootField(record, "route", expected.route)) {
    blocked(`${label} historical checkpoint mode/route does not match the captured control`, { code: "REPLAY_ROUTE", phase: "capture_binding" });
  }
  const fixtureRoot = resolve(dirname(dirname(worktree)));
  if (expected.mode === "local") {
    const dotGit = join(worktree, ".git");
    if (existsSync(dotGit)) blocked(`${label} local control created Git metadata`, { code: "REPLAY_LOCAL_GIT", phase: "capture_binding" });
    if (!normalizeObservedPath(checkpoint.path).includes("/.omp/state/alignment/")) {
      blocked(`${label} local control checkpoint is not in the local handoff store`, { code: "REPLAY_LOCAL_STORE", phase: "capture_binding" });
    }
    return { label, status: expected.status, mode: expected.mode, route: expected.route, checkpoint: captured };
  }
  const gitEnv = existingGitEnvironment(fixtureRoot).env;
  if (runGit(worktree, ["remote"], gitEnv, `${label} historical Git remote`) !== "") {
    blocked(`${label} historical Git control has a remote`, { code: "REPLAY_GIT_REMOTE", phase: "capture_binding" });
  }
  const common = gitCommonDir(worktree, gitEnv).common;
  assertInside(lab, common, `${label} historical Git common lab`);
  if (!isSameOrDescendant(common, checkpoint.path)) {
    blocked(`${label} historical checkpoint is outside its real Git common directory`, { code: "REPLAY_GIT_COMMON", phase: "capture_binding" });
  }
  const normalizedCheckpoint = normalizeObservedPath(checkpoint.path);
  if (!normalizedCheckpoint.includes(`/${record.request_id.toLowerCase()}/`) || !normalizedCheckpoint.includes(`/${record.run_id.toLowerCase()}/`)) {
    blocked(`${label} historical checkpoint namespace omits request/run identity`, { code: "REPLAY_NAMESPACE", phase: "capture_binding" });
  }
  return { label, status: expected.status, mode: expected.mode, route: expected.route, checkpoint: captured, common };
}

function bindExistingCollisionCapture(context, primaryFile, initialA, initialB, parentA, parentB, common) {
  const file = readJsonFile(context.collisionCapture, "collision native capture");
  const capture = file.value;
  if (!capture || capture.phase !== "green" || !UUID_V4.test(capture.run_id ?? "")) {
    blocked("collision capture is not a native green run", { code: "COLLISION_CAPTURE_INVALID", phase: "collision_binding" });
  }
  assertResumeSourceBinding(capture, context.source, context.alignmentEntries, "collision native replay");
  if (
    capture.binary?.sha256 !== context.evidence.binary.sha256
    || capture.source_capture?.package_root !== primaryFile.value.source_capture.package_root
    || capture.source_capture?.manifest_sha256 !== primaryFile.value.source_capture.manifest_sha256
    || capture.replay?.capture_sha256 !== sha256Bytes(primaryFile.bytes)
    || typeof capture.replay?.secondary_resume_b?.path !== "string"
    || !samePath(capture.replay.secondary_resume_b.path, context.resumeBCapture)
    || capture.replay.secondary_resume_b.sha256 !== sha256Bytes(readFileSync(context.resumeBCapture))
  ) {
    blocked("collision capture is not coupled to the exact source/package/OMP/A/B captures", { code: "COLLISION_CAPTURE_BINDING", phase: "collision_binding" });
  }
  const scenario = captureScenario(capture, "GREEN-resume-capture-collision");
  assertCapturedScenarioSettled(scenario, "collision native replay");
  if (
    !samePath(scenario.worktree, initialA.worktree)
    || scenario.request_id !== initialA.request_id
    || scenario.run_id !== initialA.run_id
    || scenario.mode !== "git"
    || scenario.route !== "full"
    || scenario.session?.process?.closed !== true
    || scenario.session.process.exit_code !== 0
    || scenario.session.process.signal !== null
  ) {
    blocked("collision native session did not complete in the exact A identity/worktree/route", { code: "COLLISION_SESSION_BINDING", phase: "collision_binding" });
  }
  const prompts = (scenario.session.calls ?? []).filter((call) => call.type === "prompt");
  if (
    prompts.length !== 1
    || prompts[0].request_id !== initialA.request_id
    || prompts[0].run_id !== initialA.run_id
    || prompts[0].id !== scenario.session.terminal.prompt_result.id
  ) {
    blocked("collision capture does not bind its actual prompt to A", { code: "COLLISION_PROMPT_BINDING", phase: "collision_binding" });
  }
  assertToolReadEvidence(scenario.session, "collision native replay", capture.source_root, join(initialA.worktree, ".omp"));
  const readNamespace = (parent, identity, side, withCollision) => {
    const namespace = existingDirectory(`collision ${side} namespace`, dirname(parent.path));
    assertInside(common, namespace, `collision ${side} common directory`);
    const expectedNamespace = join(common, "alignment", identity.request_id, identity.run_id);
    if (!samePath(namespace, expectedNamespace) || !samePath(parent.path, join(namespace, "checkpoint-000000.json"))) {
      blocked(`collision ${side} namespace does not match the exact captured request/run`, { code: "COLLISION_NAMESPACE_IDENTITY", phase: "collision_binding" });
    }
    const snapshot = listCheckpointBytes(namespace, `collision ${side} captured bytes`);
    const expectedCount = withCollision ? 3 : 2;
    if (snapshot.length !== expectedCount || snapshot.some((item, index) => basename(item.path) !== `checkpoint-${String(index).padStart(6, "0")}.json`)) {
      blocked(`collision ${side} namespace has unexpected slots`, { code: "COLLISION_NAMESPACE_SLOTS", phase: "collision_binding" });
    }
    if (withCollision && !snapshot[2].bytes.equals(COLLISION_FIXTURE_BYTES)) {
      assertion("captured corrupt collision slot bytes were changed", { expectedRed: false });
    }
    const records = snapshot.slice(0, 2).map((item, index) => {
      const checkpoint = readJsonFile(item.path, `collision ${side} sealed ${index}`);
      const record = rootAlignmentRecord(checkpoint);
      if (!record || record.request_id !== identity.request_id || record.run_id !== identity.run_id) {
        blocked(`collision ${side} sealed record identity differs`, { code: "COLLISION_RECORD_IDENTITY", phase: "collision_binding" });
      }
      const key = `resume_${side}_${index === 0 ? "parent" : "successor"}`;
      const captured = capture.replay?.checkpoint_bindings?.[key];
      if (!captured) blocked(`collision capture lacks ${key}`, { code: "COLLISION_RECORD_BINDING", phase: "collision_binding" });
      assertCapturedCheckpointBytes(checkpoint, captured, `collision ${side} sealed ${index}`);
      return { checkpoint, record };
    });
    return { namespace, records, snapshot };
  };
  const aSequence = readNamespace(parentA, initialA, "a", true);
  const bSequence = readNamespace(parentB, initialB, "b", false);
  const collision = aSequence.snapshot[2];
  const reads = aSequence.snapshot.map((item) => {
    const matching = (scenario.session.messages ?? []).filter((message) => (
      message.role === "toolResult"
      && message.textSha256 === sha256Bytes(item.bytes)
      && message.textBytes === item.bytes.byteLength
    ));
    if (matching.length === 0) {
      blocked("collision capture lacks a retained raw read-result digest", { code: "COLLISION_READ_BYTES_MISSING", phase: "collision_binding" });
    }
    return { path: item.path, sha256: sha256Bytes(item.bytes), bytes: item.bytes.byteLength, message_ids: matching.map((message) => message.messageId) };
  });
  assertToolReadPaths(scenario.session, "collision native replay", aSequence.snapshot.map((item) => item.path));
  const last = scenario.session.terminal.last_message;
  return {
    aSequence,
    bSequence,
    collision,
    proof: {
      path: context.collisionCapture,
      sha256: sha256Bytes(file.bytes),
      capture_run_id: capture.run_id,
      source_kind: "native-replay-exact",
      request_id: scenario.request_id,
      run_id: scenario.run_id,
      worktree: scenario.worktree,
      terminal: sanitizeValue(scenario.session.terminal),
      process: sanitizeValue(scenario.session.process),
      terminal_blocked: last?.role === "assistant" && typeof last.signals?.blocked === "boolean" ? last.signals.blocked : null,
      raw_read_bindings: reads,
      historical_failure: sanitizeValue(capture.failure),
    },
  };
}

function prepareResumeCapture(context, sourceEntries, capturePath) {
  const captureFile = readJsonFile(capturePath, "resume capture");
  const capture = captureFile.value;
  if (!capture || capture.phase !== "green" || !UUID_V4.test(capture.run_id ?? "")) {
    blocked("resume capture is not a genuine green run", { code: "RESUME_CAPTURE_INVALID", phase: "capture_binding" });
  }
  const packageInfo = loadExistingFrozenPackage(capture, sourceEntries, context.lab, "resume");
  assertResumeSourceBinding(capture, context.source, packageInfo.alignmentEntries, "resume");
  const actualOmpSha256 = sha256Bytes(readFileSync(context.omp));
  if (actualOmpSha256.toLowerCase() !== String(context.ompSha256).toLowerCase()) {
    blocked("resume OMP bytes differ from the explicitly bound binary hash", { code: "RESUME_OMP_BYTES", phase: "capture_binding" });
  }
  context.packageInfo = packageInfo;
  context.alignmentEntries = packageInfo.alignmentEntries;
  context.evidence.source = packageInfo.entries.map((entry) => ({
    kind: entry.kind,
    path: entry.sourceRelativePath,
    destination: entry.destinationRelative,
    sha256: entry.sourceSha256,
    package_sha256: entry.packageSha256,
    bytes: entry.bytes,
  }));
  context.evidence.source_capture = {
    ...capture.source_capture,
    continuation_capture: capturePath,
    continuation_capture_sha256: sha256Bytes(captureFile.bytes),
  };
  context.evidence.binary = {
    path: context.omp,
    sha256: actualOmpSha256,
    bound_sha256: context.ompSha256,
  };

  const initialA = captureScenario(capture, "GREEN-resume-A-initial");
  const initialB = captureScenario(capture, "GREEN-resume-B-initial");
  const resumedA = captureScenario(capture, "GREEN-resume-A");
  assertCapturedScenarioSettled(initialA, "GREEN-resume-A-initial");
  assertCapturedScenarioSettled(initialB, "GREEN-resume-B-initial");
  assertCapturedScenarioSettled(resumedA, "GREEN-resume-A");
  const worktreeAPath = existingDirectory("resume A worktree", initialA.worktree);
  const worktreeBPath = existingDirectory("resume B worktree", initialB.worktree);
  assertInside(context.lab, worktreeAPath, "resume A worktree lab");
  assertInside(context.lab, worktreeBPath, "resume B worktree lab");
  assertToolReadEvidence(initialA.session, "GREEN-resume-A-initial captured replay", capture.source_root, join(worktreeAPath, ".omp"));
  assertToolReadEvidence(initialB.session, "GREEN-resume-B-initial captured replay", capture.source_root, join(worktreeBPath, ".omp"));
  assertToolReadEvidence(resumedA.session, "GREEN-resume-A captured replay", capture.source_root, join(worktreeAPath, ".omp"));
  if (resumedA.request_id !== initialA.request_id || resumedA.run_id !== initialA.run_id) {
    blocked("resume capture A successor session used different request/run identities", { code: "RESUME_IDENTITY", phase: "capture_binding" });
  }
  if (!isAbsolute(initialA.worktree) || !isAbsolute(initialB.worktree) || !isAbsolute(resumedA.worktree) || !samePath(worktreeAPath, resumedA.worktree)) {
    blocked("resume capture worktree identities are not absolute and stable", { code: "RESUME_WORKTREE_IDENTITY", phase: "capture_binding" });
  }
  if (samePath(worktreeAPath, worktreeBPath)) blocked("resume capture A/B worktrees are not independent", { code: "RESUME_WORKTREE_COLLISION", phase: "capture_binding" });
  const fixtureRoot = resolve(dirname(dirname(worktreeAPath)));
  assertInside(context.lab, fixtureRoot, "resume fixture lab");
  const worktreeRoot = resolve(dirname(worktreeAPath));
  if (!samePath(worktreeRoot, dirname(worktreeBPath)) || basename(worktreeAPath).toLowerCase() !== "resume-a" || basename(worktreeBPath).toLowerCase() !== "resume-b") {
    blocked("resume capture does not bind the expected two linked worktrees", { code: "RESUME_WORKTREE_LAYOUT", phase: "capture_binding" });
  }
  const gitEnv = existingGitEnvironment(fixtureRoot).env;
  const repo = existingDirectory("resume fixture repository", join(fixtureRoot, "repository"));
  assertInside(context.lab, repo, "resume fixture repository lab");
  if (runGit(repo, ["remote"], gitEnv, "resume fixture Git remote") !== "") {
    blocked("resume fixture unexpectedly has a Git remote", { code: "RESUME_GIT_REMOTE", phase: "capture_binding" });
  }
  const gitA = gitCommonDir(worktreeAPath, gitEnv);
  const gitB = gitCommonDir(worktreeBPath, gitEnv);
  assertInside(context.lab, gitA.common, "resume A Git common lab");
  assertInside(context.lab, gitB.common, "resume B Git common lab");
  if (!samePath(gitA.common, gitB.common)) blocked("resume A/B worktrees do not share Git common directory", { code: "RESUME_GIT_COMMON", phase: "capture_binding" });
  const initialACapture = captureCheckpointEvidence(capture, "GREEN-resume-A-initial");
  const initialBCapture = captureCheckpointEvidence(capture, "GREEN-resume-B-initial");
  assertInside(context.lab, initialACapture.path, "resume A captured checkpoint lab");
  assertInside(context.lab, initialBCapture.path, "resume B captured checkpoint lab");
  const overlayA = bindExistingOverlay(packageInfo, worktreeAPath, "resume A");
  const overlayB = bindExistingOverlay(packageInfo, worktreeBPath, "resume B");
  assertWorktreeReadOnly(worktreeAPath, gitEnv, "resume A capture", overlayA.copies);
  assertWorktreeReadOnly(worktreeBPath, gitEnv, "resume B capture", overlayB.copies);

  const collisionReplay = context.collisionCapture
    ? bindExistingCollisionCapture(context, captureFile, initialA, initialB, initialACapture, initialBCapture, gitA.common)
    : null;
  const aSequence = collisionReplay?.aSequence ?? captureNamespaceSequence(gitA.common, {
    requestId: initialA.request_id,
    runId: initialA.run_id,
    expectedCount: 2,
    label: "resume A existing sequence",
  });
  const bSequence = collisionReplay?.bSequence ?? captureNamespaceSequence(gitB.common, {
    requestId: initialB.request_id,
    runId: initialB.run_id,
    expectedCount: context.collisionOnly ? 2 : 1,
    label: "resume B existing sequence",
  });
  if (
    initialA.request_id === initialB.request_id
    || initialA.run_id === initialB.run_id
    || samePath(aSequence.namespace, bSequence.namespace)
  ) {
    blocked("resume capture A/B identities are not distinct namespaced request/run records", { code: "RESUME_NAMESPACE_COLLISION", phase: "capture_binding" });
  }
  const aInitial = aSequence.records[0];
  const aResumed = aSequence.records[1];
  const bInitial = bSequence.records[0];
  let resumedB = null;
  let secondaryBProof = null;
  if (context.collisionOnly) {
    resumedB = bSequence.records[1];
    secondaryBProof = bindSecondaryResumeEvidence(context, capture, context.resumeBCapture, worktreeBPath, bInitial, resumedB);
  }
  const aInitialFile = readJsonFile(aInitial.checkpoint.path, "resume A parent");
  const bInitialFile = readJsonFile(bInitial.checkpoint.path, "resume B parent");
  assertCapturedCheckpointBytes(aInitialFile, initialACapture, "resume A parent");
  assertCapturedCheckpointBytes(bInitialFile, initialBCapture, "resume B parent");
  assertBlockedHandoff(aInitial.record, "resume A parent");
  assertBlockedHandoff(bInitial.record, "resume B parent");
  assertResumedCheckpoint(aInitial.record, aResumed.record, aInitial.checkpoint.path, aInitial.checkpoint.bytes, "resume A existing");
  if (!aInitial.checkpoint.bytes.equals(aSequence.records[0].checkpoint.bytes)) {
    blocked("resume A parent bytes changed before continuation", { code: "RESUME_PARENT_BYTES", phase: "capture_binding" });
  }
  const historicalControls = new Map([
    ["GREEN-local", assertCapturedControl(capture, context.lab, "GREEN-local", { status: "CLOSED", mode: "local", route: "short" })],
    ["GREEN-short", assertCapturedControl(capture, context.lab, "GREEN-short", { status: "CLOSED", mode: "git", route: "short" })],
    ["GREEN-full", assertCapturedControl(capture, context.lab, "GREEN-full", { status: "CLOSED", mode: "git", route: "full" })],
    ["GREEN-blocked", assertCapturedControl(capture, context.lab, "GREEN-blocked", { status: "BLOCKED", mode: "git", route: "full" })],
  ]);
  if (!samePath(historicalControls.get("GREEN-short").common, historicalControls.get("GREEN-full").common) || !samePath(historicalControls.get("GREEN-full").common, historicalControls.get("GREEN-blocked").common)) {
    blocked("historical Git controls did not resolve one shared real common directory", { code: "REPLAY_GIT_COMMON", phase: "capture_binding" });
  }
  const historicalLabels = ["GREEN-local", "GREEN-short", "GREEN-full", "GREEN-blocked", "GREEN-resume-A-initial", "GREEN-resume-A"];
  context.evidence.replay = {
    capture_path: capturePath,
    capture_sha256: sha256Bytes(captureFile.bytes),
    capture_run_id: capture.run_id,
    ...(collisionReplay ? { collision_history: collisionReplay.proof } : {}),
    cases: historicalLabels.map((label) => {
      const control = historicalControls.get(label);
      const scenario = captureScenario(capture, label);
      if (!control) assertCapturedScenarioSettled(scenario, `${label} historical replay`);
      return {
        label,
        status: control?.status ?? "PASS",
        native_replay: true,
        request_id: scenario.request_id,
        run_id: scenario.run_id,
        checkpoint: control?.checkpoint ?? null,
      };
    }),
    worktrees: { resume_a: worktreeAPath, resume_b: worktreeBPath },
    git_common: gitA.common,
    checkpoint_bindings: {
      resume_a_parent: {
        path: aInitial.checkpoint.path,
        bytes: aInitial.checkpoint.bytes.byteLength,
        sha256: sha256Bytes(aInitial.checkpoint.bytes),
        request_id: aInitial.record.request_id,
        run_id: aInitial.record.run_id,
      },
      resume_a_successor: {
        path: aResumed.checkpoint.path,
        bytes: aResumed.checkpoint.bytes.byteLength,
        sha256: sha256Bytes(aResumed.checkpoint.bytes),
        request_id: aResumed.record.request_id,
        run_id: aResumed.record.run_id,
      },
      resume_b_parent: {
        path: bInitial.checkpoint.path,
        bytes: bInitial.checkpoint.bytes.byteLength,
        sha256: sha256Bytes(bInitial.checkpoint.bytes),
        request_id: bInitial.record.request_id,
        run_id: bInitial.record.run_id,
      },
      ...(resumedB ? {
        resume_b_successor: {
          path: resumedB.checkpoint.path,
          bytes: resumedB.checkpoint.bytes.byteLength,
          sha256: sha256Bytes(resumedB.checkpoint.bytes),
          request_id: resumedB.record.request_id,
          run_id: resumedB.record.run_id,
        },
      } : {}),
    },
    ...(secondaryBProof ? {
      secondary_resume_b: {
        ...secondaryBProof,
        source_kind: "native-replay-exact",
        request_id: resumedB.record.request_id,
        run_id: resumedB.record.run_id,
        status: resumedB.record.status,
        closure: resumedB.record.closure,
        history: sanitizeValue(resumedB.record.history),
        record: sanitizeValue(resumedB.record),
      },
    } : {}),
  };
  return {
    capture,
    captureFile,
    fixtureRoot,
    gitEnv,
    worktreeA: { worktree: worktreeAPath, overlay: overlayA },
    worktreeB: { worktree: worktreeBPath, overlay: overlayB },
    gitA,
    gitB,
    initialA: aInitial,
    resumedA: aResumed,
    initialB: bInitial,
    resumedB,
    secondaryBProof,
    collisionReplay,
    initialABytes: [{ path: aInitial.checkpoint.path, bytes: aInitial.checkpoint.bytes }],
    resumedABytes: [
      { path: aInitial.checkpoint.path, bytes: aInitial.checkpoint.bytes },
      { path: aResumed.checkpoint.path, bytes: aResumed.checkpoint.bytes },
    ],
    initialBBytes: [{ path: bInitial.checkpoint.path, bytes: bInitial.checkpoint.bytes }],
    resumedBBytes: resumedB ? [
      { path: bInitial.checkpoint.path, bytes: bInitial.checkpoint.bytes },
      { path: resumedB.checkpoint.path, bytes: resumedB.checkpoint.bytes },
    ] : [],
  };
}

async function runGreenResumeCapture(context, sourceEntries, capturePath) {
  const state = prepareResumeCapture(context, sourceEntries, capturePath);
  if (context.replayOnly) {
    context.stage = "collision_native_replay";
    context.evidence.assertions.push({
      id: "AC-009.collision-replay-bytes-and-reads",
      status: "PASS",
      detail: "Exact captured A/B raw checkpoint bytes and corrupt slot were rebound to successful native whole-file reads and a completed settled session; no new inference ran.",
    });
    context.evidence.controls = {
      historical_native_replay: "PASS",
      resume_b: "NATIVE_REPLAY_EXACT",
      collision_fail_closed: state.collisionReplay.proof.terminal_blocked === true ? "NATIVE_REPLAY_EXACT" : "BLOCKED_MISSING_TERMINAL_SIGNAL",
    };
    if (state.collisionReplay.proof.terminal_blocked !== true) {
      blocked("collision capture did not retain an observable final assistant BLOCKED signal", { code: "COLLISION_TERMINAL_SIGNAL_NOT_RETAINED", phase: "collision_replay" });
    }
    return { status: "PASS", source_kind: "native-replay-exact" };
  }
  let resumedBRecord = null;
  let bAfterResumeBytes = [];
  if (context.collisionOnly) {
    context.stage = "resume_capture_native_replay_b";
    if (!state.resumedB || !state.secondaryBProof) {
      blocked("collision-only mode lacks a validated native B successor replay", { code: "RESUME_B_REPLAY_MISSING", phase: "capture_binding" });
    }
    resumedBRecord = state.resumedB;
    bAfterResumeBytes = listCheckpointBytes(resolve(dirname(state.initialB.checkpoint.path)), "resume B native replay");
    assertCheckpointBytesUnchanged(state.resumedBBytes, bAfterResumeBytes, "resume B native replay");
  } else {
    context.stage = "resume_capture_native_b";
    const resumeBPrompt = buildResumePrompt({
      requestId: state.initialB.record.request_id,
      runId: state.initialB.record.run_id,
      mode: "git",
      route: "full",
      reason: "the second material decision is now answered and must resume its exact handoff",
      scope: "resume-b",
      sourceRoot: context.source,
      answer: "The second durable namespace must retain its own parent and never share A's request/run identity.",
    });
    const resumeBCase = await executeCase({
      context,
      fixture: state,
      overlay: state.worktreeB.overlay,
      label: "GREEN-resume-capture-B",
      worktree: state.worktreeB.worktree,
      mode: "git",
      route: "full",
      reason: "resume the captured second handoff without a new namespace",
      scope: "resume-b",
      requestId: state.initialB.record.request_id,
      runId: state.initialB.record.run_id,
      promptMessage: resumeBPrompt,
    });
    assertOverlayUnchanged(state.worktreeB.overlay.copies, "GREEN-resume-capture-B", state.worktreeB.overlay.destinationRoot);
    assertWorktreeReadOnly(state.worktreeB.worktree, state.gitEnv, "GREEN-resume-capture-B", state.worktreeB.overlay.copies);
    assertToolReadPaths(resumeBCase.session, "GREEN-resume-capture-B", [state.initialB.checkpoint.path]);
    const resumedB = captureNamespaceSequence(state.gitB.common, {
      requestId: state.initialB.record.request_id,
      runId: state.initialB.record.run_id,
      expectedCount: 2,
      label: "resume B after continuation",
    });
    resumedBRecord = resumedB.records[1];
    assertResumedCheckpoint(state.initialB.record, resumedBRecord.record, state.initialB.checkpoint.path, state.initialB.checkpoint.bytes, "resume B continuation");
    if (!state.initialB.checkpoint.bytes.equals(resumedB.records[0].checkpoint.bytes)) assertion("resume B changed its sealed parent bytes", { expectedRed: false });
    checkpointEvidence(context, "GREEN-resume-capture-B", resumedBRecord.checkpoint, resumedBRecord.record, {
      requestId: state.initialB.record.request_id,
      observedRequestId: resumedBRecord.record.request_id,
      runId: state.initialB.record.run_id,
      observedRunId: resumedBRecord.record.run_id,
    });
    bAfterResumeBytes = listCheckpointBytes(resolve(dirname(state.initialB.checkpoint.path)), "resume B after B continuation");
    const bParentAfterResume = bAfterResumeBytes.filter((item) => samePath(item.path, state.initialB.checkpoint.path));
    assertCheckpointBytesUnchanged(state.initialBBytes, bParentAfterResume, "resume B continuation parent");
  }
  let collisionPath;
  if (state.collisionReplay) {
    collisionPath = state.collisionReplay.collision.path;
    assertCheckpointBytesUnchanged(state.collisionReplay.aSequence.snapshot, listCheckpointBytes(resolve(dirname(state.resumedA.checkpoint.path)), "captured A before fresh collision"), "captured A collision baseline");
  } else {
    assertCheckpointBytesUnchanged(state.resumedABytes, listCheckpointBytes(resolve(dirname(state.resumedA.checkpoint.path)), "resume A before collision"), "resume A during B continuation");
    collisionPath = nextCheckpointPath(resolve(dirname(state.resumedA.checkpoint.path)), 2, "resume collision");
    writeFileSync(collisionPath, COLLISION_FIXTURE_BYTES, { flag: "wx" });
    ensureRegularFile(collisionPath, "resume collision fixture");
  }
  const collisionBefore = listCheckpointBytes(resolve(dirname(state.resumedA.checkpoint.path)), "resume collision before");
  context.evidence.replay.collision_before = collisionBefore.map((item) => ({
    path: item.path, bytes: item.bytes.byteLength, sha256: sha256Bytes(item.bytes), source_kind: "filesystem-observation",
  }));
  context.stage = "resume_capture_native_collision";
  const collisionPrompt = buildResumePrompt({
    requestId: state.initialA.record.request_id,
    runId: state.initialA.record.run_id,
    mode: "git",
    route: "full",
    reason: "resume the exact handoff while the filesystem successor slot may be corrupt",
    scope: "resume-a",
    sourceRoot: context.source,
    answer: "Return BLOCKED, preserve the already sealed history, and refuse to mutate any successor slot that is not exclusively writable.",
    collision: true,
  });
  const collisionCase = await executeCase({
    context,
    fixture: state,
    overlay: state.worktreeA.overlay,
    label: "GREEN-resume-capture-collision",
    worktree: state.worktreeA.worktree,
    mode: "git",
    route: "full",
    reason: "fail closed on the captured namespace's corrupt successor collision",
    scope: "resume-a",
    requestId: state.initialA.record.request_id,
    runId: state.initialA.record.run_id,
    promptMessage: collisionPrompt,
    expectBlocked: true,
  });
  assertOverlayUnchanged(state.worktreeA.overlay.copies, "GREEN-resume-capture-collision", state.worktreeA.overlay.destinationRoot);
  assertWorktreeReadOnly(state.worktreeA.worktree, state.gitEnv, "GREEN-resume-capture-collision", state.worktreeA.overlay.copies);
  assertToolReadPaths(collisionCase.session, "GREEN-resume-capture-collision", [state.resumedA.checkpoint.path, collisionPath]);
  const collisionAfter = listCheckpointBytes(resolve(dirname(state.resumedA.checkpoint.path)), "resume collision after");
  assertCheckpointBytesUnchanged(collisionBefore, collisionAfter, "resume collision");
  context.evidence.replay.collision_after = collisionAfter.map((item) => ({
    path: item.path, bytes: item.bytes.byteLength, sha256: sha256Bytes(item.bytes), source_kind: "filesystem-observation",
  }));
  const bAfterCollision = listCheckpointBytes(resolve(dirname(state.initialB.checkpoint.path)), "resume B after A collision");
  assertCheckpointBytesUnchanged(bAfterResumeBytes, bAfterCollision, "resume B during A collision");
  context.evidence.replay.resume_b_after_collision = bAfterCollision.map((item) => ({
    path: item.path, bytes: item.bytes.byteLength, sha256: sha256Bytes(item.bytes), source_kind: "filesystem-observation",
  }));
  const latestA = readJsonFile(state.resumedA.checkpoint.path, "resume A sealed successor");
  assertClosedResume(latestA.value, "resume A sealed successor");
  context.evidence.assertions.push({
    id: "AC-009.resume-capture",
    status: "PASS",
    detail: context.collisionOnly
      ? "Native B successor was accepted only from an exact captured terminal/session/source replay; only fresh native A collision controls were executed."
      : "Captured native A handoff was bound offline; only fresh native B resume and A collision controls were executed.",
    paths: [state.initialA.checkpoint.path, state.resumedA.checkpoint.path, resumedBRecord.checkpoint.path, collisionPath],
  });
  context.evidence.controls = {
    historical_native_replay: "PASS",
    resume_b: context.collisionOnly ? "NATIVE_REPLAY_EXACT" : "PASS",
    collision_fail_closed: "PASS",
  };
  return { status: "PASS" };
}

async function runGreen(context, sourceEntries) {
  // Green controls use real native prompts and actual filesystem/Git observations.
  // The collision fixture is created only after a real sealed parent exists.
  const localRoot = join(context.runRoot, "green-local");
  mkdirSync(localRoot, { recursive: true });
  const localOverlay = installOverlay(sourceEntries, localRoot, "green local");
  const localIdentity = { requestId: randomUUID(), runId: randomUUID() };
  await executeCase({
    context,
    overlay: localOverlay,
    label: "GREEN-local",
    worktree: localRoot,
    mode: "local",
    route: "short",
    reason: "localized reversible low-risk read-only handoff",
    scope: "local",
    requestId: localIdentity.requestId,
    runId: localIdentity.runId,
  });
  if (existsSync(join(localRoot, ".git"))) assertion("GREEN-local initialized Git despite local mode", { expectedRed: false });
  assertOverlayUnchanged(localOverlay.copies, "GREEN-local", localOverlay.destinationRoot);
  const localResult = localCheckpointFor(localRoot, localIdentity.requestId, localIdentity.runId, "GREEN-local");
  assertFastClose(localResult.record, "GREEN-local");
  if (!rootField(localResult.record, "mode", "local")) assertion("GREEN-local persisted handoff has no local mode", { expectedRed: false });
  checkpointEvidence(context, "GREEN-local", localResult.checkpoint, localResult.record, {
    requestId: localIdentity.requestId,
    observedRequestId: localResult.record.request_id,
    runId: localIdentity.runId,
    observedRunId: localResult.record.run_id,
  });

  const fixture = createGitFixture(join(context.runRoot, "green-git"), sourceEntries, ["short", "full", "blocked"], context.runRoot);
  const shortIdentity = { requestId: randomUUID(), runId: randomUUID() };
  const shortWorktree = fixture.worktrees.short;
  const shortGit = gitCommonDir(shortWorktree.worktree, fixture.env);
  const beforeShort = scanJsonFiles(shortGit.common, "GREEN-short before");
  await executeCase({
    context,
    fixture,
    overlay: shortWorktree.overlay,
    label: "GREEN-short",
    worktree: shortWorktree.worktree,
    mode: "git",
    route: "short",
    reason: "one localized reversible scope with low objective risk and no dependency fan-out",
    scope: "short",
    requestId: shortIdentity.requestId,
    runId: shortIdentity.runId,
  });
  assertOverlayUnchanged(shortWorktree.overlay.copies, "GREEN-short", shortWorktree.overlay.destinationRoot);
  assertWorktreeReadOnly(shortWorktree.worktree, fixture.env, "GREEN-short", shortWorktree.overlay.copies);
  const shortCaptured = captureCheckpoint(shortGit.common, {
    requestId: shortIdentity.requestId,
    runId: shortIdentity.runId,
    before: beforeShort,
    label: "GREEN-short after",
    requireIdentity: true,
  });
  assertFastClose(shortCaptured.record, "GREEN-short");
  if (!rootField(shortCaptured.record, "mode", "git") || !rootField(shortCaptured.record, "route", "short") || typeof shortCaptured.record.reason !== "string" || shortCaptured.record.reason.trim() === "") {
    assertion("GREEN-short mode/route/risk handoff is not observable on the root checkpoint", { expectedRed: false });
  }
  checkpointEvidence(context, "GREEN-short", shortCaptured.checkpoint, shortCaptured.record, {
    requestId: shortIdentity.requestId,
    observedRequestId: shortCaptured.observedRequestId,
    runId: shortIdentity.runId,
    observedRunId: shortCaptured.observedRunId,
    match: shortCaptured.match,
  });

  const fullIdentity = { requestId: randomUUID(), runId: randomUUID() };
  const fullWorktree = fixture.worktrees.full;
  const fullGit = gitCommonDir(fullWorktree.worktree, fixture.env);
  if (!samePath(shortGit.common, fullGit.common)) assertion("GREEN-short and GREEN-full did not share Git common directory", { expectedRed: false });
  const beforeFull = scanJsonFiles(fullGit.common, "GREEN-full before");
  await executeCase({
    context,
    fixture,
    overlay: fullWorktree.overlay,
    label: "GREEN-full",
    worktree: fullWorktree.worktree,
    mode: "git",
    route: "full",
    reason: "multiple dependencies and a material trust-boundary risk require full alignment",
    scope: "full",
    requestId: fullIdentity.requestId,
    runId: fullIdentity.runId,
  });
  assertOverlayUnchanged(fullWorktree.overlay.copies, "GREEN-full", fullWorktree.overlay.destinationRoot);
  assertWorktreeReadOnly(fullWorktree.worktree, fixture.env, "GREEN-full", fullWorktree.overlay.copies);
  const fullCaptured = captureCheckpoint(fullGit.common, {
    requestId: fullIdentity.requestId,
    runId: fullIdentity.runId,
    before: beforeFull,
    label: "GREEN-full after",
    requireIdentity: true,
  });
  assertFastClose(fullCaptured.record, "GREEN-full");
  if (!rootField(fullCaptured.record, "mode", "git") || !rootField(fullCaptured.record, "route", "full") || typeof fullCaptured.record.reason !== "string" || fullCaptured.record.reason.trim() === "") {
    assertion("GREEN-full mode/route/risk handoff is not observable on the root checkpoint", { expectedRed: false });
  }
  if (samePath(shortCaptured.checkpoint.path, fullCaptured.checkpoint.path)) {
    assertion("GREEN short/full checkpoints did not use distinct canonical files", { expectedRed: false });
  }
  const shortAfterFull = scanJsonFiles(fullGit.common, "GREEN-short after full").find((checkpoint) => samePath(checkpoint.path, shortCaptured.checkpoint.path));
  if (!shortAfterFull || !shortAfterFull.bytes.equals(shortCaptured.checkpoint.bytes)) {
    assertion("GREEN-full changed GREEN-short raw checkpoint bytes", { expectedRed: false });
  }
  checkpointEvidence(context, "GREEN-full", fullCaptured.checkpoint, fullCaptured.record, {
    requestId: fullIdentity.requestId,
    observedRequestId: fullCaptured.observedRequestId,
    runId: fullIdentity.runId,
    observedRunId: fullCaptured.observedRunId,
    match: fullCaptured.match,
  });

  const blockedIdentity = { requestId: randomUUID(), runId: randomUUID() };
  const blockedWorktree = fixture.worktrees.blocked;
  const blockedGit = gitCommonDir(blockedWorktree.worktree, fixture.env);
  const beforeBlocked = scanJsonFiles(blockedGit.common, "GREEN-blocked before");
  await executeCase({
    context,
    fixture,
    overlay: blockedWorktree.overlay,
    label: "GREEN-blocked",
    worktree: blockedWorktree.worktree,
    mode: "git",
    route: "full",
    reason: "a material decision is intentionally unresolved; fail closed without inference",
    scope: "blocked",
    requestId: blockedIdentity.requestId,
    runId: blockedIdentity.runId,
    expectBlocked: true,
  });
  assertOverlayUnchanged(blockedWorktree.overlay.copies, "GREEN-blocked", blockedWorktree.overlay.destinationRoot);
  assertWorktreeReadOnly(blockedWorktree.worktree, fixture.env, "GREEN-blocked", blockedWorktree.overlay.copies);
  const blockedCaptured = captureCheckpoint(blockedGit.common, {
    requestId: blockedIdentity.requestId,
    runId: blockedIdentity.runId,
    before: beforeBlocked,
    label: "GREEN-blocked after",
    requireIdentity: true,
  });
  const blockedRecord = blockedCaptured.record;
  assertBlockedHandoff(blockedRecord, "GREEN-blocked");
  if (!rootField(blockedRecord, "mode", "git") || !rootField(blockedRecord, "route", "full") || typeof blockedRecord.reason !== "string" || blockedRecord.reason.trim() === "") {
    assertion("GREEN-blocked did not persist its Git fail-closed route and reason", { expectedRed: false });
  }
  if ([shortCaptured, fullCaptured].some((captured) => samePath(captured.checkpoint.path, blockedCaptured.checkpoint.path))) {
    assertion("GREEN-blocked checkpoint did not use a distinct canonical file", { expectedRed: false });
  }
  const shortAfterBlocked = scanJsonFiles(blockedGit.common, "GREEN-short after blocked").find((checkpoint) => samePath(checkpoint.path, shortCaptured.checkpoint.path));
  const fullAfterBlocked = scanJsonFiles(blockedGit.common, "GREEN-full after blocked").find((checkpoint) => samePath(checkpoint.path, fullCaptured.checkpoint.path));
  if (!shortAfterBlocked || !shortAfterBlocked.bytes.equals(shortCaptured.checkpoint.bytes) || !fullAfterBlocked || !fullAfterBlocked.bytes.equals(fullCaptured.checkpoint.bytes)) {
    assertion("GREEN-blocked changed a prior raw checkpoint", { expectedRed: false });
  }
  checkpointEvidence(context, "GREEN-blocked", blockedCaptured.checkpoint, blockedRecord, {
    requestId: blockedIdentity.requestId,
    observedRequestId: blockedCaptured.observedRequestId,
    runId: blockedIdentity.runId,
    observedRunId: blockedCaptured.observedRunId,
    match: blockedCaptured.match,
  });
  const extendedControls = await runGreenResumeAndCollisionControls(context, sourceEntries);
  context.evidence.controls = {
    local_no_git_init: "PASS",
    short_full_observable: "PASS",
    unresolved_decision_blocked: "PASS",
    interleaved_resume: extendedControls.resume,
    collision_fail_closed: extendedControls.collision,
  };
  context.evidence.assertions.push({
    id: "AC-009.green-controls",
    status: "PASS",
    detail: "Native local/short/full/blocked plus interleaved exact-namespace resume and corrupt successor collision controls observed.",
  });
  return { status: "PASS" };
}

export function diagnoseExistingRed(evidenceInput, labels = ["RED-A", "RED-B"]) {
  const cases = [];
  const errorMetadata = (error) => {
    const metadata = safeErrorMetadata(error);
    if (error instanceof DriverError && error.controlled === true) metadata.detail = safeFailureDetail(error);
    return metadata;
  };
  try {
    const evidence = typeof evidenceInput === "string"
      ? readJsonFile(existingFile("offline evidence", evidenceInput), "offline evidence").value
      : evidenceInput;
    if (!evidence || !Array.isArray(evidence.scenarios)) {
      throw new DriverError("USAGE", "offline evidence scenarios are required");
    }
    const selected = evidence.scenarios.filter((scenario) => labels.includes(scenario?.label));
    if (selected.length === 0) throw new DriverError("USAGE", "offline RED scenarios were not found");
    const firstWorktree = selected[0]?.worktree;
    if (typeof firstWorktree !== "string" || !isAbsolute(firstWorktree)) {
      throw new DriverError("USAGE", "offline RED scenario worktree is not absolute");
    }
    const firstFixtureRoot = resolve(dirname(dirname(firstWorktree)));
    const runRoot = dirname(firstFixtureRoot);
    const packageRoot = join(runRoot, "frozen-package");
    const manifestPath = join(packageRoot, "MANIFEST.json");
    ensureRegularFile(manifestPath, "offline frozen manifest");
    const manifestBytes = readFileSync(manifestPath);
    const declaredManifestSha = evidence.source_capture?.manifest_sha256;
    const actualManifestSha = sha256Bytes(manifestBytes);
    if (typeof declaredManifestSha !== "string" || declaredManifestSha !== actualManifestSha) {
      throw new DriverError("BLOCKED", "offline frozen manifest digest is not bound to source capture", {
        code: "FROZEN_MANIFEST_DIGEST_MISMATCH",
        phase: "manifest",
      });
    }
    const manifest = JSON.parse(decoder.decode(manifestBytes));
    if (!Array.isArray(manifest) || manifest.length === 0) {
      throw new DriverError("BLOCKED", "offline frozen manifest is not a nonempty array", { code: "FROZEN_MANIFEST_INVALID", phase: "manifest" });
    }
    const manifestByDestination = new Map();
    for (const entry of manifest) {
      const destination = entry?.destination;
      if (typeof destination !== "string" || isAbsolute(destination) || destination.split("/").includes("..") || manifestByDestination.has(destination)) {
        throw new DriverError("BLOCKED", "offline frozen manifest has an unsafe or duplicate destination", { code: "FROZEN_MANIFEST_INVALID", phase: "manifest" });
      }
      manifestByDestination.set(destination, entry);
    }
    for (const scenario of selected) {
      let stage = "scenario";
      try {
        if (!scenario || typeof scenario.worktree !== "string" || !isAbsolute(scenario.worktree)) {
          throw new DriverError("USAGE", "offline RED scenario worktree is not absolute");
        }
        const worktree = scenario.worktree;
        const fixtureRoot = resolve(dirname(dirname(worktree)));
        const overlayRoot = join(worktree, ".omp");
        const copies = [...manifestByDestination.values()].map((entry) => {
          const destination = join(overlayRoot, entry.destination);
          const source = join(packageRoot, entry.destination);
          assertInside(overlayRoot, destination, "offline RED overlay");
          assertInside(packageRoot, source, "offline frozen package");
          ensureRegularFile(source, "offline frozen package file");
          const bytes = readFileSync(source);
          if (sha256Bytes(bytes) !== entry.sha256 || bytes.byteLength !== entry.bytes) {
            throw new DriverError("BLOCKED", "offline frozen package file hash mismatch", { code: "FROZEN_PACKAGE_HASH_MISMATCH", phase: "manifest" });
          }
          return { source, destination };
        });
        const env = existingGitEnvironment(fixtureRoot).env;
        stage = "overlay";
        assertOverlayUnchanged(copies, `${scenario.label} offline`, overlayRoot);
        stage = "git_status";
        assertWorktreeReadOnly(worktree, env, `${scenario.label} offline`, copies);
        stage = "checkpoint_scan";
        const common = gitCommonDir(worktree, env).common;
        stage = "checkpoint_capture";
        const captured = captureCheckpoint(common, {
          requestId: scenario.request_id,
          runId: scenario.run_id,
          before: [],
          label: `${scenario.label} offline`,
        });
        stage = "contract_assertion";
        assertFastClose(captured.record, `${scenario.label} offline`);
        cases.push({
          label: scenario.label,
          status: "PASS",
          stage,
          checkpoint: {
            path: captured.checkpoint.path,
            bytes: captured.checkpoint.bytes.byteLength,
            sha256: sha256Bytes(captured.checkpoint.bytes),
            observed_request_id: captured.observedRequestId,
            observed_run_id: captured.observedRunId,
            match: captured.match,
          },
        });
      } catch (error) {
        cases.push({ label: scenario?.label ?? "unknown", status: "BLOCKED", stage, error: errorMetadata(error) });
      }
    }
    return { status: cases.every((item) => item.status === "PASS") ? "PASS" : "BLOCKED", cases };
  } catch (error) {
    return { status: "BLOCKED", cases, error: errorMetadata(error) };
  }
}

function retainOperationalSession(session) {
  if (!session || typeof session !== "object") return null;
  // These are existing operational summaries, never raw RPC/provider frames,
  // system prompts, thinking blocks, or credential/state dumps.
  const output = {};
  for (const key of ["label", "request_id", "run_id", "rpc", "terminal", "process", "lifecycle", "failure_meta", "message_end_count"]) {
    if (session[key] !== undefined) output[key] = sanitizeValue(session[key]);
  }
  for (const key of ["calls", "results", "tool_events", "messages", "usage"]) {
    if (Array.isArray(session[key])) output[key] = session[key].map((item) => sanitizeValue(item));
  }
  return output;
}

function retainOperationalScenario(scenario) {
  const output = {};
  for (const key of ["label", "mode", "route", "request_id", "run_id", "worktree", "started_at", "finished_at"]) {
    if (scenario[key] !== undefined) output[key] = sanitizeValue(scenario[key]);
  }
  if (scenario.overlay) {
    output.overlay = {
      destinationRoot: sanitizeValue(scenario.overlay.destinationRoot),
      copies: Array.isArray(scenario.overlay.copies) ? scenario.overlay.copies.map((item) => sanitizeValue(item)) : [],
    };
  }
  output.session = retainOperationalSession(scenario.session);
  return output;
}

function writeEvidence(context) {
  if (!context?.runRoot) return null;
  const target = join(context.runRoot, "evidence.json");
  const temporary = join(context.runRoot, `.evidence-${randomUUID()}.tmp`);
  const output = {
    phase: context.phase,
    run_id: context.runId,
    started_at: context.startedAt,
    finished_at: now(),
    stage: context.stage,
    source_root: context.evidence.sourceRoot,
    source_capture: context.evidence.source_capture,
    source: context.evidence.source,
    source_after: context.evidence.source_after,
    source_after_scope: context.evidence.source_after_scope,
    source_after_error: context.evidence.source_after_error,
    scenarios: context.evidence.scenarios,
    checkpoints: context.evidence.checkpoints,
    assertions: context.evidence.assertions,
    controls: context.evidence.controls,
    failure: context.evidence.failure,
    binary: context.evidence.binary,
    replay: context.evidence.replay,
  };
  const retained = Object.fromEntries(Object.entries(output).map(([key, value]) => [
    key,
    key === "scenarios"
      ? value.map(retainOperationalScenario)
      : Array.isArray(value) ? value.map((item) => sanitizeValue(item)) : sanitizeValue(value),
  ]));
  // Redact leaf summaries independently: nesting must not erase terminal
  // booleans, result hashes, or RPC identities needed for exact native replay.
  writeFileSync(temporary, `${JSON.stringify(retained, null, 2)}\n`, { encoding: "utf8" });
  renameSync(temporary, target);
  return target;
}

function recordSourceAfter(context) {
  try {
    const after = captureSourceHashes(context.source, context.alignmentEntries, "source after");
    context.evidence.source_after = after;
    context.evidence.source_after_scope = "alignment-six-targets-only";
  } catch (error) {
    context.evidence.source_after_error = opaqueError(error?.message ?? error);
  }
}

function validateInputs(options) {
  const source = existingDirectory("--source", options.source);
  const omp = existingFile("--omp", options.omp);
  const lab = existingDirectory("--lab", options.lab);
  const resumeCapture = options.resumeCapture ? existingFile("--resume-capture", options.resumeCapture) : null;
  const resumeBCapture = options.resumeBCapture ? existingFile("--resume-b-capture", options.resumeBCapture) : null;
  const collisionCapture = options.collisionCapture ? existingFile("--collision-capture", options.collisionCapture) : null;
  const homeCandidate = process.env.USERPROFILE || process.env.HOME;
  if (!homeCandidate) blocked("normal HOME/USERPROFILE is required for existing OMP authentication");
  const home = existingDirectory("normal HOME", homeCandidate);
  if (samePath(lab, source) || isSameOrDescendant(lab, source) || isSameOrDescendant(source, lab)) {
    blocked("--lab may not equal, contain, or be contained by --source");
  }
  if (samePath(lab, home) || isSameOrDescendant(lab, home)) {
    blocked("--lab may not equal or contain the real HOME");
  }
  if (resumeCapture && options.phase !== "green") {
    throw new DriverError("USAGE", "--resume-capture is only valid with --phase green");
  }
  if (options.collisionOnly && !resumeCapture) {
    throw new DriverError("USAGE", "--collision-only requires --resume-capture");
  }
  if (options.collisionOnly && !resumeBCapture) {
    throw new DriverError("USAGE", "--collision-only requires --resume-b-capture");
  }
  if (resumeBCapture && !options.collisionOnly) {
    throw new DriverError("USAGE", "--resume-b-capture requires --collision-only");
  }
  if (resumeCapture && !isSameOrDescendant(lab, resumeCapture)) {
    blocked("--resume-capture must be inside --lab");
  }
  if (resumeBCapture && !isSameOrDescendant(lab, resumeBCapture)) {
    blocked("--resume-b-capture must be inside --lab");
  }
  if (collisionCapture && (!options.collisionOnly || !resumeCapture || !resumeBCapture)) {
    throw new DriverError("USAGE", "--collision-capture requires --collision-only true and both resume captures");
  }
  if (collisionCapture && !isSameOrDescendant(lab, collisionCapture)) {
    blocked("--collision-capture must be inside --lab");
  }
  if (options.replayOnly && !collisionCapture) {
    throw new DriverError("USAGE", "--replay-only requires --collision-capture");
  }
  if (options.ompSha256 !== null && !/^[0-9a-f]{64}$/i.test(options.ompSha256)) {
    throw new DriverError("USAGE", "--omp-sha256 must be 64 hexadecimal characters");
  }
  if (resumeCapture && !options.ompSha256) {
    throw new DriverError("USAGE", "--omp-sha256 is required with --resume-capture");
  }
  return { source, omp, lab, home, resumeCapture, resumeBCapture, collisionCapture };
}

async function main() {

  const options = parseArgs(process.argv.slice(2));
  const paths = validateInputs(options);
  const runId = randomUUID();
  if (!UUID_V4.test(runId)) blocked("driver run_id is not UUID-v4");
  const runRoot = join(paths.lab, `ship-native-alignment-${runId}`);
  assertInside(paths.lab, runRoot, "run root");
  assertNewDirectory(runRoot, "run root");
  const sourceEntries = sourceManifest(paths.source);
  const packageInfo = paths.resumeCapture ? null : freezePackage(runRoot, sourceEntries);
  const context = {
    ...options,
    ...paths,
    runRoot,
    runId,
    phase: options.phase,
    stage: paths.resumeCapture ? "resume_capture_preflight" : options.phase === "red" ? "red_native" : "green_native",
    startedAt: now(),
    ompEnv: createOmpEnvironment(),
    packageInfo,
    alignmentEntries: packageInfo?.alignmentEntries ?? sourceEntries.filter((entry) => entry.kind === "skill" && ALIGNMENT_PRESERVATION_PATHS.has(entry.sourceRelativePath)),
    evidence: {
      sourceRoot: paths.source,
      source_capture: packageInfo
        ? {
            skills: INSTALLER_SKILLS,
            agent_profiles: INSTALLER_AGENTS.map(([skill, subdir, file]) => `${skill}/${subdir}/${file}`),
            files: packageInfo.entries.length,
            manifest_sha256: packageInfo.manifestSha256,
            package_root: packageInfo.root,
            atomic: false,
            note: "Per-file installer-mapped bytes were captured into one frozen lab package; this is not a global source revision claim.",
          }
        : null,
      source: (packageInfo?.entries ?? sourceEntries).map((entry) => ({
        kind: entry.kind,
        path: entry.sourceRelativePath,
        destination: entry.destinationRelative,
        sha256: entry.sourceSha256,
        package_sha256: entry.packageSha256 ?? null,
        bytes: entry.bytes,
      })),
      scenarios: [],
      checkpoints: [],
      assertions: [],
      controls: null,
      failure: null,
    },
  };
  let outcome;
  try {
    if (paths.resumeCapture) outcome = await runGreenResumeCapture(context, sourceEntries, paths.resumeCapture);
    else if (options.phase === "red") outcome = await runRed(context, packageInfo.entries);
    else outcome = await runGreen(context, packageInfo.entries);
    const after = captureSourceHashes(paths.source, context.alignmentEntries, "source after");
    context.evidence.source_after = after;
    context.evidence.source_after_scope = "alignment-six-targets-only";
    if (after.some((entry, index) => entry.sha256 !== context.alignmentEntries[index].sourceSha256)) {
      assertion("alignment source bytes changed during native probe", { expectedRed: false });
    }
    if (context.packageInfo) assertFrozenPackageUnchanged(context.packageInfo, "native probe");
    context.evidence.assertions.push({ id: "preservation.source", status: "PASS", detail: "six alignment source targets unchanged; other mapped source files are outside this slice's after-check" });
    const evidencePath = writeEvidence(context);
    const status = options.phase === "red" && outcome.status === "PASS" ? "FALHOU_NO_RED" : outcome.status;
    process.stdout.write(`${JSON.stringify({ status, phase: options.phase, run_id: runId, evidence: evidencePath, outcome })}\n`);
    process.exitCode = status === "PASS" ? 0 : status === "PENDING_NATIVE" ? 2 : 1;
  } catch (error) {
    context.evidence.failure = {
      kind: error.kind ?? "BLOCKED",
      code: error.code ?? error.session_failure?.code ?? "DRIVER_FAILURE",
      phase: error.phase ?? error.session_failure?.phase ?? null,
      detail: safeFailureDetail(error, context),
      expectedRed: error.expectedRed === true,
      error_meta: safeErrorMetadata(error),
      error: opaqueError(error?.message ?? error),
      rpc: error.session_failure ?? null,
    };
    recordSourceAfter(context);
    const evidencePath = writeEvidence(context);
    let status = "BLOCKED";
    let exitCode = 2;
    if (error.kind === "ASSERTION") {
      if (options.phase === "red" && error.expectedRed === true) {
        status = "RED_VALID";
        exitCode = 1;
      } else {
        status = "FAIL";
        exitCode = 1;
      }
    } else if (error.kind === "USAGE") {
      status = "USAGE";
      exitCode = 64;
    }
    process.stdout.write(`${JSON.stringify({ status, phase: options.phase, run_id: runId, evidence: evidencePath, detail: safeFailureDetail(error, context) })}\n`);
    process.exitCode = exitCode;
  }
}

if (process.argv[1] && comparePath(process.argv[1]) === comparePath(fileURLToPath(import.meta.url))) {
  await main().catch((error) => {
    const kind = error?.kind ?? "BLOCKED";
    const status = kind === "USAGE" ? "USAGE" : "BLOCKED";
    process.stdout.write(`${JSON.stringify({ status, detail: safeFailureDetail(error), error_meta: safeErrorMetadata(error) })}\n`);
    process.exitCode = kind === "USAGE" ? 64 : 2;
  });
}
