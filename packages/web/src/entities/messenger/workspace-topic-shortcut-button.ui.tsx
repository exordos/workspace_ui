import React from "react";
import { Badge } from "~/shared/ui/badge";
import type { MessengerSidebarTopicItem, MessengerUuid } from "./messenger.types";

interface WorkspaceTopicShortcutButtonProps {
  topic: Pick<MessengerSidebarTopicItem, "topicUuid" | "title" | "unreadCount" | "isDone">;
  onSelect: (topicUuid: MessengerUuid) => void;
}

export const WorkspaceTopicShortcutButton = React.memo(function WorkspaceTopicShortcutButton({
  topic,
  onSelect,
}: WorkspaceTopicShortcutButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className="flex h-9 max-w-56 shrink-0 items-center gap-2 rounded-lg border border-border-subtle bg-card-bg px-3 text-sm text-text-primary outline-none transition-colors hover:border-accent hover:bg-card-bg-active hover:text-accent focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-soft"
      onClick={() => onSelect(topic.topicUuid)}
      data-topic-shortcut="true"
    >
      <span className={`truncate ${topic.isDone ? "line-through opacity-70" : ""}`}>
        # {topic.title}
      </span>
      {topic.unreadCount > 0 ? <Badge count={topic.unreadCount} variant="unread" /> : null}
    </button>
  );
});
