// AC-013: real legacy CLI, isolated subprocess HOME; no OMP/network/model execution.
import { describe, it, expect, vi } from "vitest";
if (process.platform === "win32") vi.setConfig({ testTimeout: 90_000 });
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = join(root, ".test-temp");
fs.mkdirSync(temp, { recursive: true });
const skills = ["alignment", "bug-diagnosis", "conflict-resolution", "deep-review", "release-bootstrap", "ship", "tdd-orchestrator", "architecture", "secure-linux-web-hosting", "retro"];
const roles = {
  "backend-developer.md": "tdd-orchestrator", "frontend-developer.md": "tdd-orchestrator",
  "integrator.md": "tdd-orchestrator", "peer-reviewer.md": "tdd-orchestrator",
  "refactorer.md": "tdd-orchestrator", "spec-kit-author.md": "tdd-orchestrator",
  "test-author.md": "tdd-orchestrator", "validator.md": "tdd-orchestrator",
  "deep-reviewer.md": "deep-review", "requirements-reader.md": "alignment",
  "architect.md": "architecture", "host-operator.md": "secure-linux-web-hosting",
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function inside(base, candidate) {
  const rel = relative(resolve(base), resolve(candidate));
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function assertTemp(p) {
  if (!inside(fs.realpathSync(temp), fs.realpathSync(p)) || resolve(p) === resolve(temp)) throw new Error("refusing non-isolated test path");
}
function put(p, bytes) { fs.mkdirSync(dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); }
function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name), s = fs.lstatSync(p);
    if (s.isSymbolicLink()) return [];
    return s.isDirectory() ? files(p) : s.isFile() ? [p] : [];
  });
}
function snapshot(dir) {
  return Object.fromEntries(files(dir).map((p) => [relative(dir, p).replaceAll("\\", "/"), hash(fs.readFileSync(p))]));
}
function sandbox() {
  const box = fs.mkdtempSync(join(temp, "transaction-"));
  const home = join(box, "home"), source = join(box, "source");
  fs.mkdirSync(home); fs.mkdirSync(source);
  fs.copyFileSync(join(root, "install.mjs"), join(source, "install.mjs"));
  fs.copyFileSync(join(root, "NOTICE"), join(source, "NOTICE"));
  for (const skill of skills) fs.cpSync(join(root, skill), join(source, skill), { recursive: true });
  const agent = join(home, ".omp", "agent");
  const live = (p) => join(agent, ...p.split("/"));
  return { box, home, source, agent, live, close() { assertTemp(box); fs.rmSync(box, { recursive: true, force: true }); } };
}

