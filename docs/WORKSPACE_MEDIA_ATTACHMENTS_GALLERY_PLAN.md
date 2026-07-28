# План Workspace media, attachments, links и gallery

## Цель

Вернуть в Workspace-мессенджер файлы, картинки, предпросмотр media, скачивание
attachments, обычные ссылки и gallery без изменения старого пользовательского
опыта.

Главное правило по продукту: старый UX/UI просмотра media переиспользуем
один в один. Workspace меняет только данные, идентификаторы, способ получения
файлов и адаптеры вокруг старых компонентов. Новый дизайн viewer/gallery не
делаем.

## Контракт продукта

Файл в Workspace не является частью сообщения. Это отдельная backend-сущность:

- upload: `POST /api/messenger/v1/files/`, multipart `file` + `stream_uuid`;
- download: `GET /api/messenger/v1/files/{file_uuid}/actions/download`;
- access: backend проверяет stream-scoped доступ к файлу;
- response: raw bytes со stored `Content-Type` и
  `Content-Disposition: attachment`;
- realtime: file operations сейчас не эмитят durable realtime events.

Тело сообщения остается markdown. В сообщении храним логическую ссылку на
Workspace file, а не конкретный API URL:

```markdown
![photo.png](workspace-file://<file_uuid>?content_type=image%2Fpng)
[report.pdf](workspace-file://<file_uuid>?content_type=application%2Fpdf)
```

`workspace-file://<file_uuid>` означает: "сообщение ссылается на Workspace file
metadata". Frontend сам решает, скачать файл, показать preview или открыть его в
viewer. Markdown не должен хранить
`/api/messenger/v1/files/{uuid}/actions/download`.

## Жесткие границы

- Workspace files работают от UUID.
- Legacy `/user_uploads` не является Workspace-контрактом.
- В Workspace path не использовать `MockMessage`, numeric message id, numeric
  user id и Zulip upload helpers.
- Authenticated API URL нельзя класть в live media `src`.
- Новый gallery UI не делать. Визуально переиспользовать `features/media-viewer`.
- Workspace gallery items собирать из Workspace document/reference model, а не
  regex-парсингом HTML.
- Не имитировать upload/download success локально.
- Импорты только из конкретных segment files, без barrel-only `index.ts`.
- Временное исключение для этой реализации: в изменяемом коде можно оставлять
  комментарии на русском языке, если они объясняют неочевидные причины,
  границы или backend/frontend-контракт, а не пересказывают код. После
  завершения миграции эти комментарии можно убрать или перевести на английский.

## Что нужно сохранить

Старый UI/UX shell:

- `packages/web/src/features/media-viewer/media-viewer-overlay.ui.tsx`
- `packages/web/src/features/media-viewer/media-viewer-backdrop.ui.tsx`
- `packages/web/src/features/media-viewer/media-viewer-toolbar.ui.tsx`
- `packages/web/src/features/media-viewer/media-viewer-controls.ui.tsx`
- `packages/web/src/features/media-viewer/media-viewer-thumbnails.ui.tsx`
- `packages/web/src/features/media-viewer/media-viewer-zoom.hook.ts`
- `packages/web/src/features/media-viewer/media-viewer.model.ts`

Workspace render/data seams:

- `packages/web/src/shared/lib/workspace-message-render/workspace-message-parse.lib.ts`
- `packages/web/src/shared/lib/workspace-message-render/workspace-message-render.lib.ts`
- `packages/web/src/shared/lib/workspace-message-render/workspace-message-document.types.ts`
- `packages/web/src/widgets/workspace-message-list/workspace-message-body-interactions.hook.ts`
- `packages/web/src/widgets/workspace-message-list/workspace-message-bubble.ui.tsx`
- `packages/web/src/widgets/workspace-message-list/workspace-message-list.ui.tsx`
- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`

Текущие Workspace file helpers:

- `packages/web/src/shared/api/messenger-files.api.ts`
- `packages/web/src/pages/chat/chat-workspace-file-download.lib.ts`

Legacy references только как образец поведения:

- `packages/web/src/widgets/message-list/message-attachment-download.lib.ts`
- `packages/web/src/widgets/message-list/message-bubble-actions.lib.ts`
- `packages/web/src/widgets/message-list/message-list-media.lib.ts`

Эти legacy files можно читать для понимания старого UX, но их нельзя делать
основным Workspace implementation surface.

## Целевая модель данных

Используем существующий parsed file reference:

```ts
interface WorkspaceMessageFileReference {
  kind: "media" | "attachment";
  href: string;
  fileUuid: string;
  name?: string;
  contentType?: string;
  mediaKind?: "image" | "video";
}
```

Если старого `MediaItem` недостаточно для viewer/gallery, добавить маленький
Workspace adapter shape на границе:

```ts
interface WorkspaceMediaItem {
  fileUuid: string;
  type: "image" | "video";
  name?: string;
  contentType?: string;
  previewUrl?: string;
  downloadFileName?: string;
  alt?: string;
}
```

Финальный viewer может по-прежнему получать старый `MediaItem[]`, если это
сохраняет store и UI без изменений. Тогда нужен узкий adapter:
`WorkspaceMessageFileReference -> MediaItem`, но Workspace source of truth все
равно остается `fileUuid`.

## Общий поток

```text
composer files
  -> Workspace multipart upload
  -> file_uuid
  -> markdown workspace-file://file_uuid
  -> send message markdown
  -> parseWorkspaceMessageBody()
  -> WorkspaceMessageFileReference[]
  -> stable placeholder/preview shell
  -> authorized fetch по fileUuid
  -> Blob/object URL
  -> старый viewer/download UI
