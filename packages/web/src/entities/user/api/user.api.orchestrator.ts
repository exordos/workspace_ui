/**
 * Central policy for on-demand user status loads.
 *
 * Every fallback status request flows here: TTL/backoff, in-flight dedup,
 * priority queue, and store/IDB writes are applied in one place.
 */

import { getCurrentInstance } from "~/shared/api/client";
import { getUserStatusCacheRow, putUserStatusCacheRow } from "~/shared/lib/user-status-cache-db";
import { useUsersStore, type UserRecord } from "../user.model";
import type {
  FetchUserStatusDetailed,
  RequestUserStatusOptions,
  StatusFetchOutcome,
  UserStatusRequestReason,
} from "./user.api.types";

/** Success response considered fresh for this long (default); DM header uses 1 min. */
function getSuccessTtlMs(reason: UserStatusRequestReason | undefined): number {
  if (reason === "dm_header") return 60_000;
  return 5 * 60_000;
}
const STATUS_INVALID_USER_BACKOFF_MS = 24 * 60 * 60_000;
const STATUS_TRANSIENT_ERROR_RETRY_MS = 5 * 60_000;
const STATUS_MAX_CONCURRENT_REQUESTS = 2;

const statusRequestCache = new Map<string, Promise<void>>();

interface StatusQueueItem {
  key: string;
  userId: number;
  resolve: () => void;
  reject: (error: unknown) => void;
}

const highPriorityQueue: StatusQueueItem[] = [];
const lowPriorityQueue: StatusQueueItem[] = [];
let activeStatusRequests = 0;

function getStatusRequestKey(userId: number): string {
  const instanceId = getCurrentInstance()?.id ?? "no-instance";
  return `${instanceId}:${userId}`;
}

function shouldSkipRequest(
  user: UserRecord,
  now: number,
  options: RequestUserStatusOptions | undefined,
): boolean {
  if (options?.force === true) {
    return false;
  }
  if (user.statusNextRetryAt != null && now < user.statusNextRetryAt) {
    return true;
  }
  const ttl = getSuccessTtlMs(options?.reason);
  return user.statusFetchedAt != null && now - user.statusFetchedAt < ttl;
}

function enqueueStatusRequest(item: StatusQueueItem, options: RequestUserStatusOptions): void {
  if (options.priority === "high") {
    highPriorityQueue.push(item);
    return;
  }
  lowPriorityQueue.push(item);
}

function nextStatusRequestItem(): StatusQueueItem | undefined {
  return highPriorityQueue.shift() ?? lowPriorityQueue.shift();
}

function applyFetchOutcome(userId: number, outcome: StatusFetchOutcome): void {
  if (outcome.kind === "ok") {
    const fetchedAt = Date.now();
    useUsersStore.getState().setStatus(userId, outcome.status, fetchedAt);
    const inst = getCurrentInstance();
    if (inst?.id) {
      void putUserStatusCacheRow({
        instanceId: inst.id,
        userId,
        status: outcome.status,
        fetchedAt,
      });
    }
    return;
  }
  if (outcome.kind === "invalid_user") {
    useUsersStore.getState().setStatusFetchMeta(userId, {
      fetchState: "invalid_user",
      errorKind: "invalid_user",
      nextRetryAt: Date.now() + STATUS_INVALID_USER_BACKOFF_MS,
      fetchedAt: Date.now(),
    });
    return;
  }
  useUsersStore.getState().setStatusFetchMeta(userId, {
    fetchState: "error",
    errorKind: "transient",
    nextRetryAt: Date.now() + STATUS_TRANSIENT_ERROR_RETRY_MS,
    fetchedAt: Date.now(),
  });
}

function applyTransientFailure(userId: number): void {
  useUsersStore.getState().setStatusFetchMeta(userId, {
    fetchState: "error",
    errorKind: "transient",
    nextRetryAt: Date.now() + STATUS_TRANSIENT_ERROR_RETRY_MS,
    fetchedAt: Date.now(),
  });
}

async function processStatusQueueItem(
  item: StatusQueueItem,
  fetchUserStatusDetailed: FetchUserStatusDetailed,
): Promise<void> {
  useUsersStore.getState().setStatusFetchMeta(item.userId, {
    fetchState: "loading",
    fetchedAt: Date.now(),
  });

  try {
    const outcome = await fetchUserStatusDetailed(item.userId);
    applyFetchOutcome(item.userId, outcome);
    item.resolve();
  } catch (error) {
    applyTransientFailure(item.userId);
    item.reject(error);
  } finally {
    statusRequestCache.delete(item.key);
    activeStatusRequests = Math.max(0, activeStatusRequests - 1);
  }
}

function pumpStatusRequestQueue(fetchUserStatusDetailed: FetchUserStatusDetailed): void {
  while (activeStatusRequests < STATUS_MAX_CONCURRENT_REQUESTS) {
    const nextItem = nextStatusRequestItem();
    if (!nextItem) {
      return;
    }
    activeStatusRequests += 1;
    void processStatusQueueItem(nextItem, fetchUserStatusDetailed).finally(() => {
      pumpStatusRequestQueue(fetchUserStatusDetailed);
    });
  }
}

export async function requestUserStatusWithPolicy(
  userId: number,
  options: RequestUserStatusOptions | undefined,
  fetchUserStatusDetailed: FetchUserStatusDetailed,
): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return;
  }

  const instance = getCurrentInstance();
  if (!instance?.realm || !instance.email || !instance.apiKey) {
    return;
  }

  let user = useUsersStore.getState().getUser(userId);
  if (!user) {
    return;
  }

  const normalizedOptions: RequestUserStatusOptions = {
    ...options,
    reason: options?.reason ?? "compat",
    priority: options?.priority ?? "low",
  };

  if (user.statusFetchedAt == null && instance.id) {
    const row = await getUserStatusCacheRow(instance.id, userId);
    if (row != null) {
      useUsersStore.getState().setStatus(userId, row.status, row.fetchedAt);
      user = useUsersStore.getState().getUser(userId);
      if (!user) {
        return;
      }
    }
  }

  const now = Date.now();
  if (shouldSkipRequest(user, now, normalizedOptions)) {
    return;
  }

  const key = getStatusRequestKey(userId);
  const inFlight = statusRequestCache.get(key);
  if (inFlight) {
    await inFlight;
    return;
  }

  const promise = new Promise<void>((resolve, reject) => {
    enqueueStatusRequest({ key, userId, resolve, reject }, normalizedOptions);
    pumpStatusRequestQueue(fetchUserStatusDetailed);
  });

  statusRequestCache.set(key, promise);
  await promise;
}
