# Workspace Forward Message Plan

Дата среза: 2026-07-06.

Документ фиксирует план выноса Workspace-пересылки сообщений из
`ChatPageWorkspace` в отдельную фичу. Это не реализация, а рабочий план для
оркестрации через саб-агентов.

Главное решение: пересылка остается Workspace-native от входа до отправки.
Фича работает с `messageUuid`, `MessengerMessage`, Workspace runtime context,
`useWorkspaceMessageStore`, `useMessengerStore`, `useUsersStore` и Workspace API.
Старый Zulip forward, numeric message id, `MockMessage`, `ZulipRawMessage`,
`fetchMessageById`, `/dm/${numericIds}` и `chat-forward.lib.ts` не используются
как основа или запасной путь.

## Правила итерации

- Главный агент выступает оркестратором: дробит работу, выдает задания,
  принимает результаты и не делает крупную продуктовую реализацию сам.
- Саб-агенты работают по фазам. Параллельно можно запускать только тех, чьи
  файлы не пересекаются.
- Каждый саб-агент в конце пишет короткий отчет: измененные файлы, что готово,
  какие тесты запущены, какие риски остались.
- Если саб-агенту нужен файл из чужой зоны, он не правит его сам, а оставляет
  явную передачу для следующей фазы.
- Для этой итерации действует исключение из общего правила проекта про
  английские комментарии: в новом или измененном продуктовом коде саб-агенты
  должны активно добавлять простые русские поясняющие комментарии.
- Комментарии должны объяснять зачем существует решение, где граница Workspace
  пути и почему нельзя перейти на старый Zulip/numeric путь.
- Комментарии не должны пересказывать очевидный код. В тестах комментарии можно
  делать минимальными.
- Любая неподдержанная часть должна быть видимой и честной. Нельзя добавлять
  тихий запасной путь на Zulip или локальную фальшивую отправку.

## Цель

Сделать переиспользуемую фичу:

```ts
useWorkspaceForwardMessageStore.getState().open({
  messageUuids: ["message-uuid"],
  selectedText: "optional selected text",
});
```

и один общий размещенный диалог:

```tsx
<WorkspaceForwardMessageDialog />
```

Фичу должны уметь вызывать:

- Workspace chat message menu;
- панель выбранных сообщений в Workspace chat;
- `Моя активность -> Избранное`;
- будущие Workspace feed/search/message-page поверхности.

## Не цель первого прохода

- Не чинить полноценную страницу `/project/:projectId/message/:messageUuid`.
- Не переносить весь старый Zulip forward.
- Не менять backend contract.
- Не делать новый общий Select/Combobox.
- Не смешивать Workspace user UUID store со старым numeric user store.
- Не строить отдельную сущность "DM": direct остается `MessengerStream` с
  `directUserUuid` и default topic.

## Текущее состояние

Логика, которую надо вынести из
`packages/web/src/pages/chat/chat-page-workspace.ui.tsx`:

- `PendingWorkspaceForward`;
- `WorkspaceForwardTarget`;
- `forwardSubmitting`;
- `forwardSubmittingRef`;
- `forwardStreamOptions`;
- `forwardTopicOptions`;
- `normalizeSelectedForwardText`;
- `resolveForwardMessages`;
- `buildWorkspaceForwardMarkdown`;
- `resolveDirectForwardTarget`;
- `resolveForwardTarget`;
- `handleSubmitForward`;
- локальный `AppDialogShell` с `ForwardMessageModalBody`.

Существующий `ForwardMessageModalBody` находится в слое `pages`:

- `packages/web/src/pages/chat/chat-page-forward-modal.ui.tsx`;
- `packages/web/src/pages/chat/chat-page.types.ts`.

Фиче нельзя импортировать UI из `pages/chat`, потому что это нарушит FSD
направление зависимостей. UI выбора получателя надо перенести или заново
собрать внутри `features/workspace-forward-message`.

## Целевая структура

```text
packages/web/src/features/workspace-forward-message/
  workspace-forward-message.model.ts
  workspace-forward-message.lib.ts
  workspace-forward-message.ui.tsx
  workspace-forward-message.types.ts
  workspace-forward-message.test.tsx
```

Допускается вынести маленькие чистые тесты отдельно:

```text
packages/web/src/features/workspace-forward-message/
  workspace-forward-message.lib.test.ts
  workspace-forward-message.model.test.ts
```

