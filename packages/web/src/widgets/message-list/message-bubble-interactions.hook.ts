import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useDownloadStore } from "~/entities/download/download.model";
import type { MessageReactionPayload, MockMessage } from "~/shared/api/zulip.types";
import { extractUserUploadPath } from "./message-attachment-download.lib";
import {
  captureReplySelectionForContextMenu,
  executeMessageBubbleMenuAction,
  handleMessageBodyClick,
  resolveMessageBodyClickHit,
  type MessageBubbleMentionPopoverState,
} from "./message-bubble-actions.lib";
import {
  MESSAGE_BUBBLE_ATTACHMENT_LINK_BASE_CLASSES,
  MESSAGE_BUBBLE_ATTACHMENT_LINK_STATUS_CLASSES,
} from "./message-bubble-attachment-styles.lib";
import { mountCodeCopyButtons, teardownCodeCopyButtons } from "./message-bubble-code-copy.lib";
import { reactionPayloadFromEmojiClickData } from "./message-bubble-emoji.lib";
import type {
  MessageBubbleContextMenuAnchor,
  MessageBubbleContextMenuSource,
} from "./message-bubble-context-menu.types";
import type { ContextItemLabel } from "./message-bubble-context.lib";
import type {
  MessageBubbleAttachmentDownloadStatus,
  MessageBubbleCallbacks,
} from "./message-bubble.types";
import type { MessageMediaGallery } from "./message-list-media.lib";
import type { EmojiClickData } from "emoji-picker-react";

const MESSAGE_CONTEXT_MENU_CURSOR_GAP_PX = 6;
const LONG_PRESS_MS = 500;

export interface UseMessageBubbleInteractionsParams {
  message: MockMessage;
  messageContent: string;
  safeMessageHtml: string;
  inSenderGroup: boolean;
  jitsiUrl: string | null;
  jitsiLocationName: string;
  mediaGallery?: MessageMediaGallery;
  callbacks?: MessageBubbleCallbacks;
  onEmojiPickerOpen?: () => void;
  messageBodyRef: RefObject<HTMLDivElement | null>;
  linkPreviewVisibilityRef: RefObject<HTMLDivElement | null>;
  groupedContainerRef: RefObject<HTMLDivElement | null>;
  regularContainerRef: RefObject<HTMLDivElement | null>;
}

export interface UseMessageBubbleInteractionsResult {
  messageBodyRef: React.RefObject<HTMLDivElement | null>;
  linkPreviewVisibilityRef: React.RefObject<HTMLDivElement | null>;
  groupedContainerRef: React.RefObject<HTMLDivElement | null>;
  regularContainerRef: React.RefObject<HTMLDivElement | null>;
  menuOpen: boolean;
  menuSource: MessageBubbleContextMenuSource;
  contextMenuAnchor: MessageBubbleContextMenuAnchor | null;
  emojiPickerOpen: boolean;
  mentionPopover: MessageBubbleMentionPopoverState | null;
  closeMentionPopover: () => void;
  handleKeyboardContextMenu: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  handleContextMenuSourceChange: (nextSource: MessageBubbleContextMenuSource) => void;
  handleContextMenuOpenChange: (nextOpen: boolean) => void;
  handleMenuAction: (label: ContextItemLabel) => void;
  handleQuickReaction: (emojiName: string) => void;
  handleEmojiPick: (data: EmojiClickData) => void;
  handleEmojiPickerOpenChange: (nextOpen: boolean) => void;
}

