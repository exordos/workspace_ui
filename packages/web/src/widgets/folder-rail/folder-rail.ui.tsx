import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useMemo, useState } from "react";
import { createFolder, deleteFolder, updateFolder } from "~/features/manage-folders/manage-folders.api";
import { CreateFolderModal } from "~/features/manage-folders/create-folder-modal.ui";
import { UpdateFolderModal } from "~/features/manage-folders/update-folder-modal.ui";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { FolderRailHorizontalView } from "./folder-rail-horizontal-view.ui";
import { FolderRailVerticalView } from "./folder-rail-vertical-view.ui";
import type { FolderRailFolder, FolderRailLayout, FolderRailProps } from "./folder-rail.types";
import type { IndexedFolderEntry } from "./folder-rail.lib";

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
      } catch {
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
          return false;
        }
        onFoldersChanged?.();
        return true;
      } catch {
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
        return;
      }
      onFoldersChanged?.({ deletedFolderId: deletingFolder.id });
      setDeletingFolder(null);
    } catch {
      // Keep the dialog open so user can retry.
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
    () => folders.map((folder, index) => ({ folder, index })),
    [folders],
  );

  return (
    <>
      {layout === "horizontal" ? (
        <FolderRailHorizontalView
          indexedFolders={indexedFolders}
          selectedFolderId={selectedFolderId}
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
          selectedFolderId={selectedFolderId}
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
      <Dialog.Root
        open={deletingFolder != null}
        onOpenChange={(open) => {
          if (!open && !isDeletingFolder) setDeletingFolder(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
          <Dialog.Content
            className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-[20%] z-modal w-full max-w-sm -translate-x-1/2 rounded-xl border border-border-subtle bg-bg-elevated p-6 shadow-xl"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <Dialog.Title className="mb-2 text-base font-semibold text-text-primary">
              {t("folder.deleteConfirmTitle")}
            </Dialog.Title>
            <Dialog.Description className="mb-4 text-sm text-text-muted">
              {t("folder.deleteConfirmText", { label: deletingFolder?.label ?? "" })}
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={isDeletingFolder}
                  className="hover:bg-bg/60 rounded-lg px-4 py-2 text-sm text-text-muted transition-colors"
                >
                  {t("common.cancel")}
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeletingFolder}
                className="hover:bg-notice-base/20 bg-notice-base/10 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-notice-base transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingFolder && (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden="true"
                  />
                )}
                {t("common.delete")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
