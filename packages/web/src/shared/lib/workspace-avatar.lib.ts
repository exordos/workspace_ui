import { useEffect, useState } from "react";
import type { MessengerClientOptions } from "~/shared/api/messenger-transport.internal";
import { resolveWorkspaceAvatarSource } from "./workspace-avatar-urn.lib";
import {
  createWorkspaceFileResourceCache,
  getWorkspaceFileResourceInvalidationVersion,
  loadWorkspaceFile,
} from "./workspace-file-loader.lib";

export interface WorkspaceAvatarRuntimeScope {
  ownerKey: string;
  runtimeGeneration: number;
}

export interface LoadWorkspaceAvatarOptions extends WorkspaceAvatarRuntimeScope {
  avatarUrn: string | null | undefined;
  requestOptions: MessengerClientOptions;
  signal?: AbortSignal;
}

export interface WorkspaceAvatarResource {
  url: string;
  dispose: () => void;
}

export interface UseWorkspaceAvatarUrlOptions extends WorkspaceAvatarRuntimeScope {
  avatarUrn: string | null | undefined;
  requestOptions: MessengerClientOptions | null;
}

interface LoadedWorkspaceFileAvatar {
  key: string;
  url: string;
}

interface CachedWorkspaceFileAvatar extends LoadedWorkspaceFileAvatar {
  consumers: number;
}

interface WorkspaceFileAvatarLease extends LoadedWorkspaceFileAvatar {
  release: () => void;
}

const MAX_CACHED_WORKSPACE_AVATARS = 64;
const workspaceAvatarFileCache = createWorkspaceFileResourceCache({
  maxEntries: MAX_CACHED_WORKSPACE_AVATARS,
  maxBytes: 32 * 1024 * 1024,
});
const cachedWorkspaceFileAvatars = new Map<string, CachedWorkspaceFileAvatar>();

function workspaceFileAvatarKey(
  ownerKey: string,
  runtimeGeneration: number,
  fileUuid: string,
): string {
  return JSON.stringify([
    ownerKey,
    runtimeGeneration,
    fileUuid,
    getWorkspaceFileResourceInvalidationVersion(ownerKey, fileUuid),
  ]);
}

function touchCachedWorkspaceFileAvatar(entry: CachedWorkspaceFileAvatar): void {
  cachedWorkspaceFileAvatars.delete(entry.key);
  cachedWorkspaceFileAvatars.set(entry.key, entry);
}

function trimCachedWorkspaceFileAvatars(): void {
  for (const [key, entry] of cachedWorkspaceFileAvatars) {
    if (cachedWorkspaceFileAvatars.size <= MAX_CACHED_WORKSPACE_AVATARS) return;
    if (entry.consumers > 0) continue;
    cachedWorkspaceFileAvatars.delete(key);
    URL.revokeObjectURL(entry.url);
  }
}

function createWorkspaceFileAvatarLease(
  entry: CachedWorkspaceFileAvatar,
): WorkspaceFileAvatarLease {
  entry.consumers += 1;
  touchCachedWorkspaceFileAvatar(entry);
  let released = false;
  return {
    key: entry.key,
    url: entry.url,
    release: () => {
      if (released) return;
      released = true;
      entry.consumers = Math.max(0, entry.consumers - 1);
      trimCachedWorkspaceFileAvatars();
    },
  };
}

async function acquireWorkspaceFileAvatar(
  options: LoadWorkspaceAvatarOptions,
  fileUuid: string,
  key: string,
): Promise<WorkspaceFileAvatarLease> {
  const cached = cachedWorkspaceFileAvatars.get(key);
  if (cached != null) {
    return createWorkspaceFileAvatarLease(cached);
  }

  const result = await workspaceAvatarFileCache.load({
    ownerKey: options.ownerKey,
    runtimeGeneration: options.runtimeGeneration,
    fileUuid,
    requestOptions: options.requestOptions,
    signal: options.signal,
  });
  const cachedAfterLoad = cachedWorkspaceFileAvatars.get(key);
  if (cachedAfterLoad != null) {
    return createWorkspaceFileAvatarLease(cachedAfterLoad);
  }

  const entry: CachedWorkspaceFileAvatar = {
    key,
    url: URL.createObjectURL(result.blob),
    consumers: 0,
  };
  cachedWorkspaceFileAvatars.set(key, entry);
  const lease = createWorkspaceFileAvatarLease(entry);
  trimCachedWorkspaceFileAvatars();
  return lease;
}

export async function loadWorkspaceAvatar(
  options: LoadWorkspaceAvatarOptions,
): Promise<WorkspaceAvatarResource | null> {
  const source = resolveWorkspaceAvatarSource(options.avatarUrn);
  if (source == null) {
    return null;
  }

  if (source.kind === "external") {
    return { url: source.url, dispose: () => undefined };
  }

  // The caller aborts this request when the owner or runtime generation changes.
  if (options.ownerKey.trim().length === 0 || !Number.isInteger(options.runtimeGeneration)) {
    return null;
  }

  const result = await loadWorkspaceFile({
    ownerKey: options.ownerKey,
    runtimeGeneration: options.runtimeGeneration,
    fileUuid: source.fileUuid,
    requestOptions: options.requestOptions,
    signal: options.signal,
  });
  const objectUrl = URL.createObjectURL(result.blob);
  let disposed = false;
  return {
    url: objectUrl,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      URL.revokeObjectURL(objectUrl);
    },
  };
}

export function useWorkspaceAvatarUrl(options: UseWorkspaceAvatarUrlOptions): string | undefined {
  const source = resolveWorkspaceAvatarSource(options.avatarUrn);
  const fileUuid = source?.kind === "file" ? source.fileUuid : null;
  const fileKey =
    fileUuid == null
      ? null
      : workspaceFileAvatarKey(options.ownerKey, options.runtimeGeneration, fileUuid);
  const cachedFileUrl = fileKey == null ? undefined : cachedWorkspaceFileAvatars.get(fileKey)?.url;
  const [loadedFileAvatar, setLoadedFileAvatar] = useState<LoadedWorkspaceFileAvatar | null>(null);

  useEffect(() => {
    let active = true;
    let lease: WorkspaceFileAvatarLease | null = null;
    const controller = new AbortController();
    if (fileUuid == null || fileKey == null) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    if (options.requestOptions == null || options.ownerKey.trim().length === 0) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    void acquireWorkspaceFileAvatar(
      {
        avatarUrn: options.avatarUrn,
        ownerKey: options.ownerKey,
        runtimeGeneration: options.runtimeGeneration,
        requestOptions: options.requestOptions,
        signal: controller.signal,
      },
      fileUuid,
      fileKey,
    )
      .then((nextLease) => {
        if (!active || controller.signal.aborted) {
          nextLease.release();
          return;
        }
        lease = nextLease;
        setLoadedFileAvatar({ key: nextLease.key, url: nextLease.url });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setLoadedFileAvatar((current) => (current?.key === fileKey ? null : current));
        }
      });

    return () => {
      active = false;
      controller.abort();
      lease?.release();
    };
  }, [
    fileKey,
    fileUuid,
    options.avatarUrn,
    options.ownerKey,
    options.requestOptions,
    options.runtimeGeneration,
  ]);

  if (source?.kind === "external") {
    return source.url;
  }
  if (fileKey == null) return undefined;
  return loadedFileAvatar?.key === fileKey ? loadedFileAvatar.url : cachedFileUrl;
}
