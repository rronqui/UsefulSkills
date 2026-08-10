import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, "..");
const skillPath = join(repoRoot, "tdd-orchestrator", "SKILL.md");
const contractPath = join(
  repoRoot,
  "specs",
  "specs002-integracao-robusta-skills",
  "contracts",
  "interface-contract.md",
);
const specPath = join(repoRoot, "specs", "specs002-integracao-robusta-skills", "spec.md");

const skill = readFileSync(skillPath, "utf8");
const contract = readFileSync(contractPath, "utf8");
const spec = readFileSync(specPath, "utf8");

const T003_AC = ["AC-011", "AC-012", "AC-013", "AC-014", "AC-015", "AC-016", "AC-023"];
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
const FINAL_AC_STATUS = new Set(["COVERED", "IMPLEMENTED", "VALIDATED"]);

function sectionBetween(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = end ? source.indexOf(end, startAt + start.length) : -1;
  return source.slice(startAt, endAt === -1 ? undefined : endAt);
}

function expectDocumented(ac, source, requiredPatterns) {
  const missing = requiredPatterns.filter((pattern) => !pattern.test(source));
  expect(
    missing,
    `${ac}: a regra contratual não está documentada no SKILL.md: ${missing.join(", ")}`,
  ).toEqual([]);
}

function baseTask() {
  return {
    id: "T-003",
    title: "estado TDD",
    phase: "VALIDATE",
    attempt: 1,
    allowed_write_globs: ["scripts/tdd-state.test.mjs"],
    acceptance_criteria: [...T003_AC],
    implemented_by: "backend-developer",
    reviewed_by: "peer-reviewer",
    red: {
      status: "PASS",
      failing_tests: ["scripts/tdd-state.test.mjs::fixture documental"],
      failure_reason_expected: true,
      criteria_to_tests: Object.fromEntries(T003_AC.map((ac) => [ac, [`scripts/tdd-state.test.mjs::${ac}`]])),
      revision_delta: { ac: "", test: "", evidence: "" },
      revision_baseline_tests: {},
    },
    green: { status: "PASS", reason_if_skipped: "", changed_files: ["tdd-orchestrator/SKILL.md"] },
    refactor: { status: "SKIPPED", reason_if_skipped: "sem alteração" },
    doc_impact: "applied",
    gates: Object.fromEntries(GATES.map((gate) => [gate, "PASS"])),
    gate_origins: Object.fromEntries(GATES.map((gate) => [gate, ""])),
    gate_evidence: Object.fromEntries(GATES.map((gate) => [gate, `comando ${gate}; trecho PASS`])),
    blockers: [],
    evidence: "estado validado",
  };
}

function baseProgress() {
  return {
    schema_version: "2.2",
    run_id: "2026-08-10T00:00:00.000Z",
    task_source: "TASKS.md",
    updated_at: "2026-08-10T00:00:00.000Z",
    repo: {
      branch_start: "main",
      branch_work: "feat/tdd-state",
      merge_target: "main",
      delivery: "internal",
      merge_status: "",
      pr_url: "",
      head_start: "abc",
      head_current: "def",
      dirty_at_start: false,
    },
    baseline: {
      status: "PASS",
      tests: "PASS",
      tests_evidence: "npm test — 117 passed",
      build: "NA",
      build_evidence: "ship.config.json: buildCommand=null",
      override_approved: false,
      known_failures: [{ gate: "build", reason: "buildCommand null", evidence: "ship.config.json" }],
    },
    spec_kit: {
      spec: "./specs/specs002-integracao-robusta-skills/spec.md",
      plan: "./specs/specs002-integracao-robusta-skills/plan.md",
      tasks: "./specs/specs002-integracao-robusta-skills/tasks.md",
      status: "WRITTEN",
      written_at: "2026-08-10T00:00:00.000Z",
      mode: "updated_in_place",
    },
    contract: {
      file: "./specs/specs002-integracao-robusta-skills/contracts/interface-contract.md",
      version: "0.1.0",
      status: "DRAFT",
      na_reason: "",
    },
    acceptance_criteria: T003_AC.map((id) => ({
      id,
      desc: `${id} — fixture documental`,
      source: "./specs/specs002-integracao-robusta-skills/spec.md#criterios-de-aceite",
      tasks: ["T-003"],
      status: "VALIDATED",
    })),
    waves: [
      {
        wave: 1,
        status: "completed",
        integration: { status: "PASS", evidence: "onda 1 integrada; suíte PASS" },
        tasks: [baseTask()],
      },
    ],
  };
}

