# Tasks: specs003-convivencia-robusta-skills

> Deriva de [`plan.md`](./plan.md). Convenções: `[P]` = paralelizável dentro da
> onda; status final refletido pela implementação GREEN + refactor + integração
> concluídos e directed suites PASS informadas pelo orquestrador.
> **Feature:** `specs003-convivencia-robusta-skills` · **Issue:** #36
> **Branch:** `fix/36-corrigir-integracao-robusta-das-skills`
>
> Os agentes escrevem apenas nos arquivos do slice. Nenhuma tarefa escreve
> `.omp/state/tdd/progress.json`, `.omp/state/tdd/progress.md` ou `specs001-*`.
> Esta atualização documental escreve somente os quatro paths canônicos desta
> feature; não executa suíte completa, lint, formatter ou build.

## Tarefas

| ID | Onda | Owner | Descrição | AC | Arquivos de produção/documentação | Testes/costuras | Evidência de conclusão | Dependências | Status |
|---|---:|---|---|---|---|---|---|---|---|
| T-001 [P] | 1 | Ship owner | Endurecer `setup`, `new`, `ship` e `deploy`: preflight fail-closed, branch default dinâmica, auth/remote/labels, snapshot quiescido/atômico, rollback, `build: NA`, body/markers e fonte SemVer por unidade. | AC-001, AC-002, AC-003, AC-018 | `ship/bin/ship.mjs`; `ship/bin/lib.mjs`; `ship/SKILL.md`; `ship.config.json` (somente referência de contrato) | `ship/bin/ship.test.mjs`; `ship/bin/lib.test.mjs`; `scripts/ship-protocol.test.mjs` | `ship/bin/ship.test.mjs::AC-001/AC-002/AC-003/AC-004/AC-005/AC-018`; directed Ship suite PASS informado pelo orquestrador | — | DONE |
| T-002 [P] | 1 | Deep-review owner | Validar os cinco modos, fontes/contextos exclusivos, URI/SHA, findings P0–P3, envelopes, pairing agent/protocol e `aggregateReview` com conjunto esperado exato. | AC-004, AC-005, AC-006, AC-007 | `deep-review/lib/protocol.mjs`; `deep-review/SKILL.md`; `deep-review/agents/deep-reviewer.md` | `scripts/deep-review.test.mjs` | `scripts/deep-review.test.mjs::AC-004..AC-007`; directed deep-review suite PASS informado pelo orquestrador | — | DONE |
| T-003 [P] | 1 | TDD state owner | Validar/migrar schema 2.2, ponte 2.1 allowlist/fail-closed, evidência, `attempt`/cap, RED/RED_REVISION/NA, `DONE` pré-integração e promoção. | AC-008, AC-009, AC-010 | `tdd-orchestrator/lib/state.mjs`; `tdd-orchestrator/SKILL.md` | `scripts/tdd-state.test.mjs` | `scripts/tdd-state.test.mjs::AC-008/AC-009/AC-010`; canonical `spec-kit-validator` e directed state suite PASS informados pelo orquestrador | — | DONE |
| T-004 [P] | 1 | Conflict/alignment/HITL owner | Corrigir continuação Git e bloqueio retomável, checkpoint `alignment`, fast-close e pipeline redact → sanitize → scan → persist atômico com gate Bash/AWK. | AC-011, AC-012, AC-015 | `conflict-resolution/**`; `alignment/**`; `bug-diagnosis/scripts/hitl-loop.template.sh`; `bug-diagnosis/SKILL.md` | `scripts/conflict-resolution.test.mjs`; `scripts/alignment.test.mjs`; `scripts/hitl-loop.test.mjs` | Costuras de conflito/alignment/HITL e assinaturas JWT/PEM/glpat_/sk_live_/npm_/GitHub PASS informadas pelo orquestrador | — | DONE |
| T-005 [P] | 1 | Hooks/installer owner | Tornar wrappers e installer portáveis/idempotentes/não destrutivos: argv/stdin/refspec, paths com espaços, `core.hooksPath`, lstat/ancestrais, tipos, extras/stale, precedência projeto > perfil e NOTICE distribuído. | AC-013, AC-014, AC-021 | `install.mjs`; `scripts/install-hooks.mjs`; `scripts/hooks/commit-msg.mjs`; `scripts/hooks/pre-push.mjs`; `NOTICE` (origem distribuída) | `scripts/install-hooks.test.mjs`; `scripts/install.test.mjs` | `scripts/install.test.mjs::NOTICE upstream`, precedência, tipos e `--check`; `scripts/install-hooks.test.mjs::argv/stdin/core.hooksPath`; directed installer/hooks suites PASS informadas pelo orquestrador | — | DONE |
| T-006 [P] | 1 | Release/bootstrap owner | Alinhar branch/ruleset/CI, PAT/permissões, scanner, Node `>=20`, LICENSE/NOTICE/docs, release-please e manifests/fonte SemVer sem congelar `release-as`. | AC-003, AC-016, AC-017, AC-018, AC-021 | `release-bootstrap/SKILL.md`; `.github/workflows/ci.yml`; `.github/workflows/release-please.yml`; `package.json`; `release-please-config.json`; `.release-please-manifest.json`; `LICENSE`; `NOTICE`; README (somente referência de contrato) | `scripts/bootstrap-config.test.mjs`; `ship/bin/ship.test.mjs` (fontes/versionCheck) | `scripts/bootstrap-config.test.mjs::AC-016/AC-017/AC-029`; NOTICE independente de LICENSE; directed bootstrap/release suite PASS informada pelo orquestrador | — | DONE |
| T-007 | 2 | Integrator + validator | Integrar T-001–T-006 apenas mecanicamente, executar regressões reais, consolidar os dez gates com comando/saída/origem, repetir review independente e validação até zero findings P0–P3. | AC-006, AC-009, AC-019, AC-020 | `scripts/integration-validation.test.mjs`; relatório de gates do orquestrador (não criar `progress.*`) | `scripts/integration-validation.test.mjs`; todas as costuras T-001–T-006 | `scripts/integration-validation.test.mjs::AC-009/AC-020`; `build: NA` somente `buildCommand=null`; integração/re-review/validator PASS informados pelo orquestrador | T-001, T-002, T-003, T-004, T-005, T-006 | DONE |
| T-008 | 3 | spec-kit-author | Atualizar in-place os quatro artefatos canônicos, consolidar AC-001..AC-021, contrato machine-readable, DAG/globs e evidência; validar links e caminhos por leitura local. | AC-001–AC-021 | `specs/specs003-convivencia-robusta-skills/spec.md`; `specs/specs003-convivencia-robusta-skills/plan.md`; `specs/specs003-convivencia-robusta-skills/tasks.md`; `specs/specs003-convivencia-robusta-skills/contracts/interface-contract.md` | `NA` somente para AC-019, com objeto exato `status/reason/validator/evidence/reference`; leitura local dos quatro paths | Quatro arquivos escritos/atualizados; status do contrato `APPROVED`; matriz sem AC órfão/tarefa sem AC; paths relativos resolvidos por leitura local | T-007 | DONE |

