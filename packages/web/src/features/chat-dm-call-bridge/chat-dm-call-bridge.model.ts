/**
 * Bridge from profile / mention UI to ChatPage for starting a 1:1 Jitsi call.
 * ChatPage registers the invoke handler; optional pending partner id defers call until DM route is active.
 */
import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { UserId } from "~/shared/lib/user-id.lib";

export type InvokeDmCallFromProfileHandler = (partnerUserId: UserId) => void;

interface ChatDmCallBridgeState {
  pendingDmCallPartnerUserId: UserId | null;
  invokeDmCallFromProfileHandler: InvokeDmCallFromProfileHandler | null;

  setPendingDmCallPartnerUserId: (userId: UserId | null) => void;
  clearPendingDmCallPartner: () => void;
  setInvokeDmCallFromProfileHandler: (handler: InvokeDmCallFromProfileHandler | null) => void;
  invokeDmCallFromProfile: (partnerUserId: UserId) => void;
}

export const useChatDmCallBridgeStore = create<ChatDmCallBridgeState>((set, get) => ({
  pendingDmCallPartnerUserId: null,
  invokeDmCallFromProfileHandler: null,

  setPendingDmCallPartnerUserId(userId) {
    logStoreAction("chatDmCallBridge", "setPendingDmCallPartnerUserId", {
      userId: userId ?? null,
    });
    set({ pendingDmCallPartnerUserId: userId });
  },

  clearPendingDmCallPartner() {
    if (get().pendingDmCallPartnerUserId == null) return;
    logStoreAction("chatDmCallBridge", "clearPendingDmCallPartner", {});
    set({ pendingDmCallPartnerUserId: null });
  },

  setInvokeDmCallFromProfileHandler(handler) {
    logStoreAction("chatDmCallBridge", "setInvokeDmCallFromProfileHandler", {
      hasHandler: handler != null,
    });
    set({ invokeDmCallFromProfileHandler: handler });
  },

  invokeDmCallFromProfile(partnerUserId) {
    const fn = get().invokeDmCallFromProfileHandler;
    if (fn == null) return;
    fn(partnerUserId);
  },
}));
