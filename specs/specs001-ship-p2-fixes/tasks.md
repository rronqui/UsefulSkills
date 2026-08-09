# Tasks: specs001-ship-p2-fixes

> Deriva de [`plan.md`](./plan.md). Convenções: `[P]` = paralelizável.
> **Status documental:** Implementado/concluído; peer review aprovado sem achados P0–P3

| ID | Descrição | AC | Dependências | Status |
|---|---|---|---|---|
| T-001 [P] | Corrigir o retry de `ship/bin/ship.mjs`: normalizar `--body-file` e ignorar conteúdo vazio/branco antes de editar um PR existente, preservando o corpo em chamadas repetidas. | AC-001 | — | DONE |
| T-002 [P] | Corrigir, somente na documentação normativa de `tdd-orchestrator/SKILL.md`, a migração e a retomada de `RED_REVISION`, limpando em conjunto `red.revision_delta`, `red.failing_tests` e `red.failure_reason_expected`; gate de teste: NA, justificado. | AC-002 | — | DONE |
| T-003 [P] | Corrigir o redactor AWK de `bug-diagnosis/scripts/hitl-loop.template.sh` para aceitar whitespace final no fechamento de backtick aninhado e não sobre-redigir linhas normais posteriores. | AC-003 | — | DONE |
| T-004 | Rodar os roteiros direcionados da matriz AC→teste, verificar os invariantes de cada correção e registrar evidência sem alterar testes, `progress.json` ou `progress.md`. | AC-001, AC-002, AC-003 | T-001, T-002, T-003 | DONE |

## Critério de conclusão

- T-001: GREEN confirmado em `ship/bin/ship.test.mjs` com 3 testes direcionados.
- T-002: inspeção normativa direcionada confirmada; não há runtime/test seam e o gate executável é NA, com justificativa documental.
- T-003: GREEN confirmado em `scripts/hitl-loop.test.mjs` direcionado.
- T-004: validação final concluída; `npm test` passou com 5 arquivos e 117 testes, os testes direcionados do Ship passaram 3/3, a suíte HITL passou 67/67 e os checks sintáticos, de audit e de diff-check passaram. Os gates de build, lint, type, coverage e contract são NA, com justificativa registrada; AC-002 permanece validado por inspeção normativa direcionada, sem teste inventado.

## Evidência objetiva da validação final

- **Suíte consolidada:** `npm test` — **5 arquivos / 117 testes PASS**.
- **Ship direcionado:** **3/3 PASS**.
- **HITL:** **67/67 PASS**.
- **Checks adicionais:** checks **sintáticos**, **audit** e **diff-check** — **PASS**.
- **Gates não aplicáveis:** **build**, **lint**, **type**, **coverage** e **contract** — **NA**, devidamente justificados; para **AC-002**, a validação permanece a inspeção normativa direcionada prevista na matriz, sem inventar teste executável.
