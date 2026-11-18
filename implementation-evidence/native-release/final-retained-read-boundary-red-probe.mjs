#!/usr/bin/env node
// Source-only RED probe for the final retained read/dispatch boundaries in
// AC-016.  It imports the real fallback, review, and alignment consumers
// through temporary export-only seams below a fresh private root.  The input
// frames are bounded host-shaped observations; no OMP/SDK process, model,
// network, Git command, or source checkout mutation is used.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const FALLBACK_SOURCE = path.join(SOURCE_DIR, "fallback.mjs");
const REVIEW_SOURCE = path.join(SOURCE_DIR, "review-context.mjs");
const PROTOCOL_SOURCE = path.join(SOURCE_DIR, "../../deep-review/lib/protocol.mjs");
const ALIGNMENT_SOURCE = path.join(SOURCE_DIR, "alignment.mjs");
const REVIEW_REVISION = "a".repeat(40);
const TEST_FILE = "implementation-evidence/native-release/final-retained-read-boundary-red-probe.mjs";
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertRegular(file, label) {
  const info = fs.lstatSync(file);
  assert.equal(info.isSymbolicLink(), false, `${label} must not be a symbolic link`);
  assert.equal(info.isFile(), true, `${label} must be a regular file`);
}

function makeSeam(root, source, name, exports) {
  assertRegular(source, `${name} source`);
  const seamDirectory = path.join(root, "source-overlay", "implementation-evidence", "native-release");
  fs.mkdirSync(seamDirectory, { recursive: true });
  const seam = path.join(seamDirectory, `${name}.seam.mjs`);
  const sourceText = fs.readFileSync(source, "utf8");
  fs.writeFileSync(
    seam,
    `${sourceText}\n\n// Temporary export-only seam; never part of the product.\nexport { ${exports.join(", ")} };\n`,
    "utf8",
  );
  return seam;
}

async function loadConsumers(root) {
  const fallbackSeam = makeSeam(root, FALLBACK_SOURCE, "fallback", [
    "RpcSession",
    "createPeerWireProbeArtifacts",
    "expectedReadSet",
    "validateReadOrder",
    "disabledPreflightObservation",
    "validatePeerWireProbe",
    "validateTaskCalls",
  ]);
  const reviewSeam = makeSeam(root, REVIEW_SOURCE, "review-context", ["firstPathSequence"]);
  const alignmentSeam = makeSeam(root, ALIGNMENT_SOURCE, "alignment", [
    "RpcSession",
    "assertToolReadEvidence",
    "assertToolReadPaths",
    "pathMatchesSource",
  ]);
  const suffix = "?final_retained_read_boundary_v1";
  const [fallback, review, alignment] = await Promise.all([
    import(`${pathToFileURL(fallbackSeam).href}${suffix}`),
    import(`${pathToFileURL(reviewSeam).href}${suffix}`),
    import(`${pathToFileURL(alignmentSeam).href}${suffix}`),
  ]);
  assert.equal(typeof fallback.RpcSession, "function", "fallback seam must expose the actual RpcSession consumer");
  assert.equal(typeof fallback.createPeerWireProbeArtifacts, "function", "fallback seam must expose the actual peer-wire artifact producer");
  assert.equal(typeof fallback.expectedReadSet, "function", "fallback seam must expose the actual read-set consumer");
  assert.equal(typeof fallback.validateReadOrder, "function", "fallback seam must expose validateReadOrder");
  assert.equal(typeof fallback.validatePeerWireProbe, "function", "fallback seam must expose the actual validatePeerWireProbe consumer");
  assert.equal(typeof fallback.disabledPreflightObservation, "function", "fallback seam must expose the actual disabledPreflightObservation consumer");
  assert.equal(typeof fallback.validateTaskCalls, "function", "fallback seam must expose validateTaskCalls");
  assert.equal(typeof review.inspectNativeEvidence, "function", "review seam must expose the actual inspectNativeEvidence consumer");
  assert.equal(typeof review.firstPathSequence, "function", "review seam must expose firstPathSequence");
  assert.equal(typeof alignment.RpcSession, "function", "alignment seam must expose the actual alignment RpcSession consumer");
  assert.equal(typeof alignment.assertToolReadEvidence, "function", "alignment seam must expose assertToolReadEvidence");
  assert.equal(typeof alignment.assertToolReadPaths, "function", "alignment seam must expose assertToolReadPaths");
  return { fallback, review, alignment };
}