// This seam changes only the child process fs boundary. It never edits installer code,
// invents success logs or replaces CLI behavior. JSON records real intercepted calls.
function preloadBoundary() {
  const fs = require("node:fs"), path = require("node:path"), childProcess = require("node:child_process");
  const originalSpawnSync = childProcess.spawnSync;
  const { syncBuiltinESMExports } = require("node:module");
  const cfg = JSON.parse(process.env.INSTALL_TRANSACTION_TEST);
  const original = Object.fromEntries(Object.keys(fs).map((k) => [k, fs[k]]));
  const state = { mutations: [], injected: false, hashFailureFd: null };
  const contained = (base, p) => {
    const r = path.relative(base, path.resolve(String(p)));
    return r !== ".." && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r);
  };
  const physicalParentAndName = (candidate) => {
    const absolute = path.resolve(String(candidate));
    const physicalParent = original.realpathSync.native(path.dirname(absolute));
    const stat = original.lstatSync(physicalParent, { bigint: true });
    return { id: `${stat.dev}:${stat.ino}`, name: path.basename(absolute) };
  };
  const matchesFailureTarget = (candidate) => {
    if (!cfg.failureTarget) return false;
    try {
      const expected = physicalParentAndName(cfg.failureTarget);
      const physical = physicalParentAndName(candidate);
      return physical.id === expected.id && physical.name === expected.name;
    } catch {
      return false;
    }
  };
  const live = (p) => cfg.liveRoots.some((base) => contained(base, p) || contained(path.resolve(String(p)), base));
  const save = () => original.writeFileSync(cfg.trace, JSON.stringify(state));
  let nested = 0;
  const originalReadFileSync = original.readFileSync;
  const originalOpenSync = original.openSync;
  fs.openSync = function(p, ...args) {
    const fd = originalOpenSync(p, ...args);
    if (
      cfg.mode === "hash-failure" &&
      cfg.hashTarget &&
      path.resolve(String(p)) === path.resolve(cfg.hashTarget)
    ) {
      state.hashFailureFd = fd;
    }
    return fd;
  };
  fs.readFileSync = function(p, ...args) {
    const resolved = typeof p === "number" ? null : path.resolve(String(p));
    const pathMatch = resolved && cfg.hashTarget && resolved === path.resolve(cfg.hashTarget);
    const fdMatch = typeof p === "number" && state.hashFailureFd === p;
    if (cfg.mode === "hash-failure" && !state.injected && (pathMatch || fdMatch)) {
      state.injected = true;
      save();
      const error = new Error(`injected hash failure for ${cfg.hashTarget}`);
      error.code = "EIO";
      throw error;
    }
    const value = originalReadFileSync(p, ...args);
    return value;
  };
  const before = (name, args) => {
    const target = /^(?:cp|copyFile|rename|link)/.test(name) ? args[1] : args[0];
    const targetPath = target == null ? "" : String(target);
    const stageUnlink = cfg.mode === "stage-unlink-failure" && name === "unlinkSync" && path.basename(targetPath).endsWith(".stage");
    if (stageUnlink && !state.injected) {
      state.mutations.push({ name, target: targetPath });
      state.injected = true;
      save();
      const error = new Error(`injected stage cleanup failure for ${targetPath}`);
      error.code = "EIO";
      throw error;
    }
    const failureTargetMatch = matchesFailureTarget(targetPath);
    if (target == null || (!live(target) && !failureTargetMatch)) return;
    state.mutations.push({ name, target: targetPath });
    if (!state.injected && name === "linkSync" && failureTargetMatch && cfg.mode === "link-failure") {
      state.injected = true;
      save();
      const error = new Error(`injected publication failure for ${targetPath}`);
      error.code = "EIO";
      throw error;
    }
    if (!state.injected && name === "linkSync" && failureTargetMatch && cfg.mode === "link-collision") {
      original.writeFileSync(targetPath, Buffer.from(cfg.foreignBase64, "base64"), { flag: "wx" });
      state.injected = true;
      save();
      const error = new Error(`injected publication collision for ${targetPath}`);
      error.code = "EEXIST";
      throw error;
    }
    save();
  };
  const after = (name, args) => {
    if (cfg.mode !== "parent-swap" || name !== "copyFileSync" || state.injected) return;
    const stage = String(args[1] ?? "");
    if (path.basename(stage) !== "0.stage") return;
    const before = original.lstatSync(cfg.parent, { bigint: true });
    const noticeBefore = original.lstatSync(path.join(cfg.parent, "NOTICE"), { bigint: true });
    original.renameSync(cfg.parent, cfg.held);
    original.mkdirSync(cfg.parent);
    original.renameSync(path.join(cfg.held, "NOTICE"), path.join(cfg.parent, "NOTICE"));
    original.writeFileSync(cfg.replacementSentinel, Buffer.from(cfg.replacementBase64, "base64"), { flag: "wx" });
    const replacement = original.lstatSync(cfg.parent, { bigint: true });
    const noticeReplacement = original.lstatSync(path.join(cfg.parent, "NOTICE"), { bigint: true });
    const held = original.lstatSync(cfg.held, { bigint: true });
    state.parentSwap = {
      stageCopied: true,
      stage,
      beforeId: `${before.dev}:${before.ino}`,
      heldId: `${held.dev}:${held.ino}`,
      replacementId: `${replacement.dev}:${replacement.ino}`,
      noticeBeforeId: `${noticeBefore.dev}:${noticeBefore.ino}`,
      noticeReplacementId: `${noticeReplacement.dev}:${noticeReplacement.ino}`,
    };
    state.injected = true;
    save();
  };
  if (cfg.mode === "native-commit-foreign") {
    childProcess.spawnSync = function(...args) {
      let payload = null;
      try { payload = JSON.parse(String(args[2]?.input ?? "")); } catch {}
      if (!state.injected && payload?.inspectOnly === false) {
        original.writeFileSync(cfg.foreignTarget, Buffer.from(cfg.foreignBase64, "base64"), { flag: "wx" });
        state.nativeCommit = { forwarded: true };
        state.injected = true;
        save();
      }
      return originalSpawnSync.apply(this, args);
    };
  }
  for (const name of ["cpSync", "copyFileSync", "renameSync", "linkSync", "unlinkSync", "writeFileSync", "appendFileSync", "truncateSync"]) {
    if (typeof original[name] !== "function") continue;
    fs[name] = function(...args) {
      if (nested) return original[name](...args);
      before(name, args);
      let value;
      nested++;
      try { value = original[name](...args); } finally { nested--; }
      after(name, args);
      return value;
    };
  }
  fs.accessSync = function(p, ...args) {
    const value = original.accessSync(p, ...args);
    if (!state.injected && cfg.trigger && path.resolve(String(p)) === cfg.trigger) {
      state.injected = true;
      if (cfg.mode === "destination-hardlink") {
        original.unlinkSync(cfg.notice); original.linkSync(cfg.external, cfg.notice);
      } else original.writeFileSync(cfg.changePath, cfg.concurrent);
      save();
    }
    return value;
  };
  // Promise APIs share the same observed boundary if implementation chooses them.
  for (const name of ["cp", "copyFile", "rename", "writeFile", "appendFile", "truncate"]) {
    const fn = fs.promises[name].bind(fs.promises);
    fs.promises[name] = async function(...args) { before(name, args); return fn(...args); };
  }
  const access = fs.promises.access.bind(fs.promises);
  fs.promises.access = async function(p, ...args) {
    await access(p, ...args);
    // Use the same mutation logic and original read-only access after the async check.
    fs.accessSync(p, ...args);
  };
  process.on("exit", save);
  syncBuiltinESMExports();
}
function run(s, args = [], seam = {}) {
  assertTemp(s.home); assertTemp(s.source);
  const trace = join(s.box, "trace.json"), preload = join(s.box, "boundary.cjs");
  fs.writeFileSync(preload, `(${preloadBoundary.toString()})();`);
  const cfg = {
    home: s.home, trace, notice: s.live("NOTICE"),
    liveRoots: [s.live("NOTICE"), s.live("skills"), s.live("agents")],
    foreign: s.live("skills/alignment/foreign-during.txt"), concurrent: "concurrent-user-edit\n", ...seam,
  };
  const result = spawnSync(process.execPath, ["--require", preload, join(s.source, "install.mjs"), ...args], {
    cwd: s.box, encoding: "utf8", timeout: 20000,
    env: { ...process.env, HOME: s.home, USERPROFILE: s.home, TMP: temp, TEMP: temp, INSTALL_TRANSACTION_TEST: JSON.stringify(cfg) },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  expect(result.error, output).toBeUndefined();
  expect(result.status, output).not.toBeNull();
  return { ...result, output, trace: fs.existsSync(trace) ? JSON.parse(fs.readFileSync(trace, "utf8")) : null };
}
function runReal(s, args = []) {
  assertTemp(s.home); assertTemp(s.source);
  const env = { ...process.env, HOME: s.home, USERPROFILE: s.home, TMP: temp, TEMP: temp };
  delete env.NODE_OPTIONS;
  delete env.INSTALL_TRANSACTION_TEST;
  const result = spawnSync(process.execPath, [join(s.source, "install.mjs"), ...args], {
    cwd: s.box, encoding: "utf8", timeout: 30000, env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  expect(result.error, output).toBeUndefined();
  expect(result.status, output).not.toBeNull();
  return { ...result, output };
}
function collectChild(child) {
  return new Promise((resolve, reject) => {
    let stdout = "", stderr = "";
    child.stdout?.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr?.on("data", chunk => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (status, signal) => resolve({ status, signal, stdout, stderr, output: stdout + stderr }));
  });
}
function waitForPath(file, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (fs.existsSync(file)) { clearInterval(timer); resolve(); return; }
      if (Date.now() - started >= timeoutMs) { clearInterval(timer); reject(new Error(`race worker readiness timeout: ${file}`)); }
    }, 5);
  });
}
// Native-race fixtures use a separate real Node process and filesystem APIs.
// They intentionally do not preload or patch the installer process.
function raceWorkerSource() {
  return String.raw`const fs = require("node:fs");
const path = require("node:path");
const cfg = JSON.parse(process.env.RACE_WORKER_CONFIG);
let watcher = null;
let poll = null;
let timeout = null;
let finished = false;
let fd = null;
let attempted = false;
const report = { mode: cfg.mode, attempts: 0, ready: false, watch: false };
function errorInfo(error) {
  return { ok: false, code: error?.code || "", message: error?.message || String(error) };
}
function save() {
  fs.writeFileSync(cfg.report, JSON.stringify(report));
}
function finish() {
  if (finished) return;
  finished = true;
  if (poll) clearInterval(poll);
  if (timeout) clearTimeout(timeout);
  try { watcher?.close(); } catch {}
  if (fd !== null) {
    try {
      const size = Number(fs.fstatSync(fd).size);
      const bytes = Buffer.alloc(size);
      let offset = 0;
      while (offset < bytes.length) offset += fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      report.fdBase64 = bytes.toString("base64");
    } catch (error) { report.fdRead = errorInfo(error); }
    try { fs.closeSync(fd); } catch {}
    fd = null;
  }
  const pathTarget = cfg.target || cfg.foreignTarget;
  if (pathTarget) {
    try { report.pathBase64 = fs.readFileSync(pathTarget).toString("base64"); } catch (error) {
      report.pathRead = errorInfo(error);
    }
  }
  save();
  process.exitCode = 0;
}
function maybeFinishAfterDone() {
  if (cfg.waitForDone && fs.existsSync(cfg.done)) finish();
}
function attempt() {
  if (finished || attempted) return;
  attempted = true;
  report.attempts += 1;
  if (cfg.mode === "ancestor-junction") {
    try {
      fs.renameSync(cfg.ancestor, cfg.preserved);
      report.rename = { ok: true };
      try {
        fs.symlinkSync(cfg.outside, cfg.ancestor, "junction");
        report.junction = { ok: true };
      } catch (error) { report.junction = errorInfo(error); }
    } catch (error) { report.rename = errorInfo(error); }
    save();
    finish();
    return;
  }
  if (cfg.mode === "equal-writer") {
    try {
      const before = fs.readFileSync(cfg.target);
      const changed = Buffer.from(before);
      if (changed.length === 0) throw Object.assign(new Error("equal target unexpectedly empty"), { code: "EEMPTY" });
      changed[0] ^= 0xff;
      report.expectedBase64 = changed.toString("base64");
      fd = fs.openSync(cfg.target, "r+");
      let offset = 0;
      while (offset < changed.length) offset += fs.writeSync(fd, changed, offset, changed.length - offset, offset);
      try { fs.fsyncSync(fd); } catch (error) { report.fsync = errorInfo(error); }
      report.write = { ok: true };
    } catch (error) { report.write = errorInfo(error); }
    save();
    maybeFinishAfterDone();
    return;
  }
  if (cfg.mode === "rollback-collision") {
    try {
      const bytes = Buffer.from(cfg.foreignBase64, "base64");
      fs.writeFileSync(cfg.foreignTarget, bytes, { flag: "wx" });
      fd = fs.openSync(cfg.foreignTarget, "r");
      report.create = { ok: true };
    } catch (error) { report.create = errorInfo(error); }
    save();
    maybeFinishAfterDone();
  }
}
function scan() {
  if (finished) return;
  try {
    const transaction = fs.readdirSync(cfg.txRoot).find(name => {
      if (!name.startsWith("install-")) return false;
      try { return fs.lstatSync(path.join(cfg.txRoot, name)).isDirectory(); } catch { return false; }
    });
    if (!transaction) return;
    const stage = path.join(cfg.txRoot, transaction, cfg.stageName);
    report.transaction = transaction;
    report.stage = cfg.stageName;
    if (fs.existsSync(stage)) attempt();
  } catch (error) {
    report.scan = errorInfo(error);
  }
  maybeFinishAfterDone();
}
process.on("uncaughtException", error => { report.error = errorInfo(error); finish(); });
try {
  watcher = fs.watch(cfg.txRoot, { persistent: true }, scan);
  report.watch = true;
} catch (error) { report.watchError = errorInfo(error); }
report.ready = true;
fs.writeFileSync(cfg.ready, "ready\n");
poll = setInterval(scan, 2);
timeout = setTimeout(() => { report.timeout = true; finish(); }, cfg.timeoutMs || 15000);
scan();`;
}
function spawnRaceWorker(config) {
  const script = join(config.box, `race-worker-${config.mode}.cjs`);
  fs.writeFileSync(script, raceWorkerSource());
  const env = { ...process.env, RACE_WORKER_CONFIG: JSON.stringify(config) };
  delete env.NODE_OPTIONS;
  delete env.INSTALL_TRANSACTION_TEST;
  const child = spawn(process.execPath, [script], {
    cwd: config.box, env, stdio: ["ignore", "pipe", "pipe"],
  });
  return { child, ready: waitForPath(config.ready), result: collectChild(child) };
}
function spawnRealInstaller(s, args = []) {
  assertTemp(s.home); assertTemp(s.source);
  const env = { ...process.env, HOME: s.home, USERPROFILE: s.home, TMP: temp, TEMP: temp };
  delete env.NODE_OPTIONS;
  delete env.INSTALL_TRANSACTION_TEST;
  return collectChild(spawn(process.execPath, [join(s.source, "install.mjs"), ...args], {
    cwd: s.box, env, stdio: ["ignore", "pipe", "pipe"],
  }));
}
function spawnExclusiveWindowsHandle(s, target) {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  const powershell = systemRoot && join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!powershell || !fs.existsSync(powershell)) throw new Error("Windows PowerShell 5.1 System32 executable unavailable for exclusive-handle fixture");
  const ready = join(s.box, "exclusive-handle-ready");
  const command = "$ErrorActionPreference='Stop'; $stream=[IO.File]::Open($env:EXCLUSIVE_TARGET,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None); try { [IO.File]::WriteAllText($env:EXCLUSIVE_READY,'ready'); [Console]::In.ReadToEnd() } finally { $stream.Dispose() }";
  const env = {
    ...process.env,
    EXCLUSIVE_TARGET: target,
    EXCLUSIVE_READY: ready,
    LOCALAPPDATA: join(s.box, "powershell-localappdata"),
    APPDATA: join(s.box, "powershell-appdata"),
  };
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  delete env.NODE_OPTIONS;
  delete env.INSTALL_TRANSACTION_TEST;
  const child = spawn(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
    cwd: s.box, env, stdio: ["pipe", "ignore", "pipe"],
  });
  return { child, ready: waitForPath(ready), result: collectChild(child), release() { child.stdin.end(); } };
}
function nativeRaceConfig(s, mode, extra = {}) {
  const txRoot = join(s.home, ".omp", "install-transactions");
  const ready = join(s.box, `${mode}-worker-ready`);
  const report = join(s.box, `${mode}-worker-report.json`);
  const done = join(s.box, `${mode}-worker-done`);
  fs.mkdirSync(txRoot, { recursive: true });
  return {
    box: s.box, mode, txRoot, ready, report, done, stageName: "0.stage", timeoutMs: 15000, ...extra,
  };
}
function workerReport(config) {
  return JSON.parse(fs.readFileSync(config.report, "utf8"));
}
const nativeWindowsTest = process.platform === "win32" && process.arch === "x64"
  ? (name, test) => it(name, { timeout: 90_000 }, test)
  : (name, test) => it.skip(`${name} — requires Windows x64 native filesystem primitives`, test);
