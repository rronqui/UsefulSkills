import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(repoRoot, "conflict-resolution", "SKILL.md");
const protocol = readFileSync(skillPath, "utf8");
const normalizedProtocol = protocol.replace(/\s+/g, " ").trim();
const protocolLines = protocol.split(/\r?\n/);

// Cada fixture é o estado observável que o executor deve finalizar. O comando
// esperado pertence à operação: não pode ser inferido pelo comando mais cômodo.
const continuationFixtures = Object.freeze([
  {
    name: "caminho de PR definido como merge",
    operation: "merge",
    pendingCommits: 1,
    unresolvedHunks: 0,
    expectedCommand: "git commit",
  },
  {
    name: "rebase com commits pendentes",
    operation: "rebase",
    pendingCommits: 2,
    unresolvedHunks: 0,
    expectedCommand: "git rebase --continue",
  },
]);

const forbiddenCommands = Object.freeze([
  "git merge --continue",
  "git rebase --abort",
  "git merge --abort",
]);

const blockedFixture = Object.freeze({
  status: "BLOCKED",
  phase: "BLOCKED",
  operation: "rebase",
  files: ["src/parser.mjs"],
  hunks: ["src/parser.mjs:hunk-2"],
  attempt: 2,
  commandsExecuted: ["git status", "git diff --check", "npm test"],
  redactedEvidence: "evidência redigida: conflito no hunk-2",
  pendingDecision: "escolher a intenção compatível com a issue",
  checks: {
    status: "FAIL",
    handoff: "implementation-owner/state",
  },
});

const resumeFixture = Object.freeze({
  git: Object.freeze({
    operation: "rebase",
    status: "rebase in progress",
    files: ["src/parser.mjs"],
    hunks: ["src/parser.mjs:hunk-2"],
  }),
  before: blockedFixture,
  after: Object.freeze({
    ...blockedFixture,
    attempt: blockedFixture.attempt + 1,
  }),
});

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExplicitForbiddenDirective(command) {
  const commandPattern = escaped(command);
  return new RegExp(
    `(?:nunca|não|nao|proibido|proibida|forbidden)[^\\n]{0,140}${commandPattern}|${commandPattern}[^\\n]{0,140}(?:nunca|não|nao|proibido|proibida|forbidden)`,
    "i",
  ).test(normalizedProtocol);
}

function hasAny(patterns) {
  return patterns.some((pattern) => pattern.test(normalizedProtocol));
}
function hasFieldToken(text, field) {
  const fieldPattern = escaped(field);
  return new RegExp(`(?:\`${fieldPattern}\`|\\b${fieldPattern}\\b)`).test(text);
}


