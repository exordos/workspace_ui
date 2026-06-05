/**
 * Lightweight realtime event counters for the diagnostics dashboard.
 */

export interface DiagnosticRealtimeStats {
  eventsReceivedCount: number;
  lastEventAt: number | null;
  lastEventType: string | null;
}

let eventsReceivedCount = 0;
let lastEventAt: number | null = null;
let lastEventType: string | null = null;

/** Called from the Zulip event loop on each received event. */
export function recordDiagnosticRealtimeEvent(eventType: string): void {
  eventsReceivedCount += 1;
  lastEventAt = Date.now();
  lastEventType = eventType;
}

export function getDiagnosticRealtimeStats(): DiagnosticRealtimeStats {
  return { eventsReceivedCount, lastEventAt, lastEventType };
}

export function resetDiagnosticRealtimeStatsForTests(): void {
  eventsReceivedCount = 0;
  lastEventAt = null;
  lastEventType = null;
}
