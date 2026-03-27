/**
 * Client for the Workspace API (separate from Zulip).
 *
 * Uses the shared `workspaceApi` pipeline so auth, logging, retries,
 * and no-cache behavior stay aligned with the documented API architecture.
 *
 * Usage:
 *   import { getFolders, mapWorkspaceFoldersToRail } from "~/lib/api/workspaceClient";
 */
import { guard, invariant } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { isValidUrl } from "~/shared/lib/validation";
import { getCurrentInstance, workspaceApi } from "./client";
import type { ApiResponse } from "./client";

const log = createLogger("workspace-client");

const DEFAULT_WORKSPACE_API_SUFFIX = "/api/v1";
const LEGACY_WORKSPACE_API_SUFFIX = "/workspace/v1";
const ZULIP_HOST_PREFIX = "zulip.";
const WORKSPACE_HOST_PREFIX = "workspace.";
const WORKSPACE_BASE_CACHE_KEY = "workspace.api.resolved-base.v1";

let workspaceBaseResolved = false;
let resolvedInstanceId: string | null = null;
let workspaceBaseResolutionPromise: Promise<WorkspaceBaseResolution> | null = null;
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
interface WorkspaceBaseResolution {
  path: string;
  response: WorkspaceGetResponse;
}

function loadResolvedBaseCache(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_BASE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};

    const next: Record<string, string> = {};
    for (const [instanceId, base] of Object.entries(parsed)) {
      if (typeof base === "string" && base.trim().length > 0) {
        next[instanceId] = base.trim();
      }
    }
    return next;
  } catch {
    return {};
  }
}

function isAllowedCachedWorkspaceBase(baseUrl: string): boolean {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBase) {
    return false;
  }

  if (!/^https?:\/\//i.test(normalizedBase)) {
    return getWorkspaceBaseCandidates(workspaceApi.getBaseUrl()).includes(normalizedBase);
  }

  if (!isValidUrl(normalizedBase)) {
    return false;
  }

  const currentInstance = getCurrentInstance();
  const currentRealm = currentInstance?.realm?.trim();
  const currentRealmOrigin = (() => {
    if (!currentRealm || !isValidUrl(currentRealm)) {
      return null;
    }
    try {
      return new URL(currentRealm).origin;
    } catch {
      return null;
    }
  })();

  try {
    const parsedBase = new URL(normalizedBase);
    if (
      !parsedBase.pathname.endsWith(DEFAULT_WORKSPACE_API_SUFFIX) &&
      !parsedBase.pathname.endsWith(LEGACY_WORKSPACE_API_SUFFIX)
    ) {
      return false;
    }

    if (currentRealmOrigin == null) {
      return false;
    }

    if (parsedBase.origin === currentRealmOrigin) {
      return true;
    }

    const workspaceRealmBase = deriveWorkspaceRealmBase();
    if (!workspaceRealmBase) {
      return false;
    }

    return parsedBase.origin === new URL(workspaceRealmBase).origin;
  } catch {
    return false;
  }
}

function readResolvedBaseForInstance(instanceId: string): string | null {
  const cache = loadResolvedBaseCache();
  const cachedBase = cache[instanceId];
  if (!cachedBase || !isAllowedCachedWorkspaceBase(cachedBase)) {
    return null;
  }
  return cachedBase;
}

