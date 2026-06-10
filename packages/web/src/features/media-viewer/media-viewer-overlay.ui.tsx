import React, { useCallback, useMemo } from "react";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/protected-message-media";
import { useProtectedMediaDisplayUrl } from "~/shared/lib/protected-message-media.hook";
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

export const MediaViewerOverlay: React.FC = () => {
  const isOpen = useMediaViewerStore((s) => s.isOpen);
  const items = useMediaViewerStore((s) => s.items);
  const currentIndex = useMediaViewerStore((s) => s.currentIndex);
  const close = useMediaViewerStore((s) => s.close);
  const next = useMediaViewerStore((s) => s.next);
  const prev = useMediaViewerStore((s) => s.prev);
  const goTo = useMediaViewerStore((s) => s.goTo);
  const { zoom, onWheel } = useMediaViewerZoom({ currentIndex });
  const item = items[currentIndex] ?? null;
  const displayUrl = useProtectedMediaDisplayUrl(item?.url ?? "", item?.type ?? "image");
  const hasMultipleItems = items.length > 1;

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
          onOpenInNewTab={handleOpenInNewTab}
          onDownload={handleDownload}
          onClose={handleClose}
        />
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center px-16 pb-28 pt-14">
          {item.type === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded video may lack caption tracks
            <video
              src={displayUrl}
              controls
              autoPlay
              className="max-h-[calc(100vh-12rem)] max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
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
