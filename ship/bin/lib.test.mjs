// Testes das funções puras do motor ship.mjs (lib.mjs).
import { describe, it, expect, vi } from "vitest";
const backupFsSeam = vi.hoisted(() => ({
  sourcePath: null,
  displacedPath: null,
  replacementPath: null,
  swapOnOpen: false,
  swapped: false,
  trackSourceFdPath: null,
  capturedSourceFd: null,
  trackTempFdPath: null,
  capturedTempFd: null,
  trackDirFdPath: null,
  capturedDirFd: null,
  closeFailurePath: null,
  closeFailureFd: null,
  closeFailureInjected: false,
  swapStagingBeforeLink: false,
  stagingDir: null,
  stagingDisplacedPath: null,
  stagingForeignPath: null,
  stagingSwapped: false,
  stagingAttempted: false,
  stagingError: null,
}));
vi.mock("node:fs", async () => {
  const actualFs = await vi.importActual("node:fs");
  return {
    ...actualFs,
    openSync(file, flags, ...rest) {
      if (
        backupFsSeam.swapOnOpen &&
        !backupFsSeam.swapped &&
        String(file) === backupFsSeam.sourcePath
      ) {
        backupFsSeam.swapped = true;
        actualFs.renameSync(backupFsSeam.sourcePath, backupFsSeam.displacedPath);
        actualFs.copyFileSync(backupFsSeam.replacementPath, backupFsSeam.sourcePath);
      }
      const fd = actualFs.openSync(file, flags, ...rest);
      if (
        backupFsSeam.trackSourceFdPath &&
        backupFsSeam.capturedSourceFd === null &&
        String(file) === backupFsSeam.trackSourceFdPath
      ) {
        backupFsSeam.capturedSourceFd = fd;
      }
      if (
        backupFsSeam.trackTempFdPath &&
        backupFsSeam.capturedTempFd === null &&
        String(file) === backupFsSeam.trackTempFdPath
      ) {
        backupFsSeam.capturedTempFd = fd;
      }
      if (
        backupFsSeam.trackDirFdPath &&
        backupFsSeam.capturedDirFd === null &&
        String(file) === backupFsSeam.trackDirFdPath
      ) {
        backupFsSeam.capturedDirFd = fd;
      }
      if (
        backupFsSeam.closeFailurePath &&
        backupFsSeam.closeFailureFd === null &&
        String(file) === backupFsSeam.closeFailurePath
      ) {
        backupFsSeam.closeFailureFd = fd;
      }
      return fd;
    },
    closeSync(fd, ...rest) {
      if (
        backupFsSeam.closeFailureFd !== null &&
        fd === backupFsSeam.closeFailureFd &&
        !backupFsSeam.closeFailureInjected
      ) {
        actualFs.closeSync(fd, ...rest);
        backupFsSeam.closeFailureInjected = true;
        const error = new Error("close completed but reported EIO");
        error.code = "EIO";
        throw error;
      }
      return actualFs.closeSync(fd, ...rest);
    },
    linkSync(file, destination, ...rest) {
      if (
        backupFsSeam.swapStagingBeforeLink &&
        !backupFsSeam.stagingSwapped &&
        backupFsSeam.stagingDir &&
        String(file).startsWith(backupFsSeam.stagingDir)
      ) {
        backupFsSeam.stagingAttempted = true;
        backupFsSeam.stagingError = null;
        try {
          actualFs.renameSync(file, backupFsSeam.stagingDisplacedPath);
          actualFs.copyFileSync(backupFsSeam.stagingForeignPath, file);
          backupFsSeam.stagingSwapped = true;
        } catch (error) {
          backupFsSeam.stagingError = error;
          throw error;
        }
      }
      return actualFs.linkSync(file, destination, ...rest);
    },
  };
});
function resetBackupFsSeam() {
  backupFsSeam.sourcePath = null;
  backupFsSeam.displacedPath = null;
  backupFsSeam.replacementPath = null;
  backupFsSeam.swapOnOpen = false;
  backupFsSeam.swapped = false;
  backupFsSeam.trackSourceFdPath = null;
  backupFsSeam.capturedSourceFd = null;
  backupFsSeam.trackTempFdPath = null;
  backupFsSeam.capturedTempFd = null;
  backupFsSeam.trackDirFdPath = null;
  backupFsSeam.capturedDirFd = null;
  backupFsSeam.closeFailurePath = null;
  backupFsSeam.closeFailureFd = null;
  backupFsSeam.closeFailureInjected = false;
  backupFsSeam.swapStagingBeforeLink = false;
  backupFsSeam.stagingDir = null;
  backupFsSeam.stagingDisplacedPath = null;
  backupFsSeam.stagingForeignPath = null;
  backupFsSeam.stagingSwapped = false;
  backupFsSeam.stagingAttempted = false;
  backupFsSeam.stagingError = null;
}
import { extractIssueNumber, extractServedVersion, flagValue, isValidSemVer, performBackup, resolveSchemaWatch, slugify } from "./lib.mjs";
import { closeSync, existsSync, fstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

describe("slugify", () => {
  it("minúsculas, hífen no lugar de separadores", () => {
    expect(slugify("Correções Apontadas")).toBe("correcoes-apontadas");
  });
  it("remove acentos via NFD", () => {
    expect(slugify("Análise — fluxo & gate")).toBe("analise-fluxo-gate");
  });
  it("limita a 40 caracteres sem hífen final", () => {
    const s = slugify("x".repeat(60));
    expect(s).toHaveLength(40);
    expect(slugify("ab cd ef gh ij kl mn op qr st uv wx yz")).not.toMatch(/-$/);
  });
  it("não começa com hífen", () => {
    expect(slugify("  título")).toBe("titulo");
  });
});

describe("flagValue", () => {
  it("retorna o valor após a flag", () => {
    expect(flagValue(["--desc", "texto", "x"], "--desc")).toBe("texto");
  });
  it("retorna null quando ausente ou sem valor", () => {
    expect(flagValue(["a"], "--desc")).toBeNull();
    expect(flagValue(["--desc"], "--desc")).toBeNull();
    expect(flagValue(["--desc", ""], "--desc")).toBeNull();
  });
  it("não trata a próxima flag como valor ausente", () => {
    expect(flagValue(["--desc", "--title"], "--desc")).toBeNull();
    expect(flagValue(["--desc", "--verbose", "texto"], "--desc")).toBeNull();
  });
  it("preserva valores válidos com espaços e Unicode", () => {
    expect(flagValue(["--desc", "  Descrição ✅  ", "--title"], "--desc")).toBe("  Descrição ✅  ");
  });
  it("aceita valores legítimos iniciados por hífen simples", () => {
    const argv = ["--title", "-fix", "--body-file", "-body.md"];
    expect(flagValue(argv, "--title")).toBe("-fix");
    expect(flagValue(argv, "--body-file")).toBe("-body.md");
  });
});

describe("extractIssueNumber", () => {
  it("extrai número do fim da URL do gh", () => {
    expect(extractIssueNumber("https://github.com/o/r/issues/42")).toBe("42");
    expect(extractIssueNumber("https://github.com/o/r/pull/7")).toBe("7");
  });
  it("remove query/fragmento antes de validar", () => {
    expect(extractIssueNumber("https://github.com/o/r/issues/9?tab=1")).toBe("9");
  });
  it("retorna null para saída não numérica", () => {
    expect(extractIssueNumber("https://github.com/o/r/issues/abc")).toBeNull();
    expect(extractIssueNumber("")).toBeNull();
    expect(extractIssueNumber(null)).toBeNull();
  });
});

describe("extractServedVersion", () => {
  it("usa a âncora 'Versão da aplicação' quando presente", () => {
    const html = "v9.9.9 <footer>Versão da aplicação v1.2.3</footer>";
    expect(extractServedVersion(html)).toBe("1.2.3");
  });
  it("usa a primeira ocorrência sem âncora", () => {
    expect(extractServedVersion("<title>v0.4.0</title>")).toBe("0.4.0");
  });
  it("ignora versões dentro de comentários HTML", () => {
    expect(extractServedVersion("<!-- v8.8.8 --> <p>v2.0.1</p>")).toBe("2.0.1");
  });
  it("aceita prerelease e build metadata sem comentário", () => {
    expect(extractServedVersion("<p>v1.2.3-rc.1+build.7</p>")).toBe("1.2.3-rc.1+build.7");
  });
  it("aceita pontuação após a versão", () => {
    expect(extractServedVersion("<p>v1.2.3.</p>")).toBe("1.2.3");
  });
  it("não aceita versão com sufixo semântico inválido", () => {
    expect(extractServedVersion("<p>v1.2.3+build+oops</p>")).toBeNull();
  });
  it("não aceita hífen sem identificador", () => {
    expect(extractServedVersion("<p>v1.2.3-</p>")).toBeNull();
  });
  it("não aceita caracteres inválidos após build metadata", () => {
    expect(extractServedVersion("<p>v1.2.3+build_extra</p>")).toBeNull();
  });
  it("retorna null quando não há versão", () => {
    expect(extractServedVersion("<html></html>")).toBeNull();
    expect(extractServedVersion(null)).toBeNull();
  });
  it("AC-018: versão servida com prerelease numérico zero-leading não é SemVer resolvível", () => {
    expect(extractServedVersion("<p>Versão da aplicação v1.2.3-01</p>")).toBeNull();
  });
});


describe("isValidSemVer", () => {
  it("aceita prerelease e build metadata válidos", () => {
    expect(isValidSemVer("1.2.3-rc.1+build.7")).toBe(true);
  });
  it("rejeita identificador numérico prerelease com zero à esquerda", () => {
    expect(isValidSemVer("1.2.3-01")).toBe(false);
  });
  it("rejeita newline final fora do valor SemVer", () => {
    expect(isValidSemVer("1.2.3\n")).toBe(false);
  });
});

describe("resolveSchemaWatch", () => {
  it("campo omitido → default legado (retrocompat)", () => {
    expect(resolveSchemaWatch(undefined)).toEqual(["src/lib/db.ts"]);
    expect(resolveSchemaWatch(null)).toEqual(["src/lib/db.ts"]);
  });
  it("lista explícita é usada (inclusive vazia para desligar)", () => {
    expect(resolveSchemaWatch(["migrations/"])).toEqual(["migrations/"]);
    expect(resolveSchemaWatch([])).toEqual([]);
  });
  it("elementos não-string são filtrados", () => {
    expect(resolveSchemaWatch(["a", 1, null])).toEqual(["a"]);
  });
});
describe("Linux native backup consumer", () => {
  it.skipIf(process.platform !== "linux")("verifica identidade bigint, cópia exata, colisão, staging nomeado ausente e alvo indisponível fail-closed", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-linux-consumer-"));
    const script = join(root, "consumer.test.mjs");
    const fixtureRoot = join(root, "fixture");
    const source = join(fixtureRoot, "app.db");
    const backupDir = join(fixtureRoot, "backup");
    const libPath = fileURLToPath(new URL("./lib.mjs", import.meta.url));
    writeFileSync(script, `
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";

const root = ${JSON.stringify(fixtureRoot)};
const source = ${JSON.stringify(source)};
const backupDir = ${JSON.stringify(backupDir)};
const realOpenSync = fs.openSync;
const realCloseSync = fs.closeSync;
let closeFailurePath = null;
let capturedCloseFd = null;
let closeFailureInjected = false;
fs.openSync = (file, ...args) => {
  const fd = realOpenSync(file, ...args);
  if (closeFailurePath && capturedCloseFd === null && String(file) === closeFailurePath) {
    capturedCloseFd = fd;
  }
  return fd;
};
fs.closeSync = (fd, ...args) => {
  if (closeFailurePath && fd === capturedCloseFd && !closeFailureInjected) {
    realCloseSync(fd, ...args);
    closeFailureInjected = true;
    const error = new Error("close completed but reported EIO");
    error.code = "EIO";
    throw error;
  }
  return realCloseSync(fd, ...args);
};
syncBuiltinESMExports();
const { performBackup } = await import(${JSON.stringify(libPath)});
const publishedFiles = (dir) => readdirSync(dir).filter((name) => !name.includes(".tmp-"));
const assertClosed = () => {
  assert.equal(closeFailureInjected, true);
  assert.notEqual(capturedCloseFd, null);
  assert.throws(() => fstatSync(capturedCloseFd), (error) => error?.code === "EBADF");
};
const resetCloseFailure = () => {
  closeFailurePath = null;
  capturedCloseFd = null;
  closeFailureInjected = false;
};
const fixedEpoch = Date.parse("2026-01-02T03:04:05.000Z");
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fixedEpoch);
    else super(...args);
  }
  static now() {
    return fixedEpoch;
  }
}
const withFixedTime = (fn) => {
  globalThis.Date = FixedDate;
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
  }
};

test("backup publica bytes exatos, colisão e staging ausente", () => {
  mkdirSync(root, { recursive: true });
  const original = Buffer.from([0, 1, 2, 0xff, 0x00, 0x7f]);
  writeFileSync(source, original);
  const sourceFd = openSync(source, "r");
  try {
    const sourceStat = fstatSync(sourceFd, { bigint: true });
    assert.equal(typeof sourceStat.dev, "bigint");
    assert.equal(typeof sourceStat.ino, "bigint");
  } finally {
    realCloseSync(sourceFd);
  }
  const first = performBackup({ dbPath: "app.db", backupDir }, root);
  assert.deepEqual(readFileSync(first), original);
  const changed = Buffer.from("segunda cópia UTF-8");
  writeFileSync(source, changed);
  const second = performBackup({ dbPath: "app.db", backupDir }, root);
  assert.notEqual(second, first);
  assert.deepEqual(readFileSync(first), original);
  assert.deepEqual(readFileSync(second), changed);
  assert.equal(readdirSync(backupDir).some((name) => name.includes(".tmp-")), false);
  const unavailableTarget = join(root, "backup-file");
  writeFileSync(unavailableTarget, "foreign");
  assert.throws(() => performBackup({ dbPath: "app.db", backupDir: unavailableTarget }, root));
  assert.equal(readFileSync(unavailableTarget, "utf8"), "foreign");
});

test("source close failure is public and preserves the published target", () => {
  const caseRoot = join(root, "source-close");
  const caseSource = join(caseRoot, "app.db");
  const caseBackup = join(caseRoot, "backup");
  const bytes = Buffer.from("source-close");
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(caseSource, bytes);
  closeFailurePath = caseSource;
  try {
    let failure = null;
    try {
      performBackup({ dbPath: "app.db", backupDir: caseBackup }, caseRoot);
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.code, "E_BACKUP_CLOSE");
    assertClosed();
    const names = publishedFiles(caseBackup);
    assert.equal(names.length, 1);
    assert.deepEqual(readFileSync(join(caseBackup, names[0])), bytes);
    assert.equal(readdirSync(caseBackup).some((name) => name.includes(".tmp-")), false);
  } finally {
    resetCloseFailure();
  }
});

test("directory close failure is public and preserves the published target", () => {
  const caseRoot = join(root, "directory-close");
  const caseSource = join(caseRoot, "app.db");
  const caseBackup = join(caseRoot, "backup");
  const bytes = Buffer.from("directory-close");
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(caseSource, bytes);
  closeFailurePath = caseBackup;
  try {
    let failure = null;
    try {
      performBackup({ dbPath: "app.db", backupDir: caseBackup }, caseRoot);
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.code, "E_BACKUP_CLOSE");
    assertClosed();
    const names = publishedFiles(caseBackup);
    assert.equal(names.length, 1);
    assert.deepEqual(readFileSync(join(caseBackup, names[0])), bytes);
    assert.equal(readdirSync(caseBackup).some((name) => name.includes(".tmp-")), false);
  } finally {
    resetCloseFailure();
  }
});

test("close failure on an existing target does not continue the collision", () => {
  const caseRoot = join(root, "collision-close");
  const caseSource = join(caseRoot, "app.db");
  const caseBackup = join(caseRoot, "backup");
  const bytes = Buffer.from("collision-close");
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(caseSource, bytes);
  withFixedTime(() => {
    const foreign = join(caseBackup, "app.db-20260102030405");
    mkdirSync(caseBackup, { recursive: true });
    writeFileSync(foreign, "foreign");
    closeFailurePath = caseSource;
    try {
      let failure = null;
      try {
        performBackup({ dbPath: "app.db", backupDir: caseBackup }, caseRoot);
      } catch (error) {
        failure = error;
      }
      assert.equal(failure?.code, "E_BACKUP_CLOSE");
      assertClosed();
      assert.deepEqual(publishedFiles(caseBackup), ["app.db-20260102030405"]);
      assert.equal(readFileSync(foreign, "utf8"), "foreign");
      assert.equal(readdirSync(caseBackup).some((name) => name.includes(".tmp-")), false);
    } finally {
      resetCloseFailure();
    }
});
});
`);
    try {
      const env = { HOME: root, TMP: root, TEMP: root, TMPDIR: root, LANG: "C", LC_ALL: "C" };
      const result = spawnSync(process.execPath, ["--test", script], {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 30_000,
        killSignal: "SIGKILL",
      });
      const diagnostic = result.stderr || result.stdout || result.error?.message || result.signal || "";
      expect(result.error, diagnostic).toBeUndefined();
      expect(result.signal, diagnostic).toBeNull();
      expect(result.status, diagnostic).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("performBackup", () => {
  it("cria o diretório de backup default quando não existe e copia o db", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-"));
    mkdirSync(join(root, "data"));
    writeFileSync(join(root, "data", "app.db"), "v1");
    try {
      const dest = performBackup({ dbPath: "data/app.db" }, root);
      expect(dest).toBe(join(root, "data", "backup", `app.db-${dest.split("-").pop()}`));
      expect(existsSync(dest)).toBe(true);
      expect(readFileSync(dest, "utf8")).toBe("v1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("fecha o descritor da origem antes de retornar o backup", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-fd-"));
    const source = join(root, "data", "app.db");
    mkdirSync(join(root, "data"));
    writeFileSync(source, "origem-fechada");
    backupFsSeam.trackSourceFdPath = source;
    let capturedFd = null;
    try {
      const dest = performBackup({ dbPath: "data/app.db" }, root);
      expect(readFileSync(dest, "utf8")).toBe("origem-fechada");
      capturedFd = backupFsSeam.capturedSourceFd;
      expect(capturedFd).not.toBeNull();
      let closeError = null;
      try {
        fstatSync(capturedFd);
      } catch (error) {
        closeError = error;
      }
      expect(closeError?.code).toBe("EBADF");
    } finally {
      if (capturedFd !== null) {
        try {
          fstatSync(capturedFd);
          closeSync(capturedFd);
        } catch {}
      }
      resetBackupFsSeam();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform !== "win32")("propaga E_BACKUP_CLOSE sem retentar após colisão de destino", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-win-close-"));
    const source = join(root, "app.db");
    const backupDir = join(root, "backup");
    const bytes = "origem-fechada";
    mkdirSync(backupDir);
    writeFileSync(source, bytes);
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    const base = join(backupDir, "app.db-20260102030405");
    const firstTemp = `${base}.tmp-${process.pid}`;
    writeFileSync(base, "foreign");
    backupFsSeam.trackTempFdPath = firstTemp;
    backupFsSeam.closeFailurePath = firstTemp;
    let failure = null;
    try {
      try {
        performBackup({ dbPath: "app.db", backupDir }, root);
      } catch (error) {
        failure = error;
      }
      expect(backupFsSeam.closeFailureInjected).toBe(true);
      expect(backupFsSeam.capturedTempFd).not.toBeNull();
      expect(failure?.code).toBe("E_BACKUP_CLOSE");
      expect(readFileSync(base, "utf8")).toBe("foreign");
      expect(existsSync(`${base}-1`)).toBe(false);
      expect(readdirSync(backupDir).some((name) => name.includes(".tmp-"))).toBe(false);
    } finally {
      vi.useRealTimers();
      if (backupFsSeam.capturedTempFd !== null) {
        try {
          fstatSync(backupFsSeam.capturedTempFd);
          closeSync(backupFsSeam.capturedTempFd);
        } catch {}
      }
      resetBackupFsSeam();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("recusa snapshot quando a origem regular muda antes da abertura", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-race-"));
    const outside = mkdtempSync(join(tmpdir(), "bkp-external-"));
    const source = join(root, "app.db");
    const displaced = join(root, "app-original.db");
    const replacement = join(outside, "replacement.db");
    const sentinel = join(outside, "sentinel.txt");
    const backupDir = join(root, "backup");
    writeFileSync(source, "origem-identificada");
    writeFileSync(replacement, "origem-substituta");
    writeFileSync(sentinel, "sentinela-intacta");
    backupFsSeam.sourcePath = source;
    backupFsSeam.displacedPath = displaced;
    backupFsSeam.replacementPath = replacement;
    backupFsSeam.swapOnOpen = true;
    try {
      expect(() => performBackup({ dbPath: "app.db", backupDir }, root)).toThrow();
      expect(backupFsSeam.swapped).toBe(true);
      expect(readFileSync(displaced, "utf8")).toBe("origem-identificada");
      expect(readFileSync(source, "utf8")).toBe("origem-substituta");
      expect(readFileSync(replacement, "utf8")).toBe("origem-substituta");
      expect(readFileSync(sentinel, "utf8")).toBe("sentinela-intacta");
      expect(existsSync(backupDir) ? readdirSync(backupDir) : []).toEqual([]);
    } finally {
      resetBackupFsSeam();
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
  it("permite snapshot quando a origem mantém a mesma identidade", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-stable-"));
    const source = join(root, "app.db");
    writeFileSync(source, "origem-estavel");
    backupFsSeam.sourcePath = source;
    try {
      const dest = performBackup({ dbPath: "app.db" }, root);
      expect(readFileSync(dest, "utf8")).toBe("origem-estavel");
    } finally {
      resetBackupFsSeam();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform !== "win32")("falha fechada quando uma tentativa de troca do staging é bloqueada", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-publish-race-"));
    const outside = mkdtempSync(join(tmpdir(), "bkp-publish-external-"));
    const source = join(root, "app.db");
    const backupDir = join(root, "backup");
    const displaced = join(outside, "staging-original");
    const foreign = join(outside, "staging-foreign");
    writeFileSync(source, "origem-original");
    writeFileSync(foreign, "bytes-estranhos");
    backupFsSeam.swapStagingBeforeLink = true;
    backupFsSeam.stagingDir = backupDir;
    backupFsSeam.stagingDisplacedPath = displaced;
    backupFsSeam.stagingForeignPath = foreign;
    let result = null;
    let failure = null;
    try {
      try {
        result = performBackup({ dbPath: "app.db", backupDir }, root);
      } catch (error) {
        failure = error;
      }
      expect(readFileSync(source, "utf8")).toBe("origem-original");
      expect(readFileSync(foreign, "utf8")).toBe("bytes-estranhos");
      expect(backupFsSeam.stagingAttempted).toBe(true);
      expect(backupFsSeam.stagingSwapped).toBe(false);
      expect(backupFsSeam.stagingError?.code).toBe("EBUSY");
      expect(failure).toBe(backupFsSeam.stagingError);
      expect(result).toBeNull();
    } finally {
      resetBackupFsSeam();
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
  it("honra dbPath absoluto", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-"));
    const outside = mkdtempSync(join(tmpdir(), "bkp-external-"));
    const db = join(outside, "app.db");
    writeFileSync(db, "externo");
    try {
      const dest = performBackup({ dbPath: db, backupDir: join(root, "backup") }, root);
      expect(dest).not.toBeNull();
      expect(readFileSync(dest, "utf8")).toBe("externo");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("não sobrescreve backup existente no mesmo instante", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-"));
    writeFileSync(join(root, "db.sqlite"), "v1");
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const first = performBackup({ dbPath: "db.sqlite" }, root);
      writeFileSync(join(root, "db.sqlite"), "v2");
      const second = performBackup({ dbPath: "db.sqlite" }, root);
      expect(second).not.toBe(first);
      expect(readFileSync(first, "utf8")).toBe("v1");
      expect(readFileSync(second, "utf8")).toBe("v2");
    } finally {
      vi.useRealTimers();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("honra backupDir relativo customizado", () => {
    const root = mkdtempSync(join(tmpdir(), "bkp-"));
    writeFileSync(join(root, "db.sqlite"), "x");
    try {
      const dest = performBackup({ dbPath: "db.sqlite", backupDir: "outro/lugar" }, root);
      expect(dest.startsWith(join(root, "outro", "lugar"))).toBe(true);
      expect(existsSync(dest)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sem dbPath ou arquivo ausente → null (chamador avisa)", () => {
    expect(performBackup({}, "/nao-importa")).toBeNull();
    expect(performBackup({ dbPath: "nao-existe.db" }, mkdtempSync(join(tmpdir(), "bkp-")))).toBeNull();
  });
});
