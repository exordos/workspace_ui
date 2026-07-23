import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { UsersById } from "~/entities/user/user.types";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t, useTranslation } from "~/i18n/i18n";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { WorkspaceMessageBubble } from "./workspace-message-bubble.ui";
import { formatWorkspaceMessageDayLabel } from "./workspace-message-day-label.lib";
import { WorkspaceMessageDivider } from "./workspace-message-divider.ui";
import {
  createWorkspaceMessageListOutgoingItem,
  createWorkspaceMessageListServerItem,
  groupWorkspaceMessagesByDayAndAuthor,
} from "./workspace-message-list-grouping.lib";
import { collectWorkspaceMessageMediaGallery } from "./workspace-message-list-media.lib";
import { useWorkspaceMessageListScroll } from "./workspace-message-list-scroll.hook";
import { WorkspaceMessageTopicLink } from "./workspace-message-topic-link.ui";
import type { WorkspaceMessageAuthorGroup } from "./workspace-message-list-grouping.lib";
import type {
  WorkspaceMessageListOutgoingItem,
  WorkspaceMessageListItem,
  WorkspaceMessageListProps,
} from "./workspace-message-list.types";

const OWN_ROW_CLASS_NAME = "flex w-full justify-end self-stretch";
const PEER_ROW_CLASS_NAME = "flex w-full justify-start self-stretch";
const OWN_AUTHOR_GROUP_CLASS_NAME = "flex flex-col gap-1 items-end";
const PEER_AUTHOR_GROUP_CLASS_NAME = "flex w-full items-stretch gap-2";
const PEER_AUTHOR_GROUP_CONTENT_CLASS_NAME = "flex min-w-0 flex-1 flex-col items-start gap-1";
const EMPTY_SELECTED_MESSAGE_UUIDS = new Set<MessengerUuid>();
const EMPTY_OUTGOING_MESSAGES: NonNullable<WorkspaceMessageListProps["outgoingMessages"]> = [];

function resolveMessageOwner(
  message: WorkspaceMessageListItem,
  currentUserUuid: MessengerUuid,
): "own" | "peer" {
  return message.authorUuid === currentUserUuid || message.isOwn ? "own" : "peer";
}

function resolveWorkspaceAuthorLabel(
  authorUuid: MessengerUuid,
  resolveAuthorLabel: WorkspaceMessageListProps["resolveAuthorLabel"],
  usersById: UsersById,
): string | null {
  const resolvedLabel = resolveAuthorLabel?.(authorUuid)?.trim();
  if (resolvedLabel != null && resolvedLabel.length > 0) {
    return resolvedLabel;
  }

  const userLabel = selectUserDisplayName(usersById[authorUuid], "").trim();
  return userLabel.length > 0 ? userLabel : null;
}

function formatWorkspaceTopicLabel(label: string | null | undefined): string | null {
  const normalizedLabel = label?.trim() ?? "";
  if (normalizedLabel.length === 0) {
    return null;
  }

  return normalizedLabel.startsWith("#") ? normalizedLabel : `#${normalizedLabel}`;
}

const WorkspaceUnreadMessagesDivider: React.FC<{ label: string }> = ({ label }) => (
  <WorkspaceMessageDivider
    label={label}
    tone="notice"
    data-unread-divider="true"
    data-unread-divider-anchor="true"
  />
);

