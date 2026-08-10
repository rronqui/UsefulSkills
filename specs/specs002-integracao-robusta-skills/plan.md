# Plan: specs002-integracao-robusta-skills

> **Feature:** `specs002-integracao-robusta-skills`
> **Spec:** [spec.md](./spec.md)
> **Contrato:** [contracts/interface-contract.md](./contracts/interface-contract.md) v0.1.0 (DRAFT)
> **Issue:** #30
> **Status:** Aprovado para implementação; nenhum código é alterado por esta entrega documental.
> **Baseline informado:** `npm test` — 5 arquivos/117 testes PASS; `ship.config.json.buildCommand = null` (build NA condicionado a justificativa).

## Arquitetura

A mudança será implementada em camadas independentes, com os arquivos transversais
serializados na integração. Cada camada deve corrigir a causa na origem, manter as
interfaces existentes e falhar fechada quando não puder provar uma pré-condição.
Nenhum pacote externo novo é necessário.

1. **Ship/deploy e release.** Centralizar guards de árvore/branch default, autenticação,
   remote e labels antes de qualquer efeito remoto. Separar a captura de snapshot da
   sequência pull/build/restart: com `dbPath`, exigir quiescência ou outra prova de
   snapshot consistente; publicar o arquivo temporário de maneira atômica e abortar se
   a prova falhar. A montagem do corpo do PR deve preservar `Closes #N`, texto já
   publicado e marcadores de breaking change. Depois de conflito, o gate deve revisar o
   intervalo final, não o patch que existia antes da resolução.
2. **Deep-review.** Normalizar cada resultado recebido para o schema do contrato,
   rejeitando ausência, finding incompleto ou veredito inválido. O agregador separa
   `blockers` P0/P1 de `findings` P2/P3. No modo PR, um resolver escolhe somente o
   patch remoto e associa o SHA da revisão a todos os assignments; contexto local serve
   apenas à checagem do consumidor. A resolução de agentes usa projeto > usuário para
   `deep-reviewer` e um fallback explícito `peer-reviewer` com o mesmo protocolo; sem
   agente nomeado compatível, bloqueia.
3. **Estado TDD.** Tratar `progress.json` como fonte única, com migração/validação de
   schema 2.2 e guardas de transição. Evidências só são apagadas quando o campo foi
   invalidado pela transição; retomadas regeneram `progress.md`. `DONE` exige AC,
   review, integração e todos os gates com evidência (`PASS` ou `NA` justificado).
   Após a integração de uma onda, executar re-review independente e validação
   consolidada antes da rota de entrega.
4. **Diagnóstico, conflito e alinhamento.** Registrar métricas `attempts/successes/rate`
   e limiar de bugs intermitentes; persistir apenas traces redigidos e remover probes
   marcados na limpeza. Manter a diferença entre merge e rebase: uma operação de rebase
   continua com `git rebase --continue`, enquanto a política de PR usa merge quando
   especificado. Bloqueios carregam operação, hunks, tentativa e decisão pendente.
   Toda rota comportamental passa pelo fechamento explícito de `alignment`.
5. **Instalador e descoberta de agentes.** Fazer uma varredura de tipos e inventário
   antes de copiar, incluindo raízes/ancestrais, symlinks/junctions, especiais e extras.
   `--check` nunca escreve; o modo de instalação não remove drift. Diagnósticos
   distinguem stale gerenciado de extra do usuário e a descoberta respeita projeto
   (`./.omp/agents`) antes do perfil (`~/.omp/agent/agents`). A preflight de Node
   compartilha o requisito `>=20` do pacote.
6. **Bootstrap/CI/segurança.** Validar ruleset com refspec e contexto de status
   explícitos, conferir o payload por GET, manter permissões Actions mínimas, ampliar a
   auditoria de tokens para `github_pat_`, e validar que release-please, manifestos e
   `ship` têm a mesma fonte de versão. Em monorepo, a configuração incompatível com a
   verificação suportada deve falhar explicitamente, nunca comparar silenciosamente só
   a raiz.

