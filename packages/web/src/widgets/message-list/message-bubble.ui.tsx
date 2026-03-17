import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCallParticipantsStore } from "~/entities/call";
import { useDownloadStore } from "~/entities/download";
import { ensureUserStatusLoaded, formatUserStatusLabel, useUsersStore } from "~/entities/user";
import { useMediaViewerStore } from "~/features/media-viewer";
import { t } from "~/i18n";
import {
  getRealmBaseUrl,
  type MockMessage,
  type MockMessageDeliveryStatus,
  type Reaction,
} from "~/shared/api/zulip";
import { WORKSPACE_ORIGIN, WORKSPACE_UPLOADS_ORIGIN } from "~/shared/config/constants";
import { buildAuthHeader } from "~/shared/lib/auth-guard";
import { formatMessageTime, getPresenceState } from "~/shared/lib/format";
import { sanitizeHtml } from "~/shared/lib/html";
import { getJitsiMeetingUrl, parseJitsiUrl } from "~/shared/lib/jitsi";
import { Avatar, Icon, PresenceIndicator, type IconName } from "~/shared/ui";
import {
  deriveAttachmentFileName,
  downloadUserUploadAttachment,
  extractUserUploadPath,
} from "./message-attachment-download.lib";
import { resolveAvatarSrc } from "./message-avatar.lib";
import { resolveJitsiLocationName } from "./message-jitsi-location.lib";
import { normalizeMediaUrl, type MessageMediaGallery } from "./message-list-media.lib";

/** Base URL for message images (uploads): when realm === workspace, use origin + api/v1. */
function getMessageImagesBaseUrl(): string | undefined {
  const realm = getRealmBaseUrl();
  if (WORKSPACE_ORIGIN && realm === WORKSPACE_ORIGIN && WORKSPACE_UPLOADS_ORIGIN) {
    return WORKSPACE_UPLOADS_ORIGIN;
  }
  return realm || WORKSPACE_UPLOADS_ORIGIN || undefined;
}

export interface MessageBubbleCallbacks {
  onReply?: (message: MockMessage, selectedText?: string) => void;
  onEdit?: (message: MockMessage) => void;
  onDelete?: (message: MockMessage) => void;
  onCopy?: (message: MockMessage) => void;
  onForward?: (message: MockMessage, selectedText?: string) => void;
  onStar?: (message: MockMessage) => void;
  onSelect?: (message: MockMessage) => void;
  onToggleSelect?: (message: MockMessage) => void;
  onAddReaction?: (messageId: number, emojiName: string) => void;
  onRemoveReaction?: (messageId: number, emojiName: string) => void;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
  onViews?: (message: MockMessage) => void;
  onOpenInChat?: (message: MockMessage) => void;
  onAuthorClick?: (userId: number) => void;
}

interface MessageBubbleProps {
  message: MockMessage;
  isOwn?: boolean;
  /** Show avatar (for a standalone message; in a group the avatar is rendered by the outer block). */
  showAvatar?: boolean;
  /** Show sender name (only for the first message in a consecutive group). */
  showSenderName?: boolean;
  /** Message inside a sender group: avatar is rendered outside, content has no avatar column. */
  inSenderGroup?: boolean;
  currentUserId?: number;
  selectionMode?: boolean;
  isSelected?: boolean;
  isFocused?: boolean;
  mediaGallery?: MessageMediaGallery;
  callbacks?: MessageBubbleCallbacks;
}

/** Common emoji_name → character map (fallback when emoji_code cannot be converted). */
const EMOJI_NAME_TO_CHAR: Record<string, string> = {
  thumbs_up: "👍",
  heart: "❤️",
  smile: "😄",
  joy: "😂",
  open_mouth: "😮",
  cry: "😢",
  clap: "👏",
  "+1": "👍",
  eyes: "👀",
  tada: "🎉",
  wave: "👋",
};

