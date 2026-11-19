import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as quality from "../tdd-orchestrator/lib/quality.mjs";
import * as ship from "../ship/bin/lib.mjs";
import { validateReviewerResult } from "../deep-review/lib/protocol.mjs";

// Export-only seams over the actual consumers: no OMP, network, or model calls.
let root, profiles, review, fallback, retry, lifecycle;
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "native-consumer-remediation-"));
  const dir = path.join(root, "implementation-evidence/native-release");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, "deep-review/lib"), { recursive: true });
  fs.copyFileSync("deep-review/lib/protocol.mjs", path.join(root, "deep-review/lib/protocol.mjs"));
  const exports = {
    profiles: ["RpcSession", "extractOfflinePeerFrame", "safeTaskRecord", "safeSubagentPayload", "nativeProgressTerminalRecord", "observedSuccessfulTerminal", "assertTerminalDispatch", "assertPeerCase", "loadOfflinePeerProgress", "addTaskDetails"],
    "review-context": ["NativeRpcSession", "inspectNativeEvidence"],
    fallback: ["RpcSession", "successfulReadEnd", "assembleFallback", "publicReviewData"],
    "technical-retry-scenario": ["taskCompletionBinding"],
    lifecycle: ["revalidateDeliveryConsumers", "makeQualityFixture", "createNativeEnvironment", "prepareRouteHostArtifacts", "ALIGNMENT_RETAINED_PATHS"],
  };
  for (const [name, names] of Object.entries(exports)) {
    let text = fs.readFileSync(`implementation-evidence/native-release/${name}.mjs`, "utf8").replaceAll("\r\n", "\n");
    if (name === "profiles") {
      const footer = text.lastIndexOf("\nawait main().catch((error) => {");
      expect(footer).toBeGreaterThan(0);
      text = text.slice(0, footer);
    }
    const alreadyExported = new Set([...text.matchAll(/export\s*\{([^}]+)\}/g)].flatMap((match) => match[1].split(",").map((value) => value.trim())));
    const missing = names.filter((value) => !alreadyExported.has(value));
    fs.writeFileSync(path.join(dir, `${name}.mjs`), `${text}\nexport { ${missing.join(", ")} };\n`);
  }
  [profiles, review, fallback, retry, lifecycle] = await Promise.all(Object.keys(exports).map((name) => import(/* @vite-ignore */ pathToFileURL(path.join(dir, `${name}.mjs`)).href)));
});
afterAll(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

const assignment = { id: "PeerPositive", agent: "peer-reviewer" };
it("binds fresh route source receipts to actual files rather than historical alignment pins", () => {
  const source = path.join(root, "fresh-route-source");
  const project = path.join(root, "fresh-route-project");
  fs.mkdirSync(project, { recursive: true });
  const transactionEntry = path.join(project, ".omp/skills/tdd-orchestrator/lib/fs-transaction/index.mjs");
  fs.mkdirSync(path.dirname(transactionEntry), { recursive: true });
  fs.copyFileSync("tdd-orchestrator/lib/fs-transaction/index.mjs", transactionEntry);
  for (const relative of lifecycle.ALIGNMENT_RETAINED_PATHS) {
    const file = path.join(source, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `current route source: ${relative}\n`);
  }
  const artifacts = lifecycle.prepareRouteHostArtifacts(project, { entries: [] }, { source, omp: process.execPath }, "route-run", "revision", "nonce", []);
  const receipt = JSON.parse(fs.readFileSync(path.join(project, artifacts.sourceFingerprints.path), "utf8"));
  expect(receipt.sources).toEqual(artifacts.preservationBefore.source.before.files);
  expect(receipt.sources).toHaveLength(6);
  for (const row of receipt.sources) expect(row.bytes).toBe(fs.statSync(path.join(source, row.path)).size);
});
function profileContext(record) {
  return { nativeEvidence: {
    task_calls: [{ toolCallId: "root-dispatch", items: [{ name: assignment.id, agent: assignment.agent }] }],
    task_details: [{ origin: "tool_execution_end", parentToolCallId: "root-dispatch", details: { results: [], progress: [] } }], subagent_terminal: [], subagent_frames: [], native_progress_terminal: [record], peer_cases: [],
  } };
}
function terminal(overrides = {}) {
  return { id: assignment.id, agent: assignment.agent, agentSource: "project", parentToolCallId: "root-dispatch", status: "completed", exitCode: 0, source_kind: "native_subagent_progress", ...overrides };
}

describe("Root END and offline channel regressions", () => {
  it.each([{}, { error: "failed Root" }, { failed: true }, { success: false }, { result: { error: "failed" } }, { result: { aborted: true } }, { result: { failed: true } }, { result: { success: false } }])("validates the real Root capture before admitting details %j", change => {
    const session = new profiles.RpcSession({});
    session.consumeLogical({ type: "tool_execution_start", toolName: "task", toolCallId: "root-dispatch", args: { tasks: [{ name: assignment.id, agent: assignment.agent, task: "inspect fixture", solutionSpace: "fixture only" }] } });
    const frame = { type: "tool_execution_end", toolName: "task", toolCallId: "root-dispatch", isError: false, ...change, result: { details: { results: [], async: true }, ...change.result } };
    if (Object.keys(change).length) {
      expect(() => session.consumeLogical(frame)).toThrow(/Root TASK END/);
      expect(session.evidence.task_details).toHaveLength(0);
    } else {
      session.consumeLogical(frame);
      expect(session.evidence.task_details.length).toBeGreaterThan(0);
    }
  });
  it("replays absent progress exit without fabricating zero and preserves dispatch checks", () => {
    const record = terminal({ exitCode: null, frame_type: "subagent_progress", progress: { id: assignment.id, agent: assignment.agent, agentSource: "project", status: "completed" } });
    const native = profileContext(record).nativeEvidence;
    native.task_calls[0].tool = "task";
    Object.assign(native.task_calls[0].items[0], { hasSolutionSpace: true, taskSha256: "d".repeat(64) });
    native.peer_cases = [{ id: assignment.id, expected: "APROVADO", status: "APROVADO", actual: { source_kind: "native_subagent_progress", status: "completed", exitCode: null }, consumer_validation: { accepted: true, status: "APROVADO" } }];
    const fixture = { worktree: root, revision: "a".repeat(40), baselineRevision: "b".repeat(40), diffEvidence: { sha256: "c".repeat(64), bytes: 1 } };
    const parsed = { phase: "green", run_id: "captured", fixture: { root, revision: fixture.revision, baseline_revision: fixture.baselineRevision, diff: fixture.diffEvidence }, native };
    expect(profiles.extractOfflinePeerFrame(parsed, fixture).frame.exitCode).toBeNull();
    const failed = structuredClone(parsed);failed.native.native_progress_terminal[0].exitCode = 1;
    expect(() => profiles.extractOfflinePeerFrame(failed, fixture)).toThrow();
    const unbound = structuredClone(parsed);unbound.native.task_details = [];
    expect(() => profiles.extractOfflinePeerFrame(unbound, fixture)).toThrow(/Root TASK END/);
  });
});
describe("profile terminal authority", () => {
  it("uses the real OMP18.18.6 AgentProgress contract without inventing an exit code", () => {
    // Sanitized envelope shape retained from real run 5ab1f38f: the SDK sent
    // completed progress, no numeric exit, and an owning asynchronous TASK END.
    const payload = profiles.safeSubagentPayload("subagent_progress", { id: assignment.id, parentToolCallId: "root-dispatch", progress: { id: assignment.id, agent: assignment.agent, agentSource: "project", status: "completed" } }, assignment.id);
    const record = profiles.nativeProgressTerminalRecord(payload);
    expect(record.exitCode).toBeNull();
    expect(profiles.observedSuccessfulTerminal(record, assignment.id, record.source_kind, true)).toBe(record);
    const context = profileContext(record);
    expect(profiles.assertTerminalDispatch(context, assignment.id, record)).toBe(record);
    context.nativeEvidence.task_details = [];
    expect(() => profiles.assertTerminalDispatch(context, assignment.id, record)).toThrow(/Root TASK END/);
    for (const change of [{ status: "failed" }, { status: "success" }, { isError: true }, { aborted: true }, { exitCode: 1 }, { exit_code_invalid: true }]) {
      expect(() => profiles.observedSuccessfulTerminal({ ...record, ...change }, assignment.id, record.source_kind, true)).toThrow();
    }
    expect(() => profiles.observedSuccessfulTerminal(record, assignment.id, "task_tool_details")).toThrow(/exitCode/);
  });
  it("preserves error flags in both terminal channels and refuses them", () => {
    const single = profiles.safeTaskRecord({ ...terminal(), isError: true, output: "approved" });
    expect(single.isError).toBe(true);
    expect(() => profiles.observedSuccessfulTerminal(single, assignment.id, "task_tool_details")).toThrow();
    const payload = profiles.safeSubagentPayload("subagent_progress", { ...terminal(), isError: true, progress: terminal() }, assignment.id);
    const progress = profiles.nativeProgressTerminalRecord(payload);
    expect(progress.isError).toBe(true);
    expect(() => profiles.observedSuccessfulTerminal(progress, assignment.id, progress.source_kind, true)).toThrow();
  });
  it.each([{ parentToolCallId: "other-dispatch" }, { parentToolCallId: null }, { agent: "validator" }, { agentSource: "user" }])("rejects unbound terminal %j", (change) => {
    const record = terminal(change);
    expect(() => profiles.assertTerminalDispatch(profileContext(record), assignment.id, record)).toThrow();
  });
  it("accepts the matching observed dispatch and rejects duplicate dispatch assignments", () => {
    const record = terminal();
    const context = profileContext(record);
    expect(profiles.assertTerminalDispatch(context, assignment.id, record)).toBe(record);
    context.nativeEvidence.task_calls.push(context.nativeEvidence.task_calls[0]);
    expect(() => profiles.assertTerminalDispatch(context, assignment.id, record)).toThrow();
  });
  it.each([{ status: "aborted" }, { exitCode: 1 }, { isError: true }, { aborted: true }])("rejects failed peer before protocol consumer %j", (change) => {
    let calls = 0;
    const record = terminal(change);
    expect(() => profiles.assertPeerCase(profileContext(record), { validateReviewerResult() { calls++; return { ok: true, status: "APROVADO" }; } }, { revision: "a".repeat(40) }, assignment, "APROVADO")).toThrow();
    expect(calls).toBe(0);
  });
  it("bounds an oversized offline file before JSON materialization", () => {
    const file = path.join(root, "oversize.json");
    fs.writeFileSync(file, "{}");
    fs.truncateSync(file, 64 * 1024 * 1024 + 1);
    expect(() => profiles.loadOfflinePeerProgress(file, {})).toThrow(/bounded/);
  });
  it("accepts a successful bound peer through the protocol consumer", () => {
    const record = terminal({ yield: [{ status: "success", data: { status: "APROVADO" } }] });
    const context = profileContext(record);
    profiles.assertPeerCase(context, { validateReviewerResult: () => ({ ok: true, status: "APROVADO" }) }, { revision: "a".repeat(40) }, assignment, "APROVADO");
    expect(context.nativeEvidence.peer_cases[0].consumer_validation.accepted).toBe(true);
  });
  it("retains Root binding when the same details were previously nested telemetry", () => {
    const evidence = { task_details: [] };
    const details = { results: [{ ...terminal(), output: "result" }] };
    profiles.addTaskDetails(evidence, details, "subagent_progress");
    profiles.addTaskDetails(evidence, details, "tool_execution_end", "root-dispatch");
    expect(evidence.task_details).toHaveLength(1);
    expect(evidence.task_details[0].parentToolCallId).toBe("root-dispatch");
    expect(() => profiles.addTaskDetails(evidence, details, "tool_execution_end", "other-dispatch")).toThrow();
  });
});

function reviewSession() {
  return new review.NativeRpcSession({ contexts: [{ kind: "branch-base", headRevision: "a".repeat(40) }], protocolConsumer: { validateReviewerResult: (data) => ({ ok: true, value: data }) } });
}
function dispatchReview(session) {
  session.recordTool({ type: "tool_execution_start", toolName: "task", toolCallId: "review-dispatch", args: { tasks: [{ name: "T009C-branch-base-1", agent: "deep-reviewer", task: "review exact diff", solutionSpace: "review" }] } });
}
function reviewRecord(change = {}) {
  return { id: "T009C-branch-base-1", agent: "deep-reviewer", agentSource: "project", parentToolCallId: "review-dispatch", status: "completed", exitCode: 0, structuredOutput: { data: { protocol_mode: "DEEP_REVIEW", reviewed_revision: "a".repeat(40) } }, ...change };
}
describe("review Root result authority", () => {
  it("requires channel-specific success and the actual owning TASK END", () => {
    const session = reviewSession(); dispatchReview(session);
    const record = reviewRecord({ exitCode: undefined });
    session.recordTerminal(record, record, "native_subagent_progress", "subagent_progress");
    const inspect = () => review.inspectNativeEvidence(session.evidence, [{ kind: "branch-base", receipt: { absolutePath: "receipt" }, files: [], deletions: [], diff: { absolutePath: "diff" }, descriptorPath: "context", headRevision: "a".repeat(40) }], root, root).filter((failure) => /terminal did not complete/.test(failure));
    expect(inspect()).toHaveLength(1);
    session.recordTool({ type: "tool_execution_end", toolName: "task", toolCallId: "review-dispatch", isError: false, result: { details: { results: [] } } });
    expect(inspect()).toEqual([]);
    expect(session.evidence.task_records[0].exitCode).toBeNull();
    session.evidence.task_records[0].source_kind = "task_tool_details";
    expect(inspect()).toHaveLength(1);
  });
  it("refuses errored TASK END even with a valid embedded result", () => {
    const session = reviewSession(); dispatchReview(session);
    expect(() => session.recordTool({ type: "tool_execution_end", toolName: "task", toolCallId: "review-dispatch", isError: true, result: { details: { results: [reviewRecord()] } } })).toThrow(/TASK END/);
    expect(session.evidence.task_records).toHaveLength(0);
  });
  it("binds inline result to its actual correlated TASK END", () => {
    const session = reviewSession(); dispatchReview(session);
    session.recordTool({ type: "tool_execution_end", toolName: "task", toolCallId: "review-dispatch", isError: false, result: { details: { results: [reviewRecord()] } } });
    expect(session.evidence.task_records[0].parentToolCallId).toBe("review-dispatch");
    const failures = review.inspectNativeEvidence(session.evidence, [{ kind: "branch-base", receipt: { absolutePath: "receipt" }, files: [], deletions: [], diff: { absolutePath: "diff" }, descriptorPath: "context", headRevision: "a".repeat(40) }], root, root);
    expect(failures.filter((failure) => /terminal (did not complete|is not bound)/.test(failure))).toEqual([]);
  });
  it.each([{ status: "failed" }, { status: "running" }, { isError: true }, { aborted: true }, { parentToolCallId: "other-root" }])("rejects contradictory review terminal %j", (change) => {
    const session = reviewSession(); dispatchReview(session);
    const record = reviewRecord(change);
    session.recordTerminal(record, record, "native_subagent_progress", "subagent_progress");
    const failures = review.inspectNativeEvidence(session.evidence, [{ kind: "branch-base", receipt: { absolutePath: "receipt" }, files: [], deletions: [], diff: { absolutePath: "diff" }, descriptorPath: "context", headRevision: "a".repeat(40) }], root, root);
    expect(failures.some((failure) => /terminal (did not complete|is not bound)/.test(failure))).toBe(true);
  });
});

describe("fallback read and findings", () => {
  it.each([undefined, {}, { status: "success" }, { content: [] }])("refuses successful transport without content %j", (result) => {
    expect(fallback.successfulReadEnd({ type: "tool_execution_end", toolName: "read", isError: false, result })).toBe(false);
  });
  it("accepts actual read content and rejects an orphan END", () => {
    const frame = { type: "tool_execution_end", toolName: "read", toolCallId: "read-1", isError: false, result: { content: [{ type: "text", text: "source bytes" }] } };
    expect(fallback.successfulReadEnd(frame)).toBe(true);
    const session = new fallback.RpcSession({ cwd: root, evidence: { tool_events: [], read_events: [], task_details: [], task_calls: [] } });
    expect(() => session.consumeLogical(frame)).toThrow(/START/);
    session.consumeLogical({ type: "tool_execution_start", toolName: "read", toolCallId: "read-1", args: { path: "source.mjs" } });
    session.consumeLogical(frame);
    expect(session.evidence.read_events[0].success).toBe(true);
  });
  it("retains malformed findings so the actual protocol cannot see an empty list", () => {
    expect(fallback.publicReviewData({ findings: [42, null] }).findings).toEqual([null, null]);
    const fields = { agent: "peer-reviewer", protocol_mode: "DEEP_REVIEW_FALLBACK", status: "VALID", reviewed_revision: "a".repeat(40), overall_correctness: "correct", explanation: "checked", confidence: 1 };
    const expected = { agent: fields.agent, protocol_mode: fields.protocol_mode, reviewed_revision: fields.reviewed_revision };
    expect(validateReviewerResult({ ...fields, findings: [] }, expected).ok).toBe(true);
    const result = fallback.assembleFallback({ yield: [...Object.entries(fields).map(([key, value]) => ({ status: "success", type: [key], data: value })), { status: "success", type: ["findings"], data: [42] }] });
    expect(result.findings).toEqual([null]);
    expect(validateReviewerResult(result, expected).ok).toBe(false);
  });
});

it("binds retry terminal role and source to its expected validator", () => {
  const definition = { run_id: "run", roles: { first_validator: { name: "first", role: "validator" } } };
  const record = { source_kind: "task_tool_details", id: "allocated", allocated_id: "allocated", index: 0, parent_tool_call_id: "dispatch", assignment_id: "first", run_id: "run", agent: "validator", agentSource: "project", status: "completed", exitCode: 0, exit_code_observed: true, isError: false, is_error_observed: true, jobId: "job", instanceId: "instance", structured_output_status: null };
  const observation = { task_records: [record], host: { dispatch: { job_id: "job", instance_id: "instance" } } };
  expect(retry.taskCompletionBinding(observation, definition, "first").ok).toBe(true);
  record.agent = "backend-developer";
  expect(retry.taskCompletionBinding(observation, definition, "first").failures).toContain("first_task_record_role_source_mismatch");
  record.agent = "validator"; record.agentSource = "user";
  expect(retry.taskCompletionBinding(observation, definition, "first").ok).toBe(false);
});

it("revalidates delivery proof at decision and rejects changed or invalid receipts", () => {
  const before = { ship_gate: { ok: true, proof_digest: "before" } };
  const ship = { validateShipQuality: () => ({ ok: true, proofDigest: "before" }) };
  expect(lifecycle.revalidateDeliveryConsumers(root, before, ship).ship_gate.ok).toBe(true);
  ship.validateShipQuality = () => ({ ok: true, proofDigest: "after" });
  expect(lifecycle.revalidateDeliveryConsumers(root, before, ship).ship_gate.ok).toBe(false);
  ship.validateShipQuality = () => ({ ok: false, errors: ["receipt changed"] });
  expect(lifecycle.revalidateDeliveryConsumers(root, before, ship).ship_gate.ok).toBe(false);
});

it("revalidates the actual file-backed quality context and receipt before lifecycle delivery", () => {
  const project = path.join(root, "delivery-project");
  for (const dir of ["src", "docs", "tests", ".omp/state"]) fs.mkdirSync(path.join(project, dir), { recursive: true });
  fs.writeFileSync(path.join(project, "src/tiny.mjs"), "export function answer() { return 1; }\n");
  fs.writeFileSync(path.join(project, "docs/functional-guide.md"), "Initial fixture documentation\n");
  fs.writeFileSync(path.join(project, "README.md"), "[Documentation](docs/functional-guide.md)\n");
  fs.writeFileSync(path.join(project, "tests/tiny.test.mjs"), "import { answer } from '../src/tiny.mjs';\nif (answer() !== 2) throw Error('wrong answer');\n");
  lifecycle.makeQualityFixture(project, quality, "delivery-regression");
  const original = ship.validateShipQuality(project, { required: true, reportPath: ".omp/state/quality.json", contextPath: ".omp/state/quality-context.json" });
  expect(original.ok, JSON.stringify(original.errors)).toBe(true);
  const before = { ship_gate: { ok: true, proof_digest: original.proofDigest } };
  expect(lifecycle.revalidateDeliveryConsumers(project, before, ship).ship_gate.ok).toBe(true);
  const contextFile = path.join(project, ".omp/state/quality-context.json");
  const contextBytes = fs.readFileSync(contextFile);
  fs.writeFileSync(contextFile, JSON.stringify({ schema_version: 1, context_digest: "b".repeat(64) }));
  expect(lifecycle.revalidateDeliveryConsumers(project, before, ship).ship_gate.ok).toBe(false);
  fs.writeFileSync(contextFile, contextBytes);
  fs.appendFileSync(path.join(project, ".omp/state/native10-review-source.txt"), "Changed after the initial decision.\n");
  expect(lifecycle.revalidateDeliveryConsumers(project, before, ship).ship_gate.ok).toBe(false);
});

it("inherits the native platform home without requiring the other operating system's variable", () => {
  const optional = process.platform === "win32" ? "HOME" : "USERPROFILE";
  const required = process.platform === "win32" ? "USERPROFILE" : "HOME";
  const priorOptional = process.env[optional];
  const priorRequired = process.env[required];
  try {
    delete process.env[optional];
    expect(lifecycle.createNativeEnvironment().env[required]).toBe(priorRequired);
    expect(lifecycle.createNativeEnvironment().env[optional]).toBeUndefined();
    delete process.env[required];
    expect(() => lifecycle.createNativeEnvironment()).toThrow(/missing/);
  } finally {
    if (priorOptional !== undefined) process.env[optional] = priorOptional;
    if (priorRequired !== undefined) process.env[required] = priorRequired;
  }
});
