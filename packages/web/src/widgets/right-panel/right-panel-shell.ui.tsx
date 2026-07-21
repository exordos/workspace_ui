import React, { useCallback, useEffect, useState } from "react";
import { t } from "~/i18n/i18n";
import { RightPanelAbout } from "./right-panel-about.ui";
import { RightPanelBuilds } from "./right-panel-builds.ui";
import { RightPanelUserMenu } from "./right-panel-user-menu.ui";
import { RightPanelWorkspaceInfo } from "./right-panel-workspace-info.ui";
import type { RightPanelProps } from "./right-panel.types";

export const RightPanelShell: React.FC<RightPanelProps> = ({ mode = "info", ...props }) => {
  const [menuSubview, setMenuSubview] = useState<"menu" | "about" | "builds">("menu");

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

  if (mode === "settings" || mode === "user-menu") {
    if (menuSubview === "about") return <RightPanelAbout />;
    if (menuSubview === "builds") return <RightPanelBuilds />;

    return (
      <RightPanelUserMenu
        onOpenAboutDrawer={handleOpenAbout}
        onOpenBuildsDrawer={handleOpenBuilds}
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
