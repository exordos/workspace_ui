export type DownloadEntryStatus = "starting" | "downloading" | "downloaded" | "error";

export type DownloadErrorCode =
  | "start-timeout"
  | "start-failed"
  | "interrupted"
  | "cancelled"
  | "file-missing";

export interface DownloadEntry {
  id: string;
  ownerKey: string;
  accountId: string;
  fileUuid: string;
  fileName: string;
  status: DownloadEntryStatus;
  receivedBytes: number;
  totalBytes: number | null;
  startedAt: number;
  errorCode?: DownloadErrorCode;
}

export interface DownloadStartInput {
  id: string;
  ownerKey: string;
  accountId: string;
  fileUuid: string;
  fileName: string;
  status?: Extract<DownloadEntryStatus, "starting" | "downloading">;
}

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
}

export interface DownloadState {
  entries: DownloadEntry[];
  duplicateRequestTick: number;
  startDownload: (input: DownloadStartInput) => boolean;
  setProgress: (id: string, progress: DownloadProgress) => void;
  finishDownload: (id: string, success: boolean, errorCode?: DownloadErrorCode) => void;
  upsertDownload: (entry: DownloadEntry) => void;
  replaceDownloads: (entries: readonly DownloadEntry[]) => void;
  removeDownload: (id: string) => void;
  clearDownloads: () => void;
}
