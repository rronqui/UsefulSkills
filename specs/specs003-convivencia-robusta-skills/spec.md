# Spec: specs003-convivencia-robusta-skills

> **Feature:** `specs003-convivencia-robusta-skills`
> **Status:** Approved
> **Autor:** spec-kit-author
> **Data:** 2026-08-10
> **Issue:** #36
> **Branch:** `fix/36-corrigir-integracao-robusta-das-skills`
> **Contrato canônico:** [contracts/interface-contract.md](./contracts/interface-contract.md) v0.1.0

## Contexto e porquê

A convivência entre Ship, deep-review, TDD, conflito/alignment, hooks/installer,
HITL e release/CI falhava nas costuras, e não apenas dentro de uma skill isolada.
Os findings corrigidos nesta implementação eram observáveis: preflight permitia
chegar a efeitos remotos com pré-condição ausente; uma revisão podia perder a fonte,
a revisão exata, a identidade ou o diagnóstico do envelope; `DONE` podia ser
confundido com promoção; migração de estado podia aceitar dados legados sem uma
ponte explícita; o instalador podia tocar conteúdo do usuário; traces podiam receber
segredos antes da redação; branch/release/documentação podiam congelar `main` ou
divergir da fonte SemVer; e a distribuição não carregava todos os notices upstream.

A implementação GREEN, o refactor e a integração foram concluídos. As directed
suites informadas pelo orquestrador passam. Esta especificação é o contrato funcional
final: ela descreve comportamento observável, diagnósticos e caminhos de falha, e não
introduz endpoint, CLI, agente ou provedor que não exista no runtime.

### Findings corrigidos

| Finding corrigido | Fronteira endurecida | Evidência principal |
|---|---|---|
| Reviewer sem protocolo, pairing ou revisão fixada; fallback textual/anônimo | `validateReviewerResult`, `resolveReviewer` e agregação exata | `scripts/deep-review.test.mjs` |
| `aggregateReview` podia inferir o conjunto esperado ou descartar `errors` | terceiro argumento obrigatório e envelopes fail-closed | `scripts/deep-review.test.mjs` |
| PR URI/SHA e contexto consumidor podiam divergir | request PR vinculado a repository, PR e SHA/head | `scripts/deep-review.test.mjs` |
| Estado 2.1 podia virar 2.2 com alias desconhecido, prova stale ou tentativa sem cap | migração allowlist, schema 2.2 e diagnóstico preservado | `scripts/tdd-state.test.mjs` |
| Prontidão de tarefa podia parecer promoção da onda | `DONE` pré-integração, review independente e `canPromoteWave` | `scripts/tdd-state.test.mjs`, `scripts/integration-validation.test.mjs` |
| Branch, release, installer, hooks e HITL podiam falhar aberto | branch default dinâmica, pré-flight atômico, instalação não destrutiva e redact-before-write | `ship/bin/ship.test.mjs`, `scripts/install.test.mjs`, `scripts/install-hooks.test.mjs`, `scripts/hitl-loop.test.mjs` |
| Runtime/licença/documentação/distribuição divergentes | Node 20+, fontes SemVer, permissões mínimas e NOTICE upstream | `scripts/bootstrap-config.test.mjs`, `scripts/install.test.mjs` |

## Requisitos Funcionais

- **RF-001 — Ship/deploy seguro:** validar configuração, fontes SemVer, branch
  default descoberta, árvore, Git/GitHub, remote, labels e quiescência antes do
  efeito correspondente; uma falha encerra com diagnóstico e sem efeito parcial.
- **RF-002 — Deep-review determinístico:** aceitar somente `PR`, `BRANCH_BASE`,
  `COMMIT`, `CUSTOM` e `UNCOMMITTED`, cada um com sua fonte de revisão e revisão
  local/remota fixada.
- **RF-003 — Findings completos:** validar reviewer e finding como objetos
  localizados; P0/P1 são blockers, P2/P3 ficam retidos e nunca são descartados pela
  consolidação ou por uma nova rodada.
- **RF-004 — TDD integrado:** validar/migrar `progress.json` em schema 2.2, separar
  `DONE` pré-integração da promoção, limitar tentativas, preservar evidência, exigir
  review independente e validar todos os gates antes do commit da onda.
