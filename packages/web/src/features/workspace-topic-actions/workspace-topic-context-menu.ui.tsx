import React, { useCallback, useMemo, useState } from "react";
import {
  mapTopicVisibilityLevelToWorkspaceMode,
  mapWorkspaceTopicNotificationModeToLevel,
} from "~/entities/messenger/messenger-notification-mode.lib";
import { runWorkspaceTopicRead } from "~/entities/messenger/messenger-read-actions.lib";
import {
  runWorkspaceTopicDoneToggle,
  runWorkspaceTopicNotificationUpdate,
  runWorkspaceTopicRenameRequest,
} from "~/entities/messenger/messenger-sidebar-actions.lib";
import type { MessengerStream, MessengerTopicListItem } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessengerTopicNotificationMode } from "~/shared/api/messenger.types";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import {
  useDropdownContextMenuAnchor,
  wrapChildWithContextMenuHandlers,
} from "~/shared/ui/dropdown-context-menu.lib";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import { WorkspaceTopicNotificationSwitch } from "./workspace-topic-notification-switch.ui";

const WORKSPACE_TOPIC_MENU_ITEM_CLASS =
  "data-[highlighted]:bg-sidebar-hover flex cursor-pointer select-none items-center gap-2 px-2 py-2 text-sm text-text-primary outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-sidebar-hover focus-visible:outline-none focus-visible:outline-0 focus-visible:outline-offset-0";

export interface WorkspaceTopicContextMenuProps {
  topic: MessengerTopicListItem;
  streamTitle: string;
  streamNotificationMode: MessengerStream["notificationMode"] | null;
  children: React.ReactNode;
}

function reportWorkspaceTopicMenuActionError(action: string, error: unknown): void {
  reportUnexpectedError("workspace-topic-menu", error, { action });
}

