import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import {
  normalizeSelectedForwardText,
  uniqueForwardMessageUuids,
} from "./workspace-forward-message.lib";
import type { WorkspaceForwardMessageState } from "./workspace-forward-message.types";

const EMPTY_MESSAGE_UUIDS: string[] = [];

const INITIAL_STATE = {
  isOpen: false,
  messageUuids: EMPTY_MESSAGE_UUIDS,
  selectedText: undefined,
  onSuccess: undefined,
  isSubmitting: false,
  error: null,
} satisfies Pick<
  WorkspaceForwardMessageState,
  "isOpen" | "messageUuids" | "selectedText" | "onSuccess" | "isSubmitting" | "error"
>;

export const useWorkspaceForwardMessageStore = create<WorkspaceForwardMessageState>((set, get) => ({
  ...INITIAL_STATE,

  open(request) {
    const messageUuids = uniqueForwardMessageUuids(request.messageUuids);
    if (messageUuids.length === 0) {
      logStoreAction("workspaceForwardMessage", "open:empty", {});
      set({ ...INITIAL_STATE });
      return;
    }

    logStoreAction("workspaceForwardMessage", "open", { count: messageUuids.length });
    // Store держит только намерение: runtime, users, streams и messages остаются во внешних слоях.
    set({
      isOpen: true,
      messageUuids,
      selectedText: normalizeSelectedForwardText(request.selectedText),
      onSuccess: request.onSuccess,
      isSubmitting: false,
      error: null,
    });
  },

  close() {
    if (get().isSubmitting) {
      logStoreAction("workspaceForwardMessage", "close:blockedSubmitting", {});
      return;
    }

    logStoreAction("workspaceForwardMessage", "close", {});
    set({ ...INITIAL_STATE });
  },

  setSubmitting(value) {
    logStoreAction("workspaceForwardMessage", "setSubmitting", { value });
    set({ isSubmitting: value });
  },

  setError(error) {
    logStoreAction("workspaceForwardMessage", "setError", { hasError: error != null });
    set({ error });
  },

  reset() {
    logStoreAction("workspaceForwardMessage", "reset", {});
    set({ ...INITIAL_STATE });
  },
}));
