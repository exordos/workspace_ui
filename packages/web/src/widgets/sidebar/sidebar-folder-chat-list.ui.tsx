import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list";
import { formatUserStatusLabel, useUsersStore } from "~/entities/user";
import {
  useMuteStore,
  muteStream,
  unmuteStream,
  muteTopic,
  unmuteTopic,
} from "~/features/mute-chat";
import { pinChatInFolder, unpinChatInFolder, usePinStore } from "~/features/pin-chat";
import { useSettingsStore } from "~/features/settings";
import { useTypingIndicatorStore } from "~/features/typing-indicator";
import { t } from "~/i18n";
import { getFolderItems, updateFolderItemOrder } from "~/shared/api";
import {
  getRealmBaseUrl,
  markDmAsRead,
  markStreamAsRead,
  setTopicResolvedState,
} from "~/shared/api/zulip";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { sidebarRowClass, getPresenceState } from "~/shared/lib/format";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import {
  isTopicResolved,
  toResolvedTopicName,
  toUnresolvedTopicName,
} from "~/shared/lib/topic-resolve";
import { Avatar, Badge, Icon } from "~/shared/ui";
import { isDmPartnerTyping } from "./sidebar-dm-list.lib";
import { loadFolderAssignments, toggleFolderAssignment } from "./sidebar-folder-assignment.lib";
import {
  slugForStream,
  TOPIC_BAR_COLORS,
  chatToWorkspaceChatId,
  parseDmSlugToUserIds,
} from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";

function getAvatarUrl(avatarUrl: string | undefined): string | null {
  return resolveAvatarUrl(avatarUrl, getRealmBaseUrl()) ?? null;
}

