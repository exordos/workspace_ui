/**
 * Tests for the feed entity — chronological all-messages store with pagination.
 *
 * The feed provides an infinite-scroll view of all messages across streams and DMs.
 * Messages are fetched oldest-first with anchor-based pagination.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage, createMessages } from "~/test/factories";
import { useFeedStore } from "./feed.model";

function msg(overrides: Parameters<typeof createMessage>[0] = {}): MockMessage {
  return createMessage(overrides) as MockMessage;
}

function msgs(count: number, base: Parameters<typeof createMessage>[0] = {}): MockMessage[] {
  return createMessages(count, base) as MockMessage[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

describe("useFeedStore", () => {
  afterEach(() => {
    useFeedStore.setState({
      instanceId: null,
      messages: [],
      isInitialLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      isAllLoaded: false,
      lastMessageId: null,
      requestVersion: 0,
      lastLoadedAt: null,
      error: null,
    });
  });

  it("starts with empty messages", () => {
    const { messages } = useFeedStore.getState();
    expect(messages).toHaveLength(0);
  });

  it("setMessages replaces all messages and tracks lastMessageId", () => {
    const list = [msg({ id: 10 }), msg({ id: 20 })];
    useFeedStore.getState().setMessages(list, false);
    const state = useFeedStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.lastMessageId).toBe(10);
  });

  it("setMessages sets lastMessageId to null for empty array", () => {
    useFeedStore.getState().setMessages([], false);
    expect(useFeedStore.getState().lastMessageId).toBeNull();
  });

  it("appendOlder prepends older messages without duplicates", () => {
    const initial = [msg({ id: 20, timestamp: 2000 })];
    useFeedStore.getState().setMessages(initial, false);

    const older = [msg({ id: 10, timestamp: 1000 }), msg({ id: 20, timestamp: 2000 })];
    useFeedStore.getState().appendOlder(older, false);

    const state = useFeedStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]!.id).toBe(10);
    expect(state.lastMessageId).toBe(10);
  });

  it("appendOlder marks isAllLoaded when receiving empty batch", () => {
    useFeedStore.getState().setMessages([msg({ id: 10 })], false);
    useFeedStore.getState().appendOlder([], true);
    expect(useFeedStore.getState().isAllLoaded).toBe(true);
  });

  it("clear resets to initial state", () => {
    useFeedStore.getState().setMessages(msgs(5), false);
    useFeedStore.getState().clear();
    const state = useFeedStore.getState();
    expect(state.instanceId).toBeNull();
    expect(state.messages).toHaveLength(0);
    expect(state.isInitialLoading).toBe(false);
    expect(state.isRefreshing).toBe(false);
    expect(state.isLoadingMore).toBe(false);
    expect(state.isAllLoaded).toBe(false);
    expect(state.lastMessageId).toBeNull();
    expect(state.requestVersion).toBe(0);
    expect(state.lastLoadedAt).toBeNull();
    expect(state.error).toBeNull();
  });

  it("setLoadingMore toggles loading state", () => {
    useFeedStore.getState().setLoadingMore(true);
    expect(useFeedStore.getState().isLoadingMore).toBe(true);
    useFeedStore.getState().setLoadingMore(false);
    expect(useFeedStore.getState().isLoadingMore).toBe(false);
  });

  it("setError stores error message and clears loading", () => {
    useFeedStore.setState({ isLoadingMore: true });
    useFeedStore.getState().setError("API failure");
    const state = useFeedStore.getState();
    expect(state.error).toBe("API failure");
    expect(state.isLoadingMore).toBe(false);
  });

  it("appendOlder updates lastMessageId to the oldest message", () => {
    useFeedStore.getState().setMessages([msg({ id: 30, timestamp: 3000 })], false);
    useFeedStore
      .getState()
      .appendOlder([msg({ id: 5, timestamp: 500 }), msg({ id: 15, timestamp: 1500 })], false);
    expect(useFeedStore.getState().lastMessageId).toBe(5);
  });

  it("setMessages clears isAllLoaded flag", () => {
    useFeedStore.setState({ isAllLoaded: true });
    useFeedStore.getState().setMessages([msg({ id: 1 })], false);
    expect(useFeedStore.getState().isAllLoaded).toBe(false);
  });

  it("setMessages preserves found-oldest metadata from the initial page", () => {
    useFeedStore.getState().setMessages([msg({ id: 1 })], true);
    expect(useFeedStore.getState().isAllLoaded).toBe(true);
  });

  it("setMessagesIfActual keeps message reference when ids/order are unchanged", () => {
    const initial = [msg({ id: 10, timestamp: 1000 }), msg({ id: 20, timestamp: 2000 })];
    useFeedStore.getState().setMessages(initial, false);
    const beforeRef = useFeedStore.getState().messages;
    useFeedStore.setState({ requestVersion: 1 });

    const sameIds = [msg({ id: 10, timestamp: 1111 }), msg({ id: 20, timestamp: 2222 })];
    useFeedStore.getState().setMessagesIfActual(sameIds, false, 1);

    expect(useFeedStore.getState().messages).toBe(beforeRef);
  });

  it("appendOlder preserves found-oldest metadata even with a non-empty final page", () => {
    useFeedStore.getState().setMessages([msg({ id: 30, timestamp: 3000 })], false);
    useFeedStore.getState().appendOlder([msg({ id: 10, timestamp: 1000 })], true);
    expect(useFeedStore.getState().isAllLoaded).toBe(true);
  });
});