### Sequência de operação

- **Antes de efeitos:** preflight Node/gh/git/remote/labels, branch e árvore; ler e
  validar config/estado.
- **Antes de snapshot:** garantir quiescência ou mecanismo de snapshot consistente;
  erro interrompe o deploy sem pull/build/restart.
- **Depois de conflito:** finalizar a operação Git correta, rodar checks, revisar a
  revisão final e somente então continuar para PR/release.
- **Antes de entrega:** integrar a onda, re-revisar o diff integrado, rodar validação
  consolidada e persistir evidência; sem build configurado, `NA` com motivo explícito.

## Stack e Dependências

| Componente | Tecnologia/arquivo | Justificativa e dependência |
|---|---|---|
| Motor Ship | Node.js ESM `>=20`, `ship/bin/ship.mjs`, `ship/bin/lib.mjs`, `git`, `gh` | Reutiliza subprocessos existentes; não cria API remota nova. |
| Testes de Ship | Vitest, `ship/bin/*.test.mjs` | Costura real para CLI, corpo de PR, guards e backup atômico. |
| Deep-review | Markdown normativo + agente nomeado em `deep-review/` | O contrato é o assignment/resultado; fonte do patch PR continua remota. |
| Estado TDD | JSON schema 2.2, Markdown derivado em `.omp/state/tdd/` | Retomada determinística; estado local não é commitado. |
| Diagnóstico | POSIX shell/AWK existente, Node/Vitest para fixtures | Preserva o template; Bash só é exigido onde explicitamente disponível. |
| Conflito/alinhamento | Git e Markdown normativo | Diferencia merge/rebase e mantém entrevista obrigatória. |
| Instalador | Node.js `fs` (`lstat`, `readdir`, `cp`) + Vitest CLI | Permite guards de tipo/special files sem dependência de shell. |
| CI/bootstrap | YAML GitHub Actions, `gh api`, release-please v4 | Ruleset e permissões são verificáveis sem credenciais em testes. |
| Release/versionamento | `package.json`, `release-please-config.json`, `.release-please-manifest.json`, `ship.config.json` | Fonte de versão declarada e comparável; monorepo incompatível falha cedo. |
| Evidência | `docs/review-feedback.md`, relatório do validator | Retém P2/P3 e achados de diagnóstico sem segredos. |

## Tarefas Derivadas, Dependências e Ondas

Os globs abaixo são locks de escrita para a implementação futura. Tarefas da mesma
onda têm globs disjuntos; a atualização final dos quatro artefatos Spec Kit é
serializada em T-009. Nenhuma tarefa escreve `progress.json` ou `progress.md`.

