// Этот файл нужен для состояния страницы /activity по фильтрам.
// Для каждого фильтра (mentions/starred/reactions) хранится свой кэш,
// метаданные загрузки и requestVersion для защиты от гонок.
import { create } from "zustand";
import type { ActivityFilter, ZulipRawMessage } from "~/shared/api/zulip.types";
import { logStoreAction } from "~/shared/lib/logger";

export interface ActivityFilterState {
  messages: ZulipRawMessage[];
  hasMore: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  requestVersion: number;
  lastLoadedAt: number | null;
  error: string | null;
}

export interface StarredSummaryState {
  count: number;
  isCapped: boolean;
  isLoading: boolean;
  error: string | null;
  requestVersion: number;
  lastLoadedAt: number | null;
  stale: boolean;
}

const EMPTY_MESSAGES: ZulipRawMessage[] = [];

function createInitialFilterState(): ActivityFilterState {
  return {
    messages: EMPTY_MESSAGES,
    hasMore: true,
    isInitialLoading: false,
    isRefreshing: false,
    requestVersion: 0,
    lastLoadedAt: null,
    error: null,
  };
}

function createInitialStarredSummaryState(): StarredSummaryState {
  // Начальное состояние summary-счетчика для starred.
  return {
    count: 0,
    isCapped: false,
    isLoading: false,
    error: null,
    requestVersion: 0,
    lastLoadedAt: null,
    stale: false,
  };
}

function createInitialFiltersState(): Record<ActivityFilter, ActivityFilterState> {
  return {
    starred: createInitialFilterState(),
    mentions: createInitialFilterState(),
    reactions: createInitialFilterState(),
  };
}

interface ActivityState {
  staleVersion: number;
  filters: Record<ActivityFilter, ActivityFilterState>;
  starredSummary: StarredSummaryState;
  setFilterCache: (filter: ActivityFilter, messages: ZulipRawMessage[], hasMore: boolean) => void;
  startFilterRequest: (filter: ActivityFilter, hasCachedData: boolean) => number;
  setFilterPageIfActual: (
    filter: ActivityFilter,
    requestVersion: number,
    messages: ZulipRawMessage[],
    hasMore: boolean,
  ) => void;
  appendOlderIfActual: (
    filter: ActivityFilter,
    requestVersion: number,
    messages: ZulipRawMessage[],
    hasMore: boolean,
  ) => void;
  removeMessageFromFilter: (filter: ActivityFilter, messageId: number) => void;
  setFilterErrorIfActual: (filter: ActivityFilter, requestVersion: number, error: string) => void;
  startStarredSummaryRequest: (hasCachedData: boolean) => number;
  setStarredSummaryFromCache: (count: number, isCapped: boolean) => void;
  setStarredSummaryFromServerIfActual: (
    requestVersion: number,
    payload: { count: number; isCapped: boolean },
  ) => void;
  setStarredSummaryErrorIfActual: (requestVersion: number, error: string) => void;
  markStarredSummaryStale: () => void;
  markStale: () => void;
  clear: () => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  staleVersion: 0,
  filters: createInitialFiltersState(),
  starredSummary: createInitialStarredSummaryState(),

  setFilterCache(filter, messages, hasMore) {
    // Быстрый локальный hydrate (из IDB) без блокировки UI.
    logStoreAction("activity", "setFilterCache", { filter, count: messages.length });
    set((state) => ({
      filters: {
        ...state.filters,
        [filter]: {
          ...state.filters[filter],
          messages,
          hasMore,
          isInitialLoading: false,
          isRefreshing: false,
          lastLoadedAt: Date.now(),
          error: null,
        },
      },
    }));
  },

  startFilterRequest(filter, hasCachedData) {
    let nextRequestVersion = 0;
    set((state) => {
      nextRequestVersion = state.filters[filter].requestVersion + 1;
      return {
        filters: {
          ...state.filters,
          [filter]: {
            ...state.filters[filter],
            requestVersion: nextRequestVersion,
            // С кэшем показываем refresh, без кэша — initial loading.
            isInitialLoading: !hasCachedData,
            isRefreshing: hasCachedData,
          },
        },
      };
    });
    return nextRequestVersion;
  },

  setFilterPageIfActual(filter, requestVersion, messages, hasMore) {
    // authoritative replace для newest: список фильтра заменяется целиком.
    logStoreAction("activity", "setFilterPageIfActual", {
      filter,
      requestVersion,
      count: messages.length,
    });
    set((state) => {
      if (state.filters[filter].requestVersion !== requestVersion) return state;
      return {
        filters: {
          ...state.filters,
          [filter]: {
            ...state.filters[filter],
            messages,
            hasMore,
            isInitialLoading: false,
            isRefreshing: false,
            lastLoadedAt: Date.now(),
            error: null,
          },
        },
      };
    });
  },