- **RF-005 — Conflito e alignment retomáveis:** usar a continuação Git correspondente,
  persistir bloqueio/decisão e fechar o checkpoint `alignment`, inclusive no
  fast-close fully-specified.
- **RF-006 — Hooks e instalação não destrutivos:** preservar argv, stdin, refspecs e
  caminhos com espaços; respeitar `core.hooksPath`; tratar raízes, ancestrais,
  symlink/junction, hardlink, especiais, extras, stale e precedência projeto > perfil.
- **RF-007 — HITL seguro:** redigir antes de imprimir ou persistir, remover probes,
  fazer scan final e gatear Bash/AWK sem transformar ausência de ferramenta em PASS.
- **RF-008 — Governança verificável:** branch/ruleset/CI/release-please, permissões,
  Node, licença, README, skills, fontes SemVer e NOTICE devem concordar com o
  runtime e com a distribuição.
- **RF-009 — Evidência e regressão:** cada AC possui uma costura executável
  `arquivo::teste` ou a exceção normativa exata; integração repete suíte, gates e
  review independente, sem encerrar com finding válido ou evidência ausente.

## Critérios de Aceite

- **AC-001:** Nos comandos existentes `new`, `ship` e `deploy`, uma branch default
  não resolvível, árvore suja quando o comando exige limpeza, `gh` não autenticado,
  remote/label ausente, configuração inválida ou PR/issue sem URL válida encerra com
  código não zero antes do efeito correspondente. A mensagem informa causa, escopo e
  ação sem imprimir segredo. `deploy` exige a branch default descoberta, não uma
  literal `main`.
- **AC-002:** Quando `dbPath` existe, `deploy` só cria o snapshot depois de
  `stopCommand` bem-sucedido e de `startCommand` previamente validado; usa temporário
  e publicação sem sobrescrever destino. Falha de stop, backup, pull, build ou leitura
  do diff não executa a etapa seguinte e tenta rollback quando o serviço já foi
  parado. Arquivo inexistente é avisado sem snapshot. `buildCommand: null` produz
  `build: NA` com comando, razão e evidência `buildCommand=null`, nunca PASS implícito.
- **AC-003:** Retry de PR preserva o corpo publicado, mantém exatamente um `Closes #N`
  da issue correta e preserva `!`/`BREAKING CHANGE:` sem duplicar marcador ou
  separadores. Commit release-bearing usa Conventional Commits; `release-as`
  persistente é rejeitado e a fonte SemVer não fica congelada.
- **AC-004:** `validateRequest` aceita exatamente os cinco modos de revisão. `PR`
  exige patch remoto não vazio; `BRANCH_BASE`/`COMMIT`/`UNCOMMITTED` exigem seu
  `local_revision_context`; `CUSTOM` aceita diff vazio somente com inventário não
  vazio de arquivos revisáveis. Fonte ausente, diff vazio quando obrigatório,
  contexto contaminado por outro modo ou inventário vazio retorna bloqueio.
- **AC-005:** Em `PR`, `patch_source.uri` (quando presente) casa com
  `repository/pull_request`, `sha`/`head_sha`/`head-sha` são uma revisão não vazia e
  consistente, e `consumer_context.revision` é exatamente o SHA consumido. Os quatro
  modos locais não aceitam `patch_source`, `consumer_context`, SHA remoto ou PR
  inventado; divergência/ausência bloqueia.
- **AC-006:** Cada reviewer resulta em findings objeto com título/corpo não vazios,
  prioridade inteira `0..3`, confiança `0..1`, caminho e intervalo 1-indexado de no
  máximo dez linhas. Findings P0/P1 entram em `blockers`; P2/P3 permanecem em
  `findings` e contagens. Resultado malformado bloqueia. Um reviewer válido que só
  tenha P2/P3 pode ser aprovado pelo protocolo, mas os findings continuam retidos e
  devem ser corrigidos e re-revisados antes da liberação final.
- **AC-007:** `validateReviewerResult` exige `agent`, `protocol_mode`, status `VALID`,
  revisão esperada e pairing exato: `deep-reviewer/DEEP_REVIEW` ou
  `peer-reviewer/DEEP_REVIEW_FALLBACK`. `aggregateReview(results, expectedRevision,
  expectedReviewers)` exige o terceiro argumento como array explícito, não vazio, sem
  duplicatas e com o conjunto exatamente igual aos reviewers presentes, cada um uma
  única vez. Reviewer ausente, inesperado, timeout, schema/status/revisão inválidos,
  agente anônimo ou envelope com `errors` retorna `ok:false`, `status:BLOCKED` e
  preserva todos os erros; nenhuma aprovação é inferida.
