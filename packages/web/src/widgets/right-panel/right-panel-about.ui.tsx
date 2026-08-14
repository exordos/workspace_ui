import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppUpdateSettings } from "~/features/app-update/app-update-settings.ui";
import { t } from "~/i18n/i18n";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

export const RightPanelAbout: React.FC = () => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();

  const handleOpenLicenses = useCallback(() => {
    void navigate(withCurrentOrgRoute("/licenses"));
    rightDrawer?.setOpen(false);
  }, [navigate, rightDrawer]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
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

          <AppUpdateSettings />

          <button
            type="button"
            onClick={handleOpenLicenses}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-card-bg-active"
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
