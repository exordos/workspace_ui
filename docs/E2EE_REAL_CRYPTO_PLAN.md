# E2EE: переход от mock к реальной криптографии

Дата: 2026-10-02. Статус: криптографические механизмы выбраны; пользователь согласовал изменение локального backend-контракта: публичные metadata поколения передаются в `key_fingerprint`, секрет в backend не передаётся. Это приложение к [этапам интеграции](E2EE_IMPLEMENTATION_PLAN.md), а не подтверждение готового шифрования.

## Принятые решения

- Сообщения: ChaCha20-Poly1305 по RFC 8439, симметричный случайный `GroupKey` длиной 32 байта на `key_uuid`.
- Выдача `GroupKey`: HPKE Base, DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, ChaCha20-Poly1305. Идентификаторы набора: KEM `0x0020`, KDF `0x0001`, AEAD `0x0003`.
- Каждый новый `key_request` получает отдельную пару X25519. Повторная обработка или доставка того же запроса использует ту же пару.
- Приватный ключ запроса сохраняется до сетевого запроса и переживает закрытие страницы, перезапуск и ожидание администратора. TTL сейчас отсутствует.
- После проверенной выдачи одна транзакция сохраняет `GroupKey`, фиксирует завершение запроса и удаляет приватный ключ запроса. Проверенный terminal reject удаляет только секрет своего запроса, не существующий ключ поколения.
- `device_id` и `device_name` — устойчивые метаданные, без постоянной криптографической пары. Автоматический запрос клиентом возможен; доставка ключа администратором без запроса не входит в этот этап.
- Авторство аккаунта доверяется backend. Право выдачи и отклонения проверяет клиент по актуальным правам чата. HPKE Base не удостоверяет отправителя сам по себе.
- Обновление поколения не переписывает историю и не отзывает уже выданные старые ключи. Протоколы ratchet, MLS, recovery и шифрование вложений не входят в текущую задачу.

## Исходная реализация до миграции

Проверен локальный backend PR #180, revision `77f2ced5030271c075d6b09b35e7a267e954601b`, checkout `/private/tmp/workspace-e2ee-pr180`. Его `docs/en/workspace_api.md`, разделы Streams и Messages, требуют `current_encryption_key: { key_uuid, public_key }` при создании encrypted stream; `key_announced` меняет те же metadata. Backend хранит `public_key` как непустую opaque строку и не выполняет криптографическую проверку, но документация называет её публичным ключом чата. Это исходный контракт до согласованной ниже локальной правки.

На старте миграции frontend контракт [ChatCryptoProvider](../packages/web/src/entities/messenger/chat-crypto-provider.types.ts) предполагал пару ключей поколения, а [ChatKeyStorage](../packages/web/src/entities/messenger/chat-key-storage.types.ts) — постоянную пару устройства. [Контроллер](../packages/web/src/entities/messenger/chat-e2ee-controller.lib.ts) держал requests/waiting/processed в памяти; запрос записывался после POST, устойчивых pending request записей не было. [Создание чата](../packages/web/src/entities/messenger/messenger-create-chat-actions.lib.ts) тогда подключало DEV bootstrap, не сохраняющий настоящий секрет. [Mock](../packages/web/src/entities/messenger/chat-dev-crypto.lib.ts) кодирует plaintext, не защищает его. Эти предположения потребовали совместного изменения типов, контроллера и хранения при подключении библиотек.

Graphify использован для навигации; текущие E2EE решения проверены в исходниках, потому что граф не покрывает новые модули полностью. Старые замечания о подписях в архивных заметках не отменяют принятую сейчас модель доверия backend.

## Согласованный контракт: `key_fingerprint` поколения

У симметричного `GroupKey` нет публичной половины. Пользователь разрешил скорректировать локальный backend stand. Выбрано явное имя `key_fingerprint`: `current_encryption_key: { key_uuid, key_fingerprint }` и `key_announced: { kind, key_uuid, key_fingerprint }`. `key_request.public_key` остаётся настоящим публичным X25519 ключом запроса.

