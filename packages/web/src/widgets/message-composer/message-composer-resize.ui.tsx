import React from "react";
import { t } from "~/i18n/i18n";
import {
  MessageComposerCollapseContentIcon,
  MessageComposerExpandContentIcon,
} from "./message-composer-icons.ui";

interface MessageComposerResizeHandleProps {
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

export const MessageComposerResizeHandle = React.memo(function MessageComposerResizeHandle({
  onPointerDown,
  onKeyDown,
}: MessageComposerResizeHandleProps) {
  return (
    <button
      type="button"
      aria-label={t("composer.resizeEditor")}
      className="pointer-events-auto absolute inset-x-0 top-0 z-float h-5 cursor-ns-resize touch-none border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-soft"
      style={{ cursor: "ns-resize" }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      data-composer-resize-handle="true"
      data-testid="composer-resize-handle"
    >
      {/* top-1 (4px): optical position in the composer top strip, not geometric center of h-5 */}
      <span
        className="pointer-events-none absolute left-1/2 top-1 h-1 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-composer-icon"
        aria-hidden
      />
    </button>
  );
});

interface MessageComposerHeightButtonProps {
  isFullHeight: boolean;
  onClick: () => void;
}

export const MessageComposerHeightButton = React.memo(function MessageComposerHeightButton({
  isFullHeight,
  onClick,
}: MessageComposerHeightButtonProps) {
  const label = isFullHeight ? t("composer.collapseEditor") : t("composer.expandEditor");
  return (
    <button
      type="button"
      onClick={onClick}
      className="composer-toolbar-btn pointer-events-auto absolute right-4 top-4 z-float flex h-7 w-7 cursor-pointer items-center justify-center bg-transparent text-composer-icon"
      aria-label={label}
      title={label}
    >
      {isFullHeight ? <MessageComposerCollapseContentIcon /> : <MessageComposerExpandContentIcon />}
    </button>
  );
});
