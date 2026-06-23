/**
 * Chat-list building helpers — pure functions that transform
 * Workspace raw messages into sidebar-ready structures.
 */
import {
  formatMessageTime,
  getDmPartnerName,
  slugify,
  truncatePreview,
} from "~/entities/chat-list/chat-list-format.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";
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
  topicUuid?: string;
  subject: string;
  lastMessage: string;
  lastMessageSenderName?: string;
  time: string;
  ts: number;
  unreadCount: number;
  lastMessageId?: MessageId;
}

export function streamTopicIdentityFromMessage(
  m: Pick<WorkspaceRawMessage, "subject" | "topic_uuid">,
): { subject: string; topicUuid?: string } | null {
  const subject = normalizeTopicForIdentity(m.subject ?? "");
  const topicUuid =
    typeof m.topic_uuid === "string" && m.topic_uuid.trim().length > 0
      ? m.topic_uuid.trim().toLowerCase()
      : undefined;
  const resolvedSubject = subject.length > 0 ? subject : topicUuid;
  if (resolvedSubject == null || resolvedSubject.length === 0) {
    return null;
  }
  return {
    subject: resolvedSubject,
    ...(topicUuid != null ? { topicUuid } : {}),
  };
}

export function messageToStreamEntry(m: WorkspaceRawMessage): {
  stream: Omit<StreamEntryInternal, "topics"> & { topics: Map<string, StreamTopicEntry> };
  topic: StreamTopicEntry;
} | null {
  if (m.type !== "stream" || m.stream_uuid == null) return null;
  const topicIdentity = streamTopicIdentityFromMessage(m);
  if (topicIdentity == null) return null;
  const lastMsg = truncatePreview(m.content);
  const trimmedSenderName = m.sender_full_name?.trim();
  const lastMessageSenderName =
    trimmedSenderName && trimmedSenderName.length > 0 ? trimmedSenderName : undefined;
  const time = formatMessageTime(m.timestamp);
  const name =
    typeof m.display_recipient === "string" ? m.display_recipient : String(m.stream_uuid);
  const topicEntry: StreamTopicEntry = {
    ...(topicIdentity.topicUuid != null ? { topicUuid: topicIdentity.topicUuid } : {}),
    subject: topicIdentity.subject,
    lastMessage: lastMsg,
    lastMessageSenderName,
    time,
    ts: m.timestamp,
    unreadCount: 0,
    lastMessageId: m.id,
  };
  return {
    stream: {
      streamUuid: m.stream_uuid,
      name,
      lastMessage: lastMsg,
      lastMessageSenderName,
      time,
      ts: m.timestamp,
      unreadCount: 0,
      topics: new Map([[topicIdentity.subject, topicEntry]]),
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

/** Workspace: two recipients => 1:1 DM; when current user is unknown, infer peer from sender. */
function resolveDmOtherUsers(
  recipients: DmRecipientRow[],
  currentUserId: UserId | null,
  senderId: number,
): DmRecipientRow[] {
  const isOneToOneDm = recipients.length === 2;
  if (currentUserId != null && typeof currentUserId === "number") {
    return recipients.filter((r) => r.id !== currentUserId);
  }
  if (isOneToOneDm) {
    const peer = recipients.find((r) => r.id !== senderId);
    return peer != null ? [peer] : [recipients[0]!];
  }
  return recipients;
}

function buildDmEntryDisplayName(
  otherUsers: DmRecipientRow[],
  getName: (userId: number) => string,
): string {
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
  recipients: DmRecipientRow[],
  otherUsers: DmRecipientRow[],
  currentUserId: UserId | null,
  message: WorkspaceRawMessage,
  getAvatar: (userId: number) => string | undefined,
): { id: number; avatar_url?: string } | null {
  const other = otherUsers[0];
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  const otherUserId =
    other?.id ??
    (numericCurrentUserId != null
      ? recipients.find((r) => r.id !== numericCurrentUserId)?.id
      : undefined);
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

function buildDmEntrySlug(id: number, name: string): string {
  return `${id}-${slugify(name)}`;
}

export function messageToDmEntry(
  m: WorkspaceRawMessage,
  currentUserId: UserId | null,
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
  if (recipients.length !== 2) return null;
  const otherUsers = resolveDmOtherUsers(recipients, currentUserId, m.sender_id);
  if (otherUsers.length !== 1) return null;
  const getName = (userId: number) => usersStore.getDisplayName(userId);
  const getAvatar = (userId: number) =>
    usersStore.getAvatarUrl(userId) ?? avatarUrlByUserId?.get(userId);
  const name = buildDmEntryDisplayName(otherUsers, getName);
  const identity = resolveDmEntryIdentity(recipients, otherUsers, currentUserId, m, getAvatar);
  if (identity == null) return null;
  const slug = buildDmEntrySlug(identity.id, name);
  return {
    id: identity.id,
    name,
    slug,
    lastMessage: truncatePreview(m.content),
    time: formatMessageTime(m.timestamp),
    ts: m.timestamp,
    unreadCount: 0,
    avatar_url: identity.avatar_url,
    lastMessageId: m.id,
  };
}

function upsertStreamFromMessage(
  m: WorkspaceRawMessage,
  streamsByKey: Map<string, StreamEntryInternal>,
): boolean {
  const streamResult = messageToStreamEntry(m);
  if (!streamResult) return false;
  const { streamUuid, name, lastMessage, lastMessageSenderName, time, ts } = streamResult.stream;
  const topicWithMeta: StreamTopicEntry = {
    ...streamResult.topic,
    unreadCount: 0,
    lastMessageId: m.id,
  };
  const existing = streamsByKey.get(streamUuid);
  if (!existing) {
    const topics = new Map<string, StreamTopicEntry>([[topicWithMeta.subject, topicWithMeta]]);
    streamsByKey.set(streamUuid, {
      streamUuid,
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
  streamsByKey.set(streamUuid, {
    ...existing,
    streamUuid,
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
  m: WorkspaceRawMessage,
  currentUserId: UserId | null,
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
      ...(t.topicUuid != null ? { topicUuid: t.topicUuid } : {}),
      subject: t.subject,
      lastMessage: t.lastMessage,
      lastMessageSenderName: t.lastMessageSenderName,
      time: t.time,
      badge: t.unreadCount > 0 ? t.unreadCount : undefined,
    }));
  const badge = s.unreadCount ?? 0;
  return {
    private: s.private,
    streamUuid: s.streamUuid,
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
    lastMessage: x.lastMessage,
    time: x.time,
    userIds: x.userIds,
    streamUuid: x.streamUuid,
    badge: x.unreadCount > 0 ? x.unreadCount : undefined,
    avatar_url: x.avatar_url,
    ts: x.ts,
  };
}

/**
 * Builds lists of streams with topics and DMs with slug from latest messenger messages.
 * Streams by stream_uuid, topics by subject; stream last message date — max across any topic.
 * Unread counts are not derived from messages; server metadata supplies them separately.
 */
export function buildSidebarFromMessages(
  messages: WorkspaceRawMessage[],
  currentUserId: UserId | null,
  avatarUrlByUserId?: Map<number, string>,
): {
  streams: StreamWithLast[];
  dms: Extract<SidebarChat, { type: "dm" }>[];
  streamsMap: Map<string, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
} {
  const streamsByKey = new Map<string, StreamEntryInternal>();
  const dmsByKey = new Map<string, DmEntryInternal>();

  for (const m of messages) {
    if (upsertStreamFromMessage(m, streamsByKey)) continue;
    upsertDmFromMessage(m, currentUserId, avatarUrlByUserId, dmsByKey);
  }

  const streams = Array.from(streamsByKey.values())
    .sort((a, b) => b.ts - a.ts)
    .map(mapInternalStreamToSidebar);
  const dms = Array.from(dmsByKey.values())
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    .map(mapInternalDmToSidebar);

  return { streams, dms, streamsMap: streamsByKey, dmsMap: dmsByKey };
}