const nodeFsBoundaryTest = process.platform === "win32"
  ? (name, test) => it.skip(`${name} — explicit Node fs seam is POSIX-only; Windows native race coverage exercises the same contract`, test)
  : it;
const sourceScopeBoundaryTest = process.platform === "win32" ? nativeWindowsTest : it;
if (process.platform === "win32") nodeFsBoundaryTest.each = (...args) => it.skip.each(...args);
function existingUserData(s) {
  put(s.live("NOTICE"), "old-notice-for-immutable-backup\n");
  put(s.live("skills/alignment/SKILL.md"), "old-alignment-for-rollback\n");
  put(s.live("skills/alignment/agents/requirements-reader.md"), "old-requirements-reader-for-rollback\n");
  put(s.live("skills/foreign-skill/SKILL.md"), "foreign-skill\n");
  put(s.live("agents/custom.md"), "foreign-agent\n");
  put(s.live("skills/alignment/local-extra.txt"), "local-extra\n");
}
function addForeignData(s) {
  put(s.live("skills/foreign-skill/SKILL.md"), "foreign skill bytes\0\n");
  put(s.live("agents/custom.md"), "foreign agent bytes\0\n");
  put(s.live("skills/alignment/local-extra.txt"), "foreign extra bytes\0\n");
}
function assertManagedContents(s) {
  for (const skill of skills) {
    const sourceRoot = join(s.source, skill);
    const destinationRoot = s.live(`skills/${skill}`);
    for (const sourceFile of files(sourceRoot)) {
      const relativeFile = relative(sourceRoot, sourceFile);
      expect(hash(fs.readFileSync(join(destinationRoot, relativeFile))), `${skill}/${relativeFile}`).toBe(hash(fs.readFileSync(sourceFile)));
    }
  }
  for (const [role, skill] of Object.entries(roles)) {
    expect(hash(fs.readFileSync(s.live(`agents/${role}`))), role).toBe(hash(fs.readFileSync(join(s.source, skill, "agents", role))));
  }
  expect(fs.readFileSync(s.live("NOTICE"))).toEqual(fs.readFileSync(join(s.source, "NOTICE")));
}

