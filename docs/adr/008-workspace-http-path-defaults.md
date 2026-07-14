# ADR-008: Canonical Workspace API path layout

**Date**: 2026-04-14  
**Status**: accepted; replaced by the greenfield unified API decision in 2026-07

## Context

Workspace UI consumes one backend for messenger, mail, calendar, common users,
and durable events. The product does not support the earlier standalone
messenger or UI-side mail proxy contracts. Path overrides would allow clients
to silently recreate removed layouts and make deployments disagree about the
public contract.

## Decision

The public API layout is fixed:

```text
/api/workspace/v1/                  common resources
/api/workspace/v1/messenger/        messenger resources
/api/workspace/v1/mail/             mail resources
/api/workspace/v1/calendar/         calendar resources
/api/workspace/v1/events/ws         common websocket
```

`packages/web/src/shared/config/workspace-api-layout.ts` is the single source
of these path constants. `env.ts`, the Vite development proxy, generated API
configuration, uploads, and the event loop derive their URLs from that layout.
An environment setting may change the API origin, but not these paths.

All domains use the same Exordos Core IAM bearer token with
`project:default` scope. The websocket is common to messenger, mail, and
calendar and is not nested below a domain.

## Consequences

- The browser never talks directly to SMTP, IMAP, CalDAV, or a UI-side proxy.
- There are no redirects, aliases, fallbacks, or persisted-state migrations for
  removed API paths.
- Backend and UI contract changes require regenerating `@workspace/api`,
  running UI typecheck/tests, and verifying the exact gateway routes.
- Deployments that do not provide this layout are unsupported.
