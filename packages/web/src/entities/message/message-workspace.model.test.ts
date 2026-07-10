import { beforeEach, describe, expect, it } from "vitest";
import {
  conversationIdForStream,
  conversationIdForTopic,
} from "~/entities/messenger/messenger-ids.lib";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import {
  selectWorkspaceMessagesForConversation,
  selectWorkspaceMessageStatusForConversation,
  useWorkspaceMessageStore,
} from "./message.model";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const AUTHOR_UUID = "11111111-1111-4111-8111-111111111111";
const USER_UUID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_A = "10000000-0000-4000-8000-000000000001";
const MESSAGE_B = "10000000-0000-4000-8000-000000000002";
const MESSAGE_C = "10000000-0000-4000-8000-000000000003";
const MESSAGE_D = "10000000-0000-4000-8000-000000000004";
const MESSAGE_E = "10000000-0000-4000-8000-000000000005";
const REACTION_A = "20000000-0000-4000-8000-000000000001";
const REACTION_B = "20000000-0000-4000-8000-000000000002";
const DATE = "2026-06-22T10:10:00Z";
const DATE_LATER = "2026-06-22T10:20:00Z";
const DATE_EARLIER = "2026-06-22T10:00:00Z";

const TOPIC_CONVERSATION_ID = conversationIdForTopic(STREAM_UUID, TOPIC_UUID);
const STREAM_CONVERSATION_ID = conversationIdForStream(STREAM_UUID);

type MessageOverrides = Omit<Partial<MessengerMessage>, "payload"> & {
  markdown?: string;
  payload?: MessengerMessage["payload"];
};

function createMessage(overrides: MessageOverrides & { uuid: MessengerUuid }): MessengerMessage {
  const { uuid, markdown, payload, ...rest } = overrides;
  return {
    uuid,
    conversationId: TOPIC_CONVERSATION_ID,
    projectId: PROJECT_UUID,
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: AUTHOR_UUID,
    userUuid: USER_UUID,
    payload: payload ?? { kind: "markdown", content: markdown ?? "message" },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: DATE,
    updatedAt: DATE,
    ...rest,
  };
}

function selectMessages(conversationId: MessengerConversationId): MessengerMessage[] {
  return selectWorkspaceMessagesForConversation(
    useWorkspaceMessageStore.getState(),
    conversationId,
  );
}

