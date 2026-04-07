import { describe, expect, it, vi } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { loadDeepHistoryMessages } from "./layout-chat-history-sync.lib";

function createMessage(id: number): ZulipRawMessage {
  return {
    id,
    sender_id: 1,
    sender_full_name: "Test User",
    content: `message-${id}`,
    timestamp: id,
    display_recipient: "general",
    subject: "topic",
    type: "stream",
    stream_id: 1,
    flags: ["read"],
  };
}

describe("loadDeepHistoryMessages", () => {
  it("loads multiple history batches until max batch count is reached", async () => {
    const fetchOlderMessages = vi
      .fn()
      .mockResolvedValueOnce([createMessage(97), createMessage(98), createMessage(99)])
      .mockResolvedValueOnce([createMessage(94), createMessage(95), createMessage(96)])
      .mockResolvedValueOnce([createMessage(91), createMessage(92), createMessage(93)]);

    const result = await loadDeepHistoryMessages({
      initialMessages: [createMessage(100), createMessage(101)],
      fetchOlderMessages,
      pageSize: 3,
      maxBatches: 2,
    });

    expect(fetchOlderMessages).toHaveBeenCalledTimes(2);
    expect(fetchOlderMessages).toHaveBeenNthCalledWith(1, 100, 3);
    expect(fetchOlderMessages).toHaveBeenNthCalledWith(2, 97, 3);
    expect(result.map((message) => message.id)).toEqual([94, 95, 96, 97, 98, 99, 100, 101]);
  });

  it("stops loading when the server returns only the anchor overlap", async () => {
    const fetchOlderMessages = vi.fn().mockResolvedValueOnce([createMessage(100)]);

    const result = await loadDeepHistoryMessages({
      initialMessages: [createMessage(100), createMessage(101)],
      fetchOlderMessages,
      pageSize: 3,
      maxBatches: 5,
    });

    expect(fetchOlderMessages).toHaveBeenCalledTimes(1);
    expect(result.map((message) => message.id)).toEqual([100, 101]);
  });

  it("keeps unique IDs when older pages overlap with existing messages", async () => {
    const fetchOlderMessages = vi
      .fn()
      .mockResolvedValueOnce([createMessage(98), createMessage(99), createMessage(100)]);

    const result = await loadDeepHistoryMessages({
      initialMessages: [createMessage(100), createMessage(101)],
      fetchOlderMessages,
      pageSize: 3,
      maxBatches: 5,
    });

    expect(result.map((message) => message.id)).toEqual([98, 99, 100, 101]);
  });
});
