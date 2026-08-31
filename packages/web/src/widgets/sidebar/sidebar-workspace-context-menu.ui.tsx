import React, { useCallback, useMemo, useState } from "react";
import {
  mapNotificationLevelToWorkspaceStreamMode,
  mapWorkspaceStreamNotificationModeToLevel,
} from "~/entities/messenger/messenger-notification-mode.lib";
import { runWorkspaceStreamRead } from "~/entities/messenger/messenger-read-actions.lib";
import {
  runWorkspaceCreateTopicRequest,
  runWorkspaceFolderAssignmentToggle,
  runWorkspaceFolderItemPinToggle,
  runWorkspaceStreamNotificationUpdate,
  runWorkspaceStreamRenameRequest,
} from "~/entities/messenger/messenger-sidebar-actions.lib";
import { selectMessengerFolders, useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerFolder,
  MessengerFolderItem,
  MessengerSidebarStreamItem,
} from "~/entities/messenger/messenger.types";
import { StreamNotificationLevelSwitch } from "~/features/mute-chat/stream-notification-level-switch.ui";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessengerStreamNotificationMode } from "~/shared/api/messenger.types";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import {
  useDropdownContextMenuAnchor,
  wrapChildWithContextMenuHandlers,
} from "~/shared/ui/dropdown-context-menu.lib";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import { useSidebarConfigStore } from "./sidebar-config.model";

const SIDEBAR_WORKSPACE_MENU_ITEM_CLASS =
  "data-[highlighted]:bg-sidebar-hover flex cursor-pointer select-none items-center gap-2 px-2 py-2 text-sm text-text-primary outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-sidebar-hover focus-visible:outline-none focus-visible:outline-0 focus-visible:outline-offset-0";

function reportWorkspaceMenuActionError(action: string, error: unknown): void {
  reportUnexpectedError("workspace-sidebar-menu", error, { action });
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

interface WorkspaceNameDialogProps {
  open: boolean;
  title: string;
  description?: string;
  inputLabel: string;
  name: string;
  pending: boolean;
  submitLabel: string;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

const WorkspaceNameDialog = React.memo(function WorkspaceNameDialog({
  open,
  title,
  description,
  inputLabel,
  name,
  pending,
  submitLabel,
  onNameChange,
  onOpenChange,
  onSubmit,
}: WorkspaceNameDialogProps): React.ReactElement {
  const trimmedName = name.trim();

  const handleSubmit = useCallback(() => {
    if (pending || trimmedName.length === 0) return;
    onSubmit();
  }, [onSubmit, pending, trimmedName]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
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
        <span className="text-sm text-text-muted">{inputLabel}</span>
        <input
          type="text"
          value={name}
          disabled={pending}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSubmit();
            }
          }}
          aria-label={inputLabel}
          className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted disabled:opacity-60"
          placeholder={inputLabel}
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
  } = useDropdownContextMenuAnchor();
  const notificationMode = useWorkspaceStreamNotificationMode(stream.streamUuid);
  const { userCreatedFolders, selectedFolderItem } = useWorkspaceMenuFolders(stream.streamUuid);
  const rightDrawer = useRightDrawer();
  const [notificationPending, setNotificationPending] = useState(false);
  const [readPending, setReadPending] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamedStreamName, setRenamedStreamName] = useState(stream.title);
  const [renamePending, setRenamePending] = useState(false);
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

  const handleRename = useCallback((): void => {
    handleMenuOpenChange(false);
    setRenamedStreamName(stream.title);
    setRenameDialogOpen(true);
  }, [handleMenuOpenChange, stream.title]);

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

  const handleSubmitRename = useCallback((): void => {
    const name = renamedStreamName.trim();
    if (name.length === 0 || name === stream.title || renamePending) return;

    setRenamePending(true);
    void runWorkspaceStreamRenameRequest({ streamUuid: stream.streamUuid, name })
      .catch((error) => reportWorkspaceMenuActionError("stream-rename", error))
      .finally(() => {
        setRenamePending(false);
        setRenameDialogOpen(false);
      });
  }, [renamePending, renamedStreamName, stream.streamUuid, stream.title]);

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
      ...(stream.uiKind === "directPrivate"
        ? []
        : [
            {
              type: "action" as const,
              key: "rename-stream",
              label: t("common.rename"),
              onSelect: handleRename,
            },
          ]),
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
    handleRename,
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
      <WorkspaceNameDialog
        open={renameDialogOpen}
        title={t("common.rename")}
        inputLabel={t("channel.channelName")}
        name={renamedStreamName}
        pending={renamePending}
        submitLabel={t("common.save")}
        onNameChange={setRenamedStreamName}
        onOpenChange={setRenameDialogOpen}
        onSubmit={handleSubmitRename}
      />
      <WorkspaceNameDialog
        open={createTopicDialogOpen}
        title={t("channel.createTopic")}
        description={`#${stream.title}`}
        inputLabel={t("channel.topicName")}
        name={newTopicName}
        pending={createTopicPending}
        submitLabel={t("common.create")}
        onNameChange={setNewTopicName}
        onOpenChange={setCreateTopicDialogOpen}
        onSubmit={handleSubmitCreateTopic}
      />
    </div>
  );
});
