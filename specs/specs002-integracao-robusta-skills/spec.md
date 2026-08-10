# Spec: specs002-integracao-robusta-skills

> **Feature:** `specs002-integracao-robusta-skills`
> **Status:** Approved (plano de implementação aprovado; execução pendente)
> **Autor:** spec-kit-author
> **Data:** 2026-08-10
> **Issue:** #30
> **Branch:** `feat/30-corrigir-integracao-robusta-das-skills-e`

## Contexto

A análise integrada das skills encontrou falhas que aparecem somente quando os fluxos
são combinados: deploy/release depois de uma árvore suja ou de um conflito, revisão
multiagente com patch ou resultado incompleto, retomada de TDD com estado parcialmente
persistido, diagnóstico intermitente e instalação em ambientes Windows/POSIX. Também
há divergências entre os contratos documentados e os manifestos de CI, release-please,
Node e descoberta de agentes.

Esta feature consolida os guardrails necessários para que os fluxos `ship`,
`deep-review`, `tdd-orchestrator`, `bug-diagnosis`, `conflict-resolution`, `alignment`,
o instalador e `release-bootstrap` falhem fechados quando uma pré-condição, evidência
ou origem de dados não puder ser comprovada. A mudança é de infraestrutura de entrega e
de documentação normativa das skills; não adiciona funcionalidade de produto.

O baseline informado para o repositório é `npm test` com 5 arquivos e 117 testes
passando. `ship.config.json` não define `buildCommand`; portanto, a validação futura
pode registrar o gate de build como `NA` somente com justificativa explícita. Esta
entrega escreve apenas os quatro artefatos Spec Kit e não executa a suíte.

## Requisitos Funcionais

- **RF-001 — Deploy e release seguros:** o fluxo deve verificar árvore/branch default,
  remotos, labels, corpo do PR, marcadores de breaking change, conflitos e snapshots de
  banco antes de produzir efeitos irreversíveis.
- **RF-002 — Deep-review confiável:** o agregador deve distinguir blockers P0/P1 de
  achados P2/P3, rejeitar resultados ausentes ou inválidos, conservar uma fonte de patch
  utilizável no modo PR e revisar o contexto exatamente na revisão avaliada.
- **RF-003 — TDD e estado persistente:** `progress.json`/`progress.md` devem ser
  validados como uma máquina de estados versionada, com evidência suficiente para
  retomar e sem permitir `DONE` prematuro.
- **RF-004 — Diagnóstico, conflitos e alinhamento:** diagnósticos intermitentes devem
  usar taxa observada; traces persistidos devem ser redigidos e limpos; conflitos devem
  seguir a operação Git correta; bloqueios devem ser retomáveis; o checkpoint de
  alinhamento não pode ser pulado em silêncio.
- **RF-005 — Instalação portátil:** inventários de origem e destino, arquivos especiais,
  drift, agentes obsoletos e precedência projeto/usuário devem ser tratados de forma não
  destrutiva e determinística, com Node suportado a partir da versão 20.
- **RF-006 — Bootstrap, CI e segurança:** rulesets, permissões de Actions, varredura de
  tokens, fontes de versão e configuração release-please devem estar coerentes com a
  verificação realizada por `ship`.
- **RF-007 — Rastreabilidade verificável:** cada critério deve ter uma costura de teste
  executável ou uma declaração `NA` documental objetiva aceita pelo validator; a
  validação consolidada e a re-review da integração precedem qualquer entrega.

## Critérios de Aceite

### Deploy, release e dados

- **AC-001:** `ship deploy` e qualquer operação que atualize/consulte a branch default
  rejeitam uma árvore default suja antes de backup, pull, commit, push, criação de issue
  ou restart; a mensagem identifica a branch e a ação corretiva, e o processo retorna
  código não zero.
- **AC-002:** depois de resolver um conflito de merge ou rebase, o fluxo registra a
  continuação concluída, executa os checks aplicáveis e roda o deep-review sobre o
  intervalo final de commits; sem um veredito válido da revisão final, PR/release não é
  publicado.
- **AC-003:** a montagem e o retry do corpo do PR preservam exatamente um marcador
  `Closes #N`, o texto já publicado e os marcadores de Conventional Commits
  `!`/`BREAKING CHANGE:`; anexar uma evidência novamente não remove nem duplica esses
  marcadores e não altera o bump major esperado.
- **AC-004:** quando `dbPath` representa um banco em uso, o deploy só cria/publica um
  snapshot depois de provar uma estratégia de snapshot consistente (quiescência por
  `stopCommand` ou mecanismo equivalente); se não puder provar a consistência, falha
  antes de pull/build/restart. Snapshots publicados são atômicos, imutáveis e não
  sobrescrevem outro snapshot no mesmo instante.
