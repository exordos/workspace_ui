import { useEffect } from "react";
import { t } from "~/i18n/i18n";
import { getElectronAPI } from "~/shared/lib/electron";
import { createLogger } from "~/shared/lib/logger";
import { toast } from "~/shared/lib/toast/toast";
import { consumeInstalledAppUpdate } from "./app-update-installation.lib";

const log = createLogger("app-update-installation");

export function useInstalledAppUpdateToast(): void {
  useEffect(() => {
    const api = getElectronAPI();
    if (api == null) return;

    let cancelled = false;
    void api.app
      .getVersion()
      .then((currentVersion) => {
        if (cancelled) return;
        const installedVersion = consumeInstalledAppUpdate(currentVersion);
        if (installedVersion != null) {
          toast.success(t("update.installedSuccessfully", { version: installedVersion }));
        }
      })
      .catch((error: unknown) => {
        log.warn("Failed to verify installed application update", {
          message: error instanceof Error ? error.message : "unknown",
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);
}
