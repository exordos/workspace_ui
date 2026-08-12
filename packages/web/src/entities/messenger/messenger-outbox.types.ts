import type { MessengerConversationId, MessengerUuid } from "./messenger.types";

export type MessengerOutgoingMessageStatus = "sending" | "failed";

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
  status: "sending";
  includeStreamConversation: boolean;
  createdAt?: string;
}
