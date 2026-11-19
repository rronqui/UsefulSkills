#!/usr/bin/env node
// Source-only RED probe for the round-two native observer boundaries in
// T-011 / AC-016, with the T-009B / AC-013 terminal-consumer dependency.
//
// The probe imports the real profiles.mjs and review-context.mjs functions
// through disposable export-only seams.  The profiles CLI entry is removed
// only from the temporary seam because that module has an unconditional CLI
// footer; no production function is replaced or reimplemented.  The review
// close cases use a bounded process-shaped fixture, never OMP, an SDK, a
// model, a network, a shell, or a Native receipt.  Every close negative uses
// a process exit code of zero; a nonzero synthetic child cannot prove this
// boundary.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const PROFILES_SOURCE = path.join(SOURCE_DIR, "profiles.mjs");
const REVIEW_CONTEXT_SOURCE = path.join(SOURCE_DIR, "review-context.mjs");
const TEST_FILE = "implementation-evidence/native-release/round2-observer-boundary-red-probe.mjs";
const REVIEW_REVISION = "a".repeat(40);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertRegular(file, label) {
  const info = fs.lstatSync(file);
  assert.equal(info.isSymbolicLink(), false, `${label} must not be a symbolic link`);
  assert.equal(info.isFile(), true, `${label} must be a regular file`);
}

function neutralizeProfilesCli(sourceText) {
  sourceText = sourceText.replaceAll("\r\n", "\n");
  // profiles.mjs has an unconditional footer rather than the guarded CLI
  // pattern used by review-context.mjs.  Match the exact footer and remove no
  // other source text before adding the temporary exports below.
  const marker = "\nawait main().catch((error) => {";
  const start = sourceText.lastIndexOf(marker);
  assert.ok(start >= 0, "profiles.mjs CLI footer was not found for the seam");
  const footer = sourceText.slice(start).trim();
  const expectedFooter = [
    "await main().catch((error) => {",
    "  const kind = error?.kind ?? \"BLOCKED\";",
    "  const status = kind === \"USAGE\" ? \"USAGE\" : \"BLOCKED\";",
    "  process.stdout.write(`${JSON.stringify({ status, detail: kind === \"USAGE\" ? scrubText(error.message) : opaqueError(error?.message ?? error) })}\\n`);",
    "  process.exitCode = kind === \"USAGE\" ? 64 : 2;",
    "});",
  ].join("\n");
  assert.equal(footer, expectedFooter, "profiles.mjs seam may remove only its known CLI footer");
  return `${sourceText.slice(0, start)}\n`;
}

function makeSeams(root) {
  assertRegular(PROFILES_SOURCE, "profiles.mjs source");
  assertRegular(REVIEW_CONTEXT_SOURCE, "review-context.mjs source");
  const seamDirectory = path.join(root, "source-overlay", "implementation-evidence", "native-release");
  fs.mkdirSync(seamDirectory, { recursive: true });

  const profilesBytes = fs.readFileSync(PROFILES_SOURCE);
  const profilesSeam = path.join(seamDirectory, "profiles.seam.mjs");
  const profilesExports = [
    "safeSubagentProgress",
    "safeSubagentPayload",
    "nativeProgressTerminalRecord",
    "requireObservedTerminalRecord",
    "addTaskDetails",
  ];
  fs.writeFileSync(
    profilesSeam,
    `${neutralizeProfilesCli(profilesBytes.toString("utf8"))}\n// Temporary export-only seam; never part of the product.\nexport { ${profilesExports.join(", ")} };\n`,
    "utf8",
  );

  const reviewBytes = fs.readFileSync(REVIEW_CONTEXT_SOURCE);
  const reviewSeam = path.join(seamDirectory, "review-context.seam.mjs");
  fs.writeFileSync(
    reviewSeam,
    `${reviewBytes.toString("utf8")}\n\n// Temporary export-only seam; never part of the product.\nexport { NativeRpcSession };\n`,
    "utf8",
  );

  return {
    profilesSeam,
    reviewSeam,
    sourceBindings: {
      profiles: { path: PROFILES_SOURCE, sha256: sha256(profilesBytes) },
      review_context: { path: REVIEW_CONTEXT_SOURCE, sha256: sha256(reviewBytes) },
    },
  };
}

