# Tasks: specs005-omp-compatible-release

> Deriva de [spec.md](./spec.md) e [plan.md](./plan.md).
> **Versão:** 0.7.0 (approved amendment; unreleased)
> **Status:** APPROVED AMENDMENT — UNRELEASED; tarefas permanecem `PENDING`
> até provas, review, validator e gates live correspondentes.
> **Inventário documental durável (não operacional):** este artefato não declara status global corrente; fase, status, contagens live, gates, autorizações e promoções são governados exclusivamente por `.omp/state/tdd/progress.json`; as tabelas abaixo não duplicam fase/contagem corrente nem promovem Native/release.
> **Issue:** #47
> **Branch ativa:** `feat/47-omp-compatible-release`
> `[P]` = paralelizável quando os globs e recursos estiverem disjuntos.
> **Aprovação do aditamento 0.6.0:** receipt privado
> `.omp/state/release-47/proofs/contract-0-6-native-wait-user-approval.json`,
> com `contract_amendment: "Aprovo"` e `confirmation: "Aprovo"`. Esta aprovação
> documental não é Native PASS, waiver, publicação ou promoção de tarefa.
> As tabelas abaixo preservam o plano original e seus rótulos formais `PENDING`; não são fonte de execução live; qualquer status/fase/AC corrente deve ser lido de `progress.json`, sem autopromoção.

> **Aprovação do aditamento 0.7.0:** receipt privado
> `.omp/state/release-47/proofs/contract-0-7-native09-backend-user-approval.json`
> (`contract_amendment: "approve_scoped_native09_backend_completion_0_7"`,
> `confirmation: "Aprovado"`). O escopo é a prova privada delimitada de
> NATIVE-09; não é aprovação semântica, Native PASS, waiver, publicação ou
> release.
> **Autoridade das tarefas:** esta tabela deriva de `plan.md` e não é um ledger
> operacional. Fase, status, AC, gates, autorização e promoção são lidos
> exclusivamente de `.omp/state/tdd/progress.json` e do receipt corrente que
> ele referencia. Não duplicar contagens live, budgets, IDs de tentativa ou
> hashes de candidato.
>
> **Inventário normativo:** Goal 47 mantém 22 tarefas, 21 AC, 42 capacidades,
> 18 fontes, 10 skills, 12 perfis, 6 controles de segurança; a base `0.5.0`
> recebe somente os aditamentos privados `0.6.0` e `0.7.0`, ambos não lançados.
> `PENDING`, `PENDING_NATIVE`, `BLOCKED`, `actual:null/unverified` e
> `NOT OBSERVED` continuam estados/procedimentos normativos; não fazer
> substituição global por status de execução.
>
> **Resumo histórico datado (as-of 2026-11-15):** janelas Native bounded,
> autorizações canceladas, diagnósticos source-only e reviews/ledgers antigos
> são snapshots preservados, sem promoção Native, E2E, gate ou release. T-009A
> é checkpoint imutável de verificação do código existente sob AC-012, distinto
> do RED/TDD original, serving e prova global. T-009C preserva o RED
> indisponível sem fechar AC-014. O ledger de plataforma anterior à mudança
> pública da fonte é histórico e escopado; qualquer mudança de fonte, contexto,
> ambiente ou independência reabre provas dependentes.
>
> Receipts em `.omp/state/**` e URIs `local://` são proveniência privada, não
> documentação distribuída nem fixture para agentes Native. Payloads e hashes
> exatos permanecem nos arquivos privados/ledgers versionados e não são
> reproduzidos nesta tabela.
>
> **Sequência de entrega:** T-013A cria artefato aprovado de prontidão
> pré-publicação; T-013B é responsabilidade Ship externa e consome esse
> artefato mais todos os gates pré-publicação reais. CI, merge e evidência
> terminal fecham AC-001 e o pacote de AC-016; não há dependência cíclica que
> exija AC-001 pós-release antes de publicar. A rota `plan` é somente leitura e
> não afirma readiness, remoto, IDs, publicação ou release.
>
> Referências: [spec.md](./spec.md), [plan.md](./plan.md) e
> [interface-contract.md](./contracts/interface-contract.md).

## Regras de execução

- A tarefa é a unidade de identidade, tentativa, recurso, AC e prova; não se cria
  outro scheduler nem se troca o ID para esconder retry.
- `acceptance_criteria` persistido deve conter pelo menos um AC. Pela emenda
  Review09-01 do contrato, uma tarefa normativa pode fechar vários ACs, todos
  explicitamente `type: normative` e com uma entrada NA exata por AC. Nunca
  misture behavioral e normative na mesma tarefa; decomponha esses assignments.
- AC `behavioral` exige RED antes de GREEN, asserção real, smoke descartável ou
  cenário OMP; teste de wording/wiring, mock ou fixture não é equivalência nativa.
- Onda só promove após integração, review independente e validator com prova atual.
  `PENDING`, `PENDING_NATIVE`, `actual:null/unverified` e ausência de campo do
  schema não são PASS.
- Sem isolamento nativo observado, conflitos de writer/cache/output são
  serializados. OMP batch só é usado quando exposto; caso contrário, flat
  equivalente. `solutionSpace` é obrigatório no schema atual; campos ocultos não
  são enviados.
- O destino Ship é externo (`main`), sem merge local. Issue e rename/associação de
  branch só após aprovação do plano/contrato; o trabalho existente não é resetado,
  stashado ou limpo destrutivamente.
- OMP alvo é **18.18.6**; versão/binário, fonte/tag e instalação são fatos
  distintos. A avaliação dos 12 perfis usa cópias exatas project em projeto
  descartável, `agentSource:project`, hashes antes/depois e não copia tokens.
  O provider aprovado é `openai-codex/` somente nesses perfis; não há herança
  `Root`, override global ou por chamada.
