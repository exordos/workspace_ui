import React, { useEffect, useRef, useState } from "react";
import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import { normalizeWorkspacePreviewBlob } from "~/entities/messenger/messenger-workspace-message-preview-blob.lib";
import { createDisplayableBlobUrl } from "~/shared/lib/media-display-url.lib";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";

interface WorkspaceMessageMediaThumbnailProps {
  reference: WorkspaceMessageFileReference;
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
  onStatusChange?: (fileUuid: string, status: WorkspaceMessageMediaThumbnailStatus) => void;
}

type PreviewState = { status: "loading" | "error"; url: null } | { status: "ready"; url: string };
export type WorkspaceMessageMediaThumbnailStatus = "loading" | "ready" | "error";

const THUMBNAIL_INTERSECTION_ROOT_MARGIN = "640px 0px";
const NOOP_RELEASE = () => undefined;

export const WorkspaceMessageMediaThumbnail = React.memo(function WorkspaceMessageMediaThumbnail({
  reference,
  onLoadWorkspaceFilePreview,
  onStatusChange,
}: WorkspaceMessageMediaThumbnailProps): React.ReactElement | null {
  const thumbnailRef = useRef<HTMLDivElement | null>(null);
  const releaseUrlRef = useRef<(url: string) => void>(NOOP_RELEASE);
  const [preview, setPreview] = useState<PreviewState>({ status: "loading", url: null });

  useEffect(() => {
    if (onLoadWorkspaceFilePreview == null) {
      return;
    }

    let abortController: AbortController | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    const objectUrls: string[] = [];
    const releasedUrls = new Set<string>();
    let disposed = false;
    let started = false;
    onStatusChange?.(reference.fileUuid, "loading");

    const releaseUrl = (url: string) => {
      if (!url.startsWith("blob:") || releasedUrls.has(url)) return;
      releasedUrls.add(url);
      const registryIndex = objectUrls.indexOf(url);
      if (registryIndex !== -1) {
        objectUrls.splice(registryIndex, 1);
      }
      URL.revokeObjectURL(url);
    };
    releaseUrlRef.current = releaseUrl;

    const startLoad = () => {
      if (started || disposed) return;
      started = true;
      abortController = new AbortController();
      setPreview({ status: "loading", url: null });

      void (async () => {
        try {
          const blob = await onLoadWorkspaceFilePreview(reference, abortController.signal);
          if (disposed) return;

          const normalizedBlob = normalizeWorkspacePreviewBlob(blob, reference.contentType);
          const url = await createDisplayableBlobUrl(normalizedBlob, objectUrls);
          if (disposed) {
            releaseUrl(url);
            return;
          }

          setPreview({ status: "ready", url });
        } catch (error: unknown) {
          if (!disposed && !(error instanceof Error && error.name === "AbortError")) {
            setPreview({ status: "error", url: null });
            onStatusChange?.(reference.fileUuid, "error");
          }
        }
      })();
    };

    if (typeof IntersectionObserver === "undefined" || thumbnailRef.current == null) {
      startLoad();
    } else {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) return;
          intersectionObserver?.disconnect();
          intersectionObserver = null;
          startLoad();
        },
        { rootMargin: THUMBNAIL_INTERSECTION_ROOT_MARGIN },
      );
      intersectionObserver.observe(thumbnailRef.current);
    }

    return () => {
      disposed = true;
      intersectionObserver?.disconnect();
      abortController?.abort();
      while (objectUrls.length > 0) {
        const url = objectUrls.at(-1);
        if (url == null) break;
        releaseUrl(url);
      }
      if (releaseUrlRef.current === releaseUrl) {
        releaseUrlRef.current = NOOP_RELEASE;
      }
    };
  }, [onLoadWorkspaceFilePreview, onStatusChange, reference]);

  if (onLoadWorkspaceFilePreview == null || preview.status === "error") {
    return null;
  }

  const handleDisplayError = () => {
    if (preview.status !== "ready") return;
    releaseUrlRef.current(preview.url);
    setPreview({ status: "error", url: null });
    onStatusChange?.(reference.fileUuid, "error");
  };
  const handleDisplayReady = () => {
    onStatusChange?.(reference.fileUuid, "ready");
  };
  let mediaElement: React.ReactNode = null;
  if (preview.status === "ready") {
    mediaElement =
      reference.mediaKind === "video" ? (
        <video
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          src={preview.url}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          onLoadedData={handleDisplayReady}
          onError={handleDisplayError}
        />
      ) : (
        <img
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          src={preview.url}
          alt=""
          draggable={false}
          onLoad={handleDisplayReady}
          onError={handleDisplayError}
        />
      );
  }

  return (
    <div
      ref={thumbnailRef}
      className="relative min-h-12 w-12 shrink-0 self-stretch overflow-hidden rounded-md bg-bg-elevated"
      data-workspace-quote-media-thumbnail="true"
      data-workspace-quote-media-status={preview.status}
      aria-hidden="true"
    >
      {mediaElement}
    </div>
  );
});

WorkspaceMessageMediaThumbnail.displayName = "WorkspaceMessageMediaThumbnail";
