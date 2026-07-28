# Workspace Messenger Migration Plan

Дата среза: 2026-06-30.

Этот документ фиксирует технический план жесткого переезда мессенджера с Zulip
API на новый Workspace Messenger API. Новый курс: сначала одним проходом
собираем весь Workspace API слой, затем удаляем Zulip API как источник данных
для мессенджера. Где Workspace backend еще не дает нужную ручку, frontend не
подставляет резервный Zulip-путь, а заводит явную заглушку и запись в список
пробелов backend contract. Целевой UI остается прежним основным chat-shell, без
отдельной продуктовой страницы Workspace messenger.

## Входные данные

- Текущая рабочая ветка: `workspace-api`.
- Старая ветка для анализа: `platform-messanger`.
- Локальный backend проект: `../workspace_backend` относительно frontend repo,
  ветка `workspace-backend`.
- Актуальные backend docs сначала смотреть локально:
  - `../workspace_backend/docs/workspace_api.md`
  - `../workspace_backend/docs/workspace_ui_realtime_integration.md`
- GitHub docs использовать как запасной источник, если локального backend repo нет.
- Текущая модель фронта: FSD, React, Zustand, `shared/api/zulip-*`,
  `entities/chat-list`, `entities/message`, `features/folder-sync`,
  `widgets/layout/*zulip-event-loop*`.

## Короткий вывод

На ветку `platform-messanger` переключаться не стоит. Она полезна как черновик,
но ее нельзя брать целиком:

- разница с текущей веткой очень большая: больше 1000 файлов, примерно 29k
  добавлений и 48k удалений;
- она переименовывает часть `zulip-*` в `messenger-*`, но оставляет много
  Zulip-подобной модели внутри;
- часть кода уже знает про `stream_uuid`, `topic_uuid`, IAM token и
  `/api/messenger/v1`, но часть продолжает ожидать `anchor`, `narrow`,
  `message_ids`, `num_before`, `num_after`, `queue_id`;
- realtime в ветке уже ближе к новому `epoch_version`, но нормализует только
  `message.created` и пропускает folder events, хотя backend docs требуют
  общий поток `message`, `folder`, `folder_item`.

Правильный путь: не переносить ветку, а использовать ее как набор заготовок.
Начинаем с жесткого API-среза, затем auth/runtime, доменная модель и только
после этого подключение данных к текущим UI-поверхностям через явные
props/adapters.

## Product decisions

Эти решения считаются базовыми для дальнейшего плана:

- Workspace backend - единственный целевой источник данных для frontend.
- Zulip backend для frontend считается удаляемым. Если нужна миграция данных из
  Zulip в Workspace, ее обслуживает backend, а не UI.
- Переход начинается с API-слоя: `shared/api/zulip-*` и все Zulip-shaped
  messenger endpoints удаляются из нового пути до подключения UI.
- В новом messenger path не допускается резервный путь через Zulip API. Если
  Workspace ручки нет, рядом с Workspace API facade заводится явная заглушка с
  понятным именем, диагностикой и ссылкой на пункт из списка пробелов backend
  contract.
- Заглушка лучше скрытого поведения: UI может временно отключить действие или
  получить контролируемую ошибку `unsupported`, но не должен незаметно идти в
  Zulip.
- Основной chat-shell и старый визуальный UX остаются единственной целевой
  поверхностью миграции. Отдельную Workspace page не держим даже как временный
  продуктовый route: Workspace routes подключаются к старой странице через
  отдельный data bridge.
- Workspace composer подключается через старую нижнюю зону и старый
  `MessageComposer`. Для Workspace routes старый composer получает явный
  capabilities contract: Workspace-backed действия включаются через новые
  handlers, а неподдержанные Zulip-backed действия остаются видимыми, но
  возвращают контролируемую заглушку без Zulip API вызова.
- На Workspace messenger routes старый Zulip data flow отключается: event loop,
  folder-sync, unread/read sync и записи в Zulip-shaped stores не должны быть
  источником данных для этой поверхности.
- Новый frontend code path не обязан сохранять Zulip routes, stores или API
  контракты, если они мешают правильной Workspace-модели.
- Главный runtime scope мессенджера - project внутри organization. Organization
  остается верхней границей аккаунта/доступа, но чаты, realtime, кеши, unread и
  folders должны быть привязаны к project.
- Один пользователь может быть участником нескольких projects внутри одной
  organization.
- Несколько аккаунтов в приложении остаются базовым сценарием, как и в текущем
  frontend. Нельзя проектировать новую модель как "одно приложение = один
  аккаунт".
- Каждый runtime context должен явно фиксировать account/organization/project/
  user. Любой запрос, кеш, realtime loop и store write должны понимать, к какому
  account/project они относятся.

## Architecture baseline

Текущая архитектурная идея фронта правильная: Feature-Sliced Design с направлением
зависимостей `app -> pages -> widgets -> features -> entities -> shared`.
Физически структура в `packages/web/src` этой идее соответствует:

- `app` - роутинг, провайдеры, верхний запуск приложения;
- `pages` - route-level экраны;
- `widgets` - крупные блоки интерфейса: layout, sidebar, message-list,
  composer, right-panel;
- `features` - пользовательские сценарии: folder-sync, mute-chat, pin-chat,
  create-chat, settings;
- `entities` - Zustand stores, доменные модели, entity-level API;
- `shared` - транспорт, утилиты, конфиги, UI-примитивы.

Что уже хорошо:

- pre-FSD директории удалены;
- слайсы физически разложены по слоям;
- в `packages/web/src` не найдено barrel-only `index.ts`;
- импорты в основном идут из конкретных segment files;
- крупная shell-оркестрация сосредоточена в `widgets/layout`, а не размазана по
  всем страницам.

Что соблюдается не строго:

- ESLint сейчас не запрещает FSD boundary violations, он ловит порядок и
  дубли импортов, но не слойность;
- `shared` местами импортирует верхние слои: например entity/feature types или
  stores. Для нового кода так делать нельзя;
- `entities` местами импортируют другие entities: `chat-list` знает про
  `user/message`, `message` знает про `user`, `unread-sync` знает про
  `chat-list/instance`;
- `features` местами завязаны друг на друга: `pin-chat` на `folder-sync`,
  `folder-sync` на `pin-chat`, `move-topic-to-stream` на `mark-topic-resolved`;
- `widgets` местами завязаны друг на друга: `layout` знает про sidebar/top-bar/
  right-panel/search-modal, top-bar знает про right-panel/search-modal;
