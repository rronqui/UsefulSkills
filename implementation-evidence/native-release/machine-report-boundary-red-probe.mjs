#!/usr/bin/env node
// Disposable source-only RED probe for T-011 / AC-016 and T-008 / AC-009.
//
// This probe never starts OMP/SDK, uses no network, and never mutates the
// checkout or a captured fixture. It creates a fresh private fixture, copies
// the current fs-transaction source byte-for-byte, loads lifecycle through a
// temporary export-only seam, and runs only the generated private helper and
// validator programs. The renderer model is the pinned OMP 18.18.6 contract:
// OutputSink applies a 768 UTF-8-byte per-line cap and appends a single UTF-8
// ellipsis while dropping the remainder of that line. Native Bash text itself
// is not retained or claimed as observed here. AC-009 consumes an explicitly
// supplied current Native alignment capture through the same private seam.

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const DEFAULT_SOURCE = path.join(SOURCE_DIR, "lifecycle.mjs");
const DEFAULT_RETRY_SOURCE = path.join(SOURCE_DIR, "technical-retry-scenario.mjs");
const DEFAULT_TRANSACTION_SOURCE = path.resolve(SOURCE_DIR, "../../tdd-orchestrator/lib/fs-transaction/index.mjs");
const DEFAULT_ROOT = path.join(os.tmpdir(), "usefulskills-machine-report-boundary-red");
const MAX_COLUMNS = 768;
const SHA256 = /^[a-f0-9]{64}$/i;
const HELPER_FAILURE_EXIT = 2;
const RETRY_FAILURE_EXIT = 17;
const ROOT_ARGUMENT_KEY_LIMIT = 32;
const ROOT_ARGUMENT_KEY_MAX_BYTES = 64;
const SAFE_ARGUMENT_TYPES = new Set(["array", "boolean", "null", "number", "object", "string", "undefined"]);
const CURRENT_ALIGNMENT_CAPTURE_SHA256 = "dc27b25c1c45a447f36be9007825afa295f71527a22768172d5b4e0a2a139e93";
const CURRENT_ALIGNMENT_RUN_ID = "720cf604-e199-4f49-a432-9fac3b480198";
const CURRENT_ALIGNMENT_MANIFEST_SHA256 = "0d40b8a19c35681a7f05c17d76f022e95249624a86d3d55a5371cf27157fb3c9";
const CURRENT_ALIGNMENT_SOURCE = Object.freeze([
  Object.freeze({ path: "alignment/SKILL.md", bytes: 14090, sha256: "bf2b2dd4d10d8635b4ad746ffc462b6bbe7962fe90d5294e3dabc0249b820f18" }),
  Object.freeze({ path: "alignment/agents/requirements-reader.md", bytes: 3156, sha256: "4c59206dcdb8d4043d26621de713bb440e87221b1c6a5b3ad833c0831b3a6a82" }),
  Object.freeze({ path: "alignment/references/comprehension-review.md", bytes: 1810, sha256: "ef9d9eaae580db6242ab4b4ed27facadb270689c7487c284343499264805b4e2" }),
  Object.freeze({ path: "alignment/references/domain-modeling.md", bytes: 1880, sha256: "9c893bf140912cd4c8bcad0873ca4d59f9dfabda74c896fc3eb9328dfd08c39b" }),
  Object.freeze({ path: "alignment/references/routing-and-persistence.md", bytes: 7079, sha256: "46a9121501f1b00f6f08e0aa722f783789a9d3fcc5b572ee66cb8428943dabf5" }),
  Object.freeze({ path: "alignment/references/writing-for-agents.md", bytes: 2168, sha256: "1241ce58bd8d6b63015ec16855ae40e77384b4428232853882ace54b00c82b24" }),
]);
const CURRENT_ALIGNMENT_SCENARIO_LABELS = Object.freeze([
  "GREEN-local",
  "GREEN-short",
  "GREEN-full",
  "GREEN-blocked",
  "GREEN-resume-A-initial",
  "GREEN-resume-B-initial",
  "GREEN-resume-A",
  "GREEN-resume-B",
  "GREEN-collision",
]);
const CURRENT_ALIGNMENT_CHECKPOINTS = Object.freeze({
  resume_a_parent: "GREEN-resume-A-initial",
  resume_a_successor: "GREEN-resume-A",
  resume_b_parent: "GREEN-resume-B-initial",
  resume_b_successor: "GREEN-resume-B",
});
const LEGACY_ALIGNMENT_BINDING_PROOF = path.resolve(SOURCE_DIR, "../../.omp/state/release-47/proofs/native-source-pipeline-uri-binding-final.json");


class ProbeSetupError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProbeSetupError";
    this.kind = "BLOCKED";
    Object.assign(this, details);
  }
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function safeError(error) {
  return {
    name: error?.name ?? "Error",
    kind: error?.kind ?? null,
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };
}

function validateSha(value, label) {
  if (value === null || value === undefined) return null;
  if (!SHA256.test(String(value))) throw new ProbeSetupError(`${label} must be a SHA-256 hex digest`);
  return String(value).toLowerCase();
}

function parseArgs(argv) {
  const allowed = new Set([
    "source",
    "retry-source",
    "transaction-source",
    "snapshot",
    "manifest",
    "alignment-capture",
    "root",
    "expected-source-sha",
    "expected-retry-sha",
    "expected-transaction-sha",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new ProbeSetupError(`unexpected argument ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new ProbeSetupError(`unknown option --${key}`);
    if (values.has(key)) throw new ProbeSetupError(`duplicate option --${key}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new ProbeSetupError(`option --${key} requires a value`);
    values.set(key, next);
    index += 1;
  }
  for (const key of ["snapshot", "manifest", "alignment-capture"]) {
    if (!values.has(key)) throw new ProbeSetupError(`--${key} is required for the private RED consumer`);
  }
  const source = path.resolve(values.get("source") ?? DEFAULT_SOURCE);
  return {
    source,
    alignmentSourceRoot: path.resolve(path.dirname(source), "../.."),
    retrySource: path.resolve(values.get("retry-source") ?? DEFAULT_RETRY_SOURCE),
    transactionSource: path.resolve(values.get("transaction-source") ?? DEFAULT_TRANSACTION_SOURCE),
    snapshot: path.resolve(values.get("snapshot")),
    manifest: path.resolve(values.get("manifest")),
    alignmentCapture: path.resolve(values.get("alignment-capture")),
    root: path.resolve(values.get("root") ?? DEFAULT_ROOT),
    expectedSourceSha: validateSha(values.get("expected-source-sha"), "--expected-source-sha"),
    expectedRetrySha: validateSha(values.get("expected-retry-sha"), "--expected-retry-sha"),
    expectedTransactionSha: validateSha(values.get("expected-transaction-sha"), "--expected-transaction-sha"),
  };
}

function assertRegularFile(file, label) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    throw new ProbeSetupError(`${label} is not readable`, { cause: safeError(error) });
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new ProbeSetupError(`${label} must be a private regular single-link file`);
  }
  return stat;
}

function copyExact(source, destination, label) {
  assertRegularFile(source, `${label} source`);
  const bytes = fs.readFileSync(source);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    fs.writeFileSync(destination, bytes, { flag: "wx" });
  } catch (error) {
    throw new ProbeSetupError(`${label} destination was not fresh`, { cause: safeError(error) });
  }
  const copied = fs.readFileSync(destination);
  if (!copied.equals(bytes)) throw new ProbeSetupError(`${label} was not copied byte-for-byte`);
  return { path: path.resolve(destination), bytes: copied.length, sha256: sha256Bytes(copied) };
}

function writeFresh(file, content, label) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, content, { flag: "wx" });
  } catch (error) {
    throw new ProbeSetupError(`${label} was not written to a fresh path`, { cause: safeError(error) });
  }
  return file;
}

function truncateHeadUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  let end = Math.max(0, maxBytes);
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}

// Source-derived reproduction of the pinned OutputSink column-cap contract.
// It is intentionally not labeled as actual Native Bash output.
function renderOutputSinkColumns(text, maxColumns = MAX_COLUMNS) {
  const parts = [];
  let cursor = 0;
  let lineBytes = 0;
  let ellipsisAdded = false;
  while (cursor < text.length) {
    const newline = text.indexOf("\n", cursor);
    const end = newline === -1 ? text.length : newline;
    const segment = text.slice(cursor, end);
    if (segment.length > 0) {
      if (ellipsisAdded) {
        // Pinned OutputSink drops bytes until the next newline.
      } else {
        const segmentBytes = Buffer.byteLength(segment, "utf8");
        const remaining = maxColumns - lineBytes;
        if (segmentBytes <= remaining) {
          parts.push(segment);
          lineBytes += segmentBytes;
        } else {
          const headRoom = Math.max(0, remaining - 3);
          const kept = headRoom > 0 ? truncateHeadUtf8(segment, headRoom) : "";
          parts.push(kept, "…");
          lineBytes += Buffer.byteLength(kept, "utf8") + 3;
          ellipsisAdded = true;
        }
      }
    }
    if (newline === -1) break;
    parts.push("\n");
    cursor = newline + 1;
    lineBytes = 0;
    ellipsisAdded = false;
  }
  return parts.join("");
}

function commandEvent(text, exitCode) {
  return {
    type: "tool_execution_end",
    toolName: "bash",
    isError: exitCode !== 0,
    result: {
      content: [{ type: "text", text }],
      details: exitCode === 0
        ? { wallTimeNoticeEmitted: true, timeoutDisabled: true, wallTimeMs: 10 }
        : { exitCode },
    },
  };
}

function footerFor(exitCode) {
  return exitCode === 0
    ? "\n\nWall time: 0.01 seconds"
    : `\n\nCommand exited with code ${exitCode}`;
}

function producerBody(raw, label) {
  const normalized = String(raw ?? "").replaceAll("\r\n", "\n").trim();
  if (!normalized) throw new ProbeSetupError(`${label} produced no stdout JSON`);
  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new ProbeSetupError(`${label} did not produce one JSON document`, { cause: safeError(error) });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ProbeSetupError(`${label} produced a non-object JSON document`);
  return { raw: normalized, parsed };
}


function commandReport(apis, producer, exitCode, label) {
  const rendered = renderOutputSinkColumns(`${producer.raw}${footerFor(exitCode)}`, MAX_COLUMNS);
  const report = apis.commandReport(commandEvent(rendered, exitCode));
  assert.ok(report && typeof report === "object" && !Array.isArray(report), `${label} machine JSON must survive nativeBash footer stripping and the pinned 768-byte renderer`);
  return { report, rendered };
}

function assertIdentity(report, expected, label) {
  for (const key of ["nonce", "assignment_id", "revision", "run_id"]) {
    assert.equal(report[key], expected[key], `${label} must preserve report.${key}`);
  }
  assert.deepEqual(report.workload, expected.workload, `${label} must preserve the workload binding`);
}
function assertBoundedReport(report, source, keys, label) {
  assert.deepEqual(Object.keys(report).sort(), [...keys].sort(), `${label} must retain the commandReport bounded schema without inventing or dropping its contract fields`);
  for (const key of keys) {
    assert.equal(canonical(report[key]), canonical(source[key]), `${label} must preserve report.${key}`);
  }
}
function makeRootCommandSession(lifecycle, policy, label) {
  return new lifecycle.NativeRpcSession({
    omp: "offline-machine-report-boundary",
    cwd: policy.cwd,
    timeoutMs: 30_000,
    assignments: [],
    logicalRunId: `machine-report-${label}`,
    label,
    rootWritePolicy: {
      tool: "write",
      paths: [policy.intent.path],
      rootCommandPolicy: policy,
    },
  });
}

function rejectRootCommandArguments(lifecycle, policy, args, toolCallId, label) {
  const session = makeRootCommandSession(lifecycle, policy, label);
  let error = null;
  try {
    session.consumeLogical({
      type: "tool_execution_start",
      toolName: "bash",
      toolCallId,
      arguments: args,
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `${label} must reject the Root Bash frame`);
  assert.equal(error.kind, "BLOCKED", `${label} must fail closed as BLOCKED`);
  const observation = lifecycle.failedNativeObservation(session, error);
  assert.ok(observation && typeof observation === "object", `${label} must project through failedNativeObservation`);
  return { error, observation, session };
}

function assertRootArgumentGuard(observation, {
  expectedKeyCount,
  expectedKeys = null,
  expectedTypes = null,
  toolCallId,
  label,
}) {
  const guard = observation?.failure?.operational_guard;
  assert.ok(guard && typeof guard === "object" && !Array.isArray(guard), `${label} must retain a structured operational guard`);
  assert.equal(guard.reason_code, "ROOT_HELPER_ARGUMENTS_NOT_APPROVED", `${label} must identify the rejected Root helper argument shape`);
  assert.equal(guard.tool, "bash", `${label} must identify the guarded tool`);
  assert.equal(guard.tool_call_id, toolCallId, `${label} must retain the full Root tool-call identity`);
  assert.equal(typeof guard.command_match, "boolean", `${label} must expose command_match as a boolean`);
  assert.equal(guard.command_match, true, `${label} must distinguish an exact command from an unapproved argument shape`);
  assert.ok(Number.isSafeInteger(guard.host_arrival_ordinal) && guard.host_arrival_ordinal > 0, `${label} must retain a positive observed host-arrival ordinal`);
  assert.ok(Number.isSafeInteger(guard.host_workflow_ordinal) && guard.host_workflow_ordinal > 0, `${label} must retain a positive observed workflow ordinal`);
  assert.ok(Array.isArray(guard.extra_argument_keys), `${label} must retain bounded extra argument key names`);
  assert.ok(guard.extra_argument_keys.length <= ROOT_ARGUMENT_KEY_LIMIT, `${label} must bound retained extra argument key names`);
  assert.equal(guard.extra_argument_key_count, expectedKeyCount, `${label} must retain the total extra argument key count`);
  assert.equal(typeof guard.extra_argument_keys_truncated, "boolean", `${label} must make key-name truncation explicit`);
  assert.equal(guard.extra_argument_keys_truncated, false, `${label} must not report truncation for this bounded counterexample`);
  assert.equal(guard.extra_argument_keys.length, expectedKeyCount, `${label} must retain every key name for this bounded counterexample`);
  for (const key of guard.extra_argument_keys) {
    assert.equal(typeof key, "string", `${label} must retain key names as strings`);
    assert.ok(Buffer.byteLength(key, "utf8") <= ROOT_ARGUMENT_KEY_MAX_BYTES, `${label} must bound each retained key name`);
    assert.match(key, /^(?:<redacted-key>|[A-Za-z][A-Za-z0-9_.-]{0,63})$/, `${label} must retain only a bounded safe key-name shape`);
  }
  if (expectedKeys) assert.deepEqual([...guard.extra_argument_keys].sort(), [...expectedKeys].sort(), `${label} must identify the representative extra controls`);
  assert.equal(guard.extra_argument_values_omitted, true, `${label} must omit unbounded extra argument values`);
  assert.ok(guard.argument_types && typeof guard.argument_types === "object" && !Array.isArray(guard.argument_types), `${label} must retain typed argument-shape metadata`);
  const typeEntries = Object.entries(guard.argument_types);
  assert.equal(typeEntries.length, expectedKeyCount, `${label} must retain one bounded type entry per extra argument`);
  for (const [key, type] of typeEntries) {
    assert.ok(Buffer.byteLength(key, "utf8") <= ROOT_ARGUMENT_KEY_MAX_BYTES, `${label} must bound typed argument key names`);
    assert.match(key, /^(?:<redacted-key>|[A-Za-z][A-Za-z0-9_.-]{0,63})$/, `${label} must redact or bound typed argument key names`);
    assert.ok(SAFE_ARGUMENT_TYPES.has(type), `${label} must use a known safe argument type shape`);
  }
  if (expectedTypes) {
    for (const [key, type] of Object.entries(expectedTypes)) assert.equal(guard.argument_types[key], type, `${label} must preserve the safe type for ${key}`);
  }
  return guard;
}

function assertRejectedRootCommandHasNoAdmissionOrSideEffect(observation, session, alignment, before, label) {
  assert.equal(observation.status, "PENDING", `${label} must remain pending after the failed Native observation`);
  assert.equal(observation.root_command_results.length, 0, `${label} must not retain an admitted Root helper command`);
  assert.equal(session.evidence.root_command_results.length, 0, `${label} must not record a Root helper command START`);
  assert.equal(session.evidence.root_writes.length, 0, `${label} must not admit a Root write`);
  assert.equal(sha256File(alignment.policy.intentPath), before.intent, `${label} must not mutate the protected intent fixture`);
  assert.equal(sha256File(alignment.result.path), before.checkpoint, `${label} must not mutate the protected checkpoint fixture`);
}
function captureBlockedRead(operation, label) {
  let error = null;
  try {
    operation();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `${label} must reject the unsupported read frame`);
  assert.equal(error.kind, "BLOCKED", `${label} must remain a BLOCKED read guard`);
  return error;
}

function makeReadSession(lifecycle, root, label, assignments = []) {
  const session = new lifecycle.NativeRpcSession({
    omp: "offline-machine-report-boundary",
    cwd: root,
    timeoutMs: 30_000,
    assignments,
    logicalRunId: `machine-report-read-${label}`,
    label: `machine-report-read-${label}`,
  });
  const stateRequestId = `state-read-${label}`;
  session.bindSourceHost(
    {
      type: "response",
      command: "get_state",
      success: true,
      id: stateRequestId,
      data: { sessionId: `root-session-read-${label}` },
    },
    stateRequestId,
    `prompt-read-${label}`,
  );
  return session;
}

function unsupportedResourceUri(scheme, label) {
  return `${scheme}://unbound-resource.invalid/private/${label}/rejected-path?query=rejected-query-${label}&token=rejected-token-${label}`;
}

function assertUnsupportedReadDiagnostic(observation, {
  label,
  scope,
  scheme,
  toolCallId,
  uri,
}) {
  assert.equal(observation.status, "PENDING", `${label} must remain pending after the rejected read`);
  assert.equal(observation.failure?.kind, "BLOCKED", `${label} failure must remain BLOCKED`);
  const guard = observation.failure?.operational_guard;
  assert.ok(guard && typeof guard === "object" && !Array.isArray(guard), `${label} must retain a structured read rejection diagnostic`);
  assert.ok(Object.keys(guard).length <= 16, `${label} diagnostic must retain a bounded number of fields`);
  assert.ok(Buffer.byteLength(JSON.stringify(guard), "utf8") <= 2048, `${label} diagnostic must remain bounded in serialized size`);
  assert.equal(guard.tool, "read", `${label} diagnostic must identify the read tool`);
  assert.equal(typeof guard.reason_code, "string", `${label} diagnostic must retain a typed reason code`);
  assert.match(guard.reason_code, /^READ_[A-Z0-9_]*URI(?:_[A-Z0-9_]+)*$/, `${label} diagnostic reason must identify the rejected resource URI`);
  assert.equal(guard.scheme, scheme, `${label} diagnostic must retain only the URI scheme`);
  assert.equal(guard.scope, scope, `${label} diagnostic must retain the actual observer scope`);
  assert.equal(guard.tool_call_id, toolCallId, `${label} diagnostic must retain the full actual read tool-call identity`);
  assert.ok(Number.isSafeInteger(guard.host_arrival_ordinal) && guard.host_arrival_ordinal > 0, `${label} diagnostic must retain a positive host-arrival ordinal`);
  assert.ok(Number.isSafeInteger(guard.host_workflow_ordinal) && guard.host_workflow_ordinal > 0, `${label} diagnostic must retain a positive host-workflow ordinal`);
  assert.match(guard.rejected_uri_sha256 ?? "", SHA256, `${label} diagnostic must retain a bounded digest of the rejected URI`);
  assert.equal(guard.rejected_uri_sha256, sha256Bytes(Buffer.from(uri, "utf8")), `${label} diagnostic URI digest must describe the actual rejected URI`);
  assert.ok(Number.isSafeInteger(guard.rejected_uri_bytes) && guard.rejected_uri_bytes >= 0, `${label} diagnostic must retain a typed rejected URI byte count`);
  assert.equal(guard.rejected_uri_bytes, Buffer.byteLength(uri, "utf8"), `${label} diagnostic must retain the rejected URI byte count`);
  assert.ok(Buffer.byteLength(guard.reason_code, "utf8") <= 128, `${label} reason code must stay bounded`);
  assert.ok(Buffer.byteLength(guard.scope, "utf8") <= 256, `${label} scope must stay bounded`);
  assert.ok(Buffer.byteLength(guard.tool_call_id, "utf8") <= 256, `${label} tool-call identity must stay bounded without truncation`);
  const diagnosticJson = JSON.stringify(observation);
  for (const forbidden of [
    uri,
    `unbound-resource.invalid/private/${label}`,
    `rejected-path?query=rejected-query-${label}`,
    `rejected-token-${label}`,
  ]) {
    assert.equal(diagnosticJson.includes(forbidden), false, `${label} failed observation must omit raw URI/path/query/token values`);
  }
  return guard;
}
function assertNoReadCorrelation(session, label) {
  assert.ok(
    session.readCalls === undefined || session.readCalls instanceof Map,
    `${label} read correlation state must be absent or a real Map`,
  );
  if (session.readCalls !== undefined) assert.equal(session.readCalls.size, 0, `${label} must not retain a read correlation`);
}

function rootReadAliasesRejectUnsupportedResourceUris(lifecycle, root) {
  for (const toolName of ["read.foo", "read_foo", "read:foo"]) {
    const label = `root-alias-${toolName.replace(/[.:]/g, "-")}`;
    const session = makeReadSession(lifecycle, root, label);
    const uri = unsupportedResourceUri("artifact", label);
    const toolCallId = `read-alias|native-boundary|root|${toolName}|full-call-identity`;
    const error = captureBlockedRead(
      () => session.consumeLogical({
        type: "tool_execution_start",
        toolName,
        toolCallId,
        args: { path: uri },
      }),
      `Root ${toolName} URI`,
    );
    const observation = lifecycle.failedNativeObservation(session, error);
    assertUnsupportedReadDiagnostic(observation, {
      label: `Root ${toolName} URI`,
      scope: "Root",
      scheme: "artifact",
      toolCallId,
      uri,
    });
    assertNoReadCorrelation(session, `Root ${toolName} URI`);
    assert.equal(
      session.evidence.tool_events.filter((event) => event.tool === toolName).length,
      0,
      `Root ${toolName} URI must not be admitted under an allowlist alias`,
    );
    assert.equal(session.evidence.subagent_reads.length, 0, `Root ${toolName} URI must not create child read permission`);
  }
}

function childReadAliasesRejectUnsupportedResourceUris(lifecycle, root) {
  for (const toolName of ["read.foo", "read_foo", "read:foo"]) {
    const label = `child-alias-${toolName.replace(/[.:]/g, "-")}`;
    const { session, childId, item } = makeAuthorizedChildReadSession(lifecycle, root, label);
    const uri = unsupportedResourceUri("artifact", label);
    const toolCallId = `read-alias|native-boundary|child|${toolName}|full-call-identity`;
    const error = captureBlockedRead(
      () => session.consumeLogical({
        type: "subagent_event",
        payload: {
          id: childId,
          agent: item.agent,
          agentSource: "project",
          event: {
            type: "tool_execution_start",
            toolName,
            toolCallId,
            args: { path: uri },
          },
        },
      }),
      `authorized child ${toolName} URI`,
    );
    const observation = lifecycle.failedNativeObservation(session, error);
    assertUnsupportedReadDiagnostic(observation, {
      label: `authorized child ${toolName} URI`,
      scope: childId,
      scheme: "artifact",
      toolCallId,
      uri,
    });
    assertNoReadCorrelation(session, `authorized child ${toolName} URI`);
    assert.equal(session.evidence.subagent_reads.length, 0, `authorized child ${toolName} URI must not grant child read permission`);
    assert.equal(
      observation.subagent_frames.filter((frame) => frame.tool_call_id === toolCallId).length,
      0,
      `authorized child ${toolName} URI must not admit an allowlist-alias read frame`,
    );
  }
}



function rootUnsupportedResourceUrisRemainBlockedWithBoundedDiagnostics(lifecycle, root) {
  for (const scheme of ["artifact", "file", "http", "xd"]) {
    const label = `root-${scheme}`;
    const session = makeReadSession(lifecycle, root, label);
    const uri = unsupportedResourceUri(scheme, label);
    const toolCallId = `read|native-boundary|root|${scheme}|full-call-identity`;
    const error = captureBlockedRead(
      () => session.consumeLogical({
        type: "tool_execution_start",
        toolName: "read",
        toolCallId,
        args: { path: uri },
      }),
      `Root ${scheme} URI`,
    );
    const observation = lifecycle.failedNativeObservation(session, error);
    assertUnsupportedReadDiagnostic(observation, {
      label: `Root ${scheme} URI`,
      scope: "Root",
      scheme,
      toolCallId,
      uri,
    });
    assertNoReadCorrelation(session, `Root ${scheme} URI`);
    assert.equal(observation.tool_events.filter((event) => event.tool === "read").length, 0, `Root ${scheme} URI must not be admitted as a tool event`);
    assert.equal(session.evidence.subagent_reads.length, 0, `Root ${scheme} URI must not create child read permission`);
  }
}

function makeAuthorizedChildReadSession(lifecycle, root, label) {
  const item = {
    name: `NativeBoundaryChild.${label}`,
    agent: "validator",
    task: "Read-only source-derived rejected URI diagnostic.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const childId = `child|native-boundary|${label}|allocated`;
  const rootToolCallId = `task|native-boundary|${label}|full-root-call`;
  const rootJobId = `job|native-boundary|${label}|root`;
  const session = makeReadSession(lifecycle, root, label, [item]);
  session.recordTool({
    type: "tool_execution_start",
    toolName: "task",
    toolCallId: rootToolCallId,
    args: {
      context: "Bounded source-derived child read rejection probe.",
      tasks: [item],
    },
  });
  session.recordTool({
    type: "tool_execution_end",
    toolName: "task",
    toolCallId: rootToolCallId,
    isError: false,
    result: {
      details: {
        results: [],
        progress: [{
          id: childId,
          index: 0,
          agent: item.agent,
          agentSource: "project",
          task: `Rendered prompt for ${item.name}.`,
          assignment: item.task,
        }],
        async: { state: "running", jobId: rootJobId, type: "task" },
      },
    },
  });
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  return { session, childId, item };
}

function childUnsupportedResourceUriRemainsBlockedWithBoundedDiagnostics(lifecycle, root) {
  const label = "child-artifact";
  const { session, childId, item } = makeAuthorizedChildReadSession(lifecycle, root, label);
  const scheme = "artifact";
  const uri = unsupportedResourceUri(scheme, label);
  const toolCallId = "read|native-boundary|child|artifact|full-call-identity";
  const error = captureBlockedRead(
    () => session.consumeLogical({
      type: "subagent_event",
      payload: {
        id: childId,
        agent: item.agent,
        agentSource: "project",
        event: {
          type: "tool_execution_start",
          toolName: "read",
          toolCallId,
          args: { path: uri },
        },
      },
    }),
    "authorized child artifact URI",
  );
  const observation = lifecycle.failedNativeObservation(session, error);
  assertUnsupportedReadDiagnostic(observation, {
    label: "authorized child artifact URI",
    scope: childId,
    scheme,
    toolCallId,
    uri,
  });
  assertNoReadCorrelation(session, "authorized child artifact URI");
  assert.equal(session.evidence.subagent_reads.length, 0, "authorized child artifact URI must not grant child read permission");
  assert.equal(
    observation.subagent_frames.filter((frame) => frame.tool_call_id === toolCallId).length,
    0,
    "authorized child artifact URI must not admit a rejected read frame",
  );
  assert.equal(
    observation.tool_events.filter((event) => event.tool === "read").length,
    0,
    "authorized child artifact URI must not fabricate a Root read event",
  );
}
function captureBlockedTool(operation, label) {
  let error = null;
  try {
    operation();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `${label} must fail closed`);
  assert.equal(error.kind, "BLOCKED", `${label} must remain BLOCKED`);
  return error;
}

function yieldPayload(label) {
  return {
    path: `.omp/state/native-yield/${label}/path-secret.txt`,
    command: `node .omp/state/native-yield/${label}/command-secret.mjs`,
    marker: `native-yield-marker-${label}`,
  };
}

function nestedChildToolEvent(childId, item, event) {
  return {
    type: "subagent_event",
    payload: {
      id: childId,
      agent: item.agent,
      agentSource: "project",
      event,
    },
  };
}

function yieldStart(toolCallId, payload, type) {
  return {
    type: "tool_execution_start",
    toolName: "yield",
    toolCallId,
    args: { type, data: payload },
  };
}

function yieldEnd(toolCallId, scenario) {
  return {
    type: "tool_execution_end",
    toolName: "yield",
    toolCallId,
    isError: scenario.isError,
    result: {
      content: [{ type: "text", text: scenario.isError ? "Task aborted: bounded failure" : "Result submitted." }],
      details: scenario.details,
    },
  };
}

function assertNoYieldPermissions(session, label) {
  assertNoReadCorrelation(session, label);
  assert.equal(session.evidence.subagent_reads.length, 0, `${label} yield must not grant read permission`);
  assert.equal(session.evidence.subagent_writes.length, 0, `${label} yield must not grant write permission`);
  assert.equal(session.evidence.command_results.length, 0, `${label} yield must not grant shell permission`);
  assert.equal(session.evidence.native_progress_terminal.length, 0, `${label} yield must not create a native terminal record`);
}

function assertYieldSecretsOmitted(value, payload, label) {
  const serialized = JSON.stringify(value);
  for (const secret of Object.values(payload)) {
    assert.equal(serialized.includes(secret), false, `${label} must not retain yield path/command payload values`);
  }
}

function assertBlockedYieldObservation(observation, session, payload, toolCallId, label) {
  assert.equal(observation.status, "PENDING", `${label} failed observation must remain pending`);
  assert.equal(observation.failure?.kind, "BLOCKED", `${label} must remain BLOCKED`);
  assertNoYieldPermissions(session, label);
  assertYieldSecretsOmitted(observation, payload, label);
  assert.equal(
    observation.subagent_frames.filter((frame) => frame.tool_call_id === toolCallId).length,
    0,
    `${label} must not admit the rejected yield frame`,
  );
}

function authorizedChildYieldIsControlMetadataOnly(lifecycle, root) {
  const scenarios = [
    {
      label: "incremental",
      type: ["progress"],
      isError: false,
      details: { status: "success", type: ["progress"] },
    },
    {
      label: "terminal",
      type: "result",
      isError: false,
      details: { status: "success", type: "result" },
    },
    {
      label: "failed-terminal",
      type: "result",
      isError: true,
      details: { status: "aborted", type: "result", error: "bounded yield failure" },
    },
  ];
  for (const scenario of scenarios) {
    const label = `child-yield-${scenario.label}`;
    const { session, childId, item } = makeAuthorizedChildReadSession(lifecycle, root, label);
    const payload = yieldPayload(label);
    const toolCallId = `yield|native-boundary|child|${scenario.label}|full-call-identity`;
    const start = nestedChildToolEvent(childId, item, yieldStart(toolCallId, payload, scenario.type));
    const end = nestedChildToolEvent(childId, item, yieldEnd(toolCallId, { ...scenario, details: { ...scenario.details, data: scenario.isError ? undefined : payload } }));
    assert.doesNotThrow(() => session.consumeLogical(start), `${label} START must be accepted as child control metadata`);
    assert.doesNotThrow(() => session.consumeLogical(end), `${label} END must be accepted as child control metadata`);
    const frames = session.evidence.subagent_frames.filter((frame) => frame.tool_call_id === toolCallId);
    assert.equal(frames.length, 2, `${label} must retain both yield lifecycle frames as bounded control metadata`);
    assert.deepEqual(frames.map((frame) => frame.type), ["tool_execution_start", "tool_execution_end"], `${label} must retain START before END`);
    assert.equal(frames[1].is_error, scenario.isError, `${label} END must preserve the actual isError signal`);
    assertNoYieldPermissions(session, label);
    assert.equal(
      session.evidence.task_records.filter((record) => record.allocated_id === childId).length,
      0,
      `${label} yield must not commit task completion or structured Native success`,
    );
    assertYieldSecretsOmitted(session.evidence, payload, label);
  }
}

function rootYieldAndAliasesRemainBlocked(lifecycle, root) {
  for (const toolName of ["yield", "yield.foo", "yield_foo", "yield:foo"]) {
    const label = `root-${toolName.replace(/[.:]/g, "-")}`;
    const session = makeReadSession(lifecycle, root, label);
    const payload = yieldPayload(label);
    const toolCallId = `yield|native-boundary|root|${toolName}|full-call-identity`;
    const error = captureBlockedTool(
      () => session.consumeLogical({
        type: "tool_execution_start",
        toolName,
        toolCallId,
        args: { type: "result", data: payload },
      }),
      `Root ${toolName}`,
    );
    const observation = lifecycle.failedNativeObservation(session, error);
    assertBlockedYieldObservation(observation, session, payload, toolCallId, `Root ${toolName}`);
  }
}

function unownedStaleAndAliasedChildYieldsRemainBlocked(lifecycle, root) {
  const unownedLabel = "child-yield-unowned";
  const unownedSession = makeReadSession(lifecycle, root, unownedLabel);
  const unownedItem = { agent: "validator" };
  const unownedPayload = yieldPayload(unownedLabel);
  const unownedToolCallId = "yield|native-boundary|unowned|full-call-identity";
  let error = captureBlockedTool(
    () => unownedSession.consumeLogical(nestedChildToolEvent(
      "child|native-boundary|unowned|allocated",
      unownedItem,
      yieldStart(unownedToolCallId, unownedPayload, "result"),
    )),
    "unowned child yield",
  );
  let observation = lifecycle.failedNativeObservation(unownedSession, error);
  assertBlockedYieldObservation(observation, unownedSession, unownedPayload, unownedToolCallId, "unowned child yield");

  const staleLabel = "child-yield-stale";
  const stale = makeAuthorizedChildReadSession(lifecycle, root, staleLabel);
  stale.session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: stale.childId,
      index: 0,
      agent: stale.item.agent,
      agentSource: "project",
      parentToolCallId: `task|native-boundary|${staleLabel}|full-root-call`,
      status: "completed",
    },
  });
  const stalePayload = yieldPayload(staleLabel);
  const staleToolCallId = "yield|native-boundary|stale|full-call-identity";
  error = captureBlockedTool(
    () => stale.session.consumeLogical(nestedChildToolEvent(
      stale.childId,
      stale.item,
      yieldStart(staleToolCallId, stalePayload, "result"),
    )),
    "stale child yield",
  );
  observation = lifecycle.failedNativeObservation(stale.session, error);
  assertBlockedYieldObservation(observation, stale.session, stalePayload, staleToolCallId, "stale child yield");

  for (const toolName of ["yield.foo", "yield_foo", "yield:foo"]) {
    const label = `child-${toolName.replace(/[.:]/g, "-")}`;
    const child = makeAuthorizedChildReadSession(lifecycle, root, label);
    const payload = yieldPayload(label);
    const toolCallId = `yield|native-boundary|child-alias|${toolName}|full-call-identity`;
    error = captureBlockedTool(
      () => child.session.consumeLogical(nestedChildToolEvent(
        child.childId,
        child.item,
        { ...yieldStart(toolCallId, payload, "result"), toolName },
      )),
      `authorized child ${toolName}`,
    );
    observation = lifecycle.failedNativeObservation(child.session, error);
    assertBlockedYieldObservation(observation, child.session, payload, toolCallId, `authorized child ${toolName}`);
  }
}
function rootTaskStartForYield(toolCallId, item) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId,
    args: {
      context: "Bounded source-derived yield lifecycle regression.",
      tasks: [item],
    },
  };
}

