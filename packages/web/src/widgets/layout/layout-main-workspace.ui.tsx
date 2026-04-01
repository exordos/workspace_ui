import React from "react";
import { Outlet } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { RightDrawer } from "~/widgets/right-panel/right-drawer.ui";
import { RightPanelShell as RightPanel } from "~/widgets/right-panel/right-panel-shell.ui";
import { SidebarShell } from "~/widgets/sidebar/sidebar-shell.ui";
import type { LayoutMainWorkspaceProps } from "./layout-main-workspace.types";

export const LayoutMainWorkspace = React.memo(function LayoutMainWorkspace({
  shouldShowChatShell,
  sidebarOpen,
  rightDrawerOpen,
  rightDrawerMode,
  onCloseRightDrawer,
  rightPanelTitle,
  participantsCount,
  onlineCount,
  rightPanelUser,
  onSelectCommonGroup,
  onOpenSettingsDrawer,
  onOpenAboutDrawer,
}: LayoutMainWorkspaceProps) {
  const showRightPanel =
    rightDrawerOpen &&
    (rightDrawerMode === "settings" ||
      rightDrawerMode === "user-menu" ||
      rightDrawerMode === "about" ||
      shouldShowChatShell);

  return (
    <div className="flex min-h-0 flex-1 items-stretch justify-center">
      <div className="flex min-h-0 w-full min-w-0 max-w-main-workspace gap-1">
        {shouldShowChatShell && sidebarOpen && (
          <>
            <SidebarShell />
          </>
        )}
        <main
          className="flex min-h-0 min-w-0 flex-1 items-stretch justify-start overflow-hidden"
          data-focus-zone="main"
          role="main"
          aria-label={t("nav.messenger")}
        >
          <Outlet />
        </main>
        {showRightPanel && (
          <RightDrawer onClose={onCloseRightDrawer}>
            <RightPanel
              mode={rightDrawerMode}
              title={rightPanelTitle}
              participantsCount={participantsCount}
              onlineCount={onlineCount}
              user={rightPanelUser}
              onSelectCommonGroup={onSelectCommonGroup}
              onOpenSettingsDrawer={onOpenSettingsDrawer}
              onOpenAboutDrawer={onOpenAboutDrawer}
            />
          </RightDrawer>
        )}
      </div>
    </div>
  );
});
