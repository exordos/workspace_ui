/**
 * Chat-list building helpers — pure functions that transform
 * Zulip raw messages into sidebar-ready structures.
 */
import { useUsersStore } from "~/entities/user/user.model";
import { t, getLocale } from "~/i18n/i18n";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import type {
  SidebarChat,
  StreamWithLast,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";

export { dmConversationKey } from "~/shared/lib/dm-key";

// ---
// Private helpers
// ---

const MAX_PREVIEW_LEN = 60;

function truncatePreview(text: string): string {
  const plain = text.replace(/<[^>]+>/g, "").trim();
  if (plain.length <= MAX_PREVIEW_LEN) return plain;
  return plain.slice(0, MAX_PREVIEW_LEN) + "…";
}

function formatMessageTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const locale = getLocale() === "ru" ? "ru-RU" : "en-US";
  if (sameDay) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth())
    return t("chat.yesterday");
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 1000000;
}

const GROUP_DM_ID_OFFSET = 2000000;

function slugify(s: string): string {
  const lower = s.trim().toLowerCase();
  const safe = lower.replace(/[^\p{L}\p{N}-]/gu, "-").replace(/-+/g, "-");
  return safe.replace(/^-|-$/g, "") || "chat";
}

function getDisplayName(recipient: { email?: string; full_name?: string }): string {
  if (recipient.email != null && recipient.email.length > 0) {
    const part = recipient.email.split("@")[0];
    if (part) return part;
  }
  return recipient.full_name ?? "";
}

function getDmPartnerName(recipient: { email?: string; full_name?: string }): string {
  const name = (recipient.full_name ?? "").trim();
  if (name) return name;
  return getDisplayName(recipient) || t("dm.privateChat");
}

// ---
// Public API
// ---

interface StreamTopicEntry {
  subject: string;
  lastMessage: string;
  time: string;
  ts: number;
  unreadCount: number;
  lastMessageId?: number;
}

export function isUnread(m: ZulipRawMessage): boolean {
  return !m.flags?.includes("read");
}

export function messageToStreamEntry(m: ZulipRawMessage): {
  stream: Omit<StreamEntryInternal, "topics"> & { topics: Map<string, StreamTopicEntry> };
  topic: StreamTopicEntry;
} | null {
  if (m.type !== "stream" || m.stream_id == null) return null;
  const lastMsg = truncatePreview(m.content);
  const time = formatMessageTime(m.timestamp);
  const name = typeof m.display_recipient === "string" ? m.display_recipient : String(m.stream_id);
  const subject = (m.subject ?? "").trim() || "general";
  const topicEntry: StreamTopicEntry = {
    subject,
    lastMessage: lastMsg,
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
      time,
      ts: m.timestamp,
      topics: new Map([[subject, topicEntry]]),
    },
    topic: topicEntry,
  };
}

