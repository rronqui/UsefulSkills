# Dois eixos de revisão

Fixe conteúdo/revisão e inventário pertinente, incluindo staged/unstaged/untracked
quando fizerem parte do modo. Preserve patch remoto fixado em PR e contexto local
nos modos locais. Consulte [contexto novo](fresh-review.md) e política comum.

Técnica cobre comportamento, regressões, segurança e despacho dos consumidores.
Requisitos confronta cada critério aplicável com contrato/código/teste/documento.
É necessária quando há aceites verificáveis ou conformidade pedida; pedido só
técnico sem spec aplicável admite NA fundamentado antes da agregação. Spec
obrigatória ausente/contraditória deixa conformidade NÃO VERIFICADA.

Cada eixo tem conjunto imutável próprio de assignments e IDs de instância únicos
por run/eixo/rodada. Dentro do eixo, propriedade de arquivos é disjunta e cobre
o inventário; entre eixos, sobreposição é legítima. Use mesma reviewed_revision.
Agent é tipo; name/ID é instância. Não misture eixos no mesmo agregador.

Use aggregateReviewInstances separadamente por eixo e conserve aggregateReview
legado. Envelopes originais DEEP_REVIEW/DEEP_REVIEW_FALLBACK continuam intactos;
eixo, índice e matriz ficam fora deles. Conjunto exato: cada ID esperado tem um
retorno terminal único, fonte/revisão/protocolo válidos. Faltante/duplicado/stale
ou falha não é PASS. Lançamento/job criado não é resultado.

Na matriz do eixo requisitos, registre AC | regra aprovada | código/contrato |
teste/prova e revisão | CORRESPONDE/DIVERGE/NÃO VERIFICADO | achado de origem.
Teste presente não significa executado. Achado traz critério e impacto concreto;
preferência de estilo ou sugestão arquitetural não vira P0/P1.

Consolidação só completa com todos eixos necessários atuais e aprovados,
cobertura e matriz conferidas, sem critério obrigatório não verificado. P0/P1 de
qualquer eixo bloqueia; P2/P3 são preservados. Gate de onda TDD tem contrato mais
estrito: não apagar achados para caber nele. Segurança nativa usa
[parecer auxiliar](native-security.md), sem falsificar retorno de reviewer local.
