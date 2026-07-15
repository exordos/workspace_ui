import type { Delivery, ProviderSummary } from "~/shared/types/provider-delivery";

export interface MailFolder {
  uuid?: string;
  path: string;
  name: string;
  unread: number;
  total: number;
  specialUse?: string | null;
  provider?: ProviderSummary | null;
  delivery?: Delivery | null;
}

export interface MailMessageSummary {
  uid: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  seen: boolean;
  flagged: boolean;
  provider?: ProviderSummary | null;
  delivery?: Delivery | null;
}

export interface MailMessageDetail extends MailMessageSummary {
  bodyHtml: string | null;
  bodyText: string | null;
  messageId: string | null;
  replyTo: string | null;
  to: string[];
  cc: string[];
  references: string | null;
}

export interface MailComposePayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: MailComposeAttachment[];
}

export interface MailSessionInfo {
  token: string;
  expiresAt: string;
  email: string;
}

export type MailComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface MailFlagsPatch {
  addFlags?: string[];
  removeFlags?: string[];
}

export interface MailCreateFolderInput {
  name: string;
  parentPath?: string;
}

export interface MailRenameFolderInput {
  path: string;
  name: string;
}

export interface MailMoveFolderInput {
  path: string;
  parentPath: string;
}

export type MailFolderAction = "rename" | "move" | "delete" | "clear" | "markAllRead";

export interface MailFoldersResult {
  folders: MailFolder[];
  delimiter: string;
}

export interface MailComposeInitialState {
  to: string;
  cc: string;
  subject: string;
  bodyHtml: string;
  inReplyTo?: string;
  references?: string;
}

export type MailBatchAction = "delete" | "move" | "setFlags";

export interface MailAttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MailComposeAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export type MailMessageAction =
  | "reply"
  | "replyAll"
  | "forward"
  | "delete"
  | "move"
  | "archive"
  | "spam"
  | "toggleStar"
  | "markUnread";
