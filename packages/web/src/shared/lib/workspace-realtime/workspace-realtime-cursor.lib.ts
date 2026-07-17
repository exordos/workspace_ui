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
  clear(owner: WorkspaceRealtimeCursorOwner): void;
}

const CURSOR_KEY_PREFIX = "workspace-realtime:cursor";

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
  return {
    read(owner) {
      const key = workspaceRealtimeCursorKey(owner);
      const value = storage.getItem(key);
      const cursor = parseStoredCursor(value);
      if (value != null && cursor == null) {
        // Numeric cursors from the old protocol do not contain epoch_generation.
        // ADR-013 forbids turning them into a compatibility cursor, so discard them.
        storage.removeItem(key);
      }
      return cursor;
    },
    write(owner, cursor) {
      const key = workspaceRealtimeCursorKey(owner);
      const current = parseStoredCursor(storage.getItem(key));
      if (
        current?.epochGeneration === cursor.epochGeneration &&
        current.epochVersion >= cursor.epochVersion
      ) {
        // Cursor только растёт. Поздний дубль от старого socket не должен откатить catch-up назад.
        return;
      }
      storage.setItem(key, JSON.stringify(cursor));
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
