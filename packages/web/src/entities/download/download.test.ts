import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDownloadStore } from "./download.model";
import type { DownloadEntry, DownloadEntryStatus } from "./download.types";

function entry(
  id: string,
  status: DownloadEntryStatus = "downloaded",
  overrides: Partial<DownloadEntry> = {},
): DownloadEntry {
  return {
    id,
    ownerKey: "owner-a",
    accountId: "account-a",
    fileUuid: `file-${id}`,
    fileName: `${id}.pdf`,
    status,
    receivedBytes: 0,
    totalBytes: null,
    startedAt: 1,
    ...overrides,
  };
}

function resetStore(): void {
  useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
}

describe("downloadStore", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("starts and updates a browser fallback entry", () => {
    const started = useDownloadStore.getState().startDownload({
      id: "download-a",
      ownerKey: "owner-a",
      accountId: "account-a",
      fileUuid: "file-a",
      fileName: "report.pdf",
    });

    expect(started).toBe(true);
    expect(useDownloadStore.getState().entries[0]).toMatchObject({
      id: "download-a",
      status: "starting",
      receivedBytes: 0,
      totalBytes: null,
    });

    useDownloadStore.getState().setProgress("download-a", {
      receivedBytes: 512,
      totalBytes: 1024,
    });
    useDownloadStore.getState().finishDownload("download-a", true);

    expect(useDownloadStore.getState().entries[0]).toMatchObject({
      status: "downloaded",
      receivedBytes: 512,
      totalBytes: 1024,
    });
  });

  it("deduplicates active entries by owner and file UUID", () => {
    useDownloadStore.getState().startDownload({
      id: "download-a",
      ownerKey: "owner-a",
      accountId: "account-a",
      fileUuid: "file-a",
      fileName: "report.pdf",
    });
    const duplicate = useDownloadStore.getState().startDownload({
      id: "download-b",
      ownerKey: "owner-a",
      accountId: "account-a",
      fileUuid: "file-a",
      fileName: "report.pdf",
    });
    const otherOwner = useDownloadStore.getState().startDownload({
      id: "download-c",
      ownerKey: "owner-b",
      accountId: "account-b",
      fileUuid: "file-a",
      fileName: "report.pdf",
    });

    expect(duplicate).toBe(false);
    expect(otherOwner).toBe(true);
    expect(useDownloadStore.getState()).toMatchObject({ duplicateRequestTick: 1 });
    expect(useDownloadStore.getState().entries).toHaveLength(2);
  });

  it("replaces and incrementally updates Electron state", () => {
    useDownloadStore.getState().replaceDownloads([entry("a", "downloading"), entry("b")]);
    useDownloadStore
      .getState()
      .upsertDownload(entry("a", "downloading", { receivedBytes: 25, totalBytes: 100 }));
    useDownloadStore.getState().upsertDownload(entry("c", "starting"));

    expect(useDownloadStore.getState().entries.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(useDownloadStore.getState().entries[1]).toMatchObject({ receivedBytes: 25 });
  });

  it("clears finished and failed entries without removing active entries", () => {
    useDownloadStore
      .getState()
      .replaceDownloads([
        entry("starting", "starting"),
        entry("active", "downloading"),
        entry("ready"),
        entry("failed", "error"),
      ]);

    useDownloadStore.getState().clearDownloads();

    expect(useDownloadStore.getState().entries.map((item) => item.id)).toEqual([
      "starting",
      "active",
    ]);
  });

  it("limits only finished entries and never evicts active entries", () => {
    const snapshot = [
      entry("active-old", "downloading"),
      ...Array.from({ length: 35 }, (_, index) => entry(`finished-${index}`)),
      entry("active-new", "starting"),
    ];

    useDownloadStore.getState().replaceDownloads(snapshot);

    const entries = useDownloadStore.getState().entries;
    expect(entries.filter((item) => item.status === "downloaded")).toHaveLength(30);
    expect(entries.map((item) => item.id)).toContain("active-old");
    expect(entries.map((item) => item.id)).toContain("active-new");
  });
});
