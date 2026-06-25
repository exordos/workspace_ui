import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeWorkspaceEventModel,
  normalizeWorkspaceRealtimeEvent,
  startMessengerEventLoop,
  startMessengerEventLoopForCredentials,
} from "./event-loop";

const messengerApiMock = vi.hoisted(() => ({
  getWithBase: vi.fn(),
}));
const getCurrentInstanceMock = vi.hoisted(() => vi.fn());
const getMessengerGatewayApiBaseForCurrentInstanceMock = vi.hoisted(() => vi.fn());
const attachEventLoopLifecycleMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const isOnlineMock = vi.hoisted(() => vi.fn(() => true));
const onStatusChangeMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const recordDiagnosticRealtimeEventMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/client", () => ({
  getCurrentInstance: getCurrentInstanceMock,
  getMessengerGatewayApiBaseForCurrentInstance: getMessengerGatewayApiBaseForCurrentInstanceMock,
  messengerApi: messengerApiMock,
}));

vi.mock("~/shared/lib/event-loop-lifecycle.lib", () => ({
  attachEventLoopLifecycle: attachEventLoopLifecycleMock,
}));

vi.mock("~/shared/lib/network", () => ({
  isOnline: isOnlineMock,
  onStatusChange: onStatusChangeMock,
}));

vi.mock("~/shared/lib/diagnostics-realtime.lib", () => ({
  recordDiagnosticRealtimeEvent: recordDiagnosticRealtimeEventMock,
}));

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logEvent: vi.fn(),
}));

const USER_UUID = "00000000-0000-4000-8000-000000000001";
const OTHER_UUID = "00000000-0000-4000-8000-000000000002";
const MESSAGE_UUID = "00000000-0000-4000-8000-000000000101";
const STREAM_UUID = "00000000-0000-4000-8000-000000000201";
const TOPIC_UUID = "00000000-0000-4000-8000-000000000301";

class FakeWebSocket {
  static readonly instances: FakeWebSocket[] = [];

  readonly send = vi.fn();
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 1;

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.());
  }

  close(code = 1000, reason = ""): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code === 1000 } as CloseEvent);
  }

  emit(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
}

function workspaceEvent(epochVersion: number, authorUuid = OTHER_UUID): unknown {
  return {
    epoch_version: epochVersion,
    uuid: `00000000-0000-4000-8000-${String(epochVersion).padStart(12, "0")}`,
    project_id: "00000000-0000-4000-8000-000000000901",
    user_uuid: USER_UUID,
    payload: {
      kind: "message.created",
      uuid: MESSAGE_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      author_uuid: authorUuid,
      payload: { kind: "markdown", content: "hello over epochs" },
      created_at: "2026-06-24T10:20:30Z",
    },
  };
}

function apiResponse(data: unknown): unknown {
  return {
    ok: true,
    status: 200,
    data,
    headers: new Headers(),
    raw: new Response(),
    durationMs: 1,
  };
}

describe("Workspace realtime event normalization", () => {
  it("maps REST message.created events to messenger message events", () => {
    const normalized = normalizeWorkspaceEventModel(workspaceEvent(12, USER_UUID));

    expect(normalized?.epochVersion).toBe(12);
    expect(normalized?.event).toMatchObject({ id: 12, type: "message" });
    expect(normalized?.event?.message).toMatchObject({
      id: MESSAGE_UUID,
      source_message_uuid: MESSAGE_UUID,
      author_uuid: USER_UUID,
      sender_uuid: USER_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      content: "hello over epochs",
      markdown_source: "hello over epochs",
      timestamp: 1782296430,
      type: "stream",
      is_own: true,
      read: true,
      pinned: false,
      starred: false,
      flags: ["read"],
      reactions: [],
    });
  });

  it("maps WS message frames and derives own/read from hello user uuid", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 13,
        type: "message",
        message: {
          id: MESSAGE_UUID,
          author_uuid: USER_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
          content: "live hello",
          timestamp: 1234567890,
          type: "stream",
        },
      },
      USER_UUID,
    );

    expect(normalized?.event?.message).toMatchObject({
      id: MESSAGE_UUID,
      is_own: true,
      read: true,
      subject: TOPIC_UUID,
      flags: ["read"],
    });
  });

  it("maps backend WS message frames with nested markdown payload", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 15,
        type: "message",
        message: {
          uuid: MESSAGE_UUID,
          author_uuid: OTHER_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
          payload: { kind: "markdown", content: "nested live hello" },
          created_at: "2026-06-24T10:20:30Z",
          is_own: false,
          read: false,
          pinned: true,
          starred: true,
        },
      },
      USER_UUID,
    );

    expect(normalized?.event?.message).toMatchObject({
      id: MESSAGE_UUID,
      source_message_uuid: MESSAGE_UUID,
      content: "nested live hello",
      markdown_source: "nested live hello",
      timestamp: 1782296430,
      is_own: false,
      read: false,
      pinned: true,
      starred: true,
      subject: TOPIC_UUID,
      flags: [],
    });
  });

  it("skips unknown REST event kinds without dropping their epoch", () => {
    const normalized = normalizeWorkspaceEventModel({
      epoch_version: 14,
      payload: { kind: "something.else" },
    });

    expect(normalized).toEqual({
      epochVersion: 14,
      event: null,
      skipReason: "unsupported payload kind: something.else",
    });
  });
});

