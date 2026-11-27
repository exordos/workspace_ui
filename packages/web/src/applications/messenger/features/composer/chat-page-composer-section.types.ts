import type { LoadWorkspaceFilePreview } from "~/applications/messenger/features/timeline/messenger-workspace-message-file-preview.hook";
import type { MessengerSendOptions } from "~/applications/messenger/model/messages/outgoing/messenger-outbox.types";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import type { WorkspaceMessageMentionResolver } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type {
  ComposerEditSession,
  ComposerMentionContextInput,
  MessageComposerCapabilities,
  MessageComposerAttachmentView,
  MessageComposerReplyClearReason,
  MessageComposerProps,
  MessageComposerSendResult,
  ReplyQuote,
} from "./message-composer.types";
import type { WorkspaceReplySession } from "./reply/workspace-reply.types";
import type { WorkspaceReplyTabSelectSource } from "./reply/workspace-reply.ui";

export interface ComposerUploadProgressState {
  completed: number;
  total: number;
  activeFileName: string | null;
}

export interface ChatPageComposerSectionProps {
  onCreatePoll?: () => void;
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  /** 1:1 DM with a deactivated legacy partner, so the composer is disabled. */
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
    options?: MessengerSendOptions,
  ) => void | MessageComposerSendResult | Promise<void | MessageComposerSendResult>;
  optimisticClearOnSend?: MessageComposerProps["optimisticClearOnSend"];
  sendDisabled?: boolean;
  attachments?: readonly MessageComposerAttachmentView[];
  attachmentsBlockSend?: boolean;
  onAddAttachments?: (files: readonly File[]) => void;
  onComposerAttachmentsChange?: (attachments: readonly MessageComposerAttachmentView[]) => void;
  onRemoveAttachment?: (localId: string) => void;
  onOpenComposerMedia?: (
    localId: string,
    attachments: readonly MessageComposerAttachmentView[],
  ) => void;
  onRetryAttachment?: (localId: string) => void;
  onCreateCallLink: (() => string | null) | undefined;
  onCancelUpload: () => void;
  activeTopic: string | null | undefined;
  replyQuote: ReplyQuote | null;
  onClearReply: (reason?: MessageComposerReplyClearReason) => void;
  workspaceReplySession?: WorkspaceReplySession | null;
  onSelectWorkspaceReplyTab?: (tabId: string, source?: WorkspaceReplyTabSelectSource) => void;
  onRemoveWorkspaceReplyTab?: (tabId: string) => void;
  onReorderWorkspaceReplyTab?: (tabId: string, destinationIndex: number) => void;
  outgoingBodyOverride?: string;
  allowEmptyActiveValueSend?: boolean;
  focusKey?: string | null;
  draftSessionKey?: string | null;
  draftInitialValue: string | undefined;
  onComposerValueChange: (v: string) => void;
  onEditLastMessage: () => void;
  editSession: ComposerEditSession | null;
  onSubmitEdit: (messageId: number, content: string) => void | Promise<void>;
  onCancelEdit: () => void;
  // Capabilities keep the old composer visible while disabling actions without Workspace backend support.
  composerCapabilities?: MessageComposerCapabilities;
  secretFragments?: { canRotate: boolean };
  resolveMention?: WorkspaceMessageMentionResolver;
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
  aiMessagesContext: AiMessageContext[];
  aiChatContext: AiReplyRequest["chatContext"] | undefined;
  readOnlyReason?: string;
  /** Conversation signals that order @mention suggestions. */
  mentionContext?: ComposerMentionContextInput;
  /** Visually connects notices rendered immediately above the composer. */
  joinedTop?: boolean;
}
