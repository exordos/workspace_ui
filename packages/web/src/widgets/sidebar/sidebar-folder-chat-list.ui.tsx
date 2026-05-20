import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "~/features/folder-sync/folder-sync-constants.lib";
import { resolvePinScopeFolderUuid } from "~/features/folder-sync/folder-sync.lib";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { muteTopic } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { runOptimisticTopicVisibilityUpdate } from "~/features/mute-chat/mute-chat.optimistic.lib";
import { orderChatsWithPinnedFirst } from "~/features/pin-chat/pin-chat-order.lib";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { sidebarRowClass } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import type { IconName } from "~/shared/ui/icon";
import { DmContextMenu, StreamContextMenu } from "./sidebar-chat-context-menu.ui";
import { sidebarStreamRoute, sidebarStreamTopicRoute } from "./sidebar-chat-routes.lib";
import { DmChatRow } from "./sidebar-folder-dm-row.ui";
import { SidebarFolderNewTopicDialog } from "./sidebar-folder-new-topic-dialog.ui";
import { TopicMuteButton, TopicResolvedButton } from "./sidebar-folder-topic-buttons.ui";
import {
  isSidebarSystemFolderScope,
  slugForStream,
  TOPIC_BAR_COLORS,
  chatToWorkspaceChatId,
} from "./sidebar.lib";
import type {
  NewTopicDialogState,
  SidebarFolderChatListProps,
} from "./sidebar-folder-chat-list.types";
import type { SidebarChat } from "./sidebar.types";

const EMPTY_PINNED_IDS: string[] = [];

