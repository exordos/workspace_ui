import React, { useCallback, useMemo } from "react";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import { useTranslation } from "~/i18n/i18n";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { WorkspaceMessageBubble } from "./workspace-message-bubble.ui";
import { formatWorkspaceMessageDayLabel } from "./workspace-message-day-label.lib";
import {
  createWorkspaceMessageListOutgoingItem,
  createWorkspaceMessageListServerItem,
  groupWorkspaceMessagesByDayAndAuthor,
} from "./workspace-message-list-grouping.lib";
import { collectWorkspaceMessageImageGallery } from "./workspace-message-list-media.lib";
import { useWorkspaceMessageListScroll } from "./workspace-message-list-scroll.hook";
import type { WorkspaceMessageAuthorGroup } from "./workspace-message-list-grouping.lib";
import type {
  WorkspaceMessageListOutgoingItem,
  WorkspaceMessageListItem,
  WorkspaceMessageListProps,
} from "./workspace-message-list.types";

const OWN_ROW_CLASS_NAME = "flex w-full justify-end self-stretch";
const PEER_ROW_CLASS_NAME = "flex w-full justify-start self-stretch";
const OWN_AUTHOR_GROUP_CLASS_NAME = "flex flex-col gap-1 items-end";
const PEER_AUTHOR_GROUP_CLASS_NAME = "flex flex-col gap-1 items-start";
const EMPTY_SELECTED_MESSAGE_UUIDS = new Set<MessengerUuid>();
const EMPTY_OUTGOING_MESSAGES: NonNullable<WorkspaceMessageListProps["outgoingMessages"]> = [];
const OUTGOING_SERVER_MATCH_WINDOW_MS = 5 * 60 * 1000;

function canMatchOutgoingServerMessage(
  outgoingMessage: NonNullable<WorkspaceMessageListProps["outgoingMessages"]>[number],
  serverMessage: WorkspaceMessageListProps["messages"][number],
): boolean {
  if (outgoingMessage.conversationId !== serverMessage.conversationId) return false;
  if (outgoingMessage.authorUuid !== serverMessage.authorUuid) return false;
  if (outgoingMessage.markdown !== serverMessage.markdown) return false;

  const outgoingTimestamp = Date.parse(outgoingMessage.createdAt);
  const serverTimestamp = Date.parse(serverMessage.createdAt);
  if (Number.isNaN(outgoingTimestamp) || Number.isNaN(serverTimestamp)) return true;

  return Math.abs(serverTimestamp - outgoingTimestamp) <= OUTGOING_SERVER_MATCH_WINDOW_MS;
}

function resolveMessageOwner(
  message: WorkspaceMessageListItem,
  currentUserUuid: MessengerUuid,
): "own" | "peer" {
  return message.authorUuid === currentUserUuid || message.isOwn ? "own" : "peer";
}

