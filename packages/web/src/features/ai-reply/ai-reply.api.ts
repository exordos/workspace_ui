/**
 * AI Reply API — placeholder for backend integration.
 *
 * The backend does not exist yet. This module defines the HTTP contract
 * and provides a mock provider for development/testing.
 *
 * When the backend is ready:
 * 1. Replace `createMockProvider()` with `createHttpProvider(baseUrl)`
 * 2. The HTTP provider sends POST /ai/reply with AiReplyRequest body
 * 3. Streaming uses SSE (Server-Sent Events) at POST /ai/reply/stream
 */

import { createLogger } from "~/shared/lib/logger";
import type {
  AiReplyProvider,
  AiReplyRequest,
  AiReplyResponse,
  AiStreamCallback,
  AiStreamChunk,
  AiSuggestion,
} from "./ai-reply.types";

const log = createLogger("ai-reply:api");

// ---------------------------------------------------------------------------
// Mock provider (for development without backend)
// ---------------------------------------------------------------------------

const MOCK_SMART_REPLIES: Record<string, string[]> = {
  default: ["Got it, thanks!", "Sounds good 👍", "Let me check on that"],
  question: ["Yes, that's correct", "I'll look into it", "Not sure, let me ask"],
  greeting: ["Hi! How are you?", "Hey there! 👋", "Hello!"],
};

function classifyLastMessage(content: string): string {
  const lower = content.toLowerCase();
  if (
    lower.includes("?") ||
    lower.startsWith("how") ||
    lower.startsWith("what") ||
    lower.startsWith("why")
  ) {
    return "question";
  }
  if (lower.startsWith("hi") || lower.startsWith("hey") || lower.startsWith("hello")) {
    return "greeting";
  }
  return "default";
}

export function createMockProvider(): AiReplyProvider {
  return {
    name: "mock",

    isAvailable: () => true,

    async generate(request: AiReplyRequest): Promise<AiReplyResponse> {
      await new Promise<void>((r) => {
        setTimeout(r, 600 + Math.random() * 400);
      });

      if (request.action === "smart-reply") {
        const lastMsg = request.messages[request.messages.length - 1];
        const category = lastMsg ? classifyLastMessage(lastMsg.content) : "default";
        const replies = MOCK_SMART_REPLIES[category] ?? MOCK_SMART_REPLIES.default!;

        const suggestions: AiSuggestion[] = replies.map((text, i) => ({
          id: crypto.randomUUID(),
          text,
          confidence: 0.9 - i * 0.15,
          action: "smart-reply",
        }));

        return { suggestions, model: "mock-v1", durationMs: 650 };
      }

      if (request.action === "rewrite" && request.draft) {
        return {
          suggestions: [
            {
              id: crypto.randomUUID(),
              text: request.draft.charAt(0).toUpperCase() + request.draft.slice(1),
              action: "rewrite",
            },
          ],
          model: "mock-v1",
          durationMs: 300,
        };
      }

      if (request.action === "translate" && request.draft) {
        return {
          suggestions: [
            {
              id: crypto.randomUUID(),
              text: `[Translated to ${request.targetLanguage ?? "en"}] ${request.draft}`,
              action: "translate",
            },
          ],
          model: "mock-v1",
          durationMs: 400,
        };
      }

      if (request.action === "summarize") {
        const count = request.messages.length;
        return {
          suggestions: [
            {
              id: crypto.randomUUID(),
              text: `Summary of ${count} messages: The conversation discussed various topics. Key points were addressed by participants.`,
              action: "summarize",
            },
          ],
          model: "mock-v1",
          durationMs: 800,
        };
      }

      if (request.action === "change-tone" && request.draft) {
        const tone = request.tone ?? "professional";
        return {
          suggestions: [
            {
              id: crypto.randomUUID(),
              text: `[${tone} tone] ${request.draft}`,
              action: "change-tone",
            },
          ],
          model: "mock-v1",
          durationMs: 350,
        };
      }

      return {
        suggestions: [
          {
            id: crypto.randomUUID(),
            text: "This is a generated reply based on the conversation context.",
            action: request.action,
          },
        ],
        model: "mock-v1",
        durationMs: 500,
      };
    },

    generateStream(_request: AiReplyRequest, onChunk: AiStreamCallback): Promise<() => void> {
      let cancelled = false;
      const text =
        "This is a streamed AI-generated reply. It arrives token by token, simulating a real LLM response.";
      const words = text.split(" ");

      void (async () => {
        for (let i = 0; i < words.length; i++) {
          if (cancelled) return;
          await new Promise<void>((r) => {
            setTimeout(r, 50 + Math.random() * 80);
          });
          if (cancelled) return;
          onChunk({
            delta: (i === 0 ? "" : " ") + words[i]!,
            done: i === words.length - 1,
            index: 0,
          });
        }
      })().catch((err) => {
        if (!cancelled) {
          log.warn("Mock AI stream interrupted", { error: String(err) });
        }
      });

      return Promise.resolve(() => {
        cancelled = true;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP provider (for when backend is ready)
// ---------------------------------------------------------------------------

export function createHttpProvider(baseUrl: string): AiReplyProvider {
  return {
    name: "http",

    isAvailable() {
      return !!baseUrl;
    },

    async generate(request: AiReplyRequest): Promise<AiReplyResponse> {
      const res = await fetch(`${baseUrl}/ai/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        throw new Error(`AI API error: ${res.status}`);
      }

      return res.json() as Promise<AiReplyResponse>;
    },

    async generateStream(request: AiReplyRequest, onChunk: AiStreamCallback): Promise<() => void> {
      const controller = new AbortController();

      const res = await fetch(`${baseUrl}/ai/reply/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`AI stream error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      void (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              onChunk({ delta: "", done: true, index: 0 });
              break;
            }

            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n").filter((l) => l.startsWith("data: "));

            for (const line of lines) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                onChunk({ delta: "", done: true, index: 0 });
                return;
              }
              try {
                const chunk = JSON.parse(data) as AiStreamChunk;
                onChunk(chunk);
              } catch {
                log.warn("Failed to parse SSE chunk", { data });
              }
            }
          }
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            log.error("AI stream read error", { error: String(err) });
          }
        }
      })();

      return () => controller.abort();
    },
  };
}
