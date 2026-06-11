import type { DownloadProgress } from "~/entities/download/download.types";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import type { MediaItem } from "~/features/media-viewer/media-viewer.types";
import type { MockMessage } from "~/shared/api/zulip.types";
import { buildAuthHeader } from "~/shared/lib/auth-guard";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/protected-message-media";
import {
  deriveAttachmentFileName,
  downloadUserUploadAttachment,
  extractUserUploadPath,
} from "./message-attachment-download.lib";
import { LABEL_TO_ACTION } from "./message-bubble-context.lib";
import { normalizeMediaUrl, resolveVideoElementMediaUrl } from "./message-list-media.lib";
import type { ContextItemLabel } from "./message-bubble-context.lib";
import type {
  MessageBubbleAttachmentDownloadStatus,
  MessageBubbleCallbacks,
} from "./message-bubble.types";
import type { MessageMediaGallery } from "./message-list-media.lib";

export interface MessageBubbleMentionPopoverState {
  userId: number;
  anchorRect: DOMRect;
  fallbackName: string;
}

export interface MessageBodyClickDeps {
  mediaGallery?: MessageMediaGallery;
  callbacks?: MessageBubbleCallbacks;
  startDownload: (path: string, fileName: string) => boolean;
  setDownloadProgress: (path: string, progress: DownloadProgress) => void;
  finishDownload: (path: string, success: boolean) => void;
  setAttachmentStatus: (path: string, status: MessageBubbleAttachmentDownloadStatus) => void;
  scheduleAttachmentStatusClear: (path: string, delayMs?: number) => void;
  onMentionPopoverOpen: (state: MessageBubbleMentionPopoverState) => void;
}

export interface MessageBubbleMenuActionDeps {
  message: MockMessage;
  jitsiUrl: string | null;
  jitsiLocationName: string;
  callbacks?: MessageBubbleCallbacks;
  replySelectionRef: { current: string | undefined };
  closeMenu: () => void;
}

/** Maps a click target to the nearest HTMLElement for bubble interaction routing. */
export function resolveMessageBodyClickHit(rawTarget: EventTarget | null): HTMLElement | null {
  if (rawTarget instanceof HTMLElement) {
    return rawTarget;
  }
  if (rawTarget instanceof Node) {
    return rawTarget.parentElement;
  }
  return null;
}

function openSingleMediaItem(item: MediaItem): void {
  useMediaViewerStore.getState().open([item], 0);
}

function openGalleryMedia(
  gallery: MessageMediaGallery,
  lookupUrl: string,
  fallback: MediaItem,
): void {
  const galleryIndex = gallery.indexByUrl.get(lookupUrl);
  if (galleryIndex != null && gallery.items.length > 0) {
    const currentItem = gallery.items[galleryIndex];
    if (
      currentItem?.type === "image" &&
      fallback.type === "image" &&
      fallback.previewUrl != null &&
      fallback.previewUrl !== ""
    ) {
      const nextItems = gallery.items.map((item, index) =>
        index === galleryIndex ? { ...item, previewUrl: fallback.previewUrl } : item,
      );
      useMediaViewerStore.getState().open(nextItems, galleryIndex);
      return;
    }
    useMediaViewerStore.getState().open(gallery.items, galleryIndex);
    return;
  }
  openSingleMediaItem(fallback);
}

function resolveImagePreviewUrl(image: HTMLImageElement): string | undefined {
  const src = image.currentSrc || image.src;
  if (src === "" || src === AUTH_IMAGE_PLACEHOLDER_SRC) {
    return undefined;
  }
  return src;
}

function handleImageBodyClick(
  event: MouseEvent,
  image: HTMLImageElement,
  deps: MessageBodyClickDeps,
): boolean {
  if (image.classList.contains("message-inline-emoji")) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const originalUrl = normalizeMediaUrl(image.dataset.originalSrc ?? image.currentSrc ?? image.src);
  if (originalUrl === "") {
    return true;
  }
  const imageItem: MediaItem = {
    url: originalUrl,
    type: "image",
    previewUrl: resolveImagePreviewUrl(image),
  };
  const gallery = deps.mediaGallery;
  if (gallery != null) {
    openGalleryMedia(gallery, originalUrl, imageItem);
  } else {
    openSingleMediaItem(imageItem);
  }
  return true;
}

