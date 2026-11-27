import type { ReactNode } from "react";

// The caller supplies the copy action and the control presents its result.
export interface CopyableProps {
  onCopy: () => Promise<boolean>; // True when the content was copied successfully.
  disabled?: boolean;
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
