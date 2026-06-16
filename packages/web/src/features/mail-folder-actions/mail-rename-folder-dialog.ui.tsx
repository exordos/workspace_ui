import React, { useCallback, useEffect, useState } from "react";
import { getMailFolderLeafName } from "~/entities/mail/mail-folder-guard.lib";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import type { MailRenameFolderDialogProps } from "./mail-folder-actions.types";

export const MailRenameFolderDialog: React.FC<MailRenameFolderDialogProps> = ({
  open,
  pending,
  folder,
  delimiter,
  onOpenChange,
  onRename,
}) => {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open || folder == null) {
      setName("");
      return;
    }
    setName(getMailFolderLeafName(folder.path, delimiter));
  }, [delimiter, folder, open]);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    onRename(trimmed);
  }, [name, onRename]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("mail.folderActions.rename")}
      showCloseButton
      maxWidthClassName="max-w-md"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("common.save")}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          submitDisabled={name.trim().length === 0}
          isSubmitting={pending}
        />
      }
    >
      <label className="block text-sm">
        <span className="mb-1 block text-text-muted">{t("mail.folderName")}</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
        />
      </label>
    </AppDialog>
  );
};
