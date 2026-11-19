#!/usr/bin/env node
// Source-only RED probe for T-011 / AC-016.
//
// This probe exercises the current technical-retry and route-matrix consumers
// through temporary export-only seams. It never starts OMP/SDK, a shell,
// network, Git, Native execution, or a product command. All generated seams
// and fixtures stay below --root. Existing probes are intentionally untouched.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_SOURCE = path.join(SOURCE_DIR, "lifecycle.mjs");
const DEFAULT_RETRY_SOURCE = path.join(SOURCE_DIR, "technical-retry-scenario.mjs");
const DEFAULT_ROUTE_SOURCE = path.join(SOURCE_DIR, "route-matrix.mjs");
const DEFAULT_ROOT = path.resolve(SOURCE_DIR, "../../.test-temp/terminal-consumer-authority-red");
const SHA256 = /^[a-f0-9]{64}$/i;
const RUN_ID = "terminal-consumer-authority-red-run";
const ROOT_SESSION_ID = "terminal-consumer-authority-red-root";
const ROOT_CALL_ID = "terminal-consumer-authority-red-task";
const ALLOCATED_ID = "terminal-consumer-authority-red-child";
const ASSIGNMENT = "TerminalConsumerAuthorityPeer";
const CUSTOM_JOB_ID = "terminal-consumer-authority-red-sdk-job";
const HOST_JOB_ID = "terminal-consumer-authority-red-host-job";
const HOST_INSTANCE_ID = "terminal-consumer-authority-red-host-instance";
const WAIT_JOB_ID = "terminal-consumer-authority-red-wait-job";
const A_SHA = "a".repeat(64);
const B_SHA = "b".repeat(64);
const C_SHA = "c".repeat(64);

const ROUTE_RUN_ID = "11111111-1111-4111-8111-111111111111";
const ROUTE_REVISION = "terminal-consumer-authority-route-revision";
const ROUTE_NONCE = "terminal-consumer-authority-route-nonce";
function validateSha(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${name} must be a SHA-256 hex string`);
  return value.toLowerCase();
}

function parseArgs(argv) {
  const allowed = new Set([
    "source",
    "retry-source",
    "route-source",
    "root",
    "expected-source-sha",
    "expected-retry-sha",
    "expected-route-sha",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`unknown option --${key}`);
    if (values.has(key)) throw new Error(`duplicate option --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    values.set(key, value);
    index += 1;
  }
  const expectedSourceSha = values.get("expected-source-sha");
  const expectedRetrySha = values.get("expected-retry-sha");
  const expectedRouteSha = values.get("expected-route-sha");
  if (expectedSourceSha === undefined) throw new Error("missing value for --expected-source-sha");
  if (expectedRetrySha === undefined) throw new Error("missing value for --expected-retry-sha");
  if (expectedRouteSha === undefined) throw new Error("missing value for --expected-route-sha");
  return {
    source: path.resolve(values.get("source") ?? DEFAULT_SOURCE),
    retrySource: path.resolve(values.get("retry-source") ?? DEFAULT_RETRY_SOURCE),
    routeSource: path.resolve(values.get("route-source") ?? DEFAULT_ROUTE_SOURCE),
    root: path.resolve(values.get("root") ?? DEFAULT_ROOT),
    expectedSourceSha: validateSha(expectedSourceSha, "--expected-source-sha"),
    expectedRetrySha: validateSha(expectedRetrySha, "--expected-retry-sha"),
    expectedRouteSha: validateSha(expectedRouteSha, "--expected-route-sha"),
  };
}

function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function makeExportOnlySeams(options) {
  const seamDir = path.join(options.root, "source-overlay", "implementation-evidence", "native-release");
  fs.mkdirSync(seamDir, { recursive: true });

  const actualSourceSha = sha256File(options.source);
  const actualRetrySha = sha256File(options.retrySource);
  const actualRouteSha = sha256File(options.routeSource);
  assert.equal(actualSourceSha, options.expectedSourceSha, "lifecycle production source must match the explicit pin");
  assert.equal(actualRetrySha, options.expectedRetrySha, "technical-retry production source must match the explicit pin");
  assert.equal(actualRouteSha, options.expectedRouteSha, "route-matrix production source must match the explicit pin");

  const exportedNames = (sourceText) => {
    const names = new Set();
    for (const match of sourceText.matchAll(/\bexport\s*\{([\s\S]*?)\}/g)) {
      for (const specifier of match[1].split(",")) {
        const exported = specifier.trim().split(/\s+as\s+/).at(-1)?.trim();
        if (/^[A-Za-z_$][\w$]*$/.test(exported)) names.add(exported);
      }
    }
    for (const match of sourceText.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
      names.add(match[1]);
    }
    return names;
  };

  const appendMissingExports = (sourceText, names) => {
    const missing = names.filter((name) => !exportedNames(sourceText).has(name));
    return missing.length
      ? `${sourceText}\n\n// TEMP export-only seam; never part of the product.\nexport { ${missing.join(", ")} };\n`
      : sourceText;
  };

  const retrySource = fs.readFileSync(options.retrySource, "utf8");
  const retrySeam = path.join(seamDir, "technical-retry-scenario.mjs");
  fs.writeFileSync(
    retrySeam,
    appendMissingExports(retrySource, ["normalizeTerminal", "immutableEvidence", "inspectTechnicalRetryScenario"]),
    "utf8",
  );

  const routeSource = fs.readFileSync(options.routeSource, "utf8");
  const routeSeam = path.join(seamDir, "route-matrix.mjs");
  fs.writeFileSync(routeSeam, appendMissingExports(routeSource, ["validateRequirementsTerminal"]), "utf8");
  return { actualSourceSha, actualRetrySha, actualRouteSha, retrySeam, routeSeam };
}

