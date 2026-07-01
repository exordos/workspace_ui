# Workspace Messenger Cache Plan

Дата среза: 2026-07-01.

Документ фиксирует план нового IndexedDB-кэша для Workspace messenger. Это
следующая задача после `docs/WORKSPACE_MESSAGE_STORE_CUTOVER_PLAN.md`: message
store уже должен быть Workspace-native, а кэш добавляется как отдельный слой
быстрого старта, догрузки истории и устойчивости к перезагрузке.

Главное решение: старый Zulip-shaped IndexedDB не мигрируем и не читаем.
Пользователь после обновления начнет с пустым Workspace cache, а новый кэш
соберется по мере работы приложения. Это сознательный жесткий разрез:
совместимость со старым `instanceId/chatKey/messageId` не нужна.

## Базовые решения

- Создаем новую базу, например `workspace-messenger-cache-v1`.
- Старую базу `workspace-message-cache-v1` не расширяем и не используем для
  Workspace path.
- Данные кэша всегда привязаны к runtime owner: account, organization, project,
  user.
- Ключ чата в текущем домене - это frontend conversation id:
  - `stream:<streamUuid>`;
  - `topic:<streamUuid>:<topicUuid>`.
- Не добавляем запасное поле под будущий `chatUuid`. Если backend позже введет
  отдельную chat-сущность, это будет отдельная миграция схемы.
- Сообщение хранится один раз по `messageUuid`, а в чаты попадает через buckets.
- Порядок сообщений внутри чата: `createdAt`, затем `uuid`.
- `page_marker` хранится отдельно от порядка. Это серверный указатель следующей
  страницы, а не локальная ось сортировки.
- Старые Zulip-типы не попадают в новый кэш: `MockMessage`, numeric
  `message.id`, `stream_id`, `subject`, `narrow`, `dmKey`.
- UI не пишет в IndexedDB напрямую. Все чтение и запись идут через
  entity/process-level слой.

## Цель

Новый кэш должен закрыть те же механические задачи, которые раньше закрывал
старый IndexedDB:

- быстрый старт sidebar после перезагрузки;
- быстрый старт открытого окна сообщений;
- хранение границ загруженного окна;
- догрузку старых страниц через `page_marker`;
- точечные патчи после send, edit, delete, read и realtime;
- дедупликацию сообщений по `messageUuid`;
- хранение папок, folder items, streams, topics, users и last-message pointers;
- отдельное хранение результатов поиска;
- безопасный сброс данных при смене owner/runtime.

## Не цель

- Миграция старого кэша пользователя.
- Поддержка старого Zulip cache format в новом Workspace path.
- Offline-first режим как первая итерация.
- Локальная имитация backend-действий, которых нет в Workspace API.
- Новый backend contract для отдельной `chat` сущности.

## Целевая схема IndexedDB

Минимальная схема:

```ts
ownerMeta
  ownerKey
  schemaVersion
  lastHydratedAt
  lastCompactedAt

streams
  id                  // ownerKey:streamUuid
  ownerKey
  streamUuid
  stream
  updatedAt

topics
  id                  // ownerKey:topicUuid
  ownerKey
  topicUuid
  streamUuid
  topic
  updatedAt

conversations
  id                  // ownerKey:conversationId
  ownerKey
  conversationId      // stream:<streamUuid> | topic:<streamUuid>:<topicUuid>
  kind                // stream | topic
  streamUuid
  topicUuid?
  title
  unreadCount
  lastMessageUuid
  updatedAt

folders
  id                  // ownerKey:folderUuid
  ownerKey
  folderUuid
  folder
  updatedAt

folderItems
  id                  // ownerKey:folderItemUuid
  ownerKey
  folderItemUuid
  folderUuid
  conversationId
  streamUuid
  chatType
  orderIndex
  pinnedAt
  updatedAt

users
  id                  // ownerKey:userUuid
  ownerKey
  userUuid
  user
  updatedAt

messages
  id                  // ownerKey:messageUuid
  ownerKey
  messageUuid
  message
  createdAt
  updatedAt
  version

messageBuckets
  id                  // ownerKey:conversationId:messageUuid
  ownerKey
  conversationId
  messageUuid
  createdAt
  orderKey            // createdAt + uuid

messageWindows
  id                  // ownerKey:conversationId
  ownerKey
  conversationId
  oldestMessageUuid
  newestMessageUuid
  nextPageMarker
  hasMore
  reachedOldest
  reachedNewest
  hasGaps
  windowSize
  lastSyncedAt

realtimeCursor
  ownerKey
  epochVersion
  updatedAt

searchResults
  id                  // ownerKey:queryHash
  ownerKey
  queryHash
  query
  filters
  resultMessageUuids
  createdAt
  expiresAt
```

