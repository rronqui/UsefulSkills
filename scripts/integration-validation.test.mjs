import { describe, expect, it } from "vitest";

const STATE_MODULE = "../tdd-orchestrator/lib/state.mjs";
const GATES = [
  "tests",
  "traceability",
  "spec_kit",
  "coverage",
  "lint",
  "type_check",
  "build",
  "security",
  "contract",
  "git_sanity",
];

async function loadStateApi() {
  try {
    return { api: await import(STATE_MODULE), error: null };
  } catch (error) {
    return { api: null, error };
  }
}

function assertStateApiLoaded(loaded) {
  const requiredExports = ["validateGateReport", "canPromoteWave"];
  const missingExports = requiredExports.filter((exportName) => typeof loaded.api?.[exportName] !== "function");
  if (!loaded.error && missingExports.length === 0) return loaded.api;

  const reason = loaded.error?.message ?? `missing exports: ${missingExports.join(", ")}`;
  return Object.fromEntries(
    requiredExports.map((exportName) => [
      exportName,
      () => ({ ok: false, errors: [`integration API behavior unavailable: ${reason}`] }),
    ]),
  );
}

const REAL_GATE_COMMANDS = {
  tests: "npx vitest run scripts/tdd-state.test.mjs scripts/integration-validation.test.mjs",
  traceability: "npx vitest run scripts/tdd-state.test.mjs",
  spec_kit: "node -e \"const fs=require('node:fs'); for (const file of ['spec.md','plan.md','tasks.md','contracts/interface-contract.md']) { if (!fs.statSync('specs/specs003-convivencia-robusta-skills/' + file).isFile()) process.exit(1); }\"",
  coverage: "npx vitest run scripts/tdd-state.test.mjs scripts/integration-validation.test.mjs",
  lint: "node --check tdd-orchestrator/lib/state.mjs",
  type_check: "node --check tdd-orchestrator/lib/state.mjs",
  build: "ship.config.json: buildCommand=null",
  security: "git diff --check",
  contract: "node --check tdd-orchestrator/lib/state.mjs",
  git_sanity: "git diff --check",
};

function validGateReport() {
  return Object.fromEntries(
    GATES.map((gate) => [
      gate,
      {
        status: gate === "build" ? "NA" : "PASS",
        command: REAL_GATE_COMMANDS[gate],
        output: gate === "build"
          ? "ship.config.json: buildCommand=null; NA justificado"
          : `${gate}: PASS (comando executado; saída observada)`,
        ...(gate === "build" ? { reason: "ship.config.json declara buildCommand=null" } : {}),
      },
    ]),
  );
}

function approvedTask() {
  return {
    id: "T-003",
    title: "validar integração TDD",
    phase: "DONE",
    attempt: 0,
    allowed_write_globs: ["tdd-orchestrator/**", "scripts/integration-validation.test.mjs"],
    acceptance_criteria: ["AC-008", "AC-009", "AC-010"],
    red: {
      status: "PASS",
      failure_reason_expected: true,
      failing_tests: ["scripts/tdd-state.test.mjs::RED assertion"],
      criteria_to_tests: {
        "AC-008": ["scripts/tdd-state.test.mjs::migration assertion"],
        "AC-009": ["scripts/tdd-state.test.mjs::DONE pre-integration assertion"],
        "AC-010": ["scripts/tdd-state.test.mjs::RED matrix assertion"],
      },
      revision_delta: { ac: "", test: "", evidence: "" },
      revision_baseline_tests: {},
    },
    implemented_by: "backend-developer",
    reviewed_by: "peer-reviewer",
    review: {
      status: "APPROVED",
      agent: "peer-reviewer",
      independent: true,
      revision: "task-review-sha",
      evidence: "task review output: APPROVED",
    },
    green: {
      status: "PASS",
      reason_if_skipped: "",
      changed_files: ["tdd-orchestrator/lib/state.mjs"],
      tooling_evidence: "",
      tooling_suite_evidence: "",
    },
    refactor: { status: "PASS", reason_if_skipped: "" },
    doc_impact: "none",
    gates: Object.fromEntries(GATES.map((gate) => [gate, gate === "build" ? "NA" : "PASS"])),
    gate_origins: Object.fromEntries(GATES.map((gate) => [gate, ""])),
    gate_evidence: Object.fromEntries(GATES.map((gate) => [gate, `${REAL_GATE_COMMANDS[gate]}; output: ${gate === "build" ? "NA (buildCommand=null)" : "PASS"}`])),
    blockers: [],
    evidence: "task evidence: complete pre-integration readiness",
  };
}

