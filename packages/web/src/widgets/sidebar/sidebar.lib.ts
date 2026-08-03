import { isDmRouteSlugActive, parseDmRouteParticipantIds } from "~/shared/lib/dm-route-slug.lib";
import { resolveCanonicalStreamName } from "~/shared/lib/stream-name.lib";
import type { SidebarChat, StreamWithLast } from "~/shared/types/sidebar-chat";
import { isSidebarSystemFolderId } from "./sidebar-folder.constants";

export { dmConversationKey } from "~/shared/lib/dm-key";
export { isDmRouteSlugActive, parseDmRouteParticipantIds };

/** System rail folders plus legacy `selectedFolderId="all"` used in tests and older routes. */
export function isSidebarSystemFolderScope(folderId: string | undefined): boolean {
  if (folderId == null || folderId === "") return false;
  return isSidebarSystemFolderId(folderId);
}

/**
 * Sidebar activity metadata.
 * Order matches Exordos Core Figma (`my details` / Property 1=open).
 * iconBgClass uses semantic Tailwind tokens only (no hardcoded HEX),
 * so activity chips adapt to theme and palette changes.
 *
 * `icon` — expanded list on colored chips (filled / chip glyphs).
 * `compactIcon` — collapsed horizontal rail; outline (unfilled) glyphs.
 * `compactIconSize` — glyph px inside the 28×28 hit target (leave inset, not flush).
 */
export const MY_ACTIVITY = [
  {
    key: "inbox",
    labelKey: "nav.inbox" as const,
    // Padded envelope for expanded chips; compact uses cropped mail_activity_compact.
    icon: "mail_activity" as const,
    compactIcon: "mail_activity_compact" as const,
    compactIconSize: 20,
    iconBgClass: "bg-indicator-purple",
  },
  {
    key: "favorites",
    labelKey: "activity.favorites" as const,
    // Filled house from Figma; outline `home` remains for profile actions
    icon: "home_filled" as const,
    compactIcon: "home" as const,
    compactIconSize: 18,
    iconBgClass: "bg-indicator-blue",
  },
  {
    key: "markedMessages",
    labelKey: "activity.starred" as const,
    icon: "marker" as const,
    // Figma thin outline bookmark (5905:27795); filled `marker` stays for chips.
    compactIcon: "marker_outline" as const,
    compactIconSize: 18,
    iconBgClass: "bg-indicator-red",
  },
  {
    key: "mentions",
    labelKey: "activity.mentions" as const,
    icon: "alternate_email" as const,
    compactIcon: "alternate_email" as const,
    compactIconSize: 20,
    iconBgClass: "bg-indicator-yellow",
  },
  {
    key: "reactions",
    labelKey: "activity.reactions" as const,
    icon: "mood" as const,
    compactIcon: "mood" as const,
    compactIconSize: 18,
    iconBgClass: "bg-indicator-green",
  },
  {
    key: "drafts",
    labelKey: "activity.drafts" as const,
    // Outline pencil (Figma) for expanded chips; solid tip = drafts_compact.
    icon: "drafts" as const,
    compactIcon: "drafts_compact" as const,
    compactIconSize: 18,
    iconBgClass: "bg-indicator-pink",
  },
  {
    key: "feed",
    labelKey: "nav.feed" as const,
    icon: "chat_bubble_outline" as const,
    compactIcon: "chat_bubble_outline" as const,
    compactIconSize: 18,
    iconBgClass: "bg-indicator-orange",
  },
] as const;

/** Only items with live Workspace routes are shown in the rail. */
const VISIBLE_MY_ACTIVITY_KEYS: ReadonlySet<(typeof MY_ACTIVITY)[number]["key"]> = new Set([
  "inbox",
  "favorites",
  "markedMessages",
  "mentions",
  "drafts",
]);

/** UI-only navigation list. Keep hidden items available for their routes. */
export const VISIBLE_MY_ACTIVITY = MY_ACTIVITY.filter((item) =>
  VISIBLE_MY_ACTIVITY_KEYS.has(item.key),
);

/** Theme-aware gray when a topic has no color from the API. */
export const TOPIC_BAR_FALLBACK_COLOR = "var(--color-icon-base)";
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

export function getStreamChats(streams: StreamWithLast[]): SidebarChat[] {
  return streams.map((s) => ({
    type: "stream" as const,
    stream_id: s.stream_id,
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

/** Parse stream slug from URL: "5-general" -> { stream_id: 5, stream_name: "general" }. */
export function parseStreamSlug(
  streamSlug: string,
): { stream_id: number; stream_name: string } | null {
  const firstDash = streamSlug.indexOf("-");
  if (firstDash > 0) {
    const lead = streamSlug.slice(0, firstDash);
    const num = parseInt(lead, 10);
    if (!Number.isNaN(num) && String(num) === lead) {
      const rest = streamSlug.slice(firstDash + 1);
      return { stream_id: num, stream_name: rest };
    }
  }
  return null;
}

/**
 * Resolves canonical stream name and id from a parsed slug plus the chat-list map.
 */
export function resolveStreamRouteFromSlug(
  parsedStream: { stream_id: number; stream_name: string } | null,
  streamsMap: Map<number, { name: string }>,
): {
  resolvedStreamName: string;
  resolvedCanonicalStreamName: string | null;
  resolvedStreamId: number | null;
} {
  if (!parsedStream) {
    return { resolvedStreamName: "", resolvedCanonicalStreamName: null, resolvedStreamId: null };
  }
  const streamMapName = streamsMap.get(parsedStream.stream_id)?.name ?? null;
  const resolvedStreamName = streamMapName ?? parsedStream.stream_name;
  return {
    resolvedStreamName,
    resolvedCanonicalStreamName: resolveCanonicalStreamName({
      streamId: parsedStream.stream_id,
      streamMapName,
    }),
    resolvedStreamId: parsedStream.stream_id,
  };
}

/** @deprecated Import `parseDmRouteParticipantIds` from `~/shared/lib/dm-route-slug.lib`. */
export function parseDmSlugToUserIds(dmSlug: string): number[] {
  return parseDmRouteParticipantIds(dmSlug);
}

/** Workspace API chat_id format: stream:${stream_id}:${topic} or dm:${userIds.join(",")}. */
export function chatToWorkspaceChatId(chat: SidebarChat): string {
  if (chat.type === "stream") {
    return `stream:${chat.stream_id}:general`;
  }
  const userIds =
    Array.isArray(chat.userIds) && chat.userIds.length > 0
      ? chat.userIds
      : parseDmSlugToUserIds(chat.slug);
  return `dm:${userIds.join(",")}`;
}
