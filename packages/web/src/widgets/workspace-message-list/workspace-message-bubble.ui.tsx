import React, { useLayoutEffect, useMemo, useRef } from "react";
import { collectWorkspaceMessageFileReferences } from "~/entities/messenger/messenger-workspace-message-body-files.lib";
import { WorkspaceMessageBody } from "~/entities/messenger/messenger-workspace-message-body.ui";
import { useWorkspaceMessageFilePreviews } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";
import {
  normalizeEmojiShortcodeName,
  resolveShortcodeToUnicode,
} from "~/shared/lib/emoji-shortcodes.lib";
import { invariant } from "~/shared/lib/guards";
import { getJitsiMeetingUrl, type JitsiLinkOptions } from "~/shared/lib/jitsi";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS } from "~/shared/lib/workspace-message-render/workspace-message-render-options.lib";
import { renderWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import { useWorkspaceMessageBodyInteractions } from "./workspace-message-body-interactions.hook";
import { WorkspaceMessageBubbleJitsiCard } from "./workspace-message-bubble-jitsi-card.ui";
import { WorkspaceMessageBubbleMenu } from "./workspace-message-bubble-menu.ui";
import { WorkspaceMessageBubbleMeta } from "./workspace-message-bubble-meta.ui";
import { WorkspaceMessageOutgoingDeliveryIndicator } from "./workspace-message-outgoing-delivery-indicator.ui";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";
import type { WorkspaceMessageListItem } from "./workspace-message-list.types";

type WorkspaceMessageOwner = "own" | "peer";

interface WorkspaceMessageReactionChip {
  key: string;
  emojiName: string;
  displayChar: string;
  count: number;
  reactedByMe: boolean;
}

const WORKSPACE_MESSAGE_BUBBLE_RENDER_OPTIONS = {
  ...DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS,
  enableCodeCopy: true,
  enableProtectedMedia: true,
  enableAttachments: true,
  enableGallery: false,
} as const;

const BASE_BUBBLE_CLASS_NAME =
  "max-w-[min(720px,88%)] rounded-[18px] px-3 py-2 text-sm text-text-primary shadow-sm";
const OWN_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-br-[6px] bg-msg-own-bg`;
const PEER_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-bl-[6px] bg-bg-elevated`;
const COMPACT_OWN_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-r-[10px] bg-msg-own-bg`;
const COMPACT_PEER_BUBBLE_CLASS_NAME = `${BASE_BUBBLE_CLASS_NAME} rounded-l-[10px] bg-bg-elevated`;
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
    .map(([emojiName, count]) => ({
      key: `workspace-reaction:${emojiName}`,
      emojiName,
      displayChar: resolveWorkspaceReactionDisplayChar(emojiName),
      count,
      reactedByMe: message.ownReactionUuidsByEmojiName[emojiName] != null,
    }));
}

interface WorkspaceMessageReactionRowProps {
  message: MessengerMessage;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
}

const WorkspaceMessageReactionRow = React.memo(function WorkspaceMessageReactionRow({
  message,
  onToggleMessageReaction,
}: WorkspaceMessageReactionRowProps): React.ReactElement | null {
  const reactionChips = getWorkspaceReactionChips(message);
  if (reactionChips.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-1">
      {reactionChips.map(({ key, emojiName, displayChar, count, reactedByMe }) => {
        const label = `${displayChar} ${count}`;
        return (
          <button
            type="button"
            key={key}
            data-workspace-message-reaction-chip="true"
            className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-lg border px-2 py-0.5 text-sm transition-colors ${
              reactedByMe
                ? "border-accent/40 bg-accent/15 hover:border-accent/50 hover:bg-accent/25"
                : "bg-bg-elevated/90 border-border-subtle hover:bg-bg-elevated"
            } ${
              onToggleMessageReaction == null
                ? "cursor-default"
                : "cursor-pointer hover:text-text-primary"
            }`}
            title={label}
            aria-label={label}
            disabled={onToggleMessageReaction == null}
            onClick={() => {
              void onToggleMessageReaction?.(message.uuid, emojiName);
            }}
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden leading-none">
              <span className="block text-base leading-none">{displayChar}</span>
            </span>
            <span className="min-w-0 truncate text-[11px] text-text-muted">{count}</span>
          </button>
        );
      })}
    </div>
  );
});

