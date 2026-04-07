/**
 * Optional browser-console trace for the chat message / folder pipeline (store ↔ IndexedDB ↔ UI).
 *
 * Gated by `env.MESSAGE_FLOW_DEBUG` (`VITE_MESSAGE_FLOW_DEBUG`, default on in dev).
 * Each line includes a monotonic `#seq` and `+elapsedMs` from the first trace in the tab
 * so you can see real order and timing. Disable via env when done.
 */

import { env } from "~/shared/lib/env";

let pipelineSeq = 0;
let pipelineT0Ms: number | null = null;

function nextPipelineTrace(): { seq: number; elapsedMs: number } {
  pipelineSeq += 1;
  if (typeof performance === "undefined") {
    return { seq: pipelineSeq, elapsedMs: 0 };
  }
  if (pipelineT0Ms == null) {
    pipelineT0Ms = performance.now();
  }
  return { seq: pipelineSeq, elapsedMs: Math.round(performance.now() - pipelineT0Ms) };
}

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
  const { seq, elapsedMs } = nextPipelineTrace();
  // eslint-disable-next-line no-console -- intentional diagnostic; gated by MESSAGE_FLOW_DEBUG
  console.info(`[message-flow] #${seq} +${elapsedMs}ms ${phase}`, data ?? "");
}

/** Folder rail / sync — same seq clock as {@link logMessageFlow} for cross-pipeline ordering. */
export function logFolderFlow(phase: string, data?: Record<string, unknown>): void {
  if (!env.MESSAGE_FLOW_DEBUG) return;
  const { seq, elapsedMs } = nextPipelineTrace();
  // eslint-disable-next-line no-console -- intentional diagnostic; gated by MESSAGE_FLOW_DEBUG
  console.info(`[folder-flow] #${seq} +${elapsedMs}ms ${phase}`, data ?? "");
}
