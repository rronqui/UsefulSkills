# Tasks: specs004-quality-evolution

> Deriva de [plan.md](plan.md). Revisão0.3r7 — rascunho da fronteira Windows. Estado documental: In Review.
> [P] permite paralelismo somente com dependências liberadas e recursos seguros.

## Tarefas canônicas preservadas

| ID | Escopo | AC | Dependências canônicas |
|---|---|---|---|
| T-001 | Contratos/contexto,42CAP/18fontes, análise de papéis e padrão OMP | AC-001, AC-003–005, AC-010, AC-012, AC-015, AC-016 | — |
| T-002 | Qualidade/ship, receipts/contexto confiável e confinamento | AC-002–005 | T-001 e contrato pertinente liberado |
| T-003 | Estado2.3, DAG/recursos/completude/retomada e review APIs | AC-006–008, AC-011 | T-002 |
| T-004 | Sete entrypoints/nove agentes, architecture/host e referências18fontes | AC-001, AC-003, AC-007, AC-010, AC-015, AC-016 | T-003 e papéis revisados |
| T-005 | Integração, revisão independente e validação local | AC-002–008, AC-010–013, AC-015, AC-016 | T-002, T-003, T-004, T-006, T-007 |
| T-006 | Retro de leituras declaradas e triagem pós-entrega | AC-009 | T-004 |
| T-007 | Perfis/modelos, instalador, docs/licenças e paridade completa | AC-001, AC-003, AC-010, AC-012, AC-013, AC-015, AC-016 | T-006 |

Esta tabela define pais canônicos; não reescreve o estado operacional real.
Não manter IN_PROGRESS/RUNNING antigo sem job/processo atual. O coordenador é
único escritor de progress2.3/plano operacional/checkpoint e observa dono,
tentativa, recurso e próxima ação. Filhos por AC e canonical_parent_id ficam no
mapa externo existente, sem expandir schema2.3. Critério normativo recebe um AC
por filho conforme validateCriteriaMatrix; testref planejado não é prova.

## Checklist de conclusão

- **T-001:** quatro artefatos canônicos, WF-001–013/AC tipados,42CAP/18fontes,
  fonte confiável de contexto e APIs preservadas. Reconciliação0.3r5 atual usa
  scope-addendum-agents-only e análise detalhada do projeto; crítica independente
  dos quatro hashes é necessária. Autoria não aprova o próprio desenho.
- **T-002:** preservar RED herdado e regressões atuais de risco/critérios/ambiente/
  identidade/método/source/contexto esperado e paths Windows/links/TOCTOU;
  developer implementa GREEN e consumidores sem enfraquecer testes/envelopes.
- **T-003:** preservar execution/schema1, progress2.3, TEST_REF e APIs de review;
  provar DAG/ciclo/conflitos/predecessor/retorno e prontidão independente.
  Conferir dono/job/capacidade ao retomar; não criar scheduler ou alterar estados
  por timestamp. IMPLEMENTED/VALIDATED, não COVERED sozinho, é requisito de DONE.
- **T-004:** preservar sete skills/nove perfis e completar architecture/host/retro;
  distribuir18fontes nas42CAP pelo dono existente. Requirements-reader/architect/
  host-operator têm contratos finos; caller suficiente dispensa filho. Perfil não
  é sandbox e instalar host não aciona SSH. Revisores existentes cobrem segurança;
  parecer builtin opcional conserva retorno bruto, sem modelo/yield fabricados.
- **T-006:** triageRetro/validateRetro sem escrita/comandos/rede, flags booleanas,
  entrega/provas/contexto revalidados, UNKNOWN/null e opt-out explícitos, zero a
  três propostas e dono único ship external ou chamador/TDD standalone.
- **T-007:** aplicar o mapa único de12perfis do contrato na fase autorizada:
  model/thinkingLevel e fallback concreto por papel; substituir @slow em cada
  perfil. Não configurar modelos globais/helpers ou construir launcher/extensão.
  Provar discovery/precedência, resolução e metadados disponíveis sem inventar
  actual; fallback nativo e retry técnico distintos. Instalador staging mantém
  CLI/ownership/preflight/backup/CAS/rollback e dados alheios. Docs/README/licenças
  e matriz42/18 recebem provas atuais antes da revisão final.
