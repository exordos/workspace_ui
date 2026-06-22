/**
 * Tests for Messenger API (messenger-read-state module).
 */
import "./messenger.test.setup";
import { describe, expect, it } from "vitest";
import { updateMessageFlags } from "./messenger-messages";
import {
  markDmAsRead,
  markMessagesAsRead,
  markStreamAsRead,
  markTopicAsRead,
  renameStreamTopic,
  moveStreamTopicToChannel,
  setTopicResolvedState,
} from "./messenger-read-state";
import { getMockMessengerApi } from "./messenger.test.setup";

const mockMessengerApi = getMockMessengerApi();
const MESSAGE_ID_1 = "00000000-0000-4000-8000-000000000001";
const MESSAGE_ID_2 = "00000000-0000-4000-8000-000000000002";
const MESSAGE_ID_3 = "00000000-0000-4000-8000-000000000003";
const MESSAGE_ID_501 = "00000000-0000-4000-8000-000000000501";
const MESSAGE_ID_777 = "00000000-0000-4000-8000-000000000777";
const MESSAGE_ID_901 = "00000000-0000-4000-8000-000000000901";
const STREAM_UUID = "6738f91a-4fd1-416e-807f-cb4ae00ec1d3";
const TARGET_STREAM_UUID = "815890be-9819-46b1-9291-880602e62b96";

