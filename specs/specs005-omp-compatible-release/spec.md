# Spec: specs005-omp-compatible-release

> **Feature:** `specs005-omp-compatible-release`
> **Versão:** 0.7.0 (approved amendment; unreleased)
> **Status:** APPROVED AMENDMENT — UNRELEASED
> **Autor:** spec-kit-author
> **Data:** 2026-11-16
> **Issue:** #47
> **Branch ativa:** `feat/47-omp-compatible-release`
> **Aprovação:** plano e contrato aprovados pelo usuário; decisões materiais de
> bootstrap, backup, provider e wire estão preservadas nos receipts privados
> versionados. Esses receipts são proveniência e nenhuma decisão reaprova
> automaticamente implementação, revisão, gates, Native ou release.
> **Aprovação do aditamento 0.6.0:** registrada no receipt privado
> `.omp/state/release-47/proofs/contract-0-6-native-wait-user-approval.json`
> (`contract_amendment: "Aprovo"`, `confirmation: "Aprovo"`). A aprovação é
> somente documental: não é Native PASS, não dispensa gates, não publica e não
> altera modelo, effort, perfis, autenticação ou estado live.

> **Aprovação do aditamento 0.7.0:** receipt privado
> `.omp/state/release-47/proofs/contract-0-7-native09-backend-user-approval.json`
> (`contract_amendment: "approve_scoped_native09_backend_completion_0_7"`,
> `confirmation: "Aprovado"`). O escopo é somente a evidência privada
> delimitada de NATIVE-09; não é aprovação semântica do reparo, Native PASS,
> dispensa de peer/validator, publicação ou release.
 
> **Autoridade documental:** este artefato descreve requisitos, decisões de desenho e critérios de aceite; ele não é um ledger operacional. O estado live de tarefas, AC, gates, autorização e promoção é lido exclusivamente de `.omp/state/tdd/progress.json` e do receipt corrente que esse estado referencia. Esta spec não duplica contagens live, orçamento, IDs de tentativa ou hashes de candidato.
>
> **Escopo invariável:** Goal 47 mantém 22 tarefas, 21 critérios de aceite, 10 skills, 12 perfis, 42 capacidades, 18 fontes, 6 controles de segurança; a base `0.5.0` recebe somente os aditamentos privados `0.6.0` e `0.7.0`, ainda não lançados. Os rótulos iniciais `PENDING`, `PENDING_NATIVE`, `BLOCKED` e `actual:null/unverified` continuam estados normativos do contrato; não são alterados por uma troca global de prosa.
>
> **Histórico de evidência (as-of 2026-11-15):** janelas Native bounded, tentativas canceladas e diagnósticos de observabilidade foram preservados como falhas ou observações delimitadas, sem aceitação Native, E2E, gate ou release. O checkpoint de T-009A é verificação imutável de código existente sob AC-012, não RED/TDD original, prova de serving nem prova global de AC. O checkpoint de T-009C preserva o RED original indisponível como histórico e não fecha AC-014. Diagnósticos source-only, inclusive o diagnóstico antigo de caminho Root e argumentos `UNRETAINED`, não são execução Native e não reconstroem causa ou payload perdido. T-006A, T-006C, T-004 e T-009A não recebem promoção documental; qualquer fase, review ou contagem histórica é apenas snapshot datado.
>
> As capturas de suíte/plataforma e os registros de implementação anteriores à mudança pública de fonte permanecem históricos e escopados; o ledger versionado `implementation-evidence/release-governance/final-platform-suite-summary.json` não é uma suíte atual nem aceitação Native/global. O ledger público de métricas `implementation-evidence/metrics/retained-observations.json` conserva seu cutoff imutável (subset Native-2 e amostras seriais guardadas), sem inferir LLM, custo, throughput ou retry global; observações futuras pertencem aos receipts privados correntes e não reescrevem esse cutoff. Valores desconhecidos/null permanecem desconhecidos, nunca `0`.
>
> Os receipts e aprovações privados arquivados em `.omp/state/release-47/proofs/`, junto dos registros `local://` de autorização e equivalência, são proveniência, não artefatos públicos distribuídos nem entradas de fixture para agentes Native. A reprodução exata de payloads e hashes fica nesses arquivos; esta spec referencia-os por caminho quando necessário, sem copiar a narrativa operacional. Mudança de fonte, contexto, ambiente ou independência reabre a prova afetada. A autorização para qualquer nova avaliação é válida somente quando o receipt corrente e `progress.json` a registram; autorização não dispensa gates, credenciais, mudanças globais ou publicação.
>
> **Decisões de escopo preservadas:** `ship plan` é somente leitura e externo; serving físico/fallback de provider permanecem limites explícitos `NÃO OBSERVADO`, sem alterar os 12 perfis ou dispensar o retry técnico; o checkpoint atual de T-009C pode registrar o código existente sem inventar RED. T-013A prepara um artefato de prontidão pré-publicação, enquanto T-013B consome esse artefato aprovado e todos os gates pré-publicação reais; T-013C confere a confirmação terminal de AC-001 depois de T-013B, sem condicionar a publicação à prova pós-release.
>
> Referências cruzadas: [plan.md](./plan.md), [tasks.md](./tasks.md), [interface-contract.md](./contracts/interface-contract.md), [matriz de capacidades](../../docs/capability-matrix.md), [guia funcional](../../docs/functional.md) e [guia OMP](../../docs/omp-compatibility.md).

## Governança de evidência

Os documentos públicos distinguem requisito, desenho, procedimento e prova. `ESTÁTICA` descreve fonte/contrato lido; `EXECUTADA` exige receipt com alcance; `HISTÓRICA` é uma captura datada; `NÃO VERIFICADA` não autoriza promoção. Os arquivos privados de operação não são distribuídos. Nenhum resultado source-only, fixture, mock, catálogo, yield de controle ou configuração declarada pode conceder permissão, ownership, conclusão Native ou release. O modelo de fallback de capacidade, fallback de provider e retry técnico são eventos distintos.

As regras duráveis para qualidade, segurança, TDD, OMP, filesystem, Ship e async seguem nas seções abaixo e no contrato; somente o estado operacional live pode mudar sua classificação.

## Decisões finais preservadas

O aditamento aprovado mantém quatro limites sem ampliar o escopo: a rota pública Ship `plan` apenas valida quality/context e emite plano declarativo; nova observação Native, se autorizada pelo receipt live, preserva todas as falhas e não reinicia histórico; serving/fallback de provider podem permanecer `NOT OBSERVED` sem PASS fabricado; e T-009C pode arquivar o RED indisponível e registrar a implementação existente sem alegar conclusão. A versão, assinaturas, wire, schemas, modelos, perfis, flags e TCBs não mudam.

## Histórico arquivado e não autoritativo

O resumo datado acima é a única narrativa histórica nesta spec. Os detalhes permanecem nos receipts privados de `release-47` e nos ledgers públicos versionados; não copie esses logs para esta spec nem siga URIs `local://` ou caminhos `.omp` como fixtures Native.

## Contexto e objetivo

A auditoria integral do UsefulSkills delimitou 33 achados (`AUD-001`–`AUD-033`),
quatro lacunas de cobertura (`W-01`–`W-04`) e seis riscos de fronteira
(`R-01`–`R-06`). Resultados de suíte e preflight históricos não são repetidos
nem promovidos a PASS; a suíte final deve descobrir o conjunto vigente na fonte
e registrar escopo, revisão e limitações.

Esta spec define a preparação da release compatível com o alvo **OMP 18.18.6**
no ambiente Windows 10.0.26200 x64. O fato de host/runtime ou binário pinado ser
observado não prova instalação, serving ou release. Toda validação de versão
deve registrar fonte, comando, configuração, revisão e saída, sem inferir
parâmetros ocultos. Compatibilidade futura, universal ou com outro modelo não é
prometida.

A prova dos 12 perfis locais usa projeto descartável com cópias exatas em
`.omp/agents` e `.omp/skills`, precedência `project>user` e hashes
antes/depois; `agentSource:user` não prova pacote local. Perfis stale,
ausentes ou fora do escopo project são limites de uma captura, não estado live
da feature.



### Decisão material: provider dos 12 perfis geridos (0.4.0)

A decisão `pin_openai_codex` autoriza somente o cutover dos prefixos de
provider nos 12 perfis geridos: `openai/` passa a `openai-codex/`. Os IDs
existentes (`gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-astra`), a ordem
principal/fallback, `thinkingLevel`/esforço, schemas/output e os cinco perfis
`structured:true` permanecem inalterados. `inheritRoot` não foi escolhido:
não há herança de settings/aliases globais, override por chamada, cópia de
credenciais ou substituição de helpers/builtins.

O catálogo e a descoberta dos perfis não são prova de serving. A validação
exige cutover integral dos 12 callers/documentos, bytes exatos e hashes
antes/depois, registrando somente a alteração de provider autorizada. Serving
efetivo e fallback físico permanecem não observados até receipt real; fallback
de capacidade, fallback de provider e retry técnico são categorias distintas.

Diagnósticos privados de autenticação do provider anterior e observações peer
positivas/negativas são históricos e escopados. Uma saída malformed corrigida
pelo agente não conta como rejeição Native, e uma observação peer positiva
parcial não fecha NATIVE-05 nem aceitação global. O estado dos gates e do
AC-011 é lido do estado live, não deste parágrafo nem de receipts privados.
### Decisão material: wire peer TDD estruturado (0.5.0)

`local://ship-peer-wire-approval.json` registra a escolha explícita
`native_structured_clean_cutover`: o TDD normal usa o yield nativo estruturado
com `protocol_mode: "TDD_PEER_REVIEW"`, `agent: "peer-reviewer"` e status
`APROVADO`/`BLOQUEADO`. O objeto preserva o schema atual do frontmatter:
`reviewed_revision`, `explanation`, `confidence`, `overall_correctness` e
`findings`, além de `protocol_mode`, `agent` e `status`.

Não há exigência de primeira linha textual, adaptador/shim oculto, conversão
textual, desativação dos cinco perfis estruturados ou módulo novo. Os modos
`DEEP_REVIEW` continuam com `VALID` e yield incremental; `aggregateReview` e
`aggregateReviewInstances` continuam exigindo o par/protocolo deep e rejeitam
dados TDD normais.

`local://ship-native-peer-codex-positive.json` fornece evidência nativa positiva
parcial: `agentSource:project`, `agent: peer-reviewer`, modelo resolvido
`openai-codex/gpt-6.1-sol`, `protocol_mode: TDD_PEER_REVIEW`, status
`APROVADO`, revisão, correção, explicação, confiança e `findings: []`. O
artefato declara `globalAcceptance: PENDING`; portanto isso não é PASS do
NATIVE-05. A compatibilidade textual legada permanece explicitamente
**SUPERSEDED**, não comprovada nem convertida em PASS; cenários `BLOQUEADO` e
precisam de prova.

