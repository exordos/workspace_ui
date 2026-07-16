import { useEffect, useState } from "react";
import {
  resolveCurrentWorkspaceFileCacheScope,
  subscribeWorkspaceFileCacheInvalidations,
  workspaceFileUuidFromDownloadUrl,
} from "~/shared/lib/workspace-file-blob-cache";

/** Revision counter that makes active blob URLs react to ACL/file invalidation events. */
export function useWorkspaceFileCacheInvalidationVersion(rawValue?: string | null): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const scope = resolveCurrentWorkspaceFileCacheScope();
    if (scope == null) return;
    const fileUuid = rawValue == null ? null : workspaceFileUuidFromDownloadUrl(rawValue);
    return subscribeWorkspaceFileCacheInvalidations((event) => {
      if (event.partition !== scope.partition) return;
      if (fileUuid != null && event.fileUuid != null && event.fileUuid !== fileUuid) return;
      setVersion((current) => current + 1);
    });
  }, [rawValue]);

  return version;
}
