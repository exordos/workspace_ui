/**
 * Summarizes API call latency from in-memory log entries (scope `api`).
 */

import type { LogEntry } from "~/shared/lib/logger";

export interface ApiLatencyCallSummary {
  path: string;
  durationMs: number;
  timestamp: string;
}

export interface ApiLatencySummary {
  sampleCount: number;
  medianMs: number | null;
  p95Ms: number | null;
  slowest: ApiLatencyCallSummary[];
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index] ?? null;
}

function extractPath(entry: LogEntry): string | null {
  if (entry.data == null || typeof entry.data !== "object") return null;
  const record = entry.data;
  const method = typeof record.method === "string" ? record.method : "GET";
  const path = typeof record.path === "string" ? record.path : null;
  if (path == null) return null;
  return `${method} ${path}`;
}

function extractDurationMs(entry: LogEntry): number | null {
  if (entry.data == null || typeof entry.data !== "object") return null;
  const durationMs = entry.data.durationMs;
  return typeof durationMs === "number" && Number.isFinite(durationMs) ? durationMs : null;
}

/** Builds median/p95 and top slow calls from api-scoped log entries. */
export function summarizeApiLogs(entries: readonly LogEntry[], topN = 3): ApiLatencySummary {
  const calls: ApiLatencyCallSummary[] = [];

  for (const entry of entries) {
    if (entry.scope !== "api") continue;
    const durationMs = extractDurationMs(entry);
    const path = extractPath(entry);
    if (durationMs == null || path == null) continue;
    calls.push({ path, durationMs, timestamp: entry.timestamp });
  }

  const durations = calls.map((call) => call.durationMs).sort((a, b) => a - b);
  const slowest = [...calls].sort((a, b) => b.durationMs - a.durationMs).slice(0, topN);

  return {
    sampleCount: calls.length,
    medianMs: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    slowest,
  };
}
