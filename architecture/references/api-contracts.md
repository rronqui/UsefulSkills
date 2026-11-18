# Contratos de API e interfaces

Leia ao criar/alterar fronteira pública ou persistida. Use o interface-contract
vigente; proposta e implementação não formam duas specs concorrentes. O autor
documental registra o contrato antes dos consumidores sensíveis.

Descreva input/output, obrigatórios/opcionais, ausente versus null, limites,
erros estáveis, autorização por objeto/tenant, efeitos, ordenação, paginação,
idempotência, concorrência, compatibilidade e depreciação pertinentes. Convenção
de nomes deve seguir o projeto, não um padrão universal. Campo opcional novo
também pode alterar consumidor estrito: verifique quem lê, despacha e persiste.

Valide fronteiras de confiança reais, incluindo respostas externas, dados
legados, configuração e passagem entre tenants. Tipo estático ou dado de banco
não autentica origem. Trace variantes até switch/router/filtro/handler consumidor
fora do diff; catch-all que descarta silenciosamente é comportamento observável.

Para efeitos reexecutáveis, defina identidade da intenção estável entre tentativas,
claim atômico com unicidade, hash de payload, resposta a duplicata em andamento,
retenção suficiente para redelivery e reconciliação de resultado desconhecido.
Check-then-act não é exclusão. Timeout não significa efeito não aplicado. Não
repetir efeito externo antes de saber o estado ou ter idempotência demonstrada.

Compare adição, migração compatível e quebra explícita. Expansão → backfill →
troca de consumidores → contração pode preservar usuários; registre rollback
e ponto em que reversão deixa de ser segura. Não remover funcionalidade por
conveniência nem inferir versão/assinatura a partir de pseudocódigo.

Validação: exemplos normais/limites/erros, consumidor antigo e novo, serialização,
dados históricos e falha parcial. API proposta é diferente de contrato executado.
TDD implementa, deep-review revisa. [Origem](../SOURCE.md).
