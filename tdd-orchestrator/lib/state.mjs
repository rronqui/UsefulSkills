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

const GATE_STATUSES = new Set(["pending", "PASS", "FAIL", "NA"]);
const GATE_ORIGINS = new Set(["", "TESTE", "CODIGO", "TOOLING", "REFACTOR", "SPEC-CONTRATO"]);
const TASK_PHASES = new Set([
  "PENDING", "RED", "RED_REVISION", "GREEN", "GREEN_FIX", "TOOLING_FIX",
  "REFACTOR", "REFACTOR_FIX", "REVIEW", "DOC", "VALIDATE", "DONE", "BLOCKED",
]);
const WAVE_STATUSES = new Set(["pending", "in_progress", "integrating", "completed"]);
const INTEGRATION_STATUSES = new Set(["pending", "PASS", "FAIL"]);
const REVIEW_STATUSES = new Set(["PENDING", "APPROVED", "BLOCKED"]);
const ACCEPTANCE_STATUSES = new Set(["PENDING", "COVERED", "IMPLEMENTED", "VALIDATED"]);
const BUILD_STATUSES = new Set(["PASS", "FAIL", "NA", "NOT_RUN"]);
const RESOLVED_GATE_STATUSES = new Set(["PASS", "FAIL", "NA"]);
const COMPLETED_GATE_STATUSES = new Set(["PASS", "NA"]);
const FINAL_AC_STATUSES = new Set(["IMPLEMENTED", "VALIDATED"]);
const RED_STATUSES = new Set(["PENDING", "PASS"]);
const ASSIGNED_TASK_PHASES = new Set([
  "RED", "RED_REVISION", "GREEN", "GREEN_FIX", "TOOLING_FIX",
  "REFACTOR", "REFACTOR_FIX", "REVIEW", "DOC", "VALIDATE", "DONE",
]);
const GREEN_STATUSES = new Set(["PENDING", "PASS", "SKIPPED"]);
const REFACTOR_STATUSES = new Set(["PENDING", "PASS", "SKIPPED"]);
const BASELINE_STATUSES = new Set(["PASS", "FAIL", "NOT_RUN"]);
const DELIVERY_STATUSES = new Set(["internal", "external"]);
const MERGE_STATUSES = new Set(["", "PR", "DONE", "SKIPPED", "NOT_NEEDED"]);
const SPEC_KIT_STATUSES = new Set(["PENDING", "WRITTEN"]);
const SPEC_KIT_MODES = new Set(["created", "updated_in_place"]);
const CONTRACT_STATUSES = new Set(["DRAFT", "APPROVED", "NA"]);
const BASELINE_GATES = ["tests", "build"];
const RED_COMPLETE_PHASES = new Set(["GREEN", "GREEN_FIX", "TOOLING_FIX", "REFACTOR", "REFACTOR_FIX", "REVIEW", "DOC", "VALIDATE", "DONE"]);
const TEST_REF = /^[^:\r\n]+::[^:\r\n]+$/;
const NORMATIVE_AC = "AC-019";

const ROOT_KEYS = [
  "schema_version", "run_id", "task_source", "updated_at", "repo", "baseline",
  "spec_kit", "contract", "acceptance_criteria", "waves",
];
const REPO_KEYS = [
  "branch_start", "branch_work", "merge_target", "delivery", "merge_status", "pr_url",
  "head_start", "head_current", "dirty_at_start",
];
const BASELINE_KEYS = [
  "status", "tests", "tests_evidence", "build", "build_evidence", "override_approved", "known_failures",
];
const SPEC_KIT_KEYS = ["spec", "plan", "tasks", "status", "written_at", "mode"];
const CONTRACT_KEYS = ["file", "version", "status", "na_reason"];
const AC_KEYS = ["id", "desc", "source", "tasks", "status"];
const WAVE_KEYS = ["wave", "status", "integration", "tasks"];
const INTEGRATION_KEYS = ["status", "attempt", "evidence"];
const TASK_KEYS = [
  "id", "title", "phase", "attempt", "allowed_write_globs", "acceptance_criteria",
  "implemented_by", "reviewed_by", "review", "red", "green", "refactor", "doc_impact",
  "gates", "gate_origins", "gate_evidence", "blockers", "evidence",
];
const REVIEW_KEYS = ["status", "agent", "independent", "revision", "evidence"];
const RED_KEYS = [
  "status", "failing_tests", "failure_reason_expected", "criteria_to_tests",
  "revision_delta", "revision_baseline_tests",
];
const RED_DELTA_KEYS = ["ac", "test", "evidence"];
const GREEN_KEYS = ["status", "reason_if_skipped", "changed_files", "tooling_evidence", "tooling_suite_evidence"];
const REFACTOR_KEYS = ["status", "reason_if_skipped"];

function clone(input) {
  if (typeof structuredClone === "function") return structuredClone(input);
  return JSON.parse(JSON.stringify(input));
}

function result(ok, value, errors = []) {
  return ok ? { ok: true, value, errors: [] } : { ok: false, errors: [...new Set(errors.filter(Boolean))] };
}

function hasOwn(value, key) {
  return value !== null && value !== undefined && Object.prototype.hasOwnProperty.call(value, key);
}

