/**
 * Client for the Workspace API (separate from Zulip).
 *
 * HTTP is implemented via Orval-generated calls + `workspaceOrvalMutator` → `workspaceApi`
 * (auth, logging, retries). Base URL from env — paths are `/v1/...` (see `VITE_WORKSPACE_REST_API_PATH`).
 *
 * Usage:
 *   import { getFolders, mapWorkspaceFoldersToRail } from "~/shared/api/workspace-client";
 */
import {
  createV1FoldersFolderUuidItems,
  deleteV1FoldersFolderUuidItemsFolderItemUuid,
  filterV1Folders,
  filterV1FoldersFolderUuidItems,
  filterV1Services,
  getV1FoldersFolderUuidItemsFolderItemUuid,
  updateV1FoldersFolderUuidItemsFolderItemUuid,
} from "workspace-api/workspace-api.generated";
import type { FolderFilter, FolderItemCreate, ServiceFilter } from "workspace-api/workspace-api.generated";
import { guard, invariant } from "~/shared/lib/guards";
import { isValidUrl } from "~/shared/lib/validation";
import { getCurrentInstance } from "./client";

const inFlightWorkspaceGets = new Map<string, Promise<unknown>>();

/** Folder row from Workspace OpenAPI — re-exported for callers typing `getFolders()`. */
export type WorkspaceFolder = FolderFilter;

type WorkspaceFolderSystemType = "created" | "all";
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