- **AC-005:** `ship new`/`ship` verificam, antes de efeitos remotos, autenticação `gh`,
  remote de push e existência das labels exigidas (`bug` ou `enhancement`); qualquer
  pré-requisito ausente ou remoto indisponível produz erro explícito e não cria issue,
  branch ou PR parcialmente.

### Deep-review

- **AC-006:** a consolidação classifica como blocker somente achados válidos P0 ou P1;
  achados P2 e P3 permanecem no relatório/evidência final com localização e contagem,
  mas não bloqueiam sozinhos a liberação.
- **AC-007:** um revisor esperado ausente, sem veredito, com schema inválido ou com
  finding incompleto torna a rodada `BLOCKED` (fail closed), preservando o diagnóstico;
  o agregador não infere `correct` nem libera a mudança por falta de dados.
- **AC-008:** no modo PR, o assignment usa o patch remoto da revisão (`gh pr diff` ou
  `pr://.../diff/...`); o workspace local é somente contexto de consumidor. Se as fontes
  remotas falharem ou vierem vazias, a rodada bloqueia em vez de usar silenciosamente um
  patch local diferente.
- **AC-009:** o agregador obtém e registra o SHA/revisão avaliada e fixa nele todo
  contexto do consumidor necessário à checagem cross-boundary; SHA ausente, divergente
  ou impossível de resolver invalida a rodada e bloqueia a publicação.
- **AC-010:** a resolução de agente é determinística: tenta `deep-reviewer` no escopo
  de projeto, depois no escopo de usuário, e usa `peer-reviewer` apenas como fallback
  nomeado quando recebe o protocolo completo e produz o mesmo schema de resultado;
  se nenhum dos dois nomes estiver disponível, bloqueia. Nunca há fallback anônimo ou
  que altere o limiar P0/P1.

### TDD, estado e integração

- **AC-011:** antes de retomar, o orquestrador valida `schema_version: "2.2"`, campos
  obrigatórios e todos os enums de fase, status, gate, origem e contrato; entrada
  desconhecida/inválida não é tratada como progresso válido e é migrada/reaberta com
  diagnóstico preservado ou escalada conforme o contador de tentativas.
- **AC-012:** nenhuma tarefa ou onda pode chegar a `DONE`/commit se houver bloqueio,
  AC sem status final, gate diferente de `PASS`/`NA`, evidência de gate vazia ou
  integração pendente; cada `NA` exige justificativa específica e não substitui um
  `PASS` ausente.
- **AC-013:** retomadas preservam `gate_evidence`, `gate_origins` de falhas,
  `baseline.tests_evidence`, `baseline.build_evidence`, blockers, decisões pendentes,
  veredito de review e evidência de integração válidos; só campos explicitamente
  invalidados pela transição são limpos, e `progress.md` é regenerado do JSON sem
  descartar a prova.
- **AC-014:** a matriz AC→teste é um objeto com exatamente todos os AC da tarefa e, para
  cada AC executável, ao menos uma referência não vazia no formato
  `arquivo::teste`; um AC exclusivamente normativo só pode usar `NA` com razão,
  validator/evidência documental e referência ao contrato/spec. Matriz texto, incompleta
  ou com AC extra é rejeitada.
- **AC-015:** antes da entrega da branch, o validator executa uma validação consolidada
  sobre o conjunto integrado (suíte, lint/type-check quando existentes, build quando
  configurado e os demais gates), persiste o comando e trecho de saída de cada gate, e
  registra explicitamente `build: NA`/motivo quando `buildCommand` for `null`; sem esse
  relatório completo a entrega fica bloqueada.
- **AC-016:** após cada integração de onda, um peer-reviewer independente revisa o diff
  combinado e o validator repete a suíte/gates; uma correção de integração que altera
  comportamento retorna ao ciclo TDD apropriado, nunca salta diretamente para `DONE`.

### Diagnóstico, conflitos e alinhamento

- **AC-017:** para um bug não determinístico, o diagnóstico registra tentativas,
  sucessos/falhas, taxa observada, tamanho mínimo da amostra e limiar acordado; só
  avança quando a taxa é suficiente para distinguir o sintoma, e bloqueia com evidência
  se não houver taxa ou ambiente capaz de reproduzir.
- **AC-018:** qualquer trace, log ou captura persistida é redigido antes de ser salvo,
  substitui segredos por `<REDACTED>` e passa por limpeza final que remove protótipos e
  logs `[DEBUG-*]`; o validator falha se encontrar token/credencial bruta ou artefato de
  instrumentação após a conclusão.
