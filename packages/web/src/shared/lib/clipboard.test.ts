import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readText, writeImage, writeText } from "./clipboard";

type ClipboardItemPayload = Record<string, string | Blob | PromiseLike<string | Blob>>;

function deferredText() {
  let resolve!: (text: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("clipboard", () => {
  const originalElectronApi = window.electronAPI;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalElectronApi != null) {
      (window as unknown as Record<string, unknown>).electronAPI = originalElectronApi;
    } else {
      delete (window as unknown as Record<string, unknown>).electronAPI;
    }
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  describe("writeImage", () => {
    it("writes a PNG blob in browser runtime", async () => {
      let clipboardItemData: ClipboardItemPayload | undefined;
      vi.stubGlobal(
        "ClipboardItem",
        class ClipboardItemMock {
          constructor(data: ClipboardItemPayload) {
            clipboardItemData = data;
          }
        },
      );
      const writeMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { write: writeMock },
        configurable: true,
        writable: true,
      });
      const image = new Blob(["png-bytes"], { type: "image/png" });

      await expect(writeImage(Promise.resolve(image))).resolves.toBe(true);

      expect(writeMock).toHaveBeenCalledTimes(1);
      expect(await clipboardItemData?.["image/png"]).toBe(image);
    });

    it("writes image bytes through Electron API", async () => {
      const writeImageMock = vi.fn().mockResolvedValue(true);
      (window as unknown as Record<string, unknown>).electronAPI = {
        clipboard: { writeImage: writeImageMock },
      };

      await expect(
        writeImage(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })),
      ).resolves.toBe(true);

      expect(writeImageMock).toHaveBeenCalledTimes(1);
      expect(Array.from(writeImageMock.mock.calls[0]?.[0] as Uint8Array)).toEqual([1, 2, 3]);
    });

    it("converts non-PNG browser images before writing", async () => {
      let clipboardItemData: ClipboardItemPayload | undefined;
      vi.stubGlobal(
        "ClipboardItem",
        class ClipboardItemMock {
          constructor(data: ClipboardItemPayload) {
            clipboardItemData = data;
          }
        },
      );
      const writeMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { write: writeMock },
        configurable: true,
        writable: true,
      });
      const pngImage = new Blob(["converted-png"], { type: "image/png" });
      const close = vi.fn();
      vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4, height: 3, close }));
      const drawImage = vi.fn();
      const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue({ drawImage }),
        toBlob: vi.fn((callback: BlobCallback) => callback(pngImage)),
      };
      const createElement = vi
        .spyOn(document, "createElement")
        .mockReturnValue(canvas as unknown as HTMLCanvasElement);

      await expect(writeImage(new Blob(["jpeg-bytes"], { type: "image/jpeg" }))).resolves.toBe(
        true,
      );

      expect(await clipboardItemData?.["image/png"]).toBe(pngImage);
      expect(canvas.width).toBe(4);
      expect(canvas.height).toBe(3);
      expect(drawImage).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      createElement.mockRestore();
    });

    it("returns false when image clipboard APIs are unavailable", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await expect(writeImage(new Blob(["image"], { type: "image/png" }))).resolves.toBe(false);
    });
  });

  describe("writeText", () => {
    it("starts browser clipboard access before asynchronous text is ready", async () => {
      const text = deferredText();
      let clipboardItemData: ClipboardItemPayload | undefined;
      vi.stubGlobal(
        "ClipboardItem",
        class ClipboardItemMock {
          constructor(data: ClipboardItemPayload) {
            clipboardItemData = data;
          }
        },
      );
      const write = vi.fn(async () => {
        await clipboardItemData?.["text/plain"];
      });
      const writeTextMock = vi.fn();
      Object.defineProperty(navigator, "clipboard", {
        value: { write, writeText: writeTextMock },
        configurable: true,
      });

      const copied = writeText(text.promise);
      expect(write).toHaveBeenCalledOnce();
      expect(writeTextMock).not.toHaveBeenCalled();

      text.resolve("prepared text");
      await expect(copied).resolves.toBe(true);
      expect(await clipboardItemData?.["text/plain"]).toBe("prepared text");
    });

    it.each(["permission", "constructor", "browser API", "Electron API"])(
      "handles a late text rejection after an early %s failure",
      async (failure) => {
        const text = deferredText();
        vi.stubGlobal(
          "ClipboardItem",
          class ClipboardItemMock {
            constructor() {
              if (failure === "constructor") throw new Error("ClipboardItem unavailable");
            }
          },
        );
        Object.defineProperty(navigator, "clipboard", {
          value:
            failure === "browser API"
              ? undefined
              : { write: vi.fn().mockRejectedValue(new Error("Permission denied")) },
          configurable: true,
        });
        if (failure === "Electron API") {
          (window as unknown as Record<string, unknown>).electronAPI = {};
        }

        await expect(writeText(text.promise)).resolves.toBe(false);
        text.reject(new Error("Text preparation failed later"));
        // A detached rejection is reported after microtasks drain, even if writing already failed.
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      },
    );

    it.each([true, false])(
      "handles asynchronous text without ClipboardItem (preparation succeeds: %s)",
      async (succeeds) => {
        vi.stubGlobal("ClipboardItem", undefined);
        const text = deferredText();
        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
          value: { writeText: writeTextMock },
          configurable: true,
        });

        const copied = writeText(text.promise);
        expect(writeTextMock).not.toHaveBeenCalled();
        if (succeeds) text.resolve("prepared text");
        else text.reject(new Error("Text preparation failed"));

        await expect(copied).resolves.toBe(succeeds);
        if (succeeds) expect(writeTextMock).toHaveBeenCalledWith("prepared text");
        else expect(writeTextMock).not.toHaveBeenCalled();
      },
    );

    it("writes asynchronous text through Electron IPC without browser clipboard APIs", async () => {
      const text = deferredText();
      const writeTextMock = vi.fn().mockResolvedValue(true);
      (window as unknown as Record<string, unknown>).electronAPI = {
        clipboard: { writeText: writeTextMock },
      };
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });

      const copied = writeText(text.promise);
      expect(writeTextMock).not.toHaveBeenCalled();
      text.resolve("prepared text");

      await expect(copied).resolves.toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith("prepared text");
    });

    it("writes in browser runtime when Clipboard API is available", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      await expect(writeText("hello")).resolves.toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith("hello");
    });

    it("returns false in browser runtime when Clipboard API is unavailable", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await expect(writeText("hello")).resolves.toBe(false);
    });

    it("returns false in browser runtime when write fails", async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error("denied"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      await expect(writeText("hello")).resolves.toBe(false);
    });

    it("writes through Electron API in electron runtime", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(true);
      (window as unknown as Record<string, unknown>).electronAPI = {
        clipboard: { writeText: writeTextMock },
      };

      await expect(writeText("hello")).resolves.toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith("hello");
    });

    it("returns false in electron runtime when bridge is unavailable", async () => {
      (window as unknown as Record<string, unknown>).electronAPI = {};

      await expect(writeText("hello")).resolves.toBe(false);
    });

    it("returns false in electron runtime when write fails", async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error("denied"));
      (window as unknown as Record<string, unknown>).electronAPI = {
        clipboard: { writeText: writeTextMock },
      };

      await expect(writeText("hello")).resolves.toBe(false);
    });
  });

  describe("readText", () => {
    it("reads in browser runtime when Clipboard API is available", async () => {
      const readTextMock = vi.fn().mockResolvedValue("token");
      Object.defineProperty(navigator, "clipboard", {
        value: { readText: readTextMock },
        configurable: true,
        writable: true,
      });

      await expect(readText()).resolves.toBe("token");
      expect(readTextMock).toHaveBeenCalledTimes(1);
    });

    it("returns null in browser runtime when Clipboard API is unavailable", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await expect(readText()).resolves.toBeNull();
    });

    it("returns null in browser runtime when read fails", async () => {
      const readTextMock = vi.fn().mockRejectedValue(new Error("denied"));
      Object.defineProperty(navigator, "clipboard", {
        value: { readText: readTextMock },
        configurable: true,
        writable: true,
      });

      await expect(readText()).resolves.toBeNull();
    });

    it("reads through Electron API in electron runtime", async () => {
      const readTextMock = vi.fn().mockResolvedValue("token");
      (window as unknown as Record<string, unknown>).electronAPI = {
        clipboard: { readText: readTextMock },
      };

      await expect(readText()).resolves.toBe("token");
      expect(readTextMock).toHaveBeenCalledTimes(1);
    });

    it("returns null in electron runtime when bridge is unavailable", async () => {
      (window as unknown as Record<string, unknown>).electronAPI = {};

      await expect(readText()).resolves.toBeNull();
    });

    it("returns null in electron runtime when read fails", async () => {
      const readTextMock = vi.fn().mockRejectedValue(new Error("denied"));
      (window as unknown as Record<string, unknown>).electronAPI = {
        clipboard: { readText: readTextMock },
      };

      await expect(readText()).resolves.toBeNull();
    });
  });
});
