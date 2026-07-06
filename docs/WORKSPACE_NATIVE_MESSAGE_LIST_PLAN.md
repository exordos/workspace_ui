# Workspace Native Message List Plan

Дата среза: 2026-07-03.

Этот документ фиксирует план перехода от старого Zulip-shaped `MessageList` к
новому Workspace-native списку сообщений. Цель первой итерации - не собрать все
поведение старого списка, а сделать рабочее ядро под Workspace API и сохранить
только две действительно ценные части старой реализации:

- стабильную работу скролла при загрузке, обновлении, удалении и смене окна;
- размещение времени сообщения внутри bubble для простых текстовых сообщений.

Файлы, вложения, картинки, галерея, rich markdown, старые Zulip mentions,
`/user_uploads/` и legacy media flow в первую итерацию не переносятся. Они
должны наращиваться позже уже поверх Workspace-модели.

## Главное решение

Старый `widgets/message-list/MessageList` больше не должен быть основой нового
Workspace UI. Он остается как legacy-референс и временная поверхность для
сравнения поведения, но новый путь собирается рядом:

```text
Workspace message store -> WorkspaceMessageList -> WorkspaceMessageBubble
```

В новом пути нельзя использовать:

- `MockMessage` как входной тип списка;
- числовые `message.id`, `sender_id`, `stream_id` как доменную модель;
- `content` / `markdown_source` как Zulip-compatible тело сообщения;
- `flags` как read/starred contract;
- `user_uploads`, realm base url, Basic auth media loader;
- Zulip-specific mention, stream reference и quote parsers как базовое
  поведение.

Допустимое временное состояние: старый список переименован или вынесен в
legacy-зону, а новый `MessageList` получает старое публичное имя только после
того, как Workspace chat route начинает работать на новом ядре.

## Цель первой итерации

Сделать минимальный, но рабочий Workspace-native список:

- отображает сообщения из `MessengerMessage[]`;
- работает с `MessengerUuid`, а не с числовыми Zulip id;
- группирует по дню и автору;
- держит корректный скролл при initial load, append, prepend, update и delete;
- умеет `loadOlder` при скролле вверх;
- умеет `loadNewer` при скролле вниз, если окно открыто вокруг anchor;
- умеет pinned-to-bottom поведение для новых сообщений;
- умеет unread marker и callback видимых unread сообщений;
- рендерит простой текстовый bubble;
- размещает время inline для простого текста и отдельной строкой для сложного
  контента;
- не рендерит файлы/картинки как legacy user uploads.

## Предлагаемая структура файлов

Вариант с явной legacy-зоной:

```text
widgets/message-list/
  legacy/
    message-list.ui.tsx
    message-bubble.ui.tsx
    ...
  message-list.ui.tsx
  message-list.types.ts
  workspace-message-bubble.ui.tsx
  workspace-message-bubble.types.ts
  workspace-message-list-scroll.hook.ts
  workspace-message-list-grouping.lib.ts
  workspace-message-bubble-meta-placement.lib.ts
  workspace-message-bubble-meta.ui.tsx
  workspace-message-bubble-meta.css
```

Более осторожный вариант для первого PR:

```text
widgets/workspace-message-list/
  workspace-message-list.ui.tsx
  workspace-message-list.types.ts
  workspace-message-bubble.ui.tsx
  workspace-message-list-scroll.hook.ts
  workspace-message-list-grouping.lib.ts
```

После стабилизации новый виджет можно переименовать в
`widgets/message-list`, а старый удалить одним отдельным проходом.

## Типы нового списка

Новый список должен принимать доменные Workspace-сообщения:

```ts
interface WorkspaceMessageListProps {
  messages: readonly MessengerMessage[];
  currentUserUuid: MessengerUuid;
  conversationId: MessengerConversationId;
  scrollToBottomKey?: string;
  scrollToBottomAfterSendNonce?: number;
  firstUnreadUuid?: MessengerUuid;
  unreadCount?: number;
  focusedMessageUuid?: MessengerUuid | null;
  isLoadingOlder?: boolean;
  isLoadingNewer?: boolean;
  hasOlderMessages?: boolean;
  hasNewerMessages?: boolean;
  onLoadOlder?: () => void;
  onLoadNewer?: () => void;
  onUnreadMessagesVisible?: (messageUuids: MessengerUuid[]) => void;
  onUnreadMessagesAtBottom?: (messageUuids: MessengerUuid[]) => void;
}
```

