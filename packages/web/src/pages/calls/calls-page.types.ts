import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";

export interface RecentJitsiCallEntry {
  id: MessageId;
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
