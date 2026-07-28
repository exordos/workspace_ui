# User Store Cutover Plan

Дата среза: 2026-07-02.

Backend contract сверялся с локальным backend repo
`../workspace_backend` на ветке `workspace-backend`:

- `docs/workspace_api.md`;
- `docs/workspace_ui_realtime_integration.md`.

Этот документ фиксирует план жесткого разреза старой Zulip user-модели и
переезда на новый user store поверх Workspace-контрактов. Цель не в том, чтобы
аккуратно сохранить старый `entities/user` как долгий совместимый слой, а в том,
чтобы явно удалить старую модель и восстановить нужные обязанности уже на
Workspace контрактах.

Главное решение: `messengerStore.usersById` считаем временным состоянием
переходного периода, а старый `entities/user` считаем устаревшей Zulip-моделью
с числовыми `user_id`. Целевой источник правды по пользователям - отдельный
`entities/user`, построенный вокруг `user_uuid` и Workspace API.

## Правила исполнения этой миграции

- Главный агент только оркестрирует работу. Код и документы меняют отдельные
  исполнители по фазам, чтобы не смешивать анализ, реализацию и чистку.
- В этой миграции действует отдельное исключение по комментариям: если в
  изменяемом коде или тестах действительно нужен поясняющий комментарий, он
  пишется по-русски простым языком. Лишние комментарии не добавляем.
- Фаза 0 не меняет продуктовый код. Ее выход - уточненный план и список мест,
  которые следующий исполнитель будет переводить, удалять или выносить.

## Цель

- Удалить старую Zulip user-модель как источник истины:
  - `packages/web/src/entities/user/user.model.ts`;
  - Zulip presence/status API вокруг `/users/me/presence`,
    `/users/{id}/status`, `/users/me/status`;
  - зависимости UI и доменных слоев от числового `user_id` там, где экран уже
    должен жить в Workspace-пути.
- Создать новый user store:
  - пользователи по `uuid`;
  - профиль;
  - presence/status;
  - `lastPingAt`;
  - состояние загрузки;
  - точечные и пакетные обновления.
- Убрать пользователей из `messengerStore` как долгоживущее состояние.
- Перевести Workspace sidebar, header, right panel, composer, profile surfaces
  на новый user store.
- Вернуть индикаторы online/offline в личных Workspace чатах через единый
  источник данных.

## Не цель

- Поддерживать старый Zulip user store как совместимый слой.
- Маппить `user_id` в `user_uuid` через эвристики.
- Кормить Workspace UI данными из Zulip endpoints.
- Прятать поломки старых Zulip-поверхностей за временными заглушками.
- Старый Zulip status/user cache не переносим как есть; новый Workspace
  user-cache выделяем отдельной подфазой или фазой.
- Делать polling основным live-механизмом presence. Backend уже отдает
  `user.updated`; refresh нужен только как страховка bootstrap/reconnect.

## Жесткие правила

- Пользователи идентифицируются только через `uuid`.
- Старые числовые `user_id` не должны попадать в новый user store.
- UI не владеет синхронизацией пользователей и не ходит в users API.
- Синхронизация живет в отдельном слое рядом с Workspace runtime/bootstrap.
- `messengerStore` хранит ссылки на пользователей, например `directUserUuid` и
  `streamBinding.userUuid`, но не хранит профиль пользователя как свою доменную
  ответственность.
- Чистые projection/helper функции не должны неявно читать Zustand store.
  Если им нужны пользователи, они получают user snapshot или resolver явным
  параметром.
- Если после удаления старого store что-то ломается, фиксируем это как место,
  которое нужно перевести на Workspace contract, а не возвращаем Zulip store.

## Политика user-cache и SWR

- Для нового `entities/user` нужен отдельный Workspace user-cache, а не
  messenger catalog cache.
- Профильные и directory поля пользователя можно поднимать из кеша как stale
  данные: `uuid`, `username`, `displayName`, `firstName`, `lastName`, `email`,
  `avatarUrl`, `createdAt`, `updatedAt` и похожие поля.
- Live presence/status нельзя считать актуальными из кеша при старте:
  `active`, `idle`, `offline`, `do_not_disturb`, `lastPingAt`, `statusEmoji`,
  `statusText`, если эти поля отражают текущую presence/status-семантику.
