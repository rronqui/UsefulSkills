import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createGitSession } from "../../scripts/lib/git-trust-source.mjs";
import { windowsHostPath } from "../../tdd-orchestrator/lib/fs-transaction/index.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const OUTPUT_PATH = path.join(SCRIPT_DIR, "results.json");
const SESSION_COUNT = 5;
const NODE_STARTUP_COUNT = 5;
const QUERY = Object.freeze(["rev-parse", "--git-dir"]);
const DEFAULT_WORKTREE = "C:/Users/Ricar/AppData/Local/Temp/usefulskills-audit-CdmZsI/ship-native-profile-5e25dd6a-c4bd-4dbe-8dcb-b8637e57b65d/review-fixture/worktrees/review";
const WORKTREE = process.env.GUARD_STARTUP_WORKTREE || DEFAULT_WORKTREE;
const SAMPLE_PLAN = Object.freeze(Array.from({ length: SESSION_COUNT }, (_, index) => Object.freeze({
  session: index + 1,
  query: QUERY,
})));
const NODE_STARTUP_CODE = "process.stdout.write('guard-startup-ready')";
const EXPECTED_WRAPPER_SHA256 = "81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5";
const EXPECTED_GIT_SHA256 = "cab4c4eea1d869cf9f7be73868dc9a90ad2df1b1b673e5f8c8714a576c25ea96";

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let bytes;
    do {
      bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes > 0) hash.update(buffer.subarray(0, bytes));
    } while (bytes > 0);
    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

function parentResourceSnapshot() {
  const cpu = process.cpuUsage();
  const usage = typeof process.resourceUsage === "function" ? process.resourceUsage() : null;
  const memory = process.memoryUsage();
  return {
    cpu_user_us: cpu.user,
    cpu_system_us: cpu.system,
    resource_max_rss_kib: usage?.maxRSS ?? null,
    rss_bytes: memory.rss,
    heap_used_bytes: memory.heapUsed,
    external_bytes: memory.external,
  };
}

function subtractResource(after, before) {
  const delta = {};
  for (const key of Object.keys(after)) {
    delta[key] = after[key] === null || before[key] === null ? null : after[key] - before[key];
  }
  return delta;
}

function resultSnapshot(result) {
  return {
    status: result?.status ?? null,
    stdout: String(result?.stdout ?? ""),
    stderr: String(result?.stderr ?? ""),
    error_code: result?.error?.code ?? null,
  };
}

function measure(label, operation) {
  const before = parentResourceSnapshot();
  const started = process.hrtime.bigint();
  const result = operation();
  const elapsed = process.hrtime.bigint() - started;
  const after = parentResourceSnapshot();
  return {
    label,
    wall_ns: elapsed.toString(),
    parent_resource_delta: subtractResource(after, before),
    result,
  };
}

function classifyExecutable(executable) {
  const basename = path.win32.basename(String(executable));
  if (/^powershell\.exe$/i.test(basename)) return "native_admission";
  if (/^git(?:\.exe)?$/i.test(basename)) return "git";
  return "unexpected";
}

function validateKnownWorktree(cwd) {
  assert.equal(process.platform, "win32", "native guard metric requires Windows");
  assert.equal(process.arch, "x64", "native guard metric requires x64");
  const normalized = path.win32.normalize(cwd).replaceAll("/", "\\");
  assert.match(
    normalized,
    /\\usefulskills-audit-[^\\]+\\ship-native-profile-[0-9a-f-]+\\review-fixture\\worktrees\\review$/i,
    "worktree must be the known private linked-worktree fixture",
  );
  const worktreeStat = fs.lstatSync(cwd);
  assert.ok(worktreeStat.isDirectory() && !worktreeStat.isSymbolicLink(), "worktree must be a real directory");
  const gitPointer = path.join(cwd, ".git");
  const gitPointerStat = fs.lstatSync(gitPointer);
  assert.ok(gitPointerStat.isFile() && !gitPointerStat.isSymbolicLink(), "worktree .git pointer must be a regular file");
  const pointer = fs.readFileSync(gitPointer, "utf8").trim();
  const match = /^gitdir:\s*(.+)$/i.exec(pointer);
  assert.ok(match, "worktree must use a linked .git pointer");
  const gitDir = path.resolve(cwd, match[1]);
  assert.ok(fs.statSync(gitDir).isDirectory(), "linked worktree gitdir must exist");
  const commonDirFile = path.join(gitDir, "commondir");
  assert.ok(fs.statSync(commonDirFile).isFile(), "linked worktree commondir must exist");
  const commonDir = path.resolve(gitDir, fs.readFileSync(commonDirFile, "utf8").trim());
  assert.ok(fs.statSync(commonDir).isDirectory(), "linked worktree common git directory must exist");
  return { linked: true, pointer_sha256: sha256Bytes(pointer) };
}

