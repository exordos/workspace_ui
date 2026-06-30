import React, { useCallback, useMemo } from "react";
import {
  selectMessengerSidebarFolders,
  selectMessengerSidebarStreams,
} from "~/entities/messenger/messenger-sidebar.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerSidebarStreamItem } from "~/entities/messenger/messenger.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { FolderRail } from "~/widgets/folder-rail/folder-rail.ui";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { WorkspaceSidebar } from "./sidebar-workspace.ui";

const EMPTY_WORKSPACE_STREAMS: MessengerSidebarStreamItem[] = [];

interface SidebarShellProps {
  sidebarStyle?: React.CSSProperties;
  sidebarResizeControl?: React.ReactNode;
  pathname?: string;
}

export const SidebarShell: React.FC<SidebarShellProps> = ({
  sidebarStyle,
  sidebarResizeControl,
  pathname = "",
}) => {
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
  const setSelectedFolderId = useSidebarConfigStore((s) => s.setSelectedFolderId);
  const workspaceRoute = parseWorkspaceMessengerRoute(pathname);
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const workspaceRuntimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const sidebarWorkspaceIdentity =
    workspaceRoute != null
      ? { organizationId: workspaceRoute.orgId, projectId: workspaceRoute.projectId }
      : workspaceRuntimeContext != null
        ? {
            organizationId: workspaceRuntimeContext.organizationId,
            projectId: workspaceRuntimeContext.projectId,
          }
        : null;
  const workspaceFolders = useMessengerStore(selectMessengerSidebarFolders);
  const workspaceSelectedFolderId = useSidebarConfigStore((s) => s.selectedFolderId);
  const workspaceEffectiveFolderId = workspaceFolders.some(
    (folder) => folder.folderUuid === workspaceSelectedFolderId,
  )
    ? workspaceSelectedFolderId
    : (workspaceFolders.find((folder) => folder.systemType === "all")?.folderUuid ??
      workspaceFolders[0]?.folderUuid ??
      null);
  const workspaceStreams = useMessengerStore((state) =>
    sidebarWorkspaceIdentity != null
      ? selectMessengerSidebarStreams(state, {
          organizationId: sidebarWorkspaceIdentity.organizationId,
          projectId: sidebarWorkspaceIdentity.projectId,
          selectedFolderUuid: workspaceEffectiveFolderId,
        })
      : EMPTY_WORKSPACE_STREAMS,
  );
  const workspaceLoading = useMessengerStore((state) => state.isLoading);
  const workspaceError = useMessengerStore((state) => state.error);
  const workspaceRailFolders = workspaceFolders.map((folder) => ({
    id: folder.folderUuid,
    label: folder.title,
    backgroundColor: folder.backgroundColorValue ?? 0,
    badge: folder.unreadCount > 0 ? folder.unreadCount : undefined,
    systemType: folder.systemType ?? undefined,
  }));

  const sidebarFrame = (children: React.ReactNode) => (
    <div className="relative flex min-h-0 flex-shrink-0 self-stretch" style={sidebarStyle}>
      {children}
      {sidebarResizeControl}
    </div>
  );

  const handleSelectWorkspaceFolder = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId);
    },
    [setSelectedFolderId],
  );

  const workspaceFolderRail = (
    <FolderRail
      folders={workspaceRailFolders}
      selectedFolderId={workspaceEffectiveFolderId ?? "all"}
      onSelectFolder={handleSelectWorkspaceFolder}
      layout={folderRailLayout}
    />
  );

  if (folderRailLayout === "vertical") {
    return (
      <>
        <div className="flex min-h-0 flex-shrink-0 self-stretch">{workspaceFolderRail}</div>
        {sidebarFrame(
          <WorkspaceSidebar
            streams={workspaceStreams}
            loading={workspaceLoading}
            error={workspaceError}
          />,
        )}
      </>
    );
  }

  return sidebarFrame(
    <WorkspaceSidebar
      streams={workspaceStreams}
      loading={workspaceLoading}
      error={workspaceError}
      activityPanelBottomSlot={workspaceFolderRail}
    />,
  );
};
