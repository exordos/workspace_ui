import React from "react";
import { t } from "~/i18n/i18n";
import type { SidebarPinReorderBannerProps } from "./sidebar-pin-reorder-banner.types";

export const SidebarPinReorderBanner: React.FC<SidebarPinReorderBannerProps> = ({ onClose }) => {
  return (
    <div className="mx-3 mb-2 flex items-center justify-between rounded-lg border border-border-subtle bg-bg-elevated px-2.5 py-1.5">
      <span className="text-xs font-medium text-text-primary">{t("settings.chatSorting")}</span>
      <button
        type="button"
        onClick={onClose}
        className="hover:bg-bg/50 rounded px-2 py-0.5 text-xs text-text-muted transition-colors hover:text-text-primary"
        aria-label={t("common.close")}
      >
        {t("common.close")}
      </button>
    </div>
  );
};

