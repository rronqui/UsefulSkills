#!/usr/bin/env node
// Source-only RED probe for T-011 / AC-016.
//
// This probe exercises the host-side Root read-preparation contract without
// starting OMP/SDK, invoking a model, using a network, or changing runtime
// settings.  The lifecycle source is loaded through a temporary export-only
// seam below the disposable --root fixture.  runRootTurn is replaced only at
// the host boundary with deterministic receipts; read START/END handling and
// file metadata still use the actual NativeRpcSession.recordTool consumer.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_SOURCE = path.join(SOURCE_DIR, "lifecycle.mjs");
const DEFAULT_ROOT = path.resolve(SOURCE_DIR, "../../.test-temp/root-read-preparation-red");
const BASELINE_SOURCE_SHA = "232810836a26ed1570251faf07c9ef1d4a8c2447c0d4005c650521de5a086e2f";
const SHA256 = /^[a-f0-9]{64}$/i;
const TEST_FILE = "implementation-evidence/native-release/root-read-preparation-red-probe.mjs";
const EXPECTED_CLASSIFICATION = "VALID_FINDING:AC-016:native10-root-read-preparation-consumer";
const PREPARATION_READ_LIMIT = 6;
const CAPTURE_BYTES = 16 * 1024 * 1024;
const ROOT_SESSION_PREFIX = "root-read-preparation-session";

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
  assert.ok(hasDeclaration(sourceText, "NativeRpcSession"), "the source-only seam must expose the actual NativeRpcSession class");
  const seam = path.join(seamDir, "lifecycle.seam.mjs");
  const optionalExports = ["fingerprintInstalledPackage"].filter((name) => hasDeclaration(sourceText, name));
  fs.writeFileSync(
    seam,
    `${sourceText}\n\n// TEMP export-only seam; never part of the product.\nexport { NativeRpcSession${optionalExports.map((name) => `, ${name}`).join("")} };\n`,
    "utf8",
  );
  fs.copyFileSync(path.join(SOURCE_DIR, "technical-retry-scenario.mjs"), path.join(seamDir, "technical-retry-scenario.mjs"));
  fs.copyFileSync(path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs"), path.join(protocolDir, "protocol.mjs"));
  return seam;
}

async function loadApis(options) {
  const seam = makeExportOnlySeam(options);
  const module = await import(`${pathToFileURL(seam).href}?root-read-preparation-red=${Date.now()}`);
  assert.equal(typeof module.NativeRpcSession, "function", "the source-only seam must expose NativeRpcSession");
  return module;
}

function fixture(root, label, count = 1) {
  const project = path.join(root, label);
  const directory = path.join(project, ".omp", "state", "root-read-preparation");
  fs.mkdirSync(directory, { recursive: true });
  const files = [];
  for (let index = 0; index < count; index += 1) {
    const relativePath = `.omp/state/root-read-preparation/required-${String(index).padStart(2, "0")}.txt`;
    const absolutePath = path.join(project, relativePath);
    const bytes = Buffer.from(`fixture-${label}-${index}\n`, "utf8");
    fs.writeFileSync(absolutePath, bytes);
    files.push({ relativePath, absolutePath, bytes, sha256: sha256Bytes(bytes) });
  }
  return {
    project,
    logicalRunId: `${ROOT_SESSION_PREFIX}-${label}-run`,
    files,
  };
}

function childAssignment() {
  return {
    name: "RootPreparationChild",
    agent: "requirements-reader",
    task: "read one bounded preparation fixture",
    solutionSpace: "read-only preparation fixture",
  };
}

function createSession(apis, fixtureInfo, preparationPaths, label, options = {}) {
  const session = new apis.NativeRpcSession({
    omp: "offline-root-read-preparation",
    cwd: fixtureInfo.project,
    readRoot: options.readRoot,
    timeoutMs: 1_000,
    assignments: options.assignments ?? [],
    logicalRunId: fixtureInfo.logicalRunId,
    label,
    rootPreparationPaths: preparationPaths,
    ...(options.rootWritePolicy ? { rootWritePolicy: options.rootWritePolicy } : {}),
  });
  assert.equal(typeof session.bindSourceHost, "function", "the existing host binding seam must remain available");
  const stateRequestId = `state|${label}`;
  const promptRequestId = `prompt|${label}`;
  const rootSessionId = `${ROOT_SESSION_PREFIX}-${label}`;
  session.bindSourceHost(
    {
      type: "response",
      command: "get_state",
      id: stateRequestId,
      success: true,
      data: { sessionId: rootSessionId },
    },
    stateRequestId,
    promptRequestId,
  );
  return session;
}

function requirePreparationApi(session, label) {
  assert.equal(typeof session.prepareRootReads, "function", `${label}: NativeRpcSession must expose prepareRootReads()`);
  assert.equal(typeof session.runRootTurn, "function", `${label}: NativeRpcSession must expose runRootTurn()`);
}

function rootReadFrames(relativePath, toolCallId, isError = false) {
  const read = { full_content_requested: true };
  return [
    {
      type: "tool_execution_start",
      toolName: "read",
      toolCallId,
      read,
      full_content_requested: true,
      args: { path: relativePath, full_content_requested: true },
    },
    {
      type: "tool_execution_end",
      toolName: "read",
      toolCallId,
      read,
      full_content_requested: true,
      args: { path: relativePath, full_content_requested: true },
      isError,
      result: { content: [] },
    },
  ];
}

