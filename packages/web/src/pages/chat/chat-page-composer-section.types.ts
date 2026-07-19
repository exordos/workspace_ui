import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type {
  ComposerClearRequest,
  ComposerEditSession,
} from "~/widgets/message-composer/message-composer.types";
import type { ComposerUploadProgressState } from "./chat-upload.lib";

export interface ChatPageComposerSectionProps {
  isDmView: boolean;
  activeStreamUuid: string | null | undefined;
  /** 1:1 DM with a Workspace-deactivated partner — composer disabled. */
  dmPartnerDeactivated?: boolean;
  activeStream: string | null | undefined;
  showTopicPrompt: boolean;
  streamSlug: string | undefined;
  onExpandStreamTopics: () => void;
  uploadProgress: ComposerUploadProgressState | null;
  onSend: (
    content: string,
    subjectOverride?: string,
    files?: File[],
    composerContent?: string,
  ) => void | Promise<void>;
  onCreateCallLink: (() => string | null) | undefined;
  onCancelUpload: () => void;
  activeTopic: string | null | undefined;
  replyQuote: {
    id: MessageId;
    content: string;
    sender_full_name: string;
    sender_id: UserId;
    permalinkUrl: string | null;
  } | null;
  onClearReply: () => void;
  draftInitialValue: string | undefined;
  onComposerValueChange: (v: string) => void;
  composerClearRequest: ComposerClearRequest | null;
  currentComposerIdentity: string;
  onEditLastMessage: () => void;
  editSession: ComposerEditSession | null;
  onSubmitEdit: (messageId: MessageId, content: string) => void | Promise<void>;
  onCancelEdit: () => void;
  aiMessagesContext: AiMessageContext[];
  aiChatContext: AiReplyRequest["chatContext"] | undefined;
}
