// AC-005: real fs-transaction boundary regressions. No production seams or mocked host responses.
import { describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import nodeFs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { transact } from "../tdd-orchestrator/lib/fs-transaction/index.mjs";

if (process.platform === "win32") vi.setConfig({ testTimeout: 90_000 });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = path.join(repoRoot, ".test-temp");
fs.mkdirSync(tempRoot, { recursive: true });
const childProcess = createRequire(import.meta.url)("node:child_process");

function assertOwnedTemp(candidate) {
  const base = path.resolve(tempRoot) + path.sep;
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(base) || resolved === path.resolve(tempRoot)) {
    throw new Error(`refusing non-isolated fs-transaction fixture: ${candidate}`);
  }
}

function sandbox(prefix) {
  const box = fs.mkdtempSync(path.join(tempRoot, prefix));
  const home = path.join(box, "home");
  const scope = path.join(box, "scope");
  const outside = path.join(box, "outside");
  fs.mkdirSync(home);
  fs.mkdirSync(scope);
  fs.mkdirSync(outside);
  return {
    box,
    home,
    scope,
    outside,
    close() {
      assertOwnedTemp(box);
      fs.rmSync(box, { recursive: true, force: true });
    },
  };
}

function waitForFile(file, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (fs.existsSync(file)) {
        resolve();
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`filesystem race worker readiness timeout: ${file}`));
        return;
      }
      setTimeout(poll, 5);
    };
    poll();
  });
}

function raceWorkerSource() {
  return String.raw`const fs = require("node:fs");
const path = require("node:path");
const cfg = JSON.parse(process.env.FS_TRANSACTION_RACE_CONFIG);
const report = { ready: false, stageSeen: false, sentinelCreated: false, transaction: "", sentinel: "" };
let finished = false;
function save() { fs.writeFileSync(cfg.report, JSON.stringify(report)); }
function finish() { if (finished) return; finished = true; save(); process.exit(0); }
function scan() {
  if (finished) return;
  let names;
  try { names = fs.readdirSync(cfg.transactionRoot); } catch (error) {
    report.scanError = { code: error?.code || "", message: error?.message || String(error) };
    names = [];
  }
  for (const name of names) {
    if (!name.startsWith("install-")) continue;
    const transaction = path.join(cfg.transactionRoot, name);
    try {
      if (!fs.lstatSync(transaction).isDirectory()) continue;
    } catch { continue; }
    report.transaction = name;
    const stage = path.join(transaction, "0.stage");
    if (fs.existsSync(stage)) report.stageSeen = true;
    const sentinel = path.join(transaction, cfg.sentinelName);
    if (!report.sentinelCreated) {
      try {
        fs.writeFileSync(sentinel, Buffer.from(cfg.foreignBase64, "base64"), { flag: "wx" });
        report.sentinelCreated = true;
        report.sentinel = sentinel;
      } catch (error) {
        if (error?.code === "EEXIST") {
          report.sentinelCreated = true;
          report.sentinel = sentinel;
        } else {
          report.sentinelError = { code: error?.code || "", message: error?.message || String(error) };
        }
      }
    }
    if (report.sentinelCreated) {
      finish();
      return;
    }
  }
  if (Date.now() >= cfg.deadline) {
    report.timedOut = true;
    finish();
    return;
  }
  setTimeout(scan, 1);
}
try {
  report.ready = true;
  fs.writeFileSync(cfg.ready, "ready\\n");
} catch (error) {
  report.readyError = { code: error?.code || "", message: error?.message || String(error) };
  finish();
  return;
}
scan();`;
}

function spawnRaceWorker(fixture, foreignBytes) {
  const transactionRoot = path.join(fixture.home, ".omp", "install-transactions");
  const workerScript = path.join(fixture.box, "fs-transaction-race-worker.cjs");
  const ready = path.join(fixture.box, "fs-transaction-race.ready");
  const report = path.join(fixture.box, "fs-transaction-race.report.json");
  fs.mkdirSync(transactionRoot, { recursive: true });
  fs.writeFileSync(workerScript, raceWorkerSource());
  const env = {
    ...process.env,
    FS_TRANSACTION_RACE_CONFIG: JSON.stringify({
      transactionRoot,
      ready,
      report,
      sentinelName: "foreign-sentinel.bin",
      foreignBase64: Buffer.from(foreignBytes).toString("base64"),
      deadline: Date.now() + 15_000,
    }),
  };
  delete env.NODE_OPTIONS;
  const child = spawn(process.execPath, [workerScript], {
    cwd: fixture.box,
    env,
    stdio: "ignore",
  });
  const done = new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", error => finish({ error }));
    child.once("close", (status, signal) => finish({ status, signal }));
  });
  return { child, ready: waitForFile(ready), done, report };
}

function raceReport(race) {
  return JSON.parse(fs.readFileSync(race.report, "utf8"));
}

function publicationFixture() {
  const fixture = sandbox("fs-transaction-retain-false-");
  const targetsDir = path.join(fixture.home, "targets");
  fs.mkdirSync(targetsDir);
  const operations = [];
  const oldBytes = [];
  const newBytes = [];
  for (let index = 0; index < 4; index += 1) {
    const source = path.join(fixture.scope, `source-${index}.bin`);
    const target = path.join(targetsDir, `target-${index}.bin`);
    const next = Buffer.alloc(1024 * 1024, 0x4e + index);
    const previous = Buffer.alloc(1024 * 1024, 0x4f + index);
    next.write(`new-${index}\\n`, 0, "utf8");
    previous.write(`old-${index}\\n`, 0, "utf8");
    fs.writeFileSync(source, next);
    fs.writeFileSync(target, previous);
    operations.push({ source, target, retainBackup: false });
    oldBytes.push(previous);
    newBytes.push(next);
  }
  return { fixture, operations, oldBytes, newBytes };
}

function quarantineRollbackFixture() {
  const fixture = sandbox("fs-transaction-quarantine-");
  const targetsDir = path.join(fixture.home, "targets");
  fs.mkdirSync(targetsDir);
  const firstSource = path.join(fixture.scope, "first-source.bin");
  const secondSource = path.join(fixture.scope, "second-source.bin");
  const firstTarget = path.join(targetsDir, "first-target.bin");
  const secondTarget = path.join(targetsDir, "second-target.bin");
  const firstOldBytes = Buffer.from("first old bytes\n");
  const firstNewBytes = Buffer.from("first new bytes\n");
  const secondOldBytes = Buffer.from("second old bytes\n");
  const secondNewBytes = Buffer.from("second new bytes\n");
  fs.writeFileSync(firstSource, firstNewBytes);
  fs.writeFileSync(secondSource, secondNewBytes);
  fs.writeFileSync(firstTarget, firstOldBytes);
  fs.writeFileSync(secondTarget, secondOldBytes);
  const externalSentinel = path.join(fixture.outside, "external-sentinel.bin");
  const externalBytes = Buffer.from("external sentinel must survive\n");
  fs.writeFileSync(externalSentinel, externalBytes);
  const externalIdentity = fs.lstatSync(externalSentinel, { bigint: true });
  return {
    fixture,
    firstSource,
    secondSource,
    firstTarget,
    secondTarget,
    firstOldBytes,
    firstNewBytes,
    secondOldBytes,
    externalSentinel,
    externalIdentity,
    externalBytes,
    operations: [
      { source: firstSource, target: firstTarget, retainBackup: false },
      { source: secondSource, target: secondTarget, retainBackup: false },
    ],
  };
}

