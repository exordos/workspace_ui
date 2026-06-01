# Component Catalog

Catalog of all React components organized by FSD layer.

---

## Component Hierarchy

```
app/app.tsx (Router, ErrorBoundary, Suspense)
├── pages/login/LoginPage (lazy)
└── widgets/layout/Layout (shell, data loading, event loop)
    ├── widgets/top-bar/TopBar (nav, search, profile)
    │   └── features/instance-switch/InstanceSwitcher (server dropdown)
    ├── widgets/folder-rail/FolderRail (folder icons)
    │   └── features/manage-folders/ (create/edit/delete folders)
    ├── widgets/sidebar/Sidebar (chat list)
    │   ├── SidebarActivity (starred, mentions, drafts, inbox, feed)
    │   ├── SidebarFolderChatList (unified stream+DM list)
    │   │   └── features/mute-chat/ + features/pin-chat/ (per-chat actions)
    │   ├── SidebarDmList
    │   ├── SidebarGroupList
    │   └── SidebarStreamList
    ├── <Outlet> (routed content)
    │   ├── pages/chat/ChatPage (stream/DM chat)
    │   │   ├── widgets/chat-view/ChatHeader
    │   │   │   └── features/chat-info/ (channel/DM info panel)
    │   │   ├── widgets/message-list/MessageList
    │   │   │   └── widgets/message-list/MessageBubble (per message)
    │   │   │       ├── widgets/message-list (Jitsi card, stickers inline)
    │   │   │       └── features/message-readers/ (read receipts)
    │   │   ├── widgets/message-composer/MessageComposer
    │   │   │   ├── features/sticker-picker/StickerPicker
    │   │   │   ├── features/ai-reply/AiComposerButton
    │   │   │   └── features/mention-suggest/ (@-mention autocomplete)
    │   │   ├── features/ai-reply/SmartReplySuggestions
    │   │   ├── features/jitsi-call/JitsiCallModal
    │   │   └── features/media-viewer/ (fullscreen image/video)
    │   ├── pages/activity/ActivityPage (starred/mentions/reactions)
    │   ├── pages/calendar/CalendarPage (stub)
    │   ├── pages/mail/MailPage (stub)
    │   ├── pages/calls/CallsPage (stub)
    │   └── pages/licenses/LicensesPage (OSS licenses)
    ├── widgets/right-panel/RightDrawer
    │   └── widgets/right-panel/RightPanel (user/channel info)
    │       └── features/user-profile/ (detailed profile view)
    ├── widgets/search-modal/SearchModal
    ├── widgets/profile-drawer/ProfileDrawer
    │   └── features/settings/ + features/theme-picker/ (app settings)
    └── features/create-chat/ (new DM/group/channel dialog)
```

---

## shared/ui — Design System Primitives

