/** Account-scoped persistent cache for IAM-protected Workspace file objects. */
import {
  appendDevWorkspaceApiProxyHeaders,
  getCurrentInstance,
  type InstanceCredentials,
} from "~/shared/api/client";
import { MESSENGER_WORKSPACE_API_PATH } from "~/shared/config/workspace-api-layout";
import { WORKSPACE_PROJECT_UUID } from "~/shared/config/workspace-project";
import { resolveUserUuidFromAccessToken } from "~/shared/lib/access-token-claims.lib";
import { buildAuthHeader } from "~/shared/lib/auth-guard";
import { resolveIamAccessToken, resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";

const STORE_BLOBS = "workspaceFileBlobs";
const STORE_METADATA = "workspaceFileMetadata";
const STORE_AVATAR_POINTERS = "workspaceAvatarPointers";
const SHA256_RE = /^[0-9a-f]{64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE_FILE_CACHE_MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const WORKSPACE_FILE_CACHE_MAX_PARTITION_BYTES = 256 * 1024 * 1024;
const FILE_DOWNLOAD_RE = new RegExp(
  `^${MESSENGER_WORKSPACE_API_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/files/([0-9a-f-]{36})/actions/download$`,
  "i",
);

export interface WorkspaceFileCacheScope {
  instanceId: string;
  origin: string;
  projectId: string;
  userUuid: string;
  partition: string;
}

export interface WorkspaceFileMetadataInput {
  fileUuid: string;
  hash: string;
  streamUuid: string | null;
}

interface WorkspaceFileMetadataRow extends WorkspaceFileMetadataInput {
  id: string;
  instanceId: string;
  partition: string;
  streamKey: string;
  updatedAt: number;
}

interface WorkspaceFileBlobRow {
  id: string;
  instanceId: string;
  partition: string;
  fileUuid: string;
  revision: string;
  streamUuid: string | null;
  streamKey: string;
  blob: Blob;
  byteSize: number;
  fetchedAt: number;
  lastAccessedAt: number;
}

interface WorkspaceAvatarPointerRow {
  id: string;
  instanceId: string;
  partition: string;
  userUuid: string;
  fileUuid: string | null;
}

export interface FetchWorkspaceFileBlobCacheFirstOptions {
  scope: WorkspaceFileCacheScope;
  fileUuid: string;
  fetchMetadata: () => Promise<Omit<WorkspaceFileMetadataInput, "fileUuid"> | null>;
  fetchBinary: () => Promise<Response>;
  readBinary?: (response: Response) => Promise<Blob>;
}

export interface WorkspaceFileCacheInvalidation {
  partition: string;
  fileUuid?: string;
}

const inFlight = new Map<string, Promise<Blob | null>>();
const partitionGenerations = new Map<string, number>();
const invalidationListeners = new Set<(event: WorkspaceFileCacheInvalidation) => void>();

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_RE.test(normalized) ? normalized : null;
}

function normalizeHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SHA256_RE.test(normalized) ? normalized : null;
}

function metadataId(scope: WorkspaceFileCacheScope, fileUuid: string): string {
  return `${scope.partition}|${fileUuid}`;
}

function blobId(scope: WorkspaceFileCacheScope, fileUuid: string, revision: string): string {
  return `${scope.partition}|${fileUuid}|${revision}`;
}

function avatarPointerId(scope: WorkspaceFileCacheScope, userUuid: string): string {
  return `${scope.partition}|${userUuid}`;
}

function generation(partition: string): number {
  return partitionGenerations.get(partition) ?? 0;
}

function bumpGeneration(partition: string): void {
  partitionGenerations.set(partition, generation(partition) + 1);
}

function notifyInvalidation(event: WorkspaceFileCacheInvalidation): void {
  for (const listener of invalidationListeners) listener(event);
}

export function subscribeWorkspaceFileCacheInvalidations(
  listener: (event: WorkspaceFileCacheInvalidation) => void,
): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

export function buildWorkspaceFileCachePartition(
  origin: string,
  projectId: string,
  userUuid: string,
): string {
  return `${normalizeOrigin(origin)}|${projectId.trim().toLowerCase()}|${userUuid.trim().toLowerCase()}`;
}

