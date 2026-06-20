/**
 * Deduplicated IAM access-token refresh for concurrent 401 responses.
 *
 * Mirrors exordos_ecosystem/web authRefreshSession: one in-flight refresh serves
 * all waiters; persisted tokens are updated via an app-layer callback.
 */
import { refreshIamAccessToken, type IamRefreshedTokenResult } from "~/shared/api/iam-auth";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("iam-refresh");

export interface IamTokenUpdate {
  instanceId: string;
  accessToken: string;
  refreshToken?: string;
}

type IamTokenUpdater = (update: IamTokenUpdate) => void;

let iamTokenUpdater: IamTokenUpdater | null = null;
let refreshPromise: Promise<IamRefreshedTokenResult | null> | null = null;
let pendingQueue: ((result: IamRefreshedTokenResult | null) => void)[] = [];

/** Injected from `app` to persist refreshed IAM tokens in the instances store. */
export function setIamTokenUpdater(fn: IamTokenUpdater | null): void {
  iamTokenUpdater = fn;
}

function waitForRefresh(): Promise<IamRefreshedTokenResult | null> {
  return new Promise((resolve) => {
    pendingQueue.push(resolve);
  });
}

export async function refreshStoredIamAccessToken(options: {
  iamOrigin: string;
  refreshToken: string;
  instanceId: string;
}): Promise<IamRefreshedTokenResult | null> {
  if (refreshPromise) {
    return waitForRefresh();
  }

  refreshPromise = (async () => {
    let result: IamRefreshedTokenResult | null = null;
    try {
      result = await refreshIamAccessToken(options.iamOrigin, options.refreshToken);
      iamTokenUpdater?.({
        instanceId: options.instanceId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      return result;
    } catch (err) {
      log.warn("IAM access token refresh failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      const queued = pendingQueue;
      pendingQueue = [];
      refreshPromise = null;
      queued.forEach((resolve) => resolve(result));
    }
  })();

  return refreshPromise;
}

/** Resets in-flight refresh state (tests only). */
export function resetIamRefreshSessionForTests(): void {
  refreshPromise = null;
  pendingQueue = [];
}
