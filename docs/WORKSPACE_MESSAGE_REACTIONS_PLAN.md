# Workspace Message Reactions Plan

Дата среза: 2026-07-03.

Документ фиксирует план нативного подключения реакций в Workspace messenger.
Это не реализация, а рабочий план для проверки и последующего разбиения на
саб-агентов.

Главное решение: реакции подключаются через Workspace API и Workspace cache.
Старый Zulip API, Zulip event loop, Zulip-shaped reaction store и
Zulip-shaped reaction adapter не используются как запасной путь. Если старый
`MessageList` мешает показать агрегированные Workspace-реакции без искажения
модели, его view model расширяется под нативные Workspace reaction chips.
Фальшивые `Reaction[]`, фальшивые пользователи и numeric Zulip identifiers для
Workspace-реакций запрещены.

## Правила текущей реализации

- Главный агент выступает только оркестратором и не пишет продуктовый код.
- Код пишут только саб-агенты с явно выделенными зонами ответственности.
- После основной реализации отдельный агент делает review.
- После review отдельный агент получает найденные проблемы, оценивает их,
  составляет план исправления и реализует исправления.
- В продуктовой модели, API-контрактах, store и cache не должно появиться
  временных заглушек, fallback-ов или Zulip-хвостов.
- Неподдержанные Workspace-возможности закрываются только на UI-уровне
  явной заглушкой.
- Для этой итерации действует исключение из общего правила проекта:
  новый измененный продуктовый код должен содержать подробные русские
  поясняющие комментарии для интерфейсов, констант, функций и сложных
  решений. Комментарии должны объяснять, зачем решение нужно и почему выбран
  именно такой вариант.
- Комментарии в тестах можно делать минимальными, если тест читается сам.

## Цель

Подключить реакции так, чтобы Workspace chat route умел:

- быстро показывать счетчики реакций из message response;
- понимать, какие реакции поставил текущий пользователь;
- добавлять реакцию через `POST /message_reactions/`;
- удалять свою реакцию через `DELETE /message_reactions/{reaction_uuid}`;
- переживать reload без потери знания о своих reaction uuid;
- обновляться от `message.updated`;
- не тянуть в новую модель Zulip `reaction_type`, `emoji_code`,
  numeric `user_id` и старые reaction handlers.

## Backend contract

Локальный backend source of truth:

- `../workspace_backend/docs/workspace_api.md`;
- `../workspace_backend/docs/workspace_ui_realtime_integration.md`;
- `../workspace_backend/workspace/messenger_api/api/routes.py`;
- `../workspace_backend/workspace/tests/integration/test_messenger_api.py`.

Текущий контракт:

- `GET /v1/messages/` и `GET /v1/messages/{message_uuid}` возвращают
  `reactions` как aggregate map:

```json
{
  "thumbs_up": 2,
  "eyes": 1
}
```

- `POST /v1/message_reactions/` принимает:

```json
{
  "message_uuid": "message-uuid",
  "emoji_name": "thumbs_up"
}
```

- create response возвращает reaction row:

```json
{
  "uuid": "reaction-uuid",
  "project_id": "project-uuid",
  "message_uuid": "message-uuid",
  "user_uuid": "user-uuid",
  "emoji_name": "thumbs_up",
  "created_at": "2026-07-03T10:00:00Z",
  "updated_at": "2026-07-03T10:00:00Z"
}
```

- `GET /v1/message_reactions/?message_uuid=...` возвращает reaction rows для
  видимого сообщения.
- `GET /v1/message_reactions/?message_uuid=...&user_uuid=...` можно
  использовать для загрузки только реакций текущего пользователя.
- `DELETE /v1/message_reactions/{reaction_uuid}` удаляет только реакцию
  текущего пользователя.
- duplicate create для той же пары `message_uuid + user_uuid + emoji_name`
  возвращает conflict.
