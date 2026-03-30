import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { folderColorValueToCssHex } from "~/features/manage-folders";
import { t } from "~/i18n";
import { useShortcut } from "~/shared/lib/shortcuts";
import { Badge, Icon } from "~/shared/ui";

import { FOLDER_QUICK_LIST_SHORTCUT, resolveFolderSystemType } from "./folder-rail.lib";
import type { FolderRailFolder } from "./folder-rail.types";

export interface FolderRailQuickListProps {
  folders: { folder: FolderRailFolder; index: number }[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
}

export const FolderRailQuickList = React.memo(function FolderRailQuickList({
  folders,
  selectedFolderId,
  onSelectFolder,
}: FolderRailQuickListProps) {
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