function baseFallbackEvidence() {
  return {
    rpc: {},
    responses: [],
    task_details: [],
    task_calls: [],
    tool_events: [],
    read_events: [],
    native_progress_terminal: [],
  };
}

function rpcSession(RpcSession, root, evidence, probe = null) {
  return new RpcSession({
    omp: "offline-retained-read-boundary",
    cwd: root,
    env: {},
    timeoutMs: 1_000,
    evidence,
    probe,
  });
}

function readStart(toolCallId, rawPath) {
  return {
    type: "tool_execution_start",
    toolName: "read",
    toolCallId,
    args: { path: rawPath },
  };
}
function toolResult(text) {
  return {
    content: [{ type: "text", text }],
  };
}


function readEnd(toolCallId, success) {
  return {
    type: "tool_execution_end",
    toolName: "read",
    toolCallId,
    isError: success ? false : true,
    result: toolResult(success ? "bounded read result\n" : "bounded read failure\n"),
  };
}
function writePeerWireFile(file, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return { path: file, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function peerWireControlFixture(root, apis) {
  const revision = "b".repeat(40);
  fs.mkdirSync(path.join(root, ".omp", "state"), { recursive: true });
  fs.mkdirSync(path.join(root, ".omp", "skills", "deep-review", "lib"), { recursive: true });
  const fixtureFile = writePeerWireFile(
    path.join(root, "src", "checkout-good.mjs"),
    "export const checkoutGood = true;\n",
  );
  const configPath = path.join(root, ".omp", "config.yml");
  writePeerWireFile(configPath, "task:\n  disabledAgents:\n    - deep-reviewer\n");
  const protocolPath = path.join(root, ".omp", "skills", "deep-review", "lib", "protocol.mjs");
  const protocolFile = writePeerWireFile(protocolPath, fs.readFileSync(PROTOCOL_SOURCE));
  const diffPath = path.join(root, ".omp", "state", "t009c", "actual-diff.patch");
  const diffContent = "diff --git a/src/checkout-good.mjs b/src/checkout-good.mjs\n";
  const diffFile = writePeerWireFile(diffPath, diffContent);
  const receiptPath = path.join(root, ".omp", "state", "t009c", "git-source-receipt.json");
  const receipt = {
    schema: "git-fixture-receipt-v1",
    base_revision: "c".repeat(40),
    head_revision: revision,
    head_ref: "HEAD",
    diff_sha256: diffFile.sha256,
    files: ["src/checkout-good.mjs"],
    consumer_paths: ["src/checkout-good.mjs"],
  };
  const receiptFile = writePeerWireFile(receiptPath, `${JSON.stringify(receipt)}\n`);
  const fixture = {
    root,
    revision,
    files: [{ relativePath: "src/checkout-good.mjs", bytes: fixtureFile.bytes, sha256: fixtureFile.sha256 }],
  };
  const manifest = [];
  const probe = apis.fallback.createPeerWireProbeArtifacts(root, fixture);
  const helperRun = spawnSync(process.execPath, [probe.helperPath, ...probe.child_argv.slice(2)], {
    cwd: root,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 65_536,
  });
  if (helperRun.error) throw helperRun.error;
  if (helperRun.signal) throw new Error(`generated peer-wire helper terminated by ${helperRun.signal}`);
  if (helperRun.status !== 0) throw new Error(`generated peer-wire helper exited ${helperRun.status}: ${helperRun.stderr}`);
  let output;
  try {
    output = JSON.parse(String(helperRun.stdout ?? "").trim());
  } catch (error) {
    throw new Error(`generated peer-wire helper did not emit bounded JSON: ${error?.message ?? error}`);
  }
  return {
    fixture,
    manifest,
    probe,
    output,
    source: { path: protocolPath, bytes: protocolFile.bytes, sha256: protocolFile.sha256 },
    receipt: receiptFile,
    files: [fixtureFile, diffFile, receiptFile],
  };
}

function peerWireBashStart(toolCallId, probe) {
  return {
    type: "tool_execution_start",
    toolName: "bash",
    toolCallId,
    args: { command: probe.command, cwd: probe.cwd },
  };
}

function peerWireBashEnd(toolCallId, output) {
  return {
    type: "tool_execution_end",
    toolName: "bash",
    toolCallId,
    isError: false,
    result: toolResult(JSON.stringify(output)),
  };
}

function peerWireEvidence(apis, root, mode) {
  const caseRoot = fs.mkdtempSync(path.join(root, "peer-wire-case-"));
  const control = peerWireControlFixture(caseRoot, apis);
  const evidence = baseFallbackEvidence();
  evidence.prompt_result = null;
  evidence.session_settled = false;
  const session = rpcSession(apis.fallback.RpcSession, control.fixture.root, evidence, {
    command: control.probe.command,
    cwd: control.probe.cwd,
  });
  const expected = [...apis.fallback.expectedReadSet(control.fixture.root, control.fixture, control.manifest, control.probe.readPaths)];
  const readIds = new Map(expected.map((expectedPath, index) => [expectedPath, `peer-wire-read-${index}`]));
  const bashCallId = "peer-wire-bash";
  for (const expectedPath of expected) session.consumeLogical(readStart(readIds.get(expectedPath), expectedPath));
  if (mode === "late-end") {
    session.consumeLogical(peerWireBashStart(bashCallId, control.probe));
    for (const expectedPath of expected) session.consumeLogical(readEnd(readIds.get(expectedPath), true));
  } else {
    for (const [index, expectedPath] of expected.entries()) {
      if (mode === "missing-end" && index === 0) continue;
      session.consumeLogical(readEnd(readIds.get(expectedPath), mode !== "failed-end" || index !== 0));
    }
    session.consumeLogical(peerWireBashStart(bashCallId, control.probe));
  }
  session.consumeLogical(peerWireBashEnd(bashCallId, control.output));
  session.consumeLogical({
    type: "prompt_result",
    id: "11111111-1111-4111-8111-111111111111",
    status: "completed",
    agentInvoked: true,
    sessionSettled: true,
  });
  session.consumeLogical({ type: "session_settled" });
  return { control, evidence, expected, bashStart: evidence.probe_bash_start };
}

function assertPeerWireChildWitness(control) {
  const child = control.output.child_execution;
  const helper = control.probe.files.find((entry) =>
    path.resolve(entry.path).toLowerCase() === path.resolve(control.probe.helperPath).toLowerCase());
  assert.ok(child && typeof child === "object" && !Array.isArray(child), "peer-wire positive control must retain the generated helper child_execution witness");
  assert.equal(typeof child.script_path, "string", "peer-wire child witness must expose its helper script path");
  assert.equal(child.origin, "observed-node-child", "peer-wire child witness must identify observed Node-child provenance");
  assert.equal(child.executable, process.execPath, "peer-wire child witness must bind the actual Node executable");
  assert.equal(
    path.resolve(child.script_path).toLowerCase(),
    path.resolve(control.probe.helperPath).toLowerCase(),
    "peer-wire child witness must bind the generated helper script",
  );
  assert.equal(child.script_sha256, helper?.sha256, "peer-wire child witness must bind the generated helper hash");
  assert.equal(child.argv_sha256, control.probe.child_argv_sha256, "peer-wire child witness must bind the generated worker argv hash");
  assert.equal(child.exit_code, 0, "peer-wire child witness must expose observed zero exit");
  assert.equal(child.exit_code_observed, true, "peer-wire child witness must expose observed exit metadata");
  assert.equal(child.signal, null, "peer-wire child witness must expose null signal");
  assert.equal(child.signal_observed, true, "peer-wire child witness must expose observed signal metadata");
  assert.equal(child.spawn_error, null, "peer-wire child witness must expose null spawn error");
}

function assertPeerWireReadBeforeBashAccepted(apis, root) {
  const { control, evidence, expected, bashStart } = peerWireEvidence(apis, root, "success");
  assertPeerWireChildWitness(control);
  let result;
  try {
    result = apis.fallback.validatePeerWireProbe(
      evidence,
      control.fixture.root,
      control.fixture,
      control.manifest,
      control.probe,
    );
  } catch (error) {
    assert.fail(
      `peer-wire positive control must accept complete successful reads before Bash START: ${error?.kind ?? error?.message ?? error}`,
    );
  }
  assert.equal(result.read.expected, expected.length, "peer-wire positive control must retain the complete pinned read count");
  assert.equal(result.read.observed, expected.length, "peer-wire positive control must observe every correlated successful read");
  assert.ok(Number.isSafeInteger(bashStart.sequence), "peer-wire positive control must retain the Bash START sequence");
  assert.ok(
    evidence.read_events.every((event) => event.success === true && event.end_sequence < bashStart.sequence),
    "peer-wire positive control must place every successful READ END strictly before Bash START",
  );
  assert.equal(result.output.outcomes.valid.ok, true, "peer-wire positive control must retain valid counterfactual acceptance");
  assert.equal(result.output.outcomes.malformed.ok, false, "peer-wire positive control must retain malformed counterfactual rejection");
}

function assertPeerWireRejectsReadEndAfterBash(apis, root) {
  const { control, evidence, bashStart } = peerWireEvidence(apis, root, "late-end");
  assert.ok(
    evidence.read_events.every((event) => event.sequence < bashStart.sequence && event.end_sequence > bashStart.sequence),
    "peer-wire late-END control must keep every required READ START before and END after Bash START",
  );
  expectBlocked(
    () => apis.fallback.validatePeerWireProbe(evidence, control.fixture.root, control.fixture, control.manifest, control.probe),
    "peer-wire required read END after Bash START",
  );
}

function assertPeerWireRejectsMissingOrFailedEnd(apis, root, mode) {
  const { control, evidence, bashStart } = peerWireEvidence(apis, root, mode);
  assert.ok(Number.isSafeInteger(bashStart.sequence), `peer-wire ${mode} control must retain the matching Bash START`);
  expectBlocked(
    () => apis.fallback.validatePeerWireProbe(evidence, control.fixture.root, control.fixture, control.manifest, control.probe),
    `peer-wire ${mode}`,
  );
}


function taskStart(toolCallId, items) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId,
    args: { tasks: items },
  };
}

