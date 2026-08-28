import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MessengerConversationId, MessengerUuid } from "~/entities/messenger/messenger.types";
import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { UsersById } from "~/entities/user/user.types";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t, useTranslation } from "~/i18n/i18n";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { workspaceMessengerMessageAnchor } from "~/shared/lib/workspace-messenger-route.lib";
import { FloatingScrollToBottomButton } from "~/shared/ui/floating-scroll-to-bottom-button";
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
import { WorkspaceMessageSelectionControl } from "./workspace-message-selection-control.ui";
import { WorkspaceMessageTopicLink } from "./workspace-message-topic-link.ui";
import type { WorkspaceMessageAuthorGroup } from "./workspace-message-list-grouping.lib";
import type {
  WorkspaceMessageListOutgoingItem,
  WorkspaceMessageListItem,
  WorkspaceMessageListPresentation,
  WorkspaceMessageListProps,
} from "./workspace-message-list.types";

const OWN_ROW_CLASS_NAME = "relative flex w-full justify-end self-stretch";
const PEER_ROW_CLASS_NAME = "relative flex w-full justify-start self-stretch";
const OWN_AUTHOR_GROUP_CLASS_NAME = "flex flex-col gap-1 items-end";
const PEER_AUTHOR_GROUP_CLASS_NAME = "flex w-full items-stretch gap-2";
const PEER_AUTHOR_GROUP_CONTENT_CLASS_NAME = "flex min-w-0 flex-1 flex-col items-start gap-1";
const MESSAGE_SELECTION_INTERACTIVE_TARGET_SELECTOR = [
  "a",
  "audio",
  "button",
  "details",
  "iframe",
  "input",
  "label",
  "select",
  "summary",
  "textarea",
  "video",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='checkbox']",
  "[role='link']",
  "[role='menuitem']",
  "[role='option']",
  "[role='switch']",
  "[data-workspace-message-selection-control='true']",
].join(",");
const EMPTY_SELECTED_MESSAGE_UUIDS = new Set<MessengerUuid>();
const EMPTY_OUTGOING_MESSAGES: NonNullable<WorkspaceMessageListProps["outgoingMessages"]> = [];

interface PendingLatestWindow {
  targetUuid: MessengerUuid;
  cancel?: (lastMessageUuid: MessengerUuid) => void;
}

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

function formatMessageSelectionTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function isMessageSelectionInteractiveTarget(target: EventTarget | null): boolean {
  return (
    !(target instanceof Element) ||
    target.closest(MESSAGE_SELECTION_INTERACTIVE_TARGET_SELECTOR) != null
  );
}

function hasTextSelectionWithin(container: HTMLElement): boolean {
  if (typeof window === "undefined" || typeof window.getSelection !== "function") {
    return false;
  }

  const selection = window.getSelection();
  return (
    selection != null &&
    !selection.isCollapsed &&
    selection.toString().trim().length > 0 &&
    (container.contains(selection.anchorNode) || container.contains(selection.focusNode))
  );
}

function shouldToggleMessageFromRow(event: React.MouseEvent<HTMLElement>): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    typeof Node === "undefined" ||
    !(event.target instanceof Node) ||
    !event.currentTarget.contains(event.target)
  ) {
    return false;
  }

  if (isMessageSelectionInteractiveTarget(event.target)) {
    return false;
  }

  return !hasTextSelectionWithin(event.currentTarget);
}

interface MessageSelectionContext {
  id: string;
  authorLabel: string;
  timeLabel: string;
}

