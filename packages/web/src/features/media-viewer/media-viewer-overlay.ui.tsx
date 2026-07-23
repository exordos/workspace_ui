import React, { useCallback, useMemo } from "react";
import { t } from "~/i18n/i18n";
import { isElectron } from "~/shared/lib/electron";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/media-display-url.lib";
import {
  canUseMediaViewerDisplayUrl,
  downloadMediaItem,
  openMediaInNewTab,
} from "./media-viewer-actions.lib";
import { MediaViewerBackdrop } from "./media-viewer-backdrop.ui";
import { MediaViewerControls } from "./media-viewer-controls.ui";
import { MediaViewerThumbnails } from "./media-viewer-thumbnails.ui";
import { MediaViewerToolbar } from "./media-viewer-toolbar.ui";
import { useMediaViewerZoom } from "./media-viewer-zoom.hook";
import { useMediaViewerStore } from "./media-viewer.model";
import type { MediaViewerResourceState } from "./media-viewer.types";

type VisibleMediaState = Exclude<MediaViewerResourceState, "ready">;

function MediaViewerResourcePlaceholder({
  state,
  label,
}: {
  state: VisibleMediaState;
  label: string;
}) {
  return (
    <div
      role={state === "loading" ? "status" : "alert"}
      className="media-viewer-resource-placeholder"
      data-media-viewer-resource-state={state}
    >
      <span className="media-viewer-resource-placeholder__icon" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export const MediaViewerOverlay: React.FC = () => {
  const isOpen = useMediaViewerStore((s) => s.isOpen);
  const items = useMediaViewerStore((s) => s.items);
  const currentIndex = useMediaViewerStore((s) => s.currentIndex);
  const close = useMediaViewerStore((s) => s.close);
  const next = useMediaViewerStore((s) => s.next);
  const prev = useMediaViewerStore((s) => s.prev);
  const goTo = useMediaViewerStore((s) => s.goTo);
  const replaceItem = useMediaViewerStore((s) => s.replaceItem);
  const { zoom, onWheel } = useMediaViewerZoom({ currentIndex });
  const item = items[currentIndex] ?? null;
  const displayUrl = useMemo(() => {
    const url = item?.url;
    return canUseMediaViewerDisplayUrl(url) ? url : undefined;
  }, [item?.url]);
  const hasMultipleItems = items.length > 1;
  const showOpenInNewTab = !isElectron();
  const resourceState =
    item?.resourceState ??
    (displayUrl != null || (item?.type === "image" && item.previewUrl != null)
      ? "ready"
      : "loading");

  const actionsEnabled = useMemo(() => canUseMediaViewerDisplayUrl(displayUrl), [displayUrl]);
  const imageSrc = useMemo(() => {
    if (canUseMediaViewerDisplayUrl(displayUrl)) {
      return displayUrl;
    }
    return item?.previewUrl ?? AUTH_IMAGE_PLACEHOLDER_SRC;
  }, [displayUrl, item?.previewUrl]);

  const handlePrev = useCallback(() => prev(), [prev]);
  const handleNext = useCallback(() => next(), [next]);
  const handleClose = useCallback(() => close(), [close]);
  const handleSelect = useCallback((index: number) => goTo(index), [goTo]);
  const handleVideoDisplayError = useCallback(() => {
    if (item?.type !== "video") return;
    const currentItem = useMediaViewerStore.getState().items[currentIndex];
    if (currentItem !== item) return;
    const workspaceFile =
      item.workspaceFile == null
        ? undefined
        : (({ objectUrl: _objectUrl, ...file }) => file)(item.workspaceFile);

    replaceItem(currentIndex, {
      ...item,
      url: "",
      resourceState: "display-error",
      ...(workspaceFile == null ? {} : { workspaceFile }),
    });
  }, [currentIndex, item, replaceItem]);

  const handleOpenInNewTab = useCallback(() => {
    if (displayUrl == null || !canUseMediaViewerDisplayUrl(displayUrl)) return;
    openMediaInNewTab(displayUrl);
  }, [displayUrl]);

  const handleDownload = useCallback(() => {
    if (item == null) return;
    void downloadMediaItem(item, displayUrl);
  }, [displayUrl, item]);

  const backdropPrev = hasMultipleItems ? handlePrev : undefined;
  const backdropNext = hasMultipleItems ? handleNext : undefined;

  if (!isOpen || items.length === 0) return null;
  if (!item) return null;

  return (
    <MediaViewerBackdrop onClose={close} onPrev={backdropPrev} onNext={backdropNext}>
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <MediaViewerToolbar
          actionsEnabled={actionsEnabled}
          showOpenInNewTab={showOpenInNewTab}
          onOpenInNewTab={handleOpenInNewTab}
          onDownload={handleDownload}
          onClose={handleClose}
        />
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center px-16 pb-28 pt-14">
          {resourceState === "loading" ? (
            <MediaViewerResourcePlaceholder
              state="loading"
              label={
                item.type === "video" ? t("mediaViewer.videoLoading") : t("mediaViewer.loading")
              }
            />
          ) : resourceState === "load-error" ? (
            <MediaViewerResourcePlaceholder
              state="load-error"
              label={
                item.type === "video"
                  ? t("mediaViewer.videoLoadFailed")
                  : t("mediaViewer.unavailable")
              }
            />
          ) : resourceState === "display-error" ? (
            <MediaViewerResourcePlaceholder
              state="display-error"
              label={
                item.type === "video"
                  ? t("mediaViewer.videoDisplayFailed")
                  : t("mediaViewer.unavailable")
              }
            />
          ) : item.type === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded video may lack caption tracks
            <video
              src={displayUrl}
              controls
              autoPlay
              className="max-h-[calc(100vh-12rem)] max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
              onError={handleVideoDisplayError}
            />
          ) : (
            <img
              src={imageSrc}
              alt={item.alt ?? ""}
              role="presentation"
              className="max-h-[calc(100vh-12rem)] max-w-full object-contain transition-transform"
              style={{ transform: `scale(${zoom})` }}
              onClick={(e) => e.stopPropagation()}
              onWheel={onWheel}
            />
          )}
          <MediaViewerControls show={hasMultipleItems} onPrev={handlePrev} onNext={handleNext} />
        </div>
        <MediaViewerThumbnails items={items} currentIndex={currentIndex} onSelect={handleSelect} />
      </div>
    </MediaViewerBackdrop>
  );
};