describe("workspace message store", () => {
  beforeEach(() => {
    useWorkspaceMessageStore.getState().clear();
  });

  it("keeps conversation ids sorted by createdAt and then uuid", () => {
    useWorkspaceMessageStore
      .getState()
      .mergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [
        createMessage({ uuid: MESSAGE_B, createdAt: DATE, markdown: "b" }),
        createMessage({ uuid: MESSAGE_A, createdAt: DATE, markdown: "a" }),
        createMessage({ uuid: MESSAGE_C, createdAt: DATE_EARLIER, markdown: "c" }),
      ]);

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_C,
      MESSAGE_A,
      MESSAGE_B,
    ]);
  });

  it("marks loaded messages in the same topic read through an anchor", () => {
    const earlier = createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER });
    const anchor = createMessage({ uuid: MESSAGE_B, createdAt: DATE });
    const later = createMessage({ uuid: MESSAGE_C, createdAt: DATE_LATER });

    useWorkspaceMessageStore
      .getState()
      .mergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [earlier, anchor, later]);

    const changed = useWorkspaceMessageStore.getState().markMessagesReadUpTo(MESSAGE_B, {
      conversationIds: [TOPIC_CONVERSATION_ID],
    });

    expect(changed.map((message) => message.uuid)).toEqual([MESSAGE_A, MESSAGE_B]);
    expect(selectMessages(TOPIC_CONVERSATION_ID)).toEqual([
      expect.objectContaining({ uuid: MESSAGE_A, read: true }),
      expect.objectContaining({ uuid: MESSAGE_B, read: true }),
      expect.objectContaining({ uuid: MESSAGE_C, read: false }),
    ]);
  });

  it("deduplicates by uuid and stores the latest body", () => {
    useWorkspaceMessageStore
      .getState()
      .mergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [
        createMessage({ uuid: MESSAGE_A, markdown: "first" }),
        createMessage({ uuid: MESSAGE_A, markdown: "second" }),
      ]);

    const messages = selectMessages(TOPIC_CONVERSATION_ID);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.payload.content).toBe("second");
  });

  it("reindexes a duplicate message when createdAt changes", () => {
    useWorkspaceMessageStore
      .getState()
      .mergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [
        createMessage({ uuid: MESSAGE_A, createdAt: DATE_LATER }),
        createMessage({ uuid: MESSAGE_B, createdAt: DATE }),
      ]);

    useWorkspaceMessageStore
      .getState()
      .upsertMessage(createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER }));

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
      MESSAGE_B,
    ]);
  });

  it("does not drop a live message when an initial page arrives later", () => {
    useWorkspaceMessageStore
      .getState()
      .upsertMessage(createMessage({ uuid: MESSAGE_B, createdAt: DATE_LATER, markdown: "live" }));

    useWorkspaceMessageStore
      .getState()
      .replaceOrMergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [
        createMessage({ uuid: MESSAGE_A, createdAt: DATE, markdown: "initial" }),
      ]);

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.payload.content)).toEqual(
      ["initial", "live"],
    );
  });

  it("strictly replaces a conversation window without keeping old message ids", () => {
    const store = useWorkspaceMessageStore.getState();
    store.mergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [
      createMessage({ uuid: MESSAGE_A, createdAt: DATE, markdown: "old-a" }),
      createMessage({ uuid: MESSAGE_B, createdAt: DATE_LATER, markdown: "old-b" }),
    ]);

    store.replaceConversationMessagesWindow(TOPIC_CONVERSATION_ID, [
      createMessage({ uuid: MESSAGE_E, createdAt: DATE_LATER, markdown: "new-e" }),
      createMessage({ uuid: MESSAGE_D, createdAt: DATE_EARLIER, markdown: "new-d" }),
    ]);

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_D,
      MESSAGE_E,
    ]);
  });

  it("preserves own reaction projection when a fresh message snapshot arrives", () => {
    const store = useWorkspaceMessageStore.getState();
    store.upsertMessage(
      createMessage({
        uuid: MESSAGE_A,
        reactions: { thumbs_up: 1 },
        ownReactionUuidsByEmojiName: { thumbs_up: REACTION_A },
      }),
    );

    store.upsertMessage(
      createMessage({
        uuid: MESSAGE_A,
        markdown: "fresh snapshot",
        reactions: { thumbs_up: 2, eyes: 1 },
        ownReactionUuidsByEmojiName: {},
      }),
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        payload: { kind: "markdown", content: "fresh snapshot" },
        reactions: { thumbs_up: 2, eyes: 1 },
        ownReactionUuidsByEmojiName: { thumbs_up: REACTION_A },
      }),
    );
  });

  it("preserves own reaction projection when replacing a conversation window", () => {
    const store = useWorkspaceMessageStore.getState();
    store.upsertMessage(
      createMessage({
        uuid: MESSAGE_A,
        reactions: { thumbs_up: 1 },
        ownReactionUuidsByEmojiName: { thumbs_up: REACTION_A },
      }),
    );

    store.replaceConversationMessagesWindow(TOPIC_CONVERSATION_ID, [
      createMessage({
        uuid: MESSAGE_A,
        markdown: "window snapshot",
        reactions: { thumbs_up: 2 },
        ownReactionUuidsByEmojiName: {},
      }),
      createMessage({ uuid: MESSAGE_B }),
    ]);

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        payload: { kind: "markdown", content: "window snapshot" },
        reactions: { thumbs_up: 2 },
        ownReactionUuidsByEmojiName: { thumbs_up: REACTION_A },
      }),
    );
  });

  it("applies own reaction projection actions and aggregate patches", () => {
    const store = useWorkspaceMessageStore.getState();
    store.upsertMessage(createMessage({ uuid: MESSAGE_A }));

    store.applyOwnMessageReactions(MESSAGE_A, [
      { emojiName: "thumbs_up", reactionUuid: REACTION_A },
      { emojiName: "eyes", reactionUuid: REACTION_B },
    ]);
    store.setOwnMessageReaction(MESSAGE_A, "heart", REACTION_A);
    store.removeOwnMessageReaction(MESSAGE_A, "eyes");
    store.applyMessageReactionAggregate(MESSAGE_A, { thumbs_up: 3, heart: 1 });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        reactions: { thumbs_up: 3, heart: 1 },
        ownReactionUuidsByEmojiName: {
          thumbs_up: REACTION_A,
          heart: REACTION_A,
        },
      }),
    );
  });

  it("indexes one message into topic and stream buckets when requested", () => {
    useWorkspaceMessageStore
      .getState()
      .indexMessageIntoConversationBuckets(createMessage({ uuid: MESSAGE_A }), {
        includeStreamConversation: true,
      });

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
    expect(selectMessages(STREAM_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
  });

  it("keeps stable selector fallback references", () => {
    const firstMessages = selectWorkspaceMessagesForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );
    const secondMessages = selectWorkspaceMessagesForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );
    const firstStatus = selectWorkspaceMessageStatusForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );
    const secondStatus = selectWorkspaceMessageStatusForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );

    expect(secondMessages).toBe(firstMessages);
    expect(secondStatus).toBe(firstStatus);
  });

  it("stores before and after window markers without changing forward pagination", () => {
    const store = useWorkspaceMessageStore.getState();
    store.setConversationPagination(TOPIC_CONVERSATION_ID, {
      nextPageMarker: "next-1",
      hasMore: true,
    });

    store.setConversationWindowMarkers(TOPIC_CONVERSATION_ID, {
      beforePageMarker: "before-1",
      afterPageMarker: "after-1",
    });

    const state = useWorkspaceMessageStore.getState();
    expect(state.beforePageMarkerByConversationId[TOPIC_CONVERSATION_ID]).toBe("before-1");
    expect(state.afterPageMarkerByConversationId[TOPIC_CONVERSATION_ID]).toBe("after-1");
    expect(state.nextPageMarkerByConversationId[TOPIC_CONVERSATION_ID]).toBe("next-1");
    expect(state.hasMoreByConversationId[TOPIC_CONVERSATION_ID]).toBe(true);
  });

  it("clears before and after window markers with the existing store reset", () => {
    useWorkspaceMessageStore.getState().setConversationWindowMarkers(TOPIC_CONVERSATION_ID, {
      beforePageMarker: "before-1",
      afterPageMarker: "after-1",
    });

    useWorkspaceMessageStore.getState().clear();

    const state = useWorkspaceMessageStore.getState();
    expect(state.beforePageMarkerByConversationId[TOPIC_CONVERSATION_ID] ?? null).toBeNull();
    expect(state.afterPageMarkerByConversationId[TOPIC_CONVERSATION_ID] ?? null).toBeNull();
  });
});
