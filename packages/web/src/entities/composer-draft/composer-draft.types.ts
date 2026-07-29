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

export type WorkspaceComposerDraftDisposition = "editable" | "consumed";

export interface WorkspaceComposerDraft {
  key: string;
  draftUuid: string;
  ownerKey: string;
  conversationId: string;
  streamUuid: string;
  topicUuid: string;
  snapshotId: string;
  content: WorkspaceComposerDraftContent;
  etag: string | null;
  disposition: WorkspaceComposerDraftDisposition;
  syncStatus: "local" | "saving" | "saved" | "failed" | "conflict" | "deleting";
  serverUpdatedAt: string | null;
  conflictServerContent?: WorkspaceComposerDraftContent;
  conflictServerEtag?: string;
  pendingCreatePayload?: string | null;
  updatedAt: number;
}

export interface WorkspaceComposerDraftTarget {
  streamUuid: string;
  topicUuid: string;
}
