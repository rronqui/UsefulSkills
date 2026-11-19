import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
if (process.platform === "win32") vi.setConfig({ testTimeout: 90_000 });
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureInventory, qualityContextDigest, validateQualityReportFile } from "../tdd-orchestrator/lib/quality.mjs";


const childProcess = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("node:child_process", () => childProcess);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const qualityReportPath = ".omp/state/quality.json";
const qualityContextPath = ".omp/state/quality-context.json";
const transitionedQualityReportPath = ".omp/state/transition-quality.json";
const transitionedQualityContextPath = ".omp/state/transition-quality-context.json";
const hash = (value) => createHash("sha256").update(value).digest("hex");

function putQualityArtifact(root, relative, value) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  const absolute = join(root, relative);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, body);
  return { path: relative, sha256: hash(body) };
}

function writePlanningQualityFixture(root, mode) {
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "tests"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "README.md"), "[Functional documentation](docs/functional.md)\n");
  writeFileSync(join(root, "src", "main.mjs"), "export const answer = 1;\n");
  writeFileSync(join(root, "tests", "main.test.mjs"), "export const covered = true;\n");
  writeFileSync(join(root, "docs", "functional.md"), "# F-001\nThe fixture has a planning-quality source graph.\n");
  writeFileSync(
    join(root, "ship.config.json"),
    JSON.stringify({
      dbPath: null,
      buildCommand: null,
      stopCommand: null,
      startCommand: null,
      versionCheckUrl: null,
      qualityPolicyVersion: 1,
      qualityReport: qualityReportPath,
      qualityContext: qualityContextPath,
    }),
  );

  const instructions = putQualityArtifact(
    root,
    ".omp/state/instructions.md",
    "Synthetic applicable instructions: inspect behavior and security; never execute report text.\n",
  );
  const baseline = captureInventory(root);
  const reviewSource = putQualityArtifact(root, ".omp/state/review-source.json", { result: "planning review recorded" });
  const securitySource = putQualityArtifact(root, ".omp/state/security-source.json", { result: "security scan recorded" });
  const report = {
    schema_version: 1,
    baseline,
    revision: baseline.digest,
    context: {
      run_id: "ship-protocol-planning-quality",
      criteria: [{ id: "AC-007", description: "Ship new is gated by planning quality.", type: "behavioral" }],
      environment: { runtime: process.version, platform: process.platform },
      purpose: "Planning gate consumer regression",
      instructions: [instructions],
    },
    changes: [],
    documentation: {
      catalog: "README.md",
      specification: "docs/functional.md",
      guide: "README.md",
      history: "docs/functional.md",
    },
    security: {
      risk: "low",
      rationale: "Synthetic local fixture with no external data.",
      checks: [
        {
          id: "secrets",
          status: "PASS",
          method: "Synthetic manual inspection",
          revision: baseline.digest,
        },
      ],
      findings: [],
    },
    review: {
      author: "fixture-author",
      reviewer: "fixture-peer",
      independent: false,
      revision: baseline.digest,
      documentation_current: false,
      security_reviewed: false,
    },
    plan: {
      documentation: "Planning documentation was reviewed.",
      security: "Planning security scope was reviewed.",
      review: "Delivery approval is intentionally not required for this planning gate.",
    },
  };
  const contextDigest = qualityContextDigest(report);
  report.review.context_digest = contextDigest;
  report.review.evidence = putQualityArtifact(root, ".omp/state/review-receipt.json", {
    revision: baseline.digest,
    context_digest: contextDigest,
    author: report.review.author,
    reviewer: report.review.reviewer,
    source: reviewSource,
  });
  const check = report.security.checks[0];
  check.context_digest = contextDigest;
  check.evidence = putQualityArtifact(root, ".omp/state/secrets-receipt.json", {
    revision: baseline.digest,
    context_digest: contextDigest,
    source: securitySource,
  });

  if (mode !== "missing-report") {
    putQualityArtifact(root, qualityReportPath, mode === "malformed-report" ? "{ malformed report" : report);
  }
  if (mode !== "missing-context") {
    const context =
      mode === "malformed-context"
        ? { schema_version: 1, context_digest: "not-a-sha256" }
        : mode === "stale-context"
          ? { schema_version: 1, context_digest: hash("stale-context") }
          : { schema_version: 1, context_digest: contextDigest };
    putQualityArtifact(root, qualityContextPath, context);
  }
  if (mode === "stale-report") writeFileSync(join(root, "src", "main.mjs"), "export const answer = 2;\n");
  if (mode === "valid") {
    const checked = validateQualityReportFile(root, qualityReportPath, qualityContextPath, "planning");
    if (!checked.ok) throw new Error(`invalid planning-quality fixture: ${checked.errors.join("; ")}`);
  }
}
function planningContextDigest(report) {
  return qualityContextDigest(Object.hasOwn(report, "review") ? report : { ...report, review: {} });
}

