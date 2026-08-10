import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const shipSkillPath = join(repoRoot, "ship", "SKILL.md");
const shipSourcePath = join(repoRoot, "ship", "bin", "ship.mjs");
const shipSkill = readFileSync(shipSkillPath, "utf8");
const shipSource = readFileSync(shipSourcePath, "utf8");
const releaseConfig = JSON.parse(readFileSync(join(repoRoot, "release-please-config.json"), "utf8"));
const releaseManifest = JSON.parse(readFileSync(join(repoRoot, ".release-please-manifest.json"), "utf8"));

function sectionFrom(text, start, end) {
  const startAt = text.indexOf(start);
  expect(startAt, `seção ausente: ${start}`).toBeGreaterThanOrEqual(0);
  const endAt = end ? text.indexOf(end, startAt + start.length) : text.length;
  expect(endAt, `seção seguinte ausente: ${end}`).toBeGreaterThan(startAt);
  return text.slice(startAt, endAt);
}

function semverParts(value) {
  const match = typeof value === "string" && value.match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

describe("protocolo Ship: conflito e fonte de versão", () => {
  it("AC-002: conflito resolvido exige checks e deep-review final antes da publicação", () => {
    const conflictProtocol = sectionFrom(shipSkill, "Se o PR entrar em conflito", "6. **Release**");

    expect(conflictProtocol).toMatch(/git merge origin\/<default>/);
    expect(conflictProtocol).toMatch(/(?:checks?|su[ií]te|CI)/i);
    expect(conflictProtocol).toMatch(/(?:deep-review|re-review)/i);
    expect(conflictProtocol).toMatch(/(?:intervalo|revis[aã]o) final/i);
    expect(conflictProtocol).toMatch(/(?:veredito|resultado).{0,120}(?:v[aá]lido|aprova)/i);
    expect(conflictProtocol).toMatch(/(?:sem|sem um).{0,120}(?:public|PR|release).{0,80}(?:bloque|n[aã]o)/i);
  });

  it("AC-029: a política de release valida unidades packages e falha para fonte que Ship não resolve", () => {
    const packages = releaseConfig.packages;
    expect(packages).toBeTypeOf("object");
    expect(Object.keys(packages)).not.toHaveLength(0);
    expect(releaseConfig).not.toHaveProperty("release-as");
    expect(releaseManifest).toEqual(expect.objectContaining(Object.fromEntries(Object.keys(packages).map((unit) => [unit, expect.any(String)]))));
    expect(Object.keys(releaseManifest).sort()).toEqual(Object.keys(packages).sort());
    for (const [unit, packageConfig] of Object.entries(packages)) {
      expect(packageConfig).not.toHaveProperty("release-as");
      const initial = semverParts(packageConfig["initial-version"]);
      const manifest = semverParts(releaseManifest[unit]);
      expect(initial, `initial-version inválido para ${unit}`).not.toBeNull();
      expect(manifest, `versão do manifest inválida para ${unit}`).not.toBeNull();
      expect(manifest[0], `major divergente para ${unit}`).toBe(initial[0]);
    }

    for (const unit of Object.keys(packages)) {
      const packagePath = unit === "." ? join(repoRoot, "package.json") : join(repoRoot, unit, "package.json");
      expect(existsSync(packagePath), `package.json ausente para ${unit}`).toBe(true);
    }

    const versionPolicy = `${shipSkill}\n${shipSource}`;
    expect(versionPolicy).toMatch(/(?:monorepo|multi[- ]package|m[uú]ltiplas unidades)/i);
    expect(versionPolicy).toMatch(/(?:packages|unidades)[\s\S]{0,260}(?:fonte|source|resolver|resolve)/i);
    expect(versionPolicy).toMatch(
      /(?:(?:incompat[ií]vel|incompatible|falha explicitamente|fail(?:s|ure)? closed|bloqueia)[\s\S]{0,180}(?:version|vers[aã]o|packages|unidades)|(?:version|vers[aã]o|packages|unidades)[\s\S]{0,180}(?:incompat[ií]vel|incompatible|falha explicitamente|fail(?:s|ure)? closed|bloqueia))/i,
    );
    expect(versionPolicy).toMatch(/versionCheckUrl[\s\S]{0,260}(?:unit|unidade|package|packages)/i);
  });
});

describe("RED: contrato operacional de deploy e publicação", () => {
  it("AC-001: deploy documenta validação de startCommand antes de stop", () => {
    const deploySection = sectionFrom(shipSource, "async function deploy()", "// ---------- dispatch");
    const startValidation = deploySection.indexOf("startCommand");
    const stopExecution = deploySection.indexOf("spawnSync(cfg.stopCommand");

    expect(startValidation).toBeGreaterThanOrEqual(0);
    expect(stopExecution).toBeGreaterThanOrEqual(0);
    expect(startValidation).toBeLessThan(stopExecution);
  });

  it("AC-002: buildCommand=null é reportado como build NA com reason/evidence", () => {
    expect(shipSource).toMatch(/build\s*:\s*["']?NA/i);
    expect(shipSource).toMatch(/(?:reason|motivo)/i);
    expect(shipSource).toMatch(/(?:evidence|evidência)/i);
  });

  it("AC-002: diff e backup ficam dentro da fronteira de rollback após stop", () => {
    const deploySection = sectionFrom(shipSource, "async function deploy()", "// ---------- dispatch");
    const diffSection = sectionFrom(deploySection, "const changed =", "const watch =");
    const backupSection = sectionFrom(deploySection, "let backupDest;", "if (backupDest)");

    expect(diffSection).toMatch(/failAfterStoppedDeploy|restoreStoppedDeployment/);
    expect(backupSection).toMatch(/failAfterStoppedDeploy/);
  });
});

describe("RED_REVISION: âncoras semânticas do protocolo de deploy", () => {
  it("AC-001: valida startCommand no guard do deploy antes da chamada inicial de stop", () => {
    const deploySection = sectionFrom(shipSource, "async function deploy()", "// ---------- dispatch");
    const startGuard = deploySection.match(
      /if\s*\(\s*cfg\.stopCommand\s*&&\s*\(typeof startCommand !== "string"\s*\|\|\s*!startCommand\.trim\(\)\)\s*\)\s*\{[\s\S]*?process\.exit\(1\);\s*\}/,
    );
    const initialStop = deploySection.match(
      /if\s*\(\s*cfg\.stopCommand\s*\)\s*\{[\s\S]*?const stopResult = spawnSync\(cfg\.stopCommand,\s*\{[\s\S]*?\}\);\s*if\s*\(stopResult\?\.status !== 0\)/,
    );

    expect(startGuard, "guard de startCommand não encontrado no preflight").not.toBeNull();
    expect(initialStop, "chamada inicial de stopCommand não encontrada").not.toBeNull();
    expect(startGuard.index).toBeLessThan(initialStop.index);
    expect(startGuard[0]).toMatch(/startCommand/);
    expect(initialStop[0]).toMatch(/spawnSync\(cfg\.stopCommand/);
  });
});
describe("RED_REVISION: contrato de transições pós-pull e marcadores", () => {
  it("AC-002: mudanças pós-pull de stop/start permanecem na fronteira de rollback", () => {
    const deploySection = sectionFrom(shipSource, "async function deploy()", "// ---------- dispatch");
    const postPullStart = deploySection.lastIndexOf("cfg = validateDeployConfig(readConfig())");
    const postPullEnd = deploySection.indexOf("const changed =", postPullStart);
    expect(postPullStart, "releitura de configuração pós-pull não encontrada").toBeGreaterThanOrEqual(0);
    expect(postPullEnd, "fronteira de diff pós-pull não encontrada").toBeGreaterThan(postPullStart);
    const postPullSection = deploySection.slice(postPullStart, postPullEnd);

    expect(postPullSection).toMatch(/cfg\.stopCommand\s*!==\s*oldCfg\.stopCommand/);
    expect(postPullSection).toMatch(/cfg\.startCommand\s*!==\s*oldCfg\.startCommand/);
    expect(postPullSection).toMatch(/(?:failAfterStoppedDeploy|restoreStoppedDeployment)/);
  });

  it("AC-003: retry ancora Closes na issue da branch, não no número do PR", () => {
    const retrySection = sectionFrom(shipSource, "if (bodyFile && prUrl)", "let rollbackAlreadyAttempted");
    const mergeDecision = retrySection.match(/const mergePayload\s*=\s*([^;]+);/s);

    expect(mergeDecision, "decisão de merge do body-file não encontrada").not.toBeNull();
    expect(mergeDecision[1]).toMatch(/payloadHasCloseMarker/);
    expect(mergeDecision[1]).toMatch(/Closes\s+#\$\{n\}/);
    expect(mergeDecision[1]).not.toMatch(/prIssue|Number\s*\(/);
  });
});