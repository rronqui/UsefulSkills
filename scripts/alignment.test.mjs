import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(repoRoot, "alignment", "SKILL.md");
const protocol = readFileSync(skillPath, "utf8");
const normalizedProtocol = protocol.replace(/\s+/g, " ").trim();

// O fixture representa o registro que precisa sobreviver ao fast-close; os
// valores são verificados contra o JSON normativo persistido no protocolo.
const fastCloseCheckpoint = Object.freeze({
  checkpoint: "alignment",
  frontier: [],
  closure: "fully-specified-fast-close",
  closureRecorded: true,
  status: "CLOSED",
});

const fullySpecifiedRequest = Object.freeze({
  kind: "correction",
  specified: true,
  questions: [],
  persistedCheckpoint: fastCloseCheckpoint,
});

const unansweredRequest = Object.freeze({
  kind: "behavioral",
  specified: false,
  questions: ["qual intenção deve prevalecer no hunk conflitante?"],
  expectedCheckpoint: "alignment",
  expectedStatus: "BLOCKED",
});

function hasAny(patterns) {
  return patterns.some((pattern) => pattern.test(normalizedProtocol));
}

function sectionBetween(startMarker, endMarker) {
  const startAt = normalizedProtocol.indexOf(startMarker);
  expect(startAt, `seção ausente: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const endAt = normalizedProtocol.indexOf(endMarker, startAt + startMarker.length);
  expect(endAt, `seção seguinte ausente: ${endMarker}`).toBeGreaterThan(startAt);
  return normalizedProtocol.slice(startAt, endAt);
}

function jsonBlockContaining(marker) {
  const body = [...protocol.matchAll(/```json\s*([\s\S]*?)```/gi)]
    .map(([, candidate]) => candidate.trim())
    .find((candidate) => candidate.includes(marker));
  expect(body, `checkpoint JSON ausente: ${marker}`).toBeTypeOf("string");
  return JSON.parse(body);
}

describe("alignment — checkpoint obrigatório", () => {
  it("AC-021 exige alignment para todo pedido comportamental ou de correção", () => {
    expect(fullySpecifiedRequest.persistedCheckpoint.checkpoint).toBe("alignment");
    expect(unansweredRequest.expectedCheckpoint).toBe("alignment");

    const requiredRules = [
      /pedido(?:s)?[^\n]{0,180}(?:comportamental|behavioral)[^\n]{0,180}(?:checkpoint|alinhamento)/i,
      /pedido(?:s)?[^\n]{0,180}(?:correção|correction)[^\n]{0,180}(?:checkpoint|alinhamento)/i,
      /(?:todo|qualquer)[^\n]{0,120}(?:pedido|solicitação)[^\n]{0,180}(?:passa|deve passar|must pass)[^\n]{0,180}(?:alignment|alinhamento)/i,
    ];
    const missingRules = requiredRules.filter((pattern) => !pattern.test(normalizedProtocol));

    expect(missingRules).toHaveLength(0);
  });

  it("AC-021 fast-close persiste CLOSED, frontier vazia e todos os campos do checkpoint", () => {
    const documented = jsonBlockContaining('"checkpoint": "alignment"');
    const requiredFields = Object.keys(fastCloseCheckpoint);
    const missingFields = requiredFields.filter((field) => !Object.hasOwn(documented, field));
    const fastCloseSection = sectionBetween(
      "Quando o pedido já está totalmente especificado",
      "Quando existir qualquer pergunta",
    );

    expect(fullySpecifiedRequest.specified).toBe(true);
    expect(fullySpecifiedRequest.questions).toHaveLength(0);
    expect(missingFields).toEqual([]);
    expect(documented.checkpoint).toBe(fastCloseCheckpoint.checkpoint);
    expect(documented.frontier).toEqual(fastCloseCheckpoint.frontier);
    expect(documented.closure).toBe(fastCloseCheckpoint.closure);
    expect(documented.closureRecorded).toBe(true);
    expect(documented.status).toBe("CLOSED");
    expect(fastCloseSection).toMatch(/(?:persist|persistir|persistido|persistida)/i);
  });

  it("AC-021 não permite rota silenciosa quando ainda há pergunta sem resposta", () => {
    expect(unansweredRequest.questions.length).toBeGreaterThan(0);
    expect(unansweredRequest.expectedStatus).toBe("BLOCKED");

    expect(
      hasAny([
        /pergunta[^\n]{0,160}(?:sem resposta|não respondida|unanswered)[^\n]{0,180}(?:bloque|BLOCKED|não rote|do not route)/i,
        /(?:fronteira|frontier)[^\n]{0,180}(?:não esvazi|not empty)[^\n]{0,180}(?:bloque|BLOCKED|não rote|do not route)/i,
      ]),
    ).toBe(true);
    expect(normalizedProtocol).toMatch(/(?:nunca|não|nao|never)[^\n]{0,160}(?:pule|pular|skip)[^\n]{0,120}(?:silêncio|silently)/i);
  });
});
