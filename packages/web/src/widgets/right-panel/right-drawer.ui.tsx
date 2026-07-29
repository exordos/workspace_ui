import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { RightDrawerProps } from "./right-drawer.types";

/** Right-side drawer next to the content. Any content can be placed inside (channel info, user info, settings, etc.). */
export const RightDrawer: React.FC<RightDrawerProps> = ({ onClose, onBack, title, children }) => {
  const trimmedTitle = title?.trim() ?? "";

  return (
    <aside
      className="relative flex min-h-0 w-panel-right flex-shrink-0 flex-col overflow-hidden rounded-lg bg-bg-elevated px-2 pb-5 pt-2"
      data-focus-zone="panel"
      aria-label={t("a11y.infoPanel")}
    >
      <header className="flex flex-shrink-0 items-center gap-2 px-2 py-1">
        {onBack != null && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
            aria-label={t("common.back")}
            data-testid="right-drawer-back"
          >
            <Icon name="chevron-right" size={16} className="rotate-180 text-current" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {trimmedTitle.length > 0 ? (
            <h2 className="truncate text-base font-semibold text-text-primary">{trimmedTitle}</h2>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
          aria-label={t("common.close")}
        >
          <Icon name="close" size={16} className="text-current" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </aside>
  );
};
