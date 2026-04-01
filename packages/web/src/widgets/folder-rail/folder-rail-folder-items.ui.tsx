import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React, { useCallback, useState } from "react";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { FolderContextMenuContent } from "./folder-rail-context-menu.ui";
import { getFolderItemVisualState, isContextMenuKeyboardTrigger } from "./folder-rail.lib";
import type { FolderItemProps, UseFolderItemActionsArgs } from "./folder-rail-folder-items.types";

/**
 * Общий обработчик действий item:
 * - открытие/закрытие контекстного меню;
 * - выбор папки;
 * - rename/delete;
 * - переключение layout.
 *
 * За счет этого и horizontal, и vertical item не дублируют обработчики.
 */
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
      // Не отдаем click вверх, чтобы не конфликтовать с click-capture у горизонтального drag-контейнера.
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
    const buttonTextColor = visualState.labelUsesCustomColor
      ? "text-current"
      : visualState.labelUsesAccent
        ? isSelected
          ? "text-text-primary"
          : "text-accent"
        : isSelected
          ? "text-text-primary"
          : "text-text-muted";
    const buttonColorStyle = visualState.labelUsesCustomColor
      ? { color: visualState.folderColor }
      : undefined;
    const horizontalButtonStyle =
      buttonColorStyle != null || visualState.folderSurfaceStyle != null
        ? { ...(buttonColorStyle ?? {}), ...(visualState.folderSurfaceStyle ?? {}) }
        : undefined;

    return (
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger asChild>
          <div className="shrink-0">
            <button
              type="button"
              // Гасим pointer-down, чтобы drag-контейнер не считал это началом перетаскивания.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleSelect}
              onContextMenu={handleContextMenu}
              onKeyDown={handleKeyboardContextMenu}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className={`relative flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs transition-colors ${buttonTextColor} ${
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
              {folder.badge !== undefined && (
                <span className="absolute -right-1 -top-1">
                  <Badge count={folder.badge} variant="unread" />
                </span>
              )}
            </button>
          </div>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <FolderContextMenuContent
            isSystemFolder={visualState.isSystemFolder}
            layout="horizontal"
            showSystemFolders={showSystemFolders}
            onRename={handleRename}
            onToggleLayout={handleToggleLayout}
            onToggleShowSystemFolders={onToggleShowSystemFolders}
            onDelete={handleDelete}
          />
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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
    const verticalScaleClass = isSelected ? "scale-110" : "scale-100";

    return (
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger asChild>
          <div className="flex h-[85px] w-[67px] items-center justify-center p-1">
            <div
              className={`relative h-[77px] w-[59px] origin-center transform-gpu transition-transform duration-150 ease-out motion-reduce:transition-none ${verticalScaleClass}`}
            >
              <button
                type="button"
                // Аналогично horizontal: pointer-down не должен пробрасываться наружу.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleSelect}
                onContextMenu={handleContextMenu}
                onKeyDown={handleKeyboardContextMenu}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`absolute left-1/2 top-[17px] flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-lg transition-colors ${verticalToneClass}`}
                title={folder.label}
              >
                <span className="inline-flex shrink-0">
                  <Icon name={visualState.iconName} size={40} className="shrink-0" />
                </span>
              </button>
              {folder.badge !== undefined && (
                <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
                  <Badge count={folder.badge} variant="unread" />
                </span>
              )}
              <span
                className={`absolute left-1/2 top-[57px] w-[62px] -translate-x-1/2 cursor-pointer truncate text-center text-sm leading-5 transition-colors ${verticalToneClass}`}
                title={folder.label}
                role="button"
                tabIndex={0}
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
                  // Поддерживаем клавиатурный выбор папки, чтобы label вел себя как интерактивная кнопка.
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
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <FolderContextMenuContent
            isSystemFolder={visualState.isSystemFolder}
            layout="vertical"
            showSystemFolders={showSystemFolders}
            onRename={handleRename}
            onToggleLayout={handleToggleLayout}
            onToggleShowSystemFolders={onToggleShowSystemFolders}
            onDelete={handleDelete}
          />
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  },
);
