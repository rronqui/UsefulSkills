# Interface Contract: specs004-quality-evolution

> Versão: 0.3r7 proposta — fronteira Windows revista · Estado: In Review · 2026-11-09
> T-010-contract-draft tentativa1; histórico T-007/T-008/T-009 preservado. Não é aprovação de produto.

## Fronteira e compatibilidade

Qualidade é uma biblioteca compartilhada entre TDD e ship, sem novo coordenador
ou scheduler. TDD conserva schema2.3, IDs/ondas, migração, promoção e APIs;
deep-review conserva `aggregateReview` e `aggregateReviewInstances`. Não importar
schemas/APIs/caminhos de outro host. Dados de relatórios não são comandos,
permissões ou prova autenticada de autoria.

São preservados nomes, argumentos posicionais, formato `{ok, errors}`,
diagnósticos específicos e CLI capture/check. Opções novas são aditivas; a chamada
legada de delivery sem contexto confiável falha claramente, não devolve PASS
inseguro. O contrato inicial não lançado migra explicitamente, conservando
histórico; aprovação antiga não é transportada por copiar hashes.

## API de qualidade

- `captureInventory(root)` retorna
  `{files: {"caminho/relativo": "sha256"}, digest}`.
- `qualityContextDigest(report)` retorna um SHA-256 hexadecimal minúsculo de
  64 caracteres do contexto canônico abaixo. É função pura: não lê fontes,
  não grava arquivos, não aprova nem executa o conteúdo. Entrada inválida
  lança diagnóstico; consumidores de validação convertem falha em errors.
- `validateQuality(root, report, {stage = "delivery", expectedContextDigest} = {})`
  retorna `{ok, errors}`; stage aceita somente `planning|delivery`.
  `delivery` exige expectedContextDigest atual de origem confiável independente
  do report; ausência, formato inválido ou divergência bloqueiam. `planning`
  registra contexto/plano reais sem exigir revisão final de conteúdo futuro.
- `node <skill>/bin/quality.mjs capture <root>` emite inventário JSON no stdout.
- `node <skill>/bin/quality.mjs check <root> <report.json> planning|delivery [--quality-context <path>]`
  emite resultado estruturado e retorna 0/1 conforme sucesso/falha.
  Delivery carrega a fonte esperada pelo caminho explícito seguro. Não deriva
  aprovação do próprio report nem cria fonte confiável automaticamente.

O inventário é determinístico, com arquivos relativos/hashes e adições. Exclui
somente áreas operacionais explicitadas pela política (originalmente `.git`,
`.omp`, `node_modules` em qualquer nível), comparadas sem distinção de caixa
para aliases Windows; não oculta produto nessas áreas. Uma exclusão adicional
exige reconciliação explícita, nunca filtro para fazer o delta caber.

Caminhos são relativos canônicos confinados à raiz real: negar absoluto, drive,
traversal, separadores inválidos, segmentos ambíguos, colisões de caixa,
junction/symlink/hardlink e arquivo especial. Não seguir conteúdo externo.
Antes da leitura/uso, conferir identidade/confinamento, inclusive troca entre
preflight e ação. Uma falha não é convertida em arquivo ignorado.

## Relatório versão 1 ampliado

Mantém `schema_version: 1`, `baseline` no formato inventário e `revision` igual
ao digest atual. Migração do formato inicial precisa registrar a política
ampliada e atualizar seus consumidores, sem fingir compatibilidade de aprovação.

### Contexto e classificação

`context` registra:

- `run_id`: identidade não vazia da execução;
- `criteria`: lista não vazia com IDs únicos e
  `{id, description, type: "behavioral"|"normative"}`;
- `environment`: objeto JSON não vazio com runtime, versão/plataforma e demais
  configurações relevantes ao escopo (por exemplo OMP/task/model policy);
- `purpose`: finalidade não vazia da avaliação;
- `instructions`: referências `{path,sha256}` às instruções/fontes aplicáveis
  atuais, em lista; a ausência de fonte aplicável precisa ser justificada no
  contexto aprovado, não inferida do report.

Campos contextuais adicionais relevantes são dados JSON e entram integralmente
no fingerprint; não são interpretados como instrução para o validador.
Critério normativo tem tipo explícito. Uma referência a teste não se converte em
execução; uma referência a instrução não concede permissão.

`changes` é lista de
`{path, impact: "functional"|"none", reason, features:[], acceptance:[], tests:[], docs:[]}`.
Cada caminho do delta baseline→atual aparece exatamente uma vez, incluindo
removidos. Funcional exige vínculos não vazios e documentação pertinente
atualizada; `none` exige razão concreta. Baseline íntegra conserva a origem,
sem recaptura para ocultar alteração.

`documentation` contém caminhos relativos `catalog`, `specification`, `guide`
e `history`; podem coincidir. Devem existir e ser acessíveis por links reais
do README, inclusive links válidos com espaços. Revisão semântica independente
confere correspondência entre produto, critérios, testes e texto; hashes não a
substituem.

### Segurança e review

`security` mantém:

- `risk: "low"|"medium"|"high"` e `rationale` não vazia;
- `checks`: itens únicos
  `{id:"secrets"|"dependencies"|"threat-model", status:"PASS"|"NA", method, evidence:{path,sha256}, reason?, revision, context_digest}`;
- `findings`: itens únicos
  `{id,severity:"critical"|"high"|"medium"|"low",status:"open"|"fixed",evidence:{path,sha256}}`.

Segredos/dependências exigem verificação aplicável; risco alto exige threat-model
PASS. NA exige razão de inaplicabilidade baseada no conteúdo, nunca scanner
ausente. Os seis controles de segurança do run (requirements, security_tests,
secrets, dependencies, threat_model, security_review) são preservados no índice
de provas e nos gates existentes; isso não autoriza acrescentar IDs silenciosos
ao enum dos checks acima ou duplicar o motor.

`review` contém
`{author,reviewer,independent:true,revision,context_digest,evidence:{path,sha256},documentation_current:true,security_reviewed:true}`.
Autor e revisor são identificados e distintos. Revisão técnica e de requisitos
têm instâncias/eixos próprios; aprovação combinada exige ambos atuais.
P0/P1/high/critical abertos bloqueiam delivery; gates TDD podem exigir ausência
de todos os achados. Não rebaixar nem apagar P2/P3 para adaptar schema.

## Fingerprint canônico e confiança

`qualityContextDigest(report)` inclui:

1. `schema_version`, `baseline.digest` e `revision`;
2. `context` integral (run, critérios, ambiente, finalidade, instruções e
   outras decisões relevantes);
3. `changes` completas e `documentation`;
4. risco/justificativa e metadados de checks/findings, inclusive método, status,
   motivo, revisão e identidades adicionais quando presentes;
5. identidades e declarações de `review` (author/reviewer/independent,
   revision, documentation_current, security_reviewed).

Excluir somente envelopes operacionais `evidence` e os próprios
`context_digest` da revisão/checks/findings, evitando ciclos; seus arquivos e
hashes são validados separadamente. O fingerprint não exclui decisões porque
seu nome parece operacional. Chaves de objetos são ordenadas recursivamente;
ordem de arrays é preservada. Usar JSON canônico determinístico sem undefined,
NaN, Infinity, funções ou ciclos; não depender de ordem de criação das chaves.
Mesmo conteúdo/decisões produz mesmo digest; mutação relevante o altera.

O caller conserva uma fonte atual aprovada independente do report e fornece
`expectedContextDigest`. Fonte esperada mínima em arquivo JSON:
`{schema_version:1, context_digest:"<64 hex minúsculos>"}`.
Seu caminho é explícito e seguro, pode ficar na área operacional fora do
inventário do produto e não pode apontar ao report ou ao receipt avaliado.
A procedência/aprovação dessa fonte pertence ao coordenador: conferir retorno
original, contexto aprovado e identidade do responsável antes da promoção,
preservando path/hash no índice de provas. O validador compara, não autentica
pessoas nem cria confiança só porque o arquivo existe.

Não aceitar o digest obtido do próprio report como valor esperado. Não
recapturar contexto para fazer passar receipt antigo. Alteração de critério,
risco, classificação, identidade, método, finalidade/instrução ou ambiente exige
nova prova dependente e contexto esperado aprovado atual; mero timestamp não
revalida nada.

## Recibos JSON ligados ao retorno original

`review.evidence` e cada `check.evidence` referenciam **recibo JSON auxiliar**
regular e hashado. Não reescrever o envelope nativo do revisor ou scanner para
fazê-lo caber neste formato. O recibo aponta ao retorno original por
`source:{path,sha256}`.

Recibo review mínimo:

```json
{
  "revision": "<digest do inventário>",
  "context_digest": "<digest canônico aprovado>",
  "author": "<identidade do autor>",
  "reviewer": "<identidade do revisor>",
  "source": {"path": ".omp/state/run/review-original.json", "sha256": "<hash real>"}
}
```

Recibo check mínimo:

```json
{
  "revision": "<digest do inventário>",
  "context_digest": "<digest canônico aprovado>",
  "source": {"path": ".omp/state/run/check-original.json", "sha256": "<hash real>"}
}
```

Esses exemplos descrevem formato, não evidência executada. O gate confere
recibo→report→digest esperado, author/reviewer no review, hash do recibo e hash
do source original. Alterar source, receipt, hash, contexto ou revisão invalida a
prova. Source e recibo não podem ser autorreferentes ou formar ciclo. Todos os
paths são arquivos regulares seguros dentro da raiz, inclusive `.omp` quando
permitida para evidência, e nunca internos Git em qualquer alias de caixa.
Uma fonte inexistente, adulterada ou insegura bloqueia. A identificação textual
do revisor não comprova sua independência sem a proveniência do retorno real.

## Stages e integração ship/CLI