function taskEnd(toolCallId) {
  return {
    type: "tool_execution_end",
    toolName: "task",
    toolCallId,
    isError: true,
    result: toolResult("deep-reviewer disabled by project preflight\n"),
  };
}


function fallbackTask(name, agent, task = `${name} bounded task`) {
  return {
    name,
    agent,
    task,
    solutionSpace: "read-only retained boundary fixture",
  };
}

function expectBlocked(thunk, label) {
  let caught = null;
  try {
    thunk();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label} must reject the unproven observation`);
  assert.equal(caught.kind, "BLOCKED", `${label} must reject with the consumer BLOCKED contract`);
}

function expectAssertion(thunk, label) {
  let caught = null;
  try {
    thunk();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label} must reject the unproven observation`);
  assert.equal(caught.kind, "ASSERTION", `${label} must reject with the consumer ASSERTION contract`);
}

function alignmentBoundarySession(RpcSession, root) {
  return new RpcSession({
    omp: "offline-retained-read-boundary-alignment",
    cwd: root,
    env: {},
    label: "offline-retained-read-boundary-alignment",
    requestId: "request-retained-read-boundary-alignment",
    runId: "run-retained-read-boundary-alignment",
    timeoutMs: 1_000,
  });
}

function alignmentBoundaryEvidence(apis, root, order) {
  const sourceRoot = path.resolve(root, "active-source");
  const expectedPaths = [
    path.resolve(sourceRoot, "alignment", "SKILL.md"),
    path.resolve(sourceRoot, "alignment", "references", "routing-and-persistence.md"),
  ];
  const session = alignmentBoundarySession(apis.alignment.RpcSession, root);
  for (const [index, expectedPath] of expectedPaths.entries()) {
    const callId = `alignment-boundary-read-${index}`;
    if (order === "end-before-start" && index === 0) {
      session.consumeLogical(readEnd(callId, true));
      session.consumeLogical(readStart(callId, expectedPath));
    } else {
      session.consumeLogical(readStart(callId, expectedPath));
      session.consumeLogical(readEnd(callId, true));
    }
  }
  return { sourceRoot, expectedPaths, evidence: session.evidence };
}