- мессенджерная модель протекла во все слои как Zulip shape:
  `MockMessage`, `ZulipRawMessage`, `stream_id`, `subject`, `dmKey`,
  `display_recipient`, `queue_id`, `narrow`.

Вывод: текущая FSD-форма пригодна как каркас, но для Workspace-переезда нельзя
продолжать стиль "каждый слой сам адаптирует backend". Нужна отдельная строгая
зона нового мессенджера.

## Migration architecture rules

Эти правила обязательны для каждой следующей итерации миграции.

### 0. Agent orchestration

Большие фазы миграции ведем через отдельные agent contexts:

- одна большая фаза = один новый agent context;
- агент фазы сначала читает этот документ, `AGENTS.md` и актуальные backend docs;
- агент фазы не переносит решения из старых Zulip-паттернов без явного пункта в
  плане;
- фаза не начинается с кода, пока не описаны current flow, backend contract,
  target model, compatibility/cut line и tests;
- разные агенты не должны редактировать одни и те же файлы без явного ownership;
- если фаза затрагивает несколько крупных зон, она делится на подфазы с
  отдельными write scopes.

Базовые крупные фазы:

1. Workspace API inventory и жесткий API-срез.
2. Auth/bootstrap/runtime identity.
3. Workspace domain model.
4. Realtime/unread/read/folders/notifications.
5. Routes/UI shell/sidebar/message surfaces.
6. Cleanup: удаление dead stores, old routes и old tests.

### 1. Workspace data flow inside the existing chat shell

Миграция больше не строится как долгая поддержка двух равноправных потоков.
Старый Zulip поток можно держать только как временно живой код до удаления, но
Workspace messenger path не должен читать данные из него. Целевой UI один:
основной chat-shell. Главный способ держать код ревьюируемым - сначала отрезать
API источник, затем подключать домен и UI к уже Workspace-native данным.

Целевой поток:

```text
Workspace auth -> runtime context -> Workspace API -> adapters -> domain store -> selectors -> UI
```

Старый поток:

```text
Zulip auth -> Zulip API/queue -> Zulip-shaped stores/adapters -> current UI
```

Правила:

- новый Workspace API facade строится сразу как замена, а не как тонкая обертка
  над `zulip-*`;
- после API-среза новый messenger code path не импортирует
  `shared/api/zulip-*`;
- основной chat-shell подключается к Workspace-потоку секциями: login/runtime,
  routes, sidebar, message-list, composer, realtime;
- отдельная Workspace page не считается допустимой UI-поверхностью; Workspace
  routes должны открывать старый chat-shell и старые визуальные секции;
- Workspace routes могут временно ломать основной экран во время миграции, если
  это помогает быстрее отрезать старый source-of-truth;
- когда для сценария нет Workspace ручки, добавляется явная unsupported-заглушка
  и пункт в backend gaps; не добавляем скрытый резервный Zulip-путь;
- composer send/edit/delete/mark-read в Workspace path идут через
  `entities/messenger` actions и Workspace message UUID. Старый `MockMessage`
  допускается только как view-adapter для старой `MessageList`; Workspace данные
  не записываются в старые Zulip message/chat-list stores.
- запрещено делать гибридный source of truth, где один store одновременно
  считает основой `ZulipRawMessage` и Workspace `stream_uuid/topic_uuid`;
- временная совместимость допустима только на границе секции и должна иметь
  понятный cut line: какой старый input принимает, какую новую domain model
  отдает и когда удаляется;
- review нового кода начинается с вопроса: "к какому потоку относится этот
  файл?". Если ответ "оба", значит нужна отдельная adapter/facade граница.

Практический смысл: новый код должен быть понятен без глубокого знания старой
Zulip-модели. Старый поток служит работающим приложением на время миграции, но
не является архитектурной основой для Workspace messenger.

### 2. Backend-native identity

Source-of-truth identity:

- organization/project/user берутся из IAM/Workspace auth context;
- project - основной scope для messenger runtime, кешей, unread, folders и
  realtime cursor;
- разговор = stream или topic поверх stream;
- личка = stream с `private: true`;
- групповых Zulip-DM сущностей в новой модели нет;
- message identity = backend message UUID;
- realtime cursor = `epoch_version`;
- folder identity = backend folder UUID / folder item UUID.

Запрещено в новом коде:

- создавать отдельный frontend `dmId` как долгоживущий source-of-truth;
- хранить новую личку под `dm:*`;
- использовать `display_recipient` или набор user ids как основной ключ
  разговора;
- делать маршруты и кеши, которые зависят от stream name вместо UUID.

### 3. Thin product projection, not raw DTO in UI

Raw DTO backend живет только в API/adapter зоне. UI и stores не должны принимать
сырые `Workspace*Dto` напрямую.

Минимальная проекция для UI:

```ts
type MessengerConversation = {
  id: string; // stream:<stream_uuid> or topic:<stream_uuid>:<topic_uuid>
  streamUuid: string;
  topicUuid?: string;
  title: string;
  audience: "channel" | "private";
  isPrivate: boolean;
  unreadCount: number;
};
```

`audience: "private"` - только продуктовая метка для UI. Источник истины все
равно `stream.private`.

### 4. Layer placement for new Workspace messenger code

Новый код кладем так:

```text
shared/api/messenger-*       raw REST/WebSocket calls, DTO guards, no Zustand, no React
entities/messenger/          domain projection, ids, stores, selectors
features/<scenario>/         user actions: send, read, mute, pin, folders
widgets/*                    dumb UI props/callbacks only
pages/*                      route composition and page-level wiring
widgets/layout               runtime orchestration only while processes layer is absent
```

Если сценарий начинает требовать shared orchestration между несколькими features,
сначала выносим use-case/helper в `entities/messenger` или отдельный feature
facade. Не добавляем widget-to-widget или feature-to-feature coupling без явного
решения в плане.

### 5. Compatibility is isolated

Старые Zulip формы не являются fallback для Workspace messenger. Они могут
остаться только как временная route/UI compatibility, пока физически удаляются
старые экраны и тесты:

- `/stream/:slug` и `/dm/:id` могут жить как переходные routes только если это
  ускоряет фазу. Сохранять их ради совместимости не требуется;
- `MockMessage` может жить только как adapter для текущих widgets;
- `ZulipRawMessage` не должен попадать в новые Workspace stores;
- `dmKey`, `stream_id`, `subject`, `narrow`, `queue_id` не должны появляться в
  новых Workspace domain types.
