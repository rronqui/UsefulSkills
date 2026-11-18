#!/usr/bin/env node
// Source-only RED probe for T-011 / AC-016.
//
// This probe exercises the real inspectNative profile consumer with deterministic
// host-shaped Root/task/read records. It does not start OMP/SDK, invoke a model,
// use a network or Git command, change runtime settings, or write outside its
// disposable --root fixture. The lifecycle source is loaded through a temporary
// export-only seam; no production export is added.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_SOURCE = path.join(SOURCE_DIR, "lifecycle.mjs");
const DEFAULT_ROOT = path.resolve(SOURCE_DIR, "../../.test-temp/native10-task-descriptor-red");
const BASELINE_SOURCE_SHA = "b2d4327ea2274924677e510ba4e9b1ce5594371345266d339df22dc63774b492";
const SHA256 = /^[a-f0-9]{64}$/i;
const REVISION = "native10-task-descriptor-red-revision";
const TEST_FILE = "implementation-evidence/native-release/native10-task-descriptor-red-probe.mjs";
const EXPECTED_CLASSIFICATION = "VALID_FINDING:AC-016:native10-file-backed-task-descriptor-consumer";
const ROOT_CALL_ID = "native10-descriptor-root-task";
const ROOT_JOB_ID = "native10-descriptor-root-job";
const ROOT_SESSION_ID = "native10-descriptor-root-session";
const DOC_PATH = ".omp/state/native-observation/native10-doc-handoff.md";
const VALIDATOR_COMMAND = "node .omp/state/native-tooling/lifecycle-check.mjs";
const ASSIGNMENTS = Object.freeze([
  ["requirements-reader", "Native10RequirementsReader"],
  ["architect", "Native10Architect"],
  ["spec-kit-author", "Native10SpecKitAuthor"],
  ["deep-reviewer", "Native10DeepReviewer"],
  ["peer-reviewer", "Native10PeerReviewer"],
  ["validator", "Native10Validator"],
]);

