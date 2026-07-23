import { useLayoutEffect, useRef, type RefObject } from "react";
import { normalizeWorkspacePreviewBlob } from "~/entities/messenger/messenger-workspace-message-preview-blob.lib";
import { useTranslation } from "~/i18n/i18n";
import { createLogger } from "~/shared/lib/logger";
import {
  AUTH_IMAGE_PLACEHOLDER_SRC,
  createDisplayableBlobUrl,
} from "~/shared/lib/media-display-url.lib";
import { MESSAGE_MEDIA_PREVIEW_CLASS_NAME } from "~/shared/lib/message-body-rich-text-classes";
import { deriveWorkspaceMediaPlaceholderLayout } from "~/shared/lib/workspace-message-render/workspace-media-placeholder-layout.lib";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";

const previewLog = createLogger("workspace-message-preview");

export type LoadWorkspaceFilePreview = (
  file: WorkspaceMessageFileReference,
  signal: AbortSignal,
) => Promise<Blob>;

interface UseWorkspaceMessageFilePreviewsParams {
  bodyRef: RefObject<HTMLDivElement | null>;
  renderedHtml: string;
  fileReferences: readonly WorkspaceMessageFileReference[];
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
}

interface MountedWorkspacePreview {
  abortController: AbortController;
  intersectionObserver: IntersectionObserver | null;
  placeholder: HTMLElement;
  placeholderInitialAspectRatio: string;
  placeholderInitialPosition: string;
  placeholderInitialAriaBusy: string | null;
  placeholderInitialAriaLabel: string | null;
  placeholderInitialRole: string | null;
  placeholderInitialTabIndex: string | null;
  placeholderImage: HTMLImageElement | null;
  placeholderImageInitialSrc: string | null;
  previewImage: HTMLImageElement | null;
  previewVideo: HTMLVideoElement | null;
  videoExpandControl: HTMLButtonElement | null;
  createdPreviewImage: boolean;
  videoVisual: HTMLElement | null;
  label: HTMLElement | null;
  labelInitialText: string | null;
  objectUrl: string | null;
  imageErrorHandler: (() => void) | null;
  videoErrorHandler: (() => void) | null;
  fileUuid: string;
}

type WorkspacePreviewFallbackReason = "display-error" | "load-error" | "missing-loader";

const WORKSPACE_PREVIEW_INTERSECTION_ROOT_MARGIN = "640px 0px";
const WORKSPACE_PREVIEW_KEY_SEPARATOR = "\n";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function buildWorkspaceMediaPreviewKey(
  fileReferences: readonly WorkspaceMessageFileReference[],
): string {
  return fileReferences
    .filter(
      (reference) =>
        reference.kind === "media" &&
        (reference.mediaKind === "image" || reference.mediaKind === "video"),
    )
    .map((reference) =>
      [
        reference.fileUuid.trim(),
        reference.name?.trim() ?? "",
        reference.contentType?.trim() ?? "",
        reference.mediaKind ?? "",
        reference.width ?? "",
        reference.height ?? "",
      ].join("|"),
    )
    .join(WORKSPACE_PREVIEW_KEY_SEPARATOR);
}

function findMediaReference(
  element: HTMLElement,
  fileReferences: readonly WorkspaceMessageFileReference[],
): WorkspaceMessageFileReference | null {
  const fileUuid = element.dataset.workspaceFileUuid?.trim();
  if (fileUuid == null || fileUuid.length === 0) {
    return null;
  }

  return (
    fileReferences.find((reference) => {
      return (
        reference.kind === "media" &&
        (reference.mediaKind === "image" || reference.mediaKind === "video") &&
        reference.fileUuid === fileUuid
      );
    }) ?? null
  );
}

function reservePreviewLayout(
  placeholder: HTMLElement,
  reference: WorkspaceMessageFileReference,
): void {
  if (reference.mediaKind !== "video") {
    return;
  }
  const layout = deriveWorkspaceMediaPlaceholderLayout(reference);
  const visual = placeholder.querySelector<HTMLElement>(
    ".workspace-message-file-placeholder__video-visual",
  );
  placeholder.style.width = `${layout.width}px`;
  if (visual != null) {
    visual.style.aspectRatio = `${layout.aspectRatio}`;
  }
}