- `shared/api/zulip-*` не должен вызываться из нового messenger API facade,
  use-case или store.

Каждая фаза миграции должна явно говорить, какой старый Zulip-инвариант она
убирает или изолирует.

### 6. Stores own state, widgets render state

Widgets не принимают архитектурные решения:

- sidebar не строит conversations из raw messages;
- message-list не решает, где read boundary source-of-truth;
- composer не знает транспорт отправки;
- top-bar/header не вычисляют org/runtime ownership.

Виджеты получают готовые props и вызывают callbacks. Оркестрация живет в
entity/feature/layout helpers.

### 7. Ownership and async safety are part of the architecture

Любой async write после await обязан быть привязан к owner context:

- account id;
- active instance id;
- organization id;
- project id;
- user uuid;
- runtime/active-org generation;
- abort signal.

Паттерн: capture context -> await -> verify context -> write store/cache.
Нельзя расширять новый realtime или bootstrap без этой проверки.

### 8. One source per surface

Для каждой поверхности заранее фиксируем источник истины:

- conversations/sidebar - Workspace streams/topics + backend unread projection;
- messages - Workspace messages endpoint + realtime events;
- folders - Workspace folders/folder_items;
- org unread indicator - отдельная org-level projection;
- user/profile/header - auth/user context, не messenger message store;
- notifications - policy layer над realtime events, не widget side effect.

Если backend contract не покрывает surface, не имитируем его бессистемно на
фронте. Либо заводим временный compatibility adapter, либо добавляем вопрос к
backend contract.

### 9. Iteration template

Каждый следующий кусок миграции описываем по одному шаблону:

1. Current frontend flow: какие файлы, stores, routes, API, кеши участвуют.
2. Backend contract: какие Workspace endpoints/events закрывают сценарий.
3. Target model: какие domain types/selectors нужны.
4. Compatibility: что временно оставляем из Zulip.
5. Cut line: какой старый инвариант удаляем или изолируем.
6. Tests: unit/adapter/store/realtime cases.
7. First diff: минимальная правка, которую можно проверить отдельно.

## Orchestrated phase map

Этот срез собран после read-only анализа отдельных agent contexts. Каждая фаза
ниже должна выполняться в новом контексте, с явным ownership файлов.

### Phase 1. Workspace API inventory и жесткий API-срез

Цель: одним проходом собрать весь Workspace Messenger API facade и удалить
Zulip API из нового messenger path.

Current flow:

- `shared/api/zulip-*` остается главным транспортом сообщений, bootstrap,
  history, flags, server settings и realtime;
- часть текущих `messenger-*` файлов уже знает про `/api/messenger/v1`, но это
  не полный API facade и местами сохраняет Zulip-shaped output;
- `entities/chat-list`, `entities/message`, `features/folder-sync` и layout
  helpers еще могут опираться на `MockMessage`, `ZulipRawMessage`, `narrow`,
  `stream_id`, `subject`, `dmKey`.

Target:

- `shared/api/messenger-*` покрывает все ручки из backend docs:
  `server_settings`, `folders`, `folder_items`, `streams`,
  `stream_bindings`, `stream_topics`, `messages`, `events`, `epoch`, `users`,
  `me`;
- каждая REST ручка возвращает typed DTO + pagination metadata, если endpoint
  коллекционный;
- REST events и WebSocket frames нормализуются в один `WorkspaceRealtimeEvent`;
- отсутствующие действия представлены как явные unsupported actions, например
  `markMessageUnreadUnsupported`, `addReactionUnsupported`,
  `uploadAttachmentUnsupported`;
- новый messenger path не импортирует `shared/api/zulip-*`.

First diff:

- пройти backend docs и составить endpoint -> frontend use case table в этом
  документе;
- добавить/обновить Workspace DTO guards и client methods для всех доступных
  endpoints;
- добавить unsupported-заглушки для списка пробелов, чтобы вызов был явным и
  диагностируемым;
- заменить импорты нового messenger path с `zulip-*` на `messenger-*`;
- удалить или изолировать старые Zulip API modules из messenger сборки;
- покрыть contract tests на snake_case DTO, pagination headers,
  RESTAlchemy errors и unsupported actions.

Cut line:

- API слой больше не возвращает `MockMessage`, `ZulipRawMessage`, numeric ids,
  `narrow`, `anchor`, `num_before`, `num_after`, `queue_id`.
- Любой не покрытый backend сценарий идет в явную заглушку, а не в Zulip.

### Phase 2. Auth/bootstrap/runtime identity

Цель: заменить Zulip-instance как runtime owner на Workspace runtime context.

Current flow:

- `main-app.tsx` и `shared/api/client.ts` сейчас прокидывают active
  `ZulipInstance` в общий API pipeline;
- `entities/instance/instance.model.ts` хранит `realm/email/apiKey/userId` и
  `activeOrgEpoch`, но не знает project;
- `pages/login/*` сохраняют Zulip `apiKey`/session как основу аккаунта;
- `widgets/layout/layout-zulip-event-loop.hook.ts` делает bootstrap через
  `fetchUsers`, `fetchSubscriptions`, `getCurrentUser`, `registerQueue`;
- current user частично живет в `chat-list`, а не в auth/runtime identity.

Target:

- `WorkspaceRuntimeContext` включает `accountId`, `organizationId`, `projectId`,
  `userUuid`, `accessToken` и `runtimeGeneration`;
- несколько аккаунтов - обычный сценарий, не исключение;
- cursor/cache/request keys включают минимум `accountId`, `organizationId`,
  `projectId` и `userUuid`;
- current user, profile и permissions читаются из auth/runtime identity, не из
  messenger stores.

First diff:

- добавить типы Workspace auth/runtime context;
- добавить owner guards: capture -> await -> verify -> write;
- добавить bearer auth builder без Basic;
- покрыть тестами смену account/org/project/user/generation и `AbortSignal`;
- не подключать это сразу к старому layout.

Cut line:

- `activeOrgEpoch` остается legacy guard;
- новая защита строится вокруг `accountId`, `organizationId`, `projectId`,
  `userUuid`, `runtimeGeneration` и `AbortSignal`.

### Phase 3. Workspace domain model

Цель: поставить доменную модель поверх нового Workspace API, без возврата к
Zulip-shaped state.

Current flow:

