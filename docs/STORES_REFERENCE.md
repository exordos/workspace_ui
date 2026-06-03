# Zustand Stores Reference

Complete technical documentation for Zustand stores in the FSD architecture.

Stores are the `model` segment of their respective entity, feature, or widget slice. **Import concrete paths** (e.g. `~/entities/user/user.model`), not folder barrels. See [PROJECT_FACTS.md](PROJECT_FACTS.md) for slice counts.

---

## Store Map

| Store                           | Layer    | Path                                                                | Persistence  |
| ------------------------------- | -------- | ------------------------------------------------------------------- | ------------ |
| `useInstancesStore`             | entities | `entities/instance/instance.model.ts`                               | localStorage |
| `useChatListStore`              | entities | `entities/chat-list/chat-list.model.ts`                             | —            |
| `useCurrentChatMessagesStore`   | entities | `entities/message/message.model.ts`                                 | —            |
| `useUsersStore`                 | entities | `entities/user/user.model.ts`                                       | —            |
| `useThemeStore`                 | entities | `entities/theme/theme.model.ts`                                     | localStorage |
| `useCallParticipantsStore`      | entities | `entities/call/call.model.ts`                                       | —            |
| `useStickerStore`               | entities | `entities/sticker/sticker.model.ts`                                 | localStorage |
| `useDraftStore`                 | entities | `entities/draft/draft.model.ts`                                     | —            |
| `useInboxStore`                 | entities | `entities/inbox/inbox.model.ts`                                     | —            |
| `useFeedStore`                  | entities | `entities/feed/feed.model.ts`                                       | —            |
| `useActivityStore`              | entities | `entities/activity/activity.model.ts`                               | —            |
| `useDownloadStore`              | entities | `entities/download/download.model.ts`                               | —            |
| `useLinkPreviewStore`           | entities | `entities/link-preview/link-preview.model.ts`                       | —            |
| `useUserGroupsStore`            | entities | `entities/user-group/user-group.model.ts`                           | —            |
| `useNotificationSettingsStore`  | entities | `entities/notification-settings/notification-settings.model.ts`     | localStorage |
| `useAiReplyStore`               | features | `features/ai-reply/ai-reply.model.ts`                               | —            |
| `useMuteStore`                  | features | `features/mute-chat/mute-chat.model.ts`                             | —            |
| `usePinStore`                   | features | `features/pin-chat/pin-chat.model.ts`                               | —            |
| `useCreateChatStore`            | features | `features/create-chat/create-chat.model.ts`                         | —            |
| `useChatInfoStore`              | features | `features/chat-info/chat-info.model.ts`                             | —            |
| `useManageFoldersStore`         | features | `features/manage-folders/manage-folders.model.ts`                   | —            |
| `useUserProfileStore`           | features | `features/user-profile/user-profile.model.ts`                       | —            |
| `useSettingsStore`              | features | `features/settings/settings.model.ts`                               | localStorage |
| `useMediaViewerStore`           | features | `features/media-viewer/media-viewer.model.ts`                       | —            |
| `useMentionSuggestStore`        | features | `features/mention-suggest/mention-suggest.model.ts`                 | —            |
| `useMessageReadersStore`        | features | `features/message-readers/message-readers.model.ts`                 | —            |
| `useTypingIndicatorStore`       | features | `features/typing-indicator/typing-indicator.model.ts`               | —            |
| `useFolderSyncStore`            | features | `features/folder-sync/folder-sync.model.ts`                         | localStorage |
| `useJitsiCallStore`             | features | `features/jitsi-call/jitsi-call.model.ts`                           | —            |
| `useAddStreamMembersStore`      | features | `features/add-stream-members/add-stream-members.model.ts`           | —            |
| `useRemoveStreamMembersStore`   | features | `features/remove-stream-members/remove-stream-members.model.ts`     | —            |
| `useChatDmCallBridgeStore`      | features | `features/chat-dm-call-bridge/chat-dm-call-bridge.model.ts`         | —            |
| `useSidebarConfigStore`         | widgets  | `widgets/sidebar/sidebar-config.model.ts`                           | localStorage |
| `useRightDrawerStore`           | widgets  | `widgets/right-panel/right-drawer.model.ts`                         | —            |
| `useSearchModalStore`           | widgets  | `widgets/search-modal/search-modal.model.ts`                        | —            |
| `useComposerSavedSnippetsStore` | widgets  | `widgets/message-composer/message-composer-saved-snippets.model.ts` | localStorage |

