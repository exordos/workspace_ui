# AGENTS.md — Workspace UI

## Project Overview

Workspace UI is an open-source corporate messenger built on the Zulip API, shipping as a desktop app (Electron), web app (SPA), PWA, and native mobile WebView — all from a single React 19 codebase. The architecture follows Feature-Sliced Design (FSD) with strict 6-layer isolation, 48 Cursor rules governing code quality, and a defensive programming model using runtime guards, invariants, and exhaustive type checking. The project supports white-label rebranding via environment variables, full i18n (English default + Russian), and two theme palettes with dark/light modes.

## Tech Stack

| Layer             | Technology                 | Details                                                              |
| ----------------- | -------------------------- | -------------------------------------------------------------------- |
| Language          | TypeScript 5.6             | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, ES2022 |
| Framework         | React 19                   | Functional components, hooks, Suspense, `React.lazy`                 |
| Build             | Vite 6                     | SWC transpiler, tree-shaking, source maps, 400KB chunk budget        |
| Styling           | Tailwind CSS 3.4           | CSS custom properties, 42 semantic design tokens, 4px grid           |
| State             | Zustand 4.5                | 11 entity stores with cached selectors                               |
| Routing           | react-router-dom 7         | Lazy-loaded routes, nested layouts                                   |
| UI Primitives     | Radix UI                   | dialog, dropdown-menu, scroll-area, tabs, tooltip                    |
| API               | Zulip REST + Workspace API | Middleware pipeline: auth → logging → retry → parse                  |
| Real-time         | Long-polling event loop    | `shared/lib/event-loop.ts`, background-tab resilient                 |
| Video Calls       | Jitsi Meet React SDK       | PiP mode, call participants store                                    |
| Push              | Firebase Cloud Messaging   | `shared/lib/push/`, Zulip token sync                                 |
| Desktop           | Electron 35                | electron-builder, macOS code signing + notarization                  |
| PWA               | vite-plugin-pwa + Workbox  | Install prompt, app badge, offline caching                           |
| i18n              | Custom lightweight engine  | en (default) + ru, 3 Russian plural forms, interpolation             |
| Unit Testing      | Vitest 4                   | 2100+ tests, 80+ files, Jest-compatible API                          |
| Component Testing | @testing-library/react     | + user-event for realistic interactions                              |
| API Mocking       | MSW 2                      | Service worker interceptors                                          |
| E2E Testing       | Playwright 1.58            | 4 specs, Chromium                                                    |
| Linting           | ESLint 9                   | Flat config, type-checked, jsx-a11y, import-x                        |
| Formatting        | Prettier                   | Enforced via pre-commit hook                                         |
| Commit Lint       | commitlint                 | Conventional Commits format                                          |
| Error Tracking    | Sentry 10                  | Opt-in via `VITE_SENTRY_DSN`, PII redaction                          |
| Analytics         | GA4 + Yandex Metrica       | Opt-in, PII auto-stripped                                            |
| Logging           | Custom structured logger   | Scoped, 15 auto-redaction patterns                                   |
| CI                | GitHub Actions + GitLab CI | Dual pipeline                                                        |
| Monorepo          | Lerna 7 + npm workspaces   | 3 packages: web, electron, mock-server                               |
| Icons             | vite-plugin-svgr           | 43 SVG icons as React components                                     |
| Sanitization      | DOMPurify                  | HTML whitelist for Zulip content                                     |

## Architecture

Feature-Sliced Design with strict downward dependency flow:

```
app → pages → widgets → features → entities → shared
```

### Monorepo Layout

```
workspace_ui/
├── packages/
│   ├── web/              React SPA (Vite) — 289 source files, 75 test files
│   ├── electron/         Desktop shell (Windows, macOS, Linux)
│   └── mock-server/      Express development API server
├── e2e/                  Playwright E2E tests (4 specs)
├── docs/                 8 technical references + 7 ADRs
├── scripts/              Build utilities (licenses, versioning, design tokens)
├── .cursor/rules/        48 AI agent rules
├── .cursor/skills/       4 AI skills
└── .cursor/prompts/      6 prompt templates
```

