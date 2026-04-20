import React, { useEffect, useState } from "react";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import { t } from "~/i18n/i18n";

export const LayoutMediaViewerOverlay: React.FC = () => {
  const isOpen = useMediaViewerStore((s) => s.isOpen);
  const items = useMediaViewerStore((s) => s.items);
  const currentIndex = useMediaViewerStore((s) => s.currentIndex);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [currentIndex]);

  if (!isOpen || items.length === 0) return null;

  const item = items[currentIndex];
  if (!item) return null;

  const { close, next, prev } = useMediaViewerStore.getState();

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.max(0.5, Math.min(3, z + e.deltaY * -0.001)));
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-dismiss is standard dialog UX
    <div
      className="fixed inset-0 z-max flex items-center justify-center bg-black/90"
      onClick={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      role="dialog"
      aria-label={t("a11y.mediaViewer")}
      tabIndex={-1}
    >
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
          onWheel={handleWheel}
        />
      )}
      {items.length > 1 && (
        <div className="absolute bottom-4 flex gap-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="bg-bg-elevated/80 rounded-lg px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            ← {t("common.prev")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="bg-bg-elevated/80 rounded-lg px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            {t("common.next")} →
          </button>
        </div>
      )}
    </div>
  );
};
