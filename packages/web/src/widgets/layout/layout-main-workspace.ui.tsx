import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { RightDrawer } from "~/widgets/right-panel/right-drawer.ui";
import { RightPanelShell as RightPanel } from "~/widgets/right-panel/right-panel-shell.ui";
import { SidebarShell } from "~/widgets/sidebar/sidebar-shell.ui";
import {
  clampLayoutSidebarWidth,
  getLayoutSidebarWidthBounds,
  loadLayoutSidebarWidth,
  saveLayoutSidebarWidth,
} from "./layout-sidebar-width.lib";
import type { LayoutMainWorkspaceProps } from "./layout-main-workspace.types";

export const LayoutMainWorkspace = React.memo(function LayoutMainWorkspace({
  shouldShowChatShell,
  pathname,
  sidebarOpen,
  rightDrawerOpen,
  rightDrawerMode,
  onCloseRightDrawer,
  rightPanelTitle,
  participantsCount,
  onlineCount,
  workspaceRightPanelInfo,
  onOpenSettingsDrawer,
  onOpenAboutDrawer,
}: LayoutMainWorkspaceProps) {
  const showRightPanel =
    rightDrawerOpen &&
    (rightDrawerMode === "settings" ||
      rightDrawerMode === "user-menu" ||
      rightDrawerMode === "about" ||
      shouldShowChatShell);
  const stickRightPanelToChatContent = shouldShowChatShell && showRightPanel;
  const [sidebarPreferredWidth, setSidebarPreferredWidth] = useState(() =>
    loadLayoutSidebarWidth(),
  );
  const [sidebarBounds, setSidebarBounds] = useState(() => getLayoutSidebarWidthBounds());
  const sidebarWidth = clampLayoutSidebarWidth(sidebarPreferredWidth, sidebarBounds);
  const dragStartRef = useRef<{ pointerX: number; width: number } | null>(null);
  const mainClassName = [
    "flex min-h-0 min-w-0 flex-1 items-stretch justify-start overflow-hidden",
    stickRightPanelToChatContent ? "max-w-chat-page" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const sidebarStyle = useMemo<React.CSSProperties>(
    () => ({
      width: sidebarWidth,
      minWidth: sidebarBounds.min,
      maxWidth: sidebarBounds.max,
    }),
    [sidebarBounds.max, sidebarBounds.min, sidebarWidth],
  );

  const commitSidebarWidth = useCallback(
    (width: number) => {
      const nextWidth = clampLayoutSidebarWidth(width, sidebarBounds);
      setSidebarPreferredWidth(nextWidth);
      saveLayoutSidebarWidth(nextWidth, undefined, sidebarBounds);
    },
    [sidebarBounds],
  );

  const handleResizeMove = useCallback(
    (event: PointerEvent) => {
      const dragStart = dragStartRef.current;
      if (dragStart == null) return;
      commitSidebarWidth(dragStart.width + event.clientX - dragStart.pointerX);
    },
    [commitSidebarWidth],
  );

  const stopResize = useCallback(() => {
    dragStartRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", stopResize);
    window.removeEventListener("pointercancel", stopResize);
  }, [handleResizeMove]);

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragStartRef.current = {
        pointerX: event.clientX,
        width: sidebarWidth,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handleResizeMove);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    },
    [handleResizeMove, sidebarWidth, stopResize],
  );

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 40 : 16;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commitSidebarWidth(sidebarWidth - step);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        commitSidebarWidth(sidebarWidth + step);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        commitSidebarWidth(sidebarBounds.min);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        commitSidebarWidth(sidebarBounds.max);
      }
    },
    [commitSidebarWidth, sidebarBounds.max, sidebarBounds.min, sidebarWidth],
  );

  useEffect(() => stopResize, [stopResize]);

  useEffect(() => {
    const handleResize = () => {
      setSidebarBounds(getLayoutSidebarWidthBounds());
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 items-stretch justify-center">
      <div className="flex min-h-0 w-full min-w-0 max-w-main-workspace gap-1">
        {shouldShowChatShell && sidebarOpen && (
          <SidebarShell
            sidebarStyle={sidebarStyle}
            pathname={pathname}
            sidebarResizeControl={
              <div
                aria-label={t("layout.resizeSidebar")}
                aria-orientation="vertical"
                aria-valuemax={sidebarBounds.max}
                aria-valuemin={sidebarBounds.min}
                aria-valuenow={sidebarWidth}
                className="absolute -right-1 top-0 z-base h-full w-2 cursor-col-resize touch-none border-0 bg-transparent p-0 outline-none after:absolute after:left-1/2 after:top-3 after:h-[calc(100%-1.5rem)] after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-border-subtle after:opacity-0 after:transition-opacity hover:after:bg-accent hover:after:opacity-100 focus-visible:after:bg-accent focus-visible:after:opacity-100 active:after:bg-accent active:after:opacity-100"
                onKeyDown={handleResizeKeyDown}
                onPointerDown={startResize}
                role="slider"
                tabIndex={0}
                title={t("layout.resizeSidebar")}
              />
            }
          />
        )}
        <main
          className={mainClassName}
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
              workspaceInfo={workspaceRightPanelInfo}
              onOpenSettingsDrawer={onOpenSettingsDrawer}
              onOpenAboutDrawer={onOpenAboutDrawer}
            />
          </RightDrawer>
        )}
      </div>
    </div>
  );
});
