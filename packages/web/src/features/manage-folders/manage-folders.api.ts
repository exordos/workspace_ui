/**
 * Folder CRUD API — Workspace API endpoints for folder management.
 *
 * POST   /folders/      — create a new folder
 * POST   /folders/:id/  — update folder title / color
 * DELETE /folders/:id/  — delete a folder
 */

import {
  createFolder as createWorkspaceFolderRequest,
  deleteFolder as deleteWorkspaceFolderRequest,
  updateFolder as updateWorkspaceFolderRequest,
} from "workspace-api/workspace-api.generated";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type { CreateFolderInput, FolderItem, UpdateFolderInput } from "./manage-folders.types";
import type {
  UpdateFolderBody,
  WorkspaceFolderResponse,
} from "workspace-api/workspace-api.generated";

const log = createLogger("manage-folders:api");

function mapToFolderItem(raw: WorkspaceFolderResponse): FolderItem {
  return {
    id: raw.uuid,
    title: raw.title,
    backgroundColor: raw.background_color_value,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export async function createFolder(input: CreateFolderInput): Promise<FolderItem | null> {
  guard.nonEmpty(input.title, "folder title");

  try {
    const raw = await createWorkspaceFolderRequest({
      title: input.title,
      background_color_value: input.backgroundColor ?? 0,
    });
    log.info("Folder created", { title: input.title });
    return mapToFolderItem(raw);
  } catch (err) {
    log.error("Folder creation error", { error: String(err) });
    return null;
  }
}

export async function updateFolder(
  folderId: string,
  input: UpdateFolderInput,
): Promise<FolderItem | null> {
  guard.nonEmpty(folderId, "folder id");

  try {
    const body: UpdateFolderBody = {};
    if (input.title != null) body.title = input.title;
    if (input.backgroundColor != null) body.background_color_value = input.backgroundColor;

    const raw = await updateWorkspaceFolderRequest(folderId, body);
    log.info("Folder updated", { folderId });
    return mapToFolderItem(raw);
  } catch (err) {
    log.error("Folder update error", { folderId, error: String(err) });
    return null;
  }
}

export async function deleteFolder(folderId: string): Promise<boolean> {
  guard.nonEmpty(folderId, "folder id");

  try {
    await deleteWorkspaceFolderRequest(folderId);
    log.info("Folder deleted", { folderId });
    return true;
  } catch (err) {
    log.error("Folder deletion error", { folderId, error: String(err) });
    return false;
  }
}