Em `planning`, baseline corresponde ao inventário atual, risco/justificativa,
contexto real e `plan:{documentation,security,review}` têm conteúdo suficiente.
Não exigir aprovação, documents futuros nem receipt final prematuro.
Em `delivery`, conferir delta/classificação/vínculos/docs, controles, revisão e
fontes atuais completas, além do contexto esperado independente.

Preservar `validateShipQuality(root,{reportPath,required:false,contextPath})`.
`contextPath` é opção nova para o arquivo esperado; configurar
`qualityPolicyVersion:1`, `qualityReport:".omp/state/quality.json"` e
`qualityContext:".omp/state/quality-context.json"` nas configurações novas.
`--quality-report` e `--quality-context` sobrescrevem os caminhos na chamada
autorizada. Caminhos configuráveis são resolvidos e validados antes de ler,
não interpolados em shell.

A política1 exige quality antes de efeitos commit/push/gh; prova presente
sempre é revalidada, inclusive no legado. CLI legada sem versão mantém aviso e
comportamento de compatibilidade somente quando nenhum gate novo é alegado;
relatório presente ou solicitado sem contexto esperado suficiente falha.
Novo trabalho migra explicitamente para a política ampliada. Não alterar perfil
global/grants, contornar `E_UNSAFE_GIT_EXECUTABLE` ou executar publicação nesta
demanda. Entrega local usa o mesmo gate pertinente sem exigir Git.

## Estado, DAG, completude e runtime

Schema2.1/2.2 migra explicitamente para2.3, preservando evidências válidas.
AC usa `type:"behavioral"|"normative"`; compatibilidade anterior sem campo
significa behavioral, mas novos critérios desta spec o fornecem explicitamente.
Não inferir tipo por número de AC. NA legado exige classificação normativa
explícita antes de aceitar esse seam.

A onda persiste review/validation com provas completas aceitas por
`canPromoteWave`; quem promove fornece
`{acceptanceCriteria:progress.acceptance_criteria}`. Onda legada completed
sem prova suficiente reabre integrating preservando evidência anterior e
integração válida; precisa de prova atual para nova promoção. Schema fechado
não aceita estado paralelo silencioso.

DAG/recursos/completude usam IDs/ondas existentes: IDs únicos, dependências
conhecidas, acíclicas, predecessores atuais, recursos reais normalizados,
escritor único e retornos terminais exatos. Faltante, duplicado, stale, falha,
prova forjada ou RUNNING sem job/processo/dono atual impede promoção. Artefato
auxiliar só se necessário, vinculado por run/revisão/hash ao estado e revalidado
no gate; não executa fila concorrente.

Antes do despacho/retomada, observar schema OMP task/batch/flat/async/isolation/
yield e capacidade/configuração atual. `agent` é tipo; `name/id` é instância.
Não emitir campos ausentes. Job criado não é resultado; isolated exige
worktree/backend realmente observado. Sem isolamento, serializar conflitos e
continuar independentes liberados. Preservar cap de três tentativas e histórico,
sem trocar identidade para apagá-lo.

## Modelos nos perfis dos agentes específicos

Esta seção substitui a proposta não lançada de guard universal, modelos schemas1/2,
launcher, extensão, policy global e SDK. O proprietário corrigiu expressamente
o alcance: modelos só são alterados nos agentes específicos do OMP. Skills são
instruções carregadas pelo chamador e não ganham modelo próprio. A composição
atual continua: caller carrega a skill, delega por `task` com `agent` nomeado,
recebe a saída nativa, confere a instância e atualiza o estado que já possui.

A única configuração de seleção distribuída para cada perfil gerido é seu
frontmatter `model`/`thinkingLevel`. Manter nome, ferramentas, fase e contrato
de saída do perfil, salvo correção localizada explicitamente rastreada. A lista
principal/fallback usa a sintaxe nativa já usada no pacote; substituir o antigo
`@slow` por seletor concreto em **cada** perfil. Não alterar o alias global.
Não acrescentar `model` ao wire de `task` como requisito para realizar essa
seleção e não inventar grants, flags ou campos OMP.

### Mapa completo dos perfis geridos

| Perfil gerido | Principal | Fallback concreto | thinkingLevel | Razão por papel |
|---|---|---|---|---|
| `spec-kit-author` | `openai/gpt-6.1-sol` | `openai/gpt-6-astra` | `high` | Escrita canônica, critérios e coerência entre documentos |
| `test-author` | `openai/gpt-6.1-terra` | `openai/gpt-6.1-sol` | `high` | RED, regressões e desenho de testes observáveis |
| `backend-developer` | `openai/gpt-6.1-terra` | `openai/gpt-6.1-sol` | `medium` | GREEN de servidor, domínio e dados |
| `frontend-developer` | `openai/gpt-6.1-terra` | `openai/gpt-6.1-sol` | `medium` | GREEN de interface e cliente |
| `refactorer` | `openai/gpt-6.1-terra` | `openai/gpt-6.1-sol` | `high` | Mudança estrutural preservando comportamento |
| `integrator` | `openai/gpt-6.1-terra` | `openai/gpt-6.1-sol` | `high` | Consolidação de onda e conflitos mecânicos |
| `validator` | `openai/gpt-6.1-sol` | `openai/gpt-6-astra` | `high` | Gates, comandos, rastreabilidade e limites de prova |
| `peer-reviewer` | `openai/gpt-6.1-sol` | `openai/gpt-6-astra` | `high` | Revisão independente da tarefa e integração |
| `deep-reviewer` | `openai/gpt-6.1-sol` | `openai/gpt-6-astra` | `high` | Revisão de entrega com resultados incrementais |
| `requirements-reader` | `openai/gpt-6.1-sol` | `openai/gpt-6-astra` | `high` | Compreensão independente e lacunas materiais |
| `architect` | `openai/gpt-6-astra` | `openai/gpt-6.1-sol` | `high` | Fronteiras, contratos, alternativas e crítica estrutural |
| `host-operator` | `openai/gpt-6-astra` | `openai/gpt-6.1-sol` | `high` | Operação Linux sensível com recuperação autorizada |

Os nove originais e os três papéis adicionais propostos estão todos cobertos.
Esse é um mapa de configuração proposto por responsabilidade, sem benchmark ou
promessa de custo/desempenho. Fonte local já capturada: catálogo OMP18.18.2 em
`implementation-evidence/omp-native-roles/current-openai-catalog.json` do run,
SHA-256 `184d7cb66b98b751cc0d478a8f43eb3f5fd887bf4dcc1da8c2cbc485619dcf57`.
Ele contém esses seletores como provider `openai`, kind `chat`, e admite
`medium`/`high`. A captura é evidência de catálogo naquele instante, não da
disponibilidade futura, autenticação, resolução do perfil instalado ou inferência.
Antes da fase nativa, conferir novamente o catálogo e a precedência efetiva.

Exemplo documental de perfil já existente, sem alteração de código nesta autoria:

```yaml
model: openai/gpt-6.1-sol, openai/gpt-6-astra
thinkingLevel: high
```

Um único `thinkingLevel` do perfil deve ser suportado por ambos os candidatos.
Não converter esforço relativo para outro nível silenciosamente nem inferir
pensamento efetivo a partir do pedido. Uma tarefa mais difícil recebe briefing,
critérios e revisão proporcionais; não modifica sessão/global ou cria override
por chamada para contornar esta fronteira. Se o perfil aprovado for inadequado,
registrar diagnóstico e revisar o próprio perfil no escopo autorizado.

### Resolução, fallback e provas

Registrar separadamente: solicitado (bytes/hash do perfil), resolvido (perfil e
candidato escolhidos pelo OMP quando observáveis) e executado (metadados reais
do job, se disponíveis). Ausência de metadados mantém `actual:null` e
`observation:unverified`; nome configurado ou relato de agente não prova modelo
efetivo. Falha de discovery, candidato inexistente ou saída incompatível bloqueia
a rota afetada, preserva diagnóstico e deixa as frentes independentes livres.

O fallback nativo usa a lista concreta do mesmo perfil e preserva semântica,
identidade e tratamento de falhas do OMP. Isso não é a recuperação técnica TDD:
novo despacho técnico só ocorre após FAIL terminal elegível de solução/capacidade,
com nova instância/job, mesma tarefa/run e histórico/cap de três tentativas.
Auth/network/quota/tooling/configuration não justificam escalada técnica.
Nenhum fallback ou identidade pode ser fabricado por normalização do retorno.

O mapa não configura sessão principal, caller, títulos/rótulos, scout, advisor,
prewalk, compactação, memória, serviços internos ou builtins não distribuídos.
Auxiliares já usados permanecem sob o OMP e as configurações existentes do usuário;
não os desligar, sombrear ou copiar para controlar seu modelo. A análise de seams
universais e a indisponibilidade local de SDK/Bun são história da proposta
superada, não pré-requisitos da evolução reconciliada. Preservar todas as funções
nativas realmente usadas e testá-las proporcionalmente sem prometer um veto
global ou sandbox. O contrato de testes nativos abaixo delimita a prova restante.

## Agentes e protocolos propostos

Preservar os nove: test-author, backend-developer, frontend-developer, refactorer,
peer-reviewer, spec-kit-author, integrator, validator e deep-reviewer. A emenda
v1 consolidou as duas análises das42CAP/18fontes em três definições finas:
requirements-reader, architect, host-operator. A revisão já recebida permanece
ligada aos seus snapshots/hashes; não se reabre o desenho não afetado nem se
transfere aprovação ao delta atual. Doze tipos é derivação, não teto ou prova de
discovery. Crítica independente deste delta ainda é necessária. Nenhum tipo escreve
estado/coordena outro motor; os contratos originais de fase/escrita permanecem.

Task genérico é mecanismo capaz de executar assignment equivalente; o tipo novo
concentra contrato durável de finalidade/ferramenta/saída que o genérico não
impõe sozinho. Leitura/desenho/inspeção simples não obrigam novo filho: caller
registra fast-close/skip fundamentado ou usa referência suficiente. Definição
disponível não agenda chamada. Nenhum builtin é copiado para fixar modelo; o mapa acima cobre todos os perfis do pacote.

