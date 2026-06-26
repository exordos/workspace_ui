/**
 * Workspace realtime handlers: folder snapshots and folder item deletes.
 */
import type { MessengerEvent } from "~/shared/api/messenger.types";
import type { WorkspaceFolder } from "~/shared/api/workspace-client";
import type { LayoutMessengerEventDispatchContext } from "./layout-messenger-event-dispatch.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFolderSnapshot(value: unknown): WorkspaceFolder | null {
  if (!isRecord(value)) {
    return null;
  }
  return readNonEmptyString(value.uuid) == null ? null : value;
}

export function handleFolder(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "folder") return;
  const kind = event.kind as string | undefined;
  if (kind === "folder.created" || kind === "folder.updated") {
    const folder = readFolderSnapshot(event.folder);
    if (folder != null) {
      ctx.folderSync?.applyRealtimeFolderSnapshot(folder);
    }
    return;
  }
  if (kind === "folder.deleted" && isRecord(event.folder)) {
    const folderId = readNonEmptyString(event.folder.uuid);
    if (folderId != null) {
      ctx.folderSync?.applyRealtimeFolderDeleted(folderId);
    }
  }
}

export function handleFolderItem(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "folder_item" || event.kind !== "folder_item.deleted") return;
  if (!isRecord(event.folder_item)) return;
  const folderItemId = readNonEmptyString(event.folder_item.uuid);
  if (folderItemId != null) {
    ctx.folderSync?.applyRealtimeFolderItemDeleted(folderItemId);
  }
}
