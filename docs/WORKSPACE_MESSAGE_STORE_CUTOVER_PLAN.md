# Workspace Message Store Cutover Plan

Дата среза: 2026-07-01.

Этот документ фиксирует план жесткого разреза старой Zulip message-модели и
переезда на новый Workspace-native message store. Он дополняет
`docs/WORKSPACE_MESSENGER_MIGRATION_PLAN.md` и нужен как рабочая база для
следующей итерации, где реализацию можно раздать саб-агентам.

Главное решение: старый `entities/message/message.model.ts` больше не считаем
переиспользуемой основой. Удаляем Legacy ChatPage и Zulip message runtime, а на
месте `entities/message/message.model.ts` строим новую Workspace-модель
сообщений. Если действие пока не поддержано Workspace API, UI оставляет видимую
контролируемую заглушку, но не вызывает Zulip API.

## Цель

Сделать `entities/message/message.model.ts` новым source of truth для Workspace
сообщений, а `entities/messenger/messenger.model.ts` оставить для структуры
мессенджера:

- folders;
- streams;
- topics;
- conversations;
- bootstrap status;
- realtime cursor;
- unread/last-message projections;
- runtime-scoped metadata.

Новая message-модель должна владеть:

- `messagesById`;
- `messageIdsByConversationId`;
- порядком сообщений;
- merge страниц истории;
- live upsert/delete/read/edit;
- статусами загрузки окон сообщений;
- page markers для догрузки истории;
- селекторами сообщений для открытого окна чата.

## Базовые решения

- Zulip message store удаляем, а не переименовываем в долгоживущий fallback.
- `LegacyChatPage` удаляем полностью.
- Workspace chat route остается единственной chat surface.
- Старый `MessageList` можно временно использовать только как view layer через
  adapter, пока он не переписан под Workspace types.
- `MockMessage` допускается только на границе adapter -> старый `MessageList`.
  Его нельзя хранить в новом store.
- Workspace API - единственный источник write/read операций для сообщений.
- Неподдержанные действия в UI не скрываем без причины: показываем явную
  заглушку "ещё не подключено".
- IndexedDB/cache в этой итерации не переносим. Новый cache contract делаем
  отдельной задачей после стабилизации Workspace bootstrap/message store.

## Что делает старый Zulip message store

Текущий `packages/web/src/entities/message/message.model.ts` обслуживает не
только массив сообщений. Перед удалением нужно понимать, какие обязанности мы
теряем.

### Открытый chat window

- хранит текущий контекст открытого чата;
- различает stream/topic, stream-wide и dm context;
- сбрасывает окно при смене контекста;
- защищается от устаревших ответов после быстрого переключения чатов;
- хранит `messages` как плоский массив текущего окна.

### Загрузка истории

- грузит initial window;
- гидрирует окно из старого IndexedDB cache;
- делает API refresh после cache hydrate;
- догружает старые сообщения вверх;
- догружает новые сообщения вниз для focused anchor;
- хранит `hasOlderMessages`, `hasNewerMessages`;
- хранит `isLoadingMore`, `isLoadingNewer`;
- хранит `boundaryLoadFailed` и `initialLoadError`;
- дедупит страницы по числовому `message.id`.

### Optimistic send

- добавляет временное сообщение с отрицательным id;
- держит FIFO очередь `pendingOutgoingEchoKeys`;
- заменяет optimistic row на серверный echo;
- мержит pending link previews при commit;
- помечает failed delivery.

### Message actions

- удаляет одно или несколько сообщений из текущего окна;
- обновляет реакции;
- обновляет flags (`read`, `starred` и другие Zulip flags);
- обновляет content/markdown_source;
- делает optimistic edit;
- commit/fail/cancel для optimistic edit;
- обновляет link preview;
- двигает сообщения при rename topic;
- двигает сообщения при move topic to another stream.

### Side effects

- пишет старые Zulip-shaped сообщения в IndexedDB;
- патчит старый IndexedDB cache при edit/reaction/flags/delete;
- подмешивает sender metadata в `useUsersStore`;
- синхронизирует open-window payload обратно в старый chat-list preview.

## Что не является обязанностью старого store

Старый `message.model.ts` не является владельцем:

- участников чата;
- online/offline статуса;
- общего списка users;
- списка folders;
- списка streams/topics;
- списка conversations;
- общего unread source of truth;
- звонков как доменной сущности.