В DOM для скролла использовать строковый id:

```tsx
<article data-message-uuid={message.uuid}>
```

Если часть старых helper-ов пока ожидает `data-message-id`, лучше сделать новые
helper-ы под строковый ключ, а не продолжать генерировать числовые id.

## Этап 1. Изоляция legacy

Цель: явно отделить старый список от нового плана.

Шаги:

1. Зафиксировать, какие route сейчас используют старый `MessageList`.
2. Выбрать стратегию:
   - либо сразу создать `widgets/workspace-message-list`;
   - либо перенести текущий `widgets/message-list` в `widgets/message-list/legacy`.
3. Не менять поведение старого списка в этом этапе.
4. Не чистить старые media/rendering функции.
5. Подготовить новый пустой компонент списка с теми же внешними размерами в
   chat-shell.

Готовность:

- Workspace route может быть переключен на новый список флагом/локальной заменой;
- старый список доступен как референс;
- нет новых адаптеров `MessengerMessage -> MockMessage`.

## Этап 2. Скелет WorkspaceMessageList

Цель: получить простой список сообщений без сложных действий.

Шаги:

1. Принять `MessengerMessage[]` напрямую.
2. Отсортировать/ожидать сортировку по `createdAt`, затем `uuid`.
3. Сгруппировать по дню.
4. Сгруппировать соседние сообщения одного автора.
5. Отрисовать own/peer bubble с текущими цветами и отступами.
6. Подключить `data-message-uuid`.
7. Подключить `scrollToBottomKey` и initial scroll to bottom.

В этой фазе не нужны:

- реакции;
- контекстное меню;
- редактирование;
- удаление;
- вложения;
- предпросмотр ссылок;
- media viewer.

Готовность:

- можно открыть чат и увидеть историю;
- при смене чата список открывается в правильной позиции;
- типы не импортируют `MockMessage`.

## Этап 3. Scroll controller

Цель: перенести ценную старую scroll-логику в Workspace-native хук.

Новый хук:

```ts
useWorkspaceMessageListScroll({
  messages,
  getMessageKey: (message) => message.uuid,
  isUnreadFromOther: (message) => !message.read && message.authorUuid !== currentUserUuid,
  scrollToBottomKey,
  scrollToBottomAfterSendNonce,
  firstUnreadKey,
  unreadCount,
  focusedMessageKey,
  isLoadingOlder,
  isLoadingNewer,
  hasNewerMessages,
  onLoadOlder,
  onLoadNewer,
  onUnreadMessagesVisible,
  onUnreadMessagesAtBottom,
});
```

Переносимые части из старого списка:

- `wasAtBottomRef`;
- `userScrollSeenRef`;
- `userScrolledAwayFromBottomRef`;
- `programmaticScrollRef`;
- `pendingPrependScrollRef`;
- snapshot перед `loadOlder`;
- восстановление позиции после prepend;
- восстановление видимого anchor при update существующих сообщений;
- pinned-to-bottom при append, если пользователь был внизу;
- `ResizeObserver` для изменения высоты viewport/composer;
- защита от автозагрузки во время programmatic scroll;
- `IntersectionObserver` для unread видимости.

Что надо обобщить:

- заменить numeric `message.id` на строковый `message.uuid`;
- заменить `sender_id !== currentUserId` на `authorUuid !== currentUserUuid`;
- заменить `flags.includes("read")` на `message.read`;
- заменить `data-message-id` на `data-message-uuid`;
- вынести чистые helper-ы для anchor поиска на string key.

Готовность:

- prepend старых сообщений не сдвигает видимое место;
- update/reaction/edit существующего сообщения не дергает список;
- delete сообщения не ломает позицию;
- новое сообщение снизу не сдвигает пользователя, если он читал историю выше;
- если пользователь был внизу, список остается прибитым к низу.