function safeSpawnRecord({ session, phase, executable, args, options, result }) {
  const role = classifyExecutable(executable);
  return {
    sequence: null,
    session,
    phase,
    role,
    executable_basename: path.win32.basename(String(executable)),
    args: role === "git" ? [...args] : null,
    argument_count: args.length,
    argument_code_units: args.map((value) => String(value).length),
    script_sha256: role === "native_admission" ? sha256Bytes(String(args.at(-1) ?? "")) : null,
    shell: options?.shell ?? null,
    windows_hide: options?.windowsHide ?? null,
    status: result?.status ?? null,
    error_code: result?.error?.code ?? null,
  };
}

function runNodeStartupSamples() {
  const command = ["--input-type=module", "-e", NODE_STARTUP_CODE];
  const samples = [];
  for (let index = 0; index < NODE_STARTUP_COUNT; index += 1) {
    const measured = measure(`node-startup-${index + 1}`, () => spawnSync(process.execPath, command, {
      cwd: SCRIPT_DIR,
      env: {},
      shell: false,
      windowsHide: true,
      encoding: "utf8",
    }));
    const snapshot = resultSnapshot(measured.result);
    assert.equal(snapshot.status, 0, `Node startup child ${index + 1} failed`);
    assert.equal(snapshot.stdout, "guard-startup-ready", `Node startup child ${index + 1} did not reach readiness`);
    assert.equal(snapshot.stderr, "", `Node startup child ${index + 1} wrote stderr`);
    samples.push({
      sample: index + 1,
      wall_ns: measured.wall_ns,
      parent_resource_delta: measured.parent_resource_delta,
      child_status: snapshot.status,
      child_stdout_sha256: sha256Bytes(snapshot.stdout),
      child_stderr_sha256: sha256Bytes(snapshot.stderr),
    });
  }
  return {
    sample_count: samples.length,
    command,
    environment_policy: "empty child environment; no inherited secrets exported",
    parent_scope: "the measuring Node process only; child CPU/memory are not measured",
    samples,
  };
}

