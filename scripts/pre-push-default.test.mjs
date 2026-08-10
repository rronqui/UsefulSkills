import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const hook = join(repoRoot, "scripts", "hooks", "pre-push.mjs");
let temporaryRepositories = [];

function isolatedGitEnv(cwd) {
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(cwd, ".pre-push-default-global-config"),
  };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_CONFIG_SYSTEM"]) {
    delete env[key];
  }
  return env;
}

function runGit(cwd, args, { input } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    input,
    encoding: "utf8",
    env: isolatedGitEnv(cwd),
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} falhou: ${result.stderr || result.error?.message || result.status}`);
  }
  return result;
}

function createTemporaryDirectory() {
  const cwd = mkdtempSync(join(tmpdir(), "pre-push-default-"));
  temporaryRepositories.push(cwd);
  return cwd;
}

function createRepository(defaultBranch = "develop") {
  const cwd = createTemporaryDirectory();

  runGit(cwd, ["init", "--quiet", `--initial-branch=${defaultBranch}`]);
  runGit(cwd, ["config", "init.defaultBranch", defaultBranch]);
  runGit(cwd, ["remote", "add", "origin", cwd]);
  runGit(cwd, [
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
    `refs/remotes/origin/${defaultBranch}`,
  ]);
  return cwd;
}

function removeRemoteHead(cwd) {
  runGit(cwd, ["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"]);
}

function makeRemoteHeadNonSymbolic(cwd) {
  removeRemoteHead(cwd);
  const object = runGit(cwd, ["hash-object", "-w", "--stdin"], {
    input: "pre-push fixture\n",
  }).stdout.trim();
  runGit(cwd, ["update-ref", "refs/remotes/origin/HEAD", object]);
}

function setLocalDefaultBranch(cwd, branch) {
  runGit(cwd, ["config", "--local", "init.defaultBranch", branch]);
}

function invokeHook(cwd, input) {
  return spawnSync(process.execPath, [hook], {
    cwd,
    input,
    encoding: "utf8",
    env: isolatedGitEnv(cwd),
  });
}

function invokeHookWithUnsupportedShowRef(cwd, input) {
  const preload = join(cwd, ".pre-push-show-ref-unsupported.cjs");
  writeFileSync(
    preload,
    [
      "const childProcess = require('node:child_process');",
      "const { syncBuiltinESMExports } = require('node:module');",
      "const originalSpawnSync = childProcess.spawnSync;",
      "childProcess.spawnSync = (file, args, options) => {",
      "  if (file === 'git' && Array.isArray(args) && args.length === 4 && args[0] === 'show-ref' && args[1] === '--exists' && args[2] === '--quiet' && args[3] === 'refs/remotes/origin/HEAD') {",
      "    return { status: 129, stdout: '', stderr: 'git: unknown option --exists\\n' };",
      "  }",
      "  return originalSpawnSync(file, args, options);",
      "};",
      "syncBuiltinESMExports();",
    ].join("\n"),
  );
  try {
    return spawnSync(process.execPath, ["--require", preload, hook], {
      cwd,
      input,
      encoding: "utf8",
      env: isolatedGitEnv(cwd),
    });
  } finally {
    rmSync(preload, { force: true });
  }
}


afterEach(() => {
  for (const cwd of temporaryRepositories.splice(0)) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

describe("pre-push CLI respeita a branch default configurada no repositório", () => {
  it("bloqueia refs/heads/develop e informa a branch bloqueada", () => {
    const cwd = createRepository("develop");
    const result = invokeHook(cwd, "refs/heads/develop 1111111 refs/heads/feature/login 2222222\n");
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).not.toBe(0);
    expect(output).toMatch(/develop/i);
    expect(output).toMatch(/bloquead|block/i);
  });
  it("usa init.defaultBranch local quando origin/HEAD está ausente e ainda bloqueia a default", () => {
    const cwd = createRepository("develop");
    removeRemoteHead(cwd);
    const result = invokeHook(cwd, "refs/heads/develop 1111111 refs/heads/feature/login 2222222\n");
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).not.toBe(0);
    expect(output).toMatch(/develop/i);
  });

  it("falha fechado quando origin/HEAD existe, mas não é uma referência simbólica", () => {
    const cwd = createRepository("develop");
    makeRemoteHeadNonSymbolic(cwd);
    const result = invokeHook(cwd, "refs/heads/feature/login 1111111 refs/heads/topic 2222222\n");
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).not.toBe(0);
    expect(output).toMatch(/HEAD|padr[aã]o|default|inv[aá]lid/i);
  });

  it.each(["feature~1", "feature..branch", "refs/heads/develop"])(
    "rejeita init.defaultBranch inválido (%s)",
    (configuredBranch) => {
      const cwd = createRepository("develop");
      removeRemoteHead(cwd);
      setLocalDefaultBranch(cwd, configuredBranch);
      const result = invokeHook(cwd, "refs/heads/feature/login 1111111 refs/heads/topic 2222222\n");
      const output = `${result.stdout}${result.stderr}`;

      expect(result.error, output).toBeUndefined();
      expect(result.status, output).not.toBe(0);
      expect(output).toMatch(/inv[aá]lid|invalid/i);
    },
  );

  it("rejeita stdin malformada com exatamente três campos", () => {
    const cwd = createRepository("develop");
    const result = invokeHook(cwd, "refs/heads/feature/login 1111111 refs/heads/topic\n");
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).not.toBe(0);
    expect(output).toMatch(/interpret|formato|campo|field|malform/i);
  });

  it("não escolhe silenciosamente uma default quando remote HEAD e config local entram em conflito", () => {
    const cwd = createRepository("develop");
    setLocalDefaultBranch(cwd, "main");
    const result = invokeHook(cwd, "refs/heads/feature/login 1111111 refs/heads/topic 2222222\n");
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).not.toBe(0);
    expect(output).toMatch(/develop|main|conflit|conflict|padr[aã]o|default/i);
  });

  it("falha fechado para stdin não vazia fora de um repositório", () => {
    const cwd = createTemporaryDirectory();
    const result = invokeHook(cwd, "refs/heads/feature/login 1111111 refs/heads/topic 2222222\n");
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).not.toBe(0);
    expect(output).toMatch(/reposit[oó]rio|repository|git/i);
  });


  it("bloqueia o push para develop quando a branch default está no remote ref", () => {
    const cwd = createRepository("develop");
    const result = invokeHook(cwd, "refs/heads/feature/login 1111111 refs/heads/develop 2222222\n");
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).not.toBe(0);
  });

  it.each([
    ["main", "refs/heads/main 1111111 refs/heads/feature/login 2222222\n"],
    ["feature", "refs/heads/feature/login 1111111 refs/heads/main 2222222\n"],
  ])("permite a ref não-default %s", (_name, input) => {
    const cwd = createRepository("develop");
    const result = invokeHook(cwd, input);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).toBe(0);
  });

  it("permite stdin vazia sem criar um bloqueio espúrio", () => {
    const cwd = createRepository("develop");
    const result = invokeHook(cwd, "");
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).toBe(0);
  });
  it("usa fallback portátil e permite ref de feature quando show-ref --exists não existe", () => {
    const cwd = createRepository("develop");
    const result = invokeHookWithUnsupportedShowRef(
      cwd,
      "refs/heads/feature/login 1111111 refs/heads/topic 2222222\n",
    );
    const output = `${result.stdout}${result.stderr}`;

    expect(result.error, output).toBeUndefined();
    expect(result.status, output).toBe(0);
  });

});
