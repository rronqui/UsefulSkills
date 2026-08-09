# Interface Contract: specs001-ship-p2-fixes

> **Versão:** NA
> **Status:** NA
> **Motivo:** As três correções são internas ao motor Ship, às regras documentais de estado do TDD orchestrator e ao redactor AWK do template HITL. Não existe fronteira nova ou alterada de front-end, back-end, API, persistência ou troca de dados que exija schema versionado.

## Escopo

NA. Este contrato registra explicitamente que `specs001-ship-p2-fixes` não altera uma interface pública ou um payload entre componentes. Os detalhes comportamentais permanecem nos critérios de aceite de [spec.md](../spec.md) e no plano em [plan.md](../plan.md).

## Schemas

NA — nenhum request ou response é criado ou alterado.

## Erros

NA — não há catálogo novo de erros de interface. Os comportamentos de retry, estado de revisão e redaction são cobertos diretamente por AC-001, AC-002 e AC-003.

## Estados de UI

NA — a feature não possui fronteira de UI nem altera estados apresentados ao usuário.

## Changelog

| Versão | Data | Mudança |
|---|---|---|
| NA | 2026-08-09 | Contrato não aplicável; correções exclusivamente internas, sem fronteira de interface. |
