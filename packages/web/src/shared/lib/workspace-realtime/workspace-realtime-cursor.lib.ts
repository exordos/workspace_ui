import type { WorkspaceMessengerEpochVersion } from "~/shared/api/messenger.types";

export interface WorkspaceRealtimeCursorOwner {
  accountId: string;
  instanceId: string;
  organizationId: string;
  projectId: string;
  userUuid: string;
}

export interface WorkspaceRealtimeCursorStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WorkspaceRealtimeDurableCursorStorage {
  read(owner: WorkspaceRealtimeCursorOwner): WorkspaceMessengerEpochVersion | null;
  write(owner: WorkspaceRealtimeCursorOwner, epochVersion: WorkspaceMessengerEpochVersion): void;
  clear(owner: WorkspaceRealtimeCursorOwner): void;
}

const CURSOR_KEY_PREFIX = "workspace-realtime:cursor";

function encodeCursorKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function parseStoredEpochVersion(value: string | null): WorkspaceMessengerEpochVersion | null {
  if (value == null) return null;

  const epochVersion = Number(value);
  if (!Number.isInteger(epochVersion) || epochVersion < 0) {
    return null;
  }
  return epochVersion;
}

export function workspaceRealtimeCursorKey(owner: WorkspaceRealtimeCursorOwner): string {
  // runtimeGeneration не входит в key: cursor должен переживать reload и смену in-memory поколения.
  // Но account/instance/org/project/user входят в key, чтобы фоновые проекты не делили один cursor.
  return [
    CURSOR_KEY_PREFIX,
    "account",
    encodeCursorKeyPart(owner.accountId),
    "instance",
    encodeCursorKeyPart(owner.instanceId),
    "organization",
    encodeCursorKeyPart(owner.organizationId),
    "project",
    encodeCursorKeyPart(owner.projectId),
    "user",
    encodeCursorKeyPart(owner.userUuid),
  ].join(":");
}

export function createWorkspaceRealtimeCursorStorage(
  storage: WorkspaceRealtimeCursorStorageLike,
): WorkspaceRealtimeDurableCursorStorage {
  return {
    read(owner) {
      return parseStoredEpochVersion(storage.getItem(workspaceRealtimeCursorKey(owner)));
    },
    write(owner, epochVersion) {
      const current = parseStoredEpochVersion(storage.getItem(workspaceRealtimeCursorKey(owner)));
      if (current != null && current >= epochVersion) {
        // Cursor только растёт. Поздний дубль от старого socket не должен откатить catch-up назад.
        return;
      }
      storage.setItem(workspaceRealtimeCursorKey(owner), String(epochVersion));
    },
    clear(owner) {
      storage.removeItem(workspaceRealtimeCursorKey(owner));
    },
  };
}

export function createWorkspaceRealtimeBrowserCursorStorage(): WorkspaceRealtimeDurableCursorStorage | null {
  if (typeof window === "undefined") return null;
  return createWorkspaceRealtimeCursorStorage(window.localStorage);
}