function validateStringFields(object, fields, path, errors) {
  for (const field of fields) {
    if (typeof object[field] !== "string") errors.push(`${path}.${field}: must be string`);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function checkKeys(object, expected, path, errors, { required = true } = {}) {
  if (!isObject(object)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  const expectedSet = expected instanceof Set ? expected : new Set(expected);
  for (const key of Object.keys(object)) {
    if (!expectedSet.has(key)) errors.push(`${path}.${key}: unknown or extra key`);
  }
  if (required) {
    for (const key of expected) {
      if (!(key in object)) errors.push(`${path}.${key}: missing required field`);
    }
  }
  return true;
}

function collectDiagnostics(value, path = "diagnostic") {
  const found = [];
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === "blockers" || key === "evidence" || key.includes("diagnos")) {
        found.push(...collectDiagnostics(item, `${path}.${key}`));
      } else if (isObject(item) || Array.isArray(item)) {
        found.push(...collectDiagnostics(item, `${path}.${key}`));
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => found.push(...collectDiagnostics(item, `${path}[${index}]`)));
  } else if (typeof value === "string" && value.trim()) {
    found.push(`${path}: ${value}`);
  }
  return found;
}

function validateReview(review, path, errors, { requireApproval = false, requirePeerReviewer = false } = {}) {
  if (!checkKeys(review, REVIEW_KEYS, path, errors)) return;
  if (!REVIEW_STATUSES.has(review.status)) errors.push(`${path}.status: invalid review enum`);
  if (typeof review.agent !== "string" || typeof review.revision !== "string" || typeof review.evidence !== "string") {
    errors.push(`${path}: agent, revision and evidence must be strings`);
  }
  if (typeof review.independent !== "boolean") errors.push(`${path}.independent: must be boolean`);
  if (review.status === "APPROVED" || requireApproval) {
    if (review.status !== "APPROVED") errors.push(`${path}: review must be APPROVED`);
    if (!nonEmptyString(review.agent)) errors.push(`${path}.agent: required for approved review`);
    if (!nonEmptyString(review.revision)) errors.push(`${path}.revision: required for approved review`);
    if (!nonEmptyString(review.evidence)) errors.push(`${path}.evidence: required for approved review`);
    if (review.independent !== true) errors.push(`${path}.independent: approved review must be independent`);
    if (requirePeerReviewer && review.agent !== "peer-reviewer") errors.push(`${path}.agent: peer-reviewer required`);
  } else if (review.status === "PENDING") {
    if (review.agent !== "" || review.revision !== "" || review.evidence !== "" || review.independent !== false) {
      errors.push(`${path}: pending review must use the compatibility empty proof`);
    }
  }
}

function validateGateMaps(task, path, errors) {
  checkKeys(task.gates, GATES, `${path}.gates`, errors);
  checkKeys(task.gate_origins, GATES, `${path}.gate_origins`, errors);
  checkKeys(task.gate_evidence, GATES, `${path}.gate_evidence`, errors);
  for (const gate of GATES) {
    validateGateEntry(task.gates, task.gate_origins, task.gate_evidence, path, gate, errors);
  }
}
function isNormativeTask(task) {
  return Array.isArray(task?.acceptance_criteria)
    && task.acceptance_criteria.length === 1
    && task.acceptance_criteria[0] === NORMATIVE_AC
    && task.red?.criteria_to_tests?.[NORMATIVE_AC]?.status === "NA";
}

function hasCanonicalSpecKitEvidence(evidence) {
  const normalized = String(evidence).replaceAll("\\", "/");
  return ["spec.md", "plan.md", "tasks.md", "interface-contract.md"].every((file) => normalized.includes(file));
}
function isSpecificGateEvidence(gate, status, evidence) {
  if (!nonEmptyString(evidence)) return false;
  if (gate === "spec_kit" && !hasCanonicalSpecKitEvidence(evidence)) return false;
  if (status === "NA" && gate === "build") return /\bbuildCommand\s*=\s*null(?![A-Za-z0-9_$])/i.test(evidence);
  return true;
}
function validateGateEntry(gates, origins, evidenceByGate, path, gate, errors) {
  const status = gates?.[gate];
  const origin = origins?.[gate];
  const evidence = evidenceByGate?.[gate];
  if (!GATE_STATUSES.has(status)) errors.push(`${path}.gates.${gate}: invalid status enum`);
  if (typeof origin !== "string" || !GATE_ORIGINS.has(origin)) errors.push(`${path}.gate_origins.${gate}: invalid origin enum`);
  if (typeof evidence !== "string") errors.push(`${path}.gate_evidence.${gate}: evidence must be a string`);
  if (RESOLVED_GATE_STATUSES.has(status) && !isSpecificGateEvidence(gate, status, evidence)) errors.push(`${path}.gate_evidence.${gate}: specific evidence required`);
  if (status !== "FAIL" && origin !== "") errors.push(`${path}.gate_origins.${gate}: origin only allowed for FAIL`);
  if (status === "FAIL" && origin === "") errors.push(`${path}.gate_origins.${gate}: origin required for FAIL`);
}
function hasGateEvidence(evidenceByGate) {
  return isObject(evidenceByGate) && GATES.every((gate) => nonEmptyString(evidenceByGate[gate]));
}

function indexTasksById(waves) {
  const tasksById = new Map();
  for (const wave of waves) {
    if (!isObject(wave) || !Array.isArray(wave.tasks)) continue;
    for (const task of wave.tasks) if (isObject(task) && nonEmptyString(task.id)) tasksById.set(task.id, task);
  }
  return tasksById;
}

function validateDoneAcceptanceLinks(waves, acceptanceById, errors) {
  for (const [wi, wave] of waves.entries()) {
    if (!isObject(wave) || !Array.isArray(wave.tasks)) continue;
    for (const [ti, task] of wave.tasks.entries()) {
      if (!isDoneTask(task)) continue;
      const path = `progress.waves[${wi}].tasks[${ti}]`;
      for (const acId of Array.isArray(task.acceptance_criteria) ? task.acceptance_criteria : []) {
        const ac = acceptanceById.get(acId);
        if (!ac) {
          errors.push(`${path}: DONE references unknown AC ${acId}`);
          continue;
        }
        if (!Array.isArray(ac.tasks) || !ac.tasks.includes(task.id)) {
          errors.push(`${path}: DONE AC ${acId} is not linked to task ${task.id}`);
        }
        if (!FINAL_AC_STATUSES.has(ac.status)) {
          errors.push(`${path}: DONE AC ${acId} requires final status IMPLEMENTED or VALIDATED`);
        }
      }
    }
  }
}



function validateFinalAcceptanceLinks(progress, errors) {
  if (!Array.isArray(progress.waves) || !Array.isArray(progress.acceptance_criteria)) return;
  const acceptanceById = new Map(progress.acceptance_criteria.map((ac) => [ac?.id, ac]));
  const tasksById = indexTasksById(progress.waves);
  for (const [aci, ac] of progress.acceptance_criteria.entries()) {
    if (!isObject(ac) || !Array.isArray(ac.tasks)) continue;
    for (const taskId of ac.tasks) {
      const task = tasksById.get(taskId);
      if (!task) {
        errors.push(`progress.acceptance_criteria[${aci}]: references unknown task ${taskId}`);
        continue;
      }
      if (!Array.isArray(task.acceptance_criteria) || !task.acceptance_criteria.includes(ac.id)) {
        errors.push(`progress.acceptance_criteria[${aci}]: task ${taskId} is not linked back to ${ac.id}`);
      }
    }
  }
  validateDoneAcceptanceLinks(progress.waves, acceptanceById, errors);
}


function validateNormativeEntry(entry, ac, path, errors) {
  const exact = ["status", "reason", "validator", "evidence", "reference"];
  checkKeys(entry, exact, path, errors);
  if (!isObject(entry) || entry.status !== "NA") errors.push(`${path}: exact normative NA object required`);
  for (const field of exact.slice(1)) if (!nonEmptyString(entry?.[field])) errors.push(`${path}.${field}: non-empty value required`);
  if (entry?.validator !== "spec-kit-validator") errors.push(`${path}.validator: must be spec-kit-validator`);
  if (typeof entry?.reference === "string" && !entry.reference.includes(ac)) errors.push(`${path}.reference: must reference ${ac}`);
}

export function validateCriteriaMatrix(task) {
  const errors = [];
  if (!isObject(task)) return result(false, undefined, ["task must be an object"]);
  const acceptance = task.acceptance_criteria;
  const matrix = task.red?.criteria_to_tests;
  if (!Array.isArray(acceptance) || acceptance.length === 0) errors.push("task.acceptance_criteria: non-empty array required");
  if (Array.isArray(acceptance)) {
    const ids = new Set();
    acceptance.forEach((id, index) => {
      if (typeof id !== "string" || !/^AC-\d{3}$/.test(id)) errors.push(`acceptance_criteria[${index}]: invalid AC id`);
      else if (ids.has(id)) errors.push(`acceptance_criteria: duplicate ${id}`);
      else ids.add(id);
    });
    if (!isObject(matrix)) errors.push("red.criteria_to_tests: matrix must be an object");
    else {
      const allowed = new Set(acceptance);
      const owners = new Map();
      for (const key of Object.keys(matrix)) if (!allowed.has(key)) errors.push(`criteria_to_tests.${key}: unknown or extra AC`);
      for (const ac of acceptance) {
        const entry = matrix[ac];
        if (ac === NORMATIVE_AC) {
          if (acceptance.length !== 1) errors.push(`criteria_to_tests.${ac}: normative NA is allowed only for an exclusively normative task`);
          validateNormativeEntry(entry, ac, `criteria_to_tests.${ac}`, errors);
        } else if (!Array.isArray(entry) || entry.length === 0 || Object.keys(entry ?? {}).length !== entry.length) {
          errors.push(`criteria_to_tests.${ac}: executable AC needs a dense non-empty test list`);
        } else {
          entry.forEach((ref, index) => {
            if (typeof ref !== "string" || !TEST_REF.test(ref)) {
              errors.push(`criteria_to_tests.${ac}[${index}]: invalid test reference; expected arquivo::teste`);
            } else if (owners.has(ref) && owners.get(ref) !== ac) {
              errors.push(`criteria_to_tests: test ${ref} is duplicated across ACs ${owners.get(ref)} and ${ac}`);
            } else {
              owners.set(ref, ac);
            }
          });
        }
      }
    }
  }
  if (errors.length !== 0) return result(false, undefined, errors);
  try {
    return result(true, clone(task), []);
  } catch (error) {
    return result(false, undefined, [`task malformed: ${error instanceof Error ? error.message : String(error)}`]);
  }
}

function validateRevisionBaseline(task, path, errors) {
  const baseline = task.red?.revision_baseline_tests;
  if (!isObject(baseline)) return;
  const acceptance = Array.isArray(task.acceptance_criteria) ? task.acceptance_criteria : [];
  const allowed = new Set(acceptance);
  for (const ac of Object.keys(baseline)) {
    if (!allowed.has(ac)) errors.push(`${path}.red.revision_baseline_tests.${ac}: unknown or extra AC`);
  }
  if (task.phase !== "RED_REVISION") return;
  for (const ac of acceptance) {
    if (ac === NORMATIVE_AC) continue;
    if (!hasOwn(baseline, ac)) {
      errors.push(`${path}.red.revision_baseline_tests.${ac}: complete baseline map required`);
      continue;
    }
    const refs = baseline[ac];
    if (!Array.isArray(refs) || refs.length === 0 || Object.keys(refs).length !== refs.length || refs.some((ref) => typeof ref !== "string" || !TEST_REF.test(ref))) {
      errors.push(`${path}.red.revision_baseline_tests.${ac}: non-empty dense test references required`);
    }
  }
  const owners = new Map();
  for (const [ac, refs] of Object.entries(baseline)) {
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      if (owners.has(ref) && owners.get(ref) !== ac) {
        errors.push(`${path}.red.revision_baseline_tests: test ${ref} is duplicated across ACs ${owners.get(ref)} and ${ac}`);
      } else {
        owners.set(ref, ac);
      }
    }
  }
}

