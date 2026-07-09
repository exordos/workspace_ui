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
const FOLDER_UUID = "00000000-0000-0000-0000-000000000002";
const FOLDER_ITEM_UUID = "00000000-0000-4000-8000-000000000401";
const STREAM_BINDING_UUID = "00000000-0000-4000-8000-000000000501";

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
  const isOwn = authorUuid === USER_UUID;
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
      read: isOwn,
      pinned: false,
      starred: false,
      is_own: isOwn,
      created_at: "2026-06-24T10:20:30Z",
      reactions: {},
    },
  };
}

function streamWorkspaceEvent(
  epochVersion: number,
  kind = "stream.created",
  isArchived = false,
): unknown {
  return {
    epoch_version: epochVersion,
    uuid: `00000000-0000-4000-8000-${String(epochVersion).padStart(12, "0")}`,
    project_id: "00000000-0000-4000-8000-000000000901",
    user_uuid: USER_UUID,
    payload: {
      kind,
      uuid: STREAM_UUID,
      project_id: "00000000-0000-4000-8000-000000000901",
      user_uuid: USER_UUID,
      owner: USER_UUID,
      role: "owner",
      name: "Engineering",
      description: "Engineering workspace",
      unread_count: 0,
      source_name: "native",
      source: { kind: "native" },
      invite_only: false,
      announce: false,
      private: false,
      is_archived: isArchived,
      created_at: "2026-06-24T10:00:00.000000Z",
      updated_at: "2026-06-24T10:00:00.000000Z",
    },
  };
}

function topicWorkspaceEvent(epochVersion: number, kind = "topic.created"): unknown {
  return {
    epoch_version: epochVersion,
    uuid: `00000000-0000-4000-8000-${String(epochVersion).padStart(12, "0")}`,
    project_id: "00000000-0000-4000-8000-000000000901",
    user_uuid: USER_UUID,
    payload: {
      kind,
      uuid: TOPIC_UUID,
      project_id: "00000000-0000-4000-8000-000000000901",
      user_uuid: USER_UUID,
      name: "planning",
      stream_uuid: STREAM_UUID,
      unread_count: 2,
      is_default: false,
      is_done: true,
      created_at: "2026-06-24T10:00:00.000000Z",
      updated_at: "2026-06-24T10:00:00.000000Z",
    },
  };
}

function topicDeletedWorkspaceEvent(epochVersion: number): unknown {
  return {
    epoch_version: epochVersion,
    uuid: `00000000-0000-4000-8000-${String(epochVersion).padStart(12, "0")}`,
    project_id: "00000000-0000-4000-8000-000000000901",
    user_uuid: USER_UUID,
    payload: {
      kind: "topic.deleted",
      uuid: TOPIC_UUID,
      stream_uuid: STREAM_UUID,
    },
  };
}

function folderUpdatedWorkspaceEvent(epochVersion: number): unknown {
  return {
    epoch_version: epochVersion,
    uuid: `00000000-0000-4000-8000-${String(epochVersion).padStart(12, "0")}`,
    project_id: "00000000-0000-4000-8000-000000000901",
    user_uuid: USER_UUID,
    payload: {
      kind: "folder.updated",
      uuid: FOLDER_UUID,
      project_id: "00000000-0000-4000-8000-000000000901",
      user_uuid: USER_UUID,
      title: "Channels",
      background_color_value: 0,
      unread_count: 0,
      system_type: "channels",
      folder_items: [
        {
          uuid: FOLDER_ITEM_UUID,
          folder_uuid: FOLDER_UUID,
          stream_uuid: STREAM_UUID,
          chat_type: "stream",
          order_index: 0,
          pinned_at: null,
          unread_count: 0,
          created_at: "2026-06-24T10:00:00.000000Z",
          updated_at: "2026-06-24T10:00:00.000000Z",
        },
      ],
      created_at: "2026-06-24T10:00:00.000000Z",
      updated_at: "2026-06-24T10:00:00.000000Z",
    },
  };
}

function streamBindingsCreatedWorkspaceEvent(epochVersion: number): unknown {
  return {
    epoch_version: epochVersion,
    uuid: `00000000-0000-4000-8000-${String(epochVersion).padStart(12, "0")}`,
    project_id: "00000000-0000-4000-8000-000000000901",
    user_uuid: USER_UUID,
    payload: {
      kind: "stream_bindings.created",
      project_id: "00000000-0000-4000-8000-000000000901",
      uuid: STREAM_UUID,
      items: [
        {
          uuid: STREAM_BINDING_UUID,
          project_id: "00000000-0000-4000-8000-000000000901",
          stream_uuid: STREAM_UUID,
          user_uuid: OTHER_UUID,
          who_uuid: USER_UUID,
          role: "member",
          created_at: "2026-06-24T10:00:00.000000Z",
          updated_at: "2026-06-24T10:00:00.000000Z",
        },
      ],
    },
  };
}