function handleVideoBodyClick(event: MouseEvent, videoElement: HTMLVideoElement): boolean {
  const clickTarget = event.target;
  if (
    clickTarget instanceof Element &&
    clickTarget !== videoElement &&
    videoElement.contains(clickTarget)
  ) {
    return false;
  }
  return false;
}

function openVideoBodyInViewer(
  event: MouseEvent,
  videoElement: HTMLVideoElement,
  deps: MessageBodyClickDeps,
): boolean {
  event.preventDefault();
  event.stopPropagation();
  const rawSrc = resolveVideoElementMediaUrl(videoElement);
  if (rawSrc === "") {
    return true;
  }
  if (rawSrc.startsWith("blob:")) {
    openSingleMediaItem({ url: rawSrc, type: "video" });
    return true;
  }
  const lookupUrl = normalizeMediaUrl(rawSrc);
  const gallery = deps.mediaGallery;
  if (gallery != null) {
    openGalleryMedia(gallery, lookupUrl, { url: lookupUrl, type: "video" });
  } else {
    openSingleMediaItem({ url: lookupUrl, type: "video" });
  }
  return true;
}

function handleMentionBodyClick(
  event: MouseEvent,
  mentionSpan: Element,
  deps: MessageBodyClickDeps,
): boolean {
  if (deps.callbacks?.onOpenDirectMessage == null) {
    return false;
  }
  if (mentionSpan.classList.contains("user-group-mention")) {
    return false;
  }
  const raw = mentionSpan.getAttribute("data-user-id");
  if (raw === "*" || raw == null || raw.trim() === "") {
    return false;
  }
  const id = Number(raw);
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  deps.onMentionPopoverOpen({
    userId: id,
    anchorRect: mentionSpan.getBoundingClientRect(),
    fallbackName: mentionSpan.textContent?.trim() ?? "",
  });
  return true;
}

function toggleSpoilerBlock(event: MouseEvent, spoilerHeader: Element): boolean {
  event.preventDefault();
  event.stopPropagation();
  spoilerHeader.closest(".spoiler-block")?.classList.toggle("open");
  return true;
}

function toggleInlineSpoiler(event: MouseEvent, inlineSpoiler: Element): boolean {
  event.preventDefault();
  event.stopPropagation();
  inlineSpoiler.classList.toggle("open");
  return true;
}

function handleAttachmentLinkClick(
  event: MouseEvent,
  clickedLink: HTMLAnchorElement,
  deps: MessageBodyClickDeps,
): boolean {
  const href = clickedLink.getAttribute("href") ?? "";
  const attachmentPath = extractUserUploadPath(href);
  const containsImage = clickedLink.querySelector("img") != null;
  const containsVideo = clickedLink.querySelector("video") != null;
  if (attachmentPath == null || containsImage || containsVideo) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  const fileName = deriveAttachmentFileName(clickedLink.textContent ?? "", attachmentPath);
  if (!deps.startDownload(attachmentPath, fileName)) {
    return true;
  }
  deps.setAttachmentStatus(attachmentPath, "downloading");

  void downloadUserUploadAttachment({
    path: attachmentPath,
    fileName,
    authHeaders: buildAuthHeader(),
    credentials: "include",
    onProgress: (progress) => {
      deps.setDownloadProgress(attachmentPath, progress);
    },
  })
    .then((success) => {
      deps.finishDownload(attachmentPath, success);
      deps.setAttachmentStatus(attachmentPath, success ? "downloaded" : "error");
      deps.scheduleAttachmentStatusClear(attachmentPath);
    })
    .catch(() => {
      deps.finishDownload(attachmentPath, false);
      deps.setAttachmentStatus(attachmentPath, "error");
      deps.scheduleAttachmentStatusClear(attachmentPath);
    });
  return true;
}

function handlePermalinkClick(
  event: MouseEvent,
  href: string,
  deps: MessageBodyClickDeps,
): boolean {
  if (deps.callbacks?.onPermalinkClick?.(href) !== true) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}

