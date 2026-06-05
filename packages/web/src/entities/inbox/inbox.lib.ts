/**
 * Inbox aggregation — group unread messages into entries, section grouping, and snapshot freshness checks.
 */

import type { MockMessage } from "~/shared/api/zulip.types";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { InboxEntry, InboxMarkReadTarget } from "./inbox.types";

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

function getInboxEntriesNewestTimestamp(entries: readonly InboxEntry[]): number {
  if (entries.length === 0) return 0;
  let newest = entries[0]?.lastMessageTimestamp ?? 0;
  for (const entry of entries) {
    if (entry.lastMessageTimestamp > newest) {
      newest = entry.lastMessageTimestamp;
    }
  }
  return newest;
}

function getInboxEntriesMaxMessageId(entries: readonly InboxEntry[]): number {
  let maxId = 0;
  for (const entry of entries) {
    for (const id of entry.messageIds) {
      if (id > maxId) {
        maxId = id;
      }
    }
  }
  return maxId;
}

/**
 * Returns true when `candidate` is objectively fresher than `current`.
 * Compares max `lastMessageTimestamp`, then max message id as tie-breaker,
 * so re-entering Inbox does not regress to an older cache snapshot.
 */
export function isInboxEntriesSnapshotFresher(
  candidate: readonly InboxEntry[],
  current: readonly InboxEntry[],
): boolean {
  if (candidate.length === 0) return false;
  if (current.length === 0) return true;

  const candidateNewestTimestamp = getInboxEntriesNewestTimestamp(candidate);
  const currentNewestTimestamp = getInboxEntriesNewestTimestamp(current);
  if (candidateNewestTimestamp !== currentNewestTimestamp) {
    return candidateNewestTimestamp > currentNewestTimestamp;
  }

  const candidateMaxMessageId = getInboxEntriesMaxMessageId(candidate);
  const currentMaxMessageId = getInboxEntriesMaxMessageId(current);
  return candidateMaxMessageId > currentMaxMessageId;
}

interface DmConversationMeta {
  dmSlug: string;
  senderId: number | null;
  senderName: string;
}

export interface InboxMuteFilterOptions {
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}

function shouldOmitStreamInboxMessage(
  streamId: number,
  topic: string,
  options: InboxMuteFilterOptions,
): boolean {
  if (options.isStreamMuted?.(streamId)) return true;
  return options.isEffectivelyMuted?.(streamId, topic) ?? false;
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

function updateExistingInboxEntry(existing: InboxEntry, msg: MockMessage): void {
  existing.unreadCount += 1;
  existing.messageIds.push(msg.id);
  if (msg.timestamp > existing.lastMessageTimestamp) {
    existing.lastMessageTimestamp = msg.timestamp;
  }
}

function addStreamInboxEntry(
  entryMap: Map<string, InboxEntry>,
  msg: MockMessage,
  streamId: number,
  topic: string,
): void {
  const key = `stream:${streamId}:${topic}`;
  const existing = entryMap.get(key);
  if (existing) {
    updateExistingInboxEntry(existing, msg);
    return;
  }

  entryMap.set(key, {
    key,
    streamId,
    streamName: msg.channel ?? null,
    topic,
    senderId: null,
    senderName: null,
    dmSlug: null,
    unreadCount: 1,
    lastMessageTimestamp: msg.timestamp,
    messageIds: [msg.id],
  });
}

function addDmInboxEntry(
  entryMap: Map<string, InboxEntry>,
  msg: MockMessage,
  currentUserId: number | null,
): void {
  const dmMeta = resolveDmConversationMeta(msg, currentUserId);
  const key = `dm:${dmMeta.dmSlug}`;
  const existing = entryMap.get(key);
  if (existing) {
    updateExistingInboxEntry(existing, msg);
    return;
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

export function buildInboxEntries(
  messages: MockMessage[],
  currentUserId: number | null = null,
  options: InboxMuteFilterOptions = {},
): InboxEntry[] {
  const entryMap = new Map<string, InboxEntry>();

  for (const msg of messages) {
    const streamId = msg.stream_id;
    const isStream = streamId != null && streamId > 0;
    const topic = (msg.subject ?? "").trim();

    if (isStream) {
      if (shouldOmitStreamInboxMessage(streamId, topic, options)) continue;
      addStreamInboxEntry(entryMap, msg, streamId, topic);
      continue;
    }

    addDmInboxEntry(entryMap, msg, currentUserId);
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

function inboxEntryMatchesMarkReadTarget(
  entry: InboxEntry,
  target: InboxMarkReadTarget,
  currentUserId: number | null,
): boolean {
  if (target.type === "dm") {
    if (entry.streamId != null || entry.dmSlug == null) return false;
    const entryUserIds = entry.dmSlug.split(",").map((id) => Number(id));
    const entryKey = dmRouteKey(entryUserIds, currentUserId);
    const targetKey = dmRouteKey(target.userIds, currentUserId);
    return entryKey === targetKey;
  }
  if (target.type === "stream") {
    return entry.streamId === target.streamId;
  }
  if (entry.streamId !== target.streamId || entry.topic == null) return false;
  return normalizeTopicForIdentity(entry.topic) === normalizeTopicForIdentity(target.topic);
}

/** Drops inbox rows covered by a sidebar/context mark-as-read action. */
export function removeInboxEntriesForMarkReadTarget(
  entries: InboxEntry[],
  target: InboxMarkReadTarget,
  currentUserId: number | null,
): InboxEntry[] {
  return entries.filter((entry) => !inboxEntryMatchesMarkReadTarget(entry, target, currentUserId));
}
