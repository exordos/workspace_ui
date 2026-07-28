# Workspace Message Render Architecture Plan

Дата среза: 2026-07-04.

Этот документ описывает план новой Workspace-native архитектуры рендера тела
сообщения. Его можно отдавать субагентам как самостоятельный контекст для фаз
реализации.

Цель: вернуть rich-render сообщений в новом `WorkspaceMessageList`, но не
восстановить старый Zulip-shaped слой. Новый рендер должен работать от
`MessengerMessage.markdown`, UUID-идентификаторов и Workspace API contracts.

## Главная идея

Рендер сообщения надо разделить на три независимых шага:

```text
parseWorkspaceMessageBody(markdown) -> document + metadata
renderWorkspaceMessageBody(document, options) -> html + metadata
summarizeWorkspaceMessageBody(document, options) -> preview
```

Где:

- `parseWorkspaceMessageBody` превращает markdown в промежуточную структуру,
  удобную для полного рендера и для коротких превью;
- `renderWorkspaceMessageBody` делает безопасный HTML для bubble;
- `summarizeWorkspaceMessageBody` делает короткое текстовое описание для
  сайдбара, уведомлений, поиска и других компактных поверхностей.

Полный bubble-render и sidebar-preview не должны быть одним и тем же режимом
одной функции. В полном bubble нужны rich HTML и интерактивность. В сайдбаре
нужна короткая человекочитаемая сводка без сырых URL картинок и вложений.

## Термины

`options` - входные настройки. Они передаются снаружи и описывают, что данная
поверхность интерфейса разрешает показывать.

```ts
interface WorkspaceMessageRenderOptions {
  enableMarkdown: boolean;
  enableMentions: boolean;
  enableQuotes: boolean;
  enableEmojiShortcodes: boolean;
  enableCodeHighlight: boolean;
  enableCodeCopy: boolean;
  enableProtectedMedia: boolean;
  enableAttachments: boolean;
  enableGallery: boolean;
}
```

`metadata` - результат анализа и рендера. Она вычисляется внутри parse/render
один раз и сообщает UI, что реально встретилось в сообщении.

```ts
interface WorkspaceMessageBodyMetadata {
  contentKind: "plain" | "inline-rich" | "block-rich" | "media" | "attachment";
  hasRichBlocks: boolean;
  hasMentions: boolean;
  hasLinks: boolean;
  hasCodeBlocks: boolean;
  hasMedia: boolean;
  hasProtectedMedia: boolean;
  hasAttachments: boolean;
  preferredMetaPlacement: "inline" | "row";
  textPreview: string;
}
```

Важно: `metadata` не должна управлять повторным рендером того же текста. Поток
один:

```text
markdown + options -> render -> html + metadata
```

Запрещенный поток:

```text
markdown -> computed flags -> повторный render markdown по computed flags
```

Такой подход заставляет читать тело сообщения дважды и быстро превращает рендер
в неявную систему условий.

## Правила миграции

Новый Workspace renderer не должен использовать:

- `MockMessage`;
- numeric `message.id`, `sender_id`, `stream_id`;
- `content` / `markdown_source` как Zulip-compatible пару;
- `flags`;
- `shared/api/zulip-*`;
- `widgets/message-list/*` как runtime-зависимость;
- старые stores с numeric user id как source of truth;
- legacy `/user_uploads` как контракт для Workspace files;
- silent fallback на старый renderer, если Workspace contract не готов.

Если старый код содержит полезный алгоритм, его можно изучить как reference, но
нельзя подключать новый Workspace renderer напрямую к старому файлу с
Zulip-shaped контрактом. Правильный путь: вынести нейтральный helper или
создать Workspace-native helper с явным типом входа и тестами.

Если backend contract для конкретной возможности отсутствует, поведение должно
быть explicit unsupported, а не имитацией через старый API.

## Комментарии в коде

На время реализации этого плана действует осознанное исключение из общего
правила проекта: субагенты должны активно комментировать новый и измененный код
на русском языке.

Комментарий должен объяснять причину решения, границу ответственности или
опасное место. Комментарий не должен пересказывать очевидную строку кода.

Примеры хороших комментариев:

