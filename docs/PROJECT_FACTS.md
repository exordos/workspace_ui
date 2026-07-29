# Project Facts (canonical reference)

Single source of truth for volatile repository facts, important module paths, and workflow. Keep this file short; long design notes belong in the linked docs.

**Last verified:** 2026-07-09 (branch `workspace-api`, version `0.1.13`).

## Monorepo packages

| Package             | Path                 | Role             |
| ------------------- | -------------------- | ---------------- |
| `web`               | `packages/web/`      | React SPA (Vite) |
| `exordos-workspace` | `packages/electron/` | Desktop shell    |

## Stack versions

| Technology | Version |
| ---------- | ------- |
| TypeScript | 6.0.3   |
| React      | 19.2.7  |
| Vite       | 8.0.16  |
| Zustand    | 5.0.14  |
| Electron   | 42.4.0  |
| Vitest     | 4.1.8   |
| Playwright | 1.60.0  |
| Lerna      | 9.0.7   |
| Tailwind   | 4.3.0   |
| ESLint     | 10.4.1  |
| Prettier   | 3.8.4   |

## FSD slices

Use this section for orientation, not for exact counts. Check the filesystem for the full current list:

```bash
find packages/web/src/{entities,features,pages,widgets} -maxdepth 1 -type d | sort
```

| Area                              | Main slices / paths                                                                                         | Responsibility                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Workspace messenger core          | `entities/messenger`, `entities/workspace-auth`, `entities/workspace-runtime`                               | Workspace IAM session, project runtime, messenger state, outbox, cache, realtime    |
| Workspace-aware shared domains    | `entities/user`, `entities/feed`, `entities/activity`                                                       | Shared product state with Workspace API paths for users, feed, starred/activity     |
| Legacy Zulip and unread bridges   | `entities/chat-list`, `entities/message`, `entities/instance`, `entities/unread-sync`, `shared/api/zulip-*` | Old Zulip-shaped state, instance state, and unread synchronization for old surfaces |
| Legacy inbox and settings domains | `entities/inbox`, `entities/notification-settings`, `shared/lib/event-loop`                                 | Zulip unread inbox, Zulip notification settings, and legacy event loop              |
| Workspace messenger features      | `features/workspace-forward-message`, `features/mention-suggest`, `features/media-viewer`                   | User actions on the Workspace messenger path                                        |
| App shell and chat widgets        | `widgets/layout`, `widgets/sidebar`, `widgets/message-composer`, `widgets/workspace-message-list`           | Route shell, navigation, composer, and Workspace message rendering                  |
| Route pages                       | `pages/workspace-messenger`, `pages/chat`, `pages/activity`, `pages/inbox`, `pages/feed`, `pages/settings`  | Route-level composition; keep pages thin and delegate actions to features           |

`entities/unread-sync` is not Workspace-native. It still consumes Zulip unread snapshots / events and writes old sidebar and instance unread surfaces.

## Key module paths

| Concern                    | Path                                                          |
| -------------------------- | ------------------------------------------------------------- |
| HTTP client middleware     | `packages/web/src/shared/api/client.ts`                       |
| Workspace IAM auth         | `packages/web/src/shared/api/workspace-iam-auth.ts`           |
| Workspace messenger client | `packages/web/src/shared/api/messenger-client.ts`             |
| Workspace messenger APIs   | `packages/web/src/shared/api/messenger-*.api.ts`              |
| Workspace realtime API     | `packages/web/src/shared/api/messenger-realtime.api.ts`       |
| Workspace realtime runtime | `packages/web/src/shared/lib/workspace-realtime/`             |
| Workspace message renderer | `packages/web/src/shared/lib/workspace-message-render/`       |
| Workspace messenger cache  | `packages/web/src/shared/lib/workspace-messenger-cache-db.ts` |
| Workspace user cache       | `packages/web/src/shared/lib/workspace-user-cache-db.ts`      |
| Legacy Zulip API modules   | `packages/web/src/shared/api/zulip-*.ts`                      |
| Legacy Zulip event loop    | `packages/web/src/shared/lib/event-loop.ts`                   |
| White-label config         | `packages/web/src/shared/lib/brand.ts`                        |
| User API split             | `packages/web/src/entities/user/api/`                         |

## Workspace API source of truth

For Workspace messenger work, verify the backend contract before declaring a gap or adding a frontend fallback:

Local checkout, if available next to this repo:

- `../workspace_backend/docs/workspace_api.md`
- `../workspace_backend/docs/workspace_ui_realtime_integration.md`

GitHub fallback when the backend repo is not available locally:

- `https://github.com/exordos/workspace_backend/blob/workspace-backend/docs/workspace_api.md`
- `https://github.com/exordos/workspace_backend/blob/workspace-backend/docs/workspace_ui_realtime_integration.md`

The local backend branch observed during this verification was `workspace-backend`; re-check the branch/source before treating GitHub links as current.

## Import policy

Import **concrete segment files** (`*.model.ts`, `*.api.ts`, `*.ui.tsx`). Do not add barrel-only `index.ts` re-exports. See `.cursor/rules/no-barrel-index.mdc`.

```typescript
import { useUsersStore } from "~/entities/user/user.model";
import { zulipFetch } from "~/shared/api/client";
```

## Git workflow

- Default branch: **`master`**
- Current migration branch: **`workspace-api`**
- Feature/fix branches from `master` → PR targets **`master`**
- Releases: Lerna bump → MR to `master` → tag on `master` (see `docs/adr/006-versioning.md`)

## Verification

Prefer workspace scripts over direct `tsc` / `vitest` calls from the repo root:

```bash
npm run typecheck
npm run test
npm run check
npm run e2e
```

`npm run check` runs the web quality gate, cognitive-complexity report, and high-severity npm audit. Use narrower package scripts when a change is intentionally scoped.

## Documentation

Core references:

- `docs/fsd-architecture.md` — FSD layers and conventions
- `docs/STORES_REFERENCE.md` — Zustand stores
- `docs/COMPONENT_CATALOG.md` — UI inventory
- `docs/API_CLIENT_REFERENCE.md` — HTTP and realtime API
- `docs/INTEGRATION_GUIDE.md` — adding features
- `docs/SECURITY_ARCHITECTURE.md` — security model
- `docs/ORG_SCOPED_ASYNC_SAFETY.md` — organization-scoped async safety

## Legacy compatibility

Client-side backward compatibility for persisted browser state was dropped per [ADR-013](adr/013-greenfield-drop-client-legacy-compat.md). Pre-FSD directories (`components/`, `stores/`, `lib/`) are removed.

## Related docs

- `docs/adr/013-greenfield-drop-client-legacy-compat.md` — dropped client legacy compatibility
- `docs/adr/008-workspace-http-path-defaults.md` — Workspace HTTP path defaults
- `.cursor/rules/no-barrel-index.mdc` — concrete segment imports only
