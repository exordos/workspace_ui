import { create } from "zustand";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";

interface FeedState {
  ownerKey: string | null;
  messages: MessengerMessage[];
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  nextPageMarker: string | null;
  requestVersion: number;
  lastLoadedAt: number | null;
  error: string | null;

  setMessages: (
    messages: MessengerMessage[],
    pagination: FeedPaginationState,
    ownerKey?: string | null,
  ) => void;
  setMessagesIfActual: (
    messages: MessengerMessage[],
    pagination: FeedPaginationState,
    requestVersion: number,
    ownerKey?: string | null,
  ) => void;
  appendOlder: (messages: MessengerMessage[], pagination: FeedPaginationState) => void;
  clear: () => void;
  setLoadingMore: (loading: boolean) => void;
  setError: (error: string, requestVersion?: number) => void;
  startRequest: (hasCachedData: boolean) => number;
}

export interface FeedPaginationState {
  nextPageMarker: string | null;
  hasMore: boolean;
}

function compareFeedMessages(left: MessengerMessage, right: MessengerMessage): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdAtOrder !== 0) return createdAtOrder;
  return left.uuid.localeCompare(right.uuid);
}

function sortUniqueMessages(messages: readonly MessengerMessage[]): MessengerMessage[] {
  const byUuid = new Map<string, MessengerMessage>();
  for (const message of messages) {
    byUuid.set(message.uuid, message);
  }
  return [...byUuid.values()].sort(compareFeedMessages);
}

function mergeOlderMessages(
  currentMessages: readonly MessengerMessage[],
  olderMessages: readonly MessengerMessage[],
): MessengerMessage[] {
  const currentUuids = new Set(currentMessages.map((message) => message.uuid));
  const newOlderMessages = olderMessages.filter((message) => !currentUuids.has(message.uuid));
  return sortUniqueMessages([...currentMessages, ...newOlderMessages]);
}

function hasSameMessageOrder(left: MessengerMessage[], right: MessengerMessage[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i]!.uuid !== right[i]!.uuid) return false;
  }
  return true;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  ownerKey: null,
  messages: [],
  isInitialLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  hasMore: false,
  nextPageMarker: null,
  requestVersion: 0,
  lastLoadedAt: null,
  error: null,

  setMessages(messages, pagination, ownerKey) {
    logStoreAction("feed", "setMessages", { count: messages.length });
    const nextMessages = sortUniqueMessages(messages);
    set({
      ownerKey: ownerKey ?? get().ownerKey,
      messages: nextMessages,
      isInitialLoading: false,
      isRefreshing: false,
      nextPageMarker: pagination.nextPageMarker,
      hasMore: pagination.hasMore,
      lastLoadedAt: Date.now(),
      error: null,
    });
  },

  setMessagesIfActual(messages, pagination, requestVersion, ownerKey) {
    logStoreAction("feed", "setMessagesIfActual", { count: messages.length, requestVersion });
    set((state) => {
      if (state.requestVersion !== requestVersion) return state;
      const sortedMessages = sortUniqueMessages(messages);
      const nextMessages = hasSameMessageOrder(state.messages, sortedMessages)
        ? state.messages
        : sortedMessages;
      return {
        ownerKey: ownerKey ?? state.ownerKey,
        messages: nextMessages,
        isInitialLoading: false,
        isRefreshing: false,
        nextPageMarker: pagination.nextPageMarker,
        hasMore: pagination.hasMore,
        lastLoadedAt: Date.now(),
        error: null,
      };
    });
  },

  appendOlder(olderMessages, pagination) {
    if (olderMessages.length === 0) {
      logStoreAction("feed", "appendOlder", { count: 0, hasMore: pagination.hasMore });
      set({
        nextPageMarker: pagination.nextPageMarker,
        hasMore: pagination.hasMore,
        isLoadingMore: false,
      });
      return;
    }

    logStoreAction("feed", "appendOlder", { count: olderMessages.length });
    set((state) => {
      const merged = mergeOlderMessages(state.messages, olderMessages);
      return {
        messages: merged,
        isLoadingMore: false,
        nextPageMarker: pagination.nextPageMarker,
        hasMore: pagination.hasMore,
      };
    });
  },

  clear() {
    logStoreAction("feed", "clear");
    set({
      ownerKey: null,
      messages: [],
      isInitialLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: false,
      nextPageMarker: null,
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
    const requestVersion = get().requestVersion + 1;
    set({
      requestVersion,
      isInitialLoading: !hasCachedData,
      isRefreshing: hasCachedData,
    });
    return requestVersion;
  },
}));