describe("markMessagesAsRead", () => {
  it("does not call removed flags API for message IDs", async () => {
    await expect(markMessagesAsRead([MESSAGE_ID_1, MESSAGE_ID_2, MESSAGE_ID_3])).rejects.toThrow(
      /Read-state write API is not available/,
    );
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("does nothing for empty array", async () => {
    await markMessagesAsRead([]);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("throws for invalid message id", async () => {
    await expect(markMessagesAsRead([MESSAGE_ID_1, "not-a-message-id"])).rejects.toThrow(
      /Invalid messageId/,
    );
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markDmAsRead
// ---------------------------------------------------------------------------

describe("markDmAsRead", () => {
  it("returns false without calling removed flags/narrow API", async () => {
    const result = await markDmAsRead([42]);
    expect(result).toBe(false);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("returns false for empty ids list", async () => {
    const result = await markDmAsRead([]);
    expect(result).toBe(false);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("returns false for legacy numeric user ids without validation round-trip", async () => {
    const result = await markDmAsRead([0]);
    expect(result).toBe(false);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markStreamAsRead
// ---------------------------------------------------------------------------

describe("markStreamAsRead", () => {
  it("returns false without calling removed flags/narrow API", async () => {
    const result = await markStreamAsRead(STREAM_UUID);
    expect(result).toBe(false);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("throws for invalid streamId", async () => {
    await expect(markStreamAsRead("not-a-uuid")).rejects.toThrow(/Invalid streamUuid/);
  });
});

// ---------------------------------------------------------------------------
// markTopicAsRead
// ---------------------------------------------------------------------------

describe("markTopicAsRead", () => {
  it("returns false without calling removed flags/narrow API", async () => {
    const result = await markTopicAsRead(STREAM_UUID, "bugs");
    expect(result).toBe(false);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("throws for invalid streamId", async () => {
    await expect(markTopicAsRead("not-a-uuid", "bugs")).rejects.toThrow(/Invalid streamUuid/);
  });

  it("returns false for empty topic without calling removed flags/narrow API", async () => {
    const result = await markTopicAsRead(STREAM_UUID, "");
    expect(result).toBe(false);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("returns false for literal general topic without calling removed flags/narrow API", async () => {
    const result = await markTopicAsRead(STREAM_UUID, "general");
    expect(result).toBe(false);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// renameStreamTopic
// ---------------------------------------------------------------------------

describe("renameStreamTopic", () => {
  it("renames topic via anchor message patch", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: MESSAGE_ID_901 }],
      },
      raw: { statusText: "OK" },
    });
    mockMessengerApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(renameStreamTopic(STREAM_UUID, "incident", "postmortem")).resolves.toBe(true);
    expect(mockMessengerApi.patch).toHaveBeenCalledWith(`/messages/${MESSAGE_ID_901}`, {
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
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: MESSAGE_ID_901 }],
      },
      raw: { statusText: "OK" },
    });
    mockMessengerApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(
      moveStreamTopicToChannel(STREAM_UUID, "incident", TARGET_STREAM_UUID, "incident"),
    ).resolves.toBe(true);
    expect(mockMessengerApi.patch).toHaveBeenCalledWith(`/messages/${MESSAGE_ID_901}`, {
      stream_uuid: TARGET_STREAM_UUID,
      topic: "incident",
      propagate_mode: "change_all",
      send_notification_to_old_thread: "false",
      send_notification_to_new_thread: "false",
      send_webhook_notifications: "false",
    });
  });

  it("returns false when source and target stream are the same", async () => {
    await expect(
      moveStreamTopicToChannel(STREAM_UUID, "incident", STREAM_UUID, "incident"),
    ).resolves.toBe(false);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
  });

  it("returns false when time limit exceeded", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: MESSAGE_ID_901 }],
      },
      raw: { statusText: "OK" },
    });
    mockMessengerApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error", code: "MOVE_MESSAGES_TIME_LIMIT_EXCEEDED" },
      raw: { statusText: "OK" },
    });

    await expect(
      moveStreamTopicToChannel(STREAM_UUID, "incident", TARGET_STREAM_UUID, "incident"),
    ).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setTopicResolvedState
// ---------------------------------------------------------------------------

describe("setTopicResolvedState", () => {
  it("renames topic to resolved variant", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: MESSAGE_ID_501 }],
      },
      raw: { statusText: "OK" },
    });
    mockMessengerApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(setTopicResolvedState(STREAM_UUID, "incident", true)).resolves.toBe(true);
    expect(mockMessengerApi.get).toHaveBeenCalledWith(
      "/messages",
      {
        anchor: "oldest",
        num_before: "0",
        num_after: "1",
        include_anchor: "true",
        allow_empty_topic_name: "true",
        apply_markdown: "false",
        narrow: JSON.stringify([
          { operator: "stream", operand: STREAM_UUID },
          { operator: "topic", operand: "incident" },
        ]),
      },
      undefined,
    );
    expect(mockMessengerApi.patch).toHaveBeenCalledWith(`/messages/${MESSAGE_ID_501}`, {
      topic: "\u2714 incident",
      propagate_mode: "change_all",
      send_notification_to_old_thread: "false",
      send_notification_to_new_thread: "false",
      send_webhook_notifications: "false",
    });
  });

  it("renames topic to unresolved variant", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        messages: [{ id: MESSAGE_ID_777 }],
      },
      raw: { statusText: "OK" },
    });
    mockMessengerApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(setTopicResolvedState(STREAM_UUID, "\u2714 incident", false)).resolves.toBe(true);
    expect(mockMessengerApi.patch).toHaveBeenCalledWith(`/messages/${MESSAGE_ID_777}`, {
      topic: "incident",
      propagate_mode: "change_all",
      send_notification_to_old_thread: "false",
      send_notification_to_new_thread: "false",
      send_webhook_notifications: "false",
    });
  });

  it("returns false when topic has no anchor message", async () => {
    mockMessengerApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", messages: [] },
      raw: { statusText: "OK" },
    });

    await expect(setTopicResolvedState(STREAM_UUID, "incident", true)).resolves.toBe(false);
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateMessageFlags
// ---------------------------------------------------------------------------

describe("updateMessageFlags", () => {
  it("does not call removed flags API", async () => {
    await expect(
      updateMessageFlags([MESSAGE_ID_1, MESSAGE_ID_2], "add", "starred"),
    ).rejects.toThrow(/Message flag write API is not available/);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("does nothing for empty array", async () => {
    await updateMessageFlags([], "add", "starred");
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("throws for invalid message id", async () => {
    await expect(
      updateMessageFlags([MESSAGE_ID_1, "not-a-message-id"], "add", "read"),
    ).rejects.toThrow(/Invalid messageId/);
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("throws for blank flag name", async () => {
    await expect(updateMessageFlags([MESSAGE_ID_1], "add", "   ")).rejects.toThrow(
      /updateMessageFlags\.flag must be a non-empty string/,
    );
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });
});
