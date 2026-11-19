import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isAuthoritativeTaskRecord, taskRecordSucceeded } from "./technical-retry-scenario.mjs";
const CONTRACT_VERSION = "0.5.0";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const SHA40 = /^[0-9a-f]{40}$/i;
const HISTORICAL_SIX_TARGET_MANIFEST = "710c5e088e00733e75610c429124f74931474f5a645eb65b8247440b3628393e";
const PINNED_OMP_BINARY_SHA256 = "dfb15c27cb2ea192a94761c26aa5cd4eed54b1e0a5a85c02938ab07d769bc8f7";
const AUTHENTIC_EVIDENCE_LEVEL = "native-omp-rpc-actions-and-profile-schemas";
const SOURCE_DERIVED_EVIDENCE_LEVEL = "SOURCE_DERIVED_HOST_ADAPTER";
const CURRENT_SKILLS = Object.freeze(["alignment", "architecture", "bug-diagnosis", "conflict-resolution", "deep-review", "release-bootstrap", "retro", "secure-linux-web-hosting", "ship", "tdd-orchestrator"]);
const CURRENT_PROFILES = Object.freeze(["requirements-reader", "architect", "host-operator", "deep-reviewer", "spec-kit-author", "test-author", "backend-developer", "frontend-developer", "refactorer", "peer-reviewer", "validator", "integrator"]);
const REQUIRED_SOURCE_SCOPE = "current-six-alignment-sources";
const REQUIRED_PACKAGE_SCOPE = "current-installed-package";
const ROUTE_ARTIFACT_ROOT = ".omp/state/native-route";
const READING_TAG_RULE = "instance_id is exactly the full host-observed Root get_state session followed by one ADDED ASCII colon separator and the exact assignment name: <root_session>:<assignment_name>. Preserve both components verbatim, including any punctuation already within them; do not substitute a slash separator, invent an opaque child/SDK identifier, or normalize the observed Root session";
const ALIGNMENT_SOURCES = Object.freeze([
  Object.freeze({
    path: "alignment/SKILL.md",
    bytes: 15594,
    sha256: "199ff8b2bb5546a1861666905d7098693076fc393a68ef33f81a9c5f65eb56b5",
    overlay: ".omp/skills/alignment/SKILL.md",
  }),
  Object.freeze({
    path: "alignment/agents/requirements-reader.md",
    bytes: 3473,
    sha256: "4dce707a9af220d638ef862c45d723b79834f7dd4185ce05ddcc4af1f7702186",
    overlay: ".omp/agents/requirements-reader.md",
  }),
  Object.freeze({
    path: "alignment/references/comprehension-review.md",
    bytes: 2374,
    sha256: "9c40f76171fa2b297dbbb4df7207a27f09175d362f1ac228318f5248d1214bc8",
    overlay: ".omp/skills/alignment/references/comprehension-review.md",
  }),
  Object.freeze({
    path: "alignment/references/domain-modeling.md",
    bytes: 1880,
    sha256: "9c893bf140912cd4c8bcad0873ca4d59f9dfabda74c896fc3eb9328dfd08c39b",
    overlay: ".omp/skills/alignment/references/domain-modeling.md",
  }),
  Object.freeze({
    path: "alignment/references/routing-and-persistence.md",
    bytes: 7492,
    sha256: "2a54023f5973eabf18e763e2922410ac2bbb4ff01e07a9b517bb121a72087c9a",
    overlay: ".omp/skills/alignment/references/routing-and-persistence.md",
  }),
  Object.freeze({
    path: "alignment/references/writing-for-agents.md",
    bytes: 2168,
    sha256: "1241ce58bd8d6b63015ec16855ae40e77384b4428232853882ace54b00c82b24",
    overlay: ".omp/skills/alignment/references/writing-for-agents.md",
  }),
]);

const REQUIRED_ROOT_READS = Object.freeze([
  ".omp/skills/alignment/SKILL.md",
  ".omp/skills/alignment/references/routing-and-persistence.md",
  ".omp/agents/requirements-reader.md",
  "specs/specs005-omp-compatible-release/spec.md",
  "specs/specs005-omp-compatible-release/contracts/interface-contract.md",
]);
const REQUIRED_READER_READS = Object.freeze([
  ".omp/agents/requirements-reader.md",
  ".omp/skills/tdd-orchestrator/references/model-policy.md",
  ".omp/skills/alignment/SKILL.md",
  ".omp/skills/alignment/references/routing-and-persistence.md",
  ".omp/skills/alignment/references/comprehension-review.md",
  ".omp/skills/deep-review/references/fresh-review.md",
  "specs/specs005-omp-compatible-release/spec.md",
  "specs/specs005-omp-compatible-release/contracts/interface-contract.md",
]);
const FORBIDDEN_TOOL_PARTS = Object.freeze([
  "git",
  "publish",
  "release",
  "deploy",
  "network",
  "curl",
  "fetch",
  "ssh",
  "host",
  "service",
  "settings",
  "config",
  "login",
  "auth",
  "github",
  "ship",
  "write",
  "edit",
  "patch",
  "bash",
  "shell",
  "powershell",
  "cmd",
]);
const TERMINAL_STATUSES = new Set(["completed", "complete", "success", "succeeded", "failed", "error", "aborted", "canceled", "cancelled", "blocked"]);
const SUCCESS_STATUSES = new Set(["completed", "complete", "success", "succeeded"]);
const FORBIDDEN_TASK_KEYS = new Set([
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
  "provider",
  "modelRoute",
  "model_route",
  "alias",
  "aliases",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value) {
  return sha256(Buffer.from(String(value), "utf8"));
}
function compareUnicode(left, right) {
  const a = [...left];
  const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const delta = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}

function canonicalJson(value) {
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON number is not finite");
    return JSON.stringify(Object.is(value, -0) ? 0 : value).replace("e+", "e");
  }
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isObject(value)) {
    const entries = Object.entries(value).map(([key, child]) => ({ key: key.normalize("NFC"), child }));
    entries.sort((left, right) => compareUnicode(left.key, right.key));
    for (let index = 1; index < entries.length; index += 1) if (entries[index - 1].key === entries[index].key) throw new TypeError("canonical JSON key collision after NFC");
    return `{${entries.map(({ key, child }) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  throw new TypeError("canonical JSON contains unsupported value");
}

function canonicalMatches(value) {
  try {
    return canonicalJson(JSON.parse(value)) === value;
  } catch {
    return false;
  }
}

function validAlignmentResponse(value) {
  return isObject(value)
    && Number.isSafeInteger(value.round)
    && value.round >= 1
    && typeof value.question_id === "string"
    && value.question_id.trim() !== ""
    && value.question_id === value.question_id.normalize("NFC")
    && typeof value.question === "string"
    && value.question.trim() !== ""
    && value.question === value.question.normalize("NFC")
    && typeof value.answer === "string"
    && value.answer.trim() !== ""
    && value.answer === value.answer.normalize("NFC");
}

function validResponseSequence(responses) {
  if (!Array.isArray(responses)) return false;
  const ids = new Set();
  let previousRound = 0;
  for (const response of responses) {
    if (!validAlignmentResponse(response) || response.round <= previousRound || ids.has(response.question_id)) return false;
    previousRound = response.round;
    ids.add(response.question_id);
  }
  return true;
}

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return structuredClone(value);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function requireContext(context) {
  if (!isObject(context)) throw new TypeError("route context must be an object");
  if (!UUID_V4.test(String(context.runId ?? ""))) throw new TypeError("route context.runId must be a UUID-v4");
  if (!nonEmpty(context.revision)) throw new TypeError("route context.revision must be non-empty");
  if (!nonEmpty(context.nonce)) throw new TypeError("route context.nonce must be non-empty");
}

function normalized(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\.\//, "").toLowerCase();
}

function normalizedAbsolute(value) {
  return path.resolve(String(value)).replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase();
}

function inside(root, child) {
  const base = normalizedAbsolute(root).replace(/\/$/, "");
  const target = normalizedAbsolute(child).replace(/\/$/, "");
  return target === base || target.startsWith(`${base}/`);
}

function regularFile(file, label) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    const wrapped = new Error(`${label} is not readable`);
    wrapped.code = error?.code ?? "ENOENT";
    throw wrapped;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) {
    const wrapped = new Error(`${label} is not a private regular file`);
    wrapped.code = "UNSAFE_FILE";
    throw wrapped;
  }
  return stat;
}

function regularDirectory(directory, label) {
  let stat;
  try {
    stat = fs.lstatSync(directory);
  } catch (error) {
    const wrapped = new Error(`${label} is not readable`);
    wrapped.code = error?.code ?? "ENOENT";
    throw wrapped;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    const wrapped = new Error(`${label} is not a private directory`);
    wrapped.code = "UNSAFE_DIRECTORY";
    throw wrapped;
  }
  return stat;
}
function assertPrivateAncestors(root, target, label) {
  const base = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  const relative = path.relative(base, absoluteTarget);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    const wrapped = new Error(`${label} escaped projectRoot`);
    wrapped.code = "UNSAFE_PATH";
    throw wrapped;
  }
  let cursor = base;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      const wrapped = new Error(`${label} traversed a symlink ancestor`);
      wrapped.code = "UNSAFE_FILE";
      throw wrapped;
    }
    if (cursor !== absoluteTarget && !stat.isDirectory()) {
      const wrapped = new Error(`${label} traversed a non-directory ancestor`);
      wrapped.code = "UNSAFE_FILE";
      throw wrapped;
    }
  }
}

function readPrivateJson(projectRoot, descriptor, label, expectedRelative = null) {
  if (descriptor === undefined || descriptor === null) return { kind: "missing", reason: `${label} descriptor is absent` };
  const rawPath = typeof descriptor === "string" ? descriptor : descriptor.path;
  if (!nonEmpty(rawPath)) return { kind: "failure", reason: `${label} descriptor has no path` };
  const resolved = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(projectRoot, rawPath);
  if (!inside(projectRoot, resolved)) return { kind: "failure", reason: `${label} escaped projectRoot`, path: resolved };
  if (expectedRelative && normalized(path.relative(projectRoot, resolved)) !== normalized(expectedRelative)) {
    return { kind: "failure", reason: `${label} used an unexpected path`, expected: expectedRelative, observed: path.relative(projectRoot, resolved) };
  }
  try {
    assertPrivateAncestors(projectRoot, resolved, label);
    const stat = regularFile(resolved, label);
    const bytes = fs.readFileSync(resolved);
    const digest = sha256(bytes);
    if (isObject(descriptor) && descriptor.bytes !== undefined && descriptor.bytes !== bytes.byteLength) {
      return { kind: "failure", reason: `${label} byte count does not match descriptor`, expected: descriptor.bytes, observed: bytes.byteLength };
    }
    if (isObject(descriptor) && descriptor.sha256 !== undefined && String(descriptor.sha256).toLowerCase() !== digest) {
      return { kind: "failure", reason: `${label} SHA-256 does not match descriptor`, expected: descriptor.sha256, observed: digest };
    }
    let value;
    try {
      value = JSON.parse(bytes.toString("utf8"));
    } catch {
      return { kind: "failure", reason: `${label} is not valid JSON`, path: resolved };
    }
    return { kind: "ok", path: resolved, relativePath: path.relative(projectRoot, resolved).replaceAll("\\", "/"), bytes, digest, value, stat };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { kind: "missing", reason: `${label} is absent`, path: resolved };
    return { kind: "failure", reason: error?.message ?? `${label} could not be read`, path: resolved };
  }
}

function readPrivateBytes(projectRoot, descriptor, label, expectedRelative = null) {
  if (descriptor === undefined || descriptor === null) return { kind: "missing", reason: `${label} descriptor is absent` };
  const rawPath = typeof descriptor === "string" ? descriptor : descriptor.path;
  if (!nonEmpty(rawPath)) return { kind: "failure", reason: `${label} descriptor has no path` };
  const resolved = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(projectRoot, rawPath);
  if (!inside(projectRoot, resolved)) return { kind: "failure", reason: `${label} escaped projectRoot`, path: resolved };
  if (expectedRelative && normalized(path.relative(projectRoot, resolved)) !== normalized(expectedRelative)) {
    return { kind: "failure", reason: `${label} used an unexpected path`, expected: expectedRelative, observed: path.relative(projectRoot, resolved) };
  }
  try {
    assertPrivateAncestors(projectRoot, resolved, label);
    regularFile(resolved, label);
    const bytes = fs.readFileSync(resolved);
    const digest = sha256(bytes);
    if (isObject(descriptor) && descriptor.bytes !== undefined && descriptor.bytes !== bytes.byteLength) return { kind: "failure", reason: `${label} byte count does not match descriptor`, expected: descriptor.bytes, observed: bytes.byteLength };
    if (isObject(descriptor) && descriptor.sha256 !== undefined && String(descriptor.sha256).toLowerCase() !== digest) return { kind: "failure", reason: `${label} SHA-256 does not match descriptor`, expected: descriptor.sha256, observed: digest };
    return { kind: "ok", path: resolved, relativePath: path.relative(projectRoot, resolved).replaceAll("\\", "/"), bytes, digest };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { kind: "missing", reason: `${label} is absent`, path: resolved };
    return { kind: "failure", reason: error?.message ?? `${label} could not be read`, path: resolved };
  }
}

function descriptorFor(artifacts, key) {
  if (!isObject(artifacts)) return undefined;
  if (Object.hasOwn(artifacts, key)) return artifacts[key];
  if (isObject(artifacts.files) && Object.hasOwn(artifacts.files, key)) return artifacts.files[key];
  return undefined;
}
function validateRouteArtifactDirectory(definition, projectRoot, checks, missing, failures) {
  const root = path.resolve(projectRoot, ROUTE_ARTIFACT_ROOT);
  const policy = isObject(definition.artifactPolicy) ? definition.artifactPolicy : {};
  const allowed = new Set([...((Array.isArray(policy.files) ? policy.files : [])), ...((Array.isArray(policy.allowed) ? policy.allowed : []))].filter((item) => typeof item === "string").map((item) => path.basename(item)));
  if (definition.mode === "git" && definition.route === "full") {
    allowed.add("corrupt-successor-before.json");
    allowed.add("corrupt-successor-after.json");
    allowed.add("cas");
  }
  try {
    regularDirectory(root, "native route artifact root");
    const extras = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => !allowed.has(entry.name)).map((entry) => entry.name);
    if (extras.length) recordCheck(checks, missing, failures, "artifacts.allowlist", "FAIL", { reason: "native route artifact root contains unallowlisted files or directories", extras });
    else recordCheck(checks, missing, failures, "artifacts.allowlist", "PASS", { files: [...allowed].sort() });
  } catch (error) {
    recordCheck(checks, missing, failures, "artifacts.allowlist", error?.code === "ENOENT" ? "PENDING" : "FAIL", { reason: error?.message ?? "native route artifact root is not readable" });
  }
}

function recordCheck(checks, missing, failures, id, status, details = {}) {
  // Observed checkpoint/task metadata must not overwrite the validator's verdict.
  const { id: observedId, status: observedStatus, ...observations } = details;
  if (Object.hasOwn(details, "id")) observations.observed_id = observedId;
  if (Object.hasOwn(details, "status")) observations.observed_status = observedStatus;
  checks.push({ id, status, ...observations });
  if (status === "PENDING") missing.push({ id, ...observations });
  if (status === "FAIL") failures.push({ id, ...observations });
}


function freezeDefinition(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  for (const child of Object.values(value)) freezeDefinition(child);
  return Object.freeze(value);
}

function taskDescriptorPath(step) {
  return `${ROUTE_ARTIFACT_ROOT}/task-${step}.json`;
}

function taskDescriptorKey(step) {
  return `task${String(step).slice(0, 1).toUpperCase()}${String(step).slice(1)}`;
}
function buildRouteTaskDescriptor(definition, step, alignmentSources) {
  const semanticStep = step.startsWith("namespace-b-") ? step.slice("namespace-b-".length) : step;
  const assignmentKey = semanticStep === "collision" ? "collision" : semanticStep === "resume" ? "resume" : "initial";
  return {
    schema: "native-route-task-descriptor/v1",
    step: semanticStep,
    assignment_id: definition?.assignment?.[assignmentKey] ?? null,
    agent: "requirements-reader",
    run_id: definition?.binding?.run_id ?? null,
    revision: definition?.binding?.revision ?? null,
    nonce: definition?.binding?.nonce ?? null,
    reader_context: isObject(alignmentSources?.reader_context) ? clone(alignmentSources.reader_context) : null,
    source_fingerprints: Array.isArray(alignmentSources?.reader_sources) ? clone(alignmentSources.reader_sources) : [],
    reading_tag_rule: READING_TAG_RULE,
    required_reads: [...REQUIRED_READER_READS],
  };
}

function requiredTask(name, mode, route, step, context) {
  const descriptorPath = taskDescriptorPath(step);
  const task = {
    name,
    agent: "requirements-reader",
    task: [
      `Read the exact host-written immutable route descriptor ${descriptorPath}.`,
      "Use only the dynamic inputs, required reads, and reading-tag rule in that descriptor.",
      "Read only the approved regular files inside this private project, using their project-relative .omp/ or specs/ paths. Do not discover tool catalogs or read resource URIs (including xd://, agent://, proc://, history://, or skill://), user HOME, or files outside this project; all required skill instructions are already regular project files listed in the descriptor.",
      `This is route step ${step}; preserve the exact task terminal identity and emit REQUIREMENTS_READING_V1 with source hashes.`,
      "Do not write files, run Git, invoke Ship, publish, use network/host/settings, or dispatch another task.",
    ].join("\n"),
    solutionSpace: "Independent requirements reading only; no code/spec/state approval.",
  };
  return task;
}

function promptFor({ caseId, mode, route, step, context, task, requestIdToken = null, runIdToken = null, collision = false }) {
  const taskName = `${caseId}.${collision ? "corrupt" : step}.requirements-reader`;
  const canonicalTask = task ?? requiredTask(taskName, mode, route, step, context);
  const identityBinding = requestIdToken && runIdToken
    ? `request_id=${requestIdToken}; run_id=${runIdToken}`
    : step === "initial"
      ? "Use the approved protected checkpoint helper for independent cryptographic UUID-v4 request_id and run_id; the model must not generate these values"
      : "Read and preserve the exact persisted request_id and run_id; do not generate a new namespace";
  const unresolved = route === "full" && step === "initial";
  const requestDefinition = route === "short"
    ? "one localized reversible low-risk read-only checkpoint with no dependency fan-out"
    : "a material decision remains open and must fail closed before an explicit append-only resume";
  const resumeAnswer = collision
    ? "Return BLOCKED, preserve the already sealed history, and refuse to mutate any successor slot that is not exclusively writable."
    : "The durable checkpoint must remain append-only and the existing request/run identity must be preserved.";
  const action = unresolved
    ? "Persist one BLOCKED full-route checkpoint with the real non-empty frontier; do not infer an answer or route onward."
    : collision
      ? "Read the exact sealed parent and corrupt successor; return BLOCKED without replacing, truncating, deleting, renaming, or repairing either file."
      : step === "resume"
        ? `Resume the exact request/run namespace, append exactly this supplied response: ${resumeAnswer} Recompute canonical/digest and persist one exclusive successor.`
        : "Persist the resolved route checkpoint and read it back before reporting.";
  return [
    `Perform one real alignment route case ${caseId} using the installed alignment skill.`,
    `${identityBinding}; logical_run_id=${context.runId}; revision=${context.revision}; nonce=${context.nonce}`,
    `Request definition: ${requestDefinition}.`,
    `Before any child dispatch or final verdict, Root itself MUST read ${[...REQUIRED_ROOT_READS, taskDescriptorPath(step)].join(", ")}. Wait for every required Root read to finish successfully before issuing task; the child's later reads do not satisfy this Root prerequisite.`,
    `Canonical task item (copy this JSON exactly; no append, paraphrase, or extra task fields): ${JSON.stringify(canonicalTask)}`,
    collision ? "Do not dispatch any child for the corrupt-successor decision; Root must read the actual target and emit its own bounded BLOCKED verdict." : `Dispatch exactly this canonical task object with agent=requirements-reader and name=${taskName}; do not send per-call model/settings/structured/isolated/tools/provider/alias/outputSchema fields.`,
    collision ? "Root remains authoritative for the read-only collision verdict and must preserve the sealed history." : `The requirements-reader must first read the host descriptor ${taskDescriptorPath(step)}, then read: ${REQUIRED_READER_READS.join(", ")}. The descriptor binds the caller-provided run_id, source_revision, nonce, source fingerprints, reader_context and reading-tag rule. Do not put descriptor values in new task parameters. Give the reader instance_id as the host-observed Root session plus its task name: a caller-derived reading tag, not an opaque SDK child identifier. Retain hash provenance rather than computing hashes in the model. Emit the actual REQUIREMENTS_READING_V1 result; COMPLETE means reading sufficient, never approval.`,
    action,
    collision ? "A successor collision is intentionally present; preserve all prior bytes and report the actual blocked terminal." : "Only the alignment product's normal checkpoint persistence is allowed; no Git initialization in local mode and no publication in either mode.",
    "Wait for real task and Root terminals. Preserve actual inline SingleResult exitCode/isError/error/aborted fields; for task_async_result preserve raw exitCode/isError/error/aborted as unavailable nulls and use only the actual completed async job plus valid schema. Root agent_end has isTerminal, not isError. Never invent opaque SDK task/session IDs.",
  ].join("\n");
}


