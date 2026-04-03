export type FloatingLoadingOverlayPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "left-center"
  | "right-center";

export interface FloatingLoadingOverlayProps {
  visible: boolean;
  label?: string;
  position?: FloatingLoadingOverlayPosition;
  className?: string;
}
