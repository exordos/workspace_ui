# ADR 014: Native Mail Client with Mailcow IMAP Proxy

## Status

Accepted

## Context

The `/mail` section was an iframe embed over a static HTML placeholder (`VITE_MAIL_EMBED_URL`). There was no protocol integration, no SSO bridge, and no way to match the Workspace design system.

Corporate deployments use [Mailcow](https://mailcow.email/) (Dovecot IMAP + Postfix SMTP). Browsers cannot speak IMAP directly (CORS, credential handling).

## Options

1. **Iframe embed** — Mailcow SOGo/Roundcube in `EmbedFrame`. Fast, but foreign UI, weak theme integration, cookie/SSO friction.
2. **Native React UI + IMAP proxy** — REST facade in `packages/mail-proxy`, native 3-column UI in FSD layers. Full design-system control; requires backend component.
3. **JMAP in browser** — Still needs auth proxy; Mailcow JMAP support is limited compared to IMAP.

## Decision

Implement **native React mail UI** (`widgets/mail-view`, `entities/mail`) backed by **`packages/mail-proxy`** (Express + ImapFlow + Nodemailer) against Mailcow Dovecot/Postfix.

- Dev stack: `docker/mailcow` + `npm run dev:mailcow`
- Config: `VITE_MAIL_API_ORIGIN` (web), `MAILCOW_*` (proxy)
- Mail auth: separate mailbox password session (Bearer token in `sessionStorage`, cleared on app logout)
- Vite dev proxy: `/mail-api` → mail-proxy

## Consequences

### Positive

- UI matches design tokens, i18n, and layout patterns (inbox-style 3 columns)
- Security: origin allowlist on proxy CORS; passwords never stored client-side
- Clear extension path: move proxy routes into Workspace API OpenAPI later

### Negative

- Extra process in dev (Mailcow Docker + mail-proxy)
- Mailbox password prompt separate from Zulip login (until unified SSO is added)
- MVP shipped read + send; extended with message actions (reply/forward HTML, move, delete, flags, folder create)
- Attachments and server-side search remain follow-up

### API (mail-proxy `/v1/mail/*`)

| Method   | Path                  | Purpose                                     |
| -------- | --------------------- | ------------------------------------------- |
| POST     | `/session`            | Login                                       |
| DELETE   | `/session`            | Logout                                      |
| GET/POST | `/folders`            | List / create folders                       |
| GET      | `/messages`           | List messages (cursor pagination)           |
| GET      | `/messages/:uid`      | Message detail (`?markSeen=false` optional) |
| PATCH    | `/messages/:uid`      | Update flags (`\\Seen`, `\\Flagged`)        |
| DELETE   | `/messages/:uid`      | Delete (Trash move or permanent in Trash)   |
| POST     | `/messages/:uid/move` | Move message                                |
| POST     | `/messages`           | Send HTML email (multipart + Sent append)   |

### Follow-up

- Workspace API `/v1/mail/*` in production instead of standalone proxy
- Attachments, server-side search, IndexedDB cache