function recordRootRead(session, relativePath, toolCallId, isError = false) {
  for (const frame of rootReadFrames(relativePath, toolCallId, isError)) session.recordTool(frame);
}

function relativeRequestPath(project, requested) {
  if (typeof requested !== "string") return null;
  const resolved = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(project, requested);
  return path.relative(project, resolved).replaceAll("\\", "/");
}

function makeReceipt(rootSessionId, promptRequestId, overrides = {}) {
  return {
    root_session_id: rootSessionId,
    prompt_request_id: promptRequestId,
    prompt_result_status: "completed",
    agent_invoked: true,
    session_settled: true,
    agent_end_terminal: true,
    awaiting_async: false,
    ...overrides,
  };
}

function installRootTurnStub(session, fixtureInfo, options = {}) {
  const turns = [];
  const stableRootSessionId = session.evidence?.root_session?.session_id ?? `${ROOT_SESSION_PREFIX}-stub`;
  session.runRootTurn = async (_message, callOptions = {}) => {
    const index = turns.length;
    const scope = callOptions?.scope ?? null;
    const requiredPaths = Array.isArray(callOptions?.requiredPaths) ? callOptions.requiredPaths.slice() : [];
    const turn = {
      index,
      scope,
      requiredPaths,
      options_keys: Object.keys(callOptions ?? {}).sort(),
      active_samples: [],
      root_session_id: null,
      receipt: null,
    };
    turns.push(turn);
    if (scope === "preparation" && typeof options.onPreparation === "function") {
      options.onPreparation({ index, requiredPaths, turn, recordActive() { turn.active_samples.push(session.rootPreparationActive === true); } });
    }
    const rootSessionId = typeof options.rootSessionForTurn === "function"
      ? options.rootSessionForTurn({ index, scope, requiredPaths, turn })
      : stableRootSessionId;
    turn.root_session_id = rootSessionId;
    let receipt = makeReceipt(rootSessionId, `${session.evidence?.label ?? "root"}|prompt|${index}`);
    if (typeof options.receiptForTurn === "function") {
      receipt = options.receiptForTurn({ index, scope, requiredPaths, turn, receipt, session });
    }
    turn.receipt = receipt;
    if (typeof options.afterTurn === "function") options.afterTurn({ index, scope, requiredPaths, turn, receipt, session });
    return receipt;
  };
  return turns;
}

function recordPreparationChunk(session, fixtureInfo, requiredPaths, turn, options = {}) {
  for (let index = 0; index < requiredPaths.length; index += 1) {
    turn.active_samples.push(session.rootPreparationActive === true);
    const relativePath = relativeRequestPath(fixtureInfo.project, requiredPaths[index]);
    if (relativePath === null) continue;
    const failed = options.failedIndex === index;
    recordRootRead(session, relativePath, `root-preparation-read|${turn.index}|${index}`, failed);
    turn.active_samples.push(session.rootPreparationActive === true);
  }
}

function readEndEvents(session) {
  return session.evidence.tool_events.filter((event) => event.tool === "read" && event.type === "tool_execution_end");
}

function assertPreparationEvidence(session, preparationTurns, label) {
  const records = session.evidence?.rpc?.preparation_prompts;
  assert.ok(Array.isArray(records), `${label}: evidence.rpc.preparation_prompts must be an array`);
  assert.equal(records.length, preparationTurns.length, `${label}: every preparation turn must have one bounded evidence record`);
  assert.ok(Buffer.byteLength(JSON.stringify(records), "utf8") <= CAPTURE_BYTES, `${label}: preparation prompt evidence must stay within the capture bound`);
  for (let index = 0; index < preparationTurns.length; index += 1) {
    const record = records[index];
    assert.equal(record?.scope, "preparation", `${label}: preparation evidence must not be final execution evidence`);
    const storedPaths = record?.required_paths ?? record?.requiredPaths;
    assert.deepEqual(storedPaths, preparationTurns[index].requiredPaths, `${label}: preparation evidence must retain the bounded path chunk`);
    const receipt = record?.receipt && typeof record.receipt === "object" ? record.receipt : record;
    assert.equal(typeof receipt?.prompt_request_id, "string", `${label}: preparation receipt must retain its correlated prompt request id`);
    assert.equal(receipt?.prompt_result_status, "completed", `${label}: preparation receipt must retain completed prompt settlement`);
    assert.equal(receipt?.agent_invoked, true, `${label}: preparation receipt must retain agent invocation`);
    assert.equal(receipt?.session_settled, true, `${label}: preparation receipt must retain session settlement`);
    assert.equal(receipt?.agent_end_terminal, true, `${label}: preparation receipt must retain terminal agent_end`);
    assert.equal(receipt?.awaiting_async, false, `${label}: preparation receipt must not await asynchronous work`);
  }
  assert.equal(records.some((record) => record?.scope === "execution"), false, `${label}: final execution must never be stored as preparation evidence`);
}

