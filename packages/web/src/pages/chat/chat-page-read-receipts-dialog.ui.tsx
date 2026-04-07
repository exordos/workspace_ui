import * as Dialog from "@radix-ui/react-dialog";
import React from "react";
import { useMessageReadersStore } from "~/features/message-readers/message-readers.model";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { ChatPageReadReceiptsDialogProps } from "./chat-page-read-receipts-dialog.types";

export const ChatPageReadReceiptsDialog: React.FC<ChatPageReadReceiptsDialogProps> = ({
  open,
  onOpenChange,
  readersLoading,
  readersError,
  readerEntries,
}) => {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          useMessageReadersStore.getState().clear();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-modal flex max-h-[60vh] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              {t("message.readBy")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="hover:bg-bg/50 rounded p-1 text-text-muted"
                aria-label={t("common.close")}
              >
                <Icon name="close" size={18} />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {readersLoading && (
              <div className="flex items-center justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
              </div>
            )}
            {readersError && (
              <p className="py-4 text-center text-sm text-notice-base">
                {t("message.readReceiptsError")}
              </p>
            )}
            {!readersLoading && !readersError && readerEntries.length === 0 && (
              <p className="py-4 text-center text-sm text-text-muted">
                {t("message.noReadReceipts")}
              </p>
            )}
            {!readersLoading && !readersError && readerEntries.length > 0 && (
              <ul className="space-y-2">
                {readerEntries.map((entry) => (
                  <li
                    key={entry.userId}
                    className="flex items-start gap-2 text-sm text-text-primary"
                  >
                    <span className="bg-accent/20 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-accent">
                      {entry.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{entry.name}</span>
                      {entry.statusLabel != null && entry.statusLabel.length > 0 ? (
                        <span className="block truncate text-[11px] text-text-secondary">
                          {entry.statusLabel}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