## Matriz AC → tarefa → `arquivo::teste`/NA

A matriz é exata: não aceita AC órfão, tarefa sem AC, referência vazia ou `NA` para
comportamento executável. O único `NA` é AC-019, exclusivamente estrutural; ele deve
usar `validator: "spec-kit-validator"`, evidência não vazia e referência ao próprio
AC conforme `contracts/interface-contract.md#invariantes`.

| AC | Tarefa(s) | Costura verificável |
|---|---|---|
| AC-001 | T-001 | `ship/bin/ship.test.mjs::AC-001 deploy aborta árvore default suja antes de qualquer efeito`; `ship/bin/ship.test.mjs::AC-005 preflight auth remote label` |
| AC-002 | T-001 | `ship/bin/ship.test.mjs::AC-002 buildCommand=null produz evidência explícita`; `ship/bin/ship.test.mjs::AC-004 dbPath sem quiescência falha antes do snapshot` |
| AC-003 | T-001, T-006 | `ship/bin/ship.test.mjs::AC-003 retry preserva corpo breaking markers e Closes`; `scripts/bootstrap-config.test.mjs::AC-003 retry idempotente do corpo do PR` |
| AC-004 | T-002 | `scripts/deep-review.test.mjs::AC-004 cinco modos e fontes exclusivas` |
| AC-005 | T-002 | `scripts/deep-review.test.mjs::AC-005 URI vincula repository/pull_request`; `scripts/deep-review.test.mjs::AC-005 aliases SHA conflitantes bloqueiam` |
| AC-006 | T-002, T-007 | `scripts/deep-review.test.mjs::AC-006 findings estruturados e limiar P0/P1/P2/P3`; `scripts/integration-validation.test.mjs::AC-020 zero findings e gates` |
| AC-007 | T-002 | `scripts/deep-review.test.mjs::AC-007 protocol_mode pairing expectedReviewers e envelopes` |
| AC-008 | T-003 | `scripts/tdd-state.test.mjs::AC-008 migração 2.1→2.2 aliases unknown keys attempt cap` |
| AC-009 | T-003, T-007 | `scripts/tdd-state.test.mjs::AC-009 DONE pré-integração`; `scripts/integration-validation.test.mjs::AC-009 promoção com review independente e validator` |
| AC-010 | T-003 | `scripts/tdd-state.test.mjs::AC-010 matriz RED existing-code e NA exato`; `scripts/tdd-state.test.mjs::AC-010 spec-kit-validator literal` |
| AC-011 | T-004 | `scripts/conflict-resolution.test.mjs::AC-011 continue correto e bloqueio retomável` |
| AC-012 | T-004 | `scripts/alignment.test.mjs::AC-012 fast-close e perguntas não respondidas` |
| AC-013 | T-005 | `scripts/install-hooks.test.mjs::AC-013 argv stdin refspec e paths sem shell inseguro` |
| AC-014 | T-005 | `scripts/install.test.mjs::AC-014 --check tipos symlink extras stale e precedência` |
| AC-015 | T-004 | `scripts/hitl-loop.test.mjs::AC-015 redaction probes Bash JWT PEM GitHub npm` |
| AC-016 | T-006 | `scripts/bootstrap-config.test.mjs::AC-016 branch default dinâmica ruleset CI PAT`; `scripts/pre-push-default.test.mjs::develop como branch default` |
| AC-017 | T-006 | `scripts/bootstrap-config.test.mjs::AC-017 Node licença documentação e NOTICE` |
| AC-018 | T-001, T-006 | `ship/bin/ship.test.mjs::AC-018 fontes SemVer por unidade`; `scripts/bootstrap-config.test.mjs::AC-029 release-please e ship compartilham fonte` |
| AC-019 | T-008 | `NA — spec-kit-validator; razão/evidência/referência em interface-contract.md#invariantes` |
| AC-020 | T-007 | `scripts/integration-validation.test.mjs::AC-020 relatório consolidado por gate e re-review` |
| AC-021 | T-005, T-006 | `scripts/install.test.mjs::distribuição de NOTICE upstream`; `scripts/bootstrap-config.test.mjs::NOTICE contém licença upstream por si só` |

