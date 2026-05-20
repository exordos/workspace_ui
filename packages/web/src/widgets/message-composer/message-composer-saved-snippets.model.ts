// Назначение:
// - Единый model-слой для saved snippets в composer.
// - Держит SWR+TTL политику, in-memory cache и in-flight dedupe вне UI.
// Правила:
// - UI только читает состояние и вызывает actions этого модуля.
// - Данные кэшируются отдельно по instanceId.
// - Ошибка refresh не очищает уже показанный список.
import { create } from "zustand";
import { getCurrentInstance } from "~/shared/api/client";
import type { SavedSnippet } from "~/shared/api/zulip";
import { createSavedSnippet, fetchSavedSnippets } from "~/shared/api/zulip-messages";
import { logStoreAction } from "~/shared/lib/logger";

export const SAVED_SNIPPETS_TTL_MS = 60_000;

// Fallback-ключ на случай, если активный инстанс еще не выбран.
const FALLBACK_INSTANCE_ID = "__no_instance__";

// Коды ошибок model; UI сам маппит их в i18n-строки.
type SavedSnippetsErrorCode = "load_failed" | "create_failed";

interface SavedSnippetsCacheEntry {
  // Последний успешный snapshot snippets.
  snippets: SavedSnippet[];
  // Время получения snapshot (для TTL-проверки).
  fetchedAt: number;
}

interface RefreshOptions {
  // Принудительный рефетч, даже если TTL не истек.
  force?: boolean;
}

interface SavedSnippetsModelState {
  // Данные, которые UI показывает прямо сейчас.
  snippets: SavedSnippet[];
  // True только для первой загрузки без локального кэша.
  loadingInitial: boolean;
  // True для мягкого обновления, когда список уже есть.
  refreshing: boolean;
  // Ошибка последней операции (load/create), если была.
  error: SavedSnippetsErrorCode | null;
  // Флаг, что хотя бы один успешный load уже был.
  hasLoadedOnce: boolean;
  // Версия запроса для защиты от гонок между ответами.
  requestVersion: number;
  // Открытие меню: мгновенная гидрация из кэша + условный SWR-рефетч.
  openSavedSnippets: () => Promise<void>;
  // Явное обновление списка, при force игнорирует TTL.
  refreshSavedSnippets: (options?: RefreshOptions) => Promise<void>;
  // Создание сниппета + оптимистичное обновление + фоновая синхронизация.
  createSavedSnippetAndSync: (params: { title: string; content: string }) => Promise<void>;
  // Сброс ошибки для повторных попыток в UI.
  clearSavedSnippetsError: () => void;
}

// In-memory cache по инстансам (без localStorage/IDB на этом этапе).
const snippetsCacheByInstance = new Map<string, SavedSnippetsCacheEntry>();
// In-flight dedupe по инстансу: параллельные fetch делят один Promise.
const snippetsInFlightByInstance = new Map<string, Promise<SavedSnippet[]>>();

// Возвращает id текущего инстанса или fallback.
function resolveInstanceId(): string {
  return getCurrentInstance()?.id ?? FALLBACK_INSTANCE_ID;
}

// Клонируем массив, чтобы UI не получил мутабельную ссылку из кэша.
function cloneSnippets(snippets: readonly SavedSnippet[]): SavedSnippet[] {
  return snippets.map((snippet) => ({ ...snippet }));
}

// Единая сортировка списка для стабильного рендера.
function sortSnippetsByTitle(snippets: readonly SavedSnippet[]): SavedSnippet[] {
  return [...snippets].sort((left, right) => left.title.localeCompare(right.title));
}

// Проверка свежести записи по TTL.
function isCacheFresh(entry: SavedSnippetsCacheEntry | undefined, now: number): boolean {
  return entry != null && now - entry.fetchedAt < SAVED_SNIPPETS_TTL_MS;
}

function mergeSnippet(
  snippets: readonly SavedSnippet[],
  incoming: SavedSnippet,
  options?: { preferIncomingById?: boolean },
): SavedSnippet[] {
  // При create сначала пытаемся матчить по id, иначе по title.
  const preferIncomingById = options?.preferIncomingById === true;
  const existingIndex = snippets.findIndex((snippet) =>
    preferIncomingById ? snippet.id === incoming.id : snippet.title === incoming.title,
  );
  if (existingIndex < 0) {
    return sortSnippetsByTitle([...snippets, incoming]);
  }
  const next = [...snippets];
  next[existingIndex] = incoming;
  return sortSnippetsByTitle(next);
}

