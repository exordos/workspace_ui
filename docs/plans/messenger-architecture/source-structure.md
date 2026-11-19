# Предлагаемая структура src

[Карта заметок](README.md) · [Связи и зависимости](dependencies.md) · [Ответственность модулей](modules.md)

Вариант обсуждения от 19 ноября 2026 года. Согласовано направление разделения на продуктовые приложения в `applications` и общие бизнес-модули в `modules`. Точные контракты и состав файлов ещё уточняются. Действующая структура описана в [архитектуре проекта](../../fsd-architecture.md).

В предыдущем варианте приложения и общий `users` располагались вместе в `modules`. Разделение делает видимыми разные роли. У приложения есть экраны, навигация и жизненный цикл. Общий бизнес-модуль предоставляет возможности нескольким приложениям. Workspace может собираться и выпускаться вместе.

## Верхний уровень

| Каталог        | Назначение                                                                   |
| -------------- | ---------------------------------------------------------------------------- |
| `app`          | Сборка Workspace, оболочка, маршруты и совместные сценарии приложений        |
| `applications` | Мессенджер, календарь и почта со своими экранами, моделями и сценариями      |
| `modules`      | Общие бизнес-возможности, например каталог пользователей                     |
| `platform`     | Сессии, авторизация, транспорт, работа с хранилищами и системные возможности |
| `shared`       | Общие UI-компоненты, оформление и независимые функции                        |

## Дерево

```text
src/
  app/
    app.tsx
    router.tsx
    compose-workspace.ts
    shell/
      workspace-shell.tsx
      navigation.tsx
    integrations/
      create-meeting-from-message.ts

  platform/
    auth/
    sessions/
    http/
    realtime/
    storage/
    desktop/
    notifications/

  shared/
    ui/
      button/
      checkbox/
      dialog/
      avatar/
    lib/
    i18n/
    styles/
    assets/

  applications/
    messenger/
      messenger.ts
      create-messenger.ts
      pages/
        messenger-page.tsx

      chats/
        chats.ts
        chat.ts
        topic.ts
        chats-store.ts
        chats-api.ts
        chats-cache.ts
        ui/
          chat-list.tsx
          chat-list-connected.tsx

      messages/
        messages.ts
        message.ts
        message-window.ts
        messages-store.ts
        messages-api.ts
        messages-cache.ts
        message-adapter.ts
        load-window.ts
        load-page.ts
        apply-message-event.ts

      drafts/
        drafts.ts
        draft.ts
        drafts-store.ts
        drafts-api.ts
        drafts-cache.ts
        sync-draft.ts

      sending/
        sending.ts
        outgoing-message.ts
        outbox-store.ts
        submit-draft.ts
        deliver-message.ts
        reconcile-confirmation.ts

      crypto/
        crypto.ts
        crypto-session.ts
        encrypt-message.ts
        decrypt-message.ts

      presentation/
        presentation.ts
        message-presentation.ts
        prepare-message.ts

      composer/
        composer-connected.tsx
        composer-view.tsx
        use-composer-interactions.ts

      timeline/
        timeline-connected.tsx
        timeline-view.tsx
        use-timeline-scroll.ts
        ui/
          message-bubble.tsx
          message-status.tsx
          unread-divider.tsx

      polls/
        polls.ts
        poll.ts
        polls-store.ts
        ui/
          poll-connected.tsx
          poll-view.tsx
          create-poll-dialog.tsx

      sync/
        bootstrap.ts
        apply-event.ts
        recover-session.ts

    calendar/
      calendar.ts
      create-calendar.ts
      pages/
      events/
      calendars/

    mail/
      mail.ts
      create-mail.ts
      pages/
      letters/
      folders/
      sending/

  modules/
    users/
      users.ts
      user.ts
      users-store.ts
      users-api.ts
      users-cache.ts
```

Дерево иллюстрирует предполагаемые места ответственности. Файлы создаются по потребности сценария. Тесты и истории компонентов располагаются рядом с соответствующим кодом. Почта и календарь пока показаны предварительно.

## Доменные сущности

Сущность хранится у своего бизнес-владельца. Например, `applications/messenger/messages/message.ts` описывает сообщение и чистые правила модели, `applications/messenger/chats/chat.ts` — чат, `applications/messenger/drafts/draft.ts` — черновик. Встреча принадлежит `applications/calendar/events`, а общий пользователь — `modules/users`. Отдельная глобальная папка `entities` в этом варианте не предложена. Store хранит текущее состояние, API выполняет запросы, adapter преобразует DTO в доменную модель.

```ts
// messages/message.ts
type Message = MarkdownMessage | EncryptedMessage | PollMessage;

// messages/message-adapter.ts
function adaptMessage(dto: MessageDto): Message;

// messages/messages.ts
function openWindow(request: OpenWindowRequest): WindowRequest;
```

Названия и сигнатуры абстрактные. Форма доменной сущности и способ реализации сервиса выбираются отдельно.

## Общий каталог пользователей

В первом предложении модуль назывался `people`. Для каталога пользователей Workspace предложено более точное имя `users`. Мессенджер, календарь и почта могут читать его публичный интерфейс для имён, аватаров, профилей и выбора человека.

Модуль владеет общими данными пользователя и их обновлением. Роль в чате остаётся в мессенджере, ответ на приглашение — в календаре. Приложения используют публичный интерфейс `modules/users`. При реализации ещё нужно определить общие поля и контекст доступа к каталогу.

Другие общие бизнес-модули выделяем по конкретному повторно используемому поведению. Например, отправка сообщения и отправка письма могут оставаться разными сценариями своих приложений. Публичные входы и проверка зависимостей требуют поддержки, поэтому перенос ответственности в общий модуль должен давать понятную пользу потребителям.

## Сборка модулей

```ts
const users = createUsers({ http, storage, session });
const messenger = createMessenger({
  session,
  http,
  storage,
  realtime,
  users,
});
const calendar = createCalendar({ session, users, http, storage });
```

Мессенджер и календарь получают один экземпляр `users` в рамках нужной сессии. Внутри мессенджера сборка также выражает зависимости.

```ts
const drafts = createDrafts({ session, http, storage });
const messages = createMessages({ session, http, storage });
const crypto = createCrypto({ session });
const sending = createSending({ drafts, messages, crypto });
```

Страница получает готовые части и собирает экран. Composer вызывает операции черновика и отправки, лента читает окно сообщений, а `sync` координирует запуск и направление событий. Классы, функции, объекты и срок жизни экземпляров остаются открытыми решениями.

После создания приложений `app` может собрать совместное действие и передать его экрану через callback. Абстрактные примеры `createMeetingIntegration` и `MessengerActions` сохранены в [контрактах интеграций](integrations.md).
