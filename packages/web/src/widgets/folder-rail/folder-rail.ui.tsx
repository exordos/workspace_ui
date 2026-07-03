import React, { useCallback, useMemo, useState } from "react";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { CreateFolderModal } from "~/features/manage-folders/create-folder-modal.ui";
import { UpdateFolderModal } from "~/features/manage-folders/update-folder-modal.ui";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import {
  createFolder as createMessengerFolder,
  deleteFolder as deleteMessengerFolder,
  updateFolder as updateMessengerFolder,
} from "~/shared/api/messenger-folders.api";
import { guard } from "~/shared/lib/guards";
import { formatUserFacingError } from "~/shared/lib/toast/format-user-error.lib";
import { toast } from "~/shared/lib/toast/toast";
import { AppDialog, DialogCancelButton } from "~/shared/ui/app-dialog.ui";
import { Spinner } from "~/shared/ui/spinner.ui";
import { SIDEBAR_SYSTEM_ALL_FOLDER_ID } from "~/widgets/sidebar/sidebar-folder.constants";
import { FolderRailHorizontalView } from "./folder-rail-horizontal-view.ui";
import { FolderRailVerticalView } from "./folder-rail-vertical-view.ui";
import type { IndexedFolderEntry } from "./folder-rail.lib";
import type { FolderRailFolder, FolderRailProps } from "./folder-rail.types";

export type {
  FolderRailFolder,
  FolderRailFoldersChangedDetail,
  FolderRailLayout,
} from "./folder-rail.types";

function currentMessengerFolderClientOptions(): ReturnType<
  typeof buildMessengerRequestOptions
> | null {
  const runtimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  if (runtimeContext == null) {
    return null;
  }
  return buildMessengerRequestOptions(runtimeContext);
}

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
      folder.id === "all" ? { ...folder, id: SIDEBAR_SYSTEM_ALL_FOLDER_ID } : folder,
    );
  }, [folders]);
  const resolvedSelectedFolderId =
    selectedFolderId === "all" ? SIDEBAR_SYSTEM_ALL_FOLDER_ID : selectedFolderId;
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
        guard.nonEmpty(name, "folder title");
        const clientOptions = currentMessengerFolderClientOptions();
        if (clientOptions == null) {
          toast.error(t("folder.createFailed"));
          return false;
        }
        const result = await createMessengerFolder(clientOptions, {
          title: name,
          background_color_value: backgroundColor,
        });
        onFoldersChanged?.({
          created: {
            id: result.uuid ?? "",
            title: result.title,
            backgroundColor: result.background_color_value ?? 0,
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
        guard.nonEmpty(renamingFolder.id, "folder id");
        const clientOptions = currentMessengerFolderClientOptions();
        if (clientOptions == null) {
          toast.error(t("folder.updateFailed"));
          return false;
        }
        await updateMessengerFolder(clientOptions, renamingFolder.id, {
          title: name,
          background_color_value: backgroundColor,
        });
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
      guard.nonEmpty(deletingFolder.id, "folder id");
      const clientOptions = currentMessengerFolderClientOptions();
      if (clientOptions == null) {
        toast.error(t("folder.deleteFailed"));
        return;
      }
      await deleteMessengerFolder(clientOptions, deletingFolder.id);
      onFoldersChanged?.({ deletedFolderId: deletingFolder.id });
      setDeletingFolder(null);
    } catch (err) {
      toast.error(formatUserFacingError(err, "folder.deleteFailed"));
    } finally {
      setIsDeletingFolder(false);
    }
  }, [deletingFolder, isDeletingFolder, onFoldersChanged]);

  const handleToggleLayout = useCallback(() => {
    // Prefer external onToggleLayout; else toggle via settings store.
    if (onToggleLayout != null) {
      onToggleLayout();
      return;
    }
    setFolderRailLayout(layout === "horizontal" ? "vertical" : "horizontal");
  }, [layout, onToggleLayout, setFolderRailLayout]);

  const handleToggleShowSystemFolders = useCallback(() => {
    setShowSystemFolders(!showSystemFolders);
  }, [setShowSystemFolders, showSystemFolders]);

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
