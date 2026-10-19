import { describe, expect, it } from "vitest";
import {
  advanceMessengerReadBoundary,
  applyMessengerReadBoundary,
  clearMessengerReadBoundariesForOwner,
  discardMessengerReadBoundary,
  readMessengerReadBoundary,
} from "./messenger-read-boundary.lib";
import type { MessengerMessage } from "./messenger.types";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const STREAM = "stream-a";
const TOPIC_A = "topic-a";
const TOPIC_B = "topic-b";

function message(uuid: string, createdAt: string, topicUuid = TOPIC_A): MessengerMessage {
  return {
    uuid,
    conversationId: `topic:${STREAM}:${topicUuid}`,
    projectId: "project-a",
    streamUuid: STREAM,
    topicUuid,
    authorUuid: "author-a",
    userUuid: "user-a",
    payload: { kind: "markdown", content: "text" },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt,
    updatedAt: createdAt,
  };
}

describe("messenger read boundary", () => {
  it("discards only the captured boundary and preserves a newer read", () => {
    clearMessengerReadBoundariesForOwner(OWNER_A);
    const first = advanceMessengerReadBoundary({
      ownerKey: OWNER_A,
      streamUuid: STREAM,
      topicUuid: TOPIC_A,
      createdAt: "2026-08-01T10:00:00Z",
      messageUuid: "a",
    });
    const newer = advanceMessengerReadBoundary({ ...first, messageUuid: "b" });

    expect(discardMessengerReadBoundary(first)).toBe(false);
    expect(readMessengerReadBoundary(OWNER_A, STREAM, TOPIC_A)).toBe(newer);
    expect(discardMessengerReadBoundary(newer)).toBe(true);
    expect(readMessengerReadBoundary(OWNER_A, STREAM, TOPIC_A)).toBeNull();
  });

  it("is a monotonic max including uuid for equal createdAt", () => {
    clearMessengerReadBoundariesForOwner(OWNER_A);
    advanceMessengerReadBoundary({
      ownerKey: OWNER_A,
      streamUuid: STREAM,
      topicUuid: TOPIC_A,
      createdAt: "2026-08-01T10:00:00.000Z",
      messageUuid: "b",
    });
    advanceMessengerReadBoundary({
      ownerKey: OWNER_A,
      streamUuid: STREAM,
      topicUuid: TOPIC_A,
      createdAt: "2026-08-01T10:00:00.000Z",
      messageUuid: "a",
    });

    expect(readMessengerReadBoundary(OWNER_A, STREAM, TOPIC_A)?.messageUuid).toBe("b");
    expect(applyMessengerReadBoundary(message("a", "2026-08-01T10:00:00.000Z"), OWNER_A).read).toBe(
      true,
    );
    expect(applyMessengerReadBoundary(message("c", "2026-08-01T10:00:00.000Z"), OWNER_A).read).toBe(
      false,
    );
  });

  it("does not cross owner or topic", () => {
    clearMessengerReadBoundariesForOwner(OWNER_A);
    clearMessengerReadBoundariesForOwner(OWNER_B);
    advanceMessengerReadBoundary({
      ownerKey: OWNER_A,
      streamUuid: STREAM,
      topicUuid: TOPIC_A,
      createdAt: "2026-08-01T10:00:00.000Z",
      messageUuid: "b",
    });

    expect(applyMessengerReadBoundary(message("a", "2026-08-01T09:00:00.000Z"), OWNER_A).read).toBe(
      true,
    );
    expect(
      applyMessengerReadBoundary(message("a", "2026-08-01T09:00:00.000Z", TOPIC_B), OWNER_A).read,
    ).toBe(false);
    expect(applyMessengerReadBoundary(message("a", "2026-08-01T09:00:00.000Z"), OWNER_B).read).toBe(
      false,
    );
  });

  it("preserves a fresh provider-unread state for a message authored by the current user", () => {
    clearMessengerReadBoundariesForOwner(OWNER_A);
    advanceMessengerReadBoundary({
      ownerKey: OWNER_A,
      streamUuid: STREAM,
      topicUuid: TOPIC_A,
      createdAt: "2026-08-01T10:00:00.000Z",
      messageUuid: "b",
    });

    const ownUnread = {
      ...message("a", "2026-08-01T09:00:00.000Z"),
      authorUuid: "user-a",
      isOwn: true,
    };
    expect(applyMessengerReadBoundary(ownUnread, OWNER_A).read).toBe(false);
  });
});
