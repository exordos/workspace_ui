import React, { useCallback, useMemo } from "react";
import { buildVisibleMailFolderRows } from "~/entities/mail/mail-folder-tree.lib";
import { getMailFolderLabelKey } from "~/entities/mail/mail.lib";
import { t } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog.ui";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import type { MailMoveFolderDialogProps } from "./mail-message-actions.types";

function resolveFolderLabel(path: string, name: string): string {
  const labelKey = getMailFolderLabelKey(path);
  return labelKey != null ? t(labelKey) : name;
}

export const MailMoveFolderDialog: React.FC<MailMoveFolderDialogProps> = ({
  open,
  folders,
  delimiter,
  currentFolder,
  onOpenChange,
  onMove,
  onCreateFolder,
}) => {
  const visibleRows = useMemo(() => {
    const expanded = new Set(folders.map((folder) => folder.path));
    return buildVisibleMailFolderRows(folders, delimiter, expanded).filter(
      (row) => row.folder.path !== currentFolder,
    );
  }, [currentFolder, delimiter, folders]);

  const handleCreateFolder = useCallback(() => {
    onCreateFolder();
  }, [onCreateFolder]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("mail.moveTo")}
      showCloseButton
      maxWidthClassName="max-w-md"
    >
      <div className="space-y-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={handleCreateFolder}
        >
          <Icon name="add" size={16} />
          {t("mail.createFolder")}
        </Button>
        <div className="max-h-64 space-y-1 overflow-y-auto border-t border-border-subtle pt-2">
          {visibleRows.map((row) => {
            const label = resolveFolderLabel(row.folder.path, row.folder.name);
            return (
              <Button
                key={row.folder.path}
                type="button"
                variant="ghost"
                className="w-full justify-start"
                style={{ paddingLeft: `${12 + row.depth * 12}px` }}
                onClick={() => onMove(row.folder.path)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>
    </AppDialog>
  );
};
