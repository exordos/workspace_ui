import type { MailFolder, MailFolderAction } from "~/entities/mail/mail.types";
import type React from "react";

export interface MailRenameFolderDialogProps {
  open: boolean;
  pending: boolean;
  folder: MailFolder | null;
  delimiter: string;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
}

export interface MailMoveMailboxDialogProps {
  open: boolean;
  pending: boolean;
  folder: MailFolder | null;
  folders: readonly MailFolder[];
  delimiter: string;
  onOpenChange: (open: boolean) => void;
  onMove: (parentPath: string) => void;
}

export interface MailFolderConfirmDialogProps {
  open: boolean;
  pending: boolean;
  title: string;
  body: string;
  submitLabel: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export interface MailFolderContextMenuProps {
  folder: MailFolder;
  delimiter: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: MailFolderAction) => void;
  trigger: React.ReactNode;
}
