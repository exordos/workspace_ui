import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZulipInstance } from "~/entities/instance/instance.model";
import { startInactiveInstanceEventStreams } from "./layout-multi-org-event-streams.lib";
import type { StartCredentialEventLoopFn } from "./layout-multi-org-event-streams.types";

const INSTANCES: ZulipInstance[] = [
  { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
  { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
  { id: "inst-3", realm: "https://c.example.com", email: "c@example.com", apiKey: "k3" },
];

describe("startInactiveInstanceEventStreams", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts loops only for inactive instances and stops all on cleanup", () => {
    const stopOne = vi.fn();
    const stopTwo = vi.fn();
    const startLoop = vi
      .fn<StartCredentialEventLoopFn>()
      .mockReturnValueOnce(stopOne)
      .mockReturnValueOnce(stopTwo);

    const stop = startInactiveInstanceEventStreams({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      refreshUnreadForInstance: vi.fn(),
      startEventLoop: startLoop,
    });

    expect(startLoop).toHaveBeenCalledTimes(2);
    expect(startLoop.mock.calls[0]?.[0].credentials).toMatchObject({
      realm: "https://b.example.com",
    });
    expect(startLoop.mock.calls[1]?.[0].credentials).toMatchObject({
      realm: "https://c.example.com",
    });

    stop();
    expect(stopOne).toHaveBeenCalledTimes(1);
    expect(stopTwo).toHaveBeenCalledTimes(1);
  });

  it("debounces unread refresh for event bursts", async () => {
    const startLoop = vi.fn<StartCredentialEventLoopFn>();
    const refreshUnreadForInstance = vi.fn().mockResolvedValue(undefined);
    const loops: Parameters<StartCredentialEventLoopFn>[0][] = [];

    startLoop.mockImplementation((options) => {
      loops.push(options);
      return () => {};
    });

    const stop = startInactiveInstanceEventStreams({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      debounceMs: 100,
      refreshUnreadForInstance,
      startEventLoop: startLoop,
    });

    expect(loops).toHaveLength(2);
    const first = loops[0]!;
    first.onEvent({ id: 1, type: "message" });
    first.onEvent({ id: 2, type: "message" });
    first.onEvent({ id: 3, type: "update_message_flags" });

    await vi.advanceTimersByTimeAsync(99);
    expect(refreshUnreadForInstance).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refreshUnreadForInstance).toHaveBeenCalledTimes(1);
    expect(refreshUnreadForInstance).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inst-2" }),
    );

    first.onEvent({ id: 4, type: "presence" });
    await vi.advanceTimersByTimeAsync(200);
    expect(refreshUnreadForInstance).toHaveBeenCalledTimes(1);

    stop();
  });

  it("cancels pending refresh timers on cleanup", async () => {
    const loops: Parameters<StartCredentialEventLoopFn>[0][] = [];
    const startLoop = vi.fn<StartCredentialEventLoopFn>().mockImplementation((options) => {
      loops.push(options);
      return () => {};
    });
    const refreshUnreadForInstance = vi.fn().mockResolvedValue(undefined);

    const stop = startInactiveInstanceEventStreams({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      debounceMs: 100,
      refreshUnreadForInstance,
      startEventLoop: startLoop,
    });

    loops[0]!.onBadQueue?.();
    stop();

    await vi.advanceTimersByTimeAsync(200);
    expect(refreshUnreadForInstance).not.toHaveBeenCalled();
  });
});
