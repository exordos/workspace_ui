import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "~/shared/api/client";
import { MESSAGE_MEDIA_PREVIEW_CLASS_NAME } from "~/shared/lib/message-body-rich-text-classes";
import {
  AUTH_IMAGE_PLACEHOLDER_SRC,
  AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR,
  buildProtectedUploadFetchUrl,
  createDisplayableBlobUrl,
  fetchProtectedUploadBlob,
  isAuthMediaPlaceholderAttr,
  prepareProtectedMessageHtml,
  resolveProtectedUploadFetchOptions,
} from "~/shared/lib/protected-message-media";

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

function expectNoLiveProtectedAttrs(html: string): void {
  const template = document.createElement("template");
  template.innerHTML = html;
  const protectedAttrs = ["src", "srcset", "poster", "style"];

  for (const element of template.content.querySelectorAll<HTMLElement>("*")) {
    for (const attr of protectedAttrs) {
      const value = element.getAttribute(attr);
      expect(value?.includes("/user_uploads/") ?? false).toBe(false);
      expect(value?.includes("/external_content/") ?? false).toBe(false);
    }
  }
}

describe("isAuthMediaPlaceholderAttr", () => {
  it("treats missing src as placeholder", () => {
    expect(isAuthMediaPlaceholderAttr(null)).toBe(true);
    expect(isAuthMediaPlaceholderAttr("")).toBe(true);
  });

  it("recognizes the placeholder data URL", () => {
    expect(isAuthMediaPlaceholderAttr(AUTH_IMAGE_PLACEHOLDER_SRC)).toBe(true);
  });

  it("returns false for blob or http URLs", () => {
    expect(isAuthMediaPlaceholderAttr("blob:http://localhost/x")).toBe(false);
    expect(isAuthMediaPlaceholderAttr("https://zulip.test/user_uploads/1/a.png")).toBe(false);
  });
});

describe("prepareProtectedMessageHtml", () => {
  it("sets width and height on protected user-upload images fetched via thumbnail URL", () => {
    const html = '<p><img src="/user_uploads/1/abc/t.png" alt="x" /></p>';
    const out = prepareProtectedMessageHtml(html);
    expect(out).toContain('width="240"');
    expect(out).toContain('height="160"');
    expect(out).toContain(MESSAGE_MEDIA_PREVIEW_CLASS_NAME);
    expect(out).toContain("data-auth-src=");
    expect(out).toContain("/user_uploads/thumbnail/");
    expect(out).toContain("840x560.webp");
    expectNoLiveProtectedAttrs(out);
  });

  it("marks external_content preview images with fixed preview box attrs and class", () => {
    const html = '<p><img src="/external_content/preview.png?url=1" alt="preview" /></p>';
    const out = prepareProtectedMessageHtml(html);
    expect(out).toContain("data-auth-src=");
    expect(out).toContain("/external_content/preview.png?url=1");
    expect(out).toContain('width="240"');
    expect(out).toContain('height="160"');
    expect(out).toContain(MESSAGE_MEDIA_PREVIEW_CLASS_NAME);
    expectNoLiveProtectedAttrs(out);
  });

  it("rewrites protected img srcset to a single data-auth-src candidate and strips sizes", () => {
    const html =
      '<img srcset="/external_content/a.png 1x, /external_content/b.png 2x" sizes="100vw" alt="preview">';
    const out = prepareProtectedMessageHtml(html);
    expect(out).toContain('data-auth-src="/external_content/b.png"');
    expect(out).not.toContain("srcset=");
    expect(out).not.toContain("sizes=");
    expectNoLiveProtectedAttrs(out);
  });

  it("collapses picture sources into the img placeholder flow", () => {
    const html =
      '<picture><source srcset="/external_content/a.webp 1x, /external_content/b.webp 2x" sizes="100vw"><img alt="preview"></picture>';
    const out = prepareProtectedMessageHtml(html);
    expect(out).toContain('data-auth-src="/external_content/b.webp"');
    expect(out).toContain(`src="${AUTH_IMAGE_PLACEHOLDER_SRC}"`);
    expect(out).not.toContain("srcset=");
    expect(out).not.toContain("sizes=");
    expectNoLiveProtectedAttrs(out);
  });

  it("protects video poster and source attrs", () => {
    const html =
      '<video poster="/external_content/poster.png"><source src="/user_uploads/1/private.mp4" type="video/mp4"></video>';
    const out = prepareProtectedMessageHtml(html);
    const template = document.createElement("template");
    template.innerHTML = out;
    const video = template.content.querySelector("video");
    const source = template.content.querySelector("source");
    expect(video?.getAttribute("data-auth-poster")).toBe(
      "https://zulip.example.com/external_content/poster.png",
    );
    expect(video?.getAttribute("poster")).toBeNull();
    expect(source?.getAttribute("data-auth-src")).toBe(
      "https://zulip.example.com/user_uploads/1/private.mp4",
    );
    expect(source?.getAttribute("src")).toBeNull();
    expectNoLiveProtectedAttrs(out);
  });

  it("removes style attrs only when they reference protected media", () => {
    const html =
      '<p style="color:red"><img src="/external_content/preview.png" style="background-image:url(/external_content/bg.png)" alt="preview"></p>';
    const out = prepareProtectedMessageHtml(html);
    expect(out).toContain('<p style="color:red">');
    expect(out).not.toContain("background-image:url(/external_content/bg.png)");
    expectNoLiveProtectedAttrs(out);
  });

  it("keeps non-protected inline styles intact", () => {
    const html = '<p style="color:red"><span style="font-weight:700">Preview</span></p>';
    const out = prepareProtectedMessageHtml(html);
    expect(out).toContain('<p style="color:red">');
    expect(out).toContain('<span style="font-weight:700">Preview</span>');
  });

  it("extracts protected Zulip embed background images into a dedicated auth data attr", () => {
    const html =
      '<div class="message_embed"><a class="message_embed_image" href="https://habr.com/ru/articles/1024154/" style="background-image: url(&quot;/external_content/hash/preview.jpeg&quot;)"></a></div>';
    const out = prepareProtectedMessageHtml(html);
    const template = document.createElement("template");
    template.innerHTML = out;
    const embedImage = template.content.querySelector<HTMLElement>(".message_embed_image");
    expect(embedImage?.getAttribute(AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR)).toBe(
      "/external_content/hash/preview.jpeg",
    );
    expect(embedImage?.getAttribute("style")).toBeNull();
    expectNoLiveProtectedAttrs(out);
  });
});

