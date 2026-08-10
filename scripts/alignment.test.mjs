import { describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(repoRoot, "alignment", "SKILL.md");
const protocol = readFileSync(skillPath, "utf8");
const normalizedProtocol = protocol.replace(/\s+/g, " ").trim();

function compareUnicodeCodePoints(left, right) {
  const leftPoints = [...left];
  const rightPoints = [...right];
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index].codePointAt(0);
    const rightPoint = rightPoints[index].codePointAt(0);
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
  }
  return leftPoints.length - rightPoints.length;
}

function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON exige número finito");
    if (Object.is(value, -0)) return "0";
    return JSON.stringify(value).replace("e+", "e");
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value !== "object") throw new TypeError("tipo não suportado");

  const normalizedKeys = new Map();
  for (const key of Object.keys(value)) {
    const normalizedKey = key.normalize("NFC");
    if (normalizedKeys.has(normalizedKey)) {
      throw new TypeError("chaves colidem após NFC");
    }
    normalizedKeys.set(normalizedKey, value[key]);
  }
  const entries = [...normalizedKeys.entries()].sort(([left], [right]) =>
    compareUnicodeCodePoints(left, right),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

function sha256(canonical) {
  return `sha256:${createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex")}`;
}

const fastCloseRequest = Object.freeze({
  kind: "correction",
  questions: [],
  responses: [],
  specified: true,
});
const fastCloseCanonical = canonicalize(fastCloseRequest);
const fastCloseCheckpoint = Object.freeze({
  checkpoint: "alignment",
  request_id: randomUUID(),
  request_canonical: fastCloseCanonical,
  request_digest: sha256(fastCloseCanonical),
  frontier: [],
  closure: "fully-specified-fast-close",
  closureRecorded: true,
  status: "CLOSED",
  responses: fastCloseRequest.responses,
});

const fullySpecifiedRequest = Object.freeze({
  ...fastCloseRequest,
  persistedCheckpoint: fastCloseCheckpoint,
});

const resumedResponse = Object.freeze({
  round: 1,
  question_id: "q-intencao",
  question: "Qual intenção deve prevalecer?",
  answer: "A intenção explicitamente confirmada pelo usuário.",
});
const resumedRequest = Object.freeze({
  kind: "correction",
  questions: [resumedResponse.question],
  responses: [resumedResponse],
  specified: true,
});
const resumedCanonical = canonicalize(resumedRequest);
const resumedCheckpoint = Object.freeze({
  ...fastCloseCheckpoint,
  request_canonical: resumedCanonical,
  request_digest: sha256(resumedCanonical),
  responses: resumedRequest.responses,
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
  it("AC-012 exige alignment para todo pedido comportamental ou de correção", () => {
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

  it("AC-012 fast-close persiste CLOSED, frontier vazia e todos os campos do checkpoint", () => {
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
    expect(fastCloseCheckpoint.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(fastCloseCheckpoint.request_digest).toBe(sha256(fastCloseCanonical));
    expect(documented.request_id).toMatch(/UUID-v4 gerado para esta solicitação/i);
    expect(documented.request_canonical).toBe(fastCloseCanonical);
    expect(documented.request_digest).toBe(sha256(documented.request_canonical));
    expect(documented.frontier).toEqual(fastCloseCheckpoint.frontier);
    expect(documented.closure).toBe(fastCloseCheckpoint.closure);
    expect(documented.closureRecorded).toBe(true);
    expect(documented.status).toBe("CLOSED");
    expect(fullySpecifiedRequest.persistedCheckpoint.responses).toEqual(
      fullySpecifiedRequest.responses,
    );
    expect(documented.responses).toEqual(fastCloseCheckpoint.responses);
    expect(fastCloseSection).toMatch(/(?:persist|persistir|persistido|persistida)/i);
  });

  it("AC-012 bloqueia fast-close com digest ausente ou divergente", () => {
    const withoutDigest = Object.fromEntries(
      Object.entries(fastCloseCheckpoint).filter(([field]) => field !== "request_digest"),
    );
    const divergentDigest = {
      ...fastCloseCheckpoint,
      request_digest:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    const fastCloseIdentitySection = sectionBetween(
      "`request_id` e `request_digest` são obrigatórios",
      "As respostas coletadas",
    );

    expect(Object.hasOwn(withoutDigest, "request_digest")).toBe(false);
    expect(divergentDigest.request_digest).not.toBe(fastCloseCheckpoint.request_digest);
    expect(fastCloseIdentitySection).toMatch(
      /(?:ausência|ausente)[\s\S]{0,220}(?:BLOCKED|E_ALIGNMENT_BLOCKED)/i,
    );
    expect(fastCloseIdentitySection).toMatch(
      /(?:divergência|divergente|alteração)[\s\S]{0,220}(?:BLOCKED|E_ALIGNMENT_BLOCKED)/i,
    );
    expect(fastCloseIdentitySection).toMatch(
      /(?:recalcul|sha-256)[\s\S]{0,220}(?:pedido|digest|atual)/i,
    );
  });

  it("AC-012 não permite rota silenciosa quando ainda há pergunta sem resposta", () => {
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

describe("alignment — canonicalização e retomada", () => {
  it("AC-012 canonicaliza escaping e números e valida SHA-256 real", () => {
    const probe = canonicalize({
      text: 'linha\n"café"',
      number: -0,
      finite: 1.25,
      exponent: 1e21,
    });

    expect(probe).toBe('{"exponent":1e21,"finite":1.25,"number":0,"text":"linha\\n\\"café\\""}');
    expect(sha256(probe)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(createHash("sha256").update(Buffer.from(probe, "utf8")).digest("hex")).toBe(
      sha256(probe).slice("sha256:".length),
    );
    expect(normalizedProtocol).toMatch(
      /escape[\s\S]{0,600}(?:U\+0000|controle|barra invertida)[\s\S]{0,600}UTF-8/i,
    );
    expect(normalizedProtocol).toMatch(
      /números JSON finitos[\s\S]{0,500}-0[\s\S]{0,500}(?:NaN|Infinity)/i,
    );
  });

  it("AC-012 gera request_id novo por solicitação, sem fixture fixa", () => {
    const anotherRequestId = randomUUID();

    expect(fastCloseCheckpoint.request_id).not.toBe(anotherRequestId);
    expect(anotherRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(normalizedProtocol).toMatch(/crypto\.randomUUID\(\)/);
    expect(normalizedProtocol).toMatch(/Nunca derive o ID de uma fixture/i);
  });

  it("AC-012 resolve o Git comum antes de persistir em linked worktree", () => {
    expect(normalizedProtocol).toMatch(/git rev-parse[\s\S]{0,180}--show-toplevel/i);
    expect(normalizedProtocol).toMatch(/git rev-parse[\s\S]{0,240}--git-common-dir/i);
    expect(normalizedProtocol).toMatch(/arquivo [`]?\.git[`]?[\s\S]{0,240}gitdir:/i);
    expect(normalizedProtocol).toMatch(/nunca [`]?path\.join\(cwd, "\.git", \.\.\.\)[`]?/i);
  });

  it("AC-012 resume preserva respostas, acrescenta round válido e recalcula canonical+SHA", () => {
    expect(Number.isInteger(resumedResponse.round)).toBe(true);
    expect(resumedResponse.round).toBeGreaterThanOrEqual(1);
    expect(resumedResponse.question_id.trim()).not.toBe("");
    expect(resumedResponse.question.trim()).not.toBe("");
    expect(resumedResponse.answer.trim()).not.toBe("");
    expect(resumedCheckpoint.request_canonical).toBe(resumedCanonical);
    expect(resumedCheckpoint.request_digest).toBe(sha256(resumedCanonical));

    const nextResponse = Object.freeze({
      round: 2,
      question_id: "q-confirmacao",
      question: "A intenção foi confirmada?",
      answer: "Sim, foi confirmada.",
    });
    const nextResponses = [...resumedCheckpoint.responses, nextResponse];
    const resumedAfterAppend = {
      ...resumedCheckpoint,
      request_canonical: canonicalize({
        ...resumedRequest,
        responses: nextResponses,
      }),
      request_digest: "",
      responses: nextResponses,
    };
    resumedAfterAppend.request_digest = sha256(resumedAfterAppend.request_canonical);

    expect(resumedAfterAppend.responses[0]).toEqual(resumedResponse);
    expect(resumedAfterAppend.responses).toHaveLength(2);
    expect(resumedAfterAppend.responses[1]).toEqual(nextResponse);
    expect(resumedAfterAppend.request_digest).toBe(
      sha256(resumedAfterAppend.request_canonical),
    );
    expect(resumedAfterAppend.request_digest).not.toBe(resumedCheckpoint.request_digest);
    expect(normalizedProtocol).toMatch(
      /nextResponses = \[\.\.\.persisted\.responses, newResponse\][\s\S]{0,500}nunca substitua/i,
    );
    expect(normalizedProtocol).toMatch(
      /reconstrua `?request_canonical`?[\s\S]{0,500}(?:SHA-256|sha-256)[\s\S]{0,300}request_digest/i,
    );
    expect(normalizedProtocol).toMatch(
      /nunca aceite nem descarte uma resposta silenciosamente/i,
    );
  });
});

describe("alignment — respostas persistidas no fast-close", () => {
  it("AC-012 registra as respostas junto do checkpoint CLOSED com fronteira vazia", () => {
    const documented = jsonBlockContaining('"checkpoint": "alignment"');

    expect(Object.hasOwn(documented, "responses")).toBe(true);
    expect(documented.responses).toEqual(fastCloseCheckpoint.responses);
    expect(documented.frontier).toEqual([]);
    expect(documented.closure).toBe("fully-specified-fast-close");
    expect(documented.status).toBe("CLOSED");
  });
});
