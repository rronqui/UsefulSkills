# Spec: specs001-ship-p2-fixes

> **Feature:** `specs001-ship-p2-fixes`
> **Status:** Approved
> **Autor:** spec-kit-author
> **Implementação:** Concluída; peer review aprovado sem achados P0–P3
> **Data:** 2026-08-09

## Contexto

Esta feature documenta três correções independentes classificadas como P2 no fluxo Ship. São correções internas, sem alteração de fronteira de interface: (1) tornar idempotente a retomada do comando `ship` quando `--body-file` contém somente espaço em branco; (2) normalizar integralmente o estado de uma tarefa ao migrar ou retomar `RED_REVISION`; e (3) corrigir o redactor AWK do loop HITL para reconhecer o fechamento de backticks aninhados quando a linha de fechamento possui whitespace final, sem manter o redaction state em linhas normais.

## Requisitos Funcionais

- **RF-001:** Em `ship/bin/ship.mjs`, o caminho de retry com `--body-file` deve tratar conteúdo vazio ou composto apenas por whitespace como ausência de conteúdo adicional. Uma tentativa repetida não deve editar novamente o corpo de um PR existente.
- **RF-002:** Em `tdd-orchestrator/SKILL.md`, toda migração ou retomada para `RED_REVISION` deve limpar conjuntamente `red.revision_delta`, `red.failing_tests` e `red.failure_reason_expected`, mantendo a regra de revisão distinguível do reset de RED inicial.
- **RF-003:** Em `bug-diagnosis/scripts/hitl-loop.template.sh`, o redactor AWK deve fechar o estado de backtick aninhado em uma linha delimitadora que contenha whitespace final e deve deixar linhas normais posteriores sem redaction indevido.

## Critérios de Aceite

- **AC-001:** Dado um retry de `ship` com `--body-file` cujo conteúdo, após normalização, é vazio ou somente whitespace, o comando não chama a edição do PR existente nem acrescenta separadores repetidamente; executar o mesmo retry novamente mantém o corpo do PR inalterado.
- **AC-002:** Ao migrar ou retomar uma tarefa em `RED_REVISION`, o estado resultante contém `red.revision_delta` limpo e, na mesma transição, `red.failing_tests` vazio e `red.failure_reason_expected` falso; nenhum desses três campos permanece com evidência da tentativa anterior.
- **AC-003:** Quando um valor de backtick aninhado termina em linha com whitespace final, o redactor AWK reconhece o fechamento, continua redigindo apenas o conteúdo sensível até esse delimitador e deixa uma linha normal subsequente visível; o fechamento não provoca sobre-redação de linhas normais.

## Fora de Escopo

- Alterar o contrato de APIs, payloads de front/back, persistência ou qualquer outra fronteira de dados.
- Alterar outros comportamentos de retry do `ship`, outros campos de estado além dos três explicitamente citados em AC-002 ou outros delimitadores do redactor.
- Criar ou alterar testes, `progress.json` ou `progress.md` nesta entrega documental.
- Executar validação ampla, formatter, linter ou build do projeto.

## Referências

- [Implementação do Ship](../../ship/bin/ship.mjs)
- [Regras do TDD orchestrator](../../tdd-orchestrator/SKILL.md)
- [Template do loop HITL](../../bug-diagnosis/scripts/hitl-loop.template.sh)
- [Plano](./plan.md)
- [Tarefas](./tasks.md)
- [Contrato de interface](./contracts/interface-contract.md) — NA, pois não há fronteira de interface.
