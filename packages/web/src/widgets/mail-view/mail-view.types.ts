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
  loadingMore?: boolean;
  hasMore?: boolean;
  batchMode?: boolean;
  selectedUids?: number[];
  onLoadMore?: () => void;
  onSelectMessage: (uid: number) => void;
  onToggleSelectUid?: (uid: number) => void;
}

export interface MailMessagePreviewProps {
  loading: boolean;
  message: MailMessageDetail | null;
  attachments?: { id: string; filename: string; mimeType: string; sizeBytes: number }[];
  inTrash: boolean;
  inDrafts?: boolean;
  onAction: (action: MailMessageAction) => void;
  onEditDraft?: () => void;
  onDownloadAttachment?: (attachmentId: string) => void;
}
