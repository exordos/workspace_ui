import type {
  MailCreateFolderInput,
  MailFolder,
  MailMessageAction,
  MailMessageDetail,
} from "~/entities/mail/mail.types";

export interface MailMessageActionBarProps {
  message: MailMessageDetail;
  inTrash: boolean;
  onAction: (action: MailMessageAction) => void;
}

export interface MailMoveFolderDialogProps {
  open: boolean;
  folders: MailFolder[];
  delimiter: string;
  currentFolder: string;
  onOpenChange: (open: boolean) => void;
  onMove: (folderPath: string) => void;
  onCreateFolder: () => void;
}

export interface MailCreateFolderDialogProps {
  open: boolean;
  creating: boolean;
  folders: readonly MailFolder[];
  delimiter: string;
  defaultParentPath?: string;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: MailCreateFolderInput) => void;
}

export interface MailDeleteConfirmDialogProps {
  open: boolean;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}
