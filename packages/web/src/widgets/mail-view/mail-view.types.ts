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
  selectedUid: string | null;
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  batchMode?: boolean;
  selectedUids?: string[];
  onLoadMore?: () => void;
  onSelectMessage: (uid: string) => void;
  onToggleSelectUid?: (uid: string) => void;
  onToggleStar?: (uid: string) => void;
  onToggleRead?: (uid: string) => void;
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
  onBack?: () => void;
}
