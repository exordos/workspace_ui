import React, { useCallback, useState } from "react";
import { DropdownMenu } from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";
import { buildFolderContextMenuItems } from "./folder-rail-context-menu.lib";
import { FolderRailUnreadBadge } from "./folder-rail-unread-badge.ui";
import { getFolderItemVisualState, isContextMenuKeyboardTrigger } from "./folder-rail.lib";
import type { FolderItemProps, UseFolderItemActionsArgs } from "./folder-rail-folder-items.types";

/** Shared folder item actions for horizontal and vertical rail items. */
function useFolderItemActions({
  folder,
  onSelectFolder,
  onToggleLayout,
  onRequestRename,
  onRequestDelete,
}: UseFolderItemActionsArgs) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  }, []);

  const handleKeyboardContextMenu = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (!isContextMenuKeyboardTrigger(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(true);
  }, []);

  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      // Avoid bubbling to horizontal rail click-capture after drag.
      e.stopPropagation();
      setMenuOpen(false);
      onSelectFolder(folder.id);
    },
    [folder.id, onSelectFolder],
  );

  const handleRename = useCallback(() => {
    setMenuOpen(false);
    onRequestRename(folder);
  }, [folder, onRequestRename]);

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    onRequestDelete(folder);
  }, [folder, onRequestDelete]);

  const handleToggleLayout = useCallback(() => {
    setMenuOpen(false);
    onToggleLayout();
  }, [onToggleLayout]);

  return {
    menuOpen,
    setMenuOpen,
    isHovered,
    setIsHovered,
    handleContextMenu,
    handleKeyboardContextMenu,
    handleSelect,
    handleRename,
    handleDelete,
    handleToggleLayout,
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
      setMenuOpen,
      isHovered,
      setIsHovered,
      handleContextMenu,
      handleKeyboardContextMenu,
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

    const visualState = getFolderItemVisualState({ folder, index, isSelected, isHovered });
    const buttonTextColor = visualState.labelTextColor;
    const buttonColorStyle = visualState.labelUsesCustomColor
      ? { color: visualState.folderColor }
      : undefined;
    const horizontalButtonStyle =
      buttonColorStyle != null || visualState.folderSurfaceStyle != null
        ? { ...buttonColorStyle, ...visualState.folderSurfaceStyle }
        : undefined;

    return (
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={
          <div className="relative shrink-0">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleSelect}
              onContextMenu={handleContextMenu}
              onKeyDown={handleKeyboardContextMenu}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs transition-colors ${buttonTextColor} ${
                isSelected ? "bg-bg-elevated" : "hover:bg-bg/60"
              }`}
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
        }
        items={buildFolderContextMenuItems({
          isSystemFolder: visualState.isSystemFolder,
          layout: "horizontal",
          showSystemFolders,
          onRename: handleRename,
          onToggleLayout: handleToggleLayout,
          onToggleShowSystemFolders,
          onDelete: handleDelete,
        })}
        contentVariant="default"
        contentProps={{ sideOffset: 4, align: "start" }}
      />
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
      setMenuOpen,
      isHovered,
      setIsHovered,
      handleContextMenu,
      handleKeyboardContextMenu,
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
    const visualState = getFolderItemVisualState({ folder, index, isSelected, isHovered });
    const verticalToneClass = isSelected ? "text-text-primary" : "text-text-muted";
    const verticalLabelToneClass = visualState.labelUsesCustomColor
      ? "text-current"
      : verticalToneClass;
    const verticalScaleClass = isSelected ? "scale-110" : "scale-100";

    return (
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={
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
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`absolute left-1/2 top-[10px] flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-lg border border-transparent transition-colors ${verticalToneClass}`}
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
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onKeyDown={(e) => {
                  if (isContextMenuKeyboardTrigger(e)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen(true);
                    return;
                  }
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectFolder(folder.id);
                  }
                }}
              >
                {folder.label}
              </span>
            </div>
          </div>
        }
        items={buildFolderContextMenuItems({
          isSystemFolder: visualState.isSystemFolder,
          layout: "vertical",
          showSystemFolders,
          onRename: handleRename,
          onToggleLayout: handleToggleLayout,
          onToggleShowSystemFolders,
          onDelete: handleDelete,
        })}
        contentVariant="default"
        contentProps={{ sideOffset: 4, align: "start" }}
      />
    );
  },
);
