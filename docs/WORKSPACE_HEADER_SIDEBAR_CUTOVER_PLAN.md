# Workspace Header And Sidebar Cutover Plan

Дата среза: 2026-07-02.

Этот документ фиксирует план подключения шапки чата и боковой панели к
Workspace Messenger API. Внешний UI/UX остается прежним: переиспользуем
существующие компоненты, меняем только источник данных, слой проекций и
обработчики действий.

Главное решение: шапку и боковую панель ведем как две связанные, но отдельные
задачи. Сначала подключаем шапку чата и правую панель, потому что там сейчас
есть явный разрыв данных. Затем проверяем и дочищаем боковую панель, где
Workspace-путь уже в основном отделен от старого Zulip-пути.

## Цель

- Шапка чата получает актуальные Workspace-данные:
  - название канала;
  - название темы;
  - количество участников;
  - количество пользователей онлайн;
  - открытие поиска;
  - открытие правой панели с информацией.
- Боковая панель показывает актуальные Workspace-данные:
  - папки;
  - каналы;
  - темы;
  - счетчики непрочитанного;
  - превью последнего сообщения;
  - контекстные действия.
- Старые визуальные компоненты остаются на месте.
- Workspace route не читает и не пишет Zulip-shaped данные.

## Не цель

- Редизайн шапки, боковой панели или правой панели.
- Новая отдельная страница Workspace messenger.
- Скрытый запасной путь через Zulip API.
- Локальная имитация backend-действий, которых нет в Workspace API.
- Полное переписывание `ChatHeader`, `WorkspaceSidebar`, `RightPanel`.
- Подключение полноценного поиска по сообщениям, пока нет Workspace search
  contract.

## Жесткие правила

- Workspace API является единственным источником данных для Workspace routes.
- `shared/api/zulip-*`, `entities/chat-list`, `entities/user` и старые
  numeric ids нельзя использовать как источник истины для Workspace шапки и
  боковой панели.
- Старые компоненты можно использовать только как view layer.
- Если компонентные props явно названы через Zulip-сущности, их можно
  переименовать, но только без видимого изменения UI.
- Оркестрация живет в page/layout/entity слоях, не внутри визуальных строк.
- UI не должен сам ходить в API.
- Если backend contract отсутствует, показываем контролируемое unsupported
  состояние или оставляем действие неактивным. Не добавляем fake save.
- Если в Workspace API или доменной модели пока нет данных для старого UI-поля,
  поле не вырезаем из UI. Показываем точечную временную заглушку уровня
  contract gap, например "Временно недоступно", а не общий empty/loading state.
  Пользователь должен понимать, что данных нет из-за текущего API-контракта, а
  не потому что конкретный чат, канал или пользователь пустой.

## Текущее состояние

### Шапка чата

Файл: `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`.

Что уже есть:

- `WorkspaceChatPage` выбирает текущий stream/topic/conversation из Workspace
  route.
- Название канала и темы уже частично берутся из `useMessengerStore`.
- Используется старый `ChatHeader`.

Проблемы:

- `participantsCount={0}` и `onlineCount={0}` передаются жестко.
- `onOpenSearch` не прокинут.
- `onToggleRightPanel` и `onOpenRightPanel` не прокинуты.
- Правая панель на уровне layout все еще ориентирована на старые
  `streamId/userId` и старую `chat-info` цепочку.

### Правая панель

Файлы:

- `packages/web/src/widgets/layout/layout-right-panel-shell.hook.ts`;
- `packages/web/src/features/chat-info/chat-info.api.ts`;
- `packages/web/src/features/chat-info/chat-info.model.ts`;
- `packages/web/src/widgets/right-panel/*`.

Что важно:

- Старый `chat-info` ходит в `zulip-streams`.
- Его нельзя кормить Workspace UUID как будто это старые числовые ids.
- Визуальные компоненты правой панели можно переиспользовать, но данные должны
  приходить из отдельной Workspace-проекции.
- Срез 2026-07-02: Workspace-ветка правой панели уже берет участников, счетчик
  online и список участников из `stream_bindings` + `users`, а не из старого
  `chat-info`.

### Боковая панель

Файлы:

