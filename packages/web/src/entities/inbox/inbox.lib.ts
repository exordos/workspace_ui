/**
 * Inbox aggregation — builds entries from stream/topic unread metadata and groups them for display.
 */

import { dmRouteKey } from "~/shared/lib/dm-key";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import type { InboxEntry, InboxMarkReadTarget } from "./inbox.types";

export interface GroupedInboxStream {
  streamId: string;
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

function getInboxEntriesLastIdFingerprint(entries: readonly InboxEntry[]): string {
  let maxId = "";
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
 * Compares max `lastMessageTimestamp`, then UUID fingerprint as tie-breaker,
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

  const candidateIdFingerprint = getInboxEntriesLastIdFingerprint(candidate);
  const currentIdFingerprint = getInboxEntriesLastIdFingerprint(current);
  return candidateIdFingerprint > currentIdFingerprint;
}

export interface InboxMuteFilterOptions {
  isStreamMuted?: (streamId: string) => boolean;
  isEffectivelyMuted?: (streamId: string, topic: string) => boolean;
}

function shouldOmitStreamInboxTopic(
  streamId: string,
  topic: string,
  options: InboxMuteFilterOptions,
): boolean {
  if (options.isStreamMuted?.(streamId)) return true;
  return options.isEffectivelyMuted?.(streamId, topic) ?? false;
}

function toUnreadCount(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function streamLevelInboxEntry(stream: StreamEntryInternal, unreadCount: number): InboxEntry {
  return {
    key: `stream:${stream.streamUuid}:__all__`,
    streamId: stream.streamUuid,
    streamName: stream.name,
    topic: null,
    senderId: null,
    senderName: null,
    dmSlug: null,
    unreadCount,
    streamUnreadCount: unreadCount,
    lastMessageTimestamp: stream.ts,
    messageIds: [],
  };
}

export function buildInboxEntriesFromStreamMetadata(
  streamsMap: ReadonlyMap<string, StreamEntryInternal>,
  options: InboxMuteFilterOptions = {},
): InboxEntry[] {
  const entries: InboxEntry[] = [];

  for (const stream of streamsMap.values()) {
    if (options.isStreamMuted?.(stream.streamUuid)) {
      continue;
    }

    const streamUnreadCount = toUnreadCount(stream.unreadCount);
    let hasUnreadTopicMetadata = false;
    for (const topic of stream.topics.values()) {
      const unreadCount = toUnreadCount(topic.unreadCount);
      if (unreadCount <= 0) {
        continue;
      }
      hasUnreadTopicMetadata = true;
      if (shouldOmitStreamInboxTopic(stream.streamUuid, topic.subject, options)) {
        continue;
      }

      entries.push({
        key: `stream:${stream.streamUuid}:${topic.topicUuid ?? topic.subject}`,
        streamId: stream.streamUuid,
        streamName: stream.name,
        topic: topic.subject,
        ...(topic.topicUuid != null ? { topicUuid: topic.topicUuid } : {}),
        ...(topic.isDone === true ? { isDone: true } : {}),
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount,
        streamUnreadCount,
        lastMessageTimestamp: topic.ts || stream.ts,
        messageIds: [],
      });
    }

    if (!hasUnreadTopicMetadata && streamUnreadCount > 0) {
      entries.push(streamLevelInboxEntry(stream, streamUnreadCount));
    }
  }

  return entries.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
}

function getServerStreamUnreadCount(entry: InboxEntry): number {
  return entry.streamUnreadCount ?? entry.unreadCount;
}

export function groupInboxEntries(entries: InboxEntry[]): GroupedInboxEntries {
  const dms = entries
    .filter((entry) => entry.streamId == null)
    .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);

  const streamsMap = new Map<string, GroupedInboxStream>();

  for (const entry of entries) {
    if (entry.streamId == null || entry.streamName == null) continue;

    const existing = streamsMap.get(entry.streamId);
    if (existing) {
      existing.topics.push(entry);
      if (entry.streamUnreadCount != null) {
        existing.unreadCount = entry.streamUnreadCount;
      }
      if (entry.lastMessageTimestamp > existing.lastMessageTimestamp) {
        existing.lastMessageTimestamp = entry.lastMessageTimestamp;
      }
    } else {
      streamsMap.set(entry.streamId, {
        streamId: entry.streamId,
        streamName: entry.streamName,
        unreadCount: getServerStreamUnreadCount(entry),
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
  if (target.topicUuid != null && entry.topicUuid != null) {
    return entry.topicUuid.trim().toLowerCase() === target.topicUuid.trim().toLowerCase();
  }
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
