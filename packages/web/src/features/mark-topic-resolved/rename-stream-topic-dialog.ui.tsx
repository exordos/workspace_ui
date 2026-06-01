import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";

export interface RenameStreamTopicDialogProps {
  open: boolean;
  channelName: string;
  topicName: string;
  onTopicNameChange: (value: string) => void;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

export const RenameStreamTopicDialog = React.memo(function RenameStreamTopicDialog({
  open,
  channelName,
  topicName,
  onTopicNameChange,
  pending,
  onOpenChange,
  onSubmit,
}: RenameStreamTopicDialogProps) {
  const handleSubmit = useCallback(() => {
    if (pending || topicName.trim().length === 0) {
      return;
    }
    onSubmit();
  }, [onSubmit, pending, topicName]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-modal w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-subtle bg-bg-elevated shadow-xl">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              {t("channel.renameTopicTitle")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="hover:bg-bg/50 rounded p-1 text-text-muted"
                aria-label={t("common.close")}
                disabled={pending}
              >
                <Icon name="close" size={18} />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-4 px-4 py-4">
            <Dialog.Description className="text-xs text-text-muted">
              #{channelName}
            </Dialog.Description>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-text-muted">{t("channel.topicName")}</span>
              <input
                type="text"
                value={topicName}
                autoFocus
                disabled={pending}
                onChange={(e) => onTopicNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                aria-label={t("channel.topicName")}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted disabled:opacity-60"
                placeholder={t("channel.topicName")}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted disabled:opacity-60"
                >
                  {t("common.cancel")}
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={pending || topicName.trim().length === 0}
                onClick={handleSubmit}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
