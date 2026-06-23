import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId, testMessageOrdinal } from "~/test/factories";
import { resolveLastOwnMessageForEdit } from "./chat-edit-last-message.lib";

function createMessage(id: number | string, senderId: number, content = `m${id}`): MockMessage {
  return {
    id: testMessageId(id),
    sender_id: senderId,
    sender_full_name: `User ${senderId}`,
    stream_uuid: "00000000-0000-4000-8000-000000000001",
    subject: "general",
    content,
    timestamp: testMessageOrdinal(id),
  };
}

describe("chat-edit-last-message", () => {
  it("returns the last message authored by current user", () => {
    const messages = [createMessage(1, 10), createMessage(2, 42), createMessage(3, 42)];
    const result = resolveLastOwnMessageForEdit(messages, 42, undefined, 10);
    expect(result?.id).toBe(testMessageId(3));
  });

  it("returns null when current user has no messages", () => {
    const messages = [createMessage(1, 10), createMessage(2, 11)];
    expect(resolveLastOwnMessageForEdit(messages, 42, undefined, 10)).toBeNull();
  });

  it("returns null when current user id is missing", () => {
    const messages = [createMessage(1, 42)];
    expect(resolveLastOwnMessageForEdit(messages, null, undefined, 10)).toBeNull();
  });

  it("uses is_own for gateway messages without numeric sender identity", () => {
    const messages = [createMessage(1, 0), { ...createMessage(2, 0), is_own: true }];
    expect(
      resolveLastOwnMessageForEdit(messages, "00000000-0000-0000-0000-000000000000", undefined, 10)
        ?.id,
    ).toBe(testMessageId(2));
  });

  it("skips own messages that can no longer be edited", () => {
    const messages = [
      { ...createMessage(1000, 42), timestamp: 3050 },
      createMessage(2000, 7),
      createMessage(3000, 42),
    ];
    const result = resolveLastOwnMessageForEdit(
      messages,
      42,
      { allowMessageEditing: true, messageContentEditLimitSeconds: 60 },
      3061,
    );
    expect(result?.id).toBe(testMessageId(1000));
  });
});
