import type { UserId } from "~/shared/lib/user-id.lib";
import type { RightPanelUserInfo } from "./right-panel.types";

export interface RightPanelUserProps {
  user: RightPanelUserInfo;
  onOpenDirectMessage?: (userId: UserId) => void;
}
