/**
 * Tests for the Electron runtime detection and IPC helpers.
 *
 * The app runs in both browser and Electron. This module detects the
 * runtime via window.electronAPI (injected by preload.ts). Incorrect detection
 * would call missing IPC methods or skip native features in Electron.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getElectronAPI, isElectron, isElectronDarwin } from "./electron";

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
});
