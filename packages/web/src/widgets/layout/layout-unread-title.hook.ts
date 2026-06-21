import { useMemo } from "react";
import { resolvePersonalDmSidebarTitle } from "~/entities/chat-list/chat-list-format.lib";
import type { WorkspaceInstance } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { normalizeDmRouteUserIds } from "~/shared/lib/dm-route.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { getDmById, parseDmSlugToUserIds, parseStreamSlug } from "~/widgets/sidebar/sidebar.lib";
import type { StreamWithLast } from "~/widgets/sidebar/sidebar.types";
import {
  computeInstanceUnreadCount,
  buildActiveChatWindowTitle,
} from "./layout-instance-unread.lib";

type DmSidebarChat = Extract<SidebarChat, { type: "dm" }>;

export function useLayoutUnreadAndTitle(options: {
  instances: WorkspaceInstance[];
  currentInstanceId: string | null;
  streams: StreamWithLast[];
  dms: SidebarChat[];
  streamsMap: Map<number, { name: string }>;
  activeStreamSlug: string | undefined;
  activeTopic: string | null;
  dmIdParam: string | undefined;
  currentUserId: UserId | null;
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
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
    currentUserId,
    isStreamMuted,
    isEffectivelyMuted,
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
        isStreamMuted,
        isEffectivelyMuted,
      }),
    [streams, dms, isStreamMuted, isEffectivelyMuted],
  );

  const activeStreamNameForTitle = useMemo(() => {
    if (!activeStreamSlug) return null;
    const parsedActiveStream = parseStreamSlug(activeStreamSlug);
    if (!parsedActiveStream) return null;
    return streamsMap.get(parsedActiveStream.stream_id)?.name ?? parsedActiveStream.stream_name;
  }, [activeStreamSlug, streamsMap]);

  const activeDmChatForTitle = useMemo((): DmSidebarChat | undefined => {
    if (dmIdParam == null || dmIdParam === "") return undefined;
    const dmOnly = dms.filter((c): c is DmSidebarChat => c.type === "dm");
    return getDmById(dmIdParam, dmOnly);
  }, [dmIdParam, dms]);

  const dmRecipientIdsForTitle = useMemo(() => {
    if (dmIdParam == null || dmIdParam === "") return [];
    const raw = parseDmSlugToUserIds(dmIdParam);
    if (raw.length > 0) {
      return normalizeDmRouteUserIds(raw, currentUserId);
    }
    if (activeDmChatForTitle?.userIds != null && activeDmChatForTitle.userIds.length > 0) {
      return activeDmChatForTitle.userIds;
    }
    if (activeDmChatForTitle?.userUuid != null && activeDmChatForTitle.userUuid.trim().length > 0) {
      return [activeDmChatForTitle.userUuid];
    }
    return [];
  }, [dmIdParam, currentUserId, activeDmChatForTitle]);

  const isDmRouteForTitle = dmRecipientIdsForTitle.length > 0;

  const dmTitlePartnerId = isDmRouteForTitle
    ? (dmRecipientIdsForTitle[0] ?? activeDmChatForTitle?.id ?? null)
    : null;
  const dmTitlePartnerUser = useUsersStore((s) =>
    dmTitlePartnerId != null ? s.getUser(dmTitlePartnerId) : undefined,
  );
  const dmTitleStoreDisplayName = useUsersStore((s) =>
    dmTitlePartnerId != null ? s.getDisplayName(dmTitlePartnerId) : "Unknown",
  );

  const resolvedDmNameForTitle = useMemo(() => {
    if (!isDmRouteForTitle) {
      return undefined;
    }
    if (dmTitlePartnerId == null) {
      return undefined;
    }
    return resolvePersonalDmSidebarTitle({
      chatName: activeDmChatForTitle?.name ?? "",
      userFullName: dmTitlePartnerUser?.full_name,
      storeDisplayName: dmTitleStoreDisplayName,
    });
  }, [
    isDmRouteForTitle,
    activeDmChatForTitle,
    dmTitlePartnerId,
    dmTitlePartnerUser?.full_name,
    dmTitleStoreDisplayName,
  ]);

  const activeChatWindowTitle = useMemo(
    () =>
      buildActiveChatWindowTitle({
        dmName: resolvedDmNameForTitle,
        streamName: activeStreamNameForTitle,
        topicName: activeTopic,
      }),
    [resolvedDmNameForTitle, activeStreamNameForTitle, activeTopic],
  );

  return { realmIcon, unreadCount, activeChatWindowTitle };
}
