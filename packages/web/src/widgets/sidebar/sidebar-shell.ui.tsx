import React, { useCallback } from "react";
import {
  selectMessengerSidebarFolders,
  selectMessengerSidebarStreams,
} from "~/entities/messenger/messenger-sidebar.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerSidebarStreamItem } from "~/entities/messenger/messenger.types";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { selectSidebarChatsLoading } from "~/features/folder-sync/folder-sync.selectors";
import { useSettingsStore } from "~/features/settings/settings.model";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import type { FolderRailFoldersChangedDetail } from "~/widgets/folder-rail/folder-rail.types";
import { FolderRail } from "~/widgets/folder-rail/folder-rail.ui";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { WorkspaceSidebar } from "./sidebar-workspace.ui";
import { Sidebar } from "./sidebar.ui";

const EMPTY_WORKSPACE_STREAMS: MessengerSidebarStreamItem[] = [];

interface SidebarShellProps {
  sidebarStyle?: React.CSSProperties;
  sidebarResizeControl?: React.ReactNode;
  workspaceMessengerActive?: boolean;
  pathname?: string;
}

export const SidebarShell: React.FC<SidebarShellProps> = ({
  sidebarStyle,
  sidebarResizeControl,
  workspaceMessengerActive = false,
  pathname = "",
}) => {
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
  const folders = useFolderSyncStore((s) => s.folders);
  const sidebarChats = useFolderSyncStore((s) => s.selectedFolderSidebarChats);
  const sidebarChatsLoading = useFolderSyncStore(selectSidebarChatsLoading);
  const refreshFolderSync = useFolderSyncStore((s) => s.refresh);
  const applyLocallyCreatedFolder = useFolderSyncStore((s) => s.applyLocallyCreatedFolder);
  const applyLocallyDeletedFolder = useFolderSyncStore((s) => s.applyLocallyDeletedFolder);
  const selectFolderSync = useFolderSyncStore((s) => s.selectFolder);
  const selectedFolderId = useFolderSyncStore((s) => s.selectedFolderId);
  const setSelectedFolderId = useSidebarConfigStore((s) => s.setSelectedFolderId);
  // Shell выбирает, какой сайдбар показать.
  // Старый Sidebar читает folder-sync/Zulip данные, WorkspaceSidebar читает новый messenger store.
  const workspaceRoute = parseWorkspaceMessengerRoute(pathname);
  const workspaceFolders = useMessengerStore(selectMessengerSidebarFolders);
  const workspaceSelectedFolderId = useSidebarConfigStore((s) => s.selectedFolderId);
  // Если выбранная папка исчезла или ещё не загрузилась, мягко падаем на системную "all".
  const workspaceEffectiveFolderId =
    workspaceFolders.some((folder) => folder.folderUuid === workspaceSelectedFolderId)
      ? workspaceSelectedFolderId
      : (workspaceFolders.find((folder) => folder.systemType === "all")?.folderUuid ??
        workspaceFolders[0]?.folderUuid ??
        null);
  const workspaceStreams = useMessengerStore((state) =>
    // Пока route не распознан, не строим Workspace-список: без orgId/projectId нельзя собрать ссылки.
    workspaceMessengerActive && workspaceRoute != null
      ? selectMessengerSidebarStreams(state, {
          organizationId: workspaceRoute.orgId,
          projectId: workspaceRoute.projectId,
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

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId);
      void selectFolderSync(folderId);
    },
    [selectFolderSync, setSelectedFolderId],
  );
  const handleFoldersChanged = useCallback(
    (detail?: FolderRailFoldersChangedDetail) => {
      if (detail?.created) {
        applyLocallyCreatedFolder(detail.created);
        return;
      }
      const deletedId = detail?.deletedFolderId?.trim();
      if (deletedId != null && deletedId.length > 0) {
        applyLocallyDeletedFolder(deletedId);
        setSelectedFolderId(useFolderSyncStore.getState().selectedFolderId);
        return;
      }
      void refreshFolderSync("mutation");
    },
    [applyLocallyCreatedFolder, applyLocallyDeletedFolder, refreshFolderSync, setSelectedFolderId],
  );

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

  if (workspaceMessengerActive) {
    // На Workspace-маршрутах переиспользуем тот же rail, но наполняем его папками из Workspace API.
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
  }

  if (folderRailLayout === "vertical") {
    return (
      <>
        <div className="flex min-h-0 flex-shrink-0 self-stretch">
          <FolderRail
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
            onFoldersChanged={handleFoldersChanged}
            layout="vertical"
          />
        </div>
        {sidebarFrame(
          <Sidebar sidebarChats={sidebarChats} sidebarChatsLoading={sidebarChatsLoading} />,
        )}
      </>
    );
  }

  return sidebarFrame(
    <Sidebar
      sidebarChats={sidebarChats}
      sidebarChatsLoading={sidebarChatsLoading}
      activityPanelBottomSlot={
        <>
          <FolderRail
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
            onFoldersChanged={handleFoldersChanged}
            layout="horizontal"
          />
        </>
      }
    />,
  );
};
