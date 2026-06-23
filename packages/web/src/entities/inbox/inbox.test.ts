/**
 * Tests for the inbox entity — server-owned unread rows and request lifecycle.
 *
 * The inbox stores server unread metadata, provides sorted views, and refreshes when stale.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useInboxStore } from "./inbox.model";
import type { InboxEntry } from "./inbox.types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STREAM_ENTRY_1: InboxEntry = {
  key: "stream:10:general",
  streamId: "10",
  streamName: "engineering",
  topic: "general",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 3,
  lastMessageTimestamp: 1710000300,
  messageIds: [
    "00000000-0000-4000-8000-000000000101",
    "00000000-0000-4000-8000-000000000102",
    "00000000-0000-4000-8000-000000000103",
  ],
};

const STREAM_ENTRY_2: InboxEntry = {
  key: "stream:10:bugs",
  streamId: "10",
  streamName: "engineering",
  topic: "bugs",
  senderId: null,
  senderName: null,
  dmSlug: null,
  unreadCount: 1,
  lastMessageTimestamp: 1710000100,
  messageIds: ["00000000-0000-4000-8000-000000000201"],
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
  messageIds: [
    "00000000-0000-4000-8000-000000000301",
    "00000000-0000-4000-8000-000000000302",
    "00000000-0000-4000-8000-000000000303",
    "00000000-0000-4000-8000-000000000304",
    "00000000-0000-4000-8000-000000000305",
  ],
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
      staleVersion: 0,
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

  it("markStale increments refresh version without changing entries", () => {
    useInboxStore.getState().setEntries([STREAM_ENTRY_1, STREAM_ENTRY_2, DM_ENTRY]);
    useInboxStore.getState().markStale();
    const state = useInboxStore.getState();
    expect(state.staleVersion).toBe(1);
    expect(state.entries).toEqual([STREAM_ENTRY_1, STREAM_ENTRY_2, DM_ENTRY]);
  });

  it("sortedEntries returns entries newest first", () => {
    useInboxStore.getState().setEntries([STREAM_ENTRY_2, STREAM_ENTRY_1, DM_ENTRY]);
    const sorted = useInboxStore.getState().sortedEntries();
    expect(sorted[0]!.key).toBe("dm:42");
    expect(sorted[1]!.key).toBe("stream:10:general");
    expect(sorted[2]!.key).toBe("stream:10:bugs");
  });
});
