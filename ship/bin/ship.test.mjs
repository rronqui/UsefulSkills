import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