- `shared/api/zulip.types.ts` задает `ZulipRawMessage`, `MockMessage`,
  `MockStream`, numeric `user_id/stream_id`, `subject`, `display_recipient`;
- `shared/api/zulip-messages.ts` грузит сообщения через `anchor`, `narrow`,
  `num_before`, `num_after`;
- `entities/chat-list` строит sidebar из последних Zulip messages;
- `entities/message` хранит `CurrentChatContext` через stream id/topic или
  `dmKey`;
- `features/folder-sync` уже частично Workspace, но chat ids еще
  `stream:<number>` и `dm:*`.

Target:

- `entities/messenger` - domain projection, ids, adapters, selectors;
- domain ids только UUID: `streamUuid`, `topicUuid`, `messageUuid`,
  `folderUuid`, `folderItemUuid`;
- conversation id только `stream:<stream_uuid>` или
  `topic:<stream_uuid>:<topic_uuid>`;
- private stream дает `audience: "private"`, но не создает `dm:*`.

First diff:

- добавить `entities/messenger/messenger.types.ts`,
  `messenger-ids.lib.ts`, `messenger-adapters.lib.ts`;
- добавить unit tests на DTO guards, adapters и id helpers;
- не подключать новый слой к текущему UI/store.

Cut line:

- новые Workspace files не импортируют `ZulipRawMessage`, `MockMessage`, `dmKey`,
  `stream_id`, `subject`, `narrow`, `queue_id`.

### Phase 4. Realtime/unread/read/folders/notifications

Цель: сделать единый Workspace event/cursor/dedupe слой до замены старого
`event-loop.ts`.

Current flow:

- `shared/lib/event-loop.ts` работает через Zulip `register -> queue_id ->
last_event_id -> /events`;
- `layout-zulip-event-dispatch-*` пишет message/unread/inbox/notifications из
  Zulip events;
- `unread-sync` синхронизирует chat-list, instance badge и DM indicator;
- read state идет через Zulip `messages/flags` и `narrow`;
- folder badges частично считаются из sidebar badges;
- notification dedupe завязан на numeric message id и Zulip chat key.

Target:

- cursor: `last_epoch_version` по owner context;
- перед WebSocket всегда REST catch-up по `epoch_version>`;
- REST и WebSocket events проходят один parser/normalizer;
- события сортируются и дедуплицируются по `epoch_version`;
- cursor двигается после applied/skipped event;
- folders/folder_items/folder counters берутся из backend folder contracts;
- notifications дедупятся по `owner + message_uuid/event_epoch`.

First diff:

- добавить Workspace owner/event/cursor/chat-id types;
- добавить parser/normalizer REST events и WS frames;
- добавить cursor helper: key by owner, strict `epoch_version>`, dedupe;
- добавить tests на message/folder/folder_item events, unknown event skip,
  duplicate epoch skip;
- не трогать старый `event-loop.ts` первым diff-ом.

Cut line:

- в новых realtime types нет `queue_id`, `last_event_id`, `narrow`, Zulip
  `flags`, `dm:*`, numeric stream/user ids;
- mark read переносить через Workspace `actions/read/invoke`; mark unread и
  bulk read идут в явные заглушки до появления backend contract.

### Phase 5. Routes/UI shell/sidebar/message surfaces

Цель: перевести route identity и UI boundaries на Workspace project scope,
оставив widgets максимально dumb и сохранив текущий chat-shell как основную
поверхность.

Current flow:

- `app-route-definitions.tsx` содержит `/stream/:streamSlug`,
  `/stream/:streamSlug/topic/:topicName`, `/dm/:dmId`, `/message/:messageId`;
- `widgets/layout/layout.ui.tsx` читает route params, собирает sidebar,
  запускает Zulip loop и right-panel wiring;
- `widgets/sidebar/sidebar.ui.tsx` сам читает router/store и строит
  `/stream/...`/`/dm/...`;
- `pages/chat/chat-page.ui.tsx` совмещает route context, history load, read,
  send/edit/delete, drafts, typing, right drawer;
- `widgets/message-list` рендерит `MockMessage[]`.

Target routes:

```text
/org/:orgId/project/:projectId/messenger
/org/:orgId/project/:projectId/stream/:streamUuid
/org/:orgId/project/:projectId/stream/:streamUuid/topic/:topicUuid
/org/:orgId/project/:projectId/message/:messageUuid
```

Rules:

- `/dm` не является целевой моделью;
- topic route использует `topicUuid`, не topic name;
- message route использует `messageUuid`, потом resolve делает stream/topic
  focus;
- Workspace messenger routes должны показывать основной chat-shell;
- старый Zulip event-loop/folder-sync/read-sync для Workspace routes
  отключается отдельно от решения "показывать shell";
- sidebar/message-list/composer/top-bar получают view models и callbacks;
- route builders/parsers живут в одном helper, а не размазаны по widgets.

First diff:

- зафиксировать helper-семантику: `shouldRenderChatShell` отвечает только за
  отображение shell, а отдельный guard отвечает за legacy Zulip data flow;
- Workspace routes
  `/org/:orgId/project/:projectId/messenger`,
  `/org/:orgId/project/:projectId/stream/:streamUuid` и
  `/org/:orgId/project/:projectId/stream/:streamUuid/topic/:topicUuid`
  показывают основной chat-shell;
- diagnostics routes остаются full-page и не попадают ни в shell, ни в legacy
  data flow;
- sidebar/message-list к Workspace stores подключаются следующими срезами, без
  расширения `entities/chat-list` и `entities/message` под Workspace.

Cut line:

- `streamSlug`, `topicName`, `dmId`, numeric `messageId` не входят в целевую
  route/domain модель.

### Phase 6. Cleanup

Цель: удалить старый Zulip compatibility после того, как Workspace path закрывает
основные сценарии.

Удалять после жесткого API-среза и green tests по фазам 1-5:

- Zulip auth: `fetchApiKey`, Basic auth, old session/CSRF как основной путь;
- Zulip realtime: `registerQueue`, `queue_id`, `last_event_id`;
- Zulip messages: `anchor`, `narrow`, `stream_id`, `subject`,
  `display_recipient`, numeric message/user ids;
- old DM model: `/dm/:id`, `dmKey`, `dm:*` as source-of-truth;
- sidebar из последних raw messages;
- old route redirects, если backend/UI уже дают UUID routes.

## Что изменилось в backend contract

Новый backend contract:

