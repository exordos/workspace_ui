import React, { useLayoutEffect, useMemo, useRef } from "react";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";
import { invariant } from "~/shared/lib/guards";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS } from "~/shared/lib/workspace-message-render/workspace-message-render-options.lib";
import { renderWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import { collectWorkspaceMessageFileReferences } from "./workspace-message-body-files.lib";
import { useWorkspaceMessageBodyInteractions } from "./workspace-message-body-interactions.hook";
import { WorkspaceMessageBody } from "./workspace-message-body.ui";
import { WorkspaceMessageBubbleMenu } from "./workspace-message-bubble-menu.ui";
import { WorkspaceMessageBubbleMeta } from "./workspace-message-bubble-meta.ui";
import { useWorkspaceMessageFilePreviews } from "./workspace-message-file-preview.hook";
import { WorkspaceMessageOutgoingDeliveryIndicator } from "./workspace-message-outgoing-delivery-indicator.ui";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";
import type { WorkspaceMessageListItem } from "./workspace-message-list.types";

type WorkspaceMessageOwner = "own" | "peer";

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

function resolveBubbleClassName(owner: WorkspaceMessageOwner, isLastInGroup: boolean): string {
  if (owner === "own") {
    return isLastInGroup ? OWN_BUBBLE_CLASS_NAME : COMPACT_OWN_BUBBLE_CLASS_NAME;
  }

  return isLastInGroup ? PEER_BUBBLE_CLASS_NAME : COMPACT_PEER_BUBBLE_CLASS_NAME;
}

function hasWorkspaceReactions(message: MessengerMessage): boolean {
  return Object.values(message.reactions).some((count) => count > 0);
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
    resolveMention,
    actions,
  }): React.ReactElement {
    const owner = resolveMessageOwner(message, currentUserUuid);
    const isOwn = owner === "own";
    const serverMessage =
      message.kind === "server" ? message.message : (message.resolvedServerMessage ?? null);
    const outgoingMessage = message.kind === "outgoing" ? message.message : null;
    const displayMessage = outgoingMessage ?? serverMessage;
    invariant(displayMessage != null, "WorkspaceMessageBubble expects message payload");
    const time = formatWorkspaceMessageTime(displayMessage.createdAt);
    const markdown = displayMessage.markdown;
    const peerAuthorLabel =
      owner === "peer" && isFirstInGroup
        ? resolvePeerAuthorLabel(
            displayMessage.authorUuid,
            resolveAuthorLabel?.(displayMessage.authorUuid),
          )
        : "";
    const bubbleClassName = `${resolveBubbleClassName(owner, isLastInGroup)} ${
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
      serverMessage != null && hasWorkspaceReactions(serverMessage)
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
        <WorkspaceMessageBody
          bodyRef={bodyRef}
          html={renderedBody.html}
          metadata={renderedBody.metadata}
          onBodyClick={handleBodyClick}
          useInlineMeta={useInlineMeta}
        />
        {useInlineMeta ? (
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
        ) : (
          <div className="mt-1 flex justify-end">
            {/* This explanatory block is intentionally kept here because the layout
                depends on it. For wraps, long words, and future complex content,
                do not guess the line width. A separate time row is simpler and
                keeps the text readable. */}
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
        )}
      </div>
    );
  },
);