- R-02 e qualquer review/reconciliação bounded só valem no escopo do receipt
  live; a recuperação contrato 0.2/no-SHA é `HISTÓRICA`. AC-011
  global/catalog/Native/legalidade exigem suas provas; não se fabrica
  copyright/licença nem se usa identidade efêmera como prova única.
- Capturas de suíte/plataforma anteriores à mudança pública são
  `HISTÓRICAS`/escopadas; não se restauram testes incidentais nem se usa ledger
  fixo como suíte final. T-014 descobre a configuração/fonte atual e produz
  ledger versionado. `retained-observations.json` conserva o cutoff público
  imutável; observações futuras são privadas e desconhecido/null não é zero.
- A DAG final é native/evidence → suíte/métricas → review/validator/docs →
  Ship. GREEN local só fecha a própria tarefa/AC; a saída de T-006C é plano
  declarativo readonly, nunca prontidão, IDs, publicação ou release.

## Evidência classificada e regras de fechamento

As tarefas usam `ESTÁTICA`, `EXECUTADA`, `HISTÓRICA` e `NÃO VERIFICADA` com
alcance explícito. `PENDING`, `PENDING_NATIVE`, `BLOCKED` e
`actual:null/unverified` permanecem estados formais; nenhum source-only,
fixture, mock, catálogo, yield, peer parcial ou texto autodeclarado vira
`DONE`, Native, gate ou release.

T-009A é checkpoint imutável do código existente sob AC-012, não RED/TDD
original, serving ou prova global. T-009C preserva o RED indisponível sem
fechar AC-014. T-006C só pode emitir `PLANNED` após validação real de
quality/context e nunca afirma readiness, remoto, IDs, publicação ou release.
Fallback de capacidade, fallback de provider e retry técnico têm provas e
limites separados.

T-014 deve descobrir a suíte pertinente da fonte/configuração atual e emitir
ledger versionado; ledgers anteriores à mudança pública são históricos e
escopados. T-015 registra somente medições efetivas, sem inferir LLM, custo,
throughput ou retry global. O cutoff público de
`retained-observations.json` não é reescrito; desconhecido/null nunca é zero.
Mudança de fonte, contexto, ambiente ou independência reabre provas
dependentes.

Receipts sob `.omp/state/**` e URIs `local://` são proveniência privada, não
artefatos distribuídos nem fixtures Native. Estado, fase, autorização e
promoção vêm de `progress.json` e receipt live, não deste resumo.

## Regra aditiva de prova para NATIVE-09 (0.7.0; sem nova tarefa)

T-009B e T-011 continuam responsáveis por consumir e validar esta evidência;
nenhuma linha de tarefa nova é criada. O kind privado tipado é
`source_kind: "native09-backend-repair-write"`. A prova só pode registrar
completion de framework quando o job aprovado pelo Root estiver
`status: "completed"`, a criança opaca estiver vinculada por tuple Root
completo e único (`root_session_id`, `parent_tool_call_id`, `allocated_id`,
`index`, `root_task_end_is_error:false`, `agent`, `agentSource`, assignment,
`job_id`, `instance_id`) e houver
um único `write END` aprovado, com `isError: false` explicitamente observado e
o caminho exato aprovado. O `actual` deve mostrar mudança real do sujeito
pretendido por bytes/hash antes/depois; dependências protegidas devem manter
bytes/hash e identidade inalterados. Identidade, path e correlação continuam
Root-bound; rebind, stale, drift, duplicata, ausência ou ambiguidade bloqueiam.

A coleta permite dispatch de peer independente e segundo validator, mas não
converte a coleção em aprovação semântica. `Task framework completed` não é
`validator semantic PASS`: o framework só terminou. O primeiro `FALHOU` do
validator é legítimo quando correlacionado ao CLI real com código não zero;
preserva-se todo o raw e não se marca teste como PASS. Semantic repair
approval/NATIVE-09 PASS exige peer independente e segundo validator com
`PASSOU` real, correlação válida e gates atuais.

Todo perfil existente `structured:true` ainda exige schema válido. A única
exceção é o perfil `backend-developer` no NATIVE-09 desta prova privada, sem
aceitação geral de perfil indisponível. As regras existentes de `validator` e
`spec-kit-author` não mudam; apenas fica explícito que relatório negativo do
validator não passa testes, mesmo com task framework `completed`. Flags de filho
não expostas permanecem `null`/desconhecidas com `*_observed:false`; não inferir
`exitCode: 0`, `isError:false`, `aborted:false` ou qualquer flag ausente.

Não há SDK/wire fields, APIs, settings, modelos, flags, CLI pública ou perfis
novos. Contadores e falhas Native permanecem históricos, não live; todas as
tabelas conservam seus rótulos iniciais `PENDING`. A ordem
pré-publicação/CI/release canônica já descrita, incluindo T-013A → T-013B e
gates reais, não muda. Não há bump de versão do pacote.

## Onda 0 — planejamento e crítica independente