export function useMessageBubbleInteractions({
  message,
  messageContent,
  safeMessageHtml,
  inSenderGroup,
  jitsiUrl,
  jitsiLocationName,
  mediaGallery,
  callbacks,
  onEmojiPickerOpen,
  messageBodyRef,
  linkPreviewVisibilityRef,
  groupedContainerRef,
  regularContainerRef,
}: UseMessageBubbleInteractionsParams): UseMessageBubbleInteractionsResult {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSource, setMenuSource] = useState<MessageBubbleContextMenuSource>("trigger");
  const [contextMenuAnchor, setContextMenuAnchor] = useState<MessageBubbleContextMenuAnchor | null>(
    null,
  );
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [mentionPopover, setMentionPopover] = useState<MessageBubbleMentionPopoverState | null>(
    null,
  );

  const attachmentStatusRef = useRef<Map<string, MessageBubbleAttachmentDownloadStatus>>(new Map());
  const attachmentTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [attachmentStatusVersion, setAttachmentStatusVersion] = useState(0);
  const replySelectionRef = useRef<string | undefined>(undefined);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDownload = useDownloadStore((s) => s.startDownload);
  const setDownloadProgress = useDownloadStore((s) => s.setProgress);
  const finishDownload = useDownloadStore((s) => s.finishDownload);

  const closeMentionPopover = useCallback(() => {
    setMentionPopover(null);
  }, []);

  const setAttachmentStatus = useCallback(
    (path: string, status: MessageBubbleAttachmentDownloadStatus) => {
      attachmentStatusRef.current.set(path, status);
      setAttachmentStatusVersion((value) => value + 1);
    },
    [],
  );

  const scheduleAttachmentStatusClear = useCallback((path: string, delayMs = 1800) => {
    const existingTimer = attachmentTimersRef.current.get(path);
    if (existingTimer != null) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      attachmentTimersRef.current.delete(path);
      attachmentStatusRef.current.delete(path);
      setAttachmentStatusVersion((value) => value + 1);
    }, delayMs);
    attachmentTimersRef.current.set(path, timer);
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openContextMenuAtCursor = useCallback((event: MouseEvent) => {
    setContextMenuAnchor({
      left: event.clientX + MESSAGE_CONTEXT_MENU_CURSOR_GAP_PX,
      top: event.clientY,
    });
    setMenuSource("context");
    setMenuOpen(true);
  }, []);

  const openContextMenuFromTrigger = useCallback(() => {
    setContextMenuAnchor(null);
    setMenuSource("trigger");
    setMenuOpen(true);
  }, []);

  const handleNativeContextMenu = useCallback(
    (event: Event) => {
      event.preventDefault();
      captureReplySelectionForContextMenu(messageBodyRef.current, replySelectionRef);
      if (event instanceof MouseEvent) {
        openContextMenuAtCursor(event);
        return;
      }
      openContextMenuFromTrigger();
    },
    [messageBodyRef, openContextMenuAtCursor, openContextMenuFromTrigger],
  );

  const handleKeyboardContextMenu = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const isContextMenuKey =
        event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
      if (!isContextMenuKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("a,button,input,textarea,select,[contenteditable='true']")
      ) {
        return;
      }

      handleNativeContextMenu(event.nativeEvent);
    },
    [handleNativeContextMenu],
  );

  const handleNativeTouchStart = useCallback(() => {
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      openContextMenuFromTrigger();
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer, openContextMenuFromTrigger]);

  const handleNativeTouchEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleNativeTouchMove = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const handleMenuAction = useCallback(
    (label: ContextItemLabel) => {
      executeMessageBubbleMenuAction(label, {
        message,
        jitsiUrl,
        jitsiLocationName,
        callbacks,
        replySelectionRef,
        closeMenu,
      });
    },
    [callbacks, closeMenu, jitsiLocationName, jitsiUrl, message],
  );

  const handleReaction = useCallback(
    (payload: MessageReactionPayload) => {
      callbacks?.onAddReaction?.(message.id, payload);
      setEmojiPickerOpen(false);
      setMenuOpen(false);
    },
    [callbacks, message.id],
  );

  const handleQuickReaction = useCallback(
    (emojiName: string) => {
      handleReaction({
        emojiName,
        reactionType: "unicode_emoji",
      });
    },
    [handleReaction],
  );

  const handleEmojiPick = useCallback(
    (data: EmojiClickData) => {
      const payload = reactionPayloadFromEmojiClickData(data);
      if (payload == null) {
        return;
      }
      handleReaction(payload);
    },
    [handleReaction],
  );

  const handleEmojiPickerOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onEmojiPickerOpen?.();
      }
      setEmojiPickerOpen(nextOpen);
    },
    [onEmojiPickerOpen],
  );

  const handleContextMenuSourceChange = useCallback(
    (nextSource: MessageBubbleContextMenuSource) => {
      setMenuSource(nextSource);
      if (nextSource === "trigger") {
        setContextMenuAnchor(null);
      }
    },
    [],
  );

  const handleContextMenuOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      replySelectionRef.current = undefined;
      setContextMenuAnchor(null);
      setEmojiPickerOpen(false);
    }
    setMenuOpen(nextOpen);
  }, []);

  const handleMessageBodyClickEvent = useCallback(
    (event: MouseEvent) => {
      const hit = resolveMessageBodyClickHit(event.target);
      if (hit == null) {
        return;
      }
      handleMessageBodyClick(event, hit, {
        mediaGallery,
        callbacks,
        startDownload,
        setDownloadProgress,
        finishDownload,
        setAttachmentStatus,
        scheduleAttachmentStatusClear,
        onMentionPopoverOpen: setMentionPopover,
      });
    },
    [
      callbacks,
      finishDownload,
      mediaGallery,
      scheduleAttachmentStatusClear,
      setAttachmentStatus,
      setDownloadProgress,
      startDownload,
    ],
  );

  useEffect(() => {
    const attachmentTimers = attachmentTimersRef.current;
    const attachmentStatuses = attachmentStatusRef.current;
    return () => {
      for (const timer of attachmentTimers.values()) {
        clearTimeout(timer);
      }
      attachmentTimers.clear();
      attachmentStatuses.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  useEffect(() => {
    const messageBodyElement = messageBodyRef.current;
    if (messageBodyElement == null) {
      return;
    }
    const mounts = mountCodeCopyButtons(messageBodyElement);
    return () => {
      teardownCodeCopyButtons(mounts);
    };
  }, [messageBodyRef, safeMessageHtml]);

  useEffect(() => {
    const div = messageBodyRef.current;
    if (div == null) {
      return;
    }

    const links = div.querySelectorAll<HTMLAnchorElement>("a[href]");
    for (const link of links) {
      const path = extractUserUploadPath(link.getAttribute("href") ?? "");
      const containsImage = link.querySelector("img") != null;
      const containsVideo = link.querySelector("video") != null;
      if (path == null || containsImage || containsVideo) {
        continue;
      }

      const status = attachmentStatusRef.current.get(path) ?? "idle";
      link.dataset.attachmentLink = "true";
      link.dataset.attachmentPath = path;
      for (const className of MESSAGE_BUBBLE_ATTACHMENT_LINK_BASE_CLASSES) {
        link.classList.add(className);
      }
      for (const statusClasses of Object.values(MESSAGE_BUBBLE_ATTACHMENT_LINK_STATUS_CLASSES)) {
        for (const className of statusClasses) {
          link.classList.remove(className);
        }
      }
      for (const className of MESSAGE_BUBBLE_ATTACHMENT_LINK_STATUS_CLASSES[status]) {
        link.classList.add(className);
      }
    }
  }, [messageBodyRef, messageContent, safeMessageHtml, attachmentStatusVersion]);

  useEffect(() => {
    const container = inSenderGroup ? groupedContainerRef.current : regularContainerRef.current;
    if (container == null) {
      return;
    }

    container.addEventListener("contextmenu", handleNativeContextMenu);
    container.addEventListener("touchstart", handleNativeTouchStart);
    container.addEventListener("touchend", handleNativeTouchEnd);
    container.addEventListener("touchmove", handleNativeTouchMove);
    container.addEventListener("touchcancel", handleNativeTouchEnd);

    return () => {
      container.removeEventListener("contextmenu", handleNativeContextMenu);
      container.removeEventListener("touchstart", handleNativeTouchStart);
      container.removeEventListener("touchend", handleNativeTouchEnd);
      container.removeEventListener("touchmove", handleNativeTouchMove);
      container.removeEventListener("touchcancel", handleNativeTouchEnd);
    };
  }, [
    inSenderGroup,
    handleNativeContextMenu,
    handleNativeTouchStart,
    handleNativeTouchEnd,
    handleNativeTouchMove,
    groupedContainerRef,
    regularContainerRef,
  ]);

  useEffect(() => {
    const messageBodyElement = messageBodyRef.current;
    if (messageBodyElement == null) {
      return;
    }
    messageBodyElement.addEventListener("click", handleMessageBodyClickEvent);
    return () => {
      messageBodyElement.removeEventListener("click", handleMessageBodyClickEvent);
    };
  }, [handleMessageBodyClickEvent, messageBodyRef]);

  return {
    messageBodyRef,
    linkPreviewVisibilityRef,
    groupedContainerRef,
    regularContainerRef,
    menuOpen,
    menuSource,
    contextMenuAnchor,
    emojiPickerOpen,
    mentionPopover,
    closeMentionPopover,
    handleKeyboardContextMenu,
    handleContextMenuSourceChange,
    handleContextMenuOpenChange,
    handleMenuAction,
    handleQuickReaction,
    handleEmojiPick,
    handleEmojiPickerOpenChange,
  };
}
