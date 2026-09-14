import React from "react";
import type {
  MessengerSidebarTopicItem,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import { WorkspaceTopicShortcutButton } from "~/entities/messenger/workspace-topic-shortcut-button.ui";
import { t } from "~/i18n/i18n";
import {
  DropdownMenu,
  type DropdownMenuContentProps,
  type DropdownMenuItem,
} from "~/shared/ui/dropdown-menu";

const CLOSED_TOPIC_MENU_CONTENT_PROPS: DropdownMenuContentProps = {
  side: "top",
  align: "center",
  sideOffset: 8,
};

interface ChatPageTopicPromptFrameProps {
  children: React.ReactNode;
  className: string;
  testId: string;
  topBorderVisible?: boolean;
}

const ChatPageTopicPromptFrame = React.memo(function ChatPageTopicPromptFrame({
  children,
  className,
  testId,
  topBorderVisible = true,
}: ChatPageTopicPromptFrameProps) {
  return (
    <div
      className={`flex min-h-14 w-full items-center gap-3 px-4 py-2.5 ${className} ${
        topBorderVisible ? "border-t border-border-subtle" : ""
      }`}
      data-testid={testId}
    >
      {children}
    </div>
  );
});

interface ChatPageStreamTopicPromptProps {
  topics: readonly MessengerSidebarTopicItem[];
  onSelectTopic: (topicUuid: MessengerUuid) => void;
  topBorderVisible?: boolean;
}

export const ChatPageStreamTopicPrompt = React.memo(function ChatPageStreamTopicPrompt({
  topics,
  onSelectTopic,
  topBorderVisible = true,
}: ChatPageStreamTopicPromptProps) {
  return (
    <ChatPageTopicPromptFrame
      className="text-sm text-text-muted"
      testId="stream-topic-prompt"
      topBorderVisible={topBorderVisible}
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
    </ChatPageTopicPromptFrame>
  );
});

interface ChatPageClosedTopicPromptProps {
  pending: boolean;
  onReopenTopic: () => void;
  topBorderVisible?: boolean;
}

export const ChatPageClosedTopicPrompt = React.memo(function ChatPageClosedTopicPrompt({
  pending,
  onReopenTopic,
  topBorderVisible = true,
}: ChatPageClosedTopicPromptProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuItems = React.useMemo<DropdownMenuItem[]>(
    () => [
      {
        type: "action",
        key: "reopen-topic",
        icon: "check",
        label: t("workspaceMessenger.topicResolvedRemoveMark"),
        disabled: pending,
        onSelect: onReopenTopic,
      },
    ],
    [onReopenTopic, pending],
  );

  return (
    <ChatPageTopicPromptFrame
      className="justify-center text-base text-text-primary"
      testId="topic-closed-prompt"
      topBorderVisible={topBorderVisible}
    >
      <p className="w-full text-center">
        {t("workspaceMessenger.topicResolved")}{" "}
        <DropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          items={menuItems}
          trigger={
            <button
              type="button"
              disabled={pending}
              className="rounded-sm text-accent underline underline-offset-2 hover:text-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:cursor-wait disabled:opacity-60"
            >
              {t("workspaceMessenger.topicResolvedRemoveMark")}
            </button>
          }
          contentVariant="narrow"
          triggerContentProps={CLOSED_TOPIC_MENU_CONTENT_PROPS}
        />{" "}
        {t("workspaceMessenger.topicResolvedSendHint")}
      </p>
    </ChatPageTopicPromptFrame>
  );
});
