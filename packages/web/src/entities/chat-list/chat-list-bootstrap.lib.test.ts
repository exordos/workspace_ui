import { beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import type { ChatListSnapshotSerialized } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { serializeStreamEntry } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { testMessageId } from "~/test/factories";
import {
  buildChatListHydrateFromSnapshotState,
  buildDmMetadataEntry,
  buildDmMetadataRowsFromDmsMap,
  buildDmMetadataUpsertPatch,
  buildMessageIdToLocation,
  buildSetFromMessagesBootstrapState,
  clearBootstrapErrorPatch,
  mergeBootstrapStreamsWithPreviousMetadata,
  mergeCachedStreamPreviewsIntoAuthoritativeMetadata,
  mergeStreamAccessMetadata,
  normalizeDmUserIds,
  type ChatListDmBootstrapDisplayContext,
} from "./chat-list-bootstrap.lib";

const CURRENT_USER_ID = 10;
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const MESSAGE_ID_1 = testMessageId(1);
const MESSAGE_ID_2 = testMessageId(2);
const MESSAGE_ID_200 = testMessageId(200);

type WorkspaceRawMessageOverrides = Partial<Omit<WorkspaceRawMessage, "id">> & {
  id?: WorkspaceRawMessage["id"] | number;
};

function streamMsg(overrides: WorkspaceRawMessageOverrides = {}): WorkspaceRawMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 1),
    sender_id: CURRENT_USER_ID,
    sender_full_name: "Sender",
    content: "hello",
    timestamp: 1000,
    type: "stream",
    stream_uuid: STREAM_UUID,
    display_recipient: "general",
    subject: "topic1",
    flags: [],
    ...rest,
  };
}

function dmMsg(overrides: WorkspaceRawMessageOverrides = {}): WorkspaceRawMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 50),
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
    ...rest,
  };
}

function displayContext(
  overrides: Partial<ChatListDmBootstrapDisplayContext> = {},
): ChatListDmBootstrapDisplayContext {
  return {
    getParticipantDisplayName: (userId) => (userId === 20 ? "Bob" : `User ${userId}`),
    getAvatarUrl: () => undefined,
    dmFallbackLabel: "Direct message",
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
      [
        streamMsg({
          id: "00000000-0000-4000-8000-000000000100",
          stream_uuid: OTHER_STREAM_UUID,
          subject: "Topic A",
        }),
      ],
      CURRENT_USER_ID,
    );
    expect(map.get("00000000-0000-4000-8000-000000000100")).toEqual({
      type: "stream",
      streamUuid: OTHER_STREAM_UUID,
      topic: "Topic A",
    });
  });

  it("indexes DM messages by conversation key", () => {
    const map = buildMessageIdToLocation([dmMsg({ id: 200 })], CURRENT_USER_ID);
    expect(map.get(MESSAGE_ID_200)).toEqual({ type: "dm", dmKey: "10,20" });
  });
});

