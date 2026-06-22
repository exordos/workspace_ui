# Текущее состояние миграции на новый backend

Дата: 2026-06-22

## Цель

Перевести UI только на новый backend Messenger API:

- UUID текущего пользователя берется из IAM access token.
- Текущий пользователь грузится через `GET /api/messenger/v1/users/{uuid}`.
- Список пользователей грузится через `GET /api/messenger/v1/users/`.
- Один пользователь грузится через `GET /api/messenger/v1/users/{uuid}`.
- Удалить OIDC/paste-token flow, Zulip/legacy совместимость и старые endpoint-интеграции.

## Что уже сделано

### Пользователи и auth

- Добавлены/используются:
  - `packages/web/src/shared/lib/access-token-claims.lib.ts`
  - `packages/web/src/shared/api/messenger-users.lib.ts`
- `getCurrentUser()` в `messenger-users.ts` получает UUID из IAM access token и затем вызывает `fetchUser(uuid)`.
- `fetchUsers()` ходит в `/users/`.
- `fetchUser(uuid)` ходит в `/users/{uuid}`.
- Numeric legacy user fetch возвращает `null`.
- Auth типы сведены к IAM Bearer.
- Удалены OIDC/paste-token/desktop-auth/старые IAM/current-user/avatar/profile settings/ProfileFields модули.

### Старые runtime endpoint-ы

Отключены или удалены старые runtime-вызовы:

- `/register`
- `/events`
- `/drafts`
- `/typing`
- `/user_topics`
- `/channels/create`
- `/read_receipts`
- `/saved_snippets`
- `/messages/render`

`rg` по этим строкам в `packages/web/src` после последних правок не находил совпадений, кроме имени feature-папки typing при широком поиске.

### Event queue / register

- `shared/lib/event-loop.ts` превращен в no-network facade.
- Удалены queue/register parser/registry/error модули и тесты.
- Layout hooks больше не регистрируют старую очередь и не вызывают `deleteQueue`.
- Diagnostics UI больше не показывает queue id.

### Composer / snippets / preview

- `fetchSavedSnippets()` возвращает `[]` без сети.
- `createSavedSnippet()` валидирует input и падает с `Saved snippets are unsupported by the current backend` без сети.
- `renderMessageContent()` теперь рендерит markdown локально через `messageBodyToUnsanitizedDisplayHtml`, без `/messages/render`.
- Link-preview комментарии обновлены: ephemeral render больше не документирует `/messages/render`.

### Белый экран

- Причина белого экрана ранее была missing export `fetchStreamMembers(streamUuid)` после удаления старых интеграций.
- `fetchStreamMembers(streamUuid)` восстановлен в `messenger-streams.ts`, реализован через новый `/stream_bindings/`.
- После этого экран приложения открывался.

### Console abort errors

- Playwright показывал 2 console errors вида aborted `GET /api/messenger/v1/messages/...`.
- Исправлено в `packages/web/src/shared/api/client.ts`: `loggingMiddleware` больше не логирует `AbortError`/aborted signal как failed API call.
- Добавлен тест в `client-logging.middleware.test.ts`.

## Проверки, которые проходили

Команды запускались unsandboxed, потому что shell sandbox падает с `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`.

Проходили focused tests:

```bash
npm run test --workspace=web -- \
  src/shared/api/client.test.ts \
  src/shared/lib/logger-request-params.lib.test.ts \
  src/shared/lib/diagnostics-api-latency.lib.test.ts \
  src/shared/lib/event-loop.test.ts \
  src/widgets/layout/layout-messenger-event-loop.hook.test.tsx \
  src/widgets/layout/layout-multi-org-event-streams.lib.test.ts \
  src/widgets/layout/layout-multi-org-polling.lib.test.ts \
  src/features/typing-indicator/typing-indicator.test.ts \
  src/features/mute-chat/mute-chat.test.ts \
  src/features/create-chat/create-chat.api.test.ts \
  src/features/message-readers/message-readers.test.ts \
  src/pages/logs/diagnostics-collect.lib.test.ts \
  src/shared/api/messenger-streams.test.ts \
  src/shared/api/messenger-users.test.ts \
  src/shared/api/messenger-messages.test.ts \
  src/shared/lib/message-link-preview-fetch.lib.test.ts
```

Result: 16 files passed, 285 tests passed.

Composer/link-preview:

```bash
npm run test --workspace=web -- \
  src/widgets/message-composer/message-composer-saved-snippets.model.test.ts \
  src/widgets/message-composer/message-composer.test.tsx \
  src/entities/link-preview/link-preview.model.test.ts
```

Result: 3 files passed, 94 tests passed.

Client logging:

```bash
npm run test --workspace=web -- \
  src/shared/api/client.test.ts \
  src/shared/api/client-logging.middleware.test.ts \
  src/shared/lib/logger-request-params.lib.test.ts
```

Result: 3 files passed, 51 tests passed.

