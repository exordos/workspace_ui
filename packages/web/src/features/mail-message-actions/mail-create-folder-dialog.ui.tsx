import React, { useCallback, useEffect, useMemo, useState } from "react";
import { buildVisibleMailFolderRows } from "~/entities/mail/mail-folder-tree.lib";
import { getMailFolderLabelKey } from "~/entities/mail/mail.lib";
import type { MailCreateFolderInput } from "~/entities/mail/mail.types";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import type { MailCreateFolderDialogProps } from "./mail-message-actions.types";

function resolveFolderOptionLabel(path: string, name: string): string {
  const labelKey = getMailFolderLabelKey(path);
  return labelKey != null ? t(labelKey) : name;
}

export const MailCreateFolderDialog: React.FC<MailCreateFolderDialogProps> = ({
  open,
  creating,
  folders,
  delimiter,
  defaultParentPath,
  onOpenChange,
  onCreate,
}) => {
  const [name, setName] = useState("");
  const [parentPath, setParentPath] = useState("");

  const parentOptions = useMemo(() => {
    const expanded = new Set(folders.map((folder) => folder.path));
    return buildVisibleMailFolderRows(folders, delimiter, expanded);
  }, [delimiter, folders]);

  useEffect(() => {
    if (!open) {
      setName("");
      setParentPath("");
      return;
    }
    setParentPath(defaultParentPath ?? "");
  }, [defaultParentPath, open]);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const input: MailCreateFolderInput = {
      name: trimmed,
      ...(parentPath.length > 0 ? { parentPath } : {}),
    };
    onCreate(input);
  }, [name, onCreate, parentPath]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("mail.createFolder")}
      showCloseButton
      maxWidthClassName="max-w-md"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("common.create")}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          submitDisabled={name.trim().length === 0}
          isSubmitting={creating}
        />
      }
    >
      <div className="space-y-3">
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
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("mail.folderName")}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
          />
        </label>
      </div>
    </AppDialog>
  );
};
