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
import type { MockMessage, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
import {
  useCurrentChatMessagesStore,
  isMessageForContext,
  contextFromMessage,
  type CurrentChatContext,
} from "./message.model";

type MockMessageOverrides = Partial<Omit<MockMessage, "id">> & {
  id?: MockMessage["id"] | number;
};

const LOCAL_ECHO_1 = testMessageId(900001);
const LOCAL_ECHO_2 = testMessageId(900002);

function resetStore() {
  useCurrentChatMessagesStore.setState({
    context: null,
    messages: [],
    pendingOutgoingEchoKeys: [],
    isLoadingNewer: false,
  });
}

function mockMsg(overrides: MockMessageOverrides = {}): MockMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 1),
    sender_id: 10,
    sender_full_name: "Test User",
    stream_uuid: "00000000-0000-4000-8000-000000000005",
    subject: "general",
    content: "<p>hello</p>",
    timestamp: 1000,
    ...rest,
  };
}

// Store actions: context switching, message list manipulation, flags, reactions, edits.
describe("currentChatMessagesStore", () => {
  beforeEach(() => {
    const runtimeTestApiKey = `runtime-test-key-${Date.now()}`;
    setInstanceProvider(() => ({
      id: "test-instance",
      realm: "https://messenger.test",
      login: "test@messenger.test",
      authType: "iam",
      iamAccessToken: runtimeTestApiKey,
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

      useCurrentChatMessagesStore.getState().setContext({
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "general",
        topic: "topic1",
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.context).toEqual({
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
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
      useCurrentChatMessagesStore.getState().setContext({
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "gen",
        topic: "t",
      });
      useCurrentChatMessagesStore.getState().setContext(null);

      expect(useCurrentChatMessagesStore.getState().context).toBeNull();
    });

    it("does not restore messages from disk when returning to the same context", () => {
      const streamA: CurrentChatContext = {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "general",
        topic: "topic-a",
      };
      const streamB: CurrentChatContext = {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000007",
        streamName: "engineering",
        topic: "topic-b",
      };

      useCurrentChatMessagesStore.getState().setContext(streamA);
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000101",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "topic-a",
        }),
      ]);

      useCurrentChatMessagesStore.getState().setContext(streamB);
      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(0);
      expect(useCurrentChatMessagesStore.getState().context).toEqual(streamB);

      useCurrentChatMessagesStore.getState().setContext(streamA);
      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(0);
    });

    it("updates topic when navigating between stream locations (merge keeps route topic)", () => {
      const first: CurrentChatContext = {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "general",
        topic: "release",
      };
      const second: CurrentChatContext = {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "general",
        topic: "bugs",
      };

      useCurrentChatMessagesStore.getState().setContext(first);
      useCurrentChatMessagesStore.getState().setContext(second);
      expect(useCurrentChatMessagesStore.getState().context).toEqual(second);
    });

    it("does not clear messages when setContext targets the same stream-wide location", () => {
      const ctx: CurrentChatContext = {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "general",
        topic: "",
        streamWideView: true,
      };
      useCurrentChatMessagesStore.getState().setContext(ctx);
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "bugs",
        }),
      ]);

      useCurrentChatMessagesStore.getState().setContext({ ...ctx });

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
    });

    it("updates streamName on same location without clearing messages", () => {
      const ctx: CurrentChatContext = {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "old-name",
        topic: "",
        streamWideView: true,
      };
      useCurrentChatMessagesStore.getState().setContext(ctx);
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "bugs",
        }),
      ]);

      useCurrentChatMessagesStore.getState().setContext({
        ...ctx,
        streamName: "general",
      });

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
      const state = useCurrentChatMessagesStore.getState();
      expect(state.context?.type).toBe("stream");
      if (state.context?.type === "stream") {
        expect(state.context.streamName).toBe("general");
      }
    });

    it("updates topic display name for same topic UUID without clearing messages", () => {
      const topicUuid = "00000000-0000-4000-8000-0000000000d0";
      const ctx: CurrentChatContext = {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "general",
        topic: "incident",
        topicUuid,
      };
      useCurrentChatMessagesStore.getState().setContext(ctx);
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
          topic_uuid: topicUuid,
        }),
      ]);

      useCurrentChatMessagesStore.getState().setContext({
        ...ctx,
        topic: "postmortem",
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.context?.type).toBe("stream");
      if (state.context?.type === "stream") {
        expect(state.context.topic).toBe("postmortem");
        expect(state.context.topicUuid).toBe(topicUuid);
      }
    });

    it("does not restore a trimmed slice when revisiting a DM context", () => {
      const dmContext: CurrentChatContext = { type: "dm", dmKey: "10,20" };
      const anotherDmContext: CurrentChatContext = { type: "dm", dmKey: "10,30" };
      const manyMessages = Array.from({ length: 240 }, (_, index) =>
        mockMsg({
          id: index + 1,
          stream_uuid: null,
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
          id: "00000000-0000-4000-8000-0000000000n1",
          stream_uuid: null,
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
      expect(useCurrentChatMessagesStore.getState().messages[1]!.id).toBe(testMessageId(2));
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
          id: "00000000-0000-4000-8000-000000000001",
          sender_id: 0,
          sender_full_name: "You",
          stream_uuid: null,
          content: "optimistic",
        }),
      ]);

      useCurrentChatMessagesStore.getState().appendMessage(
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          sender_id: 42,
          sender_full_name: "Alice",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "general",
          content: "authoritative",
          flags: ["read"],
        }),
      );

      const msg = useCurrentChatMessagesStore.getState().messages[0]!;
      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
      expect(msg.sender_id).toBe(42);
      expect(msg.stream_uuid).toBe("00000000-0000-4000-8000-000000000005");
      expect(msg.content).toBe("authoritative");
      expect(msg.flags).toEqual(["read"]);
    });
  });

  describe("optimistic outgoing / commitOutgoingMessage", () => {
    it("commitOutgoingMessage replaces optimistic and clears echo queue", () => {
      const me = 42;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_1,
          sender_id: me,
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          content: "hi",
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_1,
      });
      expect(useCurrentChatMessagesStore.getState().pendingOutgoingEchoKeys).toEqual([
        LOCAL_ECHO_1,
      ]);

      useCurrentChatMessagesStore.getState().commitOutgoingMessage(LOCAL_ECHO_1, {
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000100",
          sender_id: me,
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          content: "<p>hi</p>",
        }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]!.id).toBe(testMessageId(100));
      expect(state.messages[0]!.delivery_status).toBe("sent");
      expect(state.messages[0]!.local_echo_key).toBe(LOCAL_ECHO_1);
      expect(state.pendingOutgoingEchoKeys).toHaveLength(0);
    });

    it("commitOutgoingMessage preserves link_preview from optimistic row", () => {
      const me = 42;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_1,
          sender_id: me,
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          content: "https://example.com",
          link_preview: { targetUrl: "https://example.com", title: "Example" },
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_1,
      });

      useCurrentChatMessagesStore.getState().commitOutgoingMessage(LOCAL_ECHO_1, {
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000100",
          sender_id: me,
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          content: "https://example.com",
        }),
      });

      const previews =
        useCurrentChatMessagesStore.getState().messages[0]!.link_previews ??
        (useCurrentChatMessagesStore.getState().messages[0]!.link_preview
          ? [useCurrentChatMessagesStore.getState().messages[0]!.link_preview!]
          : []);
      expect(previews[0]?.title).toBe("Example");
    });

    it("commitOutgoingMessage updates server row when real-time echo merged first", () => {
      const me = 42;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_1,
          sender_id: me,
          content: "x",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000200",
          sender_id: me,
          content: "<p>x</p>",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
      expect(useCurrentChatMessagesStore.getState().pendingOutgoingEchoKeys).toEqual([]);

      useCurrentChatMessagesStore.getState().commitOutgoingMessage(LOCAL_ECHO_1, {
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000200",
          sender_id: me,
          content: "<p>x</p>",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]!.id).toBe(testMessageId(200));
      expect(state.messages[0]!.delivery_status).toBe("sent");
      expect(state.messages[0]!.local_echo_key).toBe(LOCAL_ECHO_1);
    });

    it("commitOutgoingMessage collapses optimistic+server duplicates when content match fails", () => {
      const me = 42;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_1,
          sender_id: me,
          content: "emoji :party_parrot: /user_uploads/1/private.png",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000777",
          sender_id: me,
          content:
            '<p>emoji <img class="emoji" alt=":party_parrot:" src="/static/generated/emoji/parrot.png"></p><div class="message_inline_image"><img src="/spinner.png"></div>',
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(2);
      expect(useCurrentChatMessagesStore.getState().pendingOutgoingEchoKeys).toEqual([
        LOCAL_ECHO_1,
      ]);

      useCurrentChatMessagesStore.getState().commitOutgoingMessage(LOCAL_ECHO_1, {
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000777",
          sender_id: me,
          content: "<p>emoji delivered</p>",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]!.id).toBe(testMessageId(777));
      expect(state.messages[0]!.delivery_status).toBe("sent");
      expect(state.messages[0]!.local_echo_key).toBe(LOCAL_ECHO_1);
      expect(state.pendingOutgoingEchoKeys).toEqual([]);
    });

    it("commitOutgoingMessage keeps a single row on repeated updates after duplicate collapse", () => {
      const me = 42;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_1,
          sender_id: me,
          content: "emoji :party_parrot:",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000778",
          sender_id: me,
          content: '<p>emoji <img class="emoji" alt=":party_parrot:" src="/emoji.png"></p>',
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });

      useCurrentChatMessagesStore.getState().commitOutgoingMessage(LOCAL_ECHO_1, {
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000778",
          sender_id: me,
          content: "<p>first canonical</p>",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });
      useCurrentChatMessagesStore.getState().commitOutgoingMessage(LOCAL_ECHO_1, {
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000778",
          sender_id: me,
          content: "<p>second canonical update</p>",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          flags: ["read"],
        }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]!.id).toBe(testMessageId(778));
      expect(state.messages[0]!.content).toBe("<p>second canonical update</p>");
      expect(state.messages[0]!.local_echo_key).toBe(LOCAL_ECHO_1);
      expect(state.messages[0]!.flags).toEqual(["read"]);
      expect(state.pendingOutgoingEchoKeys).toEqual([]);
    });

    it("appendMessage merges distinct pendings using queue order and content", () => {
      const me = 99;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_1,
          sender_id: me,
          content: "a",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_2,
          sender_id: me,
          content: "b",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_2,
      });

      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000301",
          sender_id: me,
          content: "<p>a</p>",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000302",
          sender_id: me,
          content: "<p>b</p>",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages.map((m) => m.id)).toEqual([testMessageId(301), testMessageId(302)]);
      expect(state.messages[0]!.local_echo_key).toBe(LOCAL_ECHO_1);
      expect(state.messages[1]!.local_echo_key).toBe(LOCAL_ECHO_2);
      expect(state.pendingOutgoingEchoKeys).toHaveLength(0);
    });

    it("appendMessage pairs identical bodies in FIFO order when echoes arrive in send order", () => {
      const me = 7;
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_1,
          sender_id: me,
          content: "ok",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_2,
          sender_id: me,
          content: "ok",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_2,
      });

      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000401",
          sender_id: me,
          content: "<p>ok</p>",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: "00000000-0000-4000-8000-000000000402",
          sender_id: me,
          content: "<p>ok</p>",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.messages.map((m) => ({ id: m.id, key: m.local_echo_key }))).toEqual([
        { id: testMessageId(401), key: LOCAL_ECHO_1 },
        { id: testMessageId(402), key: LOCAL_ECHO_2 },
      ]);
    });

    it("failed appendMessage removes echo key from queue", () => {
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_1,
          sender_id: 1,
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          content: "n",
        }),
        delivery_status: "sending",
        local_echo_key: LOCAL_ECHO_1,
      });
      useCurrentChatMessagesStore.getState().appendMessage({
        ...mockMsg({
          id: LOCAL_ECHO_1,
          sender_id: 1,
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          content: "n",
        }),
        delivery_status: "failed",
        local_echo_key: LOCAL_ECHO_1,
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

      useCurrentChatMessagesStore.getState().removeMessage("00000000-0000-4000-8000-000000000002");

      const ids = useCurrentChatMessagesStore.getState().messages.map((m) => m.id);
      expect(ids).toEqual([testMessageId(1), testMessageId(3)]);
    });

    // Deleting an already-absent message must not throw or change state.
    it("is a no-op for nonexistent message id", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1 })]);
      useCurrentChatMessagesStore.getState().removeMessage("00000000-0000-4000-8000-000000000999");

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

      useCurrentChatMessagesStore
        .getState()
        .removeMessages([
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000003",
        ]);

      const ids = useCurrentChatMessagesStore.getState().messages.map((m) => m.id);
      expect(ids).toEqual([testMessageId(2)]);
    });

    // Empty array is a valid edge case — must be a safe no-op.
    it("handles empty array gracefully", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1 })]);
      useCurrentChatMessagesStore.getState().removeMessages([]);

      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(1);
    });
  });

  // updateMessageFlags handles "read", "starred", etc. flag events from the messenger API.
  describe("updateMessageFlags", () => {
    // Adding a flag must only affect targeted messages, not all messages.
    it("adds a flag to specified messages", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([
          mockMsg({ id: "00000000-0000-4000-8000-000000000001", flags: [] }),
          mockMsg({ id: "00000000-0000-4000-8000-000000000002", flags: [] }),
        ]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageFlags(["00000000-0000-4000-8000-000000000001"], "read", "add");

      const msgs = useCurrentChatMessagesStore.getState().messages;
      expect(msgs[0]!.flags).toContain("read");
      expect(msgs[1]!.flags).not.toContain("read");
    });

    // Removing a flag must preserve other flags on the same message.
    it("removes a flag from specified messages", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([
          mockMsg({ id: "00000000-0000-4000-8000-000000000001", flags: ["read", "starred"] }),
          mockMsg({ id: "00000000-0000-4000-8000-000000000002", flags: ["read"] }),
        ]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageFlags(
          ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
          "read",
          "remove",
        );

      const msgs = useCurrentChatMessagesStore.getState().messages;
      expect(msgs[0]!.flags).not.toContain("read");
      expect(msgs[0]!.flags).toContain("starred");
      expect(msgs[1]!.flags).not.toContain("read");
    });

    // Idempotency: adding an already-present flag must not create duplicates.
    it("does not duplicate a flag when adding one already present", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: "00000000-0000-4000-8000-000000000001", flags: ["read"] })]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageFlags(["00000000-0000-4000-8000-000000000001"], "read", "add");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.flags).toEqual(["read"]);
    });

    // Removing an absent flag must be a safe no-op.
    it("is a no-op when removing a flag that is not present", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: "00000000-0000-4000-8000-000000000001", flags: ["read"] })]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageFlags(["00000000-0000-4000-8000-000000000001"], "starred", "remove");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.flags).toEqual(["read"]);
    });
  });

  // Reactions are aggregate emoji counters from the Workspace API.
  describe("updateMessageReaction", () => {
    it("increments a reaction counter on a message", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: "00000000-0000-4000-8000-000000000001", reactions: {} })]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageReaction("00000000-0000-4000-8000-000000000001", "thumbs_up", "add");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.reactions).toEqual({
        thumbs_up: 1,
      });
    });

    it("increments an existing reaction counter", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          reactions: { thumbs_up: 1 },
        }),
      ]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageReaction("00000000-0000-4000-8000-000000000001", "thumbs_up", "add");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.reactions).toEqual({
        thumbs_up: 2,
      });
    });

    it("removes the counter when it reaches zero", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          reactions: { thumbs_up: 1 },
        }),
      ]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageReaction("00000000-0000-4000-8000-000000000001", "thumbs_up", "remove");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.reactions).toEqual({});
    });

    it("keeps removing an absent reaction as a no-op", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: "00000000-0000-4000-8000-000000000001", reactions: {} })]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageReaction("00000000-0000-4000-8000-000000000001", "thumbs_up", "remove");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.reactions).toEqual({});
    });
  });

  // updateMessageContent handles server-side message edits.
  describe("updateMessageContent", () => {
    // Edited content must replace the old content for the correct message.
    it("updates the content of a message by id", () => {
      useCurrentChatMessagesStore.getState().setMessages([mockMsg({ id: 1, content: "old" })]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageContent("00000000-0000-4000-8000-000000000001", "new content");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.content).toBe("new content");
    });

    // Editing one message must not mutate any other message's content.
    it("does not affect other messages", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1, content: "a" }), mockMsg({ id: 2, content: "b" })]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageContent("00000000-0000-4000-8000-000000000001", "updated");

      expect(useCurrentChatMessagesStore.getState().messages[1]!.content).toBe("b");
    });

    it("updates markdown_source when the third argument is provided", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          content: "<p>o</p>",
          markdown_source: "old",
        }),
      ]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageContent("00000000-0000-4000-8000-000000000001", "<p>n</p>", "new");

      const m = useCurrentChatMessagesStore.getState().messages[0]!;
      expect(m.content).toBe("<p>n</p>");
      expect(m.markdown_source).toBe("new");
    });

    it("preserves markdown_source when the third argument is omitted", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([
          mockMsg({ id: "00000000-0000-4000-8000-000000000001", markdown_source: "keep" }),
        ]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageContent("00000000-0000-4000-8000-000000000001", "<p>only html</p>");

      expect(useCurrentChatMessagesStore.getState().messages[0]!.markdown_source).toBe("keep");
    });

    it("drops link_previews for URLs removed from edited markdown", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: 1,
          content: "https://stay.test",
          link_previews: [
            { targetUrl: "https://stay.test", title: "Stay" },
            { targetUrl: "https://gone.test", title: "Gone" },
          ],
        }),
      ]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageContent("00000000-0000-4000-8000-000000000001", "https://stay.test");

      const previews = useCurrentChatMessagesStore.getState().messages[0]!.link_previews;
      expect(previews?.map((p) => p.targetUrl)).toEqual(["https://stay.test"]);
    });

    it("clears optimistic edit state when server content arrives", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          content: "local",
          markdown_source: "local",
          edit_status: "saving",
          pending_edit_markdown: "local",
          previous_content: "old",
          previous_markdown_source: "old",
          edit_error: "failed",
        }),
      ]);

      useCurrentChatMessagesStore
        .getState()
        .updateMessageContent("00000000-0000-4000-8000-000000000001", "server", "server");

      const message = useCurrentChatMessagesStore.getState().messages[0]!;
      expect(message.content).toBe("server");
      expect(message.markdown_source).toBe("server");
      expect(message.edit_status).toBeUndefined();
      expect(message.pending_edit_markdown).toBeUndefined();
      expect(message.previous_content).toBeUndefined();
      expect(message.edit_error).toBeUndefined();
    });
  });

  describe("optimistic message edit", () => {
    it("applies optimistic markdown and remembers previous body", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          content: "<p>old</p>",
          markdown_source: "old",
        }),
      ]);

      useCurrentChatMessagesStore
        .getState()
        .applyOptimisticMessageEdit("00000000-0000-4000-8000-000000000001", "new **body**");

      const message = useCurrentChatMessagesStore.getState().messages[0]!;
      expect(message.content).toBe("new **body**");
      expect(message.markdown_source).toBe("new **body**");
      expect(message.edit_status).toBe("saving");
      expect(message.pending_edit_markdown).toBe("new **body**");
      expect(message.previous_content).toBe("<p>old</p>");
      expect(message.previous_markdown_source).toBe("old");
    });

    it("commits optimistic edit with server message", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          content: "local",
          markdown_source: "local",
          edit_status: "saving",
          pending_edit_markdown: "local",
          previous_content: "old",
        }),
      ]);

      useCurrentChatMessagesStore.getState().commitOptimisticMessageEdit(
        "00000000-0000-4000-8000-000000000001",
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          content: "<p>server</p>",
          markdown_source: "server",
        }),
      );

      const message = useCurrentChatMessagesStore.getState().messages[0]!;
      expect(message.content).toBe("<p>server</p>");
      expect(message.markdown_source).toBe("server");
      expect(message.edit_status).toBeUndefined();
      expect(message.previous_content).toBeUndefined();
    });

    it("marks optimistic edit failed while keeping edited body", () => {
      useCurrentChatMessagesStore
        .getState()
        .setMessages([mockMsg({ id: 1, content: "new", edit_status: "saving" })]);

      useCurrentChatMessagesStore
        .getState()
        .failOptimisticMessageEdit("00000000-0000-4000-8000-000000000001", "server rejected");

      const message = useCurrentChatMessagesStore.getState().messages[0]!;
      expect(message.content).toBe("new");
      expect(message.edit_status).toBe("failed");
      expect(message.edit_error).toBe("server rejected");
    });

    it("cancels failed optimistic edit and restores previous body", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          content: "new",
          markdown_source: "new",
          edit_status: "failed",
          pending_edit_markdown: "new",
          previous_content: "<p>old</p>",
          previous_markdown_source: "old",
          edit_error: "server rejected",
        }),
      ]);

      useCurrentChatMessagesStore
        .getState()
        .cancelFailedMessageEdit("00000000-0000-4000-8000-000000000001");

      const message = useCurrentChatMessagesStore.getState().messages[0]!;
      expect(message.content).toBe("<p>old</p>");
      expect(message.markdown_source).toBe("old");
      expect(message.edit_status).toBeUndefined();
      expect(message.pending_edit_markdown).toBeUndefined();
      expect(message.previous_content).toBeUndefined();
      expect(message.edit_error).toBeUndefined();
    });
  });

  describe("moveStreamTopicMessages", () => {
    it("moves message subjects from old topic to new topic", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
        }),
        mockMsg({
          id: "00000000-0000-4000-8000-000000000002",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
        }),
        mockMsg({
          id: "00000000-0000-4000-8000-000000000003",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "other",
        }),
      ]);

      useCurrentChatMessagesStore.getState().moveStreamTopicMessages({
        streamId: "00000000-0000-4000-8000-000000000005",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
      });

      const messages = useCurrentChatMessagesStore.getState().messages;
      expect(messages[0]!.subject).toBe("\u2714 incident");
      expect(messages[1]!.subject).toBe("\u2714 incident");
      expect(messages[2]!.subject).toBe("other");
    });

    it("atomically switches active narrow stream topic context", () => {
      useCurrentChatMessagesStore.getState().setContext({
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "engineering",
        topic: "incident",
      });
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
        }),
      ]);

      useCurrentChatMessagesStore.getState().moveStreamTopicMessages({
        streamId: "00000000-0000-4000-8000-000000000005",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: ["00000000-0000-4000-8000-000000000001"],
        anchorMessageId: "00000000-0000-4000-8000-000000000001",
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.context?.type).toBe("stream");
      if (state.context?.type !== "stream") return;
      expect(state.context.topic).toBe("\u2714 incident");
      expect(state.messages[0]!.subject).toBe("\u2714 incident");
    });

    it("does not switch context for stream-wide mode", () => {
      useCurrentChatMessagesStore.getState().setContext({
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000005",
        streamName: "engineering",
        topic: "incident",
        streamWideView: true,
      });
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
        }),
      ]);

      useCurrentChatMessagesStore.getState().moveStreamTopicMessages({
        streamId: "00000000-0000-4000-8000-000000000005",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: ["00000000-0000-4000-8000-000000000001"],
        anchorMessageId: "00000000-0000-4000-8000-000000000001",
      });

      const state = useCurrentChatMessagesStore.getState();
      expect(state.context?.type).toBe("stream");
      if (state.context?.type !== "stream") return;
      expect(state.context.streamWideView).toBe(true);
      expect(state.context.topic).toBe("incident");
      expect(state.messages[0]!.subject).toBe("\u2714 incident");
    });

    it("does not bulk-move by stream/topic when messageIds miss loaded slice", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000101",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
        }),
        mockMsg({
          id: "00000000-0000-4000-8000-000000000102",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
        }),
      ]);

      useCurrentChatMessagesStore.getState().moveStreamTopicMessages({
        streamId: "00000000-0000-4000-8000-000000000005",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: ["00000000-0000-4000-8000-000000999999"],
      });

      const messages = useCurrentChatMessagesStore.getState().messages;
      expect(messages.map((message) => message.subject)).toEqual(["incident", "incident"]);
    });

    it("deduplicates messageIds with anchor and moves only targeted ids", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
        }),
        mockMsg({
          id: "00000000-0000-4000-8000-000000000002",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
        }),
        mockMsg({
          id: "00000000-0000-4000-8000-000000000003",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
        }),
      ]);

      useCurrentChatMessagesStore.getState().moveStreamTopicMessages({
        streamId: "00000000-0000-4000-8000-000000000005",
        oldTopic: "incident",
        newTopic: "\u2714 incident",
        messageIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
          "00000000-0000-4000-8000-000000000001",
        ],
        anchorMessageId: "00000000-0000-4000-8000-000000000002",
      });

      const messages = useCurrentChatMessagesStore.getState().messages;
      expect(messages.map((message) => message.subject)).toEqual([
        "\u2714 incident",
        "\u2714 incident",
        "incident",
      ]);
    });
  });

  describe("moveTopicToStreamMessages", () => {
    it("updates stream_id and subject for targeted messages", () => {
      useCurrentChatMessagesStore.getState().setMessages([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000001",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
          channel: "eng",
        }),
        mockMsg({
          id: "00000000-0000-4000-8000-000000000002",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "incident",
          channel: "eng",
        }),
      ]);

      useCurrentChatMessagesStore.getState().moveTopicToStreamMessages({
        sourceStreamId: "00000000-0000-4000-8000-000000000005",
        targetStreamId: "00000000-0000-4000-8000-000000000009",
        targetStreamName: "dev",
        oldTopic: "incident",
        newTopic: "incident",
        messageIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        anchorMessageId: "00000000-0000-4000-8000-000000000001",
      });

      const messages = useCurrentChatMessagesStore.getState().messages;
      expect(
        messages.every((message) => message.stream_uuid === "00000000-0000-4000-8000-000000000009"),
      ).toBe(true);
      expect(messages.every((message) => message.channel === "dev")).toBe(true);
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
    streamId: "00000000-0000-4000-8000-000000000005",
    streamName: "general",
    topic: "topic1",
  };
  const dmCtx: CurrentChatContext = { type: "dm", dmKey: "1,2" };

  // Exact match on stream_id + topic must route the message to the open chat.
  it("returns true for matching stream message", () => {
    expect(
      isMessageForContext(
        { type: "stream", stream_uuid: "00000000-0000-4000-8000-000000000005", subject: "topic1" },
        streamCtx,
        null,
      ),
    ).toBe(true);
  });

  // Wrong topic must be rejected — messages go to a different conversation.
  it("returns false for stream message with wrong topic", () => {
    expect(
      isMessageForContext(
        { type: "stream", stream_uuid: "00000000-0000-4000-8000-000000000005", subject: "other" },
        streamCtx,
        null,
      ),
    ).toBe(false);
  });

  // Wrong stream_id must be rejected even if topic matches.
  it("returns false for stream message with wrong stream_id", () => {
    expect(
      isMessageForContext(
        { type: "stream", stream_uuid: "00000000-0000-4000-8000-000000000099", subject: "topic1" },
        streamCtx,
        null,
      ),
    ).toBe(false);
  });

  // Empty subject must stay empty to avoid colliding with literal "general" topic.
  it("does not match literal 'general' context when subject is empty", () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "gen",
      topic: "general",
    };
    expect(
      isMessageForContext(
        { type: "stream", stream_uuid: "00000000-0000-4000-8000-000000000005", subject: "" },
        ctx,
        null,
      ),
    ).toBe(false);
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
    expect(
      isMessageForContext(
        { type: "stream", stream_uuid: "00000000-0000-4000-8000-000000000005", subject: "t" },
        dmCtx,
        null,
      ),
    ).toBe(false);
  });

  // Null context means no chat is open — all messages must be rejected.
  it("returns false when context is null", () => {
    expect(
      isMessageForContext(
        { type: "stream", stream_uuid: "00000000-0000-4000-8000-000000000005", subject: "t" },
        null,
        null,
      ),
    ).toBe(false);
  });

  it("returns true for any topic in stream when streamWideView is set", () => {
    const wideCtx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "eng",
      topic: "general",
      streamWideView: true,
    };
    expect(
      isMessageForContext(
        {
          type: "stream",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "anything",
        },
        wideCtx,
        null,
      ),
    ).toBe(true);
  });
});

