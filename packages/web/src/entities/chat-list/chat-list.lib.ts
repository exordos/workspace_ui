/**
 * Chat-list building helpers — pure functions that transform
 * Zulip raw messages into sidebar-ready structures.
 */
import {
  GROUP_DM_ID_OFFSET,
  formatMessageTime,
  getDisplayName,
  getDmPartnerName,
  hashKey,
  slugify,
  truncatePreview,
} from "~/entities/chat-list/chat-list-format.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type {
  SidebarChat,
  StreamWithLast,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";

export { dmConversationKey } from "~/shared/lib/dm-key";

// ---
// Public API
// ---

interface StreamTopicEntry {
  subject: string;
  lastMessage: string;
  lastMessageSenderName?: string;
  time: string;
  ts: number;
  unreadCount: number;
  lastMessageId?: number;
}

export function isUnread(m: ZulipRawMessage): boolean {
  return !m.flags?.includes("read");
}

/** Unread for sidebar/UX: message lacks "read" and is not from the current user. */
export function isUnreadFromOthers(m: ZulipRawMessage, currentUserId: number | null): boolean {
  if (!isUnread(m)) return false;
  if (currentUserId != null && m.sender_id === currentUserId) return false;
  return true;
}

export { isUnreadMentionFromOthers } from "./chat-list-mentions.lib";

export function messageToStreamEntry(m: ZulipRawMessage): {
  stream: Omit<StreamEntryInternal, "topics"> & { topics: Map<string, StreamTopicEntry> };
  topic: StreamTopicEntry;
} | null {
  if (m.type !== "stream" || m.stream_id == null) return null;
  const lastMsg = truncatePreview(m.content);
  const trimmedSenderName = m.sender_full_name?.trim();
  const lastMessageSenderName =
    trimmedSenderName && trimmedSenderName.length > 0 ? trimmedSenderName : undefined;
  const time = formatMessageTime(m.timestamp);
  const name = typeof m.display_recipient === "string" ? m.display_recipient : String(m.stream_id);
  const subject = normalizeTopicForIdentity(m.subject ?? "");
  const topicEntry: StreamTopicEntry = {
    subject,
    lastMessage: lastMsg,
    lastMessageSenderName,
    time,
    ts: m.timestamp,
    unreadCount: isUnread(m) ? 1 : 0,
    lastMessageId: m.id,
  };
  return {
    stream: {
      stream_id: m.stream_id,
      name,
      lastMessage: lastMsg,
      lastMessageSenderName,
      time,
      ts: m.timestamp,
      topics: new Map([[subject, topicEntry]]),
    },
    topic: topicEntry,
  };
}

interface DmRecipientRow {
  id: number;
  full_name: string;
  email: string;
  avatar_url?: string;
}

/** Zulip: two recipients => 1:1 DM; when current user is unknown, infer peer from sender. */
function resolveDmOtherUsers(
  recipients: DmRecipientRow[],
  currentUserId: number | null,
  senderId: number,
): DmRecipientRow[] {
  const isOneToOneDm = recipients.length === 2;
  if (currentUserId != null) {
    return recipients.filter((r) => r.id !== currentUserId);
  }
  if (isOneToOneDm) {
    const peer = recipients.find((r) => r.id !== senderId);
    return peer != null ? [peer] : [recipients[0]!];
  }
  return recipients;
}

function buildDmEntryDisplayName(
  isGroup: boolean,
  otherUsers: DmRecipientRow[],
  getName: (userId: number) => string,
): string {
  if (isGroup) {
    return (
      otherUsers
        .map((u) => getName(u.id) || getDisplayName(u))
        .filter(Boolean)
        .join(", ") || t("dm.groupChat")
    );
  }
  const rawStoreName = otherUsers[0] != null ? getName(otherUsers[0].id) : undefined;
  const fromStore =
    rawStoreName != null && rawStoreName.length > 0 && rawStoreName !== "Unknown"
      ? rawStoreName
      : undefined;
  return (
    fromStore ??
    getDmPartnerName({
      id: otherUsers[0]?.id,
      full_name: otherUsers[0]?.full_name,
      email: otherUsers[0]?.email,
    })
  );
}

function resolveDmEntryIdentity(
  isGroup: boolean,
  recipients: DmRecipientRow[],
  otherUsers: DmRecipientRow[],
  key: string,
  currentUserId: number | null,
  message: ZulipRawMessage,
  getAvatar: (userId: number) => string | undefined,
): { id: number; userIds?: number[]; avatar_url?: string } | null {
  if (isGroup) {
    return {
      id: GROUP_DM_ID_OFFSET + hashKey(key),
      userIds: recipients.map((r) => r.id),
    };
  }
  const other = otherUsers[0];
  const otherUserId =
    other?.id ??
    (currentUserId != null ? recipients.find((r) => r.id !== currentUserId)?.id : undefined);
  if (otherUserId == null) return null;
  const fromMessage =
    message.sender_id === otherUserId && message.avatar_url
      ? String(message.avatar_url).trim()
      : undefined;
  return {
    id: otherUserId,
    avatar_url: getAvatar(otherUserId) ?? fromMessage ?? other?.avatar_url,
  };
}

