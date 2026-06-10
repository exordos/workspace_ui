import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { MediaViewerControlsProps } from "./media-viewer-controls.types";

const NAV_BUTTON_CLASS =
  "absolute top-1/2 z-float flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg bg-bg-elevated/80 text-text-primary transition-colors hover:bg-bg-elevated";

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
