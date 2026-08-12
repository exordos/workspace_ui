import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { collectWorkspaceMessageFileReferences } from "~/entities/messenger/messenger-workspace-message-body-files.lib";
import { WorkspaceMessageBody } from "~/entities/messenger/messenger-workspace-message-body.ui";
import { useWorkspaceMessageFilePreviews } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import type { UsersById } from "~/entities/user/user.types";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import {
  normalizeEmojiShortcodeName,
  resolveShortcodeToUnicode,
} from "~/shared/lib/emoji-shortcodes.lib";
import { invariant } from "~/shared/lib/guards";
import { getJitsiMeetingUrl, type JitsiLinkOptions } from "~/shared/lib/jitsi";
import type { WorkspaceMessageBodyQuoteSegment } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS } from "~/shared/lib/workspace-message-render/workspace-message-render-options.lib";
import { renderWorkspaceMessageBodySegments } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import { WorkspaceMessageQuoteFrame } from "~/shared/ui/workspace-message-quote-frame.ui";
import { useWorkspaceMessageBodyInteractions } from "./workspace-message-body-interactions.hook";
import { useWorkspaceMessageInlineMeta } from "./workspace-message-bubble-inline-meta.hook";
import { WorkspaceMessageBubbleJitsiCard } from "./workspace-message-bubble-jitsi-card.ui";
import { WorkspaceMessageBubbleMenu } from "./workspace-message-bubble-menu.ui";
import { WorkspaceMessageBubbleMeta } from "./workspace-message-bubble-meta.ui";
import { WorkspaceMessageOutgoingDeliveryIndicator } from "./workspace-message-outgoing-delivery-indicator.ui";
import { WorkspaceMessageQuote } from "./workspace-message-quote.ui";
import { WorkspaceMessageTopicLink } from "./workspace-message-topic-link.ui";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";
import type { WorkspaceMessageListItem } from "./workspace-message-list.types";

type WorkspaceMessageOwner = "own" | "peer";

interface WorkspaceMessageReactionChip {
  key: string;
  emojiName: string;
  displayChar: string;
  count: number;
  reactedByMe: boolean;
  pending: boolean;
  userUuids: readonly MessengerUuid[] | null;
}

const WORKSPACE_MESSAGE_BUBBLE_RENDER_OPTIONS = {
  ...DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS,
  enableCodeCopy: true,
  enableProtectedMedia: true,
  enableAttachments: true,
  enableGallery: false,
} as const;

const WORKSPACE_MESSAGE_PREVIEW_RENDER_OPTIONS = {
  ...DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS,
  enableCodeCopy: false,
  enableProtectedMedia: false,
  enableAttachments: false,
  enableGallery: false,
} as const;

const BASE_BUBBLE_CLASS_NAME =
  "max-w-[88%] rounded-[18px] px-3 py-2 text-sm text-text-primary shadow-sm";
const OWN_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-br-[6px] bg-msg-own-bg`;
// Peer bubbles use msg-bg (aligned with card-bg chrome in dark palettes)
const PEER_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-bl-[6px] bg-msg-bg`;
const COMPACT_OWN_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-r-[10px] bg-msg-own-bg`;
const COMPACT_PEER_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-l-[10px] bg-msg-bg`;
const JITSI_OWN_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-br-[6px] bg-msg-call-bg`;
const JITSI_PEER_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-bl-[6px] bg-msg-call-bg`;
const COMPACT_JITSI_OWN_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-r-[10px] bg-msg-call-bg`;
const COMPACT_JITSI_PEER_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-l-[10px] bg-msg-call-bg`;

function resolveMessageOwner(
  message: WorkspaceMessageListItem,
  currentUserUuid: MessengerUuid,
): WorkspaceMessageOwner {
  return message.authorUuid === currentUserUuid || message.isOwn ? "own" : "peer";
}

function formatWorkspaceMessageTime(createdAt: string): string {
  const timestamp = Date.parse(createdAt);

  if (Number.isNaN(timestamp)) {
    return createdAt.slice(11, 16);
  }

  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();

  return `${hours < 10 ? "0" : ""}${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
}

function resolvePeerAuthorLabel(
  authorUuid: MessengerUuid,
  resolvedAuthorLabel: string | null | undefined,
): string {
  const authorLabel = resolvedAuthorLabel?.trim() ?? "";

  if (authorLabel.length > 0) {
    return authorLabel;
  }

  const safeUuidPart = authorUuid.trim().slice(0, 8);

  return safeUuidPart.length > 0 ? `#${safeUuidPart}` : "";
}

