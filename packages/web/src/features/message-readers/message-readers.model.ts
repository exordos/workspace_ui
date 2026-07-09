/**
 * Message Readers store — manages read receipt state for the "Read By" modal.
 */

import { create } from "zustand";
import { guard } from "~/shared/lib/guards";
import { logStoreAction } from "~/shared/lib/logger";
import type { MessageReadersState } from "./message-readers.types";

const EMPTY_USER_IDS: number[] = [];

export const useMessageReadersStore = create<MessageReadersState>((set) => ({
  loading: false,
  userIds: EMPTY_USER_IDS,
  error: null,
  messageId: null,
  unsupported: false,
  requestVersion: 0,

  showUnsupported(messageId: number) {
    guard.messageId(messageId, "useMessageReadersStore.showUnsupported");
    logStoreAction("message-readers", "showUnsupported", { messageId });
    set((state) => ({
      loading: false,
      userIds: EMPTY_USER_IDS,
      error: null,
      messageId,
      unsupported: true,
      requestVersion: state.requestVersion + 1,
    }));
  },

  clear() {
    logStoreAction("message-readers", "clear", {});
    set((state) => ({
      loading: false,
      userIds: EMPTY_USER_IDS,
      error: null,
      messageId: null,
      unsupported: false,
      requestVersion: state.requestVersion + 1,
    }));
  },
}));
