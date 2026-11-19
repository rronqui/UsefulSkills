# Compatibilidade com OMP

O desenho preserva sete skills/nove agentes originais e completa architecture,
retro e secure-linux-web-hosting, com requirements-reader, architect e
host-operator sob gatilhos próprios: dez entrypoints/doze perfis geridos, sem
chamada obrigatória de todos os papéis. Skills orientam o chamador e delegam
por `task`/`yield` nativos; bibliotecas não criam outra orquestração.
A compatibilidade deve ser validada contra o schema efetivamente exposto pela
instalação OMP; versões e configurações podem mudar capacidades. Leitura e
fixtures não comprovam piloto ou discovery instalado. A prova anterior de
sete skills/nove agentes não comprova a instalação ampliada.

**Autoridade de estado:** fase, autorização, revisão, gates, contagens e
promoção vêm exclusivamente de `.omp/state/tdd/progress.json` e do receipt
corrente. Este guia é durável e não copia budgets, tentativas, hashes de
candidato ou logs. Receipts `.omp/state/**` e URIs `local://` são proveniência
privada, não distribuição nem fixtures Native; mudança de fonte/contexto/
ambiente/independência reabre provas dependentes.
O aditamento aprovado `0.6.0` é uma correção aditiva de compatibilidade para
o terminal `wait` documentado pelo SDK. A aprovação está no receipt privado
`.omp/state/release-47/proofs/contract-0-6-native-wait-user-approval.json`,
com `contract_amendment: "Aprovo"` e `confirmation: "Aprovo"`; não é Native
PASS, waiver, alteração pública ou confirmação de release.

O aditamento 0.7.0 é privado, aditivo e não lançado: delimita somente a
evidência backend de NATIVE-09. Seu kind tipado é
`source_kind: "native09-backend-repair-write"`; não há alteração de SDK, wire,
API, settings, modelos, flags, CLI pública ou perfis. A autorização documental
não é aprovação semântica, Native PASS ou release.

| Superfície | Regra de suporte | Verificação necessária |
|---|---|---|
| Skills | Frontmatter e estrutura preservados; referências `skill://` | Descoberta e resolução reais na sessão |
| Agentes | Tipos nomeados; projeto e usuário conforme descoberta OMP | Disponibilidade, colisões, ferramentas e modelos resolvidos |
| `task` | Usar o schema dinâmico da sessão, incluindo `solutionSpace` | Batch/flat, slots e campos opcionais expostos |
| Resultado assíncrono | Spawn/job não significa conclusão | Recolher resultado terminal de cada instância |
| Isolamento | Só usar campo disponível e isolamento observado | Worktree/backend e integração resultante |
| Revisão estruturada | Preservar `yield` incremental e schema nativo | Campos completos e revisão correspondente |
| Gate de qualidade | Node ^20.19.0, ^22.12.0 ou >=24; API compartilhada TDD/ship | Testes e relatórios sobre conteúdo atual |

## Preflight de versões

As versões, fonte/tag, binário/instalação e runtime interno são identidades
distintas. O alvo contratual é OMP **18.18.6**; versões observadas em
preflight anterior são históricas e não comprovam discovery, modelo, inferência
ou NATIVE-01–10. Toda avaliação deve registrar configuração, revisão, saída
bruta e limites no receipt/ledger versionado, sem copiar hashes de candidato
para este guia.

## Contratos operacionais

No batch, `context` e `tasks` compõem a chamada; cada item tem `task` e
`solutionSpace`. Com batch desabilitado, despache itens individuais conforme o
schema flat; contexto compartilhado pode ser referenciado por arquivo local.
`agent` seleciona o tipo, enquanto `name` registra a instância no Root; não
substitui `session_id`, job ou ID terminal. Nomes fornecidos devem ser únicos
sem distinção de maiúsculas dentro do mesmo Root. Opcionalidade de `isolated`,
`effort`, ferramentas e schemas depende da configuração; não envie campos ausentes
do schema atual. Com execução assíncrona, mantenha IDs e recolha todas as saídas
terminais antes de agregar ou promover. Definições de agentes e opções de
configuração não provam o modelo realmente usado.

