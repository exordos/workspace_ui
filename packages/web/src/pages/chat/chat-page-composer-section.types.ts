import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import type { ComposerUploadProgressState } from "./chat-upload.lib";

export interface ChatPageComposerSectionProps {
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStream: string | null | undefined;
  showTopicPrompt: boolean;
  streamSlug: string | undefined;
  onExpandStreamTopics: () => void;
  sending: boolean;
  uploadProgress: ComposerUploadProgressState | null;
  onSend: (content: string, subjectOverride?: string, files?: File[]) => void | Promise<void>;
  onCreateCallLink: (() => string | null) | undefined;
  onCancelUpload: () => void;
  activeTopic: string | null | undefined;
  replyQuote: {
    id: number;
    content: string;
    sender_full_name: string;
    sender_id: number;
    permalinkUrl: string | null;
  } | null;
  onClearReply: () => void;
  draftInitialValue: string | undefined;
  onComposerValueChange: (v: string) => void;
  onEditLastMessage: () => void;
  aiMessagesContext: AiMessageContext[];
  aiChatContext: AiReplyRequest["chatContext"] | undefined;
}
