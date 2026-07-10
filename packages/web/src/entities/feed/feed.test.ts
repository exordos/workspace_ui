import { afterEach, describe, expect, it } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { useFeedStore } from "./feed.model";

type MessageOverrides = Omit<Partial<MessengerMessage>, "payload"> & {
  markdown?: string;
  payload?: MessengerMessage["payload"];
};

function msg(overrides: MessageOverrides = {}): MessengerMessage {
  const { markdown, payload, ...rest } = overrides;
  return {
    uuid: "message-a",
    conversationId: "topic:stream-a:topic-a",
    projectId: "project-a",
    streamUuid: "stream-a",
    topicUuid: "topic-a",
    authorUuid: "user-a",
    userUuid: "user-a",
    payload: payload ?? { kind: "markdown", content: markdown ?? "Hello" },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-02T10:00:00Z",
    updatedAt: "2026-07-02T10:00:00Z",
    ...rest,
  };
}

function resetFeedStore(): void {
  useFeedStore.setState({
    ownerKey: null,
    messages: [],
    isInitialLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    hasMore: false,
    nextPageMarker: null,
    requestVersion: 0,
    lastLoadedAt: null,
    error: null,
  });
}

describe("useFeedStore", () => {
  afterEach(() => {
    resetFeedStore();
  });

  it("starts with empty Workspace messages", () => {
    expect(useFeedStore.getState().messages).toHaveLength(0);
  });

  it("setMessages replaces messages and stores Workspace pagination", () => {
    useFeedStore
      .getState()
      .setMessages(
        [
          msg({ uuid: "message-b", createdAt: "2026-07-02T10:02:00Z" }),
          msg({ uuid: "message-a", createdAt: "2026-07-02T10:01:00Z" }),
        ],
        { nextPageMarker: "cursor-a", hasMore: true },
        "owner-a",
      );

    const state = useFeedStore.getState();
    expect(state.ownerKey).toBe("owner-a");
    expect(state.messages.map((message) => message.uuid)).toEqual(["message-a", "message-b"]);
    expect(state.nextPageMarker).toBe("cursor-a");
    expect(state.hasMore).toBe(true);
  });

  it("setMessagesIfActual ignores stale request versions", () => {
    useFeedStore.getState().setMessages([msg({ uuid: "message-a" })], {
      nextPageMarker: null,
      hasMore: false,
    });
    useFeedStore.setState({ requestVersion: 2 });

    useFeedStore
      .getState()
      .setMessagesIfActual(
        [msg({ uuid: "message-b" })],
        { nextPageMarker: "cursor-b", hasMore: true },
        1,
      );

    expect(useFeedStore.getState().messages.map((message) => message.uuid)).toEqual(["message-a"]);
    expect(useFeedStore.getState().nextPageMarker).toBeNull();
  });

  it("setMessagesIfActual keeps message reference when uuid order is unchanged", () => {
    const initial = [msg({ uuid: "message-a" }), msg({ uuid: "message-b" })];
    useFeedStore.getState().setMessages(initial, { nextPageMarker: null, hasMore: false });
    const beforeRef = useFeedStore.getState().messages;
    useFeedStore.setState({ requestVersion: 1 });

    useFeedStore
      .getState()
      .setMessagesIfActual(
        [
          msg({ uuid: "message-a", markdown: "Edited" }),
          msg({ uuid: "message-b", markdown: "Edited again" }),
        ],
        { nextPageMarker: null, hasMore: false },
        1,
      );

    expect(useFeedStore.getState().messages).toBe(beforeRef);
  });

  it("appendOlder merges Workspace messages without duplicate uuids", () => {
    useFeedStore
      .getState()
      .setMessages([msg({ uuid: "message-b", createdAt: "2026-07-02T10:02:00Z" })], {
        nextPageMarker: "cursor-a",
        hasMore: true,
      });

    useFeedStore
      .getState()
      .appendOlder(
        [
          msg({ uuid: "message-a", createdAt: "2026-07-02T10:01:00Z" }),
          msg({ uuid: "message-b", createdAt: "2026-07-02T10:02:00Z", markdown: "Overlap" }),
        ],
        { nextPageMarker: null, hasMore: false },
      );

    const state = useFeedStore.getState();
    expect(state.messages.map((message) => message.uuid)).toEqual(["message-a", "message-b"]);
    expect(state.nextPageMarker).toBeNull();
    expect(state.hasMore).toBe(false);
  });

  it("appendOlder keeps current message fields when older page contains a duplicate", () => {
    useFeedStore.getState().setMessages(
      [
        msg({
          uuid: "message-b",
          markdown: "Edited current body",
          read: true,
          starred: true,
          createdAt: "2026-07-02T10:02:00Z",
          updatedAt: "2026-07-02T10:05:00Z",
        }),
      ],
      { nextPageMarker: "cursor-a", hasMore: true },
    );

    useFeedStore.getState().appendOlder(
      [
        msg({
          uuid: "message-a",
          createdAt: "2026-07-02T10:01:00Z",
          updatedAt: "2026-07-02T10:01:00Z",
        }),
        msg({
          uuid: "message-b",
          markdown: "Stale older body",
          read: false,
          starred: false,
          createdAt: "2026-07-02T10:02:00Z",
          updatedAt: "2026-07-02T10:03:00Z",
        }),
      ],
      { nextPageMarker: null, hasMore: false },
    );

    const current = useFeedStore
      .getState()
      .messages.find((message) => message.uuid === "message-b");
    expect(current).toMatchObject({
      payload: { kind: "markdown", content: "Edited current body" },
      read: true,
      starred: true,
      updatedAt: "2026-07-02T10:05:00Z",
    });
  });

  it("appendOlder updates pagination when receiving an empty batch", () => {
    useFeedStore.getState().setMessages([msg()], { nextPageMarker: "cursor-a", hasMore: true });
    useFeedStore.getState().appendOlder([], { nextPageMarker: null, hasMore: false });

    expect(useFeedStore.getState().hasMore).toBe(false);
    expect(useFeedStore.getState().nextPageMarker).toBeNull();
  });

  it("clear resets to initial state", () => {
    useFeedStore
      .getState()
      .setMessages([msg()], { nextPageMarker: "cursor-a", hasMore: true }, "owner-a");
    useFeedStore.getState().clear();

    const state = useFeedStore.getState();
    expect(state.ownerKey).toBeNull();
    expect(state.messages).toHaveLength(0);
    expect(state.isInitialLoading).toBe(false);
    expect(state.isRefreshing).toBe(false);
    expect(state.isLoadingMore).toBe(false);
    expect(state.hasMore).toBe(false);
    expect(state.nextPageMarker).toBeNull();
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
});
