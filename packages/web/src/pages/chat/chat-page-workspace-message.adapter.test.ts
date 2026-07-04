import { describe, expect, it } from "vitest";
import type { MessengerConversation, MessengerMessage } from "~/entities/messenger/messenger.types";
import type { User } from "~/entities/user/user.types";
import { buildWorkspaceChatMessageListViewModel } from "./chat-page-workspace-message.adapter";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "33333333-3333-4333-8333-333333333333";
const OWN_USER_UUID = "44444444-4444-4444-8444-444444444444";

function createConversation(): MessengerConversation {
  return {
    id: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    title: "Roadmap",
    audience: "channel",
    isPrivate: false,
    unreadCount: 1,
  };
}

function createMessage(overrides: Partial<MessengerMessage> = {}): MessengerMessage {
  return {
    uuid: "55555555-5555-4555-8555-555555555555",
    conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: USER_UUID,
    userUuid: USER_UUID,
    markdown: "hello from workspace",
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T10:00:00.000Z",
    ...overrides,
  };
}

function createUser(overrides: Partial<User> = {}): User {
  return {
    uuid: USER_UUID,
    username: "alice",
    status: "active",
    firstName: "Alice",
    lastName: "Stone",
    displayName: "Alice Stone",
    email: "alice@example.com",
    avatarUrl: null,
    statusEmoji: null,
    statusText: null,
    lastPingAt: "2026-06-30T09:00:00.000Z",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
    ...overrides,
  };
}

describe("buildWorkspaceChatMessageListViewModel", () => {
  it("adapts Workspace messages to the old visual message contract", () => {
    const viewModel = buildWorkspaceChatMessageListViewModel({
      messages: [createMessage()],
      usersById: { [USER_UUID]: createUser() },
      conversation: createConversation(),
      streamName: "general",
    });

    expect(viewModel.messages).toHaveLength(1);
    expect(viewModel.messages[0]).toMatchObject({
      authorUuid: USER_UUID,
      sender_full_name: "Alice Stone",
      display_recipient: "general",
      channel: "general",
      subject: "Roadmap",
      content: "hello from workspace",
      markdown_source: "hello from workspace",
      flags: [],
    });
    expect(viewModel.unreadCount).toBe(1);
    expect(viewModel.firstUnreadId).toBe(viewModel.messages[0]?.id);
  });

  it("does not count own messages as unread in the old visual model", () => {
    const viewModel = buildWorkspaceChatMessageListViewModel({
      messages: [
        createMessage({
          authorUuid: OWN_USER_UUID,
          userUuid: OWN_USER_UUID,
          isOwn: true,
          read: false,
        }),
      ],
      usersById: {
        [OWN_USER_UUID]: createUser({
          uuid: OWN_USER_UUID,
          username: "me",
          firstName: "Me",
          lastName: null,
        }),
      },
      conversation: createConversation(),
      streamName: "general",
    });

    expect(viewModel.unreadCount).toBe(0);
    expect(viewModel.firstUnreadId).toBeUndefined();
  });

  it("adds native Workspace reaction groups without fake Zulip reactions", () => {
    const viewModel = buildWorkspaceChatMessageListViewModel({
      messages: [
        createMessage({
          reactions: { thumbs_up: 2, unknown_team_emoji: 1 },
          ownReactionUuidsByEmojiName: {
            thumbs_up: "66666666-6666-4666-8666-666666666666",
          },
        }),
      ],
      usersById: { [USER_UUID]: createUser() },
      conversation: createConversation(),
      streamName: "general",
    });

    expect(viewModel.messages[0]?.reactions).toBeUndefined();
    expect(viewModel.messages[0]?.workspaceReactionGroups).toEqual([
      {
        key: "workspace:thumbs_up",
        emojiName: "thumbs_up",
        count: 2,
        reactedByMe: true,
        displayChar: "👍",
      },
      {
        key: "workspace:unknown_team_emoji",
        emojiName: "unknown_team_emoji",
        count: 1,
        reactedByMe: false,
        displayChar: ":unknown_team_emoji:",
      },
    ]);
  });
});
