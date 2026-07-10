# ADR 017: Mail Proxy as Thin Transport Layer

## Status

Accepted

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
| iCal parse/serialize, RRULE expansion, event validation | `packages/web/src/entities/calendar/*.lib.ts`                                 |
| REST contract                                           | `packages/mail-api/openapi/mail-proxy.openapi.json`                           |

Calendar REST returns **raw ICS** (`CalendarIcsResource: { calendarId, etag?, ics }`). Folder rename/move accept precomputed `{ path, toPath }`.

## Consequences

### Positive

- One place for product rules (web entities + tests)
- Proxy bundle smaller (no `ical.js` / `rrule` on server)
- OpenAPI describes transport shapes; domain types stay on the client

### Negative

- Malformed requests may reach IMAP until web is updated; proxy still coerces dangerous input
- MIME parsing remains server-side (browser cannot use `mailparser` the same way)

### Related

- [ADR 016](016-mail-api-contract-package.md) — `@mail/api` OpenAPI + Orval client