function rootTaskProgressForYield(toolCallId, item, childId) {
  return {
    type: "tool_execution_update",
    toolName: "task",
    toolCallId,
    partialResult: {
      details: {
        progress: [{
          id: childId,
          index: 0,
          agent: item.agent,
          agentSource: "project",
          task: `Rendered prompt for ${item.name}.`,
          assignment: item.task,
        }],
      },
    },
  };
}

function rootTaskSuccessEndForYield(toolCallId, item, childId) {
  return {
    type: "tool_execution_end",
    toolName: "task",
    toolCallId,
    isError: false,
    result: {
      details: {
        progress: [{
          id: childId,
          index: 0,
          agent: item.agent,
          agentSource: "project",
          task: `Rendered prompt for ${item.name}.`,
          assignment: item.task,
        }],
        results: [{
          id: childId,
          index: 0,
          agent: item.agent,
          agentSource: "project",
          status: "completed",
          exitCode: 0,
          isError: false,
          output: "bounded successful task output",
        }],
      },
    },
  };
}

function subagentProgressForYield(childId, item, rootToolCallId, status) {
  return {
    type: "subagent_progress",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      progress: {
        id: childId,
        index: 0,
        agent: item.agent,
        agentSource: "project",
        parentToolCallId: rootToolCallId,
        status,
        assignment: item.task,
      },
    },
  };
}
function subagentProgressTerminalForYield(childId, item, rootToolCallId, status, terminalFields = {}) {
  const event = subagentProgressForYield(childId, item, rootToolCallId, status);
  return {
    ...event,
    payload: {
      ...event.payload,
      progress: {
        ...event.payload.progress,
        ...terminalFields,
      },
    },
  };
}


function exactYieldEventAtIndex(childId, item, rootToolCallId, toolCallId, phase, payload, index, isError = false) {
  let event;
  if (phase === "start") {
    event = yieldStart(toolCallId, payload, ["progress"]);
  } else if (phase === "update") {
    event = {
      type: "tool_execution_update",
      toolName: "yield",
      toolCallId,
      args: { type: ["progress"], data: payload },
      partialResult: { type: ["progress"], data: payload },
    };
  } else if (phase === "end") {
    event = yieldEnd(toolCallId, isError
      ? { isError: true, details: { status: "failed", type: "result", error: "bounded yield failure" } }
      : { isError: false, details: { status: "success", type: "result", data: payload } });
  } else {
    throw new Error(`unsupported exact yield phase ${phase}`);
  }
  return nestedChildToolEvent(childId, item, {
    ...event,
    parentToolCallId: rootToolCallId,
    index,
    agent: item.agent,
    agentSource: "project",
  });
}

function exactYieldEvent(childId, item, rootToolCallId, toolCallId, phase, payload, isError = false) {
  return exactYieldEventAtIndex(childId, item, rootToolCallId, toolCallId, phase, payload, 0, isError);
}

function makeAuthoritativeProgressChildSession(lifecycle, root, label, status = "running") {
  const item = {
    name: `NativeBoundaryProgressChild.${label}`,
    agent: "validator",
    task: "Submit only the bounded exact yield control result.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const childId = `child|native-boundary|${label}|progress-allocated`;
  const rootToolCallId = `task|native-boundary|${label}|full-root-call`;
  const session = makeReadSession(lifecycle, root, label, [item]);
  session.recordTool(rootTaskStartForYield(rootToolCallId, item));
  session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId));
  assert.equal(session.lifecycleByAllocated.has(`id:${childId}`), false, `${label} must have no child binding before the first accepted subagent_progress`);
  session.consumeLogical(subagentProgressForYield(childId, item, rootToolCallId, status));
  const binding = session.lifecycleByAllocated.get(`id:${childId}`);
  assert.ok(binding, `${label} must be accepted from the observed Root progress tuple`);
  assert.equal(binding.accepted, true, `${label} must be an authoritative accepted child binding`);
  assert.equal(binding.lifecycle_status, status, `${label} must preserve the first accepted subagent_progress lifecycle status`);
  assert.equal(binding.parent_tool_call_id, rootToolCallId, `${label} must preserve the actual Root parent tuple`);
  assert.equal(binding.index, 0, `${label} must preserve the actual Root index tuple`);
  assert.equal(binding.agent, item.agent, `${label} must preserve the actual child role tuple`);
  assert.equal(binding.agentSource, "project", `${label} must preserve the actual child source tuple`);
  return { session, item, childId, rootToolCallId, binding };
}

function assertYieldControlOnly(session, payload, toolCallIds, expectedPhases, label) {
  const frames = session.evidence.subagent_frames.filter((frame) => toolCallIds.includes(frame.tool_call_id));
  assert.deepEqual(frames.map((frame) => frame.tool_call_id), toolCallIds, `${label} must retain exact yield call identities in arrival order`);
  assert.deepEqual(frames.map((frame) => frame.control?.phase), expectedPhases, `${label} must retain START/UPDATE/END as control phases`);
  assert.equal(frames.every((frame) => frame.control?.kind === "yield"), true, `${label} must classify every admitted yield frame as control metadata`);
  for (const frame of frames) {
    for (const key of ["paths", "requested_paths"]) {
      if (Object.hasOwn(frame, key)) {
        assert.ok(Array.isArray(frame[key]), `${label} yield ${key} metadata must remain an array`);
        assert.equal(frame[key].length, 0, `${label} yield ${key} metadata must remain empty`);
      }
    }
    for (const key of ["command", "command_label", "report", "observed", "data", "content"]) {
      assert.equal(Object.hasOwn(frame, key), false, `${label} yield frame must not expose a ${key} payload marker`);
    }
  }
  assert.equal(session.evidence.subagent_reads.length, 0, `${label} yield must not grant read permission`);
  assert.equal(session.evidence.subagent_writes.length, 0, `${label} yield must not grant write permission`);
  assert.equal(session.evidence.command_results.length, 0, `${label} yield must not grant shell permission`);
  assert.equal(session.evidence.native_progress_terminal.length, 0, `${label} yield must not create a Native progress terminal`);
  assert.equal(session.evidence.task_records.length, 0, `${label} yield must not commit a Native task completion`);
  assert.equal(session.yieldCalls.size, 0, `${label} completed yield controls must not remain pending`);
  assertYieldSecretsOmitted(session.evidence, payload, label);
}

function assertYieldNotGranted(session, toolCallId, label, accepted = false, allocatedId = null) {
  assert.equal(session.yieldCalls.size, 0, `${label} must not retain a yield correlation after rejection`);
  assert.equal(session.evidence.subagent_frames.filter((frame) => frame.tool_call_id === toolCallId).length, 0, `${label} must not admit a rejected yield frame`);
  assert.equal(session.evidence.subagent_reads.length, 0, `${label} must not grant read permission`);
  assert.equal(session.evidence.subagent_writes.length, 0, `${label} must not grant write permission`);
  assert.equal(session.evidence.command_results.length, 0, `${label} must not grant shell permission`);
  assert.equal(session.evidence.native_progress_terminal.length, 0, `${label} must not create a Native progress terminal`);
  assert.equal(session.evidence.task_records.length, 0, `${label} must not commit a Native task completion`);
  if (!accepted && allocatedId) assert.equal(session.lifecycleByAllocated.has(`id:${allocatedId}`), false, `${label} must not acquire an accepted lifecycle binding`);
}
function assertYieldNotResurrectedAfterTerminal(session, toolCallId, label) {
  assert.equal(session.yieldCalls.size, 0, `${label} must not retain a resurrected yield correlation`);
  assert.equal(session.evidence.subagent_frames.filter((frame) => frame.tool_call_id === toolCallId).length, 0, `${label} must not capture a resurrected yield frame`);
  assertNoReadCorrelation(session, label);
  assert.equal(session.evidence.subagent_reads.length, 0, `${label} must not grant read permission`);
  assert.equal(session.evidence.subagent_writes.length, 0, `${label} must not grant write permission`);
  assert.equal(session.evidence.command_results.length, 0, `${label} must not grant shell permission`);
}

function terminalProgressTransitionRemainsLatched(lifecycle, root, nextStatus) {
  const label = `terminal-latch-${nextStatus}`;
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, label, "running");
  const failedEvent = subagentProgressTerminalForYield(child.childId, child.item, child.rootToolCallId, "failed", {
    isError: true,
    error: "bounded child failure",
    result: { status: "failed", isError: true, error: "bounded child failure" },
  });
  child.session.consumeLogical(failedEvent);
  assert.equal(child.binding.progress_status, "failed", `${label} must retain the first terminal failure status`);
  const terminalFrames = child.session.evidence.subagent_frames.length;
  const terminalRecords = child.session.evidence.native_progress_terminal.length;
  const toolCallId = `yield|native-boundary|${label}|full-call-identity`;
  const yieldError = captureBlockedTool(
    () => child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "start", yieldPayload(label))),
    `${label} yield after failed progress`,
  );
  assert.equal(yieldError.kind, "BLOCKED", `${label} yield after failed progress must fail closed`);
  assertYieldNotResurrectedAfterTerminal(child.session, toolCallId, `${label} yield after failed progress`);
  const laterProgress = nextStatus === "running"
    ? subagentProgressForYield(child.childId, child.item, child.rootToolCallId, "running")
    : subagentProgressTerminalForYield(child.childId, child.item, child.rootToolCallId, "completed", {
      isError: false,
      result: { status: "completed", output: "rebound terminal must be rejected" },
    });
  const transitionError = captureBlockedTool(
    () => child.session.consumeLogical(laterProgress),
    `${label} later ${nextStatus} progress`,
  );
  assert.equal(transitionError.kind, "BLOCKED", `${label} later ${nextStatus} progress must be rejected after terminality`);
  assert.equal(child.binding.progress_status, "failed", `${label} must latch the original failed progress status`);
  assert.equal(child.session.evidence.subagent_frames.length, terminalFrames, `${label} rejected transition must not capture a new subagent frame`);
  assert.equal(child.session.evidence.native_progress_terminal.length, terminalRecords, `${label} rejected transition must not create a new terminal record`);
  assertYieldNotResurrectedAfterTerminal(child.session, toolCallId, `${label} later ${nextStatus} progress`);
}

function failedProgressCannotCommitCompletedRoot(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "failed-progress-root-success", "running");
  child.session.consumeLogical(subagentProgressTerminalForYield(child.childId, child.item, child.rootToolCallId, "failed", {
    isError: true,
    error: "bounded child failure",
    result: { status: "failed", isError: true, error: "bounded child failure" },
  }));
  const rootError = captureBlockedTool(
    () => child.session.recordTool(rootTaskSuccessEndForYield(child.rootToolCallId, child.item, child.childId)),
    "failed subagent progress followed by completed Root result",
  );
  assert.equal(rootError.kind, "BLOCKED", "a failed subagent progress must prevent an inline completed Root result");
  assert.equal(child.binding.progress_status, "failed", "failed progress must remain the authoritative child status");
  assert.equal(
    child.session.evidence.task_records.some((record) => record.allocated_id === child.childId && record.source_kind === "task_tool_details" && record.status === "completed"),
    false,
    "failed subagent progress must not commit a successful Root task record",
  );
  assert.equal(
    child.session.evidence.native_progress_terminal.some((record) => record.allocated_id === child.childId && record.status === "failed"),
    true,
    "the failed subagent progress raw terminal fact must remain retained",
  );
}

function completedProgressRetainsCompletedRootRecord(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "completed-progress-root-success", "running");
  child.session.consumeLogical(subagentProgressTerminalForYield(child.childId, child.item, child.rootToolCallId, "completed", {
    isError: false,
    result: { status: "completed", output: "bounded completed child output" },
  }));
  const terminalFrameCount = child.session.evidence.subagent_frames.length;
  const terminalRecordCount = child.session.evidence.native_progress_terminal.length;
  assert.equal(child.binding.progress_status, "completed", "completed progress must retain its completed status");
  assert.doesNotThrow(
    () => child.session.recordTool(rootTaskSuccessEndForYield(child.rootToolCallId, child.item, child.childId)),
    "a legitimate completed child progress may be followed by its completed Root result",
  );
  assert.equal(child.session.evidence.subagent_frames.length, terminalFrameCount, "Root completion must not erase completed progress raw frames");
  assert.equal(child.session.evidence.native_progress_terminal.length, terminalRecordCount, "Root completion must not erase completed progress terminal facts");
  assert.equal(
    child.session.evidence.subagent_frames.some((frame) => frame.id === child.childId && frame.status === "completed"),
    true,
    "completed progress raw frame must remain retained",
  );
  assert.equal(
    child.session.evidence.native_progress_terminal.some((record) => record.allocated_id === child.childId && record.status === "completed"),
    true,
    "completed progress terminal fact must remain retained",
  );
  assert.equal(
    child.session.evidence.task_records.some((record) => record.allocated_id === child.childId && record.source_kind === "task_tool_details" && record.status === "completed"),
    true,
    "completed Root result must remain an authoritative successful task record",
  );
}


function firstProgressStatusYieldIsControlOnly(lifecycle, root, status) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, `first-progress-${status}`, status);
  const payload = yieldPayload(`first-progress-${status}`);
  const toolCallId = `yield|native-boundary|first-progress|${status}|full-call-identity`;
  for (const phase of ["start", "update", "end"]) {
    assert.doesNotThrow(
      () => child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, phase, payload)),
      `authoritative ${status} child exact yield ${phase} must remain a permitted control event`,
    );
  }
  assert.equal(child.binding.progress_status, status, `authoritative ${status} child must retain the observed progress status`);
  assertYieldControlOnly(child.session, payload, [toolCallId, toolCallId, toolCallId], ["start", "update", "end"], `authoritative ${status} child`);
}

function ungrantableYieldStatusesRemainBlocked(lifecycle, root) {
  for (const status of ["unknown", "pending"]) {
    const item = {
      name: `NativeBoundaryInvalidProgress.${status}`,
      agent: "validator",
      task: "Invalid lifecycle status must not grant yield permission.",
      solutionSpace: "Read-only source-derived native observer boundary regression.",
    };
    const childId = `child|native-boundary|invalid-status|${status}`;
    const rootToolCallId = `task|native-boundary|invalid-status|${status}|full-root-call`;
    const session = makeReadSession(lifecycle, root, `invalid-status-${status}`, [item]);
    session.recordTool(rootTaskStartForYield(rootToolCallId, item));
    session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId));
    const error = captureBlockedTool(
      () => session.consumeLogical(subagentProgressForYield(childId, item, rootToolCallId, status)),
      `invalid ${status} child progress`,
    );
    assertYieldNotGranted(session, `yield|native-boundary|invalid-status|${status}`, `invalid ${status} child progress`, false, childId);
  }

  for (const status of ["completed", "failed", "aborted"]) {
    const child = makeAuthoritativeProgressChildSession(lifecycle, root, `terminal-progress-${status}`, status);
    const toolCallId = `yield|native-boundary|terminal-progress|${status}|full-call-identity`;
    const error = captureBlockedTool(
      () => child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "start", yieldPayload(`terminal-progress-${status}`))),
      `terminal ${status} child yield`,
    );
    assert.equal(error.kind, "BLOCKED", `terminal ${status} child yield must fail closed`);
    assertYieldNotGranted(child.session, toolCallId, `terminal ${status} child yield`, true);
  }

  const unownedItem = {
    name: "NativeBoundaryUnownedProgress",
    agent: "validator",
    task: "Unowned progress must not grant yield permission.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const unownedChildId = "child|native-boundary|unowned-progress";
  const unownedRootToolCallId = "task|native-boundary|unowned-progress|full-root-call";
  const unownedSession = makeReadSession(lifecycle, root, "unowned-progress", [unownedItem]);
  unownedSession.consumeLogical(subagentProgressForYield(unownedChildId, unownedItem, unownedRootToolCallId, "running"));
  const unownedToolCallId = "yield|native-boundary|unowned-progress|full-call-identity";
  const unownedError = captureBlockedTool(
    () => unownedSession.consumeLogical(exactYieldEvent(unownedChildId, unownedItem, unownedRootToolCallId, unownedToolCallId, "start", yieldPayload("unowned-progress"))),
    "unowned running child yield",
  );
  assert.equal(unownedError.kind, "BLOCKED", "unowned running child yield must fail closed");
  assertYieldNotGranted(unownedSession, unownedToolCallId, "unowned running child yield");
  assert.equal(unownedSession.pendingLifecycleByAllocated.has(`id:${unownedChildId}`), true, "unowned progress may remain pending but never become permission");
}

function failedYieldEndAllowsFreshRetryWithoutCompletion(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "failed-yield-retry", "running");
  const failedPayload = yieldPayload("failed-yield-retry");
  const failedToolCallId = "yield|native-boundary|failed-yield-retry|failed|full-call-identity";
  for (const phase of ["start", "update", "end"]) {
    assert.doesNotThrow(
      () => child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, failedToolCallId, phase, failedPayload, phase === "end")),
      `failed yield ${phase} must remain correlated control metadata`,
    );
  }
  const failedEnd = child.session.evidence.subagent_frames.find((frame) => frame.tool_call_id === failedToolCallId && frame.control?.phase === "end");
  assert.equal(failedEnd?.is_error, true, "failed yield END must preserve the actual isError:true signal");
  assert.equal(child.session.yieldCalls.size, 0, "failed yield END must release its correlation before retry");

  const retryPayload = yieldPayload("failed-yield-retry-fresh");
  const retryToolCallId = "yield|native-boundary|failed-yield-retry|fresh|full-call-identity";
  for (const phase of ["start", "update", "end"]) {
    assert.doesNotThrow(
      () => child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, retryToolCallId, phase, retryPayload)),
      `fresh yield retry ${phase} must be accepted after a failed END`,
    );
  }
  assertYieldControlOnly(
    child.session,
    retryPayload,
    [failedToolCallId, failedToolCallId, failedToolCallId, retryToolCallId, retryToolCallId, retryToolCallId],
    ["start", "update", "end", "start", "update", "end"],
    "failed yield followed by fresh retry",
  );
  assertYieldSecretsOmitted(child.session.evidence, failedPayload, "failed yield retry must omit failed payload");
}

function pendingYieldCallsAreBoundedBeforeAdmission(lifecycle, root, limits) {
  const oversized = makeAuthoritativeProgressChildSession(lifecycle, root, "oversized-yield-call-id", "started");
  const oversizedToolCallId = `yield|native-boundary|oversized|${"x".repeat(limits.maxCaptureBytes + 1)}`;
  const oversizedBefore = {
    calls: oversized.session.yieldCalls.size,
    frames: oversized.session.evidence.subagent_frames.length,
    captureBytes: oversized.session.evidence.capture.bytes,
  };
  let oversizedError = null;
  try {
    oversized.session.consumeLogical(exactYieldEvent(
      oversized.childId,
      oversized.item,
      oversized.rootToolCallId,
      oversizedToolCallId,
      "start",
      yieldPayload("oversized-yield-call-id"),
    ));
  } catch (error) {
    oversizedError = error;
  }
  assert.ok(oversizedError, "an oversized full yield tool-call identity must be rejected before admission");
  assert.equal(oversizedError.kind, "BLOCKED", "an oversized full yield tool-call identity must fail closed");
  assert.equal(oversized.session.yieldCalls.size, oversizedBefore.calls, "oversized yield rejection must not insert a pending yield correlation");
  assert.equal(oversized.session.evidence.subagent_frames.length, oversizedBefore.frames, "oversized yield rejection must not capture a frame as a side effect");
  assert.equal(oversized.session.evidence.capture.bytes, oversizedBefore.captureBytes, "oversized yield rejection must not consume capture bytes before admission");
  assert.equal([...oversized.session.yieldCalls.keys()].some((key) => key.includes(oversizedToolCallId)), false, "oversized full yield identity must not remain in the pending map");

  const capacity = makeAuthoritativeProgressChildSession(lifecycle, root, "yield-capacity", "started");
  const legalIds = [];
  for (let index = 0; index < limits.maxPendingObservations; index += 1) {
    const toolCallId = `yield|native-boundary|capacity|legal-${index}|full-call-identity`;
    legalIds.push(toolCallId);
    capacity.session.consumeLogical(exactYieldEvent(capacity.childId, capacity.item, capacity.rootToolCallId, toolCallId, "start", yieldPayload(`yield-capacity-${index}`)));
  }
  assert.equal(capacity.session.yieldCalls.size, limits.maxPendingObservations, "the private yield boundary must retain every prior legal pending call");
  const beforeOverflowFrames = capacity.session.evidence.subagent_frames.length;
  const beforeOverflowCaptureBytes = capacity.session.evidence.capture.bytes;
  const overflowToolCallId = "yield|native-boundary|capacity|overflow-257|full-call-identity";
  let overflowError = null;
  try {
    capacity.session.consumeLogical(exactYieldEvent(capacity.childId, capacity.item, capacity.rootToolCallId, overflowToolCallId, "start", yieldPayload("yield-capacity-overflow")));
  } catch (error) {
    overflowError = error;
  }
  assert.ok(overflowError, "the next pending yield START must be rejected at the known private capacity boundary");
  assert.equal(overflowError.kind, "BLOCKED", "the pending yield capacity rejection must fail closed");
  assert.equal(capacity.session.yieldCalls.size, limits.maxPendingObservations, "the overflow START must not grow the pending yield map");
  assert.equal(capacity.session.yieldCalls.has(`${capacity.childId}\u001f${overflowToolCallId}`), false, "the overflow START must not create a new pending map entry");
  assert.equal(capacity.session.evidence.subagent_frames.length, beforeOverflowFrames, "the overflow START must not capture a frame or side effect");
  assert.equal(capacity.session.evidence.capture.bytes, beforeOverflowCaptureBytes, "the overflow START must not consume capture bytes before admission");
  assert.equal(legalIds.every((toolCallId) => capacity.session.yieldCalls.has(`${capacity.childId}\u001f${toolCallId}`)), true, "all prior legal pending calls must remain correlated after overflow rejection");

  capacity.session.consumeLogical(exactYieldEvent(capacity.childId, capacity.item, capacity.rootToolCallId, legalIds[0], "end", yieldPayload("yield-capacity-0"), true));
  assert.equal(capacity.session.yieldCalls.size, limits.maxPendingObservations - 1, "a failed END must release one pending yield slot");
  const retryToolCallId = "yield|native-boundary|capacity|retry-after-failed-end|full-call-identity";
  capacity.session.consumeLogical(exactYieldEvent(capacity.childId, capacity.item, capacity.rootToolCallId, retryToolCallId, "start", yieldPayload("yield-capacity-retry")));
  assert.equal(capacity.session.yieldCalls.size, limits.maxPendingObservations, "a fresh START must use the slot released by the failed END");
  assert.equal(capacity.session.yieldCalls.has(`${capacity.childId}\u001f${retryToolCallId}`), true, "the fresh retry START must be retained in the released slot");
  capacity.session.consumeLogical(exactYieldEvent(capacity.childId, capacity.item, capacity.rootToolCallId, retryToolCallId, "end", yieldPayload("yield-capacity-retry")));
  assert.equal(capacity.session.yieldCalls.has(`${capacity.childId}\u001f${retryToolCallId}`), false, "the fresh retry END must release its pending correlation");
  assert.equal(capacity.session.evidence.task_records.length, 0, "yield capacity controls must not create Native task completion");
}
function captureYieldFrameAttempt(operation, label) {
  let error = null;
  try {
    operation();
  } catch (caught) {
    error = caught;
  }
  if (error) assert.equal(error.kind, "BLOCKED", `${label} capture failure must remain BLOCKED`);
  return error;
}

function exhaustYieldCaptureBudget(session, label) {
  const maxBytes = session.evidence.capture?.max_bytes;
  assert.ok(Number.isSafeInteger(maxBytes) && maxBytes > 0, `${label} must expose the bounded capture budget`);
  const prior = {
    bytes: session.evidence.capture.bytes,
    complete: session.evidence.capture.complete,
  };
  session.evidence.capture.bytes = maxBytes;
  session.evidence.capture.complete = true;
  return prior;
}

function restoreYieldCaptureBudget(session, prior) {
  session.evidence.capture.bytes = prior.bytes;
  session.evidence.capture.complete = prior.complete;
}

function yieldCaptureState(session) {
  return {
    keys: [...session.yieldCalls.keys()],
    bytes: session.yieldCallBytes,
    frames: session.evidence.subagent_frames.length,
    captureBytes: session.evidence.capture.bytes,
    reads: session.evidence.subagent_reads.length,
    writes: session.evidence.subagent_writes.length,
    commands: session.evidence.command_results.length,
    tasks: session.evidence.task_records.length,
  };
}

function assertYieldCaptureStateUnchanged(session, before, label) {
  assert.deepEqual([...session.yieldCalls.keys()], before.keys, `${label} must preserve prior yield correlations`);
  assert.equal(session.yieldCallBytes, before.bytes, `${label} must preserve prior yield correlation bytes`);
  assert.equal(session.evidence.subagent_frames.length, before.frames, `${label} must not capture a failed yield frame`);
  assert.equal(session.evidence.capture.bytes, before.captureBytes, `${label} must preserve the controlled capture budget state`);
  assert.equal(session.evidence.subagent_reads.length, before.reads, `${label} must not grant read permission after capture failure`);
  assert.equal(session.evidence.subagent_writes.length, before.writes, `${label} must not grant write permission after capture failure`);
  assert.equal(session.evidence.command_results.length, before.commands, `${label} must not grant shell permission after capture failure`);
  assert.equal(session.evidence.task_records.length, before.tasks, `${label} must not commit a task after capture failure`);
}

function yieldStartCaptureFailureIsAtomic(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "capture-failure-start", "started");
  const priorToolCallId = "yield|native-boundary|capture-failure-start|prior|full-call-identity";
  child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, priorToolCallId, "start", yieldPayload("capture-failure-start-prior")));
  const priorBudget = exhaustYieldCaptureBudget(child.session, "yield START capture failure");
  const before = yieldCaptureState(child.session);
  const failedToolCallId = "yield|native-boundary|capture-failure-start|failed|full-call-identity";
  captureYieldFrameAttempt(
    () => child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, failedToolCallId, "start", yieldPayload("capture-failure-start-failed"))),
    "yield START",
  );
  assertYieldCaptureStateUnchanged(child.session, before, "yield START capture failure");
  assert.equal(child.session.yieldCalls.has(`${child.childId}\u001f${priorToolCallId}`), true, "yield START capture failure must preserve the prior legal correlation");
  assert.equal(child.session.yieldCalls.has(`${child.childId}\u001f${failedToolCallId}`), false, "yield START capture failure must not retain its failed correlation");
  restoreYieldCaptureBudget(child.session, priorBudget);
  child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, priorToolCallId, "end", yieldPayload("capture-failure-start-prior")));
}

function yieldUpdateCaptureFailureIsAtomic(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "capture-failure-update", "started");
  const toolCallId = "yield|native-boundary|capture-failure-update|prior|full-call-identity";
  child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "start", yieldPayload("capture-failure-update-prior")));
  const priorBudget = exhaustYieldCaptureBudget(child.session, "yield UPDATE capture failure");
  const before = yieldCaptureState(child.session);
  captureYieldFrameAttempt(
    () => child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "update", yieldPayload("capture-failure-update-failed"))),
    "yield UPDATE",
  );
  assertYieldCaptureStateUnchanged(child.session, before, "yield UPDATE capture failure");
  assert.equal(child.session.yieldCalls.has(`${child.childId}\u001f${toolCallId}`), true, "yield UPDATE capture failure must preserve its prior START correlation");
  restoreYieldCaptureBudget(child.session, priorBudget);
  child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "end", yieldPayload("capture-failure-update-prior")));
}

function yieldEndCaptureFailureIsAtomic(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "capture-failure-end", "started");
  const toolCallId = "yield|native-boundary|capture-failure-end|prior|full-call-identity";
  child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "start", yieldPayload("capture-failure-end-prior")));
  const priorBudget = exhaustYieldCaptureBudget(child.session, "yield END capture failure");
  const before = yieldCaptureState(child.session);
  captureYieldFrameAttempt(
    () => child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "end", yieldPayload("capture-failure-end-failed"))),
    "yield END",
  );
  assertYieldCaptureStateUnchanged(child.session, before, "yield END capture failure");
  assert.equal(child.session.yieldCalls.has(`${child.childId}\u001f${toolCallId}`), true, "yield END capture failure must preserve its prior START correlation");
  restoreYieldCaptureBudget(child.session, priorBudget);
  child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "end", yieldPayload("capture-failure-end-retry")));
  assert.equal(child.session.yieldCalls.size, 0, "a retried yield END must release the preserved correlation");
  assert.equal(child.session.yieldCallBytes, 0, "a retried yield END must release the preserved correlation bytes");
  assert.equal(child.session.evidence.task_records.length, 0, "yield END capture failure must not create task completion");
}

