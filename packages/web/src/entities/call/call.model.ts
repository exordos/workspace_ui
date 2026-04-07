/**
 * Call participants store — tracks Jitsi call participants per meeting room.
 *
 * Populated while a call modal is open; cleared on modal close.
 */
import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

export interface CallParticipant {
  displayName: string;
}

interface CallParticipantsState {
  /** Participants keyed by meeting room URL; kept in sync while the call modal is open. */
  participantsByUrl: Record<string, CallParticipant[]>;
  setParticipants: (meetingUrl: string, participants: CallParticipant[]) => void;
  clearParticipants: (meetingUrl: string) => void;
  getParticipants: (meetingUrl: string) => CallParticipant[];
}

const EMPTY_PARTICIPANTS: CallParticipant[] = [];

export const useCallParticipantsStore = create<CallParticipantsState>((set, get) => ({
  participantsByUrl: {},
  setParticipants(meetingUrl, participants) {
    logStoreAction("call", "setParticipants", { meetingUrl, count: participants.length });
    set((state) => ({
      participantsByUrl: {
        ...state.participantsByUrl,
        [meetingUrl]: participants,
      },
    }));
  },
  clearParticipants(meetingUrl) {
    logStoreAction("call", "clearParticipants", { meetingUrl });
    set((state) => {
      const next = { ...state.participantsByUrl };
      delete next[meetingUrl];
      return { participantsByUrl: next };
    });
  },
  getParticipants(meetingUrl) {
    return get().participantsByUrl[meetingUrl] ?? EMPTY_PARTICIPANTS;
  },
}));
