# ADR 015: Native Calendar Client with Mailcow SOGo CalDAV Proxy

## Status

Accepted

## Context

The `/calendar` section was an iframe embed over a static HTML placeholder (`VITE_CALENDAR_EMBED_URL`). There was no protocol integration, no shared auth with mail, and no way to match the Workspace design system.

Corporate Mailcow deployments expose calendars via **SOGo CalDAV** (`/SOGo/dav/{email}/Calendar/`). Browsers cannot speak CalDAV directly (CORS, credential handling).

ADR-014 established a native mail UI backed by `packages/mail-proxy` with a separate mailbox-password Bearer session. Calendar should reuse that session and proxy process rather than introducing a second sidecar.

## Options

1. **Iframe embed** — SOGo calendar in `EmbedFrame`. Fast, but foreign UI, weak theme integration, cookie/SSO friction.
2. **Native React UI + CalDAV proxy** — REST facade in `packages/mail-proxy` (`/v1/calendar/*`), native calendar UI in FSD layers. Full design-system control; reuses mail session.
3. **Direct CalDAV in browser** — Blocked by CORS and unsafe credential exposure.

## Decision

Implement **native React calendar UI** (`widgets/calendar-view`, `entities/calendar`) backed by **CalDAV routes in `packages/mail-proxy`** against Mailcow SOGo.

- Dev stack: `docker/mailcow` + `npm run dev:mail-proxy` (same process as mail)
- Config: `VITE_MAIL_API_ORIGIN` (web), `MAILCOW_SOGO_URL` + `MAILCOW_CALDAV_PREFIX` (proxy)
- Auth: **shared mailbox Bearer session** with `/mail` (`workspace-mail-session` in `sessionStorage`)
- Vite dev proxy: `/mail-api` → mail-proxy (calendar at `/mail-api/v1/calendar/*`)

## Consequences

### Positive

- UI matches design tokens, i18n, and layout patterns
- Single proxy process and session for mail + calendar
- Security: CORS allowlist; passwords never stored client-side
- Clear extension path: move routes into Workspace API OpenAPI (`/v1/calendar/*`) with unified gateway auth

### Negative

- CalDAV/iCalendar complexity (RRULE expansion, timezones, ETags)
- Mailbox password still separate from Zulip login until unified SSO
- SOGo HTTPS required in dev (self-signed certs via mailcow README)

### API (mail-proxy `/v1/calendar/*`)

| Method | Path                | Purpose                        |
| ------ | ------------------- | ------------------------------ |
| GET    | `/calendars`        | List calendars                 |
| GET    | `/events`           | Query events in time range     |
| GET    | `/events/:eventUid` | Event detail                   |
| POST   | `/events`           | Create event                   |
| PUT    | `/events/:eventUid` | Update event (If-Match / ETag) |
| DELETE | `/events/:eventUid` | Delete event                   |

All routes require the same `Authorization: Bearer` token as `/v1/mail/*`.

### Follow-up

- Workspace API `/v1/calendar/*` in production instead of standalone proxy
- Unified SSO via gateway (replace mailbox password prompt)
- Deprecate `VITE_CALENDAR_EMBED_URL`
