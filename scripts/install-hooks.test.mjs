// Testes de regressão do instalador de hooks e dos wrappers gerados.
// Costura: repo git temporário + cópia de scripts/; os wrappers são exercitados
// com sh real (o mesmo que o git usa) e cwd na raiz do repo (para o hook
// commit-msg resolver o commitlint em node_modules/.bin).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  cpSync(join(repoRoot, "scripts"), join(dir, "scripts"), { recursive: true });
  return dir;
}

function install(dir) {
  return spawnSync("node", ["scripts/install-hooks.mjs"], { cwd: dir, encoding: "utf8" });
}

// Roda o hook INSTALADO (wrapper sh) como o git rodaria.
function runHook(dir, hook, opts = {}) {
  const { args = [], ...rest } = opts;
  return spawnSync(sh, [join(dir, ".git", "hooks", hook), ...args], {
    cwd: repoRoot, // commit-msg resolve commitlint daqui
    encoding: "utf8",
    ...rest,
  });
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

  it("wrapper repassa argumentos: mensagem inválida é rejeitada (exit 1)", () => {
    const r = runHook(dir, "commit-msg", { args: [msgFile(dir, "isto nao e convencional")] });
    expect(r.status).toBe(1);
  });

  it("wrapper repassa argumentos: mensagem convencional válida passa (exit 0)", () => {
    const r = runHook(dir, "commit-msg", { args: [msgFile(dir, "feat: algo valido")] });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it("isenta Merge/Revert do git, mas não prefixos parecidos", () => {
    const isento = runHook(dir, "commit-msg", { args: [msgFile(dir, "Merge branch 'x' into main")] });
    expect(isento.status).toBe(0);
    const parecido = runHook(dir, "commit-msg", { args: [msgFile(dir, "Mergeable stuff")] });
    expect(parecido.status).toBe(1);
  });

  it("pre-push recebe refs pela stdin através do wrapper", () => {
    const bloqueia = runHook(dir, "pre-push", { input: "refs/heads/main 0 0 0\n" });
    expect(bloqueia.status).toBe(1);
    const libera = runHook(dir, "pre-push", { input: "refs/heads/feat/1-x abc 0 0\n" });
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
    // Repo git em caminho com espaços + commitlint resolvível nele
    // (junction de node_modules = cenário real de 'C:\Users\Ana Silva\repo',
    // onde npm install já rodou).
    const spaced = mkdtempSync(join(tmpdir(), "caminho com espaco "));
    spawnSync("git", ["init", "-q"], { cwd: spaced });
    symlinkSync(join(repoRoot, "node_modules"), join(spaced, "node_modules"), "junction");
    copyFileSync(join(repoRoot, ".commitlintrc.json"), join(spaced, ".commitlintrc.json"));
    try {
      const valida = runHook(dir, "commit-msg", {
        args: [msgFile(dir, "feat: msg valida")],
        cwd: spaced,
      });
      expect(valida.status, valida.stdout + valida.stderr).toBe(0);
      const invalida = runHook(dir, "commit-msg", {
        args: [msgFile(dir, "nao convencional")],
        cwd: spaced,
      });
      expect(invalida.status).toBe(1);
    } finally {
      rmSync(spaced, { recursive: true, force: true });
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
