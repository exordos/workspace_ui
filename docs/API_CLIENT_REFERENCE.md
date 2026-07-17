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
`openid email profile project:fe02e55d-4548-4b3e-a175-fcae928f41b2`. Refresh
requests repeat the explicit project scope so an older saved refresh token is
re-scoped before the replacement access token is used. The canonical project
UUID is defined once in `shared/config/workspace-project.ts`. Native WebView
hosts that inject an access token must obtain it with the same project scope.

Persisted IAM sessions carry a versioned project-scope marker. At startup the
application blocks API, cache bootstrap, and realtime initialization until
every older marked or unmarked session has been refreshed with the current
explicit scope. Access-only sessions that cannot be safely re-scoped are
removed and require a new login. A transient refresh failure leaves the session
unmarked and presents a retry state instead of using the old access token.

Two approaches:

1. **Middleware client** (`shared/api/client.ts`) — messenger helpers with the
   shared IAM, logging, and retry middleware pipeline.
2. **Generated Workspace client** (`@workspace/api`) — common and messenger
   resource operations from the checked-in OpenAPI contract.

The current backend contract intentionally does not expose Mail, Calendar, or
provider-service endpoints. Message provenance fields such as `provider_uuid`
remain in the Messenger model so future protocol-based integrations can identify
their source without changing the message schema.

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

### shared/api/messenger-upload.ts — File uploads

**Import**: `import { uploadFile } from '~/shared/api/messenger-upload'`

`uploadFile(file, options)` uploads bytes through
`POST /api/workspace/v1/messenger/files/` and returns the canonical
`urn:file`, `urn:image`, or `urn:video` value with filename, content type, and
size metadata.

Use `{ streamUuid }` for a normal chat attachment. To create a file available
to any authenticated Workspace bearer token without stream membership, use the
existing public ACL object:

```typescript
const urn = await uploadFile(file, {
  acl: { mode: "public" },
});
```

Public uploads omit `stream_uuid`; combining `acl.mode=public` with a stream
UUID is rejected. This is authenticated Workspace-wide access, not anonymous
access. The backend continues to persist one binary object plus its JSON
sidecar, while clients persist only the returned URN.

### shared/api/messenger-messages.ts — Sending messages

**Import**: `import { sendMessage } from '~/shared/api/messenger-messages'`

`sendMessage(params)` posts a native markdown message to
`POST /api/workspace/v1/messenger/messages/` and returns the created message
mapped to the UI `MockMessage` model.

| Parameter          | Required | Purpose                                                                          |
| ------------------ | -------- | -------------------------------------------------------------------------------- |
| `messageUuid`      | no       | Client-generated message UUID. The helper generates one when omitted.            |
| `streamUuid`       | yes      | Workspace stream UUID.                                                           |
| `topicUuid`        | no       | Workspace topic UUID. When omitted, the backend uses the stream's default topic. |
| `content`          | yes      | Non-empty markdown source.                                                       |
| `stream`           | no       | Display-only stream name for the returned local message.                         |
| `subject`          | no       | Display-only subject for the returned local message.                             |
| `author_id`        | no       | Author identity used to construct the returned local message.                    |
| `sender_id`        | no       | Numeric sender fallback used to construct the returned local message.            |
| `sender_full_name` | no       | Sender display name used to construct the returned local message.                |

The wire request contains only the canonical message fields:

```json
{
  "uuid": "a93dca35-3061-4748-bda4-7f6f8c660ea5",
  "stream_uuid": "75309057-419c-4b12-a7c1-3932429ec4a6",
  "topic_uuid": "4ec0b996-b778-45f8-8ef4-ef863be0c047",
  "payload": {
    "kind": "markdown",
    "content": "Hello, workspace"
  }
}
```

The UUID is the message idempotency key. Automatic transport retries within one
`sendMessage` call reuse the same request body and UUID. If application code
retries after the promise rejects, it must pass the original `messageUuid`;
calling `sendMessage` again without it generates a new message UUID. Reusing a
UUID with the same canonical message is idempotent, while reusing it for
different message content or routing is rejected by the backend.

---

## shared/api/workspace-client.ts — Workspace API

**Import**: `import { request, getFolders } from '~/shared/api'`

**Public base URL**: `/api/workspace/v1`. `VITE_WORKSPACE_API_ORIGIN` may
select another origin, but the path layout is fixed.

**Auth**: Exordos Core IAM bearer token with
`project:fe02e55d-4548-4b3e-a175-fcae928f41b2` scope.

| Function                     | Purpose                               |
| ---------------------------- | ------------------------------------- |
| `request<T>(path, options?)` | Generic JSON request to Workspace API |

---

## Entity API Functions

### entities/user/api/

**Import**: `import { reportPresence } from '~/entities/user/api/user.api'`

| Function                 | Endpoint                                                  | Params                                        | Returns |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------- | ------- |
| `reportPresence(status)` | `POST /users/{current_user_uuid}/actions/presence/invoke` | `status` (`active`, `idle`, `do_not_disturb`) | `void`  |

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

**Import**: `import { fetchDraftsPage, createDraft, updateDraftOnServer, deleteDraftOnServer } from '~/entities/draft/draft.api'`

| Function                                 | Endpoint                | Method | Returns                      |
| ---------------------------------------- | ----------------------- | ------ | ---------------------------- |
| `fetchDraftsPage(filters?, signal?)`     | `GET /drafts/`          | GET    | `{ drafts, nextPageMarker }` |
| `createDraft(input)`                     | `POST /drafts/`         | POST   | `Draft`                      |
| `updateDraftOnServer(uuid, input, etag)` | `PUT /drafts/{uuid}`    | PUT    | updated `Draft`              |
| `deleteDraftOnServer(uuid, etag)`        | `DELETE /drafts/{uuid}` | DELETE | `void`                       |

