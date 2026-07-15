export interface WorkspaceComposerDraftReplyTab {
  id: string;
  messageUuid: string;
  senderUuid: string;
  senderName: string;
  quotedContent: string;
  selectedText?: string;
  createdAt: string;
  answer: string;
}

export interface WorkspaceComposerDraftReplySession {
  tabs: WorkspaceComposerDraftReplyTab[];
  activeTabId: string | null;
}

export interface WorkspaceComposerDraftContent {
  text: string;
  replySession: WorkspaceComposerDraftReplySession;
}

export interface WorkspaceComposerDraft {
  key: string;
  ownerKey: string;
  conversationId: string;
  snapshotId: string;
  content: WorkspaceComposerDraftContent;
  updatedAt: number;
}
