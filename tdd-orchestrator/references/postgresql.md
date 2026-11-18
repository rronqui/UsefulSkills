# PostgreSQL confirmado

Use apenas PG real, inclusive fora da Supabase. Confirme versão, extensões,
provedor, esquema, volumes e problema observável. Serviços específicos da Supabase
não são propriedades de todo PostgreSQL; SQLite/Qdrant não recebem este guia.
Sem acesso autorizado, entregue hipótese/SQL proposto com limite explícito.

Migração examina consumidores antigos/novos, null/default, backfill, locks e
reversibilidade. Restrição protege invariantes; índice deve responder seletividade,
ordenação, plano e custo de escrita demonstrados. Índices de FK não são
automaticamente criados em todos os lados. Identifique constraint por relação,
não só nome possivelmente repetido em outro schema.

Transações curtas, ordem consistente e retry de deadlock são decisões de
concorrência; UPDATE não garante ordem global de aquisição de locks. Advisory
lock só protege consumidores que cooperam. SKIP LOCKED muda semântica e não
garante ausência de starvation. Pooling depende de modo e protocolo: SQL PREPARE
e prepared statement do protocolo não são equivalentes. Confira configuração
do pooler/driver antes de orientar named queries.

RLS testa usuários/tenants com casos permitido e negado, papel real e operações
pertinentes. UUID não substitui autorização. Função SECURITY DEFINER pode ampliar
privilégios: dono, search_path e EXECUTE precisam de análise; helper que retorna
identidade não concede autorização por si. Não presumir que conta bypass-RLS
representa usuário final. Use princípio de privilégio mínimo.

EXPLAIN ANALYZE executa instrução e funções: efeitos pedem ambiente/autoridade
adequados. Antes/depois devem usar dados/cenários comparáveis; plano sem execução
é hipótese, não ganho medido. Reuse evidência atual, nunca consultar dados privados
ou alterar produção por conveniência. Architecture cuida fronteiras/migração;
backend GREEN implementa; validator/reviewer verificam no fluxo existente.

Leitura seletiva: [pooling](postgresql/conn-pooling.md),
[prepared](postgresql/conn-prepared-statements.md),
[constraints](postgresql/schema-constraints.md),
[locks](postgresql/lock-deadlock-prevention.md),
[RLS](postgresql/security-rls-basics.md),
[RLS e helper](postgresql/security-rls-performance.md),
[EXPLAIN](postgresql/monitor-explain-analyze.md),
[índices](postgresql/query-missing-indexes.md).
[Origem/licença/emendas](../SOURCE.md).
