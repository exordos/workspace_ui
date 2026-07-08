import type { JitsiExternalApi } from "./jitsi-participant-count.hook";

export interface JitsiExternalApiWithParticipants extends JitsiExternalApi {
  getParticipantsInfo: () => object[];
}

export interface JitsiCallModalProps {
  open: boolean;
  meetingUrl: string;
  locationName?: string;
  displayName?: string;
  startWithVideoMuted?: boolean;
  onClose: () => void;
}
