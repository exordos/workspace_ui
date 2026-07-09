import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  captureActiveOrgRequestContext,
  type ActiveOrgRequestContext,
} from "~/entities/instance/instance.model";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import { guard } from "~/shared/lib/guards";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";

export type StreamSidebarTopicsHydrateReason = "expand" | "visible" | "unread-register";

const hydratedStreamIds = new Set<string>();
const hydratedStreamTopicLists = new Set<string>();

function buildScopedStreamKey(instanceId: string, streamId: number): string {
  return `${instanceId}::${streamId}`;
}

function getActiveScopedStreamContext(
  streamId: number,
): { key: string; orgContext: ActiveOrgRequestContext } | null {
  const orgContext = captureActiveOrgRequestContext();
  if (orgContext.instanceId == null) {
    return null;
  }
  return {
    key: buildScopedStreamKey(orgContext.instanceId, streamId),
    orgContext,
  };
}

function streamHasSidebarTopics(streamId: number): boolean {
  const entry = useChatListStore.getState().streamsMap.get(streamId);
  return (entry?.topics.size ?? 0) > 0;
}

function shouldHydrateStreamSidebarTopics(streamId: number, key: string): boolean {
  if (streamHasSidebarTopics(streamId)) return false;
  return !hydratedStreamIds.has(key);
}

export function isStreamSidebarTopicsHydrateInFlight(streamId: number): boolean {
  const scoped = getActiveScopedStreamContext(streamId);
  if (scoped == null) {
    return false;
  }
  return false;
}

/** Resets lazy-hydrate dedupe state (instance switch / logout). */
export function clearStreamSidebarHydrateState(): void {
  hydratedStreamIds.clear();
  hydratedStreamTopicLists.clear();
}

/** Legacy stream topic preview backfill is disabled after removing Zulip background API. */
export function requestStreamSidebarTopicPreviewBackfill(streamId: number): Promise<void> {
  guard.streamId(streamId, "requestStreamSidebarTopicPreviewBackfill");
  return Promise.resolve();
}

/** Legacy stream topic list hydrate is disabled after removing Zulip background API. */
export function requestStreamSidebarTopicListHydrate(streamId: number): Promise<void> {
  guard.streamId(streamId, "requestStreamSidebarTopicListHydrate");
  const scoped = getActiveScopedStreamContext(streamId);
  if (scoped == null) {
    return Promise.resolve();
  }
  if (hydratedStreamTopicLists.has(scoped.key)) {
    return Promise.resolve();
  }
  hydratedStreamTopicLists.add(scoped.key);
  logChatListFlow("chatList: stream sidebar topic list hydrate skipped", { streamId });
  return Promise.resolve();
}

/** Enqueues lazy topic hydrate for register-reported unread on channels still missing topic rows. */
export function queuePriorityStreamSidebarTopicsHydrate(
  unreadSnapshot?: ZulipUnreadMessagesSnapshot | null,
): void {
  if (unreadSnapshot != null) {
    const { streamsMap } = useChatListStore.getState();
    const seen = new Set<number>();
    for (const bucket of unreadSnapshot.streams) {
      if (seen.has(bucket.streamId)) continue;
      seen.add(bucket.streamId);
      const entry = streamsMap.get(bucket.streamId);
      if (entry?.topics.size === 0) {
        void requestStreamSidebarTopicsHydrate(bucket.streamId, "unread-register");
      }
    }
    return;
  }

  for (const stream of useChatListStore.getState().streams()) {
    const topicCount = stream.topics?.length ?? 0;
    if ((stream.badge ?? 0) > 0 && topicCount === 0) {
      void requestStreamSidebarTopicsHydrate(stream.stream_id, "unread-register");
    }
  }
}

/**
 * Legacy stream topic preview hydrate is disabled after removing Zulip background API.
 */
export function requestStreamSidebarTopicsHydrate(
  streamId: number,
  reason: StreamSidebarTopicsHydrateReason,
): Promise<void> {
  guard.streamId(streamId, "requestStreamSidebarTopicsHydrate");
  const scoped = getActiveScopedStreamContext(streamId);
  if (scoped == null || !shouldHydrateStreamSidebarTopics(streamId, scoped.key)) {
    return Promise.resolve();
  }
  hydratedStreamIds.add(scoped.key);
  logChatListFlow("chatList: stream sidebar topics hydrate skipped", { streamId, reason });
  return Promise.resolve();
}