function pendingYieldCaptureFailurePreservesPriorObservation(lifecycle, root) {
  const item = {
    name: "NativeBoundaryPendingCaptureFailure",
    agent: "validator",
    task: "Preserve prior pending observations while rejecting a later yield capture failure.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const childId = "child|native-boundary|pending-capture-failure";
  const rootToolCallId = "task|native-boundary|pending-capture-failure|full-root-call";
  const session = makeReadSession(lifecycle, root, "pending-capture-failure", [item]);
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  session.consumeLogical(subagentProgressForYield(childId, item, rootToolCallId, "running"));
  const pending = session.pendingLifecycleByAllocated.get(`id:${childId}`);
  assert.ok(pending && pending.accepted === false, "pending capture fixture must use an actual unowned pending child");
  assert.ok(pending.pending_observation_count > 0, "pending capture fixture must retain a prior pending observation");
  const before = {
    pendingCount: session.pendingObservationCount,
    pendingBytes: session.pendingObservationBytes,
    pendingFrameCount: pending.pending_observations.subagent_frames.length,
    yieldKeys: [...session.yieldCalls.keys()],
    yieldBytes: session.yieldCallBytes,
    evidenceFrames: session.evidence.subagent_frames.length,
  };
  const maxBytes = session.evidence.capture.max_bytes;
  session.pendingObservationBytes = maxBytes;
  const failedToolCallId = "yield|native-boundary|pending-capture-failure|failed|full-call-identity";
  captureYieldFrameAttempt(
    () => session.consumeLogical(exactYieldEvent(childId, item, rootToolCallId, failedToolCallId, "start", yieldPayload("pending-capture-failure"))),
    "pending child yield START capture",
  );
  assert.deepEqual([...session.yieldCalls.keys()], before.yieldKeys, "pending child capture failure must not add a yield correlation");
  assert.equal(session.yieldCallBytes, before.yieldBytes, "pending child capture failure must not leak yield correlation bytes");
  assert.equal(session.pendingObservationCount, before.pendingCount, "pending child capture failure must preserve prior observation count");
  assert.equal(session.pendingObservationBytes, maxBytes, "pending child capture failure must preserve the controlled exhausted budget");
  assert.equal(pending.pending_observation_count, before.pendingCount, "pending child capture failure must preserve prior binding observations");
  assert.equal(pending.pending_observations.subagent_frames.length, before.pendingFrameCount, "pending child capture failure must preserve prior pending frames");
  assert.equal(session.evidence.subagent_frames.length, before.evidenceFrames, "pending child capture failure must not publish a frame");
  assertNoYieldPermissions(session, "pending child capture failure");
  assert.equal(session.evidence.task_records.length, 0, "pending child capture failure must not commit a task");
  session.pendingObservationBytes = before.pendingBytes;
  session.consumeLogical(exactYieldEvent(childId, item, rootToolCallId, failedToolCallId, "start", yieldPayload("pending-capture-failure-retry")));
  session.consumeLogical(exactYieldEvent(childId, item, rootToolCallId, failedToolCallId, "end", yieldPayload("pending-capture-failure-retry")));
  assert.equal(session.yieldCalls.size, 0, "pending child retry END must release the pending yield correlation");
  assert.equal(session.yieldCallBytes, 0, "pending child retry END must release pending yield correlation bytes");
  assert.equal(pending.pending_observations.subagent_frames.length, before.pendingFrameCount + 2, "pending child retry must preserve the prior frame and append both yield controls");
}


function longYieldIdentityRetentionBoundary(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "long-yield-identities", "started");
  const sharedPrefix = `yield|native-boundary|opaque-full-id|${"opaque-segment-".repeat(400)}`;
  const toolCallIds = [`${sharedPrefix}|tail-A`, `${sharedPrefix}|tail-B`];
  for (const toolCallId of toolCallIds) assert.ok(Buffer.byteLength(toolCallId, "utf8") > 4096, "opaque identity fixtures must exceed the existing capture-safe string boundary");
  const initial = yieldCaptureState(child.session);
  const outcomes = [];
  for (const toolCallId of toolCallIds) {
    let error = null;
    try {
      child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "start", yieldPayload("long-yield-identities")));
    } catch (caught) {
      error = caught;
    }
    if (error) assert.equal(error.kind, "BLOCKED", "a rejected oversized opaque identity must fail closed");
    outcomes.push({ toolCallId, error, state: yieldCaptureState(child.session) });
  }
  if (outcomes[0].error) {
    assert.ok(outcomes[1].error, "both oversized opaque identities must reject when the first is rejected");
    assert.deepEqual([...child.session.yieldCalls.keys()], initial.keys, "rejected oversized identities must not retain map entries");
    assert.equal(child.session.yieldCallBytes, initial.bytes, "rejected oversized identities must not retain correlation bytes");
    assert.equal(child.session.evidence.subagent_frames.length, initial.frames, "rejected oversized identities must not capture frames");
    assert.equal(child.session.evidence.capture.bytes, initial.captureBytes, "rejected oversized identities must not consume capture bytes");
    return;
  }
  if (outcomes[1].error) {
    assert.deepEqual([...child.session.yieldCalls.keys()], outcomes[0].state.keys, "a second rejected oversized identity must preserve the first legal correlation");
    assert.equal(child.session.yieldCallBytes, outcomes[0].state.bytes, "a second rejected oversized identity must preserve prior correlation bytes");
    assert.equal(child.session.evidence.subagent_frames.length, outcomes[0].state.frames, "a second rejected oversized identity must not capture a frame");
    assert.equal(child.session.evidence.capture.bytes, outcomes[0].state.captureBytes, "a second rejected oversized identity must not consume capture bytes");
    child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallIds[0], "end", yieldPayload("long-yield-identities")));
    return;
  }
  const frames = child.session.evidence.subagent_frames.filter((frame) => frame.control?.kind === "yield");
  assert.deepEqual(frames.map((frame) => frame.tool_call_id), toolCallIds, "both oversized opaque identities must remain full and distinct in captured frames");
  assert.equal(new Set(frames.map((frame) => frame.tool_call_id)).size, toolCallIds.length, "oversized opaque identities must not collide after capture");
  for (const frame of frames) {
    assert.equal(frame.allocated_id, child.childId, "oversized opaque identity must preserve the actual allocated child tuple");
    assert.equal(frame.parent_tool_call_id, child.rootToolCallId, "oversized opaque identity must preserve the actual Root parent tuple");
    assert.equal(frame.index, 0, "oversized opaque identity must preserve the actual child index tuple");
    assert.equal(frame.agent, child.item.agent, "oversized opaque identity must preserve the actual child role tuple");
    assert.equal(frame.agentSource, "project", "oversized opaque identity must preserve the actual child source tuple");
    assert.ok(Number.isSafeInteger(frame.host_arrival_ordinal) && frame.host_arrival_ordinal > 0, "oversized opaque identity must retain a real host arrival ordinal");
  }
  for (const toolCallId of toolCallIds) {
    assert.equal(child.session.yieldCalls.has(`${child.childId}\u001f${toolCallId}`), true, "full oversized identity must be the actual pending correlation key");
    child.session.consumeLogical(exactYieldEvent(child.childId, child.item, child.rootToolCallId, toolCallId, "end", yieldPayload("long-yield-identities")));
  }
  assert.equal(child.session.yieldCalls.size, 0, "full oversized identity controls must release both correlations");
}
function pendingValidatorFrames(item, callId, report) {
  const command = "node .omp/state/native-tooling/lifecycle-check.mjs";
  return [
    {
      type: "tool_execution_start",
      toolName: "bash",
      toolCallId: callId,
      args: { command },
    },
    {
      type: "tool_execution_end",
      toolName: "bash",
      toolCallId: callId,
      isError: false,
      exitCode: 0,
      result: {
        content: [{ type: "text", text: JSON.stringify(report) }],
        details: { exitCode: 0 },
      },
    },
  ];
}

function rootTaskStartForYieldItems(toolCallId, items) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId,
    args: {
      context: "Bounded source-derived yield lifecycle regression.",
      tasks: items,
    },
  };
}

function rootTaskProgressRowsForYield(toolCallId, items, childIds) {
  return {
    type: "tool_execution_update",
    toolName: "task",
    toolCallId,
    partialResult: {
      details: {
        progress: items.map((item, index) => ({
          id: childIds[index],
          index,
          agent: item.agent,
          agentSource: "project",
          task: `Rendered prompt for ${item.name}.`,
          assignment: item.task,
        })),
      },
    },
  };
}

function subagentProgressForYieldTuple(childId, item, rootToolCallId, index, status) {
  return {
    type: "subagent_progress",
    payload: {
      id: childId,
      index,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      progress: {
        id: childId,
        index,
        agent: item.agent,
        agentSource: "project",
        parentToolCallId: rootToolCallId,
        status,
        assignment: item.task,
      },
    },
  };
}

function adoptedPendingCollectionBytes(binding, assignmentName, collection) {
  const domain = {
    job_id: `host-derived:job:${"0".repeat(32)}`,
    instance_id: `host-derived:instance:${"0".repeat(32)}`,
    domain_id_provenance: "host-derived-root-session-parent-tool-call-allocated-index",
  };
  return (binding.pending_observations?.[collection] ?? []).reduce((total, value) => {
    const replacement = {
      ...value,
      allocated_id: binding.allocated_id,
      parent_tool_call_id: binding.parent_tool_call_id,
      index: binding.index,
      job_id: domain.job_id,
      instance_id: domain.instance_id,
      domain_id_provenance: domain.domain_id_provenance,
      assignment_id: value.assignment_id ?? assignmentName,
      agent: value.agent ?? binding.agent,
      agentSource: value.agentSource ?? binding.agentSource,
    };
    return total + Buffer.byteLength(JSON.stringify(replacement), "utf8");
  }, 0);
}

function optionalMapEntries(value, label) {
  if (value === undefined) return null;
  assert.ok(value instanceof Map, `${label} must be a Map when present`);
  return canonical([...value.entries()]);
}

function adoptedPendingFrameBytes(binding, assignmentName) {
  return adoptedPendingCollectionBytes(binding, assignmentName, "subagent_frames");
}

function assertPendingAdoptionObservations(binding, {
  childId,
  rootToolCallId,
  commandCallId,
  completedEarlyYield,
  liveEarlyYield,
  label,
}) {
  const pending = binding.pending_observations;
  assert.ok(pending && Array.isArray(pending.subagent_frames), `${label} must retain typed pending frames`);
  const lifecycleFrames = pending.subagent_frames.filter((frame) => frame.type === "subagent_lifecycle");
  assert.ok(
    lifecycleFrames.some((frame) => frame.allocated_id === childId && frame.parent_tool_call_id === rootToolCallId && frame.index === 0),
    `${label} must retain the actual pending lifecycle tuple`,
  );
  const commandFrames = pending.subagent_frames.filter((frame) => frame.tool_call_id === commandCallId);
  assert.deepEqual(
    commandFrames.map((frame) => [frame.type, frame.tool_call_id, frame.tool]),
    [
      ["tool_execution_start", commandCallId, "bash"],
      ["tool_execution_end", commandCallId, "bash"],
    ],
    `${label} must retain both typed validator command frames and their full call identity`,
  );
  assert.equal(
    commandFrames.every((frame) => frame.allocated_id === childId && frame.parent_tool_call_id === rootToolCallId && frame.index === 0),
    true,
    `${label} command frames must retain the pending child tuple`,
  );
  const yieldFrames = pending.subagent_frames.filter((frame) => frame.control?.kind === "yield");
  assert.deepEqual(
    yieldFrames.map((frame) => [frame.tool_call_id, frame.control.phase]),
    [
      [completedEarlyYield, "start"],
      [completedEarlyYield, "update"],
      [completedEarlyYield, "end"],
      [liveEarlyYield, "start"],
      [liveEarlyYield, "update"],
    ],
    `${label} must retain every early yield control frame in arrival order`,
  );
  assert.equal(
    yieldFrames.every((frame) => frame.allocated_id === childId && frame.parent_tool_call_id === rootToolCallId && frame.index === 0),
    true,
    `${label} yield frames must retain the pending child tuple`,
  );
  const commandResults = pending.command_results;
  const expectedCommand = "node .omp/state/native-tooling/lifecycle-check.mjs";
  assert.deepEqual(
    commandResults.map((result) => [result.phase, result.nested_event_type, result.correlation?.tool_call_id, result.command_label]),
    [
      ["start", "tool_execution_start", commandCallId, expectedCommand],
      ["end", "tool_execution_end", commandCallId, expectedCommand],
    ],
    `${label} must retain typed command metadata for the exact validator command`,
  );
  assert.equal(
    commandResults.every((result) => result.allocated_id === childId && result.parent_tool_call_id === rootToolCallId && result.index === 0),
    true,
    `${label} command metadata must retain the pending child tuple`,
  );
  const terminalCommand = commandResults.at(-1);
  assert.equal(terminalCommand?.report?.status, "PASSOU", `${label} must retain the actual validator report content`);
  assert.equal(terminalCommand?.report?.actual, 1, `${label} must retain the validator report actual value`);
  assert.equal(terminalCommand?.report?.expected, 1, `${label} must retain the validator report expected value`);

}

function fullTupleAdoptionCaptureFailureRollsBackAllState(lifecycle, root) {
  const label = "full-tuple-adoption-capture-rollback";
  const item = {
    name: "NativeBoundaryAdoptionRollback",
    agent: "validator",
    task: "Preserve every early observation until exact Root tuple adoption.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const childId = "child|native-boundary|adoption-rollback|allocated";
  const rootToolCallId = "task|native-boundary|adoption-rollback|full-root-call";
  const session = makeReadSession(lifecycle, root, label, [item]);
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });

  const commandCallId = "bash|native-boundary|adoption-rollback|validator";
  const report = {
    status: "PASSOU",
    actual: 1,
    expected: 1,
    assignment_id: item.name,
    revision: "adoption-rollback-revision",
    run_id: "adoption-rollback-run",
    workload: { run_id: "adoption-rollback-run", source: "fixture", revision: "adoption-rollback-revision" },
  };
  for (const event of pendingValidatorFrames(item, commandCallId, report)) {
    session.consumeLogical(nestedChildToolEvent(childId, item, event));
  }

  const completedEarlyYield = "yield|native-boundary|adoption-rollback|completed-early";
  for (const phase of ["start", "update", "end"]) {
    session.consumeLogical(exactYieldEvent(
      childId,
      item,
      rootToolCallId,
      completedEarlyYield,
      phase,
      yieldPayload(`adoption-rollback-${phase}`),
    ));
  }
  const liveEarlyYield = "yield|native-boundary|adoption-rollback|live-early";
  for (const phase of ["start", "update"]) {
    session.consumeLogical(exactYieldEvent(
      childId,
      item,
      rootToolCallId,
      liveEarlyYield,
      phase,
      yieldPayload(`adoption-rollback-live-${phase}`),
    ));
  }

  const pending = session.pendingLifecycleByAllocated.get(`id:${childId}`);
  assert.ok(pending && pending.accepted === false, "adoption rollback must start with one real pending lifecycle binding");
  assertPendingAdoptionObservations(pending, {
    childId,
    rootToolCallId,
    commandCallId,
    completedEarlyYield,
    liveEarlyYield,
    label,
  });
  const rootStart = rootTaskStartForYield(rootToolCallId, item);
  session.recordTool(rootStart);
  const rootKey = `${rootToolCallId}\u001ftask`;
  const rootCall = session.rootTaskCalls.get(rootKey);
  assert.ok(rootCall, "the exact Root dispatch must be the current task binding before adoption");

  const pendingKey = `id:${childId}`;
  const pendingIndexKey = `${rootToolCallId}\u001f0`;
  const before = {
    pendingByAllocated: canonical([...session.pendingLifecycleByAllocated.entries()]),
    pendingByIndex: canonical([...session.pendingLifecycleByIndex.entries()].map(([key, ids]) => [key, [...ids]])),
    lifecycleByAllocated: canonical([...session.lifecycleByAllocated.entries()]),
    lifecycleByIndex: canonical([...session.lifecycleByIndex.entries()]),
    pendingObservations: canonical(pending.pending_observations),
    pendingObservationCount: session.pendingObservationCount,
    pendingObservationBytes: session.pendingObservationBytes,
    pendingBindingCount: pending.pending_observation_count,
    pendingBindingBytes: pending.pending_observation_bytes,
    validatorCalls: canonical([...session.validatorCalls.entries()]),
    yieldCalls: canonical([...session.yieldCalls.entries()]),
    yieldCallBytes: session.yieldCallBytes,
    frames: session.evidence.subagent_frames.length,
    reads: session.evidence.subagent_reads.length,
    writes: session.evidence.subagent_writes.length,
    commands: session.evidence.command_results.length,
    terminalProgress: session.evidence.native_progress_terminal.length,
    tasks: session.evidence.task_records.length,
    captureBytes: session.evidence.capture.bytes,
    rootProgress: optionalMapEntries(rootCall.progress_by_index, "Root progress"),
  };
  const frameBytes = adoptedPendingFrameBytes(pending, item.name);
  const commandBytes = adoptedPendingCollectionBytes(pending, item.name, "command_results");
  assert.ok(frameBytes > 0, "the pending adoption fixture must contain capturable child frames");
  assert.ok(commandBytes > 0, "the pending adoption fixture must contain capturable command results");
  const originalCapture = session.capture;
  let injectedCaptureFault = false;
  let adoptedFrameCaptures = 0;
  session.capture = function controlledAdoptionCapture(collection, value) {
    if (
      !injectedCaptureFault
      && collection === "subagent_frames"
      && value?.allocated_id === childId
      && value?.parent_tool_call_id === rootToolCallId
      && value?.index === 0
      && value?.agent === item.agent
      && value?.agentSource === "project"
    ) {
      adoptedFrameCaptures += 1;
      if (adoptedFrameCaptures === 2) {
        injectedCaptureFault = true;
        const error = new Error("controlled second adopted subagent frame capture failure");
        error.kind = "BLOCKED";
        throw error;
      }
    }
    return originalCapture.call(this, collection, value);
  };

  let adoptionError = null;
  try {
    session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId));
  } catch (error) {
    adoptionError = error;
  } finally {
    session.capture = originalCapture;
  }
  assert.equal(adoptedFrameCaptures, 2, "the controlled adoption fault must occur after one exact child frame capture");
  assert.equal(adoptionError?.kind, "BLOCKED", "the controlled adoption capture fault must remain BLOCKED");
  assert.equal(canonical([...session.pendingLifecycleByAllocated.entries()]), before.pendingByAllocated, "capture failure must restore every pending allocation map entry");
  assert.deepEqual(
    canonical([...session.pendingLifecycleByIndex.entries()].map(([key, ids]) => [key, [...ids]])),
    before.pendingByIndex,
    "capture failure must restore the pending parent/index correlation map",
  );
  assert.equal(canonical([...session.lifecycleByAllocated.entries()]), before.lifecycleByAllocated, "capture failure must not publish an accepted child binding");
  assert.equal(canonical([...session.lifecycleByIndex.entries()]), before.lifecycleByIndex, "capture failure must not publish an accepted parent/index binding");
  assert.equal(session.pendingLifecycleByAllocated.get(pendingKey), pending, "capture failure must preserve the original pending binding object");
  assert.deepEqual(canonical(pending.pending_observations), before.pendingObservations, "capture failure must preserve every valid pending frame and command observation");
  assert.equal(session.pendingObservationCount, before.pendingObservationCount, "capture failure must restore the global pending observation count");
  assert.equal(session.pendingObservationBytes, before.pendingObservationBytes, "capture failure must restore the global pending observation byte counter");
  assert.equal(pending.pending_observation_count, before.pendingBindingCount, "capture failure must restore the pending binding observation count");
  assert.equal(pending.pending_observation_bytes, before.pendingBindingBytes, "capture failure must restore the pending binding observation byte counter");
  assert.equal(canonical([...session.validatorCalls.entries()]), before.validatorCalls, "capture failure must preserve command correlation metadata");
  assert.equal(canonical([...session.yieldCalls.entries()]), before.yieldCalls, "capture failure must preserve both completed and live early yield correlations");
  assert.equal(session.yieldCallBytes, before.yieldCallBytes, "capture failure must restore the live yield correlation byte counter");
  assert.equal(session.evidence.subagent_frames.length, before.frames, "capture failure must not publish a partial adopted frame");
  assert.equal(session.evidence.subagent_reads.length, before.reads, "capture failure must not publish a partial adopted read");
  assert.equal(session.evidence.subagent_writes.length, before.writes, "capture failure must not publish a partial adopted write");
  assert.equal(session.evidence.command_results.length, before.commands, "capture failure must not publish an unbudgeted adopted command result");
  assert.equal(session.evidence.native_progress_terminal.length, before.terminalProgress, "capture failure must not publish an adopted progress terminal");
  assert.equal(session.evidence.task_records.length, before.tasks, "capture failure must not publish an adopted task record");
  assert.equal(session.evidence.capture.bytes, before.captureBytes, "capture failure must restore the pre-adoption capture byte counter");
  assert.equal(session.rootTaskCalls.get(rootKey), rootCall, "capture failure must preserve the current Root task binding");
  assert.equal(optionalMapEntries(rootCall.progress_by_index, "Root progress"), before.rootProgress, "capture failure must not retain a partial Root progress allocation");
  assert.equal(session.pendingLifecycleByIndex.get(pendingIndexKey)?.has(childId), true, "capture failure must preserve the pending exact parent/index candidate");

  assert.equal(session.capture, originalCapture, "clean retry must restore the original capture method");
  assert.doesNotThrow(
    () => session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId)),
    "a clean retry with fresh capture budget must adopt the same full tuple without partial publication",
  );
  const adopted = session.lifecycleByAllocated.get(pendingKey);
  assert.equal(session.rootTaskCalls.get(rootKey), rootCall, "the clean retry must reuse the current Root task binding");
  assert.deepEqual(
    [adopted?.allocated_id, adopted?.parent_tool_call_id, adopted?.index, adopted?.agent, adopted?.agentSource],
    [childId, rootToolCallId, 0, item.agent, "project"],
    "the clean retry must publish the same exact child tuple rather than fabricate a new child",
  );
  assert.ok(adopted?.accepted === true, "the clean retry must publish the rightful accepted binding");
  assert.equal(session.pendingLifecycleByAllocated.has(pendingKey), false, "the clean retry must remove only the adopted pending binding");
  assert.equal(session.evidence.command_results.length, 2, "the clean retry must publish both retained command results through the capture budget");
  assert.equal(
    session.evidence.capture.bytes,
    before.captureBytes + frameBytes + commandBytes,
    "clean retry must account for every published adopted frame and command result in the capture counter",
  );
  const liveCorrelation = session.yieldCalls.get(`${childId}\u001f${liveEarlyYield}`);
  assert.ok(liveCorrelation?.accepted === true, "the clean retry must preserve the live early yield correlation");

  session.consumeLogical(exactYieldEvent(
    childId,
    item,
    rootToolCallId,
    liveEarlyYield,
    "end",
    yieldPayload("adoption-rollback-live-retry"),
  ));
  const freshYield = "yield|native-boundary|adoption-rollback|fresh-after-retry";
  for (const phase of ["start", "update", "end"]) {
    assert.doesNotThrow(
      () => session.consumeLogical(exactYieldEvent(
        childId,
        item,
        rootToolCallId,
        freshYield,
        phase,
        yieldPayload(`adoption-rollback-fresh-${phase}`),
      )),
      `a fresh ${phase} yield call must remain legal after full-tuple adoption retry`,
    );
  }
  assert.equal(session.yieldCalls.size, 0, "the clean retry and fresh yield call must release every live yield correlation");
  assert.equal(session.yieldCallBytes, 0, "the clean retry and fresh yield call must release every yield correlation byte");
}
function batchRootAssignmentCaptureFailureRollsBackPublicMetadata(lifecycle, root) {
  const label = "batch-root-assignment-capture-rollback";
  const itemA = {
    name: "NativeBoundaryBatchAssignmentA",
    agent: "validator",
    task: "Retain the first full Root assignment without partial publication.",
    solutionSpace: "Read-only source-derived native observer batch transaction regression.",
  };
  const itemB = {
    name: "NativeBoundaryBatchAssignmentB",
    agent: "validator",
    task: "Retain the second full Root assignment after a controlled capture fault.",
    solutionSpace: "Read-only source-derived native observer batch transaction regression.",
  };
  const childAId = "child|native-boundary|batch-assignment|A";
  const childACompetingId = "child|native-boundary|batch-assignment|A-competing";
  const childBId = "child|native-boundary|batch-assignment|B";
  const rootToolCallId = "task|native-boundary|batch-assignment|full-root-call";
  const session = makeReadSession(lifecycle, root, label, [itemA, itemB]);
  const pendingLifecycle = (childId, item, index) => ({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  session.consumeLogical(pendingLifecycle(childAId, itemA, 0));
  session.consumeLogical(subagentProgressForYieldTuple(childAId, itemA, rootToolCallId, 0, "running"));
  session.consumeLogical(pendingLifecycle(childBId, itemB, 1));
  session.consumeLogical(subagentProgressForYieldTuple(childBId, itemB, rootToolCallId, 1, "running"));
  session.consumeLogical(pendingLifecycle(childACompetingId, itemA, 0));
  session.consumeLogical(subagentProgressForYieldTuple(childACompetingId, itemA, rootToolCallId, 0, "running"));
  session.consumeLogical(exactYieldEvent(
    childACompetingId,
    itemA,
    rootToolCallId,
    "yield|native-boundary|batch-assignment|competing-live",
    "start",
    yieldPayload("batch-assignment-competing-live"),
  ));
  const pendingByAllocatedBefore = canonical([...session.pendingLifecycleByAllocated.values()]);
  const pendingByIndexBefore = canonical([...session.pendingLifecycleByIndex.values()].map((ids) => [...ids].sort()));
  const pendingObservationCountBefore = session.pendingObservationCount;
  const pendingObservationBytesBefore = session.pendingObservationBytes;
  const yieldCallsBefore = canonical([...session.yieldCalls.values()]);
  const yieldCallBytesBefore = session.yieldCallBytes;
  const pendingFrameCount = [...session.pendingLifecycleByAllocated.values()]
    .reduce((total, binding) => total + (binding.pending_observations?.subagent_frames?.length ?? 0), 0);
  const retryPublishedFrameCount = [childAId, childBId]
    .map((allocatedId) => [...session.pendingLifecycleByAllocated.values()].find((binding) => binding.allocated_id === allocatedId))
    .reduce((total, binding) => total + (binding?.pending_observations?.subagent_frames?.length ?? 0), 0);
  assert.equal(retryPublishedFrameCount, 4, "the rightful batch fixture must retain one lifecycle and one progress frame for each child");
  assert.ok(pendingFrameCount >= retryPublishedFrameCount, "the batch fixture must retain all rightful pending frames alongside the competing candidate");
  assert.equal(session.yieldCalls.size, 1, "the batch fixture must retain exactly one competing live exact yield");
  assert.equal(session.evidence.subagent_reads.length, 0, "the competing pending exact yield must not grant read permission");
  assert.equal(session.evidence.subagent_writes.length, 0, "the competing pending exact yield must not grant write permission");
  assert.equal(session.evidence.command_results.length, 0, "the competing pending exact yield must not grant shell permission");
  assert.equal(session.evidence.task_records.length, 0, "the competing pending exact yield must not complete a Native task");
  assert.ok(yieldCallBytesBefore > 0, "the competing live exact yield must contribute bounded bytes before Root adoption chooses its sibling");

  session.recordTool(rootTaskStartForYieldItems(rootToolCallId, [itemA, itemB]));
  const captureBytesBefore = session.evidence.capture.bytes;
  const rootCall = [...session.rootTaskCalls.values()].find((call) => call.tool_call_id === rootToolCallId);
  const evidenceCall = session.evidence.task_calls.find((call) => call.tool_call_id === rootToolCallId);
  assert.ok(rootCall, "the batch fixture must retain the exact Root dispatch map entry");
  assert.ok(evidenceCall, "the batch fixture must retain the exact Root dispatch evidence entry");
  const assignmentSnapshot = rootCall.assignments.map((assignment) => ({
    name: assignment.name,
    agent: assignment.agent,
    raw_task_sha256: assignment.raw_task_sha256,
    task_sha256: assignment.task_sha256,
    assignment_sha256: assignment.assignment_sha256,
    public_assignment: assignment.public_assignment,
    assignment_source: assignment.assignment_source,
  }));
  const rootMetadataSnapshot = {
    sequence: rootCall.sequence,
    host_arrival_ordinal: rootCall.host_arrival_ordinal,
    host_workflow_ordinal: rootCall.host_workflow_ordinal,
    tool_call_id: rootCall.tool_call_id,
    kind: rootCall.kind,
    item_count: rootCall.item_count,
    has_forbidden_field: rootCall.has_forbidden_field,
    forbidden_field: rootCall.forbidden_field,
    has_solution_space: rootCall.has_solution_space,
    ended: rootCall.ended,
  };
  const evidenceLengthsBefore = Object.fromEntries([
    "subagent_frames",
    "subagent_reads",
    "subagent_writes",
    "command_results",
    "native_progress_terminal",
    "task_records",
    "subagent_lifecycle_diagnostics",
    "task_details",
    "root_task_ends",
  ].map((name) => [name, session.evidence[name].length]));
  const rootProgressBefore = optionalMapEntries(rootCall.progress_by_index, "batch Root progress");
  assert.equal(rootProgressBefore, null, "the batch fixture must begin without an optional Root progress map");

  const originalCapture = session.capture;
  let firstChildFrameCaptures = 0;
  let secondChildFaults = 0;
  let faultOccurredAfterFirstAdoption = false;
  session.capture = function controlledBatchCapture(collection, value) {
    if (collection === "subagent_frames" && value?.allocated_id === childAId) firstChildFrameCaptures += 1;
    if (collection === "subagent_frames" && value?.allocated_id === childBId && secondChildFaults === 0) {
      secondChildFaults += 1;
      faultOccurredAfterFirstAdoption = firstChildFrameCaptures > 0;
      const error = new Error("controlled second legitimate batch adoption capture failure");
      error.kind = "BLOCKED";
      throw error;
    }
    return originalCapture.call(this, collection, value);
  };
  let adoptionError = null;
  try {
    session.recordTool(rootTaskProgressRowsForYield(rootToolCallId, [itemA, itemB], [childAId, childBId]));
  } catch (error) {
    adoptionError = error;
  } finally {
    session.capture = originalCapture;
  }
  assert.ok(firstChildFrameCaptures > 0, "the controlled batch fault must occur after the first legitimate child adoption began");
  assert.equal(secondChildFaults, 1, "the controlled batch fault must fire exactly once during the second legitimate child adoption");
  assert.equal(faultOccurredAfterFirstAdoption, true, "the second child fault must occur only after the first child was fully captured");
  assert.equal(adoptionError?.kind, "BLOCKED", "the controlled batch capture fault must remain BLOCKED");

  const failedRootCall = [...session.rootTaskCalls.values()].find((call) => call.tool_call_id === rootToolCallId);
  const failedEvidenceCall = session.evidence.task_calls.find((call) => call.tool_call_id === rootToolCallId);
  assert.ok(failedRootCall, "the failed batch must preserve the Root dispatch entry");
  assert.ok(failedEvidenceCall, "the failed batch must preserve the Root dispatch evidence entry");
  assert.deepEqual(
    canonical(failedRootCall.assignments),
    canonical(failedEvidenceCall.assignments),
    "Root task call and task evidence must remain behaviorally consistent aliases after rollback",
  );
  for (const [index, assignment] of failedRootCall.assignments.entries()) {
    const prior = assignmentSnapshot[index];
    assert.equal(assignment.name, prior.name, `failed batch assignment ${index} must preserve its original name`);
    assert.equal(assignment.agent, prior.agent, `failed batch assignment ${index} must preserve its original agent`);
    assert.equal(assignment.raw_task_sha256, prior.raw_task_sha256, `failed batch assignment ${index} must preserve its raw task digest`);
    assert.equal(assignment.task_sha256, prior.task_sha256, `failed batch assignment ${index} must preserve its task digest`);
    assert.equal(assignment.assignment_sha256, prior.assignment_sha256, `failed batch assignment ${index} must preserve prior assignment metadata`);
    assert.equal(Object.hasOwn(assignment, "public_assignment"), false, `failed batch assignment ${index} must not retain a partial public assignment`);
    assert.equal(Object.hasOwn(assignment, "assignment_source"), false, `failed batch assignment ${index} must not retain partial public provenance`);
  }
  for (const [field, value] of Object.entries(rootMetadataSnapshot)) {
    assert.equal(failedRootCall[field], value, `failed batch must preserve Root dispatch metadata field ${field}`);
  }
  assert.deepEqual(canonical([...session.pendingLifecycleByAllocated.values()]), pendingByAllocatedBefore, "failed batch must restore both pending allocation entries and the competing candidate");
  assert.deepEqual(canonical([...session.pendingLifecycleByIndex.values()].map((ids) => [...ids].sort())), pendingByIndexBefore, "failed batch must restore both pending parent/index candidate sets");
  assert.equal(session.pendingObservationCount, pendingObservationCountBefore, "failed batch must restore the global pending observation count");
  assert.equal(session.pendingObservationBytes, pendingObservationBytesBefore, "failed batch must restore the global pending observation byte counter");
  assert.deepEqual(canonical([...session.yieldCalls.values()]), yieldCallsBefore, "failed batch must restore the competing live exact-yield map");
  assert.equal(session.yieldCallBytes, yieldCallBytesBefore, "failed batch must restore the competing live exact-yield byte counter");
  assert.equal(session.lifecycleByAllocated.size, 0, "failed batch must not publish either accepted allocation");
  assert.equal(session.lifecycleByIndex.size, 0, "failed batch must not publish either accepted parent/index map entry");
  assert.equal(optionalMapEntries(failedRootCall.progress_by_index, "failed batch Root progress"), rootProgressBefore, "failed batch may legitimately remove its optional Root progress map");
  for (const [name, length] of Object.entries(evidenceLengthsBefore)) {
    assert.equal(session.evidence[name].length, length, `failed batch must restore captured array ${name}`);
  }
  assert.equal(session.evidence.capture.bytes, captureBytesBefore, "failed batch must restore the capture byte counter to its pre-adoption Root START baseline");
  assert.equal(session.evidence.capture.complete, true, "failed batch must preserve a complete capture state after rollback");

  assert.doesNotThrow(
    () => session.recordTool(rootTaskProgressRowsForYield(rootToolCallId, [itemA, itemB], [childAId, childBId])),
    "a clean retry must adopt the same two full Root tuples without partial publication",
  );
  const accepted = [...session.lifecycleByAllocated.values()].sort((left, right) => left.index - right.index);
  assert.deepEqual(
    accepted.map((binding) => ({
      allocated_id: binding.allocated_id,
      parent_tool_call_id: binding.parent_tool_call_id,
      index: binding.index,
      agent: binding.agent,
      agentSource: binding.agentSource,
      assignment_name: binding.assignment_name,
      accepted: binding.accepted,
    })),
    [
      { allocated_id: childAId, parent_tool_call_id: rootToolCallId, index: 0, agent: itemA.agent, agentSource: "project", assignment_name: itemA.name, accepted: true },
      { allocated_id: childBId, parent_tool_call_id: rootToolCallId, index: 1, agent: itemB.agent, agentSource: "project", assignment_name: itemB.name, accepted: true },
    ],
    "clean retry must publish both actual allocation tuples and their assignment provenance",
  );
  for (const binding of accepted) {
    assert.ok(typeof binding.job_id === "string" && binding.job_id.length > 0, "clean retry must preserve a host-derived job identity");
    assert.ok(typeof binding.instance_id === "string" && binding.instance_id.length > 0, "clean retry must preserve a host-derived instance identity");
    assert.equal(binding.domain_id_provenance, "host-derived-root-session-parent-tool-call-allocated-index", "clean retry must preserve the host-derived identity provenance");
  }
  assert.equal(session.pendingLifecycleByAllocated.size, 0, "clean retry must consume the rightful and competing pending allocation entries exactly once");
  assert.equal(session.pendingLifecycleByIndex.size, 0, "clean retry must consume the rightful and competing pending parent/index candidates exactly once");
  assert.equal(session.yieldCalls.size, 0, "clean retry must release the competing exact yield after rightful adoption");
  assert.equal(session.yieldCallBytes, 0, "clean retry must release the competing exact-yield bytes after rightful adoption");
  const retryRootCall = [...session.rootTaskCalls.values()].find((call) => call.tool_call_id === rootToolCallId);
  const retryEvidenceCall = session.evidence.task_calls.find((call) => call.tool_call_id === rootToolCallId);
  assert.ok(retryRootCall?.progress_by_index instanceof Map, "clean retry must publish the Root progress map");
  assert.equal(retryRootCall.progress_by_index.size, 2, "clean retry must publish both indexed Root progress rows");
  assert.deepEqual(
    [...retryRootCall.progress_by_index.values()].sort((left, right) => left.index - right.index).map((row) => [row.id, row.index, row.agent, row.agentSource, row.assignment]),
    [[childAId, 0, itemA.agent, "project", itemA.task], [childBId, 1, itemB.agent, "project", itemB.task]],
    "clean retry must retain both actual indexed Root progress rows",
  );
  assert.ok(retryEvidenceCall, "clean retry must retain the Root task evidence entry");
  assert.deepEqual(canonical(retryRootCall.assignments), canonical(retryEvidenceCall.assignments), "clean retry must preserve consistent Root/evidence assignment aliases");
  for (const [index, item] of [itemA, itemB].entries()) {
    const assignment = retryRootCall.assignments[index];
    assert.equal(assignment.public_assignment, item.task, `clean retry must publish assignment ${index} exactly once`);
    assert.equal(assignment.assignment_sha256, sha256Bytes(Buffer.from(item.task, "utf8")), `clean retry must publish assignment ${index}'s exact digest`);
    assert.equal(assignment.assignment_source, "Root.task.details.progress.assignment", `clean retry must publish assignment ${index}'s observed provenance`);
    assert.equal(session.evidence.task_calls.find((call) => call.tool_call_id === rootToolCallId).assignments[index].public_assignment, item.task, `evidence assignment ${index} must expose the same public assignment`);
  }
  assert.equal(session.evidence.subagent_frames.length, evidenceLengthsBefore.subagent_frames + retryPublishedFrameCount, "clean retry must publish each rightful pending frame exactly once without resurrecting the competing candidate");
  assert.equal(session.evidence.subagent_frames.filter((frame) => frame.allocated_id === childAId).length, 2, "clean retry must publish both first-child pending frames exactly once");
  assert.equal(session.evidence.subagent_frames.filter((frame) => frame.allocated_id === childBId).length, 2, "clean retry must publish both second-child pending frames exactly once");
  assert.equal(session.evidence.subagent_lifecycle_diagnostics.length, evidenceLengthsBefore.subagent_lifecycle_diagnostics + 1, "clean retry must retain one bounded diagnostic for discarding the competing candidate");
  assert.equal(session.pendingObservationCount, 0, "clean retry must release the pending observation count");
  assert.equal(session.pendingObservationBytes, 0, "clean retry must release the pending observation bytes");
  assert.equal(session.evidence.capture.complete, true, "clean retry must leave capture complete");
  assert.ok(session.evidence.capture.bytes > captureBytesBefore, "clean retry must account for the newly published captured frames");
  session.recordTool({
    type: "tool_execution_end",
    toolName: "task",
    toolCallId: rootToolCallId,
    isError: false,
    result: {
      details: {
        progress: [
          { id: childAId, index: 0, agent: itemA.agent, agentSource: "project", task: `Rendered prompt for ${itemA.name}.`, assignment: itemA.task },
          { id: childBId, index: 1, agent: itemB.agent, agentSource: "project", task: `Rendered prompt for ${itemB.name}.`, assignment: itemB.task },
        ],
        results: [
          { id: childAId, index: 0, agent: itemA.agent, agentSource: "project", status: "completed", exitCode: 0, isError: false, output: "bounded successful task output A" },
          { id: childBId, index: 1, agent: itemB.agent, agentSource: "project", status: "completed", exitCode: 0, isError: false, output: "bounded successful task output B" },
        ],
      },
    },
  });
  const rootTaskEnd = session.evidence.root_task_ends.at(-1);
  const terminalRootTaskEnd = session.evidence.terminal?.root_task_end;
  assert.ok(rootTaskEnd, "the actual Root END phase must create its root_task_ends alias");
  assert.ok(terminalRootTaskEnd, "the actual Root END phase must create its terminal root_task_end alias");
  assert.equal(rootTaskEnd.tool_call_id, rootToolCallId, "the actual Root END alias must retain the original tool call");
  assert.equal(rootTaskEnd.isError, false, "the actual Root END alias must retain the successful terminal result");
  assert.deepEqual(canonical(rootTaskEnd.dispatched_assignments), canonical(retryRootCall.assignments), "root_task_ends dispatched assignments must retain the same full assignment facts");
  assert.deepEqual(canonical(terminalRootTaskEnd.dispatched_assignments), canonical(retryRootCall.assignments), "terminal root_task_end dispatched assignments must retain the same full assignment facts");
  assert.equal(terminalRootTaskEnd.tool_call_id, rootToolCallId, "terminal root_task_end must retain the original Root tool call");
  assert.equal(terminalRootTaskEnd.isError, false, "terminal root_task_end must not erase the actual successful Root END result");
}

function rootAndSubagentTaskIdCorrelationBoundary(lifecycle, root, rootPolicy) {
  const validIntentPath = rootPolicy.intent.path;
  assert.equal(fs.statSync(validIntentPath).isFile(), true, "taskId boundary must use an existing policy-admitted project path");
  const rootTaskId = "task-id secret=fictional-root-task-boundary";
  const rootToolCallId = "write|native-boundary|task-id|root|full-call-identity";
  const rootSession = makeRootCommandSession(lifecycle, rootPolicy, "task-id-root-boundary");
  const rootBefore = {
    writes: rootSession.evidence.root_writes.length,
    bytes: rootSession.evidence.capture.bytes,
    calls: canonical([...rootSession.rootWriteCalls.values()]),
  };
  let rootError = null;
  try {
    rootSession.consumeLogical({
      type: "tool_execution_start",
      toolName: "write",
      toolCallId: rootToolCallId,
      taskId: rootTaskId,
      arguments: { path: validIntentPath, content: "bounded fictional task-id correlation fixture" },
    });
    rootSession.consumeLogical({
      type: "tool_execution_end",
      toolName: "write",
      toolCallId: rootToolCallId,
      task_id: rootTaskId,
      isError: false,
      arguments: { path: validIntentPath },
      result: { resolvedPath: validIntentPath },
    });
  } catch (error) {
    rootError = error;
  }
  if (rootError) {
    assert.equal(rootError.kind, "BLOCKED", "a refused Root taskId must fail closed as BLOCKED");
    assert.equal(rootSession.evidence.root_writes.length, rootBefore.writes, "a refused Root taskId must fail before root write correlation capture");
    assert.equal(rootSession.evidence.capture.bytes, rootBefore.bytes, "a refused Root taskId must fail before consuming capture bytes");
    assert.deepEqual(canonical([...rootSession.rootWriteCalls.values()]), rootBefore.calls, "a refused Root taskId must fail before retaining a write permission correlation");
    assert.equal(JSON.stringify(rootSession.evidence).includes(rootTaskId), false, "a refused Root taskId must not leak the fictional sensitive identifier");
  } else {
    const rootRecords = rootSession.evidence.root_writes.filter((record) => record.correlation?.tool_call_id === rootToolCallId);
    assert.equal(rootRecords.length, 2, "an admitted Root taskId must expose both correlated write phases");
    for (const record of rootRecords) {
      assert.equal(record.correlation.task_id, rootTaskId, "an admitted Root taskId must remain exact in correlation metadata");
      assert.equal(record.correlation.task_id_exposed, true, "an admitted Root taskId must remain marked as exposed metadata");
      assert.equal(record.correlation.tool_call_id, rootToolCallId, "an admitted Root taskId must retain the actual write call identity");
    }
  }

  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "task-id-subagent-boundary", "running");
  const childTaskId = "  task id fixture with spaces  ";
  const childToolCallId = "bash|native-boundary|task-id|subagent|full-call-identity";
  const report = {
    status: "PASSOU",
    actual: 1,
    expected: 1,
    assignment_id: child.item.name,
    revision: "task-id-boundary-revision",
    run_id: "task-id-boundary-run",
    workload: { run_id: "task-id-boundary-run", source: "fixture", revision: "task-id-boundary-revision" },
  };
  const childBefore = {
    commands: child.session.evidence.command_results.length,
    frames: child.session.evidence.subagent_frames.length,
    bytes: child.session.evidence.capture.bytes,
    validators: canonical([...child.session.validatorCalls.values()]),
  };
  let childError = null;
  try {
    for (const event of pendingValidatorFrames(child.item, childToolCallId, report)) {
      child.session.consumeLogical(nestedChildToolEvent(child.childId, child.item, {
        ...event,
        task_id: childTaskId,
      }));
    }
  } catch (error) {
    childError = error;
  }
  if (childError) {
    assert.equal(childError.kind, "BLOCKED", "a refused subagent task_id must fail closed as BLOCKED");
    assert.equal(child.session.evidence.command_results.length, childBefore.commands, "a refused subagent task_id must fail before command correlation capture");
    assert.equal(child.session.evidence.subagent_frames.length, childBefore.frames, "a refused subagent task_id must fail before subagent frame capture");
    assert.equal(child.session.evidence.capture.bytes, childBefore.bytes, "a refused subagent task_id must fail before consuming capture bytes");
    assert.deepEqual(canonical([...child.session.validatorCalls.values()]), childBefore.validators, "a refused subagent task_id must fail before retaining shell permission correlation");
    assert.equal(JSON.stringify(child.session.evidence).includes(childTaskId), false, "a refused subagent task_id must not leak its fictional whitespace identifier");
  } else {
    const commandResults = child.session.evidence.command_results.filter((record) => record.correlation?.tool_call_id === childToolCallId);
    assert.equal(commandResults.length, 2, "an admitted subagent task_id must expose both correlated shell phases");
    for (const record of commandResults) {
      assert.equal(record.task_id, childTaskId, "an admitted subagent task_id must remain exact at the command-result boundary");
      assert.equal(record.correlation.task_id, childTaskId, "an admitted subagent task_id must remain exact in nested correlation metadata");
      assert.equal(record.correlation.task_id_exposed, true, "an admitted subagent task_id must remain marked as exposed metadata");
      assert.equal(record.correlation.tool_call_id, childToolCallId, "an admitted subagent task_id must retain the actual shell call identity");
      assert.equal(record.allocated_id, child.childId, "an admitted subagent task_id must retain the actual child identity");
      assert.equal(record.parent_tool_call_id, child.rootToolCallId, "an admitted subagent task_id must retain the actual Root parent identity");
      assert.equal(record.index, 0, "an admitted subagent task_id must retain the actual child index");
      assert.equal(record.assignment_id, child.item.name, "an admitted subagent task_id must retain the actual assignment identity");
    }
    assert.equal(child.session.validatorCalls.size, 0, "a completed admitted subagent task_id call must release its shell correlation");
  }
}

function nestedSdkJobIdentityBoundary(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "nested-sdk-job-identity-boundary", "running");
  const harmlessJobId = `sdk-job-fixture-${"x".repeat(240)}`;
  assert.ok(Buffer.byteLength(harmlessJobId, "utf8") >= 200 && Buffer.byteLength(harmlessJobId, "utf8") <= 300, "the SDK job fixture must exercise the 200-300 byte harmless identity boundary");
  const toolCallId = "bash|native-boundary|nested-sdk-job|full-call-identity";
  const report = {
    status: "PASSOU",
    actual: 1,
    expected: 1,
    assignment_id: child.item.name,
    revision: "nested-sdk-job-boundary-revision",
    run_id: "nested-sdk-job-boundary-run",
    workload: { run_id: "nested-sdk-job-boundary-run", source: "fixture", revision: "nested-sdk-job-boundary-revision" },
  };
  const before = {
    commands: child.session.evidence.command_results.length,
    frames: child.session.evidence.subagent_frames.length,
    bytes: child.session.evidence.capture.bytes,
    validators: canonical([...child.session.validatorCalls.values()]),
  };
  let error = null;
  try {
    for (const event of pendingValidatorFrames(child.item, toolCallId, report)) {
      child.session.consumeLogical(nestedChildToolEvent(child.childId, child.item, {
        ...event,
        agentId: child.childId,
        jobId: harmlessJobId,
        job_id: harmlessJobId,
        parentToolCallId: child.rootToolCallId,
        index: 0,
        agent: child.item.agent,
        agentSource: "project",
      }));
    }
  } catch (caught) {
    error = caught;
  }
  if (error) {
    assert.equal(error.kind, "BLOCKED", "a refused harmless SDK job identity must fail closed as BLOCKED");
    assert.equal(child.session.evidence.command_results.length, before.commands, "a refused SDK job identity must fail before command correlation capture");
    assert.equal(child.session.evidence.subagent_frames.length, before.frames, "a refused SDK job identity must fail before subagent frame capture");
    assert.equal(child.session.evidence.capture.bytes, before.bytes, "a refused SDK job identity must fail before consuming capture bytes");
    assert.deepEqual(canonical([...child.session.validatorCalls.values()]), before.validators, "a refused SDK job identity must fail before retaining shell permission correlation");
    assert.equal(JSON.stringify(child.session.evidence).includes(harmlessJobId), false, "a refused SDK job identity must not leak the fictional long identifier");
    return;
  }
  const commandResults = child.session.evidence.command_results.filter((record) => record.correlation?.tool_call_id === toolCallId);
  assert.equal(commandResults.length, 2, "an admitted SDK job identity must expose both correlated shell phases");
  const frames = child.session.evidence.subagent_frames.filter((frame) => frame.tool_call_id === toolCallId);
  assert.equal(frames.length, 2, "an admitted SDK job identity must retain both nested START/END frame records");
  for (const frame of frames) {
    assert.equal(frame.tool_call_id, toolCallId, "an admitted SDK job identity frame must preserve the shared START/END call identity");
    assert.equal(frame.allocated_id, child.childId, "an admitted SDK job identity frame must preserve the actual child identity");
    assert.equal(frame.parent_tool_call_id, child.rootToolCallId, "an admitted SDK job identity frame must preserve the actual Root parent identity");
    assert.equal(frame.index, 0, "an admitted SDK job identity frame must preserve the actual child index");
    assert.equal(frame.agent, child.item.agent, "an admitted SDK job identity frame must preserve the actual child agent");
    assert.equal(frame.agentSource, "project", "an admitted SDK job identity frame must preserve the actual child source");
  }
  for (const record of commandResults) {
    assert.equal(record.correlation.tool_call_id, toolCallId, "an admitted SDK job identity must preserve one START/END call identity");
    assert.equal(record.allocated_id, child.childId, "an admitted SDK job identity must preserve the actual child identity");
    assert.equal(record.parent_tool_call_id, child.rootToolCallId, "an admitted SDK job identity must preserve the actual Root parent identity");
    assert.equal(record.index, 0, "an admitted SDK job identity must preserve the actual child index");
    assert.equal(record.assignment_id, child.item.name, "an admitted SDK job identity must preserve the actual assignment identity");
    assert.equal(record.correlation.tool_call_id, toolCallId, "an admitted SDK job identity must preserve the actual nested correlation call");
    assert.ok(record.identity?.exposed?.ids?.includes(harmlessJobId), "an admitted SDK job identity must retain the complete raw nested job ID rather than a normalized prefix");
  }
  assert.equal(child.session.validatorCalls.size, 0, "a completed admitted SDK job identity call must release its shell correlation");
}

