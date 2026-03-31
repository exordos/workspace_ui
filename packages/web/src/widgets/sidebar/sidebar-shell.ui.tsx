import React, { useCallback } from "react";
import { useFolderSyncStore } from "~/features/folder-sync";
import { useSettingsStore } from "~/features/settings";
import { FolderRail } from "~/widgets/folder-rail";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { Sidebar } from "./sidebar.ui";

export const SidebarShell: React.FC = () => {
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
  const folders = useFolderSyncStore((s) => s.folders);
  const refreshFolderSync = useFolderSyncStore((s) => s.refresh);
  const selectFolderSync = useFolderSyncStore((s) => s.selectFolder);
  const selectedFolderId = useSidebarConfigStore((s) => s.selectedFolderId);
  const setSelectedFolderId = useSidebarConfigStore((s) => s.setSelectedFolderId);
  const setPinReorderMode = useSidebarConfigStore((s) => s.setPinReorderMode);

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId);
      setPinReorderMode(false);
      void selectFolderSync(folderId);
    },
    [selectFolderSync, setPinReorderMode, setSelectedFolderId],
  );
  const handleStartOrderPinning = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId);
      setPinReorderMode(true);
      void selectFolderSync(folderId);
    },
    [selectFolderSync, setPinReorderMode, setSelectedFolderId],
  );
  const handleFoldersChanged = useCallback(() => {
    void refreshFolderSync("mutation");
  }, [refreshFolderSync]);

  if (folderRailLayout === "vertical") {
    return (
      <>
        <div className="flex-shrink-0">
          <FolderRail
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
            onOrderPinning={handleStartOrderPinning}
            onFoldersChanged={handleFoldersChanged}
            layout="vertical"
          />
        </div>
        <Sidebar />
      </>
    );
  }

  return (
    <Sidebar
      activityPanelBottomSlot={
        <>
          <FolderRail
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
            onOrderPinning={handleStartOrderPinning}
            onFoldersChanged={handleFoldersChanged}
            layout="horizontal"
          />
          <div className="my-2">
            <div className="bg-border-subtle/70 h-px" />
          </div>
        </>
      }
    />
  );
};

