import React, { useMemo } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { VerticalFolderItem } from "./folder-rail-folder-items.ui";
import { FolderQuickList } from "./folder-rail-quick-list.ui";
import {
  FOLDER_QUICK_LIST_THRESHOLD,
  orderedIndexedFoldersForRail,
  type IndexedFolderEntry,
} from "./folder-rail.lib";
import type { FolderRailVerticalViewProps } from "./folder-rail-vertical-view.types";

export const FolderRailVerticalView: React.FC<FolderRailVerticalViewProps> = React.memo(
  function FolderRailVerticalView({
    indexedFolders,
    selectedFolderId,
    showSystemFolders,
    onSelectFolder,
    onToggleLayout,
    onToggleShowSystemFolders,
    onRequestRename,
    onRequestDelete,
    onOpenCreateDialog,
  }) {
    const orderedEntries = useMemo(
      () => orderedIndexedFoldersForRail(indexedFolders),
      [indexedFolders],
    );
    const allFolderEntry = orderedEntries[0] ?? null;
    const scrollableFolderEntries = useMemo(() => orderedEntries.slice(1), [orderedEntries]);

    // Quick-list нужен только когда колонка становится длинной.
    const showQuickList = orderedEntries.length > FOLDER_QUICK_LIST_THRESHOLD;

    return (
      <div
        data-testid="folder-rail-vertical"
        data-folder-rail-view="vertical"
        className="flex min-h-0 w-[72px] flex-shrink-0 flex-col items-center gap-0.5 py-2"
      >
        {allFolderEntry && (
          <VerticalFolderItem
            key={allFolderEntry.folder.id}
            folder={allFolderEntry.folder}
            index={allFolderEntry.index}
            isSelected={selectedFolderId === allFolderEntry.folder.id}
            showSystemFolders={showSystemFolders}
            onSelectFolder={onSelectFolder}
            onToggleLayout={onToggleLayout}
            onToggleShowSystemFolders={onToggleShowSystemFolders}
            onRequestRename={onRequestRename}
            onRequestDelete={onRequestDelete}
          />
        )}

        <div
          data-testid="folder-rail-scroll-list"
          className="mt-0.5 flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto px-0.5"
        >
          {scrollableFolderEntries.map(({ folder, index }) => (
            <VerticalFolderItem
              key={folder.id}
              folder={folder}
              index={index}
              isSelected={selectedFolderId === folder.id}
              showSystemFolders={showSystemFolders}
              onSelectFolder={onSelectFolder}
              onToggleLayout={onToggleLayout}
              onToggleShowSystemFolders={onToggleShowSystemFolders}
              onRequestRename={onRequestRename}
              onRequestDelete={onRequestDelete}
            />
          ))}

          <button
            type="button"
            onClick={onOpenCreateDialog}
            data-folder-rail-action="add-folder"
            className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center text-text-primary"
            aria-label={t("a11y.addFolder")}
          >
            <Icon name="add" size={28} className="shrink-0" />
          </button>
        </div>

        {showQuickList && (
          <FolderQuickList
            folders={orderedEntries}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
          />
        )}
      </div>
    );
  },
);