describe("install.mjs transaction contract AC-013", () => {
  it("copies every byte of all ten skills and twelve roles without shadowing security-reviewer", () => {
    const s = sandbox();
    try {
      const sourceBefore = snapshot(s.source), result = run(s);
      expect(result.status, result.output).toBe(0);
      for (const skill of skills) expect(snapshot(s.live(`skills/${skill}`)), skill).toEqual(snapshot(join(s.source, skill)));
      for (const [role, skill] of Object.entries(roles)) {
        expect(fs.existsSync(s.live(`agents/${role}`)), role).toBe(true);
        expect(hash(fs.readFileSync(s.live(`agents/${role}`)))).toBe(hash(fs.readFileSync(join(s.source, skill, "agents", role))));
      }
      expect(fs.readdirSync(s.live("skills")).sort()).toEqual([...skills].sort());
      expect(fs.readdirSync(s.live("agents")).sort()).toEqual(Object.keys(roles).sort());
      expect(fs.existsSync(s.live("agents/security-reviewer.md"))).toBe(false);
      expect(run(s, ["--check"]).status).toBe(0);
      expect(snapshot(s.source)).toEqual(sourceBefore);
    } finally { s.close(); }
  });

  it("preflights the last added role source before any destination write", () => {
    const s = sandbox();
    try {
      fs.rmSync(join(s.source, "secure-linux-web-hosting", "agents", "host-operator.md"));
      const result = run(s);
      expect(result.status, result.output).toBe(1);
      expect(result.output).toMatch(/host-operator|origem|FALTA/i);
      expect(snapshot(s.home)).toEqual({});
      expect(result.trace.mutations).toEqual([]);
    } finally { s.close(); }
  });

  it("reports and preserves foreign skills, agents, reserved native role and local extras in normal mode", () => {
    const s = sandbox();
    try {
      existingUserData(s);
      put(s.live("agents/security-reviewer.md"), "user-owned native-role configuration\n");
      const result = run(s);
      expect(result.status, result.output).toBe(0);
      for (const [p, bytes] of [["skills/foreign-skill/SKILL.md", "foreign-skill\n"], ["agents/custom.md", "foreign-agent\n"], ["skills/alignment/local-extra.txt", "local-extra\n"], ["agents/security-reviewer.md", "user-owned native-role configuration\n"]]) {
        expect(fs.readFileSync(s.live(p), "utf8")).toBe(bytes);
        expect(result.output, `must report preserved extra ${p}`).toContain(p.split("/").at(-1) === "SKILL.md" ? "foreign-skill" : p.split("/").at(-1));
      }
      const beforeCheck = snapshot(s.home), check = run(s, ["--check"]);
      expect(check.status, check.output).toBe(1);
      expect(snapshot(s.home)).toEqual(beforeCheck);
      expect(check.trace.mutations).toEqual([]);
    } finally { s.close(); }
  });


  it("keeps previous backup bytes intact across another successful installation", () => {
    const s = sandbox();
    try {
      existingUserData(s);
      const bytes = fs.readFileSync(s.live("NOTICE")), digest = hash(bytes);
      const first = run(s);
      expect(first.status, first.output).toBe(0);
      const backups = files(s.home).filter((p) => p !== s.live("NOTICE") && hash(fs.readFileSync(p)) === digest);
      expect(backups.length, "previous content must have a verifiable retained backup").toBeGreaterThan(0);
      for (const p of backups) expect(fs.lstatSync(p).nlink).toBe(1);
      put(s.live("NOTICE"), "second-user-revision\n");
      expect(run(s).status).toBe(0);
      for (const p of backups) expect(fs.readFileSync(p)).toEqual(bytes);
    } finally { s.close(); }
  });

  nodeFsBoundaryTest("restores an existing preimage when first POSIX publication fails before link", () => {
    const s = sandbox();
    try {
      existingUserData(s);
      const notice = s.live("NOTICE");
      const noticeBefore = fs.readFileSync(notice);
      const foreignBefore = {
        skill: snapshot(s.live("skills/foreign-skill")),
        agent: fs.readFileSync(s.live("agents/custom.md")),
        extra: fs.readFileSync(s.live("skills/alignment/local-extra.txt")),
      };
      const result = run(s, [], { mode: "link-failure", failureTarget: notice });
      expect(result.trace.injected, result.output).toBe(true);
      expect(result.status, result.output).toBe(1);
      expect(fs.readFileSync(notice), "first publication failure must restore the owned preimage").toEqual(noticeBefore);
      expect(snapshot(s.live("skills/foreign-skill"))).toEqual(foreignBefore.skill);
      expect(fs.readFileSync(s.live("agents/custom.md"))).toEqual(foreignBefore.agent);
      expect(fs.readFileSync(s.live("skills/alignment/local-extra.txt"))).toEqual(foreignBefore.extra);
      expect(result.output).toMatch(/E_INSTALL_DRIFT|rollback|conflito/i);
    } finally { s.close(); }
  });

  nodeFsBoundaryTest("restores an earlier preimage while preserving a foreign later destination on link EEXIST", () => {
    const s = sandbox();
    try {
      existingUserData(s);
      const firstTarget = s.live("NOTICE");
      const firstBefore = fs.readFileSync(firstTarget);
      const foreignTarget = s.live("skills/alignment/SKILL.md");
      const foreignBytes = Buffer.from("foreign destination created at publication\0\n");
      fs.rmSync(foreignTarget);
      const foreignBefore = {
        agent: fs.readFileSync(s.live("agents/custom.md")),
        extra: fs.readFileSync(s.live("skills/alignment/local-extra.txt")),
      };
      const result = run(s, [], {
        mode: "link-collision", failureTarget: foreignTarget, foreignBase64: foreignBytes.toString("base64"),
      });
      expect(result.trace.injected, result.output).toBe(true);
      expect(result.status, result.output).toBe(1);
      expect(fs.readFileSync(firstTarget), "rollback must restore the earlier owned preimage").toEqual(firstBefore);
      expect(fs.readFileSync(foreignTarget), "EEXIST must preserve the concurrent destination").toEqual(foreignBytes);
      expect(fs.readFileSync(s.live("agents/custom.md"))).toEqual(foreignBefore.agent);
      expect(fs.readFileSync(s.live("skills/alignment/local-extra.txt"))).toEqual(foreignBefore.extra);
      expect(result.output).toMatch(/E_INSTALL_DRIFT|rollback|conflito|colisão/i);
    } finally { s.close(); }
  });

  nodeFsBoundaryTest("restores an existing preimage when unlinking the published stage fails", () => {
    const s = sandbox();
    try {
      existingUserData(s);
      const notice = s.live("NOTICE");
      const noticeBefore = fs.readFileSync(notice);
      const foreignBefore = {
        skill: snapshot(s.live("skills/foreign-skill")),
        agent: fs.readFileSync(s.live("agents/custom.md")),
        extra: fs.readFileSync(s.live("skills/alignment/local-extra.txt")),
      };
      const result = run(s, [], { mode: "stage-unlink-failure" });
      expect(result.trace.injected, result.output).toBe(true);
      expect(result.status, result.output).toBe(1);
      expect(fs.readFileSync(notice), "stage cleanup failure must not leave the published bytes").toEqual(noticeBefore);
      expect(snapshot(s.live("skills/foreign-skill"))).toEqual(foreignBefore.skill);
      expect(fs.readFileSync(s.live("agents/custom.md"))).toEqual(foreignBefore.agent);
      expect(fs.readFileSync(s.live("skills/alignment/local-extra.txt"))).toEqual(foreignBefore.extra);
      expect(result.output).toMatch(/E_INSTALL_DRIFT|rollback|conflito/i);
    } finally { s.close(); }
  });

  nodeFsBoundaryTest("rejects a real parent replacement after the first stage without publishing into the replacement", () => {
    const s = sandbox();
    try {
      const notice = s.live("NOTICE");
      const noticeBefore = Buffer.from("preexisting NOTICE parent preimage\0\n");
      put(notice, noticeBefore);
      const held = join(s.box, "held-agent-parent");
      const heldSentinel = Buffer.from("held parent consumer sentinel\0\n");
      put(join(s.agent, "held-parent-sentinel.bin"), heldSentinel);
      const replacementBytes = Buffer.from("foreign replacement-parent sentinel\0\n");
      const replacementSentinel = join(s.agent, "foreign-parent-sentinel.bin");
      const externalSentinel = join(s.box, "ancestor-external-sentinel.bin");
      const externalBytes = Buffer.from([0, 7, 31, 127, 128, 255]);
      put(externalSentinel, externalBytes);
      const result = run(s, [], {
        mode: "parent-swap",
        parent: s.agent,
        held,
        replacementSentinel,
        replacementBase64: replacementBytes.toString("base64"),
      });
      expect(result.trace.injected, result.output).toBe(true);
      expect(result.trace.parentSwap?.stageCopied).toBe(true);
      expect(result.trace.parentSwap?.stage).toMatch(/(?:^|[\\/])0\.stage$/);
      expect(result.trace.parentSwap?.beforeId).toBe(result.trace.parentSwap?.heldId);
      expect(result.trace.parentSwap?.replacementId).not.toBe(result.trace.parentSwap?.beforeId);
      expect(result.status, result.output).toBe(1);
      expect(result.trace.parentSwap?.noticeBeforeId).toBe(result.trace.parentSwap?.noticeReplacementId);
      expect(fs.readFileSync(notice), "replacement parent must retain the original NOTICE object").toEqual(noticeBefore);
      expect(fs.readFileSync(join(held, "held-parent-sentinel.bin")), "held parent sentinel changed").toEqual(heldSentinel);
      expect(fs.readFileSync(replacementSentinel), "replacement parent sentinel changed").toEqual(replacementBytes);
      expect(fs.readFileSync(externalSentinel), "external sentinel changed").toEqual(externalBytes);
      expect(fs.readdirSync(s.agent).sort()).toEqual(["NOTICE", "foreign-parent-sentinel.bin"]);
      expect(snapshot(s.agent)).toEqual({
        "NOTICE": hash(noticeBefore),
        "foreign-parent-sentinel.bin": hash(replacementBytes),
      });
      expect(result.output).toMatch(/E_INSTALL_DRIFT|rollback|ancestr|conflit/i);
    } finally { s.close(); }
  });
  sourceScopeBoundaryTest("rejects a source outside the declared sourceScopes before creating any target", () => {
    const s = sandbox();
    try {
      const outside = join(s.box, "outside-source.txt");
      const target = join(s.home, "owned-target.txt");
      const outsideBytes = Buffer.from("source outside approved scope\0\n");
      put(outside, outsideBytes);
      const homeBefore = snapshot(s.home);
      const modulePath = join(root, "tdd-orchestrator", "lib", "fs-transaction", "index.mjs");
      const probe = join(s.box, "source-scope-probe.mjs");
      fs.writeFileSync(probe, [
        'import { pathToFileURL } from "node:url";',
        'const [modulePath, home, source, target, sourceScope] = process.argv.slice(2);',
        'const { transact } = await import(pathToFileURL(modulePath).href);',
        'try { transact([{ source, target }], { home, sourceScopes: [sourceScope] }); process.stdout.write("ok\\n"); }',
        'catch (error) { process.stderr.write(String(error?.message ?? error)); process.exitCode = 1; }',
      ].join("\n"));
      const env = { ...process.env, HOME: s.home, USERPROFILE: s.home, TMP: temp, TEMP: temp };
      delete env.INSTALL_TRANSACTION_TEST;
      delete env.NODE_OPTIONS;
      const result = spawnSync(process.execPath, [probe, modulePath, s.home, outside, target, s.source], {
        cwd: s.box, env, encoding: "utf8",
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/E_INSTALL_DRIFT|source|fonte|scope|escopo/i);
      expect(fs.readFileSync(outside), "out-of-scope source changed").toEqual(outsideBytes);
      expect(fs.existsSync(target), "out-of-scope source must not create target").toBe(false);
      expect(snapshot(s.home), "source-scope rejection must not create stages or HOME files").toEqual(homeBefore);
    } finally { s.close(); }
  });
  nodeFsBoundaryTest("rejects a destination hash changed after preflight without overwriting the user edit", () => {
    const s = sandbox();
    try {
      existingUserData(s);
      const before = snapshot(s.live("skills"));
      const result = run(s, [], { mode: "destination-hash", trigger: s.live("NOTICE"), changePath: s.live("NOTICE") });
      expect(result.trace.injected).toBe(true);
      expect(result.status, result.output).toBe(1);
      expect(fs.readFileSync(s.live("NOTICE"), "utf8")).toBe("concurrent-user-edit\n");
      expect(snapshot(s.live("skills"))).toEqual(before);
    } finally { s.close(); }
  });

  nodeFsBoundaryTest("rejects a source hash changed after preflight without distributing unverified bytes", () => {
    const s = sandbox();
    try {
      const notice = join(s.source, "NOTICE");
      const result = run(s, [], { mode: "source-hash", trigger: notice, changePath: notice });
      expect(result.trace.injected).toBe(true);
      expect(result.status, result.output).toBe(1);
      expect(snapshot(s.agent)).toEqual({});
      expect(fs.readFileSync(notice, "utf8")).toBe("concurrent-user-edit\n");
    } finally { s.close(); }
  });

  it("rejects a late type conflict in the added host role before applying NOTICE", () => {
    const s = sandbox();
    try {
      put(s.live("NOTICE"), "old-notice\n");
      put(s.live("agents/host-operator.md/user-marker"), "foreign\n");
      const before = snapshot(s.home), result = run(s);
      expect(result.status, result.output).toBe(1);
      expect(snapshot(s.home)).toEqual(before);
      expect(result.trace.mutations).toEqual([]);
    } finally { s.close(); }
  });

  nodeFsBoundaryTest("rejects destination hardlink swaps without touching the linked target", (context) => {
    const s = sandbox();
    try {
      const external = join(s.box, "external.txt"), notice = s.live("NOTICE");
      put(external, "outside-owned-data\n");
      try { fs.linkSync(external, notice + ".probe"); } catch (e) {
        if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV", "ENOENT"].includes(e.code)) throw e;
        // Parent is created below; ENOENT is not an unsupported capability.
        if (e.code !== "ENOENT") { context.skip(`hardlink unsupported: ${e.code}`); return; }
      }
      fs.mkdirSync(dirname(notice), { recursive: true });
      fs.rmSync(notice + ".probe", { force: true });
      try { fs.linkSync(external, notice + ".probe"); } catch (e) {
        if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(e.code)) throw e;
        context.skip(`hardlink unsupported: ${e.code}`); return;
      }
      fs.rmSync(notice + ".probe");
      existingUserData(s);
      const before = fs.readFileSync(external);
      const result = run(s, [], { mode: "destination-hardlink", trigger: notice, external });
      expect(result.trace.injected).toBe(true);
      expect(result.status, result.output).toBe(1);
      expect(fs.lstatSync(notice).nlink).toBe(2);
      expect(fs.readFileSync(external)).toEqual(before);
    } finally { s.close(); }
  });

  it("rejects source hardlinks before any destination write", (context) => {
    const s = sandbox();
    try {
      const external = join(s.box, "external.txt"), sourceFile = join(s.source, "architecture", "SKILL.md");
      put(external, "outside-owned-data\n");
      fs.rmSync(sourceFile);
      try { fs.linkSync(external, sourceFile); } catch (e) {
        if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(e.code)) throw e;
        context.skip(`hardlink unsupported: ${e.code}`); return;
      }
      const result = run(s);
      expect(result.status, result.output).toBe(1);
      expect(fs.readFileSync(external, "utf8")).toBe("outside-owned-data\n");
      expect(snapshot(s.agent)).toEqual({});
      expect(result.trace.mutations).toEqual([]);
    } finally { s.close(); }
  });

  it.each(["source", "destination"])("rejects Windows junction or directory symlink at %s without following it", (side, context) => {
    const s = sandbox();
    try {
      const outside = join(s.box, "outside"); fs.mkdirSync(outside);
      put(join(outside, "user-marker"), "do-not-touch\n");
      const managed = side === "source" ? join(s.source, "architecture") : s.live("skills/architecture");
      fs.rmSync(managed, { recursive: true, force: true });
      fs.mkdirSync(dirname(managed), { recursive: true });
      try { fs.symlinkSync(outside, managed, process.platform === "win32" ? "junction" : "dir"); } catch (e) {
        if (!["EPERM", "ENOTSUP", "EOPNOTSUPP"].includes(e.code)) throw e;
        context.skip(`directory links unsupported: ${e.code}`); return;
      }
      const before = snapshot(outside), result = run(s);
      expect(result.status, result.output).toBe(1);
      expect(snapshot(outside)).toEqual(before);
      expect(result.trace.mutations).toEqual([]);
    } finally { s.close(); }
  });
});
describe("install.mjs filesystem boundary AC-005", () => {
  nativeWindowsTest("preserves every external sentinel byte when a real worker races an ancestor after native staging", async () => {
    const s = sandbox();
    let worker = null;
    const outside = join(s.box, "outside-race");
    const raceTarget = s.live("skills/alignment/SKILL.md");
    const raceAncestor = dirname(raceTarget);
    const racePreserved = `${raceAncestor}.race-preserved`;
    const sentinels = {
      "sentinel.bin": Buffer.from("external sentinel\0must remain byte-identical\n", "utf8"),
      "keep.bin": Buffer.from([0, 1, 2, 127, 128, 255]),
    };
    try {
      fs.mkdirSync(outside, { recursive: true });
      for (const [name, bytes] of Object.entries(sentinels)) put(join(outside, name), bytes);
      addForeignData(s);
      const initial = runReal(s);
      expect(initial.status, initial.output).toBe(0);
      const changedManaged = s.live("agents/deep-reviewer.md");
      fs.writeFileSync(changedManaged, Buffer.from("user edit forces one native stage\0\n"));
      const foreignBefore = {
        skill: snapshot(s.live("skills/foreign-skill")),
        agent: fs.readFileSync(s.live("agents/custom.md")),
        extra: fs.readFileSync(s.live("skills/alignment/local-extra.txt")),
      };
      const outsideBefore = snapshot(outside);
      const config = nativeRaceConfig(s, "ancestor-junction", {
        ancestor: raceAncestor, preserved: racePreserved, outside, stageName: "0.stage",
      });
      worker = spawnRaceWorker(config);
      await worker.ready;
      const result = await spawnRealInstaller(s);
      const workerResult = await worker.result;
      expect(workerResult.status, workerResult.output).toBe(0);
      const attack = workerReport(config);
      expect(attack.watch).toBe(true);
      expect(attack.transaction).toMatch(/^install-/);
      expect(attack.stage).toBe("0.stage");
      expect(attack.attempts).toBeGreaterThan(0);
      expect(attack.rename?.ok).toBe(false);
      expect(attack.rename?.code).toMatch(/^(?:EPERM|EBUSY)$/);
      expect([0, 1]).toContain(result.status);
      if (result.status === 1) expect(result.output).toMatch(/E_INSTALL_DRIFT|drift|rollback/i);
      expect(snapshot(outside), "outside sentinel inventory changed").toEqual(outsideBefore);
      for (const [name, bytes] of Object.entries(sentinels)) {
        expect(fs.readFileSync(join(outside, name)), `external sentinel ${name} changed`).toEqual(bytes);
      }
      expect(snapshot(s.live("skills/foreign-skill"))).toEqual(foreignBefore.skill);
      expect(fs.readFileSync(s.live("agents/custom.md"))).toEqual(foreignBefore.agent);
      expect(fs.readFileSync(s.live("skills/alignment/local-extra.txt"))).toEqual(foreignBefore.extra);
      expect(fs.existsSync(racePreserved)).toBe(false);
      expect(fs.lstatSync(raceAncestor).isDirectory()).toBe(true);
      if (result.status === 0) assertManagedContents(s);
    } finally {
      if (worker?.child && worker.child.exitCode === null) {
        worker.child.kill();
        try { await worker.result; } catch {}
      }
      s.close();
    }
  });

  it.each(["source", "destination"])("--check turns an unreadable %s hash into controlled E_INSTALL_DRIFT without writing", (side) => {
    const s = sandbox();
    try {
      const initial = runReal(s);
      expect(initial.status, initial.output).toBe(0);
      const hashTarget = side === "destination"
        ? s.live("skills/alignment/SKILL.md")
        : join(s.source, "architecture", "SKILL.md");
      const before = snapshot(s.home);
      const result = run(s, ["--check"], { mode: "hash-failure", hashTarget });
      expect(result.trace?.injected, result.output).toBe(true);
      expect(result.status, result.output).toBe(1);
      expect(result.output).toMatch(/E_INSTALL_DRIFT|hash|inacessível/i);
      const label = side === "source" ? "architecture" : "alignment";
      expect(result.output).toMatch(new RegExp(`${label}.*SKILL\\.md`, "i"));
      expect(snapshot(s.home), "hash failure must not write any user data").toEqual(before);
      expect(result.trace.mutations).toEqual([]);
    } finally { s.close(); }
  });
  nativeWindowsTest("converts a real exclusive destination handle into native sharing drift without writes", async () => {
    const s = sandbox();
    let holder = null;
    try {
      const initial = runReal(s);
      expect(initial.status, initial.output).toBe(0);
      const target = s.live("agents/deep-reviewer.md");
      const concurrent = Buffer.from("destination held by an exclusive fixture\0\n");
      fs.writeFileSync(target, concurrent);
      const before = snapshot(s.home);
      holder = spawnExclusiveWindowsHandle(s, target);
      await holder.ready;
      const result = await spawnRealInstaller(s);
      holder.release();
      const holderResult = await holder.result;
      expect(holderResult.status, holderResult.output).toBe(0);
      expect(result.status, result.output).toBe(1);
      expect(result.output).toMatch(/E_INSTALL_DRIFT/i);
      expect(result.output).toMatch(/sharing|0xC0000043|NtCreateFile/i);
      expect(fs.readFileSync(target)).toEqual(concurrent);
      expect(snapshot(s.home)).toEqual(before);
    } finally {
      if (holder?.child && holder.child.exitCode === null) {
        try { holder.release(); } catch {}
        holder.child.kill();
        try { await holder.result; } catch {}
      }
      s.close();
    }
  });

  nativeWindowsTest("revalidates an equal file after a real worker attempts a post-preflight write", async () => {
    const s = sandbox();
    let worker = null;
    try {
      const initial = runReal(s);
      expect(initial.status, initial.output).toBe(0);
      addForeignData(s);
      fs.writeFileSync(s.live("agents/deep-reviewer.md"), Buffer.from("user edit forces a staged operation\0\n"));
      const equalTarget = s.live("skills/alignment/SKILL.md");
      const before = fs.readFileSync(equalTarget);
      const foreignBefore = {
        skill: snapshot(s.live("skills/foreign-skill")),
        agent: fs.readFileSync(s.live("agents/custom.md")),
        extra: fs.readFileSync(s.live("skills/alignment/local-extra.txt")),
      };
      const config = nativeRaceConfig(s, "equal-writer", { target: equalTarget, waitForDone: true });
      worker = spawnRaceWorker(config);
      await worker.ready;
      const result = await spawnRealInstaller(s);
      fs.writeFileSync(config.done, "installer-finished\n");
      const workerResult = await worker.result;
      expect(workerResult.status, workerResult.output).toBe(0);
      const attack = workerReport(config);
      expect(attack.watch).toBe(true);
      expect(attack.transaction).toMatch(/^install-/);
      expect(attack.stage).toBe("0.stage");
      expect(attack.attempts).toBeGreaterThan(0);
      expect(attack.write).toBeDefined();
      if (attack.write.ok === false) {
        expect(attack.write.code).toMatch(/^(?:EPERM|EBUSY)$/);
        expect(result.status, result.output).toBe(0);
        expect(fs.readFileSync(equalTarget)).toEqual(before);
        assertManagedContents(s);
      } else {
        expect(attack.write.ok).toBe(true);
        expect(result.status, result.output).toBe(1);
        expect(result.output).toMatch(/E_INSTALL_DRIFT|drift|alterado/i);
        expect(fs.readFileSync(equalTarget).toString("base64")).toBe(attack.expectedBase64);
        expect(attack.fdBase64).toBe(attack.expectedBase64);
      }
      expect(snapshot(s.live("skills/foreign-skill"))).toEqual(foreignBefore.skill);
      expect(fs.readFileSync(s.live("agents/custom.md"))).toEqual(foreignBefore.agent);
      expect(fs.readFileSync(s.live("skills/alignment/local-extra.txt"))).toEqual(foreignBefore.extra);
    } finally {
      if (worker?.child && worker.child.exitCode === null) {
        worker.child.kill();
        try { await worker.result; } catch {}
      }
      s.close();
    }
  });
  nativeWindowsTest("restores multiple same-basename preimages when a later destination collides", async () => {
    const s = sandbox();
    let worker = null;
    const firstTarget = s.live("skills/alignment/SKILL.md");
    const secondTarget = s.live("skills/bug-diagnosis/SKILL.md");
    const foreignTarget = s.live("skills/conflict-resolution/SKILL.md");
    const foreignBytes = Buffer.from("foreign later SKILL target\0\n");
    try {
      const initial = runReal(s);
      expect(initial.status, initial.output).toBe(0);
      const firstBefore = fs.readFileSync(firstTarget);
      const secondBefore = fs.readFileSync(secondTarget);
      fs.writeFileSync(firstTarget, Buffer.from("first user preimage\0\n"));
      fs.writeFileSync(secondTarget, Buffer.from("second user preimage\0\n"));
      fs.rmSync(foreignTarget);
      const homeBefore = snapshot(s.home);
      const config = nativeRaceConfig(s, "rollback-collision", {
        foreignTarget, foreignBase64: foreignBytes.toString("base64"), waitForDone: true, stageName: "0.stage",
      });
      worker = spawnRaceWorker(config);
      await worker.ready;
      const result = await spawnRealInstaller(s);
      fs.writeFileSync(config.done, "installer-finished\n");
      const workerResult = await worker.result;
      expect(workerResult.status, workerResult.output).toBe(0);
      const attack = workerReport(config);
      expect(attack.watch).toBe(true);
      expect(attack.transaction).toMatch(/^install-/);
      expect(attack.stage).toBe("0.stage");
      expect(attack.attempts).toBeGreaterThan(0);
      expect(attack.create?.ok).toBe(true);
      expect(attack.fdBase64).toBe(foreignBytes.toString("base64"));
      expect(attack.pathBase64).toBe(foreignBytes.toString("base64"));
      expect(result.status, result.output).toBe(1);
      expect(result.output).toMatch(/E_INSTALL_DRIFT|rollback|conflito|colisão/i);
      expect(fs.readFileSync(firstTarget)).toEqual(Buffer.from("first user preimage\0\n"));
      expect(fs.readFileSync(secondTarget)).toEqual(Buffer.from("second user preimage\0\n"));
      expect(fs.readFileSync(foreignTarget)).toEqual(foreignBytes);
      const after = snapshot(s.home);
      const foreignKey = relative(s.home, foreignTarget).replaceAll("\\", "/");
      expect(after[foreignKey]).toBe(hash(foreignBytes));
      delete after[foreignKey];
      expect(after, "rollback left an orphan or changed another HOME byte").toEqual(homeBefore);
      expect(firstBefore.equals(fs.readFileSync(firstTarget))).toBe(false);
      expect(secondBefore.equals(fs.readFileSync(secondTarget))).toBe(false);
    } finally {
      if (worker?.child && worker.child.exitCode === null) {
        worker.child.kill();
        try { await worker.result; } catch {}
      }
      s.close();
    }
  });
  nativeWindowsTest("restores the first publication while preserving a foreign second destination and its handle", async () => {
    const s = sandbox();
    let worker = null;
    const foreignTarget = s.live("skills/alignment/SKILL.md");
    const foreignBytes = Buffer.from("foreign B created after native preflight\0\n");
    try {
      const initial = runReal(s);
      expect(initial.status, initial.output).toBe(0);
      const firstTarget = s.live("NOTICE");
      const firstBefore = fs.readFileSync(firstTarget);
      fs.rmSync(foreignTarget);
      const homeBefore = snapshot(s.home);
      fs.writeFileSync(join(s.source, "NOTICE"), Buffer.concat([firstBefore, Buffer.from("\nsource fixture A changed\n")]));
      const config = nativeRaceConfig(s, "rollback-collision", {
        foreignTarget, foreignBase64: foreignBytes.toString("base64"), waitForDone: true, stageName: "0.stage",
      });
      worker = spawnRaceWorker(config);
      await worker.ready;
      const result = await spawnRealInstaller(s);
      fs.writeFileSync(config.done, "installer-finished\n");
      const workerResult = await worker.result;
      expect(workerResult.status, workerResult.output).toBe(0);
      const attack = workerReport(config);
      expect(attack.watch).toBe(true);
      expect(attack.transaction).toMatch(/^install-/);
      expect(attack.stage).toBe("0.stage");
      expect(attack.attempts).toBeGreaterThan(0);
      expect(attack.create?.ok).toBe(true);
      expect(attack.fdBase64).toBe(foreignBytes.toString("base64"));
      expect(attack.pathBase64).toBe(foreignBytes.toString("base64"));
      expect(result.status, result.output).toBe(1);
      expect(result.output).toMatch(/E_INSTALL_DRIFT|rollback|conflito|colisão/i);
      expect(fs.readFileSync(firstTarget), "first publication must be restored byte-for-byte").toEqual(firstBefore);
      expect(fs.readFileSync(foreignTarget), "foreign second destination must survive rollback").toEqual(foreignBytes);
      const after = snapshot(s.home);
      const foreignKey = relative(s.home, foreignTarget).replaceAll("\\", "/");
      expect(after[foreignKey]).toBe(hash(foreignBytes));
      delete after[foreignKey];
      expect(after, "rollback changed another home byte").toEqual(homeBefore);
    } finally {
      if (worker?.child && worker.child.exitCode === null) {
        worker.child.kill();
        try { await worker.result; } catch {}
      }
      s.close();
    }
  });
  nativeWindowsTest("preserves a foreign NOTICE created after planning before native preflight", () => {
    const s = sandbox();
    const foreignTarget = s.live("NOTICE");
    const foreignBytes = Buffer.from("foreign NOTICE created after Node planning\0\n");
    try {
      fs.mkdirSync(s.agent, { recursive: true });
      expect(fs.existsSync(foreignTarget)).toBe(false);
      const before = snapshot(s.home);
      const result = run(s, [], {
        mode: "native-commit-foreign",
        foreignTarget,
        foreignBase64: foreignBytes.toString("base64"),
      });
      expect(result.trace.nativeCommit?.forwarded, result.output).toBe(true);
      expect(result.status, result.output).toBe(1);
      expect(fs.readFileSync(foreignTarget), "native preflight must not adopt the late foreign target").toEqual(foreignBytes);
      const after = snapshot(s.home);
      const foreignKey = relative(s.home, foreignTarget).replaceAll("\\", "/");
      expect(after[foreignKey]).toBe(hash(foreignBytes));
      delete after[foreignKey];
      expect(after, "late foreign creation changed another HOME byte").toEqual(before);
    } finally { s.close(); }
  });
});


