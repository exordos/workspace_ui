import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDownloadStore } from "~/entities/download/download.model";
import type { DownloadEntry } from "~/entities/download/download.types";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { TopBarDownloadRow } from "./top-bar-download-row.ui";
import { formatDownloadBytes } from "./top-bar.lib";

export const TopBarDownloadCenter = React.memo(function TopBarDownloadCenter() {
  const downloads = useDownloadStore((s) => s.entries);
  const duplicateRequestTick = useDownloadStore((s) => s.duplicateRequestTick);
  const clearDownloads = useDownloadStore((s) => s.clearDownloads);
  const removeDownload = useDownloadStore((s) => s.removeDownload);

  const [panelOpen, setPanelOpen] = useState(false);
  const [buttonPulse, setButtonPulse] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeDownloadsCount = useMemo(
    () => downloads.filter((entry) => entry.status === "downloading").length,
    [downloads],
  );

  const getStatusLabel = useCallback((entry: DownloadEntry): string => {
    if (entry.status === "downloaded") return t("downloads.ready");
    if (entry.status === "error") return t("downloads.failed");
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

  const handleToggle = useCallback(() => {
    setPanelOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (downloads.length > 0) return;
    setPanelOpen(false);
  }, [downloads.length]);

  useEffect(() => {
    if (duplicateRequestTick === 0) return;
    setButtonPulse(true);
    const timer = setTimeout(() => {
      setButtonPulse(false);
    }, 380);
    return () => clearTimeout(timer);
  }, [duplicateRequestTick]);

  useEffect(() => {
    if (!panelOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      setPanelOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPanelOpen(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [panelOpen]);

  if (downloads.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={`hover:bg-bg/50 relative rounded-lg p-2 text-text-muted transition-all hover:text-text-primary ${
          buttonPulse ? "scale-110" : ""
        }`}
        aria-label={t("downloads.open")}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        aria-controls="download-center-panel"
      >
        <Icon name="files" size={20} className="text-current" />
        {activeDownloadsCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent">
            {activeDownloadsCount}
          </span>
        )}
      </button>
      {panelOpen && (
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
              onClick={clearDownloads}
              className="text-xs text-text-muted transition-colors hover:text-text-primary"
            >
              {t("downloads.clear")}
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {downloads.map((entry) => (
              <TopBarDownloadRow
                key={entry.path}
                entry={entry}
                statusLabel={getStatusLabel(entry)}
                onRemove={removeDownload}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

TopBarDownloadCenter.displayName = "TopBarDownloadCenter";