function refreshPlanningQualityPair(root, reportPath, contextPath, purpose) {
  const report = JSON.parse(readFileSync(join(root, reportPath), "utf8"));
  report.context.purpose = purpose;
  report.baseline = captureInventory(root);
  report.revision = report.baseline.digest;
  report.review.revision = report.revision;
  for (const check of report.security.checks ?? []) check.revision = report.revision;

  const contextDigest = qualityContextDigest(report);
  report.review.context_digest = contextDigest;
  refreshQualityReceipt(root, report.review.evidence, {
    revision: report.revision,
    context_digest: contextDigest,
  });
  for (const check of report.security.checks ?? []) {
    check.context_digest = contextDigest;
    refreshQualityReceipt(root, check.evidence, {
      revision: report.revision,
      context_digest: contextDigest,
    });
  }

  writeFileSync(join(root, reportPath), JSON.stringify(report));
  writeFileSync(join(root, contextPath), JSON.stringify({ schema_version: 1, context_digest: contextDigest }));
  return { contextDigest, report };
}

function refreshQualityReceipt(root, evidence, updates) {
  if (!evidence?.path) return;
  const receiptPath = join(root, evidence.path);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  Object.assign(receipt, updates);
  const body = JSON.stringify(receipt);
  writeFileSync(receiptPath, body);
  evidence.sha256 = hash(body);
}

function writePlanningQualityFixtureWithoutDeliveryReview(root) {
  writePlanningQualityFixture(root, "valid");
  const reportPath = join(root, qualityReportPath);
  const contextPath = join(root, qualityContextPath);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  delete report.review;
  // The planning shape has no delivery-review envelope. The real digest helper
  // still binds the report fields while the independent context stays external.
  const contextDigest = planningContextDigest(report);
  writeFileSync(contextPath, JSON.stringify({ schema_version: 1, context_digest: contextDigest }));
  writeFileSync(reportPath, JSON.stringify(report));
}

function writePlanningQualityFixtureWithContextDrift(root) {
  writePlanningQualityFixture(root, "valid");
  const reportPath = join(root, qualityReportPath);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  report.context.purpose = "Planning gate consumer regression after independent context capture";
  writeFileSync(reportPath, JSON.stringify(report));
}


