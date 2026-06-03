/**
 * Inbox store — grouped unread entries and request lifecycle for cache-first + background refresh.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import { applyMarkAsReadToInboxEntries } from "./inbox-mark-read.lib";
import type { InboxEntry } from "./inbox.types";

const EMPTY_ENTRIES: InboxEntry[] = [];

let cachedEntriesRef: InboxEntry[] | null = null;
let cachedSortedEntries: InboxEntry[] = EMPTY_ENTRIES;

interface InboxState {
  entries: InboxEntry[];
  loading: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  requestVersion: number;
  lastLoadedAt: number | null;
  error: string | null;
  stale: boolean;

  setEntries: (entries: InboxEntry[], requestVersion?: number) => void;
  markAsRead: (messageIds: number[]) => void;
  markStale: () => void;
  clear: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string, requestVersion?: number) => void;
  startRequest: (hasCachedData: boolean) => number;

  totalUnreadCount: () => number;
  sortedEntries: () => InboxEntry[];
}

export const useInboxStore = create<InboxState>((set, get) => ({
  entries: [],
  loading: false,
  isInitialLoading: false,
  isRefreshing: false,
  requestVersion: 0,
  lastLoadedAt: null,
  error: null,
  stale: false,

  setEntries(entries, requestVersion) {
    // Authoritative newest refresh replaces the full list.
    logStoreAction("inbox", "setEntries", { count: entries.length });
    set((state) => {
      if (requestVersion != null && requestVersion !== state.requestVersion) return state;
      return {
        entries,
        loading: false,
        isInitialLoading: false,
        isRefreshing: false,
        lastLoadedAt: Date.now(),
        error: null,
        stale: false,
      };
    });
  },

  markAsRead(messageIds) {
    logStoreAction("inbox", "markAsRead", { count: messageIds.length });
    set((state) => ({
      entries: applyMarkAsReadToInboxEntries(state.entries, messageIds),
    }));
  },

  markStale() {
    logStoreAction("inbox", "markStale");
    set({ stale: true });
  },

  clear() {
    logStoreAction("inbox", "clear");
    set({
      entries: [],
      loading: false,
      isInitialLoading: false,
      isRefreshing: false,
      requestVersion: 0,
      lastLoadedAt: null,
      error: null,
      stale: false,
    });
  },

  setLoading(loading) {
    logStoreAction("inbox", "setLoading", { loading });
    set({ loading, isInitialLoading: loading, isRefreshing: false });
  },

  setError(error, requestVersion) {
    logStoreAction("inbox", "setError", { error });
    set((state) => {
      if (requestVersion != null && requestVersion !== state.requestVersion) return state;
      return { error, loading: false, isInitialLoading: false, isRefreshing: false };
    });
  },

  startRequest(hasCachedData) {
    const requestVersion = get().requestVersion + 1;
    set({
      requestVersion,
      loading: !hasCachedData,
      isInitialLoading: !hasCachedData,
      isRefreshing: hasCachedData,
    });
    return requestVersion;
  },

  totalUnreadCount() {
    return get().entries.reduce((sum, e) => sum + e.unreadCount, 0);
  },

  sortedEntries() {
    const entries = get().entries;
    if (entries.length === 0) return EMPTY_ENTRIES;
    if (entries !== cachedEntriesRef) {
      cachedEntriesRef = entries;
      cachedSortedEntries = [...entries].sort(
        (a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp,
      );
    }
    return cachedSortedEntries;
  },
}));