| ID | Descrição | AC de aceitação | Supports | Dependências | `allowed_write_globs` | Prova/saída | Status |
|---|---|---|---|---|---|---|---|
| P-001 | `[P]` Escrever somente `spec.md`, `plan.md`, `tasks.md` e `contracts/interface-contract.md` de specs005; incluir 33 AUD, 4 W, 6 R, catálogo 10/12/42/18, NATIVE-01–10 e matriz completa. | AC-018 (normative) | AC-001, AC-005, AC-010, AC-011, AC-019 | — | `specs/specs005-omp-compatible-release/**` | PV-017 documental; status DRAFT, sem aprovação automática | PENDING |
| P-002 | `[P]` Pesquisa read-only da fonte OMP v18.18.6 e schema atual; preparar procedimento autenticado para os 12 perfis locais, discovery de 10 skills, `agentSource`, mapa `openai-codex`/IDs/ordem/effort, cinco structured por perfil e `solutionSpace`. | AC-012 (behavioral) | NATIVE-01–04, R-01 | — | `none` | PV-012 como procedimento/limites; catálogo observado não prova serving e auth HTTP 401 permanece histórica |
| P-003 | `[P]` Crítica read-only da fronteira filesystem/Windows: registrar a premissa `explicit_os_host_tcb` restrita ao host PowerShell 5.1/System32 e confrontá-la com helper host-anchored por handles/ancestrais pinados e NOREPLACE/rollback versus bundle nativo; manter prova da primitive e condições de bloqueio. | AC-005 (behavioral) | AUD-003, AUD-015–019, R-03, R-06 | — | `none` | PV-005/PV-008; seis PASS LAB não aprovam host/transação | PENDING |
| P-004 | Após aprovação explícita, registrar intake de issue/rename/associação sem implementar, preservar a branch ativa `feat/47-omp-compatible-release` e anexar identidade ao snapshot. | AC-001 (normative) | CAP-001/027/038, R-04 | aprovação do plano/contrato | `implementation-evidence/release-governance/**`; `.git/ship-review-evidence.md` | PV-001; nenhum PR/release/efeito de código | PENDING |

P-001, P-002 e P-003 são independentes e não esperam retorno entre si. P-004
somente inicia após a aprovação do plano/contrato e realiza o intake antes da
primeira implementação, não a entrega. P-003 registra a decisão de bootstrap e
seus limites; desconhecimento da primitive ou da transação continua BLOCKED para
a conclusão, sem impedir o início GREEN de T-005 autorizado pela decisão.

## Onda 1 — bases de biblioteca e referências

| ID | Descrição | AC de aceitação | Supports | Dependências | `allowed_write_globs` | Prova/saída | Status |
|---|---|---|---|---|---|---|---|
| T-001 | `[P]` Corrigir execução: conservar lock de tentativa RUNNING sem job/UNKNOWN; rejeitar desconhecido pertinente; aceitar raízes `/` e `C:/` com fronteira segura; manter APIs puras e retorno incompleto. | AC-002 (behavioral) | AUD-001, AUD-011, CAP-009–012, CAP-015, CAP-025 | P-001 + aprovação | `tdd-orchestrator/lib/execution.mjs`; `scripts/execution.test.mjs` | PV-002 + RED/GREEN; não criar scheduler | PENDING |
| T-002 | `[P]` Corrigir state/migração: IDs/tarefas e ondas únicos; TEST_REF relativo seguro preservando título literal; baseline RED inválida preservada/bloqueada; aliases 2.1/2.2 explícitos e schema 2.3 fechado. | AC-003 (behavioral) | AUD-006–010, CAP-016/021 | P-001 + aprovação | `tdd-orchestrator/lib/state.mjs`; `scripts/tdd-state.test.mjs`; `scripts/state-evolution.test.mjs`; `scripts/integration-validation.test.mjs` | PV-003 + regressões de migração/promoção | PENDING |
| T-003 | `[P]` Corrigir quality/CLI/Retro: grafo report→contexto→receipt→source original, expected context independente, rechecagem de report trocado, aridade estrita e interações Ship/Retro. | AC-004 (behavioral) | AUD-002, AUD-012, AUD-032, W-03, CAP-022/023/025 | P-001 + aprovação | `tdd-orchestrator/lib/quality.mjs`; `tdd-orchestrator/bin/quality.mjs`; `retro/lib/control.mjs`; `scripts/quality.test.mjs`; `scripts/quality-context-security.test.mjs`; `scripts/quality-identity.test.mjs`; `scripts/ship-quality.test.mjs`; `scripts/ship-quality-cli.test.mjs`; `scripts/retro.test.mjs` | PV-004 + negativos reais de source/report/contexto | PENDING |
| T-004 | `[P]` Corrigir referências consultivas por fonte primária: GUC/RLS e índices condicionais; Go os/exec/CSRF; Express default; Next Pages/App Router e redirect; Vue redirect; React `ssr:false`; RLS performance. | AC-010 (normative) | AUD-005, AUD-023–030, AUD-033, CAP-034–036 | P-001 + crítica semântica | `tdd-orchestrator/references/postgresql/security-rls-basics.md`; `tdd-orchestrator/references/postgresql/query-missing-indexes.md`; `tdd-orchestrator/references/postgresql/security-rls-performance.md`; `tdd-orchestrator/references/react/bundle-defer-third-party.md`; `deep-review/references/security/golang-general-backend-security.md`; `deep-review/references/security/javascript-express-web-server-security.md`; `deep-review/references/security/javascript-typescript-nextjs-web-server-security.md`; `deep-review/references/security/javascript-typescript-vue-web-frontend-security.md` | PV-010 + review semântica independente; sem RED artificial | PENDING |

T-001–T-004 têm globs disjuntos e podem ser `[P]` após aprovação. O coordenador
mantém progress e a zona dos quatro docs serializada.

## Onda 2 — instalador, Ship e hooks