function newBareNativeSession(lifecycle, root, label) {
  return new lifecycle.NativeRpcSession({
    omp: "offline-machine-report-boundary",
    cwd: root,
    timeoutMs: 30_000,
    assignments: [],
    logicalRunId: `machine-report-${label}`,
    label,
  });
}

function rootSessionIdBindBoundary(lifecycle, root) {
  const sessionIds = [
    "root-session secret=fictional-bind-boundary",
    `root-session-overflow-${"x".repeat(4100)}`,
  ];
  for (const [index, sessionId] of sessionIds.entries()) {
    const label = `root-session-bind-boundary-${index}`;
    const stateRequestId = `get-state|native-boundary|${index}|full-request-id`;
    const promptRequestId = `prompt|native-boundary|${index}|full-request-id`;
    const session = newBareNativeSession(lifecycle, root, label);
    const beforeBytes = session.evidence.capture.bytes;
    let error = null;
    try {
      session.bindSourceHost({
        type: "response",
        command: "get_state",
        success: true,
        id: stateRequestId,
        data: { sessionId },
      }, stateRequestId, promptRequestId);
    } catch (caught) {
      error = caught;
    }
    if (error) {
      assert.equal(error.kind, "BLOCKED", `${label} refusal must fail closed as BLOCKED`);
      assert.equal(session.evidence.root_session ?? null, null, `${label} refusal must precede root_session metadata admission`);
      assert.equal(session.evidence.root_prompt ?? null, null, `${label} refusal must precede root prompt metadata admission`);
      assert.equal(session.evidence.host_observation ?? null, null, `${label} refusal must precede host observation admission`);
      assert.equal(session.promptResults.size, 0, `${label} refusal must precede root prompt waiter admission`);
      assert.equal(session.evidence.capture.bytes, beforeBytes, `${label} refusal must precede capture bytes`);
      assert.equal(JSON.stringify(session.evidence).includes(sessionId), false, `${label} refusal must not leak the fictional root session identifier`);
      continue;
    }
    assert.equal(session.evidence.root_session.session_id, sessionId, `${label} accepted root_session must remain exact`);
    assert.equal(session.evidence.root_session.state_request_id, stateRequestId, `${label} accepted root_session must retain the correlated state request`);
    assert.equal(session.evidence.root_prompt.request_id, promptRequestId, `${label} accepted root prompt must retain the bound prompt ID`);
    assert.equal(session.evidence.host_observation.root_session_id, sessionId, `${label} host observation must retain exact root_session`);
    assert.equal(session.evidence.host_observation.root_prompt.request_id, promptRequestId, `${label} host observation must retain the bound prompt ID`);
    assert.equal(session.evidence.host_observation.waiter.request_id, promptRequestId, `${label} host observation must retain the exact outstanding waiter ID`);
    assert.equal(session.promptResults.has(promptRequestId), true, `${label} accepted binding must retain the actual prompt waiter`);
  }
}

async function rootSessionIdExecuteBoundary(lifecycle, root) {
  return withReferencedTimer(async () => {
    const sessionIds = [
      "root-session secret=fictional-execute-boundary",
      `root-session-overflow-${"x".repeat(4100)}`,
    ];
    for (const [index, sessionId] of sessionIds.entries()) {
      const label = `root-session-execute-boundary-${index}`;
      const session = newBareNativeSession(lifecycle, root, label);
      const promptCommands = [];
      session.start = () => Promise.resolve();
      session.configure = async () => {};
      session.close = async () => {};
      session.response = async (command) => {
        if (command.type === "get_state") {
          return {
            type: "response",
            command: "get_state",
            success: true,
            id: command.id,
            data: { sessionId },
          };
        }
        if (command.type === "prompt") {
          promptCommands.push(command);
          session.consumeLogical({
            type: "prompt_result",
            id: command.id,
            status: "completed",
            agentInvoked: true,
            sessionSettled: false,
          });
          session.consumeLogical({ type: "agent_end", yielded: true, isTerminal: true });
          session.consumeLogical({ type: "session_settled" });
          return { type: "response", command: "prompt", success: true, id: command.id };
        }
        throw new Error(`unexpected execute response command ${command.type}`);
      };
      let error = null;
      let result = null;
      try {
        result = await session.execute("bounded Root session identity boundary");
      } catch (caught) {
        error = caught;
      }
      if (error) {
        assert.equal(error.kind, "BLOCKED", `${label} refusal must fail closed as BLOCKED`);
        assert.equal(promptCommands.length, 0, `${label} refusal must precede prompt dispatch`);
        assert.equal(session.evidence.root_session ?? null, null, `${label} refusal must precede root_session metadata admission`);
        assert.equal(session.evidence.root_prompt ?? null, null, `${label} refusal must precede root prompt metadata admission`);
        assert.equal(session.evidence.host_observation ?? null, null, `${label} refusal must precede host observation admission`);
        assert.equal(session.promptResults.size, 0, `${label} refusal must precede root prompt waiter admission`);
        assert.equal(JSON.stringify(session.evidence).includes(sessionId), false, `${label} refusal must not leak the fictional execute root session identifier`);
        continue;
      }
      assert.equal(promptCommands.length, 1, `${label} accepted execution must dispatch exactly one bound prompt`);
      const promptCommand = promptCommands[0];
      assert.ok(promptCommand.message.includes(sessionId), `${label} bound prompt must retain the exact root session identifier`);
      assert.equal(result.root_session.session_id, sessionId, `${label} execute root_session must remain exact`);
      assert.equal(result.host_observation.root_session_id, sessionId, `${label} execute host observation must remain exact`);
      assert.equal(result.host_observation.root_prompt.request_id, promptCommand.id, `${label} execute host observation must retain the bound prompt ID`);
      assert.equal(result.root_prompt.request_id, promptCommand.id, `${label} execute root prompt must retain the bound prompt ID`);
      assert.equal(result.terminal.root_binding.root_session, sessionId, `${label} terminal root binding must retain exact root_session`);
      assert.equal(result.terminal.root_binding.prompt_request_id, promptCommand.id, `${label} terminal root binding must retain the actual prompt ID`);
    }
  });
}

function adoptionCommandResultBudgetFailureIsAtomic(lifecycle, root, maxCaptureBytes) {
  const label = "adoption-command-result-budget-rollback";
  const item = {
    name: "NativeBoundaryCommandBudget",
    agent: "validator",
    task: "Preserve command metadata while refusing an over-budget adoption publication.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const childId = "child|native-boundary|command-budget|allocated";
  const rootToolCallId = "task|native-boundary|command-budget|full-root-call";
  const session = makeReadSession(lifecycle, root, label, [item]);
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  session.consumeLogical(subagentProgressForYield(childId, item, rootToolCallId, "started"));

  const commandCallId = "bash|native-boundary|command-budget|validator";
  const report = {
    status: "PASSOU",
    actual: 1,
    expected: 1,
    assignment_id: item.name,
    revision: "command-budget-revision",
    run_id: "command-budget-run",
    workload: { run_id: "command-budget-run", source: "fixture", revision: "command-budget-revision" },
  };
  for (const event of pendingValidatorFrames(item, commandCallId, report)) {
    session.consumeLogical(nestedChildToolEvent(childId, item, event));
  }

  const completedEarlyYield = "yield|native-boundary|command-budget|completed-early";
  for (const phase of ["start", "update", "end"]) {
    session.consumeLogical(exactYieldEvent(
      childId,
      item,
      rootToolCallId,
      completedEarlyYield,
      phase,
      yieldPayload(`command-budget-${phase}`),
    ));
  }
  const liveEarlyYield = "yield|native-boundary|command-budget|live-early";
  for (const phase of ["start", "update"]) {
    session.consumeLogical(exactYieldEvent(
      childId,
      item,
      rootToolCallId,
      liveEarlyYield,
      phase,
      yieldPayload(`command-budget-live-${phase}`),
    ));
  }

  const pending = session.pendingLifecycleByAllocated.get(`id:${childId}`);
  assert.ok(pending && pending.accepted === false, "command budget must start with one real pending lifecycle binding");
  assert.equal(pending.progress_status, "started", "command budget must use a valid first started progress observation");
  assertPendingAdoptionObservations(pending, {
    childId,
    rootToolCallId,
    commandCallId,
    completedEarlyYield,
    liveEarlyYield,
    label,
  });

  session.recordTool(rootTaskStartForYield(rootToolCallId, item));
  const rootKey = `${rootToolCallId}\u001ftask`;
  const rootCall = session.rootTaskCalls.get(rootKey);
  assert.ok(rootCall, "command budget must reach the exact Root dispatch before adoption");

  const pendingKey = `id:${childId}`;
  const pendingIndexKey = `${rootToolCallId}\u001f0`;
  const pendingFrameCount = pending.pending_observations.subagent_frames.length;
  const pendingCommandCount = pending.pending_observations.command_results.length;
  const before = {
    pendingByAllocated: canonical([...session.pendingLifecycleByAllocated.entries()]),
    pendingByIndex: canonical([...session.pendingLifecycleByIndex.entries()].map(([key, ids]) => [key, [...ids]])),
    lifecycleByAllocated: canonical([...session.lifecycleByAllocated.entries()]),
    lifecycleByIndex: canonical([...session.lifecycleByIndex.entries()]),
    pendingObservations: canonical(pending.pending_observations),
    pendingObservationCount: session.pendingObservationCount,
    pendingObservationBytes: session.pendingObservationBytes,
    pendingBindingCount: pending.pending_observation_count,
    pendingBindingBytes: pending.pending_observation_bytes,
    validatorCalls: canonical([...session.validatorCalls.entries()]),
    yieldCalls: canonical([...session.yieldCalls.entries()]),
    yieldCallBytes: session.yieldCallBytes,
    frames: session.evidence.subagent_frames.length,
    reads: session.evidence.subagent_reads.length,
    writes: session.evidence.subagent_writes.length,
    commands: session.evidence.command_results.length,
    terminalProgress: session.evidence.native_progress_terminal.length,
    tasks: session.evidence.task_records.length,
    captureBytes: session.evidence.capture.bytes,
    rootProgress: optionalMapEntries(rootCall.progress_by_index, "Root progress"),
  };
  const frameBytes = adoptedPendingCollectionBytes(pending, item.name, "subagent_frames");
  const commandBytes = adoptedPendingCollectionBytes(pending, item.name, "command_results");
  assert.ok(frameBytes > 0 && frameBytes <= maxCaptureBytes, "command budget pending frames must fit within the capture budget");
  assert.ok(commandBytes > 0, "command budget pending command results must have positive retained bytes");
  assert.ok(frameBytes + commandBytes <= maxCaptureBytes, "the normal adoption fixture must fit within the capture budget");
  const initialCapturedBytes = maxCaptureBytes - frameBytes;
  assert.ok(initialCapturedBytes >= 0, "the artificial boundary occupancy must leave room for legitimate frames");
  assert.equal(initialCapturedBytes + frameBytes, maxCaptureBytes, "legitimate frame publication must exactly reach the capture boundary");
  assert.ok(initialCapturedBytes + frameBytes + commandBytes > maxCaptureBytes, "positive command-result publication must exceed the boundary after frames");
  session.evidence.capture.bytes = initialCapturedBytes;
  const exhaustedBeforeAdoption = {
    bytes: session.evidence.capture.bytes,
  };

  let adoptionError = null;
  try {
    session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId));
  } catch (error) {
    adoptionError = error;
  }
  assert.ok(adoptionError, "command-result retention must refuse adoption at the byte boundary");
  assert.equal(adoptionError.kind, "BLOCKED", "command-result retention exhaustion must remain BLOCKED");
  assert.equal(canonical([...session.pendingLifecycleByAllocated.entries()]), before.pendingByAllocated, "command-result refusal must preserve every pending allocation map entry");
  assert.deepEqual(
    canonical([...session.pendingLifecycleByIndex.entries()].map(([key, ids]) => [key, [...ids]])),
    before.pendingByIndex,
    "command-result refusal must preserve the pending parent/index correlation map",
  );
  assert.equal(canonical([...session.lifecycleByAllocated.entries()]), before.lifecycleByAllocated, "command-result refusal must not publish an accepted child binding");
  assert.equal(canonical([...session.lifecycleByIndex.entries()]), before.lifecycleByIndex, "command-result refusal must not publish an accepted parent/index binding");
  assert.equal(session.pendingLifecycleByAllocated.get(pendingKey), pending, "command-result refusal must preserve the original pending binding object");
  assert.deepEqual(canonical(pending.pending_observations), before.pendingObservations, "command-result refusal must preserve every prior typed frame and command observation");
  assert.equal(session.pendingObservationCount, before.pendingObservationCount, "command-result refusal must restore the global pending observation count");
  assert.equal(session.pendingObservationBytes, before.pendingObservationBytes, "command-result refusal must restore the global pending observation byte counter");
  assert.equal(pending.pending_observation_count, before.pendingBindingCount, "command-result refusal must restore the pending binding observation count");
  assert.equal(pending.pending_observation_bytes, before.pendingBindingBytes, "command-result refusal must restore the pending binding observation byte counter");
  assert.equal(canonical([...session.validatorCalls.entries()]), before.validatorCalls, "command-result refusal must preserve command correlation metadata");
  assert.equal(canonical([...session.yieldCalls.entries()]), before.yieldCalls, "command-result refusal must preserve every prior early yield correlation");
  assert.equal(session.yieldCallBytes, before.yieldCallBytes, "command-result refusal must restore the live yield correlation byte counter");
  assert.equal(session.evidence.subagent_frames.length, before.frames, "command-result refusal must publish no adopted frame");
  assert.equal(session.evidence.subagent_reads.length, before.reads, "command-result refusal must grant no read permission");
  assert.equal(session.evidence.subagent_writes.length, before.writes, "command-result refusal must grant no write permission");
  assert.equal(session.evidence.command_results.length, before.commands, "command-result refusal must publish no adopted command result");
  assert.equal(session.evidence.native_progress_terminal.length, before.terminalProgress, "command-result refusal must publish no adopted progress terminal");
  assert.equal(session.evidence.task_records.length, before.tasks, "command-result refusal must commit no task record");
  assert.equal(session.evidence.capture.bytes, exhaustedBeforeAdoption.bytes, "command-result refusal must restore the pre-adoption capture byte counter");
  assert.equal(session.rootTaskCalls.get(rootKey), rootCall, "command-result refusal must preserve the current Root task binding");
  assert.equal(optionalMapEntries(rootCall.progress_by_index, "Root progress"), before.rootProgress, "command-result refusal must not retain a partial Root progress allocation");
  assert.equal(session.pendingLifecycleByIndex.get(pendingIndexKey)?.has(childId), true, "command-result refusal must preserve the pending exact parent/index candidate");

  session.evidence.capture.bytes = before.captureBytes;
  assert.doesNotThrow(
    () => session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId)),
    "a fresh command-result budget must permit one clean full-tuple adoption retry",
  );
  const adopted = session.lifecycleByAllocated.get(pendingKey);
  assert.equal(session.rootTaskCalls.get(rootKey), rootCall, "the clean command-result retry must reuse the current Root task binding");
  assert.deepEqual(
    [adopted?.allocated_id, adopted?.parent_tool_call_id, adopted?.index, adopted?.agent, adopted?.agentSource],
    [childId, rootToolCallId, 0, item.agent, "project"],
    "the clean command-result retry must publish the same exact child tuple rather than fabricate a new child",
  );
  assert.ok(adopted?.accepted === true, "the clean command-result retry must publish the rightful accepted binding");
  assert.equal(session.pendingLifecycleByAllocated.has(pendingKey), false, "the clean command-result retry must remove only the adopted pending binding");
  assert.equal(session.evidence.subagent_frames.length, before.frames + pendingFrameCount, "the clean command-result retry must publish every retained frame exactly once");
  assert.equal(session.evidence.command_results.length, before.commands + pendingCommandCount, "the clean command-result retry must publish every retained command result exactly once");
  assert.equal(
    session.evidence.capture.bytes,
    before.captureBytes + frameBytes + commandBytes,
    "the clean command-result retry must preserve the real capture byte counter invariant",
  );
  assert.equal(session.evidence.subagent_reads.length, before.reads, "command-result adoption must not grant hidden read permission");
  assert.equal(session.evidence.subagent_writes.length, before.writes, "command-result adoption must not grant hidden write permission");
  assert.equal(session.evidence.native_progress_terminal.length, before.terminalProgress, "command-result adoption must not create a hidden terminal");
  assert.equal(session.evidence.task_records.length, before.tasks, "command-result adoption must not commit a task completion");
  const publishedCommands = session.evidence.command_results.slice(-pendingCommandCount);
  assert.deepEqual(
    publishedCommands.map((result) => [result.phase, result.correlation?.tool_call_id]),
    [["start", commandCallId], ["end", commandCallId]],
    "the clean retry must publish the original typed command correlation",
  );
  const liveCorrelation = session.yieldCalls.get(`${childId}\u001f${liveEarlyYield}`);
  assert.ok(liveCorrelation?.accepted === true, "the clean command-result retry must preserve the live early yield correlation");
  session.consumeLogical(exactYieldEvent(
    childId,
    item,
    rootToolCallId,
    liveEarlyYield,
    "end",
    yieldPayload("command-budget-live-retry"),
  ));
  assert.equal(session.yieldCalls.size, 0, "the clean command-result retry must release every live yield correlation");
  assert.equal(session.yieldCallBytes, 0, "the clean command-result retry must release every yield correlation byte");
}


function contradictoryYieldProgressRollsBackWholeFrame(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "yield-contradictory-progress", "started");
  const priorToolCallId = "yield|native-boundary|contradictory-progress|prior";
  const priorPayload = yieldPayload("contradictory-progress-prior");
  for (const phase of ["start", "update"]) {
    child.session.consumeLogical(exactYieldEvent(
      child.childId,
      child.item,
      child.rootToolCallId,
      priorToolCallId,
      phase,
      priorPayload,
    ));
  }
  const before = {
    frames: child.session.evidence.subagent_frames.length,
    captureBytes: child.session.evidence.capture.bytes,
    yieldCalls: canonical([...child.session.yieldCalls.entries()]),
    yieldCallBytes: child.session.yieldCallBytes,
    reads: child.session.evidence.subagent_reads.length,
    writes: child.session.evidence.subagent_writes.length,
    commands: child.session.evidence.command_results.length,
    terminals: child.session.evidence.native_progress_terminal.length,
    tasks: child.session.evidence.task_records.length,
    progressStatus: child.binding.progress_status,
    progressTerminal: child.binding.progress_terminal,
  };
  const contradictoryToolCallId = "yield|native-boundary|contradictory-progress|bad";
  const contradictory = nestedChildToolEvent(child.childId, child.item, {
    type: "tool_execution_start",
    toolName: "yield",
    toolCallId: contradictoryToolCallId,
    args: { type: ["progress"], data: yieldPayload("contradictory-progress-bad") },
    parentToolCallId: child.rootToolCallId,
    index: 0,
    agent: child.item.agent,
    agentSource: "project",
  });
  contradictory.payload.progress = {
    id: child.childId,
    index: 0,
    agent: child.item.agent,
    agentSource: "project",
    parentToolCallId: "task|native-boundary|contradictory-progress|foreign-root",
    status: "completed",
    exitCode: 0,
    result: { status: "completed", output: "contradictory terminal fixture" },
  };
  let error = null;
  try {
    child.session.consumeLogical(contradictory);
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, "a legal exact yield with contradictory terminal progress must be rejected");
  assert.equal(error.kind, "BLOCKED", "the contradictory whole frame must fail closed as BLOCKED");
  assert.equal(child.session.evidence.subagent_frames.length, before.frames, "post-capture progress contradiction must roll back the new yield frame");
  assert.equal(child.session.evidence.capture.bytes, before.captureBytes, "post-capture progress contradiction must roll back capture bytes");
  assert.equal(canonical([...child.session.yieldCalls.entries()]), before.yieldCalls, "post-capture progress contradiction must not retain the new yield correlation");
  assert.equal(child.session.yieldCallBytes, before.yieldCallBytes, "post-capture progress contradiction must not leak yield correlation bytes");
  assert.equal(child.session.evidence.subagent_reads.length, before.reads, "contradictory frame must not publish a read side effect");
  assert.equal(child.session.evidence.subagent_writes.length, before.writes, "contradictory frame must not publish a write side effect");
  assert.equal(child.session.evidence.command_results.length, before.commands, "contradictory frame must not publish a command side effect");
  assert.equal(child.session.evidence.native_progress_terminal.length, before.terminals, "contradictory frame must not publish a progress terminal");
  assert.equal(child.session.evidence.task_records.length, before.tasks, "contradictory frame must not publish a task completion");
  assert.equal(child.binding.progress_status, before.progressStatus, "contradictory frame must preserve the prior valid progress status");
  assert.equal(child.binding.progress_terminal, before.progressTerminal, "contradictory frame must preserve the prior nonterminal binding");
  assert.equal(child.session.evidence.subagent_frames.some((frame) => frame.tool_call_id === priorToolCallId), true, "the prior valid yield frames must remain retained");
  const freshToolCallId = "yield|native-boundary|contradictory-progress|fresh";
  for (const phase of ["start", "update", "end"]) {
    assert.doesNotThrow(
      () => child.session.consumeLogical(exactYieldEvent(
        child.childId,
        child.item,
        child.rootToolCallId,
        freshToolCallId,
        phase,
        yieldPayload(`contradictory-progress-fresh-${phase}`),
      )),
      `a fresh exact ${phase} yield must remain legal after the rejected contradictory frame`,
    );
  }
  assert.equal(child.session.yieldCalls.size, 1, "the prior valid START/UPDATE correlation must remain live until its own END");
  child.session.consumeLogical(exactYieldEvent(
    child.childId,
    child.item,
    child.rootToolCallId,
    priorToolCallId,
    "end",
    priorPayload,
  ));
  assert.equal(child.session.yieldCalls.size, 0, "all valid correlations must release only through their own END");
}

