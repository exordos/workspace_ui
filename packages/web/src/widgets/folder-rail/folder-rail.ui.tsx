import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createFolder,
  updateFolder,
  deleteFolder,
  CreateFolderModal,
  UpdateFolderModal,
  folderColorValueToCssHex,
  folderColorValueToCssRgba,
} from "~/features/manage-folders";
import { useSettingsStore } from "~/features/settings";
import { t } from "~/i18n";
import { useShortcut } from "~/shared/lib/shortcuts";
import { Badge, Icon } from "~/shared/ui";

export interface FolderRailFolder {
  id: string;
  label: string;
  backgroundColor: number;
  badge?: number;
  systemType?: "created" | "all" | "personal" | "channels";
}

export type FolderRailLayout = "vertical" | "horizontal";

const MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none data-[highlighted]:bg-accent/20 data-[disabled]:cursor-default data-[disabled]:opacity-40";
const DELETE_MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-notice-base outline-none data-[highlighted]:bg-notice-base/10 data-[highlighted]:text-notice-base data-[disabled]:cursor-default data-[disabled]:opacity-40";
const FOLDER_QUICK_LIST_THRESHOLD = 10;
const FOLDER_QUICK_LIST_SHORTCUT = "mod+shift+f";

function isContextMenuKeyboardTrigger(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

function resolveFolderSystemType(
  folder: FolderRailFolder,
  index: number,
): NonNullable<FolderRailFolder["systemType"]> {
  if (folder.systemType != null) {
    return folder.systemType;
  }
  return index === 0 ? "all" : "created";
}

const FolderItem = React.memo(function FolderItem({
  folder,
  index,
  layout,
  isSelected,
  onSelectFolder,
  onToggleLayout,
  onRequestRename,
  onRequestDelete,
}: {
  folder: FolderRailFolder;
  index: number;
  layout: FolderRailLayout;
  isSelected: boolean;
  onSelectFolder: (id: string) => void;
  onToggleLayout: () => void;
  onRequestRename: (folder: FolderRailFolder) => void;
  onRequestDelete: (folder: FolderRailFolder) => void;
}) {
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
        ? { ...(buttonColorStyle ?? {}), ...(folderSurfaceStyle ?? {}) }
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
            className="z-dropdown min-w-[160px] rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
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
          className="z-dropdown min-w-[160px] rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
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

const FolderQuickList = React.memo(function FolderQuickList({
  folders,
  selectedFolderId,
  onSelectFolder,
}: {
  folders: { folder: FolderRailFolder; index: number }[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredFolders = useMemo(() => {
    if (!normalizedQuery) return folders;
    return folders.filter(({ folder }) => folder.label.toLowerCase().includes(normalizedQuery));
  }, [folders, normalizedQuery]);

  const closeAndReset = useCallback(() => {
    setMenuOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }, []);

  const handleFolderSelect = useCallback(
    (folderId: string) => {
      onSelectFolder(folderId);
      closeAndReset();
    },
    [closeAndReset, onSelectFolder],
  );

  const openQuickList = useCallback(() => {
    setMenuOpen(true);
  }, []);

  useShortcut(FOLDER_QUICK_LIST_SHORTCUT, openQuickList, {
    context: "sidebar",
    enabled: folders.length > 0,
  });

  useEffect(() => {
    if (!menuOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    if (filteredFolders.length === 0) {
      setActiveIndex(-1);
      return;
    }
    const selectedIndex = filteredFolders.findIndex(({ folder }) => folder.id === selectedFolderId);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredFolders, menuOpen, selectedFolderId]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const activeItem = activeItemRef.current;
    if (!activeItem || typeof activeItem.scrollIntoView !== "function") return;
    activeItem.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((currentIndex) => {
          if (filteredFolders.length === 0) return -1;
          if (currentIndex < 0) return 0;
          return Math.min(currentIndex + 1, filteredFolders.length - 1);
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((currentIndex) => {
          if (filteredFolders.length === 0) return -1;
          if (currentIndex < 0) return 0;
          return Math.max(currentIndex - 1, 0);
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const activeFolder = activeIndex >= 0 ? filteredFolders[activeIndex] : undefined;
        if (!activeFolder) return;
        handleFolderSelect(activeFolder.folder.id);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAndReset();
      }
    },
    [activeIndex, closeAndReset, filteredFolders, handleFolderSelect],
  );

  return (
    <DropdownMenu.Root
      open={menuOpen}
      onOpenChange={(nextOpen) => {
        setMenuOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
          setActiveIndex(-1);
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="hover:bg-bg/60 flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle text-text-muted transition-colors hover:text-text-primary"
          aria-label={t("folder.openQuickList")}
          title={t("folder.openQuickList")}
        >
          <Icon name="more" size={40} className="shrink-0" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-dropdown w-[260px] rounded-lg border border-border-subtle bg-bg-elevated p-2 shadow-lg"
          side="right"
          align="start"
          sideOffset={8}
        >
          <p className="px-1 pb-2 text-xs font-medium text-text-muted">
            {t("folder.quickListTitle")}
          </p>
          <label className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 py-1.5">
            <Icon name="search" size={16} className="text-text-muted" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t("folder.searchFolders")}
              className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              aria-label={t("folder.searchFolders")}
            />
          </label>
          <div
            data-testid="folder-quick-list"
            className="mt-2 max-h-64 space-y-0.5 overflow-y-auto"
          >
            {filteredFolders.map(({ folder, index }, listIndex) => {
              const systemType = resolveFolderSystemType(folder, index);
              const isSystemFolder = systemType !== "created";
              const iconName =
                systemType === "all"
                  ? "folders"
                  : systemType === "personal"
                    ? "profile"
                    : systemType === "channels"
                      ? "channels"
                      : "folder";
              const isSelected = selectedFolderId === folder.id;
              const isActive = activeIndex === listIndex;
              return (
                <button
                  key={folder.id}
                  type="button"
                  ref={(node) => {
                    if (isActive) {
                      activeItemRef.current = node;
                    }
                  }}
                  data-active={isActive ? "true" : undefined}
                  onClick={() => handleFolderSelect(folder.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary transition-colors ${
                    isActive
                      ? "bg-accent/20"
                      : isSelected
                        ? "bg-accent/10"
                        : "hover:bg-sidebar-hover"
                  }`}
                >
                  <span
                    className={`inline-flex shrink-0 ${isSystemFolder ? "text-accent" : "text-current"}`}
                    style={
                      !isSystemFolder
                        ? { color: folderColorValueToCssHex(folder.backgroundColor) }
                        : undefined
                    }
                  >
                    <Icon name={iconName} size={18} />
                  </span>
                  <span className="flex-1 truncate">{folder.label}</span>
                  {folder.badge !== undefined && <Badge count={folder.badge} variant="unread" />}
                </button>
              );
            })}
            {filteredFolders.length === 0 && (
              <p className="px-2 py-3 text-xs text-text-muted">{t("folder.noFoldersFound")}</p>
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
});

interface FolderRailProps {
  folders: FolderRailFolder[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onOrderPinning?: (id: string) => void;
  onToggleLayout?: () => void;
  onFoldersChanged?: () => void;
  layout?: FolderRailLayout;
}

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
          <FolderItem
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
            <FolderItem
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
              <FolderItem
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
        <FolderQuickList
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
