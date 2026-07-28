# Карта: «Скопировать ссылку» в Workspace Sidebar

Статус: read-only анализ. Код Sidebar, маршрутов, URN и композера не менялся.

## Что уже есть

- Строка канала/личного чата — `widgets/sidebar/sidebar-workspace.ui.tsx:210-315`, обёрнута в `WorkspaceStreamContextMenu`.
- Строка топика — `widgets/sidebar/sidebar-workspace.ui.tsx:117-162`, обёрнута в `WorkspaceTopicContextMenu`.
- Селектор уже готовит данные для копирования:
  - поток: `MessengerSidebarStreamItem.streamUuid`, `title`, `route` — `entities/messenger/messenger-sidebar.lib.ts:224-282`;
  - топик: `MessengerSidebarTopicItem.streamUuid`, `topicUuid`, `title`, `route` — `entities/messenger/messenger-sidebar.lib.ts:188-221`.
- Маршруты уже канонические и UUID-native:
  - `workspaceMessengerStreamRoute(...)` — `shared/lib/workspace-messenger-route.lib.ts:82-93`;
  - `workspaceMessengerTopicRoute(...)` — `shared/lib/workspace-messenger-route.lib.ts:95-107`.
- `SidebarShell` строит эти маршруты с `orgId/projectId`: сначала из текущего Workspace URL, затем из текущего runtime-контекста — `widgets/sidebar/sidebar-shell.ui.tsx:37-56, 95-115`.

Новых запросов к API для действия меню не требуется. Название нужно только для подписи строки; сама копируемая ссылка строится по уже подготовленному маршруту.

## Точные места будущего изменения

### Обязательно

1. `packages/web/src/widgets/sidebar/sidebar-workspace-context-menu.ui.tsx`
   - В массив поточного меню около `:384-414` добавить действие `copy-stream-link`.
   - В массив меню топика около `:589-617` добавить действие `copy-topic-link`.
   - Оба обработчика должны брать `stream.route` или `topic.route`, закрывать меню и вызывать общий `writeText(toShareableUrl(route))`.
   - Ошибку обрабатывать через существующий `reportWorkspaceMenuActionError`; не использовать прямой `navigator.clipboard`.

2. `packages/web/src/i18n/locales/en.json` и `ru.json`
   - Добавить отдельный ключ для «Скопировать ссылку» или два явных ключа для канала и топика.
   - Существующие `message.copied` и `message.copyFailed` можно переиспользовать для результата, если результат показывается через общий тост.

3. `packages/web/src/widgets/sidebar/sidebar-workspace-context-menu.test.tsx`
   - Проверить видимость пункта в меню потока и топика.
   - Проверить точное значение, переданное в буфер, и отсутствие перехода/изменения раскрытия строки.

### Использовать без изменения

- `packages/web/src/shared/lib/deeplinks.ts:148-158` — `toShareableUrl(internalPath)`:
  - в браузере даёт `window.location.origin + scopedPath`;
  - в Electron даёт `ew://open${scopedPath}`.
- `packages/web/src/shared/lib/clipboard.ts:6-41` — `writeText(text)` с правильным разделением Browser/Electron и результатом `boolean`.
- `packages/web/src/shared/ui/dropdown-menu.tsx` — существующий тип `DropdownMenuItem` и текущая отрисовка пунктов.

### Не требуется менять

- `sidebar-workspace.ui.tsx`: строки уже передают меню готовые модели с UUID и route.
- `messenger-sidebar.lib.ts`: маршруты и данные уже формируются в одном месте.
- `workspace-messenger-route.lib.ts`: builders и зарегистрированные маршруты уже покрывают поток и топик.
- `SidebarShell`: для базового варианта не нужно протаскивать отдельные `orgId/projectId` в меню.

## Что не использовать

- Не использовать `deeplink.toStream()` и `deeplink.toTopic()` как основу нового действия: их сигнатуры сохраняют старые числовые аргументы, а при неполном Workspace scope они возвращают корень приложения.
- Не использовать `deeplink.share()`: он может открыть Web Share API, тогда как действие меню называется именно «Скопировать ссылку».
- Не строить ссылку из текущего глобального `orgId` отдельно от `stream.route/topic.route`: это может смешать проект или организацию при переключении сессии.
- Не добавлять Zulip-маршруты, преобразования или запасной путь.

## Нужные проверки

В `sidebar-workspace-context-menu.test.tsx`:

- канал в браузере: копируется полный URL с правильными `orgId/projectId/streamUuid`;
- топик в браузере: копируется полный URL с `streamUuid/topicUuid`;
- личный чат: используется тот же stream-маршрут, без специального старого DM-маршрута;
- Electron: `toShareableUrl` даёт `ew://open/...`;
- отказ или отсутствие Clipboard API не оставляет необработанное отклонение и показывает ошибку;
- действие не вызывает `navigate`, не отмечает чат прочитанным и не меняет раскрытие топиков;
- действие открывается и мышью, и клавишей контекстного меню.

В `shared/lib/deeplinks.test.ts` достаточно добавить регрессионный тест только если меняется `toShareableUrl` или появляется новый помощник. Иначе существующих тестов `toShareableUrl` вместе с проверками меню достаточно.

## Риски multi-org/current project

1. `SidebarShell` предпочитает `orgId/projectId` из URL, а не только текущую сессию. Это правильно: копируемая строка должна соответствовать видимой карточке. Нельзя заменять её на `withCurrentOrgRoute` для неразмеченного пути.
2. `toShareableUrl` сохраняет уже полный `/org/:orgId/project/:projectId/...` путь, поэтому передавать ему нужно именно `route` строки. Если начать пересобирать путь только по UUID из меню, потребуется отдельно передавать и проверять текущий project.
3. После переключения организации или проекта старый асинхронный результат копирования не должен менять состояние нового меню. Лучше сразу вычислить строку в обработчике и не хранить её в общем состоянии; сам `writeText` не пишет в store.
4. Ссылка из Electron будет `ew://`, а не веб-URL. Это соответствует текущему помощнику, но является отдельным продуктовым решением для ссылок, которые хотят отправлять внешнему получателю. Если нужен универсальный URL, потребуется отдельный явный режим, а не скрытый обход.
5. Для закрытых каналов и топиков ссылка может быть корректной, но открыть её сможет только пользователь с правом доступа. Меню не должно делать дополнительный запрос или пытаться заранее проверять доступ.

## Рекомендуемый минимальный срез

Изменить только контекстные меню, два файла переводов и их UI-тесты. Сначала использовать готовые `route` из Sidebar, затем проверить браузерный и Electron-результат. Отдельный ревью после реализации должен проверить, что не появились новые route builders, глобальный fallback, Zulip-зависимость или использование неактуальной организации/проекта.
