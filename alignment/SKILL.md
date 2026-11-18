---
name: alignment
description: Alinhar objetivo, aceites, limites e rota antes de mudar software/configuração; reutilizar decisões e usar fast-close no pedido completo. Use também para estressar um plano; perguntas só sobre decisões materiais abertas.
---

# alignment — checkpoint obrigatório de entendimento

Antes de persistir/rotear, leia [rota e persistência](references/routing-and-persistence.md).
Essa referência é normativa para a separação de modo, identidade, namespace,
sequência imutável e handoff; não há checkpoint singleton nem destino implícito.
Conserve canonicalização, digest, identidade, histórico, fronteira, fechamento,
respostas e bloqueios do protocolo.
Para complexidade/passagem/pressuposto material, use [compreensão](references/comprehension-review.md)
com [requirements-reader](agents/requirements-reader.md): quando essa leitura
independente for necessária, delegue pela mesma ferramenta nativa `task`, com
`agent: "requirements-reader"`, fontes/revisão e critérios explícitos; recolha
o resultado antes de fechar o entendimento. O leitor não entrevista o usuário,
escreve a spec ou aprova código. Reutilize prova atual equivalente; pedido simples
completo usa fast-close sem filho obrigatório.
Leia [domínio](references/domain-modeling.md) só com ambiguidade conceitual e
[escrita para agentes](references/writing-for-agents.md) para instruções.
[Modelos/runtime](../tdd-orchestrator/references/omp-runtime.md) devem ser verificados
antes de nova sessão/rota. [Origem/licenças](SOURCE.md).

## Saída para qualidade

Ao fechar o entendimento, entregue ao fluxo chamador o impacto funcional, os
documentos afetados, dados/permissões/exposição e a classificação de risco com
justificativa. Consulte a fonte única
`skill://tdd-orchestrator/references/quality-policy.md`, resolvendo a localização
real da skill no OMP. Essa análise alimenta o checkpoint existente; não cria
entrevista ou orquestrador adicional. Informação já fornecida pelo usuário ou
confirmada no projeto deve ser reutilizada. Especialistas opcionais são usados
apenas quando pertinentes e disponíveis no runtime.

