/**
 * Tests for Messenger API (messenger-messages module).
 */
import { describe, expect, it } from "vitest";
// messenger.test.setup must load before the module under test so its vi.mock hooks register first.
// eslint-disable-next-line import-x/order -- keep setup import above first for vi.mock registration
import { getMockRefreshMessengerApiBase, getMockMessengerApi } from "./messenger.test.setup";
import { testMessageId } from "~/test/factories";
import {
  addReaction,
  createSavedSnippet,
  deleteMessage,
  fetchActivityMessages,
  fetchActivityMessagesPage,
  fetchAllMessagesPage,
  fetchSavedSnippets,
  fetchDmMessages,
  fetchMessageById,
  fetchMessagesByIds,
  fetchMessages,
  fetchMessagesAfterAnchor,
  fetchMessagesBeforeAnchor,
  fetchMessagesWithNarrow,
  fetchMessagesWithNarrowPage,
  fetchRecentMessages,
  rawMessageToMockMessage,
  fetchMessageReactions,
  removeReaction,
  renderMessageContent,
  sendMessage,
  updateMessage,
} from "./messenger-messages";
const mockMessengerApi = getMockMessengerApi();
const mockRefreshMessengerApiBase = getMockRefreshMessengerApiBase();

function mockMessagesResponse(data: Record<string, unknown>): void {
  mockMessengerApi.get.mockResolvedValue({
    ok: true,
    status: 200,
    data,
    raw: { statusText: "OK" },
  });
}

describe("rawMessageToMockMessage", () => {
  const streamUuid = "22222222-2222-4222-8222-222222222222";

  it("maps a stream message", () => {
    const result = rawMessageToMockMessage({
      id: "00000000-0000-4000-8000-000000000001",
      sender_id: 42,
      sender_full_name: "Alice",
      content: "<p>hello</p>",
      timestamp: 1710000000,
      display_recipient: "engineering",
      subject: "bugs",
      type: "stream",
      stream_uuid: streamUuid,
      flags: ["read"],
      reactions: {},
    });

    expect(result).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      sender_id: 42,
      sender_full_name: "Alice",
      stream_uuid: streamUuid,
      display_recipient: "engineering",
      channel: "engineering",
      subject: "bugs",
      content: "<p>hello</p>",
      timestamp: 1710000000,
      flags: ["read"],
      reactions: {},
    });
  });

  it("maps a private message with null stream uuid", () => {
    const result = rawMessageToMockMessage({
      id: "00000000-0000-4000-8000-000000000002",
      sender_id: 5,
      content: "hi",
      timestamp: 1710000100,
      type: "private",
      stream_uuid: null,
      display_recipient: [
        { id: 5, full_name: "Alice" },
        { id: 10, full_name: "Bob" },
      ],
    });

    expect(result.stream_uuid).toBeNull();
    expect(result.channel).toBeUndefined();
    expect(result.display_recipient).toEqual([
      { id: 5, full_name: "Alice" },
      { id: 10, full_name: "Bob" },
    ]);
  });

  it("defaults missing fields", () => {
    const result = rawMessageToMockMessage({
      id: "00000000-0000-4000-8000-000000000003",
      sender_id: 1,
      content: "text",
      timestamp: 0,
    });

    expect(result.sender_full_name).toBe("");
    expect(result.subject).toBe("");
    expect(result.stream_uuid).toBeNull();
  });

  it("maps markdown_source when present", () => {
    const result = rawMessageToMockMessage({
      id: "00000000-0000-4000-8000-000000000001",
      sender_id: 1,
      content: "<p>x</p>",
      timestamp: 0,
      markdown_source: "`x`",
    });
    expect(result.markdown_source).toBe("`x`");
  });
});
describe("fetchRecentMessages", () => {
  it("returns messages on success", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [
          {
            id: "00000000-0000-4000-8000-000000000001",
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
    expect(result[0]!.id).toBe(testMessageId(1));
    expect(mockRefreshMessengerApiBase).toHaveBeenCalled();
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      {
        anchor: "newest",
        num_before: "1000",
        num_after: "0",
        allow_empty_topic_name: "true",
        apply_markdown: "false",
      },
      undefined,
    );
  });

  it("returns empty array on non-ok", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });
    expect(await fetchRecentMessages()).toEqual([]);
  });

  it("returns empty array on error result", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error" },
      raw: { statusText: "OK" },
    });
    expect(await fetchRecentMessages()).toEqual([]);
  });

  it("returns empty array on transport error", async () => {
    mockMessengerApi.get.mockRejectedValue(new SyntaxError("bad"));
    expect(await fetchRecentMessages()).toEqual([]);
  });
});

