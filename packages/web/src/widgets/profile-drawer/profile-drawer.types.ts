import type { ReactNode } from "react";
import type { IconName } from "~/shared/ui/icon";

export interface ProfileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettingsDrawer?: () => void;
}

export interface MenuItem {
  label: string;
  subtitle?: string;
  icon?: IconName;
  right?: ReactNode;
  highlighted?: boolean;
  destructive?: boolean;
  navigateTo?: string;
  action?: string;
}
