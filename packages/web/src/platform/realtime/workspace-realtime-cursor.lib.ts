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

export interface WorkspaceRealtimeCursor {
  epochGeneration: string;
  epochVersion: WorkspaceMessengerEpochVersion;
}

export interface WorkspaceRealtimeDurableCursorStorage {
  read(owner: WorkspaceRealtimeCursorOwner): WorkspaceRealtimeCursor | null;
  write(owner: WorkspaceRealtimeCursorOwner, cursor: WorkspaceRealtimeCursor): void;
  writeSnapshotBoundary(owner: WorkspaceRealtimeCursorOwner, cursor: WorkspaceRealtimeCursor): void;
  requireSnapshotReset(owner: WorkspaceRealtimeCursorOwner): void;
  isSnapshotResetRequired(owner: WorkspaceRealtimeCursorOwner): boolean;
  clear(owner: WorkspaceRealtimeCursorOwner): void;
}

const CURSOR_KEY_PREFIX = "workspace-realtime:cursor";
const SNAPSHOT_RESET_REQUIRED = '"snapshot-reset-required"'; // Recovery state in the same owner record.

function encodeCursorKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function parseStoredCursor(value: string | null): WorkspaceRealtimeCursor | null {
  if (value == null) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed == null ||
      Array.isArray(parsed) ||
      !("epochGeneration" in parsed) ||
      !("epochVersion" in parsed) ||
      typeof parsed.epochGeneration !== "string" ||
      parsed.epochGeneration.trim().length === 0 ||
      typeof parsed.epochVersion !== "number" ||
      !Number.isInteger(parsed.epochVersion) ||
      parsed.epochVersion < 0
    ) {
      return null;
    }

    return {
      epochGeneration: parsed.epochGeneration,
      epochVersion: parsed.epochVersion,
    };
  } catch {
    return null;
  }
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
  // Only a completed snapshot can replace the owner's recovery record.
  function writeCursor(
    owner: WorkspaceRealtimeCursorOwner,
    cursor: WorkspaceRealtimeCursor,
    snapshotPrepared: boolean,
  ): void {
    const key = workspaceRealtimeCursorKey(owner);
    const stored = storage.getItem(key);
    if (stored === SNAPSHOT_RESET_REQUIRED && !snapshotPrepared) return;
    const current = parseStoredCursor(stored);
    if (
      current?.epochGeneration === cursor.epochGeneration &&
      current.epochVersion >= cursor.epochVersion
    )
      return;
    storage.setItem(key, JSON.stringify(cursor));
  }

  return {
    read(owner) {
      const key = workspaceRealtimeCursorKey(owner);
      const value = storage.getItem(key);
      if (value === SNAPSHOT_RESET_REQUIRED) return null;
      const cursor = parseStoredCursor(value);
      if (value != null && cursor == null) {
        // Numeric cursors from the old protocol do not contain epoch_generation.
        // ADR-013 forbids turning them into a compatibility cursor, so discard them.
        storage.removeItem(key);
      }
      return cursor;
    },
    write(owner, cursor) {
      writeCursor(owner, cursor, false);
    },
    writeSnapshotBoundary(owner, cursor) {
      writeCursor(owner, cursor, true);
    },
    requireSnapshotReset(owner) {
      storage.setItem(workspaceRealtimeCursorKey(owner), SNAPSHOT_RESET_REQUIRED);
    },
    isSnapshotResetRequired(owner) {
      return storage.getItem(workspaceRealtimeCursorKey(owner)) === SNAPSHOT_RESET_REQUIRED;
    },
    clear(owner) {
      storage.removeItem(workspaceRealtimeCursorKey(owner));
    },
  };
}

// A browser that disables durable storage still needs one cursor per running session.
export function createWorkspaceRealtimeBrowserCursorStorage(): WorkspaceRealtimeDurableCursorStorage {
  const memory = new Map<string, string>();
  let browserStorage: Storage | null = null;
  try {
    if (typeof window !== "undefined") browserStorage = window.localStorage;
  } catch {
    // Security settings can deny access to localStorage entirely.
  }

  function withBrowserStorage<Result>(operation: (storage: Storage) => Result): Result | undefined {
    if (browserStorage == null) return undefined;
    try {
      return operation(browserStorage);
    } catch {
      browserStorage = null;
      return undefined;
    }
  }
  return createWorkspaceRealtimeCursorStorage({
    getItem(key) {
      const durableValue = withBrowserStorage((storage) => storage.getItem(key));
      if (durableValue === undefined) return memory.get(key) ?? null;
      if (durableValue == null) memory.delete(key);
      else memory.set(key, durableValue);
      return durableValue;
    },
    setItem(key, value) {
      memory.set(key, value);
      withBrowserStorage((storage) => storage.setItem(key, value));
    },
    removeItem(key) {
      memory.delete(key);
      withBrowserStorage((storage) => storage.removeItem(key));
    },
  });
}