function commonArtifactPolicy(caseId, mode, route) {
  const files = [
    Object.freeze({ key: "packageManifest", path: `${ROUTE_ARTIFACT_ROOT}/package-manifest.json`, format: "json", required: true }),
    Object.freeze({ key: "packageBinding", path: `${ROUTE_ARTIFACT_ROOT}/package-binding.json`, format: "json", required: true }),
    Object.freeze({ key: "sourceFingerprints", path: `${ROUTE_ARTIFACT_ROOT}/alignment-sources.json`, format: "json", required: true }),
    Object.freeze({ key: "preservation", path: `${ROUTE_ARTIFACT_ROOT}/preservation.json`, format: "json", required: true }),
  ];
  if (mode === "git") files.push(Object.freeze({ key: "gitReceipt", path: `${ROUTE_ARTIFACT_ROOT}/git-receipt.json`, format: "json", required: true }));
  const allowed = [
    `${ROUTE_ARTIFACT_ROOT}/package-manifest.json`,
    `${ROUTE_ARTIFACT_ROOT}/package-binding.json`,
    `${ROUTE_ARTIFACT_ROOT}/alignment-sources.json`,
    `${ROUTE_ARTIFACT_ROOT}/preservation.json`,
    mode === "git" ? `${ROUTE_ARTIFACT_ROOT}/git-receipt.json` : null,
    `${ROUTE_ARTIFACT_ROOT}/inspection-input.json`,
  ].filter(Boolean);
  const descriptorSteps = ["initial", ...(route === "full" ? ["resume"] : []), ...(mode === "git" && route === "full" ? ["collision"] : [])];
  for (const step of descriptorSteps) {
    files.push(Object.freeze({ key: taskDescriptorKey(step), path: taskDescriptorPath(step), format: "json", required: true }));
    allowed.push(taskDescriptorPath(step));
  }
  const checkpointRoot = mode === "local"
    ? "<local-root>/.omp/state/alignment/<request_id>/<run_id>"
    : "<git-common-dir>/alignment/<request_id>/<run_id>";
  if (route === "full") {
    files.push(Object.freeze({ key: "checkpointInitial", path: null, format: "alignment-checkpoint", required: true }));
    files.push(Object.freeze({ key: "checkpointResume", path: null, format: "alignment-checkpoint", required: true }));
    allowed.push(`${checkpointRoot}/checkpoint-000000.json`);
    allowed.push(`${checkpointRoot}/checkpoint-000001.json`);
  } else {
    files.push(Object.freeze({ key: "checkpointInitial", path: null, format: "alignment-checkpoint", required: true }));
    allowed.push(`${checkpointRoot}/checkpoint-000000.json`);
  }
  if (mode === "git" && route === "full") {
    files.push(Object.freeze({ key: "checkpointCollision", path: null, format: "alignment-checkpoint-bytes", required: true }));
    allowed.push(`${ROUTE_ARTIFACT_ROOT}/cas-receipt.json`);
    allowed.push(`${ROUTE_ARTIFACT_ROOT}/cas/corrupt-successor-before.json`);
    allowed.push(`${ROUTE_ARTIFACT_ROOT}/cas/corrupt-successor-after.json`);
    allowed.push(`${ROUTE_ARTIFACT_ROOT}/cas`);
  }
  return { root: ROUTE_ARTIFACT_ROOT, files, allowed, forbidden: [".git creation in local mode", "Git publication", "Ship/GitHub/network/host/settings effects"] };
}

function buildCase(context, caseId, mode, route) {
  const initialName = `${caseId}.initial.requirements-reader`;
  const initialTask = requiredTask(initialName, mode, route, "initial", context);
  const resumeName = `${caseId}.resume.requirements-reader`;
  const resumeTask = route === "full" ? requiredTask(resumeName, mode, route, "resume", context) : null;
  const collisionName = `${caseId}.corrupt.requirements-reader`;
  const collisionTask = mode === "git" && route === "full" ? requiredTask(collisionName, mode, route, "collision", context) : null;
  const definition = {
    schema: "native-route-case/v1",
    contract: CONTRACT_VERSION,
    id: caseId,
    mode,
    route,
    binding: { run_id: context.runId, revision: context.revision, nonce: context.nonce },
    assignment: { agent: "requirements-reader", initial: initialName, resume: route === "full" ? resumeName : null, collision: collisionTask ? collisionName : null },
    expected: {
      initial: route === "short" ? "CLOSED" : "BLOCKED",
      resume: route === "full" ? "CLOSED" : null,
      collision: collisionTask ? "BLOCKED" : null,
    },
    requiredReads: { root: [...REQUIRED_ROOT_READS], requirements_reader: [...REQUIRED_READER_READS] },
    requiredSourceFingerprints: ALIGNMENT_SOURCES.map((item) => ({ path: item.path, bytes: item.bytes, sha256: item.sha256 })),
    requiredPackage: { scope: REQUIRED_PACKAGE_SCOPE, exact_skills: 10, exact_profiles: 12, historical_manifest_sha256_forbidden: HISTORICAL_SIX_TARGET_MANIFEST },
    persistence: {
      namespace: mode === "local" ? ".omp/state/alignment/<request_id>/<run_id>" : "<git-common-dir>/alignment/<request_id>/<run_id>",
      checkpoint_file: "checkpoint-<six-digit-index>.json",
      append_only: true,
      exclusive_successor: true,
      collision_policy: "BLOCKED without clobber",
    },
    effects: {
      local_git_directory: mode === "local" ? "must-not-exist" : "must-exist-and-be-resolved",
      publication: "must-not-be-attempted",
      user_home_source_settings_host_network: "must-not-be-touched",
    },
    steps: {
      initial: {
        id: "initial",
        expected_status: route === "short" ? "CLOSED" : "BLOCKED",
        prompt: promptFor({ caseId, mode, route, step: "initial", context, task: initialTask }),
        task: initialTask,
      },
      resume: route === "full" ? {
        id: "resume",
        expected_status: "CLOSED",
        prompt: promptFor({ caseId, mode, route, step: "resume", context, task: resumeTask }),
        task: resumeTask,
      } : null,
      collision: collisionTask ? {
        id: "collision",
        expected_status: "BLOCKED",
        prompt: promptFor({ caseId, mode, route, step: "collision", context, task: collisionTask, collision: true }),
        task: collisionTask,
      } : null,
    },
    prompt: promptFor({ caseId, mode, route, step: "initial", context, task: initialTask }),
    artifactPolicy: commonArtifactPolicy(caseId, mode, route),
    setup: {
      projectRoot: "private disposable project supplied by integration owner",
      install: "copy the current installed ten skills/twelve profiles into .omp/skills and .omp/agents without editing bytes",
      docs: "copy current specs005 spec and interface contract into the private project at the exact required read paths",
      receipts: "write only the route artifact files named by artifactPolicy and capture actual checkpoint bytes/paths; no source checkout or user HOME writes",
      native: "reuse lifecycle owner RPC/session/capture; do not launch another transport from this module",
    },
  };
  return freezeDefinition(definition);
}

export function buildRouteCases(context) {
  requireContext(context);
  return [
    buildCase(context, "SHORT_LOCAL", "local", "short"),
    buildCase(context, "FULL_LOCAL", "local", "full"),
    buildCase(context, "SHORT_GIT", "git", "short"),
    buildCase(context, "FULL_GIT", "git", "full"),
  ];
}

function matchingStepNative(native, step) {
  if (!isObject(native)) return undefined;
  if (isObject(native.steps) && Object.hasOwn(native.steps, step)) return native.steps[step];
  if (step === "namespace-b-initial" || step === "namespace-b-resume") {
    const label = step;
    return isObject(native.steps) ? native.steps[label] : undefined;
  }
  if (step === "initial") return native;
  return undefined;
}
function trustedNativeOriginRecord(origin) {
  return Boolean(
    isObject(origin) &&
    origin.kind === "host-observed-native-rpc" &&
    origin.source === "host-rpc-process" &&
    origin.process_observed === true &&
    origin.native_rpc === true &&
    origin.source_binding === true &&
    origin.process_count === 1,
  );
}
function trustedNativeOrigin(native, definition) {
  const stepNames = Object.keys(definition?.steps ?? {}).filter((step) => isObject(definition.steps[step]));
  if (definition?.mode === "git" && definition?.route === "full") stepNames.push("namespace-b-initial", "namespace-b-resume");
  return stepNames.length > 0 && stepNames.every((step) => {
    const capture = native?.steps?.[step];
    return capture?.native === true
      && trustedNativeOriginRecord(capture?.origin)
      && capture?.source_derived !== true
      && (capture?.native_process_count ?? capture?.origin?.process_count) === 1
      && String(capture?.evidence_level ?? capture?.evidenceLevel ?? "") === AUTHENTIC_EVIDENCE_LEVEL;
  });
}


function collectValues(value, output = [], depth = 0) {
  if (depth > 10 || value === null || value === undefined) return output;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectValues(item, output, depth + 1);
    return output;
  }
  if (isObject(value)) {
    for (const item of Object.values(value)) collectValues(item, output, depth + 1);
  }
  return output;
}

function collectKeys(value, keys, output = [], depth = 0) {
  if (depth > 10 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys, output, depth + 1);
    return output;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (keys.has(key)) output.push({ key, value: child });
      collectKeys(child, keys, output, depth + 1);
    }
  }
  return output;
}

