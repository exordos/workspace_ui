import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { folderColorValueToCssHex } from "~/features/manage-folders/folder-colors";
import { t } from "~/i18n/i18n";
import { useShortcut } from "~/shared/lib/shortcuts";
import { Badge } from "~/shared/ui/badge";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";
import { SearchInput } from "~/shared/ui/search-input";
import { FOLDER_QUICK_LIST_SHORTCUT, resolveFolderSystemType } from "./folder-rail.lib";
import type { FolderQuickListProps } from "./folder-rail-quick-list.types";

export const FolderQuickList: React.FC<FolderQuickListProps> = React.memo(function FolderQuickList({
  folders,
  selectedFolderId,
  onSelectFolder,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  // null означает "активный элемент не зафиксирован вручную", используем вычисление по selectedFolderId.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
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
    setActiveIndex(null);
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
    // При открытии всегда сбрасываем ручной индекс, чтобы стартовать из актуального selected.
    setActiveIndex(null);
  }, []);

  useShortcut(FOLDER_QUICK_LIST_SHORTCUT, openQuickList, {
    context: "sidebar",
    enabled: folders.length > 0,
  });

  useEffect(() => {
    if (!menuOpen) return;
    // Фокус ставим в следующем кадре, чтобы контент меню успел смонтироваться.
    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [menuOpen]);

  const resolvedActiveIndex = useMemo(() => {
    if (!menuOpen) return -1;
    if (filteredFolders.length === 0) {
      return -1;
    }
    if (activeIndex != null) {
      // Защита от выхода индекса за границы после изменения фильтра.
      return Math.min(Math.max(activeIndex, 0), filteredFolders.length - 1);
    }
    // Пока пользователь не двигал фокус стрелками, активируем текущую выбранную папку.
    const selectedIndex = filteredFolders.findIndex(({ folder }) => folder.id === selectedFolderId);
    return selectedIndex >= 0 ? selectedIndex : 0;
  }, [activeIndex, filteredFolders, menuOpen, selectedFolderId]);

  useEffect(() => {
    if (resolvedActiveIndex < 0) return;
    const activeItem = activeItemRef.current;
    if (!activeItem || typeof activeItem.scrollIntoView !== "function") return;
    activeItem.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [resolvedActiveIndex]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((currentIndex) => {
          if (filteredFolders.length === 0) return null;
          if (currentIndex == null || currentIndex < 0) {
            // Первый ArrowDown двигает на следующий элемент относительно auto-выбранного.
            return Math.min(Math.max(resolvedActiveIndex, 0) + 1, filteredFolders.length - 1);
          }
          return Math.min(currentIndex + 1, filteredFolders.length - 1);
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((currentIndex) => {
          if (filteredFolders.length === 0) return null;
          if (currentIndex == null || currentIndex < 0) {
            // Первый ArrowUp двигает на предыдущий элемент относительно auto-выбранного.
            return Math.max(Math.max(resolvedActiveIndex, 0) - 1, 0);
          }
          return Math.max(currentIndex - 1, 0);
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const activeFolder =
          resolvedActiveIndex >= 0 ? filteredFolders[resolvedActiveIndex] : undefined;
        if (!activeFolder) return;
        handleFolderSelect(activeFolder.folder.id);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAndReset();
      }
    },
    [closeAndReset, filteredFolders, handleFolderSelect, resolvedActiveIndex],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setQuery(value);
      // При изменении запроса пересчитываем активный элемент заново из выбранной папки.
      setActiveIndex(null);
    },
    [setActiveIndex, setQuery],
  );

  const menuItems = useMemo<DropdownMenuItem[]>(
    () => [
      {
        type: "custom",
        key: "folder-quick-list-custom",
        render: () => (
          <>
            <p className="px-1 pb-2 text-xs font-medium text-text-muted">
              {t("folder.quickListTitle")}
            </p>
            <SearchInput
              ref={searchInputRef}
              value={query}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              placeholder={t("folder.searchFolders")}
              ariaLabel={t("folder.searchFolders")}
              size="sm"
              className="rounded-md bg-bg px-2 py-1.5"
              inputClassName="w-full"
            />
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
                const isActive = resolvedActiveIndex === listIndex;
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
          </>
        ),
      },
    ],
    [
      filteredFolders,
      handleFolderSelect,
      handleSearchChange,
      handleSearchKeyDown,
      query,
      resolvedActiveIndex,
      selectedFolderId,
    ],
  );

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(nextOpen) => {
        setMenuOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
          setActiveIndex(null);
        }
      }}
      items={menuItems}
      contentClassName="w-folder-quick-list p-2"
      triggerContentProps={{ side: "right", align: "start", sideOffset: 8 }}
      trigger={
        <button
          type="button"
          className="hover:bg-bg/60 flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle text-text-muted transition-colors hover:text-text-primary"
          aria-label={t("folder.openQuickList")}
          title={t("folder.openQuickList")}
        >
          <Icon name="more" size={28} className="shrink-0" />
        </button>
      }
    />
  );
});
