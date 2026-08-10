---
name: alignment
description: Alinhamento de entendimento antes de implementar — entrevista o usuário em rodadas (árvore de decisões, fronteira de perguntas) até não restar suposição silenciosa; fatos são buscados pelo agente, decisões são do usuário. Use como etapa do fluxo ship antes do roteamento da implementação, ou quando o usuário quiser estressar um plano, ideia ou decisão.
---

# alignment — checkpoint obrigatório de entendimento

Todo pedido, seja comportamental, de correção ou outro, deve passar pelo
checkpoint de alignment antes do roteamento para implementação.

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
`fully-specified-fast-close`. O exemplo abaixo é um modelo: o `request_id` é
substituído por um UUID novo em cada solicitação e nunca é uma fixture fixa.

```json
{
  "checkpoint": "alignment",
  "request_id": "<UUID-v4 gerado para esta solicitação>",
  "request_canonical": "{\"kind\":\"correction\",\"questions\":[],\"responses\":[],\"specified\":true}",
  "request_digest": "sha256:22281a419ad913bba69b7def708a0e1d626cb6998c979424e40c923a6fc9f153",
  "frontier": [],
  "closure": "fully-specified-fast-close",
  "responses": [],
  "closureRecorded": true,
  "status": "CLOSED"
}
```

`request_id` é gerado no início de cada solicitação com um gerador
criptograficamente forte (`crypto.randomUUID()` ou equivalente), validado como
UUID v4 e persistido no mesmo snapshot. Nunca derive o ID de uma fixture, de um
contador local ou de `request_canonical`; duas solicitações distintas recebem
IDs distintos e o mesmo ID é mantido somente ao retomar aquela solicitação.

`request_canonical` é o conteúdo efetivamente resumido pelo digest. A
canonicalização é determinística e deve seguir exatamente estas regras:

* normalize cada string, inclusive nomes de chaves, para NFC; ordene chaves de
  objetos pelo ponto de código Unicode (não pela localidade), rejeitando
  colisões após a normalização; preserve a ordem dos arrays;
* escape somente conforme JSON UTF-8: aspas, barra invertida e U+0000–U+001F
  usam os escapes JSON canônicos (`\"`, `\\`, `\b`, `\t`, `\n`, `\f`, `\r` ou
  `\u00xx` minúsculo); caracteres não ASCII permanecem em UTF-8 e não há
  espaços ou quebras de linha entre tokens;
* aceite somente números JSON finitos; normalize `-0` para `0` e use a menor
  representação decimal que faça round-trip para o mesmo IEEE-754 binary64,
  sem zeros à esquerda, zeros finais ou variações de expoente (expoente `e`,
  sinal apenas quando negativo e sem zeros à esquerda). `NaN`, `Infinity` e
  `-Infinity` são inválidos;
* use os literais JSON `true`, `false` e `null`, sem conversões dependentes de
  locale ou do runtime.

O digest é `SHA-256` dos bytes UTF-8 de `request_canonical`, codificado em
hexadecimal minúsculo e prefixado por `sha256:`. O snapshot deve persistir o
canonical e o digest junto de `request_id`; nunca aceite um digest fornecido
pelo chamador sem reconstruir o canonical atual e comparar o SHA-256 calculado.

Antes de persistir, resolva o Git real a partir da raiz do worktree:
execute `git rev-parse --show-toplevel` e então `git rev-parse --git-common-dir`
com esse `cwd`. Resolva um resultado relativo contra a raiz retornada; se o
resultado for absoluto, use-o diretamente. Valide que o diretório comum é um
diretório real e derive exclusivamente dele o destino
`path.join(commonDir, "ship-alignment.json")`. Se o arquivo `.git` contiver
`gitdir: ...` (linked worktree), siga essa referência para localizar a raiz e o
diretório Git comum; o arquivo `.git` textual nunca é o destino do snapshot.
Não use `git rev-parse --git-path ship-alignment.json`, não siga um `.git` de
worktree como destino privado; nunca `path.join(cwd, ".git", ...)` calculado sem
resolver. Só depois dessa resolução grave o snapshot de forma atômica no destino
comum.

