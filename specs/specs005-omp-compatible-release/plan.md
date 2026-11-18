# Plan: specs005-omp-compatible-release

> **Feature:** `specs005-omp-compatible-release`
> **Versão:** 0.7.0 (approved amendment; unreleased)
> **Spec:** [spec.md](./spec.md)
> **Contrato:** [contracts/interface-contract.md](./contracts/interface-contract.md)
> **Status:** APPROVED AMENDMENT — UNRELEASED; implementação, revisão,
> validator e gates de execução/Native/release continuam pendentes
> **Aprovação do aditamento 0.6.0:** receipt privado
> `.omp/state/release-47/proofs/contract-0-6-native-wait-user-approval.json`,
> com `contract_amendment: "Aprovo"` e `confirmation: "Aprovo"`. A aprovação
> documental não é Native PASS, waiver, publicação ou autorização de mudança
> pública.

> **Aprovação do aditamento 0.7.0:** receipt privado
> `.omp/state/release-47/proofs/contract-0-7-native09-backend-user-approval.json`
> (`contract_amendment: "approve_scoped_native09_backend_completion_0_7"`,
> `confirmation: "Aprovado"`). O escopo é a prova privada delimitada de
> NATIVE-09; não é aprovação semântica, Native PASS, waiver, publicação ou
> release.
> **Issue:** #47
> **Branch ativa:** `feat/47-omp-compatible-release`
> **Baseline:** `local://ship-current-snapshot.json`
> **Entrega:** `external`, `merge_target: main`; intake de issue/rename imediatamente após aprovação e antes de implementar; gate final confirma esse registro
> **Autoridade do plano:** este artefato descreve arquitetura, dependências,
> riscos e sequência; não é um ledger operacional. Tarefas, AC, gates,
> autorização, receipts e promoção são lidos somente de
> `.omp/state/tdd/progress.json` e do receipt corrente que ele referencia. Não
> duplicar aqui contagens live, budgets, IDs de tentativa ou hashes de candidato.
>
> **Inventário normativo:** Goal 47 mantém 22 tarefas, 21 AC, 42 capacidades,
> 18 fontes, 10 skills, 12 perfis, 6 controles de segurança e contrato
> `0.5.0` é a base não lançada e recebe somente os aditamentos privados
> `0.6.0` e `0.7.0`, também não lançados. Os estados `PENDING`,
> `PENDING_NATIVE`, `BLOCKED` e `actual:null/unverified` são estados de
> enum/procedimento, não promoções.
>
> **Resumo histórico datado (as-of 2026-11-15):** janelas Native bounded,
> autorizações canceladas, diagnósticos source-only e reviews/ledgers antigos
> são snapshots preservados, sem promoção Native, E2E, gate ou release. T-009A
> permanece um checkpoint imutável de verificação do código existente sob
> AC-012, distinto do RED/TDD original, serving e prova global. T-009C preserva
> o RED indisponível e não fecha AC-014. O ledger de plataforma anterior à
> mudança pública da fonte é histórico e escopado; mudança de fonte reabre as
> provas dependentes. Detalhes, payloads e hashes ficam em receipts privados e
> ledgers versionados, não neste plano.
>
> Cópias privadas em `.omp/state/**` e URIs `local://` são proveniência, não
> documentação distribuída nem fixture para agentes Native. A autorização para
> nova avaliação só existe quando registrada no receipt live e não dispensa
> gates, credenciais, mudanças globais ou publicação.
>
> **Decisões de desenho preservadas:** a rota externa `Ship plan` é somente
> leitura; provider/serving físico pode permanecer `NÃO OBSERVADO`; fallback de
> capacidade, fallback de provider e retry técnico são distintos. Os aditamentos
> `0.6.0` e `0.7.0` somente ampliam evidência privada (`wait` documentado e
> prova backend NATIVE-09 escopada); versão, APIs públicas, wire, schemas
> públicos, modelos, flags, perfis e TCBs não mudam. T-013A cria prontidão
> pré-publicação; T-013B consome o artefato aprovado e os gates
> pré-publicação reais, sem exigir um ciclo impossível com AC-001 pós-release.
>
> Referências: [spec.md](./spec.md), [tasks.md](./tasks.md),
> [interface-contract.md](./contracts/interface-contract.md) e os três guias
> públicos vinculados na spec.

## Intenção e fronteiras

Este plano transforma os 33 achados `AUD-001`–`AUD-033`, quatro lacunas
`W-01`–`W-04`, seis riscos `R-01`–`R-06`, o catálogo 10/12/42/18 e
`NATIVE-01`–`NATIVE-10` em ondas delegáveis. A aprovação do plano e do
contrato foi registrada pelo usuário em `local://ship-user-approval.json`;
isso não é PASS de implementação, revisão, suíte, compatibilidade nativa ou release.

O usuário registrou em `local://ship-windows-tcb-approval.json` a escolha
`explicit_os_host_tcb`: premissa de bootstrap para o instalador de T-005 e a
inspeção de metadata/operações filesystem dos hooks em T-007, limitada ao host
exato Windows PowerShell 5.1 sob `System32`, derivado de módulos OS já carregados
e contexto OS protegido. Ela não é prova ACL/assinatura antes da execução do
host, não autoriza sibling nem confiança retroativa da filha. Exige `NoProfile`,
`NonInteractive`, cwd protegido, allowlist de ambiente scrubbed sem perfis/
injeções/PATH/`ComSpec` alternativo, sem bypass, e `FullLanguage` x64 detectado
ou fail closed.
`local://ship-native-fs-memory-final-result.json` registra seis PASS somente da
primitive LAB. T-005 pode iniciar GREEN após este registro, mas implementação,
review independente e prova nativa continuam necessários. T-007 pode reutilizar
o bootstrap apenas para metadata/operações filesystem dos hooks, nunca para
admitir Git por herança; Git R7 preserva `nlink=1` legado e só habilita extensão
com release/linkset/proveniência/identidade/ACL/carga exatos comprovados. POSIX
não é declarado equivalente e guard desconhecido falha fechado.

### Decisão de plataforma para T-006A/AC-006

`local://ship-backup-platform-approval.json` registra a escolha do usuário
`backup_platform_decision: "siga sua recomendação"` e fixa
`linux_python_tcb: "authorized_os_python3_isolated"`. T-006A deve preservar a
API pública de `performBackup` e concluir, antes do release, a primitive Windows
Node/libuv `EXLOCK|TEMPORARY` mantida até o link, sem `unlink`/`rename` por
pathname. A evidência `local://audit-check-ship-libuv-backup-primitive.json`
é prova LAB em Node `22.23.2`/uv `1.51`; a sonda de ancestral não aprova
produção.

O caminho Linux exige staging anônimo vinculado a file descriptor e publicação
atômica no-replace. Python3 só pode ser o OS Python em isolamento `-I/-S`,
contexto de carregamento protegido e allowlist sem `PATH`, `PYTHONPATH`,
`PYTHONHOME` ou `LD_*`; instalação, componentes, settings, serviço e SDK são
proibidos. Capacidade ausente/divergente do host, kernel ou filesystem falha
fechado, sem sibling ou fallback POSIX inseguro; não há alegação geral POSIX/
macOS. Colisão, identidade bigint da origem, quiescência e ausência de promessa
DB/WAL permanecem no contrato. Pipeline de bytes, herança de descriptor e DTO
terminal com nonce são internos; helper/publisher privado, se necessário, fica
sob `ship/bin/` e não adiciona campos ao wire OMP.



