import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createFolder,
  updateFolder,
  deleteFolder,
  CreateFolderModal,
  UpdateFolderModal,
} from "~/features/manage-folders";
import { useSettingsStore } from "~/features/settings";
import { t } from "~/i18n";
import { Icon } from "~/shared/ui";

import { FolderRailFolderItem } from "./folder-rail-folder-item.ui";
import { FOLDER_QUICK_LIST_THRESHOLD } from "./folder-rail.lib";
import { FolderRailQuickList } from "./folder-rail-quick-list.ui";
import type { FolderRailFolder, FolderRailProps } from "./folder-rail.types";

export type { FolderRailFolder, FolderRailLayout } from "./folder-rail.types";

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
  const [isHorizontalDragging, setIsHorizontalDragging] = useState(false);
  const setFolderRailLayout = useSettingsStore((s) => s.setFolderRailLayout);
  const horizontalDragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const suppressHorizontalClickRef = useRef(false);

  const handleCreate = useCallback(
    async ({ name, backgroundColor }: { name: string; backgroundColor: number }) => {
      try {
        const result = await createFolder({ title: name, backgroundColor });
        if (!result) {
          return false;
        }
        onFoldersChanged?.();
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
      onFoldersChanged?.();
      setDeletingFolder(null);
    } catch {
      // Keep the dialog open so user can retry.
    } finally {
      setIsDeletingFolder(false);
    }
  }, [deletingFolder, isDeletingFolder, onFoldersChanged]);

  const isHorizontal = layout === "horizontal";
  const handleToggleLayout = useCallback(() => {
    if (onToggleLayout != null) {
      onToggleLayout();
      return;
    }
    setFolderRailLayout(layout === "horizontal" ? "vertical" : "horizontal");
  }, [layout, onToggleLayout, setFolderRailLayout]);
  const endHorizontalDrag = useCallback((pointerId: number | null) => {
    const dragState = horizontalDragStateRef.current;
    if (!dragState.active) return;
    if (pointerId != null && dragState.pointerId !== pointerId) return;
    suppressHorizontalClickRef.current = dragState.moved;
    horizontalDragStateRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
    };
    setIsHorizontalDragging(false);
  }, []);
  const handleHorizontalPointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isHorizontal || e.pointerType !== "mouse" || e.button !== 0) return;
      const target = e.target;
      if (!(target instanceof Node) || !e.currentTarget.contains(target)) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest("[data-folder-rail-action='add-folder']") != null
      ) {
        return;
      }
      const rail = e.currentTarget;
      horizontalDragStateRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startScrollLeft: rail.scrollLeft,
        moved: false,
      };
      suppressHorizontalClickRef.current = false;
      setIsHorizontalDragging(true);
    },
    [isHorizontal],
  );
  const handleHorizontalPointerMoveCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isHorizontal) return;
      const dragState = horizontalDragStateRef.current;
      if (!dragState.active || dragState.pointerId !== e.pointerId) return;
      const deltaX = e.clientX - dragState.startX;
      if (!dragState.moved && Math.abs(deltaX) >= 3) {
        dragState.moved = true;
      }
      if (!dragState.moved) return;
      e.currentTarget.scrollLeft = dragState.startScrollLeft - deltaX;
      e.preventDefault();
    },
    [isHorizontal],
  );
  const handleHorizontalPointerUpCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isHorizontal) return;
      const dragState = horizontalDragStateRef.current;
      if (!dragState.active || dragState.pointerId !== e.pointerId) return;
      endHorizontalDrag(e.pointerId);
    },
    [endHorizontalDrag, isHorizontal],
  );
  const handleHorizontalPointerCancelCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isHorizontal) return;
      endHorizontalDrag(e.pointerId);
    },
    [endHorizontalDrag, isHorizontal],
  );
  const handleHorizontalClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isHorizontal || !suppressHorizontalClickRef.current) return;
      const target = e.target;
      if (!(target instanceof Node) || !e.currentTarget.contains(target)) {
        suppressHorizontalClickRef.current = false;
        return;
      }
      if (
        target instanceof Element &&
        target.closest("[data-folder-rail-action='add-folder']") != null
      ) {
        suppressHorizontalClickRef.current = false;
        return;
      }
      suppressHorizontalClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    [isHorizontal],
  );
  useEffect(() => {
    if (isHorizontal) return;
    horizontalDragStateRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
    };
    suppressHorizontalClickRef.current = false;
    setIsHorizontalDragging(false);
  }, [isHorizontal]);
  const indexedFolders = useMemo(
    () => folders.map((folder, index) => ({ folder, index })),
    [folders],
  );
  const allFolderEntry = useMemo(() => {
    if (isHorizontal) return null;
    return (
      indexedFolders.find(
        ({ folder, index }) =>
          folder.systemType === "all" || (folder.systemType == null && index === 0),
      ) ??
      indexedFolders[0] ??
      null
    );
  }, [indexedFolders, isHorizontal]);
  const scrollableFolderEntries = useMemo(() => {
    if (isHorizontal) return indexedFolders;
    if (allFolderEntry == null) return [];
    return indexedFolders.filter(({ folder }) => folder.id !== allFolderEntry.folder.id);
  }, [allFolderEntry, indexedFolders, isHorizontal]);
  const showQuickList = !isHorizontal && indexedFolders.length > FOLDER_QUICK_LIST_THRESHOLD;

  return (
    <div
      data-testid={isHorizontal ? "folder-rail-horizontal" : "folder-rail-vertical"}
      onPointerDownCapture={handleHorizontalPointerDownCapture}
      onPointerMoveCapture={handleHorizontalPointerMoveCapture}
      onPointerUpCapture={handleHorizontalPointerUpCapture}
      onPointerCancelCapture={handleHorizontalPointerCancelCapture}
      onClickCapture={handleHorizontalClickCapture}
      className={
        isHorizontal
          ? `flex h-11 w-full flex-shrink-0 select-none items-center gap-1 overflow-x-auto overflow-y-hidden px-2 py-1 scrollbar-none ${
              isHorizontalDragging ? "cursor-grabbing" : "cursor-grab"
            }`
          : "flex min-h-0 w-[90px] flex-shrink-0 flex-col items-center gap-1 py-3"
      }
    >
      {isHorizontal ? (
        indexedFolders.map(({ folder, index }) => (
          <FolderRailFolderItem
            key={folder.id}
            folder={folder}
            index={index}
            layout={layout}
            isSelected={selectedFolderId === folder.id}
            onSelectFolder={onSelectFolder}
            onToggleLayout={handleToggleLayout}
            onRequestRename={handleRequestRename}
            onRequestDelete={handleRequestDelete}
          />
        ))
      ) : (
        <>
          {allFolderEntry && (
            <FolderRailFolderItem
              key={allFolderEntry.folder.id}
              folder={allFolderEntry.folder}
              index={allFolderEntry.index}
              layout={layout}
              isSelected={selectedFolderId === allFolderEntry.folder.id}
              onSelectFolder={onSelectFolder}
              onToggleLayout={handleToggleLayout}
              onRequestRename={handleRequestRename}
              onRequestDelete={handleRequestDelete}
            />
          )}
          <div
            data-testid="folder-rail-scroll-list"
            className="mt-1 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1"
          >
            {scrollableFolderEntries.map(({ folder, index }) => (
              <FolderRailFolderItem
                key={folder.id}
                folder={folder}
                index={index}
                layout={layout}
                isSelected={selectedFolderId === folder.id}
                onSelectFolder={onSelectFolder}
                onToggleLayout={handleToggleLayout}
                onRequestRename={handleRequestRename}
                onRequestDelete={handleRequestDelete}
              />
            ))}
          </div>
        </>
      )}

      {showQuickList && (
        <FolderRailQuickList
          folders={indexedFolders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
        />
      )}

      <button
        type="button"
        onClick={() => setCreateDialogOpen(true)}
        data-folder-rail-action="add-folder"
        className={
          isHorizontal
            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle"
            : "flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle"
        }
        aria-label={t("a11y.addFolder")}
      >
        <Icon name="add" size={isHorizontal ? 24 : 40} className="shrink-0" />
      </button>

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
    </div>
  );
};
