import { describe, expect, it, vi } from "vitest";
import {
  buildMessengerWebSocketProtocols,
  buildMessengerWebSocketUrl,
  getEpoch,
  getEvents,
  getEventsPage,
  getServerSettings,
  getUser,
  getUsers,
  getUsersPage,
  normalizeWorkspaceRestEvent,
  normalizeWorkspaceWebSocketFrame,
  parseWorkspaceWebSocketFrame,
} from "./messenger-realtime.api";
import type {
  WorkspaceMessengerEventDto,
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerFolderItemDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerUserDto,
  WorkspaceRealtimeEvent,
} from "./messenger.types";

// Realtime tests keep REST catch-up and websocket events in one shape.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const USER_B_UUID = "33333333-3333-4333-8333-333333333333";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const EVENT_UUID = "0cb14b5a-6bf0-4de2-bdb5-4e98df4044e0";
const FOLDER_UUID = "f6ef9e59-57d6-42a9-bb50-fb7e9bdde2c9";
const FOLDER_ITEM_UUID = "7b14f82d-3a67-4db4-9b7b-84b7f49ac9da";
const BINDING_UUID = "a04f428c-f6df-4088-b2fd-60e88df75067";
const DATE = "2026-06-22T10:10:00Z";

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function createFetchMock(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(body, status, headers)));
  return fetchMock;
}

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) {
    throw new Error("Expected fetch to be called");
  }
  return call;
}

const userDto: WorkspaceMessengerUserDto = {
  uuid: USER_UUID,
  username: "alice",
  source: "iam",
  status: "active",
  status_emoji: null,
  status_text: null,
  first_name: "Alice",
  last_name: null,
  email: "alice@example.com",
  last_ping_at: DATE,
  created_at: DATE,
  updated_at: DATE,
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
  starred: true,
  is_own: false,
  created_at: DATE,
  updated_at: DATE,
};

const streamDto: WorkspaceMessengerStreamDto = {
  uuid: STREAM_UUID,
  name: "Engineering",
  description: "Engineering workspace",
  project_id: PROJECT_UUID,
  owner: USER_UUID,
  user_uuid: USER_UUID,
  role: "owner",
  notification_mode: "all_messages",
  unread_count: 3,
  source_name: "native",
  source: { kind: "native" },
  invite_only: false,
  announce: false,
  private: false,
  is_archived: false,
  direct_user_uuid: null,
  created_at: DATE,
  updated_at: DATE,
};

const streamBindingDto: WorkspaceMessengerStreamBindingDto = {
  uuid: BINDING_UUID,
  project_id: PROJECT_UUID,
  stream_uuid: STREAM_UUID,
  user_uuid: USER_B_UUID,
  who_uuid: USER_UUID,
  role: "member",
  notification_mode: "all_messages",
  created_at: DATE,
  updated_at: DATE,
};

const topicDto: WorkspaceMessengerTopicDto = {
  uuid: TOPIC_UUID,
  project_id: PROJECT_UUID,
  name: "Roadmap",
  stream_uuid: STREAM_UUID,
  user_uuid: USER_UUID,
  unread_count: 1,
  is_default: false,
  is_done: false,
  notification_mode: "follow",
  created_at: DATE,
  updated_at: DATE,
};

const folderItemDto: WorkspaceMessengerFolderItemDto = {
  uuid: FOLDER_ITEM_UUID,
  project_id: PROJECT_UUID,
  folder_uuid: FOLDER_UUID,
  user_uuid: USER_UUID,
  stream_uuid: STREAM_UUID,
  chat_type: "stream",
  order_index: 1,
  pinned_at: null,
  unread_count: 2,
  created_at: DATE,
  updated_at: DATE,
};

