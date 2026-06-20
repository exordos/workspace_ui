/**
 * Messenger gateway folder REST helpers (`/api/messanger/v1/folders/...`).
 *
 * Folder CRUD and item assignment moved from Workspace REST (`/workspace/v1/folders/`)
 * to the messenger gateway. Uses `messengerApi` (Bearer IAM / Basic api_key via auth middleware).
 *
 * Usage:
 *   import { messengerFoldersGet, messengerFoldersPostJson } from "~/shared/api/messenger-folders.internal";
 */
import {
  getMessengerGatewayApiBaseForCurrentInstance,
  messengerApi,
  type ApiResponse,
} from "./client";
import { WorkspaceApiHttpError } from "./workspace-orval-mutator";

function assertOk(res: ApiResponse): void {
  if (res.ok) {
    return;
  }
  const statusText = res.raw?.statusText ? ` ${res.raw.statusText}` : "";
  throw new WorkspaceApiHttpError(
    `Workspace API error: ${res.status}${statusText}`,
    res.status,
    res.data,
  );
}

function messengerFoldersBase(): string {
  return getMessengerGatewayApiBaseForCurrentInstance();
}

export async function messengerFoldersGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await messengerApi.getWithBase(messengerFoldersBase(), path, undefined, signal);
  assertOk(res);
  return (res.data ?? undefined) as T;
}

export async function messengerFoldersPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await messengerApi.postJsonWithBase(messengerFoldersBase(), path, body);
  assertOk(res);
  return (res.data ?? undefined) as T;
}

export async function messengerFoldersPutJson<T>(path: string, body: unknown): Promise<T> {
  const res = await messengerApi.putJsonWithBase(messengerFoldersBase(), path, body);
  assertOk(res);
  return (res.data ?? undefined) as T;
}

export async function messengerFoldersDelete(path: string): Promise<void> {
  const res = await messengerApi.deleteWithBase(messengerFoldersBase(), path);
  assertOk(res);
}

export async function messengerFoldersPostInvoke(path: string): Promise<void> {
  const res = await messengerApi.postWithBase(messengerFoldersBase(), path, {}, undefined);
  assertOk(res);
}

export function messengerFolderPath(folderUuid: string): string {
  return `/folders/${encodeURIComponent(folderUuid)}`;
}

export function messengerFolderItemsPath(folderUuid: string): string {
  return `${messengerFolderPath(folderUuid)}/items/`;
}

export function messengerFolderItemPath(folderUuid: string, folderItemUuid: string): string {
  return `${messengerFolderPath(folderUuid)}/items/${encodeURIComponent(folderItemUuid)}`;
}

export function messengerFolderItemPinPath(folderUuid: string, folderItemUuid: string): string {
  return `${messengerFolderItemPath(folderUuid, folderItemUuid)}/actions/pin/invoke`;
}

export function messengerFolderItemUnpinPath(folderUuid: string, folderItemUuid: string): string {
  return `${messengerFolderItemPath(folderUuid, folderItemUuid)}/actions/unpin/invoke`;
}