## Этап 4. Bubble core

Цель: сделать простой Workspace bubble без старого Zulip HTML/media слоя.

Шаги:

1. `WorkspaceMessageBubble` принимает `MessengerMessage`.
2. Текст рендерится как безопасный plain text или минимальный markdown subset.
3. В первой итерации лучше начать с plain text + переносы строк.
4. Добавить own/peer layout.
5. Добавить имя автора для peer-группы.
6. Добавить время сообщения.
7. Добавить delivery indicator только если он уже есть в Workspace-модели.

Запрещено в этой фазе:

- `messageBodyToUnsanitizedDisplayHtml`;
- `prepareProtectedMessageHtml`;
- `useProtectedMessageHtml`;
- `getMessageImagesBaseUrl`;
- `user_uploads`;
- Zulip mention parser;
- Zulip stream reference parser.

Готовность:

- bubble отображает текст и время;
- стили визуально близки к старому UI;
- нет старого media loader.

## Этап 5. Inline meta

Цель: перенести механику красивого размещения времени.

Переносимая механика:

- `MessageBubbleMeta`;
- `ResizeObserver` для измерения ширины/высоты meta;
- CSS `::after`, который резервирует место в последнем текстовом блоке;
- режимы `inline` и `row`.

Новый resolver должен работать от Workspace-представления:

```ts
resolveWorkspaceBubbleMetaPlacement({
  text,
  attachmentsCount,
  hasReactions,
  hasLinkPreview,
});
```

Правило первой итерации:

- inline только для одного простого текстового блока без вложений и реакций;
- row для многострочного rich-контента, вложений, картинок, реакций и ошибок.

Готовность:

- короткое текстовое сообщение держит время в правом нижнем углу;
- текст не пересекается со временем;
- при изменении delivery indicator reserve пересчитывается;
- сложное сообщение показывает время отдельной строкой.

## Этап 6. Подключение к Workspace chat route

Цель: убрать `MessengerMessage -> MockMessage` adapter из Workspace route.

Шаги:

1. В `chat-page-workspace.ui.tsx` заменить старый `MessageList` на новый
   Workspace-native список.
2. Передать `messages` напрямую из Workspace store.
3. Передать `currentUserUuid` из Workspace runtime/session.
4. Перевести callbacks read/load/focus на uuid.
5. Удалить обратный поиск `visualMessageId -> messageUuid` из Workspace пути.
6. Оставить старый adapter только для legacy route/tests, если он еще нужен.

Готовность:

- Workspace route больше не создает `MockMessage`;
- Workspace route больше не генерирует numeric visual ids;
- основные сценарии открытия и чтения чата работают.

## Этап 7. Минимальные проверки

Нужны focused tests, не полный перенос старой test matrix.

Обязательные тесты:

- initial render показывает сообщения по порядку;
- смена `scrollToBottomKey` открывает список снизу;
- `scrollToBottomAfterSendNonce` ведет к tail scroll;
- prepend старых сообщений сохраняет видимый anchor;
- update существующего сообщения сохраняет позицию, если пользователь не внизу;
- delete сообщения рядом с viewport не вызывает резкий прыжок;
- unread marker ставится на `firstUnreadUuid`;
- visible unread callback получает uuid;
- inline meta включается для простого текста;
- inline meta выключается для вложений/реакций/сложного текста.

Ручная проверка:

- открыть канал;
- открыть личный чат;
- прокрутить вверх и дождаться load older;
- получить новое сообщение внизу;
- отправить свое сообщение;
- удалить/обновить сообщение в середине списка;
- сузить/расширить composer и проверить, что низ не уезжает.

## Что отложено

Эти вещи специально не входят в рабочее ядро:

- картинки и файлы в сообщениях;
- Workspace attachments model;
- media viewer;
- download progress;
- link previews;
- rich markdown;
- mentions;
- reactions UI;
- context menu;
- edit/delete UI;
- reply/forward;
- Jitsi cards;
- custom emoji catalog.

Их надо добавлять после того, как новый список стабилен на простом тексте и
скролле. Иначе мы снова начнем затаскивать legacy-поведение раньше базовой
архитектуры.