O alvo de compatibilidade é OMP **18.18.6** no Windows 10.0.26200 x64.
Versão/binário observado, fonte/tag e instalação são fatos distintos; toda
validação deve registrar fonte, comando, configuração, revisão e saída, sem
inferir parâmetros ocultos. O preflight de perfis é apenas uma captura:
a prova Native usa projeto descartável com cópias exatas em
`.omp/agents`/`.omp/skills`, precedência `project>user`, hashes antes/depois e
credenciais nunca copiadas; cache/token RPC só muda em fronteira previamente
aprovada.

A baseline é identidade/proveniência, não rebase, reset ou aprovação de
código/qualidade/runtime. Evidência anterior só pode ser reutilizada quando
conteúdo, critérios, ambiente, identidade e independência forem iguais;
mudança reabre a prova. Após aprovação, Ship é dono de issue→branch→PR→release;
não há merge local nem publicação nesta autoria.
### Decisão material 0.4.0: pin de provider dos perfis geridos

`local://ship-model-provider-approval.json` registra a escolha explícita
`pin_openai_codex`. O escopo é estritamente a configuração dos 12 perfis:
substituir o prefixo `openai/` por `openai-codex/`. O mapa concreto canônico
está no contrato; os IDs `gpt-6.1-sol`, `gpt-6.1-terra` e `gpt-6-astra`, a
ordem principal/fallback, o `thinkingLevel`/esforço e os cinco perfis
`structured:true` não mudam.

Não se usa `inheritRoot`/herda `Root` (a opção explícita do usuário foi outra), nem se alteram
settings/aliases globais, caller/sessão, overrides por chamada,
helpers/builtins ou credenciais. O cutover deve abranger os 12 callers/
documentos de perfil antes da validação, com bytes exatos e hashes de cada
perfil nativo; catálogo não equivale a serving.


Diagnósticos privados de autenticação do provider anterior são
`HISTÓRICOS`: não são RED de schema nem retry técnico. Serving efetivo e
fallback de deep-review só podem ser classificados por observação real;
observações peer positivas/negativas delimitadas não promovem gate, e saída
malformed corrigida pelo agente não conta como rejeição Native. `PENDING_NATIVE`
é estado procedural até as provas exigidas.

Windows TCB 0.2, backup Linux 0.3, a recuperação histórica de R-02 e o
catálogo 10/12/42/18 permanecem preservados. R-02 só pode ser classificado no
escopo do receipt live e não fecha AC-011 global, Native ou legalidade por
texto; nenhuma cláusula histórica de `specs004` é reescrita.
### Decisão material 0.5.0: wire peer TDD estruturado

`local://ship-peer-wire-approval.json` aprova
`native_structured_clean_cutover`. O caminho TDD normal deve consumir e
preservar um yield nativo estruturado com `protocol_mode: "TDD_PEER_REVIEW"`,
`agent: "peer-reviewer"` e status `APROVADO`/`BLOQUEADO`; não há primeira linha
textual obrigatória, adaptador/shim oculto, conversão de texto ou desativação
dos cinco perfis `structured:true`. Os campos
`reviewed_revision`, `explanation`, `confidence`, `overall_correctness` e
`findings` permanecem no schema atual do frontmatter, inclusive a forma
existente de cada finding.

O cutover é uma extensão pequena do `deep-review/lib/protocol.mjs` existente:
`validateReviewerResult(result, expected)` mantém a assinatura pública e o
envelope de retorno. `expected` é **REQUIRED**, independente e tem a forma
`{agent, protocol_mode, reviewed_revision}`; não há argumento omitido, default
TDD, inferência ou derivação desses valores a partir do resultado/candidato
nativo. O ramo TDD só é selecionado quando
`expected.protocol_mode === "TDD_PEER_REVIEW"` e o agente esperado é
`peer-reviewer`. Ele aceita somente `APROVADO`/`BLOQUEADO`, preserva o status
real no `value` (nunca o converte para `VALID`) e mantém a mesma validação
fail-closed de chaves, revisão e findings. Não se cria módulo nem scheduler.
Os modos `DEEP_REVIEW`/`DEEP_REVIEW_FALLBACK` continuam aceitando `VALID`
incremental, e `aggregateReview`/`aggregateReviewInstances` continuam exigindo
seu par deep e rejeitando dados TDD normais.

`local://ship-native-peer-codex-positive.json` registra evidência positiva
parcial (`APROVADO`, `openai-codex/gpt-6.1-sol`,
`globalAcceptance: PENDING`). Isso não fecha NATIVE-05 nem qualquer gate. O
wire textual legado é **SUPERSEDED**, não comprovado nem uma compatibilidade PASS;
há observação negativa nativa delimitada e controles do consumidor, mas saída
malformed corrigida não é evidência negativa; malformed, fallback e o gate
global continuam pendentes. A implementação deve migrar todos os callers e
instruções, preservando as decisões 0.4/0.3/0.2 e o catálogo 10/12/42/18.

## Norma nova versus história 004

| Fonte histórica | Norma ativa em specs005 | O que não muda |
|---|---|---|
| `specs004-quality-evolution` In Review/r7 | release-readiness exige prova real no snapshot final, não aprovação histórica | APIs, fatos, hashes, achados, RED e limitações permanecem consultáveis |
| batch obrigatório em textos antigos | batch somente quando exposto; flat equivalente quando desabilitado | não se inventam campos OMP nem se altera o schema da sessão |
| `COVERED` como sinal de conclusão | `DONE` de tarefa segue sua prova `IMPLEMENTED`/`VALIDATED`; `completed`/promoção de onda exige integração/review/validator atuais | schema 2.3 e migração explícita são preservados |
| OMP 18.18.3 em documentação histórica | preflight e prova de versão usam OMP v18.18.6 fixado | Node externo não é confundido com versão do OMP |
| guard universal/launcher/SDK/proposta de transporte | não adotado; apenas task/yield/discovery nativos e helpers locais justificados | nenhum scheduler, alias global, modelo por chamada ou serviço paralelo |
| r7 Windows (histórico de candidato; fechamento R7 ativo) | premissa `explicit_os_host_tcb` autoriza bootstrap do instalador T-005 e metadata/FS dos hooks T-007 no host exato Windows PowerShell 5.1/System32; não aprova host/transação nem herança Git | `NoProfile`/`NonInteractive`/cwd protegido/allowlist scrubbed/FullLanguage x64 fail-closed; handles/no-replace/quarentena obrigatórios; `nlink=1` legado preservado; fechamento R7 para `cmd/git.exe` ou `mingw64/bin/git.exe` originalmente selecionado exige objetos, assinaturas, hashes, linksets, ACLs, ancestrais e DLLs; guard desconhecido fail-closed |
| licença/proveniência React | nove referências autorais novas; artefato adaptado/auxiliar obsoleto excluído por cutover | lock/review e retorno histórico só valem no escopo registrado pelo receipt live; contrato 0.2/no-SHA permanece HISTÓRICO e não é aprovação global | PENDING apenas para AC-011/global/catalog/Native; não fabricar autoria/licença |

### Evidência classificada e regras duráveis

