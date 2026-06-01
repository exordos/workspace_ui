import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  DEV: false,
  MODE: "production",
}));

vi.mock("~/shared/lib/env", () => ({
  env: mockEnv,
}));

vi.mock("~/shared/lib/auth-guard", () => ({
  buildAuthHeader: () => ({ Authorization: "Basic test" }),
}));

vi.mock("~/shared/api/client", () => ({
  appendDevRealmMediaProxyHeaders: (
    _url: string,
    headers: Record<string, string>,
  ): Record<string, string> => headers,
}));

vi.mock("~/shared/lib/protected-message-media", () => ({
  resolveProtectedUploadFetchOptions: (
    _candidate: string,
    headers: Record<string, string>,
  ): RequestInit => ({
    headers,
    credentials: "include",
  }),
}));

import {
  buildAvatarFetchUrl,
  fetchAvatarBlob,
  shouldNetworkFetchAvatarBlob,
} from "~/shared/lib/avatar-blob-fetch.lib";

describe("buildAvatarFetchUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns relative path in development", () => {
    mockEnv.DEV = true;
    mockEnv.MODE = "development";
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });

    expect(buildAvatarFetchUrl("https://z.example.com/avatar/1.png?_av=2")).toBe("/avatar/1.png");
  });

  it("returns absolute URL for cross-origin in production", () => {
    mockEnv.DEV = false;
    mockEnv.MODE = "production";
    vi.stubGlobal("window", { location: { origin: "https://app.example.com" } });

    expect(buildAvatarFetchUrl("https://z.example.com/avatar/1.png?_av=2")).toBe(
      "https://z.example.com/avatar/1.png?_av=2",
    );
  });

  it("returns relative path when avatar URL is same-origin in production", () => {
    mockEnv.DEV = false;
    mockEnv.MODE = "production";
    vi.stubGlobal("window", { location: { origin: "https://z.example.com" } });

    expect(buildAvatarFetchUrl("https://z.example.com/avatar/1.png?_av=2")).toBe("/avatar/1.png");
  });
});

describe("shouldNetworkFetchAvatarBlob", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false for cross-origin absolute URL in production", () => {
    mockEnv.DEV = false;
    mockEnv.MODE = "production";

    expect(shouldNetworkFetchAvatarBlob("https://z.example.com/avatar/1.png")).toBe(false);
  });

  it("returns true for same-origin relative path in development", () => {
    mockEnv.DEV = true;
    mockEnv.MODE = "development";

    expect(shouldNetworkFetchAvatarBlob("https://z.example.com/avatar/1.png")).toBe(true);
  });
});

describe("fetchAvatarBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockEnv.DEV = false;
    mockEnv.MODE = "production";
  });

  it("returns null for empty and preview URLs", async () => {
    expect(await fetchAvatarBlob("")).toBeNull();
    expect(await fetchAvatarBlob("blob:http://localhost/x")).toBeNull();
    expect(await fetchAvatarBlob("data:image/png;base64,AA")).toBeNull();
  });

  it("returns null without calling fetch for cross-origin production URL", async () => {
    mockEnv.DEV = false;
    mockEnv.MODE = "production";
    vi.stubGlobal("window", { location: { origin: "https://app.example.com" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchAvatarBlob("https://z.example.com/avatar/1.png")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches same-origin relative URL in development", async () => {
    mockEnv.DEV = true;
    mockEnv.MODE = "development";
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["x"], { type: "image/png" })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const blob = await fetchAvatarBlob("https://z.example.com/avatar/1.png?_av=1");
    expect(blob?.type).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith(
      "/avatar/1.png",
      expect.objectContaining({
        credentials: "include",
        headers: { Authorization: "Basic test" },
      }),
    );
  });

  it("returns null when response is not ok", async () => {
    mockEnv.DEV = true;
    mockEnv.MODE = "development";
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    expect(await fetchAvatarBlob("https://z.example.com/avatar/1.png")).toBeNull();
  });
});
