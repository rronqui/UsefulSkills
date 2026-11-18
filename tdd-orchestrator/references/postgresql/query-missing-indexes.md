---
title: Evaluate Indexes on WHERE and JOIN Columns
impact: HIGH
impactDescription: Potential query improvement after plan, workload, and write-cost validation
tags: indexes, performance, sequential-scan, query-optimization
---

## Evaluate Indexes on WHERE and JOIN Columns

A filter or join without a matching index can lead to a sequential scan, but that
is not automatically a defect. PostgreSQL chooses a plan from statistics, table
size, selectivity, ordering, available indexes, and estimated cost. The same
query can legitimately use a sequential scan on a small table or a low-selectivity
predicate.

**Candidate workflow (measure before changing the schema):**

```sql
-- Inspect the estimated plan on representative data.
explain (costs, format text)
select * from orders where customer_id = 123;

-- In an authorized, controlled environment, compare actual work as well.
explain (analyze, buffers, format text)
select * from orders where customer_id = 123;
```

Add an index only when the plan and query workload justify it, then compare the
target query and the surrounding read/write workload before and after. An index
consumes storage and adds maintenance work to `INSERT`, `UPDATE`, and `DELETE`;
the planner may still choose a sequential scan after the index is added.

```sql
-- Candidate only after the plan/workload review above.
create index orders_customer_id_idx on orders (customer_id);

select * from orders where customer_id = 123;
```

For JOIN or foreign-key columns, consider an index on the referencing column
when representative join plans, foreign-key actions, or maintenance workload
benefit from it. PostgreSQL does not create every such index automatically, but
“index every foreign key” is not a universal rule: verify selectivity, join
direction, parent/child operations, storage, and write cost.

```sql
-- Candidate for the referencing side; validate the workload first.
create index orders_customer_id_idx on orders (customer_id);

select c.name, o.total
from customers c
join orders o on o.customer_id = c.id;
```

## Sources

- PostgreSQL, Using `EXPLAIN`: https://www.postgresql.org/docs/current/using-explain.html
- PostgreSQL, Planner/Optimizer: https://www.postgresql.org/docs/current/planner-optimizer.html
- PostgreSQL, Indexes: https://www.postgresql.org/docs/current/indexes.html
- Supabase, Query optimization guidance: https://supabase.com/docs/guides/database/query-optimization


Nota OMP: regra de snapshot, com exemplos ilustrativos. Classificações de
impacto e multiplicadores da origem não são medições deste projeto nem garantia;
confirme versão, semântica e baseline antes/depois no cenário autorizado.
