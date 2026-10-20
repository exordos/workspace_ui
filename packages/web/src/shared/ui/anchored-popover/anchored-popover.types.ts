import type { CSSProperties, ReactNode } from "react";

export interface AnchoredPopoverProps {
  open: boolean;
  onClose: () => void;
  panelStyle?: CSSProperties;
  panelClassName?: string;
  ariaLabel: string;
  children: ReactNode;
  testId?: string;
  backdropTestId?: string;
}