function padIdentityToUtf8Bytes(prefix, targetBytes) {
  const prefixBytes = Buffer.byteLength(prefix, "utf8");
  assert.ok(prefixBytes <= targetBytes, "identity prefix must fit the requested UTF-8 boundary");
  return `${prefix}${"x".repeat(targetBytes - prefixBytes)}`;
}

function scrubSensitiveOpaqueIdentityBoundary(lifecycle, root) {
  const label = "scrub-sensitive-opaque-identities";
  const item = {
    name: "NativeBoundaryOpaqueIdentity",
    agent: "validator",
    task: "Retain exact opaque lifecycle identities without redaction or truncation.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const rootToolCallId = padIdentityToUtf8Bytes("task|fixture|secret=fictional-root\u001b[31mred\u001b[0m|line\nroot|é", 4096);
  const childId = padIdentityToUtf8Bytes("child|fixture|api-key=fictional-key\u001b[32mgreen\u001b[0m|line\nchild|é", 4096);
  const yieldToolCallId = padIdentityToUtf8Bytes("yield|fixture|password=fictional-password\u001b[34mblue\u001b[0m|line\nyield|é", 4096);
  for (const [value, name] of [[rootToolCallId, "Root ID"], [childId, "child ID"], [yieldToolCallId, "yield ID"]]) {
    assert.equal(Buffer.byteLength(value, "utf8"), 4096, `${name} fixture must exercise the exact 4096-byte UTF-8 identity boundary`);
  }
  const session = makeReadSession(lifecycle, root, label, [item]);
  const childKey = `id:${childId}`;
  const before = () => ({
    pending: session.pendingLifecycleByAllocated.has(childKey),
    accepted: session.lifecycleByAllocated.has(childKey),
    frames: session.evidence.subagent_frames.length,
    yieldCalls: session.yieldCalls.size,
    yieldBytes: session.yieldCallBytes,
  });

  const rejectBeforeAdmission = (error, phase, snapshot) => {
    assert.equal(error.kind, "BLOCKED", `${phase} opaque identity refusal must remain BLOCKED`);
    assert.equal(session.evidence.subagent_frames.length, snapshot.frames, `${phase} opaque identity refusal must not publish a frame`);
    assert.equal(session.yieldCalls.size, snapshot.yieldCalls, `${phase} opaque identity refusal must not publish a yield correlation`);
    assert.equal(session.yieldCallBytes, snapshot.yieldBytes, `${phase} opaque identity refusal must not consume yield bytes`);
    if (phase === "lifecycle") assert.equal(session.lifecycleByAllocated.has(childKey), false, "opaque child refusal must occur before child admission");
  };

  const setupBefore = before();
  try {
    session.recordTool(rootTaskStartForYield(rootToolCallId, item));
    session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId));
    session.consumeLogical({
      type: "subagent_lifecycle",
      payload: {
        id: childId,
        index: 0,
        agent: item.agent,
        agentSource: "project",
        parentToolCallId: rootToolCallId,
        status: "started",
      },
    });
    session.consumeLogical(subagentProgressForYield(childId, item, rootToolCallId, "running"));
  } catch (error) {
    rejectBeforeAdmission(error, "lifecycle", setupBefore);
    return;
  }
  const binding = session.lifecycleByAllocated.get(childKey);
  assert.ok(binding?.accepted === true, "accepted opaque identity fixtures must have an authoritative child binding");
  assert.equal(binding.allocated_id, childId, "accepted opaque child ID must remain exact");
  assert.equal(binding.parent_tool_call_id, rootToolCallId, "accepted opaque parent ID must remain exact");
  const taskCall = session.evidence.task_calls.find((call) => call.tool_call_id === rootToolCallId);
  assert.equal(taskCall?.tool_call_id, rootToolCallId, "accepted opaque Root task ID must remain exact");
  const beforeYield = before();
  try {
    for (const phase of ["start", "update", "end"]) {
      session.consumeLogical(exactYieldEvent(
        childId,
        item,
        rootToolCallId,
        yieldToolCallId,
        phase,
        yieldPayload(`opaque-identities-${phase}`),
      ));
    }
  } catch (error) {
    rejectBeforeAdmission(error, "yield", beforeYield);
    return;
  }
  const frames = session.evidence.subagent_frames.filter((frame) => frame.control?.kind === "yield");
  assert.equal(frames.length, 3, "accepted opaque identity fixture must retain all exact yield phases");
  for (const frame of frames) {
    assert.equal(frame.allocated_id, childId, "retained opaque frame child ID must remain exact");
    assert.equal(frame.parent_tool_call_id, rootToolCallId, "retained opaque frame parent ID must remain exact");
    assert.equal(frame.tool_call_id, yieldToolCallId, "retained opaque frame yield ID must remain exact");
    assert.equal(frame.identity, childId, "retained opaque frame public identity must remain exact");
    assert.equal(frame.control?.correlation, "matched", "retained opaque frame correlation must remain a real match");
  }
  assert.equal(session.lifecycleByIndex.get(`${rootToolCallId}\u001f0`)?.allocated_id, childId, "retained opaque parent/index map must preserve the exact child ID");
  assert.equal(session.yieldCalls.size, 0, "completed opaque yield must not leave a hidden correlation");
  assert.equal(session.yieldCallBytes, 0, "completed opaque yield must release its exact correlation bytes");
}


function separatorBearingYieldTuplesDoNotAlias(lifecycle, root) {
  const label = "separator-bearing-yield-tuples";
  const itemA = {
    name: "NativeBoundarySeparatorA",
    agent: "validator",
    task: "Retain the first separator-bearing tuple independently.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const itemB = {
    name: "NativeBoundarySeparatorB",
    agent: "validator",
    task: "Retain the second separator-bearing tuple independently.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const rootToolCallId = "task|native-boundary|separator-tuples|root";
  const childAId = "child|native-boundary|separator-tuples";
  const yieldAId = "yield|native-boundary|separator-tuples\u001fother";
  const childBId = `${childAId}\u001fyield|native-boundary|separator-tuples`;
  const yieldBId = "other";
  assert.notEqual(childAId, childBId, "separator tuple fixture must use distinct full child IDs");
  assert.notEqual(yieldAId, yieldBId, "separator tuple fixture must use distinct full yield IDs");
  assert.equal(
    `${childAId}\u001f${yieldAId}`,
    `${childBId}\u001f${yieldBId}`,
    "separator tuple fixture must collide under the vulnerable delimiter-only child/yield key",
  );
  const session = makeReadSession(lifecycle, root, label, [itemA, itemB]);
  for (const [childId, item] of [[childAId, itemA], [childBId, itemB]]) {
    session.consumeLogical({
      type: "subagent_lifecycle",
      payload: {
        id: childId,
        index: item === itemA ? 0 : 1,
        agent: item.agent,
        agentSource: "project",
        parentToolCallId: rootToolCallId,
        status: "started",
      },
    });
  }
  session.recordTool(rootTaskStartForYieldItems(rootToolCallId, [itemA, itemB]));
  session.recordTool(rootTaskProgressRowsForYield(rootToolCallId, [itemA, itemB], [childAId, childBId]));
  session.consumeLogical(subagentProgressForYieldTuple(childAId, itemA, rootToolCallId, 0, "running"));
  session.consumeLogical(subagentProgressForYieldTuple(childBId, itemB, rootToolCallId, 1, "running"));
  const before = {
    frames: session.evidence.subagent_frames.length,
    yieldCalls: canonical([...session.yieldCalls.entries()]),
    yieldBytes: session.yieldCallBytes,
  };
  let firstError = null;
  try {
    session.consumeLogical(exactYieldEventAtIndex(childAId, itemA, rootToolCallId, yieldAId, "start", yieldPayload("separator-tuple-A"), 0));
  } catch (error) {
    firstError = error;
  }
  if (firstError) {
    assert.equal(firstError.kind, "BLOCKED", "conservative separator tuple refusal must remain BLOCKED");
    assert.equal(canonical([...session.yieldCalls.entries()]), before.yieldCalls, "conservative refusal must not admit the first separator tuple");
    assert.equal(session.yieldCallBytes, before.yieldBytes, "conservative refusal must not consume the first tuple byte budget");
    assert.equal(session.evidence.subagent_frames.length, before.frames, "conservative refusal must not capture the first separator tuple");
    let secondError = null;
    try {
      session.consumeLogical(exactYieldEventAtIndex(childBId, itemB, rootToolCallId, yieldBId, "start", yieldPayload("separator-tuple-B"), 1));
    } catch (error) {
      secondError = error;
    }
    assert.ok(secondError, "conservative separator protection must refuse the colliding second tuple too");
    assert.equal(secondError.kind, "BLOCKED", "the second conservative separator refusal must remain BLOCKED");
    assert.equal(canonical([...session.yieldCalls.entries()]), before.yieldCalls, "conservative refusal must preserve the empty pre-admission yield map");
    assert.equal(session.yieldCallBytes, before.yieldBytes, "conservative refusal must preserve the pre-admission yield bytes");
    assert.equal(session.evidence.subagent_frames.length, before.frames, "conservative refusal must preserve the pre-admission frame count");
    return;
  }
  const first = [...session.yieldCalls.values()].find((call) => call.allocated_id === childAId && call.tool_call_id === yieldAId);
  assert.ok(first, "the first separator-bearing tuple must retain both actual IDs if admitted");
  let secondError = null;
  try {
    session.consumeLogical(exactYieldEventAtIndex(childBId, itemB, rootToolCallId, yieldBId, "start", yieldPayload("separator-tuple-B"), 1));
  } catch (error) {
    secondError = error;
  }
  assert.equal(secondError, null, "admitted separator-bearing tuples must use distinct unambiguous correlations");
  session.consumeLogical(exactYieldEventAtIndex(childBId, itemB, rootToolCallId, yieldBId, "update", yieldPayload("separator-tuple-B"), 1));
  assert.equal(session.yieldCalls.size, 2, "both admitted separator-bearing tuples must remain live simultaneously");
  const second = [...session.yieldCalls.values()].find((call) => call.allocated_id === childBId && call.tool_call_id === yieldBId);
  assert.ok(second, "the second separator-bearing tuple must retain both actual IDs if admitted");
  const secondFrames = session.evidence.subagent_frames.filter((frame) => frame.allocated_id === childBId && frame.tool_call_id === yieldBId);
  assert.deepEqual(secondFrames.map((frame) => frame.control?.phase), ["start", "update"], "the second tuple must retain indexed START and UPDATE frames");
  assert.equal(secondFrames.every((frame) => frame.index === 1), true, "every second tuple frame must retain the actual child index");
  assert.equal(first.allocated_id, childAId, "the first tuple child ID must remain exact");
  assert.equal(first.tool_call_id, yieldAId, "the first tuple yield ID must remain exact");
  assert.equal(second.allocated_id, childBId, "the second tuple child ID must remain exact");
  assert.equal(second.tool_call_id, yieldBId, "the second tuple yield ID must remain exact");

  session.consumeLogical(exactYieldEventAtIndex(childAId, itemA, rootToolCallId, yieldAId, "end", yieldPayload("separator-tuple-A"), 0));
  assert.equal(session.yieldCalls.size, 1, "ending the first separator-bearing tuple must not delete the second tuple");
  assert.equal([...session.yieldCalls.values()][0].allocated_id, childBId, "the second tuple must survive the first tuple END");
  assert.equal([...session.yieldCalls.values()][0].tool_call_id, yieldBId, "the second tuple correlation must survive the first tuple END");
  session.consumeLogical(exactYieldEventAtIndex(childBId, itemB, rootToolCallId, yieldBId, "end", yieldPayload("separator-tuple-B"), 1));
  assert.equal(session.yieldCalls.size, 0, "ending both separator-bearing tuples must release both distinct correlations");
  assert.equal(session.yieldCallBytes, 0, "ending both separator-bearing tuples must release both byte counters");
}


function speculativeYieldBeforeRootCannotGrantAndFullTupleAdoptionRemainsExact(lifecycle, root) {
  const item = {
    name: "NativeBoundarySpeculativeYield",
    agent: "validator",
    task: "Speculative exact yield metadata must await Root allocation.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const childId = "child|native-boundary|speculative-yield";
  const rootToolCallId = "task|native-boundary|speculative-yield|full-root-call";
  const session = makeReadSession(lifecycle, root, "speculative-yield", [item]);
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  const earlyToolCallId = "yield|native-boundary|speculative-yield|early|full-call-identity";
  const earlyPayload = yieldPayload("speculative-yield-early");
  for (const phase of ["start", "update", "end"]) {
    assert.doesNotThrow(
      () => session.consumeLogical(exactYieldEvent(childId, item, rootToolCallId, earlyToolCallId, phase, earlyPayload)),
      `speculative exact yield ${phase} before Root allocation must remain bounded pending control metadata`,
    );
  }
  assert.equal(session.evidence.subagent_frames.filter((frame) => frame.tool_call_id === earlyToolCallId).length, 0, "speculative yield control metadata must not publish before Root allocation");
  assert.equal(session.evidence.subagent_reads.length, 0, "speculative yield before Root allocation must not grant read permission");
  assert.equal(session.evidence.subagent_writes.length, 0, "speculative yield before Root allocation must not grant write permission");
  assert.equal(session.evidence.command_results.length, 0, "speculative yield before Root allocation must not grant shell permission");
  assert.equal(session.evidence.task_records.length, 0, "speculative yield before Root allocation must not complete a Native task");
  assertYieldSecretsOmitted(session.evidence, earlyPayload, "speculative yield before Root allocation");
  assert.equal(session.pendingLifecycleByAllocated.has(`id:${childId}`), true, "speculative lifecycle must remain pending before Root allocation");

  session.recordTool(rootTaskStartForYield(rootToolCallId, item));
  session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId));
  const binding = session.lifecycleByAllocated.get(`id:${childId}`);
  assert.equal(binding?.accepted, true, "the rightful full Root tuple must adopt the pending lifecycle");
  assert.deepEqual(
    {
      parent_tool_call_id: binding?.parent_tool_call_id,
      index: binding?.index,
      agent: binding?.agent,
      agentSource: binding?.agentSource,
    },
    {
      parent_tool_call_id: rootToolCallId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
    },
    "full-tuple adoption must preserve the actual Root parent/index/role/source tuple",
  );
  assertYieldControlOnly(session, earlyPayload, [earlyToolCallId, earlyToolCallId, earlyToolCallId], ["start", "update", "end"], "rightful full-tuple adoption of early yield");
  for (const frame of session.evidence.subagent_frames.filter((candidate) => candidate.tool_call_id === earlyToolCallId)) {
    assert.equal(frame.parent_tool_call_id, rootToolCallId, "adopted early yield must retain the exact Root parent tuple");
    assert.equal(frame.index, 0, "adopted early yield must retain the exact child index tuple");
  }
}

function speculativeYieldCannotAdoptByAgentOrIndex(lifecycle, root) {
  const item = {
    name: "NativeBoundarySpeculativeCandidate",
    agent: "validator",
    task: "A speculative candidate must not be adopted by role/index alone.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const candidateId = "child|native-boundary|speculative-candidate";
  const actualId = "child|native-boundary|speculative-actual";
  const rootToolCallId = "task|native-boundary|speculative-candidate|full-root-call";
  const session = makeReadSession(lifecycle, root, "speculative-candidate", [item]);
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: candidateId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  session.recordTool(rootTaskStartForYield(rootToolCallId, item));
  session.recordTool(rootTaskProgressForYield(rootToolCallId, item, actualId));
  assert.equal(session.lifecycleByAllocated.has(`id:${candidateId}`), false, "a speculative candidate must not be adopted by matching agent/index");
  assert.equal(session.pendingLifecycleByAllocated.has(`id:${candidateId}`), false, "a discarded speculative candidate must not remain pending");
  session.consumeLogical(subagentProgressForYield(actualId, item, rootToolCallId, "running"));
  assert.equal(session.lifecycleByAllocated.get(`id:${actualId}`)?.accepted, true, "the actual Root allocated identity must be accepted independently");
  const candidateToolCallId = "yield|native-boundary|speculative-candidate|role-index|full-call-identity";
  const error = captureBlockedTool(
    () => session.consumeLogical(exactYieldEvent(candidateId, item, rootToolCallId, candidateToolCallId, "start", yieldPayload("speculative-candidate"))),
    "speculative candidate yield adopted by role/index heuristic",
  );
  assert.equal(error.kind, "BLOCKED", "a speculative candidate yield must remain blocked after a different actual ID is allocated");
  assertYieldNotGranted(session, candidateToolCallId, "speculative candidate role/index heuristic", false, candidateId);
}
function abortedSpeculativeChildCannotGrantYieldAfterRootAdoption(lifecycle, root) {
  const item = {
    name: "NativeBoundaryAbortedSpeculative",
    agent: "validator",
    task: "An aborted child must never gain exact yield permission.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const childId = "child|native-boundary|aborted-speculative";
  const rootToolCallId = "task|native-boundary|aborted-speculative|full-root-call";
  const session = makeReadSession(lifecycle, root, "aborted-speculative", [item]);
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  session.consumeLogical(subagentProgressForYield(childId, item, rootToolCallId, "aborted"));
  session.recordTool(rootTaskStartForYield(rootToolCallId, item));
  session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId));
  const binding = session.lifecycleByAllocated.get(`id:${childId}`);
  if (binding) {
    assert.equal(binding.accepted, true, "an adopted aborted child must still be an actual Root allocation, not a test-only binding");
    assert.equal(binding.progress_status, "aborted", "Root adoption must retain the observed aborted progress status");
  }
  const toolCallId = "yield|native-boundary|aborted-speculative|full-call-identity";
  const error = captureBlockedTool(
    () => session.consumeLogical(exactYieldEvent(childId, item, rootToolCallId, toolCallId, "start", yieldPayload("aborted-speculative"))),
    "aborted speculative child yield",
  );
  assert.equal(error.kind, "BLOCKED", "an aborted speculative child must not gain exact yield permission");
  assertYieldNotGranted(session, toolCallId, "aborted speculative child yield", binding?.accepted === true, childId);
}


function foreignRootYieldCannotUseAnAcceptedChild(lifecycle, root) {
  const child = makeAuthoritativeProgressChildSession(lifecycle, root, "foreign-root-yield", "running");
  const foreignRootToolCallId = "task|native-boundary|foreign-root-yield|different-root";
  child.session.recordTool(rootTaskStartForYield(foreignRootToolCallId, child.item));
  const foreignToolCallId = "yield|native-boundary|foreign-root-yield|foreign-parent|full-call-identity";
  const error = captureBlockedTool(
    () => child.session.consumeLogical(exactYieldEvent(child.childId, child.item, foreignRootToolCallId, foreignToolCallId, "start", yieldPayload("foreign-root-yield"))),
    "foreign Root exact yield",
  );
  assert.equal(error.kind, "BLOCKED", "a yield from a different Root tuple must fail closed");
  assertYieldNotGranted(child.session, foreignToolCallId, "foreign Root exact yield", true);
}

function prepareMissingYieldEndForExecute(lifecycle, root, label) {
  const item = {
    name: `NativeBoundaryExecuteMissingEnd.${label}`,
    agent: "validator",
    task: "Complete one real Root task before checking missing yield END settlement.",
    solutionSpace: "Read-only source-derived native observer boundary regression.",
  };
  const childId = `child|native-boundary|${label}|allocated`;
  const rootToolCallId = `task|native-boundary|${label}|full-root-call`;
  const session = makeReadSession(lifecycle, root, label, [item]);
  session.recordTool(rootTaskStartForYield(rootToolCallId, item));
  session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId));
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  session.consumeLogical(subagentProgressForYield(childId, item, rootToolCallId, "running"));
  const binding = session.lifecycleByAllocated.get(`id:${childId}`);
  assert.ok(binding?.accepted === true, `${label} must use an actual Root-admitted child binding`);
  assert.equal(binding.lifecycle_status, "started", `${label} must preserve the accepted lifecycle start`);
  assert.equal(binding.progress_status, "running", `${label} must observe the running progress transition`);
  const payload = yieldPayload(label);
  const toolCallId = `yield|native-boundary|${label}|missing-end|full-call-identity`;
  session.consumeLogical(exactYieldEvent(childId, item, rootToolCallId, toolCallId, "start", payload));
  session.recordTool(rootTaskSuccessEndForYield(rootToolCallId, item, childId));
  assert.equal(session.evidence.task_records.length, 1, `${label} must have one actual successful Root task record before execute finalization`);
  return { session, item, childId, rootToolCallId, binding, payload, toolCallId };
}
async function withReferencedTimer(operation) {
  const keepAlive = setInterval(() => {}, 1_000);
  try {
    return await operation();
  } finally {
    clearInterval(keepAlive);
  }
}


async function executeRejectsMissingYieldEnd(lifecycle, root) {
  return withReferencedTimer(async () => {
  const run = async (label, emitSettled) => {
    const prepared = prepareMissingYieldEndForExecute(lifecycle, root, label);
    const session = prepared.session;
    session.timeoutMs = 20;
    session.start = () => Promise.resolve();
    session.configure = async () => {};
    session.close = async () => {};
    session.response = async (command) => {
      if (command.type === "get_state") {
        return {
          type: "response",
          command: "get_state",
          success: true,
          id: command.id,
          data: { sessionId: `root-session-execute-${label}` },
        };
      }
      if (command.type === "prompt") {
        session.consumeLogical({
          type: "prompt_result",
          id: command.id,
          status: "completed",
          agentInvoked: true,
          sessionSettled: false,
        });
        session.consumeLogical({ type: "agent_end", yielded: true, isTerminal: true });
        if (emitSettled) session.consumeLogical({ type: "session_settled" });
        return { type: "response", command: "prompt", success: true, id: command.id };
      }
      throw new Error(`unexpected execute response command ${command.type}`);
    };
    return { prepared, promise: session.execute(`execute finalization ${label}`) };
  };

  const missingSettlement = await run("execute-missing-settlement", false);
  await assert.rejects(
    missingSettlement.promise,
    (error) => error?.kind === "BLOCKED" && /session settled timed out/.test(String(error.message)),
    "execute must wait for the actual settled event when a yield END is missing",
  );
  assert.equal(missingSettlement.prepared.session.settled, false, "missing yield END must prevent execute from observing Root settlement");

  const prematureSettlement = await run("execute-premature-settlement", true);
  await assert.rejects(
    prematureSettlement.promise,
    (error) => error?.kind === "BLOCKED" && /retained child yield lifecycle/.test(String(error.message)),
    "execute finalization must reject a settled Root that retains a yield START without END",
  );
  assert.equal(prematureSettlement.prepared.session.evidence.terminal?.session_settled, true, "the finalization seam must observe the actual session_settled frame before rejecting the incomplete yield");
  });
}






function makeLivenessChildSession(lifecycle, root, label, item) {
  const childId = `child|native-boundary|${label}|allocated`;
  const rootToolCallId = `task|native-boundary|${label}|full-root-call`;
  const session = makeReadSession(lifecycle, root, label, [item]);
  session.recordTool(rootTaskStartForYield(rootToolCallId, item));
  session.recordTool(rootTaskProgressForYield(rootToolCallId, item, childId));
  session.consumeLogical({
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  });
  const binding = session.lifecycleByAllocated.get(`id:${childId}`);
  assert.ok(binding?.accepted === true, `${label} must start from an actual accepted child binding`);
  return { session, childId, rootToolCallId, item, binding };
}

function livenessDomainEvent(domain, phase, toolCallId, root, item, label) {
  if (domain === "read") {
    const relativePath = `liveness/${label}.txt`;
    return phase === "start"
      ? {
        type: "tool_execution_start",
        toolName: "read",
        toolCallId,
        args: { path: relativePath },
      }
      : {
        type: "tool_execution_end",
        toolName: "read",
        toolCallId,
        isError: false,
        result: { content: [{ type: "text", text: "bounded liveness read\n" }] },
      };
  }
  if (domain === "write") {
    const relativePath = ".omp/state/native-observation/native10-doc-handoff.md";
    return phase === "start"
      ? {
        type: "tool_execution_start",
        toolName: "write",
        toolCallId,
        args: { path: relativePath, content: `bounded liveness write ${label}\n` },
      }
      : {
        type: "tool_execution_end",
        toolName: "write",
        toolCallId,
        isError: false,
        result: { details: { resolvedPath: path.resolve(root, relativePath) } },
      };
  }
  if (domain === "bash") {
    const command = "node .omp/state/native-tooling/lifecycle-check.mjs";
    const report = {
      status: "PASSOU",
      actual: 1,
      expected: 1,
      assignment_id: item.name,
      revision: `liveness-${label}`,
      run_id: `liveness-${label}`,
      workload: { run_id: `liveness-${label}`, source: "fixture", revision: `liveness-${label}` },
    };
    return phase === "start"
      ? {
        type: "tool_execution_start",
        toolName: "bash",
        toolCallId,
        args: { command },
      }
      : {
        type: "tool_execution_end",
        toolName: "bash",
        toolCallId,
        isError: false,
        exitCode: 0,
        result: {
          content: [{ type: "text", text: JSON.stringify(report) }],
          details: { exitCode: 0 },
        },
      };
  }
  throw new Error(`unsupported liveness domain ${domain}`);
}

function tryCaptureError(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return error;
  }
}

function lifecycleBindingLivenessBlocksFreshDomainStarts(lifecycle, root) {
  const domains = [
    {
      name: "read",
      item: {
        name: "NativeBoundaryLivenessReader",
        agent: "validator",
        task: "Read the bounded liveness fixture only.",
        solutionSpace: "Read-only source-derived terminal binding liveness regression.",
      },
    },
    {
      name: "write",
      item: {
        name: "Native10SpecKitAuthor",
        agent: "spec-kit-author",
        task: "Retain only the bounded private documentation handoff.",
        solutionSpace: "Write only the source-derived private documentation handoff.",
      },
    },
    {
      name: "bash",
      item: {
        name: "NativeBoundaryLivenessValidator",
        agent: "validator",
        task: "Run only the bounded lifecycle validator command.",
        solutionSpace: "Read-only source-derived terminal binding liveness regression.",
      },
    },
  ];
  const violations = [];
  for (const terminalStatus of ["failed", "completed"]) {
    for (const domain of domains) {
      const label = `terminal-liveness-${terminalStatus}-${domain.name}`;
      if (domain.name === "read") {
        const relativePath = path.join(root, "liveness", `${label}.txt`);
        fs.mkdirSync(path.dirname(relativePath), { recursive: true });
        fs.writeFileSync(relativePath, "bounded liveness read\n", "utf8");
      }
      const child = makeLivenessChildSession(lifecycle, root, label, domain.item);
      const priorToolCallId = `liveness|${terminalStatus}|${domain.name}|prior`;
      const freshToolCallId = `liveness|${terminalStatus}|${domain.name}|fresh`;
      child.session.consumeLogical(nestedChildToolEvent(
        child.childId,
        child.item,
        livenessDomainEvent(domain.name, "start", priorToolCallId, root, child.item, label),
      ));
      child.session.consumeLogical(subagentProgressTerminalForYield(
        child.childId,
        child.item,
        child.rootToolCallId,
        terminalStatus,
        terminalStatus === "failed"
          ? {
            isError: true,
            error: "bounded liveness failure",
            result: { status: "failed", isError: true, error: "bounded liveness failure" },
          }
          : {
            isError: false,
            result: { status: "completed", output: "bounded liveness completion" },
          },
      ));
      const lateEndError = tryCaptureError(() => child.session.consumeLogical(nestedChildToolEvent(
        child.childId,
        child.item,
        livenessDomainEvent(domain.name, "end", priorToolCallId, root, child.item, label),
      )));
      if (lateEndError && lateEndError.kind !== "BLOCKED") {
        violations.push(`${label}: correlated late END failed with ${lateEndError.kind ?? lateEndError.name}`);
      }
      const collection = domain.name === "read"
        ? child.session.evidence.subagent_reads
        : domain.name === "write"
          ? child.session.evidence.subagent_writes
          : child.session.evidence.command_results;
      if (collection.some((record) => {
        const recordToolCallId = domain.name === "bash" ? record.correlation?.tool_call_id : record.tool_call_id;
        return recordToolCallId !== undefined && recordToolCallId !== priorToolCallId;
      })) {
        violations.push(`${label}: correlated late END retained a non-prior tool-call identity`);
      }
      const beforeFresh = {
        frames: child.session.evidence.subagent_frames.length,
        permissions: collection.length,
        pending: domain.name === "read"
          ? child.session.readCalls?.size ?? 0
          : domain.name === "write"
            ? child.session.writeCalls.size
            : child.session.validatorCalls.size,
      };
      const freshError = tryCaptureError(() => child.session.consumeLogical(nestedChildToolEvent(
        child.childId,
        child.item,
        livenessDomainEvent(domain.name, "start", freshToolCallId, root, child.item, label),
      )));
      if (!freshError) {
        violations.push(`${label}: fresh ${domain.name} START was admitted after ${terminalStatus} terminality`);
      } else if (freshError.kind !== "BLOCKED") {
        violations.push(`${label}: fresh ${domain.name} START failed with ${freshError.kind ?? freshError.name}`);
      }
      const afterFresh = {
        frames: child.session.evidence.subagent_frames.length,
        permissions: collection.length,
        pending: domain.name === "read"
          ? child.session.readCalls?.size ?? 0
          : domain.name === "write"
            ? child.session.writeCalls.size
            : child.session.validatorCalls.size,
      };
      if (freshError && (
        afterFresh.frames !== beforeFresh.frames
        || afterFresh.permissions !== beforeFresh.permissions
        || afterFresh.pending !== beforeFresh.pending
      )) {
        violations.push(`${label}: blocked fresh ${domain.name} START mutated permission, frame, or correlation state`);
      }
    }
  }
  assert.deepEqual(violations, [], "failed/completed child latches must reject every fresh read/write/bash START while never treating a correlated late END as new permission");
}

async function rootSessionMissingExecuteBlocksBeforePrompt(lifecycle, root) {
  return withReferencedTimer(async () => {
    for (const [index, stateData] of [{}, { sessionId: null }].entries()) {
      const label = `root-session-missing-execute-${index}`;
      const session = newBareNativeSession(lifecycle, root, label);
      session.timeoutMs = 25;
      const promptCommands = [];
      session.start = () => Promise.resolve();
      session.configure = async () => {};
      session.close = async () => {};
      session.response = async (command) => {
        if (command.type === "get_state") {
          return {
            type: "response",
            command: "get_state",
            success: true,
            id: command.id,
            data: stateData,
          };
        }
        if (command.type === "prompt") {
          promptCommands.push(command);
          return { type: "response", command: "prompt", success: true, id: command.id };
        }
        throw new Error(`unexpected execute response command ${command.type}`);
      };
      let error = null;
      try {
        await session.execute(`missing Root session identity ${index}`);
      } catch (caught) {
        error = caught;
      }
      assert.ok(error, `${label} must fail closed when get_state omits the actual sessionId`);
      assert.equal(error.kind, "BLOCKED", `${label} missing sessionId must remain BLOCKED`);
      assert.equal(promptCommands.length, 0, `${label} must block before dispatching the Root prompt`);
      assert.equal(session.rootTaskCalls.size, 0, `${label} must block before any Root task dispatch`);
      assert.equal(session.promptResults.size, 0, `${label} must not create a prompt waiter without the observed session`);
      assert.equal(session.evidence.root_session ?? null, null, `${label} must not publish a null Root session binding`);
      assert.equal(session.evidence.root_prompt ?? null, null, `${label} must not publish a prompt binding without the Root session`);
      assert.equal(session.evidence.host_observation ?? null, null, `${label} must not publish host observation without the Root session`);
    }
  });
}

