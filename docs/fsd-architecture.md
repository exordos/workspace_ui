# Frontend Architecture — Feature-Sliced Design

The Workspace UI frontend is built using [Feature-Sliced Design](https://feature-sliced.design).
Stack: React 19, TypeScript 5.9, Vite 8, Zustand, Tailwind CSS, Radix UI, react-router-dom 7.

> **Canonical counts and paths:** see [PROJECT_FACTS.md](PROJECT_FACTS.md) (17 entities, 22 features, 14 pages, 9 widgets).

## Layers

```text
shared → entities → features → widgets → pages → app
```

```
app         Entry point, router, providers, event loop, global styles
 ↑
pages       Routes — compose widgets and features
 ↑
widgets     Composite UI blocks (sidebar, chat-view, message-list)
 ↑
features    User scenarios on top of entities
 ↑
entities    Business entities: models, stores, API methods
 ↑
shared      Design system, utilities, configs, icons
```

- Imports only go **downward** through layers; lateral dependencies are forbidden.
- `shared` — design system (Radix UI + Tailwind), tokens, utilities, API helpers, icons.
- `entities` — business entities with Zustand stores and API calls (see [PROJECT_FACTS.md](PROJECT_FACTS.md) for the full list).
- `features` — user scenarios on top of entities (folder-sync, create-chat, jitsi-call, mute-chat, settings, etc.).
- `widgets` — compositions living on pages (sidebar, chat-view, message-composer, layout, top-bar...).
- `pages` — routes, compose widgets and features.
- `app` — entry point, router, providers, event loop.

> The `processes` layer (cross-cutting scenarios) is merged with `app`. The Zulip real-time event loop lives in `shared/lib/event-loop.ts` and is started from `widgets/layout/layout-zulip-event-loop.hook.ts`.

---

## Current Structure

High-level layout (full slice lists in [PROJECT_FACTS.md](PROJECT_FACTS.md)):

```text
packages/web/src/
├── app/                    # Router, providers, contexts, global styles
│   ├── app.tsx
│   ├── app.styles.css
│   ├── webview-shell.tsx
│   └── contexts/
├── pages/                  # 14 route pages (lazy-loaded)
├── widgets/                # 9 composite blocks (layout, sidebar, message-list, …)
├── features/               # 22 user scenarios (folder-sync, jitsi-call, …)
├── entities/               # 17 domain stores + API segments
├── shared/
│   ├── ui/                 # Design-system primitives
│   ├── api/                # client.ts, workspace-client.ts, zulip-*.ts
│   ├── lib/                # event-loop.ts, brand.ts, guards.ts, themes/, push/, …
│   └── config/
├── i18n/
├── test/
└── main.tsx
```

Each slice uses segment files (`*.model.ts`, `*.api.ts`, `*.ui.tsx`, `*.lib.ts`, `*.test.ts`). Import concrete paths — no barrel-only `index.ts` (see [Imports](#imports-no-barrel-indexts)).

### Legacy directories

Pre-FSD directories (`components/`, `stores/`, `lib/`, `contexts/`) are **removed**. Client-side legacy compatibility for persisted browser state was dropped per [ADR-013](adr/013-greenfield-drop-client-legacy-compat.md).

### Example feature slice (abbreviated)

```text
features/folder-sync/
  folder-sync.api.ts
  folder-sync.model.ts
  folder-sync.lib.ts
  folder-sync.selectors.ts
  folder-sync.test.ts
```

---

## Migration History

| Phase   | Description                                                                | Status   |
| ------- | -------------------------------------------------------------------------- | -------- |
| Phase 1 | `shared/` + `entities/` — primitives, API helpers, stores                  | **Done** |
| Phase 2 | `widgets/` — sidebar, layout, chat-view, panels, top-bar                   | **Done** |
| Phase 3 | `features/` — 22 user scenarios (see [PROJECT_FACTS.md](PROJECT_FACTS.md)) | **Done** |
| Phase 4 | `pages/` + `app/` — route pages, router, contexts                          | **Done** |

All four phases are complete. Ongoing slices (folder-sync, stream-members, etc.) follow the same FSD layout.

---

## Mapping: Legacy → FSD

| Legacy Path                          | FSD Layer         | FSD Path                                                                       |
| ------------------------------------ | ----------------- | ------------------------------------------------------------------------------ |
| `components/Layout.tsx`              | widgets           | `widgets/layout/`                                                              |
| `components/ChatPage.tsx`            | pages             | `pages/chat/`                                                                  |
| `components/ActivityPage.tsx`        | pages             | `pages/activity/`                                                              |
| `components/LoginPage.tsx`           | pages             | `pages/login/`                                                                 |
| `components/ChatHeader.tsx`          | widgets           | `widgets/chat-view/` (channel + direct)                                        |
| `components/MessageList.tsx`         | widgets           | `widgets/message-list/`                                                        |
| `components/ui/MessageBubble.tsx`    | widgets           | `widgets/message-list/`                                                        |
| `components/ui/MessageComposer.tsx`  | widgets           | `widgets/message-composer/`                                                    |
| `components/ui/Sidebar/`             | widgets           | `widgets/sidebar/`                                                             |
| `components/ui/TopBar.tsx`           | widgets           | `widgets/top-bar/`                                                             |
| `components/ui/FolderRail.tsx`       | widgets           | `widgets/folder-rail/`                                                         |
| `components/ui/RightPanel.tsx`       | widgets           | `widgets/right-panel/`                                                         |
| `components/ui/RightDrawer.tsx`      | widgets           | `widgets/right-panel/`                                                         |
| `components/SearchModal.tsx`         | widgets           | `widgets/search-modal/`                                                        |
| `components/ProfileDrawer.tsx`       | widgets           | `widgets/right-panel/` (profile in right drawer)                               |
| `components/InstanceSwitcher.tsx`    | features          | `features/instance-switch/`                                                    |
| `components/JitsiCallModal.tsx`      | features          | `features/jitsi-call/`                                                         |
| `components/ui/Avatar.tsx`           | shared            | `shared/ui/avatar.tsx`                                                         |
| `components/ui/Badge.tsx`            | shared            | `shared/ui/badge.tsx`                                                          |
| `components/ui/Button.tsx`           | shared            | `shared/ui/button.tsx`                                                         |
| `components/ui/Icon.tsx`             | shared            | `shared/ui/icon.tsx`                                                           |
| `components/ui/ScrollArea.tsx`       | shared            | `shared/ui/scroll-area.tsx`                                                    |
| `components/ui/CallBubble.tsx`       | shared            | `shared/ui/call-bubble.tsx`                                                    |
| `components/ErrorBoundary.tsx`       | shared            | `shared/ui/error-boundary.tsx`                                                 |
| `stores/chatListStore.ts`            | entities          | `entities/chat-list/chat-list.model.ts`                                        |
| `stores/currentChatMessagesStore.ts` | entities          | `entities/message/message.model.ts`                                            |
| `stores/usersStore.ts`               | entities          | `entities/user/user.model.ts`                                                  |
| `stores/instancesStore.ts`           | entities          | `entities/instance/instance.model.ts`                                          |
| `stores/themeStore.ts`               | entities          | `entities/theme/theme.model.ts`                                                |
| `stores/callParticipantsStore.ts`    | entities          | `entities/call/call.model.ts`                                                  |
| `stores/sidebarConfigStore.ts`       | widgets           | `widgets/sidebar/sidebar-config.model.ts`                                      |
| `lib/zulipClient.ts`                 | shared + entities | Removed — `shared/api/zulip-*.ts` + `entities/*/api`                           |
| `lib/zulipRealtime.ts`               | shared + widgets  | `shared/lib/event-loop.ts` + `widgets/layout/layout-zulip-event-loop*.hook.ts` |
| `lib/api/workspaceClient.ts`         | shared + entities | Base fetch → `shared/api/`, folder API → `entities/folder/`                    |
| `lib/constants.ts`                   | shared            | `shared/config/constants.ts`                                                   |
| `lib/format.ts`                      | shared            | `shared/lib/format.ts`                                                         |
| `lib/html.ts`                        | shared            | `shared/lib/html.ts`                                                           |
| `lib/jitsi.ts`                       | shared            | `shared/lib/jitsi.ts`                                                          |
| `contexts/`                          | app               | `app/contexts/`                                                                |
| `styles/index.css`                   | app               | `app/app.styles.css`                                                           |
| `assets/icons/`                      | shared            | `shared/assets/icons/`                                                         |
| `App.tsx`                            | app               | `app/app.tsx`                                                                  |
| — (new)                              | entities          | `entities/sticker/`                                                            |
| — (new)                              | entities          | `entities/draft/`                                                              |
| — (new)                              | entities          | `entities/inbox/`                                                              |
| — (new)                              | entities          | `entities/feed/`                                                               |
| — (new)                              | features          | `features/sticker-picker/`                                                     |
| — (new)                              | features          | `features/ai-reply/`                                                           |
| — (new)                              | features          | `features/mute-chat/`                                                          |
| — (new)                              | features          | `features/pin-chat/`                                                           |
| — (new)                              | features          | `features/create-chat/`                                                        |
| — (new)                              | features          | `features/manage-folders/`                                                     |
| — (new)                              | features          | `features/media-viewer/`                                                       |
| — (new)                              | features          | `features/mention-suggest/`                                                    |
| — (new)                              | features          | `features/message-readers/`                                                    |
| — (new)                              | features          | `features/settings/`                                                           |
| — (new)                              | features          | `features/theme-picker/`                                                       |
| — (new)                              | features          | `features/user-profile/`                                                       |
| — (new)                              | features          | `features/chat-info/`                                                          |
| — (new)                              | features          | `features/typing-indicator/`                                                   |

---

## Authorization and API Requests

```
┌────────────┐    ┌──────────────┐    ┌─────────────────┐
│  React     │───►│  shared/api/ │───►│  Zulip Server   │
│  Component │    │  zulipFetch  │    │  /api/v1/*       │
│            │    │  Basic Auth  │    │                  │
│  useStore  │    │  (email:key) │    ├─────────────────┤
│  selector  │    └──────────────┘    │  Workspace API  │
│            │    ┌──────────────┐    │  /folders/*      │
│            │───►│  entities/*/ │    │  /services/*     │
│            │    │  *.api.ts    │───►│                  │
└────────────┘    └──────────────┘    └─────────────────┘
```

Key points:

- Credentials (`email`, `apiKey`) are stored in `instancesStore` (persisted to `localStorage`).
- `shared/api/client.ts` — low-level helpers (`zulipFetch`, `zulipPost`, `zulipPatch`, `zulipDelete`) + middleware pipeline (auth, logging, retry). Reads credentials from `instancesStore.getState()`.
- `shared/api/workspace-client.ts` — Workspace API `request()` helper with Basic Auth.
- `entities/*/api.ts` — entity-level API functions, uses helpers from `shared/api/`.
- `features/ai-reply/ai-reply.api.ts` — AI provider factory (mock + HTTP).
- Real-time event loop (`shared/lib/event-loop.ts`, started from `widgets/layout/layout-zulip-event-loop.hook.ts`) — registers queue, long-polls, dispatches events via layout dispatch libs.

---

## Imports (no barrel `index.ts`)

Workspace UI follows **concrete segment imports**, not folder-level barrels. Do not add `index.ts` files that only re-export symbols. See `.cursor/rules/no-barrel-index.mdc`.

```typescript
// Import in widgets/features/pages — always point at the segment file:
import { useStickerStore, type Sticker } from "~/entities/sticker/sticker.model";
import type { StickerPack } from "~/entities/sticker/sticker.types";
import { useDraftStore } from "~/entities/draft/draft.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useAiReplyStore } from "~/features/ai-reply/ai-reply.model";
import { SmartReplySuggestions } from "~/features/ai-reply/ai-reply.ui";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { Avatar } from "~/shared/ui/avatar";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
```

Some lazy routes may still resolve a folder via `index.ts` for the bundler; **application code** should import the explicit `*.model.ts` / `*.ui.tsx` path.

---

## File Structure

### Base Slice Template

```text
slice-name/
  slice-name.api.ts          # API calls (fetch functions)
  slice-name.model.ts        # Zustand store or hooks with business logic
  slice-name.types.ts        # TypeScript interfaces and types
  slice-name.lib.ts          # Pure utilities (formatting, parsing, mapping)
  slice-name.ui.tsx           # React component(s)
  slice-name.config.ts       # Constants, configuration
  slice-name.test.ts         # Tests
```

### Zustand Store in FSD

A store is the `model` segment of an entity or feature:

```typescript
// entities/user/user.model.ts
import { create } from "zustand";
import type { UserRecord, UserPresence } from "./user.types";

interface UsersState {
  users: Map<number, UserRecord>;
  mergeUser: (payload: Partial<UserRecord> & { user_id: number }) => void;
  getUser: (userId: number) => UserRecord | undefined;
  clear: () => void;
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: new Map(),
  mergeUser(payload) {
    /* ... */
  },
  getUser(userId) {
    return get().users.get(userId);
  },
  clear() {
    set({ users: new Map() });
  },
}));
```

### Naming Conventions

| Segment     | Suffix        | Example                 |
| ----------- | ------------- | ----------------------- |
| API         | `.api.ts`     | `sticker.api.ts`        |
| Store/Model | `.model.ts`   | `user.model.ts`         |
| Types       | `.types.ts`   | `ai-reply.types.ts`     |
| Utilities   | `.lib.ts`     | `sidebar.lib.ts`        |
| Component   | `.ui.tsx`     | `sticker-picker.ui.tsx` |
| Config      | `.config.ts`  | `theme.config.ts`       |
| Tests       | `.test.ts(x)` | `sticker.test.ts`       |

### Do Not

- Add barrel-only `index.ts` files that re-export the slice (use concrete `*.model.ts` / `*.api.ts` imports). See `no-barrel-index.mdc`.
- Create single-file folders (`ui/`, `lib/`, `model/`) — flatten them instead.
- Create "dump" files like `helpers.ts` or `utils.ts` without context.
- Make cross-layer imports upward (e.g., `entities` from `features` or `widgets` from `pages`).
- Keep `stores/` as a separate folder — stores live in `entities/<name>/` as `.model.ts`.

---

## Cross-store Access in FSD

Zustand allows accessing other stores via `getState()`. In FSD this is only permitted **downward through layers**:

```typescript
// entities/chat-list/chat-list.model.ts
// ✅ OK: entity → entity (same or lower level)
import { useUsersStore } from "~/entities/user/user.model";

// ❌ FORBIDDEN: entity → feature
import { useAiReplyStore } from "~/features/ai-reply/ai-reply.model"; // not allowed!
```

Current cross-store dependencies:

```
entities/chat-list       →  entities/user    (getAvatarMap for DM)
features/mute-chat       →  entities/chat-list (mute affects sidebar display)
features/pin-chat        →  entities/folder  (folder-scoped pinning)
features/chat-info       →  entities/user    (member presence)
features/mention-suggest →  entities/user    (user search for @-mentions)
features/theme-picker    →  entities/theme   (delegates to useThemeStore)
```

All dependencies flow downward (features → entities) or laterally (entities → entities).

---

## Naming

- Slice folders: `kebab-case` (`sticker-picker`, `chat-list`, `folder-rail`)
- Files: `<slice-name>.<segment>.ts(x)` (`sticker.api.ts`, `sidebar.ui.tsx`)
- Components: `PascalCase` inside the file (`export const StickerPicker: React.FC`)
- Stores: `use<Name>Store` (`useStickerStore`, `useAiReplyStore`)
- API functions: `camelCase` (`fetchStickerPacks`, `createHttpProvider`)
- Types/interfaces: `PascalCase` (`Sticker`, `AiSuggestion`)
- Alias: `~/` → `packages/web/src/` (configure in `tsconfig.json` and `vite.config.ts`)

---

## Path Alias

Configure the `~` alias for convenient imports:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"],
    },
  },
}
```

```typescript
// vite.config.ts
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});
```

Imports:

```typescript
import { useUsersStore } from "~/entities/user/user.model";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import { useAiReplyStore } from "~/features/ai-reply/ai-reply.model";
import { SmartReplySuggestions } from "~/features/ai-reply/ai-reply.ui";
import { Avatar } from "~/shared/ui/avatar";
import { JITSI_MEET_DOMAIN } from "~/shared/config/constants";
```

---

## Future Work

- **New entities/pages/features** as product scope expands — follow slice templates in this doc and [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md).
- **IndexedDB message cache** — deferred; see [ADR-010](adr/010-indexeddb-subsystem.md).

> Completed since initial migration: `activity/`, `download/`, `user-group/`, `folder-sync/`, `settings`/`logs`/`update` pages, and related features — see [PROJECT_FACTS.md](PROJECT_FACTS.md).

---

## References

- https://feature-sliced.design — methodology
- https://feature-sliced.design/docs/reference/slices-segments — slices and segments
- https://feature-sliced.design/docs/guides/migration — incremental migration
- `docs/PROJECT_FACTS.md` — canonical counts, paths, versions
- `docs/STORES_REFERENCE.md` — Zustand stores (entities)
- `docs/COMPONENT_CATALOG.md` — UI components (shared/ui, widgets, pages)
- `docs/API_CLIENT_REFERENCE.md` — API functions (entities + shared)
- `docs/INTEGRATION_GUIDE.md` — how to add new features
