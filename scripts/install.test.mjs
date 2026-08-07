// Testes do instalador (install.mjs) via CLI real com HOME isolado.
// Costura: spawn de `node install.mjs` com HOME/USERPROFILE apontando para temp
// (HOME cobre POSIX, USERPROFILE cobre Windows).
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER = join(repoRoot, "install.mjs");

function newHome() {
  return mkdtempSync(join(tmpdir(), "install-home-"));
}

function runInstaller(home, args = []) {
  return spawnSync(process.execPath, [INSTALLER, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, USERPROFILE: home, HOME: home },
  });
}

describe("install.mjs", () => {
  it("instala o inventário e --check limpo em seguida (idempotente)", () => {
    const home = newHome();
    try {
      const inst = runInstaller(home);
      expect(inst.status, inst.stdout + inst.stderr).toBe(0);
      expect(existsSync(join(home, ".omp", "agent", "skills", "ship", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".omp", "agent", "agents", "deep-reviewer.md"))).toBe(true);
      const chk = runInstaller(home, ["--check"]);
      expect(chk.status, chk.stdout + chk.stderr).toBe(0);
      expect(chk.stdout).toContain("sincronizada");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("--check reporta agente extra no destino (drift, exit 1, não remove)", () => {
    const home = newHome();
    try {
      expect(runInstaller(home).status).toBe(0);
      const extra = join(home, ".omp", "agent", "agents", "custom.md");
      writeFileSync(extra, "# extra");
      const chk = runInstaller(home, ["--check"]);
      expect(chk.status, chk.stdout).toBe(1);
      expect(chk.stdout).toMatch(/custom\.md/);
      expect(existsSync(extra)).toBe(true); // --check nunca remove
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("--check não quebra quando o destino da skill é um arquivo (reporta drift)", () => {
    const home = newHome();
    try {
      expect(runInstaller(home).status).toBe(0);
      const shipDir = join(home, ".omp", "agent", "skills", "ship");
      rmSync(shipDir, { recursive: true, force: true });
      writeFileSync(shipDir, "arquivo no lugar do diretório");
      const chk = runInstaller(home, ["--check"]);
      expect(chk.status).toBe(1);
      expect(chk.stdout + chk.stderr).not.toContain("ENOTDIR");
      expect(chk.stdout).toMatch(/ship/);
      // o arquivo NÃO é destruído pelo --check
      expect(existsSync(shipDir)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("--check não quebra quando o destino dos AGENTES é um arquivo (reporta drift)", () => {
    const home = newHome();
    try {
      expect(runInstaller(home).status).toBe(0);
      const agentsDir = join(home, ".omp", "agent", "agents");
      rmSync(agentsDir, { recursive: true, force: true });
      writeFileSync(agentsDir, "arquivo no lugar do diretório");
      const chk = runInstaller(home, ["--check"]);
      expect(chk.status, chk.stdout + chk.stderr).toBe(1);
      expect(chk.stdout + chk.stderr).not.toContain("ENOTDIR");
      // o arquivo NÃO é destruído pelo --check
      expect(existsSync(agentsDir)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("modo normal preserva arquivos extras (não destrutivo)", () => {
    const home = newHome();
    try {
      expect(runInstaller(home).status).toBe(0);
      const extra = join(home, ".omp", "agent", "agents", "custom.md");
      writeFileSync(extra, "# extra");
      expect(runInstaller(home).status).toBe(0);
      expect(existsSync(extra)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
