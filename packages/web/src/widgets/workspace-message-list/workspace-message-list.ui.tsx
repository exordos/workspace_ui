import React, { useCallback, useMemo } from "react";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import { useTranslation } from "~/i18n/i18n";
import { WorkspaceMessageBubble } from "./workspace-message-bubble.ui";
import { formatWorkspaceMessageDayLabel } from "./workspace-message-day-label.lib";
import { groupWorkspaceMessagesByDayAndAuthor } from "./workspace-message-list-grouping.lib";
import { useWorkspaceMessageListScroll } from "./workspace-message-list-scroll.hook";
import type { WorkspaceMessageAuthorGroup } from "./workspace-message-list-grouping.lib";
import type { WorkspaceMessageListProps } from "./workspace-message-list.types";

const OWN_ROW_CLASS_NAME = "flex w-full justify-end self-stretch";
const PEER_ROW_CLASS_NAME = "flex w-full justify-start self-stretch";
const OWN_AUTHOR_GROUP_CLASS_NAME = "flex flex-col gap-1 items-end";
const PEER_AUTHOR_GROUP_CLASS_NAME = "flex flex-col gap-1 items-start";

function resolveMessageOwner(
  message: MessengerMessage,
  currentUserUuid: MessengerUuid,
): "own" | "peer" {
  return message.authorUuid === currentUserUuid || message.isOwn ? "own" : "peer";
}

interface WorkspaceMessageListRowProps {
  message: MessengerMessage;
  owner: "own" | "peer";
  currentUserUuid: MessengerUuid;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  resolveMention?: WorkspaceMessageListProps["resolveMention"];
  actions?: WorkspaceMessageListProps["actions"];
}

const WorkspaceMessageListRow = React.memo(function WorkspaceMessageListRow({
  message,
  owner,
  currentUserUuid,
  isFirstInGroup,
  isLastInGroup,
  resolveAuthorLabel,
  resolveMention,
  actions,
}: WorkspaceMessageListRowProps): React.ReactElement {
  return (
    <article
      className={owner === "own" ? OWN_ROW_CLASS_NAME : PEER_ROW_CLASS_NAME}
      data-message-uuid={message.uuid}
      data-author-uuid={message.authorUuid}
      data-message-owner={owner}
    >
      {/* article остается строкой списка и DOM-якорем для скролла. Сам bubble
          ниже отвечает только за вид сообщения, чтобы следующие фазы могли
          менять форму bubble без переписывания scroll-контроллера. */}
      <WorkspaceMessageBubble
        message={message}
        currentUserUuid={currentUserUuid}
        isFirstInGroup={isFirstInGroup}
        isLastInGroup={isLastInGroup}
        resolveAuthorLabel={resolveAuthorLabel}
        resolveMention={resolveMention}
        actions={actions}
      />
    </article>
  );
});

interface WorkspaceMessageAuthorGroupViewProps {
  group: WorkspaceMessageAuthorGroup;
  currentUserUuid: MessengerUuid;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  resolveMention?: WorkspaceMessageListProps["resolveMention"];
  actions?: WorkspaceMessageListProps["actions"];
}

const WorkspaceMessageAuthorGroupView = React.memo(function WorkspaceMessageAuthorGroupView({
  group,
  currentUserUuid,
  resolveAuthorLabel,
  resolveMention,
  actions,
}: WorkspaceMessageAuthorGroupViewProps): React.ReactElement {
  const firstMessage = group.messages[0];
  const groupOwner =
    group.authorUuid === currentUserUuid || firstMessage?.isOwn === true ? "own" : "peer";

  return (
    <section
      className={groupOwner === "own" ? OWN_AUTHOR_GROUP_CLASS_NAME : PEER_AUTHOR_GROUP_CLASS_NAME}
      data-author-group="true"
      data-author-uuid={group.authorUuid}
      data-message-owner={groupOwner}
    >
      {group.messages.map((message, messageIndex) => (
        <WorkspaceMessageListRow
          key={message.uuid}
          message={message}
          owner={resolveMessageOwner(message, currentUserUuid)}
          currentUserUuid={currentUserUuid}
          isFirstInGroup={messageIndex === 0}
          isLastInGroup={messageIndex === group.messages.length - 1}
          resolveAuthorLabel={resolveAuthorLabel}
          resolveMention={resolveMention}
          actions={actions}
        />
      ))}
    </section>
  );
});

