/**
 * Tests for the performance monitoring module.
 *
 * The perf module wraps the Performance API to provide timers, marks,
 * measures, render counting, and Web Vitals reporting. These tools help
 * detect slow API calls, long tasks, and excessive re-renders.
 * Broken timers would hide performance regressions from developers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("perf", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // startTimer is used to measure API call durations and operation latency
  describe("startTimer", () => {
    // Returns a stop function — calling it ends the timer and returns duration
    it("returns a function", async () => {
      const { perf } = await import("./perf");
      const end = perf.startTimer("test:op");
      expect(typeof end).toBe("function");
      end();
    });

    // Duration must be the difference between start and end performance.now() calls
    it("returns elapsed duration in ms", async () => {
      const { perf } = await import("./perf");
      const now = performance.now;
      let callCount = 0;
      vi.spyOn(performance, "now").mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 1000 : 1250;
      });

      const end = perf.startTimer("test:timing");
      const duration = end();
      expect(duration).toBe(250);

      performance.now = now;
    });

    // Fractional milliseconds should be rounded for clean log output
    it("rounds duration to integer", async () => {
      const { perf } = await import("./perf");
      let callCount = 0;
      vi.spyOn(performance, "now").mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 100 : 233.7;
      });

      const end = perf.startTimer("test:round");
      expect(end()).toBe(134);
    });
  });

  // mark() creates named performance marks for measuring app lifecycle phases
  describe("mark", () => {
    // Marks are used for measuring app startup (e.g. "app:init" → "app:ready")
    it("creates a performance mark", async () => {
      const { perf } = await import("./perf");
      perf.mark("test:mark");
      const marks = performance.getEntriesByName("test:mark", "mark");
      expect(marks.length).toBe(1);
    });

    // Multiple marks with different names should coexist independently
    it("can create multiple marks with different names", async () => {
      const { perf } = await import("./perf");
      perf.mark("mark-a");
      perf.mark("mark-b");
      expect(performance.getEntriesByName("mark-a", "mark").length).toBe(1);
      expect(performance.getEntriesByName("mark-b", "mark").length).toBe(1);
    });
  });

  // measure() calculates the time between two marks — used for startup timing
  describe("measure", () => {
    // Returns the duration in ms between start and end marks
    it("measures between two marks and returns duration", async () => {
      const { perf } = await import("./perf");
      performance.mark("start-m");
      performance.mark("end-m");
      const result = perf.measure("test-measure", "start-m", "end-m");
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
    });

    // Missing start mark should return null, not throw — safe in production
    it("returns null when start mark does not exist", async () => {
      const { perf } = await import("./perf");
      performance.mark("existing-end");
      const result = perf.measure("fail-measure", "nonexistent-start", "existing-end");
      expect(result).toBeNull();
    });

    // Missing end mark should also return null gracefully
    it("returns null when end mark does not exist", async () => {
      const { perf } = await import("./perf");
      performance.mark("existing-start");
      const result = perf.measure("fail-measure", "existing-start", "nonexistent-end");
      expect(result).toBeNull();
    });

    // The measure should be visible in the Performance timeline for DevTools analysis
    it("creates a performance measure entry", async () => {
      const { perf } = await import("./perf");
      performance.mark("m-start");
      performance.mark("m-end");
      perf.measure("my-measure", "m-start", "m-end");
      const measures = performance.getEntriesByName("my-measure", "measure");
      expect(measures.length).toBe(1);
    });
  });

  // trackRenderCount helps detect excessive re-renders in development
  describe("trackRenderCount", () => {
    // Returns increment (called per render) and dispose (cleanup) functions
    it("returns an object with increment and dispose", async () => {
      const { perf } = await import("./perf");
      const tracker = perf.trackRenderCount("TestComponent");
      expect(typeof tracker.increment).toBe("function");
      expect(typeof tracker.dispose).toBe("function");
      tracker.dispose();
    });
  });

  // reportWebVitals sets up PerformanceObserver for LCP, FID, CLS, and long tasks
  describe("reportWebVitals", () => {
    // Must not crash even if PerformanceObserver is unavailable (e.g. in tests)
    it("does not throw", async () => {
      const { perf } = await import("./perf");
      expect(() => perf.reportWebVitals()).not.toThrow();
    });

    // When PerformanceObserver is available, it should be instantiated for monitoring
    it("creates PerformanceObserver when available", async () => {
      const observeSpy = vi.fn();
      const MockObserver = vi.fn(function (this: unknown) {
        (this as Record<string, unknown>).observe = observeSpy;
        (this as Record<string, unknown>).disconnect = vi.fn();
      });
      vi.stubGlobal("PerformanceObserver", MockObserver);

      vi.resetModules();
      const { perf } = await import("./perf");
      perf.reportWebVitals();

      expect(MockObserver).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  // Verify the perf object exports all public methods for the rest of the app
  describe("perf object shape", () => {
    it("exports all expected methods", async () => {
      const { perf } = await import("./perf");
      expect(typeof perf.startTimer).toBe("function");
      expect(typeof perf.mark).toBe("function");
      expect(typeof perf.measure).toBe("function");
      expect(typeof perf.trackRenderCount).toBe("function");
      expect(typeof perf.reportWebVitals).toBe("function");
    });
  });
});
