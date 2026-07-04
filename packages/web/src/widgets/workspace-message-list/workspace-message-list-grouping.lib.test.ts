import { describe, expect, it } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { groupWorkspaceMessagesByDayAndAuthor } from "./workspace-message-list-grouping.lib";

function createWorkspaceMessage(overrides: Partial<MessengerMessage> = {}): MessengerMessage {
  return {
    uuid: "message-uuid-1",
    conversationId: "topic:stream-uuid-1:topic-uuid-1",
    projectId: "project-uuid-1",
    streamUuid: "stream-uuid-1",
    topicUuid: "topic-uuid-1",
    authorUuid: "author-uuid-1",
    userUuid: "author-uuid-1",
    markdown: "Workspace text message",
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
    ...overrides,
  };
}

function createIsoStringFromLocalTime(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number,
): string {
  return new Date(year, monthIndex, day, hours, minutes, 0, 0).toISOString();
}

describe("groupWorkspaceMessagesByDayAndAuthor", () => {
  it("sorts by createdAt and uuid without mutating the source array", () => {
    const sourceMessages = [
      createWorkspaceMessage({
        uuid: "message-c",
        createdAt: "2026-07-03T09:02:00.000Z",
      }),
      createWorkspaceMessage({
        uuid: "message-b",
        createdAt: "2026-07-03T09:01:00.000Z",
      }),
      createWorkspaceMessage({
        uuid: "message-a",
        createdAt: "2026-07-03T09:01:00.000Z",
      }),
    ];

    const groupedMessages = groupWorkspaceMessagesByDayAndAuthor(sourceMessages);

    expect(sourceMessages.map((message) => message.uuid)).toEqual([
      "message-c",
      "message-b",
      "message-a",
    ]);
    expect(
      groupedMessages.flatMap((dayGroup) =>
        dayGroup.authorGroups.flatMap((authorGroup) =>
          authorGroup.messages.map((message) => message.uuid),
        ),
      ),
    ).toEqual(["message-a", "message-b", "message-c"]);
  });

  it("splits calendar days and only groups neighboring messages from the same author", () => {
    const groupedMessages = groupWorkspaceMessagesByDayAndAuthor([
      createWorkspaceMessage({
        uuid: "day-one-author-a-first",
        authorUuid: "author-a",
        createdAt: "2026-07-03T09:00:00.000Z",
      }),
      createWorkspaceMessage({
        uuid: "day-one-author-a-second",
        authorUuid: "author-a",
        createdAt: "2026-07-03T09:01:00.000Z",
      }),
      createWorkspaceMessage({
        uuid: "day-one-author-b",
        authorUuid: "author-b",
        createdAt: "2026-07-03T09:02:00.000Z",
      }),
      createWorkspaceMessage({
        uuid: "day-one-author-a-third",
        authorUuid: "author-a",
        createdAt: "2026-07-03T09:03:00.000Z",
      }),
      createWorkspaceMessage({
        uuid: "day-two-author-a",
        authorUuid: "author-a",
        createdAt: "2026-07-04T09:00:00.000Z",
      }),
    ]);

    expect(groupedMessages).toHaveLength(2);
    expect(groupedMessages[0]?.dateKey).toBe("2026-07-03");
    expect(groupedMessages[0]?.authorGroups).toHaveLength(3);
    expect(groupedMessages[0]?.authorGroups.map((group) => group.authorUuid)).toEqual([
      "author-a",
      "author-b",
      "author-a",
    ]);
    expect(groupedMessages[0]?.authorGroups[0]?.messages.map((message) => message.uuid)).toEqual([
      "day-one-author-a-first",
      "day-one-author-a-second",
    ]);
    expect(groupedMessages[1]?.dateKey).toBe("2026-07-04");
    expect(groupedMessages[1]?.authorGroups).toHaveLength(1);
  });

  it("uses the local calendar day near a day boundary", () => {
    const groupedMessages = groupWorkspaceMessagesByDayAndAuthor([
      createWorkspaceMessage({
        uuid: "local-day-start-message",
        createdAt: createIsoStringFromLocalTime(2026, 6, 3, 0, 30),
      }),
      createWorkspaceMessage({
        uuid: "local-day-end-message",
        createdAt: createIsoStringFromLocalTime(2026, 6, 3, 23, 30),
      }),
    ]);

    expect(groupedMessages).toHaveLength(1);
    expect(groupedMessages[0]?.dateKey).toBe("2026-07-03");
    expect(groupedMessages[0]?.authorGroups[0]?.messages.map((message) => message.uuid)).toEqual([
      "local-day-start-message",
      "local-day-end-message",
    ]);
  });
});