Эти вещи живут в других stores/features или вычисляются вокруг открытого окна.
При cutover их нельзя автоматически переносить в новый message store.

## Что нельзя переносить в новую модель

Новая Workspace message-модель не должна сохранять старые Zulip контракты:

- `MockMessage` как состояние store;
- числовой `message.id` как backend identity;
- отрицательные id как доменный optimistic identity;
- `stream_id`;
- `subject`;
- `display_recipient`;
- `dmKey`;
- `narrow`;
- `fetchMessagesWithNarrowPage`;
- Zulip event queue;
- Zulip flags как основной read/starred contract;
- старый Zulip IndexedDB partition format.

## Целевая модель

Новый `entities/message/message.model.ts` должен быть Workspace-native.

Минимальное состояние:

```ts
interface WorkspaceMessageStoreState {
  messagesById: Record<MessengerUuid, MessengerMessage>;
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>;
  messagesLoadingByConversationId: Record<MessengerConversationId, boolean>;
  messagesErrorByConversationId: Record<MessengerConversationId, string | null>;
  nextPageMarkerByConversationId: Record<MessengerConversationId, string | null>;
  hasMoreByConversationId: Record<MessengerConversationId, boolean>;
}
```

Инварианты:

- каждый `messageIdsByConversationId[conversationId]` отсортирован по
  `createdAt`, затем по `uuid`;
- `messagesById[uuid]` хранит последнее известное тело сообщения;
- один `uuid` в одном bucket встречается только один раз;
- topic conversation и stream conversation могут ссылаться на один и тот же
  `MessengerMessage`;
- initial history response считается snapshot окна, а не полной истиной обо
  всем bucket;
- live-сообщение, пришедшее до HTTP-ответа, не должно пропадать после initial
  load.

Основные операции:

- `replaceOrMergeConversationMessagesPage`;
- `mergeConversationMessagesPage`;
- `indexMessageIntoConversationBuckets`;
- `upsertMessage`;
- `applyMessageEdit`;
- `removeMessage`;
- `markMessageRead`;
- `setMessagesLoading`;
- `setMessagesError`;
- `setConversationPagination`.

Публичные селекторы:

- `selectWorkspaceMessagesForConversation`;
- `selectWorkspaceMessageStatusForConversation`;
- `selectWorkspaceMessageById`;

Селекторы должны возвращать стабильные ссылки, если входные ссылки не
изменились. Не возвращаем свежие `[]`/`{}` как fallback.

## Граница с `entities/messenger`

После cutover `entities/messenger/messenger.model.ts` перестает владеть телами
сообщений и списками id сообщений.

В нем остаются:

- `streamsById`;
- `topicsById`;
- `conversationsById`;
- `foldersById`;
- `folderItemsById`;
- unread counters;
- last message pointers;
- bootstrap/realtime state;
- owner/runtime guards.

Что переезжает в `entities/message/message.model.ts`:

- `messagesById`;
- `messageIdsByConversationId`;
- `messagesLoadingByConversationId`;
- `messagesErrorByConversationId`;
- `nextPageMarkerByConversationId`;
- `hasMoreByConversationId`;
- helper-логика сортировки и merge страниц.

Actions в `entities/messenger/*` после переезда должны либо:

- вызывать message-store для message write;
- либо возвращать payload, который process/page слой применяет в message-store.

Не допускается, чтобы одно и то же message state жило и в `messengerStore`, и в
`messageStore`.

## UI policy для неподдержанных функций

Если Workspace API пока не поддерживает действие, UI остается предсказуемым:

- control может оставаться видимым;
- при клике показывается понятная заглушка;
- Zulip API не вызывается;
- local fake success не делаем;
- действие заносится в backlog/gap list.

Текущие примеры заглушек:

- reactions;
- forward;
- read receipts;
- permalink;
- retry failed outgoing;
- retry/cancel failed edit;
- uploads;
- saved snippets;
- preview;
- mentions;
- scheduled send;
- custom emojis.

Поддержанные сейчас Workspace-действия:

- send message;
- edit message;
- delete message;
- mark message read;
- load conversation messages;
- realtime message create/update/delete через Workspace event applier.

## Cache policy

Кэш в этой итерации не переносим.

Что откладываем:

- IndexedDB schema для Workspace messages;
- bootstrap cache hydration;
- background cache warming;
- cache partition by account/organization/project/conversation;
- old Zulip message-cache migration;
- offline-first поведение.

Временное правило: после удаления старого store старый Zulip IndexedDB cache не
используется для Workspace chat window. Если нужен cache fallback, он будет
спроектирован отдельно и только в Workspace-shaped формате.

## Фазы работ

Фазы сформулированы так, чтобы их можно было раздать саб-агентам с минимальным
пересечением write scope.

### Phase 0. Зафиксировать cutover contract

Цель: зафиксировать этот план и договориться о границах.

Write scope:

- `docs/WORKSPACE_MESSAGE_STORE_CUTOVER_PLAN.md`

Результат:

- есть список обязанностей старого store;
- есть target model;
- есть policy для заглушек;
- cache явно отложен.

### Phase 1. Удалить Legacy ChatPage

Цель: сделать Workspace chat единственной chat surface.

Что делаем:

- удалить `LegacyChatPage` из `pages/chat/chat-page.ui.tsx`;
- оставить `ChatPage` тонкой оболочкой, которая резолвит Workspace route и
  рендерит `WorkspaceChatPage`;
- старые route shapes, которые больше не поддержаны, должны попадать в
  контролируемое состояние, а не в Zulip flow;
- удалить импорты `shared/api/zulip-messages` из chat page;
- удалить старые send/edit/delete/read handlers, которые вызывают Zulip API.

Write scope:

- `packages/web/src/pages/chat/chat-page.ui.tsx`
- точечно связанные `pages/chat/*`, если они становятся dead code

Проверка:

- `npx tsc --noEmit`;
- targeted tests для `chat-page-workspace`.

### Phase 2. Удалить старый Zulip message store

Цель: убрать старый source of truth и получить честную карту оставшихся
зависимостей.

Что делаем:

- удалить старую реализацию `entities/message/message.model.ts`;
- удалить или временно не экспортировать `useCurrentChatMessagesStore`;
- удалить Zulip-only helpers, если они больше никем не используются;
- оставить только helpers, которые реально нужны Workspace UI adapter или
  независимы от Zulip API;
- запустить `tsc` и разобрать ошибки по категориям.

Ожидаемые категории ошибок:

- старый Zulip realtime loop;
- old chat initial load;
- old read/mark-read path;
- right panel hooks;
- logs/devtools/ai-context diagnostics;
- topic move/resolve features;
- tests старого store.

Write scope:

- `packages/web/src/entities/message/*`
- возможно `packages/web/src/widgets/layout/*zulip-event*`
- возможно `packages/web/src/features/mark-chat-read/*`
- возможно `packages/web/src/features/mark-topic-resolved/*`

Правило:

- если файл относится только к Zulip runtime, удаляем;
- если файл нужен Workspace UI, переводим на Workspace contract;
- если API нет, ставим заглушку.

### Phase 3. Создать новый Workspace message store

Цель: на месте старого `message.model.ts` собрать новую Workspace-модель.

Что делаем:

- добавить Workspace-native state;
- перенести сортировку `createdAt + uuid`;
- перенести merge страниц;
- перенести live upsert/delete/read/edit;
- добавить селекторы с кешированием по входным ссылкам;
- добавить unit tests на порядок, дедуп и stale initial merge.

Write scope:

- `packages/web/src/entities/message/message.model.ts`
- `packages/web/src/entities/message/message.model.types.ts`
- новые `packages/web/src/entities/message/*workspace*.lib.ts`, если нужно
- `packages/web/src/entities/message/*.test.ts`

Проверка:

- targeted Vitest по `entities/message`;
- `npx tsc --noEmit`.

### Phase 4. Разгрузить `useMessengerStore`

Цель: убрать message buckets из `entities/messenger/messenger.model.ts`.

Что делаем:

- удалить из messenger store message state;
- loaders/actions/realtime applier переводить на новый message-store;
- оставить в messenger store только conversation/stream/topic/folder metadata;
- last message pointers обновлять через явные payloads или lightweight
  projection, без владения всем body сообщения.

Write scope:

- `packages/web/src/entities/messenger/messenger.model.ts`
- `packages/web/src/entities/messenger/messenger-messages-loader.lib.ts`
- `packages/web/src/entities/messenger/messenger-message-actions.lib.ts`
- `packages/web/src/entities/messenger/messenger-realtime-applier.lib.ts`
- связанные tests