- При старте читаем user-cache, наполняем user store stale/profile данными и
  параллельно делаем `GET /users/`; ответ API обновляет user store и
  user-cache.
- Realtime `user.updated`, refresh, reconnect и visibility обновляют и store,
  и cache.
- Если API недоступен, профиль можно показывать из stale cache, а live status
  должен быть `unknown`, `offline` или `stale` по явно выбранному правилу, но
  не "online из кеша".

## Что делает старый Zulip user store

Текущий `packages/web/src/entities/user/user.model.ts` обслуживает больше, чем
просто список пользователей. Перед удалением нужно понимать, какие обязанности
мы намеренно теряем.

### Профили и аватары

- хранит `Map<number, UserRecord>`;
- мержит sender metadata из старых Zulip messages;
- хранит `full_name`, `email`, `avatar_url`, `role`, `is_active`;
- строит `avatarMap` для старого chat-list;
- возвращает display name по числовому user id.

### Presence

- хранит presence как `{ status: "active" | "idle", timestamp }`;
- обновляет presence по `user_id`;
- обновляет presence по email через `emailToUserId`;
- связан со старым realm presence polling.

### Custom status

- хранит Zulip custom status:
  - текст;
  - emoji;
  - away;
  - состояние загрузки;
  - retry/backoff;
  - invalid user negative cache.
- ходит в Zulip `/users/{id}/status`;
- ходит в Zulip `/users/me/status` для своего статуса.

### Возможности текущего пользователя

- хранит `currentUserChannelCapabilities`;
- хранит `currentUserMessageEditPolicy`;
- эти поля по смыслу не являются user directory. При удалении store их надо
  вынести в отдельную Workspace capability/policy модель или в существующий
  auth/runtime слой.

### Старые потребители

На срезе зависимости от `entities/user` есть в:

- старом `chat-list`;
- старом `message-list`;
- mention popover и mention dropdown;
- composer mentions;
- settings personal info;
- legacy right panel/layout hooks;
- logs/activity/feed pages;
- старом presence polling и reconnect fallback.

Удаление store должно подсветить эти места. Для Workspace-пути их надо
перевести, для явно legacy-пути - удалить или оставить временно сломанными до
отдельного решения.

## Целевая модель

Новый store остается в сущности `user`, потому что после разреза пользовательская
модель в проекте должна быть одна:

```text
packages/web/src/entities/user/
  user.types.ts
  user.model.ts
  user-adapters.lib.ts
  user-selectors.lib.ts
  user-sync.lib.ts
  user.test.ts
```

Минимальные типы:

```ts
export type UserUuid = string;

export type UserPresenceStatus = "active" | "idle" | "offline" | "do_not_disturb";

export type UserLoadStatus = "idle" | "loading" | "ready" | "error";

export interface User {
  uuid: UserUuid;
  username: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  status: UserPresenceStatus;
  statusEmoji: string | null;
  statusText: string | null;
  lastPingAt: string;
  createdAt: string;
  updatedAt: string;
}
```

Минимальное состояние:

```ts
interface UsersStoreState {
  usersById: Record<UserUuid, User>;
  userIds: UserUuid[];
  loadStatus: UserLoadStatus;
  error: string | null;
  lastLoadedAt: number | null;
  lastRefreshedAt: number | null;

  replaceUsers: (users: User[], loadedAt?: number) => void;
  upsertUsers: (users: User[], updatedAt?: number) => void;
  upsertUser: (user: User, updatedAt?: number) => void;
  markOffline: (userUuid: UserUuid, updatedAt?: number) => void;
  setLoadStatus: (status: UserLoadStatus, error?: string | null) => void;
  getUser: (userUuid: UserUuid) => User | undefined;
  clear: () => void;
}
```

Инварианты:

- `userIds` содержит каждый uuid не больше одного раза;
- `usersById[uuid].uuid === uuid`;
- более старый `updatedAt` не должен перетирать более свежий профиль;
- `status` всегда один из Workspace API статусов;
- `statusEmoji` и `statusText` хранят custom presence из Workspace API;
- `lastPingAt` считается обязательным backend-полем;
- `do_not_disturb` хранится как доменный статус, а в UI мапится на нужный
  visual state;
- отсутствие пользователя в store не создает фантомную запись без server data.

## Источники обновления

### Bootstrap

Текущий messenger bootstrap уже получает `users` через `GET /users/`.

