const REVIEW_MODES = Object.freeze([
  "PR",
  "BRANCH_BASE",
  "COMMIT",
  "CUSTOM",
  "UNCOMMITTED",
]);
const REVIEWER_AGENTS = Object.freeze(["deep-reviewer", "peer-reviewer"]);
const PROTOCOL_MODES = Object.freeze([
  "DEEP_REVIEW",
  "DEEP_REVIEW_FALLBACK",
  "TDD_PEER_REVIEW",
]);
const REMOTE_PATCH_KINDS = Object.freeze(["gh-pr-diff", "pr-uri"]);
const PATCH_SOURCE_KEYS = new Set(["kind", "uri", "sha", "head_sha", "head-sha", "content"]);
const CONSUMER_CONTEXT_KEYS = new Set(["revision", "files"]);
const LOCAL_CONTEXT_KEYS = Object.freeze({
  BRANCH_BASE: new Set([
    "mode", "revision", "base_ref", "head_ref", "base_revision", "head_revision", "diff",
  ]),
  COMMIT: new Set(["mode", "revision", "commit_ref", "commit_revision", "diff"]),
  CUSTOM: new Set(["mode", "revision", "instructions", "files", "diff", "restrictions", "excluded"]),
  UNCOMMITTED: new Set(["mode", "revision", "staged", "unstaged", "untracked"]),
});
const REQUEST_KEYS = new Set([
  "mode", "protocol_mode", "repository", "pull_request", "patch_source", "consumer_context",
  "local_revision_context", "expected_reviewers", "fallback_agent",
]);
const PR_REQUEST_KEYS = new Set([
  "mode", "protocol_mode", "repository", "pull_request", "patch_source", "consumer_context",
  "expected_reviewers", "fallback_agent",
]);
const LOCAL_REQUEST_KEYS = new Set([
  "mode", "protocol_mode", "local_revision_context", "expected_reviewers", "fallback_agent",
]);
const REVIEWER_RESULT_KEYS = new Set([
  "agent", "protocol_mode", "status", "reviewed_revision", "overall_correctness", "explanation", "confidence", "findings",
]);
const REVIEWER_RESULT_ENVELOPE_KEYS = new Set(["ok", "errors", "value"]);
const RESOLVER_REQUEST_KEYS = new Set(["projectCandidates", "userCandidates"]);
const FINDING_KEYS = new Set([
  "title", "body", "priority", "confidence", "file_path", "line_start", "line_end",
]);
const PRIORITIES = Object.freeze(["P0", "P1", "P2", "P3"]);
const LOCAL_REVIEW_MODES = new Set(REVIEW_MODES.filter((mode) => mode !== "PR"));
const REVIEWER_PRIORITY = Object.freeze([
  Object.freeze({ agent: "deep-reviewer", protocol_mode: "DEEP_REVIEW" }),
  Object.freeze({ agent: "peer-reviewer", protocol_mode: "DEEP_REVIEW_FALLBACK" }),
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function errorsResult(errors, value) {
  const normalizedErrors = [...new Set(errors.filter(nonEmptyString))];
  const output = {
    ok: normalizedErrors.length === 0,
    errors: normalizedErrors,
  };
  if (value !== undefined) {
    output.value = value;
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(output, key, {
        value: item,
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }
  } else {
    Object.defineProperty(output, "status", {
      value: "BLOCKED",
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
  return output;
}
function validResult(value) {
  return errorsResult([], value);
}
function blocked(...errors) {
  return errorsResult(errors);
}

function unknownKeys(value, allowed, prefix, { allowNonEnumerable = new Set() } = {}) {
  return Reflect.ownKeys(value).flatMap((key) => {
    if (typeof key === "symbol") return [`${prefix}.${String(key)} is not allowed`];
    const enumerable = Object.prototype.propertyIsEnumerable.call(value, key);
    if (!allowed.has(key) && !(allowNonEnumerable.has(key) && !enumerable)) {
      return [`${prefix}.${key} is not allowed`];
    }
    if (!enumerable && !allowNonEnumerable.has(key)) {
      return [`${prefix}.${key} must be an own enumerable property`];
    }
    return [];
  });
}

function unknownArrayKeys(value, prefix) {
  const errors = [];
  let ownIndexCount = 0;
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key === "symbol") {
      errors.push(`${prefix}.${String(key)} is not allowed`);
      continue;
    }
    const index = Number(key);
    const isIndex = Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
    if (!isIndex) {
      errors.push(`${prefix}.${key} is not allowed`);
      continue;
    }
    ownIndexCount += 1;
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) {
      errors.push(`${prefix}.${key} must be an own enumerable property`);
    }
  }
  if (ownIndexCount !== value.length) errors.push(`${prefix} must be a dense array without holes`);
  return errors;
}

function requireOwnEnumerable(value, fields, prefix, errors) {
  for (const field of fields) {
    if (!hasOwn(value, field) || !Object.prototype.propertyIsEnumerable.call(value, field)) {
      errors.push(`${prefix}.${field} must be an own enumerable property`);
    }
  }
}

function validateStringField(value, name, errors) {
  if (!nonEmptyString(value)) errors.push(`${name} must be a non-empty string`);
}
function validateStringArrayItems(value, name, errors) {
  for (const key of Object.keys(value)) {
    const index = Number(key);
    if (!nonEmptyString(value[index])) errors.push(`${name}[${index}] must be a non-empty string`);
  }
}


function validateStringFields(value, fields, prefix, errors) {
  for (const field of fields) validateStringField(value[field], `${prefix}.${field}`, errors);
}

function validateStringArray(value, name, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${name} must be a non-empty array`);
    return;
  }
  errors.push(...unknownArrayKeys(value, name));
  if (!allowEmpty && value.length === 0) {
    errors.push(`${name} must be a non-empty array`);
    return;
  }
  validateStringArrayItems(value, name, errors);
}
function patchSha(patch) {
  for (const key of ["sha", "head_sha", "head-sha"]) {
    if (nonEmptyString(patch[key])) return patch[key];
  }
  return undefined;
}

function validatePrUri(uri, repository, pullRequest, errors) {
  if (!nonEmptyString(uri)) {
    errors.push("patch_source.uri must be a non-empty pr:// URI");
    return;
  }
  const match = /^pr:\/\/([^/]+\/[^/]+)\/([1-9]\d*)\/diff\/.+$/.exec(uri);
  if (!match) {
    errors.push("patch_source.uri must match pr://owner/repo/<n>/diff/...");
    return;
  }
  if (match[1] !== repository || Number(match[2]) !== pullRequest) {
    errors.push("patch_source.uri must match repository and pull_request");
  }
}

function validatePatchSource(patch, repository, pullRequest, errors) {
  if (!isRecord(patch)) {
    errors.push("patch_source must be an object");
    return;
  }
  errors.push(...unknownKeys(patch, PATCH_SOURCE_KEYS, "patch_source"));
  requireOwnEnumerable(patch, ["kind", "content"], "patch_source", errors);
  if (!REMOTE_PATCH_KINDS.includes(patch.kind)) {
    errors.push("patch_source.kind must be gh-pr-diff or pr-uri");
  }
  if (patch.kind === "pr-uri") {
    if (!hasOwn(patch, "uri") || !Object.prototype.propertyIsEnumerable.call(patch, "uri")) {
      errors.push("patch_source.uri must be an own enumerable property");
    }
    validatePrUri(patch.uri, repository, pullRequest, errors);
  } else if (patch.kind === "gh-pr-diff" && hasOwn(patch, "uri")) {
    validatePrUri(patch.uri, repository, pullRequest, errors);
  }

  const suppliedShas = [];
  for (const key of ["sha", "head_sha", "head-sha"]) {
    if (!hasOwn(patch, key)) continue;
    if (!nonEmptyString(patch[key])) {
      errors.push(`patch_source.${key} must be a non-empty string`);
    } else {
      suppliedShas.push(patch[key]);
    }
  }
  if (suppliedShas.length === 0) {
    errors.push("patch_source.sha must be a non-empty revision");
  } else if (new Set(suppliedShas).size > 1) {
    errors.push("patch_source.sha, head_sha, and head-sha must all match");
  }
  if (!nonEmptyString(patch.content)) errors.push("patch_source.content must be non-empty");
}

function validateConsumerContext(context, expectedSha, errors) {
  if (!isRecord(context)) {
    errors.push("consumer_context must be an object");
    return;
  }
  errors.push(...unknownKeys(context, CONSUMER_CONTEXT_KEYS, "consumer_context"));
  requireOwnEnumerable(context, ["revision", "files"], "consumer_context", errors);
  validateStringField(context.revision, "consumer_context.revision", errors);
  if (context.revision !== expectedSha) errors.push("consumer_context.revision must match patch_source.sha");
  validateStringArray(context.files, "consumer_context.files", errors);
}

function validateLocalContext(mode, context, errors) {
  if (!isRecord(context)) {
    errors.push("local_revision_context must be an object");
    return;
  }
  requireOwnEnumerable(context, ["mode", "revision"], "local_revision_context", errors);
  if (context.mode !== mode) errors.push("local_revision_context.mode must match request.mode");
  validateStringField(context.revision, "local_revision_context.revision", errors);

  if (mode === "BRANCH_BASE") {
    errors.push(...unknownKeys(context, LOCAL_CONTEXT_KEYS.BRANCH_BASE, "local_revision_context"));
    requireOwnEnumerable(context, ["base_ref", "head_ref", "base_revision", "head_revision", "diff"], "local_revision_context", errors);
    validateStringFields(context, ["base_ref", "head_ref", "base_revision", "head_revision"], "local_revision_context", errors);
    if (context.revision !== context.head_revision) errors.push("local_revision_context.revision must match head_revision");
    if (!nonEmptyString(context.diff)) errors.push("local_revision_context.diff must be non-empty");
    return;
  }

  if (mode === "COMMIT") {
    errors.push(...unknownKeys(context, LOCAL_CONTEXT_KEYS.COMMIT, "local_revision_context"));
    requireOwnEnumerable(context, ["commit_ref", "commit_revision", "diff"], "local_revision_context", errors);
    validateStringFields(context, ["commit_ref", "commit_revision"], "local_revision_context", errors);
    if (context.revision !== context.commit_revision) errors.push("local_revision_context.revision must match commit_revision");
    if (!nonEmptyString(context.diff)) errors.push("local_revision_context.diff must be non-empty");
    return;
  }

  if (mode === "CUSTOM") {
    errors.push(...unknownKeys(context, LOCAL_CONTEXT_KEYS.CUSTOM, "local_revision_context"));
    requireOwnEnumerable(context, ["instructions", "files", "diff"], "local_revision_context", errors);
    validateStringField(context.instructions, "local_revision_context.instructions", errors);
    validateStringArray(context.files, "local_revision_context.files", errors);
    for (const field of ["restrictions", "excluded"]) {
      if (hasOwn(context, field)) {
        validateStringArray(context[field], `local_revision_context.${field}`, errors, { allowEmpty: true });
      }
    }
    if (typeof context.diff !== "string") errors.push("local_revision_context.diff must be a string");
    return;
  }

  errors.push(...unknownKeys(context, LOCAL_CONTEXT_KEYS.UNCOMMITTED, "local_revision_context"));
  requireOwnEnumerable(context, ["staged", "unstaged", "untracked"], "local_revision_context", errors);
  if (typeof context.staged !== "string") errors.push("local_revision_context.staged must be a string");
  if (typeof context.unstaged !== "string") errors.push("local_revision_context.unstaged must be a string");
  if (!Array.isArray(context.untracked)) {
    errors.push("local_revision_context.untracked must be an array");
  } else {
    errors.push(...unknownArrayKeys(context.untracked, "local_revision_context.untracked"));
    validateStringArrayItems(context.untracked, "local_revision_context.untracked", errors);
  }
  if (typeof context.staged === "string" && typeof context.unstaged === "string" &&
      Array.isArray(context.untracked) && context.staged.trim() === "" && context.unstaged.trim() === "" && context.untracked.length === 0) {
    errors.push("local_revision_context must contain staged, unstaged, or untracked changes");
  }
}

function validateRequest(request) {
  if (!isRecord(request)) return blocked("request must be an object");
  const errors = [];
  const mode = request.mode;
  requireOwnEnumerable(request, ["mode", "protocol_mode"], "request", errors);
  if (!REVIEW_MODES.includes(mode)) errors.push("mode must be PR, BRANCH_BASE, COMMIT, CUSTOM, or UNCOMMITTED");
  if (request.protocol_mode !== "DEEP_REVIEW") errors.push("protocol_mode must be DEEP_REVIEW");

  errors.push(...unknownKeys(request, REQUEST_KEYS, "request"));
  if (hasOwn(request, "expected_reviewers")) {
    validateStringArray(request.expected_reviewers, "expected_reviewers", errors);
    if (Array.isArray(request.expected_reviewers) &&
        request.expected_reviewers.some((agent) => !REVIEWER_AGENTS.includes(agent))) {
      errors.push("expected_reviewers may contain only named reviewer agents");
    }
  }
  if (hasOwn(request, "fallback_agent") && request.fallback_agent !== "peer-reviewer") {
    errors.push("fallback_agent must be peer-reviewer when provided");
  }

  if (mode === "PR") {
    errors.push(...unknownKeys(request, PR_REQUEST_KEYS, "request"));
    requireOwnEnumerable(request, ["repository", "pull_request", "patch_source", "consumer_context"], "request", errors);
    validateStringField(request.repository, "repository", errors);
    if (!Number.isInteger(request.pull_request) || request.pull_request < 1) errors.push("pull_request must be a positive integer");
    validatePatchSource(request.patch_source, request.repository, request.pull_request, errors);
    const sha = isRecord(request.patch_source) ? patchSha(request.patch_source) : undefined;
    validateConsumerContext(request.consumer_context, sha, errors);
    if (hasOwn(request, "local_revision_context")) errors.push("local_revision_context is forbidden in PR mode");
  } else if (LOCAL_REVIEW_MODES.has(mode)) {
    errors.push(...unknownKeys(request, LOCAL_REQUEST_KEYS, "request"));
    requireOwnEnumerable(request, ["local_revision_context"], "request", errors);
    if (hasOwn(request, "patch_source")) errors.push("patch_source is forbidden in local modes");
    if (hasOwn(request, "consumer_context")) errors.push("consumer_context is forbidden in local modes");
    if (hasOwn(request, "repository")) errors.push("repository is forbidden in local modes");
    if (hasOwn(request, "pull_request")) errors.push("pull_request is forbidden in local modes");
    validateLocalContext(mode, request.local_revision_context, errors);
  }

  if (errors.length > 0) return blocked(...errors);
  const context = mode === "PR" ? request.consumer_context : request.local_revision_context;
  const revision = mode === "PR" ? patchSha(request.patch_source) : context.revision;
  const value = {
    status: "VALID",
    mode,
    protocol_mode: request.protocol_mode,
    reviewed_revision: revision,
  };
  if (mode === "PR") {
    value.repository = request.repository;
    value.pull_request = request.pull_request;
    value.patch_source = { ...request.patch_source, sha: revision };
    delete value.patch_source.head_sha;
    delete value.patch_source["head-sha"];
    value.consumer_context = { ...request.consumer_context };
  } else {
    value.local_revision_context = { ...request.local_revision_context };
  }
  if (hasOwn(request, "expected_reviewers")) value.expected_reviewers = [...request.expected_reviewers];
  if (hasOwn(request, "fallback_agent")) value.fallback_agent = request.fallback_agent;
  return validResult(value);
}

function validateFinding(finding, index) {
  const prefix = `findings[${index}]`;
  if (!isRecord(finding)) return [`${prefix} must be an object`];
  const errors = [];
  for (const key of FINDING_KEYS) {
    if (!Object.prototype.propertyIsEnumerable.call(finding, key)) {
      errors.push(`${prefix}.${key} must be an own enumerable property`);
    }
  }
  errors.push(...unknownKeys(finding, FINDING_KEYS, prefix));
  if (!nonEmptyString(finding.title) || finding.title.trim().length > 80) errors.push(`${prefix}.title must be a non-empty string of at most 80 characters`);
  if (!nonEmptyString(finding.body)) errors.push(`${prefix}.body must be a non-empty string`);
  if (!Number.isInteger(finding.priority) || finding.priority < 0 || finding.priority > 3) errors.push(`${prefix}.priority must be an integer from 0 to 3`);
  if (typeof finding.confidence !== "number" || !Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) errors.push(`${prefix}.confidence must be a number from 0 to 1`);
  if (!nonEmptyString(finding.file_path)) errors.push(`${prefix}.file_path must be a non-empty string`);
  if (!Number.isInteger(finding.line_start) || finding.line_start < 1) errors.push(`${prefix}.line_start must be a positive integer`);
  if (!Number.isInteger(finding.line_end) || finding.line_end < 1) errors.push(`${prefix}.line_end must be a positive integer`);
  if (Number.isInteger(finding.line_start) && Number.isInteger(finding.line_end)) {
    if (finding.line_end < finding.line_start) errors.push(`${prefix}.line_end must not precede line_start`);
    if (finding.line_end - finding.line_start + 1 > 10) errors.push(`${prefix} line range must contain at most 10 lines`);
  }
  return errors;
}

function validateReviewerResult(result, expected) {
  const envelope = unwrapReviewerResult(result);
  if (envelope.errors.length > 0) return blocked(...envelope.errors);
  result = envelope.value;
  const errors = [];
  if (!isRecord(result)) return blocked("reviewer result must be an object");
  if (!isRecord(expected)) return blocked("expected reviewer identity must be an object");
  errors.push(...unknownKeys(result, REVIEWER_RESULT_KEYS, "reviewer result"));
  requireOwnEnumerable(result, ["agent", "protocol_mode", "status", "reviewed_revision", "overall_correctness", "explanation", "confidence"], "reviewer result", errors);
  if (!REVIEWER_AGENTS.includes(expected.agent)) errors.push("expected.agent must be a named reviewer agent");
  if (!PROTOCOL_MODES.includes(expected.protocol_mode)) errors.push("expected.protocol_mode is invalid");
  if (!nonEmptyString(expected.reviewed_revision)) errors.push("expected.reviewed_revision must be a non-empty revision");
  if (result.status !== "VALID") errors.push("reviewer status must be VALID");
  if (result.reviewed_revision !== expected.reviewed_revision) errors.push("reviewer revision does not match expected reviewed_revision");
  if (!nonEmptyString(result.explanation)) errors.push("explanation must be a non-empty string");
  if (result.agent !== expected.agent) errors.push("reviewer agent identity does not match expected agent");
  if (result.protocol_mode !== expected.protocol_mode) errors.push("reviewer protocol_mode does not match expected protocol_mode");
  if (!["correct", "incorrect"].includes(result.overall_correctness)) {
    errors.push("overall_correctness must be correct or incorrect");
  }
  const findings = hasOwn(result, "findings") ? result.findings : [];
  if (!Array.isArray(findings)) {
    errors.push("findings must be an array");
  } else {
    errors.push(...unknownArrayKeys(findings, "findings"));
    for (const key of Object.keys(findings)) {
      const index = Number(key);
      errors.push(...validateFinding(findings[index], index));
    }
  }
  const expectedPair = REVIEWER_PRIORITY.find(({ agent }) => agent === result.agent);
  if (expectedPair && result.protocol_mode !== expectedPair.protocol_mode) {
    errors.push(`${result.agent} must use ${expectedPair.protocol_mode}`);
  }
  if (typeof result.confidence !== "number" || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) errors.push("confidence must be a number from 0 to 1");

  if (errors.length > 0) return blocked(...errors);

  const value = {
    agent: result.agent,
    protocol_mode: result.protocol_mode,
    status: "VALID",
    reviewed_revision: result.reviewed_revision,
    overall_correctness: result.overall_correctness,
    explanation: result.explanation,
    confidence: result.confidence,
    findings: findings.map((finding) => ({ ...finding })),
  };
  return validResult(value);
}
function unwrapReviewerResult(result) {
  if (!isRecord(result) || !hasOwn(result, "ok")) return { value: result, errors: [] };

  const allowNonEnumerable = new Set(REVIEWER_RESULT_KEYS);
  if (
    result.ok === false
    && hasOwn(result, "status")
    && !hasOwn(result, "value")
    && result.status === "BLOCKED"
  ) {
    allowNonEnumerable.add("status");
  }
  const envelopeErrors = unknownKeys(result, REVIEWER_RESULT_ENVELOPE_KEYS, "reviewer result envelope", {
    allowNonEnumerable,
  });
  for (const key of Object.getOwnPropertyNames(result)) {
    if (REVIEWER_RESULT_ENVELOPE_KEYS.has(key)) continue;
    if (Object.prototype.propertyIsEnumerable.call(result, key)) continue;

    if (
      result.ok === false
      && key === "status"
      && !hasOwn(result, "value")
      && result[key] === "BLOCKED"
    ) {
      continue;
    }
    if (!REVIEWER_RESULT_KEYS.has(key)) {
      envelopeErrors.push(`reviewer result envelope.${key} is not allowed`);
      continue;
    }
    if (!hasOwn(result, "value") || !isRecord(result.value) || !hasOwn(result.value, key)) {
      envelopeErrors.push(`reviewer result envelope.${key} is not a documented value projection`);
      continue;
    }
    if (!Object.is(result[key], result.value[key])) {
      envelopeErrors.push(`reviewer result envelope.${key} must match value.${key}`);
    }
  }

  const envelopeSymbols = Object.getOwnPropertySymbols(result);
  for (const symbol of envelopeSymbols) {
    if (Object.prototype.propertyIsEnumerable.call(result, symbol)) {
      envelopeErrors.push(`reviewer result envelope.${String(symbol)} is not allowed`);
    }
  }

  if (typeof result.ok !== "boolean") {
    envelopeErrors.push("reviewer result envelope.ok must be boolean");
  }
  if (!hasOwn(result, "errors")) {
    envelopeErrors.push("reviewer result envelope.errors is required");
  } else if (!Array.isArray(result.errors)) {
    envelopeErrors.push("reviewer result envelope.errors must be an array");
  } else {
    envelopeErrors.push(...unknownArrayKeys(result.errors, "reviewer result envelope.errors"));
    validateStringArrayItems(result.errors, "reviewer result envelope.errors", envelopeErrors);
  }
  if (envelopeErrors.length > 0) {
    if (Array.isArray(result.errors)) envelopeErrors.push(...result.errors.filter(nonEmptyString));
    return { value: undefined, errors: envelopeErrors };
  }
  if (result.ok === true && result.errors.length > 0) return { value: undefined, errors: result.errors };

  if (result.ok === false) {
    return {
      value: undefined,
      errors: result.errors.length > 0 ? result.errors : ["reviewer result envelope is BLOCKED"],
    };
  }
  if (!hasOwn(result, "value") || !isRecord(result.value)) {
    return { value: undefined, errors: ["reviewer result envelope.value must be an object"] };
  }
  return { value: result.value, errors: [] };
}



function aggregateReview(results, expectedRevision, expectedReviewers) {
  if (!Array.isArray(expectedReviewers) || expectedReviewers.length === 0) {
    return blocked("expectedReviewers must be an explicit non-empty array");
  }
  const expectedErrors = [];
  expectedErrors.push(...unknownArrayKeys(expectedReviewers, "expectedReviewers"));
  validateStringArrayItems(expectedReviewers, "expectedReviewers", expectedErrors);
  if (expectedReviewers.some((agent) => !REVIEWER_AGENTS.includes(agent))) {
    expectedErrors.push("expectedReviewers may contain only named reviewer agents");
  }
  if (new Set(expectedReviewers).size !== expectedReviewers.length) {
    expectedErrors.push("expectedReviewers must not contain duplicates");
  }
  if (expectedErrors.length > 0) return blocked(...expectedErrors);
  if (!Array.isArray(results) || results.length === 0) return blocked("results must be a non-empty array");
  const resultsArrayErrors = unknownArrayKeys(results, "results");
  if (resultsArrayErrors.length > 0) return blocked(...resultsArrayErrors);
  if (!nonEmptyString(expectedRevision)) return blocked("expectedRevision must be a non-empty revision");

  const expectedSet = new Set(expectedReviewers);
  const errors = [];
  const normalized = [];
  const actualAgents = [];
  for (const [index, raw] of results.entries()) {
    const envelope = unwrapReviewerResult(raw);
    if (envelope.errors.length > 0) {
      errors.push(...envelope.errors);
      continue;
    }
    const result = envelope.value;
    if (!isRecord(result)) {
      errors.push(`reviewers[${index}] must be a VALID normalized reviewer result`);
      continue;
    }
    const actualAgent = result.agent;
    if (nonEmptyString(actualAgent)) actualAgents.push(actualAgent);
    const expectedPair = REVIEWER_PRIORITY.find(({ agent }) => agent === actualAgent);
    if (!expectedPair) {
      errors.push(`reviewers[${index}] has an invalid reviewer agent`);
      continue;
    }
    if (!expectedSet.has(actualAgent)) {
      errors.push(`reviewers[${index}] contains an unexpected reviewer: ${actualAgent}`);
      continue;
    }
    const checked = validateReviewerResult(result, {
      agent: expectedPair.agent,
      reviewed_revision: expectedRevision,
      protocol_mode: expectedPair.protocol_mode,
    });
    if (!checked.ok) {
      errors.push(...checked.errors.map((error) => `reviewers[${index}]: ${error}`));
      continue;
    }
    normalized.push(checked.value);
  }

  const actualSet = new Set(actualAgents);
  for (const expectedAgent of expectedReviewers) {
    if (!actualSet.has(expectedAgent)) errors.push(`missing expected reviewer: ${expectedAgent}`);
  }
  for (const actualAgent of actualSet) {
    if (!expectedSet.has(actualAgent)) errors.push(`unexpected reviewer: ${actualAgent}`);
  }
  for (const agent of actualSet) {
    if (actualAgents.filter((item) => item === agent).length > 1) {
      errors.push(`duplicate reviewer: ${agent}`);
    }
  }
  if (errors.length > 0 || normalized.length !== results.length) {
    if (normalized.length !== results.length) errors.push("one or more reviewer results are invalid");
    return blocked(...errors);
  }
  if (new Set(normalized.map((result) => result.protocol_mode)).size > 1) {
    return blocked("reviewers must use a single protocol_mode");
  }

  const findings = normalized.flatMap((result) => result.findings.map((finding) => ({ ...finding })));
  const counts = Object.fromEntries(PRIORITIES.map((priority) => [priority, 0]));
  for (const finding of findings) counts[`P${finding.priority}`] += 1;
  const blockers = findings.filter((finding) => finding.priority === 0 || finding.priority === 1);
  const reviewers = normalized.map((result) => result.agent);
  const fallbackAgents = new Set(reviewers.filter((agent) => agent === "peer-reviewer"));
  const protocol_mode = normalized[0].protocol_mode;
  const value = {
    status: blockers.length > 0 ? "BLOCKED" : "APPROVED",
    protocol_mode,
    reviewed_revision: expectedRevision,
    blockers,
    findings,
    counts,
    reviewers,
    fallback_agent: fallbackAgents.size > 0 ? "peer-reviewer" : "",
  };
  return validResult(value);
}

function resolveReviewer(input = {}) {
  if (!isRecord(input)) return blocked("reviewer candidates input must be an object");
  const errors = [];
  errors.push(...unknownKeys(input, RESOLVER_REQUEST_KEYS, "reviewer candidates"));
  requireOwnEnumerable(input, ["projectCandidates", "userCandidates"], "reviewer candidates", errors);
  const { projectCandidates, userCandidates } = input;
  if (!Array.isArray(projectCandidates) || !Array.isArray(userCandidates)) {
    errors.push("projectCandidates and userCandidates must be arrays");
    return blocked(...errors);
  }
  errors.push(...unknownArrayKeys(projectCandidates, "reviewer candidates.projectCandidates"));
  errors.push(...unknownArrayKeys(userCandidates, "reviewer candidates.userCandidates"));
  for (const [name, candidates] of [["projectCandidates", projectCandidates], ["userCandidates", userCandidates]]) {
    for (const [index, candidate] of candidates.entries()) {
      if (!nonEmptyString(candidate)) errors.push(`${name}[${index}] must be a non-empty string`);
      else if (!REVIEWER_AGENTS.includes(candidate)) errors.push(`${name}[${index}] must be a named reviewer agent`);
    }
  }
  if (errors.length > 0) return blocked(...errors);

  if ([projectCandidates, userCandidates].some((candidates) => candidates.includes("deep-reviewer"))) {
    return validResult({
      agent: "deep-reviewer",
      protocol_mode: "DEEP_REVIEW",
      schema: "deep-review",
      blockingPriorities: [0, 1],
    });
  }
  if ([projectCandidates, userCandidates].some((candidates) => candidates.includes("peer-reviewer"))) {
    return validResult({
      agent: "peer-reviewer",
      protocol_mode: "DEEP_REVIEW_FALLBACK",
      schema: "deep-review",
      blockingPriorities: [0, 1],
    });
  }
  return blocked("no named deep-reviewer or peer-reviewer is available");
}


export {
  aggregateReview,
  resolveReviewer,
  validateRequest,
  validateReviewerResult,
};
