# API Client Reference

Complete documentation for all API functions in the FSD architecture.

---

## Architecture

```
shared/api/client.ts              Low-level Workspace fetch helpers + middleware pipeline
shared/api/workspace-client.ts    Workspace API request helper
entities/<name>/<name>.api.ts      Entity-level API functions (user, folder, sticker, draft, inbox, feed)
features/<name>/<name>.api.ts      Feature-level API functions (ai-reply, mute-chat, pin-chat, create-chat,
                                   manage-folders, user-profile, message-readers)
```

### Authentication

All Workspace API calls use the Exordos Core IAM access token:
`Authorization: Bearer <access token>`. Interactive authorization requests
`openid email profile project:default`, the same scope and token used by the
messenger domain.

Two approaches:

1. **Middleware client** (`shared/api/client.ts`) — messenger helpers with the
   shared IAM, logging, and retry middleware pipeline.
2. **Generated Workspace client** (`@workspace/api`) — common, mail, calendar,
   and messenger resource operations from the checked-in OpenAPI contract.

The UI never calls `/api/workspace-service/v1`. That is a trusted
provider-daemon contract with a different security boundary. Provider discovery
for account setup uses the IAM-authenticated `GET /api/workspace/v1/providers/`
catalog.

New code should use the functions from `shared/api/` directly, or entity-level API functions from `entities/*/`.

---

## shared/api/client.ts — Messenger API Helpers

**Import**: `import { messengerFetch, messengerPost, messengerPatch, messengerDelete } from '~/shared/api/client'`

These low-level helpers construct URLs under
`/api/workspace/v1/messenger`, attach the IAM bearer token, and handle request
encoding.

| Function                            | Purpose                                                 |
| ----------------------------------- | ------------------------------------------------------- |
| `messengerFetch(endpoint, params?)` | GET request to `/api/workspace/v1/messenger/{endpoint}` |
| `messengerPost(endpoint, data?)`    | POST with `application/x-www-form-urlencoded`           |
| `messengerPatch(endpoint, data?)`   | PATCH with `application/x-www-form-urlencoded`          |
| `messengerDelete(endpoint, data?)`  | DELETE with optional body                               |

Also includes middleware pipeline: `messengerApi.get/post/patch/delete` with auth, logging, and retry middleware.

---

## shared/api/workspace-client.ts — Workspace API

**Import**: `import { request, getFolders } from '~/shared/api'`

**Public base URL**: `/api/workspace/v1`. `VITE_WORKSPACE_API_ORIGIN` may
select another origin, but the path layout is fixed.

**Auth**: Exordos Core IAM bearer token with `project:default` scope.

| Function                     | Purpose                               |
| ---------------------------- | ------------------------------------- |
| `request<T>(path, options?)` | Generic JSON request to Workspace API |

---

## Entity API Functions

### entities/user/api/

**Import**: `import { reportPresence } from '~/entities/user/api/user.api'`

| Function                               | Endpoint                  | Params                                       | Returns |
| -------------------------------------- | ------------------------- | -------------------------------------------- | ------- |
| `reportPresence(status, newUserInput)` | `POST /users/me/presence` | `status` ("active"/"idle"), `new_user_input` | `void`  |

> Core Workspace HTTP helpers live in `packages/web/src/shared/api/messenger-*.ts` and are consumed by entity/feature APIs.

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

## Workspace domain API modules

Messenger REST calls are split across `shared/api/messenger-*.ts`. Mail and
Calendar use entity-level APIs backed by the generated `@workspace/api` client.

| Module                                                | Examples                                   |
| ----------------------------------------------------- | ------------------------------------------ |
| `messenger-messages.ts`                               | fetch/send/update/delete messages, flags   |
| `messenger-streams.ts`                                | streams, topics, subscriptions             |
| `messenger-client.internal.ts`                        | shared fetch helpers used by modules above |
| `entities/mail/mail.api.ts`                           | folders, messages, attachments, actions    |
| `entities/calendar/calendar.api.ts`                   | calendars, events, move action             |
| `features/external-accounts/external-accounts.api.ts` | provider catalog and External Accounts     |

Import the specific module you need, or use entity/feature `*.api.ts` wrappers.

---

## Event Loop (`shared/lib/event-loop.ts`)

### Configuration

```typescript
const restCatchUp = "/api/workspace/v1/events/?epoch_version%3E=<last>&page_limit=500";
const websocket = "/api/workspace/v1/events/ws?last_epoch_version=<last>";
const websocketProtocols = ["workspace.events.v1", `bearer.${accessToken}`];
```

### Interface

```typescript
interface StartMessengerEventLoopOptions {
  enabled?: boolean;
  onEvent: (event: WorkspaceEvent) => void;
  onBadQueue?: () => void;
  onQueueReady?: () => void;
  onTabStaleResume?: (hiddenDurationMs: number) => void;
  instanceId?: string;
  signal?: AbortSignal;
  eventTypes?: string[];
}

function startMessengerEventLoop(options: StartMessengerEventLoopOptions): void;
```

### Algorithm

1. Load the latest persisted `epoch_version` for the organization.
2. Fetch REST events strictly newer than the cursor until catch-up is empty.
3. Apply each flat `schema_version: 1` event idempotently and persist its epoch.
4. Connect to the common websocket with `last_epoch_version` and IAM token
   subprotocols.
5. Dispatch Messenger, Mail, and Calendar events through the same callback.
6. Deduplicate REST catch-up, websocket catch-up, and live delivery by epoch.
7. On close or visibility resume, run REST catch-up again and reconnect with
   backoff.

The server sends protocol-level WebSocket ping frames. It does not send JSON
`hello`/`ping` messages and the client does not send JSON `pong` or `ack`.

### Event Handling

Events are dispatched in `widgets/layout/layout-messenger-event-dispatch*.lib.ts`
and `layout-messenger-event-dispatch-groupware.lib.ts`, not inline in the event
loop module.

```
onEvent(event)
  ├── messenger object types → message, chat-list, folder, and user stores
  ├── mail_folder / mail_message → Mail reducers and stores
  ├── calendar / calendar_event → Calendar reducers and stores
  └── unknown schema/object/action/kind → log and skip safely
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
