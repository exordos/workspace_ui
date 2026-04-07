import type { EmojiClickData } from "emoji-picker-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDownloadStore } from "~/entities/download/download.model";
import { useUsersStore } from "~/entities/user/user.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { buildAuthHeader } from "~/shared/lib/auth-guard";
import { formatMessageTime, getPresenceState } from "~/shared/lib/format";
import { sanitizeHtml } from "~/shared/lib/html";
import { getJitsiMeetingUrl } from "~/shared/lib/jitsi";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import {
  deriveAttachmentFileName,
  downloadUserUploadAttachment,
  extractUserUploadPath,
} from "./message-attachment-download.lib";
import { resolveAvatarSrc } from "./message-avatar.lib";
import { resolveJitsiLocationName } from "./message-jitsi-location.lib";
import { normalizeMediaUrl, type MessageMediaGallery } from "./message-list-media.lib";
import {
  BASE_CONTEXT_SECTIONS,
  JITSI_CONTEXT_SECTIONS,
  LABEL_TO_ACTION,
  type ContextItemLabel,
} from "./message-bubble-context.lib";
import { MessageBubbleContextMenu } from "./message-bubble-context-menu.ui";
import type {
  MessageBubbleAttachmentDownloadStatus,
  MessageBubbleCallbacks,
  MessageBubbleProps,
} from "./message-bubble.types";
import { groupReactions } from "./message-bubble-emoji.lib";
import { MessageBubbleJitsiCard } from "./message-bubble-jitsi-card.ui";
import { MessageBubbleOwnDeliveryIndicator } from "./message-bubble-own-delivery-indicator.ui";
import {
  AUTH_MEDIA_POSTER_DATA_ATTR,
  AUTH_MEDIA_SRC_DATA_ATTR,
  fetchProtectedUploadBlob,
  protectUserUploadMediaSources,
} from "./message-bubble-protected-media.lib";
import { MessageBubbleReactionsRow } from "./message-bubble-reactions-row.ui";
import {
  MESSAGE_BUBBLE_ATTACHMENT_LINK_BASE_CLASSES,
  MESSAGE_BUBBLE_ATTACHMENT_LINK_STATUS_CLASSES,
} from "./message-bubble-attachment-styles.lib";
import { resolveOwnMessageDeliveryStatus } from "./message-bubble-delivery.lib";
import { getMessageImagesBaseUrl } from "./message-bubble-realm-html.lib";

