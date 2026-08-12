import React from "react";
import { t } from "~/i18n/i18n";
import { MessageComposerFullHeightGlyph } from "./message-composer-icons.ui";

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
      className="pointer-events-auto absolute inset-x-0 top-0 z-float flex h-3 cursor-ns-resize touch-none items-start justify-center border-0 bg-transparent p-0 pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-soft"
      style={{ cursor: "ns-resize" }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      data-composer-resize-handle="true"
      data-testid="composer-resize-handle"
    >
      <span className="h-1 w-14 rounded-full bg-composer-icon" aria-hidden />
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
      className="pointer-events-auto absolute right-5 top-6 z-float flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      aria-label={label}
      title={label}
    >
      <MessageComposerFullHeightGlyph />
    </button>
  );
});
