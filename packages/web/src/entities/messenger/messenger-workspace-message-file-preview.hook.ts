import { useLayoutEffect, useRef, type RefObject } from "react";
import { normalizeWorkspacePreviewBlob } from "~/entities/messenger/messenger-workspace-message-preview-blob.lib";
import { createLogger } from "~/shared/lib/logger";
import {
  AUTH_IMAGE_PLACEHOLDER_SRC,
  createDisplayableBlobUrl,
} from "~/shared/lib/media-display-url.lib";
import { MESSAGE_MEDIA_PREVIEW_CLASS_NAME } from "~/shared/lib/message-body-rich-text-classes";
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
  placeholderImage: HTMLImageElement | null;
  placeholderImageInitialSrc: string | null;
  previewImage: HTMLImageElement | null;
  createdPreviewImage: boolean;
  label: HTMLElement | null;
  objectUrl: string | null;
  imageErrorHandler: (() => void) | null;
  fileUuid: string;
}

const WORKSPACE_PREVIEW_INTERSECTION_ROOT_MARGIN = "640px 0px";
const WORKSPACE_PREVIEW_KEY_SEPARATOR = "\n";

function buildWorkspaceImagePreviewKey(
  fileReferences: readonly WorkspaceMessageFileReference[],
): string {
  return fileReferences
    .filter((reference) => reference.kind === "media" && reference.mediaKind === "image")
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

function findImageReference(
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
        reference.mediaKind === "image" &&
        reference.fileUuid === fileUuid
      );
    }) ?? null
  );
}

function hasStableMediaDimensions(reference: WorkspaceMessageFileReference): boolean {
  return (
    reference.width != null &&
    reference.height != null &&
    Number.isFinite(reference.width) &&
    Number.isFinite(reference.height) &&
    reference.width > 0 &&
    reference.height > 0
  );
}

function reservePreviewAspectRatio(
  placeholder: HTMLElement,
  reference: WorkspaceMessageFileReference,
): void {
  if (!hasStableMediaDimensions(reference)) {
    return;
  }
  placeholder.style.aspectRatio = `${reference.width} / ${reference.height}`;
}

function isWorkspacePreviewAlreadyLoaded(placeholder: HTMLElement): boolean {
  if (placeholder.dataset.workspacePreviewStatus !== "loaded") {
    return false;
  }

  const previewImage = placeholder.querySelector<HTMLImageElement>(
    'img[data-workspace-file-preview="true"]',
  );
  const src = previewImage?.getAttribute("src")?.trim() ?? "";
  return src.length > 0 && src !== AUTH_IMAGE_PLACEHOLDER_SRC;
}

function revealFallback(mount: MountedWorkspacePreview, reason: string): void {
  previewLog.warn("preview fallback", {
    fileUuid: mount.fileUuid,
    reason,
  });
  mount.placeholder.dataset.workspacePreviewStatus = "error";
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
  if (mount.objectUrl != null) {
    if (mount.objectUrl.startsWith("blob:")) {
      URL.revokeObjectURL(mount.objectUrl);
    }
    mount.objectUrl = null;
  }
  if (mount.placeholderImage != null) {
    mount.placeholderImage.hidden = false;
  }
  if (mount.label != null) {
    mount.label.hidden = false;
  }
  mount.imageErrorHandler = null;
}

function revealLoadedPreview(
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
    revealFallback(mount, "image-decode-error");
  };
  image.addEventListener("error", handleImageError);

  if (displayUrl.startsWith("blob:")) {
    mount.objectUrl = displayUrl;
    const registryIndex = objectUrlRegistry.indexOf(displayUrl);
    if (registryIndex !== -1) {
      objectUrlRegistry.splice(registryIndex, 1);
    }
  }
  mount.previewImage = image;
  mount.imageErrorHandler = handleImageError;
  image.hidden = false;
  if (mount.label != null) {
    mount.label.hidden = true;
  }
  mount.placeholder.classList.add("workspace-message-file-preview-loaded");
  mount.placeholder.dataset.workspacePreviewStatus = "loaded";
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
  mount.placeholder.classList.remove(
    "workspace-message-file-preview-shell",
    "workspace-message-file-preview-loaded",
  );
  mount.placeholder.style.aspectRatio = mount.placeholderInitialAspectRatio;
  delete mount.placeholder.dataset.workspacePreviewStatus;
  mount.imageErrorHandler = null;

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
  const latestFileReferencesRef = useRef(fileReferences);
  const latestLoadWorkspaceFilePreviewRef = useRef(onLoadWorkspaceFilePreview);
  const imagePreviewKey = buildWorkspaceImagePreviewKey(fileReferences);
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
        "[data-workspace-file='true'][data-workspace-file-kind='media'][data-workspace-media-kind='image'][data-workspace-file-uuid]",
      ),
    );
    const mounts: MountedWorkspacePreview[] = [];
    const currentFileReferences = latestFileReferencesRef.current;
    const objectUrlRegistry: string[] = [];

    previewLog.debug("preview scan", {
      placeholderCount: placeholders.length,
      imagePreviewKey,
      renderedHtmlLength: renderedHtml.length,
    });

    for (const placeholder of placeholders) {
      const fileUuid = placeholder.dataset.workspaceFileUuid?.trim() ?? "";
      const reference = findImageReference(placeholder, currentFileReferences);
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
        placeholderImage: placeholder.querySelector<HTMLImageElement>(
          "img.workspace-message-file-placeholder__image",
        ),
        placeholderImageInitialSrc:
          placeholder
            .querySelector<HTMLImageElement>("img.workspace-message-file-placeholder__image")
            ?.getAttribute("src") ?? null,
        previewImage: null,
        createdPreviewImage: false,
        label: placeholder.querySelector<HTMLElement>(".workspace-message-file-placeholder__label"),
        objectUrl: null,
        imageErrorHandler: null,
        fileUuid,
      };
      mounts.push(mount);

      placeholder.classList.add("workspace-message-file-preview-shell");
      placeholder.dataset.workspacePreviewStatus = "queued";
      reservePreviewAspectRatio(placeholder, reference);

      let previewStarted = false;
      const startPreviewLoad = () => {
        if (previewStarted || abortController.signal.aborted) {
          return;
        }
        previewStarted = true;
        placeholder.dataset.workspacePreviewStatus = "loading";
        previewLog.debug("preview load started", {
          fileUuid,
          contentType: reference.contentType ?? null,
        });

        const loadWorkspaceFilePreview = latestLoadWorkspaceFilePreviewRef.current;
        if (loadWorkspaceFilePreview == null) {
          revealFallback(mount, "missing-loader");
          return;
        }

        void loadWorkspaceFilePreview(reference, abortController.signal)
          .then(async (blob) => {
            if (abortController.signal.aborted) {
              previewLog.debug("preview aborted before display", {
                fileUuid,
                stage: "after-blob",
              });
              return;
            }

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

            revealLoadedPreview(mount, reference, displayUrl, objectUrlRegistry);
          })
          .catch((error: unknown) => {
            if (!abortController.signal.aborted) {
              previewLog.warn("preview load failed", {
                fileUuid,
                error: error instanceof Error ? error.name : "unknown",
              });
              revealFallback(mount, "load-failed");
            }
          });
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
  }, [bodyRef, hasPreviewLoader, imagePreviewKey, onLoadWorkspaceFilePreview, renderedHtml]);
}
