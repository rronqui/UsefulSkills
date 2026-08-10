import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(repoRoot, "deep-review", "SKILL.md");
const reviewerPath = join(repoRoot, "deep-review", "agents", "deep-reviewer.md");
const fallbackReviewerPath = join(repoRoot, "tdd-orchestrator", "agents", "peer-reviewer.md");
const skill = readFileSync(skillPath, "utf8");
const reviewer = readFileSync(reviewerPath, "utf8");
const fallbackReviewer = readFileSync(fallbackReviewerPath, "utf8");
const protocol = `${skill}\n${reviewer}`;

// Fixtures are deliberately static: no GitHub/gh/network access is needed to
// validate that the normative protocol exposes each fail-closed decision.
function withoutField(value, field) {
  const copy = { ...value };
  delete copy[field];
  return copy;
}

function reviewerResultIsComplete(result) {
  if (!result || typeof result !== "object") return false;
  if (typeof result.agent !== "string" || result.agent.trim() === "") return false;
  if (result.status !== "VALID") return false;
  if (typeof result.reviewed_revision !== "string" || result.reviewed_revision.trim() === "") return false;
  if (!["correct", "incorrect"].includes(result.overall_correctness)) return false;
  if (typeof result.explanation !== "string" || result.explanation.trim() === "") return false;
  if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) return false;
  if (!Array.isArray(result.findings)) return false;
  return result.findings.every((finding) => {
    if (!finding || typeof finding !== "object") return false;
    if (typeof finding.title !== "string" || finding.title.trim() === "") return false;
    if (typeof finding.body !== "string" || finding.body.trim() === "") return false;
    if (!Number.isInteger(finding.priority) || finding.priority < 0 || finding.priority > 3) return false;
    if (!Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) return false;
    if (typeof finding.file_path !== "string" || finding.file_path.trim() === "") return false;
    if (!Number.isInteger(finding.line_start) || !Number.isInteger(finding.line_end)) return false;
    return finding.line_start >= 1
      && finding.line_end >= finding.line_start
      && finding.line_end - finding.line_start + 1 <= 10;
  });
}

const validRound = Object.freeze({
  agent: "deep-reviewer",
  status: "VALID",
  reviewed_revision: "sha-valid",
  overall_correctness: "incorrect",
  explanation: "The patch leaves an authorization bypass reachable from the consumer boundary.",
  confidence: 0.96,
  findings: [
    {
      title: "Reject unsigned session tokens",
      body: "When the token signature is absent, the consumer accepts the session and permits authenticated operations.",
      priority: 0,
      confidence: 0.99,
      file_path: "src/auth.mjs",
      line_start: 10,
      line_end: 10,
    },
    {
      title: "Serialize writes before updating the index",
      body: "Concurrent writes can observe a stale index and overwrite a newer record under load.",
      priority: 1,
      confidence: 0.91,
      file_path: "src/db.mjs",
      line_start: 20,
      line_end: 21,
    },
    {
      title: "Handle an empty cache response",
      body: "An empty cache response reaches the parser and produces a recoverable error instead of a cache miss.",
      priority: 2,
      confidence: 0.82,
      file_path: "src/cache.mjs",
      line_start: 30,
      line_end: 31,
    },
    {
      title: "Include the request identifier in logs",
      body: "The request identifier is omitted from this diagnostic path, which makes one class of incidents harder to correlate.",
      priority: 3,
      confidence: 0.74,
      file_path: "src/log.mjs",
      line_start: 40,
      line_end: 40,
    },
  ],
});