async function loadConsumers(options) {
  const seams = makeExportOnlySeams(options);
  const retry = await import(`${pathToFileURL(seams.retrySeam).href}?probe=terminal-authority-retry`);
  const route = await import(`${pathToFileURL(seams.routeSeam).href}?probe=terminal-authority-route`);
  for (const name of ["normalizeTerminal", "immutableEvidence", "inspectTechnicalRetryScenario", "isAuthoritativeTaskRecord", "taskRecordSucceeded"]) {
    assert.equal(typeof retry[name], "function", `retry export-only seam must expose ${name}`);
  }
  assert.equal(typeof route.validateRequirementsTerminal, "function", "route export-only seam must expose the actual terminal consumer");
  return { ...seams, retry, route };
}

function validSchemaData() {
  return {
    protocol_mode: "TDD_PEER_REVIEW",
    status: "APROVADO",
    reviewed_revision: "terminal-consumer-authority-red-revision",
  };
}

function makeCustomRecord({ agent = "validator", structured = true, independent = false } = {}) {
  const schemaData = validSchemaData();
  const schema = { source: "agent", mode: "strict", status: "valid", data: schemaData };
  const hostBinding = {
    source: "observed-root-dispatch-lifecycle",
    root_session_id: ROOT_SESSION_ID,
    parent_tool_call_id: ROOT_CALL_ID,
    allocated_id: ALLOCATED_ID,
    index: 0,
    agent,
    agentSource: "project",
    assignment: ASSIGNMENT,
    job_id: HOST_JOB_ID,
    instance_id: HOST_INSTANCE_ID,
    root_task_end_is_error: false,
  };
  const job = {
    jobId: CUSTOM_JOB_ID,
    type: "task",
    status: "completed",
    agentId: ALLOCATED_ID,
  };
  if (structured) job.schema = schema;
  return {
    source_kind: "task_async_result",
    id: ALLOCATED_ID,
    allocated_id: ALLOCATED_ID,
    parent_tool_call_id: ROOT_CALL_ID,
    index: 0,
    agent,
    agentSource: "project",
    assignment_id: ASSIGNMENT,
    run_id: RUN_ID,
    revision: "terminal-consumer-authority-red-revision",
    jobId: HOST_JOB_ID,
    instanceId: HOST_INSTANCE_ID,
    status: "completed",
    exitCode: null,
    exit_code_observed: false,
    isError: null,
    is_error_observed: false,
    error: null,
    error_observed: false,
    aborted: null,
    aborted_observed: false,
    root_session_id: ROOT_SESSION_ID,
    host_workflow_ordinal: 1,
    structured_output_status: structured ? "valid" : null,
    structured_data: structured ? schemaData : null,
    ...(independent ? { independent_evidence: { observed: true, source: "independent-bash-file-role" } } : {}),
    async_result: {
      source: "message_end.custom.async-result",
      host_workflow_ordinal: 1,
      job,
      host_binding: hostBinding,
    },
  };
}

function makeWaitRecord({ agent = "validator", structured = true, independent = false, status = "completed", assignment = ASSIGNMENT, structuredData = null, runId = RUN_ID, revision = "terminal-consumer-authority-red-revision" } = {}) {
  const schemaData = structuredData ?? validSchemaData();
  const schema = { source: "agent", mode: "strict", status: "valid", data: schemaData };
  const job = {
    id: WAIT_JOB_ID,
    type: "task",
    status,
    label: assignment,
    durationMs: 1,
    settledAtMs: 1700000000001,
    agentUrlId: ALLOCATED_ID,
    agentOutputPublished: true,
  };
  if (structured) job.structured = schema;
  const hostBinding = {
    source: "observed-root-dispatch-lifecycle",
    root_session_id: ROOT_SESSION_ID,
    parent_tool_call_id: ROOT_CALL_ID,
    allocated_id: ALLOCATED_ID,
    index: 0,
    agent,
    agentSource: "project",
    assignment,
    job_id: HOST_JOB_ID,
    instance_id: HOST_INSTANCE_ID,
    root_task_end_is_error: false,
  };
  return {
    source_kind: "task_wait_result",
    id: ALLOCATED_ID,
    allocated_id: ALLOCATED_ID,
    parent_tool_call_id: ROOT_CALL_ID,
    index: 0,
    agent,
    agentSource: "project",
    assignment_id: assignment,
    run_id: runId,
    revision,
    root_session_id: ROOT_SESSION_ID,
    jobId: WAIT_JOB_ID,
    instanceId: HOST_INSTANCE_ID,
    status,
    exitCode: null,
    exit_code_observed: false,
    isError: null,
    is_error_observed: false,
    error: null,
    error_observed: false,
    aborted: null,
    aborted_observed: false,
    host_workflow_ordinal: 1,
    structured_output_status: structured ? "valid" : null,
    structured_data: structured ? schemaData : null,
    ...(independent ? { independent_evidence: { observed: true, source: "independent-bash-file-role" } } : {}),
    wait_result: {
      source: "tool_execution_end.result.details.jobs",
      tool: "wait",
      tool_call_id: "terminal-consumer-authority-red-wait-call",
      host_workflow_ordinal: 1,
      is_error: false,
      is_error_observed: true,
      job,
      host_binding: hostBinding,
    },
  };
}
function makeRetryWaitRecord(definition, assignment, { jobId, hostJobId, hostInstanceId } = {}) {
  const sdkJobId = jobId ?? `${assignment}-sdk-job`;
  const domainJobId = hostJobId ?? `${assignment}-host-job`;
  const domainInstanceId = hostInstanceId ?? `${assignment}-host-instance`;
  const record = makeWaitRecord({
    agent: "validator",
    assignment,
    runId: definition.run_id,
    revision: definition.revision,
  });
  record.revision = definition.revision;
  record.jobId = sdkJobId;
  record.instanceId = domainInstanceId;
  record.wait_result.job.id = sdkJobId;
  record.wait_result.host_binding.job_id = domainJobId;
  record.wait_result.host_binding.instance_id = domainInstanceId;
  return record;
}

