import React from "react";
import { SmartReplySuggestions } from "~/features/ai-reply/ai-reply.ui";
import { t } from "~/i18n/i18n";
import { AnchoredPopover } from "~/shared/ui/anchored-popover.ui";
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
    const { open, onOpenChange, popoverStyle, notificationMessage } = props;
    // Пока AI action menu не подключён к Workspace workflow, старая кнопка показывает объясняющую заглушку.
    const popoverMessage = notificationMessage ?? t("composer.aiTemporarilyUnavailable");
    if (!open) return null;

    return (
      <AnchoredPopover
        open
        onClose={() => onOpenChange(false)}
        panelStyle={popoverStyle}
        panelClassName="p-3 shadow-lg"
        backdropTestId="composer-ai-menu-backdrop"
        testId="composer-ai-unavailable-popover"
        ariaLabel={popoverMessage}
      >
        <p className="text-xs text-text-primary">{popoverMessage}</p>
      </AnchoredPopover>
    );
  },
);
