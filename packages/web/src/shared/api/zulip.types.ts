/**
 * Public TypeScript contracts for the Zulip API client (`zulip-*.ts` modules).
 */

export class ZulipAuthError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly response?: unknown,
  ) {
    super(message);
    this.name = "ZulipAuthError";
  }
}

export interface ZulipServerSettings {
  realm_name: string;
  realm_icon: string;
  external_authentication_methods: {
    name: string;
    display_name: string;
    display_icon?: string;
    login_url: string;
  }[];
}

export interface DesktopFlowExchangeResult {
  authType: "api_key" | "session";
  email: string;
  apiKey?: string;
}

export interface ZulipUserTopic {
  stream_id: number;
  topic_name: string;
  visibility_policy: number;
}

export interface SavedSnippet {
  id: number;
  title: string;
  content: string;
  date_created: number;
}

export interface RegisterQueueResult {
  queue_id: string;
  last_event_id: number;
  event_queue_longpoll_timeout_seconds?: number;
  user_topics?: ZulipUserTopic[];
}

export interface ZulipEvent {
  id: number;
  type: string;
  [key: string]: unknown;
}

export interface GetEventsResult {
  result?: string;
  msg?: string;
  code?: string;
  events?: ZulipEvent[];
  queue_id?: string;
}

export interface ZulipCredentials {
  realm: string;
  email: string;
  apiKey: string;
}

export interface ZulipCurrentUser {
  user_id: number;
  full_name: string;
  email: string;
}

/** Map of user_id to relative avatar_url path. */
export type AvatarUrlByUserId = Map<number, string>;

/** A single user entry from GET /users. */
export interface ZulipUserMember {
  user_id: number;
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  role?: number;
  /** Present when `include_custom_profile_fields=true`. */
  profile_data?: Record<string, { value?: string; rendered_value?: string }>;
}

/** Response shape from GET /api/v1/realm/presence (keyed by user email). */
export interface RealmPresenceEntry {
  aggregated?: { status: string; timestamp: number };
  website?: { status: string; timestamp: number };
}

export interface RealmPresenceResponse {
  result?: string;
  presences?: Record<string, RealmPresenceEntry>;
  server_timestamp?: number;
}

/** A single reaction on a message (Zulip API shape). */
export interface Reaction {
  emoji_name: string;
  emoji_code: string;
  reaction_type: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";
  user_id: number;
}

/** Raw message from GET /messages. Absence of 'read' in flags means unread. */
export interface ZulipRawMessage {
  id: number;
  sender_id: number;
  sender_full_name?: string;
  /** Sender avatar (relative path), present in GET /messages response. */
  avatar_url?: string | null;
  content: string;
  timestamp: number;
  display_recipient?:
    | string
    | { id: number; full_name: string; email?: string; avatar_url?: string }[];
  subject?: string;
  type?: string;
  stream_id?: number | null;
  flags?: string[];
  reactions?: Reaction[];
}

export type ActivityFilter = "starred" | "mentions" | "reactions";

export interface ActivityMessagesPageResult {
  messages: ZulipRawMessage[];
  foundOldest: boolean;
}

export interface MockStream {
  stream_id: number;
  name: string;
  description: string;
  is_announcement_only: boolean;
}

export type MockMessageDeliveryStatus = "sending" | "failed" | "sent";

export interface MockMessage {
  id: number;
  sender_id: number;
  sender_full_name: string;
  stream_id: number | null;
  display_recipient?:
    | string
    | { id: number; full_name: string; email?: string; avatar_url?: string }[];
  channel?: string;
  subject: string;
  /**
   * Message body: Zulip-flavored Markdown when fetched with `apply_markdown=false` (app default),
   * or rendered HTML from some real-time payloads / legacy cache.
   */
  content: string;
  /**
   * Markdown source for editing and reply quotes; mirrors `content` when the body is Markdown.
   */
  markdown_source?: string;
  timestamp: number;
  /** API flags (e.g. 'read', 'mentioned'). Missing 'read' = unread. */
  flags?: string[];
  reactions?: Reaction[];
  /** Local delivery state for optimistic outgoing messages. */
  delivery_status?: MockMessageDeliveryStatus;
  /**
   * Stable client key for list reconciliation (negative id while optimistic).
   * Preserved after the server assigns a positive message id.
   */
  local_echo_key?: number;
}

/** Input shape for normalizing API messages to MockMessage. */
export type RawMessageToMockInput = {
  id: number;
  sender_id: number;
  sender_full_name?: string;
  content: string;
  /** When set, stored as MockMessage.markdown_source. */
  markdown_source?: string;
  timestamp: number;
  display_recipient?: ZulipRawMessage["display_recipient"];
  subject?: string;
  type?: string;
  stream_id?: number | null;
  flags?: string[];
  reactions?: Reaction[];
};

export interface ZulipSubscription {
  stream_id: number;
  name: string;
  is_muted: boolean;
}

export interface MessagesPageResult {
  messages: MockMessage[];
  foundOldest: boolean;
  /** Present when `num_after > 0`; Zulip `found_newest`. */
  foundNewest: boolean;
}

export interface SendMessageParams {
  /** For stream message: stream name. Omit when using `to` for private. */
  stream?: string;
  /** Optional stream ID for a more faithful optimistic payload. */
  streamId?: number;
  subject?: string;
  content: string;
  sender_id?: number;
  sender_full_name?: string;
  /** For private/DM message: recipient user ids. When set, `stream` is ignored. */
  to?: number[];
}

export interface CreateSavedSnippetParams {
  title: string;
  content: string;
}
