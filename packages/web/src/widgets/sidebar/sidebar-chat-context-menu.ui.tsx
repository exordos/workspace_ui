import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { syncUnreadSurfacesFromDelta } from "~/entities/unread-sync/unread-surfaces-sync.lib";
import {
  OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID,
  type FolderAssignmentRow,
} from "~/features/folder-sync/folder-sync-assignment.types";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { applySidebarMarkChatAsRead } from "~/features/mark-chat-read/sidebar-mark-chat-read.lib";
import type { SidebarMarkReadTarget } from "~/features/mark-chat-read/sidebar-mark-chat-read.lib";
import { useMarkTopicResolved } from "~/features/mark-topic-resolved/mark-topic-resolved.hook";
import { RenameStreamTopicDialog } from "~/features/mark-topic-resolved/rename-stream-topic-dialog.ui";
import { MoveTopicToStreamDialog } from "~/features/move-topic-to-stream/move-topic-to-stream-dialog.ui";
import { useMoveTopicToStream } from "~/features/move-topic-to-stream/move-topic-to-stream.hook";
import { runOptimisticStreamNotificationLevelUpdate } from "~/features/mute-chat/mute-chat-notification.optimistic.lib";
import { setStreamNotificationLevel } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { StreamNotificationLevelSwitch } from "~/features/mute-chat/stream-notification-level-switch.ui";
import type { StreamNotificationLevel } from "~/features/mute-chat/stream-notification-level.lib";
import { TopicNotificationLevelMenuPicker } from "~/features/mute-chat/topic-notification-level-switch.ui";
import { t } from "~/i18n/i18n";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import {
  useSidebarChatContextMenuAnchor,
  wrapChildWithContextMenuHandlers,
} from "./sidebar-chat-context-menu-clone.lib";
import { useSidebarFolderPinMenu } from "./sidebar-folder-pin-menu.lib";
import { chatToWorkspaceChatId, parseDmSlugToUserIds } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";

const SIDEBAR_MENU_ITEM_CLASS =
  "data-[highlighted]:bg-sidebar-hover flex cursor-pointer select-none items-center gap-2 px-2 py-2 text-sm text-text-primary outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-sidebar-hover focus-visible:outline-none focus-visible:outline-0 focus-visible:outline-offset-0";

// After the API clears unread, recalculate the active org badge from fresh sidebar state.
async function applySidebarMarkChatAsReadAndSync(target: SidebarMarkReadTarget): Promise<void> {
  const ok = await applySidebarMarkChatAsRead(target);
  if (!ok) return;
  const instanceId = useInstancesStore.getState().currentInstanceId;
  const mute = useMuteStore.getState();
  syncUnreadSurfacesFromDelta({
    source: "local-sidebar-mark-read",
    instanceId,
    isStreamMuted: mute.isStreamMuted,
    isEffectivelyMuted: mute.isEffectivelyMuted,
    applyDelta: () => {},
  });
}

