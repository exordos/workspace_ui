export interface JitsiCallWindowPayload {
  callId: string;
  meetingUrl: string;
  locationName: string;
  displayName: string;
  startWithVideoMuted: boolean;
  language: "ru" | "en";
  theme?: { mode: "light" | "dark"; paletteId: string };
}

export interface JitsiCallWindowParticipant {
  displayName: string;
}

export interface JitsiCallWindowParticipantsEvent {
  callId: string;
  participants: JitsiCallWindowParticipant[];
}

export const JITSI_CALL_WINDOW_IPC = {
  open: "jitsi-call-window:open",
  focus: "jitsi-call-window:focus",
  close: "jitsi-call-window:close",
  closed: "jitsi-call-window:closed",
  getPayload: "jitsi-call-window:get-payload",
  updateParticipants: "jitsi-call-window:update-participants",
  participants: "jitsi-call-window:participants",
} as const;
