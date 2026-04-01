import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { SidebarSearchHeaderProps } from "./sidebar-search-header.types";

export const SidebarSearchHeader: React.FC<SidebarSearchHeaderProps> = ({
  searchQuery,
  onSearchQueryChange,
  onOpenCreateChat,
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchQueryChange(e.target.value);
    },
    [onSearchQueryChange],
  );

  return (
    <div className="flex items-center gap-2 px-3 pb-3 pt-4">
      <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-text-field-bg px-2 py-0.5 text-text-muted opacity-100 focus-within:border-accent focus-within:text-text-primary">
        <input
          type="search"
          placeholder={t("search.find")}
          value={searchQuery}
          onChange={handleChange}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          aria-label={t("search.search")}
        />
        <Icon name="search" size={20} className="shrink-0" />
      </label>
      <button
        type="button"
        onClick={onOpenCreateChat}
        className="hover:bg-bg/60 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-primary"
        aria-label={t("nav.newChat")}
      >
        <Icon name="newWindow" size={20} />
      </button>
    </div>
  );
};

