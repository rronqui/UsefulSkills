# Plano de correção e entrada em produção — Windows e Linux

## Escopo
Corrigir os achados válidos P1, P2 e P3 da auditoria, entregar o pacote funcional em Windows e Linux e preservar controles de segurança sem ampliar o produto. Planejamento apenas: nenhuma implementação, instalação ou publicação autorizada/executada por este documento. A auditoria é ponto de partida, não prova de que todos os apontamentos ainda se aplicam.

## Regras de execução
- Dar identificador estável a cada um dos59 apontamentos; agrupar duplicatas por causa sem perder vínculos.
- Encerrar cada apontamento como corrigido e verificado, duplicado de correção verificada, ou improcedente com evidência concreta. Nada fica silenciosamente adiado.
- Implementar somente após confirmar o comportamento atual e alinhar o contrato aplicável. Não repetir falhas conhecidas só para confirmar.
- Preservar alterações locais existentes. Partir do candidato atual, não restaurar revisões históricas indiscriminadamente.
- Cada arquivo compartilhado tem um escritor. Paralelismo entre módulos, não entre editores do mesmo arquivo.
- Não criar outro orquestrador, framework de provas, SDK, serviço, broker, sistema de receipts ou mecanismo genérico de retry.
- Não enfraquecer segurança nem marcar unknown como PASS para obter verde. NA exige motivo e evidência reais.

## Onda0 — baseline utilizável e triagem
1. Fixar candidato, inventário e versões suportadas: OMP18.18.6 do contrato atual; Node22 na versão fixada para verificação inicial. Documentar limites de suporte: validar uma combinação real porOS não certifica todas as versões dos sistemas/Node.
2. Investigar a falha já registrada de coleta Vitest27/27, sem rodar toda a suíte repetidamente. Inspecionar resolução/imports, configuração e dependências; fazer correção mínima demonstrável. Após alteração, executar primeiro um arquivo representativo. Não atribuir previamente causa a Vitest ou ao produto.
3. Preparar execução Windows real e Linux real, via CI/VM/host disponível. WSL pode ajudar Linux, mas não comprova APIs Windows. Não executar matriz combinatória de versões.
4. Adjudicar59 apontamentos, começando P1. Reutilizar regressões existentes e eliminar falsos positivos por evidência, não por preferência. Achados sobre APIs do loader Windows precisam considerar KnownDLLs, ACLs e o modelo de ameaça efetivo antes de justificar mudanças.
Saída: runner funcional, destinos de verificação disponíveis e backlog sem duplicação de causa. Se restauração do runner exigir upgrade, fazer upgrade estritamente necessário, sem atualização geral de dependências.

## Onda1 — correções por módulo, com paralelismo controlado

### A. Gates de qualidade e revisão
- Rejeitar aprovação TDD acompanhada deP0/P1 válido; preservar diagnósticos e manter bloqueio válido funcionando.
- Ativar os campos de qualidade no ship.config e no bootstrap, sem depender de configuração implícita legada para a entrega atual.
- Garantir que report, contexto, receipts e fontes permaneçam vinculados no momento de decisão; cobrir a troca concreta identificada, não tentar provar ausência universal de corridas.
- Ajustar validação de nomes canônicos SpecKit e referência exata deAC.
Prova mínima: reutilizar fixtures de relatório e testes do protocolo; casos positivo, contraditório e contexto alterado. Não exercitar publicação real para provar validação local.

### B. Consumidores de evidência OMP
- Correlacionar terminal com sessão/dispatch/job/instância/papel corretos usando metadados realmente expostos; não inventar campos.
- Tratar status, exitCode, isError e aborted conforme canal/contrato, sem equiparar transporte bem-sucedido a sucesso da tarefa.
- Impedir promoção de análise INCOMPLETE e evidência de leitura sem conteúdo/recibo válido.
- Rejeitar END órfão e findings malformados, sem descartá-los silenciosamente.
- Vincular retry técnico ao papel/origem esperados; limitar arquivo offline antes de materializá-lo.
Prova mínima: tabelas pequenas sobre consumidores existentes, com envelope válido realista e uma dimensão inválida por cenário. Nenhuma chamada de modelo para cada combinação inválida.

