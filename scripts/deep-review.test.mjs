import { describe, expect, it } from "vitest";

// RED targets the executable protocol seam that GREEN must add. Loading it
// dynamically turns a missing module into an assertion failure instead of a
// test setup/import failure.
const protocolModule = await import("../deep-review/lib/protocol.mjs").catch(() => null);

const LOCAL_MODES = ["BRANCH_BASE", "COMMIT", "CUSTOM", "UNCOMMITTED"];
const REVISION = "sha-review-36";

function protocolApi() {
  expect(
    protocolModule,
    "GREEN deve fornecer deep-review/lib/protocol.mjs",
  ).not.toBeNull();
  for (const symbol of [
    "validateRequest",
    "validateReviewerResult",
    "aggregateReview",
    "resolveReviewer",
  ]) {
    expect(protocolModule?.[symbol], `${symbol} deve ser exportado`).toBeTypeOf("function");
  }
  return protocolModule;
}

function prRequest(overrides = {}) {
  return {
    mode: "PR",
    protocol_mode: "DEEP_REVIEW",
    repository: "owner/repo",
    pull_request: 36,
    patch_source: {
      kind: "pr-uri",
      uri: "pr://owner/repo/36/diff/all",
      sha: REVISION,
      content: "diff --git a/src/consumer.mjs b/src/consumer.mjs\n+return result;",
    },
    consumer_context: {
      revision: REVISION,
      files: ["src/consumer.mjs"],
    },
    ...overrides,
  };
}

function localRequest(mode, overrides = {}) {
  const contexts = {
    BRANCH_BASE: {
      mode,
      revision: REVISION,
      base_ref: "main",
      head_ref: "fix/review",
      base_revision: "sha-base",
      head_revision: REVISION,
      diff: "diff --git a/src/branch.mjs b/src/branch.mjs\n+return branch;",
    },
    COMMIT: {
      mode,
      revision: REVISION,
      commit_ref: "HEAD~1",
      commit_revision: REVISION,
      diff: "diff --git a/src/commit.mjs b/src/commit.mjs\n+return commit;",
    },
    CUSTOM: {
      mode,
      revision: REVISION,
      instructions: "Review the parser boundary",
      files: ["src/custom.mjs"],
      diff: "",
    },
    UNCOMMITTED: {
      mode,
      revision: REVISION,
      staged: "diff --cached -- src/uncommitted.mjs",
      unstaged: "",
      untracked: [],
    },
  };

  return {
    mode,
    protocol_mode: "DEEP_REVIEW",
    local_revision_context: {
      ...contexts[mode],
      ...overrides.local_revision_context,
    },
    ...overrides,
  };
}

function finding(priority, overrides = {}) {
  return {
    title: `Handle priority ${priority}`,
    body: `A reproducible condition with priority ${priority} has an actionable impact.`,
    priority,
    confidence: 0.85,
    file_path: `src/file-${priority}.mjs`,
    line_start: priority + 1,
    line_end: priority + 2,
    ...overrides,
  };
}

function reviewerResult(agent = "deep-reviewer", overrides = {}) {
  return {
    agent,
    protocol_mode: agent === "peer-reviewer" ? "DEEP_REVIEW_FALLBACK" : "DEEP_REVIEW",
    status: "VALID",
    reviewed_revision: REVISION,
    overall_correctness: "incorrect",
    explanation: "The review found an actionable defect.",
    confidence: 0.92,
    findings: [finding(0), finding(1), finding(2), finding(3)],
    ...overrides,
  };
}

