# Tasks: specs002-integracao-robusta-skills

> Deriva de [`plan.md`](./plan.md). Convenções: `[P]` = paralelizável dentro da onda.
> **Feature:** `specs002-integracao-robusta-skills` · **Issue:** #30
> **Status documental:** plano aprovado; execução pendente (`PENDING`).
> **Regra de escopo:** cada agente só escreve nos `allowed_write_globs` da sua tarefa;
> nenhum agente desta lista escreve `.omp/state/tdd/progress.json`,
> `.omp/state/tdd/progress.md` ou artefato `specs001-*`.

## Tarefas

| ID | Onda | Descrição | AC | Dependências | `allowed_write_globs` | Teste/evidência de conclusão | Status |
|---|---:|---|---|---|---|---|---|
| T-001 [P] | 1 | Corrigir o motor e a documentação normativa de `ship`: rejeitar default suja e pré-requisitos ausentes antes de efeitos, exigir snapshot consistente/quiescido, preservar `Closes #N`/breaking markers, e executar deep-review da revisão final após conflito. | AC-001, AC-002, AC-003, AC-004, AC-005, AC-029 | — | `ship/**`; `scripts/ship-protocol.test.mjs` | `ship/bin/ship.test.mjs` e `ship/bin/lib.test.mjs` cobrem guards, corpo/retry, snapshot; fixture de protocolo comprova re-review final e nenhum efeito parcial. | PENDING |
| T-002 [P] | 1 | Corrigir o agregador e o protocolo `deep-review`: somente P0/P1 bloqueiam, P2/P3 são retidos, resultados ausentes/inválidos bloqueiam, PR usa patch remoto e SHA fixado, e fallback é `peer-reviewer` nomeado com schema/protocolo idênticos. | AC-006, AC-007, AC-008, AC-009, AC-010 | — | `deep-review/**`; `scripts/deep-review.test.mjs` | Fixtures de finding por prioridade, reviewer ausente/malformado, patch PR local divergente, SHA divergente e resolução projeto/usuário/fallback; nenhum caso libera silenciosamente. | PENDING |
| T-003 [P] | 1 | Atualizar `tdd-orchestrator` para validar/migrar schema 2.2, bloquear `DONE` incompleto, preservar evidências em resume, exigir matriz AC→teste/NA e aplicar precedência projeto > perfil na descoberta de agentes. | AC-011, AC-012, AC-013, AC-014, AC-015, AC-016, AC-023 | — | `tdd-orchestrator/SKILL.md`; `scripts/tdd-state.test.mjs` | Fixtures de estado válido/legado/inválido, gates e blockers, resume, matriz completa/incompleta e agentes homônimos; evidência mostra que nenhuma entrada inválida vira `DONE`. | PENDING |
| T-004 [P] | 1 | Fortalecer diagnóstico de falhas intermitentes com taxa/amostra/limiar, redigir traces antes da persistência, remover `[DEBUG-*]` e tornar o harness HITL portátil ou explicitamente gated. | AC-017, AC-018, AC-025 | — | `bug-diagnosis/**`; `scripts/bug-diagnosis.test.mjs`; `scripts/hitl-loop.test.mjs` | Harness de taxa registra `attempts/successes/rate`; captura não contém segredos nem probes; Bash ausente produz skip explícito e Bash presente executa o cenário. | PENDING |
| T-005 [P] | 1 | Atualizar `conflict-resolution` e `alignment`: distinguir merge/rebase e usar a continuação Git correta, persistir bloqueio/retomada com evidência redigida e exigir fechamento explícito do checkpoint de alinhamento. | AC-019, AC-020, AC-021 | — | `conflict-resolution/**`; `alignment/**`; `scripts/conflict-resolution.test.mjs`; `scripts/alignment.test.mjs` | Fixtures de status de merge/rebase, comando `rebase --continue`, estado BLOCKED retomável e pedido totalmente especificado com fechamento de alignment. | PENDING |
| T-006 [P] | 1 | Fortalecer `install.mjs`: validar origem/destino/ancestrais e arquivos especiais, detectar stale/extras e conflitos sem destruir conteúdo, isolar HOME/USERPROFILE e exigir Node >=20; atualizar os testes do instalador e seu gate de Bash. | AC-022, AC-023, AC-024, AC-025 | — | `install.mjs`; `scripts/install.test.mjs` | CLI real em HOME temporário cobre raiz arquivo, diretório/arquivo trocado, symlink/junction, especial, extra, stale, `--check` não destrutivo e preflight Node; plataforma sem Bash é explicitamente gated. | PENDING |
| T-007 [P] | 1 | Corrigir a documentação de `release-bootstrap`, README, CI, hooks e manifestos para escopo de ruleset, permissões mínimas, tokens modernos, Node >=20 e fontes de versão/monorepo coerentes com `ship`; adicionar validator estático sem credenciais. | AC-003, AC-024, AC-026, AC-027, AC-028, AC-029 | — | `release-bootstrap/**`; `.github/**`; `package.json`; `README.md`; `release-please-config.json`; `.release-please-manifest.json`; `scripts/bootstrap-config.test.mjs` | Validator lê YAML/config/manifesto e verifica refspec/contexto `quality`, `permissions`, prefixes `github_pat_`/legados, `initial-version`/manifesto e compatibilidade de unidades de versão. | PENDING |
| T-008 | 2 | Integrar todas as tarefas da Onda 1, rodar a validação consolidada, persistir evidência por gate e executar re-review independente do diff integrado; encaminhar mudanças comportamentais de volta ao ciclo TDD. | AC-015, AC-016, AC-030 | T-001, T-002, T-003, T-004, T-005, T-006, T-007 | `scripts/integration-validation.test.mjs` | `npm test` e comandos reais de CI/build quando existentes; `build: NA` somente com motivo de `ship.config.json`; relatório de peer-review final e validator sem blocker. | PENDING |
| T-009 | 3 | Atualizar in-place `spec.md`, `plan.md`, `tasks.md` e `contracts/interface-contract.md` para refletir o comportamento entregue, preencher matriz AC→teste/NA e conferir contrato, DAG, globs e evidência antes da entrega. | AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024, AC-025, AC-026, AC-027, AC-028, AC-029, AC-030 | T-008 | `specs/specs002-integracao-robusta-skills/spec.md`; `specs/specs002-integracao-robusta-skills/plan.md`; `specs/specs002-integracao-robusta-skills/tasks.md`; `specs/specs002-integracao-robusta-skills/contracts/interface-contract.md` | Validator confirma que os quatro arquivos existem, usam o mesmo feature, cada AC aparece na spec, toda tarefa tem AC/dependências válidas e o contrato descreve os invariantes efetivamente implementados. | PENDING |

