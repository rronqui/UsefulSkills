---
title: Defer Non-Critical Third-Party Libraries
impact: MEDIUM
impactDescription: may reduce critical-path work when explicitly gated; timing is app- and browser-dependent
tags: bundle, third-party, analytics, defer
---

## Defer Non-Critical Third-Party Libraries

Telemetry, support widgets, and other optional integrations should not delay the
content or interaction that a route needs. First decide whether the integration
is required for the initial render. Then choose a loading boundary that matches
that policy.

`next/dynamic(..., { ssr: false })` makes a Client Component browser-only. It
does **not** promise loading after hydration, during idle time, or after a user
action. The component can still load as soon as it is rendered.

### Client-only is not deferred

```tsx
'use client'

import dynamic from 'next/dynamic'

const SupportBadge = dynamic(
  () => import('./support-badge').then((module) => module.SupportBadge),
  { ssr: false },
)

export function BrowserSupportBadge() {
  return <SupportBadge />
}
```

This is appropriate when the library needs browser APIs, but it is not a timing
policy. The component is rendered immediately by its parent.

### Add an explicit gate for post-hydration work

```tsx
'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const OptionalTelemetry = dynamic(
  () => import('./optional-telemetry').then((module) => module.OptionalTelemetry),
  { ssr: false },
)

export function DeferredTelemetry() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    // This gate runs after hydration; it is not an idle guarantee.
    setEnabled(true)
  }, [])

  return enabled ? <OptionalTelemetry /> : null
}
```

Render the gate from a Server Component layout or page only when the feature is
allowed for that route. If the policy is “idle” or “after interaction”, use an
explicit, feature-detected scheduler or event handler, give required work a
fallback/timeout, and measure bundle, hydration, interaction, and request
 timing in the target application. Do not describe a post-hydration gate as
idle loading without that evidence.

Also review third-party code as code with the page's origin privileges. Consent,
privacy, CSP, network policy, and failure handling remain application concerns.

## Sources

- Next.js, [lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)
- Next.js, [client-only components](https://nextjs.org/docs/app/guides/single-page-applications)
- React, [`lazy`](https://react.dev/reference/react/lazy)
- MDN, [`requestIdleCallback()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)

> Consultative guidance only: `ssr: false` and a client gate describe different
> semantics; neither is a measured performance result by itself.
