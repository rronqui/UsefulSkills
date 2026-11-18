---
title: Optimize RLS Policies for Performance
impact: HIGH
impactDescription: Potentially reduce RLS query cost after plan and workload validation
tags: rls, performance, security, optimization
---

## Optimize RLS Policies for Performance

RLS predicates participate in normal query planning. Optimize them from a
representative workload and query plan; do not promise a fixed speedup or assume
that a policy function is evaluated a particular number of times on every
PostgreSQL version and data shape.

**Candidate optimization (verify the resulting plan):**

```sql
create policy orders_policy on orders
  using ((select auth.uid()) = user_id);

-- Compare EXPLAIN output on representative data and workload.
```

Wrapping a stable, platform-provided identity lookup in a scalar `SELECT` can
allow one evaluation per statement in supported environments, but this is a
planner optimization to verify, not an authentication mechanism or a guaranteed
cache. `auth.uid()` is platform-specific; use the identity API documented by the
actual stack.

Use security definer functions for complex checks:

`SECURITY DEFINER` functions run with the owner's privileges; RLS bypass depends on that owner's privileges and table configuration — which is what makes them useful for internal lookups, but also what makes them dangerous if misused. Always include an explicit `auth.uid()` check inside the function body, keep them in a non-exposed schema, and revoke `EXECUTE` from any role that shouldn't call them directly.

```sql
-- Keep private outside the Data API exposed schemas; restrict schema CREATE privileges.
create schema if not exists private;

-- Create helper function in a private schema
create or replace function private.is_team_member(team_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    -- always check the calling user's identity inside the function
    where team_members.team_id = $1 and team_members.user_id = (select auth.uid())
  );
$$;

-- Remove broad/default grants; allow the role that must evaluate the policy.
revoke execute on function private.is_team_member(bigint) from PUBLIC, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.is_team_member(bigint) to authenticated;

-- Assumes RLS is enabled and normal table SELECT privileges are configured.
-- This helper depends on the row's team_id: do not claim once-per-query caching.
create policy team_orders_policy on public.orders for select to authenticated
  using (private.is_team_member(team_id));
```

Policy expressions require the caller to have permission to invoke their functions. A private, non-exposed schema prevents Data API RPC exposure; it does not remove the caller's required EXECUTE grant. Verify the function owner has only the intended privileges. See [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Evaluate indexes on columns used in RLS predicates when the policy is selective
and representative plans show a benefit. The index does not authenticate the
caller, and it adds storage and write-maintenance cost.

```sql
-- Candidate only after an EXPLAIN/workload review.
create index orders_user_id_idx on orders (user_id);
```

Compare `EXPLAIN` (and, in an authorized controlled environment, `EXPLAIN
ANALYZE`) before and after with representative data and read/write workload.
The planner may still choose a sequential scan; no fixed multiplier is implied.

## Sources

- PostgreSQL, Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PostgreSQL, Using `EXPLAIN`: https://www.postgresql.org/docs/current/using-explain.html
- Supabase, RLS performance recommendations: https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations


Nota OMP: regra de snapshot, com exemplos ilustrativos. Classificações de
impacto e multiplicadores da origem não são medições deste projeto nem garantia;
confirme versão, semântica e baseline antes/depois no cenário autorizado.