Revisões paralelas usam `aggregateReviewInstances`, com assignment por instância,
tipo nomeado e arquivos disjuntos; o `agent` retornado via `yield` continua sendo o
tipo nativo. A API legada `aggregateReview` permanece para consumidores antigos.

## Modelos do pacote

Use a [referência única dos perfis](../tdd-orchestrator/references/model-policy.md)
e o mapa canônico nela indicado. Somente `model`/`thinkingLevel` dos doze
perfis geridos configuram principal/fallback `openai-codex` por papel, exigindo autenticação válida nesse provedor, com
catálogo e precedência conferidos. Substituir `@slow` no perfil não muda o alias
global. Caller/sessão principal, títulos/rótulos, scout, advisor e outros
auxiliares/builtins permanecem sob OMP e configuração existente; não os copiar,
desligar ou reconfigurar. Não exigir `model` por task, launcher, extensão, SDK,
Bun ou guard global.

Requested, resolved e observed são distintos; metadado real ausente mantém
`actual:null`/`observation:unverified`. Falha de perfil, candidato ou saída
bloqueia somente a rota dependente e preserva o diagnóstico. Fallback nativo do
perfil não é retry técnico TDD; este preserva tarefa/run/histórico/cap3 e usa
nova instância/job após FAIL terminal elegível, sem escalada por infraestrutura.

Serving físico e fallback de provedor são **NÃO OBSERVADOS**, limite aceito
explicitamente para esta entrega. A decisão não é PASS observado, não altera os
doze perfis e não dispensa a prova independente de retry técnico real.

## Saída e revisão: contrato e alcance observado

`TDD_PEER_REVIEW` usa yield nativo estruturado APROVADO/BLOQUEADO. O consumer
`validateReviewerResult` exige identidade, modo e revisão independentes do
assignment; o veredito não é convertido em `VALID`. Texto legado foi substituído,
`VALID` incremental, que não é aprovação. Capturas de peer positivo/negativo
nativas são históricas e escopadas; uma saída malformed corrigida pelo próprio
agente não é prova de rejeição nativa. A rejeição desse formato deve ser
exercitada separadamente pelo consumer real, sem promover controle derivado.

Branch/base fornece `local_revision_context.revision === head_revision`, com
base/head separados. PR fornece patch e conteúdo integral pertinente na mesma
revisão remota, com path/SHA/hash; workspace não vinculado ou patch parcial não
substituem essa coleta. Preparação documental/análise da Fase 0 precedem o OK
aplicável à implementação; DONE exige AC IMPLEMENTED/VALIDATED, não COVERED
sozinho. Essas regras têm provas específicas abaixo, não aprovação global.
NATIVE-01–10 preservam resultados separados para descoberta, jobs, retorno
bruto e avaliação; cenário parcial não fecha um gate inteiro.

## Roteiro de avaliação do pacote instalado

Executar após a revisão final independente, na fase autorizada de instalação e
avaliação. Antes de qualquer efeito, confirmar destino, inventário e conflitos;
guardar hashes/origem e resultados brutos por instância. A CLI em HOME isolado
comprova cópia/check; não satisfaz os cenários OMP abaixo. O teste exato e seus
negativos têm fonte única no [contrato ativo Spec005](../specs/specs005-omp-compatible-release/contracts/interface-contract.md).