export type { MessageBubbleCallbacks, MessageBubbleProps } from "./message-bubble.types";

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({
    message,
    isOwn = false,
    showAvatar = true,
    showSenderName = true,
    inSenderGroup = false,
    currentUserId,
    selectionMode = false,
    isSelected = false,
    isFocused = false,
    mediaGallery,
    callbacks,
  }) => {
    const [open, setOpen] = useState(false);
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const getUser = useUsersStore((s) => s.getUser);
    const user = useUsersStore((s) => s.getUser(message.sender_id));
    const trimmedUserName = user?.full_name?.trim();
    const displayName =
      trimmedUserName != null && trimmedUserName.length > 0
        ? trimmedUserName
        : (message.sender_full_name ?? "");
    const senderStatusLabel = !isOwn ? formatUserStatusLabel(user?.status) : null;
    const presenceState =
      user?.presence != null
        ? getPresenceState(user.presence.timestamp, user.presence.status)
        : null;
    const avatarSrc = resolveAvatarSrc(user?.avatar_url ?? undefined);
    const handleAuthorClick = useCallback(() => {
      callbacks?.onAuthorClick?.(message.sender_id);
    }, [callbacks, message.sender_id]);
    const time = formatMessageTime(message.timestamp);
    const reactionGroups = useMemo(
      () => (message.reactions?.length ? groupReactions(message.reactions) : []),
      [message.reactions],
    );
    const resolveReactionAuthorLabel = useCallback(
      (userId: number): string => {
        const reactionUser = getUser(userId);
        const fullName = reactionUser?.full_name?.trim();
        const baseName = fullName != null && fullName.length > 0 ? fullName : `#${userId}`;
        const statusLabel = formatUserStatusLabel(reactionUser?.status);
        if (statusLabel == null || statusLabel.length === 0) {
          return baseName;
        }
        return `${baseName} — ${statusLabel}`;
      },
      [getUser],
    );
    const safeMessageHtml = useMemo(() => {
      const sanitized = sanitizeHtml(message.content, getMessageImagesBaseUrl());
      return protectUserUploadMediaSources(sanitized);
    }, [message.content]);

    const messageBodyRef = useRef<HTMLDivElement>(null);
    const groupedContainerRef = useRef<HTMLDivElement>(null);
    const regularContainerRef = useRef<HTMLDivElement>(null);
    const attachmentStatusRef = useRef<Map<string, MessageBubbleAttachmentDownloadStatus>>(new Map());
    const attachmentTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const [attachmentStatusVersion, setAttachmentStatusVersion] = useState(0);
    const replySelectionRef = useRef<string | undefined>(undefined);

    const setAttachmentStatus = useCallback((path: string, status: MessageBubbleAttachmentDownloadStatus) => {
      attachmentStatusRef.current.set(path, status);
      setAttachmentStatusVersion((value) => value + 1);
    }, []);
    const startDownload = useDownloadStore((s) => s.startDownload);
    const setDownloadProgress = useDownloadStore((s) => s.setProgress);
    const finishDownload = useDownloadStore((s) => s.finishDownload);

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

    // Load protected uploads with authenticated fetch to avoid browser auth popups.
    useEffect(() => {
      const div = messageBodyRef.current;
      if (!div) return;

      const protectedMediaElements = div.querySelectorAll<HTMLElement>(
        `[${AUTH_MEDIA_SRC_DATA_ATTR}], [${AUTH_MEDIA_POSTER_DATA_ATTR}]`,
      );
      if (protectedMediaElements.length === 0) return;

      const headers = buildAuthHeader();

      const blobUrls: string[] = [];
      let cancelled = false;

      const fetchIntoAttribute = (
        element: HTMLElement,
        sourceAttr: typeof AUTH_MEDIA_SRC_DATA_ATTR | typeof AUTH_MEDIA_POSTER_DATA_ATTR,
        targetAttr: "src" | "poster",
      ) => {
        const rawValue = element.getAttribute(sourceAttr);
        if (!rawValue) return;

        const restoreOriginalSource = () => {
          if (cancelled) return;
          element.setAttribute(targetAttr, rawValue);
          if (targetAttr === "src") {
            if (element instanceof HTMLImageElement) {
              element.dataset.originalSrc = rawValue;
            }
            if (element instanceof HTMLSourceElement || element instanceof HTMLVideoElement) {
              element.closest("video")?.load();
            }
          }
        };

        void fetchProtectedUploadBlob(rawValue, headers)
          .then((blob) => {
            if (cancelled) return;
            if (!blob) {
              restoreOriginalSource();
              return;
            }
            const url = URL.createObjectURL(blob);
            blobUrls.push(url);
            element.setAttribute(targetAttr, url);
            if (targetAttr === "src") {
              if (element instanceof HTMLImageElement) {
                element.dataset.originalSrc = rawValue;
              }
              if (element instanceof HTMLSourceElement || element instanceof HTMLVideoElement) {
                element.closest("video")?.load();
              }
            }
          })
          .catch(() => {
            restoreOriginalSource();
          });
      };

      protectedMediaElements.forEach((element) => {
        if (element.hasAttribute(AUTH_MEDIA_SRC_DATA_ATTR)) {
          fetchIntoAttribute(element, AUTH_MEDIA_SRC_DATA_ATTR, "src");
        }
        if (element.hasAttribute(AUTH_MEDIA_POSTER_DATA_ATTR)) {
          fetchIntoAttribute(element, AUTH_MEDIA_POSTER_DATA_ATTR, "poster");
        }
      });

      return () => {
        cancelled = true;
        for (const url of blobUrls) {
          URL.revokeObjectURL(url);
        }
      };
    }, [safeMessageHtml]);

    useEffect(() => {
      const div = messageBodyRef.current;
      if (!div) return;

      const links = div.querySelectorAll<HTMLAnchorElement>("a[href]");
      for (const link of links) {
        const path = extractUserUploadPath(link.getAttribute("href") ?? "");
        const containsImage = link.querySelector("img") != null;
        if (!path || containsImage) continue;

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
    }, [message.content, attachmentStatusVersion]);

    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearLongPressTimer = useCallback(() => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }, []);

    const handleNativeContextMenu = useCallback((event: Event) => {
      event.preventDefault();
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      const messageBody = messageBodyRef.current;
      const anchorNode = selection?.anchorNode;
      const focusNode = selection?.focusNode;
      const hasSelectionInsideMessageBody =
        selectedText != null &&
        selectedText.length > 0 &&
        messageBody != null &&
        anchorNode != null &&
        focusNode != null &&
        messageBody.contains(anchorNode.parentElement ?? anchorNode) &&
        messageBody.contains(focusNode.parentElement ?? focusNode);
      replySelectionRef.current = hasSelectionInsideMessageBody ? selectedText : undefined;
      setOpen(true);
    }, []);

    const handleKeyboardContextMenu = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const isContextMenuKey =
          event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
        if (!isContextMenuKey) return;

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
        setOpen(true);
      }, 500);
    }, [clearLongPressTimer]);

    const handleNativeTouchEnd = useCallback(() => {
      clearLongPressTimer();
    }, [clearLongPressTimer]);

    const handleNativeTouchMove = useCallback(() => {
      clearLongPressTimer();
    }, [clearLongPressTimer]);

    useEffect(() => {
      return () => {
        clearLongPressTimer();
      };
    }, [clearLongPressTimer]);

    useEffect(() => {
      const container = inSenderGroup ? groupedContainerRef.current : regularContainerRef.current;
      if (!container) return;

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
    ]);

    const handleMenuAction = (label: ContextItemLabel): void => {
      if (label === "joinCall") {
        if (jitsiUrl) {
          callbacks?.onOpenJitsiCall?.(jitsiUrl, jitsiLocationName);
        }
        replySelectionRef.current = undefined;
        setOpen(false);
        return;
      }
      if (label === "copyCallLink") {
        if (jitsiUrl && callbacks?.onCopy) {
          callbacks.onCopy({ ...message, content: jitsiUrl });
        }
        replySelectionRef.current = undefined;
        setOpen(false);
        return;
      }
      if (label === "reply") {
        const selectedReplyText = replySelectionRef.current;
        replySelectionRef.current = undefined;
        callbacks?.onReply?.(message, selectedReplyText);
        setOpen(false);
        return;
      }
      if (label === "forward") {
        const selectedForwardText = replySelectionRef.current;
        replySelectionRef.current = undefined;
        callbacks?.onForward?.(message, selectedForwardText);
        setOpen(false);
        return;
      }

      const action = LABEL_TO_ACTION[label];
      if (action && callbacks?.[action]) {
        (callbacks[action] as (msg: MockMessage) => void)(message);
      }
      replySelectionRef.current = undefined;
      setOpen(false);
    };

    const handleContextMenuOpenChange = useCallback((nextOpen: boolean) => {
      if (!nextOpen) {
        replySelectionRef.current = undefined;
      }
      setOpen(nextOpen);
    }, []);

    const handleReaction = (emojiName: string) => {
      callbacks?.onAddReaction?.(message.id, emojiName);
      setEmojiPickerOpen(false);
      setOpen(false);
    };

    const handleEmojiPick = (data: EmojiClickData) => {
      const name = data.names?.[0] ?? data.emoji ?? "smile";
      handleReaction(name);
    };

    const handleMessageBodyClick = useCallback(
      (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.tagName === "IMG") {
          event.preventDefault();
          event.stopPropagation();
          const image = target as HTMLImageElement;
          const src = image.currentSrc || image.src;
          if (src) {
            if (src.startsWith("blob:")) {
              useMediaViewerStore.getState().open([{ url: src, type: "image" }], 0);
            } else {
              const gallery = mediaGallery;
              const lookupUrl = normalizeMediaUrl(image.dataset.originalSrc ?? src);
              const galleryIndex = gallery?.indexByUrl.get(lookupUrl);
              if (gallery != null && galleryIndex != null && gallery.items.length > 0) {
                useMediaViewerStore.getState().open(gallery.items, galleryIndex);
              } else {
                useMediaViewerStore.getState().open([{ url: src, type: "image" }], 0);
              }
            }
          }
          return;
        }
        const spoilerHeader = target.closest(".spoiler-header");
        if (spoilerHeader) {
          event.preventDefault();
          event.stopPropagation();
          spoilerHeader.closest(".spoiler-block")?.classList.toggle("open");
          return;
        }

        const attachmentLink = target.closest<HTMLAnchorElement>("a[href]");
        if (attachmentLink) {
          const attachmentPath = extractUserUploadPath(attachmentLink.getAttribute("href") ?? "");
          const containsImage = attachmentLink.querySelector("img") != null;
          if (attachmentPath != null && !containsImage) {
            event.preventDefault();
            event.stopPropagation();

            const fileName = deriveAttachmentFileName(
              attachmentLink.textContent ?? "",
              attachmentPath,
            );
            if (!startDownload(attachmentPath, fileName)) {
              return;
            }
            setAttachmentStatus(attachmentPath, "downloading");

            void downloadUserUploadAttachment({
              path: attachmentPath,
              fileName,
              authHeaders: buildAuthHeader(),
              credentials: "include",
              onProgress: (progress) => {
                setDownloadProgress(attachmentPath, progress);
              },
            })
              .then((success) => {
                finishDownload(attachmentPath, success);
                setAttachmentStatus(attachmentPath, success ? "downloaded" : "error");
                scheduleAttachmentStatusClear(attachmentPath);
              })
              .catch(() => {
                finishDownload(attachmentPath, false);
                setAttachmentStatus(attachmentPath, "error");
                scheduleAttachmentStatusClear(attachmentPath);
              });
          }
        }
      },
      [
        finishDownload,
        mediaGallery,
        scheduleAttachmentStatusClear,
        setAttachmentStatus,
        setDownloadProgress,
        startDownload,
      ],
    );

    useEffect(() => {
      const messageBodyElement = messageBodyRef.current;
      if (!messageBodyElement) return;
      messageBodyElement.addEventListener("click", handleMessageBodyClick);
      return () => {
        messageBodyElement.removeEventListener("click", handleMessageBodyClick);
      };
    }, [handleMessageBodyClick]);

    const jitsiUrl = getJitsiMeetingUrl(message.content);
    const isJitsiCall = jitsiUrl != null;
    const jitsiLocationName = isJitsiCall ? resolveJitsiLocationName(message) : "";
    const ownDeliveryStatus = isOwn ? resolveOwnMessageDeliveryStatus(message) : null;
    const ownDeliveryIndicator =
      ownDeliveryStatus === "sent" ||
      ownDeliveryStatus === "sending" ||
      ownDeliveryStatus === "failed" ? (
        <MessageBubbleOwnDeliveryIndicator
          message={message}
          status={
            ownDeliveryStatus === "sent"
              ? "sent"
              : ownDeliveryStatus === "sending"
                ? "sending"
                : "failed"
          }
          onViews={callbacks?.onViews}
        />
      ) : null;
    const bubbleSurfaceClass = "rounded-[18px]";
    const ownBubbleTailClass = "rounded-br-[6px]";
    const peerBubbleTailClass = "rounded-bl-[6px]";
    const hasReactions = reactionGroups.length > 0;
    const contextSections = isJitsiCall ? JITSI_CONTEXT_SECTIONS : BASE_CONTEXT_SECTIONS;
    const visibleContextSections = contextSections
      .map((section) =>
        section.filter((label) => {
          if ((label === "edit" || label === "delete") && !isOwn) return false;
          if (label === "openInChat" && callbacks?.onOpenInChat == null) return false;
          if (label === "joinCall" && (callbacks?.onOpenJitsiCall == null || !isJitsiCall))
            return false;
          if (label === "copyCallLink" && (callbacks?.onCopy == null || !isJitsiCall)) return false;
          return true;
        }),
      )
      .filter((section) => section.length > 0);

    const contextMenu = (
      <MessageBubbleContextMenu
        open={open}
        onOpenChange={handleContextMenuOpenChange}
        isOwn={isOwn}
        emojiPickerOpen={emojiPickerOpen}
        onEmojiPickerOpenChange={setEmojiPickerOpen}
        visibleContextSections={visibleContextSections}
        onMenuItem={handleMenuAction}
        onQuickReaction={handleReaction}
        onEmojiPick={handleEmojiPick}
      />
    );

    const bubbleInner = isJitsiCall ? (
      <>
        <MessageBubbleJitsiCard
          message={message}
          jitsiUrl={jitsiUrl}
          isOwn={isOwn}
          time={time}
          ownDeliveryIndicator={ownDeliveryIndicator}
          bubbleSurfaceClass={bubbleSurfaceClass}
          ownBubbleTailClass={ownBubbleTailClass}
          peerBubbleTailClass={peerBubbleTailClass}
          callbacks={callbacks}
        />
        {contextMenu}
      </>
    ) : (
      <>
        <div
          className={`relative overflow-hidden px-3 py-2 pr-14 ${
            hasReactions ? "pb-8" : "pb-5"
          } ${bubbleSurfaceClass} ${
            isOwn
              ? `${ownBubbleTailClass} bg-msg-own-bg text-text-primary`
              : `${peerBubbleTailClass} bg-bg-elevated text-text-primary`
          }`}
        >
          <div
            ref={messageBodyRef}
            className="message-body [&_pre]:bg-bg/50 select-text break-words [&_a]:text-accent [&_a]:underline hover:[&_a]:opacity-90 [&_blockquote]:border-l-2 [&_blockquote]:border-border-subtle [&_blockquote]:pl-2 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_img]:my-1 [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-pointer [&_img]:rounded [&_p:last-child]:mb-0 [&_p]:mb-1 [&_pre]:rounded [&_pre]:p-2 [&_pre]:text-sm"
            dangerouslySetInnerHTML={{
              __html: safeMessageHtml,
            }}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1 text-[11px] text-text-muted">
            <span>{time}</span>
            {ownDeliveryIndicator}
          </div>
          <MessageBubbleReactionsRow
            message={message}
            isOwn={isOwn}
            currentUserId={currentUserId}
            reactionGroups={reactionGroups}
            resolveReactionAuthorLabel={resolveReactionAuthorLabel}
            callbacks={callbacks}
          />
        </div>
        {contextMenu}
      </>
    );

    if (inSenderGroup) {
      return (
        <div
          ref={groupedContainerRef}
          data-message-id={message.id}
          data-testid={`message-${message.id}`}
          data-focused={isFocused ? "true" : "false"}
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyboardContextMenu}
          className={`selectable hover:bg-bg-elevated/30 group relative flex items-start gap-2 py-2 ${
            isSelected ? `${bubbleSurfaceClass} ring-1 ring-accent` : ""
          } ${isFocused ? `${bubbleSurfaceClass} ring-2 ring-accent-soft` : ""}`}
        >
          {selectionMode && (
            <button
              type="button"
              onClick={() => callbacks?.onToggleSelect?.(message)}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-border-subtle transition-colors"
              aria-label={isSelected ? t("message.deselect") : t("message.select")}
            >
              {isSelected && <Icon name="check" size={14} className="text-accent" />}
            </button>
          )}
          <div className={`min-w-0 flex-1 ${isOwn ? "flex flex-col items-end" : ""}`}>
            {showSenderName && (
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-text-primary">{displayName}</span>
                {senderStatusLabel != null && senderStatusLabel.length > 0 && (
                  <span className="truncate text-[11px] text-text-secondary">
                    {senderStatusLabel}
                  </span>
                )}
                {message.subject && (
                  <span
                    className={`text-[11px] font-medium ${isOwn ? "text-call-green" : "text-accent-soft"}`}
                  >
                    #{message.subject}
                  </span>
                )}
              </div>
            )}
            <div
              className={`relative max-w-[85%] text-sm leading-relaxed ${bubbleSurfaceClass} ${
                showSenderName ? "mt-1" : "mt-0.5"
              } ${isOwn ? "flex flex-col items-end" : ""}`}
            >
              {bubbleInner}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={regularContainerRef}
        data-message-id={message.id}
        data-testid={`message-${message.id}`}
        data-focused={isFocused ? "true" : "false"}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyboardContextMenu}
        className={`selectable hover:bg-bg-elevated/30 group relative flex gap-2 px-4 py-2 ${
          isOwn ? "flex-row-reverse" : ""
        } ${isSelected ? `${bubbleSurfaceClass} ring-1 ring-accent` : ""} ${
          isFocused ? `${bubbleSurfaceClass} ring-2 ring-accent-soft` : ""
        }`}
      >
        {selectionMode && (
          <button
            type="button"
            onClick={() => callbacks?.onToggleSelect?.(message)}
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center self-center rounded border border-border-subtle transition-colors"
            aria-label={isSelected ? t("message.deselect") : t("message.select")}
          >
            {isSelected && <Icon name="check" size={14} className="text-accent" />}
          </button>
        )}
        {!isOwn &&
          (showAvatar ? (
            <button
              type="button"
              onClick={handleAuthorClick}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
              aria-label={t("a11y.openUserProfile", { name: displayName })}
            >
              <span className="relative block">
                <Avatar
                  size="lg"
                  className="flex-shrink-0 bg-bg-elevated text-accent-soft"
                  src={avatarSrc ?? undefined}
                >
                  {displayName.slice(0, 1)}
                </Avatar>
                <PresenceIndicator
                  status={presenceState}
                  size="sm"
                  className="absolute bottom-0 right-0"
                />
              </span>
            </button>
          ) : (
            <div className="w-12 flex-shrink-0" aria-hidden />
          ))}
        {isOwn && <div className="w-12 flex-shrink-0" />}
        <div className={`min-w-0 flex-1 ${isOwn ? "flex flex-col items-end" : ""}`}>
          {showSenderName && (
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-semibold text-text-primary">{displayName}</span>
              {senderStatusLabel != null && senderStatusLabel.length > 0 && (
                <span className="truncate text-[11px] text-text-secondary">
                  {senderStatusLabel}
                </span>
              )}
              {message.subject && (
                <span
                  className={`text-[11px] font-medium ${
                    isOwn ? "text-call-green" : "text-accent-soft"
                  }`}
                >
                  #{message.subject}
                </span>
              )}
            </div>
          )}
          <div
            className={`relative max-w-[85%] text-sm leading-relaxed ${bubbleSurfaceClass} ${
              showSenderName ? "mt-1" : "mt-0.5"
            } ${isOwn ? "flex flex-col items-end" : ""}`}
          >
            {bubbleInner}
          </div>
        </div>
      </div>
    );
  },
);
