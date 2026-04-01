/**
 * Derives `CurrentChatContext` from the URL for layout ↔ message store sync.
 *
 * Routes may be `/dm/...` / `/stream/...` or nested under `/org/:orgId/...`.
 * The pathname parser must strip the org prefix so org-scoped chat URLs match.
 */
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { parseDmSlugToUserIds, parseStreamSlug } from "~/widgets/sidebar/sidebar.lib";

/**
 * Turns `/org/:orgId/dm/x` → `/dm/x` (and same for stream). Leaves non-org paths unchanged.
 */
export function stripOrgSegmentFromPathname(pathname: string): string {
  const m = pathname.match(/^\/org\/[^/]+(\/.*)?$/);
  if (m?.[1] != null && m[1].length > 0) {
    return m[1];
  }
  return pathname;
}

export function parseChatContextFromPathname(options: {
  pathname: string;
  streamsMap: Map<number, { name: string }>;
  currentUserId: number | null;
}): CurrentChatContext | null {
  const { streamsMap, currentUserId } = options;
  const pathname = stripOrgSegmentFromPathname(options.pathname);

  const dmMatch = pathname.match(/^\/dm\/([^/]+)(?:\/|$)/);
  if (dmMatch) {
    const dmSlug = decodeURIComponent(dmMatch[1] ?? "");
    const userIds = parseDmSlugToUserIds(dmSlug);
    const dmKey = dmRouteKey(userIds, currentUserId);
    return { type: "dm", dmKey };
  }

  const streamMatch = pathname.match(/^\/stream\/([^/]+)(?:\/topic\/([^/]+))?/);
  if (streamMatch) {
    const streamSlug = decodeURIComponent(streamMatch[1] ?? "");
    const topicRaw = streamMatch[2] ? decodeURIComponent(streamMatch[2]) : "general";
    const topic = (topicRaw ?? "").trim() || "general";
    const parsed = parseStreamSlug(streamSlug);
    if (!parsed) return null;
    const streamName =
      parsed.stream_id != null
        ? streamsMap.get(parsed.stream_id)?.name ?? parsed.stream_name
        : parsed.stream_name;
    const streamId =
      parsed.stream_id ??
      (streamName
        ? (Array.from(streamsMap.entries()).find(([, s]) => s.name === streamName)?.[0] ?? null)
        : null);
    if (streamId == null) return null;
    return { type: "stream", streamId, streamName, topic };
  }

  return null;
}
