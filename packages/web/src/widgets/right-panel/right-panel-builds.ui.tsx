import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "~/i18n/i18n";
import DownloadIcon from "~/shared/assets/icons/download.svg?react";
import { createLogger } from "~/shared/lib/logger";
import {
  fetchVersionCatalog,
  useAppUpdate,
  type UpdateState,
  type UpdateVersionCatalog,
  type UpdateVersionCatalogEntry,
} from "~/shared/lib/updater";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import type { RightPanelBuildsReleaseChannel } from "./right-panel-builds.types";

const log = createLogger("right-panel-builds");
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

function getUpdateStatusText(update: UpdateState): string {
  switch (update.status) {
    case "checking":
      return t("update.checking");
    case "available":
      return t("update.available", { version: update.version ?? "?" });
    case "downloading":
      return t("update.downloading", { percent: Math.round(update.percent ?? 0) });
    case "ready":
      return t("update.readyToInstall");
    case "up-to-date":
      return t("update.upToDate");
    case "error":
      return update.error?.trim() ? update.error : t("update.error");
    case "idle":
    default:
      return t("update.upToDate");
  }
}

function isWindowsPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const browserNavigator = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = browserNavigator.userAgentData?.platform ?? navigator.platform ?? "";
  return platform.toLowerCase().includes("win");
}

function resolveDownloadUrl(entry: UpdateVersionCatalogEntry): string {
  if (isWindowsPlatform()) {
    return entry.win?.url ?? entry.linux.url;
  }
  return entry.linux.url;
}

function isLatestBuild(
  entry: UpdateVersionCatalogEntry,
  catalog: UpdateVersionCatalog | null,
  channel: RightPanelBuildsReleaseChannel,
): boolean {
  if (catalog == null) {
    return false;
  }
  const latest = catalog.latest[channel];
  return (
    entry.version === latest.version ||
    entry.version === latest.shortVersion ||
    entry.shortVersion === latest.version ||
    entry.shortVersion === latest.shortVersion
  );
}

export const RightPanelBuilds: React.FC = () => {
  const update = useAppUpdate();
  const autoCheckTriggeredRef = useRef(false);
  const [activeChannel, setActiveChannel] = useState<RightPanelBuildsReleaseChannel>("stable");
  const [catalog, setCatalog] = useState<UpdateVersionCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const statusText = useMemo(() => getUpdateStatusText(update), [update]);
  const canCheck = update.status !== "checking" && update.status !== "downloading";
  const visibleBuilds = useMemo(
    () => catalog?.versions[activeChannel] ?? [],
    [activeChannel, catalog],
  );

  useEffect(() => {
    if (autoCheckTriggeredRef.current) {
      return;
    }
    autoCheckTriggeredRef.current = true;
    update.check();
  }, [update]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError(null);

    fetchVersionCatalog(controller.signal)
      .then((nextCatalog) => {
        if (controller.signal.aborted) {
          return;
        }
        setCatalog(nextCatalog);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setCatalogError(t("update.error"));
        log.warn("Failed to load update catalog in right panel", {
          error: String(error),
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCatalogLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadToken]);

  const handleReloadCatalog = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-4 py-4">
        <h2 className="text-base font-semibold text-text-primary">{t("settings.selectBuild")}</h2>
      </header>

      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          <section className="rounded-xl border border-border-subtle bg-card-bg p-4">
            <p className="text-sm text-text-muted">
              {t("update.currentVersion", { version: APP_VERSION })}
            </p>
            <p className="mt-1.5 text-sm text-text-primary">{statusText}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={update.check}
                disabled={!canCheck}
                className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-bg disabled:opacity-50"
              >
                {t("update.check")}
              </button>
              {update.status === "ready" && (
                <button
                  type="button"
                  onClick={update.install}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs text-on-accent transition-opacity hover:opacity-90"
                >
                  {t("update.install")}
                </button>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border-subtle bg-card-bg p-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActiveChannel("stable")}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                  activeChannel === "stable"
                    ? "bg-accent text-on-accent"
                    : "bg-bg text-text-primary hover:bg-bg-elevated"
                }`}
              >
                stable
              </button>
              <button
                type="button"
                onClick={() => setActiveChannel("dev")}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                  activeChannel === "dev"
                    ? "bg-accent text-on-accent"
                    : "bg-bg text-text-primary hover:bg-bg-elevated"
                }`}
              >
                dev
              </button>
            </div>
            <p className="mt-2 text-xs text-text-muted">{t("settings.selectBuildHint")}</p>
          </section>

          {catalogError != null && (
            <section className="border-notice-base/50 bg-notice-base/10 rounded-xl border p-3">
              <p className="text-sm text-notice-base">{catalogError}</p>
              <button
                type="button"
                onClick={handleReloadCatalog}
                className="border-notice-base/50 hover:bg-notice-base/10 mt-2 rounded-md border px-2 py-1 text-xs text-notice-base transition-colors"
              >
                {t("common.retry")}
              </button>
            </section>
          )}

          {catalogLoading && visibleBuilds.length === 0 && (
            <section className="rounded-xl border border-border-subtle bg-card-bg p-4">
              <p className="text-sm text-text-muted">{t("app.loading")}</p>
            </section>
          )}

          {!catalogLoading && visibleBuilds.length === 0 && (
            <section className="rounded-xl border border-border-subtle bg-card-bg p-4">
              <p className="text-sm text-text-muted">{t("settings.selectBuildHint")}</p>
            </section>
          )}

          {visibleBuilds.length > 0 && (
            <ul className="space-y-2">
              {visibleBuilds.map((entry) => {
                const downloadUrl = resolveDownloadUrl(entry);
                const latest = isLatestBuild(entry, catalog, activeChannel);
                return (
                  <li key={`${activeChannel}:${entry.version}`}>
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-card-bg p-3 transition-colors hover:bg-bg-elevated"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {entry.version}
                          </p>
                          {latest && (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-on-accent">
                              <Icon name="check" size={10} className="text-current" />
                            </span>
                          )}
                        </div>
                        {entry.shortVersion !== entry.version && (
                          <p className="mt-0.5 truncate text-xs text-text-muted">
                            {entry.shortVersion}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-text-muted">{t("common.open")}</p>
                      </div>
                      <DownloadIcon
                        width={18}
                        height={18}
                        className="shrink-0 text-text-muted"
                        aria-hidden="true"
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
