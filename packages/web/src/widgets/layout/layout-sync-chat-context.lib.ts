/**
 * Derives `CurrentChatContext` from the URL for layout ↔ message store sync.
 *
 * Routes may be `/dm/...` / `/stream/...` or nested under `/org/:orgId/...`.
 * The pathname parser must strip the org prefix so org-scoped chat URLs match.
 */
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { decodeTopicFromRoute, normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { parseDmSlugToUserIds, parseStreamSlug } from "~/widgets/sidebar/sidebar.lib";

const ORG_PREFIX_PATH = /^\/org\/[^/]+(\/.*)?$/;
const DM_PATH_SEGMENT = /^\/dm\/([^/]+)(?:\/|$)/;
const STREAM_PATH_SEGMENT = /^\/stream\/([^/]+)(?:\/topic\/([^/]+))?/;

/**
 * Turns `/org/:orgId/dm/x` → `/dm/x` (and same for stream). Leaves non-org paths unchanged.
 */
export function stripOrgSegmentFromPathname(pathname: string): string {
  const m = ORG_PREFIX_PATH.exec(pathname);
  if (m?.[1] != null && m[1].length > 0) {
    return m[1];
  }
  return pathname;
}

/** True when the URL points at an open stream or DM chat (not inbox / activity / settings). */
export function isMessengerChatPathname(pathname: string): boolean {
  const scoped = stripOrgSegmentFromPathname(pathname);
  return DM_PATH_SEGMENT.test(scoped) || STREAM_PATH_SEGMENT.test(scoped);
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
    return normalizeTopicForIdentity(su.topic) === normalizeTopicForIdentity(uu.topic);
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

  const dmMatch = DM_PATH_SEGMENT.exec(pathname);
  if (dmMatch) {
    const dmSlug = decodeURIComponent(dmMatch[1] ?? "");
    const userIds = parseDmSlugToUserIds(dmSlug);
    const dmKey = dmRouteKey(userIds, currentUserId);
    return { context: { type: "dm", dmKey }, streamTopicExplicitInUrl: false };
  }

  const streamMatch = STREAM_PATH_SEGMENT.exec(pathname);
  if (streamMatch) {
    const streamSlug = decodeURIComponent(streamMatch[1] ?? "");
    const topicExplicit = streamMatch[2] != null && streamMatch[2].length > 0;
    const topicRaw = topicExplicit ? decodeURIComponent(streamMatch[2] ?? "") : "";
    const topic = topicExplicit ? decodeTopicFromRoute(topicRaw) : "";
    const parsed = parseStreamSlug(streamSlug);
    if (!parsed) return { context: null, streamTopicExplicitInUrl: false };
    const streamId = parsed.stream_id;
    const streamName = streamsMap.get(streamId)?.name ?? parsed.stream_name;
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
