import type { ReactNode } from "react";

export interface MediaViewerBackdropProps {
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  children: ReactNode;
}
