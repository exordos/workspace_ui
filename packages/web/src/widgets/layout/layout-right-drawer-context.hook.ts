import { useMemo } from "react";
import { t } from "~/i18n/i18n";
import { getDmById, parseDmSlugToUserIds, parseStreamSlug } from "~/widgets/sidebar/sidebar.lib";
import type { SidebarChat, StreamWithLast } from "~/widgets/sidebar/sidebar.types";

export interface LayoutRightDrawerContext {
  title: string;
  rightDrawerTargetUserId: number | undefined;
  partnerUserId: number | undefined;
  dmChat: Extract<SidebarChat, { type: "dm" }> | undefined;
  dmParticipantIds: number[];
  activeStreamId: number | null;
  activeStreamName: string | null;
}

export function useLayoutRightDrawerContext(options: {
  streams: StreamWithLast[];
  dms: SidebarChat[];
  streamsMap: Map<number, { name: string }>;
  activeStreamSlug: string | undefined;
  activeTopic: string | null;
  dmIdParam: string | undefined;
  currentUserId: number | null;
  rightDrawerMode: "info" | "settings" | "user-menu" | "about" | "builds";
  rightDrawerUserIdOverride: number | null;
  rightDrawerOverrideUserName: string | undefined;
  rightDrawerOpen: boolean;
}): LayoutRightDrawerContext {
  const {
    streams,
    dms,
    streamsMap,
    activeStreamSlug,
    activeTopic,
    dmIdParam,
    currentUserId,
    rightDrawerMode,
    rightDrawerUserIdOverride,
    rightDrawerOverrideUserName,
    rightDrawerOpen,
  } = options;

  const parsedStream = useMemo(
    () => (activeStreamSlug ? parseStreamSlug(activeStreamSlug) : null),
    [activeStreamSlug],
  );
  const activeStreamId = parsedStream?.stream_id ?? null;

  const activeStreamName = useMemo(() => {
    if (activeStreamId == null) return parsedStream?.stream_name ?? null;
    return streamsMap.get(activeStreamId)?.name ?? parsedStream?.stream_name ?? "";
  }, [activeStreamId, parsedStream?.stream_name, streamsMap]);

  const dmChats = useMemo(() => {
    return dms.filter((c): c is Extract<SidebarChat, { type: "dm" }> => c.type === "dm");
  }, [dms]);

  const dmChat = useMemo(() => {
    return dmIdParam != null && dmIdParam !== "" ? getDmById(dmIdParam, dmChats) : undefined;
  }, [dmIdParam, dmChats]);

  const isGroupDm = dmChat?.isGroup === true;
  const partnerUserId = dmChat && !dmChat.isGroup ? dmChat.id : undefined;

  const rightDrawerTargetUserId = rightDrawerUserIdOverride ?? partnerUserId;

  const dmParticipantIds = useMemo(() => {
    if (!dmChat) return [];
    if (dmChat.userIds != null && dmChat.userIds.length > 0) {
      return dmChat.userIds;
    }
    const parsedUserIds = parseDmSlugToUserIds(dmChat.slug);
    if (dmChat.isGroup && currentUserId != null) {
      return Array.from(new Set([...parsedUserIds, currentUserId]));
    }
    return parsedUserIds;
  }, [dmChat, currentUserId]);

  const title = useMemo(() => {
    if (!rightDrawerOpen) {
      // Title is irrelevant when drawer is closed; keep stable placeholder.
      return "";
    }
    if (rightDrawerUserIdOverride != null) {
      const name = rightDrawerOverrideUserName?.trim();
      return name != null && name.length > 0 ? name : `User #${rightDrawerUserIdOverride}`;
    }
    if (dmIdParam != null && dmIdParam !== "") {
      if (isGroupDm) {
        return (dmChat?.name?.trim() ?? "") || t("dm.groupChat");
      }
      return t("dm.privateChat");
    }
    if (activeStreamName && activeStreamName.trim().length > 0) {
      return `#${activeStreamName}`;
    }
    // Note: we intentionally don’t try to guess topic title here; window title handles topic separately.
    void activeTopic;
    void streams;
    return t("chat.generalChat");
  }, [
    activeStreamName,
    activeTopic,
    dmChat?.name,
    dmIdParam,
    isGroupDm,
    rightDrawerOpen,
    rightDrawerOverrideUserName,
    rightDrawerUserIdOverride,
    streams,
  ]);

  return {
    title,
    rightDrawerTargetUserId,
    partnerUserId,
    dmChat,
    dmParticipantIds,
    activeStreamId,
    activeStreamName,
  };
}

