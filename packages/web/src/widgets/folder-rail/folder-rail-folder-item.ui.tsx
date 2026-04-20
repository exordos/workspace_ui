import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React, { useCallback, useState } from "react";
import { folderColorValueToCssHex, folderColorValueToCssRgba } from "~/features/manage-folders/folder-colors";
import { t } from "~/i18n/i18n";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import {
  DELETE_MENU_ITEM_CLASS,
  isContextMenuKeyboardTrigger,
  MENU_ITEM_CLASS,
  resolveFolderSystemType,
} from "./folder-rail.lib";
import type { FolderRailFolderItemProps } from "./folder-rail-folder-item.types";

export const FolderRailFolderItem = React.memo(function FolderRailFolderItem({
  folder,
  index,
  layout,
  isSelected,
  onSelectFolder,
  onToggleLayout,
  onRequestRename,
  onRequestDelete,
}: FolderRailFolderItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const systemType = resolveFolderSystemType(folder, index);
  const isSystemFolder = systemType !== "created";
  const isCustomFolder = !isSystemFolder;
  const folderColor = folderColorValueToCssHex(folder.backgroundColor);
  const iconName =
    systemType === "all"
      ? "folders"
      : systemType === "personal"
        ? "profile"
        : systemType === "channels"
          ? "channels"
          : isSelected
            ? "folder_open"
            : "folder";
  const iconUsesCustomColor = isCustomFolder;
  const labelUsesCustomColor = isCustomFolder && (isSelected || isHovered);
  const labelUsesAccent = isSystemFolder && (isSelected || isHovered);
  const iconTextColor = iconUsesCustomColor
    ? "text-current"
    : isSelected
      ? "text-accent"
      : "text-text-muted";
  const labelTextColor = labelUsesCustomColor
    ? "text-current"
    : labelUsesAccent
      ? "text-accent"
      : "text-text-muted";
  const iconColorStyle = iconUsesCustomColor ? { color: folderColor } : undefined;
  const labelColorStyle = labelUsesCustomColor ? { color: folderColor } : undefined;
  const folderSurfaceStyle =
    isCustomFolder && (isSelected || isHovered)
      ? {
          backgroundColor: folderColorValueToCssRgba(
            folder.backgroundColor,
            isSelected ? 0.2 : 0.1,
          ),
          borderColor: folderColorValueToCssRgba(folder.backgroundColor, isSelected ? 0.4 : 0.22),
        }
      : undefined;

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
  const toggleLayoutLabel =
    layout === "horizontal" ? t("folder.displayVertical") : t("folder.displayHorizontal");

  if (layout === "horizontal") {
    const buttonTextColor = labelUsesCustomColor
      ? "text-current"
      : labelUsesAccent
        ? "text-accent"
        : isSelected
          ? "text-text-primary"
          : "text-text-muted";
    const buttonColorStyle = labelUsesCustomColor ? { color: folderColor } : undefined;
    const horizontalButtonStyle =
      buttonColorStyle != null || folderSurfaceStyle != null
        ? { ...buttonColorStyle, ...folderSurfaceStyle }
        : undefined;

    return (
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger asChild>
          <div className="shrink-0">
            <button
              type="button"
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
              <span className={`inline-flex shrink-0 ${iconTextColor}`} style={iconColorStyle}>
                <Icon name={iconName} size={18} className="shrink-0" />
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
          <DropdownMenu.Content
            className="z-dropdown min-w-context-menu rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
            sideOffset={4}
            align="start"
          >
            <DropdownMenu.Item
              className={MENU_ITEM_CLASS}
              onSelect={handleRename}
              disabled={isSystemFolder}
            >
              <Icon name="folder" size={14} />
              {t("folder.rename")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleToggleLayout}>
              <Icon name="folders" size={14} />
              {toggleLayoutLabel}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={DELETE_MENU_ITEM_CLASS}
              onSelect={handleDelete}
              disabled={isSystemFolder}
            >
              <Icon name="close" size={14} className="text-current" />
              {t("folder.delete")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleSelect}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyboardContextMenu}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`relative flex h-10 w-10 items-center justify-center rounded-lg border border-transparent transition-colors ${
              !isSelected ? "hover:bg-bg/60" : ""
            }`}
            title={folder.label}
            style={folderSurfaceStyle}
          >
            <span className={`inline-flex shrink-0 ${iconTextColor}`} style={iconColorStyle}>
              <Icon name={iconName} size={40} className="shrink-0" />
            </span>
            {folder.badge !== undefined && (
              <span className="absolute -right-0.5 -top-0.5">
                <Badge count={folder.badge} variant="unread" />
              </span>
            )}
          </button>
          <span
            className={`max-w-[78px] cursor-pointer truncate text-center text-[11px] ${labelTextColor}`}
            title={folder.label}
            role="button"
            tabIndex={0}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleSelect}
            onContextMenu={handleContextMenu}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={labelColorStyle}
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
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-dropdown min-w-context-menu rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
          sideOffset={4}
          align="start"
        >
          <DropdownMenu.Item
            className={MENU_ITEM_CLASS}
            onSelect={handleRename}
            disabled={isSystemFolder}
          >
            <Icon name="folder" size={14} />
            {t("folder.rename")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleToggleLayout}>
            <Icon name="folders" size={14} />
            {toggleLayoutLabel}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={DELETE_MENU_ITEM_CLASS}
            onSelect={handleDelete}
            disabled={isSystemFolder}
          >
            <Icon name="close" size={14} className="text-current" />
            {t("folder.delete")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
});