export function resolveCurrentWorkspaceFileCacheScope(): WorkspaceFileCacheScope | null {
  const instance = getCurrentInstance();
  return instance == null ? null : resolveWorkspaceFileCacheScopeForInstance(instance);
}

export function resolveWorkspaceFileCacheScopeForInstance(
  instance: InstanceCredentials,
): WorkspaceFileCacheScope | null {
  const accessToken = resolveIamAccessToken(instance);
  const userUuid = resolveUserUuidFromAccessToken(accessToken);
  const origin = normalizeOrigin(resolveIamApiOrigin(instance));
  if (userUuid == null || origin === "") return null;
  return {
    instanceId: instance.id,
    origin,
    projectId: WORKSPACE_PROJECT_UUID,
    userUuid,
    partition: buildWorkspaceFileCachePartition(origin, WORKSPACE_PROJECT_UUID, userUuid),
  };
}

export function workspaceFileUuidFromDownloadUrl(value: string): string | null {
  try {
    const base = typeof window === "undefined" ? "https://localhost" : window.location.origin;
    const parsed = new URL(value, base);
    return normalizeUuid(FILE_DOWNLOAD_RE.exec(parsed.pathname)?.[1]);
  } catch {
    return null;
  }
}

function workspaceFileMetadataPath(fileUuid: string): string {
  return `${MESSENGER_WORKSPACE_API_PATH}/files/${fileUuid}`;
}

function workspaceFileDownloadPath(fileUuid: string): string {
  return `${workspaceFileMetadataPath(fileUuid)}/actions/download`;
}

function parseMetadataResponse(
  value: unknown,
): Omit<WorkspaceFileMetadataInput, "fileUuid"> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const nested = row.file;
  const metadata =
    nested != null && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : row;
  const hash = normalizeHash(metadata.hash);
  const streamUuid = metadata.stream_uuid == null ? null : normalizeUuid(metadata.stream_uuid);
  if (hash == null || (metadata.stream_uuid != null && streamUuid == null)) return null;
  return { hash, streamUuid };
}

export async function fetchWorkspaceFileBlobFromApi(
  rawValue: string,
  options: {
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
    readBinary?: (response: Response) => Promise<Blob>;
  } = {},
): Promise<Blob | null> {
  const fileUuid = workspaceFileUuidFromDownloadUrl(rawValue);
  const scope = resolveCurrentWorkspaceFileCacheScope();
  if (fileUuid == null || scope == null) return null;
  const headers = options.headers ?? buildAuthHeader();
  const fetchImpl = options.fetchImpl ?? fetch;
  const request = async (path: string): Promise<Response> =>
    await fetchImpl(path, {
      headers: appendDevWorkspaceApiProxyHeaders(path, headers),
      credentials: "include",
    });
  return await fetchWorkspaceFileBlobCacheFirst({
    scope,
    fileUuid,
    fetchMetadata: async () => {
      const response = await request(workspaceFileMetadataPath(fileUuid));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          await deleteFileRows(scope, fileUuid, true);
        }
        return null;
      }
      try {
        return parseMetadataResponse(await response.json());
      } catch {
        return null;
      }
    },
    fetchBinary: async () => await request(workspaceFileDownloadPath(fileUuid)),
    ...(options.readBinary == null ? {} : { readBinary: options.readBinary }),
  });
}

function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

async function getMetadata(
  scope: WorkspaceFileCacheScope,
  fileUuid: string,
): Promise<WorkspaceFileMetadataRow | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openMessageCacheDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, "readonly");
    const req = tx.objectStore(STORE_METADATA).get(metadataId(scope, fileUuid));
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => resolve((req.result as WorkspaceFileMetadataRow | undefined) ?? null);
  });
}

async function listBlobRowsForFile(
  scope: WorkspaceFileCacheScope,
  fileUuid: string,
): Promise<WorkspaceFileBlobRow[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openMessageCacheDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readonly");
    const req = tx
      .objectStore(STORE_BLOBS)
      .index("byPartitionFile")
      .getAll(IDBKeyRange.only([scope.partition, fileUuid]));
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => resolve((req.result as WorkspaceFileBlobRow[] | undefined) ?? []);
  });
}

async function getBlobRow(
  scope: WorkspaceFileCacheScope,
  fileUuid: string,
  revision: string,
): Promise<WorkspaceFileBlobRow | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openMessageCacheDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readonly");
    const req = tx.objectStore(STORE_BLOBS).get(blobId(scope, fileUuid, revision));
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => resolve((req.result as WorkspaceFileBlobRow | undefined) ?? null);
  });
}