function replaceQuarantineAtPublishedStage({
  secondSource,
  foreignBytes,
  externalSentinel,
  replacement,
}) {
  const originalUnlinkSync = fs.unlinkSync;
  const injection = { called: false, quarantine: null, identity: null };
  const unlinkSpy = vi.spyOn(nodeFs, "unlinkSync").mockImplementation((file, ...args) => {
    const result = originalUnlinkSync(file, ...args);
    if (!injection.called && path.basename(String(file)) === "0.stage") {
      injection.called = true;
      injection.quarantine = path.join(path.dirname(String(file)), "0.backup.quarantine");
      originalUnlinkSync(injection.quarantine);
      if (replacement === "regular") {
        fs.writeFileSync(injection.quarantine, foreignBytes, { flag: "wx" });
      } else {
        fs.symlinkSync(externalSentinel, injection.quarantine);
      }
      injection.identity = fs.lstatSync(injection.quarantine, { bigint: true });
      fs.writeFileSync(secondSource, Buffer.from("second source changed after publication\n"));
    }
    return result;
  });
  return { injection, restore: () => unlinkSpy.mockRestore() };
}
function singleFileTransactionFixture(prefix) {
  const fixture = sandbox(prefix);
  const targetsDir = path.join(fixture.home, "targets");
  fs.mkdirSync(targetsDir);
  const source = path.join(fixture.scope, "source.bin");
  const target = path.join(targetsDir, "target.bin");
  const oldBytes = Buffer.from("original target bytes\n");
  const newBytes = Buffer.from("staged replacement bytes\n");
  fs.writeFileSync(source, newBytes);
  fs.writeFileSync(target, oldBytes);
  return { fixture, source, target, oldBytes, newBytes };
}

function replaceParentWithSymlinkAtPublication({ target, parent, outside, pivotAfterRename = false }) {
  const originalRenameSync = nodeFs.renameSync;
  const originalUnlinkSync = nodeFs.unlinkSync;
  const physicalParentAndName = candidate => {
    const absolute = path.resolve(String(candidate));
    const lexicalParent = path.dirname(absolute);
    const physicalParent = fs.realpathSync.native(lexicalParent);
    const stat = fs.lstatSync(physicalParent, { bigint: true });
    return {
      id: `${stat.dev}:${stat.ino}`,
      name: path.basename(absolute),
    };
  };
  const targetPhysical = physicalParentAndName(target);
  const outsideTarget = path.join(outside, targetPhysical.name);
  const injection = {
    called: false,
    preserved: null,
    publicationSyscallReturned: false,
    afterPublication: null,
    outsideObservations: [],
  };
  const inspectOutsideTarget = () => {
    try {
      const stat = fs.lstatSync(outsideTarget, { bigint: true });
      const observation = {
        exists: true,
        id: `${stat.dev}:${stat.ino}`,
        bytes: fs.readFileSync(outsideTarget),
        symbolicLink: stat.isSymbolicLink(),
      };
      injection.outsideObservations.push(observation);
      return observation;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const observation = { exists: false, id: null, bytes: null, symbolicLink: false };
      injection.outsideObservations.push(observation);
      return observation;
    }
  };
  const pivot = () => {
    injection.preserved = `${parent}.preserved`;
    originalRenameSync(parent, injection.preserved);
    nodeFs.symlinkSync(outside, parent);
    injection.called = true;
  };
  const unlinkSpy = vi.spyOn(nodeFs, "unlinkSync").mockImplementation((from, ...args) => {
    let candidate;
    try {
      candidate = physicalParentAndName(from);
    } catch {
      candidate = null;
    }
    const isPublication = !injection.called
      && candidate
      && candidate.id === targetPhysical.id
      && candidate.name === targetPhysical.name;
    if (!isPublication) {
      const result = originalUnlinkSync(from, ...args);
      if (injection.called) inspectOutsideTarget();
      return result;
    }
    if (!pivotAfterRename) pivot();
    const result = originalUnlinkSync(from, ...args);
    injection.publicationSyscallReturned = true;
    if (pivotAfterRename) {
      pivot();
      injection.afterPublication = inspectOutsideTarget();
    } else if (injection.called) {
      inspectOutsideTarget();
    }
    return result;
  });
  return { injection, restore: () => unlinkSpy.mockRestore() };
}

function pivotParentAfterLinkPublication({ target, parent, outside }) {
  const originalLinkSync = nodeFs.linkSync;
  const originalRenameSync = nodeFs.renameSync;
  const physicalParentAndName = candidate => {
    const absolute = path.resolve(String(candidate));
    const lexicalParent = path.dirname(absolute);
    const physicalParent = fs.realpathSync.native(lexicalParent);
    const stat = fs.lstatSync(physicalParent, { bigint: true });
    return {
      id: `${stat.dev}:${stat.ino}`,
      name: path.basename(absolute),
    };
  };
  const targetPhysical = physicalParentAndName(target);
  const outsideTarget = path.join(outside, targetPhysical.name);
  const injection = {
    called: false,
    preserved: null,
    publicationSyscallReturned: false,
    afterPublication: null,
  };
  const linkSpy = vi.spyOn(nodeFs, "linkSync").mockImplementation((from, to, ...args) => {
    const result = originalLinkSync(from, to, ...args);
    let candidate;
    try {
      candidate = physicalParentAndName(to);
    } catch {
      candidate = null;
    }
    const isPublication = !injection.called
      && candidate
      && candidate.id === targetPhysical.id
      && candidate.name === targetPhysical.name;
    if (isPublication) {
      injection.publicationSyscallReturned = true;
      injection.preserved = `${parent}.preserved`;
      originalRenameSync(parent, injection.preserved);
      nodeFs.symlinkSync(outside, parent);
      injection.called = true;
      const stat = fs.lstatSync(outsideTarget, { bigint: true });
      injection.afterPublication = {
        id: `${stat.dev}:${stat.ino}`,
        bytes: fs.readFileSync(outsideTarget),
      };
    }
    return result;
  });
  return { injection, restore: () => linkSpy.mockRestore() };
}