function assertAllRootReadsObserved(session, fixtureInfo, expectedFiles, label) {
  const ends = readEndEvents(session);
  assert.equal(ends.length, expectedFiles.length, `${label}: every required path must have one observed Root read END`);
  const observed = new Map();
  for (const event of ends) {
    assert.equal(event.read_correlation?.status, "matched", `${label}: each Root read END must be matched to its START`);
    assert.ok(Array.isArray(event.source_files) && event.source_files.length === 1, `${label}: each successful Root read END must retain one actual file record`);
    const file = event.source_files[0];
    observed.set(file.path, file);
  }
  assert.deepEqual([...observed.keys()].sort(), expectedFiles.map((file) => file.relativePath).sort(), `${label}: no required Root path may be skipped`);
  for (const expected of expectedFiles) {
    const actual = observed.get(expected.relativePath);
    assert.equal(actual.bytes, expected.bytes.byteLength, `${label}: ${expected.relativePath} must retain actual read-time bytes`);
    assert.equal(actual.sha256, expected.sha256, `${label}: ${expected.relativePath} must retain the actual read-time SHA-256`);
  }
}

function compoundReadSelectorsRetainActualFileMetadata(apis, root) {
  const selectors = [":1-1:raw,1-1:raw", ":raw:1-1,:1-1", ":L1-L1", ":1..1:raw"];
  for (const [index, selector] of selectors.entries()) {
    const fixtureInfo = fixture(root, `compound-selector-${index}`, 1);
    const session = createSession(apis, fixtureInfo, [], `compound-selector-${index}`);
    let readError = null;
    try { recordRootRead(session, fixtureInfo.files[0].relativePath + selector, `compound-read-${index}`); }
    catch (error) { readError = { code: error.code ?? null, message: String(error.message) }; }
    assert.equal(readError, null, "documented compound selectors must address the actual project file, not a fictitious selector-suffixed filename");
    assertAllRootReadsObserved(session, fixtureInfo, fixtureInfo.files, "compound selector read");
  }
}

function literalSelectorLookingFilenameWins(apis, root) {
  const fixtureInfo = fixture(root, "literal-selector-filename", 1);
  const relativePath = fixtureInfo.files[0].relativePath + ":1-2:raw";
  const bytes = Buffer.from("literal filename bytes, not the unselected base file\n", "utf8");
  const absolutePath = path.join(fixtureInfo.project, relativePath);
  fs.writeFileSync(absolutePath, bytes);
  const session = createSession(apis, fixtureInfo, [], "literal-selector-filename");
  recordRootRead(session, relativePath, "literal-selector-read");
  assertAllRootReadsObserved(session, fixtureInfo, [{ relativePath, absolutePath, bytes, sha256: sha256Bytes(bytes) }], "literal filename precedence");
}

async function isolatedRetryCwdContainsActualProjectPolicies(apis, root) {
  const owner = fixture(root, "isolated-retry-project-policies", 0);
  const inputs = [
    [".omp/skills/tdd-orchestrator/references/quality-policy.md", "private quality policy bytes\n"],
    [".omp/skills/tdd-orchestrator/references/model-policy.md", "private model policy bytes\n"],
    [".omp/agents/validator.md", "private requested validator profile bytes\n"],
  ].map(([relativePath, content]) => {
    const absolutePath = path.join(owner.project, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const bytes = Buffer.from(content, "utf8");
    fs.writeFileSync(absolutePath, bytes);
    return { relativePath, absolutePath, bytes, sha256: sha256Bytes(bytes) };
  });
  const retryFixture = { project: path.join(owner.project, ".omp/state/native09-technical-retry"), logicalRunId: owner.logicalRunId };
  fs.mkdirSync(retryFixture.project, { recursive: true });
  const allowedWrite = path.join(retryFixture.project, "app/bin/quality.mjs");
  fs.mkdirSync(path.dirname(allowedWrite), { recursive: true });
  fs.writeFileSync(allowedWrite, "private application sentinel\n");
  const session = createSession(apis, retryFixture, [], "isolated-retry-policy-reader", {
    readRoot: owner.project, rootWritePolicy: { paths: [allowedWrite] },
  });
  let readError = null;
  try {
    recordRootRead(session, "../../agents/validator.md", "retry-parent-validator-profile");
    recordRootRead(session, "../../skills/tdd-orchestrator/references/quality-policy.md", "retry-parent-quality-policy");
    recordRootRead(session, "skill://tdd-orchestrator/references/model-policy.md", "retry-parent-model-policy");
  } catch (error) { readError = { code: error.code ?? null, message: String(error.message) }; }
  assert.equal(readError, null, "a nested command cwd must retain read access to its approved private project assets");
  const expected = inputs.map((input) => ({ ...input, relativePath: path.relative(retryFixture.project, input.absolutePath).replaceAll("\\", "/") }));
  assertAllRootReadsObserved(session, retryFixture, expected, "approved private project read root");
  const narrow = createSession(apis, retryFixture, [], "default-cwd-read-boundary");
  await expectBlocked(() => recordRootRead(narrow, "../../agents/validator.md", "unapproved-parent-read"), "default read root remains the cwd");
  const foreignPath = path.join(root, "unapproved-foreign-profile.txt");
  fs.writeFileSync(foreignPath, "foreign sentinel\n");
  await expectBlocked(() => recordRootRead(session, foreignPath, "foreign-project-read"), "read beyond approved private project");
  await expectBlocked(() => session.recordTool({ type: "tool_execution_start", toolName: "write", toolCallId: "parent-write-refused",
    args: { path: inputs[2].absolutePath, content: "must never replace project profile" } }), "read-only parent project does not expand the cwd write boundary");
  assert.deepEqual(fs.readFileSync(inputs[2].absolutePath), inputs[2].bytes, "approved parent profile bytes remain unchanged");
}

async function installedPackageFingerprintSeparatesOwnedRuntimeState(apis, root) {
  assert.equal(typeof apis.fingerprintInstalledPackage, "function", "installed package preservation requires an explicit package/runtime-state boundary");
  const fixtureInfo = fixture(root, "installed-package-runtime-boundary", 0);
  const packageRoot = path.join(fixtureInfo.project, ".omp");
  const protectedPath = "skills/tdd-orchestrator/state/static.json";
  const protectedBytes = Buffer.from('{"protected":true}\n', "utf8");
  fs.mkdirSync(path.dirname(path.join(packageRoot, protectedPath)), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, protectedPath), protectedBytes);
  fs.writeFileSync(path.join(packageRoot, "package-manifest.json"), JSON.stringify([{ destination: protectedPath, bytes: protectedBytes.length, sha256: sha256Bytes(protectedBytes) }]));
  const ownedBefore = apis.fingerprintInstalledPackage(packageRoot, "owned package", true);
  const entireBefore = apis.fingerprintInstalledPackage(packageRoot, "entire supplied root", false);
  const controlState = path.join(packageRoot, "state", "actual-runtime-receipt.json");
  fs.writeFileSync(controlState, '{"observed":"new runtime state"}\n');
  const ownedAfter = apis.fingerprintInstalledPackage(packageRoot, "owned package", true);
  const entireAfter = apis.fingerprintInstalledPackage(packageRoot, "entire supplied root", false);
  assert.equal(ownedAfter.sha256, ownedBefore.sha256, "mutable control receipts must not invalidate unchanged installed package bytes");
  assert.notEqual(entireAfter.sha256, entireBefore.sha256, "an explicitly supplied whole immutable root must not silently exclude its state directory");
  assert.ok(ownedAfter.files.some((file) => file.path === protectedPath), "a state directory inside a shipped skill remains protected package content");
  fs.writeFileSync(path.join(packageRoot, protectedPath), '{"protected":false}\n');
  await expectBlocked(() => apis.fingerprintInstalledPackage(packageRoot, "tampered package", true), "packaged nested-state mutation");
}

