import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { MediaViewerControlsProps } from "./media-viewer-controls.types";

const NAV_BUTTON_CLASS =
  "fixed top-1/2 z-modal flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70";

export const MediaViewerControls: React.FC<MediaViewerControlsProps> = ({
  show,
  onPrev,
  onNext,
}) => {
  const handlePrev = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onPrev();
    },
    [onPrev],
  );

  const handleNext = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onNext();
    },
    [onNext],
  );

  if (!show) return null;

  return (
    <>
      <button
        type="button"
        onClick={handlePrev}
        className={`${NAV_BUTTON_CLASS} left-4`}
        aria-label={t("mediaViewer.prev")}
      >
        <Icon name="chevron-right" size={24} className="rotate-180" />
      </button>
      <button
        type="button"
        onClick={handleNext}
        className={`${NAV_BUTTON_CLASS} right-4`}
        aria-label={t("mediaViewer.next")}
      >
        <Icon name="chevron-right" size={24} />
      </button>
    </>
  );
};
