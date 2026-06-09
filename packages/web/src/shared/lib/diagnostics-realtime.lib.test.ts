import { describe, expect, it, beforeEach } from "vitest";
import {
  getDiagnosticRealtimeStats,
  recordDiagnosticRealtimeEvent,
  resetDiagnosticRealtimeStatsForTests,
} from "./diagnostics-realtime.lib";

describe("diagnostics-realtime", () => {
  beforeEach(() => {
    resetDiagnosticRealtimeStatsForTests();
  });

  it("tracks event count and last event metadata", () => {
    recordDiagnosticRealtimeEvent("message");
    recordDiagnosticRealtimeEvent("typing");

    const stats = getDiagnosticRealtimeStats();
    expect(stats.eventsReceivedCount).toBe(2);
    expect(stats.lastEventType).toBe("typing");
    expect(stats.lastEventAt).not.toBeNull();
  });
});