### C. Instalação e filesystem Windows/Linux
- Reservar quarentena POSIX sem sobrescrever entrada estrangeira.
- Corrigir verify baseado em content e arquivos readonly idênticos sem escrita desnecessária.
- Alinhar sourceScopes vazio entre implementações conforme contrato, sem ampliar confiança inadvertidamente.
- Preservar a resolução efetiva de core.hooksPath; rejeitar caminho ambíguo quando não puder ser resolvido com segurança.
- Verificar limite do hook antes de lê-lo integralmente.
Prova mínima: diretórios temporários e arquivos pequenos; testes existentes de sucesso, drift, preservação e rollback. Corrida via seam determinístico existente, sem stress test probabilístico. Executar os casos específicos no OS correspondente.

### D. Confiança Git for Windows
- Confirmar quais objetos e diretórios de carga são parte da confiança efetiva; corrigir revalidação da closure comprovadamente necessária.
- Verificar a hipótese de precedência de DLL e impedir predecessor não admitido se o cenário se aplicar. Não classificar comportamento seguro como vulnerabilidade para justificar implementação.
- Aceitar nomes Git legítimos sem interpolação de shell; preservar argv/stdio/status.
- Limitar tempo do probe PowerShell com erro controlado e preservação de arquivos.
- Regenerar o guard pre-push a partir da fonte única, evitando duas implementações editadas separadamente.
Prova mínima: testes determinísticos da política e uma operação Git real suportada no Windows. Não exigir malware, certificado de assinatura do projeto, adulteração da instalação global ou privilégios administrativos para testar.

### E. Estado, alignment e tarefas normativas
- Definir tratamento de histórico RUNNING antigo sem liberar lock de execução ainda não resolvida. Evidência stale não é evidência de que o job terminou.
- Vincular resposta à pergunta/fronteira pendente, não apenas question_id inédito.
- Alinhar delegações com schema dinâmico e vínculos de fonte exigidos.
- Fazer fluxo normativo, matriz mista, validator, exemplos e diagrama concordarem com o consumidor. Preservar comportamento contratual aprovado; mudança de contrato deve ser explícita antes de implementação dependente.
- Corrigir owner de confirmação terminal AC001, ordem da prova Windows e exclusividade de escrita NOTICE. Não reexecutar specs históricas; corrigir a instrução inconsistente.
Prova mínima: casos pequenos de estado/alignment e leitura semântica de exemplos/diagrama. Não testar frases literais dos documentos.

### F. Sanitização HITL e testes auxiliares
- Cobrir atribuição indexada sensível e identificadores AWS STS segundo a política existente.
- Resetar estado YAML após escalar explícito, preservando linhas diagnósticas posteriores.
- Exercitar todas as condições do predicado determinístico do diagnóstico.
- Evitar testes Git que passam por ler conteúdo fora do bullet de operação correto; preferir semântica/comportamento verificável.
Prova mínima: entradas sintéticas curtas; conferir ausência do segredo e presença das linhas não sensíveis em stdout e trace. Nenhuma credencial real. Bash/AWK também devem ser exercitados no ambiente Windows suportado, não apenas omitidos comoNA.

### G. Ship, release e backup Linux
- Rejeitar argumentos desconhecidos e body-file repetido antes de efeitos.
- Alinhar política de tag single/multi-package e initial-version ao contrato de release, sem mudar versionamento manualmente.
- Resolver/documentar Python suportado e verificá-lo antes de parar serviço. Falta de pré-requisito deve falhar antes de efeitos.
- Normalizar contextPath da CLI dentro dos mesmos limites de confinamento do relatório.
Prova mínima: parsing e configuração sem rede; backup/restore com arquivo temporário pequeno; processo/serviço descartável no ensaio de deploy. Não envolver serviço real de produção.