function sectionBetween(startMarker, endMarker) {
  const startAt = normalizedProtocol.indexOf(startMarker);
  expect(startAt, `seção ausente: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const endAt = normalizedProtocol.indexOf(endMarker, startAt + startMarker.length);
  expect(endAt, `seção seguinte ausente: ${endMarker}`).toBeGreaterThan(startAt);
  return normalizedProtocol.slice(startAt, endAt);
}

function operationBullet(operation) {
  const marker = `- \`${operation}\``;
  const startAt = protocolLines.findIndex((line) => line.trimStart().startsWith(marker));
  expect(startAt, `regra ausente para operação ${operation}`).toBeGreaterThanOrEqual(0);

  const endAt = protocolLines.findIndex(
    (line, index) =>
      index > startAt &&
      (line.trimStart().startsWith("- `merge`:") || line.trimStart().startsWith("- `rebase`:")),
  );
  return protocolLines.slice(startAt, endAt === -1 ? protocolLines.length : endAt).join(" ");
}

function jsonBlockContaining(marker) {
  const body = [...protocol.matchAll(/```json\s*([\s\S]*?)```/gi)]
    .map(([, candidate]) => candidate.trim())
    .find((candidate) => candidate.includes(marker));
  expect(body, `fixture JSON ausente: ${marker}`).toBeTypeOf("string");
  return JSON.parse(body);
}

describe("conflict-resolution — protocolo determinístico de continuação", () => {
  it("AC-019 vincula cada operação ao comando de finalização da fixture", () => {
    const missingCommands = continuationFixtures
      .filter((fixture) => {
        expect(fixture.pendingCommits).toBeGreaterThan(0);
        expect(fixture.unresolvedHunks).toBe(0);
        return !operationBullet(fixture.operation).includes(fixture.expectedCommand);
      })
      .map((fixture) => `${fixture.operation} => ${fixture.expectedCommand}`);

    expect(missingCommands).toEqual([]);
    expect(normalizedProtocol).toMatch(/(?:todos os commits|esgotar commits|até .*rebas)/i);
  });

  it("AC-019 explicita que comandos de continuação/abort incompatíveis são proibidos", () => {
    const missingDirectives = forbiddenCommands.filter((command) => !hasExplicitForbiddenDirective(command));

    expect(missingDirectives).toEqual([]);
  });

  it("AC-019 mantém o rebase bloqueado quando ainda há hunk ou commit pendente", () => {
    const pendingConflict = {
      ...continuationFixtures[1],
      unresolvedHunks: 1,
      pendingCommits: 1,
      expectedPhase: "BLOCKED",
    };

    expect(pendingConflict.unresolvedHunks).toBeGreaterThan(0);
    expect(pendingConflict.expectedPhase).toBe("BLOCKED");
    expect(
      hasAny([
        /hunks?.*(?:pendente|não resolvid|unresolved)/i,
        /(?:pendente|não resolvid|unresolved).*hunks?/i,
      ]),
    ).toBe(true);
    expect(normalizedProtocol).toMatch(/BLOCKED[\s\S]{0,500}(?:rebase|merge)/i);
  });
});

describe("conflict-resolution — estado bloqueado e retomável", () => {
  it("AC-020 persiste o schema completo do bloqueio e o handoff implementation-owner/state", () => {
    const documented = jsonBlockContaining('"status": "BLOCKED"');
    const requiredFields = [
      "status",
      "phase",
      "operation",
      "files",
      "hunks",
      "attempt",
      "commandsExecuted",
      "redactedEvidence",
      "pendingDecision",
      "checks",
    ];
    const missingFields = requiredFields.filter((field) => !Object.hasOwn(documented, field));

    expect(missingFields).toEqual([]);
    expect(documented.status).toBe(blockedFixture.status);
    expect(documented.phase).toBe(blockedFixture.phase);
    expect(documented.checks.status).toBe(blockedFixture.checks.status);
    expect(documented.checks.handoff).toBe(blockedFixture.checks.handoff);
  });

  it("AC-020 entrega handoff ao implementation-owner/state quando um check falha", () => {
    const failedCheck = {
      ...blockedFixture,
      checks: {
        status: "FAIL",
        handoff: "implementation-owner/state",
      },
    };
    const failedCheckSection = sectionBetween("Um check que falhar", "Uma retomada");

    expect(failedCheck.checks.status).toBe("FAIL");
    expect(failedCheck.checks.handoff).toBe("implementation-owner/state");
    expect(failedCheckSection).toContain("implementation-owner/state");
    expect(failedCheckSection).toMatch(/status[^\n]{0,180}(?:BLOCKED|bloque)/i);
    expect(failedCheckSection).toMatch(/(?:não|nao|never)[^\n]{0,180}(?:sucesso|success)/i);
  });

  it("AC-020 retoma lendo Git, incrementa attempt e preserva cada prova persistida", () => {
    const preservedFields = [
      "status",
      "operation",
      "files",
      "hunks",
      "commandsExecuted",
      "redactedEvidence",
      "pendingDecision",
    ];
    const changedFields = preservedFields.filter(
      (field) => JSON.stringify(resumeFixture.after[field]) !== JSON.stringify(resumeFixture.before[field]),
    );
    const resumeSection = sectionBetween("Uma retomada", "## 4.");
    const requiredResumeKeys = [...preservedFields, "attempt"];
    const undocumentedResumeKeys = requiredResumeKeys.filter((field) => !hasFieldToken(resumeSection, field));

    expect(resumeFixture.git.operation).toBe(resumeFixture.before.operation);
    expect(resumeFixture.git.files).toEqual(resumeFixture.before.files);
    expect(resumeFixture.git.hunks).toEqual(resumeFixture.before.hunks);
    expect(resumeFixture.git.status).toBe("rebase in progress");
    expect(resumeFixture.after.attempt).toBe(resumeFixture.before.attempt + 1);
    expect(changedFields).toEqual([]);
    expect(resumeSection).toMatch(/(?:lê|le|read)[^\n]{0,180}(?:registro|state)[^\n]{0,180}(?:Git|git)/i);
    expect(resumeSection).toContain("incrementar `attempt`");
    expect(undocumentedResumeKeys).toEqual([]);
  });

  it("AC-020 mantém BLOCKED quando a prova redigida ou a decisão pendente está ausente", () => {
    const missingProofStates = [
      { ...blockedFixture, redactedEvidence: "" },
      { ...blockedFixture, pendingDecision: "" },
    ];
    const missingProofSection = sectionBetween("Evidência ausente", "## 4.");
    const missingProofKeys = ["redactedEvidence", "pendingDecision"].filter(
      (field) => !hasFieldToken(missingProofSection, field),
    );

    for (const state of missingProofStates) {
      expect(state.status).toBe("BLOCKED");
      expect(state.phase).toBe("BLOCKED");
    }
    expect(missingProofSection).toMatch(/BLOCKED/i);
    expect(missingProofKeys).toEqual([]);
    expect(missingProofSection).not.toMatch(/(?:autoriza|declara)[^\n]{0,120}(?:sucesso|success)/i);
  });
});
