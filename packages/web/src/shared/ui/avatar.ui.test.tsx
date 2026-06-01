import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Avatar } from "~/shared/ui/avatar";

const persistAvatarBlobsToIndexedDb = vi.hoisted(() => vi.fn(() => true));
const getAvatarBlobCacheRow = vi.hoisted(() => vi.fn());
const putAvatarBlobCacheRow = vi.hoisted(() => vi.fn());
const fetchAvatarBlob = vi.hoisted(() => vi.fn());
const shouldNetworkFetchAvatarBlob = vi.hoisted(() => vi.fn(() => true));

vi.mock("~/shared/lib/avatar-blob-cache-persist.lib", () => ({
  persistAvatarBlobsToIndexedDb,
}));

vi.mock("~/shared/lib/avatar-blob-cache-db", () => ({
  getAvatarBlobCacheRow,
  putAvatarBlobCacheRow,
  touchAvatarBlobCacheRow: vi.fn(),
  clearAvatarBlobCacheForInstance: vi.fn(),
}));

vi.mock("~/shared/lib/avatar-blob-fetch.lib", () => ({
  fetchAvatarBlob,
  shouldNetworkFetchAvatarBlob,
}));

vi.mock("~/entities/instance/instance.model", () => ({
  useInstancesStore: (selector: (s: { currentInstanceId: string | null }) => unknown) =>
    selector({ currentInstanceId: "inst-1" }),
}));

vi.mock("~/shared/lib/avatar", () => ({
  getAvatarVersion: () => 1,
  bumpAvatarVersion: vi.fn(),
}));

describe("Avatar IndexedDB cache", () => {
  afterEach(() => {
    vi.clearAllMocks();
    persistAvatarBlobsToIndexedDb.mockReturnValue(true);
    shouldNetworkFetchAvatarBlob.mockReturnValue(true);
  });

  it("uses cached blob without fetch on hit", async () => {
    const blob = new Blob(["cached"], { type: "image/png" });
    getAvatarBlobCacheRow.mockResolvedValue({
      id: "inst-1:/avatar/1.png",
      instanceId: "inst-1",
      cacheKey: "/avatar/1.png",
      blob,
      mimeType: "image/png",
      byteSize: blob.size,
      fetchedAt: 1,
      lastAccessedAt: 1,
      avatarVersion: 1,
    });

    const { container } = render(<Avatar src="https://z.example.com/avatar/1.png?_av=1">A</Avatar>);

    await waitFor(() => {
      const imgSrc = container.querySelector("img")?.getAttribute("src");
      expect(imgSrc).toMatch(/^blob:/);
    });
    expect(fetchAvatarBlob).not.toHaveBeenCalled();
  });

  it("fetches and stores blob on cache miss", async () => {
    getAvatarBlobCacheRow.mockResolvedValue(null);
    const blob = new Blob(["fresh"], { type: "image/png" });
    fetchAvatarBlob.mockResolvedValue(blob);

    render(<Avatar src="https://z.example.com/avatar/2.png?_av=1">B</Avatar>);

    await waitFor(() => {
      expect(fetchAvatarBlob).toHaveBeenCalledWith("https://z.example.com/avatar/2.png?_av=1");
      expect(putAvatarBlobCacheRow).toHaveBeenCalled();
    });
  });

  it("skips cache when persist flag is off", async () => {
    persistAvatarBlobsToIndexedDb.mockReturnValue(false);
    getAvatarBlobCacheRow.mockResolvedValue(null);

    const { container } = render(<Avatar src="https://z.example.com/avatar/3.png">C</Avatar>);

    await waitFor(() => {
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "https://z.example.com/avatar/3.png",
      );
    });
    expect(getAvatarBlobCacheRow).not.toHaveBeenCalled();
    expect(fetchAvatarBlob).not.toHaveBeenCalled();
  });
});
