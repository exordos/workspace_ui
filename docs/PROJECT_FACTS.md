# Project Facts (canonical reference)

Single source of truth for volatile counts, paths, and workflow. Other docs should link here instead of duplicating.

**Last verified:** 2026-07-16 (branch `cassi/workspace-messenger-platform`).

## Current product surface

The deployed Workspace build is Messenger-only and sets
`VITE_MESSENGER_ONLY=true`. Mail and Calendar slices remain in the source tree
for future integrations, so the inventory below includes them, but they are not
current routes or supported backend APIs.

## Monorepo packages

| Package         | Path                      | Role                                    |
| --------------- | ------------------------- | --------------------------------------- |
| `web`           | `packages/web/`           | React SPA (Vite)                        |
| `electron-app`  | `packages/electron/`      | Desktop shell                           |
| `workspace-api` | `packages/workspace-api/` | Orval-generated `@workspace/api` client |

## Stack versions

| Technology | Version |
| ---------- | ------- |
| TypeScript | 5.9.3   |
| React      | 19.2.7  |
| Vite       | 8.0.16  |
| Zustand    | 4.5.7   |
| Electron   | 42.1.0  |
| Vitest     | 4.1.8   |
| Playwright | 1.60.0  |
| Lerna      | 9.0.7   |

## FSD slice counts

| Layer        | Count | Slices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **entities** |    19 | activity, calendar, call, chat-list, download, draft, feed, folder, inbox, instance, link-preview, mail, message, notification-settings, sticker, theme, unread-sync, user, user-group                                                                                                                                                                                                                                                                                                                        |
| **features** |    30 | add-stream-members, ai-reply, calendar-event-form, calendar-move-event, calendar-recurrence-scope, calendar-rename, chat-dm-call-bridge, chat-info, create-chat, external-accounts, folder-sync, instance-switch, jitsi-call, mail-compose, mail-folder-actions, mail-message-actions, manage-folders, mark-chat-read, mark-topic-resolved, media-viewer, mention-suggest, message-readers, move-topic-to-stream, mute-chat, pin-chat, settings, sticker-picker, theme-picker, typing-indicator, user-profile |
| **pages**    |    14 | activity, calendar, calls, chat, feed, inbox, licenses, login, logs, mail, message-redirect, services, settings, update                                                                                                                                                                                                                                                                                                                                                                                       |
| **widgets**  |    11 | calendar-view, chat-view, folder-rail, layout, mail-view, message-composer, message-list, right-panel, search-modal, sidebar, top-bar                                                                                                                                                                                                                                                                                                                                                                         |

## Key module paths

| Concern                  | Path                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| messenger event loop     | `packages/web/src/shared/lib/event-loop.ts`                               |
| Event loop startup       | `packages/web/src/widgets/layout/layout-messenger-event-loop.hook.ts`     |
| Event dispatch           | `packages/web/src/widgets/layout/layout-messenger-event-dispatch*.lib.ts` |
| HTTP client (middleware) | `packages/web/src/shared/api/client.ts`                                   |
| Messenger API modules    | `packages/web/src/shared/api/messenger-*.ts`                              |
| Workspace API client     | `packages/web/src/shared/api/workspace-client.ts`                         |
| Dormant Mail source      | `packages/web/src/entities/mail/`                                         |
| Dormant Calendar source  | `packages/web/src/entities/calendar/`                                     |
| White-label config       | `packages/web/src/shared/lib/brand.ts`                                    |
| User API (split)         | `packages/web/src/entities/user/api/`                                     |

## Import policy

Import **concrete segment files** (`*.model.ts`, `*.api.ts`, `*.ui.tsx`). Do not add barrel-only `index.ts` re-exports. See `.cursor/rules/no-barrel-index.mdc`.

```typescript
import { useUsersStore } from "~/entities/user/user.model";
import { workspaceApi } from "~/shared/api/workspace-api";
```

## Git workflow

- Default branch: **`master`**
- Feature/fix branches from `master` → PR targets **`master`**
- Releases: Lerna bump → MR to `master` → tag on `master` (see `docs/adr/006-versioning.md`)

## Testing

| Metric               |                                        Value |
| -------------------- | -------------------------------------------: |
| Unit/component tests | 4500+ (`it`/`test` blocks in `packages/web`) |
| Test files           |                                          476 |
| E2E specs            |                      21 (`e2e/**/*.spec.ts`) |

## Documentation

| Category                           |                                                     Count |
| ---------------------------------- | --------------------------------------------------------: |
| Technical references (`docs/*.md`) |                                             9 + this file |
| ADRs (`docs/adr/`)                 | 13 (000 template + 001–010, 012–013; 011 merged into 009) |
| Cursor rules (`.cursor/rules/`)    |                                                        50 |

## Client legacy compatibility

Client-side backward compatibility for persisted browser state was dropped per [ADR-013](adr/013-greenfield-drop-client-legacy-compat.md). Pre-FSD directories (`components/`, `stores/`, `lib/`) are removed.

## Related docs

- [fsd-architecture.md](fsd-architecture.md) — FSD layers, conventions, migration history
- [STORES_REFERENCE.md](STORES_REFERENCE.md) — Zustand stores
- [COMPONENT_CATALOG.md](COMPONENT_CATALOG.md) — UI inventory
- [API_CLIENT_REFERENCE.md](API_CLIENT_REFERENCE.md) — HTTP and real-time API
- [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) — adding features
