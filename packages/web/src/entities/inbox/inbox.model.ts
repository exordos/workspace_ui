/**
 * Inbox store — grouped unread entries and request lifecycle for cache-first + background refresh.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import { removeInboxEntriesForMarkReadTarget } from "./inbox.lib";
import type { InboxEntry, InboxMarkReadTarget } from "./inbox.types";

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
  staleVersion: number;

  setEntries: (entries: InboxEntry[], requestVersion?: number) => void;
  removeEntriesForTarget: (target: InboxMarkReadTarget, currentUserId: number | null) => void;
  clearEntries: () => void;
  markStale: () => void;
  clear: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string, requestVersion?: number) => void;
  startRequest: (hasCachedData: boolean) => number;

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
  staleVersion: 0,

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
      };
    });
  },

  removeEntriesForTarget(target, currentUserId) {
    logStoreAction("inbox", "removeEntriesForTarget", { targetType: target.type });
    set((state) => ({
      entries: removeInboxEntriesForMarkReadTarget(state.entries, target, currentUserId),
    }));
  },

  clearEntries() {
    logStoreAction("inbox", "clearEntries");
    set({ entries: [] });
  },

  markStale() {
    logStoreAction("inbox", "markStale");
    set((state) => ({ staleVersion: state.staleVersion + 1 }));
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
      staleVersion: 0,
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