async function deleteFileRows(
  scope: WorkspaceFileCacheScope,
  fileUuid: string,
  deleteMetadata: boolean,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const rows = await listBlobRowsForFile(scope, fileUuid);
  const db = await openMessageCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_BLOBS, STORE_METADATA], "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const blobs = tx.objectStore(STORE_BLOBS);
    for (const row of rows) blobs.delete(row.id);
    if (deleteMetadata) tx.objectStore(STORE_METADATA).delete(metadataId(scope, fileUuid));
  });
}

export async function putWorkspaceFileMetadata(
  scope: WorkspaceFileCacheScope,
  input: WorkspaceFileMetadataInput,
): Promise<void> {
  const fileUuid = normalizeUuid(input.fileUuid);
  const hash = normalizeHash(input.hash);
  const streamUuid = input.streamUuid == null ? null : normalizeUuid(input.streamUuid);
  if (fileUuid == null || hash == null || (input.streamUuid != null && streamUuid == null)) return;
  const previous = await getMetadata(scope, fileUuid);
  if (previous != null && previous.hash !== hash) await deleteFileRows(scope, fileUuid, false);
  if (typeof indexedDB === "undefined") return;
  const db = await openMessageCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_METADATA).put({
      id: metadataId(scope, fileUuid),
      instanceId: scope.instanceId,
      partition: scope.partition,
      fileUuid,
      hash,
      streamUuid,
      streamKey: streamUuid ?? "",
      updatedAt: Date.now(),
    } satisfies WorkspaceFileMetadataRow);
  });
}

async function touchBlobRow(row: WorkspaceFileBlobRow): Promise<void> {
  const db = await openMessageCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_BLOBS).put({ ...row, lastAccessedAt: Date.now() });
  });
}

async function putBlobRow(
  scope: WorkspaceFileCacheScope,
  metadata: WorkspaceFileMetadataInput,
  revision: string,
  blob: Blob,
): Promise<void> {
  if (typeof indexedDB === "undefined" || blob.size > WORKSPACE_FILE_CACHE_MAX_ENTRY_BYTES) return;
  const db = await openMessageCacheDb();
  const existingRows = await new Promise<WorkspaceFileBlobRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readonly");
    const req = tx.objectStore(STORE_BLOBS).index("byPartition").getAll(scope.partition);
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => resolve((req.result as WorkspaceFileBlobRow[] | undefined) ?? []);
  });
  const sorted = [...existingRows].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let total = sorted.reduce((sum, row) => sum + row.byteSize, 0) + blob.size;
  const idsToDelete: string[] = [];
  for (const row of sorted) {
    if (total <= WORKSPACE_FILE_CACHE_MAX_PARTITION_BYTES) break;
    idsToDelete.push(row.id);
    total -= row.byteSize;
  }
  const now = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_BLOBS);
    for (const id of idsToDelete) store.delete(id);
    store.put({
      id: blobId(scope, metadata.fileUuid, revision),
      instanceId: scope.instanceId,
      partition: scope.partition,
      fileUuid: metadata.fileUuid,
      revision,
      streamUuid: metadata.streamUuid,
      streamKey: metadata.streamUuid ?? "",
      blob,
      byteSize: blob.size,
      fetchedAt: now,
      lastAccessedAt: now,
    } satisfies WorkspaceFileBlobRow);
  });
}

function revisionFromEtag(etag: string | null): string | null {
  if (etag == null) return null;
  const trimmed = etag.trim();
  if (trimmed.startsWith("W/")) return null;
  return normalizeHash(trimmed.replace(/^"|"$/g, ""));
}