## Dependency Graph

```
useUsersStore  ◄──  useChatListStore      (via useUsersStore.getState().getAvatarMap())
               ◄──  widgets/sidebar       (via useUsersStore.getState() in DM entries)
               ◄──  useChatInfoStore      (member presence)
               ◄──  useMentionSuggestStore (user search)

useThemeStore  ◄──  theme-picker          (selectPalette/selectMode delegates to useThemeStore)

useAiReplyStore  ←  configurable provider (setAiReplyProvider)

useMuteStore   ◄──  useChatListStore      (mute state affects sidebar display)

usePinStore    ◄──  entities/folder       (folder-scoped pinning)

All other stores are independent.
```

Persistence: none of the stores use Zustand `persist` middleware. All persistence is manual `localStorage`.

---

## 1. useInstancesStore

**Path**: `entities/instance/instance.model.ts`
**Import**: `import { useInstancesStore } from '~/entities/instance/instance.model'`

Manages Zulip instances (servers). Persisted to `localStorage`.

### Interfaces

```typescript
interface ZulipInstance {
  id: string; // generated: `${Date.now()}-${random}`
  realm: string; // server base URL (e.g. "https://zulip.example.com")
  email: string; // email for auth
  apiKey: string; // API key
}

interface InstancesState {
  instances: ZulipInstance[];
  currentInstanceId: string | null;

  addInstance: (instance: Omit<ZulipInstance, "id">) => string; // returns generated id
  removeInstance: (id: string) => void;
  setCurrentInstanceId: (id: string | null) => void;
  getCurrentInstance: () => ZulipInstance | null;
}
```

### Behavior

| Action                 | Logic                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| `addInstance`          | Generates ID, adds to array, sets as current, persists                      |
| `removeInstance`       | Removes from array; if current was removed — switches to `instances[0]?.id` |
| `setCurrentInstanceId` | Validates that ID exists in instances, persists                             |
| `getCurrentInstance`   | Looks up by `currentInstanceId` in `instances`                              |

### localStorage Keys

- `"zulip-web-instances"` — JSON array of instances
- `"zulip-web-current-instance"` — ID of current instance

---

## 2. useChatListStore

**Path**: `entities/chat-list/chat-list.model.ts`
**Import**: `import { useChatListStore } from '~/entities/chat-list/chat-list.model'`

Main store for the sidebar: streams, DMs, topics, unread counts. Built from messages.

### Interfaces

```typescript
type MessageLocation =
  | { type: "stream"; stream_id: number; topic: string }
  | { type: "dm"; dmKey: string };

interface ChatListState {
  streamsMap: Map<number, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
  currentUserId: number | null;
  lastAppliedMessages: ZulipRawMessage[] | null;
  messageIdToLocation: Map<number, MessageLocation>;

  setFromMessages: (messages: ZulipRawMessage[], currentUserId: number | null) => void;
  addMessage: (message: ZulipRawMessage) => void;
  addMessages: (messages: ZulipRawMessage[]) => void;
  setCurrentUserId: (id: number | null) => void;
  clear: () => void;
  decrementUnreadForMessages: (messageIds: number[]) => void;
  incrementUnreadForMessages: (messageIds: number[]) => void;
  handleDeleteMessages: (messageIds: number[]) => void;

  streams: () => StreamWithLast[];
  dms: () => Extract<SidebarChat, { type: "dm" }>[];
  chatsSortedByLastMessage: () => SidebarChat[];
}
```

### Behavior

