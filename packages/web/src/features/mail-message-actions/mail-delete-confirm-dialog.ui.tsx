import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import type { MailDeleteConfirmDialogProps } from "./mail-message-actions.types";

export const MailDeleteConfirmDialog: React.FC<MailDeleteConfirmDialogProps> = ({
  open,
  deleting,
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
      title={t("mail.deleteConfirmTitle")}
      showCloseButton
      maxWidthClassName="max-w-md"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("mail.deletePermanent")}
          onCancel={handleCancel}
          onSubmit={onConfirm}
          submitDisabled={false}
          isSubmitting={deleting}
        />
      }
    >
      <p className="text-sm text-text-secondary">{t("mail.deleteConfirmBody")}</p>
    </AppDialog>
  );
};
