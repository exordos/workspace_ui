/**
 * Lazy per-channel sidebar topic hydrate: fetch recent stream messages and merge previews only.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  fetchStreamChannelMessagesForSidebarTopics,
  fetchStreamTopicNames,
} from "~/shared/api/zulip";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import { guard } from "~/shared/lib/guards";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";

export type StreamSidebarTopicsHydrateReason = "expand" | "visible" | "unread-register";

const MAX_CONCURRENT_HYDRATES = 3;

const hydratedStreamIds = new Set<number>();
const hydratedStreamTopicLists = new Set<number>();
const inFlight = new Map<number, Promise<void>>();
const inFlightTopicList = new Map<number, Promise<void>>();
const waitQueue: (() => void)[] = [];
const priorityWaitQueue: (() => void)[] = [];
let activeHydrates = 0;

function releaseHydrateSlot(): void {
  activeHydrates = Math.max(0, activeHydrates - 1);
  const next = priorityWaitQueue.shift() ?? waitQueue.shift();
  if (next != null) {
    next();
  }
}

async function acquireHydrateSlot(priority: boolean): Promise<void> {
  if (activeHydrates < MAX_CONCURRENT_HYDRATES) {
    activeHydrates += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    const enqueue = () => {
      activeHydrates += 1;
      resolve();
    };
    if (priority) {
      priorityWaitQueue.push(enqueue);
    } else {
      waitQueue.push(enqueue);
    }
  });
}

function streamHasSidebarTopics(streamId: number): boolean {
  const entry = useChatListStore.getState().streamsMap.get(streamId);
  return (entry?.topics.size ?? 0) > 0;
}

export function isStreamSidebarTopicsHydrateInFlight(streamId: number): boolean {
  return inFlight.has(streamId);
}

/** Resets lazy-hydrate dedupe state (instance switch / logout). */
export function clearStreamSidebarHydrateState(): void {
  hydratedStreamIds.clear();
  hydratedStreamTopicLists.clear();
  inFlight.clear();
  inFlightTopicList.clear();
  waitQueue.length = 0;
  priorityWaitQueue.length = 0;
  activeHydrates = 0;
}

/**
 * Loads topic names list for a stream and inserts topic shells into the sidebar store.
 * This is needed because message-based hydration only discovers topics that have loaded messages.
 */
export function requestStreamSidebarTopicListHydrate(streamId: number): Promise<void> {
  guard.streamId(streamId, "requestStreamSidebarTopicListHydrate");
  if (hydratedStreamTopicLists.has(streamId)) {
    return Promise.resolve();
  }
  const existing = inFlightTopicList.get(streamId);
  if (existing != null) {
    return existing;
  }

  const promise = (async () => {
    try {
      const topics = await fetchStreamTopicNames(streamId);
      useChatListStore.getState().upsertStreamTopicShells(streamId, topics);
      hydratedStreamTopicLists.add(streamId);
    } catch (error) {
      logChatListFlow("chatList: stream sidebar topic list hydrate failed", {
        streamId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlightTopicList.delete(streamId);
    }
  })();

  inFlightTopicList.set(streamId, promise);
  return promise;
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
 * Fetches recent messages for one channel and merges topic previews into chat-list store.
 * Dedupes in-flight and successful hydrates; retries when API returns no messages.
 */
export function requestStreamSidebarTopicsHydrate(
  streamId: number,
  reason: StreamSidebarTopicsHydrateReason,
): Promise<void> {
  guard.streamId(streamId, "requestStreamSidebarTopicsHydrate");
  if (streamHasSidebarTopics(streamId)) {
    return Promise.resolve();
  }
  if (hydratedStreamIds.has(streamId)) {
    return Promise.resolve();
  }
  const existing = inFlight.get(streamId);
  if (existing != null) {
    return existing;
  }

  const priority = reason === "unread-register";

  const promise = (async () => {
    await acquireHydrateSlot(priority);
    try {
      if (streamHasSidebarTopics(streamId) || hydratedStreamIds.has(streamId)) {
        return;
      }

      logChatListFlow("chatList: stream sidebar topics hydrate start", { streamId, reason });
      const messages = await fetchStreamChannelMessagesForSidebarTopics(streamId);
      if (messages.length === 0) {
        logChatListFlow("chatList: stream sidebar topics hydrate empty", { streamId, reason });
        return;
      }

      useChatListStore.getState().applyStreamSidebarPreviewsFromMessages(messages);
      if (streamHasSidebarTopics(streamId)) {
        hydratedStreamIds.add(streamId);
        logChatListFlow("chatList: stream sidebar topics hydrate done", {
          streamId,
          reason,
          messageCount: messages.length,
        });
      }
    } catch (error) {
      logChatListFlow("chatList: stream sidebar topics hydrate failed", {
        streamId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.delete(streamId);
      releaseHydrateSlot();
    }
  })();

  inFlight.set(streamId, promise);
  return promise;
}