| Component                      | File                                             | Purpose                                            |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------------- |
| `Avatar`                       | `shared/ui/avatar.tsx`                           | Circular avatar with fallback                      |
| `Badge`                        | `shared/ui/badge.tsx`                            | Unread count pill                                  |
| `Button`                       | `shared/ui/button.tsx`                           | Generic button                                     |
| `Icon`                         | `shared/ui/icon.tsx`                             | SVG icon registry                                  |
| `ScrollArea`                   | `shared/ui/scroll-area.tsx`                      | Custom scrollbar wrapper                           |
| `Spinner`                      | `shared/ui/spinner.ui.tsx`                       | Loading indicator (`sm` / `md` / `lg`)             |
| `Skeleton`, `SkeletonText`     | `shared/ui/skeleton.ui.tsx`                      | Pulse placeholders                                 |
| `SectionLabel`                 | `shared/ui/section-label.ui.tsx`                 | Uppercase micro section caption                    |
| `FormField`                    | `shared/ui/form-field.ui.tsx`                    | Label + control + optional error                   |
| `SelectableRow`                | `shared/ui/selectable-row.ui.tsx`                | Hoverable list row (`sidebarRowClass`)             |
| `AnchoredPopover`              | `shared/ui/anchored-popover.ui.tsx`              | Fixed backdrop + positioned panel                  |
| `ErrorBoundary`, `PageLoader`  | `shared/ui/error-boundary.tsx`                   | Error boundary + full-screen loader                |
| `PresenceIndicator`            | `shared/ui/presence-indicator.tsx`               | Online/idle/offline dot                            |
| `AppDialog`, `AppDialogShell`  | `shared/ui/app-dialog.ui.tsx`                    | Radix dialog shell + shared overlay classes        |
| `DialogCancelButton`           | `shared/ui/app-dialog.ui.tsx`                    | Styled cancel for custom dialog footers            |
| `DialogPrimaryButton`          | `shared/ui/app-dialog.ui.tsx`                    | Styled submit with optional spinner                |
| `AppDialogFormFooter`          | `shared/ui/app-dialog.ui.tsx`                    | Cancel + submit pair                               |
| `FolderFormModal`              | `shared/ui/folder-form-modal.ui.tsx`             | Create/rename folder form                          |
| `UserPickerList`               | `shared/ui/user-picker-list.ui.tsx`              | Searchable user checklist                          |
| `SearchInput`                  | `shared/ui/search-input.tsx`                     | Search field with icon + clear                     |
| `DropdownMenu`                 | `shared/ui/dropdown-menu.tsx`                    | Radix dropdown / context menu                      |
| `Copyable`                     | `shared/ui/copyable.tsx`                         | Text with copy button                              |
| `ToastHost`, `ToastItem`       | `shared/ui/toast-host.ui.tsx`                    | Toast stack (imperative API in `shared/lib/toast`) |
| `FloatingLoadingOverlay`       | `shared/ui/floating-loading-overlay.tsx`         | In-list loading chip                               |
| `FloatingScrollToBottomButton` | `shared/ui/floating-scroll-to-bottom-button.tsx` | Scroll-to-bottom FAB                               |

**Import**: concrete paths, e.g. `import { Icon } from '~/shared/ui/icon'`, `import { AppDialog } from '~/shared/ui/app-dialog.ui'`

---

## entities — No UI Components

Entity slices contain stores, API functions, and types only. They do not export React components.

**Entities (11):** call, chat-list, draft, feed, folder, inbox, instance, message, sticker, theme, user

---

## features — User Scenario Components (15)

### features/ai-reply

**Import**: `import { SmartReplySuggestions, AiActionMenu, AiComposerButton } from '~/features/ai-reply'`

| Component               | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `SmartReplySuggestions` | Displays AI-generated quick reply suggestions below the message list |
| `AiActionMenu`          | Dropdown menu with AI actions (rewrite, translate, summarize, etc.)  |
| `AiComposerButton`      | Button in the message composer to trigger AI features                |

**Store**: `useAiReplyStore` — status, suggestions, streamingText, generate(), abort(), dismiss()

### features/chat-info

**Import**: `import { useChatInfoStore } from '~/features/chat-info'`

| Export             | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `useChatInfoStore` | Channel/DM info: description, member count, online count, member list |
| `ChatInfoData`     | Type for info panel data                                              |
| `ChatInfoMember`   | Type for individual member with presence                              |

**Store**: `useChatInfoStore` — data, loading, error, setData(), clear()

### features/create-chat

**Import**: `import { useCreateChatStore } from '~/features/create-chat'`

| Export                    | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `useCreateChatStore`      | DM/group/channel creation flow state       |
| `createChannel`           | API: create a new channel with subscribers |
| `fetchSubscribedChannels` | API: list subscribed channels              |
| `unsubscribeChannel`      | API: unsubscribe from a channel            |

**Store**: `useCreateChatStore` — chatType, selectedUserIds, channelName, status

### features/instance-switch

**Import**: `import { InstanceSwitcher } from '~/features/instance-switch'`

| Component          | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `InstanceSwitcher` | Radix DropdownMenu with current server hostname + switch/add/remove |

**Store**: `useInstancesStore` (from `~/entities/instance`)

### features/jitsi-call

**Import**: `import { JitsiCallModal } from '~/features/jitsi-call'`

| Component        | Purpose                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `JitsiCallModal` | Full-screen modal with Jitsi iframe, participant count, minimize |