// This test-only seam executes the real native script and NtSetInformationFile;
// it never fakes link counts or replaces the host receipt.
function injectWindowsHardlinkDuringStaging({ aliasParent, aliasName }) {
  const marker = "  $directoryCreationLedger = [Collections.Generic.List[object]]::new()";
  const originalSpawnSync = childProcess.spawnSync;
  const state = { commandPatched: false };
  const quote = value => String(value).replaceAll("'", "''");
  const injection = String.raw`
function SetTestHardlink($file,$root,[string]$name) {
  $u = Unicode $name
  $size = 20 + $u.Length
  $info = [Runtime.InteropServices.Marshal]::AllocHGlobal($size)
  $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16)
  try {
    [Runtime.InteropServices.Marshal]::Copy([byte[]]::new($size),0,$info,$size)
    [Runtime.InteropServices.Marshal]::Copy([byte[]]::new(16),0,$ios,16)
    [Runtime.InteropServices.Marshal]::WriteByte($info,0,0)
    [Runtime.InteropServices.Marshal]::WriteIntPtr($info,8,$root)
    [Runtime.InteropServices.Marshal]::WriteInt32($info,16,$u.Length)
    [Runtime.InteropServices.Marshal]::Copy($u.Bytes,0,[IntPtr]::Add($info,20),$u.Length)
    $status = $native::NtSetInformationFile($file,$ios,$info,[uint32]$size,11)
    return ([int]$status -ge 0)
  } finally {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($ios)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($info)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Value)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Buffer)
  }
}
function OpenTestMetadata($root,[string]$name) {
  $u = Unicode $name
  $oa = ObjectAttributes $root $u
  $out = [Runtime.InteropServices.Marshal]::AllocHGlobal([IntPtr]::Size)
  $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16)
  try {
    $status = $native::NtCreateFile($out,0x100080,$oa,$ios,[IntPtr]::Zero,0,7,1,0x200020,[IntPtr]::Zero,0)
    CheckStatus $status 'NtCreateFile metadata hardlink fallback'
    $handle = [Runtime.InteropServices.Marshal]::ReadIntPtr($out)
    if ($handle -eq [IntPtr]::Zero) { Fail 'metadata hardlink fallback returned null handle' }
    $allHandles.Add($handle)
    return $handle
  } finally {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($ios)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($out)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($oa)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Value)
    [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Buffer)
  }
}
$hardlinkRecord = $owned[0]
$aliasRoot = OpenChain '${quote(aliasParent)}' $true $false $false $false
$metadata = OpenTestMetadata $hardlinkRecord.Target.Parent $hardlinkRecord.Target.Name
if (-not (SetTestHardlink $metadata $aliasRoot.Handle '${quote(aliasName)}')) {
  Fail 'real hardlink seam could not create the alias'
}
`;
  const spawnSpy = vi.spyOn(childProcess, "spawnSync").mockImplementation((executable, args, options) => {
    const nextArgs = [...args];
    const commandIndex = nextArgs.indexOf("-Command") + 1;
    const command = commandIndex > 0 ? nextArgs[commandIndex] : null;
    if (!state.commandPatched && typeof command === "string" && command.includes(marker)) {
      nextArgs[commandIndex] = command.replace(marker, `${injection}\n${marker}`);
      state.commandPatched = true;
    }
    return originalSpawnSync(executable, nextArgs, options);
  });
  syncBuiltinESMExports();
  return {
    state,
    restore() {
      spawnSpy.mockRestore();
      syncBuiltinESMExports();
    },
  };
}

function precreateForeignReservation({ mode, foreignBytes }) {
  const originalCopyFileSync = nodeFs.copyFileSync;
  const trigger = mode === "backup" ? "0.stage" : "0.backup";
  const reservationName = mode === "backup" ? "0.backup" : "0.backup.quarantine";
  const injection = { called: false, path: null, identity: null };
  const copySpy = vi.spyOn(nodeFs, "copyFileSync").mockImplementation((from, to, ...args) => {
    const result = originalCopyFileSync(from, to, ...args);
    if (!injection.called && path.basename(String(to)) === trigger) {
      injection.path = path.join(path.dirname(String(to)), reservationName);
      nodeFs.writeFileSync(injection.path, foreignBytes, { flag: "wx" });
      injection.identity = fs.lstatSync(injection.path, { bigint: true });
      injection.called = true;
    }
    return result;
  });
  return { injection, restore: () => copySpy.mockRestore() };
}

function createQuarantineAfterMissingReservation(foreignBytes) {
  const originalLstatSync = nodeFs.lstatSync;
  const injection = {
    called: false,
    observedMissing: false,
    path: null,
    identity: null,
  };
  const lstatSpy = vi.spyOn(nodeFs, "lstatSync").mockImplementation((file, ...args) => {
    try {
      return originalLstatSync(file, ...args);
    } catch (error) {
      if (
        !injection.called
        && error?.code === "ENOENT"
        && path.basename(String(file)) === "0.backup.quarantine"
      ) {
        injection.observedMissing = true;
        injection.path = String(file);
        nodeFs.writeFileSync(injection.path, foreignBytes, { flag: "wx" });
        injection.identity = originalLstatSync(injection.path, { bigint: true });
        injection.called = true;
      }
      throw error;
    }
  });
  return { injection, restore: () => lstatSpy.mockRestore() };
}

function replaceBackupAtCleanup(foreignBytes) {
  const originalUnlinkSync = nodeFs.unlinkSync;
  const injection = { called: false, path: null, identity: null };
  const unlinkSpy = vi.spyOn(nodeFs, "unlinkSync").mockImplementation((file, ...args) => {
    const result = originalUnlinkSync(file, ...args);
    if (!injection.called && path.basename(String(file)) === "0.backup.quarantine") {
      injection.path = path.join(path.dirname(String(file)), "0.backup");
      originalUnlinkSync(injection.path);
      nodeFs.writeFileSync(injection.path, foreignBytes, { flag: "wx" });
      injection.identity = fs.lstatSync(injection.path, { bigint: true });
      injection.called = true;
    }
    return result;
  });
  return { injection, restore: () => unlinkSpy.mockRestore() };
}

function failSecondSourceAfterFirstPublication(secondSource) {
  const originalUnlinkSync = nodeFs.unlinkSync;
  const injection = { called: false };
  const unlinkSpy = vi.spyOn(nodeFs, "unlinkSync").mockImplementation((file, ...args) => {
    const result = originalUnlinkSync(file, ...args);
    if (!injection.called && path.basename(String(file)) === "0.stage") {
      nodeFs.writeFileSync(secondSource, Buffer.from("second source changed during rollback\n"));
      injection.called = true;
    }
    return result;
  });
  return { injection, restore: () => unlinkSpy.mockRestore() };
}

