# Workspace External Integrations Migration Plan

Дата среза: 2026-07-22.

## Цель

Перевести пользовательское подключение внешних сервисов со старого контракта
external accounts на актуальный Workspace Messenger API. Первый поддержанный
провайдер — Zulip. Новый путь не использует старые Zulip endpoints и не
подставляет скрытые резервные вызовы.

Пользовательский сценарий разделяется на два этапа:

```text
Подключение аккаунта Zulip
        ↓
Получение каталога доступных чатов
        ↓
Выбор чатов
        ↓
Создание обычных Workspace streams/topics
        ↓
Фоновая загрузка истории и постоянная синхронизация
```

Административные provider policy, provider health и bridge instance экраны не
входят в эту миграцию. Они будут отдельной задачей.

## Источники истины

- `../workspace_backend/docs/workspace_api.md`
- `../workspace_backend/docs/zulip_bridge_v1_product_and_api.md`
- `../workspace_backend/workspace/messenger_api/dm/external_models.py`
- `../workspace_backend/workspace/messenger_api/api/controllers.py`
- `docs/PROJECT_FACTS.md`
- `docs/ORG_SCOPED_ASYNC_SAFETY.md`

Локальный backend при анализе: ветка `master`.

## Зафиксированные продуктовые решения

1. Подключение аккаунта и синхронизация чатов — разные экраны и разные
   пользовательские действия.
2. Первое подключение всегда создается с `selection_mode=explicit`.
3. Начальная глубина истории — `30_days`.
4. Начальный `default_project_id` — текущий Workspace project.
5. После подключения ни один чат не выбирается автоматически.
6. Пользователь выбирает несколько чатов и нажимает одну кнопку. Frontend
   выполняет отдельный `select` для каждого ресурса чата.
7. После успешного `select` не ждем полной загрузки истории: экран можно
   закрыть, а прогресс остается видимым на странице интеграции.
8. Проценты и ETA не показываем: публичный API их не отдает.
9. Готовность считаем по чатам: `live / selected`, например «2 из 4 чатов
   готовы».
10. После создания проекции обычный мессенджер читает чат только как Workspace
    `stream`, `stream_topic` и `message`. `external_chat` используется для
    управления интеграцией и ее состоянием.

## Граница старого и нового пути

Текущий frontend ожидает старую форму:

```json
{
  "server_url": "...",
  "account_settings": {
    "kind": "zulip",
    "credentials": {
      "kind": "zulip",
      "login": "...",
      "token": "..."
    }
  }
}
```

Старые поля `account_type`, `new | active`, `access_status`, `user_info` и
`account_settings.credentials` не входят в новый домен. Их нельзя сохранять
как промежуточную совместимую модель.

Новый запрос:

```json
{
  "uuid": "client-generated-uuid",
  "settings": {
    "kind": "zulip",
    "server_url": "https://chat.example.com",
    "email": "user@example.com",
    "api_key": "write-only",
    "selection_mode": "explicit",
    "history_depth": "30_days",
    "default_project_id": "project-uuid"
  }
}
```

Старый API и типы удаляются из целевого пути одним срезом. Новый код не
поддерживает два формата ответа одновременно.

## Этап 1. Подключение аккаунта

### Экран

Форма содержит только:

- HTTPS URL сервера;
- email Zulip;
- API key;
- действия «Отмена» и «Подключить».

Технические `explicit`, `30_days` и текущий project frontend добавляет в
запрос. API key хранится только в локальном состоянии формы до завершения
запроса. Он не попадает в Zustand, IndexedDB, логи или аналитику.

### Запрос

```http
POST /external_accounts/
```

UUID генерируется один раз при отправке и сохраняется на время попытки. Нельзя
создавать новый UUID при автоматическом повторе того же запроса.

### Состояния формы

| Backend state     | Представление                                   |
| ----------------- | ----------------------------------------------- |
| POST выполняется  | «Отправляем данные…»                            |
| `connecting`      | «Проверяем подключение…»                        |
| `live_ready=true` | «Аккаунт подключен»                             |
| `auth_required`   | Ошибка данных и действие «Ввести заново»        |
| `degraded`        | Безопасная ошибка и действие повторной проверки |
| `disconnected`    | «Синхронизация остановлена»                     |
| `suspended`       | «Интеграция приостановлена администратором»     |