```ts
// Сайдбар не рендерит HTML: он получает короткое описание сообщения, чтобы
// вложения и картинки не превращались в сырые URL в списке чатов.
```

```ts
// Этот слой не знает про DOM. Он только строит структуру сообщения, которую
// потом используют полный bubble-render и preview-render.
```

После завершения миграции русские комментарии можно будет отдельно пересмотреть
и либо оставить как исключение, либо перевести на английский.

## Целевая структура

Предпочтительная структура файлов:

```text
packages/web/src/shared/lib/workspace-message-render/
  workspace-message-document.types.ts
  workspace-message-parse.lib.ts
  workspace-message-render.lib.ts
  workspace-message-summary.lib.ts
  workspace-message-render-options.lib.ts
  workspace-message-render.test.ts
  workspace-message-summary.test.ts

packages/web/src/widgets/workspace-message-list/
  workspace-message-body.ui.tsx
  workspace-message-body-interactions.hook.ts
  workspace-message-body.types.ts
```

Почему `shared/lib` для parse/render/summarize:

- этим смогут пользоваться bubble, сайдбар, уведомления, поиск и composer
  preview;
- слой не зависит от React;
- слой не должен знать о конкретном виджете.

Почему `widgets/workspace-message-list` для body UI и DOM interactions:

- вставка HTML, обработчики кликов, copy-code, gallery и измерения DOM являются
  частью виджета;
- shared-слой не должен импортировать React stores и UI-модели.

## Базовые типы

Ориентир для промежуточной структуры:

```ts
interface WorkspaceMessageDocument {
  sourceMarkdown: string;
  blocks: WorkspaceMessageBlock[];
  metadata: WorkspaceMessageBodyMetadata;
}

type WorkspaceMessageBlock =
  | WorkspaceMessageParagraphBlock
  | WorkspaceMessageQuoteBlock
  | WorkspaceMessageCodeBlock
  | WorkspaceMessageListBlock
  | WorkspaceMessageMediaBlock
  | WorkspaceMessageAttachmentBlock;
```

На первой фазе документ может быть проще. Не надо сразу строить идеальный AST
для всего markdown. Допустимо начать с минимальной структуры:

```ts
interface WorkspaceMessageDocument {
  sourceMarkdown: string;
  safeTextPreview: string;
  metadata: WorkspaceMessageBodyMetadata;
}
```

Но API должен оставлять место для будущих `blocks`, чтобы preview и render не
зависели от повторного чтения исходной строки.

## Поведение отключенных возможностей

Отключенная возможность не должна уничтожать смысл сообщения.

- `enableMentions: false` - mention отображается как обычный текст, например
  `@Adam`.
- `enableProtectedMedia: false` - картинка в preview превращается в
  `Изображение`, а не в сырой URL.
- `enableAttachments: false` - файл в preview превращается в `Файл: report.pdf`
  или просто `Файл`, если имя неизвестно.
- `enableQuotes: false` - цитата в preview либо пропускается, либо сжимается до
  `Цитата: ...`, в зависимости от surface options.
- `enableCodeHighlight: false` - код остается текстом без подсветки.
- `enableGallery: false` - картинки не открывают viewer, но полный render может
  всё равно показывать картинку, если `enableProtectedMedia: true`.

Для полного bubble-render отключенная media-возможность может означать
placeholder или plain link только если это явно закреплено в options. Для
preview сырые media URL показывать нельзя.

## Preview API

Сайдбар, уведомления и поиск должны использовать summary API, а не урезанный
HTML-render.

```ts
interface WorkspaceMessageSummaryOptions {
  maxLength: number;
  includeMediaLabel: boolean;
  includeAttachmentLabel: boolean;
  includeQuotePrefix: boolean;
}

interface WorkspaceMessageSummary {
  text: string;
  leadingKind: "text" | "image" | "video" | "file" | "link" | "quote" | "code";
  iconName?: string;
}
```

Примеры ожидаемого preview:

```text
markdown: ![screen.png](workspace-file://...)
preview:  Изображение
```

```text
markdown: ![screen.png](workspace-file://...)
          Вот скрин
preview:  Изображение: Вот скрин
```

