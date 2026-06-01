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

/**
 * Resolves avatar `src` via IndexedDB blob cache when enabled; falls back to HTTPS URL.
 */
export function useAvatarBlobSrc(resolvedSrc: string | undefined | null): string | undefined {
  const instanceId = useInstancesStore((s) => s.currentInstanceId);
  const [displaySrc, setDisplaySrc] = useState<string | undefined>(() => {
    const s = resolvedSrc?.trim();
    return s && s.length > 0 ? s : undefined;
  });

  useEffect(() => {
    const trimmed = resolvedSrc?.trim() ?? "";
    if (trimmed.length === 0) {
      setDisplaySrc(undefined);
      return;
    }

    if (
      !persistAvatarBlobsToIndexedDb() ||
      shouldBypassAvatarBlobCache(trimmed) ||
      instanceId == null
    ) {
      setDisplaySrc(trimmed);
      return;
    }

    const cacheKey = buildAvatarBlobCacheKey(trimmed);
    if (cacheKey == null) {
      setDisplaySrc(trimmed);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setDisplaySrc(trimmed);

    const applyBlobUrl = (blob: Blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setDisplaySrc(objectUrl);
    };

    void (async () => {
      const currentVersion = getAvatarVersion();
      const cached = await getAvatarBlobCacheRow(instanceId, cacheKey);
      if (cancelled) return;

      if (cached != null && isAvatarBlobCacheVersionValid(cached.avatarVersion, currentVersion)) {
        const now = Date.now();
        void touchAvatarBlobCacheRow(instanceId, cacheKey, now);
        applyBlobUrl(cached.blob);
        return;
      }

      if (!shouldNetworkFetchAvatarBlob(trimmed)) {
        return;
      }

      const blob = await fetchAvatarBlob(trimmed);
      if (cancelled || blob == null) return;

      if (isAvatarBlobCacheEntrySizeAllowed(blob.size)) {
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
  }, [instanceId, resolvedSrc]);

  return displaySrc;
}
