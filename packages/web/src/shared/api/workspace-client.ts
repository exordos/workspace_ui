/**
 * Client for the Workspace API (separate from the messenger API).
 *
 * HTTP is implemented via Orval-generated calls + `workspaceOrvalMutator` → `workspaceApi`
 * (auth, logging, retries). All Workspace REST calls use {@link getWorkspaceApiBaseForCurrentInstance}
 * (login origin + realm; gateway `workspace.*` when organization realm is `messenger.*`).
 * Paths are `/v1/...` (REST mount `/workspace` — see `~/shared/config/workspace-api-layout`).
 *
 * Usage:
 *   import { getFolders, mapWorkspaceFoldersToRail } from "~/shared/api/workspace-client";
 */
import { filterV1Services } from "@workspace/api/workspace-api.generated";
import { MESSENGER_API_PATH } from "~/shared/config/workspace-api-layout";
import { guard, invariant } from "~/shared/lib/guards";
import { isValidUrl } from "~/shared/lib/validation";
import { getCurrentInstance } from "./client";
import {
  messengerFolderItemsCollectionPath,
  messengerFolderItemPath,
  messengerFoldersDelete,
  messengerFoldersGet,
  messengerFoldersPostJson,
  messengerFoldersPutJson,
} from "./messenger-folders.internal";
import type { FilterV1Folders200Item, ServiceFilter } from "@workspace/api/workspace-api.generated";

const inFlightWorkspaceGets = new Map<string, Promise<unknown>>();

const MESSENGER_FOLDERS_LIST_PATH = "/folders/";

type GeneratedWorkspaceFolderItem = NonNullable<FilterV1Folders200Item["items"]>[number];
type WorkspaceFolderItem = GeneratedWorkspaceFolderItem & {
  folder?: string;
  folder_uuid?: string;
  stream_uuid?: string;
  unread_count?: number | null;
};

/** Folder row from `GET /api/messenger/v1/folders/` (nested items included). */
export type WorkspaceFolder = Omit<FilterV1Folders200Item, "items"> & {
  unread_count?: number | null;
  folder_items?: WorkspaceFolderItem[];
  items?: GeneratedWorkspaceFolderItem[];
};

type WorkspaceFolderSystemType = "created" | "all" | "personal" | "channels";
export type WorkspaceFolderRailSystemType = WorkspaceFolderSystemType | "personal" | "channels";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSafeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function isWorkspaceFolder(value: unknown): value is WorkspaceFolder {
  if (!isRecord(value)) {
    return false;
  }
  const bg = value.background_color_value;
  const bgOk = bg === undefined || bg === null || (typeof bg === "number" && Number.isFinite(bg));
  const unreadOk =
    value.unread_count === undefined ||
    value.unread_count === null ||
    (typeof value.unread_count === "number" && Number.isFinite(value.unread_count));
  const itemsOk = value.folder_items === undefined || Array.isArray(value.folder_items);
  const titleOk = value.title === undefined || typeof value.title === "string";
  return (
    typeof value.uuid === "string" &&
    (value.created_at === undefined || typeof value.created_at === "string") &&
    (value.updated_at === undefined || typeof value.updated_at === "string") &&
    titleOk &&
    bgOk &&
    unreadOk &&
    itemsOk &&
    (value.system_type === "created" ||
      value.system_type === "all" ||
      value.system_type === "personal" ||
      value.system_type === "channels" ||
      value.system_type === null ||
      value.system_type === undefined)
  );
}

function getWorkspaceRequestKey(path: string): string {
  const instanceId = getCurrentInstance()?.id ?? "none";
  return `${instanceId}::${path}`;
}

async function workspaceGetDeduped<T>(path: string, fetcher: () => Promise<T>): Promise<T> {
  const requestKey = getWorkspaceRequestKey(path);
  const inFlight = inFlightWorkspaceGets.get(requestKey);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const nextRequest = fetcher();
  inFlightWorkspaceGets.set(requestKey, nextRequest);
  try {
    return await nextRequest;
  } finally {
    if (inFlightWorkspaceGets.get(requestKey) === nextRequest) {
      inFlightWorkspaceGets.delete(requestKey);
    }
  }
}

/** Clears in-flight Workspace GET dedupe when switching organization instance (avoids stale reuse). */
export function clearInFlightWorkspaceFolderRequests(): void {
  inFlightWorkspaceGets.clear();
}