/** Routes a message-body click to image, video, mention, spoiler, attachment, or permalink handlers. */
export function handleMessageBodyClick(
  event: MouseEvent,
  hit: HTMLElement,
  deps: MessageBodyClickDeps,
): void {
  if (hit.tagName === "IMG") {
    handleImageBodyClick(event, hit as HTMLImageElement, deps);
    return;
  }

  const videoElement = hit.closest("video");
  if (videoElement instanceof HTMLVideoElement) {
    handleVideoBodyClick(event, videoElement);
    return;
  }

  const mentionSpan = hit.closest("span.user-mention[data-user-id]");
  if (mentionSpan != null && handleMentionBodyClick(event, mentionSpan, deps)) {
    return;
  }

  const spoilerHeader = hit.closest(".spoiler-header");
  if (spoilerHeader != null) {
    toggleSpoilerBlock(event, spoilerHeader);
    return;
  }

  const inlineSpoiler = hit.closest(".inline-spoiler");
  if (inlineSpoiler != null) {
    toggleInlineSpoiler(event, inlineSpoiler);
    return;
  }

  const clickedLink = hit.closest<HTMLAnchorElement>("a[href]");
  if (clickedLink == null) {
    return;
  }

  if (handleAttachmentLinkClick(event, clickedLink, deps)) {
    return;
  }

  const href = clickedLink.getAttribute("href") ?? "";
  handlePermalinkClick(event, href, deps);
}

export function handleMessageBodyDoubleClick(
  event: MouseEvent,
  hit: HTMLElement,
  deps: MessageBodyClickDeps,
): void {
  const videoElement = hit.closest("video");
  if (videoElement == null) {
    return;
  }
  openVideoBodyInViewer(event, videoElement, deps);
}

export function captureReplySelectionForContextMenu(
  messageBody: HTMLDivElement | null,
  replySelectionRef: { current: string | undefined },
): void {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim();
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
}

function clearReplySelectionAndClose(
  replySelectionRef: { current: string | undefined },
  closeMenu: () => void,
): void {
  replySelectionRef.current = undefined;
  closeMenu();
}

function runJitsiMenuAction(
  label: "joinCall" | "copyCallLink",
  deps: MessageBubbleMenuActionDeps,
): void {
  if (label === "joinCall" && deps.jitsiUrl != null) {
    deps.callbacks?.onOpenJitsiCall?.(deps.jitsiUrl, deps.jitsiLocationName);
  }
  if (label === "copyCallLink" && deps.jitsiUrl != null && deps.callbacks?.onCopy != null) {
    deps.callbacks.onCopy({ ...deps.message, content: deps.jitsiUrl });
  }
  clearReplySelectionAndClose(deps.replySelectionRef, deps.closeMenu);
}

function runSelectionMenuAction(
  label: "reply" | "forward",
  deps: MessageBubbleMenuActionDeps,
): void {
  const selectedText = deps.replySelectionRef.current;
  deps.replySelectionRef.current = undefined;
  if (label === "reply") {
    deps.callbacks?.onReply?.(deps.message, selectedText);
  } else {
    deps.callbacks?.onForward?.(deps.message, selectedText);
  }
  deps.closeMenu();
}

/** Dispatches a context-menu label to the matching bubble callback. */
export function executeMessageBubbleMenuAction(
  label: ContextItemLabel,
  deps: MessageBubbleMenuActionDeps,
): void {
  if (label === "joinCall" || label === "copyCallLink") {
    runJitsiMenuAction(label, deps);
    return;
  }
  if (label === "reply" || label === "forward") {
    runSelectionMenuAction(label, deps);
    return;
  }

  const action = LABEL_TO_ACTION[label];
  if (action != null && deps.callbacks?.[action] != null) {
    deps.callbacks[action](deps.message);
  }
  clearReplySelectionAndClose(deps.replySelectionRef, deps.closeMenu);
}

export function filterVisibleContextSections(
  contextSections: readonly (readonly ContextItemLabel[])[],
  options: {
    isOwn: boolean;
    isJitsiCall: boolean;
    callbacks?: MessageBubbleCallbacks;
  },
): ContextItemLabel[][] {
  return contextSections
    .map((section) =>
      section.filter((label) => {
        if ((label === "edit" || label === "delete") && !options.isOwn) {
          return false;
        }
        if (label === "openInChat" && options.callbacks?.onOpenInChat == null) {
          return false;
        }
        if (
          label === "joinCall" &&
          (options.callbacks?.onOpenJitsiCall == null || !options.isJitsiCall)
        ) {
          return false;
        }
        if (
          label === "copyCallLink" &&
          (options.callbacks?.onCopy == null || !options.isJitsiCall)
        ) {
          return false;
        }
        return true;
      }),
    )
    .filter((section) => section.length > 0);
}
