/**
 * Tests for Zulip API (zulip-messages module).
 */
import "./zulip.test.setup";
import { describe, expect, it } from "vitest";
import {
  addReaction,
  deleteMessage,
  fetchActivityMessages,
  fetchActivityMessagesPage,
  fetchAllMessagesPage,
  fetchDmMessages,
  fetchMessageById,
  fetchMessages,
  fetchMessagesAfterAnchor,
  fetchMessagesBeforeAnchor,
  fetchMessagesWithNarrow,
  fetchMessagesWithNarrowPage,
  fetchRecentMessages,
  rawMessageToMockMessage,
  removeReaction,
  renderMessageContent,
  sendMessage,
  updateMessage,
} from "./zulip-messages";
import {
  getMockRefreshZulipApiBase,
  getMockZulipApi,
  getMockZulipClient,
} from "./zulip.test.setup";

const mockZulipApi = getMockZulipApi();
const mockRefreshZulipApiBase = getMockRefreshZulipApiBase();
const mockZulipClient = getMockZulipClient();

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
describe("fetchMessageById", () => {
  it("returns mapped message data", async () => {
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
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchMessageById(100);

    expect(result?.id).toBe(100);
    expect(result?.channel).toBe("general");
    expect(mockZulipApi.get).toHaveBeenCalledWith("/messages/100", undefined);
  });
});

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
      expect.objectContaining({ narrow: undefined }),
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

  it("fetchMessagesWithNarrowPage returns foundOldest and foundNewest from server", async () => {
    mockZulipClient.messages.retrieve.mockResolvedValue({
      messages: [{ id: 1, sender_id: 1, content: "x", timestamp: 1, type: "stream", stream_id: 1 }],
      found_oldest: true,
      found_newest: true,
    });
    const page = await fetchMessagesWithNarrowPage([{ operator: "is", operand: "unread" }], "newest", 1, 1);
    expect(page.foundOldest).toBe(true);
    expect(page.foundNewest).toBe(true);
    expect(page.messages).toHaveLength(1);
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
// fetchDmMessages — uses zulip-js client
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
});

// ---------------------------------------------------------------------------
// sendMessage — uses zulip-js client
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
