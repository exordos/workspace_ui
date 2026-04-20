import { useMemo } from "react";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { selectUserStatusSnapshot } from "~/entities/user/user-status.hooks";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserProfileStore } from "~/features/user-profile/user-profile.model";
import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";
import type { SidebarChat } from "~/widgets/sidebar/sidebar.types";
import { buildRightPanelMedia } from "./layout-media.lib";
import { buildRightPanelCommonGroups, buildRightPanelUserInfo } from "./layout-right-panel.lib";

export function useLayoutRightPanelUser(options: {
  rightDrawerTargetUserId: number | undefined;
  dmChat: Extract<SidebarChat, { type: "dm" }> | undefined;
  dms: SidebarChat[];
  currentInstanceRealm: string | undefined;
}): RightPanelUserInfo | undefined {
  const { rightDrawerTargetUserId, dmChat, dms, currentInstanceRealm } = options;

  const userFromStore = useUsersStore((s) =>
    rightDrawerTargetUserId != null ? s.getUser(rightDrawerTargetUserId) : undefined,
  );
  const detailedProfile = useUserProfileStore((s) => s.profile);
  const currentChatMessages = useCurrentChatMessagesStore((s) => s.messages);

  const userStatusLabel = selectUserStatusSnapshot(userFromStore).statusLabel;

  const rightPanelMedia = useMemo(
    () => (rightDrawerTargetUserId != null ? buildRightPanelMedia(currentChatMessages) : undefined),
    [rightDrawerTargetUserId, currentChatMessages],
  );

  const rightPanelCommonGroups = useMemo(() => {
    if (rightDrawerTargetUserId == null) return undefined;
    const groups = buildRightPanelCommonGroups(
      dms as Extract<SidebarChat, { type: "dm" }>[],
      rightDrawerTargetUserId,
      dmChat?.slug,
    );
    return groups.length > 0 ? groups : undefined;
  }, [rightDrawerTargetUserId, dms, dmChat?.slug]);

  return useMemo(() => {
    return buildRightPanelUserInfo({
      userFromStore:
        userFromStore == null
          ? undefined
          : {
              ...userFromStore,
              avatar_url: userFromStore.avatar_url ?? undefined,
            },
      detailedProfile: detailedProfile ?? undefined,
      dmChat,
      rightDrawerTargetUserId: rightDrawerTargetUserId ?? null,
      userStatusLabel,
      currentInstanceRealm,
      media: rightPanelMedia,
      commonGroups: rightPanelCommonGroups,
    });
  }, [
    userFromStore,
    detailedProfile,
    dmChat,
    rightDrawerTargetUserId,
    userStatusLabel,
    currentInstanceRealm,
    rightPanelMedia,
    rightPanelCommonGroups,
  ]);
}

