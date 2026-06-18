import type {
  MailFolder,
  MailMessageDetail,
  MailMessageSummary,
  SendMailRequest,
} from "@mail/api/mail-api.generated";

export type { MailFolder, MailMessageDetail, MailMessageSummary };
export type MailComposePayload = SendMailRequest;

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
