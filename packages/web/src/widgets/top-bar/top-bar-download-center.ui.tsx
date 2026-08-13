import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDownloadStore } from "~/entities/download/download.model";
import type { DownloadEntry } from "~/entities/download/download.types";
import { useWorkspaceDownloadSync } from "~/features/workspace-file-download/workspace-file-download-sync.hook";
import {
  cancelWorkspaceDownload,
  dismissWorkspaceDownloads,
  openWorkspaceDownload,
  retryWorkspaceDownload,
  revealWorkspaceDownload,
} from "~/features/workspace-file-download/workspace-file-download.lib";
import { t } from "~/i18n/i18n";
import { useDismissOnOutsideAndEscape } from "~/shared/lib/use-dismiss-on-outside-escape.hook";
import { Icon } from "~/shared/ui/icon";
import { TopBarDownloadRow } from "./top-bar-download-row.ui";
import { formatDownloadBytes } from "./top-bar.lib";

function isActive(entry: DownloadEntry): boolean {
  return entry.status === "starting" || entry.status === "downloading";
}

export const TopBarDownloadCenter = React.memo(function TopBarDownloadCenter() {
  useWorkspaceDownloadSync();

  const downloads = useDownloadStore((state) => state.entries);
  const duplicateRequestTick = useDownloadStore((state) => state.duplicateRequestTick);
  const nativeActionsAvailable = window.electronAPI?.downloads != null;

  const [panelOpen, setPanelOpen] = useState(false);
  const [buttonPulse, setButtonPulse] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeDownloadsCount = useMemo(() => downloads.filter(isActive).length, [downloads]);
  const dismissibleIds = useMemo(
    () => downloads.filter((entry) => !isActive(entry)).map((entry) => entry.id),
    [downloads],
  );

  const getStatusLabel = useCallback((entry: DownloadEntry): string => {
    if (entry.status === "downloaded") return t("downloads.ready");
    if (entry.status === "error") {
      return entry.errorCode === "cancelled" ? t("downloads.cancelled") : t("downloads.failed");
    }
    if (entry.status === "starting") return t("downloads.starting");
    if (entry.totalBytes != null && entry.totalBytes > 0) {
      const percent = Math.min(100, Math.round((entry.receivedBytes / entry.totalBytes) * 100));
      return t("downloads.downloadingWithTotal", {
        percent,
        received: formatDownloadBytes(entry.receivedBytes),
        total: formatDownloadBytes(entry.totalBytes),
      });
    }
    return t("downloads.downloadingWithoutTotal", {
      received: formatDownloadBytes(entry.receivedBytes),
    });
  }, []);

  const handleToggle = useCallback(() => setPanelOpen((open) => !open), []);
  const handleDismissPanel = useCallback(() => setPanelOpen(false), []);
  const handleCancel = useCallback((id: string) => void cancelWorkspaceDownload(id), []);
  const handleOpen = useCallback((id: string) => void openWorkspaceDownload(id), []);
  const handleReveal = useCallback((id: string) => void revealWorkspaceDownload(id), []);
  const handleRetry = useCallback((id: string) => void retryWorkspaceDownload(id), []);
  const handleRemove = useCallback((id: string) => {
    void dismissWorkspaceDownloads([id]);
  }, []);
  const handleClear = useCallback(() => {
    if (dismissibleIds.length === 0) return;
    void dismissWorkspaceDownloads(dismissibleIds);
  }, [dismissibleIds]);

  useEffect(() => {
    if (downloads.length > 0) return;
    setPanelOpen(false);
  }, [downloads.length]);

  useEffect(() => {
    if (duplicateRequestTick === 0) return;
    setButtonPulse(true);
    const timer = setTimeout(() => setButtonPulse(false), 380);
    return () => clearTimeout(timer);
  }, [duplicateRequestTick]);

  useDismissOnOutsideAndEscape({
    enabled: panelOpen,
    containerRef,
    onDismiss: handleDismissPanel,
  });

  if (downloads.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={`relative rounded-lg p-2 text-text-muted transition-all hover:bg-card-bg-active hover:text-text-primary ${
          buttonPulse ? "scale-110" : ""
        }`}
        aria-label={t("downloads.open")}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        aria-controls="download-center-panel"
      >
        <Icon name="files" size={20} className="text-current" />
        {activeDownloadsCount > 0 ? (
          <span className="pointer-events-none absolute -right-1 -top-1 z-sticky min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent">
            {activeDownloadsCount}
          </span>
        ) : null}
      </button>
      {panelOpen ? (
        <div
          id="download-center-panel"
          role="dialog"
          aria-label={t("downloads.title")}
          className="absolute right-0 top-11 z-dropdown w-80 overflow-hidden rounded-xl border border-border-subtle bg-card-bg shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
            <span className="text-sm font-medium text-text-primary">{t("downloads.title")}</span>
            <button
              type="button"
              onClick={handleClear}
              disabled={dismissibleIds.length === 0}
              className="text-xs text-text-muted transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-40"
            >
              {t("downloads.clear")}
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {downloads.map((entry) => (
              <TopBarDownloadRow
                key={entry.id}
                entry={entry}
                statusLabel={getStatusLabel(entry)}
                nativeActionsAvailable={nativeActionsAvailable}
                onCancel={handleCancel}
                onOpen={handleOpen}
                onReveal={handleReveal}
                onRetry={handleRetry}
                onRemove={handleRemove}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
});

TopBarDownloadCenter.displayName = "TopBarDownloadCenter";