async function performCacheFirstFetch(
  options: FetchWorkspaceFileBlobCacheFirstOptions,
): Promise<Blob | null> {
  const { scope } = options;
  const fileUuid = normalizeUuid(options.fileUuid);
  if (fileUuid == null) return null;
  let metadata = await getMetadata(scope, fileUuid);
  if (metadata == null) {
    const fetched = await options.fetchMetadata();
    if (fetched == null) return null;
    await putWorkspaceFileMetadata(scope, { ...fetched, fileUuid });
    metadata = await getMetadata(scope, fileUuid);
    if (metadata == null) return null;
  }
  const cached = await getBlobRow(scope, fileUuid, metadata.hash);
  if (cached != null) {
    void touchBlobRow({ ...cached, instanceId: scope.instanceId }).catch(() => undefined);
    return cached.blob;
  }

  const fetchGeneration = generation(scope.partition);
  const response = await options.fetchBinary();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      await deleteFileRows(scope, fileUuid, true);
    }
    return null;
  }
  const blob = await (options.readBinary?.(response) ?? response.blob());
  if (fetchGeneration !== generation(scope.partition)) return null;
  const revision = revisionFromEtag(response.headers.get("etag")) ?? metadata.hash;
  if (revision !== metadata.hash) {
    metadata = { ...metadata, hash: revision };
    await putWorkspaceFileMetadata(scope, metadata);
  }
  await putBlobRow(scope, metadata, revision, blob);
  return blob;
}

export async function fetchWorkspaceFileBlobCacheFirst(
  options: FetchWorkspaceFileBlobCacheFirstOptions,
): Promise<Blob | null> {
  const fileUuid = normalizeUuid(options.fileUuid);
  if (fileUuid == null) return null;
  const key = `${options.scope.partition}|${fileUuid}`;
  const existing = inFlight.get(key);
  if (existing != null) return await existing;
  const pending = performCacheFirstFetch({ ...options, fileUuid }).catch(() => null);
  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inFlight.get(key) === pending) inFlight.delete(key);
  }
}

async function evictFile(scope: WorkspaceFileCacheScope, fileUuid: string): Promise<void> {
  bumpGeneration(scope.partition);
  await deleteFileRows(scope, fileUuid, true);
  notifyInvalidation({ partition: scope.partition, fileUuid });
}

async function evictStream(scope: WorkspaceFileCacheScope, streamUuid: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  bumpGeneration(scope.partition);
  const db = await openMessageCacheDb();
  const range = IDBKeyRange.only([scope.partition, streamUuid]);
  const [blobRows, metadataRows] = await Promise.all([
    new Promise<WorkspaceFileBlobRow[]>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, "readonly");
      const req = tx.objectStore(STORE_BLOBS).index("byPartitionStream").getAll(range);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => resolve((req.result as WorkspaceFileBlobRow[] | undefined) ?? []);
    }),
    new Promise<WorkspaceFileMetadataRow[]>((resolve, reject) => {
      const tx = db.transaction(STORE_METADATA, "readonly");
      const req = tx.objectStore(STORE_METADATA).index("byPartitionStream").getAll(range);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => resolve((req.result as WorkspaceFileMetadataRow[] | undefined) ?? []);
    }),
  ]);
  const fileUuids = new Set([...blobRows, ...metadataRows].map((row) => row.fileUuid));
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_BLOBS, STORE_METADATA], "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const blobs = tx.objectStore(STORE_BLOBS);
    const metadata = tx.objectStore(STORE_METADATA);
    for (const row of blobRows) blobs.delete(row.id);
    for (const row of metadataRows) metadata.delete(row.id);
  });
  for (const fileUuid of fileUuids) notifyInvalidation({ partition: scope.partition, fileUuid });
}

function avatarFileUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^urn:image:([0-9a-f-]{36})(?:\?|$)/i.exec(value.trim());
  return normalizeUuid(match?.[1]);
}

async function applyAvatarPointer(
  scope: WorkspaceFileCacheScope,
  userUuid: string,
  avatar: unknown,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openMessageCacheDb();
  const id = avatarPointerId(scope, userUuid);
  const previous = await new Promise<WorkspaceAvatarPointerRow | null>((resolve, reject) => {
    const tx = db.transaction(STORE_AVATAR_POINTERS, "readonly");
    const req = tx.objectStore(STORE_AVATAR_POINTERS).get(id);
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => resolve((req.result as WorkspaceAvatarPointerRow | undefined) ?? null);
  });
  const nextFileUuid = avatarFileUuid(avatar);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_AVATAR_POINTERS, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_AVATAR_POINTERS).put({
      id,
      instanceId: scope.instanceId,
      partition: scope.partition,
      userUuid,
      fileUuid: nextFileUuid,
    } satisfies WorkspaceAvatarPointerRow);
  });
  if (previous?.fileUuid != null && previous.fileUuid !== nextFileUuid) {
    await evictFile(scope, previous.fileUuid);
  }
}

