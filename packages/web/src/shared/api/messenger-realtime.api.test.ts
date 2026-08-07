import { describe, expect, it, vi } from "vitest";
import { getServerSettings } from "./messenger-client";
import {
  buildMessengerWebSocketProtocols,
  buildMessengerWebSocketUrl,
  normalizeWorkspaceRestEvent,
  normalizeWorkspaceWebSocketFrame,
  parseWorkspaceWebSocketFrame,
} from "./messenger-realtime.api";
import {
  getEpoch,
  getEvents,
  getEventsPage,
  getUser,
  getUsers,
  getUsersPage,
} from "./workspace-client";
import type {
  WorkspaceMessengerEventAction,
  WorkspaceMessengerEventDto,
  WorkspaceMessengerEventObjectType,
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerFolderItemDto,
  WorkspaceMessengerFileDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerRawEventDto,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerUserDto,
} from "./messenger.types";

// Realtime tests keep REST catch-up and websocket events in one shape.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const USER_B_UUID = "33333333-3333-4333-8333-333333333333";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const REACTION_UUID = "413ea116-fd71-47be-b88e-190fa24505fc";
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
  avatar: `urn:gavatar:${USER_UUID}`,
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
  reactions: {
    thumbs_up: 2,
  },
  reaction_users: {},
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
  active_unread_count: 3,
  passive_unread_count: 0,
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
  active_unread_count: 1,
  passive_unread_count: 0,
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
  active_unread_count: 2,
  passive_unread_count: 0,
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

const fileDto: WorkspaceMessengerFileDto = {
  uuid: "3f718b7e-9c1b-4e65-b33f-cfd8f72d9df5",
  project_id: PROJECT_UUID,
  user_uuid: USER_UUID,
  stream_uuid: STREAM_UUID,
  name: "handoff.txt",
  description: "Handoff notes",
  content_type: "text/plain",
  size_bytes: 12,
  hash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  created_at: DATE,
  updated_at: DATE,
};

function eventActionFromKind(
  kind: WorkspaceMessengerEventDto["payload"]["kind"],
): WorkspaceMessengerEventAction {
  if (kind.endsWith(".updated")) return "updated";
  if (kind.endsWith(".deleted")) return "deleted";
  if (kind.endsWith(".read")) return "read";
  return "created";
}

function eventObjectTypeFromKind(
  kind: WorkspaceMessengerEventDto["payload"]["kind"],
): WorkspaceMessengerEventObjectType {
  if (kind.startsWith("message_reaction.")) return "message_reaction";
  if (kind === "messages.read") return "message";
  if (kind.startsWith("message.")) return "message";
  if (kind.startsWith("stream_bindings.") || kind.startsWith("stream_binding.")) {
    return "stream_binding";
  }
  if (kind.startsWith("stream.")) return "stream";
  if (kind.startsWith("topic.")) return "topic";
  if (kind.startsWith("folder_item.")) return "folder_item";
  if (kind.startsWith("folder.")) return "folder";
  if (kind.startsWith("file.")) return "file";
  return "user";
}

function createEvent(
  payload: WorkspaceMessengerEventDto["payload"],
  epochVersion = 124,
): WorkspaceMessengerEventDto {
  const kind = payload.kind;
  return {
    schema_version: 1,
    epoch_version: epochVersion,
    uuid: EVENT_UUID,
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: eventObjectTypeFromKind(kind),
    action: eventActionFromKind(kind),
    payload,
    created_at: DATE,
    updated_at: DATE,
  };
}