async function expectBlocked(action, label) {
  let error = null;
  try {
    await action();
  } catch (candidate) {
    error = candidate;
  }
  if (!error) assert.fail(`${label}: expected a refusal/blocking error`);
  if (error?.name === "TypeError") {
    const unexpected = new Error(`${label}: refusal was an incidental TypeError, not the contract guard`);
    unexpected.name = "UnexpectedProbeFailure";
    throw unexpected;
  }
  assert.ok(error && typeof error === "object", `${label}: refusal must expose a structured error`);
}

function rootTaskStart(toolCallId, assignment) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId,
    args: { tasks: assignment ? [assignment] : [] },
  };
}

function rootTaskEnd(toolCallId, childId, assignment) {
  return {
    type: "tool_execution_end",
    toolName: "task",
    toolCallId,
    isError: false,
    result: {
      details: {
        results: [],
        progress: assignment ? [{ id: childId, index: 0, agent: assignment.agent, agentSource: "project" }] : [],
        async: { state: "running", jobId: `${toolCallId}|job`, type: "task" },
      },
    },
  };
}

function nestedReadFrame(relativePath, toolCallId, phase) {
  const frame = {
    type: `tool_execution_${phase}`,
    toolName: "read",
    toolCallId,
    read: { full_content_requested: true },
    full_content_requested: true,
    args: { path: relativePath, full_content_requested: true },
  };
  if (phase === "end") {
    frame.isError = false;
    frame.result = { content: [] };
  }
  return frame;
}

function childEvent(childId, assignment, event) {
  return {
    type: "subagent_event",
    payload: {
      id: childId,
      agent: assignment.agent,
      agentSource: "project",
      event,
    },
  };
}

function seedChildOnlyRead(session, fixtureInfo, relativePath) {
  const assignment = childAssignment();
  const rootToolCallId = "root-preparation-child-task";
  const childId = "root-preparation-child";
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: assignment.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  session.recordTool(rootTaskStart(rootToolCallId, assignment));
  session.recordTool(rootTaskEnd(rootToolCallId, childId, assignment));
  session.consumeLogical(childEvent(childId, assignment, nestedReadFrame(relativePath, "child-preparation-read", "start")));
  session.consumeLogical(childEvent(childId, assignment, nestedReadFrame(relativePath, "child-preparation-read", "end")));
}

async function emptyPreparationSetIsNoOp(apis, root) {
  const fixtureInfo = fixture(root, "empty-preparation-set", 0);
  const session = createSession(apis, fixtureInfo, [], "empty-preparation-set");
  requirePreparationApi(session, "empty preparation set");
  const turns = installRootTurnStub(session, fixtureInfo);
  await session.prepareRootReads();
  assert.equal(turns.length, 0, "empty rootPreparationPaths must not create a Root turn");
  assert.equal(session.rootPreparationActive, false, "empty preparation must leave rootPreparationActive disabled");
  assertPreparationEvidence(session, [], "empty preparation set");
}

