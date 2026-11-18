# Funcionalidades e uso do UsefulSkills

Este documento é a referência funcional atual do pacote. As specs registram
mudanças delimitadas e os relatórios comprovam execuções; nenhum desses artefatos
substitui esta descrição durável. A política normativa compartilhada está em
[quality-policy.md](../tdd-orchestrator/references/quality-policy.md).

**Autoridade:** fase, autorização, revisão, gates e release vêm de
`.omp/state/tdd/progress.json` e do receipt corrente. Este guia descreve
comportamento durável; receipts privados e URIs `local://` são proveniência,
não distribuição ou fixture Native.

## Catálogo

| ID | Capacidade | Responsável | Uso e estado |
|---|---|---|---|
| F-ALIGN | Alinhar objetivo, decisões e critérios | alignment | Disponível; checkpoint durável antes do roteamento |
| F-TDD | Implementar backlog com testes antes do código | tdd-orchestrator | Disponível; RED/GREEN/refactor, review, DOC, validação e integração |
| F-QUALITY | Conferir mudança, documentação e segurança | política + quality.mjs | Gate compartilhado de planejamento e entrega |
| F-REVIEW | Revisar código, requisitos, documentação e segurança | deep-review | Disponível; revisão independente com fonte/revisão fixadas |
| F-BUG | Diagnosticar e corrigir defeito reproduzível | bug-diagnosis | Disponível; loop de reprodução e regressão |
| F-CONFLICT | Resolver conflito pela intenção dos lados | conflict-resolution | Disponível; checks e revisão do snapshot resolvido |
| F-BOOT | Preparar CI, versionamento e controles | release-bootstrap | Disponível; somente efeitos autorizados |
| F-SHIP | Planejar sem efeitos e operar entrega, release e deploy | ship | Disponível; plano readonly, implementação roteada, gate e publicação separados |
| F-RETRO | Aprender com entrega, falhas e retrabalho | retro | Fonte integrada; triagem desta demanda aguarda entrega revalidada |
| F-ARCH | Analisar arquitetura e contratos | architecture | Fonte integrada; architect condicional no desenho e planejamento TDD |
| F-HOST | Operar hospedagem Linux | secure-linux-web-hosting | Fonte integrada; host-operator exige alvo e efeitos autorizados |

O pacote integra dez skills e doze perfis geridos, preservando os sete
entrypoints/nove agentes originais. O gate compartilhado valida contratos; as
skills instruem o caller e delegam por task/yield nativos. Requirements-reader
ajuda alignment na compreensão independente; architect atende architecture e
o hook de planejamento TDD; host-operator atende operação Linux autorizada.
Não há chamada obrigatória de todos os papéis nem agente por especialidade.
A [matriz de capacidades](capability-matrix.md) cobre 42 CAP/18 fontes e distingue
fonte, testes, staging e execução nativa ainda pendente.

## Fluxos e regras

O [roteamento e persistência](../alignment/references/routing-and-persistence.md)
é a fonte de short/full e entrega local sem inicializar Git; ship conserva a
entrega Git. Uma demanda passa pelo alignment. Mudança totalmente especificada recebe
fechamento explícito sem perguntas artificiais. O chamador identifica alterações,
dados, exposição, risco e documentos antes da implementação. Captura uma baseline
verificável; inventário criado depois da alteração não comprova o estado anterior.

Arquitetura pertinente usa [architecture](../architecture/SKILL.md), sem abrir
outra coordenação. No caminho comportamental, TDD divide tarefas e locks, prepara Spec Kit e passa
por RED antes de GREEN. No caminho de bug, o diagnóstico mantém o próprio loop,
sem um segundo ciclo concorrente. Documentação funcional acompanha a mudança no
DOC ou no passo documental do caminho escolhido. Revisores conferem significado
e correspondência entre documentação, código e testes; validator confirma provas
e comandos. Integração exige nova prova sobre o conjunto resultante quando o
conteúdo ou contexto muda.

Toda adição, alteração e remoção relevante recebe classificação funcional ou
`none`, com motivo. Mudanças funcionais vinculam funcionalidades, critérios,
testes/provas e documentos. Catálogo, especificação, guia e histórico podem
compartilhar este arquivo: os papéis são obrigatórios, a multiplicação de arquivos
não é. Links do README conduzem à documentação atual.

