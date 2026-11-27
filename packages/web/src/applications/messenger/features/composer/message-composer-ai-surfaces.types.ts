import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import type { CSSProperties } from "react";

// AI-поверхности оставлены отдельными props, чтобы Workspace composer мог показать старую кнопку без нового API.
export interface MessageComposerSmartReplyStripProps {
  onAccept: (text: string) => void;
}

export interface MessageComposerAiActionMenuLayerProps {
  open: boolean;
  draft: string;
  onInsert: (text: string) => void;
  onOpenChange: (open: boolean) => void;
  notificationMessage?: string;
  messagesContext: AiMessageContext[];
  chatContext: AiReplyRequest["chatContext"] | undefined;
  popoverStyle: CSSProperties;
}
