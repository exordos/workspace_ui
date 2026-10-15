import type { IconName } from "~/shared/ui/icon";
import type { ReactNode } from "react";

export interface PanelMenuRowProps {
  label: string;
  icon?: IconName;
  /** Override default 22px glyph size (e.g. looser viewBox icons). */
  iconSize?: number;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Danger styling for destructive actions (logout). */
  tone?: "default" | "danger";
  variant?: "root" | "nested";
  density?: "regular" | "compact";
  id?: string;
  testId?: string;
  ariaLabel?: string;
  "aria-controls"?: string;
  "aria-expanded"?: boolean;
}