```text
markdown: [report.pdf](workspace-file://...)
preview:  Файл: report.pdf
```

```text
markdown: Привет @**Adam**
preview:  Привет @Adam
```

## Фаза 0. Инвентаризация и контракт

Цель: зафиксировать реальные Workspace contracts и текущие места потребления
тела сообщения.

Задачи субагента:

1. Найти все места, где сейчас читается `MessengerMessage.markdown`.
2. Найти все места, где sidebar/preview используют plain text тела сообщения.
3. Проверить текущий frontend contract для Workspace files/messages.
4. Зафиксировать, какие возможности backend уже поддерживает, а какие должны
   остаться explicit unsupported.
5. Не менять код, кроме возможного уточнения этого документа, если найден
   важный контракт.

Запрещено:

- добавлять fallback на старый message renderer;
- подключать старые Zulip stores;
- менять видимый UI.

Готовность:

- есть список surfaces: bubble, sidebar, notifications, search, composer
  preview;
- понятно, где нужен full render, а где summary;
- подтверждено, что message body source of truth остается
  `MessengerMessage.markdown`.

Параллельность: фаза должна идти первой. Остальные фазы стартуют после нее.

### Срез фазы 0 от 2026-07-04

Фактический source of truth для тела сообщения подтвержден: backend v1
поддерживает только `payload.kind === "markdown"` с `payload.content`, frontend
DTO guard принимает только `WorkspaceMessengerMarkdownPayloadDto`, adapter
кладет `dto.payload.content` в доменное `MessengerMessage.markdown`.

Текущие product-readers `MessengerMessage.markdown`:

- bubble: `widgets/workspace-message-list/workspace-message-bubble.ui.tsx`
  передает `message.markdown` в resolver placement и выводит его как
  React-экранированный plain text;
- bubble menu: `workspace-message-bubble-menu.ui.tsx` копирует
  `message.markdown`;
- sidebar: `entities/messenger/messenger-sidebar.lib.ts` кладет
  `message.markdown` прямо в `MessengerSidebarMessagePreview.text`;
- feed: `pages/feed/feed-page.ui.tsx` строит compact preview через
  `plainTextPreviewFromMessageBody(m.markdown)`;
- composer edit/reply: `pages/chat/chat-page-workspace.ui.tsx` использует
  `message.markdown` как initial edit markdown и как fallback quote source;
- send/edit actions: `entities/messenger/messenger-message-actions.lib.ts`
  отправляют `{ payload: { kind: "markdown", content: markdown } }` и после
  edit патчат store новым `message.markdown`;
- legacy reference на момент фазы 0:
  `pages/chat/chat-page-workspace-message.adapter.ts` все еще мапил
  `message.markdown` в `content` / `markdown_source` старого `MessageList`, но
  активный Workspace route уже шел через
  `ChatPageWorkspaceMessageListSection` и `WorkspaceMessageList`. В фазе 11
  этот неиспользуемый мост удален.

Compact surfaces сейчас неодинаковы. Sidebar хранит сырой markdown, feed уже
делает plain-text preview через старый helper, notifications для Workspace
runtime не хранят тело сообщения и не строят body из markdown, Workspace search
не ищет сообщения и возвращает пустой message result set, composer preview на
Workspace route explicit unsupported через capabilities.

Workspace files contract на backend уже есть:

- `POST /api/messenger/v1/files/` принимает multipart `file` и `stream_uuid`;
- `GET /api/messenger/v1/files/{file_uuid}/actions/download` возвращает bytes с
  `Content-Type` и `Content-Disposition: attachment`;
- доступ к файлам stream-scoped через `m_workspace_file_accesses`;
- file operations не создают durable realtime events.

Frontend files contract для Workspace пока не готов: в
`shared/api/messenger.types.ts` нет Workspace file DTO, в messenger API client
нет multipart/upload/download helper, а `chat-page-workspace.ui.tsx` явно
отклоняет `files` с `workspaceMessenger.uploadsUnsupported`. Нельзя
использовать `chat-upload.lib.ts` + `shared/api/zulip-upload.ts` как Workspace
contract: это только legacy Zulip `/user_uploads` путь.

