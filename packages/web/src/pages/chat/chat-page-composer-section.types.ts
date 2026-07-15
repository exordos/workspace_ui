import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import type { WorkspaceReplySession } from "~/features/workspace-reply/workspace-reply.types";
import type { WorkspaceMessageMentionResolver } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type {
  ComposerEditSession,
  MessageComposerCapabilities,
  ReplyQuote,
} from "~/widgets/message-composer/message-composer.types";
import type { ComposerUploadProgressState } from "./chat-upload.lib";

export interface ChatPageComposerSectionProps {
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  /** 1:1 DM with a deactivated legacy partner, so the composer is disabled. */
  dmPartnerDeactivated?: boolean;
  activeStream: string | null | undefined;
  showTopicPrompt: boolean;
  streamSlug: string | undefined;
  onExpandStreamTopics: () => void;
  uploadProgress: ComposerUploadProgressState | null;
  onSend: (content: string, subjectOverride?: string, files?: File[]) => void | Promise<void>;
  onCreateCallLink: (() => string | null) | undefined;
  onCancelUpload: () => void;
  activeTopic: string | null | undefined;
  replyQuote: ReplyQuote | null;
  onClearReply: () => void;
  workspaceReplySession?: WorkspaceReplySession | null;
  onSelectWorkspaceReplyTab?: (tabId: string) => void;
  onRemoveWorkspaceReplyTab?: (tabId: string) => void;
  outgoingBodyOverride?: string;
  allowEmptyActiveValueSend?: boolean;
  focusKey?: string | null;
  draftInitialValue: string | undefined;
  onComposerValueChange: (v: string) => void;
  onEditLastMessage: () => void;
  editSession: ComposerEditSession | null;
  onSubmitEdit: (messageId: number, content: string) => void | Promise<void>;
  onCancelEdit: () => void;
  // Capabilities keep the old composer visible while disabling actions without Workspace backend support.
  composerCapabilities?: MessageComposerCapabilities;
  resolveMention?: WorkspaceMessageMentionResolver;
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
  aiMessagesContext: AiMessageContext[];
  aiChatContext: AiReplyRequest["chatContext"] | undefined;
  readOnlyReason?: string;
}