const DmChatRow = React.memo(function DmChatRow({
  chat,
  isActive,
  isPinned,
  compact,
  onContextMenu,
  onKeyDown,
}: {
  chat: Extract<SidebarChat, { type: "dm" }>;
  isActive: boolean;
  isPinned: boolean;
  compact: boolean;
  onContextMenu?: React.MouseEventHandler;
  onKeyDown?: React.KeyboardEventHandler;
}) {
  const partnerUserId = chat.isGroup ? null : chat.id;
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const typingMap = useTypingIndicatorStore((s) => s.typingMap);
  const user = useUsersStore((s) => (partnerUserId != null ? s.getUser(partnerUserId) : undefined));
  const partnerIsTyping = isDmPartnerTyping({
    partnerUserId,
    currentUserId,
    typingMap,
  });
  const statusLabel = formatUserStatusLabel(user?.status);
  const secondaryText = partnerIsTyping
    ? t("chat.typing")
    : statusLabel != null && statusLabel.length > 0
      ? chat.lastMessage != null && chat.lastMessage.length > 0
        ? `${statusLabel} · ${chat.lastMessage}`
        : statusLabel
      : (chat.lastMessage ?? "");
  const presenceState =
    user?.presence != null ? getPresenceState(user.presence.timestamp, user.presence.status) : null;
  const avatarSrc = !chat.isGroup ? getAvatarUrl(chat.avatar_url) : null;
  const rowClass = compact
    ? "flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
    : "flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors";

  return (
    <Link
      to={`/dm/${chat.slug}`}
      className={`${rowClass} ${sidebarRowClass(isActive)}`}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      <div className="relative shrink-0">
        <Avatar size={compact ? "sm" : "md"} src={avatarSrc ?? undefined}>
          {chat.isGroup ? (
            <span data-testid={`group-avatar-icon-${chat.slug}`}>
              <Icon name="group" size={16} className="text-text-primary" />
            </span>
          ) : (
            chat.name.slice(0, 1)
          )}
        </Avatar>
        {presenceState === "active" && (
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg bg-indicator-green"
            aria-label={t("a11y.online")}
          />
        )}
        {presenceState === "idle" && (
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg bg-indicator-orange"
            aria-label={t("a11y.away")}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="block truncate text-sm font-medium text-text-primary">{chat.name}</span>
        {!compact && (
          <span
            className={`mt-0.5 block truncate text-[11px] ${
              partnerIsTyping ? "italic text-text-primary" : "text-text-secondary"
            }`}
          >
            {secondaryText}
          </span>
        )}
      </div>
      <div className={`flex flex-shrink-0 flex-col items-end ${compact ? "gap-0.5" : "gap-1"}`}>
        <div className="flex items-center gap-1">
          {isPinned && <Icon name="pin" size={12} className="text-text-muted" />}
          <span className="text-xs text-text-muted">{chat.time ?? "10:13"}</span>
          {chat.badge !== undefined && <Badge count={chat.badge} variant="unread" />}
        </div>
      </div>
    </Link>
  );
});

const TopicMuteButton = React.memo<{ streamId: number; topic: string }>(({ streamId, topic }) => {
  const isMuted = useMuteStore((s) => s.isTopicMuted(streamId, topic));
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMuted) {
        useMuteStore.getState().unmuteTopic(streamId, topic);
        void unmuteTopic(streamId, topic);
      } else {
        useMuteStore.getState().muteTopic(streamId, topic);
        void muteTopic(streamId, topic);
      }
    },
    [streamId, topic, isMuted],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex h-6 w-6 items-center justify-center rounded text-text-muted transition-opacity hover:text-text-primary ${
        isMuted
          ? "opacity-100"
          : "opacity-0 group-focus-within/topic:opacity-100 group-hover/topic:opacity-100 focus-visible:opacity-100"
      }`}
      aria-label={isMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
      title={isMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
    >
      <Icon name="bell" size={14} className={isMuted ? "opacity-40" : ""} />
    </button>
  );
});

const TopicResolvedButton = React.memo<{
  streamId: number;
  topic: string;
  streamSlug: string;
  isActiveTopic: boolean;
}>(({ streamId, topic, streamSlug, isActiveTopic }) => {
  const navigate = useNavigate();
  const [isUpdating, setIsUpdating] = useState(false);
  const isResolved = isTopicResolved(topic);
  const buttonLabel = isResolved ? t("channel.markTopicAsNotDone") : t("channel.markTopicAsDone");

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isUpdating) return;

      const shouldResolve = !isResolved;
      const nextTopicName = shouldResolve
        ? toResolvedTopicName(topic)
        : toUnresolvedTopicName(topic);

      setIsUpdating(true);
      void setTopicResolvedState(streamId, topic, shouldResolve)
        .then((ok) => {
          if (!ok) return;
          if (!isActiveTopic) return;
          if (nextTopicName === topic) return;
          void navigate(
            withCurrentOrgRoute(`/stream/${streamSlug}/topic/${encodeURIComponent(nextTopicName)}`),
            { replace: true },
          );
        })
        .finally(() => {
          setIsUpdating(false);
        });
    },
    [isUpdating, isResolved, streamId, topic, isActiveTopic, streamSlug, navigate],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isUpdating}
      className={`flex h-6 w-6 items-center justify-center rounded text-text-muted transition-opacity hover:text-text-primary disabled:cursor-not-allowed ${
        isResolved || isUpdating
          ? "opacity-100"
          : "opacity-0 group-focus-within/topic:opacity-100 group-hover/topic:opacity-100 focus-visible:opacity-100"
      }`}
      aria-label={buttonLabel}
      title={buttonLabel}
    >
      <Icon name="check" size={14} className={isResolved ? "text-accent" : ""} />
    </button>
  );
});

const MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none data-[highlighted]:bg-accent/20";

function isContextMenuKeyboardEvent(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

function isVirtualSystemFolderId(folderId: string | undefined): boolean {
  return folderId === "system:personal" || folderId === "system:channels";
}

const FolderAssignmentsSubmenu = React.memo(function FolderAssignmentsSubmenu({
  chatId,
  menuOpen,
  onFolderAssignmentsChanged,
}: {
  chatId: string;
  menuOpen: boolean;
  onFolderAssignmentsChanged?: () => void;
}) {
  const [assignments, setAssignments] = useState<
    { folderUuid: string; label: string; itemUuid: string | null }[]
  >([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setIsLoadingAssignments(true);
    });
    loadFolderAssignments(chatId)
      .then((next) => {
        if (!cancelled) setAssignments(next);
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
  }, [chatId, menuOpen]);

  const handleToggleAssignment = useCallback(
    (folderUuid: string) => {
      const assignment = assignments.find((row) => row.folderUuid === folderUuid);
      if (!assignment) return;

      void toggleFolderAssignment(chatId, assignment).then((result) => {
        if (!result.ok) return;

        setAssignments((prev) =>
          prev.map((row) =>
            row.folderUuid === folderUuid ? { ...row, itemUuid: result.nextItemUuid } : row,
          ),
        );

        if (result.removed) {
          usePinStore.getState().unpinChat(folderUuid, chatId);
        }

        onFolderAssignmentsChanged?.();
      });
    },
    [assignments, chatId, onFolderAssignmentsChanged],
  );

  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={MENU_ITEM_CLASS}>
        <Icon name="folder" size={14} />
        {t("sidebar.addToFolder")}
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          className="z-dropdown min-w-[220px] rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
          sideOffset={4}
          alignOffset={-4}
        >
          {isLoadingAssignments && (
            <DropdownMenu.Item disabled className={MENU_ITEM_CLASS}>
              {t("app.loading")}
            </DropdownMenu.Item>
          )}
          {!isLoadingAssignments &&
            assignments.map((assignment) => (
              <DropdownMenu.CheckboxItem
                key={assignment.folderUuid}
                checked={assignment.itemUuid != null}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleAssignment(assignment.folderUuid);
                }}
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

const StreamContextMenu = React.memo(function StreamContextMenu({
  streamId,
  chat,
  folderId,
  onCreateTopic,
  onFolderAssignmentsChanged,
  triggerOffsetClassName = "right-1 top-8",
  children,
}: {
  streamId: number;
  chat: Extract<SidebarChat, { type: "stream" }>;
  folderId?: string;
  onCreateTopic?: () => void;
  onFolderAssignmentsChanged?: () => void;
  triggerOffsetClassName?: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isMuted = useMuteStore((s) => s.isStreamMuted(streamId));
  const chatId = chatToWorkspaceChatId(chat);
  const isPinnedInFolder = usePinStore((s) =>
    folderId != null ? s.isPinned(folderId, chatId) : false,
  );
  const isPinned = folderId != null && isPinnedInFolder;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  }, []);

  const handleToggleMute = useCallback(() => {
    if (isMuted) {
      useMuteStore.getState().unmuteStream(streamId);
      void unmuteStream(streamId);
    } else {
      useMuteStore.getState().muteStream(streamId);
      void muteStream(streamId);
    }
    setMenuOpen(false);
  }, [streamId, isMuted]);

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
  }, [folderId, chatId, isPinned]);

  const handleCreateTopic = useCallback(() => {
    onCreateTopic?.();
    setMenuOpen(false);
  }, [onCreateTopic]);

  const showFolderPinAction =
    folderId != null && folderId.length > 0 && !isVirtualSystemFolderId(folderId);
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
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <div className="relative">
        {contentWithContextMenu}
        <DropdownMenu.Trigger asChild>
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
        </DropdownMenu.Trigger>
      </div>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-dropdown min-w-[180px] rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
          sideOffset={4}
          align="start"
        >
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleToggleMute}>
            <Icon name="bell" size={14} className={isMuted ? "opacity-40" : ""} />
            {isMuted ? t("channel.unmuteChannel") : t("channel.muteChannel")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleMarkAsRead}>
            <Icon name="check" size={14} />
            {t("sidebar.markAsRead")}
          </DropdownMenu.Item>
          {showFolderPinAction && (
            <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleTogglePin}>
              <Icon name="pin" size={14} />
              {isPinned ? t("sidebar.unpinChat") : t("sidebar.pinChat")}
            </DropdownMenu.Item>
          )}
          {onCreateTopic && (
            <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleCreateTopic}>
              <Icon name="plus" size={14} />
              {t("channel.newTopic")}
            </DropdownMenu.Item>
          )}
          <FolderAssignmentsSubmenu
            chatId={chatId}
            menuOpen={menuOpen}
            onFolderAssignmentsChanged={onFolderAssignmentsChanged}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
});

const DmContextMenu = React.memo(function DmContextMenu({
  chat,
  folderId,
  onFolderAssignmentsChanged,
  children,
}: {
  chat: Extract<SidebarChat, { type: "dm" }>;
  folderId?: string;
  onFolderAssignmentsChanged?: () => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const chatId = chatToWorkspaceChatId(chat);
  const isPinnedInFolder = usePinStore((s) =>
    folderId != null ? s.isPinned(folderId, chatId) : false,
  );
  const isPinned = folderId != null && isPinnedInFolder;
  const handleMarkAsRead = useCallback(() => {
    const userIds =
      Array.isArray(chat.userIds) && chat.userIds.length > 0
        ? chat.userIds
        : parseDmSlugToUserIds(chat.slug);
    if (userIds.length === 0) return;
    void markDmAsRead(userIds);
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
  }, [folderId, chatId, isPinned]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  }, []);
  const showFolderPinAction =
    folderId != null && folderId.length > 0 && !isVirtualSystemFolderId(folderId);
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
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <div className="group/dm relative">
        {contentWithContextMenu}
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-60 transition-opacity group-focus-within/dm:opacity-100 group-hover/dm:opacity-100 hover:bg-sidebar-hover hover:text-text-primary focus-visible:opacity-100"
            aria-label={t("a11y.chatMenu")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <Icon name="more" size={14} />
          </button>
        </DropdownMenu.Trigger>
      </div>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-dropdown min-w-[180px] rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
          sideOffset={4}
          align="start"
        >
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleMarkAsRead}>
            <Icon name="check" size={14} />
            {t("sidebar.markAsRead")}
          </DropdownMenu.Item>
          {showFolderPinAction && (
            <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={handleTogglePin}>
              <Icon name="pin" size={14} />
              {isPinned ? t("sidebar.unpinChat") : t("sidebar.pinChat")}
            </DropdownMenu.Item>
          )}
          <FolderAssignmentsSubmenu
            chatId={chatId}
            menuOpen={menuOpen}
            onFolderAssignmentsChanged={onFolderAssignmentsChanged}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
});

const EMPTY_PINNED_IDS: string[] = [];

function SortablePinnedItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

interface SidebarFolderChatListProps {
  chats: SidebarChat[];
  selectedFolderId?: string;
  pinFolderId?: string;
  activeStreamSlug?: string | null;
  activeDmIdParam?: string | null;
  activeTopic?: string | null;
  expandedStreamSlug?: string | null;
  onToggleStream?: (slug: string) => void;
  onNewTopic?: (streamSlug: string, topicName: string) => void;
  reorderPinnedOnly?: boolean;
  loading?: boolean;
  showEmptyState?: boolean;
  onFolderAssignmentsChanged?: () => void;
}

interface NewTopicDialogState {
  streamId: number;
  streamSlug: string;
  streamName: string;
}

export const SidebarFolderChatList: React.FC<SidebarFolderChatListProps> = ({
  chats,
  selectedFolderId,
  pinFolderId,
  activeStreamSlug: activeStreamSlugProp,
  activeDmIdParam: activeDmIdParamProp,
  activeTopic: activeTopicProp,
  expandedStreamSlug,
  onToggleStream,
  onNewTopic,
  reorderPinnedOnly = false,
  loading = false,
  showEmptyState = false,
  onFolderAssignmentsChanged,
}) => {
  const activeStreamSlug = activeStreamSlugProp ?? null;
  const activeTopic = activeTopicProp ?? null;
  const activeDmIdParam = activeDmIdParamProp ?? null;
  const [topicDialogState, setTopicDialogState] = useState<NewTopicDialogState | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [muteTopicOnCreate, setMuteTopicOnCreate] = useState(false);
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const canExpandStreams = onToggleStream != null && expandedStreamSlug !== undefined;
  const pinScopeFolderId = pinFolderId ?? selectedFolderId;

  const pinnedChatIds = usePinStore((s) =>
    pinScopeFolderId ? s.getPinnedChatIds(pinScopeFolderId) : EMPTY_PINNED_IDS,
  );
  const pinnedChatIdSet = useMemo(() => new Set(pinnedChatIds), [pinnedChatIds]);
  const pinOrderByChatId = useMemo(() => {
    const orderMap = new Map<string, number>();
    for (let index = 0; index < pinnedChatIds.length; index++) {
      const chatId = pinnedChatIds[index];
      if (chatId != null) {
        orderMap.set(chatId, index);
      }
    }
    return orderMap;
  }, [pinnedChatIds]);
  const orderedChats = useMemo(() => {
    if (pinnedChatIds.length === 0) return chats;

    const pinnedChats: SidebarChat[] = [];
    const regularChats: SidebarChat[] = [];

    for (const chat of chats) {
      const chatId = chatToWorkspaceChatId(chat);
      if (pinOrderByChatId.has(chatId)) {
        pinnedChats.push(chat);
      } else {
        regularChats.push(chat);
      }
    }

    pinnedChats.sort((leftChat, rightChat) => {
      const leftOrder =
        pinOrderByChatId.get(chatToWorkspaceChatId(leftChat)) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder =
        pinOrderByChatId.get(chatToWorkspaceChatId(rightChat)) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });

    return [...pinnedChats, ...regularChats];
  }, [chats, pinnedChatIds.length, pinOrderByChatId]);
  const visibleChats = useMemo(() => {
    if (!reorderPinnedOnly) return orderedChats;
    return orderedChats.filter((chat) => pinnedChatIdSet.has(chatToWorkspaceChatId(chat)));
  }, [orderedChats, reorderPinnedOnly, pinnedChatIdSet]);

  const persistPinnedOrder = useCallback((folderId: string, orderedChatIds: string[]) => {
    const pinStore = usePinStore.getState();
    void Promise.all(
      orderedChatIds.map((chatId, index) => {
        const folderItemUuid = pinStore.getFolderItemUuid(folderId, chatId);
        if (!folderItemUuid) {
          return Promise.resolve(false);
        }
        return updateFolderItemOrder(folderId, folderItemUuid, index);
      }),
    );
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !pinScopeFolderId) return;
      const oldIndex = pinnedChatIds.indexOf(String(active.id));
      const newIndex = pinnedChatIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(pinnedChatIds, oldIndex, newIndex);
      usePinStore.getState().reorderPinnedChats(pinScopeFolderId, newOrder);
      persistPinnedOrder(pinScopeFolderId, newOrder);
    },
    [pinnedChatIds, pinScopeFolderId, persistPinnedOrder],
  );

  const closeTopicDialog = useCallback(() => {
    setTopicDialogState(null);
    setNewTopicName("");
    setMuteTopicOnCreate(false);
  }, []);

  const openTopicDialogForStream = useCallback(
    ({ streamId, streamName, streamSlug }: NewTopicDialogState) => {
      if (
        onToggleStream != null &&
        expandedStreamSlug !== undefined &&
        expandedStreamSlug !== streamSlug
      ) {
        onToggleStream(streamSlug);
      }
      setTopicDialogState({ streamId, streamName, streamSlug });
      setNewTopicName("");
      setMuteTopicOnCreate(false);
    },
    [expandedStreamSlug, onToggleStream],
  );

  const handleCreateTopicFromDialog = useCallback(() => {
    const topicName = newTopicName.trim();
    if (topicDialogState == null || onNewTopic == null || topicName.length === 0) {
      return;
    }

    onNewTopic(topicDialogState.streamSlug, topicName);

    if (muteTopicOnCreate) {
      useMuteStore.getState().muteTopic(topicDialogState.streamId, topicName);
      void muteTopic(topicDialogState.streamId, topicName);
    }

    closeTopicDialog();
  }, [closeTopicDialog, muteTopicOnCreate, newTopicName, onNewTopic, topicDialogState]);

  if (loading) {
    // Плейсхолдер списка чатов на время переключения/дозагрузки выбранной папки.
    return (
      <div className="px-3 py-4">
        <div className="bg-bg-elevated/40 flex items-center justify-center rounded-lg border border-dashed border-border-subtle px-3 py-5 text-center">
          <p className="text-sm text-text-muted">{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (visibleChats.length === 0) {
    if (!showEmptyState) return null;

    const emptyTitle = reorderPinnedOnly ? t("folder.noPinnedChats") : t("folder.emptyFolder");
    const emptyHint = reorderPinnedOnly
      ? t("folder.noPinnedChatsHint")
      : t("folder.emptyFolderHint");

    return (
      <div className="px-3 py-4">
        <div className="bg-bg-elevated/40 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle px-3 py-5 text-center">
          <Icon name={reorderPinnedOnly ? "pin" : "folder"} size={18} className="text-text-muted" />
          <p className="text-sm font-medium text-text-primary">{emptyTitle}</p>
          <p className="max-w-[220px] text-xs text-text-muted">{emptyHint}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pinnedChatIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5 px-2">
            {visibleChats.map((chat) => {
              const chatWsId = chatToWorkspaceChatId(chat);
              const isPinnedChat = pinnedChatIdSet.has(chatWsId);
              const wrapPinned = (el: React.ReactElement) =>
                isPinnedChat ? (
                  <SortablePinnedItem key={chatWsId} id={chatWsId}>
                    {el}
                  </SortablePinnedItem>
                ) : (
                  el
                );

              if (chat.type === "stream") {
                const streamSlug = slugForStream(chat);
                const isActive = streamSlug === activeStreamSlug;
                const expanded = canExpandStreams && expandedStreamSlug === streamSlug;
                const displayName =
                  chat.name.toLowerCase() === "general" ? t("chat.generalChat") : chat.name;
                const topics = chat.topics ?? [];
                const streamRowClass = isCompactDensity
                  ? "group/stream flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
                  : "group/stream flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors";
                const streamAvatarSize = isCompactDensity ? "sm" : "md";
                const streamTriggerOffsetClassName = isCompactDensity
                  ? "right-1 top-6"
                  : "right-1 top-8";

                if (canExpandStreams) {
                  return wrapPinned(
                    <StreamContextMenu
                      key={`stream-${chat.stream_id}`}
                      streamId={chat.stream_id}
                      chat={chat}
                      folderId={pinScopeFolderId}
                      triggerOffsetClassName={streamTriggerOffsetClassName}
                      onCreateTopic={
                        onNewTopic
                          ? () =>
                              openTopicDialogForStream({
                                streamId: chat.stream_id,
                                streamName: displayName,
                                streamSlug,
                              })
                          : undefined
                      }
                      onFolderAssignmentsChanged={onFolderAssignmentsChanged}
                    >
                      <div
                        className={`${streamRowClass} ${
                          expanded ? "bg-sidebar-hover" : ""
                        } ${isActive ? "bg-sidebar-hover" : ""}`}
                      >
                        <div className="relative min-w-0 flex-1">
                          <Link
                            to={`/stream/${streamSlug}`}
                            className="flex min-w-0 items-start gap-3"
                            onClick={() => {
                              if (!expanded) {
                                onToggleStream(streamSlug);
                              }
                            }}
                          >
                            <Avatar size={streamAvatarSize}>#</Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-text-primary">
                                #{displayName}
                              </div>
                              {!isCompactDensity && (
                                <div className="mt-0.5 truncate text-xs text-text-muted">
                                  {chat.lastMessage ?? ""}
                                </div>
                              )}
                            </div>
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onToggleStream(streamSlug);
                            }}
                            className={`bg-bg/60 hover:bg-bg-elevated/80 pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted opacity-0 transition-all group-focus-within/stream:pointer-events-auto group-focus-within/stream:opacity-100 group-hover/stream:pointer-events-auto group-hover/stream:opacity-100 hover:text-text-primary focus-visible:pointer-events-auto focus-visible:opacity-100 ${
                              isCompactDensity ? "left-4 top-4 h-7 w-7" : "left-5 top-5 h-8 w-8"
                            }`}
                            aria-label={
                              expanded ? t("a11y.collapseTopics") : t("a11y.expandTopics")
                            }
                          >
                            {expanded ? (
                              <Icon name="chevron-up" size={16} />
                            ) : (
                              <Icon name="chevron-down" size={16} />
                            )}
                          </button>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            {isPinnedChat && (
                              <Icon name="pin" size={12} className="text-text-muted" />
                            )}
                            <span className="text-xs text-text-muted">{chat.time ?? ""}</span>
                            {chat.badge !== undefined && chat.badge > 0 && (
                              <Badge count={chat.badge} variant="unread" />
                            )}
                          </div>
                        </div>
                      </div>
                      {expanded && (
                        <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-transparent pl-2">
                          <div className="flex items-center gap-1 py-1 pl-3">
                            {onNewTopic && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openTopicDialogForStream({
                                    streamId: chat.stream_id,
                                    streamName: displayName,
                                    streamSlug,
                                  });
                                }}
                                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-sidebar-hover hover:text-text-primary"
                                aria-label={t("channel.newTopic")}
                              >
                                <Icon name="plus" size={12} />
                                {t("channel.newTopic")}
                              </button>
                            )}
                          </div>
                          {topics.length === 0 ? (
                            <div className="py-2 pl-3 text-xs text-text-muted">
                              {t("channel.noTopics")}
                            </div>
                          ) : (
                            topics.map((topic, idx) => {
                              const topicColor = TOPIC_BAR_COLORS[idx % TOPIC_BAR_COLORS.length];
                              const isTopicActive =
                                streamSlug === activeStreamSlug && activeTopic === topic.subject;
                              return (
                                <div
                                  key={topic.subject}
                                  className={`group/topic flex items-start rounded-r-lg border-l-4 transition-colors ${sidebarRowClass(isTopicActive)}`}
                                  style={{ borderLeftColor: topicColor }}
                                >
                                  <Link
                                    to={`/stream/${streamSlug}/topic/${encodeURIComponent(topic.subject)}`}
                                    className="flex min-w-0 flex-1 items-start gap-3 py-2 pl-3"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-medium text-text-primary">
                                        # {topic.subject}
                                      </div>
                                      <div className="mt-0.5 truncate text-xs text-sidebar-sender">
                                        {t("roles.member")}
                                      </div>
                                      <div className="mt-0.5 truncate text-xs text-text-muted">
                                        {topic.lastMessage ?? ""}
                                      </div>
                                    </div>
                                  </Link>
                                  <div className="flex shrink-0 flex-col items-end gap-1 py-2 pr-2">
                                    {topic.badge !== undefined && topic.badge > 0 && (
                                      <Badge count={topic.badge} variant="unread" />
                                    )}
                                    <TopicMuteButton
                                      streamId={chat.stream_id}
                                      topic={topic.subject}
                                    />
                                    <TopicResolvedButton
                                      streamId={chat.stream_id}
                                      topic={topic.subject}
                                      streamSlug={streamSlug}
                                      isActiveTopic={isTopicActive}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </StreamContextMenu>,
                  );
                }

                return wrapPinned(
                  <StreamContextMenu
                    key={`stream-${chat.stream_id}`}
                    streamId={chat.stream_id}
                    chat={chat}
                    folderId={pinScopeFolderId}
                    triggerOffsetClassName={streamTriggerOffsetClassName}
                    onCreateTopic={
                      onNewTopic
                        ? () =>
                            openTopicDialogForStream({
                              streamId: chat.stream_id,
                              streamName: displayName,
                              streamSlug,
                            })
                        : undefined
                    }
                    onFolderAssignmentsChanged={onFolderAssignmentsChanged}
                  >
                    <Link
                      to={`/stream/${streamSlug}`}
                      className={`${streamRowClass} ${sidebarRowClass(isActive)}`}
                    >
                      <Avatar size={streamAvatarSize}>#</Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                          #{displayName}
                        </div>
                        {!isCompactDensity && (
                          <>
                            <div className="mt-0.5 truncate text-xs text-sidebar-sender">
                              {t("roles.member")}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-text-muted">
                              {chat.lastMessage ?? ""}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          {isPinnedChat && (
                            <Icon name="pin" size={12} className="text-text-muted" />
                          )}
                          <span className="text-xs text-text-muted">{chat.time ?? ""}</span>
                          {chat.badge !== undefined && chat.badge > 0 && (
                            <Badge count={chat.badge} variant="unread" />
                          )}
                        </div>
                      </div>
                    </Link>
                  </StreamContextMenu>,
                );
              }
              return wrapPinned(
                <DmContextMenu
                  key={`dm-${chat.slug}`}
                  chat={chat}
                  folderId={pinScopeFolderId}
                  onFolderAssignmentsChanged={onFolderAssignmentsChanged}
                >
                  <DmChatRow
                    chat={chat}
                    isActive={chat.slug === activeDmIdParam}
                    isPinned={isPinnedChat}
                    compact={isCompactDensity}
                  />
                </DmContextMenu>,
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      <Dialog.Root
        open={topicDialogState != null}
        onOpenChange={(open) => {
          if (!open) {
            closeTopicDialog();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-overlay bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-modal w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-subtle bg-bg-elevated shadow-xl">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <Dialog.Title className="text-sm font-semibold text-text-primary">
                {t("channel.createTopic")}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="hover:bg-bg/50 rounded p-1 text-text-muted"
                  aria-label={t("common.close")}
                >
                  <Icon name="close" size={18} />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex flex-col gap-4 px-4 py-4">
              <Dialog.Description className="text-xs text-text-muted">
                #{topicDialogState?.streamName ?? ""}
              </Dialog.Description>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-text-muted">{t("channel.topicName")}</span>
                <input
                  type="text"
                  value={newTopicName}
                  autoFocus
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateTopicFromDialog();
                    }
                  }}
                  aria-label={t("channel.topicName")}
                  className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder={t("channel.topicName")}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={muteTopicOnCreate}
                  onChange={(e) => setMuteTopicOnCreate(e.target.checked)}
                  className="h-4 w-4 rounded border-border-subtle"
                />
                <span>{t("channel.muteTopic")}</span>
              </label>
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
                  >
                    {t("common.cancel")}
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  disabled={newTopicName.trim().length === 0}
                  onClick={handleCreateTopicFromDialog}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
                >
                  {t("common.create")}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
