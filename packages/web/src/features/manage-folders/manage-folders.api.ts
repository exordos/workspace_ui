/**
 * Folder CRUD API — Workspace API endpoints for folder management.
 *
 * POST   /folders/      — create a new folder
 * PUT    /folders/:id/  — update folder title / color
 * DELETE /folders/:id/  — delete a folder
 */

import { workspaceApi } from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type { CreateFolderInput, FolderItem, UpdateFolderInput } from "./manage-folders.types";

const log = createLogger("manage-folders:api");

interface WorkspaceFolderResponse {
  uuid: string;
  title: string;
  background_color_value: number;
  created_at: string;
  updated_at: string;
}

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
    const res = await workspaceApi.postJson<WorkspaceFolderResponse>("/folders/", {
      title: input.title,
      background_color_value: input.backgroundColor ?? 0,
    });

    if (res.ok) {
      log.info("Folder created", { title: input.title });
      return mapToFolderItem(res.data);
    }

    log.warn("Folder creation failed", { status: res.status });
    return null;
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
    const body: Record<string, unknown> = {};
    if (input.title != null) body.title = input.title;
    if (input.backgroundColor != null) body.background_color_value = input.backgroundColor;

    const res = await workspaceApi.postJson<WorkspaceFolderResponse>(`/folders/${folderId}/`, body);

    if (res.ok) {
      log.info("Folder updated", { folderId });
      return mapToFolderItem(res.data);
    }

    log.warn("Folder update failed", { folderId, status: res.status });
    return null;
  } catch (err) {
    log.error("Folder update error", { folderId, error: String(err) });
    return null;
  }
}

export async function deleteFolder(folderId: string): Promise<boolean> {
  guard.nonEmpty(folderId, "folder id");

  try {
    const res = await workspaceApi.delete(`/folders/${folderId}/`);

    if (res.ok) {
      log.info("Folder deleted", { folderId });
      return true;
    }

    log.warn("Folder deletion failed", { folderId, status: res.status });
    return false;
  } catch (err) {
    log.error("Folder deletion error", { folderId, error: String(err) });
    return false;
  }
}
