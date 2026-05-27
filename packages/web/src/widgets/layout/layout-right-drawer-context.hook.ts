import { useMemo } from "react";
import { resolvePersonalDmSidebarTitle } from "~/entities/chat-list/chat-list-format.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { computeIsGroupDmView, normalizeDmRouteUserIds } from "~/shared/lib/dm-route.lib";
import {
  getDmById,
  parseDmSlugToUserIds,
  parseStreamSlug,
  resolveStreamRouteFromSlug,
} from "~/widgets/sidebar/sidebar.lib";
import type { SidebarChat } from "~/widgets/sidebar/sidebar.types";
import type {
  LayoutRightDrawerContext,
  UseLayoutRightDrawerContextOptions,
} from "./layout-right-drawer-context.types";

export type { LayoutRightDrawerContext } from "./layout-right-drawer-context.types";

export function useLayoutRightDrawerContext(
  options: UseLayoutRightDrawerContextOptions,
): LayoutRightDrawerContext {
  const {
    streams,
    dms,
    streamsMap,
    activeStreamSlug,
    activeTopic,
    dmIdParam,
    currentUserId,
    rightDrawerUserIdOverride,
    rightDrawerOverrideUserName,
    rightDrawerOpen,
  } = options;

  const parsedStream = useMemo(
    () => (activeStreamSlug ? parseStreamSlug(activeStreamSlug) : null),
    [activeStreamSlug],
  );

  const { resolvedStreamName, resolvedStreamId } = useMemo(
    () => resolveStreamRouteFromSlug(parsedStream, streamsMap),
    [parsedStream, streamsMap],
  );

  const activeStreamId = resolvedStreamId;

  const activeStreamName = useMemo(() => {
    if (activeStreamId == null) {
      return resolvedStreamName.length > 0 ? resolvedStreamName : null;
    }
    return (streamsMap.get(activeStreamId)?.name ?? resolvedStreamName) || "";
  }, [activeStreamId, resolvedStreamName, streamsMap]);

  const dmChats = useMemo(() => {
    return dms.filter((c): c is Extract<SidebarChat, { type: "dm" }> => c.type === "dm");
  }, [dms]);

  const dmChat = useMemo(() => {
    return dmIdParam != null && dmIdParam !== "" ? getDmById(dmIdParam, dmChats) : undefined;
  }, [dmIdParam, dmChats]);

  const rawDmUserIds = useMemo(
    () => (dmIdParam != null && dmIdParam !== "" ? parseDmSlugToUserIds(dmIdParam) : []),
    [dmIdParam],
  );

  const dmRecipientIds = useMemo(
    () => normalizeDmRouteUserIds(rawDmUserIds, currentUserId),
    [rawDmUserIds, currentUserId],
  );

  const isGroupDm = useMemo(
    () => computeIsGroupDmView(dmChat, dmRecipientIds, currentUserId),
    [dmChat, dmRecipientIds, currentUserId],
  );

  const partnerUserId = useMemo(() => {
    if (isGroupDm) return undefined;
    return dmRecipientIds[0] ?? dmChat?.id;
  }, [isGroupDm, dmRecipientIds, dmChat?.id]);

  const partnerUserRecord = useUsersStore((s) =>
    partnerUserId != null ? s.getUser(partnerUserId) : undefined,
  );
  const partnerStoreDisplayName = useUsersStore((s) =>
    partnerUserId != null ? s.getDisplayName(partnerUserId) : "Unknown",
  );

  const rightDrawerTargetUserId = rightDrawerUserIdOverride ?? partnerUserId;

  const dmParticipantIds = useMemo(() => {
    if (dmIdParam == null || dmIdParam === "") return [];
    const isGroup = computeIsGroupDmView(dmChat, dmRecipientIds, currentUserId);

    if (isGroup) {
      if (dmChat?.userIds != null && dmChat.userIds.length > 0) {
        return dmChat.userIds;
      }
      const raw =
        dmChat != null ? parseDmSlugToUserIds(dmChat.slug) : parseDmSlugToUserIds(dmIdParam);
      if (currentUserId != null) {
        return Array.from(new Set([...raw, currentUserId]));
      }
      return raw;
    }

    if (currentUserId != null && dmRecipientIds.length > 0) {
      return Array.from(new Set([...dmRecipientIds, currentUserId]));
    }
    if (dmRecipientIds.length > 0) {
      return dmRecipientIds;
    }
    return parseDmSlugToUserIds(dmIdParam);
  }, [dmChat, dmIdParam, dmRecipientIds, currentUserId]);

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
      return resolvePersonalDmSidebarTitle({
        chatName: dmChat?.name ?? "",
        userFullName: partnerUserRecord?.full_name,
        storeDisplayName: partnerStoreDisplayName,
      });
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
    partnerStoreDisplayName,
    partnerUserRecord?.full_name,
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
