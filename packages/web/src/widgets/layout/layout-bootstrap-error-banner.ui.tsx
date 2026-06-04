import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import type { LayoutBootstrapErrorBannerProps } from "./layout-bootstrap-error-banner.types";

export const LayoutBootstrapErrorBanner = React.memo(function LayoutBootstrapErrorBanner({
  error,
  onRetry,
}: LayoutBootstrapErrorBannerProps) {
  const handleRetry = useCallback(() => {
    onRetry();
  }, [onRetry]);

  if (error == null) {
    return null;
  }

  return (
    <div
      data-testid="bootstrap-error-banner"
      className="border-notice-base/60 bg-notice-base/20 z-sticky flex shrink-0 flex-col items-stretch gap-3 border-b-2 px-4 py-3 text-notice-base sm:flex-row sm:items-center sm:justify-between"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <p className="min-w-0 flex-1 text-center text-sm font-semibold leading-snug sm:text-left sm:text-base">
        {t("app.loadFailed")}
      </p>
      <button
        type="button"
        onClick={handleRetry}
        className="shrink-0 self-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      >
        {t("app.retry")}
      </button>
    </div>
  );
});
