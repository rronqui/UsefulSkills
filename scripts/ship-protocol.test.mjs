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
