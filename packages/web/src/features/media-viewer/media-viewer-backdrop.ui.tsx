import React, { useEffect, useRef } from "react";
import { t } from "~/i18n/i18n";
import type { MediaViewerBackdropProps } from "./media-viewer-backdrop.types";

export const MediaViewerBackdrop: React.FC<MediaViewerBackdropProps> = ({
  onClose,
  onPrev,
  onNext,
  children,
}) => {
  const onCloseRef = useRef(onClose);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onPrevRef.current = onPrev;
  }, [onPrev]);

  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevRef.current?.();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNextRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-dismiss is standard dialog UX
    <div
      className="fixed inset-0 z-modal flex flex-col bg-black/90"
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