Essa extensão é limitada ao validador/caller existente:
`validateReviewerResult(result, expected)` mantém assinatura e envelope públicos.
`expected` é **REQUIRED**, independente e tem a forma
`{agent, protocol_mode, reviewed_revision}`; não há argumento omitido, default
TDD, inferência ou derivação desses valores do resultado/candidato nativo. O
ramo TDD só ocorre com `expected.protocol_mode === "TDD_PEER_REVIEW"` e agente
esperado `peer-reviewer`; status real e validação fail-closed de
chaves/revisão/findings são preservados. Os modos deep continuam `VALID`
incremental e os agregadores continuam exigindo o par deep.


A baseline reutilizável é a identidade registrada no snapshot privado
arquivado; sua existência não é aprovação de código, qualidade ou runtime
nativo. Evidência anterior só pode ser reutilizada quando conteúdo, critérios,
ambiente, identidade e independência forem iguais; caso contrário, a prova
dependente é reaberta. Não reproduzir aqui o hash ou a contagem do snapshot.
O escopo de entrega é externo pelo fluxo Ship, com `merge_target: main`. A branch
ativa `feat/47-omp-compatible-release` deve ser preservada sem reset, stash ou
clean destrutivo.
Issue e eventual renomeação/associação de branch só ocorrem depois da aprovação explícita do plano
e do contrato, sem descartar o trabalho existente. O release terminal e eventual
instalação no perfil real continuam decisões explícitas do gate final.

### Restrições desta autoria (Fase 0)

Nesta atribuição, escrevo somente os sete caminhos canônicos de
`specs005` (os quatro artefatos Spec Kit e
`docs/capability-matrix.md`, `docs/functional.md`,
`docs/omp-compatibility.md`). Não executo build, lint, formatter, testes,
OMP/LLM, instalação, Git/GitHub, issue, PR, merge, release, deploy, SSH ou
host, e não altero código, configuração, `progress.json`, `progress.md`,
`specs001`–`specs004`, settings globais, aliases, PATH, credenciais ou
configuração do usuário. Os aditamentos `0.6.0` e `0.7.0` são somente
documentação de compatibilidade aditiva; nenhuma autorização de implementação,
Native, publicação ou alteração de API pública decorre deles. As ondas
posteriores abaixo são o escopo planejado da entrega e só começam após
autorização explícita registrada pelo estado live.

## Locks editoriais desta execução

- **T-005 — namespace reservado:** o helper interno de transação filesystem, ainda não implementado e sem API pública nova, fica reservado em `tdd-orchestrator/lib/fs-transaction/**` (incluindo `generated/**` somente se necessário). Esta decisão não autoriza código, testes, instalação ou alteração de contrato.
- **T-007 — fixtures históricas de hooks:** o ownership e os `allowed_write_globs` incluem `scripts/fixtures/hooks-v040/**`, somente como testdata de upgrade/CAS com bytes exatos dos hooks v0.4.0 de `audit/release-v040/scripts/hooks/{commit-msg.mjs,pre-push.mjs}`; proveniência em `local://ship-released-hook-payloads-v040.json`. Não usar pré-imagens com sufixos de fonte modificada, recusadas por `isManaged` antes da injeção de falhas. É ajuste interno de globs, sem novo AC, API, wire, premissa ou promoção de gates.
- **T-010A — proveniência React:** o lock editorial cobre exatamente as nove referências React, `deep-review/{AMENDMENTS,SOURCE}.md` e `tdd-orchestrator/SOURCE.md`. A substituição é autoral nova, com texto/exemplos baseados em fontes primárias; não copia expressão criativa upstream nem inventa determinação jurídica. O resultado original de recuperação permanece **HISTÓRICO**. Qualquer revisão bounded ou reconciliação só vale no escopo registrado pelo receipt live; R-02 continua dependente da prova própria de AC-011 global/catalog/Native/legalidade. |


## Decisão material: bootstrap Windows de T-005/T-007

A decisão completa está em `local://ship-windows-tcb-approval.json`, com a
alternativa `explicit_os_host_tcb` escolhida pelo usuário. Ela autoriza como
premissa de bootstrap o instalador de T-005 e a inspeção de
metadata/operações filesystem dos hooks em T-007, usando o host exato Windows
PowerShell 5.1 sob `System32`, derivado de módulos do sistema operacional já
carregados e de contexto protegido do OS. Não autoriza sibling, não prova ACL
ou assinatura antes da execução do host e não cria confiança retroativa na
filha. A revisão `agent://NativeAdmissionReview` trata TCB explícito como
pré-requisito, não como prova ACL.

O bootstrap exige `NoProfile`, `NonInteractive`, `cwd` protegido do OS e
ambiente scrubbed por allowlist, sem perfis, injeções, `PATH` herdado ou
`ComSpec` alternativo, sem bypass; `FullLanguage` em x64 deve ser detectado e
qualquer divergência deve falhar fechado. A transação continua exigindo pin de
handles/ancestrais, no-replace e quarentena. O bootstrap restrito pode ser
reutilizado em T-007 somente para metadata/operações filesystem dos hooks, nunca
para admitir Git por herança. R7 admite somente o executável originalmente selecionado
exatamente em `C:\Program Files\Git\cmd\git.exe` ou
`C:\Program Files\Git\mingw64\bin\git.exe`; o shell MSYS pode selecionar
legitimamente o segundo. Em qualquer dos papéis, permanecem obrigatórios os dois
objetos (`cmd/git.exe` e `mingw64/bin/git.exe`), suas assinaturas e hashes, os
linksets completos, identidades, ACLs, ancestrais e o fechamento de DLLs. A guard
Não há reescrita de PATH, busca após recusa, alias executável, Git substituto ou
novo objeto confiável; o legado `nlink=1` é preservado, guard desconhecido falha
fechado e POSIX não é declarado equivalente. Qualquer cenário de wrapper,
consulta real do executável ou primitive em laboratório vale somente no escopo
do receipt e não aprova host, transação, integração ou release. A alteração
precisa de revisão independente e prova nativa antes da conclusão.

## Decisão material: plataformas de backup de T-006A/AC-006

A decisão do usuário está registrada em `local://ship-backup-platform-approval.json`
com `backup_platform_decision: "siga sua recomendação"` e fixa
`linux_python_tcb: "authorized_os_python3_isolated"`. Ela autoriza concluir,
antes do release, a publicação protegida no Windows e a publicação vinculada a
descriptor no Linux. Ela muda somente T-006A/AC-006; não replaneja a DAG nem
altera a API pública de `performBackup`.

No Windows, o staging deve usar a primitive Node/libuv com `EXLOCK|TEMPORARY`
mantida até o link/publicação. Não há fallback de `unlink` ou `rename` por
pathname em Node. `local://audit-check-ship-libuv-backup-primitive.json`
registra a primitive observada em Node `22.23.2`/uv `1.51`; a sonda de ancestral
nesse artefato é somente LAB e não aprova produção.

No Linux, a implementação deve provar staging anônimo vinculado ao file
descriptor e publicação atômica sem substituição. A única ajuda de runtime
autorizada é o Python3 fornecido pelo sistema, em isolamento `-I/-S` e contexto
de carregamento protegido, com allowlist scrubbed sem `PATH`, `PYTHONPATH`,
`PYTHONHOME` ou injeções `LD_*`; não instalar componentes, alterar settings,
criar serviço ou usar SDK. Capacidade ausente ou divergente do host, kernel ou
filesystem falha fechado; não há confiança em sibling nem fallback POSIX
conhecidamente inseguro. Esta decisão não declara compatibilidade geral POSIX ou
macOS: a prova Linux real é requisito antes do release.

Colisão, identidade bigint da origem, quiescência e a ausência de alegação de
consistência de DB/WAL permanecem obrigatórias. Se necessário, publisher/helper
privado pode ficar sob `ship/bin/`; o pipeline de bytes, herança de descriptor e
DTO terminal vinculado a nonce são internos e não pertencem ao wire OMP nem
criam campos públicos.


`specs004-quality-evolution` permanece a história In Review, incluindo seus fatos,
hashes e decisões. Esta spec substitui apenas a decisão ativa de **prontidão da
release e compatibilidade nativa**: não cria scheduler, launcher, serviço, SDK,
alias global, política de modelo por chamada ou transporte paralelo. As APIs
existentes de estado, execução, qualidade, revisão, retro, instalador e Ship
continuam as interfaces a preservar; qualquer alteração passa pelos consumidores.

## Convenções de evidência e classificação

| Rótulo | Significado nesta spec |
|---|---|
| **ESTÁTICA** | Código, contrato, fonte, inventário ou consumidor lido; não prova execução. |
| **EXECUTADA** | Comando/cenário observado nesta auditoria ou na validação futura, com saída bruta e alcance delimitado. |
| **HISTÓRICA** | Evidência anterior identificada por fonte/revisão; não é resultado atual. |
| **NÃO VERIFICADA** | Hipótese, capacidade do ambiente, segurança ou integração ainda sem prova. |
| **PENDING** | Fechamento planejado, ainda não aceito. |
| **BLOCKED** | Falha, desconhecimento material ou prova ausente impede a promoção; não há fallback silencioso. |

Critério `type: normative` exige revisão semântica independente, fonte/proveniência
e decisão documentada; não recebe RED artificial. Critério `type: behavioral` exige
asserção significativa sobre o comportamento real, regressão pertinente e suíte
completa no snapshot final. Fixture, mock de Git/GitHub ou teste da biblioteca não
equivale a compatibilidade OMP nativa. Nenhum `NATIVE-*` desta spec é PASS como
gate de release hoje; as observações delimitadas abaixo são evidência `EXECUTADA`
no escopo descrito e não promovem os gates.

## Evidência classificada e limites

As observações de runtime, fonte, plataforma e revisão só podem ser usadas no
escopo e na data do receipt que as gerou. `EXECUTADA` não significa promoção:
fixtures, mocks, source-only, peer positivo parcial, catálogo, yield de controle
ou configuração declarada não concedem permissão, ownership, conclusão Native,
AC global ou release. O estado live continua exclusivamente no estado TDD e no
receipt corrente; esta seção não publica contadores ou hashes de tentativa.

- A avaliação de perfis/wire deve distinguir `requested`, `resolved` e
  `observed`; `actual:null`/`unverified` é metadado ausente, não PASS. Os doze
  perfis, seus esforços/ordem, os cinco `structured:true` e o mapa de provider
  permanecem inalterados. Serving efetivo e fallback físico continuam limites
  explícitos quando não houver observação real.
- O checkpoint de T-009A é somente verificação imutável do código existente sob
  AC-012. O RED original e a revisão formal continuam governados pelo estado
  live; o checkpoint não é RED/TDD, serving, peer/validator global ou aceitação.
  T-009C arquiva o RED indisponível e não fecha AC-014.
