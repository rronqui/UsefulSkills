---
title: Use SWR for Automatic Deduplication
impact: MEDIUM-HIGH
impactDescription: can share cache and request state across components that use the same key
tags: client, swr, deduplication, data-fetching
---

## Use SWR for Automatic Deduplication

A shared client data hook keeps fetching, loading, error, cache, and revalidation
semantics in one place. SWR can deduplicate near-simultaneous requests when
components use the same key and cache provider.

### Define one data contract

```tsx
'use client'

import useSWR from 'swr'

type Viewer = { id: string; displayName: string }

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json() as Promise<T>
}

function useViewer() {
  return useSWR<Viewer>('/api/viewer', readJson)
}

export function ViewerName() {
  const { data, error, isLoading } = useViewer()
  if (isLoading) return <span>Loading…</span>
  if (error) return <span>Unavailable</span>
  return <span>{data?.displayName ?? 'Anonymous'}</span>
}
```

Two `ViewerName` instances use the same key and can share the in-flight request
and cached result. A key must include every input that changes the response;
include a tenant or resource identifier where the endpoint is scoped that way.
Never use a shared key for user-specific data if the cache provider can span
users or sessions.

### Mutations are explicit

Use `useSWRMutation` or a bound `mutate` call for writes. The server still owns
authorization and validation; an optimistic update is a UI prediction, not proof
that the remote write succeeded. Decide whether failures roll back and whether a
successful mutation revalidates the read key.

```tsx
import useSWRMutation from 'swr/mutation'

async function renameViewer(url: string, { arg }: { arg: { displayName: string } }) {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(arg),
  })
  if (!response.ok) throw new Error(`Update failed: ${response.status}`)
  return response.json()
}

export function RenameButton() {
  const { trigger, isMutating } = useSWRMutation('/api/viewer', renameViewer)
  return (
    <button
      type="button"
      disabled={isMutating}
      onClick={() => void trigger({ displayName: 'New display name' })}
    >
      Rename
    </button>
  )
}
```

Use immutable/read-only helpers only when the resource really cannot change.
Tune `dedupingInterval`, cache providers, focus revalidation, and retry policy to
the freshness and privacy requirements of the application; defaults are not a
security boundary.

## Sources

- SWR, [performance and deduplication](https://swr.vercel.app/docs/advanced/performance)
- SWR, [mutation and revalidation](https://swr.vercel.app/docs/mutation)
- Next.js, [fetching data](https://nextjs.org/docs/app/getting-started/fetching-data)

> Consultative guidance only: request sharing depends on key identity, cache
> scope, provider configuration, and the actual endpoint.