Индексы:

- `streams.byOwnerUpdatedAt`: `[ownerKey, updatedAt]`;
- `topics.byOwnerStream`: `[ownerKey, streamUuid]`;
- `conversations.byOwnerUpdatedAt`: `[ownerKey, updatedAt]`;
- `folderItems.byOwnerFolder`: `[ownerKey, folderUuid]`;
- `messages.byOwnerCreatedAt`: `[ownerKey, createdAt]`;
- `messageBuckets.byConversationOrder`: `[ownerKey, conversationId, orderKey]`;
- `messageBuckets.byMessage`: `[ownerKey, messageUuid]`;
- `searchResults.byOwnerExpiresAt`: `[ownerKey, expiresAt]`.

## Инварианты

- `ownerKey` обязателен в каждой строке.
- Один `messageUuid` хранится в `messages` один раз на owner.
- Один `messageUuid` может быть в двух buckets: stream conversation и topic
  conversation.
- `messageBuckets` не хранит тело сообщения.
- `messageWindows` не считается полной историей чата. Это только состояние
  локально загруженного окна.
- `conversations` - frontend projection поверх streams/topics, не backend
  сущность.
- `folderItems` ссылается на stream conversation, потому что backend folder item
  хранит `stream_uuid` и `chat_type`, а не topic.
- Search results не смешиваются с обычной историей чата.

## Write flow

### Bootstrap

1. Построить `ownerKey` из текущего Workspace runtime.
2. Прочитать `streams`, `topics`, `conversations`, `folders`, `folderItems`,
   `users`, `realtimeCursor`.
3. Применить данные в `useMessengerStore`.
4. Запустить network bootstrap.
5. Network snapshot применить в store.
6. Записать свежий snapshot в IndexedDB.

### Open conversation

1. Прочитать `messageBuckets` по `[ownerKey, conversationId, orderKey]`.
2. Прочитать тела сообщений из `messages`.
3. Прочитать `messageWindows`.
4. Применить в `useWorkspaceMessageStore`.
5. Запустить network load первой страницы.
6. Смержить страницу в store.
7. Записать сообщения, buckets и window meta в IndexedDB.

### Load more

1. Взять `nextPageMarker` из message store или `messageWindows`.
2. Запросить страницу через Workspace API.
3. Смержить страницу в `useWorkspaceMessageStore`.
4. Upsert тел сообщений в `messages`.
5. Upsert bucket-строк в `messageBuckets`.
6. Обновить `messageWindows`.

### Realtime

`message.created`:

- upsert body в `messages`;
- добавить bucket для `topic:<streamUuid>:<topicUuid>`;
- добавить bucket для `stream:<streamUuid>`;
- обновить last-message pointers в `conversations`, `streams`, `topics`;
- обновить `messageWindows`, если conversation уже имеет локальное окно;
- записать `epochVersion` в `realtimeCursor`.

`message.updated`:

- обновить body в `messages`;
- если изменился `createdAt`, пересчитать bucket order;
- обновить preview/last-message projections;
- записать `epochVersion`.

`message.deleted`:

- удалить bucket-строки для stream/topic conversation;
- удалить body из `messages`, если на него больше нет bucket-ссылок;
- обновить last-message pointer, если удаленное сообщение было последним;
- записать `epochVersion`.

`stream.updated`, `topic.updated`, `folder.updated`:

- заменить соответствующий snapshot;
- пересобрать affected conversations;
- не трогать bodies сообщений без необходимости.

## Search and anchors

Поиск хранится отдельно:

```ts
searchResults;
ownerKey;
queryHash;
query;
filters;
resultMessageUuids;
createdAt;
expiresAt;
```

Правила:

- Локальный поиск по IndexedDB можно использовать только как быстрый
  предварительный результат.
- Полная истина поиска остается за server-side поиском, когда backend даст
  контракт.
- Тела найденных сообщений не дублируются в `searchResults`; недостающие тела
  догружаются batch-запросом по UUID.

Якоря:

- `latest` - открыть последнюю доступную страницу;
- `lastRead` - открыть на границе последнего прочитанного, если данные есть;
- `firstUnread` - использовать, если backend даст такую точку;
- `messageUuid` - permalink/search/push anchor;
- `pageMarker` - только серверная догрузка страницы.