O plano não publica um estado operacional. `ESTÁTICA` descreve fonte/contrato;
`EXECUTADA` exige receipt e alcance; `HISTÓRICA` é captura datada;
`NÃO VERIFICADA`, `PENDING` e `PENDING_NATIVE` não autorizam promoção.
Source-only, fixture, mock, catálogo, yield de controle e peer positivo parcial
não equivalem a Native, serving, AC global ou release. Os seis controles de
segurança conservam seus níveis, TCBs e limites fail-closed; assembly scoped
não é sandbox universal, assinatura legal ou atestado global.

T-009A deve ser descrita como checkpoint imutável do código existente sob
AC-012, separado do RED/TDD original, serving e prova global. T-009C arquiva o
RED indisponível sem fechar AC-014. O ledger de plataforma anterior à mudança
pública da fonte é histórico/escopado; T-014 deve descobrir a suíte da fonte
atual e emitir ledger versionado. `retained-observations.json` permanece cutoff
imutável de métricas públicas; observações futuras são privadas, e
desconhecido/null nunca é zero. Mudança de fonte, contexto, ambiente ou
independência reabre provas dependentes.

Receipts privados e URIs `local://` são proveniência, não distribuição nem
fixture Native. Não repetir aqui contadores, budgets, IDs de tentativa ou hashes
de candidato; estado e autorização são lidos do `progress.json` e receipt live.

### Clarificação arquitetural do lifecycle async e do handoff (aditamento 0.6.0; sem nova tarefa)

O aditamento aprovado é uma correção aditiva de compatibilidade para o canal
`wait` já documentado no OMP 18.18.6; não cria API SDK, campo público, CLI,
perfil, status, waiver ou override. A aprovação está no receipt privado
`.omp/state/release-47/proofs/contract-0-6-native-wait-user-approval.json`;
execução, Native, E2E, retry técnico, source-preservation, full QA/CI e release
continuam pendentes e governados pelo estado live.

#### Autoridades de retorno

Há três superfícies distintas, que não são aliases:

- Inline: `AgentToolResult.details.results` é a coleção canônica de
  `SingleResult`, com `exitCode` real obrigatório e erro derivado pelo
  consumidor. `progress` e `jobs` não a substituem.
- Custom async: `message_end.message.role: "custom"`,
  `customType: "async-result"` e `details.jobs[]` continuam válidos. A
  evidência privada existente conserva `source_kind: "task_async_result"` e
  apenas o DTO exposto (`jobId`, `type`, `status`, `agentId`, `label`,
  `durationMs`, `meta`, `schema` quando presentes); não se inventam campos de
  `SingleResult`, ownership ou assignment.
- Root wait: o `tool_execution_end` com `toolName: "wait"` e
  `result.details.op: "wait"` expõe o terminal documentado em
  `result.details.jobs[]`. Cada job é preservado como snapshot SDK bruto, não
  reescrito como custom. As únicas chaves permitidas são as efetivamente
  documentadas/expostas: `id`, `type`, `status`, `label`, `durationMs`, `intent`,
  `settledAtMs`, `exitCode` numérico, `resolvedModel`, `resolvedModelIdentity`,
  `resolvedThinkingLevel`, `advisor`, `completionPercent` (running), `stage`,
  `requests`, `cost`, `contextTokens`, `contextWindow` (running), `widget`,
  `resultText`, `errorText`, `meta`, `structured` (somente antes de consumo),
  `agentUrlId` e `agentOutputPublished`. `type: "task"` só vale para job
  pertencente ao Root correto; não se inventam campos de modelo/widget.

#### Evidência privada e binding

O normalizador privado adiciona `source_kind: "task_wait_result"` ao lado de
`task_async_result`; isso não é tipo, campo ou contrato público. Para um wait
admissível, o registro preserva:

```json
{
  "source_kind": "task_wait_result",
  "id": "<allocated child real>",
  "allocated_id": "<allocated child real>",
  "jobId": "<job.id real; distinto de id>",
  "wait_result": {
    "source": "tool_execution_end.result.details.jobs",
    "tool": "wait",
    "tool_call_id": "<ID real do Root wait>",
    "host_workflow_ordinal": "<ordinal real>",
    "is_error": "<isError real do wait END>",
    "is_error_observed": true,
    "job": "<snapshot SDK bruto>",
    "host_binding": {
      "source": "observed-root-dispatch-lifecycle",
      "root_session_id": "<sessão Root real>",
      "parent_tool_call_id": "<parent do Root TASK>",
      "allocated_id": "<allocated child real>",
      "index": "<índice real>",
      "root_task_end_is_error": false,
      "agent": "<papel real>",
      "agentSource": "<source observado>",
      "assignment": "<assignment exata>",
      "job_id": "<job ID derivado pelo host>",
      "instance_id": "<instance ID derivado pelo host>"
    }
  }
}
```

`record.id`/`record.allocated_id` são a criança alocada pelo binding Root e
`record.jobId` é o `job.id` real do snapshot; ambos permanecem distintos.
`agentUrlId` é hint de navegação e o SDK pode usar o próprio job ID quando a
entrada manager/child não está disponível; só o tuple Root fortemente observado
estabelece ownership. O `tool_call_id` é o call do `wait`, nunca o
`parentTaskCallId`. `structured.source` é proveniência do schema (`caller`,
`agent`, `session`, `none`), não `agentSource:project`.

Antes da admissão devem existir `Root wait START` e `END` correlacionados, com
o Root TASK correto e `is_error_observed: true` com valor explícito `false`.
`wait` sem erro demonstra apenas sucesso do transporte. O Root session, parent
Task call, índice, papel, source e assignment devem ser correspondência única e
exata; ownership ausente, stale, rebind, foreign ou ambíguo bloqueia.

#### Terminalidade e deduplicação

Somente `status: "completed"` observado no job pode contribuir para completion.
Perfís estruturados exigem `structured.status: "valid"`, source/mode reais e
data apropriado, além de consumidor real; a exceção existente de
`validator`/`spec-kit-author` sem schema ainda exige Bash/arquivo/papel
independente. `running`, `failed`, `cancelled`, status ausente, payload
indisponível, schema inválido/malformed, job errado ou resultado isolado nunca
é sucesso. `exitCode`, `error`, `aborted` e `isError` do filho permanecem
`null`/`*_observed:false` quando não expostos; `wait.isError` é transporte
separado. Só um `exitCode` numérico efetivamente exposto é preservado, e
qualquer valor não zero bloqueia; `completed` não permite inferir `0`/`false`.

Settlement, primeiro yield, `prompt_result`, `agent_end`, quiescência,
lifecycle `completed`, `progress`, `extractedToolData`, stdout/prosa do Root
ou `UPDATE` não montam task record. O consumidor pode aguardar
`session_settled` e o terminal Root mais recente, mas isso não substitui o
snapshot estruturado. Custom e wait do mesmo job deduplicam uma única vez
somente quando payload/status/ownership são consistentes; contradição bloqueia.
IDs/índices duplicados bloqueiam. Limites existentes de quantidade e 16 MiB,
além de IDs opacos exatos, devem ser validados antes de mutar o registro; não
reter payload desconhecido ou comandos sensíveis. Os predicados compartilhados
`isAuthoritativeTaskRecord`/`taskRecordSucceeded` devem reconhecer o novo kind
real, não por bypass de teste.

#### Lifecycle, handoff e limites

Lifecycle antecipado ao `Root tool_execution_start` fica pendente com ordinal e
timestamps reais até dispatch Root e tuple completo de
`parentToolCallId`, índice, papel, `agentSource`, alocação e assignment.
Não sintetizar Root, IDs, progresso, permissão ou completion; frame não retido
permanece desconhecido. `get_messages` não é requisito nem fallback/polling.
Não adicionar caller mode, modelo/effort override, `forceSync`, async disable,
perfil blocking ou campo de peer.

