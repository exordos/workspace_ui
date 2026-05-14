import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readText, writeText } from "./clipboard";

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

  describe("writeText", () => {
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