const QUICK_REACTIONS = [
  { emojiName: "heart", a11yLabelKey: "a11y.like" },
  { emojiName: "thumbs_up", a11yLabelKey: "a11y.thumbsUp" },
  { emojiName: "joy", a11yLabelKey: "a11y.joy" },
  { emojiName: "open_mouth", a11yLabelKey: "a11y.surprised" },
  { emojiName: "cry", a11yLabelKey: "a11y.crying" },
  { emojiName: "clap", a11yLabelKey: "a11y.clap" },
] as const;

function emojiCodeToChar(emojiCode: string): string {
  try {
    const codePoints = emojiCode.split("-").map((hex) => parseInt(hex, 16));
    if (codePoints.some((n) => Number.isNaN(n))) return "";
    return String.fromCodePoint(...codePoints);
  } catch {
    return "";
  }
}

function getReactionDisplayChar(reaction: Reaction): string {
  const fromCode = emojiCodeToChar(reaction.emoji_code);
  if (fromCode) return fromCode;
  return EMOJI_NAME_TO_CHAR[reaction.emoji_name] ?? reaction.emoji_name;
}

function formatJitsiRoomName(jitsiUrl: string): string {
  const parsed = parseJitsiUrl(jitsiUrl);
  const roomName = parsed?.roomName?.trim() ?? "";
  if (roomName.length === 0) return "";
  return roomName.replace(/[-_]+/g, " ").trim();
}

function getAvatarInitials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  const initials = `${first}${second}`.toUpperCase();
  return initials.length > 0 ? initials : "?";
}

/** Group reactions by (emoji_name, reaction_type): { count, userIds, displayChar }. */
function groupReactions(
  reactions: Reaction[],
): { key: string; count: number; userIds: number[]; displayChar: string }[] {
  const map = new Map<string, { userIds: number[]; displayChar: string }>();
  for (const r of reactions) {
    const key = `${r.reaction_type}:${r.emoji_name}`;
    const displayChar = getReactionDisplayChar(r);
    const existing = map.get(key);
    if (existing) {
      if (!existing.userIds.includes(r.user_id)) existing.userIds.push(r.user_id);
    } else {
      map.set(key, { userIds: [r.user_id], displayChar });
    }
  }
  return Array.from(map.entries()).map(([key, { userIds, displayChar }]) => ({
    key,
    count: userIds.length,
    userIds,
    displayChar,
  }));
}

const CONTEXT_ITEMS_BY_LABEL = {
  joinCall: { iconName: "phone" },
  copyCallLink: { iconName: "copy" },
  reply: { iconName: "reply" },
  forward: { iconName: "forward" },
  openInChat: { iconName: "chatBubble" },
  copy: { iconName: "copy" },
  views: { iconName: "visibility" },
  star: { iconName: "star" },
  select: { iconName: "check" },
  edit: { iconName: "pen" },
  delete: { iconName: "delete" },
} as const satisfies Record<string, { iconName: IconName }>;

type ContextItemLabel = keyof typeof CONTEXT_ITEMS_BY_LABEL;

const BASE_CONTEXT_SECTIONS = [
  ["reply", "forward", "openInChat"],
  ["copy", "views"],
  ["star", "select"],
  ["edit", "delete"],
] as const satisfies readonly (readonly ContextItemLabel[])[];

const JITSI_CONTEXT_SECTIONS = [
  ["joinCall", "copyCallLink"],
  ["reply", "forward", "openInChat"],
  ["copy", "views"],
  ["star", "select"],
  ["edit", "delete"],
] as const satisfies readonly (readonly ContextItemLabel[])[];

const LABEL_TO_ACTION = {
  views: "onViews",
  reply: "onReply",
  edit: "onEdit",
  copy: "onCopy",
  forward: "onForward",
  star: "onStar",
  delete: "onDelete",
  select: "onSelect",
  openInChat: "onOpenInChat",
} as const satisfies Partial<Record<ContextItemLabel, keyof MessageBubbleCallbacks>>;

