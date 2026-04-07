/**
 * Message Readers store — manages read receipt state for the "Read By" modal.
 *
 * Lifecycle: idle → loading → done / error.
 * Populated via fetchReadReceipts (Zulip API), cleared on modal dismiss.
 */

import { create } from "zustand";
import { guard } from "~/shared/lib/guards";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import { fetchReadReceipts } from "./message-readers.api";
import type { MessageReadersState } from "./message-readers.types";

const log = createLogger("message-readers");

const EMPTY_USER_IDS: number[] = [];

export const useMessageReadersStore = create<MessageReadersState>((set) => ({
  loading: false,
  userIds: EMPTY_USER_IDS,
  error: null,
  messageId: null,

  async fetchReadReceipts(messageId: number) {
    guard.messageId(messageId, "useMessageReadersStore.fetchReadReceipts");
    logStoreAction("message-readers", "fetchReadReceipts", { messageId });

    set({ loading: true, userIds: EMPTY_USER_IDS, error: null, messageId });

    try {
      const data = await fetchReadReceipts(messageId);
      set({ loading: false, userIds: data.user_ids });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("Failed to load read receipts", { messageId, error: errorMsg });
      set({ loading: false, userIds: EMPTY_USER_IDS, error: errorMsg });
    }
  },

  clear() {
    logStoreAction("message-readers", "clear", {});
    set({ loading: false, userIds: EMPTY_USER_IDS, error: null, messageId: null });
  },
}));
