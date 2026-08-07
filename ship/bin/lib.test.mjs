// Testes das funções puras do motor ship.mjs (lib.mjs).
import { describe, it, expect } from "vitest";
import { extractIssueNumber, extractServedVersion, flagValue, slugify } from "./lib.mjs";

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
  it("retorna null quando não há versão", () => {
    expect(extractServedVersion("<html></html>")).toBeNull();
    expect(extractServedVersion(null)).toBeNull();
  });
});
