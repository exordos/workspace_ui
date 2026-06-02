# API Client Reference

Complete documentation for all API functions in the FSD architecture.

---

## Architecture

```
shared/api/client.ts              Low-level Zulip fetch helpers + middleware pipeline
shared/api/workspace-client.ts    Workspace API request helper
entities/<name>/<name>.api.ts      Entity-level API functions (user, folder, sticker, draft, inbox, feed)
features/<name>/<name>.api.ts      Feature-level API functions (ai-reply, mute-chat, pin-chat, create-chat,
                                   manage-folders, user-profile, message-readers)
```

### Authentication

All Zulip API calls use **HTTP Basic Auth**: `Authorization: Basic base64(email:apiKey)`.
Credentials are taken from `useInstancesStore.getState().getCurrentInstance()`.

Two approaches:

1. **Middleware client** (`shared/api/client.ts`) — `zulipFetch/zulipPost/zulipPatch/zulipDelete` with middleware pipeline (auth, logging, retry)
2. **Workspace API** (`shared/api/workspace-client.ts`) — `request()` for Workspace backend

New code should use the functions from `shared/api/` directly, or entity-level API functions from `entities/*/`.

---

## shared/api/client.ts — Zulip API Helpers

**Import**: `import { zulipFetch, zulipPost, zulipPatch, zulipDelete } from '~/shared/api'`

These low-level helpers construct the full URL, attach Basic Auth headers, and handle form encoding for POST/PATCH/DELETE.

| Function                        | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `zulipFetch(endpoint, params?)` | GET request to `/api/v1/{endpoint}`            |
| `zulipPost(endpoint, data?)`    | POST with `application/x-www-form-urlencoded`  |
| `zulipPatch(endpoint, data?)`   | PATCH with `application/x-www-form-urlencoded` |
| `zulipDelete(endpoint, data?)`  | DELETE with optional body                      |

Also includes middleware pipeline: `zulipApi.get/post/patch/delete` with auth, logging, and retry middleware.

---

## shared/api/workspace-client.ts — Workspace API

**Import**: `import { request, getFolders } from '~/shared/api'`

**Base URL**: `VITE_WORKSPACE_API_BASE_URL` or `/workspace-api/api/v1` (dev proxy) / `{VITE_WORKSPACE_API_ORIGIN}/api/v1` (prod)

**Auth**: Basic (same as Zulip — email:apiKey from instancesStore)

| Function                     | Purpose                               |
| ---------------------------- | ------------------------------------- |
| `request<T>(path, options?)` | Generic JSON request to Workspace API |

---

## Entity API Functions

### entities/user/user.api.ts

**Import**: `import { reportPresence } from '~/entities/user'`

| Function                               | Endpoint                  | Params                                       | Returns |
| -------------------------------------- | ------------------------- | -------------------------------------------- | ------- |
| `reportPresence(status, newUserInput)` | `POST /users/me/presence` | `status` ("active"/"idle"), `new_user_input` | `void`  |

> Core user API functions live in `packages/web/src/shared/api/zulip-*.ts` modules and are consumed by entity APIs.

### entities/folder/folder.api.ts

**Import**: `import { getFolders, mapWorkspaceFoldersToRail } from '~/entities/folder'`

| Function                             | Endpoint                        | Returns                    |
| ------------------------------------ | ------------------------------- | -------------------------- |
| `getFolders()`                       | `GET /folders/` (Workspace API) | `WorkspaceFolder[]`        |
| `mapWorkspaceFoldersToRail(folders)` | — (pure mapping)                | `WorkspaceFolderForRail[]` |

#### Types

```typescript
interface WorkspaceFolder {
  uuid: string;
  created_at: string;
  updated_at: string;
  title: string;
  background_color_value: number;
  unread_messages: unknown[];
  system_type: "created" | "all";
}

interface WorkspaceFolderForRail {
  id: string;
  label: string;
  badge?: number;
}
```

### entities/sticker/sticker.api.ts

**Import**: `import { fetchStickerPacks, fetchStickerPack, searchStickers, installStickerPack, uninstallStickerPack, buildStickerMarkdown, parseStickerFromContent, isStickerMessage } from '~/entities/sticker'`