- O ledger de suíte/plataforma anterior à mudança pública da fonte é
  `HISTÓRICO` e escopado. Uma execução futura deve descobrir o conjunto na fonte
  atual, produzir ledger versionado e aplicar AC-017; nenhum snapshot fixo
  substitui essa execução.
- `retained-observations.json` permanece um ledger público imutável com cutoff
  Native-2/subset-2 e as cinco amostras seriais guardadas. Ele não é métrica
  global de LLM, custo, throughput ou retry; observações futuras são receipts
  privados correntes. `null`/desconhecido nunca vira zero.
- As seis áreas de segurança, seus níveis de evidência e TCBs seguem
  fail-closed. Uma assembly de segurança ou review de fonte pública pode ser
  escopada, mas não é sandbox universal de OS, assinatura legal ou atestado
  global.
- Mudança de fonte, contexto, baseline, ambiente ou independência reabre todas
  as provas dependentes. Registros anteriores de T-006A, T-006C, T-004, T-009A,
  T-009C e helper permanecem referências históricas e não são reclassificados
  por esta documentação.

Os detalhes brutos e os hashes ficam nos arquivos privados arquivados e nos
ledgers públicos versionados, sem serem copiados para esta spec nem oferecidos
como fixture Native.
## Requisitos funcionais

- **RF-001 — Identidade e entrega:** preservar a baseline por bytes/revisão, separar histórico de prova atual e usar Ship externo somente após aprovação.
- **RF-002 — Execução e estado:** manter estado 2.3, DAG, recursos, locks, migração, retomada e promoção fail-closed, sem outro scheduler.
- **RF-003 — Qualidade e proveniência:** ligar baseline, delta, critérios, contexto independente, receipts e origem do retorno original; rejeitar autocertificação e prova stale.
- **RF-004 — Filesystem e snapshots:** impedir escrita fora do destino validado, troca de identidade e overwrite de conteúdo alheio; falha de primitive desconhecida bloqueia.
- **RF-005 — Ship e hooks:** validar argumentos/base/remoto, backup e wrappers Windows preservando guards, argv, credenciais, LFS, worktree e diagnóstico.
- **RF-006 — Segurança consultiva:** corrigir orientações contraditórias por fonte primária, sem vender GUC livre, índice universal, redirect textual ou timing não medido como garantia.
- **RF-007 — Paridade documental:** reconciliar 10 skills, 12 perfis, 42 capacidades e 18 fontes com owners, proveniência, licença e provas por linha.
- **RF-008 — Wire OMP:** usar somente o schema exposto por OMP 18.18.6; distinguir batch/flat, job/retorno terminal, `agent`/instância e isolamento observado.
- **RF-009 — Review e fallback:** o TDD normal usa peer estruturado com `protocol_mode: "TDD_PEER_REVIEW"`, `agent: "peer-reviewer"` e status `APROVADO`/`BLOQUEADO`; `VALID` permanece exclusivo dos modos deep-review, e fallback nativo de perfil permanece distinto de retry técnico. Não há requisito textual de primeira linha, adaptador oculto ou retry técnico por autenticação.
- **RF-010 — Aceite instalado:** após correções, crítica independente e aprovação, demonstrar NATIVE-01–10, pacote completo, fluxos short/full/local/external, falhas e retomada sem publicação acidental.
- **RF-011 — Suite e distribuição:** incluir `ship/bin/ship.test.mjs`, obter suíte completa verde com positivos Windows legítimos e fechar licença/proveniência/CI sem oracle textual correlacionada.
- **RF-012 — Observabilidade e eficiência:** registrar apenas medições reais de tempo, recursos, retries, jobs, modelos observados e custo; não alegar ganho por configuração declarada.
- **RF-013 — planejamento externo read-only:** oferecer apenas `node ship/bin/ship.mjs plan` com qualidade válida e plano externo declarativo; nenhuma etapa é executada, e erro de argumentos, qualidade ou contexto falha antes de efeitos.


## Critérios de aceite

Os critérios abaixo são novos para esta release. O mapeamento para os critérios
históricos de `specs004` é apenas rastreabilidade; não reescreve a história.

- **AC-001 — `type: normative` — baseline e entrega:** o snapshot final identifica a revisão e os bytes derivados de `local://ship-current-snapshot.json`; a branch ativa `feat/47-omp-compatible-release` é preservada; nenhum issue/rename/PR/release/instalação é iniciado antes da aprovação. Logo após a aprovação, o intake de issue/rename/associação é registrado antes da primeira implementação, sem alterar a branch; a entrega registra `external → main` e o release terminal é explicitamente `CONFIRMED`. `RELEASE_PENDING_USER` mantém a entrega aberta e não fecha este critério.
- **AC-002 — `type: behavioral` — execução segura:** uma tentativa escritora `RUNNING` sem job confiável continua ocupando seus recursos; escritor conflitante não aparece como pronto; `/` e `C:/` autorizam descendentes seguros sem abrir traversal; retornos desconhecidos, ausentes, duplicados ou stale mantêm a execução incompleta. `evaluateExecution` continua puro e não é tratado como scheduler.
- **AC-003 — `type: behavioral` — estado e migração:** `validateProgress`, `migrateProgress` e `canPromoteWave` mantêm schema 2.3 fechado, IDs/tarefas e ondas únicos, dependências conhecidas e provas válidas; `TEST_REF` é relativo e seguro, preserva título literal e um baseline inválido fornecido não é inventado; promoção exige integração, review e validator atuais.
- **AC-004 — `type: behavioral` — qualidade e receipts:** `validateQuality`, CLI, Ship e Retro recusam receipt cujo `source` foi trocado pelo contexto/report; revalidam bytes/identidade do report no instante de uso; `capture` rejeita aridade inválida; `delivery` exige contexto esperado independente e não aceita relatório autocertificado. `planning` não exige aprovação final prematura.
- **AC-005 — `type: behavioral` — instalador e fronteira filesystem:** preflight, staging, aplicação, rollback e inventário final vinculam identidade de ancestrais/destinos e não escrevem fora do HOME/checkout autorizado mesmo sob troca por junction/symlink; drift, hash ilegível ou concorrência bloqueiam sem substituir dados alheios. O helper Windows ancorado no host (handles relativos/ancestrais pinados e publicação NOREPLACE/rollback pelos mesmos handles) é apenas candidato: a primitive deve ser provada em ambiente descartável após RED contratual válido e antes de GREEN que dependa dela; bundle nativo é alternativa material que exige build/ABI/cópia standalone. Sem escolha e crítica independente, T-005/T-007 ficam BLOCKED; desconhecido não é PASS.
- **AC-006 — `type: behavioral` — backup:** `performBackup` mantém a API pública; o snapshot abre a origem identificada, verifica identidade bigint do descritor e quiescência aplicável antes de publicar o backup, e troca entre inspeção e uso é recusada. No Windows, staging Node/libuv usa `EXLOCK|TEMPORARY` até o link, sem `unlink`/`rename` por pathname; no Linux, exige staging anônimo vinculado a descriptor e publicação atômica sem substituição. A decisão de runtime é restrita ao Python3 do OS em `-I/-S`/contexto protegido, com allowlist scrubbed sem `PATH`, `PYTHONPATH`, `PYTHONHOME` ou `LD_*`; capacidade divergente ausente falha fechado, sem fallback POSIX inseguro ou promessa geral POSIX/macOS. A primitive Node `22.23.2`/uv `1.51` em `local://audit-check-ship-libuv-backup-primitive.json` é LAB, não aprovação de produção; prova Linux real é pré-release. Colisão, origem, quiescência e ausência de alegação de consistência DB/WAL permanecem obrigatórias; não se afirma consistência de banco ativo além da prova observada.
- **AC-007 — `type: behavioral` — Ship:** parser rejeita valor ausente ou próxima flag antes de efeitos; `new` atualiza e cria branch a partir de `origin/<default>` explicitamente resolvido, não de upstream implícito; preflight e quality precedem issue/branch/commit/push/GitHub.
- **AC-008 — `type: behavioral` — hooks e Windows:** fallback `.cmd` conserva argv em paths com espaços; o guard admite apenas o executável originalmente selecionado exatamente em `cmd/git.exe` ou `mingw64/bin/git.exe` (o shell MSYS pode selecionar o segundo) e exige os dois objetos, assinaturas, hashes, linksets, ACLs, ancestrais e fechamento de DLLs aprovados. Qualquer desconhecido retorna `E_UNSAFE_GIT_EXECUTABLE`, sem reescrever PATH, procurar após recusa, admitir alias executável ou Git substituto; legado `nlink=1` permanece.
- **AC-009 — `type: behavioral` — alinhamento e oráculos:** checkpoints Git têm namespace por request/run e publicação CAS ou bloqueio explícito; short/full/local/Git são observáveis por resultado, não por regex de prosa; W-01/W-02 recebem cobertura comportamental equivalente quando aplicável.
- **AC-010 — `type: normative` — referências de segurança:** RLS deriva identidade de fronteira confiável e delimita contexto transacional; recomendações de índice são condicionadas a plano/workload/EXPLAIN; Go, Express, Next Pages/App Router, Vue e React distinguem a semântica real de shell, limites, origem, bytes e hidratação. Cada orientação cita fonte primária e escopo; nenhuma solução de segurança desconhecida é aprovada.
- **AC-011 — `type: normative` — paridade e proveniência:** o catálogo mantém exatamente 10 skills, 12 perfis, 42 CAP e 18 fontes, com owner, gatilho, consumidores, referência seletiva, licença/proveniência e prova/limite por linha; `deep-review/AMENDMENTS.md` aponta caminhos locais reais. Para R-02, as nove referências React são autorais novas e o artefato adaptado/auxiliar obsoleto foi excluído por cutover. A recuperação original permanece **HISTÓRICA**; qualquer review/reconciliação bounded vale apenas no escopo do receipt live. Não adotar `retain-declared-MIT`, fabricar copyright ou promover limites não observados.


