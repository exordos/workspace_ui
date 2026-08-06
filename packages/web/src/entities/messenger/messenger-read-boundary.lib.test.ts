import { describe, expect, it } from "vitest";
import {
  advanceMessengerReadBoundary,
  applyMessengerReadBoundary,
  clearMessengerReadBoundariesForOwner,
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
});
