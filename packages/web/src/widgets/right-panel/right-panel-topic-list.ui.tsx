import React, { useCallback, useId, useState } from "react";
import {
  isWorkspaceTopicEffectivelyMuted,
  mapWorkspaceTopicNotificationModeToLevel,
  resolveWorkspaceDisplayedUnread,
} from "~/entities/messenger/messenger-notification-mode.lib";
import type { MessengerStream, MessengerTopicListItem } from "~/entities/messenger/messenger.types";
import { WorkspaceTopicContextMenu } from "~/features/workspace-topic-actions/workspace-topic-context-menu.ui";
import { t } from "~/i18n/i18n";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { MentionBadge } from "~/shared/ui/mention-badge";
import { getTopicVisibilityLevelOption } from "~/shared/ui/notification-level-switch.lib";
import { RightPanelOptionList } from "./right-panel-option-list.ui";

export interface RightPanelTopicListProps {
  topics: readonly MessengerTopicListItem[];
  streamTitle: string;
  streamNotificationMode: MessengerStream["notificationMode"] | null;
  onOpenTopic: (route: string) => void;
}

interface RightPanelTopicRowProps {
  topic: MessengerTopicListItem;
  streamTitle: string;
  streamNotificationMode: MessengerStream["notificationMode"] | null;
  onOpenTopic: (route: string) => void;
}

const RightPanelTopicRow = React.memo(function RightPanelTopicRow({
  topic,
  streamTitle,
  streamNotificationMode,
  onOpenTopic,
}: RightPanelTopicRowProps): React.ReactElement {
  const topicDisplay = resolveTopicDisplayInfo(topic.title);
  const displayedUnread = resolveWorkspaceDisplayedUnread(topic);
  const isMuted = isWorkspaceTopicEffectivelyMuted(topic.notificationMode, streamNotificationMode);
  const topicNotificationOption = getTopicVisibilityLevelOption(
    mapWorkspaceTopicNotificationModeToLevel(topic.notificationMode),
  );
  const notificationLabel = `${t("channel.topicNotifications")}: ${
    isMuted ? t("channel.notificationMuted") : t(topicNotificationOption.labelKey)
  }`;
  const handleOpenTopic = useCallback(() => {
    onOpenTopic(topic.route);
  }, [onOpenTopic, topic.route]);

  return (
    <li>
      <WorkspaceTopicContextMenu
        topic={topic}
        streamTitle={streamTitle}
        streamNotificationMode={streamNotificationMode}
      >
        <button
          type="button"
          onClick={handleOpenTopic}
          className="focus-visible:ring-accent/40 flex h-9 w-full min-w-0 items-center gap-2 px-3 text-left text-sm text-text-primary transition-colors hover:bg-card-bg-active focus-visible:bg-card-bg-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <span
            className={`min-w-0 flex-1 truncate ${topicDisplay.isSystem ? "italic" : ""}`}
            title={topicDisplay.label}
          >
            {topicDisplay.label}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {topic.hasUnreadPersonalMention === true ? <MentionBadge /> : null}
            {displayedUnread != null ? (
              <Badge
                count={displayedUnread.count}
                variant={displayedUnread.passive ? "muted" : "unread"}
              />
            ) : null}
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted"
              aria-label={notificationLabel}
              title={notificationLabel}
              data-testid="right-panel-topic-notification"
              data-muted={isMuted ? "true" : "false"}
            >
              <Icon name={isMuted ? "bell_off" : "bell"} size={16} className="text-current" />
            </span>
          </span>
        </button>
      </WorkspaceTopicContextMenu>
    </li>
  );
});

export const RightPanelTopicList = React.memo(function RightPanelTopicList({
  topics,
  streamTitle,
  streamNotificationMode,
  onOpenTopic,
}: RightPanelTopicListProps): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const collapseLabel = expanded ? t("a11y.collapseTopics") : t("a11y.expandTopics");

  const handleToggle = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  let content: React.ReactNode = null;
  if (expanded) {
    if (topics.length === 0) {
      content = (
        <p id={contentId} className="px-2 py-2 text-sm text-text-muted">
          {t("channel.noTopics")}
        </p>
      );
    } else {
      content = (
        <RightPanelOptionList id={contentId} testId="right-panel-topic-list">
          {topics.map((topic) => (
            <RightPanelTopicRow
              key={topic.id}
              topic={topic}
              streamTitle={streamTitle}
              streamNotificationMode={streamNotificationMode}
              onOpenTopic={onOpenTopic}
            />
          ))}
        </RightPanelOptionList>
      );
    }
  }

  return (
    <section>
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={collapseLabel}
          onClick={handleToggle}
          className="focus-visible:ring-accent/40 flex h-8 w-full items-center justify-between rounded px-2 text-left text-sm font-medium normal-case text-text-primary transition-colors hover:bg-card-bg-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          {t("channel.topics")}
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} />
        </button>
      </h3>

      {content}
    </section>
  );
});
