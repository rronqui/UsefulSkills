import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
async function mockShipConfig(config, root = process.cwd(), { afterPullConfig = null } = {}) {
  const actualFs = await vi.importActual("node:fs");
  const configPath = join(root, "ship.config.json");
  let configReads = 0;
  vi.doMock("node:fs", () => ({
    ...actualFs,
    existsSync(file, ...rest) {
      return String(file) === configPath || actualFs.existsSync(file, ...rest);
    },
    readFileSync(file, ...rest) {
      if (String(file) === configPath) {
        configReads += 1;
        return JSON.stringify(afterPullConfig && configReads > 1 ? afterPullConfig : config);
      }
      return actualFs.readFileSync(file, ...rest);
    },
  }));
}

function unmockShipFs() {
  vi.doUnmock("node:fs");
  vi.resetModules();
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
      expect(editCalls[0].body, "gh pr edit deve preservar whitespace e inserir o fechamento canônico da issue da branch").toBe(
        `Closes #22\n\n${initialBody}\n\n${bodyPayload}`,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("RED: retry e publicação observáveis", () => {
  it("AC-003: retry body-only atualiza PR existente sem commit local", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-body-only-"));
    const bodyFile = join(tempRoot, "evidence.md");
    writeFileSync(bodyFile, "Evidência body-only");
    const calls = [];
    const editCalls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
        if (args[0] === "branch" && args[1] === "--show-current") return "fix/42-body-only";
        if (args[0] === "rev-list" && args[1] === "--count" && args[2] === "HEAD" && args[3] === "--not") return "0";
        if (args[0] === "rev-list" && args[1] === "--count") return "0";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "https://github.com/owner/repository/pull/42";
        if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ body: "Corpo já publicado" });
        if (args[0] === "pr" && args[1] === "edit") {
          const bodyIndex = args.indexOf("--body");
          editCalls.push(args[bodyIndex + 1]);
        }
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      return { status: 0 };
    });
    const exitSpy = trapProcessExit();

    try {
      await expect(runRetry({ bodyFile, description: "retry body-only" })).resolves.toBeUndefined();

      expect(editCalls).toHaveLength(1);
      expect(editCalls[0]).toContain("Corpo já publicado");
      expect(editCalls[0]).toContain("Evidência body-only");
      expect(calls.some(({ kind, command, args }) => kind === "exec" && command === "git" && args[0] === "commit")).toBe(false);
    } finally {
      exitSpy.mockRestore();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-003: PR existente termina com exatamente um Closes #N canônico", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-close-canonical-"));
    const bodyFile = join(tempRoot, "evidence.md");
    writeFileSync(bodyFile, "Closes #42\n\nEvidência final");
    let existingBody = "Closes #7\n\nCorpo já publicado";
    const editCalls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse") return process.cwd();
        if (args[0] === "branch") return "fix/42-close-canonical";
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
          existingBody = args[bodyIndex + 1];
          editCalls.push(existingBody);
        }
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));

    try {
      await runRetry({ bodyFile, description: "canonicalizar Closes" });

      expect(editCalls).toHaveLength(1);
      const closes = editCalls[0]
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^Closes\s+#\d+$/i.test(line));
      expect(closes).toEqual(["Closes #42"]);
      expect(editCalls[0]).not.toMatch(/Closes #7/i);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
describe("RED: deploy fail-closed e rollback observável", () => {
  it("AC-001: deploy valida startCommand antes de parar o serviço", async () => {
    await mockShipConfig({
      dbPath: null,
      buildCommand: null,
      stopCommand: "stop-server",
      startCommand: "   ",
      versionCheckUrl: null,
    });
    const calls = configureDefaultGitGh();
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");

      expect(
        calls.some(({ kind, command }) => kind === "spawn" && command === "stop-server"),
        "startCommand inválido não pode deixar o serviço parado",
      ).toBe(false);
      expect(
        calls.some(({ kind, command, args }) => kind === "exec" && command === "git" && args[0] === "pull"),
      ).toBe(false);
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/startCommand/i);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
    }
  });

  it("AC-002: buildCommand=null produz evidência explícita de build NA", async () => {
    await mockShipConfig({
      dbPath: null,
      buildCommand: null,
      stopCommand: "stop-server",
      startCommand: "start-server",
      versionCheckUrl: null,
    });
    configureDefaultGitGh();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await runShip(["deploy"]);

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toMatch(/build\s*:\s*NA/i);
      expect(output).toMatch(/(?:reason|motivo)/i);
      expect(output).toMatch(/(?:evidence|evidência)/i);
    } finally {
      logSpy.mockRestore();
      unmockShipFs();
    }
  });

  it.each([
    ["versão servida ausente", "<html><body>serviço ativo</body></html>"],
    ["versão servida divergente", "<footer>Versão da aplicação v9.9.9</footer>"],
  ])("AC-002: versionCheckUrl rejeita resposta HTTP 2xx com %s", async (_label, html) => {
    await mockShipConfig({
      dbPath: null,
      buildCommand: null,
      stopCommand: "stop-server",
      startCommand: "start-server",
      versionCheckUrl: "https://example.test/version",
      versionCheckTimeoutMs: 1,
    });
    configureDefaultGitGh();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    });
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/vers[aã]o|version/i);
      expect(fetchSpy).toHaveBeenCalledWith("https://example.test/version", expect.any(Object));
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      fetchSpy.mockRestore();
      unmockShipFs();
    }
  });

  it("AC-002: exceção na leitura do diff após stop restaura revisão/configuração antigas", async () => {
    await mockShipConfig({
      dbPath: null,
      buildCommand: "old-build",
      stopCommand: "stop-server",
      startCommand: "old-start",
      versionCheckUrl: null,
    });
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "branch" && args[1] === "--show-current") return "main";
        if (args[0] === "rev-list" && args[1] === "--count") return "0";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "old-head";
        if (args[0] === "diff" && args[1] === "--name-only") throw new Error("diff interrupted");
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
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");

      expect(
        calls.some(
          ({ kind, command, args }) =>
            kind === "exec" && command === "git" && args[0] === "reset" && args[1] === "--hard" && args[2] === "old-head",
        ),
      ).toBe(true);
      expect(calls.some(({ kind, command }) => kind === "spawn" && command === "old-build")).toBe(true);
      expect(calls.some(({ kind, command }) => kind === "spawn" && command === "old-start")).toBe(true);
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/rollback/i);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
    }
  });
  it.each([
    ["backup", "backup retorna false"],
    ["build", "build lança exceção"],
    ["start", "start lança exceção"],
  ])("AC-002: %s após stop restaura oldHead/config e reporta rollback (%s)", async (kind) => {
    const oldConfig = {
      dbPath: kind === "backup" ? "data/app.db" : null,
      buildCommand: "old-build",
      stopCommand: "stop-server",
      startCommand: "old-start",
      versionCheckUrl: null,
    };
    const newConfig = {
      ...oldConfig,
      buildCommand: "new-build",
      startCommand: "new-start",
    };
    await mockShipConfig(oldConfig, process.cwd(), { afterPullConfig: newConfig });
    if (kind === "backup") {
      vi.doMock("./lib.mjs", async () => {
        const actualLib = await vi.importActual("./lib.mjs");
        return { ...actualLib, performBackup: vi.fn(() => false) };
      });
    }
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "branch" && args[1] === "--show-current") return "main";
        if (args[0] === "rev-list" && args[1] === "--count") return "0";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "old-head";
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
      if (kind === "build" && command === "new-build") throw new Error("build interrupted");
      if (kind === "start" && command === "new-start") throw new Error("start interrupted");
      return { status: 0 };
    });
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(
        calls.some(
          ({ kind: callKind, command, args }) =>
            callKind === "exec" && command === "git" && args[0] === "reset" && args[1] === "--hard" && args[2] === "old-head",
        ),
      ).toBe(true);
      expect(calls.filter(({ kind: callKind, command }) => callKind === "spawn" && command === "stop-server")).toHaveLength(1);
      expect(calls.filter(({ kind: callKind, command }) => callKind === "spawn" && command === "old-build")).toHaveLength(1);
      expect(calls.filter(({ kind: callKind, command }) => callKind === "spawn" && command === "old-start")).toHaveLength(1);
      expect(calls.filter(({ kind: callKind, command }) => callKind === "spawn" && command === "new-start")).toHaveLength(kind === "start" ? 1 : 0);
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/rollback/i);
      expect(
        calls.some(
          ({ kind: callKind, command, args }) => callKind === "exec" && command === "git" && args[0] === "pull",
        ),
        "falha após stop não deve deixar uma revisão nova parcialmente publicada",
      ).toBe(kind === "backup" ? false : true);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      vi.doUnmock("./lib.mjs");
      unmockShipFs();
    }
  });
});