| Action                       | Logic                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `setFromMessages`            | Full rebuild from message array via `buildSidebarFromMessages()`. Builds both Maps + index `messageIdToLocation` |
| `addMessage`                 | Incremental add: merges into `streamsMap` or `dmsMap`. Accounts for unread delta                                 |
| `addMessages`                | Batch add: deduplicates by stream_id/dmKey, keeps latest by timestamp                                            |
| `setCurrentUserId`           | If changed from null → value and `lastAppliedMessages` exists → full rebuild                                     |
| `decrementUnreadForMessages` | For each messageId finds location → decrements unreadCount by 1                                                  |
| `incrementUnreadForMessages` | Inverse operation — increments unreadCount                                                                       |
| `handleDeleteMessages`       | Removes: if message was lastMessage in topic → removes topic (and stream if no topics remain)                    |
| `streams()`                  | Sorts streamsMap by ts desc, within each — topics by ts desc. Badge = sum of unreadCount                         |
| `dms()`                      | Sorts dmsMap by ts desc                                                                                          |
| `chatsSortedByLastMessage()` | Combines streams + DMs into one array, sorts by ts desc                                                          |

### Cross-store

Calls `useUsersStore.getState().getAvatarMap()` to obtain avatar URLs when building DM entries.

---

## 3. useCurrentChatMessagesStore

**Path**: `entities/message/message.model.ts`
**Import**: `import { useCurrentChatMessagesStore } from '~/entities/message/message.model'`

Messages for the currently open chat.

### Interfaces

```typescript
type CurrentChatContext =
  | { type: "stream"; streamId: number; streamName: string; topic: string }
  | { type: "dm"; dmKey: string };

interface CurrentChatMessagesState {
  context: CurrentChatContext | null;
  messages: MockMessage[];

  setContext: (context: CurrentChatContext | null) => void;
  setMessages: (messages: MockMessage[]) => void;
  appendMessage: (msg: MockMessage) => void;
  removeMessage: (messageId: number) => void;
  removeMessages: (messageIds: number[]) => void;
  updateMessageReaction: (messageId: number, reaction: Reaction, op: "add" | "remove") => void;
  updateMessageFlags: (messageIds: number[], flag: string, op: "add" | "remove") => void;
  updateMessageContent: (messageId: number, content: string) => void;
}
```

### Helper Functions (exported from entity index)

```typescript
function isMessageForContext(msg, context, currentUserId): boolean;
function contextFromMessage(msg, currentUserId): CurrentChatContext | null;
```

---

## 4. useUsersStore

**Path**: `entities/user/user.model.ts`
**Import**: `import { useUsersStore } from '~/entities/user/user.model'`

Users, avatars, presence.

### Interfaces

```typescript
type PresenceStatus = "active" | "idle";

interface UserPresence {
  status: PresenceStatus;
  timestamp: number;
}

interface UserRecord {
  user_id: number;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  presence?: UserPresence;
}

interface UsersState {
  users: Map<number, UserRecord>;
  emailToUserId: Map<string, number>;

  mergeUser: (payload: Partial<UserRecord> & { user_id: number }) => void;
  mergeUsers: (list: Array<Partial<UserRecord> & { user_id: number }>) => void;
  mergeFromMessage: (msg: ZulipRawMessage) => void;
  setPresenceByEmail: (email: string, presence: UserPresence) => void;
  setPresence: (userId: number, presence: UserPresence) => void;
  getUser: (userId: number) => UserRecord | undefined;
  getAvatarUrl: (userId: number) => string | undefined;
  getDisplayName: (userId: number) => string;
  getAvatarMap: () => Map<number, string>;
  clear: () => void;
}
```

---

## 5. useThemeStore

**Path**: `entities/theme/theme.model.ts`
**Import**: `import { useThemeStore } from '~/entities/theme/theme.model'`

Appearance theme — palette + mode (light/dark/system).

```typescript
interface ThemeState {
  paletteId: string; // "orange-warm" | "blue-cold" | custom
  mode: ThemeMode; // "light" | "dark" | "system"

  setPalette: (paletteId: string) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void; // dark ↔ light
}
```

localStorage keys: `workspace-palette`, `workspace-theme-mode`.
On change, calls `applyTheme()` — sets 42 CSS variables on `<html>`.

---

## 6. useCallParticipantsStore

**Path**: `entities/call/call.model.ts`
**Import**: `import { useCallParticipantsStore } from '~/entities/call/call.model'`