- REST base: `/api/messenger/v1/...`
- WebSocket: `/api/messenger/ws?last_epoch_version=<number>`
- Auth: IAM bearer token, а не Zulip Basic Auth.
- Cursor: `epoch_version`, хранить отдельно на пользователя/проект/инстанс.
- Доставка событий: at-least-once, frontend обязан делать дедупликацию.
- REST catch-up: `GET /events/?epoch_version%3E=<last>&page_limit=500`.
- WebSocket protocol: `["workspace.events.v1", "bearer.<accessToken>"]`.
- Основные сущности из docs: `folders`, `folder_items`, `streams`,
  `stream_bindings`, `stream_topics`, `messages`, `events`, `epoch`, `users`,
  `me`.
- Message payload v1: только markdown.
- IAM token берется через
  `/api/core/v1/iam/clients/default/actions/get_token/invoke`; refresh token
  идет через ту же ручку с `grant_type=refresh_token`.
- `GET /server_settings` публичный и пока возвращает Zulip-like поля, но это
  только discovery surface, не причина тащить Zulip auth/API в новый path.
- Все коллекции используют RESTAlchemy pagination: `page_limit`,
  `page_marker`, response headers `X-Pagination-Limit` и
  `X-Pagination-Marker`.
- Workspace API уже покрывает CRUD для folders, folder_items, streams,
  stream_bindings, stream_topics и messages.
- Folder item pin/unpin покрыт
  `POST /folder_items/{folder_item_uuid}/actions/pin/invoke` и
  `.../unpin/invoke`.
- Stream archive/unarchive и stream notification mode покрыты action ручками.
- Topic rename/delete/create, `toggle_done` и topic notification mode покрыты
  отдельными ручками.
- Message create/update/delete/read покрыты `POST /messages/`,
  `PUT /messages/{message_uuid}`, `DELETE /messages/{message_uuid}` и
  `POST /messages/{message_uuid}/actions/read/invoke`.
- `POST /streams/` теперь создает не только обычные stream, но и direct private
  stream через `direct_user_uuid`. Backend сам ставит `private: true`, создает
  bindings для двух участников и дедуплицирует пару через внутренний
  `private_index`; frontend не отправляет и не хранит `private_index`.
- `POST /streams/{stream_uuid}/actions/add_users/invoke` создает stream
  bindings по ролям (`member`, `owner` и т.д.). Добавленный пользователь
  получает `stream.created`, существующие участники получают
  `stream_bindings.created`.
- Для первой итерации управления участниками frontend отправляет только роль
  `member`: `POST /v1/streams/{stream_uuid}/actions/add_users/invoke` с телом
  `{ "member": ["<user_uuid>"] }`. Не вводим матрицу ролей на frontend, пока нет
  отдельного продуктового решения по ролям.
- Роли stream binding по backend contract: `guest`, `member`, `moderator`,
  `administrator`, `owner`; если роль не передана, backend использует
  `member`.
- Удаление участника идет через
  `DELETE /v1/stream_bindings/{binding_uuid}` и снимает доступ к stream. Только
  удаленный пользователь получает `stream.deleted` и затем `folder.updated` для
  затронутых системных и пользовательских папок. Остальные участники stream не
  получают событие удаления binding, поэтому frontend не должен ждать отдельное
  realtime-событие для удаления чужого binding.
- `stream.created` всегда приходит как полный user stream snapshot. Создание
  stream также порождает `folder.updated` для системных папок: `All chats` и
  `Personal` для private stream или `Channels` для обычного stream.
- `folder.created/folder.updated` приходят полным snapshot с вложенными
  `folder_items`; `folder.deleted` и `folder_item.deleted` содержат только
  удаленный `uuid`.
- Realtime покрывает `stream.created/updated/deleted`,
  `stream_bindings.created`, `topic.created/updated/deleted`,
  `message.created/updated/deleted`, `folder.created/updated/deleted` и
  `folder_item.deleted`.
- WebSocket кадры уже dispatch-ready, а REST `/events/` возвращает raw outbox;
  frontend обязан нормализовать REST catch-up в тот же event shape.

Важное отличие от текущего фронта: `stream_id`, `subject`, `display_recipient`,
`queue_id`, Zulip `flags`, Zulip `narrow` и числовые user ids больше не должны
быть основной доменной моделью.

### Workspace API coverage table

| Backend surface          | Workspace endpoint/event                                                    | Frontend use case                             | Status   |
| ------------------------ | --------------------------------------------------------------------------- | --------------------------------------------- | -------- |
| Server discovery         | `GET /server_settings`                                                      | realm/bootstrap settings                      | есть     |
| IAM token                | `POST /api/core/v1/iam/clients/default/actions/get_token/invoke`            | login/password and refresh                    | есть     |
| Folders                  | `GET/POST/PUT/DELETE /folders/`                                             | folders rail, create/rename/delete folder     | есть     |
| Folder items             | `GET/POST/DELETE /folder_items/`, `pin/unpin` actions                       | add stream to folder, pin/unpin, remove       | есть     |
| Streams                  | `GET/POST/PUT/DELETE /streams/`, archive/unarchive/notifications actions    | channels, private streams, archive, mute mode | есть     |
| Stream bindings          | `GET/PUT/DELETE /stream_bindings/`, `add_users` action                      | participants and access removal               | есть     |
| Topics                   | `GET/POST/PUT/DELETE /stream_topics/`, `toggle_done`, notifications actions | topic list, rename/delete, done, mute/follow  | есть     |
| Messages                 | `GET/POST/PUT/DELETE /messages/`, `read` action                             | history, send, edit, delete, mark read        | есть     |
| Events                   | `GET /events/`, `GET /epoch/`, `WS /api/messenger/ws`                       | catch-up, live updates, reconnect             | есть     |
| Users                    | `GET /users/`, `GET /users/{user_uuid}`                                     | people list, sender/profile projection        | есть     |
| Mark unread / bulk read  | none in current docs                                                        | unread management shortcuts                   | заглушка |
| Reactions                | none in current docs                                                        | emoji reactions                               | заглушка |
| Message star/pin actions | none in current docs                                                        | starred/pinned message actions                | заглушка |
| Uploads/attachments      | none in current docs                                                        | files and media                               | заглушка |
| Typing                   | none in current docs                                                        | typing indicators                             | заглушка |
| Search/activity/previews | none or not specific enough                                                 | search, activity, link previews               | заглушка |

## Решение по личкам

