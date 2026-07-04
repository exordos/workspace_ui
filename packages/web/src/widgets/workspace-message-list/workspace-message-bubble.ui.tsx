import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import { WorkspaceMessageBubbleMenu } from "./workspace-message-bubble-menu.ui";
import { resolveWorkspaceBubbleMetaPlacement } from "./workspace-message-bubble-meta-placement.lib";
import { WorkspaceMessageBubbleMeta } from "./workspace-message-bubble-meta.ui";
import type {
  WorkspaceMessageBubbleMenuAnchor,
  WorkspaceMessageBubbleMenuSource,
} from "./workspace-message-bubble-menu.types";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";

type WorkspaceMessageOwner = "own" | "peer";

const MESSAGE_CONTEXT_MENU_CURSOR_GAP_PX = 6;

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
    actions,
  }): React.ReactElement {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuSource, setMenuSource] = useState<WorkspaceMessageBubbleMenuSource>("trigger");
    const [contextMenuAnchor, setContextMenuAnchor] =
      useState<WorkspaceMessageBubbleMenuAnchor | null>(null);
    const owner = resolveMessageOwner(message, currentUserUuid);
    const isOwn = owner === "own";
    const time = formatWorkspaceMessageTime(message.createdAt);
    const peerAuthorLabel =
      owner === "peer" && isFirstInGroup
        ? resolvePeerAuthorLabel(message.authorUuid, resolveAuthorLabel?.(message.authorUuid))
        : "";
    const bubbleClassName = resolveBubbleClassName(owner, isLastInGroup);
    const metaPlacement = resolveWorkspaceBubbleMetaPlacement({
      text: message.markdown,
      hasReactions: hasWorkspaceReactions(message),
    });
    const useInlineMeta = metaPlacement === "inline";
    const textRef = useRef<HTMLParagraphElement>(null);
    const metaRef = useRef<HTMLTimeElement>(null);
    const getSelectedText = useCallback((): string | undefined => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      const anchorNode = selection?.anchorNode;
      const focusNode = selection?.focusNode;
      const textElement = textRef.current;
      if (
        selectedText == null ||
        selectedText.length === 0 ||
        textElement == null ||
        anchorNode == null ||
        focusNode == null ||
        !textElement.contains(anchorNode.parentElement ?? anchorNode) ||
        !textElement.contains(focusNode.parentElement ?? focusNode)
      ) {
        return undefined;
      }

      return selectedText;
    }, []);
    const openTriggerMenu = useCallback(() => {
      setContextMenuAnchor(null);
      setMenuSource("trigger");
      setMenuOpen(true);
    }, []);
    const openContextMenuAt = useCallback((clientX: number, clientY: number) => {
      setContextMenuAnchor({
        left: clientX + MESSAGE_CONTEXT_MENU_CURSOR_GAP_PX,
        top: clientY,
      });
      setMenuSource("context");
      setMenuOpen(true);
    }, []);
    const handleContextMenu = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        openContextMenuAt(event.clientX, event.clientY);
      },
      [openContextMenuAt],
    );
    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const isKeyboardContextMenu =
          event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
        if (!isKeyboardContextMenu) return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          target.closest("a,button,input,textarea,select,[contenteditable='true']")
        ) {
          return;
        }
        event.preventDefault();
        openTriggerMenu();
      },
      [openTriggerMenu],
    );
    const handleMenuOpenChange = useCallback((nextOpen: boolean) => {
      setMenuOpen(nextOpen);
      if (!nextOpen) {
        setContextMenuAnchor(null);
      }
    }, []);
    const handleMenuSourceChange = useCallback((nextSource: WorkspaceMessageBubbleMenuSource) => {
      setMenuSource(nextSource);
      if (nextSource === "trigger") {
        setContextMenuAnchor(null);
      }
    }, []);

    useLayoutEffect(() => {
      if (!useInlineMeta) {
        return;
      }

      const textElement = textRef.current;
      const metaElement = metaRef.current;
      if (textElement == null || metaElement == null) {
        return;
      }

      const updateMetaReserve = () => {
        const rect = metaElement.getBoundingClientRect();
        textElement.style.setProperty(
          "--workspace-message-bubble-meta-width",
          `${Math.ceil(rect.width)}px`,
        );
        textElement.style.setProperty(
          "--workspace-message-bubble-meta-height",
          `${Math.ceil(rect.height)}px`,
        );
      };

      updateMetaReserve();

      if (typeof ResizeObserver === "undefined") {
        window.addEventListener("resize", updateMetaReserve);
        return () => {
          window.removeEventListener("resize", updateMetaReserve);
          textElement.style.removeProperty("--workspace-message-bubble-meta-width");
          textElement.style.removeProperty("--workspace-message-bubble-meta-height");
        };
      }

      const resizeObserver = new ResizeObserver(updateMetaReserve);
      resizeObserver.observe(metaElement);

      return () => {
        resizeObserver.disconnect();
        textElement.style.removeProperty("--workspace-message-bubble-meta-width");
        textElement.style.removeProperty("--workspace-message-bubble-meta-height");
      };
    }, [time, useInlineMeta]);

    return (
      <div
        role="button"
        className={`group relative ${bubbleClassName}`}
        data-workspace-message-bubble="true"
        data-message-owner={owner}
        data-first-in-group={isFirstInGroup ? "true" : "false"}
        data-last-in-group={isLastInGroup ? "true" : "false"}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        tabIndex={0}
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
        {/* React сам экранирует текстовые узлы, а whitespace-pre-wrap сохраняет
            переносы строк. Поэтому новый Workspace bubble не запускает старый
            HTML-рендер, не ищет Zulip-mentions и не превращает текст в медиа. */}
        <p
          ref={textRef}
          className={`whitespace-pre-wrap break-words ${
            useInlineMeta ? "workspace-message-bubble-inline-text" : ""
          }`}
          data-message-plain-text="true"
        >
          {message.markdown}
        </p>
        {useInlineMeta ? (
          <>
            {/* Inline-время лежит поверх правого нижнего угла bubble. Пустой
                ::after у текста заранее занимает такую же ширину, поэтому
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
