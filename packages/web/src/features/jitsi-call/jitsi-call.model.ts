import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

export interface IncomingDmCallInvite {
  messageId: number;
  meetingUrl: string;
  callerName: string;
  locationName: string;
  avatarUrl?: string;
  timestamp: number;
}

export interface ActiveJitsiCall {
  meetingUrl: string;
  locationName: string;
  startWithVideoMuted?: boolean;
}

interface JitsiCallStoreState {
  activeCall: ActiveJitsiCall | null;
  incomingInvite: IncomingDmCallInvite | null;
  lastIncomingMessageId: number | null;
  openCall: (payload: ActiveJitsiCall) => void;
  closeCall: () => void;
  ingestIncomingInvite: (invite: IncomingDmCallInvite) => void;
  acceptIncomingInvite: (options?: { startWithVideoMuted?: boolean }) => void;
  declineIncomingInvite: () => void;
  clear: () => void;
}

export const useJitsiCallStore = create<JitsiCallStoreState>((set, get) => ({
  activeCall: null,
  incomingInvite: null,
  lastIncomingMessageId: null,

  openCall(payload) {
    const startWithVideoMuted = payload.startWithVideoMuted ?? true;
    logStoreAction("jitsiCall", "openCall", {
      hasLocationName: payload.locationName.trim().length > 0,
      startWithVideoMuted,
    });
    set({
      activeCall: {
        meetingUrl: payload.meetingUrl,
        locationName: payload.locationName,
        startWithVideoMuted,
      },
      incomingInvite: null,
    });
  },

  closeCall() {
    logStoreAction("jitsiCall", "closeCall", {});
    set({ activeCall: null });
  },

  ingestIncomingInvite(invite) {
    const current = get();
    if (current.lastIncomingMessageId === invite.messageId) {
      return;
    }
    if (current.activeCall != null) {
      logStoreAction("jitsiCall", "ingestIncomingInviteIgnored", {
        messageId: invite.messageId,
        reason: "activeCall",
      });
      set({ lastIncomingMessageId: invite.messageId });
      return;
    }
    if (current.incomingInvite != null) {
      logStoreAction("jitsiCall", "ingestIncomingInviteIgnored", {
        messageId: invite.messageId,
        reason: "incomingAlreadyOpen",
      });
      set({ lastIncomingMessageId: invite.messageId });
      return;
    }
    logStoreAction("jitsiCall", "ingestIncomingInvite", { messageId: invite.messageId });
    set({
      incomingInvite: invite,
      lastIncomingMessageId: invite.messageId,
    });
  },

  acceptIncomingInvite(options) {
    const invite = get().incomingInvite;
    if (invite == null) return;
    const startWithVideoMuted = options?.startWithVideoMuted ?? true;
    logStoreAction("jitsiCall", "acceptIncomingInvite", {
      messageId: invite.messageId,
      startWithVideoMuted,
    });
    set({
      activeCall: {
        meetingUrl: invite.meetingUrl,
        locationName: invite.locationName,
        startWithVideoMuted,
      },
      incomingInvite: null,
    });
  },

  declineIncomingInvite() {
    const invite = get().incomingInvite;
    logStoreAction("jitsiCall", "declineIncomingInvite", {
      messageId: invite?.messageId ?? null,
    });
    set({ incomingInvite: null });
  },

  clear() {
    logStoreAction("jitsiCall", "clear", {});
    set({
      activeCall: null,
      incomingInvite: null,
      lastIncomingMessageId: null,
    });
  },
}));