- **AC-012 — `type: behavioral` — compatibilidade de perfis e dispatch:** no OMP v18.18.6 instalado, cada um dos 12 perfis locais é descoberto com `agentSource:project`, precedência projeto/usuário registrada e hashes antes/depois; o mapa aprovado usa `openai-codex/` somente nos três IDs existentes, preservando principal/fallback, `thinkingLevel`/esforço e os cinco `structured:true`. `requested`, `resolved` e `observed` são fatos distintos: `actual:null`/`unverified` registra metadado ausente, mas não fecha o aceite correspondente. Exigir somente campos que o schema v18.18.6 expõe; registrar como limite qualquer campo de serving não exposto, sem inventá-lo. A validação final exige o cutover completo dos 12 callers/documentos, bytes exatos dos 12 perfis nativos e hashes correspondentes. O caller usa batch se exposto, ou flat equivalente, sem emitir campos ocultos; `solutionSpace` é obrigatório no schema atual. Variantes structured/async/isolated só entram quando o schema efetivo as expõe. No async, inline `details.results`, custom `message_end`/`async-result` e o terminal documentado de `wait` são canais distintos; o último pode ser normalizado apenas em evidência privada `task_wait_result`, preservando o snapshot bruto e a correlação Root observada. O checkpoint T-009A, quando referenciado, é apenas verificação do código existente no mesmo AC-012 e não substitui prova nativa, peer/validator ou conclusão do critério.
- **AC-013 — `type: behavioral` — wire de retorno e retries:** o TDD normal deve produzir um objeto estruturado com `protocol_mode: "TDD_PEER_REVIEW"`, `agent: "peer-reviewer"` e status `APROVADO` ou `BLOQUEADO`, preservando `reviewed_revision`, `explanation`, `confidence`, `overall_correctness` e `findings` do schema atual; o caller fornece `expected` REQUIRED e independente na forma `{agent, protocol_mode, reviewed_revision}`, sem default/inferência/derivação; status real não é convertido em `VALID`. `DEEP_REVIEW` continua com `VALID` incremental, e `aggregateReview`/`aggregateReviewInstances` rejeitam dados TDD normais. A prova positiva `local://ship-native-peer-codex-positive.json` é parcial (`globalAcceptance: PENDING`); compatibilidade textual legada está SUPERSEDED, não PASS. Cenários negativos, malformed, fallback nativo e retry técnico mantêm gates e identidades distintos. A aceitação async exige terminal `completed` realmente observado, ownership Root/assignment único, structured/schema válido quando exigido e payload disponível; `wait.isError === false` é somente sucesso do transporte `wait`, não sucesso do filho, e campos ausentes permanecem `null`/não observados.
- **AC-014 — `type: behavioral` — revisão e fases:** branch/base usa `local_revision_context.revision === head_revision`; PR usa diff e conteúdo integral no mesmo SHA; Fase 0 separa documentação de aprovação do plano; `DONE` de tarefa segue suas provas e `IMPLEMENTED`/`VALIDATED`, não apenas `COVERED`, enquanto promoção de onda exige integração/review/validator atuais; conteúdo alterado reabre provas dependentes.
- **AC-015 — `type: behavioral` — tooling, CI e distribuição:** engines descrevem o runtime efetivamente suportado pela suíte fixada; testes não confundem versão OMP com Node nem usam prosa/relatório próprio como oracle; CI exerce comportamento e enforcement real; licenças, NOTICE, SOURCE e dependências têm origem/limite documentados. `git-raw-commits` deprecated, tags de Actions e cobertura parcial de advisories permanecem riscos até avaliação autorizada.
- **AC-016 — `type: behavioral` — pacote integrado nativo:** depois da revisão final, a cópia autorizada e uma nova sessão OMP v18.18.6 demonstram NATIVE-01–10, catálogo completo, short/full/local/external, DOC/review/validate, retro com dono/opt-out, falha/retomada e referências; nenhum comando publica, instala no perfil real ou opera host sem autorização. A avaliação autenticada pode usar overlay temporário e atualizar cache/token nativo somente se essa fronteira for aprovada e registrada; um mock não satisfaz este critério.
- **AC-017 — `type: behavioral` — suíte final e Windows positivo:** a aceitação exige uma execução da suíte descoberta na fonte/configuração atuais, incluindo a cobertura pertinente de Windows e Linux, com ledger versionado que registre escopo, revisão, resultados e limites. Os ledgers e capturas anteriores à mudança pública da fonte permanecem `HISTÓRICO` e escopados; não são a suíte atual nem aprovação Native, global ou de release. O raw Windows antigo e qualquer asserção incidental de fixture não são restaurados. A confirmação terminal continua dependente dos gates e da evidência efetivamente produzida para esta revisão.

- **AC-018 — `type: normative` — evidência e rastreabilidade:** cada AC, AUD, W, R, CAP, fonte e NATIVE tem tarefa, prova esperada, fonte/revisão, owner e estado; o ledger preserva saídas brutas e distingue ESTÁTICA/EXECUTADA/HISTÓRICA/NÃO VERIFICADA. Nenhum `ok:true`, `VALID`, mock ou texto autodeclarado vira aprovação sem a barreira correspondente.
- **AC-019 — `type: normative` — gate de segurança e bloqueios:** os seis controles `requirements`, `security_tests`, `secrets`, `dependencies`, `threat_model` e `security_review` têm prova própria; P0/P1 ou desconhecimento material bloqueiam delivery; R-01/R-03/R-04/R-06 não recebem waiver silencioso; não se contornam guards Git, PATH, nlink, credenciais, egress, ACL ou isolamento.
- **AC-020 — `type: behavioral` — eficiência observada:** medir apenas startup, duração, recursos, retries, custo, tempo de review e overhead de guards efetivamente observados; demonstrar ausência de trabalho duplicado/scheduler paralelo e serialização apenas de conflitos. Configuração de modelo, batch ou isolamento não é métrica de ganho.
- **AC-021 — `type: behavioral` — plano externo somente leitura:** `node ship/bin/ship.mjs plan --root <workspace> --target <branch> [--report <relative>] [--context <relative>]` aceita `--root` opcional (padrão: cwd), exige `--target` não vazio e usa `.omp/state/quality.json` e `.omp/state/quality-context.json` como defaults. Cada flag ocorre no máximo uma vez; opções desconhecidas, posicionais, flag sem valor ou valor que seja a próxima flag são rejeitados antes de qualquer efeito. Fora de um workspace Git válido, inclusive em falha de argumentos, a rota não chama Git/GitHub/rede/child process nem escreve filesystem; somente esta rota ignora o `git rev-parse` de topo, e os comandos existentes permanecem inalterados. A rota chama o `validateShipQuality` real com `{required:true, reportPath, contextPath}`, sem fallback de relatório ausente/legado, e revalida existência, path, hash, proveniência e bytes no uso. Em sucesso, stdout contém somente `{schema_version:1,mode:"external",dry_run:true,status:"PLANNED",merge_target:<target solicitado>,quality:{status:"PASS",legacy:false},steps:[{step,status:"NOT_EXECUTED"}...]}` na ordem `issue,branch,commit,push,pull_request,ci,release`; isso é plano declarativo, não afirma branch/remoto/default/readiness nem fabrica SHA, issue/PR/release/serving, e não cria plano de deploy. Argumentos, report/context ausentes, inválidos ou stale terminam não zero, não emitem `PLANNED` e exibem somente diagnóstico sanitizado; erros reais nunca são declarados PASS.
O RED original e seus bindings permanecem preservados como `HISTÓRICO`; um
texto GREEN anterior não é prova global. T-006C continua uma rota de
implementação/prontidão cuja fase, revisão e resultado devem vir do estado live,
sem promoção Native, waiver ou alegação de 100%. AC-021 só fecha com a prova
própria do critério e os gates correspondentes.
### Clarificação do protocolo async compatível (AC-012, AC-013 e AC-016)

Esta é uma clarificação do protocolo já compatível com o OMP 18.18.6, não um
novo AC, tarefa, campo público, waiver ou limite adicional de observabilidade.
O wire abaixo permanece sujeito a execução real e a seus gates; uma observação
delimitada, source-only ou de peer parcial não promove Native, AC global,
permissão ou release. Janelas, autorizações e falhas anteriores são históricas;
o estado e a autorização live só podem ser lidos de `progress.json` e do
receipt corrente. `PENDING_NATIVE` continua um estado inicial/procedural válido
até que a prova exigida seja produzida.

Nenhuma captura de lifecycle, helper `CLOSED`, yield, preflight ou programa
source-only concede Root ownership, assignment, permission, terminalidade ou
gate. O frame exato não retido permanece desconhecido, e hipóteses de
correlação não reconstroem payload. NATIVE-09/NATIVE-10 exigem execução nativa
real e retorno aceito por peer/validator conforme os critérios abaixo.
#### Captura interna de lifecycle (sem novo wire, API, AC ou waiver)

O SDK pode emitir lifecycle antes de `Root tool_execution_start`; portanto, uma
observação antecipada fica pendente até existir o dispatch Root real e o tuple
completo. A correspondência exige `parentToolCallId` completo, índice, papel
`agent`, `agentSource` e alocação efetivamente aceita. Uma observação pendente
não concede ownership Root, assignment, permissão, terminalidade ou gate.

O observador preserva ordinal de chegada e timestamps reais, rejeita identidade
desconhecida, rebind, contradição ou ambiguidade e não sintetiza eventos Root.
Um frame não retido permanece desconhecido; a hipótese de correlação apoiada
pelo contrato/fonte não reconstrói payload. Parser e guards não são afrouxados,
e a especulação padrão do SDK não é desativada. A cura estrutural do SDK para
um evento antecipado é distinta da recusa de um evento malformado.

