import * as Dialog from "@radix-ui/react-dialog";
import React from "react";
import type { AppDialogFormFooterProps, AppDialogProps } from "./app-dialog.types";

const DEFAULT_CONTENT_CLASS =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 z-modal w-full -translate-x-1/2 rounded-xl border border-border-subtle bg-bg-elevated p-6 shadow-xl";

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
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className={`${DEFAULT_CONTENT_CLASS} ${maxWidthClassName} ${positionClassName}`}
          onCloseAutoFocus={onCloseAutoFocus ?? ((e) => e.preventDefault())}
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
    <Dialog.Close asChild>
      <button
        type="button"
        onClick={onCancel}
        className="hover:bg-bg/60 rounded-lg px-4 py-2 text-sm text-text-muted transition-colors"
      >
        {cancelLabel}
      </button>
    </Dialog.Close>
    <button
      type="button"
      onClick={onSubmit}
      disabled={submitDisabled || isSubmitting}
      className="hover:bg-accent/90 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors disabled:opacity-50"
    >
      {isSubmitting && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {submitLabel}
    </button>
  </>
);
