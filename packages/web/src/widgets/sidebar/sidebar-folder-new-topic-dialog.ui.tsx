import React from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";

export interface SidebarFolderNewTopicDialogProps {
  open: boolean;
  streamName: string;
  newTopicName: string;
  onNewTopicNameChange: (value: string) => void;
  muteTopicOnCreate: boolean;
  onMuteTopicOnCreateChange: (value: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

export const SidebarFolderNewTopicDialog: React.FC<SidebarFolderNewTopicDialogProps> = ({
  open,
  streamName,
  newTopicName,
  onNewTopicNameChange,
  muteTopicOnCreate,
  onMuteTopicOnCreateChange,
  onOpenChange,
  onSubmit,
}) => {
  const trimmedName = newTopicName.trim();

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("channel.createTopic")}
      description={`#${streamName}`}
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("common.create")}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
          submitDisabled={trimmedName.length === 0}
        />
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-text-muted">{t("channel.topicName")}</span>
        <input
          type="text"
          value={newTopicName}
          autoFocus
          onChange={(e) => onNewTopicNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (trimmedName.length > 0) onSubmit();
            }
          }}
          aria-label={t("channel.topicName")}
          className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          placeholder={t("channel.topicName")}
        />
      </label>
      <label className="mt-4 flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={muteTopicOnCreate}
          onChange={(e) => onMuteTopicOnCreateChange(e.target.checked)}
          className="h-4 w-4 rounded border-border-subtle"
        />
        <span>{t("channel.muteTopic")}</span>
      </label>
    </AppDialog>
  );
};