function constructorAssignmentDriftBlocksBeforeBinding(lifecycle, root) {
  const variants = [
    ["task", "Constructor canonical task.", "Constructor altered task."],
    ["solutionSpace", "Constructor canonical solution space.", "Constructor altered solution space."],
  ];
  const violations = [];
  for (const [field, canonicalValue, alteredValue] of variants) {
    const label = `constructor-assignment-${field}-drift`;
    const configured = {
      name: `NativeBoundaryConfigured${field}`,
      agent: "validator",
      task: "Constructor canonical task.",
      solutionSpace: "Constructor canonical solution space.",
    };
    configured[field] = canonicalValue;
    const observed = { ...configured, [field]: alteredValue };
    const rootToolCallId = `task|native-boundary|${label}|root`;
    const childId = `child|native-boundary|${label}|allocated`;
    const session = makeReadSession(lifecycle, root, label, [configured]);
    let error = null;
    try {
      session.recordTool(rootTaskStartForYield(rootToolCallId, observed));
      session.consumeLogical({
        type: "subagent_lifecycle",
        payload: {
          id: childId,
          index: 0,
          agent: observed.agent,
          agentSource: "project",
          parentToolCallId: rootToolCallId,
          status: "started",
        },
      });
    } catch (caught) {
      error = caught;
    }
    if (!error || error.kind !== "BLOCKED") violations.push(`${label}: altered ${field} reached binding without BLOCKED`);
    if (
      session.lifecycleByAllocated.has(`id:${childId}`)
      || session.pendingLifecycleByAllocated.has(`id:${childId}`)
    ) {
      violations.push(`${label}: altered ${field} acquired a lifecycle binding before rejection`);
    }
  }
  assert.deepEqual(violations, [], "constructor-configured task and solutionSpace must match the observed Root dispatch before any child binding");
}

function opaqueIdentityObjectIsRejectedWithoutCanonicalization(lifecycle, root) {
  const label = "opaque-object-identity";
  const item = {
    name: "NativeBoundaryOpaqueObjectIdentity",
    agent: "validator",
    task: "Reject object-shaped opaque IDs without canonicalization.",
    solutionSpace: "Read-only source-derived opaque identity regression.",
  };
  const child = makeLivenessChildSession(lifecycle, root, label, item);
  const relativePath = path.join("opaque-object", "readable.txt");
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), "bounded opaque object read\n", "utf8");
  const objectIdentity = { namespace: "sdk", token: "opaque-object-must-not-canonicalize" };
  const canonicalIdentity = canonical(objectIdentity);
  const before = {
    frames: child.session.evidence.subagent_frames.length,
    reads: child.session.evidence.subagent_reads.length,
    writes: child.session.evidence.subagent_writes.length,
    commands: child.session.evidence.command_results.length,
    pending: child.session.readCalls?.size ?? 0,
  };
  const error = tryCaptureError(() => child.session.consumeLogical(nestedChildToolEvent(
    child.childId,
    child.item,
    {
      type: "tool_execution_start",
      toolName: "read",
      toolCallId: objectIdentity,
      args: { path: relativePath },
    },
  )));
  assert.ok(error, "an object-shaped opaque tool-call ID must be rejected");
  assert.equal(error.kind, "BLOCKED", "an object-shaped opaque tool-call ID must fail closed as BLOCKED");
  assert.equal(child.session.evidence.subagent_frames.length, before.frames, "an object-shaped opaque ID must be rejected before frame capture");
  assert.equal(child.session.evidence.subagent_reads.length, before.reads, "an object-shaped opaque ID must not grant read permission");
  assert.equal(child.session.evidence.subagent_writes.length, before.writes, "an object-shaped opaque ID must not grant write permission");
  assert.equal(child.session.evidence.command_results.length, before.commands, "an object-shaped opaque ID must not grant shell permission");
  assert.equal(child.session.readCalls?.size ?? 0, before.pending, "an object-shaped opaque ID must not create a read correlation");
  assert.equal(JSON.stringify(child.session.evidence).includes(canonicalIdentity), false, "an object-shaped opaque ID must never be canonicalized into retained SDK metadata");
}

function applicationPayloadToolCallIdsDoNotSupplySdkAuthority(lifecycle, root) {
  const item = {
    name: "NativeBoundaryToolCallMetadata",
    agent: "validator",
    task: "Use only exact SDK tool-call metadata for read correlation.",
    solutionSpace: "Read-only source-derived tool-call metadata authority regression.",
  };
  const controlLabel = "tool-call-id-exact-metadata-control";
  const controlPath = path.join(root, "tool-call-id-control.txt");
  fs.writeFileSync(controlPath, "bounded exact tool-call metadata control\n", "utf8");
  const control = makeLivenessChildSession(lifecycle, root, controlLabel, item);
  const exactToolCallId = "tool-call|exact-sdk-metadata|control";
  control.session.consumeLogical(nestedChildToolEvent(
    control.childId,
    control.item,
    {
      type: "tool_execution_start",
      toolName: "read",
      toolCallId: exactToolCallId,
      args: { path: path.basename(controlPath) },
    },
  ));
  control.session.consumeLogical(nestedChildToolEvent(
    control.childId,
    control.item,
    {
      type: "tool_execution_end",
      toolName: "read",
      toolCallId: exactToolCallId,
      isError: false,
      result: { content: [{ type: "text", text: "bounded exact metadata control\n" }] },
    },
  ));
  const controlReads = control.session.evidence.subagent_reads.filter((record) => record.tool_call_id === exactToolCallId);
  assert.equal(controlReads.length, 1, "an exact SDK metadata tool-call ID must correlate one valid read");
  assert.equal(controlReads[0].correlation?.status, "matched", "an exact SDK metadata tool-call ID must retain matched correlation");

  const violations = [];
  for (const namespace of ["data", "arguments", "input", "result"]) {
    const label = `tool-call-id-application-${namespace}`;
    const relativePath = `${label}.txt`;
    fs.writeFileSync(path.join(root, relativePath), `bounded application payload ${namespace}\n`, "utf8");
    const child = makeLivenessChildSession(lifecycle, root, label, item);
    const applicationToolCallId = `application-payload|${namespace}|must-not-authorize`;
    const event = {
      type: "tool_execution_start",
      toolName: "read",
      args: { path: relativePath },
      [namespace]: {
        toolCallId: applicationToolCallId,
        application_value: `application-${namespace}`,
      },
    };
    const before = {
      frames: child.session.evidence.subagent_frames.length,
      reads: child.session.evidence.subagent_reads.length,
      pending: child.session.readCalls?.size ?? 0,
    };
    const error = tryCaptureError(() => child.session.consumeLogical(nestedChildToolEvent(child.childId, child.item, event)));
    if (!error || error.kind !== "BLOCKED") {
      violations.push(`${label}: application payload toolCallId supplied SDK authority`);
    }
    const after = {
      frames: child.session.evidence.subagent_frames.length,
      reads: child.session.evidence.subagent_reads.length,
      pending: child.session.readCalls?.size ?? 0,
    };
    if (
      after.frames !== before.frames
      || after.reads !== before.reads
      || after.pending !== before.pending
      || [...(child.session.readCalls?.keys() ?? [])].some((key) => key.includes(applicationToolCallId))
    ) {
      violations.push(`${label}: application payload toolCallId mutated SDK read authority state`);
    }
  }
  assert.deepEqual(violations, [], "only exact tool-call metadata may supply SDK authority; application data/arguments/input/result IDs must be ignored");
}


function jsonObjectsInPrompt(text) {
  const objects = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') {
        quoted = true;
        continue;
      }
      if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth !== 0) continue;
        try {
          const parsed = JSON.parse(text.slice(start, index + 1));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) objects.push(parsed);
        } catch {
          // A prose brace is not a caller assignment.
        }
        break;
      }
    }
  }
  return objects;
}

function promptAssignmentCandidates(prompt) {
  return jsonObjectsInPrompt(prompt).flatMap((value) => Array.isArray(value.tasks) ? value.tasks : [value]);
}

function callerRootItemsFromPrompt(prompt, assignments, label) {
  assert.equal(typeof prompt, "string", `${label} caller prompt must be a string`);
  assert.ok(prompt.trim(), `${label} caller prompt must not be empty`);
  assert.ok(Array.isArray(assignments) && assignments.length > 0, `${label} caller must configure at least one assignment`);
  const candidates = promptAssignmentCandidates(prompt);
  return assignments.map((assignment, index) => {
    assert.ok(assignment && typeof assignment === "object", `${label} configured assignment ${index} must be an object`);
    const candidate = candidates.find((value) =>
      value
      && typeof value === "object"
      && value.name === assignment.name
      && (value.agent === undefined || value.agent === assignment.agent));
    const task = typeof candidate?.task === "string"
      ? candidate.task
      : typeof assignment.task === "string"
        ? assignment.task
        : prompt;
    const solutionSpace = typeof candidate?.solutionSpace === "string"
      ? candidate.solutionSpace
      : typeof assignment.solutionSpace === "string"
        ? assignment.solutionSpace
        : `${assignment.agent} caller assignment boundary`;
    assert.equal(typeof assignment.name, "string", `${label} caller assignment ${index} must expose its name`);
    assert.equal(typeof assignment.agent, "string", `${label} caller assignment ${index} must expose its agent`);
    assert.ok(task.trim(), `${label} caller assignment ${assignment.name} must carry a non-empty task from the observed prompt`);
    assert.ok(solutionSpace.trim(), `${label} caller assignment ${assignment.name} must carry a non-empty solutionSpace from the observed prompt`);
    return { name: assignment.name, agent: assignment.agent, task, solutionSpace };
  });
}
function canonicalAssignmentsFromPrompt(prompt, expectedAssignments, label) {
  const candidates = promptAssignmentCandidates(prompt);
  return expectedAssignments.map(([agent, name], index) => {
    const candidate = candidates.find((value) => value && value.name === name && value.agent === agent);
    assert.ok(candidate, `${label} prompt must expose canonical assignment ${name}`);
    assert.deepEqual(
      Object.keys(candidate).sort(),
      ["agent", "name", "solutionSpace", "task"],
      `${label} prompt assignment ${index} must be the complete canonical object`,
    );
    assert.equal(typeof candidate.task, "string", `${label} prompt assignment ${name} task must be a string`);
    assert.equal(typeof candidate.solutionSpace, "string", `${label} prompt assignment ${name} solutionSpace must be a string`);
    return structuredClone(candidate);
  });
}

function assertSourceDerivedCanonicalAssignment(capture, expected, label) {
  assert.equal(capture?.source_derived, true, `${label} must come from the actual source-derived adapter`);
  assert.equal(capture?.origin?.kind, "source-derived-host-observer", `${label} must retain source-derived host provenance`);
  assert.equal(capture?.capture?.complete, true, `${label} source-derived capture must be complete`);
  assert.equal(capture?.task_calls?.length, 1, `${label} must retain exactly one Root task dispatch`);
  const [call] = capture.task_calls;
  assert.equal(call.kind, "dispatch", `${label} Root task call must be a dispatch`);
  assert.equal(call.item_count, 1, `${label} Root task dispatch must contain one assignment`);
  assert.equal(call.has_solution_space, true, `${label} Root task dispatch must retain solutionSpace`);
  assert.equal(call.assignments?.length, 1, `${label} Root task dispatch must retain one assignment record`);
  const [observed] = call.assignments;
  assert.equal(observed.name, expected.name, `${label} Root task name must match the approved definition`);
  assert.equal(observed.agent, expected.agent, `${label} Root task agent must match the approved definition`);
  const expectedTaskSha256 = sha256Bytes(Buffer.from(expected.task, "utf8"));
  const expectedSolutionSpaceSha256 = sha256Bytes(Buffer.from(expected.solutionSpace, "utf8"));
  assert.equal(observed.raw_task_sha256, expectedTaskSha256, `${label} Root task must carry the exact approved task bytes`);
  assert.equal(observed.task_sha256, expectedTaskSha256, `${label} Root task hash must match the approved task bytes`);
  assert.equal(observed.solution_space_sha256, expectedSolutionSpaceSha256, `${label} Root solutionSpace must carry the exact approved bytes`);
}

function prepareRetryInstalledPackage(root, label) {
  const installedPackageRoot = path.join(root, label);
  fs.mkdirSync(installedPackageRoot, { recursive: true });
  const installedFile = path.join(installedPackageRoot, "package.bin");
  fs.writeFileSync(installedFile, "caller-boundary-installed-package\n", "utf8");
  fs.writeFileSync(
    path.join(installedPackageRoot, "package-manifest.json"),
    JSON.stringify([{
      destination: "package.bin",
      bytes: fs.statSync(installedFile).size,
      sha256: sha256File(installedFile),
    }]),
    "utf8",
  );
  return installedPackageRoot;
}

async function native10CallerRejectsNonCanonicalAssignments(lifecycle, root) {
  const project = path.join(root, "native10-caller-boundary-rejections");
  fs.mkdirSync(path.join(project, ".omp", "state"), { recursive: true });
  const fixture = { project, logicalRunId: "native10-caller-boundary-rejections-run" };
  const revision = "a".repeat(64);
  const prompt = lifecycle.buildNativePrompt(
    fixture,
    revision,
    { evidenceSha256: "b".repeat(64), contextDigest: "c".repeat(64) },
  );
  const canonicalAssignments = canonicalAssignmentsFromPrompt(prompt, lifecycle.NATIVE10_ASSIGNMENTS, "Native10 strict caller");
  const variants = [
    {
      label: "names-only",
      assignments: canonicalAssignments.map(({ name, agent }) => ({ name, agent })),
    },
    {
      label: "missing-task",
      assignments: canonicalAssignments.map(({ task, ...assignment }) => assignment),
    },
    {
      label: "missing-solution-space",
      assignments: canonicalAssignments.map(({ solutionSpace, ...assignment }) => assignment),
    },
    {
      label: "drifted-task",
      assignments: canonicalAssignments.map((assignment, index) => index === 0 ? { ...assignment, task: `${assignment.task}\ncaller drift` } : assignment),
    },
    {
      label: "drifted-solution-space",
      assignments: canonicalAssignments.map((assignment, index) => index === 0 ? { ...assignment, solutionSpace: `${assignment.solutionSpace} caller drift` } : assignment),
    },
  ];
  const violations = [];
  for (const variant of variants) {
    const captures = [];
    const restore = installRootStartBoundaryTransport(lifecycle, captures);
    let observation;
    try {
      observation = await lifecycle.runNative(
        { native: true, omp: "offline-caller-transport", timeoutMs: 1_000 },
        fixture,
        revision,
        variant.assignments,
        `native10-caller-boundary-reject-${variant.label}`,
        prompt,
      );
    } finally {
      restore();
    }
    const capture = captures[0];
    if (captures.length !== 1) violations.push(`${variant.label}: Native10 caller did not allocate exactly one session`);
    if (!capture || capture.accepted !== false) violations.push(`${variant.label}: non-canonical assignment was admitted`);
    if (!capture?.error || capture.error.kind !== "BLOCKED") violations.push(`${variant.label}: refusal was not a BLOCKED constructor/session boundary`);
    if ((capture?.session?.evidence?.task_calls?.length ?? 0) !== 0) violations.push(`${variant.label}: refused assignment retained a Root dispatch`);
    if (observation?.status !== "PENDING") violations.push(`${variant.label}: refusal did not return the bounded failed Native observation`);
  }
  assert.deepEqual(violations, [], "Native10 caller must fail closed for names-only, missing task/solutionSpace, and drifted assignments against a canonical prompt");
}


function bindBoundaryRoot(session, label) {
  const stateRequestId = `state|caller-boundary|${label}|${randomUUID()}`;
  const promptRequestId = `prompt|caller-boundary|${label}|${randomUUID()}`;
  session.bindSourceHost(
    {
      type: "response",
      command: "get_state",
      success: true,
      id: stateRequestId,
      data: { sessionId: `root-session|caller-boundary|${label}|${randomUUID()}` },
    },
    stateRequestId,
    promptRequestId,
  );
}

function rootDispatchStart(toolCallId, items, label) {
  return {
    type: "tool_execution_start",
    toolName: "task",
    toolCallId,
    args: {
      context: `Caller-boundary transport for ${label}.`,
      tasks: items,
    },
  };
}

function boundaryStopError() {
  const error = new Error("caller boundary stop after Root task START");
  error.code = "CALLER_BOUNDARY_STOP";
  return error;
}

function installRootStartBoundaryTransport(lifecycle, captures) {
  const prototype = lifecycle.NativeRpcSession.prototype;
  const originalExecute = prototype.execute;
  let ordinal = 0;
  prototype.execute = async function callerBoundaryExecute(prompt) {
    const label = this.label;
    const configured = [...this.assignments.values()].map((assignment) => structuredClone(assignment));
    const capture = { label, configured, prompt, session: this, items: [], error: null, accepted: false };
    try {
      capture.items = callerRootItemsFromPrompt(prompt, configured, label);
      bindBoundaryRoot(this, `${label}|${ordinal += 1}`);
      this.recordTool(rootDispatchStart(`task|caller-boundary|${label}|${ordinal}`, capture.items, label));
      capture.accepted = true;
    } catch (error) {
      capture.error = error;
    }
    captures.push(capture);
    throw boundaryStopError();
  };
  return () => {
    prototype.execute = originalExecute;
  };
}

function assertCallerAssignmentMutationsRemainBlocked(lifecycle, root, canonicalItem, label) {
  for (const field of ["task", "solutionSpace"]) {
    const session = makeReadSession(lifecycle, root, `${label}-${field}`, [canonicalItem]);
    const mutated = {
      ...canonicalItem,
      [field]: `${canonicalItem[field]} (mutated by caller)`,
    };
    const error = captureBlockedTool(
      () => session.recordTool(rootDispatchStart(`task|caller-boundary|${label}|mutated|${field}`, [mutated], label)),
      `${label} mutated ${field}`,
    );
    assert.equal(error.kind, "BLOCKED", `${label} mutated ${field} must remain BLOCKED`);
    assert.equal(session.evidence.task_calls.length, 0, `${label} mutated ${field} must not retain a Root dispatch`);
  }
}

async function native10CallerCanonicalRootAdmission(lifecycle, root) {
  const project = path.join(root, "native10-caller-boundary");
  fs.mkdirSync(path.join(project, ".omp", "state"), { recursive: true });
  const fixture = { project, logicalRunId: "native10-caller-boundary-run" };
  const revision = "a".repeat(64);
  const prompt = lifecycle.buildNativePrompt(
    fixture,
    revision,
    { evidenceSha256: "b".repeat(64), contextDigest: "c".repeat(64) },
  );
  const assignments = canonicalAssignmentsFromPrompt(prompt, lifecycle.NATIVE10_ASSIGNMENTS, "Native10 canonical caller");
  const captures = [];
  const restore = installRootStartBoundaryTransport(lifecycle, captures);
  try {
    await lifecycle.runNative(
      { native: true, omp: "offline-caller-transport", timeoutMs: 1_000 },
      fixture,
      revision,
      assignments,
      "native10-caller-boundary",
      prompt,
    );
  } finally {
    restore();
  }
  assert.equal(captures.length, 1, "Native10 caller must allocate one real session for its integrated Root prompt");
  const capture = captures[0];
  assert.equal(capture.error, null, "the actual Native10 caller prompt must be admitted by the constructor-approved Root assignment set");
  assert.equal(capture.accepted, true, "the actual Native10 caller Root task START must be admitted");
  assert.equal(capture.items.length, assignments.length, "Native10 caller must dispatch every applicable assignment once");
  assert.equal(capture.session.evidence.task_calls.length, 1, "Native10 caller admission must retain one actual Root task START");
  assert.deepEqual(
    capture.session.evidence.task_calls[0].assignments.map((item) => item.name),
    assignments.map((item) => item.name),
    "Native10 Root admission must retain the actual caller assignment names",
  );
  assert.deepEqual(
    capture.session.evidence.task_calls[0].assignments.map((item) => item.task_sha256),
    capture.items.map((item) => sha256Bytes(Buffer.from(item.task, "utf8"))),
    "Native10 Root admission must hash the actual prompt task values through the real session",
  );
  assertCallerAssignmentMutationsRemainBlocked(lifecycle, project, capture.items[0], "native10-caller-boundary");
}

function retryNestedEvent(childId, item, event) {
  return {
    type: "subagent_event",
    payload: {
      id: childId,
      agent: item.agent,
      agentSource: "project",
      event,
    },
  };
}

function retryLifecycleStart(childId, item, rootToolCallId) {
  return {
    type: "subagent_lifecycle",
    payload: {
      id: childId,
      index: 0,
      agent: item.agent,
      agentSource: "project",
      parentToolCallId: rootToolCallId,
      status: "started",
    },
  };
}

function retryReport(definition, attempt) {
  const failure = attempt === 1;
  const subjectSha256 = sha256File(definition.paths.subject);
  const originalSubjectSha256 = definition.mutable_application?.before_hashes?.subject?.sha256 ?? null;
  return {
    schema_version: 1,
    status: failure ? "FAIL" : "PASSOU",
    code: failure ? "ASSERTION_EXPECTED_REJECTION" : "ASSERTION_EXPECTED_REJECTION_OBSERVED",
    ...(failure ? { failure_origin: "SOLUTION", origin: "SOLUTION" } : {}),
    nonce: definition.nonce,
    assignment_id: definition.assignment_id,
    revision: definition.revision,
    run_id: definition.run_id,
    workload: {
      run_id: definition.run_id,
      source: definition.workload.source,
      revision: definition.revision,
      test: definition.workload.test,
    },
    actual: {
      attempt,
      observed: failure ? "original behavior" : "repaired behavior",
      subject_sha256: subjectSha256,
    },
    expected: {
      attempt,
      observed: "strict positional arity",
      subject_sha256: originalSubjectSha256,
    },
    subject: {
      path: definition.paths.subject_relative,
      sha256: subjectSha256,
      original_sha256: originalSubjectSha256,
      changed: originalSubjectSha256 !== null && subjectSha256 !== originalSubjectSha256,
    },
  };
}

function retryBackendCommandEvents(session, childId, item, definition, attempt) {
  const command = "node app/.omp/state/native-tooling/retry-check.mjs";
  const toolCallId = `bash|caller-boundary|repair-${attempt}|${randomUUID()}`;
  const exitCode = attempt === 1 ? 17 : 0;
  const report = retryReport(definition, attempt);
  const event = (phase) => ({
    type: `tool_execution_${phase}`,
    toolName: "bash",
    toolCallId,
    args: { command },
    assignment_id: item.name,
    run_id: definition.run_id,
    revision: definition.revision,
    ...(phase === "end" ? {
      isError: exitCode !== 0,
      exitCode,
      result: {
        content: [{ type: "text", text: `${JSON.stringify(report)}${footerFor(exitCode)}` }],
        details: { exitCode },
      },
    } : {}),
  });
  session.consumeLogical(retryNestedEvent(childId, item, event("start")));
  session.consumeLogical(retryNestedEvent(childId, item, event("end")));
}

function retryTaskResult(definition, item, childId, phase, peerReview = null) {
  const failed = phase === "first";
  return {
    id: childId,
    index: 0,
    agent: item.agent,
    agentSource: "project",
    status: "completed",
    exitCode: 0,
    isError: false,
    output: failed ? "bounded validator completed after an expected solution failure" : "bounded completed role output",
    assignment: item.task,
    run_id: definition.run_id,
    ...(peerReview ? {
      structuredOutput: { source: "agent", mode: "permissive", status: "valid", data: peerReview },
    } : {}),
  };
}

function retryRootProgress(rootToolCallId, item, childId) {
  return {
    type: "tool_execution_update",
    toolName: "task",
    toolCallId: rootToolCallId,
    result: {
      details: {
        progress: [{
          id: childId,
          index: 0,
          agent: item.agent,
          agentSource: "project",
          assignment: item.task,
        }],
      },
    },
  };
}

function retryRootEnd(rootToolCallId, item, childId, definition, phase, peerReview = null) {
  const result = retryTaskResult(definition, item, childId, phase, peerReview);
  return {
    type: "tool_execution_end",
    toolName: "task",
    toolCallId: rootToolCallId,
    isError: false,
    result: {
      details: { results: [result] },
    },
  };
}

function retryValidatorEvents(session, childId, item, definition, phase, report) {
  const command = "node app/.omp/state/native-tooling/retry-check.mjs";
  const toolCallId = `bash|caller-boundary|${phase}|${randomUUID()}`;
  const exitCode = phase === "first" ? 17 : 0;
  const footer = footerFor(exitCode);
  session.consumeLogical(retryNestedEvent(childId, item, {
    type: "tool_execution_start",
    toolName: "bash",
    toolCallId,
    args: { command },
  }));
  session.consumeLogical(retryNestedEvent(childId, item, {
    type: "tool_execution_update",
    toolName: "bash",
    toolCallId,
    partialResult: { status: "PARTIAL" },
  }));
  session.consumeLogical(retryNestedEvent(childId, item, {
    type: "tool_execution_end",
    toolName: "bash",
    toolCallId,
    isError: exitCode !== 0,
    exitCode,
    result: {
      content: [{ type: "text", text: `${JSON.stringify(report)}${footer}` }],
      ...(exitCode !== 0 ? { details: { exitCode } } : {}),
    },
  }));
}

function retryRepairEvents(session, childId, item, definition) {
  retryBackendCommandEvents(session, childId, item, definition, 1);
  const subject = fs.readFileSync(definition.paths.subject, "utf8");
  const repaired = `${subject}\n// bounded caller repair fixture\n`;
  fs.writeFileSync(definition.paths.subject, repaired, "utf8");
  const toolCallId = `write|caller-boundary|repair|${randomUUID()}`;
  const relativePath = definition.paths.subject_relative;
  session.consumeLogical(retryNestedEvent(childId, item, {
    type: "tool_execution_start",
    toolName: "write",
    toolCallId,
    args: { path: relativePath, content: repaired },
  }));
  session.consumeLogical(retryNestedEvent(childId, item, {
    type: "tool_execution_update",
    toolName: "write",
    toolCallId,
    args: { path: relativePath },
    partialResult: { details: { resolvedPath: relativePath } },
  }));
  session.consumeLogical(retryNestedEvent(childId, item, {
    type: "tool_execution_end",
    toolName: "write",
    toolCallId,
    isError: false,
    result: { details: { resolvedPath: relativePath } },
  }));
  retryBackendCommandEvents(session, childId, item, definition, 2);
}

function retryPeerEvents(session, childId, item, definition) {
  const toolCallId = `read|caller-boundary|peer|${randomUUID()}`;
  const relativePath = definition.paths.subject_relative;
  session.consumeLogical(retryNestedEvent(childId, item, {
    type: "tool_execution_start",
    toolName: "read",
    toolCallId,
    args: { path: relativePath },
  }));
  session.consumeLogical(retryNestedEvent(childId, item, {
    type: "tool_execution_end",
    toolName: "read",
    toolCallId,
    isError: false,
    result: {
      content: [{ type: "text", text: fs.readFileSync(definition.paths.subject, "utf8") }],
      details: { resolvedPath: relativePath },
    },
  }));
}

function installRetryCallerTransport(lifecycle, definition, captures) {
  const prototype = lifecycle.NativeRpcSession.prototype;
  const originalExecute = prototype.execute;
  let ordinal = 0;
  prototype.execute = async function retryCallerTransport(prompt) {
    const label = this.label;
    const configured = [...this.assignments.values()].map((assignment) => structuredClone(assignment));
    const capture = { label, configured, prompt, session: this, items: [], error: null, accepted: false, phase: null };
    try {
      capture.items = callerRootItemsFromPrompt(prompt, configured, label);
      capture.phase = label.endsWith("-first")
        ? "first"
        : label.endsWith("-repair")
          ? "repair"
          : label.endsWith("-peer-review")
            ? "peer"
            : label.endsWith("-second")
              ? "second"
              : "unknown";
      bindBoundaryRoot(this, `${label}|${ordinal += 1}`);
      const rootToolCallId = `task|caller-boundary|${label}|${ordinal}`;
      const item = capture.items[0];
      this.recordTool(rootDispatchStart(rootToolCallId, capture.items, label));
      capture.accepted = true;
      const childId = `allocated|caller-boundary|${label}|${ordinal}`;
      this.recordTool(retryRootProgress(rootToolCallId, item, childId));
      this.consumeLogical(retryLifecycleStart(childId, item, rootToolCallId));
      const peerReview = capture.phase === "peer"
        ? {
          protocol_mode: "TDD_PEER_REVIEW",
          agent: "peer-reviewer",
          status: "APROVADO",
          reviewed_revision: definition.revision,
          explanation: "The repaired private subject was read through the caller-boundary transport.",
          confidence: 0.99,
          overall_correctness: "correct",
          findings: [],
        }
        : null;
      if (capture.phase === "repair") retryRepairEvents(this, childId, item, definition);
      if (capture.phase === "peer") retryPeerEvents(this, childId, item, definition);
      if (capture.phase === "first" || capture.phase === "second") {
        retryValidatorEvents(this, childId, item, definition, capture.phase, retryReport(definition, capture.phase === "first" ? 1 : 2));
      }
      this.recordTool(retryRootEnd(rootToolCallId, item, childId, definition, capture.phase, peerReview));
      capture.peerReview = peerReview;
    } catch (error) {
      capture.error = error;
    }
    const evidence = this.evidence;
    captures.push(capture);
    if (capture.error) throw boundaryStopError();
    return {
      ...evidence,
      label,
      logical_run_id: this.logicalRunId,
      native_process_count: 1,
      origin: { kind: "caller-boundary-rpc-transport", source: "test-rpc-transport", process_observed: false, native_rpc: true, source_binding: true, process_count: 1 },
      root_session: evidence.root_session,
      root_prompt: evidence.root_prompt,
      root_task_ends: evidence.root_task_ends,
      task_calls: evidence.task_calls,
      task_records: evidence.task_records,
      command_results: evidence.command_results,
      terminal: {
        prompt_result: { status: "completed", agentInvoked: true, sessionSettled: true },
        agent_end: { isTerminal: true, awaitingAsyncWork: false },
        session_settled: true,
      },
      capture: { ...evidence.capture, complete: true },
      ...(capture.peerReview ? {
        source_peer_review: capture.peerReview,
        source_peer_subject_binding: {
          source: "CALLER_BOUNDARY_PRIVATE_BYTE_BINDING",
          path: definition.paths.subject_relative,
          sha256: sha256File(definition.paths.subject),
          revision: definition.revision,
          independent: true,
        },
      } : {}),
    };
  };
  return () => {
    prototype.execute = originalExecute;
  };
}