function parseArgs(argv) {
  const values = new Map();
  const allowed = new Set(["source", "expected-source-sha", "root"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`unknown option --${key}`);
    if (values.has(key)) throw new Error(`duplicate option --${key}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`option --${key} requires a value`);
    values.set(key, next);
    index += 1;
  }
  const source = path.resolve(values.get("source") ?? DEFAULT_SOURCE);
  const expectedSourceSha = values.get("expected-source-sha") ?? BASELINE_SOURCE_SHA;
  if (!SHA256.test(expectedSourceSha)) throw new Error("--expected-source-sha must be a SHA-256 hex digest");
  return {
    source,
    expectedSourceSha: expectedSourceSha.toLowerCase(),
    root: path.resolve(values.get("root") ?? DEFAULT_ROOT),
  };
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function sourceGuard(options) {
  const actual = sha256File(options.source);
  assert.equal(actual, options.expectedSourceSha, "lifecycle source must match the explicit probe pin");
  return { path: options.source, sha256: actual };
}

function hasDeclaration(sourceText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:function|class)\\s+${escaped}\\b|(?:const|let|var)\\s+${escaped}\\b`).test(sourceText);
}

function makeExportOnlySeam(options) {
  const seamDir = path.join(options.root, "source-overlay", "implementation-evidence", "native-release");
  const protocolDir = path.join(options.root, "source-overlay", "deep-review", "lib");
  fs.mkdirSync(seamDir, { recursive: true });
  fs.mkdirSync(protocolDir, { recursive: true });
  const sourceText = fs.readFileSync(options.source, "utf8");
  const names = [
    "inspectNative",
    "NativeRpcSession",
    "buildNativeAssignments",
    "native10RequiredReadPaths",
    "native10TaskDescriptors",
    "prepareNative10TaskDescriptors",
    "profileTask",
    "NATIVE10_ASSIGNMENTS",
  ].filter((name) => hasDeclaration(sourceText, name));
  assert.ok(names.includes("inspectNative"), "the export-only seam must expose the actual inspectNative consumer");
  assert.ok(names.includes("NativeRpcSession"), "the export-only seam must expose the host terminal/read consumer");
  const seam = path.join(seamDir, "lifecycle.seam.mjs");
  fs.writeFileSync(
    seam,
    `${sourceText}\n\n// TEMP export-only seam; never part of the product.\nexport { ${names.join(", ")} };\n`,
    "utf8",
  );
  fs.copyFileSync(path.join(SOURCE_DIR, "technical-retry-scenario.mjs"), path.join(seamDir, "technical-retry-scenario.mjs"));
  fs.copyFileSync(path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs"), path.join(protocolDir, "protocol.mjs"));
  return seam;
}

async function loadApis(options) {
  const seam = makeExportOnlySeam(options);
  const module = await import(`${pathToFileURL(seam).href}?descriptor-red=${Date.now()}`);
  assert.equal(typeof module.inspectNative, "function", "the export-only seam must expose inspectNative");
  assert.equal(typeof module.NativeRpcSession, "function", "the export-only seam must expose NativeRpcSession");
  assert.equal(typeof module.buildNativeAssignments, "function", "the export-only seam must expose buildNativeAssignments");
  return module;
}

function fixture(root, label) {
  const project = path.join(root, label);
  fs.mkdirSync(path.join(project, ".omp", "state"), { recursive: true });
  return {
    project,
    logicalRunId: `native10-descriptor-${label}-run`,
  };
}

function descriptorRelativePath(name) {
  return `.omp/state/native10-tasks/${name}.json`;
}

function canonicalDescriptorFromBody(name, agent, runId, revision, body) {
  const descriptor = {
    schema_version: 1,
    kind: "NATIVE10_ROLE_TASK",
    name,
    agent,
    run_id: runId,
    source_revision: revision,
    task_lines: body.split("\n"),
  };
  const bytesBuffer = Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
  return {
    name,
    agent,
    path: descriptorRelativePath(name),
    body,
    bytes: bytesBuffer.byteLength,
    sha256: sha256Bytes(bytesBuffer),
    descriptor,
    bytesBuffer,
  };
}

function descriptorRecords(apis, fixtureInfo, revision) {
  const assignments = apis.buildNativeAssignments(fixtureInfo, revision);
  const expectedBodies = new Map(ASSIGNMENTS.map(([agent, name]) => {
    const assignment = assignments.find((item) => item?.name === name && item?.agent === agent);
    assert.ok(assignment, `canonical assignment ${name} must be available for the descriptor fixture`);
    const body = typeof apis.profileTask === "function" ? apis.profileTask(agent, name, fixtureInfo, revision) : assignment.task;
    assert.equal(typeof body, "string", `canonical role task ${name} must be a full string for the fixture descriptor`);
    return [name, { agent, body }];
  }));
  const fallback = ASSIGNMENTS.map(([agent, name]) => canonicalDescriptorFromBody(
    name,
    agent,
    fixtureInfo.logicalRunId,
    revision,
    expectedBodies.get(name).body,
  ));
  if (typeof apis.native10TaskDescriptors !== "function") return fallback;

  const produced = apis.native10TaskDescriptors(fixtureInfo, revision);
  assert.ok(Array.isArray(produced), "native10TaskDescriptors must return an array of records");
  assert.equal(produced.length, ASSIGNMENTS.length, "native10TaskDescriptors must retain exactly six role descriptors");
  return fallback.map((expected) => {
    const actual = produced.find((item) => item?.name === expected.name && item?.agent === expected.agent);
    assert.ok(actual, `native10TaskDescriptors must include ${expected.name}`);
    assert.equal(actual.path, expected.path, `${expected.name} descriptor path must be canonical`);
    assert.equal(actual.body, expected.body, `${expected.name} descriptor body must be the full canonical role task`);
    assert.equal(actual.bytes, expected.bytes, `${expected.name} descriptor byte count must cover the exact JSON bytes`);
    assert.equal(actual.sha256, expected.sha256, `${expected.name} descriptor hash must cover the exact JSON bytes`);
    return { ...expected, ...actual, descriptor: expected.descriptor, bytesBuffer: expected.bytesBuffer };
  });
}

function writeDescriptorFiles(fixtureInfo, descriptors) {
  for (const descriptor of descriptors) {
    const file = path.join(fixtureInfo.project, descriptor.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, descriptor.bytesBuffer, { flag: "wx" });
    const actual = fs.readFileSync(file);
    assert.equal(actual.byteLength, descriptor.bytes, `${descriptor.name} fixture descriptor bytes must be deterministic`);
    assert.equal(sha256Bytes(actual), descriptor.sha256, `${descriptor.name} fixture descriptor hash must be deterministic`);
  }
}

function hostStateResponse(label) {
  return {
    type: "response",
    command: "get_state",
    id: `state|native10-descriptor|${label}`,
    success: true,
    data: { sessionId: `${ROOT_SESSION_ID}|${label}` },
  };
}

function rootStart(toolCallId, assignments) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId,
    args: {
      context: "Bounded Native10 file-backed descriptor consumer probe.",
      tasks: assignments,
    },
  };
}

function progressRow(item, id, index) {
  return {
    id,
    index,
    agent: item.agent,
    agentSource: "project",
  };
}

