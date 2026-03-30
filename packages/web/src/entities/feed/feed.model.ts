/**
 * Feed store — chronological all-messages view with anchor-based pagination.
 *
 * Messages are stored newest-first (consistent with chat views).
 * `appendOlder` prepends older batches for infinite scroll.
 * `lastMessageId` tracks the oldest loaded message for the next fetch anchor.
 */

import { create } from "zustand";
import type { MockMessage } from "~/shared/api/zulip.types";
import { logStoreAction } from "~/shared/lib/logger";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface FeedState {
  messages: MockMessage[];
  isLoadingMore: boolean;
  isAllLoaded: boolean;
  lastMessageId: number | null;
  error: string | null;

  setMessages: (messages: MockMessage[], isAllLoaded: boolean) => void;
  appendOlder: (messages: MockMessage[], isAllLoaded: boolean) => void;
  clear: () => void;
  setLoadingMore: (loading: boolean) => void;
  setError: (error: string) => void;
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

export const useFeedStore = create<FeedState>((set) => ({
  messages: [],
  isLoadingMore: false,
  isAllLoaded: false,
  lastMessageId: null,
  error: null,

  setMessages(messages, isAllLoaded) {
    logStoreAction("feed", "setMessages", { count: messages.length });
    set({
      messages,
      lastMessageId: findOldestId(messages),
      isAllLoaded,
      error: null,
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
      messages: [],
      isLoadingMore: false,
      isAllLoaded: false,
      lastMessageId: null,
      error: null,
    });
  },

  setLoadingMore(loading) {
    set({ isLoadingMore: loading });
  },

  setError(error) {
    logStoreAction("feed", "setError", { error });
    set({ error, isLoadingMore: false });
  },
}));
