---
title: Authenticate Server Actions Like API Routes
impact: CRITICAL
impactDescription: prevents unauthorized access to server mutations
tags: server, server-actions, authentication, security, authorization
---

## Authenticate Server Actions Like API Routes

A Server Function exported with `'use server'` is callable through a network
boundary. Treat every exported action as an endpoint: validate its arguments,
resolve the current session on the server, and authorize the requested resource
or operation inside that function. A page guard, layout check, or hidden button
is only a user-experience measure.

### Check identity and authorization in the action

```ts
'use server'

import { revalidatePath } from 'next/cache'

export async function archiveMessage(input: unknown) {
  const messageId = parseMessageId(input)
  const actor = await requireSession()

  const message = await findMessage(messageId)
  if (!message || !canArchive(actor, message)) {
    throw new Error('Not allowed')
  }

  await markMessageArchived(message.id, actor.id)
  revalidatePath('/inbox')
  return { ok: true }
}
```

`parseMessageId`, `requireSession`, and `canArchive` represent application
boundaries that must reject malformed input, missing identity, and unauthorized
ownership/role combinations. Do not trust TypeScript annotations or an ID sent
by the browser. Avoid returning secrets or internal records in the action
result; expose only the fields the caller needs.

### Review every exported action

- Find all modules with `'use server'` and all exported functions.
- Trace authentication and object-level authorization in each function.
- Validate form data or serialized arguments before database, filesystem, or
  outbound side effects.
- Keep CSRF/origin and cookie policy appropriate to the route and framework.
- Return stable, non-sensitive error states; log details only in protected
  server-side diagnostics.

Server Actions do not make a mutation safe automatically. A data-access layer
can centralize checks, but the action must still invoke that boundary for every
request and every resource.

## Sources

- Next.js, [authentication](https://nextjs.org/docs/app/guides/authentication)
- Next.js, [Server Functions and mutations](https://nextjs.org/docs/app/getting-started/mutating-data)
- Next.js, [security in Server Components and Actions](https://nextjs.org/blog/security-nextjs-server-components-actions)

> Consultative guidance only: the session provider, authorization model, cookie
> policy, and framework version determine the complete security boundary.