export const WorkspaceMessageList: React.FC<WorkspaceMessageListProps> = ({
  messages,
  currentUserUuid,
  conversationId,
  scrollToBottomKey,
  scrollToBottomAfterSendNonce,
  firstUnreadUuid,
  unreadCount = 0,
  focusedMessageUuid = null,
  isLoadingOlder = false,
  isLoadingNewer = false,
  hasOlderMessages = false,
  hasNewerMessages = false,
  onLoadOlder,
  onLoadNewer,
  onUnreadMessagesVisible,
  onUnreadMessagesAtBottom,
  resolveAuthorLabel,
  resolveMention,
  actions,
}) => {
  const { locale, t } = useTranslation();
  const dayGroups = useMemo(() => {
    return groupWorkspaceMessagesByDayAndAuthor(messages);
  }, [messages]);
  const dayLabelsByDateKey = useMemo(() => {
    return new Map(
      dayGroups.map((dayGroup) => [
        dayGroup.dateKey,
        formatWorkspaceMessageDayLabel(dayGroup.dateKey, { locale, t }),
      ]),
    );
  }, [dayGroups, locale, t]);
  const renderedMessages = useMemo(() => {
    return dayGroups.flatMap((dayGroup) =>
      dayGroup.authorGroups.flatMap((authorGroup) => authorGroup.messages),
    );
  }, [dayGroups]);
  const scrollRequestKey = useMemo(() => {
    return `${conversationId}:${scrollToBottomKey ?? ""}:${scrollToBottomAfterSendNonce ?? 0}`;
  }, [conversationId, scrollToBottomAfterSendNonce, scrollToBottomKey]);
  const getMessageKey = useCallback((message: MessengerMessage) => message.uuid, []);
  const isUnreadFromOther = useCallback(
    (message: MessengerMessage) => !message.read && message.authorUuid !== currentUserUuid,
    [currentUserUuid],
  );
  const { scrollContainerRef, handleScroll, handleWheel, handleTouchMove, isAtBottom } =
    useWorkspaceMessageListScroll({
      messages: renderedMessages,
      getMessageKey,
      isUnreadFromOther,
      scrollToBottomKey: scrollRequestKey,
      scrollToBottomAfterSendNonce,
      firstUnreadKey: firstUnreadUuid,
      unreadCount,
      focusedMessageKey: focusedMessageUuid,
      isLoadingOlder,
      isLoadingNewer,
      hasOlderMessages,
      hasNewerMessages,
      onLoadOlder,
      onLoadNewer,
      onUnreadMessagesVisible,
      onUnreadMessagesAtBottom,
    });

  if (messages.length === 0) {
    return (
      <div
        ref={scrollContainerRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4"
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        data-conversation-id={conversationId}
        data-current-user-uuid={currentUserUuid}
        data-scroll-at-bottom={isAtBottom ? "true" : "false"}
        data-workspace-scroll-controller="true"
      >
        <div
          className="flex min-h-[160px] flex-1 items-center justify-center text-sm text-text-muted"
          data-empty-state="true"
        />
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4"
      onScroll={handleScroll}
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      role="feed"
      data-conversation-id={conversationId}
      data-current-user-uuid={currentUserUuid}
      data-scroll-at-bottom={isAtBottom ? "true" : "false"}
      data-workspace-scroll-controller="true"
    >
      {/* Список уже хранит строковые Workspace UUID в DOM. Следующим фазам не
          придется поддерживать старый числовой DOM-ключ только ради скролла. */}
      {dayGroups.map((dayGroup) => (
        <section className="flex flex-col gap-2" key={dayGroup.dateKey} data-day-group="true">
          <div className="flex justify-center py-1">
            <time
              className="rounded-full border border-border-subtle bg-bg-elevated px-3 py-1 text-xs font-medium text-text-muted"
              dateTime={dayGroup.dateKey}
              data-day-divider={dayGroup.dateKey}
            >
              {dayLabelsByDateKey.get(dayGroup.dateKey) ?? dayGroup.dateKey}
            </time>
          </div>
          <div className="flex flex-col gap-2">
            {dayGroup.authorGroups.map((authorGroup, authorGroupIndex) => (
              <WorkspaceMessageAuthorGroupView
                key={`${dayGroup.dateKey}:${authorGroup.authorUuid}:${authorGroupIndex}`}
                group={authorGroup}
                currentUserUuid={currentUserUuid}
                resolveAuthorLabel={resolveAuthorLabel}
                resolveMention={resolveMention}
                actions={actions}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
