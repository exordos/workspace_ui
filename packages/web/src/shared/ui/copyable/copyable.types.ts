import type { ReactNode } from "react";

interface CopyableCommonProps {
  /** Custom clipboard action, for content other than text. */
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

export type CopyableProps = CopyableCommonProps &
  (
    | { value: string; onCopy?: () => Promise<boolean> }
    | { value?: string; onCopy: () => Promise<boolean> }
  );
