import React, { useImperativeHandle, useRef } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { SearchInput } from "~/shared/ui/search-input";
import { moveWorkspaceSidebarSearchFocus } from "./sidebar-workspace-search.lib";
import type { SidebarSearchHeaderProps } from "./sidebar-search-header.types";

export const SidebarSearchHeader: React.FC<SidebarSearchHeaderProps> = ({
  searchRef,
  searchQuery,
  onSearchQueryChange,
  onOpenCreateChat,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useImperativeHandle(searchRef, () => {
    const cancel = () => {
      const input = searchInputRef.current;
      if (input == null) return false;

      const inputFocused = input.isSameNode(input.ownerDocument.activeElement);
      if (!inputFocused && searchQuery.length === 0) return false;

      onSearchQueryChange("");
      if (inputFocused) {
        input.blur();
        previousFocusRef.current?.focus({ preventScroll: true });
      }
      previousFocusRef.current = null;
      return true;
    };

    return {
      cancel,
      isSearchInput: (element) => searchInputRef.current?.isSameNode(element) === true,
      toggle: ({ openOnly }) => {
        if (!openOnly && cancel()) return;

        const input = searchInputRef.current;
        if (input == null) return;
        const activeElement = input.ownerDocument.activeElement;
        previousFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
        input.focus();
      },
    };
  }, [onSearchQueryChange, searchQuery]);

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-4">
      <SearchInput
        ref={searchInputRef}
        value={searchQuery}
        onChange={onSearchQueryChange}
        onKeyDown={moveWorkspaceSidebarSearchFocus}
        placeholder={t("search.find")}
        ariaLabel={t("search.search")}
        className="flex-1"
      />
      {onOpenCreateChat != null ? (
        <button
          type="button"
          onClick={onOpenCreateChat}
          className="hover:bg-bg/60 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-primary"
          aria-label={t("nav.newChat")}
        >
          {/* The cropped viewBox lets the glyph fill the 21px layout box. */}
          <Icon name="newWindow" size={21} />
        </button>
      ) : null}
    </div>
  );
};
