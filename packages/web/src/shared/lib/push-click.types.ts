export interface PushClickTargetInput {
  type?: "stream" | "private";
  messageId?: number;
  streamId?: number;
  streamName?: string;
  topic?: string;
  senderId?: number;
}

export interface PushNotificationClickPayload {
  messageId?: number | string;
  messageType?: string;
  streamId?: number | string;
  streamName?: string;
  topic?: string;
  senderId?: number | string;
  realmUri?: string;
}
