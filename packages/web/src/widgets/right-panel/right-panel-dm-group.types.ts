import type { ChatInfoData } from "~/features/chat-info/chat-info.types";

export interface RightPanelDmGroupProps {
  title: string;
  data: ChatInfoData;
  onOpenUserProfile?: (userId: number) => void;
}
