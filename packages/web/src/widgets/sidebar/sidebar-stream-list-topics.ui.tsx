import React, { type RefObject } from "react";
import { Link } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { sidebarRowClass } from "~/shared/lib/format";
import { Icon } from "~/shared/ui/icon";
import { SidebarChatBadges } from "./sidebar-chat-badges.ui";
import { sidebarStreamTopicRoute } from "./sidebar-chat-routes.lib";
import { TopicMuteButton } from "./sidebar-folder-topic-buttons.ui";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";
import { useSidebarTopicCollapse } from "./sidebar-topic-collapse.hook";
import { SidebarTopicShowMoreButton } from "./sidebar-topic-show-more.ui";
import { TOPIC_BAR_COLORS } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";

type StreamChat = Extract<SidebarChat, { type: "stream" }>;
type StreamTopic = NonNullable<StreamChat["topics"]>[number];

export interface SidebarStreamListTopicsProps {
  stream: StreamChat;
  streamSlug: string;
  topics: StreamTopic[];
  topicsLoading: boolean;
  activeStreamSlug: string | null;
  activeTopic?: string | null;
  isCompactDensity: boolean;
  onNewTopic: ((streamSlug: string, topicName: string) => void) | undefined;
  creatingTopicForSlug: string | null;
  newTopicName: string;
  setCreatingTopicForSlug: (slug: string | null) => void;
  setNewTopicName: (name: string) => void;
  newTopicInputRef: RefObject<HTMLInputElement | null>;
  onMuteError: (retry: () => void) => void;
}

export const SidebarStreamListTopics = React.memo<SidebarStreamListTopicsProps>(
  function SidebarStreamListTopics({
    stream,
    streamSlug,
    topics,
    topicsLoading,
    activeStreamSlug,
    activeTopic,
    isCompactDensity,
    onNewTopic,
    creatingTopicForSlug,
    newTopicName,
    setCreatingTopicForSlug,
    setNewTopicName,
    newTopicInputRef,
    onMuteError,
  }) {
    const { allTopicsVisible, hiddenCount, showToggle, visibleCount, toggleAllTopics } =
      useSidebarTopicCollapse(topics.length);
    const visibleTopics = topics.slice(0, visibleCount);

    return (
      <>
        <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-transparent pl-2">
          {onNewTopic && (
            <div className="flex items-center gap-1 py-1 pl-3">
              {creatingTopicForSlug === streamSlug ? (
                <input
                  ref={newTopicInputRef}
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTopicName.trim()) {
                      onNewTopic(streamSlug, newTopicName.trim());
                      setCreatingTopicForSlug(null);
                      setNewTopicName("");
                    } else if (e.key === "Escape") {
                      setCreatingTopicForSlug(null);
                      setNewTopicName("");
                    }
                  }}
                  onBlur={() => {
                    if (newTopicName.trim()) {
                      onNewTopic(streamSlug, newTopicName.trim());
                    }
                    setCreatingTopicForSlug(null);
                    setNewTopicName("");
                  }}
                  className="w-full rounded bg-bg px-2 py-1 text-xs text-text-primary outline-none ring-1 ring-accent"
                  placeholder={t("channel.newTopic")}
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCreatingTopicForSlug(streamSlug);
                    setNewTopicName("");
                  }}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-sidebar-hover hover:text-text-primary"
                  aria-label={t("channel.newTopic")}
                >
                  <Icon name="plus" size={12} />
                  {t("channel.newTopic")}
                </button>
              )}
            </div>
          )}
          {topics.length === 0 ? (
            <div className="py-2 pl-3 text-xs text-text-muted">
              {topicsLoading ? t("app.loading") : t("channel.noTopics")}
            </div>
          ) : (
            visibleTopics.map((topic, idx) => {
              const topicColor = TOPIC_BAR_COLORS[idx % TOPIC_BAR_COLORS.length];
              const isTopicActive =
                streamSlug === activeStreamSlug && activeTopic === topic.subject;
              return (
                <div
                  key={topic.subject}
                  className={`group/topic relative rounded-r-lg border-l-4 transition-colors ${sidebarRowClass(isTopicActive)}`}
                  style={{ borderLeftColor: topicColor }}
                >
                  <Link
                    to={sidebarStreamTopicRoute(streamSlug, topic.subject)}
                    className="flex w-full min-w-0 items-start gap-3 py-2 pl-3 pr-8"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {topic.subject}
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
                  <div className="absolute inset-y-1 right-1 flex items-center">
                    <TopicMuteButton
                      streamId={stream.stream_id}
                      topic={topic.subject}
                      onMuteError={onMuteError}
                    />
                  </div>
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
  },
);
