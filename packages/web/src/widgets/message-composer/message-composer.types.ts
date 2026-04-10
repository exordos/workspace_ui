/**
 * Types for the message composer widget.
 */
import type { RefObject, ReactNode } from "react";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";

export interface ReplyQuote {
  id: number;
  content: string;
  sender_full_name: string;
  sender_id: number;
  /** Full Zulip web URL (`https://realm/#narrow/.../near/id`); omit link text if null */
  permalinkUrl: string | null;
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

export interface MessageComposerProps {
  onSend?: (content: string, subject?: string, files?: File[]) => void | Promise<void>;
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
}

export type MediaPickerTab = "emoji" | "sticker";

export interface MessageComposerPrefaceProps {
  uploadProgress: ComposerUploadProgress | null | undefined;
  uploadProgressPercent: number;
  files: File[];
  filePreviewUrls: (string | null)[];
  isUploadInProgress: boolean;
  onCancelUpload?: () => void;
  removeFile: (index: number) => void;
  scheduledMessages: ScheduledComposerMessage[];
  onCancelScheduled: (id: string) => void;
  replyQuote: ReplyQuote | null | undefined;
  onClearReply?: () => void;
}