| ID | Onda | Descrição | AC | Dependências | `allowed_write_globs` | Costura/evidência |
|---|---:|---|---|---|---|---|
| T-001 [P] | 1 | Corrigir guards de deploy/release, snapshot consistente, pré-requisitos de `gh`/remote/labels, preservação de corpo/markers e re-review final no fluxo Ship. | AC-001–AC-005, AC-029 | — | `ship/**`; `scripts/ship-protocol.test.mjs` | `ship/bin/ship.test.mjs`, `ship/bin/lib.test.mjs`, fixture de protocolo pós-conflito. |
| T-002 [P] | 1 | Tornar o agregador deep-review fail-closed, separar blockers P0/P1 de P2/P3, manter patch remoto PR/SHA de consumidor e formalizar fallback nomeado. | AC-006–AC-010 | — | `deep-review/**`; `scripts/deep-review.test.mjs` | Fixtures de resultados válidos, ausentes, inválidos, PR patch e SHA divergente. |
| T-003 [P] | 1 | Validar/migrar estado TDD 2.2, guardas de `DONE`, preservação de evidência, matriz AC→teste/NA e precedência de agentes na retomada. | AC-011–AC-016, AC-023 | — | `tdd-orchestrator/SKILL.md`; `scripts/tdd-state.test.mjs` | Fixtures de progress válidos/legados, gates incompletos, resume e matriz inválida. |
| T-004 [P] | 1 | Ajustar diagnóstico intermitente e higiene de traces, incluindo redaction/limpeza e execução do teste HITL de forma portable/gated. | AC-017–AC-018, AC-025 | — | `bug-diagnosis/**`; `scripts/bug-diagnosis.test.mjs`; `scripts/hitl-loop.test.mjs` | Harness de taxa/amostra; captura sem segredo; Bash detectado ou skip explícito. |
| T-005 [P] | 1 | Documentar e validar continuação correta de merge/rebase, persistência de bloqueios/retomadas e checkpoint obrigatório de alignment. | AC-019–AC-021 | — | `conflict-resolution/**`; `alignment/**`; `scripts/conflict-resolution.test.mjs`; `scripts/alignment.test.mjs` | Fixture de estado Git e validator de fechamento explícito. |
| T-006 [P] | 1 | Fortalecer inventário/tipos/especiais do instalador, drift não destrutivo, stale/extras e teste isolado de HOME/USERPROFILE; alinhar preflight Node `>=20`. | AC-022–AC-025 | — | `install.mjs`; `scripts/install.test.mjs` | CLI real com HOME/USERPROFILE temporários, raiz/ancestral inválido, symlink, junction e extra; gate de plataforma. |
| T-007 [P] | 1 | Corrigir regras e evidências de bootstrap, permissões CI, scanner de tokens, fontes de versão/monorepo e referências Node/documentação/manifestos. | AC-003, AC-024, AC-026–AC-029 | — | `release-bootstrap/**`; `.github/**`; `package.json`; `README.md`; `release-please-config.json`; `.release-please-manifest.json`; `scripts/bootstrap-config.test.mjs` | Validator estático de YAML/config/manifesto; fixtures de ruleset e prefixes de token. |
| T-008 | 2 | Integrar a onda, executar a suíte/gates sobre o conjunto completo, registrar evidência e re-revisar independentemente o diff integrado; devolver qualquer mudança comportamental ao ciclo TDD. | AC-015–AC-016, AC-030 | T-001, T-002, T-003, T-004, T-005, T-006, T-007 | `scripts/integration-validation.test.mjs` | `npm test`; comandos CI reais; build `NA` somente com `ship.config.json` e razão; relatório peer-review + validator. |
| T-009 | 3 | Atualizar in-place os quatro artefatos Spec Kit com comportamento efetivamente entregue, matriz AC→teste/NA e evidências finais; validar DAG/globs/contrato antes de marcar conclusão. | AC-001–AC-030 | T-008 | `specs/specs002-integracao-robusta-skills/spec.md`; `specs/specs002-integracao-robusta-skills/plan.md`; `specs/specs002-integracao-robusta-skills/tasks.md`; `specs/specs002-integracao-robusta-skills/contracts/interface-contract.md` | Validator de Spec Kit: AC sem órfão, tarefa com AC, contrato coerente e relatório final consolidado. |

### Grafo e ondas

```text
Onda 1: T-001 ─┐
        T-002 ─┤
        T-003 ─┤
        T-004 ─┤──> T-008 (integração + validação + re-review)
        T-005 ─┤                 │
        T-006 ─┤                 v
        T-007 ─┘             T-009 (DOC/contrato final)
```

T-001–T-007 podem ser delegadas em paralelo porque não compartilham globs. T-008 é
serial e só pode começar quando todas as tarefas da Onda 1 estiverem `DONE`; se a
integração falhar, o integrator devolve a origem sem enfraquecer testes. T-009 é
serializada para não haver duas escritas nos caminhos canônicos.

## Matriz AC → teste/validador → gate

A matriz é normativa para o validator. Os nomes de teste são costuras planejadas; a
implementação deve manter o comportamento coberto e registrar o resultado real em
`progress.json`/relatório, sem transformar um teste de texto em substituto de um teste
comportamental.

