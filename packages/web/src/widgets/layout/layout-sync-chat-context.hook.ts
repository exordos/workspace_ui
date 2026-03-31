import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list";
import { useCurrentChatMessagesStore, type CurrentChatContext } from "~/entities/message";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { parseDmSlugToUserIds, parseStreamSlug } from "~/widgets/sidebar";

function isSameContext(a: CurrentChatContext | null, b: CurrentChatContext | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.type !== b.type) return false;
  if (a.type === "dm") return a.dmKey === (b as any).dmKey;
  const bs = b as Extract<CurrentChatContext, { type: "stream" }>;
  return a.streamId === bs.streamId && a.topic === bs.topic;
}

function parseChatContextFromPathname(options: {
  pathname: string;
  streamsMap: Map<number, { name: string }>;
  currentUserId: number | null;
}): CurrentChatContext | null {
  const { pathname, streamsMap, currentUserId } = options;

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

export function useSyncChatContextFromLocation(): void {
  const location = useLocation();
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const storeContext = useCurrentChatMessagesStore((s) => s.context);

  useEffect(() => {
    const next = parseChatContextFromPathname({
      pathname: location.pathname,
      streamsMap,
      currentUserId,
    });
    if (isSameContext(storeContext, next)) return;
    useCurrentChatMessagesStore.getState().setContextFromNavigation(next);
  }, [location.pathname, streamsMap, currentUserId, storeContext]);
}