Integração da onda1: módulos podem andar em paralelo, mas A/B/E compartilham contratos e devem combinar formato antes de editar. C/D compartilham helpers Windows e exigem ownership explícito. Arquivos globais, configuração CI e SpecKit têm integração serial. Não usar59 agentes nem uma revisão global por achado.

## Onda2 — documentação, proveniência, CI e integração
- Atualizar docs junto das correções; não reescrever todo histórico. Preservar falhas históricas com classificação correta.
- Corrigir export/API do deep-review, matriz normativa, diagrama e pré-condições Windows.
- Ajustar recomendações PostgreSQL: prepared statements SQL versus protocolo e SeqScan como hipótese, não diagnóstico automático de índice ausente.
- Tornar proveniência FastAPI/Vue/React auditável com fonte/licença/recibo duráveis e sem depender de URI privada inacessível. Não criar avisos legais inventados nem afirmar licença sem fonte.
- Remover paths privados de ledgers públicos, manter hashes e escopo; não promover whole-Native por equivalência derivada de fontes.
- Acrescentar ao CI verificações delimitadas de segredos/dependências e vínculo real de issue noPR, respeitando exceções justificadas do bot de release. Não adicionar scanner da própria máquina inteira nem chamadas frágeis a cada teste.
- Configurar jobs Windows/Linux e instalação de dependências determinística. Preparar dependências antes da validação; não usar skip inesperado como aprovação.
- Uma revisão independente das correções por conjunto coeso, seguida de revisão final da integração. Achados pequenos são corrigidos diretamente, sem multiplicar rodadas idênticas.
Saída: todosP1/P2/P3 válidos resolvidos e integrados, docs atuais coerentes e CI reproduzível.

## Onda3 — candidato final e validação real
1. Congelar a revisão candidata após integração. Executar uma suíte completa porOS sobre esse candidato. Durante correções anteriores, executar apenas os testes afetados; não repetir a suíte toda por arquivo.
2. Qualquer falha nova recebe diagnóstico e correção localizada; repetir afetados e renovar a validação final que a alteração invalidar. Nada de reutilizar verde de revisão diferente sem justificativa de escopo.
3. Instalar em destinos descartáveis autorizados no Windows e Linux: instalação inicial, --check limpo, reinstalação idempotente e preservação/recuperação no cenário de falha existente.
4. Exercitar no OMP real os contratos Native necessários. Agrupar descoberta/resolução dos12 perfis e wire; testar sucesso, bloqueio e rejeição malformed no consumidor; observar delegação/retorno/retomada/retry genuíno. Usar provas compartilhadas só quando conteúdo, runtime e escopo forem realmente os mesmos; recursos OS específicos precisam de prova noOS correspondente.
5. Executar uma rota integrada curta e uma rota TDD completa em repositório descartável, agrupando gates e retomada sem repetir workload por skill. Cobrir contratos local/external com cenários pequenos. Testar opt-out de retro sem nova implementação/modelo quando o consumidor puro for suficiente.
6. Para Ship, verificar configuração, PR e checks em alvo controlado. Ensaiar deploy/rollback descartável na plataforma pertinente. Não publicar releases repetidas só para testar formato.
7. Recolher comando, revisão, resultado, limite e referência de evidência. Não duplicar transcrições inteiras em muitos receipts. Ferramenta/credencial indisponível significa validação pendente, não teste impossível nem aprovação presumida.

## Política de testes proporcionais
Um teste novo só entra se houver risco observável não coberto. Preferir ampliar tabela existente a criar suíte/framework. Cobrir cenário normal, defeito específico e preservação do contrato relevante; não produto cartesiano de flags/versões. Não exigir prova matemática de corridas, substituição de sistema, execução maliciosa, benchmarks de modelos ou teste de string de documentação. Não estabelecer teto artificial que impeça cobrir contratos independentes; usar menor conjunto que discrimine os defeitos. Não converter falha em skip nem enfraquecer asserção para produzir verde.

