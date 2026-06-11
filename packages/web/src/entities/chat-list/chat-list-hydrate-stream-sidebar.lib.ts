/**
 * Lazy per-channel sidebar topic hydrate: fetch recent stream messages and merge previews only.
 */
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestContextCurrent,
  type ActiveOrgRequestContext,
} from "~/entities/instance/instance.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  fetchLatestMessagesForSidebarTopics,
  fetchStreamChannelMessagesForSidebarTopics,
} from "~/shared/api/zulip-sidebar-preview.lib";
import { fetchStreamTopicNames } from "~/shared/api/zulip-streams";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import { guard } from "~/shared/lib/guards";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";

export type StreamSidebarTopicsHydrateReason = "expand" | "visible" | "unread-register";

const MAX_CONCURRENT_HYDRATES = 3;
const TOPIC_PREVIEW_BACKFILL_LIMIT = 24;
const MAX_TOPIC_PREVIEW_BACKFILL_BATCHES = 3;

const hydratedStreamIds = new Set<string>();
const hydratedStreamTopicLists = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
const inFlightTopicList = new Map<string, Promise<void>>();
const inFlightTopicPreviewBackfill = new Map<string, Promise<void>>();
const inFlightControllers = new Map<string, AbortController>();
const inFlightTopicListControllers = new Map<string, AbortController>();
const inFlightTopicPreviewBackfillControllers = new Map<string, AbortController>();
const waitQueue: (() => void)[] = [];
const priorityWaitQueue: (() => void)[] = [];
let activeHydrates = 0;

function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

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

function isScopedRequestCurrent(
  orgContext: ActiveOrgRequestContext,
  controller?: AbortController,
): boolean {
  return !controller?.signal.aborted && isActiveOrgRequestContextCurrent(orgContext);
}

function abortControllers(map: Map<string, AbortController>): void {
  for (const controller of map.values()) {
    controller.abort();
  }
  map.clear();
}

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

function collectStreamTopicsMissingPreview(
  streamId: number,
  limit = TOPIC_PREVIEW_BACKFILL_LIMIT,
): string[] {
  const entry = useChatListStore.getState().streamsMap.get(streamId);
  if (entry == null) {
    return [];
  }

  return Array.from(entry.topics.values())
    .filter((topic) => topic.ts <= 0 || topic.lastMessage.trim().length === 0)
    .slice(0, limit)
    .map((topic) => topic.subject);
}

function hasNonEmptyPreviewText(value: string | undefined): boolean {
  return (value?.trim() ?? "").length > 0;
}

/** Topic rows from API shells or unread without a message preview yet. */
function streamHasTopicsNeedingPreview(streamId: number): boolean {
  const entry = useChatListStore.getState().streamsMap.get(streamId);
  if (entry == null) return false;
  if (entry.topics.size === 0) return false;
  for (const topic of entry.topics.values()) {
    if (!hasNonEmptyPreviewText(topic.lastMessage)) {
      return true;
    }
  }
  return false;
}

function shouldHydrateStreamSidebarTopics(streamId: number, key: string): boolean {
  if (streamHasTopicsNeedingPreview(streamId)) return true;
  if (streamHasSidebarTopics(streamId)) return false;
  return !hydratedStreamIds.has(key);
}

export function isStreamSidebarTopicsHydrateInFlight(streamId: number): boolean {
  const scoped = getActiveScopedStreamContext(streamId);
  if (scoped == null) {
    return false;
  }
  return inFlight.has(scoped.key);
}

/** Resets lazy-hydrate dedupe state (instance switch / logout). */
export function clearStreamSidebarHydrateState(): void {
  abortControllers(inFlightControllers);
  abortControllers(inFlightTopicListControllers);
  abortControllers(inFlightTopicPreviewBackfillControllers);
  hydratedStreamIds.clear();
  hydratedStreamTopicLists.clear();
  inFlight.clear();
  inFlightTopicList.clear();
  inFlightTopicPreviewBackfill.clear();
  waitQueue.length = 0;
  priorityWaitQueue.length = 0;
  activeHydrates = 0;
}

