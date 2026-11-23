import React, { useCallback, useMemo, useState } from "react";
import { DropdownMenu } from "~/shared/ui/dropdown-menu";
import type {
  DropdownMenuContentProps,
  DropdownMenuContextAnchor,
} from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";
import { buildFolderContextMenuItems } from "./folder-rail-context-menu.lib";
import { FolderRailUnreadBadge } from "./folder-rail-unread-badge.ui";
import { getFolderItemVisualState, isContextMenuKeyboardTrigger } from "./folder-rail.lib";
import type { FolderItemProps, UseFolderItemActionsArgs } from "./folder-rail-folder-items.types";

const HORIZONTAL_FOLDER_MENU_CONTENT_PROPS: DropdownMenuContentProps = {
  sideOffset: 4,
  align: "start",
};

const VERTICAL_FOLDER_MENU_CONTENT_PROPS: DropdownMenuContentProps = {
  sideOffset: 4,
  align: "start",
};

/** Shared folder item actions for horizontal and vertical rail items. */
function useFolderItemActions({
  folder,
  onSelectFolder,
  onToggleLayout,
  onRequestRename,
  onRequestDelete,
}: UseFolderItemActionsArgs) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextAnchor, setContextAnchor] = useState<DropdownMenuContextAnchor | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const openMenuAt = useCallback((anchor: DropdownMenuContextAnchor) => {
    setContextAnchor(anchor);
    setMenuOpen(true);
  }, []);

  const openMenuFromElement = useCallback(
    (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      openMenuAt({
        left: rect.left + rect.width / 2,
        top: rect.bottom,
      });
    },
    [openMenuAt],
  );

  const handleMenuOpenChange = useCallback((nextOpen: boolean) => {
    setMenuOpen(nextOpen);
    if (!nextOpen) {
      setContextAnchor(null);
    }
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openMenuAt({ left: e.clientX, top: e.clientY });
    },
    [openMenuAt],
  );

  const handleKeyboardContextMenu = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!isContextMenuKeyboardTrigger(e)) return;
      e.preventDefault();
      e.stopPropagation();
      openMenuFromElement(e.currentTarget);
    },
    [openMenuFromElement],
  );
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      // Avoid bubbling to horizontal rail click-capture after drag.
      e.stopPropagation();
      setMenuOpen(false);
      setContextAnchor(null);
      onSelectFolder(folder.id);
    },
    [folder.id, onSelectFolder],
  );

  const handleRename = useCallback(() => {
    setMenuOpen(false);
    setContextAnchor(null);
    onRequestRename(folder);
  }, [folder, onRequestRename]);

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    setContextAnchor(null);
    onRequestDelete(folder);
  }, [folder, onRequestDelete]);

  const handleToggleLayout = useCallback(() => {
    setMenuOpen(false);
    setContextAnchor(null);
    onToggleLayout();
  }, [onToggleLayout]);
  const handleLabelKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (isContextMenuKeyboardTrigger(e)) {
        e.preventDefault();
        e.stopPropagation();
        openMenuFromElement(e.currentTarget);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onSelectFolder(folder.id);
      }
    },
    [folder.id, onSelectFolder, openMenuFromElement],
  );

  return {
    menuOpen,
    contextAnchor,
    handleMenuOpenChange,
    isHovered,
    setIsHovered,
    handleContextMenu,
    handleKeyboardContextMenu,
    handleMouseEnter,
    handleMouseLeave,
    handleSelect,
    handleRename,
    handleDelete,
    handleToggleLayout,
    handleLabelKeyDown,
  };
}

