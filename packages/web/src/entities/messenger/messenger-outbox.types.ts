import type { ChatEncryptedPayload } from "./chat-e2ee.types";
import type { MessengerConversationId, MessengerUuid } from "./messenger.types";

export interface MessengerSendOptions {
  createNewKey?: boolean;
  // Ownership transfers before network delivery finishes.
  onAccepted?: () => void;
}

export interface MessengerOutgoingEncryption {
  readonly mode?: "message" | "fragments";
  readonly fragments?: readonly ChatEncryptedPayload[];
  readonly preparedMarkdown?: string;
  readonly keyUuid: string;
  readonly deviceId: string;
  readonly payload?: ChatEncryptedPayload;
}

export type MessengerOutgoingMessageStatus = "sending" | "failed";

export interface MessengerOutgoingMessage {
  canonicalMessageUuid: MessengerUuid;
  placementUuid: MessengerUuid;
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
  encryption?: MessengerOutgoingEncryption;
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
  encryption?: MessengerOutgoingEncryption;
}