## План под субагентов

Каждую фазу делает отдельный субагент в чистом контексте. Субагент перед
началом читает:

- `AGENTS.md`;
- этот документ;
- `docs/WORKSPACE_MESSAGE_STORE_CUTOVER_PLAN.md`;
- текущие файлы из своего write scope.

Главное правило: один субагент не редактирует файлы другой фазы. Если фаза
требует изменения чужого scope, она останавливается и фиксирует blocker в
результате, а не правит код соседней фазы.

### Фаза A. Legacy inventory и граница нового виджета

Можно делать первой. Не параллелить с фазами B-F, потому что она задает
физическую структуру файлов.

Цель:

- понять, кто импортирует текущий `MessageList`;
- выбрать осторожную структуру для нового виджета;
- создать пустой Workspace-native entrypoint без подключения к route.

Write scope:

- `packages/web/src/widgets/workspace-message-list/**`;
- при необходимости только новые тестовые файлы рядом;
- этот документ, если нужно уточнить найденные факты.

Read scope:

- `packages/web/src/widgets/message-list/**`;
- `packages/web/src/pages/chat/**`;
- `packages/web/src/entities/messenger/**`.

Нельзя:

- переносить старый `widgets/message-list` в этой фазе;
- менять imports в `chat-page-workspace`;
- редактировать старый `MessageList`;
- добавлять `MockMessage` в новый виджет.

Результат:

- создан пустой `WorkspaceMessageList`;
- описаны текущие импорты старого списка;
- новый код компилируется локально в изоляции;
- публичные типы нового списка принимают `MessengerMessage[]`.

### Фаза B. Группировка и простой render skeleton

Зависит от фазы A. Можно параллелить с фазой C только если заранее согласован
общий тип `WorkspaceMessageListProps` и файлы scroll hook не трогаются в B.

Цель:

- отрисовать сообщения по дням;
- сгруппировать соседние сообщения одного автора;
- показать базовый own/peer bubble без интерактивных действий.

Write scope:

- `packages/web/src/widgets/workspace-message-list/workspace-message-list.ui.tsx`;
- `packages/web/src/widgets/workspace-message-list/workspace-message-list.types.ts`;
- `packages/web/src/widgets/workspace-message-list/workspace-message-list-grouping.lib.ts`;
- тесты grouping/render skeleton.

Нельзя:

- писать scroll controller;
- подключать старый `MessageBubble`;
- использовать `MessageListMessage`, `MockMessage`, `Reaction`, `RealmEmoji`;
- добавлять media/rendering код.

Результат:

- список рендерит `MessengerMessage[]`;
- own/peer определяется через `authorUuid === currentUserUuid` или `message.isOwn`;
- DOM содержит `data-message-uuid`;
- есть минимальные тесты на порядок и группировку.

### Фаза C. Workspace scroll controller

Зависит от фазы A. Можно делать параллельно с фазой B, если B не меняет scroll
файлы и не меняет agreed props. Подключение в UI лучше делать после B.

Цель:

- перенести scroll-поведение из старого списка в отдельный Workspace hook;
- заменить numeric id на string key.

Write scope:

- `packages/web/src/widgets/workspace-message-list/workspace-message-list-scroll.hook.ts`;
- `packages/web/src/widgets/workspace-message-list/workspace-message-list-scroll-anchor.lib.ts`;
- scroll tests рядом с новым виджетом.

Read scope:

- `packages/web/src/widgets/message-list/message-list.ui.tsx`;
- `packages/web/src/shared/lib/scroll-prepend-anchor.lib.ts`;
- `packages/web/src/shared/lib/message-list-pagination-policy.lib.ts`;
- `packages/web/src/shared/lib/read-receipts-policy.lib.ts`.

Нельзя:

- редактировать старый `MessageList`;
- менять Workspace route;
- завязывать hook на `MessengerMessage` напрямую, если достаточно generic
  `getMessageKey` / `isUnreadFromOther`;
- использовать `data-message-id`.

Результат:

- hook умеет initial bottom, after-send bottom, prepend restore, same-list
  update anchor restore;
