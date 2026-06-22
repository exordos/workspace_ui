import {
  buildDmRouteSlugFromRecipients,
  isDmRouteSlugActive,
  parseDmRouteParticipantIds,
} from "~/shared/lib/dm-route-slug.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { SidebarChat, StreamWithLast } from "~/shared/types/sidebar-chat";

export { dmConversationKey } from "~/shared/lib/dm-key";
export { buildDmRouteSlugFromRecipients, isDmRouteSlugActive, parseDmRouteParticipantIds };
export {
  buildSidebarFromMessages,
  messageToStreamEntry,
  messageToDmEntry,
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
export const MOCK_DMS: SidebarChat[] = [
  {
    type: "dm",
    id: 101,
    name: "user1",
    slug: "101-user1",
    lastMessage: "Last message text...",
    time: "10:13",
    pinned: true,
  },
  {
    type: "dm",
    id: 102,
    name: "user2",
    slug: "102-user2",
    lastMessage: "Last message text...",
    time: "10:13",
    pinned: true,
  },
  {
    type: "dm",
    id: 103,
    name: "user3",
    slug: "103-user3",
    lastMessage: "Ok, then on Thursday",
    time: "Yesterday",
    pinned: false,
  },
  {
    type: "dm",
    id: 104,
    name: "team",
    slug: "104-team",
    lastMessage: "Meeting at 3:00 PM",
    time: "10:02",
    badge: 4,
  },
];

export function getStreamChats(
  streams: StreamWithLast[],
): Extract<SidebarChat, { type: "stream" }>[] {
  return streams.map((s) => ({
    type: "stream" as const,
    streamUuid: s.streamUuid,
    private: s.private,
    name: s.name,
    lastMessage: s.lastMessage,
    lastMessageSenderName: s.lastMessageSenderName,
    time: s.time,
    topics: s.topics,
    badge: s.badge,
    hasMention: s.hasMention,
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

/** Slug for stream: the Workspace stream UUID. */
export function slugForStream(stream: { streamUuid: string }): string {
  return stream.streamUuid.trim().toLowerCase();
}

/** Parse stream slug from URL: uuid-only Workspace stream route. */
export function parseStreamSlug(streamSlug: string): { streamUuid: string } | null {
  const streamUuid = streamSlug.trim().toLowerCase();
  return streamUuid.length > 0 ? { streamUuid } : null;
}

/**
 * Resolves canonical stream name and uuid from a parsed slug plus the chat-list map.
 */
export function resolveStreamRouteFromSlug(
  parsedStream: { streamUuid: string } | null,
  streamsMap: Map<string, { name: string }>,
): {
  resolvedStreamName: string;
  resolvedCanonicalStreamName: string | null;
  resolvedStreamId: string | null;
} {
  if (!parsedStream) {
    return { resolvedStreamName: "", resolvedCanonicalStreamName: null, resolvedStreamId: null };
  }
  const streamMapName = streamsMap.get(parsedStream.streamUuid)?.name ?? null;
  return {
    resolvedStreamName: streamMapName ?? parsedStream.streamUuid,
    resolvedCanonicalStreamName: streamMapName,
    resolvedStreamId: parsedStream.streamUuid,
  };
}

/** @deprecated Import `parseDmRouteParticipantIds` from `~/shared/lib/dm-route-slug.lib`. */
export function parseDmSlugToUserIds(dmSlug: string): UserId[] {
  return parseDmRouteParticipantIds(dmSlug);
}

/** Internal folder chat identifier for stream rows. */
export function chatToWorkspaceChatId(chat: SidebarChat): string {
  if (chat.type === "stream") {
    return `stream:${chat.streamUuid}:general`;
  }
  const userIds =
    Array.isArray(chat.userIds) && chat.userIds.length > 0
      ? chat.userIds
      : parseDmRouteParticipantIds(chat.slug);
  return `dm:${userIds.join(",")}`;
}