Целевое поведение:

```text
messenger bootstrap response
        ↓
adaptUserDto
        ↓
user store upsertUsers/replaceUsers
        ↓
messenger store получает только streams/topics/bindings/folders/conversations
```

После этого `MessengerBootstrapPayload.users` надо убрать или считать
временным полем до завершения переноса.

### Realtime

Backend уже отдает user realtime через `user.updated`. Отдельного
`presence.updated` по актуальной документации нет: изменение presence приходит
как полный user snapshot.

```text
user.updated
```

Что нужно на frontend:

- расширить `WorkspaceRealtimeEvent` типом `{ type: "user", kind: "user.updated", user }`;
- добавить нормализацию REST catch-up payload kind `user.updated`;
- добавить user applier, который вызывает `upsertUser`;
- оставить `GET /users/` refresh только как страховку на bootstrap/reconnect,
  а не как основной live-механизм.

### Локальная presence текущего пользователя

Старый `shared/lib/presence.ts` сейчас репортит в Zulip `/users/me/presence`.
Для Workspace backend уже дает отдельную точку:

```http
POST /api/messenger/v1/users/{user_uuid}/actions/presence/invoke
```

Тело:

```json
{
  "status": "active",
  "emoji": "coffee",
  "text": "Focusing"
}
```

Правила:

- отправлять примерно раз в 30 секунд, пока пользователь подключен;
- `status` принимает `active`, `idle`, `offline`, `do_not_disturb`;
- `emoji` и `text` необязательны: если поле пропущено, backend сохраняет
  предыдущее значение; если `null`, очищает значение;
- backend обновляет `last_ping_at`;
- worker переводит пользователей с устаревшим `last_ping_at` в `offline`;
- изменения presence приходят всем пользователям через `user.updated`.

## Граница с messenger store

Из `entities/messenger` надо вынести:

- `MessengerUser`;
- `usersById`;
- `userIds`;
- `adaptMessengerUser`;
- запись `payload.users` в messenger state.

Оставить в messenger store:

- `directUserUuid`;
- `streamBinding.userUuid`;
- `ownerUuid`;
- `userUuid` на streams/topics/messages;
- все ссылки на пользователей как UUID.

Проекции, которым нужны имена или статусы, получают явный user snapshot:

```ts
selectWorkspaceSidebarView(messengerState, {
  usersById,
});

selectWorkspaceChatHeaderView(messengerState, {
  usersById,
});

selectWorkspaceRightPanelView(messengerState, {
  usersById,
});
```

Так store не смешиваются неявно, а UI остается подписанным на минимальные
кусочки состояния.

## Индикаторы в личных чатах

Целевая цепочка:

```text
stream.isPrivate + stream.directUserUuid
        ↓
sidebar projection marks row as directPrivate
        ↓
projection resolves partner from user store
        ↓
row renders avatar/name/presence
```

Для UI нужен общий helper:

```ts
function resolveWorkspacePresenceVisual(
  status: UserPresenceStatus | null,
): "active" | "idle" | "offline" | null;
```

Маппинг:

- `active` -> `active`;
- `idle` -> `idle`;
- `do_not_disturb` -> `idle` или отдельный visual, если дизайн его поддержит;
- `offline` -> `offline`;
- `null` -> нет индикатора или offline по продуктовой договоренности.

## Фазы миграции

### Фаза 0. Инвентаризация перед удалением

Результат:

- список всех импортов `~/entities/user/*`;
- список всех записей в `useMessengerStore.usersById`;
- решение по каждому потребителю:
  - удалить вместе с legacy;
  - перевести на новый user store;
  - вынести в отдельную capability/policy модель;
  - временно оставить как известный compile break.

Команда для старта:

```bash
rg -n "entities/user|useUsersStore|UserStatus|UserPresence|usersById" packages/web/src docs
```

## Инвентаризация фазы 0

Срез выполнен 2026-07-02 командами:

```bash
rg -l "~/entities/user/|useUsersStore|UserStatus|UserPresence" packages/web/src
rg -l "MessengerUser|usersById|userIds|adaptMessengerUser" packages/web/src/entities/messenger packages/web/src/shared/lib/workspace-messenger-cache-db.ts packages/web/src/pages/chat/chat-page-workspace-message.adapter.ts packages/web/src/pages/chat/chat-page-workspace.ui.tsx packages/web/src/widgets/right-panel/right-panel-workspace-info.ui.tsx packages/web/src/features/create-chat/create-chat-dialog.hook.ts packages/web/src/widgets/layout/layout-right-panel-shell.hook.ts
rg -l "/users/me/presence|/realm/presence|/users/\\$\\{.*\\}/status|/users/me/status|refreshRealmPresenceFromApi|applyRealmPresenceResponseToUsers|initPresenceTracker|setPresenceReporter|shared/lib/presence|fetchUserStatus|fetchOwnStatus|updateOwnStatus" packages/web/src
```

Итог по масштабу:

- 116 файлов в `packages/web/src` прямо импортируют или используют старый
  `entities/user`, `useUsersStore`, `UserStatus` или `UserPresence`;
- 18 файлов держат долгую messenger-модель пользователей через `MessengerUser`,
  `usersById`, `userIds`, `adaptMessengerUser` или cache rows;
- 20 файлов связаны со старым Zulip presence/status API и локальным
  `shared/lib/presence.ts`.

### Перевести на новый user store

Workspace-поверхности первой очереди, которые сейчас читают пользователя из
`messengerStore.usersById`:

- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx` - подписывается на
  `state.usersById` и передает snapshot в адаптер сообщений;
- `packages/web/src/pages/chat/chat-page-workspace-message.adapter.ts` -
  берет имя автора из `usersById[message.authorUuid]`;
- `packages/web/src/entities/messenger/messenger-chat-header.lib.ts` - строит
  имя, avatar и online count личного чата из `state.usersById`;
- `packages/web/src/entities/messenger/messenger-sidebar.lib.ts` - строит
  подписи sidebar, кеширует `usersById` и резолвит автора последнего сообщения;
- `packages/web/src/entities/messenger/messenger-right-panel.lib.ts` - строит
  direct/private profile и участников из `state.usersById`;
- `packages/web/src/widgets/layout/layout-right-panel-shell.hook.ts` - берет
  `workspaceUsersById` из `useMessengerStore` и прокидывает в right panel;
- `packages/web/src/widgets/right-panel/right-panel-workspace-info.ui.tsx` -
  берет `workspaceUsersById` из `useMessengerStore`, считает участников,
  presence и status labels;
- `packages/web/src/features/create-chat/create-chat-dialog.hook.ts` - сейчас
  одновременно читает старый `useUsersStore` и `workspaceUsersById`; Workspace
  поиск пользователей должен остаться только на новом user store.

Старые `useUsersStore`-потребители, которые выглядят нужными для Workspace UX и
должны получить новый `uuid`-store вместо числового `user_id`:

- `packages/web/src/widgets/top-bar/top-bar-profile-trigger.ui.tsx`;
- `packages/web/src/widgets/right-panel/right-panel-user-menu.ui.tsx`;
- `packages/web/src/features/create-chat/create-chat-dialog.hook.ts`;
- `packages/web/src/features/create-chat/create-chat-dialog.ui.tsx`;
- `packages/web/src/features/add-stream-members/add-stream-members-dialog.ui.tsx`;
- `packages/web/src/widgets/message-composer/message-composer-mentions.hook.ts`;
- `packages/web/src/widgets/message-composer/message-composer-mention-dropdown.ui.tsx`;
- `packages/web/src/widgets/right-panel/right-panel-workspace-info.ui.tsx`;
- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`;
- `packages/web/src/pages/chat/chat-page-workspace-message.adapter.ts`.

### Удалить legacy

Старые Zulip user/status/presence пути, которые нельзя переносить как есть в
Workspace store:

- `packages/web/src/entities/user/api/user.api.ts` - `reportPresence`,
  `fetchUserStatus`, `fetchOwnStatus`, `updateOwnStatus` ходят в
  `/users/me/presence`, `/users/{id}/status`, `/users/me/status`;
- `packages/web/src/entities/user/api/user.api.orchestrator.ts` и
  `packages/web/src/entities/user/api/user-status-write.lib.ts` - очередь и
  запись старого custom status по числовому `user_id`;
- `packages/web/src/entities/user/user-status.hooks.ts`,
  `packages/web/src/entities/user/user-status.lib.ts`,
  `packages/web/src/entities/user/user-status-label.ui.tsx` - Zulip-shaped
  custom status UI/helpers;
