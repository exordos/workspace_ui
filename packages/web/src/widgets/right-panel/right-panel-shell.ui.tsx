import React, { useCallback, useEffect, useState } from "react";
import { t } from "~/i18n/i18n";
import { RightPanelAbout } from "./right-panel-about.ui";
import { RightPanelBuilds } from "./right-panel-builds.ui";
import { RightPanelInfo } from "./right-panel-info.ui";
import { RightPanelUserMenu } from "./right-panel-user-menu.ui";
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
        heading={mode === "settings" ? t("settings.settings") : undefined}
        onOpenAboutDrawer={handleOpenAbout}
        onOpenBuildsDrawer={handleOpenBuilds}
      />
    );
  }

  if (mode === "about") return <RightPanelAbout />;
  if (mode === "builds") return <RightPanelBuilds />;

  return <RightPanelInfo {...props} />;
};