| ID | Responsável e prova a recolher | Estado/classificação |
|---|---|---|
| NATIVE-01 | Integrador/validator: instalar inventário final autorizado, hashes, versão OMP, discovery dos 10/12, precedência e colisões projeto/usuário | `PENDING_NATIVE`; capturas de cópia/check são históricas e não fecham discovery |
| NATIVE-02 | Validator: resolver cada perfil e principal/fallback openai-codex com thinkingLevel; origem/hash e metadados reais, sem overrides globais | `PENDING_NATIVE`; serving físico/fallback permanecem `NOT OBSERVED` |
| NATIVE-03 | Caller/validator: tarefa inócua nomeada, duas instâncias disjuntas em batch se habilitado ou flat equivalente, IDs e terminais exatos | `PENDING_NATIVE`; qualquer captura parcial é escopada |
| NATIVE-04 | Caller/validator: async custom, wait terminal, yield, nested, retomada e isolamento somente se expostos; conflito de escritores serializado e independentes paralelos | `PENDING_NATIVE`; yield/terminal isolado não fecha o pacote |
| NATIVE-05 | Peer-reviewer/validator: yield TDD estruturado APROVADO/BLOQUEADO, consumer real, sucesso/bloqueio/malformed e retorno original | `PENDING_NATIVE`; malformed corrigido pelo produtor não é negativo |
| NATIVE-06 | Deep-review/validator: yield incremental, fallback nomeado e agregação de duas instâncias; negativos de falta, duplicata, stale e modo errado | `PENDING_NATIVE`; fallback de capacidade, provider e retry são distintos |
| NATIVE-07 | Dispatcher/validator: branch/base com revisão igual ao head; PR com diff/conteúdo integral no mesmo SHA e hashes | `PENDING_NATIVE`; contexto/PR parcial permanece escopado |
| NATIVE-08 | Spec-kit-author/revisor independente: conferir correções de batch condicional, Fase 0/OK e DONE por IMPLEMENTED/VALIDATED contra consumidores reais | `PENDING_NATIVE`; revisão final e consumidores atuais são necessários |
| NATIVE-09 | Caller/validator: fallback nativo e recuperação técnica separados, novo job/instância e retry após FAIL elegível | `PENDING_NATIVE`; retry técnico genuíno permanece obrigatório |
| NATIVE-10 | Integrador/revisores finais: pacote short/full/local/external sem publicação; DOC/review/validate, retro/dono/opt-out, referências, falha/retomada e 42 CAP/18 fontes | `PENDING_NATIVE`; rota readonly não é pacote integrado |

### Exceção escopada do backend NATIVE-09 (aditamento 0.7.0)

A prova privada só admite completion de framework quando o job aprovado pelo
Root tem `status:"completed"`, a criança opaca está ligada por tuple Root
completo e único (`root_session_id`, `parent_tool_call_id`, `allocated_id`,
`index`, `root_task_end_is_error:false`, `agent`, `agentSource`, assignment, `job_id`,
`instance_id`) e existe
um único `write END` aprovado com `isError:false` explicitamente observado no
path exato aprovado. O `actual` precisa demonstrar mudança real do sujeito
por bytes/hash antes/depois; dependências protegidas permanecem byte/hash e
identidade inalteradas. Identidade, path e correlação seguem Root-bound.

A coleção pode reunir dispatch de peer independente e segundo validator, mas
isso não concede semantic repair approval nem Native PASS. `Task framework
completed` não equivale a `validator semantic PASS`: o primeiro `FALHOU`,
quando correlacionado a CLI real com código não zero, é resultado legítimo e
seu raw permanece preservado. Semantic repair approval e NATIVE-09 PASS exigem
peer independente e segundo validator com `PASSOU` real, correlação válida e
gates atuais.

Perfis existentes `structured:true` continuam exigindo schema válido. A única
exceção é esta prova do perfil `backend-developer` para NATIVE-09, sem aceitação
geral de perfil indisponível. As regras de `validator` e `spec-kit-author`
permanecem inalteradas; relatório negativo do validator, mesmo com task
`completed`, não passa testes. Flags child não expostas permanecem unknown/null;
não se infere `exitCode:0`, `isError:false`, `aborted:false` ou completion.

Essa regra não altera os contadores/falhas Native históricas nem o estado live,
e mantém os rótulos iniciais `PENDING` das tarefas. A ordem canônica
pré-publicação, CI e release (T-013A → T-013B e gates reais) permanece
inalterada.

