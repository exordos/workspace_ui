import React, { useCallback, useMemo, useState } from "react";
import { SYSTEM_ALL_FOLDER_ID } from "~/features/folder-sync/folder-sync-constants.lib";
import { CreateFolderModal } from "~/features/manage-folders/create-folder-modal.ui";
import {
  createFolder,
  deleteFolder,
  updateFolder,
} from "~/features/manage-folders/manage-folders.api";
import { UpdateFolderModal } from "~/features/manage-folders/update-folder-modal.ui";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { formatUserFacingError } from "~/shared/lib/toast/format-user-error.lib";
import { toast } from "~/shared/lib/toast/toast";
import { AppDialog, DialogCancelButton } from "~/shared/ui/app-dialog.ui";
import { Spinner } from "~/shared/ui/spinner.ui";
import { FolderRailHorizontalView } from "./folder-rail-horizontal-view.ui";
import { FolderRailVerticalView } from "./folder-rail-vertical-view.ui";
import type { IndexedFolderEntry } from "./folder-rail.lib";
import type { FolderRailFolder, FolderRailProps } from "./folder-rail.types";

export type {
  FolderRailFolder,
  FolderRailFoldersChangedDetail,
  FolderRailLayout,
} from "./folder-rail.types";

export const FolderRail: React.FC<FolderRailProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  onToggleLayout,
  onFoldersChanged,
  layout = "vertical",
}) => {
  const normalizedFolders = useMemo(() => {
    return folders.map((folder) =>
      folder.id === "all" ? { ...folder, id: SYSTEM_ALL_FOLDER_ID } : folder,
    );
  }, [folders]);
  const resolvedSelectedFolderId =
    selectedFolderId === "all" ? SYSTEM_ALL_FOLDER_ID : selectedFolderId;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<FolderRailFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderRailFolder | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const showSystemFolders = useSettingsStore((s) => s.showSystemFolders);
  const setFolderRailLayout = useSettingsStore((s) => s.setFolderRailLayout);
  const setShowSystemFolders = useSettingsStore((s) => s.setShowSystemFolders);

  const handleCreate = useCallback(
    async ({ name, backgroundColor }: { name: string; backgroundColor: number }) => {
      try {
        const result = await createFolder({ title: name, backgroundColor });
        if (!result) {
          toast.error(t("folder.createFailed"));
          return false;
        }
        onFoldersChanged?.({
          created: {
            id: result.id,
            title: result.title,
            backgroundColor: result.backgroundColor,
          },
        });
        return true;
      } catch (err) {
        toast.error(formatUserFacingError(err, "folder.createFailed"));
        return false;
      }
    },
    [onFoldersChanged],
  );

  const handleSaveRename = useCallback(
    async ({ name, backgroundColor }: { name: string; backgroundColor: number }) => {
      if (!renamingFolder) return false;
      try {
        const result = await updateFolder(renamingFolder.id, { title: name, backgroundColor });
        if (!result) {
          toast.error(t("folder.updateFailed"));
          return false;
        }
        onFoldersChanged?.();
        return true;
      } catch (err) {
        toast.error(formatUserFacingError(err, "folder.updateFailed"));
        return false;
      }
    },
    [renamingFolder, onFoldersChanged],
  );

  const handleRequestRename = useCallback((folder: FolderRailFolder) => {
    setRenamingFolder(folder);
    setRenameDialogOpen(true);
  }, []);

  const handleRequestDelete = useCallback((folder: FolderRailFolder) => {
    setDeletingFolder(folder);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deletingFolder || isDeletingFolder) return;
    setIsDeletingFolder(true);
    try {
      const deleted = await deleteFolder(deletingFolder.id);
      if (!deleted) {
        toast.error(t("folder.deleteFailed"));
        return;
      }
      onFoldersChanged?.({ deletedFolderId: deletingFolder.id });
      setDeletingFolder(null);
    } catch (err) {
      toast.error(formatUserFacingError(err, "folder.deleteFailed"));
    } finally {
      setIsDeletingFolder(false);
    }
  }, [deletingFolder, isDeletingFolder, onFoldersChanged]);

  const handleToggleLayout = useCallback(() => {
    // Приоритет у внешнего callback; fallback — локальная смена через settings store.
    if (onToggleLayout != null) {
      onToggleLayout();
      return;
    }
    setFolderRailLayout(layout === "horizontal" ? "vertical" : "horizontal");
  }, [layout, onToggleLayout, setFolderRailLayout]);

  const handleToggleShowSystemFolders = useCallback(() => {
    setShowSystemFolders(!showSystemFolders);
  }, [setShowSystemFolders, showSystemFolders]);

  // Единая структура для обоих view, чтобы не дублировать map + передачу индекса.
  const indexedFolders = useMemo<IndexedFolderEntry[]>(
    () => normalizedFolders.map((folder, index) => ({ folder, index })),
    [normalizedFolders],
  );

  return (
    <>
      {layout === "horizontal" ? (
        <FolderRailHorizontalView
          indexedFolders={indexedFolders}
          selectedFolderId={resolvedSelectedFolderId}
          showSystemFolders={showSystemFolders}
          onSelectFolder={onSelectFolder}
          onToggleLayout={handleToggleLayout}
          onToggleShowSystemFolders={handleToggleShowSystemFolders}
          onRequestRename={handleRequestRename}
          onRequestDelete={handleRequestDelete}
          onOpenCreateDialog={() => setCreateDialogOpen(true)}
        />
      ) : (
        <FolderRailVerticalView
          indexedFolders={indexedFolders}
          selectedFolderId={resolvedSelectedFolderId}
          showSystemFolders={showSystemFolders}
          onSelectFolder={onSelectFolder}
          onToggleLayout={handleToggleLayout}
          onToggleShowSystemFolders={handleToggleShowSystemFolders}
          onRequestRename={handleRequestRename}
          onRequestDelete={handleRequestDelete}
          onOpenCreateDialog={() => setCreateDialogOpen(true)}
        />
      )}

      <CreateFolderModal
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreate={handleCreate}
      />
      <UpdateFolderModal
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        initialName={renamingFolder?.label ?? ""}
        initialBackgroundColor={renamingFolder?.backgroundColor}
        onSave={handleSaveRename}
      />
      <AppDialog
        open={deletingFolder != null}
        onOpenChange={(open) => {
          if (!open && !isDeletingFolder) setDeletingFolder(null);
        }}
        title={t("folder.deleteConfirmTitle")}
        description={t("folder.deleteConfirmText", { label: deletingFolder?.label ?? "" })}
        footer={
          <>
            <DialogCancelButton disabled={isDeletingFolder}>
              {t("common.cancel")}
            </DialogCancelButton>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isDeletingFolder}
              className="hover:bg-notice-base/20 bg-notice-base/10 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-notice-base transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeletingFolder ? <Spinner size="sm" variant="inherit" /> : null}
              {t("common.delete")}
            </button>
          </>
        }
      >
        {null}
      </AppDialog>
    </>
  );
};
