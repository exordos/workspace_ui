import React, { useCallback, useEffect, useMemo, useState } from "react";
import { isDescendantMailFolderPath } from "~/entities/mail/mail-folder-guard.lib";
import {
  buildVisibleMailFolderRows,
  getMailFolderParentPath,
} from "~/entities/mail/mail-folder-tree.lib";
import { getMailFolderLabelKey } from "~/entities/mail/mail.lib";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import type { MailMoveMailboxDialogProps } from "./mail-folder-actions.types";

function resolveFolderOptionLabel(path: string, name: string): string {
  const labelKey = getMailFolderLabelKey(path);
  return labelKey != null ? t(labelKey) : name;
}

export const MailMoveMailboxDialog: React.FC<MailMoveMailboxDialogProps> = ({
  open,
  pending,
  folder,
  folders,
  delimiter,
  onOpenChange,
  onMove,
}) => {
  const [parentPath, setParentPath] = useState("");

  const parentOptions = useMemo(() => {
    if (folder == null) return [];
    const expanded = new Set(folders.map((item) => item.path));
    return buildVisibleMailFolderRows(folders, delimiter, expanded).filter(
      (row) => !isDescendantMailFolderPath(folder.path, row.folder.path, delimiter),
    );
  }, [delimiter, folder, folders]);

  useEffect(() => {
    if (!open || folder == null) {
      setParentPath("");
      return;
    }
    setParentPath(getMailFolderParentPath(folder.path, delimiter) ?? "");
  }, [delimiter, folder, open]);

  const handleSubmit = useCallback(() => {
    onMove(parentPath);
  }, [onMove, parentPath]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("mail.folderActions.move")}
      showCloseButton
      maxWidthClassName="max-w-md"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("mail.move")}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          submitDisabled={false}
          isSubmitting={pending}
        />
      }
    >
      <label className="block text-sm">
        <span className="mb-1 block text-text-muted">{t("mail.parentFolder")}</span>
        <select
          value={parentPath}
          onChange={(e) => setParentPath(e.target.value)}
          className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
        >
          <option value="">{t("mail.parentFolderRoot")}</option>
          {parentOptions.map((row) => (
            <option key={row.folder.path} value={row.folder.path}>
              {`${"—".repeat(row.depth)} ${resolveFolderOptionLabel(row.folder.path, row.folder.name)}`.trim()}
            </option>
          ))}
        </select>
      </label>
    </AppDialog>
  );
};
