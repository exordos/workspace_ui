import { afterEach, describe, expect, it, vi } from "vitest";
import { startZulipEventLoop, startZulipEventLoopForCredentials } from "./event-loop";

const registerQueueMock = vi.fn();
const getEventsMock = vi.fn();
const registerQueueForCredentialsMock = vi.fn();
const getEventsForCredentialsMock = vi.fn();
const onReconnectMock = vi.fn();
const onTabResumeMock = vi.fn();
const waitForOnlineMock = vi.fn();
const isOnlineMock = vi.fn();

const unsubResumeMock = vi.fn();
const unsubReconnectMock = vi.fn();

vi.mock("~/shared/api/zulip-queue", () => ({
  registerQueue: (...args: unknown[]) => registerQueueMock(...args),
  getEvents: (...args: unknown[]) => getEventsMock(...args),
  registerQueueForCredentials: (...args: unknown[]) => registerQueueForCredentialsMock(...args),
  getEventsForCredentials: (...args: unknown[]) => getEventsForCredentialsMock(...args),
}));

vi.mock("~/shared/lib/network", () => ({
  onReconnect: (...args: unknown[]) => onReconnectMock(...args),
  waitForOnline: (...args: unknown[]) => waitForOnlineMock(...args),
  isOnline: (...args: unknown[]) => isOnlineMock(...args),
}));

vi.mock("~/shared/lib/visibility", () => ({
  onTabResume: (...args: unknown[]) => onTabResumeMock(...args),
}));

describe("startZulipEventLoop", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("removes abort listener and unsubscribes lifecycle hooks on abort", async () => {
    registerQueueMock.mockResolvedValue({
      queue_id: "q-1",
      last_event_id: 0,
    });
    getEventsMock.mockImplementation(
      (_queueId: string, _lastEventId: number, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("The operation was aborted")),
            { once: true },
          );
        }),
    );

    onTabResumeMock.mockReturnValue(unsubResumeMock);
    onReconnectMock.mockReturnValue(unsubReconnectMock);
    waitForOnlineMock.mockResolvedValue(undefined);
    isOnlineMock.mockReturnValue(true);

    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    startZulipEventLoop({
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    await Promise.resolve();

    const addedAbortCall = addSpy.mock.calls.find((call) => call[0] === "abort");
    expect(addedAbortCall).toBeDefined();
    const addedHandler = addedAbortCall?.[1] as EventListener;
    expect(addedHandler).toBeDefined();

    controller.abort();
    await Promise.resolve();

    expect(removeSpy).toHaveBeenCalledWith("abort", addedHandler);
    expect(unsubResumeMock).toHaveBeenCalled();
    expect(unsubReconnectMock).toHaveBeenCalled();
  });

  it("starts credential-based event loop for background orgs", async () => {
    registerQueueForCredentialsMock.mockResolvedValue({
      queue_id: "q-cred",
      last_event_id: 10,
    });
    getEventsForCredentialsMock.mockImplementation(
      (
        _credentials: { realm: string; email: string; apiKey: string },
        _queueId: string,
        _lastEventId: number,
        options?: { signal?: AbortSignal },
      ) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("The operation was aborted")),
            { once: true },
          );
        }),
    );

    onTabResumeMock.mockReturnValue(unsubResumeMock);
    onReconnectMock.mockReturnValue(unsubReconnectMock);
    waitForOnlineMock.mockResolvedValue(undefined);
    isOnlineMock.mockReturnValue(true);

    const controller = new AbortController();
    const credentials = {
      realm: "https://org-2.example.com",
      email: "org-2@example.com",
      apiKey: "k2",
    };

    startZulipEventLoopForCredentials({
      credentials,
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    await Promise.resolve();

    expect(registerQueueForCredentialsMock).toHaveBeenCalledWith(
      credentials,
      expect.any(Array),
      undefined,
    );
    expect(getEventsForCredentialsMock).toHaveBeenCalledWith(
      credentials,
      "q-cred",
      10,
      expect.any(Object),
    );

    controller.abort();
    await Promise.resolve();
  });
});