export const HorizontalFolderItem: React.FC<FolderItemProps> = React.memo(
  function HorizontalFolderItem({
    folder,
    index,
    isSelected,
    showSystemFolders,
    onSelectFolder,
    onToggleLayout,
    onToggleShowSystemFolders,
    onRequestRename,
    onRequestDelete,
  }) {
    const {
      menuOpen,
      contextAnchor,
      handleMenuOpenChange,
      isHovered,
      handleContextMenu,
      handleKeyboardContextMenu,
      handleMouseEnter,
      handleMouseLeave,
      handleSelect,
      handleRename,
      handleDelete,
      handleToggleLayout,
    } = useFolderItemActions({
      folder,
      onSelectFolder,
      onToggleLayout,
      onRequestRename,
      onRequestDelete,
    });

    const visualState = useMemo(
      () => getFolderItemVisualState({ folder, index, isSelected, isHovered }),
      [folder, index, isHovered, isSelected],
    );
    const buttonTextColor = visualState.labelTextColor;
    // Hover surface only (system + custom). Selected stays outline-free for both.
    const horizontalSurfaceClass =
      visualState.folderSurfaceClassName ?? (isSelected ? "" : "hover:bg-bg/60");
    const horizontalButtonStyle = useMemo(() => {
      const buttonColorStyle = visualState.labelUsesCustomColor
        ? { color: visualState.folderColor }
        : undefined;
      return buttonColorStyle != null || visualState.folderSurfaceStyle != null
        ? { ...buttonColorStyle, ...visualState.folderSurfaceStyle }
        : undefined;
    }, [visualState.folderColor, visualState.folderSurfaceStyle, visualState.labelUsesCustomColor]);
    const menuItems = useMemo(
      () =>
        buildFolderContextMenuItems({
          isSystemFolder: visualState.isSystemFolder,
          layout: "horizontal",
          showSystemFolders,
          onRename: handleRename,
          onToggleLayout: handleToggleLayout,
          onToggleShowSystemFolders,
          onDelete: handleDelete,
        }),
      [
        handleDelete,
        handleRename,
        handleToggleLayout,
        onToggleShowSystemFolders,
        showSystemFolders,
        visualState.isSystemFolder,
      ],
    );
    const trigger = useMemo(
      () => (
        <div className="relative shrink-0">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleSelect}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyboardContextMenu}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs transition-colors ${buttonTextColor} ${horizontalSurfaceClass}`}
            title={folder.label}
            style={horizontalButtonStyle}
          >
            <span
              className={`inline-flex shrink-0 ${visualState.iconTextColor}`}
              style={visualState.iconColorStyle}
            >
              <Icon name={visualState.iconName} size={18} className="shrink-0" />
            </span>
            <span className="max-w-[112px] truncate">{folder.label}</span>
          </button>
          {folder.badge !== undefined && (
            <span className="pointer-events-none absolute -right-1 -top-2.5 z-sticky">
              <FolderRailUnreadBadge count={folder.badge} />
            </span>
          )}
        </div>
      ),
      [
        buttonTextColor,
        folder.badge,
        folder.label,
        handleContextMenu,
        handleKeyboardContextMenu,
        handleMouseEnter,
        handleMouseLeave,
        handleSelect,
        horizontalButtonStyle,
        horizontalSurfaceClass,
        visualState.iconColorStyle,
        visualState.iconName,
        visualState.iconTextColor,
      ],
    );

    return (
      <>
        {trigger}
        <DropdownMenu
          open={menuOpen}
          onOpenChange={handleMenuOpenChange}
          source="context"
          contextAnchor={contextAnchor}
          items={menuItems}
          contentVariant="default"
          contentProps={HORIZONTAL_FOLDER_MENU_CONTENT_PROPS}
        />
      </>
    );
  },
);

export const VerticalFolderItem: React.FC<FolderItemProps> = React.memo(
  function VerticalFolderItem({
    folder,
    index,
    isSelected,
    showSystemFolders,
    onSelectFolder,
    onToggleLayout,
    onToggleShowSystemFolders,
    onRequestRename,
    onRequestDelete,
  }) {
    const {
      menuOpen,
      contextAnchor,
      handleMenuOpenChange,
      isHovered,
      handleContextMenu,
      handleKeyboardContextMenu,
      handleMouseEnter,
      handleMouseLeave,
      handleSelect,
      handleRename,
      handleDelete,
      handleToggleLayout,
      handleLabelKeyDown,
    } = useFolderItemActions({
      folder,
      onSelectFolder,
      onToggleLayout,
      onRequestRename,
      onRequestDelete,
    });
    const visualState = useMemo(
      () => getFolderItemVisualState({ folder, index, isSelected, isHovered }),
      [folder, index, isHovered, isSelected],
    );
    const verticalToneClass = isSelected ? "text-text-primary" : "text-text-muted";
    const verticalLabelToneClass = visualState.labelUsesCustomColor
      ? "text-current"
      : verticalToneClass;
    const verticalScaleClass = isSelected ? "scale-110" : "scale-100";
    // System folders get the same surface treatment as custom ones, via semantic classes.
    const verticalSurfaceClass = visualState.folderSurfaceClassName ?? "";
    const menuItems = useMemo(
      () =>
        buildFolderContextMenuItems({
          isSystemFolder: visualState.isSystemFolder,
          layout: "vertical",
          showSystemFolders,
          onRename: handleRename,
          onToggleLayout: handleToggleLayout,
          onToggleShowSystemFolders,
          onDelete: handleDelete,
        }),
      [
        handleDelete,
        handleRename,
        handleToggleLayout,
        onToggleShowSystemFolders,
        showSystemFolders,
        visualState.isSystemFolder,
      ],
    );
    const trigger = useMemo(
      () => (
        <div className="flex h-[72px] w-[56px] items-center justify-center p-1">
          <div
            className={`relative h-[64px] w-[48px] origin-center transform-gpu transition-transform duration-150 ease-out motion-reduce:transition-none ${verticalScaleClass}`}
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleSelect}
              onContextMenu={handleContextMenu}
              onKeyDown={handleKeyboardContextMenu}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              className={`absolute left-1/2 top-[10px] flex h-8 w-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-lg border border-transparent transition-colors ${verticalToneClass} ${verticalSurfaceClass}`}
              title={folder.label}
              style={visualState.folderSurfaceStyle}
            >
              <span
                className={`inline-flex shrink-0 ${visualState.iconTextColor}`}
                style={visualState.iconColorStyle}
              >
                <Icon name={visualState.iconName} size={32} className="shrink-0" />
              </span>
            </button>
            {folder.badge !== undefined && (
              <span className="pointer-events-none absolute right-1 top-0 z-sticky">
                <FolderRailUnreadBadge count={folder.badge} />
              </span>
            )}
            <span
              className={`absolute left-1/2 top-[42px] w-[52px] -translate-x-1/2 cursor-pointer truncate text-center text-xs leading-4 transition-colors ${verticalLabelToneClass}`}
              title={folder.label}
              role="button"
              tabIndex={0}
              style={visualState.labelColorStyle}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleSelect}
              onContextMenu={handleContextMenu}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onKeyDown={handleLabelKeyDown}
            >
              {folder.label}
            </span>
          </div>
        </div>
      ),
      [
        folder.badge,
        folder.label,
        handleContextMenu,
        handleKeyboardContextMenu,
        handleLabelKeyDown,
        handleMouseEnter,
        handleMouseLeave,
        handleSelect,
        verticalLabelToneClass,
        verticalScaleClass,
        verticalSurfaceClass,
        verticalToneClass,
        visualState.folderSurfaceStyle,
        visualState.iconColorStyle,
        visualState.iconName,
        visualState.iconTextColor,
        visualState.labelColorStyle,
      ],
    );

    return (
      <>
        {trigger}
        <DropdownMenu
          open={menuOpen}
          onOpenChange={handleMenuOpenChange}
          source="context"
          contextAnchor={contextAnchor}
          items={menuItems}
          contentVariant="default"
          contentProps={VERTICAL_FOLDER_MENU_CONTENT_PROPS}
        />
      </>
    );
  },
);