- **AC-019:** uma operação iniciada como rebase é finalizada com `git rebase --continue`
  até esgotar commits (ou é reportada como bloqueada), enquanto o caminho de PR que a
  política define como merge usa `git merge`; o fluxo não usa `git merge --continue`,
  `git rebase --abort` ou `git merge --abort` para ocultar o estado.
- **AC-020:** conflito, dependência ausente ou decisão não resolvida persiste fase,
  operação, arquivos/hunks, tentativa, comandos executados, evidência redigida e
  decisão pendente; uma retomada lê essa prova e continua do estado real, sem zerar o
  diagnóstico ou declarar sucesso.
- **AC-021:** todo pedido comportamental ou de correção passa pelo checkpoint de
  `alignment`; mesmo quando a solicitação já está totalmente especificada, o fluxo
  registra explicitamente o fechamento da entrevista. Nenhuma rota pode pular o
  alinhamento silenciosamente.

### Instalação e portabilidade

- **AC-022:** o instalador valida inventário de origem e destino antes de escrever e
  detecta ausência, symlink/junction, arquivo onde deveria haver diretório, diretório
  onde deveria haver arquivo, ancestrais inválidos, entradas extras e arquivos especiais;
  `--check` é não destrutivo, retorna drift não zero e o modo normal nunca destrói o
  conteúdo conflitante do usuário.
- **AC-023:** arquivos gerenciados obsoletos, extras de usuário e conflitos de tipo são
  reportados com categorias distintas; a resolução de agentes aplica precedência
  projeto (`./.omp/agents`) sobre perfil de usuário (`~/.omp/agent/agents`), reporta
  duplicatas/stale sem escolher silenciosamente uma cópia divergente e não sobrescreve
  escopo de projeto com a instalação do perfil.
- **AC-024:** `package.json`, instalador, README, skills e CI concordam que o runtime
  suportado é Node `>=20`; o instalador falha cedo, com mensagem acionável, em Node
  incompatível, e nenhum documento ou teste continua declarando `>=18` como requisito.
- **AC-025:** testes que dependem de Bash usam uma invocação portátil/detectável ou uma
  condição de plataforma explícita; em ambiente sem Bash o teste é marcado como gated,
  informa o motivo e não falha por `ENOENT`, enquanto em CI com Bash o mesmo cenário é
  exercitado.

### Bootstrap, CI e segurança

- **AC-026:** o ruleset é criado e verificado com escopo explícito para a branch default
  (ou para o conjunto de refs declarado), inclui `deletion`, `non_fast_forward`,
  `pull_request` e o contexto de status real do CI, mantém
  `strict_required_status_checks_policy` booleano e registra a limitação de repos
  privados/plano sem enforcement server-side; não há regra acidental em tags/branches
  fora do escopo.
- **AC-027:** workflows de Actions declaram permissões mínimas por workflow/job:
  CI somente leitura para conteúdo e release-please apenas as permissões necessárias
  para conteúdo/PR; nenhum job recebe `write-all` ou permissão de Actions não usada.
- **AC-028:** a auditoria de segredos varre histórico e arquivos rastreados por JWT,
  PEM, `ghp_`, `gho_`, `ghs_`, `ghr_`, `github_pat_` e os demais padrões definidos,
  sem expor o valor no log; token encontrado bloqueia publicação e a instalação do
  secret usa stdin redigido/limpo.
- **AC-029:** a fonte de versão usada por release-please e por `ship` é verificável e
  consistente: o manifesto/configuração declara cada unidade em `packages`, não usa
  `release-as` persistente, mantém `initial-version`/manifest compatíveis e não habilita
  `versionCheckUrl` para uma unidade que `ship` não consegue resolver (em monorepo,
  configuração incompatível falha explicitamente em vez de comparar apenas a raiz).
- **AC-030:** a entrega só é considerada completa quando a matriz deste Spec Kit cobre
  todos os AC, cada tarefa referencia pelo menos um AC, dependências formam um DAG,
  `allowed_write_globs` das tarefas paralelas são disjuntos e o relatório final contém
  evidência ou justificativa `NA` para cada gate; a ausência de qualquer item mantém o
  pipeline bloqueado.

## Matriz resumida AC → tarefa

