# Security Architecture

> Defense-in-depth security model for Workspace UI.
> This document defines the security boundaries, threat model, and enforcement mechanisms.

## Threat Model

### Assets to Protect

| Asset                   | Location                         | Threat                                  |
| ----------------------- | -------------------------------- | --------------------------------------- |
| Zulip API key           | `localStorage` (plain)           | XSS reads token → full account takeover |
| Message content         | Zustand store (memory)           | XSS reads messages → data exfiltration  |
| User credentials        | Login form → POST → never stored | MITM intercepts → credential theft      |
| Push notification token | `localStorage` + Zulip server    | Token theft → impersonation             |
| File uploads            | API multipart → Zulip server     | Malicious file → server-side exploit    |

### Attack Surfaces

| Surface            | Vectors                                      | Mitigations                                            |
| ------------------ | -------------------------------------------- | ------------------------------------------------------ |
| Zulip message HTML | XSS via `<script>`, event handlers, SVG, CSS | DOMPurify whitelist + CSP + ESLint                     |
| User-entered URLs  | `javascript:`, `data:`, protocol injection   | `isValidUrl()` + `guard.url()` + `isSafeExternalUrl()` |
| Deep links         | `workspace://javascript:...` route injection | `isSafeDeeplinkRoute()` in Electron main               |
| Electron IPC       | Malicious renderer → main process            | Input validation on every handler                      |
| Push payloads      | Spoofed / tampered notifications             | Middleware pipeline: decrypt → validate → dedup        |
| WebView bridge     | Malicious native → web injection             | `postMessage` type checking, auth via bridge only      |
| Dependencies       | Supply chain (npm)                           | `npm audit`, Dependabot, pinned versions               |
| Build artifacts    | Source maps, debug info                      | Source maps for Sentry only, not served to users       |

## Security Layers

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Compile-Time                           │
│  TypeScript strict + noUncheckedIndexedAccess    │
│  No `any`, no `@ts-ignore`                       │
├─────────────────────────────────────────────────┤
│  Layer 2: Lint-Time                              │
│  ESLint: no-eval, no-implied-eval, no-new-func  │
│  no-script-url, jsx-a11y rules                  │
├─────────────────────────────────────────────────┤
│  Layer 3: Pre-Commit                             │
│  Secret detection, sensitive file block          │
│  dangerouslySetInnerHTML guard, large file block │
├─────────────────────────────────────────────────┤
│  Layer 4: Runtime — Input Boundary               │
│  guard.*, invariant(), isValidUrl()              │
│  sanitizeHtml(), validateFileUpload()            │
├─────────────────────────────────────────────────┤
│  Layer 5: Runtime — Transport                    │
│  Auth middleware (Basic auth header)             │
│  No-cache headers, HTTPS enforcement             │
│  Push middleware (decrypt → validate → dedup)    │
├─────────────────────────────────────────────────┤
│  Layer 6: Runtime — Output                       │
│  Logger credential redaction                     │
│  Analytics PII stripping                         │
│  Sentry beforeSend data sanitization            │
├─────────────────────────────────────────────────┤
│  Layer 7: Platform                               │
│  CSP headers (Electron + Vite)                   │
│  Electron: contextIsolation, sandbox, no node    │
│  IPC input validation                            │
│  macOS hardened runtime + notarization           │
└─────────────────────────────────────────────────┘
```

## Enforcement Matrix

| Principle             | Compile                    | Lint         | Pre-commit                      | Runtime                         | Platform                |
| --------------------- | -------------------------- | ------------ | ------------------------------- | ------------------------------- | ----------------------- |
| No code injection     | —                          | `no-eval`    | —                               | CSP                             | CSP                     |
| No raw HTML           | —                          | —            | `dangerouslySetInnerHTML` check | `sanitizeHtml()`                | CSP                     |
| URL validation        | —                          | —            | —                               | `isValidUrl()`, `guard.url()`   | `isSafeExternalUrl()`   |
| Credential protection | —                          | `no-console` | Secret detection                | Logger redaction                | `authMiddleware`        |
| Input validation      | `noUncheckedIndexedAccess` | —            | —                               | `guard.*`, `invariant()`        | IPC validation          |
| Session management    | —                          | —            | —                               | `initAuthGuard()` (24h timeout) | —                       |
| Dependency safety     | —                          | —            | —                               | —                               | `npm audit`, Dependabot |
| Push security         | —                          | —            | —                               | Middleware pipeline             | FCM encryption          |

## Modules

| Module          | Path                            | Purpose                                       |
| --------------- | ------------------------------- | --------------------------------------------- |
| HTML sanitizer  | `shared/lib/html.ts`            | DOMPurify whitelist for Zulip HTML            |
| Input validator | `shared/lib/validation.ts`      | URL, email, file, filename validation         |
| Auth guard      | `shared/lib/auth-guard.ts`      | Auth header, credential wipe, session timeout |
| Logger          | `shared/lib/logger.ts`          | Auto-redaction of 15 sensitive key patterns   |
| Guards          | `shared/lib/guards.ts`          | Runtime invariants and domain validators      |
| Push middleware | `shared/lib/push/middleware.ts` | Decrypt → parse → validate → dedup            |
| Analytics       | `shared/lib/analytics/index.ts` | PII stripping, consent management             |
| Sentry          | `shared/lib/sentry.ts`          | `beforeSend` strips auth headers + cookies    |
| Roles           | `shared/lib/roles.ts`           | `hasPermission()` for RBAC                    |
| Embed           | `shared/lib/embed.tsx`          | Iframe allowlist + sandbox policies           |
| API client      | `shared/api/client.ts`          | Auth + no-cache + retry middleware            |

## Audit History

| Date       | Scope                                                        | Findings                                                     | Status                                          |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------- |
| 2026-03-14 | Full codebase (~350 source files, 11 entities, 16 features)  | 0 Critical, 7 High (fixed), 5 Medium (3 fixed, 2 documented) | Complete                                        |
| 2026-06-04 | Full codebase (~1200 TS/TSX files, 17 entities, 22 features) | Re-audit pending                                             | See [SECURITY.md](../SECURITY.md) for reporting |
| 2026-03-14 | Electron + config (15 files)                                 | 0 Critical, 2 High (fixed), 3 Medium (1 fixed, 2 documented) | Complete                                        |

## For AI Agents

When writing security-sensitive code:

1. **Read `.cursor/rules/security.mdc`** first
2. **Use `guard.*`** for ALL external input (user input, API responses, IPC messages)
3. **Use `sanitizeHtml()`** EVERY TIME before `dangerouslySetInnerHTML`
4. **Use `isValidUrl()`** before `window.open()`, `navigate()`, iframe `src`
5. **NEVER** log credentials, tokens, message content, or PII
6. **NEVER** use `eval`, `new Function`, `document.write`
7. **ALWAYS** wrap `JSON.parse()` on external data in `try/catch`
8. **ALWAYS** validate IPC input in Electron main process
9. **Run** `npm audit` after adding dependencies
10. **Check** the Security Review Checklist in `security.mdc` before every PR