describe("deep-review — costura executável T-002", () => {
  it("AC-004/AC-005: PR usa patch remoto/SHA e os quatro modos locais usam contexto exclusivo", () => {
    const { validateRequest } = protocolApi();

    const pr = validateRequest(prRequest());
    expect(pr).toMatchObject({
      status: "VALID",
      mode: "PR",
      reviewed_revision: REVISION,
      patch_source: {
        kind: "pr-uri",
        sha: REVISION,
      },
    });
    expect(pr.patch_source.content).toContain("src/consumer.mjs");
    expect(pr.local_revision_context).toBeUndefined();

    const localPatchFallback = validateRequest(prRequest({
      local_revision_context: {
        mode: "PR",
        revision: "local-revision",
        diff: "local patch must never replace the remote patch",
      },
    }));
    expect(localPatchFallback.status).toBe("BLOCKED");

    const emptyRemotePatch = validateRequest(prRequest({
      patch_source: {
        kind: "pr-uri",
        uri: "pr://owner/repo/36/diff/all",
        sha: REVISION,
        content: " \n\t",
      },
    }));
    expect(emptyRemotePatch.status).toBe("BLOCKED");

    const divergentRemoteSha = validateRequest(prRequest({
      consumer_context: {
        revision: "sha-local",
        files: ["src/consumer.mjs"],
      },
    }));
    expect(divergentRemoteSha.status).toBe("BLOCKED");

    for (const mode of LOCAL_MODES) {
      const local = validateRequest(localRequest(mode));
      expect(local, `${mode} deve ser aceito`).toMatchObject({
        status: "VALID",
        mode,
        local_revision_context: {
          mode,
          revision: REVISION,
        },
      });
      expect(local.patch_source).toBeUndefined();
      expect(local.consumer_context).toBeUndefined();

      const contaminated = validateRequest(localRequest(mode, {
        patch_source: {
          kind: "pr-uri",
          sha: "remote-sha",
          content: "invented remote patch",
        },
      }));
      expect(contaminated.status, `${mode} não pode usar patch remoto`).toBe("BLOCKED");
    }

    const customWithoutDiff = validateRequest(localRequest("CUSTOM"));
    expect(customWithoutDiff).toMatchObject({
      status: "VALID",
      mode: "CUSTOM",
      local_revision_context: {
        diff: "",
        files: ["src/custom.mjs"],
      },
    });

    const customWithoutInventory = validateRequest(localRequest("CUSTOM", {
      local_revision_context: { files: [] },
    }));
    expect(customWithoutInventory.status).toBe("BLOCKED");

    const emptyUncommitted = validateRequest(localRequest("UNCOMMITTED", {
      local_revision_context: {
        staged: "",
        unstaged: "",
        untracked: [],
      },
    }));
    expect(emptyUncommitted.status).toBe("BLOCKED");

    const divergentLocalMode = validateRequest(localRequest("COMMIT", {
      local_revision_context: { mode: "BRANCH_BASE" },
    }));
    expect(divergentLocalMode.status).toBe("BLOCKED");
  });

  it.each([
    ["pr-uri", "pr://owner/repo/36/not-a-diff"],
    ["pr-uri", "pr://owner/repo/37/diff/all"],
    ["gh-pr-diff", "pr://other/repo/36/diff/all"],
    ["gh-pr-diff", "pr://owner/repo/37/diff/all"],
  ])("AC-005: %s vincula URI ao repository/pull_request", (kind, uri) => {
    const { validateRequest } = protocolApi();
    const unrelated = validateRequest(prRequest({
      patch_source: {
        ...prRequest().patch_source,
        kind,
        uri,
      },
    }));
    expect(unrelated.ok, `${kind} deve rejeitar URI fora do PR`).toBe(false);
    expect(unrelated.status).toBe("BLOCKED");
    expect(unrelated.errors.length).toBeGreaterThan(0);
  });

  it.each([
    { sha: REVISION, head_sha: "different-sha" },
    { sha: REVISION, "head-sha": "different-sha" },
    { head_sha: REVISION, "head-sha": "different-sha" },
  ])("AC-005: aliases sha/head_sha/head-sha conflitantes bloqueiam %#", (aliases) => {
    const { validateRequest } = protocolApi();
    const conflicting = validateRequest(prRequest({
      patch_source: {
        ...prRequest().patch_source,
        ...aliases,
      },
    }));
    expect(conflicting.ok, "aliases de SHA conflitantes devem bloquear").toBe(false);
    expect(conflicting.status).toBe("BLOCKED");
    expect(conflicting.errors.join(" ")).toMatch(/sha|revision/i);
  });
  it("AC-005: SHA herdado não pode substituir alias próprio ao fixar a revisão", () => {
    const { validateRequest } = protocolApi();
    const patchSource = Object.assign(Object.create({ sha: "stale-inherited-sha" }), {
      kind: "gh-pr-diff",
      head_sha: REVISION,
      content: "diff --git a/src/inherited.mjs b/src/inherited.mjs\n+return safe;",
    });
    const checked = validateRequest(prRequest({
      patch_source: patchSource,
      consumer_context: { revision: "stale-inherited-sha", files: ["src/inherited.mjs"] },
    }));
    expect(checked.ok).toBe(false);
    expect(checked.status).toBe("BLOCKED");
    expect(checked.errors.join(" ")).toMatch(/revision|sha/i);
  });
  it("AC-006 regression: findings herdados não podem ser tratados como ausência de findings", () => {
    const { validateReviewerResult } = protocolApi();
    const inheritedFindings = reviewerResult("deep-reviewer");
    delete inheritedFindings.findings;
    Object.setPrototypeOf(inheritedFindings, { findings: [finding(0)] });

    const checked = validateReviewerResult(inheritedFindings, {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    });

    expect(checked.status).toBe("BLOCKED");
    expect(checked.errors.join(" ")).toMatch(/findings.*own enumerable/i);
  });


  it("AC-006: findings são objetos localizados, P0/P1 bloqueiam e P2/P3 permanecem retidos", () => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const allPriorities = reviewerResult("deep-reviewer");

    const normalized = validateReviewerResult(allPriorities, {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    });
    expect(normalized).toMatchObject({
      status: "VALID",
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
    });
    expect(normalized.findings).toHaveLength(4);
    normalized.findings.forEach((item) => {
      expect(item).toEqual(expect.objectContaining({
        title: expect.any(String),
        body: expect.any(String),
        priority: expect.any(Number),
        confidence: expect.any(Number),
        file_path: expect.any(String),
        line_start: expect.any(Number),
        line_end: expect.any(Number),
      }));
      expect(Number.isInteger(item.priority)).toBe(true);
      expect(Number.isInteger(item.line_start)).toBe(true);
      expect(Number.isInteger(item.line_end)).toBe(true);
      expect(item.line_start).toBeGreaterThanOrEqual(1);
      expect(item.line_end - item.line_start + 1).toBeLessThanOrEqual(10);
    });

    const aggregate = aggregateReview([normalized], REVISION, ["deep-reviewer"]);
    expect(aggregate).toMatchObject({
      status: "BLOCKED",
      reviewed_revision: REVISION,
      counts: { P0: 1, P1: 1, P2: 1, P3: 1 },
      reviewers: ["deep-reviewer"],
    });
    expect(aggregate.blockers.map(({ priority }) => priority)).toEqual([0, 1]);
    expect(aggregate.findings.map(({ priority }) => priority)).toEqual([0, 1, 2, 3]);
    expect(aggregate.findings.slice(2)).toEqual([
      expect.objectContaining({ priority: 2, file_path: expect.any(String) }),
      expect.objectContaining({ priority: 3, file_path: expect.any(String) }),
    ]);

    const nonBlocking = validateReviewerResult(
      reviewerResult("deep-reviewer", {
        overall_correctness: "correct",
        findings: [finding(2), finding(3)],
      }),
      {
        agent: "deep-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW",
      },
    );
    const nonBlockingAggregate = aggregateReview([nonBlocking], REVISION, ["deep-reviewer"]);
    expect(nonBlockingAggregate).toMatchObject({
      status: "APPROVED",
      blockers: [],
      counts: { P0: 0, P1: 0, P2: 1, P3: 1 },
    });
    expect(nonBlockingAggregate.findings.map(({ priority }) => priority)).toEqual([2, 3]);

    for (const malformed of [
      { ...finding(1), line_start: 0 },
      { ...finding(1), line_end: 12 },
      { ...finding(1), priority: 4 },
      { ...finding(1), file_path: "" },
      { ...finding(1), body: "" },
    ]) {
      const invalid = validateReviewerResult(reviewerResult("deep-reviewer", {
        findings: [malformed],
      }), {
        agent: "deep-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW",
      });
      expect(invalid.status).toBe("BLOCKED");
    }
  });

  it("AC-006: reviewer incorreto com somente P2/P3 não bloqueia", () => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const incorrect = validateReviewerResult(
      reviewerResult("deep-reviewer", {
        overall_correctness: "incorrect",
        findings: [finding(2), finding(3)],
      }),
      {
        agent: "deep-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW",
      },
    );
    expect(incorrect).toMatchObject({ ok: true, status: "VALID" });

    const aggregate = aggregateReview([incorrect], REVISION, ["deep-reviewer"]);
    expect(aggregate).toMatchObject({
      ok: true,
      status: "APPROVED",
      blockers: [],
      counts: { P0: 0, P1: 0, P2: 1, P3: 1 },
    });
    expect(aggregate.findings.map(({ priority }) => priority)).toEqual([2, 3]);
  });

  it("AC-006: coleção de findings presente mas esparsa bloqueia", () => {
    const { validateReviewerResult } = protocolApi();
    const sparse = reviewerResult("deep-reviewer", {
      findings: new Array(1),
    });
    const checked = validateReviewerResult(sparse, {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    });

    expect(checked.ok).toBe(false);
    expect(checked.status).toBe("BLOCKED");
    expect(checked.errors.length).toBeGreaterThan(0);
  });

  it("AC-007: protocol_mode ausente bloqueia o reviewer", () => {
    const { validateReviewerResult } = protocolApi();
    const expected = {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    };
    const missingMode = reviewerResult("deep-reviewer", { findings: [] });
    delete missingMode.protocol_mode;
    const missing = validateReviewerResult(missingMode, expected);
    expect(missing.ok).toBe(false);
    expect(missing.status).toBe("BLOCKED");
    expect(missing.errors.join(" ")).toMatch(/protocol_mode/i);
  });

  it.each([
    ["deep-reviewer", "DEEP_REVIEW_FALLBACK"],
    ["peer-reviewer", "DEEP_REVIEW"],
    ["peer-reviewer", "TDD_PEER_REVIEW"],
  ])("AC-007: protocol_mode incompatível com %s/%s bloqueia", (agent, protocol_mode) => {
    const { validateReviewerResult } = protocolApi();
    const incompatible = validateReviewerResult(
      reviewerResult(agent, { protocol_mode, findings: [] }),
      {
        agent,
        reviewed_revision: REVISION,
        protocol_mode,
      },
    );
    expect(incompatible.ok, `${agent}/${protocol_mode} deve ser rejeitado`).toBe(false);
    expect(incompatible.status).toBe("BLOCKED");
  });

  it("AC-007: aggregateReview exige expectedReviewers explícitos", () => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const normalized = validateReviewerResult(
      reviewerResult("deep-reviewer", { findings: [] }),
      {
        agent: "deep-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW",
      },
    );
    const aggregate = aggregateReview([normalized], REVISION);
    expect(aggregate.ok).toBe(false);
    expect(aggregate.status).toBe("BLOCKED");
    expect(aggregate.errors.length).toBeGreaterThan(0);
  });

  it("AC-007: aggregateReview rejeita reviewer esperado ausente", () => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const normalized = validateReviewerResult(
      reviewerResult("deep-reviewer", { findings: [] }),
      {
        agent: "deep-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW",
      },
    );
    const aggregate = aggregateReview(
      [normalized],
      REVISION,
      ["deep-reviewer", "peer-reviewer"],
    );
    expect(aggregate.ok).toBe(false);
    expect(aggregate.status).toBe("BLOCKED");
    expect(aggregate.errors.length).toBeGreaterThan(0);
  });

  it("AC-007: aggregateReview rejeita reviewer inesperado", () => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const normalized = validateReviewerResult(
      reviewerResult("deep-reviewer", { findings: [] }),
      {
        agent: "deep-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW",
      },
    );
    const aggregate = aggregateReview([normalized], REVISION, ["peer-reviewer"]);
    expect(aggregate.ok).toBe(false);
    expect(aggregate.status).toBe("BLOCKED");
    expect(aggregate.errors.length).toBeGreaterThan(0);
  });

  it("AC-007: aggregateReview rejeita reviewer duplicado", () => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const normalized = validateReviewerResult(
      reviewerResult("deep-reviewer", { findings: [] }),
      {
        agent: "deep-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW",
      },
    );
    const aggregate = aggregateReview(
      [normalized, normalized],
      REVISION,
      ["deep-reviewer"],
    );
    expect(aggregate.ok).toBe(false);
    expect(aggregate.status).toBe("BLOCKED");
    expect(aggregate.errors.length).toBeGreaterThan(0);
  });

  it("AC-007: envelope ok:true com errors não pode normalizar um reviewer válido", () => {
    const { validateReviewerResult } = protocolApi();
    const expected = {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    };
    const inconsistent = {
      ok: true,
      errors: ["reviewer reported a dispatch error"],
      value: reviewerResult("deep-reviewer", { findings: [] }),
    };

    const checked = validateReviewerResult(inconsistent, expected);
    expect(checked.ok).toBe(false);
    expect(checked.status).toBe("BLOCKED");
    expect(checked.errors).toContain("reviewer reported a dispatch error");
  });

  it("AC-007: envelope BLOCKED no aggregate preserva seu diagnóstico", () => {
    const { aggregateReview } = protocolApi();
    const blockedEnvelope = {
      ok: false,
      errors: ["reviewer timed out before yielding a result"],
    };

    const aggregate = aggregateReview([blockedEnvelope], REVISION, ["deep-reviewer"]);
    expect(aggregate.ok).toBe(false);
    expect(aggregate.status).toBe("BLOCKED");
    expect(aggregate.errors).toContain("reviewer timed out before yielding a result");
  });

  it("AC-007: aggregate vazio ou malformed bloqueia com diagnóstico", () => {
    const { aggregateReview } = protocolApi();
    const empty = aggregateReview([], REVISION, ["deep-reviewer"]);
    expect(empty).toMatchObject({ ok: false, status: "BLOCKED" });
    expect(empty.errors.length).toBeGreaterThan(0);

    const malformed = aggregateReview([null], REVISION, ["deep-reviewer"]);
    expect(malformed).toMatchObject({ ok: false, status: "BLOCKED" });
    expect(malformed.errors.length).toBeGreaterThan(0);
    expect(malformed.errors.join(" ")).toMatch(/reviewers\[0\]/);
  });

  it("AC-007: ausência/schema/status/revisão inválidos bloqueiam sem inferir aprovação", () => {
    const { validateReviewerResult } = protocolApi();
    const expected = {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    };
    const complete = reviewerResult("deep-reviewer", {
      overall_correctness: "correct",
      findings: [],
    });

    const valid = validateReviewerResult(complete, expected);
    expect(valid).toMatchObject({
      status: "VALID",
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      findings: [],
    });

    for (const invalidResult of [
      null,
      { ...complete, agent: "reviewer" },
      { ...complete, status: "BLOCKED" },
      { ...complete, reviewed_revision: "other-revision" },
      { ...complete, overall_correctness: "maybe" },
      { ...complete, explanation: "" },
      { ...complete, confidence: 2 },
      { ...complete, findings: [{ priority: 1 }] },
      { ...complete, findings: "not-an-array" },
    ]) {
      const invalid = validateReviewerResult(invalidResult, expected);
      expect(invalid.status).toBe("BLOCKED");
      expect(invalid).not.toMatchObject({ status: "VALID", overall_correctness: "correct" });
    }
  });

  it("AC-007: resolve projeto > usuário > fallback peer-reviewer nomeado, com protocolo e revisão exatos", () => {
    const { resolveReviewer, validateReviewerResult } = protocolApi();

    const fromProject = resolveReviewer({
      projectCandidates: ["deep-reviewer"],
      userCandidates: ["deep-reviewer", "peer-reviewer"],
    });
    expect(fromProject).toMatchObject({
      agent: "deep-reviewer",
      protocol_mode: "DEEP_REVIEW",
    });

    const fromUser = resolveReviewer({
      projectCandidates: [],
      userCandidates: ["deep-reviewer"],
    });
    expect(fromUser).toMatchObject({
      agent: "deep-reviewer",
      protocol_mode: "DEEP_REVIEW",
    });

    const fallback = resolveReviewer({
      projectCandidates: [],
      userCandidates: ["peer-reviewer"],
    });
    expect(fallback).toMatchObject({
      agent: "peer-reviewer",
      protocol_mode: "DEEP_REVIEW_FALLBACK",
    });
    expect(fallback.schema).toBe("deep-review");
    expect(fallback.blockingPriorities).toEqual([0, 1]);

    const fallbackResult = validateReviewerResult(
      reviewerResult("peer-reviewer", { findings: [] }),
      {
        agent: "peer-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW_FALLBACK",
      },
    );
    expect(fallbackResult).toMatchObject({
      status: "VALID",
      agent: "peer-reviewer",
      reviewed_revision: REVISION,
    });

    const wrongIdentity = validateReviewerResult(
      reviewerResult("deep-reviewer", { findings: [] }),
      {
        agent: "peer-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW_FALLBACK",
      },
    );
    expect(wrongIdentity.status).toBe("BLOCKED");

    const wrongRevision = validateReviewerResult(
      reviewerResult("peer-reviewer", {
        reviewed_revision: "different-revision",
        findings: [],
      }),
      {
        agent: "peer-reviewer",
        reviewed_revision: REVISION,
        protocol_mode: "DEEP_REVIEW_FALLBACK",
      },
    );
    expect(wrongRevision.status).toBe("BLOCKED");

    const noNamedReviewer = resolveReviewer({
      projectCandidates: [],
      userCandidates: [],
    });
    expect(noNamedReviewer.status).toBe("BLOCKED");
  });

  it("AC-005: PR sem consumer_context ou revision bloqueia", () => {
    const { validateRequest } = protocolApi();

    const withoutContext = prRequest();
    delete withoutContext.consumer_context;
    const missingContext = validateRequest(withoutContext);
    expect(missingContext).toMatchObject({ ok: false, status: "BLOCKED" });
    expect(missingContext.errors.join(" ")).toMatch(/consumer_context/i);

    const missingRevision = validateRequest(prRequest({
      consumer_context: { files: ["src/consumer.mjs"] },
    }));
    expect(missingRevision).toMatchObject({ ok: false, status: "BLOCKED" });
    expect(missingRevision.errors.join(" ")).toMatch(/consumer_context\.revision/i);
  });

  it("AC-005: modos locais rejeitam consumer_context, repository e pull_request", () => {
    const { validateRequest } = protocolApi();
    const contaminants = [
      ["consumer_context", { revision: REVISION, files: ["src/consumer.mjs"] }],
      ["repository", "owner/repo"],
      ["pull_request", 1],
    ];

    for (const mode of LOCAL_MODES) {
      for (const [field, value] of contaminants) {
        const checked = validateRequest(localRequest(mode, { [field]: value }));
        expect(checked.ok, `${mode} não pode aceitar ${field}`).toBe(false);
        expect(checked.status).toBe("BLOCKED");
        expect(checked.errors.join(" ")).toMatch(new RegExp(field));
      }
    }
  });

  it("AC-005: gh-pr-diff válido aceita URI ausente ou coincidente", () => {
    const { validateRequest } = protocolApi();
    const content = "diff --git a/src/gh-pr.mjs b/src/gh-pr.mjs\n+return gh;";

    const withoutUri = validateRequest(prRequest({
      patch_source: {
        kind: "gh-pr-diff",
        sha: REVISION,
        content,
      },
    }));
    expect(withoutUri).toMatchObject({
      ok: true,
      status: "VALID",
      patch_source: { kind: "gh-pr-diff", sha: REVISION },
    });
    expect(withoutUri.patch_source).not.toHaveProperty("uri");

    const matchingUri = validateRequest(prRequest({
      patch_source: {
        kind: "gh-pr-diff",
        uri: "pr://owner/repo/36/diff/all",
        sha: REVISION,
        content,
      },
    }));
    expect(matchingUri).toMatchObject({
      ok: true,
      status: "VALID",
      patch_source: {
        kind: "gh-pr-diff",
        uri: "pr://owner/repo/36/diff/all",
        sha: REVISION,
      },
    });
  });

  it.each(["head_sha", "head-sha"])(
    "AC-005: alias isolado %s normaliza para sha",
    (alias) => {
      const { validateRequest } = protocolApi();
      const normalized = validateRequest(prRequest({
        patch_source: {
          kind: "gh-pr-diff",
          [alias]: REVISION,
          content: "diff --git a/src/alias.mjs b/src/alias.mjs\n+return alias;",
        },
      }));

      expect(normalized).toMatchObject({
        ok: true,
        status: "VALID",
        reviewed_revision: REVISION,
        patch_source: { kind: "gh-pr-diff", sha: REVISION },
      });
      expect(normalized.patch_source).not.toHaveProperty("head_sha");
      expect(normalized.patch_source).not.toHaveProperty("head-sha");
    },
  );

  it("AC-005: URI pr:// com pull request de um dígito é aceito", () => {
    const { validateRequest } = protocolApi();
    const checked = validateRequest(prRequest({
      pull_request: 1,
      patch_source: {
        kind: "pr-uri",
        uri: "pr://owner/repo/1/diff/all",
        sha: REVISION,
        content: "diff --git a/src/single-digit.mjs b/src/single-digit.mjs\n+return one;",
      },
    }));

    expect(checked).toMatchObject({
      ok: true,
      status: "VALID",
      pull_request: 1,
      patch_source: {
        uri: "pr://owner/repo/1/diff/all",
        sha: REVISION,
      },
    });
  });

  it.each([
    ["consumer_context.files", () => prRequest({
      consumer_context: {
        revision: REVISION,
        files: new Array(1),
      },
    })],
    ["expected_reviewers", () => prRequest({
      expected_reviewers: new Array(1),
    })],
    ["CUSTOM.files", () => {
      const base = localRequest("CUSTOM").local_revision_context;
      return localRequest("CUSTOM", {
        local_revision_context: { ...base, files: new Array(1) },
      });
    }],
    ["UNCOMMITTED.untracked", () => {
      const base = localRequest("UNCOMMITTED").local_revision_context;
      return localRequest("UNCOMMITTED", {
        local_revision_context: { ...base, untracked: new Array(1) },
      });
    }],
  ])("AC-005/AC-007: array esparso de strings %s bloqueia", (_label, makeRequest) => {
    const { validateRequest } = protocolApi();
    const checked = validateRequest(makeRequest());

    expect(checked.ok).toBe(false);
    expect(checked.status).toBe("BLOCKED");
    expect(checked.errors.length).toBeGreaterThan(0);
  });

  it.each([
    ["restrictions", new Array(1)],
    ["restrictions", [""]],
    ["restrictions", [null]],
    ["restrictions", "not-an-array"],
    ["excluded", new Array(1)],
    ["excluded", [""]],
    ["excluded", [null]],
    ["excluded", "not-an-array"],
  ])("AC-005/AC-007: CUSTOM.%s inválido bloqueia", (field, invalid) => {
    const { validateRequest } = protocolApi();
    const base = localRequest("CUSTOM").local_revision_context;
    const checked = validateRequest(localRequest("CUSTOM", {
      local_revision_context: { ...base, [field]: invalid },
    }));

    expect(checked.ok).toBe(false);
    expect(checked.status).toBe("BLOCKED");
    expect(checked.errors.length).toBeGreaterThan(0);
  });

  it("AC-006: aggregate com P0/P1 mantém ok:true e errors vazio", () => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const normalized = validateReviewerResult(reviewerResult("deep-reviewer"), {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    });
    const aggregate = aggregateReview([normalized], REVISION, ["deep-reviewer"]);

    expect(aggregate).toMatchObject({
      ok: true,
      errors: [],
      status: "BLOCKED",
      blockers: [
        expect.objectContaining({ priority: 0 }),
        expect.objectContaining({ priority: 1 }),
      ],
      counts: { P0: 1, P1: 1 },
    });
  });
  it("AC-006: finding P0 oculto por propriedade não enumerável bloqueia validação e agregação", () => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const hiddenP0 = finding(0);
    Object.defineProperty(hiddenP0, "priority", {
      enumerable: false,
      value: 0,
    });

    expect(Object.prototype.hasOwnProperty.call(hiddenP0, "priority")).toBe(true);
    expect(Object.prototype.propertyIsEnumerable.call(hiddenP0, "priority")).toBe(false);
    expect(hiddenP0.priority).toBe(0);
    expect(Object.keys(hiddenP0)).not.toContain("priority");

    const raw = reviewerResult("deep-reviewer", { findings: [hiddenP0] });
    const expected = {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    };
    const checked = validateReviewerResult(raw, expected);
    const aggregate = aggregateReview([raw], REVISION, ["deep-reviewer"]);

    expect(checked.ok).toBe(false);
    expect(checked.status).toBe("BLOCKED");
    expect(checked.errors.join(" ")).toMatch(/priority/i);

    expect(aggregate.ok).toBe(false);
    expect(aggregate.status).toBe("BLOCKED");
    expect(aggregate.errors.length).toBeGreaterThan(0);
    expect(aggregate.errors.join(" ")).toMatch(/priority/i);
  });

  it("AC-007: aggregate aceita reviewer raw e peer-reviewer com fallback_agent", () => {
    const { aggregateReview } = protocolApi();

    const rawAggregate = aggregateReview(
      [reviewerResult("deep-reviewer", { findings: [finding(2)] })],
      REVISION,
      ["deep-reviewer"],
    );
    expect(rawAggregate).toMatchObject({
      ok: true,
      errors: [],
      status: "APPROVED",
      reviewers: ["deep-reviewer"],
      fallback_agent: "",
    });

    const fallbackAggregate = aggregateReview(
      [reviewerResult("peer-reviewer", { findings: [finding(3)] })],
      REVISION,
      ["peer-reviewer"],
    );
    expect(fallbackAggregate).toMatchObject({
      ok: true,
      errors: [],
      status: "APPROVED",
      protocol_mode: "DEEP_REVIEW_FALLBACK",
      reviewers: ["peer-reviewer"],
      fallback_agent: "peer-reviewer",
    });
  });

  it.each([
    ["vazio", []],
    ["duplicado", ["deep-reviewer", "deep-reviewer"]],
    ["desconhecido", ["unknown-reviewer"]],
  ])("AC-007: expectedReviewers %s bloqueia", (_label, expectedReviewers) => {
    const { aggregateReview } = protocolApi();
    const aggregate = aggregateReview(
      [reviewerResult("deep-reviewer", { findings: [] })],
      REVISION,
      expectedReviewers,
    );

    expect(aggregate.ok).toBe(false);
    expect(aggregate.status).toBe("BLOCKED");
    expect(aggregate.errors.length).toBeGreaterThan(0);
  });

  it.each([
    ["sem errors", { ok: true, value: reviewerResult("deep-reviewer", { findings: [] }) }],
    ["errors esparso", {
      ok: true,
      errors: new Array(1),
      value: reviewerResult("deep-reviewer", { findings: [] }),
    }],
    ["errors não-string", {
      ok: true,
      errors: [null],
      value: reviewerResult("deep-reviewer", { findings: [] }),
    }],
  ])("AC-007: envelope ok:true %s bloqueia", (_label, envelope) => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const expected = {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    };

    const checked = validateReviewerResult(envelope, expected);
    expect(checked.ok).toBe(false);
    expect(checked.status).toBe("BLOCKED");
    expect(checked.errors.length).toBeGreaterThan(0);

    const aggregate = aggregateReview([envelope], REVISION, ["deep-reviewer"]);
    expect(aggregate.ok).toBe(false);
    expect(aggregate.status).toBe("BLOCKED");
    expect(aggregate.errors.length).toBeGreaterThan(0);
  });
  it("AC-005: URI de patch sem caminho /diff/all bloqueia", () => {
    const { validateRequest } = protocolApi();
    const missingDiffPath = validateRequest(prRequest({
      patch_source: {
        ...prRequest().patch_source,
        uri: "pr://owner/repo/36",
      },
    }));

    expect(missingDiffPath).toMatchObject({
      ok: false,
      status: "BLOCKED",
    });
    expect(missingDiffPath.errors.length).toBeGreaterThan(0);
  });

  it("AC-007: aggregateReview bloqueia conjunto misto quando deep-reviewer e peer-reviewer são esperados", () => {
    const { aggregateReview } = protocolApi();
    const aggregate = aggregateReview(
      [
        reviewerResult("deep-reviewer", { findings: [] }),
        reviewerResult("peer-reviewer", { findings: [] }),
      ],
      REVISION,
      ["deep-reviewer", "peer-reviewer"],
    );

    expect(aggregate).toMatchObject({
      ok: false,
      status: "BLOCKED",
    });
    expect(aggregate.errors.length).toBeGreaterThan(0);
  });

  it("AC-007: envelope com chave desconhecida bloqueia sem descartar diagnóstico", () => {
    const { validateReviewerResult, aggregateReview } = protocolApi();
    const expected = {
      agent: "deep-reviewer",
      reviewed_revision: REVISION,
      protocol_mode: "DEEP_REVIEW",
    };
    const unknownKeyEnvelope = {
      ok: true,
      errors: [],
      value: reviewerResult("deep-reviewer", { findings: [] }),
      unexpected_metadata: "dispatch-42",
    };

    const checked = validateReviewerResult(unknownKeyEnvelope, expected);
    expect(checked).toMatchObject({
      ok: false,
      status: "BLOCKED",
    });
    expect(checked.errors.join(" ")).toMatch(/unexpected|not allowed|envelope/i);

    const diagnostic = "reviewer timed out before yielding a result";
    const blockedEnvelope = {
      ok: false,
      errors: [diagnostic],
      unexpected_metadata: "dispatch-42",
    };
    const aggregate = aggregateReview(
      [blockedEnvelope],
      REVISION,
      ["deep-reviewer"],
    );
    expect(aggregate).toMatchObject({
      ok: false,
      status: "BLOCKED",
    });
    expect(aggregate.errors).toContain(diagnostic);
    expect(aggregate.errors.join(" ")).toMatch(/unexpected|not allowed|envelope/i);
  });

  it("AC-007: prioriza deep-reviewer nomeado em projeto ou usuário antes do fallback", () => {
    const { resolveReviewer } = protocolApi();
    const resolved = resolveReviewer({
      projectCandidates: ["peer-reviewer"],
      userCandidates: ["deep-reviewer"],
    });

    expect(resolved).toMatchObject({
      ok: true,
      agent: "deep-reviewer",
      protocol_mode: "DEEP_REVIEW",
    });
  });

});