async function allRequiredReadsObservedInBoundedSameRootTurns(apis, root) {
  const fixtureInfo = fixture(root, "bounded-same-root", 13);
  const requiredPaths = fixtureInfo.files.map((file) => file.relativePath);
  const session = createSession(apis, fixtureInfo, requiredPaths, "bounded-same-root");
  requirePreparationApi(session, "bounded same Root preparation");
  const rpcArgvBefore = [...session.evidence.rpc.argv];
  const turns = installRootTurnStub(session, fixtureInfo, {
    onPreparation: ({ requiredPaths: chunk, turn }) => recordPreparationChunk(session, fixtureInfo, chunk, turn),
  });
  await session.prepareRootReads();
  assert.equal(turns.length, Math.ceil(requiredPaths.length / PREPARATION_READ_LIMIT), "preparation must use the bounded maximum-six chunk count");
  assert.ok(turns.every((turn) => turn.scope === "preparation"), "all bounded turns must be preparation turns");
  assert.ok(turns.every((turn) => turn.requiredPaths.length > 0 && turn.requiredPaths.length <= PREPARATION_READ_LIMIT), "every preparation turn must contain at most six paths");
  assert.ok(turns.every((turn) => turn.active_samples.every(Boolean)), "rootPreparationActive must remain true throughout every readonly call");
  assert.equal(session.rootPreparationActive, false, "preparation must clear rootPreparationActive after readonly calls settle");
  assert.deepEqual(new Set(turns.flatMap((turn) => turn.requiredPaths)), new Set(requiredPaths), "all required paths must be dispatched without skipping");
  assert.equal(new Set(turns.map((turn) => turn.root_session_id)).size, 1, "all preparation turns must retain one stable Root session");
  assertPreparationEvidence(session, turns, "bounded same Root preparation");
  assertAllRootReadsObserved(session, fixtureInfo, fixtureInfo.files, "bounded same Root preparation");
  assert.deepEqual(session.evidence.rpc.argv, rpcArgvBefore, "preparation must not change the existing SDK/RPC settings");
  assert.ok(turns.every((turn) => turn.options_keys.length === 2 && turn.options_keys[0] === "requiredPaths" && turn.options_keys[1] === "scope"), "preparation must pass only scope and requiredPaths controls to runRootTurn");
  assert.ok(turns.every((turn) => !turn.options_keys.some((key) => /model|setting|tool|effort|isolat|provider|alias/i.test(key))), "preparation must not alter model, SDK, provider, tool, or isolation settings");
}

async function failedRootReadCannotSatisfyPreparation(apis, root) {
  const fixtureInfo = fixture(root, "failed-root-read", 1);
  const requiredPaths = [fixtureInfo.files[0].relativePath];
  const session = createSession(apis, fixtureInfo, requiredPaths, "failed-root-read");
  requirePreparationApi(session, "failed Root read preparation");
  const turns = installRootTurnStub(session, fixtureInfo, {
    onPreparation: ({ requiredPaths: chunk, turn }) => recordPreparationChunk(session, fixtureInfo, chunk, turn, { failedIndex: 0 }),
  });
  await expectBlocked(() => session.prepareRootReads(), "failed Root read preparation");
  assert.equal(session.rootPreparationActive, false, "failed preparation must clear rootPreparationActive");
  assert.equal(turns.length, 1, "failed preparation must still account for its attempted bounded turn");
  assert.equal(readEndEvents(session).length, 1, "failed preparation must retain the observed failed Root read END");
  assert.equal(readEndEvents(session)[0].source_files?.length ?? 0, 0, "failed Root read END must not expose successful file metadata");
}

async function missingRootReadCannotSatisfyPreparation(apis, root) {
  const fixtureInfo = fixture(root, "missing-root-read", 1);
  const requiredPaths = [fixtureInfo.files[0].relativePath];
  const session = createSession(apis, fixtureInfo, requiredPaths, "missing-root-read");
  requirePreparationApi(session, "missing Root read preparation");
  const turns = installRootTurnStub(session, fixtureInfo);
  await expectBlocked(() => session.prepareRootReads(), "missing Root read preparation");
  assert.equal(session.rootPreparationActive, false, "missing preparation must clear rootPreparationActive");
  assert.equal(turns.length, 1, "missing preparation must retain the attempted bounded turn");
  assert.equal(readEndEvents(session).length, 0, "missing Root read must not be manufactured from a receipt");
}

async function childOnlyReadCannotSatisfyPreparation(apis, root) {
  const fixtureInfo = fixture(root, "child-only-read", 1);
  const requiredPath = fixtureInfo.files[0].relativePath;
  const session = createSession(apis, fixtureInfo, [requiredPath], "child-only-read", { assignments: [childAssignment()] });
  requirePreparationApi(session, "child-only read preparation");
  seedChildOnlyRead(session, fixtureInfo, requiredPath);
  assert.equal(session.evidence.subagent_reads.length, 1, "child-only fixture must retain the actual child read metadata");
  const turns = installRootTurnStub(session, fixtureInfo);
  await expectBlocked(() => session.prepareRootReads(), "child-only read preparation");
  assert.equal(session.rootPreparationActive, false, "child-only refusal must clear rootPreparationActive");
  assert.equal(turns.length, 1, "child-only preparation must retain its attempted bounded turn");
  assert.equal(readEndEvents(session).length, 0, "child-only read must not be relabeled as a Root read");
  assert.equal(session.evidence.subagent_reads[0].source_files[0].path, requiredPath, "child-only read must retain its actual source path");
}