Поддержано сейчас:

- backend: message create/list/get/edit/delete/read/read_up_to, reactions
  aggregate и CRUD, files upload/list/get/update/delete/download;
- frontend: Workspace message list, plain-text bubble, copy/reply/edit/delete,
  read batching, reactions aggregate/own reaction projection, sidebar preview
  pointer hydration через `lastMessageUuid + messagesById`.

Остается explicit unsupported для render-плана:

- Workspace rich markdown bubble render;
- единый summary API для sidebar/feed/search/notifications/composer preview;
- Workspace message search snippets;
- Workspace notification body from message body;
- Workspace composer preview;
- Workspace mentions, custom emoji, scheduled send, saved snippets;
- Workspace file upload/render/download integration in UI;
- mark unread, star/unstar, pin/unpin, typing, activity и link preview frontend
  contracts. `read_up_to` поддержан backend, но отдельный frontend wrapper в
  текущем коде не найден.

## Фаза 1. Render core skeleton

Цель: создать Workspace-native parse/render/summarize API без подключения к UI.

Задачи субагента:

1. Создать файлы в `shared/lib/workspace-message-render/`.
2. Описать `WorkspaceMessageRenderOptions`, `WorkspaceMessageBodyMetadata`,
   `WorkspaceMessageDocument`, `WorkspaceMessageSummaryOptions`,
   `WorkspaceMessageSummary`.
3. Реализовать минимальный `parseWorkspaceMessageBody(markdown)`.
4. Реализовать минимальный `renderWorkspaceMessageBody(document, options)`.
5. Реализовать минимальный `summarizeWorkspaceMessageBody(document, options)`.
6. Покрыть тестами plain text, переносы строк, HTML-like input и preview.

Первый render core может поддерживать только безопасный plain text + базовую
metadata. Это допустимо, если API уже правильно разрезан.

Запрещено:

- импортировать React;
- импортировать `widgets/message-list`;
- импортировать `MockMessage`;
- читать Zustand stores;
- использовать DOM-only API без проверки окружения.

Готовность:

- API компилируется;
- тесты показывают разницу между render HTML и summary text;
- HTML-like input не исполняется и не превращается в живой HTML без sanitize.

Параллельность: после фазы 0 может идти параллельно с фазой 2.

## Фаза 2. Markdown и rich blocks

Цель: вернуть базовый markdown без media/files.

Задачи субагента:

1. Подключить markdown parsing внутри Workspace render core.
2. Поддержать paragraphs, emphasis, strong, links, ordered/unordered lists,
   blockquote, inline code, fenced code.
3. Добавить sanitize boundary.
4. Добавить metadata:
   - `contentKind`;
   - `hasRichBlocks`;
   - `hasLinks`;
   - `hasCodeBlocks`;
   - `preferredMetaPlacement`.
5. Добавить summary behavior для rich blocks:
   - списки превращаются в компактный текст;
   - code block превращается в `Код: ...` или plain snippet;
   - ссылки не должны засорять preview, если есть читаемый label.

Запрещено:

- включать protected media;
- превращать file/image links в скачивание или viewer;
- использовать старые Zulip quote/mention helpers напрямую.

Готовность:

- `**bold**`, списки и blockquote отображаются в bubble HTML;
- malicious HTML остается безопасным;
- summary не показывает сырой URL вместо картинки/файла.

Параллельность: после фазы 1. Не выполнять параллельно с фазой 3, если обе
фазы меняют одни и те же render-core файлы.

## Фаза 3. WorkspaceMessageBody UI

Цель: подключить render core к новому `WorkspaceMessageBubble`.

Задачи субагента:

1. Создать `workspace-message-body.ui.tsx`.
2. Bubble должен передавать `message.markdown` в render core и получать
   `html + metadata`.
3. Заменить plain-text `<p>` на `WorkspaceMessageBody`.
4. Сохранить текущие цвета, отступы и форму bubble.
5. Перенести inline-time logic на `metadata.preferredMetaPlacement`.
6. Обновить тесты, которые сейчас ожидают `data-message-plain-text`.

Запрещено:

