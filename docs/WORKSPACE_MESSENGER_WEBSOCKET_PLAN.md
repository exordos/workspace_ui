# Workspace Messenger WebSocket Plan

Дата среза: 2026-06-30.

Этот документ фиксирует отдельный план по WebSocket-слою для Workspace
Messenger. Он дополняет
`docs/WORKSPACE_MESSENGER_MIGRATION_PLAN.md` и нужен как рабочая база для
следующей итерации, где реализацию будет вести оркестратор через саб-агентов.

Главная цель: сначала собрать удобную и безопасную базу realtime-рантайма, а
потом отдельными итерациями добить полное применение событий для сообщений,
чатов и папок.

## Зачем нужен отдельный документ

Общий migration-план уже фиксирует target contract для realtime:

- `last_epoch_version` по owner context;
- REST catch-up перед WebSocket;
- единый event shape для REST и WebSocket;
- дедупликация по `epoch_version`;
- один dispatch path для catch-up и live-событий.

Но в общем migration-плане нет отдельной поэтапной схемы именно для
WebSocket-оркестрации:

- как запускать постоянные соединения;
- как разделить active и background рантаймы;
- как не смешать project-scoped данные разных аккаунтов;
- в каком порядке подключать message/stream/topic/folder события;
- что считать базой первого безопасного diff-а.

Этот документ закрывает именно этот пробел.

## Что уже есть в коде

На текущем срезе в репо уже есть важные заготовки:

- `packages/web/src/shared/api/messenger-realtime.api.ts`
  - `GET /events/`
  - `GET /epoch/`
  - `buildMessengerWebSocketUrl(...)`
  - `buildMessengerWebSocketProtocols(...)`
  - `normalizeWorkspaceRestEvent(...)`
  - `normalizeWorkspaceWebSocketFrame(...)`
- `packages/web/src/entities/workspace-runtime/workspace-runtime.lib.ts`
  - `workspaceRuntimeOwnerKey(...)`
  - `workspaceRuntimeCursorKey(...)`
  - request-context guards по `runtimeGeneration`
- `packages/web/src/entities/messenger/messenger.model.ts`
  - `setRealtimeCursor(...)`
  - `markRealtimeEventSkipped(...)`
  - точечные store-операции `upsert/remove` для stream/topic/message/folder
- `packages/web/src/shared/api/messenger-client.ts`
  - `project_id` централизованно добавляется в project-scoped messenger-запросы
- `packages/web/src/widgets/layout/layout.ui.tsx`
  - старый Zulip event loop уже отключается на Workspace messenger route

Итог: транспортный низ и owner/cursor база уже частично собраны, но нет
process-слоя, который реально держит Workspace WebSocket-рантаймы и применяет
события в нужные поверхности.

## Базовые решения

Эти решения считаются зафиксированными для плана ниже.

### 1. Главный runtime scope

WebSocket runtime привязан не просто к аккаунту, а к project-runtime:

- `accountId`
- `instanceId`
- `organizationId`
- `projectId`
- `userUuid`
- `runtimeGeneration`

Причина простая: messenger events, cursor, кеши, unread и folders в Workspace
модели project-scoped.

### 2. Соединения открыты постоянно

Целевой режим:

- для каждого доступного project-runtime держим открытое WebSocket-соединение;
- соединения не создаются только для активного проекта;
- active и background отличаются не наличием сокета, а режимом применения
  событий.

### 3. Active и background разделяем по surface

Нужно различать два режима одного realtime-движка:

- `active surface`
  - слушает полный поток;
  - применяет события в `entities/messenger`;
  - обновляет видимый chat shell;
- `background surface`
  - соединение держит тоже;
  - полный chat state не обновляет;
  - работает через отдельную легкую проекцию.

Важно: в этой итерации делаем упор на active runtime. Background runtime
фиксируем в архитектуре, но не упарываемся в его полный apply path.

### 4. Один transport core, разные applier-слои

Нельзя строить два независимых WebSocket-стека:

- один для active;
- второй для background.

Нужен один общий transport/runtime core, поверх которого работают разные
обработчики:

- active applier;
- background applier.

