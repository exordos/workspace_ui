import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { TopBarDownloadRowProps } from "./top-bar.types";

const ACTION_CLASS =
  "rounded p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export const TopBarDownloadRow = React.memo<TopBarDownloadRowProps>(
  ({
    entry,
    statusLabel,
    nativeActionsAvailable,
    onCancel,
    onOpen,
    onReveal,
    onRetry,
    onRemove,
  }) => {
    const active = entry.status === "starting" || entry.status === "downloading";
    const percent =
      active && entry.totalBytes != null && entry.totalBytes > 0
        ? Math.min(100, Math.round((entry.receivedBytes / entry.totalBytes) * 100))
        : null;

    const handleCancel = useCallback(() => onCancel(entry.id), [entry.id, onCancel]);
    const handleOpen = useCallback(() => onOpen(entry.id), [entry.id, onOpen]);
    const handleReveal = useCallback(() => onReveal(entry.id), [entry.id, onReveal]);
    const handleRetry = useCallback(() => onRetry(entry.id), [entry.id, onRetry]);
    const handleRemove = useCallback(() => onRemove(entry.id), [entry.id, onRemove]);

    const status = active ? (
      <span
        className="block truncate text-xs text-text-muted"
        role="progressbar"
        aria-label={`${entry.fileName}: ${statusLabel}`}
        aria-valuemin={percent == null ? undefined : 0}
        aria-valuemax={percent == null ? undefined : 100}
        aria-valuenow={percent ?? undefined}
      >
        {statusLabel}
      </span>
    ) : (
      <span
        className={`block truncate text-xs ${
          entry.status === "error" ? "text-notice-base" : "text-text-muted"
        }`}
        role="status"
        aria-live="polite"
      >
        {statusLabel}
      </span>
    );

    const content = (
      <>
        <span className="block truncate text-sm font-medium text-text-primary">
          {entry.fileName}
        </span>
        {status}
      </>
    );

    let mainContent: React.ReactNode = <div className="min-w-0 flex-1 px-1 py-1">{content}</div>;
    if (nativeActionsAvailable && entry.status === "downloaded") {
      mainContent = (
        <button
          type="button"
          onClick={handleOpen}
          className="min-w-0 flex-1 rounded px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`${t("downloads.openFile")} ${entry.fileName}`}
        >
          {content}
        </button>
      );
    } else if (nativeActionsAvailable && entry.status === "error") {
      mainContent = (
        <button
          type="button"
          onClick={handleRetry}
          className="min-w-0 flex-1 rounded px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`${t("downloads.retry")} ${entry.fileName}`}
        >
          {content}
        </button>
      );
    }

    return (
      <li className="hover:bg-bg-elevated/60 flex items-center gap-1 rounded-lg px-1 py-1">
        {mainContent}

        {nativeActionsAvailable && active ? (
          <button
            type="button"
            onClick={handleCancel}
            className={ACTION_CLASS}
            aria-label={`${t("downloads.cancel")} ${entry.fileName}`}
          >
            <Icon name="close" size={14} className="text-current" />
          </button>
        ) : null}
        {nativeActionsAvailable && entry.status === "downloaded" ? (
          <button
            type="button"
            onClick={handleReveal}
            className={ACTION_CLASS}
            aria-label={`${t("downloads.reveal")} ${entry.fileName}`}
          >
            <Icon name="folder_open" size={18} className="text-current" />
          </button>
        ) : null}
        {!active ? (
          <button
            type="button"
            onClick={handleRemove}
            className={ACTION_CLASS}
            aria-label={`${t("downloads.remove")} ${entry.fileName}`}
          >
            <Icon name="close" size={14} className="text-current" />
          </button>
        ) : null}
      </li>
    );
  },
);

TopBarDownloadRow.displayName = "TopBarDownloadRow";