Jitsi call participants.

```typescript
interface CallParticipant {
  displayName: string;
}

interface CallParticipantsState {
  participantsByUrl: Record<string, CallParticipant[]>;
  setParticipants: (meetingUrl: string, participants: CallParticipant[]) => void;
  clearParticipants: (meetingUrl: string) => void;
  getParticipants: (meetingUrl: string) => CallParticipant[];
}
```

---

## 7. useStickerStore

**Path**: `entities/sticker/sticker.model.ts`
**Import**: `import { useStickerStore } from '~/entities/sticker/sticker.model'`

Sticker packs, recently used stickers, and favorites. Persists recent + favorites to `localStorage`.

### Interfaces

```typescript
interface StickerState {
  packs: StickerPack[];
  recent: RecentSticker[];
  favorites: string[];
  loading: boolean;

  setPacks: (packs: StickerPack[]) => void;
  addPack: (pack: StickerPack) => void;
  removePack: (packId: string) => void;
  addRecent: (stickerId: string, packId: string) => void;
  toggleFavorite: (stickerId: string) => void;
  isFavorite: (stickerId: string) => boolean;
  setLoading: (loading: boolean) => void;

  getSticker: (stickerId: string) => Sticker | undefined;
  getPack: (packId: string) => StickerPack | undefined;
  searchByEmoji: (emoji: string) => Sticker[];
  getRecentStickers: () => Sticker[];
  getFavoriteStickers: () => Sticker[];
}
```

### Behavior

| Action                | Logic                                                     |
| --------------------- | --------------------------------------------------------- |
| `setPacks`            | Replaces all packs                                        |
| `addPack`             | Appends pack (deduplicates by ID)                         |
| `removePack`          | Removes pack + its recent entries                         |
| `addRecent`           | Prepends to recent (max 30), persists to localStorage     |
| `toggleFavorite`      | Adds/removes sticker ID from favorites (max 50), persists |
| `getSticker`          | Searches all packs for sticker by ID                      |
| `searchByEmoji`       | Full-text search across emoji and alt fields              |
| `getRecentStickers`   | Maps recent IDs to full Sticker objects                   |
| `getFavoriteStickers` | Maps favorite IDs to full Sticker objects                 |

### localStorage Keys

- `"sticker_recent"` — JSON array of `RecentSticker`
- `"sticker_favorites"` — JSON array of sticker IDs

---

## 8. useDraftStore

**Path**: `entities/draft/draft.model.ts`
**Import**: `import { useDraftStore } from '~/entities/draft/draft.model'`

Draft messages synced with Zulip Drafts API.

### Interfaces

```typescript
type DraftType = "stream" | "private";

interface Draft {
  id: number | null;
  type: DraftType;
  to: number[];
  topic: string;
  content: string;
  timestamp: number;
}

interface DraftState {
  drafts: Draft[];
  loading: boolean;

  setDrafts: (drafts: Draft[]) => void;
  addDraft: (draft: Draft) => void;
  updateDraft: (id: number, patch: Partial<Pick<Draft, "content" | "topic" | "to">>) => void;
  removeDraft: (id: number) => void;
  getDraftForChat: (type: DraftType, to: number[], topic?: string) => Draft | undefined;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}
```

### Behavior

| Action            | Logic                                                         |
| ----------------- | ------------------------------------------------------------- |
| `getDraftForChat` | Matches by `type`, sorted `to` array, and `topic` for streams |
| `updateDraft`     | Refreshes `timestamp` on change                               |
| `clear`           | Resets `drafts` and `loading`                                 |

---

## 9. useInboxStore

**Path**: `entities/inbox/inbox.model.ts`
**Import**: `import { useInboxStore } from '~/entities/inbox/inbox.model'`

Inbox view — grouped unread conversations.

### Interfaces

```typescript
interface InboxEntry {
  key: string;
  streamId: number | null;
  streamName: string | null;
  topic: string | null;
  senderId: number | null;
  senderName: string | null;
  unreadCount: number;
  lastMessageTimestamp: number;
  messageIds: number[];
}

interface InboxState {
  entries: InboxEntry[];
  loading: boolean;
  error: string | null;

  setEntries: (entries: InboxEntry[]) => void;
  markAsRead: (messageIds: number[]) => void;
  clear: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;

  totalUnreadCount: () => number;
  sortedEntries: () => InboxEntry[];
}
```