Успех этапа определяется по `live_ready`, а не только по `status=live`.

После POST состояние обновляется из `external_account.updated`. Если realtime
недоступен, выполняется ограниченное фоновое обновление конкретного аккаунта.
Опрос прекращается при терминальной ошибке, `live_ready=true`, закрытии
runtime или смене owner/org/project.

### Переподключение

URL, email и API key меняются только через:

```http
POST /external_accounts/{account_uuid}/actions/reconnect/invoke
If-Match: "<etag>"
```

Переподключение не используется для изменения глубины истории или проекта.

## Этап 2. Каталог и синхронизация чатов

### Загрузка каталога

```http
GET /external_chats/?external_account_uuid={account_uuid}
```

Экран различает:

- восстановление кеша;
- загрузку каталога;
- готовый пустой каталог;
- каталог с чатами;
- ошибку загрузки.

Пока backend не отдает отдельный `catalog_ready`, пустой ответ нельзя сразу
показывать как окончательное «Чатов нет». После `live_ready` выполняется
повторное фоновое обновление каталога.

### Настройки до выбора

На экране доступны:

- глубина истории: `new`, `7_days`, `30_days`, `90_days`, `all`;
- текущий проект назначения.

Сохранение выполняется до запуска выбранных чатов:

```http
PUT /external_accounts/{account_uuid}
If-Match: "<etag>"
```

```json
{
  "settings": {
    "kind": "zulip",
    "selection_mode": "explicit",
    "history_depth": "30_days",
    "default_project_id": "project-uuid"
  }
}
```

Frontend отправляет всю изменяемую settings-модель. При `412` получает свежий
снимок, сообщает о конфликте и не запускает выбор чатов до решения конфликта.

### Выбор чатов

Для каждого отмеченного чата:

```http
POST /external_chats/{chat_uuid}/actions/select/invoke
```

```json
{
  "project_id": "project-uuid"
}
```

Пользователь нажимает одну кнопку. Внутри используется очередь с ограничением
3–5 параллельных запросов. Независимые результаты не образуют транзакцию:
частичный успех допустим и отображается явно.

```text
Поддержка       ✓ Запущено
Разработка      ◌ Запускаем
Команда         ○ Ожидает
Проект Alpha    ! Не удалось
```

Если HTTP-запрос `select` не прошел и чат остался невыбранным, можно повторить
`select` только для этого чата.

### Фоновая синхронизация

После ответа `select` чат обычно переходит в `syncing`. Пользователь может
закрыть экран. Дальнейшие изменения приходят через `external_chat.updated`.

| Chat state   | Представление                                 |
| ------------ | --------------------------------------------- |
| `available`  | «Не подключен»                                |
| `syncing`    | Неопределенный индикатор «Загружаем историю…» |
| `live`       | «Синхронизация работает»                      |
| `degraded`   | «Проблема синхронизации» + `safe_error`       |
| `deselected` | «Отключен»                                    |

Общий прогресс вычисляется по выбранным чатам:

```text
ready = selected chats with status=live
total = selected chats
```

Пример: «2 из 4 чатов готовы». Это прогресс по чатам, не по сообщениям.

## Ошибки и повторный запуск

Текущий API не содержит действия `external_chat.retry`.

Нужно различать три случая:

1. `select` завершился HTTP-ошибкой, ресурс не был выбран. Повторяем `select`.
2. Чат выбран и находится в `syncing`. Ничего не перезапускаем: backend и
   bridge продолжают фоновую работу и свои повторы.
3. Чат выбран и перешел в `degraded`. Повторный `select` с тем же project не
   перезапускает работу.

Для третьего случая текущий технический способ:

```text
deselect → ожидание deselected → select
```

`deselect` удаляет Workspace-проекцию и отменяет связанную работу. Поэтому UI
не называет это обычным «Повторить» и не выполняет автоматически. Допустимое
действие — «Перезапустить синхронизацию» с подтверждением:

> Текущая проекция чата будет удалена и создана заново. История будет загружена
> повторно.

Для первой поставки это действие можно не показывать. Достаточно вывести
`safe_error` и предложить обратиться к администратору. Безопасный недеструктивный
retry потребует отдельного backend action.

`external_operations/{operation_uuid}/actions/retry/invoke` относится к
конкретным внешним операциям доставки и не является общим retry загрузки чата.