function buildDmEntrySlug(
  isGroup: boolean,
  id: number,
  name: string,
  otherUsers: DmRecipientRow[],
  getName: (userId: number) => string,
): string {
  if (isGroup) {
    return otherUsers
      .map((u) => `${u.id}-${slugify(getName(u.id) || getDisplayName(u))}`)
      .join(",");
  }
  return `${id}-${slugify(name)}`;
}

export function messageToDmEntry(
  m: ZulipRawMessage,
  currentUserId: number | null,
  avatarUrlByUserId?: Map<number, string>,
): DmEntryInternal | null {
  if (m.type !== "private" || !Array.isArray(m.display_recipient)) return null;
  const usersStore = useUsersStore.getState();
  const recipients: DmRecipientRow[] = m.display_recipient
    .map((r) => ({
      id: r.id,
      full_name: r.full_name ?? "",
      email: r.email ?? "",
      avatar_url: r.avatar_url,
    }))
    .sort((a, b) => a.id - b.id);
  const key = recipients.map((r) => r.id).join(",");
  const otherUsers = resolveDmOtherUsers(recipients, currentUserId, m.sender_id);
  const isGroup = recipients.length !== 2 || otherUsers.length !== 1;
  const getName = (userId: number) => usersStore.getDisplayName(userId);
  const getAvatar = (userId: number) =>
    usersStore.getAvatarUrl(userId) ?? avatarUrlByUserId?.get(userId);
  const name = buildDmEntryDisplayName(isGroup, otherUsers, getName);
  const identity = resolveDmEntryIdentity(
    isGroup,
    recipients,
    otherUsers,
    key,
    currentUserId,
    m,
    getAvatar,
  );
  if (identity == null) return null;
  const slug = buildDmEntrySlug(isGroup, identity.id, name, otherUsers, getName);
  return {
    id: identity.id,
    name,
    slug,
    isGroup,
    lastMessage: truncatePreview(m.content),
    time: formatMessageTime(m.timestamp),
    ts: m.timestamp,
    userIds: identity.userIds,
    unreadCount: isUnread(m) ? 1 : 0,
    avatar_url: identity.avatar_url,
    lastMessageId: m.id,
  };
}

function applyUnreadCountsToSidebarMaps(
  streamsByKey: Map<number, StreamEntryInternal>,
  dmsByKey: Map<string, DmEntryInternal>,
  streamUnread: Map<string, number>,
  dmUnread: Map<string, number>,
): void {
  for (const [streamId, stream] of streamsByKey) {
    let nextTopics: Map<string, StreamTopicEntry> | null = null;
    for (const [topicKey, topic] of stream.topics) {
      const nextUnreadCount = streamUnread.get(`${streamId}\t${topicKey}`) ?? 0;
      if (topic.unreadCount === nextUnreadCount) continue;
      nextTopics ??= new Map(stream.topics);
      nextTopics.set(topicKey, { ...topic, unreadCount: nextUnreadCount });
    }
    if (nextTopics != null) {
      streamsByKey.set(streamId, { ...stream, topics: nextTopics });
    }
  }
  for (const [dmKey, dm] of dmsByKey) {
    const nextUnreadCount = dmUnread.get(dmKey) ?? 0;
    if (dm.unreadCount === nextUnreadCount) continue;
    dmsByKey.set(dmKey, { ...dm, unreadCount: nextUnreadCount });
  }
}

function accumulateSidebarUnreadFromMessage(
  m: ZulipRawMessage,
  currentUserId: number | null,
  streamUnread: Map<string, number>,
  dmUnread: Map<string, number>,
): void {
  if (!isUnreadFromOthers(m, currentUserId)) return;
  if (m.type === "stream" && m.stream_id != null) {
    const subject = normalizeTopicForIdentity(m.subject ?? "");
    const key = `${m.stream_id}\t${subject}`;
    streamUnread.set(key, (streamUnread.get(key) ?? 0) + 1);
    return;
  }
  if (m.type === "private" && Array.isArray(m.display_recipient)) {
    const key = dmConversationKey(m.display_recipient, currentUserId);
    dmUnread.set(key, (dmUnread.get(key) ?? 0) + 1);
  }
}