interface WorkspaceMessageListRowProps {
  message: WorkspaceMessageListItem;
  owner: "own" | "peer";
  currentUserUuid: MessengerUuid;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isSelected: boolean;
  selectionMode: boolean;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  topicLabel?: string | null;
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
  topicLabel,
  resolveMention,
  actions,
}: WorkspaceMessageListRowProps): React.ReactElement {
  const serverMessageUuid = message.kind === "server" ? message.message.uuid : undefined;
  const messageUuid = serverMessageUuid ?? message.key;
  return (
    <article
      className={owner === "own" ? OWN_ROW_CLASS_NAME : PEER_ROW_CLASS_NAME}
      data-message-uuid={messageUuid}
      data-message-render-key={message.key}
      data-server-message-uuid={serverMessageUuid}
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
        topicLabel={topicLabel}
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
  resolveTopicLabel?: (topicUuid: MessengerUuid) => string | null | undefined;
  showTopicLabels: boolean;
  resolveMention?: WorkspaceMessageListProps["resolveMention"];
  actions?: WorkspaceMessageListProps["actions"];
  selectedMessageUuids: ReadonlySet<MessengerUuid>;
  selectionMode: boolean;
  usersById: UsersById;
}

const WorkspaceMessageAuthorGroupView = React.memo(function WorkspaceMessageAuthorGroupView({
  group,
  currentUserUuid,
  resolveAuthorLabel,
  resolveTopicLabel,
  showTopicLabels,
  resolveMention,
  actions,
  selectedMessageUuids,
  selectionMode,
  usersById,
}: WorkspaceMessageAuthorGroupViewProps): React.ReactElement {
  const firstMessage = group.messages[0];
  const groupOwner =
    group.authorUuid === currentUserUuid || firstMessage?.isOwn === true ? "own" : "peer";

  const author = usersById[group.authorUuid];
  const displayName =
    resolveWorkspaceAuthorLabel(group.authorUuid, resolveAuthorLabel, usersById) ??
    `#${group.authorUuid.trim().slice(0, 8)}`;
  const presence = resolveUserPresenceVisual(author?.status);
  const handleAuthorClick = () => {
    actions?.onOpenAuthorProfile?.(group.authorUuid);
  };
  const messageRows = group.messages.map((message, messageIndex) => (
    <WorkspaceMessageListRow
      key={message.key}
      message={message}
      owner={resolveMessageOwner(message, currentUserUuid)}
      currentUserUuid={currentUserUuid}
      isFirstInGroup={messageIndex === 0}
      isLastInGroup={messageIndex === group.messages.length - 1}
      isSelected={message.kind === "server" && selectedMessageUuids.has(message.message.uuid)}
      selectionMode={selectionMode}
      resolveAuthorLabel={resolveAuthorLabel}
      topicLabel={
        showTopicLabels && messageIndex === 0
          ? formatWorkspaceTopicLabel(resolveTopicLabel?.(message.message.topicUuid))
          : null
      }
      resolveMention={resolveMention}
      actions={actions}
    />
  ));

  return (
    <section
      className={groupOwner === "own" ? OWN_AUTHOR_GROUP_CLASS_NAME : PEER_AUTHOR_GROUP_CLASS_NAME}
      data-author-group="true"
      data-author-uuid={group.authorUuid}
      data-message-owner={groupOwner}
    >
      {groupOwner === "peer" ? (
        <div className="flex w-12 flex-shrink-0 flex-col justify-end pb-2">
          <button
            type="button"
            onClick={handleAuthorClick}
            className="group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            aria-label={t("a11y.openUserProfile", { name: displayName })}
            data-workspace-peer-avatar="true"
          >
            <span className="relative block">
              <WorkspaceAvatar
                size="lg"
                interactive
                className="bg-bg-elevated text-accent-soft"
                avatarUrn={author?.avatarUrl}
                imageLoading="lazy"
              >
                {displayName.slice(0, 1)}
              </WorkspaceAvatar>
              <PresenceIndicator
                status={presence}
                size="sm"
                className="absolute bottom-0 right-0"
              />
            </span>
          </button>
        </div>
      ) : null}
      <div className={groupOwner === "peer" ? PEER_AUTHOR_GROUP_CONTENT_CLASS_NAME : "contents"}>
        {messageRows}
      </div>
    </section>
  );
});

export const WorkspaceMessageList: React.FC<WorkspaceMessageListProps> = ({
  messages,
  outgoingMessages = EMPTY_OUTGOING_MESSAGES,
  resolveServerMessageRenderKey,
  currentUserUuid,
  conversationId,
  initialSnapshotReady = true,
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
  resolveTopicLabel,
  presentation,
  resolveMention,
  actions,
}) => {
  const { locale, t } = useTranslation();
  const [unreadDividerSession, setUnreadDividerSession] = useState<{
    ready: boolean;
    anchor: MessengerUuid | undefined;
  }>(() => ({
    ready: initialSnapshotReady,
    anchor: initialSnapshotReady ? firstUnreadUuid : undefined,
  }));
  const stableFirstUnreadUuid = unreadDividerSession.ready
    ? unreadDividerSession.anchor
    : firstUnreadUuid;

  useEffect(() => {
    if (!initialSnapshotReady) {
      return;
    }

    setUnreadDividerSession((current) => {
      if (current.ready) {
        return current;
      }

      return { ready: true, anchor: firstUnreadUuid };
    });
  }, [firstUnreadUuid, initialSnapshotReady]);

  const usersById = useUsersStore((state) => state.usersById);
  const effectiveResolveAuthorLabel = useCallback(
    (authorUuid: MessengerUuid) =>
      resolveWorkspaceAuthorLabel(authorUuid, resolveAuthorLabel, usersById),
    [resolveAuthorLabel, usersById],
  );
  const createServerListItem = useCallback(
    (message: WorkspaceMessageListProps["messages"][number]) =>
      createWorkspaceMessageListServerItem(
        message,
        resolveServerMessageRenderKey?.(message.uuid) ?? message.uuid,
      ),
    [resolveServerMessageRenderKey],
  );
  const listItems = useMemo<readonly WorkspaceMessageListItem[]>(() => {
    // The canonical store keeps only server snapshots. Local rows are merged
    // into the display model here so the UI sees one list, while cache,
    // realtime, and server-side ordering stay free of temporary ids.
    if (outgoingMessages.length === 0) {
      return messages.map(createServerListItem);
    }

    const outgoingLocalIds = new Set(outgoingMessages.map((message) => message.localId));
    const serverItems = messages.map(createServerListItem);
    const deliveredOutgoingLocalIds = new Set<string>();
    for (const serverItem of serverItems) {
      // Only the key registered from this POST response may replace a local row.
      // Realtime snapshots without that key stay visible instead of guessing by content.
      if (outgoingLocalIds.has(serverItem.key)) {
        deliveredOutgoingLocalIds.add(serverItem.key);
      }
    }
    const outgoingListItems = outgoingMessages
      .map((outgoingMessage) => {
        if (outgoingMessage == null) {
          return null;
        }
        if (deliveredOutgoingLocalIds.has(outgoingMessage.localId)) {
          return null;
        }

        return createWorkspaceMessageListOutgoingItem(outgoingMessage);
      })
      .filter((message): message is WorkspaceMessageListOutgoingItem => message != null);

    return [...serverItems, ...outgoingListItems];
  }, [createServerListItem, messages, outgoingMessages]);
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
  const workspaceMediaGallery = useMemo(() => {
    const displayMessages = renderedMessages.flatMap((message) => {
      if (message.kind === "server") {
        return [message.message];
      }

      return [];
    });
    return collectWorkspaceMessageMediaGallery(displayMessages, { resolveMention });
  }, [renderedMessages, resolveMention]);
  const handleOpenWorkspaceMedia = useCallback(
    (file: WorkspaceMessageFileReference) => {
      const fileUuid = file.fileUuid.trim();
      const startIndex = workspaceMediaGallery.indexByFileUuid.get(fileUuid);
      if (startIndex == null) {
        void actions?.onOpenWorkspaceMedia?.(file);
        return;
      }

      void actions?.onOpenWorkspaceMedia?.(file, {
        items: workspaceMediaGallery.items,
        startIndex,
      });
    },
    [actions, workspaceMediaGallery],
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
  const {
    scrollContainerRef,
    handleScroll,
    handleWheel,
    handleTouchMove,
    isAtBottom,
    isUnreadDividerDismissed,
  } = useWorkspaceMessageListScroll({
    messages: renderedMessages,
    getMessageKey,
    isUnreadFromOther,
    scrollToBottomKey: scrollRequestKey,
    scrollToBottomAfterSendNonce,
    firstUnreadKey: stableFirstUnreadUuid,
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
  const unreadMessagesLabel =
    unreadCount > 0
      ? t("chat.unreadMessagesWithCount", { count: unreadCount })
      : t("chat.unreadMessages");

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
            {dayGroup.authorGroups.map((authorGroup, authorGroupIndex) => {
              const showUnreadMarker =
                stableFirstUnreadUuid != null &&
                authorGroup.messages.some((message) => message.key === stableFirstUnreadUuid);
              const authorGroupKey = `${dayGroup.dateKey}:${authorGroup.authorUuid}:${authorGroupIndex}`;
              const dividerTopicLabel = formatWorkspaceTopicLabel(
                resolveTopicLabel?.(authorGroup.topicUuid),
              );
              const dividerStreamUuid = authorGroup.messages[0]?.message.streamUuid;

              return (
                <React.Fragment key={authorGroupKey}>
                  {showUnreadMarker && !isUnreadDividerDismissed && (
                    <WorkspaceUnreadMessagesDivider label={unreadMessagesLabel} />
                  )}
                  {presentation?.topicDividers === true && authorGroup.startsTopicRun ? (
                    <WorkspaceMessageDivider
                      data-topic-divider="true"
                      data-topic-uuid={authorGroup.topicUuid}
                    >
                      {dividerTopicLabel != null && dividerStreamUuid != null ? (
                        <WorkspaceMessageTopicLink
                          label={dividerTopicLabel}
                          streamUuid={dividerStreamUuid}
                          topicUuid={authorGroup.topicUuid}
                          onOpenWorkspaceReference={messageActions?.onOpenWorkspaceReference}
                        />
                      ) : null}
                    </WorkspaceMessageDivider>
                  ) : null}
                  <WorkspaceMessageAuthorGroupView
                    group={authorGroup}
                    currentUserUuid={currentUserUuid}
                    resolveAuthorLabel={effectiveResolveAuthorLabel}
                    resolveTopicLabel={resolveTopicLabel}
                    showTopicLabels={presentation?.topicLabels === true}
                    resolveMention={resolveMention}
                    actions={messageActions}
                    selectedMessageUuids={selectedMessageUuids}
                    selectionMode={selectionMode}
                    usersById={usersById}
                  />
                </React.Fragment>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