- ломать scroll DOM anchors (`data-message-uuid`);
- менять группировку сообщений;
- добавлять media/gallery;
- возвращать старый `MessageBubble`.

Готовность:

- новый список отображает markdown в Workspace route;
- время остается inline для простого текста и уходит в row для block-rich;
- тесты покрывают plain, inline-rich и block-rich случаи.

Параллельность: после фазы 2. Не выполнять параллельно с фазой 4.

## Фаза 4. Body interactions без media

Цель: вернуть интерактивность rich body, которая не требует файлов и картинок.

Задачи субагента:

1. Создать `workspace-message-body-interactions.hook.ts`.
2. Поддержать:
   - selection для reply/copy;
   - click по обычной ссылке;
   - spoiler toggle, если spoiler будет включен в render core;
   - copy button для code block, если `enableCodeCopy: true`.
3. Проверить доступность: корневой bubble не должен быть некорректным
   `role="button"` вокруг ссылок и кнопок.
4. Сохранить вызов контекстного меню по правой кнопке и клавиатуре.

Запрещено:

- download attachments;
- media viewer;
- protected media fetch;
- создание blob URL.

Готовность:

- code copy работает;
- ссылки кликабельны и безопасны;
- контекстное меню не конфликтует с интерактивными элементами внутри body;
- selection попадает в reply/copy callbacks.

Параллельность: после фазы 3.

## Фаза 5. Mentions и Workspace identity

Цель: добавить упоминания без numeric Zulip user id.

Задачи субагента:

1. Описать Workspace-native mention model:
   - display text;
   - optional `userUuid`;
   - optional unresolved state.
2. Подключить resolver через Workspace user/profile store или через явно
   переданные props.
3. В render HTML добавлять data attributes только с Workspace UUID.
4. В summary превращать mention в обычный читаемый `@Name`.
5. Добавить click behavior для открытия профиля/DM только через Workspace UUID.

Запрещено:

- `data-user-id` как обязательный numeric id;
- `useUsersStore` старого numeric-id пути как source of truth;
- silent fallback на old DM open callback.

Готовность:

- resolved mention кликается через UUID;
- unresolved mention остается текстом;
- summary не теряет имя пользователя.

Параллельность: после фаз 2-4. Может идти параллельно с фазой 6, если файлы не
пересекаются.

## Фаза 6. Quotes и message links

Цель: вернуть цитаты и ссылки на сообщения в Workspace-native формате.

Задачи субагента:

1. Описать Workspace-native quote syntax, которую реально отправляет composer.
2. Поддержать визуальный quote block в full render.
3. Поддержать nested quote без больших пустых отступов.
4. В summary сжимать цитату до `Цитата: ...` или пропускать quoted часть, если
   есть собственный текст ответа.
5. Для ссылок на сообщения использовать Workspace route/UUID contract, если он
   есть. Если его нет, сделать explicit unsupported marker или plain safe link.

Запрещено:

- генерировать Zulip narrow URLs;
- использовать stream/topic numeric routes;
- полагаться на old `/message/:id` numeric redirect.

Готовность:

- reply/forward quote визуально читается в bubble;
- preview не забивается полным текстом цитаты;
- message links не ведут в старый Zulip route.

Параллельность: после фаз 2-4. Может идти параллельно с фазой 5.

### Срез фазы 6 от 2026-07-04

Фактический Workspace reply в `chat-page-workspace.ui.tsx` не отправляет
отдельный native quote payload и не прикладывает UUID цитируемого сообщения.
Composer вставляет в draft обычный markdown blockquote:

```text
> Автор: первая строка
> следующая строка

собственный ответ
```

Поэтому текущий Workspace-native quote contract для render core - безопасный
markdown blockquote. Отдельный native quote contract отсутствует и не
имитируется через старые Zulip quote fences.

Ссылки на сообщения поддерживаются только как Workspace route с UUID:

```text
/org/:orgId/project/:projectId/message/:messageUuid
/project/:projectId/message/:messageUuid
```

Legacy `/message/:id`, numeric stream/topic `?msg=` и Zulip narrow links не
рендерятся как кликабельные ссылки из Workspace message body.

## Фаза 7. Emoji shortcodes и custom emoji

