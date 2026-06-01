import * as Dialog from "@radix-ui/react-dialog";
import React from "react";
import { Spinner } from "~/shared/ui/spinner.ui";
import type {
  AppDialogFormFooterProps,
  AppDialogProps,
  AppDialogShellProps,
} from "./app-dialog.types";

export const APP_DIALOG_OVERLAY_CLASS =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50";

/** Static backdrop (popovers, mention card) without enter/exit animation. */
export const APP_DIALOG_BACKDROP_STATIC_CLASS = "fixed inset-0 z-overlay bg-black/50";

export const APP_DIALOG_CONTENT_BASE_CLASS =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 z-modal w-full -translate-x-1/2 rounded-xl border border-border-subtle bg-bg-elevated shadow-xl";

const DEFAULT_CONTENT_CLASS = `${APP_DIALOG_CONTENT_BASE_CLASS} p-6`;

export const DIALOG_CANCEL_BUTTON_CLASS =
  "hover:bg-bg/60 rounded-lg px-4 py-2 text-sm text-text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const DIALOG_PRIMARY_BUTTON_CLASS =
  "hover:bg-accent/90 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors disabled:opacity-50";

export interface DialogCancelButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  useDialogClose?: boolean;
  className?: string;
}

export const DialogCancelButton: React.FC<DialogCancelButtonProps> = ({
  children,
  onClick,
  disabled = false,
  useDialogClose = true,
  className = "",
}) => {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${DIALOG_CANCEL_BUTTON_CLASS} ${className}`.trim()}
    >
      {children}
    </button>
  );
  if (useDialogClose) {
    return <Dialog.Close asChild>{button}</Dialog.Close>;
  }
  return button;
};

export interface DialogPrimaryButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  isSubmitting?: boolean;
  className?: string;
  type?: "button" | "submit";
}

export const DialogPrimaryButton: React.FC<DialogPrimaryButtonProps> = ({
  children,
  onClick,
  disabled = false,
  isSubmitting = false,
  className = "",
  type = "button",
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled || isSubmitting}
    className={`${DIALOG_PRIMARY_BUTTON_CLASS} ${className}`.trim()}
  >
    {isSubmitting ? <Spinner size="sm" variant="inherit" /> : null}
    {children}
  </button>
);

export const AppDialogShell: React.FC<AppDialogShellProps> = ({
  open,
  onOpenChange,
  contentClassName,
  children,
  onCloseAutoFocus,
  modal = true,
  ariaDescribedBy,
  showOverlay = true,
  overlayClassName = APP_DIALOG_OVERLAY_CLASS,
  forceMountContent = false,
  onPointerDownOutside,
  onInteractOutside,
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
    <Dialog.Portal>
      {showOverlay ? <Dialog.Overlay className={overlayClassName} /> : null}
      <Dialog.Content
        className={contentClassName}
        forceMount={forceMountContent ? true : undefined}
        onCloseAutoFocus={onCloseAutoFocus ?? ((e) => e.preventDefault())}
        aria-describedby={ariaDescribedBy}
        onPointerDownOutside={onPointerDownOutside}
        onInteractOutside={onInteractOutside}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export const AppDialog: React.FC<AppDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  maxWidthClassName = "max-w-md",
  positionClassName = "top-[20%]",
  onCloseAutoFocus,
}) => {
  const contentClassName = `${DEFAULT_CONTENT_CLASS} ${maxWidthClassName} ${positionClassName}`;

  return (
    <AppDialogShell
      open={open}
      onOpenChange={onOpenChange}
      contentClassName={contentClassName}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <Dialog.Title className="mb-4 text-base font-semibold text-text-primary">
        {title}
      </Dialog.Title>
      {description != null && description.length > 0 ? (
        <Dialog.Description className="mb-4 text-sm text-text-secondary">
          {description}
        </Dialog.Description>
      ) : null}
      {children}
      {footer != null ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
    </AppDialogShell>
  );
};

export const AppDialogFormFooter: React.FC<AppDialogFormFooterProps> = ({
  cancelLabel,
  submitLabel,
  onCancel,
  onSubmit,
  submitDisabled = false,
  isSubmitting = false,
}) => (
  <>
    <DialogCancelButton onClick={onCancel}>{cancelLabel}</DialogCancelButton>
    <DialogPrimaryButton onClick={onSubmit} disabled={submitDisabled} isSubmitting={isSubmitting}>
      {submitLabel}
    </DialogPrimaryButton>
  </>
);
