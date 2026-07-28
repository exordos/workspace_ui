# План удаления Zulip API из Workspace UI

Этот документ фиксирует рабочие правила и порядок итераций для полного удаления
старого Zulip API из фронта. Цель - убрать сам источник старых сетевых запросов,
старые цепочки обработки данных и риск ложных выходов из аккаунта из-за старых
`401` ответов.

## Главная цель

В целевом состоянии Workspace UI не делает запросы в Zulip API и не держит
старый Zulip API как запасной путь.

Основной рабочий путь:

```text
Workspace auth -> Workspace runtime -> Workspace API -> Workspace model/store -> UI
```

Старый путь удаляется:

```text
Zulip instance -> Zulip API -> Zulip-shaped adapters/stores -> UI
```

## Базовые правила

Эти правила имеют приоритет для всех следующих агентов и итераций.

1. Не переносить Zulip как запасной путь.
   Если Workspace-путь чего-то не умеет, нельзя оставлять скрытый вызов в Zulip
   API "пока работает".

2. Если UI еще подключен к Zulip-цепочке, сначала проверить Workspace API.
   Если нужная ручка уже есть, подключаем Workspace API и удаляем Zulip-цепочку.

3. Если Workspace API не покрывает действие, внешний UI можно оставить, но
   только как управляемую заглушку уровня верстки.
   Удаляем все, что ниже UI: старый store, старую модель, старую обработку
   данных, старый API вызов, старые фоновые синхронизации.

4. Заглушка не должна маскироваться под рабочее действие.
   Она должна быть явно отключена, read-only или показывать понятное состояние
   "временно недоступно", но не должна делать сетевой запрос в Zulip.

5. Старые типы не должны закрепляться в новом коде.
   `MockMessage`, `ZulipRawMessage`, `ZulipEvent`, `queue_id`, `narrow`,
   числовые `stream_id`, `message_id`, `user_id` не должны попадать в новые
   Workspace-модули.

6. Если старый код нужен только как источник внешнего вида, копируем внешний
   слой аккуратно, но не тащим его store/API/runtime.

7. Удаление должно идти маленькими итерациями.
   В каждой итерации нужно явно назвать, какие Zulip-запросы перестали быть
   возможны и какие UI-сценарии стали заглушками или перешли на Workspace API.

8. Любой спорный экран выносится в список решений.
   Если непонятно, есть ли Workspace-замена или нужен новый backend-контракт,
   не оставляем Zulip; фиксируем как отдельное решение перед реализацией.

## Критерий готовности

После завершения удаления эти проверки не должны находить рабочие Zulip-вызовы
в production-коде:

```bash
rg "zulipApi|zulipPipeline|shared/api/zulip|ZULIP_API_PATH|/json|/register|/events|/user_uploads" packages/web/src
rg "MockMessage|ZulipRawMessage|ZulipEvent|queue_id|narrow" packages/web/src
```

Допустимые временные исключения должны быть описаны в этом документе или в
отдельном плане с датой и владельцем решения.

## Приоритеты удаления

### 1. Фоновые Zulip-запросы

Первая цель - убрать все, что может стрелять без действия пользователя.
Это снижает риск ложных logout-сценариев и очищает runtime.

Кандидаты:

- `shared/lib/event-loop.ts`
- `shared/api/zulip-queue.ts`
- `shared/lib/event-loop-handlers/*`
- `shared/lib/zulip-event-queue-registry.lib.ts`
- layout hooks, которые запускают Zulip loop, unread sync, presence refresh
- diagnostics, которые читают Zulip queue id
- старые draft/presence/unread hydrate-процессы

Ожидаемый результат:

- нет Zulip `register`;
- нет Zulip long-poll `/events`;
- нет cleanup старой queue;
- старый `401` от Zulip не может вызвать общий logout;
- Workspace realtime остается единственным активным realtime-путем.

### 2. Старый Zulip API client

После снятия фоновых вызовов можно упрощать `shared/api/client.ts`.

Удаляем или заменяем:

- `zulipApi`;
- `refreshZulipApiBase`;
- Basic Auth для Zulip API key;
- Zulip session CSRF;
- Zulip rate-limit gate;
- Zulip timeout для long-poll;
- построение `/json` и `ZULIP_API_PATH`;
- realm media proxy для `/user_uploads`, `/external_content`, `/avatar`,
  `/user_avatars`, если он больше не нужен Workspace-пути.

Важно: если какие-то Workspace dev-proxy helpers еще читают старый
`getCurrentInstance`, их нужно перевести на Workspace runtime/session источник,
а не оставлять legacy instance как общий owner.

### 3. Сообщения, чтение, реакции, файлы

Эти сценарии в основном имеют Workspace API-замену.

Ожидаемый подход:

- сообщения: `/v1/messages/`;
- read/read up to: message/topic/stream read actions;
- реакции: `/v1/message_reactions/`;
- файлы: `/v1/files/` и download action.

Что удалить:

- `shared/api/zulip-messages.ts`;
- `shared/api/zulip-read-state.ts`;
- `shared/api/zulip-upload.ts`;
- `shared/api/zulip-message-send.internal.ts`;
- старые adapters, которые превращают ответ в `MockMessage`;
- старый IndexedDB/cache path, если он обслуживал только Zulip shape.

Если отдельное действие пока не покрыто Workspace API, UI оставляем как
заглушку, а не возвращаемся к Zulip.

### 4. Streams, topics, folders, участники

Workspace API уже имеет отдельные сущности для streams, stream topics,
stream bindings, folders и folder items.

Ожидаемый подход:

- channel/topic CRUD переводить на Workspace API;
- membership переводить на stream bindings / add users actions;
- notification mode переводить на Workspace notification actions;
- старые numeric stream/topic helpers удалять.

