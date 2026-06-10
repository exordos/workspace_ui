// Regression: overlay must call the same hook set
// in both closed and open states to satisfy Rules of Hooks.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaViewerOverlay } from "./media-viewer-overlay.ui";
import { useMediaViewerStore } from "./media-viewer.model";

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

vi.mock("~/shared/lib/auth-guard", () => ({
  buildAuthHeader: () => ({ Authorization: "Basic test" }),
}));

describe("MediaViewerOverlay", () => {
  afterEach(() => {
    useMediaViewerStore.getState().close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not change hook count when opening from closed (no Rules of Hooks violation)", () => {
    const { rerender } = render(<MediaViewerOverlay />);

    useMediaViewerStore.getState().open([{ url: "https://example.com/a.png", type: "image" }], 0);
    rerender(<MediaViewerOverlay />);

    expect(useMediaViewerStore.getState().isOpen).toBe(true);
  });

  it("loads protected image items through authenticated fetch without mounting the raw protected src", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const value = String(input);
      if (value === "https://zulip.example.com/external_content/preview.png") {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["ok"])),
        });
      }
      return Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-viewer-image");

    useMediaViewerStore
      .getState()
      .open([{ url: "https://zulip.example.com/external_content/preview.png", type: "image" }], 0);

    const { container } = render(<MediaViewerOverlay />);
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).not.toContain("/external_content/");

    await waitFor(() => {
      expect(image?.getAttribute("src")).toBe("blob:test-viewer-image");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://zulip.example.com/external_content/preview.png",
      expect.objectContaining({
        headers: { Authorization: "Basic test" },
      }),
    );
  });

  it("shows previewUrl immediately and then swaps to the full protected image", async () => {
    let resolveFetch: ((value: { ok: boolean; blob: () => Promise<Blob> }) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: boolean; blob: () => Promise<Blob> }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-viewer-full");

    useMediaViewerStore.getState().open(
      [
        {
          url: "https://zulip.example.com/user_uploads/1/private.png",
          type: "image",
          previewUrl: "blob:test-viewer-preview",
        },
      ],
      0,
    );

    const { container } = render(<MediaViewerOverlay />);
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe("blob:test-viewer-preview");

    resolveFetch?.({
      ok: true,
      blob: () => Promise.resolve(new Blob(["ok"])),
    });

    await waitFor(() => {
      expect(image?.getAttribute("src")).toBe("blob:test-viewer-full");
    });
  });

  it("keeps protected video src unset when authenticated fetch fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    useMediaViewerStore
      .getState()
      .open([{ url: "https://zulip.example.com/user_uploads/1/private.mp4", type: "video" }], 0);

    const { container } = render(<MediaViewerOverlay />);
    const video = container.querySelector("video");

    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBeNull();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(video?.getAttribute("src")).toBeNull();
  });

  it("renders toolbar with open, download, and close controls", () => {
    useMediaViewerStore
      .getState()
      .open([{ url: "https://example.com/photo.png", type: "image" }], 0);

    render(<MediaViewerOverlay />);

    expect(screen.getByRole("toolbar", { name: /media viewer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open in new tab/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("closes viewer when toolbar close is clicked", () => {
    useMediaViewerStore
      .getState()
      .open([{ url: "https://example.com/photo.png", type: "image" }], 0);

    render(<MediaViewerOverlay />);
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
  });

  it("closes viewer on Escape before chat navigation shortcuts", () => {
    useMediaViewerStore
      .getState()
      .open([{ url: "https://example.com/photo.png", type: "image" }], 0);

    render(<MediaViewerOverlay />);

    expect(document.querySelector("[data-shortcut-context='modal']")).not.toBeNull();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
  });

  it("disables open and download until protected image display URL is ready", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const value = String(input);
      if (value === "https://zulip.example.com/external_content/preview.png") {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["ok"])),
        });
      }
      return Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-viewer-image");

    useMediaViewerStore
      .getState()
      .open([{ url: "https://zulip.example.com/external_content/preview.png", type: "image" }], 0);

    render(<MediaViewerOverlay />);

    const openButton = screen.getByRole("button", { name: /open in new tab/i });
    const downloadButton = screen.getByRole("button", { name: /download/i });

    expect(openButton).toBeDisabled();
    expect(downloadButton).toBeDisabled();

    await waitFor(() => {
      expect(openButton).not.toBeDisabled();
      expect(downloadButton).not.toBeDisabled();
    });
  });

  it("opens resolved display URL in a new tab when toolbar open is clicked", async () => {
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);

    useMediaViewerStore
      .getState()
      .open([{ url: "https://example.com/photo.png", type: "image" }], 0);

    render(<MediaViewerOverlay />);

    const openButton = screen.getByRole("button", { name: /open in new tab/i });
    await waitFor(() => {
      expect(openButton).not.toBeDisabled();
    });

    fireEvent.click(openButton);

    expect(openMock).toHaveBeenCalledWith(
      "https://example.com/photo.png",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
