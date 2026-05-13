import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { sidebarRowClass } from "~/shared/lib/format";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import { Avatar } from "~/shared/ui/avatar";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { TopicMuteButton } from "./sidebar-folder-topic-buttons.ui";
import { slugForStream, TOPIC_BAR_COLORS } from "./sidebar.lib";
import type { SidebarStreamListProps } from "./sidebar-stream-list.types";
import type { SidebarChat } from "./sidebar.types";

function isStream(chat: SidebarChat): chat is Extract<SidebarChat, { type: "stream" }> {
  return chat.type === "stream";
}

export const SidebarStreamList: React.FC<SidebarStreamListProps> = ({
  streamChats,
  activeStreamSlug,
  activeTopic,
  expandedStreamSlugs,
  onToggleStream,
  onNewTopic,
}) => {
  const streams = useMemo(() => streamChats.filter(isStream), [streamChats]);
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const isStreamMuted = useMuteStore((s) => s.isStreamMuted);
  const [creatingTopicForSlug, setCreatingTopicForSlug] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [muteErrorRetry, setMuteErrorRetry] = useState<(() => void) | null>(null);
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

  useEffect(() => {
    if (muteErrorRetry == null) return;
    const timerId = window.setTimeout(() => {
      setMuteErrorRetry(null);
    }, 4500);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [muteErrorRetry]);

  const handleMuteError = useCallback((retry: () => void) => {
    setMuteErrorRetry(() => retry);
  }, []);

  return (
    <nav className="px-3 py-2">
      {muteErrorRetry && (
        <div className="border-notice-base/30 bg-notice-base/10 mb-2 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs text-notice-base">
          <span>{t("app.error")}</span>
          <button
            type="button"
            className="hover:bg-notice-base/20 rounded px-1.5 py-0.5 text-notice-base transition-colors"
            onClick={() => {
              const retry = muteErrorRetry;
              setMuteErrorRetry(null);
              retry?.();
            }}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      <div className="space-y-0.5">
        {streams.map((stream) => {
          const streamSlug = slugForStream(stream);
          const isActive = streamSlug === activeStreamSlug;
          // В legacy stream-list используем ту же модель множественного раскрытия, что и в folder-list.
          const expanded = expandedStreamSlugs.includes(streamSlug);
          const isGeneral = stream.name.toLowerCase() === "general";
          const displayName = isGeneral ? t("chat.generalChat") : stream.name;
          const streamMuted = isStreamMuted(stream.stream_id);
          const topics = stream.topics ?? [];
          const streamRowClass = isCompactDensity
            ? "flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
            : "flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors";

          return (
            <div key={`stream-${stream.stream_id}`}>
              <div className="group/stream relative">
                <Link
                  to={`/stream/${streamSlug}`}
                  className={`${streamRowClass} w-full ${
                    expanded || isActive ? "bg-sidebar-hover" : "hover:bg-sidebar-hover"
                  } ${isCompactDensity ? "pr-10" : "pr-11"}`}
                  onClick={() => {
                    if (!expanded) {
                      onToggleStream(streamSlug);
                    }
                  }}
                >
                  <Avatar size={isCompactDensity ? "sm" : "md"}>#</Avatar>
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
                        {stream.lastMessage ?? ""}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    {stream.badge !== undefined && stream.badge > 0 && (
                      <Badge count={stream.badge} variant="unread" />
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
                  className={`absolute flex items-center justify-center rounded-lg text-text-muted hover:bg-sidebar-hover hover:text-text-primary ${
                    isCompactDensity ? "right-1 top-1 h-7 w-7" : "right-1 top-1 h-8 w-8"
                  }`}
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
                            to={`/stream/${streamSlug}/topic/${encodeURIComponent(
                              encodeTopicForRoute(topic.subject),
                            )}`}
                            className="flex min-w-0 flex-1 items-start gap-3 py-2 pl-3 pr-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-text-primary">
                                # {topic.subject}
                              </div>
                              {!isCompactDensity && (
                                <>
                                  {topic.lastMessageSenderName && (
                                    <div className="mt-0.5 truncate text-xs text-sidebar-sender">
                                      {topic.lastMessageSenderName}
                                    </div>
                                  )}
                                  <div className="mt-0.5 truncate text-xs text-text-muted">
                                    {topic.lastMessage ?? ""}
                                  </div>
                                </>
                              )}
                            </div>
                            {topic.badge !== undefined && topic.badge > 0 && (
                              <Badge count={topic.badge} variant="unread" />
                            )}
                          </Link>
                          <div className="flex shrink-0 items-center py-2 pr-2">
                            <TopicMuteButton
                              streamId={stream.stream_id}
                              topic={topic.subject}
                              onMuteError={handleMuteError}
                            />
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
