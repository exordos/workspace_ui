/**
 * Download center store — tracks attachment downloads across the app.
 *
 * Keeps the latest download entries with status and byte progress so any UI
 * surface (for example, top bar download center) can show a consistent queue.
 */
import { create } from "zustand";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import type { DownloadEntry, DownloadProgress, DownloadState } from "./download.types";

const log = createLogger("download-center");
const EMPTY_ENTRIES: DownloadEntry[] = [];
const MAX_DOWNLOAD_ENTRIES = 30;

function normalizeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

function normalizeProgress(progress: DownloadProgress): DownloadProgress {
  const receivedBytes = normalizeNonNegativeInt(progress.receivedBytes);
  const parsedTotal =
    progress.totalBytes == null ? null : normalizeNonNegativeInt(progress.totalBytes);
  const totalBytes = parsedTotal != null && parsedTotal > 0 ? parsedTotal : null;
  return {
    receivedBytes,
    totalBytes,
  };
}

function clampEntries(entries: DownloadEntry[]): DownloadEntry[] {
  if (entries.length <= MAX_DOWNLOAD_ENTRIES) return entries;
  return entries.slice(0, MAX_DOWNLOAD_ENTRIES);
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  entries: EMPTY_ENTRIES,
  duplicateRequestTick: 0,

  startDownload(path, fileName) {
    const normalizedPath = path.trim();
    const normalizedFileName = fileName.trim();
    if (normalizedPath.length === 0 || normalizedFileName.length === 0) {
      log.warn("Ignored download start with empty path or file name");
      return false;
    }

    let started = false;
    set((state) => {
      const now = Date.now();
      const existing = state.entries.find((entry) => entry.path === normalizedPath);
      if (existing?.status === "downloading") {
        logStoreAction("download", "duplicateDownloadRequest", { path: normalizedPath });
        return { duplicateRequestTick: state.duplicateRequestTick + 1 };
      }

      started = true;
      const nextEntry: DownloadEntry = {
        path: normalizedPath,
        fileName: normalizedFileName,
        status: "downloading",
        receivedBytes: 0,
        totalBytes: null,
        startedAt: now,
        updatedAt: now,
      };
      const remaining = state.entries.filter((entry) => entry.path !== normalizedPath);
      const entries = clampEntries([nextEntry, ...remaining]);
      logStoreAction("download", "startDownload", {
        path: normalizedPath,
        fileName: normalizedFileName,
      });
      return { entries };
    });

    return started;
  },

  setProgress(path, progress) {
    const normalizedPath = path.trim();
    if (normalizedPath.length === 0) return;
    const normalized = normalizeProgress(progress);
    set((state) => {
      const idx = state.entries.findIndex((entry) => entry.path === normalizedPath);
      if (idx < 0) return state;
      const existing = state.entries[idx]!;
      if (existing.status !== "downloading") return state;
      if (
        existing.receivedBytes === normalized.receivedBytes &&
        existing.totalBytes === normalized.totalBytes
      ) {
        return state;
      }

      const updated: DownloadEntry = {
        ...existing,
        receivedBytes: normalized.receivedBytes,
        totalBytes: normalized.totalBytes,
        updatedAt: Date.now(),
      };
      const entries = [...state.entries];
      entries[idx] = updated;
      return { entries };
    });
  },

  finishDownload(path, success) {
    const normalizedPath = path.trim();
    if (normalizedPath.length === 0) return;
    set((state) => {
      const idx = state.entries.findIndex((entry) => entry.path === normalizedPath);
      if (idx < 0) return state;
      const existing = state.entries[idx]!;
      const finished: DownloadEntry = {
        ...existing,
        status: success ? "downloaded" : "error",
        updatedAt: Date.now(),
      };
      const entries = [...state.entries];
      entries[idx] = finished;
      logStoreAction("download", "finishDownload", {
        path: normalizedPath,
        status: finished.status,
      });
      return { entries };
    });
  },

  removeDownload(path) {
    const normalizedPath = path.trim();
    if (normalizedPath.length === 0) return;
    set((state) => {
      const entries = state.entries.filter((entry) => entry.path !== normalizedPath);
      if (entries.length === state.entries.length) return state;
      logStoreAction("download", "removeDownload", { path: normalizedPath });
      return { entries: entries.length > 0 ? entries : EMPTY_ENTRIES };
    });
  },

  clearDownloads() {
    if (get().entries.length === 0) return;
    logStoreAction("download", "clearDownloads", {});
    set({ entries: EMPTY_ENTRIES });
  },
}));