describe("fetchMessagesBeforeAnchor", () => {
  it("requests older messages window without including anchor", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [
          {
            id: "00000000-0000-4000-8000-000000000050",
            sender_id: 1,
            content: "older",
            timestamp: 10,
          },
        ],
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchMessagesBeforeAnchor("00000000-0000-4000-8000-000000000100");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(testMessageId(50));
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      {
        anchor: testMessageId(100),
        include_anchor: "false",
        num_before: "5000",
        num_after: "0",
        allow_empty_topic_name: "true",
        apply_markdown: "false",
      },
      undefined,
    );
  });

  it("returns empty array on non-ok response", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });

    await expect(
      fetchMessagesBeforeAnchor("00000000-0000-4000-8000-000000000100"),
    ).resolves.toEqual([]);
  });
});

describe("fetchMessagesAfterAnchor", () => {
  it("requests newer messages window without including anchor", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            sender_id: 1,
            content: "new",
            timestamp: 11,
          },
        ],
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchMessagesAfterAnchor("00000000-0000-4000-8000-000000000100");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(testMessageId(101));
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      {
        anchor: testMessageId(100),
        include_anchor: "false",
        num_before: "0",
        num_after: "5000",
        allow_empty_topic_name: "true",
        apply_markdown: "false",
      },
      undefined,
    );
  });

  it("returns empty array on transport error", async () => {
    mockMessengerApi.get.mockRejectedValue(new Error("boom"));
    await expect(fetchMessagesAfterAnchor("00000000-0000-4000-8000-000000000100")).resolves.toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// fetchActivityMessages
// ---------------------------------------------------------------------------

describe("fetchActivityMessages", () => {
  it("fetches starred messages", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [
          { id: "00000000-0000-4000-8000-000000000001", sender_id: 1, content: "x", timestamp: 1 },
        ],
      },
      raw: { statusText: "OK" },
    });
    const result = await fetchActivityMessages("starred");
    expect(result).toHaveLength(1);
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      {
        anchor: "newest",
        num_before: "200",
        num_after: "0",
        narrow: JSON.stringify([{ negated: false, operator: "is", operand: "starred" }]),
        allow_empty_topic_name: "true",
        apply_markdown: "false",
      },
      undefined,
    );
  });

  it("throws on API error result", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error", msg: "invalid narrow" },
      raw: { statusText: "OK" },
    });
    await expect(fetchActivityMessages("mentions")).rejects.toThrow(/invalid narrow/i);
  });
});