### Envelope comum dos novos papéis

Proposta de saída do pacote, não campos nativos task: protocol, role,
instance_id, run_id, source_revision, context_digest, sources:[{path,sha256}],
status COMPLETE|INCOMPLETE, limitations e next_action. Fontes/revisão/contexto
devem ser atuais; retorno faltante, divergente ou autorrevisão indevida não
promove consumidor. COMPLETE não significa aprovação do produto. Manter retorno
original; receipt auxiliar faz o vínculo. Structured/yield/output precisam de
configuração/schema efetivamente disponíveis; campos inventados não vão ao wire.

Frontmatter/toolset não são sandbox. Restrições mecânicas de escrita só são
alegadas se enforcement observado; caso apenas instrucional é declarado limite.
Instância/tipo/pessoa responsável são distintos; template ou modelo diferente
não comprovam independência.

### requirements-reader

`REQUIREMENTS_READING_V1`: gatilho de complexidade, passagem, pressuposto material
ou ambiguidade; entrada documental explícita com finalidade/critério/revisão/
contexto. Somente leitura de fontes/definições ligadas; sem shell, produção,
testes, spec/progress ou entrevista paralela. Acrescenta ao envelope paráfrase do
objetivo, critérios de sucesso, cenários/limites e ambiguidades com fonte/impacto.
Lacuna material não resolvida exige INCOMPLETE. Autor documental corrige fonte;
usuário resolve intenção realmente aberta. Não aprova código/spec nem converte
leitura em review final. CAP-004 e lente prévia de CAP-008.

### architect

`ARCHITECTURE_ANALYSIS_V1`: gatilho de fronteira/API/estado/migração, múltiplos
consumidores, recursos/falhas parciais ou papéis. Entrada fixa escopo/consumidores/
critérios/ambiente/decisões por fonte/hash; somente leitura, sem produção/testes/
spec/progress/plano operacional ou publicação. Acrescenta purpose proposal|critique,
fronteiras/contratos/consumidores, alternativas/tradeoffs, falhas, recursos,
migração/reversão, decisões de papéis para capacidades afetadas, achados e lacunas.
É parecer/proposta, nunca APPROVED de código. Crítica exigida usa outra instância
distinta da autora com contexto atual; spec-kit-author grava canônico único.
CAP-006–008 e desenho pertinente de CAP-036; caller pode justificar SKIP simples.

### host-operator

`HOST_OPERATION_V1`: somente gatilho explícito de operação Linux com alvo,
efeitos/comandos e autorização suficientes. Recebe modo inspeção|mutação,
recuperação, reversão/probes e recursos/locks. Sem alvo/autorização/recuperação
pertinente, INCOMPLETE antes de efeitos. Instalar/discover skill não é gatilho.
**Nenhum host é acessado ou alterado nesta demanda.** Caller pode fazer inspeção
simples autorizada sem filho. Backend GREEN/reviewer não recebem host por desvio
de fase/autoridade.

Acrescenta target/mode, autorização referenciada, inspeções/alterações e fontes
originais path/hash, comandos/probes/resultados, backup/reversão. Mudança de
acesso SSH exige segunda sessão/recuperação comprovada; validar antes de reload;
DNS/HTTP/TLS/renovação conforme escopo. Não faz appfeature, CI/release, publicação,
escalada implícita ou expõe segredos. Revisão sensível segue fluxo existente;
piloto usa ambiente isolado proporcional e não inventa execução host real.

### Parecer security-reviewer nativo

Reusar condicionalmente em CAP-024/034 após discovery/origem/ferramentas e protocolo
compatíveis, sem alterar seu modelo ou copiar builtin. Sua saída
coverage_summary/findings/severity/cobertura/limites é
parecer auxiliar original; não scanner de dependências/segredos nem substituto
dos seis controles. Guardar revisão/identidade/path/hash e retorno bruto.
Deep/peer-review locais conservam o conjunto exato em aggregateReviewInstances:
security-reviewer não pode ser rebatizado como DEEP_REVIEW/VALID ou inserido por
schema falso, nem high/critical ser rebaixado para caber no agregador. A falta
desse parecer opcional não elimina controles: revisão obrigatória de segurança
permanece com os revisores existentes e referências pertinentes. Não copiar ou
sombrear builtin só para escolher modelo.

### Critérios testáveis destes contratos

Pedido simples não dispara chamada obrigatória; ambiguidade material produz
INCOMPLETE com fonte; autor architect não é crítico independente de si; edição
por leitor/desenho só é declarada mecanicamente recusada após prova de enforcement;
host sem gatilho causa
zero efeito; instalação nunca chama SSH. Shadowing/tombstone/nomes reservados
impedem inventário limpo; retorno security nativo falso é rejeitado. Resolução de
perfil e saídas precisam das provas nativas delimitadas abaixo. Esses cenários
não são testes executados, novos IDs de tarefa ou alteração do schema2.3.

## Extensão pós-entrega: retrospectiva

O protocolo único está em `retro/references/protocol.md`. Implementar módulo puro
posterior, sem outro fluxo. `triageRetro(root,input)` revalida quality delivery
atual com contexto esperado confiável e provas seguras path/hash. Input mantém
`run_id,delivery_report,route:"full"|"short",reason,evidence` e flags booleanas
estritas `requested,opt_out,first_pilot,significant_failure,significant_rework,user_unblock`.
Para revalidar o delivery ampliado, recebe também `expectedContextDigest` do
caller confiável, com a mesma fronteira de confiança; não o extrai do report.
Campo ausente/inválido não é convertido silenciosamente em false.

Decision mantém `schema_version:1,run_id,delivery_revision,delivery_report,
delivery_status:"PASS"|"UNKNOWN",decision_status:"COMPLETE"|"INCOMPLETE",
required:boolean|null,triggers,reason,evidence,errors`.
COMPLETE exige deliveryPASS/provas atuais; INCOMPLETE exige UNKNOWN/null.
Optout explícito prevalece sobre gatilhos automáticos, mas não fabrica PASS
para entrega desconhecida. Somente COMPLETE+requiredtrue libera análise.

`validateRetro(root,decision,report)` confere run/revisão/status, fontes
`{path,sha256}`, findings com categoria product/environment/instruction/execution,
evidência/consequência/causa/recorrência opcional, zero a três propostas com
id/evidência/ação/prioridade/critério de sucesso, limitations e next_action.
A revalidação atual precisa receber contexto esperado confiável do caller; a
forma aditiva é `validateRetro(root,decision,report,{expectedContextDigest})`.
Isso não muda a propriedade da decisão nem cria outro coordenador.
Justificativa estrutural não comprova causa semanticamente correta.

Uma triagem por entrega: ship para TDD external; chamador/TDD standalone para
entrega local ou Git autorizada; invocação explícita usa o mesmo protocolo.
Não reabrir delivery, aplicar propostas, criar rotinas ou executar em loop.
Triagem/retro desta demanda ocorre somente depois da entrega.

## Instalação e avaliação posteriores

Instalador preserva dez skills, nove agentes e novos papéis decididos, com
preflight total, backup/staging/hash/rollback seletivo, preservando dados alheios
e edição concorrente. Não instalar destino real antes de review final.
A avaliação instalada posterior registra versão/configuração/schema/discovery,
referências/rotas, jobs/resultados, requested/actual e limites. Unitário/staging/
leitura não equivalem a E2E instalado. Instalação não dispara operações de host.
Nenhuma publicação ou alteração de perfil global é parte desta implementação.

## Erros e estado de revisão

Falhas de inventário/baseline/classificação, contexto esperado ausente/divergente,
receipt/source, docs/segurança/independência, DAG/recursos/retornos ou aprovação
stale retornam ok:false e errors específicos conforme o motor pertinente.
Discovery/perfil/candidato/saída incompatíveis bloqueiam o consumidor afetado e
preservam retorno nativo original; não inventar um erro/objeto wire OMP.

Contrato In Review: autoria não aprova o próprio desenho, código ou execução.
Faltam crítica independente do delta, correções localizadas e provas nativas
listadas em NATIVE-01–10, além das fases finais instaladas já previstas.

## Execution 0.3 e compatibilidade preservada

A API execution abaixo e seus consumidores existentes são preservados. A
aprovação anterior vale para seus snapshots/hash, sem transferi-la a este delta
documental ou à execução instalada futura. O módulo é síncrono, determinístico
e sem I/O, spawn, relógio, rede, credenciais, mutation de argumentos ou progress.
Recebe observações do caller autorizado, que confere proveniência e fatos reais;
comparar dados não autentica jobs, realpaths, revisores ou destinos.

### Notação, valores comuns e erros

Todos os campos dos tipos abaixo são obrigatórios; `null` é valor explícito,
não campo omitido. Objetos são fechados (extra key rejeitada), exceto mapas
`Record` declarados e o Json declarado. Arrays são densos com protótipo ordinário
admitido; nunca invocar métodos herdados fornecidos pela entrada. Essa precisão
preserva entradas JSON sem invocar comportamento fornecido pelos dados. Strings
de identidade não vazias sem CR/LF/controle, booleans são estritos e
inteiros são seguros. Ausente/undefined/coerção/string "false"/NaN/ciclo falham.
Duplicatas de IDs nas coleções que exigem unicidade (tasks/resources/jobs/
instances/chaves de mapa), inclusive variantes de caixa que colidam, são
rejeitadas. Owners podem ser compartilhados por tasks/papéis distintos.
Lista vazia só é aceita onde o tipo/regra a admite.

```ts
type Hash = string; // /^[a-f0-9]{64}$/
type Id = string;   // não vazia, sem whitespace externo/controle
type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
type Proof = {path:string; sha256:Hash}; // caminho relativo canônico, não Git interno
type Diagnostic = {code:string; path:string; taskId:Id|null; message:string};
type Validation<T> = {ok:boolean; errors:Diagnostic[]; value:T|null};
```

