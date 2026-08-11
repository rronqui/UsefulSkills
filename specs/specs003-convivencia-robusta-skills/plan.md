# Plan: specs003-convivencia-robusta-skills

> **Feature:** `specs003-convivencia-robusta-skills`
> **Spec:** [spec.md](./spec.md)
> **Contrato:** [contracts/interface-contract.md](./contracts/interface-contract.md) v0.1.0 (`APPROVED`)
> **Issue:** #36
> **Branch:** `fix/36-corrigir-integracao-robusta-das-skills`
> **Status:** Green + refactor + integração concluídos; directed suites PASS informadas pelo orquestrador.

## Objetivo e arquitetura

A arquitetura é de guards na origem, schemas explícitos e efeitos atrasados. Cada
slice preserva as interfaces já presentes e valida entrada, revisão, estado e
pré-condições antes de chamar Git/GitHub, escrever no perfil, persistir trace ou
promover uma onda. O contrato é delimitado pelo código existente; não há endpoint,
comando, agente ou adaptador externo novo nesta feature.

### Componentes e ownership por slice

| Slice | Dono de produção | Fronteira real | Regra de ownership |
|---|---|---|---|
| Ship/deploy/release | `ship/bin/ship.mjs`, `ship/bin/lib.mjs` | CLI existente `setup`, `new`, `ship`, `deploy`; release é o workflow release-please | Preflight e rollback no CLI; fontes SemVer são verificadas por unidade; `buildCommand=null` é NA explícito. |
| Deep-review | `deep-review/lib/protocol.mjs` | exports `validateRequest`, `validateReviewerResult`, `aggregateReview`, `resolveReviewer` | Request discriminado por modo; resultado é envelope; reviewer/protocolo/revisão são pareados e o agregador recebe `expectedReviewers` explícito. |
| Estado TDD | `tdd-orchestrator/lib/state.mjs` | exports `migrateProgress`, `validateProgress`, `validateCriteriaMatrix`, `validateGateReport`, `canPromoteWave` | Schema 2.2 é allowlist; migração 2.1 é ponte única; `DONE` é pré-integração; promoção exige review/gates pós-integração. |
| Conflito/alignment/HITL | `conflict-resolution/**`, `alignment/**`, `bug-diagnosis/scripts/hitl-loop.template.sh` | Skills e template shell existentes | Continuação Git e checkpoint são persistidos; redaction/sanitize/scan precedem stdout e persistência; Bash/AWK ausente é gate explícito. |
| Hooks/installer | `scripts/install-hooks.mjs`, `scripts/hooks/**`, `install.mjs` | npm `prepare`, wrappers Git, `node install.mjs [--check]` | Preflight lê `lstat`/ancestrais e inventário completo; `--check` não escreve; conflito, drift, extras e precedência projeto > perfil são reportados sem destruição. |
| Release/CI/governança | `release-bootstrap/SKILL.md`, `.github/workflows/**`, configs e `NOTICE` | GitHub Actions, release-please, `LICENSE`/`NOTICE`, manifests | Branch default vem do evento/API; ruleset é branch-scoped; permissões são mínimas; cada unidade SemVer é verificável; notices upstream são distribuídos. |
| Integração/documentação | `scripts/integration-validation.test.mjs` e os quatro artefatos canônicos | Integrator, reviewer independente, validator e spec-kit-author | Integrator só resolve mecânica; review/validator repetem evidência; este plano não cria `progress.*` nem altera código/testes. |

### APIs e comportamentos deliberadamente não inventados

- `aggregateReview` é exatamente `aggregateReview(results, expectedRevision,
  expectedReviewers)`; não existe sobrecarga que infira o conjunto esperado.
- `validateReviewerResult(result, expected)` recebe a identidade/protocolo/revisão
  esperados e rejeita ausência de `protocol_mode` ou pairing incompatível.
- O runtime aceita envelopes `{ ok, errors, value }`; `errors` não é descartado nem
  convertido em aprovação. Projeções não enumeráveis (`status`, `findings`, etc.)
  são conveniência de compatibilidade e não chaves JSON adicionais.
- `ship.mjs` não recebe um subcomando `release`; o release operacional é o workflow
  `.github/workflows/release-please.yml`.
- O installer distribui o inventário atual (sete skills e nove agentes) e NOTICE;
  não instala um agente ou skill que não esteja na lista de `install.mjs`.

## Fail-closed e invariantes transversais

1. **Entrada e fonte:** chaves/enums desconhecidos, union contaminada, fonte vazia,
   URI/SHA divergente, reviewer ausente/não nomeado ou erro de envelope retornam
   bloqueio com diagnóstico. Não há fallback anônimo, fallback de patch local para PR
   ou aprovação inferida.
2. **Efeitos:** Ship valida antes de issue/PR/commit/push/stop/pull/build/start;
   deploy faz rollback quando cruza a fronteira de serviço; installer planeja todo o
   inventário antes de qualquer escrita; HITL faz redact → sanitize → scan antes de
   imprimir/persistir.
