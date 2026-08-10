---
name: alignment
description: Alinhamento de entendimento antes de implementar — entrevista o usuário em rodadas (árvore de decisões, fronteira de perguntas) até não restar suposição silenciosa; fatos são buscados pelo agente, decisões são do usuário. Use como etapa do fluxo ship antes do roteamento da implementação, ou quando o usuário quiser estressar um plano, ideia ou decisão.
---

# alignment — checkpoint obrigatório de entendimento

Todo pedido comportamental deve passar pelo checkpoint de alignment (alinhamento);
todo pedido de correção deve passar pelo checkpoint de alignment (alinhamento).
Qualquer pedido deve passar pelo alignment antes do roteamento para implementação.

## Árvore de decisões e fronteira

Entreviste o usuário em rodadas até chegar a um entendimento compartilhado.
Mapeie a conversa como uma árvore de decisões: cada decisão se ramifica nas
decisões que dependem dela. A fronteira é o conjunto de decisões cujos
pré-requisitos já estão resolvidos; faça toda a fronteira de uma rodada, sem
perguntar decisões downstream antes da resposta upstream.

Use o formato:

```
❓ **Q1** - **<título da pergunta>**: <corpo>

➡️ <sua resposta recomendada>
```

Fatos do ambiente são trabalho do agente (`read`/`grep`/`glob` ou `scout`), não
perguntas ao usuário. Decisões são do usuário e devem ser apresentadas. Recalcule
a fronteira a cada rodada; a sessão só termina quando todos os ramos foram
visitados e não resta suposição silenciosa.

## Fechamento rápido e checkpoint registrado

Quando o pedido já está totalmente especificado, faça o fast-close em uma rodada,
sem criar perguntas artificiais, mas registre e persista explicitamente o
fechamento da entrevista e o checkpoint `alignment`; use o marcador
`fully-specified-fast-close`:

```json
{
  "checkpoint": "alignment",
  "frontier": [],
  "closure": "fully-specified-fast-close",
  "closureRecorded": true,
  "status": "CLOSED"
}
```

Declare: **alinhamento fechado: nenhuma pergunta aberta**. A fronteira vazia e
esse registro são a prova durável de que o alignment ocorreu; nunca pule esse
fechamento em silêncio, mesmo em uma solicitação completa.

Quando existir qualquer pergunta sem resposta, a fronteira não está vazia:
**pergunta sem resposta mantém status `BLOCKED` e não roteia**. Não execute,
implemente ou declare sucesso até a decisão do usuário; nunca pule o checkpoint
silenciosamente (never skip silently).

## Proporcionalidade e confirmação

Para mudança trivial, use uma rodada rápida de confirmação (até três perguntas).
Para mudança comportamental ou correção, repita as rodadas até a fronteira esvaziar.
Após cada rodada, confirme o entendimento compartilhado. Fora do fluxo `ship`,
não aja sobre o resultado até essa confirmação; no fluxo `ship`, a confirmação da
própria entrevista e o checkpoint registrado autorizam o roteamento.