Cópias de checkpoint não reescrevem RED, cronologia, autorização ou orçamento.
NATIVE-09/NATIVE-10 só podem sair de `PENDING_NATIVE` por execução nativa real e
retorno aceito segundo os critérios abaixo.
- **Canais de retorno independentes:** no resultado inline do Root Task, `AgentToolResult.details.results` é a coleção canônica de `SingleResult`; cada item preserva o `exitCode` real obrigatório e a proveniência de erro derivada pelo consumidor. `progress` e `jobs` não substituem `results`.
- No canal automático assíncrono, a entrega existente continua sendo `message_end.message.role: "custom"`, `customType: "async-result"` e `details.jobs[]`. Esse canal permanece válido e é normalizado na evidência privada existente `source_kind: "task_async_result"`; `jobs[]` não é `SingleResult` e não recebe campos inventados. O DTO custom só conserva as chaves efetivamente expostas (`jobId`, `type`, `status`, `agentId`, `label`, `durationMs`, `meta`, `schema`), sem supor `exitCode`, `isError`, `aborted`, ownership ou assignment.
- O aditamento 0.6.0 acrescenta somente o canal de terminal já documentado do SDK: o `tool_execution_end` do Root cujo `toolName` é `wait`, com `result.details.op: "wait"` e `result.details.jobs[]`. Cada item é preservado no formato bruto `wait` (não reescrito como mensagem custom) e pode conter somente estas chaves efetivamente documentadas/expostas: `id`, `type`, `status`, `label`, `durationMs`, `intent`, `settledAtMs`, `exitCode` numérico, `resolvedModel`, `resolvedModelIdentity`, `resolvedThinkingLevel`, `advisor`, `completionPercent` (running), `stage`, `requests`/`cost`/`contextTokens`/`contextWindow` (running), `widget`, `resultText`, `errorText`, `meta`, `structured` (somente quando o resultado não foi consumido), `agentUrlId` e `agentOutputPublished`. `type: "task"` só é relevante quando o job pertence ao Root correspondente; não se inventa uma chave de modelo/widget.
- A normalização privada usa `source_kind: "task_wait_result"` e `record.wait_result` sem alterar API pública, CLI, perfil ou wire:
  ```json
  {
    "source_kind": "task_wait_result",
    "id": "<allocated child real>",
    "allocated_id": "<allocated child real>",
    "jobId": "<job.id real; distinto de id>",
    "wait_result": {
      "source": "tool_execution_end.result.details.jobs",
      "tool": "wait",
      "tool_call_id": "<ID real do Root wait correspondente>",
      "host_workflow_ordinal": "<ordinal real>",
      "is_error": "<isError real do wait END>",
      "is_error_observed": true,
      "job": "<snapshot bruto SDK>",
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
  `record.id`/`record.allocated_id` são a criança alocada pelo binding Root e `record.jobId` é o `job.id` real do snapshot; eles não são igualados. `agentUrlId` é hint de navegação: o SDK pode usar o próprio job ID quando a entrada manager/child não está disponível, portanto só o tuple Root fortemente observado estabelece ownership. O `tool_call_id` é o call do `wait`, não o `parentTaskCallId`. Antes da admissão, devem existir `Root wait START`/`END` correspondentes e `is_error` explicitamente `false`; `wait` sem erro é sucesso do transporte, nunca do filho. `host_binding` vincula sessão Root, parent Root TASK, índice, papel `agent`, `agentSource` efetivamente observado (inclusive `project` quando exigido pelo perfil) e assignment exato.
- `structured.source` (`caller|agent|session|none`) é proveniência do schema, não `agentSource` do projeto. Perfis estruturados exigem `structured.status: "valid"`, `source`/`mode` efetivos e `data` apropriado ao protocolo, além de consumidor real; a exceção existente para `validator` e `spec-kit-author` sem schema ainda exige evidência independente real de Bash/arquivo/papel. `resultText`/`errorText` humanos não são payload estruturado.
- Falta de `status`, payload/schema indisponível, `running`, `failed`, `cancelled`, job malformado, job errado/stale, ownership ausente/ambíguo ou schema inválido não é completion. `exitCode`, `error`, `aborted` e `isError` do filho permanecem `null` com `*_observed:false` quando não expostos; `wait.isError` é campo de transporte separado. Só um `exitCode` numérico realmente exposto pode ser preservado, e valor não zero nunca é sucesso. Não se infere `0` nem `false` de `completed`.
- O consumidor aguarda `session_settled`, o terminal mais recente do Root e o erro/aborto da continuação, mas settlement, primeiro yield, `prompt_result`, `agent_end`, `UPDATE`, lifecycle `completed`, `progress`, `extractedToolData`, stdout do Root, quiescência ou prosa do Root não montam um task record. Um `UPDATE` pós-`Task END` continua progresso correlacionado; não cria conclusão de filha.
- Custom e wait que representam o mesmo job devem deduplicar em um único registro quando payload, status e ownership forem consistentes; payload/status/ownership contraditórios bloqueiam. IDs/índices duplicados bloqueiam. A admissão valida limites existentes de quantidade e 16 MiB e IDs opacos exatos antes de mutar o registro; não retém payload desconhecido ou comandos sensíveis. `isAuthoritativeTaskRecord`/`taskRecordSucceeded` devem reconhecer o novo kind real no consumidor compartilhado, não por bypass de teste.
- Lifecycle antecipado permanece pendente até dispatch Root real e correspondência única de `parentToolCallId` completo, índice, papel, `agentSource`, alocação e assignment; frame não retido é desconhecido e não é reconstruído. `get_messages` não é requisito nem fallback/polling desta emenda. Não se adiciona modo caller, override de modelo/effort, `forceSync`, desativação de async, perfil blocking, campo de peer, status ou API SDK.
- O handoff continua usando o descritor imutável host-written `.omp/state/native-route/task-<step>.json`, com forwarding literal, run, revisão, nonce, contexto, fingerprints e leituras obrigatórias. A compatibilidade é regra de consumo; `PENDING_NATIVE`, retry técnico NATIVE-09, E2E, preservação de fonte, full QA/CI e release real continuam obrigatórios e pendentes.

### Aditamento 0.7.0 — prova privada de conclusão backend do NATIVE-09

Este aditamento é documental, aditivo e não lançado. Ele delimita uma prova
privada do caminho backend de NATIVE-09 sem criar AC, tarefa, estado, waiver ou
promoção. O kind tipado da evidência é
`source_kind: "native09-backend-repair-write"`, sempre ligado à identidade,
ao caminho e à correlação observados no Root.

Somente a prova que satisfaz todos os predicados abaixo pode ser coletada para
essa exceção escopada:

| Predicado | Regra fechada |
|---|---|
| Job aprovado pelo Root | o job aprovado pelo Root tem `status: "completed"` efetivamente observado; completion do framework não é veredito semântico |
| Criança opaca e tuple completo | a criança mantém IDs opacos e binding único ao Root por `root_session_id`, `parent_tool_call_id`, `allocated_id`, `index`, `root_task_end_is_error:false`, `agent`, `agentSource`, assignment, `job_id` e `instance_id`, com correlação forte/única; igualdade inferida, rebind, stale ou ambiguidade bloqueiam |
| Write END único | existe exatamente um `write END` aprovado, com `isError: false` observado explicitamente, e o `path` é o caminho exato permitido/aprovado pelo Root; caminho derivado do conteúdo ou uma segunda escrita não é aceito |
| Sujeito efetivamente alterado | o `actual` demonstra mudança do sujeito pretendido por bytes/hash antes/depois; conclusão declarada, texto ou `completed` sem mudança não basta |
| Dependências protegidas | bytes/hash e identidade das dependências protegidas permanecem inalterados; drift, dependência desconhecida ou ausência de comparação bloqueiam |

A coleção privada pode incluir o dispatch de um peer independente e de um
segundo validator para o mesmo repair, cada qual com sua própria identidade e
binding Root. Colecionar esses dispatches não é aprovação semântica. `Task
framework completed` não equivale a `validator semantic PASS`: o primeiro
registra apenas término do framework. O primeiro relatório `FALHOU` continua
legítimo quando correlacionado a um CLI real com código não zero; seu retorno
bruto permanece preservado e não converte testes em PASS. Aprovação semântica
do reparo e qualquer promoção de NATIVE-09 exigem peer independente e segundo
validator com `PASSOU` efetivamente observado, correlação válida e todos os
gates atuais.

Perfis existentes com `structured:true` continuam exigindo schema válido. A
única exceção é esta prova do perfil `backend-developer` para NATIVE-09,
estritamente delimitada ao kind privado acima; ela não autoriza aceitar perfil
indisponível em geral nem altera outros NATIVE/AC. As regras existentes para
`validator` e `spec-kit-author` permanecem inalteradas; a única clarificação é
que relatório negativo do validator, ainda que task esteja `completed`, não
passa testes. Flags da criança que não forem expostas permanecem
`null`/desconhecidas com `*_observed:false`; não se infere `exitCode: 0`,
`isError:false`, `aborted:false` ou qualquer outra flag ausente.

Não há campo novo de SDK/wire, API, setting, modelo, flag, override de caller
ou CLI pública, nem alteração de perfis. Os contadores e falhas Native anteriores permanecem
históricos, não são estado live; as tabelas de tarefas conservam seus rótulos
iniciais `PENDING`. A ordem canônica de prontidão pré-publicação, CI e release
(T-013A → T-013B e gates reais) permanece inalterada, e não há bump de versão
do pacote.

## Matriz de rastreabilidade AC → IDs → tarefas → provas



`P-*` são tarefas de planejamento; `T-*` são tarefas de implementação/validação
posteriores. Os estados de prova devem ser obtidos do estado TDD e do receipt
live; `PENDING`, `PENDING_NATIVE`, `BLOCKED`, `HISTÓRICO` e
`NÃO VERIFICADA` permanecem estados procedurais e de evidência, não promoções
automáticas. Revisões estáticas ou assemblies delimitadas só valem no alcance
registrado. O contrato de recuperação anterior e qualquer resultado source-only
permanecem históricos; AC-011 global/catalog/Native/legalidade e
discovery/instalação/runtime/release exigem as provas próprias.
| AC | Tipo | IDs cobertos | Tarefas | Prova de aceitação |
|---|---|---|---|---|
| AC-001 | normative | baseline, entrega externa, R-04 | P-004, T-013A, T-013C | PV-001: snapshot/hash/branch/intake; PV-016: Ship externo com release terminal registrado |
| AC-002 | behavioral | AUD-001, AUD-011 | T-001, T-011 | PV-002: regressões execution + suíte; NATIVE-04 com jobs/locks reais |
| AC-003 | behavioral | AUD-006–010 | T-002 | PV-003: state/migration/integration tests + estado 2.3 final |
| AC-004 | behavioral | AUD-002, AUD-012, AUD-032, W-03 | T-003 | PV-004: quality/CLI/Ship/Retro negativos e revalidação no snapshot final |
| AC-005 | behavioral | AUD-003, AUD-015, AUD-016, R-03 | P-003, T-005, T-007, T-011 | PV-005: race/CAS/rollback em cópia isolada + crítica independente; unknown BLOCKED |
| AC-006 | behavioral | AUD-004, R-04 | T-006A | PV-006: identidade bigint/quiescência, colisão e bytes substitutos; primitive Windows LAB e prova Linux FD-bound/atomic no-replace antes do release |
| AC-007 | behavioral | AUD-013, AUD-014 | T-006A, T-006B | PV-007: parser/`flagValue` e base mockados offline antes de efeitos; cenário Git real posterior |
| AC-008 | behavioral | AUD-018, AUD-019, R-06 | T-007, T-011, T-014 | PV-008: argv/wrapper + positivos/negativos Git Windows legítimos, sem bypass |
| AC-009 | behavioral | AUD-020, W-01, W-02 | T-008 | PV-009: checkpoint CAS e resultados observáveis short/full/local/Git |
| AC-010 | normative | AUD-005, AUD-023–030, AUD-033 | T-004 | PV-010: revisão semântica independente com fontes primárias e exemplos por stack |
| AC-011 | normative | AUD-022, R-02, catálogo10/12/42/18 | T-010A, T-012A | PV-011: matriz 42/18, origem React 1a2c79..., evidência delimitada em `local://ship-license-primary-evidence.json`, SOURCE/NOTICE/licenças pertinentes e revisão independente da autoria atual |
| AC-012 | behavioral | NATIVE-01–04, CAP-013/014 | P-002, T-009A, T-011 | PV-012: OMP v18.18.6 fixado, `agentSource:project`, solutionSpace, resolução/precedência/modelos/jobs reais; ausência de campo exposto não é inventada |
| AC-013 | behavioral | NATIVE-05, NATIVE-06, NATIVE-09 | T-009B, T-011 | PV-013: objeto estruturado `TDD_PEER_REVIEW`/`peer-reviewer`, `APROVADO`/`BLOQUEADO`, chaves atuais/revisão/findings, deep `VALID`, fallback/retry e negativos nativos |
| AC-014 | behavioral | NATIVE-07, NATIVE-08 | T-009C, T-011 | PV-014: SHA branch/PR, Fase 0/OK e DONE IMPLEMENTED/VALIDATED |
| AC-015 | behavioral | AUD-021, AUD-031, W-04, R-05 | T-010B, T-014 | PV-015: engines/CI/licenças e suíte pertinente completa, sem oracle correlacionada |
| AC-016 | behavioral | NATIVE-10, R-01, R-04 | T-011, T-013B | PV-016: pacote instalado/E2E sem publicação, retro e retomada |
| AC-017 | behavioral | R-06 e todas as regressões | T-014 | PV-015 + PV-008: suíte pertinente descoberta + Node nativo + Windows positivo real |
| AC-018 | normative | todos AUD/W/R/CAP/NATIVE | P-001, T-012A | PV-017: ledger completo, hashes/saídas/owners e estados sem PASS fabricado |
| AC-019 | normative | R-01, R-03, R-04, R-06 | T-012B | PV-005/PV-008/PV-016: seis controles e bloqueios explícitos |
| AC-020 | behavioral | CAP-010, CAP-030, R-05 | T-015 | PV-017: medições efetivas delimitadas de startup, duração, recursos do processo-pai, duração coarse de review e overhead de guard; [guard-startup.mjs](../../implementation-evidence/metrics/guard-startup.mjs), [results.json](../../implementation-evidence/metrics/results.json), [results-prior-capture.json](../../implementation-evidence/metrics/results-prior-capture.json) e [retained-observations.json](../../implementation-evidence/metrics/retained-observations.json) preservam a proveniência, a probe serial e o cutoff imutável `2026-11-15T22:11:52.751Z`; duas avaliações Native observadas são FAILED e somente subset retido, não todas as chamadas/orçamento; retries, custo, serving/modelo, review controlada/qualidade, batch/throughput, recursos child/system-wide, scheduler paralelo, ganho before/after e observações Native futuras permanecem null/desconhecidos; zero de admissões duplicadas vale somente para as cinco sessões seriais e não prova benchmark paralelo ou ganho global |
| AC-021 | behavioral | readonly external Ship plan, quality/context provenance, NATIVE-10 external route | T-003, T-006B, T-006C, T-011 | PV-018: parser negativo sem efeitos; `validateShipQuality` real com report/context existentes e hash/proveniência revalidados; JSON `PLANNED` somente no sucesso; nenhum Git/GH/rede/child process/write |