3. **Estado:** a ponte 2.1→2.2 aplica apenas aliases documentados, não aceita
   colisão/chave extra e retorna os diagnósticos preservados. `attempt` é inteiro
   `0..3`; atingir `3` deixa a tarefa/onda bloqueada até decisão explícita. A prova
   PENDING é vazia e exata; uma aprovação exige agente, revisão, evidência e
   `independent: true`.
4. **Review:** o agregador exige `expectedReviewers` não vazio e compara conjuntos
   exatamente; cada reviewer aparece uma vez e usa `deep-reviewer/DEEP_REVIEW` ou
   `peer-reviewer/DEEP_REVIEW_FALLBACK`. P0/P1 bloqueiam; P2/P3 são retidos para
   correção e re-review.
5. **Promoção:** `DONE` não autoriza commit; somente onda `integrating` com
   integração PASS, review pós-integração independente, validator PASS e dez gates
   resolvidos pode ser promovida. `build: NA` precisa de `buildCommand=null` em
   comando, saída e razão.
6. **Usuário e distribuição:** symlink/junction/hardlink/especial, ancestral
   inseguro, hook conflitante, extra/stale ou NOTICE conflitante é preservado e
   reportado. O projeto (`./.omp/agents`) precede o perfil. Nenhum token aparece em
   logs; licença e NOTICE são mantidos como arquivos independentes.

## Sequência Red → Green → Refactor → Review → Validate

A sequência abaixo descreve a ordem que produziu o contrato final e deve ser usada
para qualquer nova correção nesta feature.

1. **Preflight/baseline:** descobrir branch/HEAD/árvore, runtime Node, fontes,
   ferramentas e paths canônicos; registrar uma limitação como diagnóstico, nunca
   como aprovação implícita.
2. **RED por slice:** o `test-author` adiciona ou ajusta costuras comportamentais
   para o AC, confirma falha por asserção (ou registra `existing-code`/NA normativo
   conforme o contrato) e produz a matriz AC→`arquivo::teste`.
3. **GREEN:** o owner do slice corrige a causa no arquivo de produção dentro do
   `allowed_write_globs`; migração/CLI/installer preservam contratos existentes e
   efeitos só ocorrem depois dos guards.
4. **REFACTOR:** o `refactorer` remove duplicação, normaliza helpers e conserva as
   mesmas unions, erros, fontes e transições; não reduz a força dos testes.
5. **REVIEW:** `peer-reviewer` independente (não implementador nem integrator)
   confere diff, findings P0–P3, pairing, segurança e coerência documental. Finding
   ou mudança comportamental retorna ao RED/RED_REVISION, não é silenciado.
6. **VALIDATE:** `validator` reexecuta testes reais, suite de integração e os dez
   gates, registra comando/saída/origem por gate e exige `PASS` ou `NA` justificado.
   Após cada integração há nova review independente e nova validação antes da
   promoção.
7. **DOC final:** T-008 atualiza somente os quatro caminhos canônicos quando a
   implementação está integrada; qualquer mudança de schema/payload reabre o
   contrato e exige nova passagem RED→VALIDATE.

## Ondas, dependências e paralelismo

- **Onda 1:** T-001–T-006 podem ser desenvolvidas em paralelo porque seus globs de
  produção e testes são disjuntos. T-004 é dono de conflito/alignment/HITL; T-005 é
  dono de hooks/installer; T-006 é dono de release/CI/governança.
- **Onda 2:** T-007 inicia somente depois que T-001–T-006 alcançam DONE
  pré-integração. O integrator resolve apenas conflito mecânico em seu lock, não
  altera comportamento, não remove teste e não escreve Spec Kit/progress.
- **Onda 3:** T-008 é serial e escreve somente `spec.md`, `plan.md`, `tasks.md` e
  `contracts/interface-contract.md`; paths e links são verificados por leitura local.

```text
T-001 ─┐
T-002 ─┤
T-003 ─┤
T-004 ─┤──> T-007 ──> T-008
T-005 ─┤
T-006 ─┘
```

## Stack e Dependências