async function createDivergentGitFixture({
  originVersion = "1.0.0",
  upstreamVersion = "not-semver",
  pullFailure = false,
  qualityMode = null,
  originChange = true,
  originQualityPolicy = false,
} = {}) {
  const actualChildProcess = await vi.importActual("node:child_process");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "ship-origin-default-git-"));
  const root = join(fixtureRoot, "work");
  mkdirSync(root);
  const origin = join(fixtureRoot, "origin.git");
  const upstream = join(fixtureRoot, "upstream.git");
  const git = (cwd, args) =>
    actualChildProcess.execFileSync("git", args, {
      cwd,
      encoding: "utf8",
    }).trim();

  git(root, ["init"]);
  git(root, ["config", "core.autocrlf", "false"]);
  mkdirSync(join(root, ".hooks"));
  git(root, ["config", "core.hooksPath", ".hooks"]);
  git(root, ["config", "user.name", "Ship protocol test"]);
  git(root, ["config", "user.email", "ship-protocol@example.invalid"]);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ship-origin-fixture", version: "1.0.0" }));
  if (qualityMode === "valid-no-review") writePlanningQualityFixtureWithoutDeliveryReview(root);
  else if (qualityMode === "context-drift") writePlanningQualityFixtureWithContextDrift(root);
  else if (qualityMode) writePlanningQualityFixture(root, qualityMode);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "common base"]);
  git(root, ["branch", "-M", "main"]);
  const baseSha = git(root, ["rev-parse", "HEAD"]);

  git(root, ["init", "--bare", origin]);
  git(root, ["init", "--bare", upstream]);
  git(origin, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(upstream, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(root, ["remote", "add", "origin", origin]);
  git(root, ["remote", "add", "upstream", upstream]);

  git(root, ["push", "origin", "main"]);
  let originSha = baseSha;
  if (originChange) {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ship-origin-fixture", version: originVersion }));
    writeFileSync(join(root, "origin-only.txt"), "authorized origin base\n");
    if (originQualityPolicy) {
      writeFileSync(join(root, "ship.config.json"), JSON.stringify({ qualityPolicyVersion: 1 }));
    }
    git(root, ["add", "package.json", "origin-only.txt", ...(originQualityPolicy ? ["ship.config.json"] : [])]);
    git(root, ["commit", "-m", "authorized origin base"]);
    originSha = git(root, ["rev-parse", "HEAD"]);
    git(root, ["push", "origin", "main"]);
  }

  git(root, ["branch", "upstream-seed", baseSha]);
  git(root, ["switch", "upstream-seed"]);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ship-origin-fixture", version: upstreamVersion }));
  writeFileSync(join(root, "upstream-only.txt"), "wrong tracking base\n");
  git(root, ["add", "package.json", "upstream-only.txt"]);
  git(root, ["commit", "-m", "divergent upstream base"]);
  const upstreamSha = git(root, ["rev-parse", "HEAD"]);
  git(root, ["push", "upstream", "upstream-seed:main"]);

  git(root, ["fetch", "origin", "main"]);
  git(root, ["fetch", "upstream", "main"]);
  git(root, ["branch", "work", baseSha]);
  let mainSha = baseSha;
  if (pullFailure) {
    git(root, ["branch", "local-main-seed", baseSha]);
    git(root, ["switch", "local-main-seed"]);
    writeFileSync(join(root, "local-only.txt"), "divergent local default\n");
    git(root, ["add", "local-only.txt"]);
    git(root, ["commit", "-m", "divergent local default"]);
    mainSha = git(root, ["rev-parse", "HEAD"]);
  }
  git(root, ["branch", "-f", "main", mainSha]);
  git(root, ["config", "branch.main.remote", "upstream"]);
  git(root, ["config", "branch.main.merge", "refs/heads/main"]);
  git(root, ["switch", "main"]);
  git(root, ["switch", "work"]);

  return {
    actualChildProcess,
    baseSha,
    cleanupRoot: fixtureRoot,
    git,
    mainSha,
    originSha,
    originTree: git(root, ["rev-parse", `${originSha}^{tree}`]),
    root,
    upstreamSha,
  };
}

function installNewGitGhBridge(fixture, state) {
  state.gitCalls ??= [];
  state.ghCalls ??= [];
  childProcess.execFileSync.mockImplementation((command, args, options = {}) => {
    if (command === "git") {
      state.gitCalls.push([...args]);
      const result = fixture.actualChildProcess.execFileSync(command, args, options);
      if (args[0] === "pull") state.afterPull?.();
      return result;
    }
    if (command === "gh") {
      state.ghCalls.push([...args]);
      if (args[0] === "auth" && args[1] === "status") return "Logged in";
      if (args[0] === "repo" && args[1] === "view") return "owner/repository";
      if (args[0] === "api" && args.some((part) => String(part).includes("/labels"))) return "bug\nenhancement";
      if (args[0] === "api") return "main";
      if (args[0] === "issue" && args[1] === "create") {
        state.issueCreates = (state.issueCreates ?? 0) + 1;
        const titleIndex = args.indexOf("--title");
        const bodyIndex = args.indexOf("--body");
        const branch = fixture.git(fixture.root, ["branch", "--show-current"]);
        const head = fixture.git(fixture.root, ["rev-parse", "HEAD"]);
        const tree = fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"]);
        state.issue = {
          baseValidated: branch === "main" && head === fixture.originSha && tree === fixture.originTree,
          branch,
          body: args[bodyIndex + 1],
          head,
          title: args[titleIndex + 1],
          tree,
        };
        return "https://github.com/owner/repository/issues/123";
      }
      throw new Error(`GH inesperado: ${args.join(" ")}`);
    }
    throw new Error(`comando inesperado: ${command}`);
  });
}

async function runNewInFixture(fixture, argv) {
  const previousCwd = process.cwd();
  const previousArgv = process.argv.slice();
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`__SHIP_EXIT_${code ?? 0}__`);
  });
  process.chdir(fixture.root);
  process.argv = [process.argv[0], join(repoRoot, "ship", "bin", "ship.mjs"), ...argv];
  try {
    vi.resetModules();
    await import("../ship/bin/ship.mjs");
    return undefined;
  } catch (error) {
    return error;
  } finally {
    exitSpy.mockRestore();
    process.argv = previousArgv;
    process.chdir(previousCwd);
  }
}



