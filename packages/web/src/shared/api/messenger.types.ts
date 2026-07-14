/**
 * Public TypeScript contracts for the Messenger API client (`messenger-*.ts` modules).
 */
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { LinkPreviewData } from "~/shared/lib/message-link-preview.types";
import type { UserId } from "~/shared/lib/user-id.lib";

export type WorkspaceStreamNotificationMode = "all_messages" | "mentions_only" | "muted";
export type WorkspaceTopicNotificationMode = "default" | "mute" | "follow" | "unmute";
export type WorkspaceUserPresenceStatus = "active" | "idle" | "offline" | "do_not_disturb";
export type MessengerSourceName = "native" | "zulip";
export type MessengerSource = Record<string, unknown> & { kind?: string };

export class MessengerAuthError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly response?: unknown,
  ) {
    super(message);
    this.name = "MessengerAuthError";
  }
}

export interface MessengerServerSettings {
  realm_name: string;
  realm_icon: string;
  /** Canonical organization URL (server 9+: prefer {@link realm_url}). */
  realm_uri: string;
  /** Canonical organization URL (server 9+). Alias of realm_uri in older docs. */
  realm_url: string;
}

export interface MessengerRecentPrivateConversation {
  user_ids: number[];
  max_message_id: MessageId | null;
  unread_message_ids: MessageId[];
}

/** Stream row returned by `GET /api/messenger/v1/streams/`. */
export interface MessengerMeStream {
  /** Workspace stream UUID used for reads and writes. */
  uuid: string;
  name: string;
  description: string;
  project_id?: string;
  created_at?: string;
  updated_at?: string;
  user_uuid?: string;
  owner?: string;
  /** UI/API alias for the stream UUID. */
  stream_uuid: string;
  /** Server-owned default topic UUID, or null when no default is configured. */
  default_topic_uuid: string | null;
  last_synced_at?: string;
  source_name?: MessengerSourceName;
  source?: MessengerSource;
  invite_only: boolean;
  announce: boolean;
  private: boolean;
  is_archived: boolean;
  /** Server-owned stream color as 0xRRGGBB. */
  color?: number;
  unread_count: number;
  notification_mode: WorkspaceStreamNotificationMode;
}

/** Markdown message body from the Workspace gateway `/messages/` payload. */
export interface MessengerMeMessagePayload {
  kind: "markdown";
  content: string;
}

/**
 * One message row from `GET /api/messenger/v1/messages/` for the authenticated user.
 * `stream_uuid` is the single stream identity used for reads and writes. Field names are
 * snake_case (`convert_underscore=False`).
 */
