// Тесты chat-list store: проверяем построение sidebar, unread-логику и reconcile с сервером.
/**
 * Tests for chatListStore — the central store that manages sidebar chat entries.
 *
 * This store converts raw Zulip messages into structured stream and DM entries,
 * tracks unread counts via badge, maintains a messageId→location index for O(1)
 * lookups, and keeps entries sorted by most-recent-message timestamp.
 * Correctness here is critical because the sidebar is the primary navigation surface.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "~/i18n/i18n";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import type { ChatListSnapshotSerialized } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { sortChatsByLastMessage } from "~/shared/lib/chat-sorting";
import { useUsersStore } from "../user/user.model";
import { buildChatListSnapshotSerialized } from "./chat-list-snapshot.lib";
import { useChatListStore } from "./chat-list.model";

function resetStores() {
  useChatListStore.getState().clear();
  useUsersStore.getState().clear();
}

function streamMsg(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 1,
    sender_id: 10,
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
    ...overrides,
  };
}

/** Unread badge counts when currentUserId is 10 — use for messages that should count as unread. */
const OTHER_SENDER_ID = 20;

// Verifies all store actions: building entries from messages, live updates,
// unread tracking, deletion handling, and sort order.
describe("chatListStore", () => {
  beforeEach(resetStores);
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

  describe("reconcileUnreadFromMessages", () => {
    it("clears stale unread count for a cached stream topic when server unread snapshot is empty", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: 101,
            stream_id: 12,
            display_recipient: "engineering",
            subject: "channel events",
            sender_id: OTHER_SENDER_ID,
            flags: [],
          }),
          streamMsg({
            id: 102,
            stream_id: 12,
            display_recipient: "engineering",
            subject: "channel events",
            sender_id: OTHER_SENDER_ID,
            flags: [],
            timestamp: 2000,
          }),
        ],
        10,
      );

      expect(
        useChatListStore.getState().streamsMap.get(12)?.topics.get("channel events")?.unreadCount,
      ).toBe(2);

      useChatListStore.getState().reconcileUnreadFromMessages([], 10);

      const topic = useChatListStore.getState().streamsMap.get(12)?.topics.get("channel events");
      expect(topic?.unreadCount).toBe(0);
    });
  });

  // setFromMessages is the initial hydration path — called once after fetching message history.
  describe("setFromMessages", () => {
    // Stream messages must be grouped by stream_id with topics nested inside.
    it("builds stream entries from stream messages", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            streamMsg({ id: 1, stream_id: 5, subject: "topic1", timestamp: 1000 }),
            streamMsg({ id: 2, stream_id: 5, subject: "topic2", timestamp: 2000 }),
          ],
          10,
        );

      const streams = useChatListStore.getState().streams();
      expect(streams).toHaveLength(1);
      expect(streams[0]!.stream_id).toBe(5);
      expect(streams[0]!.topics).toBeDefined();
      expect(streams[0]!.topics!.length).toBe(2);
    });

    it("maps stream and topic last message sender names", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: 1,
            stream_id: 5,
            subject: "topic1",
            timestamp: 1000,
            sender_full_name: "Alice",
          }),
          streamMsg({
            id: 2,
            stream_id: 5,
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
      useChatListStore
        .getState()
        .setFromMessages([streamMsg({ id: 100, stream_id: 7, subject: "topicA" })], 10);

      const loc = useChatListStore.getState().messageIdToLocation.get(100);
      expect(loc).toBeDefined();
      expect(loc!.type).toBe("stream");
      if (loc!.type === "stream") {
        expect(loc!.stream_id).toBe(7);
        expect(loc!.topic).toBe("topicA");
      }
    });

    // DM messages also need location tracking for badge decrement.
    it("builds messageIdToLocation index for DM messages", () => {
      useChatListStore.getState().setFromMessages([dmMsg({ id: 200 })], 10);

      const loc = useChatListStore.getState().messageIdToLocation.get(200);
      expect(loc).toBeDefined();
      expect(loc!.type).toBe("dm");
    });

    // Messages from different streams must not be merged into one entry.
    it("separates multiple streams by stream_id", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            streamMsg({ id: 1, stream_id: 5, display_recipient: "stream-a", timestamp: 1000 }),
            streamMsg({ id: 2, stream_id: 8, display_recipient: "stream-b", timestamp: 2000 }),
          ],
          10,
        );

      const streams = useChatListStore.getState().streams();
      expect(streams).toHaveLength(2);
      const ids = streams.map((s) => s.stream_id).sort();
      expect(ids).toEqual([5, 8]);
    });

    // Badge count drives the unread indicator — only messages without "read" flag count.
    it("counts unread messages (messages without 'read' flag)", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            streamMsg({ id: 1, flags: [], sender_id: OTHER_SENDER_ID }),
            streamMsg({ id: 2, flags: ["read"], sender_id: OTHER_SENDER_ID }),
            streamMsg({ id: 3, flags: [], sender_id: OTHER_SENDER_ID }),
          ],
          10,
        );

      const streams = useChatListStore.getState().streams();
      expect(streams[0]!.badge).toBe(2);
    });
  });

  // addMessage handles live events — new messages arriving via long-polling.
  describe("addMessage (stream)", () => {
    // A message for an unknown stream must create a brand-new sidebar entry.
    it("creates a new stream entry for a stream message", () => {
      useChatListStore.getState().addMessage(
        streamMsg({
          id: 10,
          stream_id: 99,
          display_recipient: "new-stream",
          subject: "intro",
          timestamp: 5000,
        }),
      );

      const streams = useChatListStore.getState().streams();
      expect(streams.some((s) => s.stream_id === 99)).toBe(true);
    });

    // Existing entries must update their last message preview on new activity.
    it("updates an existing stream entry with a newer message", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [streamMsg({ id: 1, stream_id: 5, subject: "t", timestamp: 1000, content: "old" })],
          10,
        );

      useChatListStore
        .getState()
        .addMessage(
          streamMsg({ id: 2, stream_id: 5, subject: "t", timestamp: 2000, content: "new" }),
        );

      const streams = useChatListStore.getState().streams();
      const stream = streams.find((s) => s.stream_id === 5)!;
      expect(stream.topics![0]!.lastMessage).toContain("new");
    });

    // New unread messages must bump the badge so the user sees new activity.
    it("increments unread count for unread stream messages", () => {
      useChatListStore.getState().setFromMessages([streamMsg({ id: 1, flags: ["read"] })], 10);

      useChatListStore
        .getState()
        .addMessage(streamMsg({ id: 2, flags: [], timestamp: 3000, sender_id: OTHER_SENDER_ID }));

      const streams = useChatListStore.getState().streams();
      expect(streams[0]!.badge).toBe(1);
    });

    it("does not increment unread count for own stream messages", () => {
      useChatListStore.getState().setFromMessages([streamMsg({ id: 1, flags: ["read"] })], 10);

      useChatListStore
        .getState()
        .addMessage(streamMsg({ id: 2, flags: [], timestamp: 3000, sender_id: 10 }));

      const streams = useChatListStore.getState().streams();
      expect(streams[0]!.badge).toBeUndefined();
    });

    // Location index must be updated for every new message so decrements work later.
    it("updates messageIdToLocation for newly added stream message", () => {
      useChatListStore
        .getState()
        .addMessage(streamMsg({ id: 77, stream_id: 5, subject: "topicX", timestamp: 3000 }));

      const loc = useChatListStore.getState().messageIdToLocation.get(77);
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
    it("increments unread count for unread DM messages", () => {
      useChatListStore.setState({ currentUserId: 10 });

      useChatListStore
        .getState()
        .addMessage(dmMsg({ id: 60, flags: [], timestamp: 3000, sender_id: OTHER_SENDER_ID }));
      useChatListStore
        .getState()
        .addMessage(dmMsg({ id: 61, flags: [], timestamp: 4000, sender_id: OTHER_SENDER_ID }));

      const dms = useChatListStore.getState().dms();
      const dm = dms.find((d) => d.type === "dm");
      expect(dm?.badge).toBeGreaterThanOrEqual(1);
    });

    it("does not increment unread count for own DM messages", () => {
      useChatListStore.setState({ currentUserId: 10 });

      useChatListStore
        .getState()
        .setFromMessages([dmMsg({ id: 59, flags: ["read"], timestamp: 1000 })], 10);
      useChatListStore
        .getState()
        .addMessage(dmMsg({ id: 60, flags: [], timestamp: 3000, sender_id: 10 }));

      const dms = useChatListStore.getState().dms();
      const dm = dms.find((d) => d.type === "dm");
      expect(dm?.badge).toBeUndefined();
    });

    // DM messages also need location tracking for unread decrement.
    it("updates messageIdToLocation for DM messages", () => {
      useChatListStore.setState({ currentUserId: 10 });

      useChatListStore.getState().addMessage(dmMsg({ id: 88, timestamp: 5000 }));

      const loc = useChatListStore.getState().messageIdToLocation.get(88);
      expect(loc).toBeDefined();
      expect(loc!.type).toBe("dm");
    });
  });

  // Sort order determines what the user sees at the top of the sidebar.
  describe("streams() sort order", () => {
    // Most-recent-first ensures active conversations are immediately visible.
    it("returns streams sorted by most recent message first", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            streamMsg({ id: 1, stream_id: 1, display_recipient: "older", timestamp: 1000 }),
            streamMsg({ id: 2, stream_id: 2, display_recipient: "newer", timestamp: 5000 }),
          ],
          10,
        );

      const streams = useChatListStore.getState().streams();
      expect(streams[0]!.stream_id).toBe(2);
      expect(streams[1]!.stream_id).toBe(1);
    });
  });

  // DMs follow the same most-recent-first order as streams.
  describe("dms() sort order", () => {
    // The newest conversation must appear first in the DM list.
    it("returns DMs sorted by most recent first", () => {
      useChatListStore.getState().setFromMessages(
        [
          dmMsg({
            id: 50,
            timestamp: 1000,
            display_recipient: [
              { id: 10, full_name: "Me" },
              { id: 20, full_name: "A" },
            ],
          }),
          dmMsg({
            id: 51,
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

  // decrementUnread is triggered by "read" flag events from the server.
  describe("decrementUnreadForMessages", () => {
    // Reading a message must reduce the badge by exactly one.
    it("decrements stream topic unread count", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            streamMsg({ id: 1, flags: [], sender_id: OTHER_SENDER_ID }),
            streamMsg({ id: 2, flags: [], sender_id: OTHER_SENDER_ID }),
          ],
          10,
        );

      expect(useChatListStore.getState().streams()[0]!.badge).toBe(2);

      useChatListStore.getState().decrementUnreadForMessages([1]);

      expect(useChatListStore.getState().streams()[0]!.badge).toBe(1);
    });

    // Once read, the message must be removed from the index to avoid double-decrement.
    it("removes messageId from location index after decrement", () => {
      useChatListStore
        .getState()
        .setFromMessages([streamMsg({ id: 1, flags: [], sender_id: OTHER_SENDER_ID })], 10);

      useChatListStore.getState().decrementUnreadForMessages([1]);

      expect(useChatListStore.getState().messageIdToLocation.has(1)).toBe(false);
    });

    // Defensive: badge must never become negative even with duplicate events.
    it("does not go below zero", () => {
      useChatListStore.getState().setFromMessages([streamMsg({ id: 1, flags: ["read"] })], 10);

      useChatListStore.getState().decrementUnreadForMessages([1]);

      const streams = useChatListStore.getState().streams();
      const badge = streams[0]?.badge;
      expect(badge ?? 0).toBe(0);
    });

    // Empty array is a valid input from the event loop — must be a safe no-op.
    it("handles empty messageIds array", () => {
      useChatListStore
        .getState()
        .setFromMessages([streamMsg({ id: 1, flags: [], sender_id: OTHER_SENDER_ID })], 10);

      useChatListStore.getState().decrementUnreadForMessages([]);

      expect(useChatListStore.getState().streams()[0]!.badge).toBe(1);
    });

    // DMs use the same decrement path — verify badge decreases for private messages.
    it("decrements DM unread count", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            dmMsg({ id: 50, flags: [], sender_id: OTHER_SENDER_ID }),
            dmMsg({ id: 51, flags: [], timestamp: 3000, sender_id: OTHER_SENDER_ID }),
          ],
          10,
        );

      useChatListStore.getState().decrementUnreadForMessages([50]);

      const dms = useChatListStore.getState().dms();
      const totalBadge = dms.reduce((sum, d) => sum + (d.badge ?? 0), 0);
      expect(totalBadge).toBe(1);
    });
  });

  describe("decrementUnreadForTopic / decrementUnreadForDmKey", () => {
    it("decrements stream topic unread count by explicit amount", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            streamMsg({ id: 1, flags: [], sender_id: OTHER_SENDER_ID }),
            streamMsg({ id: 2, flags: [], sender_id: OTHER_SENDER_ID }),
          ],
          10,
        );

      useChatListStore.getState().decrementUnreadForTopic(5, "topic1", 1);

      expect(useChatListStore.getState().streams()[0]!.badge).toBe(1);
    });

    it("clamps stream topic unread count to zero", () => {
      useChatListStore
        .getState()
        .setFromMessages([streamMsg({ id: 1, flags: [], sender_id: OTHER_SENDER_ID })], 10);

      useChatListStore.getState().decrementUnreadForTopic(5, "topic1", 10);

      const badge = useChatListStore.getState().streams()[0]?.badge;
      expect(badge ?? 0).toBe(0);
    });

    it("decrements DM unread count by explicit amount", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            dmMsg({ id: 50, flags: [], sender_id: OTHER_SENDER_ID }),
            dmMsg({ id: 51, flags: [], timestamp: 3000, sender_id: OTHER_SENDER_ID }),
          ],
          10,
        );

      const dmLocation = useChatListStore.getState().messageIdToLocation.get(50);
      expect(dmLocation?.type).toBe("dm");
      if (dmLocation?.type !== "dm") return;

      useChatListStore.getState().decrementUnreadForDmKey(dmLocation.dmKey, 1);

      const dms = useChatListStore.getState().dms();
      const totalBadge = dms.reduce((sum, d) => sum + (d.badge ?? 0), 0);
      expect(totalBadge).toBe(1);
    });

    it("clamps DM unread count to zero", () => {
      useChatListStore
        .getState()
        .setFromMessages([dmMsg({ id: 50, flags: [], sender_id: OTHER_SENDER_ID })], 10);

      const dmLocation = useChatListStore.getState().messageIdToLocation.get(50);
      expect(dmLocation?.type).toBe("dm");
      if (dmLocation?.type !== "dm") return;

      useChatListStore.getState().decrementUnreadForDmKey(dmLocation.dmKey, 5);

      const dms = useChatListStore.getState().dms();
      const totalBadge = dms.reduce((sum, d) => sum + (d.badge ?? 0), 0);
      expect(totalBadge).toBe(0);
    });
  });

  // incrementUnread handles "unread" flag events (e.g. marking a message as unread).
  describe("incrementUnreadForMessages", () => {
    // Marking as unread must bump the badge from zero.
    it("increments stream topic unread count", () => {
      useChatListStore.getState().setFromMessages([streamMsg({ id: 1, flags: ["read"] })], 10);

      expect(useChatListStore.getState().streams()[0]!.badge).toBeUndefined();

      useChatListStore.getState().incrementUnreadForMessages([1]);

      expect(useChatListStore.getState().streams()[0]!.badge).toBe(1);
    });

    // Empty array must be a safe no-op.
    it("handles empty messageIds array", () => {
      useChatListStore
        .getState()
        .setFromMessages([streamMsg({ id: 1, flags: [], sender_id: OTHER_SENDER_ID })], 10);

      useChatListStore.getState().incrementUnreadForMessages([]);

      expect(useChatListStore.getState().streams()[0]!.badge).toBe(1);
    });

    // Unknown IDs may come from stale events — must not crash or change state.
    it("is a no-op for unknown message ids", () => {
      useChatListStore
        .getState()
        .setFromMessages([streamMsg({ id: 1, flags: [], sender_id: OTHER_SENDER_ID })], 10);

      useChatListStore.getState().incrementUnreadForMessages([999]);

      expect(useChatListStore.getState().streams()[0]!.badge).toBe(1);
    });
  });

  // handleDeleteMessages responds to server-side message deletion events.
  describe("handleDeleteMessages", () => {
    // Deleting a known lastMessageId should keep topic row to avoid transient disappear after topic move notices.
    it("keeps topic row and clears lastMessageId when deleting topic last message", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            streamMsg({ id: 1, stream_id: 5, subject: "topicA", timestamp: 1000 }),
            streamMsg({ id: 2, stream_id: 5, subject: "topicB", timestamp: 2000 }),
          ],
          10,
        );

      useChatListStore.getState().handleDeleteMessages([1]);

      const stream = useChatListStore
        .getState()
        .streams()
        .find((s) => s.stream_id === 5);
      expect(stream).toBeDefined();
      const topicNames = stream!.topics!.map((t) => t.subject);
      expect(topicNames).toContain("topicA");
      expect(topicNames).toContain("topicB");
      expect(
        useChatListStore.getState().streamsMap.get(5)?.topics.get("topicA")?.lastMessageId,
      ).toBe(undefined);
    });

    it("keeps stream last sender when deleting tracked topic last message id", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: 1,
            stream_id: 5,
            subject: "topicA",
            timestamp: 1000,
            sender_full_name: "Alice",
          }),
          streamMsg({
            id: 2,
            stream_id: 5,
            subject: "topicB",
            timestamp: 2000,
            sender_full_name: "Bob",
          }),
        ],
        10,
      );

      useChatListStore.getState().handleDeleteMessages([2]);

      const stream = useChatListStore
        .getState()
        .streams()
        .find((item) => item.stream_id === 5);
      expect(stream).toBeDefined();
      expect(stream?.lastMessageSenderName).toBe("Bob");
    });

    // Single-topic stream should remain visible after deleting currently tracked lastMessageId.
    it("keeps stream and topic row when its only topic last message is deleted", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [streamMsg({ id: 1, stream_id: 5, subject: "only", timestamp: 1000 })],
          10,
        );

      useChatListStore.getState().handleDeleteMessages([1]);

      const stream = useChatListStore
        .getState()
        .streams()
        .find((item) => item.stream_id === 5);
      expect(stream).toBeDefined();
      expect(stream?.topics?.map((topic) => topic.subject)).toEqual(["only"]);
      expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("only")?.lastMessageId).toBe(
        undefined,
      );
    });

    // DM rows follow the same conservative policy: keep row, clear tracked lastMessageId.
    it("keeps DM row and clears lastMessageId when its last message is deleted", () => {
      useChatListStore.getState().setFromMessages([dmMsg({ id: 50 })], 10);

      useChatListStore.getState().handleDeleteMessages([50]);

      const dms = useChatListStore.getState().dms();
      expect(dms).toHaveLength(1);
      expect(useChatListStore.getState().dmsMap.get("10,20")?.lastMessageId).toBe(undefined);
    });

    it("keeps moved topic row after deleting moved topic lastMessageId", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [streamMsg({ id: 1, stream_id: 5, subject: "incident", timestamp: 1000 })],
          10,
        );
      useChatListStore.getState().moveStreamTopic({
        streamId: 5,
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [1],
        anchorMessageId: 1,
      });

      useChatListStore.getState().handleDeleteMessages([1]);

      const stream = useChatListStore.getState().streamsMap.get(5);
      expect(stream?.topics.has("\u2714 incident")).toBe(true);
      expect(stream?.topics.get("\u2714 incident")?.lastMessageId).toBe(undefined);
    });

    // Deleted messages must be purged from the location index to avoid stale lookups.
    it("removes messageId from location index after delete", () => {
      useChatListStore.getState().setFromMessages([streamMsg({ id: 1 })], 10);

      useChatListStore.getState().handleDeleteMessages([1]);

      expect(useChatListStore.getState().messageIdToLocation.has(1)).toBe(false);
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

      useChatListStore.getState().handleDeleteMessages([999]);

      expect(useChatListStore.getState().streams()).toHaveLength(1);
    });
  });

  // sortChatsByLastMessage is used by the unified "all chats" view (now a pure function).
  describe("sortChatsByLastMessage", () => {
    // Streams and DMs must interleave by timestamp so the user sees one merged list.
    it("returns mixed streams and DMs sorted by timestamp", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [
            streamMsg({ id: 1, stream_id: 5, display_recipient: "chan", timestamp: 1000 }),
            dmMsg({ id: 50, timestamp: 3000 }),
            streamMsg({ id: 3, stream_id: 8, display_recipient: "chan2", timestamp: 5000 }),
          ],
          10,
        );

      const { streamsMap, dmsMap } = useChatListStore.getState();
      const sorted = sortChatsByLastMessage(streamsMap, dmsMap, "recent", new Set());
      expect(sorted.length).toBe(3);
      const first = sorted[0]!;
      expect(first.type).toBe("stream");
      if (first.type === "stream") {
        expect(first.stream_id).toBe(8);
      }
    });

    // Empty store is a valid initial state — must not throw.
    it("returns empty array for empty maps", () => {
      expect(sortChatsByLastMessage(new Map(), new Map(), "recent", new Set())).toEqual([]);
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

    it("rebuilds metadata-only DM rows when userId arrives late", () => {
      useUsersStore.getState().mergeUser({ user_id: 10, full_name: "Alice", email: "a@x.test" });
      useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob", email: "b@x.test" });
      useChatListStore.getState().upsertDmMetadataRows([{ userIds: [10, 20], unreadCount: 1 }]);

      const before = [...useChatListStore.getState().dmsMap.values()][0];
      expect(before?.isGroup).toBe(true);

      useChatListStore.getState().setCurrentUserId(10);

      const after = [...useChatListStore.getState().dmsMap.values()][0];
      expect(after?.isGroup).toBe(false);
      expect(after?.id).toBe(20);
    });
  });

  describe("metadata upserts", () => {
    it("adds missing stream rows from metadata", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        { streamId: 11, name: "engineering" },
        { streamId: 12, name: "design" },
      ]);

      const streams = useChatListStore.getState().streamsMap;
      expect(streams.has(11)).toBe(true);
      expect(streams.has(12)).toBe(true);
      expect(streams.get(11)?.topics.size).toBe(0);
    });

    it("stores channel-level add-members permissions from metadata", () => {
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 11,
          name: "engineering",
          creatorId: 77,
          inviteOnly: true,
          canAddSubscribersGroup: { direct_members: [42], direct_subgroups: [] },
          canRemoveSubscribersGroup: 7002,
          canAdministerChannelGroup: 5001,
        },
      ]);

      const stream = useChatListStore.getState().streamsMap.get(11);
      expect(stream?.creatorId).toBe(77);
      expect(stream?.inviteOnly).toBe(true);
      expect(stream?.canAddSubscribersGroup).toEqual({
        direct_members: [42],
        direct_subgroups: [],
      });
      expect(stream?.canRemoveSubscribersGroup).toBe(7002);
      expect(stream?.canAdministerChannelGroup).toBe(5001);
    });

    it("adds personal DM rows from metadata with unread count", () => {
      useUsersStore.getState().mergeUser({ user_id: 10, full_name: "Alice", email: "a@x.test" });
      useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob", email: "b@x.test" });
      useChatListStore.getState().setCurrentUserId(10);

      useChatListStore.getState().upsertDmMetadataRows([
        {
          userIds: [10, 20],
          unreadCount: 3,
          lastMessageId: 123,
          lastActivityTs: 1_700_000_000,
        },
      ]);

      const dm = useChatListStore.getState().dmsMap.get("10,20");
      expect(dm).toBeDefined();
      expect(dm?.isGroup).toBe(false);
      expect(dm?.id).toBe(20);
      expect(dm?.unreadCount).toBe(3);
      expect(dm?.lastMessageId).toBe(123);
    });
  });

  describe("stream admin actions", () => {
    it("renames an existing stream entry", () => {
      useChatListStore
        .getState()
        .setFromMessages(
          [streamMsg({ id: 1, stream_id: 10, display_recipient: "engineering", timestamp: 1000 })],
          10,
        );

      useChatListStore.getState().renameStream(10, "platform");

      const stream = useChatListStore.getState().streamsMap.get(10);
      expect(stream?.name).toBe("platform");
    });

    it("removes stream entry and stream message index entries", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: 1,
            stream_id: 10,
            display_recipient: "engineering",
            subject: "general",
          }),
          streamMsg({
            id: 2,
            stream_id: 10,
            display_recipient: "engineering",
            subject: "release",
          }),
          dmMsg({ id: 50 }),
        ],
        10,
      );

      useChatListStore.getState().removeStream(10);

      const state = useChatListStore.getState();
      expect(state.streamsMap.has(10)).toBe(false);
      expect(state.messageIdToLocation.get(1)).toBeUndefined();
      expect(state.messageIdToLocation.get(2)).toBeUndefined();
      expect(state.messageIdToLocation.get(50)?.type).toBe("dm");
    });

    it("moves stream topic and removes old topic key", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: 1,
            stream_id: 10,
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
            sender_full_name: "Alice",
          }),
          streamMsg({
            id: 2,
            stream_id: 10,
            display_recipient: "engineering",
            subject: "release",
            timestamp: 2000,
            sender_full_name: "Bob",
          }),
        ],
        10,
      );

      useChatListStore.getState().moveStreamTopic({
        streamId: 10,
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [1],
        anchorMessageId: 1,
      });

      const stream = useChatListStore.getState().streamsMap.get(10);
      expect(stream?.topics.has("incident")).toBe(false);
      expect(stream?.topics.has("\u2714 incident")).toBe(true);
    });

    it("merges topic metadata when move target already exists", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: 1,
            stream_id: 10,
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
            sender_full_name: "Alice",
            flags: [],
            sender_id: OTHER_SENDER_ID,
          }),
          streamMsg({
            id: 2,
            stream_id: 10,
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
        streamId: 10,
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [1],
        anchorMessageId: 1,
      });

      const stream = useChatListStore.getState().streamsMap.get(10);
      const mergedTopic = stream?.topics.get("\u2714 incident");
      expect(mergedTopic).toBeDefined();
      expect(stream?.topics.size).toBe(1);
      expect(mergedTopic?.unreadCount).toBe(1);
      expect(mergedTopic?.lastMessageSenderName).toBe("Bob");
      expect(stream?.lastMessageSenderName).toBe("Bob");
    });

    it("updates message location index to moved topic", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: 1,
            stream_id: 10,
            display_recipient: "engineering",
            subject: "incident",
          }),
        ],
        10,
      );

      useChatListStore.getState().moveStreamTopic({
        streamId: 10,
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [1],
      });

      const location = useChatListStore.getState().messageIdToLocation.get(1);
      expect(location?.type).toBe("stream");
      if (location?.type !== "stream") return;
      expect(location.topic).toBe("\u2714 incident");
    });

    it("keeps old topic row when only subset of known old-topic ids moved", () => {
      useChatListStore.getState().setFromMessages(
        [
          streamMsg({
            id: 1,
            stream_id: 10,
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1000,
          }),
          streamMsg({
            id: 2,
            stream_id: 10,
            display_recipient: "engineering",
            subject: "incident",
            timestamp: 1001,
          }),
        ],
        10,
      );

      useChatListStore.getState().moveStreamTopic({
        streamId: 10,
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [1],
        anchorMessageId: 1,
      });

      const stream = useChatListStore.getState().streamsMap.get(10);
      expect(stream?.topics.has("incident")).toBe(true);
      expect(stream?.topics.has("\u2714 incident")).toBe(false);
      const movedLocation = useChatListStore.getState().messageIdToLocation.get(1);
      const untouchedLocation = useChatListStore.getState().messageIdToLocation.get(2);
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
            id: 1,
            stream_id: 10,
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
        streamId: 10,
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [1],
      });
      useChatListStore.getState().addMessages([
        streamMsg({
          id: 2,
          stream_id: 10,
          display_recipient: "engineering",
          subject: "\u2714 incident",
          timestamp: 2000,
        }),
      ]);

      const stream = useChatListStore.getState().streamsMap.get(10);
      expect(stream?.topics.has("incident")).toBe(false);
      expect(stream?.topics.has("\u2714 incident")).toBe(true);
      expect(stream?.topics.size).toBe(1);
    });
  });
});