Registrar comando/chamada efetiva, versão/schema, configuração relevante,
revision/hash, recursos, expected/actual, saída bruta, autor/revisor e limites.
Não inferir modelo por declaração ou autodescrição: actual ausente permanece
null/unverified. Não tratar fixtures/tabletop como observação OMP. Ausência de
isolamento ou ferramenta obrigatória bloqueia a rota dependente. Falha de
Positivos Git historicamente bloqueados por `E_UNSAFE_GIT_EXECUTABLE`/nlink2 e
qualquer captura posterior de admissão/consulta permanecem escopados; não
retiram controles de segurança nem promovem Native, gate ou release. Estado live
vem do receipt.

Registros de staging, cópia/check e preflight são históricos e não comprovam
discovery, task, inferência ou compatibilidade instalada. Não fecham AC-012,
AC-014 ou AC-016, não medem eficiência/custo e não autorizam editar caller,
aliases/settings globais, auxiliares ou builtins para produzir resultado
favorável.

### Evidência classificada, lifecycle e histórico

Resumo histórico datado (as-of 2026-11-15): capturas Native bounded,
autorizações canceladas, diagnósticos source-only, reviews e ledgers anteriores
à mudança pública da fonte permanecem em receipts privados/ledgers versionados.
São escopados e não promovem Native, E2E, segurança, gate ou release. O ledger
público `retained-observations.json` mantém cutoff imutável; observações futuras
são privadas. Não copiar contagens, hashes de tentativa ou logs para este guia.

No modo inline, `AgentToolResult.details.results` é a coleção canônica de
`SingleResult`, com `exitCode` real obrigatório. O modo custom assíncrono
continua aceitando somente `message_end.message.role:"custom"`,
`customType:"async-result"` e `details.jobs[]`; esse canal existente usa
evidência privada `source_kind:"task_async_result"`. `details.jobs[]` não é
`SingleResult` e não recebe `exitCode`, `isError`, `aborted`, ownership ou
assignment inventados.

O OMP 18.18.6 também expõe o terminal Root `wait` em
`tool_execution_end.result.details.jobs[]`, com `toolName:"wait"` e
`details.op:"wait"`. O snapshot bruto de cada job é preservado como
`source_kind:"task_wait_result"` privado, não convertido em custom. As chaves
permitidas são somente as documentadas/expostas: `id`, `type`, `status`,
`label`, `durationMs`, `intent`, `settledAtMs`, `exitCode` numérico,
`resolvedModel`, `resolvedModelIdentity`, `resolvedThinkingLevel`, `advisor`,
`completionPercent`/`stage`, `requests`, `cost`, `contextTokens`,
`contextWindow`, `widget`, `resultText`, `errorText`, `meta`, `structured`
(somente antes de consumo), `agentUrlId` e `agentOutputPublished`; campos
running-only só aparecem quando running. Não há chave arbitrária de
modelo/widget. `resultText`/`errorText` não são payload estruturado.

O registro privado preserva `record.id`/`record.allocated_id` como a criança
alocada e `record.jobId` como o `job.id` real; eles não são igualados. O
`wait_result` mantém `source:"tool_execution_end.result.details.jobs"`,
`tool:"wait"`, o `tool_call_id` real do Root wait, ordinal, `is_error` derivado
do `isError` real e `is_error_observed:true`, além do job bruto. Seu
`host_binding` usa `source:"observed-root-dispatch-lifecycle"`,
`root_session_id`, `parent_tool_call_id`, `allocated_id`, `index`,
`root_task_end_is_error:false`, `agent`, `agentSource`, assignment e IDs de
domínio host quando já observados. O call do wait não é o parent Task call.

Antes da admissão, Root wait START/END devem corresponder ao Root TASK e
`isError` deve ser observado explicitamente `false`; isso só prova sucesso do
transporte wait, não do filho. `agentUrlId` é hint de navegação e pode ser o
próprio job ID quando a entrada manager/child não está disponível; não é
autoridade universal. Se ele existir como identidade child demonstrada, validar
o tuple completo; caso contrário, usar somente o mapeamento Root primário/
primeiro async fortemente observado. `structured.source` (`caller|agent|session|
none`) é proveniência do schema, não `agentSource:project`.