function resolveBubbleClassName(
  owner: WorkspaceMessageOwner,
  isLastInGroup: boolean,
  isJitsiCall: boolean,
): string {
  if (isJitsiCall) {
    if (owner === "own") {
      return isLastInGroup ? JITSI_OWN_BUBBLE_CLASS_NAME : COMPACT_JITSI_OWN_BUBBLE_CLASS_NAME;
    }

    return isLastInGroup ? JITSI_PEER_BUBBLE_CLASS_NAME : COMPACT_JITSI_PEER_BUBBLE_CLASS_NAME;
  }

  if (owner === "own") {
    return isLastInGroup ? OWN_BUBBLE_CLASS_NAME : COMPACT_OWN_BUBBLE_CLASS_NAME;
  }

  return isLastInGroup ? PEER_BUBBLE_CLASS_NAME : COMPACT_PEER_BUBBLE_CLASS_NAME;
}

function hasWorkspaceReactions(message: MessengerMessage): boolean {
  return Object.values(message.reactions).some((count) => count > 0);
}

function resolveWorkspaceReactionDisplayChar(emojiName: string): string {
  const normalizedEmojiName = normalizeEmojiShortcodeName(emojiName);
  if (normalizedEmojiName.length === 0) {
    return emojiName;
  }

  return resolveShortcodeToUnicode(normalizedEmojiName) ?? `:${normalizedEmojiName}:`;
}

function getWorkspaceReactionChips(message: MessengerMessage): WorkspaceMessageReactionChip[] {
  return Object.entries(message.reactions)
    .filter(([emojiName, count]) => emojiName.trim().length > 0 && count > 0)
    .sort(([leftEmojiName], [rightEmojiName]) => leftEmojiName.localeCompare(rightEmojiName))
    .map(([emojiName, count]) => {
      const pendingOperation = message.pendingOwnReactionsByEmojiName?.[emojiName]?.operation;
      const serverUserUuids = message.reactionUserUuidsByEmojiName[emojiName];
      const hasOptimisticUserUuids =
        message.optimisticReactionUserUuidsByEmojiName != null &&
        Object.hasOwn(message.optimisticReactionUserUuidsByEmojiName, emojiName);
      const effectiveUserUuids = hasOptimisticUserUuids
        ? message.optimisticReactionUserUuidsByEmojiName?.[emojiName]
        : serverUserUuids;
      return {
        key: `workspace-reaction:${emojiName}`,
        emojiName,
        displayChar: resolveWorkspaceReactionDisplayChar(emojiName),
        count,
        reactedByMe:
          pendingOperation === "add" ||
          (pendingOperation !== "remove" && message.ownReactionUuidsByEmojiName[emojiName] != null),
        pending: pendingOperation != null,
        userUuids: effectiveUserUuids?.length === count ? effectiveUserUuids : null,
      };
    });
}

function resolveReactionUserLabel(userUuid: MessengerUuid, usersById: UsersById): string {
  return selectUserDisplayName(usersById[userUuid], `#${userUuid.slice(0, 8)}`);
}

interface WorkspaceMessageReactionRowProps {
  message: MessengerMessage;
  usersById: UsersById;
  passiveLoadersEnabled: boolean;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
}