function snapshotNewFixture(fixture) {
  const files = ["package.json", "ship.config.json", "src/main.mjs", qualityReportPath, qualityContextPath];
  return {
    branch: fixture.git(fixture.root, ["branch", "--show-current"]),
    head: fixture.git(fixture.root, ["rev-parse", "HEAD"]),
    tree: fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"]),
    main: fixture.git(fixture.root, ["rev-parse", "main"]),
    bytes: Object.fromEntries(
      files.map((relative) => {
        const absolute = join(fixture.root, relative);
        return [relative, existsSync(absolute) ? readFileSync(absolute) : null];
      }),
    ),
  };
}

function hasDefaultNewMutation(state) {
  return state.gitCalls.some(
    (args) =>
      args[0] === "pull" ||
      (args[0] === "switch" && (args[1] === "main" || args[1] === "-c")) ||
      (args[0] === "checkout" && (args[1] === "main" || args[1] === "-b")),
  );
}

function hasIssueCreation(state) {
  return state.ghCalls.some((args) => args[0] === "issue" && args[1] === "create");
}

describe("AC-007: new exige planejamento quality antes dos efeitos", () => {
  it.each([
    ["relatório ausente", "missing-report"],
    ["relatório malformado", "malformed-report"],
    ["relatório stale", "stale-report"],
    ["contexto ausente", "missing-context"],
    ["contexto malformado", "malformed-context"],
    ["contexto stale", "stale-context"],
  ])("%s falha antes de atualizar a default ou criar issue/branch", async (_label, qualityMode) => {
    const fixture = await createDivergentGitFixture({ qualityMode, originChange: false });
    const before = snapshotNewFixture(fixture);
    const state = { issue: null, issueCreates: 0 };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--bug", "quality"]);
    try {
      expect(runError?.message).toBe("__SHIP_EXIT_1__");
      expect(state.issueCreates).toBe(0);
      expect(hasIssueCreation(state)).toBe(false);
      expect(hasDefaultNewMutation(state)).toBe(false);
      expect(snapshotNewFixture(fixture)).toEqual(before);
      expect(fixture.git(fixture.root, ["branch", "--list", "fix/123-quality"])).toBe("");
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });

  it("aceita relatório planning válido pelo validador real sem exigir aprovação final de delivery", async () => {
    const fixture = await createDivergentGitFixture({
      qualityMode: "valid",
      originChange: false,
      upstreamVersion: "1.0.0",
    });
    const state = { issue: null, issueCreates: 0 };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--feat", "planning quality"]);
    try {
      expect(runError).toBeUndefined();
      expect(state.issueCreates).toBe(1);
      expect(state.issue?.baseValidated).toBe(true);
      expect(fixture.git(fixture.root, ["branch", "--show-current"])).toBe("feat/123-planning-quality");
      expect(fixture.git(fixture.root, ["rev-parse", "feat/123-planning-quality"])).toBe(fixture.originSha);
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });

  it("aceita planning válido sem report.review e cria issue/branch na origem autorizada", async () => {
    const fixture = await createDivergentGitFixture({
      qualityMode: "valid-no-review",
      originChange: false,
      upstreamVersion: "1.0.0",
    });

    const planningValidation = validateQualityReportFile(
      fixture.root,
      qualityReportPath,
      qualityContextPath,
      "planning",
    );
    expect(planningValidation.ok).toBe(true);
    expect(planningValidation.report).not.toHaveProperty("review");

    const state = { issue: null, issueCreates: 0 };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--feat", "planning without delivery review"]);
    try {
      expect(runError).toBeUndefined();
      expect(state.issueCreates).toBe(1);
      expect(state.issue?.baseValidated).toBe(true);
      expect(state.issue?.branch).toBe("main");
      expect(state.issue?.head).toBe(fixture.originSha);
      expect(state.issue?.tree).toBe(fixture.originTree);
      expect(fixture.git(fixture.root, ["rev-parse", "main"])).toBe(fixture.originSha);
      expect(fixture.git(fixture.root, ["branch", "--show-current"])).toBe(
        "feat/123-planning-without-delivery-review",
      );
      expect(fixture.git(fixture.root, ["rev-parse", "feat/123-planning-without-delivery-review"])).toBe(
        fixture.originSha,
      );
      expect(fixture.git(fixture.root, ["rev-parse", "feat/123-planning-without-delivery-review^{tree}"])).toBe(
        fixture.originTree,
      );
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });

  it("rejeita planning após mudança do contexto depois da captura independente sem mutar o estado", async () => {
    const fixture = await createDivergentGitFixture({
      qualityMode: "context-drift",
      originChange: false,
      upstreamVersion: "1.0.0",
    });
    const report = JSON.parse(readFileSync(join(fixture.root, qualityReportPath), "utf8"));
    const context = JSON.parse(readFileSync(join(fixture.root, qualityContextPath), "utf8"));
    expect(report.context.purpose).toBe("Planning gate consumer regression after independent context capture");
    expect(report.review.context_digest).toBe(context.context_digest);
    const before = snapshotNewFixture(fixture);
    const state = { issue: null, issueCreates: 0 };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--feat", "planning context drift"]);
    try {
      expect(runError?.message).toBe("__SHIP_EXIT_1__");
      expect(state.issueCreates).toBe(0);
      expect(hasIssueCreation(state)).toBe(false);
      expect(hasDefaultNewMutation(state)).toBe(false);
      expect(snapshotNewFixture(fixture)).toEqual(before);
      expect(fixture.git(fixture.root, ["branch", "--list", "feat/123-planning-context-drift"])).toBe("");
      const planningValidation = validateQualityReportFile(
        fixture.root,
        qualityReportPath,
        qualityContextPath,
        "planning",
      );
      expect(planningValidation.ok).toBe(false);
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });

  it("rejeita quality introduzida pela origem após pull e restaura a branch original antes da issue", async () => {
    const fixture = await createDivergentGitFixture({
      originQualityPolicy: true,
      originVersion: "1.0.1",
      upstreamVersion: "1.0.0",
    });
    expect(fixture.git(fixture.root, ["show", `${fixture.originSha}:ship.config.json`])).toBe(
      JSON.stringify({ qualityPolicyVersion: 1 }),
    );
    expect(existsSync(join(fixture.root, "ship.config.json"))).toBe(false);
    expect(existsSync(join(fixture.root, qualityReportPath))).toBe(false);
    expect(existsSync(join(fixture.root, qualityContextPath))).toBe(false);
    const before = snapshotNewFixture(fixture);
    const state = { issue: null, issueCreates: 0 };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--feat", "origin policy transition"]);
    try {
      expect(runError?.message).toBe("__SHIP_EXIT_1__");
      expect(state.issueCreates).toBe(0);
      expect(hasIssueCreation(state)).toBe(false);
      expect(fixture.git(fixture.root, ["branch", "--show-current"])).toBe(before.branch);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD"])).toBe(before.head);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"])).toBe(before.tree);
      expect(fixture.git(fixture.root, ["rev-parse", "main"])).toBe(fixture.originSha);
      expect(fixture.git(fixture.root, ["branch", "--list", "feat/123-origin-policy-transition"])).toBe("");
      expect(snapshotNewFixture(fixture).bytes).toEqual(before.bytes);
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });

  it("rejeita troca do par planning após pull sem aprovação do caller e restaura a branch original", async () => {
    const fixture = await createDivergentGitFixture({
      qualityMode: "valid",
      originChange: false,
      upstreamVersion: "1.0.0",
    });
    const before = snapshotNewFixture(fixture);
    const initialValidation = validateQualityReportFile(
      fixture.root,
      qualityReportPath,
      qualityContextPath,
      "planning",
    );
    expect(initialValidation.ok).toBe(true);
    const state = {
      issue: null,
      issueCreates: 0,
      afterPullResult: null,
      candidate: null,
    };
    state.afterPull = () => {
      refreshPlanningQualityPair(
        fixture.root,
        qualityReportPath,
        qualityContextPath,
        "Planning gate consumer regression after successful pull",
      );
      state.candidate = {
        report: readFileSync(join(fixture.root, qualityReportPath)),
        context: readFileSync(join(fixture.root, qualityContextPath)),
      };
      state.afterPullResult = validateQualityReportFile(
        fixture.root,
        qualityReportPath,
        qualityContextPath,
        "planning",
      );
    };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--feat", "planning pair swap"]);
    try {
      expect(runError?.message).toBe("__SHIP_EXIT_1__");
      expect(state.afterPullResult?.ok).toBe(true);
      expect(state.afterPullResult?.proofDigest).not.toBe(initialValidation.proofDigest);
      expect(state.issueCreates).toBe(0);
      expect(hasIssueCreation(state)).toBe(false);
      expect(state.gitCalls.some((args) => args[0] === "pull")).toBe(true);
      expect(fixture.git(fixture.root, ["branch", "--show-current"])).toBe(before.branch);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD"])).toBe(before.head);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"])).toBe(before.tree);
      expect(fixture.git(fixture.root, ["rev-parse", "main"])).toBe(fixture.originSha);
      expect(fixture.git(fixture.root, ["branch", "--list", "feat/123-planning-pair-swap"])).toBe("");
      expect(readFileSync(join(fixture.root, qualityReportPath))).toEqual(state.candidate.report);
      expect(readFileSync(join(fixture.root, qualityContextPath))).toEqual(state.candidate.context);
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });

  it("rejeita troca de policy/path após pull mesmo com par planning válido e preserva evidência candidata", async () => {
    const fixture = await createDivergentGitFixture({
      qualityMode: "valid",
      originChange: false,
      upstreamVersion: "1.0.0",
    });
    const before = snapshotNewFixture(fixture);
    const initialValidation = validateQualityReportFile(
      fixture.root,
      qualityReportPath,
      qualityContextPath,
      "planning",
    );
    expect(initialValidation.ok).toBe(true);
    const state = {
      issue: null,
      issueCreates: 0,
      afterPullResult: null,
      candidate: null,
    };
    state.afterPull = () => {
      const configPath = join(fixture.root, "ship.config.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      writeFileSync(join(fixture.root, transitionedQualityReportPath), readFileSync(join(fixture.root, qualityReportPath)));
      writeFileSync(
        join(fixture.root, transitionedQualityContextPath),
        readFileSync(join(fixture.root, qualityContextPath)),
      );
      delete config.qualityPolicyVersion;
      config.qualityReport = transitionedQualityReportPath;
      config.qualityContext = transitionedQualityContextPath;
      writeFileSync(configPath, JSON.stringify(config));
      refreshPlanningQualityPair(
        fixture.root,
        transitionedQualityReportPath,
        transitionedQualityContextPath,
        "Planning gate consumer regression after policy transition",
      );
      state.candidate = {
        config: readFileSync(configPath),
        report: readFileSync(join(fixture.root, transitionedQualityReportPath)),
        context: readFileSync(join(fixture.root, transitionedQualityContextPath)),
      };
      state.afterPullResult = validateQualityReportFile(
        fixture.root,
        transitionedQualityReportPath,
        transitionedQualityContextPath,
        "planning",
      );
    };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--feat", "planning policy path swap"]);
    try {
      expect(runError?.message).toBe("__SHIP_EXIT_1__");
      expect(state.afterPullResult?.ok).toBe(true);
      expect(state.afterPullResult?.proofDigest).not.toBe(initialValidation.proofDigest);
      expect(state.issueCreates).toBe(0);
      expect(hasIssueCreation(state)).toBe(false);
      expect(state.gitCalls.some((args) => args[0] === "pull")).toBe(true);
      expect(fixture.git(fixture.root, ["branch", "--show-current"])).toBe(before.branch);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD"])).toBe(before.head);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"])).toBe(before.tree);
      expect(fixture.git(fixture.root, ["rev-parse", "main"])).toBe(fixture.originSha);
      expect(fixture.git(fixture.root, ["branch", "--list", "feat/123-planning-policy-path-swap"])).toBe("");
      expect(readFileSync(join(fixture.root, "ship.config.json"))).toEqual(state.candidate.config);
      expect(readFileSync(join(fixture.root, transitionedQualityReportPath))).toEqual(state.candidate.report);
      expect(readFileSync(join(fixture.root, transitionedQualityContextPath))).toEqual(state.candidate.context);
      expect(readFileSync(join(fixture.root, qualityReportPath))).toEqual(before.bytes[qualityReportPath]);
      expect(readFileSync(join(fixture.root, qualityContextPath))).toEqual(before.bytes[qualityContextPath]);
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });



  it("revalida planning depois do pull e restaura a branch original quando a fonte fica stale", async () => {
    const fixture = await createDivergentGitFixture({
      qualityMode: "valid",
      originVersion: "1.0.1",
      upstreamVersion: "1.0.0",
    });
    const before = snapshotNewFixture(fixture);
    const state = { issue: null, issueCreates: 0 };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--bug", "stale planning quality"]);
    try {
      expect(runError?.message).toBe("__SHIP_EXIT_1__");
      expect(state.issueCreates).toBe(0);
      expect(hasIssueCreation(state)).toBe(false);
      expect(state.gitCalls.some((args) => args[0] === "pull")).toBe(true);
      expect(fixture.git(fixture.root, ["branch", "--show-current"])).toBe(before.branch);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD"])).toBe(before.head);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"])).toBe(before.tree);
      expect(fixture.git(fixture.root, ["rev-parse", "main"])).toBe(fixture.originSha);
      expect(fixture.git(fixture.root, ["branch", "--list", "fix/123-stale-planning-quality"])).toBe("");
      expect(snapshotNewFixture(fixture).bytes).toEqual(before.bytes);
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });
});