function isWorkspacePreviewAlreadyLoaded(placeholder: HTMLElement): boolean {
  if (placeholder.dataset.workspacePreviewStatus !== "loaded") {
    return false;
  }

  const previewElement = placeholder.querySelector<HTMLImageElement | HTMLVideoElement>(
    '[data-workspace-file-preview="true"]',
  );
  const src = previewElement?.getAttribute("src")?.trim() ?? "";
  return src.length > 0 && src !== AUTH_IMAGE_PLACEHOLDER_SRC;
}

function revealFallback(
  mount: MountedWorkspacePreview,
  reason: WorkspacePreviewFallbackReason,
  videoErrorLabel?: string,
): void {
  previewLog.warn("preview fallback", {
    fileUuid: mount.fileUuid,
    reason,
  });
  mount.placeholder.dataset.workspacePreviewStatus =
    reason === "display-error" ? "display-error" : "load-error";
  mount.placeholder.removeAttribute("aria-busy");
  if (videoErrorLabel != null) {
    mount.placeholder.setAttribute("aria-label", videoErrorLabel);
    if (mount.label != null) {
      mount.label.textContent = videoErrorLabel;
    }
  }
  if (mount.placeholderInitialRole != null) {
    mount.placeholder.setAttribute("role", mount.placeholderInitialRole);
  }
  if (mount.placeholderInitialTabIndex != null) {
    mount.placeholder.setAttribute("tabindex", mount.placeholderInitialTabIndex);
  }
  mount.placeholder.classList.remove("workspace-message-file-preview-loaded");
  if (mount.previewImage != null) {
    if (mount.imageErrorHandler != null) {
      mount.previewImage.removeEventListener("error", mount.imageErrorHandler);
    }
    if (mount.createdPreviewImage) {
      mount.previewImage.remove();
    } else {
      mount.previewImage.classList.remove(
        MESSAGE_MEDIA_PREVIEW_CLASS_NAME,
        "workspace-message-file-preview-image",
      );
      delete mount.previewImage.dataset.workspaceFilePreview;
      mount.previewImage.src = mount.placeholderImageInitialSrc ?? AUTH_IMAGE_PLACEHOLDER_SRC;
      mount.previewImage.hidden = false;
    }
  }
  mount.previewImage = null;
  mount.createdPreviewImage = false;
  if (mount.previewVideo != null) {
    if (mount.videoErrorHandler != null) {
      mount.previewVideo.removeEventListener("error", mount.videoErrorHandler);
    }
    mount.previewVideo.remove();
    mount.previewVideo = null;
  }
  mount.videoExpandControl?.remove();
  mount.videoExpandControl = null;
  mount.placeholder.style.position = mount.placeholderInitialPosition;
  if (mount.objectUrl != null) {
    if (mount.objectUrl.startsWith("blob:")) {
      URL.revokeObjectURL(mount.objectUrl);
    }
    mount.objectUrl = null;
  }
  if (mount.placeholderImage != null) {
    mount.placeholderImage.hidden = false;
  }
  if (mount.videoVisual != null) {
    mount.videoVisual.hidden = false;
  }
  if (mount.label != null) {
    mount.label.hidden = false;
  }
  mount.imageErrorHandler = null;
  mount.videoErrorHandler = null;
}

function retainObjectUrl(
  mount: MountedWorkspacePreview,
  displayUrl: string,
  objectUrlRegistry: string[],
): void {
  if (!displayUrl.startsWith("blob:")) {
    return;
  }
  mount.objectUrl = displayUrl;
  const registryIndex = objectUrlRegistry.indexOf(displayUrl);
  if (registryIndex !== -1) {
    objectUrlRegistry.splice(registryIndex, 1);
  }
}

