import React from "react";
import { AiActionMenu, SmartReplySuggestions } from "~/features/ai-reply/ai-reply.ui";
import type {
  MessageComposerAiActionMenuLayerProps,
  MessageComposerSmartReplyStripProps,
} from "./message-composer-ai-surfaces.types";

export const MessageComposerSmartReplyStrip = React.memo(function MessageComposerSmartReplyStrip({
  onAccept,
}: MessageComposerSmartReplyStripProps) {
  return <SmartReplySuggestions onAccept={onAccept} />;
});

export const MessageComposerAiActionMenuLayer = React.memo(function MessageComposerAiActionMenuLayer({
  open,
  draft,
  onInsert,
  onOpenChange,
  messagesContext,
  chatContext,
}: MessageComposerAiActionMenuLayerProps) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-dropdown"
        aria-hidden
        data-testid="composer-ai-menu-backdrop"
        onClick={() => onOpenChange(false)}
      />
      <AiActionMenu
        draft={draft}
        onInsert={onInsert}
        open={open}
        onOpenChange={onOpenChange}
        messagesContext={messagesContext}
        chatContext={chatContext}
      />
    </>
  );
});