function doneViolations(progress) {
  const task = progress.waves[0].tasks[0];
  const violations = [];
  if (task.blockers.length > 0) violations.push("blockers");
  if (progress.acceptance_criteria.some((criterion) => !FINAL_AC_STATUS.has(criterion.status))) {
    violations.push("acceptance criteria");
  }
  if (GATES.some((gate) => !["PASS", "NA"].includes(task.gates[gate]))) violations.push("gate status");
  if (GATES.some((gate) => typeof task.gate_evidence[gate] !== "string" || task.gate_evidence[gate].trim() === "")) {
    violations.push("gate evidence");
  }
  if (progress.waves[0].integration.status !== "PASS") violations.push("integration");
  if (task.phase !== "DONE") violations.push("phase");
  return violations;
}

function matrixErrors(matrix) {
  const errors = [];
  if (!matrix || Array.isArray(matrix) || typeof matrix !== "object") return ["matrix must be object"];
  const keys = Object.keys(matrix);
  if (keys.length !== T003_AC.length || T003_AC.some((ac) => !keys.includes(ac))) errors.push("missing or extra AC");
  for (const [ac, references] of Object.entries(matrix)) {
    if (!T003_AC.includes(ac)) continue;
    if (!Array.isArray(references) || references.length === 0) {
      errors.push(`${ac} empty`);
      continue;
    }
    if (references.some((reference) => typeof reference !== "string" || !reference.includes("::"))) {
      errors.push(`${ac} invalid reference`);
    }
  }
  return errors;
}

function consolidatedReportErrors(report) {
  return GATES.flatMap((gate) => {
    const record = report[gate];
    if (!record || typeof record.command !== "string" || record.command.trim() === "") return [`${gate}: command`];
    if (typeof record.output !== "string" || record.output.trim() === "") return [`${gate}: output`];
    if (record.status === "NA" && (typeof record.reason !== "string" || record.reason.trim() === "")) {
      return [`${gate}: NA reason`];
    }
    return [];
  });
}
const RETRY_PHASES = [
  "RED",
  "RED_REVISION",
  "GREEN",
  "GREEN_FIX",
  "REFACTOR",
  "REFACTOR_FIX",
  "REVIEW",
  "DOC",
  "VALIDATE",
  "TOOLING_FIX",
];
const RETRY_SOURCES = [...RETRY_PHASES, "INTEGRATION"];
const TOOLING_EVIDENCE_FIELDS = ["tooling_evidence", "tooling_suite_evidence"];
const NA_AC = "AC-016";

function doneResumeFixture(invalidGate = "coverage") {
  const fixture = baseProgress();
  const task = fixture.waves[0].tasks[0];
  task.phase = "DONE";
  task.attempt = 2;
  task.review = {
    status: "APPROVED",
    agent: "peer-reviewer",
    independent: true,
    evidence: "review SHA def",
  };
  task.red.status = "PASS";
  task.red.failure_reason_expected = true;
  task.red.failing_tests = ["scripts/tdd-state.test.mjs::DONE resume fixture"];
  task.gates[invalidGate] = "pending";
  task.gate_origins[invalidGate] = "CODIGO";
  task.gate_evidence[invalidGate] = "";
  fixture.waves[0].integration = {
    status: "PASS",
    evidence: "onda 1 integrada; suíte PASS; SHA def",
  };
  return fixture;
}

function doneResumeViolations(progress) {
  const task = progress.waves[0].tasks[0];
  const violations = [];
  if (task.blockers.length > 0) violations.push("blockers");
  if (progress.acceptance_criteria.some((criterion) => !FINAL_AC_STATUS.has(criterion.status))) {
    violations.push("acceptance criteria");
  }
  if (task.red.status !== "PASS" || task.red.failure_reason_expected !== true) {
    violations.push("red");
  }
  if (
    task.reviewed_by.trim() === "" ||
    task.reviewed_by === task.implemented_by ||
    task.review?.status !== "APPROVED" ||
    task.review?.independent !== true
  ) {
    violations.push("review");
  }
  if (progress.waves[0].integration.status !== "PASS") violations.push("integration");
  return violations;
}

function invalidMatrixResumeFixture() {
  const fixture = baseProgress();
  const task = fixture.waves[0].tasks[0];
  task.phase = "VALIDATE";
  task.attempt = 2;
  task.blockers = ["historical blocker retained"];
  task.evidence = "historical diagnosis retained";
  task.red.criteria_to_tests = Object.fromEntries(
    T003_AC.map((ac) => [ac, [`scripts/tdd-state.test.mjs::${ac}`]]),
  );
  task.red.revision_baseline_tests = structuredClone(task.red.criteria_to_tests);
  delete task.red.criteria_to_tests[NA_AC];
  return fixture;
}

function retryCapFixture() {
  return {
    phases: Object.fromEntries(
      RETRY_PHASES.map((phase) => [phase, { phase, attempt: 3, expected: "BLOCKED" }]),
    ),
    integration: { status: "FAIL", attempt: 3, expected: "BLOCKED" },
  };
}

