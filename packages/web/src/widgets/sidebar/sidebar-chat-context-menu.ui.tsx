import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID,
  type FolderAssignmentRow,
} from "~/features/folder-sync/folder-sync-assignment.types";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { muteStream, unmuteStream } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { runOptimisticStreamMuteUpdate } from "~/features/mute-chat/mute-chat.optimistic.lib";
import { t } from "~/i18n/i18n";
import { markDmAsRead, markStreamAsRead } from "~/shared/api/zulip";
import { Icon } from "~/shared/ui/icon";
import { useSidebarFolderPinMenu } from "./sidebar-folder-pin-menu.lib";
import { chatToWorkspaceChatId, parseDmSlugToUserIds } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";

function PinFolderMenuItem({
  label,
  onAction,
  children,
}: {
  label: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      className={MENU_ITEM_CLASS}
      onSelect={(event) => {
        event.preventDefault();
        onAction();
      }}
    >
      {children}
      {label}
    </DropdownMenu.Item>
  );
}

const MENU_ITEM_CLASS =
  "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-sm text-text-primary outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-bg-elevated";

function isContextMenuKeyboardEvent(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

const FolderAssignmentsSubmenu = React.memo(function FolderAssignmentsSubmenu({
  chatId,
  menuOpen,
}: {
  chatId: string;
  menuOpen: boolean;
}) {
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
        if (!cancelled) setAssignments(rows);
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAssignments(false);
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

  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={MENU_ITEM_CLASS}>
        <Icon name="folder" size={14} />
        {t("sidebar.addToFolder")}
        <Icon name="chevronRight" size={14} className="ml-auto opacity-60" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          className="z-dropdown min-w-context-menu-wide rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
          sideOffset={8}
          alignOffset={-4}
        >
          {isLoadingAssignments && (
            <DropdownMenu.Item disabled className={MENU_ITEM_CLASS}>
              {t("sidebar.loadingFolders")}
            </DropdownMenu.Item>
          )}
          {!isLoadingAssignments &&
            assignments.map((assignment) => (
              <DropdownMenu.CheckboxItem
                key={assignment.folderUuid}
                checked={assignment.itemUuid != null}
                onCheckedChange={() => void handleToggleAssignment(assignment)}
                onSelect={(e) => {
                  e.preventDefault();
                }}
                className={MENU_ITEM_CLASS}
              >
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded border border-border-subtle text-xs ${
                    assignment.itemUuid != null ? "bg-accent text-on-accent" : "text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="truncate">{assignment.label}</span>
              </DropdownMenu.CheckboxItem>
            ))}
          {!isLoadingAssignments && assignments.length === 0 && (
            <DropdownMenu.Item disabled className={MENU_ITEM_CLASS}>
              {t("sidebar.noFoldersAvailable")}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
});

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
  const { isPinned, showFolderPinAction, runPin, runUnpin } = useSidebarFolderPinMenu(
    folderId,
    chatId,
  );

  const openMenu = useCallback(() => {
    setMenuOpen(true);
  }, []);

  const handleContextMenuCapture = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu();
    },
    [openMenu],
  );

  const handleOpenMenuClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu();
    },
    [openMenu],
  );

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

  const handlePinChat = useCallback(() => {
    setMenuOpen(false);
    runPin();
  }, [runPin]);

  const handleUnpinChat = useCallback(() => {
    setMenuOpen(false);
    runUnpin();
  }, [runUnpin]);

  const handleCreateTopic = useCallback(() => {
    onCreateTopic?.();
    setMenuOpen(false);
  }, [onCreateTopic]);

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
        handleContextMenuCapture(e);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        existingOnKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (isContextMenuKeyboardEvent(e)) {
          e.preventDefault();
          openMenu();
        }
      },
    });

    return [firstChildWithContextMenu, ...childrenArray.slice(1)];
  }, [children, handleContextMenuCapture, openMenu]);

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <div className="relative">
        {contentWithContextMenu}
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={`absolute flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-60 transition-opacity hover:bg-sidebar-hover hover:text-text-primary focus-visible:opacity-100 group-focus-within/stream:opacity-100 group-hover/stream:opacity-100 ${triggerOffsetClassName}`}
            aria-label={t("a11y.chatMenu")}
            onClick={handleOpenMenuClick}
          >
            <Icon name="more" size={14} />
          </button>
        </DropdownMenu.Trigger>
      </div>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-dropdown min-w-context-menu-narrow rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
          sideOffset={4}
          align="start"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleToggleMute}>
            <Icon name={isMuted ? "bell_off" : "bell"} size={14} />
            {isMuted ? t("channel.unmuteChannel") : t("channel.muteChannel")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleMarkAsRead}>
            <Icon name="check" size={14} />
            {t("sidebar.markAsRead")}
          </DropdownMenu.Item>
          {showFolderPinAction &&
            (isPinned ? (
              <PinFolderMenuItem label={t("sidebar.unpinChat")} onAction={handleUnpinChat}>
                <Icon name="pin" size={14} />
              </PinFolderMenuItem>
            ) : (
              <PinFolderMenuItem label={t("sidebar.pinChat")} onAction={handlePinChat}>
                <Icon name="pin" size={14} />
              </PinFolderMenuItem>
            ))}
          {onCreateTopic && (
            <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleCreateTopic}>
              <Icon name="plus" size={14} />
              {t("channel.newTopic")}
            </DropdownMenu.Item>
          )}
          <FolderAssignmentsSubmenu chatId={chatId} menuOpen={menuOpen} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
  const { isPinned, showFolderPinAction, runPin, runUnpin } = useSidebarFolderPinMenu(
    folderId,
    chatId,
  );

  const handleMarkAsRead = useCallback(() => {
    const userIds =
      Array.isArray(chat.userIds) && chat.userIds.length > 0
        ? chat.userIds
        : parseDmSlugToUserIds(chat.slug);
    if (userIds.length === 0) return;
    void markDmAsRead(userIds);
    setMenuOpen(false);
  }, [chat.slug, chat.userIds]);

  const handlePinChat = useCallback(() => {
    setMenuOpen(false);
    runPin();
  }, [runPin]);

  const handleUnpinChat = useCallback(() => {
    setMenuOpen(false);
    runUnpin();
  }, [runUnpin]);

  const openMenu = useCallback(() => {
    setMenuOpen(true);
  }, []);

  const handleContextMenuCapture = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu();
    },
    [openMenu],
  );

  const handleOpenMenuClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu();
    },
    [openMenu],
  );

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
        handleContextMenuCapture(e);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        existingOnKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (isContextMenuKeyboardEvent(e)) {
          e.preventDefault();
          openMenu();
        }
      },
    });
  }, [children, handleContextMenuCapture, openMenu]);

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <div className="group/dm relative">
        {contentWithContextMenu}
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={`absolute flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-60 transition-opacity hover:bg-sidebar-hover hover:text-text-primary focus-visible:opacity-100 group-focus-within/dm:opacity-100 group-hover/dm:opacity-100 ${triggerOffsetClassName}`}
            aria-label={t("a11y.chatMenu")}
            onClick={handleOpenMenuClick}
          >
            <Icon name="more" size={14} />
          </button>
        </DropdownMenu.Trigger>
      </div>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-dropdown min-w-context-menu-narrow rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
          sideOffset={4}
          align="start"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleMarkAsRead}>
            <Icon name="check" size={14} />
            {t("sidebar.markAsRead")}
          </DropdownMenu.Item>
          {showFolderPinAction &&
            (isPinned ? (
              <PinFolderMenuItem label={t("sidebar.unpinChat")} onAction={handleUnpinChat}>
                <Icon name="pin" size={14} />
              </PinFolderMenuItem>
            ) : (
              <PinFolderMenuItem label={t("sidebar.pinChat")} onAction={handlePinChat}>
                <Icon name="pin" size={14} />
              </PinFolderMenuItem>
            ))}
          <FolderAssignmentsSubmenu chatId={chatId} menuOpen={menuOpen} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
});
