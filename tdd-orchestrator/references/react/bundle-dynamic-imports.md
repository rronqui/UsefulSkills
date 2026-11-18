---
title: Dynamic Imports for Heavy Components
impact: CRITICAL
impactDescription: can keep optional client code out of the initial route; verify the resulting chunks and user timing
tags: bundle, dynamic-import, code-splitting, next-dynamic
---

## Dynamic Imports for Heavy Components

Large editors, visualizers, and rarely used tools do not need to be part of the
first interactive path. Load them when the UI actually needs them, and provide
a loading and error boundary appropriate to the feature.

### Load on demand

```tsx
'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const DiagramEditor = dynamic(
  () => import('./diagram-editor').then((module) => module.DiagramEditor),
  {
    loading: () => <p>Preparing the editor…</p>,
  },
)

export function DiagramPanel() {
  const [open, setOpen] = useState(false)

  return (
    <section>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide editor' : 'Open editor'}
      </button>
      {open ? <DiagramEditor /> : null}
    </section>
  )
}
```

The import is evaluated when the component is first rendered. A static import
is still preferable for code needed by the initial route or for code where the
bundler benefits from eager analysis.

### Treat `ssr: false` as a separate decision

```tsx
const BrowserMap = dynamic(() => import('./browser-map'), { ssr: false })
```

Use `ssr: false` only when the Client Component cannot be rendered on the
server, for example because it reads `window` during render. It disables
prerendering for that component; it is not a generic “load later” switch. Put
this option in a Client Component, as required by the Next.js API, and do not
use it to hide a component that is actually server-renderable.

### Verify the trade-off

Check the generated chunks, route preloads, first interaction, loading state,
error recovery, and cache behavior in the target build. A dynamic import can
add a request or delay an interaction; a bundle-size claim without a build and
runtime measurement is not evidence.

## Sources

- Next.js, [lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)
- React, [`lazy`](https://react.dev/reference/react/lazy)
- MDN, [dynamic `import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import)

> Consultative guidance only: code-splitting and prerender behavior are
> framework/build-version dependent.
