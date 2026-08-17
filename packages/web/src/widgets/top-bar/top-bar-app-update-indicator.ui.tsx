import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { getElectronAPI } from "~/shared/lib/electron";
import { useAppUpdate, type UpdateState } from "~/shared/lib/updater";
import { Icon } from "~/shared/ui/icon";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";

function getIndicatorLabel(update: UpdateState): string {
  switch (update.status) {
    case "available":
      return t("update.available", { version: update.version ?? "?" });
    case "downloading":
      return t("update.downloading", { percent: Math.round(update.percent ?? 0) });
    case "ready":
      return t("update.readyToInstall");
    default:
      return t("update.title");
  }
}

const TopBarAppUpdateIndicatorButton: React.FC<{ update: UpdateState }> = ({ update }) => {
  const openAbout = useRightDrawerStore((state) => state.openAbout);
  const handleClick = useCallback(() => openAbout(), [openAbout]);
  const label = getIndicatorLabel(update);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-accent-soft text-accent transition-colors hover:border-accent hover:bg-card-bg-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ${
        update.status === "downloading" ? "animate-pulse" : ""
      }`}
      aria-label={label}
      title={label}
      data-testid="topbar-app-update-indicator"
    >
      <Icon name="download" size={18} className="text-current" />
      <span
        aria-hidden
        className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent ring-1 ring-bg-elevated"
      />
    </button>
  );
};

const TopBarAppUpdateIndicatorContent = React.memo(function TopBarAppUpdateIndicatorContent() {
  const update = useAppUpdate();
  const visible =
    update.status === "available" || update.status === "downloading" || update.status === "ready";

  if (!visible) return null;

  return <TopBarAppUpdateIndicatorButton update={update} />;
});

TopBarAppUpdateIndicatorContent.displayName = "TopBarAppUpdateIndicatorContent";

export const TopBarAppUpdateIndicator = React.memo(function TopBarAppUpdateIndicator() {
  if (getElectronAPI()?.updater == null) return null;

  return <TopBarAppUpdateIndicatorContent />;
});

TopBarAppUpdateIndicator.displayName = "TopBarAppUpdateIndicator";
