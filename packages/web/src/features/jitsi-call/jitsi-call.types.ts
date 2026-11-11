import type { JitsiExternalApi } from "./jitsi-participant-count.hook";

export interface JitsiExternalApiWithParticipants extends JitsiExternalApi {
  getParticipantsInfo: () => object[];
}

export interface JitsiCallProps {
  open: boolean;
  meetingUrl: string;
  locationName?: string;
  displayName?: string;
  startWithVideoMuted?: boolean;
  onClose: () => void;
}

// Session-level embed props only — shell state (minimized, bounds) stays outside.
export interface JitsiCallEmbedProps {
  displayName: string;
  domain: string | null;
  roomName: string | null;
  startWithVideoMuted: boolean;
  onApiReady: (api: JitsiExternalApiWithParticipants) => void;
  onIframeReady: (ref: HTMLElement | null) => void;
  onReadyToClose: () => void;
}
