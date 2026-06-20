/**
 * Parses Zulip unread payloads (legacy `unread_msgs` or GET /messages?narrow=is:unread)
 * into total counts and sidebar reconciliation snapshots.
 */
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  isPositiveInteger,
  isRecord,
  isStreamZulipMessage,
  isUnreadZulipMessage,
  parseDmParticipantIds,
  parseHuddleUnreadBuckets,
  parsePmUnreadBuckets,
  parseStreamUnreadBuckets,
  parseUnreadMessageIds,
} from "./zulip-unread-buckets.lib";

function toSafeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function resolveUnreadMsgsTotalCount(
  unreadMsgs: Record<string, unknown>,
  streamsRaw: unknown[],
  pmsRaw: unknown[],
  huddlesRaw: unknown[],
): number {
  const directCount = toSafeCount(unreadMsgs.count);
  if (directCount > 0) return directCount;
  return (
    sumUnreadMessageIds(streamsRaw) +
    sumUnreadMessageIds(pmsRaw) +
    sumUnreadMessageIds(huddlesRaw) +
    sumUnreadMessageIds(unreadMsgs.mentions)
  );
}

function sumUnreadMessageIds(entries: unknown): number {
  if (!Array.isArray(entries)) {
    return 0;
  }
  return entries.reduce((sum, entry) => {
    if (!isRecord(entry)) return sum;
    return sum + parseUnreadMessageIds(entry.unread_message_ids).length;
  }, 0);
}

export interface ZulipUnreadStreamBucket {
  streamId: number;
  topic: string;
  unreadMessageIds: number[];
}

export interface ZulipUnreadDmBucket {
  userIds: number[];
  unreadMessageIds: number[];
  /** True for huddles / group DMs (excluded from personal DM badge counts). */
  isGroup?: boolean;
}

export interface ZulipUnreadMessagesSnapshot {
  streams: ZulipUnreadStreamBucket[];
  dms: ZulipUnreadDmBucket[];
  totalCount: number;
  /** Unread @mention message ids from register `unread_msgs.mentions` buckets. */
  mentionMessageIds: number[];
  /** Zulip `old_unreads_missing` — snapshot truncated; caller should fall back to GET /messages. */
  oldUnreadsMissing?: boolean;
}

/** Parses `unread_msgs` from POST /register when `message` + `update_message_flags` are subscribed. */
export function parseRegisterUnreadSnapshot(registerData: {
  unread_msgs?: unknown;
}): ZulipUnreadMessagesSnapshot | null {
  if (registerData.unread_msgs == null) {
    return null;
  }
  const snapshot = parseUnreadMessagesSnapshot({ unread_msgs: registerData.unread_msgs });
  if (snapshot == null) {
    return null;
  }
  const unreadMsgs = registerData.unread_msgs;
  if (!isRecord(unreadMsgs) || unreadMsgs.old_unreads_missing !== true) {
    return snapshot;
  }
  return { ...snapshot, oldUnreadsMissing: true };
}

function parseUnreadMessagesSnapshotFromUnreadMsgs(
  payload: unknown,
): ZulipUnreadMessagesSnapshot | null {
  if (!isRecord(payload)) {
    return null;
  }
  const unreadMsgs = payload.unread_msgs;
  if (!isRecord(unreadMsgs)) {
    return null;
  }

  const streamsRaw = unreadMsgs.streams;
  const pmsRaw = unreadMsgs.pms;
  const huddlesRaw = unreadMsgs.huddles;

  if (!Array.isArray(streamsRaw) || !Array.isArray(pmsRaw) || !Array.isArray(huddlesRaw)) {
    return null;
  }

  const streams = parseStreamUnreadBuckets(streamsRaw);
  const dms = [...parsePmUnreadBuckets(pmsRaw), ...parseHuddleUnreadBuckets(huddlesRaw)];
  const mentionMessageIds = parseMentionUnreadMessageIds(unreadMsgs.mentions);

  // Prefer server-provided count; otherwise sum unread id array lengths.
  const totalCount = resolveUnreadMsgsTotalCount(unreadMsgs, streamsRaw, pmsRaw, huddlesRaw);

  return { streams, dms, totalCount, mentionMessageIds };
}

function parseMentionUnreadMessageIds(mentionsRaw: unknown): number[] {
  if (!Array.isArray(mentionsRaw)) {
    return [];
  }
  const ids: number[] = [];
  for (const entry of mentionsRaw) {
    if (!isRecord(entry)) continue;
    ids.push(...parseUnreadMessageIds(entry.unread_message_ids));
  }
  return ids;
}

export function countMentionsUnreadFromSnapshot(snapshot: ZulipUnreadMessagesSnapshot): number {
  return snapshot.mentionMessageIds.length;
}

function accumulateUnreadStreamMessage(
  streamBuckets: Map<string, ZulipUnreadStreamBucket>,
  rawMessage: Record<string, unknown>,
  messageId: number,
): void {
  const streamId = rawMessage.stream_id;
  if (!isPositiveInteger(streamId)) return;
  const topicRaw = typeof rawMessage.subject === "string" ? rawMessage.subject : "";
  const topic = normalizeTopicForIdentity(topicRaw);
  const key = `${streamId}\t${topic}`;
  const existing = streamBuckets.get(key);
  if (existing) {
    existing.unreadMessageIds.push(messageId);
    return;
  }
  streamBuckets.set(key, { streamId, topic, unreadMessageIds: [messageId] });
}

