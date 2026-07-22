import React from "react";
import type {
  MessengerSidebarTopicItem,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import { WorkspaceTopicShortcutButton } from "~/entities/messenger/workspace-topic-shortcut-button.ui";
import { t } from "~/i18n/i18n";

interface ChatPageStreamTopicPromptProps {
  topics: readonly MessengerSidebarTopicItem[];
  onSelectTopic: (topicUuid: MessengerUuid) => void;
}

export const ChatPageStreamTopicPrompt = React.memo(function ChatPageStreamTopicPrompt({
  topics,
  onSelectTopic,
}: ChatPageStreamTopicPromptProps) {
  return (
    <div
      className="flex min-h-14 w-full items-center gap-3 border-t border-border-subtle px-4 py-2.5 text-sm text-text-muted"
      data-testid="stream-topic-prompt"
    >
      <span className={topics.length > 0 ? "max-w-64 shrink-0 truncate" : "w-full text-center"}>
        {t("chat.selectTopicToWrite")}
      </span>
      {topics.length > 0 ? (
        <nav
          className="min-w-0 flex-1 overflow-x-auto scrollbar-none"
          aria-label={t("chat.selectTopicToWrite")}
          data-testid="stream-topic-rail"
        >
          <div className="flex w-max min-w-full items-center gap-1.5">
            {topics.map((topic) => (
              <WorkspaceTopicShortcutButton
                key={topic.topicUuid}
                topic={topic}
                onSelect={onSelectTopic}
              />
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
});