Цель: вернуть emoji-shortcodes без привязки к старому realm emoji contract.

Задачи субагента:

1. Поддержать unicode emoji shortcodes.
2. Для custom emoji использовать только Workspace-supported resolver.
3. Если Workspace custom emoji contract отсутствует, оставить custom emoji
   explicit unsupported, а shortcode показывать как plain text.
4. Summary должен превращать известные unicode shortcodes в символы, а
   неизвестные оставлять читаемым текстом.

Запрещено:

- читать старый realm emoji catalog;
- угадывать custom emoji URL локально;
- подменять unsupported custom emoji пустым местом.

Готовность:

- `:smile:` отображается как emoji;
- неизвестный shortcode не пропадает;
- custom emoji не использует legacy realm source.

Параллельность: после фазы 2. Может идти параллельно с фазами 5-6.

## Фаза 8. Workspace files, images, attachments

Цель: подключить файлы и картинки только через Workspace contract.

Задачи субагента:

1. Проверить backend/frontend contract для Workspace file upload/download.
2. Описать Workspace file reference format в markdown/document.
3. Поддержать metadata:
   - `hasMedia`;
   - `hasProtectedMedia`;
   - `hasAttachments`;
   - `contentKind: "media" | "attachment"`.
4. В full render показывать картинки/видео только если
   `enableProtectedMedia: true`.
5. В summary показывать `Изображение`, `Видео`, `Файл: имя`.
6. Не показывать сырые file URLs в sidebar preview.

Запрещено:

- legacy `/user_uploads` как Workspace contract;
- Basic auth media loader от старого Zulip пути;
- unauthenticated image src для приватных файлов;
- blob URL без cleanup.

Готовность:

- сообщение с одной картинкой имеет preview `Изображение`;
- сообщение с картинкой и подписью имеет preview `Изображение: подпись`;
- full render не делает лишних сетевых запросов, если media option выключен;
- включенный media path имеет тесты на cleanup.

Параллельность: после фаз 0-4. Не выполнять до подтверждения Workspace file
contract.

### Срез фазы 8 от 2026-07-04

Backend contract подтвержден по `../workspace_backend/docs/workspace_api.md`,
`workspace/messenger_api/api/controllers.py` и backend tests:

- `POST /api/messenger/v1/files/` принимает multipart `file` и обязательный
  `stream_uuid`; `name` опционален и по умолчанию равен имени uploaded part;
- ответ upload/create - Workspace file metadata: `uuid`, `stream_uuid`, `name`,
  `description`, `content_type`, `size_bytes`, `hash`, `user_uuid`,
  `created_at`, `updated_at`;
- `GET /api/messenger/v1/files/{file_uuid}/actions/download` требует file
  access, возвращает bytes со stored `Content-Type` и
  `Content-Disposition: attachment`;
- file access stream-scoped через `m_workspace_file_accesses`; file operations
  не эмитят durable realtime events;
- backend не отдает публичный inline media URL и не фиксирует contract для
  unauthenticated `<img src>`.

Frontend contract на момент фазы 8:

- Workspace route всё ещё отклоняет composer files как
  `workspaceMessenger.uploadsUnsupported`;
- `chat-upload.lib.ts` и `shared/api/zulip-upload.ts` остаются legacy
  Zulip `/user_uploads` путем и не являются Workspace contract;
- отдельный Workspace upload/download UI helper намеренно не добавлен в фазе 8,
  потому что viewer/download interactions относятся к фазе 9.

Markdown reference format для Workspace render core:

```markdown
![screen.png](workspace-file://<file_uuid>)
![clip.mp4](workspace-file://<file_uuid>?content_type=video/mp4)
[report.pdf](workspace-file://<file_uuid>)
```

`workspace-file://<file_uuid>` - приватная ссылка на Workspace file metadata, а
не браузерный URL. Query parameters `name`, `content_type`/`contentType`
допустимы как render hints, но source of truth для доступа остается backend
file UUID. Legacy `/user_uploads`, `file://` и произвольные extension-based URLs
не являются Workspace file reference format.

Document format после фазы 8 добавляет inline node:

```ts
interface WorkspaceMessageFileReference {
  kind: "media" | "attachment";
  href: string;
  fileUuid: string;
  name?: string;
  contentType?: string;
  mediaKind?: "image" | "video";
}

interface WorkspaceMessageFileInline {
  kind: "file";
  reference: WorkspaceMessageFileReference;
}
```

Full render:

- при `enableProtectedMedia: false` media превращается в текстовый маркер
  `Изображение` / `Видео` без `src`, fetch и blob URL;
- при `enableProtectedMedia: true` media рендерится explicit placeholder с
  `data-workspace-file-uuid`, `data-workspace-file-kind` и
  `data-workspace-media-kind`, но всё ещё без `src`, потому что безопасный
  inline-src contract не подтвержден;
- attachments при `enableAttachments: true` получают placeholder с
  `data-workspace-file-uuid`, но без download link/action; download остается
  фазой 9.

Summary:

- image-only message -> `Изображение`;
- image + caption -> `Изображение: подпись`;
- video -> `Видео`;
- attachment -> `Файл: имя`;
- raw `workspace-file://...` не попадает в summary/sidebar preview API.

## Фаза 9. Gallery и download interactions

Цель: подключить viewer и скачивание поверх уже готового Workspace media layer.

Задачи субагента:

1. Собрать gallery items из Workspace document/metadata, а не из regex по HTML.
2. Клик по картинке открывает viewer.
3. Клик по attachment запускает Workspace download flow.
4. Добавить progress/error state, если такой UX нужен текущему download store.
5. Проверить, что догрузка media не ломает scroll anchor.

Запрещено:

- regex-парсинг HTML как основной источник gallery;
- старые attachment helpers, завязанные на `/user_uploads`;
- смешивание Workspace file UUID и старых path-only ключей.

Готовность:

- gallery открывает правильный элемент;
- attachment скачивается через Workspace API;
- scroll не дергается при загрузке preview/blob.

Параллельность: после фазы 8.

## Фаза 10. Подключение summary к surfaces

Цель: заменить ad hoc plain-text previews на единый Workspace summary API.

Задачи субагента:

1. Подключить summary к sidebar last-message preview.
2. Подключить summary к notifications, если они читают Workspace messages.
3. Подключить summary к search/result snippets, если такая поверхность есть.
4. Убедиться, что preview не вызывает HTML render и не требует DOM.

Запрещено:

- использовать `innerHTML` для sidebar preview;
- показывать raw media/file URL как основной текст;
- делать отдельные локальные preview-парсеры в каждом surface.

Готовность:

- sidebar показывает `Изображение`, `Файл: имя`, обычный текст и mentions
  предсказуемо;
- один и тот же message body дает одинаковый preview на всех compact surfaces.

Параллельность: после фаз 1-2. Для media-aware preview лучше дождаться фазы 8.

## Фаза 11. Cleanup и запрет старых путей

Цель: убрать временные мосты и зафиксировать архитектурные границы.

Задачи субагента:

1. Найти оставшиеся импорты старого message render path из Workspace surface.
2. Удалить или пометить legacy-only helpers, если они больше не используются.
3. Добавить тесты/линт-проверки, если возможно:
   - `workspace-message-list` не импортирует `widgets/message-list`;
   - Workspace render core не импортирует `shared/api/zulip-*`;
   - Workspace renderer не использует `MockMessage`.
4. Обновить документацию с итоговым контрактом.

Запрещено:

- оставлять скрытые compatibility adapters;
- оставлять fallback на old renderer;
- удалять legacy код, если он еще нужен старым non-Workspace routes, без
  отдельного согласованного cleanup-прохода.

Готовность:

- Workspace render path полностью native;
- старый renderer остается только в legacy surface или удален отдельным PR;
- документация совпадает с кодом.

Параллельность: финальная фаза, идет после всех остальных.

### Срез фазы 11 от 2026-07-04

Финальная граница Workspace render path:

- active Workspace chat route идет через
  `pages/chat/chat-page-workspace-message-list-section.ui.tsx` ->
  `widgets/workspace-message-list/WorkspaceMessageList` ->
  `WorkspaceMessageBubble` -> `WorkspaceMessageBody`;