Draft UUIDs are generated by the client. `topic_uuid` is mandatory and payloads use
`{ kind: "markdown", content }`. List pagination is ordered by `updated_at desc` and reads the
continuation cursor from `X-Pagination-Marker`. PUT and DELETE require `If-Match`; a 412 response
is exposed as `DraftPreconditionError` with the current server snapshot and response ETag.

This API intentionally uses the raw `messengerApi` response wrapper instead of generated Orval
functions because the Draft contract requires response headers (`ETag` and
`X-Pagination-Marker`) that the generated client does not currently expose.

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

Messenger REST calls are split across `shared/api/messenger-*.ts`. The current
generated `@workspace/api` contract contains only common and Messenger
operations. Mail and Calendar source slices are dormant in Messenger-only builds
and must not be treated as supported backend APIs.

| Module                         | Examples                                   |
| ------------------------------ | ------------------------------------------ |
| `messenger-messages.ts`        | fetch/send/update/delete messages, flags   |
| `messenger-streams.ts`         | streams, topics, subscriptions             |
| `messenger-client.internal.ts` | shared fetch helpers used by modules above |

Import the specific Messenger module you need, or use entity/feature `*.api.ts`
wrappers.

---

## Event Loop (`shared/lib/event-loop.ts`)

### Configuration

```typescript
const restCatchUp =
  "/api/workspace/v1/events/?epoch_generation=<generation>" +
  "&epoch_version%3E=<last>&page_limit=500";
const websocket =
  "/api/workspace/v1/events/ws?epoch_generation=<generation>" + "&last_epoch_version=<last>";
const websocketProtocols = ["workspace.events.v1", `bearer.${accessToken}`];
```

### Interface

```typescript
interface StartMessengerEventLoopOptions {
  enabled?: boolean;
  onEvent: (event: WorkspaceEvent, delivery: MessengerEventDeliveryContext) => void;
  onBadQueue?: () => void;
  onCursorExpired?: () => void | Promise<void>;
  onQueueReady?: () => void;
  onTabStaleResume?: (hiddenDurationMs: number) => void;
  instanceId?: string;
  signal?: AbortSignal;
  eventTypes?: string[];
}

interface MessengerEventDeliveryContext {
  source: "catchup" | "realtime";
  notificationsAllowed: boolean;
}

function startMessengerEventLoop(options: StartMessengerEventLoopOptions): void;
```

### Algorithm

1. Load the persisted `(epoch_generation, epoch_version)` cursor for the
   IAM origin, project, and user account.
2. Fetch REST events strictly newer than the cursor until catch-up is empty.
3. Apply each flat `schema_version: 1` event idempotently and persist its epoch.
   Events outside the canonical project are not delivered to UI consumers, but
   their epoch is still advanced defensively.
4. Connect to the common websocket with `last_epoch_version` and IAM token
   subprotocols.
5. Keep notifications disabled during initial REST/WebSocket catch-up. Enable
   them only after the first websocket `ready` frame.
6. Dispatch Messenger events through the same callback. Messenger-only builds
   ignore dormant Mail and Calendar reducers.
7. Deduplicate REST catch-up, websocket catch-up, and live delivery by epoch.
8. On close, transport error, network recovery, or visibility resume, run REST
   catch-up again and reconnect with backoff.
9. Treat HTTP `410` and WebSocket close `4410` as the only full-cache
   invalidation signals: clear the current account cache and resynchronize from
   the server's current generation.
10. Probe `/epoch/` every 30 seconds with a background-tab-resilient watchdog.
    If the server cursor advances while the websocket remains silent, reconnect
    and recover the missing events through REST catch-up without clearing
    entity caches.

The server sends protocol-level WebSocket ping frames and the browser replies
with protocol-level pong frames automatically. The browser WebSocket API does
not expose those control frames to application code. The protocol therefore has
no JSON `hello`/`ping`/`pong`/`ack` messages; liveness beyond the transport
heartbeat is verified by the epoch cursor watchdog.

### Event Handling

Events are dispatched in `widgets/layout/layout-messenger-event-dispatch*.lib.ts`
and `layout-messenger-event-dispatch-groupware.lib.ts`, not inline in the event
loop module.

```
onEvent(event)
  ├── messenger object types → message, chat-list, folder, and user stores
  ├── file events → protected-file metadata/blob cache invalidation
  ├── mail/calendar object types → ignored in Messenger-only builds
  └── unknown schema/object/action/kind → log and skip safely
```

## Cache-first Messenger state

The current account cache is stored in IndexedDB and partitioned by IAM origin,
the canonical Workspace project UUID, and user. Realtime cursor persistence
uses the same origin/project/user identity. These client-side scopes do not
depend on optional project claims in the access token. The cache is rebuildable
client state, never the authoritative data source.

- Bootstrap reads cached users, streams, topics, and bindings before issuing
  network requests. A single-flight guard prevents duplicate bootstrap fetches.
- Messages, chat/folder/mute/user snapshots, entity snapshots, protected file
  metadata, binary blobs, and avatar pointers share the versioned
  `message-cache` database.
- Realtime events update or invalidate only affected cached records.
- Protected file entries are keyed by server metadata hash. `401`, `403`, and
  `404` responses evict inaccessible data immediately.
- The cache is fully cleared only when the server explicitly reports an expired
  event generation/cursor (`410` or `4410`). Ordinary reconnects keep cached
  data and continue incrementally.

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
