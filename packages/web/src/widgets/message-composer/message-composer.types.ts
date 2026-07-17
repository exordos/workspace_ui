/**
 * Types for the message composer widget.
 */
import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import type { WorkspaceMessageMentionResolver } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type { RefObject, ReactNode } from "react";

interface ReplyQuoteBase {
  content: string;
  sender_full_name: string;
  permalinkUrl: string | null;
}

export type ReplyQuote =
  | (ReplyQuoteBase & {
      id: number | string;
      sender_id?: number;
      quoteFormat?: "zulip";
    })
  | (ReplyQuoteBase & {
      id: string;
      /** Workspace author UUID used to build a user mention in a reply header. */
      sender_uuid: string;
      quoteFormat: "workspace";
    });

export interface ComposerUploadProgress {
  completed: number;
  total: number;
  activeFileName: string | null;
}

export interface ScheduledComposerMessage {
  id: string;
  content: string;
  subject: string;
  files: File[];
  sendAt: number;
}

export interface ComposerEditSession {
  messageId: number;
  initialMarkdown: string;
  /** Keeps Workspace reply controls visible while editing a restored reply message. */
  preserveWorkspaceReplyContext?: boolean;
  /** Changes when the active restored reply tab changes. */
  sessionKey?: string;
}

export type MessageComposerActionMode = "enabled" | "unsupported";

export interface MessageComposerActionCapability {
  mode: MessageComposerActionMode;
  unsupportedText?: string;
}

export interface MessageComposerSendResult {
  shouldClearComposer?: boolean;
}

// Capabilities keep the old composer layout while each backend controls action availability.
// Unsupported Workspace actions stay visible through explicit placeholders without legacy API calls.
export interface MessageComposerCapabilities {
  upload?: MessageComposerActionCapability;
  savedSnippets?: MessageComposerActionCapability;
  preview?: MessageComposerActionCapability;
  mentions?: MessageComposerActionCapability;
  scheduledSend?: MessageComposerActionCapability;
}

export interface MessageComposerProps {
  onSend?: (
    content: string,
    subject?: string,
    files?: File[],
  ) => void | MessageComposerSendResult | Promise<void | MessageComposerSendResult>;
  /** Clears the composer after a send has been accepted locally, before the request settles. */
  optimisticClearOnSend?: boolean;
  onSubmitEdit?: (messageId: number, content: string) => void | Promise<void>;
  onCancelEdit?: () => void;
  onCreateCallLink?: () => string | null;
  onCancelUpload?: () => void;
  disabled?: boolean;
  uploadProgress?: ComposerUploadProgress | null;
  placeholder?: string;
  /** Topic comes from the sidebar selection, not chosen in the composer */
  activeTopic?: string;
  /** Reply quote (shown above the input, prepended to the body on send) */
  replyQuote?: ReplyQuote | null;
  onClearReply?: () => void;
  /** Optional content rendered above the regular composer preface inside the same card. */
  leadingContent?: ReactNode;
  /**
   * Fully assembled outgoing body supplied by the parent, for example for Workspace multi-reply.
   */
  outgoingBodyOverride?: string;
  /** Allows sending with an empty active draft when the external outgoing body has content. */
  allowEmptyActiveValueSend?: boolean;
  /** Focus the textarea when this key changes, unless the composer is unavailable or editing. */
  focusKey?: string | null;
  /** Pre-fill the composer (e.g. from a saved draft) */
  initialValue?: string;
  /**
   * Identifies the external draft session that owns initialValue.
   *
   * When present, initialValue is only applied when this key changes. This keeps a late
   * hydration update in the same chat or reply tab from overwriting text already entered locally.
   * Omit the key to preserve the legacy behavior where every initialValue update resets the draft.
   */
  draftSessionKey?: string | null;
  /** Called whenever the composer text changes (for draft persistence) */
  onValueChange?: (value: string) => void;
  /** Trigger edit mode for the latest own message when composer is empty. */
  onEditLastMessage?: () => void;
  /** Active message edit session routed from chat page. */
  editSession?: ComposerEditSession | null;
  capabilities?: MessageComposerCapabilities;
  /** Workspace-native mention resolver used by local preview render. */
  resolveMention?: WorkspaceMessageMentionResolver;
  /** Workspace-native file preview loader used by local preview render. */
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
  /** Recent chat messages used as AI context. */
  aiMessagesContext?: AiMessageContext[];
  /** Current chat metadata used by AI provider. */
  aiChatContext?: AiReplyRequest["chatContext"];
}

export interface SelectionMutation {
  text: string;
  selectionStartOffset: number;
  selectionEndOffset: number;
}

export interface FormattingToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onValueChange: (value: string) => void;
  fileTrigger?: ReactNode;
  callLinkTrigger?: ReactNode;
  scheduleTrigger?: ReactNode;
  snippetsTrigger?: ReactNode;
  aiTrigger?: ReactNode;
}

export type ComposerMode = "write" | "preview";

export interface ComposerModeTabsProps {
  mode: ComposerMode;
  onChange: (mode: ComposerMode) => void;
  showPreviewTab?: boolean;
}

export type MediaPickerTab = "emoji" | "sticker";

export interface MessageComposerPrefaceProps {
  uploadProgress: ComposerUploadProgress | null | undefined;
  uploadProgressPercent: number;
  files: File[];
  filePreviewUrls: (string | null)[];
  showFiles?: boolean;
  isUploadInProgress: boolean;
  onCancelUpload?: () => void;
  removeFile: (index: number) => void;
  scheduledMessages: ScheduledComposerMessage[];
  onCancelScheduled: (id: string) => void;
  replyQuote: ReplyQuote | null | undefined;
  onClearReply?: () => void;
  isEditing?: boolean;
  showReplyWhileEditing?: boolean;
  hideEditNotice?: boolean;
  onCancelEdit?: () => void;
}
