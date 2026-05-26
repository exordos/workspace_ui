# Nginx deployment examples

## `workspace-same-origin.conf.example`

Production nginx config for hosting Workspace UI **on the same origin** as the Zulip
balancer (e.g. `https://workspace.example.com` serves both SPA and Zulip backend).

### Why backend `location` blocks matter

The default `try_files $uri $uri/ /index.html;` directive serves `index.html` for
**every** unknown path — including `/accounts/login/google/`. That makes React Router
mount the SPA login page instead of letting the browser follow Zulip's OIDC redirect.

The example config places backend `location` blocks **before** the SPA fallback so
nginx proxies `/accounts/*`, `/api/*`, `/user_uploads/*`, etc. directly to Zulip.

### Paths proxied to backend

Kept in sync with [`packages/web/src/shared/config/backend-bypass-paths.ts`](../../packages/web/src/shared/config/backend-bypass-paths.ts):

| Prefix              | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `/accounts`         | Login, registration, social auth (OIDC/SAML)         |
| `/api`              | Zulip REST API (`/api/v1/...`)                       |
| `/json`             | Legacy session-auth JSON endpoint                    |
| `/workspace`        | Workspace gateway REST                               |
| `/legacy`           | Legacy backend endpoints                             |
| `/user_uploads`     | Uploaded files                                       |
| `/user_avatars`     | User avatar files                                    |
| `/external_content` | Image proxy                                          |
| `/avatar`           | User avatars (Zulip canonical path)                  |
| `/thumbnail`        | Image thumbnails                                     |
| `/complete`         | OIDC/social auth completion (`/complete/oidc/`)      |
| `/login`            | Top-level login redirect (overrides SPA `/login`)    |
| `/logout`           | Server-side logout                                   |
| `/register`         | Account registration                                 |
| `/completed`        | Post-deactivation page                               |
| `/scim`             | SCIM 2.0 provisioning                                |
| `/lk`               | Personal account / cabinet routes (`/lk`, `/lk/...`) |

### About `/login`

The SPA has its own `<Route path="/login">` for credential-based auth. In a
same-origin deployment the backend `/login` takes priority (it's in the bypass
list) — opening `/login` will reach the Zulip backend, not the SPA login form.
If you still need the SPA login form, navigate to it through the app shell
(it's auto-shown when no instance is configured) or change the SPA route to a
non-conflicting path such as `/sign-in`.

### Usage

```bash
# 1. Copy the template
sudo cp workspace-same-origin.conf.example /etc/nginx/sites-available/workspace.conf

# 2. Edit: server_name, ssl_certificate, upstream, root
sudo $EDITOR /etc/nginx/sites-available/workspace.conf

# 3. Enable and reload
sudo ln -s /etc/nginx/sites-available/workspace.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Verifying

After deployment:

```bash
# Should return 302 from Zulip (not 200 HTML from SPA)
curl -I https://workspace.example.com/accounts/login/google/

# Should return JSON (not HTML)
curl https://workspace.example.com/api/v1/server_settings
```

If `curl /accounts/login/google/` returns `Content-Type: text/html` — nginx is still
serving the SPA. Re-check the order of `location` blocks.

### Service Worker caveat

If users visited the app **before** this fix, an old service worker may still
intercept navigation to `/accounts/...` (the SW caches `navigateFallback: /index.html`).

After deploying the new build, users must either:

1. Wait for the SW to update (auto-prompt: "New version available").
2. Or hard-refresh (DevTools → Application → Service Workers → Unregister).

The new build adds a `navigateFallbackDenylist` so future SWs no longer intercept
backend paths. See [`packages/web/vite.config.ts`](../../packages/web/vite.config.ts).

## Alternative: separate origins

If you control DNS, the simplest setup is **separate subdomains**:

- `workspace.example.com` — SPA (this nginx config without backend `location` blocks)
- `zulip.example.com` — Zulip backend (vanilla Zulip nginx)

Then set `VITE_WORKSPACE_API_ORIGIN=https://zulip.example.com` in the SPA `.env`.
No path conflicts, no service-worker issues with `/accounts`.