| Function                        | Purpose                                        | Returns                 |
| ------------------------------- | ---------------------------------------------- | ----------------------- |
| `fetchStickerPacks()`           | Load all available sticker packs               | `StickerPack[]`         |
| `fetchStickerPack(packId)`      | Load a single pack by ID                       | `StickerPack`           |
| `installStickerPack(packId)`    | Mark pack as installed                         | `void`                  |
| `uninstallStickerPack(packId)`  | Remove installed pack                          | `void`                  |
| `searchStickers(query)`         | Search stickers by text                        | `StickerSearchResult[]` |
| `buildStickerMarkdown(sticker)` | Builds markdown for sending sticker as message | `string`                |
| `parseStickerFromContent(html)` | Extracts sticker data from message HTML        | `Sticker \| null`       |
| `isStickerMessage(content)`     | Checks if a message is a sticker               | `boolean`               |

#### Types

```typescript
type StickerFormat = "png" | "webp" | "lottie" | "gif";

interface Sticker {
  id: string;
  emoji: string;
  alt?: string;
  url: string;
  format: StickerFormat;
  width?: number;
  height?: number;
}

interface StickerPack {
  id: string;
  title: string;
  author?: string;
  thumbnail?: string;
  stickers: Sticker[];
  installed?: boolean;
}
```

### entities/draft/draft.api.ts

**Import**: `import { fetchDrafts, createDraft, updateDraftOnServer, deleteDraftOnServer } from '~/entities/draft'`

| Function                         | Endpoint                   | Method | Returns                     |
| -------------------------------- | -------------------------- | ------ | --------------------------- |
| `fetchDrafts()`                  | `GET /drafts`              | GET    | `Draft[]`                   |
| `createDraft(input)`             | `POST /drafts`             | POST   | `number \| null` (draft ID) |
| `updateDraftOnServer(id, input)` | `PATCH /drafts/{id}`       | PATCH  | `boolean`                   |
| `deleteDraftOnServer(id)`        | `POST /drafts/{id}/delete` | POST   | `boolean`                   |

### entities/inbox/inbox.api.ts

**Import**: `import { fetchInboxEntries } from '~/entities/inbox'`

| Function              | Endpoint                              | Method | Returns        |
| --------------------- | ------------------------------------- | ------ | -------------- |
| `fetchInboxEntries()` | `GET /messages` (narrow: `is:unread`) | GET    | `InboxEntry[]` |

### entities/feed/feed.api.ts

**Import**: `import { fetchFeedMessages } from '~/entities/feed'`

| Function                                 | Endpoint                    | Method | Returns         |
| ---------------------------------------- | --------------------------- | ------ | --------------- |
| `fetchFeedMessages(anchor?, numBefore?)` | `GET /messages` (no narrow) | GET    | `MockMessage[]` |

---

## Feature API Functions

### features/ai-reply/ai-reply.api.ts

**Import**: `import { createMockProvider, createHttpProvider } from '~/features/ai-reply'`

| Function                     | Purpose                                    | Returns           |
| ---------------------------- | ------------------------------------------ | ----------------- |
| `createMockProvider()`       | Creates a mock AI provider for development | `AiReplyProvider` |
| `createHttpProvider(apiUrl)` | Creates an HTTP-backed AI provider         | `AiReplyProvider` |

#### Provider Interface

```typescript
interface AiReplyProvider {
  name: string;
  isAvailable: () => boolean;
  generate: (request: AiReplyRequest) => Promise<AiReplyResponse>;
  generateStream?: (request: AiReplyRequest, onChunk: AiStreamCallback) => Promise<() => void>;
}

interface AiReplyRequest {
  action: AiAction; // "smart-reply" | "rewrite" | "translate" | "summarize" | "expand" | "fix-grammar"
  messages: AiMessageContext[];
  draft?: string;
  tone?: AiTone; // "formal" | "casual" | "friendly" | "professional"
  targetLanguage?: string;
  chatContext?: { streamName?: string; topic?: string };
}

interface AiReplyResponse {
  suggestions: AiSuggestion[];
  model?: string;
  durationMs?: number;
}

interface AiSuggestion {
  id: string;
  text: string;
  action: AiAction;
  confidence?: number;
}
```

