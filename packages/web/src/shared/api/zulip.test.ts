// Тесты для клиента Zulip API: HTTP-функций, преобразований данных и guard-проверок.
//
// Покрывает auth-потоки, загрузку пользователей и presence,
// CRUD сообщений, реакции, флаги, управление очередью, upload файлов и чистые mapper-функции.
// Функции на `zulip-js` тестируются через mock client,
// а прямые fetch-вызовы — через stubbed global fetch.
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
  getCurrentUser,
  fetchUsers,
  fetchUser,
  fetchRealmPresence,
  fetchRealmEmojis,
  fetchRecentMessages,
  fetchRecentStreamMessagesForSidebarPreview,
  fetchStreamChannelMessagesForSidebarTopics,
  fetchStreamUnreadMessagesForSidebarPreview,
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
const mockRefreshWorkspaceApiBase = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  getCurrentInstance: vi.fn(),
  zulipApi: mockZulipApi,
  refreshZulipApiBase: mockRefreshZulipApiBase,
  refreshWorkspaceApiBase: mockRefreshWorkspaceApiBase,
}));

vi.mock("~/shared/lib/auth-guard", () => ({
  getBasicAuthValue: () => "Basic dGVzdEB0LmNvbTprZXkxMjM=",
  buildAuthHeader: () => ({ Authorization: "Basic dGVzdEB0LmNvbTprZXkxMjM=" }),
  setAuthInstanceGetter: vi.fn(),
}));

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

const mockEnv = vi.hoisted(() => ({
  ZULIP_API_PATH: "/api/v1",
}));

vi.mock("~/shared/lib/env", () => ({
  env: mockEnv,
}));

vi.mock("~/shared/lib/logger", async (importOriginal) => {
  const { createPartialLoggerMock } = await import("~/test/logger-vitest-mock");
  return createPartialLoggerMock(
    importOriginal as () => Promise<typeof import("~/shared/lib/logger")>,
  );
});

vi.mock("zulip-js", () => ({
  default: vi.fn(() => Promise.resolve(mockZulipClient)),
}));

// ---------------------------------------------------------------------------
// Вспомогательные функции
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
  mockRefreshWorkspaceApiBase.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// `rawMessageToMockMessage` — чистый mapper, mock не нужен
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
// `getRealmBaseUrl`
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
// `fetchServerSettings` — без авторизации, использует raw fetch
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
// `fetchApiKey` — POST без авторизации
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
    });

    await expect(fetchApiKey("https://z.com", "u@t.com", "pw")).rejects.toThrow(ZulipAuthError);
  });
});

// ---------------------------------------------------------------------------
// `exchangeDesktopFlowToken` — продолжение внешней auth-схемы по токену
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
// Stream sidebar preview (metadata-first, channels only)
// ---------------------------------------------------------------------------

describe("fetchStreamUnreadMessagesForSidebarPreview", () => {
  it("requests is:unread with -is:dm narrow", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 1, type: "stream", stream_id: 5 }],
      },
      raw: { statusText: "OK" },
    });

    const messages = await fetchStreamUnreadMessagesForSidebarPreview(5000);

    expect(messages).toHaveLength(1);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages", {
      anchor: "newest",
      num_before: "5000",
      num_after: "0",
      narrow: JSON.stringify([
        { operator: "is", operand: "unread" },
        { negated: true, operator: "is", operand: "dm" },
      ]),
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: "false",
    });
  });
});

describe("fetchStreamChannelMessagesForSidebarTopics", () => {
  it("requests newest messages with stream narrow for one channel", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 3, type: "stream", stream_id: 42, subject: "t" }],
      },
      raw: { statusText: "OK" },
    });

    const messages = await fetchStreamChannelMessagesForSidebarTopics(42, 100);

    expect(messages).toHaveLength(1);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages", {
      anchor: "newest",
      num_before: "100",
      num_after: "0",
      narrow: JSON.stringify([{ operator: "stream", operand: 42 }]),
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: "false",
    });
  });
});

describe("fetchRecentStreamMessagesForSidebarPreview", () => {
  it("requests recent messages with -is:dm narrow only", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 2, type: "stream", stream_id: 9 }],
      },
      raw: { statusText: "OK" },
    });

    const messages = await fetchRecentStreamMessagesForSidebarPreview(5000);

    expect(messages).toHaveLength(1);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages", {
      anchor: "newest",
      num_before: "5000",
      num_after: "0",
      narrow: JSON.stringify([{ negated: true, operator: "is", operand: "dm" }]),
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: "false",
    });
  });
});

