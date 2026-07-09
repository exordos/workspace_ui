# AGENTS.md — Workspace UI

## Core Context

This project is migrating from legacy Zulip to the Workspace API. The new Workspace messenger path is the target path. Legacy Zulip code may be used as context, but it must not be silently pulled into new Workspace logic.

`docs/PROJECT_FACTS.md` is the project facts file: versions, important paths, slices, verification commands, and current backend contract links. Do not duplicate those volatile facts here.

## Sources Of Truth

- `docs/PROJECT_FACTS.md` — current project facts and backend contract links.
- `docs/fsd-architecture.md` — FSD layer rules.
- `.cursor/rules/no-barrel-index.mdc` — no barrel-only imports.
- `docs/ORG_SCOPED_ASYNC_SAFETY.md` — stale async write protection across org/project switches.

If a conclusion depends on Workspace backend capabilities, check the backend contract links from `docs/PROJECT_FACTS.md` first. A local `../workspace_backend` checkout may be missing; use the GitHub fallback links from the facts file when needed.

## Workspace Migration

- Workspace API is the source of truth for the new messenger path.
- Do not add hidden Zulip fallbacks or adapters to Workspace logic.
- If Workspace API does not support something, use an explicit `unsupported` state, read-only state, or clear error instead of fake domain data.
- Workspace code should be UUID-native: `user_uuid`, `message_uuid`, `project_id`, owner/runtime key. Do not return to Zulip numeric ids.
- Preserve the old visible chat UI shell unless the task explicitly asks for redesign.
- `entities/unread-sync`, `entities/chat-list`, `entities/message`, `entities/instance`, `shared/api/zulip-*` are legacy/bridge code, not the new source of truth.
- Keep route/page code thin: pass intent into features/entities instead of building workflows locally in pages.

## Data Loading

- For screens and features that can show persistent cached data, prefer an SWR approach by default: restore cache first, refresh from server in the background, then update both the active store and cache.
- Cache means any durable layer already used by the app: IndexedDB, localStorage, snapshot DB, persisted store, or another cache helper.
- Fast messenger startup matters. Do not replace cache-first behavior with an empty loading state without a reason.
- If SWR makes the contract too complex or may show dangerously stale data, record that in the analysis and choose stricter loading.
- New cache work must include owner/org/project scoping and stale-write protection.

## Code Rules

- FSD dependency direction: `app -> pages -> widgets -> features -> entities -> shared`.
- For a new feature, first identify the owning layer and data source. Do not create `types` / `api` / `store` / `page` files by template unless the task actually needs them.
- Import from concrete files only: `*.model.ts`, `*.api.ts`, `*.ui.tsx`, `*.lib.ts`; no barrel `index.ts`.
- TypeScript strict: no `any`, use type-only imports, and handle `undefined` from indexed access.
- Zustand: use narrow selectors, cache derived data, and adapt DTOs into domain models before writing to stores.
- UI text goes through `~/i18n`; add new keys to both `en.json` and `ru.json`.
- Render HTML/markdown only through the existing sanitize/render path. `dangerouslySetInnerHTML` without `sanitizeHtml()` is forbidden.
- Use `createLogger` and project logging helpers. Do not log tokens, PII, message bodies, or credentials.
- Code comments must be in simple English. Use comments only to explain why, not obvious actions.

## Verification

- Narrow change: run the relevant `vitest`.
- Type, API, or store contract change: run `npm run typecheck`.
- Broad change: run `npm run check`.
- E2E only when user flow or route-level behavior changes.
- Before the final report, check `git status --short` and state what changed.

## Dirty Tree

The working tree may be dirty. Do not revert changes made by others. If a file already has unrelated changes, work around them carefully; if there is a real conflict, stop and explain it.