describe("fetchActivityMessagesPage", () => {
  it("preserves found-oldest metadata from the server", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [
          { id: "00000000-0000-4000-8000-000000000001", sender_id: 1, content: "x", timestamp: 1 },
        ],
        found_oldest: true,
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchActivityMessagesPage("mentions");

    expect(result.foundOldest).toBe(true);
    expect(result.messages).toHaveLength(1);
  });

  it("fails fast when message anchor is invalid", async () => {
    await expect(fetchActivityMessagesPage("mentions", null, "not-a-message-id")).rejects.toThrow(
      /fetchActivityMessagesPage\.anchor/i,
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("requests has:reaction narrow for reactions filter", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [
          { id: "00000000-0000-4000-8000-000000000001", sender_id: 42, content: "x", timestamp: 1 },
        ],
        found_oldest: true,
      },
      raw: { statusText: "OK" },
    });

    await fetchActivityMessagesPage("reactions", null);

    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      {
        anchor: "newest",
        num_before: "200",
        num_after: "0",
        narrow: JSON.stringify([{ negated: false, operator: "has", operand: "reaction" }]),
        allow_empty_topic_name: "true",
        apply_markdown: "false",
      },
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// fetchSubscriptions / fetchMessageById / fetchStreamMembers
// ---------------------------------------------------------------------------
describe("fetchMessagesByIds", () => {
  it("returns empty array when no ids are provided", async () => {
    await expect(fetchMessagesByIds([])).resolves.toEqual([]);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("requests messages by message_ids batch", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [
          {
            id: "00000000-0000-4000-8000-000000000501",
            sender_id: 42,
            sender_full_name: "Alice",
            content: "dm preview",
            timestamp: 1710000200,
            type: "private",
            stream_uuid: null,
            display_recipient: [
              { id: 7, full_name: "Bob" },
              { id: 42, full_name: "Alice" },
            ],
          },
        ],
      },
      raw: { statusText: "OK" },
    });

    const messageId = "00000000-0000-4000-8000-000000000501";
    const result = await fetchMessagesByIds([messageId, messageId, "not-a-message-id"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(messageId);
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      {
        message_ids: JSON.stringify([messageId]),
        allow_empty_topic_name: "true",
        apply_markdown: "false",
      },
      undefined,
    );
  });

  it("falls back to per-message fetch when batch request fails", async () => {
    mockMessengerApi.get
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        data: { result: "error", msg: "message_ids not supported" },
        raw: { statusText: "Bad Request" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          result: "success",
          message: {
            id: "00000000-0000-4000-8000-000000000777",
            sender_id: 42,
            sender_full_name: "Alice",
            content: "fallback dm",
            timestamp: 1710000300,
            type: "private",
            stream_uuid: null,
            display_recipient: [
              { id: 7, full_name: "Bob" },
              { id: 42, full_name: "Alice" },
            ],
          },
        },
        raw: { statusText: "OK" },
      });

    const result = await fetchMessagesByIds(["00000000-0000-4000-8000-000000000777"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe("fallback dm");
    expect(mockMessengerApi.get).toHaveBeenCalledTimes(2);
    expect(mockMessengerApi.get).toHaveBeenNthCalledWith(
      2,
      `/messages/${testMessageId(777)}`,
      {
        allow_empty_topic_name: "true",
        apply_markdown: "false",
      },
      undefined,
    );
  });
});

describe("fetchMessageById", () => {
  it("returns mapped message data", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        uuid: "00000000-0000-4000-8000-000000000100",
        stream_uuid: "00000000-0000-4000-8000-000000000010",
        topic_uuid: "00000000-0000-4000-8000-000000000011",
        author_uuid: "00000000-0000-4000-8000-000000000012",
        payload: { kind: "markdown", content: "hello" },
        is_own: false,
        read: true,
        pinned: false,
        starred: false,
        created_at: "2026-06-24T10:00:00Z",
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchMessageById("00000000-0000-4000-8000-000000000100");

    expect(result?.id).toBe(testMessageId(100));
    expect(result?.content).toBe("hello");
    expect(result?.markdown_source).toBe("hello");
    expect(result?.read).toBe(true);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/messages/${testMessageId(100)}`,
    );
  });
});

describe("fetchMessages", () => {
  it("returns mapped messages with narrow", async () => {
    mockMessagesResponse({
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000010",
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
    expect(result[0]!.id).toBe(testMessageId(10));
  });

  it("uses literal general topic narrow operand for literal general topic route", async () => {
    mockMessagesResponse({ messages: [] });
    await fetchMessages("engineering", "general");
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      expect.objectContaining({
        narrow: JSON.stringify([
          { operator: "stream", operand: "engineering" },
          { operator: "topic", operand: "general" },
        ]),
      }),
      undefined,
    );
  });

  it("uses empty topic narrow operand for explicit empty topic route", async () => {
    mockMessagesResponse({ messages: [] });
    await fetchMessages("engineering", "");
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      expect.objectContaining({
        narrow: JSON.stringify([
          { operator: "stream", operand: "engineering" },
          { operator: "topic", operand: "" },
        ]),
      }),
      undefined,
    );
  });

  it("returns empty array on error result", async () => {
    mockMessagesResponse({ result: "error" });
    expect(await fetchMessages("general")).toEqual([]);
  });

  it("returns empty array on exception", async () => {
    mockMessengerApi.get.mockRejectedValue(new Error("Network"));
    expect(await fetchMessages("general")).toEqual([]);
  });

  it("passes no narrow when no filters given", async () => {
    mockMessagesResponse({ messages: [] });
    await fetchMessages();
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      expect.not.objectContaining({ narrow: expect.anything() }),
      undefined,
    );
  });

  it("throws when topic is provided without stream", async () => {
    await expect(fetchMessages(undefined, "bugs")).rejects.toThrow(
      /fetchMessages\.stream is required when topic is provided/,
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("throws when stream name is blank", async () => {
    await expect(fetchMessages("   ")).rejects.toThrow(
      /fetchMessages\.stream must be a non-empty string/,
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchMessagesWithNarrow — generic narrow-based fetch
// ---------------------------------------------------------------------------

describe("fetchMessagesWithNarrow", () => {
  it("passes narrow, anchor, and counts to client", async () => {
    mockMessagesResponse({ messages: [] });
    await fetchMessagesWithNarrow([{ operator: "is", operand: "unread" }], "newest", 200, 0);
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      expect.objectContaining({
        narrow: JSON.stringify([{ operator: "is", operand: "unread" }]),
        anchor: "newest",
        num_before: "200",
        num_after: "0",
        apply_markdown: "false",
      }),
      undefined,
    );
  });

  it("returns empty on error result", async () => {
    mockMessagesResponse({ result: "error" });
    expect(await fetchMessagesWithNarrow([])).toEqual([]);
  });

  it("allows callers to explicitly request rendered HTML", async () => {
    mockMessagesResponse({ messages: [] });
    await fetchMessagesWithNarrow([{ operator: "stream", operand: "general" }], "newest", 200, 0, {
      applyMarkdown: true,
    });
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      expect.objectContaining({
        narrow: JSON.stringify([{ operator: "stream", operand: "general" }]),
        apply_markdown: "true",
      }),
      undefined,
    );
  });

  it("preserves markdown_source for html-like text in markdown mode", async () => {
    mockMessagesResponse({
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          sender_id: 42,
          content: '<img src="x" onerror="alert(1)">',
          timestamp: 1710000000,
          display_recipient: "general",
          subject: "test",
          type: "stream",
          stream_uuid: "00000000-0000-4000-8000-000000000010",
        },
      ],
      found_oldest: true,
      found_newest: true,
    });

    const result = await fetchMessagesWithNarrow(
      [{ operator: "stream", operand: "general" }],
      "newest",
      200,
      0,
      { applyMarkdown: false },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe('<img src="x" onerror="alert(1)">');
    expect(result[0]?.markdown_source).toBe('<img src="x" onerror="alert(1)">');
  });

  it("throws for unsupported anchor string", async () => {
    await expect(
      fetchMessagesWithNarrow([{ operator: "is", operand: "unread" }], "invalid_anchor"),
    ).rejects.toThrow(/Invalid messageId/i);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("throws for invalid message anchor", async () => {
    await expect(fetchMessagesWithNarrow([], "not-a-message-id")).rejects.toThrow(
      /Invalid messageId/,
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("throws for negative numBefore", async () => {
    await expect(fetchMessagesWithNarrow([], "newest", -1, 0)).rejects.toThrow(
      /numBefore must be a non-negative integer/i,
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("throws for negative numAfter", async () => {
    await expect(fetchMessagesWithNarrow([], "newest", 0, -1)).rejects.toThrow(
      /numAfter must be a non-negative integer/i,
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("fetchMessagesWithNarrowPage returns foundOldest and foundNewest from server", async () => {
    mockMessagesResponse({
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          sender_id: 1,
          content: "x",
          timestamp: 1,
          type: "stream",
          stream_uuid: "00000000-0000-4000-8000-000000000001",
        },
      ],
      found_oldest: true,
      found_newest: true,
    });
    const page = await fetchMessagesWithNarrowPage(
      [{ operator: "is", operand: "unread" }],
      "newest",
      1,
      1,
    );
    expect(page.foundOldest).toBe(true);
    expect(page.foundNewest).toBe(true);
    expect(page.messages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// fetchAllMessagesPage — all-messages pagination via API pipeline
// ---------------------------------------------------------------------------

describe("fetchAllMessagesPage", () => {
  const streamUuid = "00000000-0000-4000-8000-000000000010";
  const authorUuid = "11111111-1111-4111-8111-111111111111";

  function nativeMessageRow(overrides: Record<string, unknown> = {}) {
    return {
      uuid: "00000000-0000-4000-8000-000000000001",
      stream_uuid: streamUuid,
      author_uuid: authorUuid,
      payload: { kind: "markdown", content: "hello" },
      read: true,
      pinned: false,
      starred: false,
      is_own: false,
      created_at: "2026-06-22T10:00:00Z",
      updated_at: "2026-06-22T10:00:00Z",
      ...overrides,
    };
  }

  function nativeMessagesPage(data: unknown, nextMarker?: string) {
    const headers = new Headers();
    if (nextMarker != null) {
      headers.set("X-Pagination-Marker", nextMarker);
    }
    return {
      ok: true,
      status: 200,
      data,
      headers,
      raw: { statusText: "OK" },
    };
  }

  it("uses the native messages endpoint without legacy narrow filters", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(nativeMessagesPage([]));

    await fetchAllMessagesPage("newest", 25);

    expect(mockMessengerApi.get).not.toHaveBeenCalled();
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/messages/",
      {
        page_limit: "25",
        sort_key: "created_at",
        sort_dir: "desc",
      },
      undefined,
    );
    const params = mockMessengerApi.getWithBase.mock.calls[0]?.[2] as Record<string, string>;
    expect(params).not.toHaveProperty("anchor");
    expect(params).not.toHaveProperty("num_before");
    expect(params).not.toHaveProperty("num_after");
    expect(params).not.toHaveProperty("narrow");
    expect(params).not.toHaveProperty("allow_empty_topic_name");
    expect(params).not.toHaveProperty("apply_markdown");
  });

  it("passes message anchors as native page markers for older feed pages", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(nativeMessagesPage([]));

    await fetchAllMessagesPage("00000000-0000-4000-8000-000000000100", 50);

    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/messages/",
      {
        page_limit: "50",
        sort_key: "created_at",
        sort_dir: "desc",
        page_marker: "00000000-0000-4000-8000-000000000100",
      },
      undefined,
    );
  });

  it("preserves markdown_source for raw markdown bodies that start with html-like text", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(
      nativeMessagesPage([
        nativeMessageRow({
          payload: { kind: "markdown", content: 'hi <img src="x" onerror="alert(1)">' },
        }),
      ]),
    );

    const result = await fetchAllMessagesPage("newest", 25);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toBe('hi <img src="x" onerror="alert(1)">');
    expect(result.messages[0]?.markdown_source).toBe('hi <img src="x" onerror="alert(1)">');
  });

  it("throws for unsupported anchor string", async () => {
    await expect(fetchAllMessagesPage("invalid_anchor")).rejects.toThrow(/Invalid messageId/i);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("throws for invalid message anchor", async () => {
    await expect(fetchAllMessagesPage("not-a-message-id")).rejects.toThrow(/Invalid messageId/);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("throws for negative numBefore", async () => {
    await expect(fetchAllMessagesPage("newest", -5)).rejects.toThrow(
      /numBefore must be a non-negative integer/i,
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchDmMessages — uses Messenger REST client
// ---------------------------------------------------------------------------

describe("fetchDmMessages", () => {
  it("returns DM messages for a single user", async () => {
    mockMessagesResponse({
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          sender_id: 42,
          content: "dm",
          timestamp: 100,
          type: "private",
          stream_uuid: null,
        },
      ],
    });
    const result = await fetchDmMessages(42);
    expect(result).toHaveLength(1);
    expect(result[0]!.stream_uuid).toBeNull();
  });

  it("handles array of user IDs", async () => {
    mockMessagesResponse({ messages: [] });
    await fetchDmMessages([42, 43]);
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      expect.objectContaining({
        narrow: JSON.stringify([{ negated: false, operator: "dm", operand: [42, 43] }]),
      }),
      undefined,
    );
  });

  it("returns empty on exception", async () => {
    mockMessengerApi.get.mockRejectedValue(new Error("fail"));
    expect(await fetchDmMessages(42)).toEqual([]);
  });

  it("does not synthesize markdown_source for rendered html bodies", async () => {
    mockMessagesResponse({
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          sender_id: 42,
          content: "<p>dm</p>",
          timestamp: 100,
          type: "private",
          stream_uuid: null,
        },
      ],
    });

    const result = await fetchDmMessages(42);
    expect(result[0]?.content).toBe("<p>dm</p>");
    expect(result[0]?.markdown_source).toBeUndefined();
  });

  it("throws for invalid user id", async () => {
    await expect(fetchDmMessages([0])).rejects.toThrow(/Invalid userId/);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendMessage — POST /messages via Workspace gateway
// ---------------------------------------------------------------------------

describe("sendMessage", () => {
  const streamUuid = "22222222-2222-4222-8222-222222222222";

  it("sends a stream message through the gateway native endpoint", async () => {
    const messageUuid = testMessageId(100);
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        uuid: messageUuid,
        stream_uuid: streamUuid,
        is_own: true,
        payload: { kind: "markdown", content: "hello" },
      },
      raw: { statusText: "Created" },
    });

    const result = await sendMessage({
      messageUuid,
      streamUuid: streamUuid,
      stream: "general",
      subject: "test",
      content: "hello",
      sender_id: 7,
      sender_full_name: "You",
    });

    expect(result).toEqual({
      id: messageUuid,
      source_message_uuid: messageUuid,
      sender_id: 7,
      is_own: true,
      sender_full_name: "You",
      stream_uuid: streamUuid,
      display_recipient: "general",
      channel: "general",
      subject: "test",
      content: "hello",
      markdown_source: "hello",
      timestamp: expect.any(Number),
    });
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/messages/",
      {
        uuid: messageUuid,
        stream_uuid: streamUuid,
        payload: {
          kind: "markdown",
          content: "hello",
        },
      },
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("stores UUID author identity on the local sent message", async () => {
    const messageUuid = testMessageId(105);
    const authorUuid = "00000000-0000-0000-0000-000000000000";
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        uuid: messageUuid,
        stream_uuid: streamUuid,
        is_own: true,
        payload: { kind: "markdown", content: "hello uuid" },
      },
      raw: { statusText: "Created" },
    });

    const result = await sendMessage({
      messageUuid,
      streamUuid: streamUuid,
      content: "hello uuid",
      author_id: authorUuid,
      sender_full_name: "You",
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: messageUuid,
        sender_id: 0,
        author_uuid: authorUuid,
        sender_uuid: authorUuid,
        is_own: true,
      }),
    );
  });

  it("sends a DM message with the private stream uuid", async () => {
    const messageUuid = testMessageId(101);
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        uuid: messageUuid,
        stream_uuid: streamUuid,
        is_own: true,
        payload: { kind: "markdown", content: "hi" },
      },
      raw: { statusText: "Created" },
    });

    const result = await sendMessage({
      messageUuid,
      streamUuid: streamUuid,
      content: "hi",
    });

    expect(result).toMatchObject({
      id: messageUuid,
      source_message_uuid: messageUuid,
      is_own: true,
      stream_uuid: streamUuid,
      subject: "",
      content: "hi",
      markdown_source: "hi",
    });
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/messages/",
      {
        uuid: messageUuid,
        stream_uuid: streamUuid,
        payload: {
          kind: "markdown",
          content: "hi",
        },
      },
    );
  });

  it("throws when stream uuid is empty", async () => {
    await expect(sendMessage({ streamUuid: "", content: "hi" })).rejects.toThrow(
      /Invalid streamUuid/,
    );
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("throws when provided stream uuid is invalid", async () => {
    await expect(
      sendMessage({
        streamUuid: "not-a-uuid",
        stream: "engineering",
        content: "hi",
      }),
    ).rejects.toThrow(/Invalid streamUuid/);
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("throws when message content is blank", async () => {
    await expect(sendMessage({ streamUuid: streamUuid, content: "   " })).rejects.toThrow(
      /sendMessage\.content must be a non-empty string/,
    );
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("defaults subject to empty string for optimistic stream payload", async () => {
    const messageUuid = testMessageId(102);
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        uuid: messageUuid,
        stream_uuid: streamUuid,
        payload: { kind: "markdown", content: "test" },
      },
      raw: { statusText: "Created" },
    });

    const result = await sendMessage({
      messageUuid,
      streamUuid: streamUuid,
      stream: "engineering",
      content: "test",
    });

    expect(result.subject).toBe("");
  });

  it("uses the client message uuid when the API returns an empty body", async () => {
    const messageUuid = testMessageId(103);
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: {},
      raw: { statusText: "Created" },
    });

    const result = await sendMessage({ messageUuid, streamUuid: streamUuid, content: "hi" });

    expect(result.id).toBe(messageUuid);
  });
});

// ---------------------------------------------------------------------------
// saved snippets — unsupported by the current backend
// ---------------------------------------------------------------------------

describe("saved snippets", () => {
  it("returns an empty list without calling the removed saved snippets API", async () => {
    await expect(fetchSavedSnippets()).resolves.toEqual([]);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("validates snippet input and fails without calling the removed saved snippets API", async () => {
    await expect(createSavedSnippet({ title: "Bug", content: "Steps" })).rejects.toThrow(
      "Saved snippets are unsupported",
    );
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// renderMessageContent — local markdown preview rendering
// ---------------------------------------------------------------------------

describe("renderMessageContent", () => {
  it("renders markdown locally without calling the removed render endpoint", async () => {
    await expect(renderMessageContent("**Hello**")).resolves.toContain("<strong>Hello</strong>");
    expect(mockRefreshMessengerApiBase).not.toHaveBeenCalled();
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("throws for blank content", () => {
    expect(() => renderMessageContent("   ")).toThrow(
      /renderMessageContent\.content must be a non-empty string/,
    );
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateMessage — authenticated PUT with guard
// ---------------------------------------------------------------------------

describe("updateMessage", () => {
  it("updates message content", async () => {
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        uuid: testMessageId(42),
        stream_uuid: "00000000-0000-4000-8000-000000000010",
        payload: { kind: "markdown", content: "updated" },
        is_own: true,
        read: true,
        pinned: false,
        starred: false,
        created_at: "2026-06-24T10:00:00Z",
      },
      raw: { statusText: "OK" },
    });
    await expect(
      updateMessage("00000000-0000-4000-8000-000000000042", { content: "updated" }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: testMessageId(42),
        content: "updated",
        markdown_source: "updated",
      }),
    );
    expect(mockMessengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/messages/${testMessageId(42)}`,
      {
        payload: {
          kind: "markdown",
          content: "updated",
        },
      },
    );
  });

  it("throws for invalid messageId", async () => {
    await expect(updateMessage("not-a-message-id", { content: "x" })).rejects.toThrow(
      /Invalid messageId/,
    );
  });

  it("throws for blank content", async () => {
    await expect(
      updateMessage("00000000-0000-4000-8000-000000000042", { content: "   " }),
    ).rejects.toThrow(/updateMessage\.content must be a non-empty string/);
    expect(mockMessengerApi.putJsonWithBase).not.toHaveBeenCalled();
  });

  it("throws on non-ok response with error message", async () => {
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Not allowed" },
      raw: { statusText: "Forbidden" },
    });
    await expect(
      updateMessage("00000000-0000-4000-8000-000000000042", { content: "x" }),
    ).rejects.toThrow("Not allowed");
  });
});

