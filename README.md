# Workspace UI

The web application is also published as the independent `workspace_ui`
Exordos element. Its manifest owns the public load balancer, serves the
versioned static artifact, and proxies `/api/` to the separately deployed
Workspace backend. See [the Exordos element guide](docs/exordos-element.md).

Open-source corporate messenger built on the [Zulip](https://zulip.com/) API.

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
- 3800+ tests (Vitest + Testing Library + MSW + Playwright)
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
2. `widgets/layout/layout-zulip-event-loop.hook.ts` + `shared/lib/event-loop.ts` start Zulip event queue polling
3. `shared/api/client.ts` handles auth/logging/retry middleware
4. Entity stores (`entities/*`) provide domain state
5. UI subscribes through minimal selectors

## Repository Structure

```text
workspace_ui/
├── packages/
│   ├── web/              React SPA
│   ├── electron/         Electron shell
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
- `docs/apt-repository.md`
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
