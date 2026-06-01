import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";

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
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("channel.renameTopicTitle")}
      description={`#${channelName}`}
      positionClassName="top-1/2 -translate-y-1/2"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("common.save")}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitDisabled={topicName.trim().length === 0}
          isSubmitting={pending}
        />
      }
    >
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
    </AppDialog>
  );
});
