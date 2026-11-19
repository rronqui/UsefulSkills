#!/usr/bin/env node
// Permanent source-only RED consumer regression for T-011 / AC-016.
//
// The CLI is exercised through a fresh disposable lab.  Node itself is passed
// as --omp on purpose: it is a valid executable but not an OMP/SDK binary, so
// its RPC flags fail before model, network, or authentication work.  The
// assertion is about the consumer boundary and bytes observed on disk, not
// about source wiring or a native PASS.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const NATIVE_RELEASE = dirname(THIS_FILE);
const ALIGNMENT_SOURCE = join(NATIVE_RELEASE, "alignment.mjs");
const REPO_ROOT = resolve(NATIVE_RELEASE, "../..");
const EXPECTED_FILE_COUNT = 136;
const INSTALLER_SKILLS = [
  "alignment",
  "bug-diagnosis",
  "conflict-resolution",
  "deep-review",
  "release-bootstrap",
  "ship",
  "tdd-orchestrator",
  "architecture",
  "secure-linux-web-hosting",
  "retro",
];
const INSTALLER_AGENTS = [
  ["tdd-orchestrator", "agents", "backend-developer.md"],
  ["tdd-orchestrator", "agents", "frontend-developer.md"],
  ["tdd-orchestrator", "agents", "integrator.md"],
  ["tdd-orchestrator", "agents", "peer-reviewer.md"],
  ["tdd-orchestrator", "agents", "refactorer.md"],
  ["tdd-orchestrator", "agents", "spec-kit-author.md"],
  ["tdd-orchestrator", "agents", "test-author.md"],
  ["tdd-orchestrator", "agents", "validator.md"],
  ["deep-review", "agents", "deep-reviewer.md"],
  ["alignment", "agents", "requirements-reader.md"],
  ["architecture", "agents", "architect.md"],
  ["secure-linux-web-hosting", "agents", "host-operator.md"],
];

function setupFailure(message) {
  const error = new Error(message);
  error.name = "ProbeSetupError";
  throw error;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function inside(root, candidate) {
  const rootValue = resolve(root);
  const candidateValue = resolve(candidate);
  const rest = relative(rootValue, candidateValue);
  return rest === "" || (rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest));
}

function regular(file, label) {
  if (!existsSync(file)) setupFailure(`${label} is missing: ${file}`);
  const info = lstatSync(file);
  if (info.isSymbolicLink() || !info.isFile() || (typeof info.nlink === "number" && info.nlink > 1)) {
    setupFailure(`${label} is not a regular single-link file: ${file}`);
  }
}

function sourceFiles(root, skill) {
  const base = join(root, skill);
  const result = [];
  const visit = (directory) => {
    const names = readdirSync(directory).sort();
    for (const name of names) {
      const file = join(directory, name);
      const info = lstatSync(file);
      if (info.isSymbolicLink()) setupFailure(`source contains a symbolic link: ${file}`);
      if (info.isDirectory()) visit(file);
      else if (info.isFile() && (typeof info.nlink !== "number" || info.nlink <= 1)) {
        result.push({ file, relativePath: relative(base, file).replaceAll("\\", "/") });
      } else {
        setupFailure(`source contains an unsafe file: ${file}`);
      }
    }
  };
  if (!existsSync(base) || !lstatSync(base).isDirectory()) setupFailure(`source skill is missing: ${base}`);
  visit(base);
  if (result.length === 0) setupFailure(`source skill is empty: ${base}`);
  return result;
}

function sourceSnapshot(root) {
  const rows = [];
  for (const skill of INSTALLER_SKILLS) {
    for (const item of sourceFiles(root, skill)) {
      const bytes = readFileSync(item.file);
      rows.push({ path: `${skill}/${item.relativePath}`, sha256: sha256(bytes), bytes: bytes.byteLength });
    }
  }
  for (const [skill, subdir, fileName] of INSTALLER_AGENTS) {
    const file = join(root, skill, subdir, fileName);
    regular(file, `source agent ${skill}/${subdir}/${fileName}`);
    const bytes = readFileSync(file);
    rows.push({ path: `${skill}/${subdir}/${fileName}`, sha256: sha256(bytes), bytes: bytes.byteLength });
  }
  rows.sort((left, right) => left.path.localeCompare(right.path));
  if (rows.length !== EXPECTED_FILE_COUNT) setupFailure(`expected ${EXPECTED_FILE_COUNT} managed source files, found ${rows.length}`);
  return rows;
}