## Ondas, dependências e globs

- **Onda 1:** T-001–T-006 são paralelas; seus globs de produção/teste não se
  sobrepõem. T-004 e T-005 não escrevem os mesmos arquivos. T-006 referencia
  README/LICENSE/NOTICE apenas quando o slice de governança for executado; esta
  entrega documental não toca README.
- **Onda 2:** T-007 é barreira serial. Integrator só resolve conflitos mecânicos,
  não enfraquece testes, não mascara gate e não escreve Spec Kit/progress.
- **Onda 3:** T-008 é serial e único dono dos quatro artefatos; mudança de contrato
  reabre RED para a costura afetada.

```text
T-001 ─┐
T-002 ─┤
T-003 ─┤
T-004 ─┤──> T-007 ──> T-008
T-005 ─┤
T-006 ─┘
```

## Critério de conclusão por tarefa

- **T-001:** guards e rollback não deixam efeito parcial; snapshot e `build: NA`
  têm prova; corpo/markers e fontes SemVer preservam invariantes.
- **T-002:** cada modo usa fonte autorizada; reviewer/protocolo/revisão e expected
  set são exatos; envelopes e findings inválidos permanecem bloqueados.
- **T-003:** estado e migração são strict/fail-closed; `DONE` pré-integração não
  promove; RED, NA, review, gates e tentativa têm prova.
- **T-004:** merge/rebase continuam pela operação correta; alignment/HITL são
  retomáveis; traces não têm segredo/probe e Bash/AWK têm gate explícito.
- **T-005:** `--check` não escreve; não há destruição de conflito, symlink, tipo,
  extra, stale ou conteúdo do usuário; hooks preservam invocação e NOTICE.
- **T-006:** ruleset/CI/permissões, PAT, Node, license/docs, branch e fontes SemVer
  são coerentes e verificáveis.
- **T-007:** regressões reais, dez gates e re-review independente têm comando/saída;
  integração PASS é pré-condição de promoção.
- **T-008:** quatro docs canônicos coerentes, AC-001..AC-021 cobertos, contrato
  machine-readable, DAG sem ciclo, globs disjuntos e paths verificáveis.

## Gates de evidência

Para cada tarefa e integração, a evidência deve ser específica e não vazia:

1. `traceability`: cada AC aponta para `arquivo::teste` válido ou para o único NA
   normativo exato de AC-019;
2. `tests`: comando real e trecho de saída PASS;
3. `spec_kit`/`contract`: quatro paths, versão 0.1.0, enums, schemas e invariantes
   conferidos contra produção;
4. `security`, `git_sanity`, `lint`, `type_check`, `coverage` e demais gates com
   origem e saída persistidas;
5. `build`: PASS somente com comando executado; NA somente com
   `ship.config.json: buildCommand=null`, razão e saída;
6. `integration`: status PASS, tentativa 0..3, suíte completa do escopo, review
   independente e relatório consolidado dos dez gates.

A presente atualização não altera estado do orquestrador e não reexecuta suíte
completa/lint/formatter/build; usa os resultados GREEN/refactor/integration e directed
suites fornecidos no briefing.

## Referências

- [Spec](./spec.md)
- [Plan](./plan.md)
- [Interface contract](./contracts/interface-contract.md)
- [Issue #36](https://github.com/rronqui/UsefulSkills/issues/36)
