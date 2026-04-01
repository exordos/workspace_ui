import React from "react";
import { t } from "~/i18n/i18n";
import { DESKTOP_MIN_VIEWPORT_STYLE } from "./layout-desktop-viewport.lib";

export const LayoutFullscreenLoading: React.FC = () => (
  <div
    className="flex h-screen max-h-[100dvh] min-h-app-shell items-center justify-center bg-bg text-text-primary"
    style={DESKTOP_MIN_VIEWPORT_STYLE}
  >
    <p className="text-sm text-text-muted">{t("app.loading")}</p>
  </div>
);

export const LayoutFullscreenError: React.FC = () => (
  <div
    className="flex h-screen max-h-[100dvh] min-h-app-shell items-center justify-center bg-bg text-text-primary"
    style={DESKTOP_MIN_VIEWPORT_STYLE}
  >
    <p className="text-sm text-text-muted">{t("app.pageLoadError")}</p>
  </div>
);
