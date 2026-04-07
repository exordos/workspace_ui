import type { RightPanelUserInfo } from "./right-panel.types";

export interface RightPanelUserProps {
  user: RightPanelUserInfo;
  onSelectCommonGroup?: (slug: string) => void;
  onOpenDirectMessage?: (userId: number) => void;
}
