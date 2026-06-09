import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectDiagnosticsMemorySnapshot,
  getJsHeapUtilizationPercent,
  readDeviceMemoryGb,
  readJsHeapMemory,
} from "./diagnostics-memory.lib";

describe("readJsHeapMemory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when performance.memory is unavailable", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    expect(readJsHeapMemory()).toBeNull();
  });

  it("reads Chromium performance.memory values", () => {
    vi.stubGlobal("performance", {
      memory: {
        usedJSHeapSize: 50 * 1024 * 1024,
        totalJSHeapSize: 60 * 1024 * 1024,
        jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
      },
    });

    expect(readJsHeapMemory()).toEqual({
      usedBytes: 50 * 1024 * 1024,
      totalBytes: 60 * 1024 * 1024,
      limitBytes: 2 * 1024 * 1024 * 1024,
    });
  });
});

describe("readDeviceMemoryGb", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  });

  it("returns null when deviceMemory is unavailable", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    expect(readDeviceMemoryGb()).toBeNull();
  });

  it("reads navigator.deviceMemory", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { deviceMemory: 8 },
    });
    expect(readDeviceMemoryGb()).toBe(8);
  });
});

describe("getJsHeapUtilizationPercent", () => {
  it("returns null when heap is unavailable", () => {
    expect(getJsHeapUtilizationPercent(null)).toBeNull();
  });

  it("computes utilization against heap limit", () => {
    expect(
      getJsHeapUtilizationPercent({
        usedBytes: 25,
        totalBytes: 30,
        limitBytes: 100,
      }),
    ).toBe(25);
  });
});

describe("collectDiagnosticsMemorySnapshot", () => {
  const originalElectronAPI = window.electronAPI;

  beforeEach(() => {
    vi.stubGlobal("performance", {
      memory: {
        usedJSHeapSize: 10 * 1024 * 1024,
        totalJSHeapSize: 12 * 1024 * 1024,
        jsHeapSizeLimit: 100 * 1024 * 1024,
      },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { deviceMemory: 16 },
    });
  });

  afterEach(() => {
    if (originalElectronAPI) {
      (window as unknown as Record<string, unknown>).electronAPI = originalElectronAPI;
    } else {
      delete (window as unknown as Record<string, unknown>).electronAPI;
    }
    vi.unstubAllGlobals();
  });

  it("returns browser snapshot when electronAPI is unavailable", async () => {
    delete (window as unknown as Record<string, unknown>).electronAPI;

    const snapshot = await collectDiagnosticsMemorySnapshot();

    expect(snapshot.runtime).toBe("browser");
    expect(snapshot.electron).toBeNull();
    expect(snapshot.jsHeap?.usedBytes).toBe(10 * 1024 * 1024);
    expect(snapshot.deviceMemoryGb).toBe(16);
    expect(snapshot.capabilities.processMetricsAvailable).toBe(false);
  });

  it("merges electron IPC metrics when electronAPI is present", async () => {
    (window as unknown as Record<string, unknown>).electronAPI = {
      platform: "darwin",
      diagnostics: {
        getMemorySnapshot: vi.fn().mockResolvedValue({
          collectedAt: "2026-01-01T00:00:00.000Z",
          main: { rss: 100, heapUsed: 50, heapTotal: 80, external: 0, arrayBuffers: 0 },
          system: { total: 16000, free: 8000 },
          processes: [
            {
              pid: 1,
              type: "Browser",
              memory: { workingSetSize: 100, peakWorkingSetSize: 120 },
              cpu: { percentCPUUsage: 1.5 },
            },
          ],
          totalWorkingSetKb: 100,
        }),
        getRendererMemory: vi.fn().mockResolvedValue({
          processMemory: { private: 200, residentSet: 180, shared: 20 },
          heapStatistics: { usedHeapSize: 64 },
          blinkMemoryInfo: { allocated: 32, total: 40 },
        }),
      },
    };

    const snapshot = await collectDiagnosticsMemorySnapshot();

    expect(snapshot.runtime).toBe("electron");
    expect(snapshot.electron?.totalWorkingSetKb).toBe(100);
    expect(snapshot.electron?.processes).toHaveLength(1);
    expect(snapshot.electron?.renderer.privateKb).toBe(200);
    expect(snapshot.capabilities.processMetricsAvailable).toBe(true);
  });
});