Если `messageUuid` отсутствует в кэше, нужен backend resolve через
`GET /messages/{message_uuid}`. Для полноценного permalink нужен отдельный
backend contract страницы вокруг сообщения; обычный `page_marker` это не
заменяет.

Текущий статус Phase 6: реализуемыми считаются только IndexedDB primitives для
`searchResults` и защита UI от смешивания старого Zulip search с Workspace path.
Phase 6 нельзя считать полностью закрытой, пока backend не даст server-side
search contract и отдельный page-around-message contract для открытия окна
вокруг `messageUuid`.

## Agent phases

Каждая фаза должна быть отдельной задачей для саб-агента. Оркестратор передает
агенту этот документ, `docs/WORKSPACE_MESSAGE_STORE_CUTOVER_PLAN.md`,
`docs/WORKSPACE_MESSENGER_MIGRATION_PLAN.md` и актуальные backend docs.

### Phase 0. Contract check

Owner: orchestrator.

Задачи:

- подтвердить, что Workspace API не содержит `chat_uuid`;
- подтвердить, что folder item хранит `stream_uuid` и `chat_type`;
- подтвердить, что message хранит `stream_uuid` и `topic_uuid`;
- зафиксировать текущий `conversationId` как frontend key.

Выход:

- короткий комментарий в задаче реализации;
- список backend gaps, если контракт изменился.

### Phase 1. IndexedDB schema

Owner: cache-schema agent.

Задачи:

- создать новый `workspace-messenger-cache-db` слой;
- завести новую DB name/version;
- описать row-типы;
- создать object stores и индексы;
- добавить reset helper для тестов;
- не импортировать старые Zulip cache-типы.

Основные файлы:

- `packages/web/src/shared/lib/workspace-messenger-cache-db.ts`;
- `packages/web/src/shared/lib/workspace-messenger-cache-db-upgrade.lib.ts`;
- тесты рядом с новым кодом.

Проверки:

- открытие базы без IndexedDB не падает наружу;
- схема создается с чистой базы;
- старый `workspace-message-cache-v1` не открывается.

### Phase 2. Cache repository

Owner: cache-repository agent.

Задачи:

- добавить функции чтения bootstrap snapshot;
- добавить функции записи messenger catalog snapshot;
- добавить функции чтения conversation window;
- добавить функции записи message page;
- добавить точечные patch helpers для realtime/update/delete;
- добавить bounded retention для message buckets.

Минимальные функции:

```ts
readMessengerCatalogCache(ownerKey);
writeMessengerCatalogCache(ownerKey, snapshot);
readConversationMessageWindow(ownerKey, conversationId);
writeConversationMessagePage(ownerKey, conversationId, page);
patchCachedMessage(ownerKey, message);
deleteCachedMessage(ownerKey, messageUuid, conversationIds);
writeRealtimeCursor(ownerKey, epochVersion);
```

Проверки:

- порядок сообщений стабилен по `createdAt + uuid`;
- повторная запись страницы не дублирует bucket rows;
- topic message попадает в topic bucket и stream bucket;
- удаление body происходит только после удаления всех bucket-ссылок.

### Phase 3. Messenger bootstrap hydrate

Owner: messenger-bootstrap-cache agent.

Задачи:

- подключить чтение catalog cache перед network bootstrap;
- применить cached snapshot в `useMessengerStore`;
- после network bootstrap записывать свежий snapshot;
- защитить запись owner guard-ом;
- не затирать свежие realtime изменения старым snapshot.

Основные файлы:

- `packages/web/src/entities/messenger/messenger-bootstrap.lib.ts`;
- новый cache repository из Phase 2;
- тесты bootstrap flow.

Проверки:

- при пустом кэше приложение идет сразу в network bootstrap;
- при кэше sidebar появляется до network ответа;
- stale owner response не пишет ни store, ни IndexedDB;
- folder snapshot не затирается пустым payload до загрузки folders.

### Phase 4. Conversation message hydrate

Owner: message-window-cache agent.

Задачи:

- подключить чтение message window перед network load;
- применять cached messages в `useWorkspaceMessageStore`;
- после network page писать messages, buckets, windows;
- сохранять `nextPageMarker` и `hasMore`;
- не терять live messages, пришедшие до network ответа.

Основные файлы:

- `packages/web/src/entities/messenger/messenger-messages-loader.lib.ts`;
- `packages/web/src/entities/message/message.model.ts`;
- новый cache repository.

Проверки:

