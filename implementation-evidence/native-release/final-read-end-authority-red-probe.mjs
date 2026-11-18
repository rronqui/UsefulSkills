#!/usr/bin/env node
// Source-only RED probe for the final read END-authority boundary in AC-016.
//
// Each case imports the current private fallback, review-context, and alignment
// producers/consumers through a temporary export-only seam.  The fixtures are
// bounded RPC-shaped observations below a fresh temporary root: no OMP/SDK,
// model, network, Git, shell, source checkout, or production mutation is used.
// Positive controls retain complete START/END correlation and a real
// AgentEvent.isError:false envelope; negative controls vary only authority,
// including deliberately misplaced result metadata.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const FALLBACK_SOURCE = path.join(SOURCE_DIR, "fallback.mjs");
const REVIEW_SOURCE = path.join(SOURCE_DIR, "review-context.mjs");
const ALIGNMENT_SOURCE = path.join(SOURCE_DIR, "alignment.mjs");
const TEST_FILE = "implementation-evidence/native-release/final-read-end-authority-red-probe.mjs";
const SDK_TYPE_EVIDENCE = Object.freeze({
  version: "v18.18.6",
  emitter_source: "packages/agent/src/agent-loop.ts#L3539-L3558",
  type_source: "packages/agent/src/types.ts#L1352",
  result_source: "packages/agent/src/types.ts#AgentToolResult.content",
  fields: Object.freeze({
    AgentEvent_tool_execution_end: Object.freeze(["toolCallId", "toolName", "result", "isError"]),
    AgentToolResult: Object.freeze(["content", "isError"]),
  }),
});
const REVIEW_REVISION = "a".repeat(40);
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
    "expectedReadSet",
    "validateReadOrder",
  ]);
  const reviewSeam = makeSeam(root, REVIEW_SOURCE, "review-context", [
    "NativeRpcSession",
  ]);
  const alignmentSeam = makeSeam(root, ALIGNMENT_SOURCE, "alignment", [
    "RpcSession",
    "assertToolReadEvidence",
    "assertToolReadPaths",
  ]);
  const suffix = "?final_read_end_authority_v1";
  const [fallback, review, alignment] = await Promise.all([
    import(`${pathToFileURL(fallbackSeam).href}${suffix}`),
    import(`${pathToFileURL(reviewSeam).href}${suffix}`),
    import(`${pathToFileURL(alignmentSeam).href}${suffix}`),
  ]);
  assert.equal(typeof fallback.RpcSession, "function", "fallback seam must expose the actual RpcSession producer");
  assert.equal(typeof fallback.expectedReadSet, "function", "fallback seam must expose the actual read-set consumer");
  assert.equal(typeof fallback.validateReadOrder, "function", "fallback seam must expose validateReadOrder");
  assert.equal(typeof review.NativeRpcSession, "function", "review seam must expose the actual NativeRpcSession producer");
  assert.equal(typeof review.inspectNativeEvidence, "function", "review seam must expose inspectNativeEvidence");
  assert.equal(typeof alignment.RpcSession, "function", "alignment seam must expose the actual RpcSession producer");
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

function fallbackSession(RpcSession, root, evidence) {
  return new RpcSession({
    omp: "offline-final-read-end-authority",
    cwd: root,
    env: {},
    timeoutMs: 1_000,
    evidence,
  });
}

function fallbackReadStart(toolCallId, rawPath) {
  return {
    type: "tool_execution_start",
    toolName: "read",
    toolCallId,
    args: { path: rawPath },
  };
}

function toolResultContent(text, extra = {}) {
  return {
    content: [{ type: "text", text }],
    ...extra,
  };
}

function fallbackReadEnd(toolCallId, mode) {
  const frame = {
    type: "tool_execution_end",
    toolName: "read",
    toolCallId,
  };
  if (mode === "wrong-tool") {
    frame.toolName = "grep";
    frame.isError = false;
    frame.result = toolResultContent("wrong tool result");
  } else if (mode === "missing-positive") {
    // A ToolResult payload and arbitrary output text cannot stand in for the
    // SDK AgentEvent envelope's explicit isError:false authority.
    frame.result = toolResultContent("the read output contains the word error");
  } else if (mode === "nested-result-success") {
    // These fields are intentionally misplaced/untrusted.  Only the outer
    // AgentEvent.isError flag can authorize this END.
    frame.result = toolResultContent("nested result metadata is not transport authority", {
      isError: false,
      success: true,
      completed: true,
    });
  } else if (mode === "failed") {
    frame.isError = true;
    frame.result = toolResultContent("the read failed");
  } else if (mode === "contradictory") {
    frame.isError = false;
    frame.result = toolResultContent("contradictory ToolResult failure metadata", { isError: true });
  } else if (mode === "text-success") {
    frame.isError = false;
    frame.result = toolResultContent("the file content contains the word error");
  } else {
    frame.isError = false;
    frame.result = toolResultContent("read fixture content");
  }
  return frame;
}

