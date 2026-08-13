import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  DownloadItem,
  IpcMain,
  IpcMainInvokeEvent,
  Session,
  Shell,
  WebContents,
} from "electron";
import {
  WORKSPACE_DOWNLOAD_IPC,
  type WorkspaceDownloadAction,
  type WorkspaceDownloadActionResult,
  type WorkspaceDownloadChangedEvent,
  type WorkspaceDownloadEntry,
  type WorkspaceDownloadStartInput,
  type WorkspaceDownloadStartResult,
} from "./workspace-downloads.contract";

const DOWNLOAD_PATH_PREFIX = "/api/workspace/v1/messenger/files/";
const DOWNLOAD_PATH_SUFFIX = "/actions/download";
const DOWNLOAD_REQUEST_QUERY_PARAM = "workspace_download_request";
const DEV_TARGET_HEADER = "X-Workspace-Dev-Target-Origin";
const START_TIMEOUT_MS = 15_000;
const LATE_ITEM_TOMBSTONE_TTL_MS = 60_000;
const MAX_TERMINAL_ENTRIES = 30;
const MAX_TEXT_FIELD_LENGTH = 1_024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface WorkspaceDownloadRecord {
  entry: WorkspaceDownloadEntry;
  dedupKey: string;
  requestUrl: string;
  webContentsId: number;
  item?: DownloadItem;
  savePath?: string;
  startTimeout?: ReturnType<typeof setTimeout>;
}

interface WorkspaceDownloadRequest {
  input: WorkspaceDownloadStartInput;
  url: string;
  headers: Record<string, string>;
}

