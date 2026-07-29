/**
 * Bridge from profile / mention UI to ChatPage for starting a 1:1 Jitsi call.
 * ChatPage watches pending partner uuid and starts the call once the DM route is active.
 */
import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

export type InvokeDmCallFromProfileHandler = (partnerUserUuid: string) => void;

interface ChatDmCallBridgeState {
  pendingDmCallPartnerUserUuid: string | null;
  invokeDmCallFromProfileHandler: InvokeDmCallFromProfileHandler | null;

  setPendingDmCallPartnerUserUuid: (userUuid: string | null) => void;
  clearPendingDmCallPartner: () => void;
  setInvokeDmCallFromProfileHandler: (handler: InvokeDmCallFromProfileHandler | null) => void;
  invokeDmCallFromProfile: (partnerUserUuid: string) => void;
}

export const useChatDmCallBridgeStore = create<ChatDmCallBridgeState>((set, get) => ({
  pendingDmCallPartnerUserUuid: null,
  invokeDmCallFromProfileHandler: null,

  setPendingDmCallPartnerUserUuid(userUuid) {
    logStoreAction("chatDmCallBridge", "setPendingDmCallPartnerUserUuid", {
      userUuid: userUuid ?? null,
    });
    set({ pendingDmCallPartnerUserUuid: userUuid });
  },

  clearPendingDmCallPartner() {
    if (get().pendingDmCallPartnerUserUuid == null) return;
    logStoreAction("chatDmCallBridge", "clearPendingDmCallPartner", {});
    set({ pendingDmCallPartnerUserUuid: null });
  },

  setInvokeDmCallFromProfileHandler(handler) {
    logStoreAction("chatDmCallBridge", "setInvokeDmCallFromProfileHandler", {
      hasHandler: handler != null,
    });
    set({ invokeDmCallFromProfileHandler: handler });
  },

  invokeDmCallFromProfile(partnerUserUuid) {
    const fn = get().invokeDmCallFromProfileHandler;
    if (fn == null) return;
    fn(partnerUserUuid);
  },
}));