async function loadApis(root) {
  const seams = makeSeams(root);
  const [profiles, reviewContext] = await Promise.all([
    import(`${pathToFileURL(seams.profilesSeam).href}?round2_profiles=${seams.sourceBindings.profiles.sha256}`),
    import(`${pathToFileURL(seams.reviewSeam).href}?round2_review_context=${seams.sourceBindings.review_context.sha256}`),
  ]);
  for (const name of [
    "safeSubagentProgress",
    "safeSubagentPayload",
    "nativeProgressTerminalRecord",
    "requireObservedTerminalRecord",
    "addTaskDetails",
  ]) {
    assert.equal(typeof profiles[name], "function", `profiles seam must expose the real ${name} function`);
  }
  assert.equal(typeof reviewContext.NativeRpcSession, "function", "review-context seam must expose the real NativeRpcSession class");
  return { ...seams, profiles, reviewContext };
}

function progressPayload(apis, id, progress) {
  return apis.profiles.safeSubagentPayload(
    "subagent_progress",
    {
      id,
      agent: "peer-reviewer",
      agentSource: "project",
      status: progress.status,
      progress,
    },
    id,
  );
}

function progressTerminal(apis, id, progress) {
  const safe = apis.profiles.safeSubagentProgress(progress);
  const payload = progressPayload(apis, id, progress);
  const record = apis.profiles.nativeProgressTerminalRecord(payload);
  assert.ok(record, `native progress terminal record must exist for ${id}`);
  return { safe, payload, record };
}

function progressContext(record) {
  return {
    nativeEvidence: {
      native_progress_terminal: [record],
      task_details: [],
      subagent_terminal: [],
    },
  };
}

function assertUnknownProgressExit(apis, id, progress, label) {
  const { safe, record } = progressTerminal(apis, id, progress);
  let consumerError = null;
  let observed;
  try {
    observed = apis.profiles.requireObservedTerminalRecord(progressContext(record), record.id);
  } catch (error) {
    consumerError = error;
  }
  assert.ok(
    consumerError,
    `${label}: the real observed-terminal consumer accepted an unobserved progress terminal${observed?.record?.exitCode === undefined ? "" : ` with inferred exitCode ${observed.record.exitCode}`}`,
  );
  assert.ok(
    safe.exitCode === null || safe.exitCode === undefined,
    `${label}: absent/invalid SDK exitCode must remain unknown in safe progress, not ${String(safe.exitCode)}`,
  );
  assert.ok(
    record.exitCode === null || record.exitCode === undefined,
    `${label}: progress status manufactured numeric terminal exitCode ${String(record.exitCode)}`,
  );
  return record;
}

function assertObservedTerminalBlocked(apis, record, label) {
  assert.throws(
    () => apis.profiles.requireObservedTerminalRecord(progressContext(record), record.id),
    Error,
    `${label}: progress without an observed successful exit must not satisfy the real consumer`,
  );
}

function assertCompletedProgressWithoutExitStaysUnknown(apis) {
  const id = "round2-progress-completed-unknown";
  const { record } = progressTerminal(apis, id, { id, status: "completed" });
  const observed = apis.profiles.requireObservedTerminalRecord(progressContext(record), id);
  assert.equal(observed.record.exitCode, null, "AgentProgress completed proves its channel status, never a numeric exit");
}

function assertFailedProgressWithoutExitStaysUnknown(apis) {
  const id = "round2-progress-failed-unknown";
  assertUnknownProgressExit(apis, id, { id, status: "failed" }, "failed progress");
}

function assertInvalidProgressExitStaysUnknown(apis) {
  const id = "round2-progress-invalid-exit";
  assertUnknownProgressExit(
    apis,
    id,
    { id, status: "completed", exitCode: "0" },
    "invalid progress exit",
  );
}

function assertObservedZeroProgressSurvives(apis) {
  const id = "round2-progress-observed-zero";
  const { safe, record } = progressTerminal(apis, id, { id, status: "completed", exitCode: 0 });
  assert.equal(safe.exitCode, 0, "authentic SDK exitCode 0 must survive safeSubagentProgress");
  assert.equal(record.exitCode, 0, "authentic successful progress exitCode must survive terminal normalization");
  const observed = apis.profiles.requireObservedTerminalRecord(progressContext(record), id);
  assert.equal(observed.source_kind, "native_subagent_progress", "real consumer must retain progress provenance");
  assert.equal(observed.record.exitCode, 0, "real observed-terminal consumer must accept only the authentic zero exit");
}