## Disposição dos 33 achados de auditoria

Todos os achados permanecem visíveis; `PENDING` significa que a recomendação não
foi aplicada nem aceita. O caminho/linha é a fonte lida, não uma nova descoberta.

| ID | Fonte/tema | Disposição exigida | AC | Tarefa / prova |
|---|---|---|---|---|
| AUD-001 | `tdd-orchestrator/lib/execution.mjs:105–118` — lock liberado com RUNNING ausente | conservar ocupação até término confiável; desconhecido bloqueia | AC-002 | T-001 / PV-002 |
| AUD-002 | `tdd-orchestrator/lib/quality.mjs:149–151,383–394` — receipt usa contexto | validar grafo report→contexto→source original | AC-004 | T-003 / PV-004 |
| AUD-003 | `install.mjs:433–440` — rename resolve ancestral de novo | primitive de escrita vinculada à identidade ou bloqueio; sem aprovação de solução desconhecida | AC-005 | T-005 / PV-005 |
| AUD-004 | `ship/bin/lib.mjs:119` — backup reabre origem | fixar identidade bigint/fstat e quiescência; publicar por primitive de plataforma comprovada, sem fallback pathname inseguro | AC-006 | T-006A / PV-006 |
| AUD-005 | `tdd-orchestrator/references/postgresql/security-rls-basics.md:29–38` — GUC livre | corrigir identidade confiável, privilégio e duração transacional | AC-010 | T-004 / PV-010 |
| AUD-006 | `tdd-orchestrator/lib/state.mjs:226–230` — IDs duplicados | rejeitar unicidade global antes de indexar | AC-003 | T-002 / PV-003 |
| AUD-007 | `tdd-orchestrator/lib/state.mjs:613–617` — waves duplicadas | rejeitar números de onda repetidos | AC-003 | T-002 / PV-003 |
| AUD-008 | `tdd-orchestrator/lib/state.mjs:43,318–320` — TEST_REF fora da raiz | separar caminho relativo seguro do título literal | AC-003 | T-002 / PV-003 |
| AUD-009 | `tdd-orchestrator/lib/state.mjs:715–720` — migração faz trim | remover apenas delimitador sintático; preservar bytes do nome | AC-003 | T-002 / PV-003 |
| AUD-010 | `tdd-orchestrator/lib/state.mjs:888–899` — baseline inválida substituída | preservar diagnóstico e bloquear; derivar somente quando ausente legitimamente | AC-003 | T-002 / PV-003 |
| AUD-011 | `tdd-orchestrator/lib/execution.mjs:55–57` — `/` e `C:/` rejeitados | semântica explícita de raiz e segmento sem enfraquecer traversal | AC-002 | T-001 / PV-002 |
| AUD-012 | `tdd-orchestrator/bin/quality.mjs:21–23` — report trocado após leitura | revalidar identidade/bytes do report no check | AC-004 | T-003 / PV-004 |
| AUD-013 | `ship/bin/lib.mjs;ship/bin/ship.mjs:47–49,479–487` — flag vira título | `flagValue` estrito em T-006A e parser estrito antes de qualquer efeito em T-006B; caso é uma duplicata consolidada | AC-007 | T-006A/T-006B / PV-006/PV-007 |
| AUD-014 | `ship/bin/ship.mjs:537–539` — upstream implícito | fixar `origin/<default>` resolvido | AC-007 | T-006B / PV-007 |
| AUD-015 | `install.mjs:268–274,733` — hash escapa diagnóstico | converter leitura/hash para drift acionável e fail-closed | AC-005 | T-005 / PV-005 |
| AUD-016 | `install.mjs:763–773` — equal não é revalidado | inventário/hash final obrigatório | AC-005 | T-005 / PV-005 |
| AUD-017 | `scripts/install-hooks.mjs:276–284` — hook concorrente sobrescrito | CAS também no commit/rollback de hooks | AC-008 | T-007 / PV-008 |
| AUD-018 | `scripts/hooks/commit-msg.mjs:33–40` — `.cmd` em path com espaço | preservar argv/quoting, sem shell injection | AC-008 | T-007 / PV-008 |
| AUD-019 | `scripts/install-hooks.mjs:15–39` — wrapper Git sem adaptador | adaptar por contrato ou rejeitar explicitamente | AC-008 | T-007 / PV-008 |
| AUD-020 | `alignment/SKILL.md:121–126` — checkpoint Git único | namespace request/run + CAS/retenção de histórico | AC-009 | T-008 / PV-009 |
| AUD-021 | `package.json;package-lock.json:7,2592–2593,2685–2686` — range Node/tooling | separar engine do produto e matriz da suíte efetiva | AC-015 | T-010B / PV-015 |
| AUD-022 | `deep-review/AMENDMENTS.md:5–14` — caminhos inexistentes | mapear caminho local/upstream e hashes | AC-011 | T-010A / PV-011 |
| AUD-023 | `deep-review/references/security/golang-general-backend-security.md:559` — os/exec invertido | corrigir shell/argv por fonte Go primária | AC-010 | T-004 / PV-010 |
| AUD-024 | `deep-review/references/security/golang-general-backend-security.md:374` — CSRF de outro framework | usar `http.Cookie`/Origin e pré-condições reais | AC-010 | T-004 / PV-010 |
| AUD-025 | `deep-review/references/security/javascript-express-web-server-security.md:489` — Express default | reconhecer 100kb e avaliar configuração/workload | AC-010 | T-004 / PV-010 |
| AUD-026 | `deep-review/references/security/javascript-typescript-nextjs-web-server-security.md:766` — redirect textual | parsear origem/backslash/controle ou destino nomeado | AC-010 | T-004 / PV-010 |
| AUD-027 | `deep-review/references/security/javascript-typescript-nextjs-web-server-security.md:818–823` — routers Next misturados | separar Pages API Routes de App Router e bytes brutos | AC-010 | T-004 / PV-010 |
| AUD-028 | `deep-review/references/security/javascript-typescript-vue-web-frontend-security.md:454` — redirect Vue textual | verificar origem normalizada conforme sink | AC-010 | T-004 / PV-010 |
| AUD-029 | `tdd-orchestrator/references/react/bundle-defer-third-party.md:37–43` — `ssr:false` promete idle | distinguir client-only de defer/idle e medir no app | AC-010 | T-004 / PV-010 |
| AUD-030 | `tdd-orchestrator/references/postgresql/query-missing-indexes.md:32–36` — FK universal | condicionar a plano, seletividade, workload e escrita | AC-010 | T-004 / PV-010 |
| AUD-031 | `scripts/bootstrap-config.test.mjs;README.md:327–329,602,38–40` — OMP/Node confundidos | remover oracle textual e testar metadado/comportamento | AC-015 | T-010B / PV-015 |
| AUD-032 | `tdd-orchestrator/bin/quality.mjs:15` — argumento vazio extra | validar aridade/tokens, não truthiness | AC-004 | T-003 / PV-004 |
| AUD-033 | `tdd-orchestrator/references/postgresql/security-rls-performance.md:65–68` — índice RLS universal | exigir EXPLAIN/workload antes/depois; não prometer ganho | AC-010 | T-004 / PV-010 |

## Disposição das 4 lacunas W e dos 6 riscos R

### Lacunas de cobertura

| ID | Fonte | Decisão nova | AC / tarefa / prova | Estado |
|---|---|---|---|---|
| W-01 | `implementation-evidence/native-release/proof-index.json`, `implementation-evidence/native-release/alignment.mjs` e casos comportamentais atuais | substituir associação de prosa por resultado observável; não repinar wording nem restaurar oracle removido | AC-009 / T-008 / PV-009 | PENDING |
| W-02 | índice/probes nativos retidos e consumidores atuais de routing/persistence, local/Git/short/full | cobrir o consumidor real; nenhum teste incidental removido é fonte nem deve ser restaurado | AC-009 / T-008,T-011 / PV-009,PV-011 | PENDING |

| W-03 | `scripts/ship-quality-cli.test.mjs:10` | usar oracle independente para contexto esperado e receipt | AC-004 / T-003 / PV-004 | PENDING |
| W-04 | `scripts/bootstrap-config.test.mjs:347–353` | exercer passos/enforcement CI observáveis; não validar apenas job textual | AC-015 / T-010B / PV-015 | PENDING |

### Riscos não convertidos em defeitos inventados

