import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { requestReconnect } from "~/shared/lib/connection-health";

export const LayoutFullscreenLoading: React.FC = () => (
  <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-bg text-text-primary">
    <p className="text-sm text-text-muted">{t("app.loading")}</p>
  </div>
);

export const LayoutConnectionBlocked = React.memo(function LayoutConnectionBlocked() {
  const handleRetry = useCallback(() => {
    requestReconnect();
  }, []);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 bg-bg p-8 text-text-primary"
      role="alert"
    >
      <p className="text-center text-sm text-text-muted">{t("app.connectionFailed")}</p>
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={handleRetry}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          {t("app.retryConnection")}
        </button>
        <button
          type="button"
          onClick={handleReload}
          className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-primary"
        >
          {t("app.reloadApp")}
        </button>
      </div>
    </div>
  );
});
