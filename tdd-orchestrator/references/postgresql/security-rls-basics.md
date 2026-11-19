---
title: Enable Row Level Security for Multi-Tenant Data
impact: CRITICAL
impactDescription: Database-enforced tenant isolation when identity and privileges are configured correctly
tags: rls, row-level-security, multi-tenant, security
---

## Enable Row Level Security for Multi-Tenant Data

Row Level Security (RLS) constrains which rows a query can access. It is only an
identity boundary when the database role and the identity context are established
by a trusted authentication boundary; a policy does not authenticate an arbitrary
value supplied by the SQL caller.

**Incorrect (application-level filtering only):**

```sql
-- Relying only on application to filter
select * from orders where user_id = $current_user_id;

-- Bug or bypass means all data is exposed!
select * from orders;  -- Returns ALL orders
```

**Correct (database-enforced RLS with a trusted context):**

```sql
-- Enable RLS on the table
alter table orders enable row level security;

-- The policy fails closed when the trusted context is absent.
create policy orders_user_policy on orders
  for all
  using (user_id = current_setting('app.current_user_id', true)::bigint);

-- Force RLS even for table owners
alter table orders force row level security;

-- The application authenticates the request outside this SQL and derives $1
-- from that verified identity. Do not expose arbitrary SET to end users.
begin;
select set_config('app.current_user_id', $1, true); -- SET LOCAL semantics
select * from orders; -- Rows for the trusted context only
commit;
```

`current_setting` reads a session/transaction configuration value; it does not
authenticate the value. `set_config(..., true)` (equivalent to `SET LOCAL`)
limits the value to the current transaction, but duration is not authentication.
Use a restricted database role and a server-side boundary that derives the value
from a verified session/token; never treat a user-provided ID or a role that can
issue arbitrary SQL as proof of identity. Keep pooled connections inside the
transaction boundary so context cannot leak to the next request.

When the platform supplies an authenticated database context, use its documented
identity function and role grants rather than inventing a GUC. For example,
`auth.uid()` is a Supabase/platform function, not PostgreSQL core:

```sql
create policy orders_user_policy on orders
  for all
  to authenticated
  using (user_id = auth.uid());
```

This example is safe only when the platform's authentication and role boundary
are configured as documented. `FORCE ROW LEVEL SECURITY` protects against table
owner bypass where applicable; it does not authenticate `current_setting`.

## Sources

- PostgreSQL, Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PostgreSQL, `set_config` and transaction-local settings: https://www.postgresql.org/docs/current/functions-admin.html
- PostgreSQL, configuration setting rules: https://www.postgresql.org/docs/current/config-setting.html
- Supabase, PostgreSQL RLS guidance: https://supabase.com/docs/guides/database/postgres/row-level-security


Nota OMP: regra de snapshot, com exemplos ilustrativos. Classificações de
impacto e multiplicadores da origem não são medições deste projeto nem garantia;
confirme versão, semântica e baseline antes/depois no cenário autorizado.
