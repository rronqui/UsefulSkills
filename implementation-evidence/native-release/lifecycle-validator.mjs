#!/usr/bin/env node
/**
 * Private Native10 lifecycle validator.
 *
 * This file is copied byte-for-byte into each owned private project.  It is
 * deliberately independent of the evidence harness: its root is the private
 * project containing the deployed copy, and every observation comes from that
 * project at execution time.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSIGNMENT_ID = "Native10Validator";
const SOURCE_PATH = "src/tiny.mjs";
const TEST_PATH = "tests/tiny.test.mjs";
const QUALITY_REPORT = ".omp/state/quality.json";
const QUALITY_CONTEXT = ".omp/state/quality-context.json";
const SHIP_CLI = ".omp/skills/ship/bin/ship.mjs";
const PLAN_STEPS = Object.freeze(["issue", "branch", "commit", "push", "pull_request", "ci", "release"]);
const SHA256 = /^[a-f0-9]{64}$/i;
const CHILD_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

const deployedFile = fileURLToPath(import.meta.url);
const privateRoot = path.resolve(path.dirname(deployedFile), "..", "..", "..");

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function isRegularFile(file) {
  try {
    file = path.resolve(file);
    if (!insideRoot(privateRoot, file)) return false;
    for (let parent = path.dirname(file); insideRoot(privateRoot, parent); parent = path.dirname(parent)) {
      const directory = lstatSync(parent);
      if (!directory.isDirectory() || directory.isSymbolicLink()) return false;
      if (path.relative(privateRoot, parent) === "") break;
    }
    const stat = lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function insideRoot(root, file) {
  const relative = path.relative(root, file);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function boundedChild(args, cwd) {
  try {
    return spawnSync(process.execPath, args, {
      cwd,
      shell: false,
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
  } catch (error) {
    return { error, status: null, signal: null, stdout: "", stderr: "" };
  }
}

function parseSingleJson(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function validBinding(binding) {
  return Boolean(
    binding
      && typeof binding === "object"
      && !Array.isArray(binding)
      && nonEmptyString(binding.nonce)
      && nonEmptyString(binding.run_id)
      && binding.assignment_id === ASSIGNMENT_ID
      && binding.source === SOURCE_PATH
      && binding.test === TEST_PATH
      && SHA256.test(binding.revision),
  );
}

function envelope(binding, status, code, failureOrigin, extra = {}) {
  const report = {
    status,
    code,
    failure_origin: failureOrigin,
  };
  if (binding && typeof binding === "object") {
    if (nonEmptyString(binding.nonce)) report.nonce = binding.nonce;
    report.assignment_id = ASSIGNMENT_ID;
    if (nonEmptyString(binding.revision)) report.revision = binding.revision;
    if (nonEmptyString(binding.run_id) && nonEmptyString(binding.source) && nonEmptyString(binding.revision)) {
      report.workload = {
        run_id: binding.run_id,
        source: binding.source,
        revision: binding.revision,
      };
    }
  }
  return { ...report, ...extra };
}

function invalidReceipt(receipt) {
  return Boolean(
    !receipt
      || typeof receipt !== "object"
      || Array.isArray(receipt)
      || receipt.schema_version !== 1
      || receipt.mode !== "external"
      || receipt.dry_run !== true
      || receipt.status !== "PLANNED"
      || receipt.merge_target !== "main"
      || receipt.quality?.status !== "PASS"
      || receipt.quality?.legacy !== false
      || !Array.isArray(receipt.steps)
      || receipt.steps.length !== PLAN_STEPS.length
      || receipt.steps.some((step, index) => step?.step !== PLAN_STEPS[index] || step?.status !== "NOT_EXECUTED"),
  );
}

function runWorkloadModule(sourceFile) {
  const script = [
    "import { pathToFileURL } from 'node:url';",
    "const modulePath = process.argv[1];",
    "const moduleApi = await import(pathToFileURL(modulePath).href);",
    "const actual = typeof moduleApi.answer === 'function' ? await moduleApi.answer() : undefined;",
    "process.stdout.write(JSON.stringify({ actual }));",
  ].join(" ");
  return boundedChild(["--input-type=module", "-e", script, sourceFile], privateRoot);
}

function runWorkloadTest(testFile) {
  return boundedChild([testFile], privateRoot);
}

function runShipPlan() {
  const shipFile = path.join(privateRoot, SHIP_CLI);
  if (!isRegularFile(shipFile)) return { missing: true, status: null, stdout: "", stderr: "" };
  return boundedChild([
    shipFile,
    "plan",
    "--root",
    privateRoot,
    "--target",
    "main",
    "--report",
    QUALITY_REPORT,
    "--context",
    QUALITY_CONTEXT,
  ], privateRoot);
}

function main() {
  const bindingFile = path.join(privateRoot, ".omp", "state", "native10-workload.json");
  if (!isRegularFile(bindingFile)) {
    return { report: envelope(null, "FAIL", "WORKLOAD_BINDING_MISSING", "WORKLOAD"), exitCode: 1 };
  }

  let receipt;
  try {
    receipt = readJson(bindingFile);
  } catch {
    return { report: envelope(null, "FAIL", "WORKLOAD_BINDING_INVALID", "WORKLOAD"), exitCode: 1 };
  }
  const binding = receipt?.binding;
  if (!validBinding(binding)) {
    return { report: envelope(binding, "FAIL", "WORKLOAD_BINDING_INVALID", "WORKLOAD"), exitCode: 1 };
  }

  const sourceFile = path.resolve(privateRoot, binding.source);
  const testFile = path.resolve(privateRoot, binding.test);
  if (!insideRoot(privateRoot, sourceFile) || !insideRoot(privateRoot, testFile) || !isRegularFile(sourceFile) || !isRegularFile(testFile)) {
    return { report: envelope(binding, "FAIL", "WORKLOAD_FILES_INVALID", "WORKLOAD"), exitCode: 1 };
  }

  let sourceRevision;
  try {
    sourceRevision = sha256File(sourceFile);
  } catch {
    return { report: envelope(binding, "FAIL", "WORKLOAD_SOURCE_UNREADABLE", "WORKLOAD"), exitCode: 1 };
  }
  if (sourceRevision !== binding.revision) {
    return { report: envelope(binding, "FAIL", "WORKLOAD_REVISION_MISMATCH", "WORKLOAD"), exitCode: 1 };
  }

  const moduleRun = runWorkloadModule(sourceFile);
  const moduleResult = parseSingleJson(moduleRun.stdout);
  if (moduleRun.status !== 0 || !moduleResult || moduleResult.actual !== 2) {
    return { report: envelope(binding, "FAIL", "WORKLOAD_BEHAVIOR_INVALID", "WORKLOAD"), exitCode: 1 };
  }

  const testRun = runWorkloadTest(testFile);
  if (testRun.status !== 0) {
    return { report: envelope(binding, "FAIL", "WORKLOAD_TEST_FAILED", "WORKLOAD"), exitCode: 1 };
  }

  const planRun = runShipPlan();
  const plan = parseSingleJson(planRun.stdout);
  if (planRun.status !== 0 || invalidReceipt(plan)) {
    return { report: envelope(binding, "FAIL", "SHIP_PLAN_REJECTED", "QUALITY"), exitCode: 1 };
  }

  return {
    report: {
      status: "PASSOU",
      actual: 2,
      expected: 2,
      nonce: binding.nonce,
      assignment_id: ASSIGNMENT_ID,
      revision: binding.revision,
      workload: {
        run_id: binding.run_id,
        source: binding.source,
        revision: binding.revision,
      },
      result: {
        external: plan,
      },
    },
    exitCode: 0,
  };
}

try {
  const result = main();
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  process.exitCode = result.exitCode;
} catch {
  process.stdout.write(`${JSON.stringify(envelope(null, "FAIL", "LIFECYCLE_VALIDATOR_ERROR", "WORKLOAD"), null, 2)}\n`);
  process.exitCode = 1;
}