- cached window открывается без network ответа;
- network page мержится без дублей;
- `replaceOrMergeConversationMessagesPage` не удаляет live-сообщение;
- `hasMore/nextPageMarker` восстанавливаются после reload.

### Phase 5. Write-through for actions and realtime

Owner: realtime-cache agent.

Задачи:

- после send/edit/delete/read писать изменения в кэш;
- после realtime events писать изменения в кэш;
- обновлять last-message pointers;
- обновлять `realtimeCursor`;
- не делать local fake success для неподдержанных действий.

Основные файлы:

- `packages/web/src/entities/messenger/messenger-message-actions.lib.ts`;
- `packages/web/src/entities/messenger/messenger-realtime-applier.lib.ts`;
- cache patch helpers.

Проверки:

- own send появляется в store и кэше;
- edit меняет cached body;
- delete убирает buckets и body при отсутствии ссылок;
- read меняет cached message view только для текущего owner;
- realtime replay не создает дубли.

### Phase 6. Search and message anchors

Owner: search-anchor-cache agent.

Статус: partial. В текущей итерации допустимы `searchResults` helpers,
TTL-очистка и UI-запрет на legacy Zulip search внутри Workspace route. Полное
подключение поиска и anchors остается deferred до server search и
page-around-message contract.

Задачи:

- добавить `searchResults` helpers;
- добавить TTL очистку search results;
- подключить batch load missing message bodies;
- описать поведение `messageUuid` anchor;
- явно зафиксировать backend gap для страницы вокруг сообщения, если ручки нет.

Проверки:

- search result не пишет сообщения в обычный conversation bucket сам по себе;
- missing message bodies догружаются по UUID;
- expired search results не используются;
- отсутствующий `messageUuid` не ломает обычное открытие чата.

### Phase 7. Retention and cleanup

Owner: cache-retention agent.

Задачи:

- ограничить размер message buckets на conversation;
- добавить удаление просроченных search results;
- добавить очистку owner cache при logout/account removal;
- добавить best-effort cleanup старых owner rows;
- не удалять старую Zulip базу автоматически без отдельного решения.

Проверки:

- retention не ломает `messageWindows`;
- cleanup одного owner не удаляет данные другого owner;
- logout не оставляет доступных cached messages для старого пользователя.

## Оркестрация

Порядок запуска:

1. Phase 0 - контрактная проверка.
2. Phase 1 - схема базы.
3. Phase 2 - repository helpers.
4. Phase 3 и Phase 4 можно делать параллельно после Phase 2.
5. Phase 5 после Phase 3/4.
6. Phase 6 после Phase 2, но подключать к UI после Phase 4.
7. Phase 7 последней.

Правила для саб-агентов:

- один агент не редактирует файлы другого агента без явной передачи ownership;
- агент сначала пишет/обновляет тесты для своей зоны;
- агент не импортирует старые Zulip cache helpers;
- агент не меняет backend contract;
- агент не добавляет совместимость со старым IndexedDB;
- агент не кладет UI-логику в `shared/lib`;
- итог каждой фазы должен включать список измененных файлов и команды проверки.

## Quality gates

Минимальные команды:

```bash
npm run typecheck
npm run test -- --run
```

Для узких фаз предпочтительно запускать точечные Vitest-файлы из
`packages/web`, если полная проверка слишком дорогая:

```bash
npx vitest run src/entities/messenger/<file>.test.ts
npx vitest run src/shared/lib/<file>.test.ts
```

Перед включением в UI нужно вручную проверить сценарии:

- первый вход без кэша;
- reload с уже заполненным sidebar cache;
- reload открытого topic conversation;
- догрузка старых сообщений;
- send/edit/delete/read;
- realtime message.created/message.updated/message.deleted;
- переключение organization/project/account во время pending requests;
- logout и повторный вход другим пользователем.

## Definition of done

- Новый Workspace cache не зависит от старого Zulip IndexedDB.
- Пустой старый кэш не ломает Workspace messenger.
- Sidebar и открытый conversation могут гидрироваться из нового IndexedDB.
- Network refresh корректно мержится поверх cached данных.
- Actions и realtime пишут в store и кэш через единый слой.
- `ownerKey` защищает все чтения и записи.
- Сообщения упорядочены по `createdAt + uuid`.
- `page_marker` сохраняется как серверный указатель, отдельно от порядка.
- Search results отделены от обычной истории сообщений.
- Все неподдержанные backend-возможности оформлены как gaps, а не как fake local
  behavior.
