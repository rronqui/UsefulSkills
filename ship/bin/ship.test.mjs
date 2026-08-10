import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const childProcess = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("node:child_process", () => childProcess);

const originalArgv = process.argv.slice();

async function runRetry({ bodyFile, description }) {
  process.argv = [process.argv[0], "ship/bin/ship.mjs", "ship", description, "--body-file", bodyFile];
  vi.resetModules();
  await import("./ship.mjs");
}
async function runShip(argv) {
  process.argv = [process.argv[0], "ship/bin/ship.mjs", ...argv];
  vi.resetModules();
  return import("./ship.mjs");
}

function trapProcessExit() {
  return vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`__SHIP_EXIT_${code ?? 0}__`);
  });
}

function configureDefaultGitGh({ status = "", branch = "main", ahead = "0" } = {}) {
  const calls = [];
  childProcess.execFileSync.mockImplementation((command, args) => {
    calls.push({ kind: "exec", command, args: [...args] });
    if (command === "git") {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
      if (args[0] === "status" && args[1] === "--porcelain") return status;
      if (args[0] === "branch" && args[1] === "--show-current") return branch;
      if (args[0] === "rev-list" && args[1] === "--count" && args[2] === "origin/main..HEAD") return ahead;
      if (args[0] === "rev-list" && args[1] === "--count") return "1";
      if (args[0] === "rev-parse" && args[1] === "HEAD") return "head";
      if (args[0] === "rev-parse" && args[1] === "--verify") return "head";
      if (args[0] === "diff" && args[1] === "--name-only") return "";
      return "";
    }
    if (command === "gh") {
      if (args[0] === "repo" && args[1] === "view") return "owner/repository";
      if (args[0] === "api") return "main";
      return "";
    }
    return "";
  });
  childProcess.spawnSync.mockImplementation((command, args) => {
    calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
    return { status: 0 };
  });
  return calls;
}

afterEach(() => {
  process.argv = originalArgv;
  vi.clearAllMocks();
});

