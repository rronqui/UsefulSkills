# Especificação, implementação e provas

Na validação de funcionalidade complexa com spec aprovada, mudança material ou
comparação pedida, use a última fonte aprovada e decisões posteriores autorizadas.
Sem revisão identificável da spec, registre limite; não invente regra nem certifique
correspondência. Use [contexto novo/reuso](../../deep-review/references/fresh-review.md).

No artefato do validator existente, mantenha AC | regra aprovada | código/contrato
observado | teste/prova e revisão | CORRESPONDE/DIVERGE/NÃO VERIFICADO | achado.
Leia símbolos e consumidores pertinentes. Diferença interna sem exigência não é
defeito. Ligue cenários normais/limites/falhas; código lido não é teste executado.
Quando só estática, diga “por leitura” e mantenha runtime não verificado. Teste
verde sem vínculo ao critério não prova cobertura.

Reutilize prova válida equivalente; se faltar só uma lacuna, revisão independente
cobre a lacuna em vez de repetir o conjunto. Discrepância aponta achado original
e responsável; erro de spec e erro de código têm encaminhamentos distintos.
Matriz complementa gates/rodada requisitos, não converte texto em aprovação TDD.
