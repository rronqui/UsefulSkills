#!/usr/bin/env node

/**
 * RED probe for T-011/AC-016 async lifecycle consumer bindings.
 *
 * This probe is deliberately source-derived and offline. It discovers the
 * retained FULL_GIT inspection witness from evidence.json, keeps that private
 * fixture in place, and mutates only structured-cloned observation envelopes.
 * It imports the CURRENT checkout route-matrix module and never imports or
 * overwrites the historical disposable probe.
 *
 * The positive control must remain PASS/native:false. Every negative case below
 * is a consumer regression assertion: malformed lifecycle/dispatch/helper
 * evidence must not be accepted, and authentic-looking origin fields must not
 * promote a capture whose native bit is false. No Native origin or proof is
 * created; the origin case is explicitly labelled source-only and exists only
 * as a negative mutation of the cloned source observation.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildRouteCases,
  inspectRouteCase,
} from './route-matrix.mjs';

const ASYNC_SOURCE_KIND = 'task_async_result';
const ASYNC_MESSAGE_SOURCE = 'message_end.custom.async-result';
const AUTHENTIC_EVIDENCE_LEVEL = 'native-omp-rpc-actions-and-profile-schemas';
const SOURCE_DERIVED_EVIDENCE_LEVEL = 'SOURCE_DERIVED_HOST_ADAPTER';

function jsonClone(value) {
  return structuredClone(value);
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeAbsolute(value) {
  return path.resolve(String(value));
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function findFullGitWitness(evidence, evidencePath) {
  const candidates = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (
      !Array.isArray(value)
      && value.id === 'FULL_GIT'
      && typeof value.project === 'string'
      && value.host_artifacts?.inspectionInputWitness?.path
    ) {
      const candidate = path.resolve(value.project, value.host_artifacts.inspectionInputWitness.path);
      if (fs.existsSync(candidate)) candidates.push(candidate);
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  visit(evidence);

  const absoluteStrings = [];
  const collectStrings = (value) => {
    if (typeof value === 'string' && path.isAbsolute(value)) absoluteStrings.push(value);
    else if (Array.isArray(value)) value.forEach(collectStrings);
    else if (value && typeof value === 'object') Object.values(value).forEach(collectStrings);
  };
  collectStrings(evidence);
  for (const candidate of absoluteStrings) {
    if (!candidate.toLowerCase().endsWith(`${path.sep}.omp${path.sep}state${path.sep}native-route${path.sep}inspection-input.json`)) continue;
    if (fs.existsSync(candidate)) candidates.push(candidate);
  }

  const unique = [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
  const fullGit = unique.find((candidate) => candidate.toLowerCase().includes(`${path.sep}route-git-full${path.sep}`));
  assert.ok(fullGit, `Source21 FULL_GIT inspection witness not found from ${evidencePath}`);
  return fullGit;
}

function verifyActualDescriptor(root, value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value) && typeof value.path === 'string' && typeof value.sha256 === 'string' && Number.isInteger(value.bytes)) {
    const candidate = path.isAbsolute(value.path) ? value.path : path.resolve(root, value.path);
    if (isInside(root, normalizeAbsolute(candidate)) && fs.existsSync(candidate)) {
      const bytes = fs.readFileSync(candidate);
      assert.equal(bytes.length, value.bytes, `actual descriptor bytes changed: ${value.path}`);
      assert.equal(sha256Bytes(bytes), value.sha256, `actual descriptor hash changed: ${value.path}`);
    }
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) verifyActualDescriptor(root, child, seen);
}

function findInitialStep(input) {
  const step = input.native?.steps?.initial;
  assert.ok(step, 'Source21 FULL_GIT witness has no initial route step');
  return step;
}

function findInlineRecord(input) {
  const step = findInitialStep(input);
  const expectedAssignment = input.definition.assignment.initial;
  const records = Array.isArray(step.task_records) ? step.task_records : [];
  const record = records.find((candidate) => candidate.assignment_id === expectedAssignment);
  assert.ok(record, `inline Source21 terminal missing for ${expectedAssignment}`);
  return record;
}

function rootSessionId(step) {
  const sessionId = step.root_session?.session_id ?? step.root_session?.id;
  assert.equal(typeof sessionId, 'string', 'Source21 root session id must be observed');
  return sessionId;
}

function rootEndIsError(step) {
  const value = step.root_task_end?.isError
    ?? step.root_task_end?.is_error
    ?? step.root_task_ends?.[0]?.isError
    ?? step.root_task_ends?.[0]?.is_error;
  assert.equal(typeof value, 'boolean', 'Source21 root task-end error state must be observed');
  return value;
}

function actualDeliveryOrdinal(step, inline) {
  const delivery = step.task_details?.find((detail) => (
    Array.isArray(detail.results) && detail.results.some((result) => result.id === inline.id)
  ));
  const ordinal = delivery?.host_workflow_ordinal;
  assert.equal(typeof ordinal, 'number', 'async delivery host workflow ordinal must be observed');
  assert.equal(ordinal, inline.host_workflow_ordinal, 'async delivery ordinal must match actual terminal evidence');
  return ordinal;
}

function createAsyncRecord(input) {
  const step = findInitialStep(input);
  const inline = findInlineRecord(input);
  assert.equal(inline.status, 'completed', 'Source21 inline terminal must be completed');
  assert.equal(inline.agentSource, 'project', 'Source21 agent source must be project');
  assert.equal(inline.id, inline.allocated_id, 'Source21 normalized id must equal actual allocated lifecycle id');
  assert.equal(typeof inline.jobId, 'string', 'Source21 domain job id must be observed');
  assert.equal(typeof inline.host_workflow_ordinal, 'number', 'Source21 host workflow ordinal must be observed');
  assert.equal(typeof inline.parent_tool_call_id, 'string', 'Source21 parent tool call must be observed');
  assert.equal(typeof inline.index, 'number', 'Source21 dispatch index must be observed');
  assert.ok(inline.structured_data && typeof inline.structured_data === 'object', 'Source21 structured data missing');
  assert.equal(inline.structured, true, 'Source21 structured output must be observed');
  assert.equal(inline.structured_output_status, 'valid', 'Source21 structured output status must be valid');

  const structuredData = jsonClone(inline.structured_data);
  const deliveryOrdinal = actualDeliveryOrdinal(step, inline);
  const schemaSource = inline.agent ? 'agent' : undefined;
  assert.equal(schemaSource, 'agent', 'async schema source must bind to the observed agent delivery');
  const schemaMode = inline.structured === true ? 'strict' : 'permissive';
  const rootId = rootSessionId(step);
  const rootEndError = rootEndIsError(step);
  assert.equal(rootEndError, false, 'Root END must be observed as non-error for admitted completion');
  const sdkJobId = `${inline.jobId}:sdk-async`;
  assert.notEqual(sdkJobId, inline.jobId, 'SDK async job id must remain distinct from host-derived domain job id');
  assert.notEqual(sdkJobId, inline.id, 'SDK async job id must remain distinct from allocated agent id');

  const job = {
    jobId: sdkJobId,
    type: 'task',
    status: 'completed',
    agentId: inline.id,
    label: inline.assignment_id,
    schema: { source: schemaSource, mode: schemaMode, status: 'valid', data: structuredData },
  };

  return {
    source_kind: ASYNC_SOURCE_KIND,
    id: inline.id,
    allocated_id: inline.allocated_id,
    instanceId: inline.instanceId,
    jobId: inline.jobId,
    assignment_id: inline.assignment_id,
    run_id: inline.run_id,
    agent: inline.agent,
    agentSource: inline.agentSource,
    parent_tool_call_id: inline.parent_tool_call_id,
    index: inline.index,
    root_session_id: rootId,
    status: 'completed',
    host_workflow_ordinal: deliveryOrdinal,
    structured_output_status: 'valid',
    structured_data: structuredData,
    // These values are deliberately observed as unavailable on async delivery.
    exitCode: null,
    isError: null,
    error: null,
    aborted: null,
    exit_code_observed: false,
    is_error_observed: false,
    error_observed: false,
    aborted_observed: false,
    async_result: {
      source: ASYNC_MESSAGE_SOURCE,
      message_id: null,
      host_workflow_ordinal: deliveryOrdinal,
      job,
      host_binding: {
        source: 'observed-root-dispatch-lifecycle',
        root_session_id: rootId,
        parent_tool_call_id: inline.parent_tool_call_id,
        allocated_id: inline.allocated_id,
        index: inline.index,
        agent: inline.agent,
        agentSource: inline.agentSource,
        assignment_id: inline.assignment_id,
        root_task_end_is_error: rootEndError,
      },
    },
  };
}

function replaceInitialTerminal(input, replacement) {
  const step = findInitialStep(input);
  const expectedAssignment = input.definition.assignment.initial;
  const index = step.task_records.findIndex((candidate) => candidate.assignment_id === expectedAssignment);
  assert.ok(index >= 0, `terminal replacement target missing for ${expectedAssignment}`);
  step.task_records.splice(index, 1, replacement);
}

function getAsyncRecord(input) {
  const step = findInitialStep(input);
  const record = step.task_records.find((candidate) => candidate.source_kind === ASYNC_SOURCE_KIND);
  assert.ok(record, 'async normalized record missing');
  return record;
}

function getAsyncJob(input) {
  return getAsyncRecord(input).async_result.job;
}

function inspect(input) {
  return inspectRouteCase(input);
}

function assertNonPass(label, input) {
  const result = inspect(input);
  assert.notEqual(result.status, 'PASS', `${label} unexpectedly passed: ${JSON.stringify(result)}`);
  return result;
}

function assertSourceOnly(label, input) {
  const result = inspect(input);
  assert.equal(result.status, 'PASS', `${label} made the source-derived route invalid: ${JSON.stringify(result)}`);
  assert.equal(result.native, false, `${label} promoted a source-only capture to Native: ${JSON.stringify(result)}`);
  assert.notEqual(result.evidence_level, 'native-omp-rpc-route-and-artifact-evaluation', `${label} emitted Native evidence level`);
  return result;
}

function assertRouteDefinitionCreator(input) {
  const { run_id: runId, revision, nonce } = input.definition.binding;
  const definitions = buildRouteCases({ runId, revision, nonce });
  const ids = definitions.map((definition) => definition.id);
  assert.deepEqual(ids, ['SHORT_LOCAL', 'FULL_LOCAL', 'SHORT_GIT', 'FULL_GIT']);
  const recreated = definitions.find((definition) => definition.id === 'FULL_GIT');
  assert.deepEqual(recreated, input.definition, 'Source21 FULL_GIT definition is not canonical');
}

function runAsyncMatrix(pristineInput) {
  const actualProducerInput = jsonClone(pristineInput);
  const actualProducerRecord = createAsyncRecord(actualProducerInput);
  const actualProducerBinding = actualProducerRecord.async_result.host_binding;
  const observedTuple = {
    source: actualProducerBinding.source,
    root_session_id: actualProducerBinding.root_session_id,
    parent_tool_call_id: actualProducerBinding.parent_tool_call_id,
    allocated_id: actualProducerBinding.allocated_id,
    index: actualProducerBinding.index,
    root_task_end_is_error: actualProducerBinding.root_task_end_is_error,
  };
  delete actualProducerBinding.agent;
  delete actualProducerBinding.agentSource;
  replaceInitialTerminal(actualProducerInput, actualProducerRecord);
  const actualProducerStep = findInitialStep(actualProducerInput);
  assert.deepEqual({
    source: actualProducerBinding.source,
    root_session_id: actualProducerBinding.root_session_id,
    parent_tool_call_id: actualProducerBinding.parent_tool_call_id,
    allocated_id: actualProducerBinding.allocated_id,
    index: actualProducerBinding.index,
    root_task_end_is_error: actualProducerBinding.root_task_end_is_error,
  }, observedTuple, 'actual async producer must preserve the exact host binding tuple');
  assert.equal(actualProducerRecord.status, 'completed', 'actual async producer status changed');
  assert.equal(actualProducerRecord.async_result.job.status, 'completed', 'actual async producer job status changed');
  assert.equal(actualProducerRecord.async_result.job.schema.source, 'agent', 'actual async producer schema source changed');
  assert.equal(actualProducerRecord.async_result.job.schema.status, 'valid', 'actual async producer schema status changed');
  assert.equal(actualProducerRecord.structured_output_status, 'valid', 'actual async producer structured status changed');
  assert.ok(Array.isArray(actualProducerStep.subagent_reads) && actualProducerStep.subagent_reads.length > 0, 'actual async producer read-source evidence is required');
  assert.equal(Object.hasOwn(actualProducerBinding, 'agent'), false, 'actual async producer must not expose host binding agent');
  assert.equal(Object.hasOwn(actualProducerBinding, 'agentSource'), false, 'actual async producer must not expose host binding agentSource');
  const actualProducerAccepted = inspect(actualProducerInput);
  assert.equal(actualProducerAccepted.status, 'PASS', `actual-producer async terminal was not accepted: ${JSON.stringify(actualProducerAccepted)}`);
  assert.equal(actualProducerAccepted.native, false, 'actual-producer source-derived witness must remain non-native');
  const asyncInput = jsonClone(pristineInput);
  const asyncRecord = createAsyncRecord(asyncInput);
  replaceInitialTerminal(asyncInput, asyncRecord);
  const initialStep = findInitialStep(asyncInput);
  assert.ok(Array.isArray(initialStep.root_task_ends) && initialStep.root_task_ends.length > 0, 'Root END evidence is required');
  assert.ok(Array.isArray(initialStep.subagent_reads) && initialStep.subagent_reads.length > 0, 'child source/read evidence is required');
  assert.equal(asyncRecord.structured_output_status, 'valid');
  assert.equal(asyncRecord.host_workflow_ordinal, asyncRecord.async_result.host_workflow_ordinal);
  assert.equal(asyncRecord.async_result.job.schema.source, 'agent');
  assert.equal(asyncRecord.async_result.job.schema.mode, 'strict');
  assert.equal(asyncRecord.async_result.job.schema.status, 'valid');
  assert.equal(asyncRecord.exitCode, null);
  assert.equal(asyncRecord.isError, null);
  assert.equal(asyncRecord.error, null);
  assert.equal(asyncRecord.aborted, null);
  assert.equal(asyncRecord.exit_code_observed, false);
  assert.equal(asyncRecord.is_error_observed, false);
  assert.equal(asyncRecord.error_observed, false);
  assert.equal(asyncRecord.aborted_observed, false);
  assert.equal(Object.hasOwn(asyncRecord.async_result.job, 'exitCode'), false);
  assert.equal(Object.hasOwn(asyncRecord.async_result.job, 'isError'), false);
  assert.equal(Object.hasOwn(asyncRecord.async_result.job, 'aborted'), false);

  const accepted = inspect(asyncInput);
  assert.equal(accepted.status, 'PASS', `valid async terminal was not accepted: ${JSON.stringify(accepted)}`);
  assert.equal(accepted.native, false, 'source-derived witness must not become native by async normalization');

  const cases = [];
  for (const status of ['failed', 'cancelled', 'running']) {
    cases.push([`${status} async status`, (input) => {
      const record = getAsyncRecord(input);
      record.status = status;
      getAsyncJob(input).status = status;
    }]);
  }
  cases.push(
    ['invalid structured schema data', (input) => {
      const data = getAsyncJob(input).schema.data;
      delete data.protocol;
    }],
    ['invalid schema envelope', (input) => {
      getAsyncJob(input).schema = { data: null };
    }],
    ['structured schema data without source/read gates', (input) => {
      const step = findInitialStep(input);
      step.subagent_reads = [];
      step.task_details = [];
    }],
    ['structured role missing schema', (input) => {
      delete getAsyncJob(input).schema;
    }],
    ['unknown lifecycle agent', (input) => {
      const record = getAsyncRecord(input);
      record.agent = `${record.agent}:foreign`;
    }],
    ['async host binding agent contradicts lifecycle', (input) => {
      const record = getAsyncRecord(input);
      record.async_result.host_binding.agent = `${record.agent}:foreign`;
    }],
    ['async host binding agentSource contradicts lifecycle', (input) => {
      const record = getAsyncRecord(input);
      record.async_result.host_binding.agentSource = 'user';
    }],
    ['async job agent tuple mismatch', (input) => {
      getAsyncJob(input).agentId = `${getAsyncRecord(input).id}:foreign`;
    }],
    ['async job type mismatch', (input) => {
      getAsyncJob(input).type = `${getAsyncJob(input).type}:foreign`;
    }],
    ['root binding mismatch', (input) => {
      const foreign = `${rootSessionId(findInitialStep(input))}:foreign`;
      getAsyncRecord(input).root_session_id = foreign;
      getAsyncRecord(input).async_result.host_binding.root_session_id = foreign;
    }],
    ['Root END error mismatch', (input) => {
      getAsyncRecord(input).async_result.host_binding.root_task_end_is_error = true;
    }],
    ['parent binding mismatch', (input) => {
      const foreign = `${getAsyncRecord(input).parent_tool_call_id}:foreign`;
      getAsyncRecord(input).parent_tool_call_id = foreign;
      getAsyncRecord(input).async_result.host_binding.parent_tool_call_id = foreign;
    }],
    ['allocated id mismatch', (input) => {
      const foreign = `${getAsyncRecord(input).allocated_id}:foreign`;
      getAsyncRecord(input).allocated_id = foreign;
      getAsyncRecord(input).async_result.host_binding.allocated_id = foreign;
    }],
    ['dispatch index mismatch', (input) => {
      const foreign = getAsyncRecord(input).index + 1;
      getAsyncRecord(input).index = foreign;
      getAsyncRecord(input).async_result.host_binding.index = foreign;
    }],
    ['duplicate normalized terminal', (input) => {
      const record = getAsyncRecord(input);
      findInitialStep(input).task_records.push(jsonClone(record));
    }],
  );

  for (const [label, mutate] of cases) {
    const candidate = jsonClone(asyncInput);
    mutate(candidate);
    assertNonPass(label, candidate);
  }

  return {
    accepted: accepted.status,
    rejected: cases.map(([label]) => label),
  };
}

function runAsyncDispatchBindingMatrix(pristineInput) {
  const asyncInput = jsonClone(pristineInput);
  replaceInitialTerminal(asyncInput, createAsyncRecord(asyncInput));
  const cases = [];
  for (const field of ['parent_tool_call_id', 'allocated_id', 'index']) {
    cases.push([`async terminal missing ${field}`, (input) => {
      const record = getAsyncRecord(input);
      const binding = record.async_result.host_binding;
      assert.equal(Object.hasOwn(record, field), true, `async terminal does not expose ${field}`);
      assert.equal(Object.hasOwn(binding, field), true, `async host binding does not expose ${field}`);
      delete record[field];
      delete binding[field];
    }]);
  }

  for (const [label, mutate] of cases) {
    const candidate = jsonClone(asyncInput);
    mutate(candidate);
    assertNonPass(label, candidate);
  }

  return { rejected: cases.map(([label]) => label) };
}

function initialAssignmentRecords(input) {
  const step = findInitialStep(input);
  const taskCallRecords = (Array.isArray(step.task_calls) ? step.task_calls : [])
    .filter((call) => String(call?.kind ?? '').toLowerCase() === 'dispatch')
    .flatMap((call) => Array.isArray(call.assignments) ? call.assignments : []);
  const rootEndRecords = (Array.isArray(step.root_task_ends) ? step.root_task_ends : [])
    .flatMap((end) => Array.isArray(end.dispatched_assignments) ? end.dispatched_assignments : []);
  const records = [...taskCallRecords, ...rootEndRecords];
  assert.ok(records.length > 0, 'Source24 Root dispatch has no actual assignment records');
  return records;
}

function actualSubmittedAssignmentSha(input) {
  const records = initialAssignmentRecords(input);
  const hashes = [...new Set(records.map((record) => record.task_sha256 ?? record.raw_task_sha256).filter((value) => typeof value === 'string'))];
  assert.equal(hashes.length, 1, 'Source24 Root dispatch must expose one consistent submitted task hash');
  assert.match(hashes[0], /^[a-f0-9]{64}$/i, 'Source24 submitted task hash must be an observed SHA-256');
  return hashes[0];
}

function flipObservedSha(value) {
  const last = value.at(-1).toLowerCase();
  return `${value.slice(0, -1)}${last === '0' ? '1' : '0'}`;
}

function setPublicAssignment(input, publicAssignment, assignmentSha256) {
  for (const record of initialAssignmentRecords(input)) {
    record.public_assignment = publicAssignment;
    record.assignment_sha256 = assignmentSha256;
  }
}

function removePublicAssignment(input) {
  for (const record of initialAssignmentRecords(input)) {
    delete record.public_assignment;
    delete record.assignment_sha256;
  }
}

function runCanonicalAssignmentMatrix(pristineInput) {
  const submittedSha = actualSubmittedAssignmentSha(pristineInput);
  const canonicalTask = pristineInput.definition?.steps?.initial?.task?.task;
  assert.equal(typeof canonicalTask, 'string', 'Source24 canonical initial task text must be observed');
  assert.ok(canonicalTask.length > 0, 'Source24 canonical initial task text must be non-empty');

  const cases = [
    ['canonical raw submitted SHA without public assignment/hash', (input) => {
      removePublicAssignment(input);
    }],
    ['canonical public assignment with contradictory public SHA', (input) => {
      setPublicAssignment(input, canonicalTask, flipObservedSha(submittedSha));
    }],
    ['foreign public assignment with canonical public SHA', (input) => {
      setPublicAssignment(input, `${canonicalTask}\nforeign-public-assignment`, submittedSha);
    }],
  ];

  for (const [label, mutate] of cases) {
    const candidate = jsonClone(pristineInput);
    mutate(candidate);
    assertNonPass(label, candidate);
  }

  return {
    rejected: cases.map(([label]) => label),
    submitted_task_sha256: submittedSha,
  };
}

function runSolutionSpaceMatrix(pristineInput) {
  const asyncInput = jsonClone(pristineInput);
  replaceInitialTerminal(asyncInput, createAsyncRecord(asyncInput));
  const step = findInitialStep(asyncInput);
  const dispatches = (Array.isArray(step.task_calls) ? step.task_calls : [])
    .filter((call) => String(call?.kind ?? '').toLowerCase() === 'dispatch');
  assert.ok(dispatches.length > 0, 'dispatch solutionSpace witness is absent');
  assert.ok(dispatches.every((call) => call.has_solution_space === true), 'dispatch solutionSpace marker was not observed as true');

  const cases = [
    ['dispatch solutionSpace marker missing', (input) => {
      const calls = findInitialStep(input).task_calls.filter((call) => String(call?.kind ?? '').toLowerCase() === 'dispatch');
      for (const call of calls) delete call.has_solution_space;
    }],
    ['dispatch solutionSpace marker false', (input) => {
      const calls = findInitialStep(input).task_calls.filter((call) => String(call?.kind ?? '').toLowerCase() === 'dispatch');
      for (const call of calls) call.has_solution_space = false;
    }],
  ];

  for (const [label, mutate] of cases) {
    const candidate = jsonClone(asyncInput);
    mutate(candidate);
    assertNonPass(label, candidate);
  }

  return { rejected: cases.map(([label]) => label) };
}

function rootTaskEnds(step) {
  const ends = [];
  if (step.terminal?.root_task_end && typeof step.terminal.root_task_end === 'object') ends.push(step.terminal.root_task_end);
  if (Array.isArray(step.root_task_ends)) ends.push(...step.root_task_ends.filter((item) => item && typeof item === 'object'));
  assert.ok(ends.length > 0, 'Root END evidence is absent');
  return ends;
}

function rootTaskEndEvents(step) {
  const events = (Array.isArray(step.tool_events) ? step.tool_events : []).filter((event) => (
    String(event?.type ?? '').toLowerCase() === 'tool_execution_end'
    && String(event?.tool ?? '').toLowerCase() === 'task'
  ));
  assert.equal(events.length, 1, 'exactly one Root task END event is required');
  return events;
}

function runRootEndBindingMatrix(pristineInput) {
  const asyncInput = jsonClone(pristineInput);
  replaceInitialTerminal(asyncInput, createAsyncRecord(asyncInput));
  const originalEnds = rootTaskEnds(findInitialStep(asyncInput));
  assert.ok(originalEnds.some((end) => Object.hasOwn(end, 'tool_call_id')), 'Root END tool_call_id was not observed');
  assert.ok(originalEnds.some((end) => Object.hasOwn(end, 'parent_tool_call_id')), 'Root END parent_tool_call_id was not observed');

  const cases = [
    ['Root END missing tool_call_id', (input) => {
      for (const end of rootTaskEnds(findInitialStep(input))) delete end.tool_call_id;
    }],
    ['Root END missing parent_tool_call_id', (input) => {
      for (const end of rootTaskEnds(findInitialStep(input))) delete end.parent_tool_call_id;
    }],
    ['observed Root task END missing tool_call_id', (input) => {
      for (const event of rootTaskEndEvents(findInitialStep(input))) delete event.tool_call_id;
    }],
  ];

  for (const [label, mutate] of cases) {
    const candidate = jsonClone(asyncInput);
    mutate(candidate);
    assertNonPass(label, candidate);
  }

  return { rejected: cases.map(([label]) => label) };
}

function routeStepNames(input) {
  const names = Object.keys(input.definition?.steps ?? {}).filter((step) => input.native?.steps?.[step]);
  if (input.definition?.mode === 'git' && input.definition?.route === 'full') {
    for (const step of ['namespace-b-initial', 'namespace-b-resume']) {
      if (input.native?.steps?.[step] && !names.includes(step)) names.push(step);
    }
  }
  assert.ok(names.length > 0, 'route witness has no native steps');
  return names;
}

function runSourceOnlyOriginMatrix(pristineInput) {
  const candidate = jsonClone(pristineInput);
  const names = routeStepNames(candidate);
  for (const name of names) {
    const capture = candidate.native.steps[name];
    assert.equal(capture.native, false, `${name} is not the retained source-only witness`);
    assert.equal(capture.source_derived, true, `${name} is not source-derived in the retained witness`);
    assert.equal(capture.origin?.native_rpc, false, `${name} origin is not source-only in the retained witness`);
    capture.native = false;
    capture.source_derived = false;
    capture.evidence_level = AUTHENTIC_EVIDENCE_LEVEL;
    capture.native_process_count = 1;
    capture.origin = {
      ...capture.origin,
      kind: 'host-observed-native-rpc',
      source: 'host-rpc-process',
      process_observed: true,
      native_rpc: true,
      source_binding: true,
      process_count: 1,
    };
  }
  return assertSourceOnly('authentic-looking origin with capture.native:false', candidate);
}

function helperPair(step, tool) {
  const events = (Array.isArray(step.tool_events) ? step.tool_events : []).filter((event) => (
    String(event?.tool ?? '').toLowerCase() === tool
    && event?.host_policy_binding?.admitted === true
  ));
  const starts = events.filter((event) => String(event?.type ?? '').toLowerCase() === 'tool_execution_start');
  const ends = events.filter((event) => String(event?.type ?? '').toLowerCase() === 'tool_execution_end');
  assert.equal(starts.length, 1, `${tool} helper START witness is not unique`);
  assert.equal(ends.length, 1, `${tool} helper END witness is not unique`);
  assert.equal(typeof starts[0].sequence, 'number', `${tool} helper START sequence is not observed`);
  assert.equal(typeof ends[0].sequence, 'number', `${tool} helper END sequence is not observed`);
  assert.equal(typeof starts[0].host_workflow_ordinal, 'number', `${tool} helper START workflow ordinal is not observed`);
  assert.equal(typeof ends[0].host_workflow_ordinal, 'number', `${tool} helper END workflow ordinal is not observed`);
  assert.equal(typeof starts[0].host_observation?.root_session_id, 'string', `${tool} helper START Root session is not observed`);
  assert.equal(typeof ends[0].host_observation?.root_session_id, 'string', `${tool} helper END Root session is not observed`);
  return { start: starts[0], end: ends[0] };
}

function runHelperCausalityMatrix(pristineInput) {
  const asyncInput = jsonClone(pristineInput);
  replaceInitialTerminal(asyncInput, createAsyncRecord(asyncInput));
  const sourceStep = findInitialStep(asyncInput);
  for (const tool of ['write', 'bash']) helperPair(sourceStep, tool);

  const cases = [
    ['helper intent START after END', (input) => {
      const pair = helperPair(findInitialStep(input), 'write');
      pair.end.sequence = pair.start.sequence - 1;
    }],
    ['helper command START after END', (input) => {
      const pair = helperPair(findInitialStep(input), 'bash');
      pair.end.sequence = pair.start.sequence - 1;
    }],
    ['helper intent foreign Root session', (input) => {
      const pair = helperPair(findInitialStep(input), 'write');
      pair.end.host_observation.root_session_id = `${pair.start.host_observation.root_session_id}:foreign`;
    }],
    ['helper command foreign Root session', (input) => {
      const pair = helperPair(findInitialStep(input), 'bash');
      pair.end.host_observation.root_session_id = `${pair.start.host_observation.root_session_id}:foreign`;
    }],
    ['helper intent workflow causal inversion', (input) => {
      const pair = helperPair(findInitialStep(input), 'write');
      pair.end.host_workflow_ordinal = pair.start.host_workflow_ordinal - 1;
    }],
    ['helper command workflow causal inversion', (input) => {
      const pair = helperPair(findInitialStep(input), 'bash');
      pair.end.host_workflow_ordinal = pair.start.host_workflow_ordinal - 1;
    }],
  ];

  for (const [label, mutate] of cases) {
    const candidate = jsonClone(asyncInput);
    mutate(candidate);
    assertNonPass(label, candidate);
  }

  return { rejected: cases.map(([label]) => label) };
}

function parseEvidenceArgument(argv) {
  const index = argv.indexOf('--source21-evidence');
  const value = index >= 0 ? argv[index + 1] : process.env.SOURCE21_EVIDENCE;
  assert.ok(value, 'usage: node route-matrix-async-binding-red-probe.mjs --source21-evidence <evidence.json>');
  return path.resolve(value);
}

function run() {
  const evidencePath = parseEvidenceArgument(process.argv.slice(2));
  const evidenceBytes = fs.readFileSync(evidencePath);
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  const witnessPath = findFullGitWitness(evidence, evidencePath);
  const witness = readJson(witnessPath);
  assert.equal(witness.definition?.id, 'FULL_GIT');
  assertRouteDefinitionCreator(witness);

  const sourceRoot = normalizeAbsolute(witness.projectRoot);
  assert.ok(fs.existsSync(sourceRoot), `Source21 project root missing: ${sourceRoot}`);
  const pristine = jsonClone(witness);
  verifyActualDescriptor(sourceRoot, pristine.artifacts);

  const baseline = inspect(jsonClone(pristine));
  assert.equal(baseline.status, 'PASS', `Source21 FULL_GIT baseline changed: ${JSON.stringify(baseline)}`);
  assert.equal(baseline.native, false, 'Source21 source-derived baseline must remain non-native');

  const asyncMatrix = runAsyncMatrix(pristine);
  const dispatchBindingMatrix = runAsyncDispatchBindingMatrix(pristine);
  const solutionSpaceMatrix = runSolutionSpaceMatrix(pristine);
  const rootEndMatrix = runRootEndBindingMatrix(pristine);
  const sourceOnlyOrigin = runSourceOnlyOriginMatrix(pristine);
  const helperMatrix = runHelperCausalityMatrix(pristine);
  const assignmentMatrix = runCanonicalAssignmentMatrix(pristine);

  console.log(JSON.stringify({
    status: 'RED_PROBE_DEFINED',
    contract: pristine.definition.contract,
    route: pristine.definition.id,
    evidence_sha256: sha256Bytes(evidenceBytes),
    witness_sha256: sha256Bytes(fs.readFileSync(witnessPath)),
    evidence_path: evidencePath,
    witness_path: witnessPath,
    baseline: { status: baseline.status, native: baseline.native },
    async_matrix: asyncMatrix,
    async_dispatch_binding_matrix: dispatchBindingMatrix,
    solution_space_matrix: solutionSpaceMatrix,
    root_end_binding_matrix: rootEndMatrix,
    source_only_origin_guard: { status: sourceOnlyOrigin.status, native: sourceOnlyOrigin.native },
    helper_causality_matrix: helperMatrix,
    canonical_assignment_matrix: assignmentMatrix,
    source_mutated: false,
    native_launched: false,
  }, null, 2));
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  run();
}

export {
  createAsyncRecord,
  findFullGitWitness,
  runAsyncMatrix,
  runAsyncDispatchBindingMatrix,
  runSolutionSpaceMatrix,
  runRootEndBindingMatrix,
  runSourceOnlyOriginMatrix,
  runHelperCausalityMatrix,
  runCanonicalAssignmentMatrix,
};
