import { describe, expect, it, vi } from "vitest";
import {
  createMessageReaction,
  deleteMessageReaction,
  MessengerApiError,
  getMessageReactions,
  getMessages,
  getMessagesByUuids,
  getMessagesPage,
  getServerSettings,
  getStreams,
} from "./messenger-client";
import {
  getEpoch,
  getEvents,
  getUser,
  getUsers,
  getUsersPage,
  invokeUserPresence,
} from "./workspace-client";

// Phase 1 client tests cover the small bootstrap API facade.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const REACTION_UUID = "fae5c55d-9bb2-4646-9c03-f4a6dd65c9f0";
const EVENT_UUID = "0cb14b5a-6bf0-4de2-bdb5-4e98df4044e0";
const DATE = "2026-06-22T10:10:00Z";

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  return new Response(status === 204 ? null : JSON.stringify(body), {
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

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createMessageUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const streamDto = {
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

const messageDto = {
  uuid: MESSAGE_UUID,
  project_id: PROJECT_UUID,
  stream_uuid: STREAM_UUID,
  topic_uuid: TOPIC_UUID,
  author_uuid: USER_UUID,
  payload: {
    kind: "markdown",
    content: "Hello, workspace",
  },
  user_uuid: USER_UUID,
  read: true,
  pinned: false,
  starred: false,
  is_own: true,
  reactions: {
    thumbs_up: 2,
  },
  created_at: DATE,
  updated_at: DATE,
};

const reactionDto = {
  uuid: REACTION_UUID,
  project_id: PROJECT_UUID,
  message_uuid: MESSAGE_UUID,
  user_uuid: USER_UUID,
  emoji_name: "thumbs_up",
  created_at: DATE,
  updated_at: DATE,
};

const userDto = {
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

describe("messenger-client", () => {
  it("sends bearer auth and filters invalid collection rows", async () => {
    const fetchMock = createFetchMock([streamDto, { ...streamDto, uuid: "bad" }]);

    await expect(
      getStreams({ accessToken: " access-token ", projectId: PROJECT_UUID, fetchImpl: fetchMock }),
    ).resolves.toEqual([streamDto]);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/streams/");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });
  });

  it("uses strict event cursor query for catch-up", async () => {
    const fetchMock = createFetchMock([
      {
        schema_version: 1,
        epoch_version: 124,
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
      },
    ]);

    await expect(
      getEvents(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1",
          projectId: PROJECT_UUID,
          fetchImpl: fetchMock,
        },
        { afterEpochVersion: 123, epochGeneration: "generation-a", pageLimit: 500 },
      ),
    ).resolves.toHaveLength(1);

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      "/api/workspace/v1/events/?page_limit=500&epoch_version%3E=123&epoch_generation=generation-a",
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
      "Expected valid workspace events response item at index 0",
    );
  });

  it("throws when a collection response is not an array", async () => {
    const fetchMock = createFetchMock({ streams: [streamDto] });

    await expect(getStreams({ accessToken: "access-token", fetchImpl: fetchMock })).rejects.toThrow(
      "Expected messenger streams response to be an array",
    );
  });

  it("skips messages with unsupported payloads", async () => {
    const fetchMock = createFetchMock([
      messageDto,
      {
        ...messageDto,
        uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        payload: { kind: "html", content: "<strong>no</strong>" },
      },
    ]);

    await expect(
      getMessages({ accessToken: "access-token", fetchImpl: fetchMock }),
    ).resolves.toEqual([messageDto]);
  });

  it("returns an empty message UUID batch without fetch", async () => {
    const fetchMock = createFetchMock([messageDto]);

    await expect(
      getMessagesByUuids({ accessToken: "access-token", fetchImpl: fetchMock }, [" ", ""]),
    ).resolves.toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes duplicate and blank message UUID batch input", async () => {
    const fetchMock = createFetchMock([messageDto]);

    await expect(
      getMessagesByUuids({ accessToken: "access-token", fetchImpl: fetchMock }, [
        ` ${MESSAGE_UUID} `,
        "",
        MESSAGE_UUID,
        ` ${EVENT_UUID} `,
      ]),
    ).resolves.toEqual([messageDto]);

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/messages/?uuid=${MESSAGE_UUID}&uuid=${EVENT_UUID}`,
    );
  });

  it("fetches a two-message UUID batch with repeated query params", async () => {
    const fetchMock = createFetchMock([messageDto]);

    await expect(
      getMessagesByUuids({ accessToken: "access-token", fetchImpl: fetchMock }, [
        MESSAGE_UUID,
        EVENT_UUID,
      ]),
    ).resolves.toEqual([messageDto]);

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/messages/?uuid=${MESSAGE_UUID}&uuid=${EVENT_UUID}`,
    );
  });

  it("wraps message reaction list, create, and delete endpoints", async () => {
    const listFetchMock = createFetchMock([reactionDto]);
    await expect(
      getMessageReactions(
        { accessToken: "access-token", projectId: PROJECT_UUID, fetchImpl: listFetchMock },
        { messageUuid: MESSAGE_UUID, userUuid: USER_UUID },
      ),
    ).resolves.toEqual([reactionDto]);
    const [listUrl, listInit] = firstFetchCall(listFetchMock);
    expect(listUrl).toBe(
      `/api/workspace/v1/messenger/message_reactions/?project_id=${PROJECT_UUID}&message_uuid=${MESSAGE_UUID}&user_uuid=${USER_UUID}`,
    );
    expect(listInit?.method).toBe("GET");

    const createBody = {
      message_uuid: MESSAGE_UUID,
      emoji_name: "thumbs_up",
    };
    const createReactionFetchMock = createFetchMock(reactionDto);
    await expect(
      createMessageReaction(
        { accessToken: "access-token", fetchImpl: createReactionFetchMock },
        createBody,
      ),
    ).resolves.toEqual(reactionDto);
    const [createUrl, createInit] = firstFetchCall(createReactionFetchMock);
    expect(createUrl).toBe("/api/workspace/v1/messenger/message_reactions/");
    expect(createInit?.method).toBe("POST");
    expect(createInit?.body).toBe(JSON.stringify(createBody));

    const deleteFetchMock = createFetchMock(null, 204);
    await expect(
      deleteMessageReaction(
        { accessToken: "access-token", fetchImpl: deleteFetchMock },
        REACTION_UUID,
      ),
    ).resolves.toBeUndefined();
    const [deleteUrl, deleteInit] = firstFetchCall(deleteFetchMock);
    expect(deleteUrl).toBe(`/api/workspace/v1/messenger/message_reactions/${REACTION_UUID}`);
    expect(deleteInit?.method).toBe("DELETE");
    expect(deleteInit?.body).toBeUndefined();
  });

  it("lists current user reactions without a message UUID filter", async () => {
    const fetchMock = createFetchMock([reactionDto]);

    await expect(
      getMessageReactions(
        { accessToken: "access-token", projectId: PROJECT_UUID, fetchImpl: fetchMock },
        { userUuid: USER_UUID },
      ),
    ).resolves.toEqual([reactionDto]);

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/message_reactions/?project_id=${PROJECT_UUID}&user_uuid=${USER_UUID}`,
    );
    expect(url).not.toContain("message_uuid");
  });

  it("splits message UUID batches by 100 and flattens parallel responses", async () => {
    const uuids = Array.from({ length: 201 }, (_, index) => createMessageUuid(index + 1));
    const firstRequest = createDeferred<Response>();
    const secondRequest = createDeferred<Response>();
    const thirdRequest = createDeferred<Response>();
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)
      .mockReturnValueOnce(thirdRequest.promise);

    const loading = getMessagesByUuids(
      { accessToken: "access-token", fetchImpl: fetchMock },
      uuids,
    );

    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map(([url]) =>
      url instanceof URL ? url.href : typeof url === "string" ? url : url.url,
    );
    expect(new URL(urls[0]!, "https://example.test").searchParams.getAll("uuid")).toEqual(
      uuids.slice(0, 100),
    );
    expect(new URL(urls[1]!, "https://example.test").searchParams.getAll("uuid")).toEqual(
      uuids.slice(100, 200),
    );
    expect(new URL(urls[2]!, "https://example.test").searchParams.getAll("uuid")).toEqual(
      uuids.slice(200),
    );

    const firstUuid = uuids[0]!;
    const secondUuid = uuids[100]!;
    const thirdUuid = uuids[200]!;
    thirdRequest.resolve(jsonResponse([{ ...messageDto, uuid: thirdUuid }]));
    firstRequest.resolve(jsonResponse([{ ...messageDto, uuid: firstUuid }]));
    secondRequest.resolve(jsonResponse([{ ...messageDto, uuid: secondUuid }]));

    await expect(loading).resolves.toEqual([
      { ...messageDto, uuid: firstUuid },
      { ...messageDto, uuid: secondUuid },
      { ...messageDto, uuid: thirdUuid },
    ]);
  });

  it("returns message pagination headers and fails on invalid page rows", async () => {
    const fetchMock = createFetchMock([messageDto], 200, {
      "X-Pagination-Marker": "next-message",
      "X-Pagination-Limit": "50",
    });

    await expect(
      getMessagesPage(
        { accessToken: "access-token", projectId: PROJECT_UUID, fetchImpl: fetchMock },
        { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID, pageLimit: 50, starred: true },
      ),
    ).resolves.toEqual({
      items: [messageDto],
      nextPageMarker: "next-message",
      pageLimit: 50,
    });

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/messages/?page_limit=50&project_id=${PROJECT_UUID}&stream_uuid=${STREAM_UUID}&topic_uuid=${TOPIC_UUID}&starred=true`,
    );

    const invalidFetchMock = createFetchMock([
      messageDto,
      {
        ...messageDto,
        uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        payload: { kind: "html", content: "<strong>no</strong>" },
      },
    ]);

    await expect(
      getMessagesPage({ accessToken: "access-token", fetchImpl: invalidFetchMock }),
    ).rejects.toThrow("Expected valid messenger messages response item at index 1");
  });

  it("fetches users, user pages, and one user by uuid", async () => {
    const usersFetchMock = createFetchMock([userDto]);

    await expect(
      getUsers({ accessToken: "access-token", fetchImpl: usersFetchMock }),
    ).resolves.toEqual([userDto]);
    expect(firstFetchCall(usersFetchMock)[0]).toBe("/api/workspace/v1/users/");

    const usersPageFetchMock = createFetchMock([userDto], 200, {
      "X-Pagination-Marker": USER_UUID,
      "X-Pagination-Limit": "50",
    });
    await expect(
      getUsersPage(
        { accessToken: "access-token", fetchImpl: usersPageFetchMock },
        { pageLimit: 50, pageMarker: "prev" },
      ),
    ).resolves.toEqual({
      items: [userDto],
      nextPageMarker: USER_UUID,
      pageLimit: 50,
    });
    expect(firstFetchCall(usersPageFetchMock)[0]).toBe(
      "/api/workspace/v1/users/?page_limit=50&page_marker=prev",
    );

    const userFetchMock = createFetchMock(userDto);
    await expect(
      getUser({ accessToken: "access-token", fetchImpl: userFetchMock }, USER_UUID),
    ).resolves.toEqual(userDto);
    expect(firstFetchCall(userFetchMock)[0]).toBe(`/api/workspace/v1/users/${USER_UUID}`);
  });

  it("posts Workspace user presence update", async () => {
    const fetchMock = createFetchMock({
      ...userDto,
      status: "active",
      status_emoji: "👋",
      status_text: "Here",
    });

    await expect(
      invokeUserPresence({ accessToken: "access-token", fetchImpl: fetchMock }, USER_UUID, {
        status: "active",
        emoji: "👋",
        text: "Here",
      }),
    ).resolves.toEqual({
      ...userDto,
      status: "active",
      status_emoji: "👋",
      status_text: "Here",
    });

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/users/${USER_UUID}/actions/presence/invoke`);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    });
    expect(init?.body).toBe(JSON.stringify({ status: "active", emoji: "👋", text: "Here" }));
  });

  it("posts Workspace user presence clear values", async () => {
    const fetchMock = createFetchMock({
      ...userDto,
      status: "active",
      status_emoji: null,
      status_text: null,
    });

    await expect(
      invokeUserPresence({ accessToken: "access-token", fetchImpl: fetchMock }, USER_UUID, {
        status: "active",
        emoji: null,
        text: null,
      }),
    ).resolves.toEqual({
      ...userDto,
      status: "active",
      status_emoji: null,
      status_text: null,
    });

    const [, init] = firstFetchCall(fetchMock);
    expect(init?.body).toBe(JSON.stringify({ status: "active", emoji: null, text: null }));
  });

  it("filters invalid user rows", async () => {
    const fetchMock = createFetchMock([userDto, { ...userDto, status_emoji: 123 }]);

    await expect(getUsers({ accessToken: "access-token", fetchImpl: fetchMock })).resolves.toEqual([
      userDto,
    ]);
  });

  it("throws on invalid singleton response", async () => {
    const fetchMock = createFetchMock({ epoch_version: "124" });

    await expect(getEpoch({ accessToken: "access-token", fetchImpl: fetchMock })).rejects.toThrow(
      "Expected valid workspace epoch response",
    );
  });

  it("throws MessengerApiError for HTTP failures", async () => {
    const fetchMock = createFetchMock({ code: 403 }, 403);

    await expect(getStreams({ accessToken: "access-token", fetchImpl: fetchMock })).rejects.toEqual(
      expect.objectContaining({
        name: "MessengerApiError",
        status: 403,
      }),
    );
    await expect(
      getStreams({ accessToken: "access-token", fetchImpl: fetchMock }),
    ).rejects.toBeInstanceOf(MessengerApiError);
  });

  it("fetches public server_settings without bearer auth", async () => {
    const fetchMock = createFetchMock({
      result: "success",
      msg: "Welcome to Exordos Workspace",
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
      realm_url: "https://zulip.genesis-core.tech",
      realm_name: "Genesis Corporation",
      realm_icon: "/user_avatars/2/realm/icon.png?version=2",
      realm_description: "<p>The coolest place in the universe.</p>",
      realm_web_public_access_enabled: false,
      meet_url: "https://meet.workspace.example.com",
      external_authentication_methods: [],
      realm_uri: "https://zulip.genesis-core.tech",
    });

    await expect(getServerSettings({ fetchImpl: fetchMock })).resolves.toMatchObject({
      result: "success",
      realm_name: "Genesis Corporation",
      meet_url: "https://meet.workspace.example.com",
    });

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/server_settings");
    expect(init?.headers).toEqual({
      Accept: "application/json",
    });
  });
});