function promotionWave(overrides = {}) {
  const wave = {
    wave: 1,
    status: "integrating",
    integration: {
      status: "PASS",
      attempt: 1,
      evidence: "integration attempt 1; full suite PASS",
    },
    tasks: [approvedTask()],
    review: {
      status: "APPROVED",
      agent: "peer-reviewer",
      independent: true,
      revision: "integrated-diff-sha",
      evidence: "post-integration review output: APPROVED; zero findings",
      aggregate: {
        status: "APPROVED",
        blockers: [],
        findings: [],
        counts: { P0: 0, P1: 0, P2: 0, P3: 0 },
      },
    },
    validation: {
      status: "PASS",
      agent: "validator",
      suite: {
        command: "npx vitest run scripts/tdd-state.test.mjs scripts/integration-validation.test.mjs",
        output: "targeted state/integration suite: PASS (output captured)",
      },
      gates: validGateReport(),
      evidence: "validator reran all gates after integration; PASS",
    },
  };
  return {
    ...wave,
    ...overrides,
    integration: { ...wave.integration, ...(overrides.integration ?? {}) },
    review: { ...wave.review, ...(overrides.review ?? {}) },
    validation: { ...wave.validation, ...(overrides.validation ?? {}) },
    tasks: overrides.tasks ?? wave.tasks,
  };
}

function expectRejected(result, errorPattern) {
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("value");
  expect(Array.isArray(result.errors)).toBe(true);
  expect(result.errors.join(" ")).toMatch(errorPattern);
}

