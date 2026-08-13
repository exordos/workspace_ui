export type WorkspaceDownloadStatus = "starting" | "downloading" | "downloaded" | "error";

export type WorkspaceDownloadErrorCode =
  | "start-timeout"
  | "start-failed"
  | "interrupted"
  | "cancelled"
  | "file-missing";

export interface WorkspaceDownloadEntry {
  id: string;
  ownerKey: string;
  accountId: string;
  fileUuid: string;
  fileName: string;
  status: WorkspaceDownloadStatus;
  receivedBytes: number;
  totalBytes: number | null;
  startedAt: number;
  errorCode?: WorkspaceDownloadErrorCode;
}

export interface WorkspaceDownloadStartInput {
  id: string;
  ownerKey: string;
  accountId: string;
  fileUuid: string;
  fileName: string;
  organizationOrigin: string;
  accessToken: string;
}

export type WorkspaceDownloadStartResult =
  | { ok: true; entry: WorkspaceDownloadEntry; reused: boolean }
  | { ok: false; errorCode: "invalid-request" | "start-failed" };

export type WorkspaceDownloadActionResult =
  | { ok: true }
  | {
      ok: false;
      errorCode: "invalid-request" | "not-found" | "not-ready" | "file-missing" | "open-failed";
    };

export type WorkspaceDownloadChangedEvent =
  | { type: "upsert"; entry: WorkspaceDownloadEntry }
  | { type: "dismiss"; ids: string[] };

export const WORKSPACE_DOWNLOAD_IPC = {
  start: "workspace-downloads:start",
  snapshot: "workspace-downloads:snapshot",
  action: "workspace-downloads:action",
  dismiss: "workspace-downloads:dismiss",
  changed: "workspace-downloads:changed",
} as const;

export type WorkspaceDownloadAction = "cancel" | "open" | "reveal";
