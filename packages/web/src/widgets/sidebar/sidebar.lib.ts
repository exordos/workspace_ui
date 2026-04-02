import type { SidebarChat, StreamWithLast } from "~/shared/types/sidebar-chat";

export { dmConversationKey } from "~/shared/lib/dm-key";
export {
  buildSidebarFromMessages,
  messageToStreamEntry,
  messageToDmEntry,
  isUnread,
} from "~/entities/chat-list/chat-list.lib";

/**
 * Sidebar activity metadata.
 * iconBgClass uses semantic Tailwind tokens only (no hardcoded HEX),
 * so activity chips adapt to theme and palette changes.
 */
export const MY_ACTIVITY = [
  {
    key: "inbox",
    labelKey: "nav.inbox" as const,
    icon: "mail" as const,
    iconBgClass: "bg-accent",
    route: "/inbox" as const,
  },
  {
    key: "mentions",
    labelKey: "activity.mentions" as const,
    icon: "at" as const,
    iconBgClass: "bg-indicator-yellow",
    route: "/activity/mentions" as const,
  },
  {
    key: "drafts",
    labelKey: "activity.drafts" as const,
    icon: "files" as const,
    iconBgClass: "bg-indicator-purple",
    route: "/activity/drafts" as const,
  },
  {
    key: "favorites",
    labelKey: "activity.starred" as const,
    icon: "star_outline" as const,
    iconBgClass: "bg-accent",
    route: "/activity/starred" as const,
  },
  {
    key: "reactions",
    labelKey: "activity.reactions" as const,
    icon: "mood" as const,
    iconBgClass: "bg-indicator-green",
    route: "/activity/reactions" as const,
  },
  {
    key: "feed",
    labelKey: "nav.feed" as const,
    icon: "chat_bubble_outline" as const,
    iconBgClass: "bg-indicator-green",
    route: "/feed" as const,
  },
] as const;

export const TOPIC_BAR_COLORS = ["var(--color-indicator-yellow)", "var(--color-indicator-pink)"];
const DM_SLUG_CACHE_LIMIT = 500;
const dmSlugUserIdsCache = new Map<string, number[]>();

export const MOCK_DMS: SidebarChat[] = [
  {
    type: "dm",
    id: 101,
    name: "user1",
    slug: "101-user1",
    isGroup: false,
    lastMessage: "Last message text...",
    time: "10:13",
    pinned: true,
  },
  {
    type: "dm",
    id: 102,
    name: "user2",
    slug: "102-user2",
    isGroup: false,
    lastMessage: "Last message text...",
    time: "10:13",
    pinned: true,
  },
  {
    type: "dm",
    id: 103,
    name: "user3",
    slug: "103-user3",
    isGroup: false,
    lastMessage: "Ok, then on Thursday",
    time: "Yesterday",
    pinned: false,
  },
  {
    type: "dm",
    id: 104,
    name: "team",
    slug: "104-team",
    isGroup: false,
    lastMessage: "Meeting at 3:00 PM",
    time: "10:02",
    badge: 4,
  },
];

export const MOCK_GROUPS: SidebarChat[] = [
  {
    type: "dm",
    id: 201,
    name: "Group chat",
    slug: "201,202,203",
    isGroup: true,
    lastMessage: "Last message text",
    time: "10:13",
    badge: 458,
  },
];

export function getStreamChats(streams: StreamWithLast[]): SidebarChat[] {
  return streams.map((s) => ({
    type: "stream" as const,
    stream_id: s.stream_id,
    name: s.name,
    lastMessage: s.lastMessage,
    time: s.time,
    topics: s.topics,
    badge: s.badge,
  }));
}

/** Find DM by slug from URL or by id. Uses the provided dms list or MOCK_DMS. */
export function getDmById(
  slugOrId: number | string,
  dms?: Extract<SidebarChat, { type: "dm" }>[],
): Extract<SidebarChat, { type: "dm" }> | undefined {
  const list = (dms ?? MOCK_DMS) as Extract<SidebarChat, { type: "dm" }>[];
  if (typeof slugOrId === "string") {
    return list.find((c) => c.slug === slugOrId);
  }
  return list.find((c) => c.id === slugOrId);
}