const invalidResults = Object.freeze([
  {
    kind: "missing-reviewer",
    status: "BLOCKED",
    diagnostic: "expected deep-reviewer result is absent",
    result: { reviewers: [] },
  },
  {
    kind: "missing-verdict",
    status: "BLOCKED",
    diagnostic: "deep-reviewer returned no overall correctness verdict",
    result: withoutField(validRound, "overall_correctness"),
  },
  {
    kind: "invalid-schema",
    status: "BLOCKED",
    diagnostic: "deep-reviewer returned an unsupported verdict enum",
    result: { ...validRound, overall_correctness: "maybe" },
  },
  {
    kind: "incomplete-finding",
    status: "BLOCKED",
    diagnostic: "finding is missing its required fields",
    result: { ...validRound, findings: [{ priority: 1 }] },
  },
  {
    kind: "timeout",
    status: "BLOCKED",
    diagnostic: "deep-reviewer timed out before returning a result",
    result: null,
  },
  {
    kind: "missing-explanation",
    status: "BLOCKED",
    diagnostic: "verdict explanation is absent",
    result: { ...validRound, explanation: "" },
  },
  {
    kind: "missing-verdict-confidence",
    status: "BLOCKED",
    diagnostic: "verdict confidence is absent",
    result: withoutField(validRound, "confidence"),
  },
  {
    kind: "finding-missing-title",
    status: "BLOCKED",
    diagnostic: "finding title is absent",
    result: {
      ...validRound,
      findings: [{ ...validRound.findings[0], title: "" }],
    },
  },
  {
    kind: "finding-missing-body",
    status: "BLOCKED",
    diagnostic: "finding body is absent",
    result: {
      ...validRound,
      findings: [{ ...validRound.findings[0], body: "" }],
    },
  },
  {
    kind: "finding-missing-confidence",
    status: "BLOCKED",
    diagnostic: "finding confidence is absent",
    result: {
      ...validRound,
      findings: [withoutField(validRound.findings[0], "confidence")],
    },
  },
]);

const prRound = Object.freeze({
  mode: "PR",
  repository: "owner/repo",
  pull_request: 30,
  patch_source: { kind: "pr-uri", uri: "pr://owner/repo/30/diff/all", sha: "sha-remote" },
  consumer_context: { revision: "sha-remote", files: ["src/consumer.mjs"] },
  local_workspace_patch: "sha-local-different",
});

const prContextCases = Object.freeze([
  {
    kind: "matching-consumer-sha",
    ...prRound,
    expected_status: "VALID",
    diagnostic: "",
  },
  {
    kind: "missing-consumer-sha",
    ...prRound,
    consumer_context: { files: ["src/consumer.mjs"] },
    expected_status: "BLOCKED",
    diagnostic: "consumer_context.revision is missing",
  },
  {
    kind: "divergent-consumer-sha",
    ...prRound,
    consumer_context: { revision: "sha-local-different", files: ["src/consumer.mjs"] },
    expected_status: "BLOCKED",
    diagnostic: "consumer_context.revision diverges from the remote patch SHA",
  },
]);

const remoteFailureCases = Object.freeze([
  {
    kind: "remote-empty",
    ...prRound,
    patch_source: { ...prRound.patch_source, content: " \n\t" },
    expected_status: "BLOCKED",
    diagnostic: "remote PR patch is empty",
  },
  {
    kind: "remote-error",
    ...prRound,
    patch_source: { ...prRound.patch_source, error: "gh pr diff failed" },
    expected_status: "BLOCKED",
    diagnostic: "remote PR patch could not be fetched",
  },
]);

const nonPrContext = Object.freeze({
  mode: "BRANCH",
  revision: "sha-branch",
  patch_source: null,
  consumer_context: null,
  workspace_patch: "workspace-head",
});

const fallbackRound = Object.freeze({
  agent: "peer-reviewer",
  status: "VALID",
  reviewed_revision: "sha-valid",
  overall_correctness: "correct",
  explanation: "The named fallback reviewed the same revision and found no blocking defect.",
  confidence: 0.88,
  findings: [validRound.findings[2]],
});

const normalizedRound = Object.freeze({
  status: "BLOCKED",
  reviewed_revision: "sha-valid",
  blockers: [validRound.findings[0], validRound.findings[1]],
  findings: [...validRound.findings],
  counts: { P0: 1, P1: 1, P2: 1, P3: 1 },
  reviewers: ["deep-reviewer"],
  fallback_agent: "",
});

