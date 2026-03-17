/**
 * Offline folder cache for sidebar folder rail.
 *
 * Persists the mapped folder list per instance in localStorage so the folder
 * rail can render the last known state when the network is unavailable.
 */
import type { WorkspaceFolderForRail } from "~/shared/api/workspace-client";

const OFFLINE_FOLDERS_KEY_PREFIX = "workspace-offline-folders";

function buildStorageKey(instanceId: string): string {
  return `${OFFLINE_FOLDERS_KEY_PREFIX}:${instanceId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFolderForRail(value: unknown): value is WorkspaceFolderForRail {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.label !== "string") return false;
  if (typeof value.backgroundColor !== "number") return false;
  if (value.badge != null && typeof value.badge !== "number") return false;
  if (
    value.systemType != null &&
    value.systemType !== "all" &&
    value.systemType !== "created" &&
    value.systemType !== "personal" &&
    value.systemType !== "channels"
  ) {
    return false;
  }
  return true;
}

export function saveOfflineFolders(instanceId: string, folders: WorkspaceFolderForRail[]): void {
  if (typeof window === "undefined" || instanceId.trim().length === 0) return;
  try {
    window.localStorage.setItem(buildStorageKey(instanceId), JSON.stringify(folders));
  } catch {
    // best-effort cache write (quota/restricted storage)
  }
}

export function loadOfflineFolders(instanceId: string): WorkspaceFolderForRail[] {
  if (typeof window === "undefined" || instanceId.trim().length === 0) return [];
  try {
    const raw = window.localStorage.getItem(buildStorageKey(instanceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFolderForRail);
  } catch {
    return [];
  }
}
