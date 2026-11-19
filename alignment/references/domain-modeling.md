# Domínio, contextos e decisões duráveis

Use quando um termo muda um critério ou regra e as fontes lhe dão sentidos
conflitantes. Não criar glossário para toda conversa. Leia glossário/mapa/ADRs
existentes; compare especificação, exemplos autorizados e código. O código atual
mostra o que acontece, não prova o que deveria acontecer.

Separe fato confirmado, hipótese e decisão aberta. Resolva a partir das fontes
antes de perguntar. Registre conceito, definição curta, contexto, sinônimos
ambíguos, distinção concreta, fonte e critério afetado. Um termo pode ter sentidos
válidos em contextos diferentes; explicite a tradução na fronteira. Não misture
detalhe técnico com conceito de negócio nem renomeie código implicitamente.

Exemplo hipotético: no contexto cobrança, fatura representa valor devido;
pagamento representa liquidação. Cancelar fatura pode ou não estornar pagamento:
isso exige uma regra explícita com cenário normal e limite, não inferência pelo
nome de uma tabela. Use a definição para critérios/testes do fluxo em andamento.

Atualize documento existente somente quando autorizado. Na ausência de padrão e
havendo conceitos resolvidos, proponha GLOSSARY.md; contextos podem ter glossários
locais com índice único. Sem regra resolvida, entregue proposta/pendência.

ADR só para escolha real custosa de reverter ou surpreendente sem contexto.
Em docs/adr, confirme próximo número e um escritor antes da gravação. Registre
título concreto, estado proposta|aceita|substituída|descontinuada, contexto,
decisão, razão, alternativa relevante, consequência não óbvia e fonte da decisão.
Não sobrescreva história para esconder correção de entendimento. Alignment
continua dono do objetivo; architecture decide fronteiras; spec-kit-author
registra na fonte canônica. [Origem e licenças](../SOURCE.md).