## Ondas e dependências

- **Onda 1:** T-001 a T-007 são independentes e podem ser delegadas em paralelo. Cada
  tarefa tem globs disjuntos; arquivos compartilhados de configuração só pertencem a
  T-007 e os testes de integração não são tocados até T-008.
- **Onda 2:** T-008 é a barreira de integração. Só começa quando todas as tarefas da
  Onda 1 estiverem `DONE`; o `integrator` pode resolver apenas conflitos mecânicos e
  nunca reduzir testes ou esconder uma divergência. Falha de comportamento volta à
  tarefa/origem correta, e a onda permanece aberta.
- **Onda 3:** T-009 é a fase documental serializada. Só começa após a integração verde,
  re-review independente e validação consolidada; qualquer mudança de schema/payload
  deve atualizar o contrato e reabrir a decisão de versão antes de prosseguir.

Grafo acíclico:

```text
T-001 ─┐
T-002 ─┤
T-003 ─┤
T-004 ─┤──> T-008 ──> T-009
T-005 ─┤
T-006 ─┤
T-007 ─┘
```

## Critério de conclusão por tarefa

- **T-001:** guards de deploy/release e snapshot passam nos testes direcionados; issue,
  PR e breaking markers permanecem íntegros; conflito resolvido é revisado na revisão
  final.
- **T-002:** fixtures P0–P3, resultados inválidos, patch/SHA e fallback nomeado passam;
  nenhum resultado incompleto vira `correct`.
- **T-003:** schema/status/gates e transições de resume são validados; `DONE` exige
  evidência; AC→teste é objeto completo ou `NA` documental rastreável.
- **T-004:** taxa de reprodução é mensurável; traces persistidos não têm segredos nem
  instrumentação; o teste Bash executa ou é skip condicionado com motivo.
- **T-005:** merge e rebase usam continuação correta; bloqueio/retomada conserva prova;
  alignment registra fechamento explícito.
- **T-006:** inventário e especiais causam drift seguro; `--check` não altera nada;
  instalação é não destrutiva; Node e HOME/USERPROFILE são coerentes.
- **T-007:** ruleset/CI/permissões/tokens/versionamento são coerentes e verificáveis sem
  segredo; configuração monorepo incompatível falha cedo.
- **T-008:** suíte e gates consolidados têm evidência; build só fica `NA` com razão;
  re-review de integração é independente e aprovado.
- **T-009:** os quatro artefatos finais estão em seus caminhos canônicos, sem AC órfão,
  tarefa sem AC, ciclo de dependência ou contrato divergente.

## Gates e evidência obrigatória

Nenhuma tarefa é `DONE` com output vazio, status inválido ou gate sem evidência. O
validator deve persistir, por tarefa e para a integração:

1. `traceability`: todos os AC têm teste `arquivo::teste` ou razão `NA` aceita;
2. `tests`: suíte/roteiros relevantes passam, com comando completo e trecho de saída;
3. `spec_kit`: quatro caminhos existem e refletem comportamento/contrato;
4. `coverage`, `lint`, `type_check`, `security`, `contract` e `git_sanity`: PASS ou NA
   individualmente justificado;
5. `build`: PASS se houver comando configurado; caso contrário, `NA` com evidência
   textual de `buildCommand: null`;
6. integração: `wave.integration = PASS` com suíte consolidada e re-review registrados.

A entrega final exige os gates de todas as ondas, `progress.md` regenerado pelo
orquestrador e a decisão de entrega registrada. Esta lista não autoriza executar testes
ou escrever estado durante a presente entrega documental.

## Referências

- [Spec](./spec.md)
- [Plano](./plan.md)
- [Contrato](./contracts/interface-contract.md)
- [Regras do TDD orchestrator](../../tdd-orchestrator/SKILL.md)