### Source Directory Structure

```
packages/web/src/
├── app/                              Entry, router, providers, event loop
│   ├── app.tsx                       Root component + route definitions
│   ├── shared/lib/event-loop.ts      Zulip long-poll event loop (via layout hook)
│   ├── webview-shell.tsx             WebView mode (no sidebar/top-bar chrome)
│   ├── app.styles.css                Global styles
│   └── contexts/                     App-level contexts (search, right-drawer)
│
├── pages/                            9 route pages (all lazy-loaded)
│   ├── activity/                     Starred messages, mentions, drafts
│   ├── calendar/                     Calendar view
│   ├── calls/                        Voice/video call history
│   ├── chat/                         Stream/topic/DM chat (main view)
│   ├── feed/                         Combined message feed
│   ├── inbox/                        Unread inbox aggregation
│   ├── licenses/                     OSS dependency license list
│   ├── login/                        Authentication flow
│   └── mail/                         Email integration
│
├── widgets/                          10 composite UI blocks
│   ├── chat-view/                    Chat header with actions
│   ├── folder-rail/                  Folder navigation rail
│   ├── layout/                       App shell (sidebar + content + drawers)
│   ├── message-composer/             Rich message input + file upload
│   ├── message-list/                 Message list + message bubbles
│   ├── profile-drawer/               User profile side panel
│   ├── right-panel/                  Right drawer + detail panels
│   ├── search-modal/                 Global search dialog
│   ├── sidebar/                      Navigation sidebar + 5 sub-lists
│   └── top-bar/                      Top navigation bar
│
├── features/                         16 user-facing scenarios
│   ├── ai-reply/                     AI-generated reply suggestions (API + store + UI)
│   ├── chat-info/                    Chat info panel (DM + channel details)
│   ├── create-chat/                  Create DM / group / channel dialogs
│   ├── instance-switch/              Multi-instance Zulip switcher UI
│   ├── jitsi-call/                   Jitsi Meet video call modal + PiP
│   ├── manage-folders/               Folder CRUD + chat assignment
│   ├── media-viewer/                 Image/video viewer overlay
│   ├── mention-suggest/              @mention autocomplete in composer
│   ├── message-readers/              "Read by" list for messages
│   ├── mute-chat/                    Mute/unmute streams + topics
│   ├── pin-chat/                     Pin/unpin chats to sidebar
│   ├── settings/                     User settings panel
│   ├── sticker-picker/               Sticker pack selection + sending
│   ├── theme-picker/                 Theme palette picker UI
│   ├── typing-indicator/             Typing indicator in DMs
│   └── user-profile/                 User profile page
│
├── entities/                         11 domain models (Zustand stores + API)
│   ├── call/                         Call participants store
│   ├── chat-list/                    Chat list, sorting, unread counts
│   ├── draft/                        Message drafts store
│   ├── feed/                         Activity feed store
│   ├── folder/                       Folder API integration
│   ├── inbox/                        Unread inbox aggregation
│   ├── instance/                     Zulip instance management + persistence
│   ├── message/                      Messages store + current chat state
│   ├── sticker/                      Sticker packs, API, types
│   ├── theme/                        Theme mode + palette store
│   └── user/                         Users store + presence API
│
├── shared/                           Cross-cutting infrastructure
│   ├── ui/                           10 files: Avatar, Badge, Button, CallBubble,
│   │                                 ErrorBoundary, Icon, PresenceIndicator,
│   │                                 ScrollArea, StickerMessage, index.ts
│   ├── lib/                          36 utility modules + 4 subsystems (below)
│   ├── api/                          client.ts, workspace-client.ts, index.ts
│   ├── config/                       Constants
│   └── assets/icons/                 43 SVG icons (via vite-plugin-svgr)
│
├── i18n/                             Internationalization
│   └── locales/                      en.json, ru.json
├── test/                             Test infra: setup, factories, MSW handlers, render helper
└── generated/                        Auto-generated (licenses.json)
```

