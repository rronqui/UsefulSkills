// Testes de regressão do instalador de hooks e dos wrappers gerados.
// Costura: repo git temporário + cópia de scripts; os wrappers são exercitados
// com sh real (o mesmo que o git usa) e cwd na raiz do repo (para o hook
// commit-msg resolver o commitlint em node_modules/.bin).
import { execFileSync, spawnSync } from "node:child_process";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { tmpdir } from "node:os";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
if (process.platform === "win32") vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function findSh() {
  const candidates =
    process.platform === "win32"
      ? ["C:/Program Files/Git/bin/sh.exe", "C:/Program Files/Git/usr/bin/sh.exe", "sh"]
      : ["sh"];
  for (const c of candidates) {
    const r = spawnSync(c, ["-c", "exit 0"]);
    if (r.status === 0) return c;
  }
  return null;
}

const sh = findSh();

function copyHookFixtureDependencies(dir) {
  cpSync(join(repoRoot, "scripts"), join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "tdd-orchestrator", "lib"), { recursive: true });
  cpSync(
    join(repoRoot, "tdd-orchestrator", "lib", "fs-transaction"),
    join(dir, "tdd-orchestrator", "lib", "fs-transaction"),
    { recursive: true },
  );
}
function linkFixtureNodeModules(dir) {
  symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"), process.platform === "win32" ? "junction" : "dir");
}
function initRepo(name) {
  // Windows runners may expose TEMP through an 8.3 alias. The installer uses
  // the physical directory; race observers and expected diagnostics must too.
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), `hooks-${name}-`)));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
  spawnSync("git", ["config", "init.defaultBranch", name], { cwd: dir });
  spawnSync("git", ["config", "core.hooksPath", ".git/hooks"], { cwd: dir });
  copyHookFixtureDependencies(dir);
  linkFixtureNodeModules(dir);
  copyFileSync(join(repoRoot, ".commitlintrc.json"), join(dir, ".commitlintrc.json"));
  return dir;
}
function createLinkedWorktree() {
  const main = initRepo("worktree-main");
  const linked = join(dirname(main), `hooks-worktree-linked-${Date.now()}`);
  const run = (args, cwd = main) => {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
    });
    expectChildExit(result, 0);
  };
  run(["config", "--unset", "core.hooksPath"]);
  writeFileSync(join(main, "tracked.txt"), "worktree fixture\n");
  run(["add", "scripts", "tdd-orchestrator/lib/fs-transaction", ".commitlintrc.json", "tracked.txt"]);
  run(["-c", "user.name=UsefulSkills Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "test: linked worktree"]);
  run(["worktree", "add", "--detach", linked]);
  symlinkSync(join(repoRoot, "node_modules"), join(linked, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  return { main, linked };
}

function install(dir) {
  return spawnSync("node", ["scripts/install-hooks.mjs"], { cwd: dir, encoding: "utf8" });
}
function nodeRequireOption(file) {
  return process.platform === "win32"
    ? `--require="${file.replace(/\\/g, "/")}"`
    : `--require=${file}`;
}

function expectChildExit(result, status) {
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  expect(result.error, result.error?.message || output).toBeUndefined();
  expect(result.status, output).toBe(status);
}

const managedHookNames = ["commit-msg", "commit-msg.mjs", "pre-push", "pre-push.mjs"];
// Exact source preimages published in v0.4.0 at the immutable release commit:
// https://github.com/rronqui/UsefulSkills/tree/02582a867f660bf8aa387fe51f71b7fffd3a7dfd/scripts/hooks
// SHA-256 and provenance: local://ship-released-hook-payloads-v040.json.
const publishedHookFixtureDir = join(repoRoot, "scripts", "fixtures", "hooks-v040");
const generatedMarker = "Gerado por scripts/install-hooks.mjs";
const publishedHookSources = new Map(
  ["commit-msg", "pre-push"].map((name) => [
    name,
    readFileSync(join(publishedHookFixtureDir, `${name}.mjs`), "utf8"),
  ]),
);

function publishedHookBytes(name) {
  const hookName = name.endsWith(".mjs") ? name.slice(0, -4) : name;
  const sourceText = publishedHookSources.get(hookName);
  if (!sourceText) throw new Error(`preimagem publicada ausente para ${name}`);
  const sidecarText = `// ${generatedMarker} — edite o original em scripts/hooks/${hookName}.mjs.\n${sourceText}`;
  if (name.endsWith(".mjs")) return Buffer.from(sidecarText);
  return Buffer.from([
    "#!/bin/sh",
    `# ${generatedMarker} — edite o original em scripts/hooks/${hookName}.mjs.`,
    `exec node "$0.mjs" "$@"`,
    "",
    sidecarText,
  ].join("\n"));
}

function seedPublishedHooks(directory) {
  const previous = new Map();
  for (const name of managedHookNames) {
    const content = publishedHookBytes(name);
    writeFileSync(join(directory, name), content);
    previous.set(name, content);
  }
  return previous;
}

function assertManagedHooksAbsent(directory) {
  for (const name of managedHookNames) {
    expect(existsSync(join(directory, name))).toBe(false);
  }
}
// POSIX transactions publish through /proc/self/fd/<parent>/<name>; match the
// pinned physical parent and basename instead of the lexical pathname.
function physicalParentAndName(candidate) {
  const absolute = resolve(String(candidate));
  const physicalParent = realpathSync.native(dirname(absolute));
  const stat = statSync(physicalParent, { bigint: true });
  return { id: `${stat.dev}:${stat.ino}`, name: basename(absolute) };
}
function installWithFsFault(dir, destination, operation) {
  if (!["link", "unlink"].includes(operation)) throw new Error(`falha desconhecida: ${operation}`);
  const token = `.usefulskills-hooks-fault-${operation}-${Math.random().toString(36).slice(2)}`;
  const preload = join(dir, `${token}.cjs`);
  const marker = join(dir, `${token}.marker`);
  const expectedTarget = physicalParentAndName(destination);
  writeFileSync(
    preload,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const { syncBuiltinESMExports } = require('node:module');",
      "const marker = path.resolve(process.env.USEFULSKILLS_FAULT_MARKER);",
      `const expectedTarget = ${JSON.stringify(expectedTarget)};`,
      `const operation = ${JSON.stringify(operation)};`,
      "let injected = false;",
      "let published = false;",
      "const physicalParentAndName = candidate => {",
      "  const absolute = path.resolve(String(candidate));",
      "  const physicalParent = fs.realpathSync.native(path.dirname(absolute));",
      "  const stat = fs.lstatSync(physicalParent, { bigint: true });",
      "  return { id: `${stat.dev}:${stat.ino}`, name: path.basename(absolute) };",
      "};",
      "const matchesTarget = candidate => {",
      "  try {",
      "    const physical = physicalParentAndName(candidate);",
      "    return physical.id === expectedTarget.id && physical.name === expectedTarget.name;",
      "  } catch {",
      "    return false;",
      "  }",
      "};",
      "function inject(kind) {",
      "  injected = true;",
      "  fs.writeFileSync(marker, `${kind}\\n`);",
      "  const error = new Error(`injected ${kind} failure`);",
      "  error.code = 'EIO';",
      "  throw error;",
      "}",
      "const realLinkSync = fs.linkSync;",
      "fs.linkSync = function linkSync(...args) {",
      "  const source = path.resolve(String(args[0]));",
      "  const destination = path.resolve(String(args[1]));",
      "  if (!injected && operation === 'link' && matchesTarget(destination) && source.includes('.stage')) inject('link');",
      "  const result = realLinkSync.apply(this, args);",
      "  if (matchesTarget(destination) && source.includes('.stage')) published = true;",
      "  return result;",
      "};",
      "const realUnlinkSync = fs.unlinkSync;",
      "fs.unlinkSync = function unlinkSync(...args) {",
      "  const file = path.resolve(String(args[0]));",
      "  const result = realUnlinkSync.apply(this, args);",
      "  if (!injected && operation === 'unlink' && published && file.includes('.stage')) inject('unlink');",
      "  return result;",
      "};",
      "syncBuiltinESMExports();",
    ].join("\n"),
  );
  try {
    const result = spawnSync(process.execPath, ["--require", preload, "scripts/install-hooks.mjs"], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        USEFULSKILLS_FAULT_MARKER: marker,
      },
    });
    return Object.assign(result, { faultMarker: marker });
  } finally {
    rmSync(preload, { force: true });
  }
}
function installWithRollbackFault(dir, destination) {
  const token = `.usefulskills-hooks-fault-rollback-${Math.random().toString(36).slice(2)}`;
  const preload = join(dir, `${token}.cjs`);
  const marker = join(dir, `${token}.marker`);
  const expectedTarget = physicalParentAndName(destination);
  writeFileSync(
    preload,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const { syncBuiltinESMExports } = require('node:module');",
      "const marker = path.resolve(process.env.USEFULSKILLS_FAULT_MARKER);",
      `const expectedTarget = ${JSON.stringify(expectedTarget)};`,
      "const physicalParentAndName = candidate => {",
      "  const absolute = path.resolve(String(candidate));",
      "  const physicalParent = fs.realpathSync.native(path.dirname(absolute));",
      "  const stat = fs.lstatSync(physicalParent, { bigint: true });",
      "  return { id: `${stat.dev}:${stat.ino}`, name: path.basename(absolute) };",
      "};",
      "const matchesTarget = candidate => {",
      "  try {",
      "    const physical = physicalParentAndName(candidate);",
      "    return physical.id === expectedTarget.id && physical.name === expectedTarget.name;",
      "  } catch {",
      "    return false;",
      "  }",
      "};",
      "let commitFailed = false;",
      "const realLinkSync = fs.linkSync;",
      "fs.linkSync = function linkSync(...args) {",
      "  const source = path.resolve(String(args[0]));",
      "  const destination = path.resolve(String(args[1]));",
      "  if (!commitFailed && matchesTarget(destination) && source.includes('.stage')) {",
      "    commitFailed = true;",
      "    fs.writeFileSync(marker, 'commit\\n');",
      "    const error = new Error('injected commit failure');",
      "    error.code = 'EIO';",
      "    throw error;",
      "  }",
      "  if (commitFailed && matchesTarget(destination) && source.includes('.quarantine')) {",
      "    fs.writeFileSync(marker, 'commit\\nrollback\\n');",
      "    const error = new Error('injected rollback failure');",
      "    error.code = 'EIO';",
      "    throw error;",
      "  }",
      "  return realLinkSync.apply(this, args);",
      "};",
      "syncBuiltinESMExports();",
    ].join("\n"),
  );
  try {
    const result = spawnSync(process.execPath, ["--require", preload, "scripts/install-hooks.mjs"], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        USEFULSKILLS_FAULT_MARKER: marker,
      },
    });
    return Object.assign(result, { faultMarker: marker });
  } finally {
    rmSync(preload, { force: true });
  }
}
// These preload fault seams observe POSIX fs-transaction calls only; Windows
// commits run in the native worker and are covered by the real-worker races.
const posixFaultIt = process.platform === "win32" ? it.skip : it;
function childEnvironmentWithoutNodeOptions() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === "node_options") delete environment[key];
  }
  return environment;
}