function userUpdatedWorkspaceEvent(epochVersion: number): unknown {
  return {
    epoch_version: epochVersion,
    uuid: `00000000-0000-4000-8000-${String(epochVersion).padStart(12, "0")}`,
    project_id: "00000000-0000-4000-8000-000000000901",
    user_uuid: USER_UUID,
    payload: {
      kind: "user.updated",
      uuid: OTHER_UUID,
      username: "alice",
      status: "do_not_disturb",
      first_name: "Alice",
      last_name: "Admin",
      email: "alice@example.com",
      avatar: "urn:gavatar:" + OTHER_UUID,
      last_ping_at: "2026-06-24T10:21:00Z",
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
    expect(normalized?.event).toMatchObject({
      id: 12,
      type: "message",
      kind: "message.created",
    });
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
      reactions: {},
    });
  });

  it("maps REST message.updated events and preserves the event kind", () => {
    const normalized = normalizeWorkspaceEventModel({
      epoch_version: 14,
      user_uuid: USER_UUID,
      payload: {
        kind: "message.updated",
        uuid: MESSAGE_UUID,
        stream_uuid: STREAM_UUID,
        topic_uuid: TOPIC_UUID,
        author_uuid: OTHER_UUID,
        payload: { kind: "markdown", content: "edited over epochs" },
        read: true,
        pinned: false,
        starred: true,
        is_own: false,
        created_at: "2026-06-24T10:20:30Z",
        reactions: { thumbs_up: 2 },
      },
    });

    expect(normalized?.event).toMatchObject({
      id: 14,
      type: "message",
      kind: "message.updated",
      message: {
        id: MESSAGE_UUID,
        content: "edited over epochs",
        read: true,
        starred: true,
        reactions: { thumbs_up: 2 },
      },
    });
  });

  it("maps REST message.deleted events without requiring a message snapshot", () => {
    const normalized = normalizeWorkspaceEventModel({
      epoch_version: 15,
      user_uuid: USER_UUID,
      payload: {
        kind: "message.deleted",
        uuid: MESSAGE_UUID,
        stream_uuid: STREAM_UUID,
        topic_uuid: TOPIC_UUID,
      },
    });

    expect(normalized?.event).toMatchObject({
      id: 15,
      type: "message",
      kind: "message.deleted",
      message_id: MESSAGE_UUID,
      message_ids: [MESSAGE_UUID],
      message: {
        id: MESSAGE_UUID,
        stream_uuid: STREAM_UUID,
        topic_uuid: TOPIC_UUID,
      },
    });
  });

  it("maps REST messages.read events without requiring a message snapshot", () => {
    const normalized = normalizeWorkspaceEventModel({
      epoch_version: 16,
      user_uuid: USER_UUID,
      payload: {
        kind: "messages.read",
        message_uuids: [MESSAGE_UUID],
      },
    });

    expect(normalized?.event).toMatchObject({
      id: 16,
      type: "message",
      kind: "messages.read",
      message_uuids: [MESSAGE_UUID],
      message_ids: [MESSAGE_UUID],
    });
  });

  it("maps REST message.read events as message snapshots", () => {
    const normalized = normalizeWorkspaceEventModel({
      epoch_version: 17,
      user_uuid: USER_UUID,
      payload: {
        kind: "message.read",
        uuid: MESSAGE_UUID,
        stream_uuid: STREAM_UUID,
        topic_uuid: TOPIC_UUID,
        author_uuid: OTHER_UUID,
        payload: { kind: "markdown", content: "read over epochs" },
        read: true,
        pinned: false,
        starred: false,
        is_own: false,
        created_at: "2026-06-24T10:20:30Z",
        reactions: {},
      },
    });

    expect(normalized?.event).toMatchObject({
      id: 17,
      type: "message",
      kind: "message.read",
      message: {
        id: MESSAGE_UUID,
        content: "read over epochs",
        read: true,
        flags: ["read"],
      },
    });
  });

  it("maps REST user.updated events to normalized user profile events", () => {
    const normalized = normalizeWorkspaceEventModel(userUpdatedWorkspaceEvent(27));

    expect(normalized?.event).toMatchObject({
      id: 27,
      type: "user",
      kind: "user.updated",
      user: {
        user_id: OTHER_UUID,
        full_name: "Alice Admin",
        email: "alice@example.com",
        avatar_url: "urn:gavatar:" + OTHER_UUID,
        presence: {
          status: "do_not_disturb",
          timestamp: 1782296460,
        },
        is_active: true,
      },
    });
  });

  it("maps REST stream.created events to backend stream events", () => {
    const normalized = normalizeWorkspaceEventModel(streamWorkspaceEvent(16));

    expect(normalized?.epochVersion).toBe(16);
    expect(normalized?.event).toMatchObject({
      id: 16,
      type: "stream",
      kind: "stream.created",
      epoch_version: 16,
      stream: {
        uuid: STREAM_UUID,
        name: "Engineering",
        unread_count: 0,
        invite_only: false,
        private: false,
      },
    });
  });

  it("maps REST stream.updated events to backend stream events", () => {
    const normalized = normalizeWorkspaceEventModel(
      streamWorkspaceEvent(19, "stream.updated", true),
    );

    expect(normalized?.epochVersion).toBe(19);
    expect(normalized?.event).toMatchObject({
      id: 19,
      type: "stream",
      kind: "stream.updated",
      epoch_version: 19,
      stream: {
        uuid: STREAM_UUID,
        name: "Engineering",
        is_archived: true,
      },
    });
  });

  it("maps REST stream.updated metadata-only events", () => {
    const normalized = normalizeWorkspaceEventModel({
      epoch_version: 20,
      uuid: "00000000-0000-4000-8000-000000000020",
      project_id: "00000000-0000-4000-8000-000000000901",
      user_uuid: USER_UUID,
      payload: {
        kind: "stream.updated",
        uuid: STREAM_UUID,
        description: "Only description changed",
      },
    });

    expect(normalized?.epochVersion).toBe(20);
    expect(normalized?.event).toMatchObject({
      id: 20,
      type: "stream",
      kind: "stream.updated",
      stream: {
        uuid: STREAM_UUID,
        description: "Only description changed",
      },
    });
  });

  it("maps REST stream.read events to backend stream events", () => {
    const normalized = normalizeWorkspaceEventModel(streamWorkspaceEvent(21, "stream.read", false));

    expect(normalized?.event).toMatchObject({
      id: 21,
      type: "stream",
      kind: "stream.read",
      stream: {
        uuid: STREAM_UUID,
        name: "Engineering",
      },
    });
  });

  it("maps REST topic.created events to backend topic events", () => {
    const normalized = normalizeWorkspaceEventModel(topicWorkspaceEvent(24));

    expect(normalized?.epochVersion).toBe(24);
    expect(normalized?.event).toMatchObject({
      id: 24,
      type: "topic",
      kind: "topic.created",
      epoch_version: 24,
      topic: {
        uuid: TOPIC_UUID,
        stream_uuid: STREAM_UUID,
        name: "planning",
        unread_count: 2,
        is_default: false,
        is_done: true,
      },
    });
  });

  it("maps REST topic.read events to backend topic events", () => {
    const normalized = normalizeWorkspaceEventModel(topicWorkspaceEvent(26, "topic.read"));

    expect(normalized?.event).toMatchObject({
      id: 26,
      type: "topic",
      kind: "topic.read",
      topic: {
        uuid: TOPIC_UUID,
        stream_uuid: STREAM_UUID,
        name: "planning",
      },
    });
  });

  it("maps REST topic.deleted events to backend topic events", () => {
    const normalized = normalizeWorkspaceEventModel(topicDeletedWorkspaceEvent(25));

    expect(normalized?.event).toMatchObject({
      id: 25,
      type: "topic",
      kind: "topic.deleted",
      topic: {
        uuid: TOPIC_UUID,
        stream_uuid: STREAM_UUID,
      },
    });
  });

  it("maps REST stream_bindings.created events to backend stream binding events", () => {
    const normalized = normalizeWorkspaceEventModel(streamBindingsCreatedWorkspaceEvent(17));

    expect(normalized?.epochVersion).toBe(17);
    expect(normalized?.event).toMatchObject({
      id: 17,
      type: "stream_binding",
      kind: "stream_bindings.created",
      epoch_version: 17,
      stream_uuid: STREAM_UUID,
      stream_bindings: [
        {
          uuid: STREAM_BINDING_UUID,
          stream_uuid: STREAM_UUID,
          user_uuid: OTHER_UUID,
          who_uuid: USER_UUID,
          role: "member",
        },
      ],
    });
  });

  it("maps REST folder.updated events to backend folder events", () => {
    const normalized = normalizeWorkspaceEventModel(folderUpdatedWorkspaceEvent(18));

    expect(normalized?.epochVersion).toBe(18);
    expect(normalized?.event).toMatchObject({
      id: 18,
      type: "folder",
      kind: "folder.updated",
      epoch_version: 18,
      folder: {
        uuid: FOLDER_UUID,
        title: "Channels",
        system_type: "channels",
        folder_items: [
          {
            uuid: FOLDER_ITEM_UUID,
            folder_uuid: FOLDER_UUID,
            stream_uuid: STREAM_UUID,
          },
        ],
      },
    });
  });

  it("maps REST folder_item.deleted events to backend folder item events", () => {
    const normalized = normalizeWorkspaceEventModel({
      epoch_version: 19,
      payload: {
        kind: "folder_item.deleted",
        uuid: FOLDER_ITEM_UUID,
      },
    });

    expect(normalized?.event).toMatchObject({
      id: 19,
      type: "folder_item",
      kind: "folder_item.deleted",
      folder_item: { uuid: FOLDER_ITEM_UUID },
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

  it("maps flat backend WS event rows without an outer event wrapper", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(workspaceEvent(29, OTHER_UUID), USER_UUID);

    expect(normalized?.event).toMatchObject({
      id: 29,
      type: "message",
      kind: "message.created",
      message: {
        id: MESSAGE_UUID,
        read: false,
      },
    });
  });

  it("maps WS message.updated frames and preserves the event kind", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 14,
        type: "message",
        kind: "message.updated",
        message: {
          uuid: MESSAGE_UUID,
          author_uuid: OTHER_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
          payload: { kind: "markdown", content: "edited live" },
          read: true,
          pinned: false,
          starred: false,
          is_own: false,
          created_at: "2026-06-24T10:20:30Z",
          reactions: { heart: 1, ignored: 0 },
        },
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 14,
      type: "message",
      kind: "message.updated",
      message: {
        id: MESSAGE_UUID,
        content: "edited live",
        read: true,
        reactions: { heart: 1 },
      },
    });
  });

  it("maps WS message.deleted frames by id only", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 15,
        type: "message",
        kind: "message.deleted",
        message: {
          uuid: MESSAGE_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
        },
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 15,
      type: "message",
      kind: "message.deleted",
      message_id: MESSAGE_UUID,
      message_ids: [MESSAGE_UUID],
    });
  });

  it("maps WS messages.read frames", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 16,
        type: "message",
        kind: "messages.read",
        message_uuids: [MESSAGE_UUID],
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 16,
      type: "message",
      kind: "messages.read",
      message_uuids: [MESSAGE_UUID],
      message_ids: [MESSAGE_UUID],
    });
  });

  it("maps WS user.updated frames to normalized user profile events", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 28,
        type: "user",
        kind: "user.updated",
        user: {
          uuid: OTHER_UUID,
          username: "alice",
          status: "active",
          first_name: "Alice",
          last_name: "Admin",
          email: "alice@example.com",
          avatar: "urn:gavatar:" + OTHER_UUID,
          last_ping_at: "2026-06-24T10:21:00Z",
        },
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 28,
      type: "user",
      kind: "user.updated",
      user: {
        user_id: OTHER_UUID,
        full_name: "Alice Admin",
        avatar_url: "urn:gavatar:" + OTHER_UUID,
        presence: {
          status: "active",
          timestamp: 1782296460,
        },
      },
    });
  });

  it("maps backend WS stream.created frames", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 17,
        type: "stream",
        kind: "stream.created",
        stream: {
          uuid: STREAM_UUID,
          project_id: "00000000-0000-4000-8000-000000000901",
          user_uuid: USER_UUID,
          owner: USER_UUID,
          role: "owner",
          name: "Engineering",
          description: "Engineering workspace",
          unread_count: 0,
          source_name: "native",
          source: { kind: "native" },
          invite_only: false,
          announce: false,
          private: false,
          created_at: "2026-06-24T10:00:00.000000Z",
          updated_at: "2026-06-24T10:00:00.000000Z",
        },
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 17,
      type: "stream",
      kind: "stream.created",
      stream: { uuid: STREAM_UUID, name: "Engineering" },
    });
  });

  it("maps backend WS stream.updated frames", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 22,
        type: "stream",
        kind: "stream.updated",
        stream: {
          uuid: STREAM_UUID,
          name: "Engineering",
          unread_count: 0,
          invite_only: false,
          private: false,
          is_archived: true,
        },
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 22,
      type: "stream",
      kind: "stream.updated",
      stream: { uuid: STREAM_UUID, name: "Engineering", is_archived: true },
    });
  });

  it("maps backend WS stream.updated metadata-only frames", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 23,
        type: "stream",
        kind: "stream.updated",
        stream: {
          uuid: STREAM_UUID,
          description: "Only description changed",
        },
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 23,
      type: "stream",
      kind: "stream.updated",
      stream: { uuid: STREAM_UUID, description: "Only description changed" },
    });
  });

  it("maps backend WS topic.updated frames", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 26,
        type: "topic",
        kind: "topic.updated",
        topic: {
          uuid: TOPIC_UUID,
          stream_uuid: STREAM_UUID,
          name: "planning",
          unread_count: 1,
          is_default: false,
          is_done: false,
        },
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 26,
      type: "topic",
      kind: "topic.updated",
      topic: {
        uuid: TOPIC_UUID,
        stream_uuid: STREAM_UUID,
        name: "planning",
        unread_count: 1,
        is_done: false,
      },
    });
  });

  it("maps backend WS stream_bindings.created frames", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 21,
        type: "stream_binding",
        kind: "stream_bindings.created",
        stream_uuid: STREAM_UUID,
        stream_bindings: [
          {
            uuid: STREAM_BINDING_UUID,
            project_id: "00000000-0000-4000-8000-000000000901",
            stream_uuid: STREAM_UUID,
            user_uuid: OTHER_UUID,
            who_uuid: USER_UUID,
            role: "member",
          },
        ],
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 21,
      type: "stream_binding",
      kind: "stream_bindings.created",
      stream_uuid: STREAM_UUID,
      stream_bindings: [{ uuid: STREAM_BINDING_UUID, user_uuid: OTHER_UUID }],
    });
  });

  it("maps backend WS folder.updated frames", () => {
    const normalized = normalizeWorkspaceRealtimeEvent(
      {
        epoch_version: 20,
        type: "folder",
        kind: "folder.updated",
        folder: {
          uuid: FOLDER_UUID,
          title: "Channels",
          background_color_value: 0,
          unread_count: 0,
          system_type: "channels",
          folder_items: [
            {
              uuid: FOLDER_ITEM_UUID,
              folder_uuid: FOLDER_UUID,
              stream_uuid: STREAM_UUID,
              chat_type: "stream",
              order_index: 0,
            },
          ],
        },
      },
      USER_UUID,
    );

    expect(normalized?.event).toMatchObject({
      id: 20,
      type: "folder",
      kind: "folder.updated",
      folder: {
        uuid: FOLDER_UUID,
        folder_items: [{ uuid: FOLDER_ITEM_UUID, stream_uuid: STREAM_UUID }],
      },
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

  it("runs REST catch-up, opens WS with bearer subprotocol, handles flat live events, and stores cursor", async () => {
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
    expect(onQueueReady).toHaveBeenCalledTimes(1);

    ws.emit({ type: "hello", user_uuid: USER_UUID, project_id: "project", epoch_version: 12 });
    expect(onQueueReady).toHaveBeenCalledTimes(1);

    ws.emit(workspaceEvent(13));

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 13, type: "message" }));
    expect(ws.send).not.toHaveBeenCalledWith(JSON.stringify({ type: "ack", epoch_version: 13 }));
    expect(localStorage.getItem("workspace-realtime:last-epoch:v1:inst-1")).toBe("13");
    expect(recordDiagnosticRealtimeEventMock).toHaveBeenCalledWith("message");

    controller.abort();
  });

  it("keeps legacy wrapped WS event frames compatible", async () => {
    const controller = new AbortController();
    const onEvent = vi.fn();

    startMessengerEventLoop({
      instanceId: "inst-1",
      signal: controller.signal,
      onEvent,
    });

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    const ws = FakeWebSocket.instances[0]!;
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

  it("uses saved workspace org origin for credential-based background transport", async () => {
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
        realm: "https://canonical.example.test",
        workspaceOrgOrigin: "https://gateway.example.test",
        login: "admin",
        accessToken: "background-token",
      },
      instanceId: "inst-bg",
      signal: controller.signal,
      onEvent: vi.fn(),
    });

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.test/api/messenger/v1/events/?epoch_version%3E=0&page_limit=500",
      expect.objectContaining({ headers: { Authorization: "Bearer background-token" } }),
    );
    expect(FakeWebSocket.instances[0]!.url).toBe(
      "wss://gateway.example.test/api/messenger/ws?last_epoch_version=0",
    );

    controller.abort();
  });
});