// ---------------------------------------------------------------------------
// `getCurrentUser` — авторизованный GET
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
// `fetchUsers` — авторизованный GET
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
// `fetchUser` — авторизованный GET с guard-проверкой
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
// `fetchRealmPresence`
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

describe("fetchRealmEmojis", () => {
  it("returns normalized custom emojis and filters invalid/deactivated rows", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        emoji: {
          "42": {
            id: "42",
            name: "green_tick",
            source_url: "/user_uploads/1/aa/green_tick.png",
          },
          "43": {
            id: 43,
            name: "party_node",
            source_url: "https://cdn.example.com/party_node.png",
          },
          "44": {
            id: "44",
            name: "disabled",
            source_url: "/user_uploads/1/aa/disabled.png",
            deactivated: true,
          },
          "45": {
            id: "45",
            name: "",
            source_url: "/user_uploads/1/aa/invalid.png",
          },
        },
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchRealmEmojis()).resolves.toEqual([
      {
        id: "42",
        names: ["green_tick"],
        imgUrl: "https://zulip.example.com/user_uploads/1/aa/green_tick.png",
      },
      {
        id: "43",
        names: ["party_node"],
        imgUrl: "https://cdn.example.com/party_node.png",
      },
    ]);
  });

  it("returns empty list on non-ok response", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });
    await expect(fetchRealmEmojis()).resolves.toEqual([]);
  });

  it("returns empty list when payload contains error result", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error", msg: "forbidden" },
      raw: { statusText: "OK" },
    });
    await expect(fetchRealmEmojis()).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// `fetchRecentMessages` — авторизованный GET
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

  it("throws on transport error (network failure maps to null from pipeline)", async () => {
    mockZulipApi.get.mockRejectedValue(new SyntaxError("bad"));
    await expect(fetchRecentMessages()).rejects.toThrow("Zulip request failed");
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

  it("throws on transport error (network failure maps to null from pipeline)", async () => {
    mockZulipApi.get.mockRejectedValue(new Error("boom"));
    await expect(fetchMessagesAfterAnchor(100)).rejects.toThrow("Zulip request failed");
  });
});

// ---------------------------------------------------------------------------
// `fetchActivityMessages`
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
// `fetchSubscriptions` / `fetchUserTopics` / `fetchMessageById` / `fetchStreamMembers`
// ---------------------------------------------------------------------------