### Data Flow

1. `main.tsx` → `app/app.tsx` — mounts router, providers, layout
2. `widgets/layout/layout-zulip-event-loop.hook.ts` + `shared/lib/event-loop.ts` — registers Zulip event queue, starts long-polling
3. `shared/api/client.ts` — all HTTP goes through middleware pipeline (auth → logging → retry)
4. Entity stores (`entities/*/`) — single source of truth, cached selectors
5. Components subscribe via `useStore((s) => s.field)` — minimal selectors only

### FSD Slice Convention

```
slice-name/
  slice-name.api.ts       API calls
  slice-name.model.ts     Zustand store
  slice-name.types.ts     TypeScript types
  slice-name.lib.ts       Pure utilities
  slice-name.ui.tsx       React component(s)
  slice-name.test.ts      Tests (co-located)
```

Import rule: use **concrete segment files** (no barrel `index.ts` re-exports). Example: `import { useUsersStore } from '~/entities/user/user.model'`. See `.cursor/rules/no-barrel-index.mdc`.

## Key Modules

### Shared Utilities (`shared/lib/`)

| Module                 | File                    | Purpose                                                         |
| ---------------------- | ----------------------- | --------------------------------------------------------------- |
| **env**                | `env.ts`                | Centralized env vars — single access point for all `VITE_*`     |
| **brand**              | `brand.ts`              | White-label config — NEVER hardcode "Workspace"                 |
| **logger**             | `logger.ts`             | Structured scoped logging, 15 auto-redaction patterns           |
| **guards**             | `guards.ts`             | Runtime invariants, domain guards, type guards, `safeCatch`     |
| **roles**              | `roles.ts`              | Zulip 5-level hierarchy + 20 granular `hasPermission()` checks  |
| **shortcuts**          | `shortcuts.ts`          | 25 keyboard shortcuts with context scoping                      |
| **validation**         | `validation.ts`         | URL, email, file upload, filename sanitization, MIME detection  |
| **html**               | (in shared/lib/)        | DOMPurify HTML sanitization for Zulip message content           |
| **format**             | `format.ts`             | Date/time/size formatting utilities                             |
| **auth-guard**         | `auth-guard.ts`         | `buildAuthHeader()`, session timeout (24h), `wipeCredentials()` |
| **perf**               | `perf.ts`               | Timers, Web Vitals, performance marks, long task detection      |
| **visibility**         | `visibility.ts`         | Background tab resilience, event loop resume on visibility      |
| **network**            | `network.ts`            | Online/offline detection, auto-reconnect                        |
| **presence**           | `presence.ts`           | User presence tracking with heartbeat                           |
| **sentry**             | `sentry.ts`             | Error tracking (opt-in via `VITE_SENTRY_DSN`), PII redaction    |
| **notifications**      | `notifications.ts`      | Unified: Electron IPC / Web Notifications API                   |
| **updater**            | `updater.ts`            | Unified: Electron auto-updater / PWA SW update                  |
| **os-integration**     | `os-integration.ts`     | Badge count, progress bar, tray icon, login items               |
| **electron**           | `electron.ts`           | Electron detection + IPC bridge                                 |
| **pwa**                | `pwa.ts`                | PWA install prompt + detection                                  |
| **webview**            | `webview.ts`            | WebView bridge for native iOS/Android                           |
| **deeplinks**          | `deeplinks.ts`          | URL builders, `workspace://` protocol                           |
| **embed**              | `embed.tsx`             | Secure iframe embedding with origin allowlist                   |
| **ai-context**         | `ai-context.ts`         | `window.__ai__` context bridge for AI agents                    |
| **devtools**           | `devtools.ts`           | `window.__dev__` console tools (dev only)                       |
| **touch**              | `touch.ts`              | Touch gesture handling                                          |
| **gestures**           | `gestures.ts`           | Gesture recognition utilities                                   |
| **focus**              | `focus.ts`              | Focus management utilities                                      |
| **call-state**         | `call-state.ts`         | Call state management                                           |
| **jitsi**              | `jitsi.ts`              | Jitsi Meet integration utilities                                |
| **avatar**             | `avatar.ts`             | Avatar URL generation                                           |
| **navigation-history** | `navigation-history.ts` | Navigation history tracking                                     |