function writeResolvedBaseForInstance(instanceId: string, baseUrl: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedBase = baseUrl.trim();
  if (!normalizedBase || !isAllowedCachedWorkspaceBase(normalizedBase)) {
    return;
  }

  try {
    const cache = loadResolvedBaseCache();
    if (cache[instanceId] === normalizedBase) {
      return;
    }
    cache[instanceId] = normalizedBase;
    window.localStorage.setItem(WORKSPACE_BASE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage persistence is best-effort
  }
}

function syncResolutionWithCurrentInstance(): void {
  const currentInstanceId = getCurrentInstance()?.id ?? null;
  if (currentInstanceId !== resolvedInstanceId) {
    resolvedInstanceId = currentInstanceId;
    workspaceBaseResolved = false;
    workspaceBaseResolutionPromise = null;
    if (!currentInstanceId) {
      return;
    }

    const cachedBase = readResolvedBaseForInstance(currentInstanceId);
    if (cachedBase) {
      workspaceApi.setBaseUrl(cachedBase);
    }
  }
}

function replaceBaseSuffix(baseUrl: string, fromSuffix: string, toSuffix: string): string | null {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (!normalizedBase.endsWith(fromSuffix)) {
    return null;
  }
  return `${normalizedBase.slice(0, -fromSuffix.length)}${toSuffix}`;
}

function deriveWorkspaceRealmBase(): string | null {
  const realm = getCurrentInstance()?.realm?.trim();
  if (!realm) {
    return null;
  }

  try {
    const parsedRealm = new URL(realm);
    if (!parsedRealm.hostname.startsWith(ZULIP_HOST_PREFIX)) {
      return null;
    }
    const workspaceHostname = `${WORKSPACE_HOST_PREFIX}${parsedRealm.hostname.slice(ZULIP_HOST_PREFIX.length)}`;
    return `${parsedRealm.protocol}//${workspaceHostname}${LEGACY_WORKSPACE_API_SUFFIX}`;
  } catch {
    return null;
  }
}

function getWorkspaceBaseCandidates(initialBase: string): string[] {
  const normalizedInitialBase = initialBase.replace(/\/+$/, "");
  const isAbsoluteInitialBase = /^https?:\/\//i.test(normalizedInitialBase);
  const candidates = [normalizedInitialBase];

  const legacyPathCandidate = replaceBaseSuffix(
    normalizedInitialBase,
    DEFAULT_WORKSPACE_API_SUFFIX,
    LEGACY_WORKSPACE_API_SUFFIX,
  );
  if (legacyPathCandidate) {
    candidates.push(legacyPathCandidate);
  }

  const defaultPathCandidate = replaceBaseSuffix(
    normalizedInitialBase,
    LEGACY_WORKSPACE_API_SUFFIX,
    DEFAULT_WORKSPACE_API_SUFFIX,
  );
  if (defaultPathCandidate) {
    candidates.push(defaultPathCandidate);
  }

  if (isAbsoluteInitialBase) {
    const workspaceRealmCandidate = deriveWorkspaceRealmBase();
    if (workspaceRealmCandidate) {
      candidates.push(workspaceRealmCandidate);
    }
  }

  return [...new Set(candidates.filter((candidate) => candidate.length > 0))];
}

async function resolveWorkspaceBase(path: string): Promise<WorkspaceBaseResolution> {
  const originalBase = workspaceApi.getBaseUrl();
  const normalizedOriginalBase = originalBase.replace(/\/+$/, "");
  const candidates = workspaceBaseResolved
    ? [normalizedOriginalBase]
    : getWorkspaceBaseCandidates(originalBase);

  let lastError: unknown = null;
  let lastResponse: WorkspaceGetResponse | null = null;

  for (const candidate of candidates) {
    workspaceApi.setBaseUrl(candidate);
    try {
      const response = await workspaceApi.get(path);
      if (response.ok || response.status !== 404) {
        workspaceBaseResolved = true;
        const currentInstanceId = getCurrentInstance()?.id;
        if (currentInstanceId) {
          writeResolvedBaseForInstance(currentInstanceId, candidate);
        }
        if (candidate !== normalizedOriginalBase) {
          log.warn("Workspace API base switched after 404 fallback", {
            from: originalBase,
            to: candidate,
            path,
            status: response.status,
          });
        }
        return { path, response };
      }
      lastResponse = response;
    } catch (error) {
      lastError = error;
    }
  }

  workspaceBaseResolved = true;
  workspaceApi.setBaseUrl(originalBase);

  if (lastResponse) {
    return { path, response: lastResponse };
  }
  if (lastError) {
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error("Workspace API request failed");
  }
  throw new Error(`Workspace API request failed for ${path}`);
}

async function workspaceGetWithFallback(path: string): Promise<WorkspaceGetResponse> {
  syncResolutionWithCurrentInstance();
  const requestKey = `${resolvedInstanceId ?? "none"}::${path}`;
  const inFlight = inFlightWorkspaceGets.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const nextRequest = (async () => {
    if (workspaceBaseResolved) {
      return workspaceApi.get(path);
    }

    if (!workspaceBaseResolutionPromise) {
      const nextResolutionPromise = resolveWorkspaceBase(path);
      workspaceBaseResolutionPromise = nextResolutionPromise;
      void nextResolutionPromise.finally(() => {
        if (workspaceBaseResolutionPromise === nextResolutionPromise) {
          workspaceBaseResolutionPromise = null;
        }
      });
    }

    const resolution = await workspaceBaseResolutionPromise;
    if (resolution.path === path) {
      return resolution.response;
    }
    return workspaceApi.get(path);
  })();

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
  const response = await workspaceGetWithFallback("/services/");
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
  const response = await workspaceGetWithFallback("/folders/");
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

interface WorkspaceFolderItemResponse {
  uuid: string;
  chat_id: string | number;
  folder_uuid: string;
  order_index: number;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
}

function isWorkspaceFolderItemResponse(value: unknown): value is WorkspaceFolderItemResponse {
  return (
    isRecord(value) &&
    typeof value.uuid === "string" &&
    (typeof value.chat_id === "string" ||
      (typeof value.chat_id === "number" &&
        Number.isSafeInteger(value.chat_id) &&
        value.chat_id > 0)) &&
    typeof value.folder_uuid === "string" &&
    typeof value.order_index === "number" &&
    (typeof value.pinned_at === "string" || value.pinned_at === null) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

export interface FolderItemForClient {
  uuid: string;
  chatId: string;
  folderUuid: string;
  orderIndex: number;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapToFolderItemForClient(raw: WorkspaceFolderItemResponse): FolderItemForClient {
  return {
    uuid: raw.uuid,
    chatId: String(raw.chat_id),
    folderUuid: raw.folder_uuid,
    orderIndex: raw.order_index,
    pinnedAt: raw.pinned_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
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

function getFolderBaseCandidates(originalBase: string): string[] {
  const normalizedOriginalBase = originalBase.replace(/\/+$/, "");
  const defaultBaseCandidate = replaceBaseSuffix(
    normalizedOriginalBase,
    LEGACY_WORKSPACE_API_SUFFIX,
    DEFAULT_WORKSPACE_API_SUFFIX,
  );
  if (defaultBaseCandidate == null || defaultBaseCandidate === normalizedOriginalBase) {
    return [normalizedOriginalBase];
  }
  return [defaultBaseCandidate, normalizedOriginalBase];
}

async function requestWithFolderBaseFallback<TResponse extends ApiResponse>(
  request: () => Promise<TResponse>,
): Promise<TResponse> {
  const originalBase = workspaceApi.getBaseUrl();
  const candidates = getFolderBaseCandidates(originalBase);
  let lastResponse: TResponse | null = null;
  let lastError: unknown = null;

  try {
    for (const candidate of candidates) {
      workspaceApi.setBaseUrl(candidate);
      try {
        const response = await request();
        if (response.ok || response.status !== 404) {
          return response;
        }
        lastResponse = response;
      } catch (error) {
        lastError = error;
      }
    }
  } finally {
    workspaceApi.setBaseUrl(originalBase);
  }

  if (lastResponse != null) {
    return lastResponse;
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Workspace folder request failed");
}

/** Fetches all chat assignments within a folder. */
export async function getFolderItems(folderUuid: string): Promise<FolderItemForClient[]> {
  const safeFolderUuid = validateFolderUuid(folderUuid);
  const response = await requestWithFolderBaseFallback(() =>
    workspaceApi.get(`/folders/${safeFolderUuid}/items/`),
  );
  assertWorkspaceResponseOk(response);
  return Array.isArray(response.data)
    ? response.data.filter(isWorkspaceFolderItemResponse).map(mapToFolderItemForClient)
    : [];
}

/** Assigns a chat to a folder. Returns true on success. */
export async function addChatToFolder(folderUuid: string, chatId: string): Promise<boolean> {
  try {
    const safeFolderUuid = validateFolderUuid(folderUuid);
    const safeChatId = validateChatId(chatId);
    const response = await requestWithFolderBaseFallback(() =>
      workspaceApi.postJson(`/folders/${safeFolderUuid}/items/`, {
        chat_id: safeChatId,
      }),
    );
    if (response.ok) {
      return true;
    }

    const numericChatId = parseNumericFolderChatId(safeChatId);
    if (!isIntegerTypeMismatchResponse(response) || numericChatId == null) {
      return false;
    }

    const numericFallbackResponse = await requestWithFolderBaseFallback(() =>
      workspaceApi.postJson(`/folders/${safeFolderUuid}/items/`, {
        chat_id: numericChatId,
      }),
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
    const response = await requestWithFolderBaseFallback(() =>
      workspaceApi.delete(`/folders/${safeFolderUuid}/items/${safeItemUuid}`),
    );
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
    const response = await requestWithFolderBaseFallback(() =>
      workspaceApi.putJson(`/folders/${safeFolderUuid}/items/${safeItemUuid}`, {
        order_index: safeOrderIndex,
      }),
    );
    return response.ok;
  } catch {
    return false;
  }
}
