import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { env } from "~/shared/lib/env";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { getRuntime } from "~/shared/lib/pwa";
import { isWebView } from "~/shared/lib/webview";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

function getBuildTypeLabel(): string {
  return env.PROD ? t("settings.aboutBuildTypeRelease") : t("settings.aboutBuildTypeDebug");
}

function getRuntimeLabel(): string {
  if (isWebView()) {
    return t("settings.aboutRuntimeWebview");
  }

  const runtime = getRuntime();
  if (runtime === "electron") return t("settings.aboutRuntimeElectron");
  if (runtime === "pwa") return t("settings.aboutRuntimePwa");
  return t("settings.aboutRuntimeBrowser");
}

function getPlatformLabel(): string {
  if (typeof navigator === "undefined") {
    return t("settings.aboutUnknown");
  }

  const userAgentDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;

  const platform = userAgentDataPlatform ?? navigator.platform;
  return platform && platform.trim().length > 0 ? platform : t("settings.aboutUnknown");
}

export const RightPanelAbout: React.FC = () => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();

  const handleOpenLicenses = useCallback(() => {
    void navigate(withCurrentOrgRoute("/licenses"));
    rightDrawer?.setOpen(false);
  }, [navigate, rightDrawer]);

  const technicalDetails = [
    { label: t("settings.aboutEnvironment"), value: env.MODE },
    { label: t("settings.aboutBuildType"), value: getBuildTypeLabel() },
    { label: t("settings.aboutRuntime"), value: getRuntimeLabel() },
    { label: t("settings.aboutPlatform"), value: getPlatformLabel() },
    { label: t("settings.aboutBaseUrl"), value: env.BASE_URL || t("settings.aboutUnknown") },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-4 py-4">
        <h2 className="text-base font-semibold text-text-primary">{t("settings.appVersion")}</h2>
      </header>
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          <section className="rounded-xl border border-border-subtle bg-card-bg p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-elevated">
                <Icon name="info" size={18} className="text-accent" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{t("settings.appVersion")}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {t("update.currentVersion", { version: APP_VERSION })}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border-subtle bg-card-bg p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">
              {t("settings.aboutTechnicalDetails")}
            </p>
            <ul className="space-y-2">
              {technicalDetails.map((detail) => (
                <li key={detail.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text-muted">{detail.label}</span>
                  <span className="truncate text-text-primary">{detail.value}</span>
                </li>
              ))}
            </ul>
          </section>

          <button
            type="button"
            onClick={handleOpenLicenses}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-elevated">
                <Icon name="newWindow" size={18} className="text-accent" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{t("licenses.title")}</p>
                <p className="mt-0.5 text-xs text-text-muted">{t("common.open")}</p>
              </div>
            </div>
            <Icon name="chevron-right" size={18} className="text-text-muted" />
          </button>
        </div>
      </ScrollArea>
    </div>
  );
};