## Critérios de saída
- Todos59 apontamentos têm disposição e vínculo: corrigido/verificado, duplicado rastreável ou improcedente fundamentado. Nenhum P1/P2/P3 válido adiado.
- Suíte completa verde no candidato final emWindows eLinux; skips somente fora do escopo declarado e com justificativa real. Capacidade prometida obrigatória não viraNA.
- Instalação, hooks e operaçõesGit previstas funcionam nos doisOS. HostingLinux continua operação de hostLinux, mesmo quando acionado de estaçãoWindows; não prometer servidorNginx nativoWindows.
- FluxosOMP reais aplicáveis aceitos, inclusive bloqueio e recuperação. Serving interno não observável permanece declarado como tal, sem PASS inventado.
- Revisão independente aprovada, sem achado válido aberto, e segurança proporcional atual.
- Documentação/proveniência/inventário correspondem à versão candidata; PR/checks/merge/release seguem governança existente.
- Release identificável e procedimento de retorno verificável, sem atualização manual de versão fora do release-please.

## Caminho crítico
Runner/triagem → contratos de sucesso e persistência → correções paralelas por módulo → integração e docs → suíte finalWindows/Linux → OMP real e instalação → PR/CI/release. Não estimar prazo de calendário antes de resolver runner e confirmar acesso aos runtimes. Isso evita promessa sem evidência, não amplia escopo.

## Inventário de apontamentos a encerrar

### Review16
- Review16-01 | P1 | Ative o gate de qualidade no ship.config.json | ship.config.json:1 | disposição inicial: TRIAGEM

### Review06
- Review06-01 | P2 | Keep current whole-Native approval scoped to captured sources | implementation-evidence/release-governance/goal47-local-readiness.json:119 | disposição inicial: TRIAGEM
- Review06-02 | P2 | Remove host-local report paths from the platform ledger | implementation-evidence/release-governance/final-platform-suite-summary.json:370 | disposição inicial: TRIAGEM
- Review06-03 | P2 | Use portable report locators in the public QA ledger | implementation-evidence/release-governance/reviewed-final-public-full-qa.json:36 | disposição inicial: TRIAGEM

### Review08
- Review08-01 | P1 | Rejeite APROVADO com findings P0/P1 no modo TDD | deep-review/lib/protocol.mjs:399 | disposição inicial: TRIAGEM
- Review08-02 | P2 | Inclua aggregateReviewInstances na lista de exports | deep-review/SKILL.md:82 | disposição inicial: TRIAGEM
- Review08-03 | P3 | Identifique a origem das referências FastAPI e Vue | deep-review/SOURCE.md:23 | disposição inicial: TRIAGEM

### Review11
- Review11-01 | P1 | Inclua o gate de qualidade na configuração gerada | release-bootstrap/SKILL.md:201 | disposição inicial: TRIAGEM
- Review11-02 | P2 | Execute verificações de segredos e dependências no contexto quality | .github/workflows/ci.yml:18 | disposição inicial: TRIAGEM
- Review11-03 | P2 | Exija uma issue válida antes do merge | .github/PULL_REQUEST_TEMPLATE.md:3 | disposição inicial: TRIAGEM

### Review01
- Review01-01 | P2 | Vincule históricos RUNNING à revisão atual | tdd-orchestrator/lib/execution.mjs:106 | disposição inicial: TRIAGEM
- Review01-02 | P2 | Compare o hash correto em verificações baseadas em conteúdo | tdd-orchestrator/lib/fs-transaction/index.mjs:562 | disposição inicial: TRIAGEM
- Review01-03 | P2 | Trate sourceScopes vazio de forma consistente no Windows | tdd-orchestrator/lib/fs-transaction/index.mjs:706 | disposição inicial: TRIAGEM
- Review01-04 | P2 | Exija limites de caminho na evidência Spec Kit | tdd-orchestrator/lib/state.mjs:221 | disposição inicial: TRIAGEM
- Review01-05 | P2 | Valide o token exato da referência normativa | tdd-orchestrator/lib/state.mjs:326 | disposição inicial: TRIAGEM

