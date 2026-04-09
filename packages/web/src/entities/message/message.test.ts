/**
 * Tests for currentChatMessagesStore — the store that holds messages for the
 * currently open chat conversation.
 *
 * Covers context switching (stream/DM/null), message CRUD, flag updates,
 * reactions, content edits, and the pure helpers isMessageForContext and
 * contextFromMessage that route incoming events to the correct conversation.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setInstanceProvider } from "~/shared/api/client";
import type { MockMessage, Reaction, ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  useCurrentChatMessagesStore,
  isMessageForContext,
  contextFromMessage,
  type CurrentChatContext,
} from "./message.model";

function resetStore() {
  useCurrentChatMessagesStore.setState({ context: null, messages: [], pendingOutgoingEchoKeys: [] });
}

function mockMsg(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 1,
    sender_id: 10,
    sender_full_name: "Test User",
    stream_id: 5,
    subject: "general",
    content: "<p>hello</p>",
    timestamp: 1000,
    ...overrides,
  };
}

// Store actions: context switching, message list manipulation, flags, reactions, edits.
describe("currentChatMessagesStore", () => {
  beforeEach(() => {
    const runtimeTestApiKey = `runtime-test-key-${Date.now()}`;
    setInstanceProvider(() => ({
      id: "test-instance",
      realm: "https://zulip.test",
      email: "test@zulip.test",
      apiKey: runtimeTestApiKey,
    }));
    resetStore();
  });
  afterEach(() => {
    setInstanceProvider(() => null);
    resetStore();
  });

  // setContext is called when the user navigates to a different chat.
  describe("setContext", () => {
    // Switching context must clear stale messages from the previous conversation.
    it("sets stream context and clears messages", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg()]);

      useCurrentChatMessagesStore
        .getState()
        .setContext({ type: "stream", streamId: 5, streamName: "general", topic: "topic1" });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.context).toEqual({
        type: "stream",
        streamId: 5,
        streamName: "general",
        topic: "topic1",
      });
      expect(state.messages).toHaveLength(0);
    });

    // DM context uses a composite key of participant IDs.
    it("sets dm context", () => {
      useCurrentChatMessagesStore.getState().setContext({ type: "dm", dmKey: "1,2" });

      expect(useCurrentChatMessagesStore.getState().context).toEqual({
        type: "dm",
        dmKey: "1,2",
      });
    });

    // Null context means no chat is open — used during loading or logout.
    it("clears context when set to null", () => {
      useCurrentChatMessagesStore
        .getState()
        .setContext({ type: "stream", streamId: 5, streamName: "gen", topic: "t" });
      useCurrentChatMessagesStore.getState().setContext(null);

      expect(useCurrentChatMessagesStore.getState().context).toBeNull();
    });

    it("does not restore messages from disk when returning to the same context", () => {
      const streamA: CurrentChatContext = {
        type: "stream",
        streamId: 5,
        streamName: "general",
        topic: "topic-a",
      };
      const streamB: CurrentChatContext = {
        type: "stream",
        streamId: 7,
        streamName: "engineering",
        topic: "topic-b",
      };

      useCurrentChatMessagesStore.getState().setContext(streamA);
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 101, stream_id: 5, subject: "topic-a" })]);

      useCurrentChatMessagesStore.getState().setContext(streamB);
      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(0);
      expect(useCurrentChatMessagesStore.getState().context).toEqual(streamB);

      useCurrentChatMessagesStore.getState().setContext(streamA);
      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(0);
    });

    it("updates topic when navigating between stream locations (merge keeps route topic)", () => {
      const first: CurrentChatContext = {
        type: "stream",
        streamId: 5,
        streamName: "general",
        topic: "release",
      };
      const second: CurrentChatContext = {
        type: "stream",
        streamId: 5,
        streamName: "general",
        topic: "bugs",
      };

      useCurrentChatMessagesStore.getState().setContext(first);
      useCurrentChatMessagesStore.getState().setContext(second);
      expect(useCurrentChatMessagesStore.getState().context).toEqual(second);
    });

    it("does not restore a trimmed slice when revisiting a DM context", () => {
      const dmContext: CurrentChatContext = { type: "dm", dmKey: "10,20" };
      const anotherDmContext: CurrentChatContext = { type: "dm", dmKey: "10,30" };
      const manyMessages = Array.from({ length: 240 }, (_, index) =>
        mockMsg({
          id: index + 1,
          stream_id: null,
          subject: "",
          display_recipient: [
            { id: 10, full_name: "User 10" },
            { id: 20, full_name: "User 20" },
          ],
        }),
      );

      useCurrentChatMessagesStore.getState().setContext(dmContext);
      useCurrentChatMessagesStore.getState().setMessages(manyMessages);

      useCurrentChatMessagesStore.getState().setContext(anotherDmContext);
      useCurrentChatMessagesStore.getState().setContext(dmContext);

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(0);
    });

    it("does not restore optimistic delivery status after context clear without IDB hydrate", () => {
      const dmContext: CurrentChatContext = { type: "dm", dmKey: "10,20" };

      useCurrentChatMessagesStore.getState().setContext(dmContext);
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: -1,
          stream_id: null,
          subject: "",
          display_recipient: [
            { id: 10, full_name: "User 10" },
            { id: 20, full_name: "User 20" },
          ],
          delivery_status: "failed",
        }),
      ]);

      useCurrentChatMessagesStore.getState().setContext(null);
      useCurrentChatMessagesStore.getState().setContext(dmContext);

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(0);
    });
  });

  // setMessages replaces the entire list — used after initial fetch for a conversation.
  describe("setMessages", () => {
    // Full replacement ensures stale messages from a previous context are gone.
    it("replaces all messages", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1 }), mockMsg({ id: 2 })]);

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(2);
    });
  });

  // appendMessage handles live incoming messages from the event loop.
  describe("appendMessage", () => {
    // New messages must appear at the end of the list.
    it("appends a new message to the list", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1 })]);
      useCurrentChatMessagesStore.getState().appendMessage(mockMsg({ id: 2 }));

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(2);
      expect(useCurrentChatMessagesStore.getState().messages[1]!.id).toBe(2);
    });

    // Duplicate events from long-polling must not create duplicate messages.
    it("does not duplicate a message with an existing id", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1 })]);
      useCurrentChatMessagesStore.getState().appendMessage(mockMsg({ id: 1 }));

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
    });

    it("merges richer data when a duplicate message id arrives later", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: 1,
          sender_id: 0,
          sender_full_name: "You",
          stream_id: null,
          content: "optimistic",
        }),
      ]);

      useCurrentChatMessagesStore.getState().appendMessage(
        mockMsg({
          id: 1,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 5,
          subject: "general",
          content: "authoritative",
          flags: ["read"],
        }),
      );

      const msg = useCurrentChatMessagesStore.getState().messages[0]!;
      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
      expect(msg.sender_id).toBe(42);
      expect(msg.stream_id).toBe(5);
      expect(msg.content).toBe("authoritative");
      expect(msg.flags).toEqual(["read"]);
    });
  });

  describe("optimistic outgoing / commitOutgoingMessage", () => {
    it("commitOutgoingMessage replaces optimistic and clears echo queue", () => {
      const me = 42;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: -1, sender_id: me, stream_id: 5, content: "hi" }),
        delivery_status: "sending",
        local_echo_key: -1,
      });
      expect(useCurrentChatMessagesStore.getState().pendingOutgoingEchoKeys).toEqual([-1]);

      useCurrentChatMessagesStore.getState().commitOutgoingMessage(-1, {
        ...mockMsg({ id: 100, sender_id: me, stream_id: 5, content: "<p>hi</p>" }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]!.id).toBe(100);
      expect(state.messages[0]!.delivery_status).toBe("sent");
      expect(state.messages[0]!.local_echo_key).toBe(-1);
      expect(state.pendingOutgoingEchoKeys).toHaveLength(0);
    });

    it("commitOutgoingMessage updates server row when real-time echo merged first", () => {
      const me = 42;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: -1, sender_id: me, content: "x", stream_id: 5 }),
        delivery_status: "sending",
        local_echo_key: -1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: 200, sender_id: me, content: "<p>x</p>", stream_id: 5 }),
      });

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
      expect(useCurrentChatMessagesStore.getState().pendingOutgoingEchoKeys).toEqual([]);

      useCurrentChatMessagesStore.getState().commitOutgoingMessage(-1, {
        ...mockMsg({ id: 200, sender_id: me, content: "<p>x</p>", stream_id: 5 }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]!.id).toBe(200);
      expect(state.messages[0]!.delivery_status).toBe("sent");
      expect(state.messages[0]!.local_echo_key).toBe(-1);
    });

    it("appendMessage merges distinct pendings using queue order and content", () => {
      const me = 99;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: -1, sender_id: me, content: "a", stream_id: 5 }),
        delivery_status: "sending",
        local_echo_key: -1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: -2, sender_id: me, content: "b", stream_id: 5 }),
        delivery_status: "sending",
        local_echo_key: -2,
      });

      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: 301, sender_id: me, content: "<p>a</p>", stream_id: 5 }),
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: 302, sender_id: me, content: "<p>b</p>", stream_id: 5 }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages.map((m) => m.id)).toEqual([301, 302]);
      expect(state.messages[0]!.local_echo_key).toBe(-1);
      expect(state.messages[1]!.local_echo_key).toBe(-2);
      expect(state.pendingOutgoingEchoKeys).toHaveLength(0);
    });

    it("appendMessage pairs identical bodies in FIFO order when echoes arrive in send order", () => {
      const me = 7;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: -1, sender_id: me, content: "ok", stream_id: 5 }),
        delivery_status: "sending",
        local_echo_key: -1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: -2, sender_id: me, content: "ok", stream_id: 5 }),
        delivery_status: "sending",
        local_echo_key: -2,
      });

      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: 401, sender_id: me, content: "<p>ok</p>", stream_id: 5 }),
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: 402, sender_id: me, content: "<p>ok</p>", stream_id: 5 }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages.map((m) => ({ id: m.id, key: m.local_echo_key }))).toEqual([
        { id: 401, key: -1 },
        { id: 402, key: -2 },
      ]);
    });

    it("failed appendMessage removes echo key from queue", () => {
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: -1, sender_id: 1, stream_id: 5, content: "n" }),
        delivery_status: "sending",
        local_echo_key: -1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({ id: -1, sender_id: 1, stream_id: 5, content: "n" }),
        delivery_status: "failed",
        local_echo_key: -1,
      });
      expect(useCurrentChatMessagesStore.getState().pendingOutgoingEchoKeys).toHaveLength(0);
    });
  });

  // removeMessage handles single-message deletion events from the server.
  describe("removeMessage", () => {
    // Only the targeted message must be removed; others stay intact.
    it("removes a single message by id", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1 }), mockMsg({ id: 2 }), mockMsg({ id: 3 })]);

      useCurrentChatMessagesStore.getState().removeMessage(2);

      const ids = useCurrentChatMessagesStore.getState().messages.map((m) => m.id);
      expect(ids).toEqual([1, 3]);
    });

    // Deleting an already-absent message must not throw or change state.
    it("is a no-op for nonexistent message id", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1 })]);
      useCurrentChatMessagesStore.getState().removeMessage(999);

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
    });
  });

  // removeMessages handles bulk deletion (e.g. admin purge of a topic).
  describe("removeMessages", () => {
    // Multiple IDs must be removed in a single update.
    it("removes multiple messages by id", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1 }), mockMsg({ id: 2 }), mockMsg({ id: 3 })]);

      useCurrentChatMessagesStore.getState().removeMessages([1, 3]);

      const ids = useCurrentChatMessagesStore.getState().messages.map((m) => m.id);
      expect(ids).toEqual([2]);
    });

    // Empty array is a valid edge case — must be a safe no-op.
    it("handles empty array gracefully", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1 })]);
      useCurrentChatMessagesStore.getState().removeMessages([]);

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
    });
  });

  // updateMessageFlags handles "read", "starred", etc. flag events from Zulip.
  describe("updateMessageFlags", () => {
    // Adding a flag must only affect targeted messages, not all messages.
    it("adds a flag to specified messages", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1, flags: [] }), mockMsg({ id: 2, flags: [] })]);

      useCurrentChatMessagesStore.getState().updateMessageFlags([1], "read", "add");

      const msgs = useCurrentChatMessagesStore.getState().messages;
      expect(msgs[0]!.flags).toContain("read");
      expect(msgs[1]!.flags).not.toContain("read");
    });

    // Removing a flag must preserve other flags on the same message.
    it("removes a flag from specified messages", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([
          mockMsg({ id: 1, flags: ["read", "starred"] }),
          mockMsg({ id: 2, flags: ["read"] }),
        ]);

      useCurrentChatMessagesStore.getState().updateMessageFlags([1, 2], "read", "remove");

      const msgs = useCurrentChatMessagesStore.getState().messages;
      expect(msgs[0]!.flags).not.toContain("read");
      expect(msgs[0]!.flags).toContain("starred");
      expect(msgs[1]!.flags).not.toContain("read");
    });

    // Idempotency: adding an already-present flag must not create duplicates.
    it("does not duplicate a flag when adding one already present", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1, flags: ["read"] })]);

      useCurrentChatMessagesStore.getState().updateMessageFlags([1], "read", "add");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.flags).toEqual(["read"]);
    });

    // Removing an absent flag must be a safe no-op.
    it("is a no-op when removing a flag that is not present", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1, flags: ["read"] })]);

      useCurrentChatMessagesStore.getState().updateMessageFlags([1], "starred", "remove");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.flags).toEqual(["read"]);
    });
  });

  // Reactions are per-user per-emoji — adding/removing must respect uniqueness.
  describe("updateMessageReaction", () => {
    const reaction: Reaction = {
      emoji_name: "thumbs_up",
      emoji_code: "1f44d",
      reaction_type: "unicode_emoji",
      user_id: 10,
    };

    // A new reaction must be appended to the message's reaction list.
    it("adds a reaction to a message", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1, reactions: [] })]);

      useCurrentChatMessagesStore.getState().updateMessageReaction(1, reaction, "add");

      const reactions = useCurrentChatMessagesStore.getState().messages[0]!.reactions;
      expect(reactions).toHaveLength(1);
      expect(reactions![0]!.emoji_name).toBe("thumbs_up");
    });

    // Same user reacting twice with the same emoji must not create a duplicate.
    it("does not duplicate a reaction from the same user", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1, reactions: [reaction] })]);

      useCurrentChatMessagesStore.getState().updateMessageReaction(1, reaction, "add");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.reactions).toHaveLength(1);
    });

    // Removal matches on both emoji_name and user_id — other users' reactions stay.
    it("removes a reaction by emoji_name and user_id", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1, reactions: [reaction] })]);

      useCurrentChatMessagesStore.getState().updateMessageReaction(1, reaction, "remove");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.reactions).toHaveLength(0);
    });

    // Multiple users reacting with the same emoji must each have their own entry.
    it("allows different users to react with the same emoji", () => {
      const reaction2: Reaction = { ...reaction, user_id: 20 };
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1, reactions: [reaction] })]);

      useCurrentChatMessagesStore.getState().updateMessageReaction(1, reaction2, "add");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.reactions).toHaveLength(2);
    });
  });

  // updateMessageContent handles server-side message edits.
  describe("updateMessageContent", () => {
    // Edited content must replace the old content for the correct message.
    it("updates the content of a message by id", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1, content: "old" })]);

      useCurrentChatMessagesStore.getState().updateMessageContent(1, "new content");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.content).toBe("new content");
    });

    // Editing one message must not mutate any other message's content.
    it("does not affect other messages", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1, content: "a" }), mockMsg({ id: 2, content: "b" })]);

      useCurrentChatMessagesStore.getState().updateMessageContent(1, "updated");

      expect(useCurrentChatMessagesStore.getState().messages[1]!.content).toBe("b");
    });

    it("updates markdown_source when the third argument is provided", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1, content: "<p>o</p>", markdown_source: "old" })]);

      useCurrentChatMessagesStore.getState().updateMessageContent(1, "<p>n</p>", "new");

      const m = useCurrentChatMessagesStore.getState().messages[0]!;
      expect(m.content).toBe("<p>n</p>");
      expect(m.markdown_source).toBe("new");
    });

    it("preserves markdown_source when the third argument is omitted", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1, markdown_source: "keep" })]);

      useCurrentChatMessagesStore.getState().updateMessageContent(1, "<p>only html</p>");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.markdown_source).toBe("keep");
    });
  });
});

// ---------------------------------------------------------------------------
// Pure helper functions — these determine whether an incoming event belongs
// to the currently open conversation. Routing errors cause missed or ghost messages.
// ---------------------------------------------------------------------------

// isMessageForContext is the gate that decides if a live event updates the current view.
describe("isMessageForContext", () => {
  const streamCtx: CurrentChatContext = {
    type: "stream",
    streamId: 5,
    streamName: "general",
    topic: "topic1",
  };
  const dmCtx: CurrentChatContext = { type: "dm", dmKey: "1,2" };

  // Exact match on stream_id + topic must route the message to the open chat.
  it("returns true for matching stream message", () => {
    expect(
      isMessageForContext({ type: "stream", stream_id: 5, subject: "topic1" }, streamCtx, null),
    ).toBe(true);
  });

  // Wrong topic must be rejected — messages go to a different conversation.
  it("returns false for stream message with wrong topic", () => {
    expect(
      isMessageForContext({ type: "stream", stream_id: 5, subject: "other" }, streamCtx, null),
    ).toBe(false);
  });

  // Wrong stream_id must be rejected even if topic matches.
  it("returns false for stream message with wrong stream_id", () => {
    expect(
      isMessageForContext({ type: "stream", stream_id: 99, subject: "topic1" }, streamCtx, null),
    ).toBe(false);
  });

  // Zulip uses empty string for the default topic — we normalize to "general".
  it("uses 'general' as default topic when subject is empty", () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "gen",
      topic: "general",
    };
    expect(isMessageForContext({ type: "stream", stream_id: 5, subject: "" }, ctx, null)).toBe(
      true,
    );
  });

  // DM matching uses a sorted key of participant IDs.
  it("returns true for matching DM message", () => {
    expect(
      isMessageForContext(
        { type: "private", display_recipient: [{ id: 1 }, { id: 2 }] },
        dmCtx,
        null,
      ),
    ).toBe(true);
  });

  // Different recipient set means a different DM conversation.
  it("returns false for DM message with wrong recipients", () => {
    expect(
      isMessageForContext(
        { type: "private", display_recipient: [{ id: 1 }, { id: 3 }] },
        dmCtx,
        null,
      ),
    ).toBe(false);
  });

  // Stream messages must never match a DM context — type mismatch.
  it("returns false for non-private message against DM context", () => {
    expect(isMessageForContext({ type: "stream", stream_id: 5, subject: "t" }, dmCtx, null)).toBe(
      false,
    );
  });

  // Null context means no chat is open — all messages must be rejected.
  it("returns false when context is null", () => {
    expect(isMessageForContext({ type: "stream", stream_id: 5, subject: "t" }, null, null)).toBe(
      false,
    );
  });

  it("returns true for any topic in stream when streamWideView is set", () => {
    const wideCtx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "eng",
      topic: "general",
      streamWideView: true,
    };
    expect(
      isMessageForContext({ type: "stream", stream_id: 5, subject: "anything" }, wideCtx, null),
    ).toBe(true);
  });
});

// contextFromMessage converts a raw Zulip message into a CurrentChatContext
// for navigation — e.g. clicking a notification opens the right conversation.
describe("contextFromMessage", () => {
  // Stream messages produce a context with streamId, streamName, and topic.
  it("creates stream context from a stream message", () => {
    const msg: ZulipRawMessage = {
      id: 1,
      sender_id: 10,
      content: "test",
      timestamp: 1000,
      type: "stream",
      stream_id: 5,
      display_recipient: "general",
      subject: "topic1",
    };

    const ctx = contextFromMessage(msg, null);
    expect(ctx).toEqual({
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    });
  });

  // Empty subject must be normalized to "general" to match context comparison logic.
  it("uses 'general' as default topic for stream messages with empty subject", () => {
    const msg: ZulipRawMessage = {
      id: 1,
      sender_id: 10,
      content: "test",
      timestamp: 1000,
      type: "stream",
      stream_id: 5,
      display_recipient: "chan",
      subject: "",
    };

    const ctx = contextFromMessage(msg, null);
    expect(ctx).not.toBeNull();
    if (ctx?.type === "stream") {
      expect(ctx.topic).toBe("general");
    }
  });

  // Private messages produce a DM context with a sorted participant key.
  it("creates DM context from a private message", () => {
    const msg: ZulipRawMessage = {
      id: 2,
      sender_id: 10,
      content: "hi",
      timestamp: 1000,
      type: "private",
      display_recipient: [
        { id: 10, full_name: "A" },
        { id: 20, full_name: "B" },
      ],
    };

    const ctx = contextFromMessage(msg, 10);
    expect(ctx).toEqual({ type: "dm", dmKey: "10,20" });
  });

  // Unknown message types (e.g. future Zulip extensions) must return null safely.
  it("returns null for a message with no valid type", () => {
    const msg: ZulipRawMessage = {
      id: 3,
      sender_id: 10,
      content: "?",
      timestamp: 1000,
      type: "unknown",
    };

    expect(contextFromMessage(msg, null)).toBeNull();
  });

  // Malformed stream messages (null stream_id) must be safely rejected.
  it("returns null for stream message with null stream_id", () => {
    const msg: ZulipRawMessage = {
      id: 4,
      sender_id: 10,
      content: "?",
      timestamp: 1000,
      type: "stream",
      stream_id: null,
    };

    expect(contextFromMessage(msg, null)).toBeNull();
  });
});
