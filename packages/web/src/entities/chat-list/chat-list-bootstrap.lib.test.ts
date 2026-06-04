import { beforeEach, describe, expect, it } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import type { ChatListSnapshotSerialized } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { serializeStreamEntry } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  buildChatListHydrateFromSnapshotState,
  buildDmMetadataEntry,
  buildDmMetadataRowsFromDmsMap,
  buildDmMetadataUpsertPatch,
  buildMessageIdToLocation,
  buildSetFromMessagesBootstrapState,
  buildUnreadLocationMap,
  clearBootstrapErrorPatch,
  mergeBootstrapStreamsWithPreviousMetadata,
  mergeStreamAccessMetadata,
  normalizeDmUserIds,
  type ChatListDmBootstrapDisplayContext,
} from "./chat-list-bootstrap.lib";

const CURRENT_USER_ID = 10;

function streamMsg(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 1,
    sender_id: CURRENT_USER_ID,
    sender_full_name: "Sender",
    content: "hello",
    timestamp: 1000,
    type: "stream",
    stream_id: 5,
    display_recipient: "general",
    subject: "topic1",
    flags: [],
    ...overrides,
  };
}

function dmMsg(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 50,
    sender_id: CURRENT_USER_ID,
    sender_full_name: "Alice",
    content: "hi there",
    timestamp: 2000,
    type: "private",
    display_recipient: [
      { id: 10, full_name: "Alice", email: "alice@t.com" },
      { id: 20, full_name: "Bob", email: "bob@t.com" },
    ],
    flags: [],
    ...overrides,
  };
}

function displayContext(
  overrides: Partial<ChatListDmBootstrapDisplayContext> = {},
): ChatListDmBootstrapDisplayContext {
  return {
    getParticipantDisplayName: (userId) => (userId === 20 ? "Bob" : `User ${userId}`),
    getAvatarUrl: () => undefined,
    groupChatFallbackLabel: "Group chat",
    ...overrides,
  };
}

describe("clearBootstrapErrorPatch", () => {
  it("returns null bootstrapError", () => {
    expect(clearBootstrapErrorPatch()).toEqual({ bootstrapError: null });
  });
});

describe("buildMessageIdToLocation", () => {
  it("indexes stream messages by normalized topic", () => {
    const map = buildMessageIdToLocation(
      [streamMsg({ id: 100, stream_id: 7, subject: "Topic A" })],
      CURRENT_USER_ID,
    );
    expect(map.get(100)).toEqual({ type: "stream", stream_id: 7, topic: "Topic A" });
  });

  it("indexes DM messages by conversation key", () => {
    const map = buildMessageIdToLocation([dmMsg({ id: 200 })], CURRENT_USER_ID);
    expect(map.get(200)).toEqual({ type: "dm", dmKey: "10,20" });
  });
});

describe("buildUnreadLocationMap", () => {
  it("includes only unread messages from others", () => {
    const map = buildUnreadLocationMap(
      [
        streamMsg({ id: 1, flags: [], sender_id: 20 }),
        streamMsg({ id: 2, flags: ["read"], sender_id: 20 }),
        streamMsg({ id: 3, flags: [], sender_id: CURRENT_USER_ID }),
      ],
      CURRENT_USER_ID,
    );
    expect([...map.keys()]).toEqual([1]);
  });
});

describe("mergeStreamAccessMetadata", () => {
  it("preserves access metadata from existing stream entry", () => {
    const existing: StreamEntryInternal = {
      stream_id: 5,
      name: "general",
      lastMessage: "old",
      time: "1m",
      ts: 100,
      inviteOnly: true,
      topics: new Map(),
    };
    const incoming: StreamEntryInternal = {
      stream_id: 5,
      name: "general",
      lastMessage: "new",
      time: "now",
      ts: 200,
      topics: new Map(),
    };
    const merged = mergeStreamAccessMetadata(incoming, existing);
    expect(merged.lastMessage).toBe("new");
    expect(merged.inviteOnly).toBe(true);
  });
});

describe("mergeBootstrapStreamsWithPreviousMetadata", () => {
  it("merges access metadata for every stream in the rebuilt map", () => {
    const previous = new Map<number, StreamEntryInternal>([
      [
        5,
        {
          stream_id: 5,
          name: "general",
          lastMessage: "",
          time: "",
          ts: 0,
          isArchived: true,
          topics: new Map(),
        },
      ],
    ]);
    const rebuilt = buildSetFromMessagesBootstrapState(
      [streamMsg({ stream_id: 5 })],
      CURRENT_USER_ID,
      new Map(),
      new Map(),
    ).streamsMap;
    const merged = mergeBootstrapStreamsWithPreviousMetadata(rebuilt, previous);
    expect(merged.get(5)?.isArchived).toBe(true);
  });
});

describe("normalizeDmUserIds", () => {
  it("injects current user into single-peer metadata rows", () => {
    expect(normalizeDmUserIds([20], CURRENT_USER_ID)).toEqual([10, 20]);
  });
});

