import { render, waitFor } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInlineVideoPosters } from "./message-inline-video-poster.hook";

function TestInlineVideoPosters({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useInlineVideoPosters(containerRef, html);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element != null) {
      element.innerHTML = html;
    }
  }, [html]);

  return <div ref={containerRef} />;
}

describe("useInlineVideoPosters", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          drawImage: vi.fn(),
        }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,poster",
    );
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("adds a generated poster for inline videos without one", async () => {
    const html =
      '<video controls preload="metadata"><source src="https://cdn.example.com/clip.mp4" type="video/mp4"></video>';

    const { container } = render(<TestInlineVideoPosters html={html} />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("preload")).toBe("auto");

    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1280 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 720 });

    video?.dispatchEvent(new Event("loadeddata"));

    await waitFor(() => {
      expect(video?.getAttribute("poster")).toBe("data:image/jpeg;base64,poster");
    });
    expect(video?.getAttribute("preload")).toBe("metadata");
    expect(video?.getAttribute("data-inline-poster-state")).toBe("ready");
  });

  it("marks poster generation as failed when capture returns null", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const html =
      '<video controls preload="metadata"><source src="https://cdn.example.com/clip.mp4" type="video/mp4"></video>';

    const { container } = render(<TestInlineVideoPosters html={html} />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("preload")).toBe("auto");

    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1280 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 720 });

    video?.dispatchEvent(new Event("loadeddata"));

    await waitFor(() => {
      expect(video?.getAttribute("data-inline-poster-state")).toBe("failed");
    });
    expect(video?.getAttribute("poster")).toBeNull();
    expect(video?.getAttribute("preload")).toBe("metadata");
  });

  it("keeps an existing poster intact", async () => {
    const html =
      '<video controls preload="metadata" poster="https://cdn.example.com/poster.jpg"><source src="https://cdn.example.com/clip.mp4" type="video/mp4"></video>';

    const { container } = render(<TestInlineVideoPosters html={html} />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();

    await waitFor(() => {
      expect(video?.getAttribute("poster")).toBe("https://cdn.example.com/poster.jpg");
    });
    expect(video?.getAttribute("preload")).toBe("metadata");
    expect(video?.getAttribute("data-inline-poster-state")).toBeNull();
  });
});
