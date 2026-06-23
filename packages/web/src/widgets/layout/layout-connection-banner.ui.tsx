import React, { useCallback, useMemo } from "react";
import { t } from "~/i18n/i18n";
import { requestReconnect } from "~/shared/lib/connection-health";
import {
  resolveLayoutConnectionBannerMessage,
  resolveLayoutConnectionBannerSeverity,
} from "./layout-connection-banner.lib";
import { LayoutTopBannerOverlay } from "./layout-top-banner-overlay.ui";
import type { LayoutConnectionBannerProps } from "./layout-connection-banner.types";
import type { LayoutTopBannerItem } from "./layout-top-banner.types";

export const LayoutConnectionBanner = React.memo<LayoutConnectionBannerProps>(
  function LayoutConnectionBanner({ online, health, rateLimitSeconds }) {
    const message = useMemo(
      () => resolveLayoutConnectionBannerMessage(online, health, rateLimitSeconds),
      [online, health, rateLimitSeconds],
    );
    const severity = useMemo(
      () => resolveLayoutConnectionBannerSeverity(online, health),
      [online, health],
    );

    const handleRetry = useCallback(() => {
      requestReconnect();
    }, []);

    const item = useMemo<LayoutTopBannerItem | null>(() => {
      if (message == null) {
        return null;
      }
      return {
        id: "connection",
        message,
        severity,
        canCollapse: true,
        primaryActionLabel: t("app.retryConnection"),
        onPrimaryAction: handleRetry,
      };
    }, [handleRetry, message, severity]);

    return <LayoutTopBannerOverlay item={item} />;
  },
);