function createMessageSelectionContext(
  messageAnchorId: string | undefined,
  message: WorkspaceMessageListItem,
  resolveAuthorLabel: WorkspaceMessageListRowProps["resolveAuthorLabel"],
): Readonly<MessageSelectionContext> | null {
  if (messageAnchorId == null) {
    return null;
  }

  const resolvedAuthorLabel = resolveAuthorLabel?.(message.authorUuid)?.trim();
  return {
    id: `${messageAnchorId}-selection-context`,
    authorLabel:
      resolvedAuthorLabel != null && resolvedAuthorLabel.length > 0
        ? resolvedAuthorLabel
        : `#${message.authorUuid.trim().slice(0, 8)}`,
    timeLabel: formatMessageSelectionTime(message.createdAt),
  };
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
  usersById: UsersById;
  topicLabel?: string | null;
  resolveMention?: WorkspaceMessageListProps["resolveMention"];
  quoteRenderMode?: WorkspaceMessageListPresentation["quoteRenderMode"];
  actions?: WorkspaceMessageListProps["actions"];
  passiveLoadersEnabled: boolean;
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
  usersById,
  topicLabel,
  resolveMention,
  quoteRenderMode,
  actions,
  passiveLoadersEnabled,
}: WorkspaceMessageListRowProps): React.ReactElement {
  const serverMessage = message.kind === "server" ? message.message : null;
  const serverMessageUuid = serverMessage?.uuid;
  const messageUuid = serverMessageUuid ?? message.key;
  const messageAnchorId =
    serverMessageUuid == null
      ? undefined
      : workspaceMessengerMessageAnchor(serverMessageUuid).slice(1);
  const rendersSelectionControl = selectionMode && serverMessage != null;
  const handleRowSelectionClick = (event: React.MouseEvent<HTMLElement>): void => {
    if (
      !rendersSelectionControl ||
      serverMessageUuid == null ||
      !shouldToggleMessageFromRow(event)
    ) {
      return;
    }

    actions?.onToggleMessageSelection?.(serverMessageUuid);
  };
  const selectionContext = rendersSelectionControl
    ? createMessageSelectionContext(messageAnchorId, message, resolveAuthorLabel)
    : null;
  /* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- The article contains links and buttons, so it cannot expose button semantics. Keyboard selection stays on the native checkbox. */
  return (
    <article
      id={messageAnchorId}
      className={`${owner === "own" ? OWN_ROW_CLASS_NAME : PEER_ROW_CLASS_NAME} ${
        selectionMode ? "items-end" : ""
      } ${
        rendersSelectionControl
          ? "cursor-pointer rounded-lg transition-colors hover:bg-card-bg-active"
          : ""
      }`}
      data-message-uuid={messageUuid}
      data-message-render-key={message.key}
      data-server-message-uuid={serverMessageUuid}
      data-outgoing-message-id={message.kind === "outgoing" ? message.message.localId : undefined}
      data-author-uuid={message.authorUuid}
      data-message-owner={owner}
      data-message-kind={message.kind}
      data-workspace-message-selectable-row={rendersSelectionControl ? "true" : undefined}
      onClick={rendersSelectionControl ? handleRowSelectionClick : undefined}
    >
      {/* The article remains the list row and the DOM anchor for scrolling. The
          bubble below only handles message presentation, so later phases can
          reshape the bubble without rewriting the scroll controller. */}
      {selectionMode ? (
        <span
          aria-hidden="true"
          className="w-14 shrink-0 self-stretch"
          data-workspace-message-selection-outer-rail="true"
        />
      ) : null}
      {rendersSelectionControl ? (
        <WorkspaceMessageSelectionControl
          checked={isSelected}
          label={t(isSelected ? "message.deselect" : "message.select")}
          descriptionId={selectionContext?.id}
          onChange={() => actions?.onToggleMessageSelection?.(serverMessage.uuid)}
        />
      ) : null}
      <div
        className={`min-w-0 ${
          selectionMode ? "flex min-w-0 flex-1" : "contents"
        } ${rendersSelectionControl ? "ml-2" : ""} ${
          owner === "own" ? "justify-end" : "justify-start"
        }`}
      >
        <WorkspaceMessageBubble
          message={message}
          currentUserUuid={currentUserUuid}
          isFirstInGroup={isFirstInGroup}
          isLastInGroup={isLastInGroup}
          isSelected={isSelected}
          resolveAuthorLabel={resolveAuthorLabel}
          usersById={usersById}
          topicLabel={topicLabel}
          resolveMention={resolveMention}
          quoteRenderMode={quoteRenderMode}
          actions={actions}
          passiveLoadersEnabled={passiveLoadersEnabled}
        />
      </div>
      {selectionContext != null ? (
        <span
          id={selectionContext.id}
          className="sr-only"
          data-workspace-message-selection-context="true"
        >
          {selectionContext.authorLabel}{" "}
          <time dateTime={message.createdAt}>{selectionContext.timeLabel}</time>
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        data-message-read-boundary={messageUuid}
      />
    </article>
  );
  /* eslint-enable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
});

interface WorkspaceMessageAuthorGroupViewProps {
  group: WorkspaceMessageAuthorGroup;
  currentUserUuid: MessengerUuid;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  resolveTopicLabel?: (topicUuid: MessengerUuid) => string | null | undefined;
  showTopicLabels: boolean;
  resolveMention?: WorkspaceMessageListProps["resolveMention"];
  quoteRenderMode?: WorkspaceMessageListPresentation["quoteRenderMode"];
  actions?: WorkspaceMessageListProps["actions"];
  passiveLoadersEnabled: boolean;
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
  quoteRenderMode,
  actions,
  passiveLoadersEnabled,
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
  let authorGroupClassName = PEER_AUTHOR_GROUP_CLASS_NAME;
  let authorGroupContentClassName = PEER_AUTHOR_GROUP_CONTENT_CLASS_NAME;
  if (groupOwner === "own") {
    authorGroupClassName = `${OWN_AUTHOR_GROUP_CLASS_NAME} ${selectionMode ? "w-full" : ""}`;
    authorGroupContentClassName = "contents";
  } else if (selectionMode) {
    authorGroupClassName = "relative flex w-full items-stretch";
    authorGroupContentClassName = `${PEER_AUTHOR_GROUP_CONTENT_CLASS_NAME} w-full`;
  }
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
      usersById={usersById}
      topicLabel={
        showTopicLabels && messageIndex === 0
          ? formatWorkspaceTopicLabel(resolveTopicLabel?.(message.message.topicUuid))
          : null
      }
      resolveMention={resolveMention}
      quoteRenderMode={quoteRenderMode}
      actions={actions}
      passiveLoadersEnabled={passiveLoadersEnabled}
    />
  ));

  return (
    <section
      className={authorGroupClassName}
      data-author-group="true"
      data-author-uuid={group.authorUuid}
      data-message-owner={groupOwner}
    >
      {groupOwner === "peer" ? (
        <div
          className={
            selectionMode
              ? "pointer-events-none absolute bottom-0 left-0 z-[1] flex w-12 flex-col justify-end pb-2"
              : "flex w-12 flex-shrink-0 flex-col justify-end pb-2"
          }
        >
          <button
            type="button"
            onClick={handleAuthorClick}
            className={`${selectionMode ? "pointer-events-auto" : ""} group relative z-[1] rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft`}
            aria-label={t("a11y.openUserProfile", { name: displayName })}
            data-workspace-peer-avatar="true"
          >
            <span className="relative block">
              <WorkspaceAvatar
                size="lg"
                interactive
                className="bg-bg-elevated text-accent-soft"
                avatarUrn={passiveLoadersEnabled ? author?.avatarUrl : null}
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
      <div className={authorGroupContentClassName}>{messageRows}</div>
    </section>
  );
});

export const WorkspaceMessageList: React.FC<WorkspaceMessageListProps> = ({
  messages,
  outgoingMessages = EMPTY_OUTGOING_MESSAGES,
  resolveServerMessageRenderKey,
  currentUserUuid,
  conversationId,
  initialPositionReady = true,
  scrollToBottomKey,
  scrollToBottomAfterSendNonce,
  firstUnreadUuid,
  unreadCount = 0,
  focusedMessageTarget = null,
  anchorHandoffPending = false,
  anchorNavigationActive = false,
  onFocusedMessageApplied,
  onFocusedMessageMissing,
  selectionMode = false,
  selectedMessageUuids = EMPTY_SELECTED_MESSAGE_UUIDS,
  isLoadingOlder = false,
  isLoadingNewer = false,
  hasOlderMessages = false,
  hasNewerMessages = false,
  lastMessageUuid = null,
  onLoadOlder,
  onLoadNewer,
  onLoadLatestWindow,
  onCancelLatestWindowLoad,
  onTailNavigationRequested,
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
    ready: initialPositionReady,
    anchor: initialPositionReady ? firstUnreadUuid : undefined,
  }));
  const sessionFirstUnreadUuid = unreadDividerSession.ready
    ? unreadDividerSession.anchor
    : undefined;
  const stableFirstUnreadUuid =
    unreadCount === 0 && firstUnreadUuid == null ? undefined : sessionFirstUnreadUuid;

  const unreadDividerConversationRef = useRef(conversationId);
  useLayoutEffect(() => {
    // Without a remount per conversation this session has to be retired by hand,
    // or the new conversation inherits the previous one's unread anchor.
    if (unreadDividerConversationRef.current === conversationId) return;
    unreadDividerConversationRef.current = conversationId;
    setUnreadDividerSession({
      ready: initialPositionReady,
      anchor: initialPositionReady ? firstUnreadUuid : undefined,
    });
  }, [conversationId, firstUnreadUuid, initialPositionReady]);

  useEffect(() => {
    if (anchorHandoffPending || !initialPositionReady) {
      return;
    }

    setUnreadDividerSession((current) => {
      if (current.ready) {
        return current;
      }

      return { ready: true, anchor: firstUnreadUuid };
    });
  }, [anchorHandoffPending, firstUnreadUuid, initialPositionReady]);

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
    return `${conversationId}:${scrollToBottomKey ?? ""}`;
  }, [conversationId, scrollToBottomKey]);
  const pendingLatestWindowRef = useRef<PendingLatestWindow | null>(null);
  const tailIntentConversationRef = useRef<MessengerConversationId | null>(null);
  const lastMessageIsLoaded = useMemo(
    () => lastMessageUuid != null && messages.some((message) => message.uuid === lastMessageUuid),
    [lastMessageUuid, messages],
  );
  const isKnownTailOutsideWindow = lastMessageUuid != null && !lastMessageIsLoaded;
  const cancelPendingLatestWindow = useCallback(() => {
    const pending = pendingLatestWindowRef.current;
    if (pending != null) {
      pendingLatestWindowRef.current = null;
      pending.cancel?.(pending.targetUuid);
    }
  }, []);
  const clearCompletedLatestWindow = useCallback((targetUuid: MessengerUuid): void => {
    if (pendingLatestWindowRef.current?.targetUuid === targetUuid) {
      pendingLatestWindowRef.current = null;
    }
  }, []);
  const handleUserScrollInput = useCallback(() => {
    if (anchorHandoffPending) return;
    tailIntentConversationRef.current = null;
    cancelPendingLatestWindow();
  }, [anchorHandoffPending, cancelPendingLatestWindow]);
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
    scrollToBottom,
    isAtBottom,
    isUnreadDividerDismissed,
  } = useWorkspaceMessageListScroll({
    messages: renderedMessages,
    conversationId,
    getMessageKey,
    isUnreadFromOther,
    initialPositionReady,
    scrollToBottomKey: scrollRequestKey,
    scrollToBottomAfterSendNonce,
    firstUnreadKey: firstUnreadUuid,
    unreadCount,
    focusedMessageTarget,
    anchorHandoffPending,
    anchorNavigationActive,
    onFocusedMessageApplied,
    onFocusedMessageMissing,
    isLoadingOlder,
    isLoadingNewer,
    hasOlderMessages,
    hasNewerMessages,
    onLoadOlder,
    onLoadNewer,
    onUserScrollInput: handleUserScrollInput,
    onUnreadMessagesVisible,
    onUnreadMessagesAtBottom,
  });
  const requestLatestWindow = useCallback(
    (targetUuid: MessengerUuid): void => {
      if (
        anchorHandoffPending ||
        pendingLatestWindowRef.current?.targetUuid === targetUuid ||
        onLoadLatestWindow == null
      ) {
        return;
      }

      cancelPendingLatestWindow();
      pendingLatestWindowRef.current = { targetUuid, cancel: onCancelLatestWindowLoad };
      const request = onLoadLatestWindow(targetUuid);
      if (request != null) {
        void Promise.resolve(request).then(
          () => {
            clearCompletedLatestWindow(targetUuid);
          },
          () => {
            clearCompletedLatestWindow(targetUuid);
          },
        );
      }
    },
    [
      anchorHandoffPending,
      cancelPendingLatestWindow,
      clearCompletedLatestWindow,
      onCancelLatestWindowLoad,
      onLoadLatestWindow,
    ],
  );
  const handleScrollToBottom = useCallback(() => {
    onTailNavigationRequested?.();
    tailIntentConversationRef.current = conversationId;

    if (lastMessageUuid != null && !lastMessageIsLoaded) {
      requestLatestWindow(lastMessageUuid);
      return;
    }

    cancelPendingLatestWindow();
    scrollToBottom();
  }, [
    cancelPendingLatestWindow,
    conversationId,
    lastMessageIsLoaded,
    lastMessageUuid,
    requestLatestWindow,
    scrollToBottom,
    onTailNavigationRequested,
  ]);

  const focusedMessageIntentId = focusedMessageTarget?.intentId;
  useLayoutEffect(() => {
    if (focusedMessageIntentId == null) return;
    tailIntentConversationRef.current = null;
    cancelPendingLatestWindow();
  }, [cancelPendingLatestWindow, focusedMessageIntentId]);

  useLayoutEffect(() => {
    if (anchorHandoffPending) return;
    if (tailIntentConversationRef.current !== conversationId) {
      return;
    }

    if (lastMessageUuid == null) {
      cancelPendingLatestWindow();
      scrollToBottom();
      return;
    }

    if (lastMessageIsLoaded) {
      if (
        pendingLatestWindowRef.current != null &&
        pendingLatestWindowRef.current.targetUuid !== lastMessageUuid
      ) {
        cancelPendingLatestWindow();
      } else {
        clearCompletedLatestWindow(lastMessageUuid);
      }
      scrollToBottom();
      return;
    }

    requestLatestWindow(lastMessageUuid);
  }, [
    anchorHandoffPending,
    cancelPendingLatestWindow,
    clearCompletedLatestWindow,
    conversationId,
    lastMessageIsLoaded,
    lastMessageUuid,
    requestLatestWindow,
    scrollToBottom,
  ]);

  useEffect(() => {
    return () => {
      tailIntentConversationRef.current = null;
      cancelPendingLatestWindow();
    };
  }, [cancelPendingLatestWindow, conversationId]);
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
    <>
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
            {/* Sticky day pill: stays under the chat header while this day's messages are in view. */}
            <div className="sticky top-0 z-sticky flex justify-center py-1">
              <time
                className="bg-bg-elevated/90 rounded-full border border-border-subtle px-3 py-1 text-xs font-medium text-text-muted backdrop-blur-sm"
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
                      quoteRenderMode={presentation?.quoteRenderMode}
                      actions={messageActions}
                      passiveLoadersEnabled={!anchorHandoffPending}
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
      {!anchorHandoffPending && (!isAtBottom || isKnownTailOutsideWindow || hasNewerMessages) ? (
        <FloatingScrollToBottomButton onClick={handleScrollToBottom} unreadCount={unreadCount} />
      ) : null}
    </>
  );
};
