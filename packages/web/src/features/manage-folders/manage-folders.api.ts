/**
 * Folder CRUD API — Workspace API endpoints for folder management.
 *
 * OpenAPI: `POST /v1/folders/`, `PUT /v1/folders/{uuid}`, `DELETE /v1/folders/{uuid}`.
 */

import {
  createV1Folders,
  deleteV1FoldersFolderUuid,
  getV1FoldersFolderUuid,
  updateV1FoldersFolderUuid,
} from "@workspace/api/workspace-api.generated";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type { CreateFolderInput, FolderItem, UpdateFolderInput } from "./manage-folders.types";
import type { FolderCreate, FolderUpdate } from "@workspace/api/workspace-api.generated";

const log = createLogger("manage-folders:api");

function isoNow(): string {
  return new Date().toISOString();
}

function mapToFolderItem(
  raw: { uuid?: string; title: string; background_color_value?: number | null } & {
    created_at: string;
    updated_at: string;
  },
): FolderItem {
  return {
    id: raw.uuid ?? "",
    title: raw.title,
    backgroundColor: raw.background_color_value ?? 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export async function createFolder(input: CreateFolderInput): Promise<FolderItem | null> {
  guard.nonEmpty(input.title, "folder title");

  try {
    const t = isoNow();
    const folderCreate: FolderCreate = {
      created_at: t,
      updated_at: t,
      title: input.title,
      background_color_value: input.backgroundColor ?? 0,
    };
    const raw = await createV1Folders(folderCreate);
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
    const current = await getV1FoldersFolderUuid(folderId);
    const folderUpdate = {
      title: input.title ?? current.title,
      background_color_value: input.backgroundColor ?? current.background_color_value ?? 0,
    } as FolderUpdate;
    const raw = await updateV1FoldersFolderUuid(folderId, folderUpdate);
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
    await deleteV1FoldersFolderUuid(folderId);
    log.info("Folder deleted", { folderId });
    return true;
  } catch (err) {
    log.error("Folder deletion error", { folderId, error: String(err) });
    return false;
  }
}