## Обычный Messenger после проекции

После выбора backend создает обычную структуру:

```text
external_chat.projection_stream_uuid
        ↓
Workspace stream
        ↓
stream topics
        ↓
messages
```

Sidebar, список тем, сообщения, unread и поиск продолжают читать стандартные
Messenger resources и события. Они не загружают сообщения через
`external_chats`.

Provider metadata сохраняется в обычных stream/topic/message DTO. UI использует
ее для значка Zulip, ссылки на оригинал и проверки возможностей, но не создает
отдельный Zulip-shaped мессенджерный store.

## Доменная модель frontend

### External account

Минимальная модель:

- `uuid`;
- безопасные `settings` без API key;
- `credentialPresent`;
- `status`;
- `liveReady`;
- `capabilities`;
- `safeError`;
- `desiredGeneration`;
- `appliedGeneration`;
- `lastProgressAt`;
- `revision`;
- `createdAt`, `updatedAt`;
- сохраненный сильный ETag для изменяемых действий.

### External chat

Минимальная модель:

- `uuid`;
- `externalAccountUuid`;
- `source`;
- `displayName`;
- `selected`;
- `projectId`;
- `historyDepth`;
- `projectionStreamUuid`;
- `status`;
- `capabilities`;
- `safeError`;
- `transitionPending`;
- `revision`;
- `createdAt`, `updatedAt`;
- ETag для move и будущих revision-safe действий.

Backend DTO преобразуются в доменные модели до записи в store.

## FSD ownership

### `shared/api`

- актуальные DTO и guards external account;
- API-функции account create/get/update/reconnect/disconnect/delete;
- DTO и guards external chat;
- API-функции catalog/select/deselect/move;
- чтение ETag из ответов без утечки транспортных деталей в UI.

Импорты только из конкретных файлов, без barrel `index.ts`.

### `entities/external-account`

- доменная модель и адаптеры;
- owner/org/project-scoped Zustand store;
- cache-first loader;
- долговременный кеш;
- применение full-snapshot realtime events;
- защита от запоздавших записей после смены runtime.

### `entities/external-chat`

- нормализованный каталог по account UUID;
- узкие селекторы отдельного чата и счетчиков;
- cache-first loader;
- применение realtime snapshots;
- вычисление `ready/total/degraded` вне компонентов.

### `features/connect-external-account`

- форма credentials;
- создание аккаунта;
- ожидание `live_ready`;
- переподключение после `auth_required`;
- API key живет только в локальном draft.

### `features/configure-external-chats`

- поиск и множественный выбор;
- изменение history/project до выбора;
- ограниченная очередь `select`;
- частичный успех;
- повтор только неуспешных HTTP `select`;
- необязательный подтверждаемый restart через deselect/select.

### `pages/services`

Страница остается тонкой: компонует список интеграций и feature-экраны. API,
очереди, преобразование DTO и retry-решения в page не размещаются.

## Cache и realtime

Используется SWR-подход:

1. восстановить account/chat snapshots из IndexedDB;
2. показать сохраненное состояние с признаком обновления;
3. параллельно получить свежие accounts и chats;
4. заменить активный store и кеш только при совпадении owner/org/project key;
5. применять `external_account.*` и `external_chat.*` full snapshots;
6. при cursor gap/epoch mismatch очистить соответствующий кеш и получить полный
   REST snapshot до включения уведомлений.

API key, raw provider identifiers, message bodies и `safe_error` не логируются.

Списки используют узкие Zustand selectors. Счетчики `ready`, `syncing` и
`degraded` кешируются в entity-слое; изменение одного чата не должно
перерисовывать весь экран подключения. Независимые начальные запросы запускаются
параллельно, без последовательного waterfall.

## Фазы реализации

### Фаза 1. Contract cutover

- заменить старые external-account DTO новым контрактом;
- реализовать все account API-функции и ETag;
- переписать адаптер, store и кеш;
- удалить `iam` и старые статусы из модели внешней интеграции;
- покрыть guards, адаптеры и transport tests.

Критерий: список аккаунтов читается из нового API, старый формат не принимается.

### Фаза 2. Подключение аккаунта

- обновить форму URL/email/API key;
- отправлять `explicit`, `30_days`, текущий project;
- добавить состояния нового жизненного цикла;
- подключить account realtime events;
- реализовать reconnect;
- добавить RU/EN тексты.