### features/mute-chat/mute-chat.api.ts

**Import**: `import { muteStream, unmuteStream, muteTopic, unmuteTopic } from '~/features/mute-chat'`

| Function                                      | Endpoint                                  | Method | Returns   |
| --------------------------------------------- | ----------------------------------------- | ------ | --------- |
| `setStreamMuted(streamId, muted)`             | `POST /users/me/subscriptions/properties` | POST   | `boolean` |
| `setTopicVisibility(streamId, topic, policy)` | `POST /user_topics`                       | POST   | `boolean` |
| `muteStream(streamId)`                        | `POST /users/me/subscriptions/properties` | POST   | `boolean` |
| `unmuteStream(streamId)`                      | `POST /users/me/subscriptions/properties` | POST   | `boolean` |
| `muteTopic(streamId, topic)`                  | `POST /user_topics`                       | POST   | `boolean` |
| `unmuteTopic(streamId, topic)`                | `POST /user_topics`                       | POST   | `boolean` |

### features/pin-chat/pin-chat.api.ts

**Import**: `import { pinChatInFolder, unpinChatInFolder } from '~/features/pin-chat'`

| Function                                        | Endpoint                                                                 | Method | Returns   |
| ----------------------------------------------- | ------------------------------------------------------------------------ | ------ | --------- |
| `pinChatInFolder(folderUuid, folderItemUuid)`   | `POST /folders/{folderUuid}/items/{folderItemUuid}/actions/pin/invoke`   | POST   | `boolean` |
| `unpinChatInFolder(folderUuid, folderItemUuid)` | `POST /folders/{folderUuid}/items/{folderItemUuid}/actions/unpin/invoke` | POST   | `boolean` |

### features/create-chat/create-chat.api.ts

**Import**: `import { createChannel, fetchSubscribedChannels, unsubscribeChannel } from '~/features/create-chat'`

| Function                         | Endpoint                         | Method | Returns                        |
| -------------------------------- | -------------------------------- | ------ | ------------------------------ |
| `createChannel(params)`          | `POST /users/me/subscriptions`   | POST   | `{ streamId: number } \| null` |
| `fetchSubscribedChannels()`      | `GET /users/me/subscriptions`    | GET    | `SubscribedChannel[]`          |
| `unsubscribeChannel(streamName)` | `DELETE /users/me/subscriptions` | DELETE | `boolean`                      |

### features/manage-folders/manage-folders.api.ts

**Import**: `import { createFolder, updateFolder, deleteFolder } from '~/features/manage-folders'`

| Function                        | Endpoint                                      | Method | Returns              |
| ------------------------------- | --------------------------------------------- | ------ | -------------------- |
| `createFolder(input)`           | `POST /folders/` (Workspace API)              | POST   | `FolderItem \| null` |
| `updateFolder(folderId, input)` | `POST /folders/{folderId}/` (Workspace API)   | POST   | `FolderItem \| null` |
| `deleteFolder(folderId)`        | `DELETE /folders/{folderId}/` (Workspace API) | DELETE | `boolean`            |

### features/user-profile/user-profile.api.ts

**Import**: `import { fetchUserProfile } from '~/features/user-profile'`

| Function                   | Endpoint              | Method | Returns                   |
| -------------------------- | --------------------- | ------ | ------------------------- |
| `fetchUserProfile(userId)` | `GET /users/{userId}` | GET    | `UserProfileData \| null` |

### features/message-readers/message-readers.api.ts

**Import**: `import { fetchReadReceipts } from '~/features/message-readers'`

| Function                       | Endpoint                                  | Method | Returns                |
| ------------------------------ | ----------------------------------------- | ------ | ---------------------- |
| `fetchReadReceipts(messageId)` | `GET /messages/{messageId}/read_receipts` | GET    | `ReadReceiptsResponse` |

### features/mention-suggest/mention-suggest.lib.ts

**Import**: `import { filterUsers } from '~/features/mention-suggest'`