Segurança inclui risco justificado e verificações aplicáveis de segredos,
dependências e ameaças. NA descreve inaplicabilidade ao escopo, sem usar falta de
ferramenta como dispensa. Revisão independente identifica autor, revisor e
conteúdo avaliado. P0/P1 válidos abertos bloqueiam liberação; apontamentos menores
continuam visíveis. A promoção interna TDD também respeita o contrato próprio de
onda, que pode exigir resolução de todos os achados antes da promoção.

## Permissões, exceções e recuperação

Papéis de escrita são separados: test-author escreve testes; desenvolvedores e
refactorer escrevem produção no lock; spec-kit-author escreve Spec Kit e documentos
funcionais explicitamente atribuídos; orquestrador consolida controles; revisores
não editam o material avaliado. Uma skill não concede autorização adicional para
publicação, instalação, commit, dados sensíveis ou deploy.

AC exclusivamente normativo tem classificação explícita e conferência documental
independente, usando o objeto NA previsto no estado. Não exige teste runtime
artificial. AC comportamental continua exigindo teste com asserção significativa.
Uma ferramenta opcional ausente pode reduzir conveniência; uma prova obrigatória
ausente bloqueia o gate e deve ter causa e próxima ação registradas.

O schema TDD atual é 2.3. Entradas 2.1/2.2 passam por migração explícita, preservam
evidências válidas e reabrem apenas etapas sem prova suficiente. O estado é
confrontado com Git e conteúdo real antes da retomada; status e timestamp
isolados não provam execução. O [contrato de execução e retomada](../tdd-orchestrator/references/execution-and-resume.md)
vincula DAG, recursos, tentativas e retornos atuais; o [handoff](../tdd-orchestrator/references/handoff.md)
registra dono, estado, próxima ação e retomada. Slots, modelos e isolamento são observados no OMP;
sem isolamento real, escritores com escopos sobrepostos são serializados.

### Entrega async e terminal `wait`

O fluxo durável preserva três superfícies de retorno distintas: inline
`AgentToolResult.details.results` (`SingleResult`), custom
`message_end`/`async-result` (`source_kind: "task_async_result"` privado) e o
terminal documentado do Root `wait` em
`tool_execution_end.result.details.jobs[]` (`source_kind: "task_wait_result"`
privado). O último conserva o snapshot SDK bruto, sem convertê-lo em mensagem
custom ou `SingleResult`; sua lista fechada de campos está no
[contrato Spec005](../specs/specs005-omp-compatible-release/contracts/interface-contract.md).

Para admitir o wait, o consumidor correlaciona Root TASK e Root wait
START/END, o `tool_call_id` próprio do wait, `isError:false` observado, sessão,
parent call, índice, papel, `agentSource`, assignment e ownership. O registro
mantém `id`/`allocated_id` da criança alocada e `jobId` do `job.id` SDK,
distintos. `agentUrlId` pode ser apenas hint de navegação/fallback do job ID;
não substitui o tuple Root. `structured.source` é proveniência do schema, não
`agentSource:project`.

Somente job `completed` com structured/schema válido e payload apropriado pode
contribuir para completion; `wait.isError:false` indica apenas sucesso do
transporte. Falha, cancelamento, status/payload ausente, schema inválido,
ownership errado/stale, texto sem estrutura ou dado isolado bloqueiam. Campos
do filho não expostos permanecem `null`/não observados; `exitCode` só é
preservado quando numérico e não zero nunca é sucesso. Progress, lifecycle,
`extractedToolData`, stdout/prosa, settlement, quiescência, UPDATE e yield não
sintetizam task records. Custom/wait equivalentes deduplicam uma vez; conflito,
duplicata ou limite de quantidade/16 MiB bloqueia. Isto é uma extensão privada
de evidência aprovada no receipt
`.omp/state/release-47/proofs/contract-0-6-native-wait-user-approval.json`,
não uma nova API, argumento quality/CLI, perfil, override ou requisito de
`get_messages`; Native/E2E/QA/CI/release continuam pendentes.

### Prova privada do backend NATIVE-09 — aditamento 0.7.0

O fluxo funcional preserva a evidência tipada
`source_kind: "native09-backend-repair-write"` somente no ledger privado. A
admissão exige job aprovado pelo Root com `status:"completed"`, criança opaca
vinculada por tuple Root completo e único, um único `write END` aprovado com
`isError:false` explícito no path exato, `actual` com mudança real do sujeito e
dependências protegidas com bytes/hashes e identidade inalterados. Identidade,
path e correlação continuam Root-bound; flags child não expostas ficam
unknown/null e não são inferidas.

