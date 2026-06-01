import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canUseMediaViewerDisplayUrl,
  deriveMediaFileName,
  downloadMediaItem,
  openMediaInNewTab,
} from "./media-viewer-actions.lib";
import type { MediaItem } from "./media-viewer.types";

vi.mock("~/shared/lib/auth-guard", () => ({
  buildAuthHeader: () => ({ Authorization: "Basic test" }),
}));

describe("deriveMediaFileName", () => {
  it("prefers sanitized alt text", () => {
    const item: MediaItem = {
      url: "https://example.com/path/photo.png",
      type: "image",
      alt: "My Photo.png",
    };
    expect(deriveMediaFileName(item)).toBe("My Photo.png");
  });

  it("falls back to URL segment", () => {
    const item: MediaItem = {
      url: "https://example.com/user_uploads/2024/cat.jpg",
      type: "image",
    };
    expect(deriveMediaFileName(item)).toBe("cat.jpg");
  });

  it("uses default name when alt and URL segment are empty", () => {
    expect(deriveMediaFileName({ url: "https://example.com/", type: "image" })).toBe("image");
    expect(deriveMediaFileName({ url: "https://example.com/v.mp4", type: "video" })).toBe("v.mp4");
  });
});

describe("canUseMediaViewerDisplayUrl", () => {
  it("accepts blob and https URLs", () => {
    expect(canUseMediaViewerDisplayUrl("blob:test")).toBe(true);
    expect(canUseMediaViewerDisplayUrl("https://example.com/a.png")).toBe(true);
  });

  it("rejects placeholder, empty, and invalid URLs", () => {
    expect(canUseMediaViewerDisplayUrl(undefined)).toBe(false);
    expect(canUseMediaViewerDisplayUrl("")).toBe(false);
    expect(canUseMediaViewerDisplayUrl("data:image/svg+xml,test")).toBe(false);
    expect(canUseMediaViewerDisplayUrl("ftp://example.com/a.png")).toBe(false);
  });
});

describe("openMediaInNewTab", () => {
  beforeEach(() => {
    vi.stubGlobal("open", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens blob URLs without guard.url", () => {
    openMediaInNewTab("blob:viewer-image");
    expect(window.open).toHaveBeenCalledWith("blob:viewer-image", "_blank", "noopener,noreferrer");
  });

  it("opens https URLs after validation", () => {
    openMediaInNewTab("https://example.com/photo.png");
    expect(window.open).toHaveBeenCalledWith(
      "https://example.com/photo.png",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("does nothing for invalid display URLs", () => {
    openMediaInNewTab("not-a-url");
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe("downloadMediaItem", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloads from blob display URL", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(["pixels"], { type: "image/png" })),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const clickMock = vi.fn();
    const anchor = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click: clickMock,
      remove: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "append").mockImplementation(() => undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download-temp");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const item: MediaItem = { url: "https://example.com/old.png", type: "image", alt: "shot.png" };
    const ok = await downloadMediaItem(item, "blob:viewer-ready");

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("blob:viewer-ready");
    expect(clickMock).toHaveBeenCalled();
    expect(anchor.download).toBe("shot.png");
  });

  it("fetches protected source when display URL is not a blob", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(["protected"], { type: "image/jpeg" })),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const clickMock = vi.fn();
    const anchor = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click: clickMock,
      remove: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "append").mockImplementation(() => undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download-temp");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const item: MediaItem = {
      url: "https://zulip.example.com/external_content/preview.png",
      type: "image",
    };
    const ok = await downloadMediaItem(
      item,
      "https://zulip.example.com/external_content/preview.png",
    );

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
  });

  it("returns false when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          blob: () => Promise.resolve(new Blob([])),
        }),
      ),
    );

    const item: MediaItem = {
      url: "https://example.com/missing.png",
      type: "image",
    };
    const ok = await downloadMediaItem(item, "https://example.com/missing.png");
    expect(ok).toBe(false);
  });
});
