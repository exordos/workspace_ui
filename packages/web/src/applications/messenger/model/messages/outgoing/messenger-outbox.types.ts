import type { ChatEncryptedPayload } from "../../crypto/chat-e2ee.types";
import type { MessengerConversationId, MessengerUuid } from "../../messenger.types";

export interface MessengerSendOptions {
  createNewKey?: boolean;
  // Ownership transfers before network delivery finishes.
  onAccepted?: () => void;
  onEditorAccepted?: (canClear: boolean) => void; // The current editor can leave its visual state unchanged.
  beginNextDraftOnAcceptance?: boolean; // The current editor is ready for new input after enqueue.
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
  readonly canonicalMessageUuid: MessengerUuid;
  readonly placementUuid: MessengerUuid;
  readonly ownerKey: string;
  readonly conversationId: MessengerConversationId;
  readonly projectId: MessengerUuid;
  readonly streamUuid: MessengerUuid;
  readonly topicUuid: MessengerUuid;
  readonly authorUuid: MessengerUuid;
  readonly markdown: string;
  readonly sourceMarkdown: string;
  readonly status: MessengerOutgoingMessageStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attempt: number;
  readonly error: string | null;
  readonly includeStreamConversation: boolean;
  readonly encryption?: MessengerOutgoingEncryption;
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
