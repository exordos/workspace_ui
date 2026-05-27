/**
 * AI Reply UI components for the composer area.
 *
 * - SmartReplySuggestions: chips above the composer (like Google Messages)
 * - AiActionMenu: dropdown with Rewrite / Translate / Fix grammar / Change tone
 * - AiStreamingPreview: shows token-by-token generation preview
 */
import React from "react";
import { Icon } from "~/shared/ui/icon";
import { useAiReplyStore } from "./ai-reply.model";
import type {
  AiAction,
  AiActionMenuProps,
  AiComposerButtonProps,
  AiSuggestion,
  AiTone,
  SmartReplySuggestionsProps,
} from "./ai-reply.types";

// ---------------------------------------------------------------------------
// Smart Reply Suggestions (chips above composer)
// ---------------------------------------------------------------------------

export const SmartReplySuggestions: React.FC<SmartReplySuggestionsProps> = ({ onAccept }) => {
  const suggestions = useAiReplyStore((s) => s.suggestions);
  const status = useAiReplyStore((s) => s.status);
  const lastAction = useAiReplyStore((s) => s.lastAction);
  const acceptSuggestion = useAiReplyStore((s) => s.acceptSuggestion);
  const dismiss = useAiReplyStore((s) => s.dismiss);

  if (lastAction !== "smart-reply") return null;
  if (status !== "done" || suggestions.length === 0) return null;

  const handleClick = (suggestion: AiSuggestion) => {
    const text = acceptSuggestion(suggestion.id);
    if (text) onAccept(text);
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2" role="group" aria-label="Smart replies">
      <span className="text-xs text-text-muted">✨</span>
      {suggestions.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => handleClick(s)}
          className="rounded-full border border-border-subtle bg-bg-elevated px-3 py-1 text-xs text-text-primary transition-colors hover:border-accent hover:bg-accent-soft"
        >
          {s.text}
        </button>
      ))}
      <button
        type="button"
        onClick={dismiss}
        className="ml-auto text-text-muted hover:text-text-primary"
        aria-label="Dismiss suggestions"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AI Action Menu (dropdown in composer toolbar)
// ---------------------------------------------------------------------------

const AI_ACTIONS: {
  action: AiAction;
  label: string;
  icon: string;
  needsDraft: boolean;
}[] = [
  { action: "generate-reply", label: "Generate reply", icon: "✨", needsDraft: false },
  { action: "rewrite", label: "Rewrite", icon: "📝", needsDraft: true },
  { action: "fix-grammar", label: "Fix grammar", icon: "✅", needsDraft: true },
  { action: "change-tone", label: "Change tone", icon: "🎭", needsDraft: true },
  { action: "translate", label: "Translate", icon: "🌐", needsDraft: true },
  { action: "summarize", label: "Summarize thread", icon: "📋", needsDraft: false },
];

const TONE_OPTIONS: { tone: AiTone; label: string }[] = [
  { tone: "professional", label: "Professional" },
  { tone: "casual", label: "Casual" },
  { tone: "friendly", label: "Friendly" },
  { tone: "formal", label: "Formal" },
  { tone: "concise", label: "Concise" },
];

export const AiActionMenu: React.FC<AiActionMenuProps> = ({
  draft,
  onInsert,
  open,
  onOpenChange,
  messagesContext,
  chatContext,
}) => {
  const generate = useAiReplyStore((s) => s.generate);
  const acceptSuggestion = useAiReplyStore((s) => s.acceptSuggestion);
  const status = useAiReplyStore((s) => s.status);
  const suggestions = useAiReplyStore((s) => s.suggestions);
  const streamingText = useAiReplyStore((s) => s.streamingText);
  const error = useAiReplyStore((s) => s.error);
  const dismiss = useAiReplyStore((s) => s.dismiss);
  const abort = useAiReplyStore((s) => s.abort);
  const lastAction = useAiReplyStore((s) => s.lastAction);

  if (!open) return null;

  const hasDraft = draft.trim().length > 0;

  const handleAction = (action: AiAction, tone?: AiTone) => {
    void generate({
      action,
      messages: messagesContext ?? [],
      draft: hasDraft ? draft : undefined,
      tone,
      chatContext,
    });
  };

  const handleAccept = () => {
    if (suggestions.length > 0) {
      const text = acceptSuggestion(suggestions[0]!.id);
      if (text) {
        onInsert(text);
        onOpenChange(false);
      }
    } else if (streamingText) {
      onInsert(streamingText);
      dismiss();
      onOpenChange(false);
    }
  };

  const hasResult = status === "done" && (suggestions.length > 0 || streamingText.length > 0);

  return (
    <div
      className="absolute bottom-full left-0 z-dropdown mb-1 max-h-[320px] w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-border-subtle bg-bg-elevated p-2 shadow-lg"
      role="dialog"
      aria-label="AI assistant menu"
    >
      {/* Action list (when idle) */}
      {status === "idle" && (
        <div className="space-y-0.5">
          <div className="mb-1 px-2 text-[11px] font-medium text-text-muted">AI Assistant</div>
          {AI_ACTIONS.map(({ action, label, icon, needsDraft }) => {
            const disabled = needsDraft && !hasDraft;

            if (action === "change-tone") {
              return (
                <div key={action}>
                  <div className="px-2 py-1 text-xs text-text-muted">
                    {icon} {label}
                  </div>
                  <div className="flex flex-wrap gap-1 px-2 pb-0.5">
                    {TONE_OPTIONS.map(({ tone, label: toneLabel }) => (
                      <button
                        key={tone}
                        type="button"
                        disabled={!hasDraft}
                        onClick={() => handleAction("change-tone", tone)}
                        className="rounded-md border border-border-subtle px-1.5 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-text-primary disabled:opacity-40"
                      >
                        {toneLabel}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <button
                key={action}
                type="button"
                disabled={disabled}
                onClick={() => handleAction(action)}
                className="hover:bg-card-bg-active/70 flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-text-primary transition-colors disabled:opacity-40"
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading state */}
      {status === "loading" && (
        <div className="flex items-center gap-1.5 px-1 py-2 text-xs text-text-muted">
          <span className="animate-pulse">✨</span>
          Generating...
          <button
            type="button"
            onClick={abort}
            className="ml-auto text-[11px] hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Streaming preview */}
      {status === "streaming" && (
        <div className="space-y-1.5">
          <div className="max-h-[140px] overflow-auto rounded-lg bg-bg p-2 text-xs text-text-primary">
            {streamingText}
            <span className="animate-pulse">▊</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={abort}
              className="text-[11px] text-text-muted hover:text-text-primary"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {hasResult && lastAction !== "smart-reply" && (
        <div className="space-y-1.5">
          <div className="max-h-[140px] overflow-auto rounded-lg bg-bg p-2 text-xs text-text-primary">
            {suggestions[0]?.text ?? streamingText}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="rounded-lg bg-accent px-2 py-1 text-[11px] font-medium text-on-accent"
            >
              Insert
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="space-y-1.5">
          <div className="text-xs text-notice-base">{error}</div>
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] text-text-muted hover:text-text-primary"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// AI Composer Button (trigger for the action menu)
// ---------------------------------------------------------------------------

export const AiComposerButton: React.FC<AiComposerButtonProps> = ({ onClick, active }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
      active ? "bg-accent/20 text-accent" : "text-composer-icon hover:text-text-primary"
    }`}
    aria-label="AI assistant"
    title="AI assistant"
  >
    <Icon name="sparkles" size={14} className="text-current" />
  </button>
);