В новой реализации нет отдельной backend-сущности DM, private conversation или
group chat. Source-of-truth для всех разговоров - `stream`.

На фронте:

- обычный канал - stream с `private: false`;
- личка - stream с `private: true`;
- топики есть у всех stream, включая private stream;
- групповых чатов в смысле Zulip group DM в целевой модели нет.
- создать личку = `POST /streams/` с `source_name: "native"`,
  `source: { kind: "native" }` и `direct_user_uuid`;
- повторный create для той же пары пользователей должен вернуть существующий
  private stream, поэтому frontend не должен сам дедуплицировать лички через
  `dmKey` или набор user ids.

Итог: новая доменная модель не должна содержать отдельный `direct/group` chat
kind. Старые `/dm/:id`, `dmKey`, `display_recipient` и наборы user ids остаются
только как временный слой совместимости на время миграции.

## Блокирующие вопросы к backend contract

Перед жестким API-срезом нужно завести явный список пробелов backend contract.
Эти пункты не разрешают оставлять резервный Zulip-путь; они означают, что в
Workspace API facade появляется контролируемая заглушка или временно
отключенное UI-действие:

1. Mark unread / bulk read. Есть `actions/read/invoke` для одного сообщения, но
   нет явной ручки mark unread и массового read по stream/topic.
2. Message reactions. В текущем contract нет reaction endpoints.
3. Message star/pin actions. В message rows есть `pinned/starred`, но action
   ручки для изменения этих флагов не описаны.
4. Uploads and attachments. Старый UI умеет медиа, но docs v1 описывают только
   markdown payload.
5. Typing. В users есть `status`, но нет realtime typing contract.
6. Link previews/rendered HTML. Новый payload canonical markdown, а текущий UI
   местами ждет уже отрендеренный HTML Zulip.
7. Search/activity/inbox. Нужно понять, будут ли отдельные server-side фильтры
   или frontend должен собирать эти экраны из messages/events.
8. Mentions and rich formatting metadata. Нужно проверить, будет ли backend
   отдавать структурные mentions/previews или это остается markdown parsing на
   frontend.

Закрытые вопросы по backend contract:

- read message покрыт `POST /messages/{message_uuid}/actions/read/invoke`;
- edit/delete message покрыты `PUT/DELETE /messages/{message_uuid}`;
- создание/редактирование/удаление streams/topics/folders покрыто CRUD/action
  ручками;
- участники stream покрыты `GET /stream_bindings/` с постраничной загрузкой,
  `POST /streams/{stream_uuid}/actions/add_users/invoke` для добавления и
  `DELETE /stream_bindings/{binding_uuid}` для удаления доступа;
- folder item pin/unpin покрыт action ручками;
- stream/topic notification mode покрыт action ручками.

## Status: Workspace stream participants

Срез на 2026-07-02:

- `getStreamBindingsPage` читает `stream_bindings` постранично через
  `page_limit`, `page_marker` и `X-Pagination-Marker`; loader догружает все
  страницы для stream, включая корректную отметку "загружено" для пустого
  списка.
- `useMessengerStore` хранит stream bindings как Workspace-owned данные и
  умеет удалить один binding через `removeStreamBinding`.
- Entity helper для участников ходит в Workspace API:
  `addWorkspaceStreamMembers` вызывает `add_users/invoke` с ролью `member`,
  `removeWorkspaceStreamMember` удаляет найденный binding по UUID.
- Правая панель Workspace строит список участников из stream bindings и users;
  текущий пользователь не получает действие удаления. Самоудаление в первой
  итерации не поддерживается.
- Workspace UI правой панели показывает реальный блок участников, добавляет
  пользователя по UUID и вызывает entity helpers для add/remove.
- Контекстное меню Workspace stream в sidebar содержит пункт
  "Members/Участники" и открывает общий right panel через `RightDrawerContext`,
  без отдельного API-вызова из меню.
- Ролевая матрица прав и управление ролями намеренно не придуманы на frontend:
  первая итерация добавляет только `member` и не показывает self-remove.

Не блокирующие больше:

- создание обычного stream и direct private stream покрыто `POST /streams/`;
- добавление участников покрыто
  `POST /streams/{stream_uuid}/actions/add_users/invoke`;
- system folder updates после stream/binding изменений приходят через
  `folder.updated`;
- realtime contract покрывает stream/topic/message/folder lifecycle events.

## Что полезно забрать из `platform-messanger`

Брать как идеи или точечные файлы после перепроверки с текущим contract:

- `packages/web/src/shared/config/workspace-api-layout.ts`: константы
  `/api/messenger/v1` и `/workspace/v1`.
- `packages/web/src/shared/api/messenger-auth.ts`: server settings discovery
  через `/api/messenger/v1/server_settings`.
- `packages/web/src/shared/api/messenger-pipeline.internal.ts`: идея отдельного
  messenger pipeline рядом с workspace pipeline.
- `packages/web/src/shared/api/messenger-me-messages.ts`: парсер
  `/messages/` rows с `uuid`, `stream_uuid`, `topic_uuid`, `payload`,
  `read/pinned/starred/is_own`.
- `packages/web/src/shared/api/messenger-streams.ts`: парсеры `streams` и
  `stream_topics`.
- `packages/web/src/shared/api/messenger-private-stream-create.lib.ts`: идея
  builder для `POST /streams/` с `direct_user_uuid`, но переносить только в
  новый Workspace API/actions слой.
- `packages/web/src/widgets/layout/layout-messenger-event-dispatch-folder.lib.ts`:
  семантика применения `folder.created/updated/deleted` и
  `folder_item.deleted`; переписать под `entities/messenger`, не под старый
  `folder-sync`.
- `packages/web/src/shared/lib/event-loop.ts`: заготовка REST catch-up +
  WebSocket на `epoch_version`, включая `stream.created`,
  `stream_bindings.created`, folder events, ack/pong и backoff.
- `e2e/helpers/messenger-api-mock.ts` и `e2e/mocks/messenger-default-responses.ts`:
  можно переиспользовать как основу contract mocks.

Не переносить как есть:

- слепое массовое удаление `zulip-*` из `platform-messanger`; удаление делаем
  здесь через контролируемый API-срез, с заглушками и тестами;
- переименование Zulip event loop в messenger event loop без полной смены
  модели событий;
- старые запросы `anchor/narrow/message_ids/num_before/num_after`, если backend
  docs их не подтверждают;