function validateRed(task, path, errors, { allowLegacyPendingReview = false } = {}) {
  if (!checkKeys(task.red, RED_KEYS, `${path}.red`, errors)) return;
  if (!RED_STATUSES.has(task.red.status)) errors.push(`${path}.red.status: invalid enum`);
  if (!Array.isArray(task.red.failing_tests) || task.red.failing_tests.some((ref) => typeof ref !== "string" || !TEST_REF.test(ref))) errors.push(`${path}.red.failing_tests: invalid test references`);
  if (typeof task.red.failure_reason_expected !== "boolean") errors.push(`${path}.red.failure_reason_expected: must be boolean`);
  if (!checkKeys(task.red.revision_delta, RED_DELTA_KEYS, `${path}.red.revision_delta`, errors)) return;
  for (const key of RED_DELTA_KEYS) if (typeof task.red.revision_delta[key] !== "string") errors.push(`${path}.red.revision_delta.${key}: must be string`);
  if (!isObject(task.red.revision_baseline_tests)) errors.push(`${path}.red.revision_baseline_tests: must be an object`);
  else for (const [ac, refs] of Object.entries(task.red.revision_baseline_tests)) {
    if (!Array.isArray(refs) || refs.length === 0 || refs.some((ref) => typeof ref !== "string" || !TEST_REF.test(ref))) errors.push(`${path}.red.revision_baseline_tests.${ac}: invalid test references`);
  }
  validateRevisionBaseline(task, path, errors);
  const matrixResult = validateCriteriaMatrix(task);
  if (!matrixResult.ok) errors.push(...matrixResult.errors.map((error) => `${path}.red.criteria_to_tests: ${error}`));
  if (task.phase === "RED_REVISION") {
    const delta = task.red.revision_delta;
    const reset = task.red.status === "PENDING"
      && task.red.failure_reason_expected === false
      && Array.isArray(task.red.failing_tests)
      && task.red.failing_tests.length === 0
      && delta.ac === "" && delta.test === "" && delta.evidence === "";
    if (!reset) {
      if (!nonEmptyString(delta.ac) || !Array.isArray(task.acceptance_criteria) || !task.acceptance_criteria.includes(delta.ac)) errors.push(`${path}.red.revision_delta.ac: must name an existing AC`);
      if (!nonEmptyString(delta.test) || !TEST_REF.test(delta.test)) errors.push(`${path}.red.revision_delta.test: new test reference required`);
      const baseline = Array.isArray(task.red.revision_baseline_tests?.[delta.ac])
        ? task.red.revision_baseline_tests[delta.ac]
        : [];
      const baselineRefs = Object.values(task.red.revision_baseline_tests ?? {})
        .filter(Array.isArray)
        .flat();
      if (baseline.includes(delta.test) || baselineRefs.includes(delta.test)) errors.push(`${path}.red.revision_delta: test must be new and absent from baseline`);
      const matrixEntry = task.red.criteria_to_tests?.[delta.ac];
      if (!Array.isArray(matrixEntry) || !matrixEntry.includes(delta.test)) errors.push(`${path}.red.revision_delta: test must belong to the AC matrix`);
      if (!nonEmptyString(delta.evidence)) errors.push(`${path}.red.revision_delta.evidence: assertion failure evidence required`);
      if (task.red.status !== "PASS" || task.red.failure_reason_expected !== true || !Array.isArray(task.red.failing_tests) || !task.red.failing_tests.includes(delta.test)) errors.push(`${path}.red: RED_REVISION requires expected assertion failure evidence`);
    }
    for (const [ac, refs] of Object.entries(task.red.revision_baseline_tests ?? {})) {
      if (!Array.isArray(refs)) continue;
      for (const ref of refs) if (!task.red.criteria_to_tests?.[ac]?.includes?.(ref)) errors.push(`${path}.red.revision_baseline_tests: baseline test removed from ${ac}`);
    }
  }
  const legacyPendingReview = allowLegacyPendingReview
    && ["REVIEW", "DOC", "VALIDATE"].includes(task.phase)
    && task.green?.status === "PENDING"
    && task.refactor?.status === "PENDING"
    && task.review?.status === "PENDING";
  const postRedProofRequired = !legacyPendingReview && RED_COMPLETE_PHASES.has(task.phase);
  if (postRedProofRequired && task.implemented_by !== "existing-code" && !isNormativeTask(task)) {
    if (task.red.status !== "PASS") errors.push(`${path}.red: expected PASS before ${task.phase}`);
    if (task.red.failure_reason_expected !== true) errors.push(`${path}.red.failure_reason_expected: expected assertion failure required for RED`);
    if (!Array.isArray(task.red.failing_tests) || task.red.failing_tests.length === 0) errors.push(`${path}.red.failing_tests: expected assertion test required`);
  }
  if (task.implemented_by === "existing-code" && task.phase === "REVIEW") {
    if (task.red.status !== "PASS" || task.red.failure_reason_expected !== false || !Array.isArray(task.red.failing_tests) || task.red.failing_tests.length !== 0) errors.push(`${path}.red: existing behavior requires PASS with no failing tests and false failure_reason_expected`);
  }
}
function isDoneTask(task) {
  return isObject(task) && task.phase === "DONE";
}

function validateDoneTask(task, path, errors) {
  if (!isDoneTask(task)) return;
  if (Array.isArray(task.blockers) && task.blockers.length !== 0) errors.push(`${path}: DONE task cannot have blockers`);
  validateReview(task.review, `${path}.review`, errors, { requireApproval: true, requirePeerReviewer: true });
  if (task.red?.status !== "PASS") errors.push(`${path}: DONE requires RED PASS`);
  if (isNormativeTask(task) && (task.red?.failure_reason_expected !== false || !Array.isArray(task.red?.failing_tests) || task.red.failing_tests.length !== 0)) {
    errors.push(`${path}: normative DONE requires RED PASS with no failing tests and false failure_reason_expected`);
  }
  if (!(isNormativeTask(task) ? ["PASS", "SKIPPED"] : ["PASS"]).includes(task.green?.status)) errors.push(`${path}: DONE requires GREEN PASS`);
  if (!["PASS", "SKIPPED"].includes(task.refactor?.status)) errors.push(`${path}: DONE requires REFACTOR PASS or SKIPPED`);
  for (const gate of GATES) if (!COMPLETED_GATE_STATUSES.has(task.gates?.[gate])) errors.push(`${path}: DONE requires all gates PASS or justified NA`);
}


