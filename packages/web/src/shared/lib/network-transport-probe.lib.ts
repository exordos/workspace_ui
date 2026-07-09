import { createLogger } from "~/shared/lib/logger";

const log = createLogger("network-probe");

const UNSUPPORTED_TRANSPORT_PROBE_RESULT: ApiTransportProbeResult = {
  ok: false,
  latencyMs: 0,
  unsupported: true,
  reason: "zulip_api_removed",
};

/** Returns false because the old Zulip transport probe is no longer supported. */
export function probeApiTransport(signal?: AbortSignal): Promise<boolean> {
  return probeApiTransportWithLatency(signal).then((result) => result.ok);
}

export interface ApiTransportProbeResult {
  ok: boolean;
  latencyMs: number;
  unsupported: boolean;
  reason: "zulip_api_removed";
}

/** Local diagnostics placeholder after removing the Zulip register probe. */
export function probeApiTransportWithLatency(
  signal?: AbortSignal,
): Promise<ApiTransportProbeResult> {
  void signal;
  log.debug("Transport probe is unsupported after Zulip API removal");
  return Promise.resolve(UNSUPPORTED_TRANSPORT_PROBE_RESULT);
}
