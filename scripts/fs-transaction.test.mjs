// AC-005: real fs-transaction boundary regressions. No production seams or mocked host responses.
import { describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import nodeFs from "node:fs";
import { fileURLToPath } from "node:url";
import { transact } from "../tdd-orchestrator/lib/fs-transaction/index.mjs";

if (process.platform === "win32") vi.setConfig({ testTimeout: 90_000 });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = path.join(repoRoot, ".test-temp");
fs.mkdirSync(tempRoot, { recursive: true });

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

const posixBoundaryIt = ["linux", "darwin"].includes(process.platform) ? it : it.skip;


const supportedBoundary = ["linux", "darwin", "win32"].includes(process.platform)
  && (process.platform !== "win32" || process.arch === "x64");
const boundaryIt = supportedBoundary ? it : it.skip;

describe("AC-005 fs-transaction boundary", () => {
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
});