| ID | Risco | Controle/critério | Tarefa / prova | Estado |
|---|---|---|---|---|
| R-01 | OMP nativo/enforcement não demonstrado | NATIVE-01–10 e enforcement observado bloqueiam release; ausência não é bug nem PASS | T-011,T-012B,T-013B / PV-012–PV-016 | PENDING |
| R-02 | proveniência/autoria React: as nove referências locais foram substituídas por texto e exemplos autorais novos; o artefato adaptado/auxiliar obsoleto foi excluído por cutover | review/reconciliação somente no escopo do receipt live; recuperação histórica não é aprovação corrente, não fazer opinião jurídica, não fabricar copyright/licença nem adotar `retain-declared-MIT` | T-010A,T-012A,T-012B / PV-011,PV-015 | PENDING para AC-011 global/catalog/Native/legalidade |


| R-03 | confiança/concorrência FS sem congelamento universal | decisão `explicit_os_host_tcb` autoriza bootstrap do instalador T-005 e metadata/FS dos hooks T-007 no host exato Windows PowerShell 5.1/System32 com NoProfile/NonInteractive/cwd protegido/allowlist scrubbed/FullLanguage x64 fail-closed; não é prova ACL, assinatura antes da execução do host, sibling, transação ou equivalência POSIX. Handles/ancestrais pinados, no-replace e quarentena continuam obrigatórios; seis PASS são apenas primitive LAB; T-005 só inicia GREEN dependente após prova atual da primitive aplicável e revisão independente, T-007 não herda Git; `nlink=1` legado é preservado, extensão R7 exige release/linkset/proveniência/identidade/ACL/carga exatos e guard desconhecido falha fechado | T-005,T-007,T-011 / PV-005,PV-008 | PENDING |
| R-04 | Ship body/config/version/rollback sem prova completa | fixtures e cenário autorizado; sem chamar toda aceitação de vulnerabilidade sem contexto | T-006A,T-006B,T-013A,T-013B / PV-006,PV-007,PV-016 | PENDING |
| R-05 | supply chain/transitivas e Actions tag não auditadas integralmente | registrar escopo do advisory, deprecated e enforcement CI; não alegar zero vulnerabilidades | T-010B,T-014,T-015 / PV-015 | PENDING |
| R-06 | Windows `E_UNSAFE_GIT_EXECUTABLE` e extensão OFF | resolver só com desenho revisado e positivos legítimos; extensão R7 apenas para release/linkset/proveniência/identidade/ACL/carga exatos comprovados, legado `nlink=1` preservado e desconhecido falha fechado | T-007,T-011,T-014 / PV-008,PV-016 | PENDING |

## Catálogo de skills (10)

| Skill | Fonte canônica | Dono/ativação | Saída e limite |
|---|---|---|---|
| alignment | `alignment/SKILL.md` | entrada, escopo, aceites; request completo pode fast-close | checkpoint CLOSED/BLOCKED; não implementa |
| architecture | `architecture/SKILL.md` | fronteiras/API/estado/migração; architect condicional | proposta/crítica; não aprova a própria spec |
| bug-diagnosis | `bug-diagnosis/SKILL.md` | defeito/lentidão com reprodução | causa/regressão ou bloqueio; não abre segundo TDD |
| conflict-resolution | `conflict-resolution/SKILL.md` | conflito/rebase/merge autorizado | intenção resolvida e checks; nunca oculta conflito |
| deep-review | `deep-review/SKILL.md` | revisão técnica/requisitos por instâncias | `VALID` individual e agregado; não confunde com peer TDD |
| release-bootstrap | `release-bootstrap/SKILL.md` | CI/versionamento/proteções sob autorização | configuração/provas; não publica sozinho |
| retro | `retro/SKILL.md` | pós-entrega revalidada ou TDD standalone | decisão COMPLETE/INCOMPLETE/UNKNOWN e até três propostas; não implementa |
| secure-linux-web-hosting | `secure-linux-web-hosting/SKILL.md` | host Linux com alvo/efeitos/autorização | operação/probes/recuperação; fora desta preparação |
| ship | `ship/SKILL.md` | issue→branch→PR→release/deploy conforme gate | entrega externa; não faz merge local nesta feature |
| tdd-orchestrator | `tdd-orchestrator/SKILL.md` | backlog comportamental, RED→GREEN→review→validate | estado/ondas/provas; não é scheduler nativo |

## Catálogo de perfis geridos (12)

Todos são tipos descobertos pelo OMP, não sandbox. O frontmatter `model`/`thinkingLevel`
é configuração candidata por perfil; não comprova resolução, serving ou inferência.
O mapa abaixo é a configuração aprovada para revalidação: somente o prefixo
provider muda para `openai-codex/`; IDs, ordem principal/fallback e esforço são
os mesmos. A tabela não é PASS de disponibilidade em v18.18.6. Para a sessão
autenticada, a cópia local deve ser descoberta como project; os nove perfis user
stale não são substitutos.

### Mapa de provider/modelo aprovado

| Perfil | Principal | Fallback | thinkingLevel/effort | structured |
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

Os cinco perfis estruturados são exatamente `requirements-reader`, `architect`,
`host-operator`, `deep-reviewer` e `peer-reviewer`. Registrar `agentSource`,
modelo/effort/terminal resolvidos e hashes antes/depois. Não enviar
`task.structured` global ou qualquer campo não exposto. A ausência de
`resolvedModel`, effort ou terminal no schema deve ser registrada como limite e
mantém o aceite dependente aberto, não preenchida por inferência.

| Perfil | Fase/contrato | Ferramentas declaradas | Prova nativa |
|---|---|---|---|
| requirements-reader | compreensão independente; `REQUIREMENTS_READING_V1` | read, grep, glob | NATIVE-01/02/10 |
| architect | análise de fronteiras; `ARCHITECTURE_ANALYSIS_V1` | read, find, grep, glob, lsp, ast_grep | NATIVE-01/02/10 |
| host-operator | operação Linux autorizada; `HOST_OPERATION_V1` | read, bash, SSH conforme alvo | NATIVE-01/02/10 (host não executado aqui) |
| deep-reviewer | revisão por instância; `DEEP_REVIEW`/yield | read, grep, glob, bash restrito, lsp, web_search, ast_grep | NATIVE-03/04/06/07/10 |
| spec-kit-author | DOC; quatro artefatos canônicos | read, write, edit, grep, glob | NATIVE-08/10 |
| test-author | RED/RED_REVISION | read, write, edit, bash, grep, glob | NATIVE-03/04/09/10 |
| backend-developer | GREEN/GREEN_FIX backend | read, write, edit, bash, grep, glob | NATIVE-03/04/09/10 |
| frontend-developer | GREEN/GREEN_FIX UI | read, write, edit, bash, grep, glob | NATIVE-03/04/09/10 |
| refactorer | REFACTOR sem mudar comportamento | read, write, edit, bash, grep, glob | NATIVE-03/04/09/10 |
| peer-reviewer | REVIEW TDD estruturado `TDD_PEER_REVIEW` com `APROVADO`/`BLOQUEADO` | read, grep, glob | NATIVE-05/10 |
| validator | dez gates e provas independentes | read, bash, grep, glob | NATIVE-01–10 |
| integrator | barreira de onda/conflito mecânico | read, write, edit, bash, grep, glob | NATIVE-01/03/04/10 |

## Catálogo das 42 capacidades

A lista mantém os IDs e owners documentados; cada linha exige a prova do
`PV-011`/`PV-012` pertinente e a referência seletiva real. “Fonte lida” não é
“capacidade nativa aprovada”.

| ID | Capacidade | Owner | AC principal |
|---|---|---|---|
| CAP-001 | entrada, escopo, aceites e autorização | alignment | AC-001, AC-009 |
| CAP-002 | rota short/full por risco/complexidade | alignment | AC-009, AC-012 |
| CAP-003 | entrega local sem inicializar Git | alignment/caller local | AC-001, AC-016 |
| CAP-004 | compreensão independente sem nova entrevista | alignment/requirements-reader | AC-009, AC-011 |
| CAP-005 | contexto novo, índice único e reuso | deep-review | AC-004, AC-013 |
| CAP-006 | arquitetura proporcional | architecture/architect | AC-011 |
| CAP-007 | API, consumidores e compatibilidade | architecture | AC-003, AC-014 |
| CAP-008 | crítica independente da especificação | architecture | AC-011, AC-018 |
| CAP-009 | DAG, IDs e recursos | tdd-orchestrator | AC-002, AC-003 |
| CAP-010 | capacidade atual e paralelismo útil | tdd-orchestrator | AC-002, AC-020 |
| CAP-011 | escritor único, aliases, pai/filho, caches/saídas | tdd-orchestrator | AC-002, AC-005 |
| CAP-012 | completude por IDs, digests e retornos | tdd-orchestrator | AC-002, AC-013 |
| CAP-013 | modelos/esforço e escalada técnica | perfis OMP/TDD | AC-012 |
| CAP-014 | pedido versus modelo observado | perfis OMP/validator | AC-012, AC-016 |
| CAP-015 | tentativas, falhas e continuidade | tdd-orchestrator | AC-002, AC-013 |
| CAP-016 | checkpoint portátil e handoff | tdd-orchestrator | AC-003, AC-009 |
| CAP-017 | fatias verticais e testes observáveis | TDD/spec-kit-author | AC-017, AC-018 |
| CAP-018 | eixos técnico e requisitos | deep-review | AC-013, AC-016 |
| CAP-019 | spec→código/teste/evidência | validator | AC-018 |
| CAP-020 | instância review versus tipo | deep-review protocol | AC-013 |
| CAP-021 | estado 2.3, AC normativo e migração | tdd state | AC-003 |
| CAP-022 | baseline/delta/contexto de revisão | quality | AC-004, AC-018 |
| CAP-023 | documentação funcional atual | spec-kit-author | AC-011, AC-018 |
| CAP-024 | segurança proporcional obrigatória | deep-review | AC-010, AC-019 |
| CAP-025 | revalidação e integridade por fase | tdd execution | AC-002, AC-004, AC-019 |
| CAP-026 | enforcement CI/servidor | release-bootstrap | AC-015, AC-019 |
| CAP-027 | publicação, merge e deploy separados | ship | AC-001, AC-007, AC-016 |
| CAP-028 | triagem retrospectiva | retro | AC-016 |
| CAP-029 | análise e até três propostas | retro | AC-016 |
| CAP-030 | métricas observadas | tdd-orchestrator | AC-020 |
| CAP-031 | domínio, glossário, contexto e ADR | alignment reference | AC-010, AC-011 |
| CAP-032 | direção visual, tokens, estados e render | frontend reference | AC-010, AC-011 |
| CAP-033 | teclado, foco, semântica, contraste e reflow | accessibility reference | AC-010, AC-011 |
| CAP-034 | segurança Python/JS/TS/Go | security reference | AC-010, AC-019 |
| CAP-035 | React/Next confirmados | React reference | AC-010, AC-011 |
| CAP-036 | PostgreSQL, locks, migração e RLS | PostgreSQL reference | AC-010, AC-011 |
| CAP-037 | busca estrutural AST | AST reference | AC-011 |
| CAP-038 | CI, versionamento e proteções | release-bootstrap | AC-001, AC-015 |
| CAP-039 | SSH, firewall, Nginx, TLS e recuperação | secure-linux-web-hosting | AC-011, AC-016 |
| CAP-040 | instruções, gatilhos, referências e simulações | writing-for-agents | AC-011, AC-018 |
| CAP-041 | reprodução, hipótese e regressão | bug-diagnosis | AC-017, AC-018 |
| CAP-042 | conflitos pela intenção e validação atual | conflict-resolution | AC-014, AC-016 |

