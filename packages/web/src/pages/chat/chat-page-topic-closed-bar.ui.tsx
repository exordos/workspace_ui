import React from "react";
import { t } from "~/i18n/i18n";
import {
  chatBottomNoticeBarClassName,
  chatBottomNoticeMarkerClassName,
} from "~/shared/lib/chat-bottom-notice-bar.lib";

export interface ChatPageTopicClosedBarProps {
  joinedAbove?: boolean;
}

export const ChatPageTopicClosedBar = React.memo(function ChatPageTopicClosedBar({
  joinedAbove = false,
}: ChatPageTopicClosedBarProps) {
  return (
    <div
      className={chatBottomNoticeBarClassName({
        joinedAbove,
        paddingX: "wide",
        paddingY: "alert",
        className: "relative",
      })}
      role="status"
      data-testid="topic-closed-bar"
    >
      <span
        className={`absolute bottom-2.5 left-0 top-2.5 w-1 rounded-r-full ${chatBottomNoticeMarkerClassName("info")}`}
        data-notice-marker="info"
        aria-hidden
      />
      <span className="min-w-0 pl-1 text-sm font-medium text-text-primary">
        {t("workspaceMessenger.topicClosed")}
      </span>
    </div>
  );
});
