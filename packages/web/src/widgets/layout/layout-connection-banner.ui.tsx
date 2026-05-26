import React, { useCallback, useMemo } from "react";
import { t } from "~/i18n/i18n";
import { resolveLayoutConnectionBannerMessage } from "./layout-connection-banner.lib";
import type { LayoutConnectionBannerProps } from "./layout-connection-banner.types";

export const LayoutConnectionBanner = React.memo<LayoutConnectionBannerProps>(
  function LayoutConnectionBanner({ online, health, rateLimitSeconds }) {
    const message = useMemo(
      () => resolveLayoutConnectionBannerMessage(online, health, rateLimitSeconds),
      [online, health, rateLimitSeconds],
    );

    const handleReload = useCallback(() => {
      window.location.reload();
    }, []);

    if (message == null) {
      return null;
    }

    return (
      <div
        data-testid="connection-banner"
        className="border-notice-base/60 bg-notice-base/20 z-sticky flex shrink-0 flex-col items-stretch gap-3 border-b-2 px-4 py-3 text-notice-base sm:flex-row sm:items-center sm:justify-between"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <p className="min-w-0 flex-1 text-center text-sm font-semibold leading-snug sm:text-left sm:text-base">
          {message}
        </p>
        <button
          type="button"
          onClick={handleReload}
          className="shrink-0 self-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          {t("app.reload")}
        </button>
      </div>
    );
  },
);
