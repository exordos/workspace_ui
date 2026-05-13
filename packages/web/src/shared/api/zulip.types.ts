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
  /** Canonical organization URL (Zulip 9+: prefer {@link realm_url}). */
  realm_uri: string;
  /** Canonical organization URL (Zulip 9+). Alias of realm_uri in older docs. */
  realm_url: string;
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

export interface ZulipRecentPrivateConversation {
  // Что делает: список участников DM (включая текущего пользователя).
  user_ids: number[];
  // Что делает: id последнего сообщения в этом DM, если сервер его знает.
  max_message_id: number | null;
  // Что делает: список непрочитанных сообщений в DM для быстрого unread-индикатора.
  unread_message_ids: number[];
}

export interface ZulipGroupSettingValueObject {
  // Что делает: явные пользователи, которым выдано право.
  direct_members: number[];
  // Что делает: подгруппы, чьи участники наследуют право.
  direct_subgroups: number[];
}

// Что делает: универсальный формат group-setting значения Zulip.
// Может быть ссылкой на одну группу (id) или объектом с direct members/subgroups.
export type ZulipGroupSettingValue = number | ZulipGroupSettingValueObject;

export interface ZulipRealmUserGroup {
  // Уникальный id группы в организации.
  id: number;
  // Отображаемое имя группы.
  name: string;
  // Прямые участники группы.
  members: number[];
  // Вложенные подгруппы (наследуемое членство).
  direct_subgroup_ids: number[];
  // Признак системной группы Zulip.
  is_system_group?: boolean;
}

export interface SavedSnippet {
  id: number;
  title: string;
  content: string;
  date_created: number;
}

/** One server-supported user-upload thumbnail variant (Zulip 9.0+; see `server_thumbnail_formats` in register). */
export interface ZulipServerThumbnailFormat {
  name: string;
  max_width: number;
  max_height: number;
  format: string;
  animated: boolean;
}

/** Avatar-related capabilities from register `realm` metadata. */
export interface ZulipOwnAvatarCapabilities {
  max_avatar_file_size_mib?: number;
  realm_avatar_changes_disabled?: boolean;
  server_avatar_changes_disabled?: boolean;
}

export interface RegisterQueueResult {
  queue_id: string;
  last_event_id: number;
  event_queue_longpoll_timeout_seconds?: number;
  subscriptions?: ZulipSubscription[];
  user_topics?: ZulipUserTopic[];
  // Зачем: metadata recent DM для первичного построения списка диалогов.
  recent_private_conversations?: Record<string, ZulipRecentPrivateConversation>;
  // Все группы организации из register metadata.
  // Используется для расчета channel-level прав через group-setting поля канала.
  realm_user_groups?: ZulipRealmUserGroup[];
  /** Present when `realm` is included in `fetch_event_types` (modern Zulip 10+). */
  realm_can_add_subscribers_group?: ZulipGroupSettingValue;
  /** Present when `realm` is included in `fetch_event_types` (Zulip 9.0+). */
  server_thumbnail_formats?: ZulipServerThumbnailFormat[];
  /** Present when `realm` is included in `fetch_event_types`. */
  max_avatar_file_size_mib?: number;
  /** Present when `realm` is included in `fetch_event_types`. */
  realm_avatar_changes_disabled?: boolean;
  /** Present when `realm` is included in `fetch_event_types`. */
  server_avatar_changes_disabled?: boolean;
  /**
   * Effective Jitsi Meet base URL from register (`jitsi_server_url` or realm/server fields).
   * Canonical origin without trailing slash.
   */
  jitsi_server_url_effective?: string;
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
  /** Seconds until the client may retry (Zulip rate limit JSON). */
  "retry-after"?: number;
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

/** Normalized custom emoji entry from GET /realm/emoji for emoji-picker-react. */
export interface RealmEmoji {
  id: string;
  names: string[];
  imgUrl: string;
}

/** A single reaction on a message (Zulip API shape). */
export interface Reaction {
  emoji_name: string;
  emoji_code: string;
  reaction_type: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";
  user_id: number;
}

export type ReactionType = Reaction["reaction_type"];

/** Reaction payload used by message-list UI callbacks. */
export interface MessageReactionPayload {
  emojiName: string;
  reactionType: ReactionType;
  emojiCode?: string;
  imageUrl?: string;
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
export interface RawMessageToMockInput {
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
}

export interface ZulipSubscription {
  stream_id: number;
  name: string;
  is_muted: boolean;
  // Что делает: признак архивированного канала в Zulip.
  is_archived?: boolean;
  // Что делает: id пользователя, создавшего канал (если сервер его хранит).
  creator_id?: number;
  // Что делает: приватность канала (true = private stream).
  invite_only?: boolean;
  // Что делает: group-setting, определяющий кто может добавлять подписчиков.
  can_add_subscribers_group?: ZulipGroupSettingValue;
  // Что делает: group-setting, определяющий кто может удалять (отписывать) подписчиков.
  can_remove_subscribers_group?: ZulipGroupSettingValue;
  // Что делает: group-setting администраторов конкретного канала.
  can_administer_channel_group?: ZulipGroupSettingValue;
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
