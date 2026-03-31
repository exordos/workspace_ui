import { useMemo } from "react";
import type { ZulipInstance } from "~/entities/instance/instance.model";
import type { StreamWithLast } from "~/widgets/sidebar/sidebar.types";
import { computeInstanceUnreadCount } from "./layout-instance-unread.lib";
import { buildActiveChatWindowTitle } from "./layout-instance-unread.lib";
import { getDmById, parseStreamSlug } from "~/widgets/sidebar/sidebar.lib";
import type { SidebarChat } from "~/shared/types/sidebar-chat";

export function useLayoutUnreadAndTitle(options: {
  instances: ZulipInstance[];
  currentInstanceId: string | null;
  streams: StreamWithLast[];
  dms: SidebarChat[];
  streamsMap: Map<number, { name: string }>;
  activeStreamSlug: string | undefined;
  activeTopic: string | null;
  dmIdParam: string | undefined;
}): {
  realmIcon: string | undefined;
  unreadCount: number;
  activeChatWindowTitle: string | null;
} {
  const {
    instances,
    currentInstanceId,
    streams,
    dms,
    streamsMap,
    activeStreamSlug,
    activeTopic,
    dmIdParam,
  } = options;

  const realmIcon = useMemo(
    () => instances.find((instance) => instance.id === currentInstanceId)?.realmIcon,
    [instances, currentInstanceId],
  );

  const unreadCount = useMemo(
    () =>
      computeInstanceUnreadCount({
        streams,
        dms,
      }),
    [streams, dms],
  );

  const activeStreamNameForTitle = useMemo(() => {
    if (!activeStreamSlug) return null;
    const parsedActiveStream = parseStreamSlug(activeStreamSlug);
    if (parsedActiveStream.stream_id != null) {
      return streamsMap.get(parsedActiveStream.stream_id)?.name ?? parsedActiveStream.stream_name;
    }
    return parsedActiveStream.stream_name;
  }, [activeStreamSlug, streamsMap]);

  const activeDmChatForTitle = useMemo(
    () => (dmIdParam != null && dmIdParam !== "" ? getDmById(dmIdParam, dms as any) : undefined),
    [dmIdParam, dms],
  );

  const activeChatWindowTitle = useMemo(
    () =>
      buildActiveChatWindowTitle({
        dmName: (activeDmChatForTitle as any)?.name,
        streamName: activeStreamNameForTitle,
        topicName: activeTopic,
      }),
    [activeDmChatForTitle, activeStreamNameForTitle, activeTopic],
  );

  return { realmIcon, unreadCount, activeChatWindowTitle };
}

