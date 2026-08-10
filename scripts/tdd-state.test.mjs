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
const ACCEPTANCE_CRITERIA = ["AC-008", "AC-009", "AC-010"];
const VALID_GATE_ORIGINS = ["", "TESTE", "CODIGO", "TOOLING", "REFACTOR", "SPEC-CONTRATO"];

async function loadStateApi() {
  try {
    return { api: await import(STATE_MODULE), error: null };
  } catch (error) {
    return { api: null, error };
  }
}

function assertStateApiLoaded(loaded) {
  const requiredExports = [
    "migrateProgress",
    "validateProgress",
    "validateCriteriaMatrix",
    "validateGateReport",
    "canPromoteWave",
  ];
  const missingExports = requiredExports.filter((exportName) => typeof loaded.api?.[exportName] !== "function");
  if (!loaded.error && missingExports.length === 0) return loaded.api;

  const reason = loaded.error?.message ?? `missing exports: ${missingExports.join(", ")}`;
  return Object.fromEntries(
    requiredExports.map((exportName) => [
      exportName,
      () => ({ ok: false, errors: [`state API behavior unavailable: ${reason}`] }),
    ]),
  );
}

function gateValues(status = "pending") {
  return Object.fromEntries(GATES.map((gate) => [gate, status]));
}

function gateOrigins(value = "") {
  return Object.fromEntries(GATES.map((gate) => [gate, value]));
}

function gateEvidence(value = "") {
  return Object.fromEntries(GATES.map((gate) => [
    gate,
    gate === "spec_kit" && value
      ? `${value}; spec.md; plan.md; tasks.md; contracts/interface-contract.md`
      : value,
  ]));
}

function criteriaMatrix() {
  return Object.fromEntries(
    ACCEPTANCE_CRITERIA.map((ac) => [ac, [`scripts/tdd-state.test.mjs::${ac} behavior`]]),
  );
}

function pendingReview() {
  return {
    status: "PENDING",
    agent: "",
    independent: false,
    revision: "",
    evidence: "",
  };
}

function approvedTaskReview() {
  return {
    status: "APPROVED",
    agent: "peer-reviewer",
    independent: true,
    revision: "task-review-sha",
    evidence: "peer-reviewer output: APPROVED",
  };
}

function makeTask(overrides = {}) {
  const task = {
    id: "T-003",
    title: "validar estado TDD",
    phase: "VALIDATE",
    attempt: 0,
    allowed_write_globs: ["scripts/tdd-state.test.mjs", "scripts/integration-validation.test.mjs"],
    acceptance_criteria: [...ACCEPTANCE_CRITERIA],
    implemented_by: "backend-developer",
    reviewed_by: "peer-reviewer",
    review: pendingReview(),
    red: {
      status: "PENDING",
      failing_tests: [],
      failure_reason_expected: false,
      criteria_to_tests: criteriaMatrix(),
      revision_delta: { ac: "", test: "", evidence: "" },
      revision_baseline_tests: {},
    },
    green: {
      status: "PENDING",
      reason_if_skipped: "",
      changed_files: [],
      tooling_evidence: "",
      tooling_suite_evidence: "",
    },
    refactor: { status: "PENDING", reason_if_skipped: "" },
    doc_impact: "none",
    gates: gateValues(),
    gate_origins: gateOrigins(),
    gate_evidence: gateEvidence(),
    blockers: [],
    evidence: "",
  };
  return {
    ...task,
    ...overrides,
    review: { ...task.review, ...(overrides.review ?? {}) },
    red: { ...task.red, ...(overrides.red ?? {}) },
    green: { ...task.green, ...(overrides.green ?? {}) },
    refactor: { ...task.refactor, ...(overrides.refactor ?? {}) },
    gates: { ...task.gates, ...(overrides.gates ?? {}) },
    gate_origins: { ...task.gate_origins, ...(overrides.gate_origins ?? {}) },
    gate_evidence: { ...task.gate_evidence, ...(overrides.gate_evidence ?? {}) },
  };
}

function makeProgress(overrides = {}) {
  const task = makeTask();
  const progress = {
    schema_version: "2.2",
    run_id: "2026-08-10T00:00:00.000Z",
    task_source: "TASKS.md",
    updated_at: "2026-08-10T00:00:00.000Z",
    repo: {
      branch_start: "main",
      branch_work: "fix/36-corrigir-integracao-robusta-das-skills",
      merge_target: "main",
      delivery: "internal",
      merge_status: "",
      pr_url: "",
      head_start: "abc123",
      head_current: "def456",
      dirty_at_start: false,
    },
    baseline: {
      status: "PASS",
      tests: "PASS",
      tests_evidence: "npm test -- --runInBand; 194 passed",
      build: "NA",
      build_evidence: "buildCommand=null; NA justificado",
      override_approved: false,
      known_failures: [{ gate: "build", reason: "buildCommand=null", evidence: "ship.config.json" }],
    },
    spec_kit: {
      spec: "./specs/specs003-convivencia-robusta-skills/spec.md",
      plan: "./specs/specs003-convivencia-robusta-skills/plan.md",
      tasks: "./specs/specs003-convivencia-robusta-skills/tasks.md",
      status: "WRITTEN",
      written_at: "2026-08-10T00:00:00.000Z",
      mode: "updated_in_place",
    },
    contract: {
      file: "./specs/specs003-convivencia-robusta-skills/contracts/interface-contract.md",
      version: "0.1.0",
      status: "DRAFT",
      na_reason: "",
    },
    acceptance_criteria: ACCEPTANCE_CRITERIA.map((id) => ({
      id,
      desc: `${id} behavior`,
      source: "./specs/specs003-convivencia-robusta-skills/spec.md#criterios-de-aceite",
      tasks: ["T-003"],
      status: "VALIDATED",
    })),
    waves: [
      {
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [task],
      },
    ],
  };

  return {
    ...progress,
    ...overrides,
    repo: { ...progress.repo, ...(overrides.repo ?? {}) },
    baseline: { ...progress.baseline, ...(overrides.baseline ?? {}) },
    contract: { ...progress.contract, ...(overrides.contract ?? {}) },
    waves: overrides.waves ?? progress.waves,
    acceptance_criteria: overrides.acceptance_criteria ?? progress.acceptance_criteria,
  };
}

function makeLegacy21Progress() {
  const progress = makeProgress();
  const task = progress.waves[0].tasks[0];
  progress.schema_version = "2.1";
  progress.repo.branch = progress.repo.branch_work;
  delete progress.repo.branch_work;
  task.reviewer = task.reviewed_by;
  delete task.reviewed_by;
  delete task.review;
  task.gates.rastreabilidade = task.gates.traceability;
  delete task.gates.traceability;
  delete progress.waves[0].integration.attempt;
  return progress;
}

