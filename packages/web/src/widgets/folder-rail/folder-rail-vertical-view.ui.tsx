import React, { useMemo } from "react";
import { t } from "~/i18n";
import { Icon } from "~/shared/ui";
import { VerticalFolderItem } from "./folder-rail-folder-items.ui";
import { FolderQuickList } from "./folder-rail-quick-list.ui";
import { FOLDER_QUICK_LIST_THRESHOLD, type IndexedFolderEntry } from "./folder-rail.utils";
import type { FolderRailFolder } from "./folder-rail.types";

/** Пропсы vertical-представления; state/CRUD остаются в контейнере `FolderRail`. */
interface FolderRailVerticalViewProps {
  indexedFolders: IndexedFolderEntry[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onToggleLayout: () => void;
  onRequestRename: (folder: FolderRailFolder) => void;
  onRequestDelete: (folder: FolderRailFolder) => void;
  onOpenCreateDialog: () => void;
}

export const FolderRailVerticalView: React.FC<FolderRailVerticalViewProps> = React.memo(
  function FolderRailVerticalView({
    indexedFolders,
    selectedFolderId,
    onSelectFolder,
    onToggleLayout,
    onRequestRename,
    onRequestDelete,
    onOpenCreateDialog,
  }) {
    // "All" закрепляем сверху: если systemType не пришел, для совместимости считаем первым элементом.
    const allFolderEntry = useMemo(
      () =>
        indexedFolders.find(
          ({ folder, index }) =>
            folder.systemType === "all" || (folder.systemType == null && index === 0),
        ) ??
        indexedFolders[0] ??
        null,
      [indexedFolders],
    );

    // Остальные папки рендерим в скроллируемой зоне.
    const scrollableFolderEntries = useMemo(() => {
      if (allFolderEntry == null) return [];
      return indexedFolders.filter(({ folder }) => folder.id !== allFolderEntry.folder.id);
    }, [allFolderEntry, indexedFolders]);

    // Quick-list нужен только когда колонка становится длинной.
    const showQuickList = indexedFolders.length > FOLDER_QUICK_LIST_THRESHOLD;

    return (
      <div
        data-testid="folder-rail-vertical"
        data-folder-rail-view="vertical"
        className="flex min-h-0 w-[90px] flex-shrink-0 flex-col items-center gap-1 py-3"
      >
        {allFolderEntry && (
          <VerticalFolderItem
            key={allFolderEntry.folder.id}
            folder={allFolderEntry.folder}
            index={allFolderEntry.index}
            isSelected={selectedFolderId === allFolderEntry.folder.id}
            onSelectFolder={onSelectFolder}
            onToggleLayout={onToggleLayout}
            onRequestRename={onRequestRename}
            onRequestDelete={onRequestDelete}
          />
        )}

        <div
          data-testid="folder-rail-scroll-list"
          className="mt-1 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1"
        >
          {scrollableFolderEntries.map(({ folder, index }) => (
            <VerticalFolderItem
              key={folder.id}
              folder={folder}
              index={index}
              isSelected={selectedFolderId === folder.id}
              onSelectFolder={onSelectFolder}
              onToggleLayout={onToggleLayout}
              onRequestRename={onRequestRename}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>

        {showQuickList && (
          <FolderQuickList
            folders={indexedFolders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
          />
        )}

        <button
          type="button"
          onClick={onOpenCreateDialog}
          data-folder-rail-action="add-folder"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle"
          aria-label={t("a11y.addFolder")}
        >
          <Icon name="add" size={40} className="shrink-0" />
        </button>
      </div>
    );
  },
);