// contextFromMessage converts a raw messenger message into a CurrentChatContext
// for navigation — e.g. clicking a notification opens the right conversation.
describe("contextFromMessage", () => {
  // Stream messages produce a context with streamId, streamName, and topic.
  it("creates stream context from a stream message", () => {
    const msg: WorkspaceRawMessage = {
      id: "00000000-0000-4000-8000-000000000001",
      sender_id: 10,
      content: "test",
      timestamp: 1000,
      type: "stream",
      stream_uuid: "00000000-0000-4000-8000-000000000005",
      display_recipient: "general",
      subject: "topic1",
    };

    const ctx = contextFromMessage(msg, null);
    expect(ctx).toEqual({
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "topic1",
    });
  });

  it("uses topic uuid for stream messages without topic subject", () => {
    const topicUuid = "00000000-0000-4000-8000-0000000000d0";
    const msg: WorkspaceRawMessage = {
      id: "00000000-0000-4000-8000-000000000001",
      sender_id: 10,
      content: "test",
      timestamp: 1000,
      type: "stream",
      stream_uuid: "00000000-0000-4000-8000-000000000005",
      display_recipient: "chan",
      subject: "",
      topic_uuid: topicUuid,
    };

    const ctx = contextFromMessage(msg, null);
    expect(ctx).not.toBeNull();
    if (ctx?.type === "stream") {
      expect(ctx.topic).toBe(topicUuid);
      expect(ctx.topicUuid).toBe(topicUuid);
    }
  });

  // Private messages produce a DM context with a sorted participant key.
  it("creates DM context from a private message", () => {
    const msg: WorkspaceRawMessage = {
      id: "00000000-0000-4000-8000-000000000002",
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

  // Unknown message types (e.g. future Workspace extensions) must return null safely.
  it("returns null for a message with no valid type", () => {
    const msg: WorkspaceRawMessage = {
      id: "00000000-0000-4000-8000-000000000003",
      sender_id: 10,
      content: "?",
      timestamp: 1000,
      type: "unknown",
    };

    expect(contextFromMessage(msg, null)).toBeNull();
  });

  // Malformed stream messages (null stream_id) must be safely rejected.
  it("returns null for stream message with null stream_id", () => {
    const msg: WorkspaceRawMessage = {
      id: "00000000-0000-4000-8000-000000000004",
      sender_id: 10,
      content: "?",
      timestamp: 1000,
      type: "stream",
      stream_uuid: null,
    };

    expect(contextFromMessage(msg, null)).toBeNull();
  });
});