Whitespace check:

```bash
git diff --check
```

Result: clean.

## Playwright проверка

Проверять можно на уже поднятом сервере:

```text
http://workspace.exordos.local/
```

Учетка для проверок:

```text
admin/admin
```

Последняя Playwright проверка:

- URL: `http://workspace.exordos.local/org/workspace.exordos.local/inbox`
- Page title: `Exordos Workspace`
- Экран не белый: видны top bar, sidebar, main messenger area.
- После reload и 5 секунд ожидания: `0 errors`, `0 warnings` в консоли.
- Resource entries по старым endpoint-ам пустые: `/register`, `/events`, `/saved_snippets`, `/messages/render`, `/typing`, `user_topics`, `channels/create`, `read_receipts` не дергались.
- Скрин сохранен: `workspace-inbox-after-api-cleanup.png`.

## Что сейчас красное

`npm run typecheck --workspace=web` все еще красный.

Полный лог был сохранен в `/tmp/workspace-ui-typecheck.log` на текущей машине. На другой машине нужно просто запустить команду заново.

Последняя классификация ошибок:

- всего typecheck ошибок: 846
- production ошибок: 55
- test ошибок: 791

Основные production-хвосты:

- `stream_id`/numeric stream id еще конфликтует с `stream_uuid`/string.
- Некоторые компоненты ожидают `Map<number, ...>`, хотя store уже использует `Map<string, ...>`.
- Chat page/right panel/activity/layout еще местами используют numeric stream/user contracts.
- Удалены mention/register counters, но несколько production/test мест все еще ожидают старые поля/функции.

Примеры production ошибок из последнего typecheck:

- `src/entities/chat-list/chat-list.model.ts`
  - unused imports `WorkspaceRawMessage`, `UserId`
  - `normalizedStreamId` не определен в `renameStream`
- `src/entities/message/message-fetch.lib.ts`
  - передается `streamId`, а `FetchStreamMessagesPageArgs` ожидает `streamUuid`
- `src/entities/unread-sync/unread-surfaces-sync.lib.ts`
  - `ChatListState` не совпадает с `SidebarUnreadLogStateSlice`
- `src/main-app.tsx`
  - folder/chat ids ожидаются numeric, приходят string
- `src/pages/chat/chat-page.ui.tsx`
  - много `string | null` vs `number | null`, `stream_uuid` vs `streamUuid`
- `src/widgets/right-panel/right-panel-info.ui.tsx`
  - `UserId[]` vs `number[]`, stream callbacks still numeric
- `src/widgets/layout/layout.ui.tsx`
  - `Map<string, StreamEntryInternal>` передается туда, где ожидается `Map<number, ...>`

## С чего продолжать

1. Сначала добить production typecheck errors.
   - Повторно запустить:
     ```bash
     npm run typecheck --workspace=web > /tmp/workspace-ui-typecheck.log 2>&1
     ```
   - Отфильтровать production ошибки:
     ```bash
     node -e 'const fs=require("fs"); const lines=fs.readFileSync("/tmp/workspace-ui-typecheck.log","utf8").split(/\n/).filter(l=>/^src\//.test(l)); const prod=lines.filter(l=>!l.includes(".test.")); console.log("total",lines.length,"prod",prod.length,"test",lines.length-prod.length); console.log(prod.join("\n"));'
     ```
2. Начать с маленьких production фиксов:
   - `chat-list.model.ts`: убрать unused imports, исправить `renameStream()` на normalized stream uuid.
   - `message-fetch.lib.ts`: заменить лишний `streamId` на `streamUuid` в `fetchStreamMessagesPage` args.
   - `layout-unread-title.hook.ts`, `layout.ui.tsx`, `activity-page.ui.tsx`: привести map/key types к `streamUuid`.
3. Затем править page/widget контракты:
   - `chat-page.ui.tsx`
   - `right-panel-info.ui.tsx`
   - `activity-page.lib.ts`
   - `main-app.tsx`
4. После production typecheck перейти к тестам пачками:
   - заменить `stream_id` фикстуры на `stream_uuid`/`streamUuid`.
   - заменить `Map<number, ...>` на `Map<string, ...>`.
   - удалить/переписать тесты старых mention/register counters.
5. После каждого блока запускать focused tests, затем снова Playwright.

## Важные рабочие правила

- Не откатывать чужие изменения: worktree сильно грязный, есть unrelated docs `docs/E2EE_CHATS_API_RU.md` и `docs/E2EE_CHATS_RU.md`.
- Для сетевых проверок и shell-команд в этой среде использовался unsandboxed режим.
- `apply_patch` в этой среде падал из-за sandbox helper; правки делались короткими Node-скриптами или форматированием.
- Не считать цель завершенной, пока:
  - production и test typecheck не зеленые или осознанно не разобраны,
  - поиск по старым endpoint/integration строкам не чистый,
  - Playwright снова не подтверждает живой экран и отсутствие старых network calls.
