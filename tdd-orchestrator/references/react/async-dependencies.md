---
title: Dependency-Based Parallelization
impact: CRITICAL
impactDescription: may shorten the critical path when the dependency graph is respected; measure the workload
tags: async, parallelization, dependencies, dependency-graph
---

## Dependency-Based Parallelization

Model asynchronous work as a graph. Start a task as soon as its required inputs
exist, while unrelated tasks start immediately. The goal is not to remove every
`await`: an operation that needs another result must remain downstream of it.

### Start independent work before dependent work

This sequence delays the feature flags request until the account request has
finished, even though the two requests do not depend on one another:

```ts
const account = await loadAccount()
const flags = await loadFeatureFlags()
const report = await loadAccountReport(account.id)

return { account, flags, report }
```

Create the dependency edges explicitly instead:

```ts
const accountPromise = loadAccount()
const flagsPromise = loadFeatureFlags()
const reportPromise = accountPromise.then((account) =>
  loadAccountReport(account.id)
)

const [account, flags, report] = await Promise.all([
  accountPromise,
  flagsPromise,
  reportPromise,
])

return { account, flags, report }
```

`reportPromise` waits for the account, while `flagsPromise` can make progress
at the same time. Keep authorization, rate limits, cancellation, and resource
budgets in the graph; two calls are not independent merely because their
function signatures are different.

### Failure and resource policy

`Promise.all` rejects when one required task rejects. Use
`Promise.allSettled` only when the product has a deliberate partial-result
policy, and inspect each outcome before rendering or persisting anything. Do
not fan out an unbounded list: batch or cap concurrency when the endpoint, API,
or database has a finite budget.

### Review checklist

- Mark the data each task actually requires.
- Start a promise at the first safe point, not after an unrelated `await`.
- Preserve ordering when destructuring aggregate results.
- Keep dependent work downstream and handle cancellation at the owner boundary.
- Measure request duration and downstream load before claiming a gain.

## Sources

- React, [Server Components](https://react.dev/reference/rsc/server-components)
- MDN, [`Promise.all()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
- MDN, [`Promise.allSettled()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)

> Consultative guidance only: runtime, framework scheduling, API limits, and
> application measurements determine the actual result.
