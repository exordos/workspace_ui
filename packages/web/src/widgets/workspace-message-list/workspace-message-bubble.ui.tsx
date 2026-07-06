import React, { useLayoutEffect, useMemo, useRef } from "react";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS } from "~/shared/lib/workspace-message-render/workspace-message-render-options.lib";
import { renderWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import { collectWorkspaceMessageFileReferences } from "./workspace-message-body-files.lib";
import { useWorkspaceMessageBodyInteractions } from "./workspace-message-body-interactions.hook";
import { WorkspaceMessageBody } from "./workspace-message-body.ui";
import { WorkspaceMessageBubbleMenu } from "./workspace-message-bubble-menu.ui";
import { WorkspaceMessageBubbleMeta } from "./workspace-message-bubble-meta.ui";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";

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
  message: MessengerMessage,
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
    resolveAuthorLabel,
    resolveMention,
    actions,
  }): React.ReactElement {
    const owner = resolveMessageOwner(message, currentUserUuid);
    const isOwn = owner === "own";
    const time = formatWorkspaceMessageTime(message.createdAt);
    const peerAuthorLabel =
      owner === "peer" && isFirstInGroup
        ? resolvePeerAuthorLabel(message.authorUuid, resolveAuthorLabel?.(message.authorUuid))
        : "";
    const bubbleClassName = resolveBubbleClassName(owner, isLastInGroup);
    const bodyRef = useRef<HTMLDivElement>(null);
    const metaRef = useRef<HTMLTimeElement>(null);
    const renderedBody = useMemo(() => {
      const document = parseWorkspaceMessageBody(message.markdown, { resolveMention });
      return {
        ...renderWorkspaceMessageBody(document, {
          ...WORKSPACE_MESSAGE_BUBBLE_RENDER_OPTIONS,
          // Упоминания рендерятся интерактивно только если текущая поверхность
          // дала UUID-only callback. Без него оставляем `@Name` обычным текстом,
          // а не подменяем действие старым numeric DM/profile путем.
          enableMentions: actions?.onOpenMentionUser != null,
        }),
        fileReferences: collectWorkspaceMessageFileReferences(document),
      };
    }, [actions?.onOpenMentionUser, message.markdown, resolveMention]);
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
      onOpenUnsupportedFilePreview: actions?.onOpenUnsupportedFilePreview,
    });
    const metaPlacement = hasWorkspaceReactions(message)
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
        <WorkspaceMessageBubbleMenu
          message={message}
          isOwn={isOwn}
          open={menuOpen}
          source={menuSource}
          contextAnchor={contextMenuAnchor}
          onSourceChange={handleMenuSourceChange}
          onOpenChange={handleMenuOpenChange}
          onReplyMessage={actions?.onReplyMessage}
          onEditMessage={actions?.onEditMessage}
          onRequestDeleteMessage={actions?.onRequestDeleteMessage}
          onCopyMessageText={actions?.onCopyMessageText}
          onToggleMessageReaction={actions?.onToggleMessageReaction}
          getSelectedText={getSelectedText}
        />
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
            {/* Inline-время лежит поверх правого нижнего угла bubble. Пустой
                ::after у последнего блока body занимает такую же ширину, поэтому
                последняя строка не заезжает под время даже после пересчета
                размера шрифта или будущего индикатора доставки. */}
            <WorkspaceMessageBubbleMeta
              ref={metaRef}
              time={time}
              createdAt={message.createdAt}
              placement="inline"
            />
          </>
        ) : (
          <div className="mt-1 flex justify-end">
            {/* Для переносов, длинных слов и будущего сложного содержимого не
                угадываем ширину строки. Отдельная строка с временем проще и
                не ломает читаемость текста. */}
            <WorkspaceMessageBubbleMeta time={time} createdAt={message.createdAt} placement="row" />
          </div>
        )}
      </div>
    );
  },
);
