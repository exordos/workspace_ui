# ADR 017: Mail Proxy as Thin Transport Layer

## Status

Accepted (updated 2026-07-10)

## Context

`packages/mail-proxy` originally mixed protocol adapters (IMAP, SMTP, CalDAV) with business rules: folder rename/move path computation, protected-folder guards, send-mail validation, iCal parsing, RRULE expansion, and compose helpers.

That duplicated logic the web client already needs for offline UX, tests without a proxy, and a future direct-browser integration path. Validation in two places also drifted from the OpenAPI contract.

## Options

1. **Keep business logic in proxy** — single server-side gate; web stays thin.
2. **Split: proxy = transport, web = domain** — proxy only parses/coerces HTTP and talks to mail servers; web validates and transforms before calling REST.
3. **Move everything to web, proxy becomes pass-through** — loses security boundary for malformed input at the edge.

## Decision

Adopt **option 2**:

| Concern                                                 | Location                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Session tokens, IMAP/SMTP/CalDAV wire protocol          | `packages/mail-proxy`                                                         |
| Minimal HTTP coercion (types, path length, null bytes)  | `packages/mail-proxy/src/*/request.lib.ts`                                    |
| MIME parse/serialize for inbound mail + outbound RFC822 | `packages/mail-proxy/src/mail/mime.lib.ts` (Node `mailparser` / `nodemailer`) |
| Mail validation, folder ops, compose (Re:/Fwd:, quotes) | `packages/web/src/entities/mail/*.lib.ts`                                     |
| Trash/delete/clear orchestration (move vs permanent)    | `packages/web/src/entities/mail/mail.model.ts` + `mail.lib.ts`                |
| Special folder resolution (Trash/Sent/Drafts/…)         | `packages/web/src/entities/mail/mail.lib.ts`                                  |
| Draft send orchestration (read → SMTP → delete)         | `packages/web/src/entities/mail/mail.api.ts`                                  |
| Batch message ops (parallel atomic calls)               | `packages/web/src/entities/mail/mail.api.ts`                                  |
| iCal parse/serialize, RRULE expansion, event validation | `packages/web/src/entities/calendar/*.lib.ts`                                 |
| REST contract                                           | `packages/mail-api/openapi/mail-proxy.openapi.json`                           |
| Zulip API key verification before session exchange      | Workspace API gateway (ADR 018); proxy verifies IMAP only                     |

### Transport API contract (explicit, no server-side inference)

- `DELETE /messages/:uid` — permanent IMAP delete only
- `POST /messages/:uid/move` — move to Trash (client resolves Trash path)
- `POST /folders/clear` — `{ path, mode: permanent|move, targetFolder? }`
- `DELETE /folders` — `{ path, clearMode, targetFolder? }` for descendant cleanup
- `POST /messages` — optional `saveToFolder` for Sent append after SMTP
- `POST/PUT /drafts` — required `folder` in body
- `GET /search` — required `folder` or `folders` (comma-separated)
- `GET /messages/since` — new messages only (replaces incomplete `/sync` delta)

Removed composite endpoints: `POST /messages/batch`, `POST /drafts/:uid/send`, `GET /sync`.

Calendar REST returns **raw ICS** (`CalendarIcsResource: { calendarId, etag?, ics }`). Folder rename/move accept precomputed `{ path, toPath }`.

## Consequences

### Positive

- One place for product rules (web entities + tests)
- Proxy bundle smaller (no `ical.js` / `rrule` on server; no special-folder heuristics)
- OpenAPI describes transport shapes; domain types stay on the client
- No duplicated Trash/Sent/Drafts candidate lists between proxy and web

### Negative

- Malformed requests may reach IMAP until web is updated; proxy still coerces dangerous input
- MIME parsing remains server-side (browser cannot use `mailparser` the same way)
- More HTTP round-trips for batch ops (mitigated by client-side concurrency limit)

### Related

- [ADR 016](016-mail-api-contract-package.md) — `@mail/api` OpenAPI + Orval client
- [ADR 018](018-mail-workspace-api-gateway.md) — gateway SSO; Zulip verify at gateway