const folderDto: WorkspaceMessengerFolderDto = {
  uuid: FOLDER_UUID,
  project_id: PROJECT_UUID,
  user_uuid: USER_UUID,
  title: "Pinned",
  background_color_value: null,
  unread_count: 2,
  system_type: null,
  folder_items: [folderItemDto],
  created_at: DATE,
  updated_at: DATE,
};

function createEvent(
  payload: WorkspaceMessengerEventDto["payload"],
  epochVersion = 124,
): WorkspaceMessengerEventDto {
  return {
    epoch_version: epochVersion,
    uuid: EVENT_UUID,
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    payload,
    created_at: DATE,
    updated_at: DATE,
  };
}

describe("messenger-realtime.api", () => {
  it("fetches public server_settings without authorization", async () => {
    const fetchMock = createFetchMock({
      result: "success",
      msg: "Welcome",
      authentication_methods: {
        password: true,
        dev: false,
        email: true,
        ldap: false,
        remoteuser: false,
        github: false,
        azuread: false,
        gitlab: false,
        google: false,
        apple: false,
        saml: false,
        "openid connect": false,
      },
      push_notifications_enabled: true,
      email_auth_enabled: true,
      require_email_format_usernames: true,
      realm_url: "https://chat.example.com",
      realm_name: "Workspace",
      realm_icon: "/icon.png",
      realm_description: "<p>Workspace</p>",
      realm_web_public_access_enabled: false,
      external_authentication_methods: [],
      realm_uri: "https://chat.example.com",
    });

    await expect(getServerSettings({ fetchImpl: fetchMock })).resolves.toMatchObject({
      result: "success",
      realm_name: "Workspace",
    });

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/messenger/v1/server_settings");
    expect(init?.headers).toEqual({
      Accept: "application/json",
    });
  });

  it("fetches user, users, events, and epoch paths", async () => {
    const fetchMock = createFetchMock(userDto);
    await expect(
      getUser({ accessToken: "access-token", fetchImpl: fetchMock }, USER_UUID),
    ).resolves.toEqual(userDto);
    expect(firstFetchCall(fetchMock)[0]).toBe(`/api/messenger/v1/users/${USER_UUID}`);

    const usersFetchMock = createFetchMock([userDto]);
    await expect(
      getUsers({ accessToken: "access-token", fetchImpl: usersFetchMock }),
    ).resolves.toEqual([userDto]);
    expect(firstFetchCall(usersFetchMock)[0]).toBe("/api/messenger/v1/users/");

    const eventDto = createEvent({ kind: "message.created", ...messageDto });
    const eventsFetchMock = createFetchMock([eventDto]);
    await expect(
      getEvents(
        {
          accessToken: "access-token",
          baseUrl: "/api/messenger/v1",
          fetchImpl: eventsFetchMock,
          projectId: PROJECT_UUID,
        },
        { afterEpochVersion: 123 },
      ),
    ).resolves.toEqual([eventDto]);
    expect(firstFetchCall(eventsFetchMock)[0]).toBe(
      `/api/messenger/v1/events/?epoch_version%3E=123&project_id=${PROJECT_UUID}`,
    );

    const epochFetchMock = createFetchMock({ epoch_version: 124 });
    await expect(
      getEpoch({ accessToken: "access-token", fetchImpl: epochFetchMock }),
    ).resolves.toEqual({ epoch_version: 124 });
    expect(firstFetchCall(epochFetchMock)[0]).toBe("/api/messenger/v1/epoch/");
  });

  it("returns users and events pagination metadata", async () => {
    const usersFetchMock = createFetchMock([userDto], 200, {
      "X-Pagination-Marker": USER_UUID,
      "X-Pagination-Limit": "50",
    });
    await expect(
      getUsersPage(
        { accessToken: "access-token", fetchImpl: usersFetchMock },
        { pageLimit: 50, pageMarker: "prev" },
      ),
    ).resolves.toEqual({
      items: [userDto],
      nextPageMarker: USER_UUID,
      pageLimit: 50,
    });
    expect(firstFetchCall(usersFetchMock)[0]).toBe(
      "/api/messenger/v1/users/?page_limit=50&page_marker=prev",
    );

    const eventDto = createEvent({ kind: "message.created", ...messageDto });
    const eventsFetchMock = createFetchMock([eventDto], 200, {
      "X-Pagination-Marker": "124",
      "X-Pagination-Limit": "500",
    });
    await expect(
      getEventsPage(
        { accessToken: "access-token", fetchImpl: eventsFetchMock, projectId: PROJECT_UUID },
        { afterEpochVersion: 123, pageLimit: 500 },
      ),
    ).resolves.toEqual({
      items: [eventDto],
      nextPageMarker: "124",
      pageLimit: 500,
    });
    expect(firstFetchCall(eventsFetchMock)[0]).toBe(
      `/api/messenger/v1/events/?page_limit=500&epoch_version%3E=123&project_id=${PROJECT_UUID}`,
    );
  });

  it("strictly rejects invalid REST event rows", async () => {
    const fetchMock = createFetchMock([
      {
        epoch_version: 124,
        uuid: EVENT_UUID,
        project_id: PROJECT_UUID,
        user_uuid: USER_UUID,
        payload: {
          kind: "message.deleted",
          uuid: MESSAGE_UUID,
          stream_uuid: STREAM_UUID,
        },
        created_at: DATE,
        updated_at: DATE,
      },
    ]);

    await expect(getEvents({ accessToken: "access-token", fetchImpl: fetchMock })).rejects.toThrow(
      "Expected valid messenger events response item at index 0",
    );
  });

  it("builds websocket URL and protocols", () => {
    expect(buildMessengerWebSocketUrl({ lastEpochVersion: 124 })).toBe(
      "/api/messenger/ws?last_epoch_version=124",
    );
    expect(
      buildMessengerWebSocketUrl({
        baseUrl: "https://chat.example.com/",
        lastEpochVersion: 125,
      }),
    ).toBe(`wss://chat.example.com/api/messenger/ws?last_epoch_version=125`);
    expect(buildMessengerWebSocketProtocols("  access-token  ")).toEqual([
      "workspace.events.v1",
      "bearer.access-token",
    ]);
  });

  it("parses websocket string frames and rejects invalid input", () => {
    const helloFrame = {
      type: "hello",
      user_uuid: USER_UUID,
      project_id: PROJECT_UUID,
      epoch_version: 124,
    };
    expect(parseWorkspaceWebSocketFrame(JSON.stringify(helloFrame))).toEqual(helloFrame);
    expect(parseWorkspaceWebSocketFrame(JSON.stringify({ type: "connected" }))).toEqual({
      type: "connected",
    });
    expect(parseWorkspaceWebSocketFrame(JSON.stringify({ type: "ping" }))).toEqual({
      type: "ping",
    });

    const eventFrame = {
      type: "event",
      event: {
        epoch_version: 125,
        type: "message",
        message: messageDto,
      },
    };
    expect(parseWorkspaceWebSocketFrame(JSON.stringify(eventFrame))).toEqual(eventFrame);
    expect(() => parseWorkspaceWebSocketFrame("{")).toThrow(TypeError);
    expect(() =>
      parseWorkspaceWebSocketFrame({ type: "event", event: { type: "message" } }),
    ).toThrow(TypeError);
  });

  it("normalizes REST message events", () => {
    expect(
      normalizeWorkspaceRestEvent(createEvent({ kind: "message.updated", ...messageDto })),
    ).toEqual({
      epoch_version: 124,
      type: "message",
      kind: "message.updated",
      message: messageDto,
    });
    expect(
      normalizeWorkspaceRestEvent(
        createEvent({
          kind: "message.deleted",
          uuid: MESSAGE_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
        }),
      ),
    ).toEqual({
      epoch_version: 124,
      type: "message",
      kind: "message.deleted",
      message: {
        uuid: MESSAGE_UUID,
        stream_uuid: STREAM_UUID,
        topic_uuid: TOPIC_UUID,
      },
    });
  });

  it("normalizes REST stream bindings, topic, and folder item events", () => {
    expect(
      normalizeWorkspaceRestEvent(
        createEvent({
          kind: "stream_bindings.created",
          stream_uuid: STREAM_UUID,
          stream_bindings: [streamBindingDto],
        }),
      ),
    ).toEqual({
      epoch_version: 124,
      type: "stream_binding",
      kind: "stream_bindings.created",
      stream_uuid: STREAM_UUID,
      stream_bindings: [streamBindingDto],
    });

    expect(
      normalizeWorkspaceRestEvent(
        createEvent({
          kind: "topic.deleted",
          uuid: TOPIC_UUID,
          stream_uuid: STREAM_UUID,
        }),
      ),
    ).toEqual({
      epoch_version: 124,
      type: "topic",
      kind: "topic.deleted",
      topic: {
        uuid: TOPIC_UUID,
        stream_uuid: STREAM_UUID,
      },
    });

    expect(
      normalizeWorkspaceRestEvent(
        createEvent({
          kind: "folder_item.deleted",
          uuid: FOLDER_ITEM_UUID,
        }),
      ),
    ).toEqual({
      epoch_version: 124,
      type: "folder_item",
      kind: "folder_item.deleted",
      folder_item: {
        uuid: FOLDER_ITEM_UUID,
      },
    });
  });

  it("normalizes all REST snapshot and deleted resource events", () => {
    expect(
      normalizeWorkspaceRestEvent(createEvent({ kind: "message.created", ...messageDto })),
    ).toEqual({
      epoch_version: 124,
      type: "message",
      message: messageDto,
    });
    expect(
      normalizeWorkspaceRestEvent(createEvent({ kind: "stream.created", ...streamDto })),
    ).toEqual({
      epoch_version: 124,
      type: "stream",
      kind: "stream.created",
      stream: streamDto,
    });
    expect(
      normalizeWorkspaceRestEvent(createEvent({ kind: "stream.deleted", uuid: STREAM_UUID })),
    ).toEqual({
      epoch_version: 124,
      type: "stream",
      kind: "stream.deleted",
      stream: { uuid: STREAM_UUID },
    });
    expect(
      normalizeWorkspaceRestEvent(createEvent({ kind: "topic.updated", ...topicDto })),
    ).toEqual({
      epoch_version: 124,
      type: "topic",
      kind: "topic.updated",
      topic: topicDto,
    });
    expect(
      normalizeWorkspaceRestEvent(createEvent({ kind: "folder.updated", ...folderDto })),
    ).toEqual({
      epoch_version: 124,
      type: "folder",
      kind: "folder.updated",
      folder: folderDto,
    });
    expect(
      normalizeWorkspaceRestEvent(createEvent({ kind: "folder.deleted", uuid: FOLDER_UUID })),
    ).toEqual({
      epoch_version: 124,
      type: "folder",
      kind: "folder.deleted",
      folder: { uuid: FOLDER_UUID },
    });
    expect(normalizeWorkspaceRestEvent(createEvent({ kind: "user.updated", ...userDto }))).toEqual({
      epoch_version: 124,
      type: "user",
      kind: "user.updated",
      user: userDto,
    });
  });

  it("normalizes websocket frames", () => {
    expect(
      normalizeWorkspaceWebSocketFrame({
        type: "hello",
        user_uuid: USER_UUID,
        project_id: PROJECT_UUID,
        epoch_version: 124,
      }),
    ).toBeNull();

    const event: WorkspaceRealtimeEvent = {
      epoch_version: 125,
      type: "message",
      message: messageDto,
    };
    expect(
      normalizeWorkspaceWebSocketFrame({
        type: "event",
        event,
      }),
    ).toEqual(event);
  });
});
