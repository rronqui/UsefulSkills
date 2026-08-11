// Costuras executáveis de integridade para release-please e Ship.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidSemVer } from "../ship/bin/lib.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const releaseConfig = JSON.parse(readFileSync(join(repoRoot, "release-please-config.json"), "utf8"));
const releaseManifest = JSON.parse(readFileSync(join(repoRoot, ".release-please-manifest.json"), "utf8"));
const shipConfig = JSON.parse(readFileSync(join(repoRoot, "ship.config.json"), "utf8"));
const releaseSkill = readFileSync(join(repoRoot, "release-bootstrap", "SKILL.md"), "utf8");
const shipSkill = readFileSync(join(repoRoot, "ship", "SKILL.md"), "utf8");

function packagePath(unit) {
  return unit === "." ? join(repoRoot, "package.json") : join(repoRoot, unit, "package.json");
}

function readPackage(unit) {
  const path = packagePath(unit);
  expect(existsSync(path), `package.json ausente para a unidade ${unit}`).toBe(true);
  return JSON.parse(readFileSync(path, "utf8"));
}

function hasQualifiedMonorepoTagPolicy(config, manifest, text) {
  const packages = config?.packages;
  const units = packages && typeof packages === "object" ? Object.keys(packages) : [];
  const manifestUnits = manifest && typeof manifest === "object" ? Object.keys(manifest) : [];
  const effectiveConfig = units.length > 1
    && units.every((unit) => {
      const entry = packages[unit];
      return entry
        && entry["release-type"] === "node"
        && entry["include-component-in-tag"] === true
        && isValidSemVer(entry["initial-version"]);
    })
    && manifestUnits.sort().join("\n") === units.slice().sort().join("\n");
  const monorepo = /(?:em qualquer|for any)\s+(?:monorepo|multi[- ]package|mais de uma unidade|multiple units)[\s\S]{0,180}include-component-in-tag\s*[:=]\s*true/i;
  return effectiveConfig && monorepo.test(text);
}

describe("release/ship integrity contract", () => {
  it("AC-018: SemVer estrito rejeita leading zeros em todas as posições", () => {
    for (const invalid of ["01.2.3", "1.02.3", "1.2.03", "1.2.3-01"]) {
      expect(isValidSemVer(invalid), `${invalid} não é SemVer estrito`).toBe(false);
    }
    for (const valid of ["0.0.0", "0.3.2", "1.2.3-rc.1+build.7"]) {
      expect(isValidSemVer(valid), `${valid} deve ser aceito como SemVer`).toBe(true);
    }
  });

  it("AC-018: manifesto e release-please usam a mesma fonte SemVer por unidade", () => {
    const packages = releaseConfig.packages;
    expect(packages && typeof packages).toBe("object");
    const units = Object.keys(packages);
    expect(units.length).toBeGreaterThan(0);
    expect(Object.keys(releaseManifest).sort()).toEqual([...units].sort());
    expect(releaseConfig["release-as"], "release-as raiz não pode congelar todas as unidades").toBeUndefined();

    for (const unit of units) {
      const config = packages[unit];
      const packageJson = readPackage(unit);
      expect(config["release-type"], `${unit} deve ser uma unidade Node`).toBe("node");
      expect(config["release-as"], `${unit} não pode congelar release-as`).toBeUndefined();
      expect(isValidSemVer(config["initial-version"]), `${unit} initial-version inválida`).toBe(true);
      expect(isValidSemVer(packageJson.version), `${unit} package.version inválida`).toBe(true);
      expect(isValidSemVer(releaseManifest[unit]), `${unit} manifest version inválida`).toBe(true);
      expect(releaseManifest[unit], `${unit} manifest/package divergentes`).toBe(packageJson.version);
      expect(config["include-component-in-tag"], `${unit} single-package deve manter tag simples`).toBe(units.length > 1);
    }
  });

  it("AC-018: fixture de monorepo valida a configuração efetiva e exige tags qualificadas", () => {
    const monorepoFixture = {
      packages: {
        "packages/core": {
          "release-type": "node",
          "initial-version": "1.0.0",
          "include-component-in-tag": true,
        },
        "packages/cli": {
          "release-type": "node",
          "initial-version": "1.0.0",
          "include-component-in-tag": true,
        },
      },
    };
    const fixtureManifest = {
      "packages/core": "1.0.0",
      "packages/cli": "1.0.0",
    };
    const policyText = `${releaseSkill}\n${shipSkill}`;

    expect(Object.keys(monorepoFixture.packages)).toHaveLength(2);
    expect(hasQualifiedMonorepoTagPolicy(monorepoFixture, fixtureManifest, policyText)).toBe(true);

    const collapsedFixture = {
      ...monorepoFixture,
      packages: {
        ...monorepoFixture.packages,
        "packages/cli": {
          ...monorepoFixture.packages["packages/cli"],
          "include-component-in-tag": false,
        },
      },
    };
    expect(hasQualifiedMonorepoTagPolicy(collapsedFixture, fixtureManifest, policyText)).toBe(false);
    expect(hasQualifiedMonorepoTagPolicy(
      releaseConfig,
      releaseManifest,
      policyText,
    )).toBe(Object.keys(releaseConfig.packages).length > 1);
  });

  it("AC-018: versionCheckUrl não pode mascarar unidades fora da raiz", () => {
    const units = Object.keys(releaseConfig.packages);
    if (units.length > 1) expect(shipConfig.versionCheckUrl).toBeNull();
    expect(shipSkill).toMatch(/versionCheckUrl/);
    expect(shipSkill).toMatch(/(?:multi[- ]package|monorepo)[\s\S]{0,220}(?:desabilit|disabled|null|raiz)/i);
  });
});
