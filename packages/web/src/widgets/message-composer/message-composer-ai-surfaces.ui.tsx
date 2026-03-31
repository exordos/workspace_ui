import React from "react";
import { AiActionMenu, SmartReplySuggestions } from "~/features/ai-reply/ai-reply.ui";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";

export interface MessageComposerSmartReplyStripProps {
  onAccept: (text: string) => void;
}

export const MessageComposerSmartReplyStrip = React.memo(function MessageComposerSmartReplyStrip({
  onAccept,
}: MessageComposerSmartReplyStripProps) {
  return <SmartReplySuggestions onAccept={onAccept} />;
});

export interface MessageComposerAiActionMenuLayerProps {
  open: boolean;
  draft: string;
  onInsert: (text: string) => void;
  onOpenChange: (open: boolean) => void;
  messagesContext: AiMessageContext[];
  chatContext: AiReplyRequest["chatContext"] | undefined;
}

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
