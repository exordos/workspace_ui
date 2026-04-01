import type { ReactNode } from "react";
import type { IconName } from "~/shared/ui/icon";

export interface RightPanelUserMenuProps {
  heading?: string;
  onOpenAboutDrawer?: () => void;
  onOpenBuildsDrawer?: () => void;
}

export interface MenuButtonProps {
  label: string;
  icon: IconName;
  subtitle?: string;
  right?: ReactNode;
  onClick: () => void;
}

export interface OptionButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}
