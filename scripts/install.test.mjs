// Testes do instalador (install.mjs) via CLI real com HOME isolado.
// Costura: spawn de `node install.mjs` com HOME/USERPROFILE apontando para temp
// (HOME cobre POSIX, USERPROFILE cobre Windows).
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER = join(repoRoot, "install.mjs");
const INSTALLER_SKILLS = [
  "alignment",
  "bug-diagnosis",
  "conflict-resolution",
  "deep-review",
  "release-bootstrap",
  "ship",
  "tdd-orchestrator",
];

function newHome() {
  return mkdtempSync(join(tmpdir(), "install-home-"));
}

function newInstallerFixture() {
  const fixture = mkdtempSync(join(tmpdir(), "install-fixture-"));
  copyFileSync(INSTALLER, join(fixture, "install.mjs"));
  for (const skill of INSTALLER_SKILLS) {
    cpSync(join(repoRoot, skill), join(fixture, skill), { recursive: true });
  }
  return fixture;
}

function runInstaller(home, args = [], options = {}) {
  const { installer = INSTALLER, ...spawnOptions } = options;
  return spawnSync(process.execPath, [installer, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, USERPROFILE: home, HOME: home },
    ...spawnOptions,
  });
}

function runFixtureInstaller(home, fixture, args = [], options = {}) {
  return runInstaller(home, args, {
    installer: join(fixture, "install.mjs"),
    cwd: repoRoot,
    ...options,
  });
}

const readabilityCapability = (() => {
  if (process.platform === "win32") {
    return { available: false, reason: "permissões POSIX não são portáveis neste Windows; cenário gated" };
  }
  const probe = mkdtempSync(join(tmpdir(), "install-readability-"));
  try {
    chmodSync(probe, 0);
    try {
      readdirSync(probe);
      return { available: false, reason: "o ambiente não aplica EACCES a diretórios sem permissão de leitura" };
    } catch (error) {
      return error?.code === "EACCES" || error?.code === "EPERM"
        ? { available: true, reason: "" }
        : { available: false, reason: `chmod não produziu EACCES (${error?.code || error?.message || "erro"})` };
    }
  } catch (error) {
    return { available: false, reason: `chmod indisponível (${error?.code || error?.message || "erro"})` };
  } finally {
    try {
      chmodSync(probe, 0o700);
    } catch {
      // O diretório temporário será removido abaixo quando possível.
    }
    rmSync(probe, { recursive: true, force: true });
  }
})();

