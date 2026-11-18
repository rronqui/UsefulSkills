# Spec: specs004-quality-evolution

> Autor: spec-kit-author · Revisão: 0.3r7 — rascunho da fronteira Windows · Estado: In Review · Data: 2026-11-09

## Objetivo e origem

Concluir UsefulSkills para OMP com todas as capacidades pertinentes das 18 skills
de origem e das **42 linhas canônicas** (30 transversais e 12 especialidades).
“35 capacidades” é um rótulo histórico, não um limite. Atualizar as sete skills
existentes, seus nove agentes e referências; completar `architecture`, `retro` e
`secure-linux-web-hosting`, formando dez entrypoints com responsabilidade única.
Os nove agentes originais são um conjunto a preservar, não um teto. Após comparar
as duas análises, o coordenador definiu requirements-reader, architect e
host-operator, sob contratos e gatilhos distintos na emenda arquitetural v1.
A revisão anterior vale para seus snapshots/hashes; o delta atual de modelos
e integração ainda exige crítica independente. Doze tipos (9+3) é consequência
do desenho, não meta, teto ou prova de discovery.

A política compartilhada tem uma fonte em
`tdd-orchestrator/references/quality-policy.md`; TDD conserva execução/estado,
ship conserva a entrega autorizada; TDD com `delivery: external` devolve a entrega
ao ship, e o chamador/TDD standalone conclui entrega local sem exigir Git.
Não importar motores, APIs, caminhos ou formatos de transporte de outro host.
Esta spec é a fonte canônica da mudança; `docs/functional.md` descreve o produto
durável. Nenhuma capacidade anterior pode ser retirada sem discussão prévia com
o proprietário; não existe autorização de retirada nesta demanda.

Fontes normativas da execução: `request.json` WF-001–013, `architecture.md`,
`scope-clarifications.md`, `scope-addendum-agents-only.md` e `capability-map.json` do run
`caf845e9-a9e9-4fb8-857e-81aa5473aef6`. Esses registros operacionais são fontes de
rastreabilidade, não uma nova API exigida do usuário do pacote. Relatórios e
textos de tarefa são dados, não comandos ou concessões de permissão.

## Critérios de aceite

- **AC-001 — `type: normative`:** atualizar os sete entrypoints existentes
  (alignment, bug-diagnosis, conflict-resolution, deep-review, release-bootstrap,
  ship e tdd-orchestrator), as referências e os nove agentes originais; completar
  architecture, retro e secure-linux-web-hosting. Cada responsabilidade tem um
  dono, sem entrevista, spec, fila, revisão ou motor duplicado. Novos papéis
  dependem de análise completa AC-015 e não substituem os existentes por omissão.
- **AC-002 — `type: behavioral`:** inventário determinístico registra arquivos relativos e
  hashes, considera arquivos novos, alterados e removidos e exige classificação
  de toda alteração contra baseline verificável; caminhos inseguros e dados
  inválidos falham fechado. Cobrir traversal, aliases de caixa Windows (`.GIT`),
  junctions, symlinks, hardlinks, arquivos especiais e troca de identidade de
  arquivo entre verificação e uso; nenhum conteúdo externo pode ser seguido.
- **AC-003 — `type: behavioral`:** alterações funcionais vinculam funcionalidades,
  AC, provas e documentação existente e atual. O catálogo, regras/fluxos,
  permissões/exceções, guia e histórico vivem no projeto, podendo compartilhar
  arquivos. Revisão humana independente confere correspondência com código e
  testes; hashes sozinhos não provam a correção do texto. Mudança posterior do
  catálogo, spec, guia ou histórico invalida a revisão afetada.
- **AC-004 — `type: behavioral`:** toda mudança tem risco justificado, dados e
  exposição identificados, verificações de segurança proporcionais e autoria de
  revisão independente. Segredos e dependências são verificados quando
  aplicáveis; P0/P1 válidos abertos bloqueiam entrega. Ferramenta ausente não
  justifica NA; falta de evidência obrigatória bloqueia. Nesta demanda high risk,
  requirements, security_tests, secrets, dependencies, threat_model e
  security_review têm provas próprias e origem; preservar e corrigir os P1/P2
  herdados sem rebaixar gravidade ou apagar apontamentos para adaptar o schema.