### 5. Background в первой итерации ограничиваем

Для первой рабочей версии background path:

- должен иметь отдельный контракт;
- не должен писать в `messengerStore`;
- может быть отложен до стадии, когда active runtime уже стабилен;
- может в будущем обновлять не UI-state, а только cache/projection/notification
  state.

## Не цели первой итерации

Ниже перечислено то, что сейчас специально откладываем:

- полный background apply path для всех event kinds;
- background-пересборка sidebar/message lists;
- сложные notification side effects;
- full cache warming из background WebSocket;
- синхронизация всех неподдержанных backend gaps;
- typing/reactions/starred/search и прочие события вне базового контракта.

## Целевой верхнеуровневый поток

Для одного project-runtime поток должен выглядеть так:

```text
runtime owner
  -> cursor load
  -> REST catch-up (epoch_version>)
  -> normalize
  -> dedupe/order
  -> apply or skip
  -> cursor advance
  -> WebSocket live stream
  -> normalize
  -> dedupe/order
  -> apply or skip
  -> cursor advance
```

Для active и background здесь общий transport path, а расходится только этап
`apply`.

## Набор фаз

Ниже фазы сформулированы так, чтобы их можно было потом раздать отдельным
саб-агентам с минимальным пересечением write scope.

### Phase 0. Contracts and boundaries

Цель: зафиксировать, где заканчивается transport core и где начинается
применение событий.

Что делаем:

- описываем `WorkspaceRealtimeRuntimeOwner` как project-runtime owner;
- описываем `WorkspaceRealtimeSurface = "active" | "background"`;
- описываем `WorkspaceRealtimeRuntimeMode`, если кроме surface понадобится
  явный режим reconnect/catch-up state;
- фиксируем интерфейс transport core:
  - start
  - stop
  - catch-up
  - connect
  - disconnect
  - nudge/reconnect
- фиксируем интерфейс event applier:
  - `applyEvent(event, context)`
  - `skipEvent(event, reason)`
  - `onTransportStateChange(...)`
- фиксируем интерфейс cursor storage:
  - read by owner
  - write by owner
  - clear by owner

Результат фазы:

- понятные типы и seams;
- можно раздавать transport, cursor и applier разным агентам;
- без этой фазы дальше легко смешать active/background обязанности.

Предпочтительный write scope:

- `packages/web/src/entities/workspace-runtime/*`
- `packages/web/src/shared/api/*`
- новый `packages/web/src/shared/lib/workspace-realtime/*`

### Phase 1. Cursor and durable catch-up base

Цель: собрать надежную базу курсора и catch-up до живого сокета.

Что делаем:

- вводим отдельный cursor helper/storage по
  `accountId + instanceId + organizationId + projectId + userUuid`;
- читаем стартовый cursor из storage;
- если cursor нет, берем стартовую точку через `/epoch/`;
- делаем REST catch-up через `GET /events/?epoch_version%3E=<last>`;
- сортируем batch по `epoch_version`;
- отбрасываем дубли и старые события;
- после `applied` и `skipped` продвигаем cursor;
- добавляем targeted tests на:
  - пустой cursor;
  - duplicate epoch;
  - unknown event skip;
  - stale owner;
  - cursor monotonic advance.

Результат фазы:

- у нас появляется безопасная durable-база без WebSocket-specific логики;
- приложение уже умеет догонять пропущенные события после reload/restart.

Почему это база:

- если эта часть собрана плохо, живой сокет дальше только усилит расхождения;
- без стабильного catch-up reconnect будет ненадежным.

### Phase 2. Transport core and active runtime shell

Цель: поднять живой WebSocket для active runtime поверх готовой cursor/catch-up
базы.

Что делаем:

- создаем `workspace-realtime-runtime` или аналогичный core-модуль;
- transport core делает:
  - initial catch-up;
  - open WebSocket;
  - parse frame;
  - normalize frame;
  - dedupe/order;
  - cursor advance;
  - reconnect/backoff;
- transport core ничего не знает про `messengerStore`;
- вводим отдельный active runtime hook/manager для текущего Workspace path;
- при смене active project:
  - старый runtime останавливается;
  - новый runtime поднимается с новым owner context;
  - stale callbacks режутся через `runtimeGeneration`.

