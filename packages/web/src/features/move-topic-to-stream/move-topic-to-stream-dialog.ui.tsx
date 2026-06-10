import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";

export interface MoveTopicToStreamDialogProps {
  open: boolean;
  sourceChannelName: string;
  targetStreamId: string;
  onTargetStreamIdChange: (value: string) => void;
  targetStreamOptions: readonly { streamId: number; name: string }[];
  topicName: string;
  onTopicNameChange: (value: string) => void;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

export const MoveTopicToStreamDialog = React.memo(function MoveTopicToStreamDialog({
  open,
  sourceChannelName,
  targetStreamId,
  onTargetStreamIdChange,
  targetStreamOptions,
  topicName,
  onTopicNameChange,
  pending,
  onOpenChange,
  onSubmit,
}: MoveTopicToStreamDialogProps) {
  const handleSubmit = useCallback(() => {
    if (pending || targetStreamId.trim().length === 0 || topicName.trim().length === 0) {
      return;
    }
    onSubmit();
  }, [onSubmit, pending, targetStreamId, topicName]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("channel.moveTopicToChannelTitle")}
      description={`#${sourceChannelName}`}
      positionClassName="top-1/2 -translate-y-1/2"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("common.save")}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitDisabled={targetStreamId.trim().length === 0 || topicName.trim().length === 0}
          isSubmitting={pending}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-text-muted">{t("channel.selectTargetChannel")}</span>
          <select
            value={targetStreamId}
            disabled={pending}
            onChange={(e) => onTargetStreamIdChange(e.target.value)}
            aria-label={t("channel.selectTargetChannel")}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none disabled:opacity-60"
          >
            <option value="">{t("channel.selectChannel")}</option>
            {targetStreamOptions.map((stream) => (
              <option key={stream.streamId} value={String(stream.streamId)}>
                #{stream.name}
              </option>
            ))}
          </select>
        </label>
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
      </div>
    </AppDialog>
  );
});