function runGuardedSessions() {
  const spawnEvents = [];
  let active = null;
  const actualSpawn = (executable, args, options) => {
    const result = spawnSync(executable, args, options);
    const record = safeSpawnRecord({
      session: active?.session ?? null,
      phase: active?.phase ?? "outside-session",
      executable,
      args,
      options,
      result,
    });
    record.sequence = spawnEvents.length + 1;
    spawnEvents.push({ ...record, executable_path: String(executable) });
    return result;
  };

  const sessions = [];
  for (const plan of SAMPLE_PLAN) {
    let session;
    const startEvent = spawnEvents.length;
    try {
      session = createGitSession({
        fs,
        path,
        os,
        crypto,
        spawnSync: actualSpawn,
        platform: process.platform,
        env: process.env,
        windowsHostPath,
      });
      active = { session: plan.session, phase: "cold" };
      const cold = measure(`guarded-session-${plan.session}-cold`, () => session.run(plan.query, { cwd: WORKTREE }));
      active = { session: plan.session, phase: "warm" };
      const warm = measure(`guarded-session-${plan.session}-warm`, () => session.run(plan.query, { cwd: WORKTREE }));
      active = null;

      const coldOutput = resultSnapshot(cold.result);
      const warmOutput = resultSnapshot(warm.result);
      assert.equal(coldOutput.status, 0, `cold Git query ${plan.session} failed`);
      assert.equal(warmOutput.status, 0, `warm Git query ${plan.session} failed`);
      assert.equal(coldOutput.error_code, null, `cold Git query ${plan.session} returned an error`);
      assert.equal(warmOutput.error_code, null, `warm Git query ${plan.session} returned an error`);
      assert.equal(coldOutput.stdout, warmOutput.stdout, `cold/warm Git query ${plan.session} output changed`);
      assert.equal(coldOutput.stderr, warmOutput.stderr, `cold/warm Git query ${plan.session} stderr changed`);

      const events = spawnEvents.slice(startEvent);
      const nativeEvents = events.filter((event) => event.role === "native_admission");
      const gitEvents = events.filter((event) => event.role === "git");
      const unexpectedEvents = events.filter((event) => event.role === "unexpected");
      assert.equal(nativeEvents.length, 1, `session ${plan.session} must admit once`);
      assert.equal(gitEvents.length, 2, `session ${plan.session} must spawn Git once per query`);
      assert.deepEqual(events.map((event) => event.role), ["native_admission", "git", "git"], `session ${plan.session} must admit before either Git spawn`);
      assert.ok(events.every((event) => event.status === 0), `session ${plan.session} had a failed child process`);
      assert.equal(events.filter((event) => event.phase === "warm" && event.role === "native_admission").length, 0, `session ${plan.session} duplicated warm admission`);
      assert.equal(unexpectedEvents.length, 0, `session ${plan.session} used an unexpected child executable`);
      assert.ok(events.every((event) => event.shell === false && event.windows_hide === true), `session ${plan.session} changed shell/window controls`);
      assert.ok(gitEvents.every((event) => JSON.stringify(event.args) === JSON.stringify(QUERY)), `session ${plan.session} used a non-readonly Git tuple`);

      sessions.push({
        session: plan.session,
        query: [...QUERY],
        cold: {
          wall_ns: cold.wall_ns,
          parent_resource_delta: cold.parent_resource_delta,
          output: coldOutput,
        },
        warm: {
          wall_ns: warm.wall_ns,
          parent_resource_delta: warm.parent_resource_delta,
          output: warmOutput,
        },
        admission_child_count: nativeEvents.length,
        git_spawn_count: gitEvents.length,
        warm_admission_child_count: events.filter((event) => event.phase === "warm" && event.role === "native_admission").length,
        outputs_identical: true,
        admission_amortization_wall_delta_ns: (BigInt(cold.wall_ns) - BigInt(warm.wall_ns)).toString(),
      });
    } finally {
      active = null;
      session?.close();
    }
  }

  const publicEvents = spawnEvents.map(({ executable_path: _executablePath, ...event }) => event);
  return { sessions, spawn_events: publicEvents, spawnEvents };
}

function binaryDetails(spawnEvents) {
  const gitEvent = spawnEvents.find((event) => event.role === "git");
  const nativeEvent = spawnEvents.find((event) => event.role === "native_admission");
  assert.ok(gitEvent?.executable_path, "no admitted Git executable was observed");
  assert.ok(nativeEvent?.executable_path, "no native admission executable was observed");
  const gitPath = gitEvent.executable_path;
  const nativePath = nativeEvent.executable_path;
  const normalizedGitPath = path.win32.normalize(gitPath).toLowerCase();
  const expectedGitHash = normalizedGitPath.endsWith("\\cmd\\git.exe") ? EXPECTED_WRAPPER_SHA256 : EXPECTED_GIT_SHA256;
  const measuredGitHash = sha256File(gitPath);
  const measuredNativeHash = sha256File(nativePath);
  assert.equal(measuredGitHash, expectedGitHash, "admitted Git binary hash changed from the pinned official provenance");
  return {
    node: {
      version: process.version,
      executable_sha256: sha256File(process.execPath),
    },
    admitted_git: {
      role: normalizedGitPath.endsWith("\\cmd\\git.exe") ? "official-wrapper" : "official-git-entrypoint",
      expected_sha256: expectedGitHash,
      measured_sha256: measuredGitHash,
      unchanged: measuredGitHash === expectedGitHash,
    },
    native_host: {
      basename: path.win32.basename(nativePath),
      executable_sha256: measuredNativeHash,
    },
  };
}

