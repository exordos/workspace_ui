import type { MockMessage } from "~/shared/api/zulip.types";

export interface RecentJitsiCallEntry {
  id: number;
  meetingUrl: string;
  roomLabel: string;
  locationName: string;
  contextLabel: string;
  message: MockMessage;
}

export interface CallsRowProps {
  entry: RecentJitsiCallEntry;
  onJoin: (entry: RecentJitsiCallEntry) => void;
  onOpenInChat: (entry: RecentJitsiCallEntry) => void;
}
