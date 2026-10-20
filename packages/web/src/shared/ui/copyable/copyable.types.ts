import type { ReactNode } from "react";

export interface CopyableProps {
  value: string;
  /** When omitted, only the copy button is rendered (e.g. right-aligned sidebar rows). */
  children?: ReactNode;
  showOnHover?: boolean;
  copyAriaLabel?: string;
  className?: string;
  contentClassName?: string;
  buttonClassName?: string;
  /** Icon pixel size. Defaults to 14 so existing call sites keep the previous look. */
  iconSize?: number;
}