function assertAlignmentReadPathsRejectEndBeforeStart(apis, root) {
  const { expectedPaths, evidence } = alignmentBoundaryEvidence(apis, root, "end-before-start");
  expectAssertion(
    () => apis.alignment.assertToolReadPaths(evidence, "alignment END before START", [expectedPaths[0]]),
    "alignment assertToolReadPaths END before START",
  );
}

function assertAlignmentReadConsumersAcceptLegitimateOrder(apis, root) {
  const { sourceRoot, expectedPaths, evidence } = alignmentBoundaryEvidence(apis, root, "start-before-end");
  try {
    apis.alignment.assertToolReadEvidence(evidence, "alignment legitimate START before END", sourceRoot);
    apis.alignment.assertToolReadPaths(evidence, "alignment legitimate START before END", expectedPaths);
  } catch (error) {
    assert.fail(
      `alignment legitimate START→END control must satisfy both real consumers without test-added sequence: ${error?.kind ?? error?.code ?? error?.message ?? error}`,
    );
  }
}

function readOrderEvidence(apis, root, mode) {
  const fixture = { files: [] };
  const manifest = [];
  const evidence = baseFallbackEvidence();
  const session = rpcSession(apis.fallback.RpcSession, root, evidence);
  const expected = apis.fallback.expectedReadSet(root, fixture, manifest);
  let index = 0;
  for (const expectedPath of expected) {
    const id = `read-${index}`;
    session.consumeLogical(readStart(id, expectedPath));
    if (mode === "success") {
      session.consumeLogical(readEnd(id, true));
    } else if (mode === "mismatched-end") {
      session.consumeLogical(readEnd(`foreign-${id}`, true));
    } else if (mode === "failed-end") {
      session.consumeLogical(readEnd(id, false));
    }
    index += 1;
  }
  session.consumeLogical(taskStart("task-dispatch", [fallbackTask("ObservedTask", "peer-reviewer")]));
  return { fixture, manifest, evidence, expected };
}

