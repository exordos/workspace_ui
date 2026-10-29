import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { compareWorkspaceMessages } from "~/entities/message/message-workspace-order.lib";
import {
  selectWorkspaceMessageById,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import { useResolvedMessengerQuoteMessage } from "~/entities/messenger/messenger-quote-resolver.hook";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { UsersById } from "~/entities/user/user.types";
import {
  MessagePresentationContext,
  useMessagePresentations,
} from "~/features/message-presentation/message-presentation.hook";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t, useTranslation } from "~/i18n/i18n";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { workspaceMessengerMessageAnchor } from "~/shared/lib/workspace-messenger-route.lib";
import { FloatingScrollToBottomButton } from "~/shared/ui/floating-scroll-to-bottom-button";
import { WorkspaceMessageBubble } from "./workspace-message-bubble.ui";
import { formatWorkspaceMessageDayLabel } from "./workspace-message-day-label.lib";
import { WorkspaceMessageDivider } from "./workspace-message-divider.ui";
import {
  compareMessagesByCreatedAtThenKey,
  createWorkspaceMessageListOutgoingItem,
  createWorkspaceMessageListServerItem,
  groupWorkspaceMessagesByDayAndAuthor,
  isWorkspaceServiceMessage,
} from "./workspace-message-list-grouping.lib";
import { collectWorkspaceMessageMediaGallery } from "./workspace-message-list-media.lib";
import { useWorkspaceMessageListScroll } from "./workspace-message-list-scroll.hook";
import { WorkspaceMessageSelectionControl } from "./workspace-message-selection-control.ui";
import { WorkspaceMessageTopicLink } from "./workspace-message-topic-link.ui";
import { useServiceMessageExpansion } from "./workspace-service-message-expansion.hook";
import {
  getWorkspaceServiceGroupStatus,
  isWorkspaceMessageRelevantToAccount,
} from "./workspace-service-message-group.lib";
import { WorkspaceServiceMessageGroup } from "./workspace-service-message-group.ui";
import type {
  WorkspaceMessageAuthorGroup,
  WorkspaceMessageDayGroup,
} from "./workspace-message-list-grouping.lib";
import type {
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
const EMPTY_READ_REQUEST_BOUNDARY_MESSAGE_UUIDS = new Set<MessengerUuid>();
const EMPTY_READ_REQUEST_BOUNDARIES = new Map<string, WorkspaceReadRequestBoundary>();
const EMPTY_OUTGOING_MESSAGES: NonNullable<WorkspaceMessageListProps["outgoingMessages"]> = [];

interface WorkspaceAuthorGroupRenderKeyRecord {
  dateKey: string;
  authorUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  messageKeys: ReadonlySet<string>;
  messageKindsByKey: ReadonlyMap<string, WorkspaceMessageListItem["kind"]>;
  renderKey: string;
  serviceGroup: boolean;
}

interface WorkspaceAuthorGroupRenderKeyCalculation {
  records: readonly WorkspaceAuthorGroupRenderKeyRecord[];
  renderKeys: ReadonlyMap<WorkspaceMessageAuthorGroup, string>;
}

interface WorkspaceReadRequestBoundary {
  message: MessengerMessage;
}

interface PendingLatestWindow {
  targetUuid: MessengerUuid;
  cancel?: (lastMessageUuid: MessengerUuid) => void;
}

function WorkspaceServiceRequestResolver({
  messageUuid,
}: Readonly<{ messageUuid: MessengerUuid }>) {
  useResolvedMessengerQuoteMessage(messageUuid);
  return null;
}

function authorGroupFallbackRenderKey(dateKey: string, group: WorkspaceMessageAuthorGroup): string {
  return `${dateKey}:${group.authorUuid}:${group.topicUuid}:${group.messages[0]?.key ?? "empty"}`;
}

function uniqueAuthorGroupFallbackRenderKey(
  dateKey: string,
  group: WorkspaceMessageAuthorGroup,
  unavailableKeys: ReadonlySet<string>,
): string {
  const fallbackKey = authorGroupFallbackRenderKey(dateKey, group);
  let renderKey = fallbackKey;
  let collisionOrdinal = 1;
  while (unavailableKeys.has(renderKey)) {
    renderKey = `${fallbackKey}:split:${collisionOrdinal}`;
    collisionOrdinal += 1;
  }
  return renderKey;
}

function indexPreviousAuthorGroupRecords(
  records: readonly WorkspaceAuthorGroupRenderKeyRecord[],
): ReadonlyMap<string, WorkspaceAuthorGroupRenderKeyRecord> {
  const recordsByMessageKey = new Map<string, WorkspaceAuthorGroupRenderKeyRecord>();
  for (const record of records) {
    for (const messageKey of record.messageKeys) {
      recordsByMessageKey.set(messageKey, record);
    }
  }
  return recordsByMessageKey;
}

function reserveTransitionAuthorGroupRecords(
  dayGroups: readonly WorkspaceMessageDayGroup[],
  previousRecordByMessageKey: ReadonlyMap<string, WorkspaceAuthorGroupRenderKeyRecord>,
): ReadonlyMap<WorkspaceMessageAuthorGroup, WorkspaceAuthorGroupRenderKeyRecord> {
  const reservedRecordByGroup = new Map<
    WorkspaceMessageAuthorGroup,
    WorkspaceAuthorGroupRenderKeyRecord
  >();
  const reservedRecords = new Set<WorkspaceAuthorGroupRenderKeyRecord>();
  for (const dayGroup of dayGroups) {
    for (const authorGroup of dayGroup.authorGroups) {
      const transitionedMessage = authorGroup.messages.find((message) => {
        const candidate = previousRecordByMessageKey.get(message.key);
        return (
          candidate != null &&
          !reservedRecords.has(candidate) &&
          candidate.authorUuid === authorGroup.authorUuid &&
          candidate.topicUuid === authorGroup.topicUuid &&
          candidate.messageKindsByKey.get(message.key) !== message.kind
        );
      });
      const candidate =
        transitionedMessage == null
          ? undefined
          : previousRecordByMessageKey.get(transitionedMessage.key);
      if (candidate == null) continue;

      // A confirmed row inherits its optimistic parent even if ordering split
      // the author group or moved the row across a local date boundary.
      reservedRecordByGroup.set(authorGroup, candidate);
      reservedRecords.add(candidate);
    }
  }
  return reservedRecordByGroup;
}

function findReusableAuthorGroupRecord({
  dateKey,
  group,
  previousRecordByMessageKey,
  unavailableRecords,
}: {
  dateKey: string;
  group: WorkspaceMessageAuthorGroup;
  previousRecordByMessageKey: ReadonlyMap<string, WorkspaceAuthorGroupRenderKeyRecord>;
  unavailableRecords: ReadonlySet<WorkspaceAuthorGroupRenderKeyRecord>;
}): WorkspaceAuthorGroupRenderKeyRecord | undefined {
  return group.messages
    .map((message) => previousRecordByMessageKey.get(message.key))
    .find(
      (candidate) =>
        candidate != null &&
        !unavailableRecords.has(candidate) &&
        candidate.dateKey === dateKey &&
        (candidate.authorUuid === group.authorUuid ||
          (candidate.serviceGroup &&
            group.messages[0] != null &&
            isWorkspaceServiceMessage(group.messages[0]))) &&
        candidate.topicUuid === group.topicUuid,
    );
}

function createAuthorGroupRenderKeyRecord(
  dateKey: string,
  group: WorkspaceMessageAuthorGroup,
  renderKey: string,
): WorkspaceAuthorGroupRenderKeyRecord {
  return {
    dateKey,
    authorUuid: group.authorUuid,
    topicUuid: group.topicUuid,
    messageKeys: new Set(group.messages.map((message) => message.key)),
    messageKindsByKey: new Map(group.messages.map((message) => [message.key, message.kind])),
    renderKey,
    serviceGroup: group.messages[0] != null && isWorkspaceServiceMessage(group.messages[0]),
  };
}

function buildWorkspaceAuthorGroupRenderKeyState(
  dayGroups: readonly WorkspaceMessageDayGroup[],
  previousRecords: readonly WorkspaceAuthorGroupRenderKeyRecord[],
): WorkspaceAuthorGroupRenderKeyCalculation {
  const previousRecordByMessageKey = indexPreviousAuthorGroupRecords(previousRecords);
  const reservedRecordByGroup = reserveTransitionAuthorGroupRecords(
    dayGroups,
    previousRecordByMessageKey,
  );
  const reservedRecords = new Set(reservedRecordByGroup.values());

  const claimedRecords = new Set<WorkspaceAuthorGroupRenderKeyRecord>();
  const reservedRenderKeys = new Set(
    Array.from(reservedRecordByGroup.values(), (record) => record.renderKey),
  );
  const usedRenderKeys = new Set<string>();
  const renderKeys = new Map<WorkspaceMessageAuthorGroup, string>();
  const nextRecords: WorkspaceAuthorGroupRenderKeyRecord[] = [];

  for (const dayGroup of dayGroups) {
    for (const authorGroup of dayGroup.authorGroups) {
      let matchingRecord = reservedRecordByGroup.get(authorGroup);
      matchingRecord ??= findReusableAuthorGroupRecord({
        dateKey: dayGroup.dateKey,
        group: authorGroup,
        previousRecordByMessageKey,
        unavailableRecords: new Set([...claimedRecords, ...reservedRecords]),
      });

      const unavailableFallbackKeys = new Set([...reservedRenderKeys, ...usedRenderKeys]);
      const renderKey =
        matchingRecord?.renderKey ??
        uniqueAuthorGroupFallbackRenderKey(dayGroup.dateKey, authorGroup, unavailableFallbackKeys);
      if (matchingRecord != null) {
        claimedRecords.add(matchingRecord);
      }
      usedRenderKeys.add(renderKey);
      renderKeys.set(authorGroup, renderKey);
      nextRecords.push(createAuthorGroupRenderKeyRecord(dayGroup.dateKey, authorGroup, renderKey));
    }
  }

  return { records: nextRecords, renderKeys };
}

function useWorkspaceAuthorGroupRenderKeys(
  dayGroups: readonly WorkspaceMessageDayGroup[],
  conversationId: MessengerConversationId,
): ReadonlyMap<WorkspaceMessageAuthorGroup, string> {
  const committedStateRef = useRef<{
    conversationId: MessengerConversationId;
    records: readonly WorkspaceAuthorGroupRenderKeyRecord[];
  }>({ conversationId, records: [] });
  const calculation = useMemo(() => {
    const committedState = committedStateRef.current;
    return buildWorkspaceAuthorGroupRenderKeyState(
      dayGroups,
      // eslint-disable-next-line react-hooks/refs -- Only the last committed groups may preserve DOM identity.
      committedState.conversationId === conversationId ? committedState.records : [],
    );
  }, [conversationId, dayGroups]);

  useLayoutEffect(() => {
    committedStateRef.current = { conversationId, records: calculation.records };
  }, [calculation.records, conversationId]);

  return calculation.renderKeys;
}

function resolveMessageOwner(
  message: WorkspaceMessageListItem,
  currentUserUuid: MessengerUuid,
): "own" | "peer" {
  return message.authorUuid === currentUserUuid || message.isOwn ? "own" : "peer";
}

function readRequestTopicKey(message: MessengerMessage): string {
  return `${message.streamUuid}\u0000${message.topicUuid}`;
}

function isMessageCoveredByReadRequest(
  message: WorkspaceMessageListItem,
  boundariesByTopic: ReadonlyMap<string, WorkspaceReadRequestBoundary>,
): boolean {
  if (message.kind !== "server" || message.read) return false;
  const boundary = boundariesByTopic.get(readRequestTopicKey(message.message));
  return boundary != null && compareWorkspaceMessages(message.message, boundary.message) <= 0;
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
  readRequestPending: boolean;
  selectionMode: boolean;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  usersById: UsersById;
  topicLabel?: string | null;
  resolveMention?: WorkspaceMessageListProps["resolveMention"];
  quoteRenderMode?: WorkspaceMessageListPresentation["quoteRenderMode"];
  quickActions?: WorkspaceMessageListPresentation["quickActions"];
  actions?: WorkspaceMessageListProps["actions"];
  passiveLoadersEnabled: boolean;
  collapsedService?: boolean;
}

const WorkspaceMessageListRow = React.memo(function WorkspaceMessageListRow({
  message,
  owner,
  currentUserUuid,
  isFirstInGroup,
  isLastInGroup,
  isSelected,
  readRequestPending,
  selectionMode,
  resolveAuthorLabel,
  usersById,
  topicLabel,
  resolveMention,
  quoteRenderMode,
  quickActions,
  actions,
  passiveLoadersEnabled,
  collapsedService = false,
}: WorkspaceMessageListRowProps): React.ReactElement {
  const serverMessage = message.kind === "server" ? message.message : null;
  const service = isWorkspaceServiceMessage(message);
  const serverMessageUuid = serverMessage?.uuid;
  const messageUuid = serverMessageUuid ?? message.key;
  const messageAnchorId =
    serverMessageUuid == null
      ? undefined
      : workspaceMessengerMessageAnchor(serverMessageUuid).slice(1);
  const identityProps = {
    id: messageAnchorId,
    "data-message-uuid": messageUuid,
    "data-message-render-key": message.key,
    "data-server-message-uuid": serverMessageUuid,
    "data-author-uuid": message.authorUuid,
    "data-message-owner": owner,
    "data-message-kind": message.kind,
  };
  const readBoundary = (
    <span
      key="read-boundary"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
      data-message-read-boundary={messageUuid}
    />
  );
  if (collapsedService) {
    // Keep scroll and read anchors at the divider without mounting hidden actions or loaders.
    return (
      <article
        {...identityProps}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        {readBoundary}
      </article>
    );
  }
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
      {...identityProps}
      className={`${service ? "relative flex w-full justify-center self-stretch" : owner === "own" ? OWN_ROW_CLASS_NAME : PEER_ROW_CLASS_NAME} ${
        selectionMode ? "items-end" : ""
      } ${
        rendersSelectionControl
          ? "cursor-pointer rounded-lg transition-colors hover:bg-card-bg-active"
          : ""
      }`}
      data-outgoing-message-id={
        message.kind === "outgoing" ? message.message.placementUuid : undefined
      }
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
          service ? "justify-center" : owner === "own" ? "justify-end" : "justify-start"
        }`}
      >
        <WorkspaceMessageBubble
          message={message}
          currentUserUuid={currentUserUuid}
          isFirstInGroup={isFirstInGroup}
          isLastInGroup={isLastInGroup}
          isSelected={isSelected}
          readRequestPending={readRequestPending}
          resolveAuthorLabel={resolveAuthorLabel}
          usersById={usersById}
          topicLabel={topicLabel}
          resolveMention={resolveMention}
          quoteRenderMode={quoteRenderMode}
          quickActions={quickActions}
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
      {readBoundary}
    </article>
  );
  /* eslint-enable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
});

interface WorkspaceMessageAuthorGroupViewProps {
  group: WorkspaceMessageAuthorGroup;
  serviceExpanded: boolean;
  onToggleService: (group: WorkspaceMessageAuthorGroup) => void;
  currentUserUuid: MessengerUuid;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  resolveTopicLabel?: (topicUuid: MessengerUuid) => string | null | undefined;
  showTopicLabels: boolean;
  resolveMention?: WorkspaceMessageListProps["resolveMention"];
  quoteRenderMode?: WorkspaceMessageListPresentation["quoteRenderMode"];
  quickActions?: WorkspaceMessageListPresentation["quickActions"];
  actions?: WorkspaceMessageListProps["actions"];
  passiveLoadersEnabled: boolean;
  selectedMessageUuids: ReadonlySet<MessengerUuid>;
  readRequestBoundariesByTopic: ReadonlyMap<string, WorkspaceReadRequestBoundary>;
  selectionMode: boolean;
  usersById: UsersById;
}

const WorkspaceMessageAuthorGroupView = React.memo(function WorkspaceMessageAuthorGroupView({
  group,
  serviceExpanded,
  onToggleService,
  currentUserUuid,
  resolveAuthorLabel,
  resolveTopicLabel,
  showTopicLabels,
  resolveMention,
  quoteRenderMode,
  quickActions,
  actions,
  passiveLoadersEnabled,
  selectedMessageUuids,
  readRequestBoundariesByTopic,
  selectionMode,
  usersById,
}: WorkspaceMessageAuthorGroupViewProps): React.ReactElement {
  const firstMessage = group.messages[0];
  const serviceGroup = firstMessage != null && isWorkspaceServiceMessage(firstMessage);
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
      readRequestPending={isMessageCoveredByReadRequest(message, readRequestBoundariesByTopic)}
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
      quickActions={quickActions}
      actions={actions}
      passiveLoadersEnabled={passiveLoadersEnabled}
      collapsedService={serviceGroup && !serviceExpanded && !selectionMode}
    />
  ));

  return (
    <section
      className={serviceGroup ? "flex w-full flex-col items-center py-1" : authorGroupClassName}
      data-author-group="true"
      data-author-uuid={group.authorUuid}
      data-message-owner={groupOwner}
    >
      {groupOwner === "peer" && !serviceGroup ? (
        // The rail must span the group so bottom-sticky can follow the viewport within it.
        <div
          className={
            selectionMode
              ? "pointer-events-none absolute inset-y-0 left-0 z-[1] flex w-12 flex-col justify-end pb-2"
              : "flex w-12 flex-shrink-0 flex-col justify-end pb-2"
          }
        >
          <button
            type="button"
            onClick={handleAuthorClick}
            className={`${selectionMode ? "pointer-events-auto" : ""} group/avatar sticky bottom-2 z-[1] rounded-full focus-visible:outline-none`}
            aria-label={t("a11y.openUserProfile", { name: displayName })}
            data-workspace-peer-avatar="true"
          >
            <WorkspaceAvatar
              size="lg"
              interactive
              className="bg-bg-elevated text-accent-soft"
              avatarUrn={passiveLoadersEnabled ? author?.avatarUrl : null}
              imageLoading="lazy"
              presence={presence}
            >
              {displayName.slice(0, 1)}
            </WorkspaceAvatar>
          </button>
        </div>
      ) : null}
      <div
        className={serviceGroup ? "flex w-full flex-col items-center" : authorGroupContentClassName}
      >
        {serviceGroup ? (
          <WorkspaceServiceMessageGroup
            count={group.messages.length}
            expanded={serviceExpanded || selectionMode}
            status={getWorkspaceServiceGroupStatus(group.messages, currentUserUuid, actions)}
            onToggle={() => onToggleService(group)}
            toggleDisabled={selectionMode}
          >
            {messageRows}
          </WorkspaceServiceMessageGroup>
        ) : (
          messageRows
        )}
      </div>
    </section>
  );
});

export const WorkspaceMessageList: React.FC<WorkspaceMessageListProps> = (props) => {
  const prepared = useMessagePresentations(props.messages, props.conversationId);
  const pendingUuids = prepared.pendingMessageUuids;
  const preparing = pendingUuids.size > 0;
  const messages = useMemo(
    () =>
      preparing ? props.messages.filter(({ uuid }) => !pendingUuids.has(uuid)) : props.messages,
    [props.messages, pendingUuids, preparing],
  );
  const incomingOutgoing = props.outgoingMessages ?? EMPTY_OUTGOING_MESSAGES;
  const [outgoingView, setOutgoingView] = useState({
    scope: prepared.scope,
    messages: incomingOutgoing,
  });
  const retainedOutgoing =
    outgoingView.scope === prepared.scope
      ? outgoingView.messages.filter(
          (message) =>
            pendingUuids.has(message.placementUuid) &&
            !incomingOutgoing.some((current) => current.placementUuid === message.placementUuid),
        )
      : [];
  const outgoingMessages =
    retainedOutgoing.length === 0 ? incomingOutgoing : [...incomingOutgoing, ...retainedOutgoing];
  if (
    outgoingView.scope !== prepared.scope ||
    outgoingView.messages.length !== outgoingMessages.length ||
    outgoingView.messages.some((message, index) => message !== outgoingMessages[index])
  ) {
    // Keep a confirmed optimistic row until its ciphertext is ready to replace it.
    setOutgoingView({ scope: prepared.scope, messages: outgoingMessages });
  }
  const [windowView, setWindowView] = useState({ scope: prepared.scope, opened: false });
  const opened = windowView.scope === prepared.scope && windowView.opened;
  const showWindow = !preparing || opened || outgoingMessages.length > 0;
  const hasShownRows = showWindow && (messages.length > 0 || outgoingMessages.length > 0);
  if (windowView.scope !== prepared.scope || (!opened && hasShownRows)) {
    setWindowView({ scope: prepared.scope, opened: hasShownRows });
  }
  if (!showWindow) {
    return (
      <div className="min-h-0 flex-1" aria-busy="true" data-workspace-message-preparation="true" />
    );
  }
  return (
    <MessagePresentationContext.Provider value={prepared.presentations}>
      <WorkspaceMessageListContent
        {...props}
        messages={messages}
        outgoingMessages={outgoingMessages}
        focusedMessagePending={
          props.focusedMessageTarget != null &&
          pendingUuids.has(props.focusedMessageTarget.messageUuid)
        }
        isLoadingOlder={preparing ? true : props.isLoadingOlder}
        isLoadingNewer={preparing ? true : props.isLoadingNewer}
      />
    </MessagePresentationContext.Provider>
  );
};

const WorkspaceMessageListContent: React.FC<
  WorkspaceMessageListProps & { focusedMessagePending: boolean }
> = ({
  messages,
  outgoingMessages = EMPTY_OUTGOING_MESSAGES,
  currentUserUuid,
  conversationId,
  initialPositionReady = true,
  initialPositionCancelled = false,
  onUserScrollInput,
  scrollToBottomKey,
  scrollToBottomAfterSendNonce,
  firstUnreadUuid,
  unreadCount = 0,
  focusedMessageTarget = null,
  focusedMessagePending,
  anchorHandoffPending = false,
  anchorNavigationActive = false,
  onFocusedMessageApplied,
  onFocusedMessageMissing,
  selectionMode = false,
  selectedMessageUuids = EMPTY_SELECTED_MESSAGE_UUIDS,
  readRequestBoundaryMessageUuids = EMPTY_READ_REQUEST_BOUNDARY_MESSAGE_UUIDS,
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
  const unreadDividerAnchorUuid =
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
  const listItems = useMemo<readonly WorkspaceMessageListItem[]>(() => {
    // The canonical store keeps only server snapshots. Local rows are merged
    // into the display model here so the UI sees one list, while cache,
    // realtime, and server-side ordering stay free of temporary ids.
    if (outgoingMessages.length === 0) {
      return messages.map((message) => createWorkspaceMessageListServerItem(message));
    }

    const serverItems = messages.map((message) => createWorkspaceMessageListServerItem(message));
    const serverMessageUuids = new Set(messages.map((message) => message.uuid));
    const outgoingListItems = outgoingMessages
      .filter((outgoingMessage) => !serverMessageUuids.has(outgoingMessage.placementUuid))
      .map(createWorkspaceMessageListOutgoingItem);

    return [...serverItems, ...outgoingListItems];
  }, [messages, outgoingMessages]);
  const readRequestBoundariesByTopic = useMemo(() => {
    if (readRequestBoundaryMessageUuids.size === 0) return EMPTY_READ_REQUEST_BOUNDARIES;
    const boundaries = new Map<string, WorkspaceReadRequestBoundary>();
    for (const message of messages) {
      if (!readRequestBoundaryMessageUuids.has(message.uuid)) continue;
      const key = readRequestTopicKey(message);
      const currentBoundary = boundaries.get(key);
      if (
        currentBoundary == null ||
        compareWorkspaceMessages(message, currentBoundary.message) > 0
      ) {
        boundaries.set(key, { message });
      }
    }
    return boundaries;
  }, [messages, readRequestBoundaryMessageUuids]);
  const requestUuids = useMemo(
    () => [
      ...new Set(
        messages.flatMap(({ payload }) =>
          payload.kind === "key_grant" || payload.kind === "key_reject"
            ? [payload.requestMessageUuid]
            : [],
        ),
      ),
    ],
    [messages],
  );
  const storedRequests = useWorkspaceMessageStore(
    useShallow((state) => requestUuids.map((uuid) => selectWorkspaceMessageById(state, uuid))),
  );
  const requestsByUuid = useMemo(() => {
    const requests = new Map<MessengerUuid, MessengerMessage>();
    for (const message of messages)
      if (message.payload.kind === "key_request") requests.set(message.uuid, message);
    for (const message of storedRequests) if (message != null) requests.set(message.uuid, message);
    return requests;
  }, [messages, storedRequests]);
  const resolveKeyRequestMessage = useCallback(
    (uuid: MessengerUuid) => requestsByUuid.get(uuid) ?? null,
    [requestsByUuid],
  );
  const accountServiceMessages = presentation?.serviceMessages === "account";
  const visibleListItems = useMemo(() => {
    const serviceActions = { ...actions, resolveKeyRequestMessage };
    return accountServiceMessages
      ? listItems.filter(
          (item) =>
            item.kind !== "server" ||
            isWorkspaceMessageRelevantToAccount(item.message, currentUserUuid, serviceActions),
        )
      : listItems;
  }, [accountServiceMessages, actions, currentUserUuid, listItems, resolveKeyRequestMessage]);
  // Responses can outlive their request's history window. Reuse the existing
  // scoped resolver before deciding whether the recipient is this account.
  const requestResolvers = accountServiceMessages
    ? requestUuids
        .filter((uuid) => !requestsByUuid.has(uuid))
        .map((uuid) => <WorkspaceServiceRequestResolver key={uuid} messageUuid={uuid} />)
    : null;
  const dayGroups = useMemo(
    () => groupWorkspaceMessagesByDayAndAuthor(visibleListItems),
    [visibleListItems],
  );
  const authorGroupRenderKeys = useWorkspaceAuthorGroupRenderKeys(dayGroups, conversationId);
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
  // Keep history boundaries for pagination even when a whole page is hidden.
  const scrollItems = useMemo(
    () =>
      accountServiceMessages
        ? [...listItems].sort(compareMessagesByCreatedAtThenKey)
        : renderedMessages,
    [accountServiceMessages, listItems, renderedMessages],
  );
  const resolveVisibleMessageKey = useCallback(
    (key: MessengerUuid | undefined) => {
      if (!accountServiceMessages || key == null) return key;
      const anchor = listItems.find((item) => item.key === key);
      if (anchor == null) return key;
      return renderedMessages.find((item) => compareMessagesByCreatedAtThenKey(item, anchor) >= 0)
        ?.key;
    },
    [accountServiceMessages, listItems, renderedMessages],
  );
  const stableFirstUnreadUuid = resolveVisibleMessageKey(unreadDividerAnchorUuid);
  const hiddenPageLoadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!accountServiceMessages || visibleListItems.length > 0) {
      hiddenPageLoadRef.current = null;
      return;
    }
    if (
      scrollItems.length === 0 ||
      !initialPositionReady ||
      anchorHandoffPending ||
      anchorNavigationActive ||
      isLoadingOlder ||
      isLoadingNewer
    )
      return;
    const direction = hasNewerMessages ? "newer" : "older";
    let load: (() => void) | undefined;
    if (hasNewerMessages) load = onLoadNewer;
    else if (hasOlderMessages) load = onLoadOlder;
    if (load == null) return;
    const key = `${currentUserUuid}:${conversationId}:${direction}:${scrollItems[0]?.key}:${scrollItems.at(-1)?.key}`;
    if (hiddenPageLoadRef.current === key) return;
    hiddenPageLoadRef.current = key;
    // An invisible page has no scroll surface from which to request the next one.
    load();
  }, [
    accountServiceMessages,
    anchorHandoffPending,
    anchorNavigationActive,
    conversationId,
    currentUserUuid,
    hasNewerMessages,
    hasOlderMessages,
    initialPositionReady,
    isLoadingNewer,
    isLoadingOlder,
    onLoadNewer,
    onLoadOlder,
    scrollItems,
    visibleListItems.length,
  ]);
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
    return {
      ...actions,
      resolveKeyRequestMessage,
      ...(actions?.onOpenWorkspaceMedia != null
        ? { onOpenWorkspaceMedia: handleOpenWorkspaceMedia }
        : {}),
    };
  }, [actions, handleOpenWorkspaceMedia, resolveKeyRequestMessage]);
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
    onUserScrollInput?.();
    tailIntentConversationRef.current = null;
    cancelPendingLatestWindow();
  }, [anchorHandoffPending, cancelPendingLatestWindow, onUserScrollInput]);
  const getMessageKey = useCallback((message: WorkspaceMessageListItem) => message.key, []);
  const isUnreadCandidate = useCallback(
    (message: WorkspaceMessageListItem) => message.kind === "server" && !message.read,
    [],
  );
  const {
    scrollContainerRef,
    handleScroll,
    handleWheel,
    handleTouchMove,
    scrollToBottom,
    isAtBottom,
    isUnreadDividerDismissed,
    refreshMessageLayout,
    preserveMessageLayout,
  } = useWorkspaceMessageListScroll({
    messages: scrollItems,
    conversationId,
    getMessageKey,
    isUnreadCandidate,
    initialPositionReady,
    initialPositionCancelled,
    scrollToBottomKey: scrollRequestKey,
    scrollToBottomAfterSendNonce,
    firstUnreadKey: resolveVisibleMessageKey(firstUnreadUuid),
    unreadCount,
    focusedMessageTarget,
    focusedMessagePending,
    anchorHandoffPending,
    anchorNavigationActive,
    onFocusedMessageApplied,
    onFocusedMessageMissing,
    isLoadingOlder,
    isLoadingNewer,
    hasOlderMessages,
    hasNewerMessages,
    tailOutsideWindow: isKnownTailOutsideWindow,
    onLoadOlder,
    onLoadNewer,
    onUserScrollInput: handleUserScrollInput,
    onPositionIntent: onUserScrollInput,
    onUnreadMessagesVisible,
    onUnreadMessagesAtBottom,
  });
  const {
    isExpanded: isServiceExpanded,
    toggle: toggleServiceGroup,
    layoutKey: expandedServiceKeys,
  } = useServiceMessageExpansion({
    dayGroups,
    items: renderedMessages,
    scope: `${currentUserUuid}:${conversationId}`,
    ready: initialPositionReady,
    liveEnabled:
      initialPositionReady &&
      !anchorHandoffPending &&
      !anchorNavigationActive &&
      !isLoadingNewer &&
      !hasNewerMessages &&
      !isKnownTailOutsideWindow,
    collapseEnabled:
      !anchorHandoffPending && !anchorNavigationActive && !isLoadingOlder && !isLoadingNewer,
    selectionMode,
    focusedMessageTarget,
    currentUserUuid,
    actions: messageActions,
    scrollContainerRef,
    preserveMessageLayout,
  });
  const handleToggleServiceGroup = useCallback(
    (group: WorkspaceMessageAuthorGroup) => {
      handleUserScrollInput();
      toggleServiceGroup(group);
    },
    [handleUserScrollInput, toggleServiceGroup],
  );
  useLayoutEffect(() => {
    refreshMessageLayout();
  }, [refreshMessageLayout, expandedServiceKeys, selectionMode]);
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

  if (visibleListItems.length === 0) {
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
        {requestResolvers}
        <div
          className="flex min-h-[160px] flex-1 items-center justify-center text-sm text-text-muted"
          data-empty-state="true"
        />
      </div>
    );
  }

  return (
    <>
      {requestResolvers}
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
        {dayGroups.map((dayGroup) => {
          const authorGroups = dayGroup.authorGroups.map((authorGroup) => {
            const showUnreadMarker =
              stableFirstUnreadUuid != null &&
              authorGroup.messages.some((message) => message.key === stableFirstUnreadUuid);
            const authorGroupKey =
              authorGroupRenderKeys.get(authorGroup) ??
              authorGroupFallbackRenderKey(dayGroup.dateKey, authorGroup);
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
                  serviceExpanded={isServiceExpanded(authorGroup)}
                  onToggleService={handleToggleServiceGroup}
                  currentUserUuid={currentUserUuid}
                  resolveAuthorLabel={effectiveResolveAuthorLabel}
                  resolveTopicLabel={resolveTopicLabel}
                  showTopicLabels={presentation?.topicLabels === true}
                  resolveMention={resolveMention}
                  quoteRenderMode={presentation?.quoteRenderMode}
                  quickActions={presentation?.quickActions}
                  actions={messageActions}
                  passiveLoadersEnabled={!anchorHandoffPending}
                  selectedMessageUuids={selectedMessageUuids}
                  readRequestBoundariesByTopic={readRequestBoundariesByTopic}
                  selectionMode={selectionMode}
                  usersById={usersById}
                />
              </React.Fragment>
            );
          });

          return (
            <div
              className="flex flex-col gap-2"
              key={`day:${dayGroup.dateKey}`}
              data-day-group="true"
            >
              <div className="sticky top-0 z-sticky flex justify-center py-1">
                <time
                  className="bg-bg-elevated/90 rounded-full border border-border-subtle px-3 py-1 text-xs font-medium text-text-muted backdrop-blur-sm"
                  dateTime={dayGroup.dateKey}
                  data-day-divider={dayGroup.dateKey}
                >
                  {dayLabelsByDateKey.get(dayGroup.dateKey) ?? dayGroup.dateKey}
                </time>
              </div>
              {authorGroups}
            </div>
          );
        })}
      </div>
      {!anchorHandoffPending && (!isAtBottom || isKnownTailOutsideWindow || hasNewerMessages) ? (
        <FloatingScrollToBottomButton onClick={handleScrollToBottom} unreadCount={unreadCount} />
      ) : null}
    </>
  );
};
