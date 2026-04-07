// Этот файл нужен как единый store для страницы /feed.
// Хранит:
// - список сообщений (newest-first для совместимости с остальным UI),
// - метаданные запроса (isInitialLoading/isRefreshing/requestVersion),
// - состояние пагинации (lastMessageId, isAllLoaded).

import { create } from "zustand";
import type { MockMessage } from "~/shared/api/zulip.types";
import { logStoreAction } from "~/shared/lib/logger";

// Состояние feed + действия для SWR-подобного lifecycle.

interface FeedState {
  instanceId: string | null;
  messages: MockMessage[];
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  isAllLoaded: boolean;
  lastMessageId: number | null;
  requestVersion: number;
  lastLoadedAt: number | null;
  error: string | null;

  setMessages: (messages: MockMessage[], isAllLoaded: boolean, instanceId?: string | null) => void;
  setMessagesIfActual: (
    messages: MockMessage[],
    isAllLoaded: boolean,
    requestVersion: number,
    instanceId?: string | null,
  ) => void;
  appendOlder: (messages: MockMessage[], isAllLoaded: boolean) => void;
  clear: () => void;
  setLoadingMore: (loading: boolean) => void;
  setError: (error: string, requestVersion?: number) => void;
  startRequest: (hasCachedData: boolean) => number;
}

function findOldestId(messages: MockMessage[]): number | null {
  if (messages.length === 0) return null;
  let oldest = messages[0]!;
  for (let i = 1; i < messages.length; i++) {
    if (messages[i]!.id < oldest.id) {
      oldest = messages[i]!;
    }
  }
  return oldest.id;
}

// Сравниваем только id и порядок, чтобы понять, изменился ли фактический список.
// Это позволяет не дергать лишние перерисовки при cache -> refresh с теми же сообщениями.
function hasSameMessageOrder(left: MockMessage[], right: MockMessage[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i]!.id !== right[i]!.id) return false;
  }
  return true;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  instanceId: null,
  messages: [],
  isInitialLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  isAllLoaded: false,
  lastMessageId: null,
  requestVersion: 0,
  lastLoadedAt: null,
  error: null,

  setMessages(messages, isAllLoaded, instanceId) {
    // authoritative replace: на свежем anchor="newest" полностью заменяем список.
    logStoreAction("feed", "setMessages", { count: messages.length });
    set({
      instanceId: instanceId ?? get().instanceId,
      messages,
      lastMessageId: findOldestId(messages),
      isInitialLoading: false,
      isRefreshing: false,
      isAllLoaded,
      lastLoadedAt: Date.now(),
      error: null,
    });
  },

  setMessagesIfActual(messages, isAllLoaded, requestVersion, instanceId) {
    // Защита от гонок: применяем ответ только для текущей версии запроса.
    logStoreAction("feed", "setMessagesIfActual", { count: messages.length, requestVersion });
    set((state) => {
      if (state.requestVersion !== requestVersion) return state;
      // Если сервер вернул тот же набор id в том же порядке, сохраняем старую ссылку массива.
      const nextMessages = hasSameMessageOrder(state.messages, messages)
        ? state.messages
        : messages;
      return {
        instanceId: instanceId ?? state.instanceId,
        messages: nextMessages,
        lastMessageId: findOldestId(nextMessages),
        isInitialLoading: false,
        isRefreshing: false,
        isAllLoaded,
        lastLoadedAt: Date.now(),
        error: null,
      };
    });
  },

  appendOlder(olderMessages, isAllLoaded) {
    if (olderMessages.length === 0) {
      logStoreAction("feed", "appendOlder", { count: 0, allLoaded: isAllLoaded });
      set({ isAllLoaded: true, isLoadingMore: false });
      return;
    }

    logStoreAction("feed", "appendOlder", { count: olderMessages.length });
    set((state) => {
      // Для load more делаем merge с dedupe по message.id.
      const existingIds = new Set(state.messages.map((m) => m.id));
      const unique = olderMessages.filter((m) => !existingIds.has(m.id));
      const merged = [...unique, ...state.messages];
      return {
        messages: merged,
        lastMessageId: findOldestId(merged),
        isLoadingMore: false,
        isAllLoaded,
      };
    });
  },

  clear() {
    logStoreAction("feed", "clear");
    set({
      instanceId: null,
      messages: [],
      isInitialLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      isAllLoaded: false,
      lastMessageId: null,
      requestVersion: 0,
      lastLoadedAt: null,
      error: null,
    });
  },

  setLoadingMore(loading) {
    set({ isLoadingMore: loading });
  },

  setError(error, requestVersion) {
    logStoreAction("feed", "setError", { error });
    set((state) => {
      if (requestVersion != null && state.requestVersion !== requestVersion) return state;
      return { error, isLoadingMore: false, isInitialLoading: false, isRefreshing: false };
    });
  },

  startRequest(hasCachedData) {
    // При наличии кэша стартуем в refresh-режиме без блокирующего loader.
    const requestVersion = get().requestVersion + 1;
    set({
      requestVersion,
      isInitialLoading: !hasCachedData,
      isRefreshing: hasCachedData,
    });
    return requestVersion;
  },
}));