function revealLoadedImagePreview(
  mount: MountedWorkspacePreview,
  reference: WorkspaceMessageFileReference,
  displayUrl: string,
  objectUrlRegistry: string[],
): void {
  const image = mount.placeholderImage ?? document.createElement("img");
  if (mount.placeholderImage == null) {
    mount.createdPreviewImage = true;
  }
  image.classList.add(MESSAGE_MEDIA_PREVIEW_CLASS_NAME, "workspace-message-file-preview-image");
  image.alt = reference.name ?? mount.placeholder.getAttribute("aria-label") ?? "";
  image.dataset.workspaceFilePreview = "true";
  image.decoding = "async";
  image.loading = "eager";
  image.setAttribute("loading", "eager");

  const handleImageError = () => {
    revealFallback(mount, "display-error");
  };
  image.addEventListener("error", handleImageError);

  retainObjectUrl(mount, displayUrl, objectUrlRegistry);
  mount.previewImage = image;
  mount.imageErrorHandler = handleImageError;
  image.hidden = false;
  if (mount.label != null) {
    mount.label.hidden = true;
  }
  mount.placeholder.classList.add("workspace-message-file-preview-loaded");
  mount.placeholder.dataset.workspacePreviewStatus = "loaded";
  mount.placeholder.removeAttribute("aria-busy");
  if (mount.createdPreviewImage) {
    mount.placeholder.appendChild(image);
  }
  image.src = displayUrl;

  previewLog.debug("preview loaded", {
    fileUuid: mount.fileUuid,
    displayUrlKind: displayUrl.startsWith("data:") ? "data" : "blob",
    contentType: reference.contentType ?? null,
  });
}

function revealLoadedVideoPreview(
  mount: MountedWorkspacePreview,
  reference: WorkspaceMessageFileReference,
  displayUrl: string,
  objectUrlRegistry: string[],
  openViewerLabel: string,
  videoDisplayFailedLabel: string,
): void {
  const video = document.createElement("video");
  video.classList.add(MESSAGE_MEDIA_PREVIEW_CLASS_NAME, "workspace-message-file-preview-video");
  video.dataset.workspaceFilePreview = "true";
  video.controls = true;
  video.preload = "metadata";
  video.autoplay = false;
  video.playsInline = true;
  video.setAttribute(
    "aria-label",
    reference.name ?? mount.placeholder.getAttribute("aria-label") ?? "",
  );
  const expandControl = document.createElement("button");
  expandControl.type = "button";
  expandControl.className =
    "workspace-message-file-preview-expand absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-lg text-white shadow transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";
  expandControl.dataset.workspaceVideoExpand = "true";
  expandControl.setAttribute("aria-label", openViewerLabel);
  expandControl.title = openViewerLabel;
  expandControl.textContent = "⛶";

  const handleVideoError = () => {
    revealFallback(mount, "display-error", videoDisplayFailedLabel);
  };
  video.addEventListener("error", handleVideoError);
  retainObjectUrl(mount, displayUrl, objectUrlRegistry);
  mount.previewVideo = video;
  mount.videoExpandControl = expandControl;
  mount.videoErrorHandler = handleVideoError;
  mount.placeholder.appendChild(video);
  mount.placeholder.appendChild(expandControl);
  mount.placeholder.style.position = "relative";
  video.src = displayUrl;
  mount.placeholder.removeAttribute("role");
  mount.placeholder.removeAttribute("tabindex");

  if (mount.placeholderImage != null) {
    mount.placeholderImage.hidden = true;
  }
  if (mount.videoVisual != null) {
    mount.videoVisual.hidden = true;
  }
  if (mount.label != null) {
    mount.label.hidden = true;
  }
  mount.placeholder.classList.add("workspace-message-file-preview-loaded");
  mount.placeholder.dataset.workspacePreviewStatus = "loaded";
  mount.placeholder.removeAttribute("aria-busy");

  previewLog.debug("preview loaded", {
    fileUuid: mount.fileUuid,
    displayUrlKind: displayUrl.startsWith("data:") ? "data" : "blob",
    contentType: reference.contentType ?? null,
    mediaKind: "video",
  });
}