| AC | Tarefa(s) | Costura de teste/evidência |
|---|---|---|
| AC-001 | T-001 | `ship/bin/ship.test.mjs` — default suja não produz efeitos |
| AC-002 | T-001 | `scripts/ship-protocol.test.mjs` — re-review final após conflito |
| AC-003 | T-001, T-007 | `ship/bin/ship.test.mjs` + validator de commits/config |
| AC-004 | T-001 | `ship/bin/ship.test.mjs`, `ship/bin/lib.test.mjs` — snapshot consistente/falha fechada |
| AC-005 | T-001 | `ship/bin/ship.test.mjs` — remote, auth e labels fail-fast |
| AC-006 | T-002 | `scripts/deep-review.test.mjs` — P0/P1 bloqueiam, P2/P3 retidos |
| AC-007 | T-002 | `scripts/deep-review.test.mjs` — resultado ausente/inválido bloqueia |
| AC-008 | T-002 | `scripts/deep-review.test.mjs` — patch remoto PR não cai no workspace |
| AC-009 | T-002 | `scripts/deep-review.test.mjs` — SHA fixa consumidor |
| AC-010 | T-002 | validator de resolução named-agent + fixture de schema |
| AC-011 | T-003 | `scripts/tdd-state.test.mjs` — schema/enums/migração |
| AC-012 | T-003 | `scripts/tdd-state.test.mjs` — guard de DONE/gates |
| AC-013 | T-003 | `scripts/tdd-state.test.mjs` — resume preserva evidência |
| AC-014 | T-003 | `scripts/tdd-state.test.mjs` — objeto AC→teste/NA |
| AC-015 | T-003, T-008 | `scripts/integration-validation.test.mjs` + evidência do validator |
| AC-016 | T-003, T-008 | `scripts/integration-validation.test.mjs` — re-review após integração |
| AC-017 | T-004 | `scripts/bug-diagnosis.test.mjs` — taxa/amostra/limiar |
| AC-018 | T-004 | `scripts/hitl-loop.test.mjs` + scan de traces redigidos |
| AC-019 | T-005 | `scripts/conflict-resolution.test.mjs` — continue correto por operação |
| AC-020 | T-005 | `scripts/conflict-resolution.test.mjs` — estado bloqueado/retomável |
| AC-021 | T-005 | `scripts/alignment.test.mjs` — fechamento explícito |
| AC-022 | T-006 | `scripts/install.test.mjs` — inventário, tipos e especiais |
| AC-023 | T-003, T-006 | `scripts/tdd-state.test.mjs` + `scripts/install.test.mjs` — precedência/stale |
| AC-024 | T-006, T-007 | `scripts/install.test.mjs` + validator de engines/CI/docs |
| AC-025 | T-004, T-006 | testes HITL/installer gated ou portáveis por plataforma |
| AC-026 | T-007 | `scripts/bootstrap-config.test.mjs` — payload/escopo do ruleset |
| AC-027 | T-007 | `scripts/bootstrap-config.test.mjs` — permissões mínimas |
| AC-028 | T-007 | `scripts/bootstrap-config.test.mjs` — prefixes modernos/redaction |
| AC-029 | T-001, T-007 | `ship/bin/ship.test.mjs` + `scripts/bootstrap-config.test.mjs` |
| AC-030 | T-008, T-009 | validator do Spec Kit + relatório consolidado do orquestrador |

## Fora de Escopo

- Funcionalidades de produto, endpoints públicos, UI, banco remoto ou migração de
  dados de aplicações consumidoras.
- Troca por outro provedor de Git, CI, release ou revisão; as chamadas existentes de
  `git`, `gh`, GitHub Actions e release-please permanecem as dependências de ambiente.
- Inventar uma API externa para snapshot de banco, revisão ou instalação; quando o
  ambiente não oferece a prova necessária, o comportamento esperado é bloquear e
  registrar a causa.
- Remover automaticamente arquivos extras/stale do perfil ou do projeto; o instalador
  continua não destrutivo.
- Fazer push, merge, release, deploy, formatter, linter, build ou suíte nesta entrega
  documental.
- Alterar `progress.json`, `progress.md`, testes existentes ou qualquer artefato
  `specs001-*` durante a escrita deste Spec Kit.

## Referências

- [Plano de implementação](./plan.md)
- [Tarefas e ondas](./tasks.md)
- [Contrato de interfaces e estado](./contracts/interface-contract.md)
- [Ship](../../ship/SKILL.md) e [motor Ship](../../ship/bin/ship.mjs)
- [Deep-review](../../deep-review/SKILL.md)
- [TDD orchestrator](../../tdd-orchestrator/SKILL.md)
- [Bug diagnosis](../../bug-diagnosis/SKILL.md)
- [Conflict resolution](../../conflict-resolution/SKILL.md)
- [Alignment](../../alignment/SKILL.md)
- [Release bootstrap](../../release-bootstrap/SKILL.md)
- [Instalador](../../install.mjs)
- [Feedback persistente de review](../../docs/review-feedback.md)