export function messageToDmEntry(
  m: ZulipRawMessage,
  currentUserId: number | null,
  avatarUrlByUserId?: Map<number, string>,
): DmEntryInternal | null {
  if (m.type !== "private" || !Array.isArray(m.display_recipient)) return null;
  const usersStore = useUsersStore.getState();
  const recipients = m.display_recipient
    .map((r) => ({
      id: r.id,
      full_name: r.full_name ?? "",
      email: r.email ?? "",
      avatar_url: r.avatar_url,
    }))
    .sort((a, b) => a.id - b.id);
  const key = recipients.map((r) => r.id).join(",");
  const otherUsers =
    currentUserId != null ? recipients.filter((r) => r.id !== currentUserId) : recipients;
  const isGroup = otherUsers.length !== 1 || (currentUserId == null && recipients.length === 2);
  const nameFromStore = (userId: number) => usersStore.getDisplayName(userId);
  const avatarFromStore = (userId: number) =>
    usersStore.getAvatarUrl(userId) ?? avatarUrlByUserId?.get(userId);
  const directName = otherUsers[0] != null ? nameFromStore(otherUsers[0].id) : undefined;
  const name = isGroup
    ? currentUserId == null && recipients.length === 2
      ? t("dm.privateChat")
      : otherUsers
          .map((u) => nameFromStore(u.id) || getDisplayName(u))
          .filter(Boolean)
          .join(", ") || t("dm.groupChat")
    : directName != null && directName.length > 0
      ? directName
      : getDmPartnerName(otherUsers[0] ?? {});
  let id: number;
  let userIds: number[] | undefined;
  let avatar_url: string | undefined;
  if (isGroup) {
    id = GROUP_DM_ID_OFFSET + hashKey(key);
    userIds = recipients.map((r) => r.id);
  } else {
    const other = otherUsers[0];
    const otherUserId =
      other?.id ??
      (currentUserId != null ? recipients.find((r) => r.id !== currentUserId)?.id : undefined);
    if (otherUserId == null) return null;
    id = otherUserId;
    const fromMessage =
      m.sender_id === id && m.avatar_url ? String(m.avatar_url).trim() : undefined;
    avatar_url = avatarFromStore(id) ?? fromMessage ?? other?.avatar_url;
  }
  const slug = isGroup
    ? otherUsers
        .map((u) => `${u.id}-${slugify(nameFromStore(u.id) || getDisplayName(u))}`)
        .join(",")
    : `${id}-${slugify(name)}`;
  const lastMsg = truncatePreview(m.content);
  const time = formatMessageTime(m.timestamp);
  return {
    id,
    name,
    slug,
    isGroup,
    lastMessage: lastMsg,
    time,
    ts: m.timestamp,
    userIds,
    unreadCount: isUnread(m) ? 1 : 0,
    avatar_url,
    lastMessageId: m.id,
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

  for (const m of messages) {
    const unread = isUnread(m);
    if (m.type === "stream" && m.stream_id != null) {
      const subject = (m.subject ?? "").trim() || "general";
      const key = `${m.stream_id}\t${subject}`;
      streamUnread.set(key, (streamUnread.get(key) ?? 0) + (unread ? 1 : 0));
    } else if (m.type === "private" && Array.isArray(m.display_recipient)) {
      const key = dmConversationKey(m.display_recipient, currentUserId);
      dmUnread.set(key, (dmUnread.get(key) ?? 0) + (unread ? 1 : 0));
    }
  }

  const streamsByKey = new Map<number, StreamEntryInternal>();
  const dmsByKey = new Map<string, DmEntryInternal>();

  for (const m of messages) {
    const streamResult = messageToStreamEntry(m);
    if (streamResult) {
      const { stream_id, name, lastMessage, time, ts } = streamResult.stream;
      const topicEntry = streamResult.topic;
      const unreadKey = `${stream_id}\t${topicEntry.subject}`;
      const topicWithUnread: StreamTopicEntry = {
        ...topicEntry,
        unreadCount: streamUnread.get(unreadKey) ?? 0,
        lastMessageId: m.id,
      };
      const existing = streamsByKey.get(stream_id);
      if (!existing) {
        const topics = new Map<string, StreamTopicEntry>();
        topics.set(topicWithUnread.subject, topicWithUnread);
        streamsByKey.set(stream_id, { stream_id, name, lastMessage, time, ts, topics });
      } else {
        const existingTopic = existing.topics.get(topicWithUnread.subject);
        const nextTopics = new Map(existing.topics);
        if (!existingTopic || topicWithUnread.ts >= existingTopic.ts) {
          nextTopics.set(topicWithUnread.subject, topicWithUnread);
        } else {
          nextTopics.set(topicWithUnread.subject, {
            ...existingTopic,
            unreadCount: topicWithUnread.unreadCount,
          });
        }
        const newerStream = m.timestamp >= existing.ts;
        streamsByKey.set(stream_id, {
          stream_id,
          name: existing.name,
          lastMessage: newerStream ? lastMessage : existing.lastMessage,
          time: newerStream ? time : existing.time,
          ts: Math.max(existing.ts, m.timestamp),
          topics: nextTopics,
        });
      }
      continue;
    }

    if (m.type !== "private" || !Array.isArray(m.display_recipient)) continue;
    const dmEntry = messageToDmEntry(m, currentUserId, avatarUrlByUserId);
    if (dmEntry) {
      const key = dmConversationKey(m.display_recipient, currentUserId);
      const unreadCount = dmUnread.get(key) ?? 0;
      const existing = dmsByKey.get(key);
      const avatar_url = dmEntry.avatar_url ?? existing?.avatar_url;
      const entryWithUnread = { ...dmEntry, unreadCount, avatar_url, lastMessageId: m.id };
      if (!existing || dmEntry.ts >= existing.ts) {
        dmsByKey.set(key, entryWithUnread);
      } else {
        dmsByKey.set(key, {
          ...existing,
          unreadCount,
          avatar_url: existing.avatar_url ?? avatar_url,
        });
      }
    }
  }

  const streams: StreamWithLast[] = Array.from(streamsByKey.values())
    .sort((a, b) => b.ts - a.ts)
    .map((s) => {
      const topics = Array.from(s.topics.values())
        .sort((a, b) => b.ts - a.ts)
        .map((t) => ({
          subject: t.subject,
          lastMessage: t.lastMessage,
          time: t.time,
          badge: t.unreadCount > 0 ? t.unreadCount : undefined,
        }));
      const badge = topics.reduce((sum, t) => sum + (t.badge ?? 0), 0);
      return {
        stream_id: s.stream_id,
        name: s.name,
        lastMessage: s.lastMessage,
        time: s.time,
        topics,
        badge: badge > 0 ? badge : undefined,
      };
    });
  const dms: Extract<SidebarChat, { type: "dm" }>[] = Array.from(dmsByKey.values())
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    .map((x) => ({
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
    }));

  return { streams, dms, streamsMap: streamsByKey, dmsMap: dmsByKey };
}
