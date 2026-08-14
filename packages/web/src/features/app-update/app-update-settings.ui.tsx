import React from "react";
import { useTranslation } from "~/i18n/i18n";
import { isElectron } from "~/shared/lib/electron";
import { env } from "~/shared/lib/env";
import { useAppUpdate, type UpdateState } from "~/shared/lib/updater";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { rememberPendingAppUpdate } from "./app-update-installation.lib";
import { shouldShowAppUpdateSettings } from "./app-update-settings.lib";

function getUpdateStatusText(
  translate: (key: string, vars?: Record<string, unknown>) => string,
  update: UpdateState,
): string {
  switch (update.status) {
    case "checking":
      return translate("update.checking");
    case "available":
      return translate("update.available", { version: update.version ?? "?" });
    case "downloading":
      return translate("update.downloading", { percent: Math.round(update.percent ?? 0) });
    case "ready":
      return translate("update.readyToInstall");
    case "up-to-date":
      return translate("update.upToDate");
    case "error":
      return update.error?.trim() ? update.error : translate("update.error");
    case "idle":
    default:
      return translate("update.idle");
  }
}

const AppUpdateSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const update = useAppUpdate();
  const canCheck = update.status !== "checking" && update.status !== "downloading";
  const statusText = getUpdateStatusText(t, update);
  const installUpdate = () => {
    rememberPendingAppUpdate(update.version);
    update.install();
  };

  return (
    <section
      aria-label={t("update.title")}
      className="rounded-xl border border-border-subtle bg-card-bg p-4"
      data-testid="app-update-settings"
    >
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-elevated">
            <Icon name="download" size={18} className="text-accent" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">{t("update.title")}</p>
            <p className="mt-0.5 text-xs leading-4 text-text-muted">{statusText}</p>
          </div>
        </div>
        {update.status === "ready" ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs leading-4 text-text-muted">{t("update.restartHint")}</p>
            <Button type="button" size="sm" className="w-full" onClick={installUpdate}>
              {t("update.installAndRestart")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={update.check}
            disabled={!canCheck}
          >
            {t("update.check")}
          </Button>
        )}
      </div>
    </section>
  );
};

export const AppUpdateSettings: React.FC = () => {
  if (!shouldShowAppUpdateSettings(env.PROD, isElectron())) {
    return null;
  }

  return <AppUpdateSettingsContent />;
};