// The inspection race observes the real validation seam: on POSIX, the
// post-inspection consumer read; on Windows, the native worker's
// `fs-transaction.windows.v1` `inspect-complete` response. The child result is
// forwarded unchanged before the attacker runs.
function createInspectionRace(fixture, target, consumerBytes, mutation) {
  const token = `ac008-inspection-race-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = join(fixture, `${token}.payload`);
  const marker = join(fixture, `${token}.marker`);
  const attacker = join(fixture, `${token}.attacker.cjs`);
  const preload = join(fixture, `${token}.preload.cjs`);
  writeFileSync(payload, consumerBytes);
  writeFileSync(
    attacker,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      `const target = path.resolve(${JSON.stringify(target)});`,
      `const payload = path.resolve(${JSON.stringify(payload)});`,
      `const marker = path.resolve(${JSON.stringify(marker)});`,
      `const mutation = ${JSON.stringify(mutation)};`,
      "try {",
      "  const bytes = fs.readFileSync(payload);",
      "  if (mutation === 'edit') {",
      "    fs.writeFileSync(target, bytes);",
      "    fs.writeFileSync(marker, 'edited\\n');",
      "  } else {",
      "    fs.writeFileSync(target, bytes);",
      "    const replacement = `${target}.ac008-replacement-${process.pid}`;",
      "    fs.writeFileSync(replacement, bytes);",
      "    try {",
      "      fs.renameSync(replacement, target);",
      "      fs.writeFileSync(marker, 'replaced\\n');",
      "    } catch (error) {",
      "      fs.rmSync(replacement, { force: true });",
      "      fs.writeFileSync(target, bytes);",
      "      fs.writeFileSync(marker, `replacement-denied:${error?.code || 'unknown'}\\n`);",
      "    }",
      "  }",
      "} catch (error) {",
      "  fs.writeFileSync(marker, `attacker-failed:${error?.code || error?.message || 'unknown'}\\n`);",
      "  process.exitCode = 2;",
      "}",
    ].join("\n"),
  );
  writeFileSync(
    preload,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const childProcess = require('node:child_process');",
      "const { syncBuiltinESMExports } = require('node:module');",
      `const target = path.resolve(${JSON.stringify(target)});`,
      `const attacker = path.resolve(${JSON.stringify(attacker)});`,
      `const inspectionTargets = ${JSON.stringify(managedHookNames.map(name => join(dirname(target), name)))};`,
      "let triggered = false;",
      "const realSpawnSync = childProcess.spawnSync;",
      "const realOpenSync = fs.openSync;",
      "const realCloseSync = fs.closeSync;",
      "const inspectedFds = new Set();",
      "let inspectedTargets = 0;",
      "const childEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'node_options'));",
      "const attack = () => {",
      "  if (triggered) return;",
      "  triggered = true;",
      "  const child = realSpawnSync.call(childProcess, process.execPath, [attacker], {",
      "    cwd: path.dirname(target),",
      "    env: childEnvironment(),",
      "    stdio: 'ignore',",
      "  });",
      "  if (child.error || child.status !== 0) throw new Error('AC008 inspection race attacker failed');",
      "};",
      "if (process.platform === 'win32') {",
      "  childProcess.spawnSync = function spawnSync() {",
      "    const result = Reflect.apply(realSpawnSync, this, arguments);",
      "    if (!triggered && result?.status === 0) {",
      "      let response = null;",
      "      try { response = JSON.parse(String(result.stdout ?? '').trim()); } catch {}",
      "      if (response?.schema === 'fs-transaction.windows.v1' && response.event === 'inspect-complete' && response.ok === true) attack();",
      "    }",
      "    return result;",
      "  };",
      "} else {",
      "  fs.openSync = function openSync() {",
      "    const result = Reflect.apply(realOpenSync, this, arguments);",
      "    if (typeof result === 'number' && typeof arguments[0] !== 'number' && inspectionTargets.includes(path.resolve(String(arguments[0])))) inspectedFds.add(result);",
      "    return result;",
      "  };",
      "  fs.closeSync = function closeSync() {",
      "    const tracked = inspectedFds.delete(arguments[0]);",
      "    const result = Reflect.apply(realCloseSync, this, arguments);",
      "    if (tracked && !triggered && ++inspectedTargets === inspectionTargets.length) attack();",
      "    return result;",
      "  };",
      "}",
      "syncBuiltinESMExports();",
    ].join("\n"),
  );
  return { marker, preload };
}

// The rollback race observes a real publication event. POSIX forwards the
// publication primitive before the attacker edits the published target;
// Windows starts a watcher before the native transaction child and observes
// the first target publication. No rename fault or stage deletion is injected.
function createRollbackRace(fixture, target, transactionHome, consumerBytes) {
  const token = `ac008-rollback-race-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = join(fixture, `${token}.payload`);
  const before = join(fixture, `${token}.before`);
  const marker = join(fixture, `${token}.marker`);
  const ready = join(fixture, `${token}.ready`);
  const attacker = join(fixture, `${token}.attacker.cjs`);
  const preload = join(fixture, `${token}.preload.cjs`);
  const expectedTarget = physicalParentAndName(target);
  writeFileSync(payload, consumerBytes);
  writeFileSync(before, readFileSync(target));
  writeFileSync(
    attacker,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      `const target = path.resolve(${JSON.stringify(target)});`,
      `const transactionRoot = path.join(path.resolve(${JSON.stringify(transactionHome)}), '.omp', 'install-transactions');`,
      `const payload = path.resolve(${JSON.stringify(payload)});`,
      `const before = path.resolve(${JSON.stringify(before)});`,
      `const marker = path.resolve(${JSON.stringify(marker)});`,
      `const ready = path.resolve(${JSON.stringify(ready)});`,
      "const arm = () => {",
      "  try {",
      "    fs.writeFileSync(target, fs.readFileSync(payload));",
      "    fs.writeFileSync(marker, 'armed\\n');",
      "  } catch (error) {",
      "    fs.writeFileSync(marker, `attacker-failed:${error?.code || error?.message || 'unknown'}\\n`);",
      "    process.exitCode = 2;",
      "  }",
      "};",
      "if (process.argv.includes('--direct')) {",
      "  arm();",
      "} else {",
      "  let stageSeen = false;",
      "  let initialized = false;",
      "  const deadline = Date.now() + 30000;",
      "  const poll = () => {",
      "    if (Date.now() >= deadline) {",
      "      fs.writeFileSync(marker, 'attacker-timeout\\n');",
      "      process.exitCode = 2;",
      "      return;",
      "    }",
      "    let targetChanged = false;",
      "    let transactionSeen = false;",
      "    try { targetChanged = !fs.readFileSync(target).equals(fs.readFileSync(before)); } catch {}",
      "    try {",
      "      for (const name of fs.readdirSync(transactionRoot).filter((item) => item.startsWith('install-'))) {",
      "        transactionSeen = true;",
      "        if (fs.existsSync(path.join(transactionRoot, name, '0.stage'))) stageSeen = true;",
      "      }",
      "    } catch {}",
      "    if (targetChanged && (stageSeen || transactionSeen)) {",
      "      arm();",
      "      return;",
      "    }",
      "    if (!initialized) {",
      "      fs.writeFileSync(ready, 'ready\\n');",
      "      initialized = true;",
      "    }",
      "    setTimeout(poll, 1);",
      "  };",
      "  poll();",
      "}",
    ].join("\n"),
  );
  writeFileSync(
    preload,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const childProcess = require('node:child_process');",
      "const { syncBuiltinESMExports } = require('node:module');",
      `const target = path.resolve(${JSON.stringify(target)});`,
      `const expectedTarget = ${JSON.stringify(expectedTarget)};`,
      `const attacker = path.resolve(${JSON.stringify(attacker)});`,
      "const physicalParentAndName = candidate => {",
      "  const absolute = path.resolve(String(candidate));",
      "  const physicalParent = fs.realpathSync.native(path.dirname(absolute));",
      "  const stat = fs.lstatSync(physicalParent, { bigint: true });",
      "  return { id: `${stat.dev}:${stat.ino}`, name: path.basename(absolute) };",
      "};",
      "const matchesTarget = candidate => {",
      "  try {",
      "    const physical = physicalParentAndName(candidate);",
      "    return physical.id === expectedTarget.id && physical.name === expectedTarget.name;",
      "  } catch {",
      "    return false;",
      "  }",
      "};",
      "const childEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'node_options'));",
      "const realSpawnSync = childProcess.spawnSync;",
      "const realSpawn = childProcess.spawn;",
      "const runDirectAttacker = () => {",
      "  const child = realSpawnSync.call(childProcess, process.execPath, [attacker, '--direct'], {",
      "    cwd: path.dirname(target),",
      "    env: childEnvironment(),",
      "    stdio: 'ignore',",
      "  });",
      "  if (child.error || child.status !== 0) throw new Error('AC008 rollback race attacker failed');",
      "};",
      "if (process.platform === 'win32') {",
      "  let watcher = null;",
      "  childProcess.spawnSync = function spawnSync() {",
      "    let payload = null;",
      "    try { payload = JSON.parse(String(arguments[2]?.input ?? '')); } catch {}",
      "    if (!watcher && payload?.inspectOnly === false && Array.isArray(payload.operations)) {",
      "      watcher = realSpawn.call(childProcess, process.execPath, [attacker], {",
      "        cwd: path.dirname(target),",
      "        env: childEnvironment(),",
      "        stdio: 'ignore',",
      "      });",
      "      if (watcher.error) throw watcher.error;",
      "      const readyDeadline = Date.now() + 10000;",
      `      while (!fs.existsSync(${JSON.stringify(ready)}) && watcher.exitCode === null && Date.now() < readyDeadline) {`,
      "        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);",
      "      }",
      `      if (!fs.existsSync(${JSON.stringify(ready)})) { if (watcher.exitCode === null) watcher.kill(); throw new Error('AC008 rollback race watcher failed to become ready'); }`,
      "    }",
      "    const result = Reflect.apply(realSpawnSync, this, arguments);",
      "    if (watcher && watcher.exitCode === null) watcher.kill();",
      "    return result;",
      "  };",
      "} else {",
      "  let triggered = false;",
      "  for (const name of ['linkSync', 'renameSync', 'copyFileSync']) {",
      "    const real = fs[name];",
      "    if (typeof real !== 'function') continue;",
      "    fs[name] = function publicationBoundary() {",
      "      const result = Reflect.apply(real, this, arguments);",
      "      const source = path.resolve(String(arguments[0]));",
      "      const destination = path.resolve(String(arguments[1]));",
      "      if (!triggered && matchesTarget(destination) && source.includes('.stage')) {",
      "        triggered = true;",
      "        runDirectAttacker();",
      "      }",
      "      return result;",
      "    };",
      "  }",
      "}",
      "syncBuiltinESMExports();",
    ].join("\n"),
  );
  return { marker, preload };
}

