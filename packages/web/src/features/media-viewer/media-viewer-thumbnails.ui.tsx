import React, { useCallback, useEffect, useRef } from "react";
import { t } from "~/i18n/i18n";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/protected-message-media";
import { useProtectedMediaDisplayUrl } from "~/shared/lib/protected-message-media.hook";
import { Icon } from "~/shared/ui/icon";
import type {
  MediaViewerThumbnailItemProps,
  MediaViewerThumbnailsProps,
} from "./media-viewer-thumbnails.types";

const MediaViewerThumbnailItem = React.memo<MediaViewerThumbnailItemProps>(
  ({ item, index, isActive, onSelect, buttonRef }) => {
    const displayUrl = useProtectedMediaDisplayUrl(item.url, item.type);

    const handleClick = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onSelect(index);
      },
      [index, onSelect],
    );

    const thumbSrc =
      item.type === "image"
        ? (displayUrl ?? AUTH_IMAGE_PLACEHOLDER_SRC)
        : (displayUrl ?? undefined);

    return (
      <button
        ref={buttonRef}
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-label={t("mediaViewer.thumbnail", { index: index + 1 })}
        onClick={handleClick}
        className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-bg-elevated transition-shadow ${
          isActive ? "ring-2 ring-accent" : "opacity-70 hover:opacity-100"
        }`}
      >
        {thumbSrc != null ? (
          <img src={thumbSrc} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-bg-elevated" />
        )}
        {item.type === "video" ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
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
      className="absolute inset-x-0 bottom-0 z-float bg-black/60 px-4 py-3"
      onClick={handleContainerClick}
    >
      <p className="mb-2 text-center text-xs text-text-secondary">
        {t("mediaViewer.position", { current: currentIndex + 1, total: items.length })}
      </p>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label={t("a11y.mediaViewer")}
      >
        {items.map((item, index) => (
          <MediaViewerThumbnailItem
            key={`${item.type}:${item.url}`}
            item={item}
            index={index}
            isActive={index === currentIndex}
            onSelect={onSelect}
            buttonRef={index === currentIndex ? activeThumbRef : undefined}
          />
        ))}
      </div>
    </div>
  );
};