A coleção pode reunir dispatch de peer independente e segundo validator, mas
isso não aprova semanticamente o reparo nem fecha Native. `Task framework
completed` não é `validator semantic PASS`; o primeiro `FALHOU` é legítimo
quando correlacionado a CLI real com código não zero, e o raw permanece
preservado. Semantic repair approval exige peer independente e segundo
validator com `PASSOU` real, além dos gates atuais.

Perfis existentes `structured:true` continuam exigindo schema válido. A única
exceção é a prova do perfil `backend-developer` para NATIVE-09, sem aceitação
geral de perfil indisponível. Regras de `validator` e `spec-kit-author` permanecem
inalteradas; apenas relatório negativo do validator, mesmo em tarefa
`completed`, não passa testes. Não há SDK/wire/API/settings/model/flag/CLI
públicos novos, nem mudança de perfis.

## Guia de uso

Após entrega concluída, ship ou TDD standalone aplica a
[retrospectiva](../retro/SKILL.md). TDD com entrega externa transfere a triagem ao
ship, sem repetir. A decisão depende de entrega revalidada e provas atuais;
gatilhos e opt-out estão no [protocolo único](../retro/references/protocol.md).
Decisão incompleta não significa retro dispensada. Análise pode terminar sem
propostas ou com até três propostas verificáveis; implementá-las exige demanda
separada e não reabre automaticamente a entrega.

1. Instale conforme o [README](../README.md) e reinicie a sessão OMP para a
   descoberta. A evolução local ainda precisa ser instalada para afetar o perfil.
2. Invoque a skill do tipo de trabalho: ship para entrega, TDD para backlog,
   bug-diagnosis para defeitos, deep-review para revisão, conflict-resolution para
   conflito e release-bootstrap para preparação de releases.
3. Confira a política compartilhada, baseline, risco, critérios e plano. O
   planejamento não exige antecipar uma revisão final de conteúdo ainda não escrito.
4. Atualize documentos no mesmo conjunto da implementação. Entregue ao revisor o
   escopo e a revisão exata, critérios, testes e relatório, sem ditar seu veredito.
5. Execute o gate `delivery` sobre o inventário atual antes da publicação. Uma
   alteração posterior exige revalidação das provas afetadas. Só use evidência
   anterior quando conteúdo, critérios, ambiente e independência corresponderem.

API/CLI e formatos definitivos ficam no
[contrato de qualidade](../specs/specs004-quality-evolution/contracts/interface-contract.md).

### Plano externo somente leitura

