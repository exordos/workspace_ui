# Mailcow (local development)

Workspace mail uses a native React client backed by `packages/mail-proxy`, which talks to Dovecot IMAP and Postfix SMTP on a [mailcow-dockerized](https://github.com/mailcow/mailcow-dockerized) stack.

## Requirements

- Docker Engine + Docker Compose v2.20+ (`docker compose`)
- At least 6 GB RAM for Mailcow
- Host ports: 25, 465, 587, 993, 80, 443

## Quick start

```bash
# 1. Start Mailcow (clone + config on first run, then docker compose up)
npm run dev:mailcow

# 2. Add to /etc/hosts:
#    127.0.0.1 mail.example.test

# 3. Trusted HTTPS (pick one):
#    brew install mkcert && mkcert -install   # recommended — no browser warning
#    npm run dev:mailcow:certs                # regenerates certs (mkcert or OpenSSL)
#    npm run dev:mailcow:trust-cert           # macOS: trust OpenSSL cert in Keychain
#
# 4. Admin UI: https://mail.example.test/admin
#    Default: admin / moohoo — change immediately

# 5. Create mailbox: Email → Mailboxes → Add mailbox
#    Example: user@mail.example.test
#    Protocol access: enable IMAP, SMTP, and DAV (required for native calendar)

# 6. mail-proxy + web
npm run dev:mail-proxy
#    Swagger UI: http://localhost:8787/docs  |  OpenAPI: /openapi.json
#    Static export: packages/mail-proxy/docs/swagger.html (npm run docs:mail-proxy)
npm run dev:web   # VITE_MAIL_API_ORIGIN=/mail-api in packages/web/.env.local
```

### Compose commands

| npm script                       | Action                                      |
| -------------------------------- | ------------------------------------------- |
| `npm run dev:mailcow`            | Bootstrap + `docker compose up -d`          |
| `npm run dev:mailcow:down`       | `docker compose down`                       |
| `npm run dev:mailcow:logs`       | Follow container logs                       |
| `npm run dev:mailcow:certs`      | Regenerate dev TLS cert (mkcert or OpenSSL) |
| `npm run dev:mailcow:trust-cert` | macOS: trust self-signed cert in Keychain   |

## HTTPS / `ERR_CERT_AUTHORITY_INVALID`

Mailcow uses HTTPS on port 443. For local dev we generate a certificate and disable Let's Encrypt (`SKIP_LETS_ENCRYPT=y`).

**Recommended — [mkcert](https://github.com/FiloSottile/mkcert)** (browser trusts automatically):

```bash
brew install mkcert
mkcert -install
npm run dev:mailcow:certs
```

**Fallback — OpenSSL self-signed** (browser warning until trusted):

```bash
npm run dev:mailcow:certs
npm run dev:mailcow:trust-cert   # macOS only
```

Certs are cached in `docker/mailcow/certs/<hostname>/` and copied to Mailcow `data/assets/ssl/`. Force regeneration: `MAILCOW_TLS_FORCE=1 npm run dev:mailcow:certs`.

Direct compose (after bootstrap):

```bash
docker compose --project-directory docker/mailcow -f docker/mailcow/docker-compose.yml up -d
```

Entry file: [`docker-compose.yml`](docker-compose.yml) includes `mailcow-dockerized/docker-compose.yml`.

### Hostname override

```bash
MAILCOW_HOSTNAME=mail.my.test MAILCOW_TZ=Europe/Moscow npm run dev:mailcow
```

Set before the first run (before `mailcow.conf` is generated). To change later, edit `docker/mailcow/mailcow-dockerized/mailcow.conf` and re-run compose.

## mail-proxy env

Copy `packages/mail-proxy/.env.example` → `packages/mail-proxy/.env`:

```env
MAIL_PROXY_PORT=8787
MAILCOW_IMAP_HOST=127.0.0.1
MAILCOW_IMAP_PORT=993
MAILCOW_SMTP_HOST=127.0.0.1
MAILCOW_SMTP_PORT=465
MAILCOW_SOGO_URL=https://mail.example.test
MAILCOW_CALDAV_PREFIX=/SOGo/dav
MAILCOW_TLS_REJECT_UNAUTHORIZED=false
MAIL_PROXY_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Calendar (`/calendar`) uses the same mail-proxy Bearer session and `MAILCOW_SOGO_URL` for SOGo CalDAV.

### CalDAV troubleshooting

If mail sign-in works but calendar shows **401 / authentication failed**:

1. **Protocol access (most common)**: Mailcow → _Edit mailbox_ → _Protocol access_ → enable **DAV** (CalDAV/CardDAV). `imap_access` and `sogo_access` can be on while `dav_access` is off — SOGo web calendar works, but CalDAV via nginx `/sogo-auth` returns 401.
2. Open **https://mail.example.test/SOGo/so/** with the same credentials — confirms SOGo account is active.
3. **2FA / TFA**: CalDAV cannot use a second factor. Create an **app-specific password** in Mailcow and use it for mail + calendar sign-in.
4. Restart `mail-proxy` after changing `MAILCOW_SOGO_URL` — startup log prints `sogoUrl`.
5. Dev TLS: keep `MAILCOW_TLS_REJECT_UNAUTHORIZED=false` for the self-signed Mailcow cert.

The proxy tries both `/SOGo/dav/user%40domain/Calendar/` and `/SOGo/dav/user@domain/Calendar/` automatically.

## Files

| Path                  | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `docker-compose.yml`  | Workspace compose entry (includes upstream stack)        |
| `mailcow-dockerized/` | Upstream clone (gitignored, created by bootstrap)        |
| `.env`                | Symlink to `mailcow-dockerized/mailcow.conf` for Compose |
| `.env.example`        | Dev defaults reference                                   |
