import type { ReactNode } from "react";

export interface RightDrawerProps {
  onClose: () => void;
  /** Panel shell title, rendered in the same row as the close button. */
  title?: string;
  children: ReactNode;
}