function makeRequirementsCustomRecord(definition) {
  const assignment = definition.assignment.initial;
  const data = requirementsReaderResult(definition);
  const record = makeCustomRecord({ agent: "requirements-reader" });
  record.assignment_id = assignment;
  record.run_id = definition.binding.run_id;
  record.revision = definition.binding.revision;
  record.structured_data = data;
  record.async_result.job.label = assignment;
  record.async_result.job.schema.data = data;
  record.async_result.host_binding.assignment = assignment;
  return record;
}

function makeInlineRecord({ status = "completed", exitCode = 0 } = {}) {
  return {
    source_kind: "task_tool_details",
    id: ALLOCATED_ID,
    allocated_id: ALLOCATED_ID,
    parent_tool_call_id: ROOT_CALL_ID,
    index: 0,
    agent: "requirements-reader",
    agentSource: "project",
    assignment_id: ASSIGNMENT,
    run_id: RUN_ID,
    revision: "terminal-consumer-authority-red-revision",
    jobId: HOST_JOB_ID,
    instanceId: HOST_INSTANCE_ID,
    status,
    exitCode,
    exit_code_observed: true,
    isError: false,
    is_error_observed: true,
    is_error_source: "host-derived SingleResult.exitCode/error/aborted",
    error: null,
    error_observed: false,
    aborted: null,
    aborted_observed: false,
    root_session_id: ROOT_SESSION_ID,
    host_workflow_ordinal: 1,
    structured_output_status: "valid",
    structured_data: validSchemaData(),
  };
}


function routeDefinition(apis) {
  const definition = apis.route.buildRouteCases({
    runId: ROUTE_RUN_ID,
    revision: ROUTE_REVISION,
    nonce: ROUTE_NONCE,
  }).find((item) => item.id === "SHORT_LOCAL");
  assert.ok(definition, "route fixture must use a canonical route definition");
  return definition;
}

function requirementsReaderResult(definition) {
  const assignment = definition.assignment.initial;
  return {
    protocol: "REQUIREMENTS_READING_V1",
    role: "requirements-reader",
    status: "COMPLETE",
    instance_id: `${ROOT_SESSION_ID}:${assignment}`,
    run_id: definition.binding.run_id,
    source_revision: definition.binding.revision,
    context_digest: "d".repeat(64),
    sources: [],
    next_action: "NO_ACTION",
    paraphrase: "Requirements are complete for the route consumer.",
    success_criteria: ["terminal authority"],
    scenarios_and_limits: ["terminal-only consumer probe"],
    ambiguities: [],
  };
}

function makeRequirementsWaitRecord(definition) {
  return makeWaitRecord({
    agent: "requirements-reader",
    assignment: definition.assignment.initial,
    structuredData: requirementsReaderResult(definition),
    runId: definition.binding.run_id,
    revision: definition.binding.revision,
  });
}

function routeTerminalObservation(taskRecords, hostDomain = {}) {
  const jobId = hostDomain.job_id ?? HOST_JOB_ID;
  const instanceId = hostDomain.instance_id ?? HOST_INSTANCE_ID;
  return {
    task_records: taskRecords,
    root_session: { session_id: ROOT_SESSION_ID },
    terminal: { root_task_end: { isError: false } },
    subagent_frames: [{
      type: "subagent_lifecycle",
      id: ALLOCATED_ID,
      allocated_id: ALLOCATED_ID,
      parent_tool_call_id: ROOT_CALL_ID,
      index: 0,
      agent: "requirements-reader",
      agentSource: "project",
      job_id: jobId,
      instance_id: instanceId,
    }],
  };
}

function validateRouteTerminal(apis, definition, taskRecords, hostDomain) {
  const checks = [];
  const missing = [];
  const failures = [];
  const result = apis.route.validateRequirementsTerminal(
    definition,
    SOURCE_DIR,
    routeTerminalObservation(taskRecords, hostDomain),
    "initial",
    checks,
    missing,
    failures,
  );
  return { result, checks, missing, failures };
}