function terminalStructuredData(agent, runId, revision) {
  if (agent === "requirements-reader") {
    return { protocol: "REQUIREMENTS_READING_V1", role: agent, status: "COMPLETE", run_id: runId, source_revision: revision };
  }
  if (agent === "architect") {
    return { protocol: "ARCHITECTURE_ANALYSIS_V1", role: agent, status: "COMPLETE", run_id: runId, source_revision: revision };
  }
  if (agent === "deep-reviewer") {
    return {
      agent,
      protocol_mode: "DEEP_REVIEW",
      status: "VALID",
      reviewed_revision: revision,
      explanation: "Bounded descriptor consumer fixture.",
      confidence: 0.99,
      overall_correctness: "correct",
      findings: [],
    };
  }
  if (agent === "peer-reviewer") {
    return {
      agent,
      protocol_mode: "TDD_PEER_REVIEW",
      status: "APROVADO",
      reviewed_revision: revision,
      explanation: "Bounded descriptor consumer fixture.",
      confidence: 0.99,
      overall_correctness: "correct",
      findings: [],
    };
  }
  return { status: "PASS", run_id: runId, source_revision: revision };
}

function terminalResult(item, fixtureInfo, revision, allocatedId) {
  return {
    id: allocatedId,
    status: "completed",
    exitCode: 0,
    isError: false,
    output: "bounded host-shaped Native10 profile terminal\n",
    structuredOutput: { source: "agent", mode: "strict", status: "valid", data: terminalStructuredData(item.agent, fixtureInfo.logicalRunId, revision) },
  };
}

function lifecycleStart(id, item, index) {
  return {
    type: "subagent_lifecycle",
    payload: {
      id,
      index,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: ROOT_CALL_ID,
      status: "started",
    },
  };
}

function subagentEvent(id, item, event) {
  return {
    type: "subagent_event",
    payload: {
      id,
      agent: item.agent,
      agentSource: "project",
      event,
    },
  };
}

function nestedReadFrame(pathValue, toolCallId, phase, isError = false) {
  const fullRead = { full_content_requested: true };
  const frame = {
    type: `tool_execution_${phase}`,
    toolName: "read",
    toolCallId,
    read: fullRead,
    full_content_requested: true,
    args: { path: pathValue, full_content_requested: true },
  };
  if (phase === "end") {
    frame.isError = isError;
    frame.result = { content: [] };
  }
  return frame;
}

function nestedWriteStart(toolCallId) {
  return {
    type: "tool_execution_start",
    toolName: "write",
    toolCallId,
    args: { path: DOC_PATH, content: "bounded descriptor ordering fixture\n" },
  };
}

function nestedBashStart(toolCallId) {
  return {
    type: "tool_execution_start",
    toolName: "bash",
    toolCallId,
    args: { command: VALIDATOR_COMMAND },
  };
}

function rootReadFrames(pathValue, toolCallId) {
  return [
    {
      type: "tool_execution_start",
      toolName: "read",
      toolCallId,
      read: { full_content_requested: true },
      full_content_requested: true,
      args: { path: pathValue, full_content_requested: true },
    },
    {
      type: "tool_execution_end",
      toolName: "read",
      toolCallId,
      read: { full_content_requested: true },
      full_content_requested: true,
      args: { path: pathValue, full_content_requested: true },
      isError: false,
      result: { content: [] },
    },
  ];
}

function rootEnd(toolCallId, jobId, assignments, ids, results) {
  return {
    type: "tool_execution_end",
    toolName: "task",
    toolCallId,
    isError: false,
    result: {
      details: {
        results,
        progress: assignments.map((item, index) => progressRow(item, ids[index], index)),
        async: { state: "running", jobId, type: "task" },
      },
    },
  };
}

function createSession(apis, fixtureInfo, assignments, label) {
  const session = new apis.NativeRpcSession({
    omp: "offline-native10-descriptor-red",
    cwd: fixtureInfo.project,
    timeoutMs: 1_000,
    assignments,
    logicalRunId: fixtureInfo.logicalRunId,
    label,
  });
  session.bindSourceHost(hostStateResponse(label), `state|native10-descriptor|${label}`, `prompt|native10-descriptor|${label}`);
  return session;
}

function descriptorIndex(name) {
  const index = ASSIGNMENTS.findIndex(([, expectedName]) => expectedName === name);
  assert.notEqual(index, -1, `known Native10 assignment ${name}`);
  return index;
}