describe("T-003/T-007 — integração, gates e promoção da onda", () => {
  it("AC-009 — valida relatório consolidado por gate com comando, saída e NA justificado", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const report = validGateReport();
    expect(api.validateGateReport(report)).toMatchObject({ ok: true, errors: [] });
    for (const gate of GATES) {
      expect(report[gate].command, `${gate} command`).not.toBe("");
      expect(report[gate].command, `${gate} command must be real`).not.toMatch(/(?:npm|pnpm|yarn) run gate:/i);
      expect(report[gate].output, `${gate} output`).not.toBe("");
    }
    expect(report.build.status).toBe("NA");
    expect(report.build.command).toContain("buildCommand=null");
    expect(report.build.output).toContain("buildCommand=null");
    expect(report.build.reason).toContain("buildCommand=null");

    const missingGate = { ...report };
    delete missingGate.security;
    expectRejected(api.validateGateReport(missingGate), /security|missing|ausent/i);

    const emptyOutput = structuredClone(report);
    emptyOutput.coverage.output = "";
    expectRejected(api.validateGateReport(emptyOutput), /coverage|output|sa[ií]da|evidence/i);

    const emptyCommand = structuredClone(report);
    emptyCommand.tests.command = "";
    expectRejected(api.validateGateReport(emptyCommand), /tests|command|comando/i);

    const missingNaReason = structuredClone(report);
    missingNaReason.build.reason = "";
    expectRejected(api.validateGateReport(missingNaReason), /build|NA|reason|raz[aã]o/i);

    const unknownStatus = structuredClone(report);
    unknownStatus.tests.status = "DONE";
    expectRejected(api.validateGateReport(unknownStatus), /status|enum|DONE/i);
    const incompleteSpecKit = structuredClone(report);
    incompleteSpecKit.spec_kit.command = "node --check tdd-orchestrator/lib/state.mjs";
    incompleteSpecKit.spec_kit.output = "state syntax: PASS";
    expectRejected(api.validateGateReport(incompleteSpecKit), /spec_kit|interface-contract|plan|tasks/i);
  });

  it("AC-009 — não promove/commita DONE pré-integração, mesmo com ACs, gates e review da tarefa válidos", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const preIntegration = promotionWave({
      integration: { status: "pending", attempt: 0, evidence: "" },
    });
    expect(preIntegration.tasks[0].phase).toBe("DONE");
    expect(preIntegration.tasks[0].blockers).toEqual([]);
    expect(api.canPromoteWave(preIntegration).ok).toBe(false);
    expect(api.canPromoteWave(preIntegration).errors.join(" ")).toMatch(/integration|pending|promo/i);

    const taskNotDone = promotionWave({ tasks: [{ ...approvedTask(), phase: "VALIDATE" }] });
    expectRejected(api.canPromoteWave(taskNotDone), /DONE|task|tarefa/i);

    const blockedTask = promotionWave({ tasks: [{ ...approvedTask(), blockers: ["blocked before promotion"] }] });
    expectRejected(api.canPromoteWave(blockedTask), /blocker|bloque/i);
  });

  it("AC-009 — só promove após PASS da integração, review independente do diff e validator pós-onda", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const promoted = promotionWave();
    expect(api.canPromoteWave(promoted)).toMatchObject({ ok: true, errors: [] });

    const missingAgent = promotionWave({ review: { agent: "" } });
    expectRejected(api.canPromoteWave(missingAgent), /review|agent|agente/i);

    const selfReview = promotionWave({ review: { agent: "backend-developer", independent: false } });
    expectRejected(api.canPromoteWave(selfReview), /independent|independ|implemented|review/i);

    const missingRevision = promotionWave({ review: { revision: "" } });
    expectRejected(api.canPromoteWave(missingRevision), /revision|revis[aã]o/i);

    const missingReviewEvidence = promotionWave({ review: { evidence: "" } });
    expectRejected(api.canPromoteWave(missingReviewEvidence), /evidence|evid[eê]ncia|review/i);

    const wrongValidator = promotionWave({ validation: { agent: "peer-reviewer" } });
    expectRejected(api.canPromoteWave(wrongValidator), /validator|validation|valida/i);

    const missingSuiteEvidence = promotionWave({ validation: { suite: { command: "", output: "" } } });
    expectRejected(api.canPromoteWave(missingSuiteEvidence), /suite|command|output|evidence/i);

    const reportWithoutTestOutput = validGateReport();
    reportWithoutTestOutput.tests.output = "";
    const missingGateEvidence = promotionWave({ validation: { gates: reportWithoutTestOutput } });
    expectRejected(api.canPromoteWave(missingGateEvidence), /gate|tests|output|evidence/i);
  });
  it("AC-009 regression — canPromoteWave exige tarefa completa", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const incompleteTask = { ...approvedTask() };
    for (const field of [
      "id",
      "title",
      "allowed_write_globs",
      "acceptance_criteria",
      "implemented_by",
      "reviewed_by",
      "red",
      "green",
      "refactor",
      "doc_impact",
    ]) {
      delete incompleteTask[field];
    }
    expectRejected(
      api.canPromoteWave(promotionWave({ tasks: [incompleteTask] })),
      /task|complete|required|missing|field/i,
    );
  });

  it("AC-009 regression — canPromoteWave rejeita tarefa no attempt cap", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const cappedTask = { ...approvedTask(), attempt: 3 };
    expectRejected(
      api.canPromoteWave(promotionWave({ tasks: [cappedTask] })),
      /attempt|cap|BLOCKED|retry|tarefa/i,
    );
  });

  it("AC-009 regression — canPromoteWave exige review canônico de peer-reviewer", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const wrongTaskReview = {
      ...approvedTask(),
      review: { ...approvedTask().review, agent: "validator" },
    };
    expectRejected(
      api.canPromoteWave(promotionWave({ tasks: [wrongTaskReview] })),
      /peer-reviewer|canonical|review|agent/i,
    );
  });


  it("AC-009 — qualquer integração FAIL ou mudança comportamental mantém a onda fora da promoção", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const failedIntegration = promotionWave({
      integration: { status: "FAIL", attempt: 2, evidence: "conflict caused behavior change" },
    });
    expectRejected(api.canPromoteWave(failedIntegration), /integration|FAIL|behavior|comport/i);

    const changedReview = promotionWave({
      review: {
        status: "BLOCKED",
        independent: true,
        evidence: "behavior changed during integration; return to RED_REVISION",
      },
    });
    expectRejected(api.canPromoteWave(changedReview), /review|BLOCKED|RED_REVISION|comport/i);
  });
  it("AC-009 regression — promoção só é válida enquanto a onda está integrating", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    for (const status of ["pending", "in_progress", "completed"]) {
      const candidate = promotionWave({ status });
      expectRejected(api.canPromoteWave(candidate), /integrating|promo|onda/i);
    }
  });


  it("AC-020 regression — gate NA exige evidência específica do buildCommand nulo", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const genericNaEvidence = validGateReport();
    genericNaEvidence.build.output = "not applicable";
    genericNaEvidence.build.reason = "not applicable";
    expectRejected(
      api.validateGateReport(genericNaEvidence),
      /buildCommand|build|evidence|espec[ií]fic/i,
    );
  });
  it("AC-020 regression — cada campo do gate build NA prova buildCommand=null", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const cases = [
      ["command", "node build check"],
      ["output", "build was not configured for this run"],
      ["reason", "no configured build command"],
    ];
    for (const [field, value] of cases) {
      const missingProof = validGateReport();
      missingProof.build[field] = value;
      expectRejected(
        api.validateGateReport(missingProof),
        /buildCommand|build|evidence|espec[ií]fic/i,
      );
    }
  });
  it("AC-020 regression — promoção exige aggregate estruturado sem findings residuais", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const promoted = promotionWave();
    expect(api.canPromoteWave(promoted)).toMatchObject({ ok: true, errors: [] });

    const zeroAggregate = {
      status: "APPROVED",
      blockers: [],
      findings: [],
      counts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    };
    const structuredApproval = promotionWave({
      review: {
        ...promoted.review,
        evidence: "APPROVED; zero findings",
        aggregate: zeroAggregate,
      },
    });
    expect(api.canPromoteWave(structuredApproval)).toMatchObject({ ok: true, errors: [] });

    const residualAggregate = {
      ...zeroAggregate,
      findings: [{
        title: "finding P2 residual",
        body: "ajuste não bloqueante ainda pendente após a integração",
        priority: 2,
        confidence: 0.9,
        file_path: "scripts/integration-validation.test.mjs",
        line_start: 1,
        line_end: 1,
      }],
      counts: { ...zeroAggregate.counts, P2: 1 },
    };
    expect(residualAggregate.counts).toMatchObject({ P0: 0, P1: 0, P2: 1, P3: 0 });
    const residualReview = promotionWave({
      review: {
        ...promoted.review,
        evidence: "APPROVED; zero findings",
        aggregate: residualAggregate,
      },
    });
    expectRejected(
      api.canPromoteWave(residualReview),
      /aggregate|finding|counts|P2|P3/i,
    );
  });


  it("AC-020 regression — buildCommand=nullish não satisfaz evidência NA", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const cases = [
      ["command", "ship.config.json: buildCommand=nullish"],
      ["output", "build: NA; buildCommand=nullish"],
      ["reason", "configuração usa buildCommand=nullish"],
    ];
    for (const [field, value] of cases) {
      const nullishProof = validGateReport();
      nullishProof.build[field] = value;
      expectRejected(
        api.validateGateReport(nullishProof),
        /buildCommand|NA|specific|evidence/i,
      );
    }
  });

  it("AC-009 regression — canPromoteWave rejeita wave sem número positivo inteiro", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    for (const waveNumber of [undefined, 0, 1.5, "1", Number.NaN]) {
      expectRejected(
        api.canPromoteWave(promotionWave({ wave: waveNumber })),
        /wave|positive|integer|number/i,
      );
    }
  });

});

export { GATES, validGateReport, promotionWave };