O handoff continua usando `.omp/state/native-route/task-<step>.json` imutável,
forwarding literal, run, revisão, nonce, contexto, fingerprints e leituras
obrigatórias. A guard de UPDATE anteriormente encerrada como incompatibilidade
é falso positivo histórico, sem promover captura alguma. A regra é consumida
por T-009A/T-009B/T-011 e PV-012/PV-013/PV-016, preservando os 21 AC, 22
tarefas, 12 perfis e estado `PENDING_NATIVE`.



### Aditamento 0.7.0 — prova privada do backend NATIVE-09

O aditamento é aditivo, privado e não lançado; não cria tarefa, AC, estado,
campo público ou promoção. T-009B e T-011 continuam donos do consumo e da
validação da prova. O kind tipado é
`source_kind: "native09-backend-repair-write"`, com identidade, caminho e
correlação sempre vinculados ao Root.

O backend só pode fornecer completion de framework para NATIVE-09 quando o
job aprovado pelo Root estiver efetivamente `completed`, a criança opaca
estiver ligada por um tuple Root completo e único
(`root_session_id`, `parent_tool_call_id`, `allocated_id`, `index`,
`root_task_end_is_error:false`, `agent`, `agentSource`, assignment, `job_id`,
`instance_id`) e houver exatamente um
`write END` aprovado com `isError: false` observado explicitamente no caminho
exato aprovado. O `actual` deve demonstrar que o sujeito pretendido mudou por
bytes/hash antes/depois e que as dependências protegidas permaneceram
inalteradas; qualquer drift, ausência, rebind, stale ou ambiguidade bloqueia.

A coleta pode incluir dispatch de peer independente e de segundo validator,
mas isso não é aprovação semântica. `Task framework completed` registra
somente término do framework, não `validator semantic PASS`. O primeiro
`FALHOU` do validator é um resultado legítimo quando correlacionado ao CLI
real com código não zero; seu raw permanece histórico e não vira PASS de
teste. Semantic repair approval/NATIVE-09 PASS só é possível após peer
independente e segundo validator com `PASSOU` real, correlação válida e gates
atuais.

Perfis existentes `structured:true` continuam exigindo schema válido. A única
exceção é esta prova do perfil `backend-developer` para NATIVE-09, limitada ao
kind privado e sem aceitação geral de perfil indisponível. As regras de
`validator` e `spec-kit-author` não mudam; apenas se explicita que relatório
negativo do validator não passa testes, mesmo que o task framework esteja
`completed`. Flags de filho não expostas permanecem desconhecidas/null com
`*_observed:false`; nunca se infere `exitCode: 0`, `isError:false` ou
`aborted:false`.

Não há alteração de SDK/wire, API, settings, modelos, flags, CLI pública ou
perfis. Contadores e falhas Native permanecem históricos, não live; os rótulos
iniciais `PENDING` das tabelas de tarefas não mudam. A ordem de prontidão
pré-publicação, CI e release já definida (T-013A → T-013B e gates reais)
permanece canônica, sem bump de versão do pacote.
## Arquitetura e responsabilidades

| Camada | Responsabilidade | Autoridade / limite |
|---|---|---|
| alignment e architecture | fechar objetivo, rota, consumidores e crítica proporcional | instrução e checkpoint; não executam outro scheduler |
| TDD state/execution | schema 2.3, migração, DAG, recursos, tentativas e prontidão | bibliotecas puras/determinísticas; caller persiste e observa jobs |
| quality/CLI/retro | baseline, contexto independente, receipts, gates e triagem pós-entrega | relatórios são dados; não autenticam autor nem executam comandos |
| deep-review/peer/validator | revisão técnica/requisitos, envelope individual/agregado e dez gates | peer normal estruturado `TDD_PEER_REVIEW` preserva `APROVADO`/`BLOQUEADO`; deep permanece `VALID` incremental e não é aprovação agregada |
| install/hooks | distribuição 10/12, staging, CAS, rollback e execução Windows | destino/ancestral/argv/identidade devem ser provados; unknown bloqueia |
| Ship | parser, preflight, issue/branch/PR/release/deploy e rota `plan` readonly | efeitos externos somente no gate; `plan` apenas lê provas válidas e emite `PLANNED` declarativo, com `external → main` |
| OMP runtime | discovery, precedência, task, batch/flat, async/yield, provider/modelos e terminal | schema real v18.18.6 é autoridade; mapa `openai-codex` é configuração de perfil, frontmatter não prova serving |
| documentação/proveniência | 42 CAP/18 fontes, README/functional/matrix/OMP, SOURCE/NOTICE/licenças | revisão semântica independente; não repinar wording para fazer teste passar |

## Stack, dependências e decisões de segurança

| Componente | Tecnologia/fonte | Decisão |
|---|---|---|
| Runtime nativo | OMP v18.18.6, schema/configuração efetiva fixados por prova | citar fonte v18.18.6; registrar versão, modo, sessão e limites |
| Produto e tooling | ESM Node conforme `package.json`/lock; Vitest e `node --test` | alinhar engine do tooling à matriz real; não escolher versão nova automaticamente |
| Estado/execução | APIs existentes `state.mjs`/`execution.mjs` | preservar exports e `{ok, errors}`; não criar scheduler |
| Qualidade | `quality.mjs`, CLI `capture/check`, Ship/Retro | fonte report/contexto/receipt deve ser grafo independente e revalidado |
| Distribuição | `install.mjs`, hooks, HOME/projeto descartáveis | staging, CAS e rollback seletivo; nenhuma escrita no HOME real nesta fase |
| Git/GitHub | Ship, Git for Windows, ruleset main | `origin`/ref explícitos; guards não são contornados; auto-merge squash só no fluxo autorizado |
| Segurança Windows | bootstrap `explicit_os_host_tcb` restrito ao host PowerShell 5.1/System32 e contexto protegido para T-005 e metadata/FS dos hooks T-007 | decisão em `local://ship-windows-tcb-approval.json`; NoProfile/NonInteractive/cwd protegido/allowlist scrubbed/FullLanguage x64 fail-closed; primitive LAB não aprova host/transação; T-007 não herda Git; `nlink=1` legado preservado; POSIX não é equivalente; guard desconhecido fail-closed |

## Regras de decomposição e estado

1. Cada tarefa tem `acceptance_criteria` explícito e pelo menos um AC.
2. Tarefa com AC `type: normative` recebe **exatamente um AC normativo**; nenhum
   `NA` de state será usado para mascarar AC behavioral. Relações adicionais ficam
   na matriz de suporte, não no array de aceitação persistido. Essa regra segue o
   consumidor `state.mjs:312–314` (`acceptance.length === 1`).
3. AC behavioral só fecha com asserção real, smoke descartável ou cenário nativo
   pertinente. Teste de prosa, wiring, mock ou fixture não equivale a execução OMP.
4. RED precede GREEN para mudança comportamental; norma documental recebe revisão
   semântica independente, não RED inventado.
5. Cada tarefa conserva `run_id`, identidade, revisão, tentativa e recursos. O
   máximo de três tentativas é por identidade; não se troca nome para apagar
   histórico.
