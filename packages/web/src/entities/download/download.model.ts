/** Download center state mirrored from Electron, with browser fallback actions. */
import { create } from "zustand";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import type {
  DownloadEntry,
  DownloadProgress,
  DownloadStartInput,
  DownloadState,
} from "./download.types";

const log = createLogger("download-center");
const EMPTY_ENTRIES: DownloadEntry[] = [];
const MAX_FINISHED_DOWNLOAD_ENTRIES = 30;

function isActive(entry: DownloadEntry): boolean {
  return entry.status === "starting" || entry.status === "downloading";
}

function identityKey(entry: Pick<DownloadEntry, "ownerKey" | "fileUuid">): string {
  return `${entry.ownerKey}\u0000${entry.fileUuid}`;
}

function normalizeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

function normalizeProgress(progress: DownloadProgress): DownloadProgress {
  const receivedBytes = normalizeNonNegativeInt(progress.receivedBytes);
  const parsedTotal =
    progress.totalBytes == null ? null : normalizeNonNegativeInt(progress.totalBytes);
  const totalBytes = parsedTotal != null && parsedTotal > 0 ? parsedTotal : null;
  return { receivedBytes, totalBytes };
}

function normalizeEntry(entry: DownloadEntry): DownloadEntry {
  return { ...entry, ...normalizeProgress(entry) };
}

function clampFinishedEntries(entries: readonly DownloadEntry[]): DownloadEntry[] {
  let finishedCount = 0;
  const result: DownloadEntry[] = [];
  for (const entry of entries) {
    if (!isActive(entry)) {
      finishedCount += 1;
      if (finishedCount > MAX_FINISHED_DOWNLOAD_ENTRIES) continue;
    }
    result.push(entry);
  }
  return result.length > 0 ? result : EMPTY_ENTRIES;
}

function normalizeSnapshot(entries: readonly DownloadEntry[]): DownloadEntry[] {
  const seenIds = new Set<string>();
  const activeIdentities = new Set<string>();
  const normalized: DownloadEntry[] = [];

  for (const rawEntry of entries) {
    const entry = normalizeEntry(rawEntry);
    if (seenIds.has(entry.id)) continue;
    if (isActive(entry)) {
      const key = identityKey(entry);
      if (activeIdentities.has(key)) continue;
      activeIdentities.add(key);
    }
    seenIds.add(entry.id);
    normalized.push(entry);
  }

  return clampFinishedEntries(normalized);
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  entries: EMPTY_ENTRIES,
  duplicateRequestTick: 0,

  startDownload(input: DownloadStartInput) {
    const normalized = {
      ...input,
      id: input.id.trim(),
      ownerKey: input.ownerKey.trim(),
      accountId: input.accountId.trim(),
      fileUuid: input.fileUuid.trim(),
      fileName: input.fileName.trim(),
    };
    if (
      normalized.id.length === 0 ||
      normalized.ownerKey.length === 0 ||
      normalized.accountId.length === 0 ||
      normalized.fileUuid.length === 0 ||
      normalized.fileName.length === 0
    ) {
      log.warn("Ignored download start with incomplete identity");
      return false;
    }

    let started = false;
    set((state) => {
      const key = identityKey(normalized);
      if (state.entries.some((entry) => isActive(entry) && identityKey(entry) === key)) {
        logStoreAction("download", "duplicateDownloadRequest", {
          ownerKey: normalized.ownerKey,
          fileUuid: normalized.fileUuid,
        });
        return { duplicateRequestTick: state.duplicateRequestTick + 1 };
      }

      started = true;
      const nextEntry: DownloadEntry = {
        id: normalized.id,
        ownerKey: normalized.ownerKey,
        accountId: normalized.accountId,
        fileUuid: normalized.fileUuid,
        fileName: normalized.fileName,
        status: normalized.status ?? "starting",
        receivedBytes: 0,
        totalBytes: null,
        startedAt: Date.now(),
      };
      const remaining = state.entries.filter(
        (entry) => entry.id !== normalized.id && identityKey(entry) !== key,
      );
      logStoreAction("download", "startDownload", {
        id: normalized.id,
        ownerKey: normalized.ownerKey,
        fileUuid: normalized.fileUuid,
      });
      return { entries: clampFinishedEntries([nextEntry, ...remaining]) };
    });

    return started;
  },

  setProgress(id, progress) {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) return;
    const normalized = normalizeProgress(progress);
    set((state) => {
      const index = state.entries.findIndex((entry) => entry.id === normalizedId);
      if (index < 0) return state;
      const existing = state.entries[index]!;
      if (!isActive(existing)) return state;
      if (
        existing.status === "downloading" &&
        existing.receivedBytes === normalized.receivedBytes &&
        existing.totalBytes === normalized.totalBytes
      ) {
        return state;
      }

      const entries = [...state.entries];
      entries[index] = { ...existing, ...normalized, status: "downloading", errorCode: undefined };
      return { entries };
    });
  },

  finishDownload(id, success, errorCode) {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) return;
    set((state) => {
      const index = state.entries.findIndex((entry) => entry.id === normalizedId);
      if (index < 0) return state;
      const existing = state.entries[index]!;
      const finished: DownloadEntry = success
        ? { ...existing, status: "downloaded", errorCode: undefined }
        : { ...existing, status: "error", errorCode: errorCode ?? "interrupted" };
      const entries = [...state.entries];
      entries[index] = finished;
      logStoreAction("download", "finishDownload", {
        id: normalizedId,
        status: finished.status,
      });
      return { entries: clampFinishedEntries(entries) };
    });
  },

  upsertDownload(rawEntry) {
    const entry = normalizeEntry(rawEntry);
    if (entry.id.trim().length === 0) return;
    set((state) => {
      const key = identityKey(entry);
      const existingIndex = state.entries.findIndex((current) => current.id === entry.id);
      const remaining = state.entries.filter(
        (current) =>
          current.id !== entry.id &&
          !(isActive(entry) && isActive(current) && identityKey(current) === key),
      );
      const insertionIndex = existingIndex < 0 ? 0 : Math.min(existingIndex, remaining.length);
      const entries = [...remaining];
      entries.splice(insertionIndex, 0, entry);
      return { entries: clampFinishedEntries(entries) };
    });
  },

  replaceDownloads(entries) {
    set({ entries: normalizeSnapshot(entries) });
  },

  removeDownload(id) {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) return;
    set((state) => {
      const entries = state.entries.filter((entry) => entry.id !== normalizedId);
      if (entries.length === state.entries.length) return state;
      logStoreAction("download", "removeDownload", { id: normalizedId });
      return { entries: entries.length > 0 ? entries : EMPTY_ENTRIES };
    });
  },

  clearDownloads() {
    const entries = get().entries.filter(isActive);
    if (entries.length === get().entries.length) return;
    logStoreAction("download", "clearDownloads", {});
    set({ entries: entries.length > 0 ? entries : EMPTY_ENTRIES });
  },
}));