async function native09CallerCanonicalRootAdmission(lifecycle, retryApi, root, retryDefinition) {
  const definition = retryDefinition;
  assert.ok(definition && typeof definition === "object", "Native09 caller regression requires the actual prepared technical-retry definition");
  const installedPackageRoot = prepareRetryInstalledPackage(root, "native09-installed-package");
  const captures = [];
  const restore = installRetryCallerTransport(lifecycle, definition, captures);
  let executionApi;
  try {
    executionApi = await import(`${pathToFileURL(path.resolve(SOURCE_DIR, "../../tdd-orchestrator/lib/execution.mjs")).href}?caller_boundary=${randomUUID()}`);
    await lifecycle.runNativeTechnicalRetry(
      {
        native: true,
        source: path.resolve(SOURCE_DIR, "../.."),
        installedPackageRoot,
        timeoutMs: 1_000,
      },
      { project: definition.cwd, logicalRunId: definition.run_id, retryDefinition: definition },
      retryApi,
      { definition },
      executionApi,
    );
  } finally {
    restore();
  }
  assert.equal(captures.length, 4, "Native09 caller orchestration must reach first, repair, peer, and second through the actual executeNativeCapture caller");
  assert.deepEqual(
    captures.map((capture) => capture.phase),
    ["first", "repair", "peer", "second"],
    "Native09 caller orchestration must preserve the four actual retry roles in order",
  );
  assert.equal(captures.every((capture) => capture.error === null && capture.accepted === true), true, "every Native09 caller Root task START must be admitted by the real constructor-approved session");
  assert.equal(captures.every((capture) => capture.session.evidence.task_calls.length === 1), true, "each Native09 caller must retain one actual Root task START");
  assert.notEqual(
    captures[0].items[0].name,
    captures[3].items[0].name,
    "first and second validator dispatch names must be distinct when the pinned transport can expose task.name as its public job identity",
  );
  assert.equal(captures[0].items[0].agent, "validator", "first retry caller must dispatch validator");
  assert.equal(captures[1].items[0].agent, "backend-developer", "repair retry caller must dispatch backend-developer");
  assert.equal(captures[2].items[0].agent, "peer-reviewer", "peer retry caller must dispatch peer-reviewer");
  assert.equal(captures[3].items[0].agent, "validator", "second retry caller must dispatch validator");
  assert.equal(captures[2].peerReview?.protocol_mode, "TDD_PEER_REVIEW", "peer retry caller must preserve the structured TDD peer wire");
}
async function native09SourceDerivedCanonicalRetry(lifecycle, retryApi, root, retryPreparation) {
  const sourceProject = path.join(root, "technical-retry-source-derived-project");
  fs.mkdirSync(sourceProject, { recursive: true });
  const definition = retryApi.prepareTechnicalRetryScenario({
    ...retryPreparation.context,
    projectRoot: sourceProject,
    runId: `${retryPreparation.context.runId}-source-derived`,
    assignmentId: `${retryPreparation.context.assignmentId}-source-derived`,
    nonce: randomUUID(),
  });
  const installedPackageRoot = prepareRetryInstalledPackage(root, "native09-source-derived-installed-package");
  const executionApi = await import(`${pathToFileURL(path.resolve(SOURCE_DIR, "../../tdd-orchestrator/lib/execution.mjs")).href}?source_derived_caller_boundary=${randomUUID()}`);
  const result = await lifecycle.runNativeTechnicalRetry(
    {
      native: false,
      source: path.resolve(SOURCE_DIR, "../.."),
      installedPackageRoot,
      timeoutMs: 1_000,
      captureProvider: lifecycle.sourceDerivedCaptureProvider,
    },
    { project: definition.cwd, logicalRunId: definition.run_id, retryDefinition: definition },
    retryApi,
    { definition },
    executionApi,
  );
  assert.deepEqual(
    Object.keys(result?.captures ?? {}).sort(),
    ["first", "peer", "repair", "second"],
    "source-derived technical retry must reach first, repair, peer, and second through the actual runNativeTechnicalRetry flow: " + JSON.stringify({ status: result?.status, reason: result?.reason, capture_failure: result?.capture?.failure?.message ?? result?.captures?.repair?.failure?.message ?? null, guard_reason: result?.capture?.failure?.operational_guard?.reason_code ?? result?.captures?.repair?.failure?.operational_guard?.reason_code ?? null, first_failures: result?.first?.first?.check?.failures ?? null }),
  );
  assert.equal(result?.result?.first?.eligible, true, "source-derived first validator must remain an eligible solution/behavior failure");
  assert.equal(result?.result?.first?.check?.ok, true, "source-derived first validator must satisfy the approved terminal contract");
  assert.equal(result?.result?.second?.eligible, true, "source-derived second validator must reach the eligible next-stage terminal");
  assert.equal(result?.result?.second?.check?.ok, true, "source-derived second validator must satisfy the approved terminal contract");
  const peerTask = retryApi.buildPeerTask(definition, sha256File(definition.paths.subject)).task;
  const expectedByPhase = [
    ["first", definition.tasks.first_validator],
    ["repair", definition.tasks.backend_repair],
    ["peer", peerTask],
    ["second", definition.tasks.second_validator],
  ];
  for (const [phase, expected] of expectedByPhase) {
    assertSourceDerivedCanonicalAssignment(result.captures[phase], expected, `source-derived ${phase}`);
  }
  assert.equal(result.captures.peer.source_peer_review?.protocol_mode, "TDD_PEER_REVIEW", "source-derived peer stage must preserve the approved TDD peer-review wire");
  const repairCapture = result.captures.repair;
  const repairWrite = (repairCapture?.subagent_writes ?? []).find((item) => item?.phase === "end");
  assert.ok(repairWrite, "source-derived repair must retain its completed write evidence");
  assert.equal(repairWrite.role_source, "observed-root-dispatch-lifecycle", "source-derived repair write must retain the Root-derived role source");
  const observedBinding = repairWrite.identity?.observed_binding;
  assert.ok(observedBinding && typeof observedBinding === "object", "source-derived repair write must retain the observed Root binding bridge");
  const repairAssignment = repairCapture.task_calls?.[0]?.assignments?.[0];
  for (const [key, expected] of [
    ["root_session_id", repairCapture.root_session?.session_id],
    ["parent_tool_call_id", repairCapture.task_calls?.[0]?.tool_call_id],
    ["allocated_id", repairWrite.allocated_id],
    ["index", repairWrite.index],
    ["agent", repairWrite.role],
    ["agentSource", repairAssignment?.agentSource ?? "project"],
    ["assignment_id", repairAssignment?.name],
  ]) {
    assert.equal(observedBinding[key], expected, `source-derived repair Root binding must retain tuple field ${key}`);
  }

}
function sourceDerivedRetryWaitCapture(lifecycle, {
  fixture,
  assignments,
  label,
  definition,
  base,
  mutation = null,
}) {
  const assignment = assignments[0];
  if (!assignment || typeof assignment !== "object") throw new ProbeSetupError("source-derived wait capture received no backend assignment");
  const beforeProgram = base?.source_program?.before;
  const afterProgram = base?.source_program?.after;
  if (!beforeProgram || !afterProgram) throw new ProbeSetupError("source-derived wait capture did not retain both real repair CLI programs");
  const session = new lifecycle.NativeRpcSession({
    omp: process.execPath,
    cwd: definition.cwd,
    readRoot: definition.cwd,
    timeoutMs: 30_000,
    assignments,
    logicalRunId: definition.run_id,
    label,
  });
  const rootSessionId = `source-derived-wait-host:${randomUUID()}`;
  const stateRequestId = `source-derived-wait-state:${randomUUID()}`;
  const promptRequestId = `source-derived-wait-prompt:${randomUUID()}`;
  const rootToolCallId = `fullcall_wait_root_${randomUUID()}|fc_wait_root_${randomUUID()}`;
  const allocatedId = `allocated_wait_child_${randomUUID()}|fc_wait_child_${randomUUID()}`;
  const rawJobId = `source-derived-transport-job:${randomUUID()}`;
  const stateResponse = {
    type: "response",
    command: "get_state",
    success: true,
    id: stateRequestId,
    data: { sessionId: rootSessionId },
  };
  const finish = (error = null) => {
    const observed = error ? lifecycle.failedNativeObservation(session, error) : session.evidence;
    return {
      ...observed,
      source_derived: true,
      native: false,
      evidence_level: "SOURCE_DERIVED_HOST_ADAPTER",
      native_process_count: 0,
      origin: {
        kind: "source-derived-host-observer",
        source: "source-faithful-wire",
        process_observed: false,
        native_rpc: false,
        source_binding: true,
        process_count: 0,
      },
      source_attempt: 1,
      source_program: base.source_program,
    };
  };
  const nested = (event) => session.consumeLogical({
    type: "subagent_event",
    payload: {
      id: allocatedId,
      agent: assignment.agent,
      agentSource: "project",
      event,
    },
  });
  const appendValidatorCommand = (program, toolCallId) => {
    const exitCode = Number.isInteger(program.status) ? program.status : null;
    const isError = program.is_error === true || (Number.isInteger(exitCode) && exitCode !== 0);
    const footer = Number.isInteger(exitCode) && exitCode !== 0
      ? `\n\nCommand exited with code ${exitCode}`
      : "\n\nWall time: 0.00 seconds";
    const text = `${String(program.stdout ?? "")}${footer}`;
    nested({
      type: "tool_execution_start",
      toolName: "bash",
      toolCallId,
      args: { command: "node app/.omp/state/native-tooling/retry-check.mjs" },
    });
    nested({
      type: "tool_execution_update",
      toolName: "bash",
      toolCallId,
      partialResult: { status: "PARTIAL" },
    });
    nested({
      type: "tool_execution_end",
      toolName: "bash",
      toolCallId,
      isError,
      ...(Number.isInteger(exitCode) ? { exitCode } : {}),
      result: {
        content: [{ type: "text", text }],
        ...(Number.isInteger(exitCode) ? { details: { exitCode } } : {}),
      },
    });
  };
  try {
    session.bindSourceHost(stateResponse, stateRequestId, promptRequestId);
    session.consumeLogical({
      type: "tool_execution_start",
      toolName: "task",
      toolCallId: rootToolCallId,
      args: {
        context: "Bounded source-derived private technical retry observation using the actual wait terminal.",
        tasks: [structuredClone(assignment)],
      },
    });
    session.consumeLogical({
      type: "subagent_lifecycle",
      payload: {
        id: allocatedId,
        index: 0,
        agent: assignment.agent,
        agentSource: "project",
        parentToolCallId: rootToolCallId,
        status: "started",
      },
    });
    appendValidatorCommand(beforeProgram, `fullcall_wait_validator_before_${randomUUID()}|fc_wait_validator_before_${randomUUID()}`);
    const content = fs.readFileSync(definition.paths.subject, "utf8");
    const writeToolCallId = `fullcall_wait_write_${randomUUID()}|fc_wait_write_${randomUUID()}`;
    const writePath = definition.paths.subject_relative;
    nested({
      type: "tool_execution_start",
      toolName: "write",
      toolCallId: writeToolCallId,
      args: { path: writePath, content },
    });
    nested({
      type: "tool_execution_update",
      toolName: "write",
      toolCallId: writeToolCallId,
      args: { path: writePath },
      partialResult: { details: { resolvedPath: writePath } },
    });
    nested({
      type: "tool_execution_end",
      toolName: "write",
      toolCallId: writeToolCallId,
      isError: false,
      result: { details: { resolvedPath: writePath } },
    });
    appendValidatorCommand(afterProgram, `fullcall_wait_validator_after_${randomUUID()}|fc_wait_validator_after_${randomUUID()}`);
    const taskProgress = {
      index: 0,
      id: allocatedId,
      agent: assignment.agent,
      agentSource: "project",
      status: "running",
      task: assignment.task,
      assignment: assignment.name,
      recentTools: [],
      recentOutput: [],
      toolCount: 0,
      requests: 0,
      tokens: 0,
      cost: 0,
      durationMs: 0,
    };
    const rootAsync = { state: "running", jobId: rawJobId, type: "task" };
    session.consumeLogical({
      type: "tool_execution_end",
      toolName: "task",
      toolCallId: rootToolCallId,
      isError: false,
      result: { details: { results: [], progress: [taskProgress], async: rootAsync } },
    });
    session.consumeLogical({
      type: "tool_execution_update",
      toolName: "task",
      toolCallId: rootToolCallId,
      partialResult: { details: { results: [], progress: [taskProgress], async: rootAsync } },
    });
    session.consumeLogical({
      type: "prompt_result",
      id: promptRequestId,
      status: "completed",
      agentInvoked: true,
      sessionSettled: false,
    });
    session.consumeLogical({ type: "agent_end", isTerminal: false, awaitingAsyncWork: true, yielded: true });
    if (mutation !== "missing") {
      session.consumeLogical({
        type: "subagent_lifecycle",
        payload: {
          id: allocatedId,
          index: 0,
          agent: assignment.agent,
          agentSource: "project",
          parentToolCallId: rootToolCallId,
          status: "completed",
        },
      });
    }
    const waitToolCallId = `fullcall_wait_${randomUUID()}|fc_wait_${randomUUID()}`;
    const waitJob = {
      id: rawJobId,
      type: "task",
      status: "completed",
      label: assignment.name,
      agentUrlId: allocatedId,
      structured: { source: "none", mode: "permissive", status: "unavailable" },
    };
    if (mutation === "foreign") waitJob.agentUrlId = `${allocatedId}:foreign`;
    if (mutation === "mismatch") waitJob.id = `${rawJobId}:mismatch`;
    session.consumeLogical({
      type: "tool_execution_start",
      toolName: "wait",
      toolCallId: waitToolCallId,
    });
    session.consumeLogical({
      type: "tool_execution_end",
      toolName: "wait",
      toolCallId: waitToolCallId,
      isError: false,
      result: { details: { op: "wait", jobs: [waitJob] } },
    });
    session.consumeLogical({ type: "session_settled" });
    session.consumeLogical({ type: "agent_end", isTerminal: true, awaitingAsyncWork: false });
    return finish();
  } catch (error) {
    return finish(error);
  }
}

async function native09SourceDerivedWaitBindingCausalRegression(lifecycle, retryApi, root, retryPreparation) {
  const executionApi = await import(`${pathToFileURL(path.resolve(SOURCE_DIR, "../../tdd-orchestrator/lib/execution.mjs")).href}?wait_binding_regression=${randomUUID()}`);
  const runScenario = async (variant) => {
    const sourceProject = path.join(root, `technical-retry-wait-${variant}-${randomUUID()}`);
    fs.mkdirSync(sourceProject, { recursive: true });
    const definition = retryApi.prepareTechnicalRetryScenario({
      ...retryPreparation.context,
      projectRoot: sourceProject,
      runId: `${retryPreparation.context.runId}-wait-${variant}-${randomUUID()}`,
      assignmentId: `${retryPreparation.context.assignmentId}-wait-${variant}`,
      nonce: randomUUID(),
    });
    const installedPackageRoot = prepareRetryInstalledPackage(root, `native09-wait-${variant}-${randomUUID()}`);
    const captureProvider = ({ fixture, assignments, label, rootWritePolicy }) => {
      const base = lifecycle.sourceDerivedCaptureProvider({ fixture, assignments, label, rootWritePolicy });
      if (!label.endsWith("-repair")) return base;
      return sourceDerivedRetryWaitCapture(lifecycle, { fixture, assignments, label, definition, base, mutation: variant === "valid" ? null : variant });
    };
    return lifecycle.runNativeTechnicalRetry(
      {
        native: false,
        source: path.resolve(SOURCE_DIR, "../.."),
        installedPackageRoot,
        timeoutMs: 1_000,
        captureProvider,
      },
      { project: definition.cwd, logicalRunId: definition.run_id, retryDefinition: definition },
      retryApi,
      { definition },
      executionApi,
    );
  };

  for (const variant of ["foreign", "missing", "mismatch"]) {
    const result = await runScenario(variant);
    assert.deepEqual(
      Object.keys(result?.captures ?? {}).sort(),
      ["first", "repair"],
      `${variant} Root wait binding must stop the actual retry consumer before peer/second dispatch`,
    );
    assert.equal(
      (result?.captures?.repair?.task_records ?? []).some((record) => record?.source_kind === "task_wait_result"),
      false,
      `${variant} Root wait binding must not publish an authoritative wait record`,
    );
    assert.notEqual(result?.repair?.writes_observed, true, `${variant} Root wait binding must not copy the successful write as authority`);
    assert.deepEqual(result?.repair?.writes ?? [], [], `${variant} Root wait binding must retain no accepted repair write`);
    assert.equal(result?.captures?.peer, undefined, `${variant} Root wait binding must not dispatch peer review`);
    assert.equal(result?.captures?.second, undefined, `${variant} Root wait binding must not dispatch the second validator`);
  }

  const result = await runScenario("valid");
  assert.deepEqual(
    Object.keys(result?.captures ?? {}).sort(),
    ["first", "peer", "repair", "second"],
    "source-derived wait retry must complete the real first/repair/peer/second composition",
  );
  assert.equal(result?.captures?.repair?.source_derived, true, "source-derived wait retry must retain source-derived provenance");
  assert.equal(result?.captures?.repair?.native, false, "source-derived wait retry must remain non-Native");
  assert.equal(result?.captures?.repair?.origin?.native_rpc, false, "source-derived wait retry must not claim SDK RPC observation");
  assert.equal(result?.captures?.repair?.native_process_count, 0, "source-derived wait retry must retain zero native processes");
  assert.equal(result?.captures?.first?.source_program?.report?.status, "FAIL", "private source CLI first validator must preserve its actual FAIL report");
  assert.equal(result?.captures?.repair?.source_program?.before?.report?.status, "FAIL", "private source CLI repair pre-write run must preserve its actual FAIL report");
  assert.equal(result?.captures?.repair?.source_program?.after?.report?.status, "PASSOU", "private source CLI repair post-write run must preserve its actual PASSOU report");
  assert.equal(result?.captures?.peer?.source_peer_review?.status, "APROVADO", "source-derived peer stage must preserve the actual approved TDD review");
  assert.equal(result?.captures?.second?.source_program?.report?.status, "PASSOU", "private source CLI second validator must preserve its actual PASSOU report");

  const repairCapture = result.captures.repair;
  const repairRecord = (repairCapture.task_records ?? []).find((record) => record?.source_kind === "task_wait_result");
  assert.ok(repairRecord, "backend repair must retain one task_wait_result record from the Root wait terminal");
  const rawJob = repairRecord.wait_result?.job;
  const canonicalJobId = repairRecord.wait_result?.host_binding?.job_id;
  assert.equal(repairRecord.jobId, rawJob?.id, "wait record jobId must retain the raw SDK transport/public alias");
  assert.notEqual(repairRecord.jobId, canonicalJobId, "raw wait jobId must remain distinct from the canonical Root host binding");
  assert.match(canonicalJobId, /^host-derived:job:[a-f0-9]{32}$/i, "Root wait binding must expose a host-derived canonical job identity");
  assert.equal(repairRecord.wait_result?.host_binding?.source, "observed-root-dispatch-lifecycle", "wait authority must retain Root-derived binding provenance");
  const repairWrite = (repairCapture.subagent_writes ?? []).find((item) => item?.phase === "end");
  assert.ok(repairWrite, "backend repair must retain exactly one successful write END");
  assert.equal(repairWrite.job_id, canonicalJobId, "actual write job_id must use the canonical Root host binding");
  assert.equal(repairRecord.independent_evidence?.job_id, canonicalJobId, "backend independent evidence must use the canonical Root host binding");
  assert.equal(repairRecord.independent_evidence?.write?.job_id, canonicalJobId, "backend write proof must use the canonical Root host binding");
  for (const [field, observed] of [["exitCode", "exit_code_observed"], ["isError", "is_error_observed"], ["error", "error_observed"], ["aborted", "aborted_observed"]]) {
    assert.equal(Object.hasOwn(rawJob ?? {}, field), false, `wait SDK job must not invent its absent ${field} flag`);
    assert.equal(repairRecord[field], null, `wait record must retain null for absent child ${field}`);
    assert.equal(repairRecord[observed], false, `wait record must mark absent child ${field} as unobserved`);
  }
  assert.equal(result.result?.repair?.write_binding_valid, true, "technical retry inspection must accept strict write causality only with the canonical Root wait binding");
  assert.equal(result.result?.causal?.ok, true, "technical retry inspection must report valid strict causal evidence");
  assert.deepEqual(result.result?.causal?.failures ?? [], [], "technical retry inspection must report no strict causal failures");
  assert.equal(result.execution?.ok, true, "execution consumer must consume the validated second return");
  assert.equal(result.execution?.status, "PASS", "execution consumer must retain its completed resume status");
}
async function native09RepairBridgeMetadataStopsPeerAndSecond(lifecycle, retryApi, root, retryPreparation) {
  const variants = [
    ["missing-role-source", (write) => { delete write.role_source; }],
    ["forged-role-source", (write) => { write.role_source = "raw-backend-label"; }],
    ["missing-observed-binding", (write) => { delete write.identity.observed_binding; }],
    ["mismatched-observed-binding", (write) => { write.identity.observed_binding.allocated_id = `${write.allocated_id}:foreign`; }],
  ];
  const executionApi = await import(`${pathToFileURL(path.resolve(SOURCE_DIR, "../../tdd-orchestrator/lib/execution.mjs")).href}?bridge_metadata=${randomUUID()}`);
  for (const [variant, mutate] of variants) {
    const sourceProject = path.join(root, `technical-retry-bridge-${variant}`);
    fs.mkdirSync(sourceProject, { recursive: true });
    const definition = retryApi.prepareTechnicalRetryScenario({
      ...retryPreparation.context,
      projectRoot: sourceProject,
      runId: `${retryPreparation.context.runId}-bridge-${variant}`,
      assignmentId: `${retryPreparation.context.assignmentId}-bridge-${variant}`,
      nonce: randomUUID(),
    });
    const installedPackageRoot = prepareRetryInstalledPackage(root, `native09-bridge-${variant}-installed-package`);
    const captureProvider = ({ fixture, assignments, label, rootWritePolicy }) => {
      const capture = lifecycle.sourceDerivedCaptureProvider({ fixture, assignments, label, rootWritePolicy });
      if (label.endsWith("-repair")) {
        const write = (capture.subagent_writes ?? []).find((item) => item?.phase === "end");
        assert.ok(write, `${variant} repair capture must expose the completed write before mutation`);
        assert.equal(write.role, "backend-developer", `${variant} control must retain the backend role label`);
        assert.ok(write.identity?.observed_binding, `${variant} control must start with a Root-observed binding`);
        mutate(write);
        for (const record of capture.task_records ?? []) {
          const proofWrite = record?.independent_evidence?.write;
          if (!proofWrite) continue;
          assert.equal(proofWrite.role, "backend-developer", `${variant} task proof must retain the backend role label`);
          assert.ok(proofWrite.identity?.observed_binding, `${variant} task proof must start with a Root-observed binding`);
          mutate(proofWrite);
        }
      }
      return capture;
    };
    const result = await lifecycle.runNativeTechnicalRetry(
      {
        native: false,
        source: path.resolve(SOURCE_DIR, "../.."),
        installedPackageRoot,
        timeoutMs: 1_000,
        captureProvider,
      },
      { project: definition.cwd, logicalRunId: definition.run_id, retryDefinition: definition },
      retryApi,
      { definition },
      executionApi,
    );
    assert.deepEqual(
      Object.keys(result?.captures ?? {}).sort(),
      ["first", "repair"],
      `${variant} backend bridge metadata must stop the real shared consumer before peer/second dispatch`,
    );
    assert.equal(result?.captures?.peer, undefined, `${variant} must not dispatch the peer reviewer after repair denial`);
    assert.equal(result?.captures?.second, undefined, `${variant} must not dispatch the second validator after repair denial`);
  }
}



function makeAlignmentPolicy(project, helper, label) {
  const intentPath = path.join(project, ".omp", "state", "native-tooling", `alignment-intent-${label}.json`);
  const root = path.join(project, ".omp", "state", "alignment");
  const intentPayload = {
    schema: "alignment-checkpoint-intent/v1",
    checkpoint: "alignment",
    root,
    mode: "local",
    route: "short",
    step: "initial",
    parent: null,
    response: null,
  };
  const command = `"${process.execPath}" "${helper.path}"`;
  return {
    intentPath,
    intentPayload,
    rootCommandPolicy: {
      kind: "alignment-lab-checkpoint-helper-v1",
      command,
      cwd: project,
      executable: { path: process.execPath, sha256: sha256File(process.execPath) },
      script: { path: helper.path, sha256: helper.sha256 },
      intent: { path: intentPath, max_bytes: 16 * 1024 },
    },
  };
}

function prepareAlignment(apis, root) {
  const project = path.join(root, "alignment-success");
  fs.mkdirSync(project, { recursive: true });
  const helper = apis.writeNativeAlignmentHelper(project);
  const policy = makeAlignmentPolicy(project, helper, "machine-report-success");
  let result;
  try {
    result = apis.executeAlignmentHelper(project, policy);
  } catch (error) {
    throw new ProbeSetupError("generated alignment helper did not publish the protected checkpoint", { cause: safeError(error) });
  }
  const producer = producerBody(result.raw_stdout, "generated alignment helper success");
  if (result.result?.code !== "ALIGNMENT_CHECKPOINT_PUBLISHED" || result.result?.status !== "CLOSED" || result.result?.transaction !== true) {
    throw new ProbeSetupError("generated alignment helper returned an unexpected protected-checkpoint result");
  }
  assertRegularFile(result.path, "published alignment checkpoint");
  if (sha256File(result.path) !== result.sha256) throw new ProbeSetupError("published alignment file record digest does not match its actual bytes");
  return { project, helper, policy, result, producer };
}