- `packages/web/src/shared/lib/user-status-cache-db.ts` и upgrade для
  `userStatusCache` - старый cache статусов, не входит в эту итерацию;
- `packages/web/src/shared/api/zulip-users.ts` - `fetchRealmPresence()` для
  `GET /realm/presence`;
- `packages/web/src/widgets/layout/layout-presence-polling.hook.ts`,
  `layout-realm-presence-refresh.lib.ts`,
  `layout-zulip-presence-apply.lib.ts`,
  `layout-reconnect-coordinator.lib.ts` - старый polling/reconnect refresh
  presence;
- `packages/web/src/shared/lib/event-loop.ts` - Zulip event types
  `"presence"` и `"user_status"`;
- `packages/web/src/widgets/right-panel/right-panel-user-menu.ui.tsx` - пишет
  свой custom status через старый `updateOwnStatus`;
- `packages/web/src/main-app.tsx` - подключает `shared/lib/presence.ts` к
  `reportPresence()` из старого user API.

Legacy-поверхности, которые после жесткого удаления скорее всего надо удалить
или явно оставить как известный разлом до отдельного решения:

- старый `chat-list` и DM preview helpers;
- старый `message-list` author presence/status, mention popover и reactions;
- `search-modal`, `feed`, `activity`, `logs`;
- `settings-personal-info-page` как Zulip profile/status page;
- старый right panel (`right-panel-user.ui.tsx`, `right-panel-info.ui.tsx`,
  `right-panel-dm-group.ui.tsx`).

### Вынести в другую модель

Не все поля старого `entities/user/user.model.ts` являются user directory:

- `currentUserChannelCapabilities` нужен для прав на управление участниками.
  Его надо вынести в capability/policy модель или runtime/auth слой, а не
  класть в новый user store;
- `currentUserMessageEditPolicy` нужен для прав редактирования сообщений.
  Его надо вынести вместе с политиками текущего пользователя;
- `shared/lib/presence.ts` сейчас смешивает локальную активность пользователя и
  отправку presence на сервер. Локальный activity tracker можно оставить как
  отдельную shared-механику, но сетевой reporter должен быть Workspace-native;
- `pages/logs/diagnostics-collect.lib.ts` читает локальный idle/presence state
  из `shared/lib/presence.ts`. После разделения локального tracker и сетевого
  reporter diagnostics должны остаться привязаны только к локальному tracker;
- `features/user-profile/user-profile.api.ts` сейчас просто оборачивает
  старые `fetchOwnStatus/updateOwnStatus`. Его надо либо перевести на реальный
  Workspace profile/status contract, либо пометить как unsupported/read-only;
- `shared/lib/stream-member-management-permissions.lib.ts` должен получать
  capability snapshot явным параметром, а не зависеть от старого user store.

### Риск compile break

- Удаление старого `entities/user` сразу ломает широкий пласт: найдено 116
  файлов с прямыми ссылками на `useUsersStore`, `UserStatus`, `UserPresence`
  или файлы `~/entities/user/*`.
- Много тестов создают пользователей через числовой `user_id`; новый store на
  `uuid` потребует переписать фабрики и ожидания, особенно в `message-list`,
  `right-panel`, `settings`, `chat-list`, `create-chat`.
- Нельзя массово заменять все `userIds`: в проекте есть unrelated числовые DM
  `userIds` для старого Zulip unread/read/typing путей. Их надо отделять от
  Workspace `user_uuid`.
- `MessengerUser` нельзя удалить из `messenger.types.ts` до перевода
  bootstrap, cache, header/sidebar/right-panel и chat-page adapter, иначе
  разлом будет слишком широким для одной фазы.
- `snapshot.users` и `WorkspaceMessengerUserCacheRow` считаем хвостом старого
  messenger cache. Users должны быть удалены из messenger cache layer; новый
  Workspace user-cache нужен как отдельная подфаза или фаза для
  `entities/user`, а не как часть messenger catalog.
- `create-chat-dialog.hook.ts` уже смешивает старый `useUsersStore` и
  `messengerStore.usersById`; это высокий риск двойного источника правды при
  частичном переносе.