const nonBlockingNormalizedRound = Object.freeze({
  status: "APPROVED",
  reviewed_revision: "sha-valid",
  blockers: [],
  findings: [validRound.findings[2], validRound.findings[3]],
  counts: { P0: 0, P1: 0, P2: 1, P3: 1 },
  reviewers: ["deep-reviewer"],
  fallback_agent: "",
});

const agentFixtures = Object.freeze({
  project: { "deep-reviewer": "project/deep-reviewer.md" },
  user: { "deep-reviewer": "user/deep-reviewer.md" },
  fallback: { "peer-reviewer": "tdd-orchestrator/agents/peer-reviewer.md" },
});

function expectRule(label, expression) {
  expect(protocol, `${label}: regra ausente em ${skillPath} ou ${reviewerPath}`).toMatch(expression);
}

function expectSkillRule(label, expression) {
  expect(skill, `${label}: regra ausente em ${skillPath}`).toMatch(expression);
}

describe("deep-review — protocolo normativo T-002", () => {
  it("AC-005: agente deep-reviewer possui frontmatter fechado e corpo separado", () => {
    const lines = reviewer.split(/\r?\n/);
    const closingDelimiter = lines.indexOf("---", 1);

    expect(lines[0]).toBe("---");
    expect(closingDelimiter).toBeGreaterThan(1);
    expect(lines.slice(closingDelimiter + 1).join("\n")).toMatch(/<procedure>/);
  });
  it("AC-011: findings usa schema opcional incremental nos dois agentes normalizados", () => {
    for (const content of [reviewer, fallbackReviewer]) {
      const lines = content.split(/\r?\n/);
      const optionalProperties = lines.findIndex((line) => line === "  optionalProperties:");
      const findings = lines.findIndex((line) => line === "    findings:");

      expect(optionalProperties).toBeGreaterThan(-1);
      expect(findings).toBeGreaterThan(optionalProperties);
    }
    expectSkillRule(
      "ausência nativa de findings é normalizada",
      /schema nativo[\s\S]{0,300}normalizar[\s\S]{0,120}findings:\s*\[\]/i,
    );

  });
  it("AC-012: yield de identidade e veredito usa seções escalares separadas", () => {
    expect(reviewer).toMatch(/one scalar value per call/i);
    expect(reviewer).toMatch(/Never combine section names in one `type` array/i);
    expect(reviewer).toMatch(/result\.data[\s\S]{0,100}complete result object/i);
    expect(fallbackReviewer).toMatch(/protocol_mode[\s\S]{0,120}DEEP_REVIEW_FALLBACK/i);
    expect(skill).toMatch(/type: \["agent"\][\s\S]{0,180}type: \["status"\]/i);
  });



  it("AC-006: bloqueia apenas findings válidos P0/P1 e retém P2/P3 com localização e contagem", () => {
    expect(reviewerResultIsComplete(validRound)).toBe(true);
    expect(validRound.findings.map(({ priority }) => priority)).toEqual([0, 1, 2, 3]);
    expect(validRound.explanation.trim()).not.toBe("");
    expect(validRound.confidence).toBeGreaterThanOrEqual(0);
    expect(validRound.confidence).toBeLessThanOrEqual(1);
    validRound.findings.forEach((finding) => {
      expect(finding.title.trim()).not.toBe("");
      expect(finding.body.trim()).not.toBe("");
      expect(finding.confidence).toBeGreaterThanOrEqual(0);
      expect(finding.confidence).toBeLessThanOrEqual(1);
    });

    expect(normalizedRound.reviewed_revision).toBe(validRound.reviewed_revision);
    expect(normalizedRound.blockers.map(({ priority }) => priority)).toEqual([0, 1]);
    expect(normalizedRound.blockers).toEqual(validRound.findings.slice(0, 2));
    expect(normalizedRound.findings).toEqual(validRound.findings);
    expect(normalizedRound.counts).toEqual({ P0: 1, P1: 1, P2: 1, P3: 1 });

    const retained = normalizedRound.findings.filter(({ priority }) => priority >= 2);
    expect(retained.map(({ priority }) => priority)).toEqual([2, 3]);
    retained.forEach((finding) => {
      expect(finding.file_path).toMatch(/\S/);
      expect(finding.line_start).toBeGreaterThan(0);
      expect(finding.line_end - finding.line_start + 1).toBeLessThanOrEqual(10);
    });

    expect(nonBlockingNormalizedRound.status).toBe("APPROVED");
    expect(nonBlockingNormalizedRound.blockers).toEqual([]);
    expect(nonBlockingNormalizedRound.findings.map(({ priority }) => priority)).toEqual([2, 3]);
    expect(nonBlockingNormalizedRound.counts).toEqual({ P0: 0, P1: 0, P2: 1, P3: 1 });

    expectRule(
      "veredito exige explanation e confidence",
      /(?:veredito|resultado)[\s\S]{0,600}explanation[\s\S]{0,260}confidence/i,
    );
    expectRule(
      "finding exige title/body/confidence",
      /(?:formato de cada achado|finding)[\s\S]{0,600}title[\s\S]{0,260}body[\s\S]{0,260}confidence/i,
    );
    expectRule(
      "P0/P1 válidos são os únicos blockers",
      /(?:somente|apenas|only)\s+(?:achados?\s+)?(?:v[aá]lidos?\s+)?P0\s*(?:\/|e)\s*P1[^.\n]{0,180}(?:bloque|block)/i,
    );
    expectRule(
      "P2/P3 ficam no relatório",
      /P2\s*(?:\/|e)\s*P3[^.\n]{0,220}(?:retid|relat|report)[^.\n]{0,220}(?:localiza|location)[^.\n]{0,220}(?:contagem|count)/i,
    );
    expectSkillRule(
      "relatório separa blockers de findings",
      /`blockers`[^\n]{0,180}P0[^\n]{0,180}P1[\s\S]{0,500}`findings`[^\n]{0,180}P2[^\n]{0,180}P3/i,
    );
  });

  it("AC-007: ausência, timeout, veredito/schema inválido e finding incompleto bloqueiam sem inferir aprovação", () => {
    expect(invalidResults).toHaveLength(10);
    invalidResults.forEach((invalidCase) => {
      expect(invalidCase.status).toBe("BLOCKED");
      expect(invalidCase.diagnostic.trim()).not.toBe("");
      expect(reviewerResultIsComplete(invalidCase.result)).toBe(false);
    });

    const invalidCases = [
      /revisor(?:\s+esperado)?[^.\n]{0,100}(?:ausente|falt|missing)[^.\n]{0,160}(?:BLOCKED|bloque)/i,
      /(?:sem|ausente|missing)[^.\n]{0,40}veredito[^.\n]{0,160}(?:BLOCKED|bloque)/i,
      /schema[^.\n]{0,80}(?:inv[aá]lid|invalid)[^.\n]{0,160}(?:BLOCKED|bloque)/i,
      /finding[^.\n]{0,60}(?:incompleto|incomplete)[^.\n]{0,160}(?:BLOCKED|bloque)/i,
      /timeout[\s\S]{0,220}(?:BLOCKED|bloque)/i,
    ];
    invalidCases.forEach((expression, index) => {
      expectRule(`resultado inválido ${index + 1} é fail-closed`, expression);
    });
    expectRule(
      "campos de veredito são obrigatórios",
      /(?:status|veredito)[\s\S]{0,700}(?:explanation|confidence)[\s\S]{0,500}(?:obrigat|must|required)/i,
    );
    expectRule(
      "campos do finding são obrigatórios",
      /(?:achado|finding)[\s\S]{0,500}(?:title|título)[\s\S]{0,300}(?:body|corpo)[\s\S]{0,300}confidence[\s\S]{0,300}(?:obrigat|must|required)/i,
    );
    expectRule("diagnóstico é preservado ao bloquear", /BLOCKED[^.\n]{0,180}(?:preserv|mant[eé]m)[^.\n]{0,120}diagn[oó]stic/i);
    expectRule("não infere correct/aprovação", /(?:n[aã]o|never|must not)[^.\n]{0,100}(?:infer|assum)[^.\n]{0,100}(?:correct|aprova)/i);
  });

  it("AC-008: assignment PR usa somente patch remoto e bloqueia fonte remota vazia/falha sem fallback local", () => {
    expect(prRound.patch_source.kind).toBe("pr-uri");
    expect(prRound.consumer_context.revision).toBe(prRound.patch_source.sha);
    expect(prRound.local_workspace_patch).not.toBe(prRound.patch_source.sha);
    expect(remoteFailureCases).toHaveLength(2);
    remoteFailureCases.forEach((failureCase) => {
      expect(failureCase.mode).toBe("PR");
      expect(failureCase.expected_status).toBe("BLOCKED");
      expect(failureCase.diagnostic.trim()).not.toBe("");
      expect(failureCase.local_workspace_patch).not.toBe(failureCase.patch_source.sha);
      expect(failureCase.patch_source.content ?? failureCase.patch_source.error).toBeTruthy();
    });
    expect(nonPrContext.mode).toBe("BRANCH");
    expect(nonPrContext.patch_source).toBeNull();

    expectSkillRule("request explicita patch_source remoto", /patch_source[\s\S]{0,240}(?:remote|remot|gh pr diff|pr:\/\/)/i);
    expectSkillRule("assignment PR referencia gh pr diff/pr-uri", /PR[^\n]{0,240}(?:gh pr diff|pr:\/\/[^\s`]+\/diff\/)/i);
    expectSkillRule("workspace local é só contexto do consumidor", /workspace local[^.\n]{0,120}(?:somente|apenas|only)[^.\n]{0,100}(?:contexto|consumer)/i);
    expectRule(
      "patch remoto vazio bloqueia",
      /(?:fonte|source)[^.\n]{0,100}(?:remot|remote)[^.\n]{0,140}(?:vazi|empty)[^.\n]{0,180}(?:BLOCKED|bloque)/i,
    );
    expectRule(
      "erro de patch remoto bloqueia",
      /(?:fonte|source|patch)[^.\n]{0,100}(?:remot|remote)[^.\n]{0,140}(?:falh|indispon[ií]vel|error|unavailable)[^.\n]{0,180}(?:BLOCKED|bloque)/i,
    );
    expectRule(
      "patch local diferente nunca substitui o remoto",
      /(?:nunca|never|n[aã]o)[^.\n]{0,100}(?:usar|usa|use|fallback|substitut)[^.\n]{0,120}(?:patch|workspace)[^.\n]{0,120}(?:local)/i,
    );
    expectSkillRule(
      "fonte remota é exigida somente no modo PR",
      /(?:somente|apenas|only)[^.\n]{0,100}(?:modo\s+PR|PR)[^.\n]{0,180}(?:patch_source|fonte\s+remota)/i,
    );
  });

  it("AC-009: SHA da revisão é obtido, registrado e fixado no contexto do consumidor; ausência/divergência bloqueia", () => {
    const matching = prContextCases.find(({ kind }) => kind === "matching-consumer-sha");
    const missing = prContextCases.find(({ kind }) => kind === "missing-consumer-sha");
    const divergent = prContextCases.find(({ kind }) => kind === "divergent-consumer-sha");

    expect(matching.patch_source.sha).toBe("sha-remote");
    expect(matching.consumer_context.revision).toBe(matching.patch_source.sha);
    expect(missing.consumer_context.revision).toBeUndefined();
    expect(missing.expected_status).toBe("BLOCKED");
    expect(divergent.consumer_context.revision).not.toBe(divergent.patch_source.sha);
    expect(divergent.expected_status).toBe("BLOCKED");
    expect(divergent.diagnostic).toMatch(/diverg/i);
    expect(normalizedRound.reviewed_revision).toBe(validRound.reviewed_revision);

    expectSkillRule("request registra SHA do patch", /patch_source[\s\S]{0,240}(?:sha|head-sha)/i);
    expectSkillRule("contexto do consumidor declara revisão", /consumer[_ -]?context[^\n]{0,180}(?:revision|revis[aã]o)/i);
    expectRule(
      "consumidor é fixado na mesma revisão",
      /(?:fix|prend|amar|pin|lock)[^.\n]{0,120}(?:SHA|sha|revision|revis[aã]o)[^.\n]{0,180}(?:consumidor|consumer context)/i,
    );
    expectRule(
      "SHA ausente, divergente ou não resolvível bloqueia",
      /(?:SHA|sha|revis[aã]o)[^.\n]{0,160}(?:ausent|diverg|imposs[ií]vel|unresolv|missing)[^.\n]{0,180}(?:BLOCKED|bloque)/i,
    );
  });

  it("AC-010: resolve project > user, fallback peer-reviewer nomeado com protocolo/schema/limiar idênticos e bloqueio sem agentes", () => {
    expect(agentFixtures.project["deep-reviewer"]).toContain("project");
    expect(agentFixtures.user["deep-reviewer"]).toContain("user");
    expect(agentFixtures.fallback["peer-reviewer"]).toContain("peer-reviewer");
    expect(fallbackRound.agent).toBe("peer-reviewer");
    expect(fallbackRound.status).toBe("VALID");
    expect(fallbackRound.reviewed_revision).toBe(validRound.reviewed_revision);
    expect(reviewerResultIsComplete(fallbackRound)).toBe(true);
    expect(fallbackRound.findings[0]).toMatchObject({
      title: expect.any(String),
      body: expect.any(String),
      confidence: expect.any(Number),
    });

    expectSkillRule(
      "precedência project > user é explícita",
      /(?:resolu[cç][aã]o|resolver|resolve)[^.\n]{0,120}deep-reviewer[^.\n]{0,220}(?:project|projeto)[^\.\n]{0,120}(?:>|depois|before)[^.\n]{0,120}(?:user|usu[aá]rio)/i,
    );
    expectRule(
      "fallback é peer-reviewer nomeado",
      /peer-reviewer[^.\n]{0,220}(?:fallback|reserva)[^.\n]{0,180}(?:nomead|named)/i,
    );
    expectRule(
      "fallback recebe protocolo completo e mesmo schema",
      /peer-reviewer[\s\S]{0,500}(?:protocolo completo|full protocol)[\s\S]{0,500}(?:mesmo|id[eê]ntic)[^.\n]{0,100}schema/i,
    );
    expectRule(
      "fallback preserva limiar P0/P1",
      /peer-reviewer[\s\S]{0,700}(?:P0\s*(?:\/|e)\s*P1)[\s\S]{0,180}(?:limiar|threshold|blocker)/i,
    );
    expectRule(
      "nenhum agente nomeado disponível bloqueia",
      /(?:nenhum|nenhuma|none)[^.\n]{0,160}(?:deep-reviewer|peer-reviewer)[^.\n]{0,180}(?:BLOCKED|bloque)/i,
    );
    expectRule(
      "fallback anônimo ou genérico é proibido",
      /(?:nunca|never|n[aã]o)[^.\n]{0,120}(?:fallback|agente)[^.\n]{0,120}(?:an[oô]nim|anonymous|gen[eé]ric)/i,
    );
    expect(fallbackReviewer, "fallback schema deve declarar reviewed_revision").toMatch(/reviewed_revision/);
    expect(fallbackReviewer, "fallback schema deve declarar status VALID").toMatch(/status[^\n]{0,100}VALID/);
    expect(fallbackReviewer, "fallback schema deve declarar a identidade peer-reviewer").toMatch(/peer-reviewer/);
    expect(fallbackReviewer, "fallback schema deve declarar explanation/confidence").toMatch(/explanation[\s\S]{0,180}confidence/);
    expect(fallbackReviewer, "fallback schema deve declarar findings title/body/confidence").toMatch(
      /findings[\s\S]{0,500}title[\s\S]{0,180}body[\s\S]{0,180}confidence/,
    );
    expect(reviewer, "schema do agente deve incluir revisão e validade normalizadas").toMatch(/reviewed_revision/);
    expect(reviewer, "schema do agente deve registrar status VALID").toMatch(/status[^\n]{0,80}VALID/);
  });
});
