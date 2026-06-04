import React from "react";
import type { TopicVisibilityLevel } from "~/features/mute-chat/notification-level.lib";
import { TopicVisibilityLevelSwitch } from "~/features/mute-chat/topic-visibility-level-switch.ui";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";

export interface SidebarFolderNewTopicDialogProps {
  open: boolean;
  streamName: string;
  streamMuted: boolean;
  newTopicName: string;
  onNewTopicNameChange: (value: string) => void;
  topicVisibilityOnCreate: TopicVisibilityLevel;
  onTopicVisibilityOnCreateChange: (level: TopicVisibilityLevel) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

export const SidebarFolderNewTopicDialog: React.FC<SidebarFolderNewTopicDialogProps> = ({
  open,
  streamName,
  streamMuted,
  newTopicName,
  onNewTopicNameChange,
  topicVisibilityOnCreate,
  onTopicVisibilityOnCreateChange,
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
      <div className="mt-4 flex flex-col gap-2">
        <span className="text-sm text-text-muted">{t("channel.topicNotifications")}</span>
        <TopicVisibilityLevelSwitch
          value={topicVisibilityOnCreate}
          streamMuted={streamMuted}
          topicExplicitlyUnmuted={false}
          size="default"
          onChange={onTopicVisibilityOnCreateChange}
        />
      </div>
    </AppDialog>
  );
};
