// Regression: overlay must call the same hook set
// in both closed and open states to satisfy Rules of Hooks.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaViewerOverlay } from "./media-viewer-overlay.ui";
import { useMediaViewerStore } from "./media-viewer.model";

const GALLERY_ITEMS = [
  { url: "https://example.com/a.png", type: "image" as const },
  { url: "https://example.com/b.png", type: "image" as const },
  { url: "https://example.com/c.png", type: "image" as const },
];

describe("MediaViewerOverlay", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    useMediaViewerStore.getState().close();
    delete (window as unknown as Record<string, unknown>).electronAPI;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not change hook count when opening from closed (no Rules of Hooks violation)", () => {
    const { rerender } = render(<MediaViewerOverlay />);

    useMediaViewerStore.getState().open([{ url: "https://example.com/a.png", type: "image" }], 0);
    rerender(<MediaViewerOverlay />);

    expect(useMediaViewerStore.getState().isOpen).toBe(true);
  });

  it("shows previewUrl when the full media URL is not displayable", () => {
    useMediaViewerStore.getState().open(
      [
        {
          url: "",
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
  });

  it("renders raster data display URLs in the main image", () => {
    useMediaViewerStore.getState().open([{ url: "data:image/png;base64,AAAA", type: "image" }], 0);

    const { container } = render(<MediaViewerOverlay />);
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
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

  it("hides the open-in-new-tab control in Electron", () => {
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {},
    });
    useMediaViewerStore
      .getState()
      .open([{ url: "https://example.com/photo.png", type: "image" }], 0);

    render(<MediaViewerOverlay />);

    expect(screen.queryByRole("button", { name: /open in new tab/i })).toBeNull();
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

  it("disables open and download when media URL is not displayable", () => {
    useMediaViewerStore.getState().open([{ url: "", type: "image" }], 0);
    render(<MediaViewerOverlay />);

    const openButton = screen.getByRole("button", { name: /open in new tab/i });
    const downloadButton = screen.getByRole("button", { name: /download/i });

    expect(openButton).toBeDisabled();
    expect(downloadButton).toBeDisabled();
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

  it("uses the Workspace download callback for Workspace viewer items", async () => {
    const onDownload = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    useMediaViewerStore.getState().open(
      [
        {
          url: "blob:workspace-viewer-image",
          type: "image",
          alt: "screen.png",
          workspaceFile: {
            fileUuid: "44444444-4444-4444-8444-444444444444",
            name: "screen.png",
            contentType: "image/png",
            objectUrl: "blob:workspace-viewer-image",
            onDownload,
          },
        },
      ],
      0,
    );

    render(<MediaViewerOverlay />);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(onDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          fileUuid: "44444444-4444-4444-8444-444444444444",
          name: "screen.png",
        }),
      );
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("navigates to next and previous items with ArrowRight and ArrowLeft", () => {
    useMediaViewerStore.getState().open(GALLERY_ITEMS, 0);

    render(<MediaViewerOverlay />);
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      );
    });
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
      );
    });
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
  });

  it("does not navigate past gallery boundaries with keyboard arrows", () => {
    useMediaViewerStore.getState().open(GALLERY_ITEMS, 0);

    render(<MediaViewerOverlay />);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
      );
    });
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);

    useMediaViewerStore.getState().goTo(2);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      );
    });
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
  });

  it("navigates when gallery prev and next buttons are clicked", () => {
    useMediaViewerStore.getState().open(GALLERY_ITEMS, 1);

    render(<MediaViewerOverlay />);

    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);
  });

  it("jumps to selected item when a thumbnail is clicked", () => {
    useMediaViewerStore.getState().open(GALLERY_ITEMS, 0);

    render(<MediaViewerOverlay />);

    fireEvent.click(screen.getByRole("tab", { name: /media 3/i }));
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
  });

  it("keeps navigation on the exact index when an item is still loading", () => {
    useMediaViewerStore.getState().open(
      [
        { url: "https://example.com/loaded.png", type: "image" },
        { url: "", previewUrl: "data:image/svg+xml,%3Csvg/%3E", type: "image" },
        { url: "https://example.com/next.png", type: "image" },
      ],
      0,
    );

    render(<MediaViewerOverlay />);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);

    fireEvent.click(screen.getByRole("tab", { name: /media 3/i }));
    expect(useMediaViewerStore.getState().currentIndex).toBe(2);
  });

  it("hides navigation controls and thumbnails for a single item", () => {
    useMediaViewerStore
      .getState()
      .open([{ url: "https://example.com/photo.png", type: "image" }], 0);

    render(<MediaViewerOverlay />);

    expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("does not intercept arrow keys when gallery navigation is unavailable", () => {
    useMediaViewerStore
      .getState()
      .open([{ url: "https://example.com/photo.png", type: "image" }], 0);

    render(<MediaViewerOverlay />);

    const leftEvent = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    });
    const rightEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      document.dispatchEvent(leftEvent);
      document.dispatchEvent(rightEvent);
    });

    expect(leftEvent.defaultPrevented).toBe(false);
    expect(rightEvent.defaultPrevented).toBe(false);
  });
});
