import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { muteTopic, unmuteTopic } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { sidebarRowClass } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { slugForStream, TOPIC_BAR_COLORS } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";
import type { SidebarStreamListProps } from "./sidebar-stream-list.types";

function isStream(chat: SidebarChat): chat is Extract<SidebarChat, { type: "stream" }> {
  return chat.type === "stream";
}

const TopicMuteButton = React.memo<{ streamId: number; topic: string }>(({ streamId, topic }) => {
  const isMuted = useMuteStore((s) => s.isTopicMuted(streamId, topic));
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMuted) {
        useMuteStore.getState().unmuteTopic(streamId, topic);
        void unmuteTopic(streamId, topic).catch(() => {});
      } else {
        useMuteStore.getState().muteTopic(streamId, topic);
        void muteTopic(streamId, topic).catch(() => {});
      }
    },
    [streamId, topic, isMuted],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex h-6 w-6 items-center justify-center rounded text-text-muted transition-opacity hover:text-text-primary ${
        isMuted ? "opacity-100" : "opacity-0 group-hover/topic:opacity-100"
      }`}
      aria-label={isMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
      title={isMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
    >
      <Icon name="bell" size={14} className={isMuted ? "opacity-40" : ""} />
    </button>
  );
});

export const SidebarStreamList: React.FC<SidebarStreamListProps> = ({
  streamChats,
  activeStreamSlug,
  activeTopic,
  expandedStreamSlug,
  onToggleStream,
  onNewTopic,
}) => {
  const streams = useMemo(() => streamChats.filter(isStream), [streamChats]);
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const [creatingTopicForSlug, setCreatingTopicForSlug] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const newTopicInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingTopicForSlug == null) return;
    const timer = window.setTimeout(() => {
      const input = newTopicInputRef.current;
      if (!input) return;
      input.focus();
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [creatingTopicForSlug]);

  return (
    <nav className="px-3 py-2">
      <div className="space-y-0.5">
        {streams.map((stream) => {
          const streamSlug = slugForStream(stream);
          const isActive = streamSlug === activeStreamSlug;
          const expanded = expandedStreamSlug === streamSlug;
          const isGeneral = stream.name.toLowerCase() === "general";
          const displayName = isGeneral ? t("chat.generalChat") : stream.name;
          const topics = stream.topics ?? [];

          return (
            <div key={`stream-${stream.stream_id}`}>
              <div
                className={`flex items-start ${
                  isCompactDensity
                    ? "gap-2 rounded-md px-2 py-1.5"
                    : "gap-3 rounded-lg px-2.5 py-2.5"
                } transition-colors ${
                  expanded ? "bg-sidebar-hover" : ""
                } ${isActive ? "bg-sidebar-hover" : ""}`}
              >
                <Link
                  to={`/stream/${streamSlug}`}
                  className="flex min-w-0 flex-1 items-start gap-3"
                  onClick={() => {
                    if (!expanded) {
                      onToggleStream(streamSlug);
                    }
                  }}
                >
                  <Avatar size={isCompactDensity ? "sm" : "md"}>#</Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">
                      #{displayName}
                    </div>
                    {!isCompactDensity && (
                      <div className="mt-0.5 truncate text-xs text-text-muted">
                        {stream.lastMessage ?? ""}
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleStream(streamSlug);
                    }}
                    className={`flex items-center justify-center rounded-lg text-text-muted hover:bg-sidebar-hover hover:text-text-primary ${
                      isCompactDensity ? "h-7 w-7" : "h-8 w-8"
                    }`}
                    aria-label={expanded ? t("a11y.collapseTopics") : t("a11y.expandTopics")}
                  >
                    {expanded ? (
                      <Icon name="chevron-up" size={16} />
                    ) : (
                      <Icon name="chevron-down" size={16} />
                    )}
                  </button>
                  {stream.badge !== undefined && stream.badge > 0 && (
                    <Badge count={stream.badge} variant="unread" />
                  )}
                </div>
              </div>

              {expanded && (
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
                    <div className="py-2 pl-3 text-xs text-text-muted">{t("channel.noTopics")}</div>
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
                              {!isCompactDensity && (
                                <>
                                  <div className="mt-0.5 truncate text-xs text-sidebar-sender">
                                    {t("roles.member")}
                                  </div>
                                  <div className="mt-0.5 truncate text-xs text-text-muted">
                                    {topic.lastMessage ?? ""}
                                  </div>
                                </>
                              )}
                            </div>
                          </Link>
                          <div className="flex shrink-0 items-center gap-1 py-2 pr-2">
                            <TopicMuteButton streamId={stream.stream_id} topic={topic.subject} />
                            {topic.badge !== undefined && topic.badge > 0 && (
                              <Badge count={topic.badge} variant="unread" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
};