export interface MessengerMeMessage {
  /** Message UUID. Use this for paging, row lookup, and message operations. */
  uuid: string;
  stream_uuid: string;
  topic_uuid?: string;
  payload: MessengerMeMessagePayload;
  /** IAM UUID of the actual message author. */
  author_uuid?: string;
  /** True when the message was authored by the authenticated user. */
  is_own: boolean;
  read: boolean;
  pinned: boolean;
  starred: boolean;
  /** Server-computed mention flag when available; otherwise activity falls back to payload scan. */
  mentioned?: boolean;
  /** Native Workspace rows use `native`; bridge-imported rows can use `zulip`. */
  source_name?: MessengerSourceName;
  source?: MessengerSource;
  reactions?: MessageReactions;
  user_uuid?: string;
  project_id?: string;
  last_synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

/** Stream topic row returned by `GET /api/messenger/v1/stream_topics/`. */
export interface MessengerStreamTopic {
  uuid: string;
  name: string;
  stream_uuid: string;
  unread_count: number;
  is_default: boolean;
  is_done: boolean;
  /** Server-owned topic color as 0xRRGGBB. */
  color?: number;
  notification_mode: WorkspaceTopicNotificationMode;
  /** Native Workspace topics use `native`; bridge-imported topics can use `zulip`. */
  source_name?: MessengerSourceName;
  source?: MessengerSource;
  project_id?: string;
  created_at?: string;
  updated_at?: string;
}

/** One page of `/messages/` rows plus the marker-based pagination cursor. */
export interface MessengerMeMessagesPage {
  messages: MessengerMeMessage[];
  /** `X-Pagination-Marker` of the last row; `null` when this is the final page. */
  nextMarker: string | null;
}

export interface MessengerGroupSettingValueObject {
  direct_members: UserId[];
  direct_subgroups: number[];
}

/** messenger group-setting value: single group id or `{ direct_members, direct_subgroups }`. */
export type MessengerGroupSettingValue = number | MessengerGroupSettingValueObject;

export type WorkspaceStreamRole = "guest" | "member" | "moderator" | "administrator" | "owner";

export interface WorkspaceStreamBinding {
  uuid: string;
  stream_uuid: string;
  user_uuid: string;
  role: WorkspaceStreamRole;
}

export interface MessengerRealmUserGroup {
  id: number;
  name: string;
  members: UserId[];
  direct_subgroup_ids: number[];
  is_system_group?: boolean;
}

export interface SavedSnippet {
  id: number;
  title: string;
  content: string;
  date_created: number;
}

/** One server-supported user-upload thumbnail variant (server 9.0+; see `server_thumbnail_formats` in register). */
export interface MessengerServerThumbnailFormat {
  name: string;
  max_width: number;
  max_height: number;
  format: string;
  animated: boolean;
}

/** Avatar-related capabilities from register `realm` metadata. */
export interface WorkspaceOwnAvatarCapabilities {
  max_avatar_file_size_mib?: number;
  realm_avatar_changes_disabled?: boolean;
  server_avatar_changes_disabled?: boolean;
}

export interface MessengerEvent {
  id: number;
  type: string;
  [key: string]: unknown;
}

export interface GetEventsResult {
  result?: string;
  msg?: string;
  code?: string;
  /** Seconds until the client may retry (messenger rate limit JSON). */
  "retry-after"?: number;
  events?: MessengerEvent[];
  queue_id?: string;
}

export interface MessengerCredentials {
  realm: string;
  /** Workspace REST/API origin saved from the URL entered at login. */
  workspaceOrgOrigin?: string;
  login: string;
  accessToken: string;
}

export interface WorkspaceCurrentUser {
  user_id: UserId;
  full_name: string;
  email: string;
  /** Optional organization role code when the backend provides one. */
  role?: number;
}

/** Map of normalized user id key → avatar ref (legacy URL/path or Workspace avatar URN). */
export type AvatarUrlByUserId = Map<string, string>;

/** A normalized user entry from `GET /api/messenger/v1/users/`. */
export interface MessengerUserMember {
  user_id: UserId;
  full_name?: string;
  email?: string;
  /** Normalized avatar ref from backend `avatar` URNs or legacy `avatar_url`. */
  avatar_url?: string | null;
  role?: number;
  /** Custom status profile fields from Workspace `status_emoji` / `status_text`. */
  status?: {
    text: string;
    emojiName?: string;
    away: boolean;
  } | null;
  /** Workspace user presence from `/users/` and `user.updated` events. */
  presence?: {
    status: WorkspaceUserPresenceStatus;
    timestamp: number;
  };
  /** Workspace: `false` when the account is deactivated. */
  is_active?: boolean;
  /** Optional custom profile fields when the backend provides them. */
  profile_data?: Record<string, { value?: string; rendered_value?: string }>;
}

/** Optional realm-wide presence response shape when a backend provides one. */
export interface RealmEmoji {
  id: string;
  names: string[];
  imgUrl: string;
}

/** Aggregate reaction counters returned on Workspace messages: emoji_name -> count. */
export type MessageReactions = Record<string, number>;

/** Current-user reaction resource from GET/POST /message_reactions/. */
export interface Reaction {
  uuid: string;
  project_id?: string;
  user_uuid: string;
  message_uuid: MessageId;
  emoji_name: string;
  created_at?: string;
  updated_at?: string;
}

/** Reaction payload used by message-list UI callbacks. */
export interface MessageReactionPayload {
  emojiName: string;
  imageUrl?: string;
}

/** Raw message from gateway message APIs. `read` is authoritative when present. */
export interface WorkspaceRawMessage {
  id: MessageId;
  source_message_uuid?: MessageId;
  sender_id: number;
  /** IAM UUID of the message author from Workspace gateway rows. */
  author_uuid?: string;
  /** Alias used by UI code while legacy numeric sender_id is still present. */
  sender_uuid?: string;
  /** True when the message was authored by the authenticated user. */
  is_own?: boolean;
  read?: boolean;
  pinned?: boolean;
  starred?: boolean;
  sender_full_name?: string;
  /** Sender avatar (relative path), present in GET /messages response. */
  avatar_url?: string | null;
  content: string;
  /** Present when the server returns original markdown alongside rendered content. */
  markdown_source?: string;
  timestamp: number;
  display_recipient?:
    | string
    | { id: UserId; full_name: string; email?: string; avatar_url?: string }[];
  subject?: string;
  topic_uuid?: string;
  type?: string;
  stream_uuid?: string | null;
  source_name?: MessengerSourceName;
  source?: MessengerSource;
  flags?: string[];
  reactions?: MessageReactions;
}

export type ActivityFilter = "starred" | "mentions" | "reactions";

export interface ActivityMessagesPageResult {
  messages: WorkspaceRawMessage[];
  foundOldest: boolean;
}

export interface DirectMessagesPageResult {
  messages: WorkspaceRawMessage[];
  foundOldest: boolean;
}

export interface MockStream {
  /** Workspace stream UUID used as the stream identity and for message reads/writes. */
  stream_uuid: string;
  /** Server-owned default topic UUID, or null when no default is configured. */
  default_topic_uuid?: string | null;
  name: string;
  description: string;
  is_announcement_only: boolean;
  invite_only?: boolean;
  history_public_to_subscribers?: boolean;
  is_web_public?: boolean;
  subscriber_count?: number | null;
  stream_weekly_traffic?: number | null;
  stream_post_policy?: number | null;
  owner?: string | null;
  source_name?: MessengerSourceName;
  source?: MessengerSource;
  date_created?: number | null;
  folder_id?: number | null;
  is_default?: boolean;
  is_recently_active?: boolean;
  message_retention_days?: number | null;
  can_subscribe_group?: MessengerGroupSettingValue;
  can_add_subscribers_group?: MessengerGroupSettingValue;
  can_remove_subscribers_group?: MessengerGroupSettingValue;
  can_administer_channel_group?: MessengerGroupSettingValue;
  can_resolve_topics_group?: MessengerGroupSettingValue;
  can_move_messages_out_of_channel_group?: MessengerGroupSettingValue;
  /** Server-owned stream color as 0xRRGGBB. */
  color?: number;
}

export type MockMessageDeliveryStatus = "sending" | "failed" | "sent";
export type MockMessageEditStatus = "saving" | "failed";

export interface MockMessage {
  id: MessageId;
  source_message_uuid?: MessageId;
  sender_id: number;
  /** IAM UUID of the message author from Workspace gateway rows. */
  author_uuid?: string;
  /** Alias used by UI code while legacy numeric sender_id is still present. */
  sender_uuid?: string;
  /** True when the message was authored by the authenticated user. */
  is_own?: boolean;
  read?: boolean;
  pinned?: boolean;
  starred?: boolean;
  sender_full_name: string;
  stream_uuid: string | null;
  display_recipient?:
    | string
    | { id: UserId; full_name: string; email?: string; avatar_url?: string }[];
  channel?: string;
  subject: string;
  topic_uuid?: string;
  source_name?: MessengerSourceName;
  source?: MessengerSource;
  /**
   * Message body: Workspace-flavored Markdown from native rows, or rendered HTML from some
   * real-time payloads / cache entries.
   */
  content: string;
  /**
   * Markdown source for editing and reply quotes; mirrors `content` when the body is Markdown.
   */
  markdown_source?: string;
  timestamp: number;
  /** Event/cache flags (e.g. 'read', 'mentioned') projected from gateway booleans where needed. */
  flags?: string[];
  reactions?: MessageReactions;
  /** Local delivery state for optimistic outgoing messages. */
  delivery_status?: MockMessageDeliveryStatus;
  /** Local state for optimistic edits of existing server messages. */
  edit_status?: MockMessageEditStatus;
  /** Markdown submitted for an optimistic edit; used for retry after failure. */
  pending_edit_markdown?: string;
  /** Message body before the optimistic edit; used to cancel a failed edit. */
  previous_content?: string;
  /** Markdown source before the optimistic edit; used to cancel a failed edit. */
  previous_markdown_source?: string;
  /** Last server/client error for an optimistic edit. */
  edit_error?: string;
  /**
   * Stable client key for list reconciliation while optimistic.
   * Preserved after the server assigns the final message id.
   */
  local_echo_key?: MessageId;
  /** Client-side link preview card data from rendered message embed metadata. */
  link_preview?: LinkPreviewData;
  /** Multiple link preview cards (one per URL in message). */
  link_previews?: LinkPreviewData[];
}

/** Input shape for normalizing API messages to MockMessage. */
export interface RawMessageToMockInput {
  id: MessageId;
  source_message_uuid?: MessageId;
  sender_id: number;
  author_uuid?: string;
  sender_uuid?: string;
  is_own?: boolean;
  read?: boolean;
  pinned?: boolean;
  starred?: boolean;
  sender_full_name?: string;
  content: string;
  /** When set, stored as MockMessage.markdown_source. */
  markdown_source?: string;
  timestamp: number;
  display_recipient?: WorkspaceRawMessage["display_recipient"];
  subject?: string;
  topic_uuid?: string;
  type?: string;
  stream_uuid?: string | null;
  source_name?: MessengerSourceName;
  source?: MessengerSource;
  flags?: string[];
  reactions?: MessageReactions;
}

export interface MessengerSubscription {
  /** Workspace stream UUID used as the stream identity. */
  stream_uuid: string;
  /** Server-owned default topic UUID, or null when no default is configured. */
  default_topic_uuid?: string | null;
  name: string;
  notification_mode: WorkspaceStreamNotificationMode;
  is_archived?: boolean;
  owner?: string;
  source_name?: MessengerSourceName;
  source?: MessengerSource;
  invite_only?: boolean;
  private?: boolean;
  can_add_subscribers_group?: MessengerGroupSettingValue;
  can_remove_subscribers_group?: MessengerGroupSettingValue;
  can_administer_channel_group?: MessengerGroupSettingValue;
  can_resolve_topics_group?: MessengerGroupSettingValue;
  can_move_messages_out_of_channel_group?: MessengerGroupSettingValue;
  /** Server-owned stream color as 0xRRGGBB. */
  color?: number;
  unread_count?: number;
}

export interface MessagesPageResult {
  messages: MockMessage[];
  foundOldest: boolean;
  /** True when the current page reached the newest available row. */
  foundNewest: boolean;
}

export interface SendMessageParams {
  /** Client-generated Workspace message UUID sent to `/api/messenger/v1/messages/`. */
  messageUuid?: MessageId;
  /** Display stream name for the local echo. */
  stream?: string;
  /** Workspace stream UUID for gateway message creation. */
  streamUuid: string;
  /** Workspace topic UUID for stream-topic messages. */
  topicUuid?: string;
  subject?: string;
  content: string;
  author_id?: UserId;
  sender_id?: number;
  sender_full_name?: string;
}

export interface CreateSavedSnippetParams {
  title: string;
  content: string;
}