const WorkspaceMessageReactionRow = React.memo(function WorkspaceMessageReactionRow({
  message,
  usersById,
  passiveLoadersEnabled,
  onToggleMessageReaction,
}: WorkspaceMessageReactionRowProps): React.ReactElement | null {
  const reactionChips = getWorkspaceReactionChips(message);
  if (reactionChips.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-1">
      {reactionChips.map(
        ({ key, emojiName, displayChar, count, reactedByMe, pending, userUuids }) => {
          const userLabels = userUuids?.map((userUuid) =>
            resolveReactionUserLabel(userUuid, usersById),
          );
          const label =
            userLabels == null
              ? `${displayChar} ${count}`
              : `${displayChar} ${userLabels.join(", ")}`;
          return (
            <button
              type="button"
              key={key}
              data-workspace-message-reaction-chip="true"
              data-workspace-message-reaction-pending={pending ? "true" : "false"}
              className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-lg border px-2 py-0.5 text-sm transition-colors ${
                reactedByMe
                  ? "border-accent/40 bg-accent/15 hover:border-accent/50 hover:bg-accent/25"
                  : "border-border-subtle bg-card-bg hover:bg-card-bg-active"
              } ${
                pending
                  ? "cursor-wait"
                  : onToggleMessageReaction == null
                    ? "cursor-default"
                    : "cursor-pointer hover:text-text-primary"
              }`}
              title={label}
              aria-label={label}
              aria-busy={pending}
              aria-pressed={reactedByMe}
              disabled={onToggleMessageReaction == null || pending}
              onClick={() => {
                void onToggleMessageReaction?.(message.uuid, emojiName);
              }}
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden leading-none">
                <span className="block text-base leading-none">{displayChar}</span>
              </span>
              {userUuids == null ? (
                <span className="min-w-0 truncate text-[11px] text-text-muted">{count}</span>
              ) : (
                <span className="flex -space-x-1" data-workspace-reaction-user-list="true">
                  {userUuids.map((userUuid) => {
                    const user = usersById[userUuid];
                    const userLabel = resolveReactionUserLabel(userUuid, usersById);
                    return (
                      <span
                        key={userUuid}
                        data-reaction-user-uuid={userUuid}
                        title={userLabel}
                        className="rounded-full ring-1 ring-border-subtle"
                      >
                        <WorkspaceAvatar
                          size="xs"
                          imageLoading="eager"
                          className="!h-5 !w-5 !text-[9px]"
                          avatarUrn={passiveLoadersEnabled ? user?.avatarUrl : null}
                        >
                          {userLabel.slice(0, 1)}
                        </WorkspaceAvatar>
                      </span>
                    );
                  })}
                </span>
              )}
            </button>
          );
        },
      )}
    </div>
  );
});

interface WorkspaceMessageBubbleFooterProps {
  isJitsiCall: boolean;
  useInlineMeta: boolean;
  metaRef: React.RefObject<HTMLSpanElement | null>;
  time: string;
  createdAt: string;
  deliveryIndicator: React.ReactNode;
  serverMessage: MessengerMessage | null;
  usersById: UsersById;
  passiveLoadersEnabled: boolean;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
}

function WorkspaceMessageBubbleFooter({
  isJitsiCall,
  useInlineMeta,
  metaRef,
  time,
  createdAt,
  deliveryIndicator,
  serverMessage,
  usersById,
  passiveLoadersEnabled,
  onToggleMessageReaction,
}: Readonly<WorkspaceMessageBubbleFooterProps>): React.ReactElement | null {
  if (isJitsiCall) return null;

  if (useInlineMeta) {
    return (
      <WorkspaceMessageBubbleMeta
        ref={metaRef}
        time={time}
        createdAt={createdAt}
        placement="inline"
        after={deliveryIndicator}
      />
    );
  }

  return (
    <div
      className="mt-1 flex min-w-0 items-end justify-between gap-2"
      data-workspace-message-reaction-footer="true"
    >
      {serverMessage != null ? (
        <WorkspaceMessageReactionRow
          message={serverMessage}
          usersById={usersById}
          passiveLoadersEnabled={passiveLoadersEnabled}
          onToggleMessageReaction={onToggleMessageReaction}
        />
      ) : (
        <span className="min-w-0 flex-1" aria-hidden />
      )}
      <WorkspaceMessageBubbleMeta
        time={time}
        createdAt={createdAt}
        placement="row"
        after={deliveryIndicator}
      />
    </div>
  );
}

export const WorkspaceMessageBubble: React.FC<WorkspaceMessageBubbleProps> = React.memo(
  function WorkspaceMessageBubble({
    message,
    currentUserUuid,
    isFirstInGroup,
    isLastInGroup,
    isSelected = false,
    selectionMode = false,
    resolveAuthorLabel,
    usersById,
    topicLabel,
    resolveMention,
    quoteRenderMode,
    actions,
    presentationMode = "message",
    passiveLoadersEnabled = true,
  }): React.ReactElement {
    const isPreview = presentationMode === "preview";
    const interactiveActions = isPreview ? undefined : actions;
    const passiveContentEnabled = !isPreview && passiveLoadersEnabled;
    const owner = resolveMessageOwner(message, currentUserUuid);
    const isOwn = owner === "own";
    const serverMessage = message.kind === "server" ? message.message : null;
    const interactiveServerMessage = isPreview ? null : serverMessage;
    const outgoingMessage = message.kind === "outgoing" ? message.message : null;
    const displayMessage = serverMessage ?? outgoingMessage;
    invariant(displayMessage != null, "WorkspaceMessageBubble expects message payload");
    const time = formatWorkspaceMessageTime(displayMessage.createdAt);
    const markdown = serverMessage?.payload.content ?? outgoingMessage?.markdown ?? "";
    const jitsiLinkOptions = useMemo<JitsiLinkOptions>(
      () => ({ serverBaseUrl: interactiveActions?.jitsiServerBaseUrl }),
      [interactiveActions?.jitsiServerBaseUrl],
    );
    const jitsiUrl = useMemo(
      () => getJitsiMeetingUrl(markdown, jitsiLinkOptions),
      [jitsiLinkOptions, markdown],
    );
    const isJitsiCall = jitsiUrl != null;
    const jitsiLocationName = interactiveActions?.jitsiLocationName?.trim() ?? "";
    const handleOpenJitsiCall = useMemo(() => {
      if (jitsiUrl == null || interactiveActions?.onOpenJitsiCall == null) return undefined;
      return () => {
        interactiveActions.onOpenJitsiCall?.(jitsiUrl, jitsiLocationName);
      };
    }, [interactiveActions, jitsiLocationName, jitsiUrl]);
    const peerAuthorLabel =
      owner === "peer" && isFirstInGroup
        ? resolvePeerAuthorLabel(
            displayMessage.authorUuid,
            resolveAuthorLabel?.(displayMessage.authorUuid),
          )
        : "";
    const normalizedTopicLabel = isFirstInGroup ? (topicLabel?.trim() ?? "") : "";
    const authorLabel = resolvePeerAuthorLabel(
      displayMessage.authorUuid,
      resolveAuthorLabel?.(displayMessage.authorUuid),
    );
    const bubbleClassName = `${resolveBubbleClassName(owner, isLastInGroup, isJitsiCall)} ${
      isSelected ? "ring-2 ring-accent-soft" : ""
    }`;
    const bodyRef = useRef<HTMLDivElement>(null);
    const metaRef = useRef<HTMLSpanElement>(null);
    const renderedBody = useMemo(() => {
      const document = parseWorkspaceMessageBody(markdown, { resolveMention });
      const segmented = renderWorkspaceMessageBodySegments(document, {
        ...(isPreview
          ? WORKSPACE_MESSAGE_PREVIEW_RENDER_OPTIONS
          : WORKSPACE_MESSAGE_BUBBLE_RENDER_OPTIONS),
        // Enable interactive mentions only when the current surface exposes a
        // UUID-only callback. Otherwise keep `@Name` as plain text instead of
        // swapping the action back to the old number-based direct-message/profile path.
        enableMentions: interactiveActions?.onOpenMentionUser != null,
      });
      return {
        ...segmented,
        hasQuoteSegments: segmented.segments.some((segment) => segment.kind === "quote"),
        html: segmented.segments
          .filter((segment) => segment.kind === "html")
          .map((segment) => segment.html)
          .join(""),
        // Concatenated html alone cannot tell "tail" from "quote + same tail",
        // while React replaces the tail paragraph between those two variants.
        structureKey: segmented.segments
          .map((segment) =>
            segment.kind === "html" ? `h:${segment.html}` : `q:${segment.reference.messageUuid}`,
          )
          .join("\u0000"),
        fileReferences: collectWorkspaceMessageFileReferences(document),
      };
    }, [interactiveActions?.onOpenMentionUser, isPreview, markdown, resolveMention]);
    const fileReferences = passiveContentEnabled ? renderedBody.fileReferences : [];
    const {
      menuOpen,
      menuSource,
      contextMenuAnchor,
      getSelectedText,
      handleBodyClick,
      handleContextMenu,
      handleKeyDown,
      handleMenuOpenChange,
      handleMenuSourceChange,
    } = useWorkspaceMessageBodyInteractions({
      bodyRef,
      renderedHtml: renderedBody.html,
      enableCodeCopy: !isPreview && WORKSPACE_MESSAGE_BUBBLE_RENDER_OPTIONS.enableCodeCopy,
      fileReferences,
      onOpenMentionUser: interactiveActions?.onOpenMentionUser,
      onOpenMessageInChat: interactiveActions?.onOpenMessageInChat,
      onOpenWorkspaceReference: interactiveActions?.onOpenWorkspaceReference,
      onDownloadFile: interactiveActions?.onDownloadFile,
      onOpenWorkspaceMedia: interactiveActions?.onOpenWorkspaceMedia,
      onOpenUnsupportedFilePreview: interactiveActions?.onOpenUnsupportedFilePreview,
    });
    useWorkspaceMessageFilePreviews({
      bodyRef,
      renderedHtml: renderedBody.html,
      fileReferences,
      onLoadWorkspaceFilePreview: passiveContentEnabled
        ? interactiveActions?.onLoadWorkspaceFilePreview
        : undefined,
    });
    useLayoutEffect(() => {
      if (!isPreview || bodyRef.current == null) return;
      for (const spoiler of bodyRef.current.querySelectorAll(".spoiler-block, .inline-spoiler")) {
        spoiler.classList.add("open");
      }
      for (const header of bodyRef.current.querySelectorAll(".spoiler-header")) {
        header.removeAttribute("role");
        header.removeAttribute("tabindex");
      }
    }, [isPreview, renderedBody.structureKey]);
    const preferInlineMeta =
      !isJitsiCall &&
      !(serverMessage != null && hasWorkspaceReactions(serverMessage)) &&
      renderedBody.metadata.preferredMetaPlacement === "inline";
    const useInlineMeta = useWorkspaceMessageInlineMeta({
      bodyRef,
      metaRef,
      preferInline: preferInlineMeta,
      contentKey: renderedBody.structureKey,
    });
    const renderQuote = useCallback(
      (segment: WorkspaceMessageBodyQuoteSegment): React.ReactNode =>
        isPreview ? (
          <WorkspaceMessageQuoteFrame header={segment.reference.fallbackAuthorLabel}>
            {segment.reference.selectedText}
          </WorkspaceMessageQuoteFrame>
        ) : (
          <WorkspaceMessageQuote
            reference={segment.reference}
            mode={quoteRenderMode}
            visitedMessageUuids={serverMessage == null ? undefined : new Set([serverMessage.uuid])}
            resolveMention={resolveMention}
            onOpenMessage={interactiveActions?.onOpenMessageInChat}
            loadEnabled={passiveContentEnabled}
          />
        ),
      [
        interactiveActions?.onOpenMessageInChat,
        isPreview,
        quoteRenderMode,
        resolveMention,
        serverMessage,
        passiveContentEnabled,
      ],
    );

    const containsInteractiveBody =
      isJitsiCall ||
      renderedBody.metadata.hasLinks ||
      (renderedBody.metadata.hasMentions && interactiveActions?.onOpenMentionUser != null) ||
      renderedBody.metadata.hasMedia ||
      renderedBody.metadata.hasAttachments ||
      renderedBody.hasQuoteSegments ||
      (!isPreview &&
        WORKSPACE_MESSAGE_BUBBLE_RENDER_OPTIONS.enableCodeCopy &&
        renderedBody.metadata.hasCodeBlocks);
    const deliveryIndicator =
      outgoingMessage == null ? null : (
        <WorkspaceMessageOutgoingDeliveryIndicator
          message={outgoingMessage}
          onRetry={interactiveActions?.onRetryOutgoingMessage}
          onRemove={interactiveActions?.onRemoveOutgoingMessage}
        />
      );

    return (
      // Focus keeps Shift+F10 context-menu access. A button role would falsely imply primary-click behavior.
      <div
        className={`group relative ${bubbleClassName}`}
        data-workspace-message-bubble="true"
        data-workspace-message-interactive-body={containsInteractiveBody ? "true" : "false"}
        data-message-owner={owner}
        data-first-in-group={isFirstInGroup ? "true" : "false"}
        data-last-in-group={isLastInGroup ? "true" : "false"}
        onContextMenu={isPreview ? undefined : handleContextMenu}
        onKeyDown={isPreview ? undefined : handleKeyDown}
        tabIndex={isPreview || containsInteractiveBody ? undefined : 0}
      >
        {interactiveServerMessage != null ? (
          <WorkspaceMessageBubbleMenu
            message={interactiveServerMessage}
            isOwn={isOwn}
            open={menuOpen}
            source={menuSource}
            contextAnchor={contextMenuAnchor}
            onSourceChange={handleMenuSourceChange}
            onOpenChange={handleMenuOpenChange}
            onReplyMessage={interactiveActions?.onReplyMessage}
            onAddReplyMessage={interactiveActions?.onAddReplyMessage}
            onForwardMessage={interactiveActions?.onForwardMessage}
            onToggleMessageSelection={interactiveActions?.onToggleMessageSelection}
            onEditMessage={interactiveActions?.onEditMessage}
            onRequestDeleteMessage={interactiveActions?.onRequestDeleteMessage}
            onCopyMessageText={interactiveActions?.onCopyMessageText}
            onToggleMessageReaction={interactiveActions?.onToggleMessageReaction}
            getSelectedText={getSelectedText}
          />
        ) : null}
        {selectionMode && interactiveServerMessage != null ? (
          <button
            type="button"
            aria-label={t("message.select")}
            aria-pressed={isSelected}
            className={`absolute top-2 z-base flex h-5 w-5 items-center justify-center rounded border text-[11px] ${
              isOwn
                ? "-left-7 border-accent bg-accent text-bg"
                : "-right-7 border-accent bg-accent text-bg"
            } ${isSelected ? "opacity-100" : "opacity-70"}`}
            onClick={() =>
              interactiveActions?.onToggleMessageSelection?.(interactiveServerMessage.uuid)
            }
          >
            {isSelected ? "✓" : ""}
          </button>
        ) : null}
        {peerAuthorLabel.length > 0 || normalizedTopicLabel.length > 0 ? (
          <div className="mb-1 flex min-w-0 items-baseline gap-1.5 text-xs font-medium">
            {peerAuthorLabel.length > 0 && interactiveActions?.onOpenAuthorProfile != null ? (
              <button
                type="button"
                className="min-w-0 truncate rounded-sm text-text-muted transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                data-peer-author-label="true"
                aria-label={t("a11y.openUserProfile", { name: peerAuthorLabel })}
                onClick={() => interactiveActions.onOpenAuthorProfile?.(displayMessage.authorUuid)}
              >
                {peerAuthorLabel}
              </button>
            ) : peerAuthorLabel.length > 0 ? (
              <span className="min-w-0 truncate text-text-muted" data-peer-author-label="true">
                {peerAuthorLabel}
              </span>
            ) : null}
            {normalizedTopicLabel.length > 0 ? (
              // accent (not accent-soft): soft is a wash bg and disappears on bubbles across palettes
              <span className="min-w-0 truncate text-accent" data-topic-label="true">
                <WorkspaceMessageTopicLink
                  label={normalizedTopicLabel}
                  streamUuid={displayMessage.streamUuid}
                  topicUuid={displayMessage.topicUuid}
                  onOpenWorkspaceReference={interactiveActions?.onOpenWorkspaceReference}
                />
              </span>
            ) : null}
          </div>
        ) : null}
        {isJitsiCall ? (
          <WorkspaceMessageBubbleJitsiCard
            messageKey={message.key}
            authorLabel={authorLabel}
            jitsiUrl={jitsiUrl}
            jitsiLinkOptions={jitsiLinkOptions}
            locationName={jitsiLocationName}
            isOwn={isOwn}
            time={time}
            createdAt={displayMessage.createdAt}
            deliveryIndicator={deliveryIndicator}
            onOpenJitsiCall={
              handleOpenJitsiCall == null ? undefined : interactiveActions?.onOpenJitsiCall
            }
            interactive={!isPreview}
          />
        ) : (
          <WorkspaceMessageBody
            bodyRef={bodyRef}
            html={renderedBody.html}
            segments={renderedBody.hasQuoteSegments ? renderedBody.segments : undefined}
            renderQuote={renderQuote}
            metadata={renderedBody.metadata}
            onBodyClick={isPreview ? undefined : handleBodyClick}
            useInlineMeta={useInlineMeta}
          />
        )}
        <WorkspaceMessageBubbleFooter
          isJitsiCall={isJitsiCall}
          useInlineMeta={useInlineMeta}
          metaRef={metaRef}
          time={time}
          createdAt={displayMessage.createdAt}
          deliveryIndicator={deliveryIndicator}
          serverMessage={serverMessage}
          usersById={usersById}
          passiveLoadersEnabled={passiveContentEnabled}
          onToggleMessageReaction={interactiveActions?.onToggleMessageReaction}
        />
      </div>
    );
  },
);
