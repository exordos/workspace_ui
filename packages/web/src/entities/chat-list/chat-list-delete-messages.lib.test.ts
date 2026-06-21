import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  pickReplacementForDm,
  pickReplacementForStreamTopic,
} from "./chat-list-delete-messages.lib";
import type { ChatListPreviewSourceMessage } from "./chat-list.model.types";

const MESSAGE_ID_1 = testMessageId(1);
const MESSAGE_ID_2 = testMessageId(2);
const MESSAGE_ID_10 = testMessageId(10);
const MESSAGE_ID_11 = testMessageId(11);

const streamMsg = (
  id: number,
  streamId: number,
  subject: string,
  ts: number,
): ChatListPreviewSourceMessage => ({
  id: testMessageId(id),
  stream_id: streamId,
  subject,
  timestamp: ts,
  content: `m${id}`,
  display_recipient: "general",
});

const dmMsg = (id: number, userIds: number[], ts: number): ChatListPreviewSourceMessage => ({
  id: testMessageId(id),
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
    expect(pickReplacementForStreamTopic(messages, 5, "topic", new Set([MESSAGE_ID_2]))?.id).toBe(
      MESSAGE_ID_1,
    );
    expect(
      pickReplacementForStreamTopic(messages, 5, "topic", new Set([MESSAGE_ID_1, MESSAGE_ID_2])),
    ).toBeNull();
  });

  it("pickReplacementForDm matches conversation key", () => {
    const messages = [dmMsg(10, [10, 20], 5), dmMsg(11, [10, 30], 15)];
    expect(pickReplacementForDm(messages, "10,20", 10)?.id).toBe(MESSAGE_ID_10);
    expect(pickReplacementForDm(messages, "10,30", 10)?.id).toBe(MESSAGE_ID_11);
  });
});
