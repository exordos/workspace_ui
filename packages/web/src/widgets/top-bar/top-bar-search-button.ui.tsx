import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { TopBarSearchButtonProps } from "./top-bar.types";

export const TopBarSearchButton = React.memo<TopBarSearchButtonProps>(({ onOpenSearch }) => {
  const handleClick = useCallback(() => {
    onOpenSearch();
  }, [onOpenSearch]);

  return (
    <button
      type="button"
      onClick={handleClick}
      hidden
      className="hidden h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
      aria-label={t("search.search")}
    >
      {/* search.svg 20×20 без padding — визуально сопоставима с соседними иконками */}
      <Icon name="search" size={20} className="text-current" />
    </button>
  );
});

TopBarSearchButton.displayName = "TopBarSearchButton";