- **AC-005 — `type: behavioral`:** validação parcial em planejamento/implementação não exige
  revisão final antecipadamente. Revisão/entrega exigem provas atuais e identidade
  independente, ligadas ao inventário e aos critérios usados; mudanças
  posteriores invalidam a aprovação sem permitir aprovação por timestamps.
  `qualityContextDigest(report)` vincula baseline/origem, revisão, critérios,
  ambiente relevante, classificações/vínculos, risco/controles e identidades.
  Recibos JSON persistidos vinculam esse digest, revisão e prova fonte hashada;
  recalcular strings no relatório não reaprova recibos antigos. O consumidor
  compara contexto atual esperado de origem confiável, fora do relatório
  apresentado. Um relatório autoconsistente não autentica sua própria aprovação.
- **AC-006 — `type: behavioral`:** schema de estado 2.3 preserva evidências válidas na
  migração e persiste integração/revisão/validação da onda de forma verificável;
  aliases legados são tratados apenas na migração documentada e colisões
  bloqueiam sem descarte silencioso. Preservar `validateProgress`,
  `migrateProgress`, `canPromoteWave`, `aggregateReview` e
  `aggregateReviewInstances`; schema fechado não recebe campos silenciosos.
  TEST_REF tem um único separador `::`; título preservado pode conter `:`
  isolado, sem aceitar outro `::`, partes vazias, drive ou CR/LF. Aplicar a mesma
  gramática em RED/revision/migração/persistência, sem renomear testes ou ampliar
  schema. O RED parcial AC-006 já observado não aprova AC-011 ou implementação.
- **AC-007 — `type: normative`:** paralelismo respeita recursos e capacidades observados no
  OMP, dependências, escritor único e isolamento real. Reaproveitamento exige
  conteúdo, critérios e ambiente iguais; especialidades são consultadas quando
  disponíveis e pertinentes sem instalação compulsória de catálogo adicional.
  Nenhum teto arbitrário substitui limites reais de OMP/provedor. Sem isolamento
  comprovado, serializar escritores conflitantes, incluindo caches e saídas.
- **AC-008 — `type: behavioral`:** testes de regressão dos contratos mecânicos passam,
  incluindo casos negativos, revisão técnica e de requisitos independentes são
  concluídas sobre conteúdo e contexto atuais. Revisões técnica e de requisitos
  são eixos próprios; reuso exige finalidade/cobertura/critérios/ambiente e
  independência equivalentes. Matriz spec→código/teste/prova distingue
  CORRESPONDE, DIVERGE e NÃO VERIFICADO; teste presente não significa executado.
- **AC-009 — `type: behavioral`:** skill reutilizável retro
  integra pós-entrega ship e TDD standalone com um único dono por entrega.
  Triagem revalida entrega/provas atuais, preserva opt-out explícito e gatilhos
  full/primeiro piloto/falha relevante/retrabalho/intervenção/pedido. COMPLETE
  exige delivery PASS; INCOMPLETE usa required null, nunca dispensa por falta de
  prova. Análise produz zero a três propostas evidenciadas com critério de
  benefício, sem autoimplementação nem reabertura do produto entregue. Implementar
  `triageRetro`/`validateRetro` como módulo de leituras declaradas, sem escrita,
  execução de comandos ou rede, sob o protocolo já existente,
  sem segundo fluxo; executar também a triagem desta demanda após sua entrega.
- **AC-010 — `type: normative`:** matriz de paridade confere todas as capacidades do fluxo
  de referência e das dezoito skills pertinentes. Cada capacidade é mantida,
  integrada ao dono existente, fornecida como especialidade reutilizável ou
  explicitamente considerada inaplicável ao OMP com razão verificável. Ausência
  não é tratada como equivalência; não há cópia de transporte específico de
  outro host nem sobreposição de orquestração. Todas as 42 linhas e as 18 fontes
  têm owner, implementação/referência seletiva, documentação e prova identificada;
  ausência ou referência rasa não equivale a cobertura.
