---
title: Parallel Data Fetching with Component Composition
impact: CRITICAL
impactDescription: can avoid an avoidable server-side waterfall when sibling data has no dependency
tags: server, rsc, parallel-fetching, composition
---

## Parallel Data Fetching with Component Composition

A Server Component that awaits data before it creates a child can make that
child wait for the parent. If two pieces of a page need unrelated data, compose
them as siblings so the renderer can start both branches without passing the
first result through the parent.

```tsx
async function AccountHeading() {
  const account = await loadAccountSummary()
  return <h1>{account.name}</h1>
}

async function AlertList() {
  const alerts = await loadOpenAlerts()
  return <ul>{alerts.map((alert) => <li key={alert.id}>{alert.text}</li>)}</ul>
}

export default function Dashboard() {
  return (
    <main>
      <AccountHeading />
      <AlertList />
    </main>
  )
}
```

Avoid fetching the heading in `Dashboard`, awaiting it, and only then rendering
`AlertList` when the alert query does not depend on the account. If a child does
need a parent result, retain that edge; start any other work beside it or share
an appropriately scoped loader. React/Next.js memoization can prevent duplicate
identical reads, but it does not remove real data dependencies.

### Streaming and loading states

Composition determines what can start; `<Suspense>`/route loading boundaries
determine what can be streamed while slower branches resolve. Keep fallbacks
meaningful and avoid exposing private data in a placeholder or serialized prop.
Measure server duration, request count, and time to visible content in the
actual framework/build. “Parallel” is a topology claim, not a guaranteed
latency multiplier.

### Review checklist

- Which values does each branch require?
- Is a parent `await` blocking an unrelated sibling?
- Are shared loaders scoped for the request and authorization context?
- Does the loading boundary preserve correct error and privacy behavior?

## Sources

- React, [Server Components](https://react.dev/reference/rsc/server-components)
- Next.js, [fetching data and streaming](https://nextjs.org/docs/app/getting-started/fetching-data)
- MDN, [`Promise.all()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)

> Consultative guidance only: component scheduling, request memoization, and
> streaming depend on the framework version and the application data graph.
