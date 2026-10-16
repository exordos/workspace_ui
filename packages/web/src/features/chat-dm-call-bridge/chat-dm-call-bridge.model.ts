/**
 * Bridge from profile / mention and sidebar UI to ChatPage for starting a Jitsi call.
 * ChatPage watches pending partner uuid and starts the call once the DM route is active.
 */
import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

export type InvokeDmCallFromProfileHandler = (partnerUserUuid: string) => void;

export interface ActiveChatCall {
  readonly ownerKey: string;
  readonly runtimeGeneration: number;
  readonly streamUuid: string;
  readonly invoke: () => void;
}

interface ChatDmCallBridgeState {
  activeChatCall: ActiveChatCall | null;
  setActiveChatCall: (call: ActiveChatCall | null) => void;
  pendingDmCallPartnerUserUuid: string | null;
  invokeDmCallFromProfileHandler: InvokeDmCallFromProfileHandler | null;

  setPendingDmCallPartnerUserUuid: (userUuid: string | null) => void;
  clearPendingDmCallPartner: () => void;
  setInvokeDmCallFromProfileHandler: (handler: InvokeDmCallFromProfileHandler | null) => void;
  invokeDmCallFromProfile: (partnerUserUuid: string) => void;
}

export const useChatDmCallBridgeStore = create<ChatDmCallBridgeState>((set, get) => ({
  activeChatCall: null,
  setActiveChatCall: (activeChatCall) => set({ activeChatCall }),
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