function toolingFixFixture() {
  const fixture = baseProgress();
  const task = fixture.waves[0].tasks[0];
  task.phase = "TOOLING_FIX";
  task.gates.lint = "FAIL";
  task.gate_origins.lint = "TOOLING";
  task.gate_evidence.lint = "npm run lint — FAIL";
  task.green.status = "PASS";
  task.green.tooling_evidence = "npm run lint — PASS";
  task.green.tooling_suite_evidence = "";
  return fixture;
}

function toolingEvidenceReady(task) {
  const toolingGate = GATES.find((gate) => task.gate_origins[gate] === "TOOLING");
  return (
    task.phase === "TOOLING_FIX" &&
    toolingGate !== undefined &&
    TOOLING_EVIDENCE_FIELDS.every(
      (field) => typeof task.green[field] === "string" && task.green[field].trim() !== "",
    )
  );
}

function strictMatrixErrors(matrix) {
  const errors = [];
  if (!matrix || Array.isArray(matrix) || typeof matrix !== "object") return ["matrix must be object"];
  const keys = Object.keys(matrix);
  if (keys.length !== T003_AC.length || T003_AC.some((ac) => !keys.includes(ac))) {
    errors.push("missing or extra AC");
  }
  for (const ac of T003_AC) {
    const entry = matrix[ac];
    if (entry && !Array.isArray(entry) && entry.status === "NA") {
      if (typeof entry.reason !== "string" || entry.reason.trim() === "") errors.push(`${ac} NA reason`);
      if (entry.validator !== "validator") errors.push(`${ac} NA validator`);
      if (
        typeof entry.evidence !== "string" ||
        !/(?:contract|interface-contract|spec\.md)/i.test(entry.evidence) ||
        entry.evidence.trim() === ""
      ) {
        errors.push(`${ac} NA evidence`);
      }
      if (typeof entry.reference !== "string" || !entry.reference.includes(ac)) {
        errors.push(`${ac} NA reference`);
      }
      continue;
    }
    if (!Array.isArray(entry) || entry.length === 0) {
      errors.push(`${ac} empty`);
      continue;
    }
    for (const reference of entry) {
      if (typeof reference !== "string") {
        errors.push(`${ac} invalid reference`);
        continue;
      }
      const separator = reference.indexOf("::");
      if (
        separator <= 0 ||
        separator === reference.length - 2 ||
        reference.slice(0, separator).trim() === "" ||
        reference.slice(separator + 2).trim() === ""
      ) {
        errors.push(`${ac} invalid reference`);
      }
    }
  }
  return errors;
}

function waveOrderingErrors(wave) {
  const errors = [];
  const allTasksDone = wave.tasks.every((task) => task.phase === "DONE");
  if (wave.integration.status === "PASS" && !allTasksDone) {
    errors.push("integration before all tasks DONE");
  }
  if (wave.status === "completed" && wave.integration.status !== "PASS") {
    errors.push("completed wave without integration PASS");
  }
  return errors;
}

function resolveAgent(projectAgents, userAgents, basename) {
  const project = projectAgents.filter((entry) => entry.basename === basename);
  const user = userAgents.filter((entry) => entry.basename === basename);
  const duplicate = project.length > 0 && user.length > 0;
  return {
    selected: project[0]?.path ?? user[0]?.path ?? null,
    duplicate,
    reports: {
      stale: [],
      extras: [],
      typeConflicts: [],
    },
  };
}

