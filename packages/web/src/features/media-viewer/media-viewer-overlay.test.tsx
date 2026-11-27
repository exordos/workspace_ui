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

  it("zooms with controls and resets when changing or reopening media", () => {
    useMediaViewerStore.getState().open(GALLERY_ITEMS, 0);
    render(<MediaViewerOverlay />);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("125%");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("100%");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    act(() => useMediaViewerStore.getState().open(GALLERY_ITEMS, 1));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("100%");
  });

  it("handles trackpad pinch and wheel without allowing browser zoom", () => {
    useMediaViewerStore.getState().open(GALLERY_ITEMS, 0);
    const { container } = render(<MediaViewerOverlay />);
    const image = container.querySelector("img") as HTMLImageElement;
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });
    fireEvent(image, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("142%");
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("100%");
  });

  it("drags a zoomed image within the viewport and resets its position", () => {
    useMediaViewerStore.getState().open(GALLERY_ITEMS, 0);
    const { container } = render(<MediaViewerOverlay />);
    const image = container.querySelector("img") as HTMLImageElement;
    const viewport = image.parentElement as HTMLDivElement;
    const rect = {
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(rect);
    vi.spyOn(image, "getBoundingClientRect").mockImplementation(() => {
      const match = /translate\(([-.\d]+)px, ([-.\d]+)px\) scale\(([-.\d]+)\)/.exec(
        image.style.transform,
      );
      const x = Number(match?.[1] ?? 0);
      const y = Number(match?.[2] ?? 0);
      const scale = Number(match?.[3] ?? 1);
      const size = 400 * scale;
      return {
        ...rect,
        left: 200 + x - size / 2,
        right: 200 + x + size / 2,
        top: 200 + y - size / 2,
        bottom: 200 + y + size / 2,
        width: size,
        height: size,
      };
    });
    Object.defineProperty(image, "offsetWidth", { value: 400 });
    Object.defineProperty(image, "offsetHeight", { value: 400 });
    image.setPointerCapture = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const pointer = (type: string, x: number, y = 100) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: "mouse" },
        button: { value: 0 },
        clientX: { value: x },
        clientY: { value: y },
      });
      fireEvent(image, event);
    };
    pointer("pointerdown", 100);
    pointer("pointermove", 140);
    expect(image.style.transform).toContain("translate(40px, 0px)");
    pointer("pointermove", 1000, 1000);
    expect(image.style.transform).toContain("translate(250px, 250px)");
    pointer("pointermove", -1000, -1000);
    expect(image.style.transform).toContain("translate(-250px, -250px)");
    pointer("pointerup", -1000, -1000);
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(image.style.transform).toContain("translate(0px, 0px)");
  });

  it("keeps a panned image reachable after its viewport and fitted size shrink", () => {
    let onResize: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          onResize = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    useMediaViewerStore.getState().open(GALLERY_ITEMS, 0);
    const { container, unmount } = render(<MediaViewerOverlay />);
    const image = container.querySelector("img") as HTMLImageElement;
    const viewport = image.parentElement as HTMLDivElement;
    let size = 400;
    const rect = (left: number, top: number, width: number, height: number) => ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockImplementation(() => rect(0, 0, size, size));
    vi.spyOn(image, "getBoundingClientRect").mockImplementation(() => {
      const match = /translate\(([-.\d]+)px, ([-.\d]+)px\) scale\(([-.\d]+)\)/.exec(
        image.style.transform,
      );
      const x = Number(match?.[1] ?? 0);
      const y = Number(match?.[2] ?? 0);
      const scaled = size * Number(match?.[3] ?? 1);
      return rect(size / 2 + x - scaled / 2, size / 2 + y - scaled / 2, scaled, scaled);
    });
    Object.defineProperty(image, "offsetWidth", { get: () => size });
    Object.defineProperty(image, "offsetHeight", { get: () => size });
    image.setPointerCapture = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const pointer = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: "mouse" },
        button: { value: 0 },
        clientX: { value: x },
        clientY: { value: x },
      });
      fireEvent(image, event);
    };
    pointer("pointerdown", 100);
    pointer("pointermove", 1000);
    expect(image.style.transform).toContain("translate(250px, 250px)");
    size = 100;
    act(() => onResize?.([], {} as ResizeObserver));
    expect(image.style.transform).toContain("translate(62.5px, 62.5px)");
    expect(observe).toHaveBeenCalledWith(viewport);
    expect(observe).toHaveBeenCalledWith(image);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("pans with Shift and arrows while plain arrows still navigate the gallery", () => {
    useMediaViewerStore.getState().open(GALLERY_ITEMS, 0);
    const { container } = render(<MediaViewerOverlay />);
    const image = container.querySelector("img") as HTMLImageElement;
    const viewport = image.parentElement as HTMLDivElement;
    const rect = {
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(rect);
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue(rect);
    Object.defineProperty(image, "offsetWidth", { value: 400 });
    Object.defineProperty(image, "offsetHeight", { value: 400 });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.keyDown(document, { key: "ArrowRight", shiftKey: true });
    expect(image.style.transform).toContain("translate(48px, 0px)");
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("100%");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(useMediaViewerStore.getState().currentIndex).toBe(0);
  });

  it("supports keyboard zoom without interfering with gallery arrows or video", () => {
    useMediaViewerStore.getState().open([GALLERY_ITEMS[0]!, { url: "blob:video", type: "video" }]);
    render(<MediaViewerOverlay />);
    fireEvent.keyDown(document, { key: "+" });
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("125%");
    fireEvent.keyDown(document, { key: "0" });
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("100%");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
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

  it("shows loading state for an unresolved Workspace video", () => {
    useMediaViewerStore.getState().open(
      [
        {
          url: "",
          type: "video",
          resourceState: "loading",
          workspaceFile: {
            fileUuid: "22222222-2222-4222-8222-222222222222",
          },
        },
      ],
      0,
    );

    render(<MediaViewerOverlay />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Video is loading");
    expect(status).toHaveAttribute("data-media-viewer-resource-state", "loading");
    expect(status.querySelector(".media-viewer-resource-placeholder__icon")).not.toBeNull();
    expect(document.querySelector("video")).toBeNull();
  });

  it("shows a distinct load error when the protected Blob request fails", () => {
    useMediaViewerStore.getState().open(
      [
        {
          url: "",
          type: "video",
          resourceState: "load-error",
          workspaceFile: {
            fileUuid: "22222222-2222-4222-8222-222222222222",
          },
        },
      ],
      0,
    );

    render(<MediaViewerOverlay />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Failed to load video");
    expect(alert).toHaveAttribute("data-media-viewer-resource-state", "load-error");
    expect(document.querySelector("video")).toBeNull();
  });

  it("renders a resolved Workspace Blob video", () => {
    useMediaViewerStore.getState().open(
      [
        {
          url: "blob:workspace-video",
          type: "video",
          resourceState: "ready",
          workspaceFile: {
            fileUuid: "22222222-2222-4222-8222-222222222222",
            objectUrl: "blob:workspace-video",
          },
        },
      ],
      0,
    );

    const { container } = render(<MediaViewerOverlay />);

    expect(container.querySelector("video")?.getAttribute("src")).toBe("blob:workspace-video");
  });

  it("shows display error and releases its Object URL when a Blob video cannot be played", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    useMediaViewerStore.getState().open(
      [
        {
          url: "blob:unsupported-video",
          type: "video",
          resourceState: "ready",
          workspaceFile: {
            fileUuid: "22222222-2222-4222-8222-222222222222",
            objectUrl: "blob:unsupported-video",
          },
        },
      ],
      0,
    );

    const { container } = render(<MediaViewerOverlay />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();

    fireEvent.error(video as HTMLVideoElement);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("cannot be played");
    expect(alert).toHaveAttribute("data-media-viewer-resource-state", "display-error");
    expect(container.querySelector("video")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:unsupported-video");
    expect(useMediaViewerStore.getState().currentItem()).toMatchObject({
      url: "",
      resourceState: "display-error",
      workspaceFile: {
        fileUuid: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(useMediaViewerStore.getState().currentItem()?.workspaceFile?.objectUrl).toBeUndefined();
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
    expect(screen.getByRole("button", { name: /copy image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("copies the current image and hides copy when navigating to video", async () => {
    const image = new Blob(["image"], { type: "image/png" });
    const writeImage = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { clipboard: { writeImage } },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(image) });
    vi.stubGlobal("fetch", fetchMock);
    useMediaViewerStore.getState().open([
      { url: "blob:viewer-image", type: "image" },
      { url: "blob:viewer-video", type: "video" },
    ]);

    render(<MediaViewerOverlay />);
    fireEvent.click(screen.getByRole("button", { name: /copy image/i }));
    await waitFor(() => expect(writeImage).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", { name: /^copied$/i })).toHaveAttribute(
      "data-copy-state",
      "success",
    );
    expect(fetchMock).toHaveBeenCalledWith("blob:viewer-image");
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByRole("button", { name: /copy image/i })).not.toBeInTheDocument();
  });

  it("shows an error instead of success when copying fails", async () => {
    const image = new Blob(["image"], { type: "image/png" });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { clipboard: { writeImage: vi.fn().mockResolvedValue(false) } },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(image) }),
    );
    useMediaViewerStore.getState().open([{ url: "blob:viewer-image", type: "image" }]);

    render(<MediaViewerOverlay />);
    fireEvent.click(screen.getByRole("button", { name: /copy image/i }));
    expect(await screen.findByRole("button", { name: /failed to copy/i })).toHaveAttribute(
      "data-copy-state",
      "error",
    );
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
    expect(screen.getByRole("button", { name: /copy image/i })).toBeDisabled();
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

  it("keeps the Workspace original download enabled when an image cannot be displayed", () => {
    const onDownload = vi.fn();
    const original = { fileUuid: "44444444-4444-4444-8444-444444444444", name: "photo.heic" };
    useMediaViewerStore.getState().open(
      [
        {
          url: "",
          type: "image",
          resourceState: "display-error",
          workspaceFile: { ...original, onDownload },
        },
      ],
      0,
    );

    render(<MediaViewerOverlay />);
    expect(screen.getByRole("button", { name: /copy image/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(onDownload).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(original));
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

  it("does not render a video Blob URL as a thumbnail image", () => {
    useMediaViewerStore.getState().open(
      [
        { url: "blob:workspace-video", type: "video" },
        { url: "https://example.com/photo.png", type: "image" },
      ],
      0,
    );

    render(<MediaViewerOverlay />);

    const videoThumbnail = screen.getByRole("tab", { name: /media 1/i });
    expect(videoThumbnail.querySelector("img")).toBeNull();
  });

  it("renders an image URL in its thumbnail", () => {
    useMediaViewerStore.getState().open(
      [
        { url: "blob:workspace-video", type: "video" },
        { url: "https://example.com/photo.png", type: "image" },
      ],
      0,
    );

    render(<MediaViewerOverlay />);

    const imageThumbnail = screen.getByRole("tab", { name: /media 2/i });
    expect(imageThumbnail.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/photo.png",
    );
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