- create/update/delete reaction отправляет `message.updated` с новым
  `reactions` aggregate.

## Что сейчас есть во frontend

Текущие пробелы:

- `WorkspaceMessengerMessageDto` не содержит `reactions`.
- `MessengerMessage` не содержит `reactions`.
- `adaptMessengerMessage(...)` отбрасывает `reactions`.
- `message.updated` уже доходит до Workspace realtime applier, но после adapter
  теряет reaction aggregate.
- Workspace chat page сейчас подставляет `reactionsUnsupported`.
- `messenger-messages.api.ts` все еще содержит `addReactionUnsupported` и
  `removeReactionUnsupported`.
- Старый `useChatPageReaction` ходит в Zulip API по numeric `messageId`; его
  нельзя переиспользовать для Workspace.
- Старый `MessageList` умеет отображать chips и быстрые реакции, но ожидает
  Zulip-shaped `Reaction[]`.

## Базовые решения

- `message.reactions` в Workspace domain - это backend aggregate, а не список
  реакторов.
- Отдельный Zustand store для реакций не заводим на первом этапе.
- `useWorkspaceMessageStore` остается единственным runtime store для видимых
  сообщений.
- Для UI в message store нужно хранить не только aggregate, но и локальную
  проекцию "мои реакции":

```ts
interface MessengerMessage {
  reactions: Record<string, number>;
  ownReactionUuidsByEmojiName: Record<string, MessengerUuid>;
}
```

- IndexedDB получает отдельную таблицу только для реакций текущего
  пользователя.
- IndexedDB cache не является источником UI напрямую: после чтения из cache
  данные применяются в `useWorkspaceMessageStore`.
- Финальная правда по счетчикам - `message.reactions` из backend response или
  `message.updated`.
- Финальная правда по `reaction_uuid` текущего пользователя - reaction rows из
  `POST /message_reactions/` или `GET /message_reactions/?message_uuid=...`.
- Optimistic update разрешен только как временная UI-проекция; после
  `message.updated` счетчик должен совпасть с backend.
- Custom emoji пока остаются controlled unsupported, потому что Workspace
  reaction contract сейчас не возвращает каталог, image url, `reaction_type` или
  `emoji_code`.

## Не цель

- Не подключаем старый Zulip reaction API.
- Не переносим `Reaction[]` как доменную модель Workspace.
- Не добавляем отдельный долгоживущий reaction store без UI-потребности.
- Не делаем frontend-only fake source of truth.
- Не меняем backend contract в рамках frontend-итерации.
- Не строим полноценный список всех реакторов в первом проходе, кроме
  технической загрузки своих reaction rows.
- Не подключаем custom emoji до появления Workspace contract.

## Целевая модель данных

### API DTO

```ts
export type WorkspaceMessengerReactionAggregate = Record<string, number>;

export interface WorkspaceMessengerMessageReactionDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  message_uuid: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  emoji_name: string;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerMessageDto {
  // existing fields...
  reactions: WorkspaceMessengerReactionAggregate;
}
```

Guard rules:

- `reactions` must be a plain object;
- keys are non-empty strings;
- values are finite non-negative integers;
- invalid core message rows should fail strict parsing rather than silently
  disappearing.

### Domain model

```ts
export type MessengerReactionCountsByName = Record<string, number>;
export type MessengerOwnReactionUuidsByName = Record<string, MessengerUuid>;

export interface MessengerMessage {
  // existing fields...
  reactions: MessengerReactionCountsByName;
  ownReactionUuidsByEmojiName: MessengerOwnReactionUuidsByName;
}
```

Rules:

- `reactions` is server aggregate.
- `ownReactionUuidsByEmojiName` is user-scoped local projection.
- Adapter initializes `ownReactionUuidsByEmojiName` as empty.
- Cache/SWR/action layer enriches it later.
- Store merge must preserve known own reaction uuids when a fresh message body
  arrives with only aggregate reactions.

