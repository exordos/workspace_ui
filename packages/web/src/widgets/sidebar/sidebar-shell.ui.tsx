import React, { useCallback } from "react";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { selectSidebarChatsLoading } from "~/features/folder-sync/folder-sync.selectors";
import { useSettingsStore } from "~/features/settings/settings.model";
import type { FolderRailFoldersChangedDetail } from "~/widgets/folder-rail/folder-rail.types";
import { FolderRail } from "~/widgets/folder-rail/folder-rail.ui";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { Sidebar } from "./sidebar.ui";

export const SidebarShell: React.FC = () => {
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

  if (folderRailLayout === "vertical") {
    return (
      <>
        <div className="flex-shrink-0">
          <FolderRail
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
            onFoldersChanged={handleFoldersChanged}
            layout="vertical"
          />
        </div>
        <Sidebar sidebarChats={sidebarChats} sidebarChatsLoading={sidebarChatsLoading} />
      </>
    );
  }

  return (
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
    />
  );
};
