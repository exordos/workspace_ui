import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { MediaViewerToolbarProps } from "./media-viewer-toolbar.types";

const TOOLBAR_BUTTON_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-lg bg-bg-elevated/80 text-text-primary transition-colors hover:bg-bg-elevated disabled:pointer-events-none disabled:opacity-40";

export const MediaViewerToolbar: React.FC<MediaViewerToolbarProps> = ({
  actionsEnabled,
  showOpenInNewTab,
  onOpenInNewTab,
  onDownload,
  onClose,
}) => {
  const stopPropagation = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  const handleOpenInNewTab = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!actionsEnabled) return;
      onOpenInNewTab();
    },
    [actionsEnabled, onOpenInNewTab],
  );

  const handleDownload = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!actionsEnabled) return;
      onDownload();
    },
    [actionsEnabled, onDownload],
  );

  const handleClose = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onClose();
    },
    [onClose],
  );

  return (
    <div
      className="absolute right-4 top-4 z-float flex gap-2"
      onClick={stopPropagation}
      role="toolbar"
      aria-label={t("a11y.mediaViewer")}
    >
      {showOpenInNewTab ? (
        <button
          type="button"
          className={TOOLBAR_BUTTON_CLASS}
          onClick={handleOpenInNewTab}
          disabled={!actionsEnabled}
          aria-label={t("mediaViewer.openInNewTab")}
        >
          <Icon name="newWindow" size={20} />
        </button>
      ) : null}
      <button
        type="button"
        className={TOOLBAR_BUTTON_CLASS}
        onClick={handleDownload}
        disabled={!actionsEnabled}
        aria-label={t("mediaViewer.download")}
      >
        <Icon name="download" size={20} />
      </button>
      <button
        type="button"
        className={TOOLBAR_BUTTON_CLASS}
        onClick={handleClose}
        aria-label={t("common.close")}
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  );
};
