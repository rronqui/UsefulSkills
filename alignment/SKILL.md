---
name: alignment
description: Alinhamento de entendimento antes de implementar — entrevista o usuário em rodadas (árvore de decisões, fronteira de perguntas) até não restar suposição silenciosa; fatos são buscados pelo agente, decisões são do usuário. Use como etapa do fluxo ship antes do roteamento da implementação, ou quando o usuário quiser estressar um plano, ideia ou decisão.
---

# alignment — entrevista de alinhamento

Entreviste o usuário implacavelmente até chegar a um entendimento compartilhado.
Mapeie a conversa como uma **árvore de decisões**: cada decisão se ramifica nas
decisões que dependem dela.

Trabalhe a árvore em **rodadas**. A **fronteira** é o conjunto de decisões cujos
pré-requisitos já estão resolvidos — as perguntas que podem ser feitas AGORA, sem
supor respostas ainda não ouvidas. Faça TODA a fronteira em uma rodada: numere cada
pergunta e dê sua resposta recomendada. Aguarde as respostas do usuário antes da
próxima rodada.

Formato de cada pergunta:

```
❓ **Q1** - **<título da pergunta>**: <corpo; pode ter múltiplos parágrafos e opções>

➡️ <sua resposta recomendada>
```

Cada rodada de respostas remodela a árvore — decisões fechadas empurram a fronteira
para fora e desbloqueiam perguntas que dependiam delas. Recalcule a fronteira e faça
a próxima rodada. Pergunta cuja resposta depende de outra ainda em aberto pertence a
uma rodada POSTERIOR, não à atual.

**Fatos são trabalho seu, nunca do usuário.** Se uma pergunta da fronteira precisa
de um fato do ambiente (arquivos, código, ferramentas), descubra você mesmo
(`read`/`grep`/`glob`, ou sub-agente `scout` via `task`) — não pergunte ao usuário
nada que você possa descobrir sozinho. Não bloqueie: uma exploração em andamento é
um pré-requisito não resolvido; apenas as perguntas downstream dela esperam — o
resto da fronteira é perguntado agora. As **decisões** são do usuário — apresente
cada uma e aguarde.

**Proporcionalidade** (quando invocado pelo protocolo da skill ship):
- Mudança trivial (docs, texto, config, cosmético): uma rodada rápida de confirmação
  (até 3 perguntas). Sem perguntas abertas → declare "alinhamento fechado: nenhuma
  pergunta aberta" e siga.
- Mudança comportamental: rode até a fronteira esvaziar.
- Pedido já totalmente especificado (issue com critérios de aceite completos,
  instrução exata do usuário): declare explicitamente o fechamento rápido COM o
  motivo — nunca pule em silêncio.

A sessão termina quando a fronteira está vazia: todo ramo da árvore de decisões
visitado, nada assumido em silêncio. Não aja sobre o resultado até o usuário
confirmar que o entendimento compartilhado foi alcançado. Quando invocada pelo
protocolo da skill ship, a confirmação ocorre na própria entrevista: cada rodada
fecha decisões COM o usuário, e a declaração de fechamento (fronteira vazia) é o
sinal para prosseguir ao roteamento.
