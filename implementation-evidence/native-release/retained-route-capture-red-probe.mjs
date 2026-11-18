#!/usr/bin/env node
// Source-only RED probe for T-011 / AC-016 retained Native route reuse.
//
// The historical Native27 evidence and four route inspection witnesses are
// read-only inputs. The probe copies only the pinned current source files into
// owned temporary roots, then calls the real lifecycle private consumer through
// an owned export seam. It never starts OMP/SDK, invokes a model, uses a
// network/Git command, or edits the checkout or historical route projects.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(THIS_FILE);
const PROJECT_ROOT = path.resolve(SOURCE_DIR, "../..");
const DEFAULT_LIFECYCLE = path.join(SOURCE_DIR, "lifecycle.mjs");
const DEFAULT_ROUTE_SOURCE = path.join(SOURCE_DIR, "route-matrix.mjs");
const DEFAULT_RETRY_SOURCE = path.join(SOURCE_DIR, "technical-retry-scenario.mjs");
const TEST_FILE = "implementation-evidence/native-release/retained-route-capture-red-probe.mjs";
const EXPECTED_CLASSIFICATION = "VALID_FINDING:AC-016:retained-route-capture-consumer";
const SHA256 = /^[a-f0-9]{64}$/i;
const BASELINE_LIFECYCLE_SHA256 = "b2d4327ea2274924677e510ba4e9b1ce5594371345266d339df22dc63774b492";
const TRUSTED_CAPTURE_SHA256 = "1a3e8eedb5289f3b6fb2af387fddc9cd9060646bca962515a978a8160fc885b0";
const TRUSTED_ROUTE_CONSUMER_SHA256 = "65d9fbec24e1ec5cda1f7346f60e7a247f1c5ca40fed40aec59bbdae737ddeb9";
const TRUSTED_BINARY_SHA256 = "dfb15c27cb2ea192a94761c26aa5cd4eed54b1e0a5a85c02938ab07d769bc8f7";
const TRUSTED_BINARY_BYTES = 249985024;
const EXPECTED_CASES = Object.freeze([
  ["SHORT_LOCAL", 70],
  ["FULL_LOCAL", 129],
  ["SHORT_GIT", 77],
  ["FULL_GIT", 300],
]);
const NORMATIVE_DOCUMENTS = Object.freeze({
  "docs/capability-matrix.md": { bytes: 22798, sha256: "7567e8d05c1a1c9de1057b9dbf3172fd0b0c049c7ace0a3b71e3f649f618eb3b" },
  "docs/functional.md": { bytes: 22396, sha256: "f77b12214c600116c4b309a11f699717ea332d9b9a9103098944f2cc3792f073" },
  "docs/omp-compatibility.md": { bytes: 23289, sha256: "c71102ab4eb9f9551af0e958daa70a46062b2e90bb9de4a687fcada9c8baae7e" },
  "specs/specs005-omp-compatible-release/contracts/interface-contract.md": { bytes: 66680, sha256: "2bfe04e9d7eb15ceee8a189c9e8c05974415129e8aede52c7dc0026c034df477" },
  "specs/specs005-omp-compatible-release/plan.md": { bytes: 55983, sha256: "bbb54381966278299dc48665bf3ab1bf84ea58e68ad1430c9d7e546de62eaeb9" },
  "specs/specs005-omp-compatible-release/spec.md": { bytes: 84909, sha256: "540de72e167cf1cc465c7785720d7675687a1222ac16808055c95b587776daf6" },
  "specs/specs005-omp-compatible-release/tasks.md": { bytes: 41525, sha256: "772e22afe89047b3fbf9ef926102fb429d765e4116b8aba094c7aad6ef845f8a" },
});