`node ship/bin/ship.mjs plan --target main` valida qualidade/contexto obrigatórios
e funciona fora de Git; `--root` seleciona o workspace. A saída `PLANNED` descreve
passos `NOT_EXECUTED`, não branch/default remoto resolvido ou prontidão de release.
Nenhum Git/GitHub, subprocesso, acesso de rede, escrita, publicação ou deploy é
executado. Flags/defaults estão na [fonte Ship](../ship/SKILL.md#subcomandos-do-motor);
a API está no [contrato ativo](../specs/specs005-omp-compatible-release/contracts/interface-contract.md).


### Seleção Git Windows e bloqueio

A seleção protegida está implementada e revisada no checkout, com provas
componentes Windows; instalação e aprovação final do pacote são gates separados.
O escopo é Git for Windows **2.54.0.windows.1 x64**. Somente o executável
originalmente selecionado em `cmd/git.exe` ou `mingw64/bin/git.exe` pode ser
admitido; ambos exigem identidade, assinatura, hashes, linksets, ACLs,
ancestrais e dependências aprovados. `nlink=2` ou um alias LFS não autoriza Git.

A premissa `explicit_os_host_tcb` permite o host exato PowerShell 5.1/System32
derivado de módulos OS carregados, com ambiente/cwd protegidos, para o bootstrap
filesystem autorizado. Não prova ACL/assinatura independente antes de executá-lo
nem admite Git por herança. Metadados, executável selecionado e fechamento de
carga Git continuam sob política própria fail-closed. A exceção de criação de
subdiretório na raiz `C:\\` é restrita ao trustee AU, não a qualquer identidade.
Os detalhes têm fonte no
[contrato ativo Windows](../specs/specs005-omp-compatible-release/contracts/interface-contract.md).

Falha ou informação material desconhecida nega antes de executar Git. O usuário
recebe a recusa `E_UNSAFE_GIT_EXECUTABLE` no instalador/hook, e a operação
dependente fica bloqueada. A seleção termina sem fallback automático para outra
cópia de Git, PATH ou shell. Preserve o diagnóstico e registre a prova ausente
para o responsável pela validação; retome somente após correção e revisão da
causa. Não altere PATH, hardlinks ou Git global para contornar a recusa.

O comportamento exigido preserva quatro hooks geridos, original e cópia
standalone, linked worktree, LFS, CLI, argumentos, entrada/saídas e status,
usuário/token/sessão/perfil/credenciais, cwd, ambiente e TTY. Fontes, destinos e
markers mantêm a regra legada `nlink=1`; as demais rotas e seus limites continuam.
Não há serviço, SDK, instalação de OS ou alteração global adicional. O pacote
exige Node >=20. O preflight de 2026-11-09 registrou Node externo 22.23.2 e
CLI OMP 18.18.3; o runtime interno do OMP não foi inspecionado. A versão do
produto OMP não determina a versão de Node. Modelos OpenAI dos perfis OMP
específicos continuam sob a política
existente, com `actual:null`/`unverified` sem observação real.

## Referências seletivas e atribuição

As 18 fontes estão na [matriz](capability-matrix.md). Referências de domínio,
frontend, acessibilidade, segurança, React/Next, PostgreSQL, AST e escrita para
agentes são consultadas sob gatilhos próprios. Confirme stack/versão/alvo antes
de aplicar recomendações; presença do material não comprova aplicação ou
certificação de todas as stacks. Frontend preserva design system e requer render;
a11y inclui verificação manual pertinente; PostgreSQL não se aplica a SQLite.
Segurança de aplicação e dados atravessa plataformas nos gates existentes; o
operador Linux cuida do host. SOURCE.md e licenças preservam proveniência por dono.

## Histórico funcional

| Mudança | Efeito |
|---|---|
| Higiene de distribuição | Exclui `.workflow-runs/` e `.test-temp/` de novas inclusões automáticas pelo Git e do pacote npm; preserva arquivos locais e conteúdo do produto. Não promove provas isoladas a regressões integradas nem altera os gates pendentes. |
| Base 0.4.0 | Sete skills e nove agentes para OMP, entrega com revisão e TDD |
| specs004-quality-evolution | Política única; baseline e classificação de delta; documentação funcional durável e revisão semântica; segurança proporcional; gate revision-bound; recuperação 2.3 |
| Ampliação de paridade specs004 | Dez skills/doze perfis integrados, 42 capacidades/18 fontes; instalação CLI e --check em HOME isolado, avaliação OMP instalada pendente |
| Reconciliação 0.3r5 | Perfis nomeados com modelos OpenAI concretos, task/yield nativos e três papéis condicionais; proposta universal anterior superada, sem alegação de correção de código |
| Fronteira Windows 0.3r7, implementação pendente | Contexto normal OS incluído na confiança por decisão direta; extensão exata Git x64 de dois aliases continua desligada até provas e revisão, preservando controles de arquivo/carga e as funções anteriores |
| Plano readonly Spec005 | `ship plan` valida provas atuais fora de Git e descreve a entrega externa sem efeitos; não substitui gates/publicação nem aprovação terminal |

## Limites de garantia

Hashes vinculam provas ao conteúdo; não demonstram que o texto está correto ou
que o software é livre de vulnerabilidades. Isso requer revisão e verificações
pertinentes. Edições e publicações fora do fluxo podem ignorar gates locais;
enforcement no servidor só existe após configuração e teste de CI correspondentes.
Testes locais e revisão de protocolo não equivalem a um piloto OMP real nem a
ganhos de tempo/custo medidos.

## Histórico verificável

A integração histórica Spec004 preservou baseline de 90 caminhos e origem manual de 71;
inventário posterior não substitui essas origens. A integração registrou 134
caminhos (32 atualizados, 99 novos, três idênticos, zero removidos), antes desta
atualização documental. A preservação das quatro specs 0.3r5 foi fato daquela
etapa; a emenda Windows 0.3r7 é escopo posterior e não reescreve esse histórico.
Foram observados 686 PASS/10 skips de plataforma na suíte de integração, 94 PASS
de roteamento e 14 PASS dos perfis em Node; não são piloto OMP. A CLI completa
em HOME isolado e --check terminaram 0: 136 destinos, incluindo 123 arquivos nas
skills, 12 cópias de perfis e NOTICE; 53 referências, 26 licenças e 11 arquivos de
código. Os 33 arquivos existentes no escopo gerido do perfil real ficaram intactos.

Nessa etapa, o audit npm encontrou zero advisories dentro da cobertura medida;
os seis controles de segurança e a admissão Git ainda estavam pendentes.
Os onze positivos dependentes de Git que falharam não viram PASS retroativo
ou NA. A evolução posterior tem código, revisão e provas próprios; esses
resultados antigos não representam a suíte ou os gates atuais.

Achados NATIVE-CONTRACT-IR-001/002 P1 pertencem à proposta universal superada:
“superseded proposal; not code-fixed; not independently closed”. MODELS-IR-001/002
P2 e 172 GREEN/10 TODO são histórico do protótipo não integrado. Não demonstram
configuração atual nem encerramento independente. Naquele relato não havia
medição de ganho global ou garantia de compatibilidade prática integral.

TD-001/NDR-001 preservam a falha histórica de prova e a decisão de contexto
daquela etapa, sem encerramento independente por associação. A proposta nativa
estrita permaneceu não adotada/NO_GO; NDR-002 serviço não foi adotado e o
transporte NDR-003 não é usado. `keep_current_guarantee` e suas provas permanecem
históricos. Ataques atuais a arquivo/aliases/ACL/carga continuam bloqueantes.

## Estado live Spec005

O estado de fase, autorização, revisão, gates e release é lido exclusivamente
de `.omp/state/tdd/progress.json` e do receipt corrente. Este guia não duplica
contagens, tentativas, budgets ou hashes de candidato. Capturas Native,
diagnósticos source-only, reviews e ledgers anteriores à mudança pública da
fonte são históricos e escopados; mudança de fonte/contexto/ambiente reabre
provas dependentes.

O plano `ship` permanece somente leitura: valida quality/context reais e emite
`PLANNED` com steps `NOT_EXECUTED`; não é readiness, remoto, publicação ou
release. T-013A prepara o artefato de prontidão pré-publicação; T-013B Ship
externo consome esse artefato e gates reais. CI, merge e evidência terminal
fecham AC-001; `RELEASE_CONFIRMED` não é inferido do plano.

Serving físico e fallback de provider são `NOT OBSERVED` até prova específica,
sem trocar os doze perfis. Retry técnico, fallback de capacidade e fallback de
provider permanecem classes separadas. A rota e as capturas não são prova
global de AC-019 ou AC-021.

O aditamento 0.7.0 não altera contadores nem reclassifica falhas Native:
ambos permanecem históricos, não estado live. As tabelas de tarefas preservam
os rótulos iniciais `PENDING`, e a ordem de prontidão pré-publicação, CI e
release já definida (T-013A → T-013B e gates reais) é mantida.

### Seis controles de segurança — AC-019

Os seis controles abaixo permanecem requisitos e limites fail-closed. Assemblies
retidas são classificadas como `SCOPED_HISTORICAL`/proveniência, não PASS global;
o fechamento atual vem do receipt live. Links `.omp/state/` e `local://` são
privados, não artefatos distribuídos nem fixtures Native.

| Controle | Classificação durável | Evidência/limite |
|---|---|---|
| `requirements` | `SCOPED_HISTORICAL` | Contrato vincula AC-019 aos 33 AUD, quatro W e seis R; nenhum requisito é dispensado e cobertura declarada não substitui execução Native/revisão independente. |
| `security_tests` | `SCOPED_HISTORICAL` | Ledger público versionado deve declarar escopo/revisão/resultados; capturas antigas não são suíte final nem prova E2E/Native. |
| `secrets` | `SCOPED_HISTORICAL` | Inventários explícitos separam fixtures de chaves, excluem `.omp`, `.git`, auth e `.env` quando aplicável; não certificam segredos privados ou publicação final. |
| `dependencies` | `SCOPED_HISTORICAL` | Auditoria/lock retidos têm escopo declarado e não são auditoria nova nem garantia universal; mudanças reabrem o controle. |
| `threat_model` | `SCOPED_HISTORICAL` | TCB Windows/PowerShell e Linux/Python3 `-I/-S` permanecem separados; staging Linux anônimo/FD-bound e no-replace têm alcance delimitado, sem garantia macOS, corridas universais ou DB/WAL. |
| `security_review` | `SCOPED_HISTORICAL` | Review de paths/argumentos e assemblies não amplia binding; desconhecido material, chaves/valores não retidos ou host não observado bloqueiam entrega. |

Os controles fail-closed, TCBs e níveis de evidência não autorizam waiver,
promoção de Native ou declaração legal. O diagnóstico root source-only antigo
é histórico e não é Native; desconhecido/null nunca é zero. Consulte
[omp-compatibility.md](omp-compatibility.md) para critérios, não para status
live.