function buildEvidence(apis, fixtureInfo, descriptors, options = {}) {
  const assignments = apis.buildNativeAssignments(fixtureInfo, REVISION);
  assert.deepEqual(
    assignments.map((item) => [item.agent, item.name]),
    ASSIGNMENTS,
    "Native10 must retain exactly the six canonical role/name assignments",
  );
  const session = createSession(apis, fixtureInfo, assignments, options.label ?? "positive");
  const ids = assignments.map((item, index) => `native10-descriptor-child-${index}`);

  const rootReadIndices = Number.isSafeInteger(options.rootOnlyIndex)
    ? [options.rootOnlyIndex]
    : descriptors.map((_, index) => index);
  for (const index of rootReadIndices) {
    const descriptor = descriptors[index];
    for (const frame of rootReadFrames(descriptor.path, `root-read|descriptor|${index}`)) session.recordTool(frame);
  }

  for (let index = 0; index < assignments.length; index += 1) {
    session.consumeLogical(lifecycleStart(ids[index], assignments[index], index));
  }
  session.recordTool(rootStart(ROOT_CALL_ID, assignments));
  session.recordTool(rootEnd(
    ROOT_CALL_ID,
    ROOT_JOB_ID,
    assignments,
    ids,
    assignments.map((item, index) => terminalResult(item, fixtureInfo, REVISION, ids[index])),
  ));

  for (let index = 0; index < assignments.length; index += 1) {
    const assignment = assignments[index];
    const name = assignment.name;
    const id = ids[index];
    if (options.skipReadName === name) continue;

    if (options.actionBeforeReadName === name) {
      const actionId = `action-before-read|${name}`;
      if (assignment.agent === "spec-kit-author") session.consumeLogical(subagentEvent(id, assignment, nestedWriteStart(actionId)));
      if (assignment.agent === "validator") session.consumeLogical(subagentEvent(id, assignment, nestedBashStart(actionId)));
    }

    const descriptor = descriptors[index];
    const requestedPath = options.rangedReadName === name ? `${descriptor.path}${options.rangeSelector ?? ":1"}`
      : options.queryReadName === name ? `${descriptor.path}?q=.task_lines[0]` : descriptor.path;
    const readId = `descriptor-read|${name}`;
    for (const phase of ["start", "end"]) {
      const event = nestedReadFrame(requestedPath, readId, phase, phase === "end" && options.failedReadName === name);
      if (options.partialEnvelope && name === "Native10Architect") {
        const args = { path: requestedPath, offset: 0, limit: 1 };
        delete event.args;
        if (options.partialEnvelope === "toolCall" || options.partialEnvelope === "tool_call") event[options.partialEnvelope] = { arguments: args };
        else event[options.partialEnvelope] = args;
      }
      session.consumeLogical(subagentEvent(id, assignment, event));
    }
  }

  const evidence = structuredClone(session.evidence);
  if (typeof options.mutateRead === "function") {
    const targetName = options.mutateReadName ?? assignments[0].name;
    const target = evidence.subagent_reads.find((item) => item.assignment_id === targetName);
    assert.ok(target, `positive fixture must expose the ${targetName} descriptor read for mutation`);
    options.mutateRead(target, evidence, targetName);
  }
  return { evidence, assignments, ids };
}

function profileFor(result, name) {
  assert.ok(Array.isArray(result?.profiles), "inspectNative must expose profile results");
  const profile = result.profiles.find((item) => item?.name === name);
  assert.ok(profile, `inspectNative must expose profile ${name}`);
  return profile;
}

function expectedBinding(name, ids) {
  const index = descriptorIndex(name);
  return {
    allocated_id: ids[index],
    parent_tool_call_id: ROOT_CALL_ID,
    index,
    agent: ASSIGNMENTS[index][0],
    agentSource: "project",
  };
}

function assertDescriptorProof(profile, descriptor, binding, label) {
  assert.equal(profile.status, "PASS", `${label} profile must be accepted only with a valid descriptor read`);
  const proof = profile.descriptor_read;
  assert.ok(proof && typeof proof === "object", `${label} profile must expose descriptor_read proof`);
  assert.equal(proof.status, "PASS", `${label} descriptor read must be successful`);
  assert.equal(proof.path, descriptor.path, `${label} descriptor proof must retain the exact relative path`);
  assert.equal(proof.full_content_requested, true, `${label} descriptor proof must carry the explicit full-content read marker`);
  assert.equal(proof.sha256, descriptor.sha256, `${label} descriptor proof must retain the read-time SHA-256`);
  assert.equal(proof.bytes, descriptor.bytes, `${label} descriptor proof must retain the read-time byte count`);
  assert.deepEqual(proof.binding, binding, `${label} descriptor proof must bind the exact allocated child/parent/index/role tuple`);
}

function assertPositiveProfiles(result, descriptors, ids, label) {
  assert.equal(result.status, "PENDING", `${label} minimal fixture must remain PENDING rather than faking whole Native10 PASS`);
  assert.deepEqual(
    result.profiles.map((item) => [item.agent, item.name]),
    ASSIGNMENTS,
    `${label} must expose all six actual Native10 profile results in canonical order`,
  );
  for (let index = 0; index < ASSIGNMENTS.length; index += 1) {
    const [agent, name] = ASSIGNMENTS[index];
    const profile = profileFor(result, name);
    assert.equal(profile.agent, agent, `${label} ${name} must retain its canonical role`);
    assertDescriptorProof(profile, descriptors[index], expectedBinding(name, ids), `${label} ${name}`);
  }
}