| AC | Tarefa | Costura real | Gate/evidência aceita |
|---|---|---|---|
| AC-001 | T-001 | `ship/bin/ship.test.mjs` — default dirty aborta antes de efeito | `tests` PASS; saída e código não zero |
| AC-002 | T-001 | `scripts/ship-protocol.test.mjs` — conflito exige checks + review final | validator de protocolo + evidência da rodada final |
| AC-003 | T-001/T-007 | `ship/bin/ship.test.mjs` + config/commit fixture | `tests` PASS e validator de markers |
| AC-004 | T-001 | `ship/bin/lib.test.mjs`/`ship.test.mjs` — quiescência, atomicidade, falha fechada | `tests` PASS; snapshot verificável |
| AC-005 | T-001 | CLI fixture de `gh auth`, remote e labels ausentes | `tests` PASS; nenhum efeito remoto |
| AC-006 | T-002 | `scripts/deep-review.test.mjs` — agregação P0–P3 | `tests` PASS; relatório retém P2/P3 |
| AC-007 | T-002 | fixture sem revisor/schema inválido | `tests` PASS; status BLOCKED persistido |
| AC-008 | T-002 | fixture PR com patch remoto indisponível/local diferente | `tests` PASS; sem fallback local silencioso |
| AC-009 | T-002 | fixture SHA divergente no consumidor | `tests` PASS; bloqueio com SHA/evidência |
| AC-010 | T-002 | resolver de agentes project/user/fallback | validator + `tests` PASS; nome e schema registrados |
| AC-011 | T-003 | progress schema 2.2 e enums inválidos | `traceability`/`contract` + fixture PASS |
| AC-012 | T-003 | transições DONE com gates/blockers/evidência incompletos | validator de estado PASS |
| AC-013 | T-003 | resume preserva evidências e regenera `progress.md` | validator de estado PASS |
| AC-014 | T-003 | matriz objeto completa e NA documental | `traceability` PASS ou NA justificado por AC |
| AC-015 | T-003/T-008 | harness consolidado de gates | `tests` + `git-sanity`; build PASS ou NA justificado |
| AC-016 | T-003/T-008 | fixture de integração seguida de peer-review | evidência de review independente + validator |
| AC-017 | T-004 | harness de taxa com amostra/limiar | `tests` PASS; métrica persistida |
| AC-018 | T-004 | HITL/trace scan de segredo e `[DEBUG-*]` | `security` PASS e teste redaction |
| AC-019 | T-005 | fixture de rebase/merge com comando de continuação | validator de conflito + evidência Git |
| AC-020 | T-005 | fixture BLOCKED→resume sem limpar diagnóstico | validator de estado + evidência redigida |
| AC-021 | T-005 | fluxo comportamental totalmente especificado | validator documental + fechamento de alignment |
| AC-022 | T-006 | CLI com tipo/especial/extra/symlink | `tests` PASS; `--check` não destrutivo |
| AC-023 | T-003/T-006 | fixtures project/user/stale/extras | `tests`/validator de precedência PASS |
| AC-024 | T-006/T-007 | Node preflight + scan package/docs/CI | `tests` PASS e validator de configuração |
| AC-025 | T-004/T-006 | Bash disponível versus ausente | teste PASS ou skip condicionado documentado |
| AC-026 | T-007 | payload/GET de ruleset com refspec/status | `security`/validator PASS; limitação registrada |
| AC-027 | T-007 | parse de `permissions` por workflow/job | `security` PASS; nenhuma permissão supérflua |
| AC-028 | T-007 | scanner fixture `github_pat_` e prefixes antigos | `security` PASS sem eco do token |
| AC-029 | T-001/T-007 | ship version check + release config/manifest | `tests` + validator de versão/monorepo |
| AC-030 | T-008/T-009 | validator dos quatro artefatos e relatório final | `spec_kit`/`contract` PASS; DAG e globs comprovados |