function assertReadOrderRejectsUncompletedRead(apis, root, mode) {
  const { fixture, manifest, evidence } = readOrderEvidence(apis, root, mode);
  expectBlocked(
    () => apis.fallback.validateReadOrder(evidence, root, fixture, manifest),
    `fallback validateReadOrder ${mode}`,
  );
}

function assertReadOrderAcceptsCorrelatedSuccess(apis, root) {
  const { fixture, manifest, evidence, expected } = readOrderEvidence(apis, root, "success");
  const result = apis.fallback.validateReadOrder(evidence, root, fixture, manifest);
  assert.equal(result.expected, expected.size, "fallback read order must retain the complete pinned read count");
  assert.equal(result.observed, expected.size, "fallback read order must observe every correlated successful read");
  assert.ok(result.first_task_sequence > 1, "fallback task fanout must follow the retained root reads");
}

function preflightEvidence(apis, exactTerminal) {
  const disabledId = "disabled-preflight-call";
  const evidence = baseFallbackEvidence();
  const session = rpcSession(apis.fallback.RpcSession, "offline-preflight-order", evidence);
  session.consumeLogical(taskStart(disabledId, [fallbackTask("DeepDisabledPreflight", "deep-reviewer", "disabled capability preflight")]));
  session.consumeLogical(taskEnd(exactTerminal ? disabledId : "unrelated-call"));

  return evidence;
}

function disabledItem(callId = "disabled-preflight-call", sequence = 1) {
  return {
    name: "DeepDisabledPreflight",
    agent: "deep-reviewer",
    taskSha256: "1".repeat(64),
    call: { call_id: callId, sequence },
  };
}

function assertExactDisabledTerminal(apis) {
  const evidence = preflightEvidence(apis, false);
  expectBlocked(
    () => apis.fallback.disabledPreflightObservation(evidence, disabledItem()),
    "disabled preflight observation with a missing exact terminal",
  );
}

function assertExactDisabledTerminalAccepted(apis) {
  const evidence = preflightEvidence(apis, true);
  const result = apis.fallback.disabledPreflightObservation(evidence, disabledItem());
  assert.equal(result.tool_call_id, "disabled-preflight-call", "disabled preflight evidence must retain its exact tool-call identity");
  assert.equal(result.sequence, 2, "disabled preflight evidence must retain its exact terminal sequence");
}


function taskOrderingEvidence(apis, fallbackBeforeDisabledEnd) {
  const evidence = baseFallbackEvidence();
  const session = rpcSession(apis.fallback.RpcSession, "offline-fallback-order", evidence);
  const disabled = fallbackTask("DeepDisabledPreflight", "deep-reviewer", "disabled capability preflight");
  const fallback = [
    fallbackTask("FallbackReviewGood", "peer-reviewer"),
    fallbackTask("FallbackReviewBad", "peer-reviewer"),
  ];
  session.consumeLogical(taskStart("disabled-preflight-call", [disabled]));
  if (!fallbackBeforeDisabledEnd) session.consumeLogical(taskEnd("disabled-preflight-call"));
  session.consumeLogical(taskStart("fallback-dispatch-call", fallback));
  if (fallbackBeforeDisabledEnd) session.consumeLogical(taskEnd("disabled-preflight-call"));
  return evidence;
}

