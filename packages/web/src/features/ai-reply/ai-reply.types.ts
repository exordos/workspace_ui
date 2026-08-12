/**
 * AI Reply type definitions.
 *
 * Supports multiple use cases:
 * - Smart reply suggestions (short quick replies based on context)
 * - Full reply generation (draft a longer message)
 * - Message rewrite (rephrase, translate, fix grammar, change tone)
 * - Summarize thread
 *
 * Provider-agnostic: works with any LLM backend (OpenAI, Anthropic,
 * self-hosted, Zulip-integrated). The backend is not yet available —
 * these types define the contract.
 */

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export type AiAction =
  | "smart-reply"
  | "generate-reply"
  | "rewrite"
  | "summarize"
  | "translate"
  | "fix-grammar"
  | "change-tone";

export type AiTone = "professional" | "casual" | "friendly" | "formal" | "concise" | "detailed";

export interface AiReplyRequest {
  action: AiAction;
  /** Messages for context (recent thread / conversation). */
  messages: AiMessageContext[];
  /** The user's current draft (for rewrite actions). */
  draft?: string;
  /** Target language code for translate action (e.g. "en", "ru", "de"). */
  targetLanguage?: string;
  /** Desired tone for change-tone and generate-reply. */
  tone?: AiTone;
  /** Max tokens / length hint for the response. */
  maxLength?: number;
  /** Stream name or DM partner for contextual relevance. */
  chatContext?: {
    type: "stream" | "dm";
    streamName?: string;
    topic?: string;
    dmPartnerName?: string;
  };
}

export interface AiMessageContext {
  id: number;
  senderId: number;
  senderName: string;
  content: string;
  timestamp: number;
  isOwn: boolean;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export interface AiReplyResponse {
  /** Generated suggestions (1 for generate/rewrite, 3 for smart-reply). */
  suggestions: AiSuggestion[];
  /** Model that produced the response (for transparency). */
  model?: string;
  /** Processing time in ms. */
  durationMs?: number;
}

export interface AiSuggestion {
  /** Unique ID for tracking which suggestion the user picks. */
  id: string;
  /** The generated text. */
  text: string;
  /** Confidence score 0..1 (for smart replies ordering). */
  confidence?: number;
  /** Action that produced this suggestion. */
  action: AiAction;
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export interface AiStreamChunk {
  /** Partial text appended to the current suggestion. */
  delta: string;
  /** True when the stream is complete. */
  done: boolean;
  /** Suggestion index (for multi-suggestion streaming). */
  index: number;
}

export type AiStreamCallback = (chunk: AiStreamChunk) => void;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface AiReplyProvider {
  readonly name: string;
  /** Check if the provider is configured and available. */
  isAvailable(): boolean;
  /** Generate reply suggestions (non-streaming). */
  generate(request: AiReplyRequest): Promise<AiReplyResponse>;
  /** Generate reply with streaming (token-by-token). Returns abort function. */
  generateStream?(request: AiReplyRequest, onChunk: AiStreamCallback): Promise<() => void>;
}

// ---------------------------------------------------------------------------
// UI (ai-reply.ui.tsx)
// ---------------------------------------------------------------------------

export interface SmartReplySuggestionsProps {
  onAccept: (text: string) => void;
}

export interface AiActionMenuProps {
  draft: string;
  onInsert: (text: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messagesContext?: AiMessageContext[];
  chatContext?: AiReplyRequest["chatContext"];
}

export interface AiComposerButtonProps {
  onClick: () => void;
  active: boolean;
}
