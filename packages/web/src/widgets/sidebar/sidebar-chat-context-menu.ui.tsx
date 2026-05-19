import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID,
  type FolderAssignmentRow,
} from "~/features/folder-sync/folder-sync-assignment.types";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { muteStream, unmuteStream } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { runOptimisticStreamMuteUpdate } from "~/features/mute-chat/mute-chat.optimistic.lib";
import { pinChatInFolder, unpinChatInFolder } from "~/features/pin-chat/pin-chat.api";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { t } from "~/i18n/i18n";
import { getFolderItems } from "~/shared/api/workspace-client";
import { markDmAsRead, markStreamAsRead } from "~/shared/api/zulip";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";
import { chatToWorkspaceChatId, parseDmSlugToUserIds } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";

const SIDEBAR_MENU_ITEM_CLASS =
  "data-[highlighted]:bg-sidebar-hover flex cursor-pointer select-none items-center gap-2 px-2 py-2 text-sm text-text-primary outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-sidebar-hover focus-visible:outline-none focus-visible:outline-0 focus-visible:outline-offset-0";

function isContextMenuKeyboardEvent(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

function isVirtualSystemFolderId(folderId: string | undefined): boolean {
  return folderId === "system:personal" || folderId === "system:channels";
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
  triggerOffsetClassName = "right-1 top-8",
  children,
}: {
  streamId: number;
  chat: Extract<SidebarChat, { type: "stream" }>;
  folderId?: string;
  onCreateTopic?: () => void;
  onMuteError?: (retry: () => void) => void;
  triggerOffsetClassName?: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mutePending, setMutePending] = useState(false);
  const isMuted = useMuteStore((s) => s.isStreamMuted(streamId));
  const chatId = chatToWorkspaceChatId(chat);
  const isPinnedInFolder = usePinStore((s) =>
    folderId != null ? s.isPinned(folderId, chatId) : false,
  );
  const isPinned = folderId != null && isPinnedInFolder;
  const folderAssignmentsSubmenuItem = useFolderAssignmentsSubmenu(chatId, menuOpen);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  }, []);

  const handleToggleMute = useCallback((): void => {
    if (mutePending) return;
    setMenuOpen(false);

    async function attemptToggleMute(): Promise<void> {
      setMutePending(true);
      try {
        const ok = await runOptimisticStreamMuteUpdate({
          streamId,
          applyOptimistic: (wasMuted) => {
            const muteStore = useMuteStore.getState();
            if (wasMuted) {
              muteStore.unmuteStream(streamId);
              return;
            }
            muteStore.muteStream(streamId);
          },
          request: (wasMuted) => (wasMuted ? unmuteStream(streamId) : muteStream(streamId)),
        });
        if (ok) return;
        onMuteError?.(() => {
          void attemptToggleMute();
        });
      } finally {
        setMutePending(false);
      }
    }

    void attemptToggleMute();
  }, [mutePending, onMuteError, streamId]);

  const handleMarkAsRead = useCallback(() => {
    void markStreamAsRead(streamId);
    setMenuOpen(false);
  }, [streamId]);

  const handleTogglePin = useCallback(() => {
    if (folderId == null) return;
    setMenuOpen(false);
    void (async () => {
      const pinStore = usePinStore.getState();
      let folderItemUuid = pinStore.getFolderItemUuid(folderId, chatId);
      if (!folderItemUuid) {
        const items = await getFolderItems(folderId);
        folderItemUuid = items.find((i) => i.chatId === chatId)?.uuid ?? null;
      }
      if (!folderItemUuid) return;

      if (isPinned) {
        const ok = await unpinChatInFolder(folderId, folderItemUuid);
        if (ok) {
          pinStore.unpinChat(folderId, chatId);
        }
      } else {
        const ok = await pinChatInFolder(folderId, folderItemUuid);
        if (ok) {
          pinStore.pinChat(folderId, chatId, { folderItemUuid });
        }
      }
    })();
  }, [chatId, folderId, isPinned]);

  const handleCreateTopic = useCallback(() => {
    onCreateTopic?.();
    setMenuOpen(false);
  }, [onCreateTopic]);

  const showFolderPinAction =
    folderId != null && folderId.length > 0 && !isVirtualSystemFolderId(folderId);

  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [
      {
        type: "action",
        key: "mute",
        icon: isMuted ? "bell_off" : "bell",
        label: isMuted ? t("channel.unmuteChannel") : t("channel.muteChannel"),
        onSelect: handleToggleMute,
      },
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
        onSelect: handleTogglePin,
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
    handleToggleMute,
    handleTogglePin,
    isMuted,
    isPinned,
    onCreateTopic,
    showFolderPinAction,
  ]);

  const contentWithContextMenu = useMemo(() => {
    const childrenArray = React.Children.toArray(children);
    if (childrenArray.length === 0) return childrenArray;

    const firstChild = childrenArray[0];
    if (!React.isValidElement(firstChild)) return childrenArray;

    const firstChildElement = firstChild as React.ReactElement<{
      onContextMenu?: React.MouseEventHandler;
      onKeyDown?: React.KeyboardEventHandler;
    }>;
    const existingOnContextMenu = firstChildElement.props.onContextMenu;
    const existingOnKeyDown = firstChildElement.props.onKeyDown;

    const firstChildWithContextMenu = React.cloneElement(firstChildElement, {
      onContextMenu: (e: React.MouseEvent) => {
        existingOnContextMenu?.(e);
        handleContextMenu(e);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        existingOnKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (isContextMenuKeyboardEvent(e)) {
          e.preventDefault();
          setMenuOpen(true);
        }
      },
    });

    return [firstChildWithContextMenu, ...childrenArray.slice(1)];
  }, [children, handleContextMenu]);

  return (
    <div className="relative">
      {contentWithContextMenu}
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={
          <button
            type="button"
            className={`absolute flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-60 transition-opacity group-focus-within/stream:opacity-100 group-hover/stream:opacity-100 hover:bg-sidebar-hover hover:text-text-primary focus-visible:opacity-100 ${triggerOffsetClassName}`}
            aria-label={t("a11y.chatMenu")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <Icon name="more" size={14} />
          </button>
        }
        items={menuItems}
        contentVariant="narrow"
        itemClassName={SIDEBAR_MENU_ITEM_CLASS}
        submenuTriggerClassName={SIDEBAR_MENU_ITEM_CLASS}
        checkboxItemClassName={SIDEBAR_MENU_ITEM_CLASS}
        contentProps={{
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
  triggerOffsetClassName = "right-1 top-8",
  children,
}: {
  chat: Extract<SidebarChat, { type: "dm" }>;
  folderId?: string;
  triggerOffsetClassName?: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const chatId = chatToWorkspaceChatId(chat);
  const isPinnedInFolder = usePinStore((s) =>
    folderId != null ? s.isPinned(folderId, chatId) : false,
  );
  const isPinned = folderId != null && isPinnedInFolder;
  const folderAssignmentsSubmenuItem = useFolderAssignmentsSubmenu(chatId, menuOpen);

  const handleMarkAsRead = useCallback(() => {
    const userIds =
      Array.isArray(chat.userIds) && chat.userIds.length > 0
        ? chat.userIds
        : parseDmSlugToUserIds(chat.slug);
    if (userIds.length === 0) return;
    void markDmAsRead(userIds);
    setMenuOpen(false);
  }, [chat.slug, chat.userIds]);

  const handleTogglePin = useCallback(() => {
    if (folderId == null) return;
    setMenuOpen(false);
    void (async () => {
      const pinStore = usePinStore.getState();
      let folderItemUuid = pinStore.getFolderItemUuid(folderId, chatId);
      if (!folderItemUuid) {
        const items = await getFolderItems(folderId);
        folderItemUuid = items.find((i) => i.chatId === chatId)?.uuid ?? null;
      }
      if (!folderItemUuid) return;

      if (isPinned) {
        const ok = await unpinChatInFolder(folderId, folderItemUuid);
        if (ok) {
          pinStore.unpinChat(folderId, chatId);
        }
      } else {
        const ok = await pinChatInFolder(folderId, folderItemUuid);
        if (ok) {
          pinStore.pinChat(folderId, chatId, { folderItemUuid });
        }
      }
    })();
  }, [chatId, folderId, isPinned]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  }, []);

  const showFolderPinAction =
    folderId != null && folderId.length > 0 && !isVirtualSystemFolderId(folderId);

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
        onSelect: handleTogglePin,
      });
    }
    items.push(folderAssignmentsSubmenuItem);
    return items;
  }, [
    folderAssignmentsSubmenuItem,
    handleMarkAsRead,
    handleTogglePin,
    isPinned,
    showFolderPinAction,
  ]);

  const contentWithContextMenu = useMemo(() => {
    if (!React.isValidElement(children)) return children;
    const childElement = children as React.ReactElement<{
      onContextMenu?: React.MouseEventHandler;
      onKeyDown?: React.KeyboardEventHandler;
    }>;
    const existingOnContextMenu = childElement.props.onContextMenu;
    const existingOnKeyDown = childElement.props.onKeyDown;
    return React.cloneElement(childElement, {
      onContextMenu: (e: React.MouseEvent) => {
        existingOnContextMenu?.(e);
        handleContextMenu(e);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        existingOnKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (isContextMenuKeyboardEvent(e)) {
          e.preventDefault();
          setMenuOpen(true);
        }
      },
    });
  }, [children, handleContextMenu]);

  return (
    <div className="group/dm relative">
      {contentWithContextMenu}
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={
          <button
            type="button"
            className={`absolute flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-60 transition-opacity group-focus-within/stream:opacity-100 group-hover/stream:opacity-100 hover:bg-sidebar-hover hover:text-text-primary focus-visible:opacity-100 ${triggerOffsetClassName}`}
            aria-label={t("a11y.chatMenu")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <Icon name="more" size={14} />
          </button>
        }
        items={menuItems}
        contentVariant="narrow"
        itemClassName={SIDEBAR_MENU_ITEM_CLASS}
        submenuTriggerClassName={SIDEBAR_MENU_ITEM_CLASS}
        checkboxItemClassName={SIDEBAR_MENU_ITEM_CLASS}
        contentProps={{
          sideOffset: 4,
          align: "start",
        }}
      />
    </div>
  );
});