describe("retry de ship com --body-file vazio ou branco", () => {
  it.each([
    ["arquivo vazio", ""],
    ["arquivo somente whitespace", "  \n\t  "],
  ])("não edita nem acrescenta separadores ao repetir o retry (%s)", async (_label, bodyFileContent) => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-body-file-"));
    const bodyFile = join(tempRoot, "body.md");
    writeFileSync(bodyFile, bodyFileContent);

    const repositoryRoot = process.cwd();
    const initialBody = "Corpo existente do PR";
    let existingBody = initialBody;
    const editCalls = [];

    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse") return repositoryRoot;
        if (args[0] === "branch") return "fix/22-retry-body-file";
        if (args[0] === "rev-list") return "1";
        return "";
      }

      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "https://github.com/owner/repository/pull/42";
        if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ body: existingBody });
        if (args[0] === "pr" && args[1] === "edit") {
          const bodyIndex = args.indexOf("--body");
          editCalls.push({ args, body: args[bodyIndex + 1] });
          existingBody = args[bodyIndex + 1];
        }
        return "";
      }

      return "";
    });

    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));

    try {
      const retry = { bodyFile, description: "retry do PR existente" };
      await runRetry(retry);
      await runRetry(retry);

      expect.soft(editCalls, "retry com payload vazio não deve chamar gh pr edit").toHaveLength(0);
      expect.soft(existingBody, "retry repetido deve preservar exatamente o corpo").toBe(initialBody);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
  it("preserva whitespace semântico do body-file ao editar PR existente", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-body-file-"));
    const bodyFile = join(tempRoot, "body.md");
    const bodyPayload = "  linha markdown  ";
    writeFileSync(bodyFile, bodyPayload);

    const repositoryRoot = process.cwd();
    const initialBody = "Corpo existente do PR";
    const editCalls = [];

    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse") return repositoryRoot;
        if (args[0] === "branch") return "fix/22-retry-body-file";
        if (args[0] === "rev-list") return "1";
        return "";
      }

      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "https://github.com/owner/repository/pull/42";
        if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ body: initialBody });
        if (args[0] === "pr" && args[1] === "edit") {
          const bodyIndex = args.indexOf("--body");
          editCalls.push({ args, body: args[bodyIndex + 1] });
        }
        return "";
      }

      return "";
    });

    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));

    try {
      await runRetry({ bodyFile, description: "retry do PR existente" });

      expect(editCalls).toHaveLength(1);
      expect(editCalls[0].body, "gh pr edit deve receber o body-file sem aparar whitespace").toBe(
        `${initialBody}\n\n${bodyPayload}`,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("T-001 guards e invariantes de release/deploy", () => {
  it("AC-001: deploy aborta árvore default suja antes de qualquer efeito", async () => {
    const calls = configureDefaultGitGh({ status: " M arquivo-local.txt" });
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(
        calls.some(
          ({ kind, command, args }) =>
            kind === "spawn" ||
            (kind === "exec" && command === "git" && ["fetch", "pull", "add", "commit", "push"].includes(args[0])),
        ),
      ).toBe(false);
      const diagnostic = errorSpy.mock.calls.flat().join("\n");
      expect(diagnostic).toMatch(/main/);
      expect(diagnostic).toMatch(/suja|limpa|commit|descarte/i);
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("AC-003: retry preserva corpo, breaking markers e exatamente um Closes #N", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-breaking-body-"));
    const bodyFile = join(tempRoot, "evidence.md");
    const appendedEvidence = [
      "Closes #42",
      "",
      "BREAKING CHANGE: migração obrigatória",
      "",
      "Evidência da revisão final",
    ].join("\n");
    writeFileSync(bodyFile, appendedEvidence);

    const initialBody = [
      "Closes #42",
      "",
      "feat!: altera o contrato público",
      "",
      "BREAKING CHANGE: migração obrigatória",
      "",
      "Evidência já publicada",
    ].join("\n");
    let existingBody = initialBody;
    const editCalls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
        if (args[0] === "branch" && args[1] === "--show-current") return "feat/42-preserva-breaking";
        if (args[0] === "rev-list") return "1";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "https://github.com/owner/repository/pull/42";
        if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ body: existingBody });
        if (args[0] === "pr" && args[1] === "edit") {
          const bodyIndex = args.indexOf("--body");
          editCalls.push(args[bodyIndex + 1]);
          existingBody = args[bodyIndex + 1];
        }
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));

    try {
      await runRetry({ bodyFile, description: "preservar markers" });
      await runRetry({ bodyFile, description: "preservar markers" });

      expect(editCalls).toHaveLength(1);
      expect(existingBody).toContain("feat!:");
      expect(existingBody).toContain("Evidência já publicada");
      expect(existingBody).toContain("Evidência da revisão final");
      expect(existingBody.match(/Closes #42/g)).toHaveLength(1);
      expect(existingBody.match(/BREAKING CHANGE:/g)).toHaveLength(1);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
  it("AC-003: retry de PR sem Closes insere um marcador canônico e preserva whitespace do corpo/payload", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-missing-closes-"));
    const bodyFile = join(tempRoot, "evidence.md");
    const bodyPayload = "Closes #42\n\n  Evidência final  ";
    writeFileSync(bodyFile, bodyPayload);

    const initialBody = "  Corpo já publicado  \n";
    let existingBody = initialBody;
    const editCalls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse") return process.cwd();
        if (args[0] === "branch") return "fix/42-missing-closes";
        if (args[0] === "rev-list") return "1";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "https://github.com/owner/repository/pull/42";
        if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ body: existingBody });
        if (args[0] === "pr" && args[1] === "edit") {
          const bodyIndex = args.indexOf("--body");
          editCalls.push(args[bodyIndex + 1]);
          existingBody = args[bodyIndex + 1];
        }
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));

    try {
      await runRetry({ bodyFile, description: "inserir Closes no retry" });

      expect(editCalls).toHaveLength(1);
      expect(existingBody.split("\n").filter((line) => line === "Closes #42")).toHaveLength(1);
      expect(existingBody).toContain(initialBody);
      expect(existingBody).toContain("  Evidência final  ");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-003: retry com apenas markers já publicados não acrescenta separadores", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-marker-only-"));
    const bodyFile = join(tempRoot, "evidence.md");
    writeFileSync(bodyFile, "Closes #42\n\nBREAKING CHANGE: migração obrigatória\n");

    const initialBody = [
      "Closes #42",
      "",
      "feat!: altera o contrato público",
      "",
      "BREAKING CHANGE: migração obrigatória",
      "",
      "Evidência já publicada",
    ].join("\n");
    let existingBody = initialBody;
    const editCalls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse") return process.cwd();
        if (args[0] === "branch") return "fix/42-marker-only";
        if (args[0] === "rev-list") return "1";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "https://github.com/owner/repository/pull/42";
        if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ body: existingBody });
        if (args[0] === "pr" && args[1] === "edit") {
          const bodyIndex = args.indexOf("--body");
          editCalls.push(args[bodyIndex + 1]);
          existingBody = args[bodyIndex + 1];
        }
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));

    try {
      await runRetry({ bodyFile, description: "não duplicar markers" });

      expect(editCalls).toHaveLength(0);
      expect(existingBody).toBe(initialBody);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });


  it("AC-004: dbPath sem estratégia de quiescência falha antes do snapshot e do pull/build/restart", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-no-quiescence-"));
    const dbPath = join(tempRoot, "app.db");
    const backupDir = join(tempRoot, "backup");
    writeFileSync(dbPath, "live database");
    const config = {
      dbPath,
      backupDir,
      buildCommand: "build-server",
      stopCommand: null,
      startCommand: "start-server",
      versionCheckUrl: null,
    };
    const actualFs = await vi.importActual("node:fs");
    vi.doMock("node:fs", () => ({
      ...actualFs,
      existsSync(file, ...rest) {
        return String(file).endsWith("ship.config.json") || actualFs.existsSync(file, ...rest);
      },
      readFileSync(file, ...rest) {
        return String(file).endsWith("ship.config.json")
          ? JSON.stringify(config)
          : actualFs.readFileSync(file, ...rest);
      },
    }));
    const calls = configureDefaultGitGh();
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(actualFs.existsSync(backupDir)).toBe(false);
      expect(
        calls.some(
          ({ kind, command, args }) =>
            kind === "spawn" ||
            (kind === "exec" && command === "git" && args[0] === "pull"),
        ),
      ).toBe(false);
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/snapshot|quiesc|stopCommand/i);
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
      vi.doUnmock("node:fs");
      vi.resetModules();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-004: stopCommand bem-sucedido prova quiescência antes do snapshot e do pull", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-quiescence-"));
    const dbPath = join(tempRoot, "app.db");
    const backupDir = join(tempRoot, "backup");
    writeFileSync(dbPath, "before pull");
    const config = {
      dbPath,
      backupDir,
      buildCommand: "build-server",
      stopCommand: "stop-server",
      startCommand: "start-server",
      versionCheckUrl: null,
    };
    const actualFs = await vi.importActual("node:fs");
    vi.doMock("node:fs", () => ({
      ...actualFs,
      existsSync(file, ...rest) {
        return String(file).endsWith("ship.config.json") || actualFs.existsSync(file, ...rest);
      },
      readFileSync(file, ...rest) {
        return String(file).endsWith("ship.config.json")
          ? JSON.stringify(config)
          : actualFs.readFileSync(file, ...rest);
      },
    }));
    const calls = configureDefaultGitGh();

    try {
      await runShip(["deploy"]);

      const stopIndex = calls.findIndex(({ kind, command }) => kind === "spawn" && command === "stop-server");
      const pullIndex = calls.findIndex(
        ({ kind, command, args }) => kind === "exec" && command === "git" && args[0] === "pull",
      );
      const buildIndex = calls.findIndex(({ kind, command }) => kind === "spawn" && command === "build-server");
      const startIndex = calls.findIndex(({ kind, command }) => kind === "spawn" && command === "start-server");
      expect(stopIndex).toBeGreaterThanOrEqual(0);
      expect(stopIndex).toBeLessThan(pullIndex);
      expect(buildIndex).toBeGreaterThan(pullIndex);
      expect(startIndex).toBeGreaterThan(buildIndex);

      const snapshots = actualFs.readdirSync(backupDir);
      expect(snapshots).toHaveLength(1);
      expect(actualFs.readFileSync(join(backupDir, snapshots[0]), "utf8")).toBe("before pull");
      writeFileSync(dbPath, "after pull");
      expect(actualFs.readFileSync(join(backupDir, snapshots[0]), "utf8")).toBe("before pull");
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
  it("AC-004: deploy executa stopCommand antes de pull/build/start mesmo sem dbPath e só avisa no não zero", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-stop-without-db-"));
    writeFileSync(
      join(tempRoot, "ship.config.json"),
      JSON.stringify({
        dbPath: null,
        buildCommand: "build-server",
        stopCommand: "stop-server",
        startCommand: "start-server",
        versionCheckUrl: null,
      }),
    );

    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "branch" && args[1] === "--show-current") return "main";
        if (args[0] === "rev-list") return "0";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "head";
        if (args[0] === "diff" && args[1] === "--name-only") return "";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      return { status: command === "stop-server" ? 1 : 0 };
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await runShip(["deploy"]);

      const stopIndex = calls.findIndex(({ kind, command }) => kind === "spawn" && command === "stop-server");
      const pullIndex = calls.findIndex(
        ({ kind, command, args }) => kind === "exec" && command === "git" && args[0] === "pull",
      );
      const buildIndex = calls.findIndex(({ kind, command }) => kind === "spawn" && command === "build-server");
      const startIndex = calls.findIndex(({ kind, command }) => kind === "spawn" && command === "start-server");
      expect(stopIndex).toBeGreaterThanOrEqual(0);
      expect(stopIndex).toBeLessThan(pullIndex);
      expect(buildIndex).toBeGreaterThan(pullIndex);
      expect(startIndex).toBeGreaterThan(buildIndex);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
  it.each([
    ["package version ausente", { name: "@fixture/widget" }],
    ["package version inválida", { name: "@fixture/widget", version: "not-semver" }],
  ])("AC-029: ship bloqueia fonte de versão multi-package inválida (%s) antes de push/PR", async (_label, packageJson) => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-invalid-version-source-"));
    const packageRoot = join(tempRoot, "packages", "widget");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture-root", version: "0.3.0" }));
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify(packageJson));
    writeFileSync(
      join(tempRoot, "release-please-config.json"),
      JSON.stringify({
        packages: {
          ".": {
            "release-type": "node",
            "initial-version": "0.1.0",
          },
          "packages/widget": {
            "release-type": "node",
            "initial-version": "0.1.0",
          },
        },
      }),
    );
    writeFileSync(
      join(tempRoot, ".release-please-manifest.json"),
      JSON.stringify({ ".": "0.3.0", "packages/widget": "1.2.3" }),
    );
    writeFileSync(
      join(tempRoot, "ship.config.json"),
      JSON.stringify({
        dbPath: null,
        buildCommand: null,
        stopCommand: null,
        startCommand: null,
        versionCheckUrl: "http://localhost:3000/version",
      }),
    );

    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
        if (args[0] === "branch" && args[1] === "--show-current") return "feat/42-invalid-version";
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "remote" && args[1] === "get-url") return "https://github.com/owner/repository.git";
        if (args[0] === "rev-list") return "1";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "auth" && args[1] === "status") return "Logged in";
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api" && args.some((part) => String(part).includes("labels"))) return "bug\nenhancement";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "";
        if (args[0] === "pr" && args[1] === "create") return "https://github.com/owner/repository/pull/42";
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      return { status: 0 };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(runShip(["ship", "versão de package inválida"])).rejects.toThrow("__SHIP_EXIT_1__");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/E_VERSION_SOURCE/);
      expect(
        calls.some(
          ({ kind, command, args }) =>
            kind === "exec" && command === "git" && args[0] === "push",
        ),
      ).toBe(false);
      expect(
        calls.some(
          ({ kind, command, args }) =>
            kind === "exec" && command === "gh" && args[0] === "pr" && args[1] === "create",
        ),
      ).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });



  it("AC-005: gh não autenticado bloqueia ship new antes de atualizar default ou criar issue", async () => {
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ command, args: [...args] });
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
      if (command === "git" && args[0] === "status") return "";
      if (command === "git" && args[0] === "branch") return "feat/30-current";
      if (command === "gh" && args[0] === "auth") throw new Error("not logged in");
      if (command === "gh" && args[0] === "repo") return "owner/repository";
      if (command === "gh" && args[0] === "api") return "main";
      if (command === "gh" && args[0] === "issue" && args[1] === "create") return "https://github.com/owner/repository/issues/77";
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(runShip(["new", "--feat", "preflight auth"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/gh|auth|autentic/i);
      expect(calls.some(({ command, args }) => command === "gh" && args[0] === "issue" && args[1] === "create")).toBe(false);
      expect(calls.some(({ command, args }) => command === "git" && ["switch", "pull"].includes(args[0]))).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("AC-005: remote de push indisponível bloqueia ship new antes de efeitos remotos", async () => {
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ command, args: [...args] });
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
      if (command === "git" && args[0] === "status") return "";
      if (command === "git" && args[0] === "branch") return "feat/30-current";
      if (command === "git" && args[0] === "remote") throw new Error("no push remote");
      if (command === "gh" && args[0] === "auth") return "Logged in";
      if (command === "gh" && args[0] === "repo") return "owner/repository";
      if (command === "gh" && args[0] === "api") return "main";
      if (command === "gh" && args[0] === "issue" && args[1] === "create") return "https://github.com/owner/repository/issues/78";
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(runShip(["new", "--bug", "preflight remote"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/remote|remoto/i);
      expect(calls.some(({ command, args }) => command === "gh" && args[0] === "issue" && args[1] === "create")).toBe(false);
      expect(calls.some(({ command, args }) => command === "git" && ["switch", "pull"].includes(args[0]))).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("AC-005: label exigida ausente bloqueia ship new sem criar issue ou branch parcial", async () => {
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ command, args: [...args] });
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
      if (command === "git" && args[0] === "status") return "";
      if (command === "git" && args[0] === "branch") return "feat/30-current";
      if (command === "git" && args[0] === "remote") return "https://github.com/owner/repository.git";
      if (command === "gh" && args[0] === "auth") return "Logged in";
      if (command === "gh" && args[0] === "repo") return "owner/repository";
      if (command === "gh" && args[0] === "api" && args.some((part) => String(part).includes("labels"))) return "other";
      if (command === "gh" && args[0] === "api") return "main";
      if (command === "gh" && args[0] === "label") return "other";
      if (command === "gh" && args[0] === "issue" && args[1] === "create") return "https://github.com/owner/repository/issues/79";
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(runShip(["new", "--feat", "preflight labels"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/label|etiqueta/i);
      expect(calls.some(({ command, args }) => command === "gh" && args[0] === "issue" && args[1] === "create")).toBe(false);
      expect(calls.some(({ command, args }) => command === "git" && ["switch", "pull"].includes(args[0]))).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("AC-005: preflight completo permite ship new somente após auth, remote e labels", async () => {
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ command, args: [...args] });
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
      if (command === "git" && args[0] === "status") return "";
      if (command === "git" && args[0] === "branch") return "feat/30-current";
      if (command === "git" && args[0] === "remote") return "https://github.com/owner/repository.git";
      if (command === "gh" && args[0] === "auth") return "Logged in";
      if (command === "gh" && args[0] === "repo") return "owner/repository";
      if (command === "gh" && args[0] === "api" && args.some((part) => String(part).includes("labels"))) return "bug\nenhancement";
      if (command === "gh" && args[0] === "api") return "main";
      if (command === "gh" && args[0] === "label") return "bug\nenhancement";
      if (command === "gh" && args[0] === "issue" && args[1] === "create") return "https://github.com/owner/repository/issues/80";
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));

    await runShip(["new", "--bug", "preflight completo"]);

    const authIndex = calls.findIndex(({ command, args }) => command === "gh" && args[0] === "auth");
    const remoteIndex = calls.findIndex(({ command, args }) => command === "git" && args[0] === "remote");
    const labelsIndex = calls.findIndex(
      ({ command, args }) => command === "gh" && (args[0] === "label" || args.some((part) => String(part).includes("labels"))),
    );
    const issueIndex = calls.findIndex(({ command, args }) => command === "gh" && args[0] === "issue" && args[1] === "create");
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(remoteIndex).toBeGreaterThan(authIndex);
    expect(labelsIndex).toBeGreaterThan(remoteIndex);
    expect(issueIndex).toBeGreaterThan(labelsIndex);
  });

  it("AC-005: ship valida remote antes de adicionar, commitar, publicar ou criar PR", async () => {
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
      if (command === "git" && args[0] === "branch" && args[1] === "--show-current") return "feat/42-remote";
      if (command === "git" && args[0] === "status") return "";
      if (command === "git" && args[0] === "remote") throw new Error("no push remote");
      if (command === "git" && args[0] === "push") throw new Error("push failed");
      if (command === "gh" && args[0] === "auth") return "Logged in";
      if (command === "gh" && args[0] === "repo") return "owner/repository";
      if (command === "gh" && args[0] === "api") return "main";
      return "";
    });
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      return { status: command === "git" ? 1 : 0 };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(runShip(["ship", "preflight remote"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/remote|remoto/i);
      expect(
        calls.some(
          ({ kind, command, args }) =>
            kind === "exec" &&
            command === "git" &&
            ["add", "commit", "push"].includes(args[0]),
        ),
      ).toBe(false);
      expect(calls.some(({ kind, command, args }) => kind === "exec" && command === "gh" && args[0] === "pr" && args[1] === "create")).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