function validateTask(task, path, errors, options = {}) {
  if (!checkKeys(task, TASK_KEYS, path, errors)) return;
  for (const field of ["id", "title"]) if (!nonEmptyString(task[field])) errors.push(`${path}.${field}: non-empty string required`);
  if (!["none", "applied"].includes(task.doc_impact)) errors.push(`${path}.doc_impact: expected none or applied`);
  for (const field of ["implemented_by", "reviewed_by"]) {
    if (typeof task[field] !== "string") errors.push(`${path}.${field}: must be string`);
    else if (ASSIGNED_TASK_PHASES.has(task.phase) && !nonEmptyString(task[field])) errors.push(`${path}.${field}: non-empty agent required for assigned phase`);
  }
  if (!Array.isArray(task.allowed_write_globs)
    || task.allowed_write_globs.length === 0
    || Object.keys(task.allowed_write_globs).length !== task.allowed_write_globs.length
    || task.allowed_write_globs.some((glob) => !nonEmptyString(glob))) {
    errors.push(`${path}.allowed_write_globs: non-empty string array required`);
  }
  if (typeof task.evidence !== "string") errors.push(`${path}.evidence: must be string`);
  if (task.phase === "DONE" && task.implemented_by === "existing-code") errors.push(`${path}: existing behavior cannot be promoted directly to DONE`);
  if (!TASK_PHASES.has(task.phase)) errors.push(`${path}.phase: invalid enum`);
  if (!Number.isInteger(task.attempt) || task.attempt < 0 || task.attempt > 3) errors.push(`${path}.attempt: non-negative integer capped at 3 required`);
  validateReview(task.review, `${path}.review`, errors, { requirePeerReviewer: task.review?.status === "APPROVED" });
  if (task.review?.status === "APPROVED" && task.reviewed_by !== "peer-reviewer") errors.push(`${path}.reviewed_by: peer-reviewer required for approved review`);
  if (task.review?.status === "APPROVED" && task.review?.agent === task.implemented_by) errors.push(`${path}.review: reviewer must be independent from implementer`);
  validateRed(task, path, errors, options);
  if (!checkKeys(task.green, GREEN_KEYS, `${path}.green`, errors)) return;
  if (!GREEN_STATUSES.has(task.green.status)) errors.push(`${path}.green.status: invalid enum`);
  if (!Array.isArray(task.green.changed_files) || task.green.changed_files.some((item) => typeof item !== "string")) errors.push(`${path}.green.changed_files: string array required`);
  validateStringFields(task.green, ["reason_if_skipped", "tooling_evidence", "tooling_suite_evidence"], `${path}.green`, errors);
  if (task.green.status === "SKIPPED" && !nonEmptyString(task.green.reason_if_skipped)) errors.push(`${path}.green.reason_if_skipped: required when skipped`);
  if (!checkKeys(task.refactor, REFACTOR_KEYS, `${path}.refactor`, errors)) return;
  if (!REFACTOR_STATUSES.has(task.refactor.status)) errors.push(`${path}.refactor.status: invalid enum`);
  if (typeof task.refactor.reason_if_skipped !== "string") errors.push(`${path}.refactor.reason_if_skipped: must be string`);
  if (task.refactor.status === "SKIPPED" && !nonEmptyString(task.refactor.reason_if_skipped)) errors.push(`${path}.refactor.reason_if_skipped: required when skipped`);
  if (!options.allowLegacyPendingReview
    && ["REVIEW", "DOC", "VALIDATE"].includes(task.phase)
    && task.implemented_by !== "existing-code") {
    if (!["PASS", "SKIPPED"].includes(task.green.status)) errors.push(`${path}: ${task.phase} requires GREEN PASS or SKIPPED`);
    if (!["PASS", "SKIPPED"].includes(task.refactor.status)) errors.push(`${path}: ${task.phase} requires REFACTOR PASS or SKIPPED`);
  }
  if (task.implemented_by === "existing-code" && task.phase === "REVIEW") {
    if (task.green.status !== "SKIPPED" || task.refactor.status !== "SKIPPED") errors.push(`${path}: existing-code requires GREEN and REFACTOR SKIPPED`);
  }
  validateGateMaps(task, path, errors);
  const blockersValid = Array.isArray(task.blockers) && task.blockers.every((item) => typeof item === "string" && nonEmptyString(item));
  if (!blockersValid) errors.push(`${path}.blockers: string array required`);
  validateDoneTask(task, path, errors);
  if (task.phase === "BLOCKED" && Array.isArray(task.blockers) && task.blockers.length === 0) errors.push(`${path}: BLOCKED task requires blocker diagnosis`);
  if (task.attempt >= 3 && task.phase !== "BLOCKED") errors.push(`${path}: attempt cap requires BLOCKED phase`);
}
function validateProgressObject(progress, errors, options = {}) {
  if (!checkKeys(progress, ROOT_KEYS, "progress", errors)) return;
  if (progress.schema_version !== "2.2") errors.push("progress.schema_version: expected 2.2");
  for (const field of ["run_id", "task_source", "updated_at"]) if (!nonEmptyString(progress[field])) errors.push(`progress.${field}: non-empty string required`);
  if (checkKeys(progress.repo, REPO_KEYS, "progress.repo", errors)) {
    validateStringFields(progress.repo, ["branch_start", "branch_work", "merge_target", "delivery", "merge_status", "pr_url", "head_start", "head_current"], "progress.repo", errors);
    for (const field of ["branch_start", "branch_work", "merge_target", "head_start", "head_current"]) {
      if (!nonEmptyString(progress.repo[field])) errors.push(`progress.repo.${field}: non-empty repository identity required`);
    }
    if (!DELIVERY_STATUSES.has(progress.repo.delivery)) errors.push("progress.repo.delivery: invalid enum");
    if (!MERGE_STATUSES.has(progress.repo.merge_status)) errors.push("progress.repo.merge_status: invalid enum");
    if (typeof progress.repo.dirty_at_start !== "boolean") errors.push("progress.repo.dirty_at_start: must be boolean");
  }
  if (checkKeys(progress.baseline, BASELINE_KEYS, "progress.baseline", errors)) {
    if (!BASELINE_STATUSES.has(progress.baseline.status)) errors.push("progress.baseline.status: invalid enum");
    if (!BUILD_STATUSES.has(progress.baseline.tests) || !BUILD_STATUSES.has(progress.baseline.build)) errors.push("progress.baseline.tests/build: invalid enum");
    if (typeof progress.baseline.tests_evidence !== "string" || typeof progress.baseline.build_evidence !== "string") errors.push("progress.baseline evidence: must be strings");
    if (typeof progress.baseline.override_approved !== "boolean") errors.push("progress.baseline.override_approved: must be boolean");
    if (!Array.isArray(progress.baseline.known_failures)) errors.push("progress.baseline.known_failures: must be array");
    else progress.baseline.known_failures.forEach((entry, index) => {
      if (!checkKeys(entry, ["gate", "reason", "evidence"], `progress.baseline.known_failures[${index}]`, errors)) return;
      if (!isObject(entry) || !["tests", "build"].includes(entry.gate) || !nonEmptyString(entry.reason) || !nonEmptyString(entry.evidence)) errors.push(`progress.baseline.known_failures[${index}]: gate, reason and evidence required`);
    });
    for (const gate of BASELINE_GATES) if (progress.baseline[gate] === "NA" && !hasBaselineKnownFailure(progress, gate)) errors.push(`progress.baseline.${gate}: NA requires known_failure reason/evidence`);
    const aggregate = baselineAggregate(progress.baseline.tests, progress.baseline.build);
    if (aggregate && progress.baseline.status !== aggregate) {
      errors.push(`progress.baseline.status: ${progress.baseline.status} is inconsistent with aggregate ${aggregate}`);
    }
    if (progress.baseline.status === "PASS") {
      if (progress.baseline.tests === "PASS" && !nonEmptyString(progress.baseline.tests_evidence)) errors.push("progress.baseline.tests_evidence: required for PASS");
      if (progress.baseline.build === "PASS" && !nonEmptyString(progress.baseline.build_evidence)) errors.push("progress.baseline.build_evidence: required for PASS");
    }
    if (progress.baseline.status === "FAIL") {
      if (progress.baseline.override_approved !== true) errors.push("progress.baseline: FAIL requires explicit override_approved");
      for (const gate of BASELINE_GATES) {
        if (progress.baseline[gate] === "PASS" && !nonEmptyString(progress.baseline[`${gate}_evidence`])) errors.push(`progress.baseline.${gate}_evidence: required for PASS gate under FAIL baseline`);
        if (progress.baseline[gate] === "FAIL" && !hasBaselineKnownFailure(progress, gate)) {
          errors.push(`progress.baseline.${gate}: FAIL requires known_failure diagnosis`);
        }
      }
    }
  }
  let canonicalSpecRoot = "";
  if (checkKeys(progress.spec_kit, SPEC_KIT_KEYS, "progress.spec_kit", errors)) {
    validateStringFields(progress.spec_kit, ["spec", "plan", "tasks", "written_at", "mode"], "progress.spec_kit", errors);
    if (!SPEC_KIT_STATUSES.has(progress.spec_kit.status)) errors.push("progress.spec_kit.status: invalid enum");
    if (!SPEC_KIT_MODES.has(progress.spec_kit.mode)) errors.push("progress.spec_kit.mode: invalid enum");
    if (progress.spec_kit.status === "WRITTEN") {
      const specPath = String(progress.spec_kit.spec).replaceAll("\\", "/");
      const planPath = String(progress.spec_kit.plan).replaceAll("\\", "/");
      const tasksPath = String(progress.spec_kit.tasks).replaceAll("\\", "/");
      if (!/\/spec\.md$/i.test(specPath)) errors.push("progress.spec_kit.spec: canonical spec.md path required");
      else canonicalSpecRoot = specPath.replace(/\/spec\.md$/i, "");
      if (!/\/plan\.md$/i.test(planPath) || (canonicalSpecRoot && planPath !== `${canonicalSpecRoot}/plan.md`)) errors.push("progress.spec_kit.plan: canonical sibling plan.md path required");
      if (!/\/tasks\.md$/i.test(tasksPath) || (canonicalSpecRoot && tasksPath !== `${canonicalSpecRoot}/tasks.md`)) errors.push("progress.spec_kit.tasks: canonical sibling tasks.md path required");
      if (!Number.isFinite(Date.parse(progress.spec_kit.written_at))) errors.push("progress.spec_kit.written_at: valid timestamp required");
    }
  }
  if (checkKeys(progress.contract, CONTRACT_KEYS, "progress.contract", errors)) {
    validateStringFields(progress.contract, ["file", "version", "status", "na_reason"], "progress.contract", errors);
    if (!CONTRACT_STATUSES.has(progress.contract.status)) errors.push("progress.contract.status: invalid enum");
    const contractPath = String(progress.contract.file).replaceAll("\\", "/");
    if (!nonEmptyString(progress.contract.file) || !/\/contracts\/interface-contract\.md$/i.test(contractPath)) {
      errors.push("progress.contract.file: canonical contracts/interface-contract.md path required");
    } else if (canonicalSpecRoot && contractPath !== `${canonicalSpecRoot}/contracts/interface-contract.md`) {
      errors.push("progress.contract.file: must be the Spec Kit contract for the same feature");
    }
    if (progress.contract.status === "NA" && !nonEmptyString(progress.contract.na_reason)) errors.push("progress.contract.na_reason: required when contract is NA");
  }
  if (Array.isArray(progress.acceptance_criteria)) {
    const ids = new Set();
    for (const ac of progress.acceptance_criteria) {
      if (ids.has(ac?.id)) errors.push(`progress.acceptance_criteria: duplicate ${ac.id}`);
      ids.add(ac?.id);
    }
  }
  if (!Array.isArray(progress.waves) || progress.waves.length === 0) errors.push("progress.waves: non-empty array required");
  else progress.waves.forEach((wave, wi) => {
    const path = `progress.waves[${wi}]`;
    if (!checkKeys(wave, WAVE_KEYS, path, errors)) return;
    if (!Number.isInteger(wave.wave) || wave.wave < 1) errors.push(`${path}.wave: positive integer required`);
    if (!WAVE_STATUSES.has(wave.status)) errors.push(`${path}.status: invalid enum`);
    if (checkKeys(wave.integration, INTEGRATION_KEYS, `${path}.integration`, errors)) {
      if (!INTEGRATION_STATUSES.has(wave.integration.status)) errors.push(`${path}.integration.status: invalid enum`);
      if (!Number.isInteger(wave.integration.attempt) || wave.integration.attempt < 0 || wave.integration.attempt > 3) errors.push(`${path}.integration.attempt: non-negative integer capped at 3 required`);
      if (typeof wave.integration.evidence !== "string") errors.push(`${path}.integration.evidence: must be string`);
      if (["FAIL", "PASS"].includes(wave.integration.status) && !nonEmptyString(wave.integration.evidence)) errors.push(`${path}.integration.evidence: evidence required for ${wave.integration.status}`);
    }
    if (!Array.isArray(wave.tasks) || wave.tasks.length === 0) errors.push(`${path}.tasks: non-empty array required`);
    else {
      wave.tasks.forEach((task, ti) => validateTask(task, `${path}.tasks[${ti}]`, errors, options));
      if (isObject(wave.integration) && wave.integration.status !== "PASS" && Number.isInteger(wave.integration.attempt) && wave.integration.attempt >= 3) {
        for (const [ti, task] of wave.tasks.entries()) {
          if (isObject(task) && task.phase !== "BLOCKED") errors.push(`${path}.tasks[${ti}]: integration attempt cap requires BLOCKED task`);
        }
      }
    }
  });
  validateFinalAcceptanceLinks(progress, errors);
  if (progress.spec_kit?.status === "PENDING" && Array.isArray(progress.waves)) {
    for (const [wi, wave] of progress.waves.entries()) {
      if (!isObject(wave) || !Array.isArray(wave.tasks)) continue;
      for (const [ti, task] of wave.tasks.entries()) {
        if (isObject(task) && task.phase !== "PENDING") errors.push(`progress.spec_kit: WRITTEN evidence required before task ${wi}/${ti} advances`);
      }
    }
  }
}