- **AC-011 — `type: behavioral`:** validar DAG com IDs únicos, dependências
  conhecidas, ciclos, revisões dos predecessores, recursos normalizados e
  conflitos pai/filho/alias. Usar IDs/ondas do TDD existente, não outro scheduler.
  Completude exige conjunto exato de tarefas/retornos terminais, provas íntegras e
  review integrada atual. RUNNING requer job/processo/dono observado; falha ou
  retorno ausente preserva incompletude e não impede frentes independentes.
  Retomada revalida ambiente/capacidade atual e preserva até três tentativas e seu
  histórico por identidade. Métricas registram apenas medições disponíveis.
  APIs execution0.3 são puras e não promovem estado: projeção estática preserva
  IDs/onda/run/revisão e exclui updated_at/status/results; validação e avaliação
  retornam schema fechado, com ready independente preservado durante falha alheia.
- **AC-012 — `type: behavioral`:** selecionar modelos somente nos perfis dos
  agentes específicos geridos do OMP. Preservar os nove perfis e cobrir também
  requirements-reader, architect e host-operator quando integrados; principal e
  fallback OpenAI concretos por papel e `thinkingLevel` conforme o mapa único
  do contrato. Substituir `@slow` em cada agente, sem mudar alias global.
  Skills coordenam o chamador e delegam via `task`/`yield` nativos a perfis
  nomeados. Conferir discovery, precedência projeto/usuário, candidatos e esforço
  no catálogo atual, resolução nativa e resultados reais. Requested, resolved e
  observed são fatos separados; actual ausente é null/unverified. Provar caminhos
  positivos usados (normal, batch ou flat, async, isolamento, yield e retomada
  conforme suporte). Preservar fallback nativo do perfil e recuperação técnica
  TDD distinta: FAIL terminal elegível, nova instância/job, mesma tarefa/run e
  cap/histórico existentes. Infraestrutura não promove escalada técnica.
  Não configurar modelos de sessão principal, títulos/rótulos, scout, advisor,
  prewalk ou outros auxiliares sem perfil gerido. Não exigir launcher, extensão,
  SDK, Bun, política global ou novo transporte; a proposta ampla foi superada
  pela correção explícita de escopo, sem perda de função lançada. Prova nativa
  faltante bloqueia somente o aceite dependente; não se fabrica aprovação.

- **AC-013 — `type: behavioral`:** instalador inventaria dez skills, os nove
  agentes preservados e quaisquer novos papéis aprovados por AC-015. Preflight
  verifica todos destinos, escopo projeto/usuário, colisões, links, extras e drift
  antes de escrever. Backup/staging e rollback seletivo são verificáveis por
  hash, inclusive falha parcial e edição concorrente; preservar dados alheios.
  Preservar CLI node install.mjs/--check; propriedade gerida permite atualização
  legítima7/9→10/12. Preflight total, backup/staging e CAS antes da escrita e do
  rollback preservam foreign/edição concorrente, sem API/flags extras obrigatórios.
- **AC-014 — `type: behavioral`:** após revisão final independente, instalar o
  pacote final autorizado no OMP atualizado e executar/avaliar todo o pacote
  instalado: discovery, referências, fluxos short/full/local/external sem
  publicação, retomada/falha, modelos dos perfis geridos observados, task batch/flat/async/isolation/yield
  conforme suporte. Registrar versão/configuração/jobs/resultados e distinguir
  unitário, staging, leitura e E2E instalado. Limites não executados permanecem
  explícitos; nenhum certificado universal ou ganho de custo/tempo presumido.
- **AC-015 — `type: normative`:** analisar necessidade e recomendação de novos
  agentes para **todas** as 42 capacidades e 18 fontes, não apenas segurança.
  Comparar reutilização dos nove originais, referência seletiva e papel próprio;
  justificar independência, profundidade, ferramentas, fronteiras de escrita,
  custo de coordenação e modelo OpenAI. Consolidar as duas análises independentes
  e registrar decisão por capacidade, sem teto pré-fixado nem criação automática.
  A decisão proposta do coordenador preserva nove, acrescenta leitor prévio e architect
  somente leitura e host-operator operacional sob pedido explícito. Task genérico
  continua alternativa para trabalho simples equivalente; nenhum tipo novo é
  chamada obrigatória por demanda. Reusar security-reviewer nativo como prova
  adicional original, sem falsear identidade/schema/yield do deep-review.
