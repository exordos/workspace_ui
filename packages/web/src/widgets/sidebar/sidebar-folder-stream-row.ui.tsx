import React from "react";
import { Link } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { sidebarRowClass } from "~/shared/lib/format";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { SidebarChatBadges } from "./sidebar-chat-badges.ui";
import { sidebarStreamRoute, sidebarStreamTopicRoute } from "./sidebar-chat-routes.lib";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";
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
  isCompactDensity: boolean;
  canExpandStreams: boolean;
  expandedStreamSlugs: string[];
  activeStreamSlug: string | null;
  activeTopic: string | null;
  onToggleStream: ((slug: string) => void) | undefined;
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
  chat,
  streamSlug,
  topics,
  activeStreamSlug,
  activeTopic,
  topicsLoading,
  isCompactDensity,
}: {
  chat: StreamChat;
  streamSlug: string;
  topics: NonNullable<StreamChat["topics"]>;
  activeStreamSlug: string | null;
  activeTopic: string | null;
  topicsLoading: boolean;
  isCompactDensity: boolean;
}): React.ReactElement {
  const { allTopicsVisible, hiddenCount, showToggle, visibleCount, toggleAllTopics } =
    useSidebarTopicCollapse(topics.length);
  const visibleTopics = topics.slice(0, visibleCount);

  return (
    <>
      <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-transparent pl-2">
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
              (activeTopic === topic.topicUuid || activeTopic === topic.subject);
            const topicDisplay = resolveTopicDisplayInfo(topic.subject);
            return (
              <div
                key={topic.topicUuid ?? encodeTopicForRoute(topic.subject)}
                className={`group/topic relative w-full rounded-r-lg border-l-4 transition-colors ${sidebarRowClass(isTopicActive)}`}
                style={{ borderLeftColor: topicColor }}
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
                      {topicDisplay.label}
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
              </div>
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
    isCompactDensity,
    canExpandStreams,
    expandedStreamSlugs,
    activeStreamSlug,
    activeTopic,
    onToggleStream,
  } = props;

  const streamSlug = slugForStream(chat);
  const isActive = streamSlug === activeStreamSlug;
  const streamMuted = false;
  const expanded = canExpandStreams && expandedStreamSlugs.includes(streamSlug);
  const displayName = resolveStreamDisplayName(chat.name);
  const topics = chat.topics ?? [];
  const streamRowClass = isCompactDensity
    ? "group/stream flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
    : "group/stream flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors";
  const streamAvatarSize = isCompactDensity ? "sm" : "md";
  const streamExpandTriggerClassName = isCompactDensity
    ? "right-1.5 top-1 h-5 w-5"
    : "right-1.5 top-2.5 h-5 w-5";
  const streamLinkPaddingClass = isCompactDensity ? "pr-10" : "pr-11";

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

  const topicsLoading = false;
  return (
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
          {expanded ? <Icon name="chevron-up" size={16} /> : <Icon name="chevron-down" size={16} />}
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
          isCompactDensity={isCompactDensity}
        />
      )}
    </>
  );
});
