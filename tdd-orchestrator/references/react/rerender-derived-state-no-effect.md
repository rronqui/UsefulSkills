---
title: Calculate Derived State During Rendering
impact: MEDIUM
impactDescription: avoids redundant renders and state drift
tags: rerender, derived-state, useEffect, state
---

## Calculate Derived State During Rendering

If a value is fully determined by current props and state, calculate it during
render instead of storing a second copy and synchronizing it with an Effect.
The extra state creates a render with stale data and a second update that can
drift from its inputs.

### Derive values directly

```tsx
function BasketSummary({
  lines,
  taxRate,
}: {
  lines: Array<{ price: number; quantity: number }>
  taxRate: number
}) {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0,
  )
  const total = subtotal * (1 + taxRate)

  return <p>Total: {total.toFixed(2)}</p>
}
```

Do not introduce `total` state plus an Effect that updates it whenever
`lines` or `taxRate` changes. If the calculation is demonstrably expensive,
consider `useMemo` with complete dependencies and measure before and after; a
memoization hook is not a substitute for correct dependencies.

### Reset state with identity when that is the intent

When switching records should create a fresh editor, express that identity with
a key rather than an Effect that clears every field after the prop changes:

```tsx
export function DocumentRoute({ documentId }: { documentId: string }) {
  return <DocumentEditor key={documentId} documentId={documentId} />
}
```

Effects remain appropriate for synchronizing with an external system such as a
browser API, subscription, or non-React widget. Event-specific work belongs in
the event handler, and state updates should not be used to mirror values that
can be derived from existing inputs.

### Review checklist

- Is the value a pure function of current props/state?
- Would a key express a true identity boundary for reset behavior?
- If `useMemo` is proposed, is the calculation measured and are dependencies
  complete?
- Does an Effect actually synchronize with an external system?

## Sources

- React, [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- React, [`useMemo`](https://react.dev/reference/react/useMemo)
- React, [preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state)

> Consultative guidance only: render frequency and calculation cost depend on
> the application tree, build, device, and measured interaction.
