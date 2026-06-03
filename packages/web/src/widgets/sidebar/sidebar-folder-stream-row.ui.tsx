import React from "react";
import { Link } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { sidebarRowClass } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { SidebarChatBadges } from "./sidebar-chat-badges.ui";
import { StreamContextMenu, TopicContextMenu } from "./sidebar-chat-context-menu.ui";
import { sidebarStreamRoute, sidebarStreamTopicRoute } from "./sidebar-chat-routes.lib";
import { TopicMuteButton } from "./sidebar-folder-topic-buttons.ui";
import { SidebarStreamHydrateWrapper } from "./sidebar-stream-hydrate-wrapper.ui";
import { slugForStream, TOPIC_BAR_COLORS } from "./sidebar.lib";
import type { NewTopicDialogState } from "./sidebar-folder-chat-list.types";
import type { SidebarChat } from "./sidebar.types";

type StreamChat = Extract<SidebarChat, { type: "stream" }>;

export interface SidebarFolderStreamRowProps {
  chat: StreamChat;
  pinScopeFolderId: string | undefined;
  isPinnedChat: boolean;
  isCompactDensity: boolean;
  canExpandStreams: boolean;
  expandedStreamSlugs: string[];
  activeStreamSlug: string | null;
  activeTopic: string | null;
  isStreamMuted: (streamId: number) => boolean;
  onToggleStream: ((slug: string) => void) | undefined;
  onNewTopic: ((streamSlug: string, topicName: string) => void) | undefined;
  openTopicDialogForStream: (state: NewTopicDialogState) => void;
  onMuteError: (retry: () => void) => void;
}

function resolveStreamDisplayName(name: string): string {
  return name.toLowerCase() === "general" ? t("chat.generalChat") : name;
}

function StreamRowLinkContent({
  chat,
  displayName,
  streamMuted,
  isCompactDensity,
  isPinnedChat,
  streamAvatarSize,
  showLastMessageSender,
}: {
  chat: StreamChat;
  displayName: string;
  streamMuted: boolean;
  isCompactDensity: boolean;
  isPinnedChat: boolean;
  streamAvatarSize: "sm" | "md";
  showLastMessageSender: boolean;
}): React.ReactElement {
  return (
    <>
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
            {showLastMessageSender && chat.lastMessageSenderName && (
              <div className="mt-0.5 truncate text-xs text-sidebar-sender">
                {chat.lastMessageSenderName}
              </div>
            )}
            <div className="mt-0.5 truncate text-xs text-text-muted">{chat.lastMessage ?? ""}</div>
          </>
        )}
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          {isPinnedChat && <Icon name="pin" size={12} className="text-text-muted" />}
          {showLastMessageSender && (
            <span className="text-xs text-text-muted">{chat.time ?? ""}</span>
          )}
          <SidebarChatBadges unreadCount={chat.badge} hasMention={chat.hasMention} />
        </div>
      </div>
    </>
  );
}

const SidebarFolderStreamTopicsList = React.memo(function SidebarFolderStreamTopicsList({
  chat,
  streamSlug,
  topics,
  activeStreamSlug,
  activeTopic,
  topicsLoading,
  onNewTopic,
  openTopicDialogForStream,
  displayName,
  onMuteError,
}: {
  chat: StreamChat;
  streamSlug: string;
  topics: NonNullable<StreamChat["topics"]>;
  activeStreamSlug: string | null;
  activeTopic: string | null;
  topicsLoading: boolean;
  onNewTopic: SidebarFolderStreamRowProps["onNewTopic"];
  openTopicDialogForStream: SidebarFolderStreamRowProps["openTopicDialogForStream"];
  displayName: string;
  onMuteError: SidebarFolderStreamRowProps["onMuteError"];
}): React.ReactElement {
  return (
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
          {topicsLoading ? t("app.loading") : t("channel.noTopics")}
        </div>
      ) : (
        topics.map((topic, idx) => {
          const topicColor = TOPIC_BAR_COLORS[idx % TOPIC_BAR_COLORS.length];
          const isTopicActive = streamSlug === activeStreamSlug && activeTopic === topic.subject;
          return (
            <TopicContextMenu
              key={topic.subject}
              streamId={chat.stream_id}
              streamName={chat.name}
              topic={topic.subject}
              rowClassName={`group/topic flex w-full items-start rounded-r-lg border-l-4 transition-colors ${sidebarRowClass(isTopicActive)}`}
              rowStyle={{ borderLeftColor: topicColor }}
              sideActions={
                <TopicMuteButton
                  streamId={chat.stream_id}
                  topic={topic.subject}
                  onMuteError={onMuteError}
                />
              }
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
                <SidebarChatBadges unreadCount={topic.badge} hasMention={topic.hasMention} />
              </Link>
            </TopicContextMenu>
          );
        })
      )}
    </div>
  );
});