/** URL-safe slug: lowercase, spaces and invalid chars → "-", remove duplicate "-". */
function slugify(s: string): string {
  const lower = s.trim().toLowerCase();
  const safe = lower.replace(/[^\p{L}\p{N}-]/gu, "-").replace(/-+/g, "-");
  return safe.replace(/^-|-$/g, "") || "chat";
}

/** Slug for stream: stream_id-stream_name. */
export function slugForStream(stream: { stream_id: number; name: string }): string {
  return `${stream.stream_id}-${slugify(stream.name)}`;
}

/** Parse streamSlug from URL: "5-general" -> { stream_id: 5, stream_name: "general" }; "general" (legacy) -> { stream_name: "general" }. */
export function parseStreamSlug(streamSlug: string): { stream_id?: number; stream_name: string } {
  const firstDash = streamSlug.indexOf("-");
  if (firstDash > 0) {
    const lead = streamSlug.slice(0, firstDash);
    const num = parseInt(lead, 10);
    if (!Number.isNaN(num) && String(num) === lead) {
      const rest = streamSlug.slice(firstDash + 1);
      return { stream_id: num, stream_name: rest };
    }
  }
  try {
    return { stream_name: decodeURIComponent(streamSlug) };
  } catch {
    return { stream_name: streamSlug };
  }
}

/**
 * Resolves canonical stream name and id from a parsed slug plus the chat-list map.
 * Legacy URLs without a numeric prefix are matched by exact stream name.
 */
export function resolveStreamRouteFromSlug(
  parsedStream: { stream_id?: number; stream_name: string } | null,
  streamsMap: Map<number, { name: string }>,
): { resolvedStreamName: string; resolvedStreamId: number | null } {
  if (!parsedStream) {
    return { resolvedStreamName: "", resolvedStreamId: null };
  }
  if (parsedStream.stream_id != null) {
    const resolvedStreamName =
      streamsMap.get(parsedStream.stream_id)?.name ?? parsedStream.stream_name;
    return { resolvedStreamName, resolvedStreamId: parsedStream.stream_id };
  }
  const resolvedStreamName = parsedStream.stream_name;
  if (!resolvedStreamName) {
    return { resolvedStreamName: "", resolvedStreamId: null };
  }
  const resolvedStreamId =
    Array.from(streamsMap.entries()).find(([, stream]) => stream.name === resolvedStreamName)?.[0] ??
    null;
  return { resolvedStreamName, resolvedStreamId };
}

/** Parse DM slug from URL to user_id array for API: "422-vasya" -> [422], "422-vasya,507-petya" -> [422, 507]. */
export function parseDmSlugToUserIds(dmSlug: string): number[] {
  const cached = dmSlugUserIdsCache.get(dmSlug);
  if (cached != null) {
    return cached;
  }

  const DECIMAL_INTEGER_RE = /^[0-9]+$/;
  const parsedUserIds = dmSlug
    .split(",")
    .map((part) => part.split("-")[0]?.trim() ?? "")
    .map((rawUserId) => {
      if (!DECIMAL_INTEGER_RE.test(rawUserId)) return null;
      const parsed = Number(rawUserId);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
      return parsed;
    })
    .filter((userId): userId is number => userId !== null);

  if (dmSlugUserIdsCache.size >= DM_SLUG_CACHE_LIMIT) {
    dmSlugUserIdsCache.clear();
  }
  dmSlugUserIdsCache.set(dmSlug, parsedUserIds);
  return parsedUserIds;
}

/** Workspace API chat_id format: stream:${stream_id}:${topic} or dm:${userIds.join(",")}. */
export function chatToWorkspaceChatId(chat: SidebarChat): string {
  if (chat.type === "stream") {
    return `stream:${chat.stream_id}:general`;
  }
  const userIds = parseDmSlugToUserIds(chat.slug);
  return `dm:${userIds.join(",")}`;
}