- сохранение `MockMessage` и `WorkspaceRawMessage` как основной модели
  приложения;
- сохранение `/stream/:slug` и `/dm/:id` как единственной навигационной модели.
  `/dm/:id` в новой модели должен стать compatibility route к private stream.

## Целевая архитектура фронта

Нужно ввести тонкий слой между backend DTO и UI:

```text
shared/api/messenger-*          raw HTTP/WebSocket + parsers + DTO guards
entities/messenger              domain store, selectors, ids, adapters
features/*                      user scenarios: send, mark read, folders
widgets/*                       dumb UI: props, callbacks, no transport logic
```

Минимальные доменные типы:

```ts
type MessengerChatId = string;
type MessengerStreamId = string;
type MessengerTopicId = string;
type MessengerMessageId = string;
type MessengerUserId = string;

type MessengerChat =
  | {
      kind: "stream";
      id: MessengerChatId;
      streamId: MessengerStreamId;
      title: string;
      private: boolean;
    }
  | {
      kind: "topic";
      id: MessengerChatId;
      streamId: MessengerStreamId;
      topicId: MessengerTopicId;
      title: string;
      private: boolean;
    };

type MessengerMessage = {
  id: MessengerMessageId;
  chatId: MessengerChatId;
  authorId: MessengerUserId;
  markdown: string;
  createdAt: string;
  read: boolean;
  pinned: boolean;
  starred: boolean;
  isOwn: boolean;
};
```

Пока backend не дает отдельный `/chats`, `chatId` на фронте можно делать
производным, но только в одном месте:

- stream: `stream:<stream_uuid>`
- topic: `topic:<stream_uuid>:<topic_uuid>`

Отображение "канал или личка" вычисляется из stream `private`. Отдельный `dm:*`
ключ в новой модели не нужен.

## Фазы миграции

### Фаза 0. Contract freeze и карта переносов

Цель: зафиксировать, что именно есть в backend v1 и что можно переносить из
старой ветки. Это короткая подготовка к жесткому API-срезу, а не отдельная
долгая исследовательская фаза.

Работы:

- сохранить рядом с фронтом snapshot backend docs или ссылки на commit/branch;
- составить таблицу endpoint -> frontend use case;
- отметить все unsupported сценарии: mark unread/bulk read, reactions,
  message star/pin actions, uploads, typing, previews, search/activity;
- сделать список файлов из `platform-messanger`, которые переносим точечно.

Готово, когда есть согласованный список API gaps и не осталось ожидания, что
ветку можно просто слить.

### Фаза 1. Жесткий Workspace API-срез

Цель: собрать Workspace API facade для всех текущих backend ручек и удалить
Zulip API как источник данных нового мессенджера.

Работы:

- добавить split files или единый facade для:
  `server_settings`, `folders`, `folder_items`, `streams`,
  `stream_bindings`, `stream_topics`, `messages`, `events`, `epoch`, `users`,
  `me`;
- для коллекций возвращать rows + pagination metadata, а не терять
  `X-Pagination-Marker`;
- нормализовать REST `/events/` и WebSocket frames в общий event type;
- добавить unsupported-заглушки для списка пробелов:
  mark unread/bulk read, reactions, message star/pin actions, uploads, typing,
  previews/search/activity;
- заменить новые messenger imports с `shared/api/zulip-*` на
  `shared/api/messenger-*`;
- удалить или жестко изолировать старые Zulip API modules из messenger path;
- не подключать UI к полусобранному API: сначала facade и tests, потом domain.

Проверка:

- contract tests на все DTO guards и adapters;
- pagination через `page_limit/page_marker` и response headers;
- RESTAlchemy errors мапятся в контролируемые ошибки;
- unsupported actions возвращают явную ошибку/диагностику;
- `rg "shared/api/zulip|ZulipRawMessage|MockMessage|narrow|queue_id"` по новому
  messenger path не находит API-зависимостей.

### Фаза 2. Авторизация, runtime identity и server discovery

Цель: заменить Zulip-instance как runtime owner на Workspace runtime context и
подключить bearer auth к уже собранному Workspace API facade.

Работы:

- добавить IAM token model рядом с текущими instance credentials;
- реализовать login/password -> IAM access/refresh token через
  `/api/core/v1/iam/clients/default/actions/get_token/invoke`;
- реализовать refresh token path;
- заменить server settings discovery на
  `/api/messenger/v1/server_settings` для Workspace org;
- хранить `project_id`, `user_uuid`, token expiry и auth type на instance;
- все request/cache/realtime keys привязать к
  `accountId + organizationId + projectId + userUuid + runtimeGeneration`;
- не трогать основной чатовый UI до завершения API/runtime boundary.

Проверка:

- login/logout;
- refresh access token;
- неверный token не ломает текущую legacy-сессию до ее удаления;
- multi-org/project switch не смешивает auth state.

### Фаза 3. Нейтральная модель identity

Цель: отделить доменную модель фронта от Zulip ids.

Работы:

- ввести `MessengerChat`, `MessengerMessage`, `MessengerUnread`,
  `MessengerEvent`;
- централизовать генерацию временного `chatId`;
- вынести мапперы backend DTO -> domain;
- считать личку private stream, а не отдельным chat type;
- оставить адаптер domain -> старый UI props только на границе widgets/pages.

Проверка:

- `entities/chat-list` больше не принимает raw Zulip/Workspace DTO;
- `entities/message` хранит `chatId`, а не `streamName/topic/dmKey` как
  основной ключ.

### Фаза 4. Read-only sidebar и folders

Цель: показать список чатов/папок из Workspace data внутри основного
chat-shell, но без отправки сообщений.

Работы:

- включить основной chat-shell на Workspace messenger routes;
- отключить старые Zulip side effects для этих routes: event loop, folder-sync,
  read/unread sync и записи в Zulip-shaped sidebar stores;
- строить sidebar из `streams`, `stream_topics`, `folders/folder_items`,
  unread counts;
- убрать сбор sidebar из последних сообщений как основной путь;
- folder badges брать из backend folder/folder_item unread counts;
- применять `stream.created` как добавление нового conversation;
- применять `folder.created/updated/deleted` и `folder_item.deleted` как
  backend snapshot/delete, без пересборки папок из frontend guesses;
- сохранять старый Zulip sidebar только для legacy chat routes.

Проверка:

- `/org/:orgId/project/:projectId/messenger` показывает основной shell;
- refresh страницы;
- org switch;
- folders create/update/delete через realtime или polling;
- нет смешивания rows между организациями.

