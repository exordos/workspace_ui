import type * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export interface AppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Footer actions (Cancel / Submit). Omit for custom footers inside children. */
  footer?: ReactNode;
  /** Max width utility class, e.g. `max-w-md`. */
  maxWidthClassName?: string;
  /** Vertical position — default `top-[20%]`, use `top-1/2 -translate-y-1/2` for centered. */
  positionClassName?: string;
  /** Keep heading and footer fixed while only the body scrolls. */
  scrollBody?: boolean;
  /**
   * Header dismiss control (X). Uses Radix Dialog.Close → `onOpenChange(false)`.
   * Default true so AppDialog carries a standard dismiss affordance.
   */
  showCloseButton?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}

export interface AppDialogFormFooterProps {
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
  isSubmitting?: boolean;
}

export interface AppDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentClassName: string;
  children: ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
  modal?: boolean;
  ariaDescribedBy?: string;
  showOverlay?: boolean;
  overlayClassName?: string;
  forceMountContent?: boolean;
  onPointerDownOutside?: DialogPrimitive.DialogContentProps["onPointerDownOutside"];
  onInteractOutside?: DialogPrimitive.DialogContentProps["onInteractOutside"];
}
