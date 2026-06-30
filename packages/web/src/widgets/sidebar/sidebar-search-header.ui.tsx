import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { SearchInput } from "~/shared/ui/search-input";
import type { SidebarSearchHeaderProps } from "./sidebar-search-header.types";

export const SidebarSearchHeader: React.FC<SidebarSearchHeaderProps> = ({
  searchQuery,
  onSearchQueryChange,
  onOpenCreateChat,
}) => {
  return (
    <div className="flex items-center gap-2 px-3 pb-3 pt-4">
      <SearchInput
        value={searchQuery}
        onChange={onSearchQueryChange}
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
          <Icon name="newWindow" size={20} />
        </button>
      ) : null}
    </div>
  );
};