Path de Diagnostic é JSON Pointer, inclusive "" para raiz. Mensagens são textos
constantes por código e nunca incluem prompt, segredo ou valor rejeitado.
Ordenar errors por path, code, taskId (null primeiro), message; remover duplicatas.
`ok` significa ausência de erros. Nos validadores estruturais inválidos, value
é null; evaluate pode preservar value parcial conforme regra abaixo.

Execução usa `ExecutionError extends Error`, name "ExecutionError",
code igual ao primeiro diagnostic, errors completos e message igual à primeira
mensagem. Só staticExecutionDigest lança esse erro em entrada inválida;
validate/evaluate devolvem Validation, inclusive ao capturá-lo.

### execution.mjs — exports e schemas

Caminho público `tdd-orchestrator/lib/execution.mjs`:

```ts
export declare function staticExecutionDigest(progress:Progress23, plan:ExecutionPlan):Hash;
export declare function validateExecutionPlan(progress:Progress23, plan:ExecutionPlan,
  context:ExecutionContext):Validation<PlanView>;
export declare function evaluateExecution(progress:Progress23, plan:ExecutionPlan,
  returns:TaskReturn[], context:ExecutionContext):Validation<ExecutionView>;

type Access = "read"|"write";
type Resource = {
  id:Id; path:string; kind:"file"|"directory"|"cache"|"output"|"state";
};
type PlannedTask = {
  id:Id; owner:Id; dependencies:Id[];
  resources:{id:Id; access:Access}[];
  artifacts:string[]; isolated:boolean;
};
type ExecutionPlan = {
  schemaVersion:1; runId:Id; wave:number; revision:Id;
  staticDigest:Hash; resources:Resource[]; tasks:PlannedTask[];
};
type ResourceObservation = {
  resourceId:Id; taskId:Id; realPath:string; parentRealPath:string;
  exists:boolean; directory:boolean; symlink:boolean;
  device:string|null; inode:string|null; linkCount:number;
  source:Proof;
};
type ArtifactObservation = {
  path:string; sha256:Hash; regular:boolean; confined:boolean; source:Proof;
};
type Attempt = {
  runId:Id; wave:number; taskId:Id; attempt:number; instanceId:Id; jobId:Id; owner:Id;
  status:"RUNNING"|"PASS"|"FAIL"|"CANCELLED";
  failureClass:null|"solution"|"model-capability"|"auth"|"network"|"quota"|
    "tooling"|"configuration"|"cancelled";
  startSequence:number; terminalSequence:number|null;
  revision:Id; staticDigest:Hash; returnDigest:Hash|null; source:Proof;
};
type JobObservation = {
  runId:Id; revision:Id; staticDigest:Hash; taskId:Id; attempt:number; instanceId:Id; jobId:Id; owner:Id;
  state:"RUNNING"|"TERMINAL"|"UNKNOWN"; terminalStatus:null|"PASS"|"FAIL"|"CANCELLED";
  source:Proof;
};
type IsolationObservation = {
  taskId:Id; instanceId:Id; worktreeRoot:string;
  resourceIds:Id[]; verified:boolean; source:Proof;
};
type TaskReturn = {
  taskId:Id; wave:number; runId:Id; revision:Id; staticDigest:Hash;
  attempt:number; instanceId:Id; jobId:Id; owner:Id;
  status:"RUNNING"|"PASS"|"FAIL"|"CANCELLED";
  dependencies:{taskId:Id; returnDigest:Hash}[];
  artifacts:{path:string; sha256:Hash}[];
  returnDigest:Hash; source:Proof;
};
type PredecessorObservation = {
  taskId:Id; expectedRevision:Id; expectedStaticDigest:Hash;
  expectedReturnDigest:Hash; source:Proof; result:TaskReturn;
};
type ExecutionContext = {
  schemaVersion:1; observationId:Id; runId:Id; wave:number; revision:Id;
  expectedStaticDigest:Hash; environmentDigest:Hash; source:Proof;
  filesystem:{
    platform:"win32"|"posix"; caseSensitive:boolean; allowedRoots:string[];
    resources:ResourceObservation[];
  };
  capacity:{
    maxWorkers:number; activeWorkers:number; writerSlots:number;
    activeWriterTaskIds:Id[];
  };
  isolation:{available:boolean; observations:IsolationObservation[]};
  jobs:JobObservation[]; history:Attempt[];
  predecessors:PredecessorObservation[]; artifacts:ArtifactObservation[];
  integratedReview:{
    status:"PENDING"|"PASS"|"FAIL"; runId:Id; revision:Id; staticDigest:Hash;
    environmentDigest:Hash; author:Id|null; reviewer:Id|null;
    independent:boolean; source:Proof|null;
  };
};
type PlanView = {
  runId:Id; wave:number; revision:Id; staticDigest:Hash; taskIds:Id[];
  conflicts:{left:Id; right:Id; resourceIds:Id[]}[];
};
type ExecutionView = PlanView & {
  ready:Id[]; running:Id[]; completed:Id[];
  blocked:{taskId:Id; codes:string[]}[];
  complete:boolean;
};
```

Progress23 é o objeto original schema_version "2.3", não cópia de estado criada
por esta API. Conferir os campos estáticos consumidos, IDs/wave, tipos e vínculos;
não converter baseline FAIL em PASS nem conceder override. validateProgress e
canPromoteWave mantêm sua validação integral própria. Cada plan cobre **uma onda**:
tasks é o conjunto exato de IDs progress.waves[wave].tasks, sem faltante/extra.
wave é inteiro positivo existente; runId é progress.run_id; revision é
progress.repo.head_current e a revisão atual fornecida pelo contexto. Dependências
podem ser de tarefa da mesma onda ou anterior; nunca ID desconhecido/futuro,
autorreferência ou ciclo. Tarefa sem recursos/artifacts pode declarar [].

#### Projeção estática e hashes sem ciclo

O algoritmo é público: JSON UTF-8 canônico com chaves de objetos ordenadas
lexicograficamente por code unit, números JSON finitos, sem whitespace, e SHA-256.
Arrays semânticos preservam ordem; os conjuntos abaixo são ordenados explicitamente.
staticExecutionDigest não lê staticDigest do plan nem estado mutável. Projeta:

```ts
const staticProjection = {
  schemaVersion:1,
  progress:{
    schema_version, run_id, task_source,
    contract:{file,version},
    criteria:acceptance_criteria.map(({id,desc,source,tasks,type}) =>
      ({id,desc,source,tasks:sort(tasks),type:type??"behavioral"})).sort(byId),
    wave:{wave,tasks:selectedWave.tasks.map(t=>({
      id:t.id,title:t.title,allowed_write_globs:sort(t.allowed_write_globs),
      acceptance_criteria:sort(t.acceptance_criteria)
    })).sort(byId)}
  },
  plan:{
    schemaVersion,runId,wave,revision,
    resources:resources.sort(byId),
    tasks:tasks.map(t=>({...t,dependencies:sort(t.dependencies),
      resources:t.resources.sort(byResourceIdThenAccess),
      artifacts:sort(t.artifacts)})).sort(byId)
  }
};
```

Essa expressão descreve projeção, não mutation in-place dos arrays recebidos.
Excluir updated_at, todos status/phase/results/provas de promoção, tentativas/
history/jobs/observações e plan.staticDigest. Mudar status/updated_at não muda
digest; mudar critério, tarefa, wave, recurso, owner, dependência, revisão ou
contrato muda. run/revisão/IDs e metadados estáticos inválidos lançam ExecutionError.
Para primeira captura, plan.staticDigest pode ser qualquer Hash bem formado;
depois o caller atribui o retorno sem alterar o restante. Validação exige
igualdade entre calculado, plan.staticDigest e context.expectedStaticDigest.

returnDigest usa o mesmo canônico aplicado ao TaskReturn sem returnDigest e
source; preserva vínculos/artifacts e ordena dependencies por taskId e artifacts
por path. Provas source/path/hash são conferidas separadamente contra observações
atuais; hash não autentica retorno. Nenhum hash inclui a si próprio.

#### Recursos, capacidade, histórico e completude

Paths do plan são absolutos canônicos da plataforma declarada, sem traversal/
segmento ambíguo; cada um está em allowedRoots do caller. resources é o conjunto exato de IDs referenciados pelos tasks, sem entrada
oculta/não usada. Cada referência tem observação única por par taskId/resourceId,
sem extra; realPath/parentRealPath
são absolutos e confinados. Se exists=true, device/inode não vazios, linkCount>=1;
se false, device/inode=null e linkCount=0, parentRealPath é pai existente observado
e realPath é o destino canônico projetado. directory/symlink são booleans, não
provas de filesystem. Resource.kind=file exige directory:false; kind=directory exige true;
cache/output/state usam directory observado para definir lock de subárvore. Caller inclui também temporários/caches/outputs compartilhados.

Confiam-se nos fatos capturados pelo caller, não num fs.realpath feito pelo módulo.
Há conflito se ao menos um acesso é write e houver mesmo realPath (case-fold
quando caseSensitive=false), mesma dupla device/inode existente, ou relação
pai/filho sob lock de diretório. Aliases/case e pais de arquivos ainda não criados
não são ignorados. Symlink observado é resolvido à identidade/realPath para lock,
não autorização para ler evidência insegura. Leituras concorrentes não conflitam.

isolated:false é válido; string/ausente não. isolated:true exige available:true
e prova atual verificada cobrindo todos os resourceIds graváveis da instância.
Prova de isolamento não elimina conflito de identidade real: recursos/caches
ainda compartilhados continuam serializados. Ausência de prova bloqueia só
tarefas dependentes dessa alegação. A API não cria worktree/sandbox.