function ingestUnreadMessageFromPayload(
  rawMessage: unknown,
  streamBuckets: Map<string, ZulipUnreadStreamBucket>,
  dmBuckets: Map<string, ZulipUnreadDmBucket>,
  unreadMessageIds: Set<number>,
): void {
  if (!isRecord(rawMessage)) return;
  if (!isUnreadZulipMessage(rawMessage)) return;
  const messageId = rawMessage.id;
  if (!isPositiveInteger(messageId)) return;

  unreadMessageIds.add(messageId);

  if (isStreamZulipMessage(rawMessage)) {
    accumulateUnreadStreamMessage(streamBuckets, rawMessage, messageId);
    return;
  }

  accumulateUnreadDmMessage(dmBuckets, rawMessage, messageId);
}

function accumulateUnreadDmMessage(
  dmBuckets: Map<string, ZulipUnreadDmBucket>,
  rawMessage: Record<string, unknown>,
  messageId: number,
): void {
  const participantIds = parseDmParticipantIds(rawMessage);
  if (participantIds.length === 0) return;
  const key = participantIds.join(",");
  const existing = dmBuckets.get(key);
  if (existing) {
    existing.unreadMessageIds.push(messageId);
    return;
  }
  dmBuckets.set(key, {
    userIds: participantIds,
    unreadMessageIds: [messageId],
    isGroup: participantIds.length > 2,
  });
}

function parseUnreadMessagesSnapshotFromMessages(
  payload: unknown,
): ZulipUnreadMessagesSnapshot | null {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) {
    return null;
  }

  const streamBuckets = new Map<string, ZulipUnreadStreamBucket>();
  const dmBuckets = new Map<string, ZulipUnreadDmBucket>();
  const unreadMessageIds = new Set<number>();

  for (const rawMessage of payload.messages) {
    ingestUnreadMessageFromPayload(rawMessage, streamBuckets, dmBuckets, unreadMessageIds);
  }

  return {
    streams: Array.from(streamBuckets.values()),
    dms: Array.from(dmBuckets.values()),
    totalCount: unreadMessageIds.size,
    mentionMessageIds: [],
  };
}

const UNREAD_SNAPSHOT_PARSERS: readonly ((
  payload: unknown,
) => ZulipUnreadMessagesSnapshot | null)[] = [
  parseUnreadMessagesSnapshotFromUnreadMsgs,
  parseUnreadMessagesSnapshotFromMessages,
];

/** Tries legacy `unread_msgs` first, then GET /messages payload. */
export function parseUnreadMessagesSnapshot(payload: unknown): ZulipUnreadMessagesSnapshot | null {
  for (const parse of UNREAD_SNAPSHOT_PARSERS) {
    const snapshot = parse(payload);
    if (snapshot != null) return snapshot;
  }
  return null;
}

const UNREAD_DM_SNAPSHOT_PARSERS: readonly ((
  payload: unknown,
) => ZulipUnreadMessagesSnapshot | null)[] = [
  parseUnreadMessagesSnapshotFromMessages,
  parseUnreadMessagesSnapshotFromUnreadMsgs,
];

/** DM badge polling uses GET /messages — prefer `messages` over stale `unread_msgs` on combined payloads. */
function parseUnreadDmMessagesSnapshot(payload: unknown): ZulipUnreadMessagesSnapshot | null {
  for (const parse of UNREAD_DM_SNAPSHOT_PARSERS) {
    const snapshot = parse(payload);
    if (snapshot != null) return snapshot;
  }
  return null;
}

/** Personal 1:1 for inactive-instance badge polling (stricter than sidebar row reconciliation). */
function isPersonalDmBucketForBadge(dm: ZulipUnreadDmBucket): boolean {
  if (dm.isGroup === true) return false;
  // Legacy `unread_msgs.pms` buckets only include the other party's user id.
  if (dm.userIds.length === 1) return true;
  // `/messages` buckets list every participant — only two-user conversations are 1:1.
  return dm.userIds.length === 2;
}

/** Personal 1:1 DM unread count from register `unread_msgs` buckets (not global `count`). */
export function countPersonalDmUnreadFromSnapshot(snapshot: ZulipUnreadMessagesSnapshot): number {
  let total = 0;
  for (const dm of snapshot.dms) {
    if (!isPersonalDmBucketForBadge(dm)) continue;
    total += dm.unreadMessageIds.length;
  }
  return total;
}

export function parseUnreadMessagesCount(payload: unknown): number | null {
  const snapshot = parseUnreadMessagesSnapshot(payload);
  if (snapshot == null) {
    return null;
  }
  return snapshot.totalCount;
}

/**
 * Personal DM unread flag for inactive-instance polling (0 or 1).
 * Uses conversation-level presence in personal DM buckets, not global `unread_msgs.count`.
 */
export function parseUnreadDmMessagesCount(payload: unknown): number | null {
  const snapshot = parseUnreadDmMessagesSnapshot(payload);
  if (snapshot == null) {
    return null;
  }
  const hasPersonalDm = countPersonalDmUnreadFromSnapshot(snapshot) > 0;
  const hasMentions = countMentionsUnreadFromSnapshot(snapshot) > 0;
  return hasPersonalDm || hasMentions ? 1 : 0;
}