export const WorkspaceMessageBubble: React.FC<WorkspaceMessageBubbleProps> = React.memo(
  function WorkspaceMessageBubble({
    message,
    currentUserUuid,
    isFirstInGroup,
    isLastInGroup,
    isSelected = false,
    selectionMode = false,
    resolveAuthorLabel,
    resolveMention,
    actions,
  }): React.ReactElement {
    const owner = resolveMessageOwner(message, currentUserUuid);
    const isOwn = owner === "own";
    const serverMessage = message.kind === "server" ? message.message : null;
    const outgoingMessage = message.kind === "outgoing" ? message.message : null;
    const displayMessage = serverMessage ?? outgoingMessage;
    invariant(displayMessage != null, "WorkspaceMessageBubble expects message payload");
    const time = formatWorkspaceMessageTime(displayMessage.createdAt);
    const markdown = serverMessage?.payload.content ?? outgoingMessage?.markdown ?? "";
    const jitsiLinkOptions = useMemo<JitsiLinkOptions>(
      () => ({ serverBaseUrl: actions?.jitsiServerBaseUrl }),
      [actions?.jitsiServerBaseUrl],
    );
    const jitsiUrl = useMemo(
      () => getJitsiMeetingUrl(markdown, jitsiLinkOptions),
      [jitsiLinkOptions, markdown],
    );
    const isJitsiCall = jitsiUrl != null;
    const jitsiLocationName = actions?.jitsiLocationName?.trim() ?? "";
    const handleOpenJitsiCall = useMemo(() => {
      if (jitsiUrl == null || actions?.onOpenJitsiCall == null) return undefined;
      return () => {
        actions.onOpenJitsiCall?.(jitsiUrl, jitsiLocationName);
      };
    }, [actions, jitsiLocationName, jitsiUrl]);
    const peerAuthorLabel =
      owner === "peer" && isFirstInGroup
        ? resolvePeerAuthorLabel(
            displayMessage.authorUuid,
            resolveAuthorLabel?.(displayMessage.authorUuid),
          )
        : "";
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
      return {
        ...renderWorkspaceMessageBody(document, {
          ...WORKSPACE_MESSAGE_BUBBLE_RENDER_OPTIONS,
          // Enable interactive mentions only when the current surface exposes a
          // UUID-only callback. Otherwise keep `@Name` as plain text instead of
          // swapping the action back to the old number-based direct-message/profile path.
          enableMentions: actions?.onOpenMentionUser != null,
        }),
        fileReferences: collectWorkspaceMessageFileReferences(document),
      };
    }, [actions?.onOpenMentionUser, markdown, resolveMention]);
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
      enableCodeCopy: WORKSPACE_MESSAGE_BUBBLE_RENDER_OPTIONS.enableCodeCopy,
      fileReferences: renderedBody.fileReferences,
      onOpenMentionUser: actions?.onOpenMentionUser,
      onOpenMessageInChat: actions?.onOpenMessageInChat,
      onOpenWorkspaceReference: actions?.onOpenWorkspaceReference,
      onDownloadFile: actions?.onDownloadFile,
      onOpenWorkspaceMedia: actions?.onOpenWorkspaceMedia,
      onOpenUnsupportedFilePreview: actions?.onOpenUnsupportedFilePreview,
    });
    useWorkspaceMessageFilePreviews({
      bodyRef,
      renderedHtml: renderedBody.html,
      fileReferences: renderedBody.fileReferences,
      onLoadWorkspaceFilePreview: actions?.onLoadWorkspaceFilePreview,
    });
    const metaPlacement =
      isJitsiCall || (serverMessage != null && hasWorkspaceReactions(serverMessage))
        ? "row"
        : renderedBody.metadata.preferredMetaPlacement;
    const useInlineMeta = metaPlacement === "inline";

    useLayoutEffect(() => {
      if (!useInlineMeta) {
        return;
      }

      const bodyElement = bodyRef.current;
      const metaElement = metaRef.current;
      if (bodyElement == null || metaElement == null) {
        return;
      }

      const updateMetaReserve = () => {
        const rect = metaElement.getBoundingClientRect();
        bodyElement.style.setProperty(
          "--workspace-message-bubble-meta-width",
          `${Math.ceil(rect.width)}px`,
        );
        bodyElement.style.setProperty(
          "--workspace-message-bubble-meta-height",
          `${Math.ceil(rect.height)}px`,
        );
      };

      updateMetaReserve();

      if (typeof ResizeObserver === "undefined") {
        window.addEventListener("resize", updateMetaReserve);
        return () => {
          window.removeEventListener("resize", updateMetaReserve);
          bodyElement.style.removeProperty("--workspace-message-bubble-meta-width");
          bodyElement.style.removeProperty("--workspace-message-bubble-meta-height");
        };
      }

      const resizeObserver = new ResizeObserver(updateMetaReserve);
      resizeObserver.observe(metaElement);

      return () => {
        resizeObserver.disconnect();
        bodyElement.style.removeProperty("--workspace-message-bubble-meta-width");
        bodyElement.style.removeProperty("--workspace-message-bubble-meta-height");
      };
    }, [time, useInlineMeta]);
    const containsInteractiveBody =
      isJitsiCall ||
      renderedBody.metadata.hasLinks ||
      (renderedBody.metadata.hasMentions && actions?.onOpenMentionUser != null) ||
      renderedBody.metadata.hasMedia ||
      renderedBody.metadata.hasAttachments ||
      (WORKSPACE_MESSAGE_BUBBLE_RENDER_OPTIONS.enableCodeCopy &&
        renderedBody.metadata.hasCodeBlocks);

    return (
      <div
        className={`group relative ${bubbleClassName}`}
        data-workspace-message-bubble="true"
        data-workspace-message-interactive-body={containsInteractiveBody ? "true" : "false"}
        data-message-owner={owner}
        data-first-in-group={isFirstInGroup ? "true" : "false"}
        data-last-in-group={isLastInGroup ? "true" : "false"}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        role={containsInteractiveBody ? undefined : "button"}
        tabIndex={containsInteractiveBody ? undefined : 0}
      >
        {serverMessage != null ? (
          <WorkspaceMessageBubbleMenu
            message={serverMessage}
            isOwn={isOwn}
            open={menuOpen}
            source={menuSource}
            contextAnchor={contextMenuAnchor}
            onSourceChange={handleMenuSourceChange}
            onOpenChange={handleMenuOpenChange}
            onReplyMessage={actions?.onReplyMessage}
            onAddReplyMessage={actions?.onAddReplyMessage}
            onForwardMessage={actions?.onForwardMessage}
            onOpenMessageInChat={actions?.onOpenMessageInChat}
            onToggleMessageSelection={actions?.onToggleMessageSelection}
            onEditMessage={actions?.onEditMessage}
            onRequestDeleteMessage={actions?.onRequestDeleteMessage}
            onCopyMessageText={actions?.onCopyMessageText}
            onToggleMessageReaction={actions?.onToggleMessageReaction}
            getSelectedText={getSelectedText}
          />
        ) : null}
        {selectionMode && serverMessage != null ? (
          <button
            type="button"
            aria-label={t("message.select")}
            aria-pressed={isSelected}
            className={`absolute top-2 z-base flex h-5 w-5 items-center justify-center rounded border text-[11px] ${
              isOwn
                ? "-left-7 border-accent bg-accent text-bg"
                : "-right-7 border-accent bg-accent text-bg"
            } ${isSelected ? "opacity-100" : "opacity-70"}`}
            onClick={() => actions?.onToggleMessageSelection?.(serverMessage.uuid)}
          >
            {isSelected ? "✓" : ""}
          </button>
        ) : null}
        {peerAuthorLabel.length > 0 ? (
          <div className="mb-1 text-xs font-medium text-text-muted" data-peer-author-label="true">
            {peerAuthorLabel}
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
            deliveryIndicator={
              outgoingMessage == null ? null : (
                <WorkspaceMessageOutgoingDeliveryIndicator
                  message={outgoingMessage}
                  onRetry={actions?.onRetryOutgoingMessage}
                  onRemove={actions?.onRemoveOutgoingMessage}
                />
              )
            }
            onOpenJitsiCall={handleOpenJitsiCall == null ? undefined : actions?.onOpenJitsiCall}
          />
        ) : (
          <WorkspaceMessageBody
            bodyRef={bodyRef}
            html={renderedBody.html}
            metadata={renderedBody.metadata}
            onBodyClick={handleBodyClick}
            useInlineMeta={useInlineMeta}
          />
        )}
        {!isJitsiCall && useInlineMeta ? (
          <>
            {/* This explanatory block is intentionally kept here because the layout
                depends on it. Inline time sits in the lower-right corner of the
                bubble. The empty ::after on the last body block keeps the same
                width, so the last line does not slide under the time label after
                font-size recalculation or a future delivery indicator. */}
            <WorkspaceMessageBubbleMeta
              ref={metaRef}
              time={time}
              createdAt={displayMessage.createdAt}
              placement="inline"
              after={
                outgoingMessage == null ? null : (
                  <WorkspaceMessageOutgoingDeliveryIndicator
                    message={outgoingMessage}
                    onRetry={actions?.onRetryOutgoingMessage}
                    onRemove={actions?.onRemoveOutgoingMessage}
                  />
                )
              }
            />
          </>
        ) : !isJitsiCall ? (
          <div
            className="mt-1 flex min-w-0 items-end justify-between gap-2"
            data-workspace-message-reaction-footer="true"
          >
            {serverMessage != null ? (
              <WorkspaceMessageReactionRow
                message={serverMessage}
                onToggleMessageReaction={actions?.onToggleMessageReaction}
              />
            ) : (
              <span className="min-w-0 flex-1" aria-hidden />
            )}
            {/* This explanatory block is intentionally kept here because the layout
                depends on it. Row placement keeps reactions and time on the same
                baseline while the reaction list wraps within the available width. */}
            <WorkspaceMessageBubbleMeta
              time={time}
              createdAt={displayMessage.createdAt}
              placement="row"
              after={
                outgoingMessage == null ? null : (
                  <WorkspaceMessageOutgoingDeliveryIndicator
                    message={outgoingMessage}
                    onRetry={actions?.onRetryOutgoingMessage}
                    onRemove={actions?.onRemoveOutgoingMessage}
                  />
                )
              }
            />
          </div>
        ) : null}
      </div>
    );
  },
);