export const SidebarFolderChatList: React.FC<SidebarFolderChatListProps> = ({
  chats,
  selectedFolderId,
  pinFolderId,
  activeStreamSlug: activeStreamSlugProp,
  activeDmIdParam: activeDmIdParamProp,
  activeTopic: activeTopicProp,
  expandedStreamSlugs,
  onToggleStream,
  onNewTopic,
  loading = false,
  showEmptyState = false,
}) => {
  const activeStreamSlug = activeStreamSlugProp ?? null;
  const activeTopic = activeTopicProp ?? null;
  const activeDmIdParam = activeDmIdParamProp ?? null;
  const [topicDialogState, setTopicDialogState] = useState<NewTopicDialogState | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [muteTopicOnCreate, setMuteTopicOnCreate] = useState(false);
  const [muteErrorState, setMuteErrorState] = useState<{
    id: number;
    retry: (() => void) | null;
  } | null>(null);
  const handleMuteError = useCallback((retry: () => void) => {
    setMuteErrorState({ id: Date.now(), retry });
  }, []);
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const isStreamMuted = useMuteStore((s) => s.isStreamMuted);
  // Защита для совместимости: если управление раскрытиями не передано, рендерим без topic-expand логики.
  const canExpandStreams = onToggleStream != null && expandedStreamSlugs !== undefined;
  const pinScopeFolderId = pinFolderId ?? selectedFolderId;
  const allFolderApiUuid = useFolderSyncStore((s) => s.allFolderApiUuid);
  const pinApiFolderUuid = useMemo(
    () =>
      pinScopeFolderId != null
        ? resolvePinScopeFolderUuid(pinScopeFolderId, allFolderApiUuid)
        : null,
    [allFolderApiUuid, pinScopeFolderId],
  );

  const pinnedChatIds = usePinStore((s) =>
    pinApiFolderUuid != null ? s.getPinnedChatIds(pinApiFolderUuid) : EMPTY_PINNED_IDS,
  );
  const orderedChats = useMemo(
    () =>
      pinApiFolderUuid == null || pinnedChatIds.length === 0
        ? chats
        : orderChatsWithPinnedFirst(chats, pinnedChatIds),
    [chats, pinApiFolderUuid, pinnedChatIds],
  );
  const closeTopicDialog = useCallback(() => {
    setTopicDialogState(null);
    setNewTopicName("");
    setMuteTopicOnCreate(false);
  }, []);

  const openTopicDialogForStream = useCallback(
    ({ streamId, streamName, streamSlug }: NewTopicDialogState) => {
      // Перед созданием топика принудительно раскрываем stream, чтобы пользователь видел контекст.
      if (
        onToggleStream != null &&
        expandedStreamSlugs !== undefined &&
        !expandedStreamSlugs.includes(streamSlug)
      ) {
        onToggleStream(streamSlug);
      }
      setTopicDialogState({ streamId, streamName, streamSlug });
      setNewTopicName("");
      setMuteTopicOnCreate(false);
    },
    [expandedStreamSlugs, onToggleStream],
  );

  const runMuteTopicOnCreate = useCallback(
    async (streamId: number, topicName: string) => {
      async function attemptMuteTopicOnCreate(): Promise<void> {
        const ok = await runOptimisticTopicVisibilityUpdate({
          streamId,
          topic: topicName,
          applyOptimistic: () => {
            useMuteStore.getState().muteTopic(streamId, topicName);
          },
          request: () => muteTopic(streamId, topicName),
        });
        if (ok) return;
        handleMuteError(() => {
          void attemptMuteTopicOnCreate();
        });
      }

      await attemptMuteTopicOnCreate();
    },
    [handleMuteError],
  );

  const handleCreateTopicFromDialog = useCallback(() => {
    const topicName = newTopicName.trim();
    if (topicDialogState == null || onNewTopic == null || topicName.length === 0) {
      return;
    }

    onNewTopic(topicDialogState.streamSlug, topicName);

    if (muteTopicOnCreate) {
      void runMuteTopicOnCreate(topicDialogState.streamId, topicName);
    }

    closeTopicDialog();
  }, [
    closeTopicDialog,
    muteTopicOnCreate,
    newTopicName,
    onNewTopic,
    runMuteTopicOnCreate,
    topicDialogState,
  ]);

  useEffect(() => {
    if (muteErrorState == null) return;
    const timerId = window.setTimeout(() => {
      setMuteErrorState(null);
    }, 4500);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [muteErrorState]);

  const emptyStatePresentation = useMemo(() => {
    const folderKey = selectedFolderId ?? "";
    if (!isSidebarSystemFolderScope(folderKey)) {
      return {
        title: t("folder.emptyFolder"),
        hint: t("folder.emptyFolderHint"),
        icon: "folder" as const satisfies IconName,
      };
    }
    if (folderKey === SYSTEM_PERSONAL_FOLDER_ID) {
      return {
        title: t("sidebar.emptyPersonalChats"),
        hint: t("sidebar.emptyPersonalChatsHint"),
        icon: "mail_outline" as const satisfies IconName,
      };
    }
    if (folderKey === SYSTEM_CHANNELS_FOLDER_ID) {
      return {
        title: t("sidebar.emptyChannelList"),
        hint: t("sidebar.emptyChannelListHint"),
        icon: "channels" as const satisfies IconName,
      };
    }
    return {
      title: t("sidebar.emptyAllChats"),
      hint: t("sidebar.emptyAllChatsHint"),
      icon: "grid" as const satisfies IconName,
    };
  }, [selectedFolderId]);

  if (loading) {
    // Плейсхолдер списка чатов на время переключения/дозагрузки выбранной папки.
    return (
      <div className="px-3 py-4">
        <div
          className="bg-bg-elevated/40 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-subtle px-3 py-6 text-center"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={t("app.loading")}
        >
          <div className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
          <p className="text-sm text-text-muted">{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (orderedChats.length === 0) {
    if (!showEmptyState) return null;

    return (
      <div className="px-3 py-4">
        <div className="bg-bg-elevated/40 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle px-3 py-5 text-center">
          <Icon name={emptyStatePresentation.icon} size={18} className="text-text-muted" />
          <p className="text-sm font-medium text-text-primary">{emptyStatePresentation.title}</p>
          <p className="max-w-[220px] text-xs text-text-muted">{emptyStatePresentation.hint}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {muteErrorState && (
        <div className="px-3 pt-2">
          <div className="border-notice-base/30 bg-notice-base/10 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs text-notice-base">
            <span>{t("app.error")}</span>
            <button
              type="button"
              className="hover:bg-notice-base/20 rounded px-1.5 py-0.5 text-notice-base transition-colors"
              onClick={() => {
                const retry = muteErrorState.retry;
                setMuteErrorState(null);
                retry?.();
              }}
            >
              {t("common.retry")}
            </button>
          </div>
        </div>
      )}
      <div className="space-y-0.5 px-2">
        {orderedChats.map((chat) => {
          const chatWsId = chatToWorkspaceChatId(chat);
          const isPinnedChat =
            pinApiFolderUuid != null && usePinStore.getState().isPinned(pinApiFolderUuid, chatWsId);
          const dmTriggerOffsetClassName = isCompactDensity ? "right-1 top-6" : "right-1 top-8";

          if (chat.type === "stream") {
            const streamSlug = slugForStream(chat);
            const isActive = streamSlug === activeStreamSlug;
            const streamMuted = isStreamMuted(chat.stream_id);
            const expanded = canExpandStreams && expandedStreamSlugs.includes(streamSlug);
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
            const streamExpandTriggerClassName = isCompactDensity
              ? "right-1.5 top-1 h-5 w-5"
              : "right-1.5 top-2.5 h-5 w-5";
            const streamLinkPaddingClass = isCompactDensity ? "pr-10" : "pr-11";

            if (canExpandStreams) {
              return (
                <StreamContextMenu
                  key={`stream-${chat.stream_id}`}
                  streamId={chat.stream_id}
                  chat={chat}
                  folderId={pinScopeFolderId}
                  onMuteError={handleMuteError}
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
                >
                  <div className="group/stream relative">
                    <Link
                      to={sidebarStreamRoute(streamSlug)}
                      className={`${streamRowClass} ${streamLinkPaddingClass} w-full ${
                        expanded || isActive ? "bg-sidebar-hover" : "hover:bg-sidebar-hover"
                      }`}
                      onClick={() => {
                        if (!expanded) {
                          onToggleStream(streamSlug);
                        }
                      }}
                    >
                      <Avatar size={streamAvatarSize}>#</Avatar>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-sm font-medium ${
                            streamMuted ? "text-text-muted" : "text-text-primary"
                          }`}
                        >
                          #{displayName}
                        </div>
                        {!isCompactDensity && (
                          <div className="mt-0.5 truncate text-xs text-text-muted">
                            {chat.lastMessage ?? ""}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          {isPinnedChat && (
                            <Icon name="pin" size={12} className="text-text-muted" />
                          )}
                          {chat.badge !== undefined && chat.badge > 0 && (
                            <Badge count={chat.badge} variant="unread" />
                          )}
                        </div>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleStream(streamSlug);
                      }}
                      className={`bg-bg/60 hover:bg-bg-elevated/80 absolute z-10 flex items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-primary focus-visible:text-text-primary ${streamExpandTriggerClassName}`}
                      aria-label={expanded ? t("a11y.collapseTopics") : t("a11y.expandTopics")}
                    >
                      {expanded ? (
                        <Icon name="chevron-up" size={16} />
                      ) : (
                        <Icon name="chevron-down" size={16} />
                      )}
                    </button>
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
                                to={sidebarStreamTopicRoute(streamSlug, topic.subject)}
                                className="flex min-w-0 flex-1 items-start gap-3 py-2 pl-3 pr-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-text-primary">
                                    {topic.subject}
                                  </div>
                                  {topic.lastMessageSenderName && (
                                    <div className="mt-0.5 truncate text-xs text-sidebar-sender">
                                      {topic.lastMessageSenderName}
                                    </div>
                                  )}
                                  <div className="mt-0.5 truncate text-xs text-text-muted">
                                    {topic.lastMessage ?? ""}
                                  </div>
                                </div>
                                {topic.badge !== undefined && topic.badge > 0 && (
                                  <Badge count={topic.badge} variant="unread" />
                                )}
                              </Link>
                              <div className="flex shrink-0 flex-col items-end gap-1 py-2 pr-2">
                                <TopicMuteButton
                                  streamId={chat.stream_id}
                                  topic={topic.subject}
                                  onMuteError={handleMuteError}
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
                </StreamContextMenu>
              );
            }

            return (
              <StreamContextMenu
                key={`stream-${chat.stream_id}`}
                streamId={chat.stream_id}
                chat={chat}
                folderId={pinScopeFolderId}
                onMuteError={handleMuteError}
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
              >
                <Link
                  to={sidebarStreamRoute(streamSlug)}
                  className={`${streamRowClass} ${sidebarRowClass(isActive)}`}
                >
                  <Avatar size={streamAvatarSize}>#</Avatar>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-sm font-medium ${
                        streamMuted ? "text-text-muted" : "text-text-primary"
                      }`}
                    >
                      #{displayName}
                    </div>
                    {!isCompactDensity && (
                      <>
                        {chat.lastMessageSenderName && (
                          <div className="mt-0.5 truncate text-xs text-sidebar-sender">
                            {chat.lastMessageSenderName}
                          </div>
                        )}
                        <div className="mt-0.5 truncate text-xs text-text-muted">
                          {chat.lastMessage ?? ""}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      {isPinnedChat && <Icon name="pin" size={12} className="text-text-muted" />}
                      <span className="text-xs text-text-muted">{chat.time ?? ""}</span>
                      {chat.badge !== undefined && chat.badge > 0 && (
                        <Badge count={chat.badge} variant="unread" />
                      )}
                    </div>
                  </div>
                </Link>
              </StreamContextMenu>
            );
          }
          return (
            <DmContextMenu
              key={`dm-${chat.slug}`}
              chat={chat}
              folderId={pinScopeFolderId}
              triggerOffsetClassName={dmTriggerOffsetClassName}
            >
              <DmChatRow
                chat={chat}
                isActive={chat.slug === activeDmIdParam}
                isPinned={isPinnedChat}
                compact={isCompactDensity}
              />
            </DmContextMenu>
          );
        })}
      </div>
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
