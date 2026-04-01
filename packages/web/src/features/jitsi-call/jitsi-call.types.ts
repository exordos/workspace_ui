import type { JitsiExternalApi } from "./use-jitsi-participant-count.hook";

export interface JitsiExternalApiWithParticipants extends JitsiExternalApi {
  getParticipantsInfo: () => object[];
}

export interface JitsiCallModalProps {
  open: boolean;
  meetingUrl: string;
  locationName?: string;
  onClose: () => void;
}
