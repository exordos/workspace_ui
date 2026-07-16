/**
 * Tests for Messenger API (messenger-read-state module).
 */
// messenger.test.setup must load before the module under test so its vi.mock hooks register first.
// eslint-disable-next-line import-x/order -- keep setup import above first for vi.mock registration
import { getMockMessengerApi } from "./messenger.test.setup";
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

const mockMessengerApi = getMockMessengerApi();
const MESSAGE_ID_1 = "00000000-0000-4000-8000-000000000001";
const MESSAGE_ID_2 = "00000000-0000-4000-8000-000000000002";
const MESSAGE_ID_3 = "00000000-0000-4000-8000-000000000003";
const STREAM_UUID = "6738f91a-4fd1-416e-807f-cb4ae00ec1d3";
const TARGET_STREAM_UUID = "815890be-9819-46b1-9291-880602e62b96";
const TOPIC_UUID = "90dde7a2-0204-4c72-a759-5f3bf80033df";

function streamTopicResponse(name: string, streamUuid = STREAM_UUID) {
  return {
    uuid: TOPIC_UUID,
    stream_uuid: streamUuid,
    name,
    unread_count: 0,
    is_default: false,
    is_done: false,
    notification_mode: "default",
  };
}

describe("markMessagesAsRead", () => {
  it("marks topic messages read up to the newest provided message", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uuid: MESSAGE_ID_3, read: true },
      raw: { statusText: "OK" },
    });

    await expect(markMessagesAsRead([MESSAGE_ID_1, MESSAGE_ID_2, MESSAGE_ID_3])).resolves.toEqual([
      MESSAGE_ID_3,
    ]);

    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledTimes(1);
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/messages/${MESSAGE_ID_3}/actions/read_up_to/invoke`,
      {},
    );
  });

  it("does nothing for empty array", async () => {
    await expect(markMessagesAsRead([])).resolves.toEqual([]);
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("returns no confirmed ids when response does not say the message is read", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uuid: MESSAGE_ID_1, read: false },
      raw: { statusText: "OK" },
    });

    await expect(markMessagesAsRead([MESSAGE_ID_1])).resolves.toEqual([]);
  });

  it("throws for invalid message id", async () => {
    await expect(markMessagesAsRead([MESSAGE_ID_1, "not-a-message-id"])).rejects.toThrow(
      /Invalid messageId/,
    );
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("throws on read action failure", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(markMessagesAsRead([MESSAGE_ID_1])).rejects.toThrow("Forbidden");
  });
});

// ---------------------------------------------------------------------------
// markDmAsRead
// ---------------------------------------------------------------------------

describe("markDmAsRead", () => {
  it("marks the private Workspace stream as read when stream UUID is known", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { unread_count: 0 },
      raw: { statusText: "OK" },
    });

    const result = await markDmAsRead([42], STREAM_UUID);

    expect(result).toBe(true);
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/streams/${STREAM_UUID}/actions/read/invoke`,
      {},
    );
  });

  it("returns false for legacy numeric user ids without a stream UUID", async () => {
    const result = await markDmAsRead([42]);
    expect(result).toBe(false);
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("returns false for empty ids list without a stream UUID", async () => {
    const result = await markDmAsRead([]);
    expect(result).toBe(false);
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markStreamAsRead
// ---------------------------------------------------------------------------

describe("markStreamAsRead", () => {
  it("marks a Workspace stream as read", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { unread_count: 0 },
      raw: { statusText: "OK" },
    });

    const result = await markStreamAsRead(STREAM_UUID);

    expect(result).toBe(true);
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/streams/${STREAM_UUID}/actions/read/invoke`,
      {},
    );
  });

  it("returns false on stream read failure", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(markStreamAsRead(STREAM_UUID)).resolves.toBe(false);
  });

  it("throws for invalid streamId", async () => {
    await expect(markStreamAsRead("not-a-uuid")).rejects.toThrow(/Invalid streamUuid/);
  });
});

// ---------------------------------------------------------------------------
// markTopicAsRead
// ---------------------------------------------------------------------------

describe("markTopicAsRead", () => {
  it("marks a Workspace topic as read by topic UUID", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: streamTopicResponse("bugs"),
      raw: { statusText: "OK" },
    });

    const result = await markTopicAsRead(STREAM_UUID, "bugs", TOPIC_UUID);

    expect(result).toBe(true);
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/stream_topics/${TOPIC_UUID}/actions/read/invoke`,
      {},
    );
  });

  it("uses a UUID route topic value when no separate topic UUID is passed", async () => {
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: streamTopicResponse("bugs"),
      raw: { statusText: "OK" },
    });

    await expect(markTopicAsRead(STREAM_UUID, TOPIC_UUID)).resolves.toBe(true);
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/stream_topics/${TOPIC_UUID}/actions/read/invoke`,
      {},
    );
  });

  it("throws for invalid streamId", () => {
    expect(() => markTopicAsRead("not-a-uuid", "bugs", TOPIC_UUID)).toThrow(/Invalid streamUuid/);
  });

  it("returns false for unresolved topic names", async () => {
    const result = await markTopicAsRead(STREAM_UUID, "bugs");
    expect(result).toBe(false);
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });

  it("returns false for empty topic without calling the API", async () => {
    const result = await markTopicAsRead(STREAM_UUID, "");
    expect(result).toBe(false);
    expect(mockMessengerApi.postJsonWithBase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// renameStreamTopic
// ---------------------------------------------------------------------------

describe("renameStreamTopic", () => {
  it("renames topic via topic entity PUT without reading messages", async () => {
    const responseTopic = streamTopicResponse("postmortem");
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: responseTopic,
      raw: { statusText: "OK" },
    });

    await expect(
      renameStreamTopic(TOPIC_UUID, STREAM_UUID, "incident", "postmortem"),
    ).resolves.toEqual(responseTopic);
    expect(mockMessengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/stream_topics/${TOPIC_UUID}`,
      { name: "postmortem" },
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// moveStreamTopicToChannel
// ---------------------------------------------------------------------------

describe("moveStreamTopicToChannel", () => {
  it("moves topic to another channel via topic entity PUT", async () => {
    const responseTopic = streamTopicResponse("incident", TARGET_STREAM_UUID);
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: responseTopic,
      raw: { statusText: "OK" },
    });

    await expect(
      moveStreamTopicToChannel(TOPIC_UUID, STREAM_UUID, "incident", TARGET_STREAM_UUID, "incident"),
    ).resolves.toEqual(responseTopic);
    expect(mockMessengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/stream_topics/${TOPIC_UUID}`,
      { stream_uuid: TARGET_STREAM_UUID },
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
  });

  it("returns null when source and target stream are the same", async () => {
    await expect(
      moveStreamTopicToChannel(TOPIC_UUID, STREAM_UUID, "incident", STREAM_UUID, "incident"),
    ).resolves.toBeNull();
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
    expect(mockMessengerApi.putJsonWithBase).not.toHaveBeenCalled();
  });

  it("returns null when topic update fails", async () => {
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Bad Request" },
      raw: { statusText: "Bad Request" },
    });

    await expect(
      moveStreamTopicToChannel(TOPIC_UUID, STREAM_UUID, "incident", TARGET_STREAM_UUID, "incident"),
    ).resolves.toBeNull();
  });

  it("moves and renames topic with both changed fields", async () => {
    const responseTopic = streamTopicResponse("postmortem", TARGET_STREAM_UUID);
    mockMessengerApi.putJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: responseTopic,
      raw: { statusText: "OK" },
    });

    await expect(
      moveStreamTopicToChannel(
        TOPIC_UUID,
        STREAM_UUID,
        "incident",
        TARGET_STREAM_UUID,
        "postmortem",
      ),
    ).resolves.toEqual(responseTopic);
    expect(mockMessengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/stream_topics/${TOPIC_UUID}`,
      { stream_uuid: TARGET_STREAM_UUID, name: "postmortem" },
    );
  });
});