maxWorkers>=1, 0<=activeWorkers<=maxWorkers; writerSlots>=0 é a quantidade **livre**
de escritores permitida pelo runtime atual (não um teto inventado).
activeWriterTaskIds são únicos e correspondem a jobs RUNNING/owner observados.
Cada tarefa ready escritora consome um slot; leitor não. ready lista todas as
tarefas individualmente elegíveis, não um batch escolhido: pares conflitantes
ficam em conflicts e o dispatcher existente escolhe conjunto seguro conforme
slots/capacidade. Se nenhum slot/worker livre, tarefas novas ficam bloqueadas
por capacidade. Esta API não reserva slot nem despacha.

History é cumulativo, por tarefa, com attempt inteiros contíguos 1..N, N<=3.
Instância/job são novos e únicos por tentativa; mesmo task/run e owner lógico
do plano são preservados. Tentativa N+1 só após terminalSequence da anterior
menor que seu startSequence. RUNNING tem terminalSequence=null/failureClass=null;
PASS terminal tem failureClass=null; FAIL tem classificação não nula diferente
de cancelled; CANCELLED exige failureClass cancelled.
Cada Attempt tem runId igual ao run atual e wave da tarefa original. Job
RUNNING/TERMINAL deve corresponder exatamente à última tentativa declarada,
inclusive run/revisão/digest; sem UNKNOWN usado como prova. Histórico anterior
pode preservar revisão/digest antigos, mas nunca satisfaz retorno atual. Um terminal M1 nunca vira sucesso M2.

evaluate aceita returns parciais e produz visibilidade parcial. Cada tarefa
pode ter no máximo um retorno atual (última tentativa); tentativas antigas ficam
em history e seus digests são preservados. Unknown/duplicate/stale/owner/job/
hash divergente em um retorno gera erro e bloqueia esse task e dependentes;
não esconde tarefas independentes ready. Falha terminal é E_TASK_FAILED, não
conclusão. Ausência de retorno sem job é tarefa ainda não iniciada, ready se
predecessores PASS atuais e capacidade livre; ausência com job RUNNING é running.
Retorno terminal ausente com job TERMINAL é E_RETURN_MISSING; retorno RUNNING
nunca completa. História exaurida ou tentativa anterior ainda ativa bloqueia
novo despacho. FailureClass não autoriza escalada de modelo por si só.

Retorno PASS exige run/wave/revisão/staticDigest atuais, job/owner terminal PASS,
returnDigest válido, lista exata de dependências com digests PASS atuais e lista
exata de artifacts do plan, cada hash igual a observação regular+confined atual.
Predecessores de onda anterior vêm em context.predecessors (sem extras não usados).
Seu wrapper contém bindings esperados atuais do caller confiável, separados do
result apresentado: task/run/wave anterior do progress, expectedRevision,
expectedStaticDigest e expectedReturnDigest precisam coincidir, além de job/
history/artifacts atuais. Não comparar o staticDigest de onda anterior ao da
onda atual: são projeções diferentes. Source do binding também é prova observada,
não aprovação inferida do próprio result. Se predecessor muda,
invalidar só dependentes. Artefato source/proof referenciado também precisa
ArtifactObservation de hash correspondente; links externos não são seguidos.

ready/running/completed/blocked são disjuntos e cobrem o conjunto do plan.
ready/completed/running ordenados por ID; blocked codes únicos ordenados.
Complete=true somente com conjunto exato de returns atuais PASS, zero erros,
zero ready/running/blocked e integratedReview PASS independente (author distinto
de reviewer) ligada a run/revisão/staticDigest/environment e source atual.
Review final só é exigida quando todos os tasks já têm retorno PASS atual.
Antes disso, review PENDING não gera erro prematuro nem retira ready independente;
no candidato completo, review insuficiente gera E_REVIEW_STALE e complete=false.
Complete é barreira de evidência, **não** promoção: caller ainda valida progress,
gates existentes, baseline/autorizações e canPromoteWave. Nunca escrever progress.

validateExecutionPlan retorna value PlanView quando estrutura/bindings/recursos
são válidos, inclusive conflicts conhecidos (não erro por serem serializáveis).
Forma/tipo/run/wave/digest/DAG, captura de recursos insegura/incompleta e capacidade
estruturalmente inválida são falhas globais: value=null. Prova de isolamento
não disponível/não verificada é diagnóstico local E_ISOLATION com taskId,
value PlanView preservado e ok=false; não torna dependente independente incapaz.
evaluate preserva value parcial em falhas locais de isolamento/history/job/
return/predecessor/artifact/review, com ok=false/complete=false; só falhas globais
retornam value=null. Não descartar lock de escritor ativo inválido para liberar
outra tarefa conflitante: conflitos ativos continuam RESOURCE_BUSY; contexto
que não permite observar ocupação segura é base inválida. Falta de retorno de tarefa ainda não iniciada não é
erro global; completar exige sua prova real posteriormente.

| Código execution | Fronteira/negativo mínimo |
|---|---|
| E_SCHEMA | Extra key, boolean string, inteiro inválido, campo obrigatório ausente |
| E_PROGRESS | Schema diferente de2.3 ou campos estáticos/IDs/AC inválidos |
| E_TASK_SET | Falta/extra/duplicata de task ou wave divergente |
| E_BINDING | run/revisão/digest/contexto esperado divergentes |
| E_DEPENDENCY | ID desconhecido/futuro/autodependência |
| E_CYCLE | Ciclo na onda |
| E_RESOURCE | Path fora raiz, observação/identidade ausente ou recurso desconhecido |
| E_ISOLATION | isolated:true sem prova atual; não ignorar conflito real |
| E_CAPACITY | Capacidade inválida; falta de slot vira bloqueio por tarefa |
| E_HISTORY | Attempt não contíguo/>3, job/instância reaproveitados ou tentativa sobreposta |
| E_JOB | Job/owner/estado não corresponde ou UNKNOWN usado como prova |
| E_RETURN_SET | Retorno desconhecido/duplicado |
| E_RETURN_MISSING | Job terminal sem retorno atual |
| E_RETURN_STALE | Revisão/staticDigest/returnDigest divergentes |
| E_PREDECESSOR | Conjunto/digest/PASS de dependência divergentes |
| E_ARTIFACT | Hash/tipo/confinamento/source não correspondem à observação |
| E_TASK_FAILED | FAIL/CANCELLED terminal preservado; dependentes bloqueados |
| E_REVIEW_STALE | Review ausente/pending/não independente/contexto divergente |

Códigos de blocked adicionais, sem erro global: CAPACITY, RESOURCE_BUSY,
DEPENDENCY_PENDING, DEPENDENCY_FAILED, ATTEMPT_RUNNING, ATTEMPTS_EXHAUSTED,
ISOLATION_UNPROVEN. Conflito entre dois ready fica em conflicts, não desaparece.

### Migração, consumidores e precisão TEST_REF

Adicionar execution sem substituir APIs state/quality/deep-review. Plano auxiliar
novo é capturado pelo coordenador a partir dos mesmos IDs/onda/critério; não
migrar progress2.3 para schema paralelo, não acrescentar campos a ele nem
reescrever receipts. Dados legados sem bindings/observações suficientes
permanecem históricos e bloqueados até captura atual, sem retroPASS.

T-003 test-author escreve RED de AC-011 após revisão deste delta; prova parcial
AC-006 já existente é preservada. Apenas a gramática de TEST_REF evolui:
**um único separador "::"**, arquivo relativo não vazio sem ":"/CR/LF/controle,
título não vazio em uma linha que pode conter ":" isolado, mas nunca outro "::".
Sem trimming/renomeação silenciosa. "a.test.mjs::AC-006: behavior" é válido;
"a::b::c", "::b", "a::", "a::b\n", caminho de drive ou separador ambíguo são
inválidos. A mesma regra vale em criteria matrix, failing_tests,
revision_delta, revision_baseline_tests, persistência e migração; preservar nomes/
IDs/provas anteriores byte a byte. Não expandir schema2.3 por conveniência.

### Precisão retro 0.3 — mesmas APIs, leituras declaradas

triageRetro e validateRetro são somente leitura de filesystem autorizado:
revalidam relatório/provas/hash com os mesmos guards de qualidade. Não são
funções matematicamente puras; nunca escrevem arquivos, executam comandos,
instalam ferramentas, usam rede ou alteram delivery/progress. A qualificação
"puro" nas seções históricas significa ausência desses efeitos, não ausência de
leitura. Esta precisão não muda a assinatura aprovada nem cria outro fluxo.

```ts
type RetroFlags = {
  requested:boolean; opt_out:boolean; first_pilot:boolean;
  significant_failure:boolean; significant_rework:boolean; user_unblock:boolean;
};
type RetroInput = RetroFlags & {
  run_id:Id; delivery_report:string; route:"full"|"short";
  reason:string; evidence:Proof[]; expectedContextDigest:Hash;
};
type RetroDecision = {
  schema_version:1; run_id:Id|null; delivery_revision:Hash|null;
  delivery_report:string|null; context_digest:Hash|null; opt_out:boolean|null;
  delivery_status:"PASS"|"UNKNOWN"; decision_status:"COMPLETE"|"INCOMPLETE";
  required:boolean|null; triggers:string[]; reason:string; evidence:Proof[];
  errors:string[];
};
type RetroFinding = {
  category:"product"|"environment"|"instruction"|"execution";
  evidence:Proof[]; consequence:string; cause:string; recurrence?:string;
};
type RetroProposal = {
  id:Id; evidence:Proof[]; action:string; priority:"high"|"medium"|"low";
  success_criterion:string;
};
type RetroReport = {
  run_id:Id; delivery_revision:Hash; status:"COMPLETE"|"INCOMPLETE";
  sources:Proof[]; findings:RetroFinding[]; proposals:RetroProposal[];
  limitations:string[]; next_action:string;
};
export declare function triageRetro(root:string,input:RetroInput):RetroDecision;
export declare function validateRetro(root:string,decision:RetroDecision,report:RetroReport,
  options:{expectedContextDigest:Hash}):{ok:boolean;errors:string[]};
```

