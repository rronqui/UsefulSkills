---
title: Use Connection Pooling for All Applications
impact: CRITICAL
impactDescription: Handle 10-100x more concurrent users
tags: connection-pooling, pgbouncer, performance, scalability
---

## Use Connection Pooling for All Applications

Postgres connections are expensive (1-3MB RAM each). Without pooling, applications exhaust connections under load.

**Incorrect (new connection per request):**

```sql
-- Each request creates a new connection
-- Application code: db.connect() per request
-- Result: 500 concurrent users = 500 connections = crashed database

-- Check current connections
select count(*) from pg_stat_activity;  -- 487 connections!
```

**Correct (connection pooling):**

```sql
-- Use a pooler like PgBouncer between app and database
-- Application connects to pooler, pooler reuses a small pool to Postgres

-- Configure pool_size based on: (CPU cores * 2) + spindle_count
-- Example for 4 cores: pool_size = 10

-- Result: 500 concurrent users share 10 actual connections
select count(*) from pg_stat_activity;  -- 10 connections
```

Pool modes:

- **Transaction mode**: connection returned after each transaction (best for most apps)
- **Session mode**: connection held for the entire session; use it for session state such as persistent temporary tables or SQL `PREPARE`/`EXECUTE`.

SQL `PREPARE`/`EXECUTE` differs from protocol-level named prepared statements.
PgBouncer transaction pooling can support the latter with a compatible version
and `max_prepared_statements` enabled. Check the driver and pooler configuration;
do not infer support for SQL `PREPARE` from protocol support.

Reference: [Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)


Nota OMP: regra de snapshot, com exemplos ilustrativos. Classificações de
impacto e multiplicadores da origem não são medições deste projeto nem garantia;
confirme versão, semântica e baseline antes/depois no cenário autorizado.
