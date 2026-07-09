import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeApiTransport, probeApiTransportWithLatency } from "./network-transport-probe.lib";

const getCurrentInstance = vi.fn();

vi.mock("~/shared/api/client", () => ({
  getCurrentInstance: () => getCurrentInstance(),
}));

describe("probeApiTransport", () => {
  beforeEach(() => {
    getCurrentInstance.mockReturnValue({ realm: "https://zulip.example.com" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getCurrentInstance.mockReset();
  });

  it("returns an unsupported local result without calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeApiTransport()).resolves.toBe(false);
    await expect(probeApiTransportWithLatency()).resolves.toEqual({
      ok: false,
      latencyMs: 0,
      unsupported: true,
      reason: "zulip_api_removed",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCurrentInstance).not.toHaveBeenCalled();
  });
});
