/**
 * Shared starred bootstrap/refresh for Sidebar and ActivityPage.
 *
 * Single source: cache-first hydrate, deduped server refresh, and synced list + summary updates.
 */
import {
  hydrateActivityMessagesFromCache,
  isActivityMessagesSnapshotFresher,
} from "~/entities/activity/activity-cache.lib";
import { fetchActivityMessagesPageWithPersist } from "~/entities/activity/activity.api";
import { useActivityStore } from "~/entities/activity/activity.model";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestContextCurrent,
} from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { createLogger } from "~/shared/lib/logger";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";

const log = createLogger("activity:starred-loader");

export const STARRED_SUMMARY_PAGE_SIZE = 200;

export interface EnsureStarredLoadedOptions {
  currentInstanceId: string | null;
  currentUserId: number | null;
  forceRefresh?: boolean;
  pageSize?: number;
  signal?: AbortSignal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfAbortedOrStale(
  signal: AbortSignal | undefined,
  context: { instanceId: string | null; epoch: number },
): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!isActiveOrgRequestContextCurrent(context)) {
    throw new DOMException("Aborted", "AbortError");
  }
}

export async function ensureStarredLoaded(options: EnsureStarredLoadedOptions): Promise<void> {
  const {
    currentInstanceId,
    currentUserId,
    forceRefresh = false,
    pageSize = STARRED_SUMMARY_PAGE_SIZE,
    signal,
  } = options;

  const instanceKey = currentInstanceId ?? "none";
  const requestKey = `${instanceKey}:activity:starred:newest:${pageSize}`;
  const orgContext = captureActiveOrgRequestContext();
  await runInFlightDeduped(requestKey, async () => {
    throwIfAbortedOrStale(signal, orgContext);
    const beforeLoad = useActivityStore.getState();
    const hasFreshInMemoryData =
      !forceRefresh &&
      !beforeLoad.starredSummary.stale &&
      beforeLoad.filters.starred.lastLoadedAt != null &&
      beforeLoad.filters.starred.messages.length > 0;
    if (hasFreshInMemoryData) return;

    const store = useActivityStore.getState();
    let shouldApplyCached = false;

    if (!forceRefresh && currentInstanceId != null) {
      const cached = await hydrateActivityMessagesFromCache(
        currentInstanceId,
        "starred",
        currentUserId,
        pageSize,
      );
      throwIfAbortedOrStale(signal, orgContext);
      const currentMessages = useActivityStore.getState().filters.starred.messages;
      shouldApplyCached =
        cached.length > 0 &&
        (currentMessages.length === 0 ||
          isActivityMessagesSnapshotFresher(cached, currentMessages));
      if (shouldApplyCached) {
        store.setFilterCache("starred", cached, true);
        store.setStarredSummaryFromCache(cached.length, cached.length >= pageSize);
      }
    }

    const latest = useActivityStore.getState();
    const hasCachedData = shouldApplyCached || latest.filters.starred.messages.length > 0;
    const filterRequestVersion = latest.startFilterRequest("starred", hasCachedData);
    const hasSummaryData = hasCachedData || latest.starredSummary.count > 0;
    const summaryRequestVersion = latest.startStarredSummaryRequest(hasSummaryData);

    try {
      const page = await fetchActivityMessagesPageWithPersist(
        "starred",
        currentUserId,
        "newest",
        pageSize,
        { signal },
      );
      throwIfAbortedOrStale(signal, orgContext);
      for (const message of page.messages) {
        useUsersStore.getState().mergeFromMessage(message);
      }
      const hasMore = !page.foundOldest;
      useActivityStore
        .getState()
        .setFilterPageIfActual("starred", filterRequestVersion, page.messages, hasMore);
      useActivityStore.getState().setStarredSummaryFromServerIfActual(summaryRequestVersion, {
        count: page.messages.length,
        isCapped: hasMore,
      });
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      const error = String(err);
      useActivityStore.getState().setFilterErrorIfActual("starred", filterRequestVersion, error);
      useActivityStore.getState().setStarredSummaryErrorIfActual(summaryRequestVersion, error);
      log.error("Failed to load starred activity", { error });
    }
  });
}