- **T-005:** integração → [P] revisões técnica/requisitos/segurança independentes
  → fechamento; conjunto exato de retornos sobre digest congelado, seis controles
  de segurança, APIs e gates preservados. Repetir só provas afetadas e fechar
  achados pelos ciclos próprios, sem rebaixamento ou APPROVED fabricado.

## Projeção operacional e continuidade

As dependências canônicas históricas não impedem frentes independentes com
contrato liberado: execution após contrato pertinente, referências após papéis,
qualidade/retro/instalador nos recursos atribuídos. O coordenador reconcilia o
plano ativo antes de despachar e preserva identidades/tentativas. Não usar nomes
novos para esconder retry. Maximizar paralelismo útil nos limites reais do host/
provedor, com um escritor por recurso, caches e saídas; sem isolamento real,
serializar conflitos. Batch se habilitado, flat no caso contrário, ambos nativos.

T-007-native-contract **attempt3** é esta autoria documental, explicitamente
autorizada pelo esclarecimento e Continue do proprietário. Só escreve quatro
docs e agent-pattern/evidências; arquiva antes os quatro bytes0.3r4/hashes e
mantém revisão/falhas anteriores. Não executar comportamento, teste de produto,
perfil/OMP, instalação, Git/rede/publicação, OpenBot ou rotina nesta frente.

| Próxima frente / dono | Condição de liberação e prova |
|---|---|
| Crítica do contrato / revisor independente | Quatro hashes0.3r5, escopo corrigido, APIs preservadas e protocolo NATIVE-01–10; não revisão final do workflow |
| Perfis/modelos / autor atribuído + test-author se comportamento mudar | Contrato atual revisado e recursos exclusivos; atualizar somente perfis do pacote, catálogo/mapa e consumidores pertinentes. Protótipo models não integra por herança. |
| Correções de instruções / autor atribuído | Branch/base revision=head_revision; batch/flat condicional; conteúdo remoto no SHA; aprovação documental versus implementação; DONE coerente; peer-review normal versus fallback sem confundir agregadores |
| Provas nativas / caller + validator | NATIVE-01–10 do contrato, com saídas brutas/job/revisão e observação real; somente fase autorizada. NATIVE-05 precisa testar output estruturado versus APROVADO/BLOQUEADO antes de afirmar compatibilidade. |
| Instalador / autor isolado + revisão independente | Transação da CLI existente, testes em staging e confirmação de conflito/identidade/CAS; não destino real antes da revisão final |
| Docs e integração / spec-kit-author + integrator | Resultados reais das frentes consumidas, matriz42/18 completa e docs funcionais atuais; revisão independente após qualquer delta relevante |

## História preservada e gates restantes

NATIVE-CONTRACT-IR-001/002 P1 são achados da proposta universal **superada**;
não afirmar codefix/fechamento independente. Q-NATIVE-01–03 e dez grupos antigos
de contenção universal deixam de reger a implementação por correção explícita
de escopo, não por teste aprovado ou perda funcional. Seus arquivos continuam.
MODELS-IR-001/002 P2,172GREEN/10TODO e modelos schemas1/2 continuam história do
protótipo não integrado, sem apagar/renomear RED ou transformá-lo em prova atual.
Não implementar prepareNativeRun/launcher/audit/SDK por obrigação dessa proposta.

Os dez testes reconciliados NATIVE-01–10 preservam as provas nativas pertinentes:
perfis/discovery/modelos, task batch-ou-flat/async/isolation/yield/retomada,
saídas peer/deep-review, revisão/contexto, fallback/retry e E2E integrado. Até
executá-los, estado PENDING_NATIVE, não PASS por leitura ou fixture da biblioteca.
Capacidade realmente ausente tem limite e próximo teste concreto, sem wire novo.

AC-014 e conclusão final de AC-016 continuam posteriores: revisão final
independente → instalação autorizada preservadora → avaliação de todo pacote
instalado no OMP atualizado → entrega local com matriz/limites → triagem/retro
da demanda AC-009. Não antecipar instalação ou alegar modelos efetivos nesta
revisão. A rotina de continuidade existente e o coordenador mantêm retomada;
esta autoria não cria rotina, processo persistente ou fila paralela.