6. Sem isolamento observado, writers com globs/recursos sobrepostos são
   serializados; tarefas realmente disjuntas podem ser paralelas.
7. `PENDING`, `PENDING_NATIVE`, `BLOCKED` e `actual:null/unverified` não são PASS.
   NATIVE-09 pode aparecer pendente durante a execução e bloqueia a conclusão de
  100%/release até resolução ou decisão expressa do usuário; R-02 **global**
  permanece `PENDING` somente para AC-011/catalog/Native: a recuperação histórica em
  `.omp/state/release-47/proofs/resumed-provenance-recovery.json` é auditable,
  mas tem contrato 0.2 e nenhum manifesto SHA; esse resultado é
  **HISTÓRICO**, não a aprovação corrente. A rechecagem bounded atual está
  `APROVADO` em `resumed-t-010a-review.json` +
  `resumed-provenance-lock-reconciliation.json`, limitada a 13 arquivos/nove
  referências autorais; isso não fecha AC-011 global/catalog/Native.
8. A captura histórica da baseline registrou 14 FAIL distribuídos em
  tooling/hooks. Essa captura é evidência datada e escopada: não autoriza, por
  si só, promoção, `DONE`, commit, auto-merge ou release, nem invalida
  automaticamente prova corrente ou define a fase/status. Fase, status e
  promoções dependem exclusivamente de `.omp/state/tdd/progress.json`, do receipt
  live corrente e dos gates efetivos; condições fail-closed, suíte,
  review/validator e demais provas aplicáveis continuam obrigatórias antes da
  promoção.
9. A onda final é uma DAG de integração única: native/evidence → suíte e métricas
   → review/validator/documentação final → Ship. Dependências só representam
   consumo real; qualquer tarefa independente pode trabalhar sob lock, sem
   transformar GREEN local em aprovação global.

## Ondas, dependências e globs

`allowed_write_globs` são limites de escrita, não lista de arquivos que já foram
alterados. `none` significa pesquisa somente leitura. Globs de uma mesma onda são
disjuntos; zonas serializadas abaixo são exceções explícitas e nunca paralelas.

### Onda 0 — plano e crítica antes de implementação

| ID | Dono | Escopo/saída | AC de aceitação | Dependências | `allowed_write_globs` |
|---|---|---|---|---|---|
| P-001 | spec-kit-author | escrever apenas os quatro artefatos canônicos desta pasta, com matriz e contrato DRAFT | AC-018 (normative) | nenhuma | `specs/specs005-omp-compatible-release/spec.md`; `specs/specs005-omp-compatible-release/plan.md`; `specs/specs005-omp-compatible-release/tasks.md`; `specs/specs005-omp-compatible-release/contracts/interface-contract.md` |
| P-002 | pesquisa nativa read-only | fixar fonte OMP v18.18.6 e schema; descrever prova autenticada dos 12 perfis/10 skills, sem copiar tokens | AC-012 (behavioral) | nenhuma | `none` |
| P-003 | crítica de fronteira read-only | comparar helper OS/handles versus bundle nativo; identificar primitive, ACL/alias/ancestral, NOREPLACE, rollback e limites | AC-005 (behavioral) | nenhuma | `none` |
| P-004 | Ship intake após aprovação: registrar issue/rename/associação sem implementação, preservar a branch ativa `feat/47-omp-compatible-release` e anexar identidade ao snapshot | AC-001 (normative) | aprovação explícita do plano/contrato | `implementation-evidence/release-governance/**`; `.git/ship-review-evidence.md` |

P-001, P-002 e P-003 não dependem de respostas para iniciar. P-004 só pode
iniciar depois da aprovação explícita do plano/contrato; ele é o intake mínimo
issue/rename antes da primeira implementação, não publicação nem release. Um
impedimento material deve ser comunicado; a documentação permanece DRAFT se a
fronteira não puder ser decidida com prova.

### Onda 1 — bases independentes com RED antes de GREEN

| ID | Escopo exato | Achados/AC primários | Dependências | `allowed_write_globs` |
|---|---|---|---|---|
| T-001 | locks, recursos, raízes e retornos em `execution.mjs` | AUD-001/AUD-011; AC-002 | P-001 + aprovação | `tdd-orchestrator/lib/execution.mjs`; `scripts/execution.test.mjs` |
| T-002 | estado 2.3, unicidade, TEST_REF e migração | AUD-006–010; AC-003 | P-001 + aprovação | `tdd-orchestrator/lib/state.mjs`; `scripts/tdd-state.test.mjs`; `scripts/state-evolution.test.mjs`; `scripts/integration-validation.test.mjs` |
| T-003 | quality, CLI, retro e provas Ship/Retro | AUD-002/AUD-012/AUD-032/W-03; AC-004 | P-001 + aprovação | `tdd-orchestrator/lib/quality.mjs`; `tdd-orchestrator/bin/quality.mjs`; `retro/lib/control.mjs`; `scripts/quality.test.mjs`; `scripts/quality-context-security.test.mjs`; `scripts/quality-identity.test.mjs`; `scripts/ship-quality.test.mjs`; `scripts/ship-quality-cli.test.mjs`; `scripts/retro.test.mjs` |
| T-004 | referências de segurança e precisão consultiva | AUD-005/AUD-023–030/AUD-033; AC-010 (normative) | P-001 + crítica semântica | `tdd-orchestrator/references/postgresql/security-rls-basics.md`; `tdd-orchestrator/references/postgresql/query-missing-indexes.md`; `tdd-orchestrator/references/postgresql/security-rls-performance.md`; `tdd-orchestrator/references/react/bundle-defer-third-party.md`; `deep-review/references/security/golang-general-backend-security.md`; `deep-review/references/security/javascript-express-web-server-security.md`; `deep-review/references/security/javascript-typescript-nextjs-web-server-security.md`; `deep-review/references/security/javascript-typescript-vue-web-frontend-security.md` |

Essas quatro tarefas são paralelizáveis: não compartilham globs. O coordenador
serializa `progress.json/progress.md` e qualquer atualização dos quatro docs.

### Onda 2 — efeitos locais, snapshots e Windows