| ID | Descrição | AC de aceitação | Supports | Dependências | `allowed_write_globs` | Prova/saída | Status |
|---|---|---|---|---|---|---|---|
| T-005 | Corrigir instalador: preflight/staging/CAS/rollback e inventário final; reservar namespace para helper/factory/codegen FS real e seus testes. Com `explicit_os_host_tcb` registrado, pode iniciar GREEN, sem aprovar host/transação. | AC-005 (behavioral) | AUD-003, AUD-015, AUD-016, R-03, CAP-011/013 | P-003 + T-001/T-002 | `install.mjs`; `tdd-orchestrator/lib/fs-transaction/**`; `tdd-orchestrator/lib/fs-transaction/generated/**` (se necessário); `scripts/fs-transaction*.test.mjs`; `scripts/install.test.mjs`; `scripts/install-transaction.test.mjs` | PV-005 em HOME/checkout descartável; handles/no-replace/quarentena; review independente e prova nativa antes de concluir; sentinel externo intacto | PENDING |
| T-006A | Corrigir backup sem mudar a API pública de `performBackup`: origem aberta com identidade bigint pinada, descriptor/fstat, colisão e quiescência aplicável; troca entre inspeção/uso falha sem alegar consistência DB/WAL. Staging Windows usa Node/libuv `EXLOCK|TEMPORARY` até link, sem fallback pathname; Linux exige staging anônimo FD-bound e publicação atômica no-replace; capacidade host/kernel/filesystem ausente ou divergente falha fechado. T-006A é dona única de `ship/bin/lib.mjs`, incluindo `flagValue` estrito; a implementação bounded, o consumidor real de quality/delivery, o validator e os gates de AC-006 permanecem obrigatórios; fase, status e promoção live vêm exclusivamente de `.omp/state/tdd/progress.json` e do receipt corrente. | AC-006, AC-007 (behavioral) | AUD-004, AUD-013, R-04 | T-003 | `ship/bin/lib.mjs`; `ship/bin/lib.test.mjs` | PV-006/PV-007; LAB não é produção; prova Linux e revisão independente antes do release | PENDING |
| T-006B | Corrigir parser/base Ship: valor ausente ou próxima flag falha antes de efeitos; `origin/<default>` e ref validados explícitos; consome `ship/bin/lib.mjs` somente após T-006A. | AC-007 (behavioral) | AUD-013, AUD-014, CAP-027 | T-006A | `ship/bin/ship.mjs`; `ship/bin/ship.test.mjs`; `scripts/ship-protocol.test.mjs` | PV-007; parser/flagValue negativo e mocks apenas para ausência de efeito, não para NATIVE | PENDING |
| T-006C | Implementar a rota pública somente leitura `node ship/bin/ship.mjs plan --root <workspace> --target <branch> [--report <relative>] [--context <relative>]`, com parser estrito, defaults e chamada real de `validateShipQuality(workspace,{required:true,reportPath,contextPath})`; JSON declarativo sem Git/GitHub/rede, subprocessos, escrita, publicação ou deploy. Donos: `ship/bin/ship.mjs`, `scripts/ship-plan.test.mjs` e docs públicos Ship (Main edita docs não-spec); não altera comandos, assinatura, wire, schema, modelo ou perfil existente. | AC-021 (behavioral) | NATIVE-10 external route; PV-018 | T-006B + T-003 | `ship/bin/ship.mjs`; `scripts/ship-plan.test.mjs`; `ship/SKILL.md`; `ship/references/integrated-delivery.md` | PV-018; RED e refs permanecem proveniência histórica privada; AC-021 exige prova própria e não promove Native/global | PENDING |
| T-007 | Corrigir hooks Windows: CAS no commit/rollback, quoting `.cmd` em paths com espaços, wrapper `.cmd/.bat` adaptado ou rejeitado; reusar o bootstrap apenas em metadata/operações filesystem, nunca para admitir Git por herança; guard de Git exige que o executável originalmente selecionado seja exatamente `cmd/git.exe` ou `mingw64/bin/git.exe` (MSYS pode selecionar o segundo) e valida ambos os objetos, assinaturas, hashes, linksets, ACLs, ancestrais e DLLs; legado `nlink=1` é preservado. | AC-008 (behavioral) | AUD-017–019, R-03/R-06, CAP-007/024/025 | T-005 + P-003 | `scripts/install-hooks.mjs`; `scripts/hooks/commit-msg.mjs`; `scripts/hooks/pre-push.mjs`; `scripts/fixtures/hooks-v040/**`; `scripts/lib/git-trust-source.mjs`; `scripts/generate-git-trust.mjs`; `scripts/install-hooks.test.mjs`; `scripts/pre-push-default.test.mjs`; `scripts/git-trust.test.mjs`; `scripts/git-trust-generation.test.mjs` | PV-008; desconhecido retorna `E_UNSAFE_GIT_EXECUTABLE`/fail-closed, sem reescrever PATH, procurar após recusa, alias executável, shell ou Git substituto; revisão final da alteração ainda pendente | PENDING |

T-006A é dona exclusiva de `ship/bin/lib.mjs` e T-006B é serializada depois,
sem editar essa lib. T-005 reserva apenas o namespace
`tdd-orchestrator/lib/fs-transaction/**` (incluindo `generated/**` somente se
necessário) e seus testes; T-007 consome a interface depois de T-005.
O test-author de T-007 pode escrever somente testdata em
`scripts/fixtures/hooks-v040/**`, preservando os bytes exatos v0.4.0 de
`audit/release-v040/scripts/hooks/{commit-msg.mjs,pre-push.mjs}` com proveniência
em `local://ship-released-hook-payloads-v040.json`. As fixtures de upgrade/CAS
não usam sufixos de fonte modificada que `isManaged` recusa antes da injeção de
falhas. Esse ajuste interno de ownership não cria AC nem altera API, wire,
premissas ou status de gates.
T-006C é serializada depois de T-006B e T-003. Seu teste permanente é somente
`scripts/ship-plan.test.mjs`; docs públicos Ship ficam listados como contexto de
ownership, e Main é o autor fora destes quatro artefatos. A tarefa não cria
alias, scheduler, engine de validação ou shim e não altera comandos existentes.

