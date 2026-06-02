# Frontend Architecture — Feature-Sliced Design

The Workspace UI frontend is built using [Feature-Sliced Design](https://feature-sliced.design).
Stack: React 19, TypeScript, Vite 6, Zustand, Tailwind CSS, Radix UI, react-router-dom 7.

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
- `entities` — business entities (user, message, chat-list, instance, theme, call, sticker, folder, draft, inbox, feed), Zustand stores, API calls.
- `features` — user scenarios on top of entities (ai-reply, chat-info, create-chat, instance-switch, jitsi-call, manage-folders, media-viewer, mention-suggest, message-readers, mute-chat, pin-chat, settings, sticker-picker, theme-picker, typing-indicator, user-profile).
- `widgets` — compositions living on pages (sidebar, chat-view, message-composer, layout, top-bar...).
- `pages` — routes, compose widgets and features.
- `app` — entry point, router, providers, event loop.

> The `processes` layer (cross-cutting scenarios) is merged with `app` — authorization and the real-time event loop live in `app/`.

---

## Current Structure

```text
packages/web/src/
├── app/
│   ├── app.tsx                     # Root component, BrowserRouter
│   ├── app.event-loop.ts           # Zulip real-time event loop orchestration
│   ├── app.styles.css              # Global styles, CSS theme variables
│   ├── webview-shell.tsx           # Embedded webview shell
│   ├── contexts/
│   │   ├── open-search.tsx         # Search modal context
│   │   └── right-drawer.tsx        # Right drawer context
│   └── index.ts
│
├── pages/
│   ├── activity/
│   │   ├── activity-page.ui.tsx
│   │   └── index.ts
│   ├── calendar/
│   │   ├── calendar-page.ui.tsx
│   │   └── index.ts
│   ├── calls/
│   │   ├── calls-page.ui.tsx
│   │   └── index.ts
│   ├── chat/
│   │   ├── chat-page.ui.tsx
│   │   └── index.ts
│   ├── feed/
│   │   ├── feed-page.ui.tsx
│   │   └── index.ts
│   ├── inbox/
│   │   ├── inbox-page.ui.tsx
│   │   └── index.ts
│   ├── licenses/
│   │   ├── licenses-page.ui.tsx
│   │   └── index.ts
│   ├── login/
│   │   ├── login-page.ui.tsx
│   │   └── index.ts
│   └── mail/
│       ├── mail-page.ui.tsx
│       └── index.ts
│
├── widgets/
│   ├── layout/
│   │   ├── layout.ui.tsx           # Shell: TopBar + FolderRail + Sidebar + Outlet + RightDrawer
│   │   └── index.ts
│   ├── sidebar/
│   │   ├── sidebar.ui.tsx
│   │   ├── sidebar.lib.ts          # buildSidebarFromMessages, slugs, keys
│   │   ├── sidebar.types.ts
│   │   ├── sidebar-activity.ui.tsx
│   │   ├── sidebar-dm-list.ui.tsx
│   │   ├── sidebar-folder-chat-list.ui.tsx
│   │   ├── sidebar-group-list.ui.tsx
│   │   ├── sidebar-stream-list.ui.tsx
│   │   └── index.ts
│   ├── chat-view/
│   │   ├── chat-header.ui.tsx
│   │   └── index.ts
│   ├── message-list/
│   │   ├── message-list.ui.tsx
│   │   ├── message-bubble.ui.tsx
│   │   └── index.ts
│   ├── message-composer/
│   │   ├── message-composer.ui.tsx
│   │   └── index.ts
│   ├── top-bar/
│   │   ├── top-bar.ui.tsx
│   │   └── index.ts
│   ├── folder-rail/
│   │   ├── folder-rail.ui.tsx
│   │   └── index.ts
│   ├── right-panel/
│   │   ├── right-panel.ui.tsx
│   │   ├── right-drawer.ui.tsx
│   │   └── index.ts
│   ├── search-modal/
│   │   ├── search-modal.ui.tsx
│   │   └── index.ts
│   └── profile-drawer/
│       ├── profile-drawer.ui.tsx
│       └── index.ts
│
├── features/
│   ├── ai-reply/
│   │   ├── ai-reply.api.ts        # createMockProvider, createHttpProvider
│   │   ├── ai-reply.model.ts      # useAiReplyStore (Zustand)
│   │   ├── ai-reply.types.ts      # AiAction, AiTone, AiSuggestion, AiReplyProvider
│   │   ├── ai-reply.ui.tsx         # SmartReplySuggestions, AiActionMenu, AiComposerButton
│   │   ├── ai-reply.test.ts
│   │   └── index.ts
│   ├── chat-info/
│   │   ├── chat-info.model.ts     # useChatInfoStore (channel/DM info + members)
│   │   ├── chat-info.types.ts     # ChatInfoData, ChatInfoMember
│   │   ├── chat-info.test.ts
│   │   └── index.ts
│   ├── create-chat/
│   │   ├── create-chat.api.ts     # createChannel, fetchSubscribedChannels, unsubscribeChannel
│   │   ├── create-chat.model.ts   # useCreateChatStore (DM/group/channel creation)
│   │   ├── create-chat.types.ts   # CreateChatStatus, NewChatType
│   │   ├── create-chat.test.ts
│   │   └── index.ts
│   ├── instance-switch/
│   │   ├── instance-switch.ui.tsx  # Server dropdown (Radix DropdownMenu)
│   │   └── index.ts
│   ├── jitsi-call/
│   │   ├── jitsi-call.ui.tsx       # Jitsi call modal (iframe)
│   │   └── index.ts
│   ├── manage-folders/
│   │   ├── manage-folders.api.ts   # createFolder, updateFolder, deleteFolder
│   │   ├── manage-folders.model.ts # useManageFoldersStore (CRUD + edit mode)
│   │   ├── manage-folders.types.ts # CreateFolderInput, UpdateFolderInput, FolderItem
│   │   ├── manage-folders.test.ts
│   │   └── index.ts
│   ├── media-viewer/
│   │   ├── media-viewer.model.ts   # useMediaViewerStore (lightbox navigation)
│   │   ├── media-viewer.types.ts   # MediaItem, MediaType
│   │   ├── media-viewer.test.ts
│   │   └── index.ts
│   ├── mention-suggest/
│   │   ├── mention-suggest.lib.ts  # filterUsers (pure)
│   │   ├── mention-suggest.model.ts # useMentionSuggestStore (@-mention autocomplete)
│   │   ├── mention-suggest.types.ts # MentionSuggestion
│   │   ├── mention-suggest.test.ts
│   │   └── index.ts
│   ├── message-readers/
│   │   ├── message-readers.api.ts  # fetchReadReceipts
│   │   ├── message-readers.model.ts # useMessageReadersStore (read receipts)
│   │   ├── message-readers.types.ts # ReadReceiptsResponse
│   │   ├── message-readers.test.ts
│   │   └── index.ts
│   ├── mute-chat/
│   │   ├── mute-chat.api.ts       # muteStream, unmuteStream, muteTopic, unmuteTopic
│   │   ├── mute-chat.model.ts     # useMuteStore (stream + topic muting)
│   │   ├── mute-chat.types.ts     # MuteTarget, VisibilityPolicy
│   │   ├── mute-chat.test.ts
│   │   └── index.ts
│   ├── pin-chat/
│   │   ├── pin-chat.api.ts        # pinChatInFolder, unpinChatInFolder
│   │   ├── pin-chat.model.ts      # usePinStore (folder-scoped pinning)
│   │   ├── pin-chat.types.ts      # PinnedChat
│   │   ├── pin-chat.test.ts
│   │   └── index.ts
│   ├── settings/
│   │   ├── settings.model.ts      # useSettingsStore (language, sorting, sounds)
│   │   ├── settings.types.ts      # AppSettings, ChatSorting, NotificationSound, AppLanguage
│   │   ├── settings.test.ts
│   │   └── index.ts
│   ├── sticker-picker/
│   │   ├── sticker-picker.ui.tsx   # Sticker picker panel in composer
│   │   └── index.ts
│   ├── theme-picker/
│   │   ├── theme-picker.model.ts   # getAvailablePalettes, selectPalette, selectMode, toggleMode
│   │   ├── theme-picker.types.ts   # AvailablePalette, PalettePreview
│   │   ├── theme-picker.test.ts
│   │   └── index.ts
│   ├── typing-indicator/
│   │   ├── typing-indicator.model.ts  # useTypingIndicatorStore (who is typing per chat)
│   │   ├── typing-indicator.api.ts    # sendTypingStart, sendTypingStop
│   │   ├── typing-indicator.types.ts  # TypingUser, TypingEvent
│   │   ├── typing-indicator.test.ts
│   │   └── index.ts
│   └── user-profile/
│       ├── user-profile.api.ts     # fetchUserProfile
│       ├── user-profile.model.ts   # useUserProfileStore (detailed profile loading)
│       ├── user-profile.types.ts   # UserProfileData
│       ├── user-profile.test.ts
│       └── index.ts
│
├── entities/
│   ├── call/
│   │   ├── call.model.ts           # useCallParticipantsStore (Zustand)
│   │   └── index.ts
│   ├── chat-list/
│   │   ├── chat-list.model.ts      # useChatListStore (Zustand)
│   │   └── index.ts
│   ├── draft/
│   │   ├── draft.api.ts            # fetchDrafts, createDraft, updateDraftOnServer, deleteDraftOnServer
│   │   ├── draft.model.ts          # useDraftStore (Zustand)
│   │   ├── draft.types.ts          # Draft, DraftInput, DraftType
│   │   ├── draft.test.ts
│   │   └── index.ts
│   ├── feed/
│   │   ├── feed.api.ts             # fetchFeedMessages
│   │   ├── feed.model.ts           # useFeedStore (Zustand)
│   │   ├── feed.types.ts           # FeedMessage
│   │   ├── feed.test.ts
│   │   └── index.ts
│   ├── folder/
│   │   ├── folder.api.ts           # getFolders, mapWorkspaceFoldersToRail
│   │   └── index.ts
│   ├── inbox/
│   │   ├── inbox.api.ts            # fetchInboxEntries
│   │   ├── inbox.model.ts          # useInboxStore (Zustand)
│   │   ├── inbox.types.ts          # InboxEntry, InboxGroupType
│   │   ├── inbox.test.ts
│   │   └── index.ts
│   ├── instance/
│   │   ├── instance.model.ts       # useInstancesStore (Zustand)
│   │   └── index.ts
│   ├── message/
│   │   ├── message.model.ts        # useCurrentChatMessagesStore (Zustand)
│   │   └── index.ts
│   ├── sticker/
│   │   ├── sticker.api.ts          # fetchStickerPacks, searchStickers, install/uninstall
│   │   ├── sticker.model.ts        # useStickerStore (Zustand)
│   │   ├── sticker.types.ts        # Sticker, StickerPack, StickerFormat
│   │   ├── sticker.test.ts
│   │   └── index.ts
│   ├── theme/
│   │   ├── theme.model.ts          # useThemeStore (Zustand)
│   │   └── index.ts
│   └── user/
│       ├── user.api.ts             # reportPresence
│       ├── user.model.ts           # useUsersStore (Zustand)
│       └── index.ts
│
├── shared/
│   ├── ui/
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── call-bubble.tsx
│   │   ├── error-boundary.tsx
│   │   ├── icon.tsx
│   │   ├── presence-indicator.tsx
│   │   ├── scroll-area.tsx
│   │   ├── sticker-message.tsx
│   │   └── index.ts
│   ├── api/
│   │   ├── client.ts               # zulipFetch, zulipPost, zulipPatch, zulipDelete + middleware
│   │   ├── workspace-client.ts     # Workspace API request()
│   │   └── index.ts
│   ├── lib/
│   │   ├── format.ts               # formatMessageTime, formatLastSeen, sidebarRowClass
│   │   ├── html.ts                 # stripHtml, sanitizeHtml
│   │   ├── jitsi.ts                # parseJitsiUrl, buildJitsiMeetingUrl
│   │   ├── logger.ts               # Structured logging with redaction
│   │   ├── auth-guard.ts           # buildAuthHeader, wipeCredentials, initAuthGuard
│   │   ├── brand.ts                # White-label configuration
│   │   ├── env.ts                  # Centralized env vars
│   │   ├── electron.ts             # Electron helpers
│   │   ├── validation.ts           # URL, email, file, filename validation
│   │   ├── roles.ts                # Zulip role model & permissions
│   │   ├── shortcuts.ts            # Keyboard shortcut registry
│   │   ├── sentry.ts               # Error tracking (opt-in)
│   │   ├── perf.ts                 # Performance monitoring
│   │   ├── visibility.ts           # Background tab resilience
│   │   ├── notifications.ts        # Unified notification service
│   │   ├── updater.ts              # Auto-update (Electron + PWA)
│   │   ├── os-integration.ts       # Badge, progress bar, tray
│   │   ├── pwa.ts                  # PWA install & detection
│   │   ├── network.ts              # Online/offline detection
│   │   ├── deeplinks.ts            # Deep link parsing & generation
│   │   ├── navigation-history.ts   # Navigation history management
│   │   ├── touch.ts                # Touch gesture support
│   │   ├── devtools.ts             # __dev__.* console tools
│   │   ├── ai-context.ts           # AI context helpers
│   │   ├── avatar.ts               # Avatar URL helpers
│   │   ├── call-state.ts           # Call state utilities
│   │   ├── embed.tsx               # Iframe embed component
│   │   ├── focus.ts                # Focus management
│   │   ├── gestures.ts             # Gesture detection
│   │   ├── guards.ts               # Runtime guards (invariant, safeGet, assertNever)
│   │   ├── presence.ts             # Presence tracking engine
│   │   ├── webview.ts              # Webview helpers
│   │   ├── analytics/              # GA4, Yandex Metrica
│   │   │   ├── ga4.ts
│   │   │   ├── ym.ts
│   │   │   ├── setup.ts
│   │   │   ├── types.ts
│   │   │   ├── usePageView.ts
│   │   │   └── index.ts
│   │   ├── themes/                 # Theme engine + palettes
│   │   │   ├── engine.ts
│   │   │   ├── tokens.ts
│   │   │   ├── orange-warm.ts
│   │   │   ├── blue-cold.ts
│   │   │   ├── registry.ts
│   │   │   └── index.ts
│   │   ├── push/                   # Push notification subsystem
│   │   │   ├── fcm.ts
│   │   │   ├── zulip.ts
│   │   │   ├── middleware.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── plugins/                # Plugin system
│   │   │   ├── api.ts
│   │   │   ├── hooks.tsx
│   │   │   ├── registry.ts
│   │   │   ├── setup.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── config/
│   │   ├── constants.ts            # JITSI_MEET_DOMAIN, WORKSPACE_ORIGIN, SCROLL_AREA_CLASS
│   │   └── index.ts
│   └── assets/
│       └── icons/                  # 40+ SVG icons
│
├── i18n/                           # Internationalization
│   ├── index.ts
│   ├── index.test.ts
│   └── locales/
│       ├── ru.json
│       └── en.json
│
├── test/                           # Test infrastructure
│   ├── setup.ts
│   ├── render.tsx
│   ├── factories.ts
│   ├── tdd-templates.ts
│   └── mocks/handlers.ts
│
├── generated/                      # Auto-generated files
│   └── licenses.json
│
└── main.tsx                        # Vite entry point → app/
```

### Legacy Directories

The original pre-FSD directories (`components/`, `stores/`, `lib/`, `contexts/`) have been removed.
New code must follow the FSD slice layout under `app/`, `pages/`, `widgets/`, `features/`, `entities/`, `shared/`.

---

## Migration History

| Phase   | Description                                                                                                                                                                                                                                            | Status   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Phase 1 | `shared/` + `entities/` — primitives, API helpers, stores                                                                                                                                                                                              | **Done** |
| Phase 2 | `widgets/` — sidebar, layout, chat-view, panels, top-bar                                                                                                                                                                                               | **Done** |
| Phase 3 | `features/` — 16 features (ai-reply, chat-info, create-chat, instance-switch, jitsi-call, manage-folders, media-viewer, mention-suggest, message-readers, mute-chat, pin-chat, settings, sticker-picker, theme-picker, typing-indicator, user-profile) | **Done** |
| Phase 4 | `pages/` + `app/` — route pages, router, contexts, event loop                                                                                                                                                                                          | **Done** |

All four phases are complete. New features (sticker, ai-reply) were created directly in FSD from scratch.

---

## Mapping: Legacy → FSD

| Legacy Path                          | FSD Layer         | FSD Path                                                    |
| ------------------------------------ | ----------------- | ----------------------------------------------------------- |
| `components/Layout.tsx`              | widgets           | `widgets/layout/`                                           |
| `components/ChatPage.tsx`            | pages             | `pages/chat/`                                               |
| `components/ActivityPage.tsx`        | pages             | `pages/activity/`                                           |
| `components/LoginPage.tsx`           | pages             | `pages/login/`                                              |
| `components/ChatHeader.tsx`          | widgets           | `widgets/chat-view/`                                        |
| `components/MessageList.tsx`         | widgets           | `widgets/message-list/`                                     |
| `components/ui/MessageBubble.tsx`    | widgets           | `widgets/message-list/`                                     |
| `components/ui/MessageComposer.tsx`  | widgets           | `widgets/message-composer/`                                 |
| `components/ui/Sidebar/`             | widgets           | `widgets/sidebar/`                                          |
| `components/ui/TopBar.tsx`           | widgets           | `widgets/top-bar/`                                          |
| `components/ui/FolderRail.tsx`       | widgets           | `widgets/folder-rail/`                                      |
| `components/ui/RightPanel.tsx`       | widgets           | `widgets/right-panel/`                                      |
| `components/ui/RightDrawer.tsx`      | widgets           | `widgets/right-panel/`                                      |
| `components/SearchModal.tsx`         | widgets           | `widgets/search-modal/`                                     |
| `components/ProfileDrawer.tsx`       | widgets           | `widgets/profile-drawer/`                                   |
| `components/InstanceSwitcher.tsx`    | features          | `features/instance-switch/`                                 |
| `components/JitsiCallModal.tsx`      | features          | `features/jitsi-call/`                                      |
| `components/ui/Avatar.tsx`           | shared            | `shared/ui/avatar.tsx`                                      |
| `components/ui/Badge.tsx`            | shared            | `shared/ui/badge.tsx`                                       |
| `components/ui/Button.tsx`           | shared            | `shared/ui/button.tsx`                                      |
| `components/ui/Icon.tsx`             | shared            | `shared/ui/icon.tsx`                                        |
| `components/ui/ScrollArea.tsx`       | shared            | `shared/ui/scroll-area.tsx`                                 |
| `components/ui/CallBubble.tsx`       | shared            | `shared/ui/call-bubble.tsx`                                 |
| `components/ErrorBoundary.tsx`       | shared            | `shared/ui/error-boundary.tsx`                              |
| `stores/chatListStore.ts`            | entities          | `entities/chat-list/chat-list.model.ts`                     |
| `stores/currentChatMessagesStore.ts` | entities          | `entities/message/message.model.ts`                         |
| `stores/usersStore.ts`               | entities          | `entities/user/user.model.ts`                               |
| `stores/instancesStore.ts`           | entities          | `entities/instance/instance.model.ts`                       |
| `stores/themeStore.ts`               | entities          | `entities/theme/theme.model.ts`                             |
| `stores/callParticipantsStore.ts`    | entities          | `entities/call/call.model.ts`                               |
| `stores/sidebarConfigStore.ts`       | widgets           | `widgets/sidebar/sidebar-config.model.ts`                   |
| `lib/zulipClient.ts`                 | entities + shared | Entity API → `entities/*/`, fetch helpers → `shared/api/`   |
| `lib/zulipRealtime.ts`               | app               | `app/app.event-loop.ts`                                     |
| `lib/api/workspaceClient.ts`         | shared + entities | Base fetch → `shared/api/`, folder API → `entities/folder/` |
| `lib/constants.ts`                   | shared            | `shared/config/constants.ts`                                |
| `lib/format.ts`                      | shared            | `shared/lib/format.ts`                                      |
| `lib/html.ts`                        | shared            | `shared/lib/html.ts`                                        |
| `lib/jitsi.ts`                       | shared            | `shared/lib/jitsi.ts`                                       |
| `contexts/`                          | app               | `app/contexts/`                                             |
| `styles/index.css`                   | app               | `app/app.styles.css`                                        |
| `assets/icons/`                      | shared            | `shared/assets/icons/`                                      |
| `App.tsx`                            | app               | `app/app.tsx`                                               |
| — (new)                              | entities          | `entities/sticker/`                                         |
| — (new)                              | entities          | `entities/draft/`                                           |
| — (new)                              | entities          | `entities/inbox/`                                           |
| — (new)                              | entities          | `entities/feed/`                                            |
| — (new)                              | features          | `features/sticker-picker/`                                  |
| — (new)                              | features          | `features/ai-reply/`                                        |
| — (new)                              | features          | `features/mute-chat/`                                       |
| — (new)                              | features          | `features/pin-chat/`                                        |
| — (new)                              | features          | `features/create-chat/`                                     |
| — (new)                              | features          | `features/manage-folders/`                                  |
| — (new)                              | features          | `features/media-viewer/`                                    |
| — (new)                              | features          | `features/mention-suggest/`                                 |
| — (new)                              | features          | `features/message-readers/`                                 |
| — (new)                              | features          | `features/settings/`                                        |
| — (new)                              | features          | `features/theme-picker/`                                    |
| — (new)                              | features          | `features/user-profile/`                                    |
| — (new)                              | features          | `features/chat-info/`                                       |
| — (new)                              | features          | `features/typing-indicator/`                                |

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
- Real-time event loop (`app/app.event-loop.ts`) — registers queue, long-polls, dispatches events to stores.

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

- **Legacy cleanup**: Remove `components/`, `stores/`, `lib/`, `contexts/` directories once all imports point to FSD paths.
- **New entities**: `channel/`, `organization/` (as product scope expands).
- **New features**: `send-message/`, `edit-message/`, `file-upload/` (as separate slices where justified).
- **New pages**: extend route coverage only when a dedicated page-level UX is required.

> Completed since initial migration: `draft/`, `inbox/`, `feed/` entities; `manage-folders/`, `create-chat/`, `mention-suggest/`, `mute-chat/`, `pin-chat/`, `media-viewer/`, `message-readers/`, `settings/`, `theme-picker/`, `user-profile/`, `chat-info/` features.

---

## References

- https://feature-sliced.design — methodology
- https://feature-sliced.design/docs/reference/slices-segments — slices and segments
- https://feature-sliced.design/docs/guides/migration — incremental migration
- `docs/STORES_REFERENCE.md` — Zustand stores (entities)
- `docs/COMPONENT_CATALOG.md` — UI components (shared/ui, widgets, pages)
- `docs/API_CLIENT_REFERENCE.md` — API functions (entities + shared)
- `docs/INTEGRATION_GUIDE.md` — how to add new features
