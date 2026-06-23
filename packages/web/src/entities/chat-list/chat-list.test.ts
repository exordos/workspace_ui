// Tests for chat-list store: sidebar building, unread logic, and server reconcile.
/**
 * Tests for chatListStore — the central store that manages sidebar chat entries.
 *
 * This store converts raw messenger messages into structured stream and DM entries,
 * tracks unread counts via badge, maintains a messageId→location index for O(1)
 * lookups, and keeps entries sorted by most-recent-message timestamp.
 * Correctness here is critical because the sidebar is the primary navigation surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { fetchMessagesWithNarrow, rawMessageToMockMessage } from "~/shared/api/messenger-messages";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import type { ChatListSnapshotSerialized } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { sortChatsByLastMessage } from "~/shared/lib/chat-sorting";
import { testMessageId } from "~/test/factories";
import { useUsersStore } from "../user/user.model";
import { buildChatListSnapshotSerialized } from "./chat-list-snapshot.lib";
import { getStreamTopicMessageIds } from "./chat-list-stream-topic-index.lib";
import { useChatListStore } from "./chat-list.model";

vi.mock("~/shared/api/messenger-messages", async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & {
      fetchMessagesWithNarrow: typeof fetchMessagesWithNarrow;
    }
  >();
  return {
    ...actual,
    fetchMessagesWithNarrow: vi.fn(actual.fetchMessagesWithNarrow),
  };
});

const fetchMessagesWithNarrowMock = vi.mocked(fetchMessagesWithNarrow);

function streamUuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function topicShell(streamId: number, topicUuid: number, name: string, isDefault = false) {
  return {
    topicUuid: streamUuid(topicUuid),
    streamUuid: streamUuid(streamId),
    name,
    isDefault,
  };
}

function deferred<T>() {
  let resolveFn!: (value: T) => void;
  let rejectFn!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

async function flushMicrotasks(turns = 3): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

function resetStores() {
  useChatListStore.getState().clear();
  useUsersStore.getState().clear();
}

type WorkspaceRawMessageOverrides = Partial<Omit<WorkspaceRawMessage, "id">> & {
  id?: WorkspaceRawMessage["id"] | number;
};

function streamMsg(overrides: WorkspaceRawMessageOverrides = {}): WorkspaceRawMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 1),
    sender_id: 10,
    sender_full_name: "Sender",
    content: "hello",
    timestamp: 1000,
    type: "stream",
    stream_uuid: "00000000-0000-4000-8000-000000000005",
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
    sender_id: 10,
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

/** Unread badge counts when currentUserId is 10 — use for messages that should count as unread. */
const OTHER_SENDER_ID = 20;

