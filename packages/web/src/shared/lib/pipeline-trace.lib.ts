/**
 * Runtime-gated pipeline traces for message, chat-list, sidebar-unread, and folder flows.
 *
 * Traces are off by default. Enable in dev via `__dev__.setPipelineTrace("chat-list")` or `"all"`.
 * No env variables — see `setPipelineTrace` / `isPipelineTraceEnabled`.
 *
 * Usage:
 *   import { logMessageFlow, setPipelineTrace } from "~/shared/lib/pipeline-trace.lib";
 *   setPipelineTrace("messages");
 *   logMessageFlow("merge:done", { count: 12 });
 */

import type { MessageLocation } from "~/entities/chat-list/chat-list.model.types";
import type { MessengerRecentPrivateConversation } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";

export type PipelineTraceChannel =
  | "messages"
  | "chat-list"
  | "sidebar-unread"
  | "folders"
  | "link-preview";

const TRACE_SCOPE: Record<PipelineTraceChannel, string> = {
  messages: "trace:messages",
  "chat-list": "trace:chat-list",
  "sidebar-unread": "trace:sidebar-unread",
  folders: "trace:folders",
  "link-preview": "trace:link-preview",
};

const ALL_CHANNELS: readonly PipelineTraceChannel[] = [
  "messages",
  "chat-list",
  "sidebar-unread",
  "folders",
  "link-preview",
];

type TraceMode = "off" | "all" | ReadonlySet<PipelineTraceChannel>;

let traceMode: TraceMode = "off";
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

export function isPipelineTraceEnabled(channel: PipelineTraceChannel): boolean {
  const mode = traceMode;
  if (mode === "all") return true;
  if (mode === "off") return false;
  return mode.has(channel);
}

export function setPipelineTrace(
  channels: "off" | "all" | PipelineTraceChannel | PipelineTraceChannel[],
): void {
  if (channels === "off") {
    traceMode = "off";
    return;
  }
  if (channels === "all") {
    traceMode = "all";
    return;
  }
  if (Array.isArray(channels)) {
    traceMode = new Set(channels);
    return;
  }
  traceMode = new Set([channels]);
}

export function getPipelineTrace(): "off" | "all" | readonly PipelineTraceChannel[] {
  const mode = traceMode;
  if (mode === "off") return "off";
  if (mode === "all") return "all";
  return ALL_CHANNELS.filter((channel) => mode.has(channel));
}

/** Resets registry and seq clock — for tests only. */
export function resetPipelineTraceForTests(): void {
  traceMode = "off";
  pipelineSeq = 0;
  pipelineT0Ms = null;
}

function tracePipeline(
  channel: PipelineTraceChannel,
  phase: string,
  data?: Record<string, unknown>,
): void {
  if (!isPipelineTraceEnabled(channel)) return;
  const { seq, elapsedMs } = nextPipelineTrace();
  createLogger(TRACE_SCOPE[channel]).debug(`#${seq} +${elapsedMs}ms ${phase}`, data ?? {});
}

/** Narrow shape for log labels only (mirrors `CurrentChatContext`). */
export type ChatContextLogShape =
  | null
  | { type: "stream"; streamId: string; topic: string }
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
  tracePipeline("messages", phase, data);
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

/** Count and short sample for message id batches in scroll/read traces (no full id lists). */
export function summarizeMessageIdsForFlowDebug(messageIds: readonly MessageId[]): {
  count: number;
  sampleIds: MessageId[];
} {
  return { count: messageIds.length, sampleIds: messageIds.slice(0, 3) };
}

export function logScrollReadFlow(phase: string, data?: Record<string, unknown>): void {
  tracePipeline("messages", phase, data);
}

export function logFolderFlow(phase: string, data?: Record<string, unknown>): void {
  tracePipeline("folders", phase, data);
}

/** Message id sample and count for chat-list / API traces (no message content). */
export function summarizeMessengerMessagesForFlowDebug(messages: readonly { id: MessageId }[]): {
  count: number;
  sampleIds: MessageId[];
} {
  return { count: messages.length, sampleIds: messages.slice(0, 3).map((message) => message.id) };
}

export function logChatListFlow(phase: string, data?: Record<string, unknown>): void {
  tracePipeline("chat-list", phase, data);
}

export function logLinkPreviewTrace(event: string, data?: Record<string, unknown>): void {
  tracePipeline("link-preview", event, data);
}