describe("mergeStreamAccessMetadata", () => {
  it("preserves access metadata from existing stream entry", () => {
    const existing: StreamEntryInternal = {
      streamUuid: STREAM_UUID,
      name: "general",
      lastMessage: "old",
      time: "1m",
      ts: 100,
      inviteOnly: true,
      topics: new Map(),
    };
    const incoming: StreamEntryInternal = {
      streamUuid: STREAM_UUID,
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

  it("preserves completed topic metadata during a full message rebuild", () => {
    const existing: StreamEntryInternal = {
      streamUuid: STREAM_UUID,
      name: "general",
      lastMessage: "",
      time: "",
      ts: 100,
      topics: new Map([
        [
          "completed",
          {
            subject: "completed",
            lastMessage: "",
            time: "",
            ts: 100,
            unreadCount: 0,
            color: 0x123456,
            isDone: true,
          },
        ],
      ]),
    };
    const incoming: StreamEntryInternal = {
      streamUuid: STREAM_UUID,
      name: "general",
      lastMessage: "new",
      time: "now",
      ts: 200,
      topics: new Map([
        [
          "completed",
          {
            subject: "completed",
            lastMessage: "new",
            time: "now",
            ts: 200,
            unreadCount: 0,
          },
        ],
      ]),
    };

    const merged = mergeStreamAccessMetadata(incoming, existing);

    // Full message bootstrap must retain authoritative completion state from stream_topics.
    expect(merged.topics.get("completed")?.isDone).toBe(true);
  });

  it("keeps an explicit reopened topic state during a full rebuild", () => {
    const existing: StreamEntryInternal = {
      streamUuid: STREAM_UUID,
      name: "general",
      lastMessage: "",
      time: "",
      ts: 100,
      topics: new Map([
        [
          "reopened",
          {
            subject: "reopened",
            lastMessage: "",
            time: "",
            ts: 100,
            unreadCount: 0,
            isDone: true,
          },
        ],
      ]),
    };
    const incoming: StreamEntryInternal = {
      streamUuid: STREAM_UUID,
      name: "general",
      lastMessage: "new",
      time: "now",
      ts: 200,
      topics: new Map([
        [
          "reopened",
          {
            subject: "reopened",
            lastMessage: "new",
            time: "now",
            ts: 200,
            unreadCount: 0,
            isDone: false,
          },
        ],
      ]),
    };

    const merged = mergeStreamAccessMetadata(incoming, existing);

    expect(merged.topics.get("reopened")?.isDone).toBe(false);
  });
});

describe("mergeBootstrapStreamsWithPreviousMetadata", () => {
  it("merges access metadata for every stream in the rebuilt map", () => {
    const previous = new Map<string, StreamEntryInternal>([
      [
        STREAM_UUID,
        {
          streamUuid: STREAM_UUID,
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
      [streamMsg({ stream_uuid: STREAM_UUID })],
      CURRENT_USER_ID,
      new Map(),
      new Map(),
    ).streamsMap;
    const merged = mergeBootstrapStreamsWithPreviousMetadata(rebuilt, previous);
    expect(merged.get(STREAM_UUID)?.isArchived).toBe(true);
  });
});

describe("mergeCachedStreamPreviewsIntoAuthoritativeMetadata", () => {
  it("keeps the authoritative entity set and restores cached previews by topic uuid", () => {
    const topicUuid = "33333333-3333-4333-8333-333333333333";
    const cached = new Map<string, StreamEntryInternal>([
      [
        STREAM_UUID,
        {
          streamUuid: STREAM_UUID,
          name: "stale stream name",
          lastMessage: "cached stream preview",
          lastMessageSenderName: "Alice",
          time: "1m",
          ts: 100,
          unreadCount: 99,
          topics: new Map([
            [
              "old topic name",
              {
                topicUuid,
                subject: "old topic name",
                lastMessage: "cached topic preview",
                lastMessageSenderName: "Bob",
                time: "2m",
                ts: 90,
                unreadCount: 99,
                lastMessageId: MESSAGE_ID_1,
              },
            ],
          ]),
        },
      ],
      [
        OTHER_STREAM_UUID,
        {
          streamUuid: OTHER_STREAM_UUID,
          name: "stale subscription",
          lastMessage: "must disappear",
          time: "3m",
          ts: 80,
          topics: new Map(),
        },
      ],
    ]);
    const authoritative = new Map<string, StreamEntryInternal>([
      [
        STREAM_UUID,
        {
          streamUuid: STREAM_UUID,
          name: "engineering",
          lastMessage: "",
          time: "",
          ts: 0,
          unreadCount: 3,
          topics: new Map([
            [
              "General",
              {
                topicUuid,
                subject: "General",
                lastMessage: "",
                time: "",
                ts: 0,
                unreadCount: 2,
                color: 0x123456,
              },
            ],
          ]),
        },
      ],
    ]);

    const merged = mergeCachedStreamPreviewsIntoAuthoritativeMetadata(cached, authoritative);

    expect(Array.from(merged.keys())).toEqual([STREAM_UUID]);
    expect(merged.get(STREAM_UUID)).toEqual(
      expect.objectContaining({
        name: "engineering",
        lastMessage: "cached stream preview",
        unreadCount: 3,
      }),
    );
    expect(merged.get(STREAM_UUID)?.topics.has("old topic name")).toBe(false);
    expect(merged.get(STREAM_UUID)?.topics.get("General")).toEqual(
      expect.objectContaining({
        subject: "General",
        lastMessage: "cached topic preview",
        unreadCount: 2,
        color: 0x123456,
        lastMessageId: MESSAGE_ID_1,
      }),
    );
  });

  it("does not replace newer in-memory previews with an older snapshot", () => {
    const cached = new Map<string, StreamEntryInternal>([
      [
        STREAM_UUID,
        {
          streamUuid: STREAM_UUID,
          name: "engineering",
          lastMessage: "old cached preview",
          time: "2m",
          ts: 100,
          topics: new Map([
            [
              "General",
              {
                subject: "General",
                lastMessage: "old cached topic preview",
                time: "2m",
                ts: 100,
                unreadCount: 0,
              },
            ],
          ]),
        },
      ],
    ]);
    const authoritative = new Map<string, StreamEntryInternal>([
      [
        STREAM_UUID,
        {
          streamUuid: STREAM_UUID,
          name: "engineering",
          lastMessage: "new realtime preview",
          time: "now",
          ts: 200,
          topics: new Map([
            [
              "General",
              {
                subject: "General",
                lastMessage: "new realtime topic preview",
                time: "now",
                ts: 200,
                unreadCount: 0,
              },
            ],
          ]),
        },
      ],
    ]);

    const merged = mergeCachedStreamPreviewsIntoAuthoritativeMetadata(cached, authoritative);

    expect(merged.get(STREAM_UUID)?.lastMessage).toBe("new realtime preview");
    expect(merged.get(STREAM_UUID)?.topics.get("General")?.lastMessage).toBe(
      "new realtime topic preview",
    );
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
    expect(result?.entry.id).toBe(20);
    expect(result?.entry.unreadCount).toBe(2);
  });

  it("returns null when metadata row has too many known peers", () => {
    const result = buildDmMetadataEntry(
      { userIds: [10, 20, 30], unreadCount: 0 },
      CURRENT_USER_ID,
      undefined,
      displayContext({
        getParticipantDisplayName: (id) => `Name${id}`,
      }),
    );
    expect(result).toBeNull();
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

  it("upserts metadata rows with server unread count", () => {
    const patch = buildDmMetadataUpsertPatch(
      [{ userIds: [10, 20], unreadCount: 4 }],
      CURRENT_USER_ID,
      new Map(),
      displayContext(),
    );
    expect(patch?.changed).toBe(true);
    expect(patch?.dmsMap.get("10,20")?.unreadCount).toBe(4);
  });
});

describe("buildDmMetadataRowsFromDmsMap", () => {
  it("maps existing DM entries back to metadata rows", () => {
    const entry = buildDmMetadataEntry(
      {
        userIds: [10, 20],
        unreadCount: 2,
        lastActivityTs: 900,
        lastMessageId: "00000000-0000-4000-8000-000000000042",
      },
      CURRENT_USER_ID,
      undefined,
      displayContext(),
    )!.entry;
    const rows = buildDmMetadataRowsFromDmsMap(new Map([["10,20", entry]]));
    expect(rows).toEqual([
      {
        userIds: [10, 20],
        lastActivityTs: 900,
        lastMessageId: "00000000-0000-4000-8000-000000000042",
        name: "Bob",
        unreadCount: 2,
      },
    ]);
  });
});

describe("buildSetFromMessagesBootstrapState", () => {
  it("builds sidebar maps, location index, and clears bootstrap error", () => {
    const state = buildSetFromMessagesBootstrapState(
      [streamMsg({ id: MESSAGE_ID_1 }), dmMsg({ id: MESSAGE_ID_2 })],
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
      streamUuid: STREAM_UUID,
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
      lastMessageId: "00000000-0000-4000-8000-000000000099",
      oldestMessageId: "00000000-0000-4000-8000-000000000001",
      streamsEntries: [[STREAM_UUID, serializeStreamEntry(streamEntry)]],
      dmsEntries: [],
      messageIdToLocationEntries: [
        [
          "00000000-0000-4000-8000-000000000001",
          { type: "stream", streamUuid: STREAM_UUID, topic: "topic1" },
        ],
      ],
      updatedAt: Date.now(),
    };
    const state = buildChatListHydrateFromSnapshotState(snapshot, null);
    expect(state.sidebarDataHydrated).toBe(true);
    expect(state.streamMetadataHydrated).toBe(false);
    expect(state.streamsMap.get(STREAM_UUID)?.name).toBe("general");
    expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000001")).toEqual({
      type: "stream",
      streamUuid: STREAM_UUID,
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
