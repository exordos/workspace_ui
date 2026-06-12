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
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestContextCurrent,
} from "~/entities/instance/instance.model";
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

export async function ensureReactionsLoaded(options: EnsureReactionsLoadedOptions): Promise<void> {
  const {
    currentInstanceId,
    currentUserId,
    forceRefresh = false,
    pageSize = STARRED_SUMMARY_PAGE_SIZE,
    signal,
  } = options;

  const store = useActivityStore.getState();
  if (currentUserId == null) {
    store.startFilterRequest("reactions", false);
    return;
  }

  const instanceKey = currentInstanceId ?? "none";
  const requestKey = `${instanceKey}:activity:reactions:${currentUserId}:newest:${pageSize}`;
  const orgContext = captureActiveOrgRequestContext();
  await runInFlightDeduped(requestKey, async () => {
    throwIfAbortedOrStale(signal, orgContext);
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
      throwIfAbortedOrStale(signal, orgContext);
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
        { signal },
      );
      throwIfAbortedOrStale(signal, orgContext);
      for (const message of page.messages) {
        useUsersStore.getState().mergeFromMessage(message);
      }
      useActivityStore
        .getState()
        .setFilterPageIfActual("reactions", filterRequestVersion, page.messages, !page.foundOldest);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      const error = String(err);
      useActivityStore.getState().setFilterErrorIfActual("reactions", filterRequestVersion, error);
      log.error("Failed to load reactions activity", { error });
    }
  });
}