function caseNormalizeTerminalExactAliases(apis) {
  const exact = apis.retry.normalizeTerminal({
    terminal_end: {
      type: "tool_execution_end",
      assignment_id: " exact-assignment ",
      run_id: " exact-run ",
      revision: " exact-revision ",
      job_id: " exact-job ",
      instance_id: " exact-instance ",
    },
  });
  assert.equal(exact.assignment_id, " exact-assignment ", "normalization must not trim an observed assignment alias");
  assert.equal(exact.run_id, " exact-run ", "normalization must not trim an observed run alias");
  assert.equal(exact.revision, " exact-revision ", "normalization must not trim an observed revision alias");
  assert.equal(exact.job_id, " exact-job ", "normalization must not trim an observed job alias");
  assert.equal(exact.instance_id, " exact-instance ", "normalization must not trim an observed instance alias");

  const objectAlias = apis.retry.normalizeTerminal({ terminal_end: { type: "tool_execution_end", assignment_id: { value: ASSIGNMENT } } });
  assert.equal(objectAlias.assignment_id, null, "an object alias must not be stringified into terminal identity");

  const reportOnly = apis.retry.normalizeTerminal({
    terminal_end: { type: "tool_execution_end", report: { assignment_id: "report-only-assignment" } },
  });
  assert.equal(reportOnly.assignment_id, null, "report-family identity must not be conflated with the terminal-family assignment");

  const splitFamilies = apis.retry.normalizeTerminal({
    record: { assignment_id: "record-family-assignment", run_id: "record-family-run" },
    terminal_end: { type: "tool_execution_end", job_id: "terminal-family-job" },
  });
  assert.equal(splitFamilies.assignment_id, null, "record and terminal envelopes must not be merged into one authoritative tuple");
  assert.equal(splitFamilies.run_id, null, "record and terminal envelopes must not cross-fill unrelated identity aliases");
}

function caseChangedPathsCannotApproveDifferentHashes(apis) {
  const differing = apis.retry.immutableEvidence({
    immutable_package: {
      manifest_verified: true,
      changed_paths: [],
      before_sha256: A_SHA,
      after_sha256: B_SHA,
    },
  });
  assert.equal(differing.unchanged, false, "an empty changed_paths list cannot approve differing before/after package hashes");

  const absentHashes = apis.retry.immutableEvidence({
    immutable_package: { manifest_verified: true, changed_paths: [] },
  });
  assert.equal(absentHashes.unchanged, false, "changed_paths[] without independently observed hashes cannot approve preservation");

  const listedChange = apis.retry.immutableEvidence({
    immutable_package: {
      manifest_verified: true,
      changed_paths: ["alignment/SKILL.md"],
      before_sha256: C_SHA,
      after_sha256: C_SHA,
    },
  });
  assert.equal(listedChange.unchanged, false, "a non-empty changed_paths list cannot approve preservation even when hashes are equal");

  const unchanged = apis.retry.immutableEvidence({
    immutable_package: { manifest_verified: true, before_sha256: C_SHA, after_sha256: C_SHA },
  });
  assert.equal(unchanged.unchanged, true, "equal independently observed hashes with no change list remain a valid unchanged positive");
}

function caseStructuredlessPolicy(apis) {
  const customUnauthorized = makeCustomRecord({ agent: "peer-reviewer", structured: false, independent: true });
  assert.equal(apis.retry.isAuthoritativeTaskRecord(customUnauthorized), true, "the custom negative must be authoritative before success policy is evaluated");
  assert.equal(apis.retry.taskRecordSucceeded(customUnauthorized), false, "custom structured-less output is not success for an unauthorized role");

  const customValidatorWithoutEvidence = makeCustomRecord({ agent: "validator", structured: false, independent: false });
  assert.equal(apis.retry.taskRecordSucceeded(customValidatorWithoutEvidence), false, "validator structured-less output requires independent evidence");

  const customValidatorWithEvidence = makeCustomRecord({ agent: "validator", structured: false, independent: true });
  assert.equal(apis.retry.taskRecordSucceeded(customValidatorWithEvidence), true, "validator structured-less output succeeds only with independent evidence");

  const customSpecAuthorWithEvidence = makeCustomRecord({ agent: "spec-kit-author", structured: false, independent: true });
  assert.equal(apis.retry.taskRecordSucceeded(customSpecAuthorWithEvidence), true, "spec-kit-author structured-less output succeeds only with independent evidence");

  const waitUnauthorized = makeWaitRecord({ agent: "peer-reviewer", structured: false, independent: true });
  assert.equal(apis.retry.taskRecordSucceeded(waitUnauthorized), false, "wait structured-less output must use the same role policy as custom async");

  const waitValidatorWithoutEvidence = makeWaitRecord({ agent: "validator", structured: false, independent: false });
  assert.equal(apis.retry.taskRecordSucceeded(waitValidatorWithoutEvidence), false, "wait validator structured-less output requires independent evidence");

  const waitValidatorWithEvidence = makeWaitRecord({ agent: "validator", structured: false, independent: true });
  assert.equal(apis.retry.taskRecordSucceeded(waitValidatorWithEvidence), true, "wait validator structured-less output succeeds with independent evidence");

  const waitSpecAuthorWithEvidence = makeWaitRecord({ agent: "spec-kit-author", structured: false, independent: true });
  assert.equal(apis.retry.taskRecordSucceeded(waitSpecAuthorWithEvidence), true, "wait spec-kit-author structured-less output succeeds with independent evidence");
}

function caseCustomHostBinding(apis) {
  const valid = makeCustomRecord({ agent: "validator", structured: true });
  assert.equal(apis.retry.isAuthoritativeTaskRecord(valid), true, "a custom terminal with the complete host binding is authoritative");
  assert.equal(apis.retry.taskRecordSucceeded(valid), true, "the complete custom host binding permits a valid structured terminal");

  const missingFields = ["agent", "agentSource", "assignment", "job_id", "instance_id"];
  for (const field of missingFields) {
    const candidate = structuredClone(valid);
    delete candidate.async_result.host_binding[field];
    assert.equal(apis.retry.isAuthoritativeTaskRecord(candidate), false, `custom host_binding.${field} is required`);
  }

  const mismatches = {
    agent: "peer-reviewer",
    agentSource: "user",
    assignment: "foreign-assignment",
    job_id: "foreign-host-job",
    instance_id: "foreign-host-instance",
  };
  for (const [field, value] of Object.entries(mismatches)) {
    const candidate = structuredClone(valid);
    candidate.async_result.host_binding[field] = value;
    assert.equal(apis.retry.isAuthoritativeTaskRecord(candidate), false, `custom host_binding.${field} must match the observed host tuple`);
  }
}

