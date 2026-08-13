import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDownloadStore } from "~/entities/download/download.model";
import { useWorkspaceDownloadSync } from "./workspace-file-download-sync.hook";

function createEntry(id: string, status: ElectronDownloadStatus): ElectronDownloadEntry {
  return {
    id,
    ownerKey: "owner-a",
    accountId: "account-a",
    fileUuid: `file-${id}`,
    fileName: `${id}.txt`,
    status,
    receivedBytes: status === "downloaded" ? 10 : 0,
    totalBytes: 10,
    startedAt: 1,
  };
}

describe("useWorkspaceDownloadSync", () => {
  beforeEach(() => {
    delete (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
    useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
  });

  it("replays events received while the initial snapshot is pending", async () => {
    let resolveSnapshot: ((entries: ElectronDownloadEntry[]) => void) | undefined;
    const snapshot = new Promise<ElectronDownloadEntry[]>((resolve) => {
      resolveSnapshot = resolve;
    });
    let onChanged: ((event: ElectronDownloadChangedEvent) => void) | undefined;
    const unsubscribe = vi.fn();
    (window as unknown as { electronAPI: Partial<ElectronAPI> }).electronAPI = {
      downloads: {
        getSnapshot: vi.fn(() => snapshot),
        onChanged: vi.fn((callback) => {
          onChanged = callback;
          return unsubscribe;
        }),
        start: vi.fn(),
        cancel: vi.fn(),
        open: vi.fn(),
        reveal: vi.fn(),
        dismiss: vi.fn(),
      },
    };

    const { unmount } = renderHook(() => useWorkspaceDownloadSync());
    useDownloadStore.getState().startDownload({
      id: "local",
      ownerKey: "owner-local",
      accountId: "account-local",
      fileUuid: "file-local",
      fileName: "local.txt",
      status: "starting",
    });
    act(() => onChanged?.({ type: "upsert", entry: createEntry("new", "downloading") }));
    await act(() => {
      resolveSnapshot?.([createEntry("old", "downloaded")]);
      return snapshot;
    });

    expect(useDownloadStore.getState().entries.map((entry) => entry.id)).toEqual([
      "new",
      "old",
      "local",
    ]);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps local state and starts applying events if snapshot loading fails", async () => {
    let onChanged: ((event: ElectronDownloadChangedEvent) => void) | undefined;
    (window as unknown as { electronAPI: Partial<ElectronAPI> }).electronAPI = {
      downloads: {
        getSnapshot: vi.fn().mockRejectedValue(new Error("snapshot failed")),
        onChanged: vi.fn((callback) => {
          onChanged = callback;
          return vi.fn();
        }),
        start: vi.fn(),
        cancel: vi.fn(),
        open: vi.fn(),
        reveal: vi.fn(),
        dismiss: vi.fn(),
      },
    };

    renderHook(() => useWorkspaceDownloadSync());
    await act(() => Promise.resolve());
    act(() => onChanged?.({ type: "upsert", entry: createEntry("next", "downloading") }));

    expect(useDownloadStore.getState().entries[0]?.id).toBe("next");
  });
});