### Shared Subsystems (`shared/lib/`)

| Subsystem     | Path         | Purpose                                                               |
| ------------- | ------------ | --------------------------------------------------------------------- |
| **themes**    | `themes/`    | Palette engine: Orange Warm + Blue Cold, 42 tokens, runtime switching |
| **analytics** | `analytics/` | GA4 + Yandex Metrica, page views, custom events, consent              |
| **plugins**   | `plugins/`   | Plugin registry, lifecycle hooks, dynamic loading, typed API          |
| **push**      | `push/`      | FCM push notifications, Zulip token registration, middleware          |

### Shared API (`shared/api/`)

| File                  | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `client.ts`           | Middleware pipeline client (auth → logging → retry → parse)         |
| `workspace-client.ts` | Workspace-specific API extensions                                   |
| `index.ts`            | Legacy entrypoints only — prefer importing `*.ts` segments directly |

### Shared UI Primitives (`shared/ui/`)

| Component         | File                     |
| ----------------- | ------------------------ |
| Avatar            | `avatar.tsx`             |
| Badge             | `badge.tsx`              |
| Button            | `button.tsx`             |
| CallBubble        | `call-bubble.tsx`        |
| ErrorBoundary     | `error-boundary.tsx`     |
| Icon              | `icon.tsx`               |
| PresenceIndicator | `presence-indicator.tsx` |
| ScrollArea        | `scroll-area.tsx`        |
| StickerMessage    | `sticker-message.tsx`    |

### i18n (`i18n/`)

| File              | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `index.ts`        | `t()`, `setLocale()`, `getLocale()`, `useTranslation()` |
| `locales/en.json` | English translations (default)                          |
| `locales/ru.json` | Russian translations                                    |

