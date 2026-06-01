import { afterEach, describe, expect, it, vi } from "vitest";
import { startZulipEventLoop, startZulipEventLoopForCredentials } from "./event-loop";
import * as zulipEventQueueRegistry from "./zulip-event-queue-registry.lib";

const registerQueueMock = vi.fn();
const getEventsMock = vi.fn();
const registerQueueForCredentialsMock = vi.fn();
const getEventsForCredentialsMock = vi.fn();
const onReconnectMock = vi.fn();
const onStatusChangeMock = vi.fn();
const onTabResumeMock = vi.fn();
const waitForOnlineMock = vi.fn();
const isOnlineMock = vi.fn();

const unsubResumeMock = vi.fn();
const unsubReconnectMock = vi.fn();
const unsubStatusMock = vi.fn();

vi.mock("~/shared/api/zulip-queue", () => ({
  registerQueue: (...args: unknown[]) => registerQueueMock(...args),
  getEvents: (...args: unknown[]) => getEventsMock(...args),
  registerQueueForCredentials: (...args: unknown[]) => registerQueueForCredentialsMock(...args),
  getEventsForCredentials: (...args: unknown[]) => getEventsForCredentialsMock(...args),
}));

vi.mock("~/shared/lib/network", () => ({
  onReconnect: (...args: unknown[]) => onReconnectMock(...args),
  onStatusChange: (...args: unknown[]) => onStatusChangeMock(...args),
  waitForOnline: (...args: unknown[]) => waitForOnlineMock(...args),
  isOnline: (...args: unknown[]) => isOnlineMock(...args),
}));

vi.mock("~/shared/lib/visibility", () => ({
  onTabResume: (...args: unknown[]) => onTabResumeMock(...args),
}));