Antes de implementar, registre entendimento proporcional; pedido completo
usa fast-close e tarefas sem implementação não iniciam pipeline por formalidade.
Todo pedido comportamental passa pelo checkpoint de alinhamento antes da implementação.
Todo pedido de correção passa pelo checkpoint de alinhamento antes da implementação.
Qualquer solicitação de mudança de software deve passar por alignment, reutilizando
o entendimento já confirmado e usando fast-close quando estiver completo.

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
a fronteira a cada rodada; o fechamento exige resolver os ramos materiais aplicáveis, sem perguntar
decisões já documentadas nem expandir escopo por formalidade.

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
  "run_id": "<UUID-v4 desta execução>",
  "request_canonical": "{\"kind\":\"correction\",\"questions\":[],\"responses\":[],\"specified\":true}",
  "request_digest": "sha256:22281a419ad913bba69b7def708a0e1d626cb6998c979424e40c923a6fc9f153",
  "frontier": [],
  "closure": "fully-specified-fast-close",
  "responses": [],
  "closureRecorded": true,
  "status": "CLOSED",
  "mode": "local",
  "requested_mode": "local",
  "resolved_mode": "local",
  "route": "short",
  "reason": "mudança localizada, reversível e de baixo risco"
}
```

`request_id` e `run_id` são identidades independentes. Gere ambos com fonte
criptograficamente forte (`crypto.randomUUID()` ou equivalente), valide UUID v4
e persista-os no mesmo registro. O namespace MUST conter os dois IDs canônicos,
além da raiz/workspace, que é contexto e não identidade. Nunca derive ID de
fixture, contador ou `request_canonical`; solicitações independentes nunca
compartilham namespace nem sobrescrevem registros.

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
hexadecimal minúsculo e prefixado por `sha256:`. Recalcule-o sobre o pedido e o
histórico atuais antes de aceitar qualquer registro; nunca confie em digest
fornecido pelo chamador.

## Modo, resolução e namespace

Decida `local` ou `git` separadamente de `short` ou `full`. O registro persiste
`mode` como o modo resolvido e também `requested_mode`/`resolved_mode`, além de
`route` (`short` ou `full`) e `reason` não vazio. A resolução não pode ser
inferida do workspace ou transformada em Ship: local não inicializa Git, não
invoca Ship e não instala release-bootstrap.

Somente no modo Git, resolva o repositório real a partir da raiz do worktree:
execute `git rev-parse --show-toplevel` e depois `git rev-parse
--git-common-dir` com esse `cwd`. Resolva resultado relativo contra a raiz
retornada e resultado absoluto diretamente; valide que o diretório comum é um
diretório real. O `.git` textual de linked worktree é apenas uma referência:
jamais o use como destino e jamais calcule um caminho privado por `cwd/.git`.
Falha, ambiguidade ou contexto Git não comprovado bloqueia antes do handoff.

No modo local, use a raiz operacional já autorizada e confinada, por padrão
`.omp/state/alignment/<request_id>/<run_id>/`. No modo Git, use um namespace
equivalente ancorado exclusivamente no `git-common-dir` resolvido
(`<commonDir>/alignment/<request_id>/<run_id>/`); o workspace/worktree só
participa da resolução e validação. Não há nome de arquivo singleton nem
destino global compartilhado entre requests/runs.

## Sequência imutável e publicação

Cada namespace contém uma sequência append-only de registros selados, por
exemplo `checkpoint-000000.json`, `checkpoint-000001.json`, em que o sucessor
fixo referencia o caminho e o hash do pai imutável. O primeiro registro também
é criado por reserva exclusiva. Para publicar, abra o caminho sucessor esperado
com criação exclusiva real (`open` com flag documentada `wx`, ou primitiva
equivalente comprovada), escreva bytes completos, sincronize quando suportado,
feche e releia; uma única tentativa vence. Não use `lstat`/hash seguido de
rename como CAS, não substitua, não trunque e não remova registros selados.

Se o sucessor já existir, estiver parcial, ilegível, desconhecido ou não
corresponder exatamente ao pai/identidade esperados, bloqueie (`BLOCKED` /
`E_ALIGNMENT_BLOCKED`) sem clobber. Mesmo uma colisão aparentemente idêntica
não autoriza um segundo escritor a publicar: retome somente após validar o
registro já selado pelo caminho exato. Qualquer falha de exclusividade,
atomicidade, sincronização ou capacidade de provar a primitiva na plataforma
mantém o estado anterior e bloqueia antes de publicar handoff. Não alegue
proteção universal de corrida por `O_EXCL` convencional ou uma segunda leitura.
No Windows, fixe somente proteções de file descriptor documentadas e
comprovadas para o alvo; não invente flags.

O handoff só é emitido depois da releitura e validação do novo registro selado,
contendo o caminho exato, `sha256` dos bytes, `request_id`, `run_id`, raiz,
`mode`, `requested_mode`, `resolved_mode`, `route`, `reason`, `frontier`,
canonical/digest, `responses`/histórico, `closure`, `closureRecorded` e
`status`. Não faça rollback por pathname nem remova dado de terceiro; arquivo
parcial/órfão permanece e força bloqueio explícito.

`request_id` e `request_digest` são obrigatórios, persistidos no mesmo registro
e validados contra o contexto atual. Ausência, alteração, formato inválido ou
divergência mantém `status: "BLOCKED"` e retorna `E_ALIGNMENT_BLOCKED`.

As respostas coletadas, inclusive a lista vazia no fast-close, são persistidas
no registro selado; não trate respostas ou history como estado transitório.
Cada item de `responses` tem a forma canônica exata:

```ts
type AlignmentResponse = {
  round: number;       // inteiro finito >= 1
  question_id: string; // NFC e não vazio
  question: string;    // NFC e não vazio
  answer: string;      // NFC e não vazio
};
```

Valide tipo, `round` inteiro >= 1 e as três strings não vazias antes de aceitar
uma resposta. Ao retomar, a nova rodada deve ser estritamente posterior à
última rodada persistida e seu `question_id` não pode já existir no histórico.
Resposta ausente, vazia, fora de ordem, duplicada ou inválida mantém
`status: "BLOCKED"`, retorna `E_ALIGNMENT_BLOCKED` e deixa toda a sequência
durável intacta; nunca aceite nem descarte uma resposta silenciosamente.

`responses` é a sequência ordenada das respostas efetivamente dadas pelo
usuário, preservando conteúdo, pergunta e rodada; `[]` só é correto quando não
houve pergunta no fast-close. Preserve `checkpoint`, `request_id`, `run_id`,
`request_canonical`, `request_digest`, `frontier`, `closure`, `responses`,
`closureRecorded`, `status`, modo/rota/razão e o encadeamento de pais.

Um registro `CLOSED` com `fully-specified-fast-close` é retomável e auditável:
`resume` deve ler o caminho exato do handoff, validar a sequência de pais,
identidade, canonical/digest, fronteira, fechamento, status, modo/rota/razão e
todo o histórico `responses`, sem reentrevistar nem inferir resposta. Registro
stale, corrompido, parcial, de namespace legado ou de outro request/run bloqueia;
legado nunca é aceito como namespace novo e nunca é apagado automaticamente.

Ao aceitar nova resposta durante `resume`, crie
`nextResponses = [...persisted.responses, newResponse]`; nunca substitua a
lista. Reavalie a árvore com pedido completo e `nextResponses`, reconstrua
`frontier`, derive `closure`, `closureRecorded` e `status`, recalcule
canonical/digest e publique somente o sucessor exclusivo. Se qualquer decisão
material permanecer aberta, a fronteira deve ser não vazia, `status` deve ser
`BLOCKED` e não há roteamento, em `short` ou `full`. A complexidade/risco que
define `full` não cria uma decisão pendente nem impede fechamento: com todas
as decisões materiais resolvidas, a fronteira vazia permite `CLOSED`,
preservando `route: "full"`. Nunca use fast-close para ocultar decisão aberta.

Se o registro, a fronteira, a identidade/digest, o canonical ou qualquer
resposta estiver ausente, inconsistente ou não puder ser lido, mantenha
`status: "BLOCKED"` e `E_ALIGNMENT_BLOCKED`; nunca promova silenciosamente.

Ao encerrar, confirme que o registro imutável foi selado e declare:
**alinhamento fechado: nenhuma pergunta aberta**. Essa declaração só é válida
quando `frontier` está vazia e o handoff contém caminho e hash efetivamente
releídos; caso contrário, declare o bloqueio e preserve a prova.

Quando existir qualquer pergunta sem resposta, a fronteira não está vazia:
**pergunta sem resposta mantém status `BLOCKED` e não roteia**. Não execute,
implemente ou declare sucesso até a decisão do usuário; nunca pule o
checkpoint silenciosamente (never skip silently).

## Riscos residuais

Um filesystem/plataforma sem exclusividade, sincronização ou proteção de
descritor comprováveis bloqueia; `wx` não autoriza alegação universal de
corrida. Uma falha após a reserva deixa sucessor parcial/órfão que não pode ser
apagado e bloqueia novas publicações. Um checkpoint legado permanece como
histórico não migrado, e a resolução Git continua dependente do
`git-common-dir` real; nenhum desses casos pode ser contornado por local,
rename, unlink ou Ship implícito.

## Proporcionalidade e confirmação

Para mudança trivial completa, use fast-close sem perguntas ou confirmação artificial.
Para mudança comportamental ou correção, repita as rodadas até a fronteira esvaziar.
Após cada rodada necessária, registre o entendimento e as respostas reais.
Checkpoint fechado permite rotear escopo já autorizado, local ou Git; nova
confirmação só é necessária para decisão material ainda aberta.
