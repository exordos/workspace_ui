import { useMemo } from "react";
import { useUserProfileStore } from "~/features/user-profile/user-profile.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";
import type { SidebarChat } from "~/widgets/sidebar/sidebar.types";
import { buildRightPanelMedia } from "./layout-media.lib";
import { buildRightPanelCommonGroups, buildRightPanelUserInfo } from "./layout-right-panel.lib";

const EMPTY_RIGHT_PANEL_MEDIA_MESSAGES: MockMessage[] = [];

export function useLayoutRightPanelUser(options: {
  rightDrawerTargetUserId: number | undefined;
  dmChat: Extract<SidebarChat, { type: "dm" }> | undefined;
  dms: SidebarChat[];
  currentInstanceRealm: string | undefined;
}): RightPanelUserInfo | undefined {
  const { rightDrawerTargetUserId, dmChat, dms, currentInstanceRealm } = options;

  const detailedProfile = useUserProfileStore((s) => s.profile);

  const rightPanelMedia = useMemo(
    () =>
      rightDrawerTargetUserId != null
        ? buildRightPanelMedia(EMPTY_RIGHT_PANEL_MEDIA_MESSAGES)
        : undefined,
    [rightDrawerTargetUserId],
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
      userFromStore: undefined,
      detailedProfile: detailedProfile ?? undefined,
      dmChat,
      rightDrawerTargetUserId: rightDrawerTargetUserId ?? null,
      userStatusLabel: undefined,
      currentInstanceRealm,
      media: rightPanelMedia,
      commonGroups: rightPanelCommonGroups,
    });
  }, [
    detailedProfile,
    dmChat,
    rightDrawerTargetUserId,
    currentInstanceRealm,
    rightPanelMedia,
    rightPanelCommonGroups,
  ]);
}