### Behavior

| Action             | Logic                                                          |
| ------------------ | -------------------------------------------------------------- |
| `markAsRead`       | Removes message IDs from entries, drops entries with no unread |
| `totalUnreadCount` | Sums `unreadCount` across all entries                          |
| `sortedEntries`    | Returns entries sorted by `lastMessageTimestamp` descending    |

---

## 10. useFeedStore

**Path**: `entities/feed/feed.model.ts`
**Import**: `import { useFeedStore } from '~/entities/feed/feed.model'`

Combined message feed across all channels.

### Interfaces

```typescript
interface FeedState {
  messages: MockMessage[];
  isLoadingMore: boolean;
  isAllLoaded: boolean;
  lastMessageId: number | null;
  error: string | null;

  setMessages: (messages: MockMessage[]) => void;
  appendOlder: (messages: MockMessage[]) => void;
  clear: () => void;
  setLoadingMore: (loading: boolean) => void;
  setError: (error: string) => void;
}
```

### Behavior

| Action                       | Logic                                                               |
| ---------------------------- | ------------------------------------------------------------------- |
| `setMessages`                | Replaces messages, updates `lastMessageId` to oldest                |
| `appendOlder`                | Prepends older batches, deduplicates by ID, updates `lastMessageId` |
| `appendOlder([])`            | Sets `isAllLoaded: true`                                            |
| Messages stored newest-first |                                                                     |

---

## 11. useAiReplyStore

**Path**: `features/ai-reply/ai-reply.model.ts`
**Import**: `import { useAiReplyStore } from '~/features/ai-reply'`

AI-powered reply suggestions — manages generation lifecycle, streaming, and suggestions.

### Interfaces

```typescript
type AiReplyStatus = "idle" | "loading" | "streaming" | "done" | "error";

interface AiReplyState {
  status: AiReplyStatus;
  suggestions: AiSuggestion[];
  streamingText: string;
  error: string | null;
  lastAction: AiAction | null;

  generate: (params: {
    action: AiAction;
    messages: AiMessageContext[];
    draft?: string;
    tone?: AiTone;
    targetLanguage?: string;
    chatContext?: AiReplyRequest["chatContext"];
  }) => Promise<void>;
  abort: () => void;
  acceptSuggestion: (id: string) => string | null;
  dismiss: () => void;
  clear: () => void;
}
```

### Behavior

| Action             | Logic                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate`         | Calls configured AI provider (mock or HTTP). Supports streaming via `generateStream`. Status: `idle→loading→streaming→done` or `idle→loading→done` |
| `abort`            | Cancels in-flight generation, resets status to idle                                                                                                |
| `acceptSuggestion` | Returns suggestion text by ID, clears state                                                                                                        |
| `dismiss`          | Aborts and clears all state                                                                                                                        |
| `clear`            | Full reset including lastAction                                                                                                                    |

### Provider Configuration

```typescript
import { setAiReplyProvider, createMockProvider, createHttpProvider } from "~/features/ai-reply";

setAiReplyProvider(createMockProvider()); // development
setAiReplyProvider(createHttpProvider(apiUrl)); // production
```

---

## 12. useMuteStore

**Path**: `features/mute-chat/mute-chat.model.ts`
**Import**: `import { useMuteStore } from '~/features/mute-chat'`

Stream and topic muting with three-level resolution.

### Interfaces

```typescript
interface MuteStoreState {
  mutedStreamIds: Set<number>;
  mutedTopicKeys: Set<string>;
  unmutedTopicKeys: Set<string>;

  muteStream: (streamId: number) => void;
  unmuteStream: (streamId: number) => void;
  muteTopic: (streamId: number, topic: string) => void;
  unmuteTopic: (streamId: number, topic: string) => void;

  isStreamMuted: (streamId: number) => boolean;
  isTopicMuted: (streamId: number, topic: string) => boolean;
  isEffectivelyMuted: (streamId: number, topic: string) => boolean;

