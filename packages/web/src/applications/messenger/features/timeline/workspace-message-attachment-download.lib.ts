import { useDownloadStore } from "~/entities/download/download.model";
import type { DownloadEntry } from "~/entities/download/download.types";
import { openWorkspaceDownload } from "~/features/workspace-file-download/workspace-file-download.lib";

function isActive(entry: DownloadEntry): boolean {
  return entry.status === "starting" || entry.status === "downloading";
}

export function findAttachmentDownload(
  entries: readonly DownloadEntry[],
  ownerKey: string,
  fileUuid: string,
): DownloadEntry | undefined {
  let latest: DownloadEntry | undefined;
  for (const entry of entries) {
    if (entry.ownerKey !== ownerKey || entry.fileUuid !== fileUuid) continue;
    if (isActive(entry)) return entry;
    if (latest == null || entry.startedAt > latest.startedAt) latest = entry;
  }
  return latest;
}

export function handleCurrentAttachmentDownload(ownerKey: string, fileUuid: string): boolean {
  const entry = findAttachmentDownload(useDownloadStore.getState().entries, ownerKey, fileUuid);
  if (entry == null) return false;
  if (isActive(entry)) return true;
  if (entry.status === "downloaded" && window.electronAPI?.downloads != null) {
    void openWorkspaceDownload(entry.id);
    return true;
  }
  return false;
}
