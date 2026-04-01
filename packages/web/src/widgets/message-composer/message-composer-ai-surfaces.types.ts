import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";

export interface MessageComposerSmartReplyStripProps {
  onAccept: (text: string) => void;
}

export interface MessageComposerAiActionMenuLayerProps {
  open: boolean;
  draft: string;
  onInsert: (text: string) => void;
  onOpenChange: (open: boolean) => void;
  messagesContext: AiMessageContext[];
  chatContext: AiReplyRequest["chatContext"] | undefined;
}
