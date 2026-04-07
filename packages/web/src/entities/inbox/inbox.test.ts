/**
 * Tests for the inbox entity — unread message grouping, actions, and derived data.
 *
 * The inbox groups unread messages by stream+topic or DM conversation,
 * provides sorted views, and supports batch mark-as-read.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useInboxStore } from "./inbox.model";
import type { InboxEntry } from "./inbox.types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STREAM_ENTRY_1: InboxEntry = {
  key: "stream:10:general",
  streamId: 10,
  streamName: "engineering",
  topic: "general",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 3,
  lastMessageTimestamp: 1710000300,
  messageIds: [101, 102, 103],
};

const STREAM_ENTRY_2: InboxEntry = {
  key: "stream:10:bugs",
  streamId: 10,
  streamName: "engineering",
  topic: "bugs",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 1,
  lastMessageTimestamp: 1710000100,
  messageIds: [201],
};

const DM_ENTRY: InboxEntry = {
  key: "dm:42",
  streamId: null,
  streamName: null,
  topic: null,
  senderId: 42,
  senderName: "Alice",
  dmSlug: "42",
  unreadCount: 5,
  lastMessageTimestamp: 1710000500,
  messageIds: [301, 302, 303, 304, 305],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

describe("useInboxStore", () => {
  afterEach(() => {
    useInboxStore.setState({
      entries: [],
      loading: false,
      isInitialLoading: false,
      isRefreshing: false,
      requestVersion: 0,
      lastLoadedAt: null,
      error: null,
      stale: false,
    });
  });

  it("starts with empty entries", () => {
    const { entries } = useInboxStore.getState();
    expect(entries).toHaveLength(0);
  });

  it("setEntries replaces all entries", () => {
    useInboxStore.getState().setEntries([STREAM_ENTRY_1, DM_ENTRY]);
    expect(useInboxStore.getState().entries).toHaveLength(2);
  });

  it("setEntries clears loading and error", () => {
    useInboxStore.setState({ loading: true, error: "old error" });
    useInboxStore.getState().setEntries([STREAM_ENTRY_1]);
    const state = useInboxStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("markAsRead removes entries whose messageIds are fully covered", () => {
    useInboxStore.getState().setEntries([STREAM_ENTRY_1, DM_ENTRY]);
    useInboxStore.getState().markAsRead([101, 102, 103]);
    const entries = useInboxStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe("dm:42");
  });

  it("markAsRead decrements unreadCount for partially read entries", () => {
    useInboxStore.getState().setEntries([DM_ENTRY]);
    useInboxStore.getState().markAsRead([301, 302]);
    const entry = useInboxStore.getState().entries[0]!;
    expect(entry.unreadCount).toBe(3);
    expect(entry.messageIds).toHaveLength(3);
  });

  it("clear resets to initial state", () => {
    useInboxStore.getState().setEntries([STREAM_ENTRY_1, DM_ENTRY]);
    useInboxStore.getState().clear();
    const state = useInboxStore.getState();
    expect(state.entries).toHaveLength(0);
    expect(state.loading).toBe(false);
    expect(state.isInitialLoading).toBe(false);
    expect(state.isRefreshing).toBe(false);
    expect(state.requestVersion).toBe(0);
    expect(state.lastLoadedAt).toBeNull();
    expect(state.error).toBeNull();
  });

  it("setLoading toggles loading state", () => {
    useInboxStore.getState().setLoading(true);
    expect(useInboxStore.getState().loading).toBe(true);
    expect(useInboxStore.getState().isInitialLoading).toBe(true);
    useInboxStore.getState().setLoading(false);
    expect(useInboxStore.getState().loading).toBe(false);
    expect(useInboxStore.getState().isInitialLoading).toBe(false);
  });

  it("setError stores error message", () => {
    useInboxStore.getState().setError("Network error");
    expect(useInboxStore.getState().error).toBe("Network error");
  });

  it("totalUnreadCount sums all entry counts", () => {
    useInboxStore.getState().setEntries([STREAM_ENTRY_1, STREAM_ENTRY_2, DM_ENTRY]);
    expect(useInboxStore.getState().totalUnreadCount()).toBe(9);
  });

  it("totalUnreadCount returns 0 for empty entries", () => {
    expect(useInboxStore.getState().totalUnreadCount()).toBe(0);
  });

  it("sortedEntries returns entries newest first", () => {
    useInboxStore.getState().setEntries([STREAM_ENTRY_2, STREAM_ENTRY_1, DM_ENTRY]);
    const sorted = useInboxStore.getState().sortedEntries();
    expect(sorted[0]!.key).toBe("dm:42");
    expect(sorted[1]!.key).toBe("stream:10:general");
    expect(sorted[2]!.key).toBe("stream:10:bugs");
  });
});
