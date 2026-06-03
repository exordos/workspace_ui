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
}

export async function ensureStarredLoaded(options: EnsureStarredLoadedOptions): Promise<void> {
  const {
    currentInstanceId,
    currentUserId,
    forceRefresh = false,
    pageSize = STARRED_SUMMARY_PAGE_SIZE,
  } = options;

  const instanceKey = currentInstanceId ?? "none";
  const requestKey = `${instanceKey}:activity:starred:newest:${pageSize}`;
  await runInFlightDeduped(requestKey, async () => {
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
      );
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
      const error = String(err);
      useActivityStore.getState().setFilterErrorIfActual("starred", filterRequestVersion, error);
      useActivityStore.getState().setStarredSummaryErrorIfActual(summaryRequestVersion, error);
      log.error("Failed to load starred activity", { error });
    }
  });
}
