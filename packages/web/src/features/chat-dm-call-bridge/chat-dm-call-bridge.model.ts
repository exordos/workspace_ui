/**
 * Bridge from profile / mention and sidebar UI to ChatPage for starting a Jitsi call.
 * ChatPage watches owner-bound requests and starts a call once the DM route is active.
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

// The request object binds the intent to one session and identifies the publication to consume.
interface PendingDmCall {
  readonly partnerUserUuid: string;
  readonly ownerKey: string;
  readonly runtimeGeneration: number;
}

interface ChatDmCallBridgeState {
  activeChatCall: ActiveChatCall | null;
  setActiveChatCall: (call: ActiveChatCall | null) => void;
  pendingDmCall: PendingDmCall | null;
  invokeDmCallFromProfileHandler: InvokeDmCallFromProfileHandler | null;

  setPendingDmCall: (request: PendingDmCall) => void;
  clearPendingDmCall: (request?: PendingDmCall) => boolean;
  setInvokeDmCallFromProfileHandler: (handler: InvokeDmCallFromProfileHandler | null) => void;
  invokeDmCallFromProfile: (partnerUserUuid: string) => void;
}

export const useChatDmCallBridgeStore = create<ChatDmCallBridgeState>((set, get) => ({
  activeChatCall: null,
  setActiveChatCall: (activeChatCall) => set({ activeChatCall }),
  pendingDmCall: null,
  invokeDmCallFromProfileHandler: null,

  setPendingDmCall(request) {
    logStoreAction("chatDmCallBridge", "setPendingDmCall", {});
    set({ pendingDmCall: request });
  },

  clearPendingDmCall(request) {
    const pending = get().pendingDmCall;
    if (pending == null || (request != null && pending !== request)) return false;
    logStoreAction("chatDmCallBridge", "clearPendingDmCall", {});
    set({ pendingDmCall: null });
    return true;
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
