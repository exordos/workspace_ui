import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { resolveLastOwnMessageForEdit } from "./chat-edit-last-message.lib";

function createMessage(id: number, senderId: number, content = `m${id}`): MockMessage {
  return {
    id,
    sender_id: senderId,
    sender_full_name: `User ${senderId}`,
    stream_id: 1,
    subject: "general",
    content,
    timestamp: id,
  };
}

describe("chat-edit-last-message", () => {
  it("returns the last message authored by current user", () => {
    const messages = [createMessage(1, 10), createMessage(2, 42), createMessage(3, 42)];
    const result = resolveLastOwnMessageForEdit(messages, 42);
    expect(result?.id).toBe(3);
  });

  it("returns null when current user has no messages", () => {
    const messages = [createMessage(1, 10), createMessage(2, 11)];
    expect(resolveLastOwnMessageForEdit(messages, 42)).toBeNull();
  });

  it("returns null when current user id is missing", () => {
    const messages = [createMessage(1, 42)];
    expect(resolveLastOwnMessageForEdit(messages, null)).toBeNull();
  });
});