**Store**: `useCallParticipantsStore` (from `~/entities/call`)

### features/manage-folders

**Import**: `import { useManageFoldersStore } from '~/features/manage-folders'`

| Export                  | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `useManageFoldersStore` | Folder CRUD: create, edit, delete with status tracking |
| `createFolder`          | API: create folder via Workspace API                   |
| `updateFolder`          | API: update folder title/color                         |
| `deleteFolder`          | API: delete folder                                     |

**Store**: `useManageFoldersStore` — editMode, status, create(), update(), remove()

### features/media-viewer

**Import**: `import { useMediaViewerStore } from '~/features/media-viewer'`

| Export                | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `useMediaViewerStore` | Full-screen image/video lightbox navigation  |
| `MediaItem`           | Type for media items (url, type, dimensions) |
| `MediaType`           | `"image" \| "video"`                         |

**Store**: `useMediaViewerStore` — isOpen, items, currentIndex, open(), close(), next(), prev()

### features/mention-suggest

**Import**: `import { useMentionSuggestStore, filterUsers } from '~/features/mention-suggest'`

| Export                   | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `useMentionSuggestStore` | @-mention autocomplete state                |
| `filterUsers`            | Pure function: filter users by query string |
| `MentionSuggestion`      | Type for suggestion items                   |

**Store**: `useMentionSuggestStore` — query, results, visible, show(), hide()

### features/message-readers

**Import**: `import { useMessageReadersStore, fetchReadReceipts } from '~/features/message-readers'`

| Export                   | Purpose                               |
| ------------------------ | ------------------------------------- |
| `useMessageReadersStore` | Read receipts for a message           |
| `fetchReadReceipts`      | API: get reader list for a message ID |

**Store**: `useMessageReadersStore` — userIds, messageId, fetchReadReceipts(), clear()

### features/mute-chat

**Import**: `import { useMuteStore } from '~/features/mute-chat'`

| Export                        | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `useMuteStore`                | Stream + topic muting with three-level resolution |
| `topicKey`                    | Helper: `"${streamId}:${topic}"`                  |
| `muteStream` / `unmuteStream` | API: mute/unmute a stream                         |
| `muteTopic` / `unmuteTopic`   | API: mute/unmute a topic                          |

**Store**: `useMuteStore` — mutedStreamIds, mutedTopicKeys, isEffectivelyMuted()

### features/pin-chat

**Import**: `import { usePinStore, pinChatInFolder, unpinChatInFolder } from '~/features/pin-chat'`

| Export              | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `usePinStore`       | Folder-scoped chat pinning                  |
| `pinChatInFolder`   | API: pin a chat in a folder (Workspace API) |
| `unpinChatInFolder` | API: unpin a chat from a folder             |

**Store**: `usePinStore` — folderPins, isPinned(), getPinnedChatIds()

### features/settings

**Import**: `import { useSettingsStore } from '~/features/settings'`

| Export              | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `useSettingsStore`  | App settings (language, sorting, notification sound) |
| `AppSettings`       | Type for settings object                             |
| `ChatSorting`       | `"recent" \| "unread" \| "alphabetical"`             |
| `NotificationSound` | `"default" \| "subtle" \| "none"`                    |
| `AppLanguage`       | `"en" \| "ru"`                                       |

**Store**: `useSettingsStore` — chatSorting, notificationSound, language (persisted to localStorage)

### features/sticker-picker

**Import**: `import { StickerPicker } from '~/features/sticker-picker'`

| Component       | Purpose                                                 |
| --------------- | ------------------------------------------------------- |
| `StickerPicker` | Sticker picker panel integrated in the message composer |

**Store**: `useStickerStore` (from `~/entities/sticker`) — packs, recent, favorites

### features/theme-picker

**Import**: `import { getAvailablePalettes, selectPalette, selectMode, toggleMode } from '~/features/theme-picker'`

| Export                 | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `getAvailablePalettes` | Returns available palettes with preview colors |
| `selectPalette`        | Sets active palette via `useThemeStore`        |
| `selectMode`           | Sets theme mode (light/dark/system)            |
| `toggleMode`           | Toggles between dark and light                 |
| `AvailablePalette`     | Type with id, name, preview                    |