function expectAccepted(result) {
  expect(result).toMatchObject({ ok: true, errors: [] });
  expect(result.value).toBeDefined();
  return result.value;
}

function expectRejected(result, errorPattern) {
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("value");
  expect(Array.isArray(result.errors)).toBe(true);
  expect(result.errors.join(" ")).toMatch(errorPattern);
}

function fullyValidTask(overrides = {}) {
  return makeTask({
    phase: "DONE",
    review: approvedTaskReview(),
    red: {
      status: "PASS",
      failing_tests: ["scripts/tdd-state.test.mjs::red assertion"],
      failure_reason_expected: true,
      criteria_to_tests: criteriaMatrix(),
      revision_delta: { ac: "", test: "", evidence: "" },
      revision_baseline_tests: {},
    },
    green: {
      status: "PASS",
      reason_if_skipped: "",
      changed_files: ["tdd-orchestrator/lib/state.mjs"],
      tooling_evidence: "",
      tooling_suite_evidence: "",
    },
    refactor: { status: "PASS", reason_if_skipped: "" },
    gates: gateValues("PASS"),
    gate_origins: gateOrigins(),
    gate_evidence: gateEvidence("npm test -- target; output: PASS"),
    ...overrides,
  });
}

function normativeEntry(ac = "AC-019") {
  return {
    status: "NA",
    reason: "critério exclusivamente normativo",
    validator: "spec-kit-validator",
    evidence: "interface-contract.md#invariantes",
    reference: `spec.md#${ac}`,
  };
}
function legacyBaseline({ status = "FAIL", tests = "NA", build = "NA", overrideApproved = true } = {}) {
  const progress = makeLegacy21Progress();
  progress.baseline.status = status;
  progress.baseline.tests = tests;
  progress.baseline.tests_evidence = `npx vitest run; tests=${tests}`;
  progress.baseline.build = build;
  progress.baseline.build_evidence = `ship.config.json: buildCommand=${build === "NA" ? "null" : "configured"}`;
  progress.baseline.override_approved = overrideApproved;
  progress.baseline.known_failures = [
    { gate: "tests", reason: "baseline tests result retained", evidence: `tests=${tests}` },
    { gate: "build", reason: "baseline build result retained", evidence: `build=${build}` },
  ];
  return progress;
}