export function validateProgress(input, { allowLegacyPendingReview = false } = {}) {
  if (!isObject(input)) return result(false, undefined, ["progress must be an object"]);
  let value;
  try {
    value = clone(input);
  } catch (error) {
    const errors = [`progress malformed: ${error instanceof Error ? error.message : String(error)}`];
    try {
      errors.push(...collectDiagnostics(input));
    } catch (diagnosticError) {
      errors.push(`progress diagnostics failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`);
    }
    return result(false, undefined, errors);
  }
  const errors = [];
  try {
    validateProgressObject(value, errors, { allowLegacyPendingReview });
  } catch (error) {
    errors.push(`progress malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return result(errors.length === 0, errors.length === 0 ? value : undefined, errors);
}
function markTaskBlocked(task, reason) {
  if (task.phase !== "BLOCKED") task.phase = "BLOCKED";
  if (Array.isArray(task.blockers) && task.blockers.length === 0) task.blockers.push(reason);
}
function markTaskBlockedAtRetryCap(task) {
  if (Number.isInteger(task.attempt) && task.attempt >= 3) markTaskBlocked(task, "retry history reached attempt cap");
}
function reopenWaveAfterTaskNormalization(wave, tasks) {
  if (!isObject(wave) || !Array.isArray(tasks)) return;
  const completedContainer = wave.status === "completed" || wave.integration?.status === "PASS";
  if (!completedContainer || tasks.every((task) => !isObject(task) || task.phase === "DONE")) return;
  wave.status = "in_progress";
  if (isObject(wave.integration) && wave.integration.status === "PASS") {
    wave.integration.status = "FAIL";
    wave.integration.evidence = `${wave.integration.evidence || "previous integration PASS"}; migration reopened a non-DONE task`;
  }
}

function markTasksBlockedAtIntegrationCap(wave, tasks) {
  if (!isObject(wave.integration) || wave.integration.status === "PASS" || !Number.isInteger(wave.integration.attempt) || wave.integration.attempt < 3) return;
  if (wave.status === "completed") wave.status = "in_progress";
  for (const task of tasks) if (isObject(task)) markTaskBlocked(task, "retry history reached attempt cap");
}


function parseLegacyCriteriaMatrix(task, errors) {
  const matrix = task?.red?.criteria_to_tests;
  if (typeof matrix !== "string") return;
  const parsed = {};
  const references = new Set();
  const lines = matrix.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(AC-\d{3})\s*(?:->|:)\s*(.+)$/);
    const reference = match?.[2]?.trim();
    if (!match || !TEST_REF.test(reference)) {
      errors.push(`legacy criteria matrix line ${index + 1}: invalid AC mapping`);
      continue;
    }
    if (references.has(reference)) {
      errors.push(`legacy criteria matrix line ${index + 1}: duplicate test reference`);
      continue;
    }
    references.add(reference);
    if (!hasOwn(parsed, match[1])) parsed[match[1]] = [];
    parsed[match[1]].push(reference);
  }
  if (Object.keys(parsed).length > 0 && errors.length === 0) task.red.criteria_to_tests = parsed;
}
function hasBaselineKnownFailure(progress, gate) {
  const knownFailures = progress?.baseline?.known_failures;
  if (!Array.isArray(knownFailures)) return false;
  return knownFailures.some(
    (failure) => isObject(failure)
      && failure.gate === gate
      && nonEmptyString(failure.reason)
      && nonEmptyString(failure.evidence),
  );
}

function baselineAggregate(tests, build) {
  if (!BUILD_STATUSES.has(tests) || !BUILD_STATUSES.has(build)) return "";
  if (tests === "NOT_RUN" || build === "NOT_RUN") return "NOT_RUN";
  if (tests === "FAIL" || build === "FAIL") return "FAIL";
  return "PASS";
}
function normalizeBaseline(value) {
  if (!isObject(value.baseline)) return;
  const baseline = value.baseline;
  const originalStatus = baseline.status;
  const invalidStatus = hasOwn(baseline, "status") && !BASELINE_STATUSES.has(originalStatus);
  if (!hasOwn(baseline, "tests_evidence")) baseline.tests_evidence = "";
  if (!hasOwn(baseline, "build_evidence")) baseline.build_evidence = "";
  if (!hasOwn(baseline, "override_approved")) baseline.override_approved = false;
  if (!hasOwn(baseline, "known_failures")) baseline.known_failures = [];
  let removedUnsupportedKnownFailure = false;
  if (Array.isArray(baseline.known_failures)) {
    const knownFailures = baseline.known_failures;
    baseline.known_failures = knownFailures.filter((failure) => {
      const supported = !isObject(failure) || ["tests", "build"].includes(failure.gate);
      if (!supported) removedUnsupportedKnownFailure = true;
      return supported;
    });
  }
  if (removedUnsupportedKnownFailure) {
    baseline.status = "NOT_RUN";
    for (const gate of BASELINE_GATES) {
      baseline[gate] = "NOT_RUN";
      baseline[`${gate}_evidence`] = "";
    }
  }
  for (const gate of BASELINE_GATES) {
    if (baseline[gate] === "NA" && !hasBaselineKnownFailure(value, gate)) {
      baseline[gate] = "NOT_RUN";
      baseline[`${gate}_evidence`] = "";
    }
  }
  for (const gate of BASELINE_GATES) {
    if (baseline[gate] === "PASS" && !nonEmptyString(baseline[`${gate}_evidence`])) {
      baseline[gate] = "NOT_RUN";
      baseline[`${gate}_evidence`] = "";
    }
  }
  const testsResolved = baseline.tests === "PASS" && nonEmptyString(baseline.tests_evidence)
    || baseline.tests === "NA" && hasBaselineKnownFailure(value, "tests");
  const buildResolved = baseline.build === "PASS" && nonEmptyString(baseline.build_evidence)
    || baseline.build === "NA" && hasBaselineKnownFailure(value, "build");
  if (baseline.tests === "NOT_RUN" || baseline.build === "NOT_RUN") baseline.status = "NOT_RUN";
  else if (baseline.tests === "FAIL" || baseline.build === "FAIL" || !testsResolved || !buildResolved) baseline.status = "FAIL";
  else baseline.status = "PASS";
  if (invalidStatus) baseline.status = originalStatus;
}

function normalizeReviewProof(task, { preserveRevisionPhase = false } = {}) {
  const review = task.review;
  if (!isObject(review)) return;
  if (review.status === "BLOCKED") {
    if (task.phase !== "BLOCKED" && !preserveRevisionPhase) task.phase = "BLOCKED";
    if (Array.isArray(task.blockers) && task.blockers.length === 0) {
      task.blockers.push("review is BLOCKED; actionable diagnosis required");
    }
    return;
  }
  const validApproved = review.status === "APPROVED"
    && review.independent === true
    && nonEmptyString(review.agent)
    && nonEmptyString(review.revision)
    && nonEmptyString(review.evidence);
  if (validApproved) return;
  const hasProof = review.independent === true
    || nonEmptyString(review.revision)
    || nonEmptyString(review.evidence);
  if (review.status === "APPROVED" || hasProof) {
    review.status = "BLOCKED";
    if (task.phase !== "BLOCKED" && !preserveRevisionPhase) task.phase = "BLOCKED";
    if (Array.isArray(task.blockers) && task.blockers.length === 0) {
      task.blockers.push("incomplete review proof retained; actionable evidence required");
    }
    return;
  }
  if (review.status === "PENDING") {
    task.review = { status: "PENDING", agent: "", independent: false, revision: "", evidence: "" };
    if (!preserveRevisionPhase && ["REVIEW", "DOC", "VALIDATE", "DONE"].includes(task.phase)) {
      if (task.phase === "DONE" && task.red?.status !== "PASS") task.phase = "RED";
      else if (task.phase === "DONE" && !["PASS", "SKIPPED"].includes(task.green?.status)) task.phase = "GREEN";
      else if (task.phase === "DONE" && !["PASS", "SKIPPED"].includes(task.refactor?.status)) task.phase = "REFACTOR";
      else task.phase = "REVIEW";
    }
  }
}


function resetRedRevisionProof(task, force = false) {
  if ((!force && task.phase !== "RED_REVISION") || !isObject(task.red)) return;
  const baseline = isObject(task.red.revision_baseline_tests) ? clone(task.red.revision_baseline_tests) : {};
  const currentMatrix = isObject(task.red.criteria_to_tests) ? task.red.criteria_to_tests : {};
  const matrix = {};
  for (const ac of Array.isArray(task.acceptance_criteria) ? task.acceptance_criteria : []) {
    if (ac === NORMATIVE_AC && hasOwn(currentMatrix, ac)) matrix[ac] = clone(currentMatrix[ac]);
    else if (hasOwn(baseline, ac)) matrix[ac] = clone(baseline[ac]);
  }
  task.red.criteria_to_tests = matrix;
  task.red.status = "PENDING";
  task.red.failing_tests = [];
  task.red.failure_reason_expected = false;
  task.red.revision_delta = { ac: "", test: "", evidence: "" };
}

function revisionBaselineFromMatrix(task) {
  const matrix = task.red?.criteria_to_tests;
  const baseline = {};
  const acceptance = Array.isArray(task.acceptance_criteria) ? task.acceptance_criteria : [];
  for (const ac of acceptance) {
    if (ac === NORMATIVE_AC) continue;
    if (Array.isArray(matrix?.[ac]) && matrix[ac].length > 0 && matrix[ac].every((ref) => typeof ref === "string" && TEST_REF.test(ref))) {
      baseline[ac] = [...matrix[ac]];
    }
  }
  return baseline;
}

function hasValidRevisionBaseline(task) {
  const baseline = task.red?.revision_baseline_tests;
  if (!isObject(baseline)) return false;
  const acceptance = Array.isArray(task.acceptance_criteria) ? task.acceptance_criteria : [];
  const allowed = new Set(acceptance);
  if (Object.keys(baseline).some((ac) => !allowed.has(ac))) return false;
  return acceptance.every((ac) => (
    ac === NORMATIVE_AC
      || (Array.isArray(baseline[ac]) && baseline[ac].length > 0 && Object.keys(baseline[ac]).length === baseline[ac].length && baseline[ac].every((ref) => typeof ref === "string" && TEST_REF.test(ref)))
  ));
}

function normalizeGateOrigins(task) {
  if (!isObject(task.gate_origins) || !isObject(task.gates)) return;
  for (const gate of GATES) if (task.gates[gate] !== "FAIL") task.gate_origins[gate] = "";
}

function ensureRevisionBaseline(task, { derive = false } = {}) {
  if (task.phase !== "RED_REVISION" || !isObject(task.red) || !derive) return;
  if (!hasValidRevisionBaseline(task)) {
    task.red.revision_baseline_tests = revisionBaselineFromMatrix(task);
  }
}

function normalizeTask22(task) {
  if (task.phase === "READY") task.phase = "REVIEW";
  const wasRevision = task.phase === "RED_REVISION";
  ensureRevisionBaseline(task, { derive: true });
  if (wasRevision) resetRedRevisionProof(task, true);
  normalizeReviewProof(task, { preserveRevisionPhase: wasRevision });
  if (wasRevision && task.phase === "RED_REVISION") resetRedRevisionProof(task, true);
  normalizeGateOrigins(task);
  markTaskBlockedAtRetryCap(task);
}

function initializeTask21(task, errors) {
  if (!isObject(task)) return;
  if (task.phase === "READY") task.phase = "REVIEW";
  if (!hasOwn(task, "attempt")) task.attempt = 0;
  if (!hasOwn(task, "implemented_by")) task.implemented_by = "";
  if (!hasOwn(task, "reviewed_by")) task.reviewed_by = "";
  if (!hasOwn(task, "doc_impact")) task.doc_impact = "none";
  if (!hasOwn(task, "review")) task.review = { status: "PENDING", agent: "", independent: false, revision: "", evidence: "" };
  if (!hasOwn(task, "red")) {
    task.red = {
      status: "PENDING",
      failing_tests: [],
      failure_reason_expected: false,
      criteria_to_tests: {},
      revision_delta: { ac: "", test: "", evidence: "" },
    };
  }
  if (!hasOwn(task, "green")) task.green = { status: "PENDING", reason_if_skipped: "", changed_files: [], tooling_evidence: "", tooling_suite_evidence: "" };
  if (!hasOwn(task, "refactor")) task.refactor = { status: "PENDING", reason_if_skipped: "" };
  if (!hasOwn(task, "gates")) task.gates = Object.fromEntries(GATES.map((gate) => [gate, "pending"]));
  if (!hasOwn(task, "blockers")) task.blockers = [];
  if (!hasOwn(task, "evidence")) task.evidence = "";
  if (typeof task.red?.criteria_to_tests === "string") parseLegacyCriteriaMatrix(task, errors);
  if (isObject(task.red)) {
    if (!hasOwn(task.red, "revision_delta")) task.red.revision_delta = { ac: "", test: "", evidence: "" };
    if (!hasOwn(task.red, "revision_baseline_tests")) task.red.revision_baseline_tests = {};
  }
  if (isObject(task.green)) {
    for (const field of ["reason_if_skipped", "tooling_evidence", "tooling_suite_evidence"]) if (!hasOwn(task.green, field)) task.green[field] = "";
  }
  if (isObject(task.refactor) && !hasOwn(task.refactor, "reason_if_skipped")) task.refactor.reason_if_skipped = "";
  if (isObject(task.gates)) {
    for (const gate of GATES) {
      if (!hasOwn(task.gates, gate)) {
        if (gate === "traceability" && hasOwn(task.gates, "rastreabilidade")) task.gates.traceability = task.gates.rastreabilidade;
        else task.gates[gate] = "pending";
      }
    }
  }
  if (!hasOwn(task.gate_origins) && isObject(task.gates)) task.gate_origins = Object.fromEntries(GATES.map((gate) => [gate, ""]));
  if (!hasOwn(task.gate_evidence) && isObject(task.gates)) task.gate_evidence = Object.fromEntries(GATES.map((gate) => [gate, ""]));
  if (isObject(task.gate_origins)) for (const gate of GATES) if (!hasOwn(task.gate_origins, gate)) task.gate_origins[gate] = "";
  if (isObject(task.gate_evidence)) for (const gate of GATES) if (!hasOwn(task.gate_evidence, gate)) task.gate_evidence[gate] = "";
  const wasRevision = task.phase === "RED_REVISION";
  ensureRevisionBaseline(task, { derive: true });
  if (wasRevision) resetRedRevisionProof(task, true);
  if (isObject(task.review)) normalizeReviewProof(task, { preserveRevisionPhase: wasRevision });
  if (wasRevision && task.phase === "RED_REVISION") resetRedRevisionProof(task, true);
  normalizeGateOrigins(task);
  markTaskBlockedAtRetryCap(task);
}

function migrateAliases(value, errors) {
  if (!isObject(value.repo)) return;
  if (hasOwn(value.repo, "branch")) {
    if (hasOwn(value.repo, "branch_work")) errors.push("repo.branch and repo.branch_work collision");
    else value.repo.branch_work = value.repo.branch;
    delete value.repo.branch;
  }
  const waves = Array.isArray(value.waves) ? value.waves : [];
  for (const wave of waves) {
    if (!isObject(wave)) continue;
    const tasks = Array.isArray(wave.tasks) ? wave.tasks : [];
    for (const task of tasks) {
      if (!isObject(task)) continue;
      if (hasOwn(task, "reviewer")) {
        if (hasOwn(task, "reviewed_by")) errors.push("task.reviewer and task.reviewed_by collision");
        else task.reviewed_by = task.reviewer;
        delete task.reviewer;
      }
      if (isObject(task.gates) && hasOwn(task.gates, "rastreabilidade")) {
        if (hasOwn(task.gates, "traceability")) errors.push("gates.rastreabilidade and gates.traceability collision");
        else task.gates.traceability = task.gates.rastreabilidade;
        delete task.gates.rastreabilidade;
      }
    }
  }
}

export function migrateProgress(input) {
  if (!isObject(input)) return result(false, undefined, ["progress must be an object"]);
  let value;
  try {
    value = clone(input);
  } catch (error) {
    const errors = [`progress malformed: ${error instanceof Error ? error.message : String(error)}`];
    try {
      errors.push(...collectDiagnostics(input));
    } catch (diagnosticError) {
      errors.push(`progress diagnostics failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`);
    }
    return result(false, undefined, errors);
  }
  const errors = [];
  const legacySchema = value.schema_version === "2.1";
  const waves = Array.isArray(value.waves) ? value.waves : [];
  try {
    if (value.schema_version === "2.1") {
      migrateAliases(value, errors);
      value.schema_version = "2.2";
      if (isObject(value.baseline)) normalizeBaseline(value);
      for (const wave of waves) {
        if (!isObject(wave)) continue;
        if (!hasOwn(wave, "integration")) wave.integration = { status: "pending", attempt: 0, evidence: "" };
        const tasks = Array.isArray(wave.tasks) ? wave.tasks : [];
        const legacyBlockedWave = wave.status === "BLOCKED";
        if (legacyBlockedWave) {
          wave.status = "in_progress";
          if (isObject(wave.integration)) {
            wave.integration.status = "FAIL";
            if (!nonEmptyString(wave.integration.evidence)) wave.integration.evidence = "legacy wave BLOCKED";
          }
        }
        if (isObject(wave.integration) && !hasOwn(wave.integration, "attempt")) wave.integration.attempt = 0;
        for (const task of tasks) {
          if (!isObject(task)) continue;
          initializeTask21(task, errors);
          if (legacyBlockedWave) markTaskBlocked(task, "legacy wave BLOCKED");
        }
      }
    } else if (value.schema_version === "2.2") {
      normalizeBaseline(value);
      for (const wave of waves) {
        if (!isObject(wave)) continue;
        if (!hasOwn(wave, "integration")) wave.integration = { status: "pending", attempt: 0, evidence: "" };
        else if (isObject(wave.integration) && !hasOwn(wave.integration, "attempt")) wave.integration.attempt = 0;
        const tasks = Array.isArray(wave.tasks) ? wave.tasks : [];
        for (const task of tasks) {
          if (!isObject(task)) continue;
          normalizeTask22(task);
        }
      }
    } else {
      errors.push("progress.schema_version: only 2.1 migration or 2.2 validation is supported");
    }
    for (const wave of waves) {
      if (!isObject(wave)) continue;
      const tasks = Array.isArray(wave.tasks) ? wave.tasks : [];
      reopenWaveAfterTaskNormalization(wave, tasks);
      markTasksBlockedAtIntegrationCap(wave, tasks);
    }
  } catch (error) {
    errors.push(`progress migration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  let validation;
  try {
    validation = validateProgress(value, { allowLegacyPendingReview: legacySchema });
  } catch (error) {
    validation = result(false, undefined, [`progress migration validation failed: ${error instanceof Error ? error.message : String(error)}`]);
  }
  errors.push(...validation.errors);
  if (errors.length > 0) {
    try {
      errors.push(...collectDiagnostics(input));
    } catch (error) {
      errors.push(`progress diagnostics failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length > 0) return result(false, undefined, errors);
  return result(true, value, []);
}

function validateGateReportEntry(gate, entry, errors) {
  const path = `gate_report.${gate}`;
  if (!checkKeys(entry, ["status", "command", "output", "reason"], path, errors, { required: false })) return;
  if (!hasOwn(entry, "status") || !hasOwn(entry, "command") || !hasOwn(entry, "output")) errors.push(`${path}: status, command and output are required`);
  if (!RESOLVED_GATE_STATUSES.has(entry.status)) errors.push(`${path}.status: invalid enum`);
  if (!nonEmptyString(entry.command)) errors.push(`${path}.command: command evidence required`);
  if (!nonEmptyString(entry.output)) errors.push(`${path}.output: output evidence required`);
  if (/not applicable|run gate:/i.test(`${entry.command} ${entry.output}`)) errors.push(`${path}: real suite/build command evidence required`);
  if (gate === "spec_kit" && entry.status !== "NA" && !hasCanonicalSpecKitEvidence(entry.command + " " + entry.output)) {
    errors.push(`${path}: spec_kit evidence must cover spec.md, plan.md, tasks.md and interface-contract.md`);
  }
  if (entry.status === "NA" && !nonEmptyString(entry.reason)) errors.push(`${path}.reason: reason required for NA`);
  if (entry.status === "NA" && gate === "build") {
    for (const field of ["command", "output", "reason"]) {
      if (!/\bbuildCommand\s*=\s*null(?![A-Za-z0-9_$])/i.test(String(entry[field] ?? ""))) errors.push(`gate_report.build.${field}: NA requires specific buildCommand=null evidence`);
    }
  }
  if (entry.status !== "NA" && hasOwn(entry, "reason") && typeof entry.reason !== "string") errors.push(`${path}.reason: must be string`);
}

export function validateGateReport(report) {
  const errors = [];
  if (!checkKeys(report, GATES, "gate_report", errors)) return result(false, undefined, errors);
  for (const gate of GATES) validateGateReportEntry(gate, report?.[gate], errors);
  return result(errors.length === 0, errors.length === 0 ? clone(report) : undefined, errors);
}

function validateAggregateFinding(finding, path, errors) {
  if (!isObject(finding)) {
    errors.push(`${path}: finding must be an object`);
    return;
  }
  const findingKeys = ["title", "body", "priority", "confidence", "file_path", "line_start", "line_end"];
  if (!checkKeys(finding, findingKeys, path, errors)) return;
  if (!nonEmptyString(finding.title) || finding.title.trim().length > 80) errors.push(`${path}.title: non-empty string of at most 80 characters required`);
  if (!nonEmptyString(finding.body)) errors.push(`${path}.body: non-empty string required`);
  if (!Number.isInteger(finding.priority) || finding.priority < 0 || finding.priority > 3) errors.push(`${path}.priority: integer from 0 to 3 required`);
  if (typeof finding.confidence !== "number" || !Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) errors.push(`${path}.confidence: number from 0 to 1 required`);
  if (!nonEmptyString(finding.file_path)) errors.push(`${path}.file_path: non-empty string required`);
  if (!Number.isInteger(finding.line_start) || finding.line_start < 1) errors.push(`${path}.line_start: positive integer required`);
  if (!Number.isInteger(finding.line_end) || finding.line_end < 1) errors.push(`${path}.line_end: positive integer required`);
  if (Number.isInteger(finding.line_start) && Number.isInteger(finding.line_end)) {
    if (finding.line_end < finding.line_start) errors.push(`${path}.line_end: must not precede line_start`);
    if (finding.line_end - finding.line_start + 1 > 10) errors.push(`${path}: line range must contain at most 10 lines`);
  }
}

function validateReviewAggregate(aggregate, errors) {
  const path = "wave.review.aggregate";
  const aggregateKeys = ["status", "blockers", "findings", "counts"];
  if (!checkKeys(aggregate, aggregateKeys, path, errors)) return;
  if (!["APPROVED", "BLOCKED"].includes(aggregate.status)) errors.push(`${path}.status: invalid aggregate enum`);
  for (const field of ["blockers", "findings"]) {
    if (!Array.isArray(aggregate[field])) {
      errors.push(`${path}.${field}: must be an array`);
    } else {
      aggregate[field].forEach((finding, index) => validateAggregateFinding(finding, `${path}.${field}[${index}]`, errors));
    }
  }
  if (!checkKeys(aggregate.counts, ["P0", "P1", "P2", "P3"], `${path}.counts`, errors)) return;
  for (const priority of ["P0", "P1", "P2", "P3"]) {
    if (!Number.isInteger(aggregate.counts[priority]) || aggregate.counts[priority] < 0) {
      errors.push(`${path}.counts.${priority}: non-negative integer required`);
    }
  }
  if (Array.isArray(aggregate.findings) && isObject(aggregate.counts)) {
    const actualCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const finding of aggregate.findings) {
      if (Number.isInteger(finding?.priority) && finding.priority >= 0 && finding.priority <= 3) actualCounts[`P${finding.priority}`] += 1;
    }
    for (const priority of Object.keys(actualCounts)) {
      if (Number.isInteger(aggregate.counts[priority]) && aggregate.counts[priority] !== actualCounts[priority]) {
        errors.push(`${path}.counts.${priority}: inconsistent with findings`);
      }
    }
  }
  if (Array.isArray(aggregate.blockers)) {
    for (const finding of aggregate.blockers) {
      if (Number.isInteger(finding?.priority) && (finding.priority < 0 || finding.priority > 1)) {
        errors.push(`${path}.blockers: only P0/P1 findings may be blockers`);
      }
    }
  }
  if (aggregate.status === "APPROVED" && (aggregate.blockers?.length > 0 || aggregate.findings?.length > 0)) {
    errors.push(`${path}: APPROVED aggregate cannot contain blockers or findings`);
  }
  if (aggregate.status === "BLOCKED" && aggregate.blockers?.length === 0) {
    errors.push(`${path}: BLOCKED aggregate requires blockers`);
  }
}

function validateApprovedReview(review, tasks, errors) {
  if (!isObject(review)) { errors.push("wave.review: required independent review"); return; }
  const reviewWithAggregateKeys = [...REVIEW_KEYS, "aggregate"];
  checkKeys(review, reviewWithAggregateKeys, "wave.review", errors);
  const proof = Object.fromEntries(REVIEW_KEYS.filter((key) => hasOwn(review, key)).map((key) => [key, review[key]]));
  validateReview(proof, "wave.review", errors, { requireApproval: true, requirePeerReviewer: true });
  if (!hasOwn(review, "aggregate")) {
    errors.push("wave.review.aggregate: required structured aggregate proof");
  } else {
    validateReviewAggregate(review.aggregate, errors);
    if (isObject(review.aggregate) && review.aggregate.status !== "APPROVED") errors.push("wave.review.aggregate.status: aggregate must be APPROVED");
    if (isObject(review.aggregate) && (review.aggregate.blockers?.length !== 0 || review.aggregate.findings?.length !== 0)) errors.push("wave.review.aggregate: blockers and findings must be empty for promotion");
    if (isObject(review.aggregate) && isObject(review.aggregate.counts) && ["P0", "P1", "P2", "P3"].some((priority) => review.aggregate.counts[priority] !== 0)) {
      errors.push("wave.review.aggregate.counts: all P0/P1/P2/P3 counts must be zero for promotion");
    }
  }
  const implementers = new Set(tasks.filter(isObject).map((task) => task.implemented_by).filter(nonEmptyString));
  if (review.agent === "integrator") errors.push("wave.review: integrator cannot provide independent post-integration review");
  if (implementers.has(review.agent)) errors.push("wave.review: reviewer must be independent from implementers");
}

export function canPromoteWave(wave) {
  const errors = [];
  if (!isObject(wave)) return result(false, undefined, ["wave must be an object"]);
  if (!WAVE_STATUSES.has(wave.status)) errors.push("wave.status: invalid enum");
  if (!Number.isInteger(wave.wave) || wave.wave < 1) errors.push("wave.wave: positive integer required");
  if (wave.status !== "integrating") errors.push("wave.status: promotion requires integrating");
  if (!checkKeys(wave, ["wave", "status", "integration", "tasks", "review", "validation"], "wave", errors)) return result(false, undefined, errors);
  if (!Array.isArray(wave.tasks) || wave.tasks.length === 0) errors.push("wave.tasks: at least one task required");
  if (!isObject(wave.integration)) errors.push("wave.integration: required");
  else {
    if (wave.integration.status !== "PASS") errors.push(`wave.integration: promotion requires PASS, got ${wave.integration.status ?? "missing"}`);
    if (!Number.isInteger(wave.integration.attempt) || wave.integration.attempt < 1 || wave.integration.attempt > 3) errors.push("wave.integration.attempt: successful integration attempt required");
    if (!nonEmptyString(wave.integration.evidence)) errors.push("wave.integration.evidence: integration evidence required");
  }
  if (Array.isArray(wave.tasks)) for (const [index, task] of wave.tasks.entries()) {
    if (!isObject(task)) { errors.push(`wave.tasks[${index}]: task must be object`); continue; }
    validateTask(task, `wave.tasks[${index}]`, errors);
    if (task.phase !== "DONE") errors.push(`wave.tasks[${index}]: task must be DONE before promotion`);
    if (!hasGateEvidence(task.gate_evidence)) errors.push(`wave.tasks[${index}]: gate evidence required`);
  }
  validateApprovedReview(wave.review, Array.isArray(wave.tasks) ? wave.tasks : [], errors);
  if (!isObject(wave.validation)) errors.push("wave.validation: consolidated validator report required");
  else {
    checkKeys(wave.validation, ["status", "agent", "suite", "gates", "evidence"], "wave.validation", errors);
    if (wave.validation.status !== "PASS") errors.push("wave.validation.status: validator must PASS");
    if (wave.validation.agent !== "validator") errors.push("wave.validation.agent: validator required");
    if (!isObject(wave.validation.suite)) errors.push("wave.validation.suite: required");
    else {
      checkKeys(wave.validation.suite, ["command", "output"], "wave.validation.suite", errors);
      if (!nonEmptyString(wave.validation.suite.command) || !nonEmptyString(wave.validation.suite.output)) errors.push("wave.validation.suite: command and output evidence required");
    }
    if (!nonEmptyString(wave.validation.evidence)) errors.push("wave.validation.evidence: validator evidence required");
    const reportResult = validateGateReport(wave.validation.gates);
    errors.push(...reportResult.errors.map((message) => `wave.validation: ${message}`));
    if (isObject(wave.validation.gates) && GATES.some((gate) => !COMPLETED_GATE_STATUSES.has(wave.validation.gates[gate]?.status))) errors.push("wave.validation.gates: every gate must PASS or justified NA");
  }
  return result(errors.length === 0, errors.length === 0 ? clone(wave) : undefined, errors);
}

export { GATES, GATE_ORIGINS };
