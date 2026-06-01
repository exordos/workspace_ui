import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAvatarBlob } from "~/shared/lib/avatar-blob-fetch.lib";

vi.mock("~/shared/lib/auth-guard", () => ({
  buildAuthHeader: () => ({ Authorization: "Basic test" }),
}));

describe("fetchAvatarBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for empty and preview URLs", async () => {
    expect(await fetchAvatarBlob("")).toBeNull();
    expect(await fetchAvatarBlob("blob:http://localhost/x")).toBeNull();
    expect(await fetchAvatarBlob("data:image/png;base64,AA")).toBeNull();
  });

  it("fetches with credentials and auth header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["x"], { type: "image/png" })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const blob = await fetchAvatarBlob("https://z.example.com/avatar/1.png");
    expect(blob?.type).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://z.example.com/avatar/1.png",
      expect.objectContaining({
        credentials: "include",
        headers: { Authorization: "Basic test" },
      }),
    );
  });

  it("returns null when response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchAvatarBlob("https://z.example.com/avatar/1.png")).toBeNull();
  });
});
