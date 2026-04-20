import type { IconName } from "~/shared/ui/icon";
import type { ReactNode } from "react";

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