async function staleSourceHashDriftBlocks(apis, root) {
  const fixtureInfo = fixture(root, "stale-source-hash", 1);
  const requiredPath = fixtureInfo.files[0].relativePath;
  const originalHash = fixtureInfo.files[0].sha256;
  const session = createSession(apis, fixtureInfo, [requiredPath], "stale-source-hash");
  requirePreparationApi(session, "stale source/hash preparation");
  installRootTurnStub(session, fixtureInfo, {
    onPreparation: ({ requiredPaths: chunk, turn }) => {
      recordPreparationChunk(session, fixtureInfo, chunk, turn);
      fs.writeFileSync(fixtureInfo.files[0].absolutePath, Buffer.from("drifted-after-root-read\n", "utf8"));
    },
  });
  await expectBlocked(() => session.prepareRootReads(), "stale source/hash preparation");
  assert.equal(session.rootPreparationActive, false, "stale source/hash refusal must clear rootPreparationActive");
  const end = readEndEvents(session)[0];
  assert.equal(end.source_files[0].sha256, originalHash, "the retained Root read metadata must be the pre-drift hash");
  assert.notEqual(end.source_files[0].sha256, sha256File(fixtureInfo.files[0].absolutePath), "current file drift must not be accepted as the retained read hash");
}

async function changedRootSessionBlocks(apis, root) {
  const fixtureInfo = fixture(root, "changed-root-session", 7);
  const requiredPaths = fixtureInfo.files.map((file) => file.relativePath);
  const session = createSession(apis, fixtureInfo, requiredPaths, "changed-root-session");
  requirePreparationApi(session, "changed Root session preparation");
  const stableRoot = session.evidence.root_session.session_id;
  const changedRoot = `${stableRoot}-changed`;
  const turns = installRootTurnStub(session, fixtureInfo, {
    rootSessionForTurn: ({ index }) => index === 0 ? stableRoot : changedRoot,
    onPreparation: ({ requiredPaths: chunk, turn }) => recordPreparationChunk(session, fixtureInfo, chunk, turn),
  });
  await expectBlocked(() => session.prepareRootReads(), "changed Root session preparation");
  assert.equal(session.rootPreparationActive, false, "changed Root refusal must clear rootPreparationActive");
  assert.equal(turns.length, 2, "changed Root preparation must discover the changed session on the second bounded turn");
  assert.deepEqual(turns.map((turn) => turn.root_session_id), [stableRoot, changedRoot], "the changed Root session must remain observable in receipts");
}

async function taskDuringPreparationRefusedWithWriteAllowance(apis, root) {
  const fixtureInfo = fixture(root, "task-during-preparation", 1);
  const requiredPath = fixtureInfo.files[0].relativePath;
  const writePath = ".omp/state/root-read-preparation/forbidden-task-write.txt";
  const session = createSession(apis, fixtureInfo, [requiredPath], "task-during-preparation", {
    rootWritePolicy: { paths: [writePath] },
  });
  requirePreparationApi(session, "task during preparation");
  installRootTurnStub(session, fixtureInfo, {
    onPreparation: () => {
      session.recordTool(rootTaskStart("task-during-preparation|task", null));
    },
  });
  await expectBlocked(() => session.prepareRootReads(), "task during preparation");
  assert.equal(session.rootPreparationActive, false, "task refusal must clear rootPreparationActive");
  assert.equal(session.evidence.task_calls.length, 0, "a task START must not be admitted during readonly preparation");
  assert.equal(fs.existsSync(path.join(fixtureInfo.project, writePath)), false, "a refused task must not write the fixture");
}

async function writeDuringPreparationRefusedWithConstructorAllowance(apis, root) {
  const fixtureInfo = fixture(root, "write-during-preparation", 1);
  const requiredPath = fixtureInfo.files[0].relativePath;
  const writePath = ".omp/state/root-read-preparation/forbidden-write.txt";
  const session = createSession(apis, fixtureInfo, [requiredPath], "write-during-preparation", {
    rootWritePolicy: { paths: [writePath] },
  });
  requirePreparationApi(session, "write during preparation");
  installRootTurnStub(session, fixtureInfo, {
    onPreparation: () => {
      session.recordTool({
        type: "tool_execution_start",
        toolName: "write",
        toolCallId: "write-during-preparation|write",
        args: { path: writePath, content: "must-not-be-written" },
      });
    },
  });
  await expectBlocked(() => session.prepareRootReads(), "write during preparation");
  assert.equal(session.rootPreparationActive, false, "write refusal must clear rootPreparationActive");
  assert.equal(session.evidence.root_writes.length, 0, "a write START must not be admitted during readonly preparation even with constructor allowance");
  assert.equal(fs.existsSync(path.join(fixtureInfo.project, writePath)), false, "a refused write must not create a fixture file");
}

