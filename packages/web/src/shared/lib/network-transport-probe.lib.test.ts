import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeApiTransport } from "./network-transport-probe.lib";

const getCurrentInstance = vi.fn();

vi.mock("~/shared/api/client", () => ({
  getCurrentInstance: () => getCurrentInstance(),
  getMessengerGatewayApiBaseForCurrentInstance: () =>
    "https://chat.example.com/api/workspace/v1/messenger",
}));

describe("probeApiTransport", () => {
  beforeEach(() => {
    getCurrentInstance.mockReturnValue({ realm: "https://chat.example.com" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getCurrentInstance.mockReset();
  });

  it("returns true when no instance is configured", async () => {
    getCurrentInstance.mockReturnValue(null);
    await expect(probeApiTransport()).resolves.toBe(true);
  });

  it("returns true for sub-500 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false }));
    await expect(probeApiTransport()).resolves.toBe(true);
  });

  it("returns false for server errors and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 503, ok: false }));
    await expect(probeApiTransport()).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(probeApiTransport()).resolves.toBe(false);
  });
});