// ---------------------------------------------------------------------------
// deleteMessage — authenticated DELETE with guard
// ---------------------------------------------------------------------------

describe("deleteMessage", () => {
  it("deletes a message", async () => {
    mockMessengerApi.deleteWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await expect(deleteMessage("00000000-0000-4000-8000-000000000042")).resolves.toBeUndefined();
    expect(mockMessengerApi.deleteWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      `/messages/${testMessageId(42)}`,
    );
  });

  it("throws for invalid messageId", async () => {
    await expect(deleteMessage("not-a-message-id")).rejects.toThrow(/Invalid messageId/);
  });

  it("throws on non-ok response", async () => {
    mockMessengerApi.deleteWithBase.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });
    await expect(deleteMessage("00000000-0000-4000-8000-000000000042")).rejects.toThrow(
      "Forbidden",
    );
  });
});
describe("fetchMessageReactions", () => {
  const reaction = {
    uuid: "33333333-3333-4333-8333-333333333333",
    user_uuid: "44444444-4444-4444-8444-444444444444",
    message_uuid: "00000000-0000-4000-8000-000000000042",
    emoji_name: "thumbs_up",
  };

  it("loads current-user reactions for a message", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [reaction],
      raw: { statusText: "OK" },
    });

    await expect(fetchMessageReactions(testMessageId(42))).resolves.toEqual([reaction]);
    expect(mockRefreshMessengerApiBase).toHaveBeenCalled();
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/message_reactions/",
      { message_uuid: testMessageId(42) },
      undefined,
    );
  });

  it("can filter reaction details by current user uuid", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [reaction],
      raw: { statusText: "OK" },
    });

    await fetchMessageReactions(testMessageId(42), {
      userUuid: "44444444-4444-4444-8444-444444444444",
    });

    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/message_reactions/",
      {
        message_uuid: testMessageId(42),
        user_uuid: "44444444-4444-4444-8444-444444444444",
      },
      undefined,
    );
  });
});