interface WorkspaceMessageListRowProps {
  message: WorkspaceMessageListItem;
  owner: "own" | "peer";
  currentUserUuid: MessengerUuid;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isSelected: boolean;
  selectionMode: boolean;
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
  isSelected,
  selectionMode,
  resolveAuthorLabel,
  resolveMention,
  actions,
}: WorkspaceMessageListRowProps): React.ReactElement {
  const resolvedServerMessageUuid =
    message.kind === "server" ? message.message.uuid : message.resolvedServerMessage?.uuid;
  return (
    <article
      className={owner === "own" ? OWN_ROW_CLASS_NAME : PEER_ROW_CLASS_NAME}
      data-message-uuid={message.key}
      data-server-message-uuid={resolvedServerMessageUuid}
      data-outgoing-message-id={message.kind === "outgoing" ? message.message.localId : undefined}
      data-author-uuid={message.authorUuid}
      data-message-owner={owner}
      data-message-kind={message.kind}
    >
      {/* The article remains the list row and the DOM anchor for scrolling. The
          bubble below only handles message presentation, so later phases can
          reshape the bubble without rewriting the scroll controller. */}
      <WorkspaceMessageBubble
        message={message}
        currentUserUuid={currentUserUuid}
        isFirstInGroup={isFirstInGroup}
        isLastInGroup={isLastInGroup}
        isSelected={isSelected}
        selectionMode={selectionMode}
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
  selectedMessageUuids: ReadonlySet<MessengerUuid>;
  selectionMode: boolean;
}

const WorkspaceMessageAuthorGroupView = React.memo(function WorkspaceMessageAuthorGroupView({
  group,
  currentUserUuid,
  resolveAuthorLabel,
  resolveMention,
  actions,
  selectedMessageUuids,
  selectionMode,
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
      {/* Selection stays tied to the server UUID even while the row still lives
          in the local outbox layer. That keeps the DOM node from being recreated
          during the sent -> server snapshot transition. */}
      {group.messages.map((message, messageIndex) => (
        <WorkspaceMessageListRow
          key={message.key}
          message={message}
          owner={resolveMessageOwner(message, currentUserUuid)}
          currentUserUuid={currentUserUuid}
          isFirstInGroup={messageIndex === 0}
          isLastInGroup={messageIndex === group.messages.length - 1}
          isSelected={
            (message.kind === "server" && selectedMessageUuids.has(message.message.uuid)) ||
            (message.kind === "outgoing" &&
              message.resolvedServerMessage != null &&
              selectedMessageUuids.has(message.resolvedServerMessage.uuid))
          }
          selectionMode={selectionMode}
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
  outgoingMessages = EMPTY_OUTGOING_MESSAGES,
  currentUserUuid,
  conversationId,
  scrollToBottomKey,
  scrollToBottomAfterSendNonce,
  firstUnreadUuid,
  unreadCount = 0,
  focusedMessageUuid = null,
  selectionMode = false,
  selectedMessageUuids = EMPTY_SELECTED_MESSAGE_UUIDS,
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
  const listItems = useMemo<readonly WorkspaceMessageListItem[]>(() => {
    // The canonical store keeps only server snapshots. Local rows are merged
    // into the display model here so the UI sees one list, while cache,
    // realtime, and server-side ordering stay free of temporary ids.
    if (outgoingMessages.length === 0) {
      return messages.map(createWorkspaceMessageListServerItem);
    }

    const resolvedServerMessageUuids = new Set<string>();
    const claimedServerMessageUuids = new Set<string>();
    for (let outgoingIndex = outgoingMessages.length - 1; outgoingIndex >= 0; outgoingIndex -= 1) {
      const outgoingMessage = outgoingMessages[outgoingIndex];
      if (outgoingMessage == null) {
        continue;
      }
      const resolvedServerMessageUuid = outgoingMessage.resolvedServerMessageUuid?.trim();
      if (resolvedServerMessageUuid != null && resolvedServerMessageUuid.length > 0) {
        resolvedServerMessageUuids.add(resolvedServerMessageUuid);
        claimedServerMessageUuids.add(resolvedServerMessageUuid);
        continue;
      }

      if (outgoingMessage.status === "failed") {
        continue;
      }

      for (let serverIndex = messages.length - 1; serverIndex >= 0; serverIndex -= 1) {
        const serverMessage = messages[serverIndex];
        if (serverMessage == null) {
          continue;
        }
        if (
          claimedServerMessageUuids.has(serverMessage.uuid) ||
          !canMatchOutgoingServerMessage(outgoingMessage, serverMessage)
        ) {
          continue;
        }

        resolvedServerMessageUuids.add(serverMessage.uuid);
        claimedServerMessageUuids.add(serverMessage.uuid);
        break;
      }
    }
    const serverMessagesByUuid = new Map(
      messages.map((message) => [message.uuid, message] as const),
    );
    const outgoingListItems = outgoingMessages
      .map((outgoingMessage) => {
        if (outgoingMessage == null) {
          return null;
        }

        const resolvedServerMessage =
          outgoingMessage.resolvedServerMessageUuid == null
            ? undefined
            : serverMessagesByUuid.get(outgoingMessage.resolvedServerMessageUuid);
        return createWorkspaceMessageListOutgoingItem(outgoingMessage, resolvedServerMessage);
      })
      .filter((message): message is WorkspaceMessageListOutgoingItem => message != null);

    return [
      ...messages
        .filter((message) => !resolvedServerMessageUuids.has(message.uuid))
        .map(createWorkspaceMessageListServerItem),
      ...outgoingListItems,
    ];
  }, [messages, outgoingMessages]);
  const dayGroups = useMemo(() => {
    return groupWorkspaceMessagesByDayAndAuthor(listItems);
  }, [listItems]);
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
  const workspaceImageGallery = useMemo(() => {
    const displayMessages = renderedMessages.flatMap((message) => {
      if (message.kind === "server") {
        return [message.message];
      }

      return message.resolvedServerMessage == null ? [] : [message.resolvedServerMessage];
    });
    return collectWorkspaceMessageImageGallery(displayMessages, { resolveMention });
  }, [renderedMessages, resolveMention]);
  const handleOpenWorkspaceMedia = useCallback(
    (file: WorkspaceMessageFileReference) => {
      const fileUuid = file.fileUuid.trim();
      const startIndex = workspaceImageGallery.indexByFileUuid.get(fileUuid);
      if (startIndex == null) {
        void actions?.onOpenWorkspaceMedia?.(file);
        return;
      }

      void actions?.onOpenWorkspaceMedia?.(file, {
        items: workspaceImageGallery.items,
        startIndex,
      });
    },
    [actions, workspaceImageGallery],
  );
  const messageActions = useMemo(() => {
    if (actions?.onOpenWorkspaceMedia == null) {
      return actions;
    }

    return {
      ...actions,
      onOpenWorkspaceMedia: handleOpenWorkspaceMedia,
    };
  }, [actions, handleOpenWorkspaceMedia]);
  const scrollRequestKey = useMemo(() => {
    return `${conversationId}:${scrollToBottomKey ?? ""}:${scrollToBottomAfterSendNonce ?? 0}`;
  }, [conversationId, scrollToBottomAfterSendNonce, scrollToBottomKey]);
  const getMessageKey = useCallback((message: WorkspaceMessageListItem) => message.key, []);
  const isUnreadFromOther = useCallback(
    (message: WorkspaceMessageListItem) =>
      message.kind === "server" && !message.read && message.authorUuid !== currentUserUuid,
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

  if (listItems.length === 0) {
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
      {/* The list already stores string Workspace UUIDs in the DOM. Later phases
          do not need to keep the old numeric DOM key around just for scrolling. */}
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
                actions={messageActions}
                selectedMessageUuids={selectedMessageUuids}
                selectionMode={selectionMode}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