describe("startMessengerEventLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances.length = 0;
    vi.stubGlobal("WebSocket", FakeWebSocket);
    localStorage.removeItem("workspace-realtime:last-epoch:v1:inst-1");
    localStorage.removeItem("workspace-realtime:last-epoch:v1:inst-bg");
    messengerApiMock.getWithBase.mockReset();
    getCurrentInstanceMock.mockReturnValue({
      id: "inst-1",
      realm: "https://workspace.example.test",
      login: "admin",
      authType: "iam",
      iamAccessToken: "access-token",
    });
    getMessengerGatewayApiBaseForCurrentInstanceMock.mockReturnValue("/api/messenger/v1");
    messengerApiMock.getWithBase.mockResolvedValue(apiResponse([workspaceEvent(12)]));
    attachEventLoopLifecycleMock.mockClear();
    recordDiagnosticRealtimeEventMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("runs REST catch-up, opens WS with bearer subprotocol, handles live events, and stores cursor", async () => {
    const controller = new AbortController();
    const onEvent = vi.fn();
    const onQueueReady = vi.fn();

    startMessengerEventLoop({
      instanceId: "inst-1",
      signal: controller.signal,
      onEvent,
      onQueueReady,
    });

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    expect(messengerApiMock.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/events/",
      { "epoch_version>": "0", page_limit: "500" },
      controller.signal,
    );
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 12, type: "message" }));

    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe("wss://workspace.example.test/api/messenger/ws?last_epoch_version=12");
    expect(ws.protocols).toEqual(["workspace.events.v1", "bearer.access-token"]);

    ws.emit({ type: "hello", user_uuid: USER_UUID, project_id: "project", epoch_version: 12 });
    expect(onQueueReady).toHaveBeenCalledTimes(1);

    ws.emit({
      type: "event",
      event: {
        epoch_version: 13,
        type: "message",
        message: {
          id: "00000000-0000-4000-8000-000000000102",
          author_uuid: OTHER_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
          content: "live message",
          timestamp: 1234567890,
          type: "stream",
        },
      },
    });

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 13, type: "message" }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ack", epoch_version: 13 }));
    expect(localStorage.getItem("workspace-realtime:last-epoch:v1:inst-1")).toBe("13");
    expect(recordDiagnosticRealtimeEventMock).toHaveBeenCalledWith("message");

    controller.abort();
  });

  it("responds to realtime ping frames with pong", async () => {
    const controller = new AbortController();

    startMessengerEventLoop({
      instanceId: "inst-1",
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    const ws = FakeWebSocket.instances[0]!;
    ws.emit({ type: "ping", ts: "2026-06-18T10:10:25Z" });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "pong", ts: "2026-06-18T10:10:25Z" }),
    );

    controller.abort();
  });

  it("does not start when explicitly disabled", () => {
    startMessengerEventLoop({ enabled: false, onEvent: vi.fn() });

    expect(messengerApiMock.getWithBase).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("starts the credential-based background transport", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    startMessengerEventLoopForCredentials({
      credentials: {
        realm: "https://workspace.example.test",
        login: "admin",
        accessToken: "background-token",
      },
      instanceId: "inst-bg",
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://workspace.example.test/api/messenger/v1/events/?epoch_version%3E=0&page_limit=500",
      expect.objectContaining({ headers: { Authorization: "Bearer background-token" } }),
    );
    expect(FakeWebSocket.instances[0]!.url).toBe(
      "wss://workspace.example.test/api/messenger/ws?last_epoch_version=0",
    );

    controller.abort();
  });
});