function prepareAlignmentFailure(apis, root, transactionSource) {
  const project = path.join(root, "alignment-failure");
  fs.mkdirSync(project, { recursive: true });
  copyExact(transactionSource, path.join(project, ".omp", "skills", "tdd-orchestrator", "lib", "fs-transaction", "index.mjs"), "failure-fixture fs-transaction source");
  const helper = apis.writeNativeAlignmentHelper(project);
  const intentPath = path.join(project, ".omp", "state", "native-tooling", "alignment-intent-malformed.json");
  writeFresh(intentPath, "{}\n", "malformed alignment intent");
  const child = spawnSync(process.execPath, [helper.path], {
    cwd: project,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (child.error || child.signal !== null || child.status !== HELPER_FAILURE_EXIT) {
    throw new ProbeSetupError("generated alignment helper failure fixture did not produce its controlled BLOCKED terminal", { child: { status: child.status, signal: child.signal, error: safeError(child.error) } });
  }
  const producer = producerBody(child.stdout, "generated alignment helper failure");
  if (producer.parsed.status !== "BLOCKED" || producer.parsed.code !== "ALIGNMENT_CHECKPOINT_BLOCKED") {
    throw new ProbeSetupError("generated alignment helper failure fixture did not preserve the expected BLOCKED envelope");
  }
  return { project, helper, child, producer };
}

function prepareRetry(apis, options, root) {
  assertRegularFile(options.manifest, "ORIGINAL191 audit manifest");
  const projectRoot = path.join(root, "technical-retry-project");
  fs.mkdirSync(projectRoot, { recursive: true });
  const manifestBefore = sha256File(options.manifest);
  const context = {
    runId: "machine-report-boundary-run",
    assignmentId: "NATIVE09-machine-report-boundary",
    revision: "machine-report-boundary-revision",
    nonce: randomUUID(),
    projectRoot,
    originalSnapshotRoot: options.snapshot,
    originalAuditManifest: options.manifest,
  };
  let definition;
  try {
    definition = apis.prepareTechnicalRetryScenario(context);
  } catch (error) {
    throw new ProbeSetupError("technical retry preparation could not verify and copy the immutable ORIGINAL191 subjects", { cause: safeError(error) });
  }
  if (sha256File(options.manifest) !== manifestBefore) throw new ProbeSetupError("technical retry preparation mutated the original audit manifest");
  if (definition.immutable_original?.verified_before_copy !== true || definition.immutable_original?.file_count !== 191) {
    throw new ProbeSetupError("technical retry preparation did not retain the ORIGINAL191 verification record");
  }
  const child = spawnSync(process.execPath, [definition.paths.validator], {
    cwd: definition.cwd,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (child.error || child.signal !== null || child.status !== RETRY_FAILURE_EXIT) {
    throw new ProbeSetupError("generated technical retry validator did not reproduce the genuine ORIGINAL191 solution failure", { child: { status: child.status, signal: child.signal, error: safeError(child.error) } });
  }
  const producer = producerBody(child.stdout, "generated technical retry validator");
  if (producer.parsed.status !== "FAIL" || producer.parsed.code !== "ASSERTION_EXPECTED_REJECTION" || producer.parsed.failure_origin !== "SOLUTION") {
    throw new ProbeSetupError("generated technical retry validator did not return the expected eligible solution-failure envelope");
  }
  return { context, definition, child, producer, manifestSha256Before: manifestBefore };
}

function readJsonFixture(file, label) {
  assertRegularFile(file, label);
  const bytes = fs.readFileSync(file);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new ProbeSetupError(`${label} is not valid JSON`, { cause: safeError(error) });
  }
  return { path: path.resolve(file), bytes, value };
}

function currentAlignmentSourceSnapshot(source, label) {
  return CURRENT_ALIGNMENT_SOURCE.map((expected) => {
    const file = path.join(source, expected.path);
    assertRegularFile(file, `${label} ${expected.path}`);
    const bytes = fs.readFileSync(file);
    return { path: expected.path, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
  });
}

function prepareCurrentAlignment(options) {
  assertRegularFile(options.alignmentCapture, "current Native alignment capture");
  const captureFile = readJsonFixture(options.alignmentCapture, "current Native alignment capture");
  return {
    captureFile,
    captureSha256Before: sha256Bytes(captureFile.bytes),
    sourceBefore: currentAlignmentSourceSnapshot(options.alignmentSourceRoot, "current alignment source"),
  };
}

function legacyAlignmentCapturePath() {
  const proof = readJsonFixture(LEGACY_ALIGNMENT_BINDING_PROOF, "archived alignment binding proof");
  const capture = proof.value?.alignment_binding?.capture;
  if (!capture || capture.sha256 !== "71eef8be7980585cf7975d3d3fcaff8446c2d091a4432e353b47c9cb92003f37") {
    throw new ProbeSetupError("archived alignment proof does not identify the pinned old-31 capture");
  }
  assertRegularFile(capture.path, "archived old-31 alignment capture");
  return path.resolve(capture.path);
}

function assertPendingAlignment(binding, label) {
  assert.equal(binding?.status, "PENDING", `${label} must fail closed as PENDING`);
  assert.equal(typeof binding?.reason, "string", `${label} must retain a bounded refusal reason`);
}

function assertCurrentAlignmentPass(binding, options, captureFile, label) {
  assert.equal(binding?.status, "PASS", `${label} must accept the pinned current Native capture`);
  assert.equal(binding.capture?.sha256, CURRENT_ALIGNMENT_CAPTURE_SHA256, `${label} must retain the verified current capture digest`);
  assert.equal(binding.capture?.run_id, CURRENT_ALIGNMENT_RUN_ID, `${label} must retain the verified current capture run`);
  assert.equal(binding.capture?.phase, "green", `${label} must retain the green capture phase`);
  assert.equal(binding.capture?.stage, "green_native", `${label} must retain the current green producer stage`);
  assert.equal(binding.source_capture?.files, 136, `${label} must retain the current installed source file count`);
  assert.equal(binding.source_capture?.manifest_sha256, CURRENT_ALIGNMENT_MANIFEST_SHA256, `${label} must retain the current installed manifest digest`);
  assert.equal(binding.scope?.source_root, path.resolve(options.alignmentSourceRoot), `${label} must identify the current SourceRoot`);
  assert.equal(binding.scope?.source_root_equivalence, "exact-six-target-bytes", `${label} must report exact six-target SourceRoot equivalence`);
  assert.equal(binding.scope?.source_after_scope, "alignment-six-targets-only", `${label} must preserve the six-target source scope`);
  assert.deepEqual(binding.scope?.source_after, CURRENT_ALIGNMENT_SOURCE, `${label} must retain the verified current six source-after records`);
  assert.deepEqual(binding.scope?.current_source, CURRENT_ALIGNMENT_SOURCE, `${label} must report the current six SourceRoot records`);
  assert.equal(binding.assertions?.["AC-009.green-controls"], "PASS", `${label} must require AC-009.green-controls`);
  assert.equal(binding.assertions?.["AC-009.green-resume-collision"], "PASS", `${label} must require AC-009.green-resume-collision`);
  assert.equal(binding.assertions?.["preservation.source"], "PASS", `${label} must require preservation.source`);

  assert.ok(Array.isArray(binding.scenarios), `${label} must retain the current producer scenarios`);
  assert.deepEqual(binding.scenarios.map((scenario) => scenario?.label), CURRENT_ALIGNMENT_SCENARIO_LABELS, `${label} must retain all nine current producer labels in order`);
  for (const scenario of binding.scenarios) {
    const terminal = scenario?.session?.terminal;
    assert.equal(terminal?.prompt_result?.status, "completed", `${label}/${scenario?.label} must retain completed Root prompt status`);
    assert.equal(terminal?.prompt_result?.agentInvoked, true, `${label}/${scenario?.label} must retain Root agentInvoked:true`);
    assert.equal(terminal?.session_settled, true, `${label}/${scenario?.label} must retain session_settled:true`);
    assert.equal(terminal?.status, "completed", `${label}/${scenario?.label} must retain terminal completed status`);
    assert.equal(terminal?.agent_end?.isTerminal, true, `${label}/${scenario?.label} must retain terminal agent_end`);
    assert.equal(scenario?.session?.process?.exit_code, 0, `${label}/${scenario?.label} must retain process exit 0`);
  }
  const collision = binding.scenarios.find((scenario) => scenario?.label === "GREEN-collision");
  assert.equal(collision?.session?.terminal?.last_message?.signals?.alignment, true, `${label}/GREEN-collision must retain the final alignment signal`);
  assert.equal(collision?.session?.terminal?.last_message?.signals?.checkpoint, true, `${label}/GREEN-collision must retain the final checkpoint signal`);
  assert.equal(collision?.session?.terminal?.last_message?.signals?.blocked, true, `${label}/GREEN-collision must retain the final blocked signal`);

  assert.ok(binding.checkpoints && typeof binding.checkpoints === "object" && !Array.isArray(binding.checkpoints), `${label} must expose mapped current checkpoints`);
  for (const [key, producerLabel] of Object.entries(CURRENT_ALIGNMENT_CHECKPOINTS)) {
    const expected = captureFile.value.checkpoints?.find((checkpoint) => checkpoint?.label === producerLabel);
    const observed = binding.checkpoints[key];
    assert.ok(expected, `${label} fixture must contain ${producerLabel}`);
    assert.ok(observed, `${label} must map ${producerLabel} to ${key}`);
    assert.equal(observed.label, producerLabel, `${label}/${key} must retain its producer label`);
    assert.equal(path.resolve(observed.path), path.resolve(expected.path), `${label}/${key} must retain the checkpoint path`);
    assert.equal(observed.bytes, expected.bytes, `${label}/${key} must retain checkpoint bytes`);
    assert.equal(observed.sha256, expected.sha256, `${label}/${key} must retain checkpoint digest`);
    const checkpointBytes = fs.readFileSync(observed.path);
    assert.equal(checkpointBytes.byteLength, observed.bytes, `${label}/${key} must re-read checkpoint bytes`);
    assert.equal(sha256Bytes(checkpointBytes), observed.sha256, `${label}/${key} must revalidate checkpoint digest`);
  }
  assert.equal(sha256Bytes(fs.readFileSync(captureFile.path)), CURRENT_ALIGNMENT_CAPTURE_SHA256, `${label} must not mutate the actual current capture`);
}

function writeCaptureVariant(captureFile, destination, mutate, label) {
  const bytes = Buffer.from(captureFile.bytes);
  writeFresh(destination, mutate(bytes), label);
  return path.resolve(destination);
}

function makeSourceDriftFixture(options, root) {
  const mirror = path.join(root, "alignment-source-drift");
  for (const expected of CURRENT_ALIGNMENT_SOURCE) {
    copyExact(path.join(options.alignmentSourceRoot, expected.path), path.join(mirror, expected.path), `private source-drift ${expected.path}`);
  }
  const driftPath = path.join(mirror, "alignment", "references", "routing-and-persistence.md");
  fs.appendFileSync(driftPath, "\nprivate source drift only\n", "utf8");
  return mirror;
}

function runBindingReadFaultChild(apis, options, root, target, label) {
  const script = path.join(root, `${label}.mjs`);
  const seamUrl = pathToFileURL(apis.lifecycleSeam).href;
  const targetPath = path.resolve(target);
  const source = `
import fs from "node:fs";
import path from "node:path";
const target = ${JSON.stringify(targetPath)};
const targetKey = process.platform === "win32" ? target.toLowerCase() : target;
const originalRead = fs.readFileSync.bind(fs);
fs.readFileSync = (file, ...args) => {
  const candidate = typeof file === "string" ? path.resolve(file) : "";
  const candidateKey = process.platform === "win32" ? candidate.toLowerCase() : candidate;
  const value = originalRead(file, ...args);
  if (candidateKey !== targetKey) return value;
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Buffer.concat([bytes, Buffer.from("\\nprivate isolated read fault\\n", "utf8")]);
};
const { bindRetainedAlignment } = await import(${JSON.stringify(seamUrl)} + "?isolated_fault=${encodeURIComponent(label)}");
let result;
try {
  result = bindRetainedAlignment(${JSON.stringify(path.resolve(options.alignmentSourceRoot))}, ${JSON.stringify(path.resolve(options.alignmentCapture))});
} catch (error) {
  result = { status: "THREW", error: { name: error?.name ?? "Error", code: error?.code ?? null, message: String(error?.message ?? error) } };
}
process.stdout.write(JSON.stringify(result));
`;
  writeFresh(script, source, `${label} isolated fault child`);
  const child = spawnSync(process.execPath, [script], {
    cwd: root,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (child.error || child.signal !== null || child.status !== 0) {
    throw new ProbeSetupError(`${label} isolated fault child did not return a result`, { child: { status: child.status, signal: child.signal, error: safeError(child.error), stderr: String(child.stderr ?? "").slice(0, 1024) } });
  }
  try {
    return JSON.parse(String(child.stdout ?? ""));
  } catch (error) {
    throw new ProbeSetupError(`${label} isolated fault child returned malformed JSON`, { cause: safeError(error), stdout: String(child.stdout ?? "").slice(0, 1024) });
  }
}

function executeCase(results, failures, name, classification, run) {
  try {
    run();
    results.push({ name, status: "PASS", classification });
  } catch (error) {
    const failureReasonExpected = error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
    const failure = { name, classification, failure_reason_expected: failureReasonExpected, error: safeError(error) };
    failures.push(failure);
    results.push({ name, status: "FAIL", classification, failure_reason_expected: failureReasonExpected, error: failure.error });
  }
}
async function executeAsyncCase(results, failures, name, classification, run) {
  try {
    await run();
    results.push({ name, status: "PASS", classification });
  } catch (error) {
    const failureReasonExpected = error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
    const failure = { name, classification, failure_reason_expected: failureReasonExpected, error: safeError(error) };
    failures.push(failure);
    results.push({ name, status: "FAIL", classification, failure_reason_expected: failureReasonExpected, error: failure.error });
  }
}


async function loadApis(options, fixtureRoot) {
  const lifecycleBytes = fs.readFileSync(options.source);
  const retryBytes = fs.readFileSync(options.retrySource);
  const lifecycleSha = sha256Bytes(lifecycleBytes);
  const retrySha = sha256Bytes(retryBytes);
  if (options.expectedSourceSha && lifecycleSha !== options.expectedSourceSha) throw new ProbeSetupError("current lifecycle source hash does not match the supplied binding", { expected: options.expectedSourceSha, actual: lifecycleSha });
  if (options.expectedRetrySha && retrySha !== options.expectedRetrySha) throw new ProbeSetupError("current technical retry source hash does not match the supplied binding", { expected: options.expectedRetrySha, actual: retrySha });

  const seamDir = path.join(fixtureRoot, "source-overlay", "implementation-evidence", "native-release");
  const protocolDir = path.join(fixtureRoot, "source-overlay", "deep-review", "lib");
  fs.mkdirSync(seamDir, { recursive: true });
  fs.mkdirSync(protocolDir, { recursive: true });
  const lifecycleSeam = path.join(seamDir, "lifecycle.seam.mjs");
  writeFresh(
    lifecycleSeam,
    `${lifecycleBytes.toString("utf8")}\n\n// TEMP export-only seam; never part of the product.\nexport { NativeRpcSession, commandReport, writeNativeAlignmentHelper, executeAlignmentHelper, failedNativeObservation, runNative, executeNativeCapture, runNativeTechnicalRetry, buildNativePrompt, sourceDerivedCaptureProvider, bindRetainedAlignment, NATIVE10_ASSIGNMENTS, MAX_PENDING_OBSERVATIONS, MAX_CAPTURE_BYTES };\n`,
    "lifecycle export-only seam",
  );
  copyExact(options.retrySource, path.join(seamDir, "technical-retry-scenario.mjs"), "technical retry source seam");
  copyExact(path.resolve(SOURCE_DIR, "../../deep-review/lib/protocol.mjs"), path.join(protocolDir, "protocol.mjs"), "deep-review protocol seam");
  const lifecycle = await import(`${pathToFileURL(lifecycleSeam).href}?source_sha=${lifecycleSha}`);
  const retry = await import(`${pathToFileURL(path.join(seamDir, "technical-retry-scenario.mjs")).href}?source_sha=${retrySha}`);
  for (const name of ["NativeRpcSession", "commandReport", "writeNativeAlignmentHelper", "executeAlignmentHelper", "failedNativeObservation", "runNative", "executeNativeCapture", "runNativeTechnicalRetry", "buildNativePrompt", "bindRetainedAlignment"]) {
    if (typeof lifecycle[name] !== "function") throw new ProbeSetupError(`temporary lifecycle seam did not expose ${name}`);
  }
  for (const name of ["MAX_PENDING_OBSERVATIONS", "MAX_CAPTURE_BYTES"]) {
    if (!Number.isSafeInteger(lifecycle[name]) || lifecycle[name] <= 0) throw new ProbeSetupError(`temporary lifecycle seam did not expose bounded ${name}`);
  }
  return { lifecycle, retry, lifecycleSha, retrySha, lifecycleSeam, MAX_PENDING_OBSERVATIONS: lifecycle.MAX_PENDING_OBSERVATIONS, MAX_CAPTURE_BYTES: lifecycle.MAX_CAPTURE_BYTES };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertRegularFile(options.source, "current lifecycle source");
  assertRegularFile(options.retrySource, "current technical retry source");
  assertRegularFile(options.transactionSource, "current fs-transaction source");
  fs.mkdirSync(options.root, { recursive: true });
  const normalHome = process.env.USERPROFILE || process.env.HOME;
  if (normalHome && path.resolve(options.root).toLowerCase() === path.resolve(normalHome).toLowerCase()) {
    throw new ProbeSetupError("private fixture parent may not be the real HOME");
  }
  const fixtureRoot = fs.mkdtempSync(path.join(options.root, "case-"));
  const transactionFixture = path.join(fixtureRoot, "alignment-success", ".omp", "skills", "tdd-orchestrator", "lib", "fs-transaction", "index.mjs");
  const transaction = copyExact(options.transactionSource, transactionFixture, "current fs-transaction source");
  if (options.expectedTransactionSha && transaction.sha256 !== options.expectedTransactionSha) {
    throw new ProbeSetupError("current fs-transaction source hash does not match the supplied binding", { expected: options.expectedTransactionSha, actual: transaction.sha256 });
  }
  const apis = await loadApis(options, fixtureRoot);
  const alignment = prepareAlignment(apis.lifecycle, fixtureRoot);
  const alignmentFailure = prepareAlignmentFailure(apis.lifecycle, fixtureRoot, options.transactionSource);
  const retry = prepareRetry(apis.retry, options, fixtureRoot);
  const currentAlignment = prepareCurrentAlignment(options);
  const results = [];
  const failures = [];

  executeCase(results, failures, "alignment success report survives commandReport with the protected checkpoint record and digest after the wall-time footer", "AC-016:alignment-producer-consumer", () => {
    const consumed = commandReport(apis.lifecycle, alignment.producer, 0, "alignment success");
    assertBoundedReport(consumed.report, alignment.producer.parsed, ["status", "code", "transaction", "path", "sha256", "record"], "alignment consumer");
    assert.equal(consumed.report.status, alignment.producer.parsed.status, "alignment consumer must preserve status");
    assert.equal(consumed.report.code, "ALIGNMENT_CHECKPOINT_PUBLISHED", "alignment consumer must preserve the published-checkpoint code");
    assert.equal(consumed.report.transaction, true, "alignment consumer must preserve transaction:true");
    assert.equal(consumed.report.path, alignment.producer.parsed.path, "alignment consumer must preserve the published file path");
    assert.equal(consumed.report.sha256, alignment.producer.parsed.sha256, "alignment consumer must preserve the published file digest");
    assert.ok(consumed.report.record && typeof consumed.report.record === "object" && !Array.isArray(consumed.report.record), "alignment consumer must preserve the protected checkpoint file record object");
    assert.equal(consumed.report.record.checkpoint, "alignment", "alignment consumer must preserve the protected checkpoint identity");
    assert.equal(consumed.report.record.status, "CLOSED", "alignment consumer must preserve the expected published protected-checkpoint status");
    assert.equal(consumed.report.record.mode, "local", "alignment consumer must preserve the protected checkpoint mode");
    assert.equal(consumed.report.record.route, "short", "alignment consumer must preserve the expected short-route checkpoint");
    assert.equal(canonical(consumed.report.record), canonical(alignment.producer.parsed.record), "alignment consumer must preserve the actual checkpoint file record");
    assert.equal(sha256File(consumed.report.path), consumed.report.sha256, "preserved alignment record must still identify the actual protected file bytes");
  });

  executeCase(results, failures, "alignment failure report survives commandReport as BLOCKED rather than accepting a malformed helper body", "AC-016:alignment-failure-producer-consumer", () => {
    const consumed = commandReport(apis.lifecycle, alignmentFailure.producer, HELPER_FAILURE_EXIT, "alignment failure");
    assertBoundedReport(consumed.report, alignmentFailure.producer.parsed, ["status", "code", "failure_origin"], "alignment failure consumer");
    assert.equal(consumed.report.status, "BLOCKED", "alignment helper failure must remain BLOCKED");
    assert.equal(consumed.report.code, "ALIGNMENT_CHECKPOINT_BLOCKED", "alignment helper failure code must survive the command consumer");
    assert.equal(consumed.report.failure_origin, "alignment-helper", "alignment helper failure origin must survive the command consumer");
  });

  executeCase(results, failures, "technical retry report survives commandReport with actual/expected inventories after the exit footer", "AC-016:technical-retry-producer-consumer", () => {
    const consumed = commandReport(apis.lifecycle, retry.producer, RETRY_FAILURE_EXIT, "technical retry validator");
    assertBoundedReport(consumed.report, retry.producer.parsed, ["status", "code", "failure_origin", "origin", "actual", "expected", "nonce", "assignment_id", "revision", "run_id", "workload"], "technical retry consumer");
    assert.equal(consumed.report.status, "FAIL", "technical retry consumer must preserve the genuine solution failure status");
    assert.equal(consumed.report.code, "ASSERTION_EXPECTED_REJECTION", "technical retry consumer must preserve the validator assertion code");
    assert.equal(consumed.report.failure_origin, "SOLUTION", "technical retry consumer must preserve the eligible failure origin");
    assertIdentity(consumed.report, retry.producer.parsed, "technical retry report");
    assert.equal(canonical(consumed.report.actual), canonical(retry.producer.parsed.actual), "technical retry consumer must preserve actual file/inventory records and digests");
    assert.equal(canonical(consumed.report.expected), canonical(retry.producer.parsed.expected), "technical retry consumer must preserve expected file/inventory records and digests");
  });

  executeCase(results, failures, "clipped or malformed machine JSON is rejected and can never become PASS", "AC-016:negative-clipped-malformed-body", () => {
    const compact = JSON.stringify(retry.producer.parsed);
    assert.ok(Buffer.byteLength(compact, "utf8") > MAX_COLUMNS, "the real retry report must provide a long compact JSON counterexample for the pinned 768-byte renderer");
    const clipped = renderOutputSinkColumns(`${compact}${footerFor(RETRY_FAILURE_EXIT)}`, MAX_COLUMNS);
    const clippedReport = apis.lifecycle.commandReport(commandEvent(clipped, RETRY_FAILURE_EXIT));
    assert.equal(clippedReport, null, "a column-clipped report body must be rejected, not partially consumed as PASS");
    const emptyReport = apis.lifecycle.commandReport(commandEvent(footerFor(RETRY_FAILURE_EXIT), RETRY_FAILURE_EXIT));
    assert.equal(emptyReport, null, "an empty report body must be rejected, not accepted as PASS");
    const malformed = `${retry.producer.raw.slice(0, -1)}${footerFor(RETRY_FAILURE_EXIT)}`;
    const malformedReport = apis.lifecycle.commandReport(commandEvent(malformed, RETRY_FAILURE_EXIT));
    assert.equal(malformedReport, null, "a malformed report body must be rejected, not accepted as PASS");
  });
  executeCase(results, failures, "Root helper exact command plus timeout/async controls is BLOCKED without admission and retains bounded operational diagnostics", "AC-016:root-command-argument-boundary", () => {
    const toolCallId = "root-bash|machine-report-extra-controls|full-call-identity";
    const before = { intent: sha256File(alignment.policy.intentPath), checkpoint: sha256File(alignment.result.path) };
    const rejected = rejectRootCommandArguments(
      apis.lifecycle,
      alignment.policy.rootCommandPolicy,
      { command: alignment.policy.rootCommandPolicy.command, timeout: 30, async: false },
      toolCallId,
      "Root helper extra controls",
    );
    const guard = assertRootArgumentGuard(rejected.observation, {
      expectedKeyCount: 2,
      expectedKeys: ["async", "timeout"],
      expectedTypes: { async: "boolean", timeout: "number" },
      toolCallId,
      label: "Root helper extra controls",
    });
    assert.equal(Object.hasOwn(guard, "extra_argument_values"), false, "Root helper extra controls must not retain an extra_argument_values payload");
    const guardJson = JSON.stringify(guard);
    assert.equal(guardJson.includes('"timeout":30'), false, "Root helper extra controls must not retain the numeric timeout value");
    assert.equal(guardJson.includes('"async":false'), false, "Root helper extra controls must not retain the boolean async value");
    assertRejectedRootCommandHasNoAdmissionOrSideEffect(rejected.observation, rejected.session, alignment, before, "Root helper extra controls");
  });

  executeCase(results, failures, "Root helper unknown sensitive argument is BLOCKED without leaking its value in the failed Native observation", "AC-016:root-command-sensitive-argument-redaction", () => {
    const toolCallId = "root-bash|machine-report-sensitive-extra|full-call-identity";
    const sensitiveValues = {
      credentialValue: "credential-value-must-never-be-retained-9f7e",
      prompt: "prompt-body-must-never-be-retained-3a2c",
      body: "body-data-must-never-be-retained-7b1d",
      data: "data-value-must-never-be-retained-5c4a",
      rawCommand: "raw-command-must-never-be-retained-8e6b",
    };
    const before = { intent: sha256File(alignment.policy.intentPath), checkpoint: sha256File(alignment.result.path) };
    const rejected = rejectRootCommandArguments(
      apis.lifecycle,
      alignment.policy.rootCommandPolicy,
      { command: alignment.policy.rootCommandPolicy.command, ...sensitiveValues },
      toolCallId,
      "Root helper sensitive extra",
    );
    const guard = assertRootArgumentGuard(rejected.observation, {
      expectedKeyCount: Object.keys(sensitiveValues).length,
      toolCallId,
      label: "Root helper sensitive extra",
    });
    assert.equal(guard.command_match, true, "Root helper sensitive extra must still report the approved command match");
    const retained = JSON.stringify(rejected.observation);
    for (const value of Object.values(sensitiveValues)) assert.equal(retained.includes(value), false, "failed Native diagnostics must not retain sensitive extra argument values");
    assert.equal(JSON.stringify(guard).includes(alignment.policy.rootCommandPolicy.command), false, "operational guard must not retain the raw approved command");
    assertRejectedRootCommandHasNoAdmissionOrSideEffect(rejected.observation, rejected.session, alignment, before, "Root helper sensitive extra");
  });
  executeCase(results, failures, "Root helper path-like extras are rejected without retaining collector-derived secret paths", "AC-016:root-command-path-argument-redaction", () => {
    for (const key of ["path", "file", "filename", "target"]) {
      const toolCallId = `root-bash|machine-report-path-extra|${key}|full-call-identity`;
      const secretPath = `C:/sensitive-root-argument/${key}/secret-path-value-7d3a`;
      const before = { intent: sha256File(alignment.policy.intentPath), checkpoint: sha256File(alignment.result.path) };
      const rejected = rejectRootCommandArguments(
        apis.lifecycle,
        alignment.policy.rootCommandPolicy,
        { command: alignment.policy.rootCommandPolicy.command, [key]: secretPath },
        toolCallId,
        `Root helper ${key} extra`,
      );
      assertRootArgumentGuard(rejected.observation, {
        expectedKeyCount: 1,
        expectedKeys: [key],
        expectedTypes: { [key]: "string" },
        toolCallId,
        label: `Root helper ${key} extra`,
      });
      const retained = JSON.stringify(rejected.observation);
      assert.equal(retained.includes(secretPath), false, `failed Native ${key} diagnostic must not retain the secret path value`);
      for (const event of rejected.observation.tool_events) {
        assert.ok(!Array.isArray(event.paths) || event.paths.length === 0, `rejected Root ${key} event must not retain argument-derived paths`);
      }
      assertRejectedRootCommandHasNoAdmissionOrSideEffect(rejected.observation, rejected.session, alignment, before, `Root helper ${key} extra`);
    }
  });
  executeCase(results, failures, "Root unsupported artifact/file/http/xd resource URIs remain BLOCKED with bounded redacted diagnostics", "AC-016:root-read-resource-uri-boundary", () => {
    rootUnsupportedResourceUrisRemainBlockedWithBoundedDiagnostics(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Authorized child unsupported resource URI remains BLOCKED with bounded diagnostics and no read permission", "AC-016:child-read-resource-uri-boundary", () => {
    childUnsupportedResourceUriRemainsBlockedWithBoundedDiagnostics(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Root read allowlist aliases reject unsupported artifact URIs with bounded redacted diagnostics", "AC-016:root-read-alias-resource-uri-boundary", () => {
    rootReadAliasesRejectUnsupportedResourceUris(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Authorized child read allowlist aliases reject unsupported artifact URIs without read permission", "AC-016:child-read-alias-resource-uri-boundary", () => {
    childReadAliasesRejectUnsupportedResourceUris(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Authorized child exact yield START/END is bounded control metadata, never read/write/shell permission or Native completion", "AC-016:child-yield-control-boundary", () => {
    authorizedChildYieldIsControlMetadataOnly(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Root yield and yield allowlist aliases remain BLOCKED without payload admission", "AC-016:root-yield-control-boundary", () => {
    rootYieldAndAliasesRemainBlocked(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Unowned, stale, and aliased child yields remain BLOCKED without permission or frame admission", "AC-016:child-yield-ownership-boundary", () => {
    unownedStaleAndAliasedChildYieldsRemainBlocked(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Authoritative first subagent_progress running child accepts exact yield START/UPDATE/END as control-only metadata", "AC-016:yield-first-progress-running", () => {
    firstProgressStatusYieldIsControlOnly(apis.lifecycle, fixtureRoot, "running");
  });
  executeCase(results, failures, "Authoritative first subagent_progress progress child accepts exact yield START/UPDATE/END as control-only metadata", "AC-016:yield-first-progress-progress", () => {
    firstProgressStatusYieldIsControlOnly(apis.lifecycle, fixtureRoot, "progress");
  });
  executeCase(results, failures, "Unknown/pending/terminal/unowned child progress never grants exact yield permission", "AC-016:yield-status-ownership-boundary", () => {
    ungrantableYieldStatusesRemainBlocked(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Failed yield END preserves isError and permits a fresh exact retry without Native completion", "AC-016:yield-failed-end-retry", () => {
    failedYieldEndAllowsFreshRetryWithoutCompletion(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Pending yield calls enforce private count/byte admission bounds before map insertion and side effects", "AC-016:yield-pending-capacity-boundary", () => {
    pendingYieldCallsAreBoundedBeforeAdmission(apis.lifecycle, fixtureRoot, {
      maxPendingObservations: apis.MAX_PENDING_OBSERVATIONS,
      maxCaptureBytes: apis.MAX_CAPTURE_BYTES,
    });
  });
  executeCase(results, failures, "Failed subagent progress latches terminality against later running progress and yield resurrection", "AC-016:yield-terminal-latch-running", () => {
    terminalProgressTransitionRemainsLatched(apis.lifecycle, fixtureRoot, "running");
  });
  executeCase(results, failures, "Failed subagent progress latches terminality against rebound completed progress", "AC-016:yield-terminal-latch-completed", () => {
    terminalProgressTransitionRemainsLatched(apis.lifecycle, fixtureRoot, "completed");
  });
  executeCase(results, failures, "Failed subagent progress cannot commit an inline completed Root result", "AC-016:yield-failed-progress-root-success", () => {
    failedProgressCannotCommitCompletedRoot(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Completed subagent progress preserves raw facts and the legitimate completed Root record", "AC-016:yield-completed-progress-root-success", () => {
    completedProgressRetainsCompletedRootRecord(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Yield START capture failure is atomic for map, bytes, frame, and prior legal observation", "AC-016:yield-capture-start-atomic", () => {
    yieldStartCaptureFailureIsAtomic(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Yield UPDATE capture failure is atomic and preserves its prior START", "AC-016:yield-capture-update-atomic", () => {
    yieldUpdateCaptureFailureIsAtomic(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Yield END capture failure is atomic and permits a clean retry", "AC-016:yield-capture-end-atomic", () => {
    yieldEndCaptureFailureIsAtomic(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Pending child capture failure preserves prior observations and releases no hidden yield state", "AC-016:yield-pending-capture-atomic", () => {
    pendingYieldCaptureFailurePreservesPriorObservation(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Oversized opaque yield identities reject before admission or retain both full IDs without collision", "AC-016:yield-identity-retention-boundary", () => {
    longYieldIdentityRetentionBoundary(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Full-tuple adoption capture failure restores pending frames, maps, correlations, counters, and Root binding before a clean retry", "AC-016:yield-adoption-capture-transaction", () => {
    fullTupleAdoptionCaptureFailureRollsBackAllState(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Actual Root batch adoption rolls back public assignment aliases, pending maps, counters, and provenance after a second-row capture fault before a clean two-row retry", "AC-016:yield-batch-assignment-capture-transaction", () => {
    batchRootAssignmentCaptureFailureRollsBackPublicMetadata(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Full-tuple adoption refuses command-result publication at the independent byte boundary before map or capture publication", "AC-016:yield-adoption-command-budget-boundary", () => {
    adoptionCommandResultBudgetFailureIsAtomic(apis.lifecycle, fixtureRoot, apis.MAX_CAPTURE_BYTES);
  });
  executeCase(results, failures, "A legal exact yield with contradictory terminal progress rejects as one frame without leaking capture or prior correlations", "AC-016:yield-contradictory-frame-transaction", () => {
    contradictoryYieldProgressRollsBackWholeFrame(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Scrub-sensitive short opaque identities reject before admission or remain exact through task, child, parent, and yield metadata", "AC-016:yield-opaque-identity-retention-boundary", () => {
    scrubSensitiveOpaqueIdentityBoundary(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Root and subagent taskId/task_id metadata retains exact fictional sensitive or whitespace IDs or refuses before correlation and permission admission", "AC-016:tool-correlation-task-id-boundary", () => {
    rootAndSubagentTaskIdCorrelationBoundary(apis.lifecycle, fixtureRoot, alignment.policy.rootCommandPolicy);
  });
  executeCase(results, failures, "Nested SDK jobId/job_id metadata retains a complete harmless long ID or refuses before normalization and capture", "AC-016:nested-sdk-job-identity-boundary", () => {
    nestedSdkJobIdentityBoundary(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "U+001F-bearing tuple combinations remain distinct or both refuse before correlation admission", "AC-016:yield-separator-collision-boundary", () => {
    separatorBearingYieldTuplesDoNotAlias(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Speculative exact yield remains pending before Root; rightful full-tuple adoption publishes the same bounded control metadata", "AC-016:yield-speculative-order-boundary", () => {
    speculativeYieldBeforeRootCannotGrantAndFullTupleAdoptionRemainsExact(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Speculative exact yield cannot be adopted by agent/index heuristic", "AC-016:yield-speculative-identity-boundary", () => {
    speculativeYieldCannotAdoptByAgentOrIndex(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Aborted speculative child cannot gain exact yield permission after Root tuple observation", "AC-016:yield-aborted-speculative-boundary", () => {
    abortedSpeculativeChildCannotGrantYieldAfterRootAdoption(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "Exact yield from a foreign Root tuple is BLOCKED without permission or completion", "AC-016:yield-foreign-root-boundary", () => {
    foreignRootYieldCannotUseAnAcceptedChild(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "bindSourceHost retains exact fictional sensitive and oversized root session IDs with the correlated prompt waiter or refuses before metadata admission", "AC-016:root-session-bind-identity-boundary", () => {
    rootSessionIdBindBoundary(apis.lifecycle, fixtureRoot);
  });
  await executeAsyncCase(results, failures, "execute get_state-to-prompt flow retains exact fictional sensitive and oversized root session IDs in host metadata and the bound prompt or refuses before dispatch", "AC-016:root-session-execute-identity-boundary", () => {
    return rootSessionIdExecuteBoundary(apis.lifecycle, fixtureRoot);
  });
  await executeAsyncCase(results, failures, "Missing exact yield END prevents settlement through execute/finalization rather than map-size-only inspection", "AC-016:yield-execute-finalization-boundary", () => {
    return executeRejectsMissingYieldEnd(apis.lifecycle, fixtureRoot);
  });
  executeCase(results, failures, "failed/completed child latches reject fresh read/write/bash STARTs and do not confuse correlated late ENDs with permission", "AC-016:lifecycle-3353:terminal-binding-liveness", () => lifecycleBindingLivenessBlocksFreshDomainStarts(apis.lifecycle, fixtureRoot));
  await executeAsyncCase(results, failures, "Root execute get_state without an actual sessionId blocks before Root prompt dispatch", "AC-016:lifecycle-3800:root-session-id-required", () => rootSessionMissingExecuteBlocksBeforePrompt(apis.lifecycle, fixtureRoot));
  executeCase(results, failures, "constructor-configured task or solutionSpace drift blocks before child binding", "AC-016:lifecycle-3067:assignment-literal-binding", () => constructorAssignmentDriftBlocksBeforeBinding(apis.lifecycle, fixtureRoot));
  executeCase(results, failures, "opaque object tool-call IDs are rejected without canonicalization", "AC-016:lifecycle-211:opaque-id-object", () => opaqueIdentityObjectIsRejectedWithoutCanonicalization(apis.lifecycle, fixtureRoot));
  executeCase(results, failures, "only exact SDK tool-call metadata authorizes reads, not application data/arguments/input/result IDs", "AC-016:lifecycle-5291:application-payload-id-authority", () => applicationPayloadToolCallIdsDoNotSupplySdkAuthority(apis.lifecycle, fixtureRoot));
  await executeAsyncCase(results, failures, "integrated Native10 caller rejects names-only, missing task/solutionSpace, and drifted assignments against a canonical prompt", "AC-016:caller-canonical-assignment-rejection", () => native10CallerRejectsNonCanonicalAssignments(apis.lifecycle, fixtureRoot));
  await executeAsyncCase(results, failures, "integrated Native10 caller admits its prompt-canonical Root assignment and keeps task/solutionSpace mutation BLOCKED", "AC-016:caller-canonical-root-assignment", () => native10CallerCanonicalRootAdmission(apis.lifecycle, fixtureRoot));
  await executeAsyncCase(results, failures, "integrated Native09 first/repair/peer/second callers admit prompt-canonical Root assignments and use distinct validator dispatch names", "AC-013:caller-canonical-retry-assignment", () => native09CallerCanonicalRootAdmission(apis.lifecycle, apis.retry, fixtureRoot, retry.definition));
  await executeAsyncCase(results, failures, "source-derived Native09 retry forwards each approved task/solutionSpace through the real Root recordTool and reaches every eligible stage", "AC-013:source-derived-canonical-retry-assignment", () => native09SourceDerivedCanonicalRetry(apis.lifecycle, apis.retry, fixtureRoot, retry));
  await executeAsyncCase(results, failures, "source-derived Native09 backend bridge rejects missing/forged role_source or observed_binding before peer and second dispatch", "AC-016:P1b-backend-bridge-gate", () => native09RepairBridgeMetadataStopsPeerAndSecond(apis.lifecycle, apis.retry, fixtureRoot, retry));
  await executeAsyncCase(results, failures, "source-derived Native09 wait consumer keeps raw transport jobId distinct from canonical Root host binding, accepts exactly one canonical write, and refuses foreign/missing/mismatched Root bindings", "AC-016:technical-retry-root-wait-causal-producer", () => native09SourceDerivedWaitBindingCausalRegression(apis.lifecycle, apis.retry, fixtureRoot, retry));







  executeCase(results, failures, "current Native alignment capture binds the current six SourceRoot files, nine GREEN terminals, assertions, and four resume checkpoints", "AC-009:current-capture-binding", () => {
    assertCurrentAlignmentPass(apis.lifecycle.bindRetainedAlignment(options.alignmentSourceRoot, options.alignmentCapture), options, currentAlignment.captureFile, "current alignment binding");
  });
  executeCase(results, failures, "wrong current alignment capture bytes remain PENDING and cannot become PASS", "AC-009:wrong-capture-sha", () => {
    const wrongCapture = writeCaptureVariant(
      currentAlignment.captureFile,
      path.join(fixtureRoot, "alignment-negative", "wrong-capture-sha.json"),
      (bytes) => Buffer.concat([bytes, Buffer.from("\n", "utf8")]),
      "wrong current alignment capture",
    );
    assertPendingAlignment(apis.lifecycle.bindRetainedAlignment(options.alignmentSourceRoot, wrongCapture), "wrong current alignment capture");
  });
  executeCase(results, failures, "owned current alignment SourceDoc drift remains PENDING without touching the real SourceRoot", "AC-009:owned-source-drift", () => {
    const driftedSource = makeSourceDriftFixture(options, fixtureRoot);
    assertPendingAlignment(apis.lifecycle.bindRetainedAlignment(driftedSource, options.alignmentCapture), "owned current alignment SourceDoc drift");
  });
  executeCase(results, failures, "archived old-31 alignment capture is rejected as source drift rather than accepted through a legacy replay binding", "AC-009:legacy-capture-refusal", () => {
    const legacyCapture = legacyAlignmentCapturePath();
    const before = sha256File(legacyCapture);
    assertPendingAlignment(apis.lifecycle.bindRetainedAlignment(options.alignmentSourceRoot, legacyCapture), "archived old-31 alignment capture");
    assert.equal(sha256File(legacyCapture), before, "archived old-31 alignment capture must remain immutable");
  });
  executeCase(results, failures, "checkpoint revalidation faults remain isolated and fail closed without mutating captured checkpoint bytes", "AC-009:checkpoint-revalidation-fault", () => {
    const checkpoint = currentAlignment.captureFile.value.checkpoints?.find((item) => item?.label === CURRENT_ALIGNMENT_CHECKPOINTS.resume_a_successor);
    assert.ok(checkpoint?.path, "current capture must expose the A successor checkpoint for revalidation");
    const before = sha256File(checkpoint.path);
    const faulted = runBindingReadFaultChild(apis, options, fixtureRoot, checkpoint.path, "alignment-checkpoint-revalidation-fault");
    assertPendingAlignment(faulted, "isolated checkpoint revalidation fault");
    assert.equal(sha256File(checkpoint.path), before, "isolated checkpoint fault must not mutate the actual checkpoint");
  });
  executeCase(results, failures, "current alignment consumer preserves the actual capture and six SourceRoot bytes", "AC-009:preservation-source", () => {
    assert.equal(sha256File(options.alignmentCapture), currentAlignment.captureSha256Before, "current alignment capture bytes must remain unchanged");
    assert.deepEqual(currentAlignmentSourceSnapshot(options.alignmentSourceRoot, "preservation check"), currentAlignment.sourceBefore, "current six SourceRoot files must remain unchanged");
  });

  const output = {
    status: failures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "native-machine-report-boundary-red",
    acceptance_criteria: ["AC-009", "AC-016", "AC-013"],
    source: { lifecycle: options.source, lifecycle_sha256: apis.lifecycleSha, retry: options.retrySource, retry_sha256: apis.retrySha, fs_transaction: options.transactionSource, fs_transaction_sha256: transaction.sha256 },
    private_fixture: fixtureRoot,
    renderer_contract: {
      omp_revision: "9058ab9d229663e229e2867824ba6df6f21e9e59",
      max_columns: MAX_COLUMNS,
      unit: "UTF-8 bytes per line",
      overflow: "append U+2026 and drop remaining bytes through newline",
      native_bash_text: "NOT RETAINED; this probe reconstructs the pinned renderer contract only",
    },
    producer_inputs: {
      alignment_checkpoint: { path: alignment.result.path, sha256: alignment.result.sha256, record: alignment.result.record },
      alignment_failure: { status: alignmentFailure.producer.parsed.status, code: alignmentFailure.producer.parsed.code },
      alignment_current_capture: {
        path: currentAlignment.captureFile.path,
        sha256: currentAlignment.captureSha256Before,
        expected_sha256: CURRENT_ALIGNMENT_CAPTURE_SHA256,
        run_id: currentAlignment.captureFile.value.run_id,
        expected_run_id: CURRENT_ALIGNMENT_RUN_ID,
        source_capture_files: currentAlignment.captureFile.value.source_capture?.files ?? null,
        expected_manifest_sha256: CURRENT_ALIGNMENT_MANIFEST_SHA256,
        source_after: CURRENT_ALIGNMENT_SOURCE,
        explicit_cli_flag: "--alignment-capture",
      },
      technical_retry: { validator: retry.definition.paths.validator, status: retry.producer.parsed.status, code: retry.producer.parsed.code, original_manifest_sha256_before: retry.manifestSha256Before, immutable_original: retry.definition.immutable_original },
      copied_fs_transaction: transaction,
    },
    case_counts: {
      existing_source_cases: results.filter((item) => item.classification.startsWith("AC-016") || item.classification.startsWith("AC-013")).length,
      current_alignment_cases: results.filter((item) => item.classification.startsWith("AC-009")).length,
    },
    cases: results.length,
    cases_run: results,
    failures,
    source_only: true,
    native: false,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failures.length === 0) return;
  const expectedFailures = failures.filter((failure) => failure.failure_reason_expected);
  if (expectedFailures.length !== failures.length) {
    throw new ProbeSetupError("one or more probe failures were not assertion failures", { failures });
  }
  const error = new Error("source-only machine report RED assertions failed as expected");
  error.name = "AssertionError";
  error.code = "ERR_ASSERTION";
  error.probe = output;
  throw error;
}

main().catch((error) => {
  if (error?.probe) {
    process.stderr.write(`${JSON.stringify({ ...error.probe, error: safeError(error) }, null, 2)}\n`);
  } else {
    process.stderr.write(`${JSON.stringify({ status: "BLOCKED", phase: "RED", probe: "native-machine-report-boundary-red", failure_reason_expected: false, error: safeError(error) }, null, 2)}\n`);
  }
  process.exitCode = error?.name === "AssertionError" ? 1 : 2;
});