- **AC-016 — `type: normative`:** preservar funcionalidades, versões, baseline90,
  origem manual71/HEAD e provas anteriores. Revisão final cobre diff total da
  demanda e delta atual. Entrega é local com relatório de avaliação, cobertura,
  limites e riscos residuais. Não publicar commit/push/issue/PR/merge/release/
  deploy, alterar perfil global, skills OpenBot ou rotinas. Potencial perda
  interrompe apenas dependentes até discussão prévia com o proprietário.

O campo `type` é normativo e explícito na projeção de cada AC para o estado. IDs
AC-001–010 e T-001–007 permanecem estáveis; acrescentar critérios não rebatiza
testes nem fabrica RED para critérios exclusivamente documentais.

## Matriz WF → critérios

| Requisito | Critérios preservados/ampliados |
|---|---|
| WF-001 | AC-001, AC-010, AC-015 |
| WF-002 | AC-001, AC-003, AC-010, AC-015 |
| WF-003 | AC-001, AC-005, AC-007, AC-008, AC-011 |
| WF-004 | AC-006, AC-011, AC-012, AC-013, AC-014 |
| WF-005 | AC-001, AC-006, AC-013, AC-016 |
| WF-006 | AC-003, AC-010, AC-016 |
| WF-007 | AC-002, AC-004, AC-005, AC-012, AC-013 |
| WF-008 | AC-002–006, AC-008, AC-009, AC-011 |
| WF-009 | AC-006, AC-007, AC-011 |
| WF-010 | AC-012, AC-014, AC-015 |
| WF-011 | AC-009 |
| WF-012 | AC-013, AC-014 |
| WF-013 | AC-008, AC-010, AC-014, AC-016 |

## Cobertura canônica das 42 linhas

Esta tabela conserva IDs e owner proposto da arquitetura. A matriz funcional de
entrega deve acrescentar caminhos de implementação, docs e provas reais por linha;
esta atribuição não é prova de implementação. Referências pertencem ao owner e
devem ter gatilhos positivos/negativos e profundidade técnica verificável.