// RED_REVISION: adjacent exact filesystem IDs must never collapse into ownership.
// Real files/directories and CLI writes remain real; only stat identity fields are modeled.
function exactIdentityBoundary() {
  const fs = require("node:fs"), path = require("node:path");
  const { syncBuiltinESMExports } = require("node:module");
  const cfg = JSON.parse(process.env.EXACT_IDENTITY_TEST);
  const orig = Object.fromEntries(Object.keys(fs).map((name) => [name, fs[name]]));
  const first = 9007199254740992n, second = first + 1n;
  const mappings = new Map();
  const key = (stat) => `${stat.dev}:${stat.ino}`;
  const state = { injected: false, publications: 0, exactFirst: String(first), exactSecond: String(second), numericIdsEqual: Number(first) === Number(second), bigintReads: 0, firstActual: null, replacementActual: null, replacement: cfg.replace, dimension: cfg.dimension };
  const contained = (base, p) => {
    const rel = path.relative(base, path.resolve(String(p)));
    return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  };
  const physicalParentAndName = (candidate) => {
    const absolute = path.resolve(String(candidate));
    const physicalParent = orig.realpathSync.native(path.dirname(absolute));
    const stat = orig.lstatSync(physicalParent, { bigint: true });
    return { id: key(stat), name: path.basename(absolute), path: path.join(physicalParent, path.basename(absolute)) };
  };
  function rememberFirst(real) {
    if (!state.firstActual) { state.firstActual = key(real); mappings.set(key(real), first); }
  }
  function modeled(stat, real, options) {
    if (options?.bigint) state.bigintReads++;
    const id = mappings.get(key(real));
    if (id === undefined || cfg.dimension === "real") return stat;
    // Honor the actual fs API contract: bigint:true returns exact integer fields.
    // Number stats intentionally model the API precision loss for these valid IDs.
    const value = (n) => options?.bigint ? n : Number(n);
    if (cfg.dimension === "ino") stat.ino = value(id);
    if (cfg.dimension === "dev") { stat.dev = value(id); stat.ino = value(17n); }
    return stat;
  }
  fs.lstatSync = function(p, options) {
    const stat = orig.lstatSync(p, options), real = orig.lstatSync(p, { bigint: true });
    if (!state.firstActual && contained(cfg.home, p)) {
      if (cfg.kind === "new-dir") {
        if (path.resolve(String(p)) === cfg.target && real.isDirectory()) rememberFirst(real);
      } else if (real.isFile() && orig.readFileSync(p).toString("base64") === cfg.installedBytes) {
        rememberFirst(real);
      }
    }
    return modeled(stat, real, options);
  };
  fs.fstatSync = function(fd, options) {
    return modeled(orig.fstatSync(fd, options), orig.fstatSync(fd, { bigint: true }), options);
  };
  const failAfterPublication = (from, target) => {
    let physical;
    try {
      physical = physicalParentAndName(target);
    } catch {
      return;
    }
    let targetMatches = false;
    try {
      const expected = physicalParentAndName(cfg.target);
      targetMatches = physical.id === expected.id && physical.name === expected.name;
    } catch {}
    if (!targetMatches && (cfg.kind !== "new-dir" || !contained(cfg.target, physical.path))) return;
    if (state.injected) return;
    state.publications++;
    if (state.publications !== 1) return;
    state.injected = true;
    if (cfg.replace && cfg.kind !== "new-dir") {
      const bytes = orig.readFileSync(target);
      orig.renameSync(target, cfg.held);
      orig.unlinkSync(from);
      orig.writeFileSync(target, bytes, { flag: "wx" });
      const real = orig.lstatSync(target, { bigint: true });
      mappings.set(key(real), second); state.replacementActual = key(real);
      state.replacementBytes = bytes.toString("base64");
    } else {
      orig.unlinkSync(from);
      if (cfg.replace && cfg.kind === "new-dir") {
        const detached = `${cfg.held}.child`;
        orig.renameSync(target, detached);
        orig.renameSync(cfg.target, cfg.held);
        orig.mkdirSync(cfg.target);
        const real = orig.lstatSync(cfg.target, { bigint: true });
        mappings.set(key(real), second); state.replacementActual = key(real);
      }
    }
    const error = new Error("injected apply failure after publication identity replacement");
    error.code = "EIO"; throw error;
  };
  fs.linkSync = function(from, to) {
    const result = orig.linkSync(from, to);
    failAfterPublication(from, to);
    return result;
  };
  fs.mkdirSync = function(directory, ...args) {
    const result = orig.mkdirSync(directory, ...args);
    if (cfg.kind === "new-dir" && !state.firstActual && path.resolve(String(directory)) === path.resolve(cfg.target)) {
      rememberFirst(orig.lstatSync(cfg.target, { bigint: true }));
    }
    return result;
  };
  process.on("exit", () => orig.writeFileSync(cfg.trace, JSON.stringify(state)));
  syncBuiltinESMExports();
}

