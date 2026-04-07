/**
 * Tests for the OS integration abstraction layer.
 *
 * Verifies badge count, progress bar, attention request, and startup settings
 * across both web (PWA Badging API) and Electron (native IPC) runtimes.
 * This module bridges the gap between web APIs and native desktop features,
 * falling back to no-ops when APIs are unavailable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as OsIntegrationModule from "./os-integration";

vi.mock("./electron", () => ({
  isElectron: vi.fn(() => false),
  getElectronAPI: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// Web (browser/PWA) integration — uses navigator.setAppBadge/clearAppBadge
// ---------------------------------------------------------------------------

describe("osIntegration (web runtime)", () => {
  let osIntegration: OsIntegrationModule.OsIntegration;

  beforeEach(async () => {
    vi.resetModules();

    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (electronMod.getElectronAPI as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const mod = await import("./os-integration");
    osIntegration = mod.osIntegration;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Positive count sets the badge icon on PWA taskbar/dock icon
  it("setBadgeCount calls navigator.setAppBadge for count > 0", () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "setAppBadge", {
      value: setAppBadge,
      writable: true,
      configurable: true,
    });

    osIntegration.setBadgeCount(5);
    expect(setAppBadge).toHaveBeenCalledWith(5);

    // @ts-expect-error — cleanup
    delete (navigator as Record<string, unknown>).setAppBadge;
  });

  // Zero count should clear the badge, not set it to "0"
  it("setBadgeCount calls navigator.clearAppBadge for count = 0", () => {
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "setAppBadge", {
      value: setAppBadge,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "clearAppBadge", {
      value: clearAppBadge,
      writable: true,
      configurable: true,
    });

    osIntegration.setBadgeCount(0);
    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();

    // @ts-expect-error — cleanup
    delete (navigator as Record<string, unknown>).setAppBadge;
    // @ts-expect-error — cleanup
    delete (navigator as Record<string, unknown>).clearAppBadge;
  });

  // Graceful degradation: Badging API is Chrome 81+ only
  it("setBadgeCount is no-op when navigator.setAppBadge is missing", () => {
    expect(() => osIntegration.setBadgeCount(3)).not.toThrow();
  });

  // Progress bar is an Electron-only feature, web runtime safely ignores it
  it("setProgressBar is a no-op", () => {
    expect(() => osIntegration.setProgressBar(0.5)).not.toThrow();
  });

  // No-op in web — Electron handles this via BrowserWindow.setProgressBar
  it("clearProgressBar is a no-op", () => {
    expect(() => osIntegration.clearProgressBar()).not.toThrow();
  });

  // Taskbar bounce/flash is an Electron-only feature
  it("requestAttention is a no-op", () => {
    expect(() => osIntegration.requestAttention()).not.toThrow();
  });

  // Auto-start on login is only possible in Electron
  it("setStartupEnabled is a no-op", () => {
    expect(() => osIntegration.setStartupEnabled(true)).not.toThrow();
  });

  // Web apps can't auto-start, so this always returns false
  it("getStartupEnabled returns false", async () => {
    const result = await osIntegration.getStartupEnabled();
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Electron integration — delegates all calls through IPC to the main process
// ---------------------------------------------------------------------------

describe("osIntegration (electron runtime)", () => {
  const mockOsAPI = {
    setBadgeCount: vi.fn(),
    setProgressBar: vi.fn(),
    requestAttention: vi.fn(),
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn().mockResolvedValue({ openAtLogin: true }),
  };

  let osIntegration: OsIntegrationModule.OsIntegration;

  beforeEach(async () => {
    vi.resetModules();
    mockOsAPI.setBadgeCount.mockClear();
    mockOsAPI.setProgressBar.mockClear();
    mockOsAPI.requestAttention.mockClear();
    mockOsAPI.setLoginItemSettings.mockClear();
    mockOsAPI.getLoginItemSettings.mockClear().mockResolvedValue({ openAtLogin: true });

    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (electronMod.getElectronAPI as ReturnType<typeof vi.fn>).mockReturnValue({
      os: mockOsAPI,
    });

    const mod = await import("./os-integration");
    osIntegration = mod.osIntegration;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Badge count on the dock/taskbar icon (macOS dock, Windows taskbar)
  it("setBadgeCount delegates to electronAPI.os.setBadgeCount", () => {
    osIntegration.setBadgeCount(3);
    expect(mockOsAPI.setBadgeCount).toHaveBeenCalledWith(3);
  });

  // Progress bar on the taskbar icon (e.g. file upload progress)
  it("setProgressBar delegates to electronAPI.os.setProgressBar", () => {
    osIntegration.setProgressBar(0.75);
    expect(mockOsAPI.setProgressBar).toHaveBeenCalledWith(0.75);
  });

  // Electron convention: -1 removes the progress bar overlay
  it("clearProgressBar calls setProgressBar(-1)", () => {
    osIntegration.clearProgressBar();
    expect(mockOsAPI.setProgressBar).toHaveBeenCalledWith(-1);
  });

  // Flashes/bounces the app icon to draw user attention for new messages
  it("requestAttention delegates to electronAPI.os.requestAttention", () => {
    osIntegration.requestAttention();
    expect(mockOsAPI.requestAttention).toHaveBeenCalled();
  });

  // Controls whether the app launches on OS login (user preference)
  it("setStartupEnabled delegates to electronAPI.os.setLoginItemSettings", () => {
    osIntegration.setStartupEnabled(true);
    expect(mockOsAPI.setLoginItemSettings).toHaveBeenCalledWith(true);

    osIntegration.setStartupEnabled(false);
    expect(mockOsAPI.setLoginItemSettings).toHaveBeenCalledWith(false);
  });

  // Reads the current auto-start setting from the OS
  it("getStartupEnabled resolves to openAtLogin value", async () => {
    const result = await osIntegration.getStartupEnabled();
    expect(result).toBe(true);
    expect(mockOsAPI.getLoginItemSettings).toHaveBeenCalled();
  });

  // Defensive: handles case where the OS API returns null
  it("getStartupEnabled returns false when getLoginItemSettings returns null", async () => {
    mockOsAPI.getLoginItemSettings.mockResolvedValue(null);
    const result = await osIntegration.getStartupEnabled();
    expect(result).toBe(false);
  });

  // Edge case: if the IPC bridge breaks mid-session, methods must not crash
  it("methods are no-op when electronAPI returns null mid-session", async () => {
    vi.resetModules();

    const electronMod = await import("./electron");
    (electronMod.isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (electronMod.getElectronAPI as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ os: mockOsAPI })
      .mockReturnValue(null);

    const mod = await import("./os-integration");
    const svc = mod.osIntegration;

    // After first call, getElectronAPI returns null
    expect(() => svc.setBadgeCount(1)).not.toThrow();
    expect(() => svc.setProgressBar(0.5)).not.toThrow();
    expect(() => svc.clearProgressBar()).not.toThrow();
    expect(() => svc.requestAttention()).not.toThrow();
  });
});
