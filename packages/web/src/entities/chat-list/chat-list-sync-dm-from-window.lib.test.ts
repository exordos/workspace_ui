import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
import {
  pickNewestDmMessageForKey,
  shouldSyncDmPreviewFromWindow,
  syncDmSidebarFromLoadedMessages,
} from "./chat-list-sync-dm-from-window.lib";
import { useChatListStore } from "./chat-list.model";

type MockMessageOverrides = Partial<Omit<MockMessage, "id">> & {
  id?: MockMessage["id"] | number;
};

function dmMessage(overrides: MockMessageOverrides = {}): MockMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 50),
    sender_id: 20,
    sender_full_name: "Bob",
    content: "hello",
    timestamp: 2000,
    stream_id: null,
    subject: "",
    display_recipient: [
      { id: 10, full_name: "Alice", email: "a@x.test" },
      { id: 20, full_name: "Bob", email: "b@x.test" },
    ],
    flags: [],
    ...rest,
  };
}

describe("shouldSyncDmPreviewFromWindow", () => {
  it("allows sync for normal DM open without focused anchor", () => {
    expect(shouldSyncDmPreviewFromWindow({ focusedMessageId: null, hasNewerMessages: true })).toBe(
      true,
    );
  });

  it("skips sync when focused anchor has newer messages beyond the window", () => {
    expect(
      shouldSyncDmPreviewFromWindow({
        focusedMessageId: "00000000-0000-4000-8000-000000000100",
        hasNewerMessages: true,
      }),
    ).toBe(false);
  });

  it("allows sync when focused anchor reached conversation end", () => {
    expect(
      shouldSyncDmPreviewFromWindow({
        focusedMessageId: "00000000-0000-4000-8000-000000000100",
        hasNewerMessages: false,
      }),
    ).toBe(true);
  });
});

describe("pickNewestDmMessageForKey", () => {
  it("returns newest private message for dm key", () => {
    const messages = [
      dmMessage({ id: 1, content: "older", timestamp: 1000 }),
      dmMessage({ id: 2, content: "newest", timestamp: 3000 }),
      dmMessage({ id: 3, content: "middle", timestamp: 2000 }),
    ];
    const picked = pickNewestDmMessageForKey(messages, "10,20", 10);
    expect(picked?.id).toBe(testMessageId(2));
    expect(picked?.content).toContain("newest");
  });
});

describe("syncDmSidebarFromLoadedMessages", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    useUsersStore.getState().mergeUser({ user_id: 10, full_name: "Alice", email: "a@x.test" });
    useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob", email: "b@x.test" });
    useChatListStore.getState().setCurrentUserId(10);
  });

  afterEach(() => {
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
  });

  it("fills empty DM preview when metadata ts is newer than loaded message timestamp", () => {
    useChatListStore.getState().upsertDmMetadataRows([
      {
        userIds: [10, 20],
        unreadCount: 0,
        lastMessageId: "00000000-0000-4000-8000-000000000123",
        lastActivityTs: 1_700_000_000,
      },
    ]);

    syncDmSidebarFromLoadedMessages({
      messages: [
        dmMessage({
          id: 123,
          content: "preview from opened chat",
          timestamp: 1_600_000_000,
        }),
      ],
      dmKey: "10,20",
      currentUserId: 10,
      instanceId: null,
      source: "api",
      focusedMessageId: null,
      hasNewerMessages: false,
    });

    const dm = useChatListStore.getState().dmsMap.get("10,20");
    expect(dm?.lastMessage).toContain("preview from opened chat");
    expect(dm?.lastMessageId).toBe(testMessageId(123));
    expect(dm?.ts).toBe(1_700_000_000);
  });

  it("does not update preview when focused anchor window excludes conversation tail", () => {
    useChatListStore.getState().upsertDmMetadataRows([
      {
        userIds: [10, 20],
        unreadCount: 0,
        lastMessageId: "00000000-0000-4000-8000-000000000500",
        lastActivityTs: 1_700_000_000,
      },
    ]);

    syncDmSidebarFromLoadedMessages({
      messages: [
        dmMessage({
          id: 100,
          content: "stale anchor window",
          timestamp: 1_000_000_000,
        }),
      ],
      dmKey: "10,20",
      currentUserId: 10,
      instanceId: null,
      source: "api",
      focusedMessageId: "00000000-0000-4000-8000-000000000100",
      hasNewerMessages: true,
    });

    const dm = useChatListStore.getState().dmsMap.get("10,20");
    expect(dm?.lastMessage).toBe("");
  });

  it("indexes unread DM message locations even when preview sync is skipped", () => {
    syncDmSidebarFromLoadedMessages({
      messages: [
        dmMessage({
          id: "00000000-0000-4000-8000-000000000777",
          flags: ["unread"],
        }),
      ],
      dmKey: "10,20",
      currentUserId: 10,
      instanceId: null,
      source: "api",
      focusedMessageId: "00000000-0000-4000-8000-000000000777",
      hasNewerMessages: true,
    });

    expect(
      useChatListStore.getState().messageIdToLocation.get("00000000-0000-4000-8000-000000000777")
        ?.type,
    ).toBe("dm");
  });
});
