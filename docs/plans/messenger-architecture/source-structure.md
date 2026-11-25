# Целевая структура src

[Карта заметок](README.md) · [Связи и зависимости](dependencies.md) · [Ответственность модулей](modules.md)

Согласованное направление рефакторинга. Workspace делится на продуктовые `applications` и общие бизнес-`modules`. Внутри мессенджера выбрано направление `pages → features → model`. Дерево и примеры показывают целевые границы. Имена файлов, сигнатуры и порядок переноса уточняются при реализации. Для существующего кода действует [текущая архитектура](../../fsd-architecture.md).

## Верхний уровень

| Каталог        | Назначение                                                                   |
| -------------- | ---------------------------------------------------------------------------- |
| `app`          | Сборка Workspace, оболочка, маршруты и совместные сценарии приложений        |
| `applications` | Мессенджер, календарь и почта со своими экранами, моделями и сценариями      |
| `modules`      | Общие бизнес-возможности, например каталог пользователей                     |
| `platform`     | Сессии, авторизация, транспорт, работа с хранилищами и системные возможности |
| `shared`       | Общие UI-компоненты, оформление и независимые функции                        |

## Шаг 11. Перенос в applications/messenger

Точка входа шага — каталог и сообщения после переключения потребителей на `chats`, `chat-commands`, `messages`, `messages-consumers` и `message-commands`. Точки сборки в коде — `WorkspaceChatPage`, `TimelineConnected` и ветка мессенджера в оболочке. Команды отправки и загрузки принадлежат моделям, а прокрутка, фокус и состояние диалогов — экрану и features.