| Function                                 | Purpose                                          | Returns               |
| ---------------------------------------- | ------------------------------------------------ | --------------------- |
| `filterUsers(query, users, maxResults?)` | Filter users by query for @-mention autocomplete | `MentionSuggestion[]` |

---

## Legacy API (lib/zulipClient.ts)

These functions are still in `lib/zulipClient.ts` and will be migrated to entity API files in a future pass.

### Auth

| Function                                 | Endpoint                            | Returns                       |
| ---------------------------------------- | ----------------------------------- | ----------------------------- |
| `fetchApiKey(realm, username, password)` | `POST {realm}/api/v1/fetch_api_key` | `{ api_key, email, user_id }` |

### Event Queue

| Function                                    | Endpoint         | Returns                       |
| ------------------------------------------- | ---------------- | ----------------------------- |
| `registerQueue(eventTypes)`                 | `POST /register` | `{ queue_id, last_event_id }` |
| `getEvents(queueId, lastEventId, options?)` | `GET /events`    | `{ events }`                  |

### Messages

| Function                                        | Endpoint                | Returns             |
| ----------------------------------------------- | ----------------------- | ------------------- |
| `fetchRecentMessages()`                         | `GET /messages`         | `ZulipRawMessage[]` |
| `fetchMessages(stream?, topic?, q?)`            | `GET /messages`         | `MockMessage[]`     |
| `fetchDmMessages(userIds)`                      | `GET /messages`         | `MockMessage[]`     |
| `fetchActivityMessages(filter, currentUserId?)` | `GET /messages`         | `ZulipRawMessage[]` |
| `sendMessage(params)`                           | `POST /messages`        | `MockMessage`       |
| `updateMessage(messageId, { content })`         | `PATCH /messages/{id}`  | `void`              |
| `deleteMessage(messageId)`                      | `DELETE /messages/{id}` | `void`              |

### Reactions

| Function                                           | Endpoint                          | Returns |
| -------------------------------------------------- | --------------------------------- | ------- |
| `addReaction(messageId, emojiName, reactionType?)` | `POST /messages/{id}/reactions`   | `void`  |
| `removeReaction(messageId, emojiName, options?)`   | `DELETE /messages/{id}/reactions` | `void`  |

### Message Flags

| Function                                   | Endpoint                                    | Returns |
| ------------------------------------------ | ------------------------------------------- | ------- |
| `updateMessageFlags(messageIds, op, flag)` | `POST /messages/flags`                      | `void`  |
| `addMessageFlag(messageIds, flag)`         | → `updateMessageFlags(..., "add", flag)`    |         |
| `removeMessageFlag(messageIds, flag)`      | → `updateMessageFlags(..., "remove", flag)` |         |
| `markMessagesAsRead(messageIds)`           | `POST /messages/flags`                      | `void`  |

### Users

| Function                | Endpoint              | Returns                           |
| ----------------------- | --------------------- | --------------------------------- |
| `getCurrentUser()`      | `GET /users/me`       | `{ user_id, full_name, email }`   |
| `fetchUsers()`          | `GET /users`          | `ZulipUserMember[]`               |
| `fetchUser(userId)`     | `GET /users/{userId}` | `ZulipUserMember`                 |
| `fetchRealmPresence()`  | `GET /realm/presence` | `{ presences, server_timestamp }` |
| `fetchUsersAvatarMap()` | → `fetchUsers()`      | `Map<number, string>`             |

### Streams

| Function              | Endpoint                           | Returns        |
| --------------------- | ---------------------------------- | -------------- |
| `fetchStreams()`      | `GET /streams`                     | `MockStream[]` |
| `fetchTopics(stream)` | `GET /users/me/{stream_id}/topics` | `string[]`     |

### Utilities

| Function                     | Description                        |
| ---------------------------- | ---------------------------------- |
| `rawMessageToMockMessage(m)` | Maps ZulipRawMessage → MockMessage |
| `getRealmBaseUrl()`          | Base URL of the current realm      |

---

## Event Loop (app/app.event-loop.ts)

### Configuration

```typescript
const DEFAULT_EVENT_TYPES = ["message", "update_message_flags", "reaction", "delete_message"];
const RETRY_PAUSE_MS = 2000;
const DEFAULT_LONGPOLL_TIMEOUT_SEC = 90;
```

