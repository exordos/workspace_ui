import { afterEach, describe, expect, it, vi } from "vitest";
import { drawUnreadDotOnFavicon } from "./favicon-unread.lib";

describe("drawUnreadDotOnFavicon", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a PNG data URL with an unread dot drawn on the image", async () => {
    const toDataURL = vi.fn(() => "data:image/png;base64,unread");
    const arc = vi.fn();
    const fill = vi.fn();
    const beginPath = vi.fn();
    const drawImage = vi.fn();

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") {
        return document.createElement.bind(document)(tagName);
      }
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage, fillStyle: "", beginPath, arc, fill }),
        toDataURL,
      } as unknown as HTMLCanvasElement;
    });

    class MockImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }

    vi.stubGlobal("Image", MockImage);

    await expect(drawUnreadDotOnFavicon("https://cdn.example.com/icon.png")).resolves.toBe(
      "data:image/png;base64,unread",
    );
    expect(drawImage).toHaveBeenCalled();
    expect(arc).toHaveBeenCalledWith(28, 4, 4, 0, Math.PI * 2);
  });
});
