import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { muteTopic } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { pinChatInFolder, unpinChatInFolder } from "~/features/pin-chat/pin-chat.api";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { updateFolderItemOrder } from "~/shared/api/workspace-client";
import { getRealmBaseUrl } from "~/shared/api/zulip";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { sidebarRowClass } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { SidebarFolderNewTopicDialog } from "./sidebar-folder-new-topic-dialog.ui";
import { DmChatRow } from "./sidebar-folder-dm-row.ui";
import { TopicMuteButton, TopicResolvedButton } from "./sidebar-folder-topic-buttons.ui";
import { DmContextMenu, StreamContextMenu } from "./sidebar-chat-context-menu.ui";
import { slugForStream, TOPIC_BAR_COLORS, chatToWorkspaceChatId } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";
import type { NewTopicDialogState, SidebarFolderChatListProps } from "./sidebar-folder-chat-list.types";

function getAvatarUrl(avatarUrl: string | undefined): string | null {
  return resolveAvatarUrl(avatarUrl, getRealmBaseUrl()) ?? null;
}

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
      <SidebarFolderNewTopicDialog
        open={topicDialogState != null}
        streamName={topicDialogState?.streamName ?? ""}
        newTopicName={newTopicName}
        onNewTopicNameChange={setNewTopicName}
        muteTopicOnCreate={muteTopicOnCreate}
        onMuteTopicOnCreateChange={setMuteTopicOnCreate}
        onOpenChange={(open) => {
          if (!open) {
            closeTopicDialog();
          }
        }}
        onSubmit={handleCreateTopicFromDialog}
      />
    </>
  );
};
