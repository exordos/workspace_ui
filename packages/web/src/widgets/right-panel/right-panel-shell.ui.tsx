import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createWorkspaceRightPanelUserProfileView } from "~/entities/messenger/messenger-right-panel.lib";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { RightPanelAbout } from "./right-panel-about.ui";
import { RightPanelBuilds } from "./right-panel-builds.ui";
import { RightPanelUserMenu } from "./right-panel-user-menu.ui";
import { RightPanelUserProfile } from "./right-panel-user-profile.ui";
import { RightPanelWorkspaceInfo } from "./right-panel-workspace-info.ui";
import type { RightPanelProps } from "./right-panel.types";

type MenuSubview = "menu" | "about" | "builds" | "personal-info";

export const RightPanelShell: React.FC<RightPanelProps> = ({ mode = "info", ...props }) => {
  const [menuSubview, setMenuSubview] = useState<MenuSubview>("menu");
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const usersById = useUsersStore((state) => state.usersById);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );

  useEffect(() => {
    setMenuSubview("menu");
  }, [mode]);

  const handleOpenAbout = useCallback(() => {
    if (props.onOpenAboutDrawer != null) {
      props.onOpenAboutDrawer();
      return;
    }
    setMenuSubview("about");
  }, [props.onOpenAboutDrawer]);

  const handleOpenBuilds = useCallback(() => {
    if (props.onOpenBuildsDrawer != null) {
      props.onOpenBuildsDrawer();
      return;
    }
    setMenuSubview("builds");
  }, [props.onOpenBuildsDrawer]);

  const handleOpenPersonalInfo = useCallback(() => {
    if (props.onOpenPersonalInfoDrawer != null) {
      props.onOpenPersonalInfoDrawer();
      return;
    }
    setMenuSubview("personal-info");
  }, [props.onOpenPersonalInfoDrawer]);

  const handleBackToMenu = useCallback(() => {
    setMenuSubview("menu");
  }, []);

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
    if (menuSubview === "about") return <RightPanelAbout />;
    if (menuSubview === "builds") return <RightPanelBuilds />;
    if (menuSubview === "personal-info" && ownProfileInfo != null) {
      return (
        <RightPanelUserProfile
          info={ownProfileInfo}
          onBack={handleBackToMenu}
          headerTitle={t("settings.personalInfo")}
        />
      );
    }

    return (
      <RightPanelUserMenu
        onOpenAboutDrawer={handleOpenAbout}
        onOpenBuildsDrawer={handleOpenBuilds}
        onOpenPersonalInfo={handleOpenPersonalInfo}
      />
    );
  }

  if (mode === "about") return <RightPanelAbout />;
  if (mode === "builds") return <RightPanelBuilds />;

  if (props.workspaceInfo != null) {
    return <RightPanelWorkspaceInfo info={props.workspaceInfo} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center px-4 text-center text-sm text-text-secondary">
      {t("workspaceMessenger.rightPanelUnsupported")}
    </div>
  );
};
