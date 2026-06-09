/**
 * Lightweight API transport probe after browser `online` events.
 *
 * `navigator.onLine` can be true while the realm is still unreachable — this HEAD
 * request confirms the server responds before connection-health clears failure UI.
 */
import { getCurrentInstance } from "~/shared/api/client";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("network-probe");

const PROBE_TIMEOUT_MS = 8_000;

/** Returns true when the realm responds (any sub-500 status, including 401). */
export async function probeApiTransport(signal?: AbortSignal): Promise<boolean> {
  const result = await probeApiTransportWithLatency(signal);
  return result.ok;
}

export interface ApiTransportProbeResult {
  ok: boolean;
  latencyMs: number;
}

/** Transport probe with round-trip latency for diagnostics UI. */
export async function probeApiTransportWithLatency(
  signal?: AbortSignal,
): Promise<ApiTransportProbeResult> {
  const startedAt = performance.now();
  const instance = getCurrentInstance();
  if (instance == null) {
    return { ok: true, latencyMs: 0 };
  }

  const base = instance.realm.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const linkedSignal = signal;
  const onLinkedAbort = () => controller.abort();
  linkedSignal?.addEventListener("abort", onLinkedAbort);

  try {
    const res = await fetch(`${base}/api/v1/register`, {
      method: "HEAD",
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const ok = res.status < 500;
    log.debug("Transport probe finished", { status: res.status, ok, latencyMs });
    return { ok, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt);
    log.warn("Transport probe failed", { error: String(err), latencyMs });
    return { ok: false, latencyMs };
  } finally {
    clearTimeout(timeoutId);
    linkedSignal?.removeEventListener("abort", onLinkedAbort);
  }
}
