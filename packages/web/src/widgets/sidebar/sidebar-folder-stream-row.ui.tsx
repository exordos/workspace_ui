import React from "react";
import { Link } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { sidebarRowClass } from "~/shared/lib/format";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import { formatTopicDoneLabel } from "~/shared/lib/topic-resolve";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { SidebarChatBadges } from "./sidebar-chat-badges.ui";
import { StreamContextMenu, TopicContextMenu } from "./sidebar-chat-context-menu.ui";
import { sidebarStreamRoute, sidebarStreamTopicRoute } from "./sidebar-chat-routes.lib";
import { TopicMuteButton } from "./sidebar-folder-topic-buttons.ui";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";
import { useSidebarNewTopicInputFocus } from "./sidebar-new-topic-input-focus.hook";
import { SidebarStreamHydrateWrapper } from "./sidebar-stream-hydrate-wrapper.ui";
import { useSidebarTopicCollapse } from "./sidebar-topic-collapse.hook";
import { SidebarTopicShowMoreButton } from "./sidebar-topic-show-more.ui";
import { slugForStream, TOPIC_BAR_COLORS } from "./sidebar.lib";
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
}>;

export interface SidebarFolderStreamRowProps {
  chat: StreamChat;
  isPinnedChat: boolean;
  selectedFolderId?: string;
  pinFolderId?: string;
  isCompactDensity: boolean;
  canExpandStreams: boolean;
  expandedStreamSlugs: string[];
  activeStreamSlug: string | null;
  activeTopic: string | null;
  onToggleStream: ((slug: string) => void) | undefined;
  onNewTopic?: (streamSlug: string, topicName: string) => void;
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
}: StreamRowLinkContentProps): React.ReactElement {
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
          <SidebarMessagePreview
            senderName={showLastMessageSender ? chat.lastMessageSenderName : undefined}
            message={chat.lastMessage}
          />
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
  streamId,
  streamName,
  streamSlug,
  topics,
  activeStreamSlug,
  activeTopic,
  topicsLoading,
  isCompactDensity,
  onNewTopic,
  creatingTopic,
  newTopicName,
  onNewTopicNameChange,
  onSubmitNewTopic,
  onCancelNewTopic,
  newTopicInputRef,
  onMuteError,
}: {
  streamId: string;
  streamName: string;
  streamSlug: string;
  topics: NonNullable<StreamChat["topics"]>;
  activeStreamSlug: string | null;
  activeTopic: string | null;
  topicsLoading: boolean;
  isCompactDensity: boolean;
  onNewTopic?: (streamSlug: string, topicName: string) => void;
  creatingTopic: boolean;
  newTopicName: string;
  onNewTopicNameChange: (name: string) => void;
  onSubmitNewTopic: () => void;
  onCancelNewTopic: () => void;
  newTopicInputRef: React.RefObject<HTMLInputElement | null>;
  onMuteError: (retry: () => void) => void;
}): React.ReactElement {
  const { allTopicsVisible, hiddenCount, showToggle, visibleCount, toggleAllTopics } =
    useSidebarTopicCollapse(topics.length);
  const visibleTopics = topics.slice(0, visibleCount);

  return (
    <>
      <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-transparent pl-2">
        {onNewTopic && creatingTopic && (
          <div className="flex items-center gap-1 py-1 pl-3">
            <input
              ref={newTopicInputRef}
              type="text"
              value={newTopicName}
              onChange={(e) => onNewTopicNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTopicName.trim().length > 0) {
                  onSubmitNewTopic();
                } else if (e.key === "Escape") {
                  onCancelNewTopic();
                }
              }}
              onBlur={() => {
                if (newTopicName.trim().length > 0) {
                  onSubmitNewTopic();
                  return;
                }
                onCancelNewTopic();
              }}
              className="w-full rounded bg-bg px-2 py-1 text-xs text-text-primary outline-none ring-1 ring-accent"
              placeholder={t("channel.topicName")}
              aria-label={t("channel.topicName")}
            />
          </div>
        )}
        {topics.length === 0 ? (
          <div className="py-2 pl-3 text-xs text-text-muted">
            {topicsLoading ? t("app.loading") : t("channel.noTopics")}
          </div>
        ) : (
          visibleTopics.map((topic, idx) => {
            const topicColor = TOPIC_BAR_COLORS[idx % TOPIC_BAR_COLORS.length];
            const topicRouteSegment = topic.topicUuid ?? topic.subject;
            const isTopicActive =
              streamSlug === activeStreamSlug &&
              ((topic.topicUuid != null && activeTopic === topic.topicUuid) ||
                activeTopic === topic.subject);
            const topicDisplay = resolveTopicDisplayInfo(topic.subject);
            const topicLabel = formatTopicDoneLabel(topicDisplay.label, topic.isDone === true);
            return (
              <TopicContextMenu
                key={topic.topicUuid ?? encodeTopicForRoute(topic.subject)}
                streamId={streamId}
                streamName={streamName}
                topic={topic.subject}
                topicUuid={topic.topicUuid}
                rowClassName={`group/topic relative w-full rounded-r-lg border-l-4 transition-colors ${sidebarRowClass(isTopicActive)}`}
                rowStyle={{ borderLeftColor: topicColor }}
                sideActions={
                  <TopicMuteButton
                    streamId={streamId}
                    topic={topic.topicUuid ?? topic.subject}
                    onMuteError={onMuteError}
                  />
                }
              >
                <Link
                  to={sidebarStreamTopicRoute(streamSlug, topicRouteSegment)}
                  className="flex w-full min-w-0 items-start gap-3 py-2 pl-3 pr-12"
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-sm font-medium text-text-primary ${
                        topicDisplay.isSystem ? "italic" : ""
                      }`}
                    >
                      {topicLabel}
                    </div>
                    {!isCompactDensity && (
                      <SidebarMessagePreview
                        senderName={topic.lastMessageSenderName}
                        message={topic.lastMessage}
                      />
                    )}
                  </div>
                  <SidebarChatBadges unreadCount={topic.badge} hasMention={topic.hasMention} />
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
    isPinnedChat,
    selectedFolderId,
    pinFolderId,
    isCompactDensity,
    canExpandStreams,
    expandedStreamSlugs,
    activeStreamSlug,
    activeTopic,
    onToggleStream,
    onNewTopic,
  } = props;

  const streamSlug = slugForStream(chat);
  const isActive = streamSlug === activeStreamSlug;
  const streamMuted = false;
  const expanded = canExpandStreams && expandedStreamSlugs.includes(streamSlug);
  const displayName = resolveStreamDisplayName(chat.name);
  const topics = chat.topics ?? [];
  const [creatingTopic, setCreatingTopic] = React.useState(false);
  const [newTopicName, setNewTopicName] = React.useState("");
  const [notificationErrorRetry, setNotificationErrorRetry] = React.useState<(() => void) | null>(
    null,
  );
  const newTopicInputRef = React.useRef<HTMLInputElement>(null);
  useSidebarNewTopicInputFocus(creatingTopic ? streamSlug : null, newTopicInputRef);

  React.useEffect(() => {
    if (notificationErrorRetry == null) return;
    const timerId = window.setTimeout(() => {
      setNotificationErrorRetry(null);
    }, 4500);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [notificationErrorRetry]);

  const handleNotificationError = React.useCallback((retry: () => void) => {
    setNotificationErrorRetry(() => retry);
  }, []);

  const submitNewTopic = React.useCallback(() => {
    const trimmedName = newTopicName.trim();
    if (trimmedName.length === 0 || onNewTopic == null) return;
    onNewTopic(streamSlug, trimmedName);
    setCreatingTopic(false);
    setNewTopicName("");
  }, [newTopicName, onNewTopic, streamSlug]);

  const cancelNewTopic = React.useCallback(() => {
    setCreatingTopic(false);
    setNewTopicName("");
  }, []);

  const startCreatingTopic = React.useCallback(() => {
    if (!expanded) {
      onToggleStream?.(streamSlug);
    }
    setNewTopicName("");
    setCreatingTopic(true);
  }, [expanded, onToggleStream, streamSlug]);

  const streamRowClass = isCompactDensity
    ? "group/stream flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
    : "group/stream flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors";
  const streamAvatarSize = isCompactDensity ? "sm" : "md";
  const streamExpandTriggerClassName = isCompactDensity
    ? "right-1.5 top-1 h-5 w-5"
    : "right-1.5 top-2.5 h-5 w-5";
  const streamMenuTriggerClassName = isCompactDensity ? "right-7 top-1" : "right-7 top-2.5";
  const streamLinkPaddingClass = "pr-16";

  if (!canExpandStreams || onToggleStream == null) {
    return (
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
    );
  }

  return (
    <SidebarStreamHydrateWrapper
      streamId={chat.streamUuid}
      topicsCount={topics.length}
      expanded={expanded}
    >
      {({ topicsLoading }) => (
        <>
          {notificationErrorRetry && (
            <div className="border-notice-base/30 bg-notice-base/10 mb-2 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs text-notice-base">
              <span>{t("app.error")}</span>
              <button
                type="button"
                className="hover:bg-notice-base/20 rounded px-1.5 py-0.5 text-notice-base transition-colors"
                onClick={() => {
                  const retry = notificationErrorRetry;
                  setNotificationErrorRetry(null);
                  retry?.();
                }}
              >
                {t("common.retry")}
              </button>
            </div>
          )}
          <StreamContextMenu
            streamId={chat.streamUuid}
            chat={chat}
            folderId={pinFolderId ?? selectedFolderId}
            onCreateTopic={onNewTopic == null ? undefined : startCreatingTopic}
            onMuteError={handleNotificationError}
            triggerOffsetClassName={streamMenuTriggerClassName}
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
                streamId={chat.streamUuid}
                streamName={chat.name}
                streamSlug={streamSlug}
                topics={topics}
                activeStreamSlug={activeStreamSlug}
                activeTopic={activeTopic}
                topicsLoading={topicsLoading}
                isCompactDensity={isCompactDensity}
                onNewTopic={onNewTopic}
                creatingTopic={creatingTopic}
                newTopicName={newTopicName}
                onNewTopicNameChange={setNewTopicName}
                onSubmitNewTopic={submitNewTopic}
                onCancelNewTopic={cancelNewTopic}
                newTopicInputRef={newTopicInputRef}
                onMuteError={handleNotificationError}
              />
            )}
          </StreamContextMenu>
        </>
      )}
    </SidebarStreamHydrateWrapper>
  );
});
