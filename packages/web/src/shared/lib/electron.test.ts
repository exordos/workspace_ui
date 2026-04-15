/**
 * Tests for the Electron runtime detection and IPC helpers.
 *
 * The app runs in both browser and Electron. This module detects the
 * runtime via window.electronAPI (injected by preload.ts) and provides
 * cross-runtime helpers like showDesktopNotification. Incorrect detection
 * would call missing IPC methods or skip native features in Electron.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getElectronAPI, isElectron, isElectronDarwin, showDesktopNotification } from "./electron";

describe("electron", () => {
  const originalElectronAPI = window.electronAPI;

  // Reset electronAPI before each test so runtime detection starts clean
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  afterEach(() => {
    if (originalElectronAPI) {
      (window as unknown as Record<string, unknown>).electronAPI = originalElectronAPI;
    } else {
      delete (window as unknown as Record<string, unknown>).electronAPI;
    }
  });

  // isElectron is used throughout the app to branch between Electron and browser code paths
  describe("isElectron", () => {
    // Default browser environment — electronAPI is not injected by preload
    it("returns false when electronAPI is not defined", () => {
      expect(isElectron()).toBe(false);
    });

    // Electron preload injects electronAPI via contextBridge
    it("returns true when electronAPI is defined", () => {
      (window as unknown as Record<string, unknown>).electronAPI = {
        notifications: { show: vi.fn() },
      };
      expect(isElectron()).toBe(true);
    });

    // null is a possible value if preload fails — must be treated as non-Electron
    it("returns false when electronAPI is null", () => {
      (window as unknown as Record<string, unknown>).electronAPI = null;
      expect(isElectron()).toBe(false);
    });

    // Explicit undefined assignment must also be treated as non-Electron
    it("returns false when electronAPI is undefined", () => {
      (window as unknown as Record<string, unknown>).electronAPI = undefined;
      expect(isElectron()).toBe(false);
    });
  });

  describe("isElectronDarwin", () => {
    it("returns false when not in Electron", () => {
      expect(isElectronDarwin()).toBe(false);
    });

    it("returns false when platform is linux", () => {
      (window as unknown as Record<string, unknown>).electronAPI = {
        platform: "linux",
        notifications: { show: vi.fn() },
      };
      expect(isElectronDarwin()).toBe(false);
    });

    it("returns true when platform is darwin", () => {
      (window as unknown as Record<string, unknown>).electronAPI = {
        platform: "darwin",
        notifications: { show: vi.fn() },
      };
      expect(isElectronDarwin()).toBe(true);
    });
  });

  // getElectronAPI provides typed access to the IPC bridge for notifications, badge, etc.
  describe("getElectronAPI", () => {
    // In browser, getElectronAPI returns null so callers can use null-check branching
    it("returns null when electronAPI is not defined", () => {
      expect(getElectronAPI()).toBeNull();
    });

    // In Electron, returns the full API object injected by preload.ts
    it("returns the API object when available", () => {
      const mockAPI = { notifications: { show: vi.fn() }, badge: { set: vi.fn() } };
      (window as unknown as Record<string, unknown>).electronAPI = mockAPI;
      expect(getElectronAPI()).toBe(mockAPI);
    });

    it("returns null when electronAPI is undefined", () => {
      (window as unknown as Record<string, unknown>).electronAPI = undefined;
      expect(getElectronAPI()).toBeNull();
    });
  });

  // showDesktopNotification abstracts Electron IPC vs Web Notification API
  describe("showDesktopNotification", () => {
    // In Electron, notifications go through IPC to the main process for native OS notifications
    it("calls electron notifications.show when electronAPI is available", async () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      (window as unknown as Record<string, unknown>).electronAPI = {
        notifications: { show: showFn },
      };

      await showDesktopNotification("Title", "Body text");
      expect(showFn).toHaveBeenCalledWith("Title", "Body text");
    });

    // In browser with granted permission, use the Web Notification API
    it("falls back to Web Notification API when not in Electron and permission granted", async () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal("Notification", NotificationSpy);
      Object.defineProperty(Notification, "permission", { value: "granted", configurable: true });

      await showDesktopNotification("Hello", "World");
      expect(NotificationSpy).toHaveBeenCalledWith("Hello", { body: "World" });

      vi.unstubAllGlobals();
    });

    // Denied permission means the user explicitly blocked notifications — respect their choice
    it("does nothing when not in Electron and notification permission is denied", async () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal("Notification", NotificationSpy);
      Object.defineProperty(Notification, "permission", { value: "denied", configurable: true });

      await showDesktopNotification("Hello", "World");
      expect(NotificationSpy).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    // "default" means the user hasn't been asked yet — don't show unsolicited notifications
    it("does nothing when not in Electron and notification permission is default", async () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal("Notification", NotificationSpy);
      Object.defineProperty(Notification, "permission", { value: "default", configurable: true });

      await showDesktopNotification("Hello", "World");
      expect(NotificationSpy).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    // When both APIs are available (e.g. in dev), Electron IPC takes priority
    it("prefers Electron API over Web Notifications", async () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      (window as unknown as Record<string, unknown>).electronAPI = {
        notifications: { show: showFn },
      };
      const NotificationSpy = vi.fn();
      vi.stubGlobal("Notification", NotificationSpy);
      Object.defineProperty(Notification, "permission", { value: "granted", configurable: true });

      await showDesktopNotification("Title", "Body");
      expect(showFn).toHaveBeenCalledWith("Title", "Body");
      expect(NotificationSpy).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });
});
