import React, { useCallback, useEffect, useRef } from "react";
import { t } from "~/i18n/i18n";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/media-display-url.lib";
import { Icon } from "~/shared/ui/icon";
import { canUseMediaViewerDisplayUrl } from "./media-viewer-actions.lib";
import type {
  MediaViewerThumbnailItemProps,
  MediaViewerThumbnailsProps,
} from "./media-viewer-thumbnails.types";

const MediaViewerThumbnailItem = React.memo<MediaViewerThumbnailItemProps>(
  ({ item, index, isActive, onSelect, buttonRef }) => {
    const displayUrl = canUseMediaViewerDisplayUrl(item.url) ? item.url : undefined;

    const handleClick = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onSelect(index);
      },
      [index, onSelect],
    );

    const thumbSrc = item.type === "image" ? (displayUrl ?? AUTH_IMAGE_PLACEHOLDER_SRC) : undefined;

    return (
      <button
        ref={buttonRef}
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-label={t("mediaViewer.thumbnail", { index: index + 1 })}
        onClick={handleClick}
        className={`relative h-14 w-14 shrink-0 rounded-lg border-2 bg-bg-elevated transition-opacity ${
          isActive ? "border-accent" : "border-transparent opacity-70 hover:opacity-100"
        }`}
      >
        <span className="relative block size-full overflow-hidden rounded-md">
          {thumbSrc != null ? (
            <img src={thumbSrc} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-bg-elevated" />
          )}
        </span>
        {item.type === "video" ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40">
            <Icon name="videos" size={20} className="text-text-primary" />
          </span>
        ) : null}
      </button>
    );
  },
);

MediaViewerThumbnailItem.displayName = "MediaViewerThumbnailItem";

export const MediaViewerThumbnails: React.FC<MediaViewerThumbnailsProps> = ({
  items,
  currentIndex,
  onSelect,
}) => {
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [currentIndex]);

  const handleContainerClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  if (items.length <= 1) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-modal shrink-0 border-t border-white/10 bg-black/70 px-4 py-3"
      onClick={handleContainerClick}
    >
      <p className="mb-2 text-center text-xs text-white/70">
        {t("mediaViewer.position", { current: currentIndex + 1, total: items.length })}
      </p>
      <div className="overflow-x-auto pb-1">
        <div
          className="mx-auto flex w-max min-w-full justify-center gap-2"
          role="tablist"
          aria-label={t("a11y.mediaViewer")}
        >
          {items.map((item, index) => (
            <MediaViewerThumbnailItem
              // Gallery slots keep their identity while their preview is loading.
              key={index}
              item={item}
              index={index}
              isActive={index === currentIndex}
              onSelect={onSelect}
              buttonRef={index === currentIndex ? activeThumbRef : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
