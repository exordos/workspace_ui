import React, { useCallback, useMemo } from "react";
import { createWorkspaceRightPanelUserProfileView } from "~/entities/messenger/messenger-right-panel.lib";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { RightPanelAbout } from "./right-panel-about.ui";
import { RightPanelUserMenu } from "./right-panel-user-menu.ui";
import { RightPanelUserProfile } from "./right-panel-user-profile.ui";
import { RightPanelWorkspaceInfo } from "./right-panel-workspace-info.ui";
import type { RightPanelAccountScreen, RightPanelProps } from "./right-panel.types";

export const RightPanelShell: React.FC<RightPanelProps> = ({
  mode = "info",
  accountScreen,
  onAccountScreenChange,
  onOpenAboutDrawer,
  onOpenPersonalInfoDrawer,
  workspaceInfo,
}) => {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const usersById = useUsersStore((state) => state.usersById);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );

  const changeAccountScreen = useCallback(
    (screen: RightPanelAccountScreen) => {
      onAccountScreenChange(screen);
    },
    [onAccountScreenChange],
  );

  const handleOpenAbout = useCallback(() => {
    if (onOpenAboutDrawer != null) {
      onOpenAboutDrawer();
      return;
    }
    changeAccountScreen("about");
  }, [changeAccountScreen, onOpenAboutDrawer]);

  const handleOpenPersonalInfo = useCallback(() => {
    if (onOpenPersonalInfoDrawer != null) {
      onOpenPersonalInfoDrawer();
      return;
    }
    changeAccountScreen("personal-info");
  }, [changeAccountScreen, onOpenPersonalInfoDrawer]);

  const ownProfileInfo = useMemo(() => {
    const userUuid = runtimeContext?.userUuid?.trim() ?? "";
    if (userUuid.length === 0) return null;
    return createWorkspaceRightPanelUserProfileView({
      userUuid,
      usersById,
      currentUserUuid: userUuid,
      temporarilyNotConnectedText: t("workspaceMessenger.temporarilyNotConnected"),
    });
  }, [runtimeContext?.userUuid, usersById]);

  // Dedicated drawer mode: shell owns title + back; profile body has no nested header.
  if (mode === "personal-info" && ownProfileInfo != null) {
    return <RightPanelUserProfile info={ownProfileInfo} />;
  }

  if (mode === "settings" || mode === "user-menu") {
    if (accountScreen === "about") return <RightPanelAbout />;
    if (accountScreen === "personal-info" && ownProfileInfo != null) {
      return <RightPanelUserProfile info={ownProfileInfo} />;
    }

    return (
      <RightPanelUserMenu
        accountScreen={
          accountScreen === "settings" || accountScreen === "appearance" ? accountScreen : "root"
        }
        onAccountScreenChange={changeAccountScreen}
        onOpenAboutDrawer={handleOpenAbout}
        onOpenPersonalInfo={handleOpenPersonalInfo}
      />
    );
  }

  if (mode === "about") return <RightPanelAbout />;

  if (workspaceInfo != null) {
    return <RightPanelWorkspaceInfo info={workspaceInfo} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center px-4 text-center text-sm text-text-secondary">
      {t("workspaceMessenger.rightPanelUnsupported")}
    </div>
  );
};
