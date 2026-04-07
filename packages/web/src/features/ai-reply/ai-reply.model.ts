/**
 * AI Reply store — manages suggestion state, generation lifecycle, and history.
 */

import { create } from "zustand";
import { createLogger } from "~/shared/lib/logger";
import type {
  AiAction,
  AiMessageContext,
  AiReplyProvider,
  AiReplyRequest,
  AiStreamCallback,
  AiSuggestion,
  AiTone,
} from "./ai-reply.types";

const log = createLogger("ai-reply");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type AiReplyStatus = "idle" | "loading" | "streaming" | "done" | "error";

interface AiReplyState {
  status: AiReplyStatus;
  suggestions: AiSuggestion[];
  streamingText: string;
  error: string | null;
  lastAction: AiAction | null;

  // Actions
  generate: (params: {
    action: AiAction;
    messages: AiMessageContext[];
    draft?: string;
    tone?: AiTone;
    targetLanguage?: string;
    chatContext?: AiReplyRequest["chatContext"];
  }) => Promise<void>;
  abort: () => void;
  acceptSuggestion: (id: string) => string | null;
  dismiss: () => void;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

let provider: AiReplyProvider | null = null;
let abortFn: (() => void) | null = null;

export function setAiReplyProvider(p: AiReplyProvider): void {
  provider = p;
  log.info("AI reply provider set", { name: p.name });
}

export function getAiReplyProvider(): AiReplyProvider | null {
  return provider;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAiReplyStore = create<AiReplyState>((set, get) => ({
  status: "idle",
  suggestions: [],
  streamingText: "",
  error: null,
  lastAction: null,

  async generate({ action, messages, draft, tone, targetLanguage, chatContext }) {
    if (!provider) {
      log.warn("No AI reply provider configured");
      set({ status: "error", error: "AI replies are not configured" });
      return;
    }

    if (!provider.isAvailable()) {
      set({ status: "error", error: "AI service is temporarily unavailable" });
      return;
    }

    get().abort();

    const request: AiReplyRequest = {
      action,
      messages,
      draft,
      tone,
      targetLanguage,
      chatContext,
    };

    set({ status: "loading", suggestions: [], streamingText: "", error: null, lastAction: action });

    if (provider.generateStream && action !== "smart-reply") {
      try {
        const onChunk: AiStreamCallback = (chunk) => {
          set((s) => ({
            status: chunk.done ? "done" : "streaming",
            streamingText: s.streamingText + chunk.delta,
            suggestions: chunk.done
              ? [{ id: crypto.randomUUID(), text: s.streamingText + chunk.delta, action }]
              : s.suggestions,
          }));
        };

        abortFn = await provider.generateStream(request, onChunk);
      } catch (err) {
        log.error("AI stream generation failed", { error: String(err) });
        set({ status: "error", error: String(err) });
      }
    } else {
      try {
        const response = await provider.generate(request);
        set({
          status: "done",
          suggestions: response.suggestions,
        });
        log.info("AI reply generated", {
          action,
          count: response.suggestions.length,
          model: response.model,
          durationMs: response.durationMs,
        });
      } catch (err) {
        log.error("AI reply generation failed", { error: String(err) });
        set({ status: "error", error: String(err) });
      }
    }
  },

  abort() {
    if (abortFn) {
      abortFn();
      abortFn = null;
    }
    const { status } = get();
    if (status === "loading" || status === "streaming") {
      set({ status: "idle", streamingText: "" });
    }
  },

  acceptSuggestion(id) {
    const suggestion = get().suggestions.find((s) => s.id === id);
    if (!suggestion) return null;
    set({ status: "idle", suggestions: [], streamingText: "" });
    log.info("AI suggestion accepted", { action: suggestion.action });
    return suggestion.text;
  },

  dismiss() {
    get().abort();
    set({ status: "idle", suggestions: [], streamingText: "", error: null });
  },

  clear() {
    get().abort();
    set({ status: "idle", suggestions: [], streamingText: "", error: null, lastAction: null });
  },
}));