- `packages/web/src/widgets/sidebar/sidebar-shell.ui.tsx`;
- `packages/web/src/widgets/sidebar/sidebar-workspace.ui.tsx`;
- `packages/web/src/entities/messenger/messenger-sidebar.lib.ts`;
- `packages/web/src/entities/messenger/messenger-sidebar-actions.lib.ts`;
- `packages/web/src/widgets/sidebar/sidebar-workspace-context-menu.ui.tsx`.

Что уже правильно:

- `SidebarShell` берет Workspace folders/streams/topics из
  `useMessengerStore`.
- Превью сообщений берутся через `workspaceMessageStore.messagesById`.
- `WorkspaceSidebar` в основном только рисует готовую проекцию.
- Контекстное меню Workspace отделено от старого меню.
- Срез 2026-07-02: контекстное меню stream получило пункт "Members/Участники",
  который открывает общую правую панель через `RightDrawerContext.openInfo()` и
  не ходит в API из sidebar.

Что нужно проверить:

- Все строки и счетчики получают данные только из Workspace store.
- Нет скрытых обращений к старому `SidebarChat`.
- Нет старых действий, которые вызывают Zulip API.
- Выбор папки, порядок, pinned, unread и preview одинаково работают после
  bootstrap, realtime и reload.

## Workspace source of truth

Основные данные:

- `entities/workspace-auth/workspace-auth.model.ts`
  - текущий account/organization/project/user;
  - bearer token;
  - runtime generation.
- `entities/messenger/messenger.model.ts`
  - streams;
  - topics;
  - stream bindings;
  - conversations;
  - folders;
  - users;
  - unread;
  - last-message pointers.
- `entities/message/message.model.ts`
  - message bodies;
  - message buckets;
  - load status.

API, которые уже есть:

- `getStreams`;
- `getStreamTopics`;
- `getUsers`;
- `getFolders`;
- `getMessagesByUuids`;
- `getStreamBindings`.

Для шапки особенно важен `getStreamBindings({ streamUuid })`: он дает список
участников stream. После адаптации bindings попадают в
`streamBindingIdsByStreamId`.

## Целевая схема для шапки

Нужен отдельный selector/helper, например:

```ts
selectWorkspaceChatHeaderView(state, {
  route,
  currentUserUuid,
  messagesById,
});
```

Минимальный результат:

```ts
interface WorkspaceChatHeaderView {
  channelName: string;
  topic?: string;
  hideTopic: boolean;
  participantsCount: number;
  onlineCount: number;
  rightPanelLabel: string;
}
```

Правила подсчета:

- Для stream route участники считаются по bindings этого stream.
- Для topic route участники тоже считаются по stream bindings.
- Online считается по `usersById[binding.userUuid].status === "active"`.
- Если bindings еще не загружены, показываем `0`, но запускаем догрузку.
- Если backend не может отдать нужные данные для конкретного счетчика или поля,
  не скрываем поле и не показываем обычное "нет данных". Показываем явную
  временную заглушку для этого поля.
- Название stream/topic берется из `streamsById/topicsById`.
- Не используем старый `chat-info` для этих чисел.

## Целевая схема для правой панели

Нужна Workspace-ветка рядом со старой правой панелью:

```text
Workspace route
  -> workspace right-panel selector
  -> RightPanel props
  -> existing RightPanel UI
```

Минимальный результат:

```ts
interface WorkspaceRightPanelView {
  title: string;
  participantsCount: number;
  onlineCount: number;
  members: WorkspaceRightPanelMember[];
  description: string | null;
  topics: { name: string; unreadCount: number }[];
}
```

Первый шаг можно сделать уже без полного списка members:

- шапка открывает правую панель;
- панель получает title/counts/topics;
- список участников можно подключить второй подфазой.

Важно: если текущий `RightPanel` требует числовые `userId`, не надо
притворяться, что Workspace UUID это старые ids. Тогда добавляем тонкий
Workspace adapter или отдельную ветку props.

## Целевая схема для боковой панели

Боковая панель должна остаться такой:

```text
Workspace API
  -> DTO guards
  -> adapters
  -> messenger store
  -> messenger-sidebar selectors
  -> WorkspaceSidebar
```

Допустимые изменения:

- переименовать props, если они явно старые;
- добавить недостающие поля в `MessengerSidebarStreamItem`;
- поправить selector/cache, если данные не обновляются;
- расширить workspace context menu.

Недопустимые изменения:

