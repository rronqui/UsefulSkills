// Behavioral checks for the release metadata consumed by release-please and Ship.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { isValidSemVer } from "../ship/bin/lib.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const releaseConfig = JSON.parse(readFileSync(join(repoRoot, "release-please-config.json"), "utf8"));
const releaseManifest = JSON.parse(readFileSync(join(repoRoot, ".release-please-manifest.json"), "utf8"));

function packagePath(unit) {
  return unit === "." ? join(repoRoot, "package.json") : join(repoRoot, unit, "package.json");
}

describe("AC-015 release metadata", () => {
  it("release-please, the manifest, and each package expose one aligned SemVer source", () => {
    const packages = releaseConfig?.packages;
    expect(packages && typeof packages).toBe("object");

    const units = Object.keys(packages);
    expect(units.length).toBeGreaterThan(0);
    expect(Object.keys(releaseManifest).toSorted()).toEqual(units.toSorted());
    expect(releaseConfig["release-as"]).toBeUndefined();

    for (const unit of units) {
      const config = packages[unit];
      const packagePathname = packagePath(unit);

      expect(existsSync(packagePathname), `package.json ausente para ${unit}`).toBe(true);
      const packageJson = JSON.parse(readFileSync(packagePathname, "utf8"));

      expect(config["release-type"], `${unit} deve ser uma unidade Node`).toBe("node");
      expect(config["release-as"], `${unit} não pode congelar release-as`).toBeUndefined();
      expect(config["include-component-in-tag"], `${unit} tag policy`).toBe(units.length > 1);
      const initialVersionValid = isValidSemVer(config["initial-version"]);
      const manifestVersionValid = isValidSemVer(releaseManifest[unit]);
      expect(initialVersionValid, `${unit} initial-version inválida`).toBe(true);
      expect(manifestVersionValid, `${unit} manifest version inválida`).toBe(true);
      if (initialVersionValid && manifestVersionValid) {
        expect(
          semver.gte(releaseManifest[unit], config["initial-version"]),
          `${unit} manifest não pode regredir abaixo do initial-version`,
        ).toBe(true);
      }
      expect(packageJson.version, `${unit} manifest/package divergentes`).toBe(releaseManifest[unit]);
      expect(isValidSemVer(packageJson.version), `${unit} package version inválida`).toBe(true);
    }
  });
});
