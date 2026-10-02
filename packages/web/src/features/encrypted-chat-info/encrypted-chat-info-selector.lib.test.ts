import { describe, expect, it } from "vitest";
import type { MessengerMessage, MessengerStream } from "~/entities/messenger/messenger.types";
import { selectEncryptedChatInfo } from "./encrypted-chat-info-selector.lib";
import type { EncryptedChatInfoSnapshot } from "./encrypted-chat-info-selector.lib";
function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: "stream",
    projectId: "project-a",
    ownerUuid: "user-a",
    userUuid: "user-a",
    role: "owner",
    notificationMode: "all_messages",
    name: "general",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: "2026-06-22T10:10:00Z",
    updatedAt: "2026-06-22T10:10:00Z",
    ...overrides,
  };
}

function message(uuid: string, payload: MessengerMessage["payload"]): MessengerMessage {
  return {
    uuid,
    conversationId: "stream",
    projectId: "project-a",
    streamUuid: "stream",
    topicUuid: "topic",
    authorUuid: "author",
    userUuid: "author",
    payload,
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}
function snapshot(overrides: Partial<EncryptedChatInfoSnapshot> = {}): EncryptedChatInfoSnapshot {
  return {
    ownerKey: "owner",
    catalogOwnerKey: "owner",
    messagesOwnerKey: "owner",
    usersOwnerKey: "owner",
    projectId: "project-a",
    streamUuid: "stream",
    streamsById: {
      stream: createStream({
        encryption: true,
        currentEncryptionKey: { keyUuid: "current-key", publicKey: "opaque-public-key" },
      }),
    },
    bindingsById: {},
    usersById: {},
    messagesById: {},
    ...overrides,
  };
}
describe("encrypted chat info projection", () => {
  it("does not substitute stream creation time for a missing key announcement", () => {
    expect(selectEncryptedChatInfo(snapshot())?.keyCreatedAt).toBeUndefined();
  });
  it("scopes requests and the announcement date to current key and stream in loaded history", () => {
    const current = message("request", {
      kind: "key_request",
      keyUuid: "current-key",
      deviceId: "device",
      deviceName: "MacBook",
      publicKey: "opaque-device-key",
    });
    const old = message("old", {
      kind: "key_request",
      keyUuid: "old-key",
      deviceId: "old-device",
      deviceName: "Old device",
      publicKey: "old-public-key",
    });
    const announcement = message("announcement", {
      kind: "key_announced",
      keyUuid: "current-key",
      publicKey: "opaque-public-key",
    });
    const other = { ...current, uuid: "other", streamUuid: "other-stream" };
    const projection = selectEncryptedChatInfo(
      snapshot({ messagesById: { current, old, announcement, other } }),
    );
    expect(projection?.keyCreatedAt).toBe(announcement.createdAt);
    expect(projection?.requests).toEqual([
      {
        requestMessageUuid: "request",
        name: "author",
        deviceName: "MacBook",
        avatarUrl: null,
        canGrant: false,
        canReject: false,
      },
    ]);
    expect(JSON.stringify(projection?.requests)).not.toContain("opaque-device-key");
  });
  it("rejects an old catalog owner or a different project", () => {
    expect(selectEncryptedChatInfo(snapshot({ catalogOwnerKey: "old-owner" }))).toBeNull();
    expect(selectEncryptedChatInfo(snapshot({ ownerKey: null }))).toBeNull();
    expect(selectEncryptedChatInfo(snapshot({ projectId: "other-project" }))).toBeNull();
  });
  it("does not reuse requests or announcement date from an old message owner", () => {
    const announcement = message("announcement", {
      kind: "key_announced",
      keyUuid: "current-key",
      publicKey: "opaque",
    });
    const request = message("request", {
      kind: "key_request",
      keyUuid: "current-key",
      deviceId: "device",
      deviceName: "MacBook",
      publicKey: "opaque",
    });
    const projection = selectEncryptedChatInfo(
      snapshot({ messagesOwnerKey: "old-owner", messagesById: { announcement, request } }),
    );
    expect(projection?.requests).toEqual([]);
    expect(projection?.keyCreatedAt).toBeUndefined();
  });
  it("does not leak names, avatar URNs, or online status from another users owner", () => {
    const binding = {
      uuid: "binding",
      projectId: "project-a",
      streamUuid: "stream",
      userUuid: "author",
      whoUuid: "author",
      role: "member" as const,
      notificationMode: "all_messages" as const,
      createdAt: "date",
      updatedAt: "date",
    };
    const user = {
      uuid: "author",
      username: "author",
      firstName: "Old",
      lastName: "Owner",
      displayName: "Old owner person",
      email: null,
      avatarUrl: "urn:url:https://old-owner.example/avatar.png",
      status: "active" as const,
      statusEmoji: null,
      statusText: null,
      lastPingAt: "date",
      createdAt: "date",
      updatedAt: "date",
    };
    const projection = selectEncryptedChatInfo(
      snapshot({
        usersOwnerKey: "old-owner",
        bindingsById: { binding },
        usersById: { author: user },
      }),
    );
    expect(projection?.members).toEqual([{ id: "binding", name: "author", avatarUrl: null }]);
    expect(projection?.onlineCount).toBe(0);
  });
});