function countUnreadMessageIds(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countUnreadEntry(entry: unknown): number {
  if (typeof entry === "number" || typeof entry === "string") {
    return 1;
  }
  if (Array.isArray(entry)) {
    return entry.length;
  }
  if (!isRecord(entry)) {
    return 0;
  }

  const directCount =
    toSafeCount(entry.count) || toSafeCount(entry.unread_count) || toSafeCount(entry.unreadCount);
  if (directCount > 0) {
    return directCount;
  }

  const unreadMessageIdsCount = countUnreadMessageIds(entry.unread_message_ids);
  if (unreadMessageIdsCount > 0) {
    return unreadMessageIdsCount;
  }

  const messageIdsCount = countUnreadMessageIds(entry.message_ids);
  if (messageIdsCount > 0) {
    return messageIdsCount;
  }

  return countUnreadMessageIds(entry.unread_messages);
}

function countFolderUnreadMessages(unreadMessages: readonly unknown[]): number {
  return unreadMessages.reduce<number>((sum, entry) => sum + countUnreadEntry(entry), 0);
}

function isWorkspaceFolder(value: unknown): value is FolderFilter {
  if (!isRecord(value)) {
    return false;
  }
  const bg = value.background_color_value;
  const bgOk =
    bg === undefined || bg === null || (typeof bg === "number" && Number.isFinite(bg));
  const unreadOk =
    value.unread_messages == null || Array.isArray(value.unread_messages);
  return (
    typeof value.uuid === "string" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string" &&
    typeof value.title === "string" &&
    bgOk &&
    unreadOk &&
    (value.system_type === "created" ||
      value.system_type === "all" ||
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

/** Fetches all workspace folders. */
export async function getFolders(): Promise<WorkspaceFolder[]> {
  const data = await workspaceGetDeduped("/v1/folders/", () => filterV1Folders());
  return Array.isArray(data) ? data.filter(isWorkspaceFolder) : [];
}

/** Folder shape for the FolderRail component. */
export interface WorkspaceFolderForRail {
  id: string;
  label: string;
  backgroundColor: number;
  badge?: number;
  systemType?: WorkspaceFolderRailSystemType;
}

export function mapWorkspaceFoldersToRail(folders: WorkspaceFolder[]): WorkspaceFolderForRail[] {
  return folders.map((f) => ({
    id: f.uuid ?? "",
    label: f.title,
    backgroundColor: f.background_color_value ?? 0,
    badge: (() => {
      const unreadCount = countFolderUnreadMessages(f.unread_messages ?? []);
      return unreadCount > 0 ? unreadCount : undefined;
    })(),
    systemType: f.system_type === "created" || f.system_type === "all" ? f.system_type : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Folder chat assignment (items within a folder)
// ---------------------------------------------------------------------------

export interface FolderItemForClient {
  uuid: string;
  chatId: string;
  folderUuid: string;
  orderIndex: number;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseFolderItemOrderIndex(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function parseFolderItemChatId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

function mapToFolderItemForClient(
  raw: unknown,
  requestFolderUuid: string,
): FolderItemForClient | null {
  if (!isRecord(raw)) {
    return null;
  }
  const uuid = typeof raw.uuid === "string" ? raw.uuid.trim() : "";
  const folderUuidRaw = typeof raw.folder_uuid === "string" ? raw.folder_uuid.trim() : "";
  const folderUuid =
    folderUuidRaw.length > 0 ? folderUuidRaw : requestFolderUuid.trim();
  const chatId = parseFolderItemChatId(raw.chat_id);
  if (uuid.length === 0 || folderUuid.length === 0 || chatId == null) {
    return null;
  }
  const createdAt = typeof raw.created_at === "string" ? raw.created_at : "";
  const updatedAt = typeof raw.updated_at === "string" ? raw.updated_at : createdAt;
  const pinnedAt = typeof raw.pinned_at === "string" ? raw.pinned_at : null;
  return {
    uuid,
    chatId,
    folderUuid,
    orderIndex: parseFolderItemOrderIndex(raw.order_index),
    pinnedAt,
    createdAt,
    updatedAt,
  };
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

function parseNumericFolderChatId(chatId: string): number | null {
  const trimmed = chatId.trim();
  if (!trimmed) return null;

  const decimalMatch = /^[0-9]+$/.exec(trimmed);
  if (decimalMatch) {
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const streamMatch = /^stream:([0-9]+)(?::.*)?$/.exec(trimmed);
  if (streamMatch?.[1]) {
    const parsed = Number(streamMatch[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const singleDmMatch = /^dm:([0-9]+)$/.exec(trimmed);
  if (singleDmMatch?.[1]) {
    const parsed = Number(singleDmMatch[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function parseChatIdToApiInteger(chatId: string): number | null {
  const numeric = parseNumericFolderChatId(chatId);
  if (numeric != null) {
    return numeric;
  }
  return null;
}

function folderItemCreateStub(chatId: number): FolderItemCreate {
  const now = new Date().toISOString();
  return {
    created_at: now,
    updated_at: now,
    chat_id: chatId,
  };
}

/** Fetches all chat assignments within a folder. */
export async function getFolderItems(folderUuid: string): Promise<FolderItemForClient[]> {
  const safeFolderUuid = validateFolderUuid(folderUuid);
  const data = await filterV1FoldersFolderUuidItems(safeFolderUuid);
  if (!Array.isArray(data)) {
    return [];
  }

  const result: FolderItemForClient[] = [];
  for (const rawItem of data) {
    const mapped = mapToFolderItemForClient(rawItem, safeFolderUuid);
    if (mapped != null) {
      result.push(mapped);
    }
  }
  return result;
}

/** Assigns a chat to a folder. Returns true on success. */
export async function addChatToFolder(folderUuid: string, chatId: string): Promise<boolean> {
  try {
    const safeFolderUuid = validateFolderUuid(folderUuid);
    const safeChatId = validateChatId(chatId);
    const chatIdNum = parseChatIdToApiInteger(safeChatId);
    if (chatIdNum == null) {
      return false;
    }
    await createV1FoldersFolderUuidItems(safeFolderUuid, folderItemCreateStub(chatIdNum));
    return true;
  } catch {
    return false;
  }
}

/** Removes a chat assignment from a folder. Returns true on success. */
export async function removeChatFromFolder(folderUuid: string, itemUuid: string): Promise<boolean> {
  try {
    const safeFolderUuid = validateFolderUuid(folderUuid);
    const safeItemUuid = validateFolderItemUuid(itemUuid);
    await deleteV1FoldersFolderUuidItemsFolderItemUuid(safeFolderUuid, safeItemUuid);
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
    const safeFolderUuid = validateFolderUuid(folderUuid);
    const safeItemUuid = validateFolderItemUuid(itemUuid);
    const safeOrderIndex = validateOrderIndex(orderIndex);
    const current = await getV1FoldersFolderUuidItemsFolderItemUuid(safeFolderUuid, safeItemUuid);
    const updatedAt = new Date().toISOString();
    await updateV1FoldersFolderUuidItemsFolderItemUuid(safeFolderUuid, safeItemUuid, {
      ...current,
      order_index: safeOrderIndex,
      updated_at: updatedAt,
    });
    return true;
  } catch {
    return false;
  }
}