| ID | Escopo exato | Achados/AC primários | Dependências | `allowed_write_globs` |
|---|---|---|---|---|
| T-005 | instalador, preflight, staging, CAS, rollback e inventário final; reservar namespace para helper/factory/codegen FS real; usar a premissa `explicit_os_host_tcb` somente para iniciar GREEN após registro, sem aprovar host ou transação | AUD-003/AUD-015/AUD-016/R-03; AC-005 | P-003 + T-001/T-002 | `install.mjs`; `tdd-orchestrator/lib/fs-transaction/**`; `tdd-orchestrator/lib/fs-transaction/generated/**` (se necessário); `scripts/fs-transaction*.test.mjs`; `scripts/install.test.mjs`; `scripts/install-transaction.test.mjs` |
| T-006A | backup com identidade bigint pinada, quiescência e rollback; dono único de `ship/bin/lib.mjs`, incluindo `flagValue` estrito para o parser; AC-006 exige implementação bounded, consumidor real de quality/delivery, validator e prova independente: a primitive Windows e a prova Linux FD-bound/atomic no-replace devem ser independentemente validadas; a captura LAB histórica não é prova de produção; fase, status e promoção live vêm exclusivamente de `.omp/state/tdd/progress.json`, do receipt corrente e dos gates efetivos | AUD-004/R-04/AUD-013; AC-006, AC-007 | T-003 | `ship/bin/lib.mjs`; `ship/bin/lib.test.mjs` |
| T-006B | parser Ship, `origin/<default>`, preflight e base explícita; consome somente a lib após T-006A | AUD-013/AUD-014; AC-007 | T-006A | `ship/bin/ship.mjs`; `ship/bin/ship.test.mjs`; `scripts/ship-protocol.test.mjs` |
| T-006C | implementar `node ship/bin/ship.mjs plan --root <workspace> --target <branch> [--report <relative>] [--context <relative>]` como rota pública somente leitura: parser estrito, defaults, validação quality/context real e JSON externo declarativo; sem Git/GitHub/rede, subprocessos, escrita, publicação ou deploy. Main é dono dos docs públicos não-spec; prontidão da rota não é release | AC-021 (behavioral); rota externa relevante ao NATIVE-10 | T-006B + T-003 | `ship/bin/ship.mjs`; `scripts/ship-plan.test.mjs`; `ship/SKILL.md`; `ship/references/integrated-delivery.md` | PV-018; RED histórico e refs reais permanecem em proveniência privada; a fase e o resultado da rota vêm do estado live; AC-021 exige prova própria e não promove Native/global |
| T-007 | hooks, CMD argv e seleção Git Windows | AUD-017–019/R-06; AC-008 | T-005 + P-003 | `scripts/install-hooks.mjs`; `scripts/hooks/commit-msg.mjs`; `scripts/hooks/pre-push.mjs`; `scripts/fixtures/hooks-v040/**`; `scripts/lib/git-trust-source.mjs`; `scripts/generate-git-trust.mjs`; `scripts/install-hooks.test.mjs`; `scripts/pre-push-default.test.mjs`; `scripts/git-trust.test.mjs`; `scripts/git-trust-generation.test.mjs` |

T-006A é dona exclusiva de `ship/bin/lib.mjs` e sua prova; T-006B é
serializada depois e não edita essa lib. T-005 reserva apenas o namespace
`tdd-orchestrator/lib/fs-transaction/**` (incluindo `generated/**` somente se
necessário) e seus testes; T-007 consome a interface depois de T-005.
T-007 também é dona de `scripts/fixtures/hooks-v040/**`, com autoria do
test-author: testdata de upgrade/CAS que preserva os bytes exatos v0.4.0 de
`audit/release-v040/scripts/hooks/{commit-msg.mjs,pre-push.mjs}`, conforme
`local://ship-released-hook-payloads-v040.json`. Pré-imagens com sufixos de fonte
modificada são recusadas por `isManaged` antes da injeção de falhas. A ampliação
é interna aos globs; não muda AC, API, wire, premissas ou gates.
T-006C é serializada após T-006B e T-003: apenas `ship/bin/ship.mjs`,
`scripts/ship-plan.test.mjs` e os dois documentos públicos Ship listados são
escopo dessa tarefa; Main edita os docs não-spec. A rota não altera comandos
existentes nem assinatura, wire, schema, modelo ou perfil público existente.

Com a decisão `explicit_os_host_tcb` registrada, T-005 pode iniciar GREEN,
mas os seis PASS LAB não aprovam host/transação; handles/ancestrais pinados,
no-replace e quarentena continuam obrigatórios, e a conclusão exige review
independente da implementação e prova nativa. Para T-006A, o artefato Node/libuv
é somente LAB; a capacidade Linux efetiva deve ser provada antes do release.


### Onda 3 — integração OMP e distribuição

| ID | Escopo exato | Achados/AC primários | Dependências | `allowed_write_globs` |
|---|---|---|---|---|
| T-008 | alignment checkpoint namespace/CAS e oráculos observáveis | AUD-020/W-01/W-02; AC-009 | T-001/T-002 | `alignment/SKILL.md`; `alignment/references/routing-and-persistence.md`; `implementation-evidence/native-release/proof-index.json`; `implementation-evidence/native-release/alignment.mjs`; casos comportamentais atuais retidos referenciados pelo índice |
| T-009A | discovery/model policy e 12 perfis; cutover `openai/`→`openai-codex/` apenas nos perfis geridos, IDs/ordem/effort preservados, `agentSource`, structured opt-in e solutionSpace; checkpoint imutável no mesmo AC-012 verifica código existente e não substitui RED/TDD, serving físico/provider fallback ou Native/global; fase/revisão vêm do estado live | NATIVE-01–04; AC-012 | T-001/T-002/T-003/T-008 | `alignment/agents/requirements-reader.md`; `architecture/SKILL.md`; `architecture/agents/architect.md`; `secure-linux-web-hosting/SKILL.md`; `secure-linux-web-hosting/agents/host-operator.md`; `tdd-orchestrator/SKILL.md`; `tdd-orchestrator/agents/*.md`; `tdd-orchestrator/references/model-policy.md` |
| T-009B | wire peer TDD estruturado e deep-review: estender `validateReviewerResult(result, expected)` no módulo existente com `expected` REQUIRED e independente na forma `{agent, protocol_mode, reviewed_revision}`, sem argumento omitido/default/derivação do candidato; somente `expected.protocol_mode === "TDD_PEER_REVIEW"` + `peer-reviewer` aceita e preserva `APROVADO`/`BLOQUEADO`, schema atual de frontmatter, findings, revisão e envelope; manter deep `VALID`, agregação/par e fallback/retry distintos, sem adapter/shim ou módulo novo | NATIVE-05/06/09; AC-013 | T-009A | `deep-review/references/review-axes.md`; `deep-review/lib/protocol.mjs`; `deep-review/agents/deep-reviewer.md`; `tdd-orchestrator/agents/peer-reviewer.md`; `scripts/review-instances.test.mjs`; `scripts/deep-review.test.mjs` |
| T-009C | revisão branch/PR, Fase 0, DOC e DONE | NATIVE-07/08; AC-014 | T-009A/T-009B | `deep-review/SKILL.md`; `ship/references/integrated-delivery.md`; `tdd-orchestrator/references/handoff.md`; `tdd-orchestrator/references/execution-and-resume.md` |
| T-010A | licença/proveniência, AMENDMENTS e decisão React autoral nova | AUD-022/R-02; AC-011 (normative) | T-004 + fonte `local://ship-license-primary-evidence.json` | `deep-review/AMENDMENTS.md`; `tdd-orchestrator/SOURCE.md`; `deep-review/SOURCE.md`; `tdd-orchestrator/references/react/async-dependencies.md`; `tdd-orchestrator/references/react/async-parallel.md`; `tdd-orchestrator/references/react/bundle-defer-third-party.md`; `tdd-orchestrator/references/react/bundle-dynamic-imports.md`; `tdd-orchestrator/references/react/client-swr-dedup.md`; `tdd-orchestrator/references/react/rerender-derived-state-no-effect.md`; `tdd-orchestrator/references/react/server-auth-actions.md`; `tdd-orchestrator/references/react/server-cache-react.md`; `tdd-orchestrator/references/react/server-parallel-fetching.md`; `README.md` (zona serializada com T-010B) |
| T-010B | engines, lock, CI/release e probes comportamentais retidos | AUD-021/AUD-031/W-04/R-05; AC-015 | T-009A/T-010A | `package.json`; `package-lock.json`; `.github/**`; `scripts/bootstrap-config.test.mjs`; `implementation-evidence/native-release/profiles.mjs`; `implementation-evidence/native-release/proof-index.json`; `scripts/release-integrity.test.mjs`; `README.md` (zona serializada com T-010A) |