`request_id` e `request_digest` são obrigatórios, persistidos no mesmo snapshot e
validados contra o contexto atual. Ausência, alteração, formato inválido ou
divergência de qualquer um deles mantém `status: "BLOCKED"` e o erro
`E_ALIGNMENT_BLOCKED`; nunca se aceita um digest fornecido pelo chamador sem
recalculá-lo sobre o pedido atual.



As respostas coletadas, inclusive a lista vazia no fast-close, são persistidas no
mesmo checkpoint `CLOSED`; não trate respostas como estado transitório. O
registro canônico deve ser escrito/atualizado no estado durável resolvido acima
antes de qualquer roteamento. Cada item de `responses` tem a forma canônica
exata:

```ts
type AlignmentResponse = {
  round: number;       // inteiro finito >= 1
  question_id: string; // NFC e não vazio
  question: string;    // NFC e não vazio
  answer: string;      // NFC e não vazio
};
```

Valide tipo, `round` inteiro >= 1 e as três strings não vazias antes de aceitar
uma resposta. Ao retomar, a nova rodada deve ser estritamente posterior à última
rodada persistida e seu `question_id` não pode já existir no histórico. Qualquer
resposta ausente, vazia, fora de ordem, duplicada ou inválida mantém `status:
"BLOCKED"`, retorna `E_ALIGNMENT_BLOCKED` e deixa o histórico durável intacto;
nunca aceite nem descarte uma resposta silenciosamente.

`responses` é a sequência ordenada das respostas efetivamente dadas pelo usuário,
preservando conteúdo, pergunta e rodada; `[]` só é correto quando não houve
pergunta no fast-close. O checkpoint atual permanece compatível porque conserva
`checkpoint`, `frontier`, `closure`, `closureRecorded`, `status` e `responses`;
os campos de identidade acima são aditivos, mas obrigatórios para persistir ou
retomar um snapshot válido.

Um registro `CLOSED` com `fully-specified-fast-close` é retomável e auditável:
`resume` deve ler esse mesmo arquivo, validar `checkpoint`, `request_id`,
`request_digest`, `request_canonical`, `frontier`, `closure`,
`closureRecorded`, `status` e todo o histórico `responses`, incluindo a forma
canônica de cada item, e continuar a partir do estado persistido sem
reentrevistar nem inferir uma resposta. A auditoria deve conseguir reconstruir
as rodadas e respostas a partir do registro.

Ao aceitar uma nova resposta durante `resume`, crie
`nextResponses = [...persisted.responses, newResponse]`; nunca substitua a lista
pela resposta nova. Reconstrua `request_canonical` com o pedido completo e esse
histórico, calcule novamente o SHA-256 dos bytes UTF-8 e atualize
`request_digest` no mesmo snapshot, de forma atômica, antes de continuar. O
canonical e o SHA antigos só podem ser substituídos pelo par correspondente ao
histórico completo; falha de leitura, validação ou gravação mantém o histórico
anterior e retorna `E_ALIGNMENT_BLOCKED`. Novas rodadas acrescentam respostas
sem apagar as anteriores, e nenhuma resposta pode ser inferida, omitida ou
descartada silenciosamente.

Se o registro, a fronteira, a identidade/digest, o canonical ou qualquer
resposta estiver ausente, inconsistente ou não puder ser lido, mantenha
`status: "BLOCKED"` e o erro `E_ALIGNMENT_BLOCKED`; nunca promova
silenciosamente para `CLOSED`.

Ao encerrar, confirme que o snapshot durável foi gravado e declare:
**alinhamento fechado: nenhuma pergunta aberta**. Esse fechamento e as
respostas persistidas são a prova de auditoria e o ponto de retomada.

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
