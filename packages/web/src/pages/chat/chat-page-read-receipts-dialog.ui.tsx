import React from "react";
import { t } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog.ui";
import { Spinner } from "~/shared/ui/spinner.ui";
import type { ChatPageReadReceiptsDialogProps } from "./chat-page-read-receipts-dialog.types";

export const ChatPageReadReceiptsDialog: React.FC<ChatPageReadReceiptsDialogProps> = ({
  open,
  onOpenChange,
  readersLoading,
  readersError,
  readerEntries,
}) => {
  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
      }}
      title={t("message.readBy")}
      maxWidthClassName="max-w-sm"
      positionClassName="top-1/2 -translate-y-1/2 max-h-[60vh] flex flex-col p-0"
    >
      <div className="flex-1 overflow-y-auto p-4">
        {readersLoading && (
          <div className="flex items-center justify-center py-6">
            <Spinner size="md" />
          </div>
        )}
        {readersError && (
          <p className="py-4 text-center text-sm text-notice-base">
            {t("message.readReceiptsError")}
          </p>
        )}
        {!readersLoading && !readersError && readerEntries.length === 0 && (
          <p className="py-4 text-center text-sm text-text-muted">
            {t("message.readReceiptsUnsupported")}
          </p>
        )}
        {!readersLoading && !readersError && readerEntries.length > 0 && (
          <ul className="space-y-2">
            {readerEntries.map((entry) => (
              <li
                key={entry.userId}
                className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
              >
                <span className="truncate text-text-primary">{entry.name}</span>
                {entry.statusLabel != null && entry.statusLabel.length > 0 ? (
                  <span className="shrink-0 text-xs text-text-muted">{entry.statusLabel}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppDialog>
  );
};
