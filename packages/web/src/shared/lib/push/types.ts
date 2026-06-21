/**
 * Push notification type definitions.
 *
 * Supports two delivery channels:
 * 1. Firebase Cloud Messaging (FCM) — standard web push via VAPID
 * 2. Workspace Push Service — registers FCM token with server for server-sent pushes
 *
 * Both channels can work together: FCM handles delivery,
 * server decides WHEN to send (new message, mention, DM).
 */
import type { MessageId } from "../message-id.lib";

// ---------------------------------------------------------------------------
// Push message payload (from server → client)
// ---------------------------------------------------------------------------

export interface PushMessagePayload {
  /** messenger event type: "message", "remove", "test" */
  event: "message" | "remove" | "test";
  /** server realm URL */
  realm_uri?: string;
  /** Message data (for "message" event) */
  message?: {
    id: MessageId;
    sender_id: number;
    sender_full_name: string;
    sender_avatar_url?: string;
    type: "stream" | "private";
    stream_name?: string;
    topic?: string;
    content: string;
    stream_uuid?: string;
    flags?: string[];
    /** Unix timestamp */
    timestamp: number;
  };
  /** Message IDs to dismiss (for "remove" event) */
  message_ids?: MessageId[];
}

// ---------------------------------------------------------------------------
// Push provider interface
// ---------------------------------------------------------------------------

export interface PushProvider {
  readonly name: string;
  /** Initialize the provider (load SDK, register SW). */
  init(): Promise<void>;
  /** Get the push token (FCM registration token). Null if not available. */
  getToken(): Promise<string | null>;
  /** Subscribe to foreground push messages. Returns unsubscribe function. */
  onMessage(handler: (payload: PushMessagePayload) => void): () => void;
  /** Check if push is supported in this environment. */
  isSupported(): boolean;
}

// ---------------------------------------------------------------------------
// Push registration state
// ---------------------------------------------------------------------------

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

export interface PushState {
  permission: PushPermission;
  token: string | null;
  registered: boolean;
  provider: string | null;
  /** Last server registration failure (cleared on success). */
  registrationError: string | null;
}
