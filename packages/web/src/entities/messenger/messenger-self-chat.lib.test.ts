import { describe, expect, it } from "vitest";
import {
  findWorkspaceDefaultTopic,
  findWorkspaceSelfChatStream,
  isWorkspaceSelfChat,
} from "./messenger-self-chat.lib";
import type { MessengerStream, MessengerTopic } from "./messenger.types";

const CURRENT_USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const TOPIC_UUID = "33333333-3333-4333-8333-333333333333";

function stream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: STREAM_UUID,
    projectId: "44444444-4444-4444-8444-444444444444",
    ownerUuid: CURRENT_USER_UUID,
    userUuid: CURRENT_USER_UUID,
    role: "owner",
    notificationMode: "all_messages",
    name: "Personal notes",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "private",
    isPrivate: true,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: CURRENT_USER_UUID,
    lastMessageUuid: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function topic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: TOPIC_UUID,
    projectId: "44444444-4444-4444-8444-444444444444",
    streamUuid: STREAM_UUID,
    userUuid: CURRENT_USER_UUID,
    name: "General Topic",
    unreadCount: 0,
    isDefault: true,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("messenger self chat", () => {
  it("recognizes only a private direct stream addressed to the current user", () => {
    expect(isWorkspaceSelfChat(stream(), CURRENT_USER_UUID)).toBe(true);
    expect(isWorkspaceSelfChat(stream({ directUserUuid: null }), CURRENT_USER_UUID)).toBe(false);
    expect(isWorkspaceSelfChat(stream({ isPrivate: false }), CURRENT_USER_UUID)).toBe(false);
    expect(isWorkspaceSelfChat(stream(), "another-user")).toBe(false);
  });

  it("finds the canonical self stream and its default topic", () => {
    const selfStream = stream();
    const defaultTopic = topic();

    expect(
      findWorkspaceSelfChatStream({
        streamIds: [selfStream.uuid],
        streamsById: { [selfStream.uuid]: selfStream },
        currentUserUuid: CURRENT_USER_UUID,
      }),
    ).toBe(selfStream);
    expect(
      findWorkspaceDefaultTopic({
        topicIds: [defaultTopic.uuid],
        topicsById: { [defaultTopic.uuid]: defaultTopic },
        streamUuid: selfStream.uuid,
      }),
    ).toBe(defaultTopic);
  });
});
