import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocale, setLocale } from "~/i18n/i18n";
import { getDeviceName } from "./device-name.lib";

const originalDesktop = window.electronAPI;
const originalLocale = getLocale();

beforeEach(() => {
  delete window.electronAPI;
  setLocale("en");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalDesktop) window.electronAPI = originalDesktop;
  else delete window.electronAPI;
  setLocale(originalLocale);
});

function browser(userAgent: string, extra: Record<string, unknown> = {}) {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints: 0, ...extra });
}

function desktop(platform: string, app: Partial<ElectronAPI["app"]> = {}) {
  (window as unknown as { electronAPI: unknown }).electronAPI = { platform, app };
}

describe("getDeviceName", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18 Safari/605.1", "Mac · Safari — Web"],
    ["Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36 Edg/130", "Windows · Edge — Web"],
    ["Mozilla/5.0 (X11; Linux x86_64) Firefox/130", "Linux · Firefox — Web"],
    ["Mozilla/5.0 (X11; CrOS x86_64) Chrome/130 Safari/537.36", "Chrome OS · Chrome — Web"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS) CriOS/130 Safari/604.1", "iPhone · Chrome — Web"],
    ["Mozilla/5.0 (iPad; CPU OS) Version/18 Safari/605.1", "iPad · Safari — Web"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS) FxiOS/130 Safari/605.1", "iPhone · Firefox — Web"],
    ["Mozilla/5.0 (Linux; Android 13) Chrome/130 Safari/537.36", "Android · Chrome — Web"],
    ["Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36 OPR/130", "Windows · Opera — Web"],
    [
      "Mozilla/5.0 (Linux; Android 13) Chrome/130 SamsungBrowser/25",
      "Android · Samsung Internet — Web",
    ],
    ["unrecognized browser", "Device — Web"],
  ])("uses coarse device information for %s", async (ua, expected) => {
    browser(ua);
    expect(await getDeviceName()).toBe(expected);
  });

  it("recognizes an iPad using the desktop Safari user agent", async () => {
    browser("Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18 Safari/605.1", {
      maxTouchPoints: 5,
    });
    expect(await getDeviceName()).toBe("iPad · Safari — Web");
  });

  it("prefers a supplied model and ignores synthetic brands", async () => {
    const getHighEntropyValues = vi.fn().mockResolvedValue({ model: "Pixel 8" });
    browser("", {
      userAgentData: {
        platform: "Android",
        brands: [
          { brand: "Not.A/Brand", version: "99" },
          { brand: "Chromium", version: "130" },
          { brand: "Google Chrome", version: "130" },
        ],
        getHighEntropyValues,
      },
    });
    expect(await getDeviceName()).toBe("Pixel 8 · Chrome — Web");
    expect(getHighEntropyValues).toHaveBeenCalledExactlyOnceWith(["model"]);
  });

  it.each(["", " \n\t "])("uses the OS when the model is empty (%j)", async (model) => {
    browser("Chrome/130", {
      userAgentData: {
        platform: "macOS",
        getHighEntropyValues: vi.fn().mockResolvedValue({ model }),
      },
    });
    expect(await getDeviceName()).toBe("Mac · Chrome — Web");
  });

  it("ignores unrecognized platforms and brands", async () => {
    browser("", {
      userAgentData: {
        platform: "__proto__",
        brands: [{ brand: "Not.A/Brand", version: "99" }],
      },
    });
    expect(await getDeviceName()).toBe("Device — Web");
  });

  it.each(["reject", "throw"])("handles Client Hints that %s", async (failure) => {
    browser("Mozilla/5.0 (Windows NT 10.0) Chrome/130 Edg/130", {
      userAgentData: {
        platform: "Windows",
        getHighEntropyValues: () => {
          if (failure === "throw") throw new Error("Unavailable");
          return Promise.reject(new Error("Denied"));
        },
      },
    });
    expect(await getDeviceName()).toBe("Windows · Edge — Web");
  });

  it("does not wait indefinitely for optional model information", async () => {
    vi.useFakeTimers();
    browser("Mozilla/5.0 (Linux; Android 13) Chrome/130", {
      userAgentData: {
        getHighEntropyValues: () => new Promise(() => {}),
      },
    });
    const result = getDeviceName();
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toBe("Android · Chrome — Web");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the native name in Desktop without browser hints", async () => {
    const getHighEntropyValues = vi.fn();
    browser("Chrome/130", { userAgentData: { getHighEntropyValues } });
    desktop("darwin", { getDeviceName: vi.fn().mockResolvedValue("Ноутбук Адама") });
    expect(await getDeviceName()).toBe("Ноутбук Адама — Desktop");
    expect(getHighEntropyValues).not.toHaveBeenCalled();
  });

  it.each([
    ["darwin", "Mac — Desktop"],
    ["win32", "Windows — Desktop"],
    ["linux", "Linux — Desktop"],
    ["unknown", "Device — Desktop"],
  ])("supports older shells without a naming bridge on %s", async (platform, expected) => {
    desktop(platform);
    expect(await getDeviceName()).toBe(expected);
  });

  it("falls back when native discovery fails", async () => {
    desktop("linux", { getDeviceName: vi.fn().mockRejectedValue(new Error("IPC unavailable")) });
    expect(await getDeviceName()).toBe("Linux — Desktop");
  });

  it("bounds the wait for a stalled native bridge", async () => {
    vi.useFakeTimers();
    desktop("win32", { getDeviceName: () => new Promise(() => {}) });
    const result = getDeviceName();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toBe("Windows — Desktop");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("normalizes and bounds environment-provided names", async () => {
    desktop("darwin", { getDeviceName: vi.fn().mockResolvedValue("  Рабочий\n\u202e Mac\t ") });
    expect(await getDeviceName()).toBe("Рабочий Mac — Desktop");
    desktop("darwin", { getDeviceName: vi.fn().mockResolvedValue("a".repeat(1000)) });
    expect(await getDeviceName()).toBe(`${"a".repeat(120)} — Desktop`);
  });

  it("localizes the unknown-device label", async () => {
    setLocale("ru");
    browser("");
    expect(await getDeviceName()).toBe("Устройство — Web");
  });

  it("provides a name without browser globals", async () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", undefined);
    expect(await getDeviceName()).toBe("Device — Web");
  });
});