Com `explicit_os_host_tcb` registrado, T-005 mantém autorização do candidato,
mas GREEN dependente exige RED contratual e prova atual da primitive aplicável
em destino descartável. Os seis PASS LAB não aprovam host/transação; handles/no-replace/quarentena continuam
obrigatórios e review independente mais prova nativa antecedem a conclusão.
A captura histórica imutável Node/libuv é somente LAB e inválida como prova de
produção; ela não substitui a implementação bounded, o consumidor real de
quality/delivery, o validator, a prova Linux ou os gates de AC-006, nem invalida
automaticamente uma prova corrente reconhecida pelo receipt live. A fase, o status
e a promoção live de T-006A vêm exclusivamente de `.omp/state/tdd/progress.json`
e do receipt corrente. T-007 só reutiliza o bootstrap para metadata/operações
filesystem dos hooks, nunca para admitir Git por herança; `nlink=1` legado é
preservado e guard desconhecido falha fechado.

## Onda 3 — alinhamento, wire nativo e distribuição

| ID | Descrição | AC de aceitação | Supports | Dependências | `allowed_write_globs` | Prova/saída | Status |
|---|---|---|---|---|---|---|---|
| T-008 | Corrigir checkpoint alignment por namespace request/run e CAS; trocar oráculos de prosa por resultados observáveis em short/full/local/Git e routing/persistence, usando somente probes e casos atuais retidos. | AC-009 (behavioral) | AUD-020, W-01/W-02, CAP-001–005/016 | T-001/T-002 | `alignment/SKILL.md`; `alignment/references/routing-and-persistence.md`; `implementation-evidence/native-release/proof-index.json`; `implementation-evidence/native-release/alignment.mjs` | PV-009; PASS nativo delimitado em `31f9914f` cobre seis fontes, checkpoints A/B e recusa da captura corrompida; W-01/W-02 e promoção global permanecem pendentes; nenhum teste incidental removido é restaurado | PENDING |
| T-009A | Integrar política de runtime/perfis sem wire inventado: cutover `openai/`→`openai-codex/` nos 12 perfis, preservando IDs/ordem principal-fallback/effort, discovery project, precedência, `agentSource`, cinco structured, batch/flat condicional e `solutionSpace`; validar somente após todos os callers/documentos e bytes exatos. O checkpoint imutável verifica código existente no mesmo AC-012 e não substitui RED/TDD, serving físico/provider fallback ou Native/global; fase/revisão vêm do estado live | AC-012 (behavioral) | NATIVE-01–04, CAP-013/014 | T-001/T-002/T-003/T-008 | `alignment/agents/requirements-reader.md`; `architecture/SKILL.md`; `architecture/agents/architect.md`; `secure-linux-web-hosting/SKILL.md`; `secure-linux-web-hosting/agents/host-operator.md`; `tdd-orchestrator/SKILL.md`; `tdd-orchestrator/agents/*.md`; `tdd-orchestrator/references/model-policy.md` | PV-012; `actual:null` não fecha campo essencial e não é preenchido por inferência | PENDING |
| T-009B | Integrar wire peer TDD estruturado e deep-review: no `deep-review/lib/protocol.mjs`, estender apenas `validateReviewerResult(result, expected)` com `expected` REQUIRED e independente na forma `{agent, protocol_mode, reviewed_revision}`; sem argumento omitido/default/derivação do candidato. O ramo explícito `expected.protocol_mode === "TDD_PEER_REVIEW"` + `peer-reviewer` preserva status `APROVADO`/`BLOQUEADO`, `reviewed_revision`, `explanation`, `confidence`, `overall_correctness` e `findings`; manter deep `VALID`, agregação/par e fallback/retry distintos, sem adapter/shim ou módulo novo | AC-013 (behavioral) | NATIVE-05/06/09, CAP-018/020 | T-009A | `deep-review/references/review-axes.md`; `deep-review/lib/protocol.mjs`; `deep-review/agents/deep-reviewer.md`; `tdd-orchestrator/agents/peer-reviewer.md`; `scripts/review-instances.test.mjs`; `scripts/deep-review.test.mjs` | PV-013; malformed corrigido não é negativo e `VALID` não é convertido | PENDING |
| T-009C | Reconciliar branch/PR no mesmo SHA, Fase 0/OK, DOC e DONE por IMPLEMENTED/VALIDATED; reabrir prova stale. O RED original indisponível é arquivado como histórico e um checkpoint de código existente não fecha AC-014 | AC-014 (behavioral) | NATIVE-07/08, CAP-007/019/027 | T-009A/T-009B | `deep-review/SKILL.md`; `ship/references/integrated-delivery.md`; `tdd-orchestrator/references/handoff.md`; `tdd-orchestrator/references/execution-and-resume.md` | PV-014; revisão/validator final exigem fonte e consumidores reais | PENDING |
| T-010A | Resolver proveniência/licença: apontar caminhos locais de AMENDMENTS; substituir autoralmente as nove referências React com texto/exemplos novos baseados em fontes primárias, sem copiar expressão criativa upstream nem inventar determinação jurídica; excluir o artefato adaptado/auxiliar obsoleto por cutover; `retain-declared-MIT` não é adotado | AC-011 (normative) | AUD-022, R-02, CAP-023/035 | T-004 + fonte primária fixada | `deep-review/AMENDMENTS.md`; `tdd-orchestrator/SOURCE.md`; `deep-review/SOURCE.md`; referências React autorais; `README.md` (serial com T-010B) | PV-011; qualquer review/reconciliação só vale no escopo do receipt live; AC-011 global/catalog/Native/legalidade permanecem dependentes | PENDING |
| T-010B | Alinhar engine do tooling, lock, CI/release e probes comportamentais retidos; separar OMP de Node; exercitar enforcement real, não existência de job textual. | AC-015 (behavioral) | AUD-021, AUD-031, W-04, R-05, CAP-026/038 | T-009A + T-010A | `package.json`; `package-lock.json`; `.github/**`; `scripts/bootstrap-config.test.mjs`; `implementation-evidence/native-release/profiles.mjs`; `implementation-evidence/native-release/proof-index.json`; `scripts/release-integrity.test.mjs`; `README.md` (serial com T-010A) | PV-015; dependências/advisories no escopo declarado; probes/index são fonte, sem oráculo textual/deletado | PENDING |