function hasForbiddenTaskKey(value, depth = 0) {
  if (depth > 10 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = hasForbiddenTaskKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_TASK_KEYS.has(key)) return key;
      const found = hasForbiddenTaskKey(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function toolName(event) {
  if (!isObject(event)) return "";
  for (const key of ["tool", "toolName", "tool_name", "name"]) if (typeof event[key] === "string") return event[key];
  return "";
}

function eventPaths(event) {
  const result = [];
  const keys = new Set(["path", "paths", "file", "files", "filename", "filepath", "file_path", "target"]);
  for (const item of collectKeys(event, keys)) {
    if (typeof item.value === "string") result.push(item.value);
    else if (Array.isArray(item.value)) result.push(...item.value.filter((value) => typeof value === "string"));
  }
  return [...new Set(result)];
}

function pathMatches(projectRoot, observed, expected) {
  const raw = String(observed ?? "");
  const absolute = path.isAbsolute(raw) ? normalizedAbsolute(raw) : normalizedAbsolute(path.resolve(projectRoot, raw));
  const wanted = normalizedAbsolute(path.resolve(projectRoot, expected));
  return absolute === wanted;
}

function eventType(event) {
  return String(event?.type ?? event?.event_type ?? event?.phase ?? "").toLowerCase();
}

function eventCallId(event) {
  return event?.tool_call_id ?? event?.toolCallId ?? event?.call_id ?? event?.callId ?? null;
}

function eventError(event) {
  const values = [event?.is_error, event?.isError].filter((value) => value !== undefined && value !== null);
  return values.length && values.every((value) => typeof value === "boolean" && value === values[0]) ? values[0] : null;
}

function readEventSequence(events, projectRoot, expectedPaths) {
  const all = Array.isArray(events) ? events : [];
  const readEvent = (event) => ["read", "grep", "glob"].includes(toolName(event).toLowerCase());
  const starts = all.filter((event) => ["tool_execution_start", "start"].includes(eventType(event)) && readEvent(event));
  return expectedPaths.map((expected) => {
    const candidates = starts.filter((event) => eventPaths(event).some((observed) => pathMatches(projectRoot, observed, expected)));
    let completed = null;
    let contradictory = false;
    for (const start of candidates) {
      const callId = eventCallId(start);
      if (!nonEmpty(callId)) continue;
      const matchingStarts = starts.filter((event) => eventCallId(event) === callId);
      const ends = all.filter((event) => ["tool_execution_end", "end"].includes(eventType(event)) && readEvent(event) && eventCallId(event) === callId);
      if (matchingStarts.length !== 1 || ends.length > 1) { contradictory = true; continue; }
      const end = ends[0];
      if (!end) continue;
      const flags = [end.is_error, end.isError].filter((value) => typeof value === "boolean");
      if (new Set(flags).size > 1) { contradictory = true; continue; }
      const endPaths = eventPaths(end);
      if (eventError(end) === false && Number.isFinite(start.sequence) && Number.isFinite(end.sequence) && end.sequence > start.sequence && (endPaths.length === 0 || endPaths.some((observed) => pathMatches(projectRoot, observed, expected)))) completed ??= { start, end, callId };
    }
    return { path: expected, observed: Boolean(completed) && !contradictory, contradictory, sequence: completed?.start.sequence ?? null, end_sequence: completed?.end.sequence ?? null, tool_call_id: completed?.callId ?? null };
  });
}

function allNativeEvents(native) {
  const events = [];
  const append = (value, parent = null) => {
    if (Array.isArray(value)) { for (const item of value) append(item, parent); return; }
    if (!isObject(value)) return;
    const current = parent ? { ...value, __parent_identity: parent } : value;
    events.push(current);
    const identity = value.id ?? value.allocated_id ?? value.allocatedId ?? parent;
    if (isObject(value.payload)) append(value.payload, identity);
    if (isObject(value.event)) append(value.event, identity);
  };
  for (const key of ["tool_events", "subagent_frames", "subagent_reads", "subagent_writes", "events", "rpc_events", "frames"]) append(native?.[key]);
  return events;
}
function routeOutcomeStatus(native, record = null) {
  const data = findRequirementsResult(record);
  if (!isObject(data)) return null;
  for (const key of ["checkpoint_status", "route_status", "outcome_status", "checkpointStatus", "routeStatus", "outcomeStatus"]) {
    if (typeof data[key] === "string" && data[key].trim()) return data[key].trim().toUpperCase();
  }
  return null;
}
function rootCollisionVerdict(native, projectRoot, requestId, runId, targetPath) {
  const terminal = isObject(native?.terminal) ? native.terminal : null;
  const root = isObject(native?.root_verdict) ? { ...native.root_verdict, ...(terminal ?? {}) } : terminal;
  const prompt = isObject(root?.prompt_result) ? root.prompt_result : isObject(root?.promptResult) ? root.promptResult : null;
  const message = isObject(root?.last_message) ? root.last_message : isObject(root?.lastMessage) ? root.lastMessage : null;
  const candidates = [];
  for (const value of [message?.content, message?.text, message?.document, root?.assistant_text, native?.assistant_text]) {
    if (typeof value === "string") candidates.push(value);
    else if (Array.isArray(value)) for (const item of value) if (typeof item === "string") candidates.push(item); else if (isObject(item) && typeof item.text === "string") candidates.push(item.text);
  }
  const document = candidates.map((text) => {
    try {
      const value = JSON.parse(text);
      return isObject(value) ? value : null;
    } catch {
      return null;
    }
  }).find(Boolean) ?? null;
  const documentVerdict = String(document?.verdict ?? document?.status ?? document?.outcome ?? "").toUpperCase();
  const documentSignals = isObject(document?.signals) ? document.signals : null;
  const documentRequest = document?.request_id ?? document?.requestId;
  const documentRun = document?.run_id ?? document?.runId;
  const documentStep = document?.step;
  const hostSessionEvidence = isObject(native?.root_session) ? native.root_session : null;
  const hostPromptEvidence = isObject(native?.root_prompt) ? native.root_prompt : null;
  const hostObservation = isObject(native?.host_observation) ? native.host_observation : null;
  const hostBinding = isObject(native?.route_binding) ? native.route_binding : isObject(hostObservation?.route_binding) ? hostObservation.route_binding : null;
  const hostRootSession = hostSessionEvidence?.session_id ?? hostObservation?.root_session_id;
  const hostPrompt = isObject(hostObservation?.root_prompt) ? hostObservation.root_prompt : hostPromptEvidence;
  const hostPromptRequestId = hostPrompt?.request_id ?? hostPromptEvidence?.request_id ?? hostBinding?.prompt_request_id;
  const hostWaiter = isObject(hostObservation?.waiter) ? hostObservation.waiter : null;
  const promptId = prompt?.id ?? null;
  const recordedPromptId = hostPromptRequestId;
  const rootSettled = root?.session_settled ?? root?.sessionSettled ?? native?.session_settled ?? native?.sessionSettled;
  const documentTarget = document?.target_path ?? document?.targetPath;
  const rootReadObserved = Boolean(hostRootSession && targetPath && hostObservation && allNativeEvents(native).some((event) => {
    const type = String(event?.type ?? event?.event_type ?? event?.phase ?? "").toLowerCase();
    if (type !== "tool_execution_start" && type !== "start") return false;
    const eventObservation = isObject(event?.host_observation) ? event.host_observation : null;
    const observedByHost = eventObservation?.source === "host-rpc-stream" && eventObservation?.root_session_id === hostRootSession;
    const eventSession = event?.root_session ?? event?.rootSession ?? event?.session_id ?? event?.sessionId;
    const eventSource = event?.root_session_source ?? event?.rootSessionSource;
    const observedByProducer = eventSession === hostRootSession && (eventSource === "producer" || eventSource === "host_get_state.data.sessionId");
    const name = toolName(event).toLowerCase();
    return (observedByHost || observedByProducer) && (name === "read" || name === "grep" || name === "glob" || name.startsWith("read.") || name.startsWith("grep.") || name.startsWith("glob.")) && eventPaths(event).some((observed) => pathMatches(projectRoot, observed, targetPath));
  }) && readEventSequence(allNativeEvents(native), projectRoot, [targetPath])[0]?.observed === true);
  const fieldsPresent = Boolean(root && prompt && document && hostObservation && hostBinding);
  const hostSessionComplete = hostObservation?.source === "host-rpc-stream" && nonEmpty(hostObservation?.root_session_id) && (!hostSessionEvidence || (hostSessionEvidence.observed === true && hostSessionEvidence.source === "get_state.data.sessionId" && hostSessionEvidence.session_id === hostRootSession));
  const hostPromptComplete = hostPrompt?.source === "host-rpc" || hostPromptEvidence?.source === "host RPC prompt request";
  const waiterComplete = hostWaiter?.request_id === hostPromptRequestId && hostWaiter?.unique === true && hostWaiter?.correlation === "outstanding-prompt-waiter";
  const hostBindingComplete = hostSessionComplete && hostPromptComplete && waiterComplete && hostBinding?.source === "host-capture" && hostBinding?.request_id === requestId && hostBinding?.run_id === runId && hostBinding?.step === "collision" && hostBinding?.root_session === hostRootSession;
  const promptCorrelation = promptId === null ? waiterComplete : promptId === hostPromptRequestId;
  const bindingComplete = UUID_V4.test(String(documentRequest ?? "")) && UUID_V4.test(String(documentRun ?? "")) && documentRequest === requestId && documentRun === runId && documentStep === "collision" && UUID_V4.test(String(hostBinding?.request_id ?? "")) && UUID_V4.test(String(hostBinding?.run_id ?? "")) && hostBindingComplete && nonEmpty(recordedPromptId) && promptCorrelation && nonEmpty(documentTarget) && nonEmpty(targetPath) && pathMatches(projectRoot, documentTarget, targetPath) && document?.root_session === hostRootSession;
  const promptComplete = prompt?.status === "completed" && prompt?.agentInvoked === true;
  const settledComplete = rootSettled === true;
  const signalsComplete = documentVerdict === "BLOCKED" && (!documentSignals || (documentSignals.alignment === true && documentSignals.checkpoint === true));
  const valid = fieldsPresent && bindingComplete && promptComplete && settledComplete && signalsComplete && rootReadObserved;
  return { present: fieldsPresent, complete: fieldsPresent && bindingComplete && promptComplete && settledComplete && signalsComplete && rootReadObserved, valid, blocked: documentVerdict === "BLOCKED", rootReadObserved, request_id: documentRequest ?? null, run_id: documentRun ?? null, step: documentStep ?? null, root_session: hostRootSession ?? null, prompt_id: promptId ?? null, prompt_request_id: recordedPromptId ?? null, document: document ? { verdict: documentVerdict, target_path: documentTarget ?? null } : null };
}

function terminalRecords(native) {
  return (native?.task_records ?? []).filter((record) => isObject(record) && ["task_tool_details", "task_async_result", "task_wait_result"].includes(record.source_kind));
}

function normalizePublicAssignment(value) {
  return String(value ?? "").trim().replace(/\r\n?/g, "\n");
}

function validateTaskDescriptor(definition, projectRoot, step, checks, missing, failures, artifacts = null) {
  const semanticStep = step.startsWith("namespace-b-") ? step.slice("namespace-b-".length) : step;
  const descriptorPath = taskDescriptorPath(semanticStep);
  const descriptor = descriptorFor(artifacts, taskDescriptorKey(semanticStep)) ?? { path: descriptorPath };
  const file = readPrivateJson(projectRoot, descriptor, `${step} task descriptor`, descriptorPath);
  if (file.kind === "missing") {
    recordCheck(checks, missing, failures, `${step}.descriptor.file`, "PENDING", file);
    return null;
  }
  if (file.kind === "failure") {
    recordCheck(checks, missing, failures, `${step}.descriptor.file`, "FAIL", file);
    return null;
  }
  const value = file.value;
  const expectedSourceArtifact = descriptorFor(artifacts, "sourceFingerprints");
  const sourceFile = readPrivateJson(projectRoot, expectedSourceArtifact, "current reader source bindings", `${ROUTE_ARTIFACT_ROOT}/alignment-sources.json`);
  const expectedDescriptor = sourceFile.kind === "ok" ? buildRouteTaskDescriptor(definition, semanticStep, sourceFile.value) : null;
  if (!expectedDescriptor) recordCheck(checks, missing, failures, `${step}.descriptor.input`, sourceFile.kind === "failure" ? "FAIL" : "PENDING", { reason: "actual alignment-sources.json was not available for canonical descriptor construction" });
  else if (canonicalJson(value) !== canonicalJson(expectedDescriptor)) recordCheck(checks, missing, failures, `${step}.descriptor.content`, "FAIL", { reason: "task descriptor bytes/content differ from the shared host-input-bound descriptor builder", expected: expectedDescriptor, observed: value });
  else recordCheck(checks, missing, failures, `${step}.descriptor.content`, "PASS", { schema: expectedDescriptor.schema, step: expectedDescriptor.step });
  const expectedName = definition.assignment[semanticStep === "collision" ? "collision" : semanticStep === "resume" ? "resume" : "initial"];
  const identity = value?.assignment_id ?? value?.assignmentId ?? value?.name;
  const identityOk = identity === expectedName && (value?.agent === undefined || value?.agent === "requirements-reader");
  if (!identityOk) recordCheck(checks, missing, failures, `${step}.descriptor.assignment`, "FAIL", { reason: "task descriptor assignment is not the canonical requirements-reader item", expected: { name: expectedName, agent: "requirements-reader" }, observed: { name: identity ?? null, agent: value?.agent ?? null } });
  else recordCheck(checks, missing, failures, `${step}.descriptor.assignment`, "PASS", { name: expectedName, agent: value?.agent ?? "requirements-reader" });
  const bindingOk = value?.run_id === definition.binding.run_id && value?.revision === definition.binding.revision && value?.nonce === definition.binding.nonce;
  if (!bindingOk) recordCheck(checks, missing, failures, `${step}.descriptor.binding`, "FAIL", { reason: "task descriptor is not bound to the current run/revision/nonce", expected: definition.binding, observed: { run_id: value?.run_id ?? null, revision: value?.revision ?? null, nonce: value?.nonce ?? null } });
  else recordCheck(checks, missing, failures, `${step}.descriptor.binding`, "PASS", { run_id: value.run_id, revision: value.revision, nonce: value.nonce });
  const sourceRows = Array.isArray(value?.source_fingerprints) ? value.source_fingerprints : null;
  const expectedRows = expectedDescriptor?.source_fingerprints ?? [];
  if (!expectedDescriptor) recordCheck(checks, missing, failures, `${step}.descriptor.source-fingerprints`, "PENDING", { reason: "canonical descriptor source fingerprints could not be constructed" });
  else if (!sourceRows || canonicalJson(sourceRows) !== canonicalJson(expectedRows)) recordCheck(checks, missing, failures, `${step}.descriptor.source-fingerprints`, "FAIL", { reason: "task descriptor source fingerprints differ from actual alignment-sources.json", expected: expectedRows, observed: sourceRows });
  else recordCheck(checks, missing, failures, `${step}.descriptor.source-fingerprints`, "PASS", { count: sourceRows.length });
  const requiredReads = Array.isArray(value?.required_reads) ? value.required_reads.map(normalizeSourcePath) : [];
  const expectedReads = (expectedDescriptor?.required_reads ?? REQUIRED_READER_READS).map(normalizeSourcePath);
  if (requiredReads.length !== expectedReads.length || requiredReads.some((item, index) => item !== expectedReads[index])) recordCheck(checks, missing, failures, `${step}.descriptor.required-reads`, "FAIL", { reason: "task descriptor required reads differ from the shared descriptor builder", expected: expectedDescriptor?.required_reads ?? REQUIRED_READER_READS, observed: value?.required_reads ?? null });
  else recordCheck(checks, missing, failures, `${step}.descriptor.required-reads`, "PASS", { reads: expectedDescriptor?.required_reads ?? REQUIRED_READER_READS });
  const tagRule = value?.reading_tag_rule ?? value?.readingTagRule;
  if (!expectedDescriptor || tagRule !== expectedDescriptor.reading_tag_rule) recordCheck(checks, missing, failures, `${step}.descriptor.reading-tag-rule`, "FAIL", { reason: "task descriptor reading-tag rule differs from the shared descriptor builder", expected: expectedDescriptor?.reading_tag_rule ?? READING_TAG_RULE, observed: tagRule ?? null });
  else recordCheck(checks, missing, failures, `${step}.descriptor.reading-tag-rule`, "PASS", { observed: tagRule });
  if (Object.hasOwn(value ?? {}, "expected_output") || Object.hasOwn(value ?? {}, "expectedOutput")) recordCheck(checks, missing, failures, `${step}.descriptor.expected-output`, "FAIL", { reason: "task descriptor must not contain an expected output" });
  else recordCheck(checks, missing, failures, `${step}.descriptor.expected-output`, "PASS", { absent: true });
  const descriptorContext = value?.reader_context ?? value?.readerContext;
  const expectedContext = expectedDescriptor?.reader_context;
  if (!expectedDescriptor || !isObject(descriptorContext)) recordCheck(checks, missing, failures, `${step}.descriptor.reader-context`, "PENDING", { reason: "actual host reader_context was not available to bind the task descriptor" });
  else if (canonicalJson(descriptorContext) !== canonicalJson(expectedContext)) recordCheck(checks, missing, failures, `${step}.descriptor.reader-context`, "FAIL", { reason: "task descriptor reader_context differs from actual host source binding", expected: expectedContext, observed: descriptorContext });
  else recordCheck(checks, missing, failures, `${step}.descriptor.reader-context`, "PASS", { context_digest: expectedContext.context_digest });
  recordCheck(checks, missing, failures, `${step}.descriptor.bytes`, "PASS", { sha256: file.digest, bytes: file.bytes.byteLength });
  return file;
}

function terminalIdentity(record) {
  return [record?.id, record?.agentId, record?.agent_id, record?.instanceId, record?.instance_id, record?.jobId, record?.job_id]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.toLowerCase());
}
function observedLifecycleBinding(native, record) {
  const identity = record?.id;
  if (!nonEmpty(identity)) return null;
  const frames = Array.isArray(native?.subagent_frames) ? native.subagent_frames : [];
  const matches = frames.filter((frame) => {
    if (!isObject(frame)) return false;
    const type = String(frame.type ?? frame.event_type ?? frame.phase ?? "").toLowerCase();
    if (type !== "subagent_lifecycle") return false;
    return [frame.id, frame.identity, frame.agent_id, frame.agentId].some((value) => value === identity);
  });
  const tuples = matches.map((frame) => ({
    id: frame.id ?? frame.identity ?? frame.agent_id ?? frame.agentId ?? null,
    allocated_id: frame.allocated_id ?? frame.allocatedId ?? null,
    parent_tool_call_id: frame.parent_tool_call_id ?? frame.parentToolCallId ?? null,
    index: frame.index,
    agent: frame.agent ?? null,
    agentSource: frame.agentSource ?? frame.agent_source ?? null,
    job_id: frame.job_id ?? frame.jobId ?? null,
    instance_id: frame.instance_id ?? frame.instanceId ?? null,
  }));
  const complete = tuples.filter((tuple) => nonEmpty(tuple.allocated_id) && nonEmpty(tuple.parent_tool_call_id) && Number.isInteger(tuple.index) && nonEmpty(tuple.job_id) && nonEmpty(tuple.instance_id));
  const unique = new Map(complete.map((tuple) => [canonicalJson(tuple), tuple]));
  return complete.length > 0 && unique.size === 1 ? [...unique.values()][0] : null;
}

function sameLifecycleBinding(left, right) {
  return isObject(left) && isObject(right)
    && left.allocated_id === right.allocated_id
    && left.parent_tool_call_id === right.parent_tool_call_id
    && left.index === right.index
    && left.job_id === right.job_id
    && left.instance_id === right.instance_id;
}

function assignmentAliasState(record, assignment) {
  const expected = String(assignment).toLowerCase();
  const aliases = ["assignment_id", "assignmentId", "name", "assignment"];
  const observed = aliases
    .filter((key) => Object.hasOwn(record ?? {}, key) && record[key] !== undefined && record[key] !== null)
    .map((key) => record[key]);
  if (observed.length === 0) return "missing";
  const normalized = observed.map((value) => typeof value === "string" && value.trim() ? value.toLowerCase() : null);
  if (normalized.every((value) => value === expected)) return "match";
  if (normalized.includes(expected)) return "conflict";
  return "other";
}



function explicitIsError(record, native) {
  for (const key of ["isError", "is_error", "terminal_is_error"]) if (typeof record?.[key] === "boolean") return record[key];
  if (typeof record?.terminal?.isError === "boolean") return record.terminal.isError;
  const ids = new Set(terminalIdentity(record));
  const matches = allNativeEvents(native).filter((event) => terminalIdentity(event).some((identity) => ids.has(identity)) && (event.type === "tool_execution_end" || event.type === "agent_end" || event.terminal === true));
  for (const event of matches) for (const key of ["isError", "is_error"]) if (typeof event[key] === "boolean") return event[key];
  return null;
}

function explicitExitCode(record) {
  if (Object.hasOwn(record ?? {}, "exitCode")) return { present: true, value: record.exitCode, observed: record.exitCode !== null };
  if (Object.hasOwn(record ?? {}, "exit_code")) return { present: true, value: record.exit_code, observed: record.exit_code !== null };
  return { present: false, value: null, observed: false };
}

function structuredCandidates(record) {
  const candidates = [];
  for (const key of ["structured_data", "structuredData", "structured_output", "structuredOutput", "output", "result", "yield", "data"]) if (record?.[key] !== undefined) candidates.push(record[key]);
  return candidates;
}

function findRequirementsResult(record) {
  const values = [];
  for (const candidate of structuredCandidates(record)) {
    const stack = [candidate];
    let depth = 0;
    while (stack.length && depth < 1000) {
      const value = stack.pop();
      depth += 1;
      if (isObject(value) && value.protocol === "REQUIREMENTS_READING_V1" && value.role === "requirements-reader") values.push(value);
      if (Array.isArray(value)) stack.push(...value);
      else if (isObject(value)) stack.push(...Object.values(value));
    }
  }
  return values.length === 1 ? values[0] : null;
}

function normalizeSourcePath(value) {
  let result = normalized(value);
  result = result.replace(/^\.omp\/skills\//, "").replace(/^\.omp\/agents\//, "alignment\/agents/");
  result = result.replace(/^skills\//, "").replace(/^agents\//, "alignment\/agents/");
  for (const prefix of ["alignment/", "specs/specs005-omp-compatible-release/"]) {
    const index = result.indexOf(prefix);
    if (index > 0) result = result.slice(index);
  }
  return result;
}
function projectDocumentPath(normalizedPath) {
  if (normalizedPath.startsWith("alignment/agents/")) return `.omp/agents/${normalizedPath.slice("alignment/agents/".length)}`;
  if (CURRENT_SKILLS.some((skill) => normalizedPath.startsWith(`${skill}/`))) return `.omp/skills/${normalizedPath}`;
  return normalizedPath;
}
function installedDestinationPath(value) {
  const result = String(value ?? "").replaceAll("\\", "/");
  if (result.startsWith(".omp/")) return result;
  if (result.startsWith("skills/") || result.startsWith("agents/")) return `.omp/${result}`;
  return result;
}

function validateRequirementsTerminal(definition, projectRoot, native, step, checks, missing, failures, artifacts = null) {
  const semanticStep = step.startsWith("namespace-b-") ? step.slice("namespace-b-".length) : step;
  const expectedName = definition.assignment[semanticStep === "collision" ? "collision" : semanticStep === "resume" ? "resume" : "initial"];
  const candidates = terminalRecords(native).filter((record) => ["match", "conflict"].includes(assignmentAliasState(record, expectedName)));
  if (candidates.length === 0) {
    recordCheck(checks, missing, failures, `${step}.requirements-reader.terminal`, "PENDING", { reason: "no terminal record for the named requirements-reader assignment", assignment: expectedName });
    return null;
  }
  if (candidates.length !== 1) {
    recordCheck(checks, missing, failures, `${step}.requirements-reader.terminal`, "FAIL", { reason: "duplicate or ambiguous authoritative terminal records", count: candidates.length, assignment: expectedName });
    return null;
  }
  const record = candidates[0];
  if (assignmentAliasState(record, expectedName) === "conflict") {
    recordCheck(checks, missing, failures, `${step}.requirements-reader.terminal`, "FAIL", { reason: "canonical assignment aliases conflict; no alias may override the canonical assignment", assignment: expectedName });
    return null;
  }
  if (!isAuthoritativeTaskRecord(record)) {
    recordCheck(checks, missing, failures, `${step}.requirements-reader.terminal`, "FAIL", { reason: "terminal record is not an authoritative normalized inline, async, or wait task result" });
    return null;
  }
  const succeeded = taskRecordSucceeded(record);
  if (record.agent !== "requirements-reader") recordCheck(checks, missing, failures, `${step}.requirements-reader.agent`, "FAIL", { reason: "terminal assignment is not the requirements-reader profile", observed: record.agent ?? null });
  const status = String(record.status ?? "").toLowerCase();
  if (!status) recordCheck(checks, missing, failures, `${step}.requirements-reader.status`, "FAIL", { reason: "terminal status was not exposed" });
  else if (!TERMINAL_STATUSES.has(status)) recordCheck(checks, missing, failures, `${step}.requirements-reader.status`, "FAIL", { reason: "record is not terminal", observed: record.status ?? null });
  else if (!succeeded) recordCheck(checks, missing, failures, `${step}.requirements-reader.status`, "FAIL", { reason: "requirements-reader task did not complete successfully", observed: record.status ?? null });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.status`, "PASS", { observed: record.status });
  const asyncRecord = record.source_kind === "task_async_result";
  const waitRecord = record.source_kind === "task_wait_result";
  const transportRecord = asyncRecord || waitRecord;
  const aliasFailure = asyncRecord
    ? record.exitCode !== null || record.isError !== null || record.error !== null || record.aborted !== null
    : waitRecord
      ? (record.exit_code_observed === true && record.exitCode !== 0) || record.isError !== null || record.error !== null || record.aborted !== null
      : record.aborted === true || String(record.aborted ?? "").toLowerCase() === "true" || (record.error !== undefined && record.error !== null) || (record.exitCode !== undefined && record.exitCode !== null && record.exitCode !== 0) || (record.exit_code !== undefined && record.exit_code !== null && record.exit_code !== 0);
  if (aliasFailure || !succeeded) recordCheck(checks, missing, failures, `${step}.requirements-reader.aliases`, "FAIL", { reason: "terminal status aliases expose abort/error/nonzero exit or an unsuccessful authoritative record", observed: { source_kind: record.source_kind, status, aborted: record.aborted ?? null, error: record.error ?? null, exitCode: record.exitCode ?? record.exit_code ?? null } });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.aliases`, "PASS", { no_contradiction_observed: true, source_kind: record.source_kind, status, aborted: record.aborted ?? null, error: record.error ?? null, exitCode: record.exitCode ?? record.exit_code ?? null });
  if (transportRecord) {
    recordCheck(checks, missing, failures, `${step}.requirements-reader.isError`, "PASS", waitRecord
      ? { value: false, observed: true, source: "wait transport isError; distinct from child completion", child_value: null }
      : { value: null, observed: false, source: "async-result has no SingleResult isError" });
    recordCheck(checks, missing, failures, `${step}.requirements-reader.exitCode`, "PASS", { observed: record.exitCode ?? null, source: waitRecord ? "wait child snapshot exitCode is preserved separately from transport isError" : "async-result has no SingleResult exitCode" });
  } else {
    const errorFlag = explicitIsError(record, native);
    if (errorFlag === null) recordCheck(checks, missing, failures, `${step}.requirements-reader.isError`, "PENDING", { reason: "terminal isError was not exposed" });
    else if (errorFlag !== false) recordCheck(checks, missing, failures, `${step}.requirements-reader.isError`, "FAIL", { reason: "requirements-reader terminal reported an error", observed: errorFlag });
    else recordCheck(checks, missing, failures, `${step}.requirements-reader.isError`, "PASS", { value: false, source: record.is_error_source ?? "producer isError", producer_boolean_observed: record.is_error_observed === true });
    const exit = explicitExitCode(record);
    if (!exit.present || !exit.observed) recordCheck(checks, missing, failures, `${step}.requirements-reader.exitCode`, "PENDING", { reason: "SingleResult.exitCode was not observed" });
    else if (exit.value !== 0) recordCheck(checks, missing, failures, `${step}.requirements-reader.exitCode`, "FAIL", { reason: "requirements-reader SingleResult did not complete with exitCode 0", observed: exit.value });
    else recordCheck(checks, missing, failures, `${step}.requirements-reader.exitCode`, "PASS", { observed: 0, source: "SingleResult.exitCode; distinct from omitted successful Bash exitCode" });
  }
  const publicIdentity = terminalIdentity(record);
  if (publicIdentity.length === 0) recordCheck(checks, missing, failures, `${step}.requirements-reader.identity`, "PENDING", { reason: "public task/instance/job identity was not exposed" });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.identity`, "PASS", { identities: publicIdentity });
  const taskId = record.task_id ?? record.taskId;
  const taskIdExposed = record.task_id_exposed ?? record.taskIdExposed;
  if (taskId !== undefined && taskId !== null) recordCheck(checks, missing, failures, `${step}.requirements-reader.task_id`, "FAIL", { reason: "opaque task_id was exposed or synthesized; use public identity only", observed: taskId });
  else if (taskIdExposed !== undefined && taskIdExposed !== false) recordCheck(checks, missing, failures, `${step}.requirements-reader.task_id`, "FAIL", { reason: "terminal marked opaque task_id as exposed", observed: taskIdExposed });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.task_id`, "PASS", { observed: taskId ?? null, exposed: taskIdExposed ?? false });
  const source = record.agentSource ?? record.agent_source ?? record.source;
  if (source === undefined || source === null) recordCheck(checks, missing, failures, `${step}.requirements-reader.agentSource`, "PENDING", { reason: "profile source was not exposed" });
  else if (String(source).toLowerCase() !== "project") recordCheck(checks, missing, failures, `${step}.requirements-reader.agentSource`, "FAIL", { reason: "requirements-reader was not the current project-installed profile", observed: source });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.agentSource`, "PASS", { observed: source });
  const data = findRequirementsResult(record);
  if (!data) {
    recordCheck(checks, missing, failures, `${step}.requirements-reader.schema`, transportRecord ? "FAIL" : "PENDING", { reason: "REQUIREMENTS_READING_V1 structured terminal result was not exposed" });
    return { record, data: null };
  }
  const rootSession = native?.root_session?.session_id ?? native?.host_observation?.root_session_id ?? native?.terminal?.root_session;
  if (transportRecord) {
    const delivery = waitRecord ? record.wait_result : record.async_result;
    const hostBinding = delivery?.host_binding;
    const job = delivery?.job;
    if (!nonEmpty(rootSession)) recordCheck(checks, missing, failures, `${step}.requirements-reader.async-root`, "PENDING", { reason: "host-observed Root session was not exposed for the terminal" });
    else if (record.root_session_id !== rootSession || hostBinding?.root_session_id !== rootSession) recordCheck(checks, missing, failures, `${step}.requirements-reader.async-root`, "FAIL", { reason: "terminal Root binding differs from the actual observed Root session", expected: rootSession, observed: record.root_session_id ?? null });
    else recordCheck(checks, missing, failures, `${step}.requirements-reader.async-root`, "PASS", { observed: rootSession });
    const lifecycleBinding = observedLifecycleBinding(native, record);
    const rootEnd = native.terminal?.root_task_end ?? native.root_task_ends?.[0];
    const rootEndError = rootEnd?.isError ?? rootEnd?.is_error ?? null;
    const channelDomainOk = waitRecord
      ? record.instanceId === lifecycleBinding?.instance_id && hostBinding?.job_id === lifecycleBinding?.job_id
      : record.jobId === lifecycleBinding?.job_id && record.instanceId === lifecycleBinding?.instance_id;
    const bindingOk = lifecycleBinding
      && record.id === lifecycleBinding.id
      && record.allocated_id === lifecycleBinding.allocated_id
      && record.parent_tool_call_id === lifecycleBinding.parent_tool_call_id
      && record.index === lifecycleBinding.index
      && sameLifecycleBinding(hostBinding, lifecycleBinding)
      && hostBinding?.agent === lifecycleBinding.agent
      && hostBinding?.agentSource === lifecycleBinding.agentSource
      && hostBinding?.root_task_end_is_error === rootEndError
      && channelDomainOk
      && (waitRecord || job?.agentId === lifecycleBinding.allocated_id);
    if (!lifecycleBinding) recordCheck(checks, missing, failures, `${step}.requirements-reader.async-binding`, "PENDING", { reason: "actual dispatch/lifecycle allocation tuple was not exposed for the terminal" });
    else if (!bindingOk) recordCheck(checks, missing, failures, `${step}.requirements-reader.async-binding`, "FAIL", { reason: "terminal and host binding do not match the exact observed dispatch/lifecycle allocation tuple", expected: lifecycleBinding, observed: { id: record.id ?? null, allocated_id: record.allocated_id ?? null, parent_tool_call_id: record.parent_tool_call_id ?? null, index: record.index ?? null, host_binding: hostBinding ?? null, job_agent_id: job?.agentId ?? null } });
    else recordCheck(checks, missing, failures, `${step}.requirements-reader.async-binding`, "PASS", { observed: lifecycleBinding });
  }
  const sourceArtifact = artifacts ? readPrivateJson(projectRoot, descriptorFor(artifacts, "sourceFingerprints"), "current reader source bindings", `${ROUTE_ARTIFACT_ROOT}/alignment-sources.json`) : { kind: "missing", reason: "source fingerprint descriptor unavailable to reader binding" };
  const readerContext = sourceArtifact.kind === "ok" && isObject(sourceArtifact.value?.reader_context) ? sourceArtifact.value.reader_context : null;
  const readerSources = sourceArtifact.kind === "ok" && Array.isArray(sourceArtifact.value?.reader_sources) ? sourceArtifact.value.reader_sources : null;
  const expectedContextDigest = readerSources ? sha256Text(JSON.stringify({ run_id: sourceArtifact.value.run_id, revision: sourceArtifact.value.revision, nonce: sourceArtifact.value.nonce, sources: readerSources })) : null;
  if (!readerContext || !expectedContextDigest) recordCheck(checks, missing, failures, `${step}.requirements-reader.context`, "PENDING", { reason: "actual reader_context/source bindings were not exposed" });
  else if (readerContext.context_digest !== expectedContextDigest || data.context_digest !== readerContext.context_digest || data.run_id !== readerContext.run_id || definition.binding.revision !== readerContext.source_revision) recordCheck(checks, missing, failures, `${step}.requirements-reader.context`, "FAIL", { reason: "reader result is not bound to the actual host reader_context/source digest", expected: { ...readerContext, context_digest: expectedContextDigest }, observed: { run_id: data.run_id, source_revision: data.source_revision, context_digest: data.context_digest } });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.context`, "PASS", { context_digest: readerContext.context_digest });
  const expectedInstance = nonEmpty(rootSession) ? `${rootSession}:${expectedName}` : null;
  if (!expectedInstance) recordCheck(checks, missing, failures, `${step}.requirements-reader.instance`, "PENDING", { reason: "host-observed Root session was not exposed" });
  else if (data.instance_id !== expectedInstance) recordCheck(checks, missing, failures, `${step}.requirements-reader.instance`, "FAIL", { reason: "reader instance_id is not the caller-derived Root-session/task-name tag", expected: expectedInstance, observed: data.instance_id });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.instance`, "PASS", { observed: data.instance_id });
  const requiredFields = ["instance_id", "run_id", "source_revision", "context_digest", "sources", "status", "next_action", "paraphrase", "success_criteria", "scenarios_and_limits", "ambiguities"];
  const absent = requiredFields.filter((key) => data[key] === undefined || data[key] === null);
  if (absent.length) recordCheck(checks, missing, failures, `${step}.requirements-reader.schema`, "PENDING", { reason: "structured result omitted required profile fields", absent });
  else if (data.status !== "COMPLETE") recordCheck(checks, missing, failures, `${step}.requirements-reader.schema`, "FAIL", { reason: "route case requires a complete independent requirements reading", observed: data.status });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.schema`, "PASS", { protocol: data.protocol, role: data.role, status: data.status });
  if (data.run_id !== definition.binding.run_id) recordCheck(checks, missing, failures, `${step}.requirements-reader.run_id`, "FAIL", { reason: "requirements result is bound to a different logical run", expected: definition.binding.run_id, observed: data.run_id });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.run_id`, "PASS", { observed: data.run_id });
  if (data.source_revision !== definition.binding.revision) recordCheck(checks, missing, failures, `${step}.requirements-reader.source_revision`, "FAIL", { reason: "requirements result is bound to a different current revision", expected: definition.binding.revision, observed: data.source_revision });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.source_revision`, "PASS", { observed: data.source_revision });
  if (!Array.isArray(data.sources)) recordCheck(checks, missing, failures, `${step}.requirements-reader.sources`, "PENDING", { reason: "requirements result sources are absent" });
  else {
    const observed = new Set(data.sources.map((item) => normalizeSourcePath(item?.path)).filter(Boolean));
    const expected = REQUIRED_READER_READS.map(normalizeSourcePath);
    const absentSources = expected.filter((item) => !observed.has(item));
    if (absentSources.length) recordCheck(checks, missing, failures, `${step}.requirements-reader.sources`, "PENDING", { reason: "requirements result did not expose all explicit sources", absent: absentSources });
    else recordCheck(checks, missing, failures, `${step}.requirements-reader.sources`, "PASS", { count: data.sources.length });
    const expectedHashes = new Map([
      ...ALIGNMENT_SOURCES.map((item) => [normalizeSourcePath(item.path), item.sha256]),
      [normalizeSourcePath(".omp/skills/deep-review/references/fresh-review.md"), null],
      [normalizeSourcePath("specs/specs005-omp-compatible-release/spec.md"), null],
      [normalizeSourcePath("specs/specs005-omp-compatible-release/contracts/interface-contract.md"), null],
    ]);
    const hashProblems = [];
    for (const expectedPath of expected) {
      const source = data.sources.find((item) => normalizeSourcePath(item?.path) === expectedPath);
      if (!source || !SHA256.test(String(source.sha256 ?? ""))) {
        hashProblems.push({ path: expectedPath, reason: "requirements-reader did not expose a valid source SHA-256" });
        continue;
      }
      const known = expectedHashes.get(expectedPath);
      if (known && String(source.sha256).toLowerCase() !== known) {
        hashProblems.push({ path: expectedPath, reason: "requirements-reader source hash differs from current installed bytes", expected: known, observed: source.sha256 });
        continue;
      }
      if (!known) {
        const privatePath = projectDocumentPath(expectedPath);
        const actual = readPrivateBytes(projectRoot, { path: privatePath }, `requirements-reader source ${expectedPath}`, privatePath);
        if (actual.kind === "missing") hashProblems.push({ path: expectedPath, status: "PENDING", reason: actual.reason });
        else if (actual.kind === "failure") hashProblems.push({ path: expectedPath, status: "FAIL", reason: actual.reason });
        else if (actual.digest !== String(source.sha256).toLowerCase()) hashProblems.push({ path: expectedPath, status: "FAIL", reason: "requirements-reader source hash differs from actual private document bytes", expected: actual.digest, observed: source.sha256 });
      }
    }
    if (hashProblems.length) recordCheck(checks, missing, failures, `${step}.requirements-reader.source-hashes`, hashProblems.some((item) => item.status === "PENDING" || item.reason.includes("did not expose")) ? "PENDING" : "FAIL", { reason: "requirements-reader source hashes are not bound to current private bytes", problems: hashProblems });
    else recordCheck(checks, missing, failures, `${step}.requirements-reader.source-hashes`, "PASS", { count: expected.length });
  }
  const readerIds = new Set(publicIdentity);
  const asyncLifecycleBinding = transportRecord ? observedLifecycleBinding(native, record) : null;
  const readerReads = (Array.isArray(native.subagent_reads) ? native.subagent_reads : []).filter((item) => {
    const ids = terminalIdentity(item);
    return ids.some((id) => readerIds.has(id)) || (nonEmpty(item.identity) && nonEmpty(record.id) && String(item.identity).toLowerCase() === String(record.id).toLowerCase());
  });
  if (transportRecord) {
    const tupleProblems = !asyncLifecycleBinding
      ? [{ reason: "actual dispatch/lifecycle allocation tuple was not available for read binding" }]
      : readerReads.filter((item) => !sameLifecycleBinding(item, asyncLifecycleBinding)).map((item) => ({
        identity: item.identity ?? item.id ?? null,
        observed: { allocated_id: item.allocated_id ?? null, parent_tool_call_id: item.parent_tool_call_id ?? null, index: item.index ?? null },
      }));
    if (tupleProblems.length) recordCheck(checks, missing, failures, `${step}.requirements-reader.read-binding`, asyncLifecycleBinding ? "FAIL" : "PENDING", { reason: "reader reads are not bound to the exact observed dispatch/lifecycle allocation tuple", expected: asyncLifecycleBinding, problems: tupleProblems });
    else recordCheck(checks, missing, failures, `${step}.requirements-reader.read-binding`, "PASS", { observed: asyncLifecycleBinding });
  }
  const sourceRows = isObject(sourceArtifact?.value) && Array.isArray(sourceArtifact.value.reader_sources) ? sourceArtifact.value.reader_sources : [];
  const descriptorRelative = taskDescriptorPath(semanticStep);
  const descriptorNormalized = normalizeSourcePath(descriptorRelative);
  const expectedReaderPaths = [descriptorRelative, ...REQUIRED_READER_READS];
  const hashProblems = [];
  for (const expectedPath of REQUIRED_READER_READS.map(normalizeSourcePath)) {
    const row = sourceRows.find((item) => normalizeSourcePath(item?.path) === expectedPath);
    const actual = readPrivateBytes(projectRoot, { path: projectDocumentPath(expectedPath) }, `actual reader source ${expectedPath}`, projectDocumentPath(expectedPath));
    const observed = Array.isArray(data.sources) ? data.sources.find((item) => normalizeSourcePath(item?.path) === expectedPath) : null;
    if (!row || !observed || actual.kind !== "ok") {
      hashProblems.push({ path: expectedPath, reason: actual.kind === "missing" ? "actual reader source is missing" : "actual reader source binding is absent or unreadable" });
      continue;
    }
    if (row.bytes !== actual.bytes.byteLength || String(row.sha256).toLowerCase() !== actual.digest || (observed.bytes !== undefined && observed.bytes !== actual.bytes.byteLength) || String(observed.sha256).toLowerCase() !== actual.digest) {
      hashProblems.push({ path: expectedPath, reason: "reader source hash/byte binding differs from actual private bytes", expected: { bytes: actual.bytes.byteLength, sha256: actual.digest }, artifact: row, result: observed });
    }
  }
  if (hashProblems.length) recordCheck(checks, missing, failures, `${step}.requirements-reader.actual-source-hashes`, "FAIL", { reason: "reader_sources and result sources are not bound to actual private bytes", problems: hashProblems });
  else recordCheck(checks, missing, failures, `${step}.requirements-reader.actual-source-hashes`, "PASS", { count: REQUIRED_READER_READS.length });
  if (readerReads.length === 0) recordCheck(checks, missing, failures, `${step}.requirements-reader.reads`, "PENDING", { reason: "requirements-reader tool reads were not exposed for the actual terminal identity" });
  else {
    const paths = new Set(readerReads.flatMap(eventPaths).map((item) => normalized(path.relative(projectRoot, path.isAbsolute(item) ? item : path.resolve(projectRoot, item)))));
    const absentReads = expectedReaderPaths.filter((item) => !paths.has(normalized(item)));
    const endProblems = readerReads.filter((item) => {
      const receiptPaths = eventPaths(item);
      const frames = Array.isArray(native.subagent_frames) ? native.subagent_frames : [];
      const callId = eventCallId(item);
      const matches = (event) => nonEmpty(callId) && nonEmpty(item.allocated_id) && nonEmpty(item.parent_tool_call_id) && eventCallId(event) === callId
        && event.allocated_id === item.allocated_id
        && event.parent_tool_call_id === item.parent_tool_call_id
        && eventPaths(event).some((observed) => receiptPaths.some((expected) => pathMatches(projectRoot, observed, expected)));
      const starts = frames.filter((event) => matches(event) && eventType(event) === "tool_execution_start");
      const ends = frames.filter((event) => matches(event) && eventType(event) === "tool_execution_end");
      return starts.length !== 1 || ends.length !== 1 || eventError(ends[0]) !== false || !Number.isFinite(starts[0].sequence) || !Number.isFinite(ends[0].sequence) || ends[0].sequence <= starts[0].sequence;
    });
    const sourceFileProblems = [];
    const sourceFilePaths = new Set();
    for (const receipt of readerReads) {
      if (!Array.isArray(receipt.source_files) || receipt.source_files.length === 0) {
        sourceFileProblems.push({ identity: receipt.identity ?? receipt.allocated_id ?? null, reason: "successful read END omitted source_files" });
        continue;
      }
      for (const sourceFile of receipt.source_files) {
        const sourcePath = normalizeSourcePath(sourceFile?.path);
        sourceFilePaths.add(sourcePath);
        const isDescriptor = sourcePath === descriptorNormalized;
        const actualPath = isDescriptor ? descriptorRelative : projectDocumentPath(sourcePath);
        const actual = sourcePath ? readPrivateBytes(projectRoot, { path: actualPath }, `reader END source ${sourcePath}`, actualPath) : { kind: "failure", reason: "source_files row omitted path" };
        if (!expectedReaderPaths.map(normalizeSourcePath).includes(sourcePath)) sourceFileProblems.push({ path: sourcePath, reason: "read END source_files contains a foreign path" });
        else if (actual.kind !== "ok") sourceFileProblems.push({ path: sourcePath, status: actual.kind === "missing" ? "PENDING" : "FAIL", reason: actual.reason });
        else if (sourceFile.bytes !== actual.bytes.byteLength || String(sourceFile.sha256 ?? "").toLowerCase() !== actual.digest) sourceFileProblems.push({ path: sourcePath, reason: "read END source_files bytes/hash differ from actual private bytes", expected: { bytes: actual.bytes.byteLength, sha256: actual.digest }, observed: sourceFile });
      }
    }
    const absentSourceFiles = expectedReaderPaths.map(normalizeSourcePath).filter((item) => !sourceFilePaths.has(item));
    if (absentSourceFiles.length || sourceFileProblems.length) recordCheck(checks, missing, failures, `${step}.requirements-reader.read-source-files`, sourceFileProblems.some((item) => item.status === "PENDING") || absentSourceFiles.length ? "PENDING" : "FAIL", { reason: "successful read END source_files are not a complete actual-byte binding", absent: absentSourceFiles, problems: sourceFileProblems });
    else recordCheck(checks, missing, failures, `${step}.requirements-reader.read-source-files`, "PASS", { count: sourceFilePaths.size });
    if (absentReads.length || endProblems.length) recordCheck(checks, missing, failures, `${step}.requirements-reader.reads`, "PENDING", { reason: "requirements-reader did not expose successful correlated read END receipts", absent: absentReads, uncorrelated: endProblems.length });
    else recordCheck(checks, missing, failures, `${step}.requirements-reader.reads`, "PASS", { paths: [...paths].sort(), successful_end_receipts: readerReads.length });
  }
  return { record, data };
}