function snapshotDigest(rows) {
  return sha256(Buffer.from(rows.map((row) => `${row.path}\0${row.sha256}\0${row.bytes}`).join("\n"), "utf8"));
}

function parseSummary(run) {
  const lines = `${run.stdout}\n${run.stderr}`.split(/\r?\n/).reverse();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // Only a JSON object emitted by the driver is accepted below.
    }
  }
  setupFailure(`alignment CLI emitted no JSON summary; stdout=${run.stdout} stderr=${run.stderr}`);
}

function collectTree(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const info = lstatSync(file);
      const relativePath = relative(root, file).replaceAll("\\", "/");
      if (info.isSymbolicLink()) files.push({ relativePath, kind: "symlink" });
      else if (info.isDirectory()) visit(file);
      else if (info.isFile()) files.push({ relativePath, kind: "file", bytes: readFileSync(file) });
      else files.push({ relativePath, kind: "special" });
    }
  };
  visit(root);
  return files;
}

function managedOverlayProof(manifest, overlayRoot) {
  const actual = collectTree(overlayRoot);
  const filesByPath = new Map(actual.filter((item) => item.kind === "file").map((item) => [item.relativePath, item]));
  const missing = [];
  const mismatches = [];
  for (const row of manifest) {
    const copied = filesByPath.get(row.destination);
    if (!copied) {
      missing.push(row.destination);
      continue;
    }
    if (copied.bytes.byteLength !== row.bytes || sha256(copied.bytes).toLowerCase() !== row.sha256.toLowerCase()) {
      mismatches.push(row.destination);
    }
  }
  const expectedDestinations = new Set(manifest.map((row) => row.destination));
  const extras = actual.filter((item) => item.kind !== "file" || !expectedDestinations.has(item.relativePath)).map((item) => item.relativePath);
  return {
    fileCount: actual.filter((item) => item.kind === "file").length,
    missing,
    mismatches,
    extras,
  };
}

function runFreshCli(lab, isolatedHome) {
  const args = [
    ALIGNMENT_SOURCE,
    "--source", REPO_ROOT,
    "--lab", lab,
    "--phase", "green",
    "--timeout-ms", "30000",
    "--omp", process.execPath,
  ];
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: "file",
  };
  const run = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    env,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (run.error) setupFailure(`alignment CLI could not start: ${run.error.code ?? run.error.message}`);
  if (run.signal) setupFailure(`alignment CLI was terminated by signal ${run.signal}`);
  return { args, run, summary: parseSummary(run) };
}

