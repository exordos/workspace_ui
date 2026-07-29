import type { ReactNode } from "react";

export interface RightDrawerProps {
  onClose: () => void;
  /** Panel shell title, rendered in the same row as the close button. */
  title?: string;
  /**
   * Optional back control in the shell header (nested panel history).
   * X always closes the whole drawer; back only steps one level when provided.
   */
  onBack?: () => void;
  children: ReactNode;
}