  appendOlderIfActual(filter, requestVersion, messages, hasMore) {
    logStoreAction("activity", "appendOlderIfActual", {
      filter,
      requestVersion,
      count: messages.length,
    });
    set((state) => {
      if (state.filters[filter].requestVersion !== requestVersion) return state;
      // Для "load more" дописываем старые элементы и удаляем дубликаты по id.
      const existingIds = new Set(state.filters[filter].messages.map((message) => message.id));
      const uniqueOlder = messages.filter((message) => !existingIds.has(message.id));
      return {
        filters: {
          ...state.filters,
          [filter]: {
            ...state.filters[filter],
            messages: [...uniqueOlder, ...state.filters[filter].messages],
            hasMore,
            isInitialLoading: false,
            isRefreshing: false,
            lastLoadedAt: Date.now(),
            error: null,
          },
        },
      };
    });
  },

  removeMessageFromFilter(filter, messageId) {
    logStoreAction("activity", "removeMessageFromFilter", { filter, messageId });
    set((state) => ({
      filters: {
        ...state.filters,
        [filter]: {
          ...state.filters[filter],
          messages: state.filters[filter].messages.filter((message) => message.id !== messageId),
        },
      },
    }));
  },

  setFilterErrorIfActual(filter, requestVersion, error) {
    logStoreAction("activity", "setFilterErrorIfActual", { filter, requestVersion, error });
    set((state) => {
      if (state.filters[filter].requestVersion !== requestVersion) return state;
      return {
        filters: {
          ...state.filters,
          [filter]: {
            ...state.filters[filter],
            isInitialLoading: false,
            isRefreshing: false,
            error,
          },
        },
      };
    });
  },

  startStarredSummaryRequest(hasCachedData) {
    // Начинает lifecycle загрузки summary.
    // При наличии кэша избегаем блокирующего loading-режима.
    let nextRequestVersion = 0;
    set((state) => {
      nextRequestVersion = state.starredSummary.requestVersion + 1;
      return {
        starredSummary: {
          ...state.starredSummary,
          requestVersion: nextRequestVersion,
          isLoading: !hasCachedData,
          error: null,
          stale: false,
        },
      };
    });
    return nextRequestVersion;
  },

  setStarredSummaryFromCache(count, isCapped) {
    // Локальный bootstrap summary из cache-слоя.
    logStoreAction("activity", "setStarredSummaryFromCache", { count, isCapped });
    set((state) => ({
      starredSummary: {
        ...state.starredSummary,
        count,
        isCapped,
        isLoading: false,
        error: null,
        lastLoadedAt: Date.now(),
        stale: false,
      },
    }));
  },

  setStarredSummaryFromServerIfActual(requestVersion, payload) {
    // Применяет authoritative server-результат только для актуальной версии запроса.
    logStoreAction("activity", "setStarredSummaryFromServerIfActual", {
      requestVersion,
      count: payload.count,
      isCapped: payload.isCapped,
    });
    set((state) => {
      if (state.starredSummary.requestVersion !== requestVersion) return state;
      return {
        starredSummary: {
          ...state.starredSummary,
          count: payload.count,
          isCapped: payload.isCapped,
          isLoading: false,
          error: null,
          lastLoadedAt: Date.now(),
          stale: false,
        },
      };
    });
  },

  setStarredSummaryErrorIfActual(requestVersion, error) {
    // Ошибка старого запроса не должна перетирать более новый state.
    logStoreAction("activity", "setStarredSummaryErrorIfActual", { requestVersion, error });
    set((state) => {
      if (state.starredSummary.requestVersion !== requestVersion) return state;
      return {
        starredSummary: {
          ...state.starredSummary,
          isLoading: false,
          error,
          stale: true,
        },
      };
    });
  },

  markStarredSummaryStale() {
    // Используется realtime-dispatch при изменениях starred,
    // чтобы bootstrap-хук инициировал мягкий refresh summary.
    logStoreAction("activity", "markStarredSummaryStale", {});
    set((state) => ({
      starredSummary: {
        ...state.starredSummary,
        stale: true,
      },
    }));
  },

  markStale() {
    logStoreAction("activity", "markStale", {});
    set((state) => ({ staleVersion: state.staleVersion + 1 }));
  },

  clear() {
    logStoreAction("activity", "clear", {});
    set({
      staleVersion: 0,
      filters: createInitialFiltersState(),
      starredSummary: createInitialStarredSummaryState(),
    });
  },
}));