// ---------------------------------------------------------------------------
// setTopicResolvedState
// ---------------------------------------------------------------------------

describe("setTopicResolvedState", () => {
  it("toggles topic done state via topic action without renaming the topic", async () => {
    const responseTopic = { ...streamTopicResponse("incident"), is_done: true };
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: responseTopic,
      raw: { statusText: "OK" },
    });

    await expect(setTopicResolvedState(TOPIC_UUID, STREAM_UUID, "incident", true)).resolves.toEqual(
      responseTopic,
    );
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/stream_topics/${TOPIC_UUID}/toggle_done/`,
      {},
    );
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
    expect(mockMessengerApi.patch).not.toHaveBeenCalled();
    expect(mockMessengerApi.putJsonWithBase).not.toHaveBeenCalled();
  });

  it("uses the same action for undo done", async () => {
    const responseTopic = { ...streamTopicResponse("incident"), is_done: false };
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: responseTopic,
      raw: { statusText: "OK" },
    });

    await expect(
      setTopicResolvedState(TOPIC_UUID, STREAM_UUID, "incident", false),
    ).resolves.toEqual(responseTopic);
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/stream_topics/${TOPIC_UUID}/toggle_done/`,
      {},
    );
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

  it("throws for invalid message id", () => {
    expect(() => updateMessageFlags([MESSAGE_ID_1, "not-a-message-id"], "add", "read")).toThrow(
      /Invalid messageId/,
    );
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });

  it("throws for blank flag name", () => {
    expect(() => updateMessageFlags([MESSAGE_ID_1], "add", "   ")).toThrow(
      /updateMessageFlags\.flag must be a non-empty string/,
    );
    expect(mockMessengerApi.post).not.toHaveBeenCalled();
  });
});