function retryDefinition() {
  return {
    scenario_id: "terminal-consumer-authority-native-unknown",
    run_id: RUN_ID,
    assignment_id: ASSIGNMENT,
    revision: "terminal-consumer-authority-red-revision",
    nonce: "terminal-consumer-authority-red-nonce",
    command: "node app/.omp/state/native-tooling/retry-check.mjs",
    workload: { run_id: RUN_ID, revision: "terminal-consumer-authority-red-revision", source: "app/bin/quality.mjs", test: "authority" },
    roles: {
      first_validator: { name: "Native09FirstValidator" },
      second_validator: { name: "Native09SecondValidator" },
    },
    immutable_original: { subjects: { cli: { sha256: A_SHA } } },
    mutable_application: { before_hashes: { dependency: { sha256: B_SHA }, validator: { sha256: C_SHA } } },
    write_policy: { allowed_write_globs: ["app/bin/quality.mjs"] },
  };
}

function caseNativeUnknownMustBlock(apis) {
  const definition = retryDefinition();
  const variants = [
    ["unknown authority", { native: true, definition, first: {}, second: {} }],
    ["unknown identity", {
      native: true,
      definition,
      first: { terminal_end: { type: "tool_execution_end", isError: true } },
      second: { terminal_end: { type: "tool_execution_end", isError: false } },
    }],
    ["unknown ownership", {
      native: true,
      definition,
      first: { terminal_end: { type: "tool_execution_end", isError: true, job_id: "first-job", instance_id: "first-instance" } },
      second: { terminal_end: { type: "tool_execution_end", isError: false, job_id: "second-job", instance_id: "second-instance" } },
    }],
  ];
  for (const [label, observation] of variants) {
    const result = apis.retry.inspectTechnicalRetryScenario(observation);
    assert.equal(result.status, "BLOCKED", `${label} in a Native observation must be BLOCKED, never PENDING`);
    assert.ok(result.failures.length > 0, `${label} must retain bounded blocking diagnostics`);
  }
}

function caseRouteNative10TerminalConsumerAuthority(apis) {
  const definition = routeDefinition(apis);
  const assignment = definition.assignment.initial;
  const validWait = makeRequirementsWaitRecord(definition);
  const validOutcome = validateRouteTerminal(apis, definition, [validWait]);
  assert.equal(validOutcome.result?.record?.source_kind, "task_wait_result", "the actual route consumer must return the valid WAIT terminal");
  assert.equal(validOutcome.result?.record?.assignment_id, assignment, "the valid WAIT terminal must retain the canonical requirements-reader assignment");
  assert.equal(validOutcome.result?.data?.status, "COMPLETE", "the actual route consumer must expose the successful requirements-reader result");
  assert.equal(validOutcome.checks.find((check) => check.id === "initial.requirements-reader.status")?.status, "PASS", "a valid WAIT terminal must receive a successful terminal status check");
  assert.equal(validOutcome.missing.some((check) => check.id === "initial.requirements-reader.terminal"), false, "a valid WAIT terminal must not be reported as a missing terminal");
  assert.equal(validOutcome.failures.some((check) => check.id === "initial.requirements-reader.terminal"), false, "a valid WAIT terminal must not produce a terminal authority failure");

  const forgedWait = structuredClone(validWait);
  forgedWait.wait_result.host_binding.assignment = `${assignment}:forged`;
  const forgedOutcome = validateRouteTerminal(apis, definition, [forgedWait]);
  assert.equal(forgedOutcome.result, null, "a WAIT terminal with a forged host assignment must not be consumed");
  const authorityFailure = forgedOutcome.failures.find((check) => check.id === "initial.requirements-reader.terminal");
  assert.equal(authorityFailure?.reason, "terminal record is not an authoritative normalized inline, async, or wait task result", "the route consumer must report the forged WAIT terminal as an authority failure");
  assert.equal(forgedOutcome.missing.some((check) => check.id === "initial.requirements-reader.terminal"), false, "a forged terminal is observed but unauthorized, not missing");

  const contradictoryWait = structuredClone(validWait);
  contradictoryWait.wait_result.host_binding.assignment = `${assignment}:forged`;
  const ambiguousOutcome = validateRouteTerminal(apis, definition, [validWait, contradictoryWait]);
  assert.equal(ambiguousOutcome.result, null, "a valid and forged WAIT terminal for one assignment must not approve the valid record");
  const ambiguityFailure = ambiguousOutcome.failures.find((check) => check.id === "initial.requirements-reader.terminal");
  assert.equal(ambiguityFailure?.reason, "duplicate or ambiguous authoritative terminal records", "the route consumer must preserve contradictory same-assignment terminals as ambiguity");
  assert.equal(ambiguityFailure?.count, 2, "same-assignment contradictory terminals must remain visible to the ambiguity check");

  const progressOnly = {
    source_kind: "native_subagent_progress",
    id: ALLOCATED_ID,
    assignment_id: assignment,
    agent: "requirements-reader",
    status: "completed",
    progress: { status: "completed" },
  };
  const progressOutcome = validateRouteTerminal(apis, definition, [progressOnly]);
  assert.equal(progressOutcome.result, null, "progress-only evidence must not claim terminal completion");
  const missingTerminal = progressOutcome.missing.find((check) => check.id === "initial.requirements-reader.terminal");
  assert.equal(missingTerminal?.reason, "no terminal record for the named requirements-reader assignment", "progress-only evidence must remain a missing terminal");
  assert.equal(progressOutcome.failures.length, 0, "progress-only evidence must remain pending rather than pass or fail as a terminal");
  assert.equal(progressOutcome.checks.some((check) => check.id === "initial.requirements-reader.status" && check.status === "PASS"), false, "progress-only evidence must not receive a successful terminal status check");
}