// ---------------------------------------------------------------------------
// Services catalog
// ---------------------------------------------------------------------------

export interface WorkspaceServiceForClient {
  id: string;
  name: string;
  description: string;
  url: string;
  iconUrl: string | null;
}

function mapWorkspaceServiceFromFilter(raw: ServiceFilter): WorkspaceServiceForClient | null {
  const id = raw.uuid?.trim();
  if (id == null || id.length === 0) {
    return null;
  }
  if (!isValidUrl(raw.service_url)) {
    return null;
  }
  const description = typeof raw.description === "string" ? raw.description : "";
  const iconRaw = raw.icon;
  const icon = typeof iconRaw === "string" ? iconRaw : "";

  return {
    id,
    name: raw.name,
    description,
    url: raw.service_url,
    iconUrl: icon.length > 0 && isValidUrl(icon) ? icon : null,
  };
}

/** Fetches all services from the workspace catalog. */
export async function getWorkspaceServices(): Promise<WorkspaceServiceForClient[]> {
  const data = await workspaceGetDeduped("/v1/services/", () => filterV1Services());
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(mapWorkspaceServiceFromFilter)
    .filter((service): service is WorkspaceServiceForClient => service != null);
}

/** Fetches all workspace folders (items nested in each folder row). */
export async function getFolders(): Promise<WorkspaceFolder[]> {
  const requestPath = `${MESSENGER_API_PATH}${MESSENGER_FOLDERS_LIST_PATH}`;
  return workspaceGetDeduped(requestPath, async () => {
    const data = await messengerFoldersGet<unknown>(MESSENGER_FOLDERS_LIST_PATH);
    return Array.isArray(data) ? data.filter(isWorkspaceFolder) : [];
  });
}

/** Folder shape for the FolderRail component. */
export interface WorkspaceFolderForRail {
  id: string;
  label: string;
  backgroundColor: number;
  badge?: number;
  systemType?: WorkspaceFolderRailSystemType;
}

function readWorkspaceFolderSystemType(
  folder: WorkspaceFolder,
): WorkspaceFolderRailSystemType | undefined {
  const systemType = (folder as Record<string, unknown>).system_type;
  if (
    systemType === "created" ||
    systemType === "all" ||
    systemType === "personal" ||
    systemType === "channels"
  ) {
    return systemType;
  }
  return undefined;
}

export function mapWorkspaceFoldersToRail(folders: WorkspaceFolder[]): WorkspaceFolderForRail[] {
  return folders.map((f) => ({
    id: f.uuid ?? "",
    label: f.title ?? "",
    backgroundColor: f.background_color_value ?? 0,
    badge: (() => {
      const unreadCount = toSafeCount((f as Record<string, unknown>).unread_count);
      return unreadCount > 0 ? unreadCount : undefined;
    })(),
    systemType: readWorkspaceFolderSystemType(f),
  }));
}

// ---------------------------------------------------------------------------
// Folder chat assignment (items within a folder)
// ---------------------------------------------------------------------------

