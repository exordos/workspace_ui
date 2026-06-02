/**
 * Dedicated traces for sidebar unread badge lifecycle (bootstrap → realtime → mark-read).
 *
 * Enable with `VITE_SIDEBAR_UNREAD_DEBUG=true` (on by default in dev).
 * Filter console: `[sidebar-unread]`
 */
import type { MessageLocation } from "~/entities/chat-list/chat-list.model.types";
import { env } from "~/shared/lib/env";
import {
  summarizeChatContextForLog,
  summarizeMessageIdsForFlowDebug,
  type ChatContextLogShape,
} from "~/shared/lib/message-flow-debug.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";

let sidebarUnreadSeq = 0;
let sidebarUnreadT0Ms: number | null = null;

function nextSidebarUnreadTrace(): { seq: number; elapsedMs: number } {
  sidebarUnreadSeq += 1;
  if (typeof performance === "undefined") {
    return { seq: sidebarUnreadSeq, elapsedMs: 0 };
  }
  sidebarUnreadT0Ms ??= performance.now();
  return { seq: sidebarUnreadSeq, elapsedMs: Math.round(performance.now() - sidebarUnreadT0Ms) };
}

export type SidebarUnreadLogContext =
  | { type: "stream"; streamId: number; topic: string }
  | { type: "dm"; dmKey: string };

export interface SidebarUnreadLogStateSlice {
  sidebarStreamsUnread: number;
  sidebarDmsUnread: number;
  messageIdToLocation: ReadonlyMap<number, MessageLocation>;
  streamsMap: ReadonlyMap<number, StreamEntryInternal>;
  dmsMap: ReadonlyMap<string, DmEntryInternal>;
}

export function logSidebarUnreadFlow(phase: string, data?: Record<string, unknown>): void {
  if (!env.SIDEBAR_UNREAD_DEBUG) {
    return;
  }
  const { seq, elapsedMs } = nextSidebarUnreadTrace();
  // eslint-disable-next-line no-console -- intentional diagnostic; gated by SIDEBAR_UNREAD_DEBUG
  console.info(`[sidebar-unread] #${seq} +${elapsedMs}ms ${phase}`, data ?? "");
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
  streams: readonly { streamId: number; topic: string; unreadMessageIds: readonly number[] }[];
  dms: readonly { userIds: readonly number[]; unreadMessageIds: readonly number[] }[];
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

export { summarizeMessageIdsForFlowDebug, summarizeChatContextForLog };
