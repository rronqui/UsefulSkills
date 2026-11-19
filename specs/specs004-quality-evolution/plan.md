# Plan: specs004-quality-evolution

> Spec: [spec.md](spec.md) · Revisão: 0.3r7 — rascunho da fronteira Windows · Estado: In Review · 2026-11-09

## Arquitetura e responsabilidades

Preservar composição atual: skills orientam o chamador; OMP executa agentes
nomeados por task/yield. Ship conduz entrega, alignment fecha objetivo/aceites,
TDD conduz implementação, bug-diagnosis cuida de reprodução/regressão e
deep-review conduz revisão de entrega. Release-bootstrap prepara CI/proteções;
conflict-resolution resolve intenção dos dois lados; retro aprende após entrega.
Não criar scheduler, daemon, launcher global ou transporte substituto.

São sete skills originais e nove perfis a preservar; completar architecture,
retro e secure-linux-web-hosting e os três papéis finos justificados pela emenda:
requirements-reader, architect e host-operator. Dez skills/doze perfis é o
inventário do desenho, não um teto de paralelismo ou chamada obrigatória. Leitura
simples usa caller/referência; não criar um papel por capacidade. A matriz
canônica da spec conserva 42 CAP/18 fontes e a profundidade de cada referência.
A aprovação prévia dos papéis e APIs não afetados conserva seus snapshots/hashes;
crítica atual cobre o delta de reconciliação, sem reabrir ou autoaprovar o restante.

Spec-kit-author é único escritor dos quatro docs canônicos e dos docs funcionais
atribuídos. Test-author escreve RED; desenvolvedores/refactorer escrevem produção
atribuída; integrator consolida a onda; revisores não corrigem o conteúdo que
avaliam; validator executa/confronta provas. Coordenador é único dono do estado.
Papéis adicionais não tomam coordenação; host só atua com alvo/efeitos autorizados
em pedido próprio, sem host nesta demanda. Security-reviewer builtin é parecer
auxiliar condicional sem copiar perfil/mudar modelo; segurança obrigatória usa
os revisores, referências e gate security existentes.

Ship passa delivery: external ao TDD e mantém entrega/triagem retro. Standalone
usa dono chamador/TDD e rota local sem exigir Git. Uma entrega tem uma triagem,
com opt-out e gatilhos preservados; propostas não são autoimplementadas.

## Fronteiras preservadas

Preservar captureInventory, qualityContextDigest, validateQuality/CLI capture/check,
validateShipQuality, validateProgress, migrateProgress, canPromoteWave,
aggregateReview e aggregateReviewInstances, execution/schema1, progress2.3,
TEST_REF, triageRetro/validateRetro e CLI/transação do instalador. O contrato
único especifica assinaturas/dados/erros; não copiar APIs de outro host.

1. Capturar baseline verificável, critérios tipados, risco, ambiente e instruções.
2. Receipts JSON auxiliares vinculam revisão/contexto e fonte original hashada;
   não reescrever saídas nativas para simular compatibilidade.
3. Delivery recebe expectedContextDigest atual de fonte independente do report;
   igualdade autocertificada e timestamp não aprovam conteúdo.
4. Mudança de conteúdo/critério/risco/identidade/ambiente invalida só provas
   dependentes; conservar história e reaproveitar evidência equivalente válida.
5. Estado2.3, canPromoteWave e gates atuais mantêm promoção; execution apenas
   valida DAG/recursos/completude, sem despachar ou atualizar progress.

## Seleção de modelos pelo mecanismo atual

