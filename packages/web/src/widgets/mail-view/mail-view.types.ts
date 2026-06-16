import type {
  MailFolder,
  MailMessageSummary,
  MailMessageDetail,
  MailMessageAction,
  MailFolderAction,
} from "~/entities/mail/mail.types";

export interface MailFolderListProps {
  folders: MailFolder[];
  delimiter: string;
  selectedFolder: string;
  compact: boolean;
  onSelectFolder: (path: string) => void;
  onToggleCompact: () => void;
  onCreateFolder: () => void;
  onFolderAction: (path: string, action: MailFolderAction) => void;
}

export interface MailMessageListProps {
  messages: MailMessageSummary[];
  selectedUid: number | null;
  loading: boolean;
  onSelectMessage: (uid: number) => void;
}

export interface MailMessagePreviewProps {
  loading: boolean;
  message: MailMessageDetail | null;
  inTrash: boolean;
  onAction: (action: MailMessageAction) => void;
}
