# Contributing to Workspace

Thank you for your interest in contributing to Workspace! Whether you're fixing a typo, reporting a bug, or building a major feature — every contribution makes a difference.

> **License:** [Apache 2.0](LICENSE) — all contributions are licensed under the same terms.
>
> **Code of Conduct:** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — we follow the Contributor Covenant 2.1. Please read it before participating.
>
> **Security issues:** [SECURITY.md](SECURITY.md) — **do not** open public issues for vulnerabilities. Follow the responsible disclosure process instead.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branch Strategy](#branch-strategy)
- [Commit Messages](#commit-messages)
- [Code Quality Gates](#code-quality-gates)
- [FSD Architecture Guide](#fsd-architecture-guide)
- [Coding Standards](#coding-standards)
- [Adding New Features](#adding-new-features)
- [Testing](#testing)
- [Documentation Standards](#documentation-standards)
- [Dependencies Policy](#dependencies-policy)
- [Release Process](#release-process)
- [Where to Get Help](#where-to-get-help)

---

## Getting Started

### Prerequisites

- **Node.js ≥ 22** — see `.nvmrc` (use `nvm use` or `fnm use` to switch automatically)
- **npm 10+** — ships with Node.js 22
- **Git 2.30+** — with `core.autocrlf=false` (line endings are LF, enforced by `.gitattributes`)

### Recommended Editor

VS Code, Cursor, or VSCodium. The workspace includes:

- `.vscode/settings.json` — formatting, linting, path aliases
- `.vscode/extensions.json` — recommended extensions (auto-prompted on open)
- `.editorconfig` — universal editor settings (works in WebStorm, Vim, etc.)

### Setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/workspace-ui.git
cd workspace-ui

# 2. Install dependencies
npm install

# 3. Configure environment
cp packages/web/.env.example packages/web/.env
# Edit .env — set VITE_WORKSPACE_API_ORIGIN to your Zulip server URL

# 4. Start development server
npm run dev:web              # http://localhost:5173

# 5. Verify everything works
npm run check                # typecheck + lint + test (must pass)
```

### Other Development Modes

| Command                | What it runs                                 |
| ---------------------- | -------------------------------------------- |
| `npm run dev:web`      | Vite dev server only                         |
| `npm run dev:electron` | Web + Electron desktop window                |
| `npm run dev`          | All packages in parallel (web + mock server) |
| `npm run dev:mock`     | Express mock API server only                 |

---

## Development Workflow

### The Process

```
1. Pick an issue (or create one for discussion)
2. Fork the repository (external) or create a branch (team)
3. Create a branch from develop
4. Write tests first (TDD)
5. Implement the feature or fix
6. Run npm run check — must pass
7. Commit using Conventional Commits
8. Push and open PR → develop
9. Address review feedback
10. Squash merge after approval
```

### Step by Step

```bash
# Start from latest develop
git checkout develop && git pull origin develop

# Create your branch
git checkout -b feature/my-feature

# ... write tests, then implement ...

# Verify everything passes
npm run check

# Commit (hooks will validate format + run linters)
git commit -m "feat(chat): add message forwarding dialog"

# Push and create PR
git push -u origin feature/my-feature
# → Open Pull Request targeting develop on GitHub
```

### PR Checklist

Every PR should meet these criteria before requesting review:

- [ ] `npm run check` passes (typecheck + lint + test)
- [ ] New code has tests (TDD: tests were written first)
- [ ] i18n: UI strings use `t("key")`, added to both `en.json` and `ru.json`
- [ ] Security: `sanitizeHtml()`, `isValidUrl()`, `hasPermission()` where needed
- [ ] Styling: semantic tokens only (no `bg-[#hex]`), works in both themes
- [ ] Logging: `createLogger("scope")` — no `console.log`
- [ ] No `any`, no `@ts-ignore`, no hardcoded "Workspace"
- [ ] Documentation updated if behavior changed

---

## Branch Strategy

```
main        ← Production releases, protected, tagged
develop     ← Integration branch, all PRs target here
feature/*   ← New features (branched from develop)
fix/*       ← Bug fixes (branched from develop)
release/*   ← Release preparation (develop → main)
hotfix/*    ← Emergency production fixes (main → fix → main + develop)
```

| Merge Strategy   | When                               |
| ---------------- | ---------------------------------- |
| **Squash merge** | Feature and fix branches → develop |
| **Merge commit** | Release and hotfix branches → main |

### Branch Naming

```
feature/add-message-forwarding
fix/unread-count-decrement
release/1.2.0
hotfix/session-timeout-crash
```

Use kebab-case. Be descriptive but concise.

---

## Commit Messages

We use **[Conventional Commits](https://www.conventionalcommits.org/)**, enforced by **commitlint** on every commit via Git hooks. Non-conforming commits are rejected automatically.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type       | When to use                             | Example                                                  |
| ---------- | --------------------------------------- | -------------------------------------------------------- |
| `feat`     | New feature or capability               | `feat(chat): add message forwarding dialog`              |
| `fix`      | Bug fix                                 | `fix: correct unread count decrement on DM read`         |
| `refactor` | Code restructuring (no behavior change) | `refactor(stores): extract chat list sorting to utility` |
| `docs`     | Documentation changes only              | `docs: update API client reference`                      |
| `test`     | Adding or fixing tests                  | `test(html): add XSS sanitization edge cases`            |
| `chore`    | Dependencies, config, tooling           | `chore: update Radix UI to 1.2`                          |
| `style`    | Formatting, whitespace (no logic)       | `style: apply Prettier to sidebar components`            |
| `perf`     | Performance improvement                 | `perf(messages): virtualize long message lists`          |
| `ci`       | CI/CD pipeline changes                  | `ci: add E2E tests to GitLab pipeline`                   |
| `build`    | Build system, packaging                 | `build(electron): update electron-builder to 25`         |
| `revert`   | Reverting a previous commit             | `revert: revert "feat(chat): add forwarding"`            |

### Scopes (optional)

`chat`, `auth`, `sidebar`, `electron`, `i18n`, `theme`, `api`, `pwa`, `security`, `a11y`, `stickers`, `calls`, `search`, `composer`, `settings`

### Rules

- **Subject**: imperative mood (`add`, not `added` or `adding`), lowercase after type, max 100 chars, no period
- **Body** (optional): explain **why**, not what. Wrap at 200 chars.
- **Footer**: `Closes #123`, `BREAKING CHANGE: description`

### Rejected Examples

```
❌ "fixed stuff"              → Missing type
❌ "feat add forwarding"      → Missing colon after type
❌ "feat: "                   → Empty subject
❌ "Feat: Add forwarding"     → Uppercase subject
```

---

## Code Quality Gates

Every PR must pass **all** of these before merge. CI enforces automatically.

| Gate           | Command                         | Pass Criteria                    |
| -------------- | ------------------------------- | -------------------------------- |
| **TypeScript** | `npm run typecheck`             | 0 errors                         |
| **ESLint**     | `npm run lint`                  | 0 errors (warnings allowed)      |
| **Unit Tests** | `npm run test`                  | Full test suite passes           |
| **Prettier**   | `npm run format:check`          | All files formatted              |
| **Build**      | `npm run build --workspace=web` | Successful, no chunks > 400KB    |
| **Security**   | `npm audit --audit-level=high`  | No critical/high vulnerabilities |

**Shortcut:** `npm run check` runs typecheck + lint + test in one command.

### Git Hooks (automatic)

These run automatically — you don't need to invoke them manually.

| Hook           | What it does                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pre-commit** | lint-staged (ESLint fix + Prettier on staged files), secret detection, sensitive file block (`.env`, `.pem`, `.key`), large file block (> 2MB), `dangerouslySetInnerHTML` audit |
| **commit-msg** | commitlint validates Conventional Commits format                                                                                                                                |

### If a Hook Fails

- **ESLint error**: Fix the reported issues (the error output tells you exactly what's wrong)
- **Prettier**: Run `npm run format` to auto-fix, then re-stage
- **Secret detected**: Remove the credential from your code. Use env vars instead
- **commitlint**: Re-read the [Commit Messages](#commit-messages) section and fix your message

---

## FSD Architecture Guide

Workspace follows **[Feature-Sliced Design](https://feature-sliced.design/)** — a frontend architecture with strict layer isolation.

### Layers (import direction: ONLY downward)

```
┌──────────────────────────────────────────────────────────────┐
│  app         Entry point, router, providers, event loop       │
├──────────────────────────────────────────────────────────────┤
│  pages       9 route pages (lazy-loaded)                      │
├──────────────────────────────────────────────────────────────┤
│  widgets     10 composite UI blocks                           │
├──────────────────────────────────────────────────────────────┤
│  features    16 user-facing scenarios                         │
├──────────────────────────────────────────────────────────────┤
│  entities    11 domain models (stores + API + types)          │
├──────────────────────────────────────────────────────────────┤
│  shared      UI primitives, utilities, API client, i18n       │
└──────────────────────────────────────────────────────────────┘
```

### Where to Put What

| What you're building              | Layer    | Path                              | Example                             |
| --------------------------------- | -------- | --------------------------------- | ----------------------------------- |
| Domain data model (Zustand store) | entities | `entities/<name>/`                | `entities/draft/draft.model.ts`     |
| API functions (fetch/post)        | entities | `entities/<name>/<name>.api.ts`   | `entities/user/user.api.ts`         |
| Domain types                      | entities | `entities/<name>/<name>.types.ts` | `entities/message/message.types.ts` |
| User-facing scenario              | features | `features/<action>/`              | `features/create-chat/`             |
| Composite UI block                | widgets  | `widgets/<name>/`                 | `widgets/message-list/`             |
| Full-page route                   | pages    | `pages/<name>/`                   | `pages/chat/`                       |
| Reusable UI primitive             | shared   | `shared/ui/`                      | `shared/ui/button.tsx`              |
| Utility function                  | shared   | `shared/lib/`                     | `shared/lib/format.ts`              |
| API client/helpers                | shared   | `shared/api/`                     | `shared/api/client.ts`              |
| Constants                         | shared   | `shared/config/`                  | `shared/config/constants.ts`        |

### Import Rules

```typescript
// ✅ CORRECT — import through barrel (index.ts)
import { useMessageStore } from "~/entities/message";
import { CreateChatDialog } from "~/features/create-chat";
import { Button } from "~/shared/ui";

// ❌ WRONG — importing internal file directly
import { useMessageStore } from "~/entities/message/message.model";
```

### Slice File Structure

Every FSD slice follows this convention:

```
slice-name/
  slice-name.api.ts       # API calls
  slice-name.model.ts     # Zustand store
  slice-name.types.ts     # TypeScript types
  slice-name.lib.ts       # Pure utility functions
  slice-name.ui.tsx       # React component(s)
  slice-name.test.ts      # Tests (co-located!)
  index.ts                # Public API — the ONLY valid import point
```

Not every file is required — use only what the slice needs.

---

## Coding Standards

Full conventions are documented in [AGENTS.md](AGENTS.md). Key principles for contributors:

### TypeScript

- **Strict mode** is on: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`
- **No `any`** — use `unknown` + type guards, or domain guards from `~/shared/lib/guards`
- **`import type { X }`** for type-only imports (enforced by compiler)
- **Path alias**: `~/` maps to `src/` — always use it instead of relative paths across layers

### React

- Functional components with `React.FC<Props>`, props interface defined alongside
- All page components lazy-loaded via `React.lazy()` + `Suspense`
- `ErrorBoundary` wraps every route
- Minimal Zustand selectors: `useStore((s) => s.field)` — never `const { a, b } = useStore()`
- `React.memo` on all components rendered in `.map()` (list items)
- `useCallback`/`useMemo` for any function or object passed as props to children

### Styling (Tailwind CSS)

- **Design system > Pixel Perfect** — semantic tokens are the contract, Figma mockups are guides
- **Semantic tokens only** — `bg-card-bg`, `text-text-primary` — never `bg-[#333]` or `text-[15px]`
- **4px grid spacing** — use Tailwind scale (`p-2` = 8px, `p-4` = 16px), round non-standard values
- **Named z-index** — `z-modal`, `z-dropdown` — never `z-50` or `z-[999]`
- **Both themes**: every component must work in dark + light mode, Orange Warm + Blue Cold palettes

### i18n

- `t("section.action")` from `~/i18n` — **never hardcode UI strings**
- New UI text → add to BOTH `i18n/locales/en.json` AND `ru.json`
- Plurals: English has 2 forms (`_one`, `_other`), Russian has 3 (`_one`, `_few`, `_many`)

### White-Label

- `brand.*` from `~/shared/lib/brand` — **never hardcode** "Workspace" or any brand-specific text
- Brand values come from `VITE_BRAND_*` environment variables

### Security

- `sanitizeHtml()` before **any** `dangerouslySetInnerHTML` — pre-commit hook blocks violations
- `isValidUrl()` / `isValidRealmUrl()` for all user-provided URLs
- `hasPermission()` / `canEditMessage()` for role-dependent UI and actions
- `buildAuthHeader()` for auth — never construct `Authorization` headers manually
- `validateFileUpload()` + `detectImageMime()` for file uploads
- Never log credentials, PII, tokens, or message content

### Logging

- `createLogger("scope")` from `~/shared/lib/logger` — **never** use `console.log`
- `logApiCall()` for API requests, `logStoreAction()` for store mutations
- Logger auto-redacts 15 sensitive key patterns (apiKey, password, token, etc.)

### Defensive Programming

- `invariant(condition, message)` for conditions that must be true at runtime
- `guard.userId()`, `guard.streamId()`, `guard.messageId()` before passing IDs to API
- `assertNever(x)` in every exhaustive `switch` over union types
- `safeCatch(fn, label)` for event listeners and store subscribers that must not crash the app
- `guard.url()` before `window.open()`, `navigate()`, or iframe src

### Comments

- **English only** (international contributor community)
- Comment **why**, not **what** — the code should be self-documenting
- Module-level JSDoc header required for `shared/lib/*.ts` and `entities/*/*.model.ts`
- No commented-out code, no journal-style comments ("Added by X on date")

---

## Adding New Features

Follow the [Integration Guide](docs/INTEGRATION_GUIDE.md) for detailed instructions. Here's the checklist:

### FSD Feature Checklist

```
[ ] Types         → entities/<name>/<name>.types.ts (if new domain model)
[ ] API           → entities/<name>/<name>.api.ts or shared/api/
[ ] Store         → entities/<name>/<name>.model.ts (with logStoreAction)
[ ] Feature UI    → features/<action>/ (if user-facing scenario)
[ ] Widget        → widgets/<name>/ (if composite UI block)
[ ] Page          → pages/<name>/ (if new route — React.lazy + Suspense)
[ ] i18n          → en.json + ru.json (both locales)
[ ] Permissions   → hasPermission() checks for role-dependent actions
[ ] Shortcuts     → SHORTCUTS[] catalog (if keyboard-triggerable)
[ ] Logging       → logApiCall, logStoreAction, logger.error
[ ] Security      → sanitizeHtml, isValidUrl, validateFileUpload
[ ] Theming       → semantic tokens, test dark+light, both palettes
[ ] z-index       → semantic layers (z-modal, z-dropdown), never numeric
[ ] Tests         → TDD: tests written FIRST, co-located with source
[ ] Performance   → lazy imports, minimal selectors, React.memo for lists
[ ] Error states  → try/catch, loading/error state in store, ErrorBoundary
[ ] npm run check → typecheck + lint + test must pass
[ ] Docs          → update relevant docs/ files
```

---

## Testing

### TDD is Mandatory

The workflow for new features is:

1. **RED** — Write a failing test that describes the desired behavior
2. **GREEN** — Write the minimum code to make the test pass
3. **REFACTOR** — Clean up while keeping all tests green

### Running Tests

```bash
npm run test              # Full Vitest suite (single run)
npm run test:watch        # Watch mode (re-runs on file change)
npm run test:coverage     # V8 coverage report
npm run e2e               # Playwright E2E (headless)
npm run e2e -- --grep @mock              # Connection/API resilience only
npm run e2e -- --grep-invert @live       # CI default (mock API, no real Zulip)
npm run e2e:ui            # Playwright interactive UI mode
npm run e2e:headed        # Playwright with visible browser
npm run e2e:report        # Open Playwright HTML report
```

### Test Stack

| Tool                            | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| **Vitest 4**                    | Test runner (Jest-compatible API)           |
| **@testing-library/react**      | Component testing (DOM queries, assertions) |
| **@testing-library/user-event** | Realistic user interactions                 |
| **MSW 2**                       | API mocking via service worker interceptors |
| **Playwright 1.58**             | E2E browser testing (Chromium)              |

### Test File Location

Tests live **next to** the source file they test — not in a separate `__tests__/` directory:

```
features/create-chat/
  create-chat.model.ts
  create-chat.test.ts      ← Right here
  create-chat.ui.tsx
  index.ts
```

### Test Factories

Generate valid test data with sensible defaults — override only what matters:

```typescript
import { createMessage, createUser, createStream, createInstance } from "~/test/factories";

const message = createMessage({ content: "Hello" });
const user = createUser({ full_name: "Alice", user_id: 42 });
const stream = createStream({ name: "engineering" });
```

Batch creation:

```typescript
import { createMessages, createUsers } from "~/test/factories";
const messages = createMessages(50, { stream_id: 10 });
```

### Writing Tests by Category

| What you're testing  | How to test                                                          |
| -------------------- | -------------------------------------------------------------------- |
| Pure function        | Direct import + assertions                                           |
| Zustand store action | `useStore.getState().action(); expect(useStore.getState().field)...` |
| React component      | `render(<Component />)` from `@testing-library/react`                |
| API function         | MSW handlers + assertions on response                                |
| E2E flow             | Playwright `test` + `expect` from `e2e/fixtures.ts`                  |

### Coverage Targets

| Category         | Target |
| ---------------- | ------ |
| `shared/lib/`    | 90%+   |
| `entities/`      | 85%+   |
| `features/`      | 80%+   |
| Overall (`src/`) | 60%+   |

---

## Documentation Standards

### When to Update Docs

- New feature → update [INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md), [COMPONENT_CATALOG.md](docs/COMPONENT_CATALOG.md)
- New store → update [STORES_REFERENCE.md](docs/STORES_REFERENCE.md)
- API change → update [API_CLIENT_REFERENCE.md](docs/API_CLIENT_REFERENCE.md)
- Architectural decision → create new ADR in `docs/adr/`

### ADR (Architectural Decision Record)

For significant architectural decisions:

```bash
cp docs/adr/000-template.md docs/adr/NNN-title.md
```

Fill in: **Context** → **Alternatives Considered** → **Decision** → **Consequences**

### Code Comments

- Module-level JSDoc header on `shared/lib/*.ts` and `entities/*/*.model.ts`
- Section separators (`// ---`) for files > 100 lines
- Inline comments only for non-obvious logic, workarounds, or edge cases
- English only, no commented-out code

---

## Dependencies Policy

### Version Pinning

- **Exact versions** — `.npmrc: save-exact=true` pins every dependency
- No `^` or `~` ranges in `package.json`

### Updates

| Frequency | What                    | How                                  |
| --------- | ----------------------- | ------------------------------------ |
| Weekly    | Minor/patch (automated) | Dependabot PRs — review, test, merge |
| Monthly   | Security audit          | `npm audit --audit-level=high`       |
| Quarterly | Major version updates   | Dedicated PR, ADR if significant     |

### Adding New Dependencies

Before adding a dependency, consider:

1. **Do we really need it?** Check if existing code or a small utility would suffice
2. **Bundle impact?** Run `npm run build` and check chunk sizes (400KB budget)
3. **Maintenance?** Check GitHub stars, last commit, open issues, license
4. **Security?** `npm audit` after adding

```bash
npm install <package> --workspace=packages/web --save-exact
```

### Removing Dependencies

When a dependency is no longer used:

```bash
npm uninstall <package> --workspace=packages/web
```

---

## Release Process

### Versioning

The project follows [Semantic Versioning 2.0](https://semver.org/). All packages in the monorepo bump together.

| Version part      | When to bump                      | Example                         |
| ----------------- | --------------------------------- | ------------------------------- |
| **Major** (X.0.0) | Breaking changes to public API    | Removing a Zustand store action |
| **Minor** (0.X.0) | New features, backward-compatible | Adding message forwarding       |
| **Patch** (0.0.X) | Bug fixes, documentation          | Fixing unread count             |

### Creating a Release

```bash
# 1. Bump version (Lerna fixed mode — all packages/* + lerna.json + root package.json)
npm run version:bump -- patch   # or: minor, major, or explicit 1.2.3

# 2. Update CHANGELOG.md manually (if needed)

# 3. Commit and merge to master via MR (direct push to master is forbidden)
git add -A && git commit -m "chore: release v$(npm run version:print -s)"
# open MR → merge

# 4. On master after merge: create tag and push (GitHub Release runs on tag push only)
npm run version:tag
# dry-run: npm run version:tag:dry-run
```

Current version: `npm run version:print` (reads `lerna.json`).

GitHub Actions builds desktop installers and publishes a GitHub Release when a semver tag is pushed (e.g. `0.1.2`, not `v0.1.2`). Push to `master` alone does not create a Release.

---

## Where to Get Help

| Channel                                                                     | What it's for                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [GitHub Issues](https://github.com/workspace/workspace-ui/issues)           | Bug reports, feature requests                                             |
| [GitHub Discussions](https://github.com/workspace/workspace-ui/discussions) | Questions, ideas, design discussions                                      |
| [`docs/`](docs/)                                                            | Technical references, architecture, integration guide                     |
| [`AGENTS.md`](AGENTS.md)                                                    | Comprehensive architecture + coding standards for AI-assisted development |
| [`docs/INTEGRATION_GUIDE.md`](docs/INTEGRATION_GUIDE.md)                    | Step-by-step guide for adding features                                    |
| [`docs/STORES_REFERENCE.md`](docs/STORES_REFERENCE.md)                      | Zustand store API reference                                               |
| [`docs/adr/`](docs/adr/)                                                    | 7 Architectural Decision Records explaining major choices                 |

### For New Contributors

1. Start with a `good first issue` label — these are scoped, well-documented tasks
2. Read this file (CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) for coding standards
3. Set up your editor with recommended extensions (auto-prompted in VS Code/Cursor)
4. Don't hesitate to ask questions in GitHub Discussions

### For AI-Assisted Development

The project includes comprehensive AI agent guidance:

- **48 Cursor rules** in `.cursor/rules/` covering every aspect of the codebase
- **4 skills** in `.cursor/skills/` for multi-phase workflows
- **6 prompt templates** in `.cursor/prompts/` for common tasks
- **`AGENTS.md`** as the machine-readable project overview

---

We're excited to have you contribute. Welcome to the team!
