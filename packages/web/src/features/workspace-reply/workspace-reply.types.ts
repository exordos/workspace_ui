import type { MessengerUuid } from "~/entities/messenger/messenger.types";

export interface WorkspaceReplyQuote {
  messageUuid: MessengerUuid;
  senderUuid: MessengerUuid;
  senderName: string;
  quotedContent: string;
  selectedText?: string;
}

export interface WorkspaceReplyTabIdentity {
  id: string;
  createdAt: string;
}

export interface WorkspaceReplyTab extends WorkspaceReplyQuote, WorkspaceReplyTabIdentity {
  answer: string;
}

export interface WorkspaceReplySession {
  tabs: WorkspaceReplyTab[];
  activeTabId: string | null;
}