vi.mock("~/shared/lib/connection-health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/connection-health")>();
  return {
    ...actual,
    noteApiTransportFailure: vi.fn(),
    noteApiTransportSuccess: vi.fn(),
  };
});

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
    onStatusChangeMock.mockReturnValue(unsubStatusMock);
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
    expect(unsubStatusMock).toHaveBeenCalled();
  });

  it("publishes queue_id to the instance registry when instanceId is set", async () => {
    registerQueueMock.mockResolvedValue({
      queue_id: "q-registry",
      last_event_id: 0,
    });
    getEventsMock.mockImplementation(
      () =>
        new Promise(() => {
          /* keep loop alive */
        }),
    );
    onTabResumeMock.mockReturnValue(unsubResumeMock);
    onReconnectMock.mockReturnValue(unsubReconnectMock);
    onStatusChangeMock.mockReturnValue(unsubStatusMock);
    waitForOnlineMock.mockResolvedValue(undefined);
    isOnlineMock.mockReturnValue(true);

    const setQueueSpy = vi.spyOn(zulipEventQueueRegistry, "setZulipEventQueueId");
    const clearQueueSpy = vi.spyOn(zulipEventQueueRegistry, "clearZulipEventQueueId");

    const controller = new AbortController();
    startZulipEventLoop({
      instanceId: "inst-registry",
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(setQueueSpy).toHaveBeenCalledWith("inst-registry", "q-registry");
    });

    controller.abort();
    await Promise.resolve();

    expect(clearQueueSpy).toHaveBeenCalledWith("inst-registry");
    setQueueSpy.mockRestore();
    clearQueueSpy.mockRestore();
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
    onStatusChangeMock.mockReturnValue(unsubStatusMock);
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

    await vi.waitFor(() => {
      expect(registerQueueForCredentialsMock).toHaveBeenCalledWith(
        credentials,
        expect.arrayContaining(["stream", "subscription", "user_topic"]),
        undefined,
      );
    });
    await vi.waitFor(() => {
      expect(getEventsForCredentialsMock).toHaveBeenCalledWith(
        credentials,
        "q-cred",
        10,
        expect.any(Object),
      );
    });

    controller.abort();
    await Promise.resolve();
  });

  it("re-registers immediately on BAD_EVENT_QUEUE_ID with Russian error payload", async () => {
    const onQueueRegistered = vi.fn();
    registerQueueMock
      .mockResolvedValueOnce({ queue_id: "q-1", last_event_id: 0 })
      .mockResolvedValueOnce({ queue_id: "q-2", last_event_id: 3 });
    getEventsMock
      .mockResolvedValueOnce({
        result: "error",
        msg: "Недопустимый идентификатор очереди событий: q-1",
        queue_id: "q-1",
        code: "BAD_EVENT_QUEUE_ID",
      })
      .mockImplementation(
        () =>
          new Promise(() => {
            /* block after recovery so the loop does not spin */
          }),
      );

    onTabResumeMock.mockReturnValue(unsubResumeMock);
    onReconnectMock.mockReturnValue(unsubReconnectMock);
    onStatusChangeMock.mockReturnValue(unsubStatusMock);
    waitForOnlineMock.mockResolvedValue(undefined);
    isOnlineMock.mockReturnValue(true);

    const controller = new AbortController();
    startZulipEventLoop({
      signal: controller.signal,
      onEvent: vi.fn(),
      onQueueRegistered,
    });

    await vi.waitFor(() => {
      expect(registerQueueMock).toHaveBeenCalledTimes(2);
    });
    expect(onQueueRegistered).toHaveBeenLastCalledWith("q-2", expect.any(Object));

    controller.abort();
    await Promise.resolve();
  });

  it("re-registers on poll error response and on network failure", async () => {
    const onBadQueue = vi.fn();
    registerQueueMock
      .mockResolvedValueOnce({
        queue_id: "q-1",
        last_event_id: 0,
      })
      .mockResolvedValueOnce({
        queue_id: "q-2",
        last_event_id: 0,
      })
      .mockResolvedValueOnce({
        queue_id: "q-3",
        last_event_id: 0,
      });
    getEventsMock
      .mockResolvedValueOnce({
        result: "error",
        code: "BAD_EVENT_QUEUE_ID",
        msg: "expired",
      })
      .mockRejectedValueOnce(new Error("network blip"))
      .mockImplementation(
        () =>
          new Promise(() => {
            /* block after recovery so the loop does not spin */
          }),
      );

    onTabResumeMock.mockReturnValue(unsubResumeMock);
    onReconnectMock.mockReturnValue(unsubReconnectMock);
    onStatusChangeMock.mockReturnValue(unsubStatusMock);
    waitForOnlineMock.mockResolvedValue(undefined);
    isOnlineMock.mockReturnValue(true);

    const controller = new AbortController();
    startZulipEventLoop({
      signal: controller.signal,
      onEvent: vi.fn(),
      onBadQueue,
    });

    await vi.waitFor(() => {
      expect(registerQueueMock).toHaveBeenCalledTimes(3);
    });
    expect(onBadQueue).toHaveBeenCalledTimes(2);
    expect(getEventsMock).toHaveBeenCalledWith(
      "q-1",
      0,
      expect.objectContaining({ timeoutSec: expect.any(Number) }),
    );

    controller.abort();
    await Promise.resolve();
  });

  it("aborts long-poll on offline and re-registers promptly when online returns", async () => {
    let statusCb: ((online: boolean) => void) | undefined;
    onTabResumeMock.mockReturnValue(unsubResumeMock);
    onReconnectMock.mockReturnValue(unsubReconnectMock);
    onStatusChangeMock.mockImplementation((cb: (online: boolean) => void) => {
      statusCb = cb;
      return unsubStatusMock;
    });
    waitForOnlineMock.mockResolvedValue(undefined);

    registerQueueMock
      .mockResolvedValueOnce({ queue_id: "q-1", last_event_id: 0 })
      .mockResolvedValueOnce({ queue_id: "q-2", last_event_id: 0 });
    getEventsMock
      .mockImplementationOnce(
        (_queueId: string, _lastEventId: number, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      )
      .mockImplementation(
        () =>
          new Promise(() => {
            /* block after recovery */
          }),
      );

    isOnlineMock.mockReturnValue(true);

    const controller = new AbortController();
    startZulipEventLoop({
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(registerQueueMock).toHaveBeenCalledTimes(1);
      expect(getEventsMock).toHaveBeenCalledTimes(1);
    });

    isOnlineMock.mockReturnValue(false);
    statusCb?.(false);

    isOnlineMock.mockReturnValue(true);
    statusCb?.(true);

    await vi.waitFor(() => {
      expect(registerQueueMock).toHaveBeenCalledTimes(2);
    });
    expect(getEventsMock).toHaveBeenCalledTimes(2);

    controller.abort();
    await Promise.resolve();
  });

  it("continues polling after long-poll abort and re-registers on network reconnect", async () => {
    let reconnectCb: (() => void) | undefined;
    onReconnectMock.mockImplementation((cb: () => void) => {
      reconnectCb = cb;
      return unsubReconnectMock;
    });

    registerQueueMock
      .mockResolvedValueOnce({ queue_id: "q-1", last_event_id: 0 })
      .mockResolvedValueOnce({ queue_id: "q-2", last_event_id: 0 });
    getEventsMock
      .mockImplementationOnce(
        (_queueId: string, _lastEventId: number, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      )
      .mockImplementation(
        () =>
          new Promise(() => {
            /* block after recovery */
          }),
      );

    const controller = new AbortController();
    startZulipEventLoop({
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(registerQueueMock).toHaveBeenCalledTimes(1);
      expect(getEventsMock).toHaveBeenCalledTimes(1);
    });

    reconnectCb?.();

    await vi.waitFor(() => {
      expect(registerQueueMock).toHaveBeenCalledTimes(2);
    });
    expect(getEventsMock).toHaveBeenCalledTimes(2);
    expect(getEventsMock).toHaveBeenLastCalledWith(
      "q-2",
      0,
      expect.objectContaining({ timeoutSec: expect.any(Number) }),
    );

    controller.abort();
    await Promise.resolve();
  });

  it("re-registers quickly after transport error without stacking long backoff", async () => {
    registerQueueMock
      .mockResolvedValueOnce({ queue_id: "q-1", last_event_id: 0 })
      .mockResolvedValueOnce({ queue_id: "q-2", last_event_id: 0 });
    getEventsMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockImplementation(
      () =>
        new Promise(() => {
          /* block after recovery */
        }),
    );

    onTabResumeMock.mockReturnValue(unsubResumeMock);
    onReconnectMock.mockReturnValue(unsubReconnectMock);
    onStatusChangeMock.mockReturnValue(unsubStatusMock);
    waitForOnlineMock.mockResolvedValue(undefined);
    isOnlineMock.mockReturnValue(true);

    const controller = new AbortController();
    startZulipEventLoop({
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(registerQueueMock).toHaveBeenCalledTimes(2);
    });
    expect(getEventsMock).toHaveBeenCalledTimes(2);

    controller.abort();
    await Promise.resolve();
  });
});