T-008/T-009A/T-010B são `[P]` onde os globs forem disjuntos; T-009B é serial
após T-009A, T-009C é serial após B. T-010A/B compartilham README e são
sequenciais. Tarefas normativas possuem um único AC normativo cada.

## Onda 4 — nativo, docs, suíte e Ship

| ID | Descrição | AC de aceitação | Supports | Dependências | `allowed_write_globs` | Prova/saída | Status |
|---|---|---|---|---|---|---|---|
| T-011 | Executar avaliação autenticada do pacote em projeto descartável com OMP v18.18.6: validar cutover completo dos 12 callers/documentos, bytes/hashes exatos, discovery/precedência, 10/12, task/yield/batch-ou-flat/async/isolamento, serving e reviews; validar wire TDD (`TDD_PEER_REVIEW`, `peer-reviewer`, APROVADO/BLOQUEADO e malformed) e deep `VALID` separadamente; validar rota externa readonly AC-021 sem publicação. Helper de alinhamento, se usado, é fixture privada e não prova Native; fallback/retry e E2E são gates separados | AC-016 (behavioral) | NATIVE-01–10, R-01/R-03/R-06, AC-012/013/014/019/021 | T-008/T-009A/B/C/T-010A/B/T-006C + review independente | `implementation-evidence/native-release/**` (nunca HOME real) | PV-012–PV-016/PV-018; `agentSource:user` bloqueia prova local, auth histórica não autoriza retry e plano não prova remoto/readiness/IDs/release | PENDING |
| T-014 | Rodar a suíte pertinente descoberta pela configuração/fonte atual, Node nativo aplicável e positivos Windows legítimos sem bypass; produzir ledger versionado de escopo, revisão, resultados e limitações. Capturas anteriores à mudança pública permanecem históricas e não promovem Native/global/release | AC-017 (behavioral) | R-05/R-06, CAP-017/019/025/041 | T-005–T-011 | `none` | PV-008/PV-015; não editar/remover testes para obter verde |
| T-015 | Medir startup/tempo/recursos/retries/review/guard overhead, incluindo primitive/helper antes de habilitação e ausência de trabalho duplicado; não alegar eficiência de modelo sem medição | AC-020 (behavioral) | CAP-010/030, R-05 | T-005/T-007/T-011/T-014 | `implementation-evidence/metrics/**` | PV-017; usar cutoff público imutável e receipts privados futuros, sem alegação de ganho de versão/modelo/custo | PENDING |
| T-012A | Atualizar matriz/spec/guia/catálogo e ledger com todos 33 AUD/4 W/6 R, 10/12/42/18, NATIVE e o mapa `openai-codex`; preservar história e marcar evidência por nível. | AC-018 (normative) | CAP-019/023/040, todos IDs | T-011/T-014/T-015 + review independente | `specs/specs005-omp-compatible-release/**`; `docs/capability-matrix.md`; `docs/functional.md`; `docs/omp-compatibility.md` | PV-017; somente docs atuais autorizados nesta onda, não na Fase 0 | PENDING |
| T-012B | Fechar seis controles de segurança, decisão R-02, fronteira FS/Windows e motivos de bloqueio; manter unknown/PENDING quando sem prova. | AC-019 (normative) | R-01/R-02/R-03/R-04/R-06, CAP-024/026/034 | T-004/T-005/T-007/T-010A/T-011/T-014/T-015 | `docs/functional.md`; `docs/omp-compatibility.md`; `tdd-orchestrator/SOURCE.md` (serial com T-012A) | PV-005/PV-008/PV-011/PV-016; nenhum waiver silencioso | PENDING |
| T-013A | Preparar artefato aprovado de prontidão pré-publicação para baseline/branch/intake issue/rename/PR e evidência Ship; não afirmar release terminal | AC-001 (normative) | CAP-001/027/038, R-04 | P-004 + T-012A/B + review/validator final | `.git/ship-review-evidence.md`; `implementation-evidence/release-governance/**` | PV-001/PV-016; verifica intake e prontidão, não AC-001 `RELEASE_CONFIRMED` |
| T-013B | Executar a responsabilidade Ship externa somente após consumir o artefato aprovado de T-013A e todos os gates pré-publicação reais; feature CI, merge e evidência terminal fecham AC-001 e o pacote de AC-016; sem merge local/deploy de host e sem tratar `plan` como prontidão; sem dependência cíclica de AC-001 pós-release | AC-016 (behavioral) | CAP-027/028/029, R-01/R-04, AC-021 | T-013A + T-006C + gates pré-publicação reais + decisão expressa do usuário | `.git/ship-review-evidence.md` (serial com T-013A) | PV-016/PV-018; release terminal `CONFIRMED` ou `PENDING_USER`, nunca inferido; AC-021 só descreve steps `NOT_EXECUTED` | PENDING |
| T-013C | Conferir e registrar a confirmação terminal observada de T-013B; fechar AC-001 somente com receipt `CONFIRMED`, mantendo-o aberto em `PENDING_USER` ou ausência de prova. Conferência documental separada do assignment comportamental, sem nova publicação | AC-001 (normative) | CAP-028/029, R-04 | T-013B terminal observado | `implementation-evidence/release-governance/**` (serial com T-013A/B) | PV-016; revisão semântica independente do receipt e hash/revisão atuais; não é gate pré-publicação | PENDING |

T-014 e T-015 antecedem T-012A/B e T-013A/B; nenhuma PR, auto-merge ou
release começa antes da suíte pertinente descoberta, métricas, review e
validator. Capturas anteriores à mudança pública da fonte são ledgers
`HISTÓRICOS`/escopados; testes incidentais removidos não retornam como oracle.
GREEN local só fecha a própria tarefa/AC e não promove onda, Native, segurança ou
release. T-006C só emite `PLANNED` após quality/context real e não afirma
readiness, remoto, IDs, publicação ou release.