function caseNativeAmbiguousCardinalityStatus(apis) {
  const definition = retryDefinition();
  const firstAssignment = definition.roles.first_validator.name;
  const secondAssignment = definition.roles.second_validator.name;
  const firstRecord = makeRetryWaitRecord(definition, firstAssignment, {
    jobId: "retry-first-sdk-job",
    hostJobId: "retry-first-host-job",
    hostInstanceId: "retry-first-host-instance",
  });
  const secondRecord = makeRetryWaitRecord(definition, secondAssignment, {
    jobId: "retry-second-sdk-job",
    hostJobId: "retry-second-host-job",
    hostInstanceId: "retry-second-host-instance",
  });
  assert.equal(apis.retry.isAuthoritativeTaskRecord(firstRecord), true, "the duplicated first records must each be authoritative before cardinality is evaluated");
  assert.equal(apis.retry.isAuthoritativeTaskRecord(secondRecord), true, "the second retry record must be an authoritative control");

  const ambiguous = apis.retry.inspectTechnicalRetryScenario({
    native: true,
    definition,
    first: {
      terminals: [{}],
      task_records: [firstRecord, structuredClone(firstRecord)],
    },
    second: {
      terminals: [{}],
      task_records: [secondRecord],
    },
  });
  assert.ok(ambiguous.failures.includes("first_task_record_cardinality_invalid"), "Native ambiguity must retain the authoritative task-record cardinality failure");
  assert.equal(ambiguous.failures.some((failure) => failure.includes("terminal_count")), false, "the ambiguity control must not be masked by an unrelated terminal-count contradiction");
  assert.equal(ambiguous.status, "BLOCKED", "Native ambiguous authoritative task records must BLOCK");


  const sourceOnly = apis.retry.inspectTechnicalRetryScenario({
    native: false,
    definition,
    first: { terminals: [{}], task_records: [] },
    second: { terminals: [{}], task_records: [secondRecord] },
  });
  assert.equal(sourceOnly.status, "PENDING_NATIVE", "a non-Native observation remains PENDING_NATIVE");
}

function caseUnavailableSchemaRolePolicy(apis) {
  const unavailable = (record) => {
    const delivery = record.source_kind === "task_async_result" ? record.async_result : record.wait_result;
    const schema = { source: "none", mode: "strict", status: "unavailable" };
    if (record.source_kind === "task_async_result") {
      delivery.job.schema = schema;
      delete delivery.job.structured;
    } else {
      delivery.job.structured = schema;
      delete delivery.job.schema;
    }
    record.structured_output_status = "unavailable";
    record.structured_data = null;
    return record;
  };
  const cases = [
    ["custom structured-required role", unavailable(makeCustomRecord({ agent: "peer-reviewer", independent: true })), false],
    ["custom validator without independent evidence", unavailable(makeCustomRecord({ agent: "validator", independent: false })), false],
    ["custom spec-kit-author without independent evidence", unavailable(makeCustomRecord({ agent: "spec-kit-author", independent: false })), false],
    ["custom validator with independent evidence", unavailable(makeCustomRecord({ agent: "validator", independent: true })), true],
    ["custom spec-kit-author with independent evidence", unavailable(makeCustomRecord({ agent: "spec-kit-author", independent: true })), true],
    ["wait structured-required role", unavailable(makeWaitRecord({ agent: "peer-reviewer", independent: true })), false],
    ["wait validator without independent evidence", unavailable(makeWaitRecord({ agent: "validator", independent: false })), false],
    ["wait spec-kit-author without independent evidence", unavailable(makeWaitRecord({ agent: "spec-kit-author", independent: false })), false],
    ["wait validator with independent evidence", unavailable(makeWaitRecord({ agent: "validator", independent: true })), true],
    ["wait spec-kit-author with independent evidence", unavailable(makeWaitRecord({ agent: "spec-kit-author", independent: true })), true],
  ];
  for (const [label, record, expectedSuccess] of cases) {
    const authoritative = apis.retry.isAuthoritativeTaskRecord(record);
    if (expectedSuccess) {
      assert.equal(authoritative, true, `${label} must remain an authoritative observed record`);
    }
    assert.equal(apis.retry.taskRecordSucceeded(record), expectedSuccess, `${label} must apply the unavailable-schema role/evidence policy`);
  }
}

function caseInlineStatusBoundary(apis) {
  const completed = makeInlineRecord({ status: "completed", exitCode: 0 });
  assert.equal(apis.retry.isAuthoritativeTaskRecord(completed), true, "the inline SingleResult control must be authoritative");
  assert.equal(apis.retry.taskRecordSucceeded(completed), true, "a completed inline SingleResult with exitCode 0 is the existing positive authority");
  for (const [label, status] of [["running inline status", "running"], ["error status contradicting exitCode 0", "error"]]) {
    const candidate = makeInlineRecord({ status, exitCode: 0 });
    assert.equal(apis.retry.isAuthoritativeTaskRecord(candidate), true, `${label} must still be an observed inline record`);
    assert.equal(apis.retry.taskRecordSucceeded(candidate), false, `${label} must not succeed with exitCode 0`);
  }
}

