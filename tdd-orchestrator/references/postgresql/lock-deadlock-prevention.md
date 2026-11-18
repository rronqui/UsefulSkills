---
title: Prevent Deadlocks with Consistent Lock Ordering
impact: MEDIUM-HIGH
impactDescription: Reduce deadlock risk through consistent lock ordering
tags: deadlocks, locking, transactions, ordering
---

## Prevent Deadlocks with Consistent Lock Ordering

Deadlocks occur when transactions lock resources in different orders. Always
acquire locks in a consistent order.

**Incorrect (inconsistent lock ordering):**

```sql
-- Transaction A                    -- Transaction B
begin;                              begin;
update accounts                     update accounts
set balance = balance - 100         set balance = balance - 50
where id = 1;                       where id = 2;  -- B locks row 2

update accounts                     update accounts
set balance = balance + 100         set balance = balance + 50
where id = 2;  -- A waits for B     where id = 1;  -- B waits for A

-- DEADLOCK! Both waiting for each other
```

**Correct (lock rows in consistent order first):**

```sql
-- Explicitly acquire locks in ID order before updating
begin;
select * from accounts where id in (1, 2) order by id for update;

-- Now perform updates in any order - locks already held
update accounts set balance = balance - 100 where id = 1;
update accounts set balance = balance + 100 where id = 2;
commit;
```

A single UPDATE makes the changes atomic, but does not acquire all row locks simultaneously or guarantee a deadlock-free order. Retain the ordered lock step:

```sql
-- Lock the same resources in the same order in every competing path.
begin;
select * from accounts where id in (1, 2) order by id for update;
update accounts
set balance = balance + case id
  when 1 then -100
  when 2 then 100
end
where id in (1, 2);
commit;
```

Other resources (triggers, foreign keys, additional tables) can still introduce deadlocks. Keep transactions short and retry a whole transaction aborted for deadlock using a bounded application policy.

Detect deadlocks in logs:

```sql
-- Check for recent deadlocks
select * from pg_stat_database where deadlocks > 0;

-- Enable deadlock logging
set log_lock_waits = on;
set deadlock_timeout = '1s';
```

Reference:
[Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS)


Nota OMP: regra de snapshot, com exemplos ilustrativos. Classificações de
impacto e multiplicadores da origem não são medições deste projeto nem garantia;
confirme versão, semântica e baseline antes/depois no cenário autorizado.
