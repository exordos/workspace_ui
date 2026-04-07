/**
 * Inbox entry types — unified unread message grouping.
 *
 * Stream messages group by (streamId + topic).
 * DM messages group by conversation route slug.
 * Each entry tracks the unread count and latest message timestamp
 * for sorting and display in the inbox view.
 */

export interface InboxEntry {
  /** Unique key for this inbox row: "stream:{streamId}:{topic}" or "dm:{dmSlug}". */
  key: string;
  /** Stream ID (present for stream messages, null for DMs). */
  streamId: number | null;
  /** Stream/channel name (present for stream messages). */
  streamName: string | null;
  /** Topic name (present for stream messages). */
  topic: string | null;
  /** Direct-chat partner user ID when the DM is 1:1; null for stream/group-DM entries. */
  senderId: number | null;
  /** Conversation label for the unread DM bucket. */
  senderName: string | null;
  /** Route slug for DM navigation (e.g. "42" or "42,99"). */
  dmSlug: string | null;
  /** Number of unread messages in this group. */
  unreadCount: number;
  /** Unix timestamp of the most recent unread message. */
  lastMessageTimestamp: number;
  /** Message IDs belonging to this group (for batch mark-as-read). */
  messageIds: number[];
}

export type InboxGroupType = "stream" | "dm";