Objetos acima são fechados; recurrence é a única chave opcional. Strings
descritivas não vazias; evidence/sources de decisão COMPLETE e de cada finding/
proposal são listas não vazias de Proofs regulares seguros/hash atual. Report
sources é não vazio; findings/proposals podem ser [], proposals no máximo3,
IDs únicos. Priority é prioridade da proposta, não gravidade de segurança.
Limitations pode ser [] e não encobre lacuna obrigatória; next_action é explícita,
inclusive "nenhuma ação proposta". Cause pode ser hipótese declarada, não
certeza inventada. Estrutura não demonstra verdade semântica da causa.

triggers é subconjunto único e ordenado de
["full","requested","first_pilot","significant_failure","significant_rework","user_unblock"].
É calculado exclusivamente das flags booleanas/rota e evidências atuais; opt_out
não apaga gatilhos, só tem precedência na decisão. Todos os seis flags são
obrigatórios e booleanos (incluindo false); ausência não vira false. Reason
explica decisão/limites. Input inválido/arquivo ausente/stale/prova insegura gera
INCOMPLETE/UNKNOWN/required:null, errors não vazio, opt_out explicitamente
preservado quando booleano válido; se inválido/ausente, opt_out=null, nunca false
inferido. run_id/delivery_report inválidos ficam null no diagnóstico incompleto,
sem copiar valor inseguro. COMPLETE exige esses campos válidos não nulos.

COMPLETE exige delivery revalidada PASS com expectedContextDigest recebido de
fonte atual independente, context_digest igual a esse valor e delivery_revision
atual. required é !opt_out && triggers.length>0. Se entrega é desconhecida,
context_digest/delivery_revision só são mantidos quando obtidos validamente;
caso contrário null, nunca hash inventado. Optout verdadeiro não fabrica PASS.
Flags/evidências originais continuam no input operacional preservado pelo caller;
nenhum relatório texto é reinterpretado como autorização.

validateRetro requer decisão COMPLETE+requiredtrue, report COMPLETE e fontes/
run/revisão/contexto atuais. Faz novamente o gate delivery com options
expectedContextDigest externo e confere igualdade com decision.context_digest;
não o obtém do report. Report INCOMPLETE retorna okfalse e errors, embora
permaneça registro histórico legítimo. Decisão requiredfalse não libera análise;
não fabricar report vazio para obter aprovação. Opções ausentes, exceção de
leitura ou dado inválido retornam okfalse/errors descritivos, sem lançar aprovação.

Fixture positiva sintética: delivery report/provas atuais válidas pelo fixture de
quality, route full, flags {requested:false,opt_out:false,first_pilot:false,
significant_failure:false,significant_rework:false,user_unblock:false},
reason "fixture full", evidence [proof] e expectedContextDigest igual ao contexto
aprovado da fixture produzem COMPLETE/PASS/requiredtrue/triggers["full"].
Report correspondente COMPLETE com sources[proof], findings[], proposals[],
limitations[], next_action "nenhuma ação proposta" valida oktrue.
Com opt_out:true, mesma entrega produz COMPLETE/PASS/requiredfalse,
triggers["full"] e opt_outtrue; não executar análise.
Trocar hash/source/expected digest ou remover uma flag produz decisão incompleta
ou validação false; ausência de entrega sempre UNKNOWN/null, inclusive com optout.
Adicionar quatro propostas, priority desconhecida ou evidence[] de proposta
falha. Nenhuma dessas fixtures é retrospectiva desta demanda antes da entrega.

### Precisão do instalador — CLI e transação, sem nova API pública

Preservar `node install.mjs` e `node install.mjs --check` e demais opções
já implementadas; este contrato não exige flags/APIs novas de staging/rollback.
Funções internas, formato interno de manifest e organização de testes pertencem
ao developer. --check é somente leitura e sinaliza sucesso/falha/drift nos códigos
existentes; nenhuma correção, backup ou instalação implícita nessa chamada.

Inventário final autorizado é10skills/12tipos do pacote (9originais+3da emenda).
Security-reviewer/scout/task/sonic/reviewer bundled não são cópias a instalar.
A atualização legítima7skills/9agentes→10/12 preserva nomes/histórico e pode
substituir arquivos geridos de versão anterior quando a propriedade anterior é
demonstrada; não tratar todo arquivo de versão anterior como foreign. Arquivo
desconhecido, colisão de tipo, link ou edição local não reconciliada é conflito,
não permissão para overwrite. Extras alheios são preservados e reportados
segundo a semântica existente, nunca apagados para fazer --check passar.

Transação obrigatória, independentemente da implementação interna:

1. Preflight de **todo** inventário antes de escrever: fontes regulares seguras,
   destinos/ancestors reais, ownership gerido e baseline dos bytes existentes,
   colisões projeto/usuário/nomes/case/links e diretórios no lugar de arquivo.
2. Backup imutável e staging em diretórios operacionais explicitamente autorizados,
   path/hash e inventário verificados. Receipts/provas de transação ficam em paths
   relativos canônicos confinados à raiz operacional aprovada, não em symlink,
   Git interno, shell string ou caminho controlado por report. Segredos ausentes.
3. Antes de cada substituição, compare-and-swap (CAS): identidade/tipo/hash do
   destino ainda devem coincidir com preflight ou ser a ausência observada. Se
   mudou concorrentemente, abortar dependentes e preservar edição; não sobrescrever.
4. Na falha parcial, rollback seletivo restaura só bytes do pacote cuja versão
   atual ainda é a escrita pela transação (CAS também na reversão). Nunca pisar
   em edição concorrente ou arquivo foreign. Se não puder restaurar com segurança,
   reportar quais arquivos ficaram pendentes com hashes/limites; não declarar
   sucesso/rollback completo falso nem executar limpeza recursiva alheia.
5. Conferir hashes/inventário finais e --check. Instalação real somente após review
   final; nesta implementação usar destinos staging autorizados. Nova sessão OMP
   e discovery/E2E de todo pacote instalado permanecem aceites posteriores.

Positivos: staging vazio recebe10/12; staging com versão gerida7/9 íntegra atualiza
para10/12 e preserva foreign extras, ownership e arquivos anteriores em backup.
Negativos: fonte insegura, conflito de tipo, drift antes da escrita e novo
link/edição entre preflight/ação causam falha sem sobrescrita alheia; falha após
parte das cópias reverte somente bytes ainda pertencentes à transação. Testar
edição concorrente antes do CAS de escrita e antes do CAS de rollback, usando
CLI existente em staging; não criar API pública só para expor esses seams.

## Provas nativas restantes e correções localizadas

Estado inicial de todos os itens: **PENDING_NATIVE**. São obrigações de prova,
não resultados desta autoria. Fonte atual é o inventário de sete skills/nove
agentes de install.mjs e a análise do padrão atual; destino proposto é dez
skills/doze perfis após integração revisada. Node e o OMP instalado bastam ao
mecanismo atual; não exigir SDK/Bun ou nova extensão. Capturar schema task e
versão reais somente na fase apropriada, sem fortalecer parâmetros opcionais.

| ID / responsável | Teste exato e resultado necessário |
|---|---|
| NATIVE-01 / integrador + validator | Em staging seguro, comparar fonte/destino/hash de cada perfil e referência; registrar versão OMP, discovery e precedência projeto/usuário. Provar os 12 nomes/10 skills quando integrados e que um perfil homônimo não é confundido com a cópia prevista. --check/discovery têm resultados próprios. |
| NATIVE-02 / validator | Resolver cada um dos 12 perfis contra catálogo atual, principal/fallback concretos OpenAI kind chat e thinkingLevel suportado; capturar origem/hash do perfil selecionado e metadados de candidato/execução disponíveis. Não alterar aliases/settings. Ausência de actual permanece null/unverified; registrar exatamente qual metadado faltou. |
| NATIVE-03 / caller + validator | Despachar tarefa inócua nomeada com a forma task atual; com batch habilitado, duas instâncias disjuntas na mesma chamada; sem batch, duas chamadas flat equivalentes. Conferir IDs de instância, tipo agent, retornos terminais exatos, recursos e revisão. Nunca exigir batch quando desabilitado nem usar sucesso de transporte como conclusão. |
| NATIVE-04 / caller + validator | Exercitar async/yield, nested já usado, retomada e isolamento somente nas modalidades expostas; registrar job atual e coleta terminal. Demonstrar writer conflicts serializados e paralelismo de independentes, incluindo cache/output. isolated:true sem prova real falha, e indisponibilidade não é isolamento presumido. |
| NATIVE-05 / peer-reviewer independente + validator | Com o perfil peer-reviewer instalado intacto, assignment TDD_PEER_REVIEW sobre fixture inócua: observar se frontmatter output permite a resposta legada iniciada APROVADO/BLOQUEADO exigida pelo corpo. Testar sucesso e bloqueio/malformado. Guardar retorno bruto e erro nativo. Compatibilidade entre schema estruturado e texto continua NÃO VERIFICADA até esse teste; se incompatível, corrigir declaração do perfil/documento por revisão localizada, sem substituir o protocolo TDD por objeto inventado. |
| NATIVE-06 / deep-review + validator | Observar deep-reviewer e fallback nomeado peer-reviewer/DEEP_REVIEW_FALLBACK: yield escalar por campo e findings incrementais, identidade/revisão atuais; duas instâncias do mesmo tipo com assignments disjuntos entram em aggregateReviewInstances com IDs reais. Faltante, duplicata, revisão stale e modo errado bloqueiam; TDD normal não entra nesse agregador. VALID significa resultado válido, não aprovação. |
| NATIVE-07 / deep-review dispatcher + validator | Fixture branch/base exige local_revision_context.revision === head_revision como protocol.mjs consome. No PR, fornecer diff e conteúdo integral dos arquivos pertinentes obtidos no mesmo SHA remoto aprovado; preservar path/hash/SHA da coleta. Workspace local ou patch parcial não substituem silenciosamente conteúdo remoto. Conteúdo remoto ausente deixa revisão incompleta. |
| NATIVE-08 / spec-kit-author + revisão independente | Corrigir textos de batch obrigatório para condicional ao suporte; distinguir delegação documental de Fase0 antes do OK e implementação só após o OK já aplicável; corrigir resumo DONE que menciona COVERED para IMPLEMENTED/VALIDATED conforme state.mjs. Revalidar essas instruções contra os consumidores e testes; não exigir nova aprovação do escopo já autorizado nesta demanda. |
| NATIVE-09 / caller + validator | Provar a lista de fallback do próprio perfil no OMP e a identidade mantida por fallback nativo, com fonte/erro/candidato observados em fixture sem efeitos ou mecanismo nativo de falha controlada. Se não houver controle nativo seguro, registrar passos/metadados exatos pendentes sem fabricar execução ou exigir interceptador global. Separadamente provar recuperação técnica após FAIL terminal solution/model-capability: novo job/instância, mesma tarefa/run, limite3/histórico. Infraestrutura não vira escalada. |
| NATIVE-10 / integrador + revisores finais | Após revisão final e instalação autorizada, executar pacote integrado short/full/local/external sem publicação, DOC/review/validate, retro com dono/opt-out, referências e retomada/falha. Conferir estado e gates reais, documentação semântica atual e ausência de mudanças globais. Relatório distingue unidade, staging, análise estática e E2E instalado; os 42 CAP/18 fontes têm prova/limite por linha. |