async function fetchSavedSnippetsDeduped(instanceId: string): Promise<SavedSnippet[]> {
  // Если запрос уже летит, переиспользуем его вместо нового fetch.
  const inFlight = snippetsInFlightByInstance.get(instanceId);
  if (inFlight != null) {
    return inFlight;
  }
  const request = fetchSavedSnippets()
    .then((snippets) => {
      const normalized = sortSnippetsByTitle(cloneSnippets(snippets));
      // Обновляем кэш только успешным ответом.
      snippetsCacheByInstance.set(instanceId, {
        snippets: normalized,
        fetchedAt: Date.now(),
      });
      return normalized;
    })
    .finally(() => {
      if (snippetsInFlightByInstance.get(instanceId) === request) {
        snippetsInFlightByInstance.delete(instanceId);
      }
    });
  snippetsInFlightByInstance.set(instanceId, request);
  return request;
}

export const useComposerSavedSnippetsStore = create<SavedSnippetsModelState>((set, get) => ({
  snippets: [],
  loadingInitial: false,
  refreshing: false,
  error: null,
  hasLoadedOnce: false,
  requestVersion: 0,

  async openSavedSnippets() {
    // Быстрый сценарий открытия: сначала отдаем кэш, потом SWR при необходимости.
    const instanceId = resolveInstanceId();
    const cached = snippetsCacheByInstance.get(instanceId);
    const now = Date.now();
    const hasCachedData = cached != null && cached.snippets.length > 0;

    logStoreAction("composerSavedSnippets", "openSavedSnippets", {
      hasCachedData,
      cacheFresh: isCacheFresh(cached, now),
    });

    if (cached != null) {
      set({
        snippets: cloneSnippets(cached.snippets),
        hasLoadedOnce: true,
        error: null,
        loadingInitial: false,
        refreshing: false,
      });
    } else {
      set({ error: null, loadingInitial: true, refreshing: false });
    }

    const shouldRefresh = !isCacheFresh(cached, now);
    if (!shouldRefresh) {
      return;
    }
    await get().refreshSavedSnippets({ force: true });
  },

  async refreshSavedSnippets(options) {
    // Отдельный action рефетча нужен для SWR и force-sync после create.
    const force = options?.force === true;
    const instanceId = resolveInstanceId();
    const cached = snippetsCacheByInstance.get(instanceId);
    const now = Date.now();

    if (!force && isCacheFresh(cached, now)) {
      return;
    }

    const nextRequestVersion = get().requestVersion + 1;
    const hasCachedData = cached != null && cached.snippets.length > 0;
    set({
      requestVersion: nextRequestVersion,
      error: null,
      loadingInitial: !hasCachedData,
      refreshing: hasCachedData,
    });

    logStoreAction("composerSavedSnippets", "refreshSavedSnippets", {
      force,
      hasCachedData,
    });

    try {
      const snippets = await fetchSavedSnippetsDeduped(instanceId);
      if (get().requestVersion !== nextRequestVersion) return;
      set({
        snippets,
        loadingInitial: false,
        refreshing: false,
        error: null,
        hasLoadedOnce: true,
      });
    } catch {
      if (get().requestVersion !== nextRequestVersion) return;
      set((state) => ({
        loadingInitial: false,
        refreshing: false,
        error: "load_failed",
        hasLoadedOnce: state.hasLoadedOnce || state.snippets.length > 0,
      }));
    }
  },

  async createSavedSnippetAndSync(params) {
    // Защита от пустых значений до похода в API.
    const title = params.title.trim();
    const content = params.content.trim();
    if (title.length === 0 || content.length === 0) {
      return;
    }

    logStoreAction("composerSavedSnippets", "createSavedSnippetAndSync", {
      titleLength: title.length,
      contentLength: content.length,
    });

    const instanceId = resolveInstanceId();
    try {
      const createdSnippetId = await createSavedSnippet({ title, content });
      // Оптимистично добавляем/обновляем snippet в текущем списке.
      const optimisticSnippet: SavedSnippet = {
        id: createdSnippetId > 0 ? createdSnippetId : -Date.now(),
        title,
        content,
        date_created: Math.floor(Date.now() / 1000),
      };
      const currentSnippets = get().snippets;
      const merged = mergeSnippet(currentSnippets, optimisticSnippet, { preferIncomingById: true });
      snippetsCacheByInstance.set(instanceId, {
        snippets: merged,
        fetchedAt: Date.now(),
      });
      set({
        snippets: merged,
        hasLoadedOnce: true,
        error: null,
      });
      // После optimistic update делаем force sync для консистентности.
      void get().refreshSavedSnippets({ force: true });
    } catch {
      set({ error: "create_failed" });
    }
  },

  clearSavedSnippetsError() {
    set({ error: null });
  },
}));

export function resetComposerSavedSnippetsModelForTests(): void {
  // Полный reset singleton-состояния для изоляции тестов.
  snippetsCacheByInstance.clear();
  snippetsInFlightByInstance.clear();
  useComposerSavedSnippetsStore.setState({
    snippets: [],
    loadingInitial: false,
    refreshing: false,
    error: null,
    hasLoadedOnce: false,
    requestVersion: 0,
  });
}
