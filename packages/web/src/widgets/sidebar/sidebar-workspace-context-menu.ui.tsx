import React, { useCallback, useMemo, useState } from "react";
import {
  mapNotificationLevelToWorkspaceStreamMode,
  mapWorkspaceStreamNotificationModeToLevel,
} from "~/entities/messenger/messenger-notification-mode.lib";
import {
  runWorkspaceStreamRead,
  runWorkspaceTopicRead,
} from "~/entities/messenger/messenger-read-actions.lib";
import {
  runWorkspaceCreateTopicRequest,
  runWorkspaceFolderAssignmentToggle,
  runWorkspaceFolderItemPinToggle,
  runWorkspaceStreamNotificationUpdate,
  runWorkspaceTopicDoneToggle,
  runWorkspaceTopicNotificationUpdate,
  runWorkspaceTopicRenameRequest,
} from "~/entities/messenger/messenger-sidebar-actions.lib";
import { selectMessengerFolders, useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerFolder,
  MessengerFolderItem,
  MessengerSidebarStreamItem,
  MessengerSidebarTopicItem,
} from "~/entities/messenger/messenger.types";
import type { TopicVisibilityLevel } from "~/features/mute-chat/notification-level.lib";
import { StreamNotificationLevelSwitch } from "~/features/mute-chat/stream-notification-level-switch.ui";
import { TopicVisibilityLevelSwitch } from "~/features/mute-chat/topic-visibility-level-switch.ui";
import { t } from "~/i18n/i18n";
import type {
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "~/shared/api/messenger.types";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import {
  useSidebarChatContextMenuAnchor,
  wrapChildWithContextMenuHandlers,
} from "./sidebar-chat-context-menu-clone.lib";
import { useSidebarConfigStore } from "./sidebar-config.model";

const SIDEBAR_WORKSPACE_MENU_ITEM_CLASS =
  "data-[highlighted]:bg-sidebar-hover flex cursor-pointer select-none items-center gap-2 px-2 py-2 text-sm text-text-primary outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-sidebar-hover focus-visible:outline-none focus-visible:outline-0 focus-visible:outline-offset-0";

function reportWorkspaceMenuActionError(action: string, error: unknown): void {
  reportUnexpectedError("workspace-sidebar-menu", error, { action });
}

function mapWorkspaceTopicNotificationModeToLevel(
  mode: WorkspaceMessengerTopicNotificationMode,
): TopicVisibilityLevel {
  switch (mode) {
    case "default":
      return "inherit";
    case "unmute":
      return "unmuted";
    case "follow":
      return "followed";
    case "mute":
      return "muted";
  }
}

function mapTopicVisibilityLevelToWorkspaceMode(
  level: TopicVisibilityLevel,
): WorkspaceMessengerTopicNotificationMode {
  switch (level) {
    case "inherit":
      return "default";
    case "unmuted":
      return "unmute";
    case "followed":
      return "follow";
    case "muted":
      return "mute";
  }
}

function isUserCreatedWorkspaceFolder(folder: MessengerFolder): boolean {
  return folder.systemType === "created" || folder.systemType == null;
}

function findStreamFolderItem(
  folder: MessengerFolder | null,
  streamUuid: string,
): MessengerFolderItem | null {
  return folder?.items.find((item) => item.streamUuid === streamUuid) ?? null;
}

function resolveSelectedWorkspaceFolder(
  folders: readonly MessengerFolder[],
  selectedFolderId: string,
): MessengerFolder | null {
  return (
    folders.find((folder) => folder.uuid === selectedFolderId) ??
    folders.find((folder) => folder.systemType === "all") ??
    folders[0] ??
    null
  );
}

function useWorkspaceMenuFolders(streamUuid: string): {
  userCreatedFolders: MessengerFolder[];
  selectedFolderItem: MessengerFolderItem | null;
} {
  const folders = useMessengerStore(selectMessengerFolders);
  const selectedFolderId = useSidebarConfigStore((s) => s.selectedFolderId);

  return useMemo(() => {
    const selectedFolder = resolveSelectedWorkspaceFolder(folders, selectedFolderId);
    return {
      userCreatedFolders: folders.filter(isUserCreatedWorkspaceFolder),
      selectedFolderItem: findStreamFolderItem(selectedFolder, streamUuid),
    };
  }, [folders, selectedFolderId, streamUuid]);
}

function useWorkspaceStreamNotificationMode(
  streamUuid: string,
): WorkspaceMessengerStreamNotificationMode {
  return useMessengerStore((s) => s.streamsById[streamUuid]?.notificationMode ?? "mentions_only");
}

function useWorkspaceTopicNotificationMode(
  topicUuid: string,
): WorkspaceMessengerTopicNotificationMode {
  return useMessengerStore((s) => s.topicsById[topicUuid]?.notificationMode ?? "default");
}

function useWorkspaceTopicDone(topicUuid: string): boolean {
  return useMessengerStore((s) => s.topicsById[topicUuid]?.isDone ?? false);
}

interface WorkspaceTopicNameDialogProps {
  open: boolean;
  title: string;
  streamName: string;
  topicName: string;
  pending: boolean;
  submitLabel: string;
  onTopicNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

const WorkspaceTopicNameDialog = React.memo(function WorkspaceTopicNameDialog({
  open,
  title,
  streamName,
  topicName,
  pending,
  submitLabel,
  onTopicNameChange,
  onOpenChange,
  onSubmit,
}: WorkspaceTopicNameDialogProps): React.ReactElement {
  const trimmedName = topicName.trim();

  const handleSubmit = useCallback(() => {
    if (pending || trimmedName.length === 0) return;
    onSubmit();
  }, [onSubmit, pending, trimmedName]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`#${streamName}`}
      positionClassName="top-1/2 -translate-y-1/2"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={submitLabel}
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

interface WorkspaceStreamContextMenuProps {
  stream: MessengerSidebarStreamItem;
  children: React.ReactNode;
  onTopicCreated?: (streamUuid: string, topicUuid: string) => void;
  /**
   * Content under the stream row (topic list).
   * Receives create-topic opener for callers that still want a quick action.
   */
  below?: (api: { onCreateTopic: () => void }) => React.ReactNode;
}

export const WorkspaceStreamContextMenu = React.memo(function WorkspaceStreamContextMenu({
  stream,
  children,
  below,
  onTopicCreated,
}: WorkspaceStreamContextMenuProps): React.ReactElement {
  const {
    menuOpen,
    contextAnchor,
    handleContextMenuCapture,
    handleKeyboardContextMenu,
    handleMenuOpenChange,
  } = useSidebarChatContextMenuAnchor();
  const notificationMode = useWorkspaceStreamNotificationMode(stream.streamUuid);
  const { userCreatedFolders, selectedFolderItem } = useWorkspaceMenuFolders(stream.streamUuid);
  const rightDrawer = useRightDrawer();
  const [notificationPending, setNotificationPending] = useState(false);
  const [readPending, setReadPending] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [createTopicDialogOpen, setCreateTopicDialogOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [createTopicPending, setCreateTopicPending] = useState(false);
  const [pendingFolderUuids, setPendingFolderUuids] = useState(() => new Set<string>());

  const handleSetNotificationMode = useCallback(
    (mode: WorkspaceMessengerStreamNotificationMode): void => {
      if (notificationPending || notificationMode === mode) return;
      handleMenuOpenChange(false);
      setNotificationPending(true);
      void runWorkspaceStreamNotificationUpdate({
        streamUuid: stream.streamUuid,
        notificationMode: mode,
      })
        .catch((error) => reportWorkspaceMenuActionError("stream-notifications", error))
        .finally(() => {
          setNotificationPending(false);
        });
    },
    [handleMenuOpenChange, notificationMode, notificationPending, stream.streamUuid],
  );

  const handlePinToggle = useCallback((): void => {
    if (selectedFolderItem == null || pinPending) return;
    handleMenuOpenChange(false);
    setPinPending(true);
    void runWorkspaceFolderItemPinToggle({
      folderUuid: selectedFolderItem.folderUuid,
      folderItemUuid: selectedFolderItem.uuid,
      streamUuid: stream.streamUuid,
      pinned: selectedFolderItem.pinnedAt == null,
    })
      .catch((error) => reportWorkspaceMenuActionError("folder-item-pin", error))
      .finally(() => {
        setPinPending(false);
      });
  }, [handleMenuOpenChange, pinPending, selectedFolderItem, stream.streamUuid]);

  const handleMarkRead = useCallback((): void => {
    if (readPending) return;
    handleMenuOpenChange(false);
    setReadPending(true);
    void runWorkspaceStreamRead({ streamUuid: stream.streamUuid })
      .catch((error) => reportWorkspaceMenuActionError("stream-read", error))
      .finally(() => {
        setReadPending(false);
      });
  }, [handleMenuOpenChange, readPending, stream.streamUuid]);

  const handleFolderAssignmentToggle = useCallback(
    (folder: MessengerFolder, folderItem: MessengerFolderItem | null): void => {
      if (pendingFolderUuids.has(folder.uuid)) return;
      setPendingFolderUuids((prev) => new Set(prev).add(folder.uuid));
      void runWorkspaceFolderAssignmentToggle({
        folderUuid: folder.uuid,
        folderItemUuid: folderItem?.uuid ?? null,
        streamUuid: stream.streamUuid,
        chatType: stream.uiKind === "directPrivate" ? "private" : "stream",
        assigned: folderItem == null,
      })
        .catch((error) => reportWorkspaceMenuActionError("folder-assignment", error))
        .finally(() => {
          setPendingFolderUuids((prev) => {
            const next = new Set(prev);
            next.delete(folder.uuid);
            return next;
          });
        });
    },
    [pendingFolderUuids, stream.streamUuid, stream.uiKind],
  );

  const handleCreateTopic = useCallback((): void => {
    handleMenuOpenChange(false);
    setNewTopicName("");
    setCreateTopicDialogOpen(true);
  }, [handleMenuOpenChange]);

  const handleOpenMembers = useCallback((): void => {
    handleMenuOpenChange(false);
    if (stream.uiKind === "directPrivate") {
      if (stream.directUserUuid != null) {
        rightDrawer?.openWorkspaceUserProfile?.(stream.directUserUuid);
      }
      return;
    }
    // Меню потока не владеет member flow и не ходит в API: это только вход в
    // общую правую панель, где уже собраны список, добавление и отписка.
    if (rightDrawer?.openInfo != null) {
      rightDrawer.openInfo();
      return;
    }
    rightDrawer?.setOpen(true);
  }, [handleMenuOpenChange, rightDrawer, stream.directUserUuid, stream.uiKind]);

  const handleSubmitCreateTopic = useCallback((): void => {
    const name = newTopicName.trim();
    if (name.length === 0 || createTopicPending) return;

    setCreateTopicPending(true);
    void runWorkspaceCreateTopicRequest({ streamUuid: stream.streamUuid, name })
      .then((result) => {
        if (result.status !== "applied") return;
        onTopicCreated?.(result.topic.streamUuid, result.topic.uuid);
      })
      .catch((error) => reportWorkspaceMenuActionError("create-topic", error))
      .finally(() => {
        setCreateTopicPending(false);
        setCreateTopicDialogOpen(false);
        setNewTopicName("");
      });
  }, [createTopicPending, newTopicName, onTopicCreated, stream.streamUuid]);

  const notificationPickerItem = useMemo<DropdownMenuItem>(
    () => ({
      type: "custom",
      key: "stream-notifications",
      render: () => (
        <div className="px-2 py-1">
          <p className="mb-1 text-[10px] font-medium text-text-muted">
            {t("channel.notifications")}
          </p>
          <StreamNotificationLevelSwitch
            value={mapWorkspaceStreamNotificationModeToLevel(notificationMode)}
            disabled={notificationPending}
            size="sm"
            onChange={(level) =>
              handleSetNotificationMode(mapNotificationLevelToWorkspaceStreamMode(level))
            }
          />
        </div>
      ),
    }),
    [handleSetNotificationMode, notificationMode, notificationPending],
  );

  const folderAssignmentsItem = useMemo<DropdownMenuItem>(
    () => ({
      type: "submenu",
      key: "workspace-folder-assignments",
      label: t("sidebar.addToFolder"),
      icon: "folder",
      items:
        userCreatedFolders.length > 0
          ? userCreatedFolders.map((folder) => {
              const folderItem = findStreamFolderItem(folder, stream.streamUuid);
              return {
                type: "checkbox" as const,
                key: folder.uuid,
                checked: folderItem != null,
                disabled: pendingFolderUuids.has(folder.uuid),
                keepOpenOnSelect: true,
                label: (
                  <>
                    <span
                      className={`inline-flex h-4 w-4 items-center justify-center rounded border border-border-subtle text-xs ${
                        folderItem != null ? "bg-accent text-on-accent" : "text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="truncate">{folder.title}</span>
                  </>
                ),
                onCheckedChange: () => handleFolderAssignmentToggle(folder, folderItem),
              };
            })
          : [
              {
                type: "action" as const,
                key: "no-folders",
                label: t("sidebar.noFoldersAvailable"),
                disabled: true,
              },
            ],
      contentVariant: "wide",
      sideOffset: 8,
      alignOffset: -4,
    }),
    [handleFolderAssignmentToggle, pendingFolderUuids, stream.streamUuid, userCreatedFolders],
  );

  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [notificationPickerItem];
    if (stream.unreadCount > 0) {
      items.push({
        type: "action",
        key: "mark-read",
        icon: "check",
        label: t("sidebar.markAllAsRead"),
        disabled: readPending,
        onSelect: handleMarkRead,
      });
    }
    if (selectedFolderItem != null) {
      items.push({
        type: "action",
        key: "pin",
        icon: "pin",
        label: selectedFolderItem.pinnedAt == null ? t("sidebar.pinChat") : t("sidebar.unpinChat"),
        disabled: pinPending,
        onSelect: handlePinToggle,
      });
    }
    items.push(
      // Пункт ведет в тот же Workspace member flow, что и кнопка в right panel,
      // чтобы не появилось два разных сценария управления участниками.
      {
        type: "action",
        key: "members",
        icon: "group",
        label: stream.uiKind === "directPrivate" ? t("chatInfo.contactInfo") : t("channel.members"),
        onSelect: handleOpenMembers,
      },
      folderAssignmentsItem,
      {
        type: "action",
        key: "new-topic",
        icon: "plus",
        label: t("channel.newTopic"),
        onSelect: handleCreateTopic,
      },
    );
    return items;
  }, [
    folderAssignmentsItem,
    handleCreateTopic,
    handleMarkRead,
    handleOpenMembers,
    handlePinToggle,
    notificationPickerItem,
    pinPending,
    readPending,
    selectedFolderItem,
    stream.unreadCount,
    stream.uiKind,
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
      {below?.({ onCreateTopic: handleCreateTopic })}
      <DropdownMenu
        open={menuOpen}
        onOpenChange={handleMenuOpenChange}
        source="context"
        contextAnchor={contextAnchor}
        items={menuItems}
        contentVariant="narrow"
        itemClassName={SIDEBAR_WORKSPACE_MENU_ITEM_CLASS}
        submenuTriggerClassName={SIDEBAR_WORKSPACE_MENU_ITEM_CLASS}
        checkboxItemClassName={SIDEBAR_WORKSPACE_MENU_ITEM_CLASS}
        contextContentProps={{
          sideOffset: 4,
          align: "start",
        }}
      />
      <WorkspaceTopicNameDialog
        open={createTopicDialogOpen}
        title={t("channel.createTopic")}
        streamName={stream.title}
        topicName={newTopicName}
        pending={createTopicPending}
        submitLabel={t("common.create")}
        onTopicNameChange={setNewTopicName}
        onOpenChange={setCreateTopicDialogOpen}
        onSubmit={handleSubmitCreateTopic}
      />
    </div>
  );
});

interface WorkspaceTopicContextMenuProps {
  topic: MessengerSidebarTopicItem;
  streamTitle: string;
  children: React.ReactNode;
}

export const WorkspaceTopicContextMenu = React.memo(function WorkspaceTopicContextMenu({
  topic,
  streamTitle,
  children,
}: WorkspaceTopicContextMenuProps): React.ReactElement {
  const {
    menuOpen,
    contextAnchor,
    handleContextMenuCapture,
    handleKeyboardContextMenu,
    handleMenuOpenChange,
  } = useSidebarChatContextMenuAnchor();
  const notificationMode = useWorkspaceTopicNotificationMode(topic.topicUuid);
  const streamNotificationMode = useWorkspaceStreamNotificationMode(topic.streamUuid);
  const isDone = useWorkspaceTopicDone(topic.topicUuid);
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
        .catch((error) => reportWorkspaceMenuActionError("topic-notifications", error))
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
      .catch((error) => reportWorkspaceMenuActionError("topic-read", error))
      .finally(() => {
        setReadPending(false);
      });
  }, [handleMenuOpenChange, readPending, topic.streamUuid, topic.topicUuid]);

  const handleSubmitRenameTopic = useCallback((): void => {
    const name = renameTopicName.trim();
    if (renamePending || name.length === 0) {
      return;
    }
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
      .catch((error) => reportWorkspaceMenuActionError("rename-topic", error))
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
      .catch((error) => reportWorkspaceMenuActionError("toggle-topic-done", error))
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
          <TopicVisibilityLevelSwitch
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
        itemClassName={SIDEBAR_WORKSPACE_MENU_ITEM_CLASS}
        submenuTriggerClassName={SIDEBAR_WORKSPACE_MENU_ITEM_CLASS}
        checkboxItemClassName={SIDEBAR_WORKSPACE_MENU_ITEM_CLASS}
        contextContentProps={{
          sideOffset: 4,
          align: "start",
        }}
      />
      <WorkspaceTopicNameDialog
        open={renameDialogOpen}
        title={t("channel.renameTopicTitle")}
        streamName={streamTitle}
        topicName={renameTopicName}
        pending={renamePending}
        submitLabel={t("common.save")}
        onTopicNameChange={setRenameTopicName}
        onOpenChange={setRenameDialogOpen}
        onSubmit={handleSubmitRenameTopic}
      />
    </div>
  );
});