const fifoCapability = (() => {
  if (process.platform === "win32") {
    return { available: false, reason: "FIFO não é portável neste Windows; cenário gated" };
  }
  try {
    const probe = spawnSync("mkfifo", ["--help"], { stdio: "ignore" });
    return probe.status === 0
      ? { available: true, reason: "" }
      : { available: false, reason: "mkfifo indisponível nesta plataforma; cenário gated" };
  } catch {
    return { available: false, reason: "mkfifo indisponível nesta plataforma; cenário gated" };
  }
})();
const fifoTest = fifoCapability.available ? it : it.skip;

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
  it("--check reporta skill extra no destino (drift, exit 1, não remove)", () => {
    const home = newHome();
    try {
      expect(runInstaller(home).status).toBe(0);
      const extra = join(home, ".omp", "agent", "skills", "old-skill", "SKILL.md");
      const extraDir = join(home, ".omp", "agent", "skills", "old-skill");
      mkdirSync(extraDir, { recursive: true });
      writeFileSync(extra, "# antiga");
      const chk = runInstaller(home, ["--check"]);
      expect(chk.status, chk.stdout + chk.stderr).toBe(1);
      expect(chk.stdout).toContain("old-skill");
      expect(existsSync(extra)).toBe(true);
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
      expect(existsSync(agentsDir)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("modo normal retorna falha quando há conflito de tipo", () => {
    const home = newHome();
    try {
      expect(runInstaller(home).status).toBe(0);
      const target = join(home, ".omp", "agent", "skills", "ship", "SKILL.md");
      rmSync(target, { force: true });
      mkdirSync(target, { recursive: true });
      const inst = runInstaller(home);
      expect(inst.status).toBe(1);
      expect(inst.stdout + inst.stderr).toContain("DRIFT");
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
  it("falha antes de escrever quando ~/.omp é um symlink", () => {
    const home = newHome();
    const target = newHome();
    try {
      const ompLink = join(home, ".omp");
      const ompTarget = join(target, "omp-target");
      mkdirSync(ompTarget, { recursive: true });
      symlinkSync(ompTarget, ompLink, process.platform === "win32" ? "junction" : "dir");
      const result = runInstaller(home);
      expect(result.status, result.stdout + result.stderr).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/symlink|simb[oó]lico/i);
      expect(existsSync(join(ompTarget, "agent", "skills"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });
  it("origem esperada ausente produz drift explícito em vez de sucesso silencioso", () => {
    const home = newHome();
    const fixture = newInstallerFixture();
    const source = join(fixture, "alignment", "SKILL.md");
    try {
      rmSync(source, { force: true });
      const result = runFixtureInstaller(home, fixture);
      const output = result.stdout + result.stderr;
      expect(result.status, output).not.toBe(0);
      expect(output).toMatch(/DRIFT|FALTA|E_INSTALL_DRIFT|origem/i);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("conflito de diretório onde há agente gerenciado não é destrutivo", () => {
    const home = newHome();
    try {
      expect(runInstaller(home).status).toBe(0);
      const target = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
      rmSync(target, { force: true });
      mkdirSync(target, { recursive: true });
      const marker = join(target, "user-content");
      writeFileSync(marker, "não apagar\n");

      const result = runInstaller(home);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/DRIFT|conflito de tipo/i);
      expect(lstatSync(target).isDirectory()).toBe(true);
      expect(readFileSync(marker, "utf8")).toBe("não apagar\n");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  if (process.platform === "win32") {
    it.skip("symlink em arquivo gerenciado — skip: criação de symlink de arquivo requer privilégio no Windows", () => {});
  } else {
    it("reporta symlink em arquivo gerenciado sem substituí-lo", () => {
      const home = newHome();
      const target = newHome();
      try {
        expect(runInstaller(home).status).toBe(0);
        const destination = join(home, ".omp", "agent", "skills", "ship", "SKILL.md");
        const linkTarget = join(target, "user-skill.md");
        writeFileSync(linkTarget, "conteúdo do usuário\n");
        rmSync(destination, { force: true });
        symlinkSync(linkTarget, destination, "file");

        const result = runInstaller(home, ["--check"]);
        const output = result.stdout + result.stderr;
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/symlink|simb[oó]lico/i);
        expect(lstatSync(destination).isSymbolicLink()).toBe(true);
        expect(readFileSync(linkTarget, "utf8")).toBe("conteúdo do usuário\n");
      } finally {
        rmSync(home, { recursive: true, force: true });
        rmSync(target, { recursive: true, force: true });
      }
    });
  }

  it("--check distingue agente gerenciado obsoleto de extra do usuário", () => {
    const home = newHome();
    const fixture = newInstallerFixture();
    const source = join(fixture, "deep-review", "agents", "deep-reviewer.md");
    try {
      expect(runFixtureInstaller(home, fixture).status).toBe(0);
      rmSync(source, { force: true });
      const extra = join(home, ".omp", "agent", "agents", "custom.md");
      writeFileSync(extra, "# extra do usuário\n");

      const result = runFixtureInstaller(home, fixture, ["--check"]);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/stale|obsolet[oa]|gerenciad[oa].*(?:ausent|removid)/i);
      expect(output).toMatch(/custom\.md/);
      expect(existsSync(join(home, ".omp", "agent", "agents", "deep-reviewer.md"))).toBe(true);
      expect(existsSync(extra)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(fixture, { recursive: true, force: true });
    }
  });
  it("preflight do instalador declara rejeição de Node abaixo de 20", () => {
    const installerSource = readFileSync(INSTALLER, "utf8");
    expect(installerSource).toMatch(/process\.versions\.node/);
    expect(installerSource).toMatch(/E_UNSUPPORTED_NODE/);
    expect(installerSource).toMatch(/(?:Node|node).{0,80}20|20.{0,80}(?:Node|node)/i);
  });

  it("isola HOME, não confunde perfil com projeto e preserva precedência de duplicatas", () => {
    const home = newHome();
    const fixture = newInstallerFixture();
    const project = join(home, "project");
    const profileAgent = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
    try {
      const initial = runFixtureInstaller(home, fixture);
      expect(initial.status, initial.stdout + initial.stderr).toBe(0);
      const profileContent = readFileSync(profileAgent, "utf8");
      mkdirSync(project, { recursive: true });

      const withoutProjectAgent = runFixtureInstaller(home, fixture, [], { cwd: project });
      expect(withoutProjectAgent.status, withoutProjectAgent.stdout + withoutProjectAgent.stderr).toBe(0);
      expect(withoutProjectAgent.stdout + withoutProjectAgent.stderr).not.toMatch(/duplicata/i);

      const projectAgent = join(project, ".omp", "agents", "deep-reviewer.md");
      const projectContent = "# agente do projeto vence\n";
      mkdirSync(dirname(projectAgent), { recursive: true });
      writeFileSync(projectAgent, projectContent);

      const duplicate = runFixtureInstaller(home, fixture, [], { cwd: project });
      const output = duplicate.stdout + duplicate.stderr;
      expect(duplicate.status, output).toBe(1);
      expect(output).toMatch(/duplicat|projeto.*(?:preced|vence)|preced.*projeto/i);
      expect(output).toContain(projectAgent);
      expect(readFileSync(projectAgent, "utf8")).toBe(projectContent);
      expect(readFileSync(profileAgent, "utf8")).toBe(profileContent);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("detecta diretório de origem vazio ausente no destino", () => {
    const home = newHome();
    const fixture = newInstallerFixture();
    const source = join(fixture, "alignment", "empty-source-dir");
    const destination = join(home, ".omp", "agent", "skills", "alignment", "empty-source-dir");
    try {
      mkdirSync(source, { recursive: true });
      const installed = runFixtureInstaller(home, fixture);
      expect(installed.status, installed.stdout + installed.stderr).toBe(0);
      rmSync(destination, { recursive: true, force: true });

      const result = runFixtureInstaller(home, fixture, ["--check"]);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/empty-source-dir|diretório|ausent|DRIFT/i);
      expect(existsSync(destination)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("detecta arquivo regular no destino onde a origem tem diretório vazio", () => {
    const home = newHome();
    const fixture = newInstallerFixture();
    const source = join(fixture, "alignment", "empty-source-dir");
    const destination = join(home, ".omp", "agent", "skills", "alignment", "empty-source-dir");
    const marker = "conteúdo do usuário\n";
    try {
      mkdirSync(source, { recursive: true });
      const installed = runFixtureInstaller(home, fixture);
      expect(installed.status, installed.stdout + installed.stderr).toBe(0);
      rmSync(destination, { recursive: true, force: true });
      writeFileSync(destination, marker);

      const result = runFixtureInstaller(home, fixture, ["--check"]);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/empty-source-dir|arquivo|tipo|DRIFT/i);
      expect(lstatSync(destination).isFile()).toBe(true);
      expect(readFileSync(destination, "utf8")).toBe(marker);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(fixture, { recursive: true, force: true });
    }
  });
  if (process.platform === "win32") {
    it.skip("--check preserva extras quando a raiz de agentes não é legível — skip: permissões POSIX não são portáveis no Windows", () => {});
  } else if (!readabilityCapability.available) {
    it.skip(`--check preserva extras quando a raiz de agentes não é legível — skip: ${readabilityCapability.reason}`, () => {});
  } else {
    it("--check trata raiz de agentes ilegível como drift e preserva extras", () => {
      const home = newHome();
      const agentsRoot = join(home, ".omp", "agent", "agents");
      const extra = join(agentsRoot, "custom-readable.md");
      const extraContent = "# extra preservado\n";
      try {
        expect(runInstaller(home).status).toBe(0);
        writeFileSync(extra, extraContent);
        chmodSync(agentsRoot, 0);
        let result;
        try {
          result = runInstaller(home, ["--check"], { timeout: 2000 });
        } finally {
          chmodSync(agentsRoot, 0o755);
        }
        const output = result.stdout + result.stderr;
        expect(result.error?.code, output).not.toBe("ETIMEDOUT");
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/E_INSTALL_DRIFT|DRIFT|não foi possível ler|inacessível/i);
        expect(existsSync(extra)).toBe(true);
        expect(readFileSync(extra, "utf8")).toBe(extraContent);
      } finally {
        try {
          chmodSync(agentsRoot, 0o755);
        } catch {
          // A raiz pode não existir se o preflight falhar antes de criá-la.
        }
        rmSync(home, { recursive: true, force: true });
      }
    });
  }


  fifoTest(
    `--check trata destino FIFO como drift sem bloquear ou fazer hash${
      fifoCapability.available ? "" : ` — skip: ${fifoCapability.reason}`
    }`,
    () => {
      const home = newHome();
      try {
        expect(runInstaller(home).status).toBe(0);
        const destination = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
        rmSync(destination, { force: true });
        const created = spawnSync("mkfifo", [destination], { encoding: "utf8" });
        expect(created.status, created.stdout + created.stderr).toBe(0);

        const result = runInstaller(home, ["--check"], { timeout: 2000 });
        const output = result.stdout + result.stderr;
        expect(result.error?.code, output).not.toBe("ETIMEDOUT");
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/DRIFT|fifo|especial|special/i);
        expect(lstatSync(destination).isFIFO()).toBe(true);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
});
