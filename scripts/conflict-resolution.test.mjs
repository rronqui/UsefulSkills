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
    observedGitOperation: "git commit",
  },
  {
    name: "rebase com commits pendentes",
    operation: "rebase",
    pendingCommits: 2,
    unresolvedHunks: 0,
    expectedCommand: "git rebase --continue",
    observedGitOperation: "git rebase --continue",
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
  redactedEvidence: "evidência redigida: conflito no hunk-2 (<REDACTED>)",
  pendingDecision: "escolher a intenção compatível com a issue",
  blockers: ["hunk-2 ainda não resolvido"],
  checks: {
    status: "FAIL",
    handoff: "implementation-owner/state",
  },
  diagnostic: Object.freeze({
    code: "E_CONFLICT_STATE",
    summary: "hunk-2 ainda não resolvido",
  }),
  reviewed_revision: null,
  resolved_revision: null,
  resultingGitOperation: null,
  nextGitOperation: "git rebase --continue",
  redactionExpectation: Object.freeze({
    fields: Object.freeze([
      "commandsExecuted",
      "redactedEvidence",
      "pendingDecision",
      "blockers",
      "checks",
      "diagnostic",
      "reviewed_revision",
      "resolved_revision",
      "resultingGitOperation",
      "nextGitOperation",
    ]),
    marker: "<REDACTED>",
    secretProbe: "ghs_test_secret_must_not_appear",
    diagnosticCode: "E_CONFLICT_STATE",
    beforePersistence: true,
    beforeTransport: true,
    rejectSecretBearingValues: true,
  }),
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

const resolvedConflictReviewFixture = Object.freeze({
  operation: "merge",
  unresolvedHunks: 0,
  pendingCommits: 0,
  checks: Object.freeze({
    status: "PASS",
    pending: Object.freeze([]),
  }),
  reviewed_revision: "resolved-snapshot-sha",
  resolved_revision: "resolved-snapshot-sha",
  resultingGitOperation: "git commit",
  observedGitOperation: "git commit",
  expectedPhase: "RESOLVED",
  review: Object.freeze({
    status: "APPROVED",
    reviewed_revision: "resolved-snapshot-sha",
    blockers: [],
    findings: Object.freeze([
      Object.freeze({ priority: 2, title: "melhoria não bloqueante" }),
      Object.freeze({ priority: 3, title: "ajuste documental não bloqueante" }),
    ]),
    counts: Object.freeze({ P0: 0, P1: 0, P2: 1, P3: 1 }),
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
  it("AC-019 vincula cada operação ao comando de finalização observado", () => {
    const missingCommands = continuationFixtures
      .filter((fixture) => {
        expect(fixture.pendingCommits).toBeGreaterThan(0);
        expect(fixture.unresolvedHunks).toBe(0);
        expect(fixture.observedGitOperation).toBe(fixture.expectedCommand);
        return !operationBullet(fixture.operation).includes(fixture.observedGitOperation);
      })
      .map((fixture) => `${fixture.operation} => ${fixture.observedGitOperation}`);

    expect(missingCommands).toEqual([]);
    expect(normalizedProtocol).toMatch(/(?:todos os commits|esgotar commits|até .*rebas)/i);
    expect(normalizedProtocol).toMatch(/resultingGitOperation[\s\S]{0,180}(?:observada|observed)/i);
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

describe("conflict-resolution — findings residuais após a resolução", () => {
  it("retém P2/P3 no re-review sem bloquear conflito já resolvido", () => {
    const priorities = resolvedConflictReviewFixture.review.findings.map(
      ({ priority }) => priority,
    );
    const finalizationSection = sectionBetween("## 4. Checks e finalização", "**Integração");

    expect(resolvedConflictReviewFixture.unresolvedHunks).toBe(0);
    expect(resolvedConflictReviewFixture.pendingCommits).toBe(0);
    expect(resolvedConflictReviewFixture.expectedPhase).toBe("RESOLVED");
    expect(priorities).toEqual([2, 3]);
    expect(resolvedConflictReviewFixture.review.blockers).toEqual([]);
    expect(finalizationSection).toMatch(
      /(?:P2\s*\/\s*P3|P2\s+e\s+P3)[\s\S]{0,320}(?:não|nao|not)[\s\S]{0,120}(?:bloque|block)/i,
    );
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
      "blockers",
      "checks",
      "diagnostic",
      "reviewed_revision",
      "resolved_revision",
      "resultingGitOperation",
      "nextGitOperation",
    ];
    const missingFields = requiredFields.filter((field) => !Object.hasOwn(documented, field));

    expect(missingFields).toEqual([]);
    expect(documented.status).toBe(blockedFixture.status);
    expect(documented.phase).toBe(blockedFixture.phase);
    expect(documented.checks.status).toBe(blockedFixture.checks.status);
    expect(documented.checks.handoff).toBe(blockedFixture.checks.handoff);
    expect(documented.pendingDecision).toBe(blockedFixture.pendingDecision);
    expect(documented.blockers).toEqual(blockedFixture.blockers);
    expect(documented.diagnostic).toEqual(blockedFixture.diagnostic);
    expect(documented.reviewed_revision).toBeNull();
    expect(documented.resolved_revision).toBeNull();
    expect(documented.resultingGitOperation).toBeNull();
    expect(documented.nextGitOperation).toBe(blockedFixture.nextGitOperation);
  });

  it("AC-020 só chama redacted a prova com marcador literal e sem segredo", () => {
    const handoffSection = sectionBetween("Todo handoff de bloqueio", "Uma retomada");

    expect(handoffSection).toContain(blockedFixture.redactionExpectation.marker);
    expect(protocol).not.toContain(blockedFixture.redactionExpectation.secretProbe);
    expect(handoffSection).toMatch(/E_CONFLICT_STATE/);
    expect(blockedFixture.diagnostic.code).toBe(blockedFixture.redactionExpectation.diagnosticCode);
    expect(handoffSection).toMatch(/(?:segredo|secret)[\s\S]{0,220}(?:nunca|never|não|nao)/i);
  });
  it("AC-020 não persiste tokens ou probes em nenhum campo redigido", () => {
    const forbiddenSecretPatterns = [
      /\bgh[pso]_[A-Za-z0-9_]+\b/,
      /\bgithub_pat_[A-Za-z0-9_]+\b/,
      /\bnpm_[A-Za-z0-9_]+\b/,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    ];

    for (const pattern of forbiddenSecretPatterns) {
      expect(protocol).not.toMatch(pattern);
    }
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
      "phase",
      "operation",
      "files",
      "hunks",
      "commandsExecuted",
      "redactedEvidence",
      "pendingDecision",
      "blockers",
      "checks",
      "diagnostic",
      "reviewed_revision",
      "resolved_revision",
      "resultingGitOperation",
      "nextGitOperation",
    ];
    const changedFields = preservedFields.filter(
      (field) => JSON.stringify(resumeFixture.after[field]) !== JSON.stringify(resumeFixture.before[field]),
    );
    const resumeSection = sectionBetween("Uma retomada", "## 4.");
    const requiredResumeKeys = [...preservedFields, "attempt"];
    const undocumentedResumeKeys = requiredResumeKeys.filter((field) => {
      const protocolField = field;
      return !hasFieldToken(resumeSection, protocolField);
    });

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
describe("conflict-resolution — handoff final e retomável", () => {
  it("AC-011 preserva operação, hunks, tentativa, comandos e prova redigida e exige re-review final", () => {
    expect(operationBullet("merge")).toContain("git commit");
    expect(operationBullet("rebase")).toContain("git rebase --continue");

    const handoffSection = sectionBetween("## 3. Estado BLOCKED", "## 4.");
    const requiredFields = [
      "phase",
      "operation",
      "files",
      "hunks",
      "attempt",
      "commandsExecuted",
      "redactedEvidence",
      "pendingDecision",
      "blockers",
      "checks",
      "diagnostic",
      "reviewed_revision",
      "resolved_revision",
      "resultingGitOperation",
      "nextGitOperation",
    ];
    const missingFields = requiredFields.filter(
      (field) =>
        !hasFieldToken(handoffSection, field) &&
        !(field === "diagnostic" && hasFieldToken(handoffSection, "diagnóstico")),
    );
    expect(missingFields).toEqual([]);
    expect(handoffSection).toMatch(/handoff[^\n]{0,220}implementation-owner\/state/i);
    expect(handoffSection).toMatch(/(?:preserve|preserv)[^\n]{0,220}(?:operation|files|hunks|attempt|commandsExecuted|redactedEvidence)/i);
    expect(handoffSection).toMatch(/(?:redact|redig)[^\n]{0,180}(?:antes|before)[^\n]{0,180}(?:persist|write)/i);

    expect(blockedFixture.redactionExpectation.fields).toEqual(
      expect.arrayContaining([
        "commandsExecuted",
        "pendingDecision",
        "blockers",
        "checks",
        "diagnostic",
      ]),
    );
    expect(blockedFixture.redactionExpectation.beforePersistence).toBe(true);
    expect(blockedFixture.redactionExpectation.beforeTransport).toBe(true);
    expect(blockedFixture.redactionExpectation.rejectSecretBearingValues).toBe(true);
    const handoffFieldsSection = sectionBetween("Todo handoff de bloqueio", "Uma retomada");
    expect(handoffFieldsSection).toMatch(
      /(?:todos os campos|cada campo|all fields)[\s\S]{0,220}(?:\bredig|\bredact(?:ed|ion)?\b|\bsanitiz)[\s\S]{0,220}(?:persist|transport|handoff)/i,
    );
    expect(handoffFieldsSection).toMatch(
      /(?:segredo|secret|token|probe)[\s\S]{0,220}(?:rejeit|bloque|redig|redact|sanitiz)/i,
    );

    const finalizationSection = sectionBetween("## 4. Checks e finalização", "**Integração");
    expect(finalizationSection).toMatch(/(?:re-review|revisão final|final review)/i);
  });
  it("AC-011 só fecha após re-review aprovada e sem P0/P1", () => {
    const approvedReview = resolvedConflictReviewFixture.review;
    const reviewWithP1 = {
      ...approvedReview,
      blockers: [{ priority: 1, title: "blocker residual" }],
      counts: { ...approvedReview.counts, P1: 1 },
    };
    const expectedOperationFor = (fixture) =>
      continuationFixtures.find(({ operation }) => operation === fixture.operation)?.expectedCommand ?? null;
    const canFinalize = (fixture, review) =>
      fixture.expectedPhase === "RESOLVED" &&
      fixture.unresolvedHunks === 0 &&
      fixture.pendingCommits === 0 &&
      fixture.checks?.status === "PASS" &&
      Array.isArray(fixture.checks?.pending) &&
      fixture.checks.pending.length === 0 &&
      fixture.reviewed_revision === fixture.resolved_revision &&
      review.reviewed_revision === fixture.resolved_revision &&
      fixture.resultingGitOperation === expectedOperationFor(fixture) &&
      fixture.resultingGitOperation === fixture.observedGitOperation &&
      review.status === "APPROVED" &&
      review.blockers.length === 0 &&
      review.counts.P0 === 0 &&
      review.counts.P1 === 0;
    const rebaseFixture = {
      ...resolvedConflictReviewFixture,
      operation: "rebase",
      resultingGitOperation: "git rebase --continue",
      observedGitOperation: "git rebase --continue",
    };
    const staleReview = {
      ...approvedReview,
      reviewed_revision: "stale-snapshot-sha",
    };
    const invalidFinalizations = [
      { ...resolvedConflictReviewFixture, reviewed_revision: "stale-snapshot-sha" },
      { ...resolvedConflictReviewFixture, resultingGitOperation: "git rebase --continue" },
      { ...resolvedConflictReviewFixture, observedGitOperation: "git push" },
      { ...resolvedConflictReviewFixture, unresolvedHunks: 1 },
      { ...resolvedConflictReviewFixture, pendingCommits: 1 },
      {
        ...resolvedConflictReviewFixture,
        checks: { status: "FAIL", pending: [] },
      },
      {
        ...resolvedConflictReviewFixture,
        checks: { status: "PASS", pending: ["git diff --check"] },
      },
    ];
    const finalizationSection = sectionBetween("## 4. Checks e finalização", "**Integração");

    expect(canFinalize(resolvedConflictReviewFixture, approvedReview)).toBe(true);
    expect(canFinalize(rebaseFixture, approvedReview)).toBe(true);
    expect(canFinalize(resolvedConflictReviewFixture, staleReview)).toBe(false);
    expect(canFinalize(resolvedConflictReviewFixture, reviewWithP1)).toBe(false);
    for (const invalidFixture of invalidFinalizations) {
      expect(canFinalize(invalidFixture, approvedReview)).toBe(false);
    }
    expect(finalizationSection).toMatch(
      /reviewed_revision[\s\S]{0,220}(?:exatamente igual|igual|equal)[\s\S]{0,120}resolved_revision/i,
    );
    expect(finalizationSection).toMatch(
      /review\.reviewed_revision[\s\S]{0,220}(?:mesmo|igual|same)[\s\S]{0,120}resolved_revision/i,
    );
    expect(finalizationSection).toMatch(
      /resultingGitOperation[\s\S]{0,220}(?:corresponder|correspond|operation)[\s\S]{0,120}(?:operação|operation)/i,
    );
    expect(finalizationSection).toMatch(
      /(?:não|nao|sem|zero|0)[\s\S]{0,100}hunk[\s\S]{0,100}(?:commit|check)/i,
    );
    expect(finalizationSection).toMatch(
      /(?:re-review|revis(?:ão|ao) final)[\s\S]{0,260}(?:aprovad|approved)/i,
    );
    expect(finalizationSection).toMatch(
      /(?:(?:P0\s*\/\s*P1|P0\s+e\s+P1)[\s\S]{0,260}(?:zero|0|nenhum|sem)|(?:zero|0|nenhum|sem)[\s\S]{0,120}(?:P0\s*\/\s*P1|P0\s+e\s+P1))/i,
    );
  });
  it("AC-011 exige re-review do snapshot resolvido antes de commit/push no consumidor ship/conflict", () => {
    const consumerSection = sectionBetween("No consumidor `ship`/conflict", "Caso o rebase");
    const reviewAt = consumerSection.indexOf("re-review aprovada");
    const commitAt = consumerSection.indexOf("git commit");
    const pushAt = consumerSection.indexOf("git push");

    expect(reviewAt).toBeGreaterThanOrEqual(0);
    expect(commitAt).toBeGreaterThan(reviewAt);
    expect(pushAt).toBeGreaterThan(reviewAt);
    expect(consumerSection).toMatch(/review\.reviewed_revision\s*===\s*resolved_revision/);
    expect(consumerSection).toMatch(/(?:não|nao)[\s\S]{0,100}(?:execute|registre)[\s\S]{0,100}(?:commit|push)/i);
  });
  it("AC-011 revisa o rebase somente depois de aplicar todos os commits pendentes", () => {
    const rebaseFixture = continuationFixtures.find(({ operation }) => operation === "rebase");
    const finalizationSection = sectionBetween("## 4. Checks e finalização", "**Integração");
    const continuationAt = finalizationSection.search(
      /(?:rebase[\s\S]{0,160}até não haver commits|até não haver commits)/i,
    );
    const reviewBeforeContinuation = finalizationSection
      .slice(0, continuationAt)
      .match(/(?:faça|execute|realize)[\s\S]{0,100}(?:deep-review|re-review final|revisão final)/i);
    const reviewAfterContinuation = finalizationSection
      .slice(continuationAt)
      .match(/(?:faça|execute|realize|obter|obtenha)[\s\S]{0,120}(?:deep-review|re-review final|revisão final)/i);

    expect(rebaseFixture.pendingCommits).toBeGreaterThan(0);
    expect(continuationAt).toBeGreaterThanOrEqual(0);
    expect(reviewBeforeContinuation).toBeNull();
    expect(reviewAfterContinuation).not.toBeNull();
  });
});