function assertFallbackDispatchWaitsForDisabledEnd(apis) {
  const evidence = taskOrderingEvidence(apis, true);
  expectBlocked(
    () => apis.fallback.validateTaskCalls(evidence),
    "fallback task dispatch before disabled preflight END",
  );
}

function assertFallbackDispatchAfterDisabledEnd(apis) {
  const evidence = taskOrderingEvidence(apis, false);
  const result = apis.fallback.validateTaskCalls(evidence);
  assert.equal(result.disabled.name, "DeepDisabledPreflight", "validated task calls must retain the named disabled preflight");
  assert.deepEqual(
    [...result.fallback.keys()].sort(),
    ["FallbackReviewBad", "FallbackReviewGood"],
    "validated fallback dispatch must retain both named peer assignments",
  );
  const observation = apis.fallback.disabledPreflightObservation(evidence, result.disabled);
  assert.equal(observation.tool_call_id, "disabled-preflight-call", "fallback dispatch control must use the exact completed preflight");
}

function reviewPathEvents(expectedPath, mode) {
  const start = {
    type: "tool_execution_start",
    tool: "read",
    toolCallId: "review-read-call",
    paths: [expectedPath],
    sequence: 10,
  };
  if (mode === "start-only") return [start];
  const end = {
    type: "tool_execution_end",
    tool: "read",
    toolCallId: mode === "mismatched-end" ? "foreign-review-call" : "review-read-call",
    paths: [expectedPath],
    sequence: 11,
    isError: mode === "failed-end" ? true : false,
    result: toolResult(mode === "failed-end" ? "bounded review read failure\n" : "bounded review read\n"),
  };
  return [start, end];
}


function assertReviewPathSequenceRequiresSuccessfulEnd(apis, root, mode) {
  const expectedPath = path.join(root, "source", "alignment", "SKILL.md");
  const sequence = apis.review.firstPathSequence(
    reviewPathEvents(expectedPath, mode),
    expectedPath,
    path.join(root, "source"),
    path.join(root, "source"),
  );
  if (mode === "success") {
    assert.equal(sequence, 10, "review read sequence must retain the correlated successful read START");
  } else {
    assert.equal(sequence, null, `review read sequence ${mode} must remain unknown without a correlated successful END`);
  }
}

function reviewContext(root) {
  return {
    kind: "branch-base",
    descriptorPath: path.join(root, "fixture", ".omp", "state", "review-context.json"),
    receipt: { absolutePath: path.join(root, "fixture", ".omp", "state", "git-source-receipt.json") },
    diff: { absolutePath: path.join(root, "fixture", ".omp", "state", "actual-diff.patch") },
    files: [{ absolutePath: path.join(root, "fixture", "src", "changed.mjs") }],
    deletions: [],
    headRevision: REVIEW_REVISION,
  };
}

function reviewEvidence(root, mode) {
  const sourceRoot = path.join(root, "source");
  const context = reviewContext(root);
  const paths = [
    ...REVIEW_DOCUMENTATION_PATHS.map((relativePath) => path.resolve(sourceRoot, relativePath)),
    context.descriptorPath,
    context.receipt.absolutePath,
    context.diff.absolutePath,
    ...context.files.map((file) => file.absolutePath),
  ];
  const tool_events = [];
  let sequence = 1;
  for (const expectedPath of paths) {
    const callId = `review-read-${sequence}`;
    tool_events.push({
      type: "tool_execution_start",
      tool: "read",
      toolCallId: callId,
      paths: [expectedPath],
      sequence,
    });
    sequence += 1;
    if (mode === "success") {
      tool_events.push({
        type: "tool_execution_end",
        tool: "read",
        toolCallId: callId,
        paths: [expectedPath],
        sequence,
        isError: false,
        result: toolResult("bounded review read\n"),
      });
    } else if (mode === "mismatched-end") {
      tool_events.push({
        type: "tool_execution_end",
        tool: "read",
        toolCallId: `foreign-${callId}`,
        paths: [expectedPath],
        sequence,
        isError: false,
        result: toolResult("bounded review read\n"),
      });
    } else if (mode === "failed-end") {
      tool_events.push({
        type: "tool_execution_end",
        tool: "read",
        toolCallId: callId,
        paths: [expectedPath],
        sequence,
        isError: true,
        result: toolResult("bounded review read failure\n"),
      });
    }
    sequence += 1;
  }
  const dispatchSequence = 1000;
  const id = "T009C-branch-base-1";
  return {
    context,
    sourceRoot,
    evidence: {
      capture: { complete: true },
      tool_events,
      task_calls: [{
        kind: "dispatch",
        type: "tool_execution_start",
        sequence: dispatchSequence,
        has_forbidden_field: false,
        has_solution_space: true,
        assignments: [{ id, agent: "deep-reviewer", assignment_sha256: "2".repeat(64) }],
      }],
      task_records: [{
        id,
        source_kind: "native_subagent_progress",
        agent: "deep-reviewer",
        agentSource: "project",
        status: "completed",
        exit_code_observed: false,
        structured: true,
        reviewedRevision: REVIEW_REVISION,
        protocolMode: "DEEP_REVIEW",
        consumer_validation: { ok: true },
      }],
      terminal: {
        prompt_result: { status: "completed", agentInvoked: true },
        session_settled: true,
      },
    },
  };
}

