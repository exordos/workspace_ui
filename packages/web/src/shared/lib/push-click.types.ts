import type { MessageId } from "./message-id.lib";

export interface PushClickTargetInput {
  type?: "stream" | "private";
  messageId?: MessageId;
  streamId?: string;
  streamName?: string;
  topic?: string;
  senderId?: number;
}

export interface PushNotificationClickPayload {
  messageId?: MessageId;
  messageType?: string;
  streamId?: string;
  streamName?: string;
  topic?: string;
  senderId?: number | string;
  realmUri?: string;
}