  setFromServer: (data: {
    mutedStreamIds: number[];
    mutedTopics: Array<{ streamId: number; topic: string }>;
    unmutedTopics: Array<{ streamId: number; topic: string }>;
  }) => void;
  clear: () => void;
}
```

### Behavior

| Action               | Logic                                                          |
| -------------------- | -------------------------------------------------------------- |
| `isEffectivelyMuted` | Stream muted → true; topic unmuted → false; topic muted → true |
| `setFromServer`      | Replaces entire state from subscription data + `user_topics`   |

Helper: `topicKey(streamId, topic)` → `"${streamId}:${topic}"`.

---

## 13. usePinStore

**Path**: `features/pin-chat/pin-chat.model.ts`
**Import**: `import { usePinStore } from '~/features/pin-chat'`

Folder-scoped chat pinning via Workspace API.

### Interfaces

```typescript
interface PinStoreState {
  pinnedKeys: Set<string>;
  folderPins: Map<string, Set<string>>;

  pinChat: (folderId: string, chatId: string) => void;
  unpinChat: (folderId: string, chatId: string) => void;
  isPinned: (folderId: string, chatId: string) => boolean;
  getPinnedChatIds: (folderId: string) => string[];

  setFromServer: (pins: Array<{ folderUuid: string; chatId: string }>) => void;
  clear: () => void;
}
```

### Behavior

| Action             | Logic                                          |
| ------------------ | ---------------------------------------------- |
| `folderPins`       | Stores `folderId → Set<chatId>`                |
| `getPinnedChatIds` | Returns `EMPTY_PINNED` when folder has no pins |
| `setFromServer`    | Rebuilds from server data                      |

---

## 14. useCreateChatStore

**Path**: `features/create-chat/create-chat.model.ts`
**Import**: `import { useCreateChatStore } from '~/features/create-chat'`

DM, group chat, and channel creation flow.

### Interfaces

```typescript
type CreateChatStatus = "idle" | "creating" | "success" | "error";
type NewChatType = "dm" | "group" | "channel";

interface CreateChatState {
  status: CreateChatStatus;
  chatType: NewChatType;
  selectedUserIds: number[];
  searchQuery: string;
  channelName: string;
  channelDescription: string;
  inviteOnly: boolean;
  error: string | null;

  setChatType: (type: NewChatType) => void;
  toggleUser: (userId: number) => void;
  clearSelection: () => void;
  setSearchQuery: (query: string) => void;
  setChannelName: (name: string) => void;
  setChannelDescription: (desc: string) => void;
  setInviteOnly: (inviteOnly: boolean) => void;
  setStatus: (status: CreateChatStatus) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}
```

---

## 15. useChatInfoStore

**Path**: `features/chat-info/chat-info.model.ts`
**Import**: `import { useChatInfoStore } from '~/features/chat-info'`

Channel/DM info panel — description, members, presence.

### Interfaces

```typescript
interface ChatInfoData {
  type: "dm" | "stream";
  name: string;
  memberCount: number;
  onlineCount: number;
  members: ChatInfoMember[];
  description: string | null;
  isMuted: boolean;
}

interface ChatInfoMember {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  isOnline: boolean;
}

interface ChatInfoState {
  data: ChatInfoData | null;
  loading: boolean;
  error: string | null;

  setData: (data: ChatInfoData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  clear: () => void;
}
```

---

## 16. useManageFoldersStore

**Path**: `features/manage-folders/manage-folders.model.ts`
**Import**: `import { useManageFoldersStore } from '~/features/manage-folders'`

Folder CRUD operations via Workspace API.

### Interfaces

```typescript
type ManageFolderStatus = "idle" | "saving" | "deleting" | "error";
type EditMode = "none" | "create" | "edit";

interface CreateFolderInput {
  title: string;
  backgroundColor?: number;
}
interface UpdateFolderInput {
  title?: string;
  backgroundColor?: number;
}
interface FolderItem {
  id: string;
  title: string;
  backgroundColor: number;
  createdAt: string;
  updatedAt: string;
}

interface ManageFoldersState {
  status: ManageFolderStatus;
  editMode: EditMode;
  selectedFolderId: string | null;
  error: string | null;