### Interface

```typescript
interface StartZulipEventLoopOptions {
  onEvent: (event: ZulipEvent) => void;
  onBadQueue?: () => void;
  signal?: AbortSignal;
  eventTypes?: string[];
}

function startZulipEventLoop(options: StartZulipEventLoopOptions): void;
```

### Algorithm

1. `registerQueue(eventTypes)` → `queue_id`, `last_event_id`
2. `while(true)`:
   - Check `signal.aborted` → exit
   - `getEvents(queueId, lastEventId, { timeoutSec, signal })` — blocking long-poll
   - If `BAD_EVENT_QUEUE_ID` → re-register queue
   - For each event: `lastEventId = max(lastEventId, event.id)`, skip `heartbeat`, call `onEvent(event)`
3. On fetch error: `queueId = null`, sleep 2s, retry

### Event Handling

```
onEvent(event):
  ├── type="message"         → chatList.addMessage + currentChat.appendMessage
  ├── type="update_message_flags"
  │   ├── flag="read", op="add"    → chatList.decrementUnread + currentChat.updateMessageFlags
  │   └── flag="read", op="remove" → chatList.incrementUnread + currentChat.updateMessageFlags
  ├── type="reaction"        → currentChat.updateMessageReaction
  └── type="delete_message"  → chatList.handleDeleteMessages + currentChat.removeMessages
```

---

## Helper Modules (shared/lib/)

### shared/config/constants.ts

| Constant              | Value                                | Usage                    |
| --------------------- | ------------------------------------ | ------------------------ |
| `SCROLL_AREA_CLASS`   | Tailwind scrollbar classes           | Custom scrollbar styling |
| `JITSI_MEET_DOMAIN`   | from env `VITE_JITSI_MEET_DOMAIN`    | Jitsi integration        |
| `JITSI_MEET_BASE_URL` | `https://{JITSI_MEET_DOMAIN}`        | Building meeting URLs    |
| `WORKSPACE_ORIGIN`    | from env `VITE_WORKSPACE_API_ORIGIN` | Workspace API base       |

### shared/lib/format.ts

| Function                               | Signature                                | Returns                         |
| -------------------------------------- | ---------------------------------------- | ------------------------------- |
| `formatMessageTime(timestamp)`         | `(number) => string`                     | `"HH:MM"` (ru-RU)               |
| `formatLastSeen(timestamp, status?)`   | `(number, "active"\|"idle"?) => string`  | `"online"`, `"N min ago"`, etc. |
| `isPresenceOnline(timestamp, status?)` | `(number, "active"\|"idle"?) => boolean` | true if active and < 120s       |
| `getPresenceState(timestamp, status?)` | → `"active" \| "idle" \| null`           |                                 |
| `sidebarRowClass(isActive)`            | `(boolean) => string`                    | Tailwind class                  |

### shared/lib/html.ts

| Function                       | Signature                     | Returns                      |
| ------------------------------ | ----------------------------- | ---------------------------- |
| `stripHtml(html)`              | `(string) => string`          | Text without HTML tags       |
| `sanitizeHtml(html, baseUrl?)` | `(string, string?) => string` | Sanitized HTML via DOMPurify |

### shared/lib/jitsi.ts

| Function                         | Signature                                  | Returns                      |
| -------------------------------- | ------------------------------------------ | ---------------------------- |
| `getJitsiMeetingUrl(content)`    | `(string) => string \| null`               | Extracts Jitsi URL from text |
| `parseJitsiUrl(url)`             | `(string) => { domain, roomName } \| null` | Parses Jitsi URL             |
| `buildJitsiMeetingUrl(roomName)` | `(string) => string`                       | Builds full Jitsi URL        |

### Contexts (app/contexts/)

| Context              | Type                                            | Used In                                             |
| -------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `OpenSearchContext`  | `(() => void) \| null`                          | Layout → provides; ChatPage/ActivityPage → consumes |
| `RightDrawerContext` | `{ open: boolean; setOpen: (boolean) => void }` | Layout → provides; ChatPage → consumes              |