- `WorkspaceRealtimeEvent` и `WorkspaceMessengerEventPayloadDto` сейчас не
  принимают `type: "user"` / `payload.kind === "user.updated"`. Фаза realtime
  должна менять типы, проверку входных данных, нормализацию REST catch-up и
  тесты вместе, иначе backend-события будут тихо отбрасываться парсером.
- Если фаза 1 сразу меняет публичную форму `useUsersStore` на uuid-only store,
  общий `typecheck` ожидаемо сломается на старых потребителях. Исполнитель
  должен либо держать временную заглушку только для компиляции без старого
  владения данными, либо объединять store/bootstrap/Workspace UI перевод в один
  зеленый разрез.

### Фаза 1. Новый user store

Задачи:

- удалить старую Zulip-реализацию внутри `entities/user`;
- добавить новую реализацию `entities/user` на Workspace-контрактах;
- добавить адаптер из `WorkspaceMessengerUserDto`;
- обновить frontend DTO под backend поля `status_emoji`, `status_text` и
  обязательный `last_ping_at`;
- добавить store с `replaceUsers`, `upsertUsers`, `upsertUser`, `markOffline`,
  `clear`;
- добавить selectors/helpers:
  - display name;
  - presence visual;
  - users by ids;
  - online count for member uuids.
- покрыть store unit-тестами.

Граница качества:

```bash
npx vitest run packages/web/src/entities/user
```

На одной только фазе 1 общий `typecheck` является обязательным только если
исполнитель сохранил совместимость старых потребителей только для компиляции
или включил в тот же разрез перевод потребителей первой очереди. Иначе общий
`typecheck` запускать как диагностику масштаба разлома, а условие слияния
переносить на совмещенный зеленый разрез фаз 1-3.

### Фаза 2. Bootstrap и API sync

Задачи:

- bootstrap после `getUsers` пишет пользователей в user store;
- messenger bootstrap перестает держать users как свою долгую модель;
- добавить `user-sync.lib.ts` для:
  - initial users apply;
  - refresh all users;
  - load user by uuid;
  - cancellation/owner guard через runtime generation.
- ошибки загрузки users отражать в user store, а не в UI-компонентах.

Риск:

- сейчас `adaptMessengerBootstrapPayload` возвращает users. Удалять это поле
  лучше после перевода header/sidebar/right panel, иначе будет слишком широкий
  разлом за один шаг.

### Фаза 3. Перевод Workspace UI

Потребители первой очереди:

- `chat-page-workspace.ui.tsx`;
- `messenger-chat-header.lib.ts`;
- `messenger-right-panel.lib.ts`;
- `right-panel-workspace-info.ui.tsx`;
- `messenger-sidebar.lib.ts`;
- `sidebar-workspace.ui.tsx`;
- `create-chat-dialog.hook.ts`.

Что меняется:

- header берет DM partner и online count из user store snapshot;
- right panel берет участников и статусы из user store snapshot;
- sidebar получает `directUserUuid`, display name/avatar/presence для личных
  чатов;
- create-chat ищет пользователей в user store, а не в
  `messengerStore.usersById`.

### Фаза 4. Realtime и refresh presence

Задачи:

- расширить `WorkspaceRealtimeEvent` событием `user.updated`;
- добавить нормализацию REST catch-up `payload.kind === "user.updated"`;
- добавить отдельный applier для user events;
- подключить user applier в Workspace realtime manager вместе с messenger
  applier;
- подключить Workspace presence reporter:
  - `POST /api/messenger/v1/users/{user_uuid}/actions/presence/invoke`;
  - интервал около 30 секунд;
  - active/idle/offline/do_not_disturb;
  - request fields `emoji`/`text`, которые backend сохраняет как
    `status_emoji`/`status_text`.

Важно:

- refresh должен жить в runtime/sync слое, не в sidebar/header/right panel;
- `user.updated` больше не contract gap. Его надо поддержать, иначе presence
  в UI будет устаревать при рабочем backend.

### Фаза 5. Жесткая чистка старой реализации `entities/user`

Задачи:

- удалить старые Zulip-файлы внутри `packages/web/src/entities/user`;
- удалить Zulip user status/presence API, если уже нет legacy-потребителей;
- удалить старый user status IndexedDB cache или вынести его в отдельную задачу;
- убрать docs references, которые называют `useUsersStore` актуальным store;
- починить compile breaks через Workspace-native модели или удалить legacy
  surfaces.

Ожидаемые поломки:

- старый message-list author presence;
- mention popover/dropdown;
- settings personal info;
- old chat-list avatar map;
- old right panel profile;
- logs/activity/feed display names;
- старый presence polling.

Критерий решения:

- если surface нужен в Workspace, переводим на новый user store;
- если surface относится к удаляемому Zulip path, удаляем или явно выводим из
  маршрутизации;
- если surface пока не имеет Workspace backend contract, ставим видимый
  unsupported/read-only state.

### Фаза 6. Чистка messenger users

Задачи:

- удалить `MessengerUser` из `messenger.types.ts`;
- удалить `usersById/userIds` из `messenger.model.ts`;
- удалить tests, которые проверяют users внутри messenger store;
- перевести cache layer: users не хранить в messenger cache; новый user-cache
  делать отдельно для user store.

Критерий:

- `rg -n "usersById|MessengerUser|adaptMessengerUser" packages/web/src/entities/messenger`
  не должен находить долгоживущую user-модель внутри messenger.

## Разбиение для параллельных исполнителей

### Исполнитель A. Store + типы

Область:

- `entities/user/*`;
- адаптеры;
- unit-тесты.

Выход:

- новый store;
- selectors;
- тесты инвариантов.

### Исполнитель B. Bootstrap + sync

Область:

- `messenger-bootstrap.lib.ts`;
- Workspace runtime/bootstrap hooks;
- `user-sync.lib.ts`;
- `shared/api/messenger.types.ts`;
- API calls `getUsers`, `getUsersPage`, `getUser`.

Выход:

- users из bootstrap попадают в user store;
- refresh/load by uuid готовы;
- учтен runtime generation/cancellation.

### Исполнитель C. UI-проекции

Область:

- sidebar;
- header;
- right panel;
- create chat.

Выход:

- private chat rows показывают presence;
- header/right panel больше не читают messenger users;
- UI подписывается на user store минимальными селекторами.

### Исполнитель D. Удаление legacy и починка разломов

Область:

- `entities/user`;
- старые imports;
- docs references;
- tests.

Выход:

- старый store удален;
- compile breaks разобраны;
- не возвращены Zulip user API fallback.

### Исполнитель E. Realtime/presence contract

Область:

- `shared/api/messenger.types.ts`;
- `entities/messenger/messenger-realtime-applier.lib.ts`;
- `shared/lib/workspace-realtime/*`;
- новый user realtime applier.
- Workspace presence reporter.

Выход:

- `user.updated` применяется в user store;
- локальная presence отправляется в Workspace API, а не в Zulip API;
- fallback refresh остается только как страховка reconnect/bootstrap.

## Проверка

Минимальный набор после каждой фазы:

```bash
npm run typecheck
npx vitest run packages/web/src/entities/user
npx vitest run packages/web/src/entities/messenger
npx vitest run packages/web/src/widgets/sidebar
npx vitest run packages/web/src/widgets/right-panel
npx vitest run packages/web/src/pages/chat
```

Финальный gate:

```bash
npm run check
```

Ручная проверка:

- открыть Workspace private chat;
- увидеть avatar/name/status партнера в sidebar;
- увидеть status партнера в header;
- открыть right panel личного чата;
- переключить пользователя active/idle/offline через backend/test fixture;
- проверить, что status меняется без перезагрузки, если realtime contract
  подключен;
- проверить reconnect/visibility resume, если включен временный refresh.

## Открытые решения

- Нужен ли отдельный avatar URL в Workspace user DTO или он приходит через IAM
  позже.
- Как продуктово отображать `do_not_disturb`: отдельный цвет/иконка или `idle`.
- Удаляем ли settings personal info вместе со старым Zulip path или переводим
  его на Workspace profile.
- Нужен ли отдельный user IndexedDB cache после стабилизации runtime.

## Рекомендуемый первый разрез

Первый рабочий разрез должен быть небольшим, но архитектурно правильным:

1. Заменить старую реализацию `entities/user` на новую и покрыть тестами.
2. Наполнить store из текущего messenger bootstrap.
3. Перевести только Workspace header/sidebar/right panel на новый store.
4. Убрать чтение `messengerStore.usersById` из этих поверхностей.
5. После этого дочистить старые Zulip-файлы внутри `entities/user` и чинить
   compile breaks без возврата к Zulip user-модели.