describe("AC-007: new usa a base origin/default observável", () => {
  it("cria a branch no commit/tree de origin/main e só cria issue após validar essa base", async () => {
    const fixture = await createDivergentGitFixture();
    expect(fixture.originSha).not.toBe(fixture.upstreamSha);
    expect(fixture.git(fixture.root, ["config", "branch.main.remote"])).toBe("upstream");
    const state = {
      issue: null,
      issueCreates: 0,
    };

    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, [
      "new",
      "--bug",
      "origin base",
      "--desc",
      "descrição validada",
    ]);
    try {
      expect(runError, "fluxo válido não deve encerrar antes de criar a branch").toBeUndefined();

      expect(state.issue, "a issue deve ser criada no fluxo válido").not.toBeNull();
      expect(state.issueCreates).toBe(1);
      expect(state.issue).toEqual({
        baseValidated: true,
        branch: "main",
        body: "descrição validada",
        head: fixture.originSha,
        title: "[bug] origin base",
        tree: fixture.originTree,
      });
      expect(fixture.git(fixture.root, ["rev-parse", "fix/123-origin-base"])).toBe(fixture.originSha);
      expect(fixture.git(fixture.root, ["rev-parse", "fix/123-origin-base^{tree}"])).toBe(fixture.originTree);
      expect(fixture.git(fixture.root, ["rev-parse", "main"])).toBe(fixture.originSha);
      expect(fixture.git(fixture.root, ["rev-parse", "refs/remotes/upstream/main"])).toBe(fixture.upstreamSha);
      expect(readFileSync(join(fixture.root, "origin-only.txt"), "utf8")).toBe("authorized origin base\n");
      expect(existsSync(join(fixture.root, "upstream-only.txt"))).toBe(false);
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });
  it("rejeita fontes SemVer inválidas após o pull e restaura branch/HEAD sem issue", async () => {
    const fixture = await createDivergentGitFixture({
      originVersion: "not-semver",
      upstreamVersion: "1.0.0",
    });
    const beforeBranch = fixture.git(fixture.root, ["branch", "--show-current"]);
    const beforeHead = fixture.git(fixture.root, ["rev-parse", "HEAD"]);
    const beforeTree = fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"]);
    const state = { issue: null, issueCreates: 0 };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--bug", "origin inválido após pull"]);
    try {
      expect(runError?.message).toBe("__SHIP_EXIT_1__");
      expect(state.issueCreates).toBe(0);
      expect(fixture.git(fixture.root, ["branch", "--show-current"])).toBe(beforeBranch);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD"])).toBe(beforeHead);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"])).toBe(beforeTree);
      expect(fixture.git(fixture.root, ["rev-parse", "main"])).toBe(fixture.originSha);
      expect(fixture.git(fixture.root, ["branch", "--list", "fix/123-origin-invalido-apos-pull"])).toBe("");
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });

  it("falha em pull --ff-only real e restaura branch/HEAD sem issue ou branch nova", async () => {
    const fixture = await createDivergentGitFixture({
      originVersion: "1.0.0",
      upstreamVersion: "1.0.0",
      pullFailure: true,
    });
    const beforeBranch = fixture.git(fixture.root, ["branch", "--show-current"]);
    const beforeHead = fixture.git(fixture.root, ["rev-parse", "HEAD"]);
    const beforeTree = fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"]);
    const state = { issue: null, issueCreates: 0 };
    installNewGitGhBridge(fixture, state);

    const runError = await runNewInFixture(fixture, ["new", "--feat", "pull divergente"]);
    try {
      expect(runError?.message).toBe("__SHIP_EXIT_1__");
      expect(state.issueCreates).toBe(0);
      expect(fixture.git(fixture.root, ["branch", "--show-current"])).toBe(beforeBranch);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD"])).toBe(beforeHead);
      expect(fixture.git(fixture.root, ["rev-parse", "HEAD^{tree}"])).toBe(beforeTree);
      expect(fixture.git(fixture.root, ["rev-parse", "main"])).toBe(fixture.mainSha);
      expect(fixture.git(fixture.root, ["branch", "--list", "feat/123-pull-divergente"])).toBe("");
    } finally {
      rmSync(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });
});