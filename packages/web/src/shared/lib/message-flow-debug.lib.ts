/**
 * Optional browser-console trace for the chat message pipeline (store ↔ IndexedDB ↔ UI).
 *
 * Gated by `env.MESSAGE_FLOW_DEBUG` (`VITE_MESSAGE_FLOW_DEBUG`, default on in dev).
 * Use when diagnosing empty lists or wrong source selection; disable via env when done.
 */

import { env } from "~/shared/lib/env";

/** Narrow shape for log labels only (mirrors `CurrentChatContext`). */
export type ChatContextLogShape =
  | null
  | { type: "stream"; streamId: number; topic: string }
  | { type: "dm"; dmKey: string };

/** Short, stable label for logs (no message content). */
export function summarizeChatContextForLog(context: ChatContextLogShape): string {
  if (context == null) return "null";
  if (context.type === "stream") {
    return `stream:${context.streamId}:${context.topic}`;
  }
  return `dm:${context.dmKey}`;
}

export function logMessageFlow(phase: string, data?: Record<string, unknown>): void {
  if (!env.MESSAGE_FLOW_DEBUG) return;
  // eslint-disable-next-line no-console -- intentional diagnostic; gated by MESSAGE_FLOW_DEBUG
  console.info(`[message-flow] ${phase}`, data ?? "");
}