Somente `status:"completed"` real, ownership Root único e structured/schema
válido podem contribuir para completion. Perfis estruturados exigem
`structured.status:"valid"`, source/mode reais e data apropriado; a exceção
existente `validator`/`spec-kit-author` sem schema ainda exige Bash/arquivo/
papel independente. Status ausente, running, failed, cancelled, malformed,
schema inválido, payload indisponível, job errado/stale, resultado isolado ou
ownership ausente bloqueiam. Campos do filho não expostos permanecem `null` e
`*_observed:false`; `wait.isError` é transporte separado. Só `exitCode`
numérico realmente exposto é preservado, valor não zero bloqueia e não se
infere `0`/`false` de completed.

O consumidor aguarda `session_settled` e o terminal Root mais recente sem
transformá-los em resultado. Lifecycle `completed`, `progress`,
`extractedToolData`, stdout/prosa Root, UPDATE, primeiro yield, quiescência,
`prompt_result` ou `agent_end` não sintetizam task record. Custom e wait do
mesmo job deduplicam uma vez somente com payload/status/ownership consistentes;
contradição, duplicata, binding ausente, ou limites de quantidade/16 MiB
excedidos bloqueiam antes da mutação. Frame não retido permanece desconhecido.
`get_messages` não é requisito/fallback/polling, e não se adicionam caller mode,
override de modelo/effort, force-sync, async disable ou campo público.

Leituras `skill://nome[/caminho]` só resolvem skills geridas instaladas no
projeto; o URI solicitado permanece em `requested_paths`. Traversal, symlink e
recursos externos são recusados. `agent://`, `proc://` e `history://` só podem
ser observados quando vinculados às instâncias próprias e nunca geram hash de
fonte ou autoridade de conclusão. Diretório listado não prova conteúdo de
arquivo; URIs privados não são fixtures Native.

O handoff usa o item `task` exato e descritor host-written imutável com run,
revisão, nonce, contexto, fingerprints, regra de tag e leituras obrigatórias,
sem expected output. Root e filho leem o mesmo descritor; comparação da
assignment usa somente trim e CR/LF documentados, sem paráfrase ou
double-unescape, preservando o hash bruto separado. Checkpoints A/B usam
prefixos append-only e `parent_path`/`parent_sha256` canônicos. Reparo
estrutural do SDK não é recusa malformed nem PASS Native; não se cria
`taskFile`, perfil blocking, override ou novo campo de wire.

Capturas source-only, helper/fixture, peer parcial, catálogo e ledger de
plataforma antigo são somente evidência scoped/histórica. O diagnóstico root
source-only antigo não é Native e não retro-resolve argumentos não retidos.
O estado live e a autorização vêm do receipt, e o fechamento de NATIVE-09 exige
retry técnico elegível separado de fallback de capacidade/provider. NATIVE-10
exige pacote integrado, review e validator aceitos.

### Fronteiras Windows e POSIX

O host Windows usa o PowerShell 5.1 do sistema sob a decisão explícita
`explicit_os_host_tcb`, com ambiente/cwd protegidos. Isso não constitui prova
independente pré-execução de ACL/assinatura do host, nem transfere confiança ao
Git filho.

