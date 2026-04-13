/**
 * Tests for the Zulip API client — HTTP functions, data transformations, and guards.
 *
 * Covers: auth (fetchApiKey, fetchServerSettings), user/presence fetches,
 * message CRUD, reactions, flags, queue management, file upload, and pure mappers.
 * Functions using zulip-js client are tested via mock client; functions using
 * direct fetch are tested via stubbed global fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentInstance } from "./client";
import {
  ZulipAuthError,
  rawMessageToMockMessage,
  getRealmBaseUrl,
  fetchServerSettings,
  fetchApiKey,
  exchangeDesktopFlowToken,
  registerQueue,
  registerQueueForCredentials,
  deleteQueue,
  fetchUnreadMessagesCountForCredentials,
  getEvents,
  getEventsForCredentials,
  getCurrentUser,
  fetchUsers,
  fetchUser,
  fetchRealmPresence,
  fetchRecentMessages,
  fetchMessagesBeforeAnchor,
  fetchMessagesAfterAnchor,
  fetchActivityMessages,
  fetchActivityMessagesPage,
  fetchSubscriptions,
  fetchUserTopics,
  fetchMessages,
  fetchMessagesWithNarrow,
  fetchAllMessagesPage,
  fetchDmMessages,
  fetchStreams,
  fetchMessageById,
  fetchStreamMembers,
  fetchTopics,
  sendMessage,
  renderMessageContent,
  updateMessage,
  deleteMessage,
  updateStream,
  deleteStream,
  addReaction,
  removeReaction,
  markMessagesAsRead,
  markDmAsRead,
  markStreamAsRead,
  markTopicAsRead,
  setTopicResolvedState,
  updateMessageFlags,
  uploadFile,
  fetchUsersAvatarMap,
} from "./zulip";

const mockZulipClient = vi.hoisted(() => ({
  streams: {
    retrieve: vi.fn(),
    topics: { retrieve: vi.fn() },
  },
  messages: {
    retrieve: vi.fn(),
    send: vi.fn(),
  },
}));

const mockZulipApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  postFormData: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

const mockRefreshZulipApiBase = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  getCurrentInstance: vi.fn(),
  zulipApi: mockZulipApi,
  refreshZulipApiBase: mockRefreshZulipApiBase,
}));

vi.mock("~/shared/lib/auth-guard", () => ({
  getBasicAuthValue: () => "Basic dGVzdEB0LmNvbTprZXkxMjM=",
  buildAuthHeader: () => ({ Authorization: "Basic dGVzdEB0LmNvbTprZXkxMjM=" }),
  setAuthInstanceGetter: vi.fn(),
}));

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("~/shared/lib/env", () => ({
  env: { ZULIP_API_PATH: "/api/v1" },
}));

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logApiCall: vi.fn(),
  logStoreAction: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("zulip-js", () => ({
  default: vi.fn(() => Promise.resolve(mockZulipClient)),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_INSTANCE = {
  id: "test-inst",
  realm: "https://zulip.example.com",
  email: "user@example.com",
  apiKey: "test",
};

const mockFetch = vi.fn();

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  vi.mocked(getCurrentInstance).mockReturnValue(TEST_INSTANCE);
  mockZulipClient.streams.retrieve.mockReset();
  mockZulipClient.streams.topics.retrieve.mockReset();
  mockZulipClient.messages.retrieve.mockReset();
  mockZulipClient.messages.send.mockReset();
  mockZulipApi.get.mockReset();
  mockZulipApi.post.mockReset();
  mockZulipApi.postFormData.mockReset();
  mockZulipApi.patch.mockReset();
  mockZulipApi.delete.mockReset();
  mockRefreshZulipApiBase.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// rawMessageToMockMessage — pure mapper, no mocking needed
// ---------------------------------------------------------------------------

describe("rawMessageToMockMessage", () => {
  it("maps a stream message", () => {
    const result = rawMessageToMockMessage({
      id: 1,
      sender_id: 42,
      sender_full_name: "Alice",
      content: "<p>hello</p>",
      timestamp: 1710000000,
      display_recipient: "engineering",
      subject: "bugs",
      type: "stream",
      stream_id: 10,
      flags: ["read"],
      reactions: [],
    });

    expect(result).toEqual({
      id: 1,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      display_recipient: "engineering",
      channel: "engineering",
      subject: "bugs",
      content: "<p>hello</p>",
      timestamp: 1710000000,
      flags: ["read"],
      reactions: [],
    });
  });

  it("maps markdown_source when present", () => {
    const result = rawMessageToMockMessage({
      id: 1,
      sender_id: 1,
      content: "<p>a</p>",
      timestamp: 0,
      markdown_source: "**a**",
    });
    expect(result.markdown_source).toBe("**a**");
  });

  it("maps a private message with null stream_id", () => {
    const result = rawMessageToMockMessage({
      id: 2,
      sender_id: 5,
      content: "hi",
      timestamp: 1710000100,
      type: "private",
      stream_id: null,
      display_recipient: [
        { id: 5, full_name: "Alice" },
        { id: 10, full_name: "Bob" },
      ],
    });

    expect(result.stream_id).toBeNull();
    expect(result.channel).toBeUndefined();
    expect(result.display_recipient).toEqual([
      { id: 5, full_name: "Alice" },
      { id: 10, full_name: "Bob" },
    ]);
  });

  it("defaults missing fields", () => {
    const result = rawMessageToMockMessage({
      id: 3,
      sender_id: 1,
      content: "text",
      timestamp: 0,
    });

    expect(result.sender_full_name).toBe("");
    expect(result.subject).toBe("");
    expect(result.stream_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getRealmBaseUrl
// ---------------------------------------------------------------------------

describe("getRealmBaseUrl", () => {
  it("returns empty string when no instance", () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    expect(getRealmBaseUrl()).toBe("");
  });

  it("returns normalized realm URL", () => {
    expect(getRealmBaseUrl()).toBe("https://zulip.example.com");
  });

  it("strips trailing /api/v1 from realm", () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      realm: "https://zulip.example.com/api/v1",
    });
    expect(getRealmBaseUrl()).toBe("https://zulip.example.com");
  });

  it("strips trailing /api from realm", () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      realm: "https://zulip.example.com/api",
    });
    expect(getRealmBaseUrl()).toBe("https://zulip.example.com");
  });

  it("strips trailing slashes", () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      realm: "https://zulip.example.com///",
    });
    expect(getRealmBaseUrl()).toBe("https://zulip.example.com");
  });
});

// ---------------------------------------------------------------------------
// fetchServerSettings — unauthenticated, uses raw fetch
// ---------------------------------------------------------------------------

describe("fetchServerSettings", () => {
  it("returns settings on success", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        realm_name: "Test Realm",
        realm_icon: "/icon.png",
        external_authentication_methods: [
          { name: "google", display_name: "Google", login_url: "/google" },
        ],
      }),
    );

    const result = await fetchServerSettings("https://zulip.example.com");
    expect(result).toEqual({
      realm_name: "Test Realm",
      realm_icon: "/icon.png",
      external_authentication_methods: [
        { name: "google", display_name: "Google", login_url: "/google" },
      ],
    });
  });

  it("returns null on non-ok response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 403));
    const result = await fetchServerSettings("https://zulip.example.com");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await fetchServerSettings("https://zulip.example.com");
    expect(result).toBeNull();
  });

  it("returns null for empty realm URL", async () => {
    const result = await fetchServerSettings("  ");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("defaults missing fields to empty strings/arrays", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    const result = await fetchServerSettings("https://zulip.example.com");
    expect(result).toEqual({
      realm_name: "",
      realm_icon: "",
      external_authentication_methods: [],
    });
  });

  it("strips /api/v1 suffix before constructing URL", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    await fetchServerSettings("https://zulip.example.com/api/v1");
    expect(mockFetch).toHaveBeenCalledWith("https://zulip.example.com/api/v1/server_settings");
  });

  it("skips request for malformed realm hostname ending with dot", async () => {
    const result = await fetchServerSettings("https://chat.example.com.");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchApiKey — unauthenticated POST
// ---------------------------------------------------------------------------

describe("fetchApiKey", () => {
  it("returns api_key on success", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ result: "success", api_key: "abc123", email: "user@test.com", user_id: 42 }),
    );

    const result = await fetchApiKey("https://zulip.example.com", "user@test.com", "password");
    expect(result).toEqual({ api_key: "abc123", email: "user@test.com", user_id: 42 });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://zulip.example.com/api/v1/fetch_api_key",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("defaults user_id to 0 when missing", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ result: "success", api_key: "abc", email: "u@t.com" }),
    );
    const result = await fetchApiKey("https://z.com", "u@t.com", "pw");
    expect(result.user_id).toBe(0);
  });

  it("throws ZulipAuthError on auth failure", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ result: "error", msg: "Invalid credentials", code: "AUTH_FAILED" }, 403),
    );
    await expect(fetchApiKey("https://z.com", "u@t.com", "bad")).rejects.toThrow(ZulipAuthError);
  });

  it("throws ZulipAuthError on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchApiKey("https://z.com", "u@t.com", "pw")).rejects.toThrow(ZulipAuthError);
  });

  it("throws ZulipAuthError on invalid JSON response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
      headers: new Headers(),
    } as unknown as Response);

    await expect(fetchApiKey("https://z.com", "u@t.com", "pw")).rejects.toThrow(ZulipAuthError);
  });
});

// ---------------------------------------------------------------------------
// exchangeDesktopFlowToken — token-based external auth continuation
// ---------------------------------------------------------------------------

describe("exchangeDesktopFlowToken", () => {
  it("returns api_key auth payload when backend provides credentials", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          result: "success",
          email: "user@example.com",
          api_key: "k123456",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          email: "user@example.com",
        }),
      );

    const result = await exchangeDesktopFlowToken(
      "https://zulip.example.com",
      "desktop-login-token",
    );

    expect(result).toEqual({
      authType: "api_key",
      email: "user@example.com",
      apiKey: "k123456",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://zulip.example.com/accounts/login/subdomain/desktop-login-token",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("falls back to session auth when exchange succeeds without api key payload", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "success" })).mockResolvedValueOnce(
      jsonResponse({
        email: "session-user@example.com",
      }),
    );

    const result = await exchangeDesktopFlowToken("https://zulip.example.com", "session-token");

    expect(result).toEqual({
      authType: "session",
      email: "session-user@example.com",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://zulip.example.com/json/users/me",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("throws ZulipAuthError when exchange endpoint fails", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: "error", msg: "invalid token" }, 400));

    await expect(
      exchangeDesktopFlowToken("https://zulip.example.com", "broken-token"),
    ).rejects.toThrow(ZulipAuthError);
  });
});

// ---------------------------------------------------------------------------
// registerQueue — authenticated POST via shared client
// ---------------------------------------------------------------------------

describe("registerQueue", () => {
  it("returns queue_id and last_event_id on success", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        event_queue_longpoll_timeout_seconds: 90,
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message", "presence"]);
    expect(result).toEqual({
      queue_id: "q-123",
      last_event_id: -1,
      event_queue_longpoll_timeout_seconds: 90,
    });
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.post).toHaveBeenCalledWith("/register", {
      event_types: JSON.stringify(["message", "presence"]),
      fetch_event_types: JSON.stringify(["user_topics", "recent_private_conversations"]),
    });
  });

  it("throws on error result", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error", msg: "Rate limited", code: "RATE_LIMITED" },
      raw: { statusText: "OK" },
    });
    await expect(registerQueue(["message"])).rejects.toThrow("Rate limited");
  });

  it("throws on missing queue_id", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await expect(registerQueue(["message"])).rejects.toThrow();
  });

  it("throws on invalid JSON", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: null,
      raw: { statusText: "OK" },
    });
    await expect(registerQueue(["message"])).rejects.toThrow();
  });

  it("parses recent_private_conversations from register payload", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-123",
        last_event_id: -1,
        recent_private_conversations: {
          "1": {
            user_ids: [10, 20],
            max_message_id: 777,
            unread_message_ids: [700, 701],
          },
        },
      },
      raw: { statusText: "OK" },
    });

    const result = await registerQueue(["message"]);
    expect(result.recent_private_conversations).toEqual({
      "1": {
        user_ids: [10, 20],
        max_message_id: 777,
        unread_message_ids: [700, 701],
      },
    });
  });
});

describe("registerQueueForCredentials", () => {
  it("registers queue via direct fetch for explicit credentials", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        result: "success",
        queue_id: "q-explicit",
        last_event_id: 44,
        event_queue_longpoll_timeout_seconds: 90,
      }),
    );

    const result = await registerQueueForCredentials(
      {
        realm: "https://other.example.com",
        email: "other@test.com",
        apiKey: "key",
      },
      ["message", "typing"],
    );

    expect(result).toEqual({
      queue_id: "q-explicit",
      last_event_id: 44,
      event_queue_longpoll_timeout_seconds: 90,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://other.example.com/api/v1/register",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails fast when credentials realm url uses unsupported protocol", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        result: "success",
        queue_id: "q-explicit",
        last_event_id: 44,
      }),
    );

    await expect(
      registerQueueForCredentials(
        {
          realm: "ftp://malicious.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        ["message"],
      ),
    ).rejects.toThrow(/registerQueueForCredentials\.realm/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteQueue — best-effort, swallows errors
// ---------------------------------------------------------------------------

describe("deleteQueue", () => {
  it("uses shared delete transport for the current instance path", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await deleteQueue("q-123");
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.delete).toHaveBeenCalledWith("/events", { queue_id: "q-123" });
  });

  it("does nothing when no instance and no credentials", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    await deleteQueue("q-123");
    expect(mockZulipApi.delete).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("swallows shared transport errors", async () => {
    mockZulipApi.delete.mockRejectedValue(new TypeError("Network error"));
    await expect(deleteQueue("q-123")).resolves.toBeUndefined();
  });

  it("keeps explicit-credentials cleanup on the raw fetch path", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    mockFetch.mockResolvedValue(jsonResponse({ result: "success" }));
    await deleteQueue("q-123", {
      realm: "https://other.example.com",
      email: "other@test.com",
      apiKey: "key",
    });
    expect(mockZulipApi.delete).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://other.example.com/api/v1/events",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("skips cleanup when queue id is blank", async () => {
    await deleteQueue("   ");
    await deleteQueue("", {
      realm: "https://other.example.com",
      email: "other@test.com",
      apiKey: "key",
    });

    expect(mockZulipApi.delete).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips explicit-credentials cleanup when realm url is invalid", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    mockFetch.mockResolvedValue(jsonResponse({ result: "success" }));

    await expect(
      deleteQueue("q-123", {
        realm: "ftp://malicious.example.com",
        email: "other@test.com",
        apiKey: "key",
      }),
    ).resolves.toBeUndefined();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchUnreadMessagesCountForCredentials
// ---------------------------------------------------------------------------

describe("fetchUnreadMessagesCountForCredentials", () => {
  it("returns unread count from messages payload", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        messages: [{ id: 1 }, { id: 2 }, { id: 3 }],
      }),
    );

    const count = await fetchUnreadMessagesCountForCredentials({
      realm: "https://other.example.com",
      email: "other@test.com",
      apiKey: "key",
    });

    expect(count).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArgs = mockFetch.mock.calls[0];
    const calledUrl = new URL(String(fetchArgs?.[0]));
    expect(fetchArgs?.[1]).toEqual(expect.objectContaining({ method: "GET" }));
    expect(calledUrl.origin).toBe("https://other.example.com");
    expect(calledUrl.pathname).toBe("/api/v1/messages");
    expect(calledUrl.searchParams.get("anchor")).toBe("newest");
    expect(calledUrl.searchParams.get("num_before")).toBe("5000");
    expect(calledUrl.searchParams.get("num_after")).toBe("0");
    expect(calledUrl.searchParams.get("narrow")).toBe(
      JSON.stringify([{ operator: "is", operand: "unread" }]),
    );
  });

  it("returns null on non-ok response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ result: "error" }, 500));

    const count = await fetchUnreadMessagesCountForCredentials({
      realm: "https://other.example.com",
      email: "other@test.com",
      apiKey: "key",
    });

    expect(count).toBeNull();
  });

  it("returns null without network call when realm url is invalid", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        messages: [{ id: 1 }],
      }),
    );

    const count = await fetchUnreadMessagesCountForCredentials({
      realm: "ftp://malicious.example.com",
      email: "other@test.com",
      apiKey: "key",
    });

    expect(count).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getEvents — long-polling
// ---------------------------------------------------------------------------

describe("getEvents", () => {
  it("returns events on success", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", events: [{ id: 1, type: "message" }] },
      raw: { statusText: "OK" },
    });

    const result = await getEvents("q-123", 0);
    expect(result.events).toHaveLength(1);
    expect(result.events![0]!.type).toBe("message");
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.get).toHaveBeenCalledWith(
      "/events",
      { queue_id: "q-123", last_event_id: "0" },
      expect.any(AbortSignal),
    );
  });

  it("throws when no instance", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    await expect(getEvents("q-123", 0)).rejects.toThrow();
  });

  it("returns error result for invalid JSON body", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: null,
      raw: { statusText: "OK" },
    });

    const result = await getEvents("q-123", 0);
    expect(result.result).toBe("error");
  });

  it("throws for blank queue id", async () => {
    await expect(getEvents("   ", 0)).rejects.toThrow(
      /getEvents\.queueId must be a non-empty string/i,
    );
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("throws for cursor below -1", async () => {
    await expect(getEvents("q-123", -2)).rejects.toThrow(
      /getEvents\.lastEventId must be an integer >= -1/i,
    );
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("throws for non-integer cursor", async () => {
    await expect(getEvents("q-123", 1.5)).rejects.toThrow(
      /getEvents\.lastEventId must be an integer >= -1/i,
    );
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("removes the outer abort listener after the request completes", async () => {
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", events: [{ id: 1, type: "message" }] },
      raw: { statusText: "OK" },
    });

    await getEvents("q-123", 0, { signal: controller.signal });

    expect(addSpy).toHaveBeenCalled();
    const addedAbortCall = addSpy.mock.calls.find((call) => call[0] === "abort");
    expect(addedAbortCall).toBeDefined();
    const addedHandler = addedAbortCall?.[1];
    expect(removeSpy).toHaveBeenCalledWith("abort", addedHandler);
  });
});

describe("getEventsForCredentials", () => {
  it("polls events using explicit credentials", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        result: "success",
        events: [{ id: 101, type: "message" }],
      }),
    );

    const result = await getEventsForCredentials(
      {
        realm: "https://other.example.com",
        email: "other@test.com",
        apiKey: "key",
      },
      "q-xyz",
      12,
    );

    expect(result.result).toBe("success");
    expect(result.events).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://other.example.com/api/v1/events?queue_id=q-xyz&last_event_id=12",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws when credentials realm url uses unsupported protocol", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        result: "success",
        events: [{ id: 101, type: "message" }],
      }),
    );

    await expect(
      getEventsForCredentials(
        {
          realm: "ftp://malicious.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        "q-xyz",
        12,
      ),
    ).rejects.toThrow(/getEventsForCredentials\.realm/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws for blank queue id", async () => {
    await expect(
      getEventsForCredentials(
        {
          realm: "https://other.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        "  ",
        12,
      ),
    ).rejects.toThrow(/getEventsForCredentials\.queueId must be a non-empty string/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws for cursor below -1", async () => {
    await expect(
      getEventsForCredentials(
        {
          realm: "https://other.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        "q-xyz",
        -2,
      ),
    ).rejects.toThrow(/getEventsForCredentials\.lastEventId must be an integer >= -1/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws for non-integer cursor", async () => {
    await expect(
      getEventsForCredentials(
        {
          realm: "https://other.example.com",
          email: "other@test.com",
          apiKey: "key",
        },
        "q-xyz",
        1.25,
      ),
    ).rejects.toThrow(/getEventsForCredentials\.lastEventId must be an integer >= -1/i);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCurrentUser — authenticated GET
// ---------------------------------------------------------------------------

describe("getCurrentUser", () => {
  it("delegates through zulipApi.get and refreshes base URL first", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_id: 42, full_name: "Alice", email: "alice@test.com" },
      raw: { statusText: "OK" },
    });

    const result = await getCurrentUser();

    expect(result).toEqual({ user_id: 42, full_name: "Alice", email: "alice@test.com" });
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.get).toHaveBeenCalledWith("/users/me", undefined);
  });

  it("returns user on success", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_id: 42, full_name: "Alice", email: "alice@test.com" },
      raw: { statusText: "OK" },
    });
    const result = await getCurrentUser();
    expect(result).toEqual({ user_id: 42, full_name: "Alice", email: "alice@test.com" });
  });

  it("returns null on non-ok response", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 401,
      data: {},
      raw: { statusText: "Unauthorized" },
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null on error result", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error" },
      raw: { statusText: "OK" },
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null on network error", async () => {
    mockZulipApi.get.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await getCurrentUser()).toBeNull();
  });

  it("defaults missing fields to empty strings", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_id: 1 },
      raw: { statusText: "OK" },
    });
    const result = await getCurrentUser();
    expect(result).toEqual({ user_id: 1, full_name: "", email: "" });
  });
});

// ---------------------------------------------------------------------------
// fetchUsers — authenticated GET
// ---------------------------------------------------------------------------

describe("fetchUsers", () => {
  it("returns members array on success", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { members: [{ user_id: 1, full_name: "Alice" }] },
      raw: { statusText: "OK" },
    });
    const result = await fetchUsers();
    expect(result).toHaveLength(1);
    expect(result[0]!.full_name).toBe("Alice");
    expect(mockZulipApi.get).toHaveBeenCalledWith("/users", {
      client_gravatar: "false",
      include_custom_profile_fields: "true",
    });
  });

  it("falls back to users array", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { users: [{ user_id: 2, full_name: "Bob" }] },
      raw: { statusText: "OK" },
    });
    const result = await fetchUsers();
    expect(result).toHaveLength(1);
    expect(result[0]!.full_name).toBe("Bob");
  });

  it("returns empty on error result", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error" },
      raw: { statusText: "OK" },
    });
    expect(await fetchUsers()).toEqual([]);
  });

  it("returns empty on non-ok response", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });
    expect(await fetchUsers()).toEqual([]);
  });

  it("returns empty on network error", async () => {
    mockZulipApi.get.mockRejectedValue(new TypeError("Offline"));
    expect(await fetchUsers()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchUser — authenticated GET with guard
// ---------------------------------------------------------------------------

describe("fetchUser", () => {
  it("returns user on success", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user: { user_id: 42, full_name: "Alice", email: "a@t.com", role: 200 } },
      raw: { statusText: "OK" },
    });
    const result = await fetchUser(42);
    expect(result).toEqual({ user_id: 42, full_name: "Alice", email: "a@t.com", role: 200 });
    expect(mockZulipApi.get).toHaveBeenCalledWith("/users/42", {
      client_gravatar: "false",
      include_custom_profile_fields: "true",
    });
  });

  it("throws for invalid userId (0)", async () => {
    await expect(fetchUser(0)).rejects.toThrow(/Invalid userId/);
  });

  it("throws for negative userId", async () => {
    await expect(fetchUser(-5)).rejects.toThrow(/Invalid userId/);
  });

  it("returns null on 404", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 404,
      data: {},
      raw: { statusText: "Not Found" },
    });
    expect(await fetchUser(42)).toBeNull();
  });

  it("returns null on error result", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error" },
      raw: { statusText: "OK" },
    });
    expect(await fetchUser(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchRealmPresence
// ---------------------------------------------------------------------------

describe("fetchRealmPresence", () => {
  it("returns presence data on success", async () => {
    const presences = { "alice@test.com": { aggregated: { status: "active", timestamp: 100 } } };
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { presences, server_timestamp: 200 },
      raw: { statusText: "OK" },
    });
    const result = await fetchRealmPresence();
    expect(result.presences).toEqual(presences);
  });

  it("returns error result on non-ok", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });
    expect(await fetchRealmPresence()).toEqual({ result: "error" });
  });

  it("returns error result on network failure", async () => {
    mockZulipApi.get.mockRejectedValue(new Error("Offline"));
    expect(await fetchRealmPresence()).toEqual({ result: "error" });
  });
});

// ---------------------------------------------------------------------------
// fetchRecentMessages — authenticated GET
// ---------------------------------------------------------------------------

describe("fetchRecentMessages", () => {
  it("returns messages on success", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [
          {
            id: 1,
            sender_id: 42,
            content: "hi",
            timestamp: 100,
            display_recipient: "general",
            subject: "test",
          },
        ],
      },
      raw: { statusText: "OK" },
    });
    const result = await fetchRecentMessages();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(1);
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages", {
      anchor: "newest",
      num_before: "1000",
      num_after: "0",
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: "false",
    });
  });

  it("returns empty array on non-ok", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });
    expect(await fetchRecentMessages()).toEqual([]);
  });

  it("returns empty array on error result", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error" },
      raw: { statusText: "OK" },
    });
    expect(await fetchRecentMessages()).toEqual([]);
  });

  it("returns empty array on transport error", async () => {
    mockZulipApi.get.mockRejectedValue(new SyntaxError("bad"));
    expect(await fetchRecentMessages()).toEqual([]);
  });
});

describe("fetchMessagesBeforeAnchor", () => {
  it("requests older messages window without including anchor", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 50, sender_id: 1, content: "older", timestamp: 10 }],
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchMessagesBeforeAnchor(100);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(50);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages", {
      anchor: "100",
      include_anchor: "false",
      num_before: "5000",
      num_after: "0",
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: "false",
    });
  });

  it("returns empty array on non-ok response", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });

    await expect(fetchMessagesBeforeAnchor(100)).resolves.toEqual([]);
  });
});

describe("fetchMessagesAfterAnchor", () => {
  it("requests newer messages window without including anchor", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 101, sender_id: 1, content: "new", timestamp: 11 }],
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchMessagesAfterAnchor(100);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(101);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages", {
      anchor: "100",
      include_anchor: "false",
      num_before: "0",
      num_after: "5000",
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: "false",
    });
  });

  it("returns empty array on transport error", async () => {
    mockZulipApi.get.mockRejectedValue(new Error("boom"));
    await expect(fetchMessagesAfterAnchor(100)).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchActivityMessages
// ---------------------------------------------------------------------------

describe("fetchActivityMessages", () => {
  it("fetches starred messages", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 1, sender_id: 1, content: "x", timestamp: 1 }],
      },
      raw: { statusText: "OK" },
    });
    const result = await fetchActivityMessages("starred");
    expect(result).toHaveLength(1);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages", {
      anchor: "newest",
      num_before: "200",
      num_after: "0",
      narrow: JSON.stringify([{ negated: false, operator: "is", operand: "starred" }]),
      allow_empty_topic_name: "true",
      client_gravatar: "true",
      apply_markdown: "false",
    });
  });

  it("returns empty on error", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error" },
      raw: { statusText: "OK" },
    });
    expect(await fetchActivityMessages("mentions")).toEqual([]);
  });
});

describe("fetchActivityMessagesPage", () => {
  it("preserves found-oldest metadata from the server", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 1, sender_id: 1, content: "x", timestamp: 1 }],
        found_oldest: true,
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchActivityMessagesPage("mentions");

    expect(result.foundOldest).toBe(true);
    expect(result.messages).toHaveLength(1);
  });

  it("fails fast when numeric anchor is invalid", async () => {
    await expect(fetchActivityMessagesPage("mentions", null, 0)).rejects.toThrowError(
      /fetchActivityMessagesPage\.anchor/i,
    );
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("fails fast when reactions filter receives invalid current user id", async () => {
    await expect(fetchActivityMessagesPage("reactions", 0)).rejects.toThrowError(
      /fetchActivityMessagesPage\.currentUserId/i,
    );
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchSubscriptions / fetchUserTopics / fetchMessageById / fetchStreamMembers
// ---------------------------------------------------------------------------

describe("fetchSubscriptions", () => {
  it("maps subscriptions and derives muted state", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        subscriptions: [
          { stream_id: 1, name: "general", is_muted: true },
          { stream_id: 2, name: "dev", in_home_view: false },
        ],
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      { stream_id: 1, name: "general", is_muted: true },
      { stream_id: 2, name: "dev", is_muted: true },
    ]);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/users/me/subscriptions", undefined);
  });
});

describe("fetchUserTopics", () => {
  it("returns user topic visibility overrides cached from register", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-with-topics",
        last_event_id: -1,
        user_topics: [{ stream_id: 10, topic_name: "bugs", visibility_policy: 1 }],
      },
      raw: { statusText: "OK" },
    });

    await registerQueue(["message", "user_topic"]);
    await expect(fetchUserTopics()).resolves.toEqual([
      { stream_id: 10, topic_name: "bugs", visibility_policy: 1 },
    ]);
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("returns empty array when register cache is not available", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      email: "uncached@example.com",
    });

    await expect(fetchUserTopics()).resolves.toEqual([]);
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });
});

describe("fetchMessageById", () => {
  it("returns mapped message data (flat response)", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: 100,
        sender_id: 42,
        sender_full_name: "Alice",
        content: "<p>hello</p>",
        timestamp: 1710000000,
        display_recipient: "general",
        subject: "test",
        type: "stream",
        stream_id: 10,
        raw_content: "hello",
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchMessageById(100);

    expect(result?.id).toBe(100);
    expect(result?.channel).toBe("general");
    expect(result?.markdown_source).toBe("hello");
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages/100", {
      allow_empty_topic_name: "true",
      apply_markdown: "false",
    });
  });

  it("returns mapped message data (nested message + raw_content)", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        raw_content: "**Bold**",
        message: {
          id: 50,
          sender_id: 7,
          sender_full_name: "Carol",
          content: "<p><strong>Bold</strong></p>",
          content_type: "text/html",
          timestamp: 200,
          display_recipient: "dev",
          subject: "topic",
          type: "stream",
          stream_id: 3,
        },
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchMessageById(50);
    expect(result?.id).toBe(50);
    expect(result?.content).toBe("<p><strong>Bold</strong></p>");
    expect(result?.markdown_source).toBe("**Bold**");
  });
});

describe("fetchStreamMembers", () => {
  it("returns subscriber ids", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { subscribers: [1, 2, 3] },
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamMembers(10)).resolves.toEqual([1, 2, 3]);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/streams/10/members", undefined);
  });
});

describe("fetchTopics", () => {
  it("returns topic names for an existing stream", async () => {
    mockZulipClient.streams.retrieve.mockResolvedValue({
      streams: [{ stream_id: 10, name: "engineering" }],
    });
    mockZulipClient.streams.topics.retrieve.mockResolvedValue({
      topics: [{ name: "planning" }, { name: "release" }],
    });

    await expect(fetchTopics("engineering")).resolves.toEqual(["planning", "release"]);
    expect(mockZulipClient.streams.topics.retrieve).toHaveBeenCalledWith({ stream_id: 10 });
  });

  it("returns empty array when stream is not found", async () => {
    mockZulipClient.streams.retrieve.mockResolvedValue({
      streams: [{ stream_id: 10, name: "engineering" }],
    });

    await expect(fetchTopics("design")).resolves.toEqual([]);
    expect(mockZulipClient.streams.topics.retrieve).not.toHaveBeenCalled();
  });

  it("throws when stream name is blank", async () => {
    await expect(fetchTopics("   ")).rejects.toThrow(
      /fetchTopics\.stream must be a non-empty string/,
    );
    expect(mockZulipClient.streams.retrieve).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchStreams — uses zulip-js client
// ---------------------------------------------------------------------------

describe("fetchStreams", () => {
  it("returns mapped streams", async () => {
    mockZulipClient.streams.retrieve.mockResolvedValue({
      streams: [
        { stream_id: 1, name: "general", description: "Main" },
        { stream_id: 2, name: "dev" },
      ],
    });

    const result = await fetchStreams();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      stream_id: 1,
      name: "general",
      description: "Main",
      is_announcement_only: false,
    });
    expect(result[1]!.description).toBe("");
  });
});

// ---------------------------------------------------------------------------
// fetchMessages — uses zulip-js client
// ---------------------------------------------------------------------------

describe("fetchMessages", () => {
  it("returns mapped messages with narrow", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({
      messages: [
        {
          id: 10,
          sender_id: 1,
          content: "test",
          timestamp: 100,
          display_recipient: "general",
          subject: "topic1",
        },
      ],
    });

    const result = await fetchMessages("general", "topic1");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(10);
  });

  it("returns empty array on error result", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ result: "error" });
    expect(await fetchMessages("general")).toEqual([]);
  });

  it("returns empty array on exception", async () => {
    mockZulipClient.messages.retrieve.mockRejectedValue(new Error("Network"));
    expect(await fetchMessages("general")).toEqual([]);
  });

  it("passes no narrow when no filters given", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });
    await fetchMessages();
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ narrow: undefined, apply_markdown: false }),
    );
  });

  it("throws when topic is provided without stream", async () => {
    await expect(fetchMessages(undefined, "bugs")).rejects.toThrow(
      /fetchMessages\.stream is required when topic is provided/,
    );
    expect(mockZulipClient.messages.retrieve).not.toHaveBeenCalled();
  });

  it("throws when stream name is blank", async () => {
    await expect(fetchMessages("   ")).rejects.toThrow(
      /fetchMessages\.stream must be a non-empty string/,
    );
    expect(mockZulipClient.messages.retrieve).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent requests with identical filters", async () => {
    let resolveRetrieve!: (value: { messages: unknown[] }) => void;
    const retrievePromise = new Promise<{ messages: unknown[] }>((resolve) => {
      resolveRetrieve = resolve;
    });
    mockZulipClient.messages.retrieve.mockReturnValue(retrievePromise as never);

    const first = fetchMessages("general", "topic1");
    const second = fetchMessages("general", "topic1");

    await Promise.resolve();
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(1);

    resolveRetrieve({ messages: [] });
    await Promise.all([first, second]);
  });

  it("does not deduplicate requests with different filters", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });

    await Promise.all([fetchMessages("general", "topic1"), fetchMessages("general", "topic2")]);

    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(2);
  });

  it("starts a new request after previous in-flight request settles", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });

    await fetchMessages("general", "topic1");
    await fetchMessages("general", "topic1");

    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// fetchMessagesWithNarrow — generic narrow-based fetch
// ---------------------------------------------------------------------------

describe("fetchMessagesWithNarrow", () => {
  it("passes narrow, anchor, and counts to client", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });
    await fetchMessagesWithNarrow([{ operator: "is", operand: "unread" }], "newest", 200, 0);
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        narrow: [{ operator: "is", operand: "unread" }],
        anchor: "newest",
        num_before: 200,
        num_after: 0,
        apply_markdown: false,
      }),
    );
  });

  it("returns empty on error result", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ result: "error" });
    expect(await fetchMessagesWithNarrow([])).toEqual([]);
  });

  it("throws for unsupported anchor string", async () => {
    await expect(
      fetchMessagesWithNarrow([{ operator: "is", operand: "unread" }], "invalid_anchor"),
    ).rejects.toThrow(/anchor must be one of/i);
    expect(mockZulipClient.messages.retrieve).not.toHaveBeenCalled();
  });

  it("throws for invalid numeric anchor", async () => {
    await expect(fetchMessagesWithNarrow([], 0)).rejects.toThrow(/Invalid messageId/);
    expect(mockZulipClient.messages.retrieve).not.toHaveBeenCalled();
  });

  it("throws for negative numBefore", async () => {
    await expect(fetchMessagesWithNarrow([], "newest", -1, 0)).rejects.toThrow(
      /numBefore must be a non-negative integer/i,
    );
    expect(mockZulipClient.messages.retrieve).not.toHaveBeenCalled();
  });

  it("throws for negative numAfter", async () => {
    await expect(fetchMessagesWithNarrow([], "newest", 0, -1)).rejects.toThrow(
      /numAfter must be a non-negative integer/i,
    );
    expect(mockZulipClient.messages.retrieve).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent requests with identical narrow parameters", async () => {
    let resolveRetrieve!: (value: { messages: unknown[] }) => void;
    const retrievePromise = new Promise<{ messages: unknown[] }>((resolve) => {
      resolveRetrieve = resolve;
    });
    mockZulipClient.messages.retrieve.mockReturnValue(retrievePromise as never);

    const first = fetchMessagesWithNarrow(
      [{ operator: "is", operand: "unread" }],
      "newest",
      200,
      0,
    );
    const second = fetchMessagesWithNarrow(
      [{ operator: "is", operand: "unread" }],
      "newest",
      200,
      0,
    );

    await Promise.resolve();
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(1);

    resolveRetrieve({ messages: [] });
    await Promise.all([first, second]);
  });

  it("does not deduplicate requests when anchor differs", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });

    await Promise.all([
      fetchMessagesWithNarrow([{ operator: "is", operand: "unread" }], "newest", 200, 0),
      fetchMessagesWithNarrow([{ operator: "is", operand: "unread" }], "oldest", 200, 0),
    ]);

    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(2);
  });

  it("starts a new request after previous in-flight request settles", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });

    await fetchMessagesWithNarrow([{ operator: "is", operand: "unread" }], "newest", 200, 0);
    await fetchMessagesWithNarrow([{ operator: "is", operand: "unread" }], "newest", 200, 0);

    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(2);
  });

  it("does not deduplicate requests between different instances", async () => {
    const resolves: ((value: { messages: unknown[] }) => void)[] = [];
    mockZulipClient.messages.retrieve.mockImplementation(
      () =>
        new Promise<{ messages: unknown[] }>((resolve) => {
          resolves.push(resolve);
        }) as never,
    );

    vi.mocked(getCurrentInstance).mockReturnValue({ ...TEST_INSTANCE, id: "instance-1" });
    const first = fetchMessagesWithNarrow(
      [{ operator: "is", operand: "unread" }],
      "newest",
      200,
      0,
    );

    vi.mocked(getCurrentInstance).mockReturnValue({ ...TEST_INSTANCE, id: "instance-2" });
    const second = fetchMessagesWithNarrow(
      [{ operator: "is", operand: "unread" }],
      "newest",
      200,
      0,
    );

    await Promise.resolve();
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(2);

    for (const resolve of resolves) {
      resolve({ messages: [] });
    }
    await Promise.all([first, second]);
  });
});

// ---------------------------------------------------------------------------
// fetchAllMessagesPage — all-messages pagination via API pipeline
// ---------------------------------------------------------------------------

describe("fetchAllMessagesPage", () => {
  it("throws for unsupported anchor string", async () => {
    await expect(fetchAllMessagesPage("invalid_anchor")).rejects.toThrow(/anchor must be one of/i);
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("throws for invalid numeric anchor", async () => {
    await expect(fetchAllMessagesPage(0)).rejects.toThrow(/Invalid messageId/);
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("throws for negative numBefore", async () => {
    await expect(fetchAllMessagesPage("newest", -5)).rejects.toThrow(
      /numBefore must be a non-negative integer/i,
    );
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchDmMessages — использует zulip-js клиент
// ---------------------------------------------------------------------------

describe("fetchDmMessages", () => {
  it("returns DM messages for a single user", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({
      messages: [
        { id: 1, sender_id: 42, content: "dm", timestamp: 100, type: "private", stream_id: null },
      ],
    });
    const result = await fetchDmMessages(42);
    expect(result).toHaveLength(1);
    expect(result[0]!.stream_id).toBeNull();
  });

  it("handles array of user IDs", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });
    await fetchDmMessages([42, 43]);
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalled();
  });

  it("returns empty for group DM offset IDs (>=2_000_000)", async () => {
    const result = await fetchDmMessages([2_000_001]);
    expect(result).toEqual([]);
    expect(mockZulipClient.messages.retrieve).not.toHaveBeenCalled();
  });

  it("returns empty on exception", async () => {
    mockZulipClient.messages.retrieve.mockRejectedValue(new Error("fail"));
    expect(await fetchDmMessages(42)).toEqual([]);
  });

  it("throws for invalid user id", async () => {
    await expect(fetchDmMessages([0])).rejects.toThrow(/Invalid userId/);
    expect(mockZulipClient.messages.retrieve).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent requests for the same DM key", async () => {
    let resolveRetrieve!: (value: { messages: unknown[] }) => void;
    const retrievePromise = new Promise<{ messages: unknown[] }>((resolve) => {
      resolveRetrieve = resolve;
    });
    mockZulipClient.messages.retrieve.mockReturnValue(retrievePromise as never);

    const first = fetchDmMessages(42);
    const second = fetchDmMessages(42);

    await Promise.resolve();
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(1);

    resolveRetrieve({
      messages: [
        { id: 11, sender_id: 42, content: "dm", timestamp: 100, type: "private", stream_id: null },
      ],
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toHaveLength(1);
    expect(secondResult).toEqual(firstResult);
  });

  it("deduplicates concurrent requests for equivalent participant sets", async () => {
    let resolveRetrieve!: (value: { messages: unknown[] }) => void;
    const retrievePromise = new Promise<{ messages: unknown[] }>((resolve) => {
      resolveRetrieve = resolve;
    });
    mockZulipClient.messages.retrieve.mockReturnValue(retrievePromise as never);

    const first = fetchDmMessages([42, 77]);
    const second = fetchDmMessages([77, 42]);

    await Promise.resolve();
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(1);

    resolveRetrieve({ messages: [] });
    await Promise.all([first, second]);
  });

  it("starts a new request after previous in-flight request settles", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });

    await fetchDmMessages(42);
    await fetchDmMessages(42);

    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// sendMessage — использует zulip-js клиент
// ---------------------------------------------------------------------------

describe("sendMessage", () => {
  it("returns the authoritative server message when follow-up fetch succeeds", async () => {
    mockZulipClient.messages.send.mockResolvedValue({ id: 100 });
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: 100,
        sender_id: 42,
        sender_full_name: "Alice",
        content: "<p>hello</p>",
        timestamp: 1710000000,
        display_recipient: "general",
        subject: "test",
        type: "stream",
        stream_id: 10,
        flags: ["read"],
        reactions: [],
      },
      raw: { statusText: "OK" },
    });

    const result = await sendMessage({
      stream: "general",
      streamId: 10,
      subject: "test",
      content: "hello",
    });

    expect(result).toEqual({
      id: 100,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      display_recipient: "general",
      channel: "general",
      subject: "test",
      content: "<p>hello</p>",
      timestamp: 1710000000,
      flags: ["read"],
      reactions: [],
    });
  });

  it("falls back to synthetic stream payload when follow-up fetch fails", async () => {
    mockZulipClient.messages.send.mockResolvedValue({ id: 100 });
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 404,
      data: { msg: "not found" },
      raw: { statusText: "Not Found" },
    });

    const result = await sendMessage({
      stream: "general",
      streamId: 10,
      subject: "test",
      content: "hello",
      sender_id: 7,
      sender_full_name: "You",
    });

    expect(result.id).toBe(100);
    expect(result.sender_id).toBe(7);
    expect(result.sender_full_name).toBe("You");
    expect(result.stream_id).toBe(10);
    expect(result.display_recipient).toBe("general");
    expect(result.subject).toBe("test");
    expect(result.content).toBe("hello");
  });

  it("sends a stream message", async () => {
    mockZulipClient.messages.send.mockResolvedValue({ id: 100 });
    const result = await sendMessage({
      stream: "general",
      streamId: 10,
      subject: "test",
      content: "hello",
    });
    expect(result.id).toBe(100);
    expect(result.stream_id).toBe(10);
    expect(result.display_recipient).toBe("general");
    expect(result.channel).toBe("general");
    expect(result.subject).toBe("test");
    expect(mockZulipClient.messages.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stream", to: "general", topic: "test", content: "hello" }),
    );
  });

  it("sends a private message", async () => {
    mockZulipClient.messages.send.mockResolvedValue({ id: 101 });
    const result = await sendMessage({ to: [42], content: "hi" });
    expect(result.id).toBe(101);
    expect(result.stream_id).toBeNull();
    expect(result.display_recipient).toEqual([{ id: 42, full_name: "" }]);
    expect(mockZulipClient.messages.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "private", to: [42], content: "hi" }),
    );
  });

  it("throws when private recipient id is invalid", async () => {
    await expect(sendMessage({ to: [0], content: "hi" })).rejects.toThrow(/Invalid userId/);
    expect(mockZulipClient.messages.send).not.toHaveBeenCalled();
  });

  it("throws when provided stream id is invalid", async () => {
    await expect(
      sendMessage({ stream: "engineering", streamId: 0, content: "hi" }),
    ).rejects.toThrow(/Invalid streamId/);
    expect(mockZulipClient.messages.send).not.toHaveBeenCalled();
  });

  it("throws when stream name is blank", async () => {
    await expect(sendMessage({ stream: "   ", content: "hi" })).rejects.toThrow(
      /sendMessage\.stream must be a non-empty string/,
    );
    expect(mockZulipClient.messages.send).not.toHaveBeenCalled();
  });

  it("throws when message content is blank", async () => {
    await expect(sendMessage({ stream: "engineering", content: "   " })).rejects.toThrow(
      /sendMessage\.content must be a non-empty string/,
    );
    expect(mockZulipClient.messages.send).not.toHaveBeenCalled();
  });

  it("defaults subject to 'general' for stream message", async () => {
    mockZulipClient.messages.send.mockResolvedValue({ id: 102 });
    const result = await sendMessage({ stream: "engineering", content: "test" });
    expect(result.subject).toBe("general");
  });

  it("throws when neither stream nor to is provided", async () => {
    await expect(sendMessage({ content: "orphan" })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// renderMessageContent — authenticated markdown preview rendering
// ---------------------------------------------------------------------------

describe("renderMessageContent", () => {
  it("renders markdown via Zulip messages/render endpoint", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", rendered: "<p><strong>Hello</strong></p>" },
      raw: { statusText: "OK" },
    });

    await expect(renderMessageContent("**Hello**")).resolves.toBe("<p><strong>Hello</strong></p>");
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.post).toHaveBeenCalledWith("/messages/render", { content: "**Hello**" });
  });

  it("throws for blank content", async () => {
    await expect(renderMessageContent("   ")).rejects.toThrow(
      /renderMessageContent\.content must be a non-empty string/,
    );
    expect(mockZulipApi.post).not.toHaveBeenCalled();
  });

  it("throws when render endpoint returns error", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: false,
      status: 400,
      data: { result: "error", msg: "Bad markdown" },
      raw: { statusText: "Bad Request" },
    });

    await expect(renderMessageContent("**broken**")).rejects.toThrow("Bad markdown");
  });
});

// ---------------------------------------------------------------------------
// updateMessage — authenticated PATCH with guard
// ---------------------------------------------------------------------------

describe("updateMessage", () => {
  it("updates message content", async () => {
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await expect(updateMessage(42, { content: "updated" })).resolves.toBeUndefined();
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/messages/42", { content: "updated" });
  });

  it("throws for invalid messageId", async () => {
    await expect(updateMessage(0, { content: "x" })).rejects.toThrow(/Invalid messageId/);
  });

  it("throws for blank content", async () => {
    await expect(updateMessage(42, { content: "   " })).rejects.toThrow(
      /updateMessage\.content must be a non-empty string/,
    );
    expect(mockZulipApi.patch).not.toHaveBeenCalled();
  });

  it("throws on non-ok response with error message", async () => {
    mockZulipApi.patch.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Not allowed" },
      raw: { statusText: "Forbidden" },
    });
    await expect(updateMessage(42, { content: "x" })).rejects.toThrow("Not allowed");
  });
});

// ---------------------------------------------------------------------------
// deleteMessage — authenticated DELETE with guard
// ---------------------------------------------------------------------------

describe("deleteMessage", () => {
  it("deletes a message", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await expect(deleteMessage(42)).resolves.toBeUndefined();
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.delete).toHaveBeenCalledWith("/messages/42", undefined);
  });

  it("throws for invalid messageId", async () => {
    await expect(deleteMessage(0)).rejects.toThrow(/Invalid messageId/);
  });

  it("throws on non-ok response", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });
    await expect(deleteMessage(42)).rejects.toThrow("Forbidden");
  });
});

describe("updateStream", () => {
  it("patches stream name and description", async () => {
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(
      updateStream(10, { name: "platform", description: "Platform discussions" }),
    ).resolves.toBe(true);
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/streams/10", {
      new_name: "platform",
      description: "Platform discussions",
    });
  });

  it("returns false when stream update API is not ok", async () => {
    mockZulipApi.patch.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(updateStream(10, { name: "platform" })).resolves.toBe(false);
  });
});

describe("deleteStream", () => {
  it("deletes stream by id", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(deleteStream(10)).resolves.toBe(true);
    expect(mockZulipApi.delete).toHaveBeenCalledWith("/streams/10", undefined);
  });

  it("returns false on delete failure", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Bad request" },
      raw: { statusText: "Bad Request" },
    });

    await expect(deleteStream(10)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addReaction — authenticated POST with guard
// ---------------------------------------------------------------------------

describe("addReaction", () => {
  it("adds a reaction", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await expect(addReaction(42, "thumbs_up")).resolves.toBeUndefined();
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.post).toHaveBeenCalledWith("/messages/42/reactions", {
      emoji_name: "thumbs_up",
      reaction_type: "unicode_emoji",
    });
  });

  it("throws for invalid messageId", async () => {
    await expect(addReaction(-1, "thumbs_up")).rejects.toThrow(/Invalid messageId/);
  });

  it("throws for blank emoji name", async () => {
    await expect(addReaction(42, "   ")).rejects.toThrow(
      /addReaction\.emojiName must be a non-empty string/,
    );
    expect(mockZulipApi.post).not.toHaveBeenCalled();
  });

  it("silently handles REACTION_ALREADY_EXISTS", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Already exists", code: "REACTION_ALREADY_EXISTS" },
      raw: { statusText: "Bad Request" },
    });
    await expect(addReaction(42, "thumbs_up")).resolves.toBeUndefined();
  });

  it("throws on other non-ok errors", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: false,
      status: 500,
      data: { msg: "Server error" },
      raw: { statusText: "Server Error" },
    });
    await expect(addReaction(42, "thumbs_up")).rejects.toThrow("Server error");
  });
});

// ---------------------------------------------------------------------------
// removeReaction — authenticated DELETE with guard
// ---------------------------------------------------------------------------

describe("removeReaction", () => {
  it("removes a reaction", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await expect(removeReaction(42, "thumbs_up")).resolves.toBeUndefined();
    expect(mockZulipApi.delete).toHaveBeenCalledWith("/messages/42/reactions", {
      emoji_name: "thumbs_up",
    });
  });

  it("throws on non-ok response", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: false,
      status: 404,
      data: { msg: "Not found" },
      raw: { statusText: "Not Found" },
    });
    await expect(removeReaction(42, "thumbs_up")).rejects.toThrow("Not found");
  });

  it("throws for blank emoji name", async () => {
    await expect(removeReaction(42, "   ")).rejects.toThrow(
      /removeReaction\.emojiName must be a non-empty string/,
    );
    expect(mockZulipApi.delete).not.toHaveBeenCalled();
  });

  it("passes optional emojiCode and reactionType", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await removeReaction(42, "emoji", { emojiCode: "1f44d", reactionType: "unicode_emoji" });
    expect(mockZulipApi.delete).toHaveBeenCalledWith("/messages/42/reactions", {
      emoji_name: "emoji",
      emoji_code: "1f44d",
      reaction_type: "unicode_emoji",
    });
  });
});

// ---------------------------------------------------------------------------
// markMessagesAsRead
// ---------------------------------------------------------------------------

describe("markMessagesAsRead", () => {
  it("posts flag update for message IDs", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await markMessagesAsRead([1, 2, 3]);
    expect(mockZulipApi.post).toHaveBeenCalledWith("/messages/flags", {
      messages: "[1,2,3]",
      op: "add",
      flag: "read",
    });
  });

  it("does nothing for empty array", async () => {
    await markMessagesAsRead([]);
    expect(mockZulipApi.post).not.toHaveBeenCalled();
  });

  it("throws for invalid message id", async () => {
    await expect(markMessagesAsRead([1, 0])).rejects.toThrow(/Invalid messageId/);
    expect(mockZulipApi.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markDmAsRead
// ---------------------------------------------------------------------------

describe("markDmAsRead", () => {
  it("returns true on success", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    const result = await markDmAsRead([42]);
    expect(result).toBe(true);
    expect(mockZulipApi.post).toHaveBeenCalledWith("/messages/flags/narrow", {
      anchor: "newest",
      include_anchor: "false",
      num_before: "5000",
      num_after: "0",
      narrow: JSON.stringify([{ operator: "dm", operand: [42] }]),
      op: "add",
      flag: "read",
    });
  });

  it("returns false on non-ok response", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });
    const result = await markDmAsRead([42]);
    expect(result).toBe(false);
  });

  it("throws for empty ids list", async () => {
    await expect(markDmAsRead([])).rejects.toThrow(/non-empty array/i);
  });

  it("throws for invalid user id", async () => {
    await expect(markDmAsRead([0])).rejects.toThrow(/Invalid userId/i);
  });
});

// ---------------------------------------------------------------------------
// markStreamAsRead
// ---------------------------------------------------------------------------

describe("markStreamAsRead", () => {
  it("returns true on success", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    const result = await markStreamAsRead(10);
    expect(result).toBe(true);
    expect(mockZulipApi.post).toHaveBeenCalledWith("/messages/flags/narrow", {
      anchor: "newest",
      include_anchor: "false",
      num_before: "5000",
      num_after: "0",
      narrow: JSON.stringify([{ operator: "stream", operand: 10 }]),
      op: "add",
      flag: "read",
    });
  });

  it("returns false on non-ok", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });
    const result = await markStreamAsRead(10);
    expect(result).toBe(false);
  });

  it("throws for invalid streamId", async () => {
    await expect(markStreamAsRead(0)).rejects.toThrow(/Invalid streamId/);
  });
});

// ---------------------------------------------------------------------------
// markTopicAsRead
// ---------------------------------------------------------------------------

describe("markTopicAsRead", () => {
  it("returns true on success", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    const result = await markTopicAsRead(10, "bugs");
    expect(result).toBe(true);
    expect(mockZulipApi.post).toHaveBeenCalledWith("/messages/flags/narrow", {
      anchor: "newest",
      include_anchor: "false",
      num_before: "5000",
      num_after: "0",
      narrow: JSON.stringify([
        { operator: "stream", operand: 10 },
        { operator: "topic", operand: "bugs" },
      ]),
      op: "add",
      flag: "read",
    });
  });

  it("throws for invalid streamId", async () => {
    await expect(markTopicAsRead(0, "bugs")).rejects.toThrow(/Invalid streamId/);
  });

  it("throws for empty topic", async () => {
    await expect(markTopicAsRead(10, "")).rejects.toThrow(/non-empty string/);
  });
});

// ---------------------------------------------------------------------------
// setTopicResolvedState
// ---------------------------------------------------------------------------

describe("setTopicResolvedState", () => {
  it("renames topic to resolved variant", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 501 }],
      },
      raw: { statusText: "OK" },
    });
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(setTopicResolvedState(10, "incident", true)).resolves.toBe(true);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages", {
      anchor: "oldest",
      num_before: "0",
      num_after: "1",
      include_anchor: "true",
      allow_empty_topic_name: "true",
      client_gravatar: "false",
      apply_markdown: "false",
      narrow: JSON.stringify([
        { operator: "stream", operand: 10 },
        { operator: "topic", operand: "incident" },
      ]),
    });
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/messages/501", {
      topic: "\u2714 incident",
      propagate_mode: "change_all",
      send_notification_to_old_thread: "false",
      send_notification_to_new_thread: "false",
      send_webhook_notifications: "false",
    });
  });

  it("renames topic to unresolved variant", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 777 }],
      },
      raw: { statusText: "OK" },
    });
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(setTopicResolvedState(10, "\u2714 incident", false)).resolves.toBe(true);
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/messages/777", {
      topic: "incident",
      propagate_mode: "change_all",
      send_notification_to_old_thread: "false",
      send_notification_to_new_thread: "false",
      send_webhook_notifications: "false",
    });
  });

  it("returns false when topic has no anchor message", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", messages: [] },
      raw: { statusText: "OK" },
    });

    await expect(setTopicResolvedState(10, "incident", true)).resolves.toBe(false);
    expect(mockZulipApi.patch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateMessageFlags
// ---------------------------------------------------------------------------

describe("updateMessageFlags", () => {
  it("posts add flag request", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await updateMessageFlags([1, 2], "add", "starred");
    expect(mockZulipApi.post).toHaveBeenCalledWith("/messages/flags", {
      messages: "[1,2]",
      op: "add",
      flag: "starred",
    });
  });

  it("does nothing for empty array", async () => {
    await updateMessageFlags([], "add", "starred");
    expect(mockZulipApi.post).not.toHaveBeenCalled();
  });

  it("throws for invalid message id", async () => {
    await expect(updateMessageFlags([1, -5], "add", "read")).rejects.toThrow(/Invalid messageId/);
    expect(mockZulipApi.post).not.toHaveBeenCalled();
  });

  it("throws for blank flag name", async () => {
    await expect(updateMessageFlags([1], "add", "   ")).rejects.toThrow(
      /updateMessageFlags\.flag must be a non-empty string/,
    );
    expect(mockZulipApi.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// uploadFile — authenticated POST with FormData
// ---------------------------------------------------------------------------

describe("uploadFile", () => {
  it("returns URI on success", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uri: "/user_uploads/1/test.png" },
      raw: { statusText: "OK" },
    });
    const file = new File(["data"], "test.png", { type: "image/png" });
    const result = await uploadFile(file);
    expect(result).toBe("/user_uploads/1/test.png");
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.postFormData).toHaveBeenCalledWith("/user_uploads", expect.any(FormData));
  });

  it("falls back to url field", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: { url: "/uploads/2/file.pdf" },
      raw: { statusText: "OK" },
    });
    const file = new File(["data"], "file.pdf");
    expect(await uploadFile(file)).toBe("/uploads/2/file.pdf");
  });

  it("passes abort signal to multipart upload when provided", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uri: "/user_uploads/2/cancellable.txt" },
      raw: { statusText: "OK" },
    });
    const file = new File(["data"], "cancellable.txt", { type: "text/plain" });
    const controller = new AbortController();
    const uploadWithOptions = uploadFile as unknown as (
      file: File,
      options?: { signal?: AbortSignal },
    ) => Promise<string>;

    const result = await uploadWithOptions(file, { signal: controller.signal });
    expect(result).toBe("/user_uploads/2/cancellable.txt");
    expect(mockZulipApi.postFormData).toHaveBeenCalledWith(
      "/user_uploads",
      expect.any(FormData),
      controller.signal,
    );
  });

  it("uses TUS flow for large files and resolves uploaded URI from attachments", async () => {
    const sixteenMb = 16 * 1024 * 1024;
    const largeFile = new File([new Uint8Array(sixteenMb)], "large-video.mp4", {
      type: "video/mp4",
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ Location: "/api/v1/tus/upload-1" }),
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "Upload-Offset": "0" }),
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ "Upload-Offset": "5242880" }),
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ "Upload-Offset": "10485760" }),
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ "Upload-Offset": "15728640" }),
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ "Upload-Offset": String(sixteenMb) }),
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockResolvedValueOnce(
        jsonResponse({
          attachments: [
            {
              name: "large-video.mp4",
              size: sixteenMb,
              path_id: "1/large-video.mp4",
              create_time: 1710012345,
            },
          ],
        }),
      );

    const uri = await uploadFile(largeFile);

    expect(uri).toBe("/user_uploads/1/large-video.mp4");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://zulip.example.com/api/v1/tus",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(mockZulipApi.postFormData).not.toHaveBeenCalled();
  });

  it("falls back to multipart upload when TUS is unavailable", async () => {
    const sixteenMb = 16 * 1024 * 1024;
    const largeFile = new File([new Uint8Array(sixteenMb)], "large.zip", {
      type: "application/zip",
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: () => Promise.resolve({ msg: "Not found" }),
    } as unknown as Response);
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uri: "/user_uploads/legacy/large.zip" },
      raw: { statusText: "OK" },
    });

    const uri = await uploadFile(largeFile);

    expect(uri).toBe("/user_uploads/legacy/large.zip");
    expect(mockZulipApi.postFormData).toHaveBeenCalledWith("/user_uploads", expect.any(FormData));
  });

  it("throws when no instance", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    const file = new File(["data"], "test.png");
    await expect(uploadFile(file)).rejects.toThrow();
  });

  it("throws on non-ok response", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: false,
      status: 413,
      data: { msg: "Too large" },
      raw: { statusText: "Payload Too Large" },
    });
    const file = new File(["data"], "big.zip");
    await expect(uploadFile(file)).rejects.toThrow("Too large");
  });

  it("throws when no URI returned", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: {},
      raw: { statusText: "OK" },
    });
    const file = new File(["data"], "test.png");
    await expect(uploadFile(file)).rejects.toThrow("No URI returned");
  });

  it("throws when file is empty before upload request", async () => {
    const file = new File([], "empty.txt", { type: "text/plain" });
    await expect(uploadFile(file)).rejects.toThrow("File is empty");
    expect(mockZulipApi.postFormData).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchUsersAvatarMap
// ---------------------------------------------------------------------------

describe("fetchUsersAvatarMap", () => {
  it("returns user_id to avatar_url map", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        members: [
          { user_id: 1, avatar_url: "/avatar/1.png" },
          { user_id: 2, avatar_url: "" },
          { user_id: 3, avatar_url: "/avatar/3.png" },
        ],
      },
      raw: { statusText: "OK" },
    });
    const map = await fetchUsersAvatarMap();
    expect(map.size).toBe(2);
    expect(map.get(1)).toBe("/avatar/1.png");
    expect(map.get(3)).toBe("/avatar/3.png");
    expect(map.has(2)).toBe(false);
  });
});
