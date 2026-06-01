# ADR 009: Internal libraries inventory (cognitive complexity reduction)

## Status

Accepted (living document — update when hot files shrink)

## Context

Large orchestrator files and duplicated UI patterns increase cognitive load. We consolidate reusable logic in `shared/lib` and `shared/ui` without new npm packages.

## Baseline (hot files, lines)

| Priority | File                                                | Lines | Notes                                |
| -------- | --------------------------------------------------- | ----: | ------------------------------------ |
| P0       | `pages/chat/chat-page.ui.tsx`                       | ~1966 | Many `useEffect` clusters            |
| P0       | `widgets/message-composer/message-composer.ui.tsx`  | ~1118 | 14+ `useState`                       |
| P0       | `shared/api/zulip.ts`                               | ~2057 | Legacy monolith; prefer `zulip-*.ts` |
| P1       | `entities/chat-list/chat-list.model.ts`             | ~2540 | Mega-store                           |
| P1       | `widgets/layout/layout-zulip-event-dispatch.lib.ts` |  ~794 | Event switchboard                    |
| P1       | `features/folder-sync/folder-sync.model.ts`         | ~1195 | Reconcile + cache                    |
| P2       | `shared/lib/message-cache-db.ts`                    |  ~802 | Overlaps `*-snapshot-db.ts`          |

## Duplication map

| Pattern                   | Locations                        | Target module                                |
| ------------------------- | -------------------------------- | -------------------------------------------- |
| Message time (HH:MM)      | `shared/lib/format.ts`           | `datetime.lib.ts` → `formatMessageTimeShort` |
| Sidebar relative time     | `chat-list-format.lib.ts`        | `formatMessageTimeRelative`                  |
| Feed/inbox date+time      | `feed-page`, `activity-page`     | `formatMessageTimeWithDate`                  |
| `formatDateJoined`        | `right-panel.lib`, settings page | `datetime.lib.ts`                            |
| Folder create/edit modals | `manage-folders/*`               | `shared/ui/folder-form-modal`                |
| Radix Dialog markup       | 14+ features/pages               | `shared/ui/app-dialog`                       |
| `ZulipAuthError`          | `zulip.ts`, `zulip.types.ts`     | `zulip.types.ts` only                        |
| User picker list UI       | add-stream-members, create-chat  | `shared/ui/user-picker-list`                 |
| Cache-first lifecycle     | feed, inbox, activity            | `use-cache-first-page.hook`                  |
| Optimistic mute           | `mute-chat.optimistic.lib`       | `optimistic-mutation.lib`                    |

## Decision

Introduce internal libraries per plan phases 1–4. Imports stay concrete-file (no barrel `index.ts`).

## ESLint cognitive-complexity ratchet log

Rule: `sonarjs/cognitive-complexity` in `packages/web/eslint.config.js`.

| Date       | Threshold | Warnings | Notes                                   |
| ---------- | --------- | -------: | --------------------------------------- |
| 2026-05-29 | 25        |       25 | Iteration 2 baseline; `npm run lint:cc` |
| 2026-06-01 | 25        |        0 | See ADR 011                             |
| 2026-06-01 | 20        |      TBD | Threshold lowered after 0 @ 25          |

Count command (from repo root):

```bash
npm run lint:cc
```

## Consequences

- Smaller PRs per extraction
- Ratchet: fix all warnings at threshold 25, then lower to 20 (see ADR 011)
- ADR 010 covers IndexedDB subsystem when migrated