## Catálogo das 18 fontes

| Fonte | Owner | Referência seletiva |
|---|---|---|
| alignment | alignment | `alignment/SKILL.md` |
| architecture | architecture | `architecture/SKILL.md` |
| ast-grep | bug-diagnosis | `bug-diagnosis/references/ast-search.md` |
| bug-diagnosis | bug-diagnosis | `bug-diagnosis/SKILL.md` |
| conflict-resolution | conflict-resolution | `conflict-resolution/SKILL.md` |
| deep-review | deep-review | `deep-review/SKILL.md` |
| domain-modeling | alignment | `alignment/references/domain-modeling.md` |
| frontend-design | tdd-orchestrator | `tdd-orchestrator/references/frontend-design.md` |
| accessibility | deep-review | `deep-review/references/accessibility.md` |
| security-best-practices | deep-review | `deep-review/references/application-security.md` |
| vercel-react-best-practices | tdd-orchestrator | `tdd-orchestrator/references/react/*.md` (nove referências autorais atuais) |
| supabase-postgres-best-practices | tdd-orchestrator | `tdd-orchestrator/references/postgresql.md` |
| release-bootstrap | release-bootstrap | `release-bootstrap/SKILL.md` |
| secure-linux-web-hosting | secure-linux-web-hosting | `secure-linux-web-hosting/SKILL.md` |
| ship | ship | `ship/SKILL.md` |
| tdd-orchestrator | tdd-orchestrator | `tdd-orchestrator/SKILL.md` |
| retro | retro | `retro/SKILL.md` |
| writing-for-agents | alignment | `alignment/references/writing-for-agents.md` |

## NATIVE-01–10: aceite OMP obrigatório

Todos começam em `PENDING_NATIVE`. A prova deve guardar versão OMP **18.18.6**,
schema/configuração efetiva, request bruto, job/retorno bruto, revisão, hashes,
owner, expected/actual e limitações. Para os perfis locais, preparar cópias exatas
em projeto descartável (`.omp/agents`/`.omp/skills`) e preservar a autenticação
sem copiar tokens; registrar eventual atualização de cache/token como efeito de
fronteira aprovada. O staging do instalador ou uma fixture não fecha os cenários
nativos.


| ID | Cenário e condição de aceite | Owner/prova | Estado inicial/procedural (estado live no receipt) |
|---|---|---|---|
| NATIVE-01 | instalação autorizada, inventário final, discovery dos 10/12, `agentSource:project`, precedência projeto/usuário e colisões | integrator + validator; PV-012 | PENDING_NATIVE |
| NATIVE-02 | catálogo v18.18.6 e mapa `openai-codex` com os três IDs, principal/fallback e thinkingLevel de cada perfil; origem/hash, `resolvedModel`, effort/terminal e metadados reais | validator; PV-012 | PENDING_NATIVE; serving/fallback só pode ser classificado por observação real |
| NATIVE-03 | tarefa inócua nomeada; duas instâncias disjuntas em batch se habilitado ou flat equivalente; `solutionSpace`, IDs e terminais exatos | caller + validator; PV-012 | PENDING_NATIVE; qualquer contexto/resultado parcial é HISTÓRICO e escopado |
| NATIVE-04 | async/yield, nested, retomada e isolamento somente se expostos; writers serializados e independentes paralelos | caller + validator; PV-002/PV-012 | PENDING_NATIVE |
| NATIVE-05 | peer-reviewer local real deve produzir objeto estruturado com `protocol_mode:TDD_PEER_REVIEW`, `agent:peer-reviewer`, status `APROVADO` em positivo e `BLOQUEADO` em negativo, recusando malformed; preservar `reviewed_revision`, `explanation`, `confidence`, `overall_correctness` e `findings` do frontmatter atual, sem primeira linha textual | peer-reviewer + validator; PV-013 | PENDING_NATIVE; correção estrutural de saída não é prova de recusa malformed |
| NATIVE-06 | deep-review mantém `VALID` incremental, fallback nomeado e duas instâncias agregadas; agregadores exigem par deep e rejeitam dados TDD normais; ausente/duplicado/stale/mode errado bloqueiam | deep-review + validator; PV-013 | PENDING_NATIVE; fallback nomeado, quando citado, é evidência HISTÓRICA/SCOPED |
| NATIVE-07 | branch/base e PR preservam revisão/head, diff e conteúdo integral no mesmo SHA | dispatcher + validator; PV-014 | PENDING_NATIVE; resultado parcial não substitui revisão final |
| NATIVE-08 | Fase 0/OK, DOC e DONE usam critérios IMPLEMENTED/VALIDATED contra consumidores reais | spec-kit-author + revisor independente; PV-014 | PENDING_NATIVE |
| NATIVE-09 | fallback nativo observado separadamente de retry técnico elegível, mantendo run/tarefa/cap3; sem mecanismo seguro, registrar limite para decisão do usuário, não promover | caller + validator; PV-013 | PENDING_NATIVE; fallback de provider, fallback de capacidade e retry técnico são distintos |
| NATIVE-10 | pacote completo short/full/local/external sem publicação, incluindo a rota external read-only `plan`, retro/dono/opt-out, falha/retomada, 42 CAP/18 fontes e documentação | integrator + revisores finais; PV-016/PV-018 | PENDING_NATIVE; `plan` pronto não é release nem AC-001 |

A decisão de provider e qualquer observação nativa delimitada não promovem
gates. Serving, peer completo, deep-review/fallback, fallback nativo separado,
revisão independente e validação global exigem as provas próprias e o estado
registrado no receipt live. Um resultado positivo estruturado
`TDD_PEER_REVIEW`/`APROVADO` pode ser citado apenas com alcance
`EXECUTADA`/`HISTÓRICA`; `globalAcceptance: PENDING` não é PASS. A
compatibilidade textual legada permanece `SUPERSEDED`, não é shim; saída
malformed corrigida pelo agente não prova rejeição. Diagnóstico de autenticação
de provider é histórico e não constitui RED de schema nem retry técnico.

Módulos de rota, retry e nativeRoot/retro são implementação ou suporte, não
prova. `PENDING`/`PENDING_NATIVE` e demais fases iniciais seguem o enum e o
procedimento, e somente execução nativa real com retorno aceito por
peer/validator pode alterar sua classificação. Nenhum módulo transforma
serving/provider ausente em PASS.

## Fora de escopo da entrega

- Criar scheduler, launcher, broker, serviço, SDK, transporte ou fallback que o OMP não expôs.
- Alterar settings/aliases/modelos globais, copiar credenciais, contornar guards Git/PATH/nlink/ACL/egress ou instalar no perfil real sem autorização.
- Prometer compatibilidade fora de OMP 18.18.6/Windows indicado ou alegar custo/eficiência sem medição.
- Tratar relatório anterior, mock, fixture, `ok:true`, configuração de modelo ou texto autodeclarado como prova nativa.



Implementação de código/testes/hooks/CI/instalador/guard Windows, suíte
completa, instalação descartável, Git/GitHub, issue/PR/release e avaliação OMP
pertencem às ondas planejadas e não a esta autoria Fase 0. Os quatro artefatos
não autorizam essas ações; a entrega só conclui quando os critérios e gates
forem resolvidos conforme o estado live, inclusive NATIVE-09 e demais gates
nativos. R-02, AC-011 e toda prova source-dependent exigem seu próprio receipt;
esta documentação não substitui discovery, instalação, runtime ou release.

## Referências

- [plan.md](./plan.md), [tasks.md](./tasks.md) e
  [interface-contract.md](./contracts/interface-contract.md) desta feature.
- [Matriz pública de capacidades](../../docs/capability-matrix.md), [guia
  funcional](../../docs/functional.md) e [guia de compatibilidade OMP](../../docs/omp-compatibility.md).
- O estado live de tarefas, AC, gates, autorização, receipts e promoção é
  `.omp/state/tdd/progress.json` mais o receipt corrente que ele referencia.
- Os ledgers públicos versionados `implementation-evidence/release-governance/`
  e `implementation-evidence/metrics/retained-observations.json` são
  referências de proveniência com data/escopo; não são fixtures Native e não
  são reescritos para refletir uma tentativa posterior.
- Os receipts privados e aprovações sob `.omp/state/release-47/proofs/` e
  URIs `local://` preservam payloads, hashes e decisões exatos. Eles não são
  distribuídos com estes documentos nem devem ser seguidos como entrada de
  fixture; a lista completa permanece no arquivo privado de arquivamento.
- Fontes primárias de OMP, Win32, backup, provider, wire peer, async e
  proveniência React são citadas pelos artefatos privados arquivados quando
  necessário, sem copiar seus contadores, hashes de candidato ou orçamento.

## Histórico e aditamento

- A consolidação documental é um snapshot datado, não uma promoção de tarefa,
  review, gate, Native, AC ou release. O resumo histórico desta spec e seus
  ledgers privados preservam as falhas e decisões anteriores.
- A base documental `0.5.0` mantém versão, assinaturas públicas, wire OMP,
  schemas, modelos, provider map, 12 perfis, flags e TCBs; somente documenta
  a rota externa `plan` e a prova que ainda deve consumi-la.
- O aditamento aprovado `0.6.0` é uma correção aditiva de compatibilidade para o terminal `wait` documentado no SDK, não uma nova API. O receipt privado `.omp/state/release-47/proofs/contract-0-6-native-wait-user-approval.json` registra `contract_amendment: "Aprovo"` e `confirmation: "Aprovo"`; a autorização não é Native PASS, waiver ou confirmação de release.

- O aditamento privado `0.7.0` delimita somente a prova backend tipada de
  NATIVE-09; exige peer independente e segundo validator com resultado real
  antes de qualquer semantic repair approval/Native PASS. Ele não altera a
  história do `0.6.0`, contadores, falhas históricas, tarefas, AC ou ordem de
  prepub/CI/release.
- Mudança de fonte, contexto, ambiente ou independência reabre provas
  dependentes. Nenhum ledger histórico substitui a descoberta e os gates da
  revisão atual.
