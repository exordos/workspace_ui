export type DownloadEntryStatus = "downloading" | "downloaded" | "error";

export interface DownloadEntry {
  path: string;
  fileName: string;
  status: DownloadEntryStatus;
  receivedBytes: number;
  totalBytes: number | null;
  startedAt: number;
  updatedAt: number;
}

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
}

export interface DownloadState {
  entries: DownloadEntry[];
  duplicateRequestTick: number;
  startDownload: (path: string, fileName: string) => boolean;
  setProgress: (path: string, progress: DownloadProgress) => void;
  finishDownload: (path: string, success: boolean) => void;
  removeDownload: (path: string) => void;
  clearDownloads: () => void;
}
