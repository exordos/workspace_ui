/**
 * Shared reactions bootstrap/refresh for ActivityPage.
 *
 * Waits for currentUserId before fetch — avoids has:reaction-only narrow that returns
 * unrelated messages and is replaced with an empty sender-filtered page.
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
import { STARRED_SUMMARY_PAGE_SIZE } from "./activity-starred-loader.lib";

const log = createLogger("activity:reactions-loader");

export interface EnsureReactionsLoadedOptions {
  currentInstanceId: string | null;
  currentUserId: number | null;
  forceRefresh?: boolean;
  pageSize?: number;
}

export async function ensureReactionsLoaded(options: EnsureReactionsLoadedOptions): Promise<void> {
  const {
    currentInstanceId,
    currentUserId,
    forceRefresh = false,
    pageSize = STARRED_SUMMARY_PAGE_SIZE,
  } = options;

  const store = useActivityStore.getState();
  if (currentUserId == null) {
    store.startFilterRequest("reactions", false);
    return;
  }

  const instanceKey = currentInstanceId ?? "none";
  const requestKey = `${instanceKey}:activity:reactions:${currentUserId}:newest:${pageSize}`;
  await runInFlightDeduped(requestKey, async () => {
    const beforeLoad = useActivityStore.getState();
    const hasFreshInMemoryData =
      !forceRefresh &&
      beforeLoad.filters.reactions.lastLoadedAt != null &&
      beforeLoad.filters.reactions.messages.length > 0;
    if (hasFreshInMemoryData) return;

    let shouldApplyCached = false;

    if (!forceRefresh && currentInstanceId != null) {
      const cached = await hydrateActivityMessagesFromCache(
        currentInstanceId,
        "reactions",
        currentUserId,
        pageSize,
      );
      const currentMessages = useActivityStore.getState().filters.reactions.messages;
      shouldApplyCached =
        cached.length > 0 &&
        (currentMessages.length === 0 ||
          isActivityMessagesSnapshotFresher(cached, currentMessages));
      if (shouldApplyCached) {
        useActivityStore.getState().setFilterCache("reactions", cached, true);
      }
    }

    const latest = useActivityStore.getState();
    const hasCachedData = shouldApplyCached || latest.filters.reactions.messages.length > 0;
    const filterRequestVersion = latest.startFilterRequest("reactions", hasCachedData);

    try {
      const page = await fetchActivityMessagesPageWithPersist(
        "reactions",
        currentUserId,
        "newest",
        pageSize,
      );
      for (const message of page.messages) {
        useUsersStore.getState().mergeFromMessage(message);
      }
      useActivityStore
        .getState()
        .setFilterPageIfActual("reactions", filterRequestVersion, page.messages, !page.foundOldest);
    } catch (err) {
      const error = String(err);
      useActivityStore.getState().setFilterErrorIfActual("reactions", filterRequestVersion, error);
      log.error("Failed to load reactions activity", { error });
    }
  });
}