### Review09
- Review09-01 | P1 | Suporte múltiplos ACs normativos | tdd-orchestrator/SKILL.md:595 | disposição inicial: TRIAGEM
- Review09-02 | P2 | Aceite NA no gate de rastreabilidade | tdd-orchestrator/agents/validator.md:66 | disposição inicial: TRIAGEM
- Review09-03 | P2 | Adicione a transição normativa à máquina de estados | tdd-orchestrator/SKILL.md:643 | disposição inicial: TRIAGEM
- Review09-04 | P2 | Corrija o exemplo de matriz mista | tdd-orchestrator/SKILL.md:341 | disposição inicial: TRIAGEM
- Review09-05 | P2 | Normalize o caminho do contexto da CLI | tdd-orchestrator/bin/quality.mjs:27 | disposição inicial: TRIAGEM
- Review09-06 | P2 | Diferencie preparação SQL de protocolo | tdd-orchestrator/references/postgresql/conn-pooling.md:39 | disposição inicial: TRIAGEM
- Review09-07 | P2 | Qualifique heurísticas de Seq Scan | tdd-orchestrator/references/postgresql/monitor-explain-analyze.md:38 | disposição inicial: TRIAGEM
- Review09-08 | P3 | Torne a evidência de proveniência reproduzível | tdd-orchestrator/SOURCE.md:20 | disposição inicial: TRIAGEM

### Review07
- Review07-01 | P1 | Revalide contexto e recibos antes de aprovar delivery | specs/specs005-omp-compatible-release/contracts/interface-contract.md:582 | disposição inicial: TRIAGEM
- Review07-02 | P2 | Mapeie a confirmação terminal de AC-001 a uma tarefa executável | specs/specs005-omp-compatible-release/tasks.md:253 | disposição inicial: TRIAGEM
- Review07-03 | P2 | Alinhe o gate da primitive Windows antes de GREEN | specs/specs005-omp-compatible-release/spec.md:321 | disposição inicial: TRIAGEM
- Review07-04 | P2 | Serialize o único escritor de NOTICE | specs/specs003-convivencia-robusta-skills/tasks.md:22 | disposição inicial: TRIAGEM

### Review15
- Review15-01 | P1 | Cubra chaves AWS STS na sanitização HITL | scripts/hitl-loop.test.mjs:1053 | disposição inicial: TRIAGEM
- Review15-02 | P2 | Teste todas as cláusulas do predicado determinístico | scripts/bug-diagnosis.test.mjs:52 | disposição inicial: TRIAGEM
- Review15-03 | P2 | Delimite corretamente cada bullet de operação | scripts/conflict-resolution.test.mjs:157 | disposição inicial: TRIAGEM

### Review12
- Review12-01 | P1 | Redact indexed sensitive assignments | bug-diagnosis/scripts/hitl-loop.template.sh:359 | disposição inicial: TRIAGEM
- Review12-02 | P2 | Reset explicit-YAML state after scalar values | bug-diagnosis/scripts/hitl-loop.template.sh:614 | disposição inicial: TRIAGEM

### Review03
- Review03-01 | P2 | Reject unconsumed new arguments | ship/bin/ship.mjs:554 | disposição inicial: TRIAGEM
- Review03-02 | P2 | Reject duplicate --body-file flags | ship/bin/ship.mjs:752 | disposição inicial: TRIAGEM
- Review03-03 | P2 | Enforce the single-package tag policy | ship/bin/ship.mjs:155 | disposição inicial: TRIAGEM
- Review03-04 | P2 | Reject versions below initial-version | ship/bin/ship.mjs:161 | disposição inicial: TRIAGEM
- Review03-05 | P2 | Resolve the Linux backup interpreter portably | ship/bin/lib.mjs:292 | disposição inicial: TRIAGEM