function assertReviewInspectionRequiresSuccessfulEnds(apis, root, mode) {
  const fixture = reviewEvidence(root, mode);
  const failures = apis.review.inspectNativeEvidence(
    fixture.evidence,
    [fixture.context],
    fixture.sourceRoot,
    fixture.sourceRoot,
  );
  if (mode === "success") {
    assert.deepEqual(failures, [], "review inspection must accept all correlated successful pre-fanout reads");
  } else {
    assert.ok(
      failures.some((failure) => /root (?:source )?read|read evidence/i.test(failure)),
      `review inspection must report ${mode} reads as missing before fanout: ${JSON.stringify(failures)}`,
    );
  }
}

function assertAlignmentRejectsForeignOverlay(apis, root) {
  const sourceRoot = path.join(root, "active-source");
  const expected = path.join(sourceRoot, "alignment", "SKILL.md");
  const copied = "/.omp/skills/alignment/SKILL.md";
  const foreign = path.join(root, "foreign-overlay", ".omp", "skills", "alignment", "SKILL.md");
  assert.equal(
    apis.alignment.pathMatchesSource(expected, sourceRoot, "SKILL.md"),
    true,
    "alignment source path must match the active source root",
  );
  assert.equal(
    apis.alignment.pathMatchesSource(copied, sourceRoot, "SKILL.md"),
    true,
    "the managed relative alignment overlay path remains an accepted read form",
  );
  assert.equal(
    apis.alignment.pathMatchesSource(foreign, sourceRoot, "SKILL.md"),
    false,
    "an unrelated absolute overlay with the same alignment suffix must not satisfy source evidence",
  );
}

