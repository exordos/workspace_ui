import type { MockMessage } from "~/shared/api/zulip";
import type { InboxEntry } from "./inbox.types";

export interface GroupedInboxStream {
  streamId: number;
  streamName: string;
  unreadCount: number;
  lastMessageTimestamp: number;
  topics: InboxEntry[];
}

export interface GroupedInboxEntries {
  dms: InboxEntry[];
  streams: GroupedInboxStream[];
}

interface DmConversationMeta {
  dmSlug: string;
  senderId: number | null;
  senderName: string;
}

function resolveDmConversationMeta(
  message: Pick<MockMessage, "display_recipient" | "sender_id" | "sender_full_name">,
  currentUserId: number | null,
): DmConversationMeta {
  if (!Array.isArray(message.display_recipient) || currentUserId == null) {
    return {
      dmSlug: String(message.sender_id),
      senderId: message.sender_id,
      senderName: message.sender_full_name || String(message.sender_id),
    };
  }

  const recipients = [...message.display_recipient].sort((a, b) => a.id - b.id);
  const otherRecipients = recipients.filter((recipient) => recipient.id !== currentUserId);
  const routeRecipients = otherRecipients.length > 0 ? otherRecipients : recipients;

  const dmSlug = routeRecipients.map((recipient) => String(recipient.id)).join(",");
  const senderName = routeRecipients
    .map((recipient) => recipient.full_name || String(recipient.id))
    .join(", ");
  const senderId = routeRecipients.length === 1 ? routeRecipients[0]!.id : null;

  return {
    dmSlug,
    senderId,
    senderName,
  };
}

export function buildInboxEntries(
  messages: MockMessage[],
  currentUserId: number | null = null,
): InboxEntry[] {
  const entryMap = new Map<string, InboxEntry>();

  for (const msg of messages) {
    const isStream = msg.stream_id != null && msg.stream_id > 0;
    const topic = (msg.subject ?? "").trim();

    if (isStream) {
      const key = `stream:${msg.stream_id}:${topic}`;
      const existing = entryMap.get(key);
      if (existing) {
        existing.unreadCount += 1;
        existing.messageIds.push(msg.id);
        if (msg.timestamp > existing.lastMessageTimestamp) {
          existing.lastMessageTimestamp = msg.timestamp;
        }
        continue;
      }

      entryMap.set(key, {
        key,
        streamId: msg.stream_id,
        streamName: msg.channel ?? null,
        topic,
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 1,
        lastMessageTimestamp: msg.timestamp,
        messageIds: [msg.id],
      });
      continue;
    }

    const dmMeta = resolveDmConversationMeta(msg, currentUserId);
    const key = `dm:${dmMeta.dmSlug}`;
    const existing = entryMap.get(key);
    if (existing) {
      existing.unreadCount += 1;
      existing.messageIds.push(msg.id);
      if (msg.timestamp > existing.lastMessageTimestamp) {
        existing.lastMessageTimestamp = msg.timestamp;
      }
      continue;
    }

    entryMap.set(key, {
      key,
      streamId: null,
      streamName: null,
      topic: null,
      senderId: dmMeta.senderId,
      senderName: dmMeta.senderName,
      dmSlug: dmMeta.dmSlug,
      unreadCount: 1,
      lastMessageTimestamp: msg.timestamp,
      messageIds: [msg.id],
    });
  }

  return Array.from(entryMap.values()).sort(
    (a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp,
  );
}

export function groupInboxEntries(entries: InboxEntry[]): GroupedInboxEntries {
  const dms = entries
    .filter((entry) => entry.streamId == null)
    .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);

  const streamsMap = new Map<number, GroupedInboxStream>();

  for (const entry of entries) {
    if (entry.streamId == null || entry.streamName == null) continue;

    const existing = streamsMap.get(entry.streamId);
    if (existing) {
      existing.topics.push(entry);
      existing.unreadCount += entry.unreadCount;
      if (entry.lastMessageTimestamp > existing.lastMessageTimestamp) {
        existing.lastMessageTimestamp = entry.lastMessageTimestamp;
      }
    } else {
      streamsMap.set(entry.streamId, {
        streamId: entry.streamId,
        streamName: entry.streamName,
        unreadCount: entry.unreadCount,
        lastMessageTimestamp: entry.lastMessageTimestamp,
        topics: [entry],
      });
    }
  }

  const streams = Array.from(streamsMap.values())
    .map((group) => ({
      ...group,
      topics: [...group.topics].sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp),
    }))
    .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);

  return { dms, streams };
}
