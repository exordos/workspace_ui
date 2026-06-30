import { describe, expect, it, vi } from "vitest";
import {
  MessengerApiError,
  getEpoch,
  getEvents,
  getMessages,
  getMessagesPage,
  getServerSettings,
  getStreams,
} from "./messenger-client";

// Phase 1 client tests cover the small bootstrap API facade.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const EVENT_UUID = "0cb14b5a-6bf0-4de2-bdb5-4e98df4044e0";
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
    expect(url).toBe("/api/messenger/v1/streams/");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });
  });

  it("uses strict event cursor query for catch-up", async () => {
    const fetchMock = createFetchMock([
      {
        epoch_version: 124,
        uuid: EVENT_UUID,
        project_id: PROJECT_UUID,
        user_uuid: USER_UUID,
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
          baseUrl: "/api/messenger/v1",
          projectId: PROJECT_UUID,
          fetchImpl: fetchMock,
        },
        { afterEpochVersion: 123, pageLimit: 500 },
      ),
    ).resolves.toHaveLength(1);

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/messenger/v1/events/?page_limit=500&project_id=${PROJECT_UUID}&epoch_version%3E=123`,
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

  it("returns message pagination headers and fails on invalid page rows", async () => {
    const fetchMock = createFetchMock([messageDto], 200, {
      "X-Pagination-Marker": "next-message",
      "X-Pagination-Limit": "50",
    });

    await expect(
      getMessagesPage(
        { accessToken: "access-token", projectId: PROJECT_UUID, fetchImpl: fetchMock },
        { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID, pageLimit: 50 },
      ),
    ).resolves.toEqual({
      items: [messageDto],
      nextPageMarker: "next-message",
      pageLimit: 50,
    });

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/messenger/v1/messages/?page_limit=50&project_id=${PROJECT_UUID}&stream_uuid=${STREAM_UUID}&topic_uuid=${TOPIC_UUID}`,
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

  it("throws on invalid singleton response", async () => {
    const fetchMock = createFetchMock({ epoch_version: "124" });

    await expect(getEpoch({ accessToken: "access-token", fetchImpl: fetchMock })).rejects.toThrow(
      "Expected valid messenger epoch response",
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
      external_authentication_methods: [],
      realm_uri: "https://zulip.genesis-core.tech",
    });

    await expect(getServerSettings({ fetchImpl: fetchMock })).resolves.toMatchObject({
      result: "success",
      realm_name: "Genesis Corporation",
    });

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/messenger/v1/server_settings");
    expect(init?.headers).toEqual({
      Accept: "application/json",
    });
  });
});
