import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_IMAGE_PLACEHOLDER_SRC,
  buildProtectedUploadFetchCandidates,
  createDisplayableBlobUrl,
  isAuthMediaPlaceholderAttr,
  protectUserUploadMediaSources,
  resolveProtectedUploadFetchOptions,
} from "./message-bubble-protected-media.lib";

vi.mock("~/shared/api/zulip-client.internal", () => ({
  getRealmBaseUrl: () => "https://zulip.example.com",
}));

vi.mock("~/shared/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      USER_UPLOADS_PATH_PREFIX: "",
    },
  };
});

describe("isAuthMediaPlaceholderAttr", () => {
  it("treats missing src as placeholder", () => {
    expect(isAuthMediaPlaceholderAttr(null)).toBe(true);
    expect(isAuthMediaPlaceholderAttr("")).toBe(true);
  });

  it("recognizes the 1×1 transparent gif placeholder", () => {
    expect(isAuthMediaPlaceholderAttr(AUTH_IMAGE_PLACEHOLDER_SRC)).toBe(true);
  });

  it("returns false for blob or http URLs", () => {
    expect(isAuthMediaPlaceholderAttr("blob:http://localhost/x")).toBe(false);
    expect(isAuthMediaPlaceholderAttr("https://zulip.test/user_uploads/1/a.png")).toBe(false);
  });
});

describe("protectUserUploadMediaSources", () => {
  it("sets width and height on protected user-upload images fetched via thumbnail URL", () => {
    const html = '<p><img src="/user_uploads/1/abc/t.png" alt="x" /></p>';
    const out = protectUserUploadMediaSources(html);
    expect(out).toContain('width="240"');
    expect(out).toContain('height="160"');
    expect(out).toContain("data-auth-src=");
    expect(out).toContain("/user_uploads/thumbnail/");
    expect(out).toContain("840x560.webp");
  });

  it("sets width and height when src is already a user-upload thumbnail URL", () => {
    const html =
      '<p><img src="/user_uploads/thumbnail/1/abc/t.png/840x560.webp" alt="x" /></p>';
    const out = protectUserUploadMediaSources(html);
    expect(out).toContain('width="240"');
    expect(out).toContain('height="160"');
  });
});

describe("buildProtectedUploadFetchCandidates", () => {
  it("lists canonical realm URL before raw gateway URL", () => {
    const candidates = buildProtectedUploadFetchCandidates(
      "https://sys.platform.test/user_uploads/1/a.png",
    );
    expect(candidates[0]).toBe("https://zulip.example.com/user_uploads/1/a.png");
  });
});

describe("createDisplayableBlobUrl", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.unstubAllGlobals();
  });

  it("uses createObjectURL on http(s) pages and registers revoke", async () => {
    vi.stubGlobal("window", {
      location: { protocol: "https:" },
    });
    const revokeList: string[] = [];
    URL.createObjectURL = vi.fn(() => "blob:https://app.test/uuid");
    const blob = new Blob(["x"], { type: "image/png" });
    const url = await createDisplayableBlobUrl(blob, revokeList);
    expect(url).toBe("blob:https://app.test/uuid");
    expect(revokeList).toEqual(["blob:https://app.test/uuid"]);
  });

  it("uses data URL on file:// so Electron img src is not blob:file:///…", async () => {
    vi.stubGlobal("window", {
      location: { protocol: "file:" },
    });
    const revokeList: string[] = [];
    const blob = new Blob(["hi"], { type: "image/png" });
    const url = await createDisplayableBlobUrl(blob, revokeList);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(revokeList).toHaveLength(0);
  });

  it("falls back to object URL on file:// when blob exceeds cap", async () => {
    vi.stubGlobal("window", {
      location: { protocol: "file:" },
    });
    const revokeList: string[] = [];
    URL.createObjectURL = vi.fn(() => "blob:file:///fallback");
    const huge = new Blob([new Uint8Array(16 * 1024 * 1024 + 1)]);
    const url = await createDisplayableBlobUrl(huge, revokeList);
    expect(url).toBe("blob:file:///fallback");
    expect(revokeList).toEqual(["blob:file:///fallback"]);
  });
});

describe("resolveProtectedUploadFetchOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends Authorization on cross-origin candidate (credentials omit, headers kept)", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.com" },
    });
    const headers = { Authorization: "Basic abc" };
    const init = resolveProtectedUploadFetchOptions(
      "https://zulip.example.com/user_uploads/1/a.png",
      headers,
    );
    expect(init.credentials).toBe("omit");
    expect(init.headers).toEqual(headers);
  });

  it("uses include credentials for same-origin candidate", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://zulip.example.com" },
    });
    const headers = { Authorization: "Basic abc" };
    const init = resolveProtectedUploadFetchOptions("/user_uploads/1/a.png", headers);
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual(headers);
  });
});