function runCase(results, name, fn) {
  try {
    fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({
      name,
      status: "FAIL",
      failure_kind: error?.name === "AssertionError" ? "ASSERTION" : "UNEXPECTED",
      error: {
        name: error?.name ?? "Error",
        message: String(error?.message ?? error),
      },
    });
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "final-retained-read-boundary-red-"));
  const apis = await loadConsumers(root);
  const results = [];

  runCase(results, "fallback validateReadOrder rejects START-only reads", () => assertReadOrderRejectsUncompletedRead(apis, root, "start-only"));
  runCase(results, "fallback validateReadOrder rejects mismatched-END reads", () => assertReadOrderRejectsUncompletedRead(apis, root, "mismatched-end"));
  runCase(results, "fallback validateReadOrder rejects failed-END reads", () => assertReadOrderRejectsUncompletedRead(apis, root, "failed-end"));
  runCase(results, "fallback validateReadOrder accepts correlated successful ENDs", () => assertReadOrderAcceptsCorrelatedSuccess(apis, root));
  runCase(results, "peer-wire validatePeerWireProbe accepts every successful READ END before Bash START", () => assertPeerWireReadBeforeBashAccepted(apis, root));
  runCase(results, "peer-wire validatePeerWireProbe rejects required READ END after Bash START", () => assertPeerWireRejectsReadEndAfterBash(apis, root));
  runCase(results, "peer-wire validatePeerWireProbe rejects a missing required READ END", () => assertPeerWireRejectsMissingOrFailedEnd(apis, root, "missing-end"));
  runCase(results, "peer-wire validatePeerWireProbe rejects a failed required READ END", () => assertPeerWireRejectsMissingOrFailedEnd(apis, root, "failed-end"));
  runCase(results, "disabled preflight requires its exact terminal ID", () => assertExactDisabledTerminal(apis));
  runCase(results, "disabled preflight exact terminal is accepted", () => assertExactDisabledTerminalAccepted(apis));
  runCase(results, "fallback dispatch waits for disabled preflight END", () => assertFallbackDispatchWaitsForDisabledEnd(apis));
  runCase(results, "fallback dispatch after disabled preflight END remains valid", () => assertFallbackDispatchAfterDisabledEnd(apis));

  runCase(results, "review firstPathSequence rejects START-only reads", () => assertReviewPathSequenceRequiresSuccessfulEnd(apis, root, "start-only"));
  runCase(results, "review firstPathSequence rejects mismatched-END reads", () => assertReviewPathSequenceRequiresSuccessfulEnd(apis, root, "mismatched-end"));
  runCase(results, "review firstPathSequence rejects failed-END reads", () => assertReviewPathSequenceRequiresSuccessfulEnd(apis, root, "failed-end"));
  runCase(results, "review firstPathSequence accepts correlated successful ENDs", () => assertReviewPathSequenceRequiresSuccessfulEnd(apis, root, "success"));
  runCase(results, "review inspection rejects uncompleted pre-fanout reads", () => assertReviewInspectionRequiresSuccessfulEnds(apis, root, "start-only"));
  runCase(results, "review inspection accepts completed pre-fanout reads", () => assertReviewInspectionRequiresSuccessfulEnds(apis, root, "success"));

  runCase(results, "alignment rejects matching successful END before START", () => assertAlignmentReadPathsRejectEndBeforeStart(apis, root));
  runCase(results, "alignment accepts legitimate START before END for both consumers", () => assertAlignmentReadConsumersAcceptLegitimateOrder(apis, root));
  runCase(results, "alignment rejects a foreign absolute overlay suffix", () => assertAlignmentRejectsForeignOverlay(apis, root));

  const failures = results.filter((result) => result.status === "FAIL");
  const summary = {
    probe: "final-retained-read-boundary-red",
    phase: "RED",
    task: "T-011",
    test_file: TEST_FILE,
    root,
    acceptance_criteria: ["AC-016"],
    criteria_to_tests: {
      "AC-016": results.map((result) => `${TEST_FILE}::${result.name}`),
    },
    new_test_refs: [
      `${TEST_FILE}::peer-wire validatePeerWireProbe accepts every successful READ END before Bash START`,
      `${TEST_FILE}::peer-wire validatePeerWireProbe rejects required READ END after Bash START`,
      `${TEST_FILE}::peer-wire validatePeerWireProbe rejects a missing required READ END`,
      `${TEST_FILE}::peer-wire validatePeerWireProbe rejects a failed required READ END`,
    ],
    api_recipe: {
      seam: "temporary export-only seam from fallback.mjs",
      validator: "apis.fallback.validatePeerWireProbe(sessionEvidence, projectRoot, fixture, manifest, probe)",
      session: "new apis.fallback.RpcSession({ omp, cwd, env, timeoutMs, evidence, probe })",
      fixture: "owned local checkout file plus valid/malformed TDD peer payloads, protocol consumer, helper, and git-source receipt",
      temporal_controls: ["all READ START/END pairs before Bash START", "all READ STARTs before Bash START and ENDs after it", "missing required READ END", "failed required READ END"],
      execution: "source-only actual consumer invocation; no OMP, SDK, model, network, Git, shell, or Native claim",
    },
    source_bindings: {
      fallback: { path: FALLBACK_SOURCE, sha256: sha256(fs.readFileSync(FALLBACK_SOURCE)) },
      review_context: { path: REVIEW_SOURCE, sha256: sha256(fs.readFileSync(REVIEW_SOURCE)) },
      alignment: { path: ALIGNMENT_SOURCE, sha256: sha256(fs.readFileSync(ALIGNMENT_SOURCE)) },
    },
    cases: results,
    assertion_failure_count: failures.filter((result) => result.failure_kind === "ASSERTION").length,
    unexpected_failure_count: failures.filter((result) => result.failure_kind === "UNEXPECTED").length,
    expected_consumer_behavior: "successful correlated read ENDs must precede the matching Bash START by host arrival order; missing or failed read ENDs remain rejected; exact disabled preflight terminal identity must bind; foreign absolute alignment overlays must remain unknown",
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  assert.equal(failures.length, 0, `retained read boundary probe failed ${failures.length} case(s): ${JSON.stringify(failures)}`);
}

await main();
