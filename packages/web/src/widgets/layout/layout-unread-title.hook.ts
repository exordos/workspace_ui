import { useMemo } from "react";
import { resolvePersonalDmSidebarTitle } from "~/entities/chat-list/chat-list-format.lib";
import type { WorkspaceInstance } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { normalizeDmRouteUserIds } from "~/shared/lib/dm-route.lib";
import { decodeTopicFromRoute } from "~/shared/lib/topic-identity.lib";
import { formatTopicDoneLabel } from "~/shared/lib/topic-resolve";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { getDmById, parseDmSlugToUserIds, parseStreamSlug } from "~/widgets/sidebar/sidebar.lib";
import { buildActiveChatWindowTitle } from "./layout-instance-unread.lib";

type DmSidebarChat = Extract<SidebarChat, { type: "dm" }>;

interface TitleTopicEntry {
  subject: string;
  topicUuid?: string;
  isDone?: boolean;
}

interface TitleStreamEntry {
  name: string;
  topics?: Map<string, TitleTopicEntry>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeRouteUuid(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function decodeTitleTopicFromRoute(topicSegment: string): string {
  try {
    return decodeTopicFromRoute(decodeURIComponent(topicSegment));
  } catch {
    return decodeTopicFromRoute(topicSegment);
  }
}

export function resolveActiveTopicTitle(
  activeTopic: string | null,
  streamEntry: TitleStreamEntry | undefined,
): string | null {
  if (activeTopic == null) return null;
  const decoded = decodeTitleTopicFromRoute(activeTopic);
  const routeTopicUuid = normalizeRouteUuid(decoded);
  if (streamEntry?.topics != null) {
    for (const topic of streamEntry.topics.values()) {
      const topicUuid = topic.topicUuid != null ? normalizeRouteUuid(topic.topicUuid) : null;
      if (routeTopicUuid != null && topicUuid === routeTopicUuid) {
        return formatTopicDoneLabel(topic.subject, topic.isDone === true);
      }
      if (topic.subject === decoded) {
        return formatTopicDoneLabel(topic.subject, topic.isDone === true);
      }
    }
  }
  return decoded;
}

export function useLayoutUnreadAndTitle(options: {
  instances: WorkspaceInstance[];
  currentInstanceId: string | null;
  unreadCount: number;
  dms: SidebarChat[];
  streamsMap: ReadonlyMap<string, TitleStreamEntry>;
  activeStreamSlug: string | undefined;
  activeTopic: string | null;
  dmIdParam: string | undefined;
  currentUserId: UserId | null;
}): {
  realmIcon: string | undefined;
  unreadCount: number;
  activeChatWindowTitle: string | null;
} {
  const {
    instances,
    currentInstanceId,
    unreadCount,
    dms,
    streamsMap,
    activeStreamSlug,
    activeTopic,
    dmIdParam,
    currentUserId,
  } = options;

  const realmIcon = useMemo(
    () => instances.find((instance) => instance.id === currentInstanceId)?.realmIcon,
    [instances, currentInstanceId],
  );

  const activeStreamEntryForTitle = useMemo(() => {
    if (!activeStreamSlug) return null;
    const parsedActiveStream = parseStreamSlug(activeStreamSlug);
    if (!parsedActiveStream) return null;
    return {
      streamUuid: parsedActiveStream.streamUuid,
      entry: streamsMap.get(parsedActiveStream.streamUuid),
    };
  }, [activeStreamSlug, streamsMap]);

  const activeStreamNameForTitle =
    activeStreamEntryForTitle?.entry?.name ?? activeStreamEntryForTitle?.streamUuid ?? null;

  const activeTopicNameForTitle = useMemo(
    () => resolveActiveTopicTitle(activeTopic, activeStreamEntryForTitle?.entry),
    [activeTopic, activeStreamEntryForTitle?.entry],
  );

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
        topicName: activeTopicNameForTitle,
      }),
    [resolvedDmNameForTitle, activeStreamNameForTitle, activeTopicNameForTitle],
  );

  return { realmIcon, unreadCount, activeChatWindowTitle };
}
