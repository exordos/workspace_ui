import React, { useCallback } from "react";
import { useMediaViewerStore } from "./media-viewer.model";
import { MediaViewerBackdrop } from "./media-viewer-backdrop.ui";
import { MediaViewerControls } from "./media-viewer-controls.ui";
import { useMediaViewerZoom } from "./media-viewer-zoom.hook";

export const MediaViewerOverlay: React.FC = () => {
  const isOpen = useMediaViewerStore((s) => s.isOpen);
  const items = useMediaViewerStore((s) => s.items);
  const currentIndex = useMediaViewerStore((s) => s.currentIndex);
  const close = useMediaViewerStore((s) => s.close);
  const next = useMediaViewerStore((s) => s.next);
  const prev = useMediaViewerStore((s) => s.prev);
  const { zoom, onWheel } = useMediaViewerZoom({ currentIndex });

  const handlePrev = useCallback(() => prev(), [prev]);
  const handleNext = useCallback(() => next(), [next]);

  if (!isOpen || items.length === 0) return null;

  const item = items[currentIndex];
  if (!item) return null;

  return (
    <MediaViewerBackdrop onClose={close}>
      {item.type === "video" ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded media without caption tracks
        <video
          src={item.url}
          controls
          autoPlay
          className="max-h-[90vh] max-w-[90vw]"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={item.url}
          alt={item.alt ?? ""}
          role="presentation"
          className="max-h-[90vh] max-w-[90vw] object-contain transition-transform"
          style={{ transform: `scale(${zoom})` }}
          onClick={(e) => e.stopPropagation()}
          onWheel={onWheel}
        />
      )}
      <MediaViewerControls show={items.length > 1} onPrev={handlePrev} onNext={handleNext} />
    </MediaViewerBackdrop>
  );
};