Импорты наружу идут из конкретных файлов, без barrel `index.ts`.

## Контракт фичи

### Store

```ts
interface WorkspaceForwardMessageOpenRequest {
  messageUuids: readonly MessengerUuid[];
  selectedText?: string;
}

interface WorkspaceForwardMessageState {
  isOpen: boolean;
  messageUuids: MessengerUuid[];
  selectedText: string | undefined;
  isSubmitting: boolean;
  error: string | null;
  open: (request: WorkspaceForwardMessageOpenRequest) => void;
  close: () => void;
  setSubmitting: (value: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}
```

Правила store:

- `open` нормализует `selectedText`, убирает пустые UUID и дубликаты.
- `close` не закрывает диалог во время `isSubmitting`.
- Store не держит `runtimeContext`, users, streams или messages. Он хранит
  только намерение пользователя.
- В actions нужен `logStoreAction`.

### Lib

Чистые функции:

- `normalizeSelectedForwardText`;
- `uniqueForwardMessageUuids`;
- `resolveWorkspaceForwardMessages`;
- `buildWorkspaceForwardMarkdown`;
- `buildWorkspaceForwardStreamOptions`;
- `buildWorkspaceForwardTopicOptions`;
- `findWorkspaceDirectForwardTarget`;
- `resolveWorkspaceForwardTarget`.

Правила lib:

- Markdown строится только из `MessengerMessage`.
- Цитата использует `buildWorkspaceQuoteHeader` и `buildWorkspaceQuoteBlock`.
- Для одного сообщения можно заменить тело цитаты на `selectedText`.
- Для нескольких сообщений `selectedText` игнорируется, чтобы не подменить
  несколько разных сообщений одним выделением.
- Direct target сначала ищет существующий private stream с `directUserUuid` и
  default topic, потом вызывает `createWorkspaceDirectStream`.

### UI

`WorkspaceForwardMessageDialog`:

- читает `isOpen`, `messageUuids`, `selectedText`, `isSubmitting`, `error`;
- получает runtime context из `useWorkspaceAuthStore`;
- runtime context в хуках выводит через примитивные подписки и `useMemo`, а не
  через selector, который каждый раз создает новый объект;
- читает сообщения из `useWorkspaceMessageStore`;
- догружает отсутствующие сообщения через Workspace API;
- применяет догруженные DTO в `useWorkspaceMessageStore`;
- читает streams/topics из `useMessengerStore`;
- читает users/current user из `useUsersStore`;
- показывает target picker;
- отправляет через `sendMessengerMessage`;
- закрывает диалог после успеха;
- показывает ошибку при ошибке и не теряет выбранные сообщения.

## Где размещать диалог

Первый безопасный вариант: разместить в `ChatPageWorkspace` на время миграции.
Это быстро закрывает вынос логики из состояния страницы и не требует менять
layout.

Целевой вариант: один диалог в Workspace messenger shell/layout, чтобы
`activity/starred`, feed, search и будущая message page могли вызывать store без
своего локального диалога.

Практический порядок:

1. В первом изменении можно оставить диалог рядом с chat page, если одновременно
   подключается только chat.
2. Для подключения `activity/starred` диалог уже должен быть поднят на общий
   Workspace shell/layout, который присутствует и на chat, и на activity route.
3. Если общего shell сейчас нет или он слишком рискованный, фаза должна явно
   добавить маленький host-компонент рядом с workspace layout, без изменения
   визуальной оболочки страниц.

## Фазы и саб-агенты

### Фаза 0. Контрольный срез

Саб-агент: `agent-contract-map`.

Задача:

- проверить текущие сигнатуры `sendMessengerMessage`,
  `createWorkspaceDirectStream`, `getMessagesByUuids` и `getMessage`;
- проверить, где сейчас размещается Workspace layout и какие страницы через него
  проходят;
- проверить, какие тесты уже покрывают forward в chat page, activity и feed;
- подтвердить, что `GET /v1/messages/{message_uuid}` и bulk `uuid` lookup
  доступны в текущем клиенте.

Файлы только для чтения:

- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`;
- `packages/web/src/pages/activity/activity-page.ui.tsx`;
- `packages/web/src/pages/feed/feed-page.ui.tsx`;
- `packages/web/src/shared/api/messenger-client.ts`;
- `packages/web/src/shared/api/messenger-messages.api.ts`;
- `packages/web/src/entities/messenger/messenger-message-actions.lib.ts`;
- `packages/web/src/entities/messenger/messenger-create-chat-actions.lib.ts`;
- `../workspace_backend/docs/workspace_api.md`.

Выход:

- короткая карта: какие файлы трогать, какие не трогать;
- рекомендация, где размещать `WorkspaceForwardMessageDialog`;
- список точечных тестов для последующих фаз.

Параллельность: первая фаза, запускается одна.

### Фаза 1. Тестовый каркас фичи

Саб-агент: `agent-forward-tests`.

Задача:

- создать падающие тесты для новой фичи;
- зафиксировать внешний API store и dialog;
- проверить, что фича не требует Zulip/numeric импортов.

Основные файлы:

- `packages/web/src/features/workspace-forward-message/workspace-forward-message.test.tsx`;
- `packages/web/src/features/workspace-forward-message/workspace-forward-message.lib.test.ts`;
- при необходимости test factory рядом с тестом.

Сценарии:

- `open` открывает диалог по `messageUuid`, который уже есть в
  `useWorkspaceMessageStore`;
- отсутствующее сообщение догружается через Workspace API и применяется в store;
- forward в topic вызывает `sendMessengerMessage` с `streamUuid`, `topicUuid`,
  markdown и `includeStreamConversation: false`;
- forward в direct user переиспользует существующий private stream, если у него
  есть default topic;
- forward в direct user вызывает `createWorkspaceDirectStream`, если private
  stream еще нет;
- selected text используется только для одиночного сообщения;
- при ошибке диалог остается открытым и показывает ошибку;
- закрытие во время submit заблокировано;
- тестовая проверка на отсутствие `zulip`, `MockMessage`, `ZulipRawMessage`,
  `fetchMessageById`, `chat-forward.lib`.

Выход:

- красные тесты или тесты с временными `vi.mock`, которые явно описывают
  будущий контракт;
- список ожидаемых экспортируемых имен.

Параллельность: после фазы 0. Не запускать вместе с фазой 2, если оба создают
одни и те же файлы.

### Фаза 2. Store и чистая логика

Саб-агент: `agent-forward-core`.

Задача:

- создать store;
- вынести чистые helper-функции;
- покрыть lib/model тестами;
- не трогать `ChatPageWorkspace` кроме чтения.

Основные файлы:

- `packages/web/src/features/workspace-forward-message/workspace-forward-message.model.ts`;
- `packages/web/src/features/workspace-forward-message/workspace-forward-message.lib.ts`;
- `packages/web/src/features/workspace-forward-message/workspace-forward-message.types.ts`;
- `packages/web/src/features/workspace-forward-message/workspace-forward-message.lib.test.ts`;
- `packages/web/src/features/workspace-forward-message/workspace-forward-message.model.test.ts`.

Границы:

- нельзя импортировать из `pages/chat`;
- нельзя импортировать `chat-forward.lib.ts`;
- нельзя выполнять API-запросы из `lib`;
- нельзя читать Zustand state внутри чистых helper-функций.

Выход:

- успешные тесты для lib/model;
- передача для UI: какие функции вызывать и какие типы target использовать.

Параллельность: можно запускать параллельно с фазой 3 только после
согласования типов. Лучше последовательно после фазы 1.

### Фаза 3. Dialog UI и target picker

Саб-агент: `agent-forward-dialog`.

Задача:

- создать `WorkspaceForwardMessageDialog`;
- перенести `ForwardMessageModalBody` из слоя `pages` в слой `features` или собрать
  эквивалентный target picker внутри фичи;
- подключить загрузку отсутствующих сообщений;
- подключить отправку и direct-stream resolve;
- сохранить текущую визуальную оболочку модалки.

Основные файлы:

- `packages/web/src/features/workspace-forward-message/workspace-forward-message.ui.tsx`;
- `packages/web/src/features/workspace-forward-message/workspace-forward-message.types.ts`;
- `packages/web/src/features/workspace-forward-message/workspace-forward-message.test.tsx`;
- возможно удалить или упростить
  `packages/web/src/pages/chat/chat-page-forward-modal.ui.tsx` только после
  фазы 4.

Правила UI:

- stream/topic options строятся из `useMessengerStore`;
- user list строится из UUID-based `useUsersStore`;
- current user берется из Workspace runtime context, не из numeric user id;
- direct user не должен показывать текущего пользователя;
- default topic для direct stream обязателен;
- ошибки должны быть видимыми в диалоге, а не только в chat page alert;
- все async операции используют `AbortController` или существующий
  runtime-stale механизм.

Выход:

- `WorkspaceForwardMessageDialog` готов к размещению;
- тесты UI проходят;
- список props/callbacks, которые больше не нужны в chat page.

Параллельность: после фазы 2.

### Фаза 4. Упрощение ChatPageWorkspace

Саб-агент: `agent-chat-switch`.

Задача:

- заменить локальную forward-логику на вызов store;
- убрать локальный modal render;
- сохранить поведение single forward и selected messages forward;
- не менять остальную chat page логику.

Основные файлы:

- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`;
- `packages/web/src/pages/chat/chat-page-workspace.test.tsx`;
- возможно удалить
  `packages/web/src/pages/chat/chat-page-forward-modal.ui.tsx`;