function cleanupPreview(mount: MountedWorkspacePreview): void {
  const wasLoaded = mount.placeholder.dataset.workspacePreviewStatus === "loaded";
  mount.abortController.abort();
  mount.intersectionObserver?.disconnect();
  mount.intersectionObserver = null;
  if (mount.previewImage != null) {
    if (mount.imageErrorHandler != null) {
      mount.previewImage.removeEventListener("error", mount.imageErrorHandler);
    }
  }
  if (mount.previewImage != null) {
    if (mount.createdPreviewImage) {
      mount.previewImage.remove();
    } else {
      mount.previewImage.classList.remove(
        MESSAGE_MEDIA_PREVIEW_CLASS_NAME,
        "workspace-message-file-preview-image",
      );
      delete mount.previewImage.dataset.workspaceFilePreview;
      mount.previewImage.src = mount.placeholderImageInitialSrc ?? AUTH_IMAGE_PLACEHOLDER_SRC;
      mount.previewImage.hidden = false;
    }
    mount.previewImage = null;
  }
  mount.createdPreviewImage = false;
  if (mount.previewVideo != null) {
    if (mount.videoErrorHandler != null) {
      mount.previewVideo.removeEventListener("error", mount.videoErrorHandler);
    }
    mount.previewVideo.removeAttribute("src");
    mount.previewVideo.remove();
    mount.previewVideo = null;
  }
  mount.videoExpandControl?.remove();
  mount.videoExpandControl = null;
  mount.placeholder.style.position = mount.placeholderInitialPosition;
  if (mount.objectUrl != null) {
    URL.revokeObjectURL(mount.objectUrl);
    mount.objectUrl = null;
  }
  if (mount.label != null) {
    mount.label.hidden = false;
  }
  if (mount.placeholderImage != null) {
    mount.placeholderImage.hidden = false;
  }
  if (mount.videoVisual != null) {
    mount.videoVisual.hidden = false;
  }
  mount.placeholder.classList.remove(
    "workspace-message-file-preview-shell",
    "workspace-message-file-preview-loaded",
  );
  mount.placeholder.style.aspectRatio = mount.placeholderInitialAspectRatio;
  if (mount.placeholderInitialAriaBusy != null) {
    mount.placeholder.setAttribute("aria-busy", mount.placeholderInitialAriaBusy);
  } else {
    mount.placeholder.removeAttribute("aria-busy");
  }
  if (mount.placeholderInitialAriaLabel != null) {
    mount.placeholder.setAttribute("aria-label", mount.placeholderInitialAriaLabel);
  } else {
    mount.placeholder.removeAttribute("aria-label");
  }
  if (mount.placeholderInitialRole != null) {
    mount.placeholder.setAttribute("role", mount.placeholderInitialRole);
  }
  if (mount.placeholderInitialTabIndex != null) {
    mount.placeholder.setAttribute("tabindex", mount.placeholderInitialTabIndex);
  }
  if (mount.label != null) {
    mount.label.textContent = mount.labelInitialText;
  }
  delete mount.placeholder.dataset.workspacePreviewStatus;
  mount.imageErrorHandler = null;
  mount.videoErrorHandler = null;

  if (wasLoaded) {
    previewLog.debug("preview cleanup after load", { fileUuid: mount.fileUuid });
  }
}

