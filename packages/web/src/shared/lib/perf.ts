/**
 * Performance monitoring utilities.
 *
 * Provides timing, marks, and measurement helpers.
 * In production: lightweight (no-op marks, only critical timings).
 * In development: full tracing to console and Performance API.
 *
 * Usage:
 *   import { perf } from "~/lib/perf";
 *
 *   const end = perf.startTimer("api:fetchMessages");
 *   const data = await fetchMessages();
 *   end();  // logs duration
 *
 *   perf.mark("app:ready");
 *   perf.measure("app:startup", "app:init", "app:ready");
 */

import { createLogger } from "./logger";

const log = createLogger("perf");
const IS_DEV = import.meta.env?.DEV ?? false;
const HAS_PERF_API = typeof performance !== "undefined" && typeof performance.mark === "function";

export type PerfTimer = () => number;

function startTimer(label: string): PerfTimer {
  const start = performance.now();
  if (IS_DEV && HAS_PERF_API) {
    performance.mark(`${label}:start`);
  }

  return () => {
    const duration = Math.round(performance.now() - start);

    if (IS_DEV && HAS_PERF_API) {
      performance.mark(`${label}:end`);
      try {
        performance.measure(label, `${label}:start`, `${label}:end`);
      } catch {
        /* marks may have been cleared */
      }
    }

    if (duration > 1000) {
      log.warn(`Slow: ${label}`, { durationMs: duration });
    } else if (IS_DEV) {
      log.info(label, { durationMs: duration });
    }

    return duration;
  };
}

function mark(name: string): void {
  if (HAS_PERF_API) {
    performance.mark(name);
  }
}

function measure(name: string, startMark: string, endMark: string): number | null {
  if (!HAS_PERF_API) return null;
  try {
    const entry = performance.measure(name, startMark, endMark);
    const duration = Math.round(entry.duration);
    log.info(name, { durationMs: duration });
    return duration;
  } catch {
    return null;
  }
}

function trackRenderCount(componentName: string): { increment: () => void; dispose: () => void } {
  if (!IS_DEV) return { increment: () => {}, dispose: () => {} };

  let count = 0;
  const WARN_THRESHOLD = 20;
  const INTERVAL_MS = 5000;

  const interval = setInterval(() => {
    if (count > WARN_THRESHOLD) {
      log.warn(`Excessive renders: ${componentName}`, {
        renders: count,
        intervalMs: INTERVAL_MS,
      });
    }
    count = 0;
  }, INTERVAL_MS);

  return {
    increment: () => {
      count++;
    },
    dispose: () => clearInterval(interval),
  };
}

function reportWebVitals(): () => void {
  if (typeof window === "undefined" || !("PerformanceObserver" in window)) return () => {};

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const value = Math.round(
        "value" in entry ? (entry as { value: number }).value : entry.duration,
      );
      log.info(`web-vital:${entry.name}`, {
        value,
        entryType: entry.entryType,
      });
    }
  });

  try {
    observer.observe({ type: "largest-contentful-paint", buffered: true });
    observer.observe({ type: "first-input", buffered: true });
    observer.observe({ type: "layout-shift", buffered: true });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    /* some entry types may not be supported */
  }

  return () => observer.disconnect();
}

export const perf = {
  startTimer,
  mark,
  measure,
  trackRenderCount,
  reportWebVitals,
};
