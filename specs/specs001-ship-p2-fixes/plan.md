# Plan: specs001-ship-p2-fixes

> **Feature:** `specs001-ship-p2-fixes`
> **Spec:** [spec.md](./spec.md)
> **Status:** Implementado/concluído; peer review aprovado sem achados P0–P3

## Arquitetura

A mudança é composta por três ajustes isolados, preservando as fronteiras e os formatos existentes:

1. **Retry do Ship:** no fluxo de publicação/retomada de `ship/bin/ship.mjs`, normalizar o conteúdo lido por `--body-file` antes de decidir se há complemento para o corpo. Conteúdo vazio ou branco não deve entrar no caminho de `gh pr edit`, tornando a operação idempotente.
2. **Estado de RED_REVISION:** alinhar as regras de migração e retomada documentadas em `tdd-orchestrator/SKILL.md`. A limpeza de `red.revision_delta` deve ocorrer junto com a limpeza dos indicadores de falha (`red.failing_tests` e `red.failure_reason_expected`), sem converter a revisão em um reset de RED inicial.
3. **Redactor HITL:** ajustar a detecção de delimitador de backtick no programa AWK embutido em `bug-diagnosis/scripts/hitl-loop.template.sh`. O reconhecimento deve tolerar whitespace final, encerrar o estado aninhado no ponto correto e preservar o processamento normal das linhas seguintes.

Não há novo componente, migração de dados, alteração de versão de contrato ou dependência externa. A validação deve ser direcionada aos três cenários dos critérios de aceite; a validação ampla está fora deste plano.

## Stack e Dependências

| Componente | Tecnologia | Justificativa |
|---|---|---|
| Retry do Ship | Node.js/ESM, `ship/bin/ship.mjs`, CLI `gh` já existente | Corrigir a decisão local que antecede a edição do corpo do PR, sem criar API nova. |
| Estado de revisão | Markdown normativo em `tdd-orchestrator/SKILL.md` | A regra de migração/retomada é consumida pelo orquestrador e deve descrever os três campos em conjunto. |
| Redactor | POSIX shell + AWK no template HITL | Preservar o mecanismo atual e corrigir somente o reconhecimento do fechamento aninhado. |

## Tarefas Derivadas

| ID | Descrição | AC | Dependências |
|---|---|---|---|
| T-001 | Ajustar a normalização/guarda de `--body-file` em `ship/bin/ship.mjs` para que conteúdo vazio ou branco não dispare edição repetida do corpo existente. | AC-001 | — |
| T-002 | Atualizar as regras de migração e retomada de `RED_REVISION` em `tdd-orchestrator/SKILL.md`, limpando `red.revision_delta`, `red.failing_tests` e `red.failure_reason_expected` na mesma transição. | AC-002 | — |
| T-003 | Ajustar o redactor AWK em `bug-diagnosis/scripts/hitl-loop.template.sh` para fechar backtick aninhado com whitespace final e liberar linhas normais subsequentes. | AC-003 | — |
| T-004 | Executar somente as verificações direcionadas da matriz abaixo e registrar evidência de cada AC; não alterar testes nem executar validação ampla. | AC-001, AC-002, AC-003 | T-001, T-002, T-003 |

## Matriz AC→teste

| AC | Teste/roteiro verificável | Evidência registrada | Resultado esperado |
|---|---|---|---|
| AC-001 | `ship/bin/ship.test.mjs` (3 testes direcionados). | Os três testes exercitam retry com `--body-file` vazio/branco e repetição sem edição do PR. | Zero edição do PR por conteúdo vazio/branco e corpo idêntico após as duas tentativas. |
| AC-002 | Inspeção normativa direcionada em `tdd-orchestrator/SKILL.md`, sem runtime/test seam. | Gate executável: NA, justificado porque AC-002 valida regra documental de transição de estado. | `red.revision_delta` limpo, `red.failing_tests` igual a `[]` e `red.failure_reason_expected` igual a `false`, simultaneamente. |
| AC-003 | `scripts/hitl-loop.test.mjs` (teste direcionado). | O teste cobre backtick aninhado com whitespace final, redaction do segredo e visibilidade da linha normal subsequente. | Segredo permanece redigido, estado aninhado é encerrado e a linha normal permanece na saída; nenhuma linha normal é sobre-redigida. |

Os nomes acima descrevem cenários de verificação; esta entrega não cria nem altera arquivos de teste.

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Uma guarda de conteúdo branco ser aplicada somente a um ramo do retry. | O PR ainda pode receber separadores ou edições repetidas em retomadas. | Testar a segunda execução no mesmo PR e verificar explicitamente a ausência de `gh pr edit`. |
| A documentação de `RED_REVISION` divergir entre migração, retomada e tratamento de falha. | Evidências antigas podem ser reutilizadas como se fossem da nova revisão. | Atualizar todas as instruções normativas que descrevem a entrada/retomada e conferir os três campos como conjunto. |
| O reconhecimento de whitespace final fechar um backtick no ponto errado. | Segredos podem vazar ou linhas normais podem ser redigidas em excesso. | Cobrir simultaneamente delimitador com trailing whitespace, conteúdo sensível posterior e linha normal visível. |
| Ausência de build configurado no manifesto. | Não há gate de build executável para esta entrega. | Registrar a verificação direcionada; não inventar um comando de build nem ampliar o escopo. |