- hook работает с `data-message-uuid`;
- тесты покрывают prepend/update/delete без скачков.

### Фаза D. Workspace bubble core

Зависит от фазы B. Можно делать параллельно с фазой C. Нельзя подключать к route
до завершения E.

Цель:

- сделать простой bubble под Workspace message;
- не использовать старый Zulip HTML/media path.

Write scope:

- `packages/web/src/widgets/workspace-message-list/workspace-message-bubble.ui.tsx`;
- `packages/web/src/widgets/workspace-message-list/workspace-message-bubble.types.ts`;
- тесты bubble.

Нельзя:

- импортировать `messageBodyToUnsanitizedDisplayHtml`;
- импортировать `prepareProtectedMessageHtml`;
- импортировать `useProtectedMessageHtml`;
- импортировать старые `message-bubble-*` файлы, кроме чистых style constants,
  если они будут явно вынесены отдельно;
- делать attachments/images.

Результат:

- plain text отображается безопасно;
- переносы строк сохраняются;
- own/peer визуально близки к текущему shell;
- нет `dangerouslySetInnerHTML`.

### Фаза E. Inline meta для Workspace bubble

Зависит от фазы D. Можно делать параллельно с фазой C, если D уже создал
стабильный bubble API.

Цель:

- перенести только механику размещения времени;
- заменить Zulip-specific resolver на Workspace-specific resolver.

Write scope:

- `packages/web/src/widgets/workspace-message-list/workspace-message-bubble-meta.ui.tsx`;
- `packages/web/src/widgets/workspace-message-list/workspace-message-bubble-meta.css`;
- `packages/web/src/widgets/workspace-message-list/workspace-message-bubble-meta-placement.lib.ts`;
- tests для placement.

Read scope:

- `packages/web/src/widgets/message-list/message-bubble-content.ui.tsx`;
- `packages/web/src/widgets/message-list/message-bubble-meta-placement.lib.ts`;
- `packages/web/src/widgets/message-list/message-bubble-meta.css`.

Нельзя:

- переносить Zulip mention/quote правила;
- использовать `MockMessage`;
- поддерживать rich markdown в первой итерации.

Результат:

- простое текстовое сообщение получает inline meta;
- сложное сообщение получает row meta;
- CSS reserve не дает времени пересекаться с текстом;
- ResizeObserver пересчитывает reserve при изменении meta.

### Фаза F. Интеграция Workspace route

Зависит от фаз B, C, D, E. Эту фазу не параллелить с другими write-фазами,
потому что она трогает route и связывает результаты.

Цель:

- подключить новый список к Workspace chat route;
- убрать `MessengerMessage -> MockMessage` adapter из нового Workspace path.

Write scope:

- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`;
- `packages/web/src/pages/chat/chat-page-message-list-section.*`, если route
  идет через этот слой;
- tests для Workspace chat route;
- при необходимости удалить Workspace usage из
  `chat-page-workspace-message.adapter.ts`, но не удалять legacy файл целиком.

Нельзя:

- менять старый non-Workspace route;
- удалять legacy `widgets/message-list`;
- подключать attachments/images;
- расширять старый adapter новыми полями.

Результат:

- Workspace route передает `MessengerMessage[]` напрямую;
- callbacks работают на uuid;
- `workspaceChatVisualMessageId` больше не нужен в новом render path;
- старый adapter остается только как legacy/reference, если еще есть импорты.

### Фаза G. Минимальная стабилизация и cleanup blockers

Зависит от фазы F. Не параллелить с фазой F.

Цель:

- добить узкие ошибки интеграции;
- зафиксировать, что осталось в legacy;
- не расширять scope.

Write scope:

- только файлы, измененные фазами A-F;
- tests рядом с новым виджетом и Workspace route;
- этот документ для списка следующих задач.

Нельзя:

- начинать attachments/images;
- начинать full legacy delete;
- переписывать composer/sidebar/store.

Результат:

- новый Workspace list проходит focused tests;
- известные пробелы записаны явно;
- есть список импортов, которые еще держат legacy `MessageList`.

### Параллельность фаз

Безопасный последовательный порядок:

```text
A -> B -> C -> D -> E -> F -> G
```

Допустимый ускоренный порядок:

```text
A
├─ B
├─ C
└─ D -> E
F
G
```

Условия для ускоренного порядка:

- после A зафиксирован `WorkspaceMessageListProps`;
- B не редактирует scroll hook файлы;
- C не редактирует UI render файлы;
- D/E не редактируют list scroll files;
- F стартует только после merge результатов B, C, D, E.

Если есть сомнения, использовать последовательный порядок. Для этой миграции
чистота границ важнее скорости.

## Итог фазы G первой итерации

Проверено:

- новый `widgets/workspace-message-list` принимает и рендерит `MessengerMessage[]`
  напрямую;
- Workspace route передает сообщения через `ChatPageWorkspaceMessageListSection`
  без `MessengerMessage -> MockMessage` adapter;
- в новом Workspace list path нет импортов старых `MockMessage`,
  `MessageListMessage`, `RealmEmoji`, старого HTML/media рендера,
  `/user_uploads/` и `data-message-id`;
- DOM-ключ списка остается строковым `data-message-uuid`;
- section props для скролла, пагинации и read callbacks покрыты focused test.

Остатки для следующих фаз:

- `loadNewer` в Workspace route пока честный no-op, потому что Workspace message
  store не хранит отдельное окно newer around anchor;
- вложения, картинки, галерея, rich markdown, reactions UI, context menu,
  edit/delete UI и полный legacy delete остаются вне первой итерации;
- старый `widgets/message-list` еще остается legacy/reference для non-Workspace
  поверхностей и будущего отдельного удаления.

## Финальная сверка render cleanup

Срез после фазы 11 `WORKSPACE_MESSAGE_RENDER_ARCHITECTURE_PLAN`:

- active Workspace route больше не содержит
  `MessengerMessage -> MockMessage/MessageListMessage` adapter;
- `chat-page-workspace-message.adapter.ts` удален, потому что после
  `ChatPageWorkspaceMessageListSection` он не обслуживал старый route, а был
  скрытым мостом к старому списку;
- `widgets/workspace-message-list` остается отдельным native entrypoint и не
  импортирует `widgets/message-list`;
- старый `widgets/message-list` не удален: он остается legacy surface для
  non-Workspace маршрутов до отдельного согласованного прохода;
- scroll anchor нового списка остается `data-message-uuid`.

### Шаблон задания субагенту

Каждому субагенту выдавать задание в таком формате:

```text
Фаза: <A/B/C/...>
Цель: <одно предложение>
Прочитать перед стартом:
- AGENTS.md
- docs/WORKSPACE_NATIVE_MESSAGE_LIST_PLAN.md
- <файлы из read scope>
Можно редактировать:
- <write scope>
Нельзя редактировать:
- <explicit forbidden scope>
Критерий готовности:
- <3-5 проверяемых пунктов>
Проверка:
- npm run typecheck -- --pretty false
- npx vitest run <узкие test files>
```

Если проверка слишком широкая или падает из-за чужих изменений, субагент должен
зафиксировать точную команду и причину, но не чинить посторонний код.

## Рекомендуемый порядок PR

1. Новый `WorkspaceMessageList` скелет рядом со старым списком.
2. Обобщенный Workspace scroll controller со string keys.
3. `WorkspaceMessageBubble` с plain text и базовым layout.
4. Inline meta перенос.
5. Подключение Workspace route к новому списку.
6. Удаление `MessengerMessage -> MockMessage` из Workspace route.
7. Отдельный PR на Workspace attachments/images.
8. Отдельный PR на удаление legacy `MessageList`.

## Риск

Главный риск - попытаться перенести старый список целиком. Это вернет те же
проблемы:

- Workspace снова будет жить в `MockMessage`;
- file/image rendering снова начнет зависеть от `/user_uploads/`;
- auth для медиа снова будет смешивать Basic и Bearer;
- uuid снова будут превращаться в числовые surrogate id;
- удаление legacy станет дороже.

Поэтому первый инкремент должен быть узким: список, скролл, простой bubble,
inline-время. Все остальное добавляется только после этого.