describe("T-003 — state migration and validation seams", () => {
  it("AC-008 — migrates only the documented 2.1 aliases and initializes compatibility metadata", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const legacy = makeLegacy21Progress();
    const original = structuredClone(legacy);
    const migrated = expectAccepted(api.migrateProgress(legacy));

    expect(migrated.schema_version).toBe("2.2");
    expect(migrated.repo.branch_work).toBe("fix/36-corrigir-integracao-robusta-das-skills");
    expect(migrated.repo.branch).toBeUndefined();
    expect(migrated.waves[0].tasks[0].reviewed_by).toBe("peer-reviewer");
    expect(migrated.waves[0].tasks[0].reviewer).toBeUndefined();
    expect(migrated.waves[0].tasks[0].gates.traceability).toBe("pending");
    expect(migrated.waves[0].tasks[0].gates.rastreabilidade).toBeUndefined();
    expect(migrated.waves[0].integration.attempt).toBe(0);
    expect(migrated.waves[0].tasks[0].review).toEqual(pendingReview());
    expect(legacy).toEqual(original);
  });

  it("AC-008 — rejects alias collisions, unknown aliases and unknown canonical keys without discarding diagnostics", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const collision = makeLegacy21Progress();
    collision.repo.branch_work = "another-branch";
    collision.waves[0].tasks[0].blockers = ["collision diagnosis"];
    collision.waves[0].tasks[0].evidence = "collision evidence";
    const collisionResult = api.migrateProgress(collision);
    expectRejected(collisionResult, /collision|colis[aã]o/i);
    expect(collisionResult.errors.join(" ")).toContain("collision diagnosis");

    const unknownAlias = makeLegacy21Progress();
    unknownAlias.repo.branch_legacy = "silently-forbidden";
    unknownAlias.waves[0].tasks[0].blockers = ["unknown alias diagnosis"];
    const unknownAliasResult = api.migrateProgress(unknownAlias);
    expectRejected(unknownAliasResult, /unknown|desconhecid|allowlist/i);
    expect(unknownAliasResult.errors.join(" ")).toContain("unknown alias diagnosis");

    const unknownCanonical = makeProgress({ unexpected_field: true });
    const validationResult = api.validateProgress(unknownCanonical);
    expectRejected(validationResult, /unknown|desconhecid|extra|chave/i);
  });

  it("AC-008 — converts legacy wave BLOCKED and caps integration attempts while preserving history", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const legacyBlocked = makeLegacy21Progress();
    const blockedTask = legacyBlocked.waves[0].tasks[0];
    legacyBlocked.waves[0].status = "BLOCKED";
    legacyBlocked.waves[0].integration = {
      status: "FAIL",
      attempt: 2,
      evidence: "integration attempt 2 failed; output retained",
    };
    blockedTask.phase = "BLOCKED";
    blockedTask.blockers = ["merge conflict diagnosis"];
    blockedTask.evidence = "original integration evidence";

    const migratedBlocked = expectAccepted(api.migrateProgress(legacyBlocked));
    expect(migratedBlocked.waves[0].status).toBe("in_progress");
    expect(migratedBlocked.waves[0].integration.status).toBe("FAIL");
    expect(migratedBlocked.waves[0].integration.attempt).toBe(2);
    expect(migratedBlocked.waves[0].tasks[0].phase).toBe("BLOCKED");
    expect(migratedBlocked.waves[0].tasks[0].blockers).toEqual(["merge conflict diagnosis"]);
    expect(migratedBlocked.waves[0].tasks[0].evidence).toBe("original integration evidence");

    const incremented = makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "FAIL", attempt: 2, evidence: "attempt 2 output" },
        tasks: [makeTask({ phase: "BLOCKED", blockers: ["retry history"], evidence: "attempt 2 evidence" })],
      }],
    });
    const incrementedValidation = api.validateProgress(incremented);
    expect(incrementedValidation.ok).toBe(true);
    expect(incremented.waves[0].integration.attempt).toBe(2);

    const capped = structuredClone(incremented);
    capped.waves[0].integration.attempt = 3;
    const cappedMigration = expectAccepted(api.migrateProgress(capped));
    expect(cappedMigration.waves[0].integration.attempt).toBe(3);
    expect(cappedMigration.waves[0].tasks[0].phase).toBe("BLOCKED");
    expect(cappedMigration.waves[0].tasks[0].blockers).toEqual(["retry history"]);
    expect(cappedMigration.waves[0].tasks[0].evidence).toBe("attempt 2 evidence");

    const invalidAttempt = structuredClone(incremented);
    invalidAttempt.waves[0].integration.attempt = -1;
    expectRejected(api.validateProgress(invalidAttempt), /attempt|inteiro|negativ/i);
    invalidAttempt.waves[0].integration.attempt = 1.5;
    expectRejected(api.validateProgress(invalidAttempt), /attempt|inteiro|integer/i);
  });
  it("AC-008 regression — migração de wave BLOCKED legada força integration FAIL", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const legacyBlocked = makeLegacy21Progress();
    const blockedTask = legacyBlocked.waves[0].tasks[0];
    legacyBlocked.waves[0].status = "BLOCKED";
    legacyBlocked.waves[0].integration = {
      status: "PASS",
      attempt: 1,
      evidence: "stale integration PASS from legacy state",
    };
    blockedTask.phase = "BLOCKED";
    blockedTask.blockers = ["legacy integration blocked"];
    blockedTask.evidence = "legacy blocker evidence";

    const migrated = expectAccepted(api.migrateProgress(legacyBlocked));
    expect(migrated.waves[0].status).toBe("in_progress");
    expect(migrated.waves[0].integration.status).toBe("FAIL");
    expect(migrated.waves[0].integration.evidence).not.toBe("");
    expect(migrated.waves[0].tasks[0].phase).toBe("BLOCKED");
  });

  it("AC-008 — validates gate origins/enums and non-empty command-plus-output evidence", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const valid = makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [makeTask({
          phase: "RED",
          gates: gateValues("PASS"),
          gate_origins: gateOrigins(),
          gate_evidence: gateEvidence("npm run gate; output: PASS"),
        })],
      }],
    });
    expect(api.validateProgress(valid).ok).toBe(true);

    const invalidOrigin = structuredClone(valid);
    invalidOrigin.waves[0].tasks[0].gates.tests = "FAIL";
    invalidOrigin.waves[0].tasks[0].gate_origins.tests = "UNTRUSTED";
    invalidOrigin.waves[0].tasks[0].gate_evidence.tests = "npm test; output: FAIL";
    expectRejected(api.validateProgress(invalidOrigin), /origin|origem|enum|UNTRUSTED/i);

    const originOnPass = structuredClone(valid);
    originOnPass.waves[0].tasks[0].gate_origins.tests = "TESTE";
    expectRejected(api.validateProgress(originOnPass), /origin|origem|PASS|FAIL/i);

    const missingEvidence = structuredClone(valid);
    missingEvidence.waves[0].tasks[0].gate_evidence.coverage = "";
    expectRejected(api.validateProgress(missingEvidence), /evidence|evid[eê]ncia|coverage/i);

    const invalidEnum = structuredClone(valid);
    invalidEnum.waves[0].tasks[0].gates.tests = "UNKNOWN";
    expectRejected(api.validateProgress(invalidEnum), /enum|status|UNKNOWN/i);
  });

  it("AC-009 — accepts DONE only as a pre-integration readiness marker and keeps validation inputs immutable", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const preIntegration = makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [fullyValidTask()],
      }],
    });
    const before = structuredClone(preIntegration);
    const result = api.validateProgress(preIntegration);
    expect(result).toMatchObject({ ok: true, errors: [] });
    expect(preIntegration).toEqual(before);
    expect(preIntegration.waves[0].tasks[0].phase).toBe("DONE");
    expect(preIntegration.waves[0].integration.status).toBe("pending");

    const invalidDone = structuredClone(preIntegration);
    invalidDone.waves[0].tasks[0].blockers = ["still blocked"];
    expectRejected(api.validateProgress(invalidDone), /DONE|blocker|bloque/i);

    const pendingPromotion = api.canPromoteWave(preIntegration.waves[0]);
    expect(pendingPromotion.ok).toBe(false);
    expect(pendingPromotion.errors.join(" ")).toMatch(/integration|pending|promo/i);
  });
  it("AC-009 regression — DONE exige GREEN PASS e REFACTOR PASS ou SKIPPED", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const pendingGreen = fullyValidTask({
      green: {
        status: "PENDING",
        reason_if_skipped: "",
        changed_files: [],
        tooling_evidence: "",
        tooling_suite_evidence: "",
      },
      refactor: { status: "PASS", reason_if_skipped: "" },
    });
    expectRejected(api.validateProgress(makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [pendingGreen],
      }],
    })), /DONE|green|PASS|SKIPPED/i);

    const skippedGreen = fullyValidTask({
      green: {
        status: "SKIPPED",
        reason_if_skipped: "comportamento já implementado",
        changed_files: [],
        tooling_evidence: "",
        tooling_suite_evidence: "",
      },
      refactor: { status: "SKIPPED", reason_if_skipped: "sem alteração a refatorar" },
    });
    expectRejected(api.validateProgress(makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [skippedGreen],
      }],
    })), /DONE|green|PASS|SKIPPED/i);
    const pendingRefactor = fullyValidTask({
      green: {
        status: "PASS",
        reason_if_skipped: "",
        changed_files: ["tdd-orchestrator/lib/state.mjs"],
        tooling_evidence: "",
        tooling_suite_evidence: "",
      },
      refactor: { status: "PENDING", reason_if_skipped: "" },
    });
    expectRejected(api.validateProgress(makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [pendingRefactor],
      }],
    })), /DONE|refactor|PASS|SKIPPED/i);

    const skippedRefactor = fullyValidTask({
      refactor: { status: "SKIPPED", reason_if_skipped: "sem alteração a refatorar" },
    });
    expect(api.validateProgress(makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [skippedRefactor],
      }],
    })).ok).toBe(true);
  });

  it("AC-010 — enforces executable AC→test matrix, exact normative NA, and RED/RED_REVISION evidence", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const validTask = fullyValidTask({ phase: "GREEN" });
    const matrixResult = api.validateCriteriaMatrix(validTask);
    expect(matrixResult).toMatchObject({ ok: true, errors: [] });

    const missing = structuredClone(validTask);
    delete missing.red.criteria_to_tests["AC-009"];
    expectRejected(api.validateCriteriaMatrix(missing), /missing|ausent|AC-009/i);

    const extra = structuredClone(validTask);
    extra.red.criteria_to_tests["AC-999"] = ["scripts/tdd-state.test.mjs::unknown AC"];
    expectRejected(api.validateCriteriaMatrix(extra), /extra|unknown|desconhecid|AC-999/i);

    const malformed = structuredClone(validTask);
    malformed.red.criteria_to_tests["AC-008"] = ["not-a-seam"];
    expectRejected(api.validateCriteriaMatrix(malformed), /::|seam|refer[eê]ncia/i);

    const nonNormativeNa = structuredClone(validTask);
    nonNormativeNa.red.criteria_to_tests["AC-008"] = {
      status: "NA",
      reason: "not executable",
      validator: "spec-kit-validator",
      evidence: "interface-contract.md#invariantes",
      reference: "spec.md#AC-008",
    };
    expectRejected(api.validateCriteriaMatrix(nonNormativeNa), /NA|normativ|execut/i);

    const normative = makeTask({
      acceptance_criteria: ["AC-019"],
      red: {
        criteria_to_tests: {
          "AC-019": {
            status: "NA",
            reason: "critério exclusivamente normativo",
            validator: "spec-kit-validator",
            evidence: "interface-contract.md#invariantes",
            reference: "spec.md#AC-019",
          },
        },
      },
    });
    expect(api.validateCriteriaMatrix(normative)).toMatchObject({ ok: true, errors: [] });

    const extraNaField = structuredClone(normative);
    extraNaField.red.criteria_to_tests["AC-019"].extra = "forbidden";
    expectRejected(api.validateCriteriaMatrix(extraNaField), /exact|extra|chave/i);

    const redReady = fullyValidTask({
      phase: "GREEN",
      red: {
        status: "PASS",
        failing_tests: ["scripts/tdd-state.test.mjs::assertion failure"],
        failure_reason_expected: true,
        criteria_to_tests: criteriaMatrix(),
        revision_delta: { ac: "", test: "", evidence: "" },
        revision_baseline_tests: {},
      },
    });
    expect(api.validateProgress(makeProgress({ waves: [{ wave: 1, status: "in_progress", integration: { status: "pending", attempt: 0, evidence: "" }, tasks: [redReady] }] }))).toMatchObject({ ok: true, errors: [] });

    const existingBehavior = fullyValidTask({
      phase: "REVIEW",
      implemented_by: "existing-code",
      red: {
        status: "PASS",
        failing_tests: [],
        failure_reason_expected: false,
        criteria_to_tests: criteriaMatrix(),
        revision_delta: { ac: "", test: "", evidence: "" },
        revision_baseline_tests: {},
      },
      green: { status: "SKIPPED", reason_if_skipped: "comportamento já implementado", changed_files: [], tooling_evidence: "", tooling_suite_evidence: "" },
      refactor: { status: "SKIPPED", reason_if_skipped: "sem alteração a refatorar" },
    });
    expect(api.validateProgress(makeProgress({ waves: [{ wave: 1, status: "in_progress", integration: { status: "pending", attempt: 0, evidence: "" }, tasks: [existingBehavior] }] }))).toMatchObject({ ok: true, errors: [] });

    const falseRed = structuredClone(redReady);
    falseRed.red.failure_reason_expected = false;
    expectRejected(api.validateProgress(makeProgress({ waves: [{ wave: 1, status: "in_progress", integration: { status: "pending", attempt: 0, evidence: "" }, tasks: [falseRed] }] })), /failure_reason_expected|assert|RED/i);

    const revision = fullyValidTask({
      phase: "RED_REVISION",
      red: {
        status: "PASS",
        failing_tests: ["scripts/tdd-state.test.mjs::new regression assertion"],
        failure_reason_expected: true,
        criteria_to_tests: {
          ...criteriaMatrix(),
          "AC-008": [
            "scripts/tdd-state.test.mjs::old baseline seam",
            "scripts/tdd-state.test.mjs::new regression assertion",
          ],
        },
        revision_delta: {
          ac: "AC-008",
          test: "scripts/tdd-state.test.mjs::new regression assertion",
          evidence: "vitest assertion failed: expected blocked state",
        },
        revision_baseline_tests: {
          "AC-008": ["scripts/tdd-state.test.mjs::old baseline seam"],
          "AC-009": criteriaMatrix()["AC-009"],
          "AC-010": criteriaMatrix()["AC-010"],
        },
      },
    });
    expect(api.validateProgress(makeProgress({ waves: [{ wave: 1, status: "in_progress", integration: { status: "pending", attempt: 0, evidence: "" }, tasks: [revision] }] }))).toMatchObject({ ok: true, errors: [] });

    const invalidRevision = structuredClone(revision);
    invalidRevision.red.revision_delta.test = "scripts/tdd-state.test.mjs::old baseline seam";
    expectRejected(api.validateProgress(makeProgress({ waves: [{ wave: 1, status: "in_progress", integration: { status: "pending", attempt: 0, evidence: "" }, tasks: [invalidRevision] }] })), /revision|delta|baseline|new/i);
  });
  it("AC-010 regression — retomada 2.2 em RED_REVISION limpa toda prova stale e preserva a baseline", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const baselineRef = "scripts/tdd-state.test.mjs::previous revision assertion";
    const staleRef = "scripts/tdd-state.test.mjs::stale revision assertion";
    const progress = makeProgress();
    const task = progress.waves[0].tasks[0];
    task.phase = "RED_REVISION";
    task.review = approvedTaskReview();
    task.red.status = "PASS";
    task.red.failing_tests = [staleRef];
    task.red.failure_reason_expected = true;
    task.red.criteria_to_tests = {
      "AC-008": [baselineRef, staleRef],
      "AC-009": criteriaMatrix()["AC-009"],
      "AC-010": criteriaMatrix()["AC-010"],
    };
    task.red.revision_delta = {
      ac: "AC-008",
      test: staleRef,
      evidence: "vitest assertion failed: stale revision proof",
    };
    task.red.revision_baseline_tests = {
      "AC-008": [baselineRef],
      "AC-009": criteriaMatrix()["AC-009"],
      "AC-010": criteriaMatrix()["AC-010"],
    };

    const resumed = expectAccepted(api.migrateProgress(progress));
    const resumedTask = resumed.waves[0].tasks[0];
    expect(resumedTask.phase).toBe("RED_REVISION");
    expect(resumedTask.red.revision_baseline_tests).toEqual(task.red.revision_baseline_tests);
    expect(resumedTask.red.revision_delta).toEqual({ ac: "", test: "", evidence: "" });
    expect(resumedTask.red.failing_tests).toEqual([]);
    expect(resumedTask.red.failure_reason_expected).toBe(false);
  });
  it("AC-010 regression — accepts only canonical spec-kit-validator for normative NA", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const canonical = makeTask({
      acceptance_criteria: ["AC-019"],
      red: {
        criteria_to_tests: {
          "AC-019": {
            status: "NA",
            reason: "critério exclusivamente normativo",
            validator: "spec-kit-validator",
            evidence: "interface-contract.md#invariantes",
            reference: "spec.md#AC-019",
          },
        },
      },
    });
    const legacy = structuredClone(canonical);
    legacy.red.criteria_to_tests["AC-019"].validator = "validator";
    expectRejected(api.validateCriteriaMatrix(legacy), /validator|literal|canonical/i);
    expect(api.validateCriteriaMatrix(canonical)).toMatchObject({ ok: true, errors: [] });
  });
  it("AC-008 regression — completa a ponte 2.1→2.2, converte READY/textual matrix e inicializa campos novos", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const legacy = makeLegacy21Progress();
    const task = legacy.waves[0].tasks[0];
    task.phase = "READY";
    task.red.criteria_to_tests = [
      "AC-008 -> scripts/tdd-state.test.mjs::legacy migration matrix",
      "AC-009: scripts/tdd-state.test.mjs::legacy DONE readiness",
      "AC-010 -> scripts/tdd-state.test.mjs::legacy evidence matrix",
      "",
    ].join("\n");
    delete legacy.baseline.override_approved;
    delete task.red.revision_delta;
    delete task.red.revision_baseline_tests;
    delete task.green.reason_if_skipped;
    delete task.green.tooling_evidence;
    delete task.green.tooling_suite_evidence;
    delete task.refactor.reason_if_skipped;
    delete task.gate_origins;
    delete task.gate_evidence;

    const migrated = expectAccepted(api.migrateProgress(legacy));
    const migratedTask = migrated.waves[0].tasks[0];
    expect(migrated.schema_version).toBe("2.2");
    expect(migratedTask.phase).toBe("REVIEW");
    expect(migratedTask.review).toEqual(pendingReview());
    expect(migratedTask.red.criteria_to_tests).toEqual({
      "AC-008": ["scripts/tdd-state.test.mjs::legacy migration matrix"],
      "AC-009": ["scripts/tdd-state.test.mjs::legacy DONE readiness"],
      "AC-010": ["scripts/tdd-state.test.mjs::legacy evidence matrix"],
    });
    expect(migratedTask.red.revision_delta).toEqual({ ac: "", test: "", evidence: "" });
    expect(migratedTask.red.revision_baseline_tests).toEqual({});
    expect(migratedTask.green.reason_if_skipped).toBe("");
    expect(migratedTask.green.tooling_evidence).toBe("");
    expect(migratedTask.green.tooling_suite_evidence).toBe("");
    expect(migratedTask.refactor.reason_if_skipped).toBe("");
    expect(migratedTask.gate_origins).toEqual(gateOrigins(""));
    expect(migratedTask.gate_evidence).toEqual(gateEvidence(""));
    expect(migrated.baseline.override_approved).toBe(false);

    const malformedMatrix = makeLegacy21Progress();
    malformedMatrix.waves[0].tasks[0].red.criteria_to_tests = [
      "AC-008 -> scripts/tdd-state.test.mjs::valid row",
      "not an AC mapping",
    ].join("\n");
    malformedMatrix.waves[0].tasks[0].blockers = ["legacy matrix diagnosis"];
    malformedMatrix.waves[0].tasks[0].evidence = "legacy matrix evidence";
    const malformedResult = api.migrateProgress(malformedMatrix);
    expectRejected(malformedResult, /matrix|invalid|AC-009/i);
    expect(malformedResult.errors.join(" ")).toContain("legacy matrix diagnosis");
  });

  it("AC-008 regression — baseline NA só normaliza PASS com known_failure/evidence específicos", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const justifiedNa = legacyBaseline({ status: "FAIL", tests: "NA", build: "NA" });
    const normalizedNa = expectAccepted(api.migrateProgress(justifiedNa));
    expect(normalizedNa.baseline.status).toBe("PASS");
    expect(normalizedNa.baseline.known_failures).toEqual(justifiedNa.baseline.known_failures);
  });

  it("AC-008 regression — baseline FAIL é recalculada e preserva override aprovado", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const failed = legacyBaseline({ status: "PASS", tests: "FAIL", build: "NA" });
    const normalizedFail = expectAccepted(api.migrateProgress(failed));
    expect(normalizedFail.baseline.status).toBe("FAIL");
    expect(normalizedFail.baseline.override_approved).toBe(true);
    expect(normalizedFail.baseline.tests_evidence).toContain("FAIL");
  });

  it("AC-008 regression — baseline FAIL sem override explícito permanece bloqueada", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const withoutOverride = legacyBaseline({
      status: "FAIL",
      tests: "FAIL",
      build: "NA",
      overrideApproved: false,
    });
    expectRejected(api.migrateProgress(withoutOverride), /override|aprova|baseline|FAIL/i);
  });
  it("AC-008 regression — baseline FAIL com override ainda exige evidência de cada gate PASS", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const missingTestsEvidence = makeProgress({
      baseline: {
        status: "FAIL",
        tests: "PASS",
        tests_evidence: "",
        build: "FAIL",
        build_evidence: "baseline build command; output: FAIL",
        override_approved: true,
        known_failures: [{
          gate: "build",
          reason: "baseline build failure retained",
          evidence: "baseline build command; output: FAIL",
        }],
      },
    });
    expectRejected(api.validateProgress(missingTestsEvidence), /baseline|tests|evidence|evid[eê]ncia/i);

    const missingBuildEvidence = makeProgress({
      baseline: {
        status: "FAIL",
        tests: "FAIL",
        tests_evidence: "baseline tests command; output: FAIL",
        build: "PASS",
        build_evidence: "",
        override_approved: true,
        known_failures: [{
          gate: "tests",
          reason: "baseline test failure retained",
          evidence: "baseline tests command; output: FAIL",
        }],
      },
    });
    expectRejected(api.validateProgress(missingBuildEvidence), /baseline|build|evidence|evid[eê]ncia/i);
  });

  it("AC-008 regression — malformed waves falham fechadas sem throw", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const malformed = makeLegacy21Progress();
    malformed.waves = [null];
    let outcome;
    let thrown;
    try {
      outcome = api.migrateProgress(malformed);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, "malformed wave must be rejected as data, not throw").toBeUndefined();
    expect(outcome?.ok).toBe(false);
    expect(outcome?.errors?.join(" ")).toMatch(/wave|object|malform/i);
  });

  it("AC-008 regression — task attempt 3 bloqueia nova delegação e preserva diagnóstico", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const capped = makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [makeTask({
          phase: "VALIDATE",
          attempt: 3,
          blockers: ["task retry history"],
          evidence: "attempt 3 evidence retained",
        })],
      }],
    });
    const cappedMigration = expectAccepted(api.migrateProgress(capped));
    expect(cappedMigration.waves[0].tasks[0].phase).toBe("BLOCKED");
    expect(cappedMigration.waves[0].tasks[0].attempt).toBe(3);
    expect(cappedMigration.waves[0].tasks[0].blockers).toEqual(["task retry history"]);
    expect(cappedMigration.waves[0].tasks[0].evidence).toBe("attempt 3 evidence retained");
  });
  it("AC-008 regression — schema 2.2 integration FAIL no attempt cap bloqueia tarefa não resolvida", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const exhaustedIntegration = makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: {
          status: "FAIL",
          attempt: 3,
          evidence: "integration attempt 3 failed; output retained",
        },
        tasks: [makeTask({
          phase: "VALIDATE",
          blockers: [],
          evidence: "task remains unblocked despite exhausted integration",
        })],
      }],
    });
    expectRejected(api.validateProgress(exhaustedIntegration), /integration|attempt|cap|BLOCKED|bloque/i);
  });

  it("AC-008 regression — review PENDING nunca carrega agente ou prova stale", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const legacy = makeLegacy21Progress();
    legacy.waves[0].tasks[0].review = {
      status: "PENDING",
      agent: "peer-reviewer",
      independent: false,
      revision: "",
      evidence: "",
    };
    legacy.waves[0].tasks[0].phase = "VALIDATE";
    const migrated = expectAccepted(api.migrateProgress(legacy));
    expect(migrated.waves[0].tasks[0].phase).toBe("REVIEW");
    expect(migrated.waves[0].tasks[0].review).toEqual(pendingReview());
  });

  it("AC-009 regression — DONE exige status final dos ACs vinculados", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const progress = makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [fullyValidTask()],
      }],
    });
    progress.acceptance_criteria = progress.acceptance_criteria.map((ac) => (
      ac.id === "AC-009" ? { ...ac, status: "PENDING" } : ac
    ));
    expectRejected(api.validateProgress(progress), /AC-009|status|final|VALIDATED/i);
  });

  it("AC-009 regression — review APPROVED da tarefa precisa ser independente", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const task = fullyValidTask({
      review: { agent: "peer-reviewer", independent: false },
    });
    expectRejected(api.validateProgress(makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [task],
      }],
    })), /independent|review/i);
  });
  it("AC-009 regression — review canônico rejeita implementador e agente incorreto", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const implementerReview = fullyValidTask({
      implemented_by: "peer-reviewer",
      reviewed_by: "peer-reviewer",
      review: approvedTaskReview(),
    });
    expectRejected(api.validateProgress(makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [implementerReview],
      }],
    })), /implement|independent|review/i);

    const wrongAgentReview = fullyValidTask({
      review: { ...approvedTaskReview(), agent: "validator" },
      reviewed_by: "peer-reviewer",
    });
    expectRejected(api.validateProgress(makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [wrongAgentReview],
      }],
    })), /peer-reviewer|agent|review/i);
  });

  it("AC-009 regression — integração PASS exige evidência não vazia", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const progress = makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "PASS", attempt: 1, evidence: "" },
        tasks: [makeTask({ phase: "VALIDATE" })],
      }],
    });
    expectRejected(api.validateProgress(progress), /integration|evidence|evid[eê]ncia/i);
  });

  it("AC-009 regression — READY legado converte para REVIEW e nunca persiste", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const legacyReady = makeLegacy21Progress();
    legacyReady.waves[0].tasks[0].phase = "READY";
    const migrated = expectAccepted(api.migrateProgress(legacyReady));
    expect(migrated.waves[0].tasks[0].phase).toBe("REVIEW");
    expect(migrated.waves[0].tasks[0].phase).not.toBe("READY");
  });

  it("AC-009 regression — DONE malformado retorna ok:false sem lançar exceção", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const malformedDone = makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [fullyValidTask({ blockers: null })],
      }],
    });
    let result;
    let thrown;
    try {
      result = api.validateProgress(malformedDone);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, "malformed DONE must fail closed without throwing").toBeUndefined();
    expect(result?.ok).toBe(false);
    expect(result?.errors?.join(" ")).toMatch(/DONE|blocker|object|array/i);
  });
  it("AC-009 regression — linkage AC↔task é bidirecional para DONE", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const task = fullyValidTask({
      acceptance_criteria: ["AC-009", "AC-010"],
      red: {
        criteria_to_tests: {
          "AC-009": criteriaMatrix()["AC-009"],
          "AC-010": criteriaMatrix()["AC-010"],
        },
      },
    });
    const progress = makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [task],
      }],
    });
    expectRejected(api.validateProgress(progress), /link|AC-008|T-003|task|tarefa/i);
  });

  it("AC-009/AC-019 regression — tarefa normativa AC-019 pode concluir apenas com NA exato", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const normativeTask = makeTask({
      id: "T-019",
      title: "rastrear AC normativo",
      phase: "DONE",
      acceptance_criteria: ["AC-019"],
      review: approvedTaskReview(),
      red: {
        status: "PASS",
        failing_tests: [],
        failure_reason_expected: false,
        criteria_to_tests: { "AC-019": normativeEntry() },
        revision_delta: { ac: "", test: "", evidence: "" },
        revision_baseline_tests: {},
      },
      green: {
        status: "SKIPPED",
        reason_if_skipped: "critério exclusivamente normativo",
        changed_files: [],
        tooling_evidence: "",
        tooling_suite_evidence: "",
      },
      refactor: { status: "SKIPPED", reason_if_skipped: "critério exclusivamente normativo" },
      gates: gateValues("PASS"),
      gate_origins: gateOrigins(),
      gate_evidence: gateEvidence("normative evidence: PASS"),
    });
    const progress = makeProgress({
      acceptance_criteria: [{
        id: "AC-019",
        desc: "artefatos Spec Kit coerentes",
        source: "./specs/specs003-convivencia-robusta-skills/spec.md#AC-019",
        tasks: ["T-019"],
        status: "VALIDATED",
      }],
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [normativeTask],
      }],
    });
    expect(api.validateProgress(progress)).toMatchObject({ ok: true, errors: [] });
  });

  it("AC-009/AC-019 regression — tarefa não avança enquanto Spec Kit está PENDING", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const pending = makeProgress({
      spec_kit: {
        spec: "./specs/specs003-convivencia-robusta-skills/spec.md",
        plan: "./specs/specs003-convivencia-robusta-skills/plan.md",
        tasks: "./specs/specs003-convivencia-robusta-skills/tasks.md",
        status: "PENDING",
        written_at: "",
        mode: "created",
      },
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [fullyValidTask()],
      }],
    });
    expectRejected(api.validateProgress(pending), /spec_kit|WRITTEN|written|Spec Kit/i);
  });

  it("AC-009/AC-019 regression — Spec Kit WRITTEN exige paths e timestamp de prova não vazios", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const missingEvidence = makeProgress({
      spec_kit: {
        spec: "",
        plan: "./specs/specs003-convivencia-robusta-skills/plan.md",
        tasks: "./specs/specs003-convivencia-robusta-skills/tasks.md",
        status: "WRITTEN",
        written_at: "",
        mode: "created",
      },
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [fullyValidTask()],
      }],
    });
    expectRejected(api.validateProgress(missingEvidence), /spec_kit|path|written|evidence/i);
  });

  it("AC-010 regression — existing-code não pode avançar sem GREEN/REFACTOR SKIPPED explícitos", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const invalidExisting = fullyValidTask({
      phase: "REVIEW",
      implemented_by: "existing-code",
      red: {
        status: "PASS",
        failing_tests: [],
        failure_reason_expected: false,
        criteria_to_tests: criteriaMatrix(),
        revision_delta: { ac: "", test: "", evidence: "" },
        revision_baseline_tests: {},
      },
      green: {
        status: "PENDING",
        reason_if_skipped: "",
        changed_files: [],
        tooling_evidence: "",
        tooling_suite_evidence: "",
      },
      refactor: { status: "PENDING", reason_if_skipped: "" },
    });
    expectRejected(
      api.validateProgress(makeProgress({
        waves: [{
          wave: 1,
          status: "in_progress",
          integration: { status: "pending", attempt: 0, evidence: "" },
          tasks: [invalidExisting],
        }],
      })),
      /existing|SKIPPED|green|refactor/i,
    );
  });

  it("AC-008 regression — integração PASS na tentativa inclusiva 3 não bloqueia tarefas", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const progress = makeProgress({
      waves: [{
        wave: 1,
        status: "integrating",
        integration: {
          status: "PASS",
          attempt: 3,
          evidence: "integration attempt 3 PASS; output retained",
        },
        tasks: [fullyValidTask()],
      }],
    });
    const migrated = expectAccepted(api.migrateProgress(progress));
    expect(migrated.waves[0].integration).toMatchObject({
      status: "PASS",
      attempt: 3,
      evidence: "integration attempt 3 PASS; output retained",
    });
    expect(migrated.waves[0].tasks[0].phase).toBe("DONE");
    expect(migrated.waves[0].tasks[0].blockers).toEqual([]);
  });

  it("AC-010 regression — migração 2.1 de RED_REVISION limpa prova stale e preserva baseline", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const baselineRef = "scripts/tdd-state.test.mjs::2.1 baseline assertion";
    const staleRef = "scripts/tdd-state.test.mjs::2.1 stale assertion";
    const legacy = makeLegacy21Progress();
    const task = legacy.waves[0].tasks[0];
    task.phase = "RED_REVISION";
    task.review = approvedTaskReview();
    task.red.status = "PASS";
    task.red.failing_tests = [staleRef];
    task.red.failure_reason_expected = true;
    task.red.criteria_to_tests = {
      ...criteriaMatrix(),
      "AC-008": [baselineRef, staleRef],
    };
    task.red.revision_baseline_tests = {
      "AC-008": [baselineRef],
      "AC-009": criteriaMatrix()["AC-009"],
      "AC-010": criteriaMatrix()["AC-010"],
    };
    task.red.revision_delta = {
      ac: "AC-008",
      test: staleRef,
      evidence: "vitest assertion failed: stale 2.1 proof",
    };

    const migrated = expectAccepted(api.migrateProgress(legacy));
    const migratedTask = migrated.waves[0].tasks[0];
    expect(migratedTask.phase).toBe("RED_REVISION");
    expect(migratedTask.red.revision_baseline_tests).toEqual(task.red.revision_baseline_tests);
    expect(migratedTask.red.status).toBe("PENDING");
    expect(migratedTask.red.failing_tests).toEqual([]);
    expect(migratedTask.red.failure_reason_expected).toBe(false);
    expect(migratedTask.red.revision_delta).toEqual({ ac: "", test: "", evidence: "" });
  });

  it("AC-008 regression — review BLOCKED sem prova preserva bloqueio e diagnóstico na retomada 2.2", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const progress = makeProgress();
    const task = progress.waves[0].tasks[0];
    task.phase = "BLOCKED";
    task.review = {
      status: "BLOCKED",
      agent: "",
      independent: false,
      revision: "",
      evidence: "",
    };
    task.blockers = ["review blocked diagnosis"];
    task.evidence = "review blocked evidence";

    const resumed = expectAccepted(api.migrateProgress(progress));
    const resumedTask = resumed.waves[0].tasks[0];
    expect(resumedTask.review).toEqual(task.review);
    expect(resumedTask.phase).toBe("BLOCKED");
    expect(resumedTask.blockers).toEqual(["review blocked diagnosis"]);
    expect(resumedTask.evidence).toBe("review blocked evidence");
  });

  it("AC-008 regression — allowed_write_globs exige strings não vazias e rejeita buracos", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const malformedGlobs = [
      ["scripts/**", 42],
      ["scripts/**", , "tdd-orchestrator/**"],
      ["scripts/**", ""],
    ];
    for (const allowed_write_globs of malformedGlobs) {
      const progress = makeProgress();
      progress.waves[0].tasks[0].allowed_write_globs = allowed_write_globs;
      expectRejected(
        api.validateProgress(progress),
        /allowed_write_globs|glob|string|non-empty|required/i,
      );
    }
  });

  it("AC-008 regression — baseline FAIL inconsistente com gates resolvidos é inválida", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const invalidBaseline = makeProgress({
      baseline: {
        status: "FAIL",
        tests: "PASS",
        tests_evidence: "baseline tests command; output: PASS",
        build: "NA",
        build_evidence: "ship.config.json: buildCommand=null; output: NA",
        override_approved: true,
        known_failures: [{
          gate: "build",
          reason: "buildCommand is intentionally absent",
          evidence: "ship.config.json: buildCommand=null",
        }],
      },
    });
    expectRejected(api.validateProgress(invalidBaseline), /baseline|status|FAIL|gate/i);
  });

  it("AC-008 regression — identidade de repo ausente falha fechada", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    for (const field of ["branch_start", "branch_work", "merge_target", "head_start", "head_current"]) {
      const missingIdentity = makeProgress();
      missingIdentity.repo[field] = "";
      expectRejected(
        api.validateProgress(missingIdentity),
        /repo|identity|branch|head|non-empty|required/i,
      );
    }
  });

  it.each([
    ["known_failures nulo", null],
    ["entrada null em known_failures", [null]],
  ])("AC-008 regression — migrateProgress rejeita %s sem lançar e preserva errors", async (label, knownFailures) => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const progress = makeProgress();
    progress.baseline.known_failures = knownFailures;
    progress.waves[0].tasks[0].blockers = [`${label} diagnosis`];
    progress.waves[0].tasks[0].evidence = `${label} evidence`;

    let migrated;
    let thrown;
    try {
      migrated = api.migrateProgress(progress);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeUndefined();
    expectRejected(migrated, /known_failures|baseline|malformed|invalid/i);
    expect(migrated.errors.join(" ")).toMatch(/diagnosis|evidence/i);
  });

  it("AC-008 regression — baseline PASS sem evidence normaliza para NOT_RUN", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const progress = makeProgress({
      baseline: {
        status: "PASS",
        tests: "PASS",
        tests_evidence: "",
        build: "PASS",
        build_evidence: "",
        override_approved: false,
        known_failures: [],
      },
    });
    const task = progress.waves[0].tasks[0];
    task.phase = "GREEN";
    task.red.status = "PASS";
    task.red.failure_reason_expected = true;
    task.red.failing_tests = ["scripts/tdd-state.test.mjs::RED assertion"];

    const migrated = expectAccepted(api.migrateProgress(progress));
    expect(migrated.baseline.status).toBe("NOT_RUN");
  });
  it("AC-008 regression — known_failures de gate não suportado força nova baseline", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const progress = makeProgress();
    progress.baseline.known_failures.push({
      gate: "coverage",
      reason: "legacy coverage diagnostic",
      evidence: "coverage output",
    });
    const task = progress.waves[0].tasks[0];
    task.phase = "GREEN";
    task.red.status = "PASS";
    task.red.failure_reason_expected = true;
    task.red.failing_tests = ["scripts/tdd-state.test.mjs::RED assertion"];

    const migrated = expectAccepted(api.migrateProgress(progress));
    expect(migrated.baseline.status).toBe("NOT_RUN");
    expect(migrated.baseline.tests).toBe("NOT_RUN");
    expect(migrated.baseline.build).toBe("NOT_RUN");
    expect(migrated.baseline.known_failures).toEqual([
      { gate: "build", reason: "buildCommand=null", evidence: "ship.config.json" },
    ]);
  });

  it("AC-008 regression — reabre onda concluída quando review rebaixa tarefa", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const task = makeTask({
      phase: "DONE",
      review: pendingReview(),
      red: {
        status: "PASS",
        failing_tests: ["scripts/tdd-state.test.mjs::RED assertion"],
        failure_reason_expected: true,
      },
      green: { status: "PASS", changed_files: ["tdd-orchestrator/lib/state.mjs"] },
      refactor: { status: "PASS" },
      gates: gateValues("PASS"),
      gate_evidence: gateEvidence("gate output: PASS"),
      evidence: "done task evidence",
    });
    const progress = makeProgress({
      waves: [{
        wave: 1,
        status: "completed",
        integration: { status: "PASS", attempt: 1, evidence: "integration PASS" },
        tasks: [task],
      }],
    });

    const migrated = expectAccepted(api.migrateProgress(progress));
    expect(migrated.waves[0].status).toBe("in_progress");
    expect(migrated.waves[0].integration.status).toBe("FAIL");
    expect(migrated.waves[0].tasks[0].phase).toBe("REVIEW");
    expect(migrated.waves[0].tasks[0].review).toEqual(pendingReview());
  });

  it("AC-008 regression — RED_REVISION preserva fase e baseline ao limpar review pendente", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const task = makeTask({ phase: "RED_REVISION", review: pendingReview() });
    const migrated = expectAccepted(api.migrateProgress(makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [task],
      }],
    })));
    expect(migrated.waves[0].tasks[0].phase).toBe("RED_REVISION");
    expect(migrated.waves[0].tasks[0].red.status).toBe("PENDING");
    expect(migrated.waves[0].tasks[0].red.revision_baseline_tests).toEqual(criteriaMatrix());
  });
  it("AC-008 regression — RED_REVISION parcial permanece na fase com review BLOCKED", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const task = makeTask({
      phase: "RED_REVISION",
      review: {
        status: "APPROVED",
        agent: "peer-reviewer",
        independent: true,
        revision: "",
        evidence: "partial reviewer proof",
      },
    });
    const migrated = expectAccepted(api.migrateProgress(makeProgress({
      waves: [{
        wave: 1,
        status: "in_progress",
        integration: { status: "pending", attempt: 0, evidence: "" },
        tasks: [task],
      }],
    })));
    expect(migrated.waves[0].tasks[0].phase).toBe("RED_REVISION");
    expect(migrated.waves[0].tasks[0].review.status).toBe("BLOCKED");
  });

  it("AC-008 regression — matriz textual 2.1 acumula referências repetidas do mesmo AC", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const legacy = makeLegacy21Progress();
    const task = legacy.waves[0].tasks[0];
    task.phase = "READY";
    const first = "scripts/tdd-state.test.mjs::legacy duplicate matrix first";
    const second = "scripts/tdd-state.test.mjs::legacy duplicate matrix second";
    task.red.criteria_to_tests = [
      `AC-008 -> ${first}`,
      `AC-008: ${second}`,
      "AC-009 -> scripts/tdd-state.test.mjs::legacy duplicate matrix readiness",
      "AC-010 -> scripts/tdd-state.test.mjs::legacy duplicate matrix evidence",
    ].join("\n");

    const migrated = expectAccepted(api.migrateProgress(legacy));
    expect(migrated.waves[0].tasks[0].red.criteria_to_tests).toEqual({
      "AC-008": [first, second],
      "AC-009": ["scripts/tdd-state.test.mjs::legacy duplicate matrix readiness"],
      "AC-010": ["scripts/tdd-state.test.mjs::legacy duplicate matrix evidence"],
    });
  });

  it("AC-008 regression — review incompleta retém diagnóstico/prova ou permanece BLOCKED sem apagar o motivo", async () => {
    const loaded = await loadStateApi();
    const api = assertStateApiLoaded(loaded);
    if (!api) return;

    const diagnosis = "incomplete review diagnosis";
    const taskEvidence = "task resume evidence";
    const reviewProof = "partial reviewer proof";
    const progress = makeProgress();
    const task = progress.waves[0].tasks[0];
    task.phase = "VALIDATE";
    task.review = {
      status: "APPROVED",
      agent: "peer-reviewer",
      independent: true,
      revision: "",
      evidence: reviewProof,
    };
    task.blockers = [diagnosis];
    task.evidence = taskEvidence;

    const migrated = api.migrateProgress(progress);
    if (!migrated.ok) {
      const errors = migrated.errors.join(" ");
      expect(errors).toContain(diagnosis);
      expect(errors).toContain(taskEvidence);
      expect(errors).toContain(reviewProof);
      return;
    }

    const migratedTask = migrated.value.waves[0].tasks[0];
    expect(migratedTask.blockers).toContain(diagnosis);
    expect(migratedTask.evidence).toContain(taskEvidence);
    if (migratedTask.phase === "BLOCKED") return;

    expect(migratedTask.phase).toBe("REVIEW");
    const retainedProof = [migratedTask.review?.evidence, migratedTask.evidence]
      .filter((value) => typeof value === "string")
      .join(" ");
    expect(retainedProof).toContain(reviewProof);
  });

});

export {
  ACCEPTANCE_CRITERIA,
  GATES,
  VALID_GATE_ORIGINS,
  makeProgress,
  makeTask,
  fullyValidTask,
  criteriaMatrix,
};
