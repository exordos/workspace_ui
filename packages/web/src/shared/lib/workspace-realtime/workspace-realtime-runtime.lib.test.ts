import { describe, expect, it, vi } from "vitest";
import { MessengerApiError } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerEventDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerRawEventDto,
  WorkspaceMessengerRealtimeEventDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import type { WorkspaceCollectionPage } from "~/shared/api/workspace-client";
import { createWorkspaceRealtimeCursorStorage } from "./workspace-realtime-cursor.lib";
import { createWorkspaceRealtimeTransportCore } from "./workspace-realtime-runtime.lib";
import type {
  WorkspaceRealtimeCursorOwner,
  WorkspaceRealtimeCursorStorageLike,
} from "./workspace-realtime-cursor.lib";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeRuntimeContext,
  WorkspaceRealtimeRuntimeOwner,
  WorkspaceRealtimeSkipReason,
  WorkspaceRealtimeWebSocketLike,
  WorkspaceRealtimeWebSocketMessageEvent,
} from "./workspace-realtime-runtime.lib";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const USER_B_UUID = "33333333-3333-4333-8333-333333333333";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const EVENT_UUID = "0cb14b5a-6bf0-4de2-bdb5-4e98df4044e0";
const DATE = "2026-06-30T10:10:00Z";
const EPOCH_GENERATION = "generation-a";

function cursor(epochVersion: number) {
  return { epochGeneration: EPOCH_GENERATION, epochVersion };
}

function epoch(epochVersion: number, epochGeneration = EPOCH_GENERATION) {
  return {
    epoch_version: epochVersion,
    epoch_generation: epochGeneration,
    current_epoch_version: epochVersion,
    minimum_epoch_version: 1,
  };
}

class MemoryStorage implements WorkspaceRealtimeCursorStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class FakeWebSocket implements WorkspaceRealtimeWebSocketLike {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: WorkspaceRealtimeWebSocketMessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  closed = false;
  readonly sent: string[] = [];
  readonly url: string;
  readonly protocols: string[];

  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
  }

  open(): void {
    this.onopen?.(new Event("open"));
  }

  message(data: unknown): void {
    this.onmessage?.({ data });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.closed = true;
    this.onclose?.(new Event("close"));
  }

  networkClose(code?: number): void {
    this.closed = true;
    this.onclose?.({ code: code ?? 1006 } as CloseEvent);
  }
}

const owner: WorkspaceRealtimeRuntimeOwner = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "org-a",
  projectId: PROJECT_UUID,
  userUuid: USER_UUID,
  runtimeGeneration: 1,
};

const cursorOwner: WorkspaceRealtimeCursorOwner = owner;

const context: WorkspaceRealtimeRuntimeContext = {
  owner,
  ownerKey: "owner-key-a",
  surface: "active",
};

const messageDto: WorkspaceMessengerMessageDto = {
  uuid: MESSAGE_UUID,
  project_id: PROJECT_UUID,
  stream_uuid: STREAM_UUID,
  topic_uuid: TOPIC_UUID,
  author_uuid: USER_B_UUID,
  payload: {
    kind: "markdown",
    content: "Hello, workspace",
  },
  user_uuid: USER_UUID,
  read: false,
  pinned: false,
  starred: false,
  is_own: false,
  reactions: {},
  reaction_users: {},
  created_at: DATE,
  updated_at: DATE,
};

function createEvent(epochVersion: number): WorkspaceRealtimeEvent {
  return {
    epoch_version: epochVersion,
    type: "message",
    message: {
      ...messageDto,
      uuid: `${MESSAGE_UUID.slice(0, -1)}${epochVersion % 10}`,
    },
  };
}

function createRestEventDto(epochVersion: number): WorkspaceMessengerEventDto {
  return {
    schema_version: 1,
    epoch_version: epochVersion,
    uuid: EVENT_UUID,
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: "message",
    action: "created",
    payload: {
      kind: "message.created",
      ...messageDto,
    },
    created_at: DATE,
    updated_at: DATE,
  };
}

function createRawEventDto(epochVersion: number): WorkspaceMessengerRawEventDto {
  return {
    schema_version: 2,
    epoch_version: epochVersion,
    uuid: EVENT_UUID,
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: "workspace_widget",
    action: "refreshed",
    payload: {
      kind: "workspace_widget.refreshed",
      uuid: "bb2ac71e-85ed-45d6-87da-89f9f0bcc523",
    },
    created_at: DATE,
    updated_at: DATE,
  };
}

