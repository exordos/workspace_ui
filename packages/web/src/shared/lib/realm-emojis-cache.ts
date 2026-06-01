// Централизует загрузку и кэш realm emoji (кастомных emoji организации) для всего UI.
// Зачем нужен:
// 1) убрать дублирующиеся загрузчики в разных виджетах;
// 2) дедуплицировать параллельные запросы;
// 3) дать единый тестовый reset singleton-состояния.
import { fetchRealmEmojis } from "~/shared/api/zulip-users";
import type { RealmEmoji } from "~/shared/api/zulip.types";

// Единая пустая ссылка для стабильных fallback-значений без лишних аллокаций.
const EMPTY_REALM_EMOJIS: RealmEmoji[] = [];

// В памяти хранит последнее успешно загруженное состояние realm emoji.
let cachedRealmEmojis: RealmEmoji[] = EMPTY_REALM_EMOJIS;
// Флаг успешной загрузки: после true возвращаем кэш без повторного запроса.
let realmEmojisLoaded = false;
// Ссылка на текущий in-flight запрос, чтобы несколько вызовов делили один Promise.
let inFlightRealmEmojisRequest: Promise<RealmEmoji[]> | null = null;

// Возвращает текущий snapshot кэша синхронно.
// Нужен для мгновенной инициализации UI без ожидания эффекта.
export function getCachedRealmEmojis(): RealmEmoji[] {
  return cachedRealmEmojis;
}

// Гарантирует, что realm emoji загружены:
// - если уже загружены, сразу отдаёт кэш;
// - если запрос уже идёт, переиспользует его;
// - иначе запускает новый запрос и сохраняет результат.
export function ensureRealmEmojisLoaded(): Promise<RealmEmoji[]> {
  // Быстрый путь: данные уже готовы в памяти.
  if (realmEmojisLoaded) {
    return Promise.resolve(cachedRealmEmojis);
  }
  // Дедупликация: не создаём второй такой же запрос.
  if (inFlightRealmEmojisRequest != null) {
    return inFlightRealmEmojisRequest;
  }

  inFlightRealmEmojisRequest = fetchRealmEmojis()
    .then((list) => {
      // Нормализуем пустой ответ к стабильной пустой ссылке.
      const normalized = list.length > 0 ? list : EMPTY_REALM_EMOJIS;
      cachedRealmEmojis = normalized;
      // Фиксируем успешную загрузку только после успешного ответа.
      realmEmojisLoaded = true;
      return normalized;
    })
    .finally(() => {
      // Освобождаем ссылку на in-flight запрос в любом исходе.
      // В случае ошибки следующий триггер выполнит новую попытку.
      inFlightRealmEmojisRequest = null;
    });

  return inFlightRealmEmojisRequest;
}

// Сбрасывает singleton-состояние для тестов.
// Нужен для изоляции тест-кейсов и предсказуемых ожиданий по количеству запросов.
export function resetRealmEmojisCacheForTests(): void {
  cachedRealmEmojis = EMPTY_REALM_EMOJIS;
  realmEmojisLoaded = false;
  inFlightRealmEmojisRequest = null;
}