// Verifies all store actions: building entries from messages, live updates,
// unread tracking, deletion handling, and sort order.
describe("chatListStore", () => {
  beforeEach(() => {
    resetStores();
    fetchMessagesWithNarrowMock.mockClear();
  });
  afterEach(resetStores);

  describe("patchPersonalDmRowLabelsForUser", () => {
    it("rewrites stale generic DM title after user profile exists in users store", () => {
      setLocale("en");
      useChatListStore.getState().setFromMessages([dmMsg()], 10);
      const dmKey = [...useChatListStore.getState().dmsMap.keys()][0]!;
      useChatListStore.setState((s) => {
        const next = new Map(s.dmsMap);
        const entry = next.get(dmKey);
        if (!entry) return s;
        next.set(dmKey, { ...entry, name: "Direct message" });
        return { dmsMap: next };
      });
      useUsersStore.getState().mergeUser({
        user_id: 20,
        full_name: "Bob Loaded",
        email: "bob@t.com",
      });
      useChatListStore.getState().patchPersonalDmRowLabelsForUser(20);
      expect(useChatListStore.getState().dmsMap.get(dmKey)?.name).toBe("Bob Loaded");
    });
  });

  describe("syncDerivedScalars", () => {
    it("rebuilds stream topic index after raw setState bypasses patchSet", () => {
      useChatListStore.getState().setFromMessages([], 10);
      useChatListStore.setState({
        messageIdToLocation: new Map([
          [
            "00000000-0000-4000-8000-000000000001",
            { type: "stream", streamUuid: "00000000-0000-4000-8000-000000000005", topic: "topic1" },
          ],
          [
            "00000000-0000-4000-8000-000000000002",
            { type: "stream", streamUuid: "00000000-0000-4000-8000-000000000005", topic: "topic1" },
          ],
        ]),
        streamTopicMessageIds: new Map(),
      });
      expect(
        getStreamTopicMessageIds(
          useChatListStore.getState().streamTopicMessageIds,
          streamUuid(5),
          "topic1",
        ),
      ).toEqual([]);
      useChatListStore.getState().syncDerivedScalars();
      expect(
        getStreamTopicMessageIds(
          useChatListStore.getState().streamTopicMessageIds,
          streamUuid(5),
          "topic1",
        ),
      ).toEqual([testMessageId(1), testMessageId(2)]);
    });
  });

  // Ensures clear() wipes all derived data so instance switching starts clean.
  describe("clear", () => {
    // Every field must reset — leftover state causes ghost entries in the sidebar.
    it("resets store to initial state", () => {
      useChatListStore.getState().setFromMessages([streamMsg()], 10);
      useChatListStore.getState().clear();

      const state = useChatListStore.getState();
      expect(state.streamsMap.size).toBe(0);
      expect(state.dmsMap.size).toBe(0);
      expect(state.sidebarDataHydrated).toBe(false);
      expect(state.streamMetadataHydrated).toBe(false);
      expect(state.currentUserId).toBeNull();
      expect(state.lastAppliedMessages).toBeNull();
      expect(state.messageIdToLocation.size).toBe(0);
    });
  });

  describe("sidebarDataHydrated", () => {
    it("stays false after hydrateFromIndexedDbSnapshot until setFromMessages", () => {
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
      expect(useChatListStore.getState().sidebarDataHydrated).toBe(false);
      useChatListStore.getState().hydrateFromIndexedDbSnapshot(snapshot);
      expect(useChatListStore.getState().sidebarDataHydrated).toBe(false);
      useChatListStore.getState().setFromMessages([], null);
      expect(useChatListStore.getState().sidebarDataHydrated).toBe(true);
      useChatListStore.getState().clear();
      expect(useChatListStore.getState().sidebarDataHydrated).toBe(false);
    });

    it("becomes true after setFromMessages", () => {
      expect(useChatListStore.getState().sidebarDataHydrated).toBe(false);
      useChatListStore.getState().setFromMessages([streamMsg()], 10);
      expect(useChatListStore.getState().sidebarDataHydrated).toBe(true);
    });

    it("becomes true on hydrate when snapshot already contains streams or DMs", () => {
      useChatListStore.getState().setFromMessages([streamMsg()], 10);
      const snapshot = buildChatListSnapshotSerialized(useChatListStore.getState());
      useChatListStore.getState().clear();
      expect(useChatListStore.getState().sidebarDataHydrated).toBe(false);
      useChatListStore.getState().hydrateFromIndexedDbSnapshot(snapshot);
      expect(useChatListStore.getState().sidebarDataHydrated).toBe(true);
    });
  });

  describe("streamMetadataHydrated", () => {
    it("starts false, can be set from authoritative metadata, and resets on clear", () => {
      expect(useChatListStore.getState().streamMetadataHydrated).toBe(false);
      useChatListStore.getState().setStreamMetadataHydrated(true);
      expect(useChatListStore.getState().streamMetadataHydrated).toBe(true);
      useChatListStore.getState().clear();
      expect(useChatListStore.getState().streamMetadataHydrated).toBe(false);
    });

    it("stays false after IndexedDB hydrate until authoritative metadata arrives", () => {
      useChatListStore.getState().setFromMessages([streamMsg()], 10);
      const snapshot = buildChatListSnapshotSerialized(useChatListStore.getState());
      useChatListStore.getState().clear();

      useChatListStore.getState().hydrateFromIndexedDbSnapshot(snapshot);
      expect(useChatListStore.getState().streamMetadataHydrated).toBe(false);
    });
  });

  // setFromMessages is the initial hydration path — called once after fetching message history.
  describe("setFromMessages", () => {
    // Stream messages must be grouped by stream_id with topics nested inside.
    it("builds stream entries from stream messages", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "topic1",
            timestamp: 1000,
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "topic2",
            timestamp: 2000,
          }),
        ],
        10,
      );

      const streams = useChatListStore.getState().streams();
      expect(streams).toHaveLength(1);
      expect(streams[0]!.streamUuid).toBe(streamUuid(5));
      expect(streams[0]!.topics).toBeDefined();
      expect(streams[0]!.topics!.length).toBe(2);
    });

    it("maps stream and topic last message sender names", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "topic1",
            timestamp: 1000,
            sender_full_name: "Alice",
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "topic2",
            timestamp: 2000,
            sender_full_name: "Bob",
          }),
        ],
        10,
      );

      const stream = useChatListStore.getState().streams()[0]!;
      expect(stream.lastMessageSenderName).toBe("Bob");
      const topic1 = stream.topics?.find((topic) => topic.subject === "topic1");
      const topic2 = stream.topics?.find((topic) => topic.subject === "topic2");
      expect(topic1?.lastMessageSenderName).toBe("Alice");
      expect(topic2?.lastMessageSenderName).toBe("Bob");
    });

    // Private messages must produce DM entries with type "dm".
    it("builds DM entries from private messages", () => {
      useChatListStore.getState().setFromMessages([dmMsg()], 10);

      const dms = useChatListStore.getState().dms();
      expect(dms).toHaveLength(1);
      expect(dms[0]!.type).toBe("dm");
    });

    // currentUserId is needed later to distinguish "own" messages in DMs.
    it("stores currentUserId", () => {
      useChatListStore.getState().setFromMessages([], 42);

      expect(useChatListStore.getState().currentUserId).toBe(42);
    });

    // Caching avoids re-processing the same message array on userId arrival.
    it("caches messages as lastAppliedMessages", () => {
      const msgs = [streamMsg()];
      useChatListStore.getState().setFromMessages(msgs, 10);

      expect(useChatListStore.getState().lastAppliedMessages).toBe(msgs);
    });

    // The location index enables O(1) unread-decrement without scanning all streams.
    it("builds messageIdToLocation index for stream messages", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000100",
            stream_uuid: "00000000-0000-4000-8000-000000000007",
            subject: "topicA",
          }),
        ],
        10,
      );

      const loc = useChatListStore
        .getState()
        .messageIdToLocation.get("00000000-0000-4000-8000-000000000100");
      expect(loc).toBeDefined();
      expect(loc!.type).toBe("stream");
      if (loc!.type === "stream") {
        expect(loc!.streamUuid).toBe(streamUuid(7));
        expect(loc!.topic).toBe("topicA");
      }
    });

    // DM messages also need location tracking for badge decrement.
    it("builds messageIdToLocation index for DM messages", () => {
      useChatListStore.getState().setFromMessages([dmMsg({ id: 200 })], 10);

      const loc = useChatListStore
        .getState()
        .messageIdToLocation.get("00000000-0000-4000-8000-000000000200");
      expect(loc).toBeDefined();
      expect(loc!.type).toBe("dm");
    });

    // Messages from different streams must not be merged into one entry.
    it("separates multiple streams by stream UUID", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            display_recipient: "stream-a",
            timestamp: 1000,
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000008",
            display_recipient: "stream-b",
            timestamp: 2000,
          }),
        ],
        10,
      );

      const streams = useChatListStore.getState().streams();
      expect(streams).toHaveLength(2);
      const ids = streams.map((s) => s.streamUuid).sort();
      expect(ids).toEqual([streamUuid(5), streamUuid(8)]);
    });

    // New backend unread_count is authoritative; message flags only hydrate previews/locations.
    it("does not derive unread badges from message flags", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            flags: [],
            sender_id: OTHER_SENDER_ID,
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            flags: ["read"],
            sender_id: OTHER_SENDER_ID,
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000003",
            flags: [],
            sender_id: OTHER_SENDER_ID,
          }),
        ],
        10,
      );

      const streams = useChatListStore.getState().streams();
      expect(streams[0]!.badge).toBeUndefined();
      expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    });
  });

  // addMessage handles live events — new messages arriving via long-polling.
  describe("addMessage (stream)", () => {
    // A message for an unknown stream must create a brand-new sidebar entry.
    it("creates a new stream entry for a stream message", () => {
      useChatListStore.getState().addMessage(
        streamMsg({
          id: "00000000-0000-4000-8000-000000000010",
          stream_uuid: "00000000-0000-4000-8000-000000000099",
          display_recipient: "new-stream",
          subject: "intro",
          timestamp: 5000,
        }),
      );

      const streams = useChatListStore.getState().streams();
      expect(streams.some((s) => s.streamUuid === streamUuid(99))).toBe(true);
    });

    // Existing entries must update their last message preview on new activity.
    it("updates an existing stream entry with a newer message", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "t",
            timestamp: 1000,
            content: "old",
          }),
        ],
        10,
      );

      useChatListStore.getState().addMessage(
        streamMsg({
          id: "00000000-0000-4000-8000-000000000002",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "t",
          timestamp: 2000,
          content: "new",
        }),
      );

      const streams = useChatListStore.getState().streams();
      const stream = streams.find((s) => s.streamUuid === streamUuid(5))!;
      expect(stream.topics![0]!.lastMessage).toContain("new");
    });

    // Live message payloads update previews; unread totals come from server metadata/read state.
    it("does not increment unread count for unread stream messages", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [streamMsg({ id: "00000000-0000-4000-8000-000000000001", flags: ["read"] })],
          10,
        );

      useChatListStore.getState().addMessage(
        streamMsg({
          id: "00000000-0000-4000-8000-000000000002",
          flags: [],
          timestamp: 3000,
          sender_id: OTHER_SENDER_ID,
        }),
      );

      const streams = useChatListStore.getState().streams();
      expect(streams[0]!.badge).toBeUndefined();
      expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    });

    it("does not increment unread count for own stream messages", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [streamMsg({ id: "00000000-0000-4000-8000-000000000001", flags: ["read"] })],
          10,
        );

      useChatListStore.getState().addMessage(
        streamMsg({
          id: "00000000-0000-4000-8000-000000000002",
          flags: [],
          timestamp: 3000,
          sender_id: 10,
        }),
      );

      const streams = useChatListStore.getState().streams();
      expect(streams[0]!.badge).toBeUndefined();
    });

    // Location index must be updated for every new message so decrements work later.
    it("updates messageIdToLocation for newly added stream message", () => {
      useChatListStore.getState().addMessage(
        streamMsg({
          id: "00000000-0000-4000-8000-000000000077",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "topicX",
          timestamp: 3000,
        }),
      );

      const loc = useChatListStore
        .getState()
        .messageIdToLocation.get("00000000-0000-4000-8000-000000000077");
      expect(loc).toBeDefined();
      expect(loc!.type).toBe("stream");
    });
  });

  // DM variant of addMessage — private messages create/update DM sidebar entries.
  describe("addMessage (DM)", () => {
    // A new private message from an unknown conversation must appear in sidebar.
    it("creates a new DM entry for a private message", () => {
      useChatListStore.setState({ currentUserId: 10 });

      useChatListStore.getState().addMessage(dmMsg({ id: 60, timestamp: 3000 }));

      const dms = useChatListStore.getState().dms();
      expect(dms.length).toBeGreaterThanOrEqual(1);
    });

    // Multiple unread DMs must accumulate badges, not overwrite.
    it("does not increment unread count for unread DM messages", () => {
      useChatListStore.setState({ currentUserId: 10 });

      useChatListStore.getState().addMessage(
        dmMsg({
          id: "00000000-0000-4000-8000-000000000060",
          flags: [],
          timestamp: 3000,
          sender_id: OTHER_SENDER_ID,
        }),
      );
      useChatListStore.getState().addMessage(
        dmMsg({
          id: "00000000-0000-4000-8000-000000000061",
          flags: [],
          timestamp: 4000,
          sender_id: OTHER_SENDER_ID,
        }),
      );

      const dms = useChatListStore.getState().dms();
      const dm = dms.find((d) => d.type === "dm");
      expect(dm?.badge).toBeUndefined();
      expect(useChatListStore.getState().sidebarDmsUnread).toBe(0);
    });

    it("does not increment unread count for own DM messages", () => {
      useChatListStore.setState({ currentUserId: 10 });

      useChatListStore
        .getState()
        .setFromMessages(
          [dmMsg({ id: "00000000-0000-4000-8000-000000000059", flags: ["read"], timestamp: 1000 })],
          10,
        );
      useChatListStore.getState().addMessage(
        dmMsg({
          id: "00000000-0000-4000-8000-000000000060",
          flags: [],
          timestamp: 3000,
          sender_id: 10,
        }),
      );

      const dms = useChatListStore.getState().dms();
      const dm = dms.find((d) => d.type === "dm");
      expect(dm?.badge).toBeUndefined();
    });

    // DM messages also need location tracking for unread decrement.
    it("updates messageIdToLocation for DM messages", () => {
      useChatListStore.setState({ currentUserId: 10 });

      useChatListStore.getState().addMessage(dmMsg({ id: 88, timestamp: 5000 }));

      const loc = useChatListStore
        .getState()
        .messageIdToLocation.get("00000000-0000-4000-8000-000000000088");
      expect(loc).toBeDefined();
      expect(loc!.type).toBe("dm");
    });

    it("indexes stale-timestamp unread DM without deriving unread count", () => {
      useChatListStore.setState({ currentUserId: 10 });
      const dmKey = "10,20";

      useChatListStore.getState().addMessage(
        dmMsg({
          id: "00000000-0000-4000-8000-000000003083",
          flags: [],
          timestamp: 3000,
          sender_id: OTHER_SENDER_ID,
        }),
      );
      useChatListStore.getState().addMessage(
        dmMsg({
          id: "00000000-0000-4000-8000-000000003082",
          flags: [],
          timestamp: 2000,
          sender_id: OTHER_SENDER_ID,
        }),
      );

      expect(useChatListStore.getState().dmsMap.get(dmKey)?.unreadCount).toBe(0);
      expect(
        useChatListStore.getState().messageIdToLocation.has("00000000-0000-4000-8000-000000003082"),
      ).toBe(true);
    });
  });

  describe("addMessages (batch)", () => {
    beforeEach(() => {
      useChatListStore.setState({ currentUserId: 10 });
    });

    it("indexes every message and aggregates unread per topic in one batch", () => {
      useChatListStore.getState().addMessages([
        streamMsg({
          id: "00000000-0000-4000-8000-000000000010",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "alpha",
          timestamp: 1000,
          flags: [],
          sender_id: OTHER_SENDER_ID,
        }),
        streamMsg({
          id: "00000000-0000-4000-8000-000000000011",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "beta",
          timestamp: 2000,
          flags: [],
          sender_id: OTHER_SENDER_ID,
        }),
        streamMsg({
          id: "00000000-0000-4000-8000-000000000012",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "alpha",
          timestamp: 3000,
          flags: [],
          sender_id: OTHER_SENDER_ID,
        }),
        streamMsg({
          id: "00000000-0000-4000-8000-000000000013",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "alpha",
          timestamp: 4000,
          flags: [],
          sender_id: OTHER_SENDER_ID,
        }),
      ]);

      const state = useChatListStore.getState();
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000010")?.type).toBe(
        "stream",
      );
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000011")?.type).toBe(
        "stream",
      );
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000012")?.type).toBe(
        "stream",
      );
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000013")?.type).toBe(
        "stream",
      );

      const stream = state.streamsMap.get(streamUuid(5));
      expect(stream?.topics.get("alpha")?.unreadCount).toBe(0);
      expect(stream?.topics.get("beta")?.unreadCount).toBe(0);
      expect(stream?.topics.get("alpha")?.lastMessage).toContain("hello");
      expect(stream?.topics.get("beta")?.ts).toBe(2000);
    });

    it("indexes each unread message id added in the same batch", () => {
      useChatListStore.getState().addMessages([
        streamMsg({
          id: "00000000-0000-4000-8000-000000000020",
          flags: [],
          sender_id: OTHER_SENDER_ID,
          timestamp: 1000,
        }),
        streamMsg({
          id: "00000000-0000-4000-8000-000000000021",
          flags: [],
          sender_id: OTHER_SENDER_ID,
          timestamp: 2000,
        }),
        streamMsg({
          id: "00000000-0000-4000-8000-000000000022",
          flags: [],
          sender_id: OTHER_SENDER_ID,
          timestamp: 3000,
        }),
      ]);

      expect(useChatListStore.getState().streams()[0]!.badge).toBeUndefined();
      expect(
        useChatListStore.getState().messageIdToLocation.has("00000000-0000-4000-8000-000000000020"),
      ).toBe(true);
      expect(
        useChatListStore.getState().messageIdToLocation.has("00000000-0000-4000-8000-000000000021"),
      ).toBe(true);
      expect(
        useChatListStore.getState().messageIdToLocation.has("00000000-0000-4000-8000-000000000022"),
      ).toBe(true);
    });

    it("aggregates DM unread for multiple messages in one batch", () => {
      useChatListStore.getState().addMessages([
        dmMsg({
          id: "00000000-0000-4000-8000-000000000060",
          flags: [],
          timestamp: 3000,
          sender_id: OTHER_SENDER_ID,
        }),
        dmMsg({
          id: "00000000-0000-4000-8000-000000000061",
          flags: [],
          timestamp: 4000,
          sender_id: OTHER_SENDER_ID,
        }),
        dmMsg({
          id: "00000000-0000-4000-8000-000000000062",
          flags: [],
          timestamp: 5000,
          sender_id: OTHER_SENDER_ID,
        }),
      ]);

      const dms = useChatListStore.getState().dms();
      const dm = dms.find((d) => d.type === "dm");
      expect(dm?.badge).toBeUndefined();
    });

    it("does not double-count unread when batch includes already-indexed message ids", () => {
      const msg = streamMsg({
        id: "00000000-0000-4000-8000-000000000050",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: "alpha",
        timestamp: 1000,
        flags: [],
        sender_id: OTHER_SENDER_ID,
      });
      useChatListStore.getState().addMessage(msg);
      expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);

      useChatListStore.getState().addMessages([msg]);
      expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    });

    it("fills empty DM preview from addMessages when metadata ts is newer", () => {
      useUsersStore.getState().mergeUser({ user_id: 10, full_name: "Alice", email: "a@x.test" });
      useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob", email: "b@x.test" });

      useChatListStore.getState().upsertDmMetadataRows([
        {
          userIds: [10, 20],
          unreadCount: 0,
          lastMessageId: "00000000-0000-4000-8000-000000000123",
          lastActivityTs: 1_700_000_000,
        },
      ]);

      useChatListStore.getState().addMessages([
        dmMsg({
          id: "00000000-0000-4000-8000-000000000123",
          content: "preview from message_ids hydrate",
          timestamp: 1_600_000_000,
          sender_id: OTHER_SENDER_ID,
        }),
      ]);

      const dm = useChatListStore.getState().dmsMap.get("10,20");
      expect(dm?.lastMessage).toContain("preview from message_ids hydrate");
      expect(dm?.lastMessageId).toBe(testMessageId(123));
      expect(dm?.ts).toBe(1_700_000_000);
    });

    it("upsertStreamTopicShells preserves the server default topic name", () => {
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([
          { streamUuid: "00000000-0000-4000-8000-000000000005", name: "engineering" },
        ]);
      useChatListStore
        .getState()
        .upsertStreamTopicShells(streamUuid(5), [
          topicShell(5, 501, "General Topic", true),
          topicShell(5, 502, "release"),
        ]);

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(5));
      expect(stream?.topics.has("General Topic")).toBe(true);
      expect(stream?.topics.has("release")).toBe(true);
      expect(stream?.topics.get("General Topic")?.lastMessage).toBe("");
    });

    it("upsertStreamTopicShells renames existing topic shells by topic uuid", () => {
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([
          { streamUuid: "00000000-0000-4000-8000-000000000005", name: "engineering" },
        ]);
      useChatListStore.getState().addMessages([
        streamMsg({
          id: 501,
          topic_uuid: streamUuid(503),
          subject: "",
          content: "preview before topic metadata",
        }),
      ]);

      useChatListStore
        .getState()
        .upsertStreamTopicShells(streamUuid(5), [
          topicShell(5, 503, "General Chat", true),
          topicShell(5, 504, "release"),
        ]);

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(5));
      expect(stream?.topics.has("")).toBe(false);
      expect(stream?.topics.has("General Chat")).toBe(true);
      expect(stream?.topics.get("General Chat")?.lastMessage).toContain(
        "preview before topic metadata",
      );
      expect(stream?.topics.has("release")).toBe(true);
    });

    it("upsertStreamTopicShells stores and clears server topic done state", () => {
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([
          { streamUuid: "00000000-0000-4000-8000-000000000005", name: "engineering" },
        ]);

      useChatListStore
        .getState()
        .upsertStreamTopicShells(streamUuid(5), [
          { ...topicShell(5, 503, "incident"), isDone: true },
        ]);
      expect(
        useChatListStore.getState().streamsMap.get(streamUuid(5))?.topics.get("incident"),
      ).toEqual(expect.objectContaining({ isDone: true }));

      useChatListStore
        .getState()
        .upsertStreamTopicShells(streamUuid(5), [
          { ...topicShell(5, 503, "incident"), isDone: false },
        ]);
      expect(
        useChatListStore.getState().streamsMap.get(streamUuid(5))?.topics.get("incident")?.isDone,
      ).toBeUndefined();
    });

    it("applyStreamSidebarPreviewsFromMessages updates streams only, not DM metadata preview", () => {
      useUsersStore.getState().mergeUser({ user_id: 10, full_name: "Alice", email: "a@x.test" });
      useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob", email: "b@x.test" });

      useChatListStore
        .getState()
        .upsertStreamMetadataRows([
          { streamUuid: "00000000-0000-4000-8000-000000000099", name: "meta-channel" },
        ]);
      useChatListStore.getState().upsertDmMetadataRows([
        {
          userIds: [10, 20],
          unreadCount: 5,
          lastMessageId: "00000000-0000-4000-8000-000000000500",
          lastActivityTs: 1_800_000_000,
        },
      ]);
      useChatListStore.getState().addMessages([
        dmMsg({
          id: "00000000-0000-4000-8000-000000000500",
          content: "dm from register",
          timestamp: 1_600_000_000,
          sender_id: OTHER_SENDER_ID,
          flags: ["read"],
        }),
      ]);

      useChatListStore.getState().applyStreamSidebarPreviewsFromMessages([
        streamMsg({
          id: "00000000-0000-4000-8000-000000001000",
          stream_uuid: "00000000-0000-4000-8000-000000000099",
          subject: "topic-a",
          content: "stream preview body",
          timestamp: 1_750_000_000,
        }),
        dmMsg({
          id: "00000000-0000-4000-8000-000000002000",
          content: "must not replace dm preview",
          timestamp: 1_900_000_000,
          sender_id: OTHER_SENDER_ID,
          flags: ["read"],
        }),
      ]);

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(99));
      expect(stream?.lastMessage).toContain("stream preview body");
      expect(stream?.topics.get("topic-a")?.lastMessage).toContain("stream preview body");

      const dm = useChatListStore.getState().dmsMap.get("10,20");
      expect(dm?.lastMessage).toContain("dm from register");
      expect(dm?.unreadCount).toBe(5);
      expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    });
  });

  // Sort order determines what the user sees at the top of the sidebar.
  describe("streams() sort order", () => {
    // Most-recent-first ensures active conversations are immediately visible.
    it("returns streams sorted by most recent message first", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000001",
            display_recipient: "older",
            timestamp: 1000,
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000002",
            display_recipient: "newer",
            timestamp: 5000,
          }),
        ],
        10,
      );

      const streams = useChatListStore.getState().streams();
      expect(streams[0]!.streamUuid).toBe(streamUuid(2));
      expect(streams[1]!.streamUuid).toBe(streamUuid(1));
    });
  });

  // DMs follow the same most-recent-first order as streams.
  describe("dms() sort order", () => {
    // The newest conversation must appear first in the DM list.
    it("returns DMs sorted by most recent first", () => {
      useChatListStore.getState().setFromMessages(
        [
          dmMsg({
            id: "00000000-0000-4000-8000-000000000050",
            timestamp: 1000,
            display_recipient: [
              { id: 10, full_name: "Me" },
              { id: 20, full_name: "A" },
            ],
          }),
          dmMsg({
            id: "00000000-0000-4000-8000-000000000051",
            timestamp: 5000,
            display_recipient: [
              { id: 10, full_name: "Me" },
              { id: 30, full_name: "B" },
            ],
          }),
        ],
        10,
      );

      const dms = useChatListStore.getState().dms();
      expect(dms).toHaveLength(2);
      expect(dms[0]!.ts).toBeGreaterThanOrEqual(dms[1]!.ts ?? 0);
    });
  });

  // handleDeleteMessages responds to server-side message deletion events.
  describe("handleDeleteMessages", () => {
    // Deleting a known lastMessageId should keep topic row and clear stale preview fields.
    it("keeps topic row and clears preview when deleting topic last message", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "topicA",
            timestamp: 1000,
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "topicB",
            timestamp: 2000,
          }),
        ],
        10,
      );

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000001"]);

      const stream = useChatListStore
        .getState()
        .streams()
        .find((s) => s.streamUuid === streamUuid(5));
      expect(stream).toBeDefined();
      const topicNames = stream!.topics!.map((t) => t.subject);
      expect(topicNames).toContain("topicA");
      expect(topicNames).toContain("topicB");
      expect(
        useChatListStore.getState().streamsMap.get(streamUuid(5))?.topics.get("topicA")
          ?.lastMessageId,
      ).toBe(undefined);
      expect(
        useChatListStore.getState().streamsMap.get(streamUuid(5))?.topics.get("topicA")
          ?.lastMessage,
      ).toBe("");
    });

    it("recomputes stream preview from remaining newest topic after deleting tracked last message id", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "topicA",
            timestamp: 1000,
            sender_full_name: "Alice",
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "topicB",
            timestamp: 2000,
            sender_full_name: "Bob",
          }),
        ],
        10,
      );

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000002"]);

      const stream = useChatListStore
        .getState()
        .streams()
        .find((item) => item.streamUuid === streamUuid(5));
      expect(stream).toBeDefined();
      expect(stream?.lastMessageSenderName).toBe("Alice");
    });

    // Single-topic stream should remain visible after deleting currently tracked lastMessageId.
    it("keeps stream and topic row when its only topic last message is deleted", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "only",
            timestamp: 1000,
          }),
        ],
        10,
      );

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000001"]);

      const stream = useChatListStore
        .getState()
        .streams()
        .find((item) => item.streamUuid === streamUuid(5));
      expect(stream).toBeDefined();
      expect(stream?.topics?.map((topic) => topic.subject)).toEqual(["only"]);
      expect(
        useChatListStore.getState().streamsMap.get(streamUuid(5))?.topics.get("only")
          ?.lastMessageId,
      ).toBe(undefined);
    });

    // DM rows follow the same conservative policy: keep row, clear tracked lastMessageId.
    it("keeps DM row and clears lastMessageId when its last message is deleted", () => {
      useChatListStore.getState().setFromMessages([dmMsg({ id: 50 })], 10);

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000050"]);

      const dms = useChatListStore.getState().dms();
      expect(dms).toHaveLength(1);
      expect(useChatListStore.getState().dmsMap.get("10,20")?.lastMessageId).toBe(undefined);
      expect(useChatListStore.getState().dmsMap.get("10,20")?.lastMessage).toBe("");
    });

    it("uses local replacementMessages to update stream/topic preview without waiting for network", () => {
      const older = streamMsg({
        id: "00000000-0000-4000-8000-000000000001",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: "topicA",
        timestamp: 1000,
        content: "older preview",
        sender_full_name: "Alice",
      });
      const newer = streamMsg({
        id: "00000000-0000-4000-8000-000000000002",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: "topicA",
        timestamp: 2000,
        content: "newer preview",
        sender_full_name: "Bob",
      });
      useChatListStore.getState().setFromMessages([older, newer], 10);

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000002"], {
        replacementMessages: [older, newer],
        resolveMissingPreview: false,
      });

      const topic = useChatListStore.getState().streamsMap.get(streamUuid(5))?.topics.get("topicA");
      expect(topic?.lastMessageId).toBe(testMessageId(1));
      expect(topic?.lastMessage).toContain("older preview");
      expect(topic?.lastMessageSenderName).toBe("Alice");
    });

    it("uses local replacementMessages to update DM preview without waiting for network", () => {
      const older = dmMsg({
        id: "00000000-0000-4000-8000-000000000050",
        timestamp: 1000,
        content: "dm older",
        sender_full_name: "Alice",
      });
      const newer = dmMsg({
        id: "00000000-0000-4000-8000-000000000051",
        timestamp: 2000,
        content: "dm newer",
        sender_full_name: "Bob",
      });
      useChatListStore.getState().setFromMessages([older, newer], 10);

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000051"], {
        replacementMessages: [older, newer],
        resolveMissingPreview: false,
      });

      const dm = useChatListStore.getState().dmsMap.get("10,20");
      expect(dm?.lastMessageId).toBe(testMessageId(50));
      expect(dm?.lastMessage).toContain("dm older");
    });

    it("builds DM fallback narrow without current user id", async () => {
      const older = dmMsg({
        id: 50,
        timestamp: 1000,
        content: "dm older",
      });
      const newer = dmMsg({
        id: 51,
        timestamp: 2000,
        content: "dm newer",
      });
      useChatListStore.getState().setFromMessages([older, newer], 10);
      fetchMessagesWithNarrowMock.mockResolvedValueOnce([rawMessageToMockMessage(older)]);

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000051"]);
      await flushMicrotasks();

      expect(fetchMessagesWithNarrowMock).toHaveBeenCalledTimes(1);
      expect(fetchMessagesWithNarrowMock.mock.calls[0]?.[0]).toEqual([
        { operator: "dm", operand: [20] },
      ]);
      expect(useChatListStore.getState().dmsMap.get("10,20")?.lastMessageId).toBe(
        testMessageId(50),
      );
    });

    it("builds DM fallback narrow from dmKey when currentUserId is null", async () => {
      const older = dmMsg({
        id: 50,
        timestamp: 1000,
        content: "dm older",
      });
      const newer = dmMsg({
        id: 51,
        timestamp: 2000,
        content: "dm newer",
      });
      useChatListStore.getState().setFromMessages([older, newer], 10);
      useChatListStore.getState().setCurrentUserId(null);
      fetchMessagesWithNarrowMock.mockResolvedValueOnce([rawMessageToMockMessage(older)]);

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000051"]);
      await flushMicrotasks();

      expect(fetchMessagesWithNarrowMock).toHaveBeenCalledTimes(1);
      expect(fetchMessagesWithNarrowMock.mock.calls[0]?.[0]).toEqual([
        { operator: "dm", operand: [10, 20] },
      ]);
      expect(useChatListStore.getState().dmsMap.get("10,20")?.lastMessageId).toBe(
        testMessageId(50),
      );
    });

    it("ignores stale async refetch response after clear", async () => {
      const older = dmMsg({
        id: 50,
        timestamp: 1000,
        content: "dm older",
      });
      const newer = dmMsg({
        id: 51,
        timestamp: 2000,
        content: "dm newer",
      });
      useChatListStore.getState().setFromMessages([older, newer], 10);
      const gate = deferred<void>();
      let signal: AbortSignal | undefined;
      fetchMessagesWithNarrowMock.mockImplementationOnce(
        async (_narrow, _anchor, _numBefore, _numAfter, options) => {
          signal = options?.signal;
          await gate.promise;
          if (options?.signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          return [rawMessageToMockMessage(older)];
        },
      );

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000051"]);
      useChatListStore.getState().clear();
      expect(signal?.aborted).toBe(true);

      gate.resolve();
      await flushMicrotasks();

      expect(useChatListStore.getState().dmsMap.size).toBe(0);
    });

    it("aborts pending preview refetch on current user switch and does not patch stale result", async () => {
      const older = dmMsg({
        id: 50,
        timestamp: 1000,
        content: "dm older",
      });
      const newer = dmMsg({
        id: 51,
        timestamp: 2000,
        content: "dm newer",
      });
      useChatListStore.getState().setFromMessages([older, newer], 10);
      const gate = deferred<void>();
      let signal: AbortSignal | undefined;
      fetchMessagesWithNarrowMock.mockImplementationOnce(
        async (_narrow, _anchor, _numBefore, _numAfter, options) => {
          signal = options?.signal;
          await gate.promise;
          if (options?.signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          return [rawMessageToMockMessage(older)];
        },
      );

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000051"]);
      useChatListStore.getState().setCurrentUserId(999);
      expect(signal?.aborted).toBe(true);

      gate.resolve();
      await flushMicrotasks();

      expect(useChatListStore.getState().dmsMap.get("10,20")?.lastMessageId).toBe(undefined);
    });

    it("keeps moved topic row after deleting moved topic lastMessageId", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            subject: "incident",
            timestamp: 1000,
          }),
        ],
        10,
      );
      useChatListStore.getState().moveStreamTopic({
        streamId: "00000000-0000-4000-8000-000000000005",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: ["00000000-0000-4000-8000-000000000001"],
        anchorMessageId: "00000000-0000-4000-8000-000000000001",
      });

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000001"]);

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(5));
      expect(stream?.topics.has("\u2714 incident")).toBe(true);
      expect(stream?.topics.get("\u2714 incident")?.lastMessageId).toBe(undefined);
    });

    // Deleted messages must be purged from the location index to avoid stale lookups.
    it("removes messageId from location index after delete", () => {
      useChatListStore.getState().setFromMessages([streamMsg({ id: 1 })], 10);

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000001"]);

      expect(
        useChatListStore.getState().messageIdToLocation.has("00000000-0000-4000-8000-000000000001"),
      ).toBe(false);
    });

    // Empty array is a valid edge case from the event loop.
    it("handles empty messageIds array", () => {
      useChatListStore.getState().setFromMessages([streamMsg({ id: 1 })], 10);

      useChatListStore.getState().handleDeleteMessages([]);

      expect(useChatListStore.getState().streams()).toHaveLength(1);
    });

    // Stale delete events for already-removed messages must not crash.
    it("is a no-op for message ids not in the index", () => {
      useChatListStore.getState().setFromMessages([streamMsg({ id: 1 })], 10);

      useChatListStore.getState().handleDeleteMessages(["00000000-0000-4000-8000-000000000999"]);

      expect(useChatListStore.getState().streams()).toHaveLength(1);
    });
  });

  // sortChatsByLastMessage is used by the unified "all chats" view (now a pure function).
  describe("sortChatsByLastMessage", () => {
    // Streams and DMs must interleave by timestamp so the user sees one merged list.
    it("returns mixed streams and DMs sorted by timestamp", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000005",
            display_recipient: "chan",
            timestamp: 1000,
          }),
          dmMsg({ id: 50, timestamp: 3000 }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000003",
            stream_uuid: "00000000-0000-4000-8000-000000000008",
            display_recipient: "chan2",
            timestamp: 5000,
          }),
        ],
        10,
      );

      const { streamsMap, dmsMap } = useChatListStore.getState();
      const sorted = sortChatsByLastMessage(streamsMap, dmsMap, new Set());
      expect(sorted.length).toBe(3);
      const first = sorted[0]!;
      expect(first.type).toBe("stream");
      if (first.type === "stream") {
        expect(first.streamUuid).toBe(streamUuid(8));
      }
    });

    // Empty store is a valid initial state — must not throw.
    it("returns empty array for empty maps", () => {
      expect(sortChatsByLastMessage(new Map(), new Map(), new Set())).toEqual([]);
    });
  });

  // setCurrentUserId handles the race where messages arrive before the user profile.
  describe("setCurrentUserId", () => {
    // Basic setter — the userId is stored for later DM key generation.
    it("stores the user id", () => {
      useChatListStore.getState().setCurrentUserId(42);
      expect(useChatListStore.getState().currentUserId).toBe(42);
    });

    // When userId arrives late, the store must rebuild DM entries from cached messages.
    it("rebuilds sidebar when userId arrives after messages were loaded with null", () => {
      const msgs = [streamMsg({ id: 1 }), dmMsg({ id: 50 })];

      useChatListStore.getState().setFromMessages(msgs, null);
      expect(useChatListStore.getState().currentUserId).toBeNull();

      useChatListStore.getState().setCurrentUserId(10);

      expect(useChatListStore.getState().currentUserId).toBe(10);
      expect(useChatListStore.getState().streams().length).toBeGreaterThanOrEqual(1);
    });

    it("keeps metadata-only DM rows personal when userId arrives late", () => {
      useUsersStore.getState().mergeUser({ user_id: 10, full_name: "Alice", email: "a@x.test" });
      useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob", email: "b@x.test" });
      useChatListStore.getState().upsertDmMetadataRows([{ userIds: [10, 20], unreadCount: 1 }]);

      const before = [...useChatListStore.getState().dmsMap.values()][0];
      expect(before).toBeDefined();

      useChatListStore.getState().setCurrentUserId(10);

      const after = [...useChatListStore.getState().dmsMap.values()][0];
      expect(after?.id).toBe(20);
    });
  });

  describe("metadata upserts", () => {
    it("adds missing stream rows from metadata", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        { streamUuid: "00000000-0000-4000-8000-000000000011", name: "engineering" },
        { streamUuid: "00000000-0000-4000-8000-000000000012", name: "design" },
      ]);

      const streams = useChatListStore.getState().streamsMap;
      expect(streams.has(streamUuid(11))).toBe(true);
      expect(streams.has(streamUuid(12))).toBe(true);
      expect(streams.get(streamUuid(11))?.topics.size).toBe(0);
    });

    it("stores channel-level add-members permissions from metadata", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000011",
          name: "engineering",
          isArchived: true,
          creatorId: 77,
          inviteOnly: true,
          canAddSubscribersGroup: { direct_members: [42], direct_subgroups: [] },
          canRemoveSubscribersGroup: 7002,
          canAdministerChannelGroup: 5001,
        },
      ]);

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(11));
      expect(stream?.isArchived).toBe(true);
      expect(stream?.creatorId).toBe(77);
      expect(stream?.inviteOnly).toBe(true);
      expect(stream?.canAddSubscribersGroup).toEqual({
        direct_members: [42],
        direct_subgroups: [],
      });
      expect(stream?.canRemoveSubscribersGroup).toBe(7002);
      expect(stream?.canAdministerChannelGroup).toBe(5001);
    });

    it("updates archived flag from metadata updates", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000011",
          name: "engineering",
          isArchived: false,
        },
      ]);
      expect(useChatListStore.getState().streamsMap.get(streamUuid(11))?.isArchived).toBe(false);

      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000011",
          name: "engineering",
          isArchived: true,
        },
      ]);
      expect(useChatListStore.getState().streamsMap.get(streamUuid(11))?.isArchived).toBe(true);
    });

    it("keeps archived flag after setFromMessages rebuild", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000011",
          name: "engineering",
          isArchived: true,
        },
      ]);

      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000011",
            display_recipient: "engineering",
            timestamp: 1000,
          }),
        ],
        10,
      );

      expect(useChatListStore.getState().streamsMap.get(streamUuid(11))?.isArchived).toBe(true);
    });

    it("keeps archived flag after addMessages merge", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000011",
          name: "engineering",
          isArchived: true,
        },
      ]);

      useChatListStore.getState().addMessages([
        streamMsg({
          id: "00000000-0000-4000-8000-000000000002",
          stream_uuid: "00000000-0000-4000-8000-000000000011",
          display_recipient: "engineering",
          timestamp: 2000,
        }),
      ]);

      expect(useChatListStore.getState().streamsMap.get(streamUuid(11))?.isArchived).toBe(true);
    });

    it("adds personal DM rows from metadata with unread count", () => {
      useUsersStore.getState().mergeUser({ user_id: 10, full_name: "Alice", email: "a@x.test" });
      useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob", email: "b@x.test" });
      useChatListStore.getState().setCurrentUserId(10);

      useChatListStore.getState().upsertDmMetadataRows([
        {
          userIds: [10, 20],
          unreadCount: 3,
          lastMessageId: "00000000-0000-4000-8000-000000000123",
          lastActivityTs: 1_700_000_000,
        },
      ]);

      const dm = useChatListStore.getState().dmsMap.get("10,20");
      expect(dm).toBeDefined();
      expect(dm?.id).toBe(20);
      expect(dm?.unreadCount).toBe(3);
      expect(dm?.lastMessageId).toBe(testMessageId(123));
    });
  });

  describe("stream admin actions", () => {
    it("renames an existing stream entry", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            timestamp: 1000,
          }),
        ],
        10,
      );

      useChatListStore.getState().renameStream(streamUuid(10), "platform");

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(10));
      expect(stream?.name).toBe("platform");
    });

    it("removes stream entry and stream message index entries", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "general",
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "release",
          }),
          dmMsg({ id: 50 }),
        ],
        10,
      );

      useChatListStore.getState().removeStream(streamUuid(10));

      const state = useChatListStore.getState();
      expect(state.streamsMap.has(streamUuid(10))).toBe(false);
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000001")).toBeUndefined();
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000002")).toBeUndefined();
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000050")?.type).toBe(
        "dm",
      );
    });

    it("optimistically sets and rolls back stream archived flag", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          isArchived: false,
        },
      ]);

      useChatListStore.getState().setStreamArchived(streamUuid(10), true);
      expect(useChatListStore.getState().streamsMap.get(streamUuid(10))?.isArchived).toBe(true);

      useChatListStore.getState().setStreamArchived(streamUuid(10), false);
      expect(useChatListStore.getState().streamsMap.get(streamUuid(10))?.isArchived).toBe(false);
    });

    it("can rollback archived flag to undefined", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          isArchived: true,
        },
      ]);

      useChatListStore.getState().setStreamArchived(streamUuid(10), undefined);
      expect(
        useChatListStore.getState().streamsMap.get(streamUuid(10))?.isArchived,
      ).toBeUndefined();
    });

    it("moves stream topic and removes old topic key", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
            sender_full_name: "Alice",
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "release",
            timestamp: 2000,
            sender_full_name: "Bob",
          }),
        ],
        10,
      );

      useChatListStore.getState().moveStreamTopic({
        streamId: "00000000-0000-4000-8000-000000000010",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: ["00000000-0000-4000-8000-000000000001"],
        anchorMessageId: "00000000-0000-4000-8000-000000000001",
      });

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(10));
      expect(stream?.topics.has("incident")).toBe(false);
      expect(stream?.topics.has("\u2714 incident")).toBe(true);
    });

    it("removes stream topic row and message index entries for that topic", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "release",
            timestamp: 2000,
          }),
          dmMsg({ id: 50 }),
        ],
        10,
      );

      useChatListStore.getState().removeStreamTopic(streamUuid(10), "incident");

      const state = useChatListStore.getState();
      const stream = state.streamsMap.get(streamUuid(10));
      expect(stream?.topics.has("incident")).toBe(false);
      expect(stream?.topics.has("release")).toBe(true);
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000001")).toBeUndefined();
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000002")?.type).toBe(
        "stream",
      );
      expect(state.messageIdToLocation.get("00000000-0000-4000-8000-000000000050")?.type).toBe(
        "dm",
      );
    });

    it("recomputes stream preview fields from remaining topics", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
            sender_full_name: "Alice",
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "release",
            timestamp: 2000,
            sender_full_name: "Bob",
          }),
        ],
        10,
      );

      useChatListStore.getState().removeStreamTopic(streamUuid(10), "release");

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(10));
      expect(stream?.ts).toBe(1000);
      expect(stream?.lastMessageSenderName).toBe("Alice");
      expect(stream?.lastMessage).toBe("hello");
    });

    it("keeps stream row and resets preview when removing last topic", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
          }),
        ],
        10,
      );

      useChatListStore.getState().removeStreamTopic(streamUuid(10), "incident");

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(10));
      expect(stream).toBeDefined();
      expect(stream?.topics.size).toBe(0);
      expect(stream?.lastMessage).toBe("");
      expect(stream?.time).toBe("");
      expect(stream?.ts).toBe(0);
    });

    it("merges topic metadata when move target already exists", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
            sender_full_name: "Alice",
            flags: [],
            sender_id: OTHER_SENDER_ID,
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "\u2714 incident",
            timestamp: 2000,
            sender_full_name: "Bob",
            flags: ["read"],
            sender_id: OTHER_SENDER_ID,
          }),
        ],
        10,
      );

      useChatListStore.getState().moveStreamTopic({
        streamId: "00000000-0000-4000-8000-000000000010",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: ["00000000-0000-4000-8000-000000000001"],
        anchorMessageId: "00000000-0000-4000-8000-000000000001",
      });

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(10));
      const mergedTopic = stream?.topics.get("\u2714 incident");
      expect(mergedTopic).toBeDefined();
      expect(stream?.topics.size).toBe(1);
      expect(mergedTopic?.unreadCount).toBe(0);
      expect(mergedTopic?.lastMessageSenderName).toBe("Bob");
      expect(stream?.lastMessageSenderName).toBe("Bob");
    });

    it("updates message location index to moved topic", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
          }),
        ],
        10,
      );

      useChatListStore.getState().moveStreamTopic({
        streamId: "00000000-0000-4000-8000-000000000010",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: ["00000000-0000-4000-8000-000000000001"],
      });

      const location = useChatListStore
        .getState()
        .messageIdToLocation.get("00000000-0000-4000-8000-000000000001");
      expect(location?.type).toBe("stream");
      if (location?.type !== "stream") return;
      expect(location.topic).toBe("\u2714 incident");
    });

    it("keeps old topic row when only subset of known old-topic ids moved", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1001,
          }),
        ],
        10,
      );

      useChatListStore.getState().moveStreamTopic({
        streamId: "00000000-0000-4000-8000-000000000010",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: ["00000000-0000-4000-8000-000000000001"],
        anchorMessageId: "00000000-0000-4000-8000-000000000001",
      });

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(10));
      expect(stream?.topics.has("incident")).toBe(true);
      expect(stream?.topics.has("\u2714 incident")).toBe(false);
      const movedLocation = useChatListStore
        .getState()
        .messageIdToLocation.get("00000000-0000-4000-8000-000000000001");
      const untouchedLocation = useChatListStore
        .getState()
        .messageIdToLocation.get("00000000-0000-4000-8000-000000000002");
      expect(movedLocation?.type).toBe("stream");
      if (movedLocation?.type !== "stream") return;
      expect(movedLocation.topic).toBe("\u2714 incident");
      expect(untouchedLocation?.type).toBe("stream");
      if (untouchedLocation?.type !== "stream") return;
      expect(untouchedLocation.topic).toBe("incident");
    });

    it("keeps single topic after hydrate + topic move + delta merge", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
          }),
        ],
        10,
      );
      const snapshot = buildChatListSnapshotSerialized(useChatListStore.getState());
      useChatListStore.getState().clear();
      useChatListStore.getState().hydrateFromIndexedDbSnapshot(snapshot);

      useChatListStore.getState().moveStreamTopic({
        streamId: "00000000-0000-4000-8000-000000000010",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: ["00000000-0000-4000-8000-000000000001"],
      });
      useChatListStore.getState().addMessages([
        streamMsg({
          id: "00000000-0000-4000-8000-000000000002",
          stream_uuid: "00000000-0000-4000-8000-000000000010",
          display_recipient: "engineering",
          subject: "\u2714 incident",
          timestamp: 2000,
        }),
      ]);

      const stream = useChatListStore.getState().streamsMap.get(streamUuid(10));
      expect(stream?.topics.has("incident")).toBe(false);
      expect(stream?.topics.has("\u2714 incident")).toBe(true);
      expect(stream?.topics.size).toBe(1);
    });

    it("moves topic to another stream and removes old topic key", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        { streamUuid: "00000000-0000-4000-8000-000000000010", name: "engineering" },
        { streamUuid: "00000000-0000-4000-8000-000000000020", name: "dev" },
      ]);
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: "00000000-0000-4000-8000-000000000001",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
            sender_full_name: "Alice",
          }),
          streamMsg({
            id: "00000000-0000-4000-8000-000000000002",
            stream_uuid: "00000000-0000-4000-8000-000000000020",
            display_recipient: "dev",
            subject: "release",
            timestamp: 2000,
            sender_full_name: "Bob",
          }),
        ],
        10,
      );

      useChatListStore.getState().moveTopicToStream({
        sourceStreamId: "00000000-0000-4000-8000-000000000010",
        targetStreamId: "00000000-0000-4000-8000-000000000020",
        oldTopic: "incident",
        newTopic: "incident",
        messageIds: ["00000000-0000-4000-8000-000000000001"],
        anchorMessageId: "00000000-0000-4000-8000-000000000001",
      });

      const source = useChatListStore.getState().streamsMap.get(streamUuid(10));
      const target = useChatListStore.getState().streamsMap.get(streamUuid(20));
      expect(source).toBeDefined();
      expect(source?.topics.has("incident")).toBe(false);
      expect(target?.topics.has("incident")).toBe(true);
      expect(
        useChatListStore.getState().messageIdToLocation.get("00000000-0000-4000-8000-000000000001"),
      ).toEqual({
        type: "stream",
        streamUuid: "00000000-0000-4000-8000-000000000020",
        topic: "incident",
      });
    });
  });
});