O mapa único completo está em [Modelos nos perfis](contracts/interface-contract.md#modelos-nos-perfis-dos-agentes-específicos).
Editar somente model/thinkingLevel dos perfis geridos na implementação posterior,
com principal/fallback concretos OpenAI para os nove originais e três adicionais.
Substituir @slow em cada perfil; não mudar o alias global. Catálogo capturado
18.18.2 apoia os candidatos propostos, mas deve ser revalidado na fase nativa.
Não configurar caller/sessão principal, títulos/rótulos, scout, advisor, prewalk
ou demais helpers. Não exigir per-call model, launcher, extensão, policy global,
SDK ou Bun para o padrão do pacote. Preservar auxiliares atuais sem os desligar.

Requested, resolved e observed ficam distintos. Perfil/hash e catálogo não provam
modelo executado; actual ausente permanece null/unverified. Fallback nativo do
perfil mantém semântica OMP. Recuperação técnica TDD exige FAIL terminal elegível,
novo job/instância e mesma tarefa/run/histórico/cap3; infraestrutura não autoriza
escalada. Não implantar override global ou wire novo como atalho.

## Execução, dependências e paralelismo

| Tarefa canônica | Escopo | AC | Dependências |
|---|---|---|---|
| T-001 | Reconciliar contratos, contexto confiável, capacidades/papéis e interfaces atuais OMP | AC-001, AC-003–005, AC-010, AC-012, AC-015, AC-016 | — |
| T-002 | Preservar RED herdado; corrigir quality/ship, receipts/contexto esperado e confinamento/P1/P2 | AC-002–005 | T-001 e contrato liberado |
| T-003 | Evoluir estado2.3, DAG/recursos/completude/retomada e consumidores de review sem novo motor | AC-006–008, AC-011 | T-002 |
| T-004 | Atualizar sete entrypoints/nove agentes e completar architecture/host e referências das18fontes | AC-001, AC-003, AC-007, AC-010, AC-015, AC-016 | T-003 e emenda de papéis revisada |
| T-005 | Integrar, revisar nos eixos técnico/requisitos/segurança e validar conjunto local | AC-002–008, AC-010–013, AC-015, AC-016 | T-002, T-003, T-004, T-006, T-007 |
| T-006 | Completar retro puro, triagem/optout e análise sem reabrir delivery | AC-009 | T-004 |
| T-007 | Fechar paridade: política/modelos, instalador preservador, docs/licenças e42linhas | AC-001, AC-003, AC-010, AC-012, AC-013, AC-015, AC-016 | T-006 |

Os IDs T-001–007 não são substituídos. O plano operacional vigente projeta T-007
em subfrentes reconciliadas de perfis/modelos, instalador e docs, após revisão do
contrato atual, e T-005 em
`T-005-integration` → revisões independentes `T-005-tech`,
`T-005-requirements`, `T-005-security` → `T-005-close`. São atribuições
operacionais ligadas à tarefa canônica, não outra fila ou identidade para apagar
tentativas. O coordenador reconcilia projeção, recursos e provas antes de despacho.

Na projeção para progress schema2.3, cada filho recebe um único AC; isso respeita
a restrição do motor para critérios normativos, sem alterá-lo por conveniência.
Os sete IDs continuam pais canônicos no mapa auxiliar, fora do schema fechado.
Contribuições documentais a outros critérios ficam na rastreabilidade, não em
aceites normativos misturados. O mapa auxiliar não é scheduler nem prova de fase.
AC-014 e conclusão final de AC-016 conservam os gates posteriores aplicáveis.

As dependências acima são a hierarquia canônica histórica. A projeção operacional
vigente libera frentes independentes após seus contratos reais; não herdar uma
cadeia artificial dos pais. Uma atribuição não comprova execução. Antes de retomar,
conferir dono, recurso, job real e evidência atual no plano/checkpoint existentes.
Recursos incluem aliases/case/pai-filho, caches, temporários, saídas e instalação.
Maximizar paralelismo útil sem teto arbitrário, respeitando limites observados;
sem isolamento real, serializar escritores conflitantes e seguir independentes.
Batch nativo somente quando habilitado; caso contrário flat. Não inventar campos.

## Validação e provas

Node>=20 e Vitest existentes validam comportamento mecânico. RED deve falhar por
asserção significativa, preservando nomes/provas; import quebrado não é RED.
Critérios normativos têm tipo explícito e conferência semântica, sem RED artificial.

| Fronteira | Prova necessária |
|---|---|
| Qualidade/ship | Regressões e negativas de contexto esperado, receipt/source, inventário e caminhos; comandos/códigos de saída e revisão atuais |
| Estado/execution/review | Migração2.3, DAG/recursos/completude, TEST_REF, canPromoteWave e agregação legada/instâncias com identidade/revisão |
| Instruções e referências | Leitura e simulações de gatilho positivo/negativo, fonte/dono únicos, cobertura42/18, origem/licença, documentação semântica atual |
| Modelos/perfis OMP | Mapa completo, catálogo/resolução/precedência e NATIVE-01–10 do contrato; frontmatter não é inferência executada |
| Instalador | CLI existente em staging, inventário10/12, ownership7/9, hashes/preflight/backup/CAS/rollback seletivo sem overwrite alheio |
| Segurança | Seis controles SR-001–006: requirements/security_tests/secrets/dependencies/threat_model/security_review; indisponibilidade não é NA/PASS |
| Integração | Diff total desde origem manual e delta atual, APIs preservadas, docs atuais e matriz de evidência por CAP/AC/WF |

Correções pontuais do relatório atual: branch/base usa revision=head_revision;
batch obrigatório vira condicional; PR recebe conteúdo integral no mesmo SHA;
peer-review TDD textual e fallback yield conservam seus protocolos distintos;
documentação pré-OK não autoriza implementação; COVERED não basta para DONE.
NATIVE-05 descreve exatamente a prova pendente do frontmatter output versus
resposta textual TDD. Não alegar runtimeapproval nem inventar envelope alternativo.

## Revisão final, instalação e entrega posteriores

Integração interna TDD e revisões técnicas/requisitos/segurança atuais precedem
revisão final independente do workflow. Só então instalar o pacote autorizado e
avaliar todo o pacote instalado no OMP atualizado, com --check e nova sessão.
Preflight total, backup/staging/hash e CAS na escrita/rollback preservam foreign
e edições concorrentes. Instalar skill não executa host/publicação.

AC-014 exige short/full/local/external sem publicação, retomada/falha, DOC/review/
gates, retro/opt-out, referências e task/yield/batch-ou-flat/async/isolamento
conforme suporte. Relatar versão, configuração, jobs/retornos e modelos dos perfis
efetivamente observados. Unidade, leitura e staging não substituem E2E instalado.
Entrega local inclui cobertura/limites/riscos; triagem retro da demanda vem depois.

## Migração, achados e riscos

Os quatro bytes0.3r4 são arquivados antes desta revisão em
implementation-evidence/T-007-native-contract/agent-pattern/before do run.
Tentativa3 mantém identidade/contador e todas as falhas/provas anteriores.
NATIVE-CONTRACT-IR-001/002 P1 ficam contra proposta universal superada, sem
fechamento por código ou autoaprovação. MODELS-IR-001/002 P2 e protótipo não
integrado/172GREEN/10TODO continuam históricos, sem integração disfarçada.
Schemas/exports models e launcher/audit/config/SDK da proposta não lançada são
superados; não constituem API lançada a preservar ou novo pré-requisito.

| Risco | Controle |
|---|---|
| Conteúdo/review autocertificado | Fonte de contexto independente, retorno bruto, hashes e crítica independente |
| Perfil sombreado/candidato não resolvido | Prova nativa de discovery/precedência por perfil e catálogo atual; bloquear só a rota afetada |
| Saída peer-review incompatível | NATIVE-05 com perfil real e resultados brutos antes de alegar compatibilidade |
| Perda em migração/instalação | Preservar baseline90/origem manual71/HEAD, APIs e capacidades; CAS/backup/rollback seletivo |
| Instrução rasa ou responsabilidade duplicada | Matriz42/18, referências por dono atual e revisão semântica independente |

## Pendências e limites desta etapa

Quatro docs reconciliados ficam In Review. Autoria não libera dependentes nem
aprova produto. Coordenador recolhe os resultados reais, faz crítica independente
dos hashes atuais e segue frentes liberadas. Não pedir aprovação de escopo já
esclarecido pelo proprietário. Não executar nesta etapa código/testes de produto,
OMP/LLM, instalação, Git/rede/publicação, perfis/config global, OpenBot ou rotinas.


## Emenda 0.3r7 — plano da fronteira Git Windows revista

T-010-contract-draft prepara cinco rascunhos sobre a base0.3r6, sob a decisão
direta do proprietário “prossiga com a recomendação” de 2026-11-09. Crítica
independente atual precede qualquer integração; autoria não aprova implementação.
O contrato único detalha extensão e gates; design/test-plan do candidato são
evidências explicativas, não uma segunda API ou motor.

Arquitetura candidata: factory autocontida em scripts/lib/git-trust-source.mjs,
consumida pelo instalador e materializada deterministicamente por
scripts/generate-git-trust.mjs em região de scripts/hooks/pre-push.mjs. O original
já contém bytes derivados, continua copiável sozinho; quatro geridos mantidos.
O gerador --check compara derivação sem executar hook/Git e não escreve.
Não duplicar policy manualmente, introduzir import relativo no sidecar ou
adicionar quinto arquivo no hooksDir. Alternativa estrutural precisa da mesma
prova de fonte única/compatibilidade e revisão antes de implementação.

Bridge OS metadata-only pode preceder Git apenas após bootstrap revisado,
ancorado em metadados confiáveis do runtime fornecidos pelo OS, nunca em
PATH/env/report ou candidato que se autentica. Windows/kernel/admin/Node e
bytes revisados já são TCB; o novo escopo confia também no contexto normal de
resolução de nomes/carga fornecido pelo OS ao chamador e exclui adversário
capaz de alterar esse contexto. A exclusão não torna repo/PATH/env/reports ou
arquivos confiáveis. Não exigir atestado do OS do zero ou auditoria universal.
Node20/PowerShell5.1/CLR por si só não comprovam a âncora. Provar identidade64/128,
ACL de arquivos/aliases/ancestrais, origem e carga pertinente permanece obrigatório.
A rota candidata é pathname protegido e spawn Node shell:false dentro de contexto
privado por invocação; não requer broker/lease nem prova de imutabilidade do
namespace fora da fronteira revista. Re-stat isolado não prova proteção de arquivo.
Indeterminação mantém extensão OFF; assinatura do wrapper não cobre filhos.

Usar onda1 existente, após coordenador projetar AC-017/018 e filho normativo
AC-019 no schema2.3 sem campos novos. T-001–007 e ondas2/3 permanecem. O
coordenador admite tarefas/locks antes de despacho; nenhum novo scheduler.
Papéis e ordem: spec-kit-author integra docs aprovados; test-author faz RED
sem Git; developer/refactorer GREEN isolado; peer/security revisa guard/provas;
validator libera e coleta fixtures reais somente depois; integrator consolida
T-005 com revisões finais/nativas posteriores. Infraestrutura não escala modelo.

Locks futuros exatos: quatro canônicos; scripts/install-hooks.mjs;
scripts/hooks/pre-push.mjs; scripts/lib/git-trust-source.mjs;
scripts/generate-git-trust.mjs; scripts/git-trust.test.mjs;
scripts/git-trust-generation.test.mjs; scripts/install-hooks.test.mjs;
scripts/pre-push-default.test.mjs; documentação funcional pertinente e subárvores
scratch/cache/fixture atribuídas. A cadeia installer/pre-push e a rota ship
existente são o escopo inteiro; não há segundo orquestrador ou CLI adicional.
Serviço/broker/SDK não são adotados nem pré-requisitos obrigatórios. Não há
autorização implícita de artefato ou processo adicional.
Uma fonte derivada e gerador têm o mesmo escritor de produção; test-author só
escreve testes. Revisores não corrigem os próprios objetos de revisão.

Não reexecutar verificações pesadas a cada chamada Git sem medir. Candidato usa
um contexto privado por invocação e proteção de arquivo/aliases por ACL provada
sob a nova TCB; cache persistente de confiança não é admitido. Antes de habilitar, medir cold/warm/p50/p95/startup/timeout/cleanup e
definir orçamento testável. Sem prova, custo/desempenho são desconhecidos.
Reversão mantém/restaura guard aprovado e derivados coerentes, sem modificar
Git global/LFS/links/PATH nem apagar falhas. Revisão atual só vale aos hashes
atuais; não transfere aprovação dos docs0.3r5/0.3r6 ao rascunho0.3r7.


A redução explícita da garantia adicional substitui apenas a exigência anterior
de contexto de TD-001/NDR-001; não corrige vulnerabilidade nem dispensa riscos.
Proposta nativa estrita permanece não adotada/NO_GO; serviço NDR-002 não adotado,
transporte NDR-003 não usado, sem fechamento técnico fictício. Preservar
keep_current_guarantee histórico, falhas/RED/probes anteriores e review3/3.
T-010 usa tarefas do motor existente, máximo3 em cada nova tarefa, sem reset.
Invalidar provas dependentes da fronteira antiga e revisar independentemente os
cinco hashes atuais antes de aplicação canônica; depois manter RED→GREEN→review
independente de guard/host→fixtures Git/hooks→integração. Mudanças posteriores
invalidam provas afetadas. Nenhuma revisão documental autoriza Git, instalação
ou produto. Negação é terminal: não buscar outra cópia/PATH/shell como fallback.
Preservar usuário/token/sessão/perfil/credenciais/cwd/ambiente/stdio/argv/status
originais, quatro hooks, standalone, worktree/LFS/POSIX, legado nlink1 e modelos
OpenAI somente nos perfis OMP específicos; a fronteira não remove capacidades.
