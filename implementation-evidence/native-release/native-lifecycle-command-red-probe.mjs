#!/usr/bin/env node
/**
 * Disposable behavioral RED probe for T-011 / AC-016.
 *
 * This probe deliberately executes the configured validator command from a
 * copied Source650 private project.  It does not import or mock the lifecycle
 * implementation, does not edit the checkout, and never launches OMP/SDK.
 * Every fixture is an owned child of a new temporary root.  The command under
 * test is relative to that fixture so a successful run proves its cwd contract.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT_VERSION = "0.5.0";
const ACCEPTANCE = "AC-016";
const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), "../..");
const LIFECYCLE_MODULE = path.join(path.dirname(THIS_FILE), "lifecycle.mjs");
const DEFAULT_OMP = "C:/Users/Ricar/AppData/Local/Temp/usefulskills-audit-CdmZsI/omp-18.18.6-pinned.exe";
const DEFAULT_RETAINED_PRIVATE = "C:/Users/Ricar/AppData/Local/Temp/usefulskills-audit-CdmZsI/resumed-final-source-GyVVkX/ship-native-lifecycle-650da54f-7b94-45d7-833b-f498fcf04002/private-project";
const QUALITY_CLI = ".omp/skills/tdd-orchestrator/bin/quality.mjs";
const SHIP_CLI = ".omp/skills/ship/bin/ship.mjs";
const QUALITY_REPORT = ".omp/state/quality.json";
const QUALITY_CONTEXT = ".omp/state/quality-context.json";
const WORKLOAD_RECEIPT = ".omp/state/native10-workload.json";
const DOC_OUTSIDE_METADATA = "docs/native10-doc-handoff.md";
const DOC_PRIVATE_METADATA = ".omp/state/native-observation/native10-doc-handoff.md";
const PLAN_STEPS = Object.freeze(["issue", "branch", "commit", "push", "pull_request", "ci", "release"]);
const COMMAND = Object.freeze([".omp/state/native-tooling/lifecycle-check.mjs"]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(file) {
  return sha256(readFileSync(file));
}

function jsonFile(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}


function inside(root, child) {
  const relative = path.relative(path.resolve(root), path.resolve(child));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function regular(file, label) {
  const stat = lstatSync(file);
  assert.equal(stat.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(stat.isFile(), true, `${label} must be a regular file`);
  return stat;
}

function copyTree(source, destination) {
  const stat = lstatSync(source);
  assert.equal(stat.isSymbolicLink(), false, `fixture source must not contain symlink: ${source}`);
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) copyTree(path.join(source, entry), path.join(destination, entry));
    return;
  }
  regular(source, `fixture source ${source}`);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source));
}

function parseArgs(argv) {
  const values = {
    retained: DEFAULT_RETAINED_PRIVATE,
    root: null,
    node: process.execPath,
    omp: DEFAULT_OMP,
    original_snapshot: null,
    original_manifest: null,
    prepare_source: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--prepare-source") {
      values.prepare_source = true;
      continue;
    }
    if (token === "--retained-private" || token === "--root" || token === "--node" || token === "--omp" || token === "--original-snapshot" || token === "--original-manifest") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
      values[token.slice(2).replace("-", "_")] = value;
      continue;
    }
    throw new Error(`unsupported argument ${token}`);
  }
  values.retained = path.resolve(values.retained);
  values.omp = path.resolve(values.omp);
  if (values.original_snapshot) values.original_snapshot = path.resolve(values.original_snapshot);
  if (values.original_manifest) values.original_manifest = path.resolve(values.original_manifest);
  if (values.root) values.root = path.resolve(values.root);
  return values;
}

function ownedRoot(root) {
  const temp = path.resolve(os.tmpdir());
  assert.ok(inside(temp, root), `probe root must be below the OS temporary directory: ${root}`);
  if (existsSync(root)) throw new Error(`probe root must be new: ${root}`);
  mkdirSync(root, { recursive: false });
}

function createRoot(requested) {
  if (requested) {
    ownedRoot(requested);
    return requested;
  }
  return mkdtempSync(path.join(os.tmpdir(), "native10-lifecycle-red-"));
}

function fixtureFrom(retained, root, name) {
  const target = path.join(root, name);
  copyTree(retained, target);
  assert.ok(inside(root, target), `fixture escaped probe root: ${target}`);
  return target;
}

function prepareSourceProject(options, root) {
  regular(options.omp, "pinned OMP executable");
  regular(LIFECYCLE_MODULE, "lifecycle source module");
  const lab = path.join(root, "source-preparation-lab");
  mkdirSync(lab);
  const lifecycleArgs = [
    LIFECYCLE_MODULE,
    "--source", REPO_ROOT,
    "--lab", lab,
    "--omp", options.omp,
    "--phase", "green",
    "--timeout-ms", "30000",
  ];
  if (options.original_snapshot) lifecycleArgs.push("--original-snapshot", options.original_snapshot);
  if (options.original_manifest) lifecycleArgs.push("--original-manifest", options.original_manifest);
  const run = runChild(options.node, lifecycleArgs, REPO_ROOT, 300_000);
  const summary = parseJsonOutput(run);
  assert.ok(summary?.evidence, `source preparation must publish an evidence path: ${run.stderr || run.stdout}`);
  const evidencePath = path.resolve(String(summary.evidence));
  assert.ok(inside(lab, evidencePath), `source preparation evidence escaped owned lab: ${evidencePath}`);
  const evidence = jsonFile(evidencePath);
  const privateProject = path.resolve(String(evidence.private_project ?? ""));
  assert.ok(inside(lab, privateProject), `source preparation private project escaped owned lab: ${privateProject}`);
  assert.equal(lstatSync(privateProject).isDirectory(), true, "source preparation must create a private project");
  return { run, summary, evidencePath, evidence, privateProject };
}

function sealedQualityBytes(project) {
  return Object.fromEntries([QUALITY_REPORT, QUALITY_CONTEXT].map((relative) => {
    const file = path.join(project, relative);
    regular(file, relative);
    return [relative, { bytes: readFileSync(file).byteLength, sha256: sha256File(file) }];
  }));
}

function assertSealedQualityUnchanged(project, before, label) {
  for (const [relative, expected] of Object.entries(before)) {
    const file = path.join(project, relative);
    assert.ok(existsSync(file), `${label}: sealed quality input disappeared: ${relative}`);
    const actual = { bytes: readFileSync(file).byteLength, sha256: sha256File(file) };
    assert.deepEqual(actual, expected, `${label}: sealed quality input changed: ${relative}`);
  }
}

function runChild(node, args, cwd, timeoutMs = 30_000) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec,
    HOME: cwd,
    USERPROFILE: cwd,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: "file",
  };
  const child = spawnSync(node, args, {
    cwd,
    env,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    command: [node, ...args],
    cwd,
    status: child.status,
    signal: child.signal,
    error: child.error ? { code: child.error.code ?? null, message: String(child.error.message ?? child.error) } : null,
    stdout: String(child.stdout ?? ""),
    stderr: String(child.stderr ?? ""),
  };
}

function parseJsonOutput(run) {
  const candidates = [run.stdout.trim(), run.stderr.trim()].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // The assertion below reports the actual command output; no text is trusted as a report.
    }
    for (const line of candidate.split(/\r?\n/).reverse()) {
      try {
        const value = JSON.parse(line.trim());
        if (value && typeof value === "object" && !Array.isArray(value)) return value;
      } catch {
        // Continue looking only at JSON emitted by the command.
      }
    }
  }
  return null;
}

function runLifecycle(node, project) {
  return runChild(node, COMMAND, project);
}

function runQuality(node, project) {
  return runChild(node, [QUALITY_CLI, "check", ".", QUALITY_REPORT, "delivery", "--quality-context", QUALITY_CONTEXT], project);
}

function runQualityCapture(node, project) {
  return runChild(node, [QUALITY_CLI, "capture", "."], project);
}

function runShipPlan(node, project) {
  return runChild(node, [SHIP_CLI, "plan", "--root", ".", "--target", "main", "--report", QUALITY_REPORT, "--context", QUALITY_CONTEXT], project);
}



function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function reportWorkload(report) {
  return report?.workload ?? report?.computed?.workload ?? report?.result?.workload ?? report?.actual?.workload ?? null;
}


function reportExternal(report) {
  return report?.external?.receipt
    ?? report?.external_plan?.receipt
    ?? report?.external_plan
    ?? report?.ship_plan
    ?? report?.external_dry_path?.plan_cli?.receipt
    ?? report?.external_dry_path?.plan_cli
    ?? report?.result?.external
    ?? null;
}


function reportAnswer(report) {
  const workload = reportWorkload(report);
  return firstDefined(
    report?.actual,
    report?.answer,
    report?.actual_answer,
    workload?.actual,
    workload?.answer,
    workload?.actual_answer,
    workload?.exported_answer,
    report?.result?.actual,
    report?.result?.answer,
  );
}

function reportExpected(report) {
  return firstDefined(report?.expected, report?.expected_answer, report?.result?.expected);
}

function assertPlanReceipt(receipt, label) {
  assert.ok(receipt && typeof receipt === "object", `${label}: actual readonly Ship plan receipt is required`);
  assert.equal(receipt.schema_version, 1, `${label}: Ship plan schema`);
  assert.equal(receipt.mode, "external", `${label}: Ship plan mode`);
  assert.equal(receipt.dry_run, true, `${label}: Ship plan must be dry-run`);
  assert.equal(receipt.status, "PLANNED", `${label}: Ship plan status`);
  assert.equal(receipt.merge_target, "main", `${label}: Ship plan target`);
  assert.deepEqual(receipt.quality, { status: "PASS", legacy: false }, `${label}: Ship plan quality gate`);
  assert.ok(Array.isArray(receipt.steps), `${label}: Ship plan steps`);
  assert.deepEqual(receipt.steps.map((step) => step?.step), [...PLAN_STEPS], `${label}: Ship plan step order`);
  assert.ok(receipt.steps.every((step) => step?.status === "NOT_EXECUTED"), `${label}: publication steps must remain unexecuted`);
}

function assertNoExternalEffects(report, label) {
  const external = reportExternal(report);
  if (external?.steps) assert.ok(external.steps.every((step) => step?.status === "NOT_EXECUTED"), `${label}: external steps must be readonly`);
}

function assertValidatorBinding(report, binding, revision, label) {
  const workload = reportWorkload(report);
  assert.equal(report?.nonce, binding.nonce, `${label}: report nonce must bind to workload binding`);
  assert.equal(report?.assignment_id, "Native10Validator", `${label}: report assignment_id`);
  assert.equal(report?.revision, revision, `${label}: report revision must bind to the original fixture`);
  assert.equal(workload?.run_id, binding.run_id, `${label}: workload run_id binding`);
  assert.equal(workload?.source, binding.source, `${label}: workload source binding`);
  assert.equal(workload?.revision, revision, `${label}: workload revision binding`);
}

function assertFailureReport(run, report, label) {
  assert.notEqual(run.status, 0, `${label}: invalid workload/context must return nonzero`);
  assert.ok(report && typeof report === "object", `${label}: command must return an actual JSON failure report`);
  assert.equal(["PASS", "PASSOU"].includes(String(report.status ?? "").toUpperCase()), false, `${label}: invalid input was accepted`);
  assert.ok(
    report?.failure_code
      || report?.error_code
      || report?.code
      || report?.failure
      || report?.error
      || (Array.isArray(report?.errors) && report.errors.length > 0)
      || report?.failure_origin
      || report?.reason,
    `${label}: failure must include an explanatory code or error`,
  );
  assertNoExternalEffects(report, label);
}

function mutateCachedWorkload(project) {
  const file = path.join(project, WORKLOAD_RECEIPT);
  const value = jsonFile(file);
  value.quality = value.quality ?? {};
  value.quality.direct = { ok: false, errors: ["cached-quality-sentinel"] };
  value.quality.ship_gate = { ok: false, errors: ["cached-quality-sentinel"] };
  value.quality.external_dry_path = { status: "CACHED_REPORT_SENTINEL" };
  value.quality.workload = {
    source_sha256: "cached-source-sentinel",
    source_bytes: 0,
    exported_answer: 9001,
    consumer_check: "CACHED_REPORT_SENTINEL",
  };
  writeJson(file, value);
}

function mutateWorkloadSource(project) {
  writeFileSync(path.join(project, "src/tiny.mjs"), "export function answer() { return 3; }\n", "utf8");
}

function mutateStaleContext(project) {
  const file = path.join(project, QUALITY_CONTEXT);
  const value = jsonFile(file);
  value.context_digest = "0".repeat(64);
  writeJson(file, value);
}

function removeContext(project) {
  unlinkSync(path.join(project, QUALITY_CONTEXT));
}

function writeHandoff(project, relative, revision) {
  const file = path.join(project, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, [
    "# Native10 private documentation handoff",
    "",
    `AC-016; workload revision: ${revision}`,
    "External publication: NOT_EXECUTED",
    "",
  ].join("\n"), "utf8");
}


function casePositive(node, project) {
  const sealed = sealedQualityBytes(project);
  mutateCachedWorkload(project);
  const binding = jsonFile(path.join(project, WORKLOAD_RECEIPT)).binding;
  const revision = sha256File(path.join(project, "src/tiny.mjs"));
  const run = runLifecycle(node, project);
  const report = parseJsonOutput(run);
  assert.equal(run.status, 0, `positive lifecycle command failed: ${run.stderr || run.stdout}`);
  assert.ok(report, "positive lifecycle command must emit JSON");
  assert.equal(String(report.status).toUpperCase(), "PASSOU", "positive lifecycle command must PASSOU");
  assert.equal(reportAnswer(report), 2, "positive lifecycle command must compute tiny test answer 2");
  assert.equal(reportExpected(report), 2, "positive lifecycle command must report expected tiny test answer 2");
  assert.notEqual(reportAnswer(report), 9001, "positive lifecycle command must not echo cached workload answer");
  assertValidatorBinding(report, binding, revision, "positive lifecycle command");
  const qualityRun = runQuality(node, project);
  const qualityResult = parseJsonOutput(qualityRun);
  assert.equal(qualityRun.status, 0, `actual quality CLI must PASS: ${qualityRun.stderr || qualityRun.stdout}`);
  assert.equal(qualityResult?.ok, true, "actual quality CLI must return ok:true");
  const planRun = runShipPlan(node, project);
  const plan = parseJsonOutput(planRun);
  assert.equal(planRun.status, 0, `actual readonly Ship plan CLI must PASS: ${planRun.stderr || planRun.stdout}`);
  assertPlanReceipt(plan, "positive actual Ship plan CLI");
  assertPlanReceipt(reportExternal(report), "positive lifecycle report");
  assert.deepEqual(reportExternal(report), plan, "lifecycle report must contain the actual readonly Ship plan receipt, not a cached echo");
  assertSealedQualityUnchanged(project, sealed, "positive lifecycle command");
  assertNoExternalEffects(report, "positive lifecycle command");
}

function caseWorkloadMutation(node, project) {
  mutateWorkloadSource(project);
  const run = runLifecycle(node, project);
  const report = parseJsonOutput(run);
  assertFailureReport(run, report, "mutated workload");
}

function caseStaleContext(node, project) {
  mutateStaleContext(project);
  const run = runLifecycle(node, project);
  const report = parseJsonOutput(run);
  assertFailureReport(run, report, "stale quality context");
}

function caseMissingContext(node, project) {
  removeContext(project);
  const run = runLifecycle(node, project);
  const report = parseJsonOutput(run);
  assertFailureReport(run, report, "missing quality context");
}

function caseDocumentationInventory(node, project) {
  const revision = sha256File(path.join(project, "src/tiny.mjs"));
  const sealed = sealedQualityBytes(project);
  writeHandoff(project, DOC_OUTSIDE_METADATA, revision);
  const invalidQualityRun = runQuality(node, project);
  const invalidQuality = parseJsonOutput(invalidQualityRun);
  assert.notEqual(invalidQualityRun.status, 0, "a docs/ handoff added after report creation must invalidate the app inventory");
  assert.equal(invalidQuality?.ok, false, "quality CLI must report the docs/ inventory drift");
  assert.ok(Array.isArray(invalidQuality?.errors) && invalidQuality.errors.length > 0, "quality CLI must explain docs/ inventory drift");
  assertSealedQualityUnchanged(project, sealed, "docs/ handoff quality check");
}

function casePrivateDocumentation(node, project) {
  const revision = sha256File(path.join(project, "src/tiny.mjs"));
  const sealed = sealedQualityBytes(project);
  writeHandoff(project, DOC_PRIVATE_METADATA, revision);
  const qualityRun = runQuality(node, project);
  const quality = parseJsonOutput(qualityRun);
  assert.equal(qualityRun.status, 0, `private DOC handoff must not invalidate quality inventory: ${qualityRun.stderr || qualityRun.stdout}`);
  assert.equal(quality?.ok, true, "private DOC handoff quality check must PASS");
  const captureRun = runQualityCapture(node, project);
  const capture = parseJsonOutput(captureRun);
  assert.equal(captureRun.status, 0, "actual quality inventory capture must PASS");
  assert.equal(Object.keys(capture?.files ?? {}).some((file) => file.includes("native10-doc-handoff")), false, "metadata DOC handoff must be excluded from app inventory");
  const planRun = runShipPlan(node, project);
  const plan = parseJsonOutput(planRun);
  assert.equal(planRun.status, 0, `private DOC handoff must preserve readonly Ship plan: ${planRun.stderr || planRun.stdout}`);
  assertPlanReceipt(plan, "private DOC handoff Ship plan");
  assertSealedQualityUnchanged(project, sealed, "private DOC handoff quality check");
}

function runCase(name, fn, failures) {
  try {
    fn();
    return { name, status: "PASS" };
  } catch (error) {
    failures.push({ name, message: String(error?.message ?? error), stack: error?.stack ?? null });
    return { name, status: "FAIL", message: String(error?.message ?? error) };
  }
}

function saveEvidence(root, evidence) {
  const target = path.join(root, ".omp/state/native-observation/native-lifecycle-command-red.json");
  mkdirSync(path.dirname(target), { recursive: true });
  writeJson(target, evidence);
  return target;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const retained = options.retained;
  assert.ok(existsSync(retained), `retained Source650 private fixture is unavailable: ${retained}`);
  regular(path.join(retained, WORKLOAD_RECEIPT), "retained workload receipt");
  regular(path.join(retained, QUALITY_REPORT), "retained quality report");
  regular(path.join(retained, QUALITY_CONTEXT), "retained quality context");
  const root = createRoot(options.root);
  const preparation = options.prepare_source ? prepareSourceProject(options, root) : null;
  const seed = preparation?.privateProject ?? retained;
  regular(path.join(seed, WORKLOAD_RECEIPT), "seed workload receipt");
  regular(path.join(seed, QUALITY_REPORT), "seed quality report");
  regular(path.join(seed, QUALITY_CONTEXT), "seed quality context");
  const cases = [];
  const failures = [];
  const positive = fixtureFrom(seed, root, "positive");
  const workloadMutation = fixtureFrom(seed, root, "workload-mutation");
  const staleContext = fixtureFrom(seed, root, "stale-quality-context");
  const missingContext = fixtureFrom(seed, root, "missing-quality-context");
  const docsOutside = fixtureFrom(seed, root, "docs-handoff-outside-metadata");
  const docsPrivate = fixtureFrom(seed, root, "docs-handoff-private-metadata");
  cases.push(runCase("AC-016 positive actual lifecycle command computes fresh workload and readonly receipts", () => casePositive(options.node, positive), failures));
  cases.push(runCase("AC-016 mutated workload returns an actual behavioral failure", () => caseWorkloadMutation(options.node, workloadMutation), failures));
  cases.push(runCase("AC-016 stale quality context returns an actual quality failure", () => caseStaleContext(options.node, staleContext), failures));
  cases.push(runCase("AC-016 missing quality context returns an actual quality failure", () => caseMissingContext(options.node, missingContext), failures));
  cases.push(runCase("AC-016 public DOC handoff is caught by the real quality inventory", () => caseDocumentationInventory(options.node, docsOutside), failures));
  cases.push(runCase("AC-016 private DOC handoff remains outside the real quality inventory", () => casePrivateDocumentation(options.node, docsPrivate), failures));
  const evidence = {
    status: failures.length ? "RED" : "PASS",
    task: "T-011",
    acceptance_criteria: [ACCEPTANCE],
    contract: CONTRACT_VERSION,
    command: [options.node, ...COMMAND],
    command_cwd_semantics: "relative configured command executed with cwd equal to each owned private project",
    retained_fixture: retained,
    fixture_source: options.prepare_source ? "actual lifecycle source preparation" : "retained Source650 private-project byte copy",
    source_preparation: preparation ? { command: preparation.run.command, cwd: preparation.run.cwd, status: preparation.run.status, evidence: preparation.evidencePath, summary: preparation.summary } : null,
    owned_root: root,
    fixtures: [positive, workloadMutation, staleContext, missingContext, docsOutside, docsPrivate],
    cases,
    failures,
    external_effects: "none authorized; actual Ship plan is readonly and every publication step must be NOT_EXECUTED",
    evidence_path: null,
  };
  evidence.evidence_path = saveEvidence(root, evidence);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exitCode = failures.length ? 1 : 0;
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "BLOCKED", detail: String(error?.message ?? error) })}\n`);
    process.exitCode = 2;
  }
}

export {
  COMMAND,
  assertPlanReceipt,
  parseJsonOutput,
  runLifecycle,
};
