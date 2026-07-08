import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

export type IncomingDmCallMessageId = number | string;

export interface IncomingDmCallInvite {
  messageId: IncomingDmCallMessageId;
  meetingUrl: string;
  callerName: string;
  locationName: string;
  ownerKey?: string;
  meetUrl?: string;
  displayName?: string;
  avatarUrl?: string;
  timestamp: number;
}

export interface ActiveJitsiCall {
  callKey: string;
  meetingUrl: string;
  locationName: string;
  ownerKey?: string;
  meetUrl?: string;
  displayName?: string;
  startWithVideoMuted?: boolean;
  startedAtMs: number;
}

export interface RequestOpenJitsiCallPayload {
  meetingUrl: string;
  locationName: string;
  ownerKey?: string;
  meetUrl?: string;
  displayName?: string;
  startWithVideoMuted?: boolean;
}

export type RequestOpenJitsiCallResult =
  | { status: "opened"; activeCall: ActiveJitsiCall }
  | { status: "same"; activeCall: ActiveJitsiCall }
  | { status: "blocked-active"; activeCall: ActiveJitsiCall };

interface JitsiCallStoreState {
  activeCall: ActiveJitsiCall | null;
  incomingInvite: IncomingDmCallInvite | null;
  lastIncomingMessageId: IncomingDmCallMessageId | null;
  requestOpenCall: (payload: RequestOpenJitsiCallPayload) => RequestOpenJitsiCallResult;
  openCall: (payload: RequestOpenJitsiCallPayload) => RequestOpenJitsiCallResult;
  closeCall: () => void;
  ingestIncomingInvite: (invite: IncomingDmCallInvite) => void;
  acceptIncomingInvite: (options?: { startWithVideoMuted?: boolean }) => void;
  declineIncomingInvite: () => void;
  clear: () => void;
}

const normalizeMeetingUrlForCallKey = (meetingUrl: string): string => {
  const trimmed = meetingUrl.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
};

export const createJitsiCallKey = (payload: { meetingUrl: string; ownerKey?: string }): string => {
  const ownerKey = payload.ownerKey?.trim() ?? "";
  return `${ownerKey}:${normalizeMeetingUrlForCallKey(payload.meetingUrl)}`;
};

const buildActiveCall = (payload: RequestOpenJitsiCallPayload): ActiveJitsiCall => {
  const startWithVideoMuted = payload.startWithVideoMuted ?? true;
  return {
    callKey: createJitsiCallKey(payload),
    meetingUrl: payload.meetingUrl,
    locationName: payload.locationName,
    ownerKey: payload.ownerKey,
    meetUrl: payload.meetUrl,
    displayName: payload.displayName,
    startWithVideoMuted,
    startedAtMs: Date.now(),
  };
};

export const useJitsiCallStore = create<JitsiCallStoreState>((set, get) => ({
  activeCall: null,
  incomingInvite: null,
  lastIncomingMessageId: null,

  requestOpenCall(payload) {
    const startWithVideoMuted = payload.startWithVideoMuted ?? true;
    const callKey = createJitsiCallKey(payload);
    const currentActiveCall = get().activeCall;

    if (currentActiveCall != null) {
      if (currentActiveCall.callKey === callKey) {
        logStoreAction("jitsiCall", "requestOpenCallSame", {
          hasOwnerKey: payload.ownerKey != null && payload.ownerKey.trim().length > 0,
        });
        return { status: "same", activeCall: currentActiveCall };
      }

      logStoreAction("jitsiCall", "requestOpenCallBlockedActive", {
        hasOwnerKey: payload.ownerKey != null && payload.ownerKey.trim().length > 0,
      });
      return { status: "blocked-active", activeCall: currentActiveCall };
    }

    const activeCall = buildActiveCall(payload);
    logStoreAction("jitsiCall", "openCall", {
      hasLocationName: payload.locationName.trim().length > 0,
      hasOwnerKey: payload.ownerKey != null && payload.ownerKey.trim().length > 0,
      hasMeetUrl: payload.meetUrl != null && payload.meetUrl.trim().length > 0,
      startWithVideoMuted,
    });
    set({
      activeCall,
      incomingInvite: null,
    });
    return { status: "opened", activeCall };
  },

  openCall(payload) {
    return get().requestOpenCall(payload);
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
    const { activeCall, incomingInvite: invite } = get();
    if (invite == null) return;
    const startWithVideoMuted = options?.startWithVideoMuted ?? true;

    if (activeCall != null) {
      logStoreAction("jitsiCall", "acceptIncomingInviteBlockedActive", {
        messageId: invite.messageId,
        startWithVideoMuted,
      });
      set({ incomingInvite: null });
      return;
    }

    logStoreAction("jitsiCall", "acceptIncomingInvite", {
      messageId: invite.messageId,
      startWithVideoMuted,
    });
    const activeInviteCall = buildActiveCall({
      meetingUrl: invite.meetingUrl,
      locationName: invite.locationName,
      ownerKey: invite.ownerKey,
      meetUrl: invite.meetUrl,
      displayName: invite.displayName,
      startWithVideoMuted,
    });
    set({
      activeCall: activeInviteCall,
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