const exactIdentityCases = [
  { name: "real identities preserve a replacement of an existing file", kind: "existing-file", dimension: "real", replace: true },
  { name: "exact high inode preserves a replacement of an existing file", kind: "existing-file", dimension: "ino", replace: true },
  { name: "exact high device preserves a replacement of an existing file", kind: "existing-file", dimension: "dev", replace: true },
  { name: "same exact high inode permits uncontested restoration", kind: "existing-file", dimension: "ino", replace: false },
  { name: "same exact high device permits uncontested restoration", kind: "existing-file", dimension: "dev", replace: false },
  { name: "exact high inode preserves a replacement of a transaction-created file", kind: "new-file", dimension: "ino", replace: true },
  { name: "exact high device preserves a replacement of a transaction-created file", kind: "new-file", dimension: "dev", replace: true },
  { name: "exact high inode preserves a replacement of a transaction-created directory", kind: "new-dir", dimension: "ino", replace: true },
  { name: "exact high device preserves a replacement of a transaction-created directory", kind: "new-dir", dimension: "dev", replace: true },
];

describe("install.mjs exact identity RED_REVISION AC-013 P1", () => {
  for (const scenario of exactIdentityCases) nodeFsBoundaryTest(scenario.name, () => {
    const s = sandbox();
    try {
      assertTemp(s.home); assertTemp(s.source);
      if (scenario.kind === "existing-file") put(s.live("NOTICE"), "pre-transaction-user-notice\n");
      const target = scenario.kind === "new-dir" ? s.live("skills/alignment") : s.live("NOTICE");
      const trace = join(s.box, "exact-id-trace.json"), preload = join(s.box, "exact-id-boundary.cjs");
      fs.writeFileSync(preload, `(${exactIdentityBoundary.toString()})();`);
      const cfg = { ...scenario, target, home: s.home, held: join(s.box, "user-held-original"), trace,
        installedBytes: fs.readFileSync(join(s.source, "NOTICE")).toString("base64"),
        liveRoots: [s.live("NOTICE"), s.live("skills"), s.live("agents")] };
      const result = spawnSync(process.execPath, ["--require", preload, join(s.source, "install.mjs")], {
        cwd: s.box, encoding: "utf8", timeout: 20000,
        env: { ...process.env, HOME: s.home, USERPROFILE: s.home, TMP: temp, TEMP: temp, EXACT_IDENTITY_TEST: JSON.stringify(cfg) },
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(1);
      expect(fs.existsSync(trace), "subprocess must report real fs interception").toBe(true);
      const observed = JSON.parse(fs.readFileSync(trace, "utf8"));
      expect(observed.injected, output).toBe(true);
      expect(observed.firstActual, "original installed filesystem identity must be observed").not.toBeNull();
      expect(observed.exactFirst).not.toBe(observed.exactSecond);
      expect(observed.numericIdsEqual).toBe(true);
      if (scenario.replace) {
        expect(observed.replacementActual).not.toBe(observed.firstActual);
        expect(fs.existsSync(target), "rollback must preserve a different filesystem object even when Number IDs collide").toBe(true);
        if (scenario.kind === "new-dir") expect(fs.lstatSync(target).isDirectory()).toBe(true);
        else expect(fs.readFileSync(target).toString("base64"), "rollback must not replace equal-byte user file with stale preimage").toBe(observed.replacementBytes);
        expect(output).toMatch(/rollback parcial|concurr|concorr|conflit/i);
        expect(output).not.toMatch(/rollback conclu[ií]do/i);
      } else {
        expect(fs.readFileSync(target, "utf8"), "unchanged exact identity still belongs to this transaction").toBe("pre-transaction-user-notice\n");
        expect(output).toMatch(/rollback conclu[ií]do/i);
      }
    } finally { s.close(); }
  });
});