export interface WorkspaceDownloadCoordinatorOptions {
  ipcMain: IpcMain;
  session: Session;
  shell: Pick<Shell, "openPath" | "showItemInFolder">;
  downloadsPath: string;
  isDev: boolean;
  devServerUrl: string;
  getMainWebContents: () => WebContents | null;
  startTimeoutMs?: number;
  lateItemTombstoneTtlMs?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isSafeText(value: unknown, maxLength = MAX_TEXT_FIELD_LENGTH): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isAllowedOrganizationOrigin(raw: string, allowLocalHttp: boolean): boolean {
  // Main has no independent organization registry, so this checks URL shape, not account ownership.
  try {
    const url = new URL(raw);
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/")
    ) {
      return false;
    }
    if (url.protocol === "https:") return true;
    if (!allowLocalHttp || url.protocol !== "http:") return false;
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isSafeFileName(fileName: string): boolean {
  if (!isSafeText(fileName, 240) || fileName === "." || fileName === "..") return false;
  if (fileName.includes("/") || fileName.includes("\\")) return false;
  if (process.platform === "win32" && /[<>:"|?*]/.test(fileName)) return false;
  return process.platform !== "win32" || (!fileName.endsWith(".") && !fileName.endsWith(" "));
}

export function resolveWorkspaceDownloadRequest(
  value: unknown,
  options: { isDev: boolean; devServerUrl: string },
): WorkspaceDownloadRequest | null {
  if (!isPlainObject(value)) return null;
  const fields = value as Partial<Record<keyof WorkspaceDownloadStartInput, unknown>>;
  if (
    !isSafeText(fields.id) ||
    !isSafeText(fields.ownerKey) ||
    !isSafeText(fields.accountId) ||
    typeof fields.fileUuid !== "string" ||
    !UUID_PATTERN.test(fields.fileUuid) ||
    typeof fields.fileName !== "string" ||
    !isSafeFileName(fields.fileName) ||
    typeof fields.organizationOrigin !== "string" ||
    !isAllowedOrganizationOrigin(fields.organizationOrigin, options.isDev) ||
    !isSafeText(fields.accessToken, 32_768)
  ) {
    return null;
  }

  const input = fields as WorkspaceDownloadStartInput;
  const origin = new URL(input.organizationOrigin).origin;
  const pathname = `${DOWNLOAD_PATH_PREFIX}${encodeURIComponent(input.fileUuid)}${DOWNLOAD_PATH_SUFFIX}`;
  const url = new URL(pathname, options.isDev ? options.devServerUrl : origin);
  url.searchParams.set(DOWNLOAD_REQUEST_QUERY_PARAM, randomUUID());
  return {
    input,
    url: url.href,
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${input.accessToken}`,
      ...(options.isDev ? { [DEV_TARGET_HEADER]: origin } : {}),
    },
  };
}

export function resolveUniqueDownloadPath(
  downloadsPath: string,
  fileName: string,
  reservedPaths: ReadonlySet<string>,
  pathExists: (filePath: string) => boolean = existsSync,
): string {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = path.join(downloadsPath, fileName);
  for (let suffix = 1; pathExists(candidate) || reservedPaths.has(candidate); suffix += 1) {
    candidate = path.join(downloadsPath, `${baseName} (${String(suffix)})${extension}`);
  }
  return candidate;
}

function copyEntry(entry: WorkspaceDownloadEntry): WorkspaceDownloadEntry {
  return { ...entry };
}

function pendingKey(webContentsId: number, url: string): string {
  return `${String(webContentsId)}\u0000${url}`;
}

export function registerWorkspaceDownloadCoordinator(
  options: WorkspaceDownloadCoordinatorOptions,
): void {
  const records = new Map<string, WorkspaceDownloadRecord>();
  const activeByFile = new Map<string, string>();
  const pendingByRequest = new Map<string, string[]>();
  const lateItemTombstones = new Set<string>();
  const lateItemTombstoneTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const reservedPaths = new Set<string>();
  const startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS;
  const lateItemTombstoneTtlMs = options.lateItemTombstoneTtlMs ?? LATE_ITEM_TOMBSTONE_TTL_MS;

  options.session.setDownloadPath(options.downloadsPath);

  const isAuthorizedSender = (event: IpcMainInvokeEvent): boolean => {
    const mainWebContents = options.getMainWebContents();
    return (
      mainWebContents != null &&
      !mainWebContents.isDestroyed() &&
      event.sender.id === mainWebContents.id
    );
  };

  const sendChanged = (changed: WorkspaceDownloadChangedEvent): void => {
    const webContents = options.getMainWebContents();
    if (webContents != null && !webContents.isDestroyed()) {
      webContents.send(WORKSPACE_DOWNLOAD_IPC.changed, changed);
    }
  };

  const emitEntry = (record: WorkspaceDownloadRecord): void => {
    sendChanged({ type: "upsert", entry: copyEntry(record.entry) });
  };

  const removePending = (record: WorkspaceDownloadRecord): void => {
    const key = pendingKey(record.webContentsId, record.requestUrl);
    const queue = pendingByRequest.get(key);
    if (queue == null) return;
    const next = queue.filter((id) => id !== record.entry.id);
    if (next.length === 0) pendingByRequest.delete(key);
    else pendingByRequest.set(key, next);
  };

  const finishStart = (record: WorkspaceDownloadRecord): void => {
    if (record.startTimeout != null) {
      clearTimeout(record.startTimeout);
      record.startTimeout = undefined;
    }
    removePending(record);
  };

  const clearLateItemTombstone = (id: string): void => {
    lateItemTombstones.delete(id);
    const timeout = lateItemTombstoneTimeouts.get(id);
    if (timeout != null) clearTimeout(timeout);
    lateItemTombstoneTimeouts.delete(id);
  };

  const armLateItemTombstone = (record: WorkspaceDownloadRecord): void => {
    if (record.startTimeout != null) {
      clearTimeout(record.startTimeout);
      record.startTimeout = undefined;
    }
    clearLateItemTombstone(record.entry.id);
    lateItemTombstones.add(record.entry.id);
    lateItemTombstoneTimeouts.set(
      record.entry.id,
      setTimeout(() => {
        clearLateItemTombstone(record.entry.id);
        removePending(record);
      }, lateItemTombstoneTtlMs),
    );
  };

  const markError = (
    record: WorkspaceDownloadRecord,
    errorCode: Extract<WorkspaceDownloadEntry["errorCode"], string>,
    cancelLateItem = false,
  ): void => {
    if (cancelLateItem) armLateItemTombstone(record);
    else finishStart(record);
    activeByFile.delete(record.dedupKey);
    record.entry = { ...record.entry, status: "error", errorCode };
    emitEntry(record);
  };

  const trimTerminalRecords = (): void => {
    const terminal = [...records.values()]
      .filter(({ entry }) => entry.status === "downloaded" || entry.status === "error")
      .sort((a, b) => b.entry.startedAt - a.entry.startedAt);
    const removedIds: string[] = [];
    for (const record of terminal.slice(MAX_TERMINAL_ENTRIES)) {
      records.delete(record.entry.id);
      removedIds.push(record.entry.id);
    }
    if (removedIds.length > 0) sendChanged({ type: "dismiss", ids: removedIds });
  };

  const findPendingRecord = (
    item: DownloadItem,
    webContents: WebContents,
  ): { kind: "manage"; record: WorkspaceDownloadRecord } | { kind: "cancel" } | null => {
    const urls = new Set([item.getURL(), ...item.getURLChain()]);
    for (const url of urls) {
      const key = pendingKey(webContents.id, url);
      const queue = pendingByRequest.get(key);
      if (queue == null) continue;
      while (queue.length > 0) {
        const id = queue.shift();
        if (id == null) break;
        if (lateItemTombstones.has(id)) {
          clearLateItemTombstone(id);
          if (queue.length === 0) pendingByRequest.delete(key);
          return { kind: "cancel" };
        }
        const record = records.get(id);
        if (record?.entry.status === "starting") {
          if (queue.length === 0) pendingByRequest.delete(key);
          return { kind: "manage", record };
        }
      }
      pendingByRequest.delete(key);
    }
    return null;
  };

  options.session.on("will-download", (event, item, webContents) => {
    const match = findPendingRecord(item, webContents);
    if (match == null) return;
    if (match.kind === "cancel") {
      event.preventDefault();
      return;
    }
    const { record } = match;

    finishStart(record);
    const savePath = resolveUniqueDownloadPath(
      options.downloadsPath,
      record.entry.fileName,
      reservedPaths,
    );
    reservedPaths.add(savePath);
    record.item = item;
    record.savePath = savePath;
    item.setSavePath(savePath);

    const totalBytes = item.getTotalBytes();
    record.entry = {
      ...record.entry,
      status: "downloading",
      receivedBytes: item.getReceivedBytes(),
      totalBytes: totalBytes > 0 ? totalBytes : null,
      errorCode: undefined,
    };
    emitEntry(record);

    item.on("updated", (_updatedEvent, state) => {
      if (state === "interrupted") {
        record.entry = { ...record.entry, errorCode: "interrupted" };
      } else {
        const nextTotalBytes = item.getTotalBytes();
        record.entry = {
          ...record.entry,
          status: "downloading",
          receivedBytes: item.getReceivedBytes(),
          totalBytes: nextTotalBytes > 0 ? nextTotalBytes : null,
          errorCode: undefined,
        };
      }
      emitEntry(record);
    });

    item.once("done", (_doneEvent, state) => {
      reservedPaths.delete(savePath);
      record.item = undefined;
      activeByFile.delete(record.dedupKey);
      if (state !== "completed") {
        record.entry = {
          ...record.entry,
          status: "error",
          errorCode: state === "cancelled" ? "cancelled" : "interrupted",
        };
      } else if (!existsSync(savePath)) {
        record.entry = { ...record.entry, status: "error", errorCode: "file-missing" };
      } else {
        const nextTotalBytes = item.getTotalBytes();
        record.entry = {
          ...record.entry,
          status: "downloaded",
          receivedBytes: item.getReceivedBytes(),
          totalBytes: nextTotalBytes > 0 ? nextTotalBytes : record.entry.totalBytes,
          errorCode: undefined,
        };
      }
      emitEntry(record);
      trimTerminalRecords();
    });
  });

  options.ipcMain.handle(
    WORKSPACE_DOWNLOAD_IPC.start,
    (event, value: unknown): WorkspaceDownloadStartResult => {
      if (!isAuthorizedSender(event)) return { ok: false, errorCode: "invalid-request" };
      const request = resolveWorkspaceDownloadRequest(value, options);
      if (request == null) return { ok: false, errorCode: "invalid-request" };

      const dedupKey = `${request.input.ownerKey}\u0000${request.input.fileUuid}`;
      const existingId = activeByFile.get(dedupKey);
      const existing = existingId == null ? undefined : records.get(existingId);
      if (existing != null) {
        return { ok: true, entry: copyEntry(existing.entry), reused: true };
      }
      if (records.has(request.input.id)) return { ok: false, errorCode: "invalid-request" };

      const entry: WorkspaceDownloadEntry = {
        id: request.input.id,
        ownerKey: request.input.ownerKey,
        accountId: request.input.accountId,
        fileUuid: request.input.fileUuid,
        fileName: request.input.fileName,
        status: "starting",
        receivedBytes: 0,
        totalBytes: null,
        startedAt: Date.now(),
      };
      const record: WorkspaceDownloadRecord = {
        entry,
        dedupKey,
        requestUrl: request.url,
        webContentsId: event.sender.id,
      };
      records.set(entry.id, record);
      activeByFile.set(dedupKey, entry.id);
      const key = pendingKey(event.sender.id, request.url);
      pendingByRequest.set(key, [...(pendingByRequest.get(key) ?? []), entry.id]);
      record.startTimeout = setTimeout(() => {
        if (record.entry.status === "starting") {
          markError(record, "start-timeout", true);
          trimTerminalRecords();
        }
      }, startTimeoutMs);
      emitEntry(record);

      try {
        event.sender.downloadURL(request.url, { headers: request.headers });
      } catch {
        markError(record, "start-failed");
        trimTerminalRecords();
        return { ok: false, errorCode: "start-failed" };
      }
      return { ok: true, entry: copyEntry(record.entry), reused: false };
    },
  );

  options.ipcMain.handle(WORKSPACE_DOWNLOAD_IPC.snapshot, (event): WorkspaceDownloadEntry[] => {
    if (!isAuthorizedSender(event)) return [];
    return [...records.values()]
      .map(({ entry }) => copyEntry(entry))
      .sort((a, b) => b.startedAt - a.startedAt);
  });

  options.ipcMain.handle(
    WORKSPACE_DOWNLOAD_IPC.action,
    async (event, action: unknown, id: unknown): Promise<WorkspaceDownloadActionResult> => {
      if (
        !isAuthorizedSender(event) ||
        !isSafeText(id) ||
        (action !== "cancel" && action !== "open" && action !== "reveal")
      ) {
        return { ok: false, errorCode: "invalid-request" };
      }
      const record = records.get(id);
      if (record == null) return { ok: false, errorCode: "not-found" };

      if ((action as WorkspaceDownloadAction) === "cancel") {
        if (record.entry.status === "starting") {
          markError(record, "cancelled", true);
          trimTerminalRecords();
          return { ok: true };
        }
        if (record.entry.status !== "downloading" || record.item == null) {
          return { ok: false, errorCode: "not-ready" };
        }
        record.item.cancel();
        return { ok: true };
      }

      if (record.entry.status !== "downloaded" || record.savePath == null) {
        return { ok: false, errorCode: "not-ready" };
      }
      if (!existsSync(record.savePath)) {
        markError(record, "file-missing");
        return { ok: false, errorCode: "file-missing" };
      }
      if ((action as WorkspaceDownloadAction) === "reveal") {
        try {
          options.shell.showItemInFolder(record.savePath);
          return { ok: true };
        } catch {
          return { ok: false, errorCode: "open-failed" };
        }
      }
      try {
        const errorMessage = await options.shell.openPath(record.savePath);
        return errorMessage === "" ? { ok: true } : { ok: false, errorCode: "open-failed" };
      } catch {
        return { ok: false, errorCode: "open-failed" };
      }
    },
  );

  options.ipcMain.handle(WORKSPACE_DOWNLOAD_IPC.dismiss, (event, value: unknown) => {
    if (!isAuthorizedSender(event) || !Array.isArray(value)) return { ok: true as const };
    const removedIds: string[] = [];
    for (const id of value) {
      if (!isSafeText(id)) continue;
      const record = records.get(id);
      if (
        record == null ||
        record.entry.status === "starting" ||
        record.entry.status === "downloading"
      ) {
        continue;
      }
      records.delete(id);
      removedIds.push(id);
    }
    if (removedIds.length > 0) sendChanged({ type: "dismiss", ids: removedIds });
    return { ok: true as const };
  });
}
