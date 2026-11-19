---
title: Use Prepared Statements Correctly with Pooling
impact: HIGH
impactDescription: Avoid prepared statement conflicts in pooled environments
tags: prepared-statements, connection-pooling, transaction-mode
---

## Use Prepared Statements Correctly with Pooling

Prepared state normally belongs to a database connection. Verify the pooler, mode, version and configuration before enabling named preparation. SQL `PREPARE`/`EXECUTE` is different from protocol-level preparation.

**Incorrect (SQL preparation assumed to survive transaction pooling):**

```sql
prepare get_user as select * from users where id = $1;
-- A later transaction may use another backend.
execute get_user(123);
```

**Correct (choose a supported route):**

- For transaction pooling, use parameterized queries without persistent named state unless the pooler explicitly supports protocol-level named preparation. PgBouncer requires nonzero `max_prepared_statements` for that support; its feature matrix does not support SQL `PREPARE` / `DEALLOCATE` in transaction mode. Do not recommend adding `DEALLOCATE` or a transaction wrapper as a general compatibility fix.
- For SQL `PREPARE` / `EXECUTE`, use a direct connection or a session pool that preserves the backend for the session. Confirm the actual endpoint mode; do not infer it solely from a port number.
- For node-postgres (`pg`), omit the query config's `name` when persistent named preparation is unwanted. Keep parameters separate from SQL; there is no documented `prepare: false` option in `pg`.

```js
await client.query({ text: 'select * from users where id = $1', values: [123] })
```

Other drivers have different switches (for example JDBC's `prepareThreshold`); verify the installed driver's documentation rather than copying settings between drivers.

References: [PgBouncer features](https://www.pgbouncer.org/features.html), [node-postgres queries](https://node-postgres.com/features/queries), [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).


Nota OMP: regra de snapshot, com exemplos ilustrativos. Classificações de
impacto e multiplicadores da origem não são medições deste projeto nem garantia;
confirme versão, semântica e baseline antes/depois no cenário autorizado.
