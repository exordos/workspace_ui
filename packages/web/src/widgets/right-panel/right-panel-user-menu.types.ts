import type { IconName } from "~/shared/ui/icon";
import type { ReactNode } from "react";

export interface RightPanelUserMenuProps {
  onOpenAboutDrawer?: () => void;
  onOpenBuildsDrawer?: () => void;
  onOpenPersonalInfo?: () => void;
}

export interface MenuButtonProps {
  label: string;
  icon: IconName;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export interface OptionButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}
