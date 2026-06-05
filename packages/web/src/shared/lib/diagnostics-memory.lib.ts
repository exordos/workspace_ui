/**
 * Diagnostics memory snapshot — browser APIs plus optional Electron IPC metrics.
 *
 * Usage:
 *   import { collectDiagnosticsMemorySnapshot } from "~/shared/lib/diagnostics-memory.lib";
 *   const snapshot = await collectDiagnosticsMemorySnapshot();
 */

import { getElectronAPI, isElectron } from "~/shared/lib/electron";

export interface ElectronProcessRow {
  pid: number;
  type: string;
  workingSetKb: number;
  peakWorkingSetKb: number;
  cpuPercent: number | null;
}

export interface DiagnosticsMemorySnapshot {
  collectedAt: string;
  runtime: "electron" | "browser";
  jsHeap: { usedBytes: number; totalBytes: number; limitBytes: number } | null;
  deviceMemoryGb: number | null;
  electron: {
    totalWorkingSetKb: number;
    system: { totalKb: number; freeKb: number };
    processes: ElectronProcessRow[];
    renderer: {
      privateKb: number | null;
      v8HeapUsedKb: number | null;
      blinkAllocatedKb: number | null;
    };
    main: { rssBytes: number; heapUsedBytes: number };
  } | null;
  capabilities: {
    jsHeapAvailable: boolean;
    deviceMemoryAvailable: boolean;
    processMetricsAvailable: boolean;
  };
}

interface PerformanceMemoryLike {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

/** Reads Chromium `performance.memory` when available. */
export function readJsHeapMemory(): DiagnosticsMemorySnapshot["jsHeap"] {
  if (typeof performance === "undefined") return null;
  const memory = (performance as Performance & { memory?: PerformanceMemoryLike }).memory;
  if (memory == null) return null;
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = memory;
  if (
    !Number.isFinite(usedJSHeapSize) ||
    !Number.isFinite(totalJSHeapSize) ||
    !Number.isFinite(jsHeapSizeLimit)
  ) {
    return null;
  }
  return {
    usedBytes: usedJSHeapSize,
    totalBytes: totalJSHeapSize,
    limitBytes: jsHeapSizeLimit,
  };
}

/** Reads coarse device RAM estimate from `navigator.deviceMemory` (GB). */
export function readDeviceMemoryGb(): number | null {
  if (typeof navigator === "undefined") return null;
  const deviceMemory = (navigator as NavigatorWithDeviceMemory).deviceMemory;
  if (typeof deviceMemory !== "number" || !Number.isFinite(deviceMemory) || deviceMemory <= 0) {
    return null;
  }
  return deviceMemory;
}

/** Returns JS heap utilization as 0–100, or null when heap metrics are unavailable. */
export function getJsHeapUtilizationPercent(
  jsHeap: DiagnosticsMemorySnapshot["jsHeap"],
): number | null {
  if (jsHeap == null || jsHeap.limitBytes <= 0) return null;
  const percent = (jsHeap.usedBytes / jsHeap.limitBytes) * 100;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

/** Collects browser and optional Electron memory metrics for the diagnostics page. */
export async function collectDiagnosticsMemorySnapshot(): Promise<DiagnosticsMemorySnapshot> {
  const collectedAt = new Date().toISOString();
  const jsHeap = readJsHeapMemory();
  const deviceMemoryGb = readDeviceMemoryGb();
  const electronApi = getElectronAPI();

  if (!isElectron() || electronApi?.diagnostics == null) {
    return {
      collectedAt,
      runtime: "browser",
      jsHeap,
      deviceMemoryGb,
      electron: null,
      capabilities: {
        jsHeapAvailable: jsHeap != null,
        deviceMemoryAvailable: deviceMemoryGb != null,
        processMetricsAvailable: false,
      },
    };
  }

  const [mainSnapshot, rendererSnapshot] = await Promise.all([
    electronApi.diagnostics.getMemorySnapshot(),
    electronApi.diagnostics.getRendererMemory(),
  ]);

  const processes: ElectronProcessRow[] = mainSnapshot.processes.map((processMetric) => ({
    pid: processMetric.pid,
    type: processMetric.type,
    workingSetKb: processMetric.memory.workingSetSize,
    peakWorkingSetKb: processMetric.memory.peakWorkingSetSize,
    cpuPercent: processMetric.cpu?.percentCPUUsage ?? null,
  }));

  return {
    collectedAt,
    runtime: "electron",
    jsHeap,
    deviceMemoryGb,
    electron: {
      totalWorkingSetKb: mainSnapshot.totalWorkingSetKb,
      system: {
        totalKb: mainSnapshot.system.total,
        freeKb: mainSnapshot.system.free,
      },
      processes,
      renderer: {
        privateKb: rendererSnapshot.processMemory.private ?? null,
        v8HeapUsedKb: rendererSnapshot.heapStatistics.usedHeapSize ?? null,
        blinkAllocatedKb: rendererSnapshot.blinkMemoryInfo.allocated ?? null,
      },
      main: {
        rssBytes: mainSnapshot.main.rss,
        heapUsedBytes: mainSnapshot.main.heapUsed,
      },
    },
    capabilities: {
      jsHeapAvailable: jsHeap != null,
      deviceMemoryAvailable: deviceMemoryGb != null,
      processMetricsAvailable: true,
    },
  };
}