describe("addReaction", () => {
  const reaction = {
    uuid: "33333333-3333-4333-8333-333333333333",
    user_uuid: "44444444-4444-4444-8444-444444444444",
    message_uuid: "00000000-0000-4000-8000-000000000042",
    emoji_name: "thumbs_up",
  };

  it("creates a reaction resource", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: reaction,
      raw: { statusText: "OK" },
    });

    await expect(addReaction(testMessageId(42), "thumbs_up")).resolves.toEqual({
      reaction,
      created: true,
    });
    expect(mockRefreshMessengerApiBase).toHaveBeenCalled();
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/message_reactions/",
      {
        message_uuid: testMessageId(42),
        emoji_name: "thumbs_up",
      },
    );
  });

  it("throws for invalid messageId", async () => {
    await expect(addReaction("not-a-message-id", "thumbs_up")).rejects.toThrow(/Invalid messageId/);
  });

  it("throws for blank emoji name", async () => {
    await expect(addReaction(testMessageId(42), "   ")).rejects.toThrow(
      /addReaction\.emojiName must be a non-empty string/,
    );
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("returns an existing current-user reaction on conflict", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: false,
      status: 409,
      data: { msg: "Already exists" },
      raw: { statusText: "Conflict" },
    });
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [reaction],
      raw: { statusText: "OK" },
    });

    await expect(
      addReaction(testMessageId(42), "thumbs_up", {
        currentUserUuid: "44444444-4444-4444-8444-444444444444",
      }),
    ).resolves.toEqual({
      reaction,
      created: false,
    });
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/message_reactions/",
      {
        message_uuid: testMessageId(42),
        user_uuid: "44444444-4444-4444-8444-444444444444",
      },
      undefined,
    );
  });

  it("throws on non-ok errors", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: false,
      status: 500,
      data: { msg: "Server error" },
      raw: { statusText: "Server Error" },
    });
    await expect(addReaction(testMessageId(42), "thumbs_up")).rejects.toThrow("Server error");
  });
});

// ---------------------------------------------------------------------------
// removeReaction — authenticated DELETE with guard
// ---------------------------------------------------------------------------

describe("removeReaction", () => {
  it("removes a reaction resource by uuid", async () => {
    mockMessengerApi.deleteWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(removeReaction("33333333-3333-4333-8333-333333333333")).resolves.toBeUndefined();
    expect(mockMessengerApi.deleteWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/message_reactions/33333333-3333-4333-8333-333333333333",
    );
  });

  it("throws on non-ok response", async () => {
    mockMessengerApi.deleteWithBase.mockResolvedValue({
      ok: false,
      status: 404,
      data: { msg: "Not found" },
      raw: { statusText: "Not Found" },
    });
    await expect(removeReaction("33333333-3333-4333-8333-333333333333")).rejects.toThrow(
      "Not found",
    );
  });

  it("throws for blank reaction uuid", async () => {
    await expect(removeReaction("   ")).rejects.toThrow(
      /removeReaction\.reactionUuid must be a non-empty string/,
    );
    expect(mockMessengerApi.deleteWithBase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markMessagesAsRead
// ---------------------------------------------------------------------------
