import React, { useCallback, useMemo } from "react";
import { useTranslation } from "~/i18n/i18n";
import { LayoutTopBannerOverlay } from "./layout-top-banner-overlay.ui";
import type { LayoutTopBannerItem } from "./layout-top-banner.types";

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

    const item = useMemo<LayoutTopBannerItem>(
      () => ({
        id: "notification-permission",
        message: t("notifications.permissionBannerTitle"),
        title: t("notifications.permissionBannerTitle"),
        description: t("notifications.permissionBannerBody"),
        severity: "warning",
        canCollapse: true,
        secondaryActionLabel: t("notifications.permissionBannerDismiss"),
        secondaryActionDisabled: enabling,
        onSecondaryAction: handleDismiss,
        primaryActionLabel: enabling
          ? t("notifications.permissionBannerEnabling")
          : t("notifications.permissionBannerEnable"),
        primaryActionDisabled: enabling,
        onPrimaryAction: handleEnable,
      }),
      [enabling, handleDismiss, handleEnable, t],
    );

    return <LayoutTopBannerOverlay item={item} />;
  });
