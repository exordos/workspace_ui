import { useEffect, type RefObject } from "react";
import { MESSAGE_MEDIA_PREVIEW_CLASS_NAME } from "~/shared/lib/message-body-rich-text-classes";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";

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
  placeholder: HTMLElement;
  image: HTMLImageElement | null;
  label: HTMLElement | null;
  objectUrl: string | null;
  imageErrorHandler: (() => void) | null;
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

function revealFallback(mount: MountedWorkspacePreview): void {
  mount.placeholder.dataset.workspacePreviewStatus = "error";
  mount.placeholder.classList.remove("workspace-message-file-preview-loaded");
  if (mount.label != null) {
    mount.label.hidden = false;
  }
  if (mount.image != null) {
    if (mount.imageErrorHandler != null) {
      mount.image.removeEventListener("error", mount.imageErrorHandler);
    }
    mount.image.remove();
    mount.image = null;
  }
  if (mount.objectUrl != null) {
    URL.revokeObjectURL(mount.objectUrl);
    mount.objectUrl = null;
  }
  mount.imageErrorHandler = null;
}

function cleanupPreview(mount: MountedWorkspacePreview): void {
  mount.abortController.abort();
  if (mount.image != null && mount.imageErrorHandler != null) {
    mount.image.removeEventListener("error", mount.imageErrorHandler);
  }
  if (mount.image != null) {
    mount.image.remove();
    mount.image = null;
  }
  if (mount.objectUrl != null) {
    URL.revokeObjectURL(mount.objectUrl);
    mount.objectUrl = null;
  }
  if (mount.label != null) {
    mount.label.hidden = false;
  }
  mount.placeholder.classList.remove(
    "workspace-message-file-preview-shell",
    "workspace-message-file-preview-loaded",
  );
  delete mount.placeholder.dataset.workspacePreviewStatus;
  mount.imageErrorHandler = null;
}

export function useWorkspaceMessageFilePreviews({
  bodyRef,
  renderedHtml,
  fileReferences,
  onLoadWorkspaceFilePreview,
}: UseWorkspaceMessageFilePreviewsParams): void {
  useEffect(() => {
    if (onLoadWorkspaceFilePreview == null) {
      return;
    }

    const bodyElement = bodyRef.current;
    if (bodyElement == null) {
      return;
    }

    const placeholders = Array.from(
      bodyElement.querySelectorAll<HTMLElement>(
        "[data-workspace-file='true'][data-workspace-file-kind='media'][data-workspace-media-kind='image'][data-workspace-file-uuid]",
      ),
    );
    const mounts: MountedWorkspacePreview[] = [];

    for (const placeholder of placeholders) {
      const reference = findImageReference(placeholder, fileReferences);
      if (reference == null) {
        continue;
      }

      const abortController = new AbortController();
      const mount: MountedWorkspacePreview = {
        abortController,
        placeholder,
        image: null,
        label: placeholder.querySelector<HTMLElement>(".workspace-message-file-placeholder__label"),
        objectUrl: null,
        imageErrorHandler: null,
      };
      mounts.push(mount);

      placeholder.classList.add("workspace-message-file-preview-shell");
      placeholder.dataset.workspacePreviewStatus = "loading";

      void onLoadWorkspaceFilePreview(reference, abortController.signal)
        .then((blob) => {
          if (abortController.signal.aborted) {
            return;
          }

          const objectUrl = URL.createObjectURL(blob);
          if (abortController.signal.aborted) {
            URL.revokeObjectURL(objectUrl);
            return;
          }

          const image = document.createElement("img");
          image.className = MESSAGE_MEDIA_PREVIEW_CLASS_NAME;
          image.alt = reference.name ?? placeholder.getAttribute("aria-label") ?? "";
          image.dataset.workspaceFilePreview = "true";
          image.decoding = "async";
          image.loading = "lazy";

          const handleImageError = () => {
            revealFallback(mount);
          };
          image.addEventListener("error", handleImageError);

          mount.objectUrl = objectUrl;
          mount.image = image;
          mount.imageErrorHandler = handleImageError;
          if (mount.label != null) {
            mount.label.hidden = true;
          }
          placeholder.classList.add("workspace-message-file-preview-loaded");
          placeholder.dataset.workspacePreviewStatus = "loaded";
          image.src = objectUrl;
          placeholder.appendChild(image);
        })
        .catch(() => {
          if (!abortController.signal.aborted) {
            revealFallback(mount);
          }
        });
    }

    return () => {
      for (const mount of mounts) {
        cleanupPreview(mount);
      }
    };
  }, [bodyRef, fileReferences, onLoadWorkspaceFilePreview, renderedHtml]);
}
