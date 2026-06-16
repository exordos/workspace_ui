import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import type { MailFolderConfirmDialogProps } from "./mail-folder-actions.types";

export const MailFolderConfirmDialog: React.FC<MailFolderConfirmDialogProps> = ({
  open,
  pending,
  title,
  body,
  submitLabel,
  onOpenChange,
  onConfirm,
}) => {
  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      showCloseButton
      maxWidthClassName="max-w-md"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={submitLabel}
          onCancel={handleCancel}
          onSubmit={onConfirm}
          submitDisabled={false}
          isSubmitting={pending}
        />
      }
    >
      <p className="text-sm text-text-secondary">{body}</p>
    </AppDialog>
  );
};