export interface FolderItemForClient {
  uuid: string;
  chatId: string;
  folderUuid: string;
  streamUuid?: string;
  chatType?: "private" | "stream" | "group";
  unreadCount?: number;
  orderIndex: number;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseFolderItemOrderIndex(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function parseFolderItemStreamUuid(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function parseFolderItemChatType(value: unknown): FolderItemForClient["chatType"] {
  if (value === "stream" || value === "private" || value === "group") {
    return value;
  }
  return "stream";
}

function mapFolderListItemToClient(
  raw: unknown,
  requestFolderUuid: string,
): FolderItemForClient | null {
  if (!isRecord(raw)) {
    return null;
  }
  const uuid = typeof raw.uuid === "string" ? raw.uuid.trim() : "";
  const folderFromItem =
    typeof raw.folder_uuid === "string"
      ? raw.folder_uuid.trim()
      : typeof raw.folder === "string"
        ? raw.folder.trim()
        : "";
  const folderUuid = folderFromItem.length > 0 ? folderFromItem : requestFolderUuid.trim();
  const streamUuid = parseFolderItemStreamUuid(raw.stream_uuid);
  if (uuid.length === 0 || folderUuid.length === 0 || streamUuid == null) {
    return null;
  }
  const createdAt = typeof raw.created_at === "string" ? raw.created_at : "";
  const updatedAt = typeof raw.updated_at === "string" ? raw.updated_at : createdAt;
  const pinnedAt = typeof raw.pinned_at === "string" ? raw.pinned_at : null;
  const chatType = parseFolderItemChatType(raw.chat_type);
  return {
    uuid,
    chatId: `stream:${streamUuid}:general`,
    folderUuid,
    streamUuid,
    chatType,
    unreadCount: toSafeCount(raw.unread_count),
    orderIndex: parseFolderItemOrderIndex(raw.order_index),
    pinnedAt,
    createdAt,
    updatedAt,
  };
}

/** Parses folder items from a folder row returned by `getFolders()`. */
export function mapWorkspaceFolderItems(folder: WorkspaceFolder): FolderItemForClient[] {
  const folderUuid = typeof folder.uuid === "string" ? folder.uuid.trim() : "";
  if (folderUuid.length === 0) {
    return [];
  }
  const rawItems = (folder as Record<string, unknown>).folder_items;
  if (!Array.isArray(rawItems)) {
    return [];
  }
  const result: FolderItemForClient[] = [];
  for (const rawItem of rawItems) {
    const mapped = mapFolderListItemToClient(rawItem, folderUuid);
    if (mapped != null) {
      result.push(mapped);
    }
  }
  return result;
}

function validateFolderUuid(folderUuid: string): string {
  return guard.nonEmpty(folderUuid, "folderUuid");
}

function validateFolderItemUuid(itemUuid: string): string {
  return guard.nonEmpty(itemUuid, "itemUuid");
}

function validateChatId(chatId: string): string {
  return guard.nonEmpty(chatId, "chatId");
}

function validateOrderIndex(orderIndex: number): number {
  invariant(
    Number.isInteger(orderIndex) && orderIndex >= 0,
    `orderIndex must be a non-negative integer, got: ${orderIndex}`,
  );
  return orderIndex;
}

function parseFolderStreamUuidForCreate(chatId: string): string | null {
  const trimmed = chatId.trim();
  const streamMatch = /^stream:([^:]+)(?::.*)?$/.exec(trimmed);
  const streamUuid = streamMatch?.[1]?.trim();
  if (streamUuid != null && streamUuid.length > 0) {
    return streamUuid;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function folderItemCreateBody(folderUuid: string, streamUuid: string): Record<string, string> {
  return {
    folder_uuid: folderUuid,
    stream_uuid: streamUuid,
    chat_type: "stream",
  };
}

/** Assigns a chat to a folder. Returns true on success. */
export async function addChatToFolder(folderUuid: string, chatId: string): Promise<boolean> {
  try {
    const safeFolderUuid = validateFolderUuid(folderUuid);
    const safeChatId = validateChatId(chatId);
    const streamUuid = parseFolderStreamUuidForCreate(safeChatId);
    if (streamUuid == null) {
      return false;
    }
    await messengerFoldersPostJson(
      messengerFolderItemsCollectionPath(),
      folderItemCreateBody(safeFolderUuid, streamUuid),
    );
    return true;
  } catch {
    return false;
  }
}

/** Removes a chat assignment from a folder. Returns true on success. */
export async function removeChatFromFolder(folderUuid: string, itemUuid: string): Promise<boolean> {
  try {
    validateFolderUuid(folderUuid);
    const safeItemUuid = validateFolderItemUuid(itemUuid);
    await messengerFoldersDelete(messengerFolderItemPath(safeItemUuid));
    return true;
  } catch {
    return false;
  }
}

/** Updates pin order for a folder item. */
export async function updateFolderItemOrder(
  folderUuid: string,
  itemUuid: string,
  orderIndex: number,
): Promise<boolean> {
  try {
    validateFolderUuid(folderUuid);
    const safeItemUuid = validateFolderItemUuid(itemUuid);
    const safeOrderIndex = validateOrderIndex(orderIndex);
    const current = await messengerFoldersGet<WorkspaceFolderItem>(
      messengerFolderItemPath(safeItemUuid),
    );
    const updatedAt = new Date().toISOString();
    await messengerFoldersPutJson(messengerFolderItemPath(safeItemUuid), {
      ...current,
      order_index: safeOrderIndex,
      updated_at: updatedAt,
    });
    return true;
  } catch {
    return false;
  }
}