function inspect(apis, fixtureInfo, evidence) {
  return apis.inspectNative(evidence, fixtureInfo, REVISION, null);
}

function positiveAllSixBoundReads(apis, root) {
  const fixtureInfo = fixture(root, "positive-all-six-bound-reads");
  const descriptors = descriptorRecords(apis, fixtureInfo, REVISION);
  writeDescriptorFiles(fixtureInfo, descriptors);
  const { evidence, ids } = buildEvidence(apis, fixtureInfo, descriptors, { label: "positive-all-six-bound-reads" });
  const result = inspect(apis, fixtureInfo, evidence);
  assertPositiveProfiles(result, descriptors, ids, "positive all-six bound reads");
  const requiredDescriptorRows = result.root_reads.filter((row) => descriptors.some((descriptor) => descriptor.path === row?.path));
  assert.deepEqual(
    requiredDescriptorRows.map((row) => row.path).sort(),
    descriptors.map((descriptor) => descriptor.path).sort(),
    "native10RequiredReadPaths/inspectNative must retain all six descriptor paths as Root-required reads",
  );
  for (const row of requiredDescriptorRows) {
    assert.ok(Number.isSafeInteger(row.sequence), `Root descriptor read ${row.path} must have a successful read-time sequence`);
  }
}

function refusalCase(apis, root, label, options, reason) {
  const fixtureInfo = fixture(root, label);
  const descriptors = descriptorRecords(apis, fixtureInfo, REVISION);
  writeDescriptorFiles(fixtureInfo, descriptors);
  const { evidence, ids } = buildEvidence(apis, fixtureInfo, descriptors, { label, ...options });
  const result = inspect(apis, fixtureInfo, evidence);
  assert.equal(result.status, "PENDING", `${label} must not claim whole Native10 PASS`);
  const targetName = options.mutateReadName ?? options.skipReadName ?? options.actionBeforeReadName ?? options.failedReadName ?? options.rangedReadName;
  assert.ok(targetName, `${label} must identify one target profile`);
  const target = profileFor(result, targetName);
  assert.equal(target.status, "PENDING", `${reason}: ${targetName} must be refused by the profile consumer`);
  const proof = target.descriptor_read;
  assert.ok(proof && typeof proof === "object", `${reason}: ${targetName} must expose a refused descriptor proof`);
  assert.notEqual(proof.status, "PASS", `${reason}: ${targetName} descriptor proof must not pass`);
  if (options.actionBeforeReadName) {
    const targetRead = evidence.subagent_reads.find((item) => item.assignment_id === targetName);
    assert.ok(targetRead, `${label} must retain the target descriptor read after its own action`);
    const actions = options.actionBeforeReadName === "Native10SpecKitAuthor" ? evidence.subagent_writes : evidence.command_results;
    const actionStart = actions.find((item) =>
      item.allocated_id === targetRead.allocated_id
      && item.parent_tool_call_id === targetRead.parent_tool_call_id
      && item.phase === "start"
      && Number.isSafeInteger(item.host_arrival_ordinal),
    );
    assert.ok(actionStart, `${label} must retain the target role action START`);
    assert.ok(
      actionStart.host_arrival_ordinal < targetRead.host_arrival_ordinal,
      `${label} must place the descriptor read END after the role action START by host_arrival_ordinal`,
    );
  }
  for (const [index, [, name]] of ASSIGNMENTS.entries()) {
    if (name === targetName) continue;
    const profile = profileFor(result, name);
    assertDescriptorProof(profile, descriptors[index], expectedBinding(name, ids), `${label} unaffected ${name}`);
  }
}

function missingDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "missing-descriptor-read", { skipReadName: "Native10Architect" }, "missing descriptor read");
}

function failedDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "failed-descriptor-read", { failedReadName: "Native10Architect" }, "failed descriptor read");
}

function wrongHashDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "wrong-hash-descriptor-read", {
    mutateReadName: "Native10Architect",
    mutateRead(record) {
      record.source_files[0].sha256 = "f".repeat(64);
    },
  }, "wrong descriptor read hash");
}

function wrongBytesDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "wrong-bytes-descriptor-read", {
    mutateReadName: "Native10Architect",
    mutateRead(record) {
      record.source_files[0].bytes += 1;
    },
  }, "wrong descriptor read byte count");
}
function missingFullContentMarkerIsRefused(apis, root) {
  refusalCase(apis, root, "missing-full-content-marker", {
    mutateReadName: "Native10Architect",
    mutateRead(record) {
      delete record.full_content_requested;
    },
  }, "descriptor read without an explicit full-content marker");
}

function foreignChildDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "foreign-child-descriptor-read", {
    mutateReadName: "Native10Architect",
    mutateRead(record) {
      record.allocated_id = "foreign-native10-child";
    },
  }, "foreign child descriptor read");
}

function foreignParentDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "foreign-parent-descriptor-read", {
    mutateReadName: "Native10Architect",
    mutateRead(record) {
      record.parent_tool_call_id = "foreign-native10-parent";
    },
  }, "foreign parent descriptor read");
}

function reboundIndexDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "rebound-index-descriptor-read", {
    mutateReadName: "Native10Architect",
    mutateRead(record) {
      record.index = 99;
    },
  }, "rebound index descriptor read");
}

function foreignRoleDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "foreign-role-descriptor-read", {
    mutateReadName: "Native10Architect",
    mutateRead(record) {
      record.agent = "validator";
    },
  }, "foreign role descriptor read");
}
function foreignAgentSourceDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "foreign-agent-source-descriptor-read", {
    mutateReadName: "Native10Architect",
    mutateRead(record) {
      record.agentSource = "user";
    },
  }, "foreign agentSource descriptor read");
}


function rangedDescriptorReadIsRefused(apis, root) {
  refusalCase(apis, root, "ranged-descriptor-read", { rangedReadName: "Native10Architect" }, "ranged descriptor read");
}
function alternateLineSelectorsCannotProveFullDescriptorRead(apis, root) {
  for (const [index, rangeSelector] of [":L1-L2", ":1..2", ":raw:1,:2", ":1:raw,2:raw"].entries()) {
    refusalCase(apis, root, "alternate-line-selector-" + index, {
      rangedReadName: "Native10Architect", rangeSelector, mutateReadName: "Native10Architect",
      mutateRead(record) {
        assert.equal(record.full_content_requested, false, "every supported line selector remains a partial-content request");
        assert.ok(record.source_files.length > 0, "partial-content refusal must retain actual base-file provenance");
      },
    }, "alternate line selector descriptor read");
  }
}
function partialArgumentEnvelopesAreRefused(apis, root) {
  for (const envelope of ["arguments", "args", "input", "toolCall", "tool_call"]) {
    refusalCase(apis, root, "partial-envelope-" + envelope, { partialEnvelope: envelope, mutateReadName: "Native10Architect" }, "partial descriptor read via " + envelope);
  }
}

function jsonQueryReadRetainsBaseWithoutFullDescriptorProof(apis, root) {
  assert.doesNotThrow(() => refusalCase(apis, root, "json-query-descriptor-read", {
    queryReadName: "Native10Architect",
    mutateReadName: "Native10Architect",
    mutateRead(record) {
      assert.equal(record.full_content_requested, false, "a JSON selector is not a full-content request");
      assert.ok(record.source_files.length > 0, "the query must retain base-file provenance");
      assert.equal(record.source_files.some((file) => file.path.includes("?q=")), false,
        "the metadata source is the actual JSON file, not its query expression");
    },
  }, "JSON query descriptor read"), "supported JSON selectors must resolve base provenance without satisfying complete task consumption");
}


function rootOnlyDescriptorReadCannotSubstitute(apis, root) {
  refusalCase(apis, root, "root-only-descriptor-read", {
    rootOnlyIndex: descriptorIndex("Native10Architect"),
    skipReadName: "Native10Architect",
  }, "Root-only descriptor read");
}

function descriptorReadAfterSpecWriterActionIsRefused(apis, root) {
  refusalCase(apis, root, "descriptor-read-after-spec-writer-action", {
    actionBeforeReadName: "Native10SpecKitAuthor",
  }, "descriptor read END after spec-kit-author write START");
}

function descriptorReadAfterValidatorActionIsRefused(apis, root) {
  refusalCase(apis, root, "descriptor-read-after-validator-action", {
    actionBeforeReadName: "Native10Validator",
  }, "descriptor read END after validator Bash START");
}

