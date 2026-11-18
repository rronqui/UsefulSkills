---
title: Per-Request Deduplication with React.cache()
impact: MEDIUM
impactDescription: deduplicates compatible work during one server render
tags: server, rsc, react-cache, deduplication
---

## Per-Request Deduplication with React.cache()

Use `cache` when several Server Components may ask for the same database read,
authentication lookup, or other async computation during one render. Define the
memoized function once at module scope and share that function with every
consumer.

```ts
import { cache } from 'react'

export const loadAccount = cache(async (accountId: string) => {
  return database.accounts.findById(accountId)
})

export async function AccountHeader({ accountId }: { accountId: string }) {
  const account = await loadAccount(accountId)
  return <h1>{account?.displayName ?? 'Unknown account'}</h1>
}

export async function AccountBadge({ accountId }: { accountId: string }) {
  const account = await loadAccount(accountId)
  return <span>{account?.plan ?? 'free'}</span>
}
```

The shared function lets both components reuse the result for the same render
request. Prefer primitive keys or a deliberately stable argument identity. Do
not create a new `cache(...)` wrapper inside each component; each wrapper has a
separate cache and cannot share results.

### Boundaries and caveats

- React invalidates memoized results between server requests; `cache` is not a
  cross-request database or session cache.
- The wrapped function's errors are also memoized for matching calls during the
  request, so callers must choose an appropriate error boundary.
- Authorization remains part of the data function. Do not cache a user-specific
  value under a key that omits tenant or actor context.
- In Next.js, identical `fetch` calls in a component tree have framework-level
  memoization rules. Do not assume those rules apply to database clients,
  filesystem work, or arbitrary promise-returning functions; verify the target
  version.
- A cache hit can reduce duplicate work, but it is not a freshness or secrecy
  guarantee and does not replace persistence-layer controls.

### Review checklist

- Is the memoized function declared at module scope?
- Is the key complete for authorization and tenancy?
- Is the scope explicitly one render/request rather than global?
- Are failures, invalidation, and freshness policies documented separately?

## Sources

- React, [`cache`](https://react.dev/reference/react/cache)
- React, [Server Components](https://react.dev/reference/rsc/server-components)
- Next.js, [fetching data](https://nextjs.org/docs/app/getting-started/fetching-data)

> Consultative guidance only: cache scope and fetch memoization are runtime and
> framework-version semantics, not a measured application result.