function buildResults({ startedAt, fixture, startup, guarded, binaries }) {
  const nativeAdmissionCount = guarded.spawn_events.filter((event) => event.role === "native_admission").length;
  const gitSpawnCount = guarded.spawn_events.filter((event) => event.role === "git").length;
  const warmAdmissionCount = guarded.spawn_events.filter((event) => event.role === "native_admission" && event.phase === "warm").length;
  assert.equal(nativeAdmissionCount, SESSION_COUNT, "native admission must occur exactly once per independent session");
  assert.equal(gitSpawnCount, SESSION_COUNT * 2, "Git must execute exactly once for each cold and warm query");
  assert.equal(warmAdmissionCount, 0, "warm queries must not repeat metadata admission");
  assert.ok(guarded.spawn_events.every((event) => event.role === "native_admission" || event.role === "git"), "only the native admission and Git children may be observed");
  assert.ok(guarded.spawn_events.every((event) => event.shell === false && event.windows_hide === true), "all guarded children must retain shell=false and windowsHide=true");

  const finishedAt = new Date().toISOString();
  return {
    status: "PASS",
    task: "T-015",
    acceptance_criteria: ["AC-020"],
    command: "node implementation-evidence/metrics/guard-startup.mjs",
    started_at: startedAt,
    finished_at: finishedAt,
    sample_design: {
      session_count: SESSION_COUNT,
      sessions_independent: true,
      execution_order: "serial; one fresh createGitSession per session",
      query: [...QUERY],
      query_kind: "read-only rev-parse --git-dir",
      worktree_scope: "known private linked worktree only; no fixture writes or new branch",
      worktree_binding: fixture,
    },
    measurements: {
      node_startup: startup,
      guarded_git: {
        sessions: guarded.sessions,
        spawn_events: guarded.spawn_events,
        native_admission_child_count: nativeAdmissionCount,
        git_spawn_count: gitSpawnCount,
        duplicate_metadata_admissions: warmAdmissionCount,
        parent_scope: "wall time and parent-process CPU/resource deltas only; child and system-wide CPU/memory are not measured",
        timing_interpretation: "cold minus warm is within-session admission amortization, not a version-before/after speedup",
      },
    },
    hashes: {
      source: {
        guard_factory_sha256: sha256File(path.resolve(SCRIPT_DIR, "../../scripts/lib/git-trust-source.mjs")),
        windows_host_helper_sha256: sha256File(path.resolve(SCRIPT_DIR, "../../tdd-orchestrator/lib/fs-transaction/index.mjs")),
        measurement_script_sha256: sha256File(SCRIPT_PATH),
      },
      binaries,
      platform: {
        descriptor: {
          platform: process.platform,
          arch: process.arch,
          os_release: os.release(),
          endianness: os.endianness(),
        },
        descriptor_sha256: sha256Bytes(JSON.stringify({
          platform: process.platform,
          arch: process.arch,
          os_release: os.release(),
          endianness: os.endianness(),
        })),
      },
    },
    official_git_provenance: {
      product_version: "2.54.0.windows.1",
      architecture: "x64",
      signer: "Johannes Schindelin",
      certificate_fingerprint: "3E:B1:4A:3A:EF:84:B7:15:3E:13:93:97:F0:A4:9E:2F:AC:66:2B:0E",
      binary_hash_unchanged: binaries.admitted_git.unchanged,
    },
    metrics_correctness: {
      status: "PASS",
      invariants: {
        meaningful_admission_once_per_session: nativeAdmissionCount === SESSION_COUNT,
        identical_cold_warm_query_outputs: guarded.sessions.every((session) => session.outputs_identical),
        no_duplicated_metadata_admission: warmAdmissionCount === 0,
        exact_readonly_tuple_only: guarded.spawn_events.filter((event) => event.role === "git").every((event) => JSON.stringify(event.args) === JSON.stringify(QUERY)),
        security_controls_retained: guarded.spawn_events.every((event) => event.shell === false && event.windows_hide === true),
      },
      instrumentation: "spawn observer delegates to real child_process.spawnSync and returns its result object unchanged; observer metadata is not substituted for native output",
    },
    security_controls: {
      actual_factory: "createGitSession",
      actual_windows_host_helper: "windowsHostPath",
      shell_false: true,
      windows_hide_true: true,
      forbidden_git_flags_invoked: [],
      direct_unadmitted_git_invoked: false,
      fallback_path_invoked: false,
      inherited_environment_serialized: false,
      node_startup_child_environment: "empty",
      worktree_mutation: false,
    },
    limits: {
      prior_uncontrolled_observations: "19.10s/3.46s observations were not a controlled benchmark and are not reused as a comparison",
      not_measured: {
        model_latency: { status: "NOT_MEASURED", value: null, reason: "No OMP model-serving call is made by this probe" },
        token_usage: { status: "NOT_MEASURED", value: null, reason: "Git output contains no model/token data" },
        model_cost: { status: "NOT_MEASURED", value: null, reason: "No model or billing source is observed" },
        review_time_or_quality: { status: "NOT_MEASURED", value: null, reason: "No review execution is made by this probe" },
        retry_count_or_backoff: { status: "NOT_MEASURED", value: null, reason: "No retry mechanism is exercised" },
        fallback_or_serving: { status: "NOT_MEASURED", value: null, reason: "No fallback or model serving is exercised" },
        child_or_systemwide_resources: { status: "NOT_MEASURED", value: null, reason: "Only parent-process CPU/resource information is sampled" },
        version_before_after_speedup: { status: "NOT_MEASURED", value: null, reason: "Cold/warm is admission amortization within one version, not a version comparison" },
        arbitrary_worktree_effects: { status: "NOT_MEASURED", value: null, reason: "Only the known private linked worktree is used" },
        external_scheduler_parallelism: { status: "NOT_MEASURED", value: null, reason: "The harness is serial and cannot prove behavior of an external scheduler" },
      },
      remaining_ac020_limits: [
        "No OMP/model latency, token, cost, serving, or batch metric is observed.",
        "No review duration/quality metric is observed.",
        "No retry count, retry backoff, or fallback metric is observed.",
        "No child-process or system-wide CPU/memory metric is observed.",
        "Cold/warm timing is admission amortization only; it is not a before/after release speedup.",
        "The serial five-session sample cannot establish external scheduler parallelism or all-workload behavior.",
        "The 19.10s/3.46s historical observations remain uncontrolled and are not compared.",
      ],
    },
  };
}

function main() {
  const startedAt = new Date().toISOString();
  const fixture = validateKnownWorktree(WORKTREE);
  const startup = runNodeStartupSamples();
  const guarded = runGuardedSessions();
  const binaries = binaryDetails(guarded.spawnEvents);
  const results = buildResults({ startedAt, fixture, startup, guarded, binaries });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    status: results.status,
    command: results.command,
    sessions: SESSION_COUNT,
    native_admission_child_count: results.measurements.guarded_git.native_admission_child_count,
    git_spawn_count: results.measurements.guarded_git.git_spawn_count,
    duplicate_metadata_admissions: results.measurements.guarded_git.duplicate_metadata_admissions,
    results_file: "implementation-evidence/metrics/results.json",
  })}\n`);
}

main();