function upsertStreamFromMessage(
  m: ZulipRawMessage,
  streamsByKey: Map<number, StreamEntryInternal>,
): boolean {
  const streamResult = messageToStreamEntry(m);
  if (!streamResult) return false;
  const { stream_id, name, lastMessage, lastMessageSenderName, time, ts } = streamResult.stream;
  const topicWithMeta: StreamTopicEntry = {
    ...streamResult.topic,
    unreadCount: 0,
    lastMessageId: m.id,
  };
  const existing = streamsByKey.get(stream_id);
  if (!existing) {
    const topics = new Map<string, StreamTopicEntry>([[topicWithMeta.subject, topicWithMeta]]);
    streamsByKey.set(stream_id, {
      stream_id,
      name,
      lastMessage,
      lastMessageSenderName,
      time,
      ts,
      topics,
    });
    return true;
  }
  const existingTopic = existing.topics.get(topicWithMeta.subject);
  const nextTopics = new Map(existing.topics);
  if (!existingTopic || topicWithMeta.ts >= existingTopic.ts) {
    nextTopics.set(topicWithMeta.subject, topicWithMeta);
  }
  const newerStream = m.timestamp >= existing.ts;
  streamsByKey.set(stream_id, {
    stream_id,
    name: existing.name,
    lastMessage: newerStream ? lastMessage : existing.lastMessage,
    lastMessageSenderName: newerStream ? lastMessageSenderName : existing.lastMessageSenderName,
    time: newerStream ? time : existing.time,
    ts: Math.max(existing.ts, m.timestamp),
    topics: nextTopics,
  });
  return true;
}

function upsertDmFromMessage(
  m: ZulipRawMessage,
  currentUserId: number | null,
  avatarUrlByUserId: Map<number, string> | undefined,
  dmsByKey: Map<string, DmEntryInternal>,
): void {
  if (m.type !== "private" || !Array.isArray(m.display_recipient)) return;
  const dmEntry = messageToDmEntry(m, currentUserId, avatarUrlByUserId);
  if (!dmEntry) return;
  const key = dmConversationKey(m.display_recipient, currentUserId);
  const existing = dmsByKey.get(key);
  const avatar_url = dmEntry.avatar_url ?? existing?.avatar_url;
  const entryWithMeta = {
    ...dmEntry,
    unreadCount: 0,
    avatar_url,
    lastMessageId: m.id,
  };
  if (!existing || dmEntry.ts >= existing.ts) {
    dmsByKey.set(key, entryWithMeta);
  } else {
    dmsByKey.set(key, {
      ...existing,
      avatar_url: existing.avatar_url ?? avatar_url,
    });
  }
}

function mapInternalStreamToSidebar(s: StreamEntryInternal): StreamWithLast {
  const topics = Array.from(s.topics.values())
    .sort((a, b) => b.ts - a.ts)
    .map((t) => ({
      subject: t.subject,
      lastMessage: t.lastMessage,
      lastMessageSenderName: t.lastMessageSenderName,
      time: t.time,
      badge: t.unreadCount > 0 ? t.unreadCount : undefined,
    }));
  const badge = topics.reduce((sum, t) => sum + (t.badge ?? 0), 0);
  return {
    stream_id: s.stream_id,
    name: s.name,
    lastMessage: s.lastMessage,
    lastMessageSenderName: s.lastMessageSenderName,
    time: s.time,
    topics,
    badge: badge > 0 ? badge : undefined,
  };
}

function mapInternalDmToSidebar(x: DmEntryInternal): Extract<SidebarChat, { type: "dm" }> {
  return {
    type: "dm" as const,
    id: x.id,
    name: x.name,
    slug: x.slug,
    isGroup: x.isGroup,
    lastMessage: x.lastMessage,
    time: x.time,
    userIds: x.userIds,
    badge: x.unreadCount > 0 ? x.unreadCount : undefined,
    avatar_url: x.avatar_url,
    ts: x.ts,
  };
}

/**
 * Builds lists of streams with topics and DMs with slug from latest Zulip messages.
 * Streams by stream_id, topics by subject; stream last message date — max across any topic.
 * Unread: messages without 'read' in flags; counter per stream/topic and per DM.
 */
export function buildSidebarFromMessages(
  messages: ZulipRawMessage[],
  currentUserId: number | null,
  avatarUrlByUserId?: Map<number, string>,
): {
  streams: StreamWithLast[];
  dms: Extract<SidebarChat, { type: "dm" }>[];
  streamsMap: Map<number, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
} {
  const streamUnread = new Map<string, number>();
  const dmUnread = new Map<string, number>();
  const streamsByKey = new Map<number, StreamEntryInternal>();
  const dmsByKey = new Map<string, DmEntryInternal>();

  for (const m of messages) {
    accumulateSidebarUnreadFromMessage(m, currentUserId, streamUnread, dmUnread);
    if (upsertStreamFromMessage(m, streamsByKey)) continue;
    upsertDmFromMessage(m, currentUserId, avatarUrlByUserId, dmsByKey);
  }

  applyUnreadCountsToSidebarMaps(streamsByKey, dmsByKey, streamUnread, dmUnread);

  const streams = Array.from(streamsByKey.values())
    .sort((a, b) => b.ts - a.ts)
    .map(mapInternalStreamToSidebar);
  const dms = Array.from(dmsByKey.values())
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    .map(mapInternalDmToSidebar);

  return { streams, dms, streamsMap: streamsByKey, dmsMap: dmsByKey };
}
