/**
 * Helpers for AI context building on the chat page.
 */
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";

export const AI_CONTEXT_MESSAGES_LIMIT = 30;
export const AI_CONTEXT_MESSAGE_MAX_CHARS = 500;

export function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function normalizeAiContextContent(content: string): string {
  return plainTextPreviewFromMessageBody(content)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, AI_CONTEXT_MESSAGE_MAX_CHARS);
}
