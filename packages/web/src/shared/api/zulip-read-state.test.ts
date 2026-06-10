/**
 * Tests for Zulip API (zulip-read-state module).
 */
import "./zulip.test.setup";
import { describe, expect, it } from "vitest";
import { updateMessageFlags } from "./zulip-messages";
import {
  markDmAsRead,
  MARK_READ_NARROW_NUM_AFTER,
  markMessagesAsRead,
  markStreamAsRead,
  markTopicAsRead,
  renameStreamTopic,
  moveStreamTopicToChannel,
  setTopicResolvedState,
} from "./zulip-read-state";
import { getMockZulipApi } from "./zulip.test.setup";

const mockZulipApi = getMockZulipApi();

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
      anchor: "oldest",
      include_anchor: "false",
      num_before: "0",
      num_after: String(MARK_READ_NARROW_NUM_AFTER),
      narrow: JSON.stringify([
        { operator: "is", operand: "unread", negated: false },
        { operator: "dm", operand: [42] },
      ]),
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
      anchor: "oldest",
      include_anchor: "false",
      num_before: "0",
      num_after: String(MARK_READ_NARROW_NUM_AFTER),
      narrow: JSON.stringify([
        { operator: "is", operand: "unread", negated: false },
        { operator: "channel", operand: 10 },
      ]),
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
      anchor: "oldest",
      include_anchor: "false",
      num_before: "0",
      num_after: String(MARK_READ_NARROW_NUM_AFTER),
      narrow: JSON.stringify([
        { operator: "is", operand: "unread", negated: false },
        { operator: "channel", operand: 10 },
        { operator: "topic", operand: "bugs" },
      ]),
      op: "add",
      flag: "read",
    });
  });

  it("throws for invalid streamId", async () => {
    await expect(markTopicAsRead(0, "bugs")).rejects.toThrow(/Invalid streamId/);
  });

  it("supports explicit empty topic", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await markTopicAsRead(10, "");
    expect(mockZulipApi.post).toHaveBeenCalledWith(
      "/messages/flags/narrow",
      expect.objectContaining({
        narrow: JSON.stringify([
          { operator: "is", operand: "unread", negated: false },
          { operator: "channel", operand: 10 },
          { operator: "topic", operand: "" },
        ]),
      }),
    );
  });

  it("preserves literal general topic operand", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });
    await markTopicAsRead(10, "general");
    expect(mockZulipApi.post).toHaveBeenCalledWith(
      "/messages/flags/narrow",
      expect.objectContaining({
        narrow: JSON.stringify([
          { operator: "is", operand: "unread", negated: false },
          { operator: "channel", operand: 10 },
          { operator: "topic", operand: "general" },
        ]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// renameStreamTopic
// ---------------------------------------------------------------------------

describe("renameStreamTopic", () => {
  it("renames topic via anchor message patch", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 901 }],
      },
      raw: { statusText: "OK" },
    });
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(renameStreamTopic(10, "incident", "postmortem")).resolves.toBe(true);
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/messages/901", {
      topic: "postmortem",
      propagate_mode: "change_all",
      send_notification_to_old_thread: "false",
      send_notification_to_new_thread: "false",
      send_webhook_notifications: "false",
    });
  });
});

// ---------------------------------------------------------------------------
// moveStreamTopicToChannel
// ---------------------------------------------------------------------------

describe("moveStreamTopicToChannel", () => {
  it("moves topic to another channel via anchor message patch", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 901 }],
      },
      raw: { statusText: "OK" },
    });
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(moveStreamTopicToChannel(10, "incident", 20, "incident")).resolves.toBe(true);
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/messages/901", {
      stream_id: "20",
      topic: "incident",
      propagate_mode: "change_all",
      send_notification_to_old_thread: "false",
      send_notification_to_new_thread: "false",
      send_webhook_notifications: "false",
    });
  });

  it("returns false when source and target stream are the same", async () => {
    await expect(moveStreamTopicToChannel(10, "incident", 10, "incident")).resolves.toBe(false);
    expect(mockZulipApi.get).not.toHaveBeenCalled();
    expect(mockZulipApi.patch).not.toHaveBeenCalled();
  });

  it("returns false when time limit exceeded", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: 901 }],
      },
      raw: { statusText: "OK" },
    });
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error", code: "MOVE_MESSAGES_TIME_LIMIT_EXCEEDED" },
      raw: { statusText: "OK" },
    });

    await expect(moveStreamTopicToChannel(10, "incident", 20, "incident")).resolves.toBe(false);
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
    expect(mockZulipApi.get).toHaveBeenCalledWith(
      "/messages",
      {
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
      },
      undefined,
    );
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