T-009A/B/C têm zonas de globs com sobreposição intencional (discovery amplo de
perfis versus protocolo/fases). A sequência é obrigatoriamente A→B→C; B e C não
rodam em paralelo com a zona que editam. T-010A/B compartilham README e são
sequenciais. Nenhum deles altera as quatro specs canônicas; isso é zona documental
exclusiva de T-012A/B.

### Onda 4 — prova final, documentação e entrega externa

| ID | Escopo exato | Achados/AC primários | Dependências | `allowed_write_globs` |
|---|---|---|---|---|
| T-011 | NATIVE-01–10 em projeto/HOME descartável, com OMP v18.18.6 autenticado e schema real; validar o cutover completo dos 12 callers/documentos e bytes exatos dos 12 perfis antes de avaliar serving/retornos, incluindo a rota externa readonly de AC-021 sem publicação. Pode usar, somente como prova privada de alinhamento, o helper Node source/hash-bound em fixture descartável via a API existente de `tdd-orchestrator/lib/fs-transaction` (`expectedTarget.exists:false`); isso não é prova Native nem altera runtime | R-01/R-03/R-06; AC-016 (behavioral); supports AC-012/013/014/019/021 e NATIVE-10 external route | T-008/T-009A/B/C/T-010A/B/T-006C + crítica independente | `implementation-evidence/native-release/**` (fora do produto/runtime; não usar HOME real) |
| T-014 | executar a suíte pertinente descoberta pela configuração/fonte atuais, com Node nativo e positivos Windows legítimos, e produzir ledger versionado de escopo, revisão, resultados e limitações; capturas anteriores à mudança pública permanecem históricas e não promovem Native/global/release | AC-017 (behavioral) | T-005–T-011 | `none` (saídas fora do snapshot; não editar/remover testes para obter verde) |
| T-015 | métricas de eficiência/observabilidade, incluindo primitive/helper antes de habilitação e ledger final | AC-020 (behavioral) | T-005/T-007/T-011/T-014 | `implementation-evidence/metrics/**` |
| T-012B | seis controles de segurança, decisão R-02 e fechamento de limites | AC-019 (normative) | T-004/T-005/T-007/T-010A/T-011/T-014/T-015 | `docs/functional.md`; `docs/omp-compatibility.md`; `tdd-orchestrator/SOURCE.md` (serial com T-012A) |
| T-013A | criar artefato aprovado de prontidão pré-publicação para baseline/branch/intake issue/rename/PR e evidência Ship, sem afirmar release terminal | AC-001 (normative) | P-004 + T-012A/B + review/validator final | `.git/ship-review-evidence.md`; `implementation-evidence/release-governance/**` |
| T-013B | a responsabilidade Ship externa consome o artefato aprovado de T-013A e todos os gates pré-publicação reais; feature CI, merge e evidência terminal fecham a condição final de AC-001 e os requisitos de pacote/AC-016, sem depender ciclicamente de AC-001 pós-release para publicar | AC-016 (behavioral) | T-013A + T-006C + gates pré-publicação reais + decisão explícita do usuário | `.git/ship-review-evidence.md` (serial com T-013A) |


T-014 e T-015 antecedem T-012A/B e T-013A/B; nenhuma PR, auto-merge ou
release começa antes da suíte pertinente descoberta, métricas, review e
validator. Capturas anteriores à mudança pública da fonte são ledgers
`HISTÓRICOS`/escopados e não substituem a execução de T-014; testes incidentais
removidos não são restaurados como oracle.

Resultado verde local pode fechar somente o AC/tarefa que sua prova cobre; não
promove onda, feature, Native, segurança ou release. T-006C só pode declarar
`PLANNED` quando quality/context passarem na validação real; a saída continua
declarativa e não afirma branch, remoto, readiness, IDs, publicação ou release.
`actual:null`, `agentSource:user`, schema ausente ou texto autodeclarado não
viram PASS. NATIVE-09 exige retry técnico elegível separado do fallback de
provider/capacidade; NATIVE-10 exige pacote integrado aceito.

T-013A cria o artefato aprovado de prontidão pré-publicação. T-013B é
responsabilidade do Ship externo: consome esse artefato e todos os gates
pré-publicação reais; CI, merge e evidência terminal fecham a condição de
AC-001 e o pacote de AC-016. Não há dependência cíclica que exija AC-001
`RELEASE_CONFIRMED` pós-release antes de publicar.

## Matriz de provas e gates

| Prova | Quando | Conteúdo mínimo | Condição de aceitação |
|---|---|---|---|
| PV-001 | antes/depois de cada onda | snapshot, SHA, branch, manifest/hash e mudança de identidade | bytes/revisão correspondentes; divergência reabre prova |
| PV-002 | T-001/T-011 | execution tests, recursos, jobs, returns, locks e raiz por plataforma | falha/unknown não libera writer; API não agenda |
| PV-003 | T-002 | migração 2.1/2.2→2.3, duplicatas, TEST_REF literal, baseline e promoção | evidência preservada; schema fechado |
| PV-004 | T-003/T-006A | report/context/receipt original, troca de bytes, aridade, stage e consumidor | source não pode ser report/context; stale bloqueia |
| PV-005 | T-005/T-007 | race de ancestral, CAS, handles/primitive, bootstrap `explicit_os_host_tcb` com host/ambiente/FullLanguage x64 conforme decisão, rollback e sentinel externo; qualquer resultado LAB permanece scoped | nenhuma escrita externa; implementação e revisão nativa ainda exigidas; desconhecido BLOCKED |
| PV-006 | T-006A | origem trocada, identidade bigint do descriptor, quiescência, colisão, bytes do backup e primitive de publicação da plataforma | substituição recusada; Windows usa EXLOCK/TEMPORARY sem fallback pathname; Linux prova FD-bound/atomic no-replace; sem promessa de consistência de DB/WAL |
| PV-007 | T-006A/T-006B | parser/`flagValue` negativo antes de efeito, remote/ref explícito e cenário Git fixture | nenhum issue/branch remoto com argumento inválido |
| PV-008 | T-007/T-014 | CMD argv em path com espaço, wrappers, admissão do executável originalmente selecionado (`cmd/git.exe` ou `mingw64/bin/git.exe`), assinaturas/hashes/linksets/ACLs/ancestrais/DLLs, E_UNSAFE e positivos Windows | guard legítimo mantém diagnóstico; execução e revisão devem ser registradas no receipt da fonte atual; sem reescrita de PATH, busca após recusa, alias ou Git substituto |
| PV-009 | T-008 | checkpoints concorrentes, local/Git/short/full observáveis | receipt com request/run e CAS; observação limitada não fecha W-01/W-02 ou promoção global |
| PV-010 | T-004 | revisão de fontes primárias, stack/router/sink, licença e limites | orientação não prescreve garantia inexistente |
| PV-011 | T-010A/T-012A | 42 CAP/18 fontes, owners, links locais, SOURCE/NOTICE pertinentes, evidência React delimitada e autoria atual | lock/proveniência e qualquer review só valem no escopo do receipt; prova não fecha AC-011 global, catalog/Native ou legalidade sem seus gates |
| PV-012 | T-009A/T-011 | versão v18.18.6, discovery project, agentSource, catálogo/modelos/effort, bytes e hashes exatos dos 12 perfis após cutover completo, resolved/actual e terminal | `actual:null/unverified` permanece desconhecido; serving/fallback não se infere do catálogo e o aceite depende da execução exigida |
| PV-013 | T-009B/T-011 | peer estruturado `TDD_PEER_REVIEW`/`peer-reviewer` com positive/negative/malformed, campos atuais de frontmatter, deep yields `VALID`/agregado, fallback/retry | APROVADO/BLOQUEADO são preservados; malformed corrigido não é negativo; fallback/retry e NATIVE-05 completo exigem prova própria |
| PV-014 | T-009C/T-011 | branch/head/PR SHA, Fase0, OK, DONE e revalidação | cada resultado deve estar vinculado à revisão e consumidor reais; revisão/validator global exigem seus gates |
| PV-015 | T-010B/T-014 | engines/CI real, conjunto pertinente descoberto pela configuração vigente e Node nativo aplicável, advisories no escopo e licenças | ledger versionado da fonte atual; ledgers históricos não são suíte atual, Native/global ou release |
| PV-016 | T-011/T-013B/T-006C | pacote instalado, short/full/local/external, retro, owner, opt-out, falha/retomada e rota externa readonly | sem publicação acidental; NATIVE-10 external permanece pendente; plano não afirma remoto, readiness, IDs ou release |
| PV-017 | T-012A/T-015 | ledger AC→ID→task→proof, raw outputs, métricas e limitações | usar `retained-observations.json` somente em seu cutoff imutável; observações futuras têm receipt privado, sem alegar ganho ou transformar pendência em PASS |
| PV-018 | T-003/T-006B/T-006C/T-011 | parser exato de `ship plan`, flags únicas, target obrigatório, defaults report/context, validação real `validateShipQuality(..., {required:true, reportPath, contextPath})`, rejeição antes de efeitos e JSON stdout determinístico | válido retorna somente `PLANNED` readonly com sete steps na ordem contratada; inválido/stale/missing ou erro real retorna não-zero, diagnóstico sanitizado e jamais `PLANNED`; readiness não afirma remoto, IDs, publicação ou release |

