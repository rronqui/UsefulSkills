---
title: Promise.all() for Independent Operations
impact: CRITICAL
impactDescription: may reduce avoidable waiting for independent operations; measure latency and resource cost
tags: async, parallelization, promises, waterfalls
---

## Promise.all() for Independent Operations

When several operations need no result from one another, begin them together and
wait for their combined result. Serial `await` statements add their waiting
time to the critical path even when the work could overlap.

### Example

This version waits for each request in turn:

```ts
const notices = await getNotices()
const recommendations = await getRecommendations()
const locale = await getLocaleSettings()

return renderHome({ notices, recommendations, locale })
```

Start the three operations before waiting:

```ts
const noticesPromise = getNotices()
const recommendationsPromise = getRecommendations()
const localePromise = getLocaleSettings()

const [notices, recommendations, locale] = await Promise.all([
  noticesPromise,
  recommendationsPromise,
  localePromise,
])

return renderHome({ notices, recommendations, locale })
```

The array order controls the result order; completion order does not. `Promise.all`
rejects on the first rejection, but it does not cancel work already started.
Choose `Promise.allSettled` when each result is independently useful and the
caller has an explicit way to represent failures.

### Bound the fan-out

Parallel does not mean unlimited. A loop that starts one request per user or
file can exhaust sockets, rate limits, or database connections. Chunk the work,
use a bounded queue, or keep the operation serial when the resource is
exclusive. Preserve dependency edges instead of forcing unrelated work into one
batch.

### Review checklist

- Confirm that no operation consumes another operation's output.
- Keep authentication and authorization checks before protected work.
- Define the error and cancellation policy for the group.
- Measure the endpoint and its downstream services before making a performance
  claim.

## Sources

- MDN, [`Promise.all()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
- MDN, [`Promise.allSettled()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)
- React, [Server Components](https://react.dev/reference/rsc/server-components)

> Consultative guidance only: the actual critical path depends on the runtime,
> framework, network, and service budgets.
