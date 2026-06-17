import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import type { CurrentUserMessageEditPolicy } from "~/shared/types/message-edit-policy";
import { canStartMessageContentEdit } from "./message-edit-policy.lib";

function createMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 1,
    sender_id: 42,
    sender_full_name: "Alice",
    stream_id: 1,
    subject: "general",
    content: "hello",
    timestamp: 1000,
    ...overrides,
  };
}

describe("canStartMessageContentEdit", () => {
  it("allows own message when policy is unknown", () => {
    expect(canStartMessageContentEdit(createMessage(), 42, undefined, 2000)).toBe(true);
  });

  it("blocks when message editing is disabled by realm policy", () => {
    const policy: CurrentUserMessageEditPolicy = { allowMessageEditing: false };
    expect(canStartMessageContentEdit(createMessage(), 42, policy, 1001)).toBe(false);
  });

  it("allows indefinitely when limit is null", () => {
    const policy: CurrentUserMessageEditPolicy = {
      allowMessageEditing: true,
      messageContentEditLimitSeconds: null,
    };
    expect(canStartMessageContentEdit(createMessage(), 42, policy, 999999)).toBe(true);
  });

  it("blocks own message after the edit time limit", () => {
    const policy: CurrentUserMessageEditPolicy = {
      allowMessageEditing: true,
      messageContentEditLimitSeconds: 60,
    };
    expect(canStartMessageContentEdit(createMessage(), 42, policy, 1061)).toBe(false);
  });

  it("does not allow editing another user's message", () => {
    expect(canStartMessageContentEdit(createMessage({ sender_id: 7 }), 42, undefined, 1001)).toBe(
      false,
    );
  });
});