export const SidebarFolderStreamRow = React.memo(function SidebarFolderStreamRow(
  props: SidebarFolderStreamRowProps,
): React.ReactElement {
  const {
    chat,
    pinScopeFolderId,
    isPinnedChat,
    isCompactDensity,
    canExpandStreams,
    expandedStreamSlugs,
    activeStreamSlug,
    activeTopic,
    isStreamMuted,
    onToggleStream,
    onNewTopic,
    openTopicDialogForStream,
    onMuteError,
  } = props;

  const streamSlug = slugForStream(chat);
  const isActive = streamSlug === activeStreamSlug;
  const streamMuted = isStreamMuted(chat.stream_id);
  const expanded = canExpandStreams && expandedStreamSlugs.includes(streamSlug);
  const displayName = resolveStreamDisplayName(chat.name);
  const topics = chat.topics ?? [];
  const streamRowClass = isCompactDensity
    ? "group/stream flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
    : "group/stream flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors";
  const streamAvatarSize = isCompactDensity ? "sm" : "md";
  const streamTriggerOffsetClassName = isCompactDensity ? "right-1 top-6" : "right-1 top-8";
  const streamExpandTriggerClassName = isCompactDensity
    ? "right-1.5 top-1 h-5 w-5"
    : "right-1.5 top-2.5 h-5 w-5";
  const streamLinkPaddingClass = isCompactDensity ? "pr-10" : "pr-11";

  const onCreateTopic =
    onNewTopic != null
      ? () =>
          openTopicDialogForStream({
            streamId: chat.stream_id,
            streamName: displayName,
            streamSlug,
          })
      : undefined;

  if (!canExpandStreams || onToggleStream == null) {
    return (
      <StreamContextMenu
        streamId={chat.stream_id}
        chat={chat}
        folderId={pinScopeFolderId}
        onMuteError={onMuteError}
        triggerOffsetClassName={streamTriggerOffsetClassName}
        onCreateTopic={onCreateTopic}
      >
        <Link
          to={sidebarStreamRoute(streamSlug)}
          className={`${streamRowClass} ${sidebarRowClass(isActive)}`}
        >
          <StreamRowLinkContent
            chat={chat}
            displayName={displayName}
            streamMuted={streamMuted}
            isCompactDensity={isCompactDensity}
            isPinnedChat={isPinnedChat}
            streamAvatarSize={streamAvatarSize}
            showLastMessageSender
          />
        </Link>
      </StreamContextMenu>
    );
  }

  return (
    <StreamContextMenu
      streamId={chat.stream_id}
      chat={chat}
      folderId={pinScopeFolderId}
      onMuteError={onMuteError}
      triggerOffsetClassName={streamTriggerOffsetClassName}
      onCreateTopic={onCreateTopic}
    >
      <SidebarStreamHydrateWrapper
        streamId={chat.stream_id}
        topicsCount={topics.length}
        expanded={expanded}
      >
        {({ topicsLoading }) => (
          <>
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
                <StreamRowLinkContent
                  chat={chat}
                  displayName={displayName}
                  streamMuted={streamMuted}
                  isCompactDensity={isCompactDensity}
                  isPinnedChat={isPinnedChat}
                  streamAvatarSize={streamAvatarSize}
                  showLastMessageSender={false}
                />
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
              <SidebarFolderStreamTopicsList
                chat={chat}
                streamSlug={streamSlug}
                topics={topics}
                activeStreamSlug={activeStreamSlug}
                activeTopic={activeTopic}
                topicsLoading={topicsLoading}
                onNewTopic={onNewTopic}
                openTopicDialogForStream={openTopicDialogForStream}
                displayName={displayName}
                onMuteError={onMuteError}
              />
            )}
          </>
        )}
      </SidebarStreamHydrateWrapper>
    </StreamContextMenu>
  );
});