const EMPTY_PARTICIPANTS: never[] = [];
const AUTH_MEDIA_SRC_DATA_ATTR = "data-auth-src";
const AUTH_MEDIA_POSTER_DATA_ATTR = "data-auth-poster";
const AUTH_IMAGE_PLACEHOLDER_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const ATTACHMENT_LINK_BASE_CLASSES = [
  "inline-flex",
  "max-w-[220px]",
  "items-center",
  "gap-2",
  "rounded-md",
  "border",
  "px-2.5",
  "py-1.5",
  "font-medium",
  "no-underline",
  "transition-colors",
] as const;

const ATTACHMENT_LINK_STATUS_CLASSES = {
  idle: ["border-border-subtle", "bg-bg/40", "text-text-primary", "hover:bg-bg/60"],
  downloading: [
    "border-border-subtle",
    "bg-bg/60",
    "text-text-muted",
    "pointer-events-none",
    "animate-pulse",
  ],
  downloaded: ["border-notice-base/50", "bg-notice-base/10", "text-notice-base"],
  error: ["border-border-subtle", "bg-bg/20", "text-text-muted"],
} as const;

type AttachmentDownloadStatus = keyof typeof ATTACHMENT_LINK_STATUS_CLASSES;

type OwnMessageDeliveryStatus = MockMessageDeliveryStatus | "sent";

function resolveOwnMessageDeliveryStatus(message: MockMessage): OwnMessageDeliveryStatus {
  if (message.delivery_status != null) {
    return message.delivery_status;
  }
  return message.id > 0 ? "sent" : "sending";
}

function isProtectedUserUploadUrl(url: string): boolean {
  const value = url.trim();
  if (value.length === 0) return false;
  if (value.includes("/user_uploads/")) return true;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    return new URL(value, base).pathname.includes("/user_uploads/");
  } catch {
    return false;
  }
}

function normalizeProtectedUploadPath(url: string): string | null {
  const value = url.trim();
  if (value.length === 0) return null;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const parsed = new URL(value, base);
    if (parsed.pathname.includes("/user_uploads/")) {
      const normalizedPath = parsed.pathname.replace(/^\/api\/v1(?=\/user_uploads\/)/, "");
      return `${normalizedPath}${parsed.search}`;
    }
  } catch {
    if (value.includes("/user_uploads/")) {
      return value.replace(/^\/api\/v1(?=\/user_uploads\/)/, "");
    }
  }
  return null;
}

function buildProtectedUploadFetchCandidates(url: string): string[] {
  const value = url.trim();
  const normalizedPath = normalizeProtectedUploadPath(value);
  if (!normalizedPath) {
    return value.length > 0 ? [value] : [];
  }
  const realmBase = getRealmBaseUrl().trim().replace(/\/+$/, "");
  const candidates = [
    normalizedPath,
    value,
    realmBase ? `${realmBase}${normalizedPath}` : "",
  ].filter((candidate) => candidate.length > 0);
  return Array.from(new Set(candidates));
}

function resolveProtectedUploadFetchOptions(
  candidate: string,
  headers: Record<string, string>,
): RequestInit {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const parsed = new URL(candidate, base);
    const isCrossOrigin = typeof window !== "undefined" && parsed.origin !== window.location.origin;
    if (isCrossOrigin) {
      // Cross-origin authenticated fetches trigger CORS preflight in dev.
      // Fall back to an anonymous request for this candidate.
      return { credentials: "omit" };
    }
  } catch {
    // Ignore parse failures and use the authenticated same-origin options.
  }
  return { headers, credentials: "include" };
}

async function fetchProtectedUploadBlob(
  rawValue: string,
  headers: Record<string, string>,
): Promise<Blob | null> {
  for (const candidate of buildProtectedUploadFetchCandidates(rawValue)) {
    try {
      const response = await fetch(
        candidate,
        resolveProtectedUploadFetchOptions(candidate, headers),
      );
      if (!response.ok) continue;
      return await response.blob();
    } catch {
      // Try the next candidate URL.
    }
  }
  return null;
}