function assertObservedNonzeroProgressSurvivesAndBlocks(apis) {
  const id = "round2-progress-observed-nonzero";
  const { safe, record } = progressTerminal(apis, id, { id, status: "failed", exitCode: 7 });
  assert.equal(safe.exitCode, 7, "authentic nonzero SDK exitCode must survive safeSubagentProgress");
  assert.equal(record.exitCode, 7, "terminal normalization must not replace an authentic nonzero exit with status-derived 1");
  assertObservedTerminalBlocked(apis, record, "authentic nonzero progress exit");
}

function assertProgressExitWithoutStatusRejected(apis) {
  const id = "round2-progress-exit-without-status";
  const produced = progressTerminal(apis, id, { id, status: "completed", exitCode: 0 }).record;
  // The actual progress producer supplies status; this clone models a malformed
  // retained/replay record at the consumer boundary without inventing an SDK wire.
  const replayed = { ...produced };
  delete replayed.status;
  if (replayed.progress && typeof replayed.progress === "object") {
    replayed.progress = { ...replayed.progress };
    delete replayed.progress.status;
  }
  assert.equal(replayed.exitCode, 0, "replayed native progress control must retain its authentic exitCode");
  assert.equal(Object.hasOwn(replayed, "status"), false, "the malformed replay boundary must omit the retained record status");
  assert.throws(
    () => apis.profiles.requireObservedTerminalRecord(progressContext(replayed), id),
    Error,
    "native progress with exitCode but no observed status must remain unknown to the real consumer",
  );
}

function taskDetailsContext(apis, id, sdkResult) {
  const nativeEvidence = {
    task_details: [],
    native_progress_terminal: [],
    subagent_terminal: [],
  };
  // addTaskDetails follows the real AgentToolResult.details.results sanitizer.
  apis.profiles.addTaskDetails(
    nativeEvidence,
    { results: [{ id, ...sdkResult }] },
    "source-only-sdk-task-details",
  );
  assert.equal(nativeEvidence.task_details.length, 1, "SDK task-details producer must retain one sanitized details envelope");
  return { nativeEvidence };
}

function assertTaskDetailsStatusOnlyRejected(apis) {
  const id = "round2-task-details-status-only";
  const context = taskDetailsContext(apis, id, { status: "completed" });
  const record = context.nativeEvidence.task_details[0].details.results[0];
  assert.equal(record.status, "completed", "status-only result must reach the consumer through task_details.results");
  assert.equal(Object.hasOwn(record, "exitCode"), false, "status-only result must not gain an inferred exitCode");
  assert.equal(Object.hasOwn(record, "output_text"), false, "status-only result must not gain an inferred output payload");
  assert.throws(
    () => apis.profiles.requireObservedTerminalRecord(context, id),
    Error,
    "task_details.results status alone must not satisfy the real observed-terminal consumer",
  );
}

function assertSingleResultWithoutStatusAccepted(apis) {
  const id = "round2-task-details-single-result";
  const context = taskDetailsContext(apis, id, {
    exitCode: 0,
    output: "real observed SingleResult output",
  });
  const record = context.nativeEvidence.task_details[0].details.results[0];
  assert.equal(record.exitCode, 0, "SingleResult must preserve its authentic numeric exitCode");
  assert.equal(record.output_text, "real observed SingleResult output", "SingleResult output must remain real terminal payload");
  assert.equal(Object.hasOwn(record, "status"), false, "SDK SingleResult does not require a status field");
  const observed = apis.profiles.requireObservedTerminalRecord(context, id);
  assert.equal(observed.source_kind, "task_tool_details", "statusless SingleResult must use the task-details consumer path");
  assert.equal(observed.record.exitCode, 0, "statusless SingleResult with real exitCode must remain accepted");
}


function makeReviewSession(NativeRpcSession, root) {
  const session = new NativeRpcSession({
    omp: "source-only-fake-omp",
    cwd: root,
    timeoutMs: 1_000,
    contexts: [{ kind: "branch-base", headRevision: REVIEW_REVISION }],
    protocolConsumer: {},
  });
  // abortWith() rejects this deferred when the parser enters a fatal state.
  // Attach handlers because this probe intentionally drives that state.
  session.ready.promise.catch(() => {});
  session.closed.promise.catch(() => {});
  session.settled.promise.catch(() => {});
  const fixture = {
    closeCode: 0,
    stdinEnded: false,
    killCalled: false,
    child: null,
  };
  fixture.child = {
    killed: false,
    stdin: {
      end() {
        fixture.stdinEnded = true;
      },
    },
    kill() {
      fixture.killCalled = true;
      this.killed = true;
    },
  };
  session.child = fixture.child;
  session.evidence.process = { exit_code: fixture.closeCode, signal: null };
  session.__round2Fixture = fixture;
  return session;
}

