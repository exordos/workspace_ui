# Workspace UI

Open-source Workspace client. The current Workspace deployment is
Messenger-only: builds set `VITE_MESSENGER_ONLY=true`, so Mail and Calendar
navigation, routes, background work, and event reducers are not exposed. The
source tree keeps those domain slices for future protocol-based integrations.

The UI talks to one IAM-authenticated Workspace backend and receives Messenger
updates through one durable REST/WebSocket event contract.

Single React codebase, multiple targets:

- Web SPA
- PWA
- Electron desktop app (Windows, macOS, Linux)
- Embedded WebView shell (mobile hosts)

## Highlights

- React 19 + TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`)
- Feature-Sliced Design (FSD): `app -> pages -> widgets -> features -> entities -> shared`
- Zustand domain stores + API middleware pipeline
- Tailwind design tokens (dark/light + multiple palettes)
- i18n (English + Russian)
- 4500+ tests (Vitest + Testing Library + MSW + Playwright)
- Security-focused defaults: CSP, sanitization, guarded APIs, secret checks in hooks

## Requirements

- Node.js 22+
- npm 10+

Use `.nvmrc`:

```bash
nvm use
```

## Quick Start

```bash
git clone https://github.com/exordos/workspace_ui.git
cd workspace_ui
npm install
cp packages/web/.env.example packages/web/.env
npm run dev:web
```

Default app URL: `http://localhost:5173`

## Main Scripts

| Command                    | Purpose                            |
| -------------------------- | ---------------------------------- |
| `npm run dev:web`          | Web app in Vite dev mode           |
| `npm run dev:electron`     | Web + Electron desktop shell       |
| `npm run dev`              | Monorepo dev mode (parallel)       |
| `npm run check`            | Typecheck + lint + tests           |
| `npm run test`             | Unit/integration tests             |
| `npm run e2e`              | Playwright E2E                     |
| `npm run lint`             | ESLint                             |
| `npm run typecheck`        | TypeScript checks                  |
| `npm run package:electron` | Build desktop package (current OS) |

## Architecture

Workspace UI uses Feature-Sliced Design with strict downward dependencies:

```text
app -> pages -> widgets -> features -> entities -> shared
```

Core flow:

1. `main.tsx` mounts the app shell and routes
2. `widgets/layout/layout-messenger-event-loop.hook.ts` + `shared/lib/event-loop.ts` run REST epoch catch-up and the common `/api/workspace/v1/events/ws` stream
3. `shared/api/client.ts` handles auth/logging/retry middleware
4. IndexedDB snapshots render Messenger entities, messages, and protected files
   cache-first; API and realtime events refresh only affected records
5. A server-expired event cursor (HTTP `410` or WebSocket close `4410`) clears
   the account-scoped cache before a full resync
6. Zustand entity stores provide live UI state through minimal selectors

Historical catch-up never produces desktop notifications. Notifications become
eligible only after the first realtime `ready` frame confirms that initial
synchronization has completed.

## Repository Structure

```text
workspace_ui/
├── packages/
│   ├── web/              React SPA
│   ├── electron/         Electron shell
│   └── workspace-api/    Orval-generated @workspace/api client
├── docs/             Technical docs + ADRs
├── e2e/              Playwright tests
├── scripts/          Tooling utilities
└── .cursor/          Agent rules, skills, prompts
```

## Documentation Map

### Project Docs

- `AGENTS.md` — architecture and coding standards for AI/dev workflows
- `CONTRIBUTING.md` — contribution process and quality gates
- `SECURITY.md` — vulnerability reporting process
- `CHANGELOG.md` — release history
- `CODE_OF_CONDUCT.md` — community guidelines

### Technical Docs

- `docs/PROJECT_FACTS.md`
- `docs/fsd-architecture.md`
- `docs/STORES_REFERENCE.md`
- `docs/API_CLIENT_REFERENCE.md`
- `docs/COMPONENT_CATALOG.md`
- `docs/INTEGRATION_GUIDE.md`
- `docs/USE_CASES.md`
- `docs/MACOS_SIGNING.md`
- `docs/SECURITY_ARCHITECTURE.md`

## Development Rules (Short)

- Import concrete segment files (`*.model.ts`, `*.api.ts`, `*.ui.tsx`) — no barrel-only `index.ts`
- No hardcoded UI strings (`t("key")` for all user-facing text)
- No hardcoded brand values (use `brand.*`)
- No `console.log` in app code (use logger)
- Sanitize untrusted HTML before render
- Add or adjust tests for behavior changes
- Run `npm run check` before commit

## Open Source

Project license: [Apache 2.0](LICENSE).

Contributions are welcome via pull requests and issues. Start from `CONTRIBUTING.md`.