  setEditMode: (mode: EditMode) => void;
  selectFolder: (id: string | null) => void;
  create: (input: CreateFolderInput) => Promise<FolderItem | null>;
  update: (folderId: string, input: UpdateFolderInput) => Promise<FolderItem | null>;
  remove: (folderId: string) => Promise<boolean>;
  reset: () => void;
}
```

---

## 17. useUserProfileStore

**Path**: `features/user-profile/user-profile.model.ts`
**Import**: `import { useUserProfileStore } from '~/features/user-profile'`

Detailed user profile loading.

### Interfaces

```typescript
type UserProfileStatus = "idle" | "loading" | "done" | "error";

interface UserProfileData {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl: string;
  role: number;
  jobTitle?: string;
  manager?: string;
  birthday?: string;
  localTime?: string;
  phone?: string;
  timezone?: string;
}

interface UserProfileState {
  profile: UserProfileData | null;
  status: UserProfileStatus;
  error: string | null;

  loadProfile: (userId: number) => Promise<void>;
  clear: () => void;
}
```

---

## 18. useSettingsStore

**Path**: `features/settings/settings.model.ts`
**Import**: `import { useSettingsStore } from '~/features/settings'`

Application settings persisted to `localStorage`.

### Interfaces

```typescript
type ChatSorting = "recent" | "unread" | "alphabetical";
type NotificationSound = "default" | "subtle" | "none";
type AppLanguage = "en" | "ru";

interface AppSettings {
  chatSorting: ChatSorting;
  notificationSound: NotificationSound;
  language: AppLanguage;
}

interface SettingsState extends AppSettings {
  setChatSorting: (sorting: ChatSorting) => void;
  setNotificationSound: (sound: NotificationSound) => void;
  setLanguage: (language: AppLanguage) => void;
  resetToDefaults: () => void;
}
```

### localStorage Keys

- `"workspace-settings"` — JSON object of `AppSettings`

### Behavior

| Action                                                    | Logic                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `setChatSorting` / `setNotificationSound` / `setLanguage` | Updates field and persists to localStorage                                                       |
| `resetToDefaults`                                         | Resets to `{ chatSorting: "recent", notificationSound: "default", language: "en" }` and persists |
| Init                                                      | Loads from localStorage on creation; falls back to defaults on parse error                       |

---

## 19. useMediaViewerStore

**Path**: `features/media-viewer/media-viewer.model.ts`
**Import**: `import { useMediaViewerStore } from '~/features/media-viewer'`

Full-screen image/video lightbox.

### Interfaces

```typescript
type MediaType = "image" | "video";

interface MediaItem {
  url: string;
  type: MediaType;
  alt?: string;
  width?: number;
  height?: number;
}

interface MediaViewerState {
  isOpen: boolean;
  currentIndex: number;
  items: MediaItem[];

  open: (items: MediaItem[], startIndex?: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  currentItem: () => MediaItem | undefined;
}
```

### Behavior

| Action          | Logic                                                         |
| --------------- | ------------------------------------------------------------- |
| `open`          | Ignores empty items array; clamps `startIndex` to valid range |
| `next` / `prev` | Only move when not at boundaries                              |
| `goTo`          | Clamps index to valid range                                   |
| `currentItem`   | Returns `undefined` when closed or empty                      |

---

## 20. useMentionSuggestStore

**Path**: `features/mention-suggest/mention-suggest.model.ts`
**Import**: `import { useMentionSuggestStore } from '~/features/mention-suggest'`

@-mention autocomplete in message composer.

### Interfaces

```typescript
interface MentionSuggestion {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl?: string;
}

interface MentionSuggestState {
  query: string;
  results: MentionSuggestion[];
  visible: boolean;