- возможно упростить `packages/web/src/pages/chat/chat-page.types.ts`.

Ожидаемый код на странице:

```ts
const openWorkspaceForward = useWorkspaceForwardMessageStore((state) => state.open);

const handleForwardMessage = useCallback(
  (messageUuid: string, selectedText?: string) => {
    openWorkspaceForward({ messageUuids: [messageUuid], selectedText });
  },
  [openWorkspaceForward],
);
```

Для selected messages:

- страница может передать UUID из selection сразу;
- проверка существования сообщений и догрузка уходят в фичу;
- после успешной отправки нужен способ очистить selection.

Очистку выбранных сообщений лучше оформить отдельным явным контрактом:
например, диалог вызывает общий `onForwardSuccess` из host-компонента, а chat
page уже очищает свой selection. Фича не должна превращаться в сервис, который
знает внутреннее состояние конкретной страницы.

Выход:

- chat page больше не содержит `PendingWorkspaceForward`,
  `buildWorkspaceForwardMarkdown`, direct target resolve и submit forward;
- тесты chat page обновлены на новый контракт;
- старые импорты `ForwardMessageModalBody`, `AppDialogShell` для forward и
  `createWorkspaceDirectStream` удалены из chat page, если они больше не нужны.

Параллельность: после фазы 3. Не запускать параллельно с фазой 5, если dialog
еще не смонтирован на общем уровне.

### Фаза 5. Подключение `Моя активность -> Избранное`

Саб-агент: `agent-activity-starred-forward`.

Задача:

- сделать кнопку forward в Workspace-starred ветке рабочей;
- не заставлять activity page знать про adapter;
- сохранить текущий UI списка избранного.

Основные файлы:

- `packages/web/src/pages/activity/activity-page.ui.tsx`;
- `packages/web/src/pages/activity/activity-page.test.tsx`;
- файл host/layout, если общий диалог еще не размещен.

Правило:

```ts
openWorkspaceForward({ messageUuids: [m.uuid] });
```

Фича сама догружает сообщение, если DTO из starred не лежит в
`useWorkspaceMessageStore`.

Тесты:

- клик по forward в Workspace-starred вызывает `open`;
- кнопка больше не no-op;
- activity page не импортирует `adaptMessengerMessage`;
- старый Zulip activity path не меняется.

Выход:

- forward из избранного открывает общий dialog;
- никаких новых Zulip/numeric зависимостей в activity page.

Параллельность: после фазы 3 и решения по размещению диалога.

### Фаза 6. Feed, search и будущая message page

Саб-агент: `agent-forward-surface-map`.

Задача:

- не обязательно реализовывать все поверхности сразу;
- составить маленькую карту следующего шага, где теперь можно вызвать store;
- убрать явные `forwardUnsupported` только там, где общий dialog точно доступен.

Кандидаты:

- `packages/web/src/pages/feed/feed-page.ui.tsx`;
- Workspace search results, когда они будут Workspace-native;
- будущая `/project/:projectId/message/:messageUuid` page.

Правила:

- Feed уже хранит `MessengerMessage`, поэтому может передавать `m.uuid`.
- Search нельзя подключать, если она еще возвращает Zulip-shaped messages.
- Message route нельзя считать готовой страницей только из-за парсера route:
  сейчас `messenger-ids.lib.ts` все еще возвращает `unsupported-message`.

