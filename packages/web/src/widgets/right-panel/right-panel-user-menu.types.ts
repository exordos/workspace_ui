import type { IconName } from "~/shared/ui/icon";
import type { RightPanelAccountScreen } from "./right-panel.types";
import type { ReactNode } from "react";

export interface RightPanelUserMenuProps {
  accountScreen?: Extract<RightPanelAccountScreen, "root" | "settings" | "appearance">;
  onAccountScreenChange?: (
    screen: Extract<RightPanelAccountScreen, "root" | "settings" | "appearance">,
  ) => void;
  onOpenAboutDrawer?: () => void;
  onOpenPersonalInfo?: () => void;
  onNestedPanelChange?: (nested: { titleKey: string; onBack: () => void } | null) => void;
}

export interface MenuButtonProps {
  label: string;
  icon: IconName;
  /** Override default 22px glyph size (e.g. looser viewBox icons). */
  iconSize?: number;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Danger styling for destructive actions (logout). */
  tone?: "default" | "danger";
  variant?: "root" | "nested";
  id?: string;
  testId?: string;
  ariaLabel?: string;
  "aria-controls"?: string;
  "aria-expanded"?: boolean;
}