function prepareConflictNeverOverwrites(apis, root) {
  assert.equal(typeof apis.prepareNative10TaskDescriptors, "function", "expected prepareNative10TaskDescriptors feature gap must be implemented before conflict behavior can pass");
  const fixtureInfo = fixture(root, "prepare-conflicting-existing-descriptor");
  const descriptors = descriptorRecords(apis, fixtureInfo, REVISION);
  const target = descriptors[0];
  const file = path.join(fixtureInfo.project, target.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const conflicting = Buffer.from("foreign existing descriptor bytes\n", "utf8");
  fs.writeFileSync(file, conflicting, { flag: "wx" });
  assert.throws(
    () => apis.prepareNative10TaskDescriptors(fixtureInfo, REVISION),
    "preparation must refuse a conflicting existing descriptor",
  );
  assert.deepEqual(fs.readFileSync(file), conflicting, "preparation must never overwrite conflicting descriptor bytes");
}
function prepareExistingRegularBytesAreVerified(apis, root) {
  assert.equal(typeof apis.prepareNative10TaskDescriptors, "function", "expected prepareNative10TaskDescriptors feature gap must be implemented before existing-byte verification can pass");
  const fixtureInfo = fixture(root, "prepare-existing-identical-descriptor");
  const descriptors = descriptorRecords(apis, fixtureInfo, REVISION);
  const target = descriptors[0];
  const file = path.join(fixtureInfo.project, target.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, target.bytesBuffer, { flag: "wx" });
  const before = fs.readFileSync(file);
  assert.doesNotThrow(() => apis.prepareNative10TaskDescriptors(fixtureInfo, REVISION), "preparation may verify but must not rewrite identical descriptor bytes");
  assert.deepEqual(fs.readFileSync(file), before, "preparation must preserve already-identical descriptor bytes");
}

function prepareDirectoryCollisionIsRejected(apis, root) {
  assert.equal(typeof apis.prepareNative10TaskDescriptors, "function", "expected prepareNative10TaskDescriptors feature gap must be implemented before directory collision behavior can pass");
  const fixtureInfo = fixture(root, "prepare-directory-collision");
  const descriptors = descriptorRecords(apis, fixtureInfo, REVISION);
  const target = descriptors[0];
  const file = path.join(fixtureInfo.project, target.path);
  fs.mkdirSync(file, { recursive: true });
  assert.throws(() => apis.prepareNative10TaskDescriptors(fixtureInfo, REVISION), "preparation must reject an existing descriptor directory");
  assert.equal(fs.lstatSync(file).isDirectory(), true, "directory collision must remain a directory after refusal");
}

function prepareHardlinkCollisionIsRejected(apis, root) {
  assert.equal(typeof apis.prepareNative10TaskDescriptors, "function", "expected prepareNative10TaskDescriptors feature gap must be implemented before hardlink collision behavior can pass");
  const fixtureInfo = fixture(root, "prepare-hardlink-collision");
  const descriptors = descriptorRecords(apis, fixtureInfo, REVISION);
  const target = descriptors[0];
  const file = path.join(fixtureInfo.project, target.path);
  const foreign = path.join(fixtureInfo.project, "foreign-descriptor-bytes.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(foreign, Buffer.from("foreign hardlink bytes\n", "utf8"), { flag: "wx" });
  fs.linkSync(foreign, file);
  const before = fs.readFileSync(file);
  assert.ok(fs.lstatSync(file).nlink > 1, "hardlink fixture must expose multiple links");
  assert.throws(() => apis.prepareNative10TaskDescriptors(fixtureInfo, REVISION), "preparation must reject an existing hardlinked descriptor");
  assert.deepEqual(fs.readFileSync(file), before, "hardlink collision must preserve the foreign bytes");
  assert.ok(fs.lstatSync(file).nlink > 1, "hardlink collision must not unlink or replace the foreign inode");
}

function prepareSymlinkCollisionIsRejected(apis, root) {
  assert.equal(typeof apis.prepareNative10TaskDescriptors, "function", "expected prepareNative10TaskDescriptors feature gap must be implemented before symlink collision behavior can pass");
  const fixtureInfo = fixture(root, "prepare-symlink-collision");
  const descriptors = descriptorRecords(apis, fixtureInfo, REVISION);
  const target = descriptors[0];
  const file = path.join(fixtureInfo.project, target.path);
  const foreign = path.join(fixtureInfo.project, "foreign-symlink-target.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(foreign, Buffer.from("foreign symlink bytes\n", "utf8"), { flag: "wx" });
  try { fs.symlinkSync(foreign, file, "file"); }
  catch (error) {
    if (!["EPERM", "ENOTSUP"].includes(error.code)) throw error;
    throw Object.assign(new Error("Platform cannot create the symlink fixture"), { code: "PROBE_PLATFORM_SKIP", cause: error.code });
  }
  const before = fs.readlinkSync(file);
  assert.throws(() => apis.prepareNative10TaskDescriptors(fixtureInfo, REVISION), "preparation must reject an existing descriptor symlink");
  assert.equal(fs.lstatSync(file).isSymbolicLink(), true, "symlink collision must remain a symlink after refusal");
  assert.equal(fs.readlinkSync(file), before, "symlink collision must preserve its foreign target");
}


function isAssertionFailure(error) {
  return error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
}

function safeError(error) {
  return {
    name: error?.name ?? "Error",
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };
}

function executeCase(results, failures, name, run) {
  try {
    run();
    results.push({ name, classification: EXPECTED_CLASSIFICATION, status: "PASS" });
  } catch (error) {
    if (error.code === "PROBE_PLATFORM_SKIP") {
      results.push({ name, classification: "PLATFORM_LIMITATION", status: "SKIP", reason: error.message, platform_error: error.cause });
      return;
    }
    const failure = {
      name,
      classification: EXPECTED_CLASSIFICATION,
      status: "FAIL",
      failure_reason_expected: isAssertionFailure(error),
      error: safeError(error),
    };
    failures.push(failure);
    results.push(failure);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.root, { recursive: true });
  const source = sourceGuard(options);
  const apis = await loadApis(options);
  const root = path.join(options.root, "cases");
  fs.mkdirSync(root, { recursive: true });
  const results = [];
  const failures = [];

  executeCase(results, failures, "all six profile terminals require successful same-child descriptor reads", () => positiveAllSixBoundReads(apis, root));
  executeCase(results, failures, "missing descriptor read is refused while the other five profiles remain bound", () => missingDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "failed descriptor read is refused", () => failedDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "wrong descriptor read hash is refused", () => wrongHashDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "wrong descriptor read byte count is refused", () => wrongBytesDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "foreign child descriptor read is refused", () => foreignChildDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "foreign parent descriptor read is refused", () => foreignParentDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "rebound child index descriptor read is refused", () => reboundIndexDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "foreign role descriptor read is refused", () => foreignRoleDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "foreign agentSource descriptor read is refused", () => foreignAgentSourceDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "ranged descriptor read is refused even with full-file hash and bytes", () => rangedDescriptorReadIsRefused(apis, root));
  executeCase(results, failures, "all supported alternate line selectors refuse complete descriptor credit", () => alternateLineSelectorsCannotProveFullDescriptorRead(apis, root));
  executeCase(results, failures, "partial descriptor reads remain partial across every supported argument envelope", () => partialArgumentEnvelopesAreRefused(apis, root));
  executeCase(results, failures, "JSON query observes base file without proving complete descriptor content", () => jsonQueryReadRetainsBaseWithoutFullDescriptorProof(apis, root));
  executeCase(results, failures, "descriptor read without full-content marker is refused", () => missingFullContentMarkerIsRefused(apis, root));
  executeCase(results, failures, "Root-only descriptor read cannot substitute for the allocated child read", () => rootOnlyDescriptorReadCannotSubstitute(apis, root));
  executeCase(results, failures, "spec-kit-author descriptor read END after own write START is refused", () => descriptorReadAfterSpecWriterActionIsRefused(apis, root));
  executeCase(results, failures, "validator descriptor read END after own Bash START is refused", () => descriptorReadAfterValidatorActionIsRefused(apis, root));
  executeCase(results, failures, "conflicting existing descriptor bytes are never overwritten", () => prepareConflictNeverOverwrites(apis, root));
  executeCase(results, failures, "identical existing descriptor bytes are verified without rewriting", () => prepareExistingRegularBytesAreVerified(apis, root));
  executeCase(results, failures, "existing descriptor directory is rejected without mutation", () => prepareDirectoryCollisionIsRejected(apis, root));
  executeCase(results, failures, "existing hardlinked descriptor is rejected without mutation", () => prepareHardlinkCollisionIsRejected(apis, root));
  executeCase(results, failures, "existing descriptor symlink is rejected without mutation", () => prepareSymlinkCollisionIsRejected(apis, root));

  const expectedFailures = failures.filter((failure) => failure.failure_reason_expected === true);
  const unexpectedFailures = failures.filter((failure) => failure.failure_reason_expected !== true);
  const output = {
    status: unexpectedFailures.length || expectedFailures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "native10-task-descriptor-red",
    source,
    fixtures_root: root,
    criteria_to_tests: {
      "AC-016": results.map((item) => `${TEST_FILE}::${item.name}`),
    },
    cases: results.length,
    cases_run: results,
    harness: {
      expected_red_classification: EXPECTED_CLASSIFICATION,
      expected_failures: expectedFailures.map((failure) => failure.name),
      unexpected_failures: unexpectedFailures.map((failure) => failure.name),
      failure_reason_expected: unexpectedFailures.length === 0 && expectedFailures.length > 0,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (unexpectedFailures.length) {
    const error = new Error("source-only Native10 descriptor RED harness found unexpected failures");
    error.name = "ProbeHarnessError";
    error.code = "ERR_PROBE_UNEXPECTED_FAILURE";
    error.probe = output;
    throw error;
  }
  if (expectedFailures.length) {
    const error = new Error("source-only Native10 descriptor RED assertions failed as expected");
    error.name = "AssertionError";
    error.code = "ERR_ASSERTION";
    error.probe = output;
    throw error;
  }
}

main().catch((error) => {
  const probe = error?.probe ?? {
    status: "FAIL",
    phase: "RED",
    probe: "native10-task-descriptor-red",
    failure_reason_expected: isAssertionFailure(error),
  };
  process.stderr.write(`${JSON.stringify({ ...probe, error: safeError(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