function main() {
  regular(ALIGNMENT_SOURCE, "alignment CLI source");
  if (!/^node(?:\.exe)?$/i.test(basename(process.execPath))) {
    setupFailure(`process.execPath is not a Node executable: ${process.execPath}`);
  }

  const probeRoot = mkdtempSync(join(tmpdir(), "alignment-fresh-source-red-"));
  const lab = join(probeRoot, "lab");
  const isolatedHome = join(probeRoot, "home");
  mkdirSync(lab);
  mkdirSync(isolatedHome);
  const sourceBefore = sourceSnapshot(REPO_ROOT);
  const sourceBeforeDigest = snapshotDigest(sourceBefore);
  const { args, run, summary } = runFreshCli(lab, isolatedHome);
  if (typeof summary.evidence !== "string" || !isAbsolute(summary.evidence)) {
    setupFailure(`alignment CLI summary has no absolute evidence path: ${JSON.stringify(summary)}`);
  }
  const evidencePath = resolve(summary.evidence);
  if (!inside(lab, evidencePath)) setupFailure(`evidence escaped the fresh lab: ${evidencePath}`);
  regular(evidencePath, "alignment evidence");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const runRoot = dirname(evidencePath);
  const sourceCapture = evidence.source_capture;
  const packageRoot = resolve(String(sourceCapture?.package_root ?? ""));
  if (!inside(runRoot, packageRoot)) setupFailure(`frozen package escaped the run root: ${packageRoot}`);
  const manifestPath = join(packageRoot, "MANIFEST.json");
  regular(manifestPath, "frozen package manifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest)) setupFailure("frozen package manifest is not an array");
  const manifestSha256 = sha256(readFileSync(manifestPath));
  const overlayRoot = join(runRoot, "green-local", ".omp");
  const overlay = managedOverlayProof(manifest, overlayRoot);
  const sourceAfter = sourceSnapshot(REPO_ROOT);
  const changedSource = sourceBefore.filter((row, index) => JSON.stringify(row) !== JSON.stringify(sourceAfter[index])).map((row) => row.path);
  const sourceAfterDigest = snapshotDigest(sourceAfter);
  const scenario = Array.isArray(evidence.scenarios) ? evidence.scenarios.find((item) => item?.label === "GREEN-local") : null;
  const session = scenario?.session;
  const failureText = JSON.stringify(evidence.failure ?? {});
  const controlledStartupFailure = summary.status === "BLOCKED"
    && run.status === 2
    && evidence.failure?.kind === "BLOCKED"
    && typeof evidence.failure?.code === "string"
    && evidence.failure.code.startsWith("RPC_")
    && evidence.failure.code !== "ERR_INVALID_ARG_TYPE"
    && evidence.failure?.error_meta?.name !== "TypeError"
    && !/undefined.*packagePath|packagePath.*undefined|ERR_INVALID_ARG_TYPE/i.test(failureText)
    && scenario !== null
    && Array.isArray(session?.calls)
    && session.calls.every((call) => call?.type === "abort")
    && Array.isArray(session?.results)
    && session.results.length === 0
    && Array.isArray(session?.tool_events)
    && session.tool_events.length === 0
    && session?.terminal === null
    && session?.process?.closed === true
    && Number.isInteger(session?.process?.exit_code)
    && session.process.exit_code !== 0;
  const overlayInstalled = sourceCapture?.files === EXPECTED_FILE_COUNT
    && manifest.length === EXPECTED_FILE_COUNT
    && manifestSha256 === sourceCapture?.manifest_sha256
    && overlay.fileCount === EXPECTED_FILE_COUNT
    && overlay.missing.length === 0
    && overlay.mismatches.length === 0
    && overlay.extras.length === 0;
  const sourcePreserved = sourceBefore.length === sourceAfter.length && changedSource.length === 0 && sourceBeforeDigest === sourceAfterDigest;
  const proof = {
    probe: "alignment-fresh-source-red",
    phase: "RED",
    command: [process.execPath, ...args],
    evidence: evidencePath,
    source_capture_files: sourceCapture?.files ?? null,
    manifest_sha256: sourceCapture?.manifest_sha256 ?? null,
    failure: {
      status: summary.status ?? null,
      exit_code: run.status,
      code: evidence.failure?.code ?? null,
      kind: evidence.failure?.kind ?? null,
      scenario_count: Array.isArray(evidence.scenarios) ? evidence.scenarios.length : null,
      rpc_calls: Array.isArray(session?.calls) ? session.calls.length : null,
    },
    overlay: {
      root: overlayRoot,
      file_count: overlay.fileCount,
      missing_count: overlay.missing.length,
      mismatch_count: overlay.mismatches.length,
      extra_count: overlay.extras.length,
    },
    source_before_sha256: sourceBeforeDigest,
    source_after_sha256: sourceAfterDigest,
    source_changed_count: changedSource.length,
    controlled_startup_failure: controlledStartupFailure,
    overlay_installed: overlayInstalled,
    source_preserved: sourcePreserved,
  };
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  assert.ok(
    controlledStartupFailure && overlayInstalled && sourcePreserved,
    `fresh CLI must install all ${EXPECTED_FILE_COUNT} exact overlay files before a controlled invalid-SDK startup failure without changing the source root: ${JSON.stringify(proof)}`,
  );
}

main();