function installExecutionHarness(session, fixtureInfo, finalBehavior, options = {}) {
  const counts = { start: 0, configure: 0, close: 0 };
  session.start = async () => { counts.start += 1; };
  session.configure = async () => { counts.configure += 1; };
  session.close = async () => { counts.close += 1; };
  const turns = installRootTurnStub(session, fixtureInfo, {
    onPreparation: ({ requiredPaths: chunk, turn }) => recordPreparationChunk(session, fixtureInfo, chunk, turn),
    receiptForTurn: ({ scope, receipt }) => {
      if (scope !== "execution") return receipt;
      if (finalBehavior === "missing") return undefined;
      if (finalBehavior === "error") {
        return makeReceipt(receipt.root_session_id, receipt.prompt_request_id, {
          prompt_result_status: "error",
          agent_invoked: false,
          session_settled: false,
          agent_end_terminal: false,
          awaiting_async: true,
        });
      }
      return receipt;
    },
    afterTurn: ({ scope, receipt, session: current }) => {
      if (scope === "preparation" && options.stalePreparationTerminal === true) {
        current.settled = true;
        current.evidence.terminal = {
          prompt_result: {
            id: receipt?.prompt_request_id ?? null,
            status: "completed",
            agentInvoked: true,
            sessionSettled: true,
          },
          session_settled: true,
          agent_end: { isTerminal: true, awaitingAsyncWork: false },
          status: "completed",
        };
        return;
      }
      if (scope !== "execution") return;
      if (finalBehavior === "success") {
        current.evidence.terminal = {
          prompt_result: { status: "completed", agentInvoked: true, sessionSettled: true },
          session_settled: true,
          agent_end: { isTerminal: true, awaitingAsyncWork: false },
          status: "completed",
        };
      } else if (finalBehavior === "error") {
        current.evidence.terminal = {
          prompt_result: { status: "error", agentInvoked: false, sessionSettled: false },
          session_settled: false,
          agent_end: { isTerminal: false, awaitingAsyncWork: true },
          status: "error",
        };
      }
    },
  });
  return { counts, turns };
}

async function executeStartsConfiguresPreparesAndClosesOnce(apis, root) {
  const fixtureInfo = fixture(root, "execute-order-and-close", 7);
  const requiredPaths = fixtureInfo.files.map((file) => file.relativePath);
  const session = createSession(apis, fixtureInfo, requiredPaths, "execute-order-and-close");
  requirePreparationApi(session, "execute preparation ordering");
  assert.equal(typeof session.execute, "function", "NativeRpcSession must retain execute()");
  const harness = installExecutionHarness(session, fixtureInfo, "success");
  const result = await session.execute("bounded execution message");
  assert.ok(result && typeof result === "object", "successful execution must return its host evidence object");
  assert.equal(harness.counts.start, 1, "execute must start one persistent Root session");
  assert.equal(harness.counts.configure, 1, "execute must configure one persistent Root session");
  assert.equal(harness.counts.close, 1, "execute must close the persistent Root session exactly once");
  const preparationTurns = harness.turns.filter((turn) => turn.scope === "preparation");
  const executionTurns = harness.turns.filter((turn) => turn.scope === "execution");
  assert.equal(executionTurns.length, 1, "execute must perform one final execution turn");
  assert.ok(harness.turns.findIndex((turn) => turn.scope === "execution") > harness.turns.findIndex((turn) => turn.scope === "preparation"), "final execution must follow preparation turns");
  assertPreparationEvidence(session, preparationTurns, "execute preparation ordering");
  assertAllRootReadsObserved(session, fixtureInfo, fixtureInfo.files, "execute preparation ordering");
  assert.equal(session.rootPreparationActive, false, "execute must leave rootPreparationActive disabled after preparation");
}

async function preparationReceiptAloneCannotPassWhenFinalTurnMissing(apis, root) {
  const fixtureInfo = fixture(root, "execute-final-missing", 1);
  const requiredPath = fixtureInfo.files[0].relativePath;
  const session = createSession(apis, fixtureInfo, [requiredPath], "execute-final-missing");
  requirePreparationApi(session, "missing final execution turn");
  assert.equal(typeof session.execute, "function", "NativeRpcSession must retain execute()");
  const harness = installExecutionHarness(session, fixtureInfo, "missing");
  await expectBlocked(() => session.execute("bounded execution message"), "preparation receipt without final execution");
  assert.equal(harness.counts.start, 1, "missing final turn must not start another Root session");
  assert.equal(harness.counts.configure, 1, "missing final turn must not configure another Root session");
  assert.equal(harness.turns.filter((turn) => turn.scope === "preparation").length, 1, "preparation must run before the missing final turn");
  assert.equal(harness.turns.filter((turn) => turn.scope === "execution").length, 1, "execute must attempt the final turn rather than promoting preparation");
  assert.equal(session.evidence.terminal?.status === "completed", false, "preparation receipt alone must never become final success");
}

async function stalePreparationTerminalCannotSatisfyFinalExecution(apis, root) {
  const fixtureInfo = fixture(root, "execute-stale-preparation-terminal", 1);
  const requiredPath = fixtureInfo.files[0].relativePath;
  const session = createSession(apis, fixtureInfo, [requiredPath], "execute-stale-preparation-terminal");
  requirePreparationApi(session, "stale preparation terminal");
  assert.equal(typeof session.execute, "function", "NativeRpcSession must retain execute()");
  const harness = installExecutionHarness(session, fixtureInfo, "missing", { stalePreparationTerminal: true });
  await expectBlocked(() => session.execute("bounded execution message"), "stale preparation terminal before final execution");
  assert.equal(harness.turns.filter((turn) => turn.scope === "preparation").length, 1, "stale preparation terminal must come from a preparation turn");
  assert.equal(harness.turns.filter((turn) => turn.scope === "execution").length, 1, "stale preparation settlement must not suppress the final execution turn");
  assert.equal(session.evidence.rpc.preparation_prompts?.[0]?.scope, "preparation", "stale preparation evidence must remain preparation-only");
  assert.equal(readEndEvents(session).length, 1, "stale preparation reads must not be relabeled as final-prompt reads");
}

