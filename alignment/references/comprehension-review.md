# Compreensão independente antes da implementação

Gatilho: tarefa complexa dependente de conversa longa, passagem a outro executor,
pressuposto material ou ambiguidade de interpretação. Pedido pequeno, completo
e de baixo risco mantém fast-close. Reutilize documento canônico existente com
objetivo, estado atual pertinente, limites, critérios e decisões; falta de texto
não significa falta de decisão do usuário.

Use [contexto novo e índice compartilhado](../../deep-review/references/fresh-review.md).
O papel [requirements-reader](../agents/requirements-reader.md) lê somente as
fontes documentais explícitas e definições ligadas. Recebe revisão, hashes,
run/contexto/finalidade/critérios; não recebe a conversa nem a resposta esperada.
Task genérico pode atender assignment equivalente comprovado; não há filho
obrigatório para trabalho simples. Nenhum leitor escreve especificação ou estado.

Exija paráfrase do que será entregue e do estado atual descrito (ou diga que
não está descrito/não importa), sucesso ligado a critérios, cenário normal e
limite/erro pertinentes, pressupostos e ambiguidades com fonte/impacto. Termos
comuns de engenharia não exigem glossário artificial. COMPLETE significa leitura
suficiente, nunca aprovação de código/spec. Lacuna material é INCOMPLETE.
Antes de consumir o retorno, confira o envelope completo e o conteúdo real:
`protocol`, papel, instance/run, revisão, context_digest e fontes path/sha256
devem corresponder ao assignment e às fontes efetivamente observadas. Leitura
sem conteúdo observado ou recibo válido, schema inválido, metadados divergentes
ou status INCOMPLETE bloqueiam a promoção dos dependentes; sucesso do transporte
não supre essas condições. Preserve retorno bruto e diagnóstico sem reclassificar
INCOMPLETE. Só um novo COMPLETE válido e atual pode resolver a pendência.

O coordenador compara o retorno com intenção documentada. Divergência não faz o
leitor estar certo automaticamente. O autor documental corrige texto com
decisões existentes; só intenção realmente aberta volta ao usuário. Preserve
retorno bruto e decisão no índice único; não repita paráfrase equivalente na
crítica de arquitetura. Se independência for aceite obrigatório e não houver
leitor/prova suficiente, bloqueie somente dependentes, seguindo frentes livres.
