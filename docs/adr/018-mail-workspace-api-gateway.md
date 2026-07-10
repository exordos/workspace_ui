# ADR 018: Mail and Calendar Routes via Workspace API Gateway

## Status

Accepted

## Context

ADR-014/015 established `packages/mail-proxy` with REST routes at `/v1/mail/*` and `/v1/calendar/*`. ADR-016 placed the OpenAPI contract in `@mail/api`. Production deployments need a single gateway entry point with unified auth instead of a separate mail-proxy origin.

## Decision

1. Keep **mail-proxy** as the transport implementation (IMAP/SMTP/CalDAV).
2. Extend **Workspace API OpenAPI** to include mail/calendar paths (mirrored from `mail-proxy.openapi.json`).
3. Gateway proxies `/mail-proxy/v1/mail/*` and `/mail-proxy/v1/calendar/*` to mail-proxy.
4. Web client: when `VITE_MAIL_USE_WORKSPACE_GATEWAY=true`, `mail-orval-mutator` uses `WORKSPACE_API_ORIGIN/mail-proxy` as base URL.
5. SSO: `POST /v1/mail/session/exchange` verifies Zulip API key, then creates mailbox session.

## Consequences

### Positive

- Single API origin in production
- Path to unified SSO without changing Orval client shapes
- Standalone mail-proxy remains for local dev (`VITE_MAIL_API_ORIGIN=/mail-api`)

### Negative

- OpenAPI duplication until gateway embeds mail-proxy spec directly
- Gateway must deploy mail-proxy sidecar or reverse-proxy
