import { describe, expect, it } from "vitest";
import {
  fetchReplacementMessageForDeletedPreview,
  pickReplacementForDm,
  pickReplacementForStreamTopic,
} from "./chat-list-delete-messages.lib";
import type { ChatListPreviewSourceMessage } from "./chat-list.model.types";

const streamMsg = (
  id: number,
  streamId: number,
  subject: string,
  ts: number,
): ChatListPreviewSourceMessage => ({
  id,
  stream_id: streamId,
  subject,
  timestamp: ts,
  content: `m${id}`,
  display_recipient: "general",
});

const dmMsg = (id: number, userIds: number[], ts: number): ChatListPreviewSourceMessage => ({
  id,
  timestamp: ts,
  content: `m${id}`,
  display_recipient: userIds.map((uid) => ({ id: uid, full_name: `u${uid}` })),
});

describe("chat-list-delete-messages", () => {
  it("pickReplacementForStreamTopic returns newest in topic excluding deleted ids", () => {
    const messages = [
      streamMsg(1, 5, "topic", 10),
      streamMsg(2, 5, "topic", 20),
      streamMsg(3, 5, "other", 30),
    ];
    expect(pickReplacementForStreamTopic(messages, 5, "topic", new Set([2]))?.id).toBe(1);
    expect(pickReplacementForStreamTopic(messages, 5, "topic", new Set([1, 2]))).toBeNull();
  });

  it("pickReplacementForDm matches conversation key", () => {
    const messages = [dmMsg(10, [10, 20], 5), dmMsg(11, [10, 30], 15)];
    expect(pickReplacementForDm(messages, "10,20", 10)?.id).toBe(10);
    expect(pickReplacementForDm(messages, "10,30", 10)?.id).toBe(11);
  });

  it("does not fetch replacement previews after legacy Zulip API removal", async () => {
    await expect(
      fetchReplacementMessageForDeletedPreview(
        {
          kind: "stream",
          streamId: 5,
          topicKey: "topic",
          streamName: "general",
          deletedLastMessageId: 2,
        },
        10,
      ),
    ).resolves.toBeNull();

    await expect(
      fetchReplacementMessageForDeletedPreview(
        {
          kind: "dm",
          dmKey: "10,20",
          deletedLastMessageId: 10,
        },
        10,
      ),
    ).resolves.toBeNull();
  });
});
