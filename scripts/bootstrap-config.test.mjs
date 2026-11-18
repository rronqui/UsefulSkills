// Public runtime compatibility contract for the checked-in release tooling.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const packageLock = JSON.parse(readFileSync(join(repoRoot, "package-lock.json"), "utf8"));

// These are the tools that determine the runtime accepted by the pinned test
// runner. Their ranges come from the lockfile, not from a copied expectation.
const pinnedToolPackages = [
  "node_modules/vitest",
  "node_modules/vite",
  "node_modules/rolldown",
];

function runtimeConsumers() {
  return [
    { name: "package", range: packageJson.engines?.node },
    ...pinnedToolPackages.map((path) => ({
      name: path,
      range: packageLock.packages?.[path]?.engines?.node,
    })),
  ];
}

const runtimeBoundaries = [
  { version: "20.0.0", supported: false },
  { version: "20.18.0", supported: false },
  { version: "20.19.0", supported: true },
  { version: "21.0.0", supported: false },
  { version: "22.11.0", supported: false },
  { version: "22.12.0", supported: true },
  { version: "23.0.0", supported: false },
  { version: "24.0.0", supported: true },
];

describe("AC-015 runtime compatibility", () => {
  it("package and pinned tool consumers agree at the supported Node boundaries", () => {
    const consumers = runtimeConsumers();
    for (const consumer of consumers) {
      expect(consumer.range, `${consumer.name} must publish a Node engine`).toEqual(expect.any(String));
    }
    if (consumers.some(({ range }) => typeof range !== "string")) return;

    for (const { version, supported } of runtimeBoundaries) {
      const accepts = consumers.map((consumer) => semver.satisfies(version, consumer.range));
      const packageAccepts = accepts[0];
      const toolsAccept = accepts.slice(1).every(Boolean);
      const effectiveAccept = accepts.every(Boolean);

      expect(packageAccepts, `package engine at Node ${version}`).toBe(supported);
      expect(toolsAccept, `locked tooling at Node ${version}`).toBe(supported);
      expect(effectiveAccept, `effective consumer intersection at Node ${version}`).toBe(supported);
    }
  });

  it("the real running Node is accepted by the package and every pinned tool", () => {
    const runningVersion = semver.valid(process.versions.node);
    expect(runningVersion, "the test process must expose a valid Node version").not.toBeNull();
    if (!runningVersion) return;

    for (const consumer of runtimeConsumers()) {
      expect(
        semver.satisfies(runningVersion, consumer.range),
        `${consumer.name} must accept running Node ${runningVersion}`,
      ).toBe(true);
    }
  });
});