export type SidebarUnreadLogContext =
  | { type: "stream"; streamId: string; topic: string }
  | { type: "dm"; dmKey: string };

export interface SidebarUnreadLogStateSlice {
  sidebarStreamsUnread: number;
  sidebarDmsUnread: number;
  messageIdToLocation: ReadonlyMap<MessageId, MessageLocation>;
  streamsMap: ReadonlyMap<number, StreamEntryInternal>;
  dmsMap: ReadonlyMap<string, DmEntryInternal>;
}

export function logSidebarUnreadFlow(phase: string, data?: Record<string, unknown>): void {
  tracePipeline("sidebar-unread", phase, data);
}

export function summarizeSidebarUnreadTotals(state: SidebarUnreadLogStateSlice): {
  sidebarStreamsUnread: number;
  sidebarDmsUnread: number;
  locationIndexSize: number;
} {
  return {
    sidebarStreamsUnread: state.sidebarStreamsUnread,
    sidebarDmsUnread: state.sidebarDmsUnread,
    locationIndexSize: state.messageIdToLocation.size,
  };
}

export function summarizeContextBadge(
  state: SidebarUnreadLogStateSlice,
  context: SidebarUnreadLogContext | undefined,
): Record<string, unknown> | undefined {
  if (context == null) {
    return undefined;
  }
  if (context.type === "stream") {
    const topicKey = normalizeTopicForIdentity(context.topic);
    const topic = state.streamsMap.get(context.streamId)?.topics.get(topicKey);
    return {
      kind: "stream",
      streamId: context.streamId,
      topic: topicKey,
      unreadCount: topic?.unreadCount ?? 0,
    };
  }
  const dmKey = context.dmKey.trim();
  return {
    kind: "dm",
    dmKey,
    unreadCount: dmKey.length > 0 ? (state.dmsMap.get(dmKey)?.unreadCount ?? 0) : 0,
  };
}

export function summarizeRegisterUnreadSnapshot(snapshot: {
  streams: readonly { streamId: string; topic: string; unreadMessageIds: readonly MessageId[] }[];
  dms: readonly { userIds: readonly number[]; unreadMessageIds: readonly MessageId[] }[];
  totalCount: number;
  oldUnreadsMissing?: boolean;
}): Record<string, unknown> {
  let streamUnreadIds = 0;
  for (const bucket of snapshot.streams) {
    streamUnreadIds += bucket.unreadMessageIds.length;
  }
  let dmUnreadIds = 0;
  for (const bucket of snapshot.dms) {
    dmUnreadIds += bucket.unreadMessageIds.length;
  }
  return {
    totalCount: snapshot.totalCount,
    streamBuckets: snapshot.streams.length,
    dmBuckets: snapshot.dms.length,
    streamUnreadIds,
    dmUnreadIds,
    oldUnreadsMissing: snapshot.oldUnreadsMissing === true,
  };
}

export function sidebarUnreadLogContextFromChatContext(
  context: ChatContextLogShape,
): SidebarUnreadLogContext | undefined {
  if (context == null) {
    return undefined;
  }
  if (context.type === "stream") {
    return { type: "stream", streamId: context.streamId, topic: context.topic };
  }
  return { type: "dm", dmKey: context.dmKey };
}

export function summarizeRecentPrivateConversationsForTrace(
  conversations: Record<string, MessengerRecentPrivateConversation> | undefined,
): Record<string, unknown> {
  if (conversations == null) {
    return { present: false };
  }
  if (Array.isArray(conversations)) {
    return { present: true, format: "array(unparsed)", conversationCount: conversations.length };
  }
  const entries = Object.entries(conversations);
  let withMaxMessageId = 0;
  let withUnreadIds = 0;
  const maxMessageIdSample: MessageId[] = [];
  for (const [, conversation] of entries) {
    const maxId = conversation.max_message_id;
    if (maxId != null) {
      withMaxMessageId += 1;
      if (maxMessageIdSample.length < 8) {
        maxMessageIdSample.push(maxId);
      }
    }
    if ((conversation.unread_message_ids?.length ?? 0) > 0) {
      withUnreadIds += 1;
    }
  }
  return {
    present: true,
    format: "map",
    conversationCount: entries.length,
    withMaxMessageId,
    withUnreadIds,
    maxMessageIdSample,
  };
}