function parseArgs(argv) {
  const allowed = new Set(["source", "lifecycle", "capture", "binary", "route-source", "retry-source", "root"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`unknown option --${key}`);
    if (values.has(key)) throw new Error(`duplicate option: --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    values.set(key, value);
    index += 1;
  }
  const capture = values.get("capture");
  const root = values.get("root");
  if (!capture) throw new Error("--capture is required; the historical evidence is an explicit retained input");
  if (!root) throw new Error("--root is required; every mutable fixture must remain below it");
  return {
    source: path.resolve(values.get("source") ?? PROJECT_ROOT),
    lifecycle: path.resolve(values.get("lifecycle") ?? DEFAULT_LIFECYCLE),
    capture: path.resolve(capture),
    binary: values.get("binary") ? path.resolve(values.get("binary")) : null,
    routeSource: path.resolve(values.get("route-source") ?? DEFAULT_ROUTE_SOURCE),
    retrySource: path.resolve(values.get("retry-source") ?? DEFAULT_RETRY_SOURCE),
    root: path.resolve(root),
  };
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileRecord(file, label = "file") {
  const bytes = fs.readFileSync(file);
  return { path: file, bytes: bytes.byteLength, sha256: sha256Bytes(bytes), label };
}

function readJson(file, label) {
  const record = fileRecord(file, label);
  try {
    return { value: JSON.parse(Buffer.from(fs.readFileSync(file)).toString("utf8")), record };
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error?.message ?? error}`);
  }
}

function safeError(error) {
  return {
    name: error?.name ?? "Error",
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };
}

function isAssertionFailure(error) {
  return error?.code === "ERR_ASSERTION" || error?.name === "AssertionError";
}

function assertRegular(file, label) {
  const stat = fs.lstatSync(file);
  assert.equal(stat.isFile(), true, `${label} must be a regular file`);
  assert.equal(stat.isSymbolicLink(), false, `${label} must not be a symlink`);
}