## Riscos e decisões pendentes

| Risco | Impacto | Mitigação / gate | Estado |
|---|---|---|---|
| R-01 OMP nativo/enforcement | release sem discovery/retorno/isolamento real | T-011/T-012B/T-013B; NATIVE-01–10, CI real | PENDING; bloqueia conclusão |
| R-02 proveniência/autoria React | distribuição usa nove referências autorais novas; artefato adaptado/auxiliar obsoleto excluído por cutover | review/reconciliação somente no escopo do receipt live; recuperação histórica não é aprovação global; não fabricar copyright/licença | PENDING para AC-011/global/catalog/Native; não fabricar copyright/licença |
| R-03 FS/concorrência | escrita externa ou overwrite alheio | decisão `explicit_os_host_tcb` permite iniciar GREEN T-005, mas não aprova host/transação; handles/no-replace/quarentena, review independente e prova nativa permanecem obrigatórios; POSIX não é equivalente e Git R7 é separado | PENDING |
| R-04 Ship body/config/version/rollback e plano readonly | efeitos externos indevidos, saída declarativa enganosa ou rollback sem autoridade | T-006A/T-006B/T-006C/T-013A/B; preflight/quality/base explícitos, validação real e confirmação terminal | PENDING |
| R-05 supply chain/CI | enforcement ou cobertura de advisories incompleta | T-010B/T-014, escopo explícito e sem alegar zero transitivo | PENDING |
| R-06 Windows | positivos legítimos ainda exigem prova de host e filesystem | T-007/T-014; executável originalmente selecionado exatamente `cmd/git.exe` ou `mingw64/bin/git.exe` (MSYS pode selecionar o segundo), ambos os objetos, assinaturas, hashes, linksets, ACLs, ancestrais e DLLs; sem reescrita de PATH, alias ou substituto; `nlink=1` preservado e unknown fail-closed | PENDING |
| Cache/token RPC | a sessão autenticada pode atualizar estado do OMP | fronteira de aprovação explícita, sessão/overlay temporários, não copiar credenciais | PENDING |
| Campos nativos ausentes | API pode não expor serving/effort/terminal | registrar `actual:null/unverified`; não inventar; aceite dependente permanece aberto | PENDING |
| Provider/auth nativo | pin `openai-codex` nos 12 perfis e autenticação/serving efetivamente observados | T-009A/T-011; PV-012/PV-013; serving não se infere do catálogo, auth histórica não é RED nem retry técnico | PENDING_NATIVE; limites históricos permanecem escopados |
| Peer wire estruturado | decisão `native_structured_clean_cutover`; objeto positivo pode ser parcial; wire textual legado SUPERSEDED; positivo/negativo e controles do consumidor devem ser verificados sem shim e sem converter status | T-009B/T-011; PV-013; malformed corrigido não é evidência negativa; fallback e gate global exigem prova própria | PENDING_NATIVE; `globalAcceptance: PENDING` é estado de procedimento |
| R-07 plano externo readonly | parser, quality/context stale ou diagnóstico podem autorizar uma falsa prontidão | T-003/T-006B/T-006C/T-011; PV-018; rejeição antes de efeitos, `validateShipQuality` obrigatório, sete steps `NOT_EXECUTED`, sem IDs/remote/readiness/publicação | PENDING; AC-021 bloqueia conclusão |

## Verificação final (não executada nesta autoria)

Após todas as correções, o coordenador deve executar uma vez, no snapshot final e
em cópia descartável quando houver escrita: sintaxe/configuração, todos os testes
pertinentes descobertos pela configuração vigente, probes negativos/positivos,
validação CI e avaliação nativa NATIVE-01–10. A cobertura deve usar somente os
probes nativos retidos, `implementation-evidence/native-release/proof-index.json`,
seus probes nomeados e os casos comportamentais atuais; não se restauram testes
incidentais removidos nem se cria oracle textual. Deve registrar cwd, versão,
schema, comandos, exit codes, PASS/FAIL/SKIP, duração, hashes, raw output e
limites. Não repetir uma falha só para confirmá-la, não alterar guards/PATH/nlink
e não usar mock como equivalência nativa. Build/lint são gates posteriores
conforme configuração real; `buildCommand:null` só pode resultar em `build: NA`
com justificativa, nunca PASS implícito. A prova AC-021 deve demonstrar a chamada
real de `validateShipQuality`, rejeição pré-efeito e JSON determinístico; a rota
não autoriza publicação, release terminal ou alegação de 100%.

## Referências

- `spec.md`, `tasks.md` e `contracts/interface-contract.md` desta feature.
- `../../docs/capability-matrix.md`, `../../docs/functional.md` e
  `../../docs/omp-compatibility.md`.
- `.omp/state/tdd/progress.json` e o receipt corrente: autoridade única para
  fase, AC, gates, autorização, receipts e promoção.
- `implementation-evidence/native-release/proof-index.json`: índice público
  versionado de probes retidos, sempre com alcance explícito.
- `implementation-evidence/release-governance/` e
  `implementation-evidence/metrics/retained-observations.json`: ledgers
  versionados; não reescrever após mudança de fonte e não usar como fixture
  Native fora do escopo registrado.
- `.omp/state/**` e URIs `local://`: proveniência privada de decisões/payloads;
  não são distribuídos com este plano nem devem ser seguidos como entrada de
  agente Native. As fontes primárias OMP, Win32, backup, provider, wire async e
  licença React permanecem arquivadas nesses receipts quando necessário.
