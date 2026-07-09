/**
 * Application cold-start reset — wipes local caches while preserving saved org logins.
 *
 * Usage:
 *   import { performApplicationColdStart } from "~/shared/lib/local-reset";
 *   await performApplicationColdStart();
 *   window.location.reload();
 */
import { deleteWorkspaceMessengerCacheDatabase } from "~/shared/lib/workspace-messenger-cache-db";

const PRESERVED_AUTH_STORAGE_KEYS = [
  "workspace-runtime-instances",
  "workspace-runtime-current-instance",
] as const;

function isPreservedAuthStorageKey(key: string): boolean {
  return (PRESERVED_AUTH_STORAGE_KEYS as readonly string[]).includes(key);
}

function collectStorageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key != null) keys.push(key);
  }
  return keys;
}

function clearLocalStorageExceptAuth(storage: Storage = localStorage): void {
  const keys = collectStorageKeys(storage);
  for (const key of keys) {
    if (isPreservedAuthStorageKey(key)) continue;
    try {
      storage.removeItem(key);
    } catch {
      return;
    }
  }
}

function clearSessionStorage(storage: Storage = sessionStorage): void {
  try {
    storage.clear();
  } catch {
    /* sessionStorage may be restricted */
  }
}

async function clearHttpCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch {
    /* Cache Storage is optional */
  }
}

/** Wipes Workspace cache, sessionStorage, HTTP caches, and localStorage except saved org logins. */
export async function performApplicationColdStart(): Promise<void> {
  try {
    await deleteWorkspaceMessengerCacheDatabase();
  } catch {
    /* IDB wipe is best-effort */
  }

  try {
    clearSessionStorage();
  } catch {
    /* optional runtime */
  }

  try {
    clearLocalStorageExceptAuth();
  } catch {
    /* optional runtime */
  }

  try {
    await clearHttpCaches();
  } catch {
    /* optional runtime */
  }
}

export { PRESERVED_AUTH_STORAGE_KEYS };