### IndexedDB table

New store in `workspace-messenger-cache-v1`, next schema version:

```ts
ownMessageReactions;
id; // ownerKey:messageUuid:emojiName
ownerKey;
messageUuid;
userUuid;
reactionUuid;
emojiName;
createdAt;
updatedAt;
cacheUpdatedAt;
```

Indexes:

- `byOwner`;
- `byOwnerMessage` on `[ownerKey, messageUuid]`;
- `byOwnerReactionUuid` on `[ownerKey, reactionUuid]`.

Why only own reactions:

- UI only needs "did I react" and "which reaction uuid should I delete".
- Full reactor lists can be loaded later for popovers.
- Stale rows are easier to reconcile because every row belongs to current user.
- Cache size stays small.

## Runtime flow

### Open conversation

1. Route resolves `runtimeContext` and `conversationId`.
2. Message window cache hydrates messages into `useWorkspaceMessageStore`.
3. Message rows contain `reactions` aggregate if cached.
4. In parallel, read `ownMessageReactions` for visible message UUIDs.
5. Apply `ownReactionUuidsByEmojiName` into `useWorkspaceMessageStore`.
6. Network `GET /messages/` refreshes message bodies and aggregate counters.
7. For messages with non-empty `reactions`, start background own-reactions SWR.
8. SWR writes fresh own reaction rows to IndexedDB.
9. SWR applies fresh `ownReactionUuidsByEmojiName` to message store.

### Add reaction

Input:

- `messageUuid`;
- `emojiName`;
- current `runtimeContext`;
- current `userUuid`.

Steps:

1. Resolve owner key from runtime context.
2. Call `POST /message_reactions/`.
3. Store returned reaction row in `ownMessageReactions`.
4. Apply returned reaction uuid to `message.ownReactionUuidsByEmojiName`.
5. Optionally apply optimistic counter increment if current aggregate does not
   already include own reaction.
6. Wait for `message.updated` to settle final aggregate.
7. If backend returns duplicate conflict, revalidate own reactions for that
   message, then treat existing row as current state.

### Remove reaction

Input:

- `messageUuid`;
- `emojiName`;
- current `runtimeContext`;
- current `userUuid`.

Steps:

1. Try `message.ownReactionUuidsByEmojiName[emojiName]`.
2. If missing, try `ownMessageReactions` cache by `messageUuid + emojiName`.
3. If still missing, call
   `GET /message_reactions/?message_uuid=...&user_uuid=currentUserUuid`.
4. Find row with matching `emoji_name`.
5. If no row exists, treat click as add reaction.
6. If row exists, call `DELETE /message_reactions/{reactionUuid}`.
7. Delete row from `ownMessageReactions`.
8. Remove `emojiName` from `message.ownReactionUuidsByEmojiName`.
9. Optionally apply optimistic counter decrement, not below zero.
10. Wait for `message.updated` to settle final aggregate.

### Toggle reaction chip

1. If store says current user owns this `emojiName`, remove.
2. If store does not know, resolve own reaction rows before deciding.
3. If own row exists after resolve, remove.
4. If own row does not exist, add.

This avoids deleting without `reaction_uuid` and avoids duplicate `POST` when
cache was cold after reload.

### Realtime

On `message.updated`:

1. Adapt message and preserve/apply `reactions` aggregate.
2. Upsert message in `useWorkspaceMessageStore`.
3. Patch message cache.
4. If aggregate changed for a visible message, enqueue own-reactions revalidate.

Important: `message.updated` does not contain `reaction_uuid`, so it cannot
directly update the own-reaction cache. It only tells the client that the
aggregate changed and that own rows may need refresh.

### Delete and cleanup

- `message.deleted`: remove message from message store, message cache, buckets
  and own reactions cache for that `messageUuid`.
- `topic.deleted`: remove topic messages and own reactions for removed message
  UUIDs known locally.