export function useWorkspaceMessageFilePreviews({
  bodyRef,
  renderedHtml,
  fileReferences,
  onLoadWorkspaceFilePreview,
}: UseWorkspaceMessageFilePreviewsParams): void {
  const { t } = useTranslation();
  const openVideoViewerLabel = t("mediaViewer.openVideo");
  const videoQueuedLabel = t("mediaViewer.videoQueued");
  const videoLoadingLabel = t("mediaViewer.videoLoading");
  const videoLoadFailedLabel = t("mediaViewer.videoLoadFailed");
  const videoDisplayFailedLabel = t("mediaViewer.videoDisplayFailed");
  const latestFileReferencesRef = useRef(fileReferences);
  const latestLoadWorkspaceFilePreviewRef = useRef(onLoadWorkspaceFilePreview);
  const mediaPreviewKey = buildWorkspaceMediaPreviewKey(fileReferences);
  const hasPreviewLoader = onLoadWorkspaceFilePreview != null;

  useLayoutEffect(() => {
    latestFileReferencesRef.current = fileReferences;
  }, [fileReferences]);

  useLayoutEffect(() => {
    latestLoadWorkspaceFilePreviewRef.current = onLoadWorkspaceFilePreview;
  }, [onLoadWorkspaceFilePreview]);

  useLayoutEffect(() => {
    if (!hasPreviewLoader) {
      previewLog.debug("preview layer skipped", { reason: "missing-loader" });
      return;
    }

    const bodyElement = bodyRef.current;
    if (bodyElement == null) {
      previewLog.debug("preview layer skipped", { reason: "missing-body-ref" });
      return;
    }

    const placeholders = Array.from(
      bodyElement.querySelectorAll<HTMLElement>(
        "[data-workspace-file='true'][data-workspace-file-kind='media'][data-workspace-media-kind][data-workspace-file-uuid]",
      ),
    );
    const mounts: MountedWorkspacePreview[] = [];
    const currentFileReferences = latestFileReferencesRef.current;
    const objectUrlRegistry: string[] = [];

    previewLog.debug("preview scan", {
      placeholderCount: placeholders.length,
      mediaPreviewKey,
      renderedHtmlLength: renderedHtml.length,
    });

    for (const placeholder of placeholders) {
      const fileUuid = placeholder.dataset.workspaceFileUuid?.trim() ?? "";
      const reference = findMediaReference(placeholder, currentFileReferences);
      if (reference == null) {
        previewLog.warn("preview reference missing", { fileUuid });
        continue;
      }

      if (isWorkspacePreviewAlreadyLoaded(placeholder)) {
        previewLog.debug("preview already loaded", { fileUuid });
        continue;
      }

      const abortController = new AbortController();
      const mount: MountedWorkspacePreview = {
        abortController,
        intersectionObserver: null,
        placeholder,
        placeholderInitialAspectRatio: placeholder.style.aspectRatio,
        placeholderInitialPosition: placeholder.style.position,
        placeholderInitialAriaBusy: placeholder.getAttribute("aria-busy"),
        placeholderInitialAriaLabel: placeholder.getAttribute("aria-label"),
        placeholderInitialRole: placeholder.getAttribute("role"),
        placeholderInitialTabIndex: placeholder.getAttribute("tabindex"),
        placeholderImage: placeholder.querySelector<HTMLImageElement>(
          "img.workspace-message-file-placeholder__image",
        ),
        placeholderImageInitialSrc:
          placeholder
            .querySelector<HTMLImageElement>("img.workspace-message-file-placeholder__image")
            ?.getAttribute("src") ?? null,
        previewImage: null,
        previewVideo: null,
        videoExpandControl: null,
        createdPreviewImage: false,
        videoVisual: placeholder.querySelector<HTMLElement>(
          ".workspace-message-file-placeholder__video-visual",
        ),
        label: placeholder.querySelector<HTMLElement>(".workspace-message-file-placeholder__label"),
        labelInitialText:
          placeholder.querySelector<HTMLElement>(".workspace-message-file-placeholder__label")
            ?.textContent ?? null,
        objectUrl: null,
        imageErrorHandler: null,
        videoErrorHandler: null,
        fileUuid,
      };
      mounts.push(mount);

      placeholder.classList.add("workspace-message-file-preview-shell");
      placeholder.dataset.workspacePreviewStatus = "queued";
      placeholder.removeAttribute("aria-busy");
      if (reference.mediaKind === "video") {
        placeholder.setAttribute("aria-label", videoQueuedLabel);
        if (mount.label != null) {
          mount.label.textContent = videoQueuedLabel;
        }
      }
      reservePreviewLayout(placeholder, reference);

      let previewStarted = false;
      const startPreviewLoad = () => {
        if (previewStarted || abortController.signal.aborted) {
          return;
        }
        previewStarted = true;
        placeholder.dataset.workspacePreviewStatus = "loading";
        placeholder.setAttribute("aria-busy", "true");
        if (reference.mediaKind === "video") {
          placeholder.setAttribute("aria-label", videoLoadingLabel);
          if (mount.label != null) {
            mount.label.textContent = videoLoadingLabel;
          }
        }
        previewLog.debug("preview load started", {
          fileUuid,
          contentType: reference.contentType ?? null,
        });

        const loadWorkspaceFilePreview = latestLoadWorkspaceFilePreviewRef.current;
        if (loadWorkspaceFilePreview == null) {
          revealFallback(
            mount,
            "missing-loader",
            reference.mediaKind === "video" ? videoLoadFailedLabel : undefined,
          );
          return;
        }

        void (async () => {
          let blob: Blob;
          try {
            blob = await loadWorkspaceFilePreview(reference, abortController.signal);
          } catch (error: unknown) {
            if (!abortController.signal.aborted && !isAbortError(error)) {
              previewLog.warn("preview load failed", {
                fileUuid,
                error: error instanceof Error ? error.name : "unknown",
              });
              revealFallback(
                mount,
                "load-error",
                reference.mediaKind === "video" ? videoLoadFailedLabel : undefined,
              );
            }
            return;
          }

          if (abortController.signal.aborted) {
            previewLog.debug("preview aborted before display", {
              fileUuid,
              stage: "after-blob",
            });
            return;
          }

          try {
            const normalizedBlob = normalizeWorkspacePreviewBlob(blob, reference.contentType);
            if (normalizedBlob.type !== blob.type) {
              previewLog.debug("preview blob retyped", {
                fileUuid,
                fromType: blob.type || null,
                toType: normalizedBlob.type,
              });
            }

            const displayUrl = await createDisplayableBlobUrl(normalizedBlob, objectUrlRegistry);
            if (abortController.signal.aborted) {
              previewLog.debug("preview aborted before display", {
                fileUuid,
                stage: "after-display-url",
              });
              return;
            }

            if (reference.mediaKind === "video") {
              revealLoadedVideoPreview(
                mount,
                reference,
                displayUrl,
                objectUrlRegistry,
                openVideoViewerLabel,
                videoDisplayFailedLabel,
              );
            } else {
              revealLoadedImagePreview(mount, reference, displayUrl, objectUrlRegistry);
            }
          } catch (error: unknown) {
            if (!abortController.signal.aborted && !isAbortError(error)) {
              previewLog.warn("preview display failed", {
                fileUuid,
                error: error instanceof Error ? error.name : "unknown",
              });
              revealFallback(
                mount,
                "display-error",
                reference.mediaKind === "video" ? videoDisplayFailedLabel : undefined,
              );
            }
          }
        })();
      };

      if (typeof IntersectionObserver === "undefined") {
        startPreviewLoad();
        continue;
      }

      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          const shouldLoad = entries.some(
            (entry) => entry.isIntersecting || entry.intersectionRatio > 0,
          );
          if (!shouldLoad) {
            return;
          }
          intersectionObserver.disconnect();
          mount.intersectionObserver = null;
          startPreviewLoad();
        },
        { rootMargin: WORKSPACE_PREVIEW_INTERSECTION_ROOT_MARGIN },
      );
      mount.intersectionObserver = intersectionObserver;
      intersectionObserver.observe(placeholder);
    }

    return () => {
      for (const mount of mounts) {
        cleanupPreview(mount);
      }
      for (const objectUrl of objectUrlRegistry) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    bodyRef,
    hasPreviewLoader,
    mediaPreviewKey,
    onLoadWorkspaceFilePreview,
    openVideoViewerLabel,
    renderedHtml,
    videoLoadFailedLabel,
    videoDisplayFailedLabel,
    videoLoadingLabel,
    videoQueuedLabel,
  ]);
}