describe("T-003 — estado TDD 2.2, retomada e integração (RED documental)", () => {
  it("AC-011 — rejeita campos desconhecidos e enums inválidos antes de tratar o JSON como progresso", () => {
    const fixture = baseProgress();
    fixture.unexpected_field = "não permitido";
    fixture.contract.status = "INVALID_CONTRACT_STATUS";
    fixture.waves[0].tasks[0].phase = "UNKNOWN_PHASE";
    fixture.waves[0].tasks[0].gates.tests = "UNKNOWN_GATE";
    fixture.waves[0].tasks[0].gate_origins.tests = "UNKNOWN_ORIGIN";
    fixture.repo.delivery = "UNKNOWN_DELIVERY";
    fixture.spec_kit.status = "UNKNOWN_SPEC_STATUS";
    fixture.waves[0].status = "UNKNOWN_WAVE_STATUS";
    fixture.waves[0].integration.status = "UNKNOWN_INTEGRATION_STATUS";
    fixture.waves[0].tasks[0].red.status = "UNKNOWN_RED_STATUS";
    fixture.waves[0].tasks[0].green.status = "UNKNOWN_GREEN_STATUS";
    fixture.waves[0].tasks[0].refactor.status = "UNKNOWN_REFACTOR_STATUS";
    fixture.waves[0].tasks[0].doc_impact = "UNKNOWN_DOC_IMPACT";

    expect(fixture.repo.delivery).toBe("UNKNOWN_DELIVERY");
    expect(fixture.spec_kit.status).toBe("UNKNOWN_SPEC_STATUS");
    expect(fixture.waves[0].status).toBe("UNKNOWN_WAVE_STATUS");
    expect(fixture.waves[0].integration.status).toBe("UNKNOWN_INTEGRATION_STATUS");
    expect(fixture.waves[0].tasks[0].red.status).toBe("UNKNOWN_RED_STATUS");
    expect(fixture.waves[0].tasks[0].green.status).toBe("UNKNOWN_GREEN_STATUS");
    expect(fixture.waves[0].tasks[0].refactor.status).toBe("UNKNOWN_REFACTOR_STATUS");
    expect(fixture.waves[0].tasks[0].doc_impact).toBe("UNKNOWN_DOC_IMPACT");

    expect(fixture.schema_version).toBe("2.2");
    expect(fixture.unexpected_field).toBe("não permitido");
    expect(fixture.waves[0].tasks[0].phase).toBe("UNKNOWN_PHASE");
    expect(fixture.waves[0].tasks[0].gates.tests).toBe("UNKNOWN_GATE");
    expect(fixture.waves[0].tasks[0].gate_origins.tests).toBe("UNKNOWN_ORIGIN");

    const resumeRules = sectionBetween(skill, "### Passo 0 — Retomada", "### Esquema do `progress.json`");
    expectDocumented("AC-011", resumeRules, [
      /campos?\s+(?:desconhecidos|extras)|chaves?\s+(?:desconhecidas|extras)/i,
      /gate_origins[^\n]{0,140}(?:enum|valores aceitos|origens aceitas)/i,
      /contract\.status[^\n]{0,140}NA[^\n]{0,140}(?:na_reason|justificativa)/i,
    ]);
  });

  it("AC-011 — conserva diagnóstico e reabre/escalona quando a tentativa inválida não pode ser normalizada", () => {
    const fixture = baseProgress();
    fixture.waves[0].tasks[0].phase = "VALIDATE";
    fixture.waves[0].tasks[0].attempt = 3;
    fixture.waves[0].tasks[0].blockers = ["enum inválido no resume"];
    fixture.waves[0].tasks[0].evidence = "diagnóstico original";

    expect(fixture.waves[0].tasks[0].attempt).toBe(3);
    expect(fixture.waves[0].tasks[0].blockers).toHaveLength(1);
    expect(fixture.waves[0].tasks[0].evidence).toBe("diagnóstico original");

    const resumeRules = sectionBetween(skill, "### Passo 0 — Retomada", "### Esquema do `progress.json`");
    expectDocumented("AC-011", resumeRules, [
      /tentativa[^\n]{0,120}(?:inválid|desconhecid)[^\n]{0,160}(?:diagnóstico|histórico)[^\n]{0,160}(?:BLOCKED|bloque)/i,
      /attempt\s*>=\s*3[^\n]{0,160}(?:preserv|mant)[^\n]{0,160}(?:escal|BLOCKED)/i,
    ]);
  });

  it("AC-012 — impede DONE/commit para cada violação independente de gate, AC, blocker ou integração", () => {
    const variants = [
      ["blocker", (progress) => { progress.waves[0].tasks[0].blockers = ["review pendente"]; }],
      ["AC não final", (progress) => { progress.acceptance_criteria[0].status = "PENDING"; }],
      ["gate pendente", (progress) => { progress.waves[0].tasks[0].gates.tests = "pending"; }],
      ["evidência vazia", (progress) => { progress.waves[0].tasks[0].gate_evidence.tests = ""; }],
      ["integração pendente", (progress) => { progress.waves[0].integration.status = "pending"; }],
    ];

    for (const [label, mutate] of variants) {
      const fixture = baseProgress();
      fixture.waves[0].tasks[0].phase = "DONE";
      mutate(fixture);
      expect(doneViolations(fixture), label).toContain(
        label === "AC não final" ? "acceptance criteria" : label === "gate pendente" ? "gate status" : label === "evidência vazia" ? "gate evidence" : label === "integração pendente" ? "integration" : "blockers",
      );
    }

    const taskRules = sectionBetween(skill, "## Máquina de estados por tarefa", "## Paralelismo");
    expectDocumented("AC-012", taskRules, [
      /DONE[^\n]{0,220}(?:blockers|bloqueio)[^\n]{0,100}(?:vazio|empty|zero)/i,
      /DONE[^\n]{0,220}(?:AC|critério)[^\n]{0,120}(?:final|VALIDATED|IMPLEMENTED)/i,
      /DONE[^\n]{0,220}integration\.status[^\n]{0,120}PASS/i,
      /NA[^\n]{0,180}(?:não|nao) substitui[^\n]{0,100}PASS/i,
    ]);
  });

  it("AC-013 — resume preserva provas válidas e limpa somente campos invalidados pela transição", () => {
    const fixture = baseProgress();
    const task = fixture.waves[0].tasks[0];
    task.gate_origins.tests = "TESTE";
    task.gate_evidence.tests = "npm test — falha de asserção registrada";
    fixture.baseline.tests_evidence = "npm test — 117 passed";
    fixture.baseline.build_evidence = "ship.config.json: buildCommand=null";
    task.blockers = ["decisão do usuário pendente"];
    task.evidence = "review APROVADO; decisão pendente; integração PASS";
    fixture.waves[0].integration.evidence = "onda integrada SHA abc; suíte PASS";

    const preserved = [
      task.gate_evidence.tests,
      task.gate_origins.tests,
      fixture.baseline.tests_evidence,
      fixture.baseline.build_evidence,
      task.blockers[0],
      task.evidence,
      fixture.waves[0].integration.evidence,
    ];
    expect(preserved.every((value) => typeof value === "string" && value.length > 0)).toBe(true);
    expect(task.gate_origins.tests).toBe("TESTE");
    expect(fixture.waves[0].integration.evidence).toContain("SHA");

    const resumeRules = sectionBetween(skill, "### Passo 0 — Retomada", "### Esquema do `progress.json`");
    expectDocumented("AC-013", resumeRules, [
      /retomad\w*[^\n]{0,80}(?:preserv|mant)[^\n]{0,100}(?:gate_evidence|evidência de gate)/i,
      /retomad\w*[^\n]{0,120}(?:baseline\.tests_evidence|baseline\.build_evidence)/i,
      /retomad\w*[^\n]{0,180}(?:blockers|decis(?:ão|ões) pendente|veredito de review|integration\.evidence)/i,
      /somente|só[^\n]{0,160}(?:campos|fields)[^\n]{0,120}(?:invalidad|limp|reset)/i,
    ]);
  });

  it("AC-014 — exige objeto exato AC→teste, rejeita matriz texto/incompleta/extra e rastreia NA documental", () => {
    const complete = Object.fromEntries(
      T003_AC.map((ac) => [ac, [`scripts/tdd-state.test.mjs::${ac} fixture`]]),
    );
    const textMatrix = T003_AC.map((ac) => `${ac} -> scripts/tdd-state.test.mjs::${ac}`).join("\n");
    const incomplete = { ...complete };
    delete incomplete["AC-016"];
    const extra = { ...complete, "AC-999": ["docs/spec.md::evidência"] };
    const normativeNa = {
      status: "NA",
      reason: "critério exclusivamente normativo",
      validator: "validator",
      evidence: "interface-contract.md#invariantes",
      reference: "spec.md#AC-016",
    };

    expect(matrixErrors(complete)).toEqual([]);
    expect(matrixErrors(textMatrix)).not.toEqual([]);
    expect(matrixErrors(incomplete)).not.toEqual([]);
    expect(matrixErrors(extra)).not.toEqual([]);
    expect(normativeNa.status).toBe("NA");
    expect(normativeNa.reason).not.toBe("");
    expect(normativeNa.validator).toBe("validator");
    expect(normativeNa.evidence).toContain("interface-contract.md");
    expect(normativeNa.reference).toContain("spec.md");

    const matrixRules = sectionBetween(skill, "## Máquina de estados por tarefa", "## Paralelismo");
    expectDocumented("AC-014", matrixRules, [
      /objeto[^\n]{0,100}AC(?:→|->)teste[^\n]{0,160}(?:exatamente|sem ausentes|sem extras)/i,
      /AC[^\n]{0,100}(?:exclusivamente normativo|normativo)[^\n]{0,120}NA[^\n]{0,160}(?:razão|motivo)[^\n]{0,160}(?:validator|evidência documental)[^\n]{0,160}(?:contrato|spec)/i,
    ]);
  });

  it("AC-015 — bloqueia entrega sem relatório consolidado por gate e registra buildCommand null como NA", () => {
    const report = Object.fromEntries(
      GATES.map((gate) => [
        gate,
        {
          status: gate === "build" ? "NA" : "PASS",
          command: gate === "build" ? "read ship.config.json" : `npm run ${gate}`,
          output: gate === "build" ? "buildCommand=null" : `${gate}: PASS`,
          ...(gate === "build" ? { reason: "build não configurado" } : {}),
        },
      ]),
    );
    const missingGate = { ...report };
    delete missingGate.security;
    const missingNaReason = { ...report, build: { ...report.build, reason: "" } };

    expect(consolidatedReportErrors(report)).toEqual([]);
    expect(consolidatedReportErrors(missingGate)).toContain("security: command");
    expect(consolidatedReportErrors(missingNaReason)).toContain("build: NA reason");
    expect(report.build.output).toContain("buildCommand=null");

    const finalRules = sectionBetween(skill, "## Entrega final", "## Regras invioláveis");
    expectDocumented("AC-015", finalRules, [
      /validação consolidada[^\n]{0,180}(?:cada gate|por gate)[^\n]{0,180}(?:comando|command)[^\n]{0,180}(?:trecho|saída)[^\n]{0,180}(?:persiste|registra)/i,
      /buildCommand\s*=\s*null[^\n]{0,160}(?:build:\s*NA|NA)[^\n]{0,160}(?:motivo|razão)/i,
      /relatório[^\n]{0,180}(?:incompleto|ausente)[^\n]{0,120}(?:bloque|não entrega|não pode entregar)/i,
    ]);
  });

  it("AC-016 — após cada integração exige peer-review independente e nova execução dos gates", () => {
    const integratedWave = {
      integration: { status: "PASS", evidence: "onda 1 integrada" },
      review: { agent: "peer-reviewer", independent: true, revision: "abc" },
      validation: { agent: "validator", suite: "npm test", gates: "reexecutados", evidence: "PASS" },
    };
    const behaviorChange = {
      ...integratedWave,
      integration: { status: "FAIL", evidence: "conflito resolvido com mudança comportamental" },
      correction: { behaviorChanged: true, nextPhase: "RED_REVISION" },
    };

    expect(integratedWave.review.independent).toBe(true);
    expect(integratedWave.validation.gates).toBe("reexecutados");
    expect(behaviorChange.correction.nextPhase).toBe("RED_REVISION");
    expect(behaviorChange.correction.nextPhase).not.toBe("DONE");

    const integrationRules = sectionBetween(skill, "## Integração por onda", "## Quality Gates");
    expectDocumented("AC-016", integrationRules, [
      /ap[oó]s cada integra(?:ção|tion)[^\n]{0,200}(?:peer-reviewer|peer review)[^\n]{0,160}(?:independente|independent)/i,
      /validator[^\n]{0,180}(?:repete|reexecuta|executa novamente)[^\n]{0,180}(?:su[ií]te|gates)/i,
      /mudan(?:ça|c)\w* comportamental[^\n]{0,180}(?:RED|TDD|ciclo)/i,
    ]);
  });

  it("AC-023 — reporta stale/extras/conflitos separadamente e nunca deixa o perfil sobrescrever projeto", () => {
    const projectAgents = [
      { basename: "validator", path: "./.omp/agents/validator.md", kind: "project" },
      { basename: "peer-reviewer", path: "./.omp/agents/peer-reviewer.md", kind: "project" },
    ];
    const userAgents = [
      { basename: "validator", path: "~/.omp/agent/agents/validator.md", kind: "user" },
      { basename: "peer-reviewer", path: "~/.omp/agent/agents/peer-reviewer.md", kind: "user" },
    ];
    const resolved = resolveAgent(projectAgents, userAgents, "validator");
    resolved.reports.stale.push("~/.omp/agent/agents/old-validator.md");
    resolved.reports.extras.push("~/.omp/agent/agents/user-extra.md");
    resolved.reports.typeConflicts.push("validator.md: arquivo vs diretório");
    resolved.reports.duplicates = ["validator"];

    expect(resolved.selected).toBe("./.omp/agents/validator.md");
    expect(resolved.duplicate).toBe(true);
    expect(resolved.reports.stale).toHaveLength(1);
    expect(resolved.reports.extras).toHaveLength(1);
    expect(resolved.reports.typeConflicts).toHaveLength(1);
    expect(resolved.reports.duplicates).toEqual(["validator"]);

    const agentRules = sectionBetween(skill, "> **Pré-requisito — subagentes", "## Tabela de papéis");
    expectDocumented("AC-023", agentRules, [
      /stale[^\n]{0,140}(?:report|relat|categor)/i,
      /duplicat[^\n]{0,140}(?:report|relat|categor)/i,
      /extras?[^\n]{0,140}(?:usu[aá]rio|user)[^\n]{0,140}(?:report|relat|categor)/i,
      /conflitos? de tipo[^\n]{0,140}(?:report|relat|categor)/i,
      /escopo de projeto[^\n]{0,180}(?:não|nao|never)[^\n]{0,180}(?:perfil|usu[aá]rio|instala)/i,
    ]);
  });
  it("AC-012 — retomada de DONE revalida blockers, ACs, RED, review e integração antes de preservar o atalho", () => {
    const invalidations = [
      ["blockers", (fixture) => { fixture.waves[0].tasks[0].blockers = ["blocker reaberto"]; }],
      ["acceptance criteria", (fixture) => { fixture.acceptance_criteria[0].status = "PENDING"; }],
      ["red", (fixture) => { fixture.waves[0].tasks[0].red.status = "PENDING"; }],
      ["review", (fixture) => { fixture.waves[0].tasks[0].reviewed_by = ""; }],
      ["integration", (fixture) => { fixture.waves[0].integration.status = "pending"; }],
    ];

    for (const [label, mutate] of invalidations) {
      const fixture = doneResumeFixture();
      mutate(fixture);
      expect(doneResumeViolations(fixture), label).toContain(label);
    }

    const resumeRules = sectionBetween(skill, "Se um objeto de tarefa legado tiver `phase: DONE`", "Ao migrar `red.criteria_to_tests`");
    for (const field of ["blockers", "acceptance_criteria", "red.status", "reviewed_by", "integration.status"]) {
      const escapedField = field.replace(".", "\\.");
      expect(
        resumeRules,
        `DONE resume must revalidate ${field} in the concrete state fixture`,
      ).toMatch(new RegExp(`phase: DONE[\\s\\S]{0,900}${escapedField}`));
    }
  });

  it("AC-013 — ao invalidar um gate, preserva gates/evidências válidos e limpa somente o campo inválido", () => {
    const invalidGate = "coverage";
    const validGate = "tests";
    const fixture = doneResumeFixture(invalidGate);
    const task = fixture.waves[0].tasks[0];
    const preserved = {
      attempt: task.attempt,
      gate: task.gates[validGate],
      evidence: task.gate_evidence[validGate],
      integrationEvidence: fixture.waves[0].integration.evidence,
    };

    expect(task.gates[invalidGate]).toBe("pending");
    expect(task.gate_origins[invalidGate]).toBe("CODIGO");
    expect(task.gate_evidence[invalidGate]).toBe("");
    expect(preserved).toEqual({
      attempt: 2,
      gate: "PASS",
      evidence: "comando tests; trecho PASS",
      integrationEvidence: "onda 1 integrada; suíte PASS; SHA def",
    });

    const resumeRules = sectionBetween(skill, "Se um objeto de tarefa legado tiver `phase: DONE`", "Ao migrar `red.criteria_to_tests`");
    expect(resumeRules).not.toMatch(/redefina os dez `gates` para `pending`/i);
    expect(resumeRules).toMatch(
      /gate(?:s)?[^\n]{0,220}(?:inválid|invalid)[^\n]{0,220}(?:somente|apenas)[^\n]{0,220}(?:gate_evidence|gate_origins)/i,
    );
  });

  it("AC-011/AC-013 — reset de matriz conserva tentativa/histórico e todo contador de retry bloqueia em três", () => {
    const fixture = invalidMatrixResumeFixture();
    const task = fixture.waves[0].tasks[0];
    expect(task.attempt).toBe(2);
    expect(task.blockers).toEqual(["historical blocker retained"]);
    expect(task.evidence).toBe("historical diagnosis retained");
    expect(task.red.revision_baseline_tests[NA_AC]).toEqual([
      `scripts/tdd-state.test.mjs::${NA_AC}`,
    ]);
    expect(task.red.criteria_to_tests[NA_AC]).toBeUndefined();

    const capped = retryCapFixture();
    for (const source of RETRY_SOURCES) {
      const counter = source === "INTEGRATION" ? capped.integration : capped.phases[source];
      expect(counter, `${source} retry counter`).toMatchObject({ attempt: 3, expected: "BLOCKED" });
    }

    const resumeRules = sectionBetween(skill, "### Passo 0 — Retomada", "### Esquema do `progress.json`");
    expect(resumeRules).not.toMatch(/attempt:\s*0/i);
    expect(resumeRules).not.toMatch(/limpe `blockers` e `evidence`/i);
    expect(resumeRules).toMatch(/attempt[^\n]{0,180}(?:preserv|mant)[^\n]{0,180}(?:blockers|evidence)/i);
    expect(resumeRules).toMatch(/integration\.attempt[^\n]{0,180}attempt\s*>=\s*3/i);

    const schema = sectionBetween(skill, "### Esquema do `progress.json`", "## Fase 0 — Planejamento");
    expect(schema).toMatch(/"integration"\s*:\s*\{[^}]*"attempt"\s*:\s*0/i);
  });

  it("AC-011 — divergência de branch exige decisão explícita e nunca faz checkout automático", () => {
    const fixture = baseProgress();
    const divergence = {
      expectedBranch: fixture.repo.branch_work,
      observedBranch: "main",
      headInState: fixture.repo.head_current,
      headObserved: "stale-head",
      decision: "",
      automaticCheckout: false,
    };

    expect(divergence.expectedBranch).not.toBe(divergence.observedBranch);
    expect(divergence.headInState).not.toBe(divergence.headObserved);
    expect(divergence.decision).toBe("");
    expect(divergence.automaticCheckout).toBe(false);

    const resumeRules = sectionBetween(skill, "### Passo 0 — Retomada (antes de tudo)", "### Esquema do `progress.json`");
    expect(resumeRules).not.toMatch(/se não for, faça `git checkout <branch_work>`/i);
    expect(resumeRules).toMatch(
      /divergência[^\n]{0,180}(?:decisão|decision)[^\n]{0,180}(?:retomar|reconciliar|abortar)/i,
    );
  });

  it("AC-015 — TOOLING_FIX só avança com as duas evidências verdes do gate e da suíte", () => {
    const fixture = toolingFixFixture();
    const task = fixture.waves[0].tasks[0];

    expect(toolingEvidenceReady(task)).toBe(false);
    task.green.tooling_suite_evidence = "npm test — 117 passed";
    expect(toolingEvidenceReady(task)).toBe(true);

    const taskRules = sectionBetween(skill, "## Máquina de estados por tarefa", "## Diagrama da máquina de estados");
    expect(taskRules).toMatch(
      /TOOLING_FIX[\s\S]{0,500}origin:\s*TOOLING[\s\S]{0,500}green\.tooling_evidence[\s\S]{0,180}green\.tooling_suite_evidence[\s\S]{0,180}(?:ambos|não vazios|preenchidos)/i,
    );
  });

  it("AC-014 — seam NA mantém a entrada do AC e exige referência exata ao mesmo AC", () => {
    const complete = Object.fromEntries(
      T003_AC.map((ac) => [ac, [`scripts/tdd-state.test.mjs::${ac} fixture`]]),
    );
    const validNa = {
      status: "NA",
      reason: "critério exclusivamente normativo",
      validator: "validator",
      evidence: "interface-contract.md#invariantes",
      reference: `spec.md#${NA_AC}`,
    };
    const validMatrix = { ...complete, [NA_AC]: validNa };
    const wrongReference = {
      ...validMatrix,
      [NA_AC]: { ...validNa, reference: "spec.md#AC-015" },
    };
    const emptyReference = {
      ...validMatrix,
      "AC-011": ["::teste sem arquivo"],
    };

    expect(strictMatrixErrors(validMatrix)).toEqual([]);
    expect(strictMatrixErrors(wrongReference)).toContain(`${NA_AC} NA reference`);
    expect(strictMatrixErrors(emptyReference)).toContain("AC-011 invalid reference");

    const matrixRules = sectionBetween(skill, "## Máquina de estados por tarefa", "## Paralelismo");
    expect(matrixRules).toMatch(
      /NA[\s\S]{0,220}(?:reference|referência)[\s\S]{0,180}(?:mesmo|próprio|same)[\s\S]{0,180}(?:AC|id)/i,
    );
  });

  it("AC-016 — ordem de onda separa DONE das integrações e só conclui após review/validation", () => {
    const beforeIntegration = baseProgress().waves[0];
    beforeIntegration.status = "in_progress";
    beforeIntegration.tasks[0].phase = "DONE";
    beforeIntegration.integration = { status: "pending", evidence: "" };

    const integrating = structuredClone(beforeIntegration);
    integrating.status = "integrating";
    const completed = structuredClone(integrating);
    completed.status = "completed";
    completed.integration = { status: "PASS", evidence: "validator + peer-review PASS" };
    const prematureIntegration = structuredClone(beforeIntegration);
    prematureIntegration.integration = { status: "PASS", evidence: "premature" };
    prematureIntegration.tasks[0].phase = "VALIDATE";

    expect(waveOrderingErrors(beforeIntegration)).toEqual([]);
    expect(waveOrderingErrors(integrating)).toEqual([]);
    expect(waveOrderingErrors(completed)).toEqual([]);
    expect(waveOrderingErrors(prematureIntegration)).toContain("integration before all tasks DONE");

    const taskRules = sectionBetween(skill, "## Máquina de estados por tarefa", "## Diagrama da máquina de estados");
    expect(taskRules).not.toMatch(/DONE[^\n]{0,220}integration\.status[^\n]{0,100}PASS/i);

    const diagram = sectionBetween(skill, "## Diagrama da máquina de estados", "### Estado por estado");
    const taskDone = diagram.indexOf("CICLO_TAREFA --> INTEGRATE");
    const postReview = diagram.indexOf("POST_INTEGRATION_REVIEW");
    const postValidation = diagram.indexOf("POST_INTEGRATION_VALIDATE");
    const waveCommit = diagram.indexOf("COMMIT_ONDA");
    expect(taskDone).toBeGreaterThanOrEqual(0);
    expect(taskDone).toBeLessThan(postReview);
    expect(postReview).toBeLessThan(postValidation);
    expect(postValidation).toBeLessThan(waveCommit);
    expect(diagram).toMatch(
      /COMMIT_ONDA[\s\S]{0,500}(?:integration\.status|integração)[\s\S]{0,120}PASS/i,
    );
  });


  it("mantém os fixtures ancorados no contrato 0.1.0 e nos critérios T-003, sem rede", () => {
    expect(contract).toMatch(/Versão:\**\s*0\.1\.0/);
    expect(contract).toContain('schema_version: "2.2"');
    expect(contract).toMatch(/`DONE`\s*só é válido/);
    expect(contract).toContain("gate_evidence");
    for (const ac of T003_AC) expect(spec).toContain(`**${ac}:**`);
  });
});