1. Переносим контракты `chats`, `messages`, версии черновиков и E2EE вместе с реализациями их операций. Существующие экземпляры каталога, окна сообщений, исходящих, черновиков и криптографии переезжают с владельцами после переключения импортов потребителей. Проверяем, что у каждого экземпляра одна точка создания и пути в старом дереве сняты. Очередь и подтверждение доставки остаются внутри `messages`.
2. Собираем экран в `applications/messenger/pages`. Сайдбар, заголовок, лента, композер, детали чата, подготовка содержимого и опросы переходят в `features` приложения. Страница сохраняет связывание навигации и блоков через подписки, публичные операции, props и callbacks. Общая оболочка Workspace и общие UI-компоненты сохраняют своих владельцев. Маршрут и внешние потребители используют явные входы приложения или его модулей.
3. Переносим доменные реализации синхронизации, сохраняя служебные входы, перечисленные в [инвентаризации](modules.md#оставшиеся-прямые-обращения). Запуск и остановка транспорта, курсор, выход и переключение аккаунта, схема IndexedDB и локальный сброс сохраняют текущую семантику. Шаги 12–14 меняют координацию и убирают временные служебные связи. Для слоя `applications/messenger` описываем действующие правила и точки стыка с прежним деревом в [архитектуре проекта](../../fsd-architecture.md).

Проверяем `npm run typecheck`, `npm run docs:check`, отсутствие ссылок на прежних владельцев и целевые тесты страницы, ленты, черновиков, исходящих, каталога, bootstrap, realtime, E2EE и смены сессии. В браузере с `@mock` проверяем открытие и якорь, отправку с подтверждением, сайдбар и realtime. При переносе обновляем пути импортов Vitest, Storybook и браузерных фикстур.

### Реальные точки входа после переноса

- [Маршрут мессенджера](../../../packages/web/src/applications/messenger/messenger.ts) лениво загружает основной экран в Web и WebView и «Избранное» в Web. Сайдбар и детали чата подключаются в существующие слоты оболочки. Заголовок, лента и композер находятся в `features` приложения.
- [Каталог](../../../packages/web/src/applications/messenger/model/chats/chats.ts), [сообщения](../../../packages/web/src/applications/messenger/model/messages/messages.ts), [черновики](../../../packages/web/src/applications/messenger/model/drafts/composer-draft-actions.lib.ts) и [криптосессии](../../../packages/web/src/applications/messenger/model/crypto/chat-crypto-session.lib.ts) используют прежние экземпляры store и владельцев. Адаптеры DTO расположены в `chats` и `messages`. [Адаптер кеша](../../../packages/web/src/applications/messenger/model/messenger-cache.lib.ts) использует общий IndexedDB и сохраняет действующую связь при удалении чата и восстановлении указателей.
- [Bootstrap](../../../packages/web/src/applications/messenger/runtime/sync/messenger-bootstrap.lib.ts) и [realtime](../../../packages/web/src/applications/messenger/runtime/sync/messenger-realtime-applier.lib.ts) переехали вместе с доменными обработчиками. Их подключение и выбор runtime остаются у оболочки до шага 12. Обработчик внешнего чата вызывает существующую [операцию очистки проекции удалённого чата](../../../packages/web/src/applications/messenger/runtime/sync/messenger-stream-projection-cleanup.lib.ts). При выходе существующая очистка сессии вызывает операцию освобождения черновиков владельца до переноса времени жизни в шаге 13.

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
      clipboard.ts
    notifications/
      notifications.ts

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
      runtime/
        sync/
          bootstrap.ts
          apply-event.ts
          recover-session.ts

      pages/
        messenger/
          messenger-page.tsx
          messenger-layout.tsx
          use-message-link-navigation.ts
          conversation-view.tsx

      features/
        sidebar/
          sidebar.tsx
          sidebar-view.tsx
          sidebar-order.ts
          use-sidebar-order.ts
          ui/
            chat-row.tsx
            chat-search.tsx
        conversation-header/
          conversation-header.tsx
          ui/
            chat-actions.tsx
        timeline/
          timeline-connected.tsx
          use-timeline.ts
          workspace-message-list.tsx
          workspace-message-list-scroll.hook.ts
          ui/
            workspace-message-bubble.tsx
            message-status.tsx
            unread-divider.tsx
        composer/
          composer-connected.tsx
          composer-view.tsx
          use-composer-interactions.ts
        chat-details/
          chat-details.tsx
          ui/
            chat-members.tsx
        decrypted-message/
          decrypted-message.ts
          use-decrypted-messages.ts
        polls/
          polls.ts
          use-poll-actions.ts
          ui/
            poll-body.tsx
            poll-view.tsx
            create-poll-dialog.tsx

      model/
        chats/
          chats.ts
          chat.ts
          topic.ts
          chats-store.ts
          chats-api.ts
          chats-cache.ts
        messages/
          messages.ts
          message.ts
          message-window.ts
          messages-store.ts
          messages-api.ts
          messages-cache.ts
          message-adapter.ts
          apply-message-event.ts
          accept-server-messages.ts
          history/
            load-window.ts
            load-page.ts
            open-around-message.ts
          polls/
            poll.ts
            poll-actions.ts
            merge-poll-snapshot.ts
          outgoing/
            outgoing.ts
            outgoing-message.ts
            outbox-store.ts
            submit-draft.ts
            deliver-message.ts
            reconcile-confirmation.ts
        drafts/
          drafts.ts
          draft.ts
          drafts-store.ts
          drafts-api.ts
          drafts-cache.ts
          sync-draft.ts
        crypto/
          crypto.ts
          crypto-session.ts
          chat-keys.ts
          encrypt-message.ts
          decrypt-message.ts

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
      users-profile.ts
      users-runtime.ts
      users-selectors.ts
      users-types.ts
      user.model.ts
      user-adapters.lib.ts
      user-sync.lib.ts
```

Файлы показаны для ориентации при переносе сценариев. Тесты, истории и ассеты конкретного модуля лежат рядом с кодом. Предметные файлы почты и календаря показаны предварительно. Общий UI, темы и независимые функции берём из Workspace `src/shared`. Хранение, транспорт и системные возможности предоставляет `src/platform`. Граница с Electron описана в [заметке о платформе](platform.md#буфер-обмена-и-мост-electron).

## Как выбрать место для кода

| Место                                 | Что здесь хранится                                                                                                                                | Пример                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pages/messenger`                     | Маршрут, раскладка, связь между блоками и состояние их совместного показа                                                                         | Выбор разговора меняет URL. Страница передаёт `conversationId` в шапку, ленту, композер и правую панель.                                                     |
| `features/*`                          | Самостоятельный блок или сценарий с публичным входом. Внутри могут быть React-компоненты, подписки, подготовка данных и локальное состояние.      | Сайдбар готовит и сортирует строки, лента управляет прокруткой, композер связывает редактор с черновиками и отправкой.                                       |
| `model/*`                             | Данные, бизнес-правила и операции мессенджера, работающие независимо от UI. Здесь есть и модели данных, и сервисы с собственной ответственностью. | `chats` владеет каталогом и закреплением, `messages` — окнами и отправкой, `drafts` — версиями черновиков, `crypto` — криптосессиями и операциями с ключами. |
| `create-messenger.ts`, `runtime/sync` | Сборка сервисов на сессию, запуск и восстановление, направление событий владельцам                                                                | Один runtime сессии обслуживает все её экраны. Принятая в очередь отправка продолжает выполняться после закрытия разговора.                                  |

### Когда появляется feature

Граница появляется, когда у блока есть своё назначение, поведение и понятный контракт с окружением. Например, `Sidebar` показывает каталог и сообщает о выборе разговора, `TimelineConnected` показывает историю разговора, `ComposerConnected` принимает контекст разговора и связывает редактор с сохранением и отправкой. У всех трёх сейчас может быть один экран-потребитель. Позже тот же композер можно подключить к другой поверхности через его контракт. Количество потребителей и размер блока сами по себе место не определяют.

Внутри feature держим подкомпоненты, стили, подготовку props и состояние взаимодействия рядом. Например, `chat-row.tsx` и сравнение строк принадлежат сайдбару. Публичный `Sidebar` скрывает подписки и сортировку. Решение о закреплении чата остаётся в `model/chats`, а порядок закреплённых строк на экране — в `features/sidebar`. Если режим сортировки сохраняется в пользовательских настройках, сайдбар читает выбор через их контракт.

`features/timeline` собирает общую оболочку бабла и выбирает содержимое по типу сообщения. Для опроса лента передаёт `payload` и `pollState` напрямую в `features/polls`. Подтверждённое состояние и команды опроса принадлежат `model/messages`, а фича хранит только состояние взаимодействия. [Опросы и голосование](scenarios/polls.md)

`features/decrypted-message` — общий хук для зашифрованного содержимого. Он вызывает `model/crypto` и выдаёт актуальный открытый текст или состояние подготовки. Лента, цитаты и превью сами выбирают разметку. Обычный Markdown и опрос читаются из сообщения напрямую. Ключами владеет `model/crypto`, шифротекстом — `model/messages`. [Сборка бабла и отзыв ключа](scenarios/present-message.md)

### Когда может понадобиться widgets

В текущем дереве несколько features собираются в `pages`. `ConversationView` связывает шапку, ленту и композер, а `MessengerPage` связывает разговор, сайдбар и правую панель. Этого достаточно для выбранной композиции. Слой `widgets` допустим, если появится составной блок с отдельным контрактом, который имеет смысл подключать целиком. Например, одну и ту же сборку разговора понадобится показать на отдельной поверхности. Тогда можно выделить конкретную композицию и определить её зависимости. Решение о добавлении слоя принимается по этому сценарию.

## Две точки сборки

### Экран и навигация

Страница получает модель активной сессии и связывает блоки. `Sidebar` передаёт намерение выбрать чат через `onSelectChat`. Страница обновляет маршрут. `ConversationView` получает новый `conversationId` и передаёт его блокам разговора. Сайдбар остаётся на месте при смене чата. Правая панель занимает место в раскладке страницы, а `ChatDetails` подписывается на данные выбранного разговора.

```tsx
function MessengerPage({ runtime, route, navigateToChat }) {
  const { conversationId, messageAnchor, detailsOpen } = route;
  const { chats, messages, drafts, crypto } = runtime;

  return (
    <MessengerLayout
      sidebar={
        <Sidebar chats={chats} messages={messages} crypto={crypto} onSelectChat={navigateToChat} />
      }
      details={
        detailsOpen && conversationId ? (
          <ChatDetails chats={chats} conversationId={conversationId} />
        ) : null
      }
    >
      {conversationId && (
        <ConversationView
          conversationId={conversationId}
          messageAnchor={messageAnchor}
          chats={chats}
          messages={messages}
          drafts={drafts}
          crypto={crypto}
        />
      )}
    </MessengerLayout>
  );
}
```

Названия props условные. Фичи читают данные через публичные подписки модели. При открытии ссылки тонкий UI-контроллер layout вызывает `messages.openAroundMessage`. Модель находит сообщение и применяет окно. Контроллер управляет отменой перехода и URL, а `ConversationView` передаёт якорь в ленту для прокрутки. [Открытие ссылки](scenarios/load-messages.md#открытие-ссылки-на-сообщение)

URL хранит состояние, которому нужна прямая ссылка или история переходов. Фокус редактора, меню и раскрытие группы остаются в блоках, которые ими управляют. Если сайдбар должен сохраняться на нескольких маршрутах мессенджера, его подключает общий layout этих маршрутов через тот же публичный вход. [Путь от страницы до списка](scenarios/load-messages.md#порядок-рефакторинга-списка-сообщений)

### Сборка модулей

`app` создаёт общие модули для нужной сессии и передаёт их приложениям. Мессенджер и календарь могут читать один экземпляр `users` этой сессии. Внутри мессенджера `createMessenger` создаёт модель и координатор, который вызывает публичные операции владельцев.

```ts
const users = createUsers({ http, storage, session });
const messenger = createMessenger({ session, http, storage, users });
const calendar = createCalendar({ session, http, storage, users });
```

```ts
// Внутри createMessenger. Сигнатуры условные.
const chats = createChats({ session, http, storage, users });
const drafts = createDrafts({ session, http, storage });
const crypto = createCrypto({ session });
const messages = createMessages({ session, http, storage, drafts, crypto });
const sync = createMessengerSync({ session, chats, messages });
```

Общий транспорт Workspace получает обработчики приложений при сборке. `runtime/sync` направляет пришедшее событие владельцу модели. `messages` принимает данные из HTTP, истории и realtime одним путём и сверяет их с `outgoing`. В сокращённых примерах `repository` обозначает внутреннее хранение подтверждённых сообщений через store, API, cache и adapter. [Жизненный цикл Workspace](workspace-runtime.md) · [Подтверждение отправки](scenarios/send-message.md#решение-отправка-внутри-messages)

Приложение снаружи открывается через `messenger.ts`. После создания приложений `app` может собрать совместное действие и передать его экрану через callback. [Контракты интеграций](integrations.md)

## Доменные сущности

Сущность хранится у своего владельца. `model/messages/message.ts` описывает сообщение, `model/chats/chat.ts` — чат, `model/drafts/draft.ts` — черновик. Store хранит текущее состояние, API выполняет запросы, adapter преобразует DTO в доменную модель. `model/crypto` работает через контракт шифротекста, ключа и контекста разговора. В этот контракт `messages` передаёт нужные поля сообщения. [Граф импортов](dependencies.md#связи-внутри-мессенджера)

## Общий каталог пользователей

`modules/users` владеет каталогом имён, аватаров, профилей и статусов по владельцам сессий. Workspace и Messenger читают каталог, применяют обновления профиля и подключают синхронизацию через его публичный контракт. Роль в чате остаётся в мессенджере, ответ на приглашение — в календаре. [Публичный контракт](scenarios/users-contract.md) · [Правила импортов](../../fsd-architecture.md#workspace-users-imports)

Другие общие бизнес-модули выделяем по конкретному повторно используемому поведению. Например, отправка сообщения и отправка письма могут оставаться разными сценариями своих приложений. Публичные входы и проверка зависимостей требуют поддержки, поэтому перенос ответственности в общий модуль должен давать понятную пользу потребителям.