R-02 e revisões bounded valem apenas no escopo do receipt live; recuperação de
contrato 0.2/no-SHA é histórica. A baseline de autenticação é histórica, não
RED nem retry técnico. NATIVE-09 exige retry técnico elegível separado dos
fallbacks; NATIVE-10 exige pacote integrado e retorno aceito.

T-013A cria artefato aprovado de prontidão pré-publicação, mas não fecha AC-001.
T-013C é owner da conferência terminal de AC-001 após T-013B: registre o receipt
observado `CONFIRMED`; `PENDING_USER` mantém AC-001 aberto. Esse assignment
normativo é separado do comportamental AC-016 e não inventa teste de runtime.
Nenhuma dessas instruções reexecuta tarefas históricas.
T-013B é a
responsabilidade Ship externa: consome esse artefato e todos os gates
pré-publicação reais; feature CI, merge e evidência terminal fecham AC-001 e o
pacote de AC-016, sem dependência cíclica de AC-001 pós-release.

| Tarefa existente | Regra de prova compatível | AC/provas |
|---|---|---|
| `T-009A` | Consumir o wire pinado do OMP 18.18.6 com inline `AgentToolResult.details.results` como `SingleResult` canônico; manter o canal custom `message_end.message.role: "custom"`, `customType: "async-result"` e `details.jobs[]` como `source_kind: "task_async_result"` privado, sem inventar DTO/ownership. Acrescentar o canal documentado `tool_execution_end` do Root `wait`, `result.details.op: "wait"` e `result.details.jobs[]` como `source_kind: "task_wait_result"` privado, preservando o snapshot SDK bruto com somente as chaves expostas (`id`, `type`, `status`, `label`, `durationMs`, `intent`, `settledAtMs`, `exitCode` numérico, `resolvedModel`, `resolvedModelIdentity`, `resolvedThinkingLevel`, `advisor`, `completionPercent`/`stage`, `requests`/`cost`/`contextTokens`/`contextWindow` quando aplicável, `widget`, `resultText`, `errorText`, `meta`, `structured` antes de consumo, `agentUrlId`, `agentOutputPublished`). Exigir `Root wait START/END`, `tool_call_id` real do wait, `isError` observado explicitamente `false`, parent Root TASK, índice, papel, source e assignment; `record.id`/`record.allocated_id` são a criança alocada e `record.jobId` é `job.id`, sem igualdade de IDs. O `host_binding` usa `source:"observed-root-dispatch-lifecycle"` e `root_task_end_is_error:false`, além da tupla Root observada. `agentUrlId` é hint de navegação e pode ser fallback do próprio job ID; só o tuple Root fortemente observado estabelece ownership. | AC-012; PV-012/NATIVE-01–04 | 
| `T-009B` | Aplicar o predicado compartilhado aos canais inline/custom/wait: somente terminal `completed` real com ownership único e schema/payload válido pode concluir. Perfis estruturados exigem `structured.status: "valid"`, source/mode reais e data apropriado; a exceção `validator`/`spec-kit-author` sem schema ainda exige Bash/arquivo/papel independente. `wait.isError === false` é sucesso do transporte, não do filho. Status ausente, running, failed, cancelled, schema malformado/inválido, payload indisponível, job errado/stale, erro/aborted/isError/exit ausentes ou resultado isolado não se completam; ausentes ficam `null`/não observados, e só `exitCode` numérico observado é preservado. Deduplicar wait/custom equivalentes uma vez; contradição, duplicata, limite de quantidade/16 MiB ou ownership ambíguo bloqueia. | AC-013; PV-013/NATIVE-05/06/09 |
| `T-011` | Validar no pacote OMP v18.18.6 os três canais sem tratá-los como aliases: inline e custom existentes, mais o `wait` terminal bruto. Correlacionar Root TASK START/END, Root wait START/END, `tool_call_id` do wait, session, parent call, índice, `agent`, `agentSource`, assignment e job/agent IDs reais; aguardar settlement e Root terminal mais recente sem promovê-los a resultado. Não sintetizar task record de Root stdout/prosa, progress, `extractedToolData`, lifecycle `completed`, UPDATE, quiescência ou wait `isError:false`; `get_messages`, polling, force-sync e overrides não são necessários. Exigir `isAuthoritativeTaskRecord`/`taskRecordSucceeded` real para `task_wait_result`, retenção raw limitada e deduplicação/contradição fail-closed. | AC-016; PV-012/PV-013/PV-016/NATIVE-01–10 |
Se `firstJobId` for exposto pelo host, ele vale somente para o primeiro job;
jobs subsequentes usam sua própria identidade observada.
Para o primeiro job, conferir também `Root END.details.async.jobId`; em batch,
não associar esse único valor a todos os agentes.
O payload de lifecycle e `Root END.details.progress[]` são as fontes
observadas de `id`, `parentToolCallId`, `index`, `agent` e `agentSource`;
`details.jobs[]` não é enriquecido com esses campos.
Essas fontes servem somente para binding/identidade observada; não são fonte
de terminalidade, payload estruturado ou completion.
O gate exige leitura Root bem-sucedida em `START/END` antes do dispatch e
leituras do mesmo filho/alocação, índice e pai; comparação usa trim e CR-to-LF
documentados, preservando o hash bruto do `START`.

O handoff usa forwarding literal do item canônico e o descritor host-written
imutável com run, revisão, nonce, contexto, fingerprints, regra de tag e
leituras obrigatórias. Não se cria `taskFile`, async desabilitado, perfil
blocking ou override de modelo, ferramentas ou SDK. A compatibilidade do wire
é regra de consumo, não promoção: `PENDING_NATIVE` só muda com prova real e
retorno aceito. A guard de UPDATE anteriormente encerrada como incompatibilidade
é um falso positivo histórico; sua captura e falhas anteriores permanecem
preservadas. O contrato detalhado fica no receipt privado arquivado.