/** Backfills latest message preview for topic shells discovered from the topic-name API. */
export function requestStreamSidebarTopicPreviewBackfill(streamId: number): Promise<void> {
  guard.streamId(streamId, "requestStreamSidebarTopicPreviewBackfill");
  const scoped = getActiveScopedStreamContext(streamId);
  if (scoped == null) {
    return Promise.resolve();
  }
  const topicNames = collectStreamTopicsMissingPreview(streamId);
  if (topicNames.length === 0) {
    return Promise.resolve();
  }

  const existing = inFlightTopicPreviewBackfill.get(scoped.key);
  if (existing != null) {
    return existing;
  }

  const controller = new AbortController();
  inFlightTopicPreviewBackfillControllers.set(scoped.key, controller);
  const promise = (async () => {
    try {
      let batchTopics = topicNames;
      for (let batch = 0; batch < MAX_TOPIC_PREVIEW_BACKFILL_BATCHES; batch += 1) {
        const messages = await fetchLatestMessagesForSidebarTopics(
          streamId,
          batchTopics,
          controller.signal,
        );
        if (!isScopedRequestCurrent(scoped.orgContext, controller)) {
          return;
        }
        if (messages.length === 0) {
          return;
        }
        useChatListStore.getState().applyStreamSidebarPreviewsFromMessages(messages);

        const remaining = collectStreamTopicsMissingPreview(streamId);
        if (remaining.length === 0 || remaining.length >= batchTopics.length) {
          return;
        }
        batchTopics = remaining;
      }
    } catch (error) {
      if (isAbortLikeError(error)) {
        return;
      }
      logChatListFlow("chatList: stream sidebar topic preview backfill failed", {
        streamId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlightTopicPreviewBackfill.delete(scoped.key);
      inFlightTopicPreviewBackfillControllers.delete(scoped.key);
    }
  })();

  inFlightTopicPreviewBackfill.set(scoped.key, promise);
  return promise;
}

/**
 * Loads topic names list for a stream and inserts topic shells into the sidebar store.
 * This is needed because message-based hydration only discovers topics that have loaded messages.
 */
export function requestStreamSidebarTopicListHydrate(streamId: number): Promise<void> {
  guard.streamId(streamId, "requestStreamSidebarTopicListHydrate");
  const scoped = getActiveScopedStreamContext(streamId);
  if (scoped == null) {
    return Promise.resolve();
  }
  if (hydratedStreamTopicLists.has(scoped.key)) {
    return Promise.resolve();
  }
  const existing = inFlightTopicList.get(scoped.key);
  if (existing != null) {
    return existing;
  }

  const controller = new AbortController();
  inFlightTopicListControllers.set(scoped.key, controller);
  const promise = (async () => {
    try {
      const topics = await fetchStreamTopicNames(streamId, controller.signal);
      if (!isScopedRequestCurrent(scoped.orgContext, controller)) {
        return;
      }
      useChatListStore.getState().upsertStreamTopicShells(streamId, topics);
      hydratedStreamTopicLists.add(scoped.key);
      if (streamHasTopicsNeedingPreview(streamId)) {
        const messages = await fetchStreamChannelMessagesForSidebarTopics(
          streamId,
          undefined,
          controller.signal,
        );
        if (!isScopedRequestCurrent(scoped.orgContext, controller)) {
          return;
        }
        if (messages.length > 0) {
          useChatListStore.getState().applyStreamSidebarPreviewsFromMessages(messages);
          if (streamHasSidebarTopics(streamId)) {
            hydratedStreamIds.add(scoped.key);
          }
        }
      }
    } catch (error) {
      if (isAbortLikeError(error)) {
        return;
      }
      logChatListFlow("chatList: stream sidebar topic list hydrate failed", {
        streamId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlightTopicList.delete(scoped.key);
      inFlightTopicListControllers.delete(scoped.key);
    }
  })();

  inFlightTopicList.set(scoped.key, promise);
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
  const scoped = getActiveScopedStreamContext(streamId);
  if (scoped == null || !shouldHydrateStreamSidebarTopics(streamId, scoped.key)) {
    return Promise.resolve();
  }
  const existing = inFlight.get(scoped.key);
  if (existing != null) {
    return existing;
  }

  const priority = reason === "unread-register";
  const controller = new AbortController();
  inFlightControllers.set(scoped.key, controller);

  const promise = (async () => {
    await acquireHydrateSlot(priority);
    try {
      if (!shouldHydrateStreamSidebarTopics(streamId, scoped.key)) {
        return;
      }

      logChatListFlow("chatList: stream sidebar topics hydrate start", { streamId, reason });
      const messages = await fetchStreamChannelMessagesForSidebarTopics(
        streamId,
        undefined,
        controller.signal,
      );
      if (!isScopedRequestCurrent(scoped.orgContext, controller)) {
        return;
      }
      if (messages.length === 0) {
        logChatListFlow("chatList: stream sidebar topics hydrate empty", { streamId, reason });
        return;
      }

      useChatListStore.getState().applyStreamSidebarPreviewsFromMessages(messages);
      if (streamHasSidebarTopics(streamId)) {
        hydratedStreamIds.add(scoped.key);
        logChatListFlow("chatList: stream sidebar topics hydrate done", {
          streamId,
          reason,
          messageCount: messages.length,
        });
      }
    } catch (error) {
      if (isAbortLikeError(error)) {
        return;
      }
      logChatListFlow("chatList: stream sidebar topics hydrate failed", {
        streamId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.delete(scoped.key);
      inFlightControllers.delete(scoped.key);
      releaseHydrateSlot();
    }
  })();

  inFlight.set(scoped.key, promise);
  return promise;
}
