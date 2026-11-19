# Onda 1 E — estado, alignment e tarefas normativas

Data: 2026-11-19. Candidato: working tree compartilhado, sem commit nesta etapa.
Ambiente desta prova: Windows, Node v22.23.2, Vitest v4.1.12 da instalação atual.
Escopo: implementação local e revisão semântica dos documentos indicados abaixo.
Não certifica OMP real, Linux, instalação, release ou integração completa.

Alterações locais anteriores em execution, SKILL e test-author foram preservadas.
Não se reexecutaram tarefas históricas, não se alterou versão de release, não se
criou consumidor/runtime novo de alignment e não se executou a suíte completa.

## Disposição por apontamento

| ID | Disposição | Correção e verificação |
|---|---|---|
| Review01-01 | Corrigido e verificado localmente | `execution.mjs` recusa RUNNING da onda atual com revisão/staticDigest antigo por E_HISTORY. Mantém ocupação mesmo stale ou com terminal posterior inválido, conservando o ajuste local anterior. `execution.test.mjs`: tabela de revisão e digest antigos, writer conflitante bloqueado e tarefa independente pronta; regressões de lock existentes preservadas. |
| Review01-04 | Corrigido e verificado localmente | Evidência Spec Kit exige limites de basename para spec.md, plan.md, tasks.md e interface-contract.md; `not-spec.md`/`.bak` não satisfazem o gate. `state-evolution.test.mjs`: nomes canônicos e paths/anchors positivos, prefixo e sufixo inválidos por documento. |
| Review01-05 | Corrigido e verificado localmente | Referência normativa exige token exato AC-NNN, não substring. `state-evolution.test.mjs`: rejeita AC-0160, XAC-016 e sufixos de identificador, preserva referência delimitada válida. |
| Review09-01 | Corrigido e verificado localmente | Emenda explícita e delimitada no contrato specs005 permite >=1 ACs todos normativos, com NA exato por AC; state, plan/tasks e SKILL concordam. Tarefa mista permanece inválida. Teste de vários ACs valida DONE e promoção, rejeita prova ausente/AC trocado/review não independente; matriz mista negativa já existente continua verde. |
| Review09-02 | Corrigido e verificado por revisão semântica | validator diferencia rastreabilidade executável e a conferência da matriz NA normativa, exige classificação, prova atual e validator canônico. Não afirma execução de suíte vazia. Regras locais de state mantêm gates e review obrigatórios; testes normativos e negativos passaram. |
| Review09-03 | Corrigido e verificado por revisão semântica | Diagrama inclui RED_CHECK → DOC para classificação NA, DOC → REVIEW independente e REVIEW → VALIDATE para artefatos normativos atuais; fluxo comportamental mantém REVIEW → DOC. A instrução de classificação anterior em test-author foi preservada. Não se testa frase literal. |
| Review09-04 | Corrigido e verificado semanticamente pelo consumidor | Exemplo de schema agora separa tarefa T-001 behavioral de T-002 normative, com links inversos e globs próprios. JSON extraído e parseado, suas duas matrizes passaram em validateCriteriaMatrix real e links AC/tarefa/globs foram conferidos. |
| Review09-05 | Corrigido e verificado localmente | CLI normaliza contextPath absoluto relativo à raiz pelo mesmo processo do report, conservando confinement de readQualityContext/validateQualityReportFile. Novo teste aceita contexto absoluto interno em delivery, compara diagnóstico planning relativo/absoluto sem promover fixture delivery, rejeita absoluto externo e verifica bytes preservados. |
| Review07-02 | Corrigido e verificado por revisão semântica | T-013C é conferência normativa executável separada após T-013B: receipt CONFIRMED fecha AC-001, PENDING_USER mantém aberto. Matriz spec, plan e tasks incluem owner/dependência/globs; não há dependência pre-release da confirmação pós-release nem assignment misto AC-001/AC-016. Não se publicou nem reexecutou histórico. |
| Review07-03 | Corrigido e verificado por revisão semântica | AC-005 e instruções atuais em plan/tasks exigem RED contratual antes da prova atual de primitive aplicável e essa prova antes do GREEN dependente. LAB não aprova host/transação. Registro de changelog histórico permanece como histórico; nenhuma evidência de execução foi inventada. |
| Review07-04 | Corrigido e verificado por revisão semântica | NOTICE tem escritor único T-006; T-005 apenas lê/distribui e sua prova NOTICE espera o resultado de T-006. Demais caminhos disjuntos conservam paralelismo. Tarefas históricas não foram reabertas/executadas. |
| Review10-01 | Corrigido e verificado por revisão semântica | Perfil, comprehension-review e entrypoint exigem COMPLETE válido com identidade/fontes/conteúdo observado; INCOMPLETE ou leitura sem conteúdo/recibo válido bloqueia dependentes, preserva retorno bruto e não promove por sucesso de transporte. Solução mantém natureza instrucional de alignment e não cria framework novo. |
| Review10-02 | Corrigido e verificado por revisão semântica | Entry point e routing exigem identidade/request/run, pergunta/texto NFC e rodada exatos da fronteira selada. ID inédito é necessário mas insuficiente; perguntas downstream/inventadas/substituídas bloqueiam antes da escrita. Respostas em lote e parciais conservam histórico/fronteira. |
| Review10-03 | Corrigido e verificado por revisão semântica | Delegação requirements-reader exige descoberta de perfil/schema, finalidade/critérios, run/revisão/context_digest e fontes path/hash atuais, correlação observada de instância/dispatch/job e retorno bruto. Somente campos realmente disponíveis são enviados; schema não exposto não vira structured ou sandbox presumido. |

## Execuções observadas

- `node node_modules/vitest/vitest.mjs run scripts/state-evolution.test.mjs`:
  34 testes passaram; smoke representativo antes de ampliar a execução afetada.
- `node node_modules/vitest/vitest.mjs run scripts/tdd-state.test.mjs scripts/execution.test.mjs scripts/state-evolution.test.mjs`:
  3 arquivos e 208 testes passaram, duração 512 ms no resultado observado.
- `node node_modules/vitest/vitest.mjs run scripts/ship-quality-cli.test.mjs`:
  33 testes passaram, duração 7.03 s no resultado observado, antes da transferência
  de ownership do arquivo ao integrador para a regressão quality complementar.
- Uma execução anterior do novo caso CLI falhou porque a fixture delivery foi
  usada como aprovação planning. A fixture foi corrigida: planning conserva seu
  diagnóstico real e compara igualdade entre paths relativo/absoluto. Nenhuma
  regra de validação foi relaxada para obter verde.
- Extração ad hoc do JSON de schema 2.3 de SKILL, JSON.parse,
  validateCriteriaMatrix para as duas tarefas e assert de links inversos e globs:
  `Document sample semantic validation: 2 separated tasks, criterion matrices
  and inverse links valid; exclusive write globs.`
- `git diff --check` limitado aos arquivos de ownership E: sem erro de whitespace.
  Avisos Git LF/CRLF são conversão de working tree, não resultado de teste.

## Limites da evidência

Alignment é instrução para o coordenador, não módulo de execução do pacote.
Conferência semântica de suas instruções resolve estes apontamentos documentais;
não se alegou teste Native nem se adicionou teste que compara frases literais.
Revisão independente da integração, suíte final por OS e contratos OMP reais
continuam pertencendo às ondas posteriores do plano, sem PASS antecipado.
