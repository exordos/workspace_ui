import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { SidebarChatBadges } from "./sidebar-chat-badges.ui";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";
import { useSidebarNewTopicInputFocus } from "./sidebar-new-topic-input-focus.hook";
import { SidebarStreamHydrateWrapper } from "./sidebar-stream-hydrate-wrapper.ui";
import { SidebarStreamListTopics } from "./sidebar-stream-list-topics.ui";
import { slugForStream } from "./sidebar.lib";
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

  useSidebarNewTopicInputFocus(creatingTopicForSlug, newTopicInputRef);

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
          const expanded = expandedStreamSlugs.includes(streamSlug);
          const isGeneral = stream.name.toLowerCase() === "general";
          const displayName = isGeneral ? t("chat.generalChat") : stream.name;
          const streamMuted = isStreamMuted(stream.stream_id);
          const topics = stream.topics ?? [];
          const streamRowClass = isCompactDensity
            ? "flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
            : "flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors";

          return (
            <SidebarStreamHydrateWrapper
              key={`stream-${stream.stream_id}`}
              streamId={stream.stream_id}
              topicsCount={topics.length}
              expanded={expanded}
            >
              {({ topicsLoading }) => (
                <>
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
                          <SidebarMessagePreview
                            senderName={stream.lastMessageSenderName}
                            message={stream.lastMessage}
                          />
                        )}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <SidebarChatBadges
                          unreadCount={stream.badge}
                          hasMention={stream.hasMention}
                        />
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
                    <SidebarStreamListTopics
                      stream={stream}
                      streamSlug={streamSlug}
                      topics={topics}
                      topicsLoading={topicsLoading}
                      activeStreamSlug={activeStreamSlug}
                      activeTopic={activeTopic}
                      isCompactDensity={isCompactDensity}
                      onNewTopic={onNewTopic}
                      creatingTopicForSlug={creatingTopicForSlug}
                      newTopicName={newTopicName}
                      setCreatingTopicForSlug={setCreatingTopicForSlug}
                      setNewTopicName={setNewTopicName}
                      newTopicInputRef={newTopicInputRef}
                      onMuteError={handleMuteError}
                    />
                  )}
                </>
              )}
            </SidebarStreamHydrateWrapper>
          );
        })}
      </div>
    </nav>
  );
};