**Store**: Delegates to `useThemeStore` (from `~/entities/theme`) — no own store

### features/user-profile

**Import**: `import { useUserProfileStore, fetchUserProfile } from '~/features/user-profile'`

| Export                | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `useUserProfileStore` | Detailed user profile loading and display                   |
| `fetchUserProfile`    | API: fetch profile by user ID                               |
| `UserProfileData`     | Type with extended fields (job title, manager, phone, etc.) |

**Store**: `useUserProfileStore` — profile, status, loadProfile(), clear()

---

## widgets — Composite UI Blocks

### widgets/layout

**Import**: `import { Layout } from '~/widgets/layout'`

**Purpose**: Root shell — data loading, event loop, presence polling, layout shell
**Stores**: instancesStore, chatListStore, currentChatMessagesStore, usersStore
**Contexts (provides)**: OpenSearchContext, RightDrawerContext
**Lifecycle**: On `currentInstanceId` change — loads users + messages in parallel, starts event loop, loads folders, starts presence polling (90s)
**Layout**: `h-screen flex-col` → TopBar → `flex-1 flex` → [FolderRail | Sidebar | main | RightDrawer]

### widgets/top-bar

**Import**: `import { TopBar } from '~/widgets/top-bar'`

**Props**:

```typescript
interface TopBarProps {
  activeSection: "chat" | "calendar" | "mail" | "calls";
  onSectionChange: (section: TopBarSection) => void;
  onOpenSearch?: () => void;
  onOpenProfile?: () => void;
  leftContent?: ReactNode;
}
```

**Stores**: chatListStore (currentUserId), usersStore (getUser for avatar + presence)

### widgets/folder-rail

**Import**: `import { FolderRail } from '~/widgets/folder-rail'`

**Props**:

```typescript
interface FolderRailProps {
  folders: { id: string; label: string; badge?: number }[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
}
```

**Layout**: `w-[90px] flex-col items-center`. Folder icons with badges.

### widgets/sidebar

**Import**: `import { Sidebar } from '~/widgets/sidebar'`

**Props**: `SidebarProps` (streams, chats, active selections, handlers)
**Children**: ScrollArea, SidebarActivity, SidebarFolderChatList, SidebarDmList, SidebarGroupList, SidebarStreamList
**Features**: chat search, expand/collapse streams
**Layout**: `w-[300px] md:w-[340px] bg-sidebar-bg rounded-[12px]`

**Sub-components** (not exported, internal to widget):

| Component               | File                              | Purpose                                             |
| ----------------------- | --------------------------------- | --------------------------------------------------- |
| `SidebarActivity`       | `sidebar-activity.ui.tsx`         | Starred, Flagged, Mentions, Reactions, Drafts links |
| `SidebarFolderChatList` | `sidebar-folder-chat-list.ui.tsx` | Unified stream+DM list with expand/collapse         |
| `SidebarDmList`         | `sidebar-dm-list.ui.tsx`          | DM conversation list with presence                  |
| `SidebarGroupList`      | `sidebar-group-list.ui.tsx`       | Group chat list                                     |
| `SidebarStreamList`     | `sidebar-stream-list.ui.tsx`      | Channel/stream list with topics                     |

**Utilities** (`sidebar.lib.ts`):

| Export                                                   | Purpose                        |
| -------------------------------------------------------- | ------------------------------ |
| `slugForStream(stream)`                                  | `"5-general"` — ID + name slug |
| `parseStreamSlug(slug)`                                  | `{ stream_id?, stream_name }`  |
| `parseDmSlugToUserIds(slug)`                             | `number[]`                     |
| `buildSidebarFromMessages(messages, userId, avatarMap?)` | Builds streams + DMs maps      |
| `dmConversationKey(display_recipient, userId)`           | Canonical DM key               |

### widgets/chat-view

**Import**: `import { ChatHeader } from '~/widgets/chat-view'`

**Props**:

```typescript
interface ChatHeaderProps {
  channelName: string;
  topic?: string;
  participantsCount?: number;
  onlineCount?: number;
  onOpenSearch?: () => void;
  onToggleRightPanel?: () => void;
  rightPanelOpen?: boolean;
  onCallClick?: () => void;
  dmPartner?: { avatarUrl?; name; presenceState; lastSeen? };
}
```

### widgets/message-list

**Import**: `import { MessageList } from '~/widgets/message-list'`

**Props**:

```typescript
interface MessageListProps {
  messages: MockMessage[];
  currentUserId?: number;
  scrollToBottomKey?: string;
  callbacks?: MessageListCallbacks;
  selectionMode?: boolean;
  selectedMessageIds?: Set<number>;
}
```

**Features**: date grouping, sender grouping, scroll-to-bottom FAB, auto-scroll on new message
**Sub-component**: `MessageBubble` — context menu, quick reactions, Jitsi detection, sticker rendering

### widgets/message-composer

**Import**: `import { MessageComposer } from '~/widgets/message-composer'`

**Props**:

```typescript
interface MessageComposerProps {
  onSend?: (content: string, subject?: string, files?: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  activeTopic?: string;
  replyQuote?: { id: number; content: string; sender_full_name: string } | null;
  onClearReply?: () => void;
}
```

**Features**: Enter=send, Shift+Enter=newline, emoji picker, file attach, reply quote, sticker picker, AI composer button

### widgets/right-panel

**Import**: `import { RightPanel, RightDrawer } from '~/widgets/right-panel'`

| Component     | Props                                                | Purpose                              |
| ------------- | ---------------------------------------------------- | ------------------------------------ |
| `RightDrawer` | `{ onClose, children }`                              | Slide-in panel container `w-[315px]` |
| `RightPanel`  | `{ title, participantsCount?, onlineCount?, user? }` | User or channel info content         |

### widgets/search-modal

**Import**: `import { SearchModal } from '~/widgets/search-modal'`

**Props**: `{ open; onOpenChange; onSelectMessage }`
**Features**: 300ms debounce, fulltext search via `fetchMessages`
**Layout**: Radix Dialog `max-w-xl max-h-[60vh]`

### widgets/profile-drawer

**Import**: `import { ProfileDrawer } from '~/widgets/profile-drawer'`

**Props**: `{ open; onOpenChange }`
**Menu items**: add server, personal info, version, notifications, language, theme, sorting, logs, logout

---

## pages — Route Components

All pages are lazy-loaded via `React.lazy()` in `app/app.tsx`.

| Page           | Path                                                | File                                  | Purpose                          |
| -------------- | --------------------------------------------------- | ------------------------------------- | -------------------------------- |
| `ChatPage`     | `/stream/:streamSlug/topic/:topicName`, `/dm/:dmId` | `pages/chat/chat-page.ui.tsx`         | Main chat — stream, topic, or DM |
| `ActivityPage` | `/activity/:filter`                                 | `pages/activity/activity-page.ui.tsx` | Starred, mentions, reactions     |
| `LoginPage`    | `/login`                                            | `pages/login/login-page.ui.tsx`       | Login form                       |
| `CalendarPage` | `/calendar`                                         | `pages/calendar/calendar-page.ui.tsx` | Calendar stub                    |
| `MailPage`     | `/mail`                                             | `pages/mail/mail-page.ui.tsx`         | Mail stub                        |
| `CallsPage`    | `/calls`                                            | `pages/calls/calls-page.ui.tsx`       | Calls stub                       |
| `LicensesPage` | `/licenses`                                         | `pages/licenses/licenses-page.ui.tsx` | OSS license list                 |

### ChatPage

**Stores**: chatListStore, currentChatMessagesStore, usersStore, themeStore
**Contexts**: OpenSearchContext, RightDrawerContext
**Features**: send messages, edit/delete/copy/forward/star, reactions, Jitsi calls, file upload, multi-select, auto-mark-as-read, AI replies, stickers

### ActivityPage

**Params**: `filter` — `"starred"`, `"mentions"`, `"reactions"`
**Layout**: ChatHeader (reused) → scrollable message list

### LoginPage

**Features**: fetchApiKey → addInstance → navigate("/")
**Layout**: centered card `max-w-md`
