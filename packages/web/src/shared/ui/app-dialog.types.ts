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
