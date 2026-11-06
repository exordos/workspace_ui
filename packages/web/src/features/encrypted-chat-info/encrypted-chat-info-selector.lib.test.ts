import { describe, expect, it } from "vitest";
import type { MessengerMessage, MessengerStream } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";
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
        currentEncryptionKey: { keyUuid: "current-key" },
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
  it("includes historical requests while scoping announcement date to the current key", () => {
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
      {
        requestMessageUuid: "old",
        name: "author",
        deviceName: "Old device",
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
    expect(projection?.keyAnnouncementDates).toEqual({});
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
        bindingsById: {
          binding,
          otherStream: { ...binding, uuid: "other-stream", streamUuid: "another" },
          second: { ...binding, uuid: "second", userUuid: "missing-user" },
          otherProject: { ...binding, uuid: "other-project", projectId: "another" },
        },
        usersById: { author: user },
      }),
    );
    expect(projection?.members).toEqual(
      ["binding", "second"].map((id, index) => ({
        id,
        name: index === 0 ? "author" : "missing-user",
        avatarUrl: null,
        email: null,
        presence: null,
        statusLabel: null,
        roleLabel: t("roles.member"),
      })),
    );
    expect(projection?.onlineCount).toBe(0);
  });
  it("projects member contact, role, and presence from the current users owner", () => {
    const binding = {
      uuid: "binding",
      projectId: "project-a",
      streamUuid: "stream",
      userUuid: "author",
      whoUuid: "author",
      role: "administrator" as const,
      notificationMode: "all_messages" as const,
      createdAt: "date",
      updatedAt: "date",
    };
    const user = {
      uuid: "author",
      username: "author",
      firstName: "Ava",
      lastName: "Example",
      displayName: "Ava Example",
      email: " ava@example.com ",
      avatarUrl: "urn:url:https://example.com/avatar.png",
      status: "active" as const,
      statusEmoji: null,
      statusText: null,
      lastPingAt: "date",
      createdAt: "date",
      updatedAt: "date",
    };
    const projection = selectEncryptedChatInfo(
      snapshot({ bindingsById: { binding }, usersById: { author: user } }),
    );

    expect(projection?.members).toEqual([
      {
        id: "binding",
        name: "Ava Example",
        avatarUrl: user.avatarUrl,
        email: "ava@example.com",
        presence: "active",
        statusLabel: t("presence.online"),
        roleLabel: t("roles.admin"),
      },
    ]);
    expect(projection?.onlineCount).toBe(1);
  });
});

it("keeps independent announcement dates for every loaded generation and excludes other chats", () => {
  const historical = {
    ...message("historical", { kind: "key_announced", keyUuid: "old-key" }),
    createdAt: "2026-09-01T00:00:00Z",
  };
  const current = message("current", { kind: "key_announced", keyUuid: "current-key" });
  const duplicate = { ...historical, uuid: "duplicate", createdAt: "2026-09-02T00:00:00Z" };
  const other = {
    ...historical,
    uuid: "other",
    streamUuid: "another",
    payload: { kind: "key_announced" as const, keyUuid: "other-key" },
  };
  const projection = selectEncryptedChatInfo(
    snapshot({ messagesById: { historical, current, duplicate, other } }),
  );
  expect(projection?.keyAnnouncementDates).toEqual({
    "old-key": historical.createdAt,
    "current-key": current.createdAt,
  });
  expect(projection?.keyCreatedAt).toBe(current.createdAt);
});