NATIVE-05 é uma incerteza contratual concreta: não declarar que a saída textual
foi aceita pelo OMP só porque a fixture da biblioteca passa. NATIVE-06 conserva
TDD_PEER_REVIEW e DEEP_REVIEW_FALLBACK distintos. Erros nativos/retornos ausentes
permanecem bloqueios do consumidor; nenhum adaptador inventado mascara a lacuna.
Para novos papéis, os dados de envelope propostos acima são conteúdo do pacote,
não novos campos task/yield; provar sua representação no esquema nativo antes
de alegar enforcement. Restrição textual ou toolset não comprova sandbox.

O dispatcher corrige a redação branch/base para revisão igual a head_revision,
faz o fornecimento remoto no SHA e documenta batch/flat condicionais. O caller
confere diff/histórico/locks/revisão real; state.mjs não prova sozinho todas as
transições, autoria ou uso de locks. validateProgress/canPromoteWave conservam
promoção e critérios IMPLEMENTED/VALIDATED; COVERED não promove tarefa a DONE.

### Supersessão e disposição dos achados

0.3r5 aplica a correção explícita do proprietário e o Continue já concedido;
não pede novo waiver, aprovação de escopo ou decisão universal. Os bytes dos
quatro docs 0.3r4 e hashes ficam em agent-pattern/before do mesmo run; revisão1,
revision2, falhas, seam analysis e retornos originais permanecem intocados.

NATIVE-CONTRACT-IR-001/002 P1 referem-se ao desenho universal superado. Registrá-los
como **superseded proposal; not code-fixed; not independently closed**. Esta
autoria não encerra achados por mérito de código. MODELS-IR-001/002 P2 e o
protótipo models/172GREEN/10TODO continuam históricos e não integrados; não
certificam perfis. APIs prepareNativeRun/assertNativeTaskCall/assertResolvedRoute,
schemas models1/2 e caminhos launcher/audit/policy/SDK eram proposta não lançada:
deixam de ser requisito de implementação. Não removê-los de evidência ou alegar
que foram executados. Nenhuma função lançada depende de preservá-los como API.

Qualidade, execution/schema1, progress2.3, TEST_REF, retro, installer e revisão
legada/instâncias permanecem preservados. Revisão de deltas anteriores só vale
para seus hashes; revisão independente atual é necessária antes dos dependentes.
Esta é tentativa3 de T-007-native-contract, autorizada e limitada a quatro docs,
sem reset de contador, sem autoaprovação, sem implementação ou piloto nesta fase.

## Histórico

| Versão | Mudança |
|---|---|
| 0.1.0 inicial não lançada | Inventário/delta/docs/segurança, schema2.3 e retro planejada |
| 0.2.0 nos snapshots aprovados | 42CAP/18fontes, qualidade/contexto/receipts e papéis; aprovação histórica vinculada aos hashes originais |
| 0.3.0 proposta | Execution/models, TEST_REF, precisão retro e transação CLI; sem aprovação de implementação por autoria |
| 0.3r3 / 0.3r4 superadas quanto a modelos | Guard universal, schemas models e alternativas de seam ficaram propostas não lançadas, sem prova preventiva; bytes, falhas e P1/P2 preservados |
| 0.3r5 proposta In Review | Correção explícita de escopo: perfis nomeados/frontmatter, OpenAI concreto por papel, task/yield atuais e provas nativas delimitadas; preserva APIs não afetadas e não se autoaprova |


## Emenda 0.3r7 — seleção Git Windows sob contexto OS confiável

Estado: rascunho In Review de T-010-contract-draft, tentativa1. API pública0.3.0/schema2.3 e contratos anteriores
preservados. Aprovação limitada em owner-decision/approval.json do diagnóstico
autoriza desenvolver/revisar, não aprova este desenho ou uma execução Git.
AC-017/018 são behavioral; AC-019 normative. Nenhum API/flag global novo obrigatório.

### Ameaça, autoridade e política

OS/kernel, Node chamador, administradores e bytes revisados do produto são TCB
assumida. Por decisão material direta de 2026-11-09, a TCB passa a incluir o
contexto normal de resolução de nomes e carga fornecido pelo OS ao chamador,
incluindo o contexto usado para iniciar o helper e os processos pertinentes.
Adversário capaz de alterar esse contexto está fora da garantia adicional
revista. Isso é redução da garantia anterior, não sua demonstração técnica.
Adversário semadmin ainda pode controlar repo/PATH/env/reports e arquivos em que
tem direitos; nenhum desses dados se torna autoridade. A confiança no contexto
OS não dispensa verificações de arquivo, aliases, ACL e diretórios/dependências
de carga pertinentes sob esse contexto. Não se certifica OS inteiro nem se
fornece sandbox de Git/config/hooks.
Legado nlink1 não prova origem/ACL e tem limitações preservadas; o novo risco do
alias vendor é mutação/identidade por qualquer nome do mesmo arquivo. A decisão
não alarga regularUnlinked de fontes/destinos/markers nem aceita hardlink genérico.

Extensão inicialmente OFF, habilitada somente para política revisada de release/
arquitetura/editor/origem/linkset e provas do host. Política não é derivada
automaticamente do hash/certificado observado na própria máquina. Dados esperados
vêm do produto revisado/decisão independente e fontes primárias; assinatura do
wrapper é checada pelo OS confiável contra política de editor/cadeia/revogação,
com indeterminate recusado. Owner authorization não é package attestation.
Manifesto criptográfico de toda instalação é endurecimento opcional, não gate
implícito. Informar quais componentes são autenticados e quais são confiados
por proteção administrativa. Main mutável do instalador não é pin da release.

Bootstrap do probe usa metadados confiáveis do runtime fornecidos pelo OS, sob
a TCB revista, para ancorar a imagem/runtime administrados e pertinentes antes
de sua execução. O desenho e a revisão devem identificar a fonte OS, a cadeia
de derivação da âncora e os controles de arquivo/ACL/carga usados; não basta
nomear um helper conhecido. Âncora é externa ao report/candidato; não confiar
em PATH/SystemRoot/PSHOME/ComSpec fornecidos nem derivar autoridade do env.
NoProfile/nome de arquivo/JSON ok:true não autenticam o executável. Uma vez
ancorado, probe metadata-only pode preceder Git e consultar APIs nativas, sem
SDK/instalação/global change. Bloqueio AppLocker/WDAC/ConstrainedLanguage é limite,
nunca justificativa para bypass. Falta de bootstrap comprovado mantém recusa.

A âncora candidata do host Windows incluído no OS usa caminho relativo fixo
em System32 derivado de metadados do módulo OS realmente carregado no runtime
confiado. PATH/env/CWD/report não selecionam host ou âncora. A confiança aceita
no contexto OS e nesse host administrado não exige recertificar todo o Windows;
checagens delimitadas de âncora, arquivo regular/reparse e política do host
continuam obrigatórias. Falha de política AppLocker/WDAC/CLM nega. PS5 e
Reflection.Emit em memória são candidatos do mapa de viabilidade, não código
aprovado nem obrigação de novo SDK/serviço. Observação filtrada por ntdll/kernel32
não prova ausência de kernelbase; dependências de bootstrap devem ser confrontadas
com a coleta efetiva, sem preencher metadados ausentes por inferência.

O adversário admitido conserva tentativas de criar alias ou usar handle de
escrita retido sobre arquivo pertinente. ACL atual isolada não prova que nenhum
handle anterior exista: a revisão precisa de argumento delimitado sobre quais
direitos permitem obter/reter o handle, sobre o objeto/aliases reais e a proteção
administrativa assumida, além de negativos pertinentes. Nova enumeração, lock
ou inexistência de ataque observado não apagam esse risco. Se houver capacidade
admitida não protegida ou lacuna material concreta nesse argumento, negar.
Compromisso anterior de OS/admin ou delegação privilegiada de handles contrária
à premissa de administradores confiáveis está fora da TCB aceita; isso não
exclui handles legitimamente obtidos pelo adversário não privilegiado admitido.
Não exigir auditoria universal do histórico do OS nem adicionar serviço/lease
como resposta automática. O revisor deve registrar o limite residual exato e
decidir se a prova delimitada satisfaz os controles retidos, sem waiver tácito.

### Predicado de extensão

Todos obrigatórios, com desconhecido=false:

1. Candidato PE no caminho absoluto da instalação vendor admitida, não cmd/bat,
   reparse/junction/symlink/ADS/UNC/device/ambíguo; ancestrais e aliases conferidos.
2. Linkset exato da política da release. Para o layout observado, somente
   cmd/git.exe e cmd/git-lfs.exe. Enumerar até término nativo, tratar MORE_DATA,
   falhas e troca de identidade. Linkcount2 sozinho não basta.
3. Mesma identidade por handles: volume64 + fileID128 (ou identificador64 nativo
   documentado quando suficiente), hex/string/BigInt sem Number arredondado.
4. Proveniência/editor/assinatura/versão/arquitetura coerentes com política externa;
   recursos PE e saída do próprio Git não são a autoridade da política.
5. Arquivo, todos os aliases e seus caminhos/ancestrais pertinentes protegidos
   de mutação pelo adversário admitido dentro do contexto OS confiado, incluindo
   ACL efetiva/owner/WRITE_DAC/WRITE_OWNER/DELETE e DELETE_CHILD do pai.
   Avaliar ACEs aplicáveis, herança/grupos/condicionais; inherit-only ou criação
   de arquivo não relacionado em C:/ não equivalem a substituir Program Files.
   ACL desconhecida/inconclusiva recusa; não inferir proteção de owner isolado.
6. Resolver wrapper→Git real/LFS e dependências de carga pertinentes à seleção;
   instalação administrada e diretórios de busca devem impedir redirecionamento
   incremental para código atacante. OS é TCB; configs/aliases/filtros/hooks
   arbitrários continuam limites legados, não alvo de auditoria universal.
7. Preservar proteção de arquivos/aliases até uso sob a TCB revista. A rota
   candidata usa pathname protegido e spawn Node shell:false dentro de contexto
   privado por invocação, com política/identidade/ACL/carga pertinentes validadas.
   O contexto OS normal é premissa declarada, não resultado de amostras.
   Não exigir broker nativo, lease ou demonstração de imutabilidade do namespace
   contra adversário excluído. Re-stat isolado não fecha corrida de arquivo;
   se a proteção de arquivo/alias não for estabelecida, negar. Handles podem
   reforçar proteção, sem substituir DACL/identidade/alias/carga. Nenhum pathname
   aprovado ou trusted=true é devolvido para execução fora desse contexto privado.

Novo alias não cria automaticamente direito WRITE no arquivo, pois aliases
compartilham o objeto; ainda assim o linkset deve ser exato conforme autorização.
Novo alias concorrente, falha de enumeração ou alteração detectada no contexto
validado exige negação/revalidação; não concluir race-free por observação pontual.
A confiança na resolução OS não é bypass para arquivos/aliases mutáveis.

### Organização e interface interna candidata

Factory autocontida única em scripts/lib/git-trust-source.mjs; instalador usa
a factory e gerador scripts/generate-git-trust.mjs materializa os mesmos bytes
em região do pre-push original. Gerador --check verifica derivação sem efeitos.
Installer copia o original como hoje, sem import relativo novo nem quinto
arquivo. Os quatro nomes geridos e marker/ownership/preflight/rollback atuais
permanecem. Nenhum eval/import/código vindo de report/env/CWD é aceito.

Interface interna sugerida, sem novo export público obrigatório:

```ts
type GitFailureReason = "BOOTSTRAP"|"PROVENANCE"|"LINK_SET"|"IDENTITY"|
  "ANCESTOR"|"ACCESS"|"LOAD_PATH"|"CONTEXT_CHANGED"|"PROBE"|"TIMEOUT";
type GitRunResult =
  | {ok:true; status:number; stdout:string; stderr:string}
  | {ok:false; code:"E_UNSAFE_GIT_EXECUTABLE"; reason:GitFailureReason;
     message:string};
// Sessão é objeto/closure privado, não token JSON aceito do chamador.
// run(args, {cwd,input?}) executa apenas sob contexto aprovado; close é idempotente.
```

Developer pode adaptar resultado à forma atual `{failure|absent|stdout}` do
installer e `{error|status|stdout|stderr}` do hook; preservar código público,
mensagens semânticas e tratamento de exit1/128. status!=0 de Git é resultado do
processo, não erro de confiança. Falha da extensão não aciona outra cópia/PATH/
shell nem estado global. Não adicionar bypass via env/report/mock em produção.
Não-Windows e Windows nlink1 mantêm caminho legado e limites explicitados.

Probe PS5.1, se escolhido: comando fixo, dados JSON UTF8 limitados, nenhuma
interpolação shell, origem/nonce/contexto e esquema fechados, timeout/saída
limitados, zero Git. Args Git usam array Node/shell:false; NUL inválido, vazio/
Unicode/aspas/barras preservados. A rota usa transporte Node existente; não adota
broker/serviço nem transporte TLS/SAB proposto em T-009. Preservar stdout/stderr,
UTF8, entrada, status/exit1/128, drenagem, limites e cleanup dos filhos da rota
usada. PS splatting/Start-Process -ArgumentList não substituem prova de argv.
Preservar usuário/token/sessão/perfil/credenciais/cwd/ambiente/TTY e stdio originais;
não elevar, trocar identidade ou remover ambiente para aparentar compatibilidade.

Uma validação pertinente por invocação/sessão, sem heavy scan por operação sem
medição. Reuso intrassessão vincula identidade/política/env/token e invariantes
de proteção atuais sob a TCB revista; não cache persistente baseado em TTL/mtime.
Medir startup/cold/warm/p50/p95/timeout/cleanup e aprovar orçamento antes de
habilitar. Erros de orçamento negam, não reduzem checagens silenciosamente.

### Compatibilidade, testes e aceite

Criticar desenho antes de RED; RED meaningful sem Git; GREEN isolado; revisão
independente do guard e provas OS; somente então duas suites reais em temporários.
Mover findSh/Git do import/setup/cleanup para gate; preservar assertions de
branch/default/ref/commitlint/transação e adaptar fault injection ao seam test-only.
Testar par positivo e aliases extras/externos/ID truncado/assinatura ou ACL
inválida/probe falso/troca concorrente, derivação, cópia standalone, scripts copiados,
destino externo, linked worktree, quatro geridos/LFS/POSIX e args/erros/timeout.
Mocks não autenticam instalado; fixture sem Git não é integração Git. AC-019
normativo não recebe RED inventado. Fonte/hashes/autor/revisor/contexto precisam
corresponder; unknown é BLOCKED. Revisões finais e NATIVE-01–10 continuam depois.

0.3r7 é rascunho documental de T-010, tentativa1, sobre a base0.3r6; não reseta
T-007attempt3 ou T-009-native-design-review3/3 nem aprova retroativamente fatos.
Novos AC/gates não substituem16AC/42CAP/18fontes. Modelo configurado não prova
execução: actual=null/unverified quando não observado.


### Decisão material, história e habilitação

A fonte da autorização é a mensagem direta “prossiga com a recomendação”,
registrada no run caf845e9-a9e9-4fb8-857e-81aa5473aef6 em
implementation-evidence/T-010-boundary/owner-authorization.json,
SHA-256 39d76d3c0dd58f8f27d936c09325c391e7c70dd258107dc24365bd2f3f809bd9.
A escolha anterior keep_current_guarantee continua fato histórico imutável;
somente a decisão direta atual supera sua exigência para este novo escopo.

| Achado/proposta anterior | Disposição nesta fronteira |
|---|---|
| TD-001 e NDR-001: seleção inicial/namespace/carga sob a garantia anterior | Requisito adicional anterior superado pela mudança de TCB autorizada; falha de prova histórica preservada. Não fixed, não encerramento independente, não waiver de risco. |
| Proposta nativa de namespace estrito | Não adotada/NO_GO; nenhuma composição anterior passa a ser demonstrada. |
| NDR-002: serviço/pré-requisito operacional | Serviço não adotado; nenhum serviço, SDK ou instalação obrigatória acrescentado. Não code-fixed. |
| NDR-003: transporte TLS/SAB/controle de fluxo | Proposta não usada pela rota pathname/Node; nenhum deadlock ou achado de transporte é declarado corrigido. |

Qualquer falha atual de proteção de arquivo/alias/ACL, origem/assinatura,
identidade/linkset ou carga pertinente continua bloqueante até correção/prova.
A exclusão de alteração do contexto OS não apaga esses achados nem enfraquece
os negativos pertinentes. RED/falhas/observações/reviews anteriores permanecem
nos arquivos históricos. T-010 é escopo material distinto, máximo3 tentativas
por tarefa nova, sem reset ou quarta tentativa da review T-009 esgotada em3/3.

A cadeia completa installer/pre-push e consumidores ship existentes recebe a
mesma decisão terminal. O guard público legado nlink1 de fonte/destino/marker,
não-Windows, CLI/argv/stdio/status, quatro hooks, cópia standalone, destino
externo consentido, worktree/LFS e usuário original permanecem. Sem segundo
orquestrador, CLI extra, fallback para outro Git/cópia/PATH ou execução shell
após rejeição. OpenAI somente nos perfis OMP específicos; nenhum perfil, alias
ou configuração global é alterado por esta revisão.

Inventariar provas afetadas: conclusões sobre a fronteira antiga não aprovam a
nova; testes de arquivo/alias/proveniência/compatibilidade ainda pertinentes são
preservados/reusados apenas com contexto equivalente. Negativos que exigiam a
garantia adicional excluída passam a históricos/superados explicitamente, nunca
a PASS/NA fabricado ou apagamento de evidência. Mudança de bytes, política,
contexto ou critérios invalida revisão dependente. São necessários revisão
independente dos cinco drafts atuais antes de integração canônica, RED antes de
GREEN, revisão independente de guard implementado e evidências atuais do host,
e só então as fixtures reais Git/hooks sob autorização limitada existente.
Nada nesta autoria habilita Git, aplica canônicos, aprova código futuro ou
antecipa instalação/E2E OMP. Extensão OFF; unknown=false/negação terminal.
