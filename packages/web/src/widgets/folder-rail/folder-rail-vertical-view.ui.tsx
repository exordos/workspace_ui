import React, { useEffect, useMemo, useRef, useState } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { VerticalFolderItem } from "./folder-rail-folder-items.ui";
import { FolderQuickList } from "./folder-rail-quick-list.ui";
import { orderedIndexedFoldersForRail } from "./folder-rail.lib";
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
    const scrollListRef = useRef<HTMLDivElement | null>(null);
    const scrollContentRef = useRef<HTMLDivElement | null>(null);
    const [hasVerticalOverflow, setHasVerticalOverflow] = useState(false);

    const orderedEntries = useMemo(
      () => orderedIndexedFoldersForRail(indexedFolders),
      [indexedFolders],
    );
    const allFolderEntry = orderedEntries[0] ?? null;
    const scrollableFolderEntries = useMemo(() => orderedEntries.slice(1), [orderedEntries]);

    useEffect(() => {
      const root = scrollListRef.current;
      const content = scrollContentRef.current;
      if (!root || !content) return;

      const updateOverflow = () => {
        setHasVerticalOverflow(content.scrollHeight > root.clientHeight);
      };

      updateOverflow();

      if (typeof ResizeObserver === "undefined") {
        window.addEventListener("resize", updateOverflow);
        return () => {
          window.removeEventListener("resize", updateOverflow);
        };
      }

      const observer = new ResizeObserver(updateOverflow);
      observer.observe(root);
      observer.observe(content);

      return () => {
        observer.disconnect();
      };
    }, [orderedEntries.length]);

    return (
      <div
        data-testid="folder-rail-vertical"
        data-folder-rail-view="vertical"
        className="flex h-full min-h-0 w-[72px] flex-shrink-0 flex-col items-center gap-0.5 overflow-hidden py-2"
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
          ref={scrollListRef}
          data-testid="folder-rail-scroll-list"
          className={`mt-0.5 min-h-0 flex-1 px-0.5 ${
            hasVerticalOverflow ? "overflow-y-auto" : "overflow-y-hidden"
          }`}
        >
          <div
            ref={scrollContentRef}
            data-testid="folder-rail-scroll-content"
            className="flex flex-col items-center gap-0.5"
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
              className="mt-2 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-text-primary transition-colors hover:border-border-subtle hover:bg-sidebar-hover"
              aria-label={t("a11y.addFolder")}
            >
              <Icon name="add" size={28} className="shrink-0" />
            </button>
          </div>
        </div>

        {hasVerticalOverflow && (
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
