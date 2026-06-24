import React from "react";
import { Badge } from "~/shared/ui/badge";
import { MentionBadge } from "~/shared/ui/mention-badge";
import { TopicMuteButton } from "./sidebar-folder-topic-buttons.ui";

export interface SidebarTopicRowMetaProps {
  streamId: number;
  topic: string;
  compact?: boolean;
  unreadCount?: number;
  hasMention?: boolean;
  time?: string;
  onMuteError?: (retry: () => void) => void;
}

/** Topic row meta: icons and unread on top, message time below (same layout as SidebarChatRowMeta). */
export const SidebarTopicRowMeta = React.memo(function SidebarTopicRowMeta({
  streamId,
  topic,
  compact = false,
  unreadCount,
  hasMention = false,
  time,
  onMuteError,
}: SidebarTopicRowMetaProps) {
  const showUnread = unreadCount !== undefined && unreadCount > 0;
  const showMention = hasMention === true;
  const showTime = !compact && time != null && time !== "";

  return (
    <div
      className={`flex shrink-0 flex-col items-end ${compact ? "min-w-8 gap-0.5" : "min-w-10 justify-between gap-1"}`}
      data-testid="sidebar-topic-row-meta"
    >
      <div className="flex items-center gap-1" data-testid="sidebar-topic-row-meta-actions">
        <TopicMuteButton streamId={streamId} topic={topic} onMuteError={onMuteError} />
        {showMention && <MentionBadge size="default" />}
        {showUnread && (
          <div
            className="flex h-5 min-w-5 shrink-0 items-center justify-center"
            data-testid="sidebar-topic-row-unread-badge"
          >
            <Badge count={unreadCount} variant="unread" />
          </div>
        )}
      </div>
      {showTime && (
        <span
          className="whitespace-nowrap text-xs tabular-nums text-text-muted"
          data-testid="sidebar-topic-row-time"
        >
          {time}
        </span>
      )}
    </div>
  );
});