function feedValidSettlement(session) {
  const promptResult = {
    type: "prompt_result",
    status: "completed",
    agentInvoked: true,
    sessionSettled: true,
  };
  const settled = { type: "session_settled" };
  session.consumeBytes(Buffer.from(`${JSON.stringify(promptResult)}\n${JSON.stringify(settled)}\n`, "utf8"));
  assert.equal(session.evidence.terminal?.prompt_result?.status, "completed", "fixture must expose a valid prior prompt settlement");
  assert.equal(session.evidence.terminal?.prompt_result?.agentInvoked, true, "fixture must expose root invocation before drain");
  assert.equal(session.evidence.terminal?.session_settled, true, "fixture must expose session_settled before drain");
}

async function closeAtZero(session) {
  const closing = session.close();
  session.closed.resolve({ code: 0, signal: null });
  await closing;
}

async function assertCloseRejectsAtZero(session, label) {
  await assert.rejects(
    () => closeAtZero(session),
    (error) => {
      assert.ok(error instanceof Error, `${label}: close must reject with an Error`);
      return true;
    },
    `${label}: zero process exit cannot authorize an incomplete/fatal transport drain`,
  );
  assert.equal(session.__round2Fixture.closeCode, 0, `${label}: the negative fixture must use process exit zero`);
  assert.equal(session.__round2Fixture.stdinEnded, true, `${label}: close must still drain stdin before rejecting`);
}

async function assertCleanDrainAccepted(apis, root) {
  const session = makeReviewSession(apis.reviewContext.NativeRpcSession, root);
  feedValidSettlement(session);
  await closeAtZero(session);
  assert.equal(session.__round2Fixture.closeCode, 0, "clean-drain positive control must use process exit zero");
  assert.equal(session.__round2Fixture.stdinEnded, true, "clean-drain positive control must end stdin");
  assert.equal(session.rawBuffer.byteLength, 0, "clean-drain positive control must have no leftover raw bytes");
  assert.equal(session.chunk, null, "clean-drain positive control must have no incomplete rpc_chunk");
  assert.equal(session.fatal, null, "clean-drain positive control must have no fatal parser state");
}

async function assertShortJsonRejects(apis, root) {
  const session = makeReviewSession(apis.reviewContext.NativeRpcSession, root);
  feedValidSettlement(session);
  session.consumeBytes(Buffer.from('{"type":"session_settled"', "utf8"));
  assert.ok(session.rawBuffer.byteLength > 0, "short JSON fixture must leave rawBuffer bytes after valid settlement");
  await assertCloseRejectsAtZero(session, "leftover short JSON");
}

async function assertIncompleteChunkRejects(apis, root) {
  const session = makeReviewSession(apis.reviewContext.NativeRpcSession, root);
  feedValidSettlement(session);
  session.protocolVersion = 2;
  const logicalBytes = Buffer.from('{"type":"session_settled"}', "utf8");
  const firstChunk = {
    type: "rpc_chunk",
    chunkId: "round2-incomplete-chunk",
    index: 0,
    count: 2,
    byteLength: logicalBytes.byteLength,
    data: logicalBytes.toString("base64"),
  };
  session.consumeBytes(Buffer.from(`${JSON.stringify(firstChunk)}\n`, "utf8"));
  assert.ok(session.chunk, "incomplete rpc_chunk fixture must retain reassembly state after valid settlement");
  assert.equal(session.chunk.next, 1, "incomplete rpc_chunk fixture must expose exactly one missing chunk");
  await assertCloseRejectsAtZero(session, "incomplete rpc_chunk");
}

async function assertFatalParserStateRejects(apis, root) {
  const session = makeReviewSession(apis.reviewContext.NativeRpcSession, root);
  feedValidSettlement(session);
  session.consumeBytes(Buffer.from('{"type":"session_settled",}\n', "utf8"));
  assert.ok(session.fatal, "malformed JSON fixture must enter the actual fatal parser state");
  assert.equal(session.__round2Fixture.closeCode, 0, "fatal parser fixture must still use process exit zero");
  await assertCloseRejectsAtZero(session, "fatal parser state");
}

