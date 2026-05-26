import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLayoutConnectionRecovery } from "./layout-connection-recovery.hook";

const onTabResumeMock = vi.fn();
const onVisibilityChangeMock = vi.fn();
const onReconnectMock = vi.fn();
const requestReconnectMock = vi.fn();
const scheduleReconnectMock = vi.fn();

vi.mock("~/shared/lib/visibility", () => ({
  onTabResume: (...args: unknown[]) => onTabResumeMock(...args),
  onVisibilityChange: (...args: unknown[]) => onVisibilityChangeMock(...args),
}));

vi.mock("~/shared/lib/network", () => ({
  onReconnect: (...args: unknown[]) => onReconnectMock(...args),
}));

vi.mock("~/shared/lib/connection-health", () => ({
  requestReconnect: (...args: unknown[]) => requestReconnectMock(...args),
  getConnectionHealthSnapshot: () => ({ phase: "ready", failureReason: null }),
  subscribeConnectionHealth: () => () => {},
}));

vi.mock("./layout-reconnect-coordinator.lib", () => ({
  scheduleLayoutReconnectRefresh: (...args: unknown[]) => scheduleReconnectMock(...args),
}));

function Harness({
  currentUserStatus,
}: {
  currentUserStatus: "idle" | "ready" | "degraded" | "blocked";
}) {
  useLayoutConnectionRecovery({
    currentUserStatus,
    currentInstanceId: "inst-1",
    focusedMessageId: null,
  });
  return null;
}

describe("useLayoutConnectionRecovery", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not refresh before bootstrap has settled", () => {
    let resumeCb: ((hiddenDurationMs: number) => void) | undefined;
    onTabResumeMock.mockImplementation((cb: (hiddenDurationMs: number) => void) => {
      resumeCb = cb;
      return vi.fn();
    });
    onVisibilityChangeMock.mockReturnValue(vi.fn());
    onReconnectMock.mockReturnValue(vi.fn());

    render(<Harness currentUserStatus="idle" />);

    resumeCb?.(60_000);
    expect(scheduleReconnectMock).not.toHaveBeenCalled();
    expect(requestReconnectMock).not.toHaveBeenCalled();
  });

  it("schedules light refresh on tab resume after bootstrap settled", () => {
    let resumeCb: ((hiddenDurationMs: number) => void) | undefined;
    onTabResumeMock.mockImplementation((cb: (hiddenDurationMs: number) => void) => {
      resumeCb = cb;
      return vi.fn();
    });
    onVisibilityChangeMock.mockReturnValue(vi.fn());
    onReconnectMock.mockReturnValue(vi.fn());

    render(<Harness currentUserStatus="degraded" />);

    resumeCb?.(60_000);
    expect(scheduleReconnectMock).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: "inst-1" }),
      "light",
    );
    expect(requestReconnectMock).toHaveBeenCalled();
  });

  it("schedules full refresh on network reconnect", () => {
    let reconnectCb: (() => void) | undefined;
    onTabResumeMock.mockReturnValue(vi.fn());
    onVisibilityChangeMock.mockReturnValue(vi.fn());
    onReconnectMock.mockImplementation((cb: () => void) => {
      reconnectCb = cb;
      return vi.fn();
    });

    render(<Harness currentUserStatus="ready" />);

    reconnectCb?.();
    expect(scheduleReconnectMock).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: "inst-1" }),
      "full",
    );
  });
});
