# Interface Contract: specs005-omp-compatible-release

> **Versão:** 0.7.0 (**approved amendment; unreleased**)
> **Status:** APPROVED AMENDMENT — UNRELEASED — a implementação, a revisão,
> o validator e os gates são classificados pelo estado live; este contrato não
> altera assinatura pública, wire, schema, modelo ou perfil existente.
> **Aprovação do aditamento 0.6.0:** receipt privado
> `.omp/state/release-47/proofs/contract-0-6-native-wait-user-approval.json`,
> com `contract_amendment: "Aprovo"` e `confirmation: "Aprovo"`. A aprovação
> não é Native PASS, waiver, publicação ou confirmação terminal de release.

> **Aprovação do aditamento 0.7.0:** receipt privado
> `.omp/state/release-47/proofs/contract-0-7-native09-backend-user-approval.json`,
> com `contract_amendment: "approve_scoped_native09_backend_completion_0_7"` e
> `confirmation: "Aprovado"`. O escopo é privado e delimitado; não é aprovação
> semântica do reparo, Native PASS, waiver, publicação ou confirmação de release.
> **Spec:** [../spec.md](../spec.md)
> **Baseline:** [`local://ship-current-snapshot.json`](local://ship-current-snapshot.json)
> **Runtime alvo:** OMP **18.18.6**, Windows 10.0.26200 x64
> **Issue:** #47
> **Branch ativa:** `feat/47-omp-compatible-release`
> **Governança de estado:** fase, autorização, revisão, gates, contagens e
> promoção são lidos exclusivamente de `.omp/state/tdd/progress.json` e do
> receipt corrente que ele referencia. Este contrato não duplica orçamento,
> tentativa, hash de candidato ou estado operacional.
> **Resumo histórico (as-of 2026-11-15):** janelas Native bounded,
> autorizações canceladas, diagnósticos source-only e ledgers de plataforma
> anteriores à mudança pública da fonte são snapshots históricos escopados.
> Eles não promovem Native, E2E, segurança, gate ou release; mudança de fonte,
> contexto, ambiente ou independência reabre as provas dependentes.
> **Proveniência:** receipts `.omp/state/**` e URIs `local://` são privados,
> não distribuídos nem entradas de fixtures Native. Payloads e hashes exatos
> permanecem nos receipts/ledgers versionados. A base `0.5.0` recebe somente
> as extensões privadas de evidência `0.6.0` e `0.7.0`; não há alteração de
> assinatura, wire, schema, modelo, perfil, API pública, CLI ou protocolo de
> peer.



## Escopo

Este contrato define a fronteira de compatibilidade e evidência da release
`specs005-omp-compatible-release`: caller/alignment/architecture, TDD state e
execution, quality/CLI/Retro, revisão, instalador/hooks, Ship e o wire nativo OMP.
Ele dirige implementação e validação posteriores; não afirma que os cenários nativos
já foram executados.

O contrato preserva as APIs e consumidores existentes (`state.mjs`,
`execution.mjs`, `quality.mjs`, `bin/quality.mjs`, `aggregateReview`,
`aggregateReviewInstances`, `triageRetro`, `validateRetro`, `install.mjs`, hooks e
Ship). Não cria scheduler, launcher, broker, serviço, SDK, alias global, modelo por
chamada ou transporte alternativo. Alteração de assinatura/campo exige atualização
simultânea dos callers e revisão de contrato; shim/alias obsoleto não é permitido.

### Aditamento final de decisões e limites

As quatro decisões exatas do usuário são:

- `external_dry_route: authorize_readonly_ship_plan`: a rota pública Ship de
  plano externo é somente leitura, valida quality/context e não autoriza
  Git/GitHub/rede, subprocessos, escrita, publicação ou deploy.
- `native_observer_window`: qualquer avaliação Native depende exclusivamente da
  autorização e do receipt live; janelas bounded, cancelamentos e falhas
  anteriores são históricos e não autorizam retry nem revogam autorização live.
- `provider_observability: accept_explicit_unobserved_limits`: serving físico e
  fallback de provider ficam `NOT OBSERVED` até evidência específica, sem trocar
  os doze perfis; retry técnico genuíno do NATIVE-09 continua obrigatório.
- `t009c_baseline: authorize_auditable_current_checkpoint`: o RED original
  indisponível é histórico `BLOCKED`; checkpoint imutável da implementação
  existente pode documentar o mesmo AC-014, sem inventar RED, apagar cronologia
  ou declarar gate concluído.

O aditamento `0.6.0` permanece não lançado. Ele é uma correção aditiva de
compatibilidade para o terminal `wait` documentado no SDK, sem aprovação
terminal da release nem alegação de cobertura integral de 100%.

### Aditamento 0.7.0 — contrato privado de completion backend NATIVE-09

Este aditamento é aditivo e não lançado. Ele não altera o wire OMP, o SDK,
APIs públicas, settings, modelos, perfis, flags, caller override, CLI, AC,
tarefas ou estados.
O registro interno usa o kind tipado
`source_kind: "native09-backend-repair-write"`; esse kind é evidência privada,
não um campo novo de SDK/wire.

O registro só é admissível quando todos os predicados seguintes forem
observados e permanecerem ligados ao Root:

| Predicado privado | Requisito |
|---|---|
| Job Root | job aprovado pelo Root com `status: "completed"` real; isso encerra o framework, não o veredito semântico |
| Criança | identidade opaca e binding único pelo tuple completo `root_session_id`, `parent_tool_call_id`, `allocated_id`, `index`, `root_task_end_is_error:false`, `agent`, `agentSource`, assignment, `job_id` e `instance_id`, com correlação forte/única |
| Write END | exatamente um `write END` aprovado, com `isError: false` explicitamente observado e `path` igual ao caminho exato permitido/aprovado pelo Root |
| Sujeito | `actual` comprova mudança do sujeito pretendido por bytes/hash antes/depois |
| Dependências | bytes/hash e identidade das dependências protegidas permanecem inalterados |

Identidade, path e correlação não podem ser derivados da criança, do texto ou
do conteúdo: permanecem Root-bound. Rebind, stale, foreign, duplicata,
ambiguidade, caminho divergente, write END ausente/extra ou dependência
desconhecida bloqueiam. Todos os flags raw da criança são preservados; os não
expostos permanecem `null`/desconhecidos com `*_observed:false`. Não se infere
`exitCode: 0`, `isError:false`, `aborted:false`, sucesso ou completion do filho.

A coleção privada pode incluir dispatch de peer independente e de segundo
validator, cada um com identidade/correlação própria. Essa coleção não é
aprovação semântica e não promove Native. `Task framework completed` é
distinto de `validator semantic PASS`: o primeiro só significa que o
framework terminou. O primeiro `FALHOU` do validator é legítimo quando
correlacionado a um CLI real com código não zero; o relatório e todos os flags
raw permanecem preservados e não passam testes. Semantic repair approval e
NATIVE-09 PASS exigem peer independente e segundo validator com `PASSOU` real,
correlação válida e gates atuais.

Perfis existentes `structured:true` continuam exigindo schema válido. A única
exceção é esta prova do perfil `backend-developer` para NATIVE-09, limitada ao
kind privado e sem aceitação geral de perfil indisponível. As regras existentes
para `validator` e `spec-kit-author` permanecem inalteradas; apenas se esclarece
que relatório negativo do validator, mesmo em task `completed`, não é PASS dos
testes.

Contadores e falhas Native anteriores permanecem históricos, não live; os
rótulos iniciais `PENDING` das tabelas de tarefas não mudam. A ordem canônica
de pré-publicação, CI e release (T-013A → T-013B, seguida dos gates reais)
permanece inalterada. Não há bump de versão do pacote.
## Evidência histórica e limites de aceitação

O contrato preserva uma única nota histórica datada (as-of 2026-11-15):
capturas Native bounded, autorizações canceladas, diagnósticos source-only,
reviews delimitadas e ledgers de suíte anteriores à mudança pública da fonte
permanecem em receipts privados/ledgers versionados. São proveniência escopada,
não autorização, status live, fixture distribuída ou prova integrada.

O checkpoint atual de T-009A é uma verificação imutável de código existente no
AC-012, com escopo exato de 13 componentes Native documentados. Ele não é o RED
ou TDD original, não fecha AC-012, não prova serving físico/provider fallback e
não é prova global de AC-019. O checkpoint de T-009C mantém o RED original
indisponível como histórico `BLOCKED` e não fecha AC-014.

O helper LAB de alinhamento, quando permitido pelo receipt live, é mecanismo
privado de fixture descartável baseado na API existente de transação; não é API
pública, skill, perfil, modelo, runtime ou prova Native. `explicit_os_host_tcb`
não se torna confiança global do SO nem herança de confiança Git.

Serving físico e fallback de provider continuam `NOT OBSERVED` até prova
específica; uma observação de catálogo, peer parcial, helper, yield,
`actual:null` ou diagnóstico source-only não é PASS. NATIVE-09 exige retry
técnico genuíno separado de fallback; NATIVE-10 exige pacote integrado aceito.

### Identidade e versões

- A versão-alvo OMP é **v18.18.6**. Fonte/tag, binário/instalação,
  `git_revision`, digest de inventário, `qualityContextDigest`, digest de
  ambiente e observação Native são identidades distintas; nenhuma substitui
  outra ou prova serving isoladamente. Toda prova registra fonte, configuração,
  revisão, saída e limitações no receipt correspondente.
- A entrega é Ship `external → main`. A branch ativa não é resetada, stashada
  ou limpa; intake de issue e rename/associação ocorre depois da aprovação do
  plano/contrato e antes da primeira implementação. PR, auto-merge e release
  só ocorrem no gate final; release terminal exige confirmação explícita.

## Decisões de compatibilidade e supersessão

| Decisão | Norma de specs005 | Estado |
|---|---|---|
| Seleção OMP | caller carrega skill e delega por task/yield nativos; somente schema exposto em v18.18.6 | aprovado para execução; prova nativa pendente |
| Skills/perfis | exatamente 10 skills e 12 perfis; cópias locais project devem vencer nove perfis user stale | requisito; NATIVE-01 pendente |
| Batch/flat | batch apenas se habilitado; flat equivalente quando ausente; `solutionSpace` é obrigatório no schema atual | requisito; NATIVE-03 pendente |
| Modelos | `model`/`thinkingLevel` somente nos perfis geridos, com o mapa `openai-codex/` abaixo; sem `model` no wire task, launcher, herança Root ou alias global | requisito de configuração; resolução/serving pendente |
| Structured | `structured:true` é opt-in somente nos cinco perfis registrados no mapa; perfil pode exigir yield/schema; não enviar `task.structured` global | requisito; NATIVE-05 pendente |
| Retornos | job/spawn não é conclusão; recolher terminal por instância; peer TDD estruturado `TDD_PEER_REVIEW` e deep-review incremental são protocolos distintos | requisito; NATIVE-04–06 pendente |
| Estado | progress schema 2.3, APIs existentes, retries cap3, review/validator/integration atuais | compatibilidade a preservar |
| Segurança FS | helper host-anchored por handles ou bundle nativo são candidatos; pathname/re-stat/ACL isolado não é solução aprovada | PENDING/BLOCKED até prova e crítica |
| Backup multiplataforma | `performBackup` preserva API, identidade bigint, colisão e quiescência; Windows exige EXLOCK/TEMPORARY sem fallback pathname; Linux exige staging FD-bound e publicação atômica no-replace | exigir RED e prova independente antes do fechamento |
| Ship plan readonly | `ship plan` aceita target solicitado, valida quality/context reais e retorna plano externo declarativo; não executa efeitos | requisito AC-021/T-006C; readiness e release permanecem distintos |
| Proveniência/autoria React | nove referências devem ser autorais, baseadas em fontes primárias e sem determinação jurídica inventada; artefato adaptado obsoleto é removido por cutover | AC-011 global/catalog/Native/legalidade exigem provas próprias |

### Decisão de provider e mapa canônico (0.4.0)

O usuário escolheu explicitamente `pin_openai_codex` em
`local://ship-model-provider-approval.json`. O cutover é limitado aos candidatos
de modelo dos 12 perfis geridos: somente o prefixo `openai/` muda para
`openai-codex/`. Os IDs exatos, principal/fallback, `thinkingLevel`/esforço,
output/schema e os cinco `structured:true` permanecem inalterados.

| Perfil gerido | Principal | Fallback | thinkingLevel/effort | structured |
|---|---|---|---|---|
| `spec-kit-author` | `openai-codex/gpt-6.1-sol` | `openai-codex/gpt-6-astra` | `high` | não |
| `test-author` | `openai-codex/gpt-6.1-terra` | `openai-codex/gpt-6.1-sol` | `high` | não |
| `backend-developer` | `openai-codex/gpt-6.1-terra` | `openai-codex/gpt-6.1-sol` | `medium` | não |
| `frontend-developer` | `openai-codex/gpt-6.1-terra` | `openai-codex/gpt-6.1-sol` | `medium` | não |
| `refactorer` | `openai-codex/gpt-6.1-terra` | `openai-codex/gpt-6.1-sol` | `high` | não |
| `integrator` | `openai-codex/gpt-6.1-terra` | `openai-codex/gpt-6.1-sol` | `high` | não |
| `validator` | `openai-codex/gpt-6.1-sol` | `openai-codex/gpt-6-astra` | `high` | não |
| `peer-reviewer` | `openai-codex/gpt-6.1-sol` | `openai-codex/gpt-6-astra` | `high` | sim |
| `deep-reviewer` | `openai-codex/gpt-6.1-sol` | `openai-codex/gpt-6-astra` | `high` | sim |
| `requirements-reader` | `openai-codex/gpt-6.1-sol` | `openai-codex/gpt-6-astra` | `high` | sim |
| `architect` | `openai-codex/gpt-6-astra` | `openai-codex/gpt-6.1-sol` | `high` | sim |
| `host-operator` | `openai-codex/gpt-6-astra` | `openai-codex/gpt-6.1-sol` | `high` | sim |

Os cinco perfis estruturados são `requirements-reader`, `architect`,
`host-operator`, `deep-reviewer` e `peer-reviewer`. Não se usa `inheritRoot`/herda `Root`, não se
altera configuração/alias global, não se usa override por chamada e não se
copiam credenciais. O catálogo observado com 75 entradas contém os três IDs sob
`openai-codex`, mas registro de catálogo não é prova de serving.

A validação só pode fechar após o cutover completo dos 12 callers/documentos de
perfil e a comparação dos bytes exatos dos 12 perfis nativos, com hashes
origem→cópia e antes/depois. A única diferença autorizada nos bytes de
configuração é o prefixo de provider.

O diagnóstico privado de autenticação é uma observação **HISTÓRICA**: falha
HTTP 401 não é RED de schema nem retry técnico. Serving efetivo e fallback de
deep-review permanecem `NOT OBSERVED`; saída malformed corrigida pelo agente
não conta como rejeição nativa. Os gates completos são decididos pelo receipt
live.

Windows TCB 0.2, backup Linux 0.3, a recuperação histórica de R-02 e o
catálogo 10/12/42/18 permanecem documentados com escopo. Qualquer assembly
bounded de R-02/proveniência é somente scoped e não fecha AC-011 global,
catalog/Native ou legalidade; esta decisão não reescreve a história de
`specs004`.

### Decisão material 0.5.0: wire peer TDD estruturado

`local://ship-peer-wire-approval.json` aprova
`native_structured_clean_cutover`. O yield nativo canônico do TDD normal é
estruturado e usa este contrato:

```json
{
  "protocol_mode": "TDD_PEER_REVIEW",
  "agent": "peer-reviewer",
  "status": "APROVADO",
  "reviewed_revision": "<revisão atual>",
  "explanation": "<explicação>",
  "confidence": 0.99,
  "overall_correctness": "correct",
  "findings": []
}
```

`status` é `APROVADO` ou `BLOQUEADO` conforme o resultado real; não é
normalizado para `VALID`. `reviewed_revision`, `explanation`, `confidence`,
`overall_correctness` e `findings` preservam o schema atual do frontmatter. A
forma de cada finding permanece inalterada (`title`, `body`, `priority`,
`confidence`, `file_path`, `line_start`, `line_end`), assim como tipos e
restrições já expostos.

`validateReviewerResult(result, expected)` mantém assinatura, envelope e
fail-closed existentes. `expected` é **REQUIRED**, independente, com a forma
`{agent, protocol_mode, reviewed_revision}`. Não existe argumento omitido,
default TDD, inferência ou derivação de qualquer chave a partir do
resultado/candidato nativo. Somente o ramo
`expected.protocol_mode === "TDD_PEER_REVIEW"` com agente esperado
`peer-reviewer` aceita `APROVADO`/`BLOQUEADO`; a validação de
chaves/revisão/findings permanece. Os modos `DEEP_REVIEW` e
`DEEP_REVIEW_FALLBACK` continuam com `VALID` incremental, e
`aggregateReview`/`aggregateReviewInstances` exigem o par deep e rejeitam dados
TDD normais.

Não há primeira linha textual, adaptador/shim oculto, conversão textual,
módulo novo, scheduler ou desativação dos cinco perfis estruturados. A rota
textual legada é **SUPERSEDED**, não comprovada nem PASS. A prova
`local://ship-native-peer-codex-positive.json` é somente positiva e parcial
(`APROVADO`, `openai-codex/gpt-6.1-sol`, `globalAcceptance: PENDING`); há
observação negativa nativa delimitada e controles do consumidor, mas saída
malformed corrigida não é evidência negativa; malformed, fallback e os gates
nativos permanecem pendentes.

### Ownership interno T-007 — fixtures de upgrade/CAS

Os `allowed_write_globs` de T-007 incluem `scripts/fixtures/hooks-v040/**`
somente como testdata de autoria do test-author. As fixtures devem preservar os
bytes exatos dos hooks v0.4.0 de
`audit/release-v040/scripts/hooks/{commit-msg.mjs,pre-push.mjs}`, com proveniência
em `local://ship-released-hook-payloads-v040.json`, em vez de pré-imagens com
sufixos de fonte modificada que `isManaged` recusa antes da injeção de falhas.
É ajuste interno de ownership/globs: a base do contrato permanece 0.5.0 e o
aditamento privado 0.6.0 não cria API, AC, alteração de wire, premissa ou
promoção de gates.

### Lock editorial T-010A

O lock de escrita cobre exatamente `tdd-orchestrator/references/react/async-dependencies.md`, `tdd-orchestrator/references/react/async-parallel.md`, `tdd-orchestrator/references/react/bundle-defer-third-party.md`, `tdd-orchestrator/references/react/bundle-dynamic-imports.md`, `tdd-orchestrator/references/react/client-swr-dedup.md`, `tdd-orchestrator/references/react/rerender-derived-state-no-effect.md`, `tdd-orchestrator/references/react/server-auth-actions.md`, `tdd-orchestrator/references/react/server-cache-react.md` e `tdd-orchestrator/references/react/server-parallel-fetching.md`, além dos artefatos de proveniência e catálogo atribuídos a T-010A. A substituição é documental; não cria API, não muda a base 0.5.0 nem o aditamento privado 0.6.0, seus estados ou seus critérios de aceite. A evidência `local://ship-license-primary-evidence.json` registra inventário sem nomes `LICENSE`/`NOTICE`/`COPYING` e três blobs consultados (`README.md`, `SKILL.md`, `metadata.json`) sem aviso copyright fornecido; não se generaliza essa observação para conteúdo não consultado.

A norma nova substitui somente a decisão de prontidão/compatibilidade de
`specs004` In Review. Não apaga seus fatos, hashes, APIs, falhas ou propostas
superadas. Batch obrigatório vira condicional, `COVERED` deixa de ser conclusão e
OMP 18.18.6 substitui versões históricas somente para a prova futura.

## Tipos de critério e estados de prova

```ts
type Hash = string;
type EvidenceLevel = "ESTÁTICA" | "EXECUTADA" | "HISTÓRICA" | "NÃO VERIFICADA";
type ProofStatus = "PENDING" | "PASS" | "FAIL" | "BLOCKED" | "NA";
```

`normative` exige revisão semântica independente, fonte/proveniência e decisão;
`behavioral` exige asserção real/smoke/execução pertinente e suíte final. Uma
fixture/mocked Git, `ok:true`, `VALID`, frontmatter ou texto autodeclarado não
promove qualquer estado nativo.

Emenda delimitada Review09-01 do plano de produção Windows/Linux: no estado
persistido, uma tarefa pode conter um ou vários ACs, desde que todos sejam
explicitamente `type: normative` e cada AC tenha sua entrada NA exata com razão,
`validator: "spec-kit-validator"`, evidência e referência ao token exato do
próprio AC. A extensão substitui o limite anterior `acceptance.length === 1`;
não mistura AC normativo e behavioral em uma tarefa nem dispensa review/gates.
NATIVE-09 continua podendo estar `PENDING` durante execução e bloqueia a
conclusão sem mecanismo seguro ou decisão expressa. R-02 e proveniência devem
ser classificados pelo receipt live; qualquer recuperação contrato 0.2/no-SHA
é histórica e não afirma legalidade, discovery, instalação, runtime Native ou
release global.

## Envelope de prova interno (não é wire OMP)

Este objeto é um ledger do caller/validator, não um campo a ser enviado ao OMP.
Campos ausentes na execução real permanecem ausentes ou `null`; não se fabricam
metadados.

```json
{
  "proof_id": "PV-012",
  "criterion": {"id": "AC-012", "type": "behavioral"},
  "audit_ids": ["NATIVE-01"],
  "task_id": "T-011",
  "level": "EXECUTADA",
  "status": "PENDING",
  "source": {"path": "<arquivo-ou-fonte-fixada>", "sha256": "<64-hex>"},
  "revision": {"kind": "git|inventory|quality|native", "value": "<identidade>"},
  "environment": {"omp": "18.18.6", "platform": "win32"},
  "command_or_call": "<comando/chamada completa>",
  "raw_output": "<saída não editada ou referência segura>",
  "expected": "<resultado exigido>",
  "actual": null,
  "owner": "<agente>",
  "limitations": ["<limite explícito>"]
}
```

`status: PASS` só é permitido após a prova correspondente e barreira
independente; esta autoria não produz nenhum PASS nativo.

## Estado TDD e promoção

### Invariantes públicas

- `progress.schema_version` é `2.3`; objetos são fechados, sem campos paralelos
  silenciosos. `validateProgress`, `migrateProgress` e `canPromoteWave` continuam
  consumidores públicos.
- IDs de tarefa e números de onda são únicos; dependências existem, são acíclicas
  e apontam para predecessores atuais. `TEST_REF` possui um único `::`, caminho
  relativo seguro e título literal (inclusive espaços e `:` isolado); drive,
  absoluto, traversal, CR/LF, partes vazias e segundo `::` falham.
- Migração 2.1/2.2 aceita somente aliases documentados, preserva evidência válida,
  não deriva baseline quando uma baseline fornecida é inválida e reabre apenas
  etapas sem prova. Nenhum trim altera o nome literal do teste.
- `DONE` de uma tarefa continua sendo a prova da própria tarefa e pode ocorrer
  antes da integração, conforme o state existente. `DONE` não autoriza promoção
  da onda/feature: `canPromoteWave`/`completed` exige integração, peer-review
  independente e validator/gates atuais; sem essas provas, a onda reabre
  `integrating` preservando diagnóstico.
- `RUNNING` sem job/processo/dono observável, retorno desconhecido/duplicado/
  ausente/stale ou capacidade incerta bloqueia; frentes independentes podem
  continuar sem liberar o recurso do escritor não terminal.
- O cap de três tentativas preserva identidade, histórico, run e tarefa. Fallback
  de modelo nativo e o cutover de provider não são retry técnico TDD; retry
  técnico exige FAIL terminal elegível e nova instância/job com a mesma tarefa/run.
  HTTP 401 de autenticação não autoriza retry técnico nem escalada de modelo.

### Chamada de promoção (caller → state)

O consumidor público é a chamada existente:

```js
canPromoteWave(wave, { acceptanceCriteria })
```

`wave` é o objeto de estado já validado; a decisão lê as estruturas de
`review`/`validation`/integração que o próprio state mantém. `acceptanceCriteria`
contém somente os critérios da tarefa/onda que a chamada está avaliando. Este
contrato não cria um wrapper `integration`/`validator`, não passa `revision`,
`evidence` ou gates novos à API e não altera a assinatura pública. O ledger de
provas é externo ao state.

Exemplo conceitual de segundo argumento, sem afirmar resultado atual:

```json
{
  "acceptanceCriteria": [
    {"id": "AC-002", "type": "behavioral", "status": "IMPLEMENTED"}
  ]
}
```

`canPromoteWave` rejeita critérios incompletos e estados `review`/`validation`/
integração ausentes ou stale conforme o schema existente; uma onda não é
promovida por `evaluateExecution`, que continua puro e não persiste progresso.

## Execução e recursos

As APIs síncronas e determinísticas existentes permanecem:

```ts
staticExecutionDigest(progress, plan): Hash;
validateExecutionPlan(progress, plan, context): Validation<PlanView>;
evaluateExecution(progress, plan, returns, context): Validation<ExecutionView>;
```

Regras normativas:

- plano cobre uma onda e liga `run_id`, wave, revision, static digest, tarefas,
  dependências, owners e recursos; projection não inclui `updated_at`, status ou
  resultados mutáveis;
- recursos são paths absolutos canônicos da plataforma, dentro de `allowedRoots`,
  com access `read|write`, aliases/case/pai-filho/cache/output/state observados;
- tentativa escritora não terminal conserva lock até prova confiável de término;
  `UNKNOWN` não é prova de disponibilidade;
- `/` POSIX e `C:/` Windows são raízes válidas com fronteira de segmento; traversal,
  drive indevido, alias e separador ambíguo falham;
- retorno deve corresponder exatamente a job/owner/instância/revision/staticDigest;
  faltante, duplicado, desconhecido e stale são erros e mantêm `complete:false`;
- recursos conflitantes serializam sem isolamento comprovado; independentes podem
  paralelizar dentro da capacidade observada; não há teto arbitrário nem fila nova.

### Response de execução

```json
{
  "ok": false,
  "errors": [{"code": "E_JOB|E_RETURN_MISSING|E_RETURN_STALE|E_RESOURCE", "message": "<diagnóstico>"}],
  "value": {
    "ready": [],
    "running": [],
    "completed": [],
    "blocked": [{"taskId": "<id>", "codes": ["E_JOB"]}],
    "complete": false
  }
}
```

`value` pode ser `null` para falha estrutural. `ok:true` não significa autorização,
promoção, review ou release.

## Filesystem, instalador e snapshots

### Paths e identidade

- Paths de produto são relativos canônicos, confinados à raiz real e rejeitam
  absoluto, drive, traversal, alias de caixa, separador inválido, junction, symlink,
  hardlink, especial e conteúdo externo; `.omp`/evidência só entram quando a
  política os permite explicitamente.
- Antes de cada uso, o caller vincula identidade do pai/destino (tipo, volume,
  file ID/handle, tamanho/hash conforme plataforma) e revalida no gate. Um segundo
  `lstat` não é atomicidade nem congelamento global.
- `install.mjs` mantém preflight total, staging, backup, CAS, rollback seletivo e
  inventário final. Arquivo “equal” no planejamento também é revalidado antes do
  sucesso. Erro de hash/ENOENT/EACCES vira drift acionável e não continua efeitos.

### Fronteira Windows e premissa de bootstrap autorizada

A referência primária de contratos é
[`local://ship-win32-primitives-docs.json`](local://ship-win32-primitives-docs.json).
Ela registra que `NtCreateFile` aceita `OBJECT_ATTRIBUTES.RootDirectory` para
abertura relativa e que `FILE_RENAME_INFO` expõe `RootDirectory` e
`ReplaceIfExists=false`, cuja colisão deve falhar. Isso é contrato de API, não prova
do host, ACL, arquitetura ou carga; snippet de ABI gerado por consulta não pode
ser usado sem confronto com headers/arquitetura.

A decisão material completa está em
[`local://ship-windows-tcb-approval.json`](local://ship-windows-tcb-approval.json).
A revisão precedente `agent://NativeAdmissionReview` trata TCB explícito como
pré-requisito, não como prova ACL.

Ela autoriza, somente como premissa de bootstrap para o instalador de T-005 e
para inspeção de metadata/operações filesystem dos hooks em T-007, o host exato
Windows PowerShell 5.1 sob `System32`, derivado dos módulos do sistema
operacional já carregados e de contexto protegido do OS. Essa premissa não
autoriza sibling algum, não é prova de ACL ou assinatura antes da execução do
host e não cria confiança retroativa na filha.

O bootstrap autorizado exige `NoProfile`, `NonInteractive`, `cwd` protegido do
OS e ambiente scrubbed por allowlist, sem perfis, injeções, `PATH` herdado ou
`ComSpec` alternativo, e sem bypass. `FullLanguage` em x64 deve ser detectado;
qualquer ausência, divergência ou modo incompatível falha fechado.

Mesmo sob essa premissa, a transação inteira deve permanecer ancorada no host:
pin de handles/ancestrais, identidade revalidada, cópia/quarentena, publicação
no-replace e rollback pelos mesmos handles. O helper não pode retornar um
pathname “seguro” para Node reabrir e escrever depois. O bootstrap restrito pode
ser reutilizado em T-007 somente para inspecionar metadata e operações
filesystem dos hooks; T-007 nunca admite Git por herança da confiança TCB.
Git R7 mantém seus próprios guards, identidade, quatro hooks, standalone,
linked-worktree e LFS. O executável originalmente selecionado pode ser exatamente
`C:\Program Files\Git\cmd\git.exe` ou
`C:\Program Files\Git\mingw64\bin\git.exe`; a seleção do segundo pelo shell MSYS é
legítima. Em ambos os papéis, os dois objetos (`cmd/git.exe` e
`mingw64/bin/git.exe`), assinaturas, hashes, linksets, ACLs, ancestrais e
fechamento de DLLs permanecem obrigatórios. A guard de produção atual AP está
vinculada ao SHA-256 `8514e2befd545d4ad12550234713c528966d5768c6baecdf41f9c227775649dc`;
o hash `acb88119b0a093afae62525f5ecc1ad65dccf7927318f4fd462aa10ef0a2d084` é
evidência histórica, não binding atual. Não se reescreve PATH, não se busca após
recusa, não se admite alias executável, Git substituto ou novo objeto confiável;
o legado `nlink=1` é preservado. Qualquer guard desconhecido falha fechado;
`E_UNSAFE_GIT_EXECUTABLE` é terminal para a rota dependente. O wrapper nativo e
as consultas reais do executável, incluindo refs por stdin, passaram no escopo
delimitado; a alteração mais recente ainda não tem revisão independente final.

Os seis `PASS` de `local://ship-native-fs-memory-final-result.json` são apenas
PASS da primitive em laboratório; não aprovam código de host, uma transação
inexistente ou integração. Com estas decisões registradas, T-005 pode iniciar
GREEN de implementação; a conclusão ainda exige revisão independente da
implementação e prova nativa. O contrato não extrapola esta premissa para POSIX
nem afirma equivalência de host não comprovada.

### Backup

`performBackup` mantém a assinatura e os campos públicos existentes. Deve abrir a
origem identificada, comparar a identidade bigint do descriptor com a captura,
manter a quiescência exigida, rejeitar troca entre inspeção e uso e publicar
somente os bytes correspondentes. Colisão, identidade da origem e ausência de
alegação de consistência de banco/WAL permanecem obrigatórias; copiar banco ativo
não vira snapshot transacional por texto.

A decisão do usuário em `local://ship-backup-platform-approval.json` é
`backup_platform_decision: "siga sua recomendação"` e fixa
`linux_python_tcb: "authorized_os_python3_isolated"`. No Windows, o staging usa
Node/libuv `EXLOCK|TEMPORARY` mantido até o link/publicação; não existe fallback
Node de `unlink` ou `rename` por pathname. A observação de Node `22.23.2`/uv
`1.51` em `local://audit-check-ship-libuv-backup-primitive.json` é somente
primitive LAB; a sonda de ancestral não aprova produção.

No Linux, staging deve ser anônimo, vinculado ao file descriptor, e a publicação
deve ser atômica sem substituição. O único runtime auxiliar autorizado é Python3
fornecido pelo OS em `-I/-S`, contexto de carregamento protegido e allowlist
scrubbed sem `PATH`, `PYTHONPATH`, `PYTHONHOME` ou `LD_*`; não instalar
componentes, alterar settings, criar serviço ou usar SDK. Capacidade ausente ou
divergente de host, kernel ou filesystem falha fechado; não há confiança em
sibling nem fallback POSIX conhecidamente inseguro. Não se declara compatibilidade
geral POSIX/macOS: prova Linux real é requisito antes do release.

Publisher/helper privado pode ficar sob `ship/bin/` se necessário. O pipeline de
bytes, herança de descriptor e DTO terminal vinculado a nonce são internos, não
fazem parte do wire OMP e não criam campos públicos.
A captura histórica imutável Node/libuv é somente LAB e inválida como prova de
produção; ela não substitui a implementação bounded, o consumidor real de
quality/delivery, o validator, a prova Linux ou os gates de AC-006, nem invalida
automaticamente uma prova corrente reconhecida pelo receipt live. A fase, o status
e a promoção live de T-006A vêm exclusivamente de `.omp/state/tdd/progress.json`
e do receipt corrente.

## Quality, receipts e CLI

### APIs preservadas

```ts
captureInventory(root): { files: Record<string, string>, digest: Hash };
qualityContextDigest(report): Hash;
validateQuality(root, report, {
  stage?: "planning" | "delivery",
  expectedContextDigest?: Hash
}): { ok: boolean, errors: string[] };
validateShipQuality(root, {
  reportPath?: string,
  required?: boolean,
  contextPath?: string
}): { ok: boolean, errors: string[], report: object | null, legacy: boolean, proofDigest?: string | null };
```

`qualityContextDigest` é pura: não lê fontes, grava ou executa conteúdo. O report
inclui baseline/revision, context integral, critérios tipados, environment,
instructions, changes, docs, security/findings e identidades de review. Cada
mudança relevante aparece uma vez e é classificada `functional|none` com motivo.

`delivery` exige `expectedContextDigest` atual de fonte independente; ausência,
formato inválido ou divergência bloqueiam. `planning` registra contexto/plano sem
exigir revisão final. `capture/check` só lê paths seguros, emite JSON e usa exit
0/1; `capture <root> <extra-vazio>` é aridade inválida.

### Receipts e grafo de origem

`review.evidence` e `check.evidence` referem receipts JSON regulares e hashados;
eles apontam ao **retorno original** por `source.path`/`source.sha256`. O
quality-context, report ou receipt não pode ser substituído como source original,
nem formar ciclo/autorreferência. O caller revalida report/context/receipt no mesmo
instante disponível, sem prometer snapshot universal do filesystem.

```json
{
  "revision": "<inventory digest>",
  "context_digest": "<qualityContextDigest aprovado>",
  "source": {"path": ".omp/state/run/original.json", "sha256": "<hash real>"}
}
```

Uma fonte inexistente, adulterada, insegura ou com `source` igual ao contexto/report
bloqueia. Hash vincula bytes; não autentica pessoa, independência, scanner ou
correção semântica.

## Rota pública Ship somente leitura (AC-021 / T-006C)

Esta é uma adição pública nova e isolada; comandos Ship existentes, assinaturas,
wire, schemas, modelos e perfis não mudam. A implementação pertence a
`ship/bin/ship.mjs`, a prova permanente a `scripts/ship-plan.test.mjs` e os
documentos públicos Ship ficam sob ownership de Main.

### Request/CLI

```text
node ship/bin/ship.mjs plan --root <workspace> --target <branch> [--report <relative>] [--context <relative>]
```

- `--root` é opcional e, quando omitido, usa o cwd; `--target` é obrigatório e
  deve ser uma string não vazia.
- `--report` e `--context` são opcionais e relativos ao workspace; os defaults
  são `.omp/state/quality.json` e `.omp/state/quality-context.json`.
- Cada flag ocorre no máximo uma vez. Flag desconhecida, argumento posicional,
  flag sem valor, valor ausente ou valor que seja a próxima flag falha antes de
  qualquer efeito.
- A rota `plan` bypassa somente o `git rev-parse` top-level existente; os demais
  comandos permanecem inalterados. Não há chamada Git/GitHub, rede,
  subprocesso, escrita de filesystem ou publicação, inclusive nos erros de
  argumentos e quando o root não é um workspace válido. Leituras necessárias
  aos artefatos de prova só ocorrem após o parse aceito e permanecem
  read-at-use.

### Validação e prova de qualidade

O caller deve invocar a implementação real, sem alias ou engine paralela:

```js
validateShipQuality(workspace, {
  required: true,
  reportPath,
  contextPath
});
```

Report e context devem existir nos paths relativos resolvidos, manter hash e
proveniência válidos e ser revalidados no uso. Ausência de report/context,
prova legada, stale, ciclo, source adulterado ou erro de validação não pode
virar PASS; não existe fallback de report ausente.

### Response de sucesso

O único stdout de sucesso é um JSON válido com esta forma e ordem de steps:

```json
{
  "schema_version": 1,
  "mode": "external",
  "dry_run": true,
  "status": "PLANNED",
  "merge_target": "<target solicitado>",
  "quality": {
    "status": "PASS",
    "legacy": false
  },
  "steps": [
    {"step": "issue", "status": "NOT_EXECUTED"},
    {"step": "branch", "status": "NOT_EXECUTED"},
    {"step": "commit", "status": "NOT_EXECUTED"},
    {"step": "push", "status": "NOT_EXECUTED"},
    {"step": "pull_request", "status": "NOT_EXECUTED"},
    {"step": "ci", "status": "NOT_EXECUTED"},
    {"step": "release", "status": "NOT_EXECUTED"}
  ]
}
```

`merge_target` é exatamente o target solicitado, não uma resolução de default.
`PLANNED` é declaração de intenção, não prova de branch, remoto, readiness ou
existência de issue/PR/CI/release. A resposta não fabrica SHA, IDs de issue/PR,
release ou serving e não inclui plano de deploy.

### Erros e invariantes observáveis

Argumentos inválidos, root inválido, report/context ausentes ou stale e qualquer
erro real terminam com código diferente de zero, diagnóstico sanitizado e sem
resposta `PLANNED`. O erro nunca declara `quality.status: PASS`; nenhum efeito
externo é permitido antes ou depois da rejeição. A prova desta rota é `PV-018`
e permanece `PENDING` até teste permanente, review independente e validator.
### Estado da implementação documentado

O status live de T-006C, T-004, T-008 e dos gates não é duplicado aqui:
consulte `progress.json` e o receipt corrente. Capturas RED/GREEN, reviews
bounded e preflight source-only anteriores são históricos e permanecem
escopados; não são `DONE`, Native, segurança/global ou release.

O contrato da rota permanece normativo: parser estrito e validação real de
quality/context; sucesso somente `PLANNED` readonly com steps
`NOT_EXECUTED`. A rota não confirma readiness, remoto, IDs, publicação ou
release. A exigência RED/prova de AC-021 pode permanecer como proveniência
histórica, mas qualquer fechamento depende de prova independente atual.

## Wire OMP nativo

### Descoberta e instalação

A prova local prepara, em projeto descartável e sem links, os dez diretórios de
skill e os doze perfis nos destinos project. A lista dos doze é:
`requirements-reader`, `architect`, `host-operator`, `deep-reviewer`,
`spec-kit-author`, `test-author`, `backend-developer`, `frontend-developer`,
`refactorer`, `peer-reviewer`, `validator`, `integrator`. O projeto vence os nove
user stale por nome exato. Registrar hashes origem→cópia e antes/depois.

Após o cutover, a prova deve comparar os bytes exatos dos 12 perfis nativos e
seus hashes antes/depois, depois de todos os callers/documentos de perfil terem
sido reconciliados. A comparação confirma que somente o prefixo de provider foi
alterado; não transforma catálogo/registro em prova de serving.

A sessão RPC autenticada deve manter a autenticação existente; não copiar tokens,
`--profile` ou `PI_CODING_AGENT_DIR` sem decisão porque podem separar auth. RPC
pode atualizar cache/token: isso é efeito de fronteira e precisa autorização,
registro e limpeza/retensão definidos no gate. `agentSource:user` invalida a prova
de perfil local.

### Forma dinâmica de task

A forma abaixo descreve somente campos já observados na documentação v18.18.6;
campos opcionais só são enviados se o schema da sessão os expuser:

```json
{
  "context": "<context string conforme schema OMP v18.18.6>",
  "tasks": [
    {
      "task": "<assignment>",
      "solutionSpace": "<solution space obrigatório>",
      "agent": "<tipo quando exposto>",
      "name": "<instância única quando exposto>"
    }
  ]
}
```

- `agent` é o tipo; `name`/ID é a instância. Nomes são únicos sem distinção de
  caixa quando essa regra for exposta.
- `context` e `tasks` compõem batch quando batch estiver habilitado; sem batch, o
  caller usa chamadas flat equivalentes. Não exigir batch ausente.
- `solutionSpace` é obrigatório no schema atual. Não enviar `outputSchema`,
  `schemaMode`, `isolated` ou outro campo que a sessão não exponha.
- `structured:true` é configuração do perfil quando presente; neste mapa são
  exatamente `requirements-reader`, `architect`, `host-operator`,
  `deep-reviewer` e `peer-reviewer`, não requisito `task.structured` global.
  Perfis estruturados podem exigir `yield`/schema.
- Spawn/job criado só autoriza coleta; o consumidor exige terminalidade e usa somente tipo/status/saída e correlação de instância/revisão efetivamente expostos; DTO async não é preenchido e `yield` incremental não é conclusão.
### Entrega async e autoridade terminal no OMP 18.18.6

Esta seção fixa a compatibilidade observada no runtime OMP 18.18.6 sem criar
API SDK, campo OMP, AC, tarefa, perfil, flag, waiver ou limite público novo.
O aditamento 0.6.0 é somente uma correção aditiva para consumir o terminal
`wait` documentado pelo SDK. A fonte primária e as capturas históricas ficam
em proveniência privada; a classificação de NATIVE-09/NATIVE-10 vem do receipt
live. Inline e custom async permanecem válidos; o canal `wait` não é alias nem
obsoleta os anteriores.

#### Canais de retorno documentados

O resultado inline do Root Task e os dois canais async têm autoridades
distintas:

```ts
type RootInlineTaskResult = {
  details: {
    results: SingleResult[]; // coleção canônica; exitCode real é obrigatório
  };
};
```

`AgentToolResult.details.results` é a única coleção inline consumida como
`SingleResult`; `progress` e `jobs` não são equivalentes. Cada `SingleResult`
preserva `exitCode` real e a proveniência de erro derivada pelo consumidor.

```ts
type AsyncSchema = {
  source: "caller" | "agent" | "session" | "none";
  mode: "permissive" | "strict";
  status: "valid" | "invalid" | "unavailable";
  data?: unknown;
  error?: string;
};

type AsyncJobDTO = {
  jobId: string;
  type?: "bash" | "task" | "eval";
  status?: "running" | "completed" | "failed" | "cancelled";
  agentId?: string;
  label?: string;
  durationMs?: number;
  meta?: OutputMeta;
  schema?: AsyncSchema;
};

type AsyncResultEvent = {
  type: "message_end";
  messageId?: string;
  message: {
    role: "custom";
    customType: "async-result";
    details: {jobs: AsyncJobDTO[]};
  };
};
```

`details.jobs[]` nesse canal continua sendo DTO custom de job, não
`SingleResult`; só as chaves realmente expostas (`jobId`, `type`, `status`,
`agentId`, `label`, `durationMs`, `meta`, `schema`) são preservadas.
`meta` é metadado opcional de captura, não resultado ou schema derivado. O
canal custom permanece a evidência privada `source_kind: "task_async_result"`.
Não se inferem `exitCode`, `isError`, `aborted`, `parentToolCallId`, `index`,
`agent` ou `agentSource`, e `jobId`/`agentId` podem ser diferentes.

O SDK também documenta o terminal de um Root `wait`, em forma distinta. O
bloco abaixo é descrição privada do DTO bruto observado e da evidência interna;
não cria tipo exportado, campo público, argumento CLI, perfil ou protocolo de
peer.

```ts
type WaitJobSnapshot = {
  id: string;
  type?: string;            // valor bruto; somente `"task"` do Root é relevante
  status?: "running" | "completed" | "failed" | "cancelled";
  label?: string;
  durationMs?: number;
  intent?: unknown;
  settledAtMs?: number;
  exitCode?: number;       // somente quando o SDK expõe número real
  resolvedModel?: unknown;
  resolvedModelIdentity?: unknown;
  resolvedThinkingLevel?: unknown;
  advisor?: unknown;
  completionPercent?: number; // somente enquanto running, quando exposto
  stage?: unknown;
  requests?: number;       // somente enquanto running, quando exposto
  cost?: number;           // somente enquanto running, quando exposto
  contextTokens?: number;  // somente enquanto running, quando exposto
  contextWindow?: number;  // somente enquanto running, quando exposto
  widget?: unknown;
  resultText?: string;
  errorText?: string;
  meta?: OutputMeta;
  structured?: AsyncSchema; // somente quando o resultado não foi consumido
  agentUrlId?: string;     // hint de navegação; não prova identidade de child
  agentOutputPublished?: boolean;
};

type WaitResultEvent = {
  type: "tool_execution_end";
  toolName: "wait";
  toolCallId: string;
  result: {
    content: unknown[];
    details: {
      op: "wait";
      jobs: WaitJobSnapshot[];
    };
  };
  isError: boolean;
};
```

O snapshot `wait` é armazenado na forma bruta, sem convertê-lo em
`AsyncJobDTO`, `SingleResult` ou mensagem custom. `type: "task"` só é relevante
para o job pertencente ao Root correto. `resultText` e `errorText` são texto
de transporte/apresentação e não podem ser reinterpretados como payload
estruturado.

#### Binding, terminalidade e conclusão

No canal custom, o consumidor correlaciona `agentId` real com a alocação,
`parentToolCallId`, `index`, papel, `agentSource` e assignment do `Root START`
no lifecycle/dispatch. No canal wait, `job.id` real é preservado em
`record.jobId`; quando exposto, `agentUrlId` é somente hint de navegação (o SDK
pode usar o próprio job ID quando a entrada manager/child não está disponível),
portanto não é autoridade universal de child. Esses valores são facts do
lifecycle/Root, não campos inventados no DTO. `jobId` custom, `job.id` wait,
ID de instância e ID de criança permanecem distintos.

O `Root Task END` seguido por `UPDATE` do mesmo call é progresso async legítimo:
preserva `ended: true`, sem novo `END` e sem inferir conclusão de filha. O
payload de lifecycle observado fornece `id`, `parentToolCallId`, `index`,
`agent` e `agentSource`; `Root END.details.progress[]` fornece somente a
correlação observada. Nem `progress`, `extractedToolData`, stdout/prosa do
Root, lifecycle `completed`, settlement ou quiescência montam um task record.

Para `wait`, a admissão exige `Root wait START` e `END` correspondentes, com
`tool_call_id` do próprio wait, não o `parentTaskCallId`, e `isError` observado
explicitamente como `false`. `wait.isError === false` é sucesso do transporte
wait, não sucesso do filho. O binding também exige sessão Root, parent do Root
TASK, índice, `agent`, `agentSource` efetivo (inclusive `project` quando
exigido pelo perfil), assignment exata e ownership único; a binding preserva
`source: "observed-root-dispatch-lifecycle"` e
`root_task_end_is_error: false`. Se `agentUrlId` estiver presente, ele só
ajuda a validar o child quando sua identidade real estiver demonstrada; se
estiver ausente ou for o fallback job-ID do SDK, somente o mapeamento Root
primário/primeiro async já fortemente explicitado pode ser usado. Igualdade de
IDs ou prefixos não é prova. Um job wait estrangeiro, stale, sem status ou de
tipo não relacionado não é admitido.

Somente `status: "completed"` efetivamente observado pode contribuir para
completion. Perfis estruturados exigem `structured.status: "valid"`, source e
mode reais e `data` apropriado ao protocolo, além de consumidor real. A
ausência legítima de structured/schema nos perfis não estruturados existentes
`validator` e `spec-kit-author` ainda exige evidência independente real de
Bash/arquivo/papel. `running`, `failed`, `cancelled`, malformed, schema
inválido, payload indisponível, job errado, ownership ausente/ambíguo ou dados
isolados nunca aprovam.

Se o SDK não expõe `exitCode`, `error`, `aborted` ou `isError` do filho, o
ledger mantém cada campo `null` e `*_observed: false`; `wait.isError` permanece
campo separado de transporte. Só um `exitCode` numérico realmente exposto é
preservado, e não zero; valor não zero impede sucesso. Não se deriva `0` nem
`false` do status `completed`.

#### Lifecycle antecipado, deduplicação e limites

A fonte primária pode emitir lifecycle antes de `Root tool_execution_start`;
essa observação fica pendente, preservando ordinal e timestamps reais, até
dispatch Root e correspondência única e exata de `parentToolCallId` completo,
índice, `agent`, `agentSource`, alocação e assignment. Identidade desconhecida,
rebind, contraditória ou ambígua é rejeitada; não se sintetizam Root, IDs,
progresso, permissão ou completion. A coleta pode aguardar `session_settled` e
o terminal mais recente do Root, mas isso não substitui retorno estruturado.

Custom e wait que representem o mesmo job deduplicam em um único registro
somente quando payload, status e ownership são consistentes. Snapshots/mensagens
idênticos são idempotentes; payload, status ou ownership contraditórios,
IDs/índices duplicados ou ausência de binding bloqueiam. Antes da mutação,
validar limites existentes de quantidade e 16 MiB e os IDs opacos exatos. Não
reter payload desconhecido, comandos sensíveis, nem usar `get_messages` como
fallback ou polling.

O predicado compartilhado `isAuthoritativeTaskRecord`/`taskRecordSucceeded`
deve reconhecer o kind real novo após implementação; bypass de teste, root
stdout, progress, lifecycle, extractedToolData, settlement, quiescência,
primeiro yield, `prompt_result`, `agent_end` ou texto humano não substituem
o terminal montado. A ausência automática de custom pode ocorrer quando o Root
`wait` consome a entrega; portanto nenhum canal é tratado como requisito
exclusivo.

#### Handoff e proveniência

Antes do dispatch, o host grava o descritor imutável por etapa
`.omp/state/native-route/task-<step>.json`, contendo run, revisão, nonce,
contexto de leitura, fingerprints, regra de tag e leituras obrigatórias, sem
expected output. Root e filho leem o mesmo descritor e comprovam causalidade;
o item de task é encaminhado literalmente. Não se cria `taskFile`, async
disable, perfil blocking, override de modelo/ferramentas/SDK, campo de sessão
ou campo novo no wire.

#### Evidência privada normalizada (não é API pública)

O registro interno mantém os canais existentes e adiciona somente o kind
privado `task_wait_result`:

```json
{
  "source_kind": "task_wait_result",
  "id": "<allocated child real>",
  "allocated_id": "<allocated child real>",
  "jobId": "<job.id real do snapshot; distinto de id>",
  "wait_result": {
    "source": "tool_execution_end.result.details.jobs",
    "tool": "wait",
    "tool_call_id": "<ID real do Root wait correspondente>",
    "host_workflow_ordinal": "<ordinal real>",
    "is_error": "<isError real do wait END>",
    "is_error_observed": true,
    "job": "<snapshot bruto SDK, sem reescrita>",
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

`source_kind: "task_async_result"` continua sendo a forma privada existente
para o custom; inline continua usando `results`. Os campos acima são
evidência interna, não tipos de CLI/quality, perfil, protocolo peer ou wire
OMP. `schema.source: "agent"` continua sendo proveniência do schema, nunca
`agentSource: "project"`.

### Ledger de observação nativa

O ledger pode registrar `source_kind: "task_async_result"` ou
`source_kind: "task_wait_result"` somente quando o frame bruto, a revisão,
o binding Root e a classificação de terminalidade forem observados. O kind
novo não muda `PENDING_NATIVE`, não fecha Native, não autoriza retry técnico,
não altera os 21 AC/22 tarefas e não altera perfis, modelos, effort,
autenticação, qualidade pública ou release.

`host_binding` é correlação interna derivada do dispatch/lifecycle, não parte
de `details.jobs[]`; chaves opcionais do DTO (`label`, `durationMs`, `meta`,
`schema`) só aparecem quando o SDK as expõe. `meta`, quando presente, é
`OutputMeta` de captura do SDK, não campo de `SingleResult`.

### Evidência classificada e ledgers

Observações `EXECUTADA` só valem no escopo explicitamente registrado no receipt;
`ESTÁTICA`, `HISTÓRICA` e `NÃO VERIFICADA` não promovem Native, revisão,
segurança, gate ou release. Assemblies de alignment, contexto, revisão,
perfis/wire, suíte ou segurança são scoped; uma mudança de fonte, contexto,
ambiente ou independência reabre as provas dependentes.

O ledger de suíte anterior à mudança pública da fonte é somente
`HISTÓRICO`/escopado. T-014 deve descobrir a suíte pertinente na configuração e
fonte atuais e produzir ledger versionado. `retained-observations.json` mantém
cutoff público imutável; observações futuras são receipts privados. Não copiar
contagens, hashes ou logs operacionais para este contrato; desconhecido/null não
é zero e source-only não é Native.

### Review wire

- `TDD_PEER_REVIEW`: yield nativo estruturado com `protocol_mode:"TDD_PEER_REVIEW"`, `agent:"peer-reviewer"` e status `APROVADO` ou `BLOQUEADO`; preserva `reviewed_revision`, `explanation`, `confidence`, `overall_correctness` e `findings` do frontmatter atual. Não há primeira linha textual; malformed é recusado com diagnóstico. Status real não é convertido em `VALID`.
- `DEEP_REVIEW`: `yield` incremental e findings por instância preservam tipo,
  `name`/ID, assignment, source revision/context e raw output. Resultado individual
  `VALID` não é aprovação; `aggregateReviewInstances` só produz `APPROVED` quando
  conjunto completo, IDs únicos, ownership disjunto e revisão atual forem válidos;
  caso contrário `BLOCKED`. `aggregateReview` legado continua separado.
- Fallback nativo de modelo/perfil e retry técnico TDD são eventos diferentes. O
  segundo conserva tarefa/run, cria novo job/instância após FAIL terminal elegível e
  respeita cap3; falha de infraestrutura não autoriza escalada de modelo.

## Contrato de erros

Os consumidores atuais preservam diagnósticos como `errors: string[]`; este quadro
é uma taxonomia de planejamento, não autoriza ampliar a API nem obriga callers a
fazer branching por texto. Os rótulos marcados `*` são candidatos novos: só podem
ser adotados se a implementação e o consumidor forem alterados/revisados juntos;
até lá, usar as strings atuais.
| Código/estado | Significado | Consumidor/ação |
|---|---|---|
| `E_SCHEMA` | campo ausente, extra ou tipo inválido | rejeitar sem fallback oculto |
| `E_PROGRESS` | schema/AC/ID/wave inválido | preservar diagnóstico; reabrir state |
| `E_HISTORY` | tentativa sobreposta, cap >3 ou identidade trocada | bloquear promoção |
| `E_RESOURCE` | path/root/alias/traversal/capacidade insegura | não despachar writer |
| `E_JOB` | job/owner/status desconhecido ou RUNNING sem prova | conservar lock |
| `E_RETURN_SET` | retorno duplicado/desconhecido | não agregar |
| `E_RETURN_MISSING` | terminal sem retorno atual | `complete:false` |
| `E_RETURN_STALE` | revision/static/context/return digest divergente | revalidar/revisar |
| `E_PROOF_SOURCE*` | receipt/source/contexto inválido, ciclo ou autorreferência | quality BLOCKED |
| `E_QUALITY_CONTEXT*` | expected context ausente/divergente | delivery BLOCKED |
| `E_INSTALL_DRIFT` | hash/identidade/destino/concorrrência divergente | rollback seletivo; preservar foreign |
| `E_UNSAFE_GIT_EXECUTABLE` | metadata/origem/linkset/assinatura/hash/ACL/carga desconhecida ou inválida | recusa terminal; sem reescrita de PATH, busca após recusa, alias executável, Git substituto ou novo objeto confiável |
| `E_SHIP_ARGS*` | flag sem valor, próxima opção consumida ou aridade inválida | falhar antes de efeitos |
| `E_SHIP_PLAN_ARGS*` | `plan` com flag desconhecida/duplicada/posicional, target ausente ou valor ausente/próxima flag | falhar antes de qualquer leitura/efeito; diagnóstico sanitizado |
| `E_SHIP_PLAN_WORKSPACE*` | root ausente, inválido ou fora de workspace válido | terminar não-zero sem Git/GitHub/rede/subprocesso/escrita |
| `E_SHIP_PLAN_PROOF*` | report/context ausente, legado, stale, hash/proveniência inválidos ou validação real falhou | não emitir `PLANNED`; preservar erro real sem declarar PASS |
| `PENDING_NATIVE` | prova OMP instalada ainda não realizada | não liberar release |
| `BLOCKED` | falha ou desconhecimento material | escalar/retomar só com decisão |
| `E_SUITE_DISCOVERY*` | conjunto de testes pertinente não corresponde à configuração atual | não fixar contagem; reavaliar descoberta e política de remoção |

## Estados de UI/CLI e entrega

O conjunto de testes de conclusão é sempre o conjunto pertinente descoberto pela
configuração/fonte atuais e registrado em ledger versionado. Ledgers anteriores
à mudança pública da fonte, incluindo o ledger final de plataforma antigo, são
`HISTÓRICOS`/escopados e não prova NATIVE/global/release. `retained-observations.json`
mantém cutoff público imutável; observações futuras são privadas. Mocks não são
equivalência nativa e testes incidentais removidos não retornam como oracle.


| Estado | Entrada | Exibição/efeito permitido |
|---|---|---|
| `DRAFT` | docs/contrato sem aprovação | apenas planejar; nenhuma implementação |
| `READY_FOR_APPROVAL` | docs coerentes, sem autoaprovação | pedir/apresentar aprovação explícita |
| `INTAKE_RECORDED` | aprovação registrada e issue/rename/associação criada | preservar branch; permitir primeira implementação, não PR/release |
| `IMPLEMENTING` | plano aprovado e RED/GREEN liberado | efeitos dentro dos globs/ondas |
| `PLANNING_EXTERNAL` | `plan` com args válidos e quality/context reais válidos | emitir somente JSON `PLANNED`, sete steps `NOT_EXECUTED`; não executar efeitos |
| `PLAN_REJECTED` | args, workspace, quality/context ou erro real inválido | terminar não-zero, diagnóstico sanitizado, sem `PLANNED` e sem efeitos |
| `PENDING_NATIVE` | código/fixtures prontos, OMP real não provado | bloquear compatibilidade; mostrar próxima prova |
| `BLOCKED` | erro, unknown, stale, P1 ou segurança sem prova | preservar raw evidence; não fallback silencioso |
| `VALIDATED` | suíte/gates/review atuais, NATIVE e R-02 resolvidos | permitir gate Ship, não publicar por si |
| `DELIVERY_EXTERNAL` | gate válido e `external → main` | Ship cria/atualiza PR conforme autorização |
| `RELEASE_PENDING_USER` | PR/CI concluídos, terminal não confirmado | aguardar decisão; não declarar release |
| `RELEASE_CONFIRMED` | confirmação terminal registrada | registrar versão/SHA; não fazer deploy de host sem autorização |

## Critérios de compatibilidade obrigatórios

- `NATIVE-01`: discovery dos 10/12 em project, precedência e hashes; `agentSource:project`.
- `NATIVE-02`: catálogo v18.18.6 e mapa `openai-codex` (IDs, principal/fallback e effort) efetivamente expostos; ausência de serving não fecha.
- `NATIVE-03`: duas instâncias disjuntas em batch se exposto ou flat; `solutionSpace`, IDs e terminal.
- `NATIVE-04`: async/yield/nested/retomada/isolamento conforme schema; locks reais e independentes paralelos.
- `NATIVE-05`: peer-reviewer nativo estruturado com `protocol_mode:TDD_PEER_REVIEW`, `agent:peer-reviewer`, positivo `APROVADO`, negativo `BLOQUEADO`, malformed recusado; preserva as chaves do frontmatter atual e não exige primeira linha textual.
- `NATIVE-06`: deep yield, fallback e agregação; missing/duplicate/stale/mode
  errado bloqueiam. O PASS delimitado do fallback não fecha o item global.
- `NATIVE-07`: branch/base e PR no mesmo SHA, diff e conteúdo integral.
- `NATIVE-08`: Fase 0/OK e DONE por `IMPLEMENTED`/`VALIDATED` contra consumidores.
- `NATIVE-09`: fallback nativo e retry técnico separados; serving/provider
  não observado não é PASS; retry técnico genuíno permanece obrigatório e, sem
  mecanismo seguro, bloqueia e exige decisão do usuário.
  Para o backend-developer, a exceção privada tipada
  `source_kind:"native09-backend-repair-write"` exige job Root `completed`,
  criança opaca com tuple completo/correlação forte, `write END` único com
  `isError:false` explícito no path exato permitido, sujeito `actual` alterado
  e dependências protegidas inalteradas; semantic repair approval/Native PASS
  ainda exigem peer independente e segundo validator com `PASSOU` real.
- `NATIVE-10`: pacote integrado short/full/local/external sem publicação,
  retro/dono/opt-out, referências 42/18 e retomada; a rota externa readonly
  de AC-021 emite somente plano declarativo e não prova entrega.

Todos iniciam `PENDING_NATIVE`. Instalação staging, fixture, teste de biblioteca,
mock de Git/GitHub, texto autodeclarado, yield ou configuração declarada não
fecha qualquer item. A prova positiva parcial de peer/wire permanece escopada;
serving físico e fallback de provider são `NOT OBSERVED`, não PASS.

Identidade desconhecida, rebind, duplicata, terminal contraditório ou campo
ausente mantém a prova aberta; não se sintetizam Root, IDs, progresso,
permissão ou completion. O checkpoint imutável atual de T-009A continua
separado do RED/TDD original e da aceitação global; T-009C preserva RED
histórico. A rota textual legada é `SUPERSEDED` e não é reintroduzida.

AC-009/W-01/W-02 e NATIVE-09/NATIVE-10 só mudam conforme execução Native,
retorno aceito por peer/validator e gates atuais no receipt. A rota readonly
de AC-021 suporta implementação e planejamento, mas não prova entrega.

## Resumo histórico datado (as-of 2026-11-15)

Capturas bounded do observador, reviews source-only, correções de lifecycle e
ledgers de plataforma anteriores à mudança pública da fonte permanecem
HISTÓRICOS/escopados. O snapshot da base `0.5.0` não lançada preserva 21 AC,
22 tarefas, 10/12/42/18, schemas/wire e gates Native pendentes; o aditamento
`0.6.0` é esta documentação atual e também não é estado live. O DTO/frame não
retido permanece desconhecido. Early ordering é hipótese suportada pelo
contrato primário do SDK, não causa Native confirmada.

T-009A continua sendo checkpoint imutável do código existente sob AC-012,
separado do RED/TDD e sem prova de serving, provider fallback ou aceitação
global. T-009C mantém RED histórico indisponível. Assemblies source-only,
security ou tooling não promovem AC-016, Native, segurança ou release.

Referências cruzadas: [../spec.md](../spec.md), [../plan.md](../plan.md) e
[../tasks.md](../tasks.md). A autoridade live é `progress.json` e o receipt
corrente; receipts privados não são distribuídos nem fixtures Native.

## Changelog

| Versão | Data | Mudança |
|---|---|---|
| 0.7.0 | 2026-11-16 | Aditamento aprovado, aditivo e não lançado: contrato privado tipado `native09-backend-repair-write` para completion de framework do backend NATIVE-09, exigindo job Root `completed`, criança opaca com tuple completo e único, `write END` único com `isError:false` explícito no path exato, sujeito alterado e dependências protegidas inalteradas; peer/segundo validator podem ser coletados, mas semantic repair approval/Native PASS exigem peer independente e segundo `PASSOU`; primeiro `FALHOU` correlacionado a CLI não-zero permanece raw/histórico; schema estruturado continua obrigatório salvo essa exceção backend escopada; sem mudanças públicas e sem bump do pacote. |
| 0.6.0 | 2026-11-16 | Aditamento aprovado e não lançado: consumo aditivo do terminal `wait` documentado no SDK, preservação do snapshot bruto e evidência privada `task_wait_result`; inline/custom permanecem válidos; ownership Root, schema/proveniência, terminalidade, NULL, limites e deduplicação fail-closed; sem mudança de API pública, CLI, perfil, modelo, effort, wire, AC, tarefas ou gates, e sem Native PASS. |
| 0.5.0 | 2026-11-15 | Consolidação documental: classificou capturas bounded, reviews source-only, ledgers anteriores à mudança pública da fonte e checkpoint imutável T-009A como históricos/escopados; preservou wire, schemas, APIs, 21 AC, 22 tarefas, catálogo 10/12/42/18 e a distinção entre readiness, Native, gates e release. |
| 0.5.0 | 2026-11-14 | Aditamento aprovado e ainda não lançado: rota `ship plan` readonly com quality/context e sete steps `NOT_EXECUTED`; sem Git/GitHub/rede/subprocessos/escrita/publicação/deploy; serving/provider `NOT OBSERVED`; T-009C histórico e T-009A checkpoint de código existente, sem alteração de assinatura, wire, schema, modelo ou perfil. |
| 0.5.0 | 2026-11-11 | Cutover aprovado `native_structured_clean_cutover`: TDD normal usa yield estruturado `TDD_PEER_REVIEW`/`peer-reviewer` com `APROVADO`/`BLOQUEADO`, schema de frontmatter e `expected` independente obrigatório; sem primeira linha textual, shim, default ou derivação; deep permanece `VALID` incremental; prova positiva nativa é parcial (`globalAcceptance: PENDING`), wire textual SUPERSEDED e NATIVE/gates continuam pendentes |
| 0.4.0 | 2026-11-11 | Decisão de usuário `pin_openai_codex`: trocar apenas o prefixo dos 12 perfis geridos para `openai-codex/`, preservando IDs, principal/fallback, effort/output e cinco structured; catálogo de 75 entradas não prova serving; baseline segura HTTP 401 do provider `openai` fica HISTÓRICA, não RED nem retry técnico; cutover integral, bytes exatos, peer/deep fallback e serving continuam gates PENDING_NATIVE; Windows TCB 0.2, backup Linux 0.3, R-02 estático, gates e catálogo 10/12/42/18 preservados |
| 0.3.0 | 2026-11-10 | Decisão `backup_platform_decision: "siga sua recomendação"`: Windows Node/libuv `EXLOCK|TEMPORARY` sem fallback pathname e Linux FD-bound/atomic no-replace; Python3 OS isolado `-I/-S` com allowlist scrubbed; prova Linux e implementação de T-006A continuam pré-release, sem alterar API pública ou wire OMP |
| 0.2.0 | 2026-11-10 | Registro da decisão material `explicit_os_host_tcb`: bootstrap restrito ao Windows PowerShell 5.1/System32 sob contexto protegido, com ambiente/FullLanguage x64 fail-closed; seis PASS permanecem apenas primitive LAB; T-005 pode iniciar GREEN, mas implementação, revisão independente e prova nativa continuam pendentes |
| 0.1.0 | 2026-11-10 | Contrato aprovado pelo usuário; compatibilidade OMP 18.18.6, state/proof/filesystem/execution/quality, wire nativo, catálogo e gates permanecem com provas pendentes |