Что проверить:

- `features/add-stream-members`;
- `features/remove-stream-members`;
- `features/chat-info`;
- `features/mute-chat`;
- sidebar/right panel actions.

### 5. Users, profile, presence

Workspace-путь должен опираться на UUID-based user state.

Ожидаемый подход:

- список пользователей и профиль читать через Workspace user API/store;
- presence обновлять через Workspace presence action;
- visible user UI не должен читать Zulip realm presence или Zulip users.

Спорные места:

- avatar upload/remove;
- profile settings write;
- custom realm profile fields.

Если Workspace API не покрывает запись профиля или аватара, UI остается как
заглушка или read-only состояние, а Zulip write path удаляется.

### 6. Функции без Workspace-контракта

Эти сценарии нельзя оставлять на Zulip API:

- drafts;
- saved snippets;
- typing indicator;
- read receipts;
- realm emoji;
- custom profile fields, если нет Workspace-источника;
- старые message render endpoints.

Правило:

- если есть быстрая Workspace-замена - подключить;
- если замены нет - оставить внешний UI только как отключенную/пустую заглушку;
- удалить store, API, polling, cache и обработчики старых ответов.

### 7. Старые страницы и совместимость

Отдельно пройти старые маршруты и страницы, которые могли остаться как legacy:

- `pages/chat/*`;
- `pages/message-redirect/*`;
- `pages/calls/*`, если она грузит Zulip messages;
- `widgets/search-modal/*`;
- `entities/chat-list/*`;
- `entities/inbox/*`;
- `entities/activity/*`.

Решение по каждому месту:

- удалить, если больше не является активным Workspace UX;
- переключить на Workspace API/store, если сценарий нужен;
- заменить на заглушку, если сценарий видим, но Workspace-контракта нет.

## Параллельная работа агентами

Эту задачу можно делить между агентами, но только с общими правилами выше.
Каждый агент должен в конце назвать:

- какие Zulip-запросы удалены;
- какие файлы больше не импортируют Zulip API;
- какие UI-сценарии стали Workspace-native;
- какие UI-сценарии стали заглушками;
- какие спорные места требуют решения.

Предлагаемое деление:

```text
Agent A: фоновые процессы, event loop, queue, auth/logout, diagnostics
Agent B: messages/read/reactions/files и связанные stores/cache
Agent C: streams/topics/members/mute/sidebar/right panel
Agent D: unsupported UI заглушки, drafts/snippets/typing/read receipts/profile writes
Agent R: review pass, grep-проверки, тесты, поиск случайных Zulip imports
```

Агенты не должны параллельно менять один и тот же файл без отдельной
координации. Особенно осторожно:

- `shared/api/client.ts`;
- `widgets/layout/layout.ui.tsx`;
- `entities/chat-list/*`;
- `widgets/message-list/*`;
- `pages/chat/*`;
- `i18n/locales/*.json`.

## Порядок ближайших итераций

### Итерация 1. Убрать фоновые Zulip-запросы и logout-риск

Цель:

- остановить Zulip event loop;
- убрать queue register/get/delete;
- убрать старые фоновые presence/unread/draft sync, если они ходят в Zulip;
- убрать или изолировать `401 -> wipeCredentials` от старого Zulip client.

Проверка:

```bash
rg "registerQueue|getEvents|zulip-queue|startZulipEventLoop|setAuthErrorHandler|wipeCredentials" packages/web/src
```

### Итерация 2. Снять прямые `zulipApi.*` вызовы

Цель:

- drafts, typing, mute, message readers, profile/avatar writes либо
  переключить на Workspace API, либо заменить на UI-заглушку;
- удалить прямые импорты `zulipApi` из feature/entity/shared модулей.

Проверка:

```bash
rg "zulipApi\\." packages/web/src
```

### Итерация 3. Снять `zulipPipeline*` и `shared/api/zulip-*`

Цель:

- удалить старые API wrappers;
- заменить живые сценарии на Workspace API;
- убрать старые adapters к `MockMessage` и `ZulipRawMessage`.

Проверка:

```bash
rg "zulipPipeline|shared/api/zulip" packages/web/src
```

### Итерация 4. Убрать старые типы и stores

Цель:

- удалить зависимость активного UI от `MockMessage`, `ZulipRawMessage`,
  `ZulipEvent`, `ZulipUnreadMessagesSnapshot`;
- заменить нужный UI на Workspace view-model;
- удалить старые cache/store helpers, если они обслуживали только Zulip.

Проверка:

```bash
rg "MockMessage|ZulipRawMessage|ZulipEvent|ZulipUnread" packages/web/src
```

### Итерация 5. Финальная чистка `client.ts` и конфигов

Цель:

- удалить Zulip auth/runtime из общего клиента;
- оставить только Workspace API transport;
- удалить env/config, которые нужны только для Zulip API;
- обновить docs, tests и diagnostics.

Проверка:

```bash
rg "ZULIP_API|zulip|Zulip|/json|/user_uploads|queue_id|narrow" packages/web/src docs
```

## Что не делать

- Не оставлять временный Zulip fallback "на всякий случай".
- Не переименовывать Zulip modules в Workspace modules без смены контракта.
- Не подключать Workspace UI к numeric Zulip ids.
- Не чинить unsupported сценарий через старую Zulip ручку.
- Не удалять видимый UI молча, если можно оставить честную заглушку.
- Не считать типовой импорт harmless: старые типы часто тянут старую модель
  обратно в новый код.

## Рабочий формат отчета по итерации

Для каждой итерации фиксировать:

```text
Удалено:
- ...

Переключено на Workspace API:
- ...

Оставлено как UI-заглушка:
- ...

Спорные места:
- ...

Проверки:
- команда: результат
```