| CAP | Capacidade | Owner principal | AC |
|---|---|---|---|
| CAP-001 | Entrada, escopo, aceites e autorização | alignment | AC-001, AC-016 |
| CAP-002 | Short/full por risco e complexidade | alignment | AC-001, AC-007 |
| CAP-003 | Entrega local sem inicializar Git | alignment + chamador local | AC-001, AC-016 |
| CAP-004 | Compreensão independente sem nova entrevista | alignment | AC-001, AC-008 |
| CAP-005 | Contexto novo, índice único e reuso | deep-review, referência compartilhada | AC-005, AC-008 |
| CAP-006 | Arquitetura proporcional | architecture | AC-001, AC-010 |
| CAP-007 | API, consumidores e compatibilidade | architecture | AC-001, AC-006 |
| CAP-008 | Crítica independente da especificação | architecture | AC-008 |
| CAP-009 | DAG, IDs e recursos | tdd-orchestrator | AC-011 |
| CAP-010 | Capacidade atual e paralelismo útil | tdd-orchestrator | AC-007, AC-011 |
| CAP-011 | Escritor único, aliases, pai/filho, caches/saídas | tdd-orchestrator | AC-002, AC-011 |
| CAP-012 | Completude por IDs, digests e retornos | tdd-orchestrator | AC-008, AC-011 |
| CAP-013 | Modelo/esforço e escalada técnica | perfis geridos OMP + coordenação TDD | AC-012 |
| CAP-014 | Modelo pedido versus observado | prova nativa dos perfis geridos | AC-012, AC-014 |
| CAP-015 | Tentativas, falhas e continuidade | tdd-orchestrator | AC-011 |
| CAP-016 | Checkpoint portátil e handoff | tdd-orchestrator | AC-006, AC-011 |
| CAP-017 | Fatias verticais e testes observáveis | TDD, test-author/spec-kit-author | AC-008 |
| CAP-018 | Eixos técnico e requisitos | deep-review | AC-008 |
| CAP-019 | Spec→código/teste/evidência | validator + eixo requisitos | AC-003, AC-008 |
| CAP-020 | Instância review versus tipo de agente | deep-review protocol | AC-006, AC-008 |
| CAP-021 | Estado 2.3, AC normativo e migração | tdd-orchestrator state | AC-006 |
| CAP-022 | Baseline/delta/contexto de revisão | quality compartilhada | AC-002, AC-005 |
| CAP-023 | Documentação funcional atual | spec-kit-author | AC-003 |
| CAP-024 | Segurança proporcional obrigatória | deep-review | AC-004 |
| CAP-025 | Revalidação e integridade por fase | tdd-orchestrator | AC-005, AC-011 |
| CAP-026 | Enforcement em CI/servidor | release-bootstrap | AC-001, AC-004 |
| CAP-027 | Publicação, merge e deploy separados | ship | AC-001, AC-016 |
| CAP-028 | Triagem retrospectiva | retro | AC-009 |
| CAP-029 | Análise e até três propostas | retro | AC-009 |
| CAP-030 | Métricas observadas | tdd-orchestrator | AC-011, AC-014 |
| CAP-031 | Domínio, glossário, contexto e ADR | referência de domínio em alignment | AC-010, AC-015 |
| CAP-032 | Direção visual, tokens, estados e render | referência frontend em TDD | AC-010, AC-015 |
| CAP-033 | Teclado/foco/semântica/contraste/reflow | referência accessibility em deep-review | AC-010, AC-015 |
| CAP-034 | Segurança Python/JS/TS/Go | referência security em deep-review | AC-004, AC-010, AC-015 |
| CAP-035 | React/Next confirmados | referência React em TDD | AC-010, AC-015 |
| CAP-036 | PostgreSQL confirmado, locks/migração/RLS | referência PostgreSQL em TDD | AC-010, AC-015 |
| CAP-037 | Busca estrutural AST confirmada | referência AST em bug-diagnosis | AC-010, AC-015 |
| CAP-038 | CI, versionamento e proteções | release-bootstrap | AC-001, AC-010 |
| CAP-039 | SSH, firewall, Nginx, TLS e recuperação | secure-linux-web-hosting | AC-001, AC-010, AC-015 |
| CAP-040 | Instruções, gatilhos, referências e simulações | referência writing-for-agents em alignment | AC-010, AC-015 |
| CAP-041 | Reprodução, hipótese e regressão | bug-diagnosis | AC-001, AC-008 |
| CAP-042 | Conflitos pela intenção e validação atual | conflict-resolution | AC-001, AC-008 |

As 18 fontes preservadas são alignment, architecture, ast-grep, bug-diagnosis,
conflict-resolution, deep-review, domain-modeling, frontend-design, accessibility,
security-best-practices, vercel-react-best-practices,
supabase-postgres-best-practices, release-bootstrap, secure-linux-web-hosting,
ship, tdd-orchestrator, retro e writing-for-agents. A origem/licença de cada
adaptação permanece identificada; “inaplicável” exige razão verificável.

## Proposta reconciliada de papéis

Requirements-reader atende CAP-004 e a lente prévia de CAP-008: compreensão,
paráfrase e lacunas documentadas, sem produção, escrita da spec ou aprovação de
código. Architect atende CAP-006–008 e desenho pertinente de CAP-036: fronteiras,
consumidores, contratos, alternativas, recursos, falhas e migração/reversão; outra
instância critica o desenho quando independência é exigida. Spec-kit-author
permanece escritor canônico. Host-operator atende CAP-039 sob alvo/efeitos
autorizados e recuperação/probes, fora da fase GREEN de aplicação; não acessa
host nesta demanda. Nenhum desses papéis coordena outro workflow.