A admissão Git exige a release/proveniência, assinaturas, hashes, identidades,
linksets, ACLs de ancestrais e dependências aprovadas. O candidato originalmente
selecionado pode ser `cmd/git.exe` ou `mingw64/bin/git.exe`, ambos já pertencentes
à mesma release verificada: o shell MSYS seleciona legitimamente o segundo.
Não se procuram alternativas após recusa, não se reescreve PATH e aliases como
`git-upload-pack.exe` não se tornam entrypoints. O controle legado nlink1 continua.
A permissão de criar subdiretórios em `C:\` é exceção somente para
Authenticated Users (`S-1-5-11`), não para outros trustees nem ancestrais Git.
Consultas reais suportadas e o wrapper que recebe refs por stdin passaram;
a política corrigida recebeu revisão independente escopada, sem substituir a revisão final do pacote.

Transações preservam publicações verificadas quando uma falha de limpeza ocorre
depois do commit irreversível: descartar preimagens e depois tentar rollback
destrutivo perderia dados. Limpeza incompleta continua sendo erro controlado,
não sucesso silencioso. Antes de remover uma publicação durante rollback POSIX,
a transação revalida a árvore e a identidade/hash da quarentena. Uma preimagem
adulterada preserva a publicação verificada e o objeto estrangeiro, sem restaurar
bytes ou links do atacante. A restauração válida confere ambos os aliases antes
de remover a quarentena própria.
Reparo de modo em conteúdo idêntico com `mode` explícito não exige escrita dos
bytes do inode anterior; permissões do pai e verificações CAS permanecem. Uma
substituição que altera conteúdo readonly continua recusada.
Fontes POSIX verificam ancestrais e confinamento real antes da leitura/cópia,
mas essa rota limitada não promete a mesma proteção contra corridas hostis que
os handles nativos Windows.

## Fontes oficiais consultadas

- [Skills e resolução de referências](https://github.com/can1357/oh-my-pi/blob/9058ab9d229663e229e2867824ba6df6f21e9e59/docs/skills.md).
- [Ferramenta task e schema dinâmico](https://github.com/can1357/oh-my-pi/blob/9058ab9d229663e229e2867824ba6df6f21e9e59/docs/tools/task.md).
- [Descoberta, modelos e configuração dos agentes](https://github.com/can1357/oh-my-pi/blob/9058ab9d229663e229e2867824ba6df6f21e9e59/docs/task-agent-discovery.md).
- [Execução real de task e normalização de assignment](https://github.com/can1357/oh-my-pi/blob/9058ab9d229663e229e2867824ba6df6f21e9e59/packages/coding-agent/src/task/index.ts).
- [Entrega de resultados assíncronos](https://github.com/can1357/oh-my-pi/blob/9058ab9d229663e229e2867824ba6df6f21e9e59/packages/coding-agent/src/session/async-job-delivery.ts).
- [Settlement da sessão RPC](https://github.com/can1357/oh-my-pi/blob/9058ab9d229663e229e2867824ba6df6f21e9e59/packages/coding-agent/src/modes/rpc/rpc-session-settle.ts).

Fontes fixadas ao commit `9058ab9d229663e229e2867824ba6df6f21e9e59` do OMP 18.18.6.
Para afirmar execução real, registre versão, configuração relevante, comandos,
jobs/resultados e limitações observados, além dessas fontes.


## Histórico 0.3r7 — não é a autoridade ativa deste release

Este registro preserva apenas decisões arquiteturais anteriores; provider, wire,
critérios, estado e gates atuais pertencem ao contrato ativo Spec005. A fronteira
histórica confiava no contexto OS explicitamente delimitado para bootstrap,
mantendo repo/PATH/env/reports/arquivos não confiáveis; isso não provava
correção retroativa nem dispensava risco.

Bootstrap/seleção continuam ancorados em metadados de runtime, release,
origem/assinatura/linkset/identidade, ACL de arquivo/alias/ancestrais e carga
pertinente. Nome de executável, env, report ou `trusted=true` não autentica a
âncora; unknown nega e recusa termina sem fallback para outra cópia, Git, PATH
ou shell. Propostas de broker/lease, serviço/SDK e transporte alternativo não
foram adotadas.

A cadeia existente de installer/pre-push e Ship preserva hooks, standalone,
worktree, LFS, CLI, argv, stdio, status, usuário/token/sessão/perfil/credenciais,
cwd, ambiente, TTY e `nlink=1`; não há segundo orquestrador ou CLI. RED→GREEN,
review independente e validator continuam necessários antes de fixtures reais.
`actual:null/unverified` permanece quando não observado. Esta nota histórica não
altera Goal 47 (22 tarefas, 21 AC, 42 CAP, 18 fontes) nem promove qualquer gate.