  setQuery: (query: string) => void;
  setResults: (results: MentionSuggestion[]) => void;
  show: () => void;
  hide: () => void;
  clear: () => void;
}
```

### Behavior

- `hide` / `clear` both reset `query`, `results`, and set `visible: false`
- Uses `EMPTY_RESULTS` constant for empty fallback (avoids new array allocation)

---

## 21. useMessageReadersStore

**Path**: `features/message-readers/message-readers.model.ts`
**Import**: `import { useMessageReadersStore } from '~/features/message-readers'`

Read receipts for a specific message.

### Interfaces

```typescript
interface MessageReadersState {
  loading: boolean;
  userIds: number[];
  error: string | null;
  messageId: number | null;

  fetchReadReceipts: (messageId: number) => Promise<void>;
  clear: () => void;
}
```

### Behavior

| Action              | Logic                                                         |
| ------------------- | ------------------------------------------------------------- |
| `fetchReadReceipts` | Validates with `guard.messageId()`, calls API, sets `userIds` |
| `clear`             | Resets `loading`, `userIds`, `error`, `messageId`             |

---

## Usage Patterns in Components

### Subscribing to a Store (in components)

```tsx
// Minimal selector — subscribe to a single field
import { useStickerStore } from "~/entities/sticker";
const packs = useStickerStore((s) => s.packs);
const loading = useStickerStore((s) => s.loading);

// Calling a derived method
import { useChatListStore } from "~/entities/chat-list";
const streams = useChatListStore((s) => s.streams());

// Multiple fields — multiple selectors (for optimal re-renders)
const setFromMessages = useChatListStore((s) => s.setFromMessages);
const setCurrentUserId = useChatListStore((s) => s.setCurrentUserId);

// New stores follow the same pattern
import { useMuteStore } from "~/features/mute-chat";
const isMuted = useMuteStore((s) => s.isEffectivelyMuted(streamId, topic));

import { useSettingsStore } from "~/features/settings";
const chatSorting = useSettingsStore((s) => s.chatSorting);
```

---

## 22. useTypingIndicatorStore

**Path**: `features/typing-indicator/typing-indicator.model.ts`
**Import**: `import { useTypingIndicatorStore } from '~/features/typing-indicator'`

Tracks who is typing in which conversation. Entries auto-expire after 15 seconds unless refreshed.

### Interfaces

```typescript
interface TypingUser {
  userId: number;
  fullName: string;
}

interface TypingIndicatorState {
  typingMap: Map<string, TypingUser[]>;
  timers: Map<string, ReturnType<typeof setTimeout>>;

  setTyping: (chatKey: string, userId: number, isTyping: boolean) => void;
  getTypingUsers: (chatKey: string) => TypingUser[];
  clearAll: () => void;
}
```

### Behavior

| Action           | Logic                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| `setTyping`      | Adds/removes user from typing list for chat; starts expiry timer on add |
| `getTypingUsers` | Returns typing users for chat key; returns `EMPTY_USERS` when none      |
| `clearAll`       | Clears all typing state and timers                                      |

API: `sendTypingStart`, `sendTypingStop` from `typing-indicator.api.ts` — send typing events to Zulip server.

---

## 23. useSidebarConfigStore

**Path**: `widgets/sidebar/sidebar-config.model.ts`
**Import**: `import { useSidebarConfigStore } from '~/widgets/sidebar/sidebar-config.model'`

Sidebar UI preferences (e.g. activity panel open/closed). Persisted to `localStorage`.

### Interfaces

```typescript
interface SidebarConfigState {
  activityOpen: boolean;

  setActivityOpen: (open: boolean) => void;
  setConfig: (patch: Partial<SidebarConfig>) => void;
}
```

### localStorage Key

- `"zulip-web-sidebar-config"` — JSON object with `activityOpen` and extensible fields

### Accessing a Store Outside React (in actions, effects, callbacks)

```tsx
import { useUsersStore } from "~/entities/user";
import { useChatListStore } from "~/entities/chat-list";
import { useCurrentChatMessagesStore } from "~/entities/message";
import { useMuteStore } from "~/features/mute-chat";
import { useDraftStore } from "~/entities/draft";

useUsersStore.getState().mergeUser(user);
useChatListStore.getState().clear();
useCurrentChatMessagesStore.getState().setContext(null);
useMuteStore.getState().setFromServer(muteData);
useDraftStore.getState().setDrafts(drafts);
```
