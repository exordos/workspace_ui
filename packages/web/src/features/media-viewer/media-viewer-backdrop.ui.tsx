import React, { useEffect, useRef } from "react";
import { t } from "~/i18n/i18n";
import type { MediaViewerBackdropProps } from "./media-viewer-backdrop.types";

export const MediaViewerBackdrop: React.FC<MediaViewerBackdropProps> = ({ onClose, children }) => {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-dismiss is standard dialog UX
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/90"
      data-shortcut-context="modal"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("a11y.mediaViewer")}
    >
      {children}
    </div>
  );
};