AC-002, AC-010, AC-011, AC-013, AC-014, AC-016, AC-019–AC-021, AC-023, AC-026,
AC-027 e AC-030 incluem regras documentais ou de coordenação; seus validadores devem
registrar a seção/campo inspecionado e a evidência, em vez de inventar uma API. Um
`NA` de gate somente é aceito quando a razão e o artefato observado forem persistidos.

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Branch default muda entre preflight e pull. | Deploy publica estado diferente do que foi validado. | Revalidar HEAD/árvore e branch imediatamente antes do efeito; abortar em qualquer divergência. |
| Banco ativo é copiado durante escrita. | Backup ilegível ou restauração inconsistente. | Exigir quiescência/mecanismo de snapshot comprovado; temp + publicação atômica; falha fechada sem pull/restart. |
| Retry de PR duplica marker ou remove `Closes`. | Issue fica aberta ou release perde breaking change. | Testar corpo existente e retry; preservar markers como invariantes do payload. |
| Revisor retorna `incorrect` sem finding ou P2/P3 é confundido com blocker. | Liberação indevida ou bloqueio excessivo. | Schema obrigatório, agregação P0/P1 separada e retenção integral de P2/P3. |
| Patch PR local fica stale. | Review valida código diferente do PR. | Fonte remota obrigatória, SHA fixado e bloqueio quando resolver falhar. |
| Migração de progress descarta evidência válida. | Retomada repete trabalho ou marca DONE sem prova. | Migração idempotente, preservação de histórico e revalidação de cada gate antes de transição. |
| Tarefas paralelas alteram arquivo transversal. | Conflito ou documentação contraditória. | `allowed_write_globs` disjuntos por onda; T-008/T-009 serializados. |
| Bug raro não alcança taxa debugável. | Hipótese sem evidência e fix especulativo. | Exigir amostra/taxa/limiar; bloquear e pedir ambiente/trace redigido quando insuficiente. |
| Trace redigido deixa segredo em arquivo temporário. | Vazamento em estado ou artefato de PR. | Redact-before-write, scan final de padrões e remoção de temp/probes. |
| `rebase --continue` é trocado por comando de merge. | Operação Git fica presa ou altera histórico errado. | Teste de protocolo por operação, inspeção de status e continuação até concluir. |
| Projeto e perfil têm agentes homônimos/stale. | Runtime executa prompt incorreto. | Precedência explícita projeto > usuário, diagnóstico de duplicata e fallback nomeado com schema igual. |
| `--check` derruba ou apaga arquivo especial. | Perda de conteúdo do usuário ou crash ENOTDIR/EISDIR. | `lstat` em raiz/ancestral, classificação de tipo, modo check não destrutivo e testes de plataforma. |
| Windows não possui Bash. | Suíte falha por ambiente, não por comportamento. | Harness Node/descoberta de Bash ou skip explícito com motivo; CI POSIX executa o cenário. |
| Ruleset permissivo ou Actions com write amplo. | Push direto, CI bypass ou exfiltração. | Escopo/refspec verificado por GET, permissões mínimas e teste estático sem credenciais. |
| Release-please e `ship` usam fontes de versão diferentes. | Tag/versão servida incorreta, sobretudo em monorepo. | Validar config/manifesto contra unidades suportadas; incompatibilidade falha cedo; nenhuma suposição de API externa. |

## Definição de pronto

A implementação só pode ser entregue quando T-001–T-007 estiverem `DONE`, T-008 tiver
integração, suíte/gates consolidados e re-review independente sem blocker, e T-009
confirmar que os quatro artefatos em disco continuam refletindo o comportamento. O
validator deve registrar todos os gates; `build` pode ser `NA` somente porque o
manifesto observado tem `buildCommand: null`, com motivo e evidência persistidos. O
orquestrador mantém `progress.json`/`progress.md` fora do commit e não considera uma
saída vazia, um status inválido ou uma evidência ausente como sucesso.
