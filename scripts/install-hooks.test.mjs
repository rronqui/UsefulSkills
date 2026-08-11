// Testes de regressão do instalador de hooks e dos wrappers gerados.
// Costura: repo git temporário + cópia de scripts; os wrappers são exercitados
// com sh real (o mesmo que o git usa) e cwd na raiz do repo (para o hook
// commit-msg resolver o commitlint em node_modules/.bin).
import { execFileSync, spawnSync } from "node:child_process";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

function initRepo(name) {
  const dir = mkdtempSync(join(tmpdir(), `hooks-${name}-`));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "init.defaultBranch", name], { cwd: dir });
  spawnSync("git", ["config", "core.hooksPath", ".git/hooks"], { cwd: dir });
  cpSync(join(repoRoot, "scripts"), join(dir, "scripts"), { recursive: true });
  symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"), process.platform === "win32" ? "junction" : "dir");
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
  run(["add", "scripts", ".commitlintrc.json", "tracked.txt"]);
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

function assertManagedHooksAbsent(directory) {
  for (const name of managedHookNames) {
    expect(existsSync(join(directory, name))).toBe(false);
  }
}
function installWithFsFault(dir, destination, operation) {
  if (!["rename", "chmod"].includes(operation)) throw new Error(`falha desconhecida: ${operation}`);
  const preload = join(dir, `.usefulskills-hooks-fault-${operation}-${Math.random().toString(36).slice(2)}.cjs`);
  const common = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const { syncBuiltinESMExports } = require('node:module');",
    "const target = path.resolve(process.env.USEFULSKILLS_FAULT_DEST);",
    "let injected = false;",
    "function inject(kind) {",
    "  injected = true;",
    "  const error = new Error(`injected ${kind} failure`);",
    "  error.code = 'EIO';",
    "  throw error;",
    "}",
  ];
  const fault = operation === "chmod"
    ? [
        "const originalChmodSync = fs.chmodSync;",
        "fs.chmodSync = (file, mode) => {",
        "  if (!injected && path.resolve(String(file)) === target) inject('chmod');",
        "  return originalChmodSync(file, mode);",
        "};",
      ]
    : [
        "const originalRenameSync = fs.renameSync;",
        "fs.renameSync = (from, to) => {",
        "  if (!injected && path.resolve(String(to)) === target && String(from).includes('.usefulskills-hooks-stage-')) {",
        "    fs.rmSync(to, { force: true });",
        "    originalRenameSync(from, to);",
        "    inject('rename');",
        "  }",
        "  return originalRenameSync(from, to);",
        "};",
      ];
  writeFileSync(preload, [...common, ...fault, "syncBuiltinESMExports();"].join("\n"));
  try {
    return spawnSync(process.execPath, ["--require", preload, "scripts/install-hooks.mjs"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, USEFULSKILLS_FAULT_DEST: destination },
    });
  } finally {
    rmSync(preload, { force: true });
  }
}
function installWithRollbackFault(dir, destination) {
  const preload = join(dir, `.usefulskills-hooks-fault-rollback-${Math.random().toString(36).slice(2)}.cjs`);
  writeFileSync(
    preload,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const { syncBuiltinESMExports } = require('node:module');",
      "const target = path.resolve(process.env.USEFULSKILLS_FAULT_DEST);",
      "let commitFailed = false;",
      "const originalRenameSync = fs.renameSync;",
      "fs.renameSync = (from, to) => {",
      "  const source = path.resolve(String(from));",
      "  const destination = path.resolve(String(to));",
      "  if (!commitFailed && destination === target && source.includes('.usefulskills-hooks-stage-')) {",
      "    commitFailed = true;",
      "    originalRenameSync(from, to);",
      "    const error = new Error('injected commit failure');",
      "    error.code = 'EIO';",
      "    throw error;",
      "  }",
      "  if (commitFailed && destination === target && source.includes('.usefulskills-hooks-backup-')) {",
      "    const error = new Error('injected rollback failure');",
      "    error.code = 'EIO';",
      "    throw error;",
      "  }",
      "  return originalRenameSync(from, to);",
      "};",
      "syncBuiltinESMExports();",
    ].join("\n"),
  );
  try {
    return spawnSync(process.execPath, ["--require", preload, "scripts/install-hooks.mjs"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, USEFULSKILLS_FAULT_DEST: destination },
    });
  } finally {
    rmSync(preload, { force: true });
  }
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
    expect(libera.status).toBe(0);
    const vazia = runHook(dir, "pre-push", { input: "" });
    expect(vazia.status).toBe(0);
  });

  it("sem git no diretório: não instala nada (nem cria .git falso)", () => {
    const noGit = mkdtempSync(join(tmpdir(), "hooks-nogit-"));
    cpSync(join(repoRoot, "scripts"), join(noGit, "scripts"), { recursive: true });
    try {
      const r = install(noGit);
      expect(r.status).toBe(0);
      expect(existsSync(join(noGit, ".git"))).toBe(false);
    } finally {
      rmSync(noGit, { recursive: true, force: true });
    }
  });

  it("commit-msg funciona com cwd em caminho com espaços", () => {
    const spaced = mkdtempSync(join(tmpdir(), "caminho com espaco "));
    try {
      spawnSync("git", ["init", "-q"], { cwd: spaced });
      spawnSync("git", ["config", "core.hooksPath", ".git/hooks"], { cwd: spaced });
      cpSync(join(repoRoot, "scripts"), join(spaced, "scripts"), { recursive: true });
      symlinkSync(join(repoRoot, "node_modules"), join(spaced, "node_modules"), "junction");
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
    cpSync(join(repoRoot, "scripts"), join(fixture, "scripts"), { recursive: true });
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
    cpSync(join(repoRoot, "scripts"), join(fixture, "scripts"), { recursive: true });
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
    cpSync(join(repoRoot, "scripts"), join(noGit, "scripts"), { recursive: true });
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

  for (const operation of ["rename", "chmod"]) {
    it(`restaura todos os destinos após falha de ${operation} em destino posterior`, () => {
      const fixture = initRepo(`hooks-rollback-${operation}`);
      try {
        const first = install(fixture);
        expectChildExit(first, 0);
        const directory = hooksPath(fixture);
        const previous = new Map();
        for (const name of managedHookNames) {
          const content = Buffer.concat([
            readFileSync(join(directory, name)),
            Buffer.from(`\nconteúdo anterior ${name}\n`),
          ]);
          writeFileSync(join(directory, name), content);
          previous.set(name, content);
        }

        const result = installWithFsFault(fixture, join(directory, "pre-push"), operation);
        expectChildExit(result, 1);
        for (const name of managedHookNames) {
          expect(readFileSync(join(directory, name))).toEqual(previous.get(name));
        }
        const transactionRoot = dirname(directory);
        expect(readdirSync(transactionRoot).filter((name) => name.startsWith(".usefulskills-hooks-"))).toEqual([]);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  }
  it("reporta estado inseguro quando a restauração do rollback falha", () => {
    const fixture = initRepo("hooks-rollback-unsafe");
    try {
      const first = install(fixture);
      expectChildExit(first, 0);
      const directory = hooksPath(fixture);
      const previous = new Map();
      for (const name of managedHookNames) {
        const content = Buffer.concat([
          readFileSync(join(directory, name)),
          Buffer.from(`\nconteúdo anterior ${name}\n`),
        ]);
        writeFileSync(join(directory, name), content);
        previous.set(name, content);
      }

      const destination = join(directory, "pre-push");
      const result = installWithRollbackFault(fixture, destination);
      const output = result.stdout + result.stderr;
      expectChildExit(result, 1);
      expect(output).toMatch(/rollback|restaur/i);
      expect(output).toMatch(/incomplet|insegur|unsafe/i);
      expect(output).toContain(destination);
      for (const name of managedHookNames.filter((name) => name !== "pre-push")) {
        expect(readFileSync(join(directory, name))).toEqual(previous.get(name));
      }
      expect(readFileSync(destination)).not.toEqual(previous.get("pre-push"));
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
