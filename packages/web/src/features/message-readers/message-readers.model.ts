/**
 * Message Readers store — manages read receipt state for the "Read By" modal.
 *
 * Lifecycle: idle → loading → done / error.
 * Populated via fetchReadReceipts (Zulip API), cleared on modal dismiss.
 */

import { create } from "zustand";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestInvalidated,
} from "~/entities/instance/instance.model";
import { guard } from "~/shared/lib/guards";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import { fetchReadReceipts } from "./message-readers.api";
import type { MessageReadersState } from "./message-readers.types";

const log = createLogger("message-readers");

const EMPTY_USER_IDS: number[] = [];
let activeReadReceiptsController: AbortController | null = null;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export const useMessageReadersStore = create<MessageReadersState>((set, get) => ({
  loading: false,
  userIds: EMPTY_USER_IDS,
  error: null,
  messageId: null,
  requestVersion: 0,

  async fetchReadReceipts(messageId: number) {
    guard.messageId(messageId, "useMessageReadersStore.fetchReadReceipts");
    logStoreAction("message-readers", "fetchReadReceipts", { messageId });

    activeReadReceiptsController?.abort();
    const controller = new AbortController();
    activeReadReceiptsController = controller;
    const requestVersion = get().requestVersion + 1;
    const orgContext = captureActiveOrgRequestContext();

    set({ loading: true, userIds: EMPTY_USER_IDS, error: null, messageId, requestVersion });

    try {
      const data = await fetchReadReceipts(messageId, { signal: controller.signal });
      if (
        activeReadReceiptsController !== controller ||
        get().requestVersion !== requestVersion ||
        isActiveOrgRequestInvalidated(orgContext, controller.signal)
      ) {
        return;
      }
      set({ loading: false, userIds: data.user_ids });
    } catch (err) {
      if (
        isAbortError(err) ||
        activeReadReceiptsController !== controller ||
        get().requestVersion !== requestVersion ||
        isActiveOrgRequestInvalidated(orgContext, controller.signal)
      ) {
        return;
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("Failed to load read receipts", { messageId, error: errorMsg });
      set({ loading: false, userIds: EMPTY_USER_IDS, error: errorMsg });
    } finally {
      if (activeReadReceiptsController === controller) {
        activeReadReceiptsController = null;
      }
    }
  },

  clear() {
    logStoreAction("message-readers", "clear", {});
    activeReadReceiptsController?.abort();
    activeReadReceiptsController = null;
    set((state) => ({
      loading: false,
      userIds: EMPTY_USER_IDS,
      error: null,
      messageId: null,
      requestVersion: state.requestVersion + 1,
    }));
  },
}));