- **AC-008:** Migração aceita somente `schema_version: "2.1"` pela allowlist
  `repo.branch → repo.branch_work`, `task.reviewer → task.reviewed_by` e
  `gates.rastreabilidade → gates.traceability`, ou valida diretamente `2.2`.
  Colisão, alias desconhecido, chave/enumeration inválido, tentativa negativa/não
  inteira ou entrada malformada falha fechada sem descartar `blockers`/`evidence`.
  A ponte inicializa `integration.attempt` ausente em `0`, prova `review` ausente/stale
  em PENDING e os campos de compatibilidade documentados; tentativa `3` preserva o
  histórico e bloqueia nova delegação.
- **AC-009:** `DONE` significa somente prontidão pré-integração: ACs finais, blockers
  vazios, review da tarefa aprovado e independente, e gates `PASS`/`NA` justificados.
  Não há promoção/commit com integração `pending`. `canPromoteWave` só aprova onda
  `integrating` com `integration.status: PASS`, tentativa válida, review pós-integração
  independente (não implementador/integrator), validator PASS, suíte e relatório de
  todos os gates. Integração FAIL, mudança comportamental ou evidência ausente mantém
  a onda fora da promoção e retorna ao ciclo TDD.
- **AC-010:** RED avança somente por falha de asserção esperada e matriz completa
  AC→`arquivo::teste`. Se o comportamento já existir, registra `implemented_by:
  existing-code`, RED PASS sem teste falhando e GREEN/REFACTOR SKIPPED com motivos.
  `NA` só vale para AC exclusivamente normativo e usa exatamente o objeto com
  `status`, `reason`, `validator: "spec-kit-validator"`, `evidence` e `reference`
  ao próprio AC; não substitui comportamento executável.
- **AC-011:** Conflito de rebase continua com `git rebase --continue` e conflito de
  merge continua pela operação correta; hunk/commit/check pendente fica BLOCKED com
  operação, tentativa, prova redigida e decisão retomável, sem `--abort` para ocultar
  estado.
- **AC-012:** Todo pedido comportamental/correção registra checkpoint `alignment`.
  Um pedido fully-specified-fast-close fecha explicitamente com fronteira vazia e
  respostas persistidas; pergunta sem resposta permanece BLOCKED e não existe rota
  silenciosa.
- **AC-013:** Wrappers de hook preservam `"$@"`; `pre-push` lê cada refspec completo
  da stdin e bloqueia tanto local quanto remoto em `refs/heads/<default>`, inclusive
  caminhos com espaços. O instalador de hooks usa argv para processos Node quando
  disponível e não interpola caminhos em shell inseguro.
- **AC-014:** `node install.mjs --check` é somente leitura. Instalação normal é
  idempotente, faz preflight de toda a árvore e não remove extras/stale, nem substitui
  symlink/junction/hardlink/especial, nem sobrescreve conflito, cria `.git` falso ou
  atravessa ancestral inseguro. Inventário distingue `extras`, `stale`, duplicatas,
  conflitos de tipo e origem ausente; `.omp/agents` do projeto precede o perfil e
  duplicata é reportada/bloqueada sem escolha silenciosa.
- **AC-015:** HITL redige antes de imprimir/persistir chaves sensíveis, JWT, PEM e
  tokens `glpat_`/`glpat-`, `sk_live_`/`sk_test_`, `npm_`, `github_pat_`, `ghp_`,
  `gho_`, `ghs_`, `ghr_`, `AKIA`, `AIza`, `xox[bp]-` e `sk-` como `<REDACTED>`;
  continuações YAML, mappings explícitos, flow/quoted/here/backtick e bloco PEM são
  cobertos. Remove `[DEBUG-*]`, escaneia antes do rename atômico e não publica trace
  se o scan falhar ou se o destino já for arquivo, hardlink, diretório ou symlink.
  Bash ou AWK ausente é `SKIPPED`/`BLOCKED` com motivo; CI com Bash executa o cenário.
