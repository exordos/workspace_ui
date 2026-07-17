import type { MessengerConversationId, MessengerUuid } from "./messenger.types";

export type MessengerOutgoingMessageStatus = "uploading" | "sending" | "failed";

export interface MessengerOutgoingMessage {
  localId: string;
  ownerKey: string;
  conversationId: MessengerConversationId;
  projectId: MessengerUuid;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  authorUuid: MessengerUuid;
  markdown: string;
  sourceMarkdown: string;
  status: MessengerOutgoingMessageStatus;
  createdAt: string;
  updatedAt: string;
  attempt: number;
  error: string | null;
  includeStreamConversation: boolean;
  files?: readonly File[];
}

export interface MessengerOutgoingMessageDraft {
  ownerKey: string;
  conversationId: MessengerConversationId;
  projectId: MessengerUuid;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  authorUuid: MessengerUuid;
  markdown: string;
  sourceMarkdown?: string;
  status: Exclude<MessengerOutgoingMessageStatus, "failed">;
  includeStreamConversation: boolean;
  files?: readonly File[];
  createdAt?: string;
}
