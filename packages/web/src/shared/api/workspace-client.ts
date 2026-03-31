/**
 * Client for the Workspace API (separate from Zulip).
 *
 * Uses the shared `workspaceApi` pipeline so auth, logging, retries,
 * and no-cache behavior stay aligned with the documented API architecture.
 * Base path comes only from env/config (`VITE_WORKSPACE_API_PATH` / `VITE_WORKSPACE_API_BASE_URL`).
 *
 * Usage:
 *   import { getFolders, mapWorkspaceFoldersToRail } from "~/lib/api/workspaceClient";
 */
import { guard, invariant } from "~/shared/lib/guards";
import { isValidUrl } from "~/shared/lib/validation";
import { getCurrentInstance, workspaceApi } from "./client";
import type { ApiResponse } from "./client";

const inFlightWorkspaceGets = new Map<string, Promise<WorkspaceGetResponse>>();

type WorkspaceFolderSystemType = "created" | "all";
export type WorkspaceFolderRailSystemType = WorkspaceFolderSystemType | "personal" | "channels";

interface WorkspaceFolder {
  uuid: string;
  created_at: string;
  updated_at: string;
  title: string;
  background_color_value: number;
  unread_messages: unknown[];
  system_type: WorkspaceFolderSystemType;
}

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

function isWorkspaceFolder(value: unknown): value is WorkspaceFolder {
  return (
    isRecord(value) &&
    typeof value.uuid === "string" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string" &&
    typeof value.title === "string" &&
    typeof value.background_color_value === "number" &&
    Array.isArray(value.unread_messages) &&
    (value.system_type === "created" || value.system_type === "all")
  );
}

function assertWorkspaceResponseOk(response: {
  ok: boolean;
  status: number;
  raw?: { statusText?: string };
}): void {
  if (response.ok) {
    return;
  }

  const statusText = response.raw?.statusText ? ` ${response.raw.statusText}` : "";
  throw new Error(`Workspace API error: ${response.status}${statusText}`);
}

type WorkspaceGetResponse = Awaited<ReturnType<typeof workspaceApi.get>>;
function getWorkspaceRequestKey(path: string): string {
  // Изолируем in-flight dedupe по инстансу, чтобы не склеивать запросы между аккаунтами.
  const instanceId = getCurrentInstance()?.id ?? "none";
  return `${instanceId}::${path}`;
}

async function workspaceGet(path: string): Promise<WorkspaceGetResponse> {
  const requestKey = getWorkspaceRequestKey(path);
  const inFlight = inFlightWorkspaceGets.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const nextRequest = workspaceApi.get(path);
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

interface WorkspaceServiceResponse {
  uuid: string;
  name: string;
  description: string;
  service_url: string;
  icon: string;
}

function isWorkspaceServiceResponse(value: unknown): value is WorkspaceServiceResponse {
  return (
    isRecord(value) &&
    typeof value.uuid === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.service_url === "string" &&
    typeof value.icon === "string"
  );
}

export interface WorkspaceServiceForClient {
  id: string;
  name: string;
  description: string;
  url: string;
  iconUrl: string | null;
}

function mapWorkspaceService(raw: WorkspaceServiceResponse): WorkspaceServiceForClient | null {
  if (!isValidUrl(raw.service_url)) {
    return null;
  }

  return {
    id: raw.uuid,
    name: raw.name,
    description: raw.description,
    url: raw.service_url,
    iconUrl: isValidUrl(raw.icon) ? raw.icon : null,
  };
}

/** Fetches all services from the workspace catalog. */
export async function getWorkspaceServices(): Promise<WorkspaceServiceForClient[]> {
  const response = await workspaceGet("/services/");
  assertWorkspaceResponseOk(response);
  if (!Array.isArray(response.data)) {
    return [];
  }

  return response.data
    .filter(isWorkspaceServiceResponse)
    .map(mapWorkspaceService)
    .filter((service): service is WorkspaceServiceForClient => service != null);
}

/** Fetches all workspace folders. */
export async function getFolders(): Promise<WorkspaceFolder[]> {
  const response = await workspaceGet("/folders/");
  assertWorkspaceResponseOk(response);
  return Array.isArray(response.data) ? response.data.filter(isWorkspaceFolder) : [];
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
    id: f.uuid,
    label: f.title,
    backgroundColor: f.background_color_value,
    badge: (() => {
      const unreadCount = countFolderUnreadMessages(f.unread_messages);
      return unreadCount > 0 ? unreadCount : undefined;
    })(),
    systemType: f.system_type,
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
  // Допускаем число и строку-число; при любом шуме откатываемся к 0.
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
  // Поддерживаем строковый и числовой chat_id из разных версий backend-контрактов.
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

function mapToFolderItemForClient(raw: unknown): FolderItemForClient | null {
  // Нормализуем "мягкий" формат ответа и отбрасываем только явно битые записи.
  if (!isRecord(raw)) {
    return null;
  }
  const uuid = typeof raw.uuid === "string" ? raw.uuid.trim() : "";
  const folderUuid = typeof raw.folder_uuid === "string" ? raw.folder_uuid.trim() : "";
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

function isIntegerTypeMismatchResponse(response: ApiResponse): boolean {
  if (response.status !== 400 || !isRecord(response.data)) return false;
  const message = typeof response.data.message === "string" ? response.data.message : "";
  return message.includes("Invalid type value") && message.includes("Integer");
}

/** Fetches all chat assignments within a folder. */
export async function getFolderItems(folderUuid: string): Promise<FolderItemForClient[]> {
  const safeFolderUuid = validateFolderUuid(folderUuid);
  const response = await workspaceApi.get(`/folders/${safeFolderUuid}/items/`);
  assertWorkspaceResponseOk(response);
  if (!Array.isArray(response.data)) {
    return [];
  }

  const result: FolderItemForClient[] = [];
  // Здесь намеренно не падаем на частично невалидных элементах — собираем максимум полезных данных.
  for (const rawItem of response.data) {
    const mapped = mapToFolderItemForClient(rawItem);
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
    const response = await workspaceApi.postJson(`/folders/${safeFolderUuid}/items/`, {
      chat_id: safeChatId,
    });
    if (response.ok) {
      return true;
    }

    const numericChatId = parseNumericFolderChatId(safeChatId);
    if (!isIntegerTypeMismatchResponse(response) || numericChatId == null) {
      return false;
    }

    const numericFallbackResponse = await workspaceApi.postJson(
      `/folders/${safeFolderUuid}/items/`,
      {
        chat_id: numericChatId,
      },
    );
    return numericFallbackResponse.ok;
  } catch {
    return false;
  }
}

/** Removes a chat assignment from a folder. Returns true on success. */
export async function removeChatFromFolder(folderUuid: string, itemUuid: string): Promise<boolean> {
  try {
    const safeFolderUuid = validateFolderUuid(folderUuid);
    const safeItemUuid = validateFolderItemUuid(itemUuid);
    const response = await workspaceApi.delete(`/folders/${safeFolderUuid}/items/${safeItemUuid}`);
    return response.ok;
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
    const response = await workspaceApi.putJson(
      `/folders/${safeFolderUuid}/items/${safeItemUuid}`,
      {
        order_index: safeOrderIndex,
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
