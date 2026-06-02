import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { resolveTopBarSectionButtonClassName } from "./top-bar.lib";
import type { TopBarSectionButtonProps } from "./top-bar.types";

export const TopBarSectionButton = React.memo<TopBarSectionButtonProps>(
  ({ id, icon, label, available, isActive, onSelect }) => {
    const handleClick = useCallback(() => {
      onSelect(id);
    }, [id, onSelect]);

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!available}
        title={!available ? t("app.webModeUnavailable") : undefined}
        className={`flex h-10 w-10 items-center justify-center rounded-lg opacity-100 transition-colors ${resolveTopBarSectionButtonClassName(isActive, available)}`}
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon name={icon} size={24} className="text-current" />
      </button>
    );
  },
);

TopBarSectionButton.displayName = "TopBarSectionButton";