function caseWaitRootEndBinding(apis) {
  const variants = [
    ["Root TASK END reported an error", (record) => { record.wait_result.host_binding.root_task_end_is_error = true; }],
    ["Root TASK END error state is missing", (record) => { delete record.wait_result.host_binding.root_task_end_is_error; }],
  ];
  for (const [label, mutate] of variants) {
    const candidate = makeWaitRecord();
    mutate(candidate);
    assert.equal(apis.retry.isAuthoritativeTaskRecord(candidate), false, `${label} must reject WAIT authority`);
    assert.equal(apis.retry.taskRecordSucceeded(candidate), false, `${label} must never succeed`);
  }
}

function caseCustomProjectSourceBinding(apis) {
  const candidate = makeCustomRecord({ agent: "validator", structured: true });
  candidate.agentSource = "user";
  candidate.async_result.host_binding.agentSource = "user";
  assert.equal(candidate.agentSource, candidate.async_result.host_binding.agentSource, "the negative control must keep record and host binding source values matching");
  assert.equal(apis.retry.isAuthoritativeTaskRecord(candidate), false, "CUSTOM non-project agentSource must reject an otherwise matching record/binding");
  assert.equal(apis.retry.taskRecordSucceeded(candidate), false, "CUSTOM non-project agentSource must not succeed");
}

function caseWaitOptionalFieldTypes(apis) {
  const wrongExitType = makeWaitRecord();
  wrongExitType.wait_result.job.exitCode = "0";
  assert.equal(apis.retry.isAuthoritativeTaskRecord(wrongExitType), false, "a present non-numeric WAIT exitCode must reject authority");
  assert.equal(apis.retry.taskRecordSucceeded(wrongExitType), false, "a present non-numeric WAIT exitCode must not succeed");

  const wrongPublishedType = makeWaitRecord();
  wrongPublishedType.wait_result.job.agentOutputPublished = "true";
  assert.equal(apis.retry.isAuthoritativeTaskRecord(wrongPublishedType), false, "a present non-boolean agentOutputPublished must reject authority");
  assert.equal(apis.retry.taskRecordSucceeded(wrongPublishedType), false, "a present non-boolean agentOutputPublished must not succeed");

  const observedFalse = makeWaitRecord();
  observedFalse.wait_result.job.agentOutputPublished = false;
  assert.equal(apis.retry.isAuthoritativeTaskRecord(observedFalse), true, "boolean agentOutputPublished:false is valid observed metadata, not malformed by type alone");
}

function caseRouteCanonicalAssignmentAlias(apis) {
  const definition = routeDefinition(apis);
  const assignment = definition.assignment.initial;
  const valid = makeRequirementsWaitRecord(definition);
  const positive = validateRouteTerminal(apis, definition, [valid]);
  assert.equal(positive.result?.record?.assignment_id, assignment, "the actual WAIT producer control must retain the canonical assignment");

  const foreign = structuredClone(valid);
  foreign.assignment_id = `${assignment}:foreign`;
  foreign.name = assignment;
  foreign.wait_result.host_binding.assignment = foreign.assignment_id;
  foreign.wait_result.job.label = foreign.assignment_id;
  const outcome = validateRouteTerminal(apis, definition, [foreign]);
  assert.equal(outcome.result, null, "a foreign canonical assignment must not be consumed merely because name aliases the expected assignment");
}