describe("buildProtectedUploadFetchUrl", () => {
  it("builds a canonical user_uploads fetch URL", () => {
    const url = buildProtectedUploadFetchUrl("https://sys.platform.test/user_uploads/1/a.png");
    expect(url).toBe("https://zulip.example.com/user_uploads/1/a.png");
  });

  it("uses the realm origin for external_content fetch URLs", () => {
    const url = buildProtectedUploadFetchUrl(
      "https://sys.platform.test/external_content/preview.png",
    );
    expect(url).toBe("https://zulip.example.com/external_content/preview.png");
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
    vi.restoreAllMocks();
  });

  it("sends Authorization on cross-origin candidate (credentials omit, headers kept)", () => {
    vi.spyOn(apiClient, "getCurrentInstance").mockReturnValue({
      id: "api-key",
      realm: "https://zulip.example.com",
      email: "user@example.com",
      apiKey: "key",
      authType: "api_key",
    });
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

  it("uses include credentials for cross-origin session auth without Basic header", () => {
    vi.spyOn(apiClient, "getCurrentInstance").mockReturnValue({
      id: "session",
      realm: "https://zulip.example.com",
      email: "user@example.com",
      apiKey: "",
      authType: "session",
    });
    vi.stubGlobal("window", {
      location: { origin: "file://" },
    });
    const init = resolveProtectedUploadFetchOptions(
      "https://zulip.example.com/user_uploads/thumbnail/1/a.png/840x560.webp",
      {},
    );
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({});
  });

  it("uses include credentials for cross-origin when Authorization header is empty", () => {
    vi.spyOn(apiClient, "getCurrentInstance").mockReturnValue(null);
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.com" },
    });
    const init = resolveProtectedUploadFetchOptions(
      "https://zulip.example.com/user_uploads/1/a.png",
      {},
    );
    expect(init.credentials).toBe("include");
  });

  it("uses include credentials for same-origin candidate", () => {
    vi.spyOn(apiClient, "getCurrentInstance").mockReturnValue({
      id: "api-key",
      realm: "https://zulip.example.com",
      email: "user@example.com",
      apiKey: "key",
    });
    vi.stubGlobal("window", {
      location: { origin: "https://zulip.example.com" },
    });
    const headers = { Authorization: "Basic abc" };
    const init = resolveProtectedUploadFetchOptions("/user_uploads/1/a.png", headers);
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual(headers);
  });

  it("uses include credentials for same-origin session auth", () => {
    vi.spyOn(apiClient, "getCurrentInstance").mockReturnValue({
      id: "session",
      realm: "https://zulip.example.com",
      email: "user@example.com",
      apiKey: "",
      authType: "session",
    });
    vi.stubGlobal("window", {
      location: { origin: "https://zulip.example.com" },
    });
    const init = resolveProtectedUploadFetchOptions("/user_uploads/1/a.png", {});
    expect(init.credentials).toBe("include");
  });

  it("drops Authorization headers for non-protected cross-origin candidates", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.com" },
    });
    const init = resolveProtectedUploadFetchOptions("https://attacker.example/collect", {
      Authorization: "Basic abc",
    });
    expect(init.credentials).toBe("omit");
    expect(init.headers).toEqual({});
  });

  it("does not fetch non-protected raw media values", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchProtectedUploadBlob("https://attacker.example/collect", {
        Authorization: "Basic abc",
      }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