function useFolderAssignmentsSubmenu(chatId: string, menuOpen: boolean): DropdownMenuItem {
  const [assignments, setAssignments] = useState<FolderAssignmentRow[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [inFlightFolderIds, setInFlightFolderIds] = useState(() => new Set<string>());
  const loadAssignmentsForChat = useFolderSyncStore((s) => s.loadAssignmentsForChat);
  const toggleAssignment = useFolderSyncStore((s) => s.toggleAssignment);

  useEffect(() => {
    if (!menuOpen) return;
    let cancelled = false;
    setIsLoadingAssignments(true);
    void loadAssignmentsForChat(chatId)
      .then((rows) => {
        if (!cancelled) {
          setAssignments(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssignments([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAssignments(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, loadAssignmentsForChat, menuOpen]);

  const handleToggleAssignment = useCallback(
    async (assignment: FolderAssignmentRow) => {
      const folderUuid = assignment.folderUuid;
      if (inFlightFolderIds.has(folderUuid)) {
        return;
      }
      const previousItemUuid = assignment.itemUuid;
      const wasAssigned = previousItemUuid != null;
      setInFlightFolderIds((prev) => new Set(prev).add(folderUuid));
      setAssignments((prev) =>
        prev.map((row) =>
          row.folderUuid === folderUuid
            ? {
                ...row,
                itemUuid: wasAssigned ? null : OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID,
              }
            : row,
        ),
      );

      try {
        const result = await toggleAssignment({
          chatId,
          folderUuid,
          itemUuid: assignment.itemUuid,
        });
        if (!result.ok) {
          setAssignments((prev) =>
            prev.map((row) =>
              row.folderUuid === folderUuid ? { ...row, itemUuid: previousItemUuid } : row,
            ),
          );
          return;
        }

        if (result.removed) {
          setAssignments((prev) =>
            prev.map((row) => (row.folderUuid === folderUuid ? { ...row, itemUuid: null } : row)),
          );
        } else if (result.nextItemUuid != null) {
          setAssignments((prev) =>
            prev.map((row) =>
              row.folderUuid === folderUuid ? { ...row, itemUuid: result.nextItemUuid } : row,
            ),
          );
        }
      } finally {
        setInFlightFolderIds((prev) => {
          const next = new Set(prev);
          next.delete(folderUuid);
          return next;
        });
        void loadAssignmentsForChat(chatId)
          .then((rows) => {
            setAssignments(rows);
          })
          .catch(() => {});
      }
    },
    [chatId, inFlightFolderIds, loadAssignmentsForChat, toggleAssignment],
  );

  return useMemo<DropdownMenuItem>(() => {
    const submenuItems: DropdownMenuItem[] = [];
    if (isLoadingAssignments) {
      submenuItems.push({
        type: "action",
        key: "loading-folders",
        label: t("sidebar.loadingFolders"),
        disabled: true,
      });
    } else if (assignments.length === 0) {
      submenuItems.push({
        type: "action",
        key: "no-folders",
        label: t("sidebar.noFoldersAvailable"),
        disabled: true,
      });
    } else {
      submenuItems.push(
        ...assignments.map((assignment) => ({
          type: "checkbox" as const,
          key: assignment.folderUuid,
          checked: assignment.itemUuid != null,
          keepOpenOnSelect: true,
          onCheckedChange: () => {
            void handleToggleAssignment(assignment);
          },
          label: (
            <>
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded border border-border-subtle text-xs ${
                  assignment.itemUuid != null ? "bg-accent text-on-accent" : "text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="truncate">{assignment.label}</span>
            </>
          ),
        })),
      );
    }

    return {
      type: "submenu",
      key: "folder-assignments",
      label: t("sidebar.addToFolder"),
      icon: "folder",
      items: submenuItems,
      contentVariant: "wide",
      sideOffset: 8,
      alignOffset: -4,
    };
  }, [assignments, handleToggleAssignment, isLoadingAssignments]);
}

export const StreamContextMenu = React.memo(function StreamContextMenu({
  streamId,
  chat,
  folderId,
  onCreateTopic,
  onMuteError,
  children,
}: {
  streamId: number;
  chat: Extract<SidebarChat, { type: "stream" }>;
  folderId?: string;
  onCreateTopic?: () => void;
  onMuteError?: (retry: () => void) => void;
  children: React.ReactNode;
}) {
  const {
    menuOpen,
    contextAnchor,
    handleContextMenuCapture,
    handleKeyboardContextMenu,
    handleMenuOpenChange,
  } = useSidebarChatContextMenuAnchor();
  const [notificationPending, setNotificationPending] = useState(false);
  const notificationLevel = useMuteStore((s) => s.getStreamNotificationLevel(streamId));
  const chatId = chatToWorkspaceChatId(chat);
  const { isPinned, showFolderPinAction, runPin, runUnpin } = useSidebarFolderPinMenu(
    folderId,
    chatId,
  );
  const folderAssignmentsSubmenuItem = useFolderAssignmentsSubmenu(chatId, menuOpen);

  const handleSetNotificationLevel = useCallback(
    (level: StreamNotificationLevel): void => {
      if (notificationPending || notificationLevel === level) return;
      handleMenuOpenChange(false);

      async function attemptSetLevel(): Promise<void> {
        setNotificationPending(true);
        try {
          const ok = await runOptimisticStreamNotificationLevelUpdate({
            streamId,
            level,
            request: () => setStreamNotificationLevel(streamId, level),
          });
          if (ok) return;
          onMuteError?.(() => {
            void attemptSetLevel();
          });
        } finally {
          setNotificationPending(false);
        }
      }

      void attemptSetLevel();
    },
    [notificationLevel, notificationPending, onMuteError, handleMenuOpenChange, streamId],
  );

  const handleMarkAsRead = useCallback(() => {
    handleMenuOpenChange(false);
    void applySidebarMarkChatAsReadAndSync({ type: "stream", streamId });
  }, [handleMenuOpenChange, streamId]);

  const handlePinChat = useCallback(() => {
    handleMenuOpenChange(false);
    runPin();
  }, [handleMenuOpenChange, runPin]);

  const handleUnpinChat = useCallback(() => {
    handleMenuOpenChange(false);
    runUnpin();
  }, [handleMenuOpenChange, runUnpin]);

  const handleCreateTopic = useCallback(() => {
    onCreateTopic?.();
    handleMenuOpenChange(false);
  }, [handleMenuOpenChange, onCreateTopic]);

  const notificationPickerItem = useMemo<DropdownMenuItem>(
    () => ({
      type: "custom",
      key: "notifications",
      render: () => (
        <div className="px-2 py-1">
          <p className="mb-1 text-[10px] font-medium text-text-muted">
            {t("channel.notifications")}
          </p>
          <StreamNotificationLevelSwitch
            value={notificationLevel}
            disabled={notificationPending}
            size="menu"
            onChange={handleSetNotificationLevel}
          />
        </div>
      ),
    }),
    [handleSetNotificationLevel, notificationLevel, notificationPending],
  );

  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [
      notificationPickerItem,
      {
        type: "action",
        key: "mark-as-read",
        icon: "check",
        label: t("sidebar.markAsRead"),
        onSelect: handleMarkAsRead,
      },
    ];

    if (showFolderPinAction) {
      items.push({
        type: "action",
        key: "pin",
        icon: "pin",
        label: isPinned ? t("sidebar.unpinChat") : t("sidebar.pinChat"),
        onSelect: isPinned ? handleUnpinChat : handlePinChat,
      });
    }

    if (onCreateTopic) {
      items.push({
        type: "action",
        key: "new-topic",
        icon: "plus",
        label: t("channel.newTopic"),
        onSelect: handleCreateTopic,
      });
    }

    items.push(folderAssignmentsSubmenuItem);
    return items;
  }, [
    folderAssignmentsSubmenuItem,
    handleCreateTopic,
    handleMarkAsRead,
    handlePinChat,
    handleUnpinChat,
    notificationPickerItem,
    isPinned,
    onCreateTopic,
    showFolderPinAction,
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
        itemClassName={SIDEBAR_MENU_ITEM_CLASS}
        submenuTriggerClassName={SIDEBAR_MENU_ITEM_CLASS}
        checkboxItemClassName={SIDEBAR_MENU_ITEM_CLASS}
        contextContentProps={{
          sideOffset: 4,
          align: "start",
        }}
      />
    </div>
  );
});

export const DmContextMenu = React.memo(function DmContextMenu({
  chat,
  folderId,
  children,
}: {
  chat: Extract<SidebarChat, { type: "dm" }>;
  folderId?: string;
  children: React.ReactNode;
}) {
  const {
    menuOpen,
    contextAnchor,
    handleContextMenuCapture,
    handleKeyboardContextMenu,
    handleMenuOpenChange,
  } = useSidebarChatContextMenuAnchor();
  const chatId = chatToWorkspaceChatId(chat);
  const { isPinned, showFolderPinAction, runPin, runUnpin } = useSidebarFolderPinMenu(
    folderId,
    chatId,
  );
  const folderAssignmentsSubmenuItem = useFolderAssignmentsSubmenu(chatId, menuOpen);

  const handleMarkAsRead = useCallback(() => {
    const userIds =
      Array.isArray(chat.userIds) && chat.userIds.length > 0
        ? chat.userIds
        : parseDmSlugToUserIds(chat.slug);
    if (userIds.length === 0) return;
    handleMenuOpenChange(false);
    void applySidebarMarkChatAsReadAndSync({ type: "dm", userIds });
  }, [chat.slug, chat.userIds, handleMenuOpenChange]);

  const handlePinChat = useCallback(() => {
    handleMenuOpenChange(false);
    runPin();
  }, [handleMenuOpenChange, runPin]);

  const handleUnpinChat = useCallback(() => {
    handleMenuOpenChange(false);
    runUnpin();
  }, [handleMenuOpenChange, runUnpin]);

  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [
      {
        type: "action",
        key: "mark-as-read",
        icon: "check",
        label: t("sidebar.markAsRead"),
        onSelect: handleMarkAsRead,
      },
    ];
    if (showFolderPinAction) {
      items.push({
        type: "action",
        key: "pin",
        icon: "pin",
        label: isPinned ? t("sidebar.unpinChat") : t("sidebar.pinChat"),
        onSelect: isPinned ? handleUnpinChat : handlePinChat,
      });
    }
    items.push(folderAssignmentsSubmenuItem);
    return items;
  }, [
    folderAssignmentsSubmenuItem,
    handleMarkAsRead,
    handlePinChat,
    handleUnpinChat,
    isPinned,
    showFolderPinAction,
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
    <div className="group/dm relative">
      {contentWithContextMenu}
      <DropdownMenu
        open={menuOpen}
        onOpenChange={handleMenuOpenChange}
        source="context"
        contextAnchor={contextAnchor}
        items={menuItems}
        contentVariant="narrow"
        itemClassName={SIDEBAR_MENU_ITEM_CLASS}
        submenuTriggerClassName={SIDEBAR_MENU_ITEM_CLASS}
        checkboxItemClassName={SIDEBAR_MENU_ITEM_CLASS}
        contextContentProps={{
          sideOffset: 4,
          align: "start",
        }}
      />
    </div>
  );
});

export const TopicContextMenu = React.memo(function TopicContextMenu({
  streamId,
  streamName,
  topic,
  rowClassName,
  rowStyle,
  children,
}: {
  streamId: number;
  streamName: string;
  topic: string;
  rowClassName: string;
  rowStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const {
    menuOpen,
    contextAnchor,
    handleContextMenuCapture,
    handleKeyboardContextMenu,
    handleMenuOpenChange,
  } = useSidebarChatContextMenuAnchor();
  const {
    canToggle: canManageTopic,
    isResolved,
    toggleTopicResolved,
    pending: topicActionPending,
    channelName,
    renameDialogOpen,
    setRenameDialogOpen,
    renameTopicDraft,
    setRenameTopicDraft,
    openRenameDialog,
    submitRename,
    renamePending,
  } = useMarkTopicResolved({ streamId, topic, streamName });

  const {
    canMove: canMoveTopicToChannel,
    movePending,
    moveDialogOpen,
    setMoveDialogOpen,
    targetStreamIdRaw,
    setTargetStreamIdRaw,
    moveTopicDraft,
    setMoveTopicDraft,
    targetStreamOptions,
    openMoveDialog,
    submitMove,
    channelName: moveChannelName,
  } = useMoveTopicToStream({ streamId, topic, streamName });

  const topicActionsPending = topicActionPending || movePending;
  const resolveLabel = isResolved ? t("channel.markTopicAsNotDone") : t("channel.markTopicAsDone");

  const handleMoveSelect = useCallback(() => {
    openMoveDialog();
    handleMenuOpenChange(false);
  }, [handleMenuOpenChange, openMoveDialog]);

  const handleMarkAsRead = useCallback(() => {
    handleMenuOpenChange(false);
    void applySidebarMarkChatAsReadAndSync({ type: "topic", streamId, topic });
  }, [handleMenuOpenChange, streamId, topic]);

  const handleResolveSelect = useCallback(() => {
    toggleTopicResolved();
    handleMenuOpenChange(false);
  }, [handleMenuOpenChange, toggleTopicResolved]);

  const handleRenameSelect = useCallback(() => {
    openRenameDialog();
    handleMenuOpenChange(false);
  }, [handleMenuOpenChange, openRenameDialog]);

  const topicNotificationPickerItem = useMemo<DropdownMenuItem>(
    () => ({
      type: "custom",
      key: "topic-notifications",
      render: () => <TopicNotificationLevelMenuPicker streamId={streamId} topic={topic} />,
    }),
    [streamId, topic],
  );

  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [
      topicNotificationPickerItem,
      {
        type: "action",
        key: "mark-as-read",
        icon: "check",
        label: t("sidebar.markAsRead"),
        onSelect: handleMarkAsRead,
      },
    ];
    if (canManageTopic) {
      items.push(
        {
          type: "action",
          key: "rename-topic",
          icon: "pen",
          label: t("channel.renameTopic"),
          disabled: topicActionsPending,
          onSelect: handleRenameSelect,
        },
        {
          type: "action",
          key: "resolve-topic",
          icon: "check",
          label: resolveLabel,
          disabled: topicActionsPending,
          onSelect: handleResolveSelect,
        },
      );
    }
    if (canMoveTopicToChannel) {
      items.push({
        type: "action",
        key: "move-topic-to-channel",
        icon: "forward",
        label: t("channel.moveTopicToChannel"),
        disabled: topicActionsPending,
        onSelect: handleMoveSelect,
      });
    }
    return items;
  }, [
    canManageTopic,
    canMoveTopicToChannel,
    handleMarkAsRead,
    handleMoveSelect,
    handleRenameSelect,
    handleResolveSelect,
    resolveLabel,
    topicActionsPending,
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
    <div className={rowClassName} style={rowStyle}>
      {contentWithContextMenu}
      <DropdownMenu
        open={menuOpen}
        onOpenChange={handleMenuOpenChange}
        source="context"
        contextAnchor={contextAnchor}
        items={menuItems}
        contentVariant="narrow"
        itemClassName={SIDEBAR_MENU_ITEM_CLASS}
        submenuTriggerClassName={SIDEBAR_MENU_ITEM_CLASS}
        checkboxItemClassName={SIDEBAR_MENU_ITEM_CLASS}
        contextContentProps={{
          sideOffset: 4,
          align: "start",
        }}
      />
      {canManageTopic && (
        <RenameStreamTopicDialog
          open={renameDialogOpen}
          channelName={channelName}
          topicName={renameTopicDraft}
          onTopicNameChange={setRenameTopicDraft}
          pending={renamePending}
          onOpenChange={setRenameDialogOpen}
          onSubmit={submitRename}
        />
      )}
      {canMoveTopicToChannel && (
        <MoveTopicToStreamDialog
          open={moveDialogOpen}
          sourceChannelName={moveChannelName}
          targetStreamId={targetStreamIdRaw}
          onTargetStreamIdChange={setTargetStreamIdRaw}
          targetStreamOptions={targetStreamOptions}
          topicName={moveTopicDraft}
          onTopicNameChange={setMoveTopicDraft}
          pending={movePending}
          onOpenChange={setMoveDialogOpen}
          onSubmit={submitMove}
        />
      )}
    </div>
  );
});