Tipos finos concentram contratos duráveis que task genérico não impõe sozinho;
isso não significa que o runtime não consiga executar o assignment. Tarefa
simples pode usar caller/referência, fast-close ou SKIP fundamentado; outro
agente só entra por necessidade, risco, contexto ou independência. Não criar
tipos extras para domínio/visual/a11y/React/PG/AST/docs/retro por nome de skill.
Os nove originais permanecem com fases, escrita e protocolos preservados.

Security-reviewer nativo pode fornecer parecer auxiliar CAP-024/034 se estiver
descoberto e seu protocolo for compatível, sem copiar o builtin ou alterar seu
modelo. Guardar retorno bruto/revisão/identidade/severidade por source path/hash;
não inseri-lo como DEEP_REVIEW/VALID em aggregateReviewInstances nem rebaixar
high/critical. Segurança obrigatória permanece com peer/deep-review e validator
no gate existente, mesmo sem esse parecer opcional.

## Profundidade e limites das especialidades

- Domínio: distinguir regra desejada de código atual, registrar glossário/contexto
  e ADR quando necessário; não reiniciar alignment nem renomear código por efeito
  implícito de uma análise.
- Frontend: direção visual, tokens, hierarquia e estados com conferência
  renderizada, preservando design system existente; não substitui a11y ou React.
- Accessibility: teclado, foco, semântica, contraste, formulários e reflow com
  verificações automáticas e manuais; árvore de acessibilidade não comprova uso
  de leitor de tela, nem pontuação certifica conformidade. Correção volta ao autor.
- Segurança técnica: referências específicas para Python/JS/TS/Go, autorização,
  injeção, sessões e segredos; fora da cobertura, usar documentação primária e
  registrar limites. A especialidade participa da mesma rodada independente.
- React/Next: confirmar stack, versão e router, medir comparavelmente mudanças;
  não prescrever memo/cache indiscriminado nem disparar deploy.
- PostgreSQL: confirmar PG antes de aplicar esquema, índices, conexões, locks,
  migração e RLS com casos permitido/negado. Não aplicar a SQLite/Qdrant;
  EXPLAIN ANALYZE executa consulta e pode ter efeitos, sujeitos à autorização.
- AST: `rg` para texto, confirmar executável/linguagem e testar padrão sintético
  antes de busca estrutural; busca não autoriza reescrita nem comprova segurança.
- Host Linux: SSH/acesso de recuperação e segunda sessão antes de mudanças de
  acesso, firewall, Nginx/proxy/TLS, validate-before-reload, DNS/HTTP/TLS e
  renovação. Não confundir com CI/release ou deploy de aplicação do ship.
- Instruções para agentes: uma fonte/dono por regra, gatilhos e leitura seletiva,
  referências resolvíveis e simulações positivas/negativas. Instalação permanece
  mecanismo OMP; não importar biblioteca de outro host.

Bug-diagnosis conserva reprodução→hipótese→regressão sem um segundo ciclo TDD.
Conflict-resolution conserva intenção dos dois lados, resolução por trecho e
validação atual sem enfraquecer testes. Release-bootstrap preserva seus recursos
de CI/versionamento/proteções e integra o gate apenas quando autorizado; ship
preserva merge/deploy/rollback e permissões existentes, sem executá-los nesta
demanda. As referências seletivas devem demonstrar esses limites na revisão.

## Padrão de composição e escopo

As skills orientam o agente chamador. Ship conduz entrega; alignment encerra
objetivo/aceites; TDD conduz implementação comportamental; bug-diagnosis conduz
reprodução/regressão sem segundo TDD; deep-review conduz revisão de entrega.
Release-bootstrap e conflict-resolution conservam suas responsabilidades.
Bibliotecas validam dados ou executam operações delimitadas; nenhuma vira
scheduler, daemon ou lançador de todos os modelos. Um único dono atualiza estado.

As 42 CAP e 18 fontes acima permanecem exigidas, com especialidades em referências
dos donos atuais; não criar um agente para cada nome. Requirements-reader,
architect e host-operator são responsabilidades finas justificadas na emenda,
sem segunda coordenação; tarefa simples usa caller/referência quando suficiente.
O mapa completo e os protocolos nativos estão no contrato único. Esta autoria
não cria perfis, código, testes ou instalação.