- тело сообщения в bubble строится только из `MessengerMessage.markdown` через
  `parseWorkspaceMessageBody` и `renderWorkspaceMessageBody`;
- compact surfaces для Workspace используют
  `summarizeWorkspaceMessageMarkdown`, а не старый
  `plainTextPreviewFromMessageBody`;
- DOM-якорь списка остается `data-message-uuid`; `data-message-id` не
  возвращается в новый список;
- Workspace render core не импортирует `shared/api/zulip-*`, `MockMessage`,
  `widgets/message-list` и не знает про numeric message/user ids;
- `widgets/workspace-message-list` не импортирует старый
  `widgets/message-list`.

Удалено в cleanup:

- `pages/chat/chat-page-workspace-message.adapter.ts` и его тест. Этот файл
  был не legacy route, а уже неиспользуемый мост
  `MessengerMessage -> MessageListMessage/MockMessage` для старого списка.
  После подключения native list он оставался только как скрытый compatibility
  adapter, поэтому удален в финальной фазе.

Оставлено намеренно:

- `widgets/message-list/**` как legacy renderer для старых non-Workspace
  поверхностей и отдельного будущего cleanup-прохода;
- legacy search modal на `MockMessage`/`zulip-messages`, потому что текущая
  Workspace search surface не строит message snippets из Workspace messages;
- legacy chat helpers в `pages/chat/*`, которые обслуживают старый Zulip chat
  route.

Фаза 11 добавила source-boundary test:

- `workspace-message-list` не импортирует `widgets/message-list`;
- Workspace render core не импортирует `shared/api/zulip-*`;
- active Workspace renderer не содержит `MockMessage`;
- Workspace compact summaries не используют старый
  `plainTextPreviewFromMessageBody`.

## Общая стратегия субагентов

Рекомендуемый порядок:

1. Фаза 0.
2. Фазы 1 и 2.
3. Фаза 3.
4. Фаза 4.
5. Фазы 5, 6, 7 можно разделить между разными субагентами.
6. Фаза 8.
7. Фаза 9.
8. Фаза 10.
9. Фаза 11.

Если есть риск конфликтов в одних файлах, выполнять фазы последовательно.
Чистота архитектуры важнее параллельности.

Каждый субагент должен:

1. Прочитать этот документ целиком.
2. Прочитать уже существующий `docs/WORKSPACE_NATIVE_MESSAGE_LIST_PLAN.md`.
3. Проверить текущий код перед изменениями, не полагаться на описание как на
   идеально актуальное состояние.
4. Работать только в своей фазе.
5. Не расширять scope без явной причины.
6. Добавлять тесты рядом с измененными файлами.
7. Комментировать важные решения на русском языке.
8. В финальном отчете перечислить:
   - измененные файлы;
   - что реализовано;
   - что намеренно не реализовано;
   - какие проверки запущены;
   - какие риски остались.

## Quality gates

Минимальные проверки для фаз render core:

```bash
npm run typecheck
npm run test --workspace=web -- src/shared/lib/workspace-message-render
```

Минимальные проверки для фаз widget integration:

```bash
npm run typecheck
npm run test --workspace=web -- src/widgets/workspace-message-list
```

Если фаза затрагивает chat page:

```bash
npm run test --workspace=web -- src/pages/chat src/widgets/workspace-message-list
```

Перед финальным объединением:

```bash
npm run typecheck
npm run test --workspace=web -- src/shared/lib/workspace-message-render src/widgets/workspace-message-list src/pages/chat
```

## Ключевые решения

1. Canonical body source: `MessengerMessage.markdown`.
2. Full render и preview summary - разные API.
3. `options` - входные разрешения surface.
4. `metadata` - отчет о результате parse/render.
5. Bubble не парсит markdown руками.
6. Sidebar не рендерит HTML.
7. Media/files подключаются только через Workspace contract.
8. Старый рендер можно читать как reference, но нельзя делать runtime fallback.
9. Если contract отсутствует, лучше explicit unsupported, чем фальшивое
   локальное поведение.
10. Scroll и DOM anchors нового списка нельзя ломать ради рендера.
