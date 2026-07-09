import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAvatarBlobSrc } from "~/shared/lib/avatar-blob-src.hook";

const fetchAvatarBlob = vi.hoisted(() => vi.fn());
const shouldNetworkFetchAvatarBlob = vi.hoisted(() => vi.fn(() => true));
const persistAvatarBlobsToIndexedDb = vi.hoisted(() => vi.fn(() => true));
const getAvatarBlobCacheRow = vi.hoisted(() => vi.fn());

vi.mock("~/entities/workspace-auth/workspace-auth.model", () => ({
  useWorkspaceAuthStore: (
    selector: (s: { currentAccountId: string; sessions: unknown[] }) => unknown,
  ) => selector({ currentAccountId: "account-1", sessions: [] }),
}));

vi.mock("~/entities/workspace-auth/workspace-session-storage-scope.lib", () => ({
  getWorkspaceSessionStorageScopeFromAuthState: () => ({
    ownerKey: "owner-key-1",
    legacyInstanceId: "inst-1",
  }),
}));

vi.mock("~/shared/lib/avatar-blob-cache-persist.lib", () => ({
  persistAvatarBlobsToIndexedDb,
}));

vi.mock("~/shared/lib/avatar-blob-cache-db", () => ({
  getAvatarBlobCacheRow,
  putAvatarBlobCacheRow: vi.fn(),
  touchAvatarBlobCacheRow: vi.fn(),
}));

vi.mock("~/shared/lib/avatar-blob-fetch.lib", () => ({
  fetchAvatarBlob,
  shouldNetworkFetchAvatarBlob,
}));

describe("useAvatarBlobSrc", () => {
  afterEach(() => {
    vi.clearAllMocks();
    shouldNetworkFetchAvatarBlob.mockReturnValue(true);
    persistAvatarBlobsToIndexedDb.mockReturnValue(true);
    getAvatarBlobCacheRow.mockResolvedValue(null);
  });

  it("does not call fetchAvatarBlob when shouldNetworkFetchAvatarBlob is false", async () => {
    shouldNetworkFetchAvatarBlob.mockReturnValue(false);
    getAvatarBlobCacheRow.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useAvatarBlobSrc("https://z.example.com/avatar/42.png?_av=1"),
    );

    await waitFor(() => {
      expect(getAvatarBlobCacheRow).toHaveBeenCalled();
    });

    expect(getAvatarBlobCacheRow).toHaveBeenCalledWith("owner-key-1", "/avatar/42.png");
    expect(fetchAvatarBlob).not.toHaveBeenCalled();
    expect(result.current).toBe("https://z.example.com/avatar/42.png?_av=1");
  });

  it("calls fetchAvatarBlob when network fetch is allowed and cache misses", async () => {
    shouldNetworkFetchAvatarBlob.mockReturnValue(true);
    getAvatarBlobCacheRow.mockResolvedValue(null);
    const blob = new Blob(["x"], { type: "image/png" });
    fetchAvatarBlob.mockResolvedValue(blob);

    renderHook(() => useAvatarBlobSrc("https://z.example.com/avatar/42.png?_av=1"));

    await waitFor(() => {
      expect(fetchAvatarBlob).toHaveBeenCalledWith("https://z.example.com/avatar/42.png?_av=1");
    });
  });
});