async function preparationReceiptAloneCannotPassWhenFinalTurnErrors(apis, root) {
  const fixtureInfo = fixture(root, "execute-final-error", 1);
  const requiredPath = fixtureInfo.files[0].relativePath;
  const session = createSession(apis, fixtureInfo, [requiredPath], "execute-final-error");
  requirePreparationApi(session, "error final execution turn");
  assert.equal(typeof session.execute, "function", "NativeRpcSession must retain execute()");
  const harness = installExecutionHarness(session, fixtureInfo, "error");
  await expectBlocked(() => session.execute("bounded execution message"), "preparation receipt before errored final execution");
  assert.equal(harness.counts.start, 1, "errored final turn must retain one persistent Root start");
  assert.equal(harness.counts.configure, 1, "errored final turn must retain one persistent Root configuration");
  assert.equal(harness.turns.filter((turn) => turn.scope === "preparation").length, 1, "preparation must run before the errored final turn");
  assert.equal(harness.turns.filter((turn) => turn.scope === "execution").length, 1, "execute must attempt the errored final turn");
  assert.notEqual(session.evidence.terminal?.status, "completed", "an errored final turn must not be promoted by a preparation receipt");
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

async function executeCase(results, failures, name, run) {
  try {
    await run();
    results.push({ name, classification: EXPECTED_CLASSIFICATION, status: "PASS" });
  } catch (error) {
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

  await executeCase(results, failures, "empty rootPreparationPaths is a bounded no-op", () => emptyPreparationSetIsNoOp(apis, root));
  await executeCase(results, failures, "more than six required files are all observed in bounded same-Root preparation turns", () => allRequiredReadsObservedInBoundedSameRootTurns(apis, root));
  await executeCase(results, failures, "failed Root read cannot satisfy preparation", () => failedRootReadCannotSatisfyPreparation(apis, root));
  await executeCase(results, failures, "missing Root read cannot satisfy preparation", () => missingRootReadCannotSatisfyPreparation(apis, root));
  await executeCase(results, failures, "child-only read cannot satisfy Root preparation", () => childOnlyReadCannotSatisfyPreparation(apis, root));
  await executeCase(results, failures, "stale source/hash drift blocks preparation", () => staleSourceHashDriftBlocks(apis, root));
  await executeCase(results, failures, "changed Root session blocks preparation", () => changedRootSessionBlocks(apis, root));
  await executeCase(results, failures, "task during preparation is refused despite write allowance", () => taskDuringPreparationRefusedWithWriteAllowance(apis, root));
  await executeCase(results, failures, "write during preparation is refused despite constructor allowance", () => writeDuringPreparationRefusedWithConstructorAllowance(apis, root));
  await executeCase(results, failures, "execute starts/configures once, prepares before execution, and closes once", () => executeStartsConfiguresPreparesAndClosesOnce(apis, root));
  await executeCase(results, failures, "preparation receipt alone cannot pass when final execution is missing", () => preparationReceiptAloneCannotPassWhenFinalTurnMissing(apis, root));
  await executeCase(results, failures, "preparation receipt alone cannot pass when final execution errors", () => preparationReceiptAloneCannotPassWhenFinalTurnErrors(apis, root));
  await executeCase(results, failures, "stale preparation terminal/settlement cannot satisfy final execution", () => stalePreparationTerminalCannotSatisfyFinalExecution(apis, root));
  await executeCase(results, failures, "compound raw/range selectors retain matched actual file bytes and hashes", () => compoundReadSelectorsRetainActualFileMetadata(apis, root));
  if (process.platform === "win32") results.push({ name: "existing selector-looking literal filename takes precedence", classification: EXPECTED_CLASSIFICATION, status: "SKIP", reason: "Colon-containing regular filenames require POSIX; not a Windows PASS." });
  else await executeCase(results, failures, "existing selector-looking literal filename takes precedence", () => literalSelectorLookingFilenameWins(apis, root));
  await executeCase(results, failures, "isolated Native09 cwd exposes actual project policies and requested profile to the read consumer", () => isolatedRetryCwdContainsActualProjectPolicies(apis, root));
  await executeCase(results, failures, "owned runtime state is separate while every installed package path remains protected", () => installedPackageFingerprintSeparatesOwnedRuntimeState(apis, root));

  const expectedFailures = failures.filter((failure) => failure.failure_reason_expected === true);
  const unexpectedFailures = failures.filter((failure) => failure.failure_reason_expected !== true);
  const output = {
    status: unexpectedFailures.length || expectedFailures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "root-read-preparation-red",
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
    const error = new Error("source-only Root read preparation RED harness found unexpected failures");
    error.name = "ProbeHarnessError";
    error.code = "ERR_PROBE_UNEXPECTED_FAILURE";
    error.probe = output;
    throw error;
  }
  if (expectedFailures.length) {
    const error = new Error("source-only Root read preparation RED assertions failed as expected");
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
    probe: "root-read-preparation-red",
    failure_reason_expected: isAssertionFailure(error),
  };
  process.stderr.write(`${JSON.stringify({ ...probe, error: safeError(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