describe("fetchSubscriptions", () => {
  it("maps subscriptions and derives muted state", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        subscriptions: [
          {
            stream_id: 1,
            name: "general",
            is_muted: true,
            is_archived: false,
            creator_id: 77,
          },
          { stream_id: 2, name: "dev", in_home_view: false, is_archived: true },
        ],
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      { stream_id: 1, name: "general", is_muted: true, is_archived: false, creator_id: 77 },
      { stream_id: 2, name: "dev", is_muted: true, is_archived: true },
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
    expect(result?.content).toBe("<p>hello</p>");
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
// `fetchStreams` — использует `zulip-js` client
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
// `fetchMessages` — использует `zulip-js` client
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

  it("uses literal general topic narrow operand for literal general topic route", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });
    await fetchMessages("engineering", "general");
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        narrow: [
          { operator: "stream", operand: "engineering" },
          { operator: "topic", operand: "general" },
        ],
      }),
    );
  });

  it("uses empty topic narrow operand for explicit empty topic route", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });
    await fetchMessages("engineering", "");
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        narrow: [
          { operator: "stream", operand: "engineering" },
          { operator: "topic", operand: "" },
        ],
      }),
    );
  });

  it("returns empty array on error result", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ result: "error" });
    expect(await fetchMessages("general")).toEqual([]);
  });

  it("returns empty array on exception", async () => {
    mockZulipClient.messages.retrieve.mockRejectedValue(new Error("Network"));
    expect(await fetchMessages("general")).toEqual([]);
  });

  it("throws when pipeline returns non-ok with abort signal", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 503,
      data: {},
      raw: { statusText: "Service Unavailable" },
    });
    const controller = new AbortController();
    await expect(
      fetchMessages("general", "topic1", undefined, { signal: controller.signal }),
    ).rejects.toThrow(/app\.errorStatus/);
  });

  it("throws when pipeline returns null on network error (signal path, not aborted)", async () => {
    mockZulipApi.get.mockRejectedValue(new TypeError("Failed to fetch"));
    const controller = new AbortController();
    await expect(
      fetchMessages("dev", undefined, undefined, { signal: controller.signal }),
    ).rejects.toThrow("Zulip request failed");
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
    mockZulipClient.messages.retrieve.mockReturnValue(retrievePromise);

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
// `fetchMessagesWithNarrow` — универсальная загрузка по narrow
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

  it("allows chat paths to explicitly request rendered HTML", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });
    await fetchMessagesWithNarrow([{ operator: "stream", operand: "general" }], "newest", 200, 0, {
      applyMarkdown: true,
    });
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        narrow: [{ operator: "stream", operand: "general" }],
        apply_markdown: true,
      }),
    );
  });

  it("preserves literal general topic operand in narrow fetch", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({ messages: [] });
    await fetchMessagesWithNarrow(
      [
        { operator: "stream", operand: "dev" },
        { operator: "topic", operand: "general" },
      ],
      "newest",
      50,
      0,
    );
    expect(mockZulipClient.messages.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        narrow: [
          { operator: "stream", operand: "dev" },
          { operator: "topic", operand: "general" },
        ],
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
    mockZulipClient.messages.retrieve.mockReturnValue(retrievePromise);

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
// `fetchAllMessagesPage` — пагинация по всем сообщениям через API pipeline
// ---------------------------------------------------------------------------

describe("fetchAllMessagesPage", () => {
  it("defaults to raw markdown for metadata-only callers", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [],
        found_oldest: false,
        found_newest: false,
      },
      raw: { statusText: "OK" },
    });

    await fetchAllMessagesPage("newest", 25);

    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages", {
      anchor: "newest",
      num_before: "25",
      num_after: "0",
      narrow: "[]",
      allow_empty_topic_name: "true",
      client_gravatar: "true",
      apply_markdown: "false",
    });
  });

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

  it("throws when pipeline returns non-ok with abort signal", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 0,
      data: {},
      raw: {},
    });
    const controller = new AbortController();
    await expect(fetchDmMessages(42, { signal: controller.signal })).rejects.toThrow(
      /app\.errorStatus/,
    );
  });

  it("throws when pipeline returns null on network error (signal path, not aborted)", async () => {
    mockZulipApi.get.mockRejectedValue(new TypeError("network"));
    const controller = new AbortController();
    await expect(fetchDmMessages(42, { signal: controller.signal })).rejects.toThrow(
      "Zulip request failed",
    );
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
    mockZulipClient.messages.retrieve.mockReturnValue(retrievePromise);

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
    mockZulipClient.messages.retrieve.mockReturnValue(retrievePromise);

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

  it("defaults subject to empty topic for stream message", async () => {
    mockZulipClient.messages.send.mockResolvedValue({ id: 102 });
    const result = await sendMessage({ stream: "engineering", content: "test" });
    expect(result.subject).toBe("");
  });

  it("throws when neither stream nor to is provided", async () => {
    await expect(sendMessage({ content: "orphan" })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// `renderMessageContent` — авторизованный рендер markdown для preview
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
// `updateMessage` — авторизованный PATCH с guard-проверкой
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
// `deleteMessage` — авторизованный DELETE с guard-проверкой
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

  it("serializes is_archived in PATCH body", async () => {
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(updateStream(10, { isArchived: true })).resolves.toBe(true);
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/streams/10", { is_archived: "true" });
  });

  it("does not call PATCH when there is nothing to update", async () => {
    await expect(updateStream(42, {})).resolves.toBe(true);
    expect(mockZulipApi.patch).not.toHaveBeenCalled();
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
// `addReaction` — авторизованный POST с guard-проверкой
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

  it("passes optional emojiCode and reactionType", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await addReaction(42, "party_node", { emojiCode: "43", reactionType: "realm_emoji" });
    expect(mockZulipApi.post).toHaveBeenCalledWith("/messages/42/reactions", {
      emoji_name: "party_node",
      emoji_code: "43",
      reaction_type: "realm_emoji",
    });
  });
});

// ---------------------------------------------------------------------------
// `removeReaction` — авторизованный DELETE с guard-проверкой
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
// `fetchUsersAvatarMap`
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