function observedTaskDispatch(native) {
  const starts = allNativeEvents(native).some((event) => eventType(event) === "tool_execution_start" && /^tasks?(?:$|[_.:])/i.test(toolName(event)));
  const dispatch = (Array.isArray(native?.task_calls) ? native.task_calls : []).some((call) => String(call?.kind ?? "").toLowerCase() === "dispatch");
  return starts || dispatch;
}
function validateRootTaskEnd(native, terminal, step, rootOnly, checks, missing, failures) {
  if (rootOnly) return;
  const events = Array.isArray(native?.tool_events) ? native.tool_events : [];
  const starts = events.filter((event) => String(event?.type ?? "").toLowerCase() === "tool_execution_start" && /^tasks?(?:$|[_.:])/i.test(toolName(event)));
  const dispatches = (Array.isArray(native?.task_calls) ? native.task_calls : []).filter((call) => String(call?.kind ?? "").toLowerCase() === "dispatch");
  if (starts.length === 0 && dispatches.length === 0) return;
  if (starts.length !== 1) {
    recordCheck(checks, missing, failures, `${step}.root.task_start`, starts.length === 0 ? "PENDING" : "FAIL", { reason: starts.length === 0 ? "a task dispatch was reported without a correlated root task start" : "multiple root task starts were observed", count: starts.length });
    return;
  }
  const ends = events.filter((event) => String(event?.type ?? "").toLowerCase() === "tool_execution_end" && /^tasks?(?:$|[_.:])/i.test(toolName(event)));
  const rootEnd = isObject(terminal?.root_task_end) ? terminal.root_task_end : null;
  if (!rootEnd || ends.length !== 1) {
    recordCheck(checks, missing, failures, `${step}.root.task_end`, "PENDING", { reason: !rootEnd ? "dispatched root task did not expose terminal.root_task_end" : "root task end count is not exactly one", end_count: ends.length });
    return;
  }
  const start = starts[0];
  const end = ends[0];
  const rootToolCallId = rootEnd.tool_call_id ?? rootEnd.toolCallId;
  const startToolCallId = eventCallId(start);
  const endToolCallId = eventCallId(end);
  const parentOf = (event) => event?.parent_tool_call_id ?? event?.parentToolCallId ?? null;
  const rootParentObserved = Object.hasOwn(rootEnd, "parent_tool_call_id") || Object.hasOwn(rootEnd, "parentToolCallId");
  const rootParent = parentOf(rootEnd);
  const startParent = parentOf(start);
  const endParent = parentOf(end);
  const callMatches = nonEmpty(startToolCallId)
    && startToolCallId === endToolCallId
    && endToolCallId === rootToolCallId;
  const parentMatches = rootParentObserved && startParent === endParent && endParent === rootParent;
  const correlated = callMatches
    && parentMatches
    && Number.isFinite(start.sequence)
    && Number.isFinite(end.sequence)
    && end.sequence > start.sequence
    && Number.isInteger(rootEnd.sequence)
    && rootEnd.sequence === end.sequence
    && rootEnd.is_error_source === "tool_execution_end";
  if (!correlated) {
    recordCheck(checks, missing, failures, `${step}.root.task_end`, "FAIL", { reason: "root task end is not correlated to the observed task_execution_end tuple", observed: { sequence: end.sequence, tool_call_id: end.tool_call_id ?? null, parent_tool_call_id: end.parent_tool_call_id ?? null }, terminal: { sequence: rootEnd.sequence ?? null, tool_call_id: rootEnd.tool_call_id ?? null, parent_tool_call_id: rootEnd.parent_tool_call_id ?? null, is_error_source: rootEnd.is_error_source ?? null } });
  } else if (rootEnd.isError !== false || end.is_error !== false) {
    recordCheck(checks, missing, failures, `${step}.root.task_end`, rootEnd.isError === undefined || end.is_error === undefined ? "PENDING" : "FAIL", { reason: "correlated root task end must explicitly report isError:false", terminal_isError: rootEnd.isError ?? null, event_is_error: end.is_error ?? null });
  } else {
    recordCheck(checks, missing, failures, `${step}.root.task_end`, "PASS", { sequence: end.sequence, isError: false, is_error_source: rootEnd.is_error_source });
  }
}
function helperPolicyBindingMatches(binding, policy) {
  return isObject(binding)
    && isObject(policy)
    && isObject(policy.intent)
    && isObject(policy.script)
    && isObject(policy.executable)
    && binding.kind === policy.kind
    && binding.intent_path === policy.intent.path
    && binding.helper_path === policy.script.path
    && binding.executable_path === policy.executable.path
    && binding.cwd === policy.cwd
    && binding.script_sha256 === policy.script.sha256
    && binding.executable_sha256 === policy.executable.sha256
    && binding.command_sha256 === sha256Text(policy.command)
    && binding.admitted === true;
}
function helperEventAuthorized(event, policy, projectRoot) {
  if (!helperPolicyBindingMatches(event?.host_policy_binding, policy)) return false;
  const name = toolName(event).toLowerCase();
  if (name === "write") {
    const paths = eventPaths(event);
    return paths.length > 0 && paths.every((observed) => pathMatches(projectRoot, observed, policy.intent.path));
  }
  if (name !== "bash") return false;
  const observedCommand = event?.command ?? event?.args?.command;
  return observedCommand === undefined || observedCommand === policy.command;
}
function helperEnvelopeResult(value) {
  if (isObject(value?.result)) return value.result;
  if (isObject(value)) return value;
  const content = value?.content ?? value?.details?.content;
  const texts = Array.isArray(content) ? content.filter((item) => typeof item?.text === "string").map((item) => item.text) : typeof content === "string" ? [content] : [];
  for (const text of texts) {
    try {
      const parsed = JSON.parse(text.trim());
      if (isObject(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function validateHelperEvidence(native, projectRoot, step, rootOnly, checks, missing, failures, expectedCheckpoint = null) {
  if (rootOnly) return;
  const writePolicy = isObject(native?.root_write_policy) ? native.root_write_policy : null;
  const policy = isObject(writePolicy?.rootCommandPolicy) ? writePolicy.rootCommandPolicy : null;
  if (!writePolicy || !policy) {
    recordCheck(checks, missing, failures, `${step}.helper.policy`, "PENDING", { reason: "host-constructor root_write_policy/rootCommandPolicy is absent" });
    return;
  }
  const required = ["source", "paths", "rootCommandPolicy"];
  const absent = required.filter((key) => writePolicy[key] === undefined || writePolicy[key] === null);
  if (absent.length || writePolicy.source !== "host-constructor-control" || !Array.isArray(writePolicy.paths) || writePolicy.paths.length !== 1) {
    recordCheck(checks, missing, failures, `${step}.helper.policy`, "FAIL", { reason: "root_write_policy is not the host-constructor control shape", absent });
    return;
  }
  const executable = policy.executable;
  const script = policy.script;
  const intent = policy.intent;
  const malformed = policy.kind !== "alignment-lab-checkpoint-helper-v1"
    || !nonEmpty(policy.command)
    || policy.command !== `"${String(executable?.path ?? "")}" "${String(script?.path ?? "")}"`
    || !path.isAbsolute(String(policy.cwd))
    || normalizedAbsolute(policy.cwd) !== normalizedAbsolute(projectRoot)
    || !isObject(executable) || !path.isAbsolute(String(executable.path ?? "")) || !SHA256.test(String(executable.sha256 ?? ""))
    || !isObject(script) || !path.isAbsolute(String(script.path ?? "")) || !SHA256.test(String(script.sha256 ?? ""))
    || !isObject(intent) || !path.isAbsolute(String(intent.path ?? "")) || !Number.isSafeInteger(intent.max_bytes) || intent.max_bytes !== 16384
    || !path.isAbsolute(String(writePolicy.paths[0] ?? ""))
    || normalizedAbsolute(writePolicy.paths[0]) !== normalizedAbsolute(intent.path);
  if (malformed) {
    recordCheck(checks, missing, failures, `${step}.helper.policy`, "FAIL", { reason: "rootCommandPolicy is not the approved single helper policy shape" });
    return;
  }
  const fileProblems = [];
  for (const [label, descriptor] of [["executable", executable], ["script", script]]) {
    try {
      regularFile(descriptor.path, `${step} helper ${label}`);
      const actual = sha256(fs.readFileSync(descriptor.path));
      if (actual !== String(descriptor.sha256).toLowerCase()) fileProblems.push({ label, reason: "hash mismatch", expected: descriptor.sha256, observed: actual });
    } catch (error) {
      fileProblems.push({ label, reason: error?.message ?? "helper file is not a protected regular file" });
    }
  }
  try {
    regularFile(intent.path, `${step} helper intent`);
    if (fs.statSync(intent.path).size > intent.max_bytes) fileProblems.push({ label: "intent", reason: "intent exceeds max_bytes" });
  } catch (error) {
    fileProblems.push({ label: "intent", reason: error?.message ?? "intent is not a protected regular file" });
  }
  if (fileProblems.length) {
    recordCheck(checks, missing, failures, `${step}.helper.policy-files`, fileProblems.some((item) => item.reason.includes("not readable")) ? "PENDING" : "FAIL", { reason: "helper executable/script/intent failed protected identity checks", problems: fileProblems });
  } else {
    recordCheck(checks, missing, failures, `${step}.helper.policy-files`, "PASS", { executable_sha256: executable.sha256, script_sha256: script.sha256, intent_path: intent.path });
  }
  const events = Array.isArray(native.tool_events) ? native.tool_events : [];
  const rootSession = native.root_session?.session_id ?? native.host_observation?.root_session_id;
  const rootTaskEnd = isObject(native.terminal?.root_task_end)
    ? native.terminal.root_task_end
    : Array.isArray(native.root_task_ends) && isObject(native.root_task_ends[0]) ? native.root_task_ends[0] : null;
  const rootSequence = rootTaskEnd?.sequence;
  const rootWorkflowOrdinal = rootTaskEnd?.host_workflow_ordinal;
  const helperCausality = (start, end) => {
    const startRoot = start?.host_observation?.root_session_id;
    const endRoot = end?.host_observation?.root_session_id;
    return nonEmpty(rootSession)
      && startRoot === rootSession
      && endRoot === rootSession
      && Number.isFinite(start?.sequence)
      && Number.isFinite(end?.sequence)
      && end.sequence > start.sequence
      && Number.isFinite(rootSequence)
      && start.sequence > rootSequence
      && Number.isFinite(start?.host_workflow_ordinal)
      && Number.isFinite(end?.host_workflow_ordinal)
      && end.host_workflow_ordinal > start.host_workflow_ordinal
      && Number.isFinite(rootWorkflowOrdinal)
      && start.host_workflow_ordinal > rootWorkflowOrdinal;
  };
  const admittedWrites = events.filter((event) => toolName(event).toLowerCase() === "write" && helperPolicyBindingMatches(event?.host_policy_binding, policy) && eventPaths(event).length > 0 && eventPaths(event).every((observed) => pathMatches(projectRoot, observed, intent.path)));
  const intentStarts = admittedWrites.filter((event) => String(event?.type ?? "").toLowerCase() === "tool_execution_start");
  const intentEnds = admittedWrites.filter((event) => String(event?.type ?? "").toLowerCase() === "tool_execution_end");
  const intentCorrelation = intentStarts.length === 1 && intentEnds.length === 1 && nonEmpty(intentStarts[0].tool_call_id) && intentStarts[0].tool_call_id === intentEnds[0].tool_call_id && intentEnds[0].is_error === false && helperCausality(intentStarts[0], intentEnds[0]);
  if (!intentCorrelation) recordCheck(checks, missing, failures, `${step}.helper.intent-write`, intentStarts.length === 0 || intentEnds.length === 0 ? "PENDING" : "FAIL", { reason: intentStarts.length === 0 || intentEnds.length === 0 ? "approved helper intent write START/END was not observed" : "approved helper intent write was duplicated, uncorrelated, errored, or not causally bound to the observed Root session/workflow", starts: intentStarts.length, ends: intentEnds.length, intent_path: intent.path });
  else recordCheck(checks, missing, failures, `${step}.helper.intent-write`, "PASS", { intent_path: intent.path, tool_call_id: intentStarts[0].tool_call_id });
  const admittedCommands = events.filter((event) => toolName(event).toLowerCase() === "bash" && helperPolicyBindingMatches(event?.host_policy_binding, policy));
  const commandStarts = admittedCommands.filter((event) => String(event?.type ?? "").toLowerCase() === "tool_execution_start");
  const commandEnds = admittedCommands.filter((event) => String(event?.type ?? "").toLowerCase() === "tool_execution_end");
  const commandCorrelation = commandStarts.length === 1 && commandEnds.length === 1 && nonEmpty(commandStarts[0].tool_call_id) && commandStarts[0].tool_call_id === commandEnds[0].tool_call_id && commandEnds[0].is_error === false && helperCausality(commandStarts[0], commandEnds[0]);
  if (!commandCorrelation) recordCheck(checks, missing, failures, `${step}.helper.command-event`, commandStarts.length === 0 || commandEnds.length === 0 ? "PENDING" : "FAIL", { reason: commandStarts.length === 0 || commandEnds.length === 0 ? "approved helper Bash START/END was not observed" : "approved helper Bash START/END was duplicated, uncorrelated, errored, or not causally bound to the observed Root session/workflow", starts: commandStarts.length, ends: commandEnds.length });
  else recordCheck(checks, missing, failures, `${step}.helper.command-event`, "PASS", { tool_call_id: commandStarts[0].tool_call_id });
  const results = Array.isArray(native.root_command_results) ? native.root_command_results : [];
  const starts = results.filter((item) => item?.phase === "start");
  const updates = results.filter((item) => item?.phase === "update");
  const ends = results.filter((item) => item?.phase === "end");
  if (starts.length !== 1 || ends.length !== 1) {
    recordCheck(checks, missing, failures, `${step}.helper.command-results`, starts.length === 0 || ends.length === 0 ? "PENDING" : "FAIL", { reason: starts.length === 0 || ends.length === 0 ? "helper START/END capture is incomplete" : "helper START/END capture is duplicated", starts: starts.length, updates: updates.length, ends: ends.length });
    return;
  }
  const start = starts[0];
  const end = ends[0];
  const allResults = [start, ...updates, end];
  const correlationId = start.tool_call_id;
  const correlated = nonEmpty(correlationId) && commandCorrelation && correlationId === commandStarts[0].tool_call_id && allResults.every((item) => item.tool === "bash" && item.tool_call_id === correlationId && item.command === policy.command);
  if (!correlated) {
    recordCheck(checks, missing, failures, `${step}.helper.command-results`, commandStarts.length === 0 || commandEnds.length === 0 ? "PENDING" : "FAIL", { reason: commandStarts.length === 0 || commandEnds.length === 0 ? "helper command event correlation is absent" : "helper START/UPDATE/END is not exact-command correlated to the approved policy", expected_command: policy.command });
    return;
  }
  const endShape = end.is_error === false && end.is_error_source === "tool_execution_end" && end.is_error_observed === true && Object.hasOwn(end, "exit_code") && end.exit_code === null && (end.status === "CLOSED" || end.status === "BLOCKED") && end.result !== undefined && JSON.stringify(end.result).length <= 16384;
  const nonEndErrorFields = allResults.slice(0, -1).some((item) => Object.hasOwn(item, "is_error") || Object.hasOwn(item, "is_error_source") || Object.hasOwn(item, "is_error_observed"));
  if (nonEndErrorFields || !endShape) recordCheck(checks, missing, failures, `${step}.helper.command-results`, end.is_error === undefined || end.result === undefined ? "PENDING" : "FAIL", { reason: "helper END lacks explicit bounded publication result/error/exit observation", end: { status: end.status ?? null, is_error: end.is_error ?? null, is_error_source: end.is_error_source ?? null, is_error_observed: end.is_error_observed ?? null, exit_code: end.exit_code ?? null } });
  else recordCheck(checks, missing, failures, `${step}.helper.command-results`, "PASS", { status: end.status, exit_code: null, result_bounded: true, correlation_id: correlationId });
  if (!expectedCheckpoint || expectedCheckpoint.kind !== "ok") recordCheck(checks, missing, failures, `${step}.helper.envelope`, "PENDING", { reason: "actual protected checkpoint was not available for helper envelope comparison" });
  else {
    const envelope = helperEnvelopeResult(end.result);
    const expectedStatus = expectedCheckpoint.value?.status;
    const envelopePath = envelope?.path;
    const envelopeHash = envelope?.sha256;
    const matches = isObject(envelope)
      && envelope.code === "ALIGNMENT_CHECKPOINT_PUBLISHED"
      && envelope.status === expectedStatus
      && envelope.transaction === true
      && pathMatches(projectRoot, envelopePath, expectedCheckpoint.path)
      && String(envelopeHash ?? "").toLowerCase() === expectedCheckpoint.digest
      && isObject(envelope.record)
      && canonicalJson(envelope.record) === canonicalJson(expectedCheckpoint.value);
    if (!matches) recordCheck(checks, missing, failures, `${step}.helper.envelope`, "FAIL", { reason: "helper publication envelope is not equal to the actual protected checkpoint bytes/record", expected: { code: "ALIGNMENT_CHECKPOINT_PUBLISHED", status: expectedStatus, path: expectedCheckpoint.path, sha256: expectedCheckpoint.digest, transaction: true }, observed: envelope });
    else recordCheck(checks, missing, failures, `${step}.helper.envelope`, "PASS", { code: envelope.code, status: envelope.status, path: expectedCheckpoint.path, sha256: expectedCheckpoint.digest, transaction: true });
  }
}
function validateNativeStep(definition, projectRoot, native, step, checks, missing, failures, rootOnly = false, namespace = "A", expectedCheckpoint = null, artifacts = null) {
  if (!isObject(native)) {
    recordCheck(checks, missing, failures, `${step}.native`, "PENDING", { reason: "native capture for this route step is absent" });
    return;
  }
  if (native.evidence_level === undefined && native.evidenceLevel === undefined) recordCheck(checks, missing, failures, `${step}.native.evidence_level`, "PENDING", { reason: "native evidence level is absent" });
  else if (![AUTHENTIC_EVIDENCE_LEVEL, SOURCE_DERIVED_EVIDENCE_LEVEL].includes(String(native.evidence_level ?? native.evidenceLevel))) recordCheck(checks, missing, failures, `${step}.native.evidence_level`, "FAIL", { reason: "capture evidence must use an accepted producer/host-adapter level", expected: [AUTHENTIC_EVIDENCE_LEVEL, SOURCE_DERIVED_EVIDENCE_LEVEL], observed: native.evidence_level ?? native.evidenceLevel });
  else recordCheck(checks, missing, failures, `${step}.native.evidence_level`, "PASS", { observed: native.evidence_level ?? native.evidenceLevel });
  if (native.capture?.complete === undefined) recordCheck(checks, missing, failures, `${step}.native.capture`, "PENDING", { reason: "native capture completeness is absent" });
  else if (native.capture.complete !== true) recordCheck(checks, missing, failures, `${step}.native.capture`, "FAIL", { reason: "native capture was incomplete" });
  else recordCheck(checks, missing, failures, `${step}.native.capture`, "PASS", { observed: true });
  const nativeEvidence = String(native.evidence_level ?? native.evidenceLevel ?? "");
  const origin = native.origin;
  const rootSession = native.root_session?.session_id ?? native.host_observation?.root_session_id;
  const routeBinding = native.route_binding ?? native.host_observation?.route_binding;
  if (nativeEvidence === AUTHENTIC_EVIDENCE_LEVEL) {
    const processCount = native.native_process_count ?? origin?.process_count;
    if (native.source_derived === true || processCount !== 1 || !trustedNativeOriginRecord(origin)) recordCheck(checks, missing, failures, `${step}.native.host-origin`, "FAIL", { reason: "authentic route step lacks exact host-observed single native process provenance", observed: { origin, process_count: processCount, source_derived: native.source_derived ?? false } });
    else recordCheck(checks, missing, failures, `${step}.native.host-origin`, "PASS", { process_count: 1, source: origin.source });
  } else if (nativeEvidence === SOURCE_DERIVED_EVIDENCE_LEVEL) {
    const sourceOnly = native.native === false && native.native_process_count === 0 && origin?.native_rpc === false;
    recordCheck(checks, missing, failures, `${step}.native.host-origin`, sourceOnly ? "PASS" : "FAIL", { source_only: sourceOnly, native: false, reason: sourceOnly ? undefined : "source-derived evidence claimed native process/origin" });
  }
    const expectedRequest = expectedCheckpoint?.kind === "ok" ? expectedCheckpoint.value?.request_id : null;
    const expectedRun = expectedCheckpoint?.kind === "ok" ? expectedCheckpoint.value?.run_id : null;
    const bindingOk = isObject(routeBinding)
      && routeBinding.source === "host-capture"
      && routeBinding.revision === definition.binding.revision
      && routeBinding.step === (step.startsWith("namespace-b-") ? step.slice("namespace-b-".length) : step)
      && routeBinding.namespace === namespace
      && routeBinding.root_session === rootSession
      && UUID_V4.test(String(routeBinding.request_id ?? ""))
      && UUID_V4.test(String(routeBinding.run_id ?? ""))
      && (!expectedRequest || routeBinding.request_id === expectedRequest)
      && (!expectedRun || routeBinding.run_id === expectedRun);
    if (!bindingOk) recordCheck(checks, missing, failures, `${step}.native.route-binding`, "FAIL", { reason: "native route binding does not match actual checkpoint request/run/revision/step/namespace/root session", expected: { request_id: expectedRequest, run_id: expectedRun, revision: definition.binding.revision, step: step.startsWith("namespace-b-") ? step.slice("namespace-b-".length) : step, namespace, root_session: rootSession }, observed: routeBinding ?? null });
    else recordCheck(checks, missing, failures, `${step}.native.route-binding`, "PASS", { request_id: routeBinding.request_id, run_id: routeBinding.run_id, revision: routeBinding.revision, step: routeBinding.step, namespace });
  validateTaskDescriptor(definition, projectRoot, step, checks, missing, failures, artifacts);
  const terminal = native.terminal;
  if (!isObject(terminal)) recordCheck(checks, missing, failures, `${step}.root.terminal`, "PENDING", { reason: "root terminal is absent" });
  else {
    const promptResult = isObject(terminal.prompt_result) ? terminal.prompt_result : isObject(terminal.promptResult) ? terminal.promptResult : null;
    const promptStatus = promptResult?.status;
    const invoked = promptResult?.agentInvoked;
    const settled = terminal.session_settled ?? terminal.sessionSettled;
    const rootEnded = terminal.agent_end?.isTerminal === true && terminal.agent_end?.awaitingAsyncWork !== true;
    if (promptStatus !== "completed") recordCheck(checks, missing, failures, `${step}.root.terminal.status`, promptStatus === undefined ? "PENDING" : "FAIL", { reason: "root prompt did not expose completed terminal", observed: promptStatus ?? null });
    else recordCheck(checks, missing, failures, `${step}.root.terminal.status`, "PASS", { observed: promptStatus });
    if (invoked !== true) recordCheck(checks, missing, failures, `${step}.root.terminal.agentInvoked`, invoked === undefined ? "PENDING" : "FAIL", { reason: "root terminal did not expose an invoked task", observed: invoked ?? null });
    else recordCheck(checks, missing, failures, `${step}.root.terminal.agentInvoked`, "PASS", { observed: true });
    if (settled !== true) recordCheck(checks, missing, failures, `${step}.root.terminal.sessionSettled`, settled === undefined ? "PENDING" : "FAIL", { reason: "root session did not settle", observed: settled ?? null });
    else recordCheck(checks, missing, failures, `${step}.root.terminal.sessionSettled`, "PASS", { observed: true });
    if (promptResult?.error_observed === true && promptResult.error !== null) recordCheck(checks, missing, failures, `${step}.root.terminal.agent_end`, "FAIL", { reason: "root prompt exposed an error", error: promptResult.error });
    else if (!rootEnded) recordCheck(checks, missing, failures, `${step}.root.terminal.agent_end`, terminal.agent_end === undefined ? "PENDING" : "FAIL", { reason: "terminal Root agent_end was not observed", observed: terminal.agent_end ?? null });
    else recordCheck(checks, missing, failures, `${step}.root.terminal.agent_end`, "PASS", { isTerminal: true, source: "actual Root agent_end; session_settled is quiescence only" });
  }
  validateRootTaskEnd(native, terminal, step, rootOnly, checks, missing, failures);
  validateHelperEvidence(native, projectRoot, step, rootOnly, checks, missing, failures, expectedCheckpoint);
  if (rootOnly) {
    recordCheck(checks, missing, failures, `${step}.dispatch`, "PASS", { observed: "root-public-verdict-before-child-dispatch" });
    recordCheck(checks, missing, failures, `${step}.dispatch.wire`, "PASS", { observed: "no-child-dispatch-required" });
  } else {
  const dispatches = (Array.isArray(native.task_calls) ? native.task_calls : []).filter((call) => String(call?.kind ?? "").toLowerCase() === "dispatch");
  if (dispatches.length === 0) recordCheck(checks, missing, failures, `${step}.dispatch`, "PENDING", { reason: "requirements-reader dispatch event is absent" });
  else {
    const semanticStep = step.startsWith("namespace-b-") ? step.slice("namespace-b-".length) : step;
    const expectedName = definition.assignment[semanticStep === "collision" ? "collision" : semanticStep === "resume" ? "resume" : "initial"];
    const assignments = dispatches.flatMap((call) => Array.isArray(call.assignments) ? call.assignments : []);
    const matches = assignments.filter((item) => item?.agent === "requirements-reader" && item?.name === expectedName);
    const solutionSpaceValid = dispatches.every((call) => call.has_solution_space === true);
    if (!solutionSpaceValid) recordCheck(checks, missing, failures, `${step}.dispatch.solution-space`, "FAIL", { reason: "actual public task START did not expose has_solution_space:true on every dispatch", observed: dispatches.map((call) => call.has_solution_space) });
    else recordCheck(checks, missing, failures, `${step}.dispatch.solution-space`, "PASS", { observed: true });
    const expectedTask = definition.steps[semanticStep]?.task?.task;
    const expectedTaskSha = nonEmpty(expectedTask) ? sha256Text(expectedTask) : null;
    const rawTaskHashes = [matches[0]?.raw_task_sha256, matches[0]?.rawTaskSha256, matches[0]?.task_sha256, matches[0]?.taskSha256].filter((value) => value !== undefined && value !== null);
    const actualTaskSha = rawTaskHashes[0];
    const rawTaskHashContradiction = new Set(rawTaskHashes).size > 1;
    const observedAssignment = matches[0]?.assignment ?? matches[0]?.public_assignment ?? matches[0]?.publicAssignment;
    const assignmentHashes = [matches[0]?.assignment_sha256, matches[0]?.assignmentSha256].filter((value) => value !== undefined && value !== null);
    const observedAssignmentSha = assignmentHashes[0];
    const assignmentHashContradiction = new Set(assignmentHashes).size > 1;
    const expectedAssignmentSha = expectedTask ? sha256Text(normalizePublicAssignment(expectedTask)) : null;
    const assignmentMatches = observedAssignmentSha === expectedAssignmentSha
      && (observedAssignment === undefined || observedAssignment === null
        || (typeof observedAssignment === "string" && normalizePublicAssignment(observedAssignment) === normalizePublicAssignment(expectedTask)));
    if (dispatches.length !== 1 || assignments.length !== 1) recordCheck(checks, missing, failures, `${step}.dispatch`, "FAIL", { reason: "route step must expose exactly one dispatch containing exactly one assignment", dispatches: dispatches.length, assignments: assignments.length });
    else if (matches.length === 0) recordCheck(checks, missing, failures, `${step}.dispatch`, "PENDING", { reason: "named requirements-reader dispatch is absent", expected: expectedName });
    else if (matches.length !== 1) recordCheck(checks, missing, failures, `${step}.dispatch`, "FAIL", { reason: "named requirements-reader dispatch is duplicated", count: matches.length });
    else if (!SHA256.test(String(actualTaskSha ?? ""))) recordCheck(checks, missing, failures, `${step}.dispatch`, "PENDING", { reason: "raw submitted START task identity hash was not exposed", expected: expectedName });
    else if (!SHA256.test(String(observedAssignmentSha ?? ""))) recordCheck(checks, missing, failures, `${step}.dispatch`, "PENDING", { reason: "actual SDK public assignment hash was not exposed; submitted START hash is not a substitute", expected: expectedName });
    else if (!expectedTaskSha || rawTaskHashContradiction || assignmentHashContradiction || actualTaskSha !== expectedTaskSha || !assignmentMatches) recordCheck(checks, missing, failures, `${step}.dispatch`, "FAIL", { reason: "raw START task or normalized public assignment does not match canonical definition task", expected: { task_sha256: expectedTaskSha, assignment_sha256: expectedAssignmentSha }, observed: { task_sha256: actualTaskSha, assignment_sha256: observedAssignmentSha ?? null, assignment_present: observedAssignment !== undefined && observedAssignment !== null, raw_hash_contradiction: rawTaskHashContradiction, assignment_hash_contradiction: assignmentHashContradiction } });
    else recordCheck(checks, missing, failures, `${step}.dispatch`, "PASS", { expected: expectedName, task_sha256: actualTaskSha, assignment_sha256: observedAssignmentSha });
  }
  const forbiddenTaskKey = hasForbiddenTaskKey(native.task_calls);
  if (forbiddenTaskKey) recordCheck(checks, missing, failures, `${step}.dispatch.wire`, "FAIL", { reason: "task wire included a forbidden per-call override", key: forbiddenTaskKey });
  else recordCheck(checks, missing, failures, `${step}.dispatch.wire`, "PASS", { forbidden_keys: [] });
  }
  const semanticStep = step.startsWith("namespace-b-") ? step.slice("namespace-b-".length) : step;
  const expectedReads = [...REQUIRED_ROOT_READS, taskDescriptorPath(semanticStep)];
  const reads = readEventSequence(native.tool_events, projectRoot, expectedReads);
  const firstTaskSequence = (Array.isArray(native.tool_events) ? native.tool_events : []).filter((event) => String(event?.type ?? "").toLowerCase() === "tool_execution_start" && /^tasks?(?:$|[_.:])/i.test(toolName(event))).map((event) => event.sequence).filter(Number.isFinite).sort((a, b) => a - b)[0] ?? null;
  const missingReads = reads.filter((item) => !item.observed || item.sequence === null || item.end_sequence === null || (!rootOnly && (firstTaskSequence === null || item.end_sequence >= firstTaskSequence)));
  if (missingReads.length) recordCheck(checks, missing, failures, `${step}.root.reads`, "PENDING", { reason: rootOnly ? "root did not expose required source and descriptor reads" : "root did not expose required source and descriptor reads with an ordered pre-dispatch sequence", missing: missingReads.map((item) => item.path), first_task_sequence: firstTaskSequence });
  else recordCheck(checks, missing, failures, `${step}.root.reads`, "PASS", { paths: reads });
  const helperPolicy = isObject(native.root_write_policy?.rootCommandPolicy) ? native.root_write_policy.rootCommandPolicy : null;
  const forbiddenTools = allNativeEvents(native).filter((event) => {
    const name = toolName(event);
    if (!name || !FORBIDDEN_TOOL_PARTS.some((part) => name.toLowerCase().includes(part))) return false;
    return !helperPolicy || !helperEventAuthorized(event, helperPolicy, projectRoot);
  }).map(toolName).filter(Boolean);
  if (forbiddenTools.length) recordCheck(checks, missing, failures, `${step}.effects.tools`, "FAIL", { reason: "forbidden publication/host/network/write tool event observed", tools: [...new Set(forbiddenTools)] });
  else recordCheck(checks, missing, failures, `${step}.effects.tools`, "PASS", { tools: [] });
  if (!Array.isArray(native.subagent_writes)) recordCheck(checks, missing, failures, `${step}.effects.subagent_writes`, "PENDING", { reason: "subagent write capture is absent" });
  else if (native.subagent_writes.length) recordCheck(checks, missing, failures, `${step}.effects.subagent_writes`, "FAIL", { reason: "requirements-reader or another delegated role wrote files", count: native.subagent_writes.length });
  else recordCheck(checks, missing, failures, `${step}.effects.subagent_writes`, "PASS", { count: 0 });
  return rootOnly ? { record: null, data: null, root_authority: true } : validateRequirementsTerminal(definition, projectRoot, native, step, checks, missing, failures, artifacts);
}

function validatePackage(definition, projectRoot, artifacts, checks, missing, failures) {
  const manifestFile = readPrivateJson(projectRoot, descriptorFor(artifacts, "packageManifest"), "current package manifest", `${ROUTE_ARTIFACT_ROOT}/package-manifest.json`);
  if (manifestFile.kind === "missing") { recordCheck(checks, missing, failures, "package.manifest", "PENDING", manifestFile); return null; }
  if (manifestFile.kind === "failure") { recordCheck(checks, missing, failures, "package.manifest", "FAIL", manifestFile); return null; }
  const bindingFile = readPrivateJson(projectRoot, descriptorFor(artifacts, "packageBinding"), "current package binding", `${ROUTE_ARTIFACT_ROOT}/package-binding.json`);
  if (bindingFile.kind === "missing") recordCheck(checks, missing, failures, "package.binding", "PENDING", bindingFile);
  else if (bindingFile.kind === "failure") recordCheck(checks, missing, failures, "package.binding", "FAIL", bindingFile);
  const binding = bindingFile.kind === "ok" ? bindingFile.value : null;
  const entries = Array.isArray(manifestFile.value) ? manifestFile.value : manifestFile.value?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    recordCheck(checks, missing, failures, "package.manifest.shape", "FAIL", { reason: "current package manifest must contain an entries array" });
    return null;
  }
  const entryRows = entries.map((entry) => ({
    kind: entry?.kind,
    source: entry?.source ?? entry?.sourceRelativePath,
    destination: entry?.destination ?? entry?.destinationRelative,
    bytes: entry?.bytes,
    sha256: entry?.sha256 ?? entry?.sourceSha256,
  }));
  const invalid = entryRows.filter((entry) => !nonEmpty(entry.kind) || !nonEmpty(entry.source) || !nonEmpty(entry.destination) || !Number.isSafeInteger(entry.bytes) || !SHA256.test(String(entry.sha256 ?? "")));
  if (invalid.length) recordCheck(checks, missing, failures, "package.manifest.entries", "FAIL", { reason: "manifest contains invalid source/destination/hash entries", invalid: invalid.length });
  const skills = new Set(entryRows.filter((entry) => entry.kind === "skill").map((entry) => normalizeSourcePath(entry.source).split("/")[0]));
  const agents = entryRows.filter((entry) => entry.kind === "agent");
  const profiles = new Set(agents.map((entry) => path.posix.basename(normalizeSourcePath(entry.source)).replace(/\.md$/i, "")));
  const packageSourceMismatches = [];
  for (const source of ALIGNMENT_SOURCES) {
    const expectedKind = source.path.startsWith("alignment/agents/") ? "agent" : "skill";
    const expectedSource = normalizeSourcePath(source.path);
    const expectedDestination = normalized(source.overlay).replace(/^\.omp\//, "");
    const rows = entryRows.filter((entry) => normalizeSourcePath(entry.source) === expectedSource);
    if (!rows.length) packageSourceMismatches.push({ path: source.path, reason: "missing-current-source-entry" });
    else if (!rows.some((entry) => entry.kind === expectedKind && entry.bytes === source.bytes && String(entry.sha256).toLowerCase() === source.sha256 && normalized(entry.destination).replace(/^\.omp\//, "") === expectedDestination)) packageSourceMismatches.push({ path: source.path, reason: "current-source-entry-does-not-match", expected: { kind: expectedKind, bytes: source.bytes, sha256: source.sha256, destination: expectedDestination }, observed: rows });
  }
  if (packageSourceMismatches.length) recordCheck(checks, missing, failures, "package.manifest.alignment-sources", "FAIL", { reason: "current package manifest does not bind all six alignment sources to their installed bytes/destinations", mismatches: packageSourceMismatches });
  else recordCheck(checks, missing, failures, "package.manifest.alignment-sources", "PASS", { sources: ALIGNMENT_SOURCES.map((item) => item.path) });
  const exactSkills = skills.size === CURRENT_SKILLS.length && CURRENT_SKILLS.every((name) => skills.has(name));
  const exactProfiles = profiles.size === CURRENT_PROFILES.length && CURRENT_PROFILES.every((name) => profiles.has(name));
  if (!exactSkills || !exactProfiles || agents.length !== CURRENT_PROFILES.length) recordCheck(checks, missing, failures, "package.manifest.catalog", "FAIL", { reason: "manifest is not the exact current ten-skill/twelve-profile package", skills: [...skills].sort(), profiles: [...profiles].sort(), agent_rows: agents.length });
  else recordCheck(checks, missing, failures, "package.manifest.catalog", "PASS", { skills: [...skills].sort(), profiles: [...profiles].sort(), entries: entries.length });
  const installedProblems = [];
  for (const entry of entryRows) {
    const privatePath = installedDestinationPath(entry.destination);
    const actual = readPrivateBytes(projectRoot, { path: privatePath }, `installed package entry ${entry.destination}`, privatePath);
    if (actual.kind === "missing") installedProblems.push({ path: privatePath, status: "PENDING", reason: actual.reason });
    else if (actual.kind === "failure") installedProblems.push({ path: privatePath, status: "FAIL", reason: actual.reason });
    else if (actual.bytes.byteLength !== entry.bytes || actual.digest !== String(entry.sha256).toLowerCase()) installedProblems.push({ path: privatePath, status: "FAIL", expected: { bytes: entry.bytes, sha256: entry.sha256 }, observed: { bytes: actual.bytes.byteLength, sha256: actual.digest } });
  }
  if (installedProblems.length) recordCheck(checks, missing, failures, "package.installed-bytes", installedProblems.some((item) => item.status === "PENDING") ? "PENDING" : "FAIL", { reason: "current package manifest rows are not bound to actual installed private bytes", problems: installedProblems });
  else recordCheck(checks, missing, failures, "package.installed-bytes", "PASS", { entries: entryRows.length });
  const manifestDigest = sha256Text(entryRows.map((entry) => `${entry.kind}\u0000${entry.source}\u0000${entry.destination}\u0000${entry.sha256}\u0000${entry.bytes}`).sort().join("\n"));
  if (manifestFile.digest === HISTORICAL_SIX_TARGET_MANIFEST) recordCheck(checks, missing, failures, "package.manifest.current", "FAIL", { reason: "historical six-target manifest was supplied instead of the current full package", sha256: manifestFile.digest });
  else recordCheck(checks, missing, failures, "package.manifest.current", "PASS", { manifest_sha256: manifestFile.digest, manifest_digest: manifestDigest });
  if (binding) {
    const expected = definition.binding;
    const bindingFields = ["run_id", "revision", "nonce", "scope", "manifest_path", "manifest_sha256", "manifest_digest"];
    const absent = bindingFields.filter((key) => binding[key] === undefined || binding[key] === null);
    if (absent.length) recordCheck(checks, missing, failures, "package.binding.shape", "PENDING", { reason: "current package binding omitted required fresh-run fields", absent });
    else if (binding.scope !== REQUIRED_PACKAGE_SCOPE || binding.run_id !== expected.run_id || binding.revision !== expected.revision || binding.nonce !== expected.nonce) recordCheck(checks, missing, failures, "package.binding.identity", "FAIL", { reason: "package binding is not tied to this current run/revision/nonce", expected, observed: { run_id: binding.run_id, revision: binding.revision, nonce: binding.nonce, scope: binding.scope } });
    else recordCheck(checks, missing, failures, "package.binding.identity", "PASS", { run_id: binding.run_id, revision: binding.revision, scope: binding.scope });
    if (binding.manifest_path !== `${ROUTE_ARTIFACT_ROOT}/package-manifest.json`) recordCheck(checks, missing, failures, "package.binding.path", "FAIL", { reason: "package binding points at an unexpected manifest path", observed: binding.manifest_path });
    else if (binding.manifest_sha256 !== manifestFile.digest || binding.manifest_digest !== manifestDigest) recordCheck(checks, missing, failures, "package.binding.hash", "FAIL", { reason: "package binding hash does not match actual current manifest bytes/entries", observed: { manifest_sha256: binding.manifest_sha256, manifest_digest: binding.manifest_digest }, actual: { manifest_sha256: manifestFile.digest, manifest_digest: manifestDigest } });
    else recordCheck(checks, missing, failures, "package.binding.hash", "PASS", { manifest_sha256: manifestFile.digest, manifest_digest: manifestDigest });
  }
  const overlayMismatches = [];
  for (const source of ALIGNMENT_SOURCES) {
    const file = readPrivateBytes(projectRoot, { path: source.overlay }, `installed ${source.path}`, source.overlay);
    if (file.kind === "missing") overlayMismatches.push({ path: source.path, status: "PENDING", reason: file.reason });
    else if (file.kind === "failure") overlayMismatches.push({ path: source.path, status: "FAIL", reason: file.reason });
    else if (file.bytes.byteLength !== source.bytes || file.digest !== source.sha256) overlayMismatches.push({ path: source.path, status: "FAIL", expected: source, observed: { bytes: file.bytes.byteLength, sha256: file.digest } });
  }
  if (overlayMismatches.some((item) => item.status === "FAIL")) recordCheck(checks, missing, failures, "package.alignment-overlay", "FAIL", { reason: "installed alignment bytes do not match current six-source fingerprints", mismatches: overlayMismatches });
  else if (overlayMismatches.length) recordCheck(checks, missing, failures, "package.alignment-overlay", "PENDING", { reason: "installed alignment source bytes were not all observable", mismatches: overlayMismatches });
  else recordCheck(checks, missing, failures, "package.alignment-overlay", "PASS", { sources: ALIGNMENT_SOURCES.map((item) => item.path) });
  return { manifestFile, bindingFile, entries: entryRows, manifestDigest };
}

function validateSourceFingerprints(definition, projectRoot, artifacts, checks, missing, failures) {
  const file = readPrivateJson(projectRoot, descriptorFor(artifacts, "sourceFingerprints"), "current alignment source fingerprints", `${ROUTE_ARTIFACT_ROOT}/alignment-sources.json`);
  if (file.kind === "missing") { recordCheck(checks, missing, failures, "sources.file", "PENDING", file); return; }
  if (file.kind === "failure") { recordCheck(checks, missing, failures, "sources.file", "FAIL", file); return; }
  const value = file.value;
  const rows = Array.isArray(value) ? value : value?.sources;
  if (!Array.isArray(rows)) { recordCheck(checks, missing, failures, "sources.shape", "FAIL", { reason: "alignment source fingerprint artifact lacks sources array" }); return; }
  const byPath = new Map(rows.map((entry) => [normalizeSourcePath(entry?.path), entry]));
  const mismatches = [];
  for (const expected of ALIGNMENT_SOURCES) {
    const actual = byPath.get(normalizeSourcePath(expected.path));
    if (!actual) mismatches.push({ path: expected.path, reason: "missing" });
    else if (actual.bytes !== expected.bytes || String(actual.sha256).toLowerCase() !== expected.sha256) mismatches.push({ path: expected.path, expected, observed: actual });
  }
  const scope = value?.scope ?? value?.source_scope;
  if (!nonEmpty(scope)) mismatches.push({ reason: "current source scope is absent" });
  else if (scope !== REQUIRED_SOURCE_SCOPE) mismatches.push({ reason: "source scope is not the current six-source binding", observed: scope, expected: REQUIRED_SOURCE_SCOPE });
  if (mismatches.length) {
    const pending = mismatches.some((item) => item.reason === "missing" || item.reason === "current source scope is absent");
    recordCheck(checks, missing, failures, "sources.current-six", pending ? "PENDING" : "FAIL", { reason: "current six alignment source fingerprints are not exact", mismatches });
  } else {
    recordCheck(checks, missing, failures, "sources.current-six", "PASS", { scope, sources: ALIGNMENT_SOURCES.map((item) => item.path) });
  }
  if (value?.run_id === undefined || value?.revision === undefined || value?.nonce === undefined) recordCheck(checks, missing, failures, "sources.identity", "PENDING", { reason: "source fingerprint artifact lacks fresh run binding" });
  else if (value.run_id !== definition.binding.run_id || value.revision !== definition.binding.revision || value.nonce !== definition.binding.nonce) recordCheck(checks, missing, failures, "sources.identity", "FAIL", { reason: "source fingerprint artifact is stale or from another run" });
  else recordCheck(checks, missing, failures, "sources.identity", "PASS", { run_id: value.run_id, revision: value.revision });
}

function validatePreservation(definition, projectRoot, artifacts, mode, packageInfo, checks, missing, failures) {
  const file = readPrivateJson(projectRoot, descriptorFor(artifacts, "preservation"), "route preservation receipt", `${ROUTE_ARTIFACT_ROOT}/preservation.json`);
  if (file.kind === "missing") { recordCheck(checks, missing, failures, "preservation.file", "PENDING", file); return; }
  if (file.kind === "failure") { recordCheck(checks, missing, failures, "preservation.file", "FAIL", file); return; }
  const value = file.value;
  const absent = ["run_id", "revision", "nonce", "source", "omp_binary", "effects"].filter((key) => value?.[key] === undefined || value?.[key] === null);
  if (absent.length) recordCheck(checks, missing, failures, "preservation.shape", "PENDING", { reason: "preservation receipt lacks current-run hashes/effects", absent });
  else if (value.run_id !== definition.binding.run_id || value.revision !== definition.binding.revision || value.nonce !== definition.binding.nonce) recordCheck(checks, missing, failures, "preservation.identity", "FAIL", { reason: "preservation receipt belongs to another run/revision/nonce" });
  else recordCheck(checks, missing, failures, "preservation.identity", "PASS", { run_id: value.run_id, revision: value.revision });
  const sourceBefore = value?.source?.before;
  const sourceAfter = value?.source?.after;
  const sourceChanged = value?.source?.changed;
  const binaryBefore = value?.omp_binary?.before;
  const binaryAfter = value?.omp_binary?.after;
  const binaryChanged = value?.omp_binary?.changed;
  if (!SHA256.test(String(sourceBefore?.manifest_sha256 ?? sourceBefore?.sha256 ?? "")) || !SHA256.test(String(sourceAfter?.manifest_sha256 ?? sourceAfter?.sha256 ?? ""))) recordCheck(checks, missing, failures, "preservation.source-hash", "PENDING", { reason: "source before/after full-package hash was not exposed" });
  else if (sourceChanged !== false && (!Array.isArray(sourceChanged) || sourceChanged.length !== 0) || (sourceBefore.manifest_sha256 ?? sourceBefore.sha256) !== (sourceAfter.manifest_sha256 ?? sourceAfter.sha256)) recordCheck(checks, missing, failures, "preservation.source-hash", "FAIL", { reason: "current source/package changed during route case" });
  else if (!packageInfo?.manifestFile?.digest) recordCheck(checks, missing, failures, "preservation.source-hash", "PENDING", { reason: "current package manifest hash was not independently observed" });
  else if ((sourceBefore.manifest_sha256 ?? sourceBefore.sha256) !== packageInfo.manifestFile.digest) recordCheck(checks, missing, failures, "preservation.source-hash", "FAIL", { reason: "preservation source hash is not the actual current package manifest bytes hash", expected: packageInfo.manifestFile.digest, observed: sourceBefore.manifest_sha256 ?? sourceBefore.sha256 });
  else recordCheck(checks, missing, failures, "preservation.source-hash", "PASS", { manifest_sha256: sourceBefore.manifest_sha256 ?? sourceBefore.sha256 });
  if (!SHA256.test(String(binaryBefore?.sha256 ?? "")) || !SHA256.test(String(binaryAfter?.sha256 ?? ""))) recordCheck(checks, missing, failures, "preservation.binary-hash", "PENDING", { reason: "pinned binary before/after hash was not exposed" });
  else if (binaryBefore.sha256 !== PINNED_OMP_BINARY_SHA256 || binaryAfter.sha256 !== PINNED_OMP_BINARY_SHA256) recordCheck(checks, missing, failures, "preservation.binary-hash", "FAIL", { reason: "preservation receipt is not bound to the pinned OMP binary", expected: PINNED_OMP_BINARY_SHA256, observed: { before: binaryBefore.sha256, after: binaryAfter.sha256 } });
  else if (binaryChanged !== false || binaryBefore.sha256 !== binaryAfter.sha256 || binaryBefore.bytes !== binaryAfter.bytes) recordCheck(checks, missing, failures, "preservation.binary-hash", "FAIL", { reason: "pinned binary changed during route case" });
  else recordCheck(checks, missing, failures, "preservation.binary-hash", "PASS", { sha256: binaryBefore.sha256, bytes: binaryBefore.bytes });
  const forbiddenEffectKeys = ["user_home", "source_checkout", "settings", "host", "network", "publication", "git_publication", "ship", "github"];
  const effects = isObject(value.effects) ? value.effects : {};
  const effectProblems = forbiddenEffectKeys.filter((key) => effects[key] !== false);
  if (effectProblems.length) recordCheck(checks, missing, failures, "preservation.effects", effectProblems.some((key) => effects[key] === undefined) ? "PENDING" : "FAIL", { reason: "route effects were not proven absent", fields: effectProblems });
  else recordCheck(checks, missing, failures, "preservation.effects", "PASS", { effects: Object.fromEntries(forbiddenEffectKeys.map((key) => [key, false])) });
  if (mode === "local") {
    const gitPath = path.join(projectRoot, ".git");
    try {
      const stat = fs.lstatSync(gitPath);
      if (stat.isSymbolicLink() || stat.isDirectory() || stat.isFile()) recordCheck(checks, missing, failures, "local.no-git", "FAIL", { reason: "local route created or retained a .git entry in the private project", path: gitPath });
      else recordCheck(checks, missing, failures, "local.no-git", "FAIL", { reason: "local route left a non-directory .git entry", path: gitPath });
    } catch (error) {
      if (error?.code === "ENOENT") recordCheck(checks, missing, failures, "local.no-git", "PASS", { observed: "absent" });
      else recordCheck(checks, missing, failures, "local.no-git", "PENDING", { reason: "could not inspect local .git absence", code: error?.code ?? null });
    }
  }
}

function validateCheckpointFile(projectRoot, descriptor, label, expected, previous = null, checks = [], missing = [], failures = []) {
  if (descriptor === undefined || descriptor === null) {
    recordCheck(checks, missing, failures, `${label}.file`, "PENDING", { reason: "checkpoint descriptor is absent" });
    return null;
  }
  const file = readPrivateJson(projectRoot, descriptor, `${label} checkpoint`);
  if (file.kind === "missing") { recordCheck(checks, missing, failures, `${label}.file`, "PENDING", file); return null; }
  if (file.kind === "failure") { recordCheck(checks, missing, failures, `${label}.file`, "FAIL", file); return null; }
  const record = file.value;
  const required = ["checkpoint", "request_id", "run_id", "request_canonical", "request_digest", "frontier", "responses", "history", "closure", "closureRecorded", "status", "mode", "requested_mode", "resolved_mode", "route", "reason"];
  const absent = required.filter((key) => record?.[key] === undefined || record?.[key] === null);
  if (absent.length) { recordCheck(checks, missing, failures, `${label}.shape`, "PENDING", { reason: "checkpoint omitted contract fields", absent }); return record; }
  const malformed = record.checkpoint !== "alignment"
    || !UUID_V4.test(record.request_id)
    || !UUID_V4.test(record.run_id)
    || typeof record.request_canonical !== "string"
    || record.request_canonical.trim() === ""
    || !canonicalMatches(record.request_canonical)
    || !/^sha256:[0-9a-f]{64}$/i.test(record.request_digest)
    || !Array.isArray(record.frontier)
    || !validResponseSequence(record.responses)
    || typeof record.closure !== "string"
    || record.closure.trim() === ""
    || typeof record.closureRecorded !== "boolean"
    || typeof record.status !== "string"
    || record.mode !== expected.mode
    || record.requested_mode !== expected.mode
    || record.resolved_mode !== expected.mode
    || record.route !== expected.route
    || typeof record.reason !== "string"
    || record.reason.trim() === "";
  if (malformed) {
    recordCheck(checks, missing, failures, `${label}.shape`, "FAIL", { reason: "checkpoint does not satisfy alignment identity/mode/route contract", observed: { checkpoint: record.checkpoint, request_id: record.request_id, run_id: record.run_id, mode: record.mode, requested_mode: record.requested_mode, resolved_mode: record.resolved_mode, route: record.route, status: record.status } });
  } else recordCheck(checks, missing, failures, `${label}.shape`, "PASS", { request_id: record.request_id, run_id: record.run_id, mode: record.mode, route: record.route, status: record.status });
  if (!malformed && String(record.request_digest).toLowerCase() !== `sha256:${sha256Text(record.request_canonical)}`) recordCheck(checks, missing, failures, `${label}.digest-integrity`, "FAIL", { reason: "checkpoint request_digest does not match canonical UTF-8 bytes", observed: record.request_digest });
  else if (!malformed) recordCheck(checks, missing, failures, `${label}.digest-integrity`, "PASS", { observed: record.request_digest });
  if (!malformed && expected.status === "CLOSED" && record.closureRecorded !== true) recordCheck(checks, missing, failures, `${label}.closure`, "FAIL", { reason: "CLOSED checkpoint must record closure", observed: record.closureRecorded });
  else if (!malformed) recordCheck(checks, missing, failures, `${label}.closure`, "PASS", { closureRecorded: record.closureRecorded });
  const relativeCheckpoint = normalized(path.relative(projectRoot, file.path));
  const segments = relativeCheckpoint.split("/");
  const expectedFileName = label.endsWith("initial") ? "checkpoint-000000.json" : label.endsWith("resume") ? "checkpoint-000001.json" : null;
  const namespaceAnchor = expected.mode === "local"
    ? segments.length === 6 && segments[0] === ".omp" && segments[1] === "state" && segments[2] === "alignment"
    : segments.includes("alignment");
  const namespaceBound = expected.mode === "local"
    ? segments[3] === String(record.request_id).toLowerCase() && segments[4] === String(record.run_id).toLowerCase()
    : segments.includes(String(record.request_id).toLowerCase()) && segments.includes(String(record.run_id).toLowerCase());
  if (!/^checkpoint-[0-9]{6}\.json$/i.test(path.basename(file.path)) || (expectedFileName && path.basename(file.path).toLowerCase() !== expectedFileName) || !namespaceAnchor || !namespaceBound) {
    recordCheck(checks, missing, failures, `${label}.path`, "FAIL", { reason: "checkpoint path is outside the permitted append-only request/run namespace", path: file.path, expected_file: expectedFileName, mode: expected.mode });
  } else {
    recordCheck(checks, missing, failures, `${label}.path`, "PASS", { path: file.path });
  }
  if (record.status !== expected.status) recordCheck(checks, missing, failures, `${label}.status`, "FAIL", { reason: "checkpoint status differs from source-defined route outcome", expected: expected.status, observed: record.status });
  else recordCheck(checks, missing, failures, `${label}.status`, "PASS", { observed: record.status });
  if (expected.status === "CLOSED" && expected.route === "short" && record.closure !== "fully-specified-fast-close") recordCheck(checks, missing, failures, `${label}.closure-marker`, "FAIL", { reason: "short CLOSED route must use the alignment fast-close marker", observed: record.closure });
  if (expected.status === "CLOSED" && record.frontier.length !== 0) recordCheck(checks, missing, failures, `${label}.frontier`, "FAIL", { reason: "CLOSED route must have an empty frontier", observed: record.frontier });
  else if (expected.status === "BLOCKED" && record.frontier.length === 0) recordCheck(checks, missing, failures, `${label}.frontier`, "FAIL", { reason: "full route initial/collision block must preserve a material frontier", observed: record.frontier });
  else recordCheck(checks, missing, failures, `${label}.frontier`, "PASS", { count: record.frontier.length });
  if (previous) {
    if (record.request_id !== previous.request_id || record.run_id !== previous.run_id || record.mode !== previous.mode || record.route !== previous.route) recordCheck(checks, missing, failures, `${label}.identity`, "FAIL", { reason: "resume changed request/run/mode/route identity" });
    else recordCheck(checks, missing, failures, `${label}.identity`, "PASS", { request_id: record.request_id, run_id: record.run_id });
    if (!Array.isArray(previous.history) || !Array.isArray(record.history) || record.responses.length !== previous.responses.length + 1 || record.history.length !== previous.history.length + 1) recordCheck(checks, missing, failures, `${label}.history`, "FAIL", { reason: "resume must append exactly one response and one history item" });
    else {
      const responsesPreserved = previous.responses.every((item, index) => JSON.stringify(item) === JSON.stringify(record.responses[index]));
      const historyPreserved = previous.history.every((item, index) => JSON.stringify(item) === JSON.stringify(record.history[index]));
      const response = record.responses.at(-1);
      const historyItem = record.history.at(-1);
      const appendedValid = isObject(response) && Number.isInteger(response.round) && response.round >= 1 && typeof response.question_id === "string" && response.question_id.trim() !== "" && typeof response.question === "string" && response.question.trim() !== "" && typeof response.answer === "string" && response.answer.trim() !== "" && isObject(historyItem) && historyItem.question_id === response.question_id && historyItem.question === response.question && historyItem.answer === response.answer;
      if (!responsesPreserved || !historyPreserved || !appendedValid) recordCheck(checks, missing, failures, `${label}.history`, "FAIL", { reason: "resume replaced prior response/history prefix or appended an invalid response binding" });
      else recordCheck(checks, missing, failures, `${label}.history`, "PASS", { previous_responses: previous.responses.length, resumed_responses: record.responses.length, previous_history: previous.history.length, resumed_history: record.history.length });
    }
    const parentHash = sha256(previous.__bytes ?? Buffer.alloc(0));
    const parentPath = String(previous.__path ?? "");
    const parentObserved = nonEmpty(record.parent_path) && pathMatches(projectRoot, record.parent_path, parentPath);
    const hashObserved = previous.__bytes && typeof record.parent_sha256 === "string" && record.parent_sha256.toLowerCase() === parentHash;
    if (!parentObserved || !hashObserved) recordCheck(checks, missing, failures, `${label}.parent`, "FAIL", { reason: "resume did not expose exact sealed parent path and hash", parent_path: previous.__path ?? null, parent_sha256: previous.__bytes ? parentHash : null });
    else recordCheck(checks, missing, failures, `${label}.parent`, "PASS", { parent_path: previous.__path, parent_sha256: parentHash });
    if (record.request_canonical === previous.request_canonical || record.request_digest === previous.request_digest) recordCheck(checks, missing, failures, `${label}.digest`, "FAIL", { reason: "resume did not recalculate canonical request/digest" });
    else recordCheck(checks, missing, failures, `${label}.digest`, "PASS", { previous: previous.request_digest, resumed: record.request_digest });
  }
  record.__path = file.path;
  record.__bytes = file.bytes;
  return record;
}

function checkpointDescriptors(artifacts) {
  if (!isObject(artifacts)) return {};
  if (isObject(artifacts.checkpoints)) return artifacts.checkpoints;
  const result = {};
  if (artifacts.checkpointInitial !== undefined) result.initial = artifacts.checkpointInitial;
  if (artifacts.checkpointResume !== undefined) result.resume = artifacts.checkpointResume;
  if (artifacts.checkpointCollision !== undefined) result.collision = artifacts.checkpointCollision;
  return result;
}

function validateCheckpoints(definition, projectRoot, artifacts, checks, missing, failures) {
  const descriptors = checkpointDescriptors(artifacts);
  const expected = { mode: definition.mode, route: definition.route };
  const initial = validateCheckpointFile(projectRoot, descriptors.initial, "initial", { ...expected, status: definition.expected.initial }, null, checks, missing, failures);
  if (definition.route === "short") return { initial };
  const resume = validateCheckpointFile(projectRoot, descriptors.resume, "resume", { ...expected, status: definition.expected.resume }, initial, checks, missing, failures);
  if (definition.mode === "git" && definition.route === "full") {
    const collision = readPrivateBytes(projectRoot, descriptors.collision, "Git corrupt successor checkpoint");
    if (collision.kind === "missing") recordCheck(checks, missing, failures, "collision.checkpoint", "PENDING", collision);
    else if (collision.kind === "failure") recordCheck(checks, missing, failures, "collision.checkpoint", "FAIL", collision);
    else if (path.basename(collision.path).toLowerCase() !== "checkpoint-000002.json" || !resume || !initial?.request_id || !initial?.run_id || normalized(path.dirname(collision.path)) !== normalized(path.dirname(resume.__path)) || !normalized(collision.path).includes(normalized(initial.request_id)) || !normalized(collision.path).includes(normalized(initial.run_id))) recordCheck(checks, missing, failures, "collision.checkpoint", "FAIL", { reason: "collision descriptor is not the exact successor in the resumed request/run namespace", path: collision.path });
    else recordCheck(checks, missing, failures, "collision.checkpoint", "PASS", { path: collision.path, sha256: collision.digest, bytes: collision.bytes.byteLength });
    return { initial, resume, collision };
  }
  return { initial, resume };
}

function validateGitReceipt(definition, projectRoot, artifacts, checkpointState, checks, missing, failures) {
  const file = readPrivateJson(projectRoot, descriptorFor(artifacts, "gitReceipt"), "Git route receipt", `${ROUTE_ARTIFACT_ROOT}/git-receipt.json`);
  if (file.kind === "missing") { recordCheck(checks, missing, failures, "git.receipt", "PENDING", file); return; }
  if (file.kind === "failure") { recordCheck(checks, missing, failures, "git.receipt", "FAIL", file); return; }
  const value = file.value;
  const required = ["run_id", "revision", "nonce", "worktree_root", "common_dir", "branch", "base", "observations"];
  const absent = required.filter((key) => value?.[key] === undefined || value?.[key] === null);
  if (absent.length) { recordCheck(checks, missing, failures, "git.receipt.shape", "PENDING", { reason: "Git route receipt omitted actual branch/base/common-dir observations", absent }); return; }
  if (value.run_id !== definition.binding.run_id || value.revision !== definition.binding.revision || value.nonce !== definition.binding.nonce) recordCheck(checks, missing, failures, "git.receipt.identity", "FAIL", { reason: "Git receipt is stale or from another current run" });
  else recordCheck(checks, missing, failures, "git.receipt.identity", "PASS", { run_id: value.run_id, revision: value.revision });
  if (normalizedAbsolute(value.worktree_root) !== normalizedAbsolute(projectRoot)) recordCheck(checks, missing, failures, "git.receipt.worktree", "FAIL", { reason: "Git root observation differs from projectRoot", expected: projectRoot, observed: value.worktree_root });
  else recordCheck(checks, missing, failures, "git.receipt.worktree", "PASS", { observed: value.worktree_root });
  let commonDir;
  try {
    commonDir = path.resolve(projectRoot, value.common_dir);
    regularDirectory(commonDir, "Git common directory");
  } catch (error) {
    recordCheck(checks, missing, failures, "git.receipt.common-dir", error?.code === "ENOENT" ? "PENDING" : "FAIL", { reason: error?.message ?? "Git common directory is not a real directory", observed: value.common_dir });
    commonDir = null;
  }
  if (commonDir && !inside(projectRoot, commonDir)) recordCheck(checks, missing, failures, "git.receipt.common-dir-scope", "FAIL", { reason: "Git common directory escaped the private project root", observed: value.common_dir });
  else if (commonDir) recordCheck(checks, missing, failures, "git.receipt.common-dir-scope", "PASS", { observed: value.common_dir });
  const branch = value.branch;
  const base = value.base;
  if (!nonEmpty(branch?.name) || !SHA40.test(String(branch?.head_sha ?? "")) || !nonEmpty(base?.name) || !SHA40.test(String(base?.sha ?? ""))) recordCheck(checks, missing, failures, "git.receipt.branch-base", "PENDING", { reason: "actual branch/base names or revisions are missing", observed: { branch, base } });
  else recordCheck(checks, missing, failures, "git.receipt.branch-base", "PASS", { branch: branch.name, branch_head_sha: branch.head_sha, base: base.name, base_sha: base.sha });
  const observedTop = value.observations?.show_toplevel === undefined ? null : path.resolve(projectRoot, value.observations.show_toplevel);
  const observedCommon = value.observations?.git_common_dir === undefined ? null : path.resolve(projectRoot, value.observations.git_common_dir);
  if (!observedTop || !observedCommon || normalizedAbsolute(observedTop) !== normalizedAbsolute(projectRoot) || !commonDir || normalizedAbsolute(observedCommon) !== normalizedAbsolute(commonDir)) recordCheck(checks, missing, failures, "git.receipt.rev-parse", "FAIL", { reason: "actual rev-parse observations do not bind worktree/common-dir", observed: value.observations, resolved: { show_toplevel: observedTop, git_common_dir: observedCommon } });
  else recordCheck(checks, missing, failures, "git.receipt.rev-parse", "PASS", { observations: value.observations, resolved: { show_toplevel: observedTop, git_common_dir: observedCommon } });
  if (commonDir && nonEmpty(branch?.name) && SHA40.test(String(branch?.head_sha ?? ""))) {
    try {
      const headText = fs.readFileSync(path.join(projectRoot, ".git", "HEAD"), "utf8").trim();
      const headRef = headText.startsWith("ref: ") ? headText.slice(5).trim() : null;
      const headValue = headRef ? fs.readFileSync(path.join(commonDir, headRef), "utf8").trim() : headText;
      if (!headRef || headRef !== `refs/heads/${branch.name}` || headValue.toLowerCase() !== String(branch.head_sha).toLowerCase()) recordCheck(checks, missing, failures, "git.receipt.head-binding", "FAIL", { reason: "Git HEAD/ref bytes do not match reported branch identity", head_ref: headRef, head_sha: headValue, branch: branch.name, branch_head_sha: branch.head_sha });
      else recordCheck(checks, missing, failures, "git.receipt.head-binding", "PASS", { branch: branch.name, head_sha: branch.head_sha });
    } catch (error) {
      recordCheck(checks, missing, failures, "git.receipt.head-binding", error?.code === "ENOENT" ? "PENDING" : "FAIL", { reason: error?.message ?? "Git HEAD/ref could not be independently read" });
    }
  }
  if (commonDir && nonEmpty(base?.name) && SHA40.test(String(base?.sha ?? ""))) {
    const baseRef = String(base.name);
    if (baseRef.includes("..") || baseRef.startsWith("/") || baseRef.includes("\\") || baseRef.includes("\u0000")) {
      recordCheck(checks, missing, failures, "git.receipt.base-binding", "FAIL", { reason: "base branch name is not a safe Git ref component", base: baseRef });
    } else {
      const candidates = [
        path.resolve(commonDir, "refs", "heads", baseRef),
        path.resolve(commonDir, "refs", "remotes", "origin", baseRef),
      ].filter((candidate) => inside(commonDir, candidate));
      let observedBaseSha = null;
      let observedBasePath = null;
      for (const candidate of candidates) {
        try {
          const stat = fs.statSync(candidate);
          if (stat.isFile()) {
            observedBaseSha = fs.readFileSync(candidate, "utf8").trim();
            observedBasePath = candidate;
            break;
          }
        } catch {}
      }
      if (!observedBaseSha) {
        try {
          const packed = fs.readFileSync(path.join(commonDir, "packed-refs"), "utf8").split(/\r?\n/);
          const match = packed.find((line) => line.startsWith(`${String(base.sha)} refs/heads/${baseRef}`) || line.startsWith(`${String(base.sha)} refs/remotes/origin/${baseRef}`));
          if (match) {
            observedBaseSha = match.split(" ")[0];
            observedBasePath = "packed-refs";
          }
        } catch {}
      }
      if (!observedBaseSha) recordCheck(checks, missing, failures, "git.receipt.base-binding", "PENDING", { reason: "base branch ref bytes are not independently readable", base: baseRef });
      else if (observedBaseSha.toLowerCase() !== String(base.sha).toLowerCase()) recordCheck(checks, missing, failures, "git.receipt.base-binding", "FAIL", { reason: "base branch ref bytes do not match reported base SHA", base: baseRef, observed: observedBaseSha, expected: base.sha, path: observedBasePath });
      else recordCheck(checks, missing, failures, "git.receipt.base-binding", "PASS", { base: baseRef, sha: observedBaseSha, path: observedBasePath });
    }
  }
  const first = checkpointState.initial;
  if (first && commonDir && !inside(commonDir, first.__path)) recordCheck(checks, missing, failures, "git.receipt.namespace", "FAIL", { reason: "checkpoint namespace is not anchored at resolved git-common-dir", checkpoint: first.__path, common_dir: commonDir });
  else if (first && commonDir) {
    const namespace = normalized(path.dirname(first.__path));
    if (!namespace.includes(normalized(first.request_id)) || !namespace.includes(normalized(first.run_id))) recordCheck(checks, missing, failures, "git.receipt.namespace", "FAIL", { reason: "Git checkpoint namespace does not contain request_id and run_id", namespace });
    else recordCheck(checks, missing, failures, "git.receipt.namespace", "PASS", { namespace });
  }
  return { file, value, commonDir };
}

function validateCasReceipt(definition, projectRoot, artifacts, checkpointState, gitCommonDir, collisionNative, checks, missing, failures) {
  const file = readPrivateJson(projectRoot, descriptorFor(artifacts, "casReceipt"), "Git CAS/resume receipt", `${ROUTE_ARTIFACT_ROOT}/cas-receipt.json`);
  if (file.kind === "missing") { recordCheck(checks, missing, failures, "cas.receipt", "PENDING", file); return; }
  if (file.kind === "failure") { recordCheck(checks, missing, failures, "cas.receipt", "FAIL", file); return; }
  const value = file.value;
  const required = ["run_id", "revision", "nonce", "common_dir", "namespaces", "cross_resume_preserved", "collision"];
  const absent = required.filter((key) => value?.[key] === undefined || value?.[key] === null);
  if (absent.length) { recordCheck(checks, missing, failures, "cas.shape", "PENDING", { reason: "CAS receipt omitted actual namespace/isolation/collision fields", absent }); return; }
  if (value.run_id !== definition.binding.run_id || value.revision !== definition.binding.revision || value.nonce !== definition.binding.nonce) recordCheck(checks, missing, failures, "cas.identity", "FAIL", { reason: "CAS receipt is stale or from another current run" });
  else recordCheck(checks, missing, failures, "cas.identity", "PASS", { run_id: value.run_id, revision: value.revision });
  const namespaces = Array.isArray(value.namespaces) ? value.namespaces : [];
  if (namespaces.length !== 2) { recordCheck(checks, missing, failures, "cas.namespaces", "PENDING", { reason: "CAS receipt must contain independent A/B namespaces", observed: namespaces.length }); return; }
  const labels = new Set(namespaces.map((item) => item?.label));
  if (!labels.has("A") || !labels.has("B")) recordCheck(checks, missing, failures, "cas.namespaces.labels", "FAIL", { reason: "CAS namespaces are not named A and B" });
  const identities = namespaces.map((item) => `${item?.request_id ?? ""}\u0000${item?.run_id ?? ""}`);
  if (namespaces.some((item) => !UUID_V4.test(String(item?.request_id ?? "")) || !UUID_V4.test(String(item?.run_id ?? "")))) recordCheck(checks, missing, failures, "cas.namespaces.identity", "FAIL", { reason: "CAS namespace request/run identity is not UUID-v4" });
  else if (new Set(identities).size !== namespaces.length) recordCheck(checks, missing, failures, "cas.namespaces.identity", "FAIL", { reason: "CAS namespaces reused request/run identity" });
  else recordCheck(checks, missing, failures, "cas.namespaces.identity", "PASS", { identities: namespaces.map((item) => ({ request_id: item.request_id, run_id: item.run_id })) });
  const commonDir = path.resolve(projectRoot, value.common_dir);
  try {
    regularDirectory(commonDir, "CAS common directory");
    if (!inside(projectRoot, commonDir)) recordCheck(checks, missing, failures, "cas.common-dir", "FAIL", { reason: "CAS common directory escaped projectRoot", common_dir: value.common_dir });
    else recordCheck(checks, missing, failures, "cas.common-dir", "PASS", { common_dir: value.common_dir });
  } catch (error) {
    recordCheck(checks, missing, failures, "cas.common-dir", error?.code === "ENOENT" ? "PENDING" : "FAIL", { reason: error?.message ?? "CAS common directory is not readable" });
  }
  if (!gitCommonDir) recordCheck(checks, missing, failures, "cas.git-common-binding", "PENDING", { reason: "Git receipt common directory was not independently observed" });
  else if (normalizedAbsolute(commonDir) !== normalizedAbsolute(gitCommonDir)) recordCheck(checks, missing, failures, "cas.git-common-binding", "FAIL", { reason: "CAS receipt common_dir differs from actual Git receipt common_dir", cas: commonDir, git: gitCommonDir });
  else recordCheck(checks, missing, failures, "cas.git-common-binding", "PASS", { common_dir: commonDir });
  const namespaceChecks = [];
  for (const namespace of namespaces) {
    const checkpoints = Array.isArray(namespace.checkpoints) ? namespace.checkpoints : [];
    if (checkpoints.length !== 2) { namespaceChecks.push({ label: namespace.label, status: "PENDING", reason: "namespace must expose exactly initial/resume checkpoint descriptors" }); continue; }
    const first = readPrivateJson(projectRoot, checkpoints[0], `CAS ${namespace.label} initial checkpoint`);
    const second = readPrivateJson(projectRoot, checkpoints[1], `CAS ${namespace.label} resume checkpoint`);
    const firstDescriptor = isObject(checkpoints[0]) ? checkpoints[0] : {};
    const secondDescriptor = isObject(checkpoints[1]) ? checkpoints[1] : {};
    const firstBefore = readPrivateBytes(projectRoot, firstDescriptor.before_path, `CAS ${namespace.label} initial before snapshot`);
    const firstAfter = readPrivateBytes(projectRoot, firstDescriptor.after_path, `CAS ${namespace.label} initial after snapshot`);
    const secondBefore = readPrivateBytes(projectRoot, secondDescriptor.before_path, `CAS ${namespace.label} resume before snapshot`);
    const secondAfter = readPrivateBytes(projectRoot, secondDescriptor.after_path, `CAS ${namespace.label} resume after snapshot`);
    const observations = [first, second, firstBefore, firstAfter, secondBefore, secondAfter];
    if (observations.some((item) => item.kind !== "ok")) { namespaceChecks.push({ label: namespace.label, status: observations.some((item) => item.kind === "failure") ? "FAIL" : "PENDING", reason: "CAS checkpoint or before/after snapshot bytes are not all observable" }); continue; }
    const successorFailuresBefore = failures.length;
    const successorMissingBefore = missing.length;
    const validatedInitial = validateCheckpointFile(projectRoot, firstDescriptor, `cas.${namespace.label}.initial`, { mode: "git", route: "full", status: "BLOCKED" }, null, checks, missing, failures);
    const validatedResume = validateCheckpointFile(projectRoot, secondDescriptor, `cas.${namespace.label}.resume`, { mode: "git", route: "full", status: "CLOSED" }, validatedInitial, checks, missing, failures);
    const successorContractValid = Boolean(validatedInitial && validatedResume) && failures.length === successorFailuresBefore && missing.length === successorMissingBefore;
    const firstRecord = first.value;
    const secondRecord = second.value;
    const firstRequestValid = isObject(firstRecord) && typeof firstRecord.request_canonical === "string" && canonicalMatches(firstRecord.request_canonical) && SHA256.test(String(firstRecord.request_digest ?? "").replace(/^sha256:/i, "")) && String(firstRecord.request_digest).toLowerCase() === `sha256:${sha256Text(firstRecord.request_canonical)}`;
    const secondRequestValid = isObject(secondRecord) && typeof secondRecord.request_canonical === "string" && canonicalMatches(secondRecord.request_canonical) && SHA256.test(String(secondRecord.request_digest ?? "").replace(/^sha256:/i, "")) && String(secondRecord.request_digest).toLowerCase() === `sha256:${sha256Text(secondRecord.request_canonical)}`;
    const firstValid = isObject(firstRecord) && firstRecord.checkpoint === "alignment" && firstRecord.mode === "git" && firstRecord.requested_mode === "git" && firstRecord.resolved_mode === "git" && firstRecord.route === "full" && firstRecord.status === "BLOCKED" && Array.isArray(firstRecord.frontier) && firstRecord.frontier.length > 0 && firstRequestValid && validResponseSequence(firstRecord.responses) && Array.isArray(firstRecord.history);
    const secondValid = isObject(secondRecord) && secondRecord.checkpoint === "alignment" && secondRecord.mode === "git" && secondRecord.requested_mode === "git" && secondRecord.resolved_mode === "git" && secondRecord.route === "full" && secondRecord.status === "CLOSED" && Array.isArray(secondRecord.frontier) && secondRecord.frontier.length === 0 && secondRequestValid && validResponseSequence(secondRecord.responses) && Array.isArray(secondRecord.history);
    const casRoot = path.resolve(projectRoot, ROUTE_ARTIFACT_ROOT, "cas");
    const snapshotPath = (descriptor) => typeof descriptor === "string" ? descriptor : descriptor?.path;
    const protectedSnapshot = (descriptor, snapshot) => {
      const raw = snapshotPath(descriptor);
      if (!nonEmpty(raw) || snapshot.kind !== "ok") return false;
      const resolved = path.resolve(projectRoot, raw);
      try { regularFile(resolved, "approved CAS snapshot"); } catch { return false; }
      return inside(casRoot, resolved) && normalizedAbsolute(resolved) !== normalizedAbsolute(first.path) && normalizedAbsolute(resolved) !== normalizedAbsolute(second.path);
    };
    const firstStable = protectedSnapshot(firstDescriptor.before_path, firstBefore)
      && protectedSnapshot(firstDescriptor.after_path, firstAfter)
      && normalizedAbsolute(path.resolve(projectRoot, snapshotPath(firstDescriptor.before_path))) !== normalizedAbsolute(path.resolve(projectRoot, snapshotPath(firstDescriptor.after_path)))
      && firstBefore.bytes.equals(first.bytes) && firstAfter.bytes.equals(first.bytes)
      && firstBefore.digest === firstAfter.digest && firstBefore.digest === first.digest
      && SHA256.test(String(firstDescriptor.sha256_before ?? "")) && SHA256.test(String(firstDescriptor.sha256_after ?? ""))
      && String(firstDescriptor.sha256_before).toLowerCase() === firstBefore.digest && String(firstDescriptor.sha256_after).toLowerCase() === firstAfter.digest;
    const secondStable = protectedSnapshot(secondDescriptor.before_path, secondBefore)
      && protectedSnapshot(secondDescriptor.after_path, secondAfter)
      && normalizedAbsolute(path.resolve(projectRoot, snapshotPath(secondDescriptor.before_path))) !== normalizedAbsolute(path.resolve(projectRoot, snapshotPath(secondDescriptor.after_path)))
      && secondBefore.bytes.equals(second.bytes) && secondAfter.bytes.equals(second.bytes)
      && secondBefore.digest === secondAfter.digest && secondBefore.digest === second.digest
      && SHA256.test(String(secondDescriptor.sha256_before ?? "")) && SHA256.test(String(secondDescriptor.sha256_after ?? ""))
      && String(secondDescriptor.sha256_before).toLowerCase() === secondBefore.digest && String(secondDescriptor.sha256_after).toLowerCase() === secondAfter.digest;
    const expectedIds = namespace.request_id === firstRecord?.request_id && namespace.run_id === firstRecord?.run_id && firstRecord?.request_id === secondRecord?.request_id && firstRecord?.run_id === secondRecord?.run_id;
    const parentObserved = nonEmpty(secondRecord?.parent_path) && normalizedAbsolute(secondRecord.parent_path) === normalizedAbsolute(first.path);
    const hashObserved = String(secondRecord?.parent_sha256 ?? "").toLowerCase() === first.digest;
    const pathBound = inside(commonDir, first.path) && inside(commonDir, second.path) && path.basename(first.path).toLowerCase() === "checkpoint-000000.json" && path.basename(second.path).toLowerCase() === "checkpoint-000001.json" && normalized(first.path).includes(normalized(namespace.request_id)) && normalized(first.path).includes(normalized(namespace.run_id)) && normalized(second.path).includes(normalized(namespace.request_id)) && normalized(second.path).includes(normalized(namespace.run_id));
    const appendOnly = successorContractValid && first.digest !== second.digest && namespace.parent_unchanged === true && parentObserved && hashObserved && firstStable && secondStable;
    namespaceChecks.push({ label: namespace.label, status: firstValid && secondValid && expectedIds && pathBound && appendOnly ? "PASS" : "FAIL", request_id: namespace.request_id, run_id: namespace.run_id, parent_unchanged: namespace.parent_unchanged });
  }
  if (namespaceChecks.some((item) => item.status === "FAIL")) recordCheck(checks, missing, failures, "cas.namespace-bytes", "FAIL", { reason: "CAS namespace identity/path/append-only checks failed", namespaces: namespaceChecks });
  else if (namespaceChecks.some((item) => item.status === "PENDING")) recordCheck(checks, missing, failures, "cas.namespace-bytes", "PENDING", { reason: "CAS namespace bytes were not fully observable", namespaces: namespaceChecks });
  else recordCheck(checks, missing, failures, "cas.namespace-bytes", "PASS", { namespaces: namespaceChecks });
  const mainInitial = checkpointState.initial;
  const mainResume = checkpointState.resume;
  const boundNamespace = namespaces.find((item) => item?.label === "A");
  const mainBound = Boolean(boundNamespace && mainInitial && mainResume && boundNamespace.request_id === mainInitial.request_id && boundNamespace.run_id === mainInitial.run_id && Array.isArray(boundNamespace.checkpoints) && boundNamespace.checkpoints[0]?.path && normalized(boundNamespace.checkpoints[0].path) === normalized(mainInitial.__path) && normalized(boundNamespace.checkpoints[1]?.path) === normalized(mainResume.__path));
  if (!mainBound) recordCheck(checks, missing, failures, "cas.main-binding", mainInitial && mainResume ? "FAIL" : "PENDING", { reason: "CAS A namespace is not bound to the route case's actual initial/resume checkpoints" });
  else recordCheck(checks, missing, failures, "cas.main-binding", "PASS", { request_id: mainInitial.request_id, run_id: mainInitial.run_id });
  const namespaceBytesPass = namespaceChecks.length === 2 && namespaceChecks.every((item) => item.status === "PASS");
  if (value.cross_resume_preserved !== true || !namespaceBytesPass) recordCheck(checks, missing, failures, "cas.cross-resume", value.cross_resume_preserved === undefined || !namespaceBytesPass ? "PENDING" : "FAIL", { reason: "cross-namespace resume did not preserve both independently observed namespaces", observed: value.cross_resume_preserved ?? null, namespace_bytes: namespaceChecks });
  else recordCheck(checks, missing, failures, "cas.cross-resume", "PASS", { observed: true, namespace_bytes: namespaceChecks });
  const collision = value.collision;
  const beforeDescriptor = collision?.before_path ?? descriptorFor(artifacts, "corruptSuccessorBefore");
  const afterDescriptor = collision?.after_path ?? descriptorFor(artifacts, "corruptSuccessorAfter");
  const before = readPrivateBytes(projectRoot, beforeDescriptor, "corrupt successor before snapshot");
  const after = readPrivateBytes(projectRoot, afterDescriptor, "corrupt successor after snapshot");
  const target = checkpointState.collision?.kind === "ok" ? checkpointState.collision : readPrivateBytes(projectRoot, nonEmpty(collision?.target_path) ? { path: collision.target_path } : undefined, "corrupt successor target");
  const targetCorrupt = target.kind === "ok" && (() => {
    try {
      JSON.parse(target.bytes.toString("utf8"));
      return false;
    } catch {
      return true;
    }
  })();
  const malformed = (value) => {
    if (value?.kind !== "ok") return false;
    try {
      JSON.parse(value.bytes.toString("utf8"));
      return false;
    } catch {
      return true;
    }
  };
  const beforeRawPath = typeof beforeDescriptor === "string" ? beforeDescriptor : beforeDescriptor?.path;
  const afterRawPath = typeof afterDescriptor === "string" ? afterDescriptor : afterDescriptor?.path;
  const collisionCasRoot = path.resolve(projectRoot, ROUTE_ARTIFACT_ROOT, "cas");
  const collisionSnapshotsProtected = before.kind === "ok" && after.kind === "ok" && target.kind === "ok" && inside(collisionCasRoot, before.path) && inside(collisionCasRoot, after.path) && before.bytes.equals(target.bytes) && after.bytes.equals(target.bytes) && (() => { try { regularFile(before.path, "corrupt successor before snapshot"); regularFile(after.path, "corrupt successor after snapshot"); return true; } catch { return false; } })();
  const collisionSnapshotsDistinct = nonEmpty(beforeRawPath) && nonEmpty(afterRawPath) && normalized(path.resolve(projectRoot, beforeRawPath)) !== normalized(path.resolve(projectRoot, afterRawPath));
  const beforeCorrupt = malformed(before);
  const afterCorrupt = malformed(after);
  if (before.kind === "missing" || after.kind === "missing" || target.kind === "missing") recordCheck(checks, missing, failures, "cas.collision.bytes", "PENDING", { reason: "corrupt successor target or before/after snapshots are absent" });
  else if (before.kind === "failure" || after.kind === "failure" || target.kind === "failure") recordCheck(checks, missing, failures, "cas.collision.bytes", "FAIL", { reason: "corrupt successor target or snapshots could not be read" });
  else if (!targetCorrupt || !beforeCorrupt || !afterCorrupt || !collisionSnapshotsDistinct || !collisionSnapshotsProtected || before.digest !== after.digest || target.digest !== before.digest || !commonDir || !inside(commonDir, target.path) || path.basename(target.path).toLowerCase() !== "checkpoint-000002.json" || collision?.target_path === undefined || normalized(path.resolve(projectRoot, collision.target_path)) !== normalized(path.resolve(projectRoot, target.path)) || collision?.existing_records_unchanged !== true) recordCheck(checks, missing, failures, "cas.collision.bytes", "FAIL", { reason: "corrupt successor was not independently malformed, separately snapshotted, or its bytes were clobbered/preservation was not proven", target_corrupt: targetCorrupt, before_corrupt: beforeCorrupt, after_corrupt: afterCorrupt, snapshots_distinct: collisionSnapshotsDistinct, snapshots_protected: collisionSnapshotsProtected, before_sha256: before.digest, after_sha256: after.digest, target_sha256: target.digest });
  else recordCheck(checks, missing, failures, "cas.collision.bytes", "PASS", { target_path: target.path, sha256: before.digest });
  const targetPath = target.kind === "ok" ? target.path : null;
  const claimedTargetRead = targetPath && Array.isArray(collision?.observed_read_paths) && collision.observed_read_paths.some((observed) => pathMatches(projectRoot, observed, targetPath));
  if (collision?.terminal_status !== "BLOCKED" || !claimedTargetRead) recordCheck(checks, missing, failures, "cas.collision.terminal", collision?.terminal_status === undefined || collision?.observed_read_paths === undefined ? "PENDING" : "FAIL", { reason: "corrupt successor did not produce explicit BLOCKED terminal/read evidence for the actual target", observed: collision?.terminal_status ?? null, read_paths: collision?.observed_read_paths ?? null, target_path: targetPath });
  else recordCheck(checks, missing, failures, "cas.collision.terminal", "PASS", { observed: collision.terminal_status, read_paths: collision.observed_read_paths });
  const childDispatchObserved = observedTaskDispatch(collisionNative);
  const expectedRequestId = checkpointState.resume?.request_id ?? checkpointState.initial?.request_id;
  const expectedRunId = checkpointState.resume?.run_id ?? checkpointState.initial?.run_id;
  const rootVerdict = rootCollisionVerdict(collisionNative, projectRoot, expectedRequestId, expectedRunId, targetPath);
  if (childDispatchObserved) recordCheck(checks, missing, failures, "cas.collision.native-binding", "FAIL", { reason: "collision is Root-only; any child dispatch invalidates the collision verdict", dispatched: true });
  else if (!rootVerdict.valid) recordCheck(checks, missing, failures, "cas.collision.native-binding", rootVerdict.complete ? "FAIL" : "PENDING", { reason: "collision requires the actual Root BLOCKED verdict bound to persisted request/run/step/session and target read", root: rootVerdict });
  else recordCheck(checks, missing, failures, "cas.collision.native-binding", "PASS", { authority: "root-public-verdict", root: rootVerdict, child: { dispatched: false } });
  return { file, value };
}

function inspectRouteCase({ definition, projectRoot, native, artifacts }) {
  const checks = [];
  const missing = [];
  const failures = [];
  const startedAt = now();
  if (!isObject(definition) || !["SHORT_LOCAL", "FULL_LOCAL", "SHORT_GIT", "FULL_GIT"].includes(definition.id)) {
    return { status: "FAIL", case: definition?.id ?? null, evidence_level: "route-matrix", checks: [], missing: [], failures: [{ id: "definition", reason: "unknown route case definition" }], started_at: startedAt, finished_at: now() };
  }
  try {
    const binding = definition.binding;
    const canonical = buildRouteCases({ runId: binding?.run_id, revision: binding?.revision, nonce: binding?.nonce }).find((item) => item.id === definition.id);
    if (!canonical || canonicalJson(definition) !== canonicalJson(canonical)) return { status: "FAIL", case: definition.id, evidence_level: "route-matrix", checks: [], missing: [], failures: [{ id: "definition.integrity", reason: "route definition differs from the canonical buildRouteCases output" }], started_at: startedAt, finished_at: now() };
  } catch (error) {
    return { status: "FAIL", case: definition?.id ?? null, evidence_level: "route-matrix", checks: [], missing: [], failures: [{ id: "definition.integrity", reason: error?.message ?? "route definition could not be canonicalized" }], started_at: startedAt, finished_at: now() };
  }
  if (!nonEmpty(projectRoot)) {
    return { status: "PENDING", case: definition.id, evidence_level: "route-matrix", checks: [], missing: [{ id: "projectRoot", reason: "private project root was not supplied" }], failures: [], started_at: startedAt, finished_at: now() };
  }
  try {
    regularDirectory(projectRoot, "private project root");
  } catch (error) {
    return { status: error?.code === "ENOENT" ? "PENDING" : "FAIL", case: definition.id, evidence_level: "route-matrix", checks: [], missing: error?.code === "ENOENT" ? [{ id: "projectRoot", reason: error.message }] : [], failures: error?.code === "ENOENT" ? [] : [{ id: "projectRoot", reason: error.message }], started_at: startedAt, finished_at: now() };
  }
  validateRouteArtifactDirectory(definition, projectRoot, checks, missing, failures);
  const packageInfo = validatePackage(definition, projectRoot, artifacts, checks, missing, failures);
  validateSourceFingerprints(definition, projectRoot, artifacts, checks, missing, failures);
  validatePreservation(definition, projectRoot, artifacts, definition.mode, packageInfo, checks, missing, failures);
  const checkpointState = validateCheckpoints(definition, projectRoot, artifacts, checks, missing, failures);
  const stepResults = {};
  const checkpointFor = (record) => record?.__path && record?.__bytes ? { kind: "ok", path: record.__path, bytes: record.__bytes, digest: sha256(record.__bytes), value: JSON.parse(record.__bytes.toString("utf8")) } : null;
  const casFile = definition.mode === "git" && definition.route === "full" ? readPrivateJson(projectRoot, descriptorFor(artifacts, "casReceipt"), "CAS receipt for namespace bindings", `${ROUTE_ARTIFACT_ROOT}/cas-receipt.json`) : null;
  const bCheckpoints = casFile?.kind === "ok" && Array.isArray(casFile.value?.namespaces) ? casFile.value.namespaces.find((item) => item?.label === "B")?.checkpoints ?? [] : [];
  const bInitialExpected = bCheckpoints[0] ? readPrivateJson(projectRoot, bCheckpoints[0], "CAS B initial checkpoint") : null;
  const bResumeExpected = bCheckpoints[1] ? readPrivateJson(projectRoot, bCheckpoints[1], "CAS B resume checkpoint") : null;
  for (const step of ["initial", "resume", "collision"]) {
    if (!definition.steps[step]) continue;
    const stepNative = matchingStepNative(native, step);
    const expectedCheckpoint = step === "initial" ? checkpointFor(checkpointState.initial) : step === "resume" ? checkpointFor(checkpointState.resume) : null;
    const rootOnly = step === "collision" && definition.mode === "git" && definition.route === "full" && !observedTaskDispatch(stepNative) && rootCollisionVerdict(stepNative, projectRoot, checkpointState.resume?.request_id ?? checkpointState.initial?.request_id, checkpointState.resume?.run_id ?? checkpointState.initial?.run_id, checkpointState.collision?.kind === "ok" ? checkpointState.collision.path : null).valid;
    stepResults[step] = validateNativeStep(definition, projectRoot, stepNative, step, checks, missing, failures, rootOnly, "A", expectedCheckpoint, artifacts);
  }
  if (definition.mode === "git" && definition.route === "full") {
    for (const [label, expected] of [["namespace-b-initial", bInitialExpected], ["namespace-b-resume", bResumeExpected]]) {
      const stepNative = matchingStepNative(native, label);
      stepResults[label] = validateNativeStep(definition, projectRoot, stepNative, label, checks, missing, failures, false, "B", expected?.kind === "ok" ? expected : null, artifacts);
    }
  }
  if (definition.mode === "git" && definition.route === "full") {
    const aInitialNative = matchingStepNative(native, "initial");
    const aResumeNative = matchingStepNative(native, "resume");
    const bInitialNative = matchingStepNative(native, "namespace-b-initial");
    const bResumeNative = matchingStepNative(native, "namespace-b-resume");
    const namespaceSessions = [aInitialNative, aResumeNative, bInitialNative, bResumeNative].map((item) => item?.root_session?.session_id ?? item?.host_observation?.root_session_id).filter(nonEmpty);
    if (namespaceSessions.length !== 4) recordCheck(checks, missing, failures, "cas.native.namespace-sessions", "PENDING", { reason: "A/B Root session captures are incomplete", observed: namespaceSessions.length });
    else if (new Set(namespaceSessions).size !== namespaceSessions.length) recordCheck(checks, missing, failures, "cas.native.namespace-sessions", "FAIL", { reason: "A/B namespace captures reused a Root session", sessions: namespaceSessions });
    else recordCheck(checks, missing, failures, "cas.native.namespace-sessions", "PASS", { sessions: namespaceSessions });
  }
  const gitReceipt = definition.mode === "git" ? validateGitReceipt(definition, projectRoot, artifacts, checkpointState, checks, missing, failures) : null;
  if (definition.mode === "git" && definition.route === "full") validateCasReceipt(definition, projectRoot, artifacts, checkpointState, gitReceipt?.commonDir ?? null, matchingStepNative(native, "collision"), checks, missing, failures);
  const status = failures.length ? "FAIL" : missing.length ? "PENDING" : "PASS";
  const trustedOrigin = trustedNativeOrigin(native, definition);
  const authentic = status === "PASS" && checks.every((check) => check.status === "PASS") && trustedOrigin;
  return {
    status,
    case: definition.id,
    contract: CONTRACT_VERSION,
    evidence_level: authentic ? "native-omp-rpc-route-and-artifact-evaluation" : status === "PASS" ? "SOURCE_DERIVED_OFFLINE_CONSUMER_ONLY" : "native-route-evaluation-pending",
    native: authentic,
    native_origin: authentic ? { kind: "host-observed-native-rpc", source: "host-rpc-process", steps: [...Object.keys(definition.steps).filter((step) => isObject(definition.steps[step])), ...(definition.mode === "git" && definition.route === "full" ? ["namespace-b-initial", "namespace-b-resume"] : [])] } : null,
    project_root: projectRoot,
    binding: clone(definition.binding),
    observed: {
      package_manifest_sha256: packageInfo?.manifestFile?.digest ?? null,
      package_manifest_digest: packageInfo?.manifestDigest ?? null,
      initial_request_id: checkpointState.initial?.request_id ?? null,
      initial_run_id: checkpointState.initial?.run_id ?? null,
      resume_request_id: checkpointState.resume?.request_id ?? null,
      resume_run_id: checkpointState.resume?.run_id ?? null,
      steps: Object.fromEntries(Object.entries(stepResults).map(([key, value]) => [key, value ? { terminal_id: value.record?.id ?? null, instance_id: value.record?.instanceId ?? value.record?.instance_id ?? null, job_id: value.record?.jobId ?? value.record?.job_id ?? null, structured: value.data ? { protocol: value.data.protocol, role: value.data.role, status: value.data.status, run_id: value.data.run_id, source_revision: value.data.source_revision } : null } : null])),
    },
    checks,
    missing,
    failures,
    artifact_policy: clone(definition.artifactPolicy),
    started_at: startedAt,
    finished_at: now(),
  };
}

export { inspectRouteCase, buildRouteTaskDescriptor };
