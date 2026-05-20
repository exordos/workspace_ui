import React from "react";
import { SmartReplySuggestions } from "~/features/ai-reply/ai-reply.ui";
import { t } from "~/i18n/i18n";
import type {
  MessageComposerAiActionMenuLayerProps,
  MessageComposerSmartReplyStripProps,
} from "./message-composer-ai-surfaces.types";

export const MessageComposerSmartReplyStrip = React.memo(function MessageComposerSmartReplyStrip({
  onAccept,
}: MessageComposerSmartReplyStripProps) {
  return <SmartReplySuggestions onAccept={onAccept} />;
});

export const MessageComposerAiActionMenuLayer = React.memo(
  function MessageComposerAiActionMenuLayer(props: MessageComposerAiActionMenuLayerProps) {
    const { open, onOpenChange, popoverStyle } = props;
    if (!open) return null;

    return (
      <>
        <div
          className="fixed inset-0 z-dropdown"
          aria-hidden
          data-testid="composer-ai-menu-backdrop"
          onClick={() => onOpenChange(false)}
        />
        <div
          className="fixed z-modal rounded-xl border border-border-subtle bg-bg-elevated p-3 shadow-lg"
          role="dialog"
          aria-label={t("composer.aiTemporarilyUnavailable")}
          data-testid="composer-ai-unavailable-popover"
          style={popoverStyle}
        >
          <p className="text-xs text-text-primary">{t("composer.aiTemporarilyUnavailable")}</p>
        </div>
      </>
    );
  },
);