### Review04
- Review04-01 | P1 | Reject task results from errored Root TASK END | implementation-evidence/native-release/review-context.mjs:1435 | disposição inicial: TRIAGEM
- Review04-02 | P1 | Bind review terminals to the exact Root dispatch | implementation-evidence/native-release/review-context.mjs:1653 | disposição inicial: TRIAGEM
- Review04-03 | P1 | Require status and failure flags independently of exitCode | implementation-evidence/native-release/review-context.mjs:1662 | disposição inicial: TRIAGEM
- Review04-04 | P1 | Bind every profile terminal to its real dispatch | implementation-evidence/native-release/profiles.mjs:2559 | disposição inicial: TRIAGEM
- Review04-05 | P1 | Reject failed native peer progress before consuming its yield | implementation-evidence/native-release/profiles.mjs:2731 | disposição inicial: TRIAGEM
- Review04-06 | P1 | Preserve explicit isError in profile terminal records | implementation-evidence/native-release/profiles.mjs:1482 | disposição inicial: TRIAGEM
- Review04-07 | P2 | Bound offline peer evidence before parsing | implementation-evidence/native-release/profiles.mjs:1134 | disposição inicial: TRIAGEM

### Review14
- Review14-01 | P1 | Reservar quarentena sem substituir entradas estrangeiras | scripts/fs-transaction.test.mjs:886 | disposição inicial: TRIAGEM

### Review10
- Review10-01 | P1 | Bloqueie resultados INCOMPLETE antes da promoção | alignment/agents/requirements-reader.md:24 | disposição inicial: TRIAGEM
- Review10-02 | P2 | Vincule cada resposta à fronteira pendente | alignment/references/routing-and-persistence.md:94 | disposição inicial: TRIAGEM
- Review10-03 | P2 | Complete as atribuições dos especialistas | alignment/SKILL.md:14 | disposição inicial: TRIAGEM

### Review05
- Review05-01 | P1 | Exija conteúdo observado em cada leitura Root | implementation-evidence/native-release/fallback.mjs:847 | disposição inicial: TRIAGEM
- Review05-02 | P2 | Vincule o terminal técnico ao papel esperado | implementation-evidence/native-release/technical-retry-scenario.mjs:936 | disposição inicial: TRIAGEM
- Review05-03 | P2 | Rejeite ENDs de leitura sem START correspondente | implementation-evidence/native-release/fallback.mjs:1630 | disposição inicial: TRIAGEM
- Review05-04 | P2 | Preserve findings malformados para falhar fechado | implementation-evidence/native-release/fallback.mjs:1678 | disposição inicial: TRIAGEM

### Review13
- Review13-01 | P1 | Revalidate every loaded Git object before each spawn | scripts/lib/git-trust-source.mjs:683 | disposição inicial: TRIAGEM
- Review13-02 | P1 | Reject application-directory predecessors for system DLLs | scripts/lib/git-trust-source.mjs:492 | disposição inicial: TRIAGEM
- Review13-03 | P2 | Align dynamic ref validation with Git accepted names | scripts/lib/git-trust-source.mjs:678 | disposição inicial: TRIAGEM
- Review13-04 | P2 | Bound the native PowerShell admission probe | scripts/lib/git-trust-source.mjs:524 | disposição inicial: TRIAGEM

### Review02
- Review02-01 | P2 | Preserve a resolução por symlink de core.hooksPath | scripts/install-hooks.mjs:325 | disposição inicial: TRIAGEM
- Review02-02 | P2 | Trate arquivos idênticos como verificação sem escrita | install.mjs:273 | disposição inicial: TRIAGEM
- Review02-03 | P2 | Verifique o limite antes de ler o hook | scripts/install-hooks.mjs:193 | disposição inicial: TRIAGEM