## Emenda 0.3r7 — T-010 e gates da fronteira revista

T-008 e seus AC-017–019 permanecem; T-010 é novo escopo material autorizado
pela mensagem direta “prossiga com a recomendação”, não renomeia T-001–007 nem
reinicia a família T-009-native-design-review esgotada em3/3. T-010-contract-draft
tentativa1 limita escrita a cinco drafts e evidências. O mapeamento de viabilidade
é análise separada; nenhuma atribuição constitui aprovação. Os passos abaixo
são gates posteriores, não jobs iniciados nem autorização tácita de execução:

| Passo / responsável | Gate e saída |
|---|---|
| Crítica do candidato / peer distinto | Cinco hashes0.3r7 + autorização e mapa de viabilidade atuais; conferir TCB revista, controles preservados e disposição histórica; não aprova código futuro |
| Integração documental / spec-kit-author | Peer resolvido, hashes-base atuais e locks canônicos; CAS/revisão dependente; coordenador atualiza plano/AC/onda1 |
| RED / test-author | Contrato liberado; testes novos sem import da suite que executa findSh/Git; falha de asserção significativa, não tooling |
| GREEN / developer ou refactorer | Recursos isolados e RED; factory/derivação, bridge aprovado e sem Git real; metadata-only e helper inócuo apenas em recursos admitidos |
| Review guard / peer e segurança independentes | Bootstrap por metadados OS confiáveis, proveniência/identidade/arquivo/alias/ACL/carga pertinente e pathname privado; argv/stdio/status e negativas atuais; extensão OFF se gap material |
| Fixtures reais / validator | Guard implementado VALIDATED independente, aprovação limitada existente e isolamento observado; somente então Git/hooks/commits temporários |
| Integração / integrator e revisores T-005 | Suites completas pertinentes + docs/hash atuais + revisão total; não substitui revisão final e NATIVE-01–10 |

Conferir GIT-01–18 do plano de teste antes de GREEN; mapear TEST_REF reais quando
criados. Preservar títulos/assertions das suites existentes; mover findSh e Git
de import/setup/cleanup para fronteira protegida. Não transformar testes em skip
para alegar PASS. Factory/derivação, cópia do hook isolado, linked worktree,
quatro geridos e LFS têm positivos específicos após liberação.

Coordenador único mantém attempt/history/recursos; máximo3tentativas da mesma
identidade, infraestrutura não muda modelo. Raw history, baseline90/manual71,
nativerunFAILED e coleta1038PASS/12pending/2blocked continuam históricos.
Autor retorna DRAFT_COMPLETE e enablement BLOCKED até provas; não RUNNING velho,
DONE global ou autorização pela própria escrita. Ao concluir, liberar writer
T-010-contract-draft; próxima ação é peer independente sobre os cinco hashes,
não novo pedido do escopo já autorizado.


A nova TCB inclui o contexto normal OS de resolução de nomes/carga do chamador;
capacidade adversária de alterá-lo está fora da garantia adicional revista.
Repo/PATH/env/reports/arquivos continuam não confiáveis. Nenhuma tarefa exige
broker/lease/serviço/SDK ou prova do namespace estrito superado. A rota privada
por invocação ainda deve provar proteção ACL de arquivos/aliases e carga
pertinente, origem/editor/release/linkset exatos, bootstrap independente e
negação terminal com unknown=false. Preservar legado nlink1, as quatro peças de
hook/cópia standalone e semântica original; fullchain installer/pre-push e rota
ship existente, sem outro motor/CLI.

TD-001/NDR-001: falha histórica preservada, requisito anterior de contexto
superado por decisão material, nunca code-fixed ou risco dispensado. Proposta
nativa estrita não adotada/NO_GO; NDR-002 serviço não adotado; NDR-003 transporte
não usado. Ataques atuais a arquivo/alias continuam bloqueantes até correção.
Registrar reuso ou invalidação de cada prova dependente e review atual antes
de habilitar Git. Cada nova tarefa mantém cap3; não há quarta tentativa da
review antiga. Nenhum aceite, final install/OMP ou modelo observado é promovido
por estes documentos; actual=null/unverified continua obrigatório quando ausente.