function copyPinnedSource(sourceRoot, capture, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const expected = capture.source_before;
  assert.equal(Array.isArray(expected), true, "trusted evidence must contain source_before");
  assert.equal(expected.length, 131, "trusted product/source manifest must contain exactly 131 files");
  assert.deepEqual(capture.source_after, expected, "trusted source_before/source_after pathsets and pins must match");
  for (const entry of expected) {
    assert.equal(typeof entry?.path, "string", "source manifest path must be a string");
    assert.equal(path.isAbsolute(entry.path), false, "source manifest paths must be relative");
    const source = path.resolve(sourceRoot, entry.path);
    const target = path.resolve(destination, entry.path);
    assertRegular(source, `current source ${entry.path}`);
    const current = fileRecord(source, `current source ${entry.path}`);
    assert.equal(current.bytes, entry.bytes, `current source byte pin changed: ${entry.path}`);
    assert.equal(current.sha256, entry.sha256, `current source hash pin changed: ${entry.path}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function makeExportOnlySeam(options, root) {
  const seamDirectory = path.join(root, "source-overlay", "implementation-evidence", "native-release");
  fs.mkdirSync(seamDirectory, { recursive: true });
  const seam = path.join(seamDirectory, "lifecycle.seam.mjs");
  const sourceText = fs.readFileSync(options.lifecycle, "utf8");
  // The fallback keeps the RED probe assertion-driven when the new private
  // function is absent; it is never a product implementation and cannot make
  // the positive retained-capture case pass.
  const exportText = `\n\n// TEMP export-only seam; never part of the product.\nconst __retainedRoutes = typeof bindRetainedRoutes === "function"\n  ? bindRetainedRoutes\n  : () => ({ status: "PENDING", reason: "bindRetainedRoutes is unavailable" });\nexport { __retainedRoutes as bindRetainedRoutes };\n`;
  fs.writeFileSync(seam, `${sourceText}${exportText}`, "utf8");
  fs.copyFileSync(options.retrySource, path.join(seamDirectory, "technical-retry-scenario.mjs"));
  const protocolDirectory = path.join(root, "source-overlay", "deep-review", "lib");
  fs.mkdirSync(protocolDirectory, { recursive: true });
  fs.copyFileSync(path.join(options.source, "deep-review/lib/protocol.mjs"), path.join(protocolDirectory, "protocol.mjs"));
  return seam;
}

async function loadApis(options, root) {
  const seam = makeExportOnlySeam(options, root);
  const lifecycle = await import(`${pathToFileURL(seam).href}?retained_route_red=${Date.now()}`);
  const route = await import(`${pathToFileURL(options.routeSource).href}?retained_route_route=${Date.now()}`);
  assert.equal(typeof lifecycle.bindRetainedRoutes, "function", "owned seam must expose the retained route consumer callable");
  assert.equal(typeof route.inspectRouteCase, "function", "current route consumer must expose inspectRouteCase");
  return { lifecycle, route };
}

function instrumentRouteApi(route, calls) {
  return {
    ...route,
    inspectRouteCase(input) {
      calls.push(structuredClone(input));
      const result = route.inspectRouteCase(input);
      assert.equal(result && typeof result.then === "function", false, "route inspection must be synchronous");
      return result;
    },
  };
}

function trustedInputs(options) {
  const captureRecord = fileRecord(options.capture, "trusted Native27 main evidence");
  assert.equal(captureRecord.sha256, TRUSTED_CAPTURE_SHA256, "trusted Native27 main evidence bytes changed");
  const capture = readJson(options.capture, "trusted Native27 main evidence").value;
  assert.equal(capture.alignment_binding?.source_capture?.manifest_sha256, "0d40b8a19c35681a7f05c17d76f022e95249624a86d3d55a5371cf27157fb3c9", "trusted source capture manifest digest changed");
  const sourceMap = new Map((capture.source_before ?? []).map((entry) => [entry.path, entry]));
  for (const [relative, expected] of Object.entries(NORMATIVE_DOCUMENTS)) {
    assert.deepEqual(sourceMap.get(relative), { path: relative, ...expected }, `normative document pin changed: ${relative}`);
  }
  const routeRecord = fileRecord(options.routeSource, "current route consumer");
  assert.equal(routeRecord.sha256, TRUSTED_ROUTE_CONSUMER_SHA256, "current route consumer bytes changed");
  const binaryPath = options.binary ?? capture.omp_binary_before?.path;
  assert.ok(binaryPath, "trusted binary path is required");
  const binaryRecord = fileRecord(binaryPath, "current OMP binary");
  assert.equal(binaryRecord.bytes, TRUSTED_BINARY_BYTES, "current OMP binary byte pin changed");
  assert.equal(binaryRecord.sha256, TRUSTED_BINARY_SHA256, "current OMP binary hash pin changed");
  assert.deepEqual(capture.omp_binary_before, { path: capture.omp_binary_before.path, bytes: TRUSTED_BINARY_BYTES, sha256: TRUSTED_BINARY_SHA256 }, "trusted binary provenance changed");
  assert.equal(capture.route_matrix?.cases?.length, EXPECTED_CASES.length, "trusted route matrix must contain four cases");
  const fixtureMap = new Map((capture.route_matrix?.fixtures ?? []).map((fixture) => [fixture.id, fixture]));
  const caseMap = new Map((capture.route_matrix?.cases ?? []).map((routeCase) => [routeCase.case, routeCase]));
  for (const [id, checks] of EXPECTED_CASES) {
    const fixture = fixtureMap.get(id);
    const routeCase = caseMap.get(id);
    assert.ok(fixture, `trusted route fixture missing: ${id}`);
    assert.ok(routeCase, `trusted route case missing: ${id}`);
    assert.equal(routeCase.status, "PASS", `trusted route case is not PASS: ${id}`);
    assert.equal(routeCase.native, true, `trusted route case is not native: ${id}`);
    assert.equal(routeCase.checks.length, checks, `trusted route check count changed: ${id}`);
    const witness = fixture.host_artifacts?.inspectionInputWitness;
    assert.equal(witness?.path, ".omp/state/native-route/inspection-input.json", `inspection witness path changed: ${id}`);
    const witnessPath = path.resolve(fixture.project, witness.path);
    const witnessRecord = fileRecord(witnessPath, `${id} inspection input witness`);
    assert.equal(witnessRecord.sha256, witness.sha256, `inspection witness bytes changed: ${id}`);
    const input = readJson(witnessPath, `${id} inspection input witness`).value;
    assert.equal(input.projectRoot, fixture.project, `inspection witness projectRoot changed: ${id}`);
    assert.equal(input.definition?.id, id, `inspection witness definition changed: ${id}`);
    assert.deepEqual(input.definition?.binding, routeCase.binding, `inspection witness binding changed: ${id}`);
  }
  return {
    capture,
    captureRecord,
    binaryBefore: { path: binaryPath, bytes: TRUSTED_BINARY_BYTES, sha256: TRUSTED_BINARY_SHA256 },
    fixtureWitnesses: [...fixtureMap.values()].map((fixture) => {
      const witness = fixture.host_artifacts.inspectionInputWitness;
      const file = path.resolve(fixture.project, witness.path);
      return { file, sha256: witness.sha256 };
    }),
  };
}

function assertReadOnly(originals) {
  for (const original of originals) {
    const observed = sha256Bytes(fs.readFileSync(original.file));
    assert.equal(observed, original.sha256, `historical input was modified: ${original.file}`);
  }
}

function cloneCase(baseRoot, root, label) {
  const destination = path.join(root, "cases", label);
  fs.cpSync(baseRoot, destination, { recursive: true, errorOnExist: false });
  return destination;
}

function mutateOwnedFile(root, relative, suffix = "\nowned retained-route mutation\n") {
  const file = path.join(root, relative);
  assertRegular(file, `owned mutation target ${relative}`);
  fs.appendFileSync(file, suffix, "utf8");
}

function makeDifferentBinary(root) {
  const file = path.join(root, "cases", "different-binary", "omp-different.bin");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from("owned binary with different bytes\n", "utf8"));
  return fileRecord(file, "owned different binary");
}

function callRetained(apis, sourceRoot, capturePath, route, binaryBefore) {
  const before = JSON.stringify(binaryBefore);
  const value = apis.lifecycle.bindRetainedRoutes(sourceRoot, capturePath, route, binaryBefore);
  assert.equal(value && typeof value.then === "function", false, "bindRetainedRoutes must be synchronous");
  assert.equal(JSON.stringify(binaryBefore), before, "bindRetainedRoutes must not mutate binary provenance input");
  return value;
}

function assertPending(value, calls, label) {
  assert.equal(value?.status, "PENDING", `${label} must fail closed with PENDING`);
  assert.equal(calls.length, 0, `${label} must reject before route inspection`);
}

function routeCaseRows(value) {
  const rows = value?.route_matrix?.cases ?? value?.route_matrix?.results;
  assert.equal(Array.isArray(rows), true, "retained result must expose route_matrix.cases");
  return rows;
}

function rowId(row) {
  return row?.case ?? row?.id ?? row?.definition?.id ?? null;
}

function rowCheckCount(row) {
  if (Number.isSafeInteger(row?.checks)) return row.checks;
  if (Array.isArray(row?.checks)) return row.checks.length;
  if (Number.isSafeInteger(row?.checks_count)) return row.checks_count;
  return null;
}

function assertPassResult(value, calls, trusted) {
  assert.equal(value?.status, "PASS", "exact retained Native27 evidence must be reusable");
  assert.equal(value?.sdk_sessions_reexecuted, false, "retained route reuse must not reexecute SDK sessions");
  assert.equal(value?.capture?.sha256, TRUSTED_CAPTURE_SHA256, "retained result must preserve the trusted main evidence digest");
  const rows = routeCaseRows(value);
  assert.equal(value.route_matrix.run_id, trusted.capture.route_matrix.run_id, "retained route run_id must remain exact");
  assert.equal(value.route_matrix.revision, trusted.capture.route_matrix.revision, "retained route revision must remain exact");
  assert.equal(value.route_matrix.nonce, trusted.capture.route_matrix.nonce, "retained route nonce must remain exact");
  assert.deepEqual(rows.map(rowId), EXPECTED_CASES.map(([id]) => id), "retained route case IDs must remain exact");
  for (const [id, checks] of EXPECTED_CASES) {
    const row = rows.find((candidate) => rowId(candidate) === id);
    assert.ok(row, `retained result missing route case: ${id}`);
    assert.equal(row.status, "PASS", `retained route case must PASS: ${id}`);
    assert.equal(row.native, true, `retained route case must remain native: ${id}`);
    assert.equal(rowCheckCount(row), checks, `retained route check count changed: ${id}`);
  }
  const total = rows.reduce((sum, row) => sum + rowCheckCount(row), 0);
  assert.equal(total, 576, "retained route matrix must preserve all 576 checks");
  assert.equal(calls.length, 4, "bindRetainedRoutes must synchronously inspect all four retained inputs");
  const expectedInputs = new Map(trusted.capture.route_matrix.fixtures.map((fixture) => [fixture.id, fixture]));
  for (const input of calls) {
    const fixture = expectedInputs.get(input.definition?.id);
    assert.ok(fixture, `unexpected route inspection input: ${input.definition?.id}`);
    assert.equal(input.projectRoot, fixture.project, `route inspection must retain original projectRoot: ${input.definition.id}`);
    assert.deepEqual(input.definition.binding, trusted.capture.route_matrix.cases.find((row) => row.case === input.definition.id)?.binding, `route inspection binding changed: ${input.definition.id}`);
  }
}

function executeCase(results, failures, name, run) {
  try {
    run();
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
  const runRoot = fs.mkdtempSync(path.join(options.root, "native28-retained-route-"));
  const trusted = trustedInputs(options);
  const historicalInputs = [{ file: options.capture, sha256: TRUSTED_CAPTURE_SHA256 }, ...trusted.fixtureWitnesses];
  const apis = await loadApis(options, runRoot);
  const baseRoot = path.join(runRoot, "owned-product-base");
  copyPinnedSource(options.source, trusted.capture, baseRoot);
  const retainedConsumer = path.join(baseRoot, "implementation-evidence/native-release/route-matrix.mjs");
  fs.mkdirSync(path.dirname(retainedConsumer), { recursive: true });
  fs.copyFileSync(options.routeSource, retainedConsumer);
  const results = [];
  const failures = [];

  executeCase(results, failures, "exact trusted Native27 main evidence reuses four retained routes with 576 checks and no SDK reexecution", () => {
    const calls = [];
    const route = instrumentRouteApi(apis.route, calls);
    const value = callRetained(apis, baseRoot, options.capture, route, trusted.binaryBefore);
    assertPassResult(value, calls, trusted);
  });

  executeCase(results, failures, "owned tampered main evidence bytes are rejected before route inspection", () => {
    const tampered = path.join(runRoot, "cases", "tampered-main", "evidence.json");
    fs.mkdirSync(path.dirname(tampered), { recursive: true });
    fs.copyFileSync(options.capture, tampered);
    fs.appendFileSync(tampered, "\nowned tampered main bytes\n", "utf8");
    const calls = [];
    const value = callRetained(apis, baseRoot, tampered, instrumentRouteApi(apis.route, calls), trusted.binaryBefore);
    assertPending(value, calls, "tampered main evidence");
  });

  executeCase(results, failures, "owned product/source bytes are rejected by the pinned 131-file source manifest", () => {
    for (const [label, relative] of [["product-mutation", "alignment/SKILL.md"], ["source-mutation", "alignment/agents/requirements-reader.md"]]) {
      const owned = cloneCase(baseRoot, runRoot, label);
      mutateOwnedFile(owned, relative);
      const calls = [];
      const value = callRetained(apis, owned, options.capture, instrumentRouteApi(apis.route, calls), trusted.binaryBefore);
      assertPending(value, calls, `${label} source bytes`);
    }
  });

  executeCase(results, failures, "owned normative-document mutation is rejected by the seven exact document pins", () => {
    const owned = cloneCase(baseRoot, runRoot, "document-mutation");
    mutateOwnedFile(owned, "docs/functional.md");
    const calls = [];
    const value = callRetained(apis, owned, options.capture, instrumentRouteApi(apis.route, calls), trusted.binaryBefore);
    assertPending(value, calls, "normative document mutation");
  });

  executeCase(results, failures, "missing required source is rejected without reconstructing route inputs", () => {
    const owned = cloneCase(baseRoot, runRoot, "missing-source");
    fs.rmSync(path.join(owned, "alignment/agents/requirements-reader.md"));
    const calls = [];
    const value = callRetained(apis, owned, options.capture, instrumentRouteApi(apis.route, calls), trusted.binaryBefore);
    assertPending(value, calls, "missing required source");
  });

  executeCase(results, failures, "different binary provenance is rejected before retained route inspection", () => {
    const differentBinary = makeDifferentBinary(runRoot);
    const calls = [];
    const value = callRetained(apis, baseRoot, options.capture, instrumentRouteApi(apis.route, calls), differentBinary);
    assertPending(value, calls, "different binary");
  });

  executeCase(results, failures, "historical main evidence and route inspection witnesses remain read-only", () => {
    assertReadOnly(historicalInputs);
  });

  const expectedFailures = failures.filter((failure) => failure.failure_reason_expected === true);
  const unexpectedFailures = failures.filter((failure) => failure.failure_reason_expected !== true);
  const output = {
    status: unexpectedFailures.length || expectedFailures.length ? "FAIL" : "PASS",
    phase: "RED",
    probe: "native-retained-route-capture-red",
    source: {
      lifecycle: options.lifecycle,
      lifecycle_baseline_sha256: BASELINE_LIFECYCLE_SHA256,
      route_consumer: options.routeSource,
      route_consumer_sha256: TRUSTED_ROUTE_CONSUMER_SHA256,
      product_source_root: baseRoot,
      product_manifest_files: 131,
      normative_documents: Object.entries(NORMATIVE_DOCUMENTS).map(([pathName, pin]) => ({ path: pathName, ...pin })),
    },
    trusted_capture: { path: options.capture, sha256: TRUSTED_CAPTURE_SHA256, bytes: trusted.captureRecord.bytes },
    binary_before: trusted.binaryBefore,
    fixtures_root: runRoot,
    criteria_to_tests: {
      "AC-016": results.map((item) => `${TEST_FILE}::${item.name}`),
    },
    cases: results.length,
    cases_run: results,
    scope: {
      native: false,
      sdk: false,
      model_calls: false,
      network: false,
      git_commands: false,
      source_checkout_changes: false,
      historical_inputs_readonly: true,
    },
    harness: {
      expected_red_classification: EXPECTED_CLASSIFICATION,
      expected_failures: expectedFailures.map((failure) => failure.name),
      unexpected_failures: unexpectedFailures.map((failure) => failure.name),
      failure_reason_expected: unexpectedFailures.length === 0 && expectedFailures.length > 0,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (unexpectedFailures.length) {
    const error = new Error("retained route RED harness found unexpected failures");
    error.name = "ProbeHarnessError";
    error.code = "ERR_PROBE_UNEXPECTED_FAILURE";
    error.probe = output;
    throw error;
  }
  if (expectedFailures.length) {
    const error = new Error("retained route RED assertions failed as expected");
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
    probe: "native-retained-route-capture-red",
    failure_reason_expected: isAssertionFailure(error),
  };
  process.stderr.write(`${JSON.stringify({ ...probe, error: safeError(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