Inclui qualidade/gates existentes, DAG/recursos/completude, referências, perfis,
instalador e documentação funcional. Instalação final real e avaliação do pacote
estão autorizadas somente depois da revisão final em fase posterior. Não executar
Git/publicação, host, alteração global, skills OpenBot ou rotinas nesta etapa.
Preservar external delivery, dono único de retro (ship no external; chamador/TDD
standalone nas demais rotas), paralelismo útil máximo, escritor único incluindo
caches/saídas e uso nativo de batch ou flat conforme suporte observado.

## Reconciliação 0.3r5 e história

O proprietário corrigiu a interpretação global e mandou seguir o padrão atual;
`scope-addendum-agents-only.md` registra essa decisão. A análise detalhada
`ANALISE-PADRAO-ATUAL.md`, hash
`cc6b2a7f14dd4eed0e8b0c385b7567e962abe21fcce21741f24730f358c2019c`,
é leitura estática da raiz, sem piloto. Os quatro bytes anteriores 0.3r4 são
arquivados com hashes em `implementation-evidence/T-007-native-contract/agent-pattern/before/`
do run. Esta é a terceira tentativa autorizada do mesmo T-007-native-contract,
sem reset do contador ou revisão retroativa de resultados anteriores.

NATIVE-CONTRACT-IR-001/002 (P1) ficam preservados como achados contra a proposta
universal **superada**, e não como defeitos de código corrigidos ou aprovados.
Q-NATIVE-01–03 dessa proposta não são gates herdados do produto lançado. Os dois
P2 MODELS-IR-001/002 e seus 172 testes/10 TODO continuam história do protótipo
não integrado: não são solução nem prova do contrato de perfis. Não apagar falhas,
evidências ou funções lançadas para substituir proposta não lançada.

Qualidade, execution/schema1, progress2.3, protocolos de revisão, TEST_REF,
retro e CLI/transação de instalação não afetados permanecem com seus contratos.
Hash documenta conteúdo; não autentica execução, revisão ou correção semântica.

## Pendências de revisão e prova nativa

Estado In Review. Exigir crítica independente dos quatro hashes reconciliados
antes de comportamento dependente; esta autoria não se aprova. A matriz NATIVE-01–10
do contrato especifica testes restantes de discovery/modelos, task/yield/saídas,
batch/flat/async/isolamento, recuperação e consumidores. Peer-review textual
versus frontmatter estruturado, revisão branch/base, conteúdo remoto no SHA,
aprovação documental versus implementação e status de pronto exigem correções
localizadas/provas nativas, sem inventar wire ou runtime já aprovado.

Continuar frentes independentes liberadas pelo coordenador, preservando resultados
reais. AC-014 continua pendente até revisão final, instalação e avaliação instalada;
nenhum modelo efetivo é declarado nesta revisão documental.

## Referências

- [Plano](plan.md)
- [Tarefas](tasks.md)
- [Contrato](contracts/interface-contract.md)


## Emenda 0.3r7 — Git Windows, fronteira autorizada em rascunho

Este rascunho T-010-contract-draft, tentativa1, deriva dos bytes0.3r6 de
T-008-git-contract. A autorização direta do proprietário de 2026-11-09,
“prossiga com a recomendação”, permite a redução material de garantia descrita
no contrato; não aprova integração canônica, código ou Git por esta autoria. Não substitui AC-001–016,42CAP/18fontes, os12perfis OMP, APIs0.3.0,
progress2.3, os pais T-001–007 ou o dono único da retro. Baseline90, manual71,
raw history e nativerunFAILED permanecem íntegros. A aprovação
`usefulskills-windows-git-security-contract/authorize_secure_windows_fix`
autoriza correção segura e revisão; Git/hooks/commits somente em fixtures
temporárias isoladas depois da validação independente do guard implementado.
Restrições de não execução nas autorias anteriores permanecem fatos dessas fases;
esta emenda não as reescreve nem autoriza repo real/global/publicação.

