/**
 * Optional browser-console traces for data pipelines (messages, folders, chat list).
 *
 * - `logMessageFlow` / `logFolderFlow` / `logScrollReadFlow`: gated by `env.MESSAGE_FLOW_DEBUG`
 *   (`VITE_MESSAGE_FLOW_DEBUG`). Scroll/read phases use the `[scroll-read]` prefix (`scroll:*`, `read:*`, `api:*`).
 * - `logChatListFlow`: gated by `env.CHAT_LIST_FLOW_DEBUG` (`VITE_CHAT_LIST_FLOW_DEBUG`).
 *
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
  pipelineT0Ms ??= performance.now();
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

/** Scroll position metrics for a scrollable element (no message content). */
export interface ScrollElementMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  distanceFromBottom: number;
  atBottom: boolean;
}

export function summarizeScrollElement(
  el: HTMLElement,
  atBottomThreshold = 80,
): ScrollElementMetrics {
  const scrollTop = Math.round(el.scrollTop);
  const scrollHeight = el.scrollHeight;
  const clientHeight = el.clientHeight;
  const distanceFromBottom = Math.max(0, scrollHeight - scrollTop - clientHeight);
  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    distanceFromBottom,
    atBottom: distanceFromBottom <= atBottomThreshold,
  };
}

/** Count and min/max for message id batches in scroll/read traces (no full id lists). */
export function summarizeMessageIdsForFlowDebug(messageIds: readonly number[]): {
  count: number;
  minId: number | null;
  maxId: number | null;
} {
  if (messageIds.length === 0) {
    return { count: 0, minId: null, maxId: null };
  }
  let minId = messageIds[0]!;
  let maxId = messageIds[0]!;
  for (const id of messageIds) {
    if (id < minId) minId = id;
    if (id > maxId) maxId = id;
  }
  return { count: messageIds.length, minId, maxId };
}

/** Scroll + mark-as-read pipeline — same seq clock as {@link logMessageFlow}. */
export function logScrollReadFlow(phase: string, data?: Record<string, unknown>): void {
  if (!env.MESSAGE_FLOW_DEBUG) return;
  const { seq, elapsedMs } = nextPipelineTrace();
  // eslint-disable-next-line no-console -- intentional diagnostic; gated by MESSAGE_FLOW_DEBUG
  console.info(`[scroll-read] #${seq} +${elapsedMs}ms ${phase}`, data ?? "");
}

/** Folder rail / sync — same seq clock as {@link logMessageFlow} for cross-pipeline ordering. */
export function logFolderFlow(phase: string, data?: Record<string, unknown>): void {
  if (!env.MESSAGE_FLOW_DEBUG) return;
  const { seq, elapsedMs } = nextPipelineTrace();
  // eslint-disable-next-line no-console -- intentional diagnostic; gated by MESSAGE_FLOW_DEBUG
  console.info(`[folder-flow] #${seq} +${elapsedMs}ms ${phase}`, data ?? "");
}

/** Min/max message id and count for chat-list / API traces (no message content). */
export function summarizeZulipMessagesForFlowDebug(messages: readonly { id: number }[]): {
  count: number;
  minId: number | null;
  maxId: number | null;
} {
  if (messages.length === 0) {
    return { count: 0, minId: null, maxId: null };
  }
  let minId = messages[0]!.id;
  let maxId = messages[0]!.id;
  for (const m of messages) {
    if (m.id < minId) minId = m.id;
    if (m.id > maxId) maxId = m.id;
  }
  return { count: messages.length, minId, maxId };
}

export function logChatListFlow(phase: string, data?: Record<string, unknown>): void {
  if (!env.CHAT_LIST_FLOW_DEBUG) return;
  const { seq, elapsedMs } = nextPipelineTrace();
  // eslint-disable-next-line no-console -- intentional diagnostic; gated by CHAT_LIST_FLOW_DEBUG
  console.info(`[chat-list-flow] #${seq} +${elapsedMs}ms ${phase}`, data ?? "");
}
