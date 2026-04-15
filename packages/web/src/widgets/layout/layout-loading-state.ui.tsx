import React from "react";
import { t } from "~/i18n/i18n";

export const LayoutFullscreenLoading: React.FC = () => (
  <div className="flex h-screen max-h-[100dvh] min-h-app-shell w-full min-w-app-shell-min items-center justify-center bg-bg text-text-primary">
    <p className="text-sm text-text-muted">{t("app.loading")}</p>
  </div>
);

export const LayoutFullscreenError: React.FC = () => (
  <div className="flex h-screen max-h-[100dvh] min-h-app-shell w-full min-w-app-shell-min items-center justify-center bg-bg text-text-primary">
    <p className="text-sm text-text-muted">{t("app.pageLoadError")}</p>
  </div>
);
