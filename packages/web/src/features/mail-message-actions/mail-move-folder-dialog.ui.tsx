import React from "react";
import { MailFolderPickerDialog } from "~/features/mail-folder-actions/mail-folder-picker-dialog.ui";
import { t } from "~/i18n/i18n";
import type { MailMoveFolderDialogProps } from "./mail-message-actions.types";

export const MailMoveFolderDialog: React.FC<MailMoveFolderDialogProps> = ({
  open,
  folders,
  delimiter,
  currentFolder,
  onOpenChange,
  onMove,
  onCreateFolder,
}) => (
  <MailFolderPickerDialog
    open={open}
    title={t("mail.moveTo")}
    folders={folders}
    delimiter={delimiter}
    excludePath={currentFolder}
    onOpenChange={onOpenChange}
    onSelect={onMove}
    onCreateFolder={onCreateFolder}
  />
);