- ходить в API из `WorkspaceSidebar`;
- писать Workspace-данные в старый `chat-list`;
- использовать старый `SidebarChat` как источник;
- делать отдельный визуальный sidebar.

## Фазы работ

### Фаза 0. Инвентаризация

Цель: зафиксировать реальные текущие связи перед правками.

Зоны:

- `chat-page-workspace.ui.tsx`;
- `chat-header.*`;
- `layout.ui.tsx`;
- `layout-right-panel-shell.hook.ts`;
- `chat-info.*`;
- `sidebar-shell.ui.tsx`;
- `sidebar-workspace.ui.tsx`;
- `messenger-sidebar.lib.ts`;
- `messenger-bootstrap.lib.ts`;
- `messenger-streams.api.ts`.

Выход:

- короткая карта source of truth;
- список мест, где Workspace route еще зависит от Zulip-shaped данных;
- список отсутствующих backend данных.

### Фаза 1. Данные участников для Workspace stream

Цель: чтобы store имел bindings для текущего stream.

Статус 2026-07-02: выполнено.

Работы:

- добавить route-scoped loader для `getStreamBindings(streamUuid)`;
- адаптировать DTO через существующий `adaptMessengerStreamBinding`;
- писать результат в `useMessengerStore.upsertStreamBindings`;
- защититься от устаревшего runtime через `runtimeGeneration`;
- не блокировать первый рендер чата.
- догружать все страницы `stream_bindings` через `page_marker` и
  `X-Pagination-Marker`, включая пустой список как завершенную загрузку.

Возможное место:

- `entities/messenger/messenger-chat-info-loader.lib.ts`;
- или `widgets/layout/layout-workspace-chat-info-sync.hook.ts`, если нужен
  route-level процесс.

Проверки:

- bindings грузятся только для текущего owner;
- при смене org/project старый ответ не применяется;
- повторное открытие того же stream не вызывает лишних запросов без причины.

### Фаза 2. Проекция шапки

Цель: `ChatHeader` получает актуальные Workspace props.

Работы:

- создать selector/helper для Workspace header view;
- убрать жесткие `participantsCount={0}` и `onlineCount={0}`;
- прокинуть `onOpenSearch`;
- прокинуть `onToggleRightPanel`;
- прокинуть `onOpenRightPanel`;
- сохранить текущий внешний вид.

Проверки:

- stream route показывает `#channel`;
- topic route показывает `topic · #channel`;
- счетчики меняются после загрузки bindings/users;
- поиск открывает существующую search modal в workspace mode;
- кнопка info открывает правую панель.

### Фаза 3. Workspace-путь правой панели

Цель: правая панель не зависит от старого `chat-info` на Workspace routes.

Статус 2026-07-02: выполнено для stream participants и topics.

Работы:

- добавить Workspace selector для panel props;
- подключить title/counts/topics;
- подключить Workspace member view из stream bindings/users;
- не использовать `fetchStreamMembers` и `fetchStreams` из Zulip API;
- сохранить старый `RightPanel` UI, если props позволяют.
- add/remove участников проводить через entity helpers, а не из UI напрямую.
- первая итерация добавляет только роль `member`, не вводит матрицу ролей на
  frontend и не поддерживает self-remove.

Проверки:

- открытие/закрытие панели работает из шапки;
- заголовок панели соответствует текущему stream/topic;
- counts совпадают с шапкой;
- topics берутся из `topicsById`;
- на Workspace route нет Zulip HTTP вызовов.

### Фаза 4. Проверка боковой панели

Цель: убедиться, что sidebar полностью Workspace-native.

Статус 2026-07-02: частично выполнено для пункта участников в контекстном меню
stream.

Работы:

- пройти bootstrap state;
- пройти folder rail;
- пройти stream/topic rows;
- пройти preview last message;
- пройти context menu actions;
- проверить, что пункт "Members/Участники" только открывает right panel и не
  запускает API из sidebar;
- пройти unread/pinned/order;
- проверить empty/loading/error states.

Проверки:

- после bootstrap видны актуальные folders/streams/topics;
- после realtime message preview обновляется;
- после self-send preview обновляется;
- после folder changes sidebar не читает старые cache keys;
- контекстное меню вызывает только Workspace actions;
- пункт participants в контекстном меню открывает тот же right panel, что и
  кнопка info в шапке;
- при отсутствии backend support UI показывает controlled unsupported.

