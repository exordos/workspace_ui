import type { ReactNode } from "react";

export interface CopyableProps {
  value: string;
  children: ReactNode;
  showOnHover?: boolean;
  copyAriaLabel?: string;
  className?: string;
  contentClassName?: string;
  buttonClassName?: string;
}