- **AC-016:** CI e release-please aceitam push/execução somente quando
  `github.ref_type == "branch"` e `github.ref_name == github.event.repository.default_branch`;
  tags com o mesmo nome não passam. Ruleset ativo é limitado a
  `refs/heads/<default>` descoberta, bloqueia deletion/non-fast-forward, exige o
  contexto real `quality` e registra limitação de enforcement quando aplicável.
  Workflows usam permissões mínimas e o release usa somente
  `secrets.RELEASE_PLEASE_TOKEN`.
- **AC-017:** `package.json`, installer, Ship, skills, README e workflows declararam
  Node.js `>=20`; LICENSE existente permanece; documentação usa a mesma semântica de
  hooks, `versionCheckUrl`, release e gates que o runtime e não imprime tokens.
  Divergência documental ou runtime legado falha o gate correspondente.
- **AC-018:** Ship e release-please resolvem a mesma fonte SemVer por unidade. Cada
  entrada de `packages` é Node, tem `initial-version` SemVer, package.json e manifesto
  compatíveis, e não usa `release-as`. Unidade ausente, não Node, versão inválida,
  manifesto divergente ou `versionCheckUnit` desconhecida falha cedo com
  `E_VERSION_SOURCE`; uma configuração multi-package não é mascarada pela raiz.