### Фаза 5. Тесты и чистка

Цель: закрепить разрез и убрать случайные старые зависимости.

Тесты:

- `chat-page-workspace.test.tsx`;
- новый тест selector для header view;
- новый тест loader для stream bindings;
- `sidebar-shell.ui.test.tsx`;
- `messenger-sidebar.lib.test.ts`;
- тест правой панели Workspace path.

Команды:

```bash
npm run typecheck
npm run test -- --run
```

Если полный тестовый прогон слишком долгий, сначала запускать package-scoped
Vitest по конкретным файлам из `packages/web`.

## Оркестрация через субагентов

Задачу удобно делить на четыре независимые зоны.

### Агент A. Header data and bindings

Scope:

- `entities/messenger/*bindings*`;
- `shared/api/messenger-streams.api.ts`;
- новый loader/hook для bindings;
- тесты loader/store.

Не трогает:

- `WorkspaceSidebar`;
- right panel UI;
- message list.

Выход:

- bindings текущего stream попадают в store;
- есть stale-runtime защита;
- есть тесты.

### Агент B. ChatHeader wiring

Scope:

- `pages/chat/chat-page-workspace.ui.tsx`;
- `widgets/chat-view/chat-header.*`, только если нужны props;
- selector/helper для header view;
- тесты `chat-page-workspace`.

Не трогает:

- API транспорт;
- sidebar context menu;
- старый Zulip chat page.

Выход:

- нет жестких нулей;
- поиск и правая панель открываются;
- UI визуально не меняется.

### Агент C. Workspace right panel

Scope:

- `widgets/layout/layout.ui.tsx`;
- `widgets/layout/layout-right-panel-shell.hook.ts`;
- новая Workspace-ветка panel projection;
- `widgets/right-panel/*`, только если нужен props adapter.

Не трогает:

- старый Zulip `chat-info` behavior для старых routes;
- sidebar rows.

Выход:

- Workspace route не вызывает Zulip `chat-info` API;
- правая панель получает Workspace title/counts/topics.

### Агент D. Sidebar audit and cleanup

Scope:

- `widgets/sidebar/sidebar-shell.ui.tsx`;
- `widgets/sidebar/sidebar-workspace.ui.tsx`;
- `widgets/sidebar/sidebar-workspace-context-menu.ui.tsx`;
- `entities/messenger/messenger-sidebar.lib.ts`;
- связанные тесты.

Не трогает:

- header wiring;
- right panel wiring;
- message store.

Выход:

- подтверждено, что sidebar не читает Zulip-shaped source of truth;
- найдены и устранены оставшиеся точечные старые зависимости;
- тесты покрывают preview/unread/folders/actions.

## Риски

- `RightPanel` может оказаться слишком сильно завязан на числовой `userId`.
  Тогда нужен отдельный Workspace adapter или отдельные props для member list.
- `getStreamBindings` может быть постраничным. Тогда первый вариант должен
  либо догружать страницы, либо честно показывать partial state.
- `users` bootstrap может быть неполным. Тогда online/member list будет зависеть
  от отдельной загрузки users или от backend расширения.
- Нельзя смешивать API gap и реальную пустоту. Если API не отдает данные,
  показываем отдельный текст временной недоступности. Если API отдал пустой
  список, показываем обычный empty state.
- Realtime может обновлять stream binding, но не удалять binding. Нужно сверить
  event contract перед финальной чисткой.
- Search в Workspace mode пока controlled unsupported. Это нормально, но нельзя
  случайно вернуть старый Zulip search.

## Готовность фазы

Фаза считается готовой, если:

- на Workspace route нет новых импортов из `shared/api/zulip-*`;
- нет записи Workspace данных в старые Zulip stores;
- UI внешне не изменился;
- данные шапки и sidebar берутся из Workspace store;
- действия без Workspace backend contract явно отключены или дают controlled
  unsupported;
- есть targeted tests;
- `npm run typecheck` проходит или известна отдельная причина падения.

## Рекомендуемый порядок запуска

1. Агент A делает bindings loader.
2. Агент B подключает `ChatHeader`.
3. Агент C подключает Workspace-ветку правой панели.
4. Агент D проверяет и дочищает sidebar.
5. Основной агент делает итоговую сверку, запускает проверки и фиксирует
   backend gaps.