| Componente | Tecnologia/arquivo | Justificativa |
|---|---|---|
| Runtime | Node.js ESM `>=20` | É o runtime declarado por package, installer, skills e workflows. |
| Deep-review | `deep-review/lib/protocol.mjs`, agentes nomeados, Vitest | Mantém união de modos, envelopes e protocolo executáveis já exportados. |
| Estado | JSON schema 2.2 em `.omp/state/tdd/` | Fonte persistida para resume, AC, fases, gates e integração. |
| Ship | `ship/bin/ship.mjs`, `ship/bin/lib.mjs`, `git`, `gh`, `ship.config.json` | Preserva o CLI atual e suas fontes de versão/rollback. |
| Hooks/installer | Node `fs`, `child_process` com argv, `scripts/hooks/**`, `install.mjs` | Permite lstat, preflight e portabilidade Windows/POSIX sem tocar destino inseguro. |
| HITL | Bash + AWK em `bug-diagnosis/scripts/hitl-loop.template.sh` | A implementação atual usa essas ferramentas; ausência é explicitamente gated. |
| CI/release | GitHub Actions, `gh api`, release-please v4 | Verifica default branch, ruleset, quality, PAT e SemVer por unidade. |
| Licenciamento | `LICENSE` e `NOTICE` | Mantém notices MIT upstream independentes e distribuíveis pelo installer. |
| Validação | Vitest e fixtures CLI reais em `ship/bin/*.test.mjs` e `scripts/*.test.mjs` | Defende erros, fronteiras, invariantes, migração e efeitos observáveis. |

## Tarefas Derivadas

| ID | Onda | Ownership | Descrição | AC | Dependências | Evidência |
|---|---:|---|---|---|---|---|
| T-001 [P] | 1 | Ship owner | Preflight, snapshot/rollback, build NA, PR body/markers e fontes SemVer | AC-001–AC-003, AC-018 | — | `ship/bin/ship.test.mjs`, `ship/bin/lib.test.mjs`, `scripts/ship-protocol.test.mjs` |
| T-002 [P] | 1 | Deep-review owner | Cinco modos, fontes/SHA, reviewer/finding schema, pairing, envelopes e agregação exata | AC-004–AC-007 | — | `scripts/deep-review.test.mjs` |
| T-003 [P] | 1 | TDD state owner | Migração/validação 2.2, RED/NA, DONE pré-integração, gates e promoção | AC-008–AC-010 | — | `scripts/tdd-state.test.mjs` |
| T-004 [P] | 1 | Conflict/alignment/HITL owner | Continuação Git, checkpoint, redact/sanitize/scan e gate Bash/AWK | AC-011–AC-012, AC-015 | — | `scripts/conflict-resolution.test.mjs`, `scripts/alignment.test.mjs`, `scripts/hitl-loop.test.mjs` |
| T-005 [P] | 1 | Hooks/installer owner | Wrappers, argv/stdin/refspec, core.hooksPath, inventário, tipos, precedência e NOTICE distribuído | AC-013–AC-014, AC-021 | — | `scripts/install-hooks.test.mjs`, `scripts/install.test.mjs` |
| T-006 [P] | 1 | Release/bootstrap owner | Branch/ruleset/CI, permissões, Node, docs, licença, SemVer e upstream governance | AC-003, AC-016–AC-018, AC-021 | — | `scripts/bootstrap-config.test.mjs`, `.github/workflows/*.yml`, `NOTICE` |
| T-007 | 2 | Integrator + validator | Integrar T-001–T-006, repetir suite/gates/re-review e consolidar evidência | AC-006, AC-009, AC-019–AC-020 | T-001–T-006 | `scripts/integration-validation.test.mjs` + relatório por gate |
| T-008 | 3 | spec-kit-author | Atualizar os quatro artefatos canônicos in-place, matriz, DAG, contrato e links | AC-001–AC-021 | T-007 | leitura local dos quatro paths; AC-019 NA exato |

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Patch/SHA/contexto muda entre preflight e review | Código diferente é liberado | URI, SHA e contexto consumidor devem coincidir; divergência bloqueia. |
| P2/P3 é descartado por ser não bloqueante | Finding válido permanece após release | Agregador retém objetos/contagens; processo exige correção e re-review até zero. |
| `DONE` antigo é tratado como promoção | Commit sem integração ou review independente | `canPromoteWave` exige `integrating`, integration PASS, review pós-onda e validator. |
| Migração aceita alias/chave extra | Resume fabrica estado válido | Allowlist 2.1→2.2, validação 2.2 e diagnóstico preservado; qualquer resto bloqueia. |
| Tentativa capada reinicia loop | Diagnóstico/evidência são perdidos | `attempt` 0..3, histórico preservado e bloqueio em 3 até decisão explícita. |
| Hook/installer destrói conteúdo | Perda de dados ou bypass em Windows/POSIX | argv, lstat/ancestrais, transação/rollback, `--check` read-only e conflito reportável. |
| Trace contém segredo/probe | Vazamento no estado/PR | Redact-before-write, sanitize, scan final, `<REDACTED>` e publicação atômica. |
| Branch/ruleset/PAT/fontes divergem | Push bypass ou release incorreto | Default branch dinâmica, refs de branch, PAT único, permissões mínimas e SemVer por unidade. |
| NOTICE é perdido na instalação | Violação de atribuição upstream | NOTICE independente de LICENSE, inventariado e copiado com o mesmo preflight não destrutivo. |

## Referências

- [Spec](./spec.md)
- [Tasks](./tasks.md)
- [Interface contract](./contracts/interface-contract.md)
- [Issue #36](https://github.com/rronqui/UsefulSkills/issues/36)