function protectUserUploadMediaSources(html: string): string {
  if (!html.includes("/user_uploads/") || typeof document === "undefined") return html;

  const container = document.createElement("div");
  container.innerHTML = html;

  const elementsWithSrc = container.querySelectorAll<HTMLElement>("[src]");
  for (const element of elementsWithSrc) {
    const src = element.getAttribute("src");
    if (!src || !isProtectedUserUploadUrl(src)) continue;

    element.setAttribute(AUTH_MEDIA_SRC_DATA_ATTR, src);
    if (element instanceof HTMLImageElement) {
      element.dataset.originalSrc = src;
      element.setAttribute("src", AUTH_IMAGE_PLACEHOLDER_SRC);
    } else {
      element.removeAttribute("src");
    }
  }

  const videosWithPoster = container.querySelectorAll<HTMLVideoElement>("video[poster]");
  for (const video of videosWithPoster) {
    const poster = video.getAttribute("poster");
    if (!poster || !isProtectedUserUploadUrl(poster)) continue;
    video.setAttribute(AUTH_MEDIA_POSTER_DATA_ATTR, poster);
    video.removeAttribute("poster");
  }

  return container.innerHTML;
}

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
    const attachmentStatusRef = useRef<Map<string, AttachmentDownloadStatus>>(new Map());
    const attachmentTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const [attachmentStatusVersion, setAttachmentStatusVersion] = useState(0);
    const replySelectionRef = useRef<string | undefined>(undefined);

    const setAttachmentStatus = useCallback((path: string, status: AttachmentDownloadStatus) => {
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

    useEffect(() => {
      if (!Number.isFinite(message.sender_id) || message.sender_id <= 0) {
        return;
      }
      void ensureUserStatusLoaded(message.sender_id);
    }, [message.sender_id]);

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
        for (const className of ATTACHMENT_LINK_BASE_CLASSES) {
          link.classList.add(className);
        }
        for (const statusClasses of Object.values(ATTACHMENT_LINK_STATUS_CLASSES)) {
          for (const className of statusClasses) {
            link.classList.remove(className);
          }
        }
        for (const className of ATTACHMENT_LINK_STATUS_CLASSES[status]) {
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

    const handleMenuAction = (label: ContextItemLabel) => {
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
      ownDeliveryStatus === "sent" ? (
        callbacks?.onViews ? (
          <button
            type="button"
            data-testid={`message-delivery-${message.id}`}
            className="inline-flex items-center text-xs text-call-green focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            title={t("message.sentToServer")}
            aria-label={t("message.sentToServer")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              callbacks.onViews?.(message);
            }}
          >
            <Icon name="check" size={12} className="shrink-0 text-current" />
          </button>
        ) : (
          <span
            data-testid={`message-delivery-${message.id}`}
            className="inline-flex items-center text-xs text-call-green"
            title={t("message.sentToServer")}
            aria-label={t("message.sentToServer")}
          >
            <Icon name="check" size={12} className="shrink-0 text-current" />
          </span>
        )
      ) : ownDeliveryStatus === "sending" ? (
        <span
          data-testid={`message-delivery-${message.id}`}
          className="text-[11px] text-text-muted"
          title={t("message.sending")}
        >
          {t("message.sending")}
        </span>
      ) : ownDeliveryStatus === "failed" ? (
        <span
          data-testid={`message-delivery-${message.id}`}
          className="text-[11px] text-notice-base"
          title={t("message.notDelivered")}
        >
          {t("message.notDelivered")}
        </span>
      ) : null;
    const callParticipants = useCallParticipantsStore((s) =>
      jitsiUrl ? (s.participantsByUrl[jitsiUrl] ?? EMPTY_PARTICIPANTS) : EMPTY_PARTICIPANTS,
    );
    const jitsiCallName = useMemo(() => {
      if (!jitsiUrl) return "";
      const roomName = formatJitsiRoomName(jitsiUrl);
      return roomName.length > 0 ? roomName : t("call.callName");
    }, [jitsiUrl]);
    const jitsiTopicName = useMemo(() => {
      const topic = message.subject.trim();
      return topic.length > 0 ? topic : "";
    }, [message.subject]);
    const callParticipantNames = useMemo(() => {
      const names = callParticipants
        .map((participant) => participant.displayName.trim())
        .filter((name) => name.length > 0);
      if (names.length > 0) return names;
      const fallback = message.sender_full_name.trim();
      return fallback.length > 0 ? [fallback] : [];
    }, [callParticipants, message.sender_full_name]);
    const visibleCallParticipantNames = useMemo(
      () => callParticipantNames.slice(0, 3),
      [callParticipantNames],
    );
    const hiddenCallParticipantsCount = Math.max(
      callParticipantNames.length - visibleCallParticipantNames.length,
      0,
    );
    const participantBorderClass = isOwn ? "border-msg-own-bg" : "border-bg-elevated";

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
      <DropdownMenu.Root open={open} onOpenChange={handleContextMenuOpenChange}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={`hover:bg-bg/50 absolute -top-2 z-float rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-primary ${isOwn ? "-left-8" : "-right-8"}`}
            aria-label={t("a11y.messageMenu")}
          >
            <Icon name="more" size={16} className="text-current" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-dropdown min-w-[200px] rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
            sideOffset={4}
            align={isOwn ? "end" : "start"}
          >
            <div className="flex items-center gap-0.5 border-b border-border-subtle px-3 py-2">
              {QUICK_REACTIONS.map((reaction) => (
                <button
                  key={reaction.emojiName}
                  type="button"
                  className="hover:bg-bg/50 flex h-6 w-6 items-center justify-center rounded p-1 text-current"
                  aria-label={t(reaction.a11yLabelKey)}
                  onClick={(e) => {
                    e.preventDefault();
                    handleReaction(reaction.emojiName);
                  }}
                >
                  <span className="text-[15px] leading-none">
                    {EMOJI_NAME_TO_CHAR[reaction.emojiName] ?? reaction.emojiName}
                  </span>
                </button>
              ))}
              <div className="relative">
                <button
                  type="button"
                  className="hover:bg-bg/50 flex h-6 w-6 items-center justify-center rounded p-1 text-text-muted hover:text-text-primary"
                  aria-label={t("a11y.moreReactions")}
                  onClick={(e) => {
                    e.preventDefault();
                    setEmojiPickerOpen((v) => !v);
                  }}
                >
                  <Icon name="plus" size={14} className="text-current" />
                </button>
                {emojiPickerOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-overlay"
                      aria-hidden
                      onClick={() => setEmojiPickerOpen(false)}
                    />
                    <div className="absolute left-0 top-full z-dropdown mt-1 overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl">
                      <EmojiPicker
                        onEmojiClick={handleEmojiPick}
                        theme={
                          document.documentElement.dataset.theme === "light"
                            ? Theme.LIGHT
                            : Theme.DARK
                        }
                        width={320}
                        height={360}
                        searchDisabled={false}
                        previewConfig={{ showPreview: false }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            {visibleContextSections.map((section, sectionIndex) => (
              <React.Fragment key={`context-section-${sectionIndex}`}>
                {sectionIndex > 0 && (
                  <DropdownMenu.Separator className="mx-2 my-1 h-px bg-border-subtle" />
                )}
                {section.map((label) => (
                  <DropdownMenu.Item
                    key={label}
                    className="hover:bg-bg/80 data-[highlighted]:bg-accent/20 flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none"
                    onSelect={(e) => {
                      e.preventDefault();
                      handleMenuAction(label);
                    }}
                  >
                    <Icon
                      name={CONTEXT_ITEMS_BY_LABEL[label].iconName}
                      size={14}
                      className="text-current opacity-70"
                    />
                    {t(`message.${label}`)}
                  </DropdownMenu.Item>
                ))}
              </React.Fragment>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );

    const bubbleInner = isJitsiCall ? (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => callbacks?.onOpenJitsiCall?.(jitsiUrl, jitsiLocationName)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              callbacks?.onOpenJitsiCall?.(jitsiUrl, jitsiLocationName);
            }
          }}
          className={`relative flex cursor-pointer flex-col gap-2 px-3 py-2 ${bubbleSurfaceClass} ${
            isOwn
              ? `${ownBubbleTailClass} bg-msg-call-bg text-text-primary`
              : `${peerBubbleTailClass} bg-msg-call-bg text-text-primary`
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[15px] font-semibold leading-tight text-call-green">
                {t("call.callMessage")}
              </span>
              <span className="truncate text-[15px] font-medium leading-tight text-text-primary">
                {jitsiCallName}
              </span>
              {jitsiTopicName.length > 0 && (
                <>
                  <span className="h-4 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="truncate text-[15px] leading-tight text-text-muted">
                    # {jitsiTopicName}
                  </span>
                </>
              )}
            </div>
            <Icon name="phone" size={18} className="mt-0.5 shrink-0 text-call-green" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-text-muted">
              <Icon name="chevron-right" size={12} className="shrink-0 rotate-45 text-current" />
              <span className="shrink-0 text-[11px]">0:47</span>
              <div
                data-testid={`jitsi-call-participants-${message.id}`}
                className="ml-0.5 flex min-w-0 items-center -space-x-2"
              >
                {visibleCallParticipantNames.map((participantName, idx) => (
                  <Avatar
                    key={`${participantName}-${idx}`}
                    size="sm"
                    className={`border-2 ${participantBorderClass} bg-bg text-[10px]`}
                  >
                    {getAvatarInitials(participantName)}
                  </Avatar>
                ))}
                {hiddenCallParticipantsCount > 0 && (
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 ${participantBorderClass} bg-bg text-[10px] font-semibold text-text-primary`}
                  >
                    +{hiddenCallParticipantsCount}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[11px] text-text-muted">
              <span>{time}</span>
              {ownDeliveryIndicator}
            </div>
          </div>
        </div>
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
          {hasReactions && (
            <div
              className={`absolute bottom-2 left-2 right-14 flex flex-wrap items-end gap-1 ${
                isOwn ? "justify-end" : "justify-start"
              }`}
            >
              {reactionGroups.map(({ key, count, userIds, displayChar }) => {
                const emojiName = key.split(":")[1] ?? key;
                const hasCurrentUser = currentUserId != null && userIds.includes(currentUserId);
                const reactionAuthors = userIds.map(resolveReactionAuthorLabel).join(", ");
                const reactionTitle =
                  reactionAuthors.length > 0
                    ? `${displayChar} ${count} - ${reactionAuthors}`
                    : count > 0
                      ? `${displayChar} ${count}`
                      : undefined;
                return (
                  <button
                    type="button"
                    key={key}
                    className={`inline-flex cursor-pointer items-center gap-0.5 rounded-full border-0 px-1.5 py-0.5 text-sm transition-colors ${
                      hasCurrentUser ? "bg-accent/25 hover:bg-accent/35" : "bg-bg/50 hover:bg-bg/80"
                    }`}
                    title={reactionTitle}
                    aria-label={reactionTitle}
                    onClick={() => {
                      if (hasCurrentUser) {
                        callbacks?.onRemoveReaction?.(message.id, emojiName);
                      } else {
                        callbacks?.onAddReaction?.(message.id, emojiName);
                      }
                    }}
                  >
                    <span>{displayChar}</span>
                    {count > 1 && <span className="text-[11px] text-text-muted">{count}</span>}
                  </button>
                );
              })}
            </div>
          )}
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