function runRealInstallWithPreload(dir, preload) {
  return spawnSync(process.execPath, ["--require", preload, "scripts/install-hooks.mjs"], {
    cwd: dir,
    encoding: "utf8",
    env: childEnvironmentWithoutNodeOptions(),
  });
}





// Roda o hook INSTALADO (wrapper sh) como o git rodaria.
function hooksPath(dir) {
  const configured = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: dir, encoding: "utf8" }).trim();
  return /^[A-Za-z]:[\\/]/.test(configured) || configured.startsWith("/") ? configured : join(dir, configured);
}
function windowsShortPath(target) {
  if (process.platform !== "win32") return null;
  const command = `for %I in ("${target.replace(/"/g, '""')}") do @echo %~sI`;
  try {
    return execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

// Roda o hook INSTALADO (wrapper sh) como o git rodaria.
function runHook(dir, hook, opts = {}) {
  const { args = [], ...rest } = opts;
  return spawnSync(sh, [join(hooksPath(dir), hook), ...args], { cwd: dir, encoding: "utf8", ...rest });
}

function msgFile(dir, text) {
  const f = join(dir, `msg-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(f, text + "\n");
  return f;
}

describe("install-hooks + wrappers gerados", () => {
  let dir;

  beforeAll(() => {
    if (!sh) throw new Error("sh indisponível — sem costura para testar wrappers");
    dir = initRepo("main");
    const r = install(dir);
    expect(r.status, r.stderr).toBe(0);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  it("instala wrappers executáveis em POSIX", () => {
    if (process.platform === "win32") return;
    expect(statSync(join(hooksPath(dir), "commit-msg")).mode & 0o111).not.toBe(0);
  });
  it("aceita o diretório padrão compartilhado de linked worktree", () => {
    const fixture = createLinkedWorktree();
    try {
      const result = install(fixture.linked);
      expectChildExit(result, 0);
      expect(existsSync(join(hooksPath(fixture.linked), "commit-msg"))).toBe(true);
      expect(existsSync(join(hooksPath(fixture.linked), "pre-push"))).toBe(true);
    } finally {
      spawnSync("git", ["worktree", "remove", "--force", fixture.linked], {
        cwd: fixture.main,
        encoding: "utf8",
      });
      rmSync(fixture.linked, { recursive: true, force: true });
      rmSync(fixture.main, { recursive: true, force: true });
    }
  });

  it("wrapper repassa argumentos: mensagem inválida é rejeitada (exit 1)", () => {
    const r = runHook(dir, "commit-msg", { args: [msgFile(dir, "isto nao e convencional")] });
    expect(r.status).toBe(1);
  }, 30_000);

  it("wrapper repassa argumentos: mensagem convencional válida passa (exit 0)", () => {
    const r = runHook(dir, "commit-msg", { args: [msgFile(dir, "feat: algo valido")] });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it("isenta Merge/Revert do git, mas não prefixos parecidos", () => {
    const isento = runHook(dir, "commit-msg", { args: [msgFile(dir, "Merge branch 'x' into main")] });
    expect(isento.status).toBe(0);
    const revert = runHook(dir, "commit-msg", { args: [msgFile(dir, "Revert \"feat: algo\"")] });
    expect(revert.status).toBe(0);
    const parecido = runHook(dir, "commit-msg", { args: [msgFile(dir, "Mergeable stuff")] });
    expect(parecido.status).toBe(1);
  });

  it("pre-push recebe refs pela stdin através do wrapper", () => {
    const bloqueia = runHook(dir, "pre-push", { input: "refs/heads/main 0 0 0\n" });
    expect(bloqueia.status).toBe(1);
    const libera = runHook(dir, "pre-push", { input: "refs/heads/feat/1-x abcdef0 refs/heads/topic abcdef1\n" });
    expectChildExit(libera, 0);
    const vazia = runHook(dir, "pre-push", { input: "" });
    expect(vazia.status).toBe(0);
  }, process.platform === "win32" ? 180_000 : undefined);

  it("sem git no diretório: não instala nada (nem cria .git falso)", () => {
    const noGit = mkdtempSync(join(tmpdir(), "hooks-nogit-"));
    copyHookFixtureDependencies(noGit);
    try {
      const r = install(noGit);
      expectChildExit(r, 0);
      expect(existsSync(join(noGit, ".git"))).toBe(false);
    } finally {
      rmSync(noGit, { recursive: true, force: true });
    }
  });

  it("commit-msg funciona com cwd em caminho com espaços", () => {
    const spaced = mkdtempSync(join(tmpdir(), "caminho com espaco "));
    try {
      spawnSync("git", ["init", "-q"], { cwd: spaced });
      mkdirSync(join(spaced, ".git", "hooks"), { recursive: true });
      spawnSync("git", ["config", "core.hooksPath", ".git/hooks"], { cwd: spaced });
      copyHookFixtureDependencies(spaced);
      linkFixtureNodeModules(spaced);
      copyFileSync(join(repoRoot, ".commitlintrc.json"), join(spaced, ".commitlintrc.json"));
      const installed = install(spaced);
      expect(installed.status, installed.stdout + installed.stderr).toBe(0);
      const valida = runHook(spaced, "commit-msg", { args: [msgFile(spaced, "feat: msg valida")] });
      expect(valida.status, valida.stdout + valida.stderr).toBe(0);
      const invalida = runHook(spaced, "commit-msg", { args: [msgFile(spaced, "nao convencional")] });
      expect(invalida.status).toBe(1);
    } finally {
      rmSync(spaced, { recursive: true, force: true });
    }
  });

  it("honra core.hooksPath configurado pelo Git dentro do projeto", () => {
    const configured = join(dir, "custom-hooks");
    try {
      spawnSync("git", ["config", "core.hooksPath", configured], { cwd: dir });
      const installed = install(dir);
      expect(installed.status, installed.stdout + installed.stderr).toBe(0);
      const valida = runHook(dir, "commit-msg", { args: [msgFile(dir, "feat: caminho configurado")] });
      expect(valida.status, valida.stdout + valida.stderr).toBe(0);
    } finally {
      spawnSync("git", ["config", "core.hooksPath", ".git/hooks"], { cwd: dir });
      rmSync(configured, { recursive: true, force: true });
      expect(existsSync(join(hooksPath(dir), "commit-msg"))).toBe(true);
    }
  });
  it("rejeita core.hooksPath com symlink/.. antes de escrever no destino lexical", () => {
    const fixture = initRepo("hooks-symlink-parent");
    const linked = join(fixture, "actual", "nested");
    mkdirSync(linked, { recursive: true });
    symlinkSync(linked, join(fixture, "alias"), process.platform === "win32" ? "junction" : "dir");
    try {
      const configured = spawnSync("git", ["config", "core.hooksPath", "alias/../effective-hooks"], { cwd: fixture, encoding: "utf8" });
      expectChildExit(configured, 0);
      const result = install(fixture);
      expectChildExit(result, 1);
      expect(result.stderr).toMatch(/travessia.*ambígua/);
      expect(existsSync(join(fixture, "effective-hooks"))).toBe(false);
      expect(existsSync(join(fixture, "actual", "effective-hooks"))).toBe(false);
      expectChildExit(spawnSync("git", ["config", "core.hooksPath", "absent/../effective-hooks"], { cwd: fixture, encoding: "utf8" }), 0);
      const missingParent = install(fixture);
      expectChildExit(missingParent, 1);
      expect(missingParent.stderr).toMatch(/travessia.*ambígua/);
      expect(existsSync(join(fixture, "effective-hooks"))).toBe(false);
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });

  it("preserva core.hooksPath com '..' quando os componentes anteriores não são links", () => {
    const fixture = initRepo("hooks-safe-parent");
    mkdirSync(join(fixture, "nested"));
    try {
      const configured = spawnSync("git", ["config", "core.hooksPath", "nested/../safe-hooks"], { cwd: fixture, encoding: "utf8" });
      expectChildExit(configured, 0);
      expectChildExit(install(fixture), 0);
      for (const name of managedHookNames) expect(existsSync(join(fixture, "safe-hooks", name))).toBe(true);
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });

  it("rejeita hook fonte acima do limite antes de materializar seu conteúdo", () => {
    const fixture = initRepo("hooks-oversized-source");
    try {
      truncateSync(join(fixture, "scripts", "hooks", "pre-push.mjs"), 8 * 1024 * 1024 + 1);
      const result = install(fixture);
      expectChildExit(result, 1);
      expect(result.stderr).toMatch(/excede o limite/);
      for (const name of managedHookNames) expect(existsSync(join(fixture, ".git", "hooks", name))).toBe(false);
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
  it("usa o valor efetivo da última entrada de core.hooksPath", () => {
    const fixture = initRepo("hooks-effective-path");
    const effective = "effective-hooks";
    try {
      const unset = spawnSync("git", ["config", "--local", "--unset-all", "core.hooksPath"], {
        cwd: fixture,
        encoding: "utf8",
      });
      expectChildExit(unset, 0);
      const empty = spawnSync("git", ["config", "--local", "--add", "core.hooksPath", ""], {
        cwd: fixture,
        encoding: "utf8",
      });
      expectChildExit(empty, 0);
      const configured = spawnSync("git", ["config", "--local", "--add", "core.hooksPath", effective], {
        cwd: fixture,
        encoding: "utf8",
      });
      expectChildExit(configured, 0);

      const result = install(fixture);
      expectChildExit(result, 0);
      expect(existsSync(join(fixture, effective, "commit-msg"))).toBe(true);
      expect(existsSync(join(fixture, effective, "pre-push"))).toBe(true);
      assertManagedHooksAbsent(join(fixture, ".git", "hooks"));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
  it("rejeita a última entrada vazia de core.hooksPath sem cair no fallback", () => {
    const fixture = initRepo("hooks-effective-empty");
    try {
      const unset = spawnSync("git", ["config", "--local", "--unset-all", "core.hooksPath"], {
        cwd: fixture,
        encoding: "utf8",
      });
      expectChildExit(unset, 0);
      const configured = spawnSync("git", ["config", "--local", "--add", "core.hooksPath", "custom-hooks"], {
        cwd: fixture,
        encoding: "utf8",
      });
      expectChildExit(configured, 0);
      const empty = spawnSync("git", ["config", "--local", "--add", "core.hooksPath", ""], {
        cwd: fixture,
        encoding: "utf8",
      });
      expectChildExit(empty, 0);

      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toMatch(/core\.hooksPath vazio/i);
      assertManagedHooksAbsent(join(fixture, ".git", "hooks"));
      assertManagedHooksAbsent(join(fixture, "custom-hooks"));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
  it("rejeita core.hooksPath em scripts/hooks sem sobrescrever fontes canônicas", () => {
    const fixture = initRepo("hooks-canonical-source");
    const sourceDirectory = join(fixture, "scripts", "hooks");
    const sources = ["commit-msg.mjs", "pre-push.mjs"];
    const before = new Map(sources.map((name) => [name, readFileSync(join(sourceDirectory, name))]));
    try {
      spawnSync("git", ["config", "core.hooksPath", "scripts/hooks"], { cwd: fixture });
      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toMatch(/fontes canônicas|scripts[\\/]+hooks/i);
      for (const name of sources) {
        expect(readFileSync(join(sourceDirectory, name))).toEqual(before.get(name));
      }
      expect(existsSync(join(sourceDirectory, "commit-msg"))).toBe(false);
      expect(existsSync(join(sourceDirectory, "pre-push"))).toBe(false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
  it("rejeita alias 8.3 que resolve para scripts/hooks canônico", () => {
    if (process.platform !== "win32") return;
    const fixture = initRepo("hooks-canonical-alias");
    const canonical = join(fixture, "scripts", "hooks");
    const alias = windowsShortPath(canonical);
    if (!alias || !alias.includes("~") || alias.toLowerCase() === canonical.toLowerCase()) return;
    const sources = ["commit-msg.mjs", "pre-push.mjs"];
    const before = new Map(sources.map((name) => [name, readFileSync(join(canonical, name))]));
    try {
      const configured = spawnSync("git", ["config", "core.hooksPath", alias], {
        cwd: fixture,
        encoding: "utf8",
      });
      expectChildExit(configured, 0);
      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toMatch(/fontes canônicas|scripts[\\/]+hooks/i);
      for (const name of sources) {
        expect(readFileSync(join(canonical, name))).toEqual(before.get(name));
      }
      expect(existsSync(join(canonical, "commit-msg"))).toBe(false);
      expect(existsSync(join(canonical, "pre-push"))).toBe(false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("aceita core.hooksPath in-project cujo nome começa com '..'", () => {
    const fixture = initRepo("hooks-dotdot-name");
    const configured = join(fixture, "..hooks");
    try {
      spawnSync("git", ["config", "core.hooksPath", "..hooks"], { cwd: fixture });
      const result = install(fixture);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(existsSync(join(configured, "commit-msg"))).toBe(true);
      expect(existsSync(join(configured, "pre-push"))).toBe(true);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("não sobrescreve hooks regulares nem sidecars preexistentes sem conflito explícito ou marker", () => {
    const fixture = initRepo("preexisting");
    const destinations = ["commit-msg", "pre-push"].flatMap((name) => [name, `${name}.mjs`]);
    const sentinel = new Map(destinations.map((name) => [name, `conteúdo do usuário: ${name}\n`]));
    try {
      const directory = hooksPath(fixture);
      for (const name of destinations) writeFileSync(join(directory, name), sentinel.get(name));

      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      for (const name of destinations) {
        expect(output).toContain(
          `conflito no hook existente ${join(directory, name)}: arquivo regular do consumidor — preservado`,
        );
        expect(readFileSync(join(directory, name), "utf8")).toBe(sentinel.get(name));
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
  it("preserva hook regular cujo único conteúdo é comentário com marker gerado", () => {
    const fixture = initRepo("marker-only-regular");
    const destination = join(hooksPath(fixture), "pre-push");
    const sentinel = "# Gerado por scripts/install-hooks.mjs\n";
    try {
      writeFileSync(destination, sentinel);
      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toMatch(/conflito no hook existente.*arquivo regular.*preservado/i);
      expect(readFileSync(destination, "utf8")).toBe(sentinel);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });


  it("segunda instalação não altera wrappers nem sidecars gerados", () => {
    const fixture = initRepo("idempotent");
    try {
      const first = install(fixture);
      expect(first.status, first.stdout + first.stderr).toBe(0);
      const directory = hooksPath(fixture);
      const destinations = ["commit-msg", "commit-msg.mjs", "pre-push", "pre-push.mjs"];
      const before = destinations.map((name) => readFileSync(join(directory, name), "utf8"));

      const second = install(fixture);
      expect(second.status, second.stdout + second.stderr).toBe(0);
      const after = destinations.map((name) => readFileSync(join(directory, name), "utf8"));
      expect(after).toEqual(before);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
  it("chmoda wrapper gerenciado quando os bytes iguais mas o modo perdeu execução", () => {
    if (process.platform === "win32") return;
    const fixture = initRepo("wrapper-mode-drift");
    try {
      const first = install(fixture);
      expect(first.status, first.stdout + first.stderr).toBe(0);
      const destination = join(hooksPath(fixture), "commit-msg");
      const bytes = readFileSync(destination);
      chmodSync(destination, 0o644);

      const second = install(fixture);
      expect(second.status, second.stdout + second.stderr).toBe(0);
      expect(readFileSync(destination)).toEqual(bytes);
      expect(statSync(destination).mode & 0o111).not.toBe(0);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
  it("restaura o bit de execução do proprietário quando o wrapper gerenciado o perde", () => {
    if (process.platform === "win32") return;
    const fixture = initRepo("wrapper-owner-mode-drift");
    try {
      const first = install(fixture);
      expectChildExit(first, 0);
      const destination = join(hooksPath(fixture), "commit-msg");
      const bytes = readFileSync(destination);
      chmodSync(destination, 0o410);

      const second = install(fixture);
      expectChildExit(second, 0);
      expect(readFileSync(destination)).toEqual(bytes);
      expect(statSync(destination).mode & 0o100).not.toBe(0);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });


  it("propaga erro inesperado do Git em vez de tratá-lo como ausência de Git", () => {
    const fixture = mkdtempSync(join(tmpdir(), "hooks-fake-git-unexpected-"));
    const fakeBin = mkdtempSync(join(tmpdir(), "hooks-fake-git-unexpected-bin-"));
    const fakeGit = join(fakeBin, process.platform === "win32" ? "git.exe" : "git");
    const fakePreload = join(fakeBin, "unexpected-git.cjs");
    const sentinel = join(fakeBin, "unexpected-git-sentinel.txt");
    copyHookFixtureDependencies(fixture);
    if (process.platform === "win32") {
      copyFileSync(process.execPath, fakeGit);
      writeFileSync(
        fakePreload,
        [
          "const fs = require('node:fs');",
          "const path = require('node:path');",
          "if (path.basename(process.execPath).toLowerCase() === 'git.exe') {",
          "  fs.writeFileSync(process.env.USEFULSKILLS_FAKE_GIT_SENTINEL, 'unexpected-git-invoked\\n');",
          "  process.stderr.write('fatal: unexpected fake git sentinel\\n');",
          "  process.exit(73);",
          "}",
        ].join("\n"),
      );
    } else {
      writeFileSync(
        fakeGit,
        "#!/bin/sh\nprintf '%s\\n' 'unexpected-git-invoked' > \"$USEFULSKILLS_FAKE_GIT_SENTINEL\"\nprintf '%s\\n' 'fatal: unexpected fake git sentinel' >&2\nexit 73\n",
      );
      chmodSync(fakeGit, 0o755);
    }
    const pathVariable = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    try {
      const result = spawnSync(process.execPath, [join(fixture, "scripts", "install-hooks.mjs")], {
        cwd: fixture,
        encoding: "utf8",
        env: {
          ...process.env,
          [pathVariable]: `${fakeBin}${delimiter}${process.env[pathVariable] ?? ""}`,
          USEFULSKILLS_FAKE_GIT_SENTINEL: sentinel,
          ...(process.platform === "win32" ? { NODE_OPTIONS: nodeRequireOption(fakePreload) } : {}),
        },
      });
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(existsSync(sentinel), output).toBe(true);
      expect(readFileSync(sentinel, "utf8")).toBe("unexpected-git-invoked\n");
      expect(output).toContain("unexpected fake git sentinel");
      expect(output).not.toMatch(/Sem git neste diretório/i);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  it("não confunde status 128 de safe.directory com ausência de Git", () => {
    const fixture = mkdtempSync(join(tmpdir(), "hooks-fake-git-safe-directory-"));
    const fakeBin = mkdtempSync(join(tmpdir(), "hooks-fake-git-safe-directory-bin-"));
    const fakeGit = join(fakeBin, process.platform === "win32" ? "git.exe" : "git");
    const fakePreload = join(fakeBin, "safe-directory-git.cjs");
    const sentinel = join(fakeBin, "safe-directory-git-sentinel.txt");
    copyHookFixtureDependencies(fixture);
    if (process.platform === "win32") {
      copyFileSync(process.execPath, fakeGit);
      writeFileSync(
        fakePreload,
        [
          "const fs = require('node:fs');",
          "const path = require('node:path');",
          "if (path.basename(process.execPath).toLowerCase() === 'git.exe') {",
          "  fs.writeFileSync(process.env.USEFULSKILLS_FAKE_GIT_SENTINEL, 'safe-directory-git-invoked\\n');",
          "  process.stderr.write('fatal: detected dubious ownership in repository at \\'C:/fixture\\'\\n');",
          "  process.exit(128);",
          "}",
        ].join("\n"),
      );
    } else {
      writeFileSync(
        fakeGit,
        "#!/bin/sh\nprintf '%s\\n' 'safe-directory-git-invoked' > \"$USEFULSKILLS_FAKE_GIT_SENTINEL\"\nprintf '%s\\n' \"fatal: detected dubious ownership in repository at '$PWD'\" >&2\nexit 128\n",
      );
      chmodSync(fakeGit, 0o755);
    }
    const pathVariable = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    try {
      const result = spawnSync(process.execPath, [join(fixture, "scripts", "install-hooks.mjs")], {
        cwd: fixture,
        encoding: "utf8",
        env: {
          ...process.env,
          [pathVariable]: `${fakeBin}${delimiter}${process.env[pathVariable] ?? ""}`,
          USEFULSKILLS_FAKE_GIT_SENTINEL: sentinel,
          ...(process.platform === "win32" ? { NODE_OPTIONS: nodeRequireOption(fakePreload) } : {}),
        },
      });
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(existsSync(sentinel), output).toBe(true);
      expect(readFileSync(sentinel, "utf8")).toBe("safe-directory-git-invoked\n");
      expect(output).toMatch(/falha operacional ao consultar Git/i);
      expect(output).not.toMatch(/Sem git neste diretório/i);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  it("trata ausência de repositório com mensagem localizada como no-op", () => {
    const noGit = mkdtempSync(join(tmpdir(), "hooks-nogit-localized-"));
    const fakeBin = mkdtempSync(join(tmpdir(), "hooks fake-git-localized-"));
    const fakeGit = join(fakeBin, process.platform === "win32" ? "git.exe" : "git");
    const fakePreload = join(fakeBin, "localized-git.cjs");
    const sentinel = join(fakeBin, "localized-git-sentinel.txt");
    copyHookFixtureDependencies(noGit);
    if (process.platform === "win32") {
      copyFileSync(process.execPath, fakeGit);
      writeFileSync(
        fakePreload,
        [
          "const fs = require('node:fs');",
          "const path = require('node:path');",
          "if (path.basename(process.execPath).toLowerCase() === 'git.exe') {",
          "  fs.writeFileSync(process.env.USEFULSKILLS_FAKE_GIT_SENTINEL, 'localized-git-invoked\\n');",
          "  process.stderr.write('fatal: no es un repositorio git\\n');",
          "  process.exit(128);",
          "}",
        ].join("\n"),
      );
    } else {
      writeFileSync(
        fakeGit,
        "#!/bin/sh\nprintf '%s\\n' 'localized-git-invoked' > \"$USEFULSKILLS_FAKE_GIT_SENTINEL\"\nprintf '%s\\n' 'fatal: no es un repositorio git' >&2\nexit 128\n",
      );
      chmodSync(fakeGit, 0o755);
    }
    const pathVariable = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    try {
      const result = spawnSync(process.execPath, [join(noGit, "scripts", "install-hooks.mjs")], {
        cwd: noGit,
        encoding: "utf8",
        env: {
          ...process.env,
          [pathVariable]: `${fakeBin}${delimiter}${process.env[pathVariable] ?? ""}`,
          USEFULSKILLS_FAKE_GIT_SENTINEL: sentinel,
          ...(process.platform === "win32" ? { NODE_OPTIONS: nodeRequireOption(fakePreload) } : {}),
        },
      });
      expectChildExit(result, 0);
      const output = result.stdout + result.stderr;
      expect(existsSync(sentinel), output).toBe(true);
      expect(readFileSync(sentinel, "utf8")).toBe("localized-git-invoked\n");
      expect(output).toMatch(/Sem git neste diretório/i);
      expect(existsSync(join(noGit, ".git"))).toBe(false);
      assertManagedHooksAbsent(noGit);
    } finally {
      rmSync(noGit, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });


  it("recusa core.hooksPath externo sem escrever no diretório compartilhado", () => {
    const fixture = initRepo("hooks-external");
    const external = mkdtempSync(join(tmpdir(), "hooks-external-target-"));
    try {
      spawnSync("git", ["config", "core.hooksPath", external], { cwd: fixture });
      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toMatch(/core\.hooksPath externo|destino/i);
      assertManagedHooksAbsent(external);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("recusa core.hooksPath compartilhado e preserva conteúdo de outro consumidor", () => {
    const fixture = initRepo("hooks-shared");
    const shared = mkdtempSync(join(tmpdir(), "hooks-shared-target-"));
    const sentinel = join(shared, "other-consumer.hook");
    writeFileSync(sentinel, "não tocar\n");
    try {
      spawnSync("git", ["config", "core.hooksPath", shared], { cwd: fixture });
      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toMatch(/core\.hooksPath compartilhado|outro consumidor/i);
      expect(readFileSync(sentinel, "utf8")).toBe("não tocar\n");
      assertManagedHooksAbsent(shared);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(shared, { recursive: true, force: true });
    }
  });

  it("recusa core.hooksPath na raiz do projeto antes de criar hooks no root", () => {
    const fixture = initRepo("hooks-root");
    try {
      spawnSync("git", ["config", "core.hooksPath", fixture], { cwd: fixture });
      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toMatch(/raiz do projeto|core\.hooksPath/i);
      assertManagedHooksAbsent(fixture);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("recusa core.hooksPath vazio antes de resolver o destino para a raiz", () => {
    const fixture = initRepo("hooks-empty");
    try {
      spawnSync("git", ["config", "core.hooksPath", ""], { cwd: fixture });
      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toMatch(/core\.hooksPath vazio|raiz do projeto/i);
      assertManagedHooksAbsent(fixture);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  for (const operation of ["link", "unlink"]) {
    posixFaultIt(`restaura todos os destinos após falha de ${operation} em destino posterior`, () => {
      const fixture = initRepo(`hooks-rollback-${operation}`);
      try {
        const first = install(fixture);
        expectChildExit(first, 0);
        const directory = hooksPath(fixture);
        const previous = seedPublishedHooks(directory);

        const result = installWithFsFault(fixture, join(directory, "pre-push"), operation);
        expectChildExit(result, 1);
        expect(existsSync(result.faultMarker)).toBe(true);
        expect(readFileSync(result.faultMarker, "utf8")).toBe(`${operation}\n`);
        for (const name of managedHookNames) {
          expect(readFileSync(join(directory, name))).toEqual(previous.get(name));
        }
        const transactionRoot = join(fixture, ".omp", "install-transactions");
        if (existsSync(transactionRoot)) {
          expect(readdirSync(transactionRoot).every((name) => name.startsWith("install-"))).toBe(true);
        }
        expect(readdirSync(dirname(directory)).filter((name) => name.startsWith(".usefulskills-hooks-"))).toEqual([]);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  }
  posixFaultIt("reporta estado inseguro quando a restauração do rollback falha", () => {
    const fixture = initRepo("hooks-rollback-unsafe");
    try {
      const first = install(fixture);
      expectChildExit(first, 0);
      const directory = hooksPath(fixture);
      const previous = seedPublishedHooks(directory);

      const destination = join(directory, "pre-push");
      const result = installWithRollbackFault(fixture, destination);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(existsSync(result.faultMarker)).toBe(true);
      expect(readFileSync(result.faultMarker, "utf8")).toBe("commit\nrollback\n");
      expect(output).toMatch(/rollback|restaur/i);
      expect(output).toMatch(/parcial|incomplet|insegur|unsafe/i);
      expect(output).toContain(destination);
      for (const name of managedHookNames.filter((name) => name !== "pre-push")) {
        expect(readFileSync(join(directory, name))).toEqual(previous.get(name));
      }
      expect(existsSync(destination) ? readFileSync(destination) : null).not.toEqual(previous.get("pre-push"));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("preflight valida todos os destinos antes de qualquer escrita", () => {
    const fixture = initRepo("hooks-atomic");
    const directory = hooksPath(fixture);
    const conflict = join(directory, "pre-push");

    const sentinel = "hook conflitante preservado\n";
    writeFileSync(conflict, sentinel);
    try {
      rmSync(join(directory, "commit-msg"), { force: true });
      const result = install(fixture);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toContain(
        `conflito no hook existente ${conflict}: arquivo regular do consumidor — preservado`,
      );
      expect(readFileSync(conflict, "utf8")).toBe(sentinel);
      expect(existsSync(join(directory, "commit-msg"))).toBe(false);
      expect(existsSync(join(directory, "commit-msg.mjs"))).toBe(false);
      expect(existsSync(join(directory, "pre-push.mjs"))).toBe(false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });


  it("pre-push bloqueia refspec que mira main (HEAD:main)", () => {
    const r = runHook(dir, "pre-push", { input: "HEAD 0 refs/heads/main 111\n" });
    expect(r.status).toBe(1);
  });

  it("release-please: primeiro release explicito, sem override permanente", () => {
    const cfg = JSON.parse(readFileSync(join(repoRoot, "release-please-config.json"), "utf8"));
    const pkgCfg = cfg.packages["."];
    expect(pkgCfg["release-as"]).toBeUndefined(); // override sticky congela releases futuros
    expect(pkgCfg["initial-version"]).toBe("0.1.0"); // sem isso, primeiro release sai v1.0.0
  });
});
// Estes casos AC-008 não usam o beforeAll acima: cada cenário cria seu próprio
// repositório Git privado e invoca o CLI real. Falhas de pré-requisito, inclusive
// o guard do Git Windows protegido, permanecem visíveis como diagnóstico e não
// são convertidas em skip ou em RED válido de CAS.
describe("AC-008 CAS de hooks com CLI Git real", () => {
  it("AC-008 controle: instalação nova vazia gera os quatro arquivos geridos", () => {
    const fixture = initRepo("ac008-empty-install");
    try {
      const result = install(fixture);
      expectChildExit(result, 0);
      for (const name of managedHookNames) {
        expect(existsSync(join(hooksPath(fixture), name))).toBe(true);
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("AC-008 controle: arquivo preexistente não gerido preserva os bytes do consumidor", () => {
    const fixture = initRepo("ac008-unmanaged");
    const directory = hooksPath(fixture);
    const unrelated = join(directory, "consumer-unmanaged.hook");
    const consumerBytes = Buffer.from("hook de outro consumidor — não tocar\n");
    writeFileSync(unrelated, consumerBytes);
    try {
      const result = install(fixture);
      expectChildExit(result, 0);
      expect(readFileSync(unrelated)).toEqual(consumerBytes);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  for (const mutation of ["edit", "replace"]) {
    it(`AC-008/AUD-017 preserva bytes após ${mutation} concorrente entre inspeção e commit`, () => {
      const fixture = initRepo(`ac008-inspection-${mutation}`);
      try {
        const first = install(fixture);
        expectChildExit(first, 0);
        const target = join(hooksPath(fixture), "commit-msg");
        const consumerBytes = Buffer.from(`hook do consumidor após ${mutation}\n`);
        const race = createInspectionRace(fixture, target, consumerBytes, mutation);
        const result = runRealInstallWithPreload(fixture, race.preload);
        expectChildExit(result, 1);
        expect(existsSync(race.marker)).toBe(true);
        const marker = readFileSync(race.marker, "utf8").trim();
        if (mutation === "edit") {
          expect(marker).toBe("edited");
        } else {
          expect(marker).toMatch(/^(replaced|replacement-denied:.*)$/);
        }
        expect(readFileSync(target)).toEqual(consumerBytes);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  }

  it("AC-008/AUD-017 protege publicações contra edição concorrente após a primeira escrita", () => {
    const fixture = initRepo("ac008-rollback-concurrent-edit");
    try {
      const first = install(fixture);
      expectChildExit(first, 0);
      const directory = hooksPath(fixture);
      const target = join(directory, "commit-msg");
      const expectedPublication = new Map(
        managedHookNames.map((name) => [name, readFileSync(join(directory, name))]),
      );
      const previous = seedPublishedHooks(directory);
      const consumerBytes = Buffer.from("edição do consumidor durante rollback\n");
      const race = createRollbackRace(fixture, target, fixture, consumerBytes);
      const result = runRealInstallWithPreload(fixture, race.preload);
      const output = `error=${result.error?.stack ?? result.error?.message ?? "none"}\nstdout=${result.stdout ?? ""}\nstderr=${result.stderr ?? ""}`;
      expect(existsSync(race.marker), output).toBe(true);
      const marker = readFileSync(race.marker, "utf8").trim();

      if (process.platform === "win32" && marker === "attacker-failed:EBUSY") {
        expectChildExit(result, 0);
        for (const name of managedHookNames) {
          const published = readFileSync(join(directory, name));
          expect(published).toEqual(expectedPublication.get(name));
          expect(published).not.toEqual(consumerBytes);
        }
      } else if (marker === "armed") {
        expectChildExit(result, 1);
        expect(readFileSync(target)).toEqual(consumerBytes);
        expect(readFileSync(target)).not.toEqual(expectedPublication.get("commit-msg"));
        for (const name of managedHookNames.filter((name) => name !== "commit-msg")) {
          expect(readFileSync(join(directory, name))).toEqual(previous.get(name));
        }
      } else {
        throw new Error(`resultado de corrida não controlado: ${marker}`);
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});

const windowsGitWrapperDescribe = process.platform === "win32" ? describe : describe.skip;

windowsGitWrapperDescribe("AC-008/AUD-019 wrappers Git Windows não confiáveis", () => {
  for (const extension of ["cmd", "bat"]) {
    it(`rejeita git.${extension} com E_UNSAFE_GIT_EXECUTABLE sem executar wrapper`, () => {
      const fixture = initRepo(`ac008-git-wrapper-${extension}`);
      const wrapperDirectory = mkdtempSync(join(tmpdir(), `ac008-git-wrapper-${extension}-`));
      const wrapper = join(wrapperDirectory, `git.${extension}`);
      writeFileSync(wrapper, "@echo off\r\nexit /b 0\r\n");
      const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
      try {
        const result = spawnSync(process.execPath, ["scripts/install-hooks.mjs"], {
          cwd: fixture,
          encoding: "utf8",
          env: {
            ...childEnvironmentWithoutNodeOptions(),
            [pathKey]: `${wrapperDirectory}${delimiter}${process.env[pathKey] ?? ""}`,
          },
        });
        const output = `${result.stdout || ""}${result.stderr || ""}`;
        expectChildExit(result, 1);
        expect(output).toMatch(/E_UNSAFE_GIT_EXECUTABLE/);
        assertManagedHooksAbsent(join(fixture, ".git", "hooks"));
      } finally {
        rmSync(wrapperDirectory, { recursive: true, force: true });
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  }
});


// Costura focal de AUD-018: executa a fonte real diretamente, sem o beforeAll
// que instala hooks via Git. O caso CMD é deliberadamente separado para que
// `vitest -t "AC-008 fallback commit-msg direto"` não dispare esse setup.
const windowsFallbackDescribe = process.platform === "win32" ? describe : describe.skip;

windowsFallbackDescribe("AC-008 fallback commit-msg direto sem setup do instalador", () => {
  const hook = join(repoRoot, "scripts", "hooks", "commit-msg.mjs");
  const realCli = join(repoRoot, "node_modules", "@commitlint", "cli", "cli.js");
  const runWhenCommitlintIsProvisioned = existsSync(realCli) ? it : it.skip;

  function createFallbackFixture() {
    const fixture = mkdtempSync(join(tmpdir(), "commit-msg fallback á & %HOOK_SENTINEL% "));
    try {
      const gitInit = spawnSync("git", ["init", "-q"], {
        cwd: fixture,
        encoding: "utf8",
        env: { ...childEnvironmentWithoutNodeOptions(), GIT_CONFIG_NOSYSTEM: "1" },
      });
      expectChildExit(gitInit, 0);
      const binDirectory = join(fixture, "node_modules", ".bin");
      mkdirSync(binDirectory, { recursive: true });
      writeFileSync(
        join(fixture, ".commitlintrc.json"),
        `${JSON.stringify(
          {
            rules: {
              "type-empty": [2, "never"],
              "type-enum": [2, "always", ["feat", "fix"]],
              "subject-empty": [2, "never"],
            },
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(binDirectory, "commitlint.cmd"),
        [
          "@echo off",
          "setlocal",
          '"%USEFULSKILLS_REAL_NODE%" "%USEFULSKILLS_REAL_COMMITLINT_CLI%" %*',
          "exit /b %errorlevel%",
        ].join("\r\n"),
      );
      return fixture;
    } catch (error) {
      rmSync(fixture, { recursive: true, force: true });
      throw error;
    }
  }

  function isolatedHookEnvironment() {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (
        /^(NODE_OPTIONS|COMSPEC|HOOK_SENTINEL|COMMITLINT_BIN|COMMIT_MSG_FILE|USEFULSKILLS_REAL_|COMMAND_EXTRA_SENTINEL)$/i.test(
          key,
        )
      ) {
        continue;
      }
      env[key] = value;
    }
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
    env.ComSpec = join(systemRoot, "System32", "cmd.exe");
    env.USEFULSKILLS_REAL_NODE = process.execPath;
    env.USEFULSKILLS_REAL_COMMITLINT_CLI = realCli;
    env.NO_COLOR = "1";
    return env;
  }

  function runCommitMsg(fixture, message) {
    const commandExtraSentinel = "COMMIT_MSG_COMMAND_EXTRA_SENTINEL.txt";
    const messageFile = join(
      fixture,
      `mensagem Unicode á %HOOK_SENTINEL% & copy nul ${commandExtraSentinel}`,
    );
    writeFileSync(messageFile, `${message}\n`);
    const result = spawnSync(process.execPath, [hook, messageFile], {
      cwd: fixture,
      encoding: "utf8",
      env: isolatedHookEnvironment(),
    });
    return { commandExtraSentinel, result };
  }

  runWhenCommitlintIsProvisioned(
    "AC-008/AUD-018 aceita Conventional válido pelo fallback .cmd em cwd e mensagem com Unicode, espaços e metacaracteres",
    () => {
      const fixture = createFallbackFixture();
      try {
        expect(existsSync(join(fixture, "node_modules", "@commitlint", "cli", "cli.js"))).toBe(false);
        expect(existsSync(join(fixture, "node_modules", ".bin", "commitlint.cmd"))).toBe(true);
        const { commandExtraSentinel, result } = runCommitMsg(fixture, "feat: caminho fallback");
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        expect(result.error, output).toBeUndefined();
        expect(result.status, output).toBe(0);
        expect(output).not.toContain(commandExtraSentinel);
        expect(existsSync(join(fixture, commandExtraSentinel))).toBe(false);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
  );

  runWhenCommitlintIsProvisioned(
    "AC-008/AUD-018 rejeita Conventional inválido pelo fallback .cmd sem executar comando extra",
    () => {
      const fixture = createFallbackFixture();
      try {
        expect(existsSync(join(fixture, "node_modules", "@commitlint", "cli", "cli.js"))).toBe(false);
        expect(existsSync(join(fixture, "node_modules", ".bin", "commitlint.cmd"))).toBe(true);
        const { commandExtraSentinel, result } = runCommitMsg(fixture, "chore: tipo não permitido");
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        expect(result.error, output).toBeUndefined();
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/type-(?:empty|enum)|subject-empty/i);
        expect(output).not.toContain(commandExtraSentinel);
        expect(existsSync(join(fixture, commandExtraSentinel))).toBe(false);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
  );
});
