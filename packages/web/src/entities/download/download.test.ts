import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDownloadStore } from "./download.model";

function resetStore() {
  useDownloadStore.setState({
    entries: [],
    duplicateRequestTick: 0,
  });
}

describe("downloadStore", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("starts a new download entry", () => {
    const started = useDownloadStore
      .getState()
      .startDownload("/user_uploads/1/report.pdf", "report.pdf");

    expect(started).toBe(true);
    const state = useDownloadStore.getState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      path: "/user_uploads/1/report.pdf",
      fileName: "report.pdf",
      status: "downloading",
      receivedBytes: 0,
      totalBytes: null,
    });
  });

  it("rejects duplicate start while the same path is downloading", () => {
    useDownloadStore.getState().startDownload("/user_uploads/1/report.pdf", "report.pdf");
    const startedDuplicate = useDownloadStore
      .getState()
      .startDownload("/user_uploads/1/report.pdf", "report.pdf");

    const state = useDownloadStore.getState();
    expect(startedDuplicate).toBe(false);
    expect(state.entries).toHaveLength(1);
    expect(state.duplicateRequestTick).toBe(1);
  });

  it("updates byte progress for active download", () => {
    useDownloadStore.getState().startDownload("/user_uploads/1/report.pdf", "report.pdf");
    useDownloadStore.getState().setProgress("/user_uploads/1/report.pdf", {
      receivedBytes: 512,
      totalBytes: 1024,
    });

    expect(useDownloadStore.getState().entries[0]).toMatchObject({
      receivedBytes: 512,
      totalBytes: 1024,
      status: "downloading",
    });
  });

  it("marks download as finished", () => {
    useDownloadStore.getState().startDownload("/user_uploads/1/report.pdf", "report.pdf");
    useDownloadStore.getState().setProgress("/user_uploads/1/report.pdf", {
      receivedBytes: 1024,
      totalBytes: 1024,
    });
    useDownloadStore.getState().finishDownload("/user_uploads/1/report.pdf", true);

    expect(useDownloadStore.getState().entries[0]).toMatchObject({
      status: "downloaded",
      receivedBytes: 1024,
      totalBytes: 1024,
    });
  });

  it("clears all entries", () => {
    useDownloadStore.getState().startDownload("/user_uploads/1/report.pdf", "report.pdf");
    useDownloadStore.getState().startDownload("/user_uploads/2/design.png", "design.png");

    useDownloadStore.getState().clearDownloads();

    expect(useDownloadStore.getState().entries).toEqual([]);
  });
});