async function runCase(results, name, run) {
  try {
    await run();
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "round2-observer-boundary-red-"));
  const results = [];
  try {
    const apis = await loadApis(root);
    await runCase(results, "profiles completed progress uses SDK channel status while numeric exit remains unknown", () => assertCompletedProgressWithoutExitStaysUnknown(apis));
    await runCase(results, "profiles failed progress without SDK exit remains unknown and never proves numeric failure", () => assertFailedProgressWithoutExitStaysUnknown(apis));
    await runCase(results, "profiles invalid progress exit metadata remains unknown and blocks the real observed-terminal consumer", () => assertInvalidProgressExitStaysUnknown(apis));
    await runCase(results, "profiles authentic zero SDK exit survives sanitization and is accepted by the real observed-terminal consumer", () => assertObservedZeroProgressSurvives(apis));
    await runCase(results, "profiles authentic nonzero SDK exit survives sanitization and is rejected by the real observed-terminal consumer", () => assertObservedNonzeroProgressSurvivesAndBlocks(apis));
    await runCase(results, "profiles native progress with authentic exitCode but missing status is rejected by the real observed-terminal consumer", () => assertProgressExitWithoutStatusRejected(apis));
    await runCase(results, "profiles task_details.results status-only terminal is rejected by the real observed-terminal consumer", () => assertTaskDetailsStatusOnlyRejected(apis));
    await runCase(results, "profiles statusless SingleResult with authentic exitCode and output remains accepted", () => assertSingleResultWithoutStatusAccepted(apis));
    await runCase(results, "review NativeRpcSession accepts a clean zero-code drain after valid settlement", () => assertCleanDrainAccepted(apis, root));
    await runCase(results, "review NativeRpcSession rejects leftover short JSON after valid settlement despite zero process exit", () => assertShortJsonRejects(apis, root));
    await runCase(results, "review NativeRpcSession rejects incomplete rpc_chunk after valid settlement despite zero process exit", () => assertIncompleteChunkRejects(apis, root));
    await runCase(results, "review NativeRpcSession rejects fatal parser state after valid settlement despite zero process exit", () => assertFatalParserStateRejects(apis, root));

    const failures = results.filter((result) => result.status === "FAIL");
    const summary = {
      probe: "round2-observer-boundary-red",
      task: "T-011",
      phase: "RED",
      test_file: TEST_FILE,
      acceptance_criteria: ["AC-016", "AC-013"],
      criteria_to_tests: {
        "AC-016": results.map((result) => `${TEST_FILE}::${result.name}`),
        "AC-013": results
          .filter((result) => result.name.startsWith("profiles "))
          .map((result) => `${TEST_FILE}::${result.name}`),
      },
      dependency: "T-009B / AC-013 terminal-consumer compatibility is exercised only through the real profiles observed-terminal consumer; this probe does not alter deep-review protocol code.",
      record_entry_paths: {
        native_progress_replay: "nativeProgressTerminalRecord(payload) -> nativeEvidence.native_progress_terminal[] -> requireObservedTerminalRecord",
        task_details_results: "addTaskDetails(evidence, AgentToolResult.details) -> evidence.task_details[].details.results[] -> terminalRecords/hasTaskTerminalPayload -> requireObservedTerminalRecord",
      },
      source_bindings: apis.sourceBindings,
      cases: results,
      assertion_failure_count: failures.filter((result) => result.failure_kind === "ASSERTION").length,
      unexpected_failure_count: failures.filter((result) => result.failure_kind === "UNEXPECTED").length,
      false_positive_controls: [
        "All NativeRpcSession close negatives use a process-shaped fixture whose observed process exit code is exactly zero; no arbitrary nonzero child status is accepted as proof.",
        "The clean-drain positive has prompt_result completed, agentInvoked true, session_settled true, empty rawBuffer, no chunk, and no fatal parser state.",
        "Progress status is never treated as a numeric exit. OMP18.18.6 AgentProgress completed is a successful channel terminal; SingleResult requires an observed numeric zero.",
        "A statusless SingleResult remains accepted only when the real task_details.results producer preserves numeric exitCode and real output; progress/status-only terminals do not receive that exemption.",
      ],
      expected_consumer_behavior: "AgentProgress completed retains an unknown numeric exit and uses the pinned SDK status contract; invalid exit metadata, failed or missing status still block. Owning Root END/dispatch authority is independently required by profile consumers. SingleResult requires authentic numeric exitCode and output. NativeRpcSession.close requires a fully drained zero-code process without leftover rawBuffer, incomplete rpc_chunk, or fatal parser state.",
      commands_not_run: [`node ${TEST_FILE}`],
      documentation_impact: "none",
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    assert.equal(failures.length, 0, `round2 observer boundary probe failed ${failures.length} case(s): ${JSON.stringify(failures)}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

await main();
