/**
 * Inbox entry types — metadata-backed unread grouping.
 *
 * Stream messages group by (streamUuid + topic).
 * Each entry tracks server unread_count and latest metadata timestamp for sorting.
 */
import type { MessageId } from "~/shared/lib/message-id.lib";

export interface InboxEntry {
  /** Unique key for this inbox row: "stream:{streamUuid}:{topic}" or "dm:{dmSlug}". */
  key: string;
  /** Stream UUID (present for stream messages, null for DMs). */
  streamId: string | null;
  /** Stream/channel name (present for stream messages). */
  streamName: string | null;
  /** Topic name for topic rows; null for stream-level fallback rows. */
  topic: string | null;
  /** Server topic UUID for topic rows; routes and identity must prefer this over the display name. */
  topicUuid?: string;
  /** Server-owned topic done state. The checkmark is visual only. */
  isDone?: boolean;
  /** Direct-chat partner user ID when the DM is 1:1; null for stream/group-DM entries. */
  senderId: number | null;
  /** Conversation label for the unread DM bucket. */
  senderName: string | null;
  /** Route slug for DM navigation (e.g. "42" or "42,99"). */
  dmSlug: string | null;
  /** Number of unread messages in this group. */
  unreadCount: number;
  /** Server-owned parent stream unread count; never derived from topic rows. */
  streamUnreadCount?: number;
  /** Unix timestamp of the most recent unread message. */
  lastMessageTimestamp: number;
  /** Optional focus ids only; unread counts are not derived from this list. */
  messageIds: MessageId[];
}

export type InboxGroupType = "stream" | "dm";

/** Target for removing inbox rows after sidebar/context mark-as-read. */
export type InboxMarkReadTarget =
  | { type: "dm"; userIds: number[] }
  | { type: "stream"; streamId: string }
  | { type: "topic"; streamId: string; topic: string };
