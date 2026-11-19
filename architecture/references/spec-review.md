# Crítica independente do desenho e prontidão

Acione para fronteira/API/estado/migração relevante, múltiplos consumidores,
falha parcial, recurso compartilhado ou contrato externo incerto. Não faça
crítica completa para mudança clara localizada. Reuse compreensão equivalente
do alignment; se só mudou desenho, não repita entrevista.

Fixe fonte canônica e revisão, objetivo, critérios, decisões, consumidores,
ambiente e recursos. Siga [contexto novo](../../deep-review/references/fresh-review.md).
Uma instância architect distinta da autora pode cobrir duas lentes proporcionais:

- Coerência: responsabilidades, invariantes, tipos/roteadores consumidores,
  dependências, segurança, recursos, falhas parciais e recuperação. Capacidade,
  quotas e desempenho desconhecidos ficam lacunas, sem números inventados.
- Prontidão: comportamento/erros explícitos, decisões materiais resolvidas,
  áreas e dependências, migração/reversão quando pertinentes e prova observável
  de cada critério. Não impor detalhes internos decidíveis na implementação.

Cada achado liga critério, fonte/localização, cenário, impacto e recomendação;
distinga hipótese de defeito demonstrado. Retorno ARCHITECTURE_ANALYSIS_V1 é
parecer/proposta, não APPROVED de código. Autor documental incorpora decisões
ao contrato único. Caller valida origem/equivalência e encaminha intenção aberta
ao usuário; limite de rodadas ou indisponibilidade não aceita risco. Mantenha
dependente incompleto e avance trabalho independente autorizado.