```

Download и preview оба используют authorized fetch. Разница только в том, как
используется blob:

- attachment download: `Blob -> object URL -> a.download -> revoke`;
- image preview: `Blob -> object URL -> img src -> cleanup revoke`;
- viewer: старый viewer UI, но media загружается по Workspace `fileUuid`.

## Фаза 0. Подготовка оркестратора

Владелец: orchestrator.

Цель: подготовить безопасную параллельную работу.

Задачи:

1. Проверить branch state и dirty tree.
2. Подтвердить backend file contract по:
   - `../workspace_backend/docs/workspace_api.md`;
   - `../workspace_backend/workspace/messenger_api/api/controllers.py`.
3. Подтвердить текущий Workspace markdown parser/render behavior.
4. Раздать фазы субагентам. Каждый субагент должен вернуть changed files,
   tests run и known follow-ups.
5. Зафиксировать общий формат:
   - image: `![name](workspace-file://uuid?content_type=...)`;
   - attachment: `[name](workspace-file://uuid?content_type=...)`.

В этой фазе не менять product code.

Готовность:

- все субагенты получили этот документ;
- ни один субагент не использует `/user_uploads` как Workspace file storage;
- ни один субагент не меняет media viewer visual layout без отдельного
  подтверждения.

## Фаза 1. Workspace file transport

Субагент: API/transport.

Цель: дать upload/download primitives без старого Zulip upload path.

Вероятные файлы:

- `packages/web/src/shared/api/messenger-files.api.ts`
- `packages/web/src/shared/api/messenger-transport.internal.ts`
- tests рядом с этими файлами

Задачи:

1. Оставить `downloadWorkspaceFile(options, fileUuid)` единственным download API.
2. Добавить `uploadWorkspaceFile(options, { file, streamUuid, name?, description? })`
   через multipart FormData.
3. Для multipart не выставлять JSON `Content-Type`; browser должен сам поставить
   boundary.
4. Сохранить bearer auth, dev proxy header, trailing slash fallback и
   `AbortSignal`.
5. Из upload возвращать metadata: минимум `uuid`, `name`, `content_type`,
   `size_bytes`, если backend это вернул.
6. Download возвращает bytes + headers, не JSON.

Готовность:

- upload отправляет `file` и `stream_uuid`;
- non-ok upload дает понятную ошибку;
- download ходит на `/files/{uuid}/actions/download`;
- binary download не проходит через JSON parser;
- tests покрывают auth headers, abort, multipart body и binary response.

Проверка:

```bash
npm run test --workspace=web -- --run src/shared/api/messenger-files.api.test.ts src/shared/api/messenger-transport.internal.test.ts
npm run typecheck --workspace=web
```

## Фаза 2. Composer upload в Workspace markdown

Субагент: composer/send flow.

Цель: composer attachments должны производить ровно тот markdown, который
понимает Workspace renderer.

Вероятные файлы:

- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`
- `packages/web/src/pages/chat/chat-upload.lib.ts`
- `packages/web/src/pages/chat/chat-page-composer-section.*`
- `packages/web/src/widgets/message-composer/message-composer.*`

Задачи:

1. Включить Workspace composer upload capability.
2. В Workspace send flow загружать files до отправки message.
3. Добавлять uploaded markdown links к чистому composer text.
4. Генерировать markdown:
   - image files: `![safeName](workspace-file://uuid?content_type=image%2Fpng)`;
   - video files: `[safeName](workspace-file://uuid?content_type=video%2Fmp4)` на
     первом этапе, если inline video preview не входит в scope;
   - other files: `[safeName](workspace-file://uuid?content_type=...)`.
5. Для upload scope использовать активный Workspace `streamUuid`.
6. Отменять upload при смене route/runtime через `AbortSignal`.
7. Если upload упал, сообщение не отправлять.
8. Сохранить старый composer UI shell и upload-progress UX.

Готовность:

- Workspace composer отправляет text + files;
- markdown содержит только `workspace-file://`, без backend download URL;
- failed upload не создает message;
- upload progress виден через существующую composer surface;
- route switch aborts outstanding upload.

Проверка:

```bash
npm run test --workspace=web -- --run src/pages/chat/chat-upload.lib.test.ts src/pages/chat/chat-page-workspace.test.tsx
npm run typecheck --workspace=web
```

## Фаза 3. Attachment rendering и download UX

Субагент: attachment interactions.

Цель: Workspace attachments должны вести себя как старые attachments, но от
UUID-based data.

Вероятные файлы:

- `packages/web/src/widgets/workspace-message-list/workspace-message-body-interactions.hook.ts`
- `packages/web/src/widgets/workspace-message-list/workspace-message-body.ui.tsx`
- `packages/web/src/shared/lib/workspace-message-render/workspace-message-render.lib.ts`
- `packages/web/src/pages/chat/chat-workspace-file-download.lib.ts`
- `packages/web/src/pages/chat/chat-page-workspace.ui.tsx`

Задачи:

1. Сохранить render placeholder на `data-workspace-file-*`.
2. Визуально приблизить placeholder к старому attachment chip, не меняя bubble
   layout и не вкладывая card в card.
3. По click/Enter/Space вызывать `onDownloadFile(reference)`.
4. Download key строить от `fileUuid`, не от path-only key.
5. File name брать из `Content-Disposition`, затем markdown label/name, затем
   UUID.
6. Добавить progress/error state, если это нужно current download center.
7. Не рендерить реальный `href` для `workspace-file://`.

Готовность:

- attachment click скачивает через Workspace API;
- keyboard activation работает;
- повторный click не стартует дубль download;
- error state виден и recoverable;
- raw `workspace-file://` или API URL не видны в message text.

Проверка:

```bash
npm run test --workspace=web -- --run src/widgets/workspace-message-list/workspace-message-list.ui.test.tsx src/pages/chat/chat-workspace-file-download.lib.test.ts src/pages/chat/chat-page-workspace.test.tsx
npm run typecheck --workspace=web
```

## Фаза 4. Inline image preview

Субагент: Workspace media preview.

Цель: показывать Workspace images в message bubbles, сохранив старую плотность,
размеры и поведение preview насколько возможно.

Вероятные файлы:

- `packages/web/src/widgets/workspace-message-list/workspace-message-body.ui.tsx`
- `packages/web/src/widgets/workspace-message-list/workspace-message-bubble.ui.tsx`
- `packages/web/src/widgets/workspace-message-list/workspace-message-body-interactions.hook.ts`
- новый hook/helper под `widgets/workspace-message-list/` или `shared/lib/`

Задачи:

1. Добавить Workspace-only protected media loader для
   `WorkspaceMessageFileReference`.
2. Грузить preview через `downloadWorkspaceFile(fileUuid)` с current runtime
   context.
3. Создавать object URL для image preview.
4. Делать `URL.revokeObjectURL` при unmount или смене reference.
5. Использовать stable placeholder dimensions, чтобы не ломать scroll.
6. Сохранить старые visual image preview proportions/classes, где это
   практически возможно.
7. При ошибке preview оставлять downloadable placeholder.
8. Не гонять Workspace images через legacy `protected-message-media.hook.ts`,
   если он не выделен в Workspace-safe helper от `fileUuid`.

Готовность:

- `![photo.png](workspace-file://uuid?content_type=image/png)` показывает inline
  image preview;
- live DOM не содержит backend download URL в `src`;
- object URLs чистятся;
- failed preview все равно позволяет скачать файл;
- scroll anchor не ломается после preview load.

Проверка:

```bash
npm run test --workspace=web -- --run src/widgets/workspace-message-list/workspace-message-list.ui.test.tsx src/shared/lib/workspace-message-render/workspace-message-render.test.ts
npm run typecheck --workspace=web
```

## Фаза 5. Старый media viewer UI с Workspace data

Субагент: viewer adapter.

Цель: переиспользовать существующий media viewer UI один в один, но кормить его
Workspace media items.

Вероятные файлы:

- `packages/web/src/features/media-viewer/media-viewer.types.ts`
- `packages/web/src/features/media-viewer/media-viewer-actions.lib.ts`
- `packages/web/src/features/media-viewer/media-viewer-overlay.ui.tsx`
- `packages/web/src/features/media-viewer/media-viewer.model.ts`
- новый Workspace adapter под `widgets/workspace-message-list/` или
  `features/media-viewer/`

Задачи:

1. Не менять визуальную структуру `MediaViewerOverlay`, backdrop, toolbar,
   controls, thumbnails и zoom.
2. Добавить минимальное data extension, чтобы viewer item мог представлять
   Workspace file через `fileUuid`.
3. Научить viewer display URL resolution понимать Workspace item:
   `fileUuid -> authorized fetch -> Blob/object URL`.
4. Download в viewer должен использовать тот же Workspace file download flow.
5. `Open in new tab` разрешать только когда display URL уже resolved и safe.
6. Сохранить zoom, close, Escape, backdrop navigation, arrows, thumbnails и
   toolbar download behavior.
7. Не менять старое Zulip viewer behavior.

Готовность:

- click по Workspace image preview открывает старый viewer UI;
- toolbar layout и controls визуально прежние;
- download from viewer работает для Workspace file item;
- close/navigation чистит object URLs;
- старые user_upload viewer tests проходят или остаются не затронуты.

Проверка:

```bash
npm run test --workspace=web -- --run src/features/media-viewer/media-viewer.test.ts src/features/media-viewer/media-viewer-overlay.test.tsx src/widgets/workspace-message-list/workspace-message-list.ui.test.tsx
npm run typecheck --workspace=web
```

## Фаза 6. Workspace gallery collection

Субагент: gallery collector.

Цель: собрать gallery из Workspace message documents, а не из rendered HTML.

Вероятные файлы:

- `packages/web/src/widgets/workspace-message-list/workspace-message-list.ui.tsx`
- `packages/web/src/widgets/workspace-message-list/workspace-message-bubble.ui.tsx`
- новый `workspace-message-list-media.lib.ts`
- `packages/web/src/shared/lib/workspace-message-render/workspace-message-parse.lib.ts`

Задачи:

1. Для каждого Workspace message парсить markdown в document.
2. Собирать `WorkspaceMessageFileReference`, где `kind === "media"`.
3. Дедуп делать по `fileUuid`.
4. Сохранять порядок сообщений и порядок media внутри сообщения.
5. Построить lookup `fileUuid -> gallery index`.
6. По click на image открыть старый viewer со всеми media текущего conversation
   и индексом clicked item.
7. Не использовать старый `message-list-media.lib.ts` как Workspace source of
   truth.

Готовность:

- conversation с несколькими Workspace images открывается как multi-item gallery;
- clicked image открывается с правильным index;
- дубли с одинаковым `fileUuid` не создают duplicate gallery items;
- HTML regex не используется как Workspace source of truth.

Проверка:

```bash
npm run test --workspace=web -- --run src/widgets/workspace-message-list/workspace-message-list.ui.test.tsx
npm run typecheck --workspace=web
```

## Фаза 7. Обычные ссылки и link previews

Субагент: links.

Цель: обычные ссылки должны работать отдельно от file references.

Вероятные файлы:

- `packages/web/src/shared/lib/workspace-message-render/workspace-message-render.lib.ts`
- `packages/web/src/widgets/workspace-message-list/workspace-message-body-interactions.hook.ts`
- link preview files, если product scope включает previews

Задачи:

1. `https://...` links оставить обычными safe external links.
2. Workspace message permalinks оставить internal message route links.
3. `workspace-file://` никогда не выпускать как browser navigation link.
4. Если link previews входят в scope, делать их только для ordinary external
   links, не для file references.
5. Сохранить protocol safety checks для `javascript:`, `data:`, `file:`,
   `blob:`.

Готовность:

- ordinary external links открываются безопасно;
- Workspace message links остаются internal route links;
- file references не попадают в external link handling;
- link previews не пытаются preview Workspace files.

Проверка:

```bash
npm run test --workspace=web -- --run src/shared/lib/workspace-message-render/workspace-message-render.test.ts src/widgets/workspace-message-list/workspace-message-list.ui.test.tsx
npm run typecheck --workspace=web
```

## Фаза 8. Cross-phase QA и visual parity

Субагент: QA.

Цель: проверить old UX/UI parity и integration regressions.

Задачи:

1. Сравнить old viewer UI и Workspace viewer path:
   - overlay;
   - toolbar;
   - arrows;
   - thumbnails;
   - zoom;
   - download button;
   - close behavior.
2. Проверить message bubble layout:
   - одна картинка;
   - картинка с подписью;
   - несколько картинок;
   - PDF attachment;
   - длинное имя файла;
   - upload error;
   - download error.
3. Проверить route/runtime safety:
   - switch chat during upload;
   - switch org/project during preview fetch;
   - unmount message list while object URLs exist.
4. Проверить, что old Zulip media tests проходят или failures не связаны с
   Workspace changes.

Проверка:

```bash
npm run test --workspace=web -- --run src/widgets/workspace-message-list/workspace-message-list.ui.test.tsx src/pages/chat/chat-page-workspace.test.tsx src/features/media-viewer/media-viewer-overlay.test.tsx
npm run typecheck --workspace=web
```

Если orchestrator запрашивает browser QA:

```bash
npm run dev:web
```

Проверить вручную:

- Workspace chat with image upload;
- Workspace chat with attachment upload;
- image preview click into viewer;
- attachment download.

## Параллельность

Можно параллелить после фазы 0:

- Phase 1 can run independently.
- Phase 7 can run independently, если трогает только ordinary links.
- Phase 8 can prepare test matrix, но финальная проверка ждет реализации.

Зависимости:

- Phase 2 зависит от Phase 1 upload helper.
- Phase 3 зависит от current render placeholders и Phase 1 download helper.
- Phase 4 зависит от Phase 1 download helper и current render references.
- Phase 5 зависит от Phase 4 display URL semantics или согласованного viewer
  item extension.
- Phase 6 зависит от Phase 5 viewer adapter и current parse/document model.

Рекомендуемый порядок оркестрации:

1. Сначала API/transport subagent.
2. После transport: composer/upload и attachment/download subagents можно
   запустить параллельно.
3. Inline preview subagent после стабильного download.
4. Viewer adapter subagent после стабильной preview data shape.
5. Gallery collector после viewer adapter.
6. QA после merge всех фаз.

## Review checklist

Перед приемкой:

- Message markdown хранит `workspace-file://`, не backend URLs.
- Workspace upload не импортирует `zulip-upload`.
- Workspace render не импортирует old `message-list-media.lib.ts`.
- Viewer UI visually preserved.
- Новые Workspace adapters маленькие и file-UUID based.
- Object URLs clean up через `URL.revokeObjectURL`.
- Abort signals учитываются при route/runtime changes.
- Старое media viewer behavior не сломано.
- Tests покрывают parser, upload, download, preview, viewer, gallery и links.
