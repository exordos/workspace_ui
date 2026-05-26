import React, { useCallback } from "react";
import { useTranslation } from "~/i18n/i18n";

export interface LayoutNotificationPermissionBannerProps {
  onEnable: () => void;
  onDismiss: () => void;
  enabling: boolean;
}

export const LayoutNotificationPermissionBanner =
  React.memo<LayoutNotificationPermissionBannerProps>(function LayoutNotificationPermissionBanner({
    onEnable,
    onDismiss,
    enabling,
  }) {
    const { t } = useTranslation();

    const handleEnable = useCallback(() => {
      onEnable();
    }, [onEnable]);

    const handleDismiss = useCallback(() => {
      onDismiss();
    }, [onDismiss]);

    return (
      <div
        data-testid="notification-permission-banner"
        className="border-accent/40 bg-accent/10 z-sticky flex shrink-0 flex-col items-stretch gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        role="region"
        aria-labelledby="notification-permission-banner-title"
      >
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p
            id="notification-permission-banner-title"
            className="text-sm font-semibold text-text-primary sm:text-base"
          >
            {t("notifications.permissionBannerTitle")}
          </p>
          <p className="mt-1 text-xs text-text-muted sm:text-sm">
            {t("notifications.permissionBannerBody")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={enabling}
            className="rounded-lg border border-border-subtle bg-card-bg px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50"
          >
            {t("notifications.permissionBannerDismiss")}
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={enabling}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50"
          >
            {enabling
              ? t("notifications.permissionBannerEnabling")
              : t("notifications.permissionBannerEnable")}
          </button>
        </div>
      </div>
    );
  });
