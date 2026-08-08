// Testes das funções puras do motor ship.mjs (lib.mjs).
import { describe, it, expect, vi } from "vitest";
import { extractIssueNumber, extractServedVersion, flagValue, performBackup, resolveSchemaWatch, slugify } from "./lib.mjs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  it("retorna null quando não há versão", () => {
    expect(extractServedVersion("<html></html>")).toBeNull();
    expect(extractServedVersion(null)).toBeNull();
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