function replaceRollbackTargetAfterHardlink({
  target,
  foreignBytes,
  parent = null,
  outside = null,
  pivotBeforeHardlink = false,
}) {
  const originalLinkSync = nodeFs.linkSync;
  const originalRenameSync = nodeFs.renameSync;
  const physicalParentAndName = candidate => {
    const absolute = path.resolve(String(candidate));
    const lexicalParent = path.dirname(absolute);
    const physicalParent = fs.realpathSync.native(lexicalParent);
    const stat = fs.lstatSync(physicalParent, { bigint: true });
    return {
      id: `${stat.dev}:${stat.ino}`,
      name: path.basename(absolute),
    };
  };
  const targetPhysical = physicalParentAndName(target);
  const injection = {
    called: false,
    identity: null,
    orphan: null,
    parentPivoted: false,
    publicationSyscallReturned: false,
    preserved: null,
  };
  const pivotParent = () => {
    if (!parent || !outside) throw new Error("rollback parent-pivot fixture requires parent and outside");
    injection.preserved = `${parent}.preserved`;
    originalRenameSync(parent, injection.preserved);
    nodeFs.symlinkSync(outside, parent);
    injection.parentPivoted = true;
  };
  const linkSpy = vi.spyOn(nodeFs, "linkSync").mockImplementation((from, to, ...args) => {
    let candidate;
    try {
      candidate = physicalParentAndName(from);
    } catch {
      candidate = null;
    }
    const isRollbackHardlink = !injection.called
      && candidate
      && candidate.id === targetPhysical.id
      && candidate.name === targetPhysical.name
      && path.basename(path.resolve(String(to))).endsWith(".foreign");
    if (!isRollbackHardlink) return originalLinkSync(from, to, ...args);

    injection.orphan = path.resolve(String(to));
    if (pivotBeforeHardlink) pivotParent();
    const result = originalLinkSync(from, to, ...args);
    injection.publicationSyscallReturned = true;
    if (!pivotBeforeHardlink) {
      nodeFs.rmSync(target);
      nodeFs.writeFileSync(target, foreignBytes, { flag: "wx" });
      injection.identity = fs.lstatSync(target, { bigint: true });
    }
    injection.called = true;
    return result;
  });
  return { injection, restore: () => linkSpy.mockRestore() };
}

// These races require real POSIX symlink/rename/link/unlink semantics and an
// owned writable temp fixture. On Windows the parent runs them under WSL/Linux.
const posixBoundaryIt = ["linux", "darwin"].includes(process.platform)
  ? it
  : (name, test) => it.skip(`${name} — requires POSIX real-FS interleavings (run under WSL/Linux)`, test);


const supportedBoundary = ["linux", "darwin", "win32"].includes(process.platform)
  && (process.platform !== "win32" || process.arch === "x64");
const boundaryIt = supportedBoundary ? it : it.skip;
const linuxParentPivotIt = process.platform === "linux"
  ? it
  : (name, test) => it.skip(`${name} — requires Linux parent-pivot real-FS interleavings`, test);
const windowsBoundaryIt = process.platform === "win32" && process.arch === "x64"
  ? it
  : (name, test) => it.skip(`${name} — requires Windows x64 native FS interleaving`, test);



