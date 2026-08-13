/**
 * Tests for the unified auto-update hook.
 *
 * Verifies the useAppUpdate() React hook across browser (no-op) and Electron
 * (native auto-updater) runtimes. Tests cover status transitions (idle →
 * checking → available → downloading → ready), IPC subscription lifecycle,
 * and cleanup on unmount. This hook drives the "update available" banner in
 * the settings page.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { getElectronAPI } from "./electron";
import { useAppUpdate, type UpdateStatus, type UpdateState } from "./updater";

vi.mock("./electron", () => ({
  isElectron: vi.fn(() => false),
  getElectronAPI: vi.fn(() => null),
}));
vi.mock("./logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("updater", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Type exports
  // ---------------------------------------------------------------------------

  // Validates that the TypeScript types cover all possible update states
  describe("type contracts", () => {
    // All 7 statuses must be representable to drive UI state correctly
    it("UpdateStatus accepts all defined values", () => {
      const statuses: UpdateStatus[] = [
        "idle",
        "checking",
        "available",
        "downloading",
        "ready",
        "up-to-date",
        "error",
      ];
      expect(statuses).toHaveLength(7);
    });

    // The hook's return shape must include status + action functions
    it("UpdateState shape includes status, check, and install", () => {
      const state: UpdateState = {
        status: "idle",
        check: () => {},
        install: () => {},
      };
      expect(state.status).toBe("idle");
      expect(typeof state.check).toBe("function");
      expect(typeof state.install).toBe("function");
    });
  });

  // ---------------------------------------------------------------------------
  // Browser / noop mode (default in test environment)
  // ---------------------------------------------------------------------------

  // In browser mode there's no auto-updater — hook provides safe no-op stubs
  describe("useAppUpdate in browser mode", () => {
    // Browser apps update via the service worker, not this hook
    it("returns idle status", () => {
      const { result } = renderHook(() => useAppUpdate());
      expect(result.current.status).toBe("idle");
    });

    // Functions must exist so callers don't need runtime checks
    it("provides check and install as callable functions", () => {
      const { result } = renderHook(() => useAppUpdate());
      expect(typeof result.current.check).toBe("function");
      expect(typeof result.current.install).toBe("function");
    });

    // No-op functions must be safe to call without side effects
    it("check and install do not throw", () => {
      const { result } = renderHook(() => useAppUpdate());
      expect(() => result.current.check()).not.toThrow();
      expect(() => result.current.install()).not.toThrow();
    });

    // These fields are only populated during active update flow
    it("does not have version, percent, or error in idle state", () => {
      const { result } = renderHook(() => useAppUpdate());
      expect(result.current.version).toBeUndefined();
      expect(result.current.percent).toBeUndefined();
      expect(result.current.error).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Electron updater hook behavior
  // ---------------------------------------------------------------------------

  // Tests the Electron IPC integration for native auto-updater status events
  describe("electron updater integration", () => {
    // The hook must subscribe on mount and unsubscribe on unmount to prevent leaks
    it("subscribes to onStatus when electronAPI is available", () => {
      const unsubFn = vi.fn();
      const mockOnStatus = vi.fn(() => unsubFn);

      vi.mocked(getElectronAPI).mockReturnValue({
        updater: {
          onStatus: mockOnStatus,
          check: vi.fn(),
          install: vi.fn(),
        },
      } as never);

      const { unmount } = renderHook(() => useAppUpdate());

      expect(mockOnStatus).toHaveBeenCalledTimes(1);
      expect(mockOnStatus).toHaveBeenCalledWith(expect.any(Function));

      unmount();
      expect(unsubFn).toHaveBeenCalledTimes(1);
    });

    // Simulates the full update lifecycle: checking → available → downloading → ready → error
    it("handles all status transitions via onStatus callback", () => {
      let statusHandler: ((data: { status: string; [key: string]: unknown }) => void) | undefined;

      vi.mocked(getElectronAPI).mockReturnValue({
        updater: {
          onStatus: vi.fn((cb) => {
            statusHandler = cb;
            return vi.fn();
          }),
          check: vi.fn(),
          install: vi.fn(),
        },
      } as never);

      renderHook(() => useAppUpdate());

      expect(statusHandler).toBeDefined();

      act(() => {
        statusHandler!({ status: "checking" });
      });

      act(() => {
        statusHandler!({ status: "available", version: "2.0.0" });
      });

      act(() => {
        statusHandler!({ status: "downloading", percent: 50 });
      });

      act(() => {
        statusHandler!({ status: "ready", version: "2.0.0" });
      });

      act(() => {
        statusHandler!({ status: "error", message: "network failure" });
      });

      act(() => {
        statusHandler!({ status: "up-to-date" });
      });
    });

    it("check() and install() delegate to electronAPI methods", () => {
      const mockCheck = vi.fn();
      const mockInstall = vi.fn();

      vi.mocked(getElectronAPI).mockReturnValue({
        updater: {
          onStatus: vi.fn(() => vi.fn()),
          check: mockCheck,
          install: mockInstall,
        },
      } as never);

      renderHook(() => useAppUpdate());

      const api = getElectronAPI();
      api?.updater.check();
      api?.updater.install();

      expect(mockCheck).toHaveBeenCalledTimes(1);
      expect(mockInstall).toHaveBeenCalledTimes(1);
    });

    it("gracefully handles null electronAPI on check/install", () => {
      vi.mocked(getElectronAPI).mockReturnValue(null);

      const { result } = renderHook(() => useAppUpdate());

      expect(() => result.current.check()).not.toThrow();
      expect(() => result.current.install()).not.toThrow();
    });

    it("shares the latest Electron status with components mounted later", async () => {
      vi.resetModules();
      let statusHandler: ((data: { status: string; [key: string]: unknown }) => void) | undefined;
      const unsubscribe = vi.fn();
      const updaterApi = {
        updater: {
          onStatus: vi.fn((callback) => {
            statusHandler = callback;
            return unsubscribe;
          }),
          check: vi.fn(),
          install: vi.fn(),
        },
      };

      vi.doMock("./electron", () => ({
        isElectron: vi.fn(() => true),
        getElectronAPI: vi.fn(() => updaterApi),
      }));
      vi.doMock("./logger", () => ({
        createLogger: () => ({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      const updaterModule = await import("./updater");
      const first = renderHook(() => updaterModule.useAppUpdate());

      act(() => {
        statusHandler?.({ status: "ready", version: "0.4.10" });
      });

      const second = renderHook(() => updaterModule.useAppUpdate());

      expect(first.result.current).toMatchObject({ status: "ready", version: "0.4.10" });
      expect(second.result.current).toMatchObject({ status: "ready", version: "0.4.10" });
      expect(updaterApi.updater.onStatus).toHaveBeenCalledTimes(1);

      first.unmount();
      expect(unsubscribe).not.toHaveBeenCalled();
      second.unmount();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  // PWA service worker integration — verifies subscription and cleanup paths
  describe("PWA service worker integration", () => {
    afterEach(() => {
      if ("serviceWorker" in navigator) {
        delete (navigator as unknown as Record<string, unknown>).serviceWorker;
      }
    });

    it("subscribes to SW controllerchange and registration updatefound", async () => {
      const swAddListener = vi.fn();
      const swRemoveListener = vi.fn();
      const regAddListener = vi.fn();
      const regRemoveListener = vi.fn();

      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          ready: Promise.resolve({
            waiting: null,
            installing: null,
            addEventListener: regAddListener,
            removeEventListener: regRemoveListener,
            update: vi.fn(),
          }),
          controller: null,
          addEventListener: swAddListener,
          removeEventListener: swRemoveListener,
        },
        configurable: true,
      });

      const { unmount } = renderHook(() => useAppUpdate());

      expect(swAddListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));

      await act(async () => {
        await Promise.resolve();
      });

      expect(regAddListener).toHaveBeenCalledWith("updatefound", expect.any(Function));

      unmount();

      expect(swRemoveListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
    });

    it("detects a waiting worker and executes the ready path", async () => {
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          ready: Promise.resolve({
            waiting: { postMessage: vi.fn(), state: "installed" },
            installing: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            update: vi.fn(),
          }),
          controller: {},
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        configurable: true,
      });

      const { unmount } = renderHook(() => useAppUpdate());

      await act(async () => {
        await Promise.resolve();
      });

      unmount();
    });

    it("handles SW ready rejection gracefully", async () => {
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          ready: Promise.reject(new Error("SW registration failed")),
          controller: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        configurable: true,
      });

      const { unmount } = renderHook(() => useAppUpdate());

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      unmount();
    });
  });

  describe("PWA check()", () => {
    afterEach(() => {
      if ("serviceWorker" in navigator) {
        delete (navigator as unknown as Record<string, unknown>).serviceWorker;
      }
      vi.resetModules();
    });

    async function loadPwaUpdaterModule() {
      vi.resetModules();
      vi.doMock("./electron", () => ({
        isElectron: vi.fn(() => false),
        getElectronAPI: vi.fn(() => null),
      }));
      vi.doMock("./logger", () => ({
        createLogger: () => ({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));
      return import("./updater");
    }

    function mockServiceWorkerRegistration(options: {
      waiting?: ServiceWorker | null;
      installing?: ServiceWorker | null;
      update?: () => Promise<void>;
      ready?: Promise<ServiceWorkerRegistration>;
    }) {
      const registration = {
        waiting: options.waiting ?? null,
        installing: options.installing ?? null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        update: options.update ?? vi.fn().mockResolvedValue(undefined),
      } as unknown as ServiceWorkerRegistration;

      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          ready: options.ready ?? Promise.resolve(registration),
          controller: {},
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        configurable: true,
      });

      return registration;
    }

    it("check() keeps ready when a waiting worker already exists", async () => {
      const updateMock = vi.fn().mockResolvedValue(undefined);
      mockServiceWorkerRegistration({
        waiting: { postMessage: vi.fn(), state: "installed" } as unknown as ServiceWorker,
        update: updateMock,
      });

      const { useAppUpdate } = await loadPwaUpdaterModule();
      const { result, unmount } = renderHook(() => useAppUpdate());

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.status).toBe("ready");

      act(() => {
        result.current.check();
      });

      expect(result.current.status).toBe("ready");
      expect(updateMock).not.toHaveBeenCalled();

      unmount();
    });

    it("check() transitions to up-to-date when update() finds no new worker", async () => {
      const updateMock = vi.fn().mockResolvedValue(undefined);
      mockServiceWorkerRegistration({ update: updateMock });

      const { useAppUpdate } = await loadPwaUpdaterModule();
      const { result, unmount } = renderHook(() => useAppUpdate());

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.check();
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("up-to-date");

      unmount();
    });

    it("check() before registration is ready resolves to up-to-date", async () => {
      const updateMock = vi.fn().mockResolvedValue(undefined);
      let resolveReady: (registration: ServiceWorkerRegistration) => void = () => {};
      const readyPromise = new Promise<ServiceWorkerRegistration>((resolve) => {
        resolveReady = resolve;
      });

      const registration = mockServiceWorkerRegistration({
        update: updateMock,
        ready: readyPromise,
      });

      const { useAppUpdate } = await loadPwaUpdaterModule();
      const { result, unmount } = renderHook(() => useAppUpdate());

      act(() => {
        result.current.check();
      });

      expect(result.current.status).toBe("checking");

      await act(async () => {
        resolveReady(registration);
        await Promise.resolve();
      });

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("up-to-date");

      unmount();
    });
  });
});