## Coding Standards

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`
- `import type { X }` for type-only imports (enforced by compiler)
- No `any` — use `unknown` + type guards or `shared/lib/guards.ts`
- Path alias `~/` → `src/`
- Array index access returns `T | undefined` — handle with `?.`, `??`, or `!` after length check

### FSD Imports (STRICT)

- Import from **concrete files**: `import { useUsersStore } from '~/entities/user/user.model'` (same for `*.api.ts`, `*.ui.tsx`, `shared/ui/icon`, etc.). No barrel-only re-export folders — see `.cursor/rules/no-barrel-index.mdc`.
- Dependencies flow downward only: `app → pages → widgets → features → entities → shared`
- Cross-entity access only at the same level or downward

### Defensive Programming

- `invariant(condition, message)` for conditions that must be true
- `guard.userId()`, `guard.streamId()`, `guard.messageId()` before API calls
- `assertNever(x)` in every exhaustive switch over union types
- `safeCatch(fn, label)` for event listeners and store subscribers
- `sanitizeHtml()` before any `dangerouslySetInnerHTML`
- `guard.url()` before `window.open()`, `navigate()`, or iframe src

### React Components

- Functional components with `React.FC<Props>`, props interface alongside component
- Lazy-loading for ALL page components via `React.lazy()`
- `ErrorBoundary` on every route
- Zustand selectors: `useStore((s) => s.field)` — never destructure without selector
- `React.memo` on ALL list item components (rendered in `.map()`)
- `useCallback`/`useMemo` for props passed to children
- No inline objects/functions in JSX props — memoize them

### Zustand Stores

- Getters that derive data (sort/filter/map) MUST cache by input reference
- Never return `[]`, `{}`, `new Map()` as fallback — use module-level constant
- `logStoreAction("storeName", "actionName", data)` in every action
- Individual field selectors: `useStore((s) => s.field)`, not `useStore()`

### Styling

- Tailwind CSS with semantic tokens only — no `bg-[#hex]` or `text-[Npx]`
- 42 design tokens across 2 palettes (Orange Warm, Blue Cold) × 2 modes (dark, light)
- Spacing on 4px grid (Tailwind scale) — round Figma values to nearest step
- z-index: named layers only (`z-base` through `z-pip`)
- Design system > Pixel Perfect — tokens are the contract, mockups are guides

### Logging

- `createLogger("scope")` from `~/shared/lib/logger` — NEVER `console.log`
- `logApiCall()` for API requests, `logStoreAction()` for store mutations, `logEvent()` for real-time
- NEVER log credentials, PII, message content, or request/response bodies
- Auto-redaction catches: `apiKey`, `password`, `token`, `authorization`, `secret`, `csrf`, `session`

### Security

- `sanitizeHtml()` before `dangerouslySetInnerHTML` (DOMPurify whitelist)
- `isValidUrl()` / `isValidRealmUrl()` for user-supplied URLs
- `hasPermission()` / `canEditMessage()` for role-dependent actions
- `buildAuthHeader()` from auth-guard — never construct auth headers manually
- `validateFileUpload()` + `detectImageMime()` for file uploads
- CSP headers in Electron + Vite server
- ESLint: `no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url`
- Pre-commit: secret detection, `dangerouslySetInnerHTML` audit, sensitive file block

### i18n

- `t("section.action")` from `~/i18n` — never hardcode UI strings
- New strings → add to BOTH `en.json` and `ru.json`
- Plurals: English (2 forms: `_one`, `_other`), Russian (3 forms: `_one`, `_few`, `_many`)
- Interpolation: `t("key", { variable: value })`

### White-Label

- `brand.*` from `~/shared/lib/brand` — never hardcode "Workspace"
- 20+ brand params via `VITE_BRAND_*` env vars
- All in `index.html`: `%VITE_BRAND_*%` syntax, Vite substitutes at build time

### Memory Leak Prevention

- Every `useEffect` with side effects MUST return cleanup
- Every `addEventListener` has matching `removeEventListener` (same function reference)
- Every `setInterval` has `clearInterval` in cleanup
- Every async operation uses cancellation flag or `AbortController`
- Module-level `init*()` functions MUST return `() => void` cleanup
- No anonymous listeners in `addEventListener` — unreferenceable = unleakable

### Testing

- TDD cycle: RED → GREEN → REFACTOR (mandatory for new features)
- Tests live next to source: `feature.ts` → `feature.test.ts`
- Factories: `createMessage()`, `createUser()`, `createStream()`, `createInstance()`
- MSW for API mocking, `vi.useFakeTimers()` for time-dependent tests
- Coverage targets: shared/lib 90%+, entities 85%+, features 80%+

### Commits

- Conventional Commits: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`, `ci`, `build`, `revert`
- Scopes: `chat`, `auth`, `sidebar`, `electron`, `i18n`, `theme`, `api`, `pwa`, `security`, `a11y`
- Subject: imperative mood, lowercase, max 100 chars, no period
- Pre-commit: lint-staged + secret detection + large file block + `dangerouslySetInnerHTML` audit
- commit-msg: commitlint validates Conventional Commits format

## Cursor Rules (48)

### Architecture (3)

`project-architecture`, `fsd-architecture`, `scalability`

### Code Quality (5)

`react-components`, `zustand-stores`, `tailwind-theming`, `defensive-programming`, `comments`

### Design (2)

`design-reference`, `design-system`

### Testing (2)

`testing`, `e2e-testing`

### Security & Reliability (5)

`security`, `performance`, `memory-leaks`, `logging`, `commits`

### Infrastructure (4)

`electron-desktop`, `env-variables`, `cross-platform`, `ci-cd`

### Domain (4)

`i18n`, `white-label`, `roles-permissions`, `keyboard-shortcuts`

### Integration (5)

`api-middleware`, `embedding`, `background-tabs`, `pwa-notifications`, `push-notifications`

### Features (6)

`ai-integration`, `ai-replies`, `stickers`, `analytics`, `presence`, `call-state`

### Platform & UX (5)

`focus-tabindex`, `z-index`, `touch`, `webview`, `deeplinks`

### Operations (7)

`caching`, `auto-update`, `plugins`, `network-awareness`, `versioning`, `open-source`, `debugging`

## Cursor Skills (4)

| Skill                  | Path                                         | Trigger                          | Phases                                                                   |
| ---------------------- | -------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| **full-stack-feature** | `.cursor/skills/full-stack-feature/SKILL.md` | New feature / screen / entity    | Plan → Types → Store → API → UI → Integration → Quality Gates → Docs     |
| **code-review**        | `.cursor/skills/code-review/SKILL.md`        | Review / audit / refactor        | 12-category checklist (FSD, TS, Security, Perf, Memory, A11y, i18n, ...) |
| **bug-investigation**  | `.cursor/skills/bug-investigation/SKILL.md`  | Bug report / unexpected behavior | Reproduce → Diagnose → Test (TDD) → Fix → Verify                         |
| **design-to-code**     | `.cursor/skills/design-to-code/SKILL.md`     | Figma mockup → React component   | Extract tokens → Map to design system → Implement → Verify               |

## Prompt Templates (`.cursor/prompts/`)

| Template          | File                | Use case                                   |
| ----------------- | ------------------- | ------------------------------------------ |
| New Feature       | `new-feature.md`    | Implement a new feature end-to-end         |
| New Entity        | `new-entity.md`     | Create a new FSD entity with Zustand store |
| Bug Fix           | `bug-fix.md`        | Investigate and fix a bug                  |
| Code Review       | `code-review.md`    | Review a file or directory                 |
| Security Audit    | `security-audit.md` | Check for security vulnerabilities         |
| Performance Audit | `perf-audit.md`     | Find and fix performance issues            |

## Agent Workflow Optimization

This project is optimized for reliable agent workflows in Cursor:

- **`.cursorrules`** — global always-on context injected into every conversation
- **48 Cursor rules** — domain-specific rules activated by glob patterns
- **4 skills** — deep multi-phase workflows for complex tasks
- **6 prompt templates** — copy-paste starters for common tasks
- **`AGENTS.md`** — comprehensive machine-readable project overview (this file)
- **Test factories** (`test/factories.ts`) — generate valid test data in one call
- **TDD templates** (`test/tdd-templates.ts`) — reference patterns for each code category

### Parallel Agent Strategy

For complex tasks, dispatch up to 4 agents simultaneously:

```
Agent A: Types + Store + Tests       (entities/)
Agent B: API functions + MSW handlers (shared/api/, test/)
Agent C: UI components               (features/ or widgets/)
Agent D: Documentation + Cursor rule  (docs/, .cursor/rules/)
```

### Verification (after every change)

```bash
npx tsc --noEmit && npx vitest run
```

## Running the Project

```bash
npm install

# Development
npm run dev:web              # Vite → http://localhost:5173
npm run dev:electron         # Web + Electron desktop window
npm run dev                  # All packages in parallel
npm run dev:mock             # Mock API server only

# Quality (CI gate)
npm run check                # typecheck + lint + test (all-in-one)
npm run test                 # Vitest (2100+ tests)
npm run test:watch           # Vitest watch mode
npm run test:coverage        # V8 coverage report
npm run e2e                  # Playwright headless
npm run e2e:ui               # Playwright interactive UI
npm run lint                 # ESLint
npm run format               # Prettier
npm run typecheck            # tsc --noEmit

# Build
npm run package:electron     # Desktop installer (current OS)
npm run package:electron:win # Windows
npm run package:electron:mac # macOS (code signing + notarization)
npm run package:electron:linux # Linux (AppImage, deb, rpm)

# Utilities
npm run licenses             # Regenerate OSS license list
npm run version:bump <patch|minor|major>  # Bump semver + CHANGELOG
```

> **Requirements:** Node.js ≥ 22 (`.nvmrc`), npm 10+

## Adding a New Feature

1. **Types** → `entities/<name>/<name>.types.ts`
2. **API** → `entities/<name>/<name>.api.ts` or `shared/api/`
3. **Store** → `entities/<name>/<name>.model.ts` (with `logStoreAction`)
4. **Feature** → `features/<action>/` (if user-facing scenario)
5. **Widget** → `widgets/<name>/` (if composite UI block)
6. **Page** → `pages/<name>/` (if new route, `React.lazy`)
7. **i18n** → `i18n/locales/en.json` + `ru.json`
8. **Permissions** → `hasPermission()` checks via `shared/lib/roles`
9. **Shortcuts** → `SHORTCUTS[]` catalog if keyboard-triggerable
10. **Tests** → `*.test.ts(x)` alongside source (TDD: write first)
11. **Docs** → update relevant `docs/` files

## Documentation Index

### Project Files

| Document             | Content                                                       |
| -------------------- | ------------------------------------------------------------- |
| `README.md`          | Quick start, architecture, features, scripts, audience guides |
| `CONTRIBUTING.md`    | Development workflow, standards, quality gates                |
| `CHANGELOG.md`       | Release history (semver)                                      |
| `SECURITY.md`        | Vulnerability reporting policy                                |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1                                      |
| `LICENSE`            | Apache License 2.0                                            |

### Technical References (`docs/`)

| Document                        | Content                                          |
| ------------------------------- | ------------------------------------------------ |
| `docs/fsd-architecture.md`      | FSD layer mapping and conventions                |
| `docs/STORES_REFERENCE.md`      | Zustand store APIs (all 11 entities)             |
| `docs/API_CLIENT_REFERENCE.md`  | API middleware pipeline + endpoints              |
| `docs/COMPONENT_CATALOG.md`     | React component inventory                        |
| `docs/INTEGRATION_GUIDE.md`     | How to add new features (step-by-step)           |
| `docs/USE_CASES.md`             | User scenarios (implemented / partial / planned) |
| `docs/MACOS_SIGNING.md`         | macOS code signing + notarization                |
| `docs/SECURITY_ARCHITECTURE.md` | Security model deep dive                         |

### Architectural Decision Records (`docs/adr/`)

| ADR                                            | Decision                                    |
| ---------------------------------------------- | ------------------------------------------- |
| `docs/adr/000-template.md`                     | ADR template                                |
| `docs/adr/001-react-zustand-tailwind.md`       | React + Zustand + Tailwind stack choice     |
| `docs/adr/002-electron-pwa-dual-target.md`     | Electron + PWA dual target                  |
| `docs/adr/003-fsd-architecture.md`             | FSD architecture adoption                   |
| `docs/adr/004-dual-ci.md`                      | Dual CI (GitHub Actions + GitLab)           |
| `docs/adr/005-white-label.md`                  | White-label strategy                        |
| `docs/adr/006-versioning.md`                   | Semantic Versioning with synced monorepo    |
| `docs/adr/007-open-source.md`                  | Open source (Apache 2.0)                    |
| `docs/adr/008-workspace-http-path-defaults.md` | Gateway vs vanilla Zulip HTTP path defaults |
