import React from "react";
import { JitsiCallShell } from "~/features/jitsi-call/jitsi-call-shell.ui";
import { MediaViewerOverlay } from "~/features/media-viewer/media-viewer-overlay.ui";
import { t } from "~/i18n/i18n";
import { OpenSearchContext } from "~/shared/contexts/open-search";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { brand } from "~/shared/lib/brand";
import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";
import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";
import { TopBar } from "~/widgets/top-bar/top-bar.ui";
import { DESKTOP_MIN_VIEWPORT_STYLE } from "./layout-desktop-viewport.lib";
import { LayoutMainWorkspace } from "./layout-main-workspace.ui";

export interface LayoutAppShellProps {
  openSearch: () => void;
  online: boolean;
  rightDrawerOpen: boolean;
  setRightDrawerOpen: (open: boolean) => void;
  openRightDrawerUserProfile: (userId: number) => void;
  shouldShowChatShell: boolean;
  sidebarOpen: boolean;
  rightDrawerMode: RightDrawerMode;
  onCloseRightDrawer: () => void;
  rightPanelTitle: string;
  participantsCount: number;
  onlineCount: number;
  rightPanelUser: RightPanelUserInfo | undefined;
  onSelectCommonGroup: (slug: string) => void;
  onOpenSettingsDrawer: () => void;
  onOpenAboutDrawer: () => void;
}

export const LayoutAppShell = React.memo<LayoutAppShellProps>(function LayoutAppShell({
  openSearch,
  online,
  rightDrawerOpen,
  setRightDrawerOpen,
  openRightDrawerUserProfile,
  shouldShowChatShell,
  sidebarOpen,
  rightDrawerMode,
  onCloseRightDrawer,
  rightPanelTitle,
  participantsCount,
  onlineCount,
  rightPanelUser,
  onSelectCommonGroup,
  onOpenSettingsDrawer,
  onOpenAboutDrawer,
}) {
  return (
    <OpenSearchContext.Provider value={openSearch}>
      <RightDrawerContext.Provider
        value={{
          open: rightDrawerOpen,
          setOpen: setRightDrawerOpen,
          openUserProfile: openRightDrawerUserProfile,
        }}
      >
        <div
          className="flex h-screen max-h-[100dvh] min-h-app-shell flex-col items-stretch overflow-hidden bg-bg text-text-primary"
          role="application"
          aria-label={brand.appName}
          style={DESKTOP_MIN_VIEWPORT_STYLE}
        >
          {!online && (
            <div className="bg-notice-base/90 text-badge-text shrink-0 py-1 text-center text-xs">
              {t("app.offline")}
            </div>
          )}
          <MediaViewerOverlay />
          <JitsiCallShell />
          <TopBar />
          <LayoutMainWorkspace
            shouldShowChatShell={shouldShowChatShell}
            sidebarOpen={sidebarOpen}
            rightDrawerOpen={rightDrawerOpen}
            rightDrawerMode={rightDrawerMode}
            onCloseRightDrawer={onCloseRightDrawer}
            rightPanelTitle={rightPanelTitle}
            participantsCount={participantsCount}
            onlineCount={onlineCount}
            rightPanelUser={rightPanelUser}
            onSelectCommonGroup={onSelectCommonGroup}
            onOpenSettingsDrawer={onOpenSettingsDrawer}
            onOpenAboutDrawer={onOpenAboutDrawer}
          />
        </div>
      </RightDrawerContext.Provider>
    </OpenSearchContext.Provider>
  );
});
