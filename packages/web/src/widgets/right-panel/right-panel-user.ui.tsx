import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { ensureUserStatusLoaded } from "~/entities/user/api/user.api";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { useRightDrawerStore } from "./right-drawer.model";
import { RightPanelUserCommonGroups } from "./right-panel-user-common-groups.ui";
import { buildRightPanelUserContactRows } from "./right-panel-user-contact.lib";
import { RightPanelUserMediaList } from "./right-panel-user-media-list.ui";
import { RightPanelUserProfileHeader } from "./right-panel-user-profile-header.ui";
import { resolveAvatarSrc } from "./right-panel.lib";
import type { RightPanelUserProps } from "./right-panel-user.types";

export const RightPanelUser = React.memo(function RightPanelUser({
  user,
  onSelectCommonGroup,
  onOpenDirectMessage,
}: RightPanelUserProps) {
  const navigate = useNavigate();
  const media = user.media ?? {};
  const directMessageUserId = user.userId;
  const contactRows = buildRightPanelUserContactRows(user);
  const avatarSrc = resolveAvatarSrc(user.avatarUrl);
  const openMediaViewer = useMediaViewerStore((s) => s.open);
  const liveStatus = useUsersStore((s) =>
    user.userId != null ? s.getUser(user.userId)?.status : undefined,
  );
  const statusLabel = formatUserStatusLabel(liveStatus) ?? user.status;

  const handleOpenAvatarPreview = useCallback(() => {
    if (!avatarSrc) return;
    openMediaViewer([
      {
        url: avatarSrc,
        type: "image",
        alt: user.name,
      },
    ]);
  }, [avatarSrc, openMediaViewer, user.name]);

  const currentUserId = useChatListStore((s) => s.currentUserId);
  const isOwnProfile = currentUserId != null && directMessageUserId === currentUserId;
  const profileDmCallHandlerReady = useChatDmCallBridgeStore(
    (s) => s.invokeDmCallFromProfileHandler != null,
  );
  const handleProfileDmCall = useCallback(() => {
    if (directMessageUserId == null) return;
    useChatDmCallBridgeStore.getState().invokeDmCallFromProfile(directMessageUserId);
  }, [directMessageUserId]);
  const handleOpenOwnPersonalInfoSettings = useCallback(() => {
    void navigate(withCurrentOrgRoute("/settings/personal-info"));
  }, [navigate]);
  const handleAvatarAction = useCallback(() => {
    if (isOwnProfile) {
      handleOpenOwnPersonalInfoSettings();
      return;
    }
    handleOpenAvatarPreview();
  }, [handleOpenAvatarPreview, handleOpenOwnPersonalInfoSettings, isOwnProfile]);

  useEffect(() => {
    if (user.userId == null) {
      return;
    }
    void ensureUserStatusLoaded(user.userId);
  }, [user.userId]);

  const userIdOverride = useRightDrawerStore((s) => s.userIdOverride);
  const clearUserProfileOverride = useRightDrawerStore((s) => s.clearUserProfileOverride);
  const handleBackFromNestedProfile = useCallback(() => {
    clearUserProfileOverride();
  }, [clearUserProfileOverride]);
  const showBackToChatInfo = userIdOverride != null;

  const showProfileCallButton =
    profileDmCallHandlerReady &&
    currentUserId != null &&
    directMessageUserId != null &&
    directMessageUserId !== currentUserId &&
    user.isActive !== false;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <ScrollArea className="flex-1 px-4 py-3">
        <RightPanelUserProfileHeader
          user={user}
          showBackToChatInfo={showBackToChatInfo}
          onBackFromNestedProfile={handleBackFromNestedProfile}
          avatarSrc={avatarSrc}
          isOwnProfile={isOwnProfile}
          statusLabel={statusLabel}
          contactRows={contactRows}
          directMessageUserId={directMessageUserId}
          onOpenDirectMessage={onOpenDirectMessage}
          showProfileCallButton={showProfileCallButton}
          onProfileDmCall={handleProfileDmCall}
          onAvatarAction={handleAvatarAction}
        />

        <div className="space-y-4 pt-3">
          <RightPanelUserMediaList
            media={{
              photos: media.photos ?? 0,
              videos: media.videos ?? 0,
              files: media.files ?? 0,
              links: media.links ?? 0,
            }}
          />
          {user.commonGroups != null && user.commonGroups.length > 0 && (
            <RightPanelUserCommonGroups
              groups={user.commonGroups}
              onSelectCommonGroup={onSelectCommonGroup}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