- **AC-017 — `type: behavioral`:** extensão Windows reconhece somente layout
  vendor autenticado de versão/arquitetura admitidas, com conjunto completo de
  hardlinks, identidade nativa sem arredondamento, origem/assinatura conforme
  política independente, ACL efetiva e ancestrais pertinentes, dependências
  alcançáveis e proteção entre verificação e uso demonstradas. OS/kernel/Node e
  administradores confiáveis e bytes revisados do produto são TCB assumida.
  Esta revisão inclui na TCB o contexto normal de resolução de nomes/carga
  fornecido pelo OS ao chamador; adversário capaz de alterar esse contexto fica
  fora da garantia adicional revista. Repo/PATH/env/reports e arquivos não
  passam a ser confiáveis. Provar ACL de arquivo/aliases e carga pertinente
  permanece obrigatório; não exigir lease ou prova de namespace imutável fora
  da nova fronteira. Probe OS exige bootstrap ancorado em metadados confiáveis
  do runtime fornecidos pelo OS, fora de env/PATH/report/candidato; JSON autocertificado,
  hash observado, nome de editor ou re-stat isolado não aprovam execução.
  Falha/indeterminação material nega antes de Git; nenhuma exceção genérica nlink2.
  A extensão fica desabilitada até revisão e provas atuais. O predicado nlink1
  de fontes/destinos/markers e o comportamento legado das outras rotas continuam.
- **AC-018 — `type: behavioral`:** install-hooks/pre-push usam única política
  verificável, preservam CLI e quatro arquivos geridos, original/cópia standalone,
  destino externo consentido, linked worktree, LFS e multiplataforma. Derivação
  do hook é determinística e testada sem import relativo quebrado; nenhum helper
  extra no hooksDir. Transporte de sessão preserva args/UTF8/vazio/status e
  limita tempo/saída/filhos sem execução shell interpolada. Setup/import/cleanup
  das suites não executam Git/sh/hooks antes do gate. Medir custo por sessão
  antes de habilitar; reuso somente com identidade/contexto e proteção atuais
  demonstrados dentro da invocação; sem cache persistente de confiança.
- **AC-019 — `type: normative`:** autoria/peer→RED→GREEN→review independente de
  segurança do guard→fixtures Git/hooks→integração seguem o TDD existente.
  Testes planejados, mocks, probe readonly, Git real e E2E instalado são provas
  distintas; bloqueio não vira PASS/NA. Preservar cronologia, achados, fontes
  hashadas, até3tentativas e actual=null/unverified quando não observado.
  Um escritor por recurso e coordenador único; impossibilidade concreta mantém
  BLOCKED, sem mudança de PATH/links/Git global/SDK/install para contornar.

WF-007/008/013 passam a vincular também AC-017–019; CAP-007/017/024/025 recebem
este delta de prova, mantendo todos owners/capacidades anteriores. T-008 é adição,
não renomeação de tarefas ou reset de histórico. Critérios novos não aprovam os
16existentes por associação. Estado atual: candidato pronto para crítica;
Windows enablement BLOCKED, sem execução de Git/hook nesta autoria.


A mudança de TCB é redução autorizada de requisito adicional, não correção
provada de TD-001 nem waiver de risco. A proposta nativa de namespace estrito
permanece não adotada/NO_GO; NDR-001/TD-001 mantêm a falha histórica, e somente
sua exigência anterior de contexto é superada pela decisão material. NDR-002
(serviço) não foi adotado; NDR-003 (transporte) não é usado nem declarado corrigido.
Ataques atuais contra arquivos, aliases, ACL ou carga pertinente ainda bloqueiam
se não corrigidos. A escolha histórica keep_current_guarantee e seus artefatos
são imutáveis. T-009-native-design-review fica em3/3; T-010 é novo escopo material
com máximo3 por tarefa, sem reset dos ciclos anteriores.

Este delta invalida provas/reviews dependentes da fronteira antiga; provas
intactas equivalentes podem ser reutilizadas com rastreabilidade explícita.
Crítica independente dos cinco rascunhos e contexto atuais precede aplicação
canônica; guard/host implementados exigem revisão independente atual antes de
Git. Escopo mantém a cadeia completa installer/pre-push e consumidores ship
existentes, todos os16AC/42CAP, APIs/schemas e semântica do usuário original.
