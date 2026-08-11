// Testes do instalador (install.mjs) via CLI real com HOME isolado.
// Costura: spawn de `node install.mjs` com HOME/USERPROFILE apontando para temp
// (HOME cobre POSIX, USERPROFILE cobre Windows).
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
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
const INSTALLER_AGENTS = [
  "backend-developer.md",
  "frontend-developer.md",
  "integrator.md",
  "peer-reviewer.md",
  "refactorer.md",
  "spec-kit-author.md",
  "test-author.md",
  "validator.md",
  "deep-reviewer.md",
];

function newHome() {
  return mkdtempSync(join(tmpdir(), "install-home-"));
}

function newInstallerFixture() {
  const fixture = mkdtempSync(join(tmpdir(), "install-fixture-"));
  copyFileSync(INSTALLER, join(fixture, "install.mjs"));
  copyFileSync(join(repoRoot, "NOTICE"), join(fixture, "NOTICE"));
  for (const skill of INSTALLER_SKILLS) {
    cpSync(join(repoRoot, skill), join(fixture, skill), { recursive: true });
  }
  return fixture;
}

function runInstaller(home, args = [], options = {}) {
  const { installer = INSTALLER, ...spawnOptions } = options;
  const result = spawnSync(process.execPath, [installer, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, USERPROFILE: home, HOME: home },
    ...spawnOptions,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  expect(result.error, output).toBeUndefined();
  expect(result.status, output).not.toBeNull();
  return result;
}

function runFixtureInstaller(home, fixture, args = [], options = {}) {
  return runInstaller(home, args, {
    installer: join(fixture, "install.mjs"),
    cwd: repoRoot,
    ...options,
  });
}
function runInstallerWithLstatFault(home, destination, args = []) {
  const preload = join(home, `.usefulskills-install-lstat-fault-${Math.random().toString(36).slice(2)}.cjs`);
  writeFileSync(
    preload,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const { syncBuiltinESMExports } = require('node:module');",
      "const target = path.resolve(process.env.USEFULSKILLS_INSTALL_LSTAT_DEST);",
      "let injected = false;",
      "const originalLstatSync = fs.lstatSync;",
      "fs.lstatSync = (file, ...args) => {",
      "  if (!injected && path.resolve(String(file)) === target) {",
      "    injected = true;",
      "    const error = new Error(`injected lstat failure for ${target}`);",
      "    error.code = 'EIO';",
      "    throw error;",
      "  }",
      "  return originalLstatSync(file, ...args);",
      "};",
      "syncBuiltinESMExports();",
    ].join("\n"),
  );
  try {
    const result = spawnSync(process.execPath, ["--require", preload, INSTALLER, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        USERPROFILE: home,
        HOME: home,
        USEFULSKILLS_INSTALL_LSTAT_DEST: destination,
      },
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(result.error, output).toBeUndefined();
    expect(result.status, output).not.toBeNull();
    return result;
  } finally {
    rmSync(preload, { force: true });
  }
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
const hardlinkCapability = (() => {
  const probeDir = mkdtempSync(join(tmpdir(), "install-hardlink-"));
  const source = join(probeDir, "source");
  const destination = join(probeDir, "destination");
  try {
    writeFileSync(source, "hardlink probe\n");
    linkSync(source, destination);
    return { available: lstatSync(destination).nlink > 1, reason: "" };
  } catch (error) {
    return { available: false, reason: `hardlink indisponível (${error?.code || error?.message || "erro"})` };
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
})();
const hardlinkTest = hardlinkCapability.available ? it : it.skip;

const deviceCapability = (() => {
  if (process.platform === "win32") {
    return { available: false, reason: "device POSIX não é portável neste Windows; cenário gated" };
  }
  const probeDir = mkdtempSync(join(tmpdir(), "install-device-"));
  const destination = join(probeDir, "device");
  try {
    const created = spawnSync("mknod", [destination, "c", "1", "3"], { encoding: "utf8" });
    return created.status === 0
      ? { available: true, reason: "" }
      : { available: false, reason: `mknod indisponível (${created.stderr || created.status})` };
  } catch (error) {
    return { available: false, reason: `mknod indisponível (${error?.code || error?.message || "erro"})` };
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
})();
const deviceTest = deviceCapability.available ? it : it.skip;
const blockDeviceCapability = (() => {
  if (process.platform === "win32") {
    return { available: false, reason: "block device POSIX não é portável neste Windows; cenário gated" };
  }
  const probeDir = mkdtempSync(join(tmpdir(), "install-block-device-"));
  const destination = join(probeDir, "device");
  try {
    const created = spawnSync("mknod", [destination, "b", "1", "7"], { encoding: "utf8" });
    if (created.error) {
      return { available: false, reason: `mknod indisponível (${created.error.code || created.error.message || "erro"})` };
    }
    if (created.status !== 0) {
      return { available: false, reason: `mknod indisponível (${created.stderr || created.status})` };
    }
    return lstatSync(destination).isBlockDevice()
      ? { available: true, reason: "" }
      : { available: false, reason: "mknod não criou um block device; cenário gated" };
  } catch (error) {
    return { available: false, reason: `mknod indisponível (${error?.code || error?.message || "erro"})` };
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
})();
const blockDeviceTest = blockDeviceCapability.available ? it : it.skip;
const socketTest = process.platform === "win32" ? it.skip : it;

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
  it("distribui NOTICE exatamente em ~/.omp/agent/NOTICE, byte a byte", () => {
    const home = newHome();
    const sourceNotice = join(repoRoot, "NOTICE");
    const destinationNotice = join(home, ".omp", "agent", "NOTICE");
    try {
      const installed = runInstaller(home);
      expect(installed.status, installed.stdout + installed.stderr).toBe(0);
      expect(existsSync(join(home, ".omp", "agent", "skills", "deep-review", "SKILL.md"))).toBe(true);
      expect(existsSync(destinationNotice)).toBe(true);
      expect(lstatSync(destinationNotice).isFile()).toBe(true);
      expect(readFileSync(destinationNotice)).toEqual(readFileSync(sourceNotice));

      const noticeText = readFileSync(destinationNotice, "utf8");
      expect(noticeText).toMatch(/github\.com\/can1357\/oh-my-pi/i);
      expect(noticeText).toMatch(/MIT License/i);
      expect(noticeText).toMatch(/Copyright \(c\) 2025 Mario Zechner/i);
      expect(noticeText).toMatch(/Copyright \(c\) 2025-2026 Can Bölük/i);
      expect(noticeText).toMatch(/Permission is hereby granted/i);
      expect(noticeText).toMatch(/Copyright \(c\) Matt Pocock/i);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("NOTICE regular divergente atualiza no modo normal, mas --check é somente leitura", () => {
    const home = newHome();
    const destinationNotice = join(home, ".omp", "agent", "NOTICE");
    const userNotice = Buffer.from("NOTICE mantido pelo usuário\n\0bytes finais\n");
    try {
      expect(runInstaller(home).status).toBe(0);
      writeFileSync(destinationNotice, userNotice);

      const check = runInstaller(home, ["--check"]);
      const checkOutput = check.stdout + check.stderr;
      expect(check.status, checkOutput).toBe(1);
      expect(checkOutput).toMatch(/notice\s+drift\s+divergente/i);
      expect(readFileSync(destinationNotice)).toEqual(userNotice);

      const install = runInstaller(home);
      expect(install.status, install.stdout + install.stderr).toBe(0);
      expect(readFileSync(destinationNotice)).toEqual(readFileSync(join(repoRoot, "NOTICE")));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("preserva NOTICE de tipo diretório e reporta conflito nos modos normal e --check", () => {
    const home = newHome();
    const destinationNotice = join(home, ".omp", "agent", "NOTICE");
    const marker = join(destinationNotice, "user-content.txt");
    try {
      expect(runInstaller(home).status).toBe(0);
      rmSync(destinationNotice, { force: true });
      mkdirSync(destinationNotice);
      writeFileSync(marker, "não apagar\n");

      for (const args of [[], ["--check"]]) {
        const result = runInstaller(home, args);
        const output = result.stdout + result.stderr;
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/notice.*(?:diretório|directory|tipo|DRIFT)/i);
        expect(lstatSync(destinationNotice).isDirectory()).toBe(true);
        expect(readFileSync(marker, "utf8")).toBe("não apagar\n");
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  if (process.platform === "win32") {
    it.skip("preserva NOTICE symlink — skip: criação de symlink de arquivo requer privilégio no Windows", () => {});
  } else {
    it("preserva NOTICE symlink e reporta conflito nos modos normal e --check", () => {
      const home = newHome();
      const target = newHome();
      const destinationNotice = join(home, ".omp", "agent", "NOTICE");
      const linkTarget = join(target, "user-notice");
      try {
        expect(runInstaller(home).status).toBe(0);
        writeFileSync(linkTarget, "NOTICE do usuário\n");
        rmSync(destinationNotice, { force: true });
        symlinkSync(linkTarget, destinationNotice, "file");

        for (const args of [[], ["--check"]]) {
          const result = runInstaller(home, args);
          const output = result.stdout + result.stderr;
          expect(result.status, output).toBe(1);
          expect(output).toMatch(/notice.*(?:symlink|simb[oó]lico|DRIFT)/i);
          expect(lstatSync(destinationNotice).isSymbolicLink()).toBe(true);
          expect(readFileSync(linkTarget, "utf8")).toBe("NOTICE do usuário\n");
        }
      } finally {
        rmSync(home, { recursive: true, force: true });
        rmSync(target, { recursive: true, force: true });
      }
    });
  }

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

  it("--check reporta arquivo regular divergente sem alterar seus bytes", () => {
    const home = newHome();
    const destination = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
    const userContent = Buffer.from("conteúdo regular do usuário\n\0não substituir\n");
    try {
      expect(runInstaller(home).status).toBe(0);
      writeFileSync(destination, userContent);

      const result = runInstaller(home, ["--check"]);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/deep-reviewer\.md.*divergente/i);
      expect(lstatSync(destination).isFile()).toBe(true);
      expect(readFileSync(destination)).toEqual(userContent);
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
      expect(result.status, output).toBe(1);
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

  fifoTest(
    `modo normal preserva destino FIFO conflitante e não aplica operações pendentes${
      fifoCapability.available ? "" : ` — skip: ${fifoCapability.reason}`
    }`,
    () => {
      const home = newHome();
      try {
        expect(runInstaller(home).status).toBe(0);
        const destination = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
        const pendingFile = join(home, ".omp", "agent", "skills", "ship", "SKILL.md");
        rmSync(destination, { force: true });
        rmSync(pendingFile, { force: true });
        const created = spawnSync("mkfifo", [destination], { encoding: "utf8" });
        expect(created.error, created.stdout + created.stderr).toBeUndefined();
        expect(created.status, created.stdout + created.stderr).toBe(0);

        const result = runInstaller(home, [], { timeout: 2000 });
        const output = result.stdout + result.stderr;
        expect(output).not.toContain("ETIMEDOUT");
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/deep-reviewer\.md.*(?:FIFO|fifo|especial|special|DRIFT)/i);
        expect(lstatSync(destination).isFIFO()).toBe(true);
        expect(existsSync(pendingFile)).toBe(false);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
  it("inventário completo mantém exatamente 7 skills e 9 agentes", () => {
    const home = newHome();
    try {
      const installed = runInstaller(home);
      expect(installed.status, installed.stdout + installed.stderr).toBe(0);
      const skillsRoot = join(home, ".omp", "agent", "skills");
      const agentsRoot = join(home, ".omp", "agent", "agents");
      const skills = readdirSync(skillsRoot).sort();
      const agents = readdirSync(agentsRoot).sort();
      expect(skills).toHaveLength(7);
      expect(skills).toEqual([...INSTALLER_SKILLS].sort());
      expect(agents).toHaveLength(9);
      expect(agents).toEqual([...INSTALLER_AGENTS].sort());
      for (const file of agents) expect(lstatSync(join(agentsRoot, file)).isFile()).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("precedência projeto vence perfil para todos os 9 agentes sem sobrescrever nenhum lado", () => {
    const home = newHome();
    const fixture = newInstallerFixture();
    const project = join(home, "project");
    try {
      const initial = runFixtureInstaller(home, fixture);
      expect(initial.status, initial.stdout + initial.stderr).toBe(0);
      const profileRoot = join(home, ".omp", "agent", "agents");
      const profileContents = new Map(
        INSTALLER_AGENTS.map((file) => [file, readFileSync(join(profileRoot, file), "utf8")]),
      );
      mkdirSync(join(project, ".omp", "agents"), { recursive: true });
      for (const file of INSTALLER_AGENTS) {
        writeFileSync(join(project, ".omp", "agents", file), `projeto vence: ${file}\n`);
      }

      const result = runFixtureInstaller(home, fixture, [], { cwd: project });
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      for (const file of INSTALLER_AGENTS) {
        expect(output).toContain(file);
        expect(readFileSync(join(project, ".omp", "agents", file), "utf8")).toBe(`projeto vence: ${file}\n`);
        expect(readFileSync(join(profileRoot, file), "utf8")).toBe(profileContents.get(file));
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("preflight valida destinos tardios antes da primeira escrita e falha em modo all-or-nothing", () => {
    const home = newHome();
    const notice = join(home, ".omp", "agent", "NOTICE");
    const noticeBefore = Buffer.from("NOTICE divergente do usuário\n");
    const conflict = join(home, ".omp", "agent", "agents", "validator.md");
    const marker = join(conflict, "preserve.txt");
    try {
      mkdirSync(dirname(notice), { recursive: true });
      writeFileSync(notice, noticeBefore);
      mkdirSync(conflict, { recursive: true });
      writeFileSync(marker, "não apagar\n");
      const result = runInstaller(home);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/validator|conflito|tipo|DRIFT/i);
      expect(existsSync(join(home, ".omp", "agent", "skills"))).toBe(false);
      expect(existsSync(join(home, ".omp", "agent", "agents", "backend-developer.md"))).toBe(false);
      expect(readFileSync(notice)).toEqual(noticeBefore);
      expect(readFileSync(marker, "utf8")).toBe("não apagar\n");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  hardlinkTest(
    `preflight detecta hardlink no destino sem tratá-lo como arquivo regular${
      hardlinkCapability.available ? "" : ` — skip: ${hardlinkCapability.reason}`
    }`,
    () => {
      const home = newHome();
      try {
        expect(runInstaller(home).status).toBe(0);
        const destination = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
        const source = join(home, "user-hardlink-source.md");
        writeFileSync(source, readFileSync(destination));
        rmSync(destination, { force: true });
        linkSync(source, destination);

        const result = runInstaller(home, ["--check"]);
        const output = result.stdout + result.stderr;
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/hard.?link|link|tipo|DRIFT/i);
        expect(lstatSync(destination).nlink).toBeGreaterThan(1);
        expect(readFileSync(source, "utf8")).toBe(readFileSync(destination, "utf8"));
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );

  socketTest(
    "preflight detecta socket Unix no destino sem bloquear a instalação",
    async () => {
      const home = newHome();
      const destination = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
      const server = createServer();
      try {
        expect(runInstaller(home).status).toBe(0);
        rmSync(destination, { force: true });
        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen(destination, resolve);
        });

        const result = runInstaller(home, ["--check"], { timeout: 2000 });
        const output = result.stdout + result.stderr;
        expect(result.error?.code, output).not.toBe("ETIMEDOUT");
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/socket|soquete|especial|DRIFT/i);
        expect(lstatSync(destination).isSocket()).toBe(true);
      } finally {
        await new Promise((resolve) => server.close(resolve));
        rmSync(home, { recursive: true, force: true });
      }
    },
  );

  deviceTest(
    `preflight detecta device no destino sem substituí-lo${
      deviceCapability.available ? "" : ` — skip: ${deviceCapability.reason}`
    }`,
    () => {
      const home = newHome();
      try {
        expect(runInstaller(home).status).toBe(0);
        const destination = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
        rmSync(destination, { force: true });
        const created = spawnSync("mknod", [destination, "c", "1", "3"], { encoding: "utf8" });
        expect(created.status, created.stdout + created.stderr).toBe(0);

        const result = runInstaller(home, ["--check"]);
        const output = result.stdout + result.stderr;
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/device|dispositivo|character|especial|DRIFT/i);
        expect(lstatSync(destination).isCharacterDevice()).toBe(true);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );

  blockDeviceTest(
    `preflight detecta block device no destino sem substituí-lo${
      blockDeviceCapability.available ? "" : ` — skip: ${blockDeviceCapability.reason}`
    }`,
    () => {
      const home = newHome();
      try {
        expect(runInstaller(home).status).toBe(0);
        const destination = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
        rmSync(destination, { force: true });
        const created = spawnSync("mknod", [destination, "b", "1", "7"], { encoding: "utf8" });
        expect(created.error, created.stdout + created.stderr).toBeUndefined();
        expect(created.status, created.stdout + created.stderr).toBe(0);

        const result = runInstaller(home, ["--check"], { timeout: 2000 });
        const output = result.stdout + result.stderr;
        expect(output).not.toContain("ETIMEDOUT");
        expect(result.status, output).toBe(1);
        expect(output).toMatch(/block device|bloco|especial|DRIFT/i);
        expect(lstatSync(destination).isBlockDevice()).toBe(true);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );

  it("preflight detecta junction/symlink de diretório gerenciado sem segui-lo", () => {
    const home = newHome();
    const target = newHome();
    try {
      expect(runInstaller(home).status).toBe(0);
      const destination = join(home, ".omp", "agent", "skills", "ship");
      rmSync(destination, { recursive: true, force: true });
      symlinkSync(target, destination, process.platform === "win32" ? "junction" : "dir");

      const result = runInstaller(home, ["--check"]);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/junction|symlink|simb[oó]lico|DRIFT/i);
      expect(lstatSync(destination).isSymbolicLink()).toBe(true);
      expect(existsSync(join(target, "SKILL.md"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("preflight detecta ancestral inválido sem criar diretórios ou remover o marcador", () => {
    const home = newHome();
    const skillsRoot = join(home, ".omp", "agent", "skills");
    const marker = "ancestral inválido\n";
    try {
      mkdirSync(join(home, ".omp", "agent"), { recursive: true });
      writeFileSync(skillsRoot, marker);
      const result = runInstaller(home, ["--check"]);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/ancestral|arquivo|tipo|DRIFT/i);
      expect(lstatSync(skillsRoot).isFile()).toBe(true);
      expect(readFileSync(skillsRoot, "utf8")).toBe(marker);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("lstat operacional de agente existente bloqueia antes de escrever e preserva sentinel anterior", () => {
    const home = newHome();
    const destination = join(home, ".omp", "agent", "agents", "deep-reviewer.md");
    const pendingFile = join(home, ".omp", "agent", "skills", "ship", "SKILL.md");
    const sentinel = Buffer.from("sentinel da operação anterior\n\0não substituir\n");
    try {
      const initial = runInstaller(home);
      expect(initial.status, initial.stdout + initial.stderr).toBe(0);
      expect(lstatSync(destination).isFile()).toBe(true);
      writeFileSync(destination, sentinel);
      rmSync(pendingFile, { force: true });

      const result = runInstallerWithLstatFault(home, destination);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/deep-reviewer|EIO|lstat|inacessível|DRIFT/i);
      expect(readFileSync(destination)).toEqual(sentinel);
      expect(existsSync(pendingFile)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("NOTICE ausente na origem falha fechado sem criar ou distribuir instalação parcial", () => {
    const home = newHome();
    const fixture = newInstallerFixture();
    rmSync(join(fixture, "NOTICE"), { force: true });
    try {
      expect(existsSync(join(fixture, "NOTICE"))).toBe(false);
      const result = runFixtureInstaller(home, fixture);
      const output = result.stdout + result.stderr;
      expect(result.status, output).toBe(1);
      expect(output).toMatch(/NOTICE.*(?:ausente|origem|FALTA)|(?:ausente|FALTA).*NOTICE/i);
      expect(readdirSync(home)).toEqual([]);
      expect(existsSync(join(home, ".omp", "agent", "NOTICE"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(fixture, { recursive: true, force: true });
    }
  });

});
