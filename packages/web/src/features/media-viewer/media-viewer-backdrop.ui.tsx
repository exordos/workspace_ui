import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";

export interface MediaViewerBackdropProps {
  onClose: () => void;
  children: React.ReactNode;
}

export const MediaViewerBackdrop: React.FC<MediaViewerBackdropProps> = ({ onClose, children }) => {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-dismiss is standard dialog UX
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/90"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-label={t("a11y.mediaViewer")}
      tabIndex={-1}
    >
      {children}
    </div>
  );
};