### Фаза 5. Open chat и message history

Цель: открыть stream/topic и прочитать сообщения через Workspace API.

Работы:

- использовать route
  `/org/:orgId/project/:projectId/stream/:streamUuid` и
  `/org/:orgId/project/:projectId/stream/:streamUuid/topic/:topicUuid`;
- старые `/stream/:slug` и `/dm/:id` оставить переходным compatibility layer;
- грузить history через `/messages/?stream_uuid&topic_uuid&page_limit&page_marker`;
- заменить cache keys на backend UUID keys;
- rendering оставить через существующий MessageList surface, но данные подавать
  через Workspace-specific view model/adapter.

Проверка:

- открыть stream;
- открыть topic;
- reload на прямой ссылке;
- pagination по marker;
- старый route не ломает навигацию.

### Фаза 6. Send message и optimistic state

Цель: отправлять markdown message в Workspace backend.

Работы:

- `POST /messages/` с `stream_uuid`, `topic_uuid`, `payload.kind=markdown`;
- optimistic row должен иметь временный client id, потом заменяться на uuid;
- не использовать Zulip `local_id/queue_id`;
- retry/cancel оставить на уровне message store/use-case.

Проверка:

- own message отображается read/isOwn;
- websocket echo не дублирует optimistic row;
- ошибки отправки не ломают composer.

### Фаза 7. Create stream, direct private stream и participants

Цель: создать обычный канал, личку и добавить участников через Workspace API,
без Zulip DM/group model.

Работы:

- `POST /streams/` для обычного stream с `source_name: "native"` и
  `source.kind="native"`;
- `POST /streams/` с `direct_user_uuid` для лички;
- считать результатом backend stream UUID, а не frontend `dmId`;
- `POST /streams/{stream_uuid}/actions/add_users/invoke` для добавления
  участников по ролям;
- применять realtime side effects: новый участник получает `stream.created`,
  существующие участники получают `stream_bindings.created`, системные папки
  обновляются через `folder.updated`.

Проверка:

- создание private stream для той же пары не создает дубль в sidebar;
- private stream отображается как личка, но остается `stream:*`;
- добавление участника не создает локальный group chat;
- folder badges после create/add users приходят из backend snapshots.

### Фаза 8. Realtime v1

Цель: заменить Zulip queue на Workspace durable events.

Работы:

- хранить `last_epoch_version` по `project_id + user_uuid + instance_id`;
- перед WebSocket всегда делать REST catch-up;
- дедупликация по `epoch_version`;
- один dispatch path для REST catch-up и WebSocket;
- поддержать `message`, `stream`, `stream_binding`, `topic`, `folder`,
  `folder_item`;
- unsupported event логировать и продвигать cursor.

Проверка:

- missed events после reload;
- reconnect без дублей;
- `4401/403` останавливают loop до refresh auth;
- folder updates идут через тот же поток.

### Фаза 9. Read/unread, notifications, activity

Цель: перенести производные поверхности после базового realtime.

Работы:

- mark read делать через
  `POST /messages/{message_uuid}/actions/read/invoke`;
- mark unread и bulk read держать как явные unsupported actions до появления
  backend ручек;
- выбрать один source-of-truth для unread counters;
- перевести app badge/title/sidebar/inbox на `MessengerUnread`;
- activity/starred/mentions делать только после появления server contract или
  явной frontend projection поверх Workspace API;
- notification policy держать вне widgets.

Проверка:

- unread count совпадает в sidebar, title, folders;
- read state не дрейфует после reconnect;
- active/inactive org не смешивают счетчики.

### Фаза 10. Удаление старого Zulip слоя

Цель: убрать compatibility только после покрытия сценариев.

Работы:

- удалить `zulip-*` API modules;
- удалить Zulip queue/register/narrow helpers;
- удалить числовые stream/user id assumptions;
- обновить docs/API_CLIENT_REFERENCE.md и docs/USE_CASES.md;
- оставить ADR с финальной схемой messenger transport.

Проверка:

- `npm run typecheck`;
- targeted vitest по messenger/folders/realtime;
- smoke: login, open chat, send, realtime receive, folder update, org switch.

## Риски

- Старые widgets выглядят переиспользуемыми, но их props завязаны на
  `MockMessage`, `Reaction`, `sender_id`, `subject`, `display_recipient`.
- Если оставить `MockMessage` как центральный тип, новый backend быстро
  превратится в Zulip compatibility layer внутри фронта.
- Folder sync уже работает через Workspace API, но текущие ключи чатов все еще
  исторические (`stream:*`, `dm:*`) и должны быть централизованы. В целевой
  модели private stream тоже должен иметь `stream:*` или `topic:*` ключ, а не
  `dm:*`.
- Multi-org безопасность должна идти через captured owner context и abort
  checks на финальных write-boundaries, иначе новый realtime повторит старые
  race conditions.
- Без контрактов для mark unread/reactions/uploads/typing часть UI придется
  временно отключить или направить в unsupported-заглушки. Оставлять старый
  backend за feature flag для Workspace routes нельзя.

## Первый практический срез

Текущий рабочий срез начинается с жесткого API-среза:

1. Сверить `../workspace_backend/docs/workspace_api.md` и
   `../workspace_backend/docs/workspace_ui_realtime_integration.md`.
2. Собрать `shared/api/messenger-*` для всех supported endpoints/events из
   таблицы выше.
3. Добавить заглушки для unsupported сценариев, без резервного Zulip-пути.
4. Удалить или изолировать `shared/api/zulip-*` из нового messenger path.
5. После этого Workspace messenger routes входят в основной chat-shell.
6. Legacy Zulip data flow для этих routes отключается отдельным guard-ом, а не
   смешивается с решением "показать shell".
7. Sidebar берет read-only view model из `entities/messenger`, но сохраняет
   текущий визуальный UX.
8. Open stream/topic грузит Workspace messages и показывает их в старой зоне
   страницы чата через явный adapter.
9. Send/edit/delete/read подключаются через Workspace API; reactions/mark
   unread/uploads/typing/previews остаются явными unsupported-заглушками до
   появления backend contract.

Главный критерий: пользователь остается в привычном мессенджере, но источник
данных для Workspace routes уже `entities/messenger` и `/api/messenger/v1`, а
не `entities/chat-list`, `entities/message`, `shared/api/zulip-*` и Zulip
queue.