describe("RED: preflight de versão, descrição, setup e observabilidade", () => {
  it("AC-003: descrição normalizada vazia é rejeitada antes de qualquer efeito", async () => {
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
        if (args[0] === "branch" && args[1] === "--show-current") return "feat/42-empty-description";
        if (args[0] === "status") return "";
        if (args[0] === "remote") return "https://github.com/owner/repository.git";
        if (args[0] === "rev-list") return "1";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "auth") return "Logged in";
        if (args[0] === "repo") return "owner/repository";
        if (args[0] === "api" && args.some((part) => String(part).includes("labels"))) return "enhancement";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "";
        if (args[0] === "pr" && args[1] === "create") return "https://github.com/owner/repository/pull/42";
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      return { status: command === "git" ? 1 : 0 };
    });
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["ship", "feat:   "])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/descri[cç][aã]o|vazia|empty/i);
      expect(
        calls.some(({ kind, command, args }) => kind === "exec" && command === "git" && ["add", "commit", "push"].includes(args[0])),
      ).toBe(false);
      expect(
        calls.some(({ kind, command, args }) => kind === "exec" && command === "gh" && args[0] === "pr" && args[1] === "create"),
      ).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("AC-001: PR create vazio é erro observável, não publicação bem-sucedida", async () => {
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
        if (args[0] === "branch" && args[1] === "--show-current") return "feat/42-empty-pr";
        if (args[0] === "status") return "";
        if (args[0] === "remote") return "https://github.com/owner/repository.git";
        if (args[0] === "rev-list") return "1";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "auth") return "Logged in";
        if (args[0] === "repo") return "owner/repository";
        if (args[0] === "api" && args.some((part) => String(part).includes("labels"))) return "enhancement";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "";
        if (args[0] === "pr" && args[1] === "create") return "";
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      return { status: command === "git" ? 1 : 0 };
    });
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["ship", "publicar PR observável"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/PR|URL|vazio|inv[aá]lido/i);
      expect(calls.some(({ kind, command, args }) => kind === "spawn" && command === "gh" && args[0] === "pr" && args[1] === "merge")).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("AC-002: setup cria separador antes de adicionar .omp/ ao .gitignore", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-setup-gitignore-"));
    writeFileSync(join(tempRoot, ".gitignore"), "node_modules/");
    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
      return "";
    });

    try {
      await runShip(["setup"]);
      expect(readFileSync(join(tempRoot, ".gitignore"), "utf8")).toBe("node_modules/\n.omp/\n");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-002: setup cria .gitignore quando o arquivo ainda não existe", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-setup-gitignore-missing-"));
    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
      return "";
    });

    try {
      await runShip(["setup"]);
      expect(() => readFileSync(join(tempRoot, ".gitignore"), "utf8")).not.toThrow();
      expect(readFileSync(join(tempRoot, ".gitignore"), "utf8")).toContain(".omp/\n");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-018: deploy bloqueia package SemVer inválido mesmo com a raiz válida", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-deploy-semver-unit-"));
    const packageRoot = join(tempRoot, "packages", "widget");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture-root", version: "0.3.2" }));
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@fixture/widget", version: "not-semver" }));
    writeFileSync(
      join(tempRoot, "release-please-config.json"),
      JSON.stringify({
        packages: {
          ".": { "release-type": "node", "initial-version": "0.1.0" },
          "packages/widget": { "release-type": "node", "initial-version": "0.1.0" },
        },
      }),
    );
    writeFileSync(join(tempRoot, ".release-please-manifest.json"), JSON.stringify({ ".": "0.3.2", "packages/widget": "1.2.3" }));
    writeFileSync(
      join(tempRoot, "ship.config.json"),
      JSON.stringify({ dbPath: null, buildCommand: null, stopCommand: "stop-server", startCommand: "start-server", versionCheckUrl: null }),
    );
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
        if (args[0] === "branch" && args[1] === "--show-current") return "main";
        if (args[0] === "status") return "";
        if (args[0] === "rev-list") return "0";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "old-head";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "repo") return "owner/repository";
        if (args[0] === "api") return "main";
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      return { status: 0 };
    });
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/E_VERSION_SOURCE|SemVer|vers[aã]o/i);
      expect(calls.some(({ kind, command }) => kind === "spawn" && command === "stop-server")).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-003: new rejeita release-as persistente em vez de congelar a fonte SemVer", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-new-release-as-"));
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture-root", version: "0.3.2" }));
    writeFileSync(
      join(tempRoot, "release-please-config.json"),
      JSON.stringify({ packages: { ".": { "release-type": "node", "initial-version": "0.1.0", "release-as": "2.0.0" } } }),
    );
    writeFileSync(join(tempRoot, ".release-please-manifest.json"), JSON.stringify({ ".": "0.3.2" }));
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
        if (args[0] === "branch" && args[1] === "--show-current") return "feat/current";
        if (args[0] === "status") return "";
        if (args[0] === "remote") return "https://github.com/owner/repository.git";
        if (args[0] === "rev-parse" && args[1] === "--verify") return "old-head";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "auth") return "Logged in";
        if (args[0] === "repo") return "owner/repository";
        if (args[0] === "api" && args.some((part) => String(part).includes("labels"))) return "enhancement";
        if (args[0] === "api") return "main";
        if (args[0] === "issue" && args[1] === "create") return "https://github.com/owner/repository/issues/42";
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      return { status: 0 };
    });
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["new", "--feat", "fonte semver"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/E_VERSION_SOURCE|release-as|fonte|vers[aã]o/i);
      expect(calls.some(({ kind, command, args }) => kind === "exec" && command === "gh" && args[0] === "issue" && args[1] === "create")).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
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
  it("AC-002: stopCommand não-zero sem dbPath bloqueia reset/start sem quiescência comprovada", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-stop-without-db-"));
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
    writeFileSync(
      join(tempRoot, "ship.config.json"),
      JSON.stringify({
        dbPath: null,
        buildCommand: "old-build",
        stopCommand: "stop-server",
        startCommand: "old-start",
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
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");

      const output = errorSpy.mock.calls.flat().join("\n");
      expect(output).toMatch(/stopCommand.*falhou|fail-closed/i);
      expect(calls.filter(({ kind, command }) => kind === "spawn" && command === "stop-server")).toHaveLength(2);
      expect(
        calls.some(
          ({ kind, command, args }) => kind === "exec" && command === "git" && args[0] === "pull",
        ),
      ).toBe(false);
      expect(calls.some(({ kind, command }) => kind === "spawn" && command === "new-build")).toBe(false);
      expect(calls.some(({ kind, command }) => kind === "spawn" && command === "start-server")).toBe(false);
      expect(calls.some(({ kind, command }) => kind === "spawn" && command === "old-build")).toBe(false);
      expect(calls.some(({ kind, command }) => kind === "spawn" && command === "old-start")).toBe(false);
      expect(
        calls.some(
          ({ kind, command, args }) => kind === "exec" && command === "git" && args[0] === "reset" && args[1] === "--hard" && args[2] === "head",
        ),
      ).toBe(false);
      expect(output).toMatch(/quiescência|rollback/i);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
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
describe("RED_REVISION: regressões de preflight e readiness", () => {
  it("AC-003: body-file com Closes de outra issue falha antes de commit ou push", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-invalid-close-"));
    const bodyFile = join(tempRoot, "evidence.md");
    writeFileSync(bodyFile, "Closes #999\n\nEvidência para a issue #42");
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
        if (args[0] === "branch" && args[1] === "--show-current") return "fix/42-invalid-close";
        if (args[0] === "remote" && args[1] === "get-url") return "https://github.com/owner/repository.git";
        if (args[0] === "rev-list") return "0";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "auth") return "Logged in";
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api" && args.some((part) => String(part).includes("/labels"))) return "bug\nenhancement";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "";
        if (args[0] === "pr" && args[1] === "create") return "https://github.com/owner/repository/pull/42";
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      if (command === "git" && Array.isArray(args) && args[0] === "diff") return { status: 1 };
      return { status: 0 };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(
        runShip(["ship", "publicar evidência", "--body-file", bodyFile]),
      ).rejects.toThrow("__SHIP_EXIT_1__");

      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/Closes|issue/i);
      expect(
        calls.some(
          ({ kind, command, args }) =>
            kind === "exec" && command === "git" && ["commit", "push"].includes(args[0]),
        ),
        "um marker Closes de outra issue deve ser rejeitado antes dos efeitos locais/remotos",
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

  it("AC-002: stop interrompido sem quiescência comprovada bloqueia rollback e start antigo", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-stop-partial-"));
    const dataDir = join(tempRoot, "data");
    const dbPath = join(dataDir, "app.db");
    const stoppedMarker = join(tempRoot, "stopped.marker");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture", version: "1.2.3" }));
    writeFileSync(dbPath, "live database");
    await mockShipConfig(
      {
        dbPath: "data/app.db",
        backupDir: "data/backup",
        buildCommand: "old-build",
        stopCommand: "stop-partial",
        startCommand: "old-start",
        versionCheckUrl: null,
      },
      tempRoot,
    );

    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "branch" && args[1] === "--show-current") return "main";
        if (args[0] === "rev-list") return "0";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "old-head";
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
      if (command === "stop-partial") {
        writeFileSync(stoppedMarker, "stopped");
        return { status: 1 };
      }
      return { status: 0 };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");

      expect(readFileSync(stoppedMarker, "utf8")).toBe("stopped");
      expect(calls.filter(({ kind, command }) => kind === "spawn" && command === "old-start")).toHaveLength(0);
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/quiescência|rollback/i);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-018: versionCheckUnit desconhecida é rejeitada antes de stop", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-unknown-version-unit-"));
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture", version: "1.2.3" }));
    await mockShipConfig(
      {
        dbPath: null,
        buildCommand: null,
        stopCommand: "stop-server",
        startCommand: "start-server",
        versionCheckUrl: "https://example.test/version",
        versionCheckUnit: "packages/missing",
      },
      tempRoot,
    );

    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "branch" && args[1] === "--show-current") return "main";
        if (args[0] === "rev-list") return "0";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "old-head";
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
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");

      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/versionCheckUnit|unidade/i);
      expect(
        calls.some(({ kind, command }) => kind === "spawn" && command === "stop-server"),
        "unidade desconhecida deve falhar antes de qualquer tentativa de parar o serviço",
      ).toBe(false);
      expect(calls.some(({ kind, command, args }) => kind === "exec" && command === "git" && args[0] === "pull")).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      fetchSpy.mockRestore();
      unmockShipFs();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-018: fontes SemVer são revalidadas depois do pull e antes do build novo", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-semver-after-pull-"));
    const packagePath = join(tempRoot, "package.json");
    writeFileSync(packagePath, JSON.stringify({ name: "fixture", version: "1.2.3" }));
    const beforePullConfig = {
      dbPath: null,
      buildCommand: "old-build",
      stopCommand: "stop-server",
      startCommand: "old-start",
      versionCheckUrl: null,
    };
    const afterPullConfig = {
      ...beforePullConfig,
      buildCommand: "new-build",
      startCommand: "new-start",
    };
    await mockShipConfig(beforePullConfig, tempRoot, { afterPullConfig });

    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "branch" && args[1] === "--show-current") return "main";
        if (args[0] === "rev-list") return "0";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "old-head";
        if (args[0] === "pull") {
          writeFileSync(packagePath, JSON.stringify({ name: "fixture", version: "not-semver" }));
          return "";
        }
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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");

      expect(calls.some(({ kind, command, args }) => kind === "exec" && command === "git" && args[0] === "pull")).toBe(true);
      expect(
        calls.some(({ kind, command }) => kind === "spawn" && command === "new-build"),
        "build novo não pode começar com fonte SemVer inválida após pull",
      ).toBe(false);
      expect(
        calls.some(({ kind, command }) => kind === "spawn" && command === "new-start"),
        "start novo não pode começar com fonte SemVer inválida após pull",
      ).toBe(false);
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/E_VERSION_SOURCE|SemVer|vers[aã]o/i);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-002: schemaWatchPaths:null mantém o deploy válido e usa o default legado", async () => {
    await mockShipConfig({
      dbPath: null,
      buildCommand: null,
      stopCommand: null,
      startCommand: null,
      versionCheckUrl: null,
      schemaWatchPaths: null,
    });
    configureDefaultGitGh();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = trapProcessExit();

    try {
      await expect(runShip(["deploy"])).resolves.toBeDefined();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
    }
  });

  it("AC-001: --bug e --feat juntos são rejeitados sem criar issue ou branch", async () => {
    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "remote" && args[1] === "get-url") return "https://github.com/owner/repository.git";
        if (args[0] === "branch" && args[1] === "--show-current") return "feat/99-existing";
        if (args[0] === "rev-parse" && args[1] === "--verify") return "head";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "auth") return "Logged in";
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api" && args.some((part) => String(part).includes("/labels"))) return "bug\nenhancement";
        if (args[0] === "api") return "main";
        if (args[0] === "issue" && args[1] === "create") return "https://github.com/owner/repository/issues/99";
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
      await expect(
        runShip(["new", "--bug", "corrigir falha", "--feat", "adicionar recurso"]),
      ).rejects.toThrow("__SHIP_EXIT_1__");

      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/--bug|--feat|mutuamente|simultaneamente|ambos/i);
      expect(
        calls.some(({ kind, command, args }) => kind === "exec" && command === "gh" && args[0] === "issue" && args[1] === "create"),
      ).toBe(false);
      expect(
        calls.some(
          ({ kind, command, args }) =>
            kind === "exec" && command === "git" && (args[0] === "switch" || args[0] === "pull"),
        ),
      ).toBe(false);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("AC-002: readiness retry aguarda uma janela razoável para o serviço ficar disponível", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-readiness-retry-"));
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture", version: "1.2.3" }));
    await mockShipConfig(
      {
        dbPath: null,
        buildCommand: null,
        stopCommand: null,
        startCommand: "start-server",
        versionCheckUrl: "https://example.test/version",
        versionCheckTimeoutMs: 1_000,
      },
      tempRoot,
    );

    const calls = [];
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return tempRoot;
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "branch" && args[1] === "--show-current") return "main";
        if (args[0] === "rev-list") return "0";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "old-head";
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
    const exitSpy = trapProcessExit();

    vi.useFakeTimers();
    const startedAt = Date.now();
    let firstFetchStarted;
    const firstFetch = new Promise((resolve) => {
      firstFetchStarted = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      firstFetchStarted?.();
      firstFetchStarted = null;
      if (Date.now() - startedAt < 300) {
        return { status: 503, body: { cancel: vi.fn() } };
      }
      return {
        status: 200,
        text: async () => "<p>Versão da aplicação v1.2.3</p>",
      };
    });

    let deploymentResult;
    let deploymentError;
    try {
      const deployment = runShip(["deploy"]).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await firstFetch;
      await vi.advanceTimersByTimeAsync(2_500);
      const outcome = await deployment;
      deploymentResult = outcome.value;
      deploymentError = outcome.error;
      expect(deploymentError, "readiness deve aguardar o serviço em vez de abandonar após 200ms").toBeUndefined();
      expect(deploymentResult).toBeDefined();
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    } finally {
      fetchSpy.mockRestore();
      vi.useRealTimers();
      exitSpy.mockRestore();
      unmockShipFs();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
describe("RED_REVISION: gaps adicionais de retry, deploy e readiness", () => {
  function installDeployMocks(root, calls, spawnResult = () => ({ status: 0 })) {
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return root;
        if (args[0] === "status" && args[1] === "--porcelain") return "";
        if (args[0] === "branch" && args[1] === "--show-current") return "main";
        if (args[0] === "rev-list" && args[1] === "--count" && args[2] === "origin/main..HEAD") return "0";
        if (args[0] === "rev-list" && args[1] === "--count") return "0";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "old-head";
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
      return spawnResult(command, args);
    });
  }

  it("AC-003: retry body-only acrescenta exatamente um Closes #42 ao corpo publicado", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-body-only-close-"));
    const bodyFile = join(tempRoot, "evidence.md");
    writeFileSync(bodyFile, "Evidência body-only sem marcador");
    const editBodies = [];

    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
        if (args[0] === "branch" && args[1] === "--show-current") return "fix/42-body-only-close";
        if (args[0] === "rev-list") return "0";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "https://github.com/owner/repository/pull/42";
        if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ body: "Corpo já publicado sem marcador" });
        if (args[0] === "pr" && args[1] === "edit") {
          const bodyIndex = args.indexOf("--body");
          editBodies.push(args[bodyIndex + 1]);
        }
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));

    try {
      await runRetry({ bodyFile, description: "retry body-only com fechamento" });

      expect(editBodies).toHaveLength(1);
      const closes = editBodies[0]
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^Closes\s+#\d+$/i.test(line));
      expect(closes).toEqual(["Closes #42"]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-002: falha da versão servida após stop restaura reset, build e start antigos", async () => {
    const oldConfig = {
      dbPath: null,
      buildCommand: "old-build",
      stopCommand: "old-stop",
      startCommand: "old-start",
      versionCheckUrl: "https://example.test/version",
      versionCheckUnit: ".",
      versionCheckTimeoutMs: 1,
    };
    const newConfig = {
      ...oldConfig,
      buildCommand: "new-build",
      stopCommand: "new-stop",
      startCommand: "new-start",
    };
    await mockShipConfig(oldConfig, process.cwd(), { afterPullConfig: newConfig });
    const calls = [];
    installDeployMocks(process.cwd(), calls);
    const fetchStarted = new Promise((resolve) => {
      let pending = resolve;
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        pending?.();
        pending = null;
        return {
          ok: true,
          status: 200,
          text: async () => "<p>Versão da aplicação v9.9.9</p>",
        };
      });
    });
    const fetchSpy = globalThis.fetch;
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();

    try {
      const deployment = runShip(["deploy"]).then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error }),
      );
      await fetchStarted;
      await vi.advanceTimersByTimeAsync(2_500);
      const outcome = await deployment;

      expect(outcome.ok, "versão servida divergente deve falhar o deploy").toBe(false);
      const resetIndex = calls.findIndex(
        ({ kind, command, args }) =>
          kind === "exec" && command === "git" && args[0] === "reset" && args[1] === "--hard" && args[2] === "old-head",
      );
      const oldBuildIndex = calls.findIndex(({ kind, command }) => kind === "spawn" && command === "old-build");
      const oldStartIndex = calls.findIndex(({ kind, command }) => kind === "spawn" && command === "old-start");
      expect(resetIndex).toBeGreaterThanOrEqual(0);
      expect(oldBuildIndex).toBeGreaterThan(resetIndex);
      expect(oldStartIndex).toBeGreaterThan(oldBuildIndex);
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/rollback/i);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      fetchSpy.mockRestore();
      vi.useRealTimers();
      unmockShipFs();
    }
  });

  it("AC-002: falha de fonte SemVer após pull restaura old head, build e start", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-post-pull-semver-"));
    const configPath = join(tempRoot, "ship.config.json");
    const packagePath = join(tempRoot, "package.json");
    writeFileSync(packagePath, JSON.stringify({ name: "fixture", version: "1.2.3" }));
    writeFileSync(
      join(tempRoot, "release-please-config.json"),
      JSON.stringify({ packages: { ".": { "release-type": "node", "initial-version": "0.1.0" } } }),
    );
    writeFileSync(join(tempRoot, ".release-please-manifest.json"), JSON.stringify({ ".": "1.2.3" }));
    const oldConfig = {
      dbPath: null,
      buildCommand: "old-build",
      stopCommand: "old-stop",
      startCommand: "old-start",
      versionCheckUrl: null,
    };
    writeFileSync(configPath, JSON.stringify(oldConfig));
    const newConfig = { ...oldConfig };
    const actualFs = await vi.importActual("node:fs");
    let configReads = 0;
    let packageReads = 0;
    vi.doMock("node:fs", () => ({
      ...actualFs,
      readFileSync(file, ...rest) {
        if (String(file) === configPath) {
          configReads += 1;
          return JSON.stringify(configReads > 1 ? newConfig : oldConfig);
        }
        if (String(file) === packagePath) {
          packageReads += 1;
          return JSON.stringify(packageReads > 1 ? { name: "fixture", version: "not-semver" } : { name: "fixture", version: "1.2.3" });
        }
        return actualFs.readFileSync(file, ...rest);
      },
    }));
    const calls = [];
    installDeployMocks(tempRoot, calls);
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const deployment = runShip(["deploy"]).then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error }),
      );
      const outcome = await deployment;

      expect(outcome.ok, "fonte SemVer inválida pós-pull deve falhar o deploy").toBe(false);
      const resetIndex = calls.findIndex(
        ({ kind, command, args }) =>
          kind === "exec" && command === "git" && args[0] === "reset" && args[1] === "--hard" && args[2] === "old-head",
      );
      expect(resetIndex).toBeGreaterThanOrEqual(0);
      expect(calls.findIndex(({ kind, command }) => kind === "spawn" && command === "old-build")).toBeGreaterThan(resetIndex);
      expect(calls.findIndex(({ kind, command }) => kind === "spawn" && command === "old-start")).toBeGreaterThan(resetIndex);
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/E_VERSION_SOURCE|SemVer|rollback/i);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("AC-002: buildCommand null não executa nenhum build e registra build NA", async () => {
    await mockShipConfig({
      dbPath: null,
      buildCommand: null,
      stopCommand: "stop-server",
      startCommand: "start-server",
      versionCheckUrl: null,
    });
    const calls = [];
    installDeployMocks(process.cwd(), calls);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await runShip(["deploy"]);

      const spawned = calls.filter(({ kind }) => kind === "spawn").map(({ command }) => command);
      expect(spawned).toContain("start-server");
      expect(spawned).not.toContain("build-server");
      expect(spawned).not.toContain(null);
      expect(logSpy.mock.calls.flat().join("\n")).toMatch(/build\s*:\s*NA[\s\S]*buildCommand=null/i);
    } finally {
      logSpy.mockRestore();
      unmockShipFs();
    }
  });

  it.each([
    ["stop interrompido", { status: null, signal: "SIGTERM" }],
    ["stop não zero", { status: 1, signal: null }],
  ])("AC-002: %s sem dbPath bloqueia reset/start sem quiescência comprovada", async (_label, stopResult) => {
    await mockShipConfig({
      dbPath: null,
      buildCommand: "old-build",
      stopCommand: "stop-server",
      startCommand: "old-start",
      versionCheckUrl: null,
    });
    const calls = [];
    installDeployMocks(process.cwd(), calls, (command) => (command === "stop-server" ? stopResult : { status: 0 }));
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");

      const resetIndex = calls.findIndex(
        ({ kind, command, args }) =>
          kind === "exec" && command === "git" && args[0] === "reset" && args[1] === "--hard" && args[2] === "old-head",
      );
      expect(resetIndex).toBe(-1);
      expect(calls.findIndex(({ kind, command }) => kind === "spawn" && command === "old-build")).toBe(-1);
      expect(calls.findIndex(({ kind, command }) => kind === "spawn" && command === "old-start")).toBe(-1);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
    }
  });

  it("AC-002: erro de requireVersionCheckUnit preserva o código E_VERSION_SOURCE", async () => {
    await mockShipConfig({
      dbPath: null,
      buildCommand: null,
      stopCommand: null,
      startCommand: null,
      versionCheckUrl: "https://example.test/version",
      versionCheckUnit: "unit-that-does-not-exist",
    });
    configureDefaultGitGh();
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(runShip(["deploy"])).rejects.toThrow("__SHIP_EXIT_1__");
      expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/E_VERSION_SOURCE/);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
    }
  });

  it("AC-002: readiness aceita serviço que só fica disponível depois de um segundo", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-readiness-over-one-second-"));
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture", version: "1.2.3" }));
    await mockShipConfig(
      {
        dbPath: null,
        buildCommand: null,
        stopCommand: null,
        startCommand: "start-server",
        versionCheckUrl: "https://example.test/version",
        versionCheckTimeoutMs: 1_000,
      },
      tempRoot,
    );
    const calls = [];
    installDeployMocks(tempRoot, calls);
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    const startedAt = Date.now();
    const readyAfterMs = 1_100;
    let resolveFirstFetch;
    const firstFetch = new Promise((resolve) => {
      resolveFirstFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      resolveFirstFetch?.();
      resolveFirstFetch = null;
      if (Date.now() - startedAt < readyAfterMs) {
        return { status: 503, body: { cancel: vi.fn() } };
      }
      return {
        status: 200,
        text: async () => "<p>Versão da aplicação v1.2.3</p>",
      };
    });

    try {
      const deployment = runShip(["deploy"]).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await firstFetch;
      await vi.advanceTimersByTimeAsync(3_000);
      const outcome = await deployment;

      expect(outcome.error, "readiness não deve desistir antes de o serviço ficar pronto").toBeUndefined();
      expect(outcome.value).toBeDefined();
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(10);
    } finally {
      errorSpy.mockRestore();
      fetchSpy.mockRestore();
      vi.useRealTimers();
      exitSpy.mockRestore();
      unmockShipFs();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
describe("RED_REVISION: transições pós-pull e marcadores de retry", () => {
  function installTransitionGitMocks(root, calls) {
    childProcess.execFileSync.mockImplementation((command, args) => {
      calls.push({ kind: "exec", command, args: [...args] });
      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        return "";
      }
      if (command !== "git") return "";
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return root;
      if (args[0] === "status" && args[1] === "--porcelain") return "";
      if (args[0] === "branch" && args[1] === "--show-current") return "main";
      if (args[0] === "rev-list" && args[1] === "--count" && args[2] === "origin/main..HEAD") return "0";
      if (args[0] === "rev-list" && args[1] === "--count") return "0";
      if (args[0] === "rev-parse" && args[1] === "HEAD") return "old-head";
      if (args[0] === "diff" && args[1] === "--name-only") return "";
      return "";
    });
  }

  it("AC-002: stop/start antigos que viram null após pull não declaram deploy concluído com serviço parado", async () => {
    const oldConfig = {
      dbPath: null,
      buildCommand: null,
      stopCommand: "old-stop",
      startCommand: "old-start",
      versionCheckUrl: null,
    };
    const newConfig = { ...oldConfig, stopCommand: null, startCommand: null };
    await mockShipConfig(oldConfig, process.cwd(), { afterPullConfig: newConfig });

    const calls = [];
    let serviceRunning = true;
    installTransitionGitMocks(process.cwd(), calls);
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      if (command === "old-stop") {
        serviceRunning = false;
        return { status: 0 };
      }
      if (command === "old-start") {
        serviceRunning = true;
        return { status: 0 };
      }
      return { status: 0 };
    });
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const outcome = await runShip(["deploy"]).then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error }),
      );

      expect(outcome.ok, "configuração pós-pull sem start não pode concluir o deploy").toBe(false);
      expect(serviceRunning, "a falha de transição deve restaurar o serviço antigo").toBe(true);
      expect(calls.filter(({ kind, command }) => kind === "spawn" && command === "old-start")).not.toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
    }
  });

  it("AC-002: falha parcial do stop pós-pull tenta old-stop antes do restart antigo", async () => {
    const oldConfig = {
      dbPath: null,
      buildCommand: null,
      stopCommand: "old-stop",
      startCommand: "old-start",
      versionCheckUrl: null,
    };
    const newConfig = { ...oldConfig, stopCommand: "new-stop", startCommand: "new-start" };
    await mockShipConfig(oldConfig, process.cwd(), { afterPullConfig: newConfig });

    const calls = [];
    let serviceRunning = true;
    let partialStopObserved = false;
    installTransitionGitMocks(process.cwd(), calls);
    childProcess.spawnSync.mockImplementation((command, args) => {
      calls.push({ kind: "spawn", command, args: Array.isArray(args) ? [...args] : [] });
      if (command === "old-stop") {
        serviceRunning = false;
        return { status: 0 };
      }
      if (command === "new-stop") {
        partialStopObserved = true;
        serviceRunning = false;
        return { status: 1 };
      }
      if (command === "old-start") {
        serviceRunning = true;
        return { status: 0 };
      }
      if (command === "new-start") {
        throw new Error("new start must not run after post-pull stop failure");
      }
      return { status: 0 };
    });
    const exitSpy = trapProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const outcome = await runShip(["deploy"]).then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error }),
      );

      expect(outcome.ok, "stop pós-pull falho deve abortar o deploy").toBe(false);
      expect(partialStopObserved, "o novo stop deve afetar o serviço antes de falhar").toBe(true);
      const newStopIndices = calls.flatMap((call, index) =>
        call.kind === "spawn" && call.command === "new-stop" ? [index] : [],
      );
      const oldStopIndices = calls.flatMap((call, index) =>
        call.kind === "spawn" && call.command === "old-stop" ? [index] : [],
      );
      expect(newStopIndices, "rollback deve tentar o novo stop recebido").toHaveLength(2);
      expect(oldStopIndices, "rollback deve tentar o stop antigo após a falha parcial").toHaveLength(2);
      const rollbackNewStopIndex = newStopIndices.at(-1);
      const rollbackOldStopIndex = oldStopIndices.at(-1);
      const oldStartIndex = calls.findIndex(({ kind, command }) => kind === "spawn" && command === "old-start");
      expect(rollbackNewStopIndex).toBeLessThan(rollbackOldStopIndex);
      expect(rollbackOldStopIndex).toBeLessThan(oldStartIndex);
      expect(calls.filter(({ kind, command }) => kind === "spawn" && command === "new-stop")).not.toHaveLength(0);
      expect(calls.filter(({ kind, command }) => kind === "spawn" && command === "new-start")).toHaveLength(0);
      expect(calls.filter(({ kind, command }) => kind === "spawn" && command === "old-start")).not.toHaveLength(0);
      expect(serviceRunning, "rollback deve reiniciar a revisão antiga").toBe(true);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
      unmockShipFs();
    }
  });


  it("AC-003: retry usa Closes da issue da branch sem inventar o número do PR nem duplicar separadores", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ship-close-pr-mismatch-"));
    const bodyFile = join(tempRoot, "evidence.md");
    const initialBody = "Corpo já publicado";
    const payload = "Evidência final";
    writeFileSync(bodyFile, payload);
    let existingBody = initialBody;
    const editCalls = [];

    childProcess.execFileSync.mockImplementation((command, args) => {
      if (command === "git") {
        if (args[0] === "rev-parse") return process.cwd();
        if (args[0] === "branch") return "fix/42-pr-mismatch";
        if (args[0] === "rev-list") return "1";
        return "";
      }
      if (command === "gh") {
        if (args[0] === "repo" && args[1] === "view") return "owner/repository";
        if (args[0] === "api") return "main";
        if (args[0] === "pr" && args[1] === "list") return "https://github.com/owner/repository/pull/99";
        if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ body: existingBody });
        if (args[0] === "pr" && args[1] === "edit") {
          const bodyIndex = args.indexOf("--body");
          existingBody = args[bodyIndex + 1];
          editCalls.push(existingBody);
        }
        return "";
      }
      return "";
    });
    childProcess.spawnSync.mockImplementation(() => ({ status: 0 }));

    try {
      await runRetry({ bodyFile, description: "preservar fechamento da issue" });
      await runRetry({ bodyFile, description: "preservar fechamento da issue" });

      expect(editCalls).toHaveLength(1);
      const closes = existingBody
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^Closes\s+#\d+$/i.test(line));
      expect(closes).toEqual(["Closes #42"]);
      expect(existingBody).not.toMatch(/Closes\s+#99/i);
      expect(existingBody).toBe(`Closes #42\n\n${initialBody}\n\n${payload}`);
      expect(existingBody).not.toMatch(/\n{3,}/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