Выход:

- либо маленький patch для feed;
- либо отдельный документ для следующего шага, если поверхность еще не готова.

Параллельность: после фазы 5 или как read-only анализ параллельно с фазой 5.

### Фаза 7. Review и исправления

Саб-агент: `agent-forward-review`.

Задача:

- сделать code review по итоговому diff;
- проверить FSD, владение runtime, импорты, тесты, i18n, комментарии,
  отсутствие запасного пути на Zulip;
- отдельно проверить, что русские комментарии понятны и не маскируют проблему.

Чеклист:

- `features/workspace-forward-message` не импортирует `pages/*`;
- нет `MockMessage`, `ZulipRawMessage`, `fetchMessageById`, `zulip-*`,
  numeric `messageId` в новой фиче;
- direct user работает через UUID;
- runtime context берется из Workspace auth/runtime helpers;
- stale runtime или abort не приводят к отправке не в тот проект;
- ошибки видны пользователю;
- selected text не применяется к нескольким сообщениям;
- tests покрывают topic/direct/missing message/error;
- нет лишнего изменения UI оболочки.

После review отдельный саб-агент `agent-forward-fixes` получает только
подтвержденные замечания и исправляет их узко, без нового рефакторинга.

## Рекомендуемая последовательность запуска

1. `agent-contract-map`.
2. `agent-forward-tests`.
3. `agent-forward-core`.
4. `agent-forward-dialog`.
5. `agent-chat-switch`.
6. `agent-activity-starred-forward`.
7. `agent-forward-surface-map`.
8. `agent-forward-review`.
9. `agent-forward-fixes`, если review нашел проблемы.

Минимальный первый результат:

1. новая фича;
2. chat page использует фичу;
3. activity starred использует фичу;
4. успешные тесты для новой фичи, chat page и activity page.

Feed/search/message page можно оставить следующим шагом, если общее размещение
или текущий тип данных этих поверхностей делает подключение рискованным.

## Проверки

Точечно после фаз:

```bash
npm run test --workspace=web -- --run packages/web/src/features/workspace-forward-message
npm run test --workspace=web -- --run packages/web/src/pages/chat/chat-page-workspace.test.tsx
npm run test --workspace=web -- --run packages/web/src/pages/activity/activity-page.test.tsx
npm run test --workspace=web -- --run packages/web/src/pages/feed/feed-page.ui.test.tsx
```

Финально:

```bash
npm run typecheck --workspace=web
npm run test --workspace=web -- --run packages/web/src/features/workspace-forward-message packages/web/src/pages/chat/chat-page-workspace.test.tsx packages/web/src/pages/activity/activity-page.test.tsx
```

Если затронут общий layout или route shell, дополнительно:

```bash
npm run test --workspace=web -- --run packages/web/src/widgets/layout
```

## Риски

- `ForwardMessageModalBody` сейчас лежит в `pages/chat`; прямой импорт из фичи
  сломает FSD. Нужно перенести UI вниз в слой `features`.
- `activity/starred` получает DTO, а не `MessengerMessage`. Страница не должна
  адаптировать DTO сама; фича должна догрузить message по UUID.
- Общее размещение может оказаться неочевидным. Если диалог останется только
  внутри chat page, activity/feed не смогут открыть его.
- Direct stream без default topic не годится для отправки. Нужно либо найти
  default topic, либо создать direct stream через `createWorkspaceDirectStream`.
- Старые тесты chat page могут проверять детали локальной модалки. Их надо
  перевести на проверку вызова store и поведение новой фичи.
- Route `/project/:projectId/message/:messageUuid` уже парсится, но selection
  пока unsupported. Не включать эту задачу в критический путь пересылки.

## Критерии готовности

- `ChatPageWorkspace` больше не владеет состоянием и отправкой forward.
- Workspace forward можно открыть с любой Workspace поверхности через store.
- Topic forward и direct forward реально отправляют через Workspace API.
- Missing message path догружает сообщение по UUID.
- `activity/starred` forward больше не no-op.
- В новой фиче нет Zulip/numeric bridge кода.
- Русские поясняющие комментарии добавлены в новых сложных местах.
- Точечные тесты и typecheck пройдены.