function createPage(
  items: WorkspaceMessengerRealtimeEventDto[],
): WorkspaceCollectionPage<WorkspaceMessengerRealtimeEventDto> {
  return {
    items,
    nextPageMarker: null,
    pageLimit: 100,
  };
}

function createApplier() {
  const appliedEpochs: number[] = [];
  const skippedEvents: { epochVersion: number; reason: WorkspaceRealtimeSkipReason }[] = [];
  const states: string[] = [];
  const applier: WorkspaceRealtimeEventApplier = {
    applyEvent: vi.fn((event: WorkspaceRealtimeEvent) => {
      appliedEpochs.push(event.epoch_version);
    }),
    skipEvent: vi.fn((event, reason) => {
      skippedEvents.push({ epochVersion: event.epoch_version, reason });
    }),
    onTransportStateChange: vi.fn((state) => {
      states.push(state.mode);
    }),
  };

  return { applier, appliedEpochs, skippedEvents, states };
}

async function flushAsyncHandlers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("workspace-realtime transport runtime", () => {
  it("runs catch-up before opening the websocket", async () => {
    const order: string[] = [];
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEpoch: () => {
        order.push("epoch");
        return Promise.resolve({
          epoch_version: 10,
          epoch_generation: EPOCH_GENERATION,
          current_epoch_version: 10,
          minimum_epoch_version: 1,
        });
      },
      getEventsPage: () => {
        order.push("catch-up");
        return Promise.resolve(createPage([]));
      },
      webSocketBaseUrl: "https://workspace.example.test/",
      webSocketFactory: (url, protocols) => {
        order.push("connect");
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);

    expect(order).toEqual(["epoch", "catch-up", "connect"]);
    expect(sockets[0]?.url).toBe(
      "wss://workspace.example.test/api/workspace/v1/events/ws?last_epoch_version=10&epoch_generation=generation-a",
    );
    expect(sockets[0]?.protocols).toEqual(["workspace.events.v1", "bearer.access-token"]);
  });

  it("applies a websocket event and advances cursor", async () => {
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier, appliedEpochs } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(JSON.stringify(createRestEventDto(11)));
    await flushAsyncHandlers();

    expect(appliedEpochs).toEqual([11]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(11));
    expect(sockets[0]?.sent).toEqual([]);
  });

  it("keeps notification effects disabled until websocket ready", async () => {
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const notificationFlags: boolean[] = [];
    const applier: WorkspaceRealtimeEventApplier = {
      applyEvent: (_event, eventContext) => {
        notificationFlags.push(eventContext.notificationsEnabled === true);
      },
      skipEvent: () => undefined,
      onTransportStateChange: () => undefined,
    };
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(JSON.stringify(createRestEventDto(11)));
    await flushAsyncHandlers();
    sockets[0]?.message(
      JSON.stringify({ type: "ready", epoch_generation: EPOCH_GENERATION, epoch_version: 11 }),
    );
    await flushAsyncHandlers();
    sockets[0]?.message(JSON.stringify(createRestEventDto(12)));
    for (let index = 0; index < 12; index += 1) {
      await Promise.resolve();
    }

    expect(notificationFlags).toEqual([false, true]);
  });

  it("clears the cursor and snapshots before retrying a pruned REST cursor", async () => {
    vi.useFakeTimers();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const resetAuthoritativeSnapshots = vi.fn(() => Promise.resolve());
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () =>
        Promise.reject(
          new MessengerApiError("cursor expired", 410, {
            type: "EventsCursorExpiredError",
            code: 410,
            error: "epoch_pruned",
            message: "The saved events cursor is outside the retained event journal",
            reason: "epoch_pruned",
            epoch_generation: EPOCH_GENERATION,
            current_epoch_version: 20,
            minimum_epoch_version: 11,
          }),
        ),
      resetAuthoritativeSnapshots,
      reconnectDelayMs: () => 10,
    });

    await runtime.start(context);

    expect(cursorStorage.read(cursorOwner)).toBeNull();
    expect(resetAuthoritativeSnapshots).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ error: "epoch_pruned", epoch_generation: EPOCH_GENERATION }),
    );
    await runtime.stop();
    vi.useRealTimers();
  });

  it("treats websocket close 4410 as the same cursor reset boundary", async () => {
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const resetAuthoritativeSnapshots = vi.fn(() => Promise.resolve());
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      resetAuthoritativeSnapshots,
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.networkClose(4410);
    await flushAsyncHandlers();

    expect(cursorStorage.read(cursorOwner)).toBeNull();
    expect(resetAuthoritativeSnapshots).toHaveBeenCalledOnce();
  });

  it("serializes websocket frames before applying the next epoch", async () => {
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const appliedEpochs: number[] = [];
    let releaseFirstEvent = (): void => {
      throw new Error("First event was not started");
    };
    const applier: WorkspaceRealtimeEventApplier = {
      applyEvent: vi.fn((event: WorkspaceRealtimeEvent) => {
        if (event.epoch_version === 11) {
          return new Promise<void>((resolve) => {
            releaseFirstEvent = () => {
              appliedEpochs.push(event.epoch_version);
              resolve();
            };
          });
        }
        appliedEpochs.push(event.epoch_version);
      }),
      skipEvent: vi.fn(),
      onTransportStateChange: vi.fn(),
    };
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(JSON.stringify(createRestEventDto(11)));
    sockets[0]?.message(JSON.stringify(createRestEventDto(12)));
    await flushAsyncHandlers();

    expect(appliedEpochs).toEqual([]);
    releaseFirstEvent();
    for (let index = 0; index < 12; index += 1) {
      await Promise.resolve();
    }

    expect(appliedEpochs).toEqual([11, 12]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(12));
  });

  it("opens the notification gate only after the ready frame", async () => {
    const sockets: FakeWebSocket[] = [];
    const diagnostics: string[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier, appliedEpochs, skippedEvents } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
      onDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic.reason);
      },
    });

    await runtime.start(context);
    sockets[0]?.message(
      JSON.stringify({ type: "ready", epoch_generation: EPOCH_GENERATION, epoch_version: 10 }),
    );
    await flushAsyncHandlers();

    expect(sockets[0]?.sent).toEqual([]);
    expect(appliedEpochs).toEqual([]);
    expect(skippedEvents).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(10));
  });

  it("checks the server epoch again after a full idle timeout when it is current", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const getEpoch = vi.fn(() => Promise.resolve(epoch(10)));
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEpoch,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getEpoch).not.toHaveBeenCalled();

    sockets[0]?.message(
      JSON.stringify({ type: "ready", epoch_generation: EPOCH_GENERATION, epoch_version: 10 }),
    );
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(getEpoch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(getEpoch).toHaveBeenCalledTimes(1);
    await flushAsyncHandlers();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(getEpoch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getEpoch).toHaveBeenCalledTimes(2);
    await flushAsyncHandlers();
    expect(vi.getTimerCount()).toBe(1);
    await runtime.stop();
    vi.useRealTimers();
  });

  it("does not reconnect when websocket catches up during the epoch grace period", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEpoch: () => Promise.resolve(epoch(11)),
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(
      JSON.stringify({ type: "ready", epoch_generation: EPOCH_GENERATION, epoch_version: 10 }),
    );
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(2_999);
    sockets[0]?.message(JSON.stringify(createRestEventDto(11)));
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(1);

    expect(sockets).toHaveLength(1);
    await runtime.stop();
    vi.useRealTimers();
  });

  it("reconnects through the normal path when the epoch lag persists", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEpoch: () => Promise.resolve(epoch(11)),
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(
      JSON.stringify({ type: "ready", epoch_generation: EPOCH_GENERATION, epoch_version: 10 }),
    );
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(63_000);

    expect(sockets).toHaveLength(2);
    expect(sockets[0]?.closed).toBe(true);
    await runtime.stop();
    vi.useRealTimers();
  });

  it("replays this tab's missing events when another tab advances the durable cursor", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier, appliedEpochs } = createApplier();
    let eventsAvailable = false;
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEpoch: () => Promise.resolve(epoch(12)),
      getEventsPage: (_options, query) =>
        Promise.resolve(
          createPage(
            eventsAvailable && query.afterEpochVersion === 10
              ? [createRestEventDto(11), createRestEventDto(12)]
              : [],
          ),
        ),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(
      JSON.stringify({ type: "ready", epoch_generation: EPOCH_GENERATION, epoch_version: 10 }),
    );
    await flushAsyncHandlers();

    // Browser tabs share localStorage, but this runtime has not received epochs 11 and 12.
    eventsAvailable = true;
    cursorStorage.write(cursorOwner, cursor(12));
    await vi.advanceTimersByTimeAsync(63_000);
    await flushAsyncHandlers();

    expect(sockets).toHaveLength(2);
    expect(sockets[0]?.closed).toBe(true);
    expect(appliedEpochs).toEqual([11, 12]);
    expect(sockets[1]?.url).toContain("last_epoch_version=12");
    await runtime.stop();
    vi.useRealTimers();
  });

  it("uses cursor expiry recovery when the checked epoch generation changes", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const resetAuthoritativeSnapshots = vi.fn(() => Promise.resolve());
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEpoch: () => Promise.resolve(epoch(11, "generation-b")),
      getEventsPage: () => Promise.resolve(createPage([])),
      resetAuthoritativeSnapshots,
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(
      JSON.stringify({ type: "ready", epoch_generation: EPOCH_GENERATION, epoch_version: 10 }),
    );
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(cursorStorage.read(cursorOwner)).toBeNull();
    expect(resetAuthoritativeSnapshots).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        reason: "epoch_generation_changed",
        epoch_generation: "generation-b",
      }),
    );
    await runtime.stop();
    vi.useRealTimers();
  });

  it("only reports an epoch request failure and keeps the socket open", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const diagnostics: string[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEpoch: () => Promise.reject(new Error("request failed")),
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
      onDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic.reason);
      },
    });

    await runtime.start(context);
    sockets[0]?.message(
      JSON.stringify({ type: "ready", epoch_generation: EPOCH_GENERATION, epoch_version: 10 }),
    );
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.closed).toBe(false);
    expect(diagnostics).toContain("epoch_check_failed");
    await runtime.stop();
    vi.useRealTimers();
  });

  it("ignores an epoch response that resolves after runtime stop", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    let resolveEpoch = (): void => {
      throw new Error("Epoch request was not started");
    };
    const getEpoch = vi.fn(
      () =>
        new Promise<ReturnType<typeof epoch>>((resolve) => {
          resolveEpoch = () => resolve(epoch(11));
        }),
    );
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEpoch,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(
      JSON.stringify({ type: "ready", epoch_generation: EPOCH_GENERATION, epoch_version: 10 }),
    );
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getEpoch).toHaveBeenCalledTimes(1);

    await runtime.stop();
    resolveEpoch();
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.closed).toBe(true);
    vi.useRealTimers();
  });

  it("skips duplicate or old websocket events without rolling cursor back", async () => {
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(12));
    const { applier, appliedEpochs, skippedEvents } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(JSON.stringify(createRestEventDto(11)));
    await flushAsyncHandlers();

    expect(appliedEpochs).toEqual([]);
    expect(skippedEvents).toEqual([{ epochVersion: 11, reason: "duplicate_epoch" }]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(12));
    expect(sockets[0]?.sent).toEqual([]);
  });

  it("rejects invalid websocket control frames without advancing cursor", async () => {
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier, skippedEvents } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.message(
      JSON.stringify({
        type: "error",
        code: "backend_error",
        message: "Bad event",
        epoch_version: 11,
      }),
    );
    await flushAsyncHandlers();

    expect(skippedEvents).toEqual([{ epochVersion: 10, reason: "invalid_frame" }]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(10));
    expect(sockets[0]?.sent).toEqual([]);
  });

  it("skips unknown flat websocket events without treating them as invalid frames", async () => {
    const sockets: FakeWebSocket[] = [];
    const diagnostics: string[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier, appliedEpochs, skippedEvents } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
      onDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic.reason);
      },
    });

    await runtime.start(context);
    sockets[0]?.message(JSON.stringify(createRawEventDto(12)));
    await flushAsyncHandlers();

    expect(appliedEpochs).toEqual([]);
    expect(skippedEvents).toEqual([{ epochVersion: 12, reason: "unsupported_event" }]);
    expect(diagnostics).not.toContain("invalid_frame");
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(12));
  });

  it("reports and skips an invalid websocket frame without crashing runtime", async () => {
    const sockets: FakeWebSocket[] = [];
    const diagnostics: string[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier, skippedEvents } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
      onDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic.reason);
      },
    });

    await runtime.start(context);
    sockets[0]?.message("{");
    await flushAsyncHandlers();

    expect(diagnostics).toContain("invalid_frame");
    expect(skippedEvents).toEqual([{ epochVersion: 10, reason: "invalid_frame" }]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(10));
  });

  it("closes socket on stop and does not reconnect", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      reconnectDelayMs: () => 10,
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    await runtime.stop("test_stop");
    await vi.advanceTimersByTimeAsync(20);

    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.closed).toBe(true);
    vi.useRealTimers();
  });

  it("ignores stale owner websocket callbacks", async () => {
    const sockets: FakeWebSocket[] = [];
    const diagnostics: string[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier, appliedEpochs, skippedEvents } = createApplier();
    let current = true;
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      isOwnerCurrent: () => current,
      getEventsPage: () => Promise.resolve(createPage([])),
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
      onDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic.reason);
      },
    });

    await runtime.start(context);
    current = false;
    sockets[0]?.message(JSON.stringify(createRestEventDto(11)));
    await flushAsyncHandlers();

    expect(appliedEpochs).toEqual([]);
    expect(skippedEvents).toEqual([]);
    expect(diagnostics).toContain("stale_owner");
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(10));
    expect(sockets[0]?.sent).toEqual([]);
  });

  it("runs catch-up again after a websocket close before reconnecting", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => {
        order.push("catch-up");
        return Promise.resolve(createPage([createRestEventDto(11)]));
      },
      normalizeRestEvent: (event) => createEvent(event.epoch_version),
      reconnectDelayMs: () => 10,
      webSocketFactory: (url, protocols) => {
        order.push("connect");
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.networkClose();
    await vi.advanceTimersByTimeAsync(10);

    expect(order).toEqual(["catch-up", "connect", "catch-up", "connect"]);
    expect(sockets).toHaveLength(2);
    vi.useRealTimers();
  });

  it("reconnects when the websocket errors without a close event", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "access-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      reconnectDelayMs: () => 10,
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    const stalledSocket = sockets[0]!;
    stalledSocket.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10);

    // A transport error is not guaranteed to be followed by close in every browser state.
    expect(stalledSocket.closed).toBe(true);
    expect(sockets).toHaveLength(2);
    await runtime.stop();
    vi.useRealTimers();
  });

  it("lets an auth close supersede a websocket-error reconnect", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    let completeRefresh = (): void => {
      throw new Error("Session refresh was not started");
    };
    const refreshSession = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeRefresh = resolve;
        }),
    );
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "expired-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.resolve(createPage([])),
      refreshSession,
      reconnectDelayMs: () => 10,
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    const failedSocket = sockets[0]!;
    failedSocket.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(0);
    failedSocket.networkClose(4401);
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(10);

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(1);
    completeRefresh();
    await flushAsyncHandlers();
    await runtime.stop();
    vi.useRealTimers();
  });

  it("refreshes the session instead of reconnecting with the old token after websocket 4401", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const states: string[] = [];
    const refreshSession = vi.fn(() => Promise.resolve());
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "expired-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier: {
        ...applier,
        onTransportStateChange: vi.fn((state) => {
          states.push(state.mode);
        }),
      },
      getEventsPage: () => Promise.resolve(createPage([])),
      refreshSession,
      reconnectDelayMs: () => 10,
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    sockets[0]?.networkClose(4401);
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(20);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledWith(
      owner.accountId,
      expect.objectContaining({ force: true, signal: expect.any(AbortSignal) }),
    );
    expect(states).toContain("auth_refreshing");
    expect(sockets).toHaveLength(1);
    vi.useRealTimers();
  });

  it("refreshes the session instead of reconnecting after catch-up 401", async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const refreshSession = vi.fn(() => Promise.resolve());
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier, states } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "expired-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.reject(new MessengerApiError("unauthorized", 401, {})),
      refreshSession,
      reconnectDelayMs: () => 10,
      webSocketFactory: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    await runtime.start(context);
    await flushAsyncHandlers();
    await vi.advanceTimersByTimeAsync(20);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledWith(
      owner.accountId,
      expect.objectContaining({ force: true, signal: expect.any(AbortSignal) }),
    );
    expect(states).toContain("auth_refreshing");
    expect(sockets).toHaveLength(0);
    vi.useRealTimers();
  });

  it("refreshes the session after catch-up 403", async () => {
    const refreshSession = vi.fn(() => Promise.resolve());
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier } = createApplier();
    const runtime = createWorkspaceRealtimeTransportCore({
      clientOptions: { accessToken: "expired-token", projectId: PROJECT_UUID },
      cursorStorage,
      applier,
      getEventsPage: () => Promise.reject(new MessengerApiError("forbidden", 403, {})),
      refreshSession,
    });

    await runtime.start(context);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledWith(
      owner.accountId,
      expect.objectContaining({ force: true, signal: expect.any(AbortSignal) }),
    );
  });
});