- **AC-019:** O gate Spec Kit confirma que exatamente os quatro caminhos canônicos
  existem, que `spec.md`, `plan.md`, `tasks.md` e `interface-contract.md` concordam
  com o comportamento entregue, que cada AC e tarefa está rastreado, e que os globs
  paralelos são disjuntos. Este AC é exclusivamente normativo e sua costura é o
  objeto `NA` exato definido em [interface-contract.md#invariantes](./contracts/interface-contract.md#invariantes).
- **AC-020:** A validação final executa testes existentes e regressões para cada
  finding corrigido, registra comando/saída por cada um dos dez gates, repete
  review independente após cada integração e só encerra com blockers vazios, zero
  finding válido P0/P1/P2/P3 e evidência não vazia. `build: NA` só é aceito pela
  prova específica de `buildCommand=null`; esta escrita documental não reexecuta
  suíte completa, lint, formatter ou build.
- **AC-021:** `NOTICE` contém, por si só, os notices MIT upstream de
  `https://github.com/can1357/oh-my-pi` e `https://github.com/mattpocock/skills`, com
  copyrights e texto de licença completos, e o installer o distribui em
  `~/.omp/agent/NOTICE`. Destino NOTICE ausente pode ser criado; conflito de tipo,
  symlink ou conteúdo de usuário é preservado e reportado, sem sobrescrita destrutiva.

## Matriz de rastreabilidade AC → tarefa → costura

Cada AC executável aponta para pelo menos uma costura real no formato
`arquivo::teste`. Apenas AC-019 é estrutural/normativo e usa a exceção `NA` exata do
contrato; nenhum outro AC pode ser satisfeito por texto ou por `NA` genérico.

| AC | Tarefa(s) | `arquivo::teste` ou NA |
|---|---|---|
| AC-001 | T-001 | `ship/bin/ship.test.mjs::AC-001 deploy aborta árvore default suja antes de qualquer efeito`; `ship/bin/ship.test.mjs::AC-005 preflight auth remote label` |
| AC-002 | T-001 | `ship/bin/ship.test.mjs::AC-002 buildCommand=null produz evidência explícita`; `ship/bin/ship.test.mjs::AC-004 dbPath sem quiescência falha antes do snapshot` |
| AC-003 | T-001, T-006 | `ship/bin/ship.test.mjs::AC-003 retry preserva corpo breaking markers e Closes`; `scripts/bootstrap-config.test.mjs::AC-003 retry idempotente do corpo do PR` |
| AC-004 | T-002 | `scripts/deep-review.test.mjs::AC-004 cinco modos e fontes exclusivas` |
| AC-005 | T-002 | `scripts/deep-review.test.mjs::AC-005 URI vincula repository/pull_request`; `scripts/deep-review.test.mjs::AC-005 aliases SHA conflitantes bloqueiam` |
| AC-006 | T-002 | `scripts/deep-review.test.mjs::AC-006 findings estruturados P0/P1 e retenção P2/P3` |
| AC-007 | T-002 | `scripts/deep-review.test.mjs::AC-007 protocol_mode pairing e expectedReviewers exatos`; `scripts/deep-review.test.mjs::AC-007 envelope preserva errors` |
| AC-008 | T-003 | `scripts/tdd-state.test.mjs::AC-008 migração 2.1→2.2 e aliases`; `scripts/tdd-state.test.mjs::AC-008 unknown keys attempt cap e diagnóstico` |
| AC-009 | T-003, T-007 | `scripts/tdd-state.test.mjs::AC-009 DONE pré-integração`; `scripts/integration-validation.test.mjs::AC-009 promoção após integração review e validator` |
| AC-010 | T-003 | `scripts/tdd-state.test.mjs::AC-010 matriz RED existing-code e NA exato`; `scripts/tdd-state.test.mjs::AC-010 spec-kit-validator canônico` |
| AC-011 | T-004 | `scripts/conflict-resolution.test.mjs::AC-011 continue correto e bloqueio retomável` |
| AC-012 | T-004 | `scripts/alignment.test.mjs::AC-012 fast-close e pergunta sem resposta` |
| AC-013 | T-005 | `scripts/install-hooks.test.mjs::AC-013 argv stdin refspec e paths com espaços` |
| AC-014 | T-005 | `scripts/install.test.mjs::AC-014 check read-only tipos extras stale e precedência` |
| AC-015 | T-004 | `scripts/hitl-loop.test.mjs::AC-015 redact-before-write probes Bash e tokens` |
| AC-016 | T-006 | `scripts/bootstrap-config.test.mjs::AC-016 branch default dinâmica ruleset CI e PAT`; `scripts/pre-push-default.test.mjs::default branch fora de main` |
| AC-017 | T-006 | `scripts/bootstrap-config.test.mjs::AC-017 Node licença documentação e NOTICE` |
| AC-018 | T-001, T-006 | `ship/bin/ship.test.mjs::AC-018 fontes SemVer por unidade`; `scripts/bootstrap-config.test.mjs::AC-029 release-please e ship` |
| AC-019 | T-008 | `NA — spec-kit-validator; razão, validator, evidência e referência ao AC-019 no contrato` |
| AC-020 | T-007 | `scripts/integration-validation.test.mjs::AC-020 relatório por gate e promoção`; directed suites PASS informado pelo orquestrador |
| AC-021 | T-005, T-006 | `scripts/install.test.mjs::NOTICE upstream distribuído`; `scripts/bootstrap-config.test.mjs::NOTICE independente de LICENSE` |

## Fora de Escopo

- Novo produto, endpoint, UI, migração de banco consumidor ou provedor alternativo de
  Git/CI/release/review.
- Um comando `ship.mjs release` novo: release é o workflow release-please existente.
- Fallback anônimo, aprovação inferida, apagar arquivos do usuário, substituir
  symlink/junction/especial, ou introduzir um mecanismo novo de publicar/push/merge
  automático; o comportamento já existente só é descrito e não é ampliado nesta
  entrega.
- Alterar `progress.json`, `progress.md`, código, testes, README ou qualquer artefato
  `specs001-*` durante esta entrega documental; somente os quatro caminhos canônicos
  desta feature são escritos.

## Referências

- [Plano](./plan.md) · [Tarefas](./tasks.md) · [Contrato](./contracts/interface-contract.md)
- [Issue #36](https://github.com/rronqui/UsefulSkills/issues/36)
- `deep-review/lib/protocol.mjs` e `scripts/deep-review.test.mjs`
- `tdd-orchestrator/lib/state.mjs`, `scripts/tdd-state.test.mjs` e `scripts/integration-validation.test.mjs`
- `ship/bin/ship.mjs`, `ship/bin/lib.mjs` e `ship/bin/ship.test.mjs`
- `install.mjs`, `scripts/install-hooks.mjs`, `scripts/install.test.mjs` e `scripts/install-hooks.test.mjs`
- `bug-diagnosis/scripts/hitl-loop.template.sh` e `scripts/hitl-loop.test.mjs`
- `release-bootstrap/SKILL.md`, `.github/workflows/ci.yml`, `.github/workflows/release-please.yml`, `NOTICE` e `scripts/bootstrap-config.test.mjs`
