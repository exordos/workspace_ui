import { afterEach, expect, it, vi } from "vitest";
import { prepareChatBackground } from "./chat-background.lib";
afterEach(() => vi.unstubAllGlobals());
it("rejects SVG content mislabeled as PNG before creating a blob URL", async () => {
  await expect(
    prepareChatBackground(
      new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "image.png", { type: "image/png" }),
    ),
  ).rejects.toMatchObject({ code: "type" });
});
it("rejects non-raster, empty and oversized local files before decoding", async () => {
  for (const f of [
    new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }),
    new File([], "x.jpg", { type: "image/jpeg" }),
    new File([new Uint8Array(8 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }),
  ])
    await expect(prepareChatBackground(f)).rejects.toBeInstanceOf(Error);
});
it("releases a local object URL when image decoding fails", async () => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static readonly createObjectURL = vi.fn(() => "blob:local");
      static readonly revokeObjectURL = vi.fn();
    },
  );
  vi.stubGlobal(
    "Image",
    class {
      onerror: (() => void) | null = null;
      set src(_s: string) {
        queueMicrotask(() => this.onerror?.());
      }
    },
  );
  await expect(
    prepareChatBackground(
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "x.jpg", { type: "image/jpeg" }),
    ),
  ).rejects.toMatchObject({ code: "decode" });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local");
});
