import React from "react";
import { Link } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { sidebarRowClass } from "~/shared/lib/format";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { StreamContextMenu, TopicContextMenu } from "./sidebar-chat-context-menu.ui";
import { sidebarStreamRoute, sidebarStreamTopicRoute } from "./sidebar-chat-routes.lib";
import { sidebarChatRowBodyClass, sidebarChatRowLinkClass } from "./sidebar-chat-row-layout.lib";
import { SidebarChatRowMeta } from "./sidebar-chat-row-meta.ui";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";
import { SidebarStreamHydrateWrapper } from "./sidebar-stream-hydrate-wrapper.ui";
import { useSidebarTopicCollapse } from "./sidebar-topic-collapse.hook";
import { SidebarTopicRowMeta } from "./sidebar-topic-row-meta.ui";
import { SidebarTopicShowMoreButton } from "./sidebar-topic-show-more.ui";
import { slugForStream, TOPIC_BAR_COLORS } from "./sidebar.lib";
import type { NewTopicDialogState } from "./sidebar-folder-chat-list.types";
import type { SidebarChat } from "./sidebar.types";

type StreamChat = Extract<SidebarChat, { type: "stream" }>;

type StreamRowLinkContentProps = Readonly<{
  chat: StreamChat;
  displayName: string;
  streamMuted: boolean;
  isCompactDensity: boolean;
  isPinnedChat: boolean;
  streamAvatarSize: "sm" | "md";
  showLastMessageSender: boolean;
  expanded?: boolean;
  onToggleStream?: (slug: string) => void;
  streamSlug?: string;
}>;

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
  expanded,
  onToggleStream,
  streamSlug,
}: StreamRowLinkContentProps): React.ReactElement {
  const hasExpandChevron = onToggleStream != null && streamSlug != null;

  return (
    <>
      <Avatar size={streamAvatarSize}>#</Avatar>
      <div className={sidebarChatRowBodyClass(isCompactDensity)}>
        <div
          className={`truncate text-sm font-medium ${
            streamMuted ? "text-text-muted" : "text-text-primary"
          }`}
        >
          #{displayName}
        </div>
        {!isCompactDensity && (
          <SidebarMessagePreview
            senderName={showLastMessageSender ? chat.lastMessageSenderName : undefined}
            message={chat.lastMessage}
          />
        )}
      </div>
      <SidebarChatRowMeta
        compact={isCompactDensity}
        isPinned={isPinnedChat}
        unreadCount={chat.badge}
        hasMention={chat.hasMention}
        time={showLastMessageSender ? chat.time : undefined}
        expandChevron={
          hasExpandChevron
            ? {
                expanded: expanded === true,
                onToggle: () => {
                  onToggleStream(streamSlug);
                },
                ariaLabel: expanded ? t("a11y.collapseTopics") : t("a11y.expandTopics"),
              }
            : undefined
        }
      />
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
  isCompactDensity,
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
  isCompactDensity: boolean;
}): React.ReactElement {
  const { allTopicsVisible, hiddenCount, showToggle, visibleCount, toggleAllTopics } =
    useSidebarTopicCollapse(topics.length);
  const visibleTopics = topics.slice(0, visibleCount);

  return (
    <>
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
          visibleTopics.map((topic, idx) => {
            const topicColor = TOPIC_BAR_COLORS[idx % TOPIC_BAR_COLORS.length];
            const isTopicActive = streamSlug === activeStreamSlug && activeTopic === topic.subject;
            const topicDisplay = resolveTopicDisplayInfo(topic.subject);
            return (
              <TopicContextMenu
                key={encodeTopicForRoute(topic.subject)}
                streamId={chat.stream_id}
                streamName={chat.name}
                topic={topic.subject}
                rowClassName={`group/topic relative w-full rounded-r-lg border-l-4 transition-colors ${sidebarRowClass(isTopicActive)}`}
                rowStyle={{ borderLeftColor: topicColor }}
              >
                <Link
                  to={sidebarStreamTopicRoute(streamSlug, topic.subject)}
                  className="flex w-full min-w-0 items-stretch gap-3 py-2 pl-3 pr-2"
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-sm font-medium text-text-primary ${
                        topicDisplay.isSystem ? "italic" : ""
                      }`}
                    >
                      {topicDisplay.label}
                    </div>
                    {!isCompactDensity && (
                      <SidebarMessagePreview
                        senderName={topic.lastMessageSenderName}
                        message={topic.lastMessage}
                        className="mt-0.5"
                      />
                    )}
                  </div>
                  <SidebarTopicRowMeta
                    streamId={chat.stream_id}
                    topic={topic.subject}
                    compact={isCompactDensity}
                    unreadCount={topic.badge}
                    hasMention={topic.hasMention}
                    time={topic.time}
                    onMuteError={onMuteError}
                  />
                </Link>
              </TopicContextMenu>
            );
          })
        )}
      </div>
      {showToggle && (
        <SidebarTopicShowMoreButton
          expanded={allTopicsVisible}
          hiddenCount={hiddenCount}
          onToggle={toggleAllTopics}
        />
      )}
    </>
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
  const streamRowClass = sidebarChatRowLinkClass(isCompactDensity, "stream");
  const streamAvatarSize = isCompactDensity ? "sm" : "md";

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
        onCreateTopic={onCreateTopic}
      >
        <Link
          to={sidebarStreamRoute(streamSlug)}
          className={`${streamRowClass} ${sidebarRowClass(isActive)} w-full`}
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
      onCreateTopic={onCreateTopic}
    >
      <SidebarStreamHydrateWrapper
        streamId={chat.stream_id}
        topicsCount={topics.length}
        expanded={expanded}
      >
        {({ topicsLoading }) => (
          <>
            <div className="relative">
              <Link
                to={sidebarStreamRoute(streamSlug)}
                className={`${streamRowClass} w-full ${
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
                  showLastMessageSender
                  expanded={expanded}
                  onToggleStream={onToggleStream}
                  streamSlug={streamSlug}
                />
              </Link>
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
                isCompactDensity={isCompactDensity}
              />
            )}
          </>
        )}
      </SidebarStreamHydrateWrapper>
    </StreamContextMenu>
  );
});
