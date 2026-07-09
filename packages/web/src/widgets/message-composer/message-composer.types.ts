/**
 * Types for the message composer widget.
 */
import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import type { WorkspaceMessageMentionResolver } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type { RefObject, ReactNode } from "react";

export interface ReplyQuote {
  id: number | string;
  content: string;
  sender_full_name: string;
  sender_id?: number;
  /** Optional message permalink URL; omit link text if null. */
  permalinkUrl: string | null;
  quoteFormat?: "zulip" | "workspace";
}

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
}

export type MessageComposerActionMode = "enabled" | "unsupported";

export interface MessageComposerActionCapability {
  mode: MessageComposerActionMode;
  unsupportedText?: string;
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
  onSend?: (content: string, subject?: string, files?: File[]) => void | Promise<void>;
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
  /** Pre-fill the composer (e.g. from a saved draft) */
  initialValue?: string;
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
  onCancelEdit?: () => void;
}
