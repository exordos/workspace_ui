# ADR-008: Canonical Workspace API path layout

**Date**: 2026-04-14  
**Status**: accepted; revised for the Messenger-only backend in 2026-07

## Context

Workspace UI currently consumes one backend for Messenger, common users, files,
and durable events. Mail and Calendar integrations are deferred and will use
mail protocols when introduced; they are not public Workspace HTTP domains.
Path overrides would allow clients to silently recreate removed layouts and
make deployments disagree about the public contract.

## Decision

The public API layout is fixed:

```text
/api/workspace/v1/                  common resources
/api/workspace/v1/messenger/        messenger resources
/api/workspace/v1/events/ws         common websocket
```

`packages/web/src/shared/config/workspace-api-layout.ts` is the single source
of these path constants. `env.ts`, the Vite development proxy, generated API
configuration, uploads, and the event loop derive their URLs from that layout.
An environment setting may change the API origin, but not these paths.

All operations use the same Exordos Core IAM bearer token with
`project:default` scope. The websocket is common to Workspace and is not nested
below the Messenger domain.

## Consequences

- The browser never talks directly to SMTP, IMAP, or a UI-side proxy.
- There are no redirects, aliases, fallbacks, or persisted-state migrations for
  removed API paths.
- `/api/workspace/v1/mail/`, `/api/workspace/v1/calendar/`, and the trusted
  provider-service API are not part of the current client contract.
- Backend and UI contract changes require regenerating `@workspace/api`,
  running UI typecheck/tests, and verifying the exact gateway routes.
- Deployments that do not provide this layout are unsupported.
