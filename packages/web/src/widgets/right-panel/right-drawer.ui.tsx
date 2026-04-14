import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { RightDrawerProps } from "./right-drawer.types";

/** Right-side drawer next to the content. Any content can be placed inside (channel info, user info, settings, etc.). */
export const RightDrawer: React.FC<RightDrawerProps> = ({ onClose, children }) => {
  return (
    <aside
      className="relative flex min-h-0 w-panel-right flex-shrink-0 flex-col overflow-hidden bg-sidebar-bg px-2 py-5"
      data-focus-zone="panel"
      aria-label={t("a11y.infoPanel")}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-2 z-sticky flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
        aria-label={t("common.close")}
      >
        <Icon name="close" size={16} className="text-current" />
      </button>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </aside>
  );
};