## Índice de cobertura sem leftovers

| Conjunto | IDs | Tarefa(s) dona(s) | AC de aceite |
|---|---|---|---|
| Execução/raízes | AUD-001, AUD-011 | T-001 | AC-002 |
| Qualidade/receipts/CLI | AUD-002, AUD-012, AUD-032, W-03 | T-003 | AC-004 |
| Estado/migração | AUD-006–010 | T-002 | AC-003 |
| Installer | AUD-003, AUD-015, AUD-016 | T-005 | AC-005 |
| Backup/Ship | AUD-004, AUD-013, AUD-014 | T-006A, T-006B | AC-006, AC-007 |
| Hooks/Windows | AUD-017–019 | T-007 | AC-008 |
| Alignment/oráculos | AUD-020, W-01, W-02 | T-008 | AC-009 |
| Tooling/CI | AUD-021, AUD-031, W-04 | T-010B | AC-015 |
| Proveniência | AUD-022, R-02 | T-010A/T-012B | AC-011/019 |
| Referências | AUD-005, AUD-023–030, AUD-033 | T-004 | AC-010 |
| Nativo/enforcement | NATIVE-01–10, R-01 | T-011/T-012B | AC-016/019 |
| Confiança/FS | R-03 | P-003/T-005/T-007 | AC-005/019 |
| Ship/rollback/plano readonly | R-04 | T-006A/B/T-006C/T-013A/B | AC-001/006/007/016/021 |
| Supply chain | R-05 | T-010B/T-014/T-015 | AC-015/017/020 |
| Windows operacional | R-06 | P-003/T-007/T-011/T-014 | AC-008/017/019 |
| Rota externa readonly | NATIVE-10 external route, PV-018 | T-003/T-006B/T-006C/T-011 | AC-021 |

**Conferência:** `AUD-001`–`AUD-033`, `W-01`–`W-04`, `R-01`–`R-06` e
`NATIVE-01`–`NATIVE-10` aparecem no índice ou nas linhas de tarefa. O catálogo
10/12/42/18 e todos os AC, incluindo AC-021, estão na spec e no
PV-011/PV-012/PV-017/PV-018.

## Definition of Done da feature

- Todas as tarefas alcançam DONE com AC final, provas atuais e blockers vazios;
  nenhum `NA` normativo é usado em tarefa com mais de um AC ou para substituir
  comportamento.
- Cada onda passa integração, review independente e validator; mudança posterior
  invalida somente provas dependentes e reabre o gate.
- T-014 distingue qualquer ledger histórico de uma execução descoberta na
  fonte/configuração vigente e versionada; mudança de fonte reabre a prova.
  T-015 registra apenas medições reais e o cutoff público de
  `retained-observations.json` permanece imutável.
- T-006C deve rejeitar argumentos/flags inválidos antes de efeitos, exigir
  `validateShipQuality` real com report/context obrigatório e emitir somente
  `PLANNED` readonly com sete steps `NOT_EXECUTED` no sucesso. Erro real,
  argumento inválido ou prova stale/missing é não-zero, sanitizado e nunca
  `PLANNED`; essa saída não confirma remoto, readiness, IDs, publicação ou
  release.
- T-011 exige OMP 18.18.6, schema/configuração real, retornos brutos e provas
  NATIVE-01–10; serving físico/provider fallback permanecem `NOT OBSERVED` sem
  evidência. NATIVE-09 exige retry técnico elegível e NATIVE-10 pacote
  integrado aceito. `actual:null`, `agentSource:user`, yield ou fixture não
  são PASS.
- O wire mantém `outerSubagentEventPayload.id` como identidade pública, sem
  `TaskID`/`task_id` fabricado em eventos nested. Lifecycle antecipado fica
  pendente até Root START/END e tuple completo; UPDATE posterior legítimo não
  cria conclusão de filha; frame não retido permanece desconhecido.
- T-009C mantém RED histórico e checkpoint de código existente separado do
  AC-014. T-009A mantém a mesma separação sob AC-012; nenhuma hash/contagem
  privada é copiada para esta tabela.
- R-02, reviews, gates e qualquer classificação de tarefa vêm do receipt live.
  Nenhuma prova parcial, assembly scoped ou baseline de autenticação fecha
  AC-011 global, Native, segurança ou legalidade.
- T-013A só prepara prontidão pré-publicação. T-013B consome o artefato
  aprovado e todos os gates pré-publicação; feature CI, merge e evidência
  terminal fecham AC-001 e o pacote de AC-016. `RELEASE_CONFIRMED` permanece
  critério terminal, não é inferido do plano.

## Referências de evidência

- `.omp/state/tdd/progress.json` e o receipt corrente são a autoridade para
  fase, autorização, revisão, gates e fechamento; estes arquivos privados não
  são distribuídos nem entradas de fixtures Native.
- `canonical-docs-before-renewed-cleanup.json`,
  `related-docs-before-renewed-cleanup.json` e
  `resumed-t-012a-renewed-doc-cycle.json` são arquivos privados de proveniência
  histórica. Não copiar seus logs, hashes ou contagens para este documento.
- `implementation-evidence/release-governance/final-platform-suite-summary.json`
  e `implementation-evidence/metrics/retained-observations.json` são ledgers
  públicos/versionados com escopo e cutoff próprios; não são autoridade de
  status corrente nem prova Native integrada.
- Contratos e requisitos relacionados: [spec.md](./spec.md),
  [plan.md](./plan.md) e [interface-contract.md](./contracts/interface-contract.md).