Результат фазы:

- есть первый полноценный active WebSocket runtime;
- он еще может не покрывать все event-side effects, но уже держит живое
  соединение правильно.

Предпочтительный write scope:

- новый `packages/web/src/shared/lib/workspace-realtime/*`
- новый `packages/web/src/widgets/layout/layout-workspace-realtime.hook.ts`
- `packages/web/src/widgets/layout/layout.ui.tsx`

### Phase 3. Active apply path for message/stream/topic/folder skeleton

Цель: подключить минимально достаточное применение событий в
`entities/messenger`.

Что делаем:

- создаем отдельный active applier для `WorkspaceRealtimeEvent`;
- маппим event kinds на уже существующие store-операции:
  - `message.created`
  - `message.updated`
  - `message.deleted`
  - `stream.created/updated/deleted`
  - `stream_bindings.created`
  - `topic.created/updated/deleted`
  - `folder.created/updated/deleted`
  - `folder_item.deleted`
- unsupported event не роняет runtime:
  - логируем;
  - пишем `markRealtimeEventSkipped(...)`;
  - двигаем cursor;
- apply path всегда проверяет owner context перед записью в store.

Результат фазы:

- active runtime уже реально обновляет messenger domain state;
- чатовый shell начинает жить от Workspace realtime, а не только от bootstrap и
  ручных reload.

### Phase 4. Message timeline and open-chat correctness

Цель: добить поведение событий сообщений в открытом чате и в списках
разговоров.

Что делаем:

- проверяем, как `message.created` индексируется в conversation buckets;
- гарантируем, что echo от WebSocket не дублирует optimistic message row;
- `message.updated` обновляет уже видимое сообщение без потери порядка;
- `message.deleted` корректно убирает сообщение из topic/stream buckets;
- sidebar/conversation ordering обновляется от свежих message events;
- targeted tests покрывают:
  - optimistic send + echo;
  - incoming message in active chat;
  - incoming message in inactive conversation;
  - edit/delete after bootstrap;
  - reload + catch-up + no duplicates.

Результат фазы:

- realtime сообщений становится пригодным для ежедневного использования;
- исчезает основная часть ручных refresh-сценариев.

### Phase 5. Folder and chat-surface completeness

Цель: добить события, которые влияют на папки, состав чатов и производные
поверхности.

Что делаем:

- `folder.created/folder.updated/folder.deleted` применяем как source-of-truth
  backend snapshots;
- `folder_item.deleted` корректно очищает membership внутри папок;
- `stream.created` и `stream_bindings.created` не только пишутся в store, но и
  попадают в производные chat surfaces;
- проверяем, что system folders не разваливаются после realtime updates;
- проверяем, что backend folder contracts остаются источником counters, а не
  fallback-логика от старых Zulip projections.

Результат фазы:

- папки и состав чатов начинают стабильно жить на realtime-контракте;
- можно сворачивать часть временных refresh/fallback путей.

### Phase 6. Runtime manager for all project-runtimes

Цель: перейти от одного active runtime к общему менеджеру всех
project-runtimes.

Что делаем:

- создаем manager, который умеет держать runtime registry;
- один runtime registry entry = один `ownerKey`;
- manager решает:
  - какие рантаймы активны;
  - какой из них `active surface`;
  - какие из них `background surface`;
  - как делать promotion/demotion при переключении активного проекта;
- transport core переиспользуется без fork-а;
- background surface на этом шаге может пока:
  - только держать соединение;
  - только двигать cursor;
  - только собирать диагностическое состояние;
  - но не писать в `messengerStore`.

Результат фазы:

- архитектура перестает быть одноразовой под active path;
- база готова к дальнейшему расширению background сценариев.

Важно:

- это именно фаза про orchestration;
- не надо в нее тащить сразу полный background unread/notification apply.

### Phase 7. Background projection v1

Цель: минимально полезный background path без полного chat-state apply.

Эта фаза намеренно отложенная.

Что делаем:

- вводим отдельную lightweight projection store для background surfaces;
- решаем, какие event kinds реально нужны background path;
- background не пишет в `messengerStore`;
- background может:
  - обновлять unread indicators;
  - сохранять cursor;
  - готовить cache warming;
  - собирать материал для notification layer.

Результат фазы:

- background runtime становится полезным, но не ломает active UI path.

### Phase 8. Background improvements and cache warming

Цель: расширить background без смешивания обязанностей.

Это уже фаза улучшений, а не базовой реализации.

Примеры:

- background cache update для chat/folder snapshots;
- более умный unread refresh;
- подготовка данных для notification effects;
- selective cold-start acceleration.

Эта фаза не должна тормозить запуск базового active WebSocket.

## Рекомендуемый порядок первых итераций

Если запускать работу через оркестратор в ближайших итерациях, безопасный
порядок такой:

1. `Phase 0`
2. `Phase 1`
3. `Phase 2`
4. `Phase 3`
5. `Phase 4`
6. `Phase 5`
7. только потом `Phase 6+`

Почему так:

- сначала нужна надежная база курсора и ownership;
- потом живой active runtime;
- потом корректность message/chat/folder apply;
- и только после этого есть смысл расширяться в background orchestration.

## Как делить работу между саб-агентами

Ниже предложена раскладка, чтобы оркестратор потом мог раздать фазы параллельно
с минимальным конфликтом по файлам.

### Agent A. Transport and cursor base

Зона:

- `shared/api/messenger-realtime.api.ts`
- новый `shared/lib/workspace-realtime/*`
- `entities/workspace-runtime/*`

Фазы:

- `Phase 0`
- `Phase 1`
- transport часть `Phase 2`

### Agent B. Active apply path

Зона:

- `entities/messenger/*`
- active realtime applier

Фазы:

- apply часть `Phase 3`
- `Phase 4`
- часть `Phase 5`

### Agent C. Layout orchestration

Зона:

- `widgets/layout/*`
- route/runtime startup

Фазы:

- hook/manager часть `Phase 2`
- `Phase 6`

### Agent D. Tests and diagnostics

Зона:

- `*.test.ts`
- диагностические helpers
- smoke-checklist

Фазы:

- поперечная поддержка `Phase 1-6`

## Definition of done для базового WebSocket

Базовый WebSocket можно считать собранным, когда выполнены все пункты ниже:

- active Workspace runtime делает `REST catch-up -> WebSocket`;
- cursor живет отдельно по project-runtime owner;
- дубли и unknown events не ломают runtime;
- stale runtime не может писать в state после owner switch;
- `message/stream/topic/folder/folder_item` проходят через единый active apply
  path;
- открытый чат обновляется live без дублей;
- папки и список разговоров получают базовые realtime updates;
- старый Zulip event loop не участвует в Workspace route data flow.

Background full-featured runtime в это definition of done не входит.

## Проверка после каждой фазы

Минимальная проверка:

```bash
npm run typecheck
npm run test --workspace=web
```

Итоговая целевая проверка для интеграционных фаз:

```bash
npm run typecheck
npm run test
```

Ручной smoke для active runtime:

- login в Workspace account;
- open project messenger route;
- cold start с уже существующим cursor;
- incoming message в открытый чат;
- incoming message в другой чат;
- edit/delete message;
- folder update;
- project switch;
- account switch;
- reload и catch-up без дублей.

## Прямые запреты

Во время реализации этого плана нельзя:

- строить отдельный background transport stack вместо общего core;
- писать background events в `messengerStore`;
- смешивать Workspace realtime events со старыми Zulip stores как с source of
  truth;
- считать runtime scope просто по `accountId`, игнорируя `projectId`;
- пропускать owner/runtimeGeneration checks на финальных write boundaries;
- тащить background improvements в первую active-итерацию.

## Связь с общим migration-планом

Этот документ не заменяет
`docs/WORKSPACE_MESSENGER_MIGRATION_PLAN.md`.

Связь такая:

- общий migration-план отвечает за весь Workspace messenger move;
- этот документ отвечает за отдельную execution-схему realtime/WebSocket слоя;
- при конфликте по realtime-целям приоритет у backend contract и у
  project-scoped runtime model.
