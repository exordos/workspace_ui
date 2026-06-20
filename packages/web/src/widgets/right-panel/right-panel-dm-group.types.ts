import type { ChatInfoData } from "~/features/chat-info/chat-info.types";
import type { UserId } from "~/shared/lib/user-id.lib";

export interface RightPanelDmGroupProps {
  title: string;
  data: ChatInfoData;
  onOpenUserProfile?: (userId: UserId) => void;
}
