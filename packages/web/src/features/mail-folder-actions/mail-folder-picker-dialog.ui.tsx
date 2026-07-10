import React, { useCallback, useMemo } from "react";
import { buildVisibleMailFolderRows } from "~/entities/mail/mail-folder-tree.lib";
import { getMailFolderLabelKey } from "~/entities/mail/mail.lib";
import type { MailFolder } from "~/entities/mail/mail.types";
import { t } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog.ui";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";

export interface MailFolderPickerDialogProps {
  open: boolean;
  title: string;
  folders: MailFolder[];
  delimiter: string;
  excludePath?: string | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  onCreateFolder?: () => void;
}

function resolveFolderLabel(path: string, name: string): string {
  const labelKey = getMailFolderLabelKey(path);
  return labelKey != null ? t(labelKey) : name;
}

export const MailFolderPickerDialog: React.FC<MailFolderPickerDialogProps> = ({
  open,
  title,
  folders,
  delimiter,
  excludePath,
  onOpenChange,
  onSelect,
  onCreateFolder,
}) => {
  const visibleRows = useMemo(() => {
    const expanded = new Set(folders.map((folder) => folder.path));
    return buildVisibleMailFolderRows(folders, delimiter, expanded).filter(
      (row) => row.folder.path !== excludePath,
    );
  }, [delimiter, excludePath, folders]);

  const handleSelect = useCallback(
    (path: string) => () => {
      onSelect(path);
    },
    [onSelect],
  );

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      showCloseButton
      maxWidthClassName="max-w-md"
    >
      <div className="space-y-2">
        {onCreateFolder != null ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={onCreateFolder}
          >
            <Icon name="add" size={16} />
            {t("mail.createFolder")}
          </Button>
        ) : null}
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {visibleRows.map(({ folder, depth }) => (
            <li key={folder.path}>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                style={{ paddingLeft: `${8 + depth * 12}px` }}
                onClick={handleSelect(folder.path)}
              >
                {resolveFolderLabel(folder.path, folder.name)}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </AppDialog>
  );
};
