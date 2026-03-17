/**
 * Inbox store — unread messages grouped by stream+topic or DM sender.
 *
 * Entries are built from the Zulip `is:unread` narrow. Each entry
 * represents a conversation bucket with its unread count and message IDs.
 * The store supports batch mark-as-read and sorted views for the inbox page.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { InboxEntry } from "./inbox.types";

const EMPTY_ENTRIES: InboxEntry[] = [];

let cachedEntriesRef: InboxEntry[] | null = null;
let cachedSortedEntries: InboxEntry[] = EMPTY_ENTRIES;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface InboxState {
  entries: InboxEntry[];
  loading: boolean;
  error: string | null;
  stale: boolean;

  setEntries: (entries: InboxEntry[]) => void;
  markAsRead: (messageIds: number[]) => void;
  markStale: () => void;
  clear: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;

  totalUnreadCount: () => number;
  sortedEntries: () => InboxEntry[];
}

export const useInboxStore = create<InboxState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,
  stale: false,

  setEntries(entries) {
    logStoreAction("inbox", "setEntries", { count: entries.length });
    set({ entries, loading: false, error: null, stale: false });
  },

  markAsRead(messageIds) {
    const idsSet = new Set(messageIds);
    logStoreAction("inbox", "markAsRead", { count: messageIds.length });
    set((state) => ({
      entries: state.entries
        .map((entry) => {
          const remaining = entry.messageIds.filter((id) => !idsSet.has(id));
          if (remaining.length === entry.messageIds.length) return entry;
          if (remaining.length === 0) return null;
          return {
            ...entry,
            messageIds: remaining,
            unreadCount: remaining.length,
          };
        })
        .filter((e): e is InboxEntry => e !== null),
    }));
  },

  markStale() {
    logStoreAction("inbox", "markStale");
    set({ stale: true });
  },

  clear() {
    logStoreAction("inbox", "clear");
    set({ entries: [], loading: false, error: null, stale: false });
  },

  setLoading(loading) {
    logStoreAction("inbox", "setLoading", { loading });
    set({ loading });
  },

  setError(error) {
    logStoreAction("inbox", "setError", { error });
    set({ error, loading: false });
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