interface RenameWorkspaceTopicDialogProps {
  open: boolean;
  streamTitle: string;
  topicName: string;
  pending: boolean;
  onTopicNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

const RenameWorkspaceTopicDialog = React.memo(function RenameWorkspaceTopicDialog({
  open,
  streamTitle,
  topicName,
  pending,
  onTopicNameChange,
  onOpenChange,
  onSubmit,
}: RenameWorkspaceTopicDialogProps): React.ReactElement {
  const trimmedName = topicName.trim();

  const handleSubmit = useCallback(() => {
    if (pending || trimmedName.length === 0) return;
    onSubmit();
  }, [onSubmit, pending, trimmedName]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("channel.renameTopicTitle")}
      description={`#${streamTitle}`}
      positionClassName="top-1/2 -translate-y-1/2"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("common.save")}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitDisabled={trimmedName.length === 0}
          isSubmitting={pending}
        />
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-text-muted">{t("channel.topicName")}</span>
        <input
          type="text"
          value={topicName}
          disabled={pending}
          onChange={(event) => onTopicNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
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

export const WorkspaceTopicContextMenu = React.memo(function WorkspaceTopicContextMenu({
  topic,
  streamTitle,
  streamNotificationMode,
  children,
}: WorkspaceTopicContextMenuProps): React.ReactElement {
  const {
    menuOpen,
    contextAnchor,
    handleContextMenuCapture,
    handleKeyboardContextMenu,
    handleMenuOpenChange,
  } = useDropdownContextMenuAnchor();
  const notificationMode = topic.notificationMode;
  const isDone = topic.isDone;
  const [notificationPending, setNotificationPending] = useState(false);
  const [readPending, setReadPending] = useState(false);
  const [topicActionPending, setTopicActionPending] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTopicName, setRenameTopicName] = useState(topic.title);
  const [renamePending, setRenamePending] = useState(false);

  const handleSetNotificationMode = useCallback(
    (mode: WorkspaceMessengerTopicNotificationMode): void => {
      if (notificationPending || notificationMode === mode) return;
      handleMenuOpenChange(false);
      setNotificationPending(true);
      void runWorkspaceTopicNotificationUpdate({
        streamUuid: topic.streamUuid,
        topicUuid: topic.topicUuid,
        notificationMode: mode,
      })
        .catch((error) => reportWorkspaceTopicMenuActionError("topic-notifications", error))
        .finally(() => {
          setNotificationPending(false);
        });
    },
    [
      handleMenuOpenChange,
      notificationMode,
      notificationPending,
      topic.streamUuid,
      topic.topicUuid,
    ],
  );

  const handleRenameTopic = useCallback((): void => {
    handleMenuOpenChange(false);
    setRenameTopicName(topic.title);
    setRenameDialogOpen(true);
  }, [handleMenuOpenChange, topic.title]);

  const handleMarkRead = useCallback((): void => {
    if (readPending) return;
    handleMenuOpenChange(false);
    setReadPending(true);
    void runWorkspaceTopicRead({
      streamUuid: topic.streamUuid,
      topicUuid: topic.topicUuid,
    })
      .catch((error) => reportWorkspaceTopicMenuActionError("topic-read", error))
      .finally(() => {
        setReadPending(false);
      });
  }, [handleMenuOpenChange, readPending, topic.streamUuid, topic.topicUuid]);

  const handleSubmitRenameTopic = useCallback((): void => {
    const name = renameTopicName.trim();
    if (renamePending || name.length === 0) return;
    if (name === topic.title) {
      setRenameDialogOpen(false);
      return;
    }

    setRenamePending(true);
    void runWorkspaceTopicRenameRequest({
      streamUuid: topic.streamUuid,
      topicUuid: topic.topicUuid,
      name,
    })
      .catch((error) => reportWorkspaceTopicMenuActionError("rename-topic", error))
      .finally(() => {
        setRenamePending(false);
        setRenameDialogOpen(false);
      });
  }, [renamePending, renameTopicName, topic.streamUuid, topic.title, topic.topicUuid]);

  const handleDoneToggle = useCallback((): void => {
    if (topicActionPending) return;
    handleMenuOpenChange(false);
    setTopicActionPending(true);
    void runWorkspaceTopicDoneToggle({
      streamUuid: topic.streamUuid,
      topicUuid: topic.topicUuid,
      done: !isDone,
    })
      .catch((error) => reportWorkspaceTopicMenuActionError("toggle-topic-done", error))
      .finally(() => {
        setTopicActionPending(false);
      });
  }, [handleMenuOpenChange, isDone, topic.streamUuid, topic.topicUuid, topicActionPending]);

  const topicNotificationPickerItem = useMemo<DropdownMenuItem>(
    () => ({
      type: "custom",
      key: "topic-notifications",
      render: () => (
        <div className="px-2 py-1">
          <p className="mb-1 text-[10px] font-medium text-text-muted">
            {t("channel.topicNotifications")}
          </p>
          <WorkspaceTopicNotificationSwitch
            value={mapWorkspaceTopicNotificationModeToLevel(notificationMode)}
            streamMuted={streamNotificationMode === "muted"}
            topicExplicitlyUnmuted={notificationMode === "unmute"}
            disabled={notificationPending}
            size="sm"
            onChange={(level) =>
              handleSetNotificationMode(mapTopicVisibilityLevelToWorkspaceMode(level))
            }
          />
        </div>
      ),
    }),
    [handleSetNotificationMode, notificationMode, notificationPending, streamNotificationMode],
  );

  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [topicNotificationPickerItem];
    if (topic.unreadCount > 0) {
      items.push({
        type: "action",
        key: "mark-read",
        icon: "check",
        label: t("sidebar.markAsRead"),
        disabled: readPending,
        onSelect: handleMarkRead,
      });
    }
    items.push(
      {
        type: "action",
        key: "rename-topic",
        icon: "pen",
        label: t("channel.renameTopic"),
        disabled: topicActionPending || renamePending,
        onSelect: handleRenameTopic,
      },
      {
        type: "action",
        key: "toggle-topic-done",
        icon: "check",
        label: isDone ? t("channel.markTopicAsNotDone") : t("channel.markTopicAsDone"),
        disabled: topicActionPending,
        onSelect: handleDoneToggle,
      },
    );
    return items;
  }, [
    handleDoneToggle,
    handleMarkRead,
    handleRenameTopic,
    isDone,
    readPending,
    renamePending,
    topic.unreadCount,
    topicActionPending,
    topicNotificationPickerItem,
  ]);

  const contentWithContextMenu = useMemo(
    (): React.ReactElement =>
      wrapChildWithContextMenuHandlers(children, {
        handleContextMenuCapture,
        handleKeyboardContextMenu,
      }),
    [children, handleContextMenuCapture, handleKeyboardContextMenu],
  );

  return (
    <div className="relative">
      {contentWithContextMenu}
      <DropdownMenu
        open={menuOpen}
        onOpenChange={handleMenuOpenChange}
        source="context"
        contextAnchor={contextAnchor}
        items={menuItems}
        contentVariant="narrow"
        itemClassName={WORKSPACE_TOPIC_MENU_ITEM_CLASS}
        submenuTriggerClassName={WORKSPACE_TOPIC_MENU_ITEM_CLASS}
        checkboxItemClassName={WORKSPACE_TOPIC_MENU_ITEM_CLASS}
        contextContentProps={{
          sideOffset: 4,
          align: "start",
        }}
      />
      <RenameWorkspaceTopicDialog
        open={renameDialogOpen}
        streamTitle={streamTitle}
        topicName={renameTopicName}
        pending={renamePending}
        onTopicNameChange={setRenameTopicName}
        onOpenChange={setRenameDialogOpen}
        onSubmit={handleSubmitRenameTopic}
      />
    </div>
  );
});
