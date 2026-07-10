export interface PushClickTargetInput {
  /** Legacy fields are accepted for caller compatibility but never build legacy routes. */
  type?: "stream" | "private";
  messageId?: number;
  streamId?: number;
  streamName?: string;
  topic?: string;
  senderId?: number;
  orgId?: string;
  projectId?: string;
  streamUuid?: string;
  topicUuid?: string;
  messageUuid?: string;
}

export interface PushNotificationClickPayload {
  /** Legacy fields are accepted for caller compatibility but never build legacy routes. */
  messageId?: number | string;
  messageType?: string;
  streamId?: number | string;
  streamName?: string;
  topic?: string;
  senderId?: number | string;
  realmUri?: string;
  orgId?: string;
  projectId?: string;
  streamUuid?: string;
  topicUuid?: string;
  messageUuid?: string;
}

export type PushClickRouteResolution =
  | { kind: "route"; route: string }
  | {
      kind: "unsupported";
      reason: "workspace_route_context_missing";
      route: string;
    };
