/**
 * The status the user deliberately chose, remembered locally.
 *
 * The server keeps one field for both measured presence and a deliberate status,
 * so once a choice reaches it the client can no longer tell "the user set away"
 * from "the auto-timeout set idle". Remembering the choice here is what lets the
 * heartbeat keep it instead of overwriting it — including across restarts, where
 * the server would otherwise just report an ambiguous `idle`.
 */
import type { WorkspaceManualStatus } from "./user-presence-status.lib";

const STORAGE_KEY_PREFIX = "workspace-manual-status";

function storageKey(userUuid: string): string {
  return `${STORAGE_KEY_PREFIX}:${userUuid}`;
}

function isManualStatus(value: unknown): value is WorkspaceManualStatus {
  return value === "idle";
}

export function readManualStatus(userUuid: string): WorkspaceManualStatus | null {
  if (typeof window === "undefined" || userUuid.length === 0) return null;
  try {
    const value = window.localStorage.getItem(storageKey(userUuid));
    return isManualStatus(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeManualStatus(userUuid: string, status: WorkspaceManualStatus | null): void {
  if (typeof window === "undefined" || userUuid.length === 0) return;
  try {
    if (status == null) {
      window.localStorage.removeItem(storageKey(userUuid));
      return;
    }
    window.localStorage.setItem(storageKey(userUuid), status);
  } catch {
    /* a full or blocked storage must not break setting a status */
  }
}