Проверка:

- `npx vitest run src/entities/messenger src/entities/message` из
  `packages/web`;
- `npx tsc --noEmit`.

### Phase 5. Подключить WorkspaceChatPage к новому store

Цель: страница чата читает сообщения из `entities/message`, а не из
`entities/messenger`.

Что делаем:

- заменить чтение `messagesById/messageIdsByConversationId` на selectors нового
  store;
- оставить `useMessengerStore` только для conversation/stream/topic/users
  metadata;
- сохранить временный adapter в старый `MessageList`;
- проверить read batch, send/edit/delete и unsupported callbacks.

Write scope:

- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`
- `packages/web/src/pages/chat/chat-page-workspace-message.adapter.ts`
- связанные tests

Проверка:

- `npx vitest run src/pages/chat/chat-page-workspace.test.tsx`;
- ручной smoke: открыть stream/topic, отправить, отредактировать, удалить,
  отметить прочитанным.

### Phase 6. Удалить старый Zulip runtime хвост

Цель: убрать код, который был нужен только старому message store.

Что делаем:

- удалить старые `layout-zulip-event-*`, если они больше не обслуживают живой
  route;
- отключить old active chat refresh;
- удалить old chat-list sync from window, если он был только для Zulip window;
- обновить logs/devtools/ai-context на Workspace diagnostics или убрать старые
  поля;
- удалить тесты, которые проверяют удаленный Zulip runtime.

Write scope:

- `packages/web/src/widgets/layout/*zulip-event*`
- `packages/web/src/widgets/layout/layout-active-chat-refresh*`
- `packages/web/src/app/devtools.ts`
- `packages/web/src/app/ai-context.ts`
- старые tests

Проверка:

- `npx tsc --noEmit`;
- `npx vitest run src/widgets/layout src/pages/chat src/entities/message src/entities/messenger`;
- затем широкий `npx vitest run src/entities/messenger src/entities/message src/pages/chat`.

## Ownership для саб-агентов

Рекомендуемая раскладка:

- Agent A: `entities/message` target store, helpers, tests.
- Agent B: `entities/messenger` разгрузка message buckets и правка loaders/actions/realtime.
- Agent C: `pages/chat` удаление Legacy ChatPage и подключение нового store.
- Agent D: cleanup старого Zulip runtime, diagnostics, dead tests.

Правило синхронизации:

- Agent A сначала публикует новый store API.
- Agent B и C не меняют `entities/message` без согласования.
- Agent D стартует после первых успешных `tsc`-ошибок от Phase 1/2, чтобы не
  удалять код, который еще нужен A/B/C для переноса.

## Acceptance criteria

Срез считается успешным, когда:

- `LegacyChatPage` удален;
- `useCurrentChatMessagesStore` удален или больше не экспортируется;
- Workspace chat не импортирует `shared/api/zulip-*`;
- `entities/message/message.model.ts` хранит Workspace messages, а не
  `MockMessage`;
- `entities/messenger/messenger.model.ts` не владеет message body buckets;
- load/send/edit/delete/read работают через Workspace API;
- неподдержанные actions показывают явные заглушки;
- старый Zulip IndexedDB cache не участвует в Workspace chat window;
- `npx tsc --noEmit` проходит;
- targeted tests по `entities/message`, `entities/messenger`, `pages/chat`
  проходят.

## Риски

- Удаление Legacy ChatPage может вскрыть старые routes, которые еще ведут не в
  Workspace route format.
- Старый `MessageList` продолжит требовать `MockMessage`; adapter нужно держать
  строго на UI-границе.
- Старые tests могут создавать много шума. Их нужно делить на "переписать под
  Workspace" и "удалить вместе с Zulip runtime".
- Right panel, devtools и AI context могут потерять старые данные открытого
  чата. Для них нужен отдельный Workspace diagnostics contract.
- Без cache после reload история будет зависеть только от Workspace API. Это
  принятое временное ограничение.

## Не цели этой итерации

- Новый Workspace IndexedDB cache.
- Полная перепись `MessageList` под Workspace types.
- Реакции, если Workspace API/contract еще не готов.
- Message forward, read receipts, permalink.
- Typing indicator.
- Uploads.
- Saved snippets.
- Scheduled send.
- Custom emojis.
- Background cache warming.
