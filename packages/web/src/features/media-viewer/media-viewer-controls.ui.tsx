import React from "react";
import { t } from "~/i18n/i18n";
import type { MediaViewerControlsProps } from "./media-viewer-controls.types";

export const MediaViewerControls: React.FC<MediaViewerControlsProps> = ({ show, onPrev, onNext }) => {
  if (!show) return null;

  return (
    <div className="absolute bottom-4 flex gap-4">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        className="bg-bg-elevated/80 rounded-lg px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
      >
        ← {t("common.prev")}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        className="bg-bg-elevated/80 rounded-lg px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
      >
        {t("common.next")} →
      </button>
    </div>
  );
};

