import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { TopBarDownloadRowProps } from "./top-bar.types";

export const TopBarDownloadRow = React.memo<TopBarDownloadRowProps>(
  ({ entry, statusLabel, onRemove }) => {
    const handleRemove = useCallback(() => {
      onRemove(entry.path);
    }, [entry.path, onRemove]);

    return (
      <li className="hover:bg-bg-elevated/60 flex items-center gap-2 rounded-lg px-2 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{entry.fileName}</p>
          <p
            className={`truncate text-xs ${
              entry.status === "error" ? "text-notice-base" : "text-text-muted"
            }`}
            role="status"
            aria-live="polite"
          >
            {statusLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
          aria-label={`${t("downloads.remove")} ${entry.fileName}`}
        >
          <Icon name="close" size={14} className="text-current" />
        </button>
      </li>
    );
  },
);

TopBarDownloadRow.displayName = "TopBarDownloadRow";
