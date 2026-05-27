import React, { useCallback, useMemo, useRef, useState } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { HorizontalFolderItem } from "./folder-rail-folder-items.ui";
import { orderedIndexedFoldersForRail } from "./folder-rail.lib";
import type { FolderRailHorizontalViewProps } from "./folder-rail-horizontal-view.types";

export const FolderRailHorizontalView: React.FC<FolderRailHorizontalViewProps> = React.memo(
  function FolderRailHorizontalView({
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
    const [isDragging, setIsDragging] = useState(false);
    // Состояние drag храним в ref, чтобы не провоцировать лишние рендеры на каждом pointermove.
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
    // После drag блокируем один следующий click, чтобы не срабатывать на "клик после протяжки".
    const suppressHorizontalClickRef = useRef(false);

    const displayFolders = useMemo(
      () => orderedIndexedFoldersForRail(indexedFolders),
      [indexedFolders],
    );

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
      setIsDragging(false);
    }, []);

    const handlePointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const target = e.target;
      if (!(target instanceof Node) || !e.currentTarget.contains(target)) {
        return;
      }
      // Кнопка добавления папки должна всегда оставаться кликабельной, без drag-перехвата.
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
      setIsDragging(true);
    }, []);

    const handlePointerMoveCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      const dragState = horizontalDragStateRef.current;
      if (!dragState.active || dragState.pointerId !== e.pointerId) return;
      const deltaX = e.clientX - dragState.startX;
      // Небольшой порог защищает от ложного drag при обычном клике.
      if (!dragState.moved && Math.abs(deltaX) >= 3) {
        dragState.moved = true;
      }
      if (!dragState.moved) return;
      e.currentTarget.scrollLeft = dragState.startScrollLeft - deltaX;
      e.preventDefault();
    }, []);

    const handlePointerUpCapture = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const dragState = horizontalDragStateRef.current;
        if (!dragState.active || dragState.pointerId !== e.pointerId) return;
        endHorizontalDrag(e.pointerId);
      },
      [endHorizontalDrag],
    );

    const handlePointerCancelCapture = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        endHorizontalDrag(e.pointerId);
      },
      [endHorizontalDrag],
    );

    const handleClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (!suppressHorizontalClickRef.current) return;
      const target = e.target;
      if (!(target instanceof Node) || !e.currentTarget.contains(target)) {
        suppressHorizontalClickRef.current = false;
        return;
      }
      // Не подавляем click по add-кнопке даже после drag.
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
    }, []);

    return (
      <div
        data-testid="folder-rail-horizontal"
        data-folder-rail-view="horizontal"
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerUpCapture={handlePointerUpCapture}
        onPointerCancelCapture={handlePointerCancelCapture}
        onClickCapture={handleClickCapture}
        className={`flex h-11 w-full flex-shrink-0 select-none items-center gap-1 overflow-x-auto overflow-y-hidden px-2 py-1 scrollbar-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {displayFolders.map(({ folder, index }) => (
          <HorizontalFolderItem
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle"
          aria-label={t("a11y.addFolder")}
        >
          <Icon name="add" size={24} className="shrink-0" />
        </button>
      </div>
    );
  },
);
