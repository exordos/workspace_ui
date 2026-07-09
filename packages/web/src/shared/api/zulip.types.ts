/**
 * Public TypeScript contracts for the Zulip API client (`zulip-*.ts` modules).
 */

export interface ZulipUserTopic {
  stream_id: number;
  topic_name: string;
  visibility_policy: number;
}

export interface ZulipGroupSettingValueObject {
  direct_members: number[];
  direct_subgroups: number[];
}

/** Zulip group-setting value: single group id or `{ direct_members, direct_subgroups }`. */
export type ZulipGroupSettingValue = number | ZulipGroupSettingValueObject;

export interface ZulipRealmUserGroup {
  id: number;
  name: string;
  members: number[];
  direct_subgroup_ids: number[];
  is_system_group?: boolean;
}

export interface ZulipEvent {
  id: number;
  type: string;
  [key: string]: unknown;
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
  /** Zulip realm role code (100=owner, 200=admin, 300=moderator, 400=member, 600=guest). */
  role?: number;
}

/** Map of user_id to relative avatar_url path. */
export type AvatarUrlByUserId = Map<number, string>;

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

export interface MockStream {
  stream_id: number;
  name: string;
  description: string;
  is_announcement_only: boolean;
  invite_only?: boolean;
  history_public_to_subscribers?: boolean;
  is_web_public?: boolean;
  subscriber_count?: number | null;
  stream_weekly_traffic?: number | null;
  stream_post_policy?: number | null;
  creator_id?: number | null;
  date_created?: number | null;
  folder_id?: number | null;
  is_default?: boolean;
  is_recently_active?: boolean;
  message_retention_days?: number | null;
  can_subscribe_group?: ZulipGroupSettingValue;
  can_add_subscribers_group?: ZulipGroupSettingValue;
  can_remove_subscribers_group?: ZulipGroupSettingValue;
  can_administer_channel_group?: ZulipGroupSettingValue;
  can_resolve_topics_group?: ZulipGroupSettingValue;
  can_move_messages_out_of_channel_group?: ZulipGroupSettingValue;
}

export interface ZulipSubscription {
  stream_id: number;
  name: string;
  is_muted: boolean;
  /** Per-channel override; null/undefined inherits global stream notification settings. */
  desktop_notifications?: boolean | null;
  audible_notifications?: boolean | null;
  is_archived?: boolean;
  creator_id?: number;
  invite_only?: boolean;
  can_add_subscribers_group?: ZulipGroupSettingValue;
  can_remove_subscribers_group?: ZulipGroupSettingValue;
  can_administer_channel_group?: ZulipGroupSettingValue;
  can_resolve_topics_group?: ZulipGroupSettingValue;
  can_move_messages_out_of_channel_group?: ZulipGroupSettingValue;
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
