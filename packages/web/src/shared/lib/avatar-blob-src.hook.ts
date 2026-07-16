import { useEffect, useState } from "react";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { getAvatarVersion } from "~/shared/lib/avatar";
import {
  getAvatarBlobCacheRow,
  putAvatarBlobCacheRow,
  touchAvatarBlobCacheRow,
} from "~/shared/lib/avatar-blob-cache-db";
import { persistAvatarBlobsToIndexedDb } from "~/shared/lib/avatar-blob-cache-persist.lib";
import {
  buildAvatarBlobCacheKey,
  isAvatarBlobCacheEntrySizeAllowed,
  isAvatarBlobCacheVersionValid,
  shouldBypassAvatarBlobCache,
} from "~/shared/lib/avatar-blob-cache.lib";
import { fetchAvatarBlob, shouldNetworkFetchAvatarBlob } from "~/shared/lib/avatar-blob-fetch.lib";
import { useWorkspaceFileCacheInvalidationVersion } from "~/shared/lib/workspace-file-cache-invalidation.hook";

/**
 * Resolves avatar `src` via IndexedDB blob cache when enabled; falls back to HTTPS URL.
 */
export function useAvatarBlobSrc(resolvedSrc: string | undefined | null): string | undefined {
  const instanceId = useInstancesStore((s) => s.currentInstanceId);
  const fileCacheInvalidationVersion = useWorkspaceFileCacheInvalidationVersion(resolvedSrc);
  const [displaySrc, setDisplaySrc] = useState<string | undefined>(() => {
    const s = resolvedSrc?.trim();
    if (!s || s.length === 0) return undefined;
    return shouldNetworkFetchAvatarBlob(s) ? undefined : s;
  });

  useEffect(() => {
    const trimmed = resolvedSrc?.trim() ?? "";
    if (trimmed.length === 0) {
      setDisplaySrc(undefined);
      return;
    }

    if (shouldBypassAvatarBlobCache(trimmed) || !shouldNetworkFetchAvatarBlob(trimmed)) {
      setDisplaySrc(trimmed);
      return;
    }

    const persistBlob = persistAvatarBlobsToIndexedDb() && instanceId != null;
    const cacheKey = buildAvatarBlobCacheKey(trimmed);

    let cancelled = false;
    let objectUrl: string | null = null;
    // A protected same-origin endpoint needs an Authorization header, which a
    // plain <img src> cannot provide. Keep it out of the DOM until the
    // authenticated fetch below has produced a blob URL.
    setDisplaySrc(undefined);

    const applyBlobUrl = (blob: Blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setDisplaySrc(objectUrl);
    };

    void (async () => {
      const currentVersion = getAvatarVersion();
      if (persistBlob && cacheKey != null) {
        const cached = await getAvatarBlobCacheRow(instanceId, cacheKey);
        if (cancelled) return;

        if (cached != null && isAvatarBlobCacheVersionValid(cached.avatarVersion, currentVersion)) {
          const now = Date.now();
          void touchAvatarBlobCacheRow(instanceId, cacheKey, now);
          applyBlobUrl(cached.blob);
          return;
        }
      }

      const blob = await fetchAvatarBlob(trimmed);
      if (cancelled || blob == null) return;

      if (persistBlob && cacheKey != null && isAvatarBlobCacheEntrySizeAllowed(blob.size)) {
        const now = Date.now();
        void putAvatarBlobCacheRow({
          instanceId,
          cacheKey,
          blob,
          mimeType: blob.type || "application/octet-stream",
          byteSize: blob.size,
          fetchedAt: now,
          lastAccessedAt: now,
          avatarVersion: currentVersion,
        });
      }

      applyBlobUrl(blob);
    })();

    return () => {
      cancelled = true;
      if (objectUrl != null) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileCacheInvalidationVersion, instanceId, resolvedSrc]);

  return displaySrc;
}
