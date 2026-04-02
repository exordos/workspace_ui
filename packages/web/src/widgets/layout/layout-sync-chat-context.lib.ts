/**
 * Derives `CurrentChatContext` from the URL for layout ↔ message store sync.
 *
 * Routes may be `/dm/...` / `/stream/...` or nested under `/org/:orgId/...`.
 * The pathname parser must strip the org prefix so org-scoped chat URLs match.
 */
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { normalizeStreamTopicForMessageCache } from "~/shared/lib/message-cache-keys.lib";
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

/** Result of parsing the chat segment of the URL for layout ↔ store sync. */
export interface ParsedChatRoute {
  context: CurrentChatContext | null;
  /** True when the path includes `/stream/.../topic/:topicName`. */
  streamTopicExplicitInUrl: boolean;
}

/**
 * True when the message store already matches what the URL implies (navigation sync),
 * without forcing `setContext` when the only difference is topic on a stream-overview URL.
 */
export function isStoreContextAlignedWithParsedRoute(
  store: CurrentChatContext | null,
  parsed: ParsedChatRoute,
): boolean {
  const urlCtx = parsed.context;
  if (store === urlCtx) return true;
  if (store == null || urlCtx == null) return false;
  if (store.type !== urlCtx.type) return false;
  if (store.type === "dm") {
    return urlCtx.type === "dm" && store.dmKey === urlCtx.dmKey;
  }
  if (urlCtx.type !== "stream") return false;
  const su = store;
  const uu = urlCtx;
  if (su.streamId !== uu.streamId) return false;
  if (parsed.streamTopicExplicitInUrl) {
    return (
      normalizeStreamTopicForMessageCache(su.topic) === normalizeStreamTopicForMessageCache(uu.topic)
    );
  }
  return true;
}

export function parseChatContextFromPathname(options: {
  pathname: string;
  streamsMap: Map<number, { name: string }>;
  currentUserId: number | null;
}): ParsedChatRoute {
  const { streamsMap, currentUserId } = options;
  const pathname = stripOrgSegmentFromPathname(options.pathname);

  const dmMatch = pathname.match(/^\/dm\/([^/]+)(?:\/|$)/);
  if (dmMatch) {
    const dmSlug = decodeURIComponent(dmMatch[1] ?? "");
    const userIds = parseDmSlugToUserIds(dmSlug);
    const dmKey = dmRouteKey(userIds, currentUserId);
    return { context: { type: "dm", dmKey }, streamTopicExplicitInUrl: false };
  }

  const streamMatch = pathname.match(/^\/stream\/([^/]+)(?:\/topic\/([^/]+))?/);
  if (streamMatch) {
    const streamSlug = decodeURIComponent(streamMatch[1] ?? "");
    const topicExplicit = streamMatch[2] != null && streamMatch[2].length > 0;
    const topicRaw = topicExplicit ? decodeURIComponent(streamMatch[2] ?? "") : "general";
    const topic = (topicRaw ?? "").trim() || "general";
    const parsed = parseStreamSlug(streamSlug);
    if (!parsed) return { context: null, streamTopicExplicitInUrl: false };
    const streamName =
      parsed.stream_id != null
        ? streamsMap.get(parsed.stream_id)?.name ?? parsed.stream_name
        : parsed.stream_name;
    const streamId =
      parsed.stream_id ??
      (streamName
        ? (Array.from(streamsMap.entries()).find(([, s]) => s.name === streamName)?.[0] ?? null)
        : null);
    if (streamId == null) return { context: null, streamTopicExplicitInUrl: topicExplicit };
    return {
      context: {
        type: "stream",
        streamId,
        streamName,
        topic,
        streamWideView: !topicExplicit,
      },
      streamTopicExplicitInUrl: topicExplicit,
    };
  }

  return { context: null, streamTopicExplicitInUrl: false };
}