describe("buildDmMetadataEntry", () => {
  it("builds personal DM row from metadata", () => {
    const result = buildDmMetadataEntry(
      { userIds: [10, 20], unreadCount: 2, lastActivityTs: 5000 },
      CURRENT_USER_ID,
      undefined,
      displayContext(),
    );
    expect(result?.key).toBe("10,20");
    expect(result?.entry.isGroup).toBe(false);
    expect(result?.entry.id).toBe(20);
    expect(result?.entry.unreadCount).toBe(2);
  });

  it("builds group DM row with synthetic id", () => {
    const result = buildDmMetadataEntry(
      { userIds: [10, 20, 30], unreadCount: 0 },
      CURRENT_USER_ID,
      undefined,
      displayContext({
        getParticipantDisplayName: (id) => `Name${id}`,
      }),
    );
    expect(result?.entry.isGroup).toBe(true);
    expect(result?.entry.name).toContain("Name20");
    expect(result?.entry.name).toContain("Name30");
  });

  it("accumulates unread and ts when merging with existing entry", () => {
    const existing = buildDmMetadataEntry(
      { userIds: [10, 20], unreadCount: 1, lastActivityTs: 1000 },
      CURRENT_USER_ID,
      undefined,
      displayContext(),
    )!.entry;
    const merged = buildDmMetadataEntry(
      { userIds: [10, 20], unreadCount: 3, lastActivityTs: 2000 },
      CURRENT_USER_ID,
      existing,
      displayContext(),
    );
    expect(merged?.entry.unreadCount).toBe(3);
    expect(merged?.entry.ts).toBe(2000);
  });
});

describe("buildDmMetadataUpsertPatch", () => {
  it("returns null when rows produce no changes", () => {
    expect(buildDmMetadataUpsertPatch([], CURRENT_USER_ID, new Map(), displayContext())).toBeNull();
  });

  it("upserts metadata rows and computes unread delta", () => {
    const patch = buildDmMetadataUpsertPatch(
      [{ userIds: [10, 20], unreadCount: 4 }],
      CURRENT_USER_ID,
      new Map(),
      displayContext(),
    );
    expect(patch?.changed).toBe(true);
    expect(patch?.sidebarDmsUnreadDelta).toBe(4);
    expect(patch?.dmsMap.get("10,20")?.unreadCount).toBe(4);
  });
});

describe("buildDmMetadataRowsFromDmsMap", () => {
  it("maps existing DM entries back to metadata rows", () => {
    const entry = buildDmMetadataEntry(
      { userIds: [10, 20], unreadCount: 2, lastActivityTs: 900, lastMessageId: 42 },
      CURRENT_USER_ID,
      undefined,
      displayContext(),
    )!.entry;
    const rows = buildDmMetadataRowsFromDmsMap(new Map([["10,20", entry]]));
    expect(rows).toEqual([
      {
        userIds: [10, 20],
        lastActivityTs: 900,
        lastMessageId: 42,
        unreadCount: 2,
      },
    ]);
  });
});

describe("buildSetFromMessagesBootstrapState", () => {
  it("builds sidebar maps, location index, and clears bootstrap error", () => {
    const state = buildSetFromMessagesBootstrapState(
      [streamMsg({ id: 1 }), dmMsg({ id: 2 })],
      CURRENT_USER_ID,
      new Map(),
      new Map(),
    );
    expect(state.sidebarDataHydrated).toBe(true);
    expect(state.bootstrapError).toBeNull();
    expect(state.streamsMap.size).toBe(1);
    expect(state.dmsMap.size).toBe(1);
    expect(state.messageIdToLocation.size).toBe(2);
    expect(state.lastAppliedMessages).toHaveLength(2);
  });
});

describe("buildChatListHydrateFromSnapshotState", () => {
  beforeEach(() => {
    // no store setup needed
  });

  it("deserializes snapshot maps and marks hydrated when non-empty", () => {
    const streamEntry: StreamEntryInternal = {
      stream_id: 5,
      name: "general",
      lastMessage: "hi",
      time: "1m",
      ts: 1000,
      topics: new Map([
        [
          "topic1",
          {
            subject: "topic1",
            lastMessage: "hi",
            time: "1m",
            ts: 1000,
            unreadCount: 0,
          },
        ],
      ]),
    };
    const snapshot: ChatListSnapshotSerialized = {
      version: 1,
      currentUserId: 10,
      lastMessageId: 99,
      oldestMessageId: 1,
      streamsEntries: [[5, serializeStreamEntry(streamEntry)]],
      dmsEntries: [],
      messageIdToLocationEntries: [[1, { type: "stream", stream_id: 5, topic: "topic1" }]],
      updatedAt: Date.now(),
    };
    const state = buildChatListHydrateFromSnapshotState(snapshot, null);
    expect(state.sidebarDataHydrated).toBe(true);
    expect(state.streamMetadataHydrated).toBe(false);
    expect(state.streamsMap.get(5)?.name).toBe("general");
    expect(state.messageIdToLocation.get(1)).toEqual({
      type: "stream",
      stream_id: 5,
      topic: "topic1",
    });
    expect(state.currentUserId).toBe(10);
    expect(state.lastAppliedMessages).toBeNull();
  });

  it("leaves sidebarDataHydrated false for empty snapshot maps", () => {
    const snapshot: ChatListSnapshotSerialized = {
      version: 1,
      currentUserId: null,
      lastMessageId: null,
      oldestMessageId: null,
      streamsEntries: [],
      dmsEntries: [],
      messageIdToLocationEntries: [],
      updatedAt: Date.now(),
    };
    const state = buildChatListHydrateFromSnapshotState(snapshot, 10);
    expect(state.sidebarDataHydrated).toBe(false);
    expect(state.currentUserId).toBe(10);
  });
});
