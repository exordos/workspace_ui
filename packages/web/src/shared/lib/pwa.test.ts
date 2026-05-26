/**
 * Tests for the PWA (Progressive Web App) detection and install module.
 *
 * This module detects the runtime environment (Electron, PWA standalone,
 * or browser), manages the PWA install prompt lifecycle, and provides
 * listeners for install state changes. Incorrect runtime detection would
 * enable PWA-specific features in Electron or vice versa.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isElectron } from "./electron";

vi.mock("./electron", () => ({
  isElectron: vi.fn(() => false),
}));

describe("pwa", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(isElectron).mockReturnValue(false);
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // getRuntime determines if the app is running as Electron, installed PWA, or plain browser
  describe("getRuntime", () => {
    // Electron is detected via window.electronAPI presence
    it("returns 'electron' when running in Electron", async () => {
      vi.mocked(isElectron).mockReturnValue(true);
      const { getRuntime } = await import("./pwa");
      expect(getRuntime()).toBe("electron");
    });

    // Default case: plain browser tab with no special features
    it("returns 'browser' by default", async () => {
      const { getRuntime } = await import("./pwa");
      expect(getRuntime()).toBe("browser");
    });

    // Standalone display-mode means the PWA was installed to the home screen
    it("returns 'pwa' when display-mode is standalone", async () => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { getRuntime } = await import("./pwa");
      expect(getRuntime()).toBe("pwa");
    });

    // Electron detection must take priority — Electron also runs in a standalone window
    it("electron takes priority over pwa detection", async () => {
      vi.mocked(isElectron).mockReturnValue(true);
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { getRuntime } = await import("./pwa");
      expect(getRuntime()).toBe("electron");
    });
  });

  // isPwa is a shorthand check used to conditionally show PWA-specific UI
  describe("isPwa", () => {
    // In a regular browser tab, this should be false
    it("returns false by default (non-standalone)", async () => {
      const { isPwa } = await import("./pwa");
      expect(isPwa()).toBe(false);
    });

    // Installed PWA runs in standalone mode — isPwa should return true
    it("returns true when display-mode is standalone", async () => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { isPwa } = await import("./pwa");
      expect(isPwa()).toBe(true);
    });
  });

  // canInstallPwa tracks whether the browser has offered an install prompt
  describe("canInstallPwa", () => {
    // Before any beforeinstallprompt event, installation is not available
    it("returns false initially (no beforeinstallprompt captured)", async () => {
      const { canInstallPwa } = await import("./pwa");
      expect(canInstallPwa()).toBe(false);
    });
  });

  // promptInstallPwa triggers the native install dialog
  describe("promptInstallPwa", () => {
    // Without a captured prompt event, the install is unavailable
    it("returns 'unavailable' when no prompt is captured", async () => {
      const { promptInstallPwa } = await import("./pwa");
      const result = await promptInstallPwa();
      expect(result).toBe("unavailable");
    });
  });

  // onInstallAvailableChange subscribes to install state changes
  describe("onInstallAvailableChange", () => {
    // Must return an unsubscribe function to prevent memory leaks
    it("returns an unsubscribe function", async () => {
      const { onInstallAvailableChange } = await import("./pwa");
      const unsub = onInstallAvailableChange(vi.fn());
      expect(typeof unsub).toBe("function");
      unsub();
    });
  });

  // initPwaListeners sets up beforeinstallprompt and appinstalled event listeners
  describe("cleanupDevServiceWorkers", () => {
    it("unregisters stale vite pwa workers in dev", async () => {
      const unregisterDevSw = vi.fn().mockResolvedValue(true);
      const unregisterFirebaseSw = vi.fn().mockResolvedValue(true);
      const getRegistrations = vi.fn().mockResolvedValue([
        {
          active: { scriptURL: "http://localhost:5173/dev-sw.js?dev-sw" },
          waiting: null,
          installing: null,
          unregister: unregisterDevSw,
        },
        {
          active: { scriptURL: "http://localhost:5173/firebase-messaging-sw.js" },
          waiting: null,
          installing: null,
          unregister: unregisterFirebaseSw,
        },
      ] as unknown);

      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { getRegistrations },
      });

      const { cleanupDevServiceWorkers } = await import("./pwa");
      cleanupDevServiceWorkers();
      await Promise.resolve();
      await Promise.resolve();

      expect(getRegistrations).toHaveBeenCalledTimes(1);
      expect(unregisterDevSw).toHaveBeenCalledTimes(1);
      expect(unregisterFirebaseSw).not.toHaveBeenCalled();
    });

    it("swallows service worker lookup failures", async () => {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          getRegistrations: vi.fn().mockRejectedValue(new Error("failed to load registrations")),
        },
      });

      const { cleanupDevServiceWorkers } = await import("./pwa");
      expect(() => cleanupDevServiceWorkers()).not.toThrow();
      await Promise.resolve();
    });
  });

  describe("initPwaListeners", () => {
    // Must not crash in a browser environment without service worker support
    it("does not throw in browser environment", async () => {
      const { initPwaListeners } = await import("./pwa");
      expect(() => initPwaListeners()).not.toThrow();
    });

    // In Electron, PWA listeners are unnecessary — skip to avoid interference
    it("does nothing in Electron environment", async () => {
      vi.mocked(isElectron).mockReturnValue(true);
      const addListenerSpy = vi.spyOn(window, "addEventListener");
      const { initPwaListeners } = await import("./pwa");

      initPwaListeners();

      const pwaRelatedCalls = addListenerSpy.mock.calls.filter(
        ([name]) => name === "beforeinstallprompt" || name === "appinstalled",
      );
      expect(pwaRelatedCalls.length).toBe(0);
      addListenerSpy.mockRestore();
    });

    // beforeinstallprompt fires when the browser thinks the app is installable
    it("registers beforeinstallprompt listener in browser", async () => {
      const addListenerSpy = vi.spyOn(window, "addEventListener");
      const { initPwaListeners } = await import("./pwa");

      initPwaListeners();

      const beforeInstallCalls = addListenerSpy.mock.calls.filter(
        ([name]) => name === "beforeinstallprompt",
      );
      expect(beforeInstallCalls.length).toBe(1);
      addListenerSpy.mockRestore();
    });

    // appinstalled fires after the user completes the PWA installation
    it("registers appinstalled listener in browser", async () => {
      const addListenerSpy = vi.spyOn(window, "addEventListener");
      const { initPwaListeners } = await import("./pwa");

      initPwaListeners();

      const appInstalledCalls = addListenerSpy.mock.calls.filter(
        ([name]) => name === "appinstalled",
      );
      expect(appInstalledCalls.length).toBe(1);
      addListenerSpy.mockRestore();
    });

    // When the browser fires beforeinstallprompt, the prompt is captured for later use
    it("captures beforeinstallprompt event and makes canInstallPwa return true", async () => {
      const { initPwaListeners, canInstallPwa } = await import("./pwa");
      initPwaListeners();

      const mockPromptEvent = new Event("beforeinstallprompt", { cancelable: true });
      (mockPromptEvent as Event & { prompt: () => Promise<{ outcome: string }> }).prompt = vi
        .fn()
        .mockResolvedValue({ outcome: "accepted" });
      window.dispatchEvent(mockPromptEvent);

      expect(canInstallPwa()).toBe(true);
    });

    // After installation completes, the prompt is no longer needed
    it("clears prompt on appinstalled event", async () => {
      const { initPwaListeners, canInstallPwa } = await import("./pwa");
      initPwaListeners();

      const mockPromptEvent = new Event("beforeinstallprompt", { cancelable: true });
      (mockPromptEvent as Event & { prompt: () => Promise<{ outcome: string }> }).prompt = vi
        .fn()
        .mockResolvedValue({ outcome: "accepted" });
      window.dispatchEvent(mockPromptEvent);
      expect(canInstallPwa()).toBe(true);

      window.dispatchEvent(new Event("appinstalled"));
      expect(canInstallPwa()).toBe(false);
    });

    // Subscribers are notified when install availability changes
    it("notifies listeners on beforeinstallprompt", async () => {
      const { initPwaListeners, onInstallAvailableChange } = await import("./pwa");
      const listener = vi.fn();
      onInstallAvailableChange(listener);

      initPwaListeners();

      const mockPromptEvent = new Event("beforeinstallprompt", { cancelable: true });
      (mockPromptEvent as Event & { prompt: () => Promise<{ outcome: string }> }).prompt = vi
        .fn()
        .mockResolvedValue({ outcome: "accepted" });
      window.dispatchEvent(mockPromptEvent);

      expect(listener).toHaveBeenCalled();
    });
  });
});
