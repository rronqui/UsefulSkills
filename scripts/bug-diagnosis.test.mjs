import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(repoRoot, "bug-diagnosis", "SKILL.md");
const skill = readFileSync(skillPath, "utf8");
const normalizedSkill = skill.toLocaleLowerCase("pt-BR");

describe("bug-diagnosis: contrato mensurável para falhas intermitentes", () => {
  it("define um registro de reprodução com tentativas, sucessos, falhas e taxa", () => {
    expect(normalizedSkill).toMatch(/attempts|tentativas/);
    expect(normalizedSkill).toMatch(/successes|sucessos/);
    expect(normalizedSkill).toMatch(/failures|falhas/);
    expect(normalizedSkill).toMatch(/rate|taxa/);

    // Os campos precisam formar uma evidência única, não apenas aparecer
    // incidentalmente em seções não relacionadas ao diagnóstico.
    expect(normalizedSkill).toMatch(
      /(?:attempts|tentativas)[\s\S]{0,240}(?:successes|sucessos)[\s\S]{0,240}(?:failures|falhas)[\s\S]{0,240}(?:rate|taxa)/,
    );
  });

  it("declara amostra mínima e limiar acordado antes de avançar", () => {
    expect(normalizedSkill).toMatch(
      /(?:(?:minimum|mínim)[\s_-]*(?:sample|amostra)|(?:sample|amostra)[\s_-]*(?:minimum|mínim))/,
    );
    expect(normalizedSkill).toMatch(/threshold|limiar/);

    const advancementRule = normalizedSkill.match(
      /(?:only|s[oó])[^\n]{0,120}(?:advance|avanc|avanç)[\s\S]{0,240}(?:rate|taxa)[\s\S]{0,240}(?:threshold|limiar)/,
    );
    expect(advancementRule).not.toBeNull();
  });

  it("define bloqueio com evidência quando não há taxa ou ambiente reprodutível", () => {
    expect(normalizedSkill).toMatch(/(?:blocked|bloquead[oa]|bloqueia)/);
    expect(normalizedSkill).toMatch(
      /(?:blocked|bloquead[oa]|bloqueia)[\s\S]{0,240}(?:evidence|evid[eê]ncia)[\s\S]{0,240}(?:attempts|tentativas)[\s\S]{0,240}(?:rate|taxa)/,
    );
    expect(normalizedSkill).toMatch(
      /(?:no|sem|não)[\s\S]{0,80}(?:rate|taxa)[\s\S]{0,160}(?:environment|ambiente)[\s\S]{0,160}(?:reproduc|capaz)/,
    );
  });
  it("expõe um predicado determinístico fechado para decidir o avanço", () => {
    const deterministicSection = normalizedSkill.match(
      /### critério determinístico para falhas intermitentes[\s\S]*?(?=### persistência)/,
    )?.[0];
    expect(deterministicSection).toBeDefined();
    expect(deterministicSection).toMatch(
      /attempts\s*>=\s*minimum_sample\s*&&\s*rate\s*>=\s*rate_threshold/,
    );

    const passingEvidence = {
      attempts: 10,
      successes: 7,
      failures: 3,
      rate: 0.7,
      minimum_sample: 10,
      rate_threshold: 0.6,
    };
    expect(passingEvidence.attempts).toBe(
      passingEvidence.successes + passingEvidence.failures,
    );
    expect(passingEvidence.rate).toBeCloseTo(
      passingEvidence.successes / passingEvidence.attempts,
    );
    expect(
      passingEvidence.attempts >= passingEvidence.minimum_sample &&
        passingEvidence.rate >= passingEvidence.rate_threshold,
    ).toBe(true);
  });

  it("declara os campos obrigatórios do bloqueio BLOCKED", () => {
    const deterministicSection = normalizedSkill.match(
      /### critério determinístico para falhas intermitentes[\s\S]*?(?=### persistência)/,
    )?.[0];
    expect(deterministicSection).toBeDefined();
    const blockedFields = [
      "status",
      "reason",
      "evidence",
      "environment",
      "last_command",
      "next_action",
    ];
    for (const field of blockedFields) {
      expect(deterministicSection).toMatch(new RegExp(`\`${field}\``));
    }
    expect(deterministicSection).toMatch(/`status`\s*[:=]\s*blocked/);
  });

  it("preserva a evidência nomeada ao fazer resume", () => {
    const deterministicSection = normalizedSkill.match(
      /### critério determinístico para falhas intermitentes[\s\S]*?(?=### persistência)/,
    )?.[0];
    expect(deterministicSection).toBeDefined();
    expect(deterministicSection).toMatch(/`resume`\s*[:=]/);
    expect(deterministicSection).toMatch(
      /`resume`[\s\S]{0,500}(?:`attempts`|`successes`|`failures`|`rate`)/,
    );
    expect(deterministicSection).toMatch(
      /`resume`[\s\S]{0,700}(?:`minimum_sample`|`rate_threshold`)[\s\S]{0,700}(?:preserv|contin|mant[eê]m)/,
    );
  });
});
