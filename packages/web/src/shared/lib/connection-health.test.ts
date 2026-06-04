import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelScheduledReconnect,
  getConnectionHealthSnapshot,
  isLikelyNetworkError,
  noteApiTransportFailure,
  noteApiTransportSuccess,
  registerManualReconnectListener,
  reportFailure,
  initConnectionHealth,
  reportSuccess,
  requestReconnect,
  resetConnectionHealthForTests,
  scheduleReconnect,
  setConnectionPhase,
  subscribeConnectionHealth,
} from "./connection-health";
import { resetZulipRateLimitGateForTests } from "./zulip-rate-limit-gate";

const isOnlineMock = vi.fn();
const onStatusChangeMock = vi.fn();
const onReconnectMock = vi.fn();
const waitUntilZulipRateLimitReleasedMock = vi.fn();

vi.mock("./logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("./network", () => ({
  isOnline: () => isOnlineMock(),
  onStatusChange: (...args: unknown[]) => onStatusChangeMock(...args),
  onReconnect: (...args: unknown[]) => onReconnectMock(...args),
}));

vi.mock("./zulip-rate-limit-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./zulip-rate-limit-gate")>();
  return {
    ...actual,
    waitUntilZulipRateLimitReleased: (...args: unknown[]) =>
      waitUntilZulipRateLimitReleasedMock(...args),
    subscribeZulipRateLimitGate: () => () => {},
  };
});

const probeApiTransportMock = vi.fn();

vi.mock("./network-transport-probe.lib", () => ({
  probeApiTransport: (...args: unknown[]) => probeApiTransportMock(...args),
}));

describe("connection-health", () => {
  beforeEach(() => {
    resetConnectionHealthForTests();
    resetZulipRateLimitGateForTests();
    isOnlineMock.mockReturnValue(true);
    probeApiTransportMock.mockResolvedValue(true);
    waitUntilZulipRateLimitReleasedMock.mockResolvedValue(undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-14T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetConnectionHealthForTests();
    resetZulipRateLimitGateForTests();
  });

  it("reportSuccess clears failure metadata", () => {
    reportFailure({ reason: "network", phase: "degraded" });
    reportSuccess();
    expect(getConnectionHealthSnapshot()).toMatchObject({
      phase: "ready",
      lastFailureAt: null,
      failureReason: null,
      reconnectAttempt: 0,
      isReconnecting: false,
    });
  });

  it("reportFailure sets degraded phase and reason", () => {
    reportFailure({ reason: "server", phase: "degraded" });
    expect(getConnectionHealthSnapshot()).toMatchObject({
      phase: "degraded",
      failureReason: "server",
    });
    expect(getConnectionHealthSnapshot().lastFailureAt).toBe(Date.now());
  });

  it("scheduleReconnect retries with backoff until fn returns true", async () => {
    const fn = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    scheduleReconnect(fn, { immediate: true });

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.resolve();

    expect(fn).toHaveBeenCalledTimes(2);
    expect(getConnectionHealthSnapshot().phase).toBe("ready");
  });

  it("requestReconnect invokes manual listeners and reruns an active scheduled task", async () => {
    const fn = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const manual = vi.fn();

    registerManualReconnectListener(manual);
    scheduleReconnect(fn, { immediate: true });
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    expect(fn).toHaveBeenCalled();

    fn.mockClear();
    requestReconnect();
    expect(manual).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    expect(fn).toHaveBeenCalled();
  });

  it("cancelScheduledReconnect stops pending retries", async () => {
    const fn = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    scheduleReconnect(fn, { immediate: true });
    await Promise.resolve();
    cancelScheduledReconnect();
    fn.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("notifies subscribers on phase change", () => {
    const listener = vi.fn();
    subscribeConnectionHealth(listener);
    setConnectionPhase("ready");
    expect(listener).toHaveBeenCalled();
  });

  it("returns a stable snapshot reference until state changes", () => {
    const first = getConnectionHealthSnapshot();
    const second = getConnectionHealthSnapshot();
    expect(first).toBe(second);
    reportFailure({ reason: "network", phase: "degraded" });
    const third = getConnectionHealthSnapshot();
    expect(third).not.toBe(first);
  });

  it("isLikelyNetworkError detects fetch transport failures", () => {
    expect(isLikelyNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isLikelyNetworkError(new Error("HTTP 500"))).toBe(false);
  });

  it("noteApiTransportFailure marks degraded when browser still reports online", () => {
    reportSuccess();
    noteApiTransportFailure(new TypeError("Failed to fetch"));
    expect(getConnectionHealthSnapshot()).toMatchObject({
      phase: "degraded",
      failureReason: "network",
    });
  });

  it("noteApiTransportSuccess clears transport failure state", () => {
    noteApiTransportFailure(new TypeError("Failed to fetch"));
    noteApiTransportSuccess();
    expect(getConnectionHealthSnapshot()).toMatchObject({
      phase: "ready",
      failureReason: null,
    });
  });

  it("initConnectionHealth notifies subscribers when browser starts offline", () => {
    isOnlineMock.mockReturnValue(false);
    onStatusChangeMock.mockImplementation(() => () => {});
    onReconnectMock.mockImplementation(() => () => {});

    const listener = vi.fn();
    const unsub = subscribeConnectionHealth(listener);
    const cleanup = initConnectionHealth();

    expect(getConnectionHealthSnapshot().phase).toBe("offline");
    expect(listener).toHaveBeenCalled();

    unsub();
    cleanup();
    isOnlineMock.mockReturnValue(true);
  });

  it("clears failure UI after transport probe succeeds on browser online", async () => {
    const statusListenerHolder: { listener?: (online: boolean) => void } = {};
    onStatusChangeMock.mockImplementation((listener: (online: boolean) => void) => {
      statusListenerHolder.listener = listener;
      return () => {};
    });
    onReconnectMock.mockImplementation(() => () => {});

    const cleanup = initConnectionHealth();
    reportFailure({ reason: "network", phase: "degraded" });

    statusListenerHolder.listener?.(true);
    await Promise.resolve();

    expect(getConnectionHealthSnapshot()).toMatchObject({
      phase: "ready",
      failureReason: null,
      isReconnecting: false,
    });
    cleanup();
  });

  it("requestReconnect without showReconnecting does not set isReconnecting", () => {
    reportFailure({ reason: "network", phase: "degraded" });
    requestReconnect({ showReconnecting: false });
    expect(getConnectionHealthSnapshot().isReconnecting).toBe(false);
  });
});
