import { describe, expect, it } from "vitest";
import type { MessengerMessage, MessengerStream } from "~/entities/messenger/messenger.types";
import type { UsersById } from "~/entities/user/user.types";
import { buildWorkspaceIncomingDmCallInvite } from "./workspace-jitsi-incoming-call.lib";

const OWNER_KEY = "account-a:instance-a:org-a:project-a:user-a";
const CURRENT_USER_UUID = "11111111-1111-4111-8111-111111111111";
const CALLER_UUID = "22222222-2222-4222-8222-222222222222";
const STREAM_UUID = "33333333-3333-4333-8333-333333333333";
const TOPIC_UUID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_UUID = "55555555-5555-4555-8555-555555555555";
const DATE = "2026-07-08T10:30:00Z";
const MEET_URL = "https://meet.workspace.example.com";

type MessageOverrides = Omit<Partial<MessengerMessage>, "payload"> & {
  markdown?: string;
  payload?: MessengerMessage["payload"];
};

function createMessage(overrides: MessageOverrides = {}): MessengerMessage {
  const { markdown, payload, ...rest } = overrides;
  return {
    uuid: MESSAGE_UUID,
    conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: CALLER_UUID,
    userUuid: CURRENT_USER_UUID,
    payload: payload ?? {
      kind: "markdown",
      content: markdown ?? `${MEET_URL}/workspace-room-1`,
    },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: DATE,
    updatedAt: DATE,
    ...rest,
  };
}

function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: STREAM_UUID,
    projectId: "project-a",
    ownerUuid: CURRENT_USER_UUID,
    userUuid: CURRENT_USER_UUID,
    role: "member",
    notificationMode: "all_messages",
    name: "Alice Adams",
    description: "",
    unreadCount: 1,
    sourceName: "native",
    source: { kind: "native" },
    audience: "private",
    isPrivate: true,
    inviteOnly: true,
    announce: false,
    isArchived: false,
    directUserUuid: CALLER_UUID,
    lastMessageUuid: MESSAGE_UUID,
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function createUsersById(): UsersById {
  return {
    [CALLER_UUID]: {
      uuid: CALLER_UUID,
      username: "alice",
      firstName: "Alice",
      lastName: "Adams",
      displayName: "Alice Adams",
      email: "alice@example.com",
      avatarUrl: "/avatars/alice.png",
      status: "active",
      statusEmoji: null,
      statusText: null,
      lastPingAt: DATE,
      createdAt: DATE,
      updatedAt: DATE,
    },
  };
}

describe("buildWorkspaceIncomingDmCallInvite", () => {
  it("builds an incoming invite from a peer DM Jitsi message", () => {
    const invite = buildWorkspaceIncomingDmCallInvite({
      ownerKey: OWNER_KEY,
      message: createMessage(),
      stream: createStream(),
      usersById: createUsersById(),
      currentUserUuid: CURRENT_USER_UUID,
      currentUserDisplayName: "Current User",
      meetUrl: MEET_URL,
    });

    expect(invite).toEqual({
      messageId: MESSAGE_UUID,
      meetingUrl: `${MEET_URL}/workspace-room-1`,
      callerName: "Alice Adams",
      locationName: "Alice Adams",
      ownerKey: OWNER_KEY,
      meetUrl: MEET_URL,
      displayName: "Current User",
      avatarUrl: "/avatars/alice.png",
      timestamp: Date.parse(DATE),
    });
  });

  it("ignores read, own, non-DM, and non-Jitsi messages", () => {
    const baseInput = {
      ownerKey: OWNER_KEY,
      stream: createStream(),
      usersById: createUsersById(),
      currentUserUuid: CURRENT_USER_UUID,
      currentUserDisplayName: "Current User",
      meetUrl: MEET_URL,
    };

    expect(
      buildWorkspaceIncomingDmCallInvite({
        ...baseInput,
        message: createMessage({ read: true }),
      }),
    ).toBeNull();
    expect(
      buildWorkspaceIncomingDmCallInvite({
        ...baseInput,
        message: createMessage({ isOwn: true }),
      }),
    ).toBeNull();
    expect(
      buildWorkspaceIncomingDmCallInvite({
        ...baseInput,
        message: createMessage(),
        stream: createStream({ isPrivate: false, audience: "channel", directUserUuid: null }),
      }),
    ).toBeNull();
    expect(
      buildWorkspaceIncomingDmCallInvite({
        ...baseInput,
        message: createMessage({ markdown: "plain message" }),
      }),
    ).toBeNull();
  });
});