describe("AC-005 fs-transaction boundary", () => {
  boundaryIt("verifies generated content without replacing an identical readonly target", () => {
    const { fixture, target, oldBytes } = singleFileTransactionFixture("fs-transaction-readonly-content-");
    fs.chmodSync(target, 0o444);
    const before = fs.lstatSync(target, { bigint: true });
    try {
      expect(transact([{ content: oldBytes, target, verify: true }], { home: fixture.home }).ok).toBe(true);
      const after = fs.lstatSync(target, { bigint: true });
      expect(after.ino).toBe(before.ino);
      expect(after.mtimeNs).toBe(before.mtimeNs);
      expect(after.mode).toBe(before.mode);
      expect(fs.readFileSync(target)).toEqual(oldBytes);
      expect(() => transact([{ content: Buffer.from("different\n"), target, verify: true }], { home: fixture.home })).toThrow(/divergente/);
      expect(fs.readFileSync(target)).toEqual(oldBytes);
    } finally {
      fs.chmodSync(target, 0o644);
      fixture.close();
    }
  });

  boundaryIt("rejects source reads without an explicit trusted scope before publication", () => {
    const { fixture, source, target, oldBytes } = singleFileTransactionFixture("fs-transaction-empty-scopes-");
    const before = fs.lstatSync(target, { bigint: true });
    try {
      expect(() => transact([{ source, target }], { home: fixture.home, sourceScopes: [] })).toThrow(/escopo/);
      expect(fs.readFileSync(target)).toEqual(oldBytes);
      expect(fs.lstatSync(target, { bigint: true }).ino).toBe(before.ino);
      expect(fs.existsSync(path.join(fixture.home, ".omp"))).toBe(false);
    } finally { fixture.close(); }
  });
  windowsBoundaryIt("rejects a real hardlink added after initial pinning before commit", () => {
    const { fixture, source, target, oldBytes } = singleFileTransactionFixture("fs-transaction-windows-hardlink-");
    const aliasName = "foreign-target-hardlink.bin";
    const alias = path.join(fixture.outside, aliasName);
    const sentinel = path.join(fixture.outside, "foreign-sentinel.bin");
    const sentinelBytes = Buffer.from("foreign sentinel must survive\n");
    fs.writeFileSync(sentinel, sentinelBytes);
    const sentinelIdentity = fs.lstatSync(sentinel, { bigint: true });
    const targetIdentity = fs.lstatSync(target, { bigint: true });
    const seam = injectWindowsHardlinkDuringStaging({
      aliasParent: fixture.outside,
      aliasName,
    });
    let result;
    let error;
    try {
      try {
        result = transact([{ source, target, retainBackup: false }], {
          home: fixture.home,
          sourceScopes: [fixture.scope],
        });
      } catch (caught) {
        error = caught;
      }

      expect(seam.state.commandPatched, "the real native transaction script must receive the staging seam").toBe(true);
      expect(fs.existsSync(alias), "the kernel must create the concurrent hardlink alias").toBe(true);
      expect(result, "a hardlink added after pinning must not report success").toBeUndefined();
      expect(error, "a changed link set must fail closed").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.readFileSync(target), "rollback must preserve the target preimage").toEqual(oldBytes);
      const targetAfter = fs.lstatSync(target, { bigint: true });
      expect(`${targetAfter.dev}:${targetAfter.ino}`).toBe(`${targetIdentity.dev}:${targetIdentity.ino}`);
      const aliasAfter = fs.lstatSync(alias, { bigint: true });
      expect(`${aliasAfter.dev}:${aliasAfter.ino}`).toBe(`${targetIdentity.dev}:${targetIdentity.ino}`);
      expect(fs.readFileSync(alias)).toEqual(oldBytes);
      expect(fs.readFileSync(sentinel), "foreign outside data must remain unchanged").toEqual(sentinelBytes);
      const sentinelAfter = fs.lstatSync(sentinel, { bigint: true });
      expect(`${sentinelAfter.dev}:${sentinelAfter.ino}`).toBe(`${sentinelIdentity.dev}:${sentinelIdentity.ino}`);
    } finally {
      seam.restore();
      fixture.close();
    }
  });
  posixBoundaryIt("fails closed when the target parent becomes a symlink before pathname publication", () => {
    const { fixture, source, target } = singleFileTransactionFixture("fs-transaction-parent-swap-");
    const parent = path.dirname(target);
    const outsideTarget = path.join(fixture.outside, "target.bin");
    const outsideBytes = Buffer.from("foreign bytes outside HOME\n");
    fs.writeFileSync(outsideTarget, outsideBytes);
    const outsideIdentity = fs.lstatSync(outsideTarget, { bigint: true });
    const parentBefore = fs.lstatSync(parent, { bigint: true });
    const attack = replaceParentWithSymlinkAtPublication({
      target,
      parent,
      outside: fixture.outside,
    });
    let error;
    try {
      try {
        transact([{
          source,
          target,
          expectedParent: { path: parent, id: `${parentBefore.dev}:${parentBefore.ino}` },
          retainBackup: false,
        }], { home: fixture.home, sourceScopes: [fixture.scope] });
      } catch (caught) {
        error = caught;
      }
      expect(attack.injection.called, "the parent swap must occur after the final parent check").toBe(true);
      expect(error, "publication through a replaced parent must be rejected").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.existsSync(outsideTarget), "the foreign outside target must not be moved").toBe(true);
      expect(fs.readFileSync(outsideTarget)).toEqual(outsideBytes);
      const outsideAfter = fs.lstatSync(outsideTarget, { bigint: true });
      expect(`${outsideAfter.dev}:${outsideAfter.ino}`).toBe(`${outsideIdentity.dev}:${outsideIdentity.ino}`);
      expect(fs.readdirSync(fixture.outside).sort()).toEqual(["target.bin"]);
    } finally {
      attack.restore();
      fixture.close();
    }
  });
  linuxParentPivotIt("preserves a foreign outside target with the same basename when the parent pivots after the real quarantine unlink", () => {
    const { fixture, source, target, oldBytes } = singleFileTransactionFixture("fs-transaction-parent-pivot-foreign-");
    const parent = path.dirname(target);
    const outsideTarget = path.join(fixture.outside, path.basename(target));
    const outsideBytes = Buffer.from("foreign outside target must remain untouched\n");
    fs.writeFileSync(outsideTarget, outsideBytes);
    const outsideIdentity = fs.lstatSync(outsideTarget, { bigint: true });
    const targetIdentity = fs.lstatSync(target, { bigint: true });
    expect(path.basename(outsideTarget)).toBe(path.basename(target));
    expect(outsideBytes).not.toEqual(oldBytes);
    expect(`${outsideIdentity.dev}:${outsideIdentity.ino}`).not.toBe(`${targetIdentity.dev}:${targetIdentity.ino}`);
    const parentBefore = fs.lstatSync(parent, { bigint: true });
    const attack = replaceParentWithSymlinkAtPublication({
      target,
      parent,
      outside: fixture.outside,
      pivotAfterRename: true,
    });
    let error;
    try {
      try {
        transact([{
          source,
          target,
          expectedParent: { path: parent, id: `${parentBefore.dev}:${parentBefore.ino}` },
          retainBackup: false,
        }], { home: fixture.home, sourceScopes: [fixture.scope] });
      } catch (caught) {
        error = caught;
      }
      expect(attack.injection.called, "the parent pivot must follow a real publication syscall").toBe(true);
      expect(attack.injection.publicationSyscallReturned, "the wrapper must return from the real publication syscall").toBe(true);
      expect(attack.injection.afterPublication, "the outside target must be inspected before postcheck/recovery").toBeDefined();
      expect(attack.injection.afterPublication.exists).toBe(true);
      expect(attack.injection.afterPublication.bytes).toEqual(outsideBytes);
      expect(attack.injection.afterPublication.id).toBe(`${outsideIdentity.dev}:${outsideIdentity.ino}`);
      expect(error, "a parent pivot must fail closed").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.readFileSync(outsideTarget), "the foreign outside target must not be clobbered").toEqual(outsideBytes);
      const outsideAfter = fs.lstatSync(outsideTarget, { bigint: true });
      expect(`${outsideAfter.dev}:${outsideAfter.ino}`).toBe(`${outsideIdentity.dev}:${outsideIdentity.ino}`);
      for (const observation of attack.injection.outsideObservations) {
        expect(observation.exists).toBe(true);
        expect(observation.bytes).toEqual(outsideBytes);
        expect(observation.id).toBe(`${outsideIdentity.dev}:${outsideIdentity.ino}`);
      }
    } finally {
      attack.restore();
      fixture.close();
    }
  });

  linuxParentPivotIt("does not transiently publish through the outside parent after the real quarantine unlink", () => {
    const { fixture, source, target } = singleFileTransactionFixture("fs-transaction-parent-pivot-absent-");
    const parent = path.dirname(target);
    const outsideTarget = path.join(fixture.outside, path.basename(target));
    expect(fs.existsSync(outsideTarget)).toBe(false);
    const parentBefore = fs.lstatSync(parent, { bigint: true });
    const attack = replaceParentWithSymlinkAtPublication({
      target,
      parent,
      outside: fixture.outside,
      pivotAfterRename: true,
    });
    let error;
    try {
      try {
        transact([{
          source,
          target,
          expectedParent: { path: parent, id: `${parentBefore.dev}:${parentBefore.ino}` },
          retainBackup: false,
        }], { home: fixture.home, sourceScopes: [fixture.scope] });
      } catch (caught) {
        error = caught;
      }
      expect(attack.injection.called, "the parent pivot must follow a real publication syscall").toBe(true);
      expect(attack.injection.publicationSyscallReturned, "the wrapper must return from the real publication syscall").toBe(true);
      expect(attack.injection.afterPublication, "the outside target must be inspected before postcheck/recovery").toBeDefined();
      expect(attack.injection.afterPublication.exists, "no outside publication may occur before postcheck/recovery").toBe(false);
      expect(attack.injection.outsideObservations.length).toBeGreaterThan(0);
      expect(
        attack.injection.outsideObservations.every(observation => !observation.exists),
        "no observed real-FS interleaving may publish into the outside target",
      ).toBe(true);
      expect(error, "a parent pivot must fail closed").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.existsSync(outsideTarget), "the outside target must remain absent after rejection").toBe(false);
    } finally {
      attack.restore();
      fixture.close();
    }
  });



  linuxParentPivotIt("rejects a live-parent pivot after real link publication before commit", () => {
    const { fixture, source, target } = singleFileTransactionFixture("fs-transaction-parent-pivot-post-link-");
    const parent = path.dirname(target);
    const outsideTarget = path.join(fixture.outside, path.basename(target));
    const outsideBytes = Buffer.from("foreign target must survive post-link pivot\n");
    fs.writeFileSync(outsideTarget, outsideBytes);
    const outsideIdentity = fs.lstatSync(outsideTarget, { bigint: true });
    const parentBefore = fs.lstatSync(parent, { bigint: true });
    const attack = pivotParentAfterLinkPublication({
      target,
      parent,
      outside: fixture.outside,
    });
    let result;
    let error;
    try {
      try {
        result = transact([{
          source,
          target,
          expectedParent: { path: parent, id: `${parentBefore.dev}:${parentBefore.ino}` },
          retainBackup: false,
        }], { home: fixture.home, sourceScopes: [fixture.scope] });
      } catch (caught) {
        error = caught;
      }

      expect(attack.injection.publicationSyscallReturned, "the real link publication must return before the pivot").toBe(true);
      expect(attack.injection.called, "the live parent must pivot after link publication").toBe(true);
      expect(attack.injection.afterPublication).toEqual({
        id: `${outsideIdentity.dev}:${outsideIdentity.ino}`,
        bytes: outsideBytes,
      });
      expect(result, "a detached-directory publication must not report success").toBeUndefined();
      expect(error, "a live-parent pivot after publication must fail closed").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.lstatSync(parent).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(outsideTarget), "the foreign live target must remain unchanged").toEqual(outsideBytes);
      const outsideAfter = fs.lstatSync(outsideTarget, { bigint: true });
      expect(`${outsideAfter.dev}:${outsideAfter.ino}`).toBe(`${outsideIdentity.dev}:${outsideIdentity.ino}`);
    } finally {
      attack.restore();
      fixture.close();
    }
  });
  for (const mode of ["quarantine", "backup"]) {
    posixBoundaryIt(`preserves a foreign precreated ${mode} reservation`, () => {
      const { fixture, source, target, oldBytes } = singleFileTransactionFixture(`fs-transaction-precreated-${mode}-`);
      const foreignBytes = Buffer.from(`foreign ${mode} reservation\n`);
      const attack = precreateForeignReservation({ mode, foreignBytes });
      let error;
      try {
        try {
          transact([{ source, target, retainBackup: false }], {
            home: fixture.home,
            sourceScopes: [fixture.scope],
          });
        } catch (caught) {
          error = caught;
        }
        expect(attack.injection.called, "the foreign reservation must be created in the real transaction").toBe(true);
        expect(error, "a precreated transaction entry must block publication").toBeDefined();
        expect(error.code).toBe("E_INSTALL_DRIFT");
        expect(fs.readFileSync(attack.injection.path)).toEqual(foreignBytes);
        const foreignAfter = fs.lstatSync(attack.injection.path, { bigint: true });
        expect(`${foreignAfter.dev}:${foreignAfter.ino}`).toBe(`${attack.injection.identity.dev}:${attack.injection.identity.ino}`);
        expect(fs.readFileSync(target), "a rejected reservation must leave the target preimage intact").toEqual(oldBytes);
      } finally {
        attack.restore();
        fixture.close();
      }
    });
  }


  posixBoundaryIt("fails closed when a foreign quarantine reservation appears after the missing check", () => {
    const { fixture, source, target, oldBytes } = singleFileTransactionFixture("fs-transaction-quarantine-after-missing-");
    const foreignBytes = Buffer.from("foreign quarantine reservation after missing check\n");
    const targetIdentity = fs.lstatSync(target, { bigint: true });
    const attack = createQuarantineAfterMissingReservation(foreignBytes);
    let result;
    let error;
    try {
      try {
        result = transact([{ source, target, retainBackup: false }], {
          home: fixture.home,
          sourceScopes: [fixture.scope],
        });
      } catch (caught) {
        error = caught;
      }

      expect(attack.injection.observedMissing, "the seam must observe ENOENT before creating the foreign entry").toBe(true);
      expect(attack.injection.called, "the foreign entry must be created after the missing observation").toBe(true);
      expect(result, "a quarantine reservation race must not report success").toBeUndefined();
      expect(error, "a foreign quarantine reservation must fail closed").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.readFileSync(target), "the target preimage must remain intact").toEqual(oldBytes);
      const targetAfter = fs.lstatSync(target, { bigint: true });
      expect(`${targetAfter.dev}:${targetAfter.ino}`).toBe(`${targetIdentity.dev}:${targetIdentity.ino}`);
      expect(fs.existsSync(attack.injection.path)).toBe(true);
      expect(fs.readFileSync(attack.injection.path)).toEqual(foreignBytes);
      const foreignAfter = fs.lstatSync(attack.injection.path, { bigint: true });
      expect(`${foreignAfter.dev}:${foreignAfter.ino}`).toBe(`${attack.injection.identity.dev}:${attack.injection.identity.ino}`);
    } finally {
      attack.restore();
      fixture.close();
    }
  });
  posixBoundaryIt("preserves a foreign backup replacement during retainBackup:false cleanup", () => {
    const { fixture, source, target, newBytes } = singleFileTransactionFixture("fs-transaction-backup-cleanup-");
    const foreignBytes = Buffer.from("foreign bytes replaced at backup cleanup\n");
    const attack = replaceBackupAtCleanup(foreignBytes);
    let error;
    try {
      try {
        transact([{ source, target, retainBackup: false }], {
          home: fixture.home,
          sourceScopes: [fixture.scope],
        });
      } catch (caught) {
        error = caught;
      }
      expect(attack.injection.called, "the backup must be replaced after quarantine cleanup").toBe(true);
      expect(error, "backup ownership drift must be surfaced").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.readFileSync(attack.injection.path)).toEqual(foreignBytes);
      const foreignAfter = fs.lstatSync(attack.injection.path, { bigint: true });
      expect(`${foreignAfter.dev}:${foreignAfter.ino}`).toBe(`${attack.injection.identity.dev}:${attack.injection.identity.ino}`);
      expect(fs.readFileSync(target), "published bytes remain observable after cleanup drift").toEqual(newBytes);
    } finally {
      attack.restore();
      fixture.close();
    }
  });

  posixBoundaryIt("does not delete a foreign rollback target replacement after hardlinking the owned publication", () => {
    const {
      fixture,
      operations,
      firstTarget,
      firstNewBytes,
      secondTarget,
      secondOldBytes,
      secondSource,
      externalSentinel,
      externalIdentity,
      externalBytes,
    } = quarantineRollbackFixture();
    const foreignBytes = Buffer.from("foreign rollback replacement\n");
    const failure = failSecondSourceAfterFirstPublication(secondSource);
    const attack = replaceRollbackTargetAfterHardlink({ target: firstTarget, foreignBytes });
    let error;
    try {
      try {
        transact(operations, { home: fixture.home, sourceScopes: [fixture.scope] });
      } catch (caught) {
        error = caught;
      }
      expect(failure.injection.called, "the later operation must force rollback").toBe(true);
      expect(attack.injection.called, "the target must be replaced after the ownership link").toBe(true);
      expect(error, "rollback ownership drift must be surfaced").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.readFileSync(firstTarget), "rollback must not unlink the foreign replacement").toEqual(foreignBytes);
      const foreignAfter = fs.lstatSync(firstTarget, { bigint: true });
      expect(`${foreignAfter.dev}:${foreignAfter.ino}`).toBe(`${attack.injection.identity.dev}:${attack.injection.identity.ino}`);
      expect(fs.readFileSync(secondTarget)).toEqual(secondOldBytes);
      expect(fs.readFileSync(externalSentinel)).toEqual(externalBytes);
      const externalAfter = fs.lstatSync(externalSentinel, { bigint: true });
      expect(`${externalAfter.dev}:${externalAfter.ino}`).toBe(`${externalIdentity.dev}:${externalIdentity.ino}`);
      expect(firstNewBytes.equals(fs.readFileSync(firstTarget))).toBe(false);
    } finally {
      attack.restore();
      failure.restore();
      fixture.close();
    }
  });
  linuxParentPivotIt("does not retain a foreign outside inode in the rollback orphan after a parent pivot", () => {
    const {
      fixture,
      operations,
      firstTarget,
      firstOldBytes,
      firstNewBytes,
      secondTarget,
      secondOldBytes,
      secondSource,
      externalSentinel,
      externalIdentity,
      externalBytes,
    } = quarantineRollbackFixture();
    const parent = path.dirname(firstTarget);
    const outsideTarget = path.join(fixture.outside, path.basename(firstTarget));
    const outsideBytes = Buffer.from("foreign outside rollback inode\n");
    fs.writeFileSync(outsideTarget, outsideBytes);
    const outsideBefore = fs.lstatSync(outsideTarget, { bigint: true });
    const targetBefore = fs.lstatSync(firstTarget, { bigint: true });
    expect(outsideBytes).not.toEqual(firstNewBytes);
    expect(`${outsideBefore.dev}:${outsideBefore.ino}`).not.toBe(`${targetBefore.dev}:${targetBefore.ino}`);
    const failure = failSecondSourceAfterFirstPublication(secondSource);
    const attack = replaceRollbackTargetAfterHardlink({
      target: firstTarget,
      foreignBytes: outsideBytes,
      parent,
      outside: fixture.outside,
      pivotBeforeHardlink: true,
    });
    let error;
    try {
      try {
        transact(operations, { home: fixture.home, sourceScopes: [fixture.scope] });
      } catch (caught) {
        error = caught;
      }

      expect(failure.injection.called, "the later operation must force rollback").toBe(true);
      expect(attack.injection.parentPivoted, "the parent must pivot before the rollback hardlink").toBe(true);
      expect(attack.injection.publicationSyscallReturned, "the real rollback hardlink must return").toBe(true);
      expect(attack.injection.called, "the physical target must match the rollback hardlink").toBe(true);
      expect(error, "rollback must report the forced later-operation drift").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");

      const outsideAfter = fs.lstatSync(outsideTarget, { bigint: true });
      expect(fs.readFileSync(outsideTarget), "the foreign same-basename bytes must remain unchanged").toEqual(outsideBytes);
      expect(`${outsideAfter.dev}:${outsideAfter.ino}`).toBe(`${outsideBefore.dev}:${outsideBefore.ino}`);
      expect(outsideAfter.nlink, "the foreign inode must not gain a private transaction alias").toBe(outsideBefore.nlink);

      const preservedParent = attack.injection.preserved;
      expect(preservedParent).toBe(`${parent}.preserved`);
      const ownedFirstTarget = path.join(preservedParent, path.basename(firstTarget));
      const ownedSecondTarget = path.join(preservedParent, path.basename(secondTarget));
      expect(fs.readFileSync(ownedFirstTarget), "rollback must restore the owned first target").toEqual(firstOldBytes);
      expect(fs.readFileSync(ownedSecondTarget), "rollback must preserve the owned second target").toEqual(secondOldBytes);
      expect(fs.readFileSync(externalSentinel), "the external sentinel must remain intact").toEqual(externalBytes);
      const externalAfter = fs.lstatSync(externalSentinel, { bigint: true });
      expect(`${externalAfter.dev}:${externalAfter.ino}`).toBe(`${externalIdentity.dev}:${externalIdentity.ino}`);

      const transaction = attack.injection.orphan && path.dirname(attack.injection.orphan);
      const foreignAliases = transaction && fs.existsSync(transaction)
        ? fs.readdirSync(transaction).filter(name => {
          const candidate = path.join(transaction, name);
          const stat = fs.lstatSync(candidate, { bigint: true });
          return stat.isFile() && `${stat.dev}:${stat.ino}` === `${outsideBefore.dev}:${outsideBefore.ino}`;
        })
        : [];
      expect(foreignAliases, "the private transaction must not retain an alias of the outside inode").toEqual([]);
    } finally {
      attack.restore();
      failure.restore();
      fixture.close();
    }
  });

  for (const variant of [
    {
      name: "foreign regular bytes",
      replacement: "regular",
      foreignBytes: Buffer.from("foreign rollback preimage\n"),
    },
    {
      name: "symlink to an external sentinel",
      replacement: "symlink",
      foreignBytes: null,
    },
  ]) {
    posixBoundaryIt(`fails closed when ${variant.name} replaces a published operation quarantine`, () => {
      const {
        fixture,
        operations,
        firstTarget,
        firstNewBytes,
        secondTarget,
        secondOldBytes,
        secondSource,
        externalSentinel,
        externalIdentity,
        externalBytes,
      } = quarantineRollbackFixture();
      const attack = replaceQuarantineAtPublishedStage({
        secondSource,
        foreignBytes: variant.foreignBytes,
        externalSentinel,
        replacement: variant.replacement,
      });
      let error;
      try {
        try {
          transact(operations, { home: fixture.home, sourceScopes: [fixture.scope] });
        } catch (caught) {
          error = caught;
        }

        expect(attack.injection.called, "the replacement must occur after the first publication").toBe(true);
        expect(error, "the later publication failure must be surfaced").toBeDefined();
        expect(error.code).toBe("E_INSTALL_DRIFT");
        expect(error.message).toMatch(/rollback/);

        const targetStat = fs.lstatSync(firstTarget, { bigint: true });
        expect(targetStat.isFile() && !targetStat.isSymbolicLink(), "rollback must not publish an attacker symlink").toBe(true);
        expect(fs.readFileSync(firstTarget), "verified published bytes must not be removed for an untrusted preimage").toEqual(firstNewBytes);
        expect(fs.readFileSync(secondTarget), "the failed later publication must leave its target untouched").toEqual(secondOldBytes);

        expect(attack.injection.quarantine, "the replaced quarantine path must be observed").toBeTruthy();
        const adversaryStat = fs.lstatSync(attack.injection.quarantine, { bigint: true });
        expect(`${adversaryStat.dev}:${adversaryStat.ino}`).toBe(`${attack.injection.identity.dev}:${attack.injection.identity.ino}`);
        if (variant.replacement === "regular") {
          expect(adversaryStat.isFile() && !adversaryStat.isSymbolicLink()).toBe(true);
          expect(fs.readFileSync(attack.injection.quarantine)).toEqual(variant.foreignBytes);
        } else {
          expect(adversaryStat.isSymbolicLink()).toBe(true);
          expect(fs.readlinkSync(attack.injection.quarantine)).toBe(externalSentinel);
        }
        expect(fs.readFileSync(externalSentinel), "the external sentinel must remain intact").toEqual(externalBytes);
        const externalAfter = fs.lstatSync(externalSentinel, { bigint: true });
        expect(`${externalAfter.dev}:${externalAfter.ino}`).toBe(`${externalIdentity.dev}:${externalIdentity.ino}`);
      } finally {
        attack.restore();
        fixture.close();
      }
    });
  }

  boundaryIt("retains published or restored bytes when a foreign transaction child blocks retainBackup:false cleanup", async () => {
    const { fixture, operations, oldBytes, newBytes } = publicationFixture();
    const foreignBytes = Buffer.from("foreign transaction data\\0\\n");
    const race = spawnRaceWorker(fixture, foreignBytes);
    try {
      await race.ready;
      let outcome;
      try {
        outcome = { result: transact(operations, { home: fixture.home, sourceScopes: [fixture.scope] }) };
      } catch (error) {
        outcome = { error };
      }
      const workerResult = await race.done;
      expect(workerResult.error).toBeUndefined();
      const report = raceReport(race);
      expect(report.ready).toBe(true);
      expect(report.sentinelCreated).toBe(true);
      expect(report.transaction).toMatch(/^install-/);
      expect(report.sentinel).toBe(path.join(fixture.home, ".omp", "install-transactions", report.transaction, "foreign-sentinel.bin"));
      expect(fs.readFileSync(report.sentinel)).toEqual(foreignBytes);

      const actual = operations.map(({ target }) => fs.existsSync(target) ? fs.readFileSync(target) : null);
      const allRestored = actual.every((bytes, index) => bytes?.equals(oldBytes[index]));
      const allPublished = actual.every((bytes, index) => bytes?.equals(newBytes[index]));
      expect(actual.every(Boolean), "a failed cleanup must not lose a target").toBe(true);
      expect(allRestored || allPublished, "all targets must be restored or published consistently").toBe(true);
      expect(outcome.error, "foreign transaction content must produce a controlled outcome").toBeDefined();
      expect(outcome.error.code).toBe("E_INSTALL_DRIFT");
      if (/rollback\s+conclu[ií]do/i.test(outcome.error.message)) expect(allRestored).toBe(true);
    } finally {
      if (race.child.exitCode === null) race.child.kill();
      await race.done;
      fixture.close();
    }
  });

  boundaryIt("rejects a source leaf reached through a link outside sourceScopes before staging or publication", () => {
    const fixture = sandbox("fs-transaction-source-scope-");
    try {
      const link = path.join(fixture.scope, "linked-outside");
      const outsideBytes = Buffer.from("outside source bytes\\0\\n");
      const outsideSentinel = Buffer.from("outside sentinel\\0\\n");
      const outsideSource = path.join(fixture.outside, "payload.bin");
      const outsideKeep = path.join(fixture.outside, "sentinel.bin");
      fs.writeFileSync(outsideSource, outsideBytes);
      fs.writeFileSync(outsideKeep, outsideSentinel);
      fs.symlinkSync(fixture.outside, link, process.platform === "win32" ? "junction" : "dir");
      const source = path.join(link, "payload.bin");
      const target = path.join(fixture.home, "published.bin");
      const leaf = fs.lstatSync(source, { bigint: true });
      expect(leaf.isFile()).toBe(true);
      expect(leaf.isSymbolicLink()).toBe(false);
      expect(leaf.nlink).toBe(1n);

      let error;
      try {
        transact([{ source, target }], { home: fixture.home, sourceScopes: [fixture.scope] });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.existsSync(target), "out-of-scope source must not publish").toBe(false);
      expect(fs.readFileSync(outsideSource)).toEqual(outsideBytes);
      expect(fs.readFileSync(outsideKeep)).toEqual(outsideSentinel);
      const transactionRoot = path.join(fixture.home, ".omp", "install-transactions");
      const transactions = fs.existsSync(transactionRoot)
        ? fs.readdirSync(transactionRoot).filter(name => name.startsWith("install-"))
        : [];
      expect(transactions, "scope rejection must happen before transaction staging").toEqual([]);
    } finally {
      fixture.close();
    }
  });

  boundaryIt("commits a normal replacement and leaves the source and target bytes intact", () => {
    const { fixture, source, target, newBytes } = singleFileTransactionFixture("fs-transaction-positive-");
    try {
      const result = transact([{ source, target, retainBackup: false }], {
        home: fixture.home,
        sourceScopes: [fixture.scope],
      });
      expect(result.ok).toBe(true);
      expect(process.platform === "win32" ? result.response.event : result.event).toBe("commit-complete");
      expect(fs.readFileSync(source)).toEqual(newBytes);
      expect(fs.readFileSync(target)).toEqual(newBytes);
      const targetStat = fs.lstatSync(target, { bigint: true });
      expect(targetStat.isFile() && !targetStat.isSymbolicLink()).toBe(true);
      expect(targetStat.nlink).toBe(1n);
    } finally {
      fixture.close();
    }
  });

  posixBoundaryIt("rejects an equal-plan snapshot when the source changes before transaction execution", () => {
    const { fixture, source, target, oldBytes, newBytes } = singleFileTransactionFixture("fs-transaction-equal-plan-drift-");
    try {
      // The installer binds this destination snapshot while source and target are equal.
      fs.writeFileSync(source, oldBytes);
      const plannedTarget = fs.lstatSync(target, { bigint: true });
      const expectedTarget = {
        exists: true,
        id: `${plannedTarget.dev}:${plannedTarget.ino}`,
        hash: createHash("sha256").update(oldBytes).digest("hex"),
      };

      // Model a source edit after planning but before transact() receives the operation.
      fs.writeFileSync(source, newBytes);
      let error;
      try {
        transact([{ source, target, verify: true, expectedTarget }], {
          home: fixture.home,
          sourceScopes: [fixture.scope],
        });
      } catch (caught) {
        error = caught;
      }

      expect(error, "an equal operation with stale planned source bytes must fail closed").toBeDefined();
      expect(error.code).toBe("E_INSTALL_DRIFT");
      expect(fs.readFileSync(target), "drift must preserve the planned target preimage").toEqual(oldBytes);
      expect(fs.readFileSync(source), "drift must preserve the changed source bytes").toEqual(newBytes);
    } finally {
      fixture.close();
    }
  });
});
