import React from "react";
import { JitsiIncomingInviteHost } from "~/features/jitsi-call/jitsi-call-shell.ui";
import { MediaViewerOverlay } from "~/features/media-viewer/media-viewer-overlay.ui";
import { OpenSearchContext } from "~/shared/contexts/open-search";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { brand } from "~/shared/lib/brand";
import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";
import type { WorkspaceRightPanelInfoView } from "~/widgets/right-panel/right-panel.types";
import { TopBar } from "~/widgets/top-bar/top-bar.ui";
import { LayoutMainWorkspace } from "./layout-main-workspace.ui";

export interface LayoutAppShellProps {
  openSearch: () => void;
  rightDrawerOpen: boolean;
  setRightDrawerOpen: (open: boolean) => void;
  openRightDrawerInfo: () => void;
  openRightDrawerUserProfile: (userId: number) => void;
  openWorkspaceUserProfile: (userUuid: string) => void;
  shouldShowChatShell: boolean;
  pathname: string;
  sidebarOpen: boolean;
  rightDrawerMode: RightDrawerMode;
  onCloseRightDrawer: () => void;
  /** Shell back control for nested drawer modes (e.g. personal-info → user-menu). */
  onBackRightDrawer?: () => void;
  /** Shell title shown next to the drawer close button. */
  rightDrawerTitle: string;
  rightPanelTitle: string;
  participantsCount: number;
  onlineCount: number;
  workspaceRightPanelInfo: WorkspaceRightPanelInfoView | null;
  onOpenSettingsDrawer: () => void;
  onOpenAboutDrawer: () => void;
  onOpenBuildsDrawer: () => void;
  onOpenPersonalInfoDrawer?: () => void;
}

export const LayoutAppShell = React.memo<LayoutAppShellProps>(function LayoutAppShell({
  openSearch,
  rightDrawerOpen,
  setRightDrawerOpen,
  openRightDrawerInfo,
  openRightDrawerUserProfile,
  openWorkspaceUserProfile,
  shouldShowChatShell,
  pathname,
  sidebarOpen,
  rightDrawerMode,
  onCloseRightDrawer,
  onBackRightDrawer,
  rightDrawerTitle,
  rightPanelTitle,
  participantsCount,
  onlineCount,
  workspaceRightPanelInfo,
  onOpenSettingsDrawer,
  onOpenAboutDrawer,
  onOpenBuildsDrawer,
  onOpenPersonalInfoDrawer,
}) {
  return (
    <OpenSearchContext.Provider value={openSearch}>
      <RightDrawerContext.Provider
        value={{
          open: rightDrawerOpen,
          setOpen: setRightDrawerOpen,
          openInfo: openRightDrawerInfo,
          openUserProfile: openRightDrawerUserProfile,
          openWorkspaceUserProfile,
        }}
      >
        <div
          className="flex min-h-0 w-full flex-1 flex-col items-stretch overflow-hidden bg-bg text-text-primary"
          role="application"
          aria-label={brand.appName}
        >
          <MediaViewerOverlay />
          <JitsiIncomingInviteHost />
          <TopBar />
          <LayoutMainWorkspace
            shouldShowChatShell={shouldShowChatShell}
            pathname={pathname}
            sidebarOpen={sidebarOpen}
            rightDrawerOpen={rightDrawerOpen}
            rightDrawerMode={rightDrawerMode}
            onCloseRightDrawer={onCloseRightDrawer}
            onBackRightDrawer={onBackRightDrawer}
            rightDrawerTitle={rightDrawerTitle}
            rightPanelTitle={rightPanelTitle}
            participantsCount={participantsCount}
            onlineCount={onlineCount}
            workspaceRightPanelInfo={workspaceRightPanelInfo}
            onOpenSettingsDrawer={onOpenSettingsDrawer}
            onOpenAboutDrawer={onOpenAboutDrawer}
            onOpenBuildsDrawer={onOpenBuildsDrawer}
            onOpenPersonalInfoDrawer={onOpenPersonalInfoDrawer}
          />
        </div>
      </RightDrawerContext.Provider>
    </OpenSearchContext.Provider>
  );
});