function fallbackTask() {
  return {
    name: "ReadAuthorityDispatch",
    agent: "peer-reviewer",
    task: "Validate the bounded read-authority fixture.",
    solutionSpace: "read-only final END-authority regression fixture",
  };
}

function fallbackReadEvidence(apis, root, mode) {
  const fixture = { files: [] };
  const manifest = [];
  const evidence = baseFallbackEvidence();
  const session = fallbackSession(apis.fallback.RpcSession, root, evidence);
  const expected = apis.fallback.expectedReadSet(root, fixture, manifest);
  const target = [...expected][0];
  let index = 0;
  for (const expectedPath of expected) {
    const id = `fallback-read-${index}`;
    session.consumeLogical(fallbackReadStart(id, expectedPath));
    session.consumeLogical(fallbackReadEnd(id, expectedPath === target ? mode : "success"));
    index += 1;
  }
  session.consumeLogical({
    type: "tool_execution_start",
    toolName: "task",
    toolCallId: "fallback-dispatch",
    args: { tasks: [fallbackTask()] },
  });
  return { fixture, manifest, evidence, expected, target };
}

function expectKind(thunk, kind, label) {
  let caught = null;
  try {
    thunk();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label} must reject the unproven observation`);
  assert.equal(caught.kind ?? caught.code, kind, `${label} must reject with ${kind}`);
}

function assertFallbackAccepted(apis, root, mode = "success") {
  const { fixture, manifest, evidence, expected } = fallbackReadEvidence(apis, root, mode);
  let result;
  try {
    result = apis.fallback.validateReadOrder(evidence, root, fixture, manifest);
  } catch (error) {
    assert.fail(`fallback positive control ${mode} must accept explicit AgentEvent.isError:false: ${error?.kind ?? error?.code ?? error?.message ?? error}`);
  }
  assert.equal(result.expected, expected.size, "fallback positive control must retain the complete pinned read count");
  assert.equal(result.observed, expected.size, "fallback positive control must observe every correlated successful read");
  assert.ok(result.first_task_sequence > 1, "fallback dispatch must follow the retained root reads");
}

function assertFallbackRejected(apis, root, mode) {
  const { fixture, manifest, evidence } = fallbackReadEvidence(apis, root, mode);
  expectKind(
    () => apis.fallback.validateReadOrder(evidence, root, fixture, manifest),
    "BLOCKED",
    `fallback validateReadOrder ${mode}`,
  );
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

function reviewPaths(root, context) {
  const sourceRoot = path.join(root, "source");
  return [
    ...REVIEW_DOCUMENTATION_PATHS.map((relativePath) => path.resolve(sourceRoot, relativePath)),
    context.descriptorPath,
    context.receipt.absolutePath,
    context.diff.absolutePath,
    ...context.files.map((file) => file.absolutePath),
  ];
}

function reviewReadEnd(toolCallId, mode) {
  const frame = {
    type: "tool_execution_end",
    toolName: "read",
    toolCallId,
  };
  if (mode === "wrong-tool") {
    frame.toolName = "grep";
    frame.isError = false;
    frame.result = toolResultContent("wrong tool result");
  } else if (mode === "missing-positive") {
    frame.result = toolResultContent("the read output contains the word error");
  } else if (mode === "nested-result-success") {
    frame.result = toolResultContent("nested result metadata is not transport authority", {
      isError: false,
      success: true,
      completed: true,
    });
  } else if (mode === "failed") {
    frame.isError = true;
    frame.result = toolResultContent("the read failed");
  } else if (mode === "contradictory") {
    frame.isError = false;
    frame.result = toolResultContent("contradictory ToolResult failure metadata", { isError: true });
  } else if (mode === "text-success") {
    frame.isError = false;
    frame.result = toolResultContent("the file content contains the word error");
  } else {
    frame.isError = false;
    frame.result = toolResultContent("read fixture content");
  }
  return frame;
}

function reviewDispatch() {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId: "review-dispatch",
    args: {
      tasks: [{
        name: "T009C-branch-base-1",
        agent: "deep-reviewer",
        task: "Inspect the independently bound review fixture.",
        solutionSpace: "read-only final END-authority regression fixture",
      }],
    },
  };
}

function reviewEvidence(apis, root, mode) {
  const context = reviewContext(root);
  const sourceRoot = path.join(root, "source");
  const session = new apis.review.NativeRpcSession({
    omp: "offline-final-read-end-authority",
    cwd: root,
    timeoutMs: 1_000,
    contexts: [context],
    protocolConsumer: null,
  });
  const paths = reviewPaths(root, context);
  const target = paths[0];
  for (const [index, expectedPath] of paths.entries()) {
    const callId = `review-read-${index}`;
    session.consumeLogical({
      type: "tool_execution_start",
      toolName: "read",
      toolCallId: callId,
      args: { path: expectedPath },
    });
    session.consumeLogical(reviewReadEnd(callId, expectedPath === target ? mode : "success"));
  }
  session.consumeLogical(reviewDispatch());
  session.evidence.task_records.push({
    id: "T009C-branch-base-1",
    source_kind: "native_subagent_progress",
    agent: "deep-reviewer",
    agentSource: "project",
    status: "completed",
    exit_code_observed: false,
    structured: true,
    reviewedRevision: REVIEW_REVISION,
    protocolMode: "DEEP_REVIEW",
    consumer_validation: { ok: true },
  });
  session.evidence.terminal = {
    prompt_result: { status: "completed", agentInvoked: true },
    session_settled: true,
  };
  return { context, sourceRoot, evidence: session.evidence, target };
}

function assertReviewAccepted(apis, root, mode = "success") {
  const { context, sourceRoot, evidence } = reviewEvidence(apis, root, mode);
  let failures;
  try {
    failures = apis.review.inspectNativeEvidence(evidence, [context], sourceRoot, sourceRoot);
  } catch (error) {
    assert.fail(`review positive control ${mode} must accept explicit AgentEvent.isError:false: ${error?.kind ?? error?.code ?? error?.message ?? error}`);
  }
  assert.deepEqual(failures, [], "review positive control must accept all correlated reads before dispatch");
}

function assertReviewRejected(apis, root, mode) {
  const { context, sourceRoot, evidence } = reviewEvidence(apis, root, mode);
  const failures = apis.review.inspectNativeEvidence(evidence, [context], sourceRoot, sourceRoot);
  assert.ok(
    failures.some((failure) => /native root read evidence missing/i.test(failure)),
    `review inspectNativeEvidence ${mode} must report a missing authoritative read before dispatch: ${JSON.stringify(failures)}`,
  );
}

function alignmentSession(RpcSession, root) {
  return new RpcSession({
    omp: "offline-final-read-end-authority",
    cwd: root,
    env: {},
    label: "offline-final-read-end-authority",
    requestId: "request-final-read-end-authority",
    runId: "run-final-read-end-authority",
    timeoutMs: 1_000,
  });
}

function alignmentReadStart(toolCallId, rawPath, omitToolName = false) {
  const frame = {
    type: "tool_execution_start",
    toolCallId,
    args: { path: rawPath },
  };
  if (!omitToolName) frame.toolName = "read";
  return frame;
}

function alignmentReadEnd(toolCallId, mode) {
  const frame = {
    type: "tool_execution_end",
    toolCallId,
    toolName: "read",
  };
  if (mode === "missing-end-name") {
    delete frame.toolName;
    frame.isError = false;
    frame.result = toolResultContent("read fixture content");
  } else if (mode === "wrong-tool") {
    frame.toolName = "grep";
    frame.isError = false;
    frame.result = toolResultContent("wrong tool result");
  } else if (mode === "missing-positive") {
    frame.result = toolResultContent("the read output contains the word error");
  } else if (mode === "nested-result-success") {
    frame.result = toolResultContent("nested result metadata is not transport authority", {
      isError: false,
      success: true,
      completed: true,
    });
  } else if (mode === "failed") {
    frame.isError = true;
    frame.result = toolResultContent("the read failed");
  } else if (mode === "contradictory-result") {
    // Both fields are real ToolResult/AgentEvent metadata, but their
    // contradiction must fail closed rather than becoming success.
    frame.isError = false;
    frame.result = toolResultContent("contradictory ToolResult failure metadata", { isError: true });
  } else if (mode === "text-success") {
    frame.isError = false;
    frame.result = toolResultContent("the file content contains the word error");
  } else {
    frame.isError = false;
    frame.result = toolResultContent("read fixture content");
  }
  return frame;
}


function alignmentEvidence(apis, root, mode, missingStart = false) {
  const sourceRoot = path.join(root, "active-source");
  const expectedPaths = [
    path.join(sourceRoot, "alignment", "SKILL.md"),
    path.join(sourceRoot, "alignment", "references", "routing-and-persistence.md"),
  ];
  const session = alignmentSession(apis.alignment.RpcSession, root);
  const target = expectedPaths[0];
  for (const [index, expectedPath] of expectedPaths.entries()) {
    const callId = `alignment-read-${index}`;
    session.consumeLogical(alignmentReadStart(callId, expectedPath, missingStart && expectedPath === target));
    session.consumeLogical(alignmentReadEnd(callId, expectedPath === target ? mode : "success"));
  }
  return { sourceRoot, expectedPaths, evidence: session.evidence, target };
}

function assertAlignmentAccepted(apis, root, mode = "success") {
  const { sourceRoot, expectedPaths, evidence } = alignmentEvidence(apis, root, mode);
  try {
    apis.alignment.assertToolReadEvidence(evidence, `alignment ${mode}`, sourceRoot);
    apis.alignment.assertToolReadPaths(evidence, `alignment ${mode}`, expectedPaths);
  } catch (error) {
    assert.fail(`alignment positive control ${mode} must accept explicit AgentEvent.isError:false: ${error?.kind ?? error?.code ?? error?.message ?? error}`);
  }
}

function assertAlignmentRejected(apis, root, mode, missingStart = false) {
  const { sourceRoot, expectedPaths, evidence } = alignmentEvidence(apis, root, mode, missingStart);
  expectKind(
    () => apis.alignment.assertToolReadEvidence(evidence, `alignment ${mode}`, sourceRoot),
    "ASSERTION",
    `alignment assertToolReadEvidence ${mode}`,
  );
  expectKind(
    () => apis.alignment.assertToolReadPaths(evidence, `alignment ${mode}`, expectedPaths),
    "ASSERTION",
    `alignment assertToolReadPaths ${mode}`,
  );
}

function assertAlignmentMissingEndNamePreservesUnknown(apis, root) {
  const { sourceRoot, expectedPaths, evidence, target } = alignmentEvidence(apis, root, "missing-end-name");
  const targetEnd = evidence.tool_events.find((event) => event.type === "tool_execution_end" && event.toolCallId === "alignment-read-0");
  assert.ok(targetEnd, "alignment producer must retain the raw END observation");
  assert.equal(Object.hasOwn(targetEnd, "toolName"), false, "alignment producer must preserve an unexposed END name as unknown, not invent read");
  try {
    apis.alignment.assertToolReadEvidence(evidence, "alignment strong START correlation", sourceRoot);
    apis.alignment.assertToolReadPaths(evidence, "alignment strong START correlation", expectedPaths);
  } catch (error) {
    assert.fail(`alignment missing-END-name positive control must accept strong START correlation: ${error?.kind ?? error?.code ?? error?.message ?? error}`);
  }
  assert.equal(target, expectedPaths[0], "alignment missing-END-name control must target the exact correlated START path");
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
        code: error?.code,
        kind: error?.kind,
        message: String(error?.message ?? error),
      },
    });
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "final-read-end-authority-red-"));
  const apis = await loadConsumers(root);
  const results = [];

  runCase(results, "fallback accepts a complete correlated read set before dispatch", () => assertFallbackAccepted(apis, root));
  runCase(results, "fallback rejects a correlated ID whose END names a different tool", () => assertFallbackRejected(apis, root, "wrong-tool"));
  runCase(results, "fallback rejects an END without positive SDK success metadata", () => assertFallbackRejected(apis, root, "missing-positive"));
  runCase(results, "fallback rejects result success metadata without an SDK envelope flag", () => assertFallbackRejected(apis, root, "nested-result-success"));
  runCase(results, "fallback rejects explicitly failed read metadata", () => assertFallbackRejected(apis, root, "failed"));
  runCase(results, "fallback rejects contradictory success and isError metadata", () => assertFallbackRejected(apis, root, "contradictory"));
  runCase(results, "fallback accepts explicit success even when read content contains error text", () => assertFallbackAccepted(apis, root, "text-success"));

  runCase(results, "review accepts a complete correlated read set before dispatch", () => assertReviewAccepted(apis, root));
  runCase(results, "review rejects a correlated ID whose END names a different tool", () => assertReviewRejected(apis, root, "wrong-tool"));
  runCase(results, "review rejects an END without positive SDK completion metadata", () => assertReviewRejected(apis, root, "missing-positive"));
  runCase(results, "review rejects result success metadata without an SDK envelope flag", () => assertReviewRejected(apis, root, "nested-result-success"));
  runCase(results, "review rejects explicitly failed read metadata", () => assertReviewRejected(apis, root, "failed"));
  runCase(results, "review rejects contradictory success and isError metadata", () => assertReviewRejected(apis, root, "contradictory"));
  runCase(results, "review accepts explicit success even when read content contains error text", () => assertReviewAccepted(apis, root, "text-success"));

  runCase(results, "alignment accepts a complete correlated source and route read set", () => assertAlignmentAccepted(apis, root));
  runCase(results, "alignment accepts an unexposed END name when exact START correlation is strong", () => assertAlignmentMissingEndNamePreservesUnknown(apis, root));
  runCase(results, "alignment rejects a correlated ID whose END names a different tool", () => assertAlignmentRejected(apis, root, "wrong-tool"));
  runCase(results, "alignment rejects an END without positive SDK completion metadata", () => assertAlignmentRejected(apis, root, "missing-positive"));
  runCase(results, "alignment rejects result success metadata without an SDK envelope flag", () => assertAlignmentRejected(apis, root, "nested-result-success"));
  runCase(results, "alignment rejects explicitly failed read metadata", () => assertAlignmentRejected(apis, root, "failed"));
  runCase(results, "alignment rejects contradictory nested trusted metadata", () => assertAlignmentRejected(apis, root, "contradictory-result"));
  runCase(results, "alignment rejects a read END with no authoritative START tool", () => assertAlignmentRejected(apis, root, "success", true));
  runCase(results, "alignment accepts explicit success even when read content contains error text", () => assertAlignmentAccepted(apis, root, "text-success"));

  const failures = results.filter((result) => result.status === "FAIL");
  const summary = {
    probe: "final-read-end-authority-red",
    task: "T-011",
    phase: "RED",
    test_file: TEST_FILE,
    root,
    acceptance_criteria: ["AC-016"],
    criteria_to_tests: {
      "AC-016": results.map((result) => `${TEST_FILE}::${result.name}`),
    },
    source_bindings: {
      fallback: { path: FALLBACK_SOURCE, sha256: sha256(fs.readFileSync(FALLBACK_SOURCE)) },
      review_context: { path: REVIEW_SOURCE, sha256: sha256(fs.readFileSync(REVIEW_SOURCE)) },
      alignment: { path: ALIGNMENT_SOURCE, sha256: sha256(fs.readFileSync(ALIGNMENT_SOURCE)) },
    },
    sdk_type_evidence: SDK_TYPE_EVIDENCE,
    cases: results,
    assertion_failure_count: failures.filter((result) => result.failure_kind === "ASSERTION").length,
    unexpected_failure_count: failures.filter((result) => result.failure_kind === "UNEXPECTED").length,
    false_positive_controls: [
      "An explicit SDK isError:false read END with ToolResult content remains accepted even when result text contains the word error; arbitrary content is not failure authority.",
      "The alignment positive control permits an unexposed END tool name when exact read START/correlation/path evidence is strong; the producer keeps the raw name unknown and does not synthesize read.",
      "A nested ToolResult isError:false or success/completed field without the AgentEvent envelope isError flag remains unknown and cannot authorize a read.",
    ],
    expected_consumer_behavior: "Only a correlated read START plus an authoritative AgentEvent END with explicit isError:false may satisfy dispatch/full-read acceptance; wrong-tool, absent-positive, failed/contradictory metadata, nested result metadata, and missing START authority remain unproven.",
    commands_not_run: [`node ${TEST_FILE}`],
    documentation_impact: "none",
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  assert.equal(failures.length, 0, `final read END authority probe failed ${failures.length} case(s): ${JSON.stringify(failures)}`);
}

await main();