Fingerprint — обычный padded Base64 SHA-256 от однозначно кодированного домена приложения, `key_uuid` и случайного 256-битного `GroupKey`. Внутри клиента это `ChatCryptoKeyFingerprint` / `keyFingerprint`. Он проверяет соответствие выданного ключа объявленному поколению; не используется для шифрования, не удостоверяет автора и не раскрывает секрет практическим перебором.

Rename выполняется только в изолированном checkout PR180. Внутренние SQL column names могут сохранять историческое имя; наружный REST/history/WS контракт использует `key_fingerprint`. Старые fixture metadata не преобразуются в настоящие секреты. Для production требуется принятие соответствующего backend-контракта. Контрактная развилка снята; real bootstrap/UI интеграция разрешена.

## Библиотеки и формат

Основные кандидаты подтверждены первичной документацией [hpke-js](https://github.com/dajiaji/hpke-js) и [noble-ciphers](https://github.com/paulmillr/noble-ciphers). Планируемые версии после проверки registry: `@hpke/core` 1.9.0, `@hpke/dhkem-x25519` 1.8.0, `@hpke/chacha20poly1305` 1.8.0, `@noble/ciphers` 2.4.0. Уже имеющийся `@noble/hashes` 2.2.0 оставляем для HKDF/SHA-256, если совместимость подтверждена. Manifest и lockfile меняет один владелец. При несовместимости агент сообщает конкретную причину перед расширением обновления зависимостей.

Математические примитивы не реализуем сами. Наше кодирование envelope и lifecycle — приложение поверх библиотек, не новый стандартный протокол. Стандарт HPKE относится к выдаче, не ко всему формату групповых сообщений.

### Nonce при нескольких отправителях

[RFC 8439](https://www.rfc-editor.org/rfc/rfc8439.html#section-2.8) требует уникального nonce для каждого использования одного ключа. Независимый random 96-bit nonce под общим постоянным ключом не выбираем; несколько устройств и восстановление счётчиков требуют отдельного решения.

Для каждой операции сообщения получаем CSPRNG salt длиной 32 байта. Через HKDF-SHA256 получаем отдельный 32-байтный message key из `GroupKey`, salt и domain-separated context с `stream_uuid`/`key_uuid`. ChaCha20-Poly1305 получает 12 нулевых байт nonce и используется один раз с этим message key. Salt хранится в envelope. Уникальность message key вероятностная, основана на 256-битном salt; постоянный nonce безопасен только при неизменном правиле отдельного нового ключа каждой операции. Это не XChaCha и не использование random nonce под постоянным общим ключом.

Повтор HTTP доставки использует сохранённый ciphertext; повторное шифрование получает новый salt. Salt/derived key не переиспользуются для другого plaintext. CSPRNG недоступен — операция явно не выполняется. Проверки тестируют fresh salt и известные HKDF/ChaCha векторы, а не делают статистические заявления из небольшого числа случайных выборок.

### Envelope и AAD

Один документированный клиентский binary формат с magic/type/version и фиксированными length rules; внешний API получает только Base64 в существующем `content`. Internal discriminator не добавляет API-поля версии или схемы. Не распознавать произвольный ciphertext эвристикой, не пробовать mock после ошибки authentication.

- Message envelope: header, salt32, ciphertext с 16-байтным tag. Все поля header/salt аутентифицируются; неизвестная версия и длина отвергаются до расшифровки.
- Grant envelope: header, HPKE `enc` и ciphertext/tag. Только шифртекст содержит `GroupKey`; secret никогда не попадает в публичные metadata.
- Однозначное AAD кодирование использует фиксированный домен/назначение, wire version, stream UUID и key UUID. AccountId, runtime generation и локальный device storage scope не входят в общий AAD, поскольку они различны у участников.
- Grant дополнительно связывает `request_message_uuid`, sender/recipient device IDs и публичный ключ запроса. HPKE `info` также разделяет назначение. Администратор и получатель получают одинаковые context bytes.
- Message дополнительно может связывать topic UUID и author UUID, если эти значения известны до POST и гарантированы на history/WS. Окончательный минимальный AAD фиксируется до написания provider тестовых vectors; server message UUID нельзя включить до получения серверного ответа.
- Авторство с общим `GroupKey` не доказывается криптографически: любой его обладатель может шифровать. Доверенная backend identity/permissions остаётся принятой границей.

## Устойчивое хранение и восстановление

Отдельная IndexedDB для device metadata, group secrets, staged chat creation, pending requests и terminal receipts. Не message cache/localStorage, не общий Zustand store. Устойчивые адреса используют `WorkspaceRuntimeOwner` + deviceId + stream/key; runtime generation применяется только как live guard. Persistent backend unavailable/quota/private mode — явная ошибка, без незаметного memory fallback.

Хранение экспортируемых секретов в браузере не равно OS hardware vault: код этого origin имеет доступ. Не обещать защиту от XSS, физическое стирание backups или восстановление после очистки site data. Последнее означает новый запрос доступа. Не включать JWT/пароли/ключи/текст сообщений в логи.

### Request lifecycle

1. Создать localRequestId и отдельную пару, устойчиво сохранить `prepared` запись с owner/device/stream/key/publicKey/privateKey до POST.
2. API поддерживает optional canonical `uuid` при POST сообщения: сохранить UUID вместе с парой до dispatch и отправить его как UUID запроса через обычный guard. Ответ обязан вернуть тот же UUID. Секрет остаётся сохранённым до terminal completion.
3. Получить и проверить server message UUID, автора и точное совпадение payload; привязать UUID к localRequestId одной транзакцией.
4. При reload либо потерянном POST response восстановить привязку из authoritative history по точному собственному author/stream/key/device/publicKey. Нельзя присваивать выдуманный UUID. Не удалять секрет после ambiguous timeout; не выполнять слепой повтор POST с новой парой. Если несколько идентичных server сообщений, поддержать явные bindings или показать ambiguous recovery, не угадывать.
5. Ответ может прийти раньше POST ответа/request history. Буферизовать по server UUID; после восстановления привязки обработать вновь. Доставка history+WS+reload идемпотентна.
6. Проверить issuer permission, адресата, поколение, request UUID, request public key и fingerprint объявления. Только затем HPKE open и атомарный `completeGrant`.
7. `completeGrant`: group secret + terminal receipt + delete pending private key в одном IndexedDB transaction с guard прямо перед commit. Отказ транзакции сохраняет request secret для повтора. Уже имеющийся отличный секрет того же поколения не перезаписывается незаметно.
8. Проверенный reject завершает свой запрос атомарно. Гонка grant/reject и несколько admins сериализуются transaction/CAS: первый проверенный terminal исход фиксируется, duplicate не откатывает доступ. Ошибочный grant не terminal и не уничтожает pair.

### Chat creation lifecycle

Создатель выпускает key UUID/GroupKey/fingerprint и сохраняет staged creation до POST, когда stream UUID ещё неизвестен. После проверенного create response транзакция привязывает секрет к stream UUID. Ошибка invitation после успешного stream create не удаляет ключ уже созданного чата. Timeout/reload сохраняет staged secret и требует server reconciliation; не оставлять созданный encrypted chat без ключа. Не удалять staging лишь из-за смены активного account: не показывать/не записывать результат в чужой runtime, восстановить его в первоначальном owner позже.

## Этапы и владельцы

| Этап                      | Владелец                                   | Изменения и gate                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Зафиксировать контракт | Оркестратор + контрактный агент            | Этот план; решение wire fingerprint; registry/import compatibility; точный AAD/envelope spec. Приложение не меняется до согласования интеграционной семантики; решение уже принято для локального стенда.                          |
| 1. Crypto foundation      | Crypto агент                               | Provider операции `createGroupKey`, `createRequestKeyPair`, fingerprint, message encrypt/decrypt, HPKE grant seal/open; разделить типы GroupKey и request private key; dependency manifests/lockfile. Независимо от wire развилки. |
| 2. Durable foundation     | Storage агент (планировщик)                | Device labels отдельно; IndexedDB CRUD и atomic request/creation completion, durable pending states, owner guards. Согласовать типы с владельцем этапа 1, не редактировать один файл одновременно.                                 |
| 3. Lifecycle и API        | Controller/integration агент               | Перевести controller с постоянной device pair, восстановить запросы, права/races, real bootstrap/create staging. Wire интеграция разрешена после принятого решения пользователя.                                                   |
| 4. Обычный UI             | UI агент (планировщик) + integration агент | Подключить существующий composer/list/info; async decrypt local presentation, send/storage unavailable, request/grant/reject handlers; максимум существующих компонентов. Никакой crypto/API/business logic в dumb components.     |
| 5. Независимый review     | Освободившийся агент                       | Проверить protocol/context/nonce/lifecycle, реальные права и отсутствие plaintext leakage. Оркестратор запускает gates и оценивает evidence, не пишет application code.                                                            |
| 6. Проверить локально     | QA агент + оркестратор                     | Два browser accounts/devices, actual PR180 API/history/WS, reload до ответа и после выдачи, отправка обеими сторонами, отрицательные сценарии. Изолированные тестовые чаты, пользовательские данные сохраняются.                   |

Четыре concurrency slots включая оркестратора: параллельно crypto и storage foundation; UI аудит read-only может идти третьим агентом до стабилизации контрактов. Затем UI implementation; review отдельным освободившимся агентом. Shared types/manifests/composition имеют одного владельца на этап. Малые commits разрешены пользователем; staging только своих путей, без push.

## Совместимость с mock

Production composition подключает только real provider. Legacy `DEV_ONLY_NO_CRYPTO_PUBLIC_KEY`, `FIX`, plaintext fixture envelopes не превращаются в настоящее шифрование и не мигрируются в фоне. Оставить старые тестовые чаты явно unsupported/locked в real flow; DEV sandbox может оставаться отдельным явно insecure инструментом, если не пересекается с рабочей отправкой. Не использовать shared secret детерминированно из UUID/metadata. Для QA создавать новые реальные encrypted чаты.

Расшифрованный текст живёт только в scoped presentation/editor memory, проходит existing sanitize/render. Ciphertext остаётся в REST/history/WS/store/cache. Смена owner/generation/stream/key и unmount сбрасывают plaintext и отменяют поздние callbacks. Existing encrypted guards для Markdown send/edit/forward/drafts остаются действующими.

## Проверки и критерии завершения

- Provider: RFC8439 векторы, HKDF известные vectors, HPKE выбранного suite known vectors/library interoperability; exact envelope bytes/length, malformed Base64, tampered salt/header/tag, чужой group/request key, context mismatch, неизвестная версия. Не ограничиваться encrypt/decrypt roundtrip одним кодом.
- Storage: fake IndexedDB transaction tests + реальный browser reload; prepared before POST, atomic write/delete rollback, quota/error, параллельные вкладки, exact owner/address, migration неполной schema и отсутствие plaintext в messenger cache.
- Controller: A→B, A→logout, A→B→A; stale async dispatch/commit; duplicate и out-of-order history/WS; grant-before-request, POST response loss, reject/grant race, several pending requests, forbidden issuer, privilege revoked while awaiting, key rotation, late old-generation reply.
- Creation: durable staging, mismatched response, partial invitation failure, timeout and later restoration, no secret transmitted. Composer не готов до устойчивого сохранения своего GroupKey.
- UI: текст после reload с сохранённым ключом, locked без ключа, loading/error/focus; восстановление pending после закрытия страницы, запрос другим device; никакой decoded строки в generic message store, draft, search, log или notification persistence.
- Gates: focused web tests changed paths; `npm run typecheck`; relevant ESLint/Prettier; `npm run docs:check`; `git diff --check`; полный web suite после интеграции. Browser proof отдельно от unit tests. Native Electron smoke указывается только если реально выполнен.
- Локальный live сценарий: admin создаёт real encrypted stream и пишет, member без ключа видит locked; member запрашивает, закрывает/reopens страницу; admin выдаёт; member получает и хранит key, pending private key удалён, читает старое и отправляет новое; обе стороны видят один bubble и расшифровывают после reload. Network/DB inspection не выводит secrets/credentials.
- Известные дефекты PR180 фильтра `encryption=true` и повторного encrypted direct не маскировать crypto fallback. При необходимости только узкое stand исправление для QA, без изменения рабочего backend.

План считается выполненным после реальных library операций, устойчивого request lifecycle и end-to-end ordinary chat проверки. Наличие только библиотечного roundtrip или тестовой страницы не означает готовый пользовательский сценарий.

## Фактическое состояние foundation

План зафиксирован отдельным commit `5e23c3fb` до реализации. Реализованы library provider, отдельный durable IndexedDB storage и request controller; DEV fixtures приведены к новым контрактам. Provider focused tests: 16, storage: 14, controller/sandbox: 69. Итоговые проверки: полный web suite 488 файлов / 5398 тестов, без unhandled errors; typecheck web и Electron; web production build; scoped ESLint без ошибок, с предупреждениями; docs check 98 документов / 360 ссылок / 3 import paths; diff check. Независимый review не обнаружил P1/P2 в проверенных foundation paths.

**Актуализация 2026-10-03: обычный UI подключён к real provider.** Создание использует durable staging и real bootstrap; composer вызывает real session, bubbles расшифровываются только в presentation memory, панель выполняет запрос/выдачу/отказ. Page и панель совместно владеют одной scoped session; последний consumer освобождает её. Первичная запись device identity атомарно сохраняет победителя между вкладками. Старый mock остаётся отдельным тестовым инструментом и не мигрирует данные автоматически.

Оркестратор проверил обычный браузерный сценарий на frontend `http://127.0.0.1:5176` и локальном backend `http://127.0.0.1:23190`: создание нового encrypted чата, отправка и чтение после reload, запрос второго аккаунта и восстановление pending после reload, выдача администратором, расшифровка истории участником, ответ участника и повторное чтение после reload. Backend использует `key_fingerprint`; request `public_key` сохранён. UI focused tests: 218 в четырёх файлах; shared-session lifecycle: 3; storage: 15. Итоговые gates: полный web suite 491 файл / 5415 тестов без unhandled errors; web/Electron typecheck и web production build прошли; docs check 98 документов / 361 локальная ссылка / 3 import paths. Native Electron smoke не выполнялся. Локальная инфраструктура и ограничения PR180 описаны в [этапах интеграции](E2EE_IMPLEMENTATION_PLAN.md).

Повторный запрос в одной области возобновляет старейший pending request; несколько запросов, созданных параллельно разными вкладками, сохраняются и могут завершиться каждый своим ответом. Staged creation записи доступны по owner/device списком после reload, и подключены к real bootstrap и восстановлению при открытии созданного чата.

### Уточнение UI сообщений — 2026-10-03

По макетам Figma `11026:27022` и `11024:26393` шифрованный текст теперь переиспользует оболочку обычного сообщения: автор вынесен над bubble, время остаётся внутри. Без ключа показываются компактные декоративные размытые строки, без видимой технической информации, предупреждающей карточки или кнопок внутри. Доступное содержимое проходит безопасный renderer только в scoped presentation memory; ciphertext в store/cache не подменяется. Дополнительные загрузчики вложений и цитат, Jitsi и неподдерживаемые действия не включаются вместе с общей оболочкой.

Четыре системных вида отображаются центральными строками без аватара и времени. Подтверждение/отказ используют проверенные права и UUID запроса; запрос после объявления/отказа расположен в отдельной строке. Контекстное меню «Запросить ключ для этого сообщения» передаёт конкретный `key_uuid`, включая историческое поколение. Для неизвестного исторического отпечатка отображается явная ошибка: текущий ключ не подставляется вместо запрошенного. Ответы чужого issuer, поколения или устройства не скрывают доступные действия.

Исторические запросы, выдачи и отказы проверены domain-тестами, включая HPKE и восстановление после reload. Поддержка этих payload на локальном backend подтверждена чтением исходного контракта PR180; live-сценарий перевыпуска ключа не проверялся. Сайдбар, перевыпуск и массовая выдача остаются вне этой доработки.

Проверки: 178 UI-тестов в семи файлах; полный web suite — 492 файла / 5431 тест без unhandled errors; web/Electron typecheck и production build прошли. Оркестратор отдельно проверил обычный browser-flow текущего ключа на новом QA-чате: участник видит компактный locked bubble, через Shift+F10 запрашивает ключ конкретного сообщения; администратор подтверждает запрос прямо в системной строке, после чего участник читает исходный двухстрочный текст и получает доступ к composer. Визуально проверены readable/locked bubbles и системные строки; live-перевыпуск не входил в проверку.