Критерий: пользователь создает аккаунт, видит `connecting` и достигает
`live_ready` без перезагрузки страницы.

### Фаза 3. Каталог чатов

- создать external-chat DTO/entity/store/cache;
- загрузить пагинированный каталог;
- добавить поиск и выбор;
- добавить настройку history/project через revision-safe PUT;
- сохранить выбор при обновлениях каталога.

Критерий: после подключения пользователь видит доступные Zulip-чаты, но они еще
не появляются в Messenger как streams.

### Фаза 4. Запуск и наблюдение

- реализовать ограниченную очередь select;
- показывать частичный успех;
- применить external-chat realtime events;
- показывать `ready/total` и список `live/syncing/degraded`;
- проверить появление проекций через обычные Messenger stores/events;
- восстановить состояние после reload и смены runtime.

Критерий: несколько выбранных чатов независимо переходят в `syncing/live`, а
обычный Messenger получает их как streams/topics.

### Фаза 5. Управление существующим подключением

- account settings;
- reconnect/disconnect/delete;
- deselect/move отдельного чата;
- подтверждения разрушительных действий;
- при необходимости подтверждаемый restart degraded-чата.

Критерий: жизненный цикл интеграции управляется без старого Zulip API.

### Фаза 6. Cleanup

- удалить старые DTO, adapters, guards и тестовые fixtures;
- удалить старые тексты `login/token/access_status`;
- проверить отсутствие импортов старого пути;
- обновить справочную документацию.

## Проверки

### Unit/Vitest

- строгие DTO guards для каждого account/chat status;
- write-only API key отсутствует в response/domain/cache;
- адаптеры и ETag;
- store owner/org/project isolation;
- stale async write protection;
- full-snapshot event create/update/delete;
- счетчики `ready/total/degraded`;
- очередь select, лимит параллельности и частичные ошибки;
- `412` settings conflict;
- restart confirmation не выполняет deselect автоматически.

### Typecheck

Обязателен после каждой фазы, меняющей DTO, store или realtime payload.

### E2E

1. Подключить Zulip и дождаться `live_ready`.
2. Перезагрузить приложение и восстановить подключенный аккаунт.
3. Получить каталог без автоматического создания streams.
4. Выбрать четыре чата и получить смешанные `live/syncing/degraded` состояния.
5. Увидеть «2 из 4 чатов готовы».
6. Перезагрузить приложение во время backfill и восстановить ту же картину.
7. Убедиться, что live-чаты появились в обычном sidebar.
8. Проверить auth_required/reconnect.
9. Проверить disconnect и destructive delete.
10. Проверить смену organization/project во время запросов.

## Backend contract gaps

Блокирующие для корректной семантики второго этапа:

1. Подтвердить и при необходимости исправить перенос
   `account.settings.history_depth` в assignment выбранного чата.
2. Определить безопасный публичный признак `catalog_ready` либо точную
   capability для готовности каталога.
3. Гарантировать owner-visible external-chat events для еще не назначенных в
   проект каталоговых ресурсов.

Неблокирующие:

4. Стабильная причина `403`: provider disabled, suspended или limit reached.
5. Недеструктивный `external_chat.retry` для выбранного degraded-чата.
6. Пакетный select с частичными результатами.
7. Публичный message-level progress и ETA — сознательно отложены.

До закрытия первого пробела UI сохраняет выбор history depth, но не обещает,
что backend применил его к assignment. До появления безопасного retry UI не
показывает обычную кнопку «Повторить» для уже выбранного degraded-чата.

## Definition of done

- Новый внешний аккаунт создается только через Workspace Messenger API.
- В целевом пути отсутствуют старые external-account DTO и Zulip fallback.
- Подключение и выбор чатов разделены на два понятных этапа.
- Выбранные чаты управляются через `external_chats`, но отображаются в
  мессенджере как обычные Workspace streams/topics/messages.
- Состояние `live/syncing/degraded` и «N из M готовы» восстанавливается после
  перезапуска клиента.
- Секреты не попадают в store, кеш, события или логи.
- Все записи scoped по owner/org/project и защищены от stale async writes.
- RU и EN локализации полны.
- Узкие vitest, `npm run typecheck` и целевые E2E проходят.