- `stream.deleted`: remove stream messages and own reactions for removed
  message UUIDs known locally.
- logout / owner cleanup: delete `ownMessageReactions` rows for owner together
  with other Workspace messenger cache rows.

## API layer changes

Target file area:

- `packages/web/src/shared/api/messenger.types.ts`;
- `packages/web/src/shared/api/messenger-messages.api.ts`;
- `packages/web/src/shared/api/messenger-client.ts`;
- related tests.

Add:

- `WorkspaceMessengerMessageReactionDto`;
- `isWorkspaceMessengerMessageReactionDto`;
- `WorkspaceMessengerReactionAggregate`;
- aggregate guard for message DTO;
- `getMessageReactions(options, query)`;
- `createMessageReaction(options, body)`;
- `deleteMessageReaction(options, reactionUuid)`;
- optional `updateMessageReaction(...)` only if UI needs replace/edit, otherwise
  keep API wrapper but do not wire UI.

Remove from unsupported list:

- `add_reaction`;
- `remove_reaction`.

Keep unsupported:

- custom emoji loading;
- activity reactions page if it still depends on Zulip activity narrows;
- full reactor popover if product does not need it yet.

## Entity/action layer changes

Target file area:

- `packages/web/src/entities/messenger/`;
- `packages/web/src/entities/message/`;
- `packages/web/src/shared/lib/workspace-messenger-cache-db.ts`.

Add a small action module, for example:

- `entities/messenger/messenger-message-reactions-actions.lib.ts`;
- or `entities/message/message-reactions-actions.lib.ts` if ownership is kept
  closer to message store.

Responsibilities:

- build request options from runtime context;
- resolve owner key;
- prevent stale owner writes;
- call shared API;
- write/read own reaction cache;
- enrich message store;
- report typed result to page/UI.

Do not put HTTP calls in page components.

Store changes:

- add `applyOwnMessageReactions(messageUuid, rows)`;
- add `setOwnMessageReaction(messageUuid, emojiName, reactionUuid)`;
- add `removeOwnMessageReaction(messageUuid, emojiName)`;
- add optional `applyMessageReactionAggregate(messageUuid, aggregate)` only if
  useful for realtime/cache patches.

Merge rule:

- when `upsertMessage` receives a new message snapshot, preserve existing
  `ownReactionUuidsByEmojiName` unless incoming message explicitly carries a
  newer own projection. For now incoming backend message does not carry it.

## Cache changes

Target file area:

- `packages/web/src/shared/lib/workspace-messenger-cache-db-upgrade.lib.ts`;
- `packages/web/src/shared/lib/workspace-messenger-cache-db.ts`;
- `packages/web/src/entities/messenger/messenger-cache.lib.ts`;
- tests.

Add store:

- `ownMessageReactions`.

Add operations:

- `readOwnMessageReactions(ownerKey, messageUuids)`;
- `readOwnMessageReaction(ownerKey, messageUuid, emojiName)`;
- `replaceOwnMessageReactionsForMessage(ownerKey, messageUuid, rows)`;
- `upsertOwnMessageReaction(ownerKey, row)`;
- `deleteOwnMessageReaction(ownerKey, messageUuid, emojiName)`;
- `deleteOwnMessageReactionsForMessage(ownerKey, messageUuid)`;
- `deleteOwnMessageReactionsForMessages(ownerKey, messageUuids)`;
- include store in owner cache deletion.

Reconcile rules:

- SWR response for one message is authoritative for current user's rows on that
  message.
- If response is empty, delete all cached own reactions for that message.
- Do not reconcile all owner rows from a partial visible-window request.
- Do not delete own reaction rows for messages that were not part of the
  current fetch.

## UI integration

Target file area:

- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`;
- `packages/web/src/pages/chat/chat-page-workspace-message.adapter.ts` только
  для удаления или сужения старого моста, без добавления reaction-логики;
- `packages/web/src/widgets/message-list/` там, где нужен нативный grouped
  Workspace reaction view model.

Page responsibilities:

- pass real Workspace reaction callbacks;
- keep unsupported only for custom emoji and still-missing actions;
- keep page thin: no raw HTTP and no IDB calls in page.

Native UI responsibilities:

- pass Workspace `reactions` aggregate and `ownReactionUuidsByEmojiName`
  without converting them to old `Reaction[]`;
- render grouped reaction chips from `{ emojiName, count, reactedByMe }`;
- keep highlighting tied to `ownReactionUuidsByEmojiName`, not to numeric
  Zulip user ids;
- do not represent unknown peer reactors in first iteration.

Important native UI constraint:

- Old `MessageList` computes count from `Reaction[]`. Workspace aggregate may
  contain count without user ids. If the old widget cannot represent aggregate
  counts faithfully, add a narrow UI prop/model for grouped Workspace reactions.
  Do not invent fake peer users and do not write fake reaction users into any
  store.

Preferred UI direction:

- Extend message-list view model to accept already grouped reaction chips.
- Keep any old compatibility bridge shrinking, not growing.
- Do not write fake reaction users into user store.

## Custom emoji path

Current Workspace reaction contract has only `emoji_name`.

For now:

- quick reactions send known names like `thumbs_up`, `heart`, `joy`;
- display helper resolves known shortcodes to Unicode glyphs;
- unknown names render as `:emoji_name:` or plain fallback;
- custom emoji picker/loading stays unsupported in Workspace capabilities.

Future backend-friendly shape:

```ts
interface WorkspaceEmojiCatalogItem {
  name: string;
  imageUrl?: string;
  aliases?: string[];
}
```

If backend later adds a catalog, reaction rows do not need a breaking change:
`emoji_name` remains the stable key.

## Subagent orchestration

Do not implement this as one monolithic pass. Split after this plan is
approved.

### Agent A: API contract and DTOs

Scope:

- `shared/api/messenger.types.ts`;
- `shared/api/messenger-messages.api.ts`;
- `shared/api/messenger-client.ts`;
- API tests.

Deliverables:

- reaction DTO and guards;
- message DTO includes aggregate reactions;
- reaction API wrappers;
- unsupported list updated;
- strict parsing tests.

Must not touch:

- page UI;
- IndexedDB schema;
- message-list rendering.

### Agent B: IndexedDB own-reactions cache

Scope:

- `workspace-messenger-cache-db-upgrade.lib.ts`;
- `workspace-messenger-cache-db.ts`;
- `messenger-cache.lib.ts`;
- cache tests.

Deliverables:

- new `ownMessageReactions` store and indexes;
- owner cleanup includes new store;
- read/write/delete helpers;
- reconcile helper for one message;
- deletion helpers for message/topic/stream cleanup.

Must not touch:

- React components;
- shared API transport.

### Agent C: Message domain and realtime

Scope:

- `entities/messenger/messenger.types.ts`;
- `entities/messenger/messenger-adapters.lib.ts`;
- `entities/message/message.model.ts`;
- `entities/messenger/messenger-realtime-applier.lib.ts`;
- message/realtime tests.

Deliverables:

- domain message carries `reactions` aggregate;
- domain message carries own reaction uuid projection;
- upsert preserves own projection;
- realtime `message.updated` patches aggregate and schedules/marks revalidate
  hook point;
- cache patch keeps reactions.

Must not touch:

- page UI callbacks;
- IDB schema except through interfaces from Agent B.

### Agent D: Reaction actions and SWR

Scope:

- new entity/process-level reaction action module;
- conversation message loader integration;
- runtime owner/stale-request guards;
- tests.

Deliverables:

- hydrate own reactions from IDB for visible messages;
- background revalidate own reactions from API;
- add/remove/toggle action;
- duplicate conflict recovery;
- no stale owner writes.

Must not touch:

- low-level API DTO definitions except through Agent A output;
- raw IndexedDB internals except through Agent B helpers.

### Agent E: UI wiring and native message-list rendering

Scope:

- `chat-page-workspace.ui.tsx`;
- `chat-page-workspace-message.adapter.ts` only if old bridge must be narrowed;
- `widgets/message-list` native grouped reaction chip support.

Deliverables:

- remove `reactionsUnsupported` from Workspace reaction callbacks;
- connect add/remove/toggle actions;
- render aggregate counters;
- highlight own reactions;
- keep custom emoji unsupported;
- no Zulip reaction API calls.
- no conversion of Workspace aggregate into fake old `Reaction[]`.

Must not touch:

- shared API transport;
- IndexedDB schema.

### Agent F: Review and quality gate

Scope:

- final diff after A-E.

Checklist:

- no new Zulip API dependency in Workspace reaction path;
- no fake local source of truth for final counts;
- no direct IDB access from UI;
- owner/runtime stale guards exist;
- message.updated updates visible counters;
- reload hydrates own reactions from cache;
- delete resolves `reaction_uuid` before calling DELETE;
- tests cover add, remove, reload, stale owner, realtime update.

## Suggested execution order

1. Agent A and Agent B can run in parallel after plan approval.
2. Agent C starts after Agent A DTO shape is known.
3. Agent D starts after Agent A and B are merged locally.
4. Agent E starts after Agent C and D expose stable action/store interfaces.
5. Agent F reviews the integrated result.

## Tests

Minimum test set:

- DTO guard accepts `reactions: { thumbs_up: 2 }`.
- DTO guard rejects invalid aggregate values.
- `getMessageReactions` sends `message_uuid` and `user_uuid` filters.
- `createMessageReaction` parses reaction row.
- `deleteMessageReaction` accepts empty/204 response.
- IDB stores own reaction rows by owner/message/emoji.
- IDB replacing own rows for one message deletes stale rows only for that
  message.
- owner cleanup deletes own reaction rows.
- domain adapter preserves backend aggregate in native `MessengerMessage`.
- store preserves own reaction projection across message snapshot upsert.
- add action caches returned reaction uuid.
- remove action resolves reaction uuid from store, then cache, then API.
- `message.updated` updates aggregate counters.
- Workspace page no longer shows `reactionsUnsupported` for add/remove.

Suggested commands for the final integrated pass:

```bash
npm run typecheck
npm run test -- --run
```

If full test run is too expensive during intermediate agent work, each agent
should run focused Vitest files for its scope and leave exact commands in its
handoff.

## Open questions before implementation

1. Which minimal `message-list` view model change gives native grouped
   Workspace reaction chips without extending the old `Reaction[]` bridge?
2. Should add/remove use optimistic count changes, or should we only update own
   highlight and wait for `message.updated` for counters?
3. Should own-reaction SWR run for every visible message with non-empty
   aggregate, or only lazily on first interaction plus on `message.updated`?
4. Should duplicate conflict on add be silent recovery or visible warning?
5. Should unknown `emoji_name` render as `:name:` or raw `name`?

Recommended defaults:

- extend grouped reaction rendering and avoid fake peer users;
- update own highlight optimistically, but let backend own final count;
- revalidate visible messages with non-empty aggregate after first render, then
  revalidate touched messages on interaction/realtime;
- recover duplicate conflict silently by reloading own rows;
- render unknown emoji as `:name:`.

## Done criteria

Feature is complete when:

- Workspace messages show backend reaction counters;
- current user's own reactions are highlighted after reload;
- add reaction uses Workspace API;
- remove reaction resolves and uses `reaction_uuid`;
- reaction state updates from `message.updated`;
- IDB keeps only current user's own reaction rows;
- owner cleanup removes reaction cache;
- custom emoji remains explicit unsupported until Workspace contract exists;
- no Workspace reaction path calls Zulip API.