export async function applyWorkspaceFileCacheEvent(
  scope: WorkspaceFileCacheScope,
  event: WorkspaceEvent,
): Promise<void> {
  if (event.project_id.toLowerCase() !== scope.projectId) return;
  const kind = typeof event.payload.kind === "string" ? event.payload.kind : "";
  if (event.object_type === "file") {
    const fileUuid = normalizeUuid(event.payload.uuid);
    if (fileUuid == null) return;
    if (kind === "file.deleted") {
      await evictFile(scope, fileUuid);
      return;
    }
    if (kind === "file.created" || kind === "file.updated") {
      const hash = normalizeHash(event.payload.hash);
      const streamUuid =
        event.payload.stream_uuid == null ? null : normalizeUuid(event.payload.stream_uuid);
      if (hash == null || (event.payload.stream_uuid != null && streamUuid == null)) return;
      if (kind === "file.updated") await evictFile(scope, fileUuid);
      await putWorkspaceFileMetadata(scope, { fileUuid, hash, streamUuid });
    }
    return;
  }
  if (event.object_type === "stream" && kind === "stream.deleted") {
    const streamUuid = normalizeUuid(event.payload.uuid);
    if (streamUuid != null) await evictStream(scope, streamUuid);
    return;
  }
  if (event.object_type === "stream_binding" && kind === "stream_binding.deleted") {
    const userUuid = normalizeUuid(event.payload.user_uuid);
    const streamUuid = normalizeUuid(event.payload.stream_uuid);
    if (userUuid === scope.userUuid && streamUuid != null) await evictStream(scope, streamUuid);
    return;
  }
  if (event.object_type === "user" && kind === "user.updated") {
    const userUuid = normalizeUuid(event.payload.uuid);
    if (userUuid != null) await applyAvatarPointer(scope, userUuid, event.payload.avatar);
  }
}

async function clearStoreByInstance(
  db: IDBDatabase,
  storeName: string,
  instanceId: string,
): Promise<void> {
  const rows = await new Promise<{ id: string }[]>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).index("byInstance").getAll(instanceId);
    req.onerror = () => reject(idbError(req.error));
    req.onsuccess = () => resolve((req.result as { id: string }[] | undefined) ?? []);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.onerror = () => reject(idbError(tx.error));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(storeName);
    for (const row of rows) store.delete(row.id);
  });
}

export async function clearWorkspaceFileCacheForInstance(instanceId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openMessageCacheDb();
  const partitions = new Set<string>();
  for (const storeName of [STORE_BLOBS, STORE_METADATA, STORE_AVATAR_POINTERS]) {
    const rows = await new Promise<{ partition: string }[]>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).index("byInstance").getAll(instanceId);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => resolve((req.result as { partition: string }[] | undefined) ?? []);
    });
    for (const row of rows) partitions.add(row.partition);
  }
  for (const partition of partitions) bumpGeneration(partition);
  await Promise.all([
    clearStoreByInstance(db, STORE_BLOBS, instanceId),
    clearStoreByInstance(db, STORE_METADATA, instanceId),
    clearStoreByInstance(db, STORE_AVATAR_POINTERS, instanceId),
  ]);
  for (const partition of partitions) notifyInvalidation({ partition });
}

export async function clearWorkspaceFileCachePartition(
  scope: WorkspaceFileCacheScope,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  bumpGeneration(scope.partition);
  const db = await openMessageCacheDb();
  for (const storeName of [STORE_BLOBS, STORE_METADATA, STORE_AVATAR_POINTERS]) {
    const rows = await new Promise<{ id: string }[]>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).index("byPartition").getAll(scope.partition);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => resolve((req.result as { id: string }[] | undefined) ?? []);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      const store = tx.objectStore(storeName);
      for (const row of rows) store.delete(row.id);
    });
  }
  notifyInvalidation({ partition: scope.partition });
}

export async function getWorkspaceFileBlobCacheRowForTests(
  scope: WorkspaceFileCacheScope,
  fileUuid: string,
  revision: string,
): Promise<{ blob: Blob } | null> {
  return await getBlobRow(scope, fileUuid, revision);
}