function caseRouteHostDomainBinding(apis) {
  const definition = routeDefinition(apis);
  const customDomain = { job_id: HOST_JOB_ID, instance_id: HOST_INSTANCE_ID };
  const waitDomain = { job_id: `${HOST_JOB_ID}:wait-channel`, instance_id: `${HOST_INSTANCE_ID}:wait-channel` };

  const custom = makeRequirementsCustomRecord(definition);
  assert.equal(custom.jobId, custom.async_result.host_binding.job_id, "CUSTOM record.jobId must be the observed host-domain job ID");
  const customPositive = validateRouteTerminal(apis, definition, [custom], customDomain);
  assert.equal(customPositive.result?.record?.source_kind, "task_async_result", "the matching CUSTOM host domain must remain a valid route terminal");
  const customWrong = structuredClone(custom);
  customWrong.jobId = "foreign-custom-host-job";
  customWrong.instanceId = "foreign-custom-host-instance";
  customWrong.async_result.host_binding.job_id = customWrong.jobId;
  customWrong.async_result.host_binding.instance_id = customWrong.instanceId;
  const customRejected = validateRouteTerminal(apis, definition, [customWrong], customDomain);
  assert.ok(customRejected.failures.some((check) => check.id === "initial.requirements-reader.async-binding"), "CUSTOM host job/instance IDs outside the observed domain must fail binding");

  const wait = makeRequirementsWaitRecord(definition);
  wait.instanceId = waitDomain.instance_id;
  wait.wait_result.host_binding.job_id = waitDomain.job_id;
  wait.wait_result.host_binding.instance_id = waitDomain.instance_id;
  assert.notEqual(wait.jobId, wait.wait_result.host_binding.job_id, "WAIT record.jobId must remain the SDK job ID, distinct from the host-domain job ID");
  const waitPositive = validateRouteTerminal(apis, definition, [wait], waitDomain);
  assert.equal(waitPositive.result?.record?.source_kind, "task_wait_result", "the matching WAIT host domain must remain a valid route terminal");
  const waitWrong = structuredClone(wait);
  waitWrong.instanceId = "foreign-wait-host-instance";
  waitWrong.wait_result.host_binding.job_id = "foreign-wait-host-job";
  waitWrong.wait_result.host_binding.instance_id = waitWrong.instanceId;
  const waitRejected = validateRouteTerminal(apis, definition, [waitWrong], waitDomain);
  assert.ok(waitRejected.failures.some((check) => check.id === "initial.requirements-reader.async-binding"), "WAIT host job/instance IDs outside the observed domain must fail binding");
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
    const failure = {
      name,
      classification,
      failure_reason_expected: error?.code === "ERR_ASSERTION" || error?.name === "AssertionError",
      error: safeError(error),
    };
    failures.push(failure);
    results.push({ name, status: "FAIL", classification, failure_reason_expected: failure.failure_reason_expected, error: failure.error });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.root, { recursive: true });
  const apis = await loadConsumers(options);
  const results = [];
  const failures = [];

  executeCase(results, failures, "normalizeTerminal preserves exact aliases and rejects trim/object/cross-family conflation", "VALID_FINDING:AC-016:normalizeTerminal-authority", () => caseNormalizeTerminalExactAliases(apis));
  executeCase(results, failures, "immutable causality cannot approve changed before/after hashes through changed_paths[]", "VALID_FINDING:AC-016:immutable-causality", () => caseChangedPathsCannotApproveDifferentHashes(apis));
  executeCase(results, failures, "custom and wait structured-less completion share the authorized-role independent-evidence policy", "VALID_FINDING:AC-016:structured-less-policy", () => caseStructuredlessPolicy(apis));
  executeCase(results, failures, "custom async host_binding requires and validates role/source/assignment/host domain IDs", "VALID_FINDING:AC-016:custom-host-binding", () => caseCustomHostBinding(apis));
  executeCase(results, failures, "Native authority/identity/ownership unknown is BLOCKED rather than PENDING", "VALID_FINDING:AC-016:native-unknown-blocking", () => caseNativeUnknownMustBlock(apis));
  executeCase(results, failures, "Native10 terminal consumer validates WAIT authority, ambiguity, and progress boundaries", "VALID_FINDING:AC-016:route-matrix-terminal-consumer-authority", () => caseRouteNative10TerminalConsumerAuthority(apis));
  executeCase(results, failures, "Native ambiguous authoritative task-record cardinality blocks while source-only observations remain pending", "VALID_FINDING:AC-016:native-ambiguous-authoritative-cardinality", () => caseNativeAmbiguousCardinalityStatus(apis));
  executeCase(results, failures, "structured schema unavailable follows the authorized-role independent-evidence policy across CUSTOM and WAIT", "VALID_FINDING:AC-016:unavailable-schema-role-policy", () => caseUnavailableSchemaRolePolicy(apis));
  executeCase(results, failures, "inline non-terminal or contradictory status cannot succeed with exitCode zero", "VALID_FINDING:AC-016:inline-status-boundary", () => caseInlineStatusBoundary(apis));
  executeCase(results, failures, "WAIT Root TASK END error or missing error state rejects authority", "VALID_FINDING:AC-016:wait-root-end-binding", () => caseWaitRootEndBinding(apis));
  executeCase(results, failures, "CUSTOM non-project agentSource rejects an otherwise matching record and binding", "VALID_FINDING:AC-016:custom-project-source-binding", () => caseCustomProjectSourceBinding(apis));
  executeCase(results, failures, "WAIT rejects invalid present exitCode and agentOutputPublished types while preserving boolean metadata", "VALID_FINDING:AC-016:wait-optional-field-types", () => caseWaitOptionalFieldTypes(apis));
  executeCase(results, failures, "route consumer rejects a canonical assignment contradicted by a name alias", "VALID_FINDING:AC-016:route-canonical-assignment-alias", () => caseRouteCanonicalAssignmentAlias(apis));
  executeCase(results, failures, "route binding matches observed host job and instance domains per CUSTOM and WAIT channel", "VALID_FINDING:AC-016:route-host-domain-binding", () => caseRouteHostDomainBinding(apis));


  const output = {
    status: failures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "terminal-consumer-authority-red",
    source: { path: options.source, sha256: apis.actualSourceSha, expected_sha256: options.expectedSourceSha },
    retry_source: { path: options.retrySource, sha256: apis.actualRetrySha, expected_sha256: options.expectedRetrySha },
    route_source: { path: options.routeSource, sha256: apis.actualRouteSha, expected_sha256: options.expectedRouteSha },
    root: options.root,
    native_launch: false,
    network: false,
    shell: false,
    existing_probes_preserved: true,
    cases: results.length,
    cases_run: results,
    criteria_to_tests: {
      "AC-016": results.map((item) => `implementation-evidence/native-release/terminal-consumer-authority-red-probe.mjs::${item.name}`),
    },
    checks: "NOT_EXECUTED_BY_TEST_AUTHOR_PARENT_RUNS_NODE22_CLI",
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "FAIL",
    phase: "RED",
    probe: "terminal-consumer-authority-red",
    failure_reason_expected: error?.code === "ERR_ASSERTION" || error?.name === "AssertionError",
    error: safeError(error),
  }, null, 2)}\n`);
  process.exitCode = 1;
});