function createRawEvent(epochVersion = 130): WorkspaceMessengerRawEventDto {
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
      meet_url: "https://meet.workspace.example.com",
      external_authentication_methods: [],
      realm_uri: "https://chat.example.com",
    });

    await expect(getServerSettings({ fetchImpl: fetchMock })).resolves.toMatchObject({
      result: "success",
      realm_name: "Workspace",
      meet_url: "https://meet.workspace.example.com",
    });

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/server_settings");
    expect(init?.headers).toEqual({
      Accept: "application/json",
    });
  });

  it("fetches user, users, events, and epoch paths", async () => {
    const fetchMock = createFetchMock(userDto);
    await expect(
      getUser({ accessToken: "access-token", fetchImpl: fetchMock }, USER_UUID),
    ).resolves.toEqual(userDto);
    expect(firstFetchCall(fetchMock)[0]).toBe(`/api/workspace/v1/users/${USER_UUID}`);

    const usersFetchMock = createFetchMock([userDto]);
    await expect(
      getUsers({ accessToken: "access-token", fetchImpl: usersFetchMock }),
    ).resolves.toEqual([userDto]);
    expect(firstFetchCall(usersFetchMock)[0]).toBe("/api/workspace/v1/users/");

    const eventDto = createEvent({ kind: "message.created", ...messageDto });
    const eventsFetchMock = createFetchMock([eventDto]);
    await expect(
      getEvents(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1",
          fetchImpl: eventsFetchMock,
          projectId: PROJECT_UUID,
        },
        { afterEpochVersion: 123, epochGeneration: "generation-a" },
      ),
    ).resolves.toEqual([eventDto]);
    expect(firstFetchCall(eventsFetchMock)[0]).toBe(
      "/api/workspace/v1/events/?epoch_version%3E=123&epoch_generation=generation-a",
    );

    const invalidGenerationFetchMock = createFetchMock([eventDto]);
    await expect(
      getEvents(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1",
          fetchImpl: invalidGenerationFetchMock,
          projectId: PROJECT_UUID,
        },
        { afterEpochVersion: 123, epochGeneration: "" },
      ),
    ).rejects.toThrow("Workspace events resume cursor requires epoch_generation");
    expect(invalidGenerationFetchMock).not.toHaveBeenCalled();

    const epochFetchMock = createFetchMock({
      epoch_version: 124,
      epoch_generation: "generation-a",
      current_epoch_version: 124,
      minimum_epoch_version: 1,
    });
    await expect(
      getEpoch({ accessToken: "access-token", fetchImpl: epochFetchMock }),
    ).resolves.toMatchObject({ epoch_version: 124, epoch_generation: "generation-a" });
    expect(firstFetchCall(epochFetchMock)[0]).toBe("/api/workspace/v1/epoch/");
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
      "/api/workspace/v1/users/?page_limit=50&page_marker=prev",
    );

    const eventDto = createEvent({ kind: "message.created", ...messageDto });
    const eventsFetchMock = createFetchMock([eventDto], 200, {
      "X-Pagination-Marker": "124",
      "X-Pagination-Limit": "500",
    });
    await expect(
      getEventsPage(
        { accessToken: "access-token", fetchImpl: eventsFetchMock, projectId: PROJECT_UUID },
        { afterEpochVersion: 123, epochGeneration: "generation-a", pageLimit: 500 },
      ),
    ).resolves.toEqual({
      items: [eventDto],
      nextPageMarker: "124",
      pageLimit: 500,
    });
    expect(firstFetchCall(eventsFetchMock)[0]).toBe(
      "/api/workspace/v1/events/?page_limit=500&epoch_version%3E=123&epoch_generation=generation-a",
    );
  });

  it("accepts unknown flat REST event envelopes for cursor skip", async () => {
    const rawEvent = createRawEvent(130);
    const fetchMock = createFetchMock([rawEvent], 200, {
      "X-Pagination-Marker": "130",
      "X-Pagination-Limit": "500",
    });

    await expect(
      getEventsPage(
        { accessToken: "access-token", fetchImpl: fetchMock, projectId: PROJECT_UUID },
        { afterEpochVersion: 123, epochGeneration: "generation-a", pageLimit: 500 },
      ),
    ).resolves.toEqual({
      items: [rawEvent],
      nextPageMarker: "130",
      pageLimit: 500,
    });
    expect(normalizeWorkspaceRestEvent(rawEvent)).toBeNull();
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
      "Expected valid workspace events response item at index 0",
    );
  });

  it("builds websocket URL and protocols", () => {
    expect(
      buildMessengerWebSocketUrl({ lastEpochVersion: 124, epochGeneration: "generation-a" }),
    ).toBe("/api/workspace/v1/events/ws?last_epoch_version=124&epoch_generation=generation-a");
    expect(() =>
      buildMessengerWebSocketUrl({ lastEpochVersion: 124, epochGeneration: "" }),
    ).toThrow("Workspace realtime resume cursor requires epoch_generation");
    expect(() =>
      buildMessengerWebSocketUrl({
        lastEpochVersion: 124,
        epochGeneration: 91,
      } as unknown as Parameters<typeof buildMessengerWebSocketUrl>[0]),
    ).toThrow("Workspace realtime resume cursor requires epoch_generation");
    expect(
      buildMessengerWebSocketUrl({
        baseUrl: "https://chat.example.com/",
        lastEpochVersion: 125,
        epochGeneration: "generation-a",
      }),
    ).toBe(
      `wss://chat.example.com/api/workspace/v1/events/ws?last_epoch_version=125&epoch_generation=generation-a`,
    );
    expect(buildMessengerWebSocketProtocols("  access-token  ")).toEqual([
      "workspace.events.v1",
      "bearer.access-token",
    ]);
  });

  it("parses websocket string frames and rejects invalid input", () => {
    const websocketEvent = createEvent({ kind: "message.created", ...messageDto }, 125);
    const readyFrame = { type: "ready", epoch_generation: "generation-a", epoch_version: 124 };
    expect(parseWorkspaceWebSocketFrame(JSON.stringify(readyFrame))).toEqual(readyFrame);

    expect(parseWorkspaceWebSocketFrame(JSON.stringify(websocketEvent))).toEqual(websocketEvent);
    expect(parseWorkspaceWebSocketFrame(JSON.stringify(createRawEvent(126)))).toEqual(
      createRawEvent(126),
    );
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
          kind: "messages.read",
          project_id: PROJECT_UUID,
          message_uuids: [MESSAGE_UUID],
        }),
      ),
    ).toEqual({
      epoch_version: 124,
      type: "messages",
      kind: "messages.read",
      messageUuids: [MESSAGE_UUID],
    });
    expect(
      normalizeWorkspaceRestEvent(createEvent({ kind: "message.read", ...messageDto })),
    ).toEqual({
      epoch_version: 124,
      type: "message",
      kind: "message.read",
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
          uuid: STREAM_UUID,
          items: [streamBindingDto],
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
        createEvent({ kind: "stream_binding.updated", ...streamBindingDto }),
      ),
    ).toEqual({
      epoch_version: 124,
      type: "stream_binding",
      kind: "stream_binding.updated",
      stream_binding: streamBindingDto,
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

    expect(normalizeWorkspaceRestEvent(createEvent({ kind: "file.updated", ...fileDto }))).toEqual({
      epoch_version: 124,
      type: "file",
      kind: "file.updated",
      file: fileDto,
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
      kind: "message.created",
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
    expect(normalizeWorkspaceRestEvent(createEvent({ kind: "stream.read", ...streamDto }))).toEqual(
      {
        epoch_version: 124,
        type: "stream",
        kind: "stream.read",
        stream: streamDto,
      },
    );
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
    expect(normalizeWorkspaceRestEvent(createEvent({ kind: "topic.read", ...topicDto }))).toEqual({
      epoch_version: 124,
      type: "topic",
      kind: "topic.read",
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
    expect(
      normalizeWorkspaceRestEvent(
        createEvent({
          kind: "messages.read",
          project_id: PROJECT_UUID,
          message_uuids: [MESSAGE_UUID],
        }),
      ),
    ).toEqual({
      epoch_version: 124,
      type: "messages",
      kind: "messages.read",
      messageUuids: [MESSAGE_UUID],
    });
    expect(
      normalizeWorkspaceRestEvent(
        createEvent({
          kind: "message_reaction.created",
          uuid: REACTION_UUID,
          project_id: PROJECT_UUID,
          message_uuid: MESSAGE_UUID,
          user_uuid: USER_UUID,
          emoji_name: "thumbs_up",
          source_name: "native",
          source: { kind: "native" },
        }),
      ),
    ).toBeNull();
  });

  it("normalizes websocket frames", () => {
    expect(
      normalizeWorkspaceWebSocketFrame({
        type: "ready",
        epoch_generation: "generation-a",
        epoch_version: 124,
      }),
    ).toBeNull();

    expect(
      normalizeWorkspaceWebSocketFrame(
        createEvent({ kind: "message.created", ...messageDto }, 125),
      ),
    ).toEqual({
      epoch_version: 125,
      type: "message",
      kind: "message.created",
      message: messageDto,
    });
  });
